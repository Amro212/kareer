import { ApiError, MESSAGES, readBody, fail, limited } from './policy.js';
import { stripeClient, purchaseSession, selectPurchase } from './payments.js';
import { OFFERS, CHARGING_TERMS } from './offers.js';
import { TOKENS } from '../../src/core/theme.js';
import { SITE_ORIGIN, SUPPORT_EMAIL } from '../../src/core/endpoints.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const headers = {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  // Chrome applies form-action to the 303 redirect into Stripe Checkout.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com; base-uri 'none'; frame-ancestors 'none'",
};
const terms = `${SITE_ORIGIN}/terms/`;
function document(content, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kareer AI · Plans</title><style>
    :root{${TOKENS}color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:var(--kr-bg-0);color:var(--kr-text-1);font:16px/1.6 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:48px 24px 64px}a{color:var(--kr-info);text-underline-offset:4px}.brand{font-weight:700;color:var(--kr-signal);text-decoration:none}header{margin:40px 0 32px;max-width:640px}h1{font-size:40px;line-height:1.15;letter-spacing:-.025em;margin:0 0 16px}h2{font-size:22px;margin:0}p{margin:12px 0;color:var(--kr-text-2)}.offers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.offer{padding:32px;background:var(--kr-bg-1);border:1px solid var(--kr-line-strong);border-radius:var(--kr-radius-lg);display:flex;flex-direction:column;gap:16px}.price{font-size:36px;line-height:1.2;color:var(--kr-text-1);font-weight:650;margin:0}.price span{font-size:15px;font-weight:400;color:var(--kr-text-2)}.offer p{margin:0}.offer form{display:grid;gap:20px;margin-top:auto}label{display:flex;align-items:flex-start;gap:12px;font-size:14px;color:var(--kr-text-2)}input{width:18px;height:18px;flex:0 0 18px;margin-top:3px;accent-color:var(--kr-signal)}button{font:600 15px/1.4 system-ui,sans-serif;min-height:48px;padding:12px 20px;border:1px solid var(--kr-signal);border-radius:var(--kr-radius-sm);background:var(--kr-signal);color:var(--kr-bg-0);cursor:pointer}button:hover{background:var(--kr-signal-hover)}:focus-visible{outline:2px solid var(--kr-info);outline-offset:4px}.terms{margin-top:32px;padding-top:24px;border-top:1px solid var(--kr-line);max-width:78ch;font-size:14px}.back{display:inline-block;margin-top:24px}@media(max-width:640px){main{padding:24px 20px 48px}header{margin-top:32px}h1{font-size:32px}.offers{grid-template-columns:1fr}.offer{padding:24px}}
    </style></head><body><main><a class="brand" href="${SITE_ORIGIN}/">Kareer</a>${content}</main></body></html>`, { status, headers });
}

const pageMessages = {
  CLAIM_UNAVAILABLE: `This purchase page has expired or was already used. Open Kareer to check your credits, or choose View plans again. If you paid and Kareer did not activate, email ${SUPPORT_EMAIL}.`,
  SUBSCRIPTION_EXISTS: 'You already have a monthly plan. Open Manage billing in Kareer, or go back and choose a credit pack.',
  SALES_DISABLED: 'Kareer AI purchases are not available yet. Filling forms from your saved profile still works in the extension.',
  ORIGIN_DENIED: 'This purchase could not be verified. Open View plans from Kareer and try again.',
  INVALID_OFFER: 'That offer is not available. Go back to the plans page and choose another one.',
  INVALID_REQUEST: 'Choose an offer and tick the box to accept its terms before continuing.',
  BUSY: 'Checkout is already opening. Wait a moment, then go back to the plans page.',
  RATE_LIMIT: MESSAGES.RATE_LIMIT, WALLET_FLAGGED: MESSAGES.WALLET_FLAGGED,
};

export async function hostedPurchase(request, env) {
  const url = new URL(request.url), id = url.pathname.split('/').at(-1);
  try {
    if (env.SALES_ENABLED !== 'true') fail('SALES_DISABLED', 503);
    if (!['GET', 'POST'].includes(request.method)) fail('INVALID_REQUEST', 405);
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) fail('ORIGIN_DENIED', 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) fail('INVALID_REQUEST', 415);
      const form = new URLSearchParams(await readBody(request, 1024));
      if (form.get('agreement') !== 'yes' || [...form.keys()].some(key => !['offer', 'agreement'].includes(key))
        || form.getAll('offer').length !== 1 || form.getAll('agreement').length !== 1) fail('INVALID_REQUEST');
      await limited(request, env);
      const checkout = await selectPurchase(env.DB, env, stripeClient(env), id, form.get('offer'), url.origin);
      return new Response(null, { status: 303, headers: { ...headers, Location: checkout } });
    }
    const row = await purchaseSession(env.DB, id);
    const offers = Object.entries(OFFERS).filter(([key]) => !row.offer || row.offer === key);
    return document(`<header><h1>More help with your next application.</h1><p>Kareer fills job application forms from your saved profile. Kareer AI drafts answers to open questions and tailored resumes and cover letters. You review everything and submit each application yourself.</p><p>Keep Kareer's Settings tab open while you pay. Kareer activates on its own after payment, even if you close the tab for a while and open Settings again later.</p></header>
      <div class="offers">${offers.map(([key, offer]) => `<section class="offer"><h2>${escape(offer.name)}</h2><p class="price">${escape(offer.price)} <span>${escape(offer.cadence)}</span></p><p>${offer.credits.toLocaleString('en-US')} AI credits</p><p>${escape(offer.terms)}</p><form action="/plans/${escape(id)}" method="post"><input type="hidden" name="offer" value="${key}"><label><input type="checkbox" name="agreement" value="yes" required><span>I agree to this offer's billing terms, the <a href="#charging">credit rules below</a> and the <a href="${terms}" target="_blank" rel="noopener">Terms of Service</a>. All sales are final.</span></label><button type="submit">${key === 'monthly' ? 'Choose monthly plan' : 'Buy credit pack'}</button></form></section>`).join('')}</div>
      <section class="terms" id="charging"><h2>How credits work</h2><p>${escape(CHARGING_TERMS)}</p><p>AI answers can be wrong. Check them before you submit. Kareer's server does not keep your answers, so they cannot be recovered later.</p><p>Payment is handled by Stripe. To cancel a monthly plan, use Manage billing in Kareer's Settings. Closing a tab or removing the extension does not cancel it.</p><p>Read the full <a href="${terms}" target="_blank" rel="noopener">Terms of Service</a>. Questions: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p></section>`);
  } catch (error) {
    return document(`<header><h1>Purchase needs attention</h1><p role="alert">${escape(pageMessages[error.code] || 'Checkout is temporarily unavailable. Go back to the plans page and try again. This page has not taken any payment.')}</p><a class="back" href="/plans/${escape(id)}">Back to plans</a></header>`, error instanceof ApiError ? error.status : 503);
  }
}
