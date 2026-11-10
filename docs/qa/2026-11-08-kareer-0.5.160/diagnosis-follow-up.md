# QA-160 follow-up diagnosis — November 9, 2026

Branch: `fix/qa-160-application-reliability`, based on `prod` at `e9c23ea`.

The original evidence remains unchanged. This follow-up used temporary diagnostics, not product fixes. No application was submitted. Auto Submit stayed off; overwrite stayed off; Auto Continue stayed on. No education entry was manually saved, deleted or replaced.

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
