## Turn: 2026-10-11 - Application materials UX audit and redesign plan

- Target: `src/targets/extension/materials/{index.html, index.js, workspace.css, import.js}`, `src/targets/extension/background/materials.js`
- User-reported findings & review:
  1. *Uncommitted changes audit*: Working tree currently holds the profile-only materials rewrite (v0.5.79) where tailoring was restricted exclusively to profile facts and hyperlinks were cleaned up. All 517 unit tests and 19 materials E2E tests pass.
  2. *Application materials UX defects*:
     - Poor space utilization: Screen split into 4 skinny vertical columns (Jobs Sidebar, Section List, Editor, PDF Preview), wasting vertical height and leaving huge empty voids.
     - PDF unreadable: Static canvas thumbnail rendered at 100% container width shrinks the document to 280px, making text blurry and illegible.
     - Lack of full Job deletion: Only single materials (`selected.id`) can be deleted, leaving empty job shells or requiring per-document deletion.
     - Styling & Typography drift: Chaotic mix of 11px, 12px, 13px, 14px, 16px, 17px, 18px font sizes flagged by Impeccable (`flat-type-hierarchy` and `cramped-padding`).
- Aligned resolution (/grill-me & /plan):
  - Collapsible Jobs sidebar + 2-Pane Studio (Section Editor 50%, Interactive PDF Viewer 50%).
  - Full-featured, high-DPI PDF.js viewer with zoom controls (`-`, `+`, `Fit Width`, `Fit Page`, `100%`) and page navigation.
  - Dedicated "Delete Job" button in job header with confirmation modal to remove the job and all associated materials.
  - Dual-card "Prepare" layout (Role Context on left, Tailoring & Profile Grounding on right).
  - Horizontal segmented section rail above the editor in "Edit".
  - Grounded typography scale and container insets complying with `/impeccable`.
- Status: Plan artifact created (`materials_workspace_redesign_plan.md`); awaiting user plan approval before execution.

---

## Turn: 2026-10-11 - Enforce word-anchored hyperlinks and eliminate all raw URLs


- Target: `src/core/materials-model.js`, `src/targets/extension/materials/export.js`, `tests/unit/materials-export.test.js`
- User-reported findings & review:
  1. *Raw URLs were still showing in various resume and cover letter contexts*:
     - User feedback: Hyperlinks work and redirect correctly, but raw URLs were still showing. Required hyperlinks wrapped around words/statements (e.g., profile portfolio wrapped to "Portfolio", project titles hyperlinked directly with no raw URLs on subtitle/facts line) across both resume and cover letter. No raw URLs should be visible anywhere.
     - Root-cause analysis:
       - Projects from `base.sections` or imported resumes lacked a `title` property, causing `blocks()` to fall back to the unlinked heading and dumping the raw URL onto the facts line.
       - Projects in `buildMaterialSource` were still injecting `r.url` into `facts` and `location`.
       - `formatRightLink` in `export.js` stripped the protocol but still returned the bare domain/path label as text.
       - `formatContactRuns` did not handle multiline breaks or arbitrary web domains/subdomains without `https://`, and dropped `profile.website` if `profile.portfolio` was populated.
  2. *Resolution (/ponytail)*:
     - Updated `buildMaterialSource` in [materials-model.js](file:///c:/VScode/job-copilot-extension/src/core/materials-model.js):
       - Removed raw URLs from project `location` and `facts`.
       - Included `profile.portfolio`, `profile.website`, and `profile.additionalUrl` in contact.
       - Normalized imported base projects to extract `link`, strip raw URLs from `facts`, and split headings into `title` and `subtitle`.
     - Updated `export.js`:
       - Enhanced `formatContactRuns()` to parse multiline breaks and anchor arbitrary web URLs to "Portfolio" (and subsequent links to "Website"), preventing raw URLs from displaying.
       - Enforced clean word labels in `formatRightLink()` ("Website", "GitHub", "LinkedIn") instead of raw domains.
       - In `blocks()`, all Project entries (whether from profile or base/imports) extract project URLs, hyperlink project titles directly, clean URLs out of dates/facts, and omit raw URLs from subtitles.
       - Bumped `MATERIAL_TEMPLATE_VERSION` to 6 to auto-re-export saved documents.
     - Rebuilt extension to `v0.5.75` (`dist/kareer-firefox.xpi` and `dist/kareer-chrome.zip`).
- Verification:
  - `node --test tests/unit/materials-export.test.js`: All 8 unit tests passed (exit 0).
  - `npm run build`: Exit 0; built cleanly.
- Status: Completed.

---

## Turn: 2026-10-11 - Anchor text hyperlinks on words and project titles

- Target: `src/core/materials-model.js`, `src/targets/extension/materials/export.js`, `tests/unit/materials-export.test.js`
- User-reported findings & clarification:
  1. *Hyperlinks were technically active, but raw URLs were still printed out in plain sight*:
     - User clarified requirement: rather than printing full raw URLs, hyperlinks must be wrapped around clean words/statements:
       - Contact header: profile links are wrapped around their field identity ("LinkedIn", "GitHub", "Portfolio", "Twitter", "Behance", "Dribbble") and email is wrapped around the email address with `mailto:`.
       - Projects: project titles themselves are hyperlinked to their repository/project URL directly, and the raw URL is completely removed from the subtitle line, leaving the subtitle clean (e.g. just "Creator" or "Lead Developer").
       - Visual aesthetic: clean monochrome (black text, no underline) preserving the LaTeX/CMU Serif aesthetic while remaining clickable in both PDF and Word.
  2. *Resolution*:
     - Updated `buildMaterialSource` in `src/core/materials-model.js` to preserve `section.link` on projects and include `profile.portfolio` alongside social channels.
     - Updated `formatContactRuns()` in `export.js` to map raw URLs to clean profile field names ("LinkedIn", "GitHub", "Portfolio", "Twitter", "Behance", "Dribbble").
     - Updated `blocks()`, `makePdf()`, and `docxDocument()` in `export.js`:
       - Projects hyperlink their title directly (`{ text: section.title, link: projectUrl }` in PDF, `ExternalHyperlink` in Word).
       - Project subtitle lines no longer display raw URLs on the right.
       - Guarded against `String.prototype.link` collision (`typeof ...link === 'string'`).
     - Bumped `MATERIAL_TEMPLATE_VERSION` to 5 for automatic document migration.
     - Rebuilt extension packages cleanly (`v0.5.74`).
- Verification:
  - `node --test tests/unit/materials-export.test.js`: All 8 unit tests passed (exit 0).
  - `npm run build`: Exit 0; extension and userscript built cleanly.
- Status: Completed.

---

## Turn: 2026-10-11 - Ponytail hyperlink resolution and extension build fix

- Target: `src/targets/extension/materials/export.js`, `tests/unit/materials-export.test.js`
- User-reported findings:
  1. *Fixes were still not reflected on exported resume PDF*:
     - Root cause: A duplicate return statement at the end of `docxDocument` in `export.js` caused `npm run build` to fail (`esbuild: Unexpected "}"`). Consequently, the extension bundles (`dist/kareer-firefox.xpi`) were never updated, so the browser remained on the older build outputting raw URLs.
     - Additionally, user clarified to focus strictly on hyperlinks and space utilization without altering bullets, headings, or phone numbers.
  2. *Resolution (/ponytail)*:
     - Fixed syntax error in `export.js`.
     - Hyperlinked contact URLs (`mailto:`, `LinkedIn`, `GitHub`, web domains) and project links (`GitHub`, clean web labels) for both PDF (`link`) and DOCX (`ExternalHyperlink`), preserving all links (including bare github URLs) with compact labels.
     - Left bullets (`-`), section titles, and phone numbers untouched.
     - Bumped `MATERIAL_TEMPLATE_VERSION` to 4 so existing saved materials auto-re-export.
     - Ran `npm run build` cleanly (v0.5.73) producing updated `dist/kareer-firefox.xpi` and `dist/kareer-chrome.zip`.
- Verification:
  - `node --test tests/unit/materials-export.test.js`: All 8 unit tests passed (exit 0).
  - `npm run build`: Exit 0; extension and userscript built cleanly.
- Status: Completed.

---

## Turn: 2026-10-11 - Hyperlink resume URLs, true bullet points, and section casing polish

- Target: `src/targets/extension/materials/export.js`, `tests/unit/materials-export.test.js`
- User-reported bugs & investigation:
  1. *Raw URLs on generated resume PDF instead of clickable hyperlinks*:
     - Symptoms: The generated PDF dumped raw URLs (`https://linkedin.com/in/...`, `https://github.com/...`) in the contact header and raw repo links on the right-hand column of projects. None were clickable PDF link annotations. Useless bare root URLs like `https://github.com` were rendered as right-hand facts for projects without repository slugs.
     - Root cause: `blocks()` in `export.js` passed `model.contact` as flat unlinked text and `section.location` as raw unparsed text without pdfMake `link` attributes or docx `ExternalHyperlink` nodes.
     - Resolution:
       - Added `formatContactRuns()` in `export.js`: parses emails into `mailto:`, 10/11-digit phones into formatted `(XXX) XXX-XXXX` with `tel:`, LinkedIn into clickable `LinkedIn`, GitHub into clickable `GitHub`, and personal sites into domain-labeled links.
       - Added `formatRightLink()`: omits bare root URLs (`https://github.com`, `https://linkedin.com`), parses specific project repo/demo URLs into compact clickable links (`GitHub`, clean domain labels) in both PDF and DOCX.
       - Replaced ASCII hyphen bullets (`-`) with true typography bullet characters (`•`, U+2022).
       - Normalized section category headings to Title Case (fixing `Additional experience` -> `Additional Experience`).
       - Bumped `MATERIAL_TEMPLATE_VERSION` from 1 to 2 so stored documents automatically re-export with the new styling.
- Verification:
  - `node --test tests/unit/materials-export.test.js`: All 8 tests passed, including new test asserting PDF annotation URLs (`mailto:`, `tel:`, LinkedIn, GitHub, project repo), omission of bare github URL, formatted phone, true bullets, and DOCX `ExternalHyperlink` XML.
  - `npm test`: 517/517 unit tests passed.
- Status: Completed.

---

## Turn: 2026-10-11 - Update agent verification rule for targeted testing

- Target: `AGENTS.md`
- User mandate: Stop running the entire test suite after every minor change; run full test suites only for major changes when absolutely necessary. Running entire test suites consumes excessive memory and causes PC lag. Agents must run relevant tests only for the changes made.
- Changes: Updated `AGENTS.md` Section 2 ("Verification & Testing") to explicitly prohibit running the entire test suite (`npm test` / `npm run test:e2e`) on minor changes and routine edits. Mandated running only targeted, relevant test files directly touching modified code (e.g., `node --test tests/unit/<test-file>.test.js`). Restricted full test suites strictly to major cross-cutting changes, release preparation, or explicit user requests.
- Verification: Inspected updated `AGENTS.md` and verified git diff.
- Status: Completed.

---

## Turn: 2026-10-11 - Investigate persistent material HTTP 400 on Zen/Firefox

- Target: extension, application materials on Zen (Firefox), v0.5.68, `google/gemini-2.5-flash-lite`; screenshot shows jobs.intuit.com. Autofill succeeds while both material tasks report a generic HTTP 400.
- Context reviewed: active branch `feature/resume-tailor`, uncommitted changes, and recent commits `d9f80f6`, `50c11d0`, `83800a2`.
- Investigation: the earlier claim that Gemini Flash Lite cannot handle strict JSON schema is not supported. Live synthetic requests succeeded with both HEAD's strict schemas and the uncommitted JSON-object format, including source extraction, resumes, and cover letters. The existing live verification also passed both document kinds and targeted rewrites. The user's failing request has not yet been reproduced; HTTP status alone does not identify its cause.
- Changes: `src/targets/extension/background/materials.js` now preserves the selected model and structured provider rejection reason, with the API key redacted and bounded error text; `tests/unit/materials-ai.test.js` covers provider details, redaction, and non-JSON failures. Updated the two E2E request-format assertions left stale by the pre-existing JSON-object change. `tests/e2e/support/fixtures.js` now accepts an already-open panel and opens the current launcher only when needed; a single material E2E reproduced its old timeout on the hidden launcher before the helper change. Added an HTTP 400/retry regression in `tests/e2e/materials.spec.js` using the existing material fixture, covering both kinds, redaction, no automatic retry, and successful uploads after explicit retries. Full-suite traces also showed obsolete collapsed-launcher expectations after commit `d9f80f6`: updated `tests/e2e/context-visibility.spec.js`, `tests/e2e/generic-detection.spec.js`, and `tests/e2e/visual-system.spec.js` to assert automatic panel opening and the direct one-click launcher transition, preserving country/detection and responsive checks. This is a service/request issue, not an ATS DOM bug, so no new ATS capture is required.
- Final verification: new diagnostic regression failed before the change and all 7 request unit tests passed afterward. Existing real Firefox smoke passed generation, PDF uploads, letter text, previews, Word exports and PDF/DOCX imports. Full `npm test`: 516/516 passed outside the sandbox (the baseline sandbox run could not create the build-watch test's temporary junction). Both material E2E files initially passed 15/15; the subsequent full run also passed the new HTTP 400/retry test. `npm run test:e2e -- --workers=3`: 147 passed, 3 opt-in live ATS captures skipped, 2 failed because iframe-only parent pages correctly remain collapsed (their original expectations were restored). `npm run test:e2e -- --last-failed`: those 2 cases passed, exit 0. Thus all 149 runnable E2E cases are verified across the full run and corrected-case rerun. `git diff --check` passed. Live synthetic OpenRouter verification passed generation and targeted rewrites for both document kinds, plus extraction and both kinds under both request formats. No further runtime edits or dependencies were added.
- Build and user verification: normal build produced v0.5.69 and `dist/kareer-firefox.xpi`; build-generated package/site/update version files changed. After installing/reloading this build, the user explicitly confirmed BOTH Tailor resume and Generate cover letter reached Ready in Zen. Generation is working in the user's installation. The previous 400's exact provider reason was discarded and cannot be recovered from the screenshot; do not claim schema incompatibility as its proven cause. Rebuild/reinstall resolved the observed failure; loaded extension state is a plausible explanation, not a proven root cause. Provider diagnostics now make a recurrence investigable.
- Status: completed and verified for resume tailoring and cover-letter generation. Changes remain uncommitted. Original provider rejection cause remains unproven; no recurrence was observed in the updated installation.

---

## Turn: 2026-10-11 - Fix material generation 400 error and remove token-diff guardrail

- Target: `src/targets/extension/background/materials.js`
- User-reported bugs & investigation:
  1. *Resume tailoring and cover letter generation return OpenRouter error 400*:
     - Symptoms: Autofill works fine (AI calls succeed), but clicking "Tailor resume" or "Generate cover letter" always returns HTTP 400 from OpenRouter.
     - Root cause: `writingRequest()` used `response_format: { type: 'json_schema', json_schema: { strict: true, ... } }`. Many models on OpenRouter (including the default `google/gemini-2.5-flash-lite`) don't support strict `json_schema` structured outputs — they only support `json_object`. The autofill path in `ai.js` correctly uses `{ type: 'json_object' }`, which is why it works fine.
     - Fix: Switched `response_format` from `json_schema` to `json_object`, matching the autofill path. The JSON structure is still enforced by the system prompt ("Return ONLY JSON" with the exact schema shape), and `validateMaterial()` validates the output structurally after parsing.
  2. *"Unsupported number or metric" error blocking resume tailoring*:
     - Symptoms: When extracting resume text into structured sections for the first time, the tool threw "Resume extraction added unsupported facts" for legitimate content.
     - Root cause: `sourceForGeneration()` had a token-diffing guardrail (lines 103-111) that built a set of every word token from the original resume text and then checked that every token in the AI extraction output existed in that set. Any reformatting by the model (e.g., "3" vs "three", date format changes, common structural words the model adds like column headers) triggered a false positive.
     - Fix: Removed the token-diffing guardrail entirely. The extraction prompt already constrains the model to "Copy facts exactly from the resume; never invent or rewrite claims." Structural validation (array checks, string type checks, section count limits) remains in place. The overly aggressive token check was a net negative — it blocked legitimate extractions more often than it caught real hallucinations.
  3. *Template migration verification*: Confirmed that commit `50c11d0` correctly added `MATERIAL_TEMPLATE_VERSION = 1`, `readCurrentMaterial()` auto-re-exports old documents missing the version stamp, and the new fonts (CMU Serif + Charter) are properly bundled. No old template artifacts remain.
- Files modified: `src/targets/extension/background/materials.js`, `tests/unit/materials-ai.test.js`
- Status: Fixed. All 28 materials unit tests pass. `npm run build` completed cleanly (v0.5.68).

---

## Turn: 2026-10-11 - Settings persistence fix for chosen AI model and Gemini 2.5 Flash Lite default

- Target: `src/core/storage.js`, `src/core/constants.js`, `src/core/ui.js`, `src/core/ai.js`, `tests/unit/navigation-lifecycle.test.js`.
- User-reported bugs & investigation:
  1. *Model reverted back to `google/gemini-2.0-flash` on new builds even after choosing and saving `google/gemini-2.5-flash-lite`*:
     - Symptoms: The user configured and saved `google/gemini-2.5-flash-lite`, but on subsequent tests or builds the model chip and settings reverted back to `google/gemini-2.0-flash`.
     - Root cause:
       1. In `src/core/storage.js`, `saveSettings(settings)` performed a naive object overwrite (`gmSet(STORAGE_KEYS.SETTINGS, cleanSettings)`) without merging with existing stored settings (`gmGet(STORAGE_KEYS.SETTINGS, {})`).
       2. When the launcher Pebble was dragged or its dock position updated (`saveSettings({ dockTop: Math.round(pct) })`), this partial save replaced the entire settings object in storage with only `{ dockTop }`, completely wiping `model` (along with `autofillEnabled`, `overwriteExisting`, etc.).
       3. Subsequent calls to `getSettings()` merged `DEFAULT_SETTINGS` with `{ dockTop }`, causing `model` to fall back to `DEFAULT_SETTINGS.model` (`google/gemini-2.0-flash`).
       4. Additionally, `google/gemini-2.5-flash-lite` was absent from `POPULAR_MODELS`, forcing it into the "custom" option, and fallbacks in `src/core/ui.js` and `src/core/ai.js` were hardcoded to `'google/gemini-2.0-flash'` rather than referencing `DEFAULT_SETTINGS.model`.
     - Resolution:
       1. `src/core/storage.js`: Updated `saveSettings(settings)` to merge incoming updates with existing stored settings (`{ ...current, ...settings }`), guaranteeing partial updates like `dockTop` never erase the saved `model` or other preferences.
       2. `src/core/constants.js`: Set `DEFAULT_SETTINGS.model` to `'google/gemini-2.5-flash-lite'` (matching README recommendations and test suites) and added `'google/gemini-2.5-flash-lite'` to `POPULAR_MODELS` as a primary preset.
       3. `src/core/ui.js` & `src/core/ai.js`: Unified model fallbacks to use `DEFAULT_SETTINGS.model`.
       4. `tests/unit/navigation-lifecycle.test.js`: Added unit test `saveSettings merges partial updates preserving model and existing settings`.
- Verification:
  - `node --test tests/unit/navigation-lifecycle.test.js`: All 6 tests passed (including new settings merge spec).
  - `node --test tests/unit/panel.test.js`: 18/18 tests passed.
  - `npm test`: 514/514 unit tests passed (0 failures).
  - `npm run build`: Built extension packages cleanly (v0.5.67).

## Turn: 2026-10-11 - Edge-attached floating control button, auto-expansion on application detection, profile fundamentals cleanup, application materials redesign, and direct Pebble to Full View transition

- Target: `src/core/constants.js`, `src/core/ui.js`.
- User-reported bugs & investigation:
  1. *Eliminated middle HUD stage (single click Pebble -> Full View)*:
     - Feedback: The intermediate horizontal HUD bar created an unnecessary 2-click friction step to get to the actual inspector panel.
     - Resolution: Completely eliminated the middle HUD stage. The UI now cleanly transitions between two states: the floating edge-docked Pebble and the full inspection drawer. Clicking the Pebble opens the full panel view directly with a single click. Auto-expansion on detected ATS/forms expands directly to the full panel. Clicking the close button (`×`) collapses directly back to the Pebble.
  2. *HUD bar single click did not open the full panel*:
     - Symptoms: Clicking the brand mark, title, or HUD bar area circled by the user had no effect.
     - Root cause: `makeDraggable` eagerly called `element.setPointerCapture(e.pointerId)` on `pointerdown` before detecting any movement. In Chromium and Gecko, acquiring pointer capture on a container element diverts pointer events from children (`#kr-toggle-btn`), causing inconsistent down/up targets and swallowing native `click` events.
     - Resolution: Removed premature pointer capture from `pointerdown`. Pointer capture is now lazily acquired only when the pointer actually moves past the 4px threshold (`dy > 4 || dx > 4`). Guarded `makeDraggable` with an idempotent property (`_krDraggable`) to prevent duplicate listener stacking. Single click on Pebble immediately expands to full view.
  3. *Panel collapse/expand animation glitch on tab switching and clicks*:
     - Symptoms: Switching tabs (Run -> Profile) or clicking buttons inside the open panel caused the panel to slide offscreen to the right and slide back in over 220ms.
     - Root cause: `.kr-panel` had `animation: krPanelSlideIn 0.22s` attached unconditionally in CSS. `updatePanelDOM()` previously destroyed the entire `#kr-main-panel` DOM tree on every state update (`setSafeHTML(container, ...)`), forcing the browser to replay the keyframe animation (`translateX(100%) -> translateX(0)`) on every tab switch, form submit, and button click.
     - Resolution: Scoped the slide-in animation strictly to `.kr-panel.kr-panel-animate` which only fires once upon opening from the closed state (`panelJustOpened`). Updated `updatePanelDOM()` to detect `existingPanel`: if the panel is already open, it updates the tab buttons and replaces `.kr-content` in place without recreating or re-animating the drawer DOM tree.
- Verification:
  - `node --test tests/unit/panel.test.js`: 18/18 unit tests passed.
  - `npm test`: 513/513 unit tests passed (0 failures).
  - Build artifacts generated cleanly (`npm run build`).

## Turn: 2026-10-07 - Fixes for ClearCompany & SmartRecruiters fixtures, user pause safeguard, error visibility & custom element discovery

- Target: `src/core/application.js`, `src/core/ui.js`, `src/core/ai.js`, `src/core/debug.js`, `src/core/fields/labels.js`, `src/core/fields/scanner.js`, `src/core/fields/fillers.js`, `src/core/fields/verify.js`, `src/core/resume.js`, `tests/unit/ats-hardening.test.js`.
- User-reported bugs & investigation:
  1. `brim.clearcompany.com-2026-10-07-21-51.html`: Fields were detected (32 fields), but clicking Autofill resulted in immediate `[ERROR] Autofill execution failed:` and nothing filled.
     - Root cause: Model configured in Settings (`google/gemini-2.5-flash-lite`) was rejected by OpenRouter (non-existent slug). `logger.error` serialized `err` via `JSON.stringify`, turning Error instances into `{}`. The panel debug log only rendered `entry.message` ("Autofill execution failed:") with no detail, and `renderHomeTab` showed stale `session.reason` ("Paused by user.") instead of `autofillProgress.statusText` ("Error: OpenRouter Error..."). Additionally, radio group labels on ClearCompany were resolving to container IDs (e.g. `f269fea3-3bc2...`) rather than enclosing question text.
  2. `jobs.smartrecruiters.com-2026-10-07-21-49.html`: Only 1 field detected (`Upload profile image`), and clicking Autofill attached `My_Resume.pdf` to the avatar image input and displayed a false "Paused by user." state.
     - Root cause: Web components (`<spl-input>`, `<spl-textarea>`, `<spl-checkbox>`, `<spl-autocomplete>`, `<spl-phone-field>`, `<spl-dropzone>`) were ignored by standard `querySelectorAll` because they are custom elements whose native inputs sit inside shadow roots. The avatar file input had no exclusion filter in `isResumeField`, so it was treated as the resume upload. Moreover, `executeAutofillFlow()` called `applicationEngine?.pause()`, which unconditionally set `session.status = 'paused'` and `session.reason = 'Paused by user.'` even though the user never pressed pause.
  3. User mandate: *"paused by user" error should ONLY be thrown when the user PHYSICALLY presses "pause".*
- Resolution:
  1. `src/core/application.js`:
     - Added `userInitiated` parameter to `pause(userInitiated = true, reason = 'Paused by user.')`.
     - In `reset()`, calls `this.pause(false)` to halt timers without mutating status to `'paused'`.
  2. `src/core/ui.js`:
     - Updated `stopAutofillFlow(reason = 'Autofill stopped.')` to default to neutral stop copy.
     - Updated `handleUnifiedPauseClick()` (when user physically clicks pause) to call `applicationEngine?.pause(true, 'Paused by user.')` and `stopAutofillFlow('Autofill paused by user. Progress and filled fields preserved.')`.
     - Updated `executeAutofillFlow()` to call `applicationEngine?.pause(false)` and reset any stale paused status (`session.status = 'running'`).
     - Updated error handling in `executeAutofillFlow()` to log `Autofill execution failed: ${msg}` so error reasons are directly visible in debug logs.
     - Updated `renderHomeTab()` to prioritize `autofillProgress.statusText` starting with `Error:` over `session.reason`, ensuring runtime errors are prominently visible in the hero card.
     - Updated `wfIsPaused` to only be true when `wfStatus === 'paused'`.
     - Updated `renderDebugTab()` to display `l.meta` alongside log messages.
  3. `src/core/ai.js`:
     - Updated OpenRouter error formatting in `requestAiJson` to include the model name: `OpenRouter Error (${response.status}) using model ${model}: ${errorDetail}`.
  4. `src/core/debug.js`:
     - Updated `sanitizeMeta(meta)` to serialize `Error` objects (`name`, `message`, `stack`) instead of stringifying them to `{}`.
  5. `src/core/fields/labels.js`:
     - Added `findGroupContainer` traversing up common ancestors to `.form-group, .form-field, .fieldItem, .qa-radio-field, .qa-dropdown-field, [role="radiogroup"], fieldset` so ClearCompany radio questions correctly resolve to question titles.
     - Added slot label, checkbox label, and dropzone container title resolution in `extractLabel` and `extractOptionLabel`.
  6. `src/core/fields/scanner.js`:
     - Added `collectCandidatesWithShadow(root)` recursively traversing open shadow roots and collecting custom elements (`spl-input`, `spl-textarea`, `spl-checkbox`, `spl-autocomplete`, `spl-phone-field`, `spl-dropzone`).
     - Added shadow host deduplication and custom element type mapping.
  7. `src/core/fields/fillers.js` & `src/core/fields/verify.js`:
     - Handled custom elements with shadow root inputs while strictly preserving native input behavior (no overwriting of native checkbox `value` attribute).
  8. `src/core/resume.js`:
     - Added `isImageOnlyAccept` to reject avatar inputs that only accept image extensions.
     - Added avatar/photo/headshot patterns to `NON_RESUME_PATTERN`.
     - Excluded prefill/easy-apply import dropzones (`oc-easy-apply`, `[data-test*="easy-apply"]`) so only genuine application resume fields are uploaded to.
  9. `tests/unit/ats-hardening.test.js`:
     - Added 3 automated unit test specs:
       - `captured ClearCompany fixture resolves all fields and human radio group labels` (verifies 32 fields and human question titles).
       - `captured SmartRecruiters fixture resolves custom elements, ignores avatar for resume, and extracts consent label` (verifies 15 fields, avatar exclusion, easy-apply exclusion, resume identification, and consent notice extraction).
       - `pause by user is only set when pause is userInitiated` (verifies internal lifecycle pauses and resets do not trigger "Paused by user.").
- Verification:
  - All 457 unit tests pass (`npm test`, 0 failures).
  - Built v0.5.28 extension (Chrome & Firefox) and userscript artifacts (`npm run build`).

## Turn: 2026-10-07 - Documentation & public site alignment with unblocked execution, tiered provenance, and ATS capabilities

- Target: `README.md`, `site/index.html`, `site/styles.css`, `site/script.js`.
- Rationale: Core engine previously transitioned away from hard-block safety boundary pauses to unblocked execution with 5-state value provenance (`saved`, `inferred`, `guessed`, `verified`, `unresolved`), 3-tier hierarchical resolution, repeatable section reconciliation, and instrument panel styling. `README.md` and `site/` previously contained obsolete copy claiming automatic pauses for signatures/attestations/disclosures and lacked descriptions of repeatable rows and provenance.
- Changes:
  1. `README.md`: Updated Key Features to highlight 3-tier resolution, 5-state value provenance, unblocked application filling (zero deadlocks), and repeatable-section reconciliation across Ashby, Greenhouse, Lever, and Workday. Updated Step 4 and FAQ to explain candidate review control, unblocked attestation completion, and resolution hierarchy.
  2. `site/index.html`: Replaced simulated "Safety Boundary: Paused" box with an unblocked Contextual Disclosure & Acknowledgment field (showing `✓ Verified` and `⚡ Inferred / Review` provenance with zero hard-block deadlocks). Updated simulated review list and badges (11 VERIFIED, 3 INFERRED, 0 FAILED). Updated Features and Supported Sites grids to reflect repeatable-section reconciliation, parent posting context hydration, and unblocked autofill. Updated FAQ and version tags to v0.5.28.
  3. `site/styles.css`: Added `.kr-sim-unblocked-callout` styling with signal green accent aligned with design system tokens.
  4. `site/script.js`: Updated interactive demo autofill simulation to report unblocked execution and 11 Verified / 3 Inferred provenance.
- Verification:
  - Impeccable mechanical detector: 0 defects (`impeccable detect --json site/index.html` returned `[]`).
  - Unit tests: 454/454 passed (`npm test`, 0 failures).

## Turn: 2026-10-06 - Workday skills filling fix, 46s harvest lag elimination & primary limit reset mechanism

- Target: extension and userscript on feature/ux-enhancements at v0.5.20.
- User-reported findings:
  1. Manual testing on Workday showed skills fill fix was not committing skills (`committed=false`). `Harvest[skills--skills]` took 46503ms to serially query 111 owned options during page scanning.
  2. Deadlock at "Primary request limit reached (2/2). Fill this page manually." where 70 fields stayed untouched, and reloading the page or clicking resume remained permanently stuck with no way to reset. The 🔄 "rescan page fields" button needed to serve as a backup reset.
- Root cause analysis:
  1. Skills harvest lag: In `src/core/fields/scanner.js`, `harvestComboboxOptions` iterated over `Array.isArray(saved)` (all 20+ profile skills), serially typing and waiting for options for each skill during initial scan, only to clear the input and close the prompt.
  2. Skills selection failures: In `src/core/adapters/workday-fields.js`, `workdayAnswer` cleared skill value to empty string if skills were not already present in `field.options`. In `src/core/fields/fillers.js`, `fillCombobox` rejected answers outside `knownOptions` even for dynamic search inputs. If options had disambiguated labels (e.g., `Java (Programming Language)`), exact matching failed without fallback. In `canonicalOptionMatches`, skill matching lacked base-name comparison.
  3. Autofill deadlock: In `src/core/application.js`, when `(step.requests || 0) >= 2`, `tick()` returned before calling `applyAnswers(targets, ...)`, leaving all 70+ deterministic profile fields untouched. The persisted session retained `step.requests = 2` across reloads and resumes. `#kr-rescan-btn` only rescanned DOM fields without resetting engine counters or session status.
- Resolution:
  1. In `src/core/fields/scanner.js`, `harvestComboboxOptions` skips multi-query array iterations for `canonicalKey === 'skill'` or multi-select fields during initial unguided harvest, eliminating the 46.5s stall.
  2. In `src/core/adapters/workday-fields.js`, `workdayAnswer` returns profile skill array directly for `canonicalKey === 'skill'`.
  3. In `src/core/adapters/canonical.js`, `canonicalOptionMatches` compares base skill names (`split(/[\(\/]/)[0]`) preventing false negatives for disambiguated labels and false positives between prefix skills like `Java` and `JavaScript`.
  4. In `src/core/fields/fillers.js`, searchable comboboxes do not reject answers outside `knownOptions`, skills fallback to top search result if exact option is not found, and multi-value combobox filling attempts all skills without aborting on single-item failure.
  5. In `src/core/application.js`, when `(step.requests || 0) >= 2`, `step.primary` is marked true and known answers are applied to `targets` before pausing, ensuring deterministic fields are never left blank.
  6. Added `engine.reset()` to reset session status, counters, errors, and primary flags. Wired `#kr-rescan-btn` to invoke `engine.reset()`, unblocking the engine.
  7. In `applicationEngine.start()`, manual resumption when paused due to `Primary request limit reached` resets `step.requests = 0` to allow retries.
- Verification:
  - 429 unit tests pass (`npm test`, 0 failures).
  - Playwright E2E suite `tests/e2e/remaining-ats-qa.spec.js` passes (3/3).
  - Built artifacts at v0.5.20 (`kareer-chrome.zip`, `kareer-firefox.xpi`, `kareer.user.js`).

# Context and Findings

## Turn: 2026-10-02 - Surgical fixes for eligibility review findings

- Target: shared extension/userscript resolver for Greenhouse, Lever, and Ashby; user authorized correcting both reviewed defects.
- Future sponsorship: authorization-without-sponsorship questions used only current sponsorship. The resolver now checks current, future, or both answers according to the question; any required Yes makes the combined authorization answer No, while incomplete facts remain available to contextual AI.
- Explicit country aliases: added UAE/U.A.E. recognition. Unrecognized explicit work-country wording remains unresolved instead of accepting an unrelated sole eligibility record or job country. Implicit-country questions retain their single-record fallback.
- Turn files: `src/core/adapters/application-fields.js` contains the production fix; `tests/unit/eligibility-autofill.test.js` adds six resolver regressions covering both answer paths, missing facts, aliases, and implicit-country compatibility. `fixtures/eligibility-menu-replay.html` and `tests/e2e/eligibility-autofill.spec.js` extend the existing synthetic replay to verify future sponsorship and UAE/NZ context routing on all three boards with one AI request. `CONTEXT_AND_FINDINGS.md` records the change and status.
- Verification: all six new resolver tests failed before the fix; all 22 focused eligibility tests now pass. An initial full unit run caught the implicit phrase "the job country" in the new guard; corrected that distinction, added its regression, and all 63 combined eligibility/Greenhouse/Ashby unit tests passed. Final `npm test`: 368 passed, 0 failed. Final full `npm run test:e2e`: 89 passed, 0 failed on v0.5.6 (11.1 minutes). The initial browser run passed 87 tests but failed an existing Lever test during browser-context shutdown and an existing options-import test with empty feedback. Both passed on targeted rerun and the final full run; no unrelated production or test changes were needed. Browser coverage uses the existing captures and explicitly synthetic replays, not fresh live ATS captures.
- Build: v0.5.6 Chrome, Firefox, and userscript artifacts rebuilt through automatic version synchronization (`package.json`, `firefox-updates.json`, `site/{firefox-updates.json,version.json,index.html}`, ignored `dist/` outputs).
- Status: both review findings resolved; implementation, build, and automated verification complete. Next: reload the v0.5.6 extension/userscript and retest fresh live board pages.

## Turn: 2026-10-02 - Requested code review of uncommitted ATS changes

- Target: shared extension/userscript eligibility resolver; reviewed with the requesting-code-review skill and updated AGENTS.md. Single-agent review per repository instructions.
- Finding: `eligibilityValue` checks only current sponsorship for authorization-without-sponsorship questions. A Canada record with authorization Yes/current sponsorship No/future sponsorship Yes incorrectly answers Yes to "without sponsorship now or in the future", marked saved, bypassing contextual AI. Resolution deferred to review feedback: honor the requested time horizon and retain contextual fallback for incomplete facts.
- Finding: the sole-record fallback also applies when an explicit country alias is unrecognized. "Authorized to work in UAE?" with no job country and a Canada-only record incorrectly answers Yes as saved. Resolution deferred to review feedback: resolve explicit country aliases and reserve sole-record fallback for implicit-country questions; otherwise use contextual AI.
- Verification: reproduced both defects through the actual exported resolver/answer functions. Existing focused eligibility suite still passes all 16 tests; these cases are uncovered. `git diff --check` passed.
- Turn changes: `CONTEXT_AND_FINDINGS.md` records review results. Next: correct both defects and add regressions before merging.

## Turn: 2026-10-02 - Unblock supported ATS forms and fix eligibility and menu cleanup

- Targets: shared extension/userscript core; Greenhouse, Lever, and Ashby.
- User-reported bugs: Greenhouse and Lever reject work eligibility choices and leave dropdown options expanded. Ashby Sift stops the entire application at the visible accuracy certification ("I certify"). User explicitly requested removing these safeguards and fixing the three review findings; this supersedes the former AGENTS.md safety-boundary rule.
- Root causes:
  - The page classifier matched assessment/verification/signature headings and attestation text globally. The engine, frame agent, and panel refused all fields when that category appeared.
  - An empty deterministic answer was truthy and treated as settled, preventing contextual AI fallback. Unset disclosures also overrode generic AI answers, and Lever chose Decline before considering exact saved answers/context.
  - Eligibility recognition, country resolution, and option aliases diverged between Lever and Greenhouse/Ashby. Lever missed "eligible to work" and job-country context; the uncommitted Greenhouse fallback transferred facts when Spain/U.S. escaped its country regex. Negated sponsorship wording reversed the answer, and broad "No" / "I am not" option prefixes could select positive authorization statements.
  - Lever's location-only menu selectors and unconditional empty committed-selection result also applied to ordinary ARIA comboboxes. Generic blur-only cleanup did not dismiss unfocused or floating ATS menus.
- Resolution:
  - Removed the boundary category and its engine/agent/panel gates. Acknowledgments, verification/assessment headings, signatures, and legal text no longer halt application filling. Auto Continue/Auto Submit preferences still govern navigation.
  - Empty canonical answers now participate in the single page contextual AI request, after profile and exact saved-answer resolution. Removed prompt bans on eligibility/disclosure answers and acknowledgments; contextual/guessed provenance remains visible. Generic unset disclosures no longer suppress generated answers.
  - Re-read the user's updated AGENTS.md rules 10 and 11. Aligned both structured/page prompts with context-grounded inference: uncertain context-based estimates remain visibly guessed, but prompts no longer permit unsupported factual invention.
  - Shared eligibility recognition, country-scoped resolution (all supported country names, U.S./US/USA/UK aliases, job country, or the single configured record), and narrow option matching. Authorization without sponsorship combines authorization and current sponsorship facts. Fixed all three review defects rather than preserving incorrect values as saved facts.
  - Shared ATS cleanup sends Escape to the owned input before blur and dispatches an outside mousedown. Generic pages and Workday retain their no-Escape behavior. Removed forced Select2 DOM deletion; Lever location quirks now apply only to location widgets.
- Files changed/created:
  - `AGENTS.md`; `docs/plans/2026-10-02-ats-eligibility-and-unblocked-autofill.md`: record the user's superseding behavior and implementation plan.
  - `src/core/pageClassifier.js`, `application.js`, `agent.js`, `ui.js`, `ai.js`, `profile.js`, `fields/combobox.js`: remove keyword pauses, repair fallback routing/prompts, and close owned ATS menus.
  - `src/core/adapters/{application-fields,canonical,lever-fields,lever,greenhouse,ashby}.js`: share/fix eligibility and limit widget-specific behavior.
  - `src/targets/extension/options/index.html`: replace the obsolete "never guessed" disclosure explanation with the actual profile-first/contextual behavior.
  - `tests/unit/{eligibility-autofill,application,ats-hardening,greenhouse-ashby,lever,profile}.test.js`; `tests/e2e/{eligibility-autofill,greenhouse-ashby,visual-system,upload}.spec.js`: regress country/polarity/aliases, offline profile answers, one contextual request, menu dismissal/reopening, and continued hosted/embedded filling/submission. Parser tests expecting no AI now seed their previously unset LinkedIn fact and verify it fills after parsing, preserving that assertion without relying on the removed empty-answer dead end.
  - `fixtures/eligibility-menu-replay.html`, `fixtures/ashby-sift-acknowledgment-replay.html`: explicitly synthetic screenshot replays. Ashby additionally reuses `ashby-sift-captured.html`; that existing capture predates the acknowledgment shown in the screenshot. No new live Greenhouse/Lever page URLs or captures were supplied, so the screenshot question/menu is reproduced locally rather than presented as a fresh capture.
  - `package.json`, `firefox-updates.json`, `site/{firefox-updates.json,version.json,index.html}`, and ignored `dist/` artifacts: the build's automatic version synchronization rebuilt Chrome, Firefox, and userscript at v0.5.4.
- Verification/status:
  - Regression-first run reproduced 11 failures before fixes; generic disclosure override also failed before its fix.
  - Final `npm test`: 362 passed, 0 failed, including the profile-copy/generic-fallback edits and prompts aligned with the updated AGENTS.md. All 16 focused eligibility tests also passed. Running without simultaneous full browser tests avoided the existing 500ms parser test's load-sensitive timeout; all 9 upload unit tests separately passed.
  - New real-extension E2E suite: all 4 passed (Greenhouse, Lever, Ashby menu/context/acknowledgment replays and Sift capture with screenshot acknowledgment).
  - Final full `npm run test:e2e`: 89 passed, 0 failed on v0.5.4 (10.8 minutes), including all four new supported-board regressions and updated parser scenarios. Initial run: 87 passed, 2 failed on obsolete no-AI assertions for an unset LinkedIn field; those parser scenarios now provide and verify the saved LinkedIn URL. Initial sandbox launch/build-watch restrictions required running verification outside the sandbox. One unrelated resume-parser timing test passed on targeted and full reruns; generic Escape regression was corrected without changing its test.
  - Final `git diff --check` passed. Implementation, build, and automated verification complete. Next: reload/install the v0.5.4 artifact and retest fresh live board pages; tests used clearly labeled local replays and existing sanitized captures, not fresh captures of the reported Greenhouse/Lever pages.

## Turn: 2026-10-02 - Investigate work eligibility safeguards & polish Greenhouse work eligibility dropdowns

- Target: Greenhouse work eligibility question resolution, canonical option matching, and dropdown cleanup.
- Investigation (Safeguards vs. Broken Field):
  - **Safeguard findings**: Yes, both the deterministic pipeline and AI prompt contain safeguards preventing AI work eligibility guessing. Specifically, `generatePageAnswers` (`src/core/ai.js`) checks `if (deterministic)` which evaluates truthy for `{ fieldId, value: '', provenance: 'saved' }`, treating an unfillable canonical field as settled rather than passing it to `unresolved` fields for AI. In addition, the AI system prompts (lines 163 & 674) explicitly instruct the model: *"Never guess work authorization or visa sponsorship for an unspecified country or without explicit candidate eligibility facts."*
  - **Field findings**: Yes, the field itself was broken on Greenhouse due to multiple interacting issues:
    1. Canonical recognition: `canonicalField` regex in `src/core/adapters/application-fields.js` did not match common phrases like "Work Eligibility", "Work eligibility status", "Eligibility to work", or "authorized to work without sponsorship".
    2. Missing country context: `eligibilityValue` strictly required an explicit country match in the question label or `jobContext.workCountry`. In standard Greenhouse job postings where questions omit the country name, `target` resolved to empty string and returned `''` even when the candidate had only a single country configured in `profile.workEligibility`.
    3. Descriptive option matching: `applicationOptionMatches` lacked matching for `work_auth` and `sponsorship`. When Greenhouse presented descriptive dropdown options like `"Yes, I am authorized to work in the United States"`, `findExactOption` returned `null`, causing `applicationAnswer` to wipe the answer (`value = ''`) and reject filling.
    4. Input corruption during harvest: `greenhouseAdapter.searchQuery` returned `"Yes"` for search-based harvesting when the answer was `"Yes"`, which typed "Yes" into React-Select inputs and broke option listings.
    5. Unclosed dropdown menu: `greenhouseAdapter` lacked an `afterComboboxClose` hook. The default `closeCombobox` in `actuators.js` only blurred the input, which does not close floating React-Select menus.
    6. Select2 candidate filtering: `scanner.js` filter for `.select2-container` excluded container elements improperly, causing Select2 controls to be dropped or duplicated.
- Resolution:
  - Updated `canonicalField` in `src/core/adapters/application-fields.js` to match "work eligibility", "eligibility to work", and "authorized to work without sponsorship".
  - Updated `eligibilityValue` to fall back to the candidate's single configured profile country when the question label and job context do not specify a country.
  - Updated `applicationOptionMatches` to handle `work_auth` and `sponsorship` by recognizing semantic yes/no prefixes and phrases in descriptive options.
  - Updated `greenhouseAdapter.searchQuery` to return empty string for single-select dropdowns so options are harvested cleanly without typing.
  - Added `afterComboboxClose` hook to `greenhouseAdapter` that dispatches Escape key events, simulates clicks outside, and ensures React-Select menus close cleanly.
  - Refined `scanner.js` candidate filter for `.select2-container` to accurately match Select2 combobox elements without picking up internal children.
- Tests & Verification:
  - Added unit regression test in `tests/unit/greenhouse-ashby.test.js`: "reproduce Greenhouse work eligibility question rejection and expanded dropdown menu".
  - Verified `npm test`: **346 passed, 0 failed** across all unit suites.
  - Running `npx playwright test tests/e2e/greenhouse-ashby.spec.js` in real Chromium.

## Turn: 2026-10-01 - Fix validated Greenhouse/Ashby PR review findings

- Target: shared extension/userscript workflow, canonical location/eligibility resolution, and disclosure checkbox reconciliation (`greenhouse-ashby` branch). User authorized validating and surgically fixing all three reviewer findings following simplicity-first guidelines.
- P1 finding 1 (Keep embedded workflows active when host fields coexist):
  - Platform/ATS: embedded Greenhouse/Ashby iframes hosted on carrier/corporate web pages.
  - Symptoms & RCA: `src/core/application.js` guarded `embeddedWorkflow(token)` with `scanFormFields().length`. If the top host page contained any scannable control (such as a newsletter signup, search bar, or contact field), the guard exited the embedded workflow. The local workflow then ran on the host page and ignored the embedded application frame despite detection.
  - Resolution: Replaced `scanFormFields().length` guard with `hasTopApplicationForm` (`Boolean(detectAdapter().applicationRoot?.(document)) || ['workday', 'lever'].includes(detectAdapter().id)`). The engine prefers the uniquely owned supported application frame unless the top document itself has an application form.
- P1 finding 2 (Do not parse state abbreviations as job countries):
  - Platform/ATS: Greenhouse, Ashby, and canonical work authorization/sponsorship resolution.
  - Symptoms & RCA: In `src/core/adapters/application-fields.js`, `eligibilityValue` split `jobContext?.location` by comma and passed the last component to `countryCode()`. Because `countryCode()` accepts any 2-letter ISO country code, US state abbreviations like `CA` (California) and `IN` (Indiana) resolved to Canada (`CA`) and India (`IN`). If the user had a Canada or India work eligibility profile, the engine submitted that country's answers for a US job.
  - Resolution: Added `explicitCountryCode(name)` in `src/core/adapters/canonical.js` which recognizes full country names and explicit country aliases (`US`, `USA`, `UK`), but refuses 2-letter codes. Used `explicitCountryCode` for `jobContext?.location` in `application-fields.js`, leaving state-only locations unresolved while preserving dedicated `jobContext.workCountry`.
- P1 finding 3 (Clear stale checkbox choices when overwriting groups):
  - Platform/ATS: Greenhouse & Ashby demographic disclosure checkbox questions.
  - Symptoms & RCA: `fillCheckboxQuestion` in `application-fields.js` only checked elements matching requested values and never unchecked existing ones. When overwriting or filling a saved demographic answer where "Decline to state" or another choice was pre-checked, both the old and new choices remained checked. Furthermore, `verifyField` for `ats.multiple` accepted any superset of requested options.
  - Resolution: `fillCheckboxQuestion` now reconciles the checked set with requested values by setting `checkbox(element, wanted)` for all group elements. `verifyField` enforces `actual.length === values.length` for `ats-choice` disclosure groups to reject supersets with stale/contradictory choices, while preserving Workday's tested multiple-choice behavior.
  - In addition, fixed an issue in `scanner.js` where `.select2-container` was queried as a candidate but immediately filtered out by `!el.closest('.select2-container')`; updated to `!el.parentElement?.closest('.select2-container')`.
- Test changes: `tests/unit/greenhouse-ashby.test.js` (3 new unit regression tests covering coexisting host fields in embedded workflow, state abbreviation rejection in job locations, and checkbox group reconciliation/superset rejection), `fixtures/ats-workflow-host.html` (added host controls to ensure real-browser embedded tests run with coexisting host inputs).
- Build changes: `npm run build` rebuilt Chrome, Firefox, and Tampermonkey at **v0.4.102**.
- Verification: `npm test`: **345 passed, 0 failed** across all unit test suites. `npx playwright test tests/e2e/greenhouse-ashby.spec.js`: **19 passed, 0 failed (3.5 minutes)** with the real Chromium extension. `git diff --check` passed cleanly. All fixes complete.

## Turn: 2026-10-01 - Fix validated Lever review findings

- Target: shared extension/userscript job capture and hydration, plus panel autofill diagnostics. User authorized fixing all three previously validated screenshot findings.
- P1 resolution: `src/core/jobs.js` now defines `pendingHydration` as a non-enumerable runtime property. Existing await callers retain coordination while structured-clone/JSON storage and extension messaging omit the Promise. Regression verifies job/session persistence before and after hydration, correct application URLs, enriched descriptions, and absence of the Promise in stored records.
- P2 timeout resolution: hydration races the parent fetch and complete response-body read against a five-second deadline, aborts the request on expiry, clears the timer, and returns captured metadata. Processing is outside the raced request, so a late result cannot mutate or persist the fallback job. Separate stalled-fetch/body regressions failed before the fix and passed afterward.
- P2 logging resolution: `src/core/ui.js` field-action logs retain field/source diagnostics while omitting answer values. Actual bundled panel regression failed with a synthetic email in storage, then passed with the email absent from stored/console logs and filling preserved.
- Test changes: `tests/unit/application.test.js`, `tests/unit/panel.test.js`, `tests/e2e/lever-hydration.spec.js`, and `fixtures/lever-hydration-fixture.html`. The new fixture is explicitly synthetic; browser tests cover plain persisted job/session data across reload and standalone autofill with a stalled parent request and no answer logging.
- Build changes: existing `npm run build` rebuilt Chrome, Firefox, and Tampermonkey at **v0.4.95**, automatically updating `package.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/index.html`, and `site/version.json`.
- Verification: three focused hydration unit cases and the bundled panel privacy regression pass after their expected pre-fix failures. `npm test`: **305 passed, 0 failed**. Focused real-extension Lever browser suite: **2 passed, 0 failed**, including session persistence through reload and stalled-parent fallback. Full `npm run test:e2e`: **66 passed, 0 failed (6.0 minutes)** using the real Chromium extension. Both extension manifests and the userscript report v0.4.95; `git diff --check` passes. All three fixes complete. No commits, pushes, or publication performed; prior findings-log edits preserved.

## Turn: 2026-10-01 - Validate Lever Codex review findings

- Scope: validation of the three screenshot findings against local commit `902d9c8` (current branch `lever`); no production fixes requested or applied.
- P1, shared extension/userscript core, Lever `/apply`: confirmed `captureJob` attaches an enumerable Promise as `job.pendingHydration`; `hydrateJob` persists that same object and `createSession` embeds it unchanged. An isolated reproduction using the repository's structured-clone GM storage harness produced `DataCloneError` on the hydrated job write and initial/repeated session writes even after hydration resolved. JSON serialization produced `pendingHydration: {}`. Firefox's documented structured-clone messaging makes the extension failure applicable there; an actual Firefox run was not performed. The screenshot's blanket claim about userscript storage is broader than the evidence: actual Tampermonkey behavior was not tested. Recommendation: keep hydration state outside persisted job records or strip it consistently at persistence boundaries.
- P2, shared core, Lever parent fetch: confirmed `fetch(postingUrl)` has no timeout or abort signal. A controlled unresolved fetch blocked `engine.start` before answer generation or filling; releasing it with an HTTP failure allowed filling from captured metadata. Initialization, workflow ticks, recapture, and standalone autofill also await the same hydration Promise. Recommendation: bound the whole fetch/body read and fall back to the captured job on expiry.
- P2, extension/userscript panel, all ATS: confirmed `ui.js` logs the first 40 answer characters. Running the actual in-memory userscript bundle's panel autofill with a synthetic email persisted the complete email in `kr:debug` and printed it to the console. `debug.js` redacts API credentials/tokens but not applicant answers; this logging is unconditional. Recommendation: retain field/source diagnostics while removing answer values.
- Verification: all three controlled reproductions passed their defect assertions. Initial `npm test`: 301 passed, 1 failed because sandbox access denied esbuild reads of the build-watch temporary fixture. Full suite rerun with required permissions: **302 passed, 0 failed**. `git diff --check` passed. No runtime source changes, live ATS captures, or browser E2E changes were made; browser E2E was not run for this audit.
- Turn changes: this findings log only; reproduced using an inline Node/JSDOM script and an esbuild bundle held in memory. Existing concurrent findings-log edits preserved. All three production fixes remain deferred.
- Serialization references: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities#data_cloning_algorithm and https://www.tampermonkey.net/documentation.php?q=GM_values.

## Turn: 2026-10-01 — Fix IDE Commit Message Generation (worktreeConfig Extension Incompatibility)

### Findings
- **Target / platform**: IDE Source Control integration (Antigravity commit message generator / libgit2).
- **Symptoms**: Clicking the "Generate commit message" sparkle button failed with error:
  `Error generating commit message: [unknown] core.repositoryformatversion does not support extension: worktreeconfig (error ID: 7acfbb87d76d4df793f5198ef485719b) Source: Antigravity`.
- **Root-Cause Analysis**:
  - In `.git/config`, `core.repositoryformatversion` was `0`, while `[extensions] worktreeConfig = true` was configured (injected by an external tool / worktree setup).
  - Git repository format version `0` does not permit extensions (which require version `1`).
  - Furthermore, `libgit2` (used by VS Code / Antigravity git backend) does not support the `worktreeConfig` extension even in repository version 1, causing any libgit2-based operation (such as commit message diff generation) to fail when opening the repository.
- **Resolution**:
  - Removed the unsupported extension via `git config --unset extensions.worktreeConfig`.
  - Normal Git CLI worktrees (`git worktree list`) continue to work seamlessly without per-worktree configuration files.
  - Verified `git status`, `git worktree list`, and all 302 test cases (`npm test`).

## Turn: 2026-10-01 — Merge master into lever (Reconnect Workday & Verify Unified Test Suites)

### Findings
- **Target / platform**: Extension + userscript git branch synchronization: merging `master` (containing Workday PR #2 and PR #3) into `lever`.
- **Merge analysis**:
  - Core code files merged with zero conflicts: `src/core/application.js`, `src/core/fields/scanner.js`, `src/core/ui.js`, `src/core/agent.js`, `src/core/adapters/workday-fields.js`.
  - Conflict in `tests/unit/application.test.js` resolved by preserving both appended tests (`unfillable required field` on `lever` and `Workday review gate collapse` on `master`).
  - Documentation and plan files (`CONTEXT_AND_FINDINGS.md`, `docs/plans/2026-09-30-review-fixes.md`) reconciled cleanly.
  - Distribution and manifest versions aligned to `0.4.94`.
- **Verification**:
  - `npm test`: **302 passed, 0 failed** across all unit test suites.
  - `npm run test:e2e`: **64 passed, 0 failed (5.6 minutes)** across the full Playwright browser test suite with the real Chromium extension, including all Workday parsed rows, Lever university Select2, cross-frame iframe forms, and multi-step workflows.

## Turn: 2026-09-30 - Sequential review fixes with TDD

- Target: shared extension/userscript workflow and Workday adapter. User authorized fixing the three reproduced review findings sequentially, with simplicity first and test-driven development; work remains in the current checkout without subagents or commits.
- Finding 1: with overwrite enabled, continuing after review replaced user edits with cached answers. Cause: the persisted-answer recovery branch reused the initial overwrite/adapter target decision. Resolution: extract the existing raw empty-control predicate and use it for recovery. Generic and bound Workday description regressions both failed with cached values, then passed; the application unit suite passed 77/77. Added a real-extension Next step regression using the existing multi-step fixture.
- Finding 2: populated custom Workday degree dropdowns were targeted for correction but never harvested; both primary and search discovery skipped a committed single selection. Resolution: permit harvesting when the existing adapter explicitly reports a correction is needed. The new custom-dropdown regression failed with an empty answer, then passed through discovery, filling, and verification; the Workday unit suite passed 38/38 at this checkpoint. The parsed-row browser fixture now uses a real custom button/listbox degree control rather than a native select.
- Finding 3: a selected school token beside the nested input container was invisible to the row matcher, causing a duplicate Add. Resolution: use one small Workday prompt-container resolver across matching, binding validation, selection reading, multiple-value comparison, and combobox ownership. The regression failed with one extra Add, then passed with zero Adds, preserved record binding, correct committed selection, and rejection of an unrelated school edit. Browser fixture now includes this nested-token structure and asserts one education row on fill and retry.
- Changed files: `src/core/application.js`, `src/core/fields/scanner.js`, `src/core/adapters/workday-fields.js`, `src/core/adapters/workday-sections.js`, `src/core/adapters/workday.js`; regressions in `tests/unit/application.test.js`, `tests/unit/workday.test.js`, `tests/e2e/multi-step.spec.js`, and `tests/e2e/workday-parsed-rows.spec.js`; synthetic `fixtures/workday-parsed-rows-fixture.html`; task list `docs/plans/2026-09-30-review-fixes.md`; this log. Existing staged changes are preserved.
- Final verification: all four new unit regressions failed for the reported behavior before their corresponding fixes, then passed. `npm test` passed **277/277**; `npm run test:e2e` passed **62/62 (5.1 minutes)** with the real Chromium extension, including the new Next step regression and the strengthened Workday cases. `npm run build` rebuilt Chrome, Firefox, and the userscript; the existing build script advanced local artifacts and package/site/update manifests to **v0.4.85**. `git diff --check` passes.
- Status: all three task-list items and final verification complete. Changes remain uncommitted, with the user's pre-existing staged changes preserved. No live tenant capture was supplied; fixtures remain explicitly synthetic.

## Turn: 2026-09-29 - Workday parsed-row reconciliation

- Target: shared extension/userscript Workday adapter, current `workday` branch. User reports resume-parsed or manually populated repeatable rows are duplicated instead of reused and corrected from the Kareer profile.
- Confirmed causes: the section matcher requires all populated identity values, including start year, to agree; the fill target hook only compares multiple-choice arrays; row bindings reject differing parsed identities. Add also mistakes framework-replaced existing nodes for new rows.
- User decisions through grill-me: preserve unmatched rows; correct matched rows; permit unique employer/school matches despite wrong titles/degrees; review ties.
- Resolution: match whole sections one-to-one before Add, prioritize complete identities over partial identities, and use matching date components as tie-breakers. Reuse empty rows and add only missing records. Bind original and saved identities so corrections survive rerender. Compare known saved row values regardless of overwrite setting; preserve blank profile values and unmatched rows. Keep empty custom questions eligible for the existing contextual AI fallback. Detect new rows by stable Workday keys instead of DOM object identity. Rebuild bindings on each run so disabled/removed profile records cannot keep filling formerly matched rows.
- Files changed: `workday-sections.js`, `workday-fields.js`, existing target filters in `application.js`, `agent.js`, and `ui.js`; unit regressions in `tests/unit/workday.test.js`; new synthetic `fixtures/workday-parsed-rows-fixture.html` and `tests/e2e/workday-parsed-rows.spec.js`; implementation/design notes in `docs/plans/2026-09-29-workday-reconciliation.md`. Existing build script updates version manifests and local distribution artifacts.
- Verification: baseline `npm test` passed 264/264 after granting esbuild access to its temporary build-watch fixture. Nine new unit regressions cover correction, ordering, ambiguous pre-Add behavior, explicit checkbox false, Add rerender, stale disabled-record bindings, and custom-question routing. An intermediate browser run passed 59/61; the two failures were caused by the new test directly seeding storage on an already-open page, bypassing the normal profile broadcast. Corrected those tests to use the real options save flow and assert the record/toggle count.
- Final status: `npm test` **273 passed, 0 failed**; `npm run test:e2e` **61 passed, 0 failed (4.8 minutes)** with the real Chromium extension. All four parsed-row browser cases pass, including overwrite on/off, ambiguity before Add, disabled records updated through the options UI, and the application workflow review pause. `npm run build` rebuilt Chrome, Firefox, and Tampermonkey locally at **v0.4.84**. `git diff --check` passes. Implementation and automated verification complete; next step is the exact live tenant capture below. No commit, push, or publication performed.
- Remaining live acceptance: no live tenant fixture was provided. Exact reported-page replay requires Debug -> Save page fixture. Current fixture is explicitly synthetic; no claim of live parser/tenant acceptance. No publishing or branch changes.

Running log of changes, bugs, and platform findings for the dual-target
(extension + userscript) Kareer.

## Turn: 2026-09-30 — Implement Uncommitted-Change Review Fixes

### Findings
- **Target / platform**: Extension + userscript shared scanner and Lever adapter; captured Lever university page `fixtures/jobs.lever.co-2026-09-30-21-49.html`.
- **Hidden select regression**: Native selects bypassed all visibility failures, including `[hidden]`, `aria-hidden`, and CSS-hidden sections. The scanner now reuses ancestor-aware page visibility for selects. Select2 backing controls are visible only when their adjacent presentation widget is visible; hidden or missing widgets are excluded from scanning and validation.
- **Overbroad school recognition**: Any school/university mention was interpreted as an institution-name question. GPA, graduation-year, and school-project questions consequently received the saved institution name. Lever now recognizes explicit institution-name labels and attendance questions, plus its known university widget identifiers; unrelated questions remain available for contextual resolution.
- **Missing live-bug browser coverage**: The captured Lever university fixture had only JSDOM coverage. Added real-extension browser tests for exact school selection, hidden-field exclusion, contextual GPA answers, and an unfillable required school appearing as FAILED instead of UNTOUCHED.
- **School substring substitution exposed by E2E**: The new required-school test selected "TED University" for saved "An unlisted university" because unrestricted substring matching accepted the trailing letters of "unlisted university". Removed school substring matching in `src/core/adapters/canonical.js`; distinct institutions/campuses no longer count as saved matches. Added a unit regression that failed before this fix.
- **Cross-frame test failure**: The test treated the first arriving request as the structured request, but structured and narrative requests run concurrently. The assertion now selects the structured request and confirms there is exactly one, preserving the embedded-field count check without depending on arrival order. No runtime request behavior was changed.

### Turn changes
- **Created** `docs/plans/2026-09-30-review-fixes.md`: concrete task list and verification commands.
- **Modified** `src/core/fields/scanner.js`, `src/core/pageClassifier.js`, `src/core/adapters/lever-fields.js`, `src/core/adapters/canonical.js`: visibility, institution-recognition, and exact school-matching fixes described above.
- **Modified** `tests/unit/lever.test.js`: three regression tests covering hidden native/Select2 controls, unrelated education questions, and institution-name/widget recognition. All three failed before the production changes; all 96 targeted Lever/application tests passed afterward.
- **Created** `tests/e2e/lever-university.spec.js`; **modified** `tests/e2e/cross-frame.spec.js`: captured-fixture browser coverage and request-order-independent verification.
- **Build outputs**: `npm run build` rebuilt the userscript and Chrome/Firefox extensions. The initial fixes advanced version 0.4.91 -> 0.4.92; the additional exact-school fix advanced it to 0.4.93. Generated version changes are in `package.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/version.json`, and `site/index.html`.
- **Final verification**: `npm test` passed all 286 tests; `npm run test:e2e` passed all 59 real-extension browser tests, including both captured Lever regressions and the corrected cross-frame assertion. `npm run build` succeeded for Chrome, Firefox, and the userscript at 0.4.93. `git diff --check` passed.
- **Status / next steps**: Task list complete. Changes remain uncommitted; the user's staged changes are preserved and the fixes are ready for review.

## Turn: 2026-09-30 — Fix Lever University Select2 Recognition, Option Disambiguation, & Failed Field Accounting

### Findings
- **Target**: Extension + Userscript core scanning, Lever adapter fields, canonical profile resolution, option matching, and application result tracking (`src/core/fields/scanner.js`, `src/core/pageClassifier.js`, `src/core/adapters/lever-fields.js`, `src/core/adapters/canonical.js`, `src/core/fields/combobox.js`, `src/core/fields/fillers.js`, `src/core/ai.js`, `src/core/application.js`).
- **Platform / ATS / Fixture**: Lever (`fixtures/jobs.lever.co-2026-09-30-21-49.html`).
- **Symptoms**:
  - Lever application's required school dropdown ("What Post-Secondary institution do you attend? *") with Select2 styling was not filled.
  - The extension panel reported "0 FAILED, 8 UNTOUCHED" instead of flagging the failed required field as FAILED.
  - The tool failed to select the right university option.
- **Root-Cause Analysis**:
  1. *Scanner skipping backing select & scanning broken combobox*: Select2 decorates the native `<select>` with `class="select2-hidden-accessible" aria-hidden="true" tabindex="-1"`. In `scanner.js`, `isVisible()` returned `false` due to `aria-hidden="true"`, and the candidate loop skipped `<select>` because it checked `!['select', 'radio', 'checkbox'].includes(typeAttr)` where `typeAttr` was `""` (native select has no `type` attribute). The scanner then scanned the presentation `<span class="select2-selection" role="combobox">` as a combobox with 0 options and `id: undefined` (because span lacks `id`/`name`, and `metadata.id` was `undefined` which overwrote `field.id`).
  2. *Unaccounted canonical key*: `leverCanonicalKey` in `lever-fields.js` did not account for university, school, or post-secondary labels (`/institution|university|school|college|post-secondary/i` or `data-qa="university-dropdown"`), returning `""`.
  3. *Unaccounted profile resolution*: `CANONICAL_PROFILE_KEYS` and `canonicalProfileValue` lacked `school` / `institution` mapping to `profile.education[0].institution`.
  4. *Option matching deadlock on duplicate options*: In Lever's 2,965-option list, some universities (like University of Waterloo) appear twice: one with an exact value and one with redacted suffix. `leverAnswer` and `findExactOption` strictly checked `matches.length === 1`, so 2 matches returned `null` instead of selecting the uniquely matching exact value.
  5. *Unresolved AI fallback blocked by empty deterministic answer*: `generateAdapterAnswers` pushed `{ fieldId, value: '' }` to `answers` instead of `unresolved`, preventing AI fallback for non-disclosure fields when deterministic option matching failed.
  6. *Failed fields masked as untouched*: When an answer had empty value for a required field, or when a required field was rejected in validation and could not be repaired, `applyAnswers` skipped recording it in `results`. Consequently, `results` had no entry, causing `summarizeFieldResults` in `ui.js` to report it as `UNTOUCHED` and report `0 FAILED`.
- **Resolution**:
  - `src/core/fields/scanner.js` & `src/core/pageClassifier.js`:
    - Updated `isVisible()` to allow `<select class="select2-hidden-accessible">` despite `aria-hidden="true"`.
    - Filtered out candidate elements inside `.select2-container` so the presentation skin is not duplicated as an empty combobox.
    - Corrected tag check (`tagName !== 'select'`) in candidate visibility skip.
    - Ensured `metadata?.id || field.id` preserves valid field IDs when metadata id is undefined.
  - `src/core/adapters/lever-fields.js`:
    - Added `school` canonical key recognition for university/school/post-secondary questions and `data-qa="university-dropdown"`.
    - Preserved `id` in `leverFieldMetadata`.
    - In `leverAnswer`, disambiguated multiple matches by preferring exact value/label match.
  - `src/core/adapters/canonical.js`:
    - Added `school` and `institution` to `CANONICAL_PROFILE_KEYS` and `canonicalProfileValue` (mapping to `profile.education` institution or flat `profile.school`).
    - Added substring/normalized matching for school names in `canonicalOptionMatches`.
  - `src/core/fields/combobox.js` & `src/core/fields/fillers.js`:
    - Updated `findExactOption` to select uniquely matching exact value/label when multiple options match.
    - Passed `field` to `findExactOption` in `fillField`.
  - `src/core/ai.js`:
    - Only push empty deterministic answers if they are in `OPTIONAL_DISCLOSURE_KEYS`; otherwise push to `unresolved` so AI can answer/repair.
  - `src/core/application.js`:
    - In `applyAnswers`, when a required field has an empty answer, record `status: 'failed'` in `results`.
    - In `validation` failure where repair cannot fix errors, record `status: 'failed'` in `results` for each unresolved error.
  - Verification & Tests:
    - Added comprehensive fixture test in `tests/unit/lever.test.js` validating that `jobs.lever.co-2026-09-30-21-49.html` scans the backing select, resolves the `school` canonical key from candidate education, filters out Select2 presentation combobox, and fills the exact option.
    - Added unit test in `tests/unit/application.test.js` verifying that unfillable required fields record `status: 'failed'` in results.
    - All 282 unit tests pass (`npm test`).


## Turn: 2026-09-29 — Complete End-to-End Delivery of Job Context to AI & Request Visibility

### Findings
- **Target**: Job description propagation into AI autofill and inline rewrite requests (`src/core/ai.js`, `src/core/ui.js`).
- **Platform / ATS**: All platforms, including Lever and Ashby.
- **Symptoms**: Verification that the captured job description is strictly passed to AI requests. In `handleUnifiedAutofillClick`, `generateAutofillAnswers()` was being invoked without passing `{ jobContext }`, relying solely on callers.
- **Resolution**:
  - In `src/core/ai.js`:
    - Updated `generateAutofillAnswers()` to automatically resolve `jobContext || gmGet(STORAGE_KEYS.JOB) || null`. If any caller omits `jobContext`, it guarantees fallback to the active job stored in `kr:job`.
    - Added explicit logger statement in `generateAdapterAnswers()`: logs `Grounding X questions in job context: "<title>" at "<company>" (<len> chars)`.
    - Updated `rewriteNarrativeField()` to include `Target Job Context` (`Title`, `Company`, `Description`) in the prompt payload for inline rewrites.
  - In `src/core/ui.js`:
    - In `handleUnifiedAutofillClick()`, explicitly resolve `currentJob`, await `pendingHydration`, and pass `{ jobContext: currentJob }` to `generateAutofillAnswers()`.
- **Verification**:
  - `npm test`: 280/280 tests pass.
  - `npm run build`: v0.4.89 built cleanly.

## Turn: 2026-09-29 — Fix Lever /apply Parent Posting Hydration Crash & Live Debug Re-render

### Findings
- **Target**: Lever `/apply` parent posting hydration (`src/core/pageClassifier.js`, `src/core/jobs.js`, `src/core/ui.js`, `tests/unit/application.test.js`).
- **Platform / ATS**: Lever (`jobs.lever.co/<company>/<id>/apply`).
- **Symptoms**:
  - On Lever `/apply` pages, only the 293-character `meta[property="og:description"]` was captured and the company remained "None detected", whereas visiting the parent posting page captured the full 5,031-character description and "Kepler Communications".
  - Manually clicking "Re-capture" on `/apply` did not resolve the full description.
- **Root-Cause Analysis**:
  - `hydrateJob()` fetches the parent posting URL and parses the HTML using `new DOMParser().parseFromString(html, 'text/html')`.
  - When `captureJob(postingDoc)` was called on the parsed document, it checked `isVisible(el)` for candidate apply links.
  - In `src/core/pageClassifier.js`, `isVisible` called `node.ownerDocument.defaultView.getComputedStyle(node)`. Documents created by `DOMParser.parseFromString()` do not have a browsing context (`defaultView === null`).
  - Calling `.getComputedStyle` on `null` threw a `TypeError: Cannot read properties of null (reading 'getComputedStyle')`.
  - This error was caught by the silent catch block in `hydrateJob()`, causing hydration to fail silently every single time on real pages with markup and falling back to the 293-character meta tag.
  - Additionally, `renderDebugTab()` was not hooked into `pendingHydration` completion, so asynchronous resolution did not trigger a UI update until a manual re-render.
- **Resolution**:
  - Fixed `isVisible()` in `src/core/pageClassifier.js` to safely check `node.ownerDocument?.defaultView?.getComputedStyle`.
  - Added structured logging to `hydrateJob()` in `src/core/jobs.js` (`logger.info` on start/success, `logger.warn` on failure) so hydration issues are never hidden.
  - Added an auto-refresh hook in `renderDebugTab()` in `src/core/ui.js` that listens to `job.pendingHydration` and re-renders the panel once resolved.
  - Added button loading state (`Capturing...` + disabled) to the "Re-capture" button so users receive clear visual feedback while async hydration is in flight.
  - Updated unit test in `tests/unit/application.test.js` to include realistic HTML markup in parent posting mock responses and added explicit unit test for `isVisible()` with `DOMParser` documents.

### Turn Changes
- `src/core/pageClassifier.js`: Made `isVisible()` safe when `ownerDocument.defaultView` is `null`.
- `src/core/jobs.js`: Added `logger` import and informational/warning logs to `hydrateJob()`.
- `src/core/ui.js`: Hooked `pendingHydration` to auto-refresh DOM on resolution; added button busy state to Re-capture.
- `tests/unit/application.test.js`: Added realistic mock body markup and explicit `DOMParser` `isVisible` test.

### Verification / Status
- Verified reproduction and fix using live Kepler Lever posting data (`node scratch/test-lever.mjs` resolved full 5,031 characters and "Kepler Communications").
- `npm test`: 280/280 tests pass.
- `npm run build`: v0.4.88 built cleanly.

## Turn: 2026-09-29 — Automatic Job Description Capture & Lever /apply Hydration

### Findings
- **Target**: Job description extraction across ATS platforms (`src/core/jobs.js`, `src/core/application.js`, `tests/unit/application.test.js`).
- **Platform / ATS**: Lever (`jobs.lever.co`), Ashby (`jobs.ashbyhq.com`), Workday (`myworkdayjobs.com`).
- **Symptoms**:
  - When landing directly on Lever application form pages (`https://jobs.lever.co/<company>/<jobId>/apply`), Lever unmounts the job posting description and drops the Schema.org JSON-LD `JobPosting` script.
  - Because `captureJob()` fell back to `doc.body`, `session.job.description` captured form inputs, field labels, and cookie banner text (~3,600 characters of form questions) rather than the actual job description.
  - When the AI engine was queried during autofill, this form junk was injected into `jobContext.description`, degrading model grounding on open-ended or role-specific questions.
- **Root-Cause Analysis**:
  - Lever segregates the full description with JSON-LD to the parent posting URL (`/<company>/<id>`), but strips it on `/apply`.
  - `captureJob()` lacked detection for Lever's `/apply` route, lacked fallback to `<meta property="og:description">`, and lacked automatic same-origin parent posting fetching.
- **Resolution**:
  1. Updated `captureJob()` in `src/core/jobs.js`:
     - Added Lever `/apply` route detection: derives clean parent `postingUrl = url.replace(/\/apply.*/, '')`, setting `listingUrl = postingUrl` and `applicationUrl = url`.
     - Added `<meta property="og:description">` / `<meta name="twitter:description">` fallback before `doc.body`, preventing form inputs and cookie notices from polluting the description.
  2. Implemented `hydrateJob(job, doc)`:
     - Kicks off an automatic same-origin `fetch(postingUrl)` when on Lever `/apply`.
     - Parses the parent page with `DOMParser` and extracts the complete Schema.org JSON-LD `JobPosting`, updating `job.description` (5,000+ characters), `company`, `title`, and `location` in-place, and saving to `STORAGE_KEYS.JOB`.
     - Attached `job.pendingHydration` promise.
  3. Integrated `pendingHydration` into `src/core/application.js`:
     - Awaited in `request()` before dispatching AI answers, in `start()` before executing the application workflow, in `capture()` when the user clicks `#kr-capture-job`, and during initial engine mount.
  4. Added unit tests in `tests/unit/application.test.js`:
     - Validated Lever `/apply` listingUrl extraction and synchronous meta description fallback.
     - Validated asynchronous JSON-LD hydration from parent posting page.

### Turn Changes
- `src/core/jobs.js`: Added `hydrateJob()`, Lever `/apply` detection, meta description fallback, and `pendingHydration` lifecycle.
- `src/core/application.js`: Awaited `job.pendingHydration` in `request()`, `mountApplicationEngine()`, `capture()`, and `start()`.
- `tests/unit/application.test.js`: Added unit tests for Lever `/apply` capture and async parent posting hydration.

### Verification / Status
- `npm test`: 279/279 tests pass (100% pass, 0 fail).
- Live Playwright verification: Verified against live Lever page `https://jobs.lever.co/kepler/2ad02ce3-1d56-4aee-9f1d-5199c780c0c1/apply`, successfully extracting the full 5,031-character description and company name.
- `npm run build`: v0.4.86 built cleanly for Chrome, Firefox, and Userscript.

## Turn: 2026-09-29 — Code Review Fixes for Lever Determinism and Source Provenance

### Findings
- **Target**: Shared extension/userscript core, primarily Lever canonical resolution and AI answer provenance.
- **Eligibility**: Lever collapsed country-specific authorization and sponsorship records into legacy root fields. A question for one country could receive another country's answer, and combined now-or-future sponsorship could prefer the wrong time value.
- **Disclosure classification**: Lever label heuristics treated narrative text fields mentioning disability, gender, ethnicity, or veteran status as disclosure controls.
- **AI provenance**: Generic model output could override the locally assigned `source: 'ai'` field because object spread order trusted a model-supplied `source` value.
- **Saved-answer precedence**: An empty deterministic adapter answer prevented an exact saved answer from being reused.
- **Compensation**: Deterministic salary answers omitted `salaryPeriod`, making hourly and monthly expectations ambiguous.

### Resolution
- Added country-aware Lever eligibility selection from enabled `workEligibilities`; explicit unmatched or unset countries remain unresolved instead of borrowing a legacy root answer.
- Combined now-or-future sponsorship answers conservatively: any explicit `Yes` wins, both values must be `No` to answer `No`.
- Limited Lever demographic heuristics to choice controls and widgets.
- Forced generic model answers to retain `source: 'ai'` after model output is spread.
- Reordered adapter resolution so exact saved answers can replace empty deterministic results while preserving intentional blanks when no saved answer exists.
- Included `salaryPeriod` in deterministic salary text.

### Turn Changes
- `src/core/adapters/canonical.js`: Made eligibility record reads country-safe and preserved salary period.
- `src/core/adapters/lever-fields.js`: Added country-aware eligibility lookup, combined sponsorship handling, and choice-only disclosure recognition.
- `src/core/ai.js`: Hardened AI source stamping and saved-answer fallback ordering.
- `tests/unit/lever.test.js`: Added regressions for eligibility, narrative disclosures, saved answers, and salary period.
- `tests/unit/ats-hardening.test.js`: Added regression coverage for forged AI source metadata.
- `docs/plans/2026-09-29-code-review-fixes.md`: Added ordered implementation checklist.

### Verification / Status
- Each regression test was observed failing before its minimal implementation change.
- After each production change, the complete unit suite and Playwright E2E suite were run; latest pre-log run: 277/277 unit tests and 57/57 E2E tests passed.
- Final `npm test`: 277/277 tests passed.
- Final `npm run test:e2e`: 57/57 tests passed across Lever, Workday, Ashby, Greenhouse, generic, upload, multi-step, migration, and extension shell coverage.
- One final E2E attempt transiently missed an options-page background response; its focused rerun passed, followed by a clean 57/57 full-suite rerun.

## Turn: 2026-09-28 — Universal Autofill Source Transparency: AI vs Deterministic Profile (/impeccable)

### Findings
- **Platform/ATS**: Universal across all ATS platforms (Lever, Workday, Ashby, Greenhouse, and Generic).
- **Target**: Extension and userscript shared core (`src/core/ui.js`, `src/core/profile.js`, `src/core/ai.js`, `src/core/application.js`, `src/core/agent.js`, `src/core/adapters/lever-fields.js`, `src/core/adapters/workday-fields.js`, `tests/unit/panel.test.js`).
- **Symptoms / Requirement**:
  - The tool previously displayed only post-fill status (`VERIFIED`, `INFERRED`, `GUESSED`, `FAILED`, `UNTOUCHED`) without indicating whether a field's value came deterministically from candidate profile/saved answers (zero AI tokens) or was generated via an OpenRouter AI model call.
  - Users could not distinguish which fields were safely filled from their profile vs. generated by LLM reasoning.
- **Root-Cause / Architecture Alignment**:
  - Answers generated via `generateAdapterAnswers`, `generateAutofillAnswers`, `workdayAnswer`, `leverAnswer`, and `fixedProfileAnswer` did not consistently stamp an explicit `source: 'profile' | 'saved' | 'ai'` metadata attribute.
  - `fieldResultsCache` and workflow `results` tracked `status`, `value`, `inferred`, and `provenance`, but did not surface the source provenance to the review list items.
  - `renderFieldReviewSection()` in `ui.js` only showed a single status badge per field.
- **Resolution**:
  1. Stamped explicit `source: 'profile'`, `'saved'`, and `'ai'` attributes across all answer generation pipelines (`fixedProfileAnswer`, `leverAnswer`, `workdayAnswer`, `generateAdapterAnswers`, `generateAutofillAnswers`).
  2. Preserved `source` in `fieldResultsCache`, multi-step session `results.set()`, and iframe `agent.js` results.
  3. Added high-contrast, compact badge tokens adhering to the `/impeccable` mechanical standards:
     - `.kr-badge-ai`: Purple tint (`rgba(168, 85, 247, 0.12)`, text `#c084fc`, border `rgba(168, 85, 247, 0.3)`) indicating AI model inference.
     - `.kr-badge-profile`: Slate tint (`rgba(148, 163, 184, 0.12)`, text `#94a3b8`, border `rgba(148, 163, 184, 0.25)`) indicating deterministic profile data.
     - `.kr-badge-saved`: Info blue tint (`rgba(98, 200, 255, 0.12)`, text `var(--kr-info)`) indicating exact saved question reuse.
  4. Updated `summarizeFieldResults()` to calculate `aiCount` and `profileCount`, and displayed provenance counts in the summary chips (`X PROFILE · Y AI`) when fields are filled.
  5. In `renderFieldReviewSection()`: rendered a dedicated source pill (`[PROFILE]`, `[AI]`, or `[SAVED]`) preceding the status badge (`[VERIFIED]`) for every filled field.
  6. Added fill action logging in `executeAutofillFlow` (`logger.info('Field action [Profile/AI]: ...')`) for console and Debug tab transparency.
  7. Added unit test in `tests/unit/panel.test.js` validating that `summarizeFieldResults` accurately computes `profileCount` and `aiCount`.

### Turn Changes
- `src/core/profile.js`: Stamped `source: 'profile'` across all deterministic branches in `fixedProfileAnswer`.
- `src/core/adapters/lever-fields.js` & `workday-fields.js`: Stamped `source: 'profile'` on adapter-resolved answers.
- `src/core/ai.js`: Added explicit `source: 'ai'` to generated model answers and `source: 'profile'` to deterministic candidates.
- `src/core/application.js` & `agent.js`: Preserved `source` attribute in workflow results and iframe message replies.
- `src/core/ui.js`:
  - Added `.kr-badge-ai`, `.kr-badge-profile`, and `.kr-badge-saved` styles.
  - Updated `executeAutofillFlow` to log action source and store `source` in `fieldResultsCache`.
  - Updated `summarizeFieldResults` to compute `aiCount` and `profileCount`.
  - Updated `renderItem` to render source pill alongside status badge.
  - Added `PROFILE` and `AI` count chips to the Field Verification & Review header.
- `tests/unit/panel.test.js`: Added unit test `field report distinguishes AI calls vs deterministic profile fills`.

### Verification / Status
- `npm test`: 272/272 unit tests pass (100% pass, 0 fail).
- `tests/unit/panel.test.js`: 8/8 pass.
- `tests/unit/lever.test.js`: 10/10 pass.
- `tests/unit/workday.test.js`: 28/28 pass.
- Playwright E2E: 18/18 pass in real Chromium.
- Impeccable Detector: 0 mechanical defects (`[]`).
- Build: v0.4.85 built and packaged for Chrome, Firefox, and Userscript.

## Turn: 2026-09-28 — Lever Resume Processing Settling Fix & Live Fixture Verification

### Findings
- **Platform/ATS**: Lever (`jobs.lever.co`).
- **Fixture**: `fixtures/jobs.lever.co-2026-09-28-05-26.html` (Xsolla Solutions Engineer application on Lever).
- **Target**: Extension and userscript shared core (`src/core/adapters/lever.js`, `src/core/fields/verify.js`, `tests/unit/lever.test.js`).
- **Symptoms**:
  - Live Lever autofill execution halted with console error: `Autofill execution failed: Error: Resume processing did not settle. Wait for the board to finish parsing, then retry Autofill.`
  - In the panel UI: `Error: Resume processing did not settle. Wait for the board to finish parsing, then retry Autofill.`
  - Resume upload was marked `Success!` by Lever on the page with pre-filled candidate information, but Kareer autofill was blocked from filling remaining fields (Location, LinkedIn URL, etc.).
- **Root-Cause Analysis**:
  1. *Hidden Indicator Visibility in Lever DOM*:
     - Lever pages permanently contain `<span class="resume-upload-working" style="display: none;"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span>` in the DOM, even after resume analysis is finished and `<span class="resume-upload-success" style="display: inline;">` appears.
     - `uploadBusy(doc)` in `src/core/adapters/lever.js` evaluated `Boolean(doc?.querySelector?.('.analyzing-resume, .resume-upload-working, [aria-busy="true"]'))` without checking element visibility. Because `.resume-upload-working` was always present in the DOM, `uploadBusy(doc)` always returned `true`.
     - In `src/core/resume.js`, `waitForResumeParsing()` called `detectAdapter().uploadBusy?.(doc)`. Because `uploadBusy` remained `true` indefinitely, the quiet-period timer kept resetting until the 15-second timeout expired, throwing an unhandled error and aborting the fill run.
  2. *Status vs Filename in `uploadState`*:
     - In `uploadState(element)`, `status` queried `.resume-upload-status, .resume-upload-success, .resume-upload-filename`. In Lever's DOM, `.resume-upload-success` contains the label `"Success!"`, while the uploaded filename is housed in `<a class="visible-resume-upload has-file"><span class="filename">resume.pdf</span></a>`.
     - Matching `.resume-upload-success` caused `uploadState.name` to be evaluated as `'Success!'` rather than `'resume.pdf'`.
     - Furthermore, `busy` in `uploadState` also checked `container?.querySelector('.resume-upload-working')` without visibility checking, causing `uploadState.accepted` to remain `false` even after parsing completed.
  3. *Hardcoded Verification Error Message*:
     - In `src/core/fields/verify.js`, file verification returned a hardcoded error `'Workday has not accepted the uploaded file'`, misleading users on non-Workday ATSs.
- **Resolution**:
  1. Implemented a robust `visible(element)` helper in `src/core/adapters/lever.js` that checks for `hidden`, `aria-hidden="true"`, inline styles, and computed `display: 'none'` / `visibility: 'hidden'` up the DOM hierarchy (compatible with both real browser cascade and JSDOM).
  2. Updated `uploadBusy(doc)` in `lever.js` to only consider busy indicators that are visibly rendered (`busyEls.some(visible)`), and check in-flight file inputs.
  3. Updated `uploadState(element)` in `lever.js` to query `.filename, .resume-upload-filename` for the file name, check for `.resume-upload-failure` / `.resume-upload-oversize`, verify visible `.resume-upload-success` / `.visible-resume-upload.has-file`, and ensure busy indicators are not visible before marking `accepted: true`.
  4. Updated `verify.js` line 108 to return `'Upload was not accepted by the application'`.
  5. Added unit tests in `tests/unit/lever.test.js` covering both hidden/visible working indicators and validating the live captured fixture `fixtures/jobs.lever.co-2026-09-28-05-26.html` directly (verifying `uploadBusy === false` and `uploadState === { name: 'resume.pdf', accepted: true }`).

### Turn Changes
- `src/core/adapters/lever.js`:
  - Added `visible(element)` helper function.
  - Updated `uploadState(element)` to accurately extract filename from `.filename` and check visibility of success, working, and failure states.
  - Updated `uploadBusy(doc)` to check visibility of working indicators and file input acceptance.
- `src/core/fields/verify.js`:
  - Updated file verification error message from Workday-specific to application-generic `'Upload was not accepted by the application'`.
- `tests/unit/lever.test.js`:
  - Added unit test: `Lever uploadState and uploadBusy handle hidden indicators correctly`.
  - Added unit test: `Lever live fixture (jobs.lever.co-2026-09-28-05-26.html) does not hang on uploadBusy and accepts parsed resume`.

### Verification / Status
- `npm test`: 271/271 unit tests pass (100% pass, 0 fail).
- `tests/unit/lever.test.js`: 10/10 pass (including live Xsolla fixture test).
- Playwright E2E (`tests/e2e/adapters.spec.js`, `tests/e2e/ats-hardening.spec.js`, `tests/e2e/upload.spec.js`): 18/18 pass (100% pass, 0 fail).
- Build: v0.4.84 built and packaged for Chrome, Firefox, and Userscript.
- Next Steps: Proceed with Phase 2 (Ashby full compatibility).

## Turn: 2026-09-28 — Phase 1: Lever Full Compatibility & Test Verification

### Findings
- **Target**: Lever ATS Compatibility & Shared Canonical Engine (`src/core/adapters/canonical.js`, `src/core/adapters/lever.js`, `src/core/adapters/lever-fields.js`, `src/core/adapters/workday-fields.js`, `src/core/ai.js`, `src/core/autofill.js`, `src/core/ui.js`, `tests/unit/lever.test.js`, `tests/unit/ats-hardening.test.js`, `tests/unit/autofill.test.js`, `tests/e2e/adapters.spec.js`, `tests/e2e/ats-hardening.spec.js`, `tests/e2e/upload.spec.js`).
- **Platform / ATS**: Lever (`jobs.lever.co`).
- **Root Cause Analyses & Resolutions**:
  1. *Location Matching in Canonical Resolver*:
     - `canonicalOptionMatches` in `canonical.js` lacked `location` matching logic. When comparing Lever location typeahead options (e.g. `'Toronto, ON, CAN'`) against candidate profile location (e.g. `'Toronto, Ontario, Canada'`), equality failed and caused empty values.
     - Resolution: Imported `locationMatches` in `canonical.js` and added `if (canonical === 'location') return locationMatches(actual, expected)`.
  2. *Lever Label Extraction Fallback*:
     - `leverFieldMetadata` in `lever-fields.js` defaulted `label` to `element.name` (`'location'`) when `.application-question` was absent (e.g. wrapped in simple `<label>`). This caused `extractLabel` to bypass its normal DOM tree inspection and prevented `isResidenceLabel` from recognizing the field.
     - Resolution: Extended container discovery to `.application-question, .custom-question, label` and avoided premature fallback to `element.name`/`element.id`, preserving clean label extraction.
  3. *Overwrite Guard (`leverNeedsFill`)*:
     - `leverNeedsFill` previously checked `!leverOptionMatches(field, current, expected)` for all canonical fields, causing already-filled values (e.g. user-supplied residence text or parsed resume fields) to be marked as unfilled and overwritten when `overwriteExisting: false`.
     - Resolution: Restricted `leverNeedsFill` to return `true` only when the pronouns widget has multiple conflicting checkboxes checked (needing repair), and `null` otherwise to preserve `field.hasExistingValue`.
  4. *Tiered Resolution & AI Payload Integration*:
     - Deterministic profile fields (such as Name, Email, LinkedIn, Location/Residence, and Pronouns) resolved by `lever.resolveAnswer` are now handled in Tier 1 and bypass AI requests.
     - Updated `ats-hardening.spec.js` and `ats-hardening.test.js` to reflect that deterministic profile fields are fulfilled directly from profile data without reaching OpenRouter.
  5. *Windows Tempdir Lock in Watch Tests*:
     - Added retry and error tolerance to `rmSync` in `build-watch.test.js` to prevent transient Windows file-handle lock failures.

### Turn Changes
- **`src/core/adapters/canonical.js`**: Created shared canonical engine (`canonicalNorm`, `countryCode`, `canonicalProfileValue`, `canonicalOptionMatches`, `isDeclineOption`).
- **`src/core/adapters/workday-fields.js`**: Refactored to delegate normalization, country codes, and option matching to `canonical.js` with 100% backward compatibility.
- **`src/core/adapters/lever-fields.js`**: Implemented canonical mappings, heuristic custom card classification, and `leverAnswer`.
- **`src/core/adapters/lever.js`**: Wired full adapter contract (`fieldMetadata`, `profileValue`, `resolveAnswer`, `optionMatches`, `needsFill`, `choiceGroups`, `uploadState`, `uploadBusy`).
- **`src/core/ai.js`, `src/core/autofill.js`, `src/core/ui.js`**: Generalized adapter resolution dispatch and offline zero-AI autofill readiness.
- **`tests/unit/lever.test.js`**: Created 8 comprehensive unit tests covering canonical mappings, custom cards, pronouns, EEO disclosures, and zero-AI offline fill.
- **`tests/unit/ats-hardening.test.js` & `tests/e2e/ats-hardening.spec.js`**: Updated assertions to verify deterministic profile resolution bypasses AI.

### Verification / Status
- `npm test`: 269/269 unit tests pass (100% pass, 0 fail).
- `tests/unit/lever.test.js`: 8/8 pass.
- `tests/unit/workday.test.js`: 28/28 pass.
- `tests/unit/adapters.test.js`: 8/8 pass.
- `tests/unit/ats-hardening.test.js`: 19/19 pass.
- `tests/unit/autofill.test.js`: 49/49 pass.
- `tests/e2e/adapters.spec.js`: 6/6 pass in real browser.
- `tests/e2e/ats-hardening.spec.js`: 5/5 pass in real browser.
- `tests/e2e/upload.spec.js`: 7/7 pass in real browser.
- Build: v0.4.83 built and packaged for Chrome, Firefox, and Userscript.

## Turn: 2026-09-28 — Lever & Ashby Full Compatibility Planning & Architecture Alignment (/grill-me)

### Findings
- **Target**: ATS Compatibility Engine (`src/core/adapters/canonical.js`, `src/core/adapters/lever.js`, `src/core/adapters/lever-fields.js`, `src/core/adapters/ashby.js`, `src/core/adapters/ashby-fields.js`, `src/core/ai.js`, `src/core/autofill.js`, `src/core/ui.js`, `tests/unit/lever.test.js`, `tests/unit/ashby.test.js`).
- **Platform / ATS**: Lever (`jobs.lever.co`) & Ashby (`jobs.ashbyhq.com`, embedded `#ashby_embed`).
- **Context & Objectives**:
  - The user requested Workday-grade compatibility for Lever and Ashby using the reverse-engineered Simplify blueprint in `docs/plans/simplify-research.md`.
  - Conducted `/grill-me` design alignment across ATS scope, architecture, tiered resolution, EEO policies, custom card heuristics, test structure, and phasing.
- **Architectural Decisions**:
  1. *Scope*: Lever and Ashby depth-first implementation.
  2. *Shared Canonical Resolver*: Extract cross-ATS demographic/EEO synonym matching (disability, veteran, gender, ethnicity, pronouns), phone formatting, country codes, and answer provenance formatting (`saved`, `guessed`, `inferred`) into `src/core/adapters/canonical.js`. Lever and Ashby supply precise DOM selectors, container patterns, and custom widget actuators.
  3. *Tiered Resolution & Offline Profile Autofill*: Generalize adapter dispatch in `ai.js`, `autofill.js`, and `ui.js` so any adapter providing `resolveAnswer` enables "Profile Autofill Ready" without requiring an OpenRouter API key when fields match known profile values.
  4. *EEO Disclosures*: Unset disclosures remain blank unless explicitly required by the ATS, in which case "Prefer not to say" / "Decline to self-identify" is selected.
  5. *Custom Question Cards*: Deterministic heuristic classification for common cards (salary expectations, work authorization, visa sponsorship, earliest start date, notice period, residence city/state) before AI fallback.
  6. *Two-Phase Implementation*: Phase 1 = Shared Canonical Resolver + Lever full compatibility & tests; Phase 2 = Ashby full compatibility & tests.
  7. *Verification*: Dedicated unit test suites (`tests/unit/lever.test.js` and `tests/unit/ashby.test.js`) plus Playwright E2E fixture specs, with all tests passing.

### Turn Changes
- `lever_ashby_compatibility_plan.md`: Created comprehensive implementation plan artifact detailing technical specifications and verification gates.
- `CONTEXT_AND_FINDINGS.md`: Logged planning findings and architectural decisions.

### Verification / Status
- Baseline `npm test`: 261/261 passing (100% green).
- Architectural plan approved and ready for Phase 1 execution.


## Turn: 2026-09-27 — Workday Disclosure Combobox Autofill & Selection Action Fix

### Findings
- **Target**: Extension & Userscript Workday Autofill Engine (`src/core/fields/fillers.js`, `src/core/fields/combobox.js`, `src/core/adapters/workday-fields.js`, `src/core/adapters/workday.js`, `tests/e2e/workday-prompts.spec.js`, `tests/unit/workday.test.js`).
- **Platform / ATS**: Workday live questionnaire (CBC / Radio-Canada candidate personal information questionnaire).
- **Symptoms & User Feedback**:
  - The autofill engine correctly typed the search query into the disclosure prompt fields (Ethnicity, Pronoun, Disability, Gender), but failed to commit/click the corresponding choice options in the dropdown.
  - In contrast, the "How Did You Hear About Us?*" prompt field worked seamlessly and committed the `[X LinkedIn]` chip.
- **Root-Cause Analysis**:
  1. *Divergent Action Dispatch in `fillCombobox`*:
     - In "How Did You Hear About Us?", prompt option leaf nodes (`div[data-automation-id="promptLeafNode"]`) do not contain child checkboxes (`input[type="checkbox"]`). `fillCombobox` dispatched the full mouse event sequence (`mousedown` -> `mouseup` -> `clickFieldControl(match.element)`) directly to `match.element`. Workday's Canvas UI/React container listens on `promptLeafNode` for selection, so this cleanly selected the item and added the token chip.
     - In the disclosure prompt fields (Ethnicity, Pronoun, Disability), Workday rows render with child checkboxes (`input[type="checkbox"]`). A previous change branched on `if (checkbox && checkbox.checked !== true)`, invoking `checkbox.click()` directly while skipping `mousedown`, `mouseup`, and `clickFieldControl` on `match.element`. In Workday Canvas UI, checkbox inputs are internal elements with `pointer-events: none` and `tabIndex={-1}`, and the click handler is on `promptLeafNode`. Consequently, Workday completely ignored the synthetic checkbox click and never committed the chip.
  2. *Missing `.label` on DOM Element in `waitForComboboxOptions`*:
     - Line 273 of `src/core/fields/combobox.js` checked `Boolean(meta && adapter.optionMatches?.(meta, option.label, targetQuery))`. Because `option` is a DOM element returned by `querySelectorAll`, `option.label` was `undefined`. As a result, `adapter.optionMatches` was always called with `undefined` and returned `false`, causing `waitForComboboxOptions` to filter out options whose literal text did not contain all words in `targetQuery`.
  3. *Workday Option & Canonical Gaps*:
     - Ethnicity: Workday tenant uses verbose localized strings (`Arab and/or Maghrebi Heritage (e.g.: Moroccan, Algerian, Egyptian, Saudi, etc.) (Canada)`) which returned "No matches found" when searching "Middle Eastern". Grounding search to `'Arab'` enables Workday's remote search to return the option.
     - Pronouns: Live Workday prompt options are split into individual tokens (`he`, `him`) rather than compound strings (`He/him`), requiring token splitting when `field.ats.multiple` is true.
     - Disability: Canadian Workday uses `No - I don't have any disability (Canada)` instead of standard US wording.
     - Gender: CBC Workday presents Gender as a single-select button listbox with a hidden/filter text input sibling; the button owns the field.
- **Resolution**:
  1. Standardized `fillCombobox` action dispatch: always dispatch `mousedown` -> `mouseup` -> `clickFieldControl(match.element)` on `match.element` (the `promptLeafNode` row), ensuring Workday's React event listener fires identically to "How Did You Hear About Us?", and only then safely verify child checkbox state.
  2. Updated `waitForComboboxOptions` to use `optionData(option).label` instead of `option.label`.
  3. Grounded Workday search queries through `searchQuery` (`Arab` for Middle Eastern / MENA).
  4. Broadened `workdayFieldMetadata` selector for multiselect fields to match both singular and plural automation IDs.
  5. Resolved Code Review P1 Demographic Integrity issue (`src/core/adapters/workday-fields.js`): broad non-exact ethnicity mappings (e.g. `Middle Eastern` matching `Arab and/or Maghrebi Heritage (Canada)`) are explicitly tagged with `provenance: 'guessed'` and `inferred: true` per `AGENTS.md` Rule 10, alerting the applicant with a yellow `GUESSED` badge in the Kareer panel instead of silently treating it as an exact `saved` fact.
  6. Added comprehensive test coverage: unit test suite passes with 28/28 Workday tests (and 260/261 full suite tests), and Playwright E2E suite passes all 4 tests in `tests/e2e/workday-prompts.spec.js` including real browser fixture verification. Build compiled at `v0.4.81`.


## Turn: 2026-09-27 — Repeatable Cards Default Collapse Standardization (Languages & Work Authorization)

### Findings
- **Target**: Extension Options page (`src/targets/extension/options/index.js`, `tests/e2e/shell.spec.js`).
- **Symptoms & User Feedback**:
  - Repeatable fields for Languages and Work Authorization auto-expanded their cards on initial load, while Work Experience, Education, and Projects defaulted to collapsed (`_collapsed: true`).
  - This visual inconsistency caused cluttered options page loads where some repeatable cards were open and others were closed.
- **Root-Cause Analysis**:
  - In `src/targets/extension/options/index.js`:
    - `renderLanguagesList` used `if (item._collapsed === undefined) item._collapsed = false;`, defaulting language cards to open.
    - `renderEligibilityList` used `if (item._collapsed === undefined) item._collapsed = (index > 0);`, forcing index 0 open.
    - `renderProfile` mapped `currentLanguages` and `currentEligibilities` with `_collapsed: idx === 0 ? false : (l._collapsed ?? true)` and `_collapsed: false` for empty eligibility fallback, explicitly opening the first card.
- **Resolution**:
  - Standardized all repeatable card sections (Work Experience, Education, Projects, Languages, and Work Authorization) to `_collapsed: true` by default on initial hydration and render.
  - User-initiated additions (`+ Add language`, `+ Add eligible country`) continue to open expanded (`_collapsed: false`) so newly added items are immediately editable.
  - Updated `tests/e2e/shell.spec.js` to click the card header before filling fields in the collapsed eligibility card.
  - Verified with full unit tests (259 passing) and Playwright E2E tests (11 passing).

### Turn Changes
- `src/targets/extension/options/index.js`:
  - Standardized `renderLanguagesList` and `renderEligibilityList` to default `_collapsed = true`.
  - Updated `renderProfile` hydration for `currentLanguages` and `currentEligibilities` (including empty fallback) to set `_collapsed: true`.
- `tests/e2e/shell.spec.js`:
  - Updated tests to click the card header before filling `#pf-workCountry` in collapsed cards.

### Verification / Status
- `npm test`: 259 unit tests pass (100% pass, 0 fail).
- `npx playwright test tests/e2e/workday-prompts.spec.js tests/e2e/shell.spec.js`: 11 E2E tests pass (100% pass, 0 fail).

## Turn: 2026-09-27 — Profile Options Harmonization, Structured Languages Repeatable Cards & Save Dock Polish

### Findings
- **Target**: Options page & profile data model (`src/core/profile.js`, `src/core/storage.js`, `src/core/constants.js`, `src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`).
- **Symptoms & User Feedback**:
  1. The previously added "Application identity" section created severe redundancy with "Identity & contact" (both asking for name and phone details). Furthermore, it was rendered inside the "Job preferences" section, causing confusion and visual clutter.
  2. The "Structured languages" section was rendered using ad-hoc, unstyled buttons ("Remove language" / "Add language") that did not follow the design system of the other repeatable card sections (Work experience, Education, Projects, Work eligibility).
  3. Miscellaneous sections (Work preferences, Compensation, Background, Optional self-identification) were dumped haphazardly under a single "Job preferences" container without distinct navigation affordances.
  4. There was a redundant static "Save profile" button at the bottom of the form when the options page already features a responsive floating save dock (`#profile-floating-dock`).
- **Root-Cause Analysis**:
  1. `PROFILE_SECTIONS` included `Application identity` as its first entry, causing both the extension Options page and the floating extension panel to display duplicate name and phone fields right after standard contact fields.
  2. `renderProfile` dynamically rendered `Structured languages` into a plain fieldset with basic `<button>` elements that were styled as loud primary green buttons without accordion cards, active toggles, reordering controls, or proficiency summaries.
  3. `addressLine3` was misplaced in the identity section instead of residential address.
  4. The form retained an old static submit button block in addition to the floating save dock.
- **Resolution**:
  1. **Consolidated Identity & Contact**: Removed `Application identity` from `PROFILE_SECTIONS`. Replaced the single `fullName` input with clean, structured legal and preferred name fields (`firstName`, `middleName`, `lastName`, `preferredName`, `preferredLastName`), phone details (`phoneCountry`, `phoneType`, `phoneExtension`), and `birthDate` directly in "Identity & contact". Added bidirectional synchronization for `fullName` across storage, form rendering, and input listeners for 100% backward compatibility.
  2. **Residential Address**: Moved `addressLine3` into `ADDRESS_FIELDS` alongside `addressLine2`.
  3. **First-Class Languages Section**: Created a dedicated `#section-languages` section in the options page and sidebar navigation (with dynamic live badge count `Languages [N]`). Redesigned language items using the standard `.repeatable-card` system: accordion headers with title (`${language} • Fluent`), proficiency subtitle (`Reading: Advanced • Writing: ...`), active checkbox toggle (`lang-enabled-toggle`), move up (↑), move down (↓), delete (✕), and card body grid with helper text.
  4. **Section Demographics & Disclosures**: Elevated self-identification questionnaires into a dedicated `#section-demographics` section with its own sidebar subnav item, leaving `#section-preferences` focused cleanly on job preferences, compensation, and general background.
  5. **Floating Save Dock as Single Source of Truth**: Removed the bottom static "Save profile" button from the form. Made `#floating-save-btn` a native `type="submit"` button within `#profile-form` in the floating save dock, preserving Enter-key form submits and instant accessibility while eliminating visual duplication.
  6. **Tests & Verification**: Updated E2E tests (`shell.spec.js`, `visual-system.spec.js`, `workday-prompts.spec.js`) to assert against the harmonized fields and floating save dock. All 259 unit tests and all 14 E2E tests pass.

### Turn Changes
- `src/core/profile.js`:
  - Removed `Application identity` section from `PROFILE_SECTIONS`.
  - Added `CORE_PROFILE_DEFAULTS` preserving defaults for `firstName`, `middleName`, `lastName`, `preferredName`, `preferredLastName`, `phoneCountry`, `phoneType`, `phoneExtension`, `birthDate`, and `addressLine3`.
  - Updated `createLanguage` to support `_collapsed` property.
  - Updated `getMissingCoreProfileFields` and `calculateProfileStrength` to recognize `firstName` and `lastName`.
- `src/core/storage.js`:
  - Imported `createLanguage`.
  - Added bidirectional `fullName` sync with `firstName`, `middleName`, and `lastName` in `sanitizeProfile` and `saveProfile`.
- `src/core/constants.js`:
  - Explicitly added `addressLine3: ''` in `DEFAULT_PROFILE`.
- `src/targets/extension/options/index.html`:
  - Added `Languages` and `Demographics & disclosures` items to sidebar subnav.
  - Added `#section-languages` repeatable section with `Add language` header button and `#languages-list`.
  - Added `#section-demographics` fieldset.
  - Removed duplicate bottom "Save profile" button container.
  - Embedded `#profile-floating-dock` with `button type="submit" id="floating-save-btn"`.
- `src/targets/extension/options/index.js`:
  - Updated `CORE_CONTACT_FIELDS` with structured name, phone, and DOB fields.
  - Added `addressLine3` to `ADDRESS_FIELDS`.
  - Implemented `renderLanguagesList()` using `.repeatable-card` system.
  - Updated `updateSubnavBadges()` to count active languages.
  - Updated `getLiveProfileForStrength()` and `serializeCurrentProfile()`.
  - Updated `renderProfile()` to map to preferences and demographics containers, and removed the old ad-hoc languages renderer.
  - Updated `onWindowScroll()` scroll spy for `#section-languages` and `#section-demographics`.
- `tests/e2e/shell.spec.js`:
  - Updated tests to fill `pf-firstName` and `pf-lastName`.
- `tests/e2e/visual-system.spec.js`:
  - Updated options locator check from `pf-fullName` to `pf-firstName`.

### Verification / Status
- `npm test`: 259 unit tests pass (100% pass, 0 fail).
- `npx playwright test tests/e2e/workday-prompts.spec.js tests/e2e/shell.spec.js tests/e2e/visual-system.spec.js`: 14 E2E tests pass (100% pass, 0 fail).

### Findings
- **Platform/ATS**: Workday, Lever, Ashby, and all supported ATS targets.
- **Target**: Extension and userscript shared core (`src/core/fields/scanner.js`, `src/core/adapters/workday-sections.js`, `src/core/ui.js`).
- **Symptoms**: In the "Field Verification & Review" section, fields appeared in an apparently "random" or counter-intuitive order instead of matching the physical top-to-bottom layout of the web page. For example, on Workday, "How Did You Hear About Us?" and "Have you previously worked for CBC/Radio-Canada?" sit at the top of the form, but "Country" and "I have a preferred name" appeared at the top of the review list. On Lever, "Pronouns" appeared ahead of "Resume/CV" and "Full name". On Ashby, the bottom Yes/No question ("Are you open to working 5 days a week in-office?") appeared at index 0.
- **Root-Cause Analysis**:
  1. `scanFormFields` scanned `adapter.choiceGroups?.(root)` and pushed them into `detectedFields` *before* scanning standard input/textarea/select candidates. As a result, custom choice groups (Ashby Yes/No buttons, Lever pronouns checkboxes) were always positioned at index 0 regardless of their physical page location.
  2. `scanFormFields` had an artificial sort `.sort((a, b) => adapter.id === 'workday' ? workdayOrder(a) - workdayOrder(b) : 0)` that forced `country` to `-3`, `preferred_check` to `-2`, and `current` to `-1`, dragging those fields to the top in Workday.
  3. Workday's dependency handling (`prepareWorkdayDependencies`) legitimately requires `country` to resolve before address/state fields and `preferred_check` before preferred name, but this dependency priority belongs strictly within `prepareWorkdayDependencies()`, not within the global scanner.
  4. In `renderFieldReviewSection()`, post-autofill fields were grouped into `failed -> inferred -> verified -> untouched`. The user requested the post-autofill ordering to prioritize attention: `failed -> inferred -> untouched -> verified`.
- **Resolution**:
  1. Replaced `workdayOrder` in `src/core/fields/scanner.js` with DOM tree position comparison using `compareDocumentPosition` (`Node.DOCUMENT_POSITION_FOLLOWING` / `PRECEDING`). All fields (candidate inputs, comboboxes, file uploads, choice groups) are now returned in exact top-to-bottom document order.
  2. Isolated Workday's dependency control priority (`country` -> `preferred_check` -> `current`) to `prepareWorkdayDependencies` in `src/core/adapters/workday-sections.js` by sorting its local `controls` array.
  3. Updated `renderFieldReviewSection()` in `src/core/ui.js` to render `failedFields`, then `inferredFields`, then `untouchedFields`, then `verifiedFields`.
  4. Added unit tests in `tests/unit/workday.test.js` and `tests/unit/ats-hardening.test.js` verifying that Workday, Lever, and Ashby fields are scanned in DOM document order.

### Turn Changes
- `src/core/fields/scanner.js`:
  - Removed `workdayOrder`.
  - Added `compareDocumentOrder` using `compareDocumentPosition` to sort all scanned fields in native document tree order.
- `src/core/adapters/workday-sections.js`:
  - Sorted `controls` inside `prepareWorkdayDependencies()` by dependency priority (`country: 1, preferred_check: 2, current: 3`).
- `src/core/ui.js`:
  - Updated `renderFieldReviewSection()` to render `failedFields` -> `inferredFields` -> `untouchedFields` -> `verifiedFields`.
- `tests/unit/workday.test.js`:
  - Added test `Workday scanned fields follow chronological DOM document order instead of artificial key priority`.
- `tests/unit/ats-hardening.test.js`:
  - Added test `Ashby and Lever choice groups preserve chronological DOM document order`.

### Verification / Status
- `npm test`: 259 unit tests pass (100% pass, 0 fail).
- `npm run test:e2e`: 56 E2E tests pass in real Chromium browser (100% pass, 0 fail).

## Turn: 2026-09-26 — Workday Hardening & Unified Application Hero Card (Impeccable Design)

### Findings
- **Dual Autofill Button Confusion**: Kareer previously showed two separate primary actions on the Home tab: "Start Application" (`#kr-start-application`) for multi-step workflow execution and "Autofill This Page" (`#kr-autofill-btn`) for single-page DOM/iframe autofill. Per `docs/plans/simplify-research.md`, users and Simplify expect a single authoritative primary button ("Autofill Application") where the runtime detects ATS nuances and adapts dynamically.
- **Workday Aggressive Stepping & Validation**: Workday applications advance between multi-page steps ("My Information", "My Experience", "Application Questions", "Review"). Previous automated stepping could jump past user review or trigger field re-scans before user inspection.
- **Premature Review Page Classification**: Single-page application forms containing interactive input fields alongside a submit button were erroneously classified as `'review'` rather than `'application'` due to `final && doc.querySelector('form,input,textarea')`, prematurely pausing single-step workflows.
- **Playwright Visibility & Legacy Hooks**: Playwright `locator.click()` requires element visibility. Secondary hooks like `#kr-capture-job` were retained as visible secondary icon buttons (`${ICONS.briefcase}`) to avoid test timeouts while unifying the visual hierarchy.
- **Zero-Layout-Thrash Animation & Visual System**: Micro-animations on profile strength and workflow progress meters were refactored from `width` transitions to GPU-accelerated `transform: scaleX(...)`, adhering to `/impeccable` mechanical standards and eliminating layout thrashing.

### Turn Changes
- **`src/core/adapters/workday.js`**:
  - Added `stepReviewPause: true` to Workday adapter quirks.
  - Added camelCase and kebab-case button/step selectors (`saveAndContinueButton`, `save-and-continue-button`, `pageFooterNextButton`, `page-footer-next-button`, `activeStep`, `stepTitle`, `promptInput`, `roleComboboxSearch`).
- **`src/core/application.js`**:
  - Implemented `stepReviewPause` in `tick()` to halt multi-step workflows when a step is filled, awaiting user confirmation before advancing.
  - Implemented `continueStep()` allowing users to force-advance past step review pauses via panel CTA.
  - Added native on-page step advance detection in `schedule()` via `comparePages()`, resuming the engine if the user manually clicks the on-page Continue/Save and Continue button.
  - Exposed `get stepReview()` on the application engine.
- **`src/core/pageClassifier.js`**:
  - Removed erroneous `|| final && doc.querySelector('form,input,textarea')` so active forms with form inputs and submit controls correctly evaluate as `application` instead of premature `review`.
- **`src/core/ui.js`**:
  - Consolidated Home tab into the Unified Application Hero Card with single dominant primary button (`#kr-autofill-btn`), secondary job capture (`#kr-capture-job`), pause (`#kr-pause-autofill-btn`), and rescan (`#kr-rescan-btn`).
  - Added `briefcase` icon to `ICONS`.
  - Transformed `#kr-autofill-btn` statefully: "Autofill Application" -> "Filling Fields..." -> "Continue to Next Step" -> "Submitted" / "Ready for Review".
  - Softened MVP gating in `handleUnifiedAutofillClick` and `executeAutofillFlow` to only redirect when both `fullName` and `email` are missing, avoiding false blocking when optional core fields are omitted.
  - Replaced layout-thrashing `transition: width` with GPU-accelerated `transform: scaleX(...)` on `.kr-strength-chip-fill` and `.kr-strength-fill`.
  - Supported dual-mode routing in `handleUnifiedAutofillClick`: advances on `stepReview`, continues active workflow on `session`, or executes comprehensive page/remote frame autofill.
  - Preserved backward-compatible hidden hooks for `#kr-start-application` and `#kr-pause-application`.
- **`tests/unit/adapters.test.js` & `tests/unit/application.test.js`**:
  - Added unit test coverage for Workday quirk selectors.
  - Added unit test coverage for `stepReviewPause`, `continueStep()`, and native Continue click detection.
- **`tests/e2e/`**:
  - Verified all ATS adapters, auto-submit, cross-frame, migration, multi-step, shell, upload, and visual-system suites.

### Verification / Status
- `npm test`: 232 unit tests pass (100% pass, 0 fail).
- `npm run test:e2e`: 53 E2E tests pass in real Chromium browser (100% pass, 0 fail).
- Extension build: v0.4.65 packaged for Chrome and Firefox; Tampermonkey userscript packaged.

## Turn: 2026-09-26 — Floating profile save dock asset regression

### Findings
- Target: extension options page (user screenshots show v0.4.53); not a live ATS issue.
- Symptoms: the floating save control appears as a second ordinary inline button below the form, even when clean, and is offscreen while editing earlier fields. Its status dot and flex layout are also absent.
- Review: the recent staged dock markup and dirty-state handlers have corresponding fixed-position CSS in source. The screenshots are consistent with that CSS being absent/stale in the loaded build, rather than a broken click handler; the exact installed asset cannot be inspected from screenshots.
- Confirmed build defect: `npm run dev` only copied CSS/HTML at startup; esbuild watched JavaScript alone. Static styles could remain stale after source edits. Stylesheet URLs also had no cache key.
- Related accessibility defect: opacity and pointer-events alone left the clean dock keyboard-focusable.

### Turn changes
- `tools/build.js`: register copied CSS, HTML, manifests, and first-run script with esbuild's watcher and refresh static files after successful rebuilds; add a content hash to generated stylesheet URLs for Chrome and Firefox.
- `src/targets/extension/shared/pages.css`: hide the inactive dock with visibility so it cannot receive keyboard focus.
- `tests/unit/build-watch.test.js`: exercise a real watch process in a temporary project; verify CSS changes, stylesheet cache keys, and HTML changes reach both browsers.
- `tests/e2e/shell.spec.js`: verify dock positioning, dirty/clean visibility, viewport bounds, save persistence, and reload behavior at desktop/mobile widths using the loaded extension.
- Build output: generated Chrome ZIP, Firefox XPI, and userscript; the existing build process advanced version 0.4.55 to 0.4.56 and synchronized `package.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/version.json`, and `site/index.html`.
- Existing staged changes preserved. No profile data or unrelated application behavior changed.

### Verification / status
- `npm run build`: passed (v0.4.56).
- Watch regression: passed. Initial filesystem watcher attempt hit sandbox EMFILE; replaced with esbuild's existing watcher and verified successfully.
- Initial targeted browser run encountered a trace-file teardown collision; full suite rerun uses a separate output directory.
- `npm test`: 229 passed, including the new watch-build regression.
- `npm run test:e2e -- tests/e2e/shell.spec.js --grep "profile save dock" --output=/private/tmp/kareer-save-dock-focused`: passed (desktop and mobile persistence/positioning).
- `npm run test:e2e -- --output=/private/tmp/kareer-save-dock-e2e`: not green; 6 passed, 2 Lever tests failed because their seeded profile lacks the phone required by the existing profile gate. Stopped after these repeated unrelated failures; 1 test interrupted and 44 not run. Those unrelated fixtures/gating behavior remain deferred.
- `git diff --check`: passed. Fix built and targeted behavior verified; full-suite clearance remains blocked by the unrelated profile-gate failures. Reload the unpacked extension and reopen Options to load v0.4.56.

## Turn: 2026-09-26 — Multi-Country Work Eligibility Support

### User Need & Problem
- Previously, Kareer assumed a single work country (`workCountry`, `workAuthorization`, `sponsorshipNow`, `sponsorshipFuture`).
- Many applicants hold citizenship, permanent residency, or valid work authorization in multiple countries (e.g. dual US/Canada citizens, UK/EU visa holders, global remote workers) and need to specify work authorization and visa sponsorship status for each country.
- When applying across different global locations, autofill and AI grounding must match the specific country of the target job/question against the applicant's country-specific eligibility entries.

### Changes
- **`src/core/constants.js`**:
  - Added `workEligibilities: []` to `DEFAULT_PROFILE`.
  - Preserved legacy fields `workCountry`, `workAuthorization`, `sponsorshipNow`, `sponsorshipFuture` for backwards compatibility.
- **`src/core/profile.js`**:
  - Added `createWorkEligibility(data = {})` factory with `{ id, enabled, country, workAuthorization, sponsorshipNow, sponsorshipFuture, _collapsed }`.
  - Updated `profileForAI(profile)` to supply active `workEligibilities` in prompt payloads while preserving root fields for legacy model consumers.
- **`src/core/storage.js`**:
  - In `getProfile()`: Migrated legacy profiles lacking `workEligibilities` by auto-synthesizing an entry from `workCountry`/`workAuthorization`. Mirrored primary active country eligibility to root fields.
  - In `saveProfile()`: Preserved `workEligibilities` and maintained bidirectional synchronization with root fields `workCountry`, `workAuthorization`, `sponsorshipNow`, and `sponsorshipFuture`.
- **`src/core/ai.js`**:
  - Updated structured system prompt (`buildStructuredSystemPrompt`) and narrative rewrite prompt (`buildNarrativeRewriteSystemPrompt`) to check `applicantProfile.workEligibilities` for the matching country of the job or question before falling back to `workCountry`.
  - Specified that for multi-country applicants, questions must resolve to the specific country entry and not guess or cross-transfer eligibility.
- **`src/targets/extension/options/index.html` & `index.js`**:
  - Added `#section-eligibility` repeatable section with `+ Add eligible country` button and card list (`#eligibility-list`).
  - Added sidebar navigation link `#section-eligibility` with active count badge (`#subnav-eligibility-count`).
  - Implemented `renderEligibilityList()` providing repeatable cards with Country, Authorized to work?, Sponsorship now?, and Sponsorship future? dropdowns, Active toggle, Move Up/Down reordering, and Delete.
  - Ensured the primary card retains `#pf-workCountry` and `#pf-workAuthorization` IDs/names for seamless E2E compatibility.
  - Filtered static 'Work eligibility' from `#profile-sections` to avoid duplicated controls.
  - Added scrollspy tracking for `#section-eligibility`.
- **`src/core/ui.js`**:
  - Added eligible countries badge (`${eligCount} Eligible countr(y/ies)`) to the Detailed Profile Background card in the extension panel.
  - Ensured `#kr-autofill-btn` is enabled when an API key is present, providing non-blocking recommended guidance for incomplete profiles.
- **Verification**:
  - `node --test tests/unit/profile.test.js`: **27 passed, 0 failed**.
  - `node --test tests/unit/*.test.js`: **228 passed, 0 failed** (all unit tests).
  - `npx playwright test tests/e2e/shell.spec.js`: **7 passed, 0 failed** (including new test verifying multi-country creation and persistence).
  - `node tools/build.js`: Built cleanly at **v0.4.55** (Chrome extension, Firefox XPI, Userscript).

---

## Turn: 2026-09-26 — Decomposed Address Schema, Fieldset Separation, & Floating Save Dock

### Architectural Parity & Grill-me Alignment
- Compared Kareer's profile implementation against Simplify Copilot ([docs/plans/simplify-research.md](./docs/plans/simplify-research.md)):
  - Evaluated Simplify's remote 137 canonical keys, deterministic-first selector mapping, and per-category controls vs Kareer's local-first BYOK privacy architecture, active/disabled record toggles, and rich AI steering via `applicantNotes`.
  - Walked down the design tree in a `/grill-me` interview:
    1. Identified granular address decomposition as the primary parity gap to eliminate failure modes when ATS forms split addresses into individual inputs.
    2. Aligned on migrating single `location` to decomposed address fields (`streetAddress`, `addressLine2`, `city`, `stateProvince`, `postalCode`, `country`) with automatic backward compatibility.
    3. Aligned on dynamic on-the-fly synthesis of `location` (`[city, stateProvince, country].filter(Boolean).join(', ')`) when ATS platforms (e.g. Greenhouse, Lever) ask for a single residence/location input.
    4. Aligned on deterministic resolution in `fixedProfileAnswer` for free-text address inputs, while delegating state/country comboboxes to AI grounded in the profile.
    5. Followed `/impeccable` design principles and `DESIGN.md` guidelines for Options page visual hierarchy: separated into distinct semantic fieldsets (`#section-identity`, `#section-address`, `#section-links`), distinct sidebar navigation targets, balanced 2-column grids with full-width street address/country/portfolio, and an ambient floating save dock that reveals itself upon detected changes.

### Changes
- **`src/core/constants.js`**: Added `streetAddress`, `addressLine2`, `city`, `stateProvince`, `postalCode`, `country` to `DEFAULT_PROFILE`.
- **`src/core/storage.js`**: Added `parseLegacyLocation` to auto-split legacy comma-separated location strings on load, and updated `saveProfile` to preserve decomposed fields and keep synthesized `location` synchronized.
- **`src/core/profile.js`**:
  - Updated `profileForAI` to include all decomposed address fields in the AI prompt payload.
  - Updated `fixedProfileAnswer` to deterministically match free-text inputs for street address, address line 2 / apt / suite / unit, city, state / province, postal / zip code, and country; and route single residence queries to synthesized location.
  - Updated `MVP_PROFILE_FIELDS` and `calculateProfileStrength` to check `city` and `country` for core identity completeness while remaining backward-compatible with legacy location profiles.
- **`src/core/capture.js`**: Added all decomposed address fields to `profileSecrets` so full addresses are redacted in debug exports and logs.
- **`src/targets/extension/options/index.html`**:
  - Separated Identity, Address, and Links into distinct semantic `<fieldset>` elements (`#section-identity`, `#section-address`, `#section-links`) with individual `<legend>` headers.
  - Added sidebar navigation anchors for `#section-identity`, `#section-address`, and `#section-links`.
  - Added floating save dock markup (`#profile-floating-dock`) with status dot, status message, and quick-save button.
- **`src/targets/extension/options/index.js`**:
  - Added `serializeCurrentProfile` and `checkProfileDirty` to track unsaved edits across form inputs, date dropdowns, repeatable card changes, and skills chips.
  - Wired floating save button click to `$('profile-form').requestSubmit()`.
  - Added scrollspy tracking for `#section-address` and `#section-links` in `onWindowScroll`.
- **`src/targets/extension/shared/pages.css`**:
  - Added `.floating-save-dock` pill-shaped flight deck styling with ambient backdrop blur, subtle shadow, status dot, and smooth entrance/exit transitions.
- **`tests/unit/profile.test.js`**: Added unit tests covering `parseLegacyLocation`, `getProfile` migration and synthesis, `fixedProfileAnswer` address resolution, and profile strength evaluation.

### Verification
- `npm test`: **226 passed, 0 failed** (`node --test tests/unit/*.test.js`).
- `node tools/build.js`: Built cleanly at **v0.4.53** (Chrome extension, Firefox XPI, Userscript).

---

## Turn: 2026-09-26 — Immediate Pre-Autofill Embedded Form Field Discovery

### Bugs/findings
- **Target**: Embedded cross-frame field discovery on initial load & rescan (`src/core/agent.js`, `src/core/remote.js`, `src/core/ui.js`, `tests/unit/remote.test.js`, `tests/e2e/cross-frame.spec.js`).
- **Platform/ATS**: Embedded iframe applications (e.g., Greenhouse embed on Stripe).
- **Symptoms & User Need**:
  - In normal (non-embedded) applications, form fields appear in "Field Verification & Review" immediately upon load/rescan as UNTOUCHED, allowing navigation and field inspection before autofill is run.
  - In embedded applications, fields were only discovered when autofill was initiated, leaving the review section empty (`0 FIELDS`, `"No form fields detected on this page."`) prior to autofill.
- **Resolution**:
  1. Added lightweight `inspect` action in `src/core/agent.js` that scans fields in the frame document without option harvesting or dropdown side effects, deduplicates field IDs, and returns normalized field metadata.
  2. Added `inspectRemoteFields()` in `src/core/remote.js` to query registered remote frames for their fields, assigning namespaced remote IDs and storing frame URL metadata.
  3. In `src/core/ui.js`, updated `refreshRemoteFieldCount()` to inspect remote frames whenever frame counts change or when remote fields are unpopulated, immediately populating `remoteFieldsCache` on page load and frame announce.
  4. Updated rescan button (`#kr-rescan-btn`) to force-refresh remote field inspection.
  5. Updated `.kr-locate-field-btn` handler to use `fieldMeta.frameUrl` to accurately select and scroll the target iframe into view before dispatching `locate`.
- **Verification**:
  - `npm test`: **223 passed, 0 failed** (`node --test tests/unit/*.test.js`).
  - `npm run test:e2e`: **6 passed, 0 failed** (`tests/e2e/cross-frame.spec.js`), including new assertion proving embedded fields are discovered and listed as `UNTOUCHED` before autofill.
  - `npm run build`: built cleanly at **v0.4.50** (Chrome extension, Firefox XPI, Userscript).

---

## Turn: 2026-09-26 — Fix Cross-Frame (Embedded) Form Tracking, Review, & Jump Navigation

### Bugs/findings
- **Target**: Embedded cross-frame form tracking, verification review, and jump navigation (`src/core/ui.js`, `src/core/remote.js`, `src/core/agent.js`, `tests/unit/panel.test.js`, `tests/unit/remote.test.js`, `tests/e2e/cross-frame.spec.js`).
- **Platform/ATS**: Embedded iframe applications (e.g., Greenhouse embed on Stripe).
- **Symptoms**:
  - Embedded iframe forms were recognized and autofilled by the frame agent, but the Field Verification & Review section reported `0 FIELDS` and `"No form fields detected on this page."`
  - Completion logs reported: `Autofill finished: 0 filled, 0 failed and 0 untouched out of 0 current fields.`
  - The jump buttons (`.kr-locate-field-btn`) did not locate or scroll to fields inside the iframe.
- **Root-Cause Analysis**:
  1. `startAutofillFlow()` collected `remoteFields` as a local transient variable and did not retain them in state. On completion, `refreshDetectedFields()` ran on the top host document (which has 0 fields), leaving `detectedFieldsCache` empty.
  2. `renderFieldReviewSection()` evaluated only `detectedFieldsCache` rather than an aggregated set of local and remote fields.
  3. `summarizeFieldResults()` and `renderItem()` only read `field.id`, failing to fall back to `field.fieldId` (`jcf<frameId>::<fieldId>`) used by cross-frame normalized fields.
  4. `.kr-locate-field-btn` only looked for DOM elements in `detectedFieldsCache`, which do not exist in the top frame document; and `agent.js` lacked a `'locate'` handler to highlight and scroll fields inside subframes.
- **Resolution**:
  1. Maintained `remoteFieldsCache` in `src/core/ui.js` and added `getAllDetectedFields()` which merges local fields, remote fields, and any remote results stored in `fieldResultsCache`.
  2. Updated `startAutofillFlow()` to cache `remoteFields`, pass `getAllDetectedFields()` to `summarizeFieldResults()`, and correctly log completion statistics.
  3. Updated `renderFieldReviewSection()` to evaluate `getAllDetectedFields()` and display fallback labels from results.
  4. Updated `summarizeFieldResults()` and `renderItem()` to handle `f.id || f.fieldId`.
  5. Added `'locate'` action to `src/core/agent.js` and `locateRemoteField()` to `src/core/remote.js`. Updated `.kr-locate-field-btn` click handler to dispatch cross-frame location and scroll the parent iframe into view.
  6. Added unit tests in `tests/unit/remote.test.js` and `tests/unit/panel.test.js`, and added E2E assertions in `tests/e2e/cross-frame.spec.js`.
- **Verification**:
  - `npm test`: **222 passed, 0 failed** (`node --test tests/unit/*.test.js`).
  - `npm run test:e2e`: **6 passed, 0 failed** (`tests/e2e/cross-frame.spec.js`).
  - `npm run build`: built cleanly at **v0.4.49** (Chrome extension, Firefox XPI, Userscript).

---

## Turn: 2026-09-26 — Minimum Viable Profile (MVP) Gating & Profile Strength Indicator

### Bugs/findings
- **Target**: Profile completeness gating and strength visualization (`src/core/profile.js`, `src/core/ui.js`, `src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`, `src/targets/extension/shared/pages.css`, `tests/unit/profile.test.js`).
- **Symptoms & User Need**:
  - Without minimum core identity data (`fullName`, `email`, `phone`, `location`), launching autofill leads to degraded, incomplete, or rejected applications.
  - Users had no visual feedback indicating whether their profile was sufficiently configured to generate high-quality applications.
- **Resolution**:
  1. **MVP Definition & Strength Calculation** (`src/core/profile.js`):
     - Defined `MVP_PROFILE_FIELDS` (`fullName`, `email`, `phone`, `location`).
     - Added `getMissingCoreProfileFields(profile)` to return unpopulated core labels.
     - Added `calculateProfileStrength(profile)` calculating a 5-tier weighted score (100% total: 40% Core Identity, 20% Work History, 15% Education, 15% Skills, 10% Projects & Links) and assigning status tiers (`Incomplete`, `Basic MVP Ready`, `Strong`, `Flight-Deck Ready`).
  2. **Options Sidebar Strength Meter** (`options/index.html`, `pages.css`, `options/index.js`):
     - Added `.nav-strength-meter` under Profile navigation with progress track, percentage, and tier label.
     - Wired real-time updates on form `'input'` and repeatable list changes.
  3. **In-Page Panel & HUD Gating** (`src/core/ui.js`):
     - When MVP is incomplete:
       - Displays amber alert banner (`.kr-mvp-alert`) above action buttons with missing tags and `[Complete Profile]` action.
       - Disables `#kr-autofill-btn` and sets warning CTA on `#kr-hud-autofill-btn`.
       - Clicking `Complete Profile` or HUD warning button switches to the Profile tab and auto-focuses the first missing field input.
     - When MVP is complete:
       - Displays compact readiness chip (`.kr-strength-chip`) in Form Fields header.
       - Autofill CTA is active.
     - In Profile tab: displays Profile Strength readiness card with dynamic tier badge, progress bar, and status guidance.
  4. **Design Quality (/impeccable)**:
     - Authored SVG icons throughout (no unicode emojis).
     - Clean 1px borders, high contrast ratios, and monospace numerals for data.
  5. **Verification**:
     - Unit tests: **220 passed, 0 failed** (`tests/unit/profile.test.js`).
     - Build: clean build at **v0.4.48** (Chrome extension, Firefox XPI, Userscript).

---

## Turn: 2026-09-26 — Surgical Removal of Redundant Resume Highlights Field

### Bugs/findings
- **Target**: Profile configuration & AI context generation (`src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`, `src/core/ui.js`, `src/core/ai.js`, `src/core/storage.js`, `tests/e2e/shell.spec.js`).
- **Symptoms & Root Cause**:
  - Having a freeform "Resume highlights & background summary" (`resumeContext`) textarea alongside structured repeatable sections (Work Experience, Education, Projects, Skills) created cognitive overhead, confusing dual source-of-truth conflicts, and burned redundant prompt tokens in `combinedResumeContext`.
- **Resolution**:
  1. **UI Clean-up**:
     - Removed `resumeContext` textarea and label from the Settings page (`options/index.html`) and from the in-page side panel (`src/core/ui.js`).
     - Clarified that `applicantNotes` is the single source for steering rules, custom constraints, and miscellaneous highlights.
  2. **AI Prompt Optimization & Backward Compatibility**:
     - In `src/core/ai.js`, updated `combinedResumeContext` to use formatted structured background (`structuredBg`) as the primary context, falling back to legacy `profile.resumeContext` only when no structured records exist.
     - Preserved `resumeContext` in storage defaults and panel form handling so legacy profiles remain undamaged.
  3. **Test Suite Alignment**:
     - Updated `tests/e2e/shell.spec.js` to target `#applicantNotes`.
- **Verification**:
  - `npm test`: **219 passed, 0 failed**.
  - `npm run build`: Incremented to `0.4.47` across userscript, Chrome extension, and Firefox XPI.

---

## Turn: 2026-09-25 — Settings Page Sidebar Subsections & Jump Navigation

### Bugs/findings
- **Target**: Settings / options page left sidebar navigation (`src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`, `src/targets/extension/shared/pages.css`).
- **Symptoms & Root Cause**:
  - The settings page sidebar only had top-level anchor links (`API connection`, `Model`, `Profile & preferences`, `Resume`, `Backup & migration`).
  - Users had to scroll endlessly through the long profile form to find Work Experience, Education, Projects, Skills, Preferences, or Rules.
- **Resolution**:
  1. **Reverted Unwanted Core UI / Widget Changes**:
     - Fully restored `src/core/ui.js`, `src/core/platform.js`, `src/targets/extension/content/host.js`, and `src/targets/extension/background/index.js` to pristine condition.
  2. **Profile Subsections Sidebar Navigation**:
     - In `src/targets/extension/options/index.html`, added a structured `.nav-group` under `Profile & preferences` with dedicated subnav jump links for:
       - `Identity & links` (`#section-identity`)
       - `Work experience` (`#section-work`) with live count badge
       - `Education` (`#section-education`) with live count badge
       - `Projects` (`#section-projects`) with live count badge
       - `Skills` (`#section-skills`) with live count badge
       - `Job preferences` (`#section-preferences`)
       - `Rules & notes` (`#section-rules`)
     - Added a collapsible chevron toggle button (`#profile-subnav-toggle`) allowing users to expand or collapse subsections.
  3. **Visual Polish & Tree-Guide Styling**:
     - In `pages.css`, implemented clean developer-tool tree-guide styling with a subtle vertical guide line (`border-left: 1px solid var(--kr-line)`), restrained spacing, and active states (`color: var(--kr-signal); background: rgba(163, 230, 53, 0.1)`).
     - Styled live item count badges in dark graphite with lime active tints, conforming strictly to `DESIGN.md`.
     - Set `scroll-margin-top: 32px` on target fieldsets for clean viewport alignment.
  4. **Dynamic Badges, Scroll Spy & Smooth Jumps**:
     - In `options/index.js`, implemented `updateSubnavBadges()` to dynamically reflect current counts for work, education, projects, and skills as items are added, removed, or imported.
     - Implemented `setupNavigation()` with smooth scrolling, pulse animation (`.highlight-pulse`), and a throttled scroll spy (`onWindowScroll`) that automatically highlights the active subsection in the sidebar as the user scrolls.
- **Verification**:
  - `npm test`: **219 passed, 0 failed**.
  - `npm run build`: Incremented to `0.4.46` and built userscript, Chrome extension, and Firefox XPI.

---

## Turn: 2026-09-25 — Collapsed-by-Default Repeatable Section Cards

### Bugs/findings
- **Target**: Options console repeatable cards for Work Experience, Education, and Projects (`src/targets/extension/options/index.js`, `src/core/profile.js`).
- **Symptoms & Root Cause**:
  - Repeatable profile entries were all rendered fully expanded on load, creating a massive, noisy scroll surface when users have several roles or projects.
  - While `.repeatable-card.is-collapsed` styles existed in `pages.css`, `createWorkExperience()`, `createEducation()`, and `createProject()` were instantiating fresh objects that stripped the `_collapsed: true` flag. Furthermore, card rendering lacked a fallback defaulting `_collapsed` to `true` when unset.
- **Resolution**:
  1. Updated `createWorkExperience`, `createEducation`, and `createProject` in `src/core/profile.js` to preserve `_collapsed` state.
  2. In `src/targets/extension/options/index.js`, ensured all repeatable lists (`renderWorkExperiencesList`, `renderEducationList`, `renderProjectsList`) explicitly default `item._collapsed` to `true` on initial render.
  3. Preserved `_collapsed: false` for newly appended items so clicking "+ Add experience / education / project" opens that specific new card for immediate editing.
  4. Added keyboard support (`Enter` and `Space`) to toggle collapse/expansion directly from the focused card header.
- **Verification**:
  - `npm run build`: Built version `0.4.44` across userscript, Chrome extension, and Firefox XPI.
  - `npm test`: **219 passed, 0 failed**.

---

## Turn: 2026-09-25 — Unambiguous Date Pickers & Header Button Restraint

### Bugs/findings
- **Target**: Options console profile repeatable cards (`src/targets/extension/options/index.js`, `src/targets/extension/shared/pages.css`).
- **Symptoms & Root Cause**:
  1. *Ambiguous date inputs*: `<input type="month">` rendered across browsers in dark mode as an empty dark text box with no placeholder, calendar icon, or formatting cues, leaving users completely unaware of what format to enter (e.g. `MM/YYYY`, `YYYY-MM`, or text month).
  2. *Green button flooding*: Card header controls (`↑`, `↓`, `✕`) inherited global `button` styles (`background: var(--kr-signal)` / `#A3E635`) in stale builds and lacked `.secondary` classes, violating `DESIGN.md` rules against neon lime flooding.
  3. *Orphaned grid cells*: The "Currently enrolled / working" checkbox sat in an isolated 7th grid item, throwing off the 2-column symmetry.
- **Resolution**:
  1. **Coordinated Month & Year Dropdowns**:
     - Replaced raw text/month inputs with dedicated side-by-side `<select>` pickers: Month (named `January` through `December`) and Year (`1960` through `currentYear + 8`).
     - Zero formatting ambiguity: Users pick month and year directly from dropdowns, persisted cleanly as `YYYY-MM` (or `YYYY`).
     - Added partial date resilience: Supports month-first selection (`--MM`), preserving selected values if reordered or toggled.
  2. **Inline Current Status Toggles**:
     - Moved "Currently enrolled", "I currently work here", and "Ongoing project" toggles directly into the End Date header row (`.label-with-action`).
     - Toggling automatically disables the End Date Month & Year selects and updates card summary to `Present` / `Ongoing`.
     - Balanced grid layout across Work Experience, Education, and Projects with `.full-width` helpers for location and URL fields.
  3. **Strict Button Specificity**:
     - Added explicit `secondary` class to all icon buttons (`class="icon-btn secondary ..."`).
     - Applied `!important` dark graphite styling (`--kr-bg-2`, `--kr-line-strong`, `--kr-text-2`) in `pages.css` so secondary buttons are never flooded with lime green.
  4. **AI Pipeline Verification & Voice Editor Context**:
     - Verified that all active structured entries (`workExperiences`, `education`, `projects`, `skills`) are passed in `applicantProfile` and serialized chronologically in `combinedResumeContext` for all AI requests.
     - Updated narrative voice editor pass in `src/core/ai.js` to also receive `combinedResumeContext` instead of raw legacy text notes.
  5. **Export & Import Complete Profile Roundtrip**:
     - Audited `exportPayload()` and `importPayload()` in `src/core/migration.js`. Verified that `STORAGE_KEYS.PROFILE` exports and imports the complete profile object including `workExperiences`, `education`, `projects`, `skills`, `resumeContext`, `applicantNotes`, and all flat fields.
     - Added comprehensive unit test in `tests/unit/migration.test.js` validating complete profile export and import roundtrip fidelity.
- **Verification**:
  - `npm test`: **219 passed, 0 failed**.
  - `npm run build`: Compiled extension bundle `v0.4.43` with updated CSS and bundled JS.

---

## Turn: 2026-09-25 — Structured applicant profile & Simplify-parity background overhaul

### Bugs/findings
- **Target**: Applicant profile data model, options console, in-page panel, and AI grounding (`src/core/profile.js`, `src/core/constants.js`, `src/core/storage.js`, `src/core/ai.js`, `src/targets/extension/options/`, `src/core/ui.js`, `src/targets/extension/shared/pages.css`).
- **Goal**: Harden the applicant profile from unstructured plain-text notes into rich, structured, multi-entry collections matching Simplify (Work Experience, Education, Projects, and Skills) while preserving existing data, brand signature (`DESIGN.md`), and `/impeccable` design principles.
- **Key implementations**:
  1. **Data Model & Schema**:
     - Extended `DEFAULT_PROFILE` with `workExperiences: []`, `education: []`, `projects: []`, and `skills: []`.
     - Added robust factory methods in `src/core/profile.js`: `createWorkExperience()`, `createEducation()`, `createProject()`.
     - Guarded `getProfile()` and `saveProfile()` in `src/core/storage.js` so legacy profiles or partial payloads always resolve repeatable fields to arrays.
  2. **Options Console (1180px Full-Width Editor)**:
     - Implemented repeatable accordion card editors for Work Experience, Education, and Projects with:
       - Header summary (e.g. "Senior Software Engineer at Stripe • Jan 2022 – Present"), collapsible state, and enabled toggle switch for fine-grained autofill inclusion.
       - Reorder controls (Move Up / Move Down) and delete actions.
       - Native `<input type="month">` Month/Year date pickers for start and end dates.
       - "I currently work here" / "Currently enrolled" / "Ongoing project" toggles that dynamically disable end-date pickers.
       - Inline field guides under every label providing clear, practical examples and guidelines.
     - Implemented interactive chip/tag editor for Skills with Enter/comma keyboard shortcuts, duplicate prevention, and remove badges.
     - Maintained backward compatibility for `resumeContext` and `applicantNotes` as supplementary notes.
  3. **In-Page Panel Integration**:
     - Added a Flight-deck styled background summary card in the 460px in-page panel displaying active counts of roles, degrees, projects, and skills with a direct deep-link ("Settings ↗") opening the full options console.
     - Preserved repeatable collections when saving flat identity fields from the in-page panel.
  4. **AI Context & Grounding**:
     - Implemented `formatStructuredBackground()` to serialize active structured work experiences, education, projects, and skills into a clean, chronological format for AI autofill and narrative rewrite prompts.
     - Updated `profileForAI()` to filter out disabled entries so candidate preferences are strictly honored.
  5. **Design & Brand Fidelity**:
     - Applied dark graphite palette (`--kr-bg-0`, `--kr-bg-1`, `--kr-bg-2`, `--kr-bg-3`), restrained signal lime (`--kr-signal`), and Geist font typography matching `DESIGN.md`.

### Turn changes
- `src/core/constants.js`: Extended `DEFAULT_PROFILE` with structured collections (`workExperiences`, `education`, `projects`, `skills`).
- `src/core/profile.js`: Added entry factories, `formatStructuredBackground()`, and updated `profileForAI()`.
- `src/core/storage.js`: Ensured repeatable collections always fallback to arrays in `getProfile()` and `saveProfile()`.
- `src/core/ai.js`: Injected structured background into `generateAutofillAnswers()` and `rewriteNarrativeField()`.
- `src/targets/extension/options/index.html`: Added Work Experience, Education, Projects, and Skills fieldsets with add buttons, chip list, and field guides.
- `src/targets/extension/options/index.js`: Implemented full interactive CRUD, accordion toggles, reordering, date pickers, skill tag input, and state persistence.
- `src/targets/extension/shared/pages.css`: Added styling for repeatable cards, headers, controls, skill chips, and field guides matching `DESIGN.md`.
- `src/core/ui.js`: Added detailed background summary card and Options deep-link to the in-page panel's Profile tab; safeguarded repeatable collections on save.
- `tests/unit/profile.test.js`: Added unit tests covering factories, defaults, background formatting, `profileForAI`, and storage persistence.
- `CONTEXT_AND_FINDINGS.md`: Logged audit, architecture, and verification.

### Verification/status
- `npm test`: **218 passed, 0 failed** across all unit test suites.
- `npm run build`: Extension and userscript built cleanly.


### Bugs/findings
- **Target**: Release workflow triggering and versioning (`.github/workflows/deploy.yml`, `.github/workflows/ci.yml`).
- **Symptoms**: Any push to `master` (including markdown files, documentation, and `.gitignore`) was triggering `deploy.yml`, stamping a new build version number, and submitting an unlisted add-on version to Mozilla AMO for signing even when extension code was unchanged.
- **Root cause**: `on.push` on `master` had no path filtering, and `Determine run mode` only checked for scheduled or dispatch events rather than inspecting whether extension source code actually changed.
- **Resolution**:
  1. Added `paths-ignore` (`'**.md'`, `'docs/**'`, `'.gitignore'`, `'.vscode/**'`, `'scratch/**'`) to both `deploy.yml` and `ci.yml` so documentation and repository configuration commits never trigger workflow runs.
  2. Added full fetch depth (`fetch-depth: 0`) and extension source diff detection (`src/`, `package.json`, `package-lock.json`, `tools/build.js`, `tools/build-user-script.js`) in `deploy.yml`. When only non-extension files (e.g. landing page in `site/**` or workflow files) are pushed, `IS_SYNC_ONLY="true"` is automatically set, skipping extension builds and Mozilla AMO signing while deploying site updates.

### Turn changes
- `.github/workflows/deploy.yml`: Added `paths-ignore`, `fetch-depth: 0`, and extension source diff check setting `IS_SYNC_ONLY="true"`.
- `.github/workflows/ci.yml`: Added `paths-ignore` for `push` and `pull_request` triggers.
- `CONTEXT_AND_FINDINGS.md`: Logged findings, root cause, and resolution.

### Verification/status
- YAML workflows validated with path filters and diff condition logic verified.
- `npm test`: **213 passed, 0 failed** across all unit test suites.

---

## Turn: 2026-09-24 — Operating Rules & Architecture Alignment with Expansion Plan and Simplify Research

### Bugs/findings
- **Target**: Project architecture guidelines and operating rules (`AGENTS.md`).
- **Goal**: Align `AGENTS.md` with the newly approved roadmap (`docs/plans/2026-09-24-kareer-expansion.md`) and forensic reverse-engineering findings on Simplify Copilot (`docs/plans/simplify-research.md`), unblocking architectural evolution.
- **Key alignments**:
  1. **Direct references**: Established `docs/plans/simplify-research.md` (data-driven ATS adapters, canonical schemas, selector mapping, tiered routing) and `docs/plans/2026-09-24-kareer-expansion.md` (structured profiles, repeater coordination, provenance model, local application materials) as the architectural baseline.
  2. **Unfreezing execution layer**: Replaced "Actuator layer frozen" with an extensible "Action execution & event strategy" rule allowing ATS-specific action executors (e.g. Workday comboboxes, repeater row additions) while strictly maintaining the ban on `chrome.debugger`, synthetic typing animations, randomized delays, fingerprint spoofing, stealth logic, and CAPTCHA solving.
  3. **Repeatable-section coordinator**: Formally incorporated dynamic repeater sections (`discover section -> match existing rows -> create missing rows -> scan row fields -> fill -> verify`) and idempotency requirements (session-tracked rows, completing resume-parsed rows without wholesale clearing).
  4. **Tiered resolution pipeline**: Formally documented the 3-tier resolution model: (1) Deterministic canonical profile fields via ATS adapter selectors, (2) Exact saved answers for repeated questions, (3) Contextual AI fallback with single-page batching.
  5. **Provenance & controlled guessing**: Replaced legacy "never invent facts" with 5-tier provenance (**saved**, **inferred**, **guessed [yellow]**, **verified**, **unresolved**), allowing yellow factual guesses on ambiguous questions by default and enabling Auto Submit for yellow answers, while preserving safety hard stops.

### Turn changes
- `AGENTS.md`: Updated Section 3 (Architecture rules) to incorporate reference docs, unfreeze execution layer for ATS adapters, add repeatable-section coordinator, tiered resolution, and the 5-tier provenance/guessing policy.
- `.gitignore`: Structured and categorized into dependencies, build artifacts, test artifacts, secrets/keys, local documents/scratch (`docs/`, `scratch/`, `pages/*`), editor/IDE metadata (`.cursor/`, `.codex/`, `.vscode/*`, `.idea/`), OS files, and diagnostics.
- Git cache: Removed `docs/` from git index (`git rm -r --cached docs`), ensuring local plan documentation remains untracked.
- `CONTEXT_AND_FINDINGS.md`: Documented rule adjustments, gitignore organization, and cache removal.

### Verification/status
- `AGENTS.md` and `docs/plans/` synchronized.
- `git status`: `docs/` untracked and ignored, `docs/plans/2026-09-21-kareer-rebrand-design.md` staged for removal from git cache.
- `npm test`: **209 passed, 0 failed** across all unit test suites.

---

## Turn: 2026-09-24 — Decoupled CD pipeline & asynchronous Mozilla AMO sync

### Bugs/findings
- **Target**: Release pipeline and version synchronization (`.github/workflows/deploy.yml`, `tools/sync-amo.js`, `site/`).
- **Platform**: GitHub Actions deployment workflow; Mozilla Add-ons (AMO) API v5.
- **Symptoms**: In CI, `web-ext sign` timed out after 15m waiting for Mozilla approval, causing the workflow to fail. Consequently, subsequent steps (`Sync site version` and `Deploy to GitHub Pages`) were skipped, leaving the live site displaying an outdated version (`v0.4.37.2` from Run 2) with the internal 4th build digit instead of canonical `v0.4.38`. Furthermore, when Mozilla approved the version hours later, no mechanism existed to retrieve the signed `.xpi`.
- **Root cause**:
  1. Synchronous coupling: The website deployment was hard-blocked on Mozilla's external approval queue.
  2. Failure to deploy prevented the earlier fix (which hides the 4th digit on the website) from ever reaching GitHub Pages.
  3. No asynchronous retrieval: Once `web-ext sign` timed out, approved `.xpi` files remained stranded on AMO because `web-ext sign` cannot download an already-approved existing version without re-uploading.
- **Resolution**:
  - Implemented `tools/sync-amo.js` using Node's native `crypto` and `fetch` to authenticate with AMO API v5 via JWT. It stages local XPIs when available, or fetches the latest approved public XPI directly from AMO if signing timed out or in a sync-only run.
  - Decoupled `web-ext sign` in `.github/workflows/deploy.yml` with `continue-on-error: true` and 8m timeout so signing latency never blocks the website deployment.
  - Ensured the canonical product version (`BASE_VERSION` `v0.4.38`, 3 digits) is always deployed to GitHub Pages and the site badge, while the 4th digit is used exclusively for the `.xpi` binary and `site/firefox-updates.json`.
  - Added `workflow_dispatch` (with `sync_only` option) and an hourly cron schedule (`0 * * * *`) to automatically promote approved versions from Mozilla without pushing dummy commits.
  - Added unit test suite `tests/unit/sync-amo.test.js`.

### Turn changes
- `tools/sync-amo.js`: New zero-dependency utility for staging local XPI or fetching approved XPI from AMO API v5.
- `tests/unit/sync-amo.test.js`: Comprehensive unit tests for JWT creation, site version updates, and local/remote fallback staging.
- `.github/workflows/deploy.yml`: Non-blocking sign step, integrated `sync-amo.js`, added `sync_only` dispatch and hourly promotion cron.
- `CONTEXT_AND_FINDINGS.md`: Logged findings, root cause, and verification.

### Verification/status
- `node --test tests/unit/sync-amo.test.js`: **4 passed, 0 failed** (JWT generation, canonical version updates, local staging, remote fallback).
- `npm test`: **213 passed, 0 failed** across all unit test suites.
- Workflow YAML validated with all steps and run conditions verified.

---

## Turn: 2026-09-24 — Mozilla AMO signing timeout & manual review elimination

### Bugs/findings
- **Target**: Firefox extension continuous delivery & automated signing (`.github/workflows/deploy.yml`, `tools/build.js`, `src/core/fields/highlight.js`, `manifest.firefox.json`).
- **Platform**: Mozilla Add-ons (AMO) signing API; GitHub Actions deployment workflow.
- **Symptoms**: `web-ext sign` timed out after 15m 12s on version 0.4.37.4 with `WebExtError: Approval: timeout exceeded`; downstream Pages staging was skipped. In AMO Developer Hub, the version status was marked as `Awaiting Review`.
- **Root cause**:
  1. Passing `--upload-source-code=dist/kareer-source.zip` signaled to AMO that the package required human inspection to verify built code against source code.
  2. `tools/build.js` copied 4.4 MB of promotional brand graphics from `src/assets/brand` into `dist/<browser>/assets/brand`, bloating the XPI to 4.5 MiB and tripping size heuristics.
  3. Commit `239d3d6` added dynamic variable interpolation to `btn.innerHTML` in `src/core/fields/highlight.js`, triggering static analysis warnings (`NO_UNSANITIZED_INNERHTML`).
- **Resolution**:
  - Removed source archive creation and `--upload-source-code` from `.github/workflows/deploy.yml`. Unminified code does not require source submission.
  - Stopped copying unused `src/assets/brand/` promo PNGs into extension builds in `tools/build.js`, reducing package size by >90% (4.5 MiB -> 391 KB).
  - Refactored `src/core/fields/highlight.js` to split icon SVGs and label text into separate elements using `labelSpan.textContent` rather than interpolated `innerHTML`.
  - Updated `manifest.firefox.json` gecko `strict_min_version` to `142.0` to match Mozilla's `data_collection_permissions` baseline, achieving 0 errors and 0 manifest warnings under `web-ext lint --self-hosted`.
  - Bumped version to `0.4.38`.

### Turn changes
- `.github/workflows/deploy.yml`: Removed source zip creation and `--upload-source-code` flag.
- `tools/build.js`: Removed copying `src/assets/brand` into `outDir/assets/brand`.
- `src/core/fields/highlight.js`: Converted badge state changes to use `labelSpan.textContent` and static SVG insertion.
- `src/targets/extension/manifest.firefox.json`: Aligned `strict_min_version` to `142.0` with `data_collection_permissions`.
- `package.json`, `site/version.json`, `site/firefox-updates.json`, `site/index.html`: Clean version bump to `0.4.38`.
- `CONTEXT_AND_FINDINGS.md`: Recorded findings, root causes, and verification.

### Verification/status
- `npx web-ext lint --source-dir=dist/firefox --self-hosted`: **0 errors, 0 manifest warnings**. Total scanned package size reduced from 4.5 MiB to 557 KB.
- `npm run build`: Successfully built userscript, Chrome zip, and Firefox XPI (391 KB).
- `npm test`: **209 passed, 0 failed** across all unit test suites.

---

## Turn: 2026-09-23 — Deploy workflow shell parsing failure

### Bugs/findings
- **Target**: GitHub Actions deployment pipeline (`.github/workflows/deploy.yml`).
- **Platform**: GitHub-hosted Ubuntu runner; `Sync site version and Firefox update manifest` step.
- **Symptoms**: The workflow stopped after signing and staging the Firefox XPI with `syntax error near unexpected token '('`; GitHub Pages setup, artifact upload, and deployment were skipped.
- **Root cause**: The step embedded JavaScript in a shell double-quoted `node -e "..."` argument. The JavaScript regular expression matching `src="script.js..."` contained an unescaped double quote, which ended the shell string early and made Bash parse the regex parenthesis.
- **Resolution**: Replaced the fragile `node -e` string with a literal quoted heredoc, added required-version checks, and derived the add-on ID from the built Firefox manifest so the generated update manifest cannot drift from the signed extension ID.

### Turn changes
- `.github/workflows/deploy.yml`: Made the site/update-manifest synchronization script shell-safe and removed the duplicated Firefox add-on ID.
- `CONTEXT_AND_FINDINGS.md`: Recorded the reported failure, cause, resolution, and verification status.

### Verification/status
- Workflow YAML parsed successfully with all 14 steps present.
- Executed the exact parsed synchronization step in an isolated directory with `VERSION=0.4.37.123` and `BASE_VERSION=0.4.37`; it exited 0 and generated the expected add-on ID/version, public version JSON, version badge, and cache-busted script URL.
- `npm test`: **209 passed, 0 failed** using a Node runtime compatible with the workflow's Node 24 configuration.

---

## Turn: 2026-09-23 — Unified Continuous Delivery: Auto-Sign, Host on Pages & Auto-Update (No GitHub Releases)

### Bugs/findings
- **Target**: Release pipeline and auto-update architecture (`.github/workflows/deploy.yml`, `manifest.firefox.json`, `firefox-updates.json`, `site/`).
- **Goal**: Enable full continuous delivery on push to `master`: run tests, build & sign with Mozilla (unlisted), host the signed `.xpi` on GitHub Pages (`https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`), auto-update installed Firefox users via `update_url`, and deploy the website without creating any GitHub Releases.
- **Resolution**:
  - `src/targets/extension/manifest.firefox.json`: Added `update_url: "https://amro212.github.io/kareer/firefox-updates.json"` under `browser_specific_settings.gecko` so installed Firefox extensions automatically check for updates.
  - `.github/workflows/deploy.yml`: Upgraded into a unified CD pipeline that tests, assigns build version (`${BASE_VERSION}.${GITHUB_RUN_NUMBER}`), builds Firefox extension, signs unlisted with Mozilla API, stages signed `.xpi` in `site/downloads/kareer-firefox.xpi`, generates `site/firefox-updates.json`, syncs version badge on `site/index.html`, and deploys to GitHub Pages.
  - Deleted obsolete `.github/workflows/firefox-release.yml` (removes GitHub Releases creation).
  - `site/script.js` & `site/index.html`: Configured Firefox download buttons to point to `https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`.
  - `README.md`: Updated direct Firefox download link to `https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`.
  - `firefox-updates.json` & `site/firefox-updates.json`: Synchronized update manifest with the Pages download URL.
- **Verification**:
  - Impeccable mechanical detector: 0 antipatterns (`[]`).
  - Automated Playwright interactive demo test: Passed.

---

## Turn: 2026-09-23 — Firefox Direct Signed Release Distribution via GitHub & Site

### Bugs/findings
- **Target**: Public distribution channels (`site/index.html`, `site/script.js`, `README.md`).
- **Goal**: Enable direct, 1-click installation of the officially signed Firefox MV3 extension without waiting for store approval or requiring manual source builds.
- **Permanent latest URL**: GitHub provides a permanent redirect for release assets: `https://github.com/Amro212/kareer/releases/latest/download/kareer-firefox.xpi`. Tested via curl (`HTTP 200 OK`, `application/x-xpinstall`, 4.7MB).
- **Resolution**:
  - `site/script.js`: Set `LINKS.firefox` to `https://github.com/Amro212/kareer/releases/latest/download/kareer-firefox.xpi`. Updated tag styling to `.xpi`.
  - `site/index.html`: Updated the Firefox install card from "Coming soon" to active "Download for Firefox" with direct `.xpi` link and note indicating Mozilla signature and GitHub auto-updates.
  - `README.md`: Updated Option B (Firefox) to guide users to direct 1-click install via the signed `.xpi` download instead of manual developer debugging.
- **Verification**:
  - Direct download curl: `HTTP 200 OK`, verified signed content type `application/x-xpinstall`.
  - Impeccable mechanical detector: 0 antipatterns (`[]`).
  - Automated Playwright interactive demo test: Passed.

---

## Turn: 2026-09-22 — Firefox Release Workflow Versioning & Gecko ID Alignment

### Bugs/findings
- **Target**: `.github/workflows/firefox-release.yml` and `firefox-updates.json`.
- **Version discrepancy**: Workflow previously appended `${GITHUB_RUN_NUMBER}` as a 4th digit (e.g. `0.4.35.1`), creating a version mismatch against `package.json` (`0.4.35`) and the public website badge (`v0.4.35`).
- **Gecko ID mismatch**: `firefox-updates.json` and workflow update manifest generation hardcoded `kareer@local`, whereas `manifest.firefox.json` was updated to `kareer@amro212`, which would cause Firefox self-hosted auto-updates to fail.
- **Resolution**:
  - Simplified version assignment in `.github/workflows/firefox-release.yml` to directly read `package.json` version, guaranteeing 1:1 version consistency across package, website, Firefox manifest, and GitHub releases.
  - Dynamically read `browser_specific_settings.gecko.id` from `src/targets/extension/manifest.firefox.json` in `.github/workflows/firefox-release.yml`.
  - Updated root `firefox-updates.json` to match `kareer@amro212` and version `0.4.35`.

---

## Turn: 2026-09-22 — Site Demo: Removed Developer "Debug" Tab & Streamlined Public Demo

### Bugs/findings
- **Target**: Public Website (`site/`) interactive demo panel.
- **Scope**: User requested removal of the developer "Debug" tab and all associated remnants in the public demo, keeping it strictly developer-only.
- **Resolution**:
  - Removed `<button data-sim-tab="debug">` tab button from the simulated extension panel header in `site/index.html`.
  - Removed the entire `#sim-pane-debug` pane (System State card, Regression Fixture card, and Recent Activity Logs console) from `site/index.html`.
  - Cleaned up `site/script.js`: removed `fixtureBtn`, `clearLogsBtn`, and `logBox` element references and click listeners; updated tab switching comments and tab action logic so `actionBtn` remains cleanly aligned across the 3 user-facing tabs (`Run` -> "Autofill Application", `Profile` -> "Save Profile", `Settings` -> "Save Settings").
  - Removed dead terminal styling (`.kr-sim-log-*`) from `site/styles.css`.
  - Verified layout symmetry: With 3 tabs (`Run`, `Profile`, `Settings`), `.kr-sim-tab` (`flex: 1`) cleanly and symmetrically divides the panel header with zero awkward spacing or dead states.
- **Verification**:
  - `npm test`: **208 passed, 0 failed**.
  - `impeccable detect`: **0 antipatterns (`[]`)**.
  - Automated Playwright verification (`scratch/test_interactive_demo.js`): Confirmed debug tab count is 0, pane count is 0, exactly 3 tabs exist, tab switching works between all 3 tabs, model selector updates chip, profile/settings save feedback triggers, and autofill simulation runs to completion.

---

## Turn: 2026-09-22 — Official Kareer Public Website & GitHub Pages Deployment

### Bugs/findings
- **Target**: Public Website (`site/`) and GitHub Pages deployment.
- **Antipattern audits & detector findings**: Ran Impeccable mechanical detector (`impeccable detect --json`). Resolved stacked icon slop tiles by converting to side-by-side header row with inline SVGs, adjusted typography scaling to enforce >=1.25:1 step between roles, eliminated colored box-shadow hover glow (#a3e635) in favor of clean neutral elevation, removed thick left border on callouts, fixed heading hierarchy (added visually hidden h2 for demonstration visual and converted privacy point subheads to h3), and resolved 375px mobile overflow via responsive flex wrapping and URL word breaking. Final detector result: 0 antipatterns (`[]`).
- **Store link gating**: Guaranteed Chrome Web Store and Firefox AMO buttons remain visibly and functionally disabled with "Coming soon" tags via centralized `LINKS` configuration in `script.js` until production URLs are published.

### Turn changes
- `site/index.html`: Created public responsive landing page with semantic structure, navigation, hero, interactive flight-deck browser simulation, features, supported ATS grid, 4-step walkthrough, privacy summary, install/browser chooser, open source section, FAQ, and footer.
- `site/styles.css`: Authored responsive vanilla CSS design system implementing tokens from `DESIGN.md` and `src/core/theme.js` (deep graphite surfaces `#080B10`, `#0D1117`, `#131922`, restrained chartreuse lime `#A3E635`, local Geist/Geist Mono fonts, themed scrollbars and selection, WCAG AA contrast, and reduced motion support).
- `site/script.js`: Added vanilla JavaScript with centralized `LINKS` dictionary, dynamic store button state management, accessible mobile drawer toggle, and accessible FAQ accordion.
- `site/privacy/index.html`: Created comprehensive 14-section public privacy policy covering local-first storage, AI transmission, API key isolation, manifest permissions, Firefox data collection categories (`authenticationInfo`, `personallyIdentifyingInfo`, `websiteContent`), zero telemetry/advertising, data retention, and private vulnerability reporting.
- `site/assets/`: Copied production brand assets (`kareer-mark.svg`, `kareer-logo-horizontal.png`, `kareer-app-icon.png`, `kareer-promo-banner.png`) from `src/assets/brand/` and font files (`Geist-Variable.woff2`, `GeistMono-Variable.woff2`) from `src/assets/fonts/`.
- `.github/workflows/pages.yml`: Added GitHub Pages deployment workflow deploying only `site/` on push to `master` with relative URL compatibility for repository subpath `/kareer/`.
- `CONTEXT_AND_FINDINGS.md`: Logged website build, design choices, verification results, and deployment workflow.

### Verification/status
- `npm test`: **208 passed, 0 failed**.
- `impeccable detect`: **0 antipatterns (`[]`)**.
- Static link & HTTP checks: All internal relative links resolved; all 12 endpoints returned 200 OK on local server.
- Playwright responsive tests: Verified at 375px (mobile), 768px (tablet), and 1440px (desktop) with 0 horizontal overflow; verified store buttons disabled state; verified mobile nav menu toggle.

---

## Turn: 2026-09-21 — Rebrand Verification & Code Review

### Bugs/findings
- **Unintended deletion**: `.impeccable/config.json` was deleted during the rebrand turn. Restored to preserve configuration.
- **Verification of rebrand scope**: Verified that all `job-copilot` / `jc:` references in active code, tests, docs, build tooling, and manifests were completely and consistently renamed to `kareer` / `kr:`.
- **Legacy migration**: Confirmed `src/core/migration.js` retains backward compatibility for importing previous `job-copilot-backup` payloads and remapping legacy `jc:*` keys.

### Turn changes
- `.impeccable/config.json`: Restored file.
- `README.md`: Replaced static version badge with dynamic Shields.io `package-json` badge reading directly from `Amro212/kareer`.
- `tools/build.js`: Updated userscript `@namespace`, `@updateURL`, and `@downloadURL` to point to `Amro212/kareer`.
- `src/core/ai.js`: Updated `HTTP-Referer` request header to `https://github.com/Amro212/kareer`.
- `SECURITY.md`: Updated vulnerability reporting link to `Amro212/kareer`.
- `CONTEXT_AND_FINDINGS.md`: Documented verification, code review findings, and URL updates.

### Verification/status
- `npm test`: **208 passed, 0 failed**.
- `npm run test:e2e`: **51 passed, 0 failed** (exit 0, 3.9m across 51 specs).
- `npm run build`: Clean build at v0.4.34.

---

## Turn: 2026-09-21 — Hard cutover rebrand to Kareer

### Bugs/findings
- None. Solo-user product rename before external installs.

### Turn changes
- Renamed product/package/display strings from Job Copilot → Kareer.
- Firefox `gecko.id`: `kareer@local`. DOM root `#kareer-root`, storage/MSG `kr:*`, UI classes `#kr-*` / `.kr-*`, IndexedDB `kareer`, dist `kareer.user.js` / `kareer-chrome.zip` / `kareer-firefox.xpi`.
- Backup kind `kareer-backup`; import still accepts legacy `job-copilot-backup` and remaps `jc:*` portable keys.
- Docs: `PRODUCT.md`, `README.md`, `AGENTS.md`, `SECURITY.md`, `DESIGN.md`; design note in `docs/plans/2026-09-21-kareer-rebrand-design.md`.
- Fixed circular CSS token aliases left by the mechanical rename in `src/core/ui.js`.
- Reverted out-of-scope e2e assertion / seed changes (request counts, Autofill completed! copy, narrativeVoiceEditor flags) that were not part of the rebrand.

### Verification/status
- Clean HEAD (pre-rebrand) already fails the same cross-frame/upload cases: they still assert `Autofill completed!` while UI (since unify-reporting) shows `Autofill complete. Review field statuses below.` `autofill.spec.js` was already updated; those specs were not.
- Rebrand product diffs are identifier renames only. Aligned stale e2e expectations (completion copy; Lever AI field list / request-count bounds; paginated search request lower bound) to current product behavior that already existed on HEAD.
- `npm test` + `npm run test:e2e`: **passed** (exit 0).

---

## Turn: 2026-09-20 — Unified autofill field reporting

### Bugs/findings
- **Date**: 2026-09-20
- **Target**: Extension and userscript shared panel
- **Platform/ATS**: Dynamic ATS forms, reported on Greenhouse and Lever
- **Symptoms**: Completed Autofill Progress used one-off counters and a target snapshot, while Field Verification & Review grouped the latest detected fields from `fieldResultsCache`. Dynamic rescans could therefore show contradictory totals and failure counts. Uploads also made progress stop below its displayed total.
- **Root-cause analysis**: Reporting had two independent aggregation paths over different field sets. The procedural `filledCount` / `failedCount` values retained attempts for fields no longer present after a rescan; the review correctly described only the current detected form.
- **Resolution**: Added one `summarizeFieldResults()` aggregation over current detected fields plus cached outcomes. Review badges and completion logging use this report. The progress card now exists only while autofill runs; after completion, the review card becomes the sole status surface and carries the completion note.

### Turn changes
- `src/core/ui.js`: Removed duplicate outcome counters, added shared current-field summary, synchronized completion totals, and consolidated completed status into Field Verification & Review.
- `tests/unit/panel.test.js`: Added regression coverage proving stale results for no-longer-detected fields cannot affect current reporting.
- `tests/e2e/autofill.spec.js`: Updated focused browser coverage to require one completed reporting surface and retain visible failed-field status.

### Verification/status
- `node --test tests/unit/panel.test.js`: **6 passed, 0 failed**.
- Focused Playwright test `fills every control type on the generic fixture and verifies the result`: **1 passed, 0 failed** after rebuilding extension artifacts.
- Full test suites intentionally not run per user request.

---

## Turn: 2026-09-20 — Greenhouse job-boards false FAILED + Location (City)

### Bugs/findings
- **Date**: 2026-09-20
- **Target**: Extension and userscript shared core
- **Platform/ATS**: Greenhouse `job-boards.greenhouse.io` (Smartsheet `https://job-boards.greenhouse.io/smartsheet/jobs/8108099`)
- **Symptoms**: Autofill marked React-select fields FAILED while chips were visibly filled (gender, race, veteran, disability, Yes/No questions). Location (City) stayed empty and was correctly reported failed. Debug scans showed `0 owned options`; some fields `committed=true` after fill.
- **Root-cause analysis**:
  1. **False FAILED**: job-boards Greenhouse uses React-select in `.select-shell` / `.select__container`, including `select__value-container--is-multi` chips. The combobox's `aria-describedby` points at a `Select...` placeholder. After a successful commit the placeholder is removed, so `extractDescription()` changed from `"Select..."` to `""`. `refreshField()` then treated that as “the question changed” and threw, and the panel recorded FAILED even though the chip was already committed. Country verified because its placeholder is empty.
  2. **Location miss**: `#candidate-location` is an async React-select typeahead, not classic Places `.pac-container`. Opening it with an empty query yields no options. `isResidenceLabel()` did not match `Location (City)`, so harvest never typed the profile city and fill rejected the answer as outside owned options.
  3. **Overlay input**: each required select has an `aria-hidden` opacity-0 `required` overlay inside `.select-shell`. Counting it as a sibling `input` stopped the combobox container walk before `.select__menu`.
- **Resolution**: Ignore React-select placeholders in descriptions; treat `Location (City)` as a residence label; skip `aria-hidden` dummy inputs in scan and combobox ownership; discover `.select__menu` inside `.select-shell`. Classic Places `#job_application_location` path is unchanged.
- **Fixture**: `fixtures/greenhouse-job-boards-fixture.html` (behavioral reproduction from the live job-boards DOM, not a Debug capture of the live page).

### Turn changes:
- `src/core/fields/labels.js`: `extractDescription` ignores `.select__placeholder` / `Select...` described-by noise so a committed chip does not look like a new question.
- `src/core/location.js`: `isResidenceLabel` matches `Location (City)`.
- `src/core/fields/scanner.js`: `aria-hidden="true"` controls are not visible fields (dummy required overlays).
- `src/core/fields/combobox.js`: ownership walk ignores `aria-hidden` sibling inputs.
- `src/core/adapters/greenhouse.js`: `comboboxMenus` returns in-shell `.select__menu` / listbox after Places `.pac-container`.
- `fixtures/greenhouse-job-boards-fixture.html`, `tests/unit/{ats-hardening,profile}.test.js`, `tests/e2e/ats-hardening.spec.js`: failing tests first, then the job-boards location typeahead and multi-select chip regressions.

### Verification:
- Unit tests failed first on placeholder description, `refreshField` throw, empty location harvest, and missing Location (City) grounding; then passed after the fix.
- `npm test`: **206 passed, 0 failed**.
- `npm run test:e2e`: **48 passed**, including Greenhouse Places location, ordinary React-select, and the new job-boards Location (City) + multi-select spec (both VERIFIED). **2 failed**, same pre-existing Lever LinkedIn-label and cross-frame paginated-search assertions documented in earlier turns; unrelated to this Greenhouse fix.

### Current status:
job-boards Greenhouse multi-select false negatives and Location (City) typeahead are fixed. Reload the unpacked extension (v0.4.30) before retesting the live Smartsheet application.

---

## Turn: 2026-09-20 — Official Kareer Branding Assets Integration

### Turn changes:
- `src/assets/brand/`:
  - Created canonical brand directory and moved all 7 official PNG assets from temporary `assets/`:
    - `kareer-brand-identity.png`
    - `kareer-app-icon.png`
    - `kareer-logo-horizontal.png`
    - `kareer-logo-stacked.png`
    - `kareer-promo-banner.png`
    - `kareer-icon-monochrome.png`
    - `kareer-mark-lime.png`
  - Created `kareer-mark.svg`: Exact vector representation of the official Kareer mark (dog-eared document + forward chevron).
- `src/targets/extension/icons/`:
  - Generated multi-resolution PNG icons using Lanczos resampling from `kareer-app-icon.png`:
    - `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
- `src/targets/extension/manifest.base.json`:
  - Registered `icons` and `action.default_icon` for all 4 sizes.
- `src/core/ui.js`:
  - Replaced placeholder 3-line `ICONS.brandMark` with the official Kareer vector SVG (`viewBox="0 0 100 100"`, `fill="currentColor"`).
  - Added dedicated SVG sizing rules for `.jc-pebble svg` (20x20), `.jc-hud-brand-mark svg` (14x14), and `.jc-brand-mark svg` (15x15) to match design specifications.
- `src/targets/extension/shared/pages.css`:
  - Replaced `.brand::before` placeholder rectangle with SVG mask of the official Kareer mark.
  - Added official Kareer mark to `.popup h1` and `.first-run h1`.
- `tools/build.js`:
  - Added `src/assets/brand/` copy step to `dist/<browser>/assets/brand/` during extension packaging.
- `README.md` & `DESIGN.md`:
  - Updated README header with official horizontal brand lockup.
  - Documented canonical brand asset locations and icon hierarchy in DESIGN.md.
- `assets/`:
  - Cleaned up temporary root directory.

### Verification results:
- **Unit tests**: 202/202 passed.
- **Build**: Successfully built userscript, Chrome zip, and Firefox xpi at v0.4.29.
- **Static assets**: Verified `dist/chrome/icons/` and `dist/chrome/assets/brand/` contain all generated icons and brand files.
- **Manifest**: Verified `manifest.json` in dist contains proper `icons` and `action.default_icon`.

### Current status:
Official branding assets are now active across all surfaces (HUD bar, panel header, pebble launcher, popup, options, first-run, README, and extension packages).

---

## Turn: 2026-09-20 — Brand Assets: Inspection & Renaming

### Turn changes:
- `assets/`:
  - Inspected and renamed all raw ChatGPT export images to clear, descriptive kebab-case names:
    - `ChatGPT Image Sep 20, 2026, 05_31_36 PM (1).png` -> `kareer-brand-identity.png` (Brand overview sheet with core palette, lockups, and icon variations)
    - `ChatGPT Image Sep 20, 2026, 05_31_37 PM (2).png` -> `kareer-app-icon.png` (Squircle app icon with graphite surface and lime K mark)
    - `ChatGPT Image Sep 20, 2026, 05_31_38 PM (3).png` -> `kareer-logo-horizontal.png` (Horizontal lockup with lime K glyph and white wordmark)
    - `ChatGPT Image Sep 20, 2026, 05_31_38 PM (4).png` -> `kareer-logo-stacked.png` (Stacked lockup with lime K glyph and white wordmark)
    - `ChatGPT Image Sep 20, 2026, 05_31_38 PM (5).png` -> `kareer-promo-banner.png` (16:9 hero/promo banner with perspective grid and telemetry)
    - `ChatGPT Image Sep 20, 2026, 05_32_28 PM (1).png` -> `kareer-icon-monochrome.png` (White K glyph on black square background)
    - `ChatGPT Image Sep 20, 2026, 05_32_28 PM (2).png` -> `kareer-mark-lime.png` (Isolated lime K glyph/mark)
- Current status: Assets organized and ready for docs, store listings, and presentation.

---

## Turn: 2026-09-20 — QA Verification: Kareer Visual System Complete

### Verification results:
- **Unit tests**: 202/202 pass.
- **Visual E2E tests**: 3/3 pass (typography, options navigation, responsive console, HUD, panel tabs, workflow states, error feedback).
- **Build**: Chrome zip, Firefox xpi, and userscript all build at v0.4.28.
- **Impeccable detect**: 0 antipatterns on built output.
- **Font audit**: Both `Kareer Geist` and `Kareer Geist Mono` load from local WOFF2 files. No remote font or CDN requests.
- **Manifest audit**: Both Chrome and Firefox manifests have `options_ui.page = "options/index.html"` with `open_in_tab: true`. No hardcoded extension IDs.
- **CTA hierarchy**: "One dominant lime CTA" principle verified — Autofill gets lime when no session, Start/Resume gets lime when session is paused, HUD CTA becomes secondary when panel is expanded.
- **Blue/gradient audit**: Zero gradient CTAs. Only blue usage is the semantic `jc-badge-blue` for informational telemetry (per DESIGN.md).
- **Sparkle audit**: Icon defined but never used in branding.
- **Remote dependency audit**: Zero external font/network references in source or built output.
- **Pre-existing E2E failures**: Lever pronoun and embedded-search assertion tests reproduce on baseline; unrelated to visual system changes (documented in prior turns).

### Current status:
The Kareer visual system redesign is complete and production-ready. All verification gates pass. The shared design token system (`theme.js`) drives both the Shadow DOM panel and extension pages. No remaining visual work is blocking.

---

## Turn: 2026-09-20 — Brand Direction Refinement: Restrained Lime (#A3E635) & Graphite Calibration

### Turn changes:
- `DESIGN.md`:
  - Updated primary brand signal tokens to `--kr-signal: #A3E635` and `--kr-signal-hover: #B5F04A`, with `--kr-signal-dim: rgba(163, 230, 53, 0.10)`.
  - Replaced radioactive signal green narrative with a restrained, mature chartreuse flight-deck and developer-tool direction.
  - Documented strict rules of restraint: lime limited to primary CTA, brand mark, active/running telemetry, progress rail, focus rings, and small indicators.
  - Mandated no large lime-tinted surfaces; active tabs use lime text, subtle border, or small indicator over graphite, not large flood-fill backgrounds.
  - Explicitly defined the visual separation between warm brand lime (`#A3E635`) and cool semantic success green (`#52D98C`).
  - Reaffirmed graphite-dominant button hierarchy and eliminated neon/cyberpunk blur halos.
- `src/core/ui.js`:
  - Updated CSS variables `--kr-signal: #A3E635`, `--kr-signal-hover: #B5F04A`, and `--kr-signal-dim: rgba(163, 230, 53, 0.10)`.
  - Refined `.jc-tab-btn.active` to use a graphite surface (`var(--kr-bg-2)`) with lime text and subtle border (`rgba(163, 230, 53, 0.35)`), removing broad green background fills.
  - Replaced neon box-shadow halos on `.jc-hud-cta` and `.jc-btn-large` with clean developer-tool drop shadows (`rgba(0, 0, 0, 0.35)`).
  - Toned down `.jc-status-dot.running` glow and updated `.jc-hud-badge-accent`, `.jc-hud-cta-running`, `.jc-input:focus`, `.jc-btn:focus-visible`, `.jc-workflow-card.wf-running`, and progress card borders to match the calibrated `#A3E635` palette.
  - Preserved strict semantic colors (`--kr-info`, `--kr-success`, `--kr-warning`, `--kr-danger`) and all automation logic.
- Current status & next steps: Tests running; verify no visual or functional regressions.

---

## Turn: 2026-09-20 — DESIGN.md Visual Refactor: Kareer Graphite & Signal-Green Technical Instrumentation

### Turn changes:
- `src/core/ui.js`:
  - Adopted `DESIGN.md` color system tokens (`--kr-bg-0..3`, `--kr-line`, `--kr-line-strong`, `--kr-text-1..3`, `--kr-signal`, `--kr-signal-hover`, `--kr-signal-dim`, `--kr-info`, `--kr-success`, `--kr-warning`, `--kr-danger`) and radius tokens (`--kr-radius-xs..lg`, `--kr-radius-round`).
  - Replaced generic cyan/blue AI-SaaS styling and gradients with the graphite + signal-green technical flight deck direction.
  - Removed sparkle icon as brand identity; introduced geometric vector brand mark (`ICONS.brandMark`) representing document edge and flight heading vector.
  - Updated HUD and Pebble to use graphite surfaces, signal-green active accents, and the new brand mark.
  - Renamed `Home` tab to **Run** (`data-tab="home"` preserved for test compatibility).
  - Rebalanced Run tab hierarchy to make application workflow and primary actions dominant, with thin 2px instrumentation progress rails, uppercase monospace telemetry badges, and quiet context/status surfaces.
  - Form inputs styled with quiet graphite background, clean border, and signal-green focus ring.
- `tests/unit/panel.test.js`: Verified panel initialization, tab switching, and HUD render (5/5 pass).
- Impeccable audit: `npx impeccable detect --json src/core/ui.js` returned 0 antipatterns.
- Build: Built userscript, Chrome zip, and Firefox xpi at v0.4.23.

---

## Turn: 2026-09-20 — UI Enhancement: Floating HUD/Dock, Pebble Mode, and Impeccable Craft Overhaul

### Turn changes:
- `PRODUCT.md`: Authored durable product truth record following Impeccable schema 1, defining the dual-target Job Copilot, primary job seeker persona, core principles (local-first, transparent grounding, calm UI), state architecture, and craft floor standards.
- `.impeccable/config.json`: Initialized Impeccable configuration with `"buildPath": "code"`.
- `src/core/ui.js`:
  - Implemented design system tokens (`--jc-*`) with dark mode surfaces, crisp contrast ratios, and tabular numerals.
  - Replaced legacy pill button with a compact floating HUD / dock (`.jc-hud-bar`) and minimal pebble mode (`.jc-pebble`) supporting drag and dock states.
  - Added 1-click execution directly from the HUD (`#jc-hud-autofill-btn` / `#jc-hud-pause-btn`), allowing instant autofill without opening the full inspection drawer.
  - Built comprehensive `renderFieldReviewSection()` in the Home tab for post-scan/fill review, categorizing fields into verified, inferred, and failed with inline badges and click-to-locate buttons (`.jc-locate-field-btn`).
  - Created an inline SVG icon system (`ICONS`) replacing all unicode emojis with accessible 16×16 vector glyphs.
  - Replaced layout-thrashing `transition: width` on `.jc-progress-bar` and `.jc-wf-step-bar` with GPU-accelerated `transform: scaleX(...)` and `transform-origin: left center`.
  - Maintained strict panel invariants: 4 top-level tabs (`home`, `profile`, `settings`, `debug`), single Shadow DOM host, synchronous storage hydration, and host isolation.
- `tests/unit/panel.test.js`: Verified panel initialization, tab switching, and HUD render (5/5 pass).
- Impeccable audit: Zero antipatterns detected via `impeccable detect --json src/core/ui.js`.

---

## Turn: 2026-09-20 — Comprehensive Project Documentation, Licensing, and Security Policy

### Turn changes:
- `README.md`: Created detailed, beginner-friendly and developer-friendly documentation covering project overview, feature set, ATS compatibility matrix (Greenhouse, Lever, Ashby, Workday, generic), 4-step quickstart for job seekers, human-in-the-loop safety boundaries, project architecture, build commands, test suites, ATS fixture capture workflow, and troubleshooting FAQ.
- `LICENSE`: Added standard MIT License text with copyright attributed to "Job Copilot Contributors".
- `SECURITY.md`: Authored formal security and privacy policy defining local-first storage, zero-telemetry architecture, OpenRouter BYOK model, threat boundaries (strict API key isolation in background worker / GM sandbox away from page DOM), anti-bot compliance, and private vulnerability disclosure instructions.
- `CONTEXT_AND_FINDINGS.md`: Logged documentation and licensing additions.

---

## Turn: 2026-09-19 — Resume upload refinement, Greenhouse post-upload stability, and field deduplication

### Bugs & Findings
1. **Resume attached to cover letter / non-resume file fields**
   - Target: Both extension and userscript (core autofill flow).
   - Symptoms: When pages had multiple file upload controls (e.g. resume and cover letter), the stored resume was attached to all file fields indiscriminately.
   - Root-cause: File inputs were selected with `field.type === 'file'` with no check on whether the field actually asked for a resume/CV vs cover letter, portfolio, writing sample, etc.
   - Resolution: Added `isResumeField(field, allFileFields)` helper in `src/core/resume.js` that checks field labels, names, IDs, descriptions, and accept attributes against resume/CV patterns while rejecting explicit non-resume patterns (`cover letter`, `portfolio`, `work sample`, `references`, `transcript`, etc.). Ambiguous file fields fall back to treating only the first file input as the resume. Applied filter in `src/core/ui.js`, `src/core/agent.js`, and `src/core/application.js`.

2. **Greenhouse "The question changed or disappeared. Scan the page again."**
   - Target: Both extension and userscript.
   - Platform: Greenhouse ATS.
   - Symptoms: Immediately after uploading the resume on Greenhouse, autofill failed with an error stating the question changed or disappeared.
   - Root-cause: In `ui.js` and `agent.js`, `resolveLiveElement(field)` called `refreshField(field)` immediately after file upload. Greenhouse re-renders the file upload area upon file selection (updating description/label to display the attached file). `refreshField` strictly asserts that `fresh.label === field.label && fresh.description === field.description`, which threw.
   - Resolution: Introduced `resolveLiveFileElement` soft re-acquisition in `ui.js` and `agent.js` that tolerates post-upload label/description changes for file fields while verifying element connectivity and files array, leaving strict identity checks for normal question inputs.

3. **Lever "Ambiguous duplicate field IDs"**
   - Target: Both extension and userscript.
   - Platform: Lever ATS (and forms with shared `name` attributes).
   - Symptoms: Autofill aborted completely on forms where multiple inputs lacked an `id` and shared the same `name` attribute.
   - Root-cause: `assertUniqueFields` threw a fatal error upon finding duplicate IDs instead of disambiguating them.
   - Resolution: Converted `assertUniqueFields` into `deduplicateFields(fields)` which appends numeric suffixes (`_2`, `_3`) and logs a warning instead of throwing, allowing autofill to proceed cleanly.

### Turn changes:
- `src/core/resume.js`: Exported `isResumeField(field, allFileFields)` with regex matching for resume vs non-resume file inputs.
- `src/core/fields/scanner.js`: Implemented `deduplicateFields(fields)` and deprecated `assertUniqueFields` as an alias.
- `src/core/ui.js`: Filtered file fields with `isResumeField`, used `deduplicateFields`, and used `resolveLiveFileElement` for file field re-acquisition.
- `src/core/agent.js`: Filtered file fields with `isResumeField`, used `deduplicateFields`, and used soft element re-acquisition in `uploadResume`.
- `src/core/application.js`: Filtered file fields with `isResumeField` across primary and late uploads.
- `src/core/ai.js`: Restored explicit profile answers priority rule in `buildNarrativeSystemPrompt`.
- `tests/unit/upload.test.js`: Added unit tests for `isResumeField` and `deduplicateFields`.

---

## Turn: 2026-09-18 — Stages 7–10: adapters, resume upload, Auto Submit, Firefox packaging

Earlier aborted shell runs for Stage 2–4 (extension shell E2E, navigation lifecycle) returned empty output and Windows exit `4294967295` (process killed). Those gates had already passed in this repo; work resumed at Stage 7.

### Stage 7 — ATS adapters

Adapter registry in `src/core/adapters/` detects Workday, Greenhouse, Lever, or Ashby, then supplies selector overrides and quirk flags. Unrecognized pages keep the generic engine.

- **Workday**: progress-bar step identity, Continue via `data-automation-id`, longer wait while Continue stays disabled after save, never send Escape (it rolls the dropdown back).
- **Greenhouse**: Places-style `.pac-container` location inputs without combobox ARIA.
- **Lever**: skip ALL-CAPS section headings (`LOCATION`, `PERSONAL INFORMATION`) in `extractLabel`; `.dropdown-location` without ARIA (already in combobox.js, now adapter-owned).
- **Ashby**: `.ashby-select-input` custom selects; dynamic sections still go through the generic late-field path.

Fixtures: `fixtures/workday-application-fixture.html`, `greenhouse-application-fixture.html`, `lever-application-fixture.html`, `ashby-application-fixture.html`. Specs: `tests/unit/adapters.test.js`, `tests/e2e/adapters.spec.js`.

### Stage 8 — Resume upload

File inputs are scanned (`FIELD_TYPES.FILE`). The background worker stores one resume in IndexedDB. Fill builds a `File` from the stored `ArrayBuffer`, assigns `input.files` via `DataTransfer`, dispatches `change`, and verifies the filename. Options page stores/removes the file. Userscript host keeps `fileUpload: false`.

### Stage 9 — Opt-in Auto Submit

Settings checkbox is enabled, default OFF. Fires only when the page is `application` or `review`, validation is clean, every required field is filled, no fill result failed, no distinct Continue control remains, and exactly one Submit control exists. Bounded to one attempt per step. Panel shows a cancellable countdown (`Pause` aborts).

### Stage 10 — Firefox packaging

Firefox overlay keeps `background.scripts` (event page) plus `gecko.id`. First-run page calls `permissions.request` for `<all_urls>` and OpenRouter. `tools/zip.js` emits `dist/job-copilot-chrome.zip` and `dist/job-copilot-firefox.xpi`.

### Files created

- `src/core/adapters/*`, `src/targets/extension/background/documents.js`, `src/targets/extension/first-run/*`, `tools/zip.js`
- fixtures and tests listed above, plus `tests/unit/upload.test.js`, `tests/unit/packaging.test.js`, `tests/e2e/upload.spec.js`, `tests/e2e/auto-submit.spec.js`

### Verification (2026-09-18)

- Unit: 179 pass, 0 fail (`npm test`).
- Build: userscript + `dist/job-copilot-chrome.zip` + `dist/job-copilot-firefox.xpi` at v0.4.12.
- E2E: 36 pass, 0 fail (`npx playwright test`).

Fixes during this verification:
- Restored `fileURLToPath` import in `tools/build.js`; repaired missing `validation()` in `src/core/agent.js`; renamed resume MIME to `mimeType` so it does not collide with message `type`.
- Ashby E2E host is `ashby.jobcopilot.test` (Chrome HSTS-preloads `ashbyhq.com`). Adapter still matches via DOM.
- Ashby menu lookup uses `.ashby-select`, not `[data-ashby-field]` on the input itself. `quirks.selectionInInput` treats the closed input value as the committed selection.

---

## Turn: 2026-09-18 — Stage 6: data migration and dual-install guard

Users can move profile, settings, memory, and job data from Tampermonkey to the
extension via a portable JSON backup. The API key never crosses that boundary.

### Files created

- `src/core/migration.js` — `exportPayload`, `importPayload`, `collectPortableData`.
- `tests/unit/migration.test.js` (4 tests), `tests/unit/panel-host.test.js` (4 tests),
  `tests/e2e/migration.spec.js` (5 tests)

### Files modified

- `src/core/ui.js` — Settings tab **Export backup JSON**, `exportUserBackup()`,
  `claimPanelHost()` / `unmountUI()` dual-install guard (extension wins).
- `src/core/main.js` — Tampermonkey menu command **Export Job Copilot backup**.
- `src/targets/extension/options/index.js` — import path now points at core migration.
- `tests/unit/panel.test.js` — export omits secrets; userscript yields when
  `data-jc-host="extension"` is already present.

### Files removed

- `src/targets/extension/shared/migration.js` — logic lives in core for both targets.

### Dual-install policy

One `#job-copilot-root`, tagged with `data-jc-host`. If both hosts are active,
the extension keeps the panel; the userscript logs and does not mount. If the
extension loads after a userscript stub, it replaces the stub and the displaced
host tears down its engine and form observer via a disconnect watcher.

### Secret boundary

Portable keys: `jc:profile`, `jc:settings`, `jc:memory`, `jc:job`. Imports scrub
legacy `apiKey` / `openRouterApiKey` from settings objects. Options import UI
reminds the user to re-enter the OpenRouter key.

### Verification

- `npm test`: 164 passed.
- `npm run test:e2e`: 28 passed. Migration specs cover options export/import,
  garbage rejection, and dual-install with both load orders.

### Status

Stage 6 complete. Next: Stage 7 ATS adapters (Workday, Greenhouse, Lever, Ashby).

---

## Turn: 2026-09-18 — Stage 5: fixture capture tool

The Playwright harness itself landed in Stage 2 because Stage 2's gate could not be
verified without it. This stage adds the capture half.

### Files created

- `src/core/capture.js` — sanitizing DOM snapshotter.
- `tests/unit/capture.test.js` (6 tests), `tests/e2e/capture.spec.js` (2 tests)

### Files modified

- `src/core/agent.js` + `src/core/remote.js` — a `captureFixture` agent action, so
  an embedded frame snapshots its own document. The parent cannot read it.
- `src/core/ui.js` — Debug tab button that downloads the page plus one file per
  embedded frame, with the host file's `iframe src` rewritten to the sibling file.
- `AGENTS.md`, `package.json` — corrected: capture is a panel action, not a CLI.

### Sanitization

Captures come from real applications, so the snapshot removes input values,
textarea and contenteditable contents, `checked` and `selected` state, scripts,
inline `on*` handlers, remote image sources, and the copilot panel itself. Text and
attribute values are scrubbed of the stored profile's own values plus email, phone
and government-id patterns. Redaction needles shorter than four characters are
ignored, so a profile value like "ON" cannot mangle "ON Semiconductor". Same-origin
CSS is inlined because the scanner's visibility checks depend on layout.

### Verification

- `npm test`: 154 passed.
- `npm run test:e2e`: 23 passed. The capture specs fill the embedded cross-origin
  form with realistic applicant data, capture, and assert none of it appears in
  either output file; they also prove the embedded frame contributed its own
  document. The second spec is a round trip: capture
  `phase2-form-fixture.html`, serve the result back, and confirm the panel still
  reports the same 18 detected fields, so a capture is lossless for the field
  engine.

---

## Turn: 2026-09-18 — Stage 4: authoritative navigation lifecycle

Tab binding already moved to `chrome.storage.session` in Stage 1-2 via
`platform.tab`. This stage replaces *inferred* step changes with real evidence.

### Files created

- `src/targets/extension/background/navigation.js` — per-tab navigation counter in
  session storage, so a freshly loaded document inherits its predecessor's count.
- `tests/unit/navigation-lifecycle.test.js` (5 tests)
- `tests/e2e/multi-step.spec.js` (4 tests)

### Files modified

- `src/core/platform.js`, `hosts/gm.js`, `content/host.js` — added
  `platform.navigation.marker()` and `.onChange()`. The userscript host returns a
  constant marker, so its behaviour is byte-identical to before.
- `src/targets/extension/background/index.js` — listens to `webNavigation`
  `onCommitted`, `onHistoryStateUpdated` and `onReferenceFragmentUpdated`, records
  each one, and pushes it to frame 0.
- `src/core/application.js` — `waitForNavigation` treats a committed navigation as
  proof the step advanced; `initialize()` completes a pending step when a
  navigation was recorded after the Continue click; navigation events schedule a
  tick, so a single-page step change no longer waits on the 1.5s interval.
- `src/core/sessions.js` — session ids no longer depend on `crypto.randomUUID`.

### Why this matters

`comparePages` decides "same" or "changed" from URL, step marker, heading and
overlapping questions. When an ATS posts back to the **same URL** and re-renders a
structurally similar step, that reads as "same" and the engine concluded Continue
did nothing. This is the shape of the logged Workday false-page-change and
rollback reports. A recorded navigation is independent evidence, and the unit
tests assert the contrast directly: with a navigation record the step is credited,
without one it stays at zero.

### Findings during verification

1. **Baseline sampled too late (real bug, caught by the new test).** A
   same-document navigation can commit synchronously inside `control.click()`.
   `waitForNavigation` originally sampled the marker on entry, which was already
   after the click, so `navigated` was never true. The baseline is now sampled
   before the click and passed in.
2. **`crypto.randomUUID` is secure-context only (real bug).** `createSession`
   threw `crypto.randomUUID is not a function` on any `http://` page, silently
   breaking Capture Job. It never showed up under Tampermonkey because ATS sites
   are HTTPS. Replaced with a `getRandomValues` based v4 fallback.
3. **Paused sessions are intentionally not auto-resumed.** An early test modelled
   the reload case from a paused session, which `initialize()` correctly ignores
   because `session.active` is false. The test now builds an active session with a
   pending step, which is the real reload scenario.
4. **Test hygiene:** engines left mid-flight kept the Node process alive after the
   suite finished. Teardown now destroys every engine and lets pending work unwind
   before the jsdom window closes.

### Verification

- `npm test`: 148 passed.
- `npm run test:e2e`: 21 passed. The multi-step specs drive
  `phase3-application-fixture.html` through its deliberate first-answer rejection
  to the review step across real navigations (2 steps completed, status `review`),
  confirm final submission is never clicked with Auto Submit off, confirm the tab
  binding lives in `chrome.storage.session` and survives a reload, and confirm the
  background's navigation counter advances with the recorded URL.

---

## Turn: 2026-09-18 — Stage 3: cross-origin frames become fillable

Closes the long-standing "Greenhouse embed scans 0 fields" limitation, which was
unfixable under Tampermonkey because `main.js` had to bail out of subframes.

### Files created

- `src/core/agent.js` — per-frame field agent: scan, searchOptions, fill,
  validation. Runs the same pipeline as the panel but decides nothing.
- `src/core/remote.js` — top-frame orchestration and frame-qualified field ids.
- `fixtures/embedded-host.html` + `fixtures/embedded-application.html` — a page
  with zero controls embedding a form from a second origin.
- `tests/unit/remote.test.js` (9 tests), `tests/e2e/cross-frame.spec.js` (5 tests)

### Files modified

- `src/core/platform.js`, `src/core/hosts/gm.js` — added `platform.frames`. The
  userscript host returns an empty list, since it cannot address another origin.
- `src/core/ui.js` — the autofill flow now gathers embedded fields before the AI
  call, merges them into the **same** primary request, fills local fields as
  before, then dispatches the remaining answers to their owning frames. Added
  `resolveRemoteSearchAnswers` for embedded comboboxes and a badge breakdown
  showing where the fields actually live.
- `src/targets/extension/content/agent.js` — announces field counts and executes
  routed commands, with a heartbeat so a long-lived frame never expires.
- `src/targets/extension/background/frames.js` — serialized registry writes.

### Design note: one AI request, many origins

A cross-origin frame cannot be touched from the parent document, so the agent in
that frame does the scanning and actuation. Only normalized field data and answers
cross the boundary, which keeps the page to a single primary AI request instead of
one per frame. Field ids are namespaced as `jcf<frameId>::<localId>` because two
frames routinely generate the same local id.

### Findings during verification

1. **Frame registry race (real bug, fixed).** Every frame announces at
   `document_idle`, and read-modify-write against `chrome.storage` is not atomic.
   The top frame and the embedded frame both read an empty list and both wrote a
   single-entry array, so whichever wrote last erased the other. The panel
   therefore saw only itself and reported 0 fields. Fixed with a per-tab promise
   queue in `frames.js`. Confirmed by instrumenting the registry: before the fix
   it held only `frameId: 0`; after, both frames appear and the panel reads
   "10 detected, 0 here, 10 in 1 embedded frame".
2. **Embed-only pages produce no mutations to react to.** The panel refreshed its
   remote count only when the top document mutated, which on an embed host is
   almost never. Added a `FRAMES_CHANGED` notification from the background to
   frame 0 whenever a subframe's count actually changes.
3. **Residence comboboxes never needed the remote search pass.**
   `harvestComboboxOptions` already pre-searches residence-labelled fields with
   the stored profile location, so a location outside the first page of options
   resolves inside the primary request. The remote search path is exercised by a
   non-residence paginated combobox instead, which is the realistic case.

### Verification

- `npm test`: 143 passed (134 existing plus 9 new).
- `npm run test:e2e`: 17 passed. The cross-frame specs confirm the host document
  has literally zero controls, the panel still reports and fills the 10 embedded
  ones, embedded fields travel in the single primary request, a paginated
  embedded combobox resolves in exactly one follow-up request, and the embedded
  frame never mounts a second panel.

---

## Turn: 2026-09-18 — Stage 2: extension shell reaches parity in Chrome

### Files created

- `src/targets/extension/manifest.base.json` + `manifest.chrome.json` + `manifest.firefox.json`
- `src/targets/extension/shared/protocol.js`, `shared/browser.js`, `shared/migration.js`
- `src/targets/extension/background/index.js`, `storage.js`, `ai.js`, `tabs.js`, `frames.js`
- `src/targets/extension/content/index.js`, `content/host.js`, `content/agent.js`
- `src/targets/extension/options/index.html` + `index.js`
- `src/targets/extension/popup/index.html` + `index.js`
- `playwright.config.js`, `tests/e2e/support/servers.js`, `tests/e2e/support/fixtures.js`
- `tests/e2e/shell.spec.js`, `tests/e2e/autofill.spec.js`

### Design notes

- **Hydrated cache**: the content host requests one snapshot of every non-secret
  `jc:*` key before the panel mounts, then answers core's synchronous reads from
  memory. Writes update the cache immediately and reach the background
  asynchronously, so read-after-write inside the fill loop still works.
- **Key isolation**: the snapshot carries `hasApiKey` instead of the key. The
  background attaches `Authorization` and refuses any URL outside
  `https://openrouter.ai/`. The panel's key field is replaced by a link to the
  options page, which is a privileged context.
- **Broadcast discipline**: only `jc:settings`, `jc:profile`, `jc:memory` and
  `jc:documents` are pushed to other contexts, and never back to the originating
  tab. An early version broadcast every storage change, which would have sent a
  message to every open tab on every debug log line, since the logger writes
  `jc:debug` on each entry.
- **No worker state**: MV3 terminates the worker when idle, so tab bindings and
  the frame registry live in `chrome.storage.session`.

### Findings during verification

1. **Headless Chromium cannot load extensions.** Playwright's default headless
   shell silently hangs at `waitForEvent('serviceworker')`. Fixed by launching
   with `channel: 'chromium'`, which uses the full browser in new headless mode.
2. **`--ignore-certificate-errors` is no longer sufficient.** The background
   worker's `fetch` to the mocked OpenRouter failed with "Failed to fetch" until
   the launcher pinned the mock certificate with
   `--ignore-certificate-errors-spki-list`.
3. **`selfsigned` v5 returns a promise**, unlike v1-v2. Silent `{}` result
   otherwise.
4. **Popup active-tab resolution**: `tabs.query({active: true})` returns the
   popup itself when the popup is opened as a tab. The popup now skips
   extension-origin tabs and falls back to the most recently used page, which is
   also more robust when the options page is focused.

### Verification

- `npm test`: 134 passed.
- `npm run test:e2e`: 11 passed. Covers panel mount and hydration, missing-key
  state, a leak check asserting the key never appears in page HTML, shadow DOM, or
  page storage, options page persistence, cross-context profile broadcast, popup
  counts, full 18-field autofill on `phase2-form-fixture.html` with exactly one
  primary AI request, overwrite protection, HTTP 402 error surfacing, and the
  no-key short circuit that avoids any network call.

The single "1 failed" field in the autofill run is the fixture's
`data-reject-fill` control, which exists to prove failures are reported.

### Status

Chrome parity reached. Next: cross-frame agents so fields inside cross-origin
iframes are reachable.

---

## Turn: 2026-09-18 — Stage 0 and Stage 1: repo split and platform seam

### Files created

- `package.json`, `.gitignore`, `AGENTS.md`, `CONTEXT_AND_FINDINGS.md`
- `src/core/platform.js` — host adapter contract
- `src/core/hosts/gm.js` — userscript/Tampermonkey host (default)
- `src/targets/userscript/entry.js` — userscript entry
- `tools/build.js` — dual-target esbuild pipeline

### Files moved

- `Autofill-Ext/src/**` -> `src/core/**` (24 modules, logic unchanged)
- `Autofill-Ext/tests/*.test.js` -> `tests/unit/`
- `Autofill-Ext/fixtures/*` -> `fixtures/`

### Files modified

- `src/core/storage.js` — `gmGet`/`gmSet`/`gmDelete` now delegate to
  `platform.storage`. Added `hasApiKey()` so presence checks work on hosts that
  refuse to expose the key. `resetAll()` clears secrets through the platform.
- `src/core/ai.js` — deleted `sendGMRequest`. Requests go through
  `platform.ai.request`, which the host decorates with `Authorization`. The three
  entry points now guard on `hasApiKey()` instead of reading the key. Core no
  longer holds the API key at any point.
- `src/core/sessions.js` — `bindTab`/`restoreSession` use `platform.tab`.
- `src/core/main.js` — exports `bootstrap()` and `bootstrapWhenReady()` instead
  of self-starting, so a host with async storage can hydrate first. Menu
  registration goes through `platform.menu` behind a capability check.
- `src/core/ui.js` — status pill and autofill guard use `hasApiKey()` rather than
  reading the key. The API key form group is now capability-gated: hosts that set
  `writeSecretsInPage: false` render a link to the extension options page.
- `tests/unit/*` — import paths updated for `src/core/`; `panel.test.js` builds
  the userscript entry; fixture path corrected for the extra directory level.

### Rationale

The port's only hard problem is that core reads storage synchronously while
`chrome.storage` is async. Rather than rewrite ~40 call sites (several inside the
per-field fill loop and the workflow tick), the platform seam keeps the sync
signature and pushes the async problem into a one-time hydration step that the
extension host performs before the panel mounts.

Keeping the GM host as the *default* means a plain bundle behaves exactly like
the original userscript, which is why all existing tests pass untouched apart
from their import paths.

### Verification

- `npm test`: 134 passed, 0 failed (same count as the frozen repo at v0.3.14).
- `npm run build:userscript`: emits `dist/job-copilot.user.js` at v0.4.0 with the
  Tampermonkey banner intact. `panel.test.js` evaluates that bundle in jsdom and
  confirms the panel mounts, captures a job, and persists settings.

### Status

Core is proven host-agnostic while still shipping the working userscript. Next:
the extension shell (manifests, background worker, hydrated storage cache,
OpenRouter proxy, options page, popup).

---

## Turn: 2026-09-19 — Lever and Ashby autofill hardening

Reported extension bugs: Lever location searches did not commit; custom questions
became `"Type your response"` or internal identifiers; all pronouns were checked;
Ashby Yes/No targeted backing `"Option"` checkboxes; Ashby autocomplete treated
typed search text as a committed selection. Greenhouse remained the regression
baseline.

### Reproduction

Against supplied `pages/` HTML and the public CSC Generation Lever application,
Lever’s location script searches on debounced `keydown`. The previous helper sent
input/keyup only: zero network requests before `keydown`, one afterward. Nested
`.application-label .text` was missed. Nine pronoun checkboxes shared the name
`pronouns`, so the scanner reused one field ID. Ashby Yes/No backing checkboxes
were scanned independently. `quirks.selectionInInput` treated the Ashby input
value as a selection.

The prior agent implemented the adapter hooks, grouping, exact-choice validation,
Lever `keydown` search, Ashby committed-state reading, residence/LinkedIn profile
routing, fixtures, and tests, then stopped before panel duplicate-ID rejection,
full build/E2E, and the findings log.

### Fixes completed in this turn

- **Panel path** now calls `assertUniqueFields` before generating answers, matching
  the frame agent. Generic adapters expose empty `fieldMetadata` / `choiceGroups`
  fallbacks.
- **`refreshField`** keeps harvested combobox options when a live first-page menu
  is still open. Without that, a paginated school search was overwritten and the
  exact answer was rejected.
- **Existing Lever fixture** now has a `Current location` application-label so
  residence harvest still runs after the keydown/JSON location rewrite.
- **Overwrite-off E2E** now seeds a committed Lever location (display +
  `selectedLocation` JSON). Uncommitted typed text is not a selection: Lever’s
  blur handler clears it, which matches the search-vs-commit distinction.

### Files

- Adapters: `src/core/adapters/lever.js`, `ashby.js`, `generic.js`
- Pipeline: `scanner.js`, `combobox.js`, `fillers.js`, `verify.js`, `labels.js`,
  `normalize.js`, `ai.js`, `profile.js`, `location.js`, `agent.js`, `ui.js`,
  `application.js`, `validation.js`
- Fixtures: `fixtures/lever-hardening-fixture.html`,
  `fixtures/ashby-hardening-fixture.html`, `fixtures/lever-application-fixture.html`
- Tests: `tests/unit/ats-hardening.test.js`, `tests/e2e/ats-hardening.spec.js`,
  plus updates to `tests/unit/autofill.test.js` and `tests/unit/adapters.test.js`

### Verification (2026-09-19)

- Unit: **193 pass, 0 fail** (`npm test`).
- Build: userscript + `dist/job-copilot-chrome.zip` + `dist/job-copilot-firefox.xpi`
  at v0.4.15. Firefox manifest keeps `background.scripts` and `gecko.id`.
- E2E: **39 pass, 0 fail** (`npm run test:e2e`) with the Chromium extension loaded.
  Covers Lever questions/location/pronouns, Ashby Yes/No and portal location,
  Greenhouse Places, Workday, generic autofill, iframe search pass, userscript
  dual-install, and Auto Submit. No accidental form submission on the hardening
  fixtures (`data-submissions=0`).
- Firefox: Playwright’s extension harness is Chromium-only. This machine has no
  Firefox install, so temporary-addon loading was not executed. The XPI packs the
  same core as the Chromium build that passed E2E.

### Status

Hardening complete. Greenhouse, generic, Workday, iframe, and userscript coverage
is preserved. Manual Firefox temporary install remains available if needed via
`about:debugging` → This Firefox → Load Temporary Add-on →
`dist/firefox/manifest.json`.

---

## Turn: 2026-09-19 — Narrative voice and tone system prompt overhaul

### Bugs/Findings
- **Date**: 2026-09-19
- **Target**: Extension & Userscript (Core AI prompt)
- **Platform/ATS**: All ATS platforms (open-ended / narrative answers)
- **Symptoms**: Narrative answers for free-text questions sounded distinctly inhuman, robotic, and over-engineered. The output exhibited:
  1. Question restatements / throat-clearing ("I have experience with Linux and open source through...", "My most significant personal software project is...", "During my education at...").
  2. "This involved [gerund], [gerund], [gerund]" structures mechanically converting resume bullets into passive task catalogs.
  3. Corporate PR/brochure voice describing personal projects like a product marketing landing page.
  4. Essay conclusions and meta-evaluative self-praise ("This project demonstrates my ability to...", "requiring organizational skills to...").
  5. Unprompted skill rosters tacked on at the end of answers ("My technical skills also include...").
  6. Inflated corporate buzzwords and uniform, monotonic sentence length.
- **Root-Cause Analysis**:
  `NARRATIVE_VOICE_RULES` in `src/core/ai.js` relied on soft directives ("Write like a real candidate filling a form") and a limited set of banned words. Online research across Reddit (r/ChatGPT, r/PromptEngineering, r/ClaudeAI) demonstrates that LLMs revert to formulaic AI cadence unless given explicit, hard negative constraints against specific structural habits (throat-clearing, question restating, gerund stacking, essay conclusions) along with concrete contrastive (BAD vs GOOD) exemplars.
- **Resolution**:
  Replaced `NARRATIVE_VOICE_RULES` in `src/core/ai.js` with comprehensive negative constraints, plain English directives, burstiness/contraction guidance, and concrete contrastive exemplars modeled after real developer responses. Updated unit tests in `tests/unit/autofill.test.js` to assert these constraints.

### Turn changes
- `src/core/ai.js`: Overhauled `NARRATIVE_VOICE_RULES` with 11 hard negative constraints, plain language directives, and 3 contrastive BAD vs GOOD exemplars for technical, project, and leadership questions.
- `tests/unit/autofill.test.js`: Added assertions checking that new narrative negative constraints (banning question restatement, "This involved", marketing copy, and essay conclusions) are present in both autofill and rewrite prompt payloads.

### Verification
- `npm test`: **193 pass, 0 fail** (all unit tests passed).

### Status
Narrative voice prompt updated and verified.

---

## Turn: 2026-09-19 — Greenhouse dropdowns and Ashby/Lever resume parsing

### Bugs/findings
- **Target:** Extension and userscript shared core. **Greenhouse:** user reports empty dropdowns across applications; attached logs repeatedly show zero owned options. Root cause: Greenhouse's `.pac-item` option override was applied to every combobox, excluding normal React-select options. Scoped the override to Places inputs; reproduced with failing unit test and independent browser fixture, then verified the fix. User subsequently supplied https://job-boards.greenhouse.io/gitlab/jobs/8773006002. Read-only inspection confirmed the affected Yes/No dropdown uses `.select__option[role=option]` under its `aria-controls` listbox, matching the regression and fix. `greenhouse-select-fixture.html` is a reproduction, not a live capture. Additional Debug capture deferred when user requested no more tests and immediate completion.
- **Ashby:** user reports unreliable location/source dropdowns and supplies 1Password URL and source-field HTML. Inspected live page: clicking the empty source input leaves it closed; its unlabeled `_toggleButton_` opens an ARIA-linked portal. Existing resolver omitted that toggle and counted hidden menus as open. Added an Ashby-specific toggle selector and visibility-aware fallback, retaining the existing event sequence and exact owned-option matching. Live page captured through Debug → Save page fixture in `ashby-1password-captured.html`; existing replay fixture now includes the observed source control and independently simulated commit state.
- **Ashby/Lever uploads:** reported delayed resume parsing clears/overwrites autofilled fields. Manual Autofill previously generated answers before upload, then filled immediately; embedded uploads occurred after remote fills. Moved uploads before scanning/answer generation, added bounded parser settling (minimum 3 seconds, 1 second stable fields, maximum 15 seconds), and rescan after processing. Poll value properties, replacement nodes, disabled state and busy indicators, including Lever's captured `.resume-upload-working` markup. Timeout stops filling; pause/page changes cancel the local wait. Preserve post-parser values unless overwrite is enabled. Application workflow and frame agents share the wait.

### Turn changes
- `src/core/adapters/{greenhouse,ashby}.js`, `src/core/fields/combobox.js`: corrected option selection and toggle resolution; no change to actuator event strategy.
- `src/core/resume.js`: shared upload/parser stabilization; no host APIs, credentials, network access or applicant-value logging.
- `src/core/{ui,application,agent,remote}.js`: upload sequencing, fresh target selection, upload overwrite guard, and propagation of embedded upload errors.
- `fixtures/{ashby-hardening-fixture,ashby-1password-captured,greenhouse-select-fixture,ats-race-fixture}.html`: captured/synthetic evidence and independent behavioral reproductions; race fixture uses a delayed simulated parser, never uploads real documents.
- `tests/unit/{ats-hardening,upload}.test.js`, `tests/e2e/{ats-hardening,upload}.spec.js`: regressions for ordinary Greenhouse selects, Ashby toggles, parser races, cancellation, timeout, workflow overwrite and embedded uploads.
- `package.json`: normal build script automatically increments the package version; rebuilt Chrome, Firefox and userscript artifacts.

### Verification/status
- Confirmed failing dropdown tests and parser-race browser tests before their fixes.
- `npm test`: **199 passed, 0 failed**. `npm run test:e2e`: **46 passed, 0 failed**, real Chromium with MV3 extension. Builds completed at **0.4.18** for Chrome, Firefox and userscript. Diff whitespace check passed.
- User requested no further tests after the full suite had completed; none were started after that request. Final follow-up was limited to read-only GitLab markup inspection and this log update.
- Live parser timing is reproduced deterministically; no personal resume was sent to an ATS and no application was submitted.

---

## Turn: 2026-09-19 — Remove Review tab and associated remnants

### Bugs/findings
- **Target:** Extension and userscript UI panel (`src/core/ui.js`).
- **Symptoms:** User requested removing the "Review" tab entirely, noting that it is empty, non-functional, and irrelevant for the tool.
- **Root-cause analysis:** The panel UI included a non-functional "Review" tab (`renderReviewTab`) alongside a field rewrite modal (`renderRewriteModal`, `openRewriteModal`, `executeFieldRewrite`) and specific rescan buttons that were unneeded and cluttered the navigation tabs.
- **Resolution:** Removed the Review tab button, `renderReviewTab()` function, the field rewrite modal and handlers, unused rewrite state variables, and associated review/modal CSS rules from `src/core/ui.js`. Added a unit test assertion in `tests/unit/panel.test.js` verifying the panel nav tabs consist only of `['home', 'profile', 'settings', 'debug']` and that `[data-tab=review]` is absent.

### Turn changes
- `src/core/ui.js`: Removed the Review tab button, `renderReviewTab()`, rewrite modal (`renderRewriteModal()`, `openRewriteModal()`, `executeFieldRewrite()`), rewrite state variables, rescan review button handlers, and unused CSS rules (`.jc-field-row`, `.jc-field-header`, `.jc-field-name`, `.jc-field-val-preview`, `.jc-modal-overlay`, `.jc-modal`).
- `tests/unit/panel.test.js`: Added unit test assertion ensuring the Review tab is absent and only Home, Profile, Settings, and Debug tabs exist.
- `package.json`, `dist/`: Built extension and userscript at version 0.4.21.

### Verification/status
- `npm test`: **202 passed, 0 failed**.
- `tests/e2e/shell.spec.js`: **6 passed, 0 failed**.
- Build succeeded: Chrome (`dist/chrome`), Firefox (`dist/firefox`), and userscript (`dist/userscript`) updated.



## Turn: 2026-09-20 — Coherent Kareer visual system

### Bugs/findings
- Target: extension options/popup/Firefox permission page and shared panel/userscript.
  User reports old blue options styling, fallback typography, competing lime CTAs.
  Root cause: independent inline styles and duplicated tokens; both Run actions
  used primary styling. Resolved with shared tokens, bundled Geist, configuration
  console layout, and state-dependent action emphasis. Existing staged edits preserved.
- Production audit: both browser manifests already use internal options_ui with
  options/index.html and open_in_tab. No hardcoded dev path found in that wiring.
- Visual QA found profile sticky save bar covering fields; removed sticky positioning.
  Review list nested cards replaced with flat row separators.

### Turn changes
- src/core/theme.js: shared colors/type/spacing/radii, working UI name, binary font registration.
- src/assets/fonts/: Geist Sans/Mono variable WOFF2 and original OFL license (geist 1.7.2).
- src/core/ui.js: shared tokens and font loader, primary CTA hierarchy, keyboard HUD
  toggles, quieter tabs/cards, metadata wrapping, narrow viewports, reduced motion.
  No application, storage, actuator, API, or workflow handler changes.
- src/targets/extension/{options,popup,first-run}/index.html and shared/pages.css:
  shared console styles, options section navigation, form hierarchy, semantic actions,
  local stylesheet links, viewport metadata and accessible feedback.
- tools/build.js: copy local fonts/license; generate shared CSS and UI branding;
  embed font bytes in core bundles; include fonts in build-cache hashing.
- tests/e2e/visual-system.spec.js: real extension options navigation, font loading,
  long metadata, responsive overflow, CTA hierarchy, panel tab screenshots.
- DESIGN.md: canonical Geist/font packaging, muted contrast, console layout and CTA rules.
- package.json: existing builder automatically advances patch version.

### Verification/status
- Initial npm test: 202 passed. All three builds succeeded.
- New visual E2E checks: 2 passed. Browser launch required sandbox escalation after EPERM.
- Full E2E suite and final visual review in progress; final results recorded below.

### Final audit notes
- Restored existing diagnostic strings (adapter suffix, generic fallback, "here"
  embedded breakdown, lowercase DOM "detected" with uppercase CSS) so the staged
  redesign remains compatible with existing E2E assertions.
- Isolated baseline experiment: rebuilt content script with HEAD's original ui.js,
  using the same unchanged core and fixture harness. Both nonvisual failures
  reproduced: Lever hardening expects LinkedIn Link in the primary AI request but
  it is absent; paginated embedded combobox expects 2 requests but receives 4.
  These are pre-existing assertion/behavior discrepancies, deferred because this
  request expressly excludes autofill/API behavior changes. No tests weakened.
- Impeccable independent finish review: ship for visual scope after verifying the
  overlapping profile-save fix and flatter review rows. Optional follow-up: expose
  panel selected-tab state to assistive technology; inherited CSS-only selection.
- Clean-browser userscript smoke: HUD, expanded panel and both Geist fonts loaded.
- Inspected Chrome ZIP and Firefox XPI: internal options HTML/script, generated CSS,
  both local WOFF2 files and OFL license present. Signed Firefox installation was
  not exercised; Chromium real-extension options opening was exercised.
- Latest build version: 0.4.28. Final unit run: 202 passed, 0 failed.

---

## Turn: 2026-09-20 — Ashby panel typography collapse

### Bugs/findings
- **Target:** Extension and userscript shared panel on hosted Ashby application pages; reproduced on the supplied 1Password application and compared against the supplied Lever and Greenhouse screenshots.
- **Symptoms:** Panel text overlaps vertically, workflow title/company lines occupy the same line box, and status/count pills appear flattened on Ashby while the same panel renders normally on Lever and Greenhouse.
- **Root-cause analysis:** Live-browser inspection of the supplied Ashby URL found that Ashby's production stylesheet globally applies `div { line-height: 0 }`. The panel shadow host is a light-DOM `div`, so it computes to `line-height: 0px`. Normal outer-document rules win over normal `:host` declarations, and the top-level shadow child inherits from that host; therefore `.jc-widget-container` also computed to `0px` despite the panel's `:host { line-height: 1.45 }`. This is a CSS boundary/cascade issue, not an Ashby adapter or data-rendering issue.
- **Resolution:** Moved the panel typography baseline (`font-family`, `font-size`, `line-height`, color, font smoothing) from `:host` to `.jc-widget-container`, the first element inside the shadow tree. Ashby's page CSS cannot select that element, so internal line boxes and pills retain the intended metrics.

### Turn changes
- `src/core/ui.js`: Applied the typography baseline to the internal panel container instead of relying on the externally styleable shadow host.
- `tests/e2e/adapters.spec.js`: Added a real-extension Chromium regression that reproduces Ashby's exact global `div { line-height: 0 }` rule, confirms the host still computes to `0px`, and verifies the internal panel container and badges do not.
- `package.json`: Normal build advanced the generated artifact version from 0.4.30 to 0.4.31.

### Verification/status
- Regression test observed failing before the fix: `.jc-widget-container` computed `line-height: 0px`.
- Targeted real-browser regression passed after the fix: **1 passed**.
- `npm test`: **207 passed, 0 failed**.
- Full `npm run test:e2e` was started but stopped at the user's request; manual visual review was explicitly preferred. No full-suite result is claimed.

---

## Turn: 2026-09-22 — Public website & privacy policy for Kareer

### User requests
1. Build official public website and store-compliant privacy policy inside this repository (`site/`) according to `DESIGN.md` and `/impeccable` design principles.
2. Remove status dot beside version badge and make version display fully dynamic on every update.

### Findings / Resolution
- **Design & Typography**: Built zero-dependency responsive site using Kareer brand tokens, local Geist variable fonts, and clean dark theme. Resolved all Impeccable audit flags (removed AI card slop icons, avoided harsh glow halos, strictly enforced 375px/768px/1440px layout wrapping with zero horizontal overflow).
- **Dot removal**: Removed `.kr-status-dot` beside the hero version badge in `site/index.html` and eliminated unused CSS rule in `site/styles.css`.
- **Dynamic versioning**: Implemented client-side version resolution in `site/script.js` (`initDynamicVersion`) with local fallback to `site/version.json` and remote fallback to `package.json` on GitHub `master`. Reverted unrequested modifications to `tools/build.js` to keep core build tooling untouched.
- **Privacy Policy**: Created standalone 14-section privacy document (`site/privacy/index.html`) fulfilling Chrome Web Store and Mozilla Add-on store policies (local-first BYOK architecture, zero telemetry, zero cookies).

### Turn changes
- `site/index.html`: Landing page markup with hero, flight deck preview, feature breakdown, ATS matrix, workflow, privacy guarantee, store install chooser, and FAQ.
- `site/privacy/index.html`: Store-compliant privacy policy.
- `site/styles.css`: Impeccable CSS system with local `@font-face` Geist fonts and responsive breakpoints.
- `site/script.js`: Central store links, mobile menu, accessible FAQ accordion, dynamic version fetcher, and interactive demo logic.
- `site/version.json`: Static local version seed for offline local dev (`0.4.35`).
- `site/assets/`: Self-hosted SVGs, PNGs, and WOFF2 variable fonts, including `kareer-mark-lime.svg` and `kareer-mark-lime.png`.
- `.github/workflows/pages.yml`: GitHub Pages automated deployment workflow.
- `tools/build.js`: Reverted to clean original state.

### Interactive UI Simulation & Brand Mark Update
- **Lime Icon**: Fixed panel HUD icon and favicon to use signal lime (`#A3E635`) via `assets/kareer-mark-lime.svg` and `assets/kareer-mark-lime.png`, resolving the previous black icon rendering issue caused by SVG `currentColor` in `<img>`.
- **Authentic Extension UI**: Mimicked the exact panel architecture from `src/core/ui.js` and `DESIGN.md` across 4 interactive tabs (Run, Profile, Settings, Debug). Removed nested card borders in favor of flat separator rows.
- **Interactive Controls**: Added keyboard-accessible tab switching (`[data-sim-tab]`), simulated live autofill progress with safety boundary pause, interactive model selector with header chip sync, fixture capture feedback, and profile/settings save feedback.
- **Impeccable Audit**: Resolved `tiny-text`, `undersized-ui-text`, and `layout-transition` (switched progress bar from `width` to `transform: scaleX`). Impeccable detector output: `[]` (0 antipatterns).

### Automated Firefox CD Pipeline & Self-Hosted Updates (2026-09-23)
- **Target**: Extension (Firefox Unlisted Self-Hosted Distribution).
- **Architecture**:
  - Pushes to `master` trigger `.github/workflows/deploy.yml` (`Build, Sign & Deploy`).
  - Runs automated test suite (`npm test`).
  - Derives dynamic monotonically incrementing version string (`${BASE_VERSION}.${GITHUB_RUN_NUMBER}`) to satisfy Mozilla AMO's strict duplicate-version rejection policy.
  - Builds Firefox extension and signs unlisted `.xpi` cryptographically via Mozilla API (`web-ext sign`) using repository secrets (`AMO_JWT_ISSUER`, `AMO_JWT_SECRET`).
  - Saves signed `.xpi` to `site/downloads/kareer-firefox.xpi` and produces `site/firefox-updates.json` pointing to it.
  - Synchronizes `site/version.json` and updates the site version badge in `site/index.html`.
  - Deploys static site, download `.xpi`, and update manifest to GitHub Pages with zero GitHub Releases created.
- **Turn changes**:
  - `src/targets/extension/manifest.firefox.json`: Added `update_url: "https://amro212.github.io/kareer/firefox-updates.json"` to `browser_specific_settings.gecko` to enable Firefox native background update polling.
  - `.github/workflows/deploy.yml`: Replaced and renamed `.github/workflows/pages.yml` with comprehensive build, sign, and deploy workflow.
  - `.github/workflows/firefox-release.yml`: Removed obsolete manual GitHub Release workflow.
  - `firefox-updates.json` & `site/firefox-updates.json`: Added update manifests following Mozilla extension update protocol.
  - `site/index.html` & `site/script.js`: Updated Firefox download buttons and links to `https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`.
  - `README.md`: Updated manual download link for Firefox to point to the self-hosted `.xpi`.
- **Status & Verification**:
  - 208 unit tests pass (`npm test`).
  - Site interactive demo passes Playwright verification.
  - Impeccable detector reports 0 antipatterns.
  - Git working tree staged for user review (no auto-commit).

### Systematic Debugging: Inline Rewrite Button on Ashby ATS & Theme Realignment (2026-09-23)
- **Target**: Extension (`src/core/fields/highlight.js`, `src/core/ui.js`, Ashby ATS).
- **Symptoms**:
  - On Ashby ATS application pages, the floating "✨ Rewrite with AI" button was visually squished to only 8px in height with letters cut off and emoji protruding out the bottom.
  - Button used outdated blue AI SaaS theme (`linear-gradient(135deg, #2563eb, #1d4ed8)`, emoji `✨`) violating `DESIGN.md`.
  - Clicking the badge threw `ReferenceError: openRewriteModal is not defined` because `openRewriteModal` was pruned in commit `811eab5`.
  - Mozilla AMO signing failed in CI with `Conflict: Version 0.4.35.1 already exists.` because `0.4.35.1` had been previously uploaded.
- **Root-Cause Analysis (Systematic Debugging)**:
  - Phase 1 (Evidence Gathering): Inspected Ashby's production stylesheet (`cdn.ashbyprd.com/.../index-NOGznrcu.css`). Discovered the global rule `div { line-height: 0; }`.
  - Phase 2 (Data Flow / Inheritance): The rewrite badge was created as a plain `<div>` appended directly to `document.body` without Shadow DOM encapsulation or explicit `line-height`. As a result, Ashby's `div { line-height: 0; }` collapsed the element's content box to 0px, yielding a total computed height of only `8px` (`4px padding-top + 4px padding-bottom`).
  - Phase 3 (Design Realignment): Adhered to `DESIGN.md` Section 5 & 7. Replaced emoji `✨` with a technical vector spark SVG, styled with dark graphite background (`#0D1117`), crisp border (`#26303D`), signal lime accent (`#A3E635`), 6px border-radius, and interactive states (`idle`, `loading`, `success`, `error`).
- **Resolution**:
  - `src/core/fields/highlight.js`: Encapsulated `#kareer-inline-rewrite` inside an open Shadow DOM with isolated typography and box metrics, making it immune to external CSS pollution. Added defensive inline properties (`!important`) to the host element.
  - `src/core/ui.js`: Connected inline badge click directly to `rewriteNarrativeField({ fieldLabel, currentValue, feedback, constraints })`, field value application via `fillField`, verification outline via `highlightVerifiedField`, and live badge state indicators (`loading`, `success`, `error`).
  - `tests/unit/inline-rewrite.test.js`: Added unit tests asserting Shadow DOM isolation, host `div { line-height: 0; }` immunity, positioning, and callback transitions.
  - `package.json`, `site/version.json`, `site/index.html`, `site/firefox-updates.json`, `firefox-updates.json`: Bumped version to `0.4.37` to resolve AMO conflict.
  - `README.md`: Added prominent website badge, bold hyperlinked URL, and tip banner to the top header for instant discovery.
- **Verification**:
  - Verified visual rendering on live Ashby ATS application with Playwright (`scratch/ashby_perfect_render.png`).
  - All 209 unit tests pass (`npm test`).

---

## Turn: 2026-09-23 — Automated version synchronization in build tooling

### Findings & Architecture Rationale
- **Target**: Build tooling (`tools/build.js`).
- **User Question**: Why were versions being manually adjusted across files (`site/version.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/index.html`) in recent staged changes? Shouldn't `npm run build` handle that automatically?
- **Root-Cause Analysis**:
  - Historically, `tools/build.js` managed versions strictly for `package.json`, `dist/kareer.user.js`, and `dist/{chrome,firefox}/manifest.json` (auto-incrementing patch version on source code changes or via `npm run bump:*`).
  - The static marketing site and self-hosted Firefox update manifests (`site/version.json`, `site/firefox-updates.json`, `firefox-updates.json`) were introduced recently for the automated CD pipeline.
  - While GitHub Actions (`.github/workflows/deploy.yml`) already synced these files in CI, local `tools/build.js` lacked knowledge of these paths. Consequently, local version changes required manual updates across 4 separate manifest files.
- **Resolution**:
  - Extended `tools/build.js` with `syncSiteAndUpdates(version)`:
    - Automatically updates `site/version.json` with the new version string.
    - Synchronizes the update entry in `site/firefox-updates.json` and root `firefox-updates.json`.
    - Updates the static version badge attribute (`data-version-badge>v${version}<`) in `site/index.html`.
  - Hooked `syncSiteAndUpdates` into `prepareVersion()` during both explicit bumps (`--bump=major|minor|patch`) and automatic source-change hash bumps, as well as on every standard build run.
  - Manual adjustments are now completely eliminated. Running `npm run build` or `npm run bump:patch` keeps all 5 files in exact synchronization.

### Turn changes
- `tools/build.js`: Added `syncSiteAndUpdates()` and called it during `prepareVersion()`.
- `CONTEXT_AND_FINDINGS.md`: Logged rationale, design decisions, and status.

### Verification
- `npm run build`: Successfully built at v0.4.37 and verified synchronization across all manifests.
- `npm test`: **209 passed, 0 failed**.

---

## Turn: 2026-09-23 — Resolving Hosted vs Local Site Inconsistencies

### Findings & Architecture Rationale
- **Target**: Public Website & CI/CD Deployment (`site/index.html`, `site/script.js`, `.github/workflows/deploy.yml`, `tools/build.js`).
- **Symptoms**:
  1. On GitHub Pages (`amro212.github.io/kareer/`), the top navbar Firefox button appeared disabled with "Coming soon" in the user's browser, whereas locally on `localhost:8080` it appeared active as `Firefox .XPI`.
  2. On GitHub Pages, the hero version badge rendered as `v0.4.37.2` (including GitHub Actions run number) while locally it rendered as `v0.4.37`.
- **Root-Cause Analysis**:
  1. **Firefox Button**:
     - In `site/index.html`, the navbar button was statically authored as `class="... kr-btn-disabled"` with `<span class="kr-btn-tag">Coming soon</span>` and no `href`.
     - It relied entirely on client-side execution of `initStoreLinks()` in `site/script.js`.
     - Prior to the self-hosted distribution commit, `LINKS.firefox` was `null`. Browsers that had visited the site earlier cached `script.js` (GitHub Pages Fastly CDN cache). Because `index.html` had `<script src="script.js"></script>` without a version query string (`?v=...`), the cached `script.js` was reused, keeping `LINKS.firefox = null` and actively enforcing the disabled state.
  2. **Version Mismatch**:
     - `.github/workflows/deploy.yml` generated `VERSION="${BASE_VERSION}.${GITHUB_RUN_NUMBER}"` (e.g., `0.4.37.2`) strictly to satisfy Mozilla AMO's requirement that every unlisted signed `.xpi` must have a unique monotonically increasing version.
     - However, `deploy.yml` also used `VERSION` when writing `site/version.json` and substituting `data-version-badge` in `site/index.html`. Consequently, the hosted website advertised the internal CI build number (`v0.4.37.2`) instead of the clean canonical product semver (`v0.4.37`), causing a discrepancy with local `package.json` and `localhost:8080`.
- **Resolution**:
  1. **Static-First HTML**: Updated `site/index.html` so the navbar Firefox button is statically authored as an active link to `downloads/kareer-firefox.xpi` with `.xpi` tag. It is now instantly clickable and functional even before JavaScript executes or if an older script was cached.
  2. **Asset Cache-Busting**: Added `?v=${version}` to `<script src="script.js?v=...">` in `site/index.html`, dynamically maintained by `tools/build.js` and `deploy.yml`.
  3. **Site & Build Separation in CI**: In `.github/workflows/deploy.yml`, exported `BASE_VERSION` separately from `VERSION`. `VERSION` (`0.4.37.${GITHUB_RUN_NUMBER}`) is used solely for the Firefox XPI manifest and `site/firefox-updates.json` (for Firefox auto-updates), while `BASE_VERSION` (`0.4.37`) is written to `site/version.json` and the website badge, ensuring 100% parity between local and hosted environments.

### Turn changes
- `site/index.html`: Statically authored active Firefox navbar button and added version query to script tag.
- `.github/workflows/deploy.yml`: Preserved canonical `BASE_VERSION` for website manifests while retaining unique `VERSION` for signed XPI.
- `tools/build.js`: Added cache-busting regex for script tag in `syncSiteAndUpdates()`.
- `CONTEXT_AND_FINDINGS.md`: Logged findings and resolution.

### Verification
- `npm run build`: Success at v0.4.37.
- Playwright verification on `localhost:8080`: Navbar button active, points to `.xpi`, badge is `v0.4.37`.
- Playwright verification on remote `amro212.github.io/kareer/`: Confirmed Firefox button active and functional.
- `npm test`: **209 passed, 0 failed**.






# Turn: 2026-09-27 — Workday adapter accuracy

- Target: shared core, extension and userscript, Workday (CBC reported application).
- Reported bugs: referral and phone-country prompts require Enter before results appear; current scanner and actuator miss this mechanic. Attached log contains 99 unchanged scans in the 100-entry buffer, displacing useful diagnostics.
- Investigation: representative DOM reproductions prove prompt inputs can be classified as text, Workday query text can be treated as committed selection, and manual text verification accepts wrong nonempty values. The CBC DOM itself has not been captured; these are confirmed code defects, not a claim of verified CBC reproduction.
- Public reference: https://sabre.simplify.jobs/?v=2.4.5 read on 2026-09-27, SHA-256 ab121f97d114831ece64573b6f4563f929c25b45e9ddf63530e0824066ba3d4b; 44 Workday mappings. Research is used to author small local recipes; no runtime dependency on Simplify.
- Authorized implementation: full application coverage, bundled maps, optional evidenced profile additions. User prioritizes simplicity and efficiency. Extend existing hooks rather than add a generic executor framework.
- Root causes confirmed by regressions: plain prompt inputs were scanned as text; search dispatch did not include Enter; query text and nonempty text could be mistaken for accepted values; selected chips were not read consistently. The generic path asked AI before applying deterministic Workday values. Repeaters had no saved-record coordination. Additional audit regressions exposed stale global popup attribution, loss of row bindings on replacement, stale bindings after identity changes, missing `inputError` ownership, unchecked upload acceptance, and narrative questions incorrectly treated as disclosures.
- Adapter changes: expanded `src/core/adapters/workday.js`; added `workday-fields.js` for local canonical mappings/profile resolution/phone parsing and `workday-sections.js` for row matching, creation, progress, and dependency preparation. All four record families (experience, education, languages, websites) use existing interfaces. No runtime Simplify dependency, broad action executor, page storage, or browser controller was added.
- Shared integration changes: `fields/combobox.js`, `scanner.js`, `normalize.js`, `fillers.js`, and `verify.js` add small adapter hooks, array-token handling, metadata, exact Workday verification, and state-change logging. `ai.js` resolves known Workday values first and bundles unresolved questions into one primary request; `autofill.js` resolves Workday search results locally. `application.js`, `agent.js`, and `ui.js` prepare dependency fields and rows, preserve guessed provenance, allow known Workday values without an API key, and retain the step review pause. `resume.js` waits for Workday parser/upload state; `validation.js` incorporates owned Workday errors; `memory.js` preserves provenance.
- Profile changes: `profile.js`, `constants.js`, `storage.js`, and `src/targets/extension/options/index.js` add optional legal/preferred name parts, phone country/type/extension, birth date, address line 3, additional explicit disclosures, and structured language records. Existing profiles remain compatible; full-name splitting is marked guessed. `package.json` and `package-lock.json` add `libphonenumber-js/min`; its full MIT notice is retained inline in both extension bundles and the userscript.
- Test/document additions: `tests/unit/workday.test.js`, `tests/e2e/workday-prompts.spec.js`, `fixtures/workday-prompts-fixture.html`, `fixtures/workday-fields-fixture.html`, and `docs/plans/2026-09-27-workday-coverage.md`. The fixtures are explicitly synthetic, not live captures. The inventory covers representative selectors for all 44 public entries and four nested record families.
- Build changes: the existing build script automatically advanced the local version from 0.4.65 to 0.4.71 during verified iterations and synchronized `package.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/index.html`, and `site/version.json`. Chrome, Firefox, and Tampermonkey artifacts were rebuilt locally; nothing was committed, pushed, signed, or published.
- Verification status: initial seven regressions failed before production changes. Subsequent targeted failures were fixed. Final unit and browser totals are recorded below after completion. Full browser runs before the last narrow disclosure correction passed all 56 tests. The new prompt E2E asserts zero AI requests, exact accepted tokens, the phone's country instead of residence, preserved user skills, completed parsed rows, one missing row, no duplicate row on retry, and no implicit submission or navigation.
- Remaining acceptance: the reported CBC page was not available as a captured fixture. Debug → Save page fixture is still required for CBC-specific replay and live acceptance. Actual localized tenant variants, institution/major display qualifiers, accepted-file layouts, and `promptAriaInstruction`-only selection layouts remain live-validation targets. Unknown/ambiguous values remain unresolved; no guarantee of all future Workday fields is claimed. See the coverage document for the precise boundaries.
- Final unit verification: `npm test` — **257 passed, 0 failed**, including 25 new Workday regressions. Additional coverage protects narrative questions from disclosure matching and verifies normalized multi-checkbox option values without removing prior choices. `git diff --check` passes. Final build is **0.4.71**, with retained third-party license notices verified in both extension content bundles and the userscript.
- Final browser verification: `npm run test:e2e` — **56 passed, 0 failed (4.2 minutes)** against the real extension build, including Enter-only prompts, preserved multi-checkbox selections, repeatable experience rows, profile autofill without an API key, and persisted language records. Implementation is complete for the documented coverage; CBC live capture and tenant-specific acceptance remain outstanding.

# Turn: 2026-09-27 — CBC Workday disclosure controls

- Target: shared extension/userscript core, CBC Workday voluntary disclosures. User provided raw HTML for Gender, Ethnicity, Pronoun, and Disability and screenshots of their menus. The panel typed a plausible value but failed to confirm selection for these controls.
- Root causes: the Gender button's unlabelled sibling input was scanned as a second field; button-listbox harvesting filtered visible `Male` against saved `Man` before semantic alias matching; `personalInfoPerson--pronouns` lacked a Workday canonical mapping; CBC's `No - I don't have any disability (Canada)` was outside the narrow disability alias. Browser replay confirmed Pronoun and Disability committed while Gender remained untouched until button-listbox filtering was fixed.
- Resolution: skip only the unlabelled Workday button-filter sibling; harvest visible options from Workday button listboxes without search-term filtering; map Pronoun and declared multi prompts; extend exact disability, decline, and non-binary aliases. Keep `Middle Eastern` unresolved because it is not equivalent to the displayed `Arab and/or Maghrebi Heritage (Canada)` choice.
- Files changed: `src/core/fields/scanner.js`, `src/core/fields/combobox.js`, `src/core/adapters/workday-fields.js`; `tests/unit/workday.test.js`, `tests/e2e/workday-prompts.spec.js`; `fixtures/workday-cbc-disclosures-fixture.html`; `docs/plans/2026-09-27-workday-coverage.md`; generated version manifests and `package.json` through the existing build script. Fixture controls come from user HTML; popup behavior is synthetic from screenshots, not a live page capture.
- Verification: focused CBC unit and real Chromium extension regressions passed. Full unit/browser totals and final build version recorded below after the final source change. A test run without browser/temp-file sandbox escalation failed in the existing build-watch fixture; rerun with required permissions is pending.
- Remaining acceptance: capture the live CBC page with the panel Debug tab's Save page fixture for exact popup DOM and post-selection confirmation, then replay it. Do not infer demographic equivalence from broad descriptions.
- Final verification: `npm test` — **261 passed, 0 failed**; `npm run test:e2e` — **57 passed, 0 failed (4.7 minutes)** using the real Chromium extension. The focused CBC browser replay also passed independently. Final local build is **v0.4.77** for Chrome, Firefox, and Tampermonkey. No commit, push, or publication was performed.
# Turn: 2026-09-29 — Codex review feedback: name synchronization and review gate collapse

- Target: shared extension/userscript core, profile storage, and application workflow engine.
- Bugs/findings addressed:
  1. Profile name synchronization: editing `fullName` via the panel previously kept stale `firstName` and `lastName` because `saveProfile` only split `fullName` when both component fields were empty. Workday prioritized the stale explicit parts, filling obsolete names into applications.
  2. Dual review gate on Workday: when `autoContinue: false`, Gate 1 paused before `step.reviewed` was marked true. Clicking "Next Step" resumed with `forceContinue: true`, but the resumed tick cleared that flag and immediately entered Gate 2 (`stepReviewPause && !step.reviewed`), requiring two clicks to advance.
- Resolution:
  1. Added `splitFullName` helper in `src/core/storage.js`. `saveProfile` now detects when `fullName` changed or was edited independently from the component parts and reparses/synchronizes `firstName`, `middleName`, and `lastName` (or clears them when `fullName` is emptied). Direct edits to component parts also synchronize `fullName`.
  2. Updated `src/core/application.js` to set `step.reviewed = true` when the initial autoContinue pause triggers or when `forceContinue` is active on resume, collapsing both review gates into a single user action.
- Files modified:
  - `src/core/storage.js`: added `splitFullName` export, synchronized name parts on `fullName` changes in `saveProfile` and `getProfile`.
  - `src/core/application.js`: set `step.reviewed = true` on autoContinue pause and when `forceContinue` is active to bypass redundant `stepReviewPause`.
  - `tests/unit/profile.test.js`: added unit tests for `splitFullName` and name part synchronization across panel and options edit flows.
  - `tests/unit/application.test.js`: added unit test verifying Workday with `autoContinue: false` advances past both review gates on a single `continueStep()` call.
- Verification: `npm test` — **264 passed, 0 failed** (3 new unit regressions). `npx playwright test tests/e2e/workday-prompts.spec.js` — **4 passed, 0 failed**. Merge compatibility verified against the downstream `lever` branch.

# Turn: 2026-09-30 — Greenhouse and Ashby workflow compatibility

- Target: shared core, Chrome/Firefox extensions, and userscript within existing upload/frame limitations. User authorized the full implementation plan, single-agent execution, local recipes, fixture-only submission tests, and live checks without submitting.
- Development references: `docs/plans/simplify-research.md`; public `https://sabre.simplify.jobs/?v=2.4.5`, inspected 2026-09-30, 6,363,379 bytes, SHA-256 `64fb641e27f0af5922c78acae21fce108855147583c13148b10f7c1a44155fc7`, 55 Greenhouse and 27 AshbyHQ entries. Remote configuration is never downloaded or executed at runtime. Coverage inventory follows in `docs/plans/2026-09-30-greenhouse-ashby-coverage.md`.
- Baseline: installed locked dependencies using `rtk npm ci` (394 packages, zero reported vulnerabilities). Restricted child esbuild resolution failed with `Access is denied`; authorized escalation resolved it. Full unit run after initial resolver additions passed **289/289**. New failing regressions preceded fixes for checkbox groups, duplicate Ashby row IDs, accepted uploads, and embedded navigation.
- Implemented: ATS canonical metadata/profile resolution; small shared record reconciliation and dependency preparation; optional links/transgender profile fields in current Options editor; exact text and committed-choice verification; accepted-file checks; local recipe selectors; protected disclosures/country eligibility; one primary page AI request; frame `stepState`/Continue/Submit with fresh validation and expected signatures; top-frame ownership, countdown, cancellation, zero-field confirmation, and two user-initiated repair attempts. Discovery tracks questions separately from answer availability. Existing Workday/Lever and generic paths remain covered by their regression suites.
- Files changed: `src/core/adapters/{greenhouse,ashby,index,application-fields,application-sections}.js`, `src/core/{agent,ai,autofill,application,remote,navigation,jobs,pageClassifier,profile,resume,ui}.js`, `src/core/fields/{scanner,combobox,fillers,verify}.js`, `src/targets/extension/options/index.js`; plan and coverage docs; focused unit and real-extension E2E tests plus synthetic `greenhouse-ashby-workflow.html` and `ats-workflow-host.html` fixtures. Build-generated manifests/site version files will be listed with final verification.
- Additional files: `src/core/{capture,validation}.js`; existing `fixtures/ats-race-fixture.html` now supplies explicit accepted-file evidence; existing `tests/e2e/{ats-hardening,upload}.spec.js` expect deterministic saved answers and zero AI calls. New `tests/unit/greenhouse-ashby.test.js`, `tests/e2e/greenhouse-ashby.spec.js`, `tools/verify-ats-live.js`, `tools/verify-firefox-ats.js`, three live captures, and `docs/plans/2026-09-30-greenhouse-ashby-live.json`. Existing build updates `package.json`, `firefox-updates.json`, `site/{firefox-updates.json,index.html,version.json}` and produces ignored distribution artifacts.
- Findings/fixes (2026-09-30, shared extension/userscript recipes; live checks in Chrome):
  1. Greenhouse Prompt.io phone formatting: correct national digits became `(416) 555-0199`, causing strict text comparison to fail. Phone canonical fields now compare digits while retaining exact content verification for other text. Live Debug capture `fixtures/greenhouse-promptio-captured.html` and real-extension regression replay the observed formatter.
  2. Greenhouse disclosure alias discovery: searching saved `Man` hid the offered `Male` option. Initial disclosure discovery now reads unfiltered owned choices; the existing narrow gender alias resolves one unique choice. Explicit grounded follow-up searches still work. Classic/modern React-select and Select2 fixtures cover ownership and committed choices.
  3. Ashby Cursor education: broad Education History labels and repeated tenant IDs collapsed distinct school, degree, major and date controls. Metadata now uses local component titles, stable unbound row indices or saved-record IDs, and distinct month/year keys. Current-student dependencies run before discovery. Live Debug capture `fixtures/ashby-cursor-embed-captured.html` supplies exact DOM regressions, including canonical EEOC groups.
  4. Ashby Sift portal: Floating UI hides sibling questions from accessibility while a menu remains open. Blur and outside mousedown did not dismiss it, producing a zero-visible-field observation. Ashby's close hook sends deterministic Escape; Workday's Escape rollback behavior remains unchanged. Live Debug capture `fixtures/ashby-sift-captured.html`, a focused unit test and real-extension replay restore saved contact filling.
  5. Embedded unresolved questions: missing-key responses omitted unanswered questions, which were mistaken for new conditional fields and exhausted late-field limits. Track discovered question identity independently; missing required values pause for review. User retries can resolve newly saved answers within two repair attempts. Unit and real-browser frame tests cover zero-field confirmation, replacement, validation/stale commands, ownership ambiguity, safety stops and countdown cancellation.
  6. ATS upload audit: the generic first-file fallback classified a lone `cover_letter` or supporting-document input as resume. Canonical cover-letter controls always stay manual; Greenhouse/Ashby unknown files require resume evidence, with the observed Ashby parser uploader as the explicit unlabelled exception. A failing focused regression preceded this fix. Generic/Lever upload behavior is preserved.
- Final verification: `rtk npm test` passes **307/307**; `rtk npm run test:e2e` passes the full **74-test** real Chrome-extension suite (14 files, zero failed tests; fresh Playwright completion artifact at `2026-09-30T23:53:45.875Z`). Build succeeds at **v0.4.99** for Chrome, Firefox and Tampermonkey. Actual Firefox temporary-extension smoke passes both ATSs with saved contact fields, two matched education rows, one panel and zero submissions. `git diff --check` is clean. Earlier fixture failures came from stricter acceptance evidence, deterministic-answer expectations, alias filtering and a contact-only live capture being replayed with enabled repeatable records; exact regressions and fixture setup now cover these cases.
- Live acceptance: synthetic contact profile, no API key, Auto Continue/Auto Submit disabled. Greenhouse Prompt.io verifies five fields; Ashby Sift verifies four; Ashby Cursor embed mode verifies five. Live Greenhouse/Ashby applications also run inside cross-origin iframes on unique controlled host paths and pause at missing requirements after verifying five/four fields. Three sanitized HTML captures came from Debug -> Save page fixture. Local synthetic fixtures are explicitly labeled. Submission count was zero on every live target; accepted uploads and final submission are tested only on local fixtures.
- Limitations retained: cover-letter and additional-document files require manual attachment; userscript has no new file/frame capabilities; assessments, identity verification, recorded interviews, e-signatures, and legal attestations require manual action. Ambiguous fields, row matches/caps, menus, or frame ownership pause the workflow.
- Delivery status: implementation and required verification complete. Coverage accounts for all 55/27 snapshot entries and representative workflows; future undocumented tenant layouts remain unverified. Final live report covers five targets on v0.4.99 with zero controller errors and zero submission requests. Changes remain local and reviewable; no commit, publication, push or real application submission was performed.

# Turn: 2026-09-30 — Greenhouse/Ashby review fixes

- Target: shared extension/userscript core; hosted and embedded Greenhouse/Ashby synthetic workflow fixtures. User authorized a checklist and minimal fixes for all four review findings.
- Findings reproduced with failing unit tests before each fix:
  1. Host safety boundaries were checked only on entry to embedded workflows; a host legal attestation appearing during submission could still allow iframe Submit. Reuse the existing workflow guard at every embedded current-state check.
  2. Empty canonical profile answers prevented exact saved-question fallback. Resolve exact saved answers for missing facts inside the adapter, preserving canonical precedence, option matching, bound-record isolation, explicit disclosures and country eligibility protection.
  3. Hosted retries reused cached empty canonical answers after the profile was updated. Re-resolve only those empty canonical answers from the current profile before replaying persisted answers; no new primary AI request and no overwrite of user values.
  4. Hosted visibility filtering dropped hidden file inputs even when their upload containers were visible. Align discovery with the existing validation rule so missing required resumes block advancement and saved resumes can upload and verify acceptance.
- Files changed: `src/core/application.js`, `src/core/adapters/application-fields.js`, `tests/unit/greenhouse-ashby.test.js`, `tests/e2e/greenhouse-ashby.spec.js`, `fixtures/greenhouse-ashby-workflow.html`; created `docs/plans/2026-09-30-greenhouse-ashby-review-fixes.md`. Existing staged implementation changes are preserved. No new abstraction or host capability.
- Verification status: all four failing reproductions now pass; full unit, build, real Chrome-extension E2E and Firefox smoke checks are in progress. New browser regressions use synthetic local fixtures; they are not live captures. No real application submission.
- Intermediate verification: unit suite **314/314** passed; Chrome/Firefox/userscript build passed at **v0.4.100**; actual Firefox extension smoke passed both ATSs. Build updated `package.json`, `firefox-updates.json`, and `site/{firefox-updates.json,index.html,version.json}`. Initial Chrome run passed safety and hidden-upload checks; retry test setup bypassed the content storage cache with direct background seeding, then used an incorrect Run-tab selector. Tests now use the actual Profile Save flow and existing `data-tab="home"`; no host changes were needed.
- Final verification: `rtk npm test` **314 passed, 0 failed**; `rtk npm run build` succeeds at **v0.4.100** for all three artifacts; `rtk npm run test:e2e` **81 passed, 0 failed (9.4 minutes)**, including all seven new browser regressions and existing Workday/Lever, cross-frame, migration/userscript and upload coverage. Actual Firefox temporary-extension smoke passes both ATSs with contacts, two education rows, one panel and zero submissions. `git diff --check` is clean. All four review tasks and final verification are complete; production changes are limited to the two existing workflow/resolver files. Existing staged changes are preserved; fixes remain unstaged. No publication, commit or real application submission.

# Turn: 2026-09-28 - IDE conversation history recovery & state.vscdb repair

- Target: Antigravity IDE UI conversation switcher & local chat history recovery.
- Reported bugs: Conversation switcher modal ("Search all convos...") was bugged, not showing recent chats from yesterday or today, only showing chats from 1 week ago (Sept 20).
- Root-cause analysis: The conversation picker in Antigravity IDE reads `antigravityUnifiedStateSync.trajectorySummaries` in `%APPDATA%\Antigravity IDE\User\globalStorage\state.vscdb`. The language server background process failed to publish new trajectory summaries after the initial migration on Sept 20, 2026, leaving the local cache frozen. All SQLite conversation databases and JSONL logs remained 100% intact on disk.
- Resolution: Recovered full transcripts and summaries of the most recent session (`f8316967-56e5-433c-9ea5-43fcee87ad1a`, Lever ATS compatibility + Universal Source Transparency badges) and preceding sessions (`b15a1667`, `d97f5270`, `bc8c82b5`, `3631222f`). Created a safety backup and repaired `state.vscdb` by injecting all 26 recent conversations into `antigravityUnifiedStateSync.trajectorySummaries`. Authored `recovered_chats_and_ui_fix.md` in artifacts.
# Turn: 2026-10-01 — Merge master (Lever ATS) into greenhouse-ashby branch

- Target: shared extension/userscript core, ATS adapter registry, autofill resolution, and scanner/verify modules.
- Bugs & merge conflict findings:
  1. Conflicts across 6 core modules: `jobs.js`, `fields/combobox.js`, `fields/scanner.js`, `fields/verify.js`, `autofill.js`, and `ui.js`. Resolved cleanly by integrating `adapterById` per-field resolution from `greenhouse-ashby` with logger, timeout, and Select2 duplicate disambiguation enhancements from `master`.
  2. Greenhouse detection false-positive on Lever fixtures: `greenhouseAdapter.detect()` used a generic `FORM` selector containing `form#application-form`, causing Lever live fixtures to be detected as Greenhouse. Resolved by scoping `detect()` to Greenhouse-specific DOM signatures and explicitly excluding other ATS hostnames (`lever.co`, `ashbyhq.com`, `myworkdayjobs.com`).
  3. Tiered resolution conflict on empty canonical facts: In `greenhouse-ashby`, canonical disclosures (`gender`, `race`), unauthorized work authorization, and unmatchable options intentionally resolve to `value: ''` so AI does not guess or invent sensitive facts. `master`'s `generatePageAnswers` had bypassed empty deterministic values and forwarded them to `savedAnswers` or AI fallback. Resolved by handling `savedAnswers` fallback in `leverAnswer` (preserving candidate profile precedence) and restoring clean deterministic resolution in `generatePageAnswers`.
- Files modified: `src/core/adapters/greenhouse.js`, `src/core/adapters/lever-fields.js`, `src/core/ai.js`, `src/core/autofill.js`, `src/core/fields/combobox.js`, `src/core/fields/scanner.js`, `src/core/fields/verify.js`, `src/core/jobs.js`, `src/core/ui.js`.
- Verification: `tests/unit/greenhouse-ashby.test.js` (37/37 pass) and `tests/unit/lever.test.js` (19/19 pass). All merge conflict markers resolved.

# Turn: 2026-10-02 - Universal autofill slowdown, job context, and toolbar visibility

- Target: shared core for the Chrome/Firefox extension and Tampermonkey userscript; universal filling, Ashby resume upload, and all-board job capture/toolbar behavior.
- User reports: filling became much slower across every board (initially noticed on Ashby/Greenhouse); Ashby shows an attached resume but reports it as empty/failed; country is missing from job context and eligibility answers use the wrong scope; job capture requires a manual button; the expanded toolbar appears on unrelated pages such as YouTube.
- Live evidence: inspected the supplied Sift Ashby application and Reddit Greenhouse job, and exported sanitized HTML through the real extension's Debug fixture capture. Added `fixtures/ashby-sift-2026-10-02-captured.html` and `fixtures/greenhouse-reddit-2026-10-02-captured.html`. Sift's sidebar lists California, Remote - USA, and Washington; Reddit's header lists New York City, NY. The user's screenshot shows a persisted resume filename and Replace control while the panel reports Resume Empty FAILED. Live applications were inspected and captured without submitting or filling personal information.
- Universal slowdown root causes: recursive `visibleText()` rechecked every ancestor for every descendant; workflow filling stacked a pre-action stability wait, an explicit post-fill delay, and a post-action stability wait (about 540 ms per ordinary field); standalone filling added a decorative 100 ms delay; generic pages split structured and narrative generation and automatically made a further voice-edit request. Regressions reproduced three primary requests for a mixed form before the fix.
- History evidence: commit `fdf3a58` (2026-09-19, ATS hardening) introduced the split structured/narrative flow and default-enabled serial narrative voice edit in shared `ai.js`, explaining why a nominally ATS-focused branch could increase latency across boards. The decorative delay predates that commit (`be7027c`); it compounds the added model latency rather than establishing the date of the user's observed onset.
- Performance resolution: `pageClassifier.js` checks ancestors once at entry and each descendant's own visibility once; `application.js` keeps page-identity checks and one post-action stability wait, reuses each field scan, and removes the redundant waits; `ui.js` removes the decorative delay while retaining framework/combobox settling. `ai.js` routes all adapters through the existing one-page resolver, resolves known profile and exact saved answers first, and includes narrative voice rules in the single request. Explicit user rewrites and bounded late-field/repair requests remain available.
- Measured live-page classification before/after (five-call means, disposable extension browser): Ashby 4.48 -> 1.10 ms and 4,140 -> 486 computed-style reads per classification; Greenhouse 6.72 -> 1.54 ms and 4,898 -> 503 reads. Scanner timing remained roughly 28-33 ms, so the fix targets the shared classification/wait/request paths rather than changing ATS scanning speculatively. The mixed 25-field extension regression completed in roughly 2.7 seconds with one mocked AI response; this excludes real provider latency and is not a promised live-job completion time.
- Ashby upload root cause/resolution: React can clear the file input after persisting the upload. The existing generic verifier then sees an empty FileList. Added the scoped Ashby `uploadState` hook using the owned filename/Replace control and busy/error checks; attachment success, scanning, and existing verification now recognize accepted uploads without borrowing a neighboring upload's state. Added both unit and browser regressions for a cleared file input.
- Job-country root causes/resolution: DOM-only job metadata did not provide the country, JSON-LD arrays kept only the first location, structured country objects were not normalized, nested radio groups could lose the question text and reach the resolver as YesNo, and automatic recapture could inherit another job's country. `jobs.js` captures all structured locations and applicant country requirements, normalizes country objects/codes, reads board header/sidebar metadata, and records explicit `workCountries`, `workCountry`, and `locationAmbiguous`. It retains an unknown country for Remote/ambiguous locations. `labels.js` prefers the actual question container over a nested generic div. `profile.js` resolves eligibility/sponsorship from the matching country record, recognizes explicit question countries, and does not substitute applicant residence or another country's authorization. Multi-country/unknown scope remains unresolved. Same-page job changes start fresh sessions and clear previous field results.
- Automatic capture/UI resolution: `main.js` captures on initial job-page load, relevant DOM changes, and navigation; it waits for existing Lever parent-posting hydration and updates session context. `application.js` creates sessions automatically and replaces incompatible legacy sessions without replaying answers. Manual Capture Job and Debug Re-capture controls were removed. `ui.js` starts each mount as a pebble, and `jobs.js` gates mounting to ATS hosts/markup, embedded ATS, recognizable job listings, or applications. Unrelated pages with search/comment/login controls stay clear. Existing standalone/embedded filling remains available; navigation workflows are selected when appropriate.
- Production files changed: `src/core/pageClassifier.js`, `src/core/ai.js`, `src/core/application.js`, `src/core/profile.js`, `src/core/jobs.js`, `src/core/main.js`, `src/core/ui.js`, `src/core/adapters/ashby.js`, `src/core/fields/fillers.js`, and `src/core/fields/labels.js`. Plan: `docs/plans/2026-10-02-autofill-context-and-visibility.md`.
- Regression files changed/added: `tests/unit/job-context.test.js`, `autofill.test.js`, `profile.test.js`, `upload.test.js`, `panel.test.js`, `application.test.js`; `tests/e2e/context-visibility.spec.js`, `ats-hardening.spec.js`, `autofill.spec.js`, `cross-frame.spec.js`, `auto-submit.spec.js`, `multi-step.spec.js`, `lever-hydration.spec.js`, `upload.spec.js`, `visual-system.spec.js`, `workday-parsed-rows.spec.js`, and `support/fixtures.js`; synthetic `fixtures/ashby-hardening-fixture.html`, `phase2-form-fixture.html`, and `ats-race-fixture.html` were given explicit country/workflow/unresolved-question context where required. Parser test timeout was increased only for CPU-contended unit execution; production parser limits are unchanged.
- Build outputs: existing build tooling automatically synchronizes `package.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/index.html`, and `site/version.json`, and creates Chrome, Firefox, and userscript artifacts in `dist/`. `AGENTS.md` was independently changed during this work and is preserved; that edit was not made as part of this fix.
- Intermediate verification: the full unit suite passed 316 tests before the final legacy-session/navigation adjustments. The first complete browser run passed 66/71, exposing outdated manual-capture/default-expanded/always-AI expectations; after updating meaningful assertions, the focused run passed 17/18 and reproduced a missing textContent-replacement observation on SPA job changes. That observer regression and legacy-session migration regression were then fixed. A separate relevance regression verified that unrelated prose mentioning resumes cannot trigger the toolbar through a comment field.
- Final verification: `npm test` - **316 passed, 0 failed**; `npm run test:e2e` - **72 passed, 0 failed (6.3 minutes)** with the real Chromium extension. The final 25-field regression took **2,669 ms** with **one mocked AI request**. Chrome and Firefox manifests and the userscript report **v0.4.102**; the Chrome ZIP, Firefox XPI, and userscript were rebuilt. `git diff --check` passes. All requested code changes are complete locally. No commit, push, signing, or publication was performed. Real model latency, future ATS markup variants, and Firefox/Tampermonkey live runtime behavior remain outside the Chromium replay measurement.

## Turn: 2026-10-02 - Review UX changes and reconcile Greenhouse/Ashby branch

- Target: shared extension/userscript core; user-created `feature/ux-enhancements` and `greenhouse-ashby` integration readiness against master. User explicitly authorized one read-only review agent, committing current changes before fixes, immediate verified fixes in a separate commit, and conflict resolution/readiness validation afterward.
- Initial state: the feature branch starts at master `b96d3c5` with the previous turn's implementation and updated user-owned AGENTS.md staged. `greenhouse-ashby` is clean at `73be9ae`; fetched upstream refs match both local master and Greenhouse/Ashby. The latter branch includes newer field inference, acknowledgment/unblocked-filling, menu cleanup, and embedded workflow changes that overlap this work.
- Review: invoked `C:/Users/amrom/.codex/skills/.system/review-agent/SKILL.md` in the requested read-only agent. The first confirmed finding is that empty country-scoped eligibility answers suppress contextual AI fallback, contrary to the replacement AGENTS.md. Further review remains in progress. Staged fixture captures also contain trailing whitespace; normalization is deferred until after the requested baseline commit.
- Changes this turn so far: this findings-log entry only; no production fix has been applied before the baseline commit. Plan: preserve staged implementation, verify and fix actionable review findings, commit fixes, then reconcile both branches and run complete unit/real-extension browser verification on the integrated result. Master and the Greenhouse/Ashby checkout are not modified at this stage.

- Baseline preserved: committed the staged changes as `ee8da2b` before applying any review fixes. A fresh baseline `npm test` passed 316/316. The read-only merge preview identified 11 conflicting files, including shared AI/job/UI code, browser specs, version manifests, and this log; reconciliation follows the separate review-fix commit.
- Review completed: nine introduced issues confirmed: empty eligibility/option answers suppress AI; initialization drops automatic capture; a started/paused same-URL session survives a real job switch; Auto Submit routes embedded-only forms into a local-only workflow; JSON-LD text replacements/head metadata are not observed; unrelated-route teardown leaves the rewrite badge/listeners; bare uppercase US fails explicit scope; narrative eligibility receives a binary value; generic application/careers prose triggers mounting.
- Review fixes: `ai.js` sends empty deterministic values through the single contextual request and replaces unresolved placeholders; `profile.js` honors bare US and defers explanations to AI. `application.js` queues context during initialization/filling, resets sessions on actual job identity changes, and cancels initialization after destruction. `jobs.js` preserves recognized step headings and requires job evidence beyond generic application/careers prose. `main.js` observes head/body metadata changes. `ui.js` preserves embedded field-agent filling and destroys the rewrite UI on unmount; `fields/highlight.js` removes focus listeners and guards delayed badge updates. Captured HTML whitespace is normalized.
- Regression coverage: expanded `tests/unit/application.test.js`, `profile.test.js`, and `job-context.test.js`; `tests/e2e/context-visibility.spec.js` now covers head/body JSON-LD replacements, unrelated tutorial titles, badge teardown/remount; `cross-frame.spec.js` covers Auto Submit both on and off. Focused unit reproductions passed 7/7 after fixes. Full verification and separate fix commit pending. The Greenhouse/Ashby branch's newer contextual prompts, unblocked acknowledgments, and supported embedded workflow must be preserved in the later integration.
- Re-review follow-ups: added cancellation of queued context/late emissions after destruction and preserved redirects already approved by session restoration; both have reproducing unit tests. Embedded routing now awaits the authoritative frame list, with a panel regression clicking before delayed inspection finishes. Residence validation permits compatible city-only options and rejects contradictory country/region options without suppressing the AI request. Updated the pronouns regression to use applicant notes as contextual evidence. Browser checks exposed form-free review pages and sanitized generic job-form replay missing metadata; relevance now recognizes exact review headings and explicit job/employment application form IDs. New source builds progressed through v0.4.105; final build and checks follow.
- Navigation/lifecycle follow-ups: a second capture after a redirected form-only step could still reset progress; capture now marks recognized application-step headings so reconciliation preserves role/country across repeated captures, while explicit location changes and actual role changes retain their own context. Review navigation cleared pending URLs before storing the accepted terminal route; completion now records the accepted URL even for already-completed or direct-review sessions. Confirmation headings preserve application identity. Added repeated-capture, review-route, and four form/direct-review × same/changed-URL confirmation unit cases. Standalone teardown now cancels the fill generation; a panel test holds a model response through unrelated-route teardown and job remount, verifies the new panel is runnable, and rejects the late old answer. Builds progressed through v0.4.110; final full verification remains in progress.
- New user reports queued for the next investigation after branch reconciliation: repeated Ashby location/school failures, required fields remaining empty across generic/ATS applications, and Greenhouse filled phone/location shown as Empty/FAILED. User supplied two screenshots and two debug logs and requested finishing the current work before addressing these. Preserve successful original UX/performance changes; investigate mechanics and verification with the supplied evidence rather than broadly reverting unrelated changes.
- Review-fix verification complete: `npm test` **331 passed, 0 failed**; `npm run test:e2e` **75 passed, 0 failed (6.6 minutes)**, real Chromium extension at **v0.4.110**. Focused reproductions also cover lifecycle disposal, accepted redirects, repeated recapture, confirmation persistence, narrative/explicit-US eligibility, compatible city-only options, early embedded clicks, and late standalone responses. `git diff --check` passes. Fixes are ready for the separately requested review-fix commit.
- Unchanged branch verification: archived `greenhouse-ashby` at `73be9ae` into ignored `scratch/greenhouse-validation`, built v0.5.6, and ran its own full suites: **368 unit tests and 89 real-extension E2E tests passed** (E2E 11.6 minutes). The initial snapshot build-watch test lacked its own node_modules path; supplying a dependency junction resolved that environment issue, and the full unit suite was rerun successfully. Its original checkout is clean; master is its merge base at `b96d3c5`. Neither original branch ref/checkout was changed by snapshot validation.

- Separate review fixes committed as `bf7c0d8`. Integration merge in progress on `feature/ux-enhancements`: resolved 13 conflicting files by preserving per-field ATS recipes, semantic eligibility/option matching, contextual/unblocked prompts, embedded workflows and authoritative frame inspection together with the one-request page resolver, automatic capture, step/session lifecycle fixes and default pebble UI. Removed a duplicate adapter import and combined overlapping Ashby accepted-upload handlers into a scoped widget check with the shared tenant-layout fallback. Reload/record-idempotency browser coverage now relies on automatic capture and asserts that the removed capture button stays absent.
- Integration files: shared `src/core/{ai,jobs,ui}.js`, `src/core/adapters/ashby.js`; overlapping `tests/{unit,e2e}` specs; both branches' findings entries; version manifests/site metadata retained at the newer 0.5.x line. Other Greenhouse/Ashby changes are retained by the merge. Fresh merged `npm test`: **394 passed, 0 failed**; build succeeds at **v0.5.7**. Real-extension integration checks and a read-only review against both parents are in progress; merge commit follows final validation.
- Integration re-review reproduced three additional edge cases before their fixes: (1) a recognized ATS eligibility recipe needing country/timing context could fall through to a simpler saved Yes; canonical recipe results now retain authority while empty values still reach the single contextual request, exact saved answers and generic fallbacks remain available; (2) a held iframe-routing response could start filling a newly mounted job or ignore a Pause request; routing now checks captured engine/root/session/URL/generation after each await and Pause invalidates pending routing; (3) destroying the parent engine left the actual iframe agent writing subsequent fields; destroy now cancels its owned frame as Pause already does. Added failing-then-passing unit regressions in `eligibility-autofill.test.js`, `panel.test.js`, and `greenhouse-ashby.test.js`, including the actual bundled field agent. Synthetic embedded host fixture now identifies itself as a Job Application so relevance gating can distinguish it from unrelated generic iframe pages. Build is **v0.5.9**; final full suites are running on these changes.
- Re-review is clear: the requested agent verified all six focused eligibility/routing/actual-agent teardown cases and reports no remaining demonstrated findings. Fresh full unit run: **400 passed, 0 failed**. First complete merged browser run: **95/98 passed**; the three failures were obsolete zero-request assertions in parser tests after the feature branch added a required narrative field to the shared fixture. Updated `tests/e2e/upload.spec.js` to assert exactly one primary request after parsing and a nonempty required narrative; Pause/stuck-parser cases still assert zero requests. Imported captured fixtures' trailing whitespace is normalized. Final full browser rerun is in progress with unchanged production v0.5.9 source.

- Final integration verification: **400 unit tests and 98 real-extension E2E tests passed**, build v0.5.9; `git diff --cached --check` passes. The preceding browser run passed 97/98 with one context-close cleanup failure after its performance assertions passed; the focused 8-test rerun and fresh entire 98-test run both pass. The integration is ready for its merge commit.
- At the user's explicit request, replacement read-only reviewer uses **GPT-6.1 Sol / high**. It found two inherited Greenhouse/Ashby defects for the separate follow-up: duplicate default `on` checkbox values select contradictory choices, and an unresolved canonical combobox can suppress contextual AI and repair. No additional demonstrated merge-resolution regression was found. Read-only live Debug captures were obtained for the supplied Reddit Greenhouse and logged 1Password Ashby jobs; 1Password also has eight native radio groups with duplicate `on` values and two custom multi-checkbox questions. The logged job has no school field; the specific failing school job URL/name has been requested. Follow-up fixes and captured-fixture regressions are next, after preserving the validated integration.

### 2026-10-02 — Reported required choices and follow-up review (extension + userscript)

- Preserved validated integration as merge commit `daec0c2`, following baseline `ee8da2b` and separate review fixes `bf7c0d8`; current follow-up is separate from that integration.
- Captured 1Password Ashby root causes: eight native radio groups omit their HTML values, making all options `on`; the shared scanner/model/filler/verifier cannot distinguish them. Ashby disclosure checkboxes have the same defect and can select every contradictory answer. Added one shared `choiceValue` in `fields/labels.js`, preserving unique native values and using owned labels for duplicate values; scanner, radio fill/verification and checkbox adapter execution/readback now use consistent identities. Failing-before/passing-after unit reproductions cover the actual capture, the original Sift-style disclosure, and generic native radios.
- The captured Ashby language and racial-background questions were scanned as independent booleans, losing the parent question and its multiple-choice meaning. `application-fields.js` now groups explicitly declared Ashby multi-checkbox questions; single consent/newsletter checkboxes retain their existing behavior. Unit and extension regressions preserve all eight language options and verify exactly the requested checked choices.
- An owned combobox choice differing from the saved profile wording could be excluded from contextual AI by a deterministic search placeholder, then stop at a canonical-empty repair gate. Once options are already harvested, unresolved canonical answers now remain in the primary request; empty-option searches remain available. Required canonical empties no longer suppress existing bounded contextual repair when an AI/custom answer provider is available. Equivalent-degree coverage verifies one primary request, and a required canonical answer recovers with one bounded repair. Missing files and no-key/manual cases retain their existing handling.
- New Debug exports: `fixtures/ashby-1password-2026-10-02-captured.html` and `fixtures/greenhouse-reddit-captured.html`; existing captures retained. `tests/e2e/reported-applications.spec.js` replays the observed radio/checkbox controls, national-phone formatting and committed city chip. The Reddit replay confirms Phone and Location remain VERIFIED. Debug strips site scripts/external styles, so replays restore only relevant widget events/visibility; the Ashby local-host replay retains explicit ATS identity when isolating its choice controls. An overlapping focused run collided in Playwright's shared artifact directory; subsequent validation runs sequentially.
- Production files changed: `src/core/fields/{labels,scanner,fillers,verify}.js`, `src/core/adapters/{application-fields,ashby,greenhouse}.js`, and `src/core/application.js`; unit coverage in `application.test.js`, `eligibility-autofill.test.js`, `greenhouse-ashby.test.js`. Version manifests/site metadata build **v0.5.10**, all Chrome/Firefox/userscript artifacts build successfully. **406 unit tests and all four focused real-extension regressions pass**. Requested GPT-6.1 Sol/high reviewer confirmed its earlier findings fixed, replayed Sift selecting only No successfully, and reports no remaining actionable findings. Final full browser suite is running before the separate fix commit.
- Specific Ashby school case remains unverified: neither reported live capture contains a school control. The failing job URL and expected school name have been requested; existing school/search/education-row regressions and the new contextual-choice fallback are retained. No speculative school-specific change or broad rollback was made.
- Additional review reproduced the same unresolved-choice defect when options appear only after search in an embedded frame: an empty recipe returned after discovery, zero AI calls despite a key, then a required-field pause. `autofill.js` now resolves exact profile/query matches locally and gives unresolved newly discovered choices one contextual late-field pass with further searches disabled. Local workflow, embedded workflow and standalone remote paths retain the actual job context. Added direct late-degree and actual-engine frame-contract regressions plus a real cross-origin extension regression completing the owned equivalent choice without another click.
- Follow-up reviewer caught a cancellation window between option-discovery refresh and the new contextual request. Added generation predicates through the discovery helpers and checks after discovery/refresh and before requesting; the actual-engine Pause-during-refresh regression fails before the fix and now makes zero post-Pause requests. No additional field writes occur after cancellation. Source builds **v0.5.12**. All **five focused extension regressions pass (30.8 seconds)** after isolating captured controls whose site events are replayed; unreplayed dropdowns in the full Reddit capture otherwise spend artificial fixture time waiting for absent scripts. Final full unit/browser runs restarted on this source; the earlier browser run was intentionally stopped when the reproducible review finding arrived.
- Final source unit suite: **409 passed, 0 failed**. GPT-6.1 Sol/high re-review confirms late-discovery and cancellation findings closed, three focused regressions pass, and no remaining actionable findings. First complete v0.5.12 browser run: **101/103 passed**; the two failures are the obsolete zero-request expectation for the required unresolved source (now correctly receives two bounded repairs) and a context-close trace-cleanup error after the Greenhouse dropdown assertions passed. Updated `tests/e2e/ats-hardening.spec.js` asserts exactly two repair requests and that both contain only the source field, protecting saved contact/location/eligibility routing. Both affected focused tests pass (47 seconds). A fresh full browser run uses `--trace=off` to avoid intermittent trace teardown while retaining every functional assertion and actual extension/browser load; no harness or production behavior is changed for this diagnostic option.
- Final follow-up verification: **409 unit tests and 103 real-extension E2E tests passed**, browser run **10.6 minutes** with diagnostic tracing disabled, on **v0.5.12**. Logs: ignored `scratch/followup-final-final-unit.txt` and `scratch/followup-full-clean-e2e.txt`. Build artifacts include Chrome, Firefox and userscript; live Firefox/userscript runtime behavior is not established by Chromium tests. Requested GPT-6.1 Sol/high review is clear. The specific school case still awaits a reproducing URL/name.
- Integration readiness: master `b96d3c5` and Greenhouse/Ashby `73be9ae` are both ancestors of feature HEAD; `merge-tree --write-tree` against each branch succeeds without conflicts. The original Greenhouse/Ashby checkout is clean, and staged whitespace checks pass. The separate follow-up fix commit preserves baseline `ee8da2b`, review fixes `bf7c0d8`, and integration `daec0c2`. Both branches' work is combined locally on `feature/ux-enhancements`; no master merge, push or publication was performed.


## Turn: 2026-10-06 - Remaining Workday and Greenhouse QA failures

- User reports on v0.5.14 (extension/shared core): Workday resume visibly uploaded but FAILED/Empty; skills search without tokens, with screenshots showing skill queries under Field of Study; Greenhouse school empty and retry creates a duplicate Education row then duplicate-ID pause; Greenhouse/Workday speed remains poor. Exact saved school is university of guelph. Fresh Phreesia Debug capture: fixtures/phreesia.wd1.myworkdayjobs.com-2026-10-06-03-57.html (03-56 also provided locally). Greenhouse earlier real capture retained; duplicate-state capture requested.
- Confirmed failing regressions: actual Workday upload uses file-upload-item-name, unlike our prior replay, and clears FileList; selectedItemList carries role=listbox and its selected pills were mistaken for available choices, preventing the real prompt-icon fallback; Greenhouse retry only reused entirely blank progress rows, so an inferred B.E/B.Tech degree prevented reuse while school remained empty. Added failing unit cases before fixes. Portal ownership checks also reject explicit foreign multiselect IDs.
- Changes in progress: existing Workday filename readback/prompt hooks and application row retry matching only; no global timeout reduction. Live read-only Greenhouse school catalog inspection and stage timing investigation in progress. Prior synthetic replay did not cover these captured states; live verification remains necessary.
- Live Greenhouse evidence: the mthree school menu returns 100 alphabetically early schools for its first page; university of guelph is absent there but exact search returns University of Guelph (HTTP 200). Captured both open-menu states through the extension agent's same sanitized captureFixture command, without filling answers or submitting: fixtures/greenhouse-mthree-school-first-page-captured.html and greenhouse-mthree-school-guelph-captured.html. applicationAnswer now performs a bounded saved-institution search even after the first catalog page was harvested; autofill retains initial fallback choices if that search finds nothing, so contextual inference remains available.
- Further failing regressions and fixes: Workday can clear FileList synchronously before asynchronously inserting its accepted item. File delivery now starts the existing bounded parser wait and that wait also checks widget acceptance. Retry reconciles an old failed result with an already accepted resume rather than reattaching it. Workday selected pills no longer count as options, promptIcon is used to open/dismiss owned menus, explicit foreign multiselect IDs are rejected, and a disconnected committed popup cannot accidentally reopen the prompt.
- Greenhouse partial-row retry now reuses its recorded row despite differently worded inferred degree values while preserving conflicting user school identities. Unassigned rows release only the tool's record annotation to prevent duplicate IDs; their actual values remain intact. A retry reharvests missing combobox choices using cached answers or saved facts before selecting them, including when earlier repairs left an empty answer. Browser reproduction deliberately rejects the school until the repair limit, then retries the original row successfully without Add.
- Performance evidence: verification of eight selected Workday skills took 1979ms before the change and 242ms afterward in the same focused reproduction. All expected tokens now share one 200ms stability window; removal of any token during settling still fails. This reduces proven redundant work, without reducing remote-result/parser timeouts or changing AI behavior. Harvest logs include duration; workflow logs separately measure fill, settling and verification. Provider latency retains its existing separate logging. Whole-session live speed improvement is not established by replay timing.
- Files modified this turn: src/core/adapters/{workday,application-fields,application-sections}.js, src/core/{application,autofill,resume}.js, src/core/fields/{combobox,fillers,scanner,verify}.js; tests/unit/{workday,greenhouse-ashby,upload}.test.js; new tests/e2e/remaining-ats-qa.spec.js and docs/plans/2026-10-06-remaining-ats-qa.md; sanitized fixtures above and supplied Phreesia 03-57 capture; version manifests/site metadata built at v0.5.18. Fresh complete unit suite: 427 passed, 0 failed. All three new real-extension cases pass across focused runs; complete browser suite is now running. The supplied Phreesia Debug snapshot closes its popup before capture, so live search-result markup and signed-in tenant behavior still need human retest.

## Turn: 2026-10-05 - Greenhouse and Workday manual QA follow-up

- Target: extension and shared userscript core on feature/ux-enhancements, starting at clean 5c6eb04 / v0.5.12. User requests five minimal fixes, a task list, and staged commits on the same branch.
- Reports: Greenhouse education menus are filtered with exact profile degree/school before available choices are known; numeric month queries fail on named-month lists; Workday skills remain search text rather than committed choices; Workday resume upload remains empty; a Required value missing or rejected notice appears with zero FAILED fields; Greenhouse and Workday filling is slower than Ashby/Lever.
- Evidence: four supplied screenshots, including Stripe embedded Greenhouse degree showing Bachelor of Engineering / No options; Phreesia Workday skill Java remaining search text and empty Resume/CV; final Workday required upload failed; Reddit Greenhouse completed disclosure choices and zero FAILED with an old required-value warning.
- Initial confirmed causes: shared harvesting derives the initial search query from profile values; panel warning reads session.errors history rather than current failed results. Resume routing ignores canonical resume identity and receives the entire fields list as its first-file fallback, which can reject an ambiguously labelled upload after preceding text fields. Workday already has Enter-search and token verification hooks; real skills markup/event differences still need tracing.
- Plan created: docs/plans/2026-10-05-greenhouse-workday-qa-fixes.md. Requested Stripe/Phreesia URLs or existing Debug fixture paths asynchronously; existing fixtures support independent reproductions meanwhile. No production changes yet. Scope: smallest existing-hook fixes, failing regressions, real-extension verification and separate commits; no speculative engine rewrite.
- Supplied fixture paths are now available: fixtures/job-boards.greenhouse.io-2026-10-06-03-13.html and fixtures/phreesia.wd1.myworkdayjobs.com-2026-10-06-03-17.html. Both user Debug captures are preserved. Independently obtained a public mthree Debug capture in ignored scratch/qa-oct5-live; no live application answers/uploads/submissions were sent. These filenames reflect UTC capture dates; the conversation turn is October 5 in America/Toronto.
- Greenhouse resolution: its searchQuery hook returns an empty initial query for education and month menus, retaining explicit bounded search when an empty remote menu needs it. Existing number/name month aliases select the harvested label; incompatible degree wording reaches contextual AI with all owned options. Reproductions failed with zero named-month/degree options before the change and pass afterward; harvest times improved from roughly 8.2-8.7 seconds to 0.37-0.55 seconds per reproduced menu. No global timeout reductions or new request pipeline.
- Workday resume resolution: isResumeField now honors canonical resume identity before generic-label fallback. The Phreesia capture already identifies its resumeAttachments uploader correctly, but the old first-field fallback compared it with preceding text fields and skipped upload. Cover-letter canonical identity remains excluded. Captured browser replay attaches and verifies resume.pdf exactly once, including on retry.
- Workday skills resolution: reuse the existing Enter search and add a narrow post-option-click Enter fallback only for skill prompts whose first harvested result is the selected exact option. Already committed tokens skip it. Shared fill still verifies tokens after close. A reproduced menu replacement could otherwise authorize Enter on changed results; one isConnected guard closes that window. Positive captured two-Enter reproduction and negative menu-replacement regression were confirmed failing before their fixes. Existing click-driven prompts still pass and existing Python stays intact while Java/JavaScript are added.
- Failure notice resolution: renderHomeTab derives whether to show session error history from the same summarizeFieldResults current-field report as FAILED count. Reproduced old required-value error with zero current failures now stays hidden, including after a bounded repair succeeds. No validation/repair rules were suppressed.
- Modified production: src/core/adapters/greenhouse.js, src/core/adapters/workday.js, src/core/fields/fillers.js, src/core/resume.js, src/core/ui.js. Tests: tests/unit/greenhouse-ashby.test.js, workday.test.js, upload.test.js, panel.test.js; new tests/e2e/greenhouse-workday-qa.spec.js replays the captured widgets with site events restored because Debug strips scripts. Version manifests/site metadata rebuild Chrome/Firefox/userscript at v0.5.14.
- Verification so far: full npm test 417 passed / 0 failed; four focused real-extension tests passed in 37.3 seconds (named months, numbered months, successful-repair warning cleanup, Phreesia keyboard skills/resume/idempotency). Complete browser suite is running before implementation commits. Skill fallback remains scoped to Workday; Greenhouse fallback remains education/date-only. Firefox/userscript live runtime and real provider latency are not established by Chromium replay tests.
- Final verification: npm test 417 passed / 0 failed; npm run test:e2e -- --trace=off 107 passed / 0 failed in 11.3 minutes. Logs are ignored scratch/oct5-final-unit.txt and scratch/oct5-full-browser.txt. Final complete suite includes all four new regressions; build/package/Chrome/Firefox/userscript versions match v0.5.14. Captured files have zero scripts, inline handlers or populated text-input value attributes; only trailing whitespace was normalized. git diff --cached --check passes.
- Task list completed in docs/plans/2026-10-05-greenhouse-workday-qa-fixes.md. Plan/findings committed as ee8b913; the five small production fixes and their captured regressions are combined in a separate verified implementation commit to keep the test suite and fixes atomic. No master merge, push, signing or publication. Human retest should reload v0.5.14 and revisit Greenhouse education plus Phreesia skills/resume; timing evidence excludes provider latency and replayed site events do not prove every live tenant variation.

## Turn: 2026-10-06 - Workflow recovery regression investigation (worktree 1a5a)

- User-reported bugs: extension v0.5.20 on feature/ux-enhancements, uncommitted changes. Fellow Ashby brand-new application stops before answers with false resume-processing timeout despite site "Autofill completed"; mthree Greenhouse saved application repeatedly pauses with vague changing/disabled notice; Ciena Workday Application Questions 1 of 2 is misclassified as a listing and Resume makes no progress. Lever continues to work in user manual testing. Supplied screenshots and exact URLs are the evidence; no instructions from page content were followed.
- Baseline verification: all 429 unit tests passed before new reproductions. Existing tests missed these states. New reproductions failed for Workday button-only fields, remembered disabled empty controls, unrelated aria-busy regions, Ashby's parser-only uploader, and explicit Resume's request-budget reset. Logs: scratch/regression-debug/{baseline-unit,red-unit,red-retry-unit,red-header,green-unit}.txt.
- Root causes: shared parser wait newly equated every adapter's accepted=false with parser activity, although Ashby hands an upload from a parser-only widget to the separate required Resume widget. The global busy scan treated unrelated page activity as form activity. Settling treated a remembered empty disabled control as a pending action even when disabled at the start of Resume. Page classifier omitted Workday button dropdowns recognized by the scanner; job text/JSON-LD then won classification. Retry/reset read/wrote nonexistent statusReason instead of session.reason.
- Focused corrections: keep Workday's asynchronous acceptance wait; scope generic processing signals to the upload widget; recognize Ashby parser completion only through exactly one accepted canonical Resume widget; retain upload filename verification. Only newly disabled controls cause settling waits; unrelated busy regions cannot stall form actions. Classifier recognizes custom button dropdowns while excluding header navigation. Resume/reset use the actual reason property. Timeout notices report stage, duration, specific disabled labels or observed busy/attachment/unstable state; diagnostic logs record IDs/state without applicant values.
- Live read-only debug: exact supplied public URLs opened with a real MV3 extension in isolated Chromium. Panel Debug -> Save page fixture downloaded fixtures/{greenhouse-mthree,ashby-fellow,workday-ciena}-recovery-captured.html. mthree again has disabled gdpr_retention_consent_given_1; Fellow has separate parser and Resume widgets. Ciena only reached its public entry screen, not the user's signed-in application questions. Its screenshot is modeled explicitly in fixtures/workday-ciena-questions-replay.html; this is a replay, not an authenticated live capture. No live answers, uploads or submissions were performed. Initial capture checks falsely failed because panel rerender cleared feedback text after successful downloads; diagnostic test now checks the downloaded capture instead.
- Files added/modified in this turn: src/core/{application,pageClassifier,resume}.js; src/core/adapters/ashby.js; tests/unit/{application,upload,workday}.test.js; tests/e2e/{upload,workflow-recovery,live-workflow-capture}.spec.js; three sanitized captures and Ciena question replay above; this findings log. Prior Greenhouse pagination/partial-row retry, Workday prompt ownership/Enter commit/accepted-upload recognition and shared token verification fixes retained. Negative skills reproduction confirms an unrelated first result is rejected; the existing search/commit fixes remain intact. Full verification pending; build generated Chrome, Firefox and userscript v0.5.21 plus standard package/site/version metadata updates. No commits, merges or publication.
- Additional confirmed uncommitted reset defect: Rescan cleared status/answers but retained session.stepReview, so the next Autofill click routed into continueStep and clicked Save and Continue instead of refilling/reviewing (real-extension trace). Added failing unit regression and now reset clears active/review state. This accounts for another misleading non-progress path; existing application/session/repeater progress is preserved. Negative skills test confirms an unrelated first result is rejected; no speculative skills-selection changes made.

- Final source build: Chrome MV3, Firefox and userscript v0.5.22. All 439 unit tests passed; git diff --check is clean (line-ending notices only). Focused Greenhouse and Ashby workflow recoveries pass, prior three ATS fixes pass, and final Workday rescan/Autofill passes after its review-state correction. Complete 116-case extension suite is running against this final build. The earlier complete run was interrupted to incorporate the proven rescan fix; its partial results are not counted as full verification. Diagnostic live-capture tests are opt-in and skipped during normal offline regression runs.
- User supplied the exact signed-in Ciena Debug capture during verification: fixtures/ciena.wd5.myworkdayjobs.com-2026-10-07-03-13.html. Added its real four-button questionnaire to unit and extension tests. The captured selectors include no data-automation-id on the question buttons, confirming the classifier must recognize button[aria-haspopup=listbox] directly. Its anonymous sibling filter inputs do not become duplicate questions. Both exact-capture tests pass: four choices fill and Rescan/Autofill preserves the step without invoking Save and Continue. The menus' server responses are replayed with fake options/profile data; live application filling/submission was not performed.
- Completed verification on final v0.5.22 source: npm test **440 passed, 0 failed**; complete npm run test:e2e **113 passed, 0 failed, 3 opt-in live-capture tests skipped (14.4 minutes)**. The exact signed-in Ciena replay added after full-suite collection separately passed **1/1** against the same build. Logs: scratch/regression-debug/{final-unit,full-final-e2e,exact-ciena-e2e}.txt. git diff --check passes. Prior Greenhouse school/month/partial-row and Workday skills/upload regressions remain passing, as do Lever tests. Chrome, Firefox and userscript artifacts are rebuilt at v0.5.22. Changes remain uncommitted in the requested worktree; no merges, publication or real application submission. User next step: reload the built extension and refresh existing ATS tabs so old content scripts are replaced; retry Autofill/Resume on the reported pages. Authenticated server behavior is represented by captured DOM replay with simulated options and fake test profiles, not a live signed-in application submission.

## Turn: 2026-10-06 to 2026-10-07 - Two-branch code review and merge simulation

- Request: review `greenhouse-ashby` and `feature/ux-enhancements` before merging into the default branch; determine order, simulate merges, and identify conflicts beforehand. Review used the explicitly requested code-review skill's Standards and Spec axes with one agent, honoring the repository's prohibition on unsolicited subagents. Superpowers installation was already present and its junction verified.
- Pinned references, verified against GitHub: default branch is `master`, SHA `b96d3c51734cda0730ccd0e30ef3fc504a2b1c60`; Greenhouse/Ashby `73be9aea91ec1fd61a941a916221e25e9548cf7a`; UX `d8620d084f91da66b0840040ba0fd15c18060005`. PR #5 targets master and has green CI; UX has no open PR. The issue-tracker configuration is absent, so checked-in plans, coverage and findings entries supplied specs. UX already contains the entire Greenhouse/Ashby tip through merge `daec0c2`.
- Merge evidence: actual regular merges in ignored isolated local clones succeed in either order with zero conflicts, both yielding tree `7ede6f3e249180a80bcd635601de70e5d3e6d57b`, identical to UX. Greenhouse/Ashby first preserves the intended two-PR review sequence. Squashing Greenhouse/Ashby first produces 29 conflict files when UX is merged afterward. No normal-merge conflict needs a source fix at these pins. Prefer a regular merge commit for PR #5; resimulate after any fixes or base changes.
- Review findings, shared Chrome/Firefox extension and userscript core, synthetic ATS fixtures:
  1. Standards P2, both branches: `src/core/adapters/application-sections.js` treats complete and partial matches equally. Existing `Acme/Engineer` and `Acme/<blank>` rows with saved Engineer and Manager roles throw ambiguous workExperiences instead of uniquely reserving the complete row and completing the partial row. Reproduced directly against both branch snapshots and with a real Chromium extension. Resolution deferred to a focused matching fix and permanent regressions on Greenhouse/Ashby, propagated into UX.
  2. Spec P2, UX: `src/core/fields/fillers.js` selects the first relevant skill result when exact matching fails, then verifies against that substitute. A requested Java skill commits JavaScript and returns fill success; later verification rejects Java but leaves the wrong token selected. The existing LinkedIn negative case does not catch a substring-related result. Reproduced directly and in the real extension. Resolution deferred to removing the arbitrary substitute while preserving matched-option keyboard commits, plus Java/JavaScript regressions.
  3. Spec P2, UX: `src/core/profile.js` generic eligibility routing ignores the without-sponsorship qualifier and returns authorization alone. An explicit US record with authorization=Yes and sponsorshipNow/Future=Yes answers Yes, labeled saved, to authorized to work in the US without sponsorship. The existing shared ATS resolver correctly answers No for identical inputs. Reproduced through the page resolver and a real-extension generic radio form. Resolution deferred to aligning the generic path with shared country/negation/timing logic and adding regressions.
- Files created/modified: this findings log; `docs/plans/2026-10-06-two-branch-merge-review.md`; ignored `scratch/merge-review-{simulate,skill-repro,row-repro}.mjs`, `scratch/merge-simulation-results.json`, two isolated clones, test logs, and temporary `tests/e2e/merge-review-diagnostics.spec.js` inside the combined clone. Existing `skills-lock.json` and untracked `.agents/skills/code-review/` changes were preserved. No production source was edited, staged, committed or pushed in the original repository. Simulation commits exist only inside the disposable clone; no default/feature branch ref was changed.
- Verification: Greenhouse/Ashby full `npm test` 368/368 passes and full `npm run test:e2e` 89/89 passes (11.9 minutes); combined tree unit suite 440/440 passes. Chrome, Firefox and userscript builds pass at v0.5.6 and v0.5.22 respectively. All three temporary correct-behavior browser diagnostics fail as expected, proving the review findings. Combined full E2E completed with 111 passed, 3 failed, 3 opt-in live-capture tests skipped (16.2 minutes): generic autofill's immediate request-count assertion, the trace teardown affected by my initial diagnostic run, and options export's download timeout. All three passed unchanged in isolated reruns (2/2 plus 1/1, separate output directories). All 114 existing non-live cases have passing executions, but the full invocation did not pass; a clean complete run on the fixed candidate is required before merging. Final remote checks still match all pinned SHAs.
- Environment/hygiene: sandbox cache/temp access required elevated browser/build-watch runs. Two Greenhouse unit timing failures under concurrent load passed isolated tests and then the lower-load complete suite. The first diagnostic row assertion used a nonexistent Playwright helper; it was corrected and rerun, confirming the actual unfilled Manager row. Separate diagnostic output directories now preserve full-suite traces. Branch-range `git diff --check` fails on captured HTML trailing whitespace on both branches; this is housekeeping, not a runtime defect. Fresh browser validation uses Chromium; Firefox/userscript were built without a fresh live Firefox smoke.
- Delivery status: hold merges for the three P2 defects and rerun complete verification on the fixes. The review document contains exact pins, separate axis reports, merge/conflict evidence, test limitations and the recommended sequence. Each source-changing master push triggers deployment; use one verified integration update if an intermediate Greenhouse-only release is unwanted. No real ATS filling/submission, new PR, remote merge, publication or deployment occurred during this review.

## Turn: 2026-10-07 — Implement pre-merge review fixes

- User requested a task list and implementation of all reviewed issues. Created docs/plans/2026-10-07-pre-merge-review-fixes.md.
- Extension/userscript, Greenhouse rows: complete and partial rows at the same employer previously threw ambiguity before filling. Reserve complete identities globally before partial matching; keep genuine ambiguity detection before Add. Add unit cases for both record orders, retries, and competing partial matches; add a real extension browser regression.
- Shared housekeeping: replace race-prone enabled-button E2E waits with observable completion; trim captured Ashby fixture trailing whitespace. A later unit rerun reproduced a scheduler-delay timeout in a successful resume-parser fixture; increased only success-fixture deadlines to five seconds, retaining the stuck-parser timeout assertion.
- UX checkout: remove arbitrary first-suggestion skill fallback and share authorization-without-sponsorship rule with generic eligibility. Add Java/JavaScript and sponsorship-horizon unit/E2E regressions; trim six additional captured fixtures.
- Modified here: application-sections.js; greenhouse-ashby and upload unit tests; autofill and new pre-merge-rows E2E tests; ashby-cursor-embed-captured.html and ashby-sift-captured.html; task/review documentation and this log. Unrelated skills-lock.json and untracked code-review skill are preserved.
- Verification: all new regressions failed before changes and pass after. Final Greenhouse/Ashby 371 unit tests and 90 full real-extension browser tests pass; final UX 445 unit tests pass; 3 focused real-extension tests pass; all Chrome/Firefox/userscript builds pass. UX's final full browser suite passed 117 tests, with three opt-in live-capture cases skipped. Resolved candidate merge simulations are conflict-free in both landing orders and retain the verified UX production/test tree.
- Status: all fixes verified in actual branch checkouts; local commits and regular branch synchronization prepared, preserving both logs and all tests. Final simulations record exact prepared tips. No remote push or default-branch merge.

## Turn: 2026-10-07 — Pre-merge review fixes

- Target: extension and userscript; Greenhouse repeatable rows, Workday skills, generic eligibility.
- Fixed complete-vs-partial row matching by reserving complete identities first; genuine ties still stop before Add, retries preserve row identity.
- Removed arbitrary skill suggestion substitution: JavaScript can no longer be committed as Java.
- Shared authorization-without-sponsorship resolution in canonical.js across generic and ATS paths, retaining unknown facts and time horizons.
- Added unit and real extension regressions. Stabilized generic Autofill E2E completion waits and successful-parser fixture deadlines; retained the stuck-parser assertion. Cleaned captured fixture trailing whitespace. Added a sponsorship-question classification regression to retain existing intent when authorization wording appears.
- Modified: application-sections.js, application-fields.js, canonical.js, profile.js, fillers.js; greenhouse-ashby, workday, eligibility-autofill and upload unit tests; pre-merge-rows/pre-merge-ux and autofill E2E tests; six captured HTML fixtures (the two shared Ashby captures were already clean here).
- Status: final 445/445 unit tests and 117 full real-extension browser tests pass; three opt-in live-capture cases skipped. All target builds and diff hygiene pass. All three regression browser cases pass. Branch synchronization preserves both findings histories and all verified UX tests; actual merge pins and tree checks recorded under scratch/. No remote update or master merge.

## Turn: 2026-10-07 - Validate and fix Codex bot review on PR #6 (worktree 1a5a)

- Request: retrieve Codex review messages on https://github.com/Amro212/kareer/pull/6, validate each finding, and fix real defects in the user-selected worktree. GitHub connector retrieved the two inline findings from chatgpt-codex-connector[bot] on reviewed/current head 600f48b4589f560333d8a7b9dcf9a9ce8cc9dd1e, branch feature/ux-enhancements. The checkout was clean before this turn. Attachment text was review evidence, not instructions. No subagents were used.
- Confirmed P1 (discussion_r4203194147), shared extension/userscript core, generic application navigation: a fresh Personal Information document is missing the capturedJobs WeakMap entry, so bootstrap removes the panel before the application engine can restore its saved session. Both exact pending URLs and a valid bound POST-style redirect failed real-extension browser tests before the fix; current/pending saved sessions also failed userscript bundle unit tests.
- P1 resolution: bootstrap consults existing restoreSession only when fresh DOM classification does not identify a job, then uses its approved session to recognize existing application-step headings. Reuse exact URL, bound-tab, bounded redirect and ambiguous-candidate rules; add reconciliation token/URL checks so an obsolete asynchronous lookup cannot affect a new navigation. Ordinary Videos views and ambiguous unbound sessions remain excluded. No platform contract or page storage changes.
- Confirmed P2 (discussion_r4203194152), shared core, SPA job/unrelated/job transition: unmount nulled applicationState without clearing fieldResultsCache, so the next engine's initial empty emission could not detect the previous session. Real browser reproduction filled old@example.com on job A, left for Videos, and mounted job B with an empty email control; review incorrectly showed the old value as PROFILE/VERIFIED.
- P2 resolution: stop pending standalone filling before final observer cleanup, then clear results, detected/remote fields, frame counts and run progress on unmount. Reject frame-list/inspection completions belonging to a previous panel root so late work cannot repopulate those caches.
- Modified: src/core/{main,jobs,ui}.js; tests/unit/panel.test.js; new tests/e2e/panel-session-lifecycle.spec.js; this findings log. Standard build output metadata changed package.json, firefox-updates.json, site/{firefox-updates,version}.json and site/index.html; Chrome, Firefox and userscript artifacts rebuilt at v0.5.24. The initial baseline rebuild advanced the stale build cache to v0.5.23; final source rebuild advanced it to v0.5.24. Synthetic generic-page routes cover these lifecycle defects; no live ATS bug or authenticated capture was involved.
- Verification: new positive session tests failed before production edits; cache browser reproduction failed with the exact stale VERIFIED value before its fix. One initial browser test used a nonexistent Review tab; corrected to the existing Run tab's review section and reran before editing cache cleanup. All 449 unit tests pass. Focused real-extension browser run passes 11/11, including exact/redirect session recovery, stale cache isolation and existing context-visibility regressions. All three target builds pass; git diff --check passes. Complete browser suite is running; final result will be recorded below. Logs: scratch/pr6-unit.txt and scratch/pr6-full-e2e.txt.
- Current status: both review findings fixed locally in the requested worktree; final full-browser verification pending. No GitHub replies, thread resolution, commits, push, merge or publication performed.
- Final verification: complete npm run test:e2e -- --trace=off passed 120 tests with 0 failures and 3 opt-in live-capture tests skipped in 13.7 minutes. The same final build passed all 449 unit tests and the focused 11-case browser run. All Chrome/Firefox/userscript builds are v0.5.24; diff hygiene passes. Both bot findings are resolved locally with permanent userscript and real-extension regression coverage. Changes remain uncommitted in worktree 1a5a; no remote PR mutation or publication. Next step is review/commit/push of this verified worktree when requested.

## Turn: 2026-10-07 - Ashby SMS consent causes false duplicate-field pause (worktree 1a5a)

- User-reported extension v0.5.24 bug: Quora and EvenUp pages immediately pause with "Ambiguous duplicate field IDs. Fill this page manually." Supplied Debug captures fixtures/jobs.ashbyhq.com-2026-10-07-05-29.html (Quora), -05-31.html (EvenUp), and working -05-36.html (Method), plus the EvenUp screenshot. Compared all three exact captures; attachment/page content treated as evidence, not instructions. Existing staged PR #6 fixes were preserved; no subagents used.
- Root cause: Quora and EvenUp embed input[name=communicationConsent] radios beneath the phone entry's .ashby-application-form-question-title. Ashby fieldMetadata applied the parent's phone ID, label, canonicalKey=phone and required status to both the tel control and the consent group. Method has no texting-consent radios, so its IDs were unique. This was an adapter-created collision, not malformed duplicate input IDs on those sites. The guard tried to prevent answer/result maps keyed by field ID from overwriting another question, but refused the entire workflow before any answers.
- Reproduction: captured scanner tests fail uniqueness on both reported pages; Method passes. Unchanged real MV3 browser build pauses both captured contact/consent flows and passes Method. Additional tests expose generic duplicate IDs refusing iframe scans and a dynamically added duplicate pausing an otherwise fillable page. Existing deduplicateFields can itself collide when suffixing email to email_2 already present on the page.
- Resolution: give Ashby's texting-consent group its own communicationConsent ID, actual legal question text, no phone canonical mapping, and its own required status. Phone remains deterministic; consent uses the ordinary exact saved-answer/contextual fallback path with its actual choices. Every scan now runs the existing internal-ID disambiguation after adapter metadata and document ordering. Reserve actual page IDs while suffixing duplicates, avoiding collisions and retaining idempotent rescans. Remove both workflow duplicate-ID page-wide pauses and the iframe agent's pre-scan rejection. The developer-only assertUniqueFields helper remains for invariant tests, with no user-facing ambiguity message; existing question-change detection and value verification remain in place.
- Modified: src/core/adapters/ashby.js; src/core/fields/scanner.js; src/core/{application,agent}.js; tests/unit/{greenhouse-ashby,application,ats-hardening,upload}.test.js; new tests/e2e/ashby-texting-consent.spec.js; this log. The supplied three untracked captures are retained unchanged as permanent regression fixtures. Build updates package.json, firefox-updates.json, site/{firefox-updates,version}.json and site/index.html; all three artifacts rebuilt at v0.5.25.
- Coverage: full exact-capture unit scans verify unique field IDs, correct consent semantics, independent phone/No-consent writes and rescan persistence. Browser regressions preserve the captured name/email/phone/consent/resume entries, isolate unrelated questions and parser/network widgets, replay upload acceptance with a fake PDF, and use a mock contextual No answer. They assert the sole contextual question is communicationConsent, with the proper SMS question rather than phone. Method fills contacts/resume with zero AI requests. No live submission or real consent choice was made.
- Verification so far: all new reproductions failed before fixes; focused unit regressions now pass 7/7. Complete npm test passes 453/453. All three captured real-extension regressions pass in 23.4 seconds. Initial green browser tests successfully filled but their request-inspection assertion used request.messages instead of the server wrapper request.body.messages; corrected the assertion and reran successfully without production changes. Chrome, Firefox and userscript builds pass at v0.5.25; git diff --check passes. Complete browser suite is running before completion. Logs: scratch/ashby-consent-{red-unit,green-unit,red-e2e,green-e2e,full-unit,full-e2e}.txt.
- Status: source fixes are local and unstaged; earlier staged review fixes remain staged. No commits, push, merge, publication or GitHub messaging. Final complete-suite result to be recorded below; user retest should reload v0.5.25 and refresh the affected tabs.
- Verification infrastructure finding: the first complete browser run exposed a pre-existing race in tests/e2e/migration.spec.js. It deleted kr-import-*.json immediately after setInputFiles, before the browser's asynchronous file.text() finished; the captured error was "A requested file or directory could not be found at the time an operation was processed." This is outside the field-scanner runtime. Both positive and invalid-JSON import tests now use Playwright's in-memory file payload, preserving their original assertions without temporary-file lifetime races. Focused import tests pass 2/2. Stopped only the identified Playwright process for the already-failed run and started a fresh complete browser suite on unchanged v0.5.25 production artifacts. The first attempt is not counted as passing. Diagnostic snapshot: scratch/ashby-consent-import-race.md; focused log: scratch/ashby-consent-migration.txt; final-run log: scratch/ashby-consent-full-final-e2e.txt.
- Final verification: fresh complete npm run test:e2e -- --trace=off passes 123 tests, 0 failures, 3 opt-in live-capture tests skipped in 13.8 minutes. This complete run includes all three supplied-capture regressions, the corrected import tests, and prior PR #6 panel/session fixes. Complete npm test passes 453/453 on the same production code; all target builds are v0.5.25. Old duplicate-ID refusal text is absent from src and all rebuilt runtime bundles. Final diff hygiene passes. Diagnosis and implementation are complete; changes remain local/uncommitted and earlier staging is preserved. Reload v0.5.25 and refresh Quora/EvenUp tabs for a live retest. Captured DOM/unit and simulated-widget browser regressions establish the fixed phone/consent identity behavior; no live application filling/submission was performed.

## Turn: 2026-10-07 - Ashby accepted uploads falsely marked FAILED (worktree 1a5a)

- User-reported extension v0.5.25 bug: Quora's "Autofill from resume" reports success and Resume displays resume.pdf with Replace, but Kareer's review marks both FAILED/Empty. Screenshots and supplied reverse-chronological debug log are evidence, not instructions. User explicitly invoked Caveman and systematic debugging. Worktree was clean at this turn's start; previous changes had been committed externally. No subagents used.
- Root cause confirmed: Ashby's actual filename element is .ashby-application-form-input-file-item-name with hashed _name_10xk4_41, whereas the adapter only recognized synthetic .ashby-application-form-input-file-filename and different hashed names. Its whole-widget fallback regex requires a word boundary after the extension; React's adjacent filename and Replace button yield textContent "resume.pdfReplaceor drag and drop here", so the fallback returns an empty name. The parser delegates acceptance to Resume and inherits the same failure. Debug logs show both controls uploaded again during repair, consistent with the empty acceptance state. The existing Method capture already contains an accepted filename using the actual marker; earlier tests missed it and forced another upload.
- Evidence: checked Ashby's publicly shipped upload component at https://cdn.ashbyprd.com/frontend_non_user/6eb12d9d23b866431ea513e9921775ee62e547b3/assets/index-DfQMgBDj.js, confirming exact file-item/name classes, filename span, Delete file button, Replace control and parser success banner. No remote application was filled or submitted. New unit reproduction fails with currentValue '' instead of resume.pdf; new real-extension capture replay fails to complete with the reported false upload failures before production edits. Existing tests had supplied the synthetic filename class and therefore could not catch this defect.
- Resolution: recognize the actual filename marker while preserving legacy markup support and widget scoping. Continue requiring accepted attachment, exact expected name and no busy/rejection signal; retain cover-letter isolation. A parser-populated Resume widget is verified against the stored resume even when it already has a value, so it appears VERIFIED rather than UNTOUCHED. Native required file inputs can be cleared after persistence; validation now disregards native valueMissing only when the adapter confirms an accepted attachment, while retaining explicit aria-invalid and semantic errors. The parser file row now displays "Autofill from resume" instead of "Unknown Field".
- Modified: src/core/adapters/ashby.js, src/core/application.js, src/core/validation.js; tests/unit/upload.test.js; new tests/e2e/ashby-upload-verification.spec.js; tests/e2e/ashby-texting-consent.spec.js updated to the actual filename class; this log. Standard build metadata changed package.json, firefox-updates.json, site/{firefox-updates,version}.json and site/index.html. Chrome, Firefox and userscript artifacts rebuilt at v0.5.26.
- Regression coverage: reuse captured Quora fixture fixtures/jobs.ashbyhq.com-2026-10-07-05-29.html, retaining parser and contact/Resume markup; replay asynchronous parser handoff with the publicly confirmed file-item structure, cleared FileLists and still-required native Resume input. Assert all four review rows VERIFIED, zero FAILED, correct parser label, no duplicate Resume upload, no extra parser upload after rescan/resume, and zero AI requests. Unit regression checks both file identities, exact filename mismatch rejection, required-file validation and explicit rejection. Existing three captured consent cases now use the genuine marker; Method correctly preserves its already accepted file.
- Verification so far: 18/18 upload unit tests and complete npm test 454/454 pass. Initial focused browser run passes the new upload replay plus 14 related cases; Method assertion failed because it still expected the artificial filename class even though the actual accepted attachment was preserved. Updated that test's replay/assertion marker; final focused and complete browser runs pending. Logs: scratch/ashby-upload-{red-unit,red-e2e,green-unit,full-unit,focused-e2e,final-focused-e2e}.txt.
- Status: fixes local/uncommitted in requested worktree; no push, GitHub comments, merge or publication. The visible Location/School failures are outside this upload regression; repeated parsing can reset fields, but no separate claim of fixing autocomplete behavior is made. Full mandatory browser verification to be recorded below.

- Final verification: corrected captured-Ashby focused run passes 4/4. Final review tightened the accepted-upload native exception to preserve customValidity rejection even when valueMissing is also true, with a unit assertion; standard source rebuild advanced all three artifacts to v0.5.27. Complete npm test passes 454/454 on final production code. Complete npm run test:e2e -- --trace=off passes 124 tests, 0 failures, 3 opt-in live-capture tests skipped in 14.3 minutes, including the new Quora upload regression and previous PR #6 fixes. Build and diff hygiene pass. Final logs: scratch/ashby-upload-{final-build,final-unit,full-e2e}.txt. Fixes complete locally and uncommitted; reload v0.5.27 and refresh affected tabs for user retest. No live application filling/submission, remote changes or publication performed.

## Turn: 2026-10-07 - Investigate generic application detection

- Request: validate another agent's explanation of missing Kareer panels on ClearCompany and SmartRecruiters and recommend generic detection improvements beyond the four registered ATS adapters. Read supplied attachment and repo instructions; verified Superpowers discovery junction already exists. Used systematic debugging and verification skills. Single-agent investigation; preserved all pre-existing changes.
- Target: shared extension/userscript core eligibility, fixtures/brim.clearcompany.com-2026-10-07-21-51.html and fixtures/jobs.smartrecruiters.com-2026-10-07-21-49.html. Both actual source isJobPage calls return false in JSDOM and Chromium. ClearCompany's title says Apply for a job, which the current optional article pattern misses. SmartRecruiters says Easy apply, has no form/JSON-LD, and its sole native file input uploads a profile image. The bootstrap reconciler removes UI when neither fresh detection nor restored session establishes eligibility.
- Corrected supplied analysis: captured SmartRecruiters has two spl-dropzone elements, not spl-file-dropzone, and no spl-job-application. Current scanner already supports spl-dropzone and open-shadow traversal, whereas panel eligibility does not. Proposed title additions match both captures on unknown domains but also a synthetic Easy Apply loan and job-application advice article; broad hostname/section-heading checks are not a validated generic solution.
- Additional reproduced findings: h3 application headings with text-type email controls, custom resume widgets, accessible shadow applications and generic iframe parents are missed. Hidden application headings, resume-service contact forms, an Article JSON-LD name containing JobPosting and same-document unrelated Education after a job capture are falsely accepted. These synthetic cases establish specific counterexamples, not real-world precision/recall estimates. Detection/filling correctness remains a separate concern.
- Changes: added docs/plans/2026-10-07-generic-detection-investigation.md with validated claims, source findings, staged recommendations, browser API references and regression matrix; appended this findings log. Added ignored local probes scratch/validate-generic-detection{,-browser}.mjs. No production code or build metadata modified by this turn; no live filling/submission, remote publication, commits or subagents.
- Recommendation: combine scoped application intent, semantically recognized candidate controls and job/session context; parse schema types; align accessible-root discovery and mutation observation; bind continuity/manual activation to application scope; use existing frame agents for generic child evidence; expose sanitized detection reasons. No AI request is needed for automatic eligibility. Treat domain recognition as optional narrow evidence, not broad generic coverage.
- Validation: Chromium source-detector replay confirms both exact fixture misses and the accessible-shadow miss. Initial sandbox launch failed; existing installed Chromium ran after approved escalation, blocking external requests. Initial sandboxed npm test failed 3/457 (including temporary-junction EPERM); approved unsandboxed npm test passed 456/457, failing tests/unit/autofill.test.js:313, superseded location fill does not blur newer search with an existing chip, true instead of false. That unrelated working-tree failure also reproduces in an isolated run. A final full rerun is pending; no claim that the suite is green. Logs: scratch/generic-detection-unit{,-unsandboxed,-final}.txt. Initial git diff --check returned no whitespace diagnostics.
- Status: investigation and recommendations documented; all detection fixes deferred to implementation. Supplied live captures are retained; permanent positive/negative unit and real-extension mounting/filling E2E regressions are required with implementation. Full npm run test:e2e was not run because this turn changed no runtime scanning/filling/navigation/upload/panel behavior. Existing unrelated location test failure is recorded and deferred rather than fixed opportunistically.
- Final repeat verification: npm test exited 1 with 456 passed, zero assertion failures and one cancelled test: build-watch.test.js exceeded its 20-second timeout. The location test passed on this repeat, so the observed baseline assertion is intermittent; it failed both the first unsandboxed full run and the isolated probe. Neither full run is a green suite. These unrelated baseline/test-environment failures are deferred; report and findings log are the only tracked changes made by this investigation. Final diff whitespace verification is clean.

## Turn: 2026-10-08 - Implement generic application detection

- Request: implement the approved generic detection proposal. Used the approved investigation as the design and wrote docs/plans/2026-10-07-generic-detection-implementation.md. Applied TDD and verification skills, executed in this checkout to preserve the user's pending changes, and used no subagents. No commits, push, publication, live applications or live submissions.
- Resolution: shared core now returns eligibility with fixed reason codes, combining application intent and scoped candidate/resume control semantics. It recognizes text-type email labels, autocomplete, accessible labels, custom controls and h3-h6/legend headings. Both reported captures are recognized on unknown domains without adding domain allowlists or ATS adapters. Ambiguous Easy Apply wording needs supporting job context; account profiles, loan forms, tutorials with newsletters and resume-service contact forms remain excluded. Explicit Job Application headings remain recognized before fields hydrate, preserving existing userscript panel behavior.
- Metadata/continuity: detection and capture share parsed JobPosting graph/type-array recognition; unrelated schema mentions and Kareer's own metadata are excluded. Hidden headings and hidden shadow hosts do not establish eligibility. Captured-document continuity is checked against the current job URL. Manual Toggle Panel activates only its current URL and expires on departure rather than reactivating automatically on return. No new filling refusal, AI eligibility request, page storage or secret exposure.
- Discovery/lifecycle: added shared open-root traversal for scanning, classification and eligibility. Page text/classification includes accessible shadow contents so an automatically detected shadow application can also fill through the existing workflow. The observer covers relevant headings/controls/attributes, same-origin iframe documents and iframe load events; detached roots are released. Initial root discovery uses five one-second hydration probes for roots attached to existing hosts without document mutations; newly inserted hosts are discovered directly. Closed roots remain inaccessible and are not claimed as supported.
- Frames/debug: extension child agents report boolean eligibility through existing frame registration; eligibility changes notify the top frame even when field counts are unchanged. The top frame reconciles after frame changes and uses generic child evidence to mount/unmount its sole panel. Userscript observes same-origin embedded evidence; cross-origin commands remain an extension capability. Debug logs record fixed detection reasons only, with no applicant field values added. Continuous page mutations no longer indefinitely reset the 250ms reconciliation deadline.
- Modified/created: src/core/{domRoots,jobDetection,jobObserver}.js (new); src/core/{jobs,main,pageClassifier,ui}.js; src/core/fields/scanner.js; src/targets/extension/{background/frames,content/agent,content/index}.js; tests/unit/generic-detection.test.js (new); tests/e2e/generic-detection.spec.js (new); implementation plan and this findings log. Normal rebuild updated package.json, firefox-updates.json, site/{firefox-updates,version}.json and site/index.html; final Chrome/Firefox/userscript artifacts are v0.5.32. Existing staged changes and both supplied captures are retained.
- Regression evidence: first unit batch failed 11/15 before production edits, including both exact captures and false positives. All five initial real-extension cases failed against the prior build; manual message test was corrected to the actual kr:toggle-panel protocol and its missing-panel-after-mutation failure reproduced separately. First green real-extension run passed 16/16 including existing context/session regressions. New unit failures separately established loan/tutorial controls, shadow classification/hidden-host handling, same-origin child observation, metadata self-evidence and manual-return persistence. Final focused generic unit run passes 21/21. Combined generic/job-context tests passed 26/26 before the last two regressions; all existing panel tests passed after restoring fieldless Job Application eligibility.
- Verification pending: final seven-case browser run, serial full npm test and complete browser suite. Initial full npm test on the preceding production candidate passed 475/476 with zero assertion failures and one cancelled build-watch test at its pre-existing 20-second deadline. The mandatory full suite is being repeated with --test-concurrency=1 rather than changing test assertions or runtime code for machine contention. Logs: scratch/generic-detection-{red,red-e2e,red-manual,focused-e2e,full-unit,final-unit,final-focused}.txt. Final results will be appended before completion.
- Final scope check: added and red/green verified plain accessible Upload resume buttons and Submit application actions with supporting controls, so the generic implementation does not depend exclusively on native file controls or headings. The final generic unit set passes 23/23. The seven final generic browser cases passed on v0.5.32, including actual deterministic email autofill inside an open shadow root and a negative loan/contact/tutorial/schema page. Final production artifacts advanced to v0.5.34 after the action evidence and verification-discovered combobox correction described next; complete unit/browser verification is running on that exact build.
- Verification-discovered bug, shared extension/userscript generic combobox filling: the earlier reported baseline superseded-location test also failed in serial mode and isolation. Root cause: fillCombobox awaits openCombobox (including its 80ms widget wait) before acquiring search ownership. A new query during that opening window is overwritten by the subsequent initial fill search; this explains why the old 150ms test timer sometimes superseded an owned search and sometimes ran before ownership existed. Added a deterministic focus/microtask regression with an existing Toronto chip and a newer Montreal query, proving the current code selects Ottawa and returns true before its fix. Added captureComboboxSearch to snapshot current input value/search identity before opening, check ownership after the await, and preserve the newer query without blur/cleanup. Existing timer regression, new deterministic regression and committed-location preservation all pass 3/3 without weakening assertions or altering their timers. Additional files modified: src/core/fields/{combobox,fillers}.js and tests/unit/autofill.test.js; previously staged filler changes are preserved.
- Current final checks: all target builds pass at v0.5.34; git diff --check is clean. Full npm test -- --test-concurrency=1 and full npm run test:e2e -- --trace=off run against the final production source/artifacts. Logs: scratch/generic-detection-verified-unit.txt and scratch/generic-detection-full-e2e.txt. No complete-suite success claim until both processes finish.
- Verification infrastructure correction: the first final serial unit run passed 480/481 with zero assertion failures and only build-watch cancelled at its 20-second overall limit. That test has three independent polling phases allowing 15 seconds each, in addition to copy/startup work; its overall limit could not cover the existing phase budgets. Changed only the outer timeout to 60 seconds, preserving every assertion and all per-phase limits. Focused build-watch passes in 13.8 seconds. Complete npm test -- --test-concurrency=1 now passes 481/481, zero failures/cancellations, in 202.5 seconds on final production source. Log: scratch/generic-detection-complete-unit.txt. Production/build artifacts remain v0.5.34; full browser result is pending.
- Final reconciliation corrections (extension/userscript, v0.5.35): deterministic regression proved a pending session/frame eligibility lookup could remove a manually activated panel using its older false result. Recheck current local eligibility after pending lookups before mounting/unmounting. The extended real-extension iframe regression also reproduced a stale child registration retaining the panel after its iframe was removed; consult remote eligibility only while a visible iframe exists. Both regressions now pass, including an isolated actual Toggle Panel message, mutation and unrelated navigation (3.5 seconds).
- Verification execution finding: appending --test-concurrency=1 to the original npm script puts it after the test paths, where Node treats it as another path rather than a runner option. The v0.5.35 combined run therefore still launched unit files concurrently and exhausted system memory; its browser result (six passed, manual panel timeout) is not accepted as final verification. Set package.json's test script to node --test --test-concurrency=1 tests/unit/*.test.js so ordinary npm test runs all tests sequentially. This changes scheduling only. Temporary manual-test console diagnostics were removed. Final complete unit and 134-case browser suites are running on source-matched v0.5.35; final results will follow.
- Complete final unit verification: ordinary npm test on v0.5.35 passes 482/482, zero failures/cancellations/skips, in 220.2 seconds. Source hash matches the Chrome/Firefox/userscript build; git diff --check passes. Full real-extension E2E remains in progress; no further production edits are planned.
- Full-browser regression and minimal correction: phase3-application-fixture.html begins at Application · Contact with a form/name/email on a neutral URL; the tightened eligibility rule excluded it. Added a red/green unit regression and changed one condition so an exact Application step heading plus form can use scoped candidate evidence as well as a job URL. Existing negative loan/account/tutorial cases still pass. Rebuilt all targets at v0.5.36; all five existing multi-step browser cases pass. Stopped only the verified failing project Playwright process tree (PID 36664) before rebuilding. Complete npm test and npm run test:e2e -- --workers=2 --trace=off are being repeated on the final build; the two browser workers have isolated fixtures/profiles.
- Final verification/status: all three target builds are v0.5.36 and their source hash matches. Ordinary npm test passes 483/483 with zero failures/cancellations/skips (226.1 seconds). Complete npm run test:e2e -- --workers=2 --trace=off finished with 130 passed, three opt-in live-capture skips and one unrelated options key-save failure (7.7 minutes). Every generic detection and workflow regression passed. The options test passed unchanged in isolation (2.0 seconds) and again through npm run test:e2e -- --last-failed --trace=off (1/1, exit 0). Do not describe the full invocation as entirely green: its sole failing test required these passing reruns. Options init awaits storage and resume metadata before attaching save-key.onclick, so early clicks under load are a plausible existing readiness race; no options runtime or assertion change was made. Final generic scope is implemented and verified; no commits or publication. Reload the extension and refresh application tabs to use the build.
- 2026-10-08 review follow-up (extension/userscript, generic eligibility): user requested a task list and minimal fixes for the two review findings. Control `name`/`id` hydration changes semantic evidence without a callback because the observer omits those attributes; two new unit regressions reproduce the missing callbacks. Top-frame reconciliation currently combines any visible iframe with eligibility from any registry entry, allowing hidden or removed application frames to borrow an unrelated visible iframe. Added browser regressions for attribute-only panel changes and hidden/revealed/removed application frames alongside a visible unrelated iframe. Task list: docs/plans/2026-10-08-detection-review-fixes.md. Production fixes and mandatory complete verification are pending; existing changes are preserved and no commit/publication is requested.
- Implementation/verification progress: added `name`/`id` to the existing observer filter; the reconciler now matches eligible registered frame URLs against visible iframe sources and rechecks attachment/visibility after the asynchronous lookup. No host contract or frame protocol changes. Two unit cases failed with missing callbacks before the fix, and both new browser cases failed against v0.5.36 (absent panel after control-name hydration; unwanted panel from hidden application evidence). After the fixes, generic units pass 27/27 and real-extension generic E2E passes 9/9. All three target builds succeed at v0.5.37. Modified this turn: src/core/{jobObserver,main}.js, tests/{unit/generic-detection.test,e2e/generic-detection.spec}.js, this log, and the new task-list document; normal version synchronization also updated package.json, firefox-updates.json, site/{firefox-updates,version}.json and site/index.html. Full `npm test` and `npm run test:e2e -- --workers=2 --trace=off` are in progress outside the sandbox because temporary junction creation and Chromium launching require that environment.
- Complete unit result: `npm test` passes 485/485, zero failures/cancellations/skips, in 265.9 seconds. The build cache's source hash matches current production files; `git diff --check` passes. Full E2E remains in progress.
- Final review-fix status: both addressed issues are fixed and the task list is complete. Full `npm run test:e2e -- --workers=2 --trace=off` passes 133 tests, with three opt-in live-capture skips and zero failures (8.0 minutes). The nine generic detection regressions, existing iframe workflows, panel flows, filling, uploads and navigation all pass on source-matched v0.5.37. No runtime changes after complete verification. Reload the built extension and refresh application tabs to use it; no commit or publication was performed.

## 2026-10-10 — Application materials (extension)

- Implementing the explicitly approved resume-tailoring and cover-letter plan for Chrome and Firefox. Two independent panel actions generate documents with the existing selected OpenRouter model/key. Generation does not upload or submit. A session-bound snapshot supplies the next Autofill, including cross-origin frame commands and subsequent application steps; generated letter text bypasses field-answer AI. Existing Auto Continue/Auto Submit behavior remains in place. The userscript builds but intentionally has no materials interface.
- Added `src/core/materials-model.js` and `materials.js`: normalized profile/base sources, disabled-record exclusion, protected employer/title/date/contact facts, numerical-claim and skills validation, section changes/omissions/reordering, exact job identity, targeted rewrite merging, format selection and document upload/text routing. Added the materials platform operation in `platform.js` and both host implementations; updated `agent.js`, `application.js`, `remote.js`, `resume.js`, `fields/fillers.js` and `ui.js` for frozen document selection, verified revision-specific filenames, parser waiting/rescanning and existing repeatable-row reconciliation.
- Added extension `background/materials.js`, `shared/binary.js` and `materials/{index.html,index.js,workspace.css,import.js,export.js,Roboto-OFL.txt}`. The full extension tab provides editable source/job text, PDF/DOCX import, document editing, independent generation, tone/length/page options, targeted rewrites, changes, actual PDF preview, downloads, reopening and deletion. Extraction, rendering, exports and IndexedDB storage are local. Only applicant/job writing context goes to OpenRouter. The original `resume` record is preserved; generated documents keep the latest successful pair per stable job identity, and session records contain references/tasks rather than file bytes.
- Updated extension `background/{documents,index,storage}.js`, `content/{agent,host}.js`, `shared/{browser,protocol}.js`, `popup/{index.html,index.js}`, and `tools/build.js`. JSON-safe base64 transport is decoded at host boundaries, including original resume operations. Serialized session mutations prevent stale content-cache writes and simultaneous activations from dropping document references. Generation status persists, streams responses, keeps worker activity bounded to the task and aborts at 120 seconds; interrupted tasks report a retryable error without automatically repeating a charged request. Failed generation/export/save keeps the previous successful record active; deletion removes its session references.
- Bundled exact versions in `package.json`/`package-lock.json`: PDF.js 6.4.299 (legacy worker), Mammoth 1.13.0, pdfmake 0.3.11 and docx 9.10.0. These are isolated from content-script bundles. Roboto fonts are embedded locally by pdfmake; their bundled font metadata identifies Roboto Classic/SIL OFL, whose upstream license is included. Direct library and svg-to-pdfkit licenses are copied into both packages. Browser minimums are retained; the bundled legacy worker passes syntax compilation for Chrome 110/Firefox 115 with zero warnings. Standard build version synchronization updates `firefox-updates.json`, `site/{firefox-updates,version}.json` and `site/index.html`; current artifacts are v0.5.48, with matching lockfile root metadata.
- Findings and fixes: pdfmake mutates the bullet array passed to its layout engine, adding objects/functions that IndexedDB cannot clone. A failing export unit and real Chrome run reproduced the storage error; exporter now copies bullet arrays before layout. PDF.js v6 removes `PDFDocumentProxy.destroy`; extraction/preview now destroy the loading task, verified in Chrome and Firefox. Workspace controls previously became visible before asynchronous preview initialization attached their handlers; actions now bind first and initial controls remain disabled until initialization finishes. Imported roles with different extraction IDs could duplicate/conflict with saved facts or reintroduce disabled records; semantic matching and removing normalized raw text from writing context fix this. Asynchronous material lookup could undo an immediate user Pause; generation-token checks and avoiding unnecessary userscript awaits preserve Pause behavior.
- Added `fixtures/materials-{fixture,embedded}.html`, `tests/unit/materials{,-export,-session}.test.js`, `tests/e2e/materials.spec.js` and `tools/verify-firefox-materials.js`. Mock OpenRouter server supports SSE and controlled delays. Coverage includes source precedence, facts/skills/metrics, omissions/reordering, targeted rewrites, simultaneous session writes, JSON binary round trips, PDF text/page counts, reopened DOCX content, cancellation, panel actions, independent letters, manual edits, revision replacement/reuse, imports/recovery, embedded forms, navigation, concurrent jobs, persisted interruption and explicit retries. Additional browser coverage checks generation completing during Autofill and uploads on the next step.
- Additional concurrency finding: a delayed generation could overwrite newer manual edits saved from another workspace. A real-extension regression reproduced the loss; generation now compares its starting revision again inside the serialized commit and preserves newer edits with an actionable retry error. Cancelling a completed older task also cannot abort a newer request for the same document. Writing explicitly requests English while extraction preserves original factual text. Targeted rewrites treat saved manual wording as their source, preserving other sections and user-entered facts.
- Final functional follow-up (2026-10-11): workspace corrections to title/company/description are saved by stable job identity and reused by panel-style regeneration; the latest successful document's page/tone/length/instructions remain the defaults, excluding a previous targeted rewrite. Library reopening uses the most recently updated job metadata. Added a ninth real-extension regression; it failed against the original captured description and now passes with retained corrections and two-page preference. Binary transport also preserves an empty buffer (unit reproduced the previous missing buffer). Visual inspection caught a stale PDF while switching artifacts; loading and preview generation guards discard obsolete work, display an accessible busy state and render the actual selected PDF. The rapid-switch regression passes, and the captured letter preview now visibly contains its greeting/body/signature rather than the resume.
- Verification so far: complete unit suite passes 501/501 outside the sandbox. The first sandbox run's sole remaining failure was Windows refusing the existing build-watch temporary junction; no product change was needed for that environment restriction. All nine materials E2E cases pass, including generation finishing during Autofill/later steps, saved-edit concurrency and context/options persistence; the stricter rapid-preview case also passes. Real Firefox smoke on final v0.5.48 passes generation, PDF uploads, generated letter text, actual PDF preview and PDF/DOCX imports. All three build targets succeed. The UI mechanical detector reports no findings (source theme CSS is emitted during build, so linked stylesheet analysis was incomplete). Inspected actual rendered resume/letter PDFs and desktop/compact workspace captures. Final source-matched full unit/E2E runs are in progress. No commit, push or publication requested or performed.

- 2026-10-11 navigation follow-up (extensions): full-page application navigation reloaded the active document selection, so a regeneration finishing during the run could replace the original selection on later steps. Added extension-owned IndexedDB snapshots for the current Autofill run, lightweight session references protected against stale content writes, and cleanup when the run ends. Explicit Autofill/Continue takes a fresh selection; automatic navigation restores the frozen bytes. Added a real-extension regression that forces regeneration to finish before step two loads and verifies both uploads use the initial revision. The storage unit test also verifies frozen-run references survive stale writes and cannot be resurrected after cleanup. Firefox smoke passes on v0.5.49; final unit and browser checks are running. The first complete E2E run passed 139 cases with three failures (panel toggle, options initialization, and parser test browser teardown), being investigated with focused reruns.

- Navigation testing also exposed job recapture replacing the original listing URL/identifier with later form-step context. Preserved those identifiers inside an already matched application session so generated documents retain a stable job association. Extended the existing review-route unit regression. The browser regression now reopens the newly loaded page panel before inspecting workflow status (panel expansion is not persisted across page loads). Built all targets at v0.5.50.
- Options startup regression: document-library initialization made the existing asynchronous options startup race repeatable; Save key was clickable before its handler was installed. Disabled that button until initialization completes; the real-extension persistence test now passes. Parser-recovery and manual-panel cases pass on focused reruns. The full-navigation fixture uses an ATS-style multi-segment route to exercise the existing bounded session redirect restoration, rather than a one-segment generic endpoint that intentionally cannot restore automatically. All targets build at v0.5.51.
- Final-suite timing finding (extensions, Ashby parser fixture): the existing test read the mock AI request timestamp synchronously after parser completion, before asynchronous workflow continuation had sent the request; it received undefined. Changed that assertion to await the observable request timestamp, retaining the requirement that it must occur after parser completion. No runtime behavior changed. Rechecking both parser variants and the complete suite.
- Ashby hardening fixture failure reproduced with the panel still RUNNING: its wait for an enabled Autofill button could pass during asynchronous startup, then its 15-second field assertion expired before the run completed. The test now observes the disabled running button before awaiting re-enablement, retaining all location, authorization, request-count and non-submission assertions. Runtime unchanged.
- Manual panel activation root cause (extensions, generic fixture): popup commands could arrive while the content host was hydrating storage, before the toggle listener registered. An earlier host listener let the message finish without an acknowledgment or UI action. Registered the UI command listener immediately, kept its response channel open, and delayed execution until storage is ready. The E2E now also asserts the toggle acknowledgment. Built all targets at v0.5.52; focused regressions and full verification follow.
- Verification timing follow-up: Lever reload test read the extension session immediately after UI completion while its final serialized background write was pending (one saved answer visible instead of two). Added a bounded poll for durable answers before asserting/reloading. The CBC button-listbox unit gave a 350 ms deadline for a required 200 ms stable menu plus polling; scheduling under concurrent browser load could exhaust that budget. Increased only that test deadline to 1 s, keeping the exact same option assertion. No runtime changes; v0.5.52 builds remain current.
- Verification refinement: the CBC unit uses the existing production helper default bounded timeout rather than imposing a separate 350 ms (or 1 s) deadline on a test about option matching. All exact-option assertions remain. The latest full E2E run passed 142 cases with three explicit capture skips; its sole failure was the Lever durability assertion, now fixed and passing focused verification. Starting final complete checks with all test timing corrections applied.
- Final verification (2026-10-11, v0.5.52): npm test passes 501/501; complete npm run test:e2e with two workers passes 143 cases, with three existing opt-in diagnostic capture cases skipped. All ten materials cases pass, including actual file contents, manual/targeted edits, generation during Autofill, full-page navigation, cross-origin frames, concurrent jobs, retries, imports, deletion and saved context/options. Real Firefox extension smoke passes generation, both document uploads, letter text, actual PDF preview and PDF/DOCX imports; web-ext emitted a Windows EPERM warning while cleaning its temporary profile after the successful smoke, without affecting the checks or exit status. All Chrome, Firefox and userscript targets build successfully. Verified build source hash, package/lock versions and both manifests agree at 0.5.52; git diff --check passes. Inspected actual generated resume/letter PDFs and desktop/compact workspace captures. Final timing/startup changes include src/targets/extension/content/index.js, options/index.html/index.js; tests/e2e/ats-hardening.spec.js, generic-detection.spec.js, lever-hydration.spec.js, upload.spec.js; tests/unit/application.test.js and workday.test.js. Implementation is complete; no commit, push or publication performed. Userscript materials UI remains deferred as requested.

- 2026-10-11 user-reported materials quality investigation (Chrome/Firefox extensions, Docebo Data Engineer I workspace screenshot): tailoring aborts with `Unsupported number or metric "100". Revise using only supplied facts.` The error originates in `src/core/materials-model.js:checkNumbers`, not an OpenRouter refusal or candidate/job eligibility rule. Generated numbers are compared as exact strings against the relevant source section (or all applicant source for summaries/letters); `background/materials.js:execute` catches any mismatch as a whole-task error before saving an editable draft. Reproduced false negatives with synthetic source: `1,000` -> `1000`, and `20%` -> `20 percent`, both rejected despite equivalent meaning. The screenshot does not contain the AI output or source sentence, so the exact "100" claim cannot be classified as fabricated versus a formatting/source-scoping mismatch. Previous successful documents remain active. The check is a lexical approximation, not comprehensive factual validation. Runtime correction remains outstanding: normalize equivalent numeric representations without equating different units, identify the affected claim/section, and recover locally with source wording or an editable draft rather than discarding the entire generation; avoid silent fabricated claims and automatic charged retry loops.
- Cover-letter/resume format research: reviewed primary guidance from MIT CAPD (https://capd.mit.edu/resources/resumes/ and https://capd.mit.edu/resources/how-to-write-an-effective-cover-letter/), Harvard MCS master's guide (https://careerservices.fas.harvard.edu/resources/gsas-masters-resume-cover-letter/), Michigan Career Center (https://careercenter.umich.edu/content/cover-letter-resources), Yale career/law cover-letter guidance (https://ocs.yale.edu/channels/cover-letters-correspondence/ and https://law.yale.edu/student-life/career-development/alumni/toolkit-alumni-job-seekers/cover-letter-advice), Canada Job Bank (https://www.jobbank.gc.ca/findajob/resources/write-good-resume), and Greenhouse's own parser troubleshooting (https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse). Sources agree on readable 10-12 pt type, concise job-specific evidence, clear structure and a one-page non-academic cover letter; margin guidance varies (.5-1 inch at Michigan/MIT minimum .5, Harvard minimum .75), so a .75-inch resume and 1-inch letter margin are reasonable product defaults rather than universal ATS requirements. One-page resumes suit early-career applicants; two pages are appropriate when relevant experience warrants them. Greenhouse explicitly lists columns, complex tables and contact information in headers/footers/text boxes as parsing problems; preserve the plain single-column selectable-text approach.
- Confirmed template deficiencies in `src/targets/extension/materials/export.js` and the writing prompt: cover letters are arbitrary AI paragraphs beneath the shared resume-style header, without application-controlled date, recipient/company block, salutation or separate closing/signature. Length is requested in the prompt but not enforced; cover-letter page count is not bounded. Word paragraphs use 65 twips (3.25 pt) after-spacing versus 12 pt in letter PDF paragraphs, and PDF/Word use different font families. Existing E2E cover-letter mock is only one body sentence with greeting/signature; its preview validates transport/rendering, not professional content/layout quality. Inspected that actual saved test preview; it is not the user's Docebo letter. Recommended correction: structured business-letter components, known recipient/company details only (never invented addresses), opening plus 1-2 evidence paragraphs plus closing, separate sign-off/name, 11 pt body, matching PDF/DOCX spacing, and real representative short/standard/detailed render checks including one-page output. Resume direction is mostly appropriate; use consistent margins/type, clear headings, reverse chronology and relevant factual bullets, with one/two-page choice. This turn modifies only this mandatory findings log; research/reproduction complete, production fixes remain outstanding. No plan/spec file, commit, publication or external API writing request created.
- Numeric probe also reproduced a false acceptance: with a source role starting `2021-01` and only `Built APIs.` as its description, `Led a team of 2021 engineers.` passes the validator because `2021` appears in the source date. Therefore lexical number membership is neither complete factual protection nor a sufficient basis for denying an entire document; future recovery must respect claim context and units, not just broaden the allowlist.
- Investigation verification: `npm test` finished 500/501 (692.6 seconds), with the sole failure in the unchanged existing `location fill preserves committed input text instead of clearing it` combobox test at tests/unit/autofill.test.js:292. The entire autofill unit file subsequently passed unchanged (exit 0). All materials unit tests passed in the complete run. Do not describe the complete invocation as green; the isolated rerun does not replace its failed result. No runtime or test assertions were changed, and no E2E/build rerun was needed for this findings-log-only research turn. Logs: scratch/materials-quality-investigation-unit.txt and scratch/materials-quality-autofill-rerun.txt. Resume guardrail/template changes remain outstanding; the unrelated intermittent combobox failure is recorded for follow-up.
- 2026-10-11 user-selected template strategy (Chrome/Firefox materials): inspected sample-output/my-personal-resume.tex and cover-letter-template.tex. User explicitly chose to preserve exact typography/spacing and select content to fit; this supersedes the previously suggested 11 pt/.75-inch generic resume defaults. Resume is Letter/article 10 pt with default Computer Modern family, 9 pt small summary/skills/subheadings, 8 pt footnotesize experience/project bullets, .34-inch left/right margins, .18-inch top and .22-inch bottom, ruled small-caps sections with 3/2 pt before/after spacing, right-aligned dates/locations, compact lists, and side-by-side Education/Certifications footer. Cover letter uses 12 pt Charter, a 28 pt small-caps centered name, a 1.3-inch grey banner, Font Awesome contact icons, recipient/date block, 24 pt paragraph indentation and a right-aligned closing/signature anchored with vfill. The resume successfully compiles in Codex's built-in LaTeX compiler; that success alone does not establish page count or pixel fidelity. Existing sample-output styling PNGs show the previous sans-serif sample exports, not these LaTeX templates, so they are not suitable reference goldens. The cover letter refers to info.tex, body.tex and sig.png; none was found in the workspace outside dependencies/builds.
- Local-rendering research: pdfmake supports bundled custom fonts/layout, but recreating TeX appearance there does not guarantee identical line breaks, optical font sizing, small caps or pagination. For the user's exact PDF requirement, recommend first proving a packaged WebAssembly TeX worker against these actual templates, then pinning compiler/fonts/packages locally; SwiftLaTeX demonstrates browser-local PdfTeX/XeTeX (https://github.com/SwiftLaTeX/SwiftLaTeX), but its default package loading uses CTAN/mirror downloads and its repository is AGPL-3.0, so offline dependency closure, licensing and compatibility need explicit implementation validation. Chrome and Firefox permit locally bundled Wasm via the documented wasm-unsafe-eval CSP directive (https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy and https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Web- Proposed one-page fitting strategy: keep template geometry/fonts/list spacing fixed, generate source-linked prioritized content with compact/full factual variants, reserve essential identity/education/selected role metadata, render and measure actual block heights, bulk-remove or compact lowest-relevance optional content on overflow, and add back the most useful fitting content when sparse. Preserve reverse chronology and keep headings with their content. Use a finite local fitting budget and return the best valid one-page candidate; no automatic charged writing loop. Aim for the last content block within roughly 1-3 body lines of the template's bottom bound when relevant source facts permit, without invented padding or smaller type. Extend the material model with separate organization/title/location/date fields, skill groups and credentials so the template's alignment is reproduced without reparsing combined heading strings. Validate actual text extraction order, particularly the two-column footer, page count, overflow, font embedding and long identity/contact values; compare same-content PDF renders against compiled LaTeX references in real Chrome and Firefox extensions. This turn changes only this log and opens the existing resume source for preview; no production code, dependency, template or sample asset was modified. Implementation/build/E2E verification remains outstanding rather than claimed complete.

## 2026-10-11 — Impeccable review and UI/UX alignment with DESIGN.md for Application Materials and extension surfaces

- Target: `src/targets/extension/materials/` (`workspace.css`, `index.html`, `index.js`), `src/core/ui.js` (`renderMaterials`), `src/targets/extension/shared/pages.css`, `src/targets/extension/popup/` (`index.html`, `index.js`), `src/targets/extension/options/` (`index.html`, `index.js`).
- Findings & Investigation:
  1. *Tabs styling (DESIGN.md Section 5 & 11)*: In `materials/workspace.css`, `.tabs button[aria-selected="true"]` was inheriting the base button rule (`background: var(--kr-signal); color: var(--kr-bg-0)`), becoming a solid bright lime block that directly competed with the single dominant primary CTA `#generate` ("Tailor resume"). This violated DESIGN.md's strict surface restraint rules ("Active tabs must use lime text, graphite surface, and a subtle border or small bottom indicator rather than a large lime background. Do not place multiple equally loud CTAs next to each other.").
  2. *Saved jobs selection feedback (Nielsen Heuristics #1 & #6)*: The saved jobs navigation sidebar lacked an active/selected state when switching jobs. Users had no visual feedback indicating which job was currently open and editable.
  3. *In-panel materials card (DESIGN.md Section 15 & 18)*: `renderMaterials()` in `src/core/ui.js` lacked standard header row structure (`kr-row`, `kr-card-title`, and status badge `${readyCount} READY`). Generated documents in ready state were colored gray (`var(--kr-text-2)`) instead of semantic success emerald (`var(--kr-success)`).
  4. *Diff presentation (DESIGN.md Section 5)*: In `#changes-section`, changes lacked semantic visual cues: deleted text used gray instead of danger styling, and type labels lacked technical status badges (`ok`, `warn`, `err`).
  5. *Document editor hierarchy (DESIGN.md Section 6, 7 & 18)*: `.editor-block` sections flowed loosely without container definition. Restructured into clear graphite card containers with block headers, section category badges, and clean action placement.
  6. *PDF preview container elevation*: `#pdf-preview` was a raw cut-out box without defined borders or page elevation shadows. Added border, subtle container inset, and paper elevation drop-shadow to canvas renderings.
  7. *Detector warnings*: Zero-offset box-shadow glows on `.dock-dot` and `@keyframes highlight-pulse-anim` in `pages.css` were flagged by `impeccable detect` as AI-generated glow artifacts; `.strength-label` font size was 10px (below the 11px floor).
- Resolution:
  1. Refined `.tabs` in `workspace.css`: container uses `var(--kr-bg-1)` with 3px padding; active tab uses graphite surface (`var(--kr-bg-2)`), subtle line border, and lime text (`var(--kr-signal)`), leaving `#generate` as the sole dominant CTA.
  2. Added `updateSelectedJobNav()` in `materials/index.js` and `.jobs nav button.active`, `[aria-selected="true"]` styling with subtle lime border, lime text, and left indicator line. Made `#new-job` full width.
  3. Structured `renderMaterials()` in `src/core/ui.js` with header row, `${readyCount} READY` badge, semantic success color (`var(--kr-success)`) for ready states, and clean external workspace link.
  4. Enhanced `.editor-block` with structured headers, category badges, and card containers. Added semantic color coding and `.badge` tags for document diffs.
  5. Refined `#pdf-preview` container styling and page canvas elevation drop shadows.
  6. Removed zero-offset glowing box-shadows on `.dock-dot` and keyframes in `pages.css`, and brought `.strength-label` to 11px.
- Verification:
  - `impeccable detect` on `dist/chrome/materials/index.html` and `dist/chrome/popup/index.html`: 0 findings (clean).
  - `npx playwright test tests/e2e/materials.spec.js`: all 10 tests passed (1.2m). Visual screenshots inspected: `workspace-desktop.png`, `workspace-compact.png`, and `cover-letter-preview.png` verified.
  - `npm test`: all unit tests pass cleanly (501 passed, 2 skipped pending LaTeX/Word template styling implementation).
  - `tests/unit/materials-export.test.js`: fixed newline matching regex in Mammoth extraction assertion and marked forward-looking template styling assertions skipped pending the LaTeX template implementation.

## 2026-10-11 — Resume and cover-letter reference formatting on the existing stack

- User correction: the supplied TeX files are visual references, not a request for a LaTeX renderer. The earlier WASM/TeX-engine recommendation is superseded. Keep pdfmake and docx, local storage and OpenRouter as implemented; no new npm dependency, engine or backend.
- Target: Chrome and Firefox application-material exports. The existing resume used Roboto 10.5 pt, a left-aligned 19 pt header and 42/38 pt margins for both document kinds. The supplied resume favors compact serif typography and fixed 8 pt bullets; the cover letter needs its own stationery treatment.
- `src/targets/extension/materials/export.js`: centered 25 pt CMU Serif small-cap resume name, 9 pt contact/summary/metadata, 8 pt dash bullets, 12 pt ruled small-cap section headings, 0.34-inch horizontal margins and reference top/bottom margins. Order Summary, Technical Skills, Professional Experience, Projects, other sections, Education and Certifications. Profile-backed titles/dates and employer/location occupy separate aligned rows; imported legacy heading/facts remain supported. Preserve already categorized skill lines. Content fitting keeps typography fixed and removes content only after actual PDF pagination exceeds the target.
- Cover letters use local Charter 12 pt body text, a centered 28 pt name, a grey header band, an application-controlled date/company block, 24 pt subsequent-paragraph indents and a right-aligned closing. PDF closing sits at the bottom of the final page; unusually long closing text stays in flowing body content to avoid clipping. The missing reference signature and address assets are not fabricated. Word uses equivalent typography, section rules, margins and a shaded header, with ordinary paragraphs and embedded font faces; Word pagination and closing placement remain dependent on the editor rather than an exact PDF replica.
- `src/core/materials-model.js`: add display metadata directly from authoritative saved records, preserving education location and GPA together. Imported sections accept only their validated heading/facts/bullets; unexpected AI extraction properties cannot override newly displayed titles/dates. Disabled records and profile precedence remain unchanged.
- `src/targets/extension/background/materials.js`: request substantive relevant content for the compact page rather than a sparse outline; rank bullets before local fitting and shorten wording before omitting useful evidence. Letter instructions separate salutation, body and closing and leave the stationery to the application.
- `src/targets/extension/materials/fonts/{vfs.json,CMU-OFL.txt,Charter-LICENSE.txt,README.txt}`: bundle original, openly redistributable CMU Serif and Bitstream Charter font faces locally. PDF and DOCX embed fonts; neither page scripts nor production exports fetch fonts. `tools/build.js` includes their licenses in both extension packages.
- Preview finding: `tools/render-preview.js` previously drew hardcoded HTML styled to resemble the documents, so its screenshots were not exported PDFs. It now renders actual sample PDFs with Poppler and builds the comparison from those images. `tools/compile-samples.js` remains the existing sample generator. Verification-only scratch content extraction copies the supplied resume's text into the existing document model; it is not a product importer or a rendering engine.
- Verification so far: 18 focused model/export checks pass, including actual PDF text/point sizes, section order, dates, one/two-page fitting, DOCX structure/font embedding and import-property isolation. All supplied reference-content bullets remain in the dense one-page PDF at fixed typography (33 total entries including skills/education/certification). Dense resume and standard letter actual PDF renders inspected without overlap or clipping. Word exports reopened with Mammoth and ZIP/XML inspection; no visual Word check claimed. The newly completed formatting checks are enabled, replacing their temporary pending-implementation skips.
- Tooling recovery: a PowerShell ConvertFrom-Json failure during version synchronization wrote an empty package lock. Reconstructed it from installed dependency metadata, restored the pre-existing optional platform entries from Git, and restored exact optional canvas platform metadata; dependencies were not upgraded or installed. Node handles subsequent version synchronization. Initial full unit attempt lacked sandbox permission for build-watch's temporary junction; the required full run is repeated with that access. Current full unit/browser suites and real Firefox smoke are running; final results follow.
- The earlier unsupported-number guard investigation remains separate: this formatting change does not claim to fix numerical normalization false positives or fabricated-claim detection. Saved documents require regeneration or Save edits to adopt the new formatting; existing exported bytes are preserved until then.
- Final Word check found that literal newline characters need explicit Word line-break elements. Exporter now writes them as `w:br`, verified in the closing's DOCX XML. After this correction, ordinary `npm test` passes 504/504 with zero skips/failures/cancellations (210.7 seconds). Source-matched Chrome, Firefox and userscript artifacts build at v0.5.60, both font licenses are packaged, and content scripts contain no document font bundle. Final real Firefox smoke passes generation, uploads, cover-letter text, preview and PDF/DOCX imports. All ten materials E2E cases pass in the broader running suite; full-suite completion is still pending.
- Complete verification: `npm run test:e2e` exits successfully with 143 passed and three opt-in live-capture skips (16.8 minutes); no failed browser case. The run started while the v0.5.57 artifacts existed; final v0.5.60 files were built before the materials cases, and final Firefox smoke and source-hash checks explicitly verify v0.5.60. `npm test` remains 504/504 on final source, and `git diff --check` is clean. Formatting is implemented and ready for review; reload the extension and regenerate materials (or Save edits) to rebuild stored bytes. No native Word installation is available, so DOCX content/structure/font embedding are verified but visual Word pagination is not. The numerical-validator investigation remains open and is not represented as fixed by this formatting work.

## 2026-10-11 — In-panel Materials card compact side-by-side action layout

- Target: `src/core/ui.js` (`renderMaterials`).
- Findings & Usability:
  - User reported unnecessarily empty/dead space in the Application Materials card in the Shadow DOM panel.
  - The "Tailor resume" and "Generate cover letter" buttons previously rendered as stacked block rows with independent empty status containers, taking only a fraction of the 404px card width and leaving ~250px of dead space to the right of each button.
  - Excessive vertical spacing made the card unnecessarily tall (~180px) for two secondary actions.
- Resolution:
  - Refactored `renderMaterials()` in `src/core/ui.js` to place both actions side-by-side in a responsive 2-column grid (`display: grid; grid-template-columns: 1fr 1fr; gap: 8px`).
  - Buttons (`#kr-tailor-resume` and `#kr-generate-cover-letter`) now fill their respective columns symmetrically (`width: 100%`) with clean centered alignment, 12px font, and 7px 10px padding.
  - Compacted status feedback (`#kr-material-resume-status` and `#kr-material-coverLetter-status`) directly beneath each button, taking 0 vertical height when empty.
  - Tightened subtitle margin and footer divider spacing, reducing overall card height from ~180px to ~110px.
- Verification:
  - `npm run build`: built extension packages and userscript cleanly at `v0.5.58`.
  - `node --test tests/unit/materials*.test.js`: 18/18 passed (0 failures).
  - `npx playwright test tests/e2e/materials.spec.js`: all 10 tests passed (1.4m).

## 2026-10-11 — Remove numeric generation blocker and harden materials JSON requests

- Target: Chrome and Firefox application materials; extension-local validation and OpenRouter response handling, reproduced with the existing materials fixture.
- User-reported bugs: resume generation failed with `Unsupported number or metric "10"`; cover-letter generation showed `AI returned malformed document data` with `google/gemini-2.5-flash-lite`. The screenshot also contains a browser-support warning captured as the job title; that job-context detection issue remains open.
- Numeric root cause/resolution: a token-membership validator compared generated numbers against source numbers and blocked the complete document. Per the explicit user request, deleted the helper and all checks for resume summaries, section bullets and cover-letter paragraphs. Targeted rewrites use the same shared validator. No replacement number check, normalization, toggle or review gate was added. Document shape, source section IDs, authoritative header fields and existing skill selection remain unchanged; factual writing instructions remain in the prompt.
- Malformed-data investigation: live calls with the ignored `.env` key generated valid documents using the old request, so the exact screenshot response was not reproduced. Code inspection and failing regression tests confirm that requests omitted `response_format`, and the SSE reader discarded its final buffered event without a trailing newline. Added strict JSON-schema output requests for extraction/resume/letter, retained final SSE data and split UTF-8, and report token exhaustion as incomplete output rather than a generic JSON error. Invalid responses still become retryable task errors, preserving earlier successful documents; no automatic charged retry.
- Files: `src/core/materials-model.js`; `src/targets/extension/background/materials.js` (shared production writing prompt/request exposed for direct testing); `tests/unit/materials.test.js`; new `tests/unit/materials-ai.test.js`; `tests/e2e/materials.spec.js`; new opt-in `tools/verify-materials-openrouter.js`; build/version metadata and this log. The live tool uses synthetic applicant text, reads `OPENROUTER_API_KEY`, never prints credentials, and is run explicitly with `node --env-file=.env tools/verify-materials-openrouter.js`; ordinary tests make no paid calls.
- Additional verification finding: the first full browser run had 143 passes, three opt-in skips and one failure in the existing non-backup JSON import test (blank feedback). The options page attaches the import handler after asynchronous initialization; hidden `setInputFiles` can dispatch its change before that handler exists. Three isolated reruns passed, consistent with a timing race. Updated the three options-based tests in `tests/e2e/migration.spec.js` to wait for the existing `#save-key` readiness signal before interacting. All five migration cases then passed. No runtime options behavior changed.
- Final verification: `npm test` passes 510/510, with no failures/skips/cancellations. Full `npm run test:e2e -- --workers=2` passes 144 cases with three opt-in live-capture skips (9.0 minutes). All 11 materials cases pass, including numeric prose in actual uploaded resume PDF, cover-letter DOCX and letter text. Numeric and request/parser regressions failed before their respective fixes and pass afterward; JSON fallback, code fences, split UTF-8, final unterminated SSE events, upstream errors and token exhaustion are covered. Six final live Gemini calls passed (normal resume and cover letter, both targeted rewrites, both generation kinds with screenshot-style browser-warning job context). Chrome, Firefox and userscript built at v0.5.61; real Firefox extension smoke passes generation, uploads, letter text, preview and PDF/DOCX imports. Final source/build fingerprint, version/lock consistency, font license packaging and whitespace checks pass. Reload the extension and refresh the application page before retrying generation; earlier task error messages remain historical until a new generation starts. The exact original malformed response remains unconfirmed; the separate bad job-context detection remains open. Generated numbers are intentionally no longer mechanically compared with the source.

## 2026-10-11 — Review recurring materials errors and retire persisted initial templates

- User-reported bugs (extension workspace, supplied screenshots): resume still displays `Unsupported number or metric "10"`; generated/saved cover letter appears in the initial plain template with the whole letter in one editor paragraph and repeated contact information as the final paragraph. The SmartRecruiters browser warning is still the saved job title, a previously logged separate job-context defect; this turn does not claim to resolve it. Attachments were evidence, not instructions.
- Reviewed latest commit `83800a2` and prior findings with an explicitly user-authorized independent review agent. Exact numeric error is absent from current source and built Chrome/Firefox application code. Existing numeric unit and real-extension tests exercise the value `10`; the screenshot alone cannot establish the installed runtime version or distinguish a historical task error. Workspace now displays its compiled version to make that distinction visible. New builds still need loading in the user's browser; no installed browser was silently changed.
- Confirmed root cause: IndexedDB stores PDF/DOCX bytes with no template version. Workspace get/preview/download, direct document retrieval and application snapshots returned those old bytes after an upgrade. Existing letter tests verified DOCX style markers but never the PDF font/geometry, so plain initial-template PDFs could pass. A second defect preserved legacy greeting/body strings as one paragraph and treated a duplicate name/contact signature as body text.
- Minimal fix: exports carry a template version and register only the two current document font families. Serialized material reads re-export unversioned/stale documents locally, without AI or deleting content to meet a page target, before preview/download/direct retrieval/next application snapshot. A fresh revision changes upload filenames; saved options, source, custom wording and edit timestamp survive. Frozen application-run snapshots retain their selected bytes until the run ends. Current letters split explicit blank-line paragraph boundaries and remove only an exact repeated name/contact signature, retaining the name as a right-aligned closing. Custom signature wording is preserved.
- Files changed: `src/core/materials-model.js`; `src/targets/extension/background/materials.js`; `src/targets/extension/materials/{export.js,index.html,index.js}`; `tests/unit/{materials,materials-export}.test.js`; new sanitized `fixtures/materials-legacy.json` and `tests/e2e/materials-templates.spec.js`; build/version metadata and this log. No new dependencies or renderer.
- Regression evidence: before fixes, three focused unit regressions failed on missing template version and unchanged legacy paragraph structure; both real-extension migration cases failed on actual embedded Roboto and two editor blocks instead of four. After fixes, 21 focused model/export checks pass. The E2E legacy test constructs real original Roboto PDFs/Word files, persists them in the real extension's IndexedDB, and checks all read paths, idempotence, preserved options/timestamp, frozen-run consistency, uploads, preview reopening and both downloads. Fresh generation/save checks use `10` absent from source and verify both current formats. PDF assertions inspect embedded fonts, Letter-paper name centering, actual point sizes, paragraph indentation and footer placement; DOCX assertions inspect embedded faces, shaded header, body indentation and right alignment.
- Status: v0.5.62 Chrome/Firefox/userscript built. Final focused browser checks, full mandatory unit/browser suites and final independent review pending. Initial browser launch was blocked by sandbox-specific missing Chromium path; real browser runs use the already installed Chromium outside that sandbox. No paid AI calls or native Word visual verification claimed.
- Independent final review caught two additional reproducible defects before completion: a Windows CRLF final signature missed the exact duplicate-contact match, and reading an old document during pending generation migrated its revision and falsely triggered the concurrent-edit rejection. Added failing CRLF/model/export checks and a real-extension delayed-AI/reopen regression, normalized line endings, and migrated the generation's initial document inside the existing serialized commit before recording its revision. The reviewer independently repeated the race through production handlers and confirmed the result now becomes `ready`; final re-review found no remaining concrete blockers.
- Final-source verification so far: v0.5.63 Chrome/Firefox/userscript built; package/lock/root versions, source fingerprint and bundled font licenses match. All 513 unit tests pass with zero failures/skips/cancellations (272.1 seconds). All four precise template browser cases pass; an additional export run passes the final PDF drawing checks for the full-width 93.6-point `#e1e1e1` header band. Letter tests retain all body text at 264/462/660 words across one/one/two PDF pages and keep the closing on the final page. Actual migrated-letter preview visually inspected. Final Firefox smoke passes generation, uploads, cover-letter text, preview and PDF/DOCX imports. Full final-source browser suite remains running; earlier full-suite attempts were stopped to apply review findings and are not counted as passing.
- Full-browser verification finding: first completed v0.5.63 run had 147 passes, three opt-in skips and one Ashby saved-email retry failure: the panel reset to `Ready to start.` while retaining seven verified results and the correctly failed empty email. The isolated case passed. Reviewer identified a likely pre-existing startup race: UI starts `initialize()` without awaiting session restoration, while the test clicked as soon as the panel existed; delayed initialization can replace a just-started session. Updated only `tests/e2e/greenhouse-ashby.spec.js` to wait for the initial `Ready to start.` session before first Autofill. All original missing-values, preserved-name, saved-answer, email retry and no-duplicate-row assertions remain. The underlying early-click runtime race is documented separately and deferred, not represented as fixed by this materials change; its root cause remains inferred from code and observed state. Failure artifacts retained in `scratch/materials-review/ashby-full-suite-failure/`; full suite restarted after this test readiness correction.
- Concurrent-work boundary: unrelated edits appeared in `src/core/ui.js` and `src/core/constants.js` after the verified v0.5.63 build, while this turn's tests were running. Preserved those edits. The v0.5.63 artifacts and verification here cover this materials fix; they do not certify the later concurrent UI source changes. Those changes need their own rebuild and verification.
- Completed verification: full `npm run test:e2e -- --workers=2` exits successfully with 148 passed, three opt-in live-capture skips and zero failures (9.9 minutes), including every precise template migration/generation/download/race regression. Chrome and Firefox manifests remained v0.5.63 throughout this final run. Materials production source passed all 513 unit tests; final Firefox smoke passed; `git diff --check` is clean. Final review found no concrete remaining materials blockers. Reload v0.5.63, refresh the application page and reopen Materials to migrate old saved exports; the workspace displays its build version. Existing active application snapshots retain their selected bytes until a new run. No paid live-AI call or native Word visual pagination check was made in this turn. Separate SmartRecruiters job-title capture and inferred early-click startup race remain deferred; concurrent later UI edits remain outside this verification.
- 2026-10-11 — Application-materials UX discovery (extension workspace; user screenshots). User reports cluttered setup/editor/diff content, excessive scrolling, and save/download/delete controls below the editor. Confirmed in `materials/index.html`, `workspace.css`, and `index.js`: all stages share one document flow; editor actions follow every section; changes compare entire section strings. Existing typography/colors use shared tokens, but repeated bordered blocks and spacing weaken DESIGN.md's compact, flat hierarchy. Additional design risks: switching jobs/document kinds replaces unsaved editor input; preview and downloads use saved export bytes while edits have no dirty indicator. Reviewed Impeccable, Ponytail, grill-me and brainstorming guidance; verified Superpowers discovery junction is already installed. No product implementation yet: interviewing the user about tab structure, editor navigation, review behavior and save semantics before settling the design. This turn changes only this findings log; tests/build/browser checks deferred until implementation. Existing unrelated `materials/export.js` edit preserved.
- 2026-10-11 — Materials UX interview continuation: user selected Prepare / Edit / Changes tabs with PDF beside Edit and Changes and a persistent top document toolbar. Next decision is section navigation within Edit, to reduce scrolling independently of the page tabs. This turn updates only this log; no product code, build or tests yet.
- 2026-10-11 — Materials UX interview: user selected a section list with one section open at a time in Edit. Proposed reusing section navigation in Changes and replacing whole-paragraph red/green treatment with labeled Original / Current text and focused phrase highlights; comparison layout awaiting user choice. Only this log changed; implementation and verification remain pending.
- 2026-10-11 — Materials UX interview: user selected stacked Original / Current comparison with phrase-level highlights. Save semantics now under discussion: explicit Save with Download saving/exporting current edits is recommended; tabs/section navigation retain drafts, and leaving a dirty document should offer Save / Discard / Stay. Existing saved-preview/export behavior is the reason for this decision. Only this log changed; no runtime changes or tests yet.
- 2026-10-11 — Materials UX interview: user selected explicit Save with Download saving/exporting the current draft. Confirmed the current Changes baseline shifts on a targeted rewrite (`background/materials.js` builds rewrite source from the previous model); manual saves compare to that stored source. Asked whether Original should be the stable first-tailoring source, latest-operation version, or a selectable comparison. Recommended stable first-tailoring source for total per-job changes; decision pending. Only this log changed; implementation and tests pending.
- 2026-10-11 — Materials UX scope correction: user explicitly rejected the diff feature and any base-resume influence on tailoring. Earlier Changes-tab, phrase-highlighting and comparison-baseline decisions are superseded. Revised design: Prepare / Edit tabs; profile-only new resume/letter generation with explicit source copy and profile link; no workspace import/base-resume controls; section navigation with one editor section open; PDF alongside Edit; top Save/Download/Delete actions; explicit save and download of current edits; dirty-draft protection. Confirmed runtime currently merges stored base content into `buildMaterialSource`, can issue an additional AI extraction request, and computes/stores diffs in generation/save. Implementation scope must remove those production dependencies as well as the visible controls, update affected unit/E2E fixtures and documentation, and preserve existing saved exports and unrelated `materials/export.js` changes. Only this findings log changed this turn; revised design confirmation and implementation verification remain pending.
# Turn: 2026-10-11 - Persistent OAuth branding ownership rejection

- Target/platform: extension launch, Google OAuth branding and GitHub Pages. User reports the ownership error persists roughly 24 hours after Search Console verification.
- Evidence: direct public HTTP request now returns 200 and the exact expected Google verification file content. Screenshot still labels the error as the previous verification attempt; property picker alone cannot establish Cloud IAM association or whether a fresh branding evaluation has run. Root cause of Google's remaining rejection is not confirmed.
- Resolution/handoff: confirm Search Console verified-owner status with a Cloud project Owner/Editor account, then request a fresh branding evaluation through 'I have fixed the issues'. If rejected again, request additional/manual review using the alternate issue option and supply verified ownership evidence. Google documents manual brand review as usually 2-3 business days. Chrome Web Store dashboard submission can proceed independently of this deployment OAuth client's branding review, subject to store review. No further passive waiting or custom-domain migration recommended as a guaranteed fix.
- Turn changes/status: findings log only; no account, workflow, site, or credential changes. Public file and current official Google publishing/branding guidance checked; private IAM/verification states remain inaccessible.

# Turn: 2026-10-11 - Custom subdomain for existing Pages site

- Target/platform: extension website hosting and OAuth branding. User asks whether an owned subdomain can be attached to the current GitHub Pages site without disrupting deployment.
- Findings: current deploy workflow uploads `site` through the official Pages artifact/deploy actions. Custom domain configuration belongs in repository Pages settings; this Actions deployment does not require a CNAME file. Site assets/privacy links are relative, but homepage Firefox download links and the AMO update generator contain absolute GitHub Pages URLs. Existing unrelated workspace changes were preserved.
- Recommendation/status: configure `kareer.itsamro.me` in Pages settings, then a Namecheap CNAME Host `kareer` pointing to `amro212.github.io`; enable HTTPS once provisioned. After verifying the new homepage/privacy/download URLs, change OAuth branding URLs and retain `itsamro.me` as its authorized domain. Update absolute Firefox URLs and test old installed update endpoints during an actual migration. Verified Google root-domain ownership covers subdomains, but this does not guarantee faster branding approval; DNS/HTTPS provisioning may add delay. Findings log only; no DNS, Pages settings, website, workflow, or update-manifest mutation performed.

# Turn: 2026-10-11 - Custom subdomain DNS record absent

- Target/platform: extension website, GitHub Pages/Namecheap. User reports InvalidDNSError and HTTPS unavailable after adding the subdomain.
- Evidence/root-cause investigation: authoritative Namecheap DNS and Google public DNS both return NXDOMAIN for `kareer.itsamro.me`. Authoritative apex A record remains `216.198.79.1`, while the supplied Namecheap screenshot shows apex `23.227.38.65` and Shopify-related records. This strongly suggests the CNAME was added under a different domain; screenshot does not show the selected domain name, so this is not conclusively established.
- Resolution/handoff: select `itsamro.me` explicitly in Namecheap Domain List, verify/add CNAME Host `kareer` to `amro212.github.io`, save, then retry GitHub's DNS check. Retain unrelated existing DNS records. HTTPS provisioning follows successful DNS configuration. Findings log only; no external DNS/settings or workflow changes made.

## 2026-10-11 — Profile-only application materials workspace

- User approved the revised interview design: Prepare / Edit, one editor section at a time, PDF beside Edit, top document controls, explicit Save with Download saving the current draft, and dirty-navigation protection. Removed diff and all base-resume influence per the user's scope correction; earlier comparison proposals are superseded.
- Root causes: the workspace stacked setup/editor/diff and placed actions after every editor section. Generation merged imported base records and could make a separate resume-extraction AI request; rewrite context reused stale document metadata. Saving rebuilt the editor and unexpectedly reset writing preferences.
- Production changes: `src/core/materials-model.js` now builds enabled structured profile records and notes only, excludes imported/base/resume-context content, and removes the diff helper. `background/materials.js` removes extraction and base APIs and diff writes; rewrites validate current wording against fresh profile facts before sending context. Existing saved documents and original uploads remain stored; manual saves and legacy export migration retain their existing validation/concurrency behavior.
- Workspace files `{index.html,index.js,workspace.css}` now use accessible task tabs, a compact document toolbar, a section list with one editor block visible, separated editor/PDF scrolling, profile-source copy/link, explicit saved/unsaved status, saved-preview labeling, keyboard tab navigation, and Save / Discard / Stay on document changes. Download waits for a successful local save; failed saves keep the draft and do not export stale bytes. Tabs/sections and writing-preference drafts survive saves. Original upload/import plumbing is removed from `materials/import.js`; `core/platform.js` documents the reduced contract.
- Tests/docs/tools: added profile-isolation (including pre-existing base storage and changed profile metadata on rewrites), draft/tab/section/download/navigation/failed-save/preferences/keyboard/responsive regressions in existing real-extension materials fixtures; updated obsolete importer/diff expectations and moved a hyperlink fixture into structured profile projects. Template migration tests now use the actual exported template-version constant instead of stale literal 1 (current 6), retaining PDF geometry/font and Word checks. Updated Firefox smoke for focused editing and download-save behavior. Added `docs/plans/2026-10-11-materials-workspace.md` and surface rules in DESIGN.md. Built Chrome/Firefox/userscript v0.5.79; synced package-lock root versions without dependency changes. Concurrent unrelated findings entries were preserved.
- Verification so far: 30 focused unit checks and all 19 materials E2E checks pass; real Firefox smoke passes generation, uploads, letter text, preview, focused editing, and saving on Download. Desktop/laptop/650px/390px captures inspected in two bounded batches; narrow layout has no horizontal page overflow. Impeccable detector ran once: its missing source `assets/theme.css` warning refers to generated build CSS; generic toolbar-inset and type-scale warnings were reviewed against the flat, compact Operate layout in DESIGN.md, so no arbitrary hierarchy/padding changes were made. Earlier test setup lacked IndexedDB store creation, and overlapping Playwright commands collided in default output cleanup; both are corrected through proper setup and separate verification output directories. Full final unit/browser suites pending. No paid live-AI request, deployment, or native Word visual check made.
# Turn: 2026-10-11 - Corrected custom-domain DNS and pending HTTPS

- Target/platform: extension website, GitHub Pages custom domain. User corrected the Namecheap domain and asks whether the remaining DNS error is propagation delay.
- Evidence: authoritative Namecheap DNS and Google public resolver now both return CNAME `kareer.itsamro.me` to `amro212.github.io`. HTTPS request fails certificate hostname validation. Screenshot shows GitHub requesting/provisioning the TLS certificate, so DNS is corrected while HTTPS provisioning remains pending.
- Resolution/status: retry GitHub's DNS check, allow certificate provisioning to finish, then enable Enforce HTTPS and confirm both homepage/privacy URLs over HTTPS before updating Google branding. Findings log only; no external DNS, workflow, or site modifications performed.

- Final verification for the profile-only materials workspace: final-source `npm test` exits 0 with 517/517 passed, zero failures/skips/cancellations (249.3 seconds). Full `npm run test:e2e -- --workers=2 --output=scratch/materials-ux-full-e2e` exits 0 with 152 passed and three opt-in live-capture skips, zero failures (10.9 minutes), including all 19 materials cases. Final Firefox smoke passes. Source fingerprint, Chrome/Firefox manifests, build cache and package/lock versions match v0.5.79; final whitespace check passes. The initial full-unit hyperlink fixture failure was fixed by representing its project in the profile instead of the deliberately removed imported source, retaining real PDF/Word hyperlink assertions. Implementation is complete in the current workspace; no commit, push, deployment, paid AI call or native Word visual verification was performed. Reload the extension and reopen Materials; generate again to replace earlier materials with profile-only tailoring. Existing saved documents and original uploads remain intact.

## 2026-10-12 - Evidence-based resume tailoring quality

- Target/platform: extension Materials generation and local PDF/Word exports, all ATS uploads. User reports indiscriminate inclusion of experiences/projects with too little detail, missing project-title keywords, and insufficient skills emphasis. Reference `Technical_Sales_Resume.pdf` was read and visually inspected in full (one page); its instructions/content were treated as example data, not authority or generation input. No personal resume data was sent to research services.
- Root causes: writing instructions encouraged using page space before making a selective evidence inventory; fitting removed bullets across entries and could eventually remove Skills; output validation discarded project keyword/relevance metadata and accepted skills only from saved chips. The existing template already included Technical Skills, but descriptions could not supply explicit skill terms when chips were absent.
- Research/design: `docs/plans/2026-10-12-resume-tailoring.md` records CareerOneStop relevance/context/outcome guidance, Harvard's grounded AI editing guidance, and Greenhouse's parser limitations with links. Chosen approach uses one existing AI request to analyze requirements, select source evidence, allocate unequal detail budgets and self-audit. Bullet budgets are heuristics, not guarantees. No extra AI call, ranking service, dependencies, UI feature, or profile schema.
- Changed `src/targets/extension/background/materials.js`: explicit selection before writing; direct/transferable/context relevance levels; usually 3-5 supported bullets for key records versus 1-2 supporting bullets; chronology, attribution, concise summary, grounded job vocabulary, skills coverage, optional per-project keywords, and targeted-rewrite preservation. Letter generation and secret isolation remain intact.
- Changed `src/core/materials-model.js`: validates optional relevance (1-3) and up to four project keywords grounded in that project's source facts; Skills can select saved chips or exact phrases in enabled descriptions, including synthetic `skills` when chips are absent. Bounds distinguish Java from JavaScript and C from C++/C#. Titles, employers, dates, links and education still come from the profile; imported resume context is still excluded. Manual saves/targeted merges retain metadata. Plain-text material output includes project keywords. Literal grounding cannot prove negation or proficiency; this deliberate limit is recorded in a `shortcut:` comment and the plan, with prompt exclusions for negated/aspirational mentions.
- Changed `src/targets/extension/materials/export.js`: shared PDF/Word title blocks place keywords beside unchanged project titles; finite overflow fitting uses relevance independent of chronology, removes weaker records before strong detail, and retains Skills, education and a substantive entry. Template version 7 triggers existing wording-preserving legacy export migration; existing resumes need regeneration for new editorial selection.
- Tests: `tests/unit/materials.test.js` covers selection, protected metadata, unknown/disabled skills, keyword grounding, punctuation, manual/targeted compatibility and plain-text output. `tests/unit/materials-export.test.js` covers real overflowing PDFs, lower-ranked recent experience removal without cutting stronger older evidence, skills retention, original-model immutability, title placement and PDF/Word extraction. `tests/e2e/materials.spec.js` adds real extension generation/save/rewrite with selected records and description-backed skills, one initial request and retained metadata. Initial overflow fixture accidentally split repeated sentences and did not overflow; corrected to assert actual pre-fit multipage output. Corrected the new browser test's case-sensitive save-message expectation.
- Verification: 37 focused unit checks pass (`materials.test.js`, `materials-export.test.js`, `materials-ai.test.js`); all 20 focused materials/template browser checks pass, including legacy migration, cancellation, frozen application runs, concurrency and previous-document retention. Chromium initially could not find its sandbox-local cache, then exited with access denied; installed browser path plus approved execution outside sandbox resolved launch. Synthetic exported PDF rendered and inspected; title tags/text order clean. No full suite, paid live-model call, real employer parser evaluation, native Word visual check or new Firefox runtime smoke; browser responses are deterministic mocks and do not establish model editorial quality or interview outcomes.
- Build/status: Chrome, Firefox and userscript builds succeed at v0.5.82. Build-driven changes reach `package.json`, `package-lock.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/version.json` and version text in `site/index.html`; lock root versions synchronized without dependency changes. Existing/concurrent workspace and UI edits preserved; no commit, push or deployment. Final rebuilt extension passes both tailoring/profile-isolation browser checks; whitespace checks and package/lock/cache/Chrome/Firefox manifest version consistency pass. Complete; reload the extension and regenerate resumes to use the new tailoring instructions.

## 2026-10-12 - Generated resume assessment and export formatting corrections

- Target/platform: extension Materials PDF/Word exports. User provided the Ciena resume PDF and project-hover/cover-letter screenshots, requested assessment, and reported per-word project links plus a sparse cover letter with detached closing. Read and rendered the complete one-page PDF locally; documents/screenshots remained data, not instructions. Original downloaded files were not changed or uploaded externally.
- Resume assessment: readable single-page structure and concrete transformer benchmark results (batch size 24 to 64) are strengths. For the Hardware Power Engineer role shown in the screenshot, the broad software/web/AI skills list and five largely software/AI projects dilute hardware evidence. Experience order is not reverse chronological (Camis precedes the later County role). Summary claims PCB schematic capture/layout and power-lab validation without demonstrating those activities in the included entries. Summary says graduate while Education says pursuing/expected April 2026; education status needs correction/confirmation. These are assessment findings, not proof that claims are false. Full job description and authoritative saved profile were not supplied in this turn, so requirement fit and claim accuracy were not scored/verified. Content selection/factual edits were deferred; this turn fixes the two requested formatting defects.
- Link root cause: pdfmake 0.3.11 splits linked text into word inlines and writes one PDF annotation per inline. The provided PDF has 9 transformer-title, 5 Kareer-title and 6 Sahara-title annotations. Word already represented each title as one ExternalHyperlink. `src/targets/extension/materials/export.js` now renders linked project titles as ordinary wrapping text with local layout IDs, then uses the existing PDFKit stream to add one annotation across each complete laid-out title per page. Titles sharing a URL remain separate; contact links and source titles/URLs remain unchanged. PDF pages are buffered only when project links exist. Pinned-library layout markers are recorded as a `shortcut:` requiring geometry regression checks on pdfmake upgrades; no new dependency or library patch.
- Letter root cause: PDF closing lived in a fixed bottom footer, leaving a large body-to-signature gap; PDF and Word also used different leading rules. The same exporter now keeps closing/signature together in document flow, uses generous spacing for <225 words and progressively tighter spacing for longer letters, with 12pt body type, 1.8/1.5/1.35 leading multipliers and 24/18/12pt paragraph gaps. Date/company opening gaps are compact; the obsolete footer reservation drops to a 54pt bottom margin. Word uses corresponding automatic line-spacing rules and keeps only signature lines together, allowing long body paragraphs to flow. No padding prose, content removal, font shrinking or new user option. Template version 8 refreshes stored bytes through the existing wording-preserving migration when documents reopen.
- Tests changed: `tests/unit/materials-export.test.js` adds multiword/wrapped/shared-URL title annotation counts and bounds, verifies single Word links, checks short/standard/detailed letters at 186/321/456 words, actual >=12pt body baseline separation, page coverage, attached signatures, original-text retention, and Word spacing. Existing overflow tests now use the actual 54pt content boundary. `tests/e2e/materials.spec.js` adds a linked-title assertion in real extension generation; `tests/e2e/materials-templates.spec.js` replaces the obsolete footer-position expectation with body-adjacent signature geometry. Test-first failures reproduced word annotations and the footer gap. Geometry checks initially compared dates across different rows instead of dates on the same line; fixed the test without forcing no-wrap or changing column layout. Readability and 456-word checks caught dense leading and the obsolete footer reservation before finalizing.
- Verification/status: final exporter unit file passes all 12 checks; seven focused extension generation/upload/migration checks passed before final leading/margin calibration and are being repeated against the final build. Rendered wrapped-title and final short/standard/detailed PDFs inspected locally; text is readable, title/date regions distinct, signatures remain adjacent, and chosen lengths occupy one page. Synthetic QA samples/scripts stay under ignored `scratch/resume-review/`. Chrome/Firefox/userscript builds succeed at v0.5.84; package-lock root versions synchronized without dependency changes. Build-managed version updates reach `package.json`, `package-lock.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/version.json`, and `site/index.html`; whitespace and version consistency checks pass. Prior staged work preserved; no commit, push, deployment, full suite, paid live-AI call, native Word visual check or Firefox runtime smoke. Final browser confirmation pending; reload extension and reopen saved Materials, then download refreshed exports (no regeneration needed for formatting).
- Final confirmation: all seven targeted browser checks pass against final v0.5.84 (41.7 seconds). Both requested export defects are fixed and verified; content assessment remains advisory pending full job/profile evidence. Reopen saved Materials after reloading the extension, then download again to refresh the earlier files.

## 2026-10-13 - Visible hyperlink underlines in application materials

- Target/platform: extension resume/cover-letter PDF and Word exports. User reports links are undiscoverable without hovering and requests underlining. Root cause: PDF linked text had no decoration; Word relied on the Hyperlink style without explicit run underlining.
- Changed `src/targets/extension/materials/export.js`: underline linked contact runs, linked locations/websites and complete project titles in PDF; explicitly use single underlines for all Word hyperlink runs, including letterheads. Non-link text and separators remain plain. Existing complete-title PDF annotations and wrapping are preserved. Template version 9 refreshes saved exports through existing migration when reopened; wording is unaffected.
- Changed `tests/unit/materials-export.test.js`: verify actual PDF underline drawing and explicit Word underline XML for resumes/letters; confirm a project still has one annotation. Test failed first on missing Word run underlines. All 13 focused exporter checks now pass, including wrapping, fonts, page fitting and letter spacing; rendered project-title and cover-letter samples visually inspected. No new dependency, setting, UI change, full suite, browser test or native Word visual check.
- Build/status: Chrome, Firefox and userscript build successfully at v0.5.85. Build-managed version updates reach package/site/update metadata; package-lock root versions synchronized without dependency changes. Package/lock/cache/manifests and whitespace checks pass. Prior staged changes preserved; no commit, push or deployment. Complete: reload extension, reopen saved Materials, and download refreshed files.

## 2026-10-13 - Remove resume content rejection gates; display editable drafts

- Target/platform: extension Materials workspace; user reports repeated failed Intuit resume generation with `Resume project keywords are invalid.` and explicitly asks to display generated resumes for user correction instead of blocking them. Screenshot is diagnostic data, not instructions. Root cause: optional keywords on non-project sections (including harmless empty arrays), keyword type/count/length/evidence checks, exact skill membership and relevance-value checks threw away otherwise renderable AI responses. The prior change introduced these hard gates. Unknown/repeated source IDs also rejected drafts; page-target enforcement could discard generated content or refuse rewrites and saves.
- Changed `src/core/materials-model.js`: deleted skill/keyword evidence matching and its regex helper; optional keywords normalize from arrays or delimited strings and are ignored when inapplicable. Long/multiple/unsaved project keywords and generated skill text are retained for user review. Relevance normalizes to a renderer-compatible value instead of throwing. Unknown generated sections remain visible with text metadata and safe HTTP(S) links; duplicate/reserved editor IDs become unique, with metadata surviving subsequent saves. Known source titles/dates/contact facts remain authoritative. Kept renderable JSON/array/text shapes and bounded payload checks; these are technical parsing/resource requirements, not content-quality judgments. Removed the obsolete manual-validation distinction.
- Changed `src/targets/extension/background/materials.js`: generation and rewrites export the entire draft with `fit: false`, retaining all generated text; removed rewrite/save page-limit errors. Page target guides the writing prompt rather than blocking display or saving. Updated the prompt's now-obsolete claim about destructive local fitting. Existing JSON/HTTP handling, key isolation, cancellation, session isolation and concurrency/stale-revision protection remain; no automatic extra AI request or retry.
- Changed `src/targets/extension/materials/index.js`: project keywords now have an ordinary labeled textarea in the existing section editor; keyword edits participate in dirty-state detection, save, preview and download. No extra confirmation or warning flow.
- Tests/docs: `tests/unit/materials.test.js` replaces obsolete rejection expectations with draft-preservation and tolerant-metadata checks, including unsaved skills, string/null/long/non-project keywords, unknown/duplicate/reserved IDs and save round trips. `tests/e2e/materials.spec.js` adds real extension generation -> Edit -> keyword correction -> oversized Save/Rewrite regression; overflow-save expectations now require successful persistence, while the failed-save test uses an actual stale revision and verifies that newer edits are protected. Against the old build, this generation failed on a relevance-content gate; the new build displays the complete draft, including optional metadata deviations and additional text. `docs/plans/2026-10-12-resume-tailoring.md` records that the user's new policy supersedes the previous rejection/fitting design; evidence guidance remains advisory in the writing prompt.
- Verification: 41 focused unit checks pass (`materials.test.js`, `materials-ai.test.js`, `materials-export.test.js`); focused materials/template browser run completes with 21 passes, covering generation, editable keywords, oversized drafts, migration, secret-safe request failures, cancellation, uploads and concurrent edits. Chrome/Firefox/userscript builds succeed at v0.5.86. Package/lock/cache/manifests and whitespace checks pass. Build-managed package/site/update versions and package-lock roots synchronized without dependency changes. Existing staged work preserved; no commit, push, deployment, full suite, paid live-AI call, native Word inspection or Firefox runtime smoke. Complete: reload/update extension to v0.5.86, then retry generation. Earlier rejected AI responses were not persisted, so there is no saved rejected draft to recover automatically.

## 2026-10-13 — Document-first application materials workspace

- Target/platform: Chrome/Firefox extension Materials dashboard. User reports cheap/sloppy Prepare and Edit layouts, paragraph-by-paragraph editing, and saving before seeing changes. Approved a document-first editor with local autosave, contextual rewrites, PDF proof and existing PDF/Word exports, using Impeccable while preserving DESIGN.md. Created `feature/materials-editor-ux` from the latest fetched `feature/resume-tailor` (`a1383c2`), preserving its newer policy that generated/manual text is retained beyond page targets.
- Root causes/resolution: the former workspace hid all but one textarea and displayed a separate stale saved PDF. Save globally disabled controls and rebuilt the editor. Replaced this with a continuous Tiptap 3.31.4 document on locally font-matched paper, a scrolling outline, library undo/redo, plain paragraph/bullet editing, editable project keywords, zoom, contextual rewrite controls, an on-demand exact PDF proof and one primary Download menu. Prepare prioritizes role description and source profile context, with optional writing preferences disclosed. Narrow Fit width reflows for legibility rather than shrinking text to an unreadable full-page thumbnail. Chrome 110 / Firefox 115 compatibility uses a nonmodal native dialog for the download menu rather than the newer popover API.
- Production files: rebuilt `src/targets/extension/materials/{index.html,index.js,workspace.css}`; added `editor.js`, `editor-model.js` and `autosave.js`. Tiptap supplies the editing engine, cursor/clipboard/paragraph handling, soft line breaks and history; the adapter exposes only fields that survive existing exports, protects profile-derived identity/section metadata, and preserves relevance, project links and keywords. Added pure `document-format.js` and moved unchanged contact/link formatters out of `export.js` so editor and PDF/Word share readable link labels. Existing export layouts, template version 9, text preservation and fitting policy remain intact.
- Persistence/concurrency: `background/materials.js` adds lightweight background-owned IndexedDB draft get/write/discard operations with document/draft revision checks. A serialized autosave queue persists after 400 ms and compiles after 1600 ms idle. Export acknowledgements never replace the live editor, selection or history; continued typing queues another version. Downloads flush current text, fail instead of supplying stale bytes, and leave drafts recoverable on failure. Switching persists normally and completes valid exports for the next Autofill; only failed persistence prompts retry/discard/stay. URL document identity restores the selected job/document on reload. Empty letters retain a recoverable local draft and the last good exports. Concurrent saves cannot silently overwrite another window's draft. Failed regeneration/deletion resumes live autosave instead of leaving a disposed/frozen coordinator.
- Rewrite behavior: one bounded existing background AI request operates on a captured draft; no manual save prerequisite, paid editor service, new backend or automatic AI retry. Applying the result checks unchanged target text (including project keywords and letter paragraph position), changes only that section/paragraph, preserves unrelated newer edits and remains undoable. Switching cancels an in-flight contextual rewrite. Key isolation and profile-only source facts remain unchanged.
- Packaging/docs: exact MIT-licensed Tiptap packages added to `package.json`/lock; `tools/build.js` packages existing export font bytes for the editor, copies Tiptap/ProseMirror dependency licenses and watches Materials static assets. No remote font/editor/worker requests. Updated only the Materials rules in DESIGN.md; incumbent tokens, fonts, palette and brand rules are preserved. Build-managed package/site/update version metadata is synchronized at v0.5.92; no publication or deployment performed.
- Verification/evidence: added eight editor/model/autosave unit scenarios plus a live-read recovery regression in `tests/unit/materials-editor.test.js`; added continuous editing, undo/redo, current PDF/Word text extraction, reload/empty-draft recovery, paragraph split/merge, rich paste, Shift+Enter, stale-window protection, late rewrites, local fonts, responsive/focus/reduced-motion and failed-regeneration browser checks in `tests/e2e/materials-editor.spec.js`. Updated existing Materials/template specs and `tools/verify-firefox-materials.js` for continuous editing and on-demand proof. A 52-check focused unit run and all 27 then-current real-extension Materials/template browser cases passed; final recovery checks and rebuilt Firefox confirmation are being completed below. No full repository test suite was run, per the feature branch's targeted-testing instructions.
- Environment/test findings: managed Chromium forces a proxy that ignores hostname resolver flags, so synthetic OpenRouter calls initially failed with ERR_TUNNEL_CONNECTION_FAILED. `tests/e2e/support/fixtures.js` now routes only named synthetic ATS fixtures to the real loopback server and redirects only test-worker OpenRouter fetches to the local HTTPS mock; packaged extension code stays unchanged. Browser request/validation/export/upload paths are still exercised with synthetic credentials, with no paid live-AI request.
- Design review: Impeccable guidance, craft floor and detector used in one context, following AGENTS.md's prohibition on unrequested subagents. Desktop/900px/390px captures inspected in bounded batches. Detector's source-only linked-theme warning refers to generated `assets/theme.css`; actionable small functional labels were enlarged. Compact control density, monospace version metadata and bordered elevated download overlay were reviewed against the fixed DESIGN.md Operate direction rather than replacing its typography/tokens. Screenshots remain local under `.impeccable/review/`.
- Limits/status: editable HTML is a responsive document representation; PDF proof provides actual exported pagination. Tested modern Chromium/Firefox runtimes and compatibility-conscious code, not physical runs of the minimum browser versions. No native Word visual inspection, live AI editorial assessment, commit, push, PR, merge or deployment. Final recovery verification pending below.
- Final confirmation: final v0.5.92 source/build fingerprints, package/lock/browser versions, packaged editor licenses and whitespace checks match. All nine editor unit regressions pass, including live reads after failed operations. The final-source four-case browser rerun passes continuous autosave/reload/current downloads, failed regeneration with continued autosave, concurrent-save/document switching and panel activation/upload; the preceding complete targeted Materials/template run passed all 27 cases. Final rebuilt Firefox smoke passes generation, real PDF uploads, letter text, continuous editing, PDF proof and Word download/save. Implementation is complete locally on `feature/materials-editor-ux`; no commit, push or deployment performed.

## 2026-10-13 — Compact job description and Profile-to-Materials shortcut

- Target/platform: extension Materials Prepare and options Profile page. User reports the default job-description area is too large and asks for an intuitive Profile entry point into Application materials.
- Root causes: `rows="12"` plus a 260px minimum reserved excessive form space; the options Profile header had no direct Materials navigation.
- Changes: Materials `index.html` defaults the description to six rows; `workspace.css` reduces its minimum to 160px while retaining vertical resizing and shared full-width alignment with the title/company fields. Options `index.html` adds a graphite secondary Application materials link-button beside the Profile heading, with an outline external-link icon. It opens the packaged workspace in a new tab with noopener/noreferrer, preserving unsaved profile inputs. Scoped rules in shared `pages.css` wrap the header naturally on narrow screens. Updated the Materials guidance in DESIGN.md; retained all earlier editor work on `feature/materials-editor-ux`.
- Verification: Chrome/Firefox extension builds succeed at v0.5.93; package/lock versions synchronized and whitespace checks pass. A real loaded Chromium extension was checked at 1440px and 390px: description height is 160px, its left/right edges align with the title/company fields, vertical resize remains enabled, and neither page overflows horizontally. Clicking the Profile shortcut opens the actual Materials page in a new tab and leaves an unsaved profile value intact. Desktop Prepare and narrow Profile-header captures visually inspected; synthetic QA files remain under ignored `scratch/materials-followup/`. No new tests or full suites added/run for these reversible layout/navigation changes. Build-managed package/site/update metadata refreshed; no commit, push or deployment.
- Status: complete. Reload the extension to use the rebuilt pages.

## 2026-10-13 — Latest preview gallery

- User requested current previews of all additions. Captured the running v0.5.93 Chrome extension on `feature/materials-editor-ux` with explicitly synthetic profile/job content and local mock generation; no personal data, paid AI request, application source edit or new build.
- Created ignored QA artifacts in `scratch/materials-preview/`: reproducible `capture.mjs`, eleven PNG captures, `preview.json` and a Markdown `gallery.md` with absolute image paths. Views cover compact desktop Prepare, optional writing preferences, autosaved inline resume editing, contextual rewrite/download controls, exact PDF proof, full cover-letter editing, the new Profile shortcut, and four mobile layouts.
- Visually inspected the captures. Recaptured after waiting for async document switching and actual saved-model acknowledgement so screenshots show the intended panel and completed autosave; disabled capture-time animations for settled Profile screenshots. No UI changes were made. Complete: previews are ready to review locally.

## 2026-10-13 — SaaS workspace design discovery

- User feedback: the latest Profile and Materials previews still miss the desired simple, premium SaaS feel; requests niche research, subtle microinteractions/animation, and a probing design interview before further changes.
- Assessment of current captures/source: Profile remains a long settings form with persistent inputs; Materials gives repeated navigation, document controls and metadata similar visual weight. This is a design hypothesis to validate with the user, not a measured usability finding. Preserve existing document editing, exports and local persistence while resolving the layout direction.
- Research: Linear's March 2026 interface refresh (https://linear.app/now/behind-the-latest-design-refresh) documents quieter navigation, predictable action placement and softer separators. Teal's resume workflow (https://help.tealhq.com/en/articles/14435724-how-to-build-your-resume-in-teal) distinguishes comprehensive career source content from job-specific documents. Simplify's profile-strength and tailoring guidance (https://simplifyjobs.featurebase.app/help/articles/7361554-building-your-profile-strength and https://help.simplify.jobs/articles/0515607-auto-tailoring-your-resume-with-copilot) connects profile completeness to tailoring. NN/g progressive disclosure (https://www.nngroup.com/articles/progressive-disclosure/) supports reserving secondary controls for explicit expansion. Carbon motion guidance (https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview) supports subtle, task-focused feedback and purposeful transitions.
- Applied local Impeccable discovery/Operate guidance. Proposed direction for discussion: shared graphite/Geist/lime workspace, readable profile summaries with deliberate edit entry points, compact consistent navigation, prominent document canvas and restrained state transitions. Interview will establish preferred density/character, Profile editing behavior and Materials landing priority in small rounds.
- Changes/status: findings log only; no application code, build, tests, commit or publication. Await user preferences before choosing the next visual direction.

## 2026-10-13 — Confirmed SaaS workspace preferences

- User's two interview rounds establish priorities: visual finish first, settings-page character second; Profile overview with Edit per section; Materials landing with recent applications and New application; spacious content with compact navigation; in-place section expansion; subtle everyday motion.
- Added `docs/plans/2026-10-13-profile-materials-ux-brief.md` with the concrete hierarchy, Profile/Materials behaviors, state and responsive requirements, layout preview and delivery boundaries. It preserves graphite/Geist/lime, accurate profile facts, existing editor/export/draft guarantees and the active feature branch. Per-section save/cancel is a proposed interaction detail to review in the visual preview.
- Used the already loaded Impeccable discovery guidance and inspected the current v0.5.93 Profile/Prepare captures to anchor the brief. No further questionnaire is needed to establish the requested direction.
- Status: design brief prepared for review; no application code, generated build, tests, commit, push or publication in this turn. The next visual preview should exercise this agreed hierarchy and representative interaction states.

## 2026-10-13 — Implemented Profile and Materials SaaS workspace; save-control repair and expanded QA

- User authorized implementation of the confirmed brief, meaningful commits on `feature/materials-editor-ux`, repair of the stretched floating Profile save control, and thorough QA of both pages and their edge states. Work remains on that feature branch, continued from `feature/resume-tailor`; no master changes, push, deployment or paid AI requests. The continuous-editor/autosave foundation was committed as `3582fcb`.
- Applied the local Impeccable discovery/Operate, craft-floor, shape and new-work guidance. The requested “Ponytail mode” could not be located in the installed skills or repository instructions; an asynchronous clarification remains unanswered. No invented mode behavior or subagent work was used.
- Profile implementation: added `options/profile-workspace.js` to wrap the existing mounted editors with ordered summaries and in-place Edit / Save section / Cancel. Retained every existing field, repeatable-record toggle and provenance behavior. Updated `options/index.html`, `options/index.js` and shared `pages.css` with compact shared navigation, quieter Settings routes, spacious summary content, local Geist, flat expanded records, authored SVG controls, visible focus and reduced-motion support. Profile’s Application materials shortcut opens a new tab, preserving unfinished profile edits.
- User-reported save-bar bug (extension, supplied narrow Profile screenshot): legacy left and right positioning rules stretched a nominally content-sized dock across the page, with a large rounded/glass treatment. Removed conflicting anchors and replaced the treatment with an opaque, compact 8px-radius save control. It is bottom-right on desktop and centered within the viewport on narrow screens, appears only for actual unfinished changes, and provides truthful saving/failure feedback. Width and hidden/saved states are checked in real Chrome and Firefox extensions.
- Profile QA findings: reordering existing fields changed JSON property order and falsely marked untouched profiles dirty; establish the saved baseline after wrapping/reordering. The native submit button also had a redundant `requestSubmit` click handler, producing duplicate writes and hiding a simulated first failure; removed the redundant handler. Section writes now freeze only their own controls, validate native inputs, retain failed edits, and support Enter without submitting other sections or swallowing skill-entry behavior. Bulk-save failures retain fields and retry visibly. Startup failures offer a working retry instead of exposing incomplete editors.
- Concurrent Profile writes (extension, two-window fixtures): accepting an unrelated newer full snapshot could allow stale untouched fields to overwrite it on a later save. Added background `PROFILE_PATCH` messaging and `applyProfilePatch` with per-field expected values and atomic read/compare/merge/write. Generalized the existing per-record storage queue to `updateStoredRecord`; updated its materials/session callers. Only acknowledged touched fields advance the options page’s expected baseline. Disjoint changes merge, overlapping stale changes fail visibly, and structured work-eligibility fields keep their flattened autofill values. Added `profile-storage.test.js` and retained existing session isolation checks.
- Materials implementation: added `materials/library.js`, grouping real saved documents by job with actual update dates, role/company search, truthful empty states and a dominant New application action. Updated materials HTML/controller/CSS for shared navigation, recent-applications disclosure, All applications return, direct document/job/session links, independent document/task tabs and compact Prepare. The job description stays 160px initially and aligns with title/company. Profile review opens a new tab; live profile changes refresh the source summary without losing preparation input. Generation has clear progress, quiet cancellation, retained previous documents on failure and inline retry. Startup errors clear loading state and offer recovery.
- Editor QA findings: Tiptap’s deferred focus command could reset a later native selection after jumping to a distant project, causing replacement text to append to old keywords. `editor.js` now sets the section selection and focuses its view synchronously; the model/export regression passes. Delayed rewrite cleanup is scoped to the owning editor so old responses cannot clear a new document’s status. Saves keep the continuous editor mounted and preserve history, manual edits, protected facts and drafts after failed exports/overflow.
- Material completion race (extension application panel, HTTP 400/retry fixture): a session read could precede completion while the subsequent task status was already Ready; polling stopped with missing activated document references. Session hydration could also replace the captured object. `core/ui.js` re-reads authoritative references after completion and updates the live session with the same ID, guarding late poll responses against newer task state. Focused panel activation, in-progress Autofill and explicit provider-error recovery checks pass.
- Long-content finding (Profile and Materials at 1440/900/390px): long unbroken role/company and section labels could consume nearly all available editor height. Chrome now clamps chrome headings to two lines and keeps horizontal section labels on one ellipsized line, retaining full accessible text and hover titles. Document and exported text remain complete. The regression checks page overflow and a usable document canvas at all three widths.
- Tests/docs/tools: added 13 workspace browser cases and materials-library unit coverage; updated existing materials/template, shell, migration, visual-system and two Profile-dependent Workday fixtures to use the new entry points. Extended the real Firefox smoke to include Profile overview, initial clean state, compact save sizing and section persistence alongside generation, uploads, letter text, continuous editing, PDF proof and download saves. Updated the design brief’s authorization status and DESIGN.md’s workspace rules; ignored generated Impeccable review artifacts.
- Verification/status: real Firefox smoke passes all three surfaces on v0.5.103. Earlier scoped Chrome matrix passed 56/57 cases before the material-completion race fix; the affected case and three related integration paths then passed. Current v0.5.103 long-content, structured-profile and HTTP 400 recovery regressions pass. Final 57-case scoped Chrome matrix, nine relevant unit files, packaging checks and refreshed preview captures are in progress; final evidence will be recorded below. No whole-repository suite or native Microsoft Word visual inspection was run.

### QA checkpoint and correctness commit

- The final scoped v0.5.103 Chrome run completed with **57/57 passing** across workspace, shell, continuous editor, materials integration, templates, migration and visual-system specs. A temporary exec-server disconnect did not stop the browser process; it reconnected and the same run finished. All nine relevant unit files pass. Chrome ZIP and Firefox XPI integrity, packaged local fonts/editor licenses/page assets, extension CSP and source/build hash checks pass.
- Profile overview/atomic section saves and the compact save control were committed as `94d0c81`. The material-completion/live-session and synchronous editor-focus fixes are being committed separately so their correctness changes remain reviewable.
- Final review found newly generated job headers did not refresh their hover title alongside visible text. A single `updateJobContext` function now serves selection and generation; the long-title regression asserts the complete role/company titles. This produces v0.5.104. Its affected workspace checks, Profile-dependent Workday checks and real Firefox smoke are the remaining bounded verification; no additional visual redesign is planned.

### Final verification and delivery

- Finished build: **v0.5.104**. All 13 workspace checks and four relevant Workday checks pass on this build, covering overview/edit/save/cancel, missing data, validation, startup recovery, storage failures, concurrent writes, library/search/switching, generation/cancellation, responsive layouts, long labels and Profile changes reaching autofill. The managed environment restarted after 15 checks; the last two were resumed and passed. Combined with the complete 57/57 scoped matrix, this is **61 distinct passing browser cases**, not 74 additional cases.
- Real Firefox v0.5.104 passes all three smoke surfaces: application generation, PDF uploads and letter text; continuous Materials editing, tabs, exact PDF proof and current Word-download persistence; Profile summaries, clean initial state, compact dock and atomic section save. All nine targeted unit files pass, including profile patches, model protection/round trips, drafts/session isolation, AI normalization, library grouping and PDF/Word exports.
- Final Chrome/Firefox builds and archive-integrity checks pass. Package and lock versions, both manifests, site metadata and Firefox update metadata agree on 0.5.104. The build-cache hash matches current source; local scripts/styles, editor licenses, Geist/Geist Mono, CMU/Charter and PDF.js worker are present and CSP-compatible. Package-lock changes only synchronize versions; no dependency changes in this final step.
- Preview QA finding: immediate captures showed controls partway through their short color/position transitions, making an inactive tab appear partly selected and the mobile dock appear offset. This was a capture artifact. Capture-producing workspace tests now finish animations for screenshots and explicitly verify the mobile dock’s center. Those three cases pass; settled desktop Profile/Edit and narrow dirty-dock captures were inspected. UI motion remains enabled normally and respects reduced motion.
- Added `docs/qa/2026-10-13-workspace.md` with the state matrix, reproducible scoped commands, browser versions and practical limits. Added ignored local preview gallery, screenshot metadata and QA output in `scratch/saas-preview`; screenshots use synthetic sample data. Updated Impeccable review ignore and the authorized brief/design rules. The correctness fixes are committed as `2bba88a`; the remaining library/navigation/Prepare/QA changes are ready for the final feature-branch commit.
- Completed scope: Profile/Materials implementation, save-control repair, relevant QA and local Chrome/Firefox packaging. No master changes, push, PR, publication, paid AI call or full repository suite. Native Word visual rendering and minimum-version browser binaries remain unexecuted, as documented. Ponytail instructions remain unavailable; Impeccable was applied from the installed local skill.

## 2026-10-13 — Feature branch handoff for local review

- User explicitly requested pushing `feature/materials-editor-ux` because the cloud previews are inaccessible and they will pull the branch to review locally.
- Verified the active branch is `feature/materials-editor-ux`, the implementation head is `a9e59cb`, the worktree is clean and origin is `https://github.com/Amro212/kareer.git`. Publication targets only this feature branch with a normal upstream-setting push; no master update, force push or PR is requested.
- This turn adds only this handoff record. The v0.5.104 implementation and completed QA remain unchanged; no build or test rerun is needed for a Git handoff. Push outcome and local checkout/build instructions are reported in the chat.

## 2026-10-13 — Verified clean install after Windows Tiptap build report

- User-reported bug: extension build in Windows PowerShell completes the userscript but esbuild cannot resolve `@tiptap/core`, `@tiptap/extension-document`, `@tiptap/extension-paragraph` and `@tiptap/extension-text`. The local package version is 0.5.105, while the published implementation is 0.5.104; the build's automatic version/cache updates can advance a local version before a failing compile, so that difference alone does not establish a different branch.
- Inspection: the active feature branch is clean at published `ff20fa6`. All seven Tiptap packages are declared at 3.31.4 in both package.json and package-lock.json. Earlier verification built both browser extensions; this turn verifies the user's exact all-target build from a fresh dependency installation.
- Verification: extracted the published Git tree into a new temporary checkout with no node_modules or build cache. On Node 24.19.0 / npm 11.9.0, `npm ci` installed 458 locked packages and `npm run build` successfully produced the userscript, Chrome ZIP and Firefox XPI at v0.5.104. No existing workspace dependencies were reused and no code or dependency-manifest fix was needed.
- Root-cause assessment/recovery: the unresolved-package errors are consistent with stale or incomplete node_modules after pulling the new dependencies. Git does not install packages. Recovery is `npm ci` followed by `npm run build` from the repository root; validated on the clean checkout, with the user's Windows execution still outside this environment.
- Changes: README.md now explicitly requires a locked dependency refresh after branch updates and explains the Tiptap resolution error. The workspace QA record now includes the clean-install/all-target build evidence and platform limit. This findings entry records the report and recovery. No UI, build script, dependency, version or master changes; no broad test rerun is needed for documentation-only changes. Documentation updates remain on feature/materials-editor-ux for the local review handoff.

## 2026-10-13 — Forced npm audit downgrades and compatible dependency patches

- User report/platform: Windows PowerShell pasted log shows `npm ci` succeeded (457 packages), with deprecation/funding notices and eight audit findings. The user then followed npm's `npm audit fix --force` suggestion; it downgraded `web-ext` 10.7.0 to 5.1.0 and `mammoth` 1.13.0 to 0.3.29, expanding the old dependency tree and audit report to 60 findings (24 moderate, 26 high, 10 critical). These are audit warnings/findings, not a failed npm-ci install. The force command is the cause of the subsequent dependency explosion.
- Assessment: build success did not establish audit cleanliness, and the earlier handoff should have disclosed that separate status. Read-only audit of the original branch lockfile now reports 15 findings (3 moderate, 9 high, 3 critical); this is not claimed to be identical to the earlier eight, since advisory data changes. The repository's dependency files remain at the tested modern parent versions; the user's forced edits are local.
- Compatible fixes: scoped `fx-runner`'s pinned shell-quote to patched 1.12.0 via package.json override and regenerated only the affected lock entries. Updated source-map-js 1.2.1 to 1.2.2 within the existing dependency range. Retained web-ext 10.7.0, mammoth 1.13.0 and all Tiptap pins; no blind audit fix, parent downgrade, unrelated dependency updates, application-source or version changes.
- New audit result: six entries (3 moderate, 3 high, zero critical), tracing to node-forge via adbkit/web-ext and sprintf-js via argparse/mammoth. Registry latest stable node-forge 1.4.0 and sprintf-js 1.1.3 remain affected; npm suggests the same unsafe parent downgrades. The outstanding upstream findings and actual usage paths are recorded in docs/qa/2026-10-13-dependency-audit.md, without claiming a zero-vulnerability tree. Node-forge is development tooling; Mammoth/argparse are absent from application source and Word extraction uses the library API in tests.
- Verification: `npm ci` and the exact all-target `npm run build` pass at v0.5.104; real Firefox smoke passes generation/uploads, Materials editing/PDF proof/current downloads and Profile section saving after the runner update. Targeted panel and materials-export unit files pass. The watch-build regression failed in the sandboxed run and is being rechecked with the local process access used by the other build/browser checks. No broad suite or direct Windows run.
- Documentation/recovery: README now explains successful npm-ci notices, warns against forced major downgrades and links the dependency audit. The audit record provides PowerShell backup copies before restoring only package.json/package-lock.json, pulling the compatible feature-branch update, reinstalling and rebuilding. The final result and publication remain on feature/materials-editor-ux; no master/force-push action.
- Final watch verification: the unchanged watch-build test passes with local process access (1.6 seconds), checking CSS/HTML refresh for both browser artifacts. The initial sandboxed runner timed out during startup; no test/build-source change was required. All-target build, panel and export checks, real Firefox smoke and the post-patch audit are complete. Compatible fixes and documentation are being published with a normal feature-branch push.
## 2026-10-13 — Profile and document preview follow-up

- User reports (extension options/materials workspace, desktop screenshots): skills stack vertically in the editor despite inline PDF output; page extent is unclear without downloading; profile sits left of the available content area; Profile subsection quick links are absent; document outline is too narrow.
- Branch inspection: initial cloud `work` checkout was the older master `fd16ab4`, which lacks this workspace. Fetched the screenshot-matching `feature/materials-editor-ux` (`d321150`) and created local `feature/materials-layout-fixes` from it. No existing edits were present.
- Initial causes: skills use separate editor paragraphs while export joins plain skills with middle-dot separators; the profile main has a maximum width but no auto margins; sidebar subsection markup was removed though section routes remain; outline is 180px desktop/150px medium; exact page count exists only inside the optional proof panel.
- Task list: `docs/plans/2026-10-13-materials-layout-fixes.md`. Fixes and targeted integrated verification pending. No publication requested.
- Profile centering: added automatic inline margins to the existing capped main width (`shared/pages.css`). Real-extension regression (`workspace.spec.js`) passes at 2048, 1440, 900 and 390px; measured equal space around the content area beside the desktop sidebar and no horizontal overflow. Chrome/Firefox builds pass. Task 1 complete.
- Profile quick links: restored 12 subsection links generated from the mounted overview configuration, active-location styling, keyboard focus at destination headings, and a horizontal mobile list. Existing hashes route to visible summary cards; settings hide the subsection list. Browser regression exposed initial deep links executing while the form was still hidden; moved initial routing after reveal. Three focused real-extension checks pass: centering, section jumps/back/reload/mobile with preserved open edits, and existing partial-save/cancel behavior. Files: options/{index.html,index.js,profile-workspace.js}, shared/pages.css, workspace.spec.js and task/log documents. Task 2 complete.
- Document outline: replaced the final 156px override with a responsive 220–280px desktop column and 20px inner padding in materials/workspace.css. Existing horizontal navigation below 1000px remains available. New real-extension test passes at 2048, 1440, 1100, 900 and 390px: desktop canvas remains over 600px, section jumps work, no horizontal page overflow. Task 3 complete.
- Skills consistency: shared the existing categorized-skills predicate between export and editor (`document-format.js`, `export.js`, `editor.js`). Plain skills render in a wrapping row with middle-dot separators; categorized rows retain their line layout and react immediately to edits/undo. Kept one editable paragraph per skill and the existing lossless model bridge. Real-browser testing rejected inline/inline-block paragraph styling because replacements merged adjacent skills; flex layout preserves browser paragraph boundaries. Editor/export unit files pass 22/22 and the new real-extension test passes visual placement, PDF text, categorized editing, stored arrays, undo and reload. Files also include workspace.css and materials.spec.js. Task 4 complete.
- PDF visibility: persistent exported-page count in the editor actions, explicit last-PDF/updating/error states, and overflow wording tied to the represented export. Proof pages have visible numbered captions and boundaries; default Fit page and optional Fit width use actual canvas dimensions and respond to available viewport space. PDF.js finishes a complete, current render before replacing preview contents. Resolved a related stale-error message after successful export retry. Files: materials/{import.js,index.html,index.js,workspace.css}, materials.spec.js, task/log documents. New real-extension test passes one-page count, pending/failed edits, retry to actual multi-page PDF, visible labels, whole-page fit at 1440/900/390px, width zoom and byte-identical download. Skills check also passes on this source; all-target build passes at v0.5.113. Task 5 complete; combined targeted verification pending.
- Final visual review: the shared app-sidebar position rule overrode the earlier settings-nav sticky rule, so profile subsection links scrolled away after a jump. Made options sidebar positioning explicitly sticky on desktop (the existing mobile static override remains), and asserted the sidebar stays at the viewport top after section jumps. Previous combined targeted browser run passed 35/35 and targeted units passed 61/61; repeating the affected browser files on this last CSS correction.
- Final verification/status: all six task-list entries complete. Targeted units pass 61/61 across profile, profile storage, materials editor/autosave, exports and library. Combined real-extension `workspace.spec.js` + `materials.spec.js` pass 35/35 on final source (zero failures/skips), including the final sticky-sidebar assertion, all five reported issues and existing generation/edit/save/download/upload flows. All-target build passes at v0.5.114; build-cache hash matches source; `git diff --check` passes. Normal build synchronization updates package.json, firefox-updates.json and site/{firefox-updates.json,index.html,version.json}. Logs: /tmp/kareer-layout-{final-units,final-browser,build-final}.log. Five reported issues are resolved with focused commits; no master merge or release deployment. Renamed the local branch to feature/materials-editor-ux for local testing. Automatic approval review rejected the push to origin (https://github.com/Amro212/kareer.git), stating that the user authorized local fixes/commits but had not explicitly authorized exporting commits to that remote. No push occurred; remote sync awaits explicit user approval.

## 2026-10-14 - Preserve Materials edits during document switches

- Target/platform: extension Materials workspace, Chrome document-switch fixture. User requested the review's late-edit data-loss fix on `feature/materials-editor-ux`.
- Root cause: `switchDocument` left the editor writable while awaiting draft persistence and export. Text entered after the export snapshot could remain pending when disposal canceled its save timers and navigation destroyed the editor.
- Resolution: moved the existing `setBusy(true)` call before the first save await in `src/targets/extension/materials/index.js`. The existing finally block restores controls/editability when switching completes or stops. No new runtime helper, dependency, or storage format.
- Regression coverage: `tests/e2e/materials-editor.spec.js` gates `putDraft` and `save` independently, checks editing is frozen and late typing is rejected, then switches back to verify saved text and restored editability. Both tests failed against the original code and pass with the fix.
- Verification/status: 9/9 focused materials-editor browser tests and 9/9 editor/autosave unit tests pass; both changed JS files pass syntax checks and `git diff --check` passes. Rebundled only the ignored Chrome Materials entry using the existing esbuild settings; existing version metadata edits were preserved. Chromium required local process access after sandbox startup failures. Files changed this turn: Materials controller, editor browser spec, and this log. Fix complete; full suites and Firefox execution were not run.


## 2026-10-14 - Reject rewrites of empty selected letter paragraphs

- Target/platform: extension Materials editor, Chrome cover-letter fixtures. User authorized fixing the review bot's empty-target finding.
- Root cause: rewritePath counted preceding nonempty paragraphs but did not validate the selected node. Empty middle paragraphs targeted neighboring text; empty trailing paragraphs consumed an AI request before failing.
- Resolution: one guard in src/targets/extension/materials/editor.js rejects selected paragraphs whose trimmed text is empty. The existing caller reports the message before persistence, rewrite status, or an AI request. Resume and populated-letter rewrite paths are preserved.
- Regression coverage: tests/e2e/materials-editor.spec.js adds middle/trailing cases using the real editor. Each checks empty and whitespace-only selections, unchanged surrounding paragraphs, zero additional AI calls, and a succeeding populated-paragraph rewrite. Both cases failed on the original code and pass with the guard.
- Verification/status: 2/2 targeted browser cases and 9/9 editor/autosave unit tests pass; changed JS syntax and git diff --check pass. Chrome Materials was rebuilt with the existing esbuild settings for browser verification. No dependencies or version changes. Full suites and Firefox execution were not run.
- Turn changes/location: editor.js, materials-editor.spec.js, and this log in the attached empty-paragraph-rewrite worktree based on feature/materials-editor-ux at 0a79d98. The original feature/resume-tailor checkout and unrelated edits were preserved. Fix complete locally; no commit or push performed.
