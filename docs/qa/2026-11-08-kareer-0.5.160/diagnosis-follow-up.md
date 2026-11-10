# QA-160 follow-up diagnosis — November 9, 2026

Branch: `fix/qa-160-application-reliability`, based on `prod` at `e9c23ea`.

The original observations and captured evidence remain intact. The live follow-up used temporary diagnostics before choosing product repairs. No application was submitted. Auto Submit stayed off; overwrite stayed off; Auto Continue stayed on. No education entry was manually saved, deleted or replaced.

## Bounded UHN run

- Reloaded the local temporary Firefox extension at v0.5.160, retaining the saved profile, resume and settings. Initial balance: 291 credits.
- First fill uploaded/parsed the resume and reproduced the phone loss. Its AI request failed with `Activate your Kareer key in Settings.` because the diagnostic build incorrectly used production while the previous build used staging. No credit was used. Corrected the build origin without changing credentials.
- One retry used the original staging gateway. Final balance: 290 credits. No further fill/retry was performed. The draft remains incomplete and unsent.

## Education identity: established mechanism

Value-free diagnostics recorded queued descriptors immediately before harvesting, immediately after harvesting, before filling, and at `refreshField` rejection.

| Control | Before harvesting | At refresh failure |
| --- | --- | --- |
| Degree | `edu-degree-e1de4bad-9649-456a-884a-b6464986b96f`, connected | Old node detached; same question now `edu-degree-d79a2c02-aea5-4457-801c-1c6d3b001b80` |
| Description | `edu-desc-e1de4bad-9649-456a-884a-b6464986b96f`, connected | Old node detached; same question now `edu-desc-d79a2c02-aea5-4457-801c-1c6d3b001b80` |
| Institution | `spl-form-element_10`, connected | Old node detached; replacement `spl-form-element_20` |
| School location | `spl-form-element_16`, connected | Old node detached; replacement `spl-form-element_26` |

All these descriptors were connected before harvesting and detached afterward, before answer application. Their labels, types and empty descriptions remained consistent. Degree/Description native controls belonged to `spl-input`/`spl-textarea` inside `oc-education-edit-form`; autocomplete native inputs belonged to nested `spl-input` inside `spl-autocomplete`. Both autocomplete wrappers were also incorrectly scanned as second descriptors.

The resume parser replaced the education editor after Kareer chose its targets. `waitForResumeParsing` immediately returns for the generic adapter used on SmartRecruiters, and its form snapshot only queries light DOM. Reuploading an already accepted resume on retry starts the same race again. The existing changed-question rejection is correct and must remain.

The loaded public uploader module (`976.232e7933770f2ec3.js`) confirms the processing signal: `oc-apply-with-resume` sets `isLoading` while its parse request runs and binds that state to the parser dropzone's `disabled` property. It clears the state on error/completion. Editor instances generate their own `formId`, explaining changed UUID-based IDs after replacement.

## Phone: independently established mechanism

Read-only runtime inspection and local replay using the cached actual SmartRecruiters phone component establish nested `spl-phone-field → spl-input → input[type=tel]`. The scanner's immediate-shadow-only wrapper exclusion retains the outer host as a second empty field. Filling that host writes a string into its object-valued country/number state; the component's normalization then drops both values. The live diagnostic first fill reproduced the loss.

## Repair boundary

Wait for the actual parser's processing signal and stable shadow controls before selecting targets; recognize accepted uploads to avoid retry parsing; emit one descriptor per logical control and fill the native phone input. Do not loosen identity checks or match changed rows by label alone. Malformed parser education data and adding/saving repeatable education records remain outside this repair.

## Implemented repairs

