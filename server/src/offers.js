// Payment validation, credit grants and the hosted page share this server policy.
export const OFFERS = {
  monthly: { name: 'Monthly plan', cents: 1000, credits: 1000, price: 'US$10', cadence: '/ month',
    terms: 'Renews automatically until cancelled. 1,000 credits per paid billing period, expiring at period end. Cancellation keeps the paid allowance until expiry.' },
  pack: { name: 'Credit pack', cents: 500, credits: 300, price: 'US$5', cadence: 'once',
    terms: '300 credits with no expiry. No subscription needed; purchased credits remain after cancellation.' },
};
export const CHARGING_TERMS = 'Monthly credits are spent first. One completed AI request costs one credit; runs can make multiple requests, including automatic follow-ups. Failed or invalid completions are not charged. Settled results stay charged if delivery fails or an application rejects them; explicit retries may cost another credit. No automatic top-ups. Purchases are non-refundable, subject to rights required by law. Manage billing and recover keys through your Lemon Squeezy receipt. Taxes may apply.';
