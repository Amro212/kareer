import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '../src/payments.js';

// Real SDK webhook signing; every API resource below is an in-memory mock.
export const SECRET = 'whsec_test_kareer';
const sdk = new Stripe('sk_test_signing_only', { apiVersion: STRIPE_API_VERSION });
export const environment = (extra = {}) => ({ STRIPE_SECRET_KEY: 'rk_test_kareer', STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_MONTHLY: 'price_monthly', STRIPE_PRICE_PACK: 'price_pack', SALES_ENABLED: 'true', ...extra });

export function mockStripe() {
  const objects = {}, payments = {}, calls = [];
  const find = id => { calls.push(id); if (!objects[id]) throw new Error(`No such object: ${id}`); return structuredClone(objects[id]); };
  let created = 0;
  return { objects, payments, calls, webhooks: sdk.webhooks,
    checkout: { sessions: {
      async create(params, options) {
        calls.push({ create: params, options });
        const id = `cs_test_${++created}`;
        objects[id] = { id, status: 'open', url: `https://checkout.stripe.com/c/pay/${id}`, params };
        return structuredClone(objects[id]);
      },
      async retrieve(id) { return find(id); },
    } },
    subscriptions: { async retrieve(id) { return find(id); } },
    invoices: { async retrieve(id) { return find(id); } },
    invoicePayments: { async list({ invoice }) { calls.push(`payments:${invoice}`); return { data: payments[invoice] || [] }; } },
    billingPortal: { sessions: { async create(params) { calls.push({ portal: params }); return { url: 'https://billing.stripe.com/p/session/test_1' }; } } },
  };
}

export function sign(event, { secret = SECRET, timestamp } = {}) {
  const payload = JSON.stringify(event);
  return { payload, header: sdk.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) }) };
}

let sequence = 0;
export const event = (type, object, { created = Math.floor(Date.now() / 1000), livemode = false, id = `evt_${++sequence}` } = {}) =>
  ({ id, object: 'event', type, created, livemode, api_version: STRIPE_API_VERSION, data: { object } });

export const packSession = (id, purchase, extra = {}) => ({
  id, object: 'checkout.session', status: 'complete', payment_status: 'paid', mode: 'payment', livemode: false, currency: 'usd',
  amount_subtotal: 500, amount_total: 565, total_details: { amount_discount: 0, amount_tax: 65 }, customer: 'cus_pack', payment_intent: 'pi_pack',
  client_reference_id: purchase, metadata: { kareer_purchase: purchase, offer: 'pack' },
  line_items: { data: [{ price: { id: 'price_pack' }, quantity: 1, amount_subtotal: 500 }] }, ...extra,
});

const DAY = 86400;
export const PERIOD = Math.floor(Date.now() / 1000) - 3600;
export const invoice = (id, { reason = 'subscription_create', start = PERIOD, purchase, customer = 'cus_month', ...extra } = {}) => ({
  id, object: 'invoice', billing_reason: reason, status: 'paid', livemode: false, currency: 'usd', subtotal: 1000, total: 1130,
  customer, total_discount_amounts: [],
  parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1', metadata: purchase ? { kareer_purchase: purchase } : {} } },
  lines: { data: [{ amount: 1000, quantity: 1, pricing: { type: 'price_details', price_details: { price: 'price_monthly', product: 'prod_monthly' } }, period: { start, end: start + 30 * DAY } }] },
  ...extra,
});
export const subscription = ({ status = 'active', purchase, customer = 'cus_month', end = PERIOD + 30 * DAY, ...extra } = {}) => ({
  id: 'sub_1', object: 'subscription', status, livemode: false, customer, cancel_at_period_end: false, cancel_at: null,
  metadata: purchase ? { kareer_purchase: purchase } : {}, latest_invoice: 'in_1',
  items: { data: [{ price: { id: 'price_monthly' }, quantity: 1, current_period_start: end - 30 * DAY, current_period_end: end }] }, ...extra,
});
export const monthlySession = (id, purchase, extra = {}) => ({
  ...packSession(id, purchase), mode: 'subscription', payment_intent: null, customer: 'cus_month', amount_subtotal: 1000, amount_total: 1130,
  metadata: { kareer_purchase: purchase, offer: 'monthly' }, subscription: subscription({ purchase }), invoice: invoice('in_1', { purchase }),
  line_items: { data: [{ price: { id: 'price_monthly' }, quantity: 1, amount_subtotal: 1000 }] }, ...extra,
});
