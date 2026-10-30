import { SUPPORT_EMAIL } from '../../src/core/endpoints.js';

// Payment validation, credit grants and the hosted page share this server policy.
// Stripe prices must match these amounts exactly (USD, quantity 1, no discounts).
export const OFFERS = {
  monthly: { name: 'Monthly plan', cents: 1000, credits: 1000, price: 'US$10', cadence: '/ month',
    terms: 'Renews every month until you cancel. Adds 1,000 credits each paid month; unused monthly credits expire when that month ends. If you cancel, the plan stops at the end of the month you already paid for.' },
  pack: { name: 'Credit pack', cents: 500, credits: 300, price: 'US$5', cadence: 'once',
    terms: '300 credits that do not expire. No subscription needed; pack credits stay after a plan ends.' },
};
export const CHARGING_TERMS = `Credits are usage units for Kareer AI, not money. They have no cash value and cannot be transferred or exchanged. Monthly credits are used first. Each completed AI request uses one credit; one autofill run can make several requests. Failed or invalid results use no credit. A completed result still counts if you close the page or the form rejects it, and asking again uses another credit. There are no automatic top-ups. All sales are final: no refunds, except where the law requires one. Taxes may apply. Kareer fills forms for you to review; you submit every application yourself. Lost your key? Email ${SUPPORT_EMAIL}.`;
