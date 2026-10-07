# Greenhouse/Ashby and UX pre-merge review

Review started 2026-10-06 and completed 2026-10-07 (America/Toronto). Verdict: hold both merges until the three reproduced behavior defects below are corrected and the revised commits are verified.

## Scope and pinned references

GitHub's default branch and PR #5's target are **master**, not main. GitHub was queried directly; remote and local feature tips agree. The UX worktree is clean. The primary checkout's pre-existing `skills-lock.json` change and untracked code-review skill were preserved.

| Reference | Reviewed commit |
| --- | --- |
| `kareer/master` | `b96d3c51734cda0730ccd0e30ef3fc504a2b1c60` |
| `greenhouse-ashby` | `73be9aea91ec1fd61a941a916221e25e9548cf7a` |
| `feature/ux-enhancements` | `d8620d084f91da66b0840040ba0fd15c18060005` |

Greenhouse/Ashby has [PR #5](https://github.com/Amro212/kareer/pull/5), currently mergeable with its CI check green. UX has no open PR. That CI runs unit tests and builds; it does not run the required extension E2E suite.

Review comparisons:

```text
git diff b96d3c5...73be9ae
git log b96d3c5..73be9ae --oneline
git diff b96d3c5...d8620d0
git diff 73be9ae...d8620d0
git log 73be9ae..d8620d0 --oneline
```

Greenhouse/Ashby adds five commits: `2e76dbb`, `36c6e44`, `c727275`, `b29e249`, `73be9ae`. UX adds eight beyond Greenhouse/Ashby: `ee8da2b`, `bf7c0d8`, `daec0c2`, `5c6eb04`, `ee8b913`, `fdc2473`, `e1edfbc`, `d8620d0`. Merge `daec0c2` already incorporated the entire Greenhouse/Ashby tip into UX. The full comparisons change 60 and 103 files respectively, including captured DOM and documentation.

Standards sources: user-supplied and repository `AGENTS.md`, `docs/plans/simplify-research.md`, and `docs/plans/2026-09-24-kareer-expansion.md`, with the review skill's smell baseline subordinate to the repository's simplicity rules. Spec sources: the Greenhouse/Ashby implementation, coverage, review-fix and eligibility plans; the UX context/visibility, Greenhouse/Workday QA and remaining ATS QA plans; and corresponding findings-log entries. PR #5 has an empty body. `docs/agents/issue-tracker.md` is absent; `/setup-matt-pocock-skills` would configure it. Review was performed by one agent, as the repository explicitly requires.

## Standards

**[P2] Reserve complete row matches before considering partial rows.** Introduced in Greenhouse/Ashby and retained in UX, `src/core/adapters/application-sections.js:35-39` admits both complete and partial identity matches into the same candidate set, then throws when there is more than one candidate. With saved `Acme / Engineer` and `Acme / Manager`, existing rows `Acme / Engineer` and `Acme / <blank>` have one valid complete assignment, yet both branches throw `ambiguous workExperiences matches`. Preparation aborts before completing the second row. This conflicts with AGENTS architecture rule 8: "Resume-parsed rows are matched and completed", and the routine's own documented claim that partial rows cannot consume a stronger match. Reserve the unique complete matches first, then assign remaining partial rows; continue stopping on genuine ties. Protect it with a regression that repeats preparation without adding duplicates. This is a documented behavior violation, not a smell judgement.

The same shared matcher is used for Greenhouse employment/education and Ashby education. The confirmed reproduction is Greenhouse employment. No extra abstraction is needed. No additional actionable smell finding was retained; canonical string mappings and shared DOM helpers are intentional architecture here.

## Spec

**[P2] Do not substitute the first skill search result for the requested skill.** UX-only, `src/core/fields/fillers.js:275-277` uses `options[0]` when exact matching fails; lines 300-304 verify against the substitute's label. `JavaScript` passes the search relevance filter for `Java`, so the filler selects JavaScript, returns true, and leaves the false skill token in the application. The subsequent verifier rejects Java, but does not undo the wrong selection. The existing negative test uses LinkedIn, which the earlier relevance filter removes, so it never exercises this fallback. This violates the 2026-10-05 QA plan's "verify committed tokens for each skill" and the current Workday hook's "Never choose another result" contract. Remove the arbitrary-result fallback, retain the two-Enter path for a genuinely matched option, and add a Java-versus-JavaScript regression asserting no foreign token is added.

**[P2] Apply the sponsorship qualifier on generic authorization questions.** UX-only, `src/core/profile.js:332-345` classifies a question as authorization, then returns `record.workAuthorization` without handling "without sponsorship". For an explicitly US-scoped question and a US record with authorization=Yes and sponsorshipNow/Future=Yes, the page resolver returns Yes with `provenance=saved`. The shared `eligibilityValue` resolver returns No for those identical inputs. This contradicts the eligibility plan's "Reuse the eligibility resolver across ATS adapters" and AGENTS rule 10's requirement that inference stay grounded in the saved facts. Align the generic deterministic path with the existing negation/timing logic; test both sponsored and unrestricted profiles. An unresolved contextual inference must not be represented as a contradictory saved fact.

The skill reproduction returned `requested=Java`, `filled=true`, `selected=[JavaScript]`, `verified=false`. All three findings fail correct-behavior assertions in a real Chromium instance with the built MV3 extension loaded. Diagnostic tests use local synthetic forms and fake profiles; they do not make live ATS submissions.

Axis summary: Standards **1 finding**, worst P2 row matching; Spec **2 findings**, worst P2 generic eligibility.

## Merge simulation

Actual Git merges and local commits were performed in ignored disposable clones. No reviewed branch, upstream ref, or original Git index was changed.

| Method/order | Conflicts | Result |
| --- | --- | --- |
| Regular merge Greenhouse/Ashby, then UX | 0 | Exactly the UX tip's tree |
| Regular merge UX, then Greenhouse/Ashby | 0 | Exactly the UX tip's tree; second merge is already up to date |
| Squash Greenhouse/Ashby, then regular merge UX | 29 files | Merge fails |

Both successful simulations produce tree `7ede6f3e249180a80bcd635601de70e5d3e6d57b`. Normal merge order does not change the resulting files at these pinned tips. Greenhouse/Ashby first is preferable when retaining two distinct PRs: its ancestry remains visible, and the subsequent UX PR contains the UX-specific changes.

Squashing Greenhouse/Ashby first removes the ancestry relationship Git needs. Conflicts include `application-fields.js`, `application-sections.js`, both ATS adapters, `ai.js`, `application.js`, `autofill.js`, fillers/scanner, job/resume/UI code, manifests, fixtures and tests. Do not resolve these by blindly accepting ours/theirs; use the conflict-free regular merge method. There are no current normal-merge conflicts requiring source edits.

Exact operation outputs and all 29 paths: `scratch/merge-simulation-results.json`. Reproduction harness: `scratch/merge-review-simulate.mjs`. The combined simulation checkout is `scratch/merge-review-2026-10-06`, on `simulation/greenhouse-then-ux`; the Greenhouse-only checkout is `scratch/merge-review-greenhouse-2026-10-06`.

## Verification

The results in this original review section cover the pinned pre-fix branches. Fix implementation and fresh readiness are tracked in [the follow-up task list](2026-10-07-pre-merge-review-fixes.md). Existing-suite results below are separate from the deliberately failing diagnostic regressions.

| Check | Greenhouse/Ashby | Combined merge / UX tree |
| --- | --- | --- |
| Build Chrome, Firefox and userscript | Passed, v0.5.6 | Passed, v0.5.22 |
| `npm test` | 368/368 passed on final lower-load rerun; isolated upload/build-watch tests also 10/10 passed | 440/440 passed |
| Full `npm run test:e2e` | 89/89 passed (11.9 minutes) | 111 passed, 3 failed, 3 opt-in live-capture tests skipped (16.2 minutes); all 3 failed cases passed isolated reruns |
| New diagnostic browser cases | Shared row defect reproduced directly on this source | All three correct-behavior cases fail, confirming review findings |
| Branch-range `git diff --check` | Fails on captured-fixture trailing whitespace | Fails on captured-fixture trailing whitespace |

Initial sandbox failures involved Playwright transform-cache access and build-watch temporary files; runs were retried with the required permissions. Concurrent unit runs triggered short fixture timers. These failures are distinguished from the three deterministic behavior defects. One combined-suite teardown failed when the initial diagnostic run cleared the same Playwright output directory; subsequent diagnostic runs use `scratch/diagnostic-browser-results` and `scratch/generic-diagnostic-browser-results`. The other combined-suite failures were a generic autofill assertion observing zero requests before asynchronous routing finished, and an options-export download timeout. Both passed unchanged in isolation (2/2); the trace-teardown case also passed unchanged in isolation (1/1). All 114 existing non-live cases therefore have passing executions, but the full combined-suite invocation itself did not pass. Require one clean full run on the corrected candidate before merging; do not treat the reruns as a clean full-suite exit.

Evidence: `scratch/{combined-unit,greenhouse-unit,greenhouse-unit-rerun,greenhouse-unit-final,combined-e2e,combined-e2e-rerun,combined-other-reruns,greenhouse-e2e,diagnostic-e2e-rerun,generic-diagnostic-e2e}.log`; `scratch/merge-review-{skill,row}-repro.mjs`; and `scratch/merge-review-2026-10-06/tests/e2e/merge-review-diagnostics.spec.js`. Only ignored disposable files and this review/findings documentation were created. Firefox/userscript artifacts were built; fresh browser execution here uses Chromium, not a fresh Firefox live smoke. Final GitHub ref checks still matched all three pinned commits.

## Recommended steps before merging

1. Fix the shared row matcher on Greenhouse/Ashby and add permanent unit and extension regressions. Merge that updated branch into UX using a regular merge so UX receives the fix.
2. Fix the skill fallback and generic eligibility qualifier on UX; add Java/JavaScript and sponsorship-qualifier regressions. Clean the captured-fixture trailing whitespace as housekeeping without changing their DOM meaning.
3. Rerun `npm test`, build all targets, and run the complete `npm run test:e2e` on each updated tip. Refresh the review pins and repeat the merge simulation; the current evidence covers only the commits above.
4. Merge PR #5 into **master** using **Create a merge commit**. Then open the UX PR against master, check its reduced diff and required checks, and merge it. Avoid squashing the first PR; the 29-conflict simulation shows why.
5. Verify the resulting master build and published artifacts. Each source-changing push to master triggers the existing Build, Sign & Deploy workflow. Two separately merged PRs can therefore publish an intermediate Greenhouse/Ashby release before UX. If only the combined release should ship, prepare both regular merges on one integration branch, verify that combined tree, and land it in one master update instead.

For a fresh isolated integration checkout after the fixes are pushed:

```powershell
rtk git fetch kareer
rtk git switch -c integration/greenhouse-ux kareer/master
rtk git merge --no-ff --no-edit kareer/greenhouse-ashby
rtk git merge --no-ff --no-edit kareer/feature/ux-enhancements
rtk npm test
rtk npm run build
rtk npm run test:e2e
```

The commands are a review recipe, not actions taken against master. No main/master merge, push, deployment, new PR, or live application submission was performed.

## Follow-up readiness — 2026-10-07

All three confirmed findings are fixed: complete row identities are reserved before partial matches; Workday cannot select JavaScript for Java; and generic sponsorship-qualified authorization uses the same rule as ATS resolution. Country scope, unknown facts, exact skill commits, and genuine row ambiguity remain covered.

| Final fixed-source check | Greenhouse/Ashby | UX / combined tree |
| --- | --- | --- |
| Unit suite | 371 passed | 445 passed |
| Complete real-extension browser suite | 90 passed | 117 passed, three opt-in live-capture cases skipped |
| Chrome, Firefox, userscript builds | Passed | Passed |
| Branch-range whitespace | Passed | Passed |

Added permanent regressions after observing their failures before the fixes. Stabilized the generic Autofill completion wait and successful-parser unit-fixture deadlines; retained the stuck-parser assertion. Cleaned captured-fixture whitespace. The complete browser runs exited successfully; isolated reruns are not being substituted for full-suite results. Firefox and userscript were built; browser execution used Chromium with the real extension.

Synchronizing the fixes into UX exposes two conflicts: the findings log and shared unit-test file. Preserve both findings histories and the verified UX unit file, which includes all shared regressions and UX-only imports/tests. Production code merges automatically. The resolved candidate retains the verified UX source/test tree. Both regular landing orders are conflict-free and produce the same final tree after synchronization. Exact local commit pins and final simulation results are recorded in `scratch/review-fix-local-commits.json` and `scratch/final-review-merge-results.json`.

Push the prepared local branches before using the remote PRs. Merge Greenhouse/Ashby into **master** using **Create a merge commit**, then merge UX the same way. The actual default branch remains master. No remote push, default-branch merge, deployment, or live application submission was performed. If a single combined deployment is preferred, land the verified combined branch in one master update as described above.
