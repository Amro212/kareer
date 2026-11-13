# Evidence index

- [Full report](report.md)
- [Readable timeline: 87 actions/checkpoints](timeline.md)
- [Redacted timestamped UI ledger](evidence/action-log.jsonl)
- [Focused regression specifications](regression-cases.md)
- [Targeted test output](evidence/targeted-tests.tap)
- [Executable regression assertions](../../../tests/unit/production-0.5.160.test.js)
- [November 9 diagnosis, repairs and verification](diagnosis-follow-up.md)
- [Post-repair targeted output: 40 passing, zero TODOs](repair-tests.tap)
- [Reduced UHN shadow fixture](../../../fixtures/smartrecruiters-uhn-shadow-fixture.html)
- [Native ownership/parser/retry regressions](../../../tests/unit/smartrecruiters.test.js)
- [Rendered review reconciliation regressions](../../../tests/unit/review-state.test.js)

## Screenshots

| Evidence | What it establishes |
|---|---|
| [Workday Back leaves stale final-review action](evidence/workday-back-navigation-stale-review.png) | Earlier My Experience step with four controls; panel still offers Submit Application |
| [SmartRecruiters incomplete education](evidence/smartrecruiters-incomplete-education.png) | Required Institution blank, Degree blank, degree text in Major |
| [SmartRecruiters PDF present but marked failed](evidence/smartrecruiters-upload-present-marked-failed.png) | ATS lists resume while both Kareer upload cards show FAILED/Empty |
| [SmartRecruiters extension exceptions](evidence/smartrecruiters-console-field-errors.png) | Named Kareer field-identity errors, repeated warnings and settled panel state |

Screenshots contain some professional context/public links. Redact before sharing externally. HTML fixtures and text ledger were sanitized separately; raw Save Page files are ignored under scratch and are not deliverables.

## Captured fixtures

| Capture | Coverage | Fidelity limit |
|---|---|---|
| [DoorDash / Greenhouse](../../../fixtures/greenhouse-doordash-2026-11-08-captured.html) | Entry Apply versus native submit | Scripts/styles removed; no live React handlers |
| [ShyftLabs / Lever](../../../fixtures/lever-shyftlabs-2026-11-08-captured.html) | Required joining timeline and application controls | Values cleared; scripts/styles removed |
| [Clio / Workday source](../../../fixtures/workday-clio-source-2026-11-08-captured.html) | Required source prompt, captured hierarchy leaf context | Static menu state; no Workday runtime handlers |
| [Clio / Workday upload-only](../../../fixtures/workday-clio-upload-2026-11-08-captured.html) | My Experience before adding website row | Runtime CSS absent; test explicitly restores hidden input |
| [UHN / SmartRecruiters](../../../fixtures/smartrecruiters-uhn-2026-11-08-captured.html) | Custom element attributes, dynamic editor shell, accepted upload metadata | Save Page omitted shadow internals; two native-only cases remain pending |

## Targeted verification result

This section records the original failing investigation. The November 9 follow-up above supersedes its pending status; historical evidence and output remain intact.

Command: `node --test tests/unit/production-0.5.160.test.js`.

Final recorded run: ten test entries, one passing characterization assertion, seven **failing executable TODO assertions**, two pending native-only TODO specifications. Node reports nine TODOs and exits zero by design. This is evidence of unresolved defects, not a passing product regression suite. The output contains the seven expected assertion failures and no setup-error substitution.

An initial exploratory run exposed a wrong fixture selector and missing runtime upload visibility in the test harness; those were corrected before the recorded final run. The upload test now reproduces omission of the hidden upload from application classification; the sanitized page returns unrelated while the live page returned listing. No production fix was made.
