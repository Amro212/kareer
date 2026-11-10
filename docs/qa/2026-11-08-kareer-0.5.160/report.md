# Kareer v0.5.160 — production application QA report

**Test date:** November 8, 2026, America/Toronto. Resumed evidence session: 21:51:52–22:29:46 EST (02:51:52–03:29:46 UTC November 9), plus the earlier DoorDash fill.

**Disposition:** investigation complete for the five selected postings; product fixes deliberately deferred. Nine findings are recorded below, including one first-run phone-loss observation whose precise cause remains unconfirmed. Seven have executable failing regression assertions; two have detailed native regression specifications pending faithful automated replay. This is not a clean release sign-off.

**No applications were submitted.** Saved profile/resume data were entered/uploaded to the five authorized employers, and the configured managed AI was used. Auto Submit remained off. The observed balance changed from **297 to 291 credits: six credits** across the complete investigation, including the earlier DoorDash fill.

**Correction:** the DoorDash education dates **September 2021 → April 2026 are correct**. The earlier conflicting-graduation-dates finding, QA-160-01, is withdrawn. A separate graduation-range question was not adequately verified; it is not included as a confirmed defect and must not drive a fix.

## 1. Environment, method and boundaries

| Item | Observed configuration |
|---|---|
| Artifact | Installed Kareer extension reporting v0.5.160 in its panel |
| Browser | User's existing Zen Browser on Windows; existing profile/session |
| Execution | Native UI interactions through Computer Use; no Playwright controller attached to live Zen |
| AI | Configured Kareer AI, existing balance; no credential changes or connection reconfiguration |
| Settings | AI enabled; overwrite existing off; Auto Continue on; Auto Submit off; settings unchanged |
| Applicant data | Existing saved profile, work/education history, saved answers and resume, explicitly authorized for these employers |
| Resume | Existing `My_Resume.pdf`; Workday displayed 43.53 KB after successful upload |
| Evidence | 87 timestamped action/checkpoint records, four selected screenshots, five sanitized static DOM captures |
| Local diagnosis | Read existing classifier, scanner, navigation, Workday resolver, verifier and session observer; no production source edits |
| Verification | One focused Node test file; no full suite, build, deployment, commit or push |

The installed version was checked in the UI. Its full binary was not independently hashed against repository HEAD, and the exact Zen build number was not collected. Source explanations are checked against the current v0.5.160 checkout; where a live result does not establish the precise mechanism, that uncertainty is stated.

Each useful checkpoint records the action, extension status, detected/answered counts, visible failures, credits and relevant current form state. Immediate native snapshots sometimes lagged a render. Settled observations were used for findings. A stale Computer Use window binding during SmartRecruiters manual recovery was corrected by reacquiring the same returned window; failed focus/value attempts were not counted as new product bugs.

Evidence is local. The HTML captures remove scripts and handlers, clear form values, redact contact/address/name data and neutralize resource loads. They preserve relevant labels, IDs, attributes and form structure. Screenshots retain some professional context and public profile URLs; review/redact those before external sharing. Ignored raw Save Page files remain under `scratch/` for this local investigation and are not report deliverables.

## 2. Posting and outcome matrix