| Finding | Cause and focused change | Coverage |
| --- | --- | --- |
| QA-160-02 | Bare Apply labels were accepted as final submission without form evidence. Require an identified application form; keep adapter-owned controls authoritative in both navigation and classification. | Captured DoorDash; listing entry; external localized native submit; adapter-owned Apply without native form. |
| QA-160-03 | The inactive engine ignored manual value changes. Observe input/change and reconcile current values/validation; show manual corrections as MANUAL/VERIFIED; invalidate final readiness after edits. | Captured Lever deletion; rendered required deletion and failed-field correction. |
| QA-160-04 | Missing/whitespace ARIA references produced empty ID lookups in workflow, action, field, description and group labels. Filter empty tokens before lookup. | Instrumented lookups covering ordinary actions, radios and whitespace references; expanded assertion failed with five empty calls before the remaining label paths were repaired. |
| QA-160-05 | The Workday recipe invented LinkedIn and suppressed saved-answer/AI routing. Remove that deterministic default. | Captured unavailable option; exact saved answer uses zero AI requests; unresolved source reaches one mocked contextual page request with owned choices. Existing bounded hierarchy discovery passes. |
| QA-160-06 | The classifier excluded a hidden native upload although its visible Workday widget was recognized by the scanner. Count it through its application form or recognized Workday resume widget. | Captured upload-only DOM; unrelated hidden uploads remain excluded. |
| QA-160-07 | Final review stayed cached while the page went Back. Reconcile inactive page observations and restore idle Autofill without activating execution. | Captured Back replacement; rendered Workday Back with no Next click or filling. |
| QA-160-08 | Nested wrappers duplicated native controls; resume parsing replaced editors after target selection. Exclude wrappers recursively; add a thin SmartRecruiters upload adapter; wait for parser state and stable shadow fields before rescanning targets. | Reduced nested native fixture; real observed editor replacement boundary; stale descriptors still throw the changed-question guard. |
| QA-160-09 | FileList clears after acceptance; cached descriptors then falsely looked empty. Read the owning dropzone's accepted filename in scanner/verifier and refresh file descriptors before retry decisions. | Both real native shadow file inputs; malformed metadata rejected; rendered parser populates both widgets with one delivery and zero reuploads on retry. Prefill-only native ownership remains excluded. |
| QA-160-10 | Filling a duplicate outer phone wrapper converted compound state into a string. Choose the native tel input once. | Overwrite-off parsed phone/country preserved; nested descriptor ownership. |
| Workday Auto Continue | An unconditional per-step exception overrode the setting. Remove it; preserve the Auto Continue off pause and separate Auto Submit setting. | Regression failed before removal; intermediate steps now reach review with Auto Submit off. Explicit/manual Continue coverage passes. |

No new dependencies, profile migrations, broad refactors, deployment or submissions. Existing rows, accepted attachments, overwrite-off behavior, retry limits and identity rejection remain in place. Education-date logic was not changed; the withdrawn September 2021–April 2026 observation stays withdrawn. Missing Transcript remains a distinct manual document requirement.

## Verification

All Node test invocations were targeted and serial. The final recorded command is:

```powershell
node --test --test-concurrency=1 tests/unit/production-0.5.160.test.js tests/unit/smartrecruiters.test.js tests/unit/review-state.test.js tests/unit/upload.test.js
```

Recorded output: [repair-tests.tap](repair-tests.tap), **40/40 passed, zero skipped, zero TODOs**. This includes eleven captured/boundary assertions, eight SmartRecruiters cases, three rendered review cases and eighteen upload compatibility cases. A separate empty Transcript widget cannot borrow accepted resume evidence or become a resume target.

Additional targeted runs passed:

- `application.test.js`, named review/submission/reset/Auto Submit cases: 35/35; native on-page Continue also passes in the three-case Workday navigation run.
- `application.test.js`, native/localized/shadow submit and unrelated form cases: 5/5.
- `workday.test.js`, named source, row preservation, segmented dates, disclosure and month cases: 7/7; deterministic single-request routing also passes.
- `panel.test.js`, named report counters and historical-error cases: 5/5.
- `ats-hardening.test.js`, captured ClearCompany and SmartRecruiters compatibility: 2/2.
- `node tools/build.js --target=extension`: Chrome ZIP and Firefox XPI built.
- `node tools/build.js --target=userscript`: userscript built.

Builds retain v0.5.160 for local QA using the ignored build cache, without a release/version change. Build-generated site/update metadata is restored; built artifacts stay ignored. Temporary diagnostic logging is removed from source and final artifacts. Local builds use the existing staging gateway; no gateway configuration or credentials changed.

## Remaining limitations

The bounded live run established the cause before repairs; it was not a post-fix live retest. Reduced fixtures reproduce observed structure and timing but do not execute the full remote ATS application. The existing live tab may retain its earlier injected script until reloaded. Final submission, confirmation, authenticated flows, network failures and live extension/userscript parity remain untested. No broad live testing or full test suites were run.

Employer-context improvements, completion wording, parser accuracy, parsed education content, repeatable editor saving and panel layout remain outside this repair. This is a focused repair with regression evidence, not release sign-off.
