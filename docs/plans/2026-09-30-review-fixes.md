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
