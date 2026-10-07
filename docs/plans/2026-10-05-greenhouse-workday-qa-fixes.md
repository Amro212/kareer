# Greenhouse and Workday QA fixes implementation plan

**Goal:** Correct the five reported QA failures with small changes to existing harvesting, ATS hooks, resume routing and panel rendering.

**Architecture:** Retain the shared observe/fill/verify pipeline and one primary page request. Use existing ATS hooks for widget differences. Preserve owned-choice verification, cancellation and bounded repair; no replacement engine or speculative abstraction.

**Tech stack:** JavaScript, Node test runner/JSDOM, Playwright with the real MV3 extension.

## Tasks

- [x] Greenhouse education and dates: reproduce profile-first menu filtering; open and harvest unfiltered menus before selecting. Reuse existing month-name/number aliases and contextual AI for unmatched harvested choices. Search only when the menu requires it. Files: `src/core/adapters/greenhouse.js`, `src/core/fields/scanner.js` only if needed; `tests/unit/greenhouse-ashby.test.js`, browser regression.
- [x] Workday skills: reproduce the reported Enter-search/Enter-select widget. Extend the existing Workday hook only where observed markup/events differ; verify committed tokens for each skill, preserve existing tokens and prevent implicit submission. Files: `src/core/adapters/workday.js`, `workday-fields.js` only if needed; `tests/unit/workday.test.js`, browser regression.
- [x] Workday resume: trace identification, file dispatch and acceptance. Canonical resume identification must survive a generic upload label and preceding non-file fields. Files: `src/core/resume.js`, Workday hook only if evidenced; `tests/unit/upload.test.js`, browser regression.
- [x] Failure notice: reproduce an old session error with zero current failed fields. Gate the field-error notice with the same current-field report used by the FAILED count. Files: `src/core/ui.js`, `tests/unit/panel.test.js`, browser regression.
- [x] Greenhouse/Workday speed: measure search/harvest/fill waits; remove only redundant work demonstrated by the reproductions. Preserve asynchronous results, ownership, framework settling and parser waits. Record timings separately from AI latency.

For each fix: add a failing regression, confirm its failure, implement the smallest change, rerun focused checks. Capture reported pages through Debug when URL/access is available; retain sanitized fixtures and browser specs. The screenshot-only Workday/school variants remain pending real markup until supplied.

Commit on `feature/ux-enhancements`: plan/findings first; the small verified production fixes together with captured-fixture regressions afterward. Run `npm test` and `npm run test:e2e` before considering each implementation stage done. Build all targets and log results, limits and files in `CONTEXT_AND_FINDINGS.md`. No agent delegation requested for this pass.

## Completed verification

Plan committed as `ee8b913`. Final source v0.5.14: 417 unit tests and 107 real-extension browser tests passed (11.3 minutes, diagnostic tracing disabled). Four new browser cases cover named/numeric education months, contextual degree inference, historical-warning cleanup, Workday keyboard skills, resume attachment and retry idempotency. Five production files changed; Chrome, Firefox and userscript builds agree on v0.5.14. Real model latency and signed-in live Workday runtime remain human-QA checks.
