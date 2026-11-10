# Kareer 0.5.160 — focused regression specifications

Investigation only. Product fixes are deferred by explicit user instruction. Run with Auto Submit **off**, using an isolated synthetic profile for automated work. Never run these against a live final-submit control. Live actions below refer to the authorized, unsent QA session, not permission for future submissions.

Automated entry point: `node --test tests/unit/production-0.5.160.test.js`.
Seven executable TODO assertions document known failures. Two additional TODO entries track native cases that the static capture cannot replay. A TODO is **not a passing regression test**; remove its TODO marker when implementing the corresponding fix, and prove it passes. The ordinary characterization assertion verifies that the Greenhouse capture contains the relevant controls.

## QA-160-02 — application-entry control versus submit

- Fixture: `fixtures/greenhouse-doordash-2026-11-08-captured.html`.
- Preconditions: actual application form filled; header Apply (`type=button`) and form Submit application (`type=submit`) coexist.
- Action: inspect final submission candidates, then enter review without submitting.
- Required result: exactly one final submission candidate, the form's actual submit. Entry/jump Apply does not create ambiguity.
- Current result: two candidates; live pause says `Multiple Submit controls found: Apply, Submit application. Submit manually.` Rescan plus rerun repeats it.
- Related live case: Clio job description with zero fields must remain a listing/entry state; running there must not advertise final review or Submit Application.
- Automated scope: captured Greenhouse candidate classification. Workday entry behavior is a live observation; its HTML-only source capture was an empty shell and is not retained as a purported reproduction.

## QA-160-03 — required value manually cleared after review

- Fixture: `fixtures/lever-shyftlabs-2026-11-08-captured.html`.
- Preconditions: overwrite off; required joining-timeline answer prefilled with `QA preservation test: available four weeks after an offer.`; run reaches READY FOR REVIEW.
- Actions: edit with native keyboard, select all, Backspace, blur; wait for observation to settle.
- Required result: field card reflects the empty current value and review readiness is invalidated or clearly marked stale.
- Current result: card retains original answer; READY FOR REVIEW and Submit Application remain.
- Automated scope: isolate captured joining control and submit semantics; enter review through the application engine; clear and dispatch input/change; assert review invalidates. This reproduces engine-state staleness, not the whole rendered panel.
- Related manual check: on Clio source-picker recovery, committed Other must replace FAILED/Empty in the card after Resume. Current card remains stale although validation accepts Other.
- Excluded: clicking live Submit to test submission-time validation.

## QA-160-04 — empty-ID warning flood

- Fixtures: captured Greenhouse/Lever/Workday/SmartRecruiters DOMs; minimal button/input for unit isolation.
- Action: label ordinary controls without `aria-labelledby` through both controlLabel and workflowLabel.
- Required result: no `getElementById('')` calls; no Firefox empty-ID warnings.
- Current result: both paths make an empty lookup. Live console has repeated `Empty string passed to getElementById().` warnings from extension content code.
- Automated scope: instrument document.getElementById and assert zero calls for absent references.

## QA-160-05 — Workday unsupported source answer

- Fixture: `fixtures/workday-clio-source-2026-11-08-captured.html`.
- Preconditions: required How Did You Hear About Us hierarchy; available leaves do not match LinkedIn; profile has no exact supported source value.
- Actions: Run; observe two bounded repairs; inspect categories; manually select Job Sites → Other; Resume.
- Required result: deterministic miss remains eligible for grounded contextual fallback and a supported leaf can be resolved. Once manually committed, the value is preserved and the review card updates.
- Current result: LinkedIn search repeatedly produces no committed answer, then repair limit 2/2. Manual Other lets validation proceed; card still FAILED/Empty.
- Automated scope: scan actual source control, supply a captured supported leaf catalog without LinkedIn, and assert no empty deterministic answer suppresses fallback. The specification uses null as the existing unresolved-answer contract; another implementation may explicitly route the miss to AI.

## QA-160-06 — hidden native upload is the only field

- Fixture: `fixtures/workday-clio-upload-2026-11-08-captured.html`.
- Preconditions: My Experience contains required upload and Websites Add, with no URL row yet.
- Actions: Resume; then Add one optional website URL row and Resume again.
- Required result: original upload-only step is an application, uploads the saved PDF, and does not require adding unrelated fields.
- Current result: first Resume pauses with Job listing detected. Adding a visible URL starts filling, uploads one PDF, and creates/completes three profile website rows.
- Automated scope: restore the observed hidden native input with `display:none`, because Save Page omitted Workday runtime CSS; verify scanner sees the upload and classifier must also classify application. Static capture returns unrelated instead of the live listing result because scripts/job metadata were removed. The shared failure is omission of the upload from application detection.
- Retry check: Back to My Experience, Rescan, rerun. Expect one PDF and three unique URLs. Live result passed with no additional credit.