| ATS / employer | Posting | Actions and outcome | Last observed state | Credits |
|---|---|---|---|---:|
| Greenhouse / DoorDash Canada | [Software Engineer, Entry-Level](https://job-boards.greenhouse.io/doordashcanada/jobs/8176003) | Filled contact, location, education, choice groups and resume. Rescan and rerun preserved values/one education row; repeated Apply/Submit ambiguity. | PAUSED; 26 detected, 25 answered; 13 verified / 12 inferred / 0 failed / 1 untouched | 297 → 296 |
| Lever / ShyftLabs | [Software Developer](https://jobs.lever.co/shyftlabs/be8c4d4c-98f0-420c-a9aa-cfac05f4e8b7/apply) | Resume parsing, contact/location, links, authorization and sponsorship filled. Prefilled joining sentinel preserved. Clearing required joining answer exposed stale review state. | READY FOR REVIEW despite now-empty required joining answer; 12 detected; 6 verified / 0 inferred / 0 failed / 6 untouched in last fill summary | 296 → 296 |
| Ashby / Strada | [Software Engineer, Toronto](https://jobs.ashbyhq.com/stradahq/1d9478b8-a034-4ca2-80f3-6d8d5040c0e2/application) | SPA Application tab detected. Two resume-related uploads populated; required Transcript correctly left empty. Retry stopped in same bounded missing-document pause. | PAUSED; 8 detected, 3 answered; 3 verified / 2 inferred / 1 failed / 2 untouched | 296 → 295 |
| Workday / Clio | [Software Developer, Toronto](https://clio.wd3.myworkdayjobs.com/en-US/ClioCareerSite/job/Toronto/Software-Developer--Toronto-_REQ-4630/apply/applyManually) | Guest manual application; successful Pause/Resume; source-picker failure and manual recovery; upload-only block and website workaround; questions completed; actual Review reached; Back/Rescan/rerun tested. | Left on revisited My Experience, STEP REVIEW; one PDF + three URLs, all four current controls verified; historical 3 steps / 13 answers | 295 → 293 |
| SmartRecruiters / UHN | [Software Developer](https://jobs.smartrecruiters.com/UniversityHealthNetwork/744000159404572) | Easy Apply filled through generic adapter; parser created four work rows and one education card plus incomplete editor. Duplicate descriptors, field-identity exceptions, false upload failures and first-run phone clearing. Manual phone correction, retry, Rescan. | READY; 22 detected, 7 answered; 5 verified / 3 inferred / 2 failed / 12 untouched; incomplete education; no next step after recovery | 293 → 291 |

Counts are the panel's exact categories, not an independent count of correct answers. Parser-populated/preserved controls can remain UNTOUCHED even though their page values are present. Resume verification may be counted separately from “fields answered.” Historical steps/answers are cumulative, so they must not be interpreted as current-page completion percentages. No claim is made that every inferred answer was factually audited.

## 3. Findings ranked for follow-up

P1 means a normal tested flow is blocked or loses a required value. P2 means misleading state/verification or recovery/retry behavior. P3 means diagnostic noise. Priority reflects these observed flows, not proof of a particular production-wide frequency.

| ID | Priority | Finding | Reproduction confidence |
|---|---|---|---|
| QA-160-02 | P1 | Entry Apply is classified as final submit: Greenhouse ambiguity and Workday false review | Live repeat + captured Greenhouse assertion |
| QA-160-05 | P1 | Workday source picker repeatedly searches unsupported LinkedIn and exhausts repairs | Live bounded repeat; deterministic resolver miss reproduced |
| QA-160-06 | P1 | Workday upload-only step is not recognized as a fillable application | Live causal workaround; reduced classifier assertion |
| QA-160-08 | P1 | SmartRecruiters field descriptors/identity fail across dynamic controls; education remains incomplete | Repeated live extension exceptions; faithful shadow replay pending |
| QA-160-10 | P1 | SmartRecruiters first run clears parsed phone and country code | One observed loss; corrected value survived retry; cause unconfirmed |
| QA-160-03 | P2 | Manual form corrections do not refresh review cards/readiness | Native keyboard reproduction + engine assertion |
| QA-160-07 | P2 | Workday Back retains final-review Submit Application action on an earlier step | Live screenshot + engine assertion |
| QA-160-09 | P2 | Accepted SmartRecruiters PDF is marked failed and reprocessed on retry | Live repeat + accepted-metadata verifier assertion |
| QA-160-04 | P3 | Extension floods Firefox console with empty-ID lookup warnings | Four inspected ATS consoles + isolated source assertion |

### QA-160-02 — Apply entry control competes with real submission

**Before/action/after.** DoorDash finished filling 25/26 fields, then paused with `Multiple Submit controls found: Apply, Submit application. Submit manually.` Rescan changed PAUSED to READY without losing values. Rerunning with overwrite off returned to the same warning; one education row and balance 296 were preserved. Evidence: action records 1–10.

The captured markup establishes two distinct controls: header/jump Apply is `type=button`, while the application form's Submit application is `type=submit`. `inspectSubmit()` counts both. The shared `isSubmitControl()` regex accepts a bare Apply label before proving that it belongs to final application submission. The focused assertion expects one candidate and currently gets two.

**Related Workday manifestation.** Clio's job-description page showed Workday Application / 0 DETECTED / READY. Clicking Autofill left the job description in place and changed the panel to READY FOR REVIEW / Submit Application, with zero answers. Manually clicking the site's Apply and then Apply Manually opened the real application. Evidence: 32–38. The exact Workday entry DOM was not successfully captured: HTML-only Save Page produced a shell, which was discarded rather than presented as a valid fixture.

**Impact and recovery.** The user sees a false submission ambiguity or final-review action before entering the application. Manual site entry works. Auto Submit was off; no claim is made about what enabling it would do. Fix direction, deferred: distinguish entry/jump actions from actual final submission using form/adapter context, then test both manifestations.

### QA-160-03 — review cards/readiness stay stale after native edits

**Lever preservation control.** Before filling, the required “How soon can you join after receiving an offer?” answer was set to the explicit QA sentinel `QA preservation test: available four weeks after an offer.` Autofill preserved it with overwrite off and reached READY FOR REVIEW. Resume-parsed fields and other profile values remained present. No AI credit was used.

**Trigger.** Clear the required joining answer, blur, and wait. Then repeat with native keyboard input: type a new QA answer, select all, Backspace. The page field was empty, while Kareer still showed READY FOR REVIEW / Submit Application and the card still displayed the original sentinel. Evidence: 12–22. This confirms stale UI/session state, not a submission-validation bypass: Submit was never pressed.

**Workday corroboration.** After manually selecting a valid Other leaf in the source hierarchy and pressing Resume, validation accepted it and the panel offered Continue to Next Step. The source review card nevertheless remained FAILED/Empty. Evidence: 50–53.

**Diagnosis.** Review results are cached; the application observer does not automatically invalidate an inactive final-review session for plain input-value events. The isolated engine test enters review, clears the captured required input and dispatches input/change; status remains review. It does not test the full panel rendering or submit-time revalidation.

**Recovery and impact.** Rescan/reverification may be needed before trusting the panel after manual edits. The temporary Lever answer was removed; that draft is deliberately left with a required blank. Fix direction, deferred: reconcile current values and cached provenance/status after native edits rather than presenting stale verified/failed data.

### QA-160-04 — repeated empty-ID warnings hide useful diagnostics

**Trigger and evidence.** Filling/scanning pages generated repeated `Empty string passed to getElementById().` warnings in the extension's content bundle. Observed on Greenhouse, Lever, Ashby and SmartRecruiters. Examples include compiled `index.js:82:18756`, `:338:25033` and `:338:8142`; SmartRecruiters repeat badges included 20 and 56. These are snapshots of grouped messages, not a total warning count.

**Confirmed source mechanism.** `controlLabel()` and `workflowLabel()` split absent `aria-labelledby` into an array containing an empty string and call getElementById with it. A focused spy records two empty lookups for two ordinary controls. This does not prove these are the only warning paths in the bundle.

**Impact.** Diagnostic noise grows during normal scans and makes real exceptions harder to distinguish. No crash or measurable performance degradation was established from these warnings alone. Fix direction, deferred: remove empty references before DOM lookups in the relevant paths.

### QA-160-05 — Workday source dropdown cannot resolve a supported leaf

**Preconditions.** My Information had 14 detected fields. Profile contact/address fields, country and phone type were available. Required “How Did You Hear About Us?” used hierarchical categories.

**Trigger/state progression.** Run → user Pause while “Generating answers for 9 fields” → stable PAUSED / `Paused by user.` for nine seconds, zero answers and balance 295 → Resume. Ten fields filled; source remained uncommitted while LinkedIn search text was present. Repair 1/2 then 2/2 ended in `Repair limit reached (2/2). Review errors and resume manually.` The validation message was `Required value missing or rejected.` Panel: 10 VERIFIED, 0 INFERRED, 1 FAILED, 3 UNTOUCHED, ten answers; balance 294. Evidence: 39–48. No infinite loop or extra repair charge was observed.

**Catalog inspection.** Root categories included Career Websites, Clio Sponsored Hiring Event, Employee Referral, Job Sites, Legal Association, Networking Events and University/Campus Recruitment. Inspected Job Sites leaves were Glassdoor, Great Place to Work, Grow Remote, Indeed, Other, RepVue and University Job Boards. Career Websites exposed Corporate Website. LinkedIn was not present in those inspected branches; this is not a claim that every branch was exhaustively searched.

**Recovery.** Manually choose Job Sites → Other, then Resume. The value is accepted and the workflow reaches step review; Continue enters My Experience. No additional credit was consumed. Card staleness is covered by QA-160-03.

**Source diagnosis.** `workdayValue()` hardcodes source to LinkedIn. When options do not match, `workdayAnswer()` returns a deterministic answer with empty value and LinkedIn searchQuery. The targeted assertion demonstrates this exact miss. The full decision chain by which it suppresses contextual fallback needs a fix-time test; the live repeated search/repair and dead end are established.

### QA-160-06 — Workday upload-only My Experience is classified as a listing

**Before.** Step 2 contained a required Resume/CV upload and optional Websites Add, with no visible URL input. Kareer detected one upload yet paused with `Job listing detected.` Pressing Resume again did not attach the saved document or advance. Balance stayed 294. Evidence: 54–56.

**Causal diagnostic.** Add one optional website row on that same step, creating a visible text input; press Resume. Kareer starts filling, uploads the saved PDF and completes three website rows from the profile. Final current-page verification: four verified, zero failed, one 43.53 KB PDF, three distinct URLs. No extra AI credit. Evidence: 57–60.

**Diagnosis and capture limit.** The scanner handles hidden native file inputs through their visible upload UI. The classifier's field predicate instead requires the input itself to be visible. Static Save Page omitted runtime CSS, so the regression restores the observed hidden file input with display:none. It reproduces failure to classify application, returning unrelated in the sanitized DOM; the live page returned listing because it retained listing text/metadata. This is a reduced reproduction, not a byte-identical replay of Workday runtime.

**Retry/idempotency.** After reaching actual final Review, Back to My Experience preserved the one PDF and three URLs. Rescan and rerun produced four verified controls without duplicate attachments or website rows; balance remained 293. Evidence: 63–73.

### QA-160-07 — final-review status survives manual Back

**Trigger.** From Clio's actual Review, minimize Kareer to expose site footer controls, use site Back to Application Questions, then Back again to My Experience, and reopen the panel.

**Actual.** The site was on My Experience with upload plus three URL controls; Kareer detected four fields but still showed READY FOR REVIEW / Submit Application and three historical steps completed. Screenshot: [Workday stale review](evidence/workday-back-navigation-stale-review.png). Evidence: 64–69.

**Recovery.** Rescan changes the primary action to Autofill Workday and status READY. Rerun returns to STEP REVIEW with four verified current controls. No value loss, duplication or extra credit. Evidence: 70–73. Historical counters remain historical; this is not itself proof of an incorrect step-count implementation.

**Diagnosis.** `tick()` returns when the session is inactive, and the native-step observer specifically handles stepReview advancement. An inactive final-review session is not invalidated when manual navigation returns to a fillable earlier step. The isolated engine test replaces review DOM with captured earlier-step DOM and observes status still review. It does not click Submit or establish unintended submission.

### QA-160-08 — SmartRecruiters dynamic field identity errors and incomplete education

**Baseline.** UHN's I'm interested link opened Easy Apply. The header rendered before the form; the form was present by the 22:22:54 checkpoint, about 52 seconds after entry. This includes observation/tool latency and is not an instrumented site-load benchmark. Kareer used generic fallback, showed Company unknown (uncertain), 12 DETECTED / READY / balance 293. Its review list already contained duplicate City and Phone labels despite one logical city/phone pair on the page.

**Run outcome.** Resume parsing populated four work-history cards and one education card with concatenated institution text and a certificate title. An additional education editor remained open: required Institution blank, Degree blank, degree/discipline text in Major. The engine did not reconcile this into a completed required education entry. Detected count grew to 22. First settled panel: READY / Ready to start, six answers, 5 VERIFIED / 2 INFERRED / 2 FAILED / 13 UNTOUCHED. Evidence: 76–79.

**Errors and repeat.** After manual phone correction, rerun repeated failures. Console showed Kareer errors for Degree, Description, Institution and School location:

```text
[Kareer:ERROR] Error filling field "Institution":
The question changed or disappeared. Scan the page again.
```

The recorded compiled stack includes `content/index.js:82:53940`, `:380:1442` and `:1797:8505`. The console toolbar showed seven errors at the captured checkpoint. The same exception appeared repeatedly for Institution and School location. Panel after retry: READY / Ready to start, seven answers, 5 VERIFIED / 3 INFERRED / 2 FAILED / 12 UNTOUCHED, balance 291. The two visible failed cards were uploads; the exception-bearing education controls did not produce a useful completed/repaired education state. Evidence: 85–87 and [console screenshot](evidence/smartrecruiters-console-field-errors.png).

**Attribution.** The named exceptions are extension errors. Duplicate logical controls and scanner refresh identity are a likely mechanism: refreshField rejects changed ID/label/type/description. The exact shadow-root descriptor collision is not yet proven. The ATS parser may have produced the malformed education card/editor; no extension-disabled parsing baseline was run. The confirmed extension failure is inability to fill/reconcile the observed dynamic fields and repeated identity exceptions, not proof that Kareer initially invented the malformed card.

**Capture/replay limit.** Saved HTML preserves custom elements and attributes but omits their runtime shadow roots. The captured DOM, screenshots and native steps are retained. An executable automated shadow replay is pending; no fabricated hierarchy is presented as a reproduction. Fix direction, deferred: establish stable ownership/identity per logical control, then reconcile parser-created education before answering and ensure errors remain visible against current descriptors.

### QA-160-09 — accepted SmartRecruiters PDF remains FAILED/Empty

**Observed mismatch.** The ATS listed My_Resume.pdf, while both Kareer upload cards displayed FAILED / Empty. Native FileList had reset; captured `spl-dropzone[files]` metadata still described the accepted resume. Screenshot: [attached PDF versus failed cards](evidence/smartrecruiters-upload-present-marked-failed.png). First and second runs retained one visible PDF, so duplicate visible attachments were not observed.

**Retry effect.** Rerunning with overwrite off reprocessed the resume. Contact fields temporarily reverted to parser results, including last name and a blank confirm-email field, before subsequent filling. Four work cards and one education card remained rather than doubling. Each user-initiated run used one AI credit for remaining questions; repeated upload work itself was not separately billed in observed balances.

**Diagnosis.** Generic upload verification reads FileList; it has no SmartRecruiters accepted-upload adapter state. The focused test keeps sanitized accepted-wrapper metadata from the capture and verifies after FileList clears; current verifier returns false. This isolates the metadata blind spot, not the complete live shadow-input interaction.

**Impact/recovery.** False failure reports encourage unnecessary retries and parser churn. Rescan alone did not correct the two FAILED cards. The attached PDF must be checked on the ATS itself until fixed. No resume was used as another document type.

### QA-160-10 — first SmartRecruiters fill loses parsed phone/country

**Before/after.** During the first run, the parser had populated Canada +1 and the saved phone number. By the settled first-run checkpoint, both country code and national phone were empty and the page showed a required-phone error. Site Next was then clicked; it stayed on the form, scrolled to phone and displayed `Please provide a valid phone number`. Evidence: 78–81. No final submit was involved.

**Recovery and repeatability.** Manually select Canada +1 and restore the saved national number. After correcting a stale Computer Use binding, the value visibly persisted and the validation error cleared. A second Kareer run preserved that correction. Evidence: 82–86. The earlier failed recovery observations were tooling/focus uncertainty, corrected in record 84; they are not additional product errors.

**Confidence.** One first-run loss is established; it did not recur after manual correction. Custom country-code harvesting, duplicate parent/child handling or parser timing are candidates. The exact function that cleared it has not been proven. Priority is high because a required previously populated value was lost, but frequency and cause remain open. A native regression specification is retained rather than an invented deterministic automated test.

## 4. Successful controls and edge-case coverage

| Scenario | Result and evidence |
|---|---|
| Correct education dates | DoorDash September 2021 / April 2026 preserved; user-confirmed correct. QA-160-01 withdrawn. |
| Overwrite-off preservation | Lever sentinel survived first fill; parsed/current contact/company/GitHub values remained present. Other links and choices filled. |
| Existing rows on repeat | DoorDash rerun kept one education row. Workday Back/rerun kept one PDF and three URLs. SmartRecruiters retry kept four work cards and one education card, though parsing reran. |
| SPA detection | Ashby Overview → Application opened one Kareer panel and detected eight fields without reload. |
| Missing distinct required document | Ashby Transcript remained empty/failed while both resume widgets held the resume. Missing transcript pause was explicit and bounded. |
| Resume with missing document | Ashby returned to same pause, retained values and stayed at 295 credits. No silent substitution of resume as transcript. |
| Pause while genuinely active | Workday Pause during answer generation → Paused by user; stable nine-second observation, zero filled answers; Resume worked. Lever/Ashby pause attempts were too late and are not claimed as passes. |
| Bounded repairs | Workday required source stopped after 2/2 repairs, with actionable pause; no infinite loop observed. |
| Manual valid choice recovery | Workday Job Sites → Other accepted on Resume; following step reachable. Card staleness separately failed. |
| Dynamic optional repeater | Workday one manually added URL row was matched/expanded to three profile URLs; revisit/rerun did not duplicate. |
| Choice buttons and groups | Ashby Yes/No buttons and Lever authorization/sponsorship checkbox groups populated; no observed checkbox-group deadlock. |
| Profile versus AI | Workday eligibility Yes marked profile; commute answer inferred. Ashby two Yes/No answers inferred. Lever completed without credit use. |
| Actual final review | Clio Review reached after three content steps; site summary contained contact/source, PDF, three URLs and answers. No submit clicked. |
| Required validation after value loss | SmartRecruiters Next rejected empty phone, confirming a real incomplete page rather than a purely cosmetic empty card. |
| Rescan recovery | Greenhouse clears paused state but ambiguity repeats on Run; Workday Back-state Rescan restores fill action; SmartRecruiters Rescan preserves state but upload failures remain. |

Ashby had a Toronto posting whose form asked about working five days in a San Francisco office. Kareer answered No through inference. The question/location discrepancy is site content; no Kareer defect is assigned from it. The required missing-transcript pause is expected behavior in this scenario, not a new product failure.

Clio's My Experience posting did **not** contain work-history/education repeaters. Its repeater coverage is websites only. SmartRecruiters supplied a useful parser/dynamic education stress case, but did not reach a clean completed education state.

## 5. Console attribution and diagnostic limits

| Context | Observed message/count | Attribution |
|---|---|---|
| DoorDash | Toolbar 3 errors; React minified error #418 with Greenhouse CDN/Rollbar/scheduler stack | Site/runtime error observed; no extension-disabled baseline, so extension causation not established |
| Lever | Toolbar 14 errors; Lever/hCaptcha file:/// security messages, anonymous/WASM source-map errors | Third-party/page diagnostics; not evidence of failed Kareer AI or a Kareer exception |
| Ashby | Toolbar 25 errors; reCAPTCHA/Ashby file:/// security messages, CSP/source-map warnings | Page/third-party diagnostics; no managed-AI request failure observed |
| Several ATSs | Repeated Empty string passed to getElementById from extension bundle | Extension warning, source mechanism confirmed in QA-160-04 |
| SmartRecruiters | Toolbar 7 errors; named Kareer field-identity exceptions and stack | Extension failure confirmed in QA-160-08 |
| SmartRecruiters | Page may not load or link to file:/// | Page security diagnostic; appeared around capture/inspection, cause not assigned to Kareer |

Console counts are point-in-time toolbar counts and include unrelated messages; they must not be summed into an “extension error total.” Logs were read through native Developer Tools. No console JavaScript was executed. Clio's console was not separately audited during its multi-step run; its states/errors came from the panel and page. There was no clean extension-disabled baseline or network trace, so this report does not claim all third-party messages are harmless or extension-caused.

## 6. Credit ledger

| Operation | Before | After | Delta |
|---|---:|---:|---:|
| Earlier DoorDash primary fill | 297 | 296 | −1 |
| DoorDash Rescan/rerun | 296 | 296 | 0 |
| Lever fill and manual stale-state checks | 296 | 296 | 0 |
| Ashby primary fill | 296 | 295 | −1 |
| Ashby missing-transcript Resume | 295 | 295 | 0 |
| Workday paused generation checkpoint | 295 | 295 | 0 |
| Workday resumed My Information, including source repairs | 295 | 294 | −1 |
| Workday manual source recovery / upload workaround | 294 | 294 | 0 |
| Workday Application Questions | 294 | 293 | −1 |
| Workday Back/Rescan/rerun | 293 | 293 | 0 |
| SmartRecruiters primary fill | 293 | 292 | −1 |
| SmartRecruiters user-initiated retry | 292 | 291 | −1 |
| SmartRecruiters final Rescan | 291 | 291 | 0 |

No repeated repair-charge bug was observed. The second SmartRecruiters credit accompanied an explicit rerun with unresolved fields, so it is recorded as cost, not a billing defect. Inactive tabs can display older balance snapshots; the ledger follows observed active-run balances. Billing backend/request logs were not independently reconciled.

## 7. Additional observations, not promoted to confirmed bugs

- **Workday Auto Continue versus step review.** Auto Continue was on, yet each filled Workday step stopped at “Workday step filled. Ready for your review.” Source explicitly enables a Workday stepReviewPause quirk independently of the general setting. This is intentional current code behavior and a product-setting consistency question; it is not reported as a newly discovered accidental navigation failure.
- **SmartRecruiters employer context.** The panel said Company unknown (uncertain) despite UHN branding and a company-specific URL. The uncertainty is honestly disclosed; extracting employer/JD context is a quality gap. The generated hiring message was generic. Whether the full job description reached AI was not instrumented, so no claim of a prompt/context leak or missing network payload is made.
- **Generic completion messaging.** SmartRecruiters finished with READY / Ready to start and “Autofill complete,” zero completed steps and unresolved fields. Auto Continue did not advance. The adapter registry has no SmartRecruiters-specific adapter. This may reflect generic workflow scope rather than a separate root cause; follow up with QA-160-08/09 before splitting a new defect.
- **Parser accuracy.** SmartRecruiters' concatenated institution/certificate card and open editor need a parser-only baseline. They are not attributed exclusively to Kareer. No graduation date on this board is labeled wrong in this report.
- **Overlay.** Kareer's panel covered the right side/footer of Workday and SmartRecruiters at this viewport; minimizing exposed site navigation. No responsive-layout defect is claimed without a layout-specific test.

## 8. Reproduction artifacts and verification

The complete evidence index is [evidence-index.md](evidence-index.md). The timestamped ledger is [action-log.jsonl](evidence/action-log.jsonl), and a readable action timeline is [timeline.md](timeline.md). Reproduction steps and expected outcomes for every finding are in [regression-cases.md](regression-cases.md).

Captured fixtures:

1. `fixtures/greenhouse-doordash-2026-11-08-captured.html` — real Apply and submit semantics.
2. `fixtures/lever-shyftlabs-2026-11-08-captured.html` — real joining-timeline question and form controls.
3. `fixtures/workday-clio-source-2026-11-08-captured.html` — required source hierarchy/form, with captured leaf context.
4. `fixtures/workday-clio-upload-2026-11-08-captured.html` — upload-only My Experience before URL workaround.
5. `fixtures/smartrecruiters-uhn-2026-11-08-captured.html` — dynamic custom-element shell, education editor and accepted upload metadata; shadow internals omitted by Save Page.

Targeted test: `tests/unit/production-0.5.160.test.js`. It uses synthetic applicant values and sanitized local captures. No live ATS scripts, managed AI or final-submit calls are used. The test restores hidden-upload visibility as a documented reduced reproduction; it does not pretend the sanitized static page reproduces all live runtime behavior.

The test file deliberately marks unresolved normative assertions TODO because the user requested investigation before fixes. A zero process exit code means the investigation harness ran, **not that the defects passed**. Final test evidence is linked from the evidence index: one passing capture-characterization test, seven failing executable TODO assertions, and two pending native-only TODO specifications. No full suites were run.

## 9. Drafts left in the browser and remaining coverage

The five QA tabs remain unsent. DoorDash is filled but paused by Apply ambiguity. Lever's required joining answer is blank after the deliberate edit test. Ashby lacks the required transcript. Clio is back on My Experience after the idempotency test, with one resume and three websites. UHN has a restored valid phone but incomplete education and false upload failures. Treat all of them as QA drafts requiring review before any application use.

Not tested: final submission or confirmation, Auto Submit on, actual duplicate-submission prevention, authenticated/account-required Workday flows, CAPTCHA handling, alternate resume types/oversized/corrupt documents, upload network interruption, credit exhaustion/provider outage, browser restart/persistent draft recovery, multiple simultaneous active runs, cross-origin embedded application routing, accessibility/screen-reader audit, mobile/narrow layouts, Firefox-versus-Chrome parity, userscript parity, and other job-board layouts. The browser's existing extensions/theme remained enabled; interactions with them were not isolated.

The follow-up should first fix and validate the entry/submit distinction, upload-only classification and unsupported source fallback; then stable SmartRecruiters field/upload ownership; then review-state invalidation and console noise. This is a proposed repair order only. No production code, settings, release package or deployment was changed during this investigation.
