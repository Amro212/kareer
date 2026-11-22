# Public store submission material

## Listing

Kareer helps users fill the job application they choose from a local profile,
saved answers and optional AI. Users start Autofill and review the results.
It supports repeatable career history, editable answers and local résumé/cover
letter documents. Review saved, inferred, guessed and unresolved answers. Auto
Submit is off by default. Supported workflows should be demonstrated with test
data; do not promise every ATS, guaranteed accuracy or automatic hiring outcomes.

Local tools are free. New users can try Kareer AI with 20 credits that expire after
30 days. No payment card is required. Paid plans are US$9.99/month for 1,000 credits
per paid billing period or US$4.99 for 300 non-expiring credits. Taxes may apply.
A completed autofill AI request uses 1 credit, generating a résumé or cover letter
uses 3, and rewriting part of one uses 2. A run can make multiple requests. Eligible
credits expiring soonest are used first. Cancel through Manage billing to stop renewal.
Paid monthly credits remain until period end. Purchased credits remain available.
Credits are usage units with no cash value. There are no automatic top-ups. All sales
are final, except where the law requires a refund. Lost keys: email kareer@itsamro.me.

## Data disclosures

- Local: applicant profile, résumé files, generated documents, answers, notes,
  settings and sessions in extension-controlled storage.
- Transmitted for AI: relevant profile/notes/job context and application questions.
  This can include saved contact/location/salary/demographic/disability information
  and the current application URL. The Settings notice explains this before the
  user starts a trial, purchases credits, or activates a key. The extension
  background sends AI requests through the Kareer gateway to OpenRouter and its
  providers. The gateway requests disabled provider data collection. Provider
  retention and terms still apply.
- Persistent gateway data: billing IDs, hashed keys/claim secrets, grants and
  request accounting metadata (IDs/hashes/status/tokens/cost/latency/error codes).
  Request dedupe lasts 30 days. No persisted prompt bodies, outputs or raw keys.
- Payment details go to Stripe Checkout; Kareer stores no card data. Kareer stores
  the Stripe customer, subscription and payment IDs needed to grant credits.
- No advertising, resale of applicant information, or browsing-history analytics.
  Do not claim no backend, no subscription, no remote processing or no metadata.
- Credentials are privileged, excluded from page/content snapshots and backups.
  Kareer keys are reusable bearer credentials, available via Show key in Settings and never
  emailed; no Kareer registration is required.

Privacy URL: https://kareer.itsamro.me/privacy/ . Public security policy and source
are in this repository. Map these flows accurately to each store's current data-use
form, including authentication information, personal information and website
content; don't mark all collection as absent because storage is mostly local.

## Submission and promotion gates

Chrome: use `dist/kareer-chrome.zip`, a verified developer contact, 2FA, real
screenshots with fictional data and the disclosure above. Verify the website's
existing Chrome item ID resolves to a public install after publishing.
Firefox: build with `npm run build:extension -- --production --amo` for a public
AMO submission. Upload `dist/kareer-firefox.xpi` and the matching
`dist/kareer-amo-source.zip`. Include reviewer steps and the build instructions.
The website's existing signed download uses the self-hosted update channel.

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
