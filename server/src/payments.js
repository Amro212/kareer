import Stripe from 'stripe';
import { fail, digest, ApiError } from './policy.js';
import { grant, balances, revokePayment, restorePayment } from './ledger.js';
import { OFFERS } from './offers.js';
import { SITE_ORIGIN } from '../../src/core/endpoints.js';

export const STRIPE_API_VERSION = '2026-09-30.endive';
const MINUTE = 60000, HOUR = 60 * MINUTE;
// The plans page accepts a choice for one hour. Stripe Checkout then stays open until two hours
// after "View plans" (always 60+ minutes, inside Stripe's 30 min to 24 h range). The extension
// can claim for 24 hours, so closing Settings for a while never loses a paid purchase.
export const SELECT_WINDOW = HOUR, SESSION_EXPIRY = 2 * HOUR, CLAIM_WINDOW = 24 * HOUR;
const CHECK_INTERVAL = 15000;

export function stripeClient(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 1, timeout: 15000 });
}
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
const idOf = value => typeof value === 'string' ? value : value?.id ?? null;
const live = env => /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '');
const priceOf = env => ({ monthly: env.STRIPE_PRICE_MONTHLY, pack: env.STRIPE_PRICE_PACK });
const offerForPrice = (env, price) => Object.entries(priceOf(env)).find(([, id]) => id && id === price)?.[0] || null;
const checkoutUrl = url => /^https:\/\/checkout\.stripe\.com\//.test(url || '') ? url : fail('BILLING_UNAVAILABLE', 503);
const invalid = () => fail('INVALID_PURCHASE', 422);

// Wallets are keyed by Stripe customer. A purchase started from an activated key already names
// its wallet and reuses that customer; a first purchase gets a new wallet for the new customer.
async function walletFor(db, customer, purchaseId) {
  if (!customer) invalid();
  const purchase = purchaseId ? await q(db, 'SELECT wallet_id FROM purchases WHERE id=?', purchaseId).first() : null;
  const [, found] = await db.batch([
    q(db, 'INSERT OR IGNORE INTO wallets(id,customer_id) VALUES (?,?)', purchase?.wallet_id || crypto.randomUUID(), customer),
    q(db, 'SELECT id FROM wallets WHERE customer_id=?', customer),
  ]);
  const wallet = found.results[0]?.id;
  if (!wallet) invalid();
  if (purchase) await q(db, 'UPDATE purchases SET wallet_id=? WHERE id=? AND wallet_id IS NULL', wallet, purchaseId).run();
  return wallet;
}
async function boundWallet(db, customer, purchaseId) {
  const known = customer && await q(db, 'SELECT id FROM wallets WHERE customer_id=?', customer).first();
  if (known) return known.id;
  if (purchaseId && await q(db, 'SELECT 1 FROM purchases WHERE id=?', purchaseId).first()) return walletFor(db, customer, purchaseId);
  // Not yet linked to a Kareer purchase: Stripe retries, and checkout completion links it.
  fail('UNBOUND_PURCHASE', 409);
}

function verifySession(env, s) {
  const items = s.line_items?.data || [];
  const offer = offerForPrice(env, idOf(items[0]?.price));
  if (!offer || items.length !== 1 || s.livemode !== live(env) || s.currency !== 'usd' || s.metadata?.offer !== offer
    || s.mode !== (offer === 'monthly' ? 'subscription' : 'payment') || items[0].quantity !== 1
    || items[0].amount_subtotal !== OFFERS[offer].cents || s.amount_subtotal !== OFFERS[offer].cents || s.total_details?.amount_discount) invalid();
  return offer;
}
function verifyInvoice(env, invoice) {
  const lines = invoice.lines?.data || [];
  const line = lines[0];
  const price = idOf(line?.pricing?.price_details?.price) || idOf(line?.price);
  if (lines.length !== 1 || invoice.livemode !== live(env) || invoice.currency !== 'usd' || offerForPrice(env, price) !== 'monthly'
    || line.quantity !== 1 || line.amount !== OFFERS.monthly.cents || invoice.subtotal !== OFFERS.monthly.cents
    || (invoice.total_discount_amounts || []).some(d => d.amount > 0) || !line.period?.end) invalid();
  return line;
}
function verifySubscription(env, sub) {
  const items = sub.items?.data || [];
  if (items.length !== 1 || sub.livemode !== live(env) || offerForPrice(env, idOf(items[0].price)) !== 'monthly' || items[0].quantity !== 1) invalid();
  return items[0];
}

