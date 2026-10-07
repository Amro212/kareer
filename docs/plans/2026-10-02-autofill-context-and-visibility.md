# Autofill context and visibility implementation plan

**Goal:** Investigate and fix the universal fill slowdown and Ashby resume verification, capture job context automatically with explicit country scope, and show a collapsed toolbar only on job-related pages.

**Architecture:** Keep changes in the shared core for both extension and userscript. Reuse the one-page AI resolver, ATS upload-state hook, application sessions, and navigation contract. Prefer DOM/JSON-LD metadata over geographical guesses; leave ambiguous work countries explicit and unanswered for eligibility.

**Tech stack:** JavaScript ES modules, Node test runner/JSDOM, Playwright with the real MV3 extension.

1. Capture the supplied live ATS pages with Debug fixture export and preserve sanitized regression fixtures. Reproduce accepted Ashby uploads whose input is cleared/replaced.
2. Add failing regressions for one primary AI request, DOM and multi-country job metadata, job-only toolbar visibility, collapsed startup, and dynamic navigation/capture.
3. Extend the existing page-answer resolver to all boards, resolving exact profile/saved values first and preserving narrative voice in the single prompt. Remove decorative per-field waits while retaining parser/combobox persistence checks.
4. Add Ashby accepted-upload state and integrate it into scanning, attachment success, and verification. Keep rejection/busy states distinct.
5. Capture listing/application metadata automatically at startup, relevant DOM changes, and navigation. Preserve listing context through application steps; update session context without starting autofill. Remove manual capture controls.
6. Gate mounting on supported ATS, embedded ATS, recognizable listings, or job applications. Start each mount as a pebble; continue observing dynamic pages.
7. Run targeted regressions, `npm test`, build both artifacts, and `npm run test:e2e`. Review the diff and record files, root causes, outcomes, and any limits in `CONTEXT_AND_FINDINGS.md`.

The user's detailed requested behavior authorizes these implementation choices. Work runs in the existing clean worktree with one agent.
