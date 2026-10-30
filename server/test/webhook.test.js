import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.js';
import worker from '../src/index.js';
import { webhook, startPurchase, selectPurchase, status } from '../src/payments.js';
import { balances } from '../src/ledger.js';
import { environment, mockStripe, sign, event, packSession, monthlySession, invoice, subscription, PERIOD } from './stripe.js';

const env = environment();
const DAY = 86400;
const deliver = (db, stripe, e, options) => { const { payload, header } = sign(e, options); return webhook(db, env, stripe, payload, header); };
const count = (db, table) => db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const walletOf = (db, customer) => db.sql.prepare('SELECT id FROM wallets WHERE customer_id=?').get(customer)?.id;
async function purchase(db, stripe, offer) {
  const started = await startPurchase(db);
  await selectPurchase(db, env, stripe, started.id, offer, 'https://api.test');
  const { session_id: session } = db.sql.prepare('SELECT session_id FROM purchases WHERE id=?').get(started.id);
  return { ...started, session };
}
function paidPack(db, stripe, p, extra) {
  stripe.objects[p.session] = packSession(p.session, p.id, extra);
  return deliver(db, stripe, event('checkout.session.completed', { id: p.session, object: 'checkout.session' }));
}
function monthlyPayments(stripe) {
  stripe.payments.in_1 = [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_in_1' } }];
  stripe.payments.in_2 = [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_in_2' } }];
}

test('signatures are verified on the raw body with the SDK; invalid and stale signatures are rejected', async () => {
  const db = database(), stripe = mockStripe();
  const e = event('invoice.payment_failed', { id: 'in_x', object: 'invoice' });
  const { payload, header } = sign(e);
  await assert.rejects(webhook(db, env, stripe, payload + ' ', header), /INVALID_SIGNATURE/);
  await assert.rejects(webhook(db, env, stripe, payload, sign(e, { secret: 'whsec_other' }).header), /INVALID_SIGNATURE/);
  await assert.rejects(webhook(db, env, stripe, payload, null), /INVALID_SIGNATURE/);
  const stale = sign(e, { timestamp: Math.floor(Date.now() / 1000) - 600 });
  await assert.rejects(webhook(db, env, stripe, stale.payload, stale.header), /INVALID_SIGNATURE/);
  assert.deepEqual(await webhook(db, env, stripe, payload, header), { duplicate: false });
  assert.equal(count(db, 'webhook_events'), 1);
  const response = await worker.fetch(new Request('https://api.test/webhooks/stripe', { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=bad' }, body: payload }), { ...env, DB: db }, {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_SIGNATURE');
});

test('pack completion grants 300 credits once per payment, deduplicating replayed events', async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  const params = stripe.calls.find(c => c.create).create;
  assert.equal(params.mode, 'payment');
  assert.deepEqual(params.line_items, [{ price: 'price_pack', quantity: 1 }]);
  assert.deepEqual(params.payment_method_types, ['card', 'link']);
  assert.equal(params.automatic_tax.enabled, true);
  assert.equal(params.customer_creation, 'always');
  assert.equal(params.client_reference_id, p.id);
  assert.ok(params.expires_at * 1000 - Date.now() >= 30 * 60000);
  stripe.objects[p.session] = packSession(p.session, p.id);
  const completed = event('checkout.session.completed', { id: p.session, object: 'checkout.session' });
  await deliver(db, stripe, completed);
  assert.deepEqual(await deliver(db, stripe, completed), { duplicate: true });
  await deliver(db, stripe, event('checkout.session.completed', { id: p.session, object: 'checkout.session' }));
  const wallet = walletOf(db, 'cus_pack');
  assert.equal((await balances(db, wallet)).purchased, 300);
  assert.equal(count(db, 'grants'), 1);
  assert.equal(db.sql.prepare('SELECT payment_ref FROM grants').get().payment_ref, 'pi_pack');
  assert.equal(db.sql.prepare('SELECT status FROM purchases').get().status, 'fulfilled');
});

for (const [name, change] of [
  ['price', s => { s.line_items.data[0].price.id = 'price_other'; }],
  ['monthly price on a pack purchase', s => { s.line_items.data[0].price.id = 'price_monthly'; }],
  ['quantity', s => { s.line_items.data[0].quantity = 2; }],
  ['amount', s => { s.amount_subtotal = 100; s.line_items.data[0].amount_subtotal = 100; }],
  ['currency', s => { s.currency = 'cad'; }],
  ['discount', s => { s.total_details.amount_discount = 100; }],
  ['session livemode', s => { s.livemode = true; }],
]) test(`checkout ${name} mismatch is rejected before any grant`, async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  const session = packSession(p.session, p.id); change(session);
  stripe.objects[p.session] = session;
  await assert.rejects(deliver(db, stripe, event('checkout.session.completed', { id: p.session })), /INVALID_PURCHASE/);
  assert.equal(count(db, 'grants'), 0);
  assert.equal(count(db, 'webhook_events'), 0, 'rejected events stay retryable and visible in Stripe');
});

test('event livemode must match the configured key', async () => {
  const db = database(), stripe = mockStripe();
  await assert.rejects(deliver(db, stripe, event('invoice.payment_failed', { id: 'in_x' }, { livemode: true })), /INVALID_PURCHASE/);
  await assert.rejects(webhook(db, { ...env, STRIPE_SECRET_KEY: 'rk_live_x' }, stripe, ...Object.values(sign(event('invoice.payment_failed', { id: 'in_x' })))), /INVALID_PURCHASE/);
});

test('subscription_create and subscription_cycle grant 1,000 credits expiring at each line period end', async () => {
  const db = database(), stripe = mockStripe(); monthlyPayments(stripe);
  const p = await purchase(db, stripe, 'monthly');
  const params = stripe.calls.find(c => c.create).create;
  assert.equal(params.mode, 'subscription');
  assert.equal(params.subscription_data.metadata.kareer_purchase, p.id);
  assert.equal(params.customer_creation, undefined);
  stripe.objects[p.session] = monthlySession(p.session, p.id);
  await deliver(db, stripe, event('checkout.session.completed', { id: p.session }));
  await deliver(db, stripe, event('invoice.paid', invoice('in_1', { purchase: p.id })));
  const wallet = walletOf(db, 'cus_month');
  let credits = await balances(db, wallet);
  assert.equal(credits.monthly, 1000);
  assert.equal(credits.monthlyExpiresAt, new Date((PERIOD + 30 * DAY) * 1000).toISOString());
  assert.equal(db.sql.prepare("SELECT payment_ref FROM grants WHERE id='invoice:in_1'").get().payment_ref, 'pi_in_1');
  const later = (PERIOD + 30 * DAY + 60) * 1000;
  await deliver(db, stripe, event('invoice.paid', invoice('in_2', { reason: 'subscription_cycle', start: PERIOD + 30 * DAY })));
  credits = await balances(db, wallet, later);
  assert.equal(credits.monthly, 1000, 'the expired first month no longer counts; the renewal does');
  assert.equal(credits.monthlyExpiresAt, new Date((PERIOD + 60 * DAY) * 1000).toISOString());
  await deliver(db, stripe, event('invoice.paid', invoice('in_3', { reason: 'manual' })));
  assert.equal(count(db, 'grants'), 2, 'only subscription_create and subscription_cycle invoices grant');
});

test('invoice price, quantity, amount, currency and discount mismatches are rejected', async () => {
  for (const change of [
    i => { i.lines.data[0].pricing.price_details.price = 'price_pack'; }, i => { i.lines.data[0].quantity = 2; },
    i => { i.subtotal = 900; }, i => { i.currency = 'cad'; }, i => { i.total_discount_amounts = [{ amount: 100 }]; }, i => { i.livemode = true; },
  ]) {
    const db = database(), stripe = mockStripe(); monthlyPayments(stripe);
    await db.prepare('INSERT INTO wallets(id,customer_id) VALUES (?,?)').bind('w', 'cus_month').run();
    const bad = invoice('in_1'); change(bad);
    await assert.rejects(deliver(db, stripe, event('invoice.paid', bad)), /INVALID_PURCHASE/);
    assert.equal(count(db, 'grants'), 0);
  }
});

test('out-of-order: invoice.paid and subscription.updated before checkout completion bind through purchase metadata', async () => {
  const db = database(), stripe = mockStripe(); monthlyPayments(stripe);
  const p = await purchase(db, stripe, 'monthly');
  await deliver(db, stripe, event('customer.subscription.updated', subscription({ purchase: p.id })));
  await deliver(db, stripe, event('invoice.paid', invoice('in_1', { purchase: p.id })));
  const wallet = walletOf(db, 'cus_month');
  assert.equal(db.sql.prepare('SELECT wallet_id FROM purchases').get().wallet_id, wallet);
  stripe.objects[p.session] = monthlySession(p.session, p.id);
  await deliver(db, stripe, event('checkout.session.completed', { id: p.session }));
  assert.equal((await balances(db, wallet)).monthly, 1000);
  assert.equal(count(db, 'wallets'), 1);
  assert.equal(count(db, 'grants'), 1);
  await assert.rejects(deliver(db, stripe, event('invoice.paid', invoice('in_9', { customer: 'cus_unknown' }))), /UNBOUND_PURCHASE/);
});

test('subscription updated and deleted keep the newest status; stale events cannot overwrite it', async () => {
  const db = database(), stripe = mockStripe();
  await db.prepare('INSERT INTO wallets(id,customer_id) VALUES (?,?)').bind('w', 'cus_month').run();
  const now = Math.floor(Date.now() / 1000);
  await deliver(db, stripe, event('customer.subscription.updated', subscription({ cancel_at_period_end: true }), { created: now }));
  let s = (await status(db, 'w')).subscriptions[0];
  assert.deepEqual([s.status, s.cancelAtPeriodEnd], ['active', true]);
  await deliver(db, stripe, event('customer.subscription.updated', subscription({ status: 'past_due' }), { created: now + 10 }));
  await deliver(db, stripe, event('customer.subscription.updated', subscription({ status: 'active' }), { created: now - 10 }));
  assert.equal((await status(db, 'w')).subscriptions[0].status, 'past_due');
  await deliver(db, stripe, event('customer.subscription.deleted', subscription({ status: 'canceled' }), { created: now + 20 }));
  s = (await status(db, 'w')).subscriptions[0];
  assert.equal(s.status, 'canceled');
  await assert.rejects(deliver(db, stripe, event('customer.subscription.updated', subscription({ items: { data: [{ price: { id: 'price_x' }, quantity: 1 }] } }))), /INVALID_PURCHASE/);
});

test('a refund revokes only that payment, including a refund that arrives before its grant', async () => {
  const db = database(), stripe = mockStripe(); monthlyPayments(stripe);
  await db.prepare('INSERT INTO wallets(id,customer_id) VALUES (?,?)').bind('w', 'cus_month').run();
  await deliver(db, stripe, event('invoice.paid', invoice('in_1')));
  await deliver(db, stripe, event('charge.refunded', { id: 'ch_2', object: 'charge', payment_intent: 'pi_in_2' }));
  await deliver(db, stripe, event('invoice.paid', invoice('in_2', { reason: 'subscription_cycle' })));
  assert.equal(count(db, 'grants'), 1, 'a refunded renewal is never granted');
  await deliver(db, stripe, event('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_in_1' }));
  assert.equal((await balances(db, 'w')).total, 0);
  assert.equal(db.sql.prepare("SELECT revoked FROM grants WHERE id='invoice:in_1'").get().revoked, 1);
});

test('a dispute revokes its payment, flags the wallet, and restores only when won', async () => {
  const db = database(), stripe = mockStripe();
  const pack = await purchase(db, stripe, 'pack');
  await paidPack(db, stripe, pack);
  const wallet = walletOf(db, 'cus_pack');
  await db.prepare('INSERT INTO grants(id,wallet_id,kind,payment_ref,credits,starts_at) VALUES (?,?,?,?,?,?)').bind('pack:pi_other', wallet, 'pack', 'pi_other', 300, 0).run();
  const dispute = (status, id = 'dp_1') => ({ id, object: 'dispute', payment_intent: 'pi_pack', charge: 'ch_pack', status });
  await deliver(db, stripe, event('charge.dispute.created', dispute('needs_response')));
  assert.equal((await balances(db, wallet)).purchased, 300, 'the other payment is untouched');
  assert.equal((await status(db, wallet)).flagged, true);
  await assert.rejects(startPurchase(db, wallet), /WALLET_FLAGGED/);
  await deliver(db, stripe, event('charge.dispute.closed', dispute('won')));
  assert.equal((await balances(db, wallet)).purchased, 600);
  assert.equal((await status(db, wallet)).flagged, false);
  await deliver(db, stripe, event('charge.dispute.created', dispute('needs_response')));
  assert.equal((await balances(db, wallet)).purchased, 600, 'a late created event cannot undo a won dispute');
  await deliver(db, stripe, event('charge.dispute.created', dispute('needs_response', 'dp_2')));
  await deliver(db, stripe, event('charge.dispute.closed', dispute('lost', 'dp_2')));
  assert.equal((await balances(db, wallet)).purchased, 300);
  assert.equal((await status(db, wallet)).flagged, true);
});

test('checkout expiry ends the claim window', async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  stripe.objects[p.session] = { id: p.session, status: 'expired', client_reference_id: p.id };
  await deliver(db, stripe, event('checkout.session.expired', { id: p.session }));
  assert.equal(db.sql.prepare('SELECT status FROM purchases').get().status, 'expired');
});
