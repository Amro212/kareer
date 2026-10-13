# Profile and application materials QA

Branch: `feature/materials-editor-ux`. Finished extension build: `0.5.104`.

## Browser and test scope

Tests use the real packaged extension in Playwright Chromium 153.0.8010.12 and a real Firefox 155.0 temporary add-on. Job applications, profile data and AI responses are local fixtures. No paid OpenRouter request was made.

The full relevant Chrome matrix passed **57/57** on v0.5.103. After centralizing job-header text/tooltips, all 13 affected workspace cases and four existing Profile-dependent Workday cases passed on v0.5.104. The environment restarted after 15 checks; the remaining two passed in a resumed run. These runs cover **61 distinct passing browser cases**; repeats are not counted as additional coverage. Real Firefox v0.5.104 also passes application generation/upload, Materials editing/proof/download and Profile overview/section saves.

| Surface | Verified behavior |
| --- | --- |
| Profile overview | Truthful empty summaries; existing identity, experience, education, projects and skills; long unbroken facts; no initial dirty state; materials shortcut; Settings routes and browser navigation. |
| Profile editing | In-place expansion; independent section saves; Cancel restores its opening value; other unfinished sections stay intact; Enter saves only its section; skill-entry Enter/comma and textarea line breaks retain their meaning; native validation; compact Save all control. |
| Profile persistence | Save/reload; failed section and bulk writes with retry; controls return to an editable state; unrelated external changes merge; later stale changes conflict; simultaneous windows cannot overwrite the same section; enabled record and structured eligibility/language behavior survives. |
| Materials library | Initial library, empty state, actual update dates, resume/letter grouping, role/company search, cover-letter-only applications, new applications, direct document/session links and returning to the library after edits. |
| Prepare | Aligned title/company/160px description; independent document/task tabs; length controls; optional writing preferences; missing-profile recovery in a new tab preserves inputs; source summary refreshes; generation progress, cancellation, provider failure and retry. |
| Continuous editor | Model round trips; protected profile facts; summaries, skills, achievements, project keywords and letter text; paragraphs, bullet text, line breaks, rich paste normalization, selection navigation and undo/redo. |
| Drafts and rewriting | Autosave/reload; typing during export; document/job switches; failed exports including empty letters; concurrent drafts; manual edits during regeneration; late rewrites keep newer typing and remain undoable. |
| Exports and activation | Download flushes current text into PDF and Word; extracted text and tailoring metadata survive; exact PDF proof; legacy template upgrades; application uploads; material completion during Autofill only affects later runs; provider-error recovery retains correct document references. |
| Responsive/accessibility | 1440px desktop, 900px compact and 390px narrow; page overflow; usable canvas under long labels; dock sizing; keyboard focus/tab behavior; reduced motion; local loaded dashboard and document fonts. |
| Failure/recovery | Profile snapshot and materials-list startup failures have working Retry; save/export failures retain manual text; overflow preserves all content and names the page target; cancellation keeps previous documents. |

## Reproduce the scoped checks

```sh
node --test --test-concurrency=1 \
  tests/unit/profile-storage.test.js tests/unit/profile.test.js \
  tests/unit/migration.test.js tests/unit/materials-session.test.js \
  tests/unit/materials.test.js tests/unit/materials-ai.test.js \
  tests/unit/materials-editor.test.js tests/unit/materials-library.test.js \
  tests/unit/materials-export.test.js

npx playwright test tests/e2e/workspace.spec.js tests/e2e/shell.spec.js \
  tests/e2e/materials-editor.spec.js tests/e2e/materials.spec.js \
  tests/e2e/materials-templates.spec.js tests/e2e/migration.spec.js \
  tests/e2e/visual-system.spec.js

npx playwright test tests/e2e/workday-prompts.spec.js \
  tests/e2e/workday-parsed-rows.spec.js \
  --grep 'Workday reconciles|options save legal|profile autofill'

node tools/verify-firefox-materials.js
```

All nine targeted unit files pass. The unit runner reports file-level tests; this is not a claim of nine individual model assertions. Browser runs use one worker, following the feature branch's targeted-testing instructions.

## Packaging and visual inspection

Chrome ZIP and Firefox XPI builds package the editing engine, PDF.js worker, Geist/Geist Mono, CMU/Charter document fonts and their licenses locally. Checks cover archive integrity, required page assets, current source/build hashes, extension CSP, synchronized package/lock/manifests/site version metadata and local script/stylesheet references.

Screenshots are generated by `workspace.spec.js` into ignored `scratch/saas-preview`. The gallery covers Profile overview and open sections with a dirty dock, populated/empty application libraries, Prepare and Edit at desktop/compact/narrow widths. Representative desktop and narrow captures were inspected visually, including the repaired save-control geometry and long-label layout. Captures disable animations to show settled states; an additional assertion verifies the narrow dock is centered. All three capture-producing cases pass on v0.5.104.

## Practical limits

This is targeted application-workspace QA, not a full repository/ATS suite. PDF layout, fonts and extracted PDF/Word text are checked; native Microsoft Word rendering was not opened. The real browser smoke uses the installed versions above; minimum supported Chrome 110 and Firefox 115 binaries were not available for execution. Live provider latency, quotas and errors are exercised through controlled fixture responses.
