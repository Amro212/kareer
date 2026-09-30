# Review Fixes Implementation Plan

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

Execute in the current checkout, one issue at a time. Preserve the user's staged changes. No subagents, commits, or publishing.
