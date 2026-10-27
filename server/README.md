# Kareer AI gateway

One Cloudflare Worker and D1. Native Lemon Squeezy receipts, checkout, license keys
and portal supply reusable activation without Kareer accounts. Profiles, files,
ATS execution and exported documents stay local.

## Local checks

Use Node 22.15+ (Node 24 in CI): `npm ci`, `npm test`, `npm run check` in this folder.
Tests run the real migration/transaction SQL on SQLite, plus mocked payment and AI
boundaries. No tests make paid AI calls or charge a payment method. `npm run check`
bundles the actual Worker with Wrangler. `npm run test:d1` also checks concurrency
and settlement against local workerd/D1. `npm run dev` uses local D1.

## Configure staging first

1. Create `kareer-staging` and `kareer-production` with `wrangler d1 create` and set
   their distinct IDs in the matching `wrangler.toml` environment. Placeholder IDs
   are deliberately non-deployable. Apply `wrangler d1 migrations apply DB --env
   staging --remote`, and later repeat for production.
2. Configure a Lemon Squeezy store in test mode with exactly two approved variants:
   US$10 monthly (1,000 credits) and US$5 one-time (300 credits). Enable native
   license generation on both; unlimited/reusable activation, no trial, quantity
   one, no adjustable price, discounts, upgrades or customer quantity controls.
   Use one-month billing and no changes to its billing anchor. Set the staging
   store and variant IDs in config. Live IDs go only in production config.
3. Set `OPENROUTER_API_KEY`, `LS_API_KEY` and `LS_WEBHOOK_SECRET` using
   `wrangler secret put NAME --env staging`. Repeat with distinct live credentials
   for production. For local development use ignored `.dev.vars.staging`. Never
   put keys in checked-in config, the extension bundle, logs or screenshots.
4. Deploy staging with `npm run deploy:staging`; enable staging checkouts by setting
   staging `SALES_ENABLED="true"` only after its sandbox offers are verified.
   Add its Chrome extension origin to `ALLOWED_ORIGINS` (comma separated). Firefox
   assigns a private UUID to each installation, so syntactically valid native
   Firefox extension origins pass this supplementary check. All AI still requires
   an authenticated paid wallet. Browser origins are not payment authentication.
   Missing Origin is accepted for native background/curl clients with credentials.
5. Register `/webhooks/lemonsqueezy` and its signing secret in the matching store.
   Subscribe to order creation/reversals, license creation/updates, subscription
   creation/updates/cancellation/expiry, and subscription payment success/recovery/
   refund/failure. The handler retrieves current provider objects instead of
   trusting an old event's subscription state. Enable provider retries.
6. Build a separate staging client:
   `node tools/build.js --target=extension --staging --gateway=https://YOUR-STAGING.workers.dev`
   from the repository root. Outputs go to `dist/staging/`, never production paths.
   The staging endpoint is compiled in only with the explicit staging switch.
   Keep the extension settings tab open while testing auto-claim. The View plans
   action opens the gateway-hosted offer selector; prices and credit grants come
   from `src/offers.js`, not extension HTML. Email activation is the
   fallback if polling stops, a webhook is missing, or the panel closes.

The gateway uses no custom email service, user accounts, admin dashboard, auto
top-ups, device binding, refunds UI or persistent generation queue.

## Release and production

Deploy the production gateway with `SALES_ENABLED="false"` before clients. Bind
`api.kareer.itsamro.me`; configure production extension origins and the live webhook.
Wrangler's production deploy script is gated by release evidence; initial disabled
deployment is `npx wrangler deploy --env production` after production config review.
It cannot accept purchases while sales are disabled.

Record real staging purchase/activation/AI evidence for Chrome and Firefox,
renewal/failure/cancellation/month-end, missed webhook recovery, key reuse, external
reversal and representative multi-user costs in `docs/release-checklist.json`.
Finish unit/browser/site/build checks and store review. Only then enable production
sales and distribute the managed clients. The existing Firefox update channel is
preserved; Chrome uses its approved Web Store listing. CI cannot manufacture
external payment/store evidence or create credentials.

Cloudflare's disconnect/worker termination can prevent cleanup. A reservation
expires after 150 seconds; stale workers cannot settle it. A completion already
settled remains charged if delivery fails. No automatic uncertain-result retries.
Completed duplicate IDs return status only because outputs are never stored.

## API

All bodies are JSON except signed webhooks (verified on raw UTF-8 bytes). Managed
credentials are `Authorization: Bearer <license-key>`; claim polling instead uses
its private claim secret in that header, never a URL. Responses use `no-store`.

| Route | Input / result |
|---|---|
| POST /v1/purchases | `{}`; private id/claimSecret, hosted plans URL, expiry; no offer selected yet |
| GET /plans/:id | Server-rendered offers, billing terms and consent; no claim/license credentials |
| POST /plans/:id | Native same-origin consent form; validates offer and redirects to hosted payment checkout |
| POST /v1/checkouts | `{offer:"monthly"\|"pack"}`; private id/claimSecret, hosted URL, expiry |
| GET /v1/checkouts/:id | Pending or once-only complete claim; key returned only to background |
| POST /v1/activate | `{licenseKey}`; verified wallet status, missing-event recovery |
| GET /v1/status | Free, provider-reconciled balances, periods, cancellation and portal URL |
| POST /v1/ai | `{id,operation,messages,document?}`; processing NDJSON, then settled result or sanitized error |
| POST /webhooks/lemonsqueezy | Raw provider event, X-Signature HMAC-SHA256 |

Operations: `autofill`, `repair`, `optionDiscovery`, `fieldRewrite`, `document`,
`documentRewrite`. Messages contain only role/content text. Document operations
include kind/source and, for targeted rewrites, current/path for the shared pure
document validator. Limits, upstream policy and validation are in `src/policy.js`.
Every call is constructed from that allowlist; no client URLs/model/provider options
are forwarded. Input limits are bytes, not client-claimed token counts.

Hosted plan selection uses the same checkout record and existing signed webhook /
once-only claim flow; no database migration is needed. The random page ID only
selects a checkout. Claim authentication remains in the background, hashed at
rest, and is never embedded in that URL or HTML. Native forms require explicit
consent and a same-origin POST. Page responses use restrictive CSP, no-store and
same-origin referrers (no referrer to the payment provider). Atomic per-purchase
locks keep concurrent users independent and prevent duplicate checkout creation.
`POST /v1/checkouts` remains available for older clients. Deploy the updated
gateway before distributing this client; keep sales disabled until the existing
external release gates pass. Updating commercial terms still requires coordinated
server policy and payment-variant changes; this is not an arbitrary pricing CMS.

Request metadata is cleaned after 30 days by a five-minute schedule; billing/grants
remain for entitlement accounting. Worker observability is disabled to avoid
logging raw request data. Never add request/body/header console logging.
