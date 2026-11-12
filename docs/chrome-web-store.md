# Chrome Web Store candidate — 2026-11-05

Status: preparation only. Do not submit while the production and review blockers in `docs/store-policy-review.md` remain open.

- Branch at intake: `cursor/stripe-billing-b72d`, `cb0ad26`; working tree was clean, v0.5.156.
- Candidate: v0.5.160, including the local changes documented in the findings log. No commit or deployment performed.
- Existing draft item: `gnbkbdbpajlpclicmapjghpodogkgblf`.
- Publisher ID observed in the dashboard: `0eaa0aa2-5ba7-4738-9bc9-75ee41c51787`.
- Dashboard: https://chrome.google.com/webstore/devconsole/0eaa0aa2-5ba7-4738-9bc9-75ee41c51787/gnbkbdbpajlpclicmapjghpodogkgblf/edit
- Package: `dist/kareer-chrome.zip`, generated with `npm run build:extension -- --production`. Production gateway, BYOK default; no staging package for submission.
- Name: Kareer. Language: English. Existing category: Tools.
- Package summary: Fill job application forms from your saved profile, review AI-assisted answers, and prepare tailored application documents.
- Homepage: https://kareer.itsamro.me/
- Support: https://github.com/Amro212/kareer/issues
- Privacy: https://kareer.itsamro.me/privacy/
- Contact already used publicly by the project: amromousa8@gmail.com. Publisher verification remains pending.

## Description to use after the service is ready

Kareer helps you prepare and fill job application forms from the experience you have already saved.

You choose an application, open Kareer and run Autofill. Review the filled answers, edit anything that needs attention, and decide when to continue or submit.

WHAT YOU CAN DO

• Save contact details, work experience, education, projects, skills and application preferences in a local profile.
• Reuse saved information and answers across supported application forms, including multi-step and embedded forms.
• Use optional AI to draft answers to application questions or rewrite editable text.
• Check source labels that distinguish saved, inferred, guessed, verified and unresolved answers.
• Prepare and edit tailored resumes and cover letters from your saved profile facts, then download PDF or Word documents.

You remain responsible for checking your information. Auto Submit is off by default. Optional continuation and submission settings apply to the application run you start. Website compatibility varies, AI can make mistakes, and no interview or hiring outcome is guaranteed.

LOCAL TOOLS AND OPTIONAL AI

Local profile tools and saved-information filling are free. AI processing is optional and requires your agreement in Settings before profile or application content is sent.

Advanced AI features can use your own OpenRouter API key and model. Your provider charges apply separately.

Optional Kareer AI costs US$9.99/month for 1,000 credits per paid billing period, or US$4.99 once for a pack of 300 non-expiring credits. Taxes may apply. Each completed AI request uses one credit; a run can use several requests, including follow-ups, repairs and rewrites. Monthly credits expire at the end of the paid billing period. Credit packs do not require a subscription. Manage or cancel a subscription through Manage billing. All sales are final, except where the law requires a refund.

YOUR INFORMATION

Your profile, files and application sessions are kept in extension-controlled browser storage. When you enable and use AI features, profile context, application questions, job details and the current application URL are sent to OpenRouter and its AI providers. Profile context can include contact details, location, salary expectations and optional demographic or disability answers you have saved. Kareer AI routes requests through Kareer's gateway, which retains billing and usage metadata. Stripe handles payments. Provider retention policies apply. Kareer does not sell applicant data or use it for advertising or general browsing-history analytics.

Setup: https://kareer.itsamro.me/setup/
Privacy: https://kareer.itsamro.me/privacy/
Support: https://github.com/Amro212/kareer/issues

## Single purpose

Kareer helps a job applicant prepare and complete the application they choose using a locally saved profile, saved answers, application documents and optional AI-assisted answers. The applicant starts the run, reviews and edits filled values, and controls application navigation and submission.

## Permission explanations

### storage

Stores the applicant profile, saved answers, preferences, local application sessions and extension configuration so users can reuse information across applications. Credentials stay in privileged background storage and are excluded from page/content snapshots and backups. Applicant data is not stored in website localStorage or sessionStorage.

### unlimitedStorage

Exempts the extension’s IndexedDB from Chrome’s storage quota and automatic eviction. The database holds user-selected resume files, generated application documents and editable drafts for local editing and reuse.

### webNavigation

Listens for committed navigation, history changes and fragment updates to keep the local application session and embedded form agents aligned with application steps. This supports user-started multi-step form filling and avoids duplicate panel hosts.

### Host access

