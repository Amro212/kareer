# Lever Review Fixes Implementation Plan

**Goal:** Address the three review findings and complete repository verification.

**Architecture:** Keep the shared DOM scanner and Lever adapter. Reuse the page classifier's ancestor-aware visibility checks for native selects, and check Select2 backing controls through their presentation widget. Recognize institution-name questions conservatively; other education questions stay unresolved for contextual answers.

**Tech stack:** JavaScript, Node test runner/JSDOM, Playwright with the MV3 extension loaded.

## Task list

- [x] Add regressions for native selects hidden by attributes, ancestors, or CSS, plus visible and hidden Select2 widgets. All three new tests failed before the production fixes.
- [x] Add positive institution-name and negative GPA/graduation/project recognition cases, including unlabelled university widgets.
- [x] Fix `src/core/fields/scanner.js`, `src/core/pageClassifier.js`, and `src/core/adapters/lever-fields.js`; all 96 targeted unit tests passed.
- [x] Fix the additional school substring bug exposed by browser verification: an unlisted institution selected TED University. Add a failing unit regression and keep school matching exact in `src/core/adapters/canonical.js`.
- [x] Verify `tests/e2e/lever-university.spec.js` using `fixtures/jobs.lever.co-2026-09-30-21-49.html`: both browser tests pass for exact university selection, hidden-field exclusion, contextual GPA, and required failures in the panel.
- [x] Diagnose the cross-frame request-count assertion: structured and narrative requests run concurrently, so arrival order is not guaranteed. Select the structured request and assert it remains a single request; runtime behavior is unchanged.
- [x] Build both extensions and the userscript at 0.4.93, run `npm test` (286 passed) and `npm run test:e2e` (59 passed), inspect the final diff, and log all changes and verification in `CONTEXT_AND_FINDINGS.md`.

## Verification

Targeted units: `node --test tests/unit/lever.test.js tests/unit/application.test.js`.

Targeted browser tests: `npx playwright test tests/e2e/lever-university.spec.js tests/e2e/cross-frame.spec.js`.

Completion requires both full test suites to pass. Work stays in the current checkout without staging or committing the user's changes.

---

# Workday Review Fixes Implementation Plan

**Goal:** Fix the three reproduced review findings sequentially, using failing regressions and minimal changes.

**Architecture:** Keep the existing workflow, scanner, and Workday adapter. Separate empty-control recovery from initial overwrite decisions; let the existing adapter decide when a populated dropdown needs correction; resolve nested prompt ownership consistently. No new coordinator or framework.

**Tech stack:** JavaScript, Node test runner with JSDOM, Playwright with the real MV3 extension.

## Task list

- [x] 1. Preserve review edits on continuation (red/green verified; 77 application unit tests pass; browser regression added).
  - Add regressions to `tests/unit/application.test.js` for generic and Workday review edits with overwrite enabled.
  - Run `rtk proxy node --test --test-name-pattern="review edits" tests/unit/application.test.js`; confirm the cached answer overwrites the edit.
  - Modify `src/core/application.js` so recovery fills only genuinely empty controls, while initial filling still respects adapter and overwrite decisions.
  - Run `rtk proxy node --test tests/unit/application.test.js`; add a browser regression to `tests/e2e/multi-step.spec.js`.
- [x] 2. Correct populated Workday dropdowns (red/green verified; 38 Workday unit tests pass; browser fixture uses a custom degree dropdown).
  - Add a closed, populated custom degree-dropdown regression to `tests/unit/workday.test.js`; confirm option harvesting never opens it.
  - Modify the existing harvesting guard in `src/core/fields/scanner.js` to permit adapter-requested corrections.
  - Run `rtk proxy node --test tests/unit/workday.test.js`; cover the real extension path in `tests/e2e/workday-parsed-rows.spec.js` with a synthetic fixture.
- [x] 3. Read nested prompt selections without adding duplicate rows (red/green verified; 39 Workday unit tests pass; browser fixture checks row count and committed token on retry).
  - Add a regression to `tests/unit/workday.test.js` with a school token beside the inner input container; confirm an extra row is added.
  - Resolve the owning prompt consistently in the Workday matcher and selection readers; preserve search text versus committed-selection behavior.
  - Run `rtk proxy node --test tests/unit/workday.test.js`; verify no duplicate Add on initial fill or retry through the extension.
- [x] Final verification and findings log (277 unit tests, 62 E2E tests, build v0.4.85, and diff checks pass).
  - Build extension and userscript through `rtk npm run build`.
  - Run mandatory `rtk npm test` and `rtk npm run test:e2e`, plus `rtk git diff --check`.
  - Record bugs, changed files, red/green evidence, verification results, and any remaining limitations in `CONTEXT_AND_FINDINGS.md`.

