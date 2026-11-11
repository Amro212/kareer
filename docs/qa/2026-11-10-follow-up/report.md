# November 10 follow-up: Workday websites and SmartRecruiters

Branch: `fix/qa-160-application-reliability`. Native Zen QA uses the existing saved profile/resume and staging AI connection, overwrite off and Auto Submit off. No final submission is authorized or performed.

## Workday website duplication

The user reported three copies of the portfolio URL. Their screenshot shows the resulting ambiguous `websitePanelSet` pause. The live draft initially had two remaining duplicates; the saved profile has distinct LinkedIn, GitHub and portfolio links.

The session question cache used only label, type and description. All repeated URL questions collided, so a revisit reused the last portfolio answer for other bound rows. This exactly reproduces the live trace: LinkedIn/GitHub row bindings disappear after their incorrect fill, and retry matching becomes ambiguous. A second regression establishes that already-corrupted per-step answers can survive even after fixing the question key.

Repairs: include adapter, saved-row identity and canonical field in repeated-question cache keys; prefer a usable deterministic answer from the current bound saved record over stale per-step answers. Flat-question keys remain compatible. No saved profile migration, row deletion, URL guessing or matching relaxation.

Fixture: `fixtures/workday-clio-websites-fixture.html`, reduced from the live Clio ancestry with synthetic IDs/values. Regression: `tests/unit/workday-websites.test.js`; initial failures show all three URLs becoming the portfolio, including a corrupted-step retry. All three cases pass after repair.

## SmartRecruiters diagnosis and repairs

- Initial live run: accepted resume verified; phone and Canada code preserved. City stayed empty, and the attachment widget did not trigger parsing. Balance 281 -> 280.
- Native City options are in an ancestor shadow root, beyond the input's own root. Exact `aria-controls` lookup now walks ancestor roots. Option hosts contain nested native dropdown targets; selection now clicks the actual native option and verifies its committed marker.
- Country-code text is assigned to the trigger's slot. Read that selected text so an already-selected code is preserved without opening its dropdown unnecessarily.
- Personal City and education Institution need grounded search terms. Reuse the existing application resolver for personal location and the single unambiguous saved education record; multiple saved education records remain contextual rather than choosing the first.
- Institution suggestions decorate a school name with a country/location. The component's fallback `spl-truncate[title]` is the actual logical label and matches the committed value. Use this label consistently for harvesting, matching, searching and verification; country decoration must not become part of the school name.
- User explicitly approved automatic top-parser use on fresh applications only. When work/education entries or editors already exist, preserve them and use only the attachment widget. A fresh run uses the parser first; accepted attachments and parser-created records survive retries.
- The inactive review observer treated standalone autofill/parser changes as manual edits. Reproduced in the rendered panel. Suspend manual reconciliation for the external fill, then reset its observation baseline; actual subsequent manual edits remain covered.
- The live empty-ID warning stack identified two remaining paths in validation and job detection. Filter empty reference IDs there, with an expanded failing-then-passing QA-160-04 assertion.

The fresh parser produced four work entries, one saved education card and an open education editor. The identity errors did not recur. Parser content remains imperfect (including the existing school/degree/date interpretation); no parsed records were deleted or manually saved. The next retry preserved these rows, filled City and retained phone/country. Institution's native catalog selection worked manually; the logical-label mismatch was captured and reproduced before its repair. Final live verification is recorded below when completed.

## Automated verification

Only targeted tests, serially. Recorded output: `targeted-tests.tap`.

Additional checks: selected memory/reload/pause cases (5/5); selected Workday/bound-row/reload cases (13/13); upload compatibility (18/18); generic detection (27/27); selected Greenhouse/Ashby/SmartRecruiters compatibility (5/5). Both extension browsers and userscript are built for local QA at v0.5.160.

Existing release metadata edits were present before this work and are preserved. No new dependencies, deployment or push. Final submission, authenticated flows and cross-browser live parity remain outside this run.
