# Public store submission material

## Listing

Kareer fills job applications from a local profile, saved answers and optional AI.
It supports repeatable career history, editable answers and local résumé/cover
letter documents. Review saved, inferred, guessed and unresolved answers. Auto
Submit is off by default. Supported workflows should be demonstrated with test
data; do not promise every ATS, guaranteed accuracy or automatic hiring outcomes.

Local tools are free. Optional managed AI requires payment: US$10/month for 1,000
credits per paid billing period, or US$5 for 300 non-expiring credits. Taxes may
apply. One completed AI request costs one credit; runs can make multiple requests,
including automatic follow-ups, repairs and rewrites. Monthly credits expire at
period end and are spent first. Cancel through Lemon Squeezy's portal. Paid monthly
credits remain until expiry; purchased credits remain after cancellation. No
automatic credit purchases, trial or custom refunds workflow. Purchases are
non-refundable subject to rights required by law. Advanced BYOK remains available
with separate provider charges. The userscript remains advanced BYOK only.

## Data disclosures

- Local: applicant profile, résumé files, generated documents, answers, notes,
  settings and sessions in extension-controlled storage.
- Transmitted for AI: relevant profile/notes/job context and application questions.
  Managed: background → Kareer Cloudflare gateway → OpenRouter/provider. BYOK:
  privileged host → OpenRouter/selected provider. External provider terms apply.
- Persistent gateway data: billing IDs, hashed keys/claim secrets, grants and
  request accounting metadata (IDs/hashes/status/tokens/cost/latency/error codes).
  Request dedupe lasts 30 days. No persisted prompt bodies, outputs or raw keys.
- Payment details go to Lemon Squeezy hosted checkout; Kareer stores no card data.
- No advertising, resale of applicant information, or browsing-history analytics.
  Do not claim no backend, no subscription, no remote processing or no metadata.
- Credentials are privileged, excluded from page/content snapshots and backups.
  License keys are reusable bearer credentials; no Kareer registration is required.

Privacy URL: https://kareer.itsamro.me/privacy/ . Public security policy and source
are in this repository. Map these flows accurately to each store's current data-use
form, including authentication information, personal information and website
content; don't mark all collection as absent because storage is mostly local.

## Submission and promotion gates

Chrome: use `dist/kareer-chrome.zip`, developer contact/2FA, real screenshots with
fictional data and the disclosure above. After approval record the real listing URL
in website installation instructions and the checklist; never invent a store ID.
Firefox: keep `kareer@amro212` signed unlisted distribution and the current update
URL. Run the signed artifact on real Firefox and verify host permissions and AI.

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