async function paymentRef(stripe, invoice) {
  // Recent API versions link invoices to PaymentIntents only through invoice payments.
  const { data } = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 });
  return idOf(data.find(p => p.status === 'paid' && p.payment?.payment_intent)?.payment.payment_intent) || `invoice:${invoice.id}`;
}

async function grantInvoice(db, env, stripe, invoice, wallet, now) {
  if (!['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason) || invoice.status !== 'paid') return;
  const line = verifyInvoice(env, invoice);
  await grant(db, { id: `invoice:${invoice.id}`, wallet, credits: OFFERS.monthly.credits, kind: 'monthly', payment: await paymentRef(stripe, invoice),
    subscription: idOf(invoice.parent?.subscription_details?.subscription), starts: line.period.start * 1000, expires: line.period.end * 1000, now });
}

async function saveSubscription(db, env, sub, wallet, updatedAt) {
  const item = verifySubscription(env, sub);
  const end = item.current_period_end ?? sub.current_period_end;
  await q(db, `INSERT INTO subscriptions(id,wallet_id,status,cancel_at_period_end,period_end,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,period_end=excluded.period_end,updated_at=excluded.updated_at
    WHERE excluded.updated_at>=subscriptions.updated_at`, sub.id, wallet, String(sub.status), sub.cancel_at_period_end || sub.cancel_at ? 1 : 0, end ? end * 1000 : null, updatedAt).run();
}

/** Retrieves the session from Stripe and applies it; shared by the webhook and the claim fallback. */
export async function fulfilSession(db, env, stripe, sessionId, now = Date.now()) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items', 'subscription', 'invoice'] });
  const purchaseId = s.client_reference_id || null;
  if (s.status === 'expired') {
    if (purchaseId) await q(db, "UPDATE purchases SET status='expired' WHERE id=? AND status='pending'", purchaseId).run();
    return null;
  }
  if (s.status !== 'complete' || s.payment_status !== 'paid') return null;
  const offer = verifySession(env, s);
  const purchase = purchaseId ? await q(db, 'SELECT offer,session_id FROM purchases WHERE id=?', purchaseId).first() : null;
  if (purchase && (purchase.offer !== offer || purchase.session_id !== s.id)) invalid();
  const wallet = await walletFor(db, idOf(s.customer), purchase ? purchaseId : null);
  if (offer === 'pack') {
    const payment = idOf(s.payment_intent) || invalid();
    await grant(db, { id: `pack:${payment}`, wallet, credits: OFFERS.pack.credits, kind: 'pack', payment, now });
  } else {
    const sub = typeof s.subscription === 'object' ? s.subscription : await stripe.subscriptions.retrieve(idOf(s.subscription));
    await saveSubscription(db, env, sub, wallet, now);
    const invoice = typeof s.invoice === 'object' && s.invoice ? s.invoice : await stripe.invoices.retrieve(idOf(s.invoice || sub.latest_invoice));
    await grantInvoice(db, env, stripe, invoice, wallet, now);
  }
  if (purchase) await q(db, "UPDATE purchases SET status='fulfilled' WHERE id=? AND status='pending'", purchaseId).run();
  return wallet;
}

export async function webhook(db, env, stripe, raw, signature, now = Date.now()) {
  let event;
  try { event = await stripe.webhooks.constructEventAsync(raw, signature || '', env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider); }
  catch { fail('INVALID_SIGNATURE', 400); }
  if (event.livemode !== live(env)) invalid();
  if (await q(db, 'SELECT 1 FROM webhook_events WHERE id=?', event.id).first()) return { duplicate: true };
  const object = event.data.object, at = event.created * 1000;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.expired':
      await fulfilSession(db, env, stripe, object.id, now);
      break;
    case 'invoice.paid':
      if (['subscription_create', 'subscription_cycle'].includes(object.billing_reason)) {
        verifyInvoice(env, object);
        const wallet = await boundWallet(db, idOf(object.customer), object.parent?.subscription_details?.metadata?.kareer_purchase);
        await grantInvoice(db, env, stripe, object, wallet, now);
      }
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      verifySubscription(env, object);
      await saveSubscription(db, env, object, await boundWallet(db, idOf(object.customer), object.metadata?.kareer_purchase), at);
      break;
    case 'charge.refunded':
      if (idOf(object.payment_intent)) await revokePayment(db, idOf(object.payment_intent), 'refund');
      break;
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const payment = idOf(object.payment_intent);
      if (!payment) break;
      // Revoke while a dispute is open or lost; restore only when it closes in the seller's favour.
      const closed = s => ['won', 'lost', 'warning_closed'].includes(s);
      const previous = await q(db, 'SELECT status FROM disputes WHERE id=?', object.id).first();
      if (previous && closed(previous.status)) break;
      const owner = await q(db, 'SELECT wallet_id FROM grants WHERE payment_ref=? LIMIT 1', payment).first();
      await q(db, `INSERT INTO disputes(id,payment_ref,wallet_id,status) VALUES (?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status`, object.id, payment, owner?.wallet_id || null, String(object.status)).run();
      if (!closed(object.status) || object.status === 'lost') await revokePayment(db, payment, 'dispute');
      else await restorePayment(db, payment, 'dispute');
      if (owner) await q(db, "UPDATE wallets SET flagged=EXISTS(SELECT 1 FROM disputes WHERE wallet_id=wallets.id AND status NOT IN ('won','warning_closed')) WHERE id=?", owner.wallet_id).run();
      break;
    }
    default: break; // invoice.payment_failed: nothing is granted; customer.subscription.updated carries past_due.
  }
  await q(db, 'INSERT OR IGNORE INTO webhook_events(id,type,created_at) VALUES (?,?,?)', event.id, event.type, now).run();
  return { duplicate: false };
}

