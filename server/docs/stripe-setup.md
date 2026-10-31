# Stripe setup

How to configure, run and verify Kareer's Stripe billing. Kareer is a form-filling
assistant: the extension fills job application forms that the user reviews and
submits. Stripe sells two offers, both in USD:

| Offer | Price | Credits | Stripe price |
|---|---|---|---|
| Monthly plan | US$10 / month | 1,000 per paid month, expire at period end | recurring, `lookup_key=kareer_monthly_usd`, `metadata.offer=monthly`, `metadata.credits=1000` |
| Credit pack | US$5 once | 300, never expire | one-time, `lookup_key=kareer_pack_usd`, `metadata.offer=pack`, `metadata.credits=300` |

All sales are final. Lost keys are recovered by email to amromousa8@gmail.com;
there is no automated recovery.

## Current sandbox objects

| What | ID |
|---|---|
| Account (sandbox) | `acct_1URR9FRSf0GhgGvm` (default currency CAD; Kareer always uses the USD prices) |
| API version | `2026-09-30.endive`, pinned in `src/payments.js` |
| Monthly product / price | `prod_VXRMTdi2nd2iKY` / `price_1UWMU7RSf0GhgGvmfq5qJRSx` (tax behavior exclusive) |
| Pack product / price | `prod_VXRMu3rnht3Ssf` / `price_1UWMU9RSf0GhgGvmFJ2Pi3ey` (tax behavior exclusive) |
| Customer portal configuration | `bpc_1UWMUNRSf0GhgGvmAezXi5vX` (cancel at period end, no plan switching, return URL `https://kareer.itsamro.me/`) |
| Webhook endpoint | `we_1UWMUfRSf0GhgGvmWbzvP1Jp` → `https://kareer-gateway-staging.amromousa8.workers.dev/webhooks/stripe` |

Payment methods are managed in the Dashboard (Settings → Payment methods), not
in code: API version `2026-09-30.endive` rejects `payment_method_types` on
Checkout Sessions. To pin a specific payment method configuration, set
`STRIPE_PAYMENT_METHOD_CONFIGURATION = "pmc_…"` in the environment's vars; when
unset (or not a `pmc_` ID) Stripe uses the account default.

Staging uses these in `server/wrangler.toml` `[env.staging.vars]`. Production
values are `CONFIGURE_…` placeholders until live-mode objects exist; the
production deploy script refuses to run while any remain.

## Webhook events

Subscribe the endpoint to:

- `checkout.session.completed`, `checkout.session.expired`
- `invoice.paid`, `invoice.payment_failed`
- `customer.subscription.updated`, `customer.subscription.deleted`
- `charge.dispute.created`, `charge.dispute.closed`
- `charge.refunded` (recommended; see below)

`charge.refunded` is handled defensively: if a refund is ever issued from the
Dashboard (for example where the law requires one), the handler revokes that
payment's credits. Without the subscription the refunded credits stay spendable,
so adding it is recommended even though sales are final.

## Restricted API key

Create a restricted key (`rk_test_…` in the sandbox, `rk_live_…` for production)
with only these permissions:

| Resource | Permission | Used for |
|---|---|---|
| Checkout Sessions | Write | create and retrieve sessions (plan selection, claim fallback, webhook fulfilment) |
| Customers | Write | reuse a returning wallet's customer with `customer_update` |
| Prices | Read | price data on expanded session line items |
| Subscriptions | Read | subscription status and current period |
| Invoices | Read | invoice retrieval and the invoice payments list (PaymentIntent of each renewal) |
| Customer portal | Write | billing portal sessions for Manage billing |

Everything else stays None. Webhook signatures are verified locally with the
signing secret and need no API permission. The key's prefix decides livemode: a
`rk_test_` key accepts only test events and objects, a `rk_live_` key only live ones.

## Secrets and bindings

Secrets never go in `wrangler.toml`, the extension, logs or screenshots.

```sh
cd server
npx wrangler secret put OPENROUTER_API_KEY --env staging
npx wrangler secret put STRIPE_SECRET_KEY --env staging      # rk_test_…
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging  # whsec_… of we_1UWMUfRSf0GhgGvmWbzvP1Jp
# Production, with live credentials and the live endpoint's signing secret:
npx wrangler secret put OPENROUTER_API_KEY --env production
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
```

For `wrangler dev`, put the same names in an ignored `server/.dev.vars.staging`.

