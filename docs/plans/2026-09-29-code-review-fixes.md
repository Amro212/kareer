# Code Review Fixes Implementation Plan

> **For Codex:** REQUIRED SUB-SKILLS: Use `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion` task-by-task.

**Goal:** Fix five reviewed Lever and provenance defects without changing unrelated ATS behavior.

**Architecture:** Keep fixes inside existing canonical, Lever adapter, and AI resolution paths. Add regression coverage before each production change. Run the complete unit and browser suites after each fix.

**Tech Stack:** JavaScript ES modules, Node test runner, JSDOM, Playwright.

---

### Task 1: Country- and time-aware eligibility

**Files:**
- Modify: `src/core/adapters/lever-fields.js`
- Modify: `src/core/adapters/canonical.js`
- Test: `tests/unit/lever.test.js`

1. Add failing tests for country-specific authorization and combined now-or-future sponsorship.
2. Run focused tests and confirm expected failures.
3. Resolve structured eligibility only for matching question country; combine sponsorship answers conservatively.
4. Run focused tests, `npm test`, and `npm run test:e2e`.

### Task 2: Choice-only EEO classification

**Files:**
- Modify: `src/core/adapters/lever-fields.js`
- Test: `tests/unit/lever.test.js`

1. Add failing test proving narrative disability text remains unresolved.
2. Run focused test and confirm failure.
3. Gate demographic heuristics to choice controls and widgets.
4. Run focused tests, `npm test`, and `npm run test:e2e`.

### Task 3: Trusted AI source metadata

**Files:**
- Modify: `src/core/ai.js`
- Test: `tests/unit/ats-hardening.test.js`

1. Add failing test where model returns forged source metadata.
2. Run focused test and confirm failure.
3. Stamp `source: 'ai'` after spreading model output.
4. Run focused tests, `npm test`, and `npm run test:e2e`.

### Task 4: Saved-answer fallback ordering

**Files:**
- Modify: `src/core/ai.js`
- Test: `tests/unit/lever.test.js`

1. Add failing test for saved answer behind empty deterministic result.
2. Run focused test and confirm failure.
3. Prefer usable deterministic values, then saved answers, then intentional blank results.
4. Run focused tests, `npm test`, and `npm run test:e2e`.

### Task 5: Salary period preservation

**Files:**
- Modify: `src/core/adapters/canonical.js`
- Test: `tests/unit/lever.test.js`

1. Add failing test for hourly salary period.
2. Run focused test and confirm failure.
3. Append saved salary period to deterministic salary answers.
4. Run focused tests, `npm test`, and `npm run test:e2e`.

### Task 6: Documentation and final verification

**Files:**
- Modify: `CONTEXT_AND_FINDINGS.md`

1. Record findings, changed files, rationale, and verification.
2. Run `npm test` and `npm run test:e2e` fresh.
3. Run `git diff --check` and inspect final diff for unrelated edits.

No commits. Preserve existing staged and unstaged user changes.
