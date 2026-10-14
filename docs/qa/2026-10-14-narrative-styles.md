# Narrative writing styles QA

Branch: feature/narrative-writing-styles. Base: origin/feature/resume-tailor at 7899d51, fetched and rechecked before edits.

## Behavior

Natural is the fallback and existing-user default. Options and the shared panel save one default writing style. Both show its description and illustrative wording. The field badge starts with that default and offers a local override. Choosing a style makes no request; Rewrite makes one. Changing fields resets the override. The saved preference, model selection, temperatures, structured resolution and exact saved answers retain their existing behavior.

The shared prompt retains first-person contractions, simple active verbs, sentence variation, immediate answers, specific details, punctuation restrictions, and specificity/spoken-aloud checks. It replaces the fixed male/23-year-old/engineering persona and contradictory baseline examples with one style block and two matching examples. Career facts and company evidence remain anchored; editable narratives permit the approved personal framing and anecdotal latitude. Cover-letter controls remain outside this change.

## Verified

89 relevant unit checks passed: 7 narrative-style request/persistence regressions, 4 inline badge checks, 19 panel checks, 51 autofill checks, 6 migration checks, and 2 packaging checks. Regressions were added before implementing the catalog and badge behavior. A test fixture correction supplied actual application evidence to the new panel test.

Five focused Chromium cases passed against the packaged extension and local HTTPS OpenRouter mock: all three new narrative-style cases plus the existing Options persistence and autofill credential-isolation cases. This tests the background request path and real form behavior, including current contenteditable text, 360px layout, native keyboard focus, duplicate clicks, error/retry state, saved answers, field constraints and local override isolation. The initial browser failure clicked a hidden legacy toggle; the test now uses the visible Minimize control.

Commands:

- node tests/unit/narrative-styles.test.js
- node tests/unit/inline-rewrite.test.js
- node tests/unit/panel.test.js
- node tests/unit/autofill.test.js
- node tests/unit/migration.test.js
- node tests/unit/packaging.test.js
- PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright npx playwright test tests/e2e/narrative-styles.spec.js
- PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright npx playwright test tests/e2e/shell.spec.js tests/e2e/autofill.spec.js --grep 'options page persists the key, model, and profile|the prompt carries the stored profile and no credentials'
- npm run build

The final build produces Chrome, Firefox, and userscript artifacts at v0.5.120. Package/lockfile, manifest, userscript and site versions match. Initial implementation used targeted QA under this branch's AGENTS.md. The complete suites were subsequently run at the user's explicit request, as recorded below.

## Illustrative comparisons

These ten examples are authored style demonstrations from the shipped catalog. They are not outputs of live model tests or quotations from research participants.

Technical source: the candidate built a form-filling tool after other tools failed on custom dropdowns, and made those fields work reliably.

Nontechnical source: a support coordinator found unclear ownership in request handoffs, introduced a shared tracker with an owner for each request, and reduced follow-up time from three days to one.

| Style | Describe a project | Describe a process you improved |
| --- | --- | --- |
| Natural | I built a form-filling tool because the ones I tried kept failing on custom dropdowns. Getting those fields to work reliably became the main challenge. | Customer requests were taking three days to get a follow-up because ownership was unclear. I introduced a shared tracker with an owner for each request. Follow-up time dropped to one day. |
| Warm & personal | I wanted filling out forms to feel a little less like a chore, so I built a tool to handle them. Custom dropdowns kept tripping up the tools I tried, and I enjoyed getting those details to work reliably. | I cared about customers getting a reply without having to chase us. When I found that unclear ownership was slowing requests down, I introduced a shared tracker with an owner for each one. Follow-up time fell from three days to one. |
| Quietly confident | I built a form-filling tool that handles custom dropdowns reliably. The tools I tried failed at those fields, so I focused the work there. | I introduced a shared tracker that made ownership of each customer request clear. Follow-up time fell from three days to one. Reviewing the handoffs had identified where requests were getting stuck. |
| Story-led | I tried automating the forms, then kept hitting the same obstacle: custom dropdowns. I started building a tool that could handle them. Most of the work went into making those fields reliable. | I started by reviewing why customer requests were waiting three days for a follow-up. Ownership was unclear, so I introduced a shared tracker showing who was responsible for each request. Follow-up time fell to one day. |
| Light wit | The tools I tried could fill a text box. Custom dropdowns apparently had other plans. I built a form-filling tool and focused on getting those fields to work reliably. | Customer requests were spending three days waiting for someone to own them. I gave each request an owner in a shared tracker, which was less exciting than it sounds and much more useful. Follow-up time dropped to one day. |

## Live-model acceptance still pending

This cloud environment has no configured Kareer/OpenRouter host credentials and its allowed network destinations do not include OpenRouter. No paid live-model call was made. Mock requests prove wiring and contracts, not naturalness or model-to-model consistency. The user was asked where to run this remaining QA.

When a configured host is available, use a separate test browser profile and the configured default model, retaining host-managed authentication. Generate each of the two source cases above in each style (ten initial outputs). Then rewrite the technical Natural draft as Light wit and the nontechnical Natural draft as Quietly confident (two additional outputs). Use only synthetic career data. Review naturalness, distinguishable personality, direct question coverage, continuity of career facts and measured results, and retained anti-boilerplate rules. Save the actual samples and refine/retest only affected styles. Cross-model quality remains outside the agreed default-model test scope.


## Full-suite follow-up (2026-10-14)

- Verified both origin URLs are `https://github.com/Amro212/kareer.git`. The authenticated GitHub account is `Amro212`, owns that repository and has push permission. PR #9 targets `feature/resume-tailor` and is mergeable.
- `npm test`: 554 tests passed, zero failures, zero skips (276.5 seconds).
- `PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright npm run test:e2e`: all 189 cases were considered; 184 passed, two Lever university fixture cases failed, and three explicitly opt-in live-capture diagnostics were skipped (29.9 minutes).
- The two failures predated the writing-style changes. Their page-level `route.continue()` bypassed the shared fixture server mapping in the managed cloud and loaded a proxy "Domain forbidden" response rather than the captured application. The trace and screenshot confirmed the missing form. Changed that route to `route.fallback()` so the existing shared context handler serves the local captured fixture, while unrelated production resources remain blocked. Added an early form-visibility assertion; retained all original school, GPA, hidden-field, provenance and request assertions.
- `PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright npx playwright test tests/e2e/lever-university.spec.js`: both corrected cases passed (31.9 seconds). Thus every one of the 186 runnable browser cases passed across the full run and the focused rerun. The whole browser suite was not rerun after this test-only routing fix; no production source changed in this follow-up.
- `npm run build`: Chrome, Firefox and userscript artifacts rebuilt successfully at v0.5.120 with no source/version change. Whitespace checks pass. Full suites use synthetic/local mocks; live model quality and Firefox runtime testing remain unverified.