Employer applications use many domains and cross-origin embedded forms. Website access allows packaged content agents to discover, fill and verify the application fields the applicant uses. Matching host access also provides the tab details needed to select the correct application panel. OpenRouter access supports optional BYOK AI; https://api.kareer.itsamro.me supports optional Kareer AI activation, billing and inference. Profile/application context is sent for AI only after the user agrees in Settings. No general browsing-history analytics or advertising.

The old draft's separate tabs justification becomes obsolete after uploading the new package: that redundant permission has been removed.

The v0.5.160 candidate declares `<all_urls>` in both `host_permissions` and `content_scripts.matches`. The current form helper relies on persistent page access for detection, navigation and embedded forms across sites. A user-clicked implementation with `activeTab` and `scripting` could narrow page access, with separate handling for cross-origin frames and redirects. The AI and billing endpoints only need their own origins. [Chrome review process](https://developer.chrome.com/docs/webstore/review-process) · [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

## Remote code

Select **No**. Packaged scripts contain the form detection, field matching, action execution and output validation. AI returns answer values for known fields or draft document text, not executable JavaScript or a remote command language. Billing returns status data and allowlisted checkout links. Fonts, libraries and the PDF worker are packaged locally. Bundled-library lint warnings still require reviewer notes; do not claim there are no eval-like strings anywhere in dependencies.

## Data usage

These draft selections describe the data paths in the v0.5.160 candidate. Recheck them against the package and services that will actually ship before certifying.

| Select | Reason |
| --- | --- |
| Personally identifiable information | Profile identity, contact and demographic information |
| Health information | The optional Profile → Demographics & disclosures section includes a current or past disability answer. If supplied, it can be included in the profile sent with an AI request once the user starts a trial, buys credits or activates a key next to the disclosure. |
| Financial and payment information | The managed billing service processes Stripe transaction and subscription data. Users enter card details in Stripe-hosted Checkout. |
| Authentication information | OpenRouter/Kareer credentials and activation |
| Location | Optional user-entered address, city, region and country can be included in AI profile context. The extension does not request device geolocation. The purchase gateway uses the request IP to rate-limit checkout creation. |
| Web history | The current application URL and hostname are included in page-answer AI requests. Kareer keeps local records of application pages and does not request browser history access. |
| Website content | Job descriptions, application questions, options and answer text |

Leave Personal communications and User activity unchecked for the implemented collection flows. Kareer does not collect inbox/chat messages or interaction telemetry. Reassess if functionality changes.

The three Limited Use certifications remain for action-time approval in the dashboard. The updated public privacy page must be deployed before certifying the final disclosures.

## Reviewer access and instructions

No Kareer account is needed for local tools. Open Profile, save fictional contact/work records, open an application and run Autofill. Review the result/source labels. Check that Auto Submit starts off and that local filling works without a Kareer key.

For AI review, supply a dedicated funded test Kareer credential through the dashboard's private test-instructions field after the production service is working. Do not require a reviewer to buy credits or provide a personal OpenRouter key, and do not put a credential in this file, screenshots or the public listing. In Settings → AI & billing, the AI-data notice sits next to the trial, plan and activation buttons; activating the supplied key is the reviewer's agreement. Then run the answer/document workflows, and check that removing the key stops AI while local filling keeps working.

Reviewer credential: **not provisioned**. These instructions are incomplete until that is available.

## Graphic assets

All paths are under `docs/store-assets/chrome/`:

- `store-icon.png`: existing packaged 128×128 icon.
- `screenshot-01-autofill.png`, `screenshot-02-profile.png`, `screenshot-03-documents.png`: actual 1280×800 captures of the packaged extension, with fictional applicant/company data.
- `promo-small.png`: 440×280 RGB PNG.
- `promo-marquee.png`: 1400×560 RGB PNG.
- `promo-small-master.png`, `promo-marquee-master.png`: original generated artwork, not store uploads.

Promotional artwork uses built-in image_gen; exact prompts are in `docs/store-assets/prompts.md`. `tools/prepare-store-promos.ps1` resamples masters and validates the required dimensions and absence of alpha. It retains the existing icon.

Capture again after a UI/package change:

```powershell
$env:KR_STORE_ASSETS = '1'
npx playwright test tests/e2e/store-assets.spec.js
```

The capture uses local mock AI responses to make screenshots reproducible. The UI and document rendering are real; captures are not evidence of live model quality or production service availability.

## Dashboard progress

The description and homepage/support links were saved and the dashboard returned Item saved. Permission explanations, data categories and No remote code were entered; Save draft was clicked, but persistence was not rechecked before the user stopped computer control with Escape. The screenshot and promo files have not been uploaded. The package in the dashboard is still the old draft until a later verified upload. The final description above supersedes the earlier saved text to meet the user's request for assistant-focused wording.
