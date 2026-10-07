# Pre-merge review fixes

Goal: resolve the three reproduced review defects and prepare `greenhouse-ashby` and `feature/ux-enhancements` for `master` without publishing or merging into the default branch.

Use the existing adapter/field architecture, Node unit tests, and Playwright's real extension harness. Reserve complete repeatable-row identities before partial matches. Remove arbitrary Workday skill substitutions. Share the existing authorization-without-sponsorship rule between generic and ATS answer resolution, preserving country scope and unknown facts.

- [x] **R1 — Shared row matching.** Complete identities are reserved before partial rows; both saved-record orders and retry pass. Genuine competing partial rows still stop before Add. Fixed in both actual branch checkouts with unit and extension E2E coverage.
- [x] **R2 — Workday skills.** Java search returning only JavaScript leaves the field unchanged and unresolved. Removed the first-suggestion fallback, retaining exact-match and Enter-only commits. Fixed in the actual UX checkout.
- [x] **R3 — Generic eligibility.** Generic and ATS authorization share the existing sponsorship rule in canonical.js. Unit cases cover current/future scope, unknown facts, and negation; the real extension selects No when sponsorship is required. Fixed in the actual UX checkout.
- [x] Run failing regressions before production changes, then focused checks after each fix. All three reproduced red; focused unit and browser checks pass.
- [x] Run `npm test`, all builds, and `npm run test:e2e` on each final branch. Run browser suites independently to preserve their trace directories.
- [x] Check fixture whitespace and changed-file diff hygiene; preserve unrelated local changes. Cleaned captured-fixture whitespace and the reproduced generic Autofill test race; changed-file checks pass.
- [x] Stabilize successful resume-parser unit fixtures after reproducing a scheduler-delay timeout under browser-test load. Increased only success-fixture deadlines; the stuck-parser regression remains unchanged. Both final unit suites pass.
- [x] Re-simulate both regular merge orders using the fixed branch snapshots; document conflicts, final-tree equality, and recommended merge sequence.
- [x] Update `CONTEXT_AND_FINDINGS.md`, this task list, and merge readiness. Leave remote branches and `master` untouched.

Recommended sequence, subject to final verification: merge Greenhouse/Ashby using a merge commit, then UX using a merge commit. UX already contains the original Greenhouse/Ashby history; avoid squashing the first branch, which the original simulation showed creates 29 conflicts. The new shared fix must also be present in UX before landing.

Current verification: Greenhouse/Ashby 371/371 unit tests and 90/90 real-extension browser tests; UX 445/445 unit tests; all three focused real-extension regressions pass. Chrome, Firefox and userscript builds pass on both snapshots. UX's final full browser suite passed: 117 tests, with three opt-in live-capture cases skipped.

The fixed-candidate simulation found two synchronization conflicts: the findings log and the shared unit-test file. The synchronization resolution preserves both logs and the entire verified UX test file, including all shared regressions. Production sources merge automatically. After synchronization, both regular landing orders are conflict-free and produce the same tree; the Greenhouse-first order remains recommended for the two PRs. Evidence: `scratch/fixed-resolved-merge-results.json`.

Final evidence: `scratch/review-fixes-gh-unit-final2.log` (371 passed), `scratch/review-fixes-ux-unit-final2.log` (445 passed), `scratch/review-fixes-gh-e2e.log` (90 passed), and `scratch/review-fixes-ux-e2e-final.log` (117 passed, three opt-in live cases skipped). All builds and branch-range whitespace checks pass. Local commits and exact refreshed merge trees are recorded in `scratch/review-fix-local-commits.json` and `scratch/final-review-merge-results.json`.
