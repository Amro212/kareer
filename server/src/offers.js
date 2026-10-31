import { SUPPORT_EMAIL } from '../../src/core/endpoints.js';

// Payment validation, credit grants, the hosted page, the extension and the site all read
// src/core/offers.json. Stripe prices must match its amounts exactly (USD, quantity 1, no discounts).
export { default as OFFERS } from '../../src/core/offers.json' with { type: 'json' };
export const CHARGING_TERMS = `Credits are usage units for Kareer AI, not money. They have no cash value and cannot be transferred or exchanged. Monthly credits are used first. Each completed AI request uses one credit; one autofill run can make several requests. Failed or invalid results use no credit. A completed result still counts if you close the page or the form rejects it, and asking again uses another credit. There are no automatic top-ups. All sales are final: no refunds, except where the law requires one. Taxes may apply. Kareer fills forms for you to review; you submit every application yourself. Lost your key? Email ${SUPPORT_EMAIL}.`;