## QA-160-07 — manual Back leaves final-review session state

- Fixture: `fixtures/workday-clio-upload-2026-11-08-captured.html`; screenshot `evidence/workday-back-navigation-stale-review.png`.
- Preconditions: Clio actual Review reached, Auto Submit off.
- Actions: minimize overlay, site Back to Questions, Back to My Experience; reopen Kareer.
- Required result: actual earlier step governs state and primary action. Submit Application must not remain the primary action on a fillable earlier step.
- Current result: 4 DETECTED but READY FOR REVIEW / Submit Application, with historical 3 steps completed. Rescan changes it to READY / Autofill Workday.
- Automated scope: initialize engine on final review, enter review, replace body with captured earlier-step DOM, await mutation scheduling, assert review state invalidates. No submit action is called.

## QA-160-08 — SmartRecruiters field identity and incomplete education

- Fixture: `fixtures/smartrecruiters-uhn-2026-11-08-captured.html`; screenshots `evidence/smartrecruiters-incomplete-education.png` and `evidence/smartrecruiters-console-field-errors.png`.
- Preconditions: Easy Apply empty form; saved resume/profile; generic fallback adapter, 12 detected controls.
- Actions: Run; wait for parser and AI; inspect education editor and console; retry once; Rescan.
- Required result: one descriptor per logical field, stable identities across scans/rerenders, required Institution fill or explicit actionable failure. Degree/Major/Description must map to their own questions.
- Current result: duplicate City/Phone entries; dynamic 22 detected; empty Institution and Degree; degree text in Major; parser's existing education card remains. Console repeatedly throws `The question changed or disappeared. Scan the page again.` for Degree, Description, Institution and School location. Retry repeats it.
- Error counts: toolbar showed 7 errors at captured retry checkpoint; use named messages/source, not aggregate count, for attribution.
- Native spec only for now: Save Page preserved custom element attributes but omitted shadow-root internals. Do not invent a shadow hierarchy and claim an automated reproduction. TODO tracks the missing faithful shadow replay. Captured shell, action log and screenshots preserve the live evidence.
- Parser attribution: this run does not isolate whether the malformed education card/editor originated in SmartRecruiters parsing. Kareer's failure to reconcile/fill it and its own exceptions are directly observed.

## QA-160-09 — accepted SmartRecruiters upload falsely fails and repeats

- Fixture: same SmartRecruiters capture, with sanitized `spl-dropzone[files]` accepted-document metadata retained.
- Preconditions: ATS lists uploaded PDF; native file input has been reset; wrapper files metadata still describes document.
- Actions: inspect verification; retry once with overwrite off.
- Required result: accepted PDF verifies from appropriate ATS evidence; retry preserves it without reuploading/reparsing.
- Current result: both upload cards FAILED/Empty despite attached PDF; retry reprocesses resume and temporarily resets parsed contact values. One PDF remains, not duplicate visible attachments.
- Automated scope: assert verifyField recognizes captured accepted-wrapper metadata after FileList clears. This isolates the metadata blind spot; live shadow-input execution still requires native regression.

## QA-160-10 — SmartRecruiters phone clears during first fill

- Fixture: same SmartRecruiters capture; action-log checkpoints 78–86.
- Preconditions: resume parser has populated Canada +1 and saved national phone; overwrite off.
- Actions: allow first Run to finish; click site Next; select Canada +1 and restore saved number manually; retry once.
- Required result: valid parsed phone/country preserved; Next does not reject them.
- Current result: first run cleared both; Next scrolled to phone and reported `Please provide a valid phone number`. Manual correction persisted; retry preserved it.
- Native-only pending reproduction: observed once, root cause unconfirmed; candidate is option harvesting/custom parent-child handling. Do not claim deterministic repeatability or assign the clear to a specific function yet.
- Automation limitation: stale Computer Use window binding delayed focus/value observations during recovery. After rehydrating the same returned window, set_value worked and correction was verified. Those recovery attempts are not extra Kareer failures.

## Controls that must continue to pass

- Greenhouse education September 2021–April 2026 is correct; no regression should “fix” it.
- Lever prefilled joining sentinel remains unchanged with overwrite off, and saved/profile/parser values survive.
- Ashby required Transcript must remain empty when unavailable; do not attach resume as transcript. Resume without transcript must terminate in bounded actionable pause with no repeated AI charge.
- Workday user Pause during generation halts filling; stable paused checkpoint; Resume continues.
- Workday hierarchical-source repairs stop at two attempts rather than looping.
- Existing resume and repeatable website rows survive Back/Rescan/rerun without duplication.
- Manual correction and Rescan alone do not consume credits.
- Auto Submit remains off throughout. Final-submit success, duplicate submission prevention and confirmation pages require a separate explicitly authorized environment/test.