export async function authenticate(db, key, code = 'ACTIVATION_NEEDED') {
  if (typeof key !== 'string' || key.length < 8 || key.length > 256) fail(code, 401);
  const hash = await digest(key);
  const row = await q(db, 'SELECT wallet_id FROM credentials WHERE hash=? AND disabled=0', hash).first();
  if (!row) fail(code, 401);
  return { wallet: row.wallet_id, hash };
}

export async function status(db, wallet, now = Date.now()) {
  const credits = await balances(db, wallet, now);
  const { results } = await q(db, 'SELECT status,cancel_at_period_end,period_end FROM subscriptions WHERE wallet_id=? ORDER BY period_end DESC', wallet).all();
  const flagged = Boolean((await q(db, 'SELECT flagged FROM wallets WHERE id=?', wallet).first())?.flagged);
  return { state: credits.total ? 'ready' : 'outOfCredits', ...credits, flagged,
    subscriptions: results.map(s => ({ status: s.status, cancelAtPeriodEnd: Boolean(s.cancel_at_period_end), periodEnd: s.period_end ? new Date(s.period_end).toISOString() : null })) };
}

export async function billingPortal(db, env, stripe, wallet) {
  const row = await q(db, 'SELECT customer_id FROM wallets WHERE id=?', wallet).first();
  if (!row?.customer_id) fail('NO_BILLING', 404);
  const session = await stripe.billingPortal.sessions.create({ customer: row.customer_id, return_url: `${SITE_ORIGIN}/`,
    ...(env.STRIPE_PORTAL_CONFIGURATION ? { configuration: env.STRIPE_PORTAL_CONFIGURATION } : {}) });
  if (!/^https:\/\/billing\.stripe\.com\//.test(session.url || '')) fail('BILLING_UNAVAILABLE', 503);
  return { url: session.url };
}

async function validateOffer(db, offer, wallet) {
  if (!Object.hasOwn(OFFERS, offer)) fail('INVALID_OFFER');
  if (wallet && offer === 'monthly') {
    const active = await q(db, "SELECT id FROM subscriptions WHERE wallet_id=? AND status NOT IN ('canceled','incomplete_expired')", wallet).first();
    if (active) fail('SUBSCRIPTION_EXISTS', 409);
  }
}

export async function startPurchase(db, wallet = null, now = Date.now()) {
  if (wallet && (await q(db, 'SELECT flagged FROM wallets WHERE id=?', wallet).first())?.flagged) fail('WALLET_FLAGGED', 403);
  const id = crypto.randomUUID(), secret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await q(db, 'INSERT INTO purchases(id,secret_hash,wallet_id,created_at,expires_at) VALUES (?,?,?,?,?)', id, await digest(secret), wallet, now, now + CLAIM_WINDOW).run();
  return { id, claimSecret: secret, expiresAt: new Date(now + CLAIM_WINDOW).toISOString() };
}

export async function purchaseSession(db, id, now = Date.now()) {
  const row = await q(db, "SELECT * FROM purchases WHERE id=? AND claimed_at IS NULL AND status IN ('open','creating','pending') AND created_at>?", id, now - SELECT_WINDOW).first();
  if (!row) fail('CLAIM_UNAVAILABLE', 410);
  return row;
}

export async function selectPurchase(db, env, stripe, id, offer, origin, now = Date.now()) {
  const row = await purchaseSession(db, id, now);
  await validateOffer(db, offer, row.wallet_id);
  if (row.session_id) {
    if (row.offer !== offer) fail('INVALID_OFFER', 409);
    const existing = await stripe.checkout.sessions.retrieve(row.session_id);
    if (existing.status !== 'open') fail('CLAIM_UNAVAILABLE', 410);
    return checkoutUrl(existing.url);
  }
  const locked = await q(db, "UPDATE purchases SET offer=?,status='creating' WHERE id=? AND status='open'", offer, id).run();
  if (!locked.meta.changes) fail('BUSY', 409);
  try {
    const customer = row.wallet_id ? (await q(db, 'SELECT customer_id FROM wallets WHERE id=?', row.wallet_id).first())?.customer_id : null;
    const monthly = offer === 'monthly', metadata = { kareer_purchase: id };
    // Every parameter is derived from the purchase row, so a retry after a lost response reuses the same session.
    const session = await stripe.checkout.sessions.create({
      mode: monthly ? 'subscription' : 'payment', line_items: [{ price: priceOf(env)[offer], quantity: 1 }],
      client_reference_id: id, metadata: { ...metadata, offer }, automatic_tax: { enabled: true },
      payment_method_types: ['card', 'link'], adaptive_pricing: { enabled: false },
      expires_at: Math.floor((row.created_at + SESSION_EXPIRY) / 1000),
      success_url: `${SITE_ORIGIN}/setup/?purchase=complete`, cancel_url: `${origin}/plans/${id}`,
      ...(customer ? { customer, customer_update: { address: 'auto', name: 'auto' } } : monthly ? {} : { customer_creation: 'always' }),
      ...(monthly ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    }, { idempotencyKey: `kareer-purchase:${id}:${offer}` });
    const url = checkoutUrl(session.url);
    await q(db, "UPDATE purchases SET session_id=?,status='pending' WHERE id=?", session.id, id).run();
    return url;
  } catch (error) {
    await q(db, "UPDATE purchases SET offer=NULL,status='open' WHERE id=? AND status='creating'", id).run();
    throw error;
  }
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `kr_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/**
 * The extension polls with its private claim secret. Once the purchase is paid, the first
 * successful claim mints the key and returns it once; Kareer never emails or stores it.
 * If the webhook is late, the claim retrieves the Checkout Session from Stripe itself.
 */
export async function claimPurchase(db, env, stripe, id, secret, now = Date.now()) {
  const row = await q(db, 'SELECT * FROM purchases WHERE id=? AND secret_hash=?', id, await digest(secret)).first();
  if (!row || row.claimed_at || row.expires_at <= now || row.status === 'expired'
    || (['open', 'creating'].includes(row.status) && row.created_at <= now - SELECT_WINDOW)) fail('CLAIM_UNAVAILABLE', 410);
  if (row.status === 'pending' && row.session_id) {
    const due = await q(db, 'UPDATE purchases SET checked_at=? WHERE id=? AND checked_at<=?', now, id, now - CHECK_INTERVAL).run();
    if (due.meta.changes) {
      try { await fulfilSession(db, env, stripe, row.session_id, now); }
      catch (error) { if (error instanceof ApiError) throw error; fail('BILLING_UNAVAILABLE', 503); }
    }
  }
  const key = newKey(), hash = await digest(key);
  const [minted] = await db.batch([
    q(db, "UPDATE purchases SET claimed_at=?,key_hash=? WHERE id=? AND status='fulfilled' AND claimed_at IS NULL AND wallet_id IS NOT NULL", now, hash, id),
    q(db, 'INSERT INTO credentials(hash,wallet_id,created_at) SELECT key_hash,wallet_id,? FROM purchases WHERE id=? AND key_hash=?', now, id, hash),
  ]);
  if (minted.meta.changes) {
    const { wallet_id: wallet } = await q(db, 'SELECT wallet_id FROM purchases WHERE id=?', id).first();
    return { status: 'complete', licenseKey: key, aiStatus: await status(db, wallet, now) };
  }
  const current = await q(db, 'SELECT status,claimed_at FROM purchases WHERE id=?', id).first();
  if (current.claimed_at || current.status === 'expired') fail('CLAIM_UNAVAILABLE', 410);
  return { status: 'pending' };
}
