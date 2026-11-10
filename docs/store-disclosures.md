# Public store submission material

## Listing

Kareer helps users fill the job application they choose from a local profile,
saved answers and optional AI. Users start Autofill and review the results.
It supports repeatable career history, editable answers and local résumé/cover
letter documents. Review saved, inferred, guessed and unresolved answers. Auto
Submit is off by default. Supported workflows should be demonstrated with test
data; do not promise every ATS, guaranteed accuracy or automatic hiring outcomes.

Local tools are free. Optional managed AI requires payment: US$9.99/month for 1,000
credits per paid billing period, or US$4.99 for 300 non-expiring credits. Taxes may
apply. One completed AI request costs one credit; runs can make multiple requests,
including automatic follow-ups, repairs and rewrites. Monthly credits expire at
period end and are spent first. Cancel through Manage billing (Stripe's customer
portal); the plan stops at the end of the paid month. Paid monthly credits remain
until expiry; purchased credits remain after cancellation. Credits are usage units
with no cash value. No automatic credit purchases or trial. All sales are final,
except where the law requires a refund. Lost keys: email amromousa8@gmail.com. Advanced BYOK remains available
with separate provider charges. The userscript remains advanced BYOK only.

## Data disclosures

- Local: applicant profile, résumé files, generated documents, answers, notes,
  settings and sessions in extension-controlled storage.
- Transmitted for AI: relevant profile/notes/job context and application questions.
  This can include saved contact/location/salary/demographic/disability information
  and the current application URL. Extension AI requires the unchecked-by-default
  data-sharing agreement in Settings; withdrawing it stops new AI requests while
  preserving local filling. All OpenRouter generation paths request provider data
  collection denied; this does not promise zero retention by every service.
  Managed: background → Kareer Cloudflare gateway → OpenRouter/provider. BYOK:
  privileged host → OpenRouter/selected provider. External provider terms apply.
- Persistent gateway data: billing IDs, hashed keys/claim secrets, grants and
  request accounting metadata (IDs/hashes/status/tokens/cost/latency/error codes).
  Request dedupe lasts 30 days. No persisted prompt bodies, outputs or raw keys.
- Payment details go to Stripe Checkout; Kareer stores no card data. Kareer stores
  the Stripe customer, subscription and payment IDs needed to grant credits.
- No advertising, resale of applicant information, or browsing-history analytics.
  Do not claim no backend, no subscription, no remote processing or no metadata.
- Credentials are privileged, excluded from page/content snapshots and backups.
  Kareer keys are reusable bearer credentials, shown once in Settings and never
  emailed; no Kareer registration is required.

Privacy URL: https://kareer.itsamro.me/privacy/ . Public security policy and source
are in this repository. Map these flows accurately to each store's current data-use
form, including authentication information, personal information and website
content; don't mark all collection as absent because storage is mostly local.

## Submission and promotion gates

Chrome: use `dist/kareer-chrome.zip`, developer contact/2FA, real screenshots with
fictional data and the disclosure above. After approval record the real listing URL
in website installation instructions and the checklist; never invent a store ID.
Firefox: preserve the existing `kareer@amro212` self-hosted/unlisted update channel
until a public AMO package/channel is deliberately prepared. A listed submission
needs the appropriate update configuration, source archive and real Firefox host
permission/AI verification; the current unsigned self-hosted XPI is not a public
AMO release.

Current Chrome copy, permission explanations, category mapping, reviewer
instructions and graphic paths: `docs/chrome-web-store.md`. Current blockers and
policy evidence: `docs/store-policy-review.md`. The candidate is not cleared for
submission; do not replace missing live evidence with mock tests or wording.

No submission has been performed by generating this file. Complete
`docs/release-checklist.json` before distributing managed clients or enabling sales.
Launch promotion uses organic demonstrations of tested workflows, activation and
credit spending. No paid-ad, affiliate, referral or promotional-credit systems.

The manual `Prepare store candidate` workflow builds and tests without changing
the public download. It can sign a Firefox candidate using the existing AMO secret
names. For an existing Chrome draft listing, configure `CWS_PUBLISHER_ID` and
`CWS_EXTENSION_ID` variables plus OAuth `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and
`CWS_REFRESH_TOKEN` secrets with the chromewebstore scope. The workflow can upload
the ZIP and optionally request staged review after the staging/production gateway
evidence is recorded. It does not automatically publish the staged item. Initial
listing text/privacy/screenshots must be completed in the developer dashboard;
record its real URL in the website after approval.
