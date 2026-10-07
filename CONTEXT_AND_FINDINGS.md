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
