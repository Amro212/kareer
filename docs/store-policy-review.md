# Store policy review — 2026-11-05

**Verdict: not ready to submit.** This is a source/package preflight, not store approval or a guarantee against enforcement. The review covers the current working branch and v0.5.160 candidate, with Chrome first. No public submission, payment, gateway deployment or Firefox signing was performed.

## Policy references checked

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies): single purpose, privacy, Limited Use, least privilege, accurate marketing, working functionality and MV3 self-contained logic.
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local data handling, prominent in-product disclosure and affirmative consent.
- [Remote hosted code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code): inspect dependencies as well as authored code.
- [Tabs API permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs): matching host access permits tab details without the separate tabs permission.
- [Store images](https://developer.chrome.com/docs/webstore/images): required icon/screenshots and promotional sizes.
- [Firefox data-consent taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
- [OpenRouter provider-routing privacy controls](https://openrouter.ai/docs/guides/get-started/sovereign-ai) and [provider retention controls](https://openrouter.ai/blog/insights/zero-data-retention/).

## Fixed locally

| Finding | Change and evidence |
| --- | --- |
| AI setup did not obtain explicit permission for profile/application processing | Settings now displays the recipient/data disclosure and an unchecked agreement. A privileged background record stores the choice. Both the normal proxy and the separate BYOK document-stream path reject new AI requests without it. Existing credentials require agreement too. New unit and browser checks verify no network calls before agreement and after withdrawal. |
| Chrome storage.local was directly accessible to content scripts by default | The background requests TRUSTED_CONTEXTS access before handling messages. A browser regression runs inside the actual extension content-script execution context, confirms direct credential reads are denied, and verifies the panel remains usable. Firefox's unsupported-method path is left intact; this change is not encryption at rest. |
| An initial consent-only transport check prevented a mixed local/AI page from filling saved values | The hydrated status now reports consentNeeded, so the existing local-only route fills saved fields and offers AI setup. The browser regression fills the saved email with sharing off and makes no AI request. Credentials/profile are preserved. |
| Public privacy content did not explicitly cover optional disability context or current application URLs | Added the actual profile/page data types, recipients and Settings controls. Updated date/version. The privacy policy still acknowledges external service retention. |
| Public page lacked the affirmative Chrome Limited Use statement | Added a dedicated Limited Use section and its use/transfer restrictions. This is still a local website change requiring deployment. |
| OpenRouter requests relied on account-level data preferences | Page filling, repairs, rewrites, connection tests, document writing and the managed gateway now request provider.data_collection = deny. This restricts provider routing; it is not a zero-retention promise. Requests may fail when no eligible provider serves the chosen model. |
| Separate tabs permission duplicated existing host access | Removed it from the shared manifest. Packaged Chromium tests verify popup field detection, tab messaging, settings navigation and application filling still work. |
| Firefox's manifest declared fewer categories than the source can transmit | Added healthInfo, financialAndPaymentInfo, locationInfo and browsingActivity beside the existing categories. A targeted packaging regression covers the complete list. |
| Marketing could overstate the product or contradict its settings | New listing/summary lead with choosing an application, running Autofill and reviewing results. Removed the README's unmeasured seconds claim and absolute freeze guarantee. Terms now explain optional Auto Submit without claiming every submission is manual. Defaults and execution settings are preserved: Auto Continue true, Auto Submit false. |
| Production origin was a placeholder despite an existing Chrome draft | Set the exact observed draft extension origin in production Wrangler configuration. No live deployment was made. |

## Package checks and limits

- MV3 package at v0.5.160. Production gateway compiled in; the store package is not the staging build. New installations retain the existing BYOK default.
- Background/content entrypoints and HTML script references resolve inside the package. No externally_connectable declaration, debugger permission, remote script tag or expanded executable CSP was added.
- The reviewed AI paths consume answer values or document text. Field matching/action execution and response handling are packaged. No remote JavaScript execution was found in these paths.
- PDF preview uses the packaged worker, isEvalSupported false and useWasm false. Fonts and relevant third-party license files are packaged.
- Firefox web-ext lint: **0 errors, 28 warnings**, including bundled-library eval/Function and dynamic innerHTML warnings. Lint is not approval. A direct background-bundle scan found two global-object fallback Function constructors and a bundled setImmediate string fallback. They are not evidence of remotely fetched code, but dependency warnings still require reviewer explanation and trust-boundary review. Do not describe the package as having zero eval-like code.
- All three 1280×800 screenshots and both promotional exports are RGB PNGs without alpha; the existing icon is 128×128 RGBA as permitted. Screenshots show real extension UI with fictional data and deterministic mocked AI responses. No ratings, endorsements or hiring guarantees are depicted.

## Submission blockers

1. **Production paid AI is still gated.** The production gateway now responds over HTTPS and the live Stripe webhook destination exists. Sales remain disabled. Install production secrets and verify signed delivery, billing and managed AI before advertising availability.
2. **Live billing is unconfigured/unverified.** Production still has live-price placeholders and SALES_ENABLED false. Staging sandbox scenarios, renewal/dispute cases, Chrome/Firefox purchase/claim/AI and cost-cap evidence remain incomplete in the release checklist. Never substitute staging prices, keys or the staging gateway in a store package.
3. **Updated disclosure and gateway policy are not deployed.** The public privacy page must match the package and dashboard before final certification. The gateway's new provider restriction must be deployed and checked too.
4. **Dashboard still needs the final package and assets.** The old draft was v0.5.117. The saved text predates the final assistant-focused wording. Privacy Save draft was invoked but persistence was not rechecked after the user stopped computer control. New screenshots/promos have not been uploaded.
5. **Publisher verification and final certifications remain.** Confirm contact email and publisher requirements in the dashboard; the three Limited Use certifications need action-time approval. Do not certify an undeployed privacy policy as current.
6. **Reviewer AI access is missing.** Provide a dedicated funded production test credential through private reviewer instructions, never in public files. A reviewer should not need to make a purchase or supply their own personal provider key.
7. **Firefox public listing is a separate release step.** The current Firefox artifact is the existing self-hosted/unlisted channel with update_url. Public AMO distribution needs the appropriate listed package/channel, source upload and real Firefox permission/AI testing. No public AMO listing has been created here.
8. **At-rest secure-handling evidence is unresolved.** The current Chrome User Data FAQ explicitly mentions strong encryption at rest. Kareer persists profiles/credentials with browser storage and documents with IndexedDB; this audit has not established that those stores satisfy that requirement across supported machines. HTTPS, background isolation and a stored hash on the gateway do not establish encryption of local applicant data. Resolve the storage/key-management design or obtain authoritative clarification before treating this gate as passed; do not add cosmetic encryption with an adjacent plaintext key or make an unsupported encryption claim.

## Verification obtained

- 77 focused unit checks covering autofill, managed AI, document requests and packaging passed before the final status-label adjustment. The final workflow/panel/managed/document/packaging run passed 189 checks; the consent/packaging checks passed again after strengthening the state assertion. The additional autofill provider assertion is checked in the final targeted verification recorded in the findings log.
- Final packaged Chromium run: **20/20 passed in 56.4 seconds**, covering all nine managed-AI scenarios, eight shell scenarios, consent/local filling, actual content-script credential isolation and real screenshot capture. Earlier synthetic fixtures were corrected to preserve explicit consent and target the package's compiled gateway. This does not stand in for live payment/provider testing.
- Nine targeted gateway policy/request checks passed. Website typecheck/build and two browser cases covering direct privacy/terms/setup access and no-JavaScript content passed.
- Static package checks and whitespace checks passed. No full extension/browser suite, live charge/provider call, production deployment, physical Firefox run or independent store verdict was performed.

## Positioning to preserve

“Kareer helps you fill the application you choose. You start Autofill, review the answers and control submission.”

Keep automatic settings accurately documented in setup/terms. Avoid autonomous-agent, background job-search or unmeasured outcome claims. Marketing wording alone cannot make a non-working or undisclosed feature compliant.
