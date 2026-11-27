import offers from '../../src/core/offers.json';
import credits from '../../src/core/credits.json';

export function creditCount(count: number) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'credit' : 'credits'}`;
}

export const pricingPlans = [
  ['Local tools', 'Free', '—', 'Fill from your saved profile and reuse saved answers.'],
  ['Kareer AI trial', 'Free', creditCount(credits.trial.credits), `Expires after ${credits.trial.days} days. One trial per browser installation.`],
  [offers.monthly.name, `${offers.monthly.price} per month`, `${creditCount(offers.monthly.credits)} each month`, 'Renews monthly until canceled. Unused monthly credits expire at the end of the paid billing period.'],
  [offers.pack.name, `${offers.pack.price} once`, creditCount(offers.pack.credits), 'Credits never expire. No subscription required.'],
] as const;

export const requestCosts = [
  ['Autofill', credits.costs.autofill],
  ['Option discovery', credits.costs.optionDiscovery],
  ['Repair', credits.costs.repair],
  ['Field rewrite', credits.costs.fieldRewrite],
  ['Tailor a résumé or generate a cover letter', credits.costs.document],
  ['Rewrite part of a résumé or cover letter', credits.costs.documentRewrite],
] as const;

export function renderPricingMarkdown() {
  return [
    '# Kareer pricing and AI credits',
    '',
    '[Current pricing and purchase instructions](https://kareer.itsamro.me/pricing/)',
    '',
    'Local job application autofill is free. Kareer AI is optional. Paid prices are in USD, and taxes may apply.',
    '',
    '| Plan | Price | AI credits | How it works |',
    '| --- | --- | --- | --- |',
    ...pricingPlans.map(plan => `| ${plan.join(' | ')} |`),
    '',
    '## Cost per completed AI request',
    '',
    ...requestCosts.map(([label, cost]) => `- ${label}: ${creditCount(cost)}`),
    '',
    'One autofill run can make multiple requests. Plans are purchased in the Kareer extension under Settings → Kareer AI. There are no automatic top-ups.',
    '',
  ].join('\n');
}
