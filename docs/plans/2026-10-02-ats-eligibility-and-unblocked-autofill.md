# ATS eligibility and unblocked autofill implementation plan

**Goal:** Fill Greenhouse, Lever, and Ashby application questions from profile facts and contextual AI without keyword-based safety pauses.

**Architecture:** Reuse the eligibility resolver across ATS adapters. Deterministic answers and exact saved answers precede one page AI request; empty deterministic answers are unresolved. Remove the page boundary category and its consumers. Keep explicit user run/submit preferences, DOM verification, option ownership, API-key isolation, and bounded retries.

**Tech stack:** JavaScript core shared by MV3 extensions and userscript; node:test/JSDOM and Playwright extension tests.

The user's updated AGENTS.md rules 10 and 11 require context-grounded inference, AI fallback for unresolved deterministic answers, and unblocked filling. Work in the existing checkout to preserve and fix the uncommitted implementation.

1. Write failing tests for country aliases, negated sponsorship questions, descriptive choices, Lever job country, contextual fallback, and continued filling with attestation text.
2. Share eligibility recognition/resolution/matching, and correct empty-answer AI routing and prompts.
3. Remove boundary classification, engine/agent/panel gates, and obsolete boundary UI; update behavior tests.
4. Reproduce screenshot question labels in a local menu replay and exercise captured Ashby Sift markup. Add real-extension E2E coverage for each supported board and menu dismissal.
5. Build the artifacts; run npm test and npm run test:e2e. Log reported bugs, exact changes, verification, and any capture limitations in CONTEXT_AND_FINDINGS.md.