Bindings in `wrangler.toml`:

- `DB`: D1 `kareer-staging` (`7f1f7a5d-3f38-4171-a4c6-5f58a88bf7bb`) and
  `kareer-production` (`7db39b5b-4f18-4c27-9758-6e06389c7d09`).
- `PURCHASE_LIMITER`: Workers rate limiting, 10 requests per 60 s per IP
  (namespaces `1001` staging, `1002` production).
- Cron `*/5 * * * *` for cleanup.

## Database

`migrations/0001.sql` is the whole schema (no earlier billing data to migrate).

```sh
npx wrangler d1 migrations apply DB --env staging --remote
npx wrangler d1 migrations apply DB --env production --remote
```

## Deploy

```sh
npm run deploy:staging      # https://kareer-gateway-staging.amromousa8.workers.dev
npm run deploy:production   # blocked while production placeholders remain
```

Staging is the sandbox and runs with `SALES_ENABLED="true"`. Production stays
`"false"` until live mode is ready. Add the staging Chrome extension origin to
`ALLOWED_ORIGINS`. Checkout Session creation failures are logged with the
Stripe error type, code, param and message (`npx wrangler tail --env staging`).

Build a staging extension from the repository root (defaults to Kareer AI):

```sh
node tools/build.js --target=extension --staging --gateway=https://kareer-gateway-staging.amromousa8.workers.dev
```

### Production domain

Production uses the custom domain `api.kareer.itsamro.me`. Workers custom domains
need the parent zone on Cloudflare, and `itsamro.me` is currently on Namecheap DNS
(`kareer.itsamro.me` is a CNAME to GitHub Pages). Either:

1. Move `itsamro.me` to Cloudflare: add the zone, recreate every Namecheap record
   (including `kareer` CNAME → GitHub Pages, DNS only), then switch the Namecheap
   nameservers. The existing `routes` entry then deploys as is; or
2. Keep Namecheap and serve production from `kareer-gateway.amromousa8.workers.dev`:
   set `workers_dev = true` and remove `routes` in `[env.production]`, and change
   `GATEWAY_ORIGIN` in `src/core/endpoints.js`. Builds, the extension's host
   permission and the store upload check all read that one constant.

## Local webhook forwarding

```sh
stripe login
stripe listen --forward-to http://localhost:8787/webhooks/stripe \
  --events checkout.session.completed,checkout.session.expired,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,charge.refunded,charge.dispute.created,charge.dispute.closed
```

Put the printed `whsec_…` in `.dev.vars.staging` as `STRIPE_WEBHOOK_SECRET` and
run `npm run dev`.

## Sandbox checklist

Run each with a staging extension build, Settings → AI & billing → View plans.
Record results in `docs/release-checklist.json` under `stripeSandbox`.

| Case | How | Expect |
|---|---|---|
| Pack purchase | card `4242 4242 4242 4242` | Settings shows "Payment verified", 300 purchased credits; Show key displays a `kr_` key |
| Monthly purchase | card `4242 4242 4242 4242` | 1,000 monthly credits expiring at period end; "Monthly plan renews …" |
| 3D Secure | card `4000 0025 0000 3155`, complete the challenge | Same as a successful purchase |
| Decline | card `4000 0000 0000 9995` | Checkout shows the decline; no credits; claim stays pending, then ends |
| Claim without webhook | Disable the endpoint, pay, wait | Settings still activates (claim retrieves the session from Stripe) |
| Settings closed | Close Settings during payment, reopen within 24 h | Activates on open |
| Key reuse | Show key, activate it in a second browser profile | Same balance |
| Renewal | Test clock: create the subscription on a clock customer, advance one month | `invoice.paid` (`subscription_cycle`) adds 1,000 new monthly credits |
| Failed renewal | Test clock with card `4000 0000 0000 0341`, advance one month | No credits; "Monthly payment failed …"; Manage billing opens the portal |
| Cancel | Manage billing → cancel | "Monthly plan cancelled. It stays active … until …"; credits remain until period end |
| Dispute | card `4000 0000 0000 0259` (pack) | Credits from that payment disappear, plan shows the dispute notice, new purchases are refused |
| Dispute won | Dashboard: submit evidence with `winning_evidence` | Credits return; dispute notice clears |
| Duplicate delivery | Resend an event from the Dashboard | No double grant |
| Second claim | Repeat the claim request | 410, no second key |
