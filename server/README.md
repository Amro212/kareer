# Kareer AI gateway

One Cloudflare Worker and D1. Stripe Checkout takes payment; the gateway mints a
Kareer key (`kr_…`) the first time the extension claims a paid purchase and
returns it once. Only key hashes are stored. There are no Kareer accounts and
keys are never emailed. Profiles, files, ATS execution and exported documents
stay local.

Stripe setup, secrets, migrations and the sandbox test checklist are in
[docs/stripe-setup.md](./docs/stripe-setup.md).

## Local checks

Use Node 22.15+ (Node 24 in CI): `npm ci`, `npm test`, `npm run check` in this folder.
Tests run the real migration/transaction SQL on SQLite, real Stripe webhook
signatures (`stripe.webhooks.generateTestHeaderString`) and mocked Stripe API and
AI boundaries. No test makes paid AI calls or charges a payment method.
`npm run check` bundles the actual Worker with Wrangler. `npm run test:d1` also
checks concurrency, settlement and revocation against local workerd/D1.
`npm run dev` uses local D1.

## Configuration

| Name | Kind | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | secret | Upstream AI key. Never leaves the Worker. |
| `STRIPE_SECRET_KEY` | secret | Restricted `rk_test_…`/`rk_live_…` key. Its prefix decides which `livemode` events are accepted. |
| `STRIPE_WEBHOOK_SECRET` | secret | `whsec_…` signing secret of the endpoint registered for this environment. |
| `SALES_ENABLED` | var | `"true"` opens purchases. Everything else returns `SALES_DISABLED`. |
| `STRIPE_PRICE_MONTHLY` | var | Price ID of the US$10 monthly price (1,000 credits). |
| `STRIPE_PRICE_PACK` | var | Price ID of the US$5 one-time price (300 credits). |
| `STRIPE_PORTAL_CONFIGURATION` | var | Optional `bpc_…`; empty uses the account default. |
| `STRIPE_PAYMENT_METHOD_CONFIGURATION` | var | Optional `pmc_…` passed to Checkout; unset uses the Dashboard default payment methods. |
| `ALLOWED_ORIGINS` | var | Comma-separated `chrome-extension://<id>` origins. Firefox origins match by pattern. |
| `DB` | D1 binding | `kareer-staging` / `kareer-production`. |
| `PURCHASE_LIMITER` | rate limit binding | 10 requests per minute per IP for purchase creation and plan selection. |

Public origins (staging and production gateways, `https://kareer.itsamro.me`) and
the support email live only in `src/core/endpoints.js` at the repository root.
Plan prices and credits live only in `src/core/offers.json`. Which gateway an
extension build uses is covered in the root README ("Which Kareer AI gateway a
build talks to").

## Release and production

Deploy the production gateway with `SALES_ENABLED="false"` before clients.
`npm run deploy:production` refuses to deploy while `server/wrangler.toml` still
has `CONFIGURE_…` placeholders in `[env.production]`. The production route uses
the `api.kareer.itsamro.me` custom domain, which needs the `itsamro.me` zone on
Cloudflare (see docs/stripe-setup.md for the DNS alternative).

Record real staging purchase/activation/AI evidence for Chrome and Firefox,
renewal, failed renewal, cancellation, dispute, missed-webhook recovery, key reuse
and representative multi-user costs in `docs/release-checklist.json`. Packages
default to the user's own OpenRouter key until the repository variable
`MANAGED_AI_RELEASE` is `true`; only then does the deploy workflow run the release
gate and build with `--managed`. CI cannot create payment or store evidence.

Cloudflare's disconnect/worker termination can prevent cleanup. A reservation
expires after 150 seconds; stale workers cannot settle it. A completion already
settled remains charged if delivery fails. No automatic uncertain-result retries.
Completed duplicate IDs return status only because outputs are never stored.

## API

All bodies are JSON except the signed webhook (verified on the raw body). Managed
credentials are `Authorization: Bearer <kareer-key>`; claim polling instead uses
its private claim secret in that header, never a URL. Responses use `no-store`.
Status, activation and AI authentication read D1 only; Stripe is called only by
purchase selection, the claim fallback, billing-portal requests and webhooks.

| Route | Input / result |
|---|---|
| POST /v1/purchases | `{}`; private id/claimSecret, hosted plans URL, 24 h claim expiry. Rate limited. |
| GET /plans/:id | Server-rendered offers, terms and consent; no claim or key credentials |
| POST /plans/:id | Same-origin consent form; creates (or reuses) one Stripe Checkout Session and redirects to it |
| GET /v1/purchases/:id | Claim: `pending`, or `complete` with the new key exactly once. Before the webhook arrives it retrieves the Checkout Session from Stripe, at most every 15 s. |
| POST /v1/activate | `{licenseKey}`; local hash lookup, wallet status |
| GET /v1/status | Balances, monthly expiry, dispute flag, subscription status / cancel at period end |
| POST /v1/billing-portal | `{}`; a Stripe customer portal URL for the key's wallet |
| POST /v1/ai | `{id,operation,input}`; processing NDJSON, then settled result or sanitized error |
| POST /webhooks/stripe | Stripe event, `Stripe-Signature` verified with the Stripe SDK |

Operations: `autofill`, `repair`, `optionDiscovery`, `fieldRewrite`, `document`,
`documentRewrite`. Clients send structured application data (fields, options,
profile facts, job context, writing style), never prompts or messages. The Worker
builds every prompt with the same pure builders as the extension's own-key mode
(`src/core/ai-prompts.js`), so the managed gateway cannot be used as a general
chat proxy. Shapes, limits, upstream policy and output validation are in
`src/policy.js`. No client URL, model or provider option is forwarded.

## Payments

- One wallet per Stripe customer. A purchase started from an activated key reuses
  that customer; every paid claim mints a new key for the same wallet.
- Grants are idempotent per payment: `pack:<payment_intent>` and
  `invoice:<invoice>` (`subscription_create` and `subscription_cycle` only). Each
  grant records its PaymentIntent (via the invoice payments API for invoices).
- Every session, invoice and subscription is checked against the configured price,
  quantity 1, exact USD amount, no discount and the key's livemode. A mismatch
  returns 422 and grants nothing.
- Events are deduplicated by event ID. Invoice and subscription events that arrive
  before checkout completion bind through `kareer_purchase` metadata; unknown ones
  return 409 so Stripe retries. Subscription status only moves forward in event time.
- All sales are final. `charge.refunded` still revokes that payment's credits.
  `charge.dispute.created` revokes that payment's credits and flags the wallet
  (no new purchases); `charge.dispute.closed` restores them only when won. The
  subscription is not cancelled by Kareer. Revocation tombstones stop a late grant.
- `invoice.payment_failed` grants nothing; the subscription's `past_due` status
  arrives through `customer.subscription.updated`.

Request metadata, finished purchases and webhook event IDs are cleaned after 30
days by a five-minute schedule; wallets and grants remain for entitlement
accounting. Worker observability is disabled to avoid logging raw request data.
Never add request/body/header console logging.
