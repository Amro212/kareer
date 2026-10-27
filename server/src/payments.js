import { fail, digest } from './policy.js';
import { grant, balances } from './ledger.js';
import { OFFERS, CHARGING_TERMS } from './offers.js';

const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
const attrs = r => r?.attributes || {};
const offerFor = (env, variant) => String(variant) === env.LS_MONTHLY_VARIANT ? 'monthly' : String(variant) === env.LS_PACK_VARIANT ? 'pack' : null;
function verify(env, record) {
  const a = attrs(record);
  if (String(a.store_id) !== String(env.LS_STORE_ID) || a.test_mode !== (env.LS_TEST_MODE === 'true')) fail('INVALID_PURCHASE', 403);
  return a;
}

export function lemon(env, fetcher = fetch) {
  async function call(path, init = {}) {
    const response = await fetcher(`https://api.lemonsqueezy.com/v1/${path}`, {
      ...init, headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: `Bearer ${env.LS_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) fail('BILLING_UNAVAILABLE', 503);
    return response.json();
  }
  return {
    get: async path => (await call(path)).data,
    create: async data => (await call('checkouts', { method: 'POST', body: JSON.stringify({ data }) })).data,
    async list(type, filters) {
      const all = [];
      for (let page = 1; page <= 100; page++) {
        const params = new URLSearchParams({ 'page[size]': '100', 'page[number]': String(page) });
        for (const [k, v] of Object.entries(filters)) params.set(`filter[${k}]`, v);
        const result = await call(`${type}?${params}`);
        all.push(...result.data);
        if (!result.links?.next) return all;
      }
      fail('BILLING_UNAVAILABLE', 503);
    },
    async validate(key) {
      const response = await fetcher('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ license_key: key }), signal: AbortSignal.timeout(15000),
      });
      // Expired subscription keys may be invalid in the native API but still identify a purchased wallet.
      if (!response.ok) fail('INVALID_KEY', 401);
      return response.json();
    },
  };
}

export async function reconcileOrder(db, env, provider, orderId, checkout = null, now = Date.now()) {
  const order = await provider.get(`orders/${orderId}`), a = verify(env, order);
  const offer = offerFor(env, a.first_order_item?.variant_id);
  if (!offer || !a.first_order_item?.id) fail('INVALID_PURCHASE', 403);
  const item = attrs(await provider.get(`order-items/${a.first_order_item.id}`));
  if (String(item.order_id) !== String(order.id) || String(item.variant_id) !== String(a.first_order_item.variant_id) || item.quantity !== 1
    || a.subtotal_usd !== OFFERS[offer].cents || a.discount_total_usd !== 0) fail('INVALID_PURCHASE', 403);
  if (checkout && (checkout.offer !== offer || (checkout.order_id && checkout.order_id !== String(order.id)))) fail('INVALID_PURCHASE', 403);
  const existing = await q(db, 'SELECT * FROM payments WHERE order_id=?', String(order.id)).first();
  const customerWallet = await q(db, 'SELECT id FROM wallets WHERE customer_id=?', String(a.customer_id)).first();
  const candidate = existing?.wallet_id || checkout?.wallet_id || customerWallet?.id || crypto.randomUUID();
  const linked = await db.batch([
    q(db, 'INSERT OR IGNORE INTO wallets(id,customer_id) VALUES (?,?)', candidate, String(a.customer_id)),
    q(db, `INSERT OR IGNORE INTO payments(order_id,wallet_id,customer_id,offer)
      SELECT ?,COALESCE(?,(SELECT id FROM wallets WHERE customer_id=?)),?,?`, String(order.id), checkout?.wallet_id || null, String(a.customer_id), String(a.customer_id), offer),
    q(db, 'SELECT wallet_id FROM payments WHERE order_id=?', String(order.id)),
  ]);
  const wallet = linked[2].results[0].wallet_id;
  if (checkout) {
    await q(db, 'UPDATE checkouts SET order_id=? WHERE id=? AND (order_id IS NULL OR order_id=?)', String(order.id), checkout.id, String(order.id)).run();
  }
  if (a.status === 'paid' && !a.refunded && !existing?.revoked && offer === 'pack') {
    await grant(db, { id: `order:${order.id}`, wallet, credits: OFFERS.pack.credits, kind: 'pack', order: String(order.id), now });
  } else if (a.refunded || ['refunded', 'partial_refund'].includes(a.status)) {
    await db.batch([q(db, 'UPDATE payments SET revoked=1 WHERE order_id=?', String(order.id)), q(db, 'UPDATE grants SET revoked=1 WHERE order_id=?', String(order.id))]);
  }
  return wallet;
}

function nextAnchor(invoiceDate, subscription) {
  const date = new Date(invoiceDate), origin = new Date(subscription.created_at);
  if (!Number.isFinite(+date) || !Number.isFinite(+origin)) fail('BILLING_UNAVAILABLE', 503);
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
  const day = Math.min(subscription.billing_anchor || origin.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return Date.UTC(year, month, day, origin.getUTCHours(), origin.getUTCMinutes(), origin.getUTCSeconds());
}

export async function reconcileSubscription(db, env, provider, id, wallet, now = Date.now()) {
  // Always retrieve current state; the webhook payload may be an older retry.
  const subscription = await provider.get(`subscriptions/${id}`), a = verify(env, subscription);
  if (offerFor(env, a.variant_id) !== 'monthly') fail('INVALID_PURCHASE', 403);
  const paidWallet = await reconcileOrder(db, env, provider, a.order_id, null, now);
  if (wallet && wallet !== paidWallet) fail('INVALID_PURCHASE', 403);
  wallet = paidWallet;
  const invoices = await provider.list('subscription-invoices', { subscription_id: String(id), store_id: env.LS_STORE_ID });
  const payment = await q(db, 'SELECT revoked FROM payments WHERE order_id=?', String(a.order_id)).first();
  const sorted = invoices.sort((x, y) => Date.parse(attrs(x).created_at) - Date.parse(attrs(y).created_at));
  for (let i = 0; i < sorted.length; i++) {
    const invoice = sorted[i], b = verify(env, invoice);
    if (String(b.subscription_id) !== String(id) || String(b.customer_id) !== String(a.customer_id)) fail('INVALID_PURCHASE', 403);
    if (!['initial', 'renewal'].includes(b.billing_reason)) continue;
    if (b.status !== 'paid' || b.refunded || payment.revoked) {
      if (b.refunded || ['refunded', 'partial_refund'].includes(b.status)) await db.batch([
        q(db, 'INSERT OR IGNORE INTO revocations(id) VALUES (?)', `invoice:${invoice.id}`),
        q(db, 'UPDATE grants SET revoked=1 WHERE id=?', `invoice:${invoice.id}`),
      ]);
      continue;
    }
    if (b.subtotal_usd !== OFFERS.monthly.cents || b.discount_total_usd !== 0) fail('INVALID_PURCHASE', 403);
    const start = Date.parse(b.created_at);
    let end = nextAnchor(b.created_at, a);
    // Only a paid, current cycle can use the provider's current boundary. A retry date is never an allowance.
    if (i === sorted.length - 1 && ['active', 'cancelled'].includes(a.status)) {
      const providerEnd = Date.parse(a.ends_at || a.renews_at);
      if (providerEnd > start && providerEnd <= end + 3 * 86400000) end = providerEnd;
    }
    await grant(db, { id: `invoice:${invoice.id}`, wallet, credits: OFFERS.monthly.credits, kind: 'monthly', starts: start,
      expires: end, subscription: String(id), order: String(a.order_id), now });
  }
  const end = Date.parse(a.ends_at || (a.status === 'active' ? a.renews_at : ''));
  await q(db, `INSERT INTO subscriptions(id,wallet_id,order_id,status,period_end,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,period_end=excluded.period_end,updated_at=excluded.updated_at
    WHERE excluded.updated_at>=subscriptions.updated_at`, String(id), wallet, String(a.order_id), a.status, Number.isFinite(end) ? end : null, Date.parse(a.updated_at) || now).run();
  return wallet;
}

export async function activate(db, env, provider, key, now = Date.now()) {
  if (typeof key !== 'string' || key.length < 8 || key.length > 256) fail('INVALID_KEY', 401);
  const hash = await digest(key);
  const known = await q(db, 'SELECT * FROM credentials WHERE hash=?', hash).first();
  const identified = known ? { license_key: { id: known.license_id } } : await provider.validate(key);
  const id = identified?.license_key?.id;
  if (!id || !/^\d+$/.test(String(id))) fail('INVALID_KEY', 401);
  const license = await provider.get(`license-keys/${id}`), a = verify(env, license);
  if (await digest(a.key || '') !== hash) fail('INVALID_KEY', 401);
  const wallet = await reconcileOrder(db, env, provider, a.order_id, null, now);
  await q(db, `INSERT INTO credentials(hash,wallet_id,license_id,order_id,disabled,checked_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(hash) DO UPDATE SET disabled=excluded.disabled,checked_at=excluded.checked_at
    WHERE excluded.checked_at>=credentials.checked_at`, hash, wallet, String(id), String(a.order_id), a.disabled ? 1 : 0, now).run();
  const credential = await q(db, 'SELECT disabled FROM credentials WHERE hash=?', hash).first();
  if (credential.disabled) {
    await db.batch([q(db, 'UPDATE payments SET revoked=1 WHERE order_id=?', String(a.order_id)), q(db, 'UPDATE grants SET revoked=1 WHERE order_id=?', String(a.order_id))]);
    fail('KEY_DISABLED', 403);
  }
  // Recover orders/renewals even when no webhook arrived. No raw customer records are saved.
  const { results: customers } = await q(db, 'SELECT DISTINCT customer_id FROM payments WHERE wallet_id=?', wallet).all();
  for (const customer of customers) {
    const subscriptions = await provider.list('subscriptions', { store_id: env.LS_STORE_ID, customer_id: customer.customer_id });
    for (const sub of subscriptions) {
      if (offerFor(env, attrs(sub).variant_id) === 'monthly') await reconcileSubscription(db, env, provider, sub.id, null, now);
    }
  }
  return { wallet, hash };
}

export async function authenticate(db, env, provider, key, now = Date.now(), refresh = false) {
  const hash = await digest(key);
  const row = await q(db, 'SELECT * FROM credentials WHERE hash=?', hash).first();
  if (!row || row.disabled) fail('ACTIVATION_NEEDED', 401);
  if (refresh || row.checked_at < now - 60000) return activate(db, env, provider, key, now);
  return { wallet: row.wallet_id, hash };
}

export async function status(db, provider, wallet, now = Date.now()) {
  const credits = await balances(db, wallet, now);
  const { results: subscriptions } = await q(db, 'SELECT status,period_end FROM subscriptions WHERE wallet_id=? ORDER BY period_end DESC', wallet).all();
  const customer = await q(db, 'SELECT customer_id FROM wallets WHERE id=?', wallet).first();
  const c = await provider.get(`customers/${customer.customer_id}`);
  const portal = attrs(c).urls?.customer_portal || null;
  return { state: credits.total ? 'ready' : 'outOfCredits', ...credits,
    subscriptions: subscriptions.map(s => ({ status: s.status, periodEnd: s.period_end ? new Date(s.period_end).toISOString() : null })),
    billingUrl: portal && /^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//i.test(portal) ? portal : null };
}

async function validateOffer(db, offer, wallet, now) {
  if (!Object.hasOwn(OFFERS, offer)) fail('INVALID_OFFER');
  if (wallet && offer === 'monthly') {
    const active = await q(db, "SELECT id FROM subscriptions WHERE wallet_id=? AND (status IN ('active','past_due','unpaid','paused') OR (status='cancelled' AND period_end>?))", wallet, now).first();
    if (active) fail('SUBSCRIPTION_EXISTS', 409);
  }
}

export async function startPurchase(db, wallet = null, now = Date.now()) {
  const id = crypto.randomUUID(), secret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await q(db, 'INSERT INTO checkouts(id,secret_hash,offer,wallet_id,created_at,expires_at) VALUES (?,?,?,?,?,?)', id, await digest(secret), 'pending', wallet, now, now + 900000).run();
  return { id, claimSecret: secret, expiresAt: new Date(now + 900000).toISOString() };
}

export async function purchaseSession(db, id, now = Date.now()) {
  const row = await q(db, 'SELECT * FROM checkouts WHERE id=? AND expires_at>? AND claimed_at IS NULL', id, now).first();
  if (!row) fail('CLAIM_UNAVAILABLE', 410);
  return row;
}

export async function selectPurchase(db, env, provider, id, offer, now = Date.now()) {
  const row = await purchaseSession(db, id, now);
  await validateOffer(db, offer, row.wallet_id, now);
  const lock = `creating:${id}`;
  if (row.provider_id && row.provider_id !== lock) {
    if (row.offer !== offer) fail('INVALID_OFFER', 409);
    const existing = attrs(await provider.get(`checkouts/${row.provider_id}`)).url;
    if (!/^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//i.test(existing || '')) fail('BILLING_UNAVAILABLE', 503);
    return existing;
  }
  const locked = await q(db, "UPDATE checkouts SET offer=?,provider_id=? WHERE id=? AND offer='pending' AND provider_id IS NULL AND expires_at>?", offer, lock, id, now).run();
  if (!locked.meta.changes) fail('BUSY', 409);
  try {
    return await checkoutUrl(db, env, provider, id, offer, row.expires_at);
  } catch (error) {
    await q(db, "UPDATE checkouts SET offer='pending',provider_id=NULL WHERE id=? AND provider_id=?", id, lock).run();
    throw error;
  }
}

export async function createCheckout(db, env, provider, offer, wallet = null, now = Date.now()) {
  await validateOffer(db, offer, wallet, now);
  const purchase = await startPurchase(db, wallet, now);
  const url = await selectPurchase(db, env, provider, purchase.id, offer, now);
  return { ...purchase, url };
}

async function checkoutUrl(db, env, provider, id, offer, expiresAt) {
  const variant = offer === 'monthly' ? env.LS_MONTHLY_VARIANT : env.LS_PACK_VARIANT;
  const result = await provider.create({ type: 'checkouts', attributes: {
    test_mode: env.LS_TEST_MODE === 'true', expires_at: new Date(expiresAt).toISOString(),
    product_options: { enabled_variants: [Number(variant)], redirect_url: 'https://kareer.itsamro.me/setup?purchase=complete',
      description: `${OFFERS[offer].price}${offer === 'monthly' ? '/month' : ' once'}. ${OFFERS[offer].terms} ${CHARGING_TERMS}` },
    checkout_options: { embed: false, media: false, discount: false, skip_trial: true, subscription_preview: true },
    checkout_data: { custom: { kareer_checkout: id }, variant_quantities: [{ variant_id: Number(variant), quantity: 1 }] },
  }, relationships: { store: { data: { type: 'stores', id: env.LS_STORE_ID } }, variant: { data: { type: 'variants', id: variant } } } });
  const url = attrs(result).url;
  if (!/^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\//i.test(url || '')) fail('BILLING_UNAVAILABLE', 503);
  await q(db, 'UPDATE checkouts SET provider_id=? WHERE id=?', String(result.id), id).run();
  return url;
}

export async function claimCheckout(db, env, provider, id, secret, now = Date.now()) {
  const row = await q(db, 'SELECT * FROM checkouts WHERE id=? AND secret_hash=? AND expires_at>? AND claimed_at IS NULL', id, await digest(secret), now).first();
  if (!row) fail('CLAIM_UNAVAILABLE', 410);
  if (!row.order_id) return { status: 'pending' };
  const keys = await provider.list('license-keys', { order_id: row.order_id, store_id: env.LS_STORE_ID });
  const license = keys.find(k => !attrs(k).disabled && String(attrs(k).order_id) === row.order_id);
  if (!license) return { status: 'pending' };
  const key = attrs(license).key;
  const auth = await activate(db, env, provider, key, now);
  const aiStatus = await status(db, provider, auth.wallet, now);
  const consumed = await q(db, 'UPDATE checkouts SET claimed_at=? WHERE id=? AND claimed_at IS NULL AND expires_at>?', now, id, now).run();
  if (!consumed.meta.changes) fail('CLAIM_UNAVAILABLE', 410);
  return { status: 'complete', licenseKey: key, aiStatus };
}

export async function verifySignature(raw, signature, secret) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g), n => parseInt(n, 16)), new TextEncoder().encode(raw));
}

export async function webhook(db, env, provider, raw, signature, now = Date.now()) {
  if (!await verifySignature(raw, signature, env.LS_WEBHOOK_SECRET)) fail('INVALID_SIGNATURE', 401);
  let event; try { event = JSON.parse(raw); } catch { fail('INVALID_REQUEST'); }
  const { data, meta } = event;
  verify(env, data);
  const a = attrs(data);
  const orderId = data.type === 'orders' ? data.id : a.order_id;
  const binding = meta?.custom_data?.kareer_checkout;
  const checkout = binding ? await q(db, 'SELECT * FROM checkouts WHERE id=? AND provider_id IS NOT NULL', String(binding)).first() : null;
  if (binding && !checkout) fail('INVALID_PURCHASE', 403);
  const known = orderId ? await q(db, 'SELECT wallet_id FROM payments WHERE order_id=?', String(orderId)).first() : null;
  if (data.type === 'orders' || data.type === 'license-keys' || data.type === 'subscriptions') {
    if (!checkout && !known) fail('UNBOUND_PURCHASE', 409);
    const wallet = await reconcileOrder(db, env, provider, orderId, checkout, now);
    if (data.type === 'subscriptions') await reconcileSubscription(db, env, provider, data.id, wallet, now);
    if (data.type === 'license-keys') {
      const license = await provider.get(`license-keys/${data.id}`);
      if (attrs(license).key) {
        try { await activate(db, env, provider, attrs(license).key, now); } catch (error) { if (error.code !== 'KEY_DISABLED') throw error; }
      }
    }
  } else if (data.type === 'subscription-invoices') {
    const subscription = await provider.get(`subscriptions/${a.subscription_id}`);
    const order = attrs(subscription).order_id;
    const payment = await q(db, 'SELECT wallet_id FROM payments WHERE order_id=?', String(order)).first();
    if (!checkout && !payment) fail('UNBOUND_PURCHASE', 409);
    const wallet = await reconcileOrder(db, env, provider, order, checkout, now);
    await reconcileSubscription(db, env, provider, a.subscription_id, wallet, now);
  }
}
