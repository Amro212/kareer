# Application materials workspace implementation plan

**Goal:** Make profile-based tailoring and editing a compact, clear workspace.

**Approved design:** Prepare / Edit tabs; profile facts as the only generation source; remove base-resume controls and diffs. Edit one section or letter paragraph at a time alongside the saved PDF. Keep Save, PDF/Word downloads, and Delete at the top. Download saves current edits; dirty drafts survive tab/section switches and require Save / Discard / Stay before document switches.

**Architecture:** Retain the existing extension page, background materials service, document model, local exports, and shared DESIGN.md tokens. Preserve existing documents and original uploaded files. No new dependencies, editor framework, backend, or agents.

**Tech stack:** Vanilla HTML/CSS/JavaScript, MV3, IndexedDB, pdfmake/docx, node:test, Playwright.

**Status:** Implemented at v0.5.79. Final verification: 517 unit tests, 152 E2E passes (three opt-in skips), all 19 materials cases, real Firefox smoke, source/build/version checks, and whitespace checks pass. Desktop/compact captures inspected; no new dependencies, commits, or deployment.

1. Add profile-isolation unit and real-extension workspace regressions; run them before production edits. Update obsolete import/diff tests to assert the new requirements.
2. Simplify `src/core/materials-model.js` and `src/targets/extension/background/materials.js`: profile-only source, no extraction fallback, no diff generation. Keep validation, concurrency and legacy export reads intact.
3. Update `src/targets/extension/materials/{index.html,index.js,workspace.css}`: top document context/actions, accessible task tabs and section navigation, independent edit/preview scroll, profile source copy, dirty status and navigation dialog. Reuse existing save/rewrite/export handlers.
4. Update affected materials browser tests and DESIGN.md. Build, run focused checks, inspect desktop/compact screenshots in one batch, correct defects, confirm once, run Impeccable detector.
5. Run mandatory `npm test` and full `npm run test:e2e`; inspect final diff, update CONTEXT_AND_FINDINGS.md with evidence and limitations. Leave changes reviewable in the current workspace.
