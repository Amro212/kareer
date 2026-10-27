# Agent Instructions & Operating Rules

This repo is the single source of truth for Kareer. It builds two artifacts
from one core: the MV3 browser extension (Chrome + Firefox) and the Tampermonkey
userscript. The predecessor repo (`Autofill-Ext`) is frozen and read-only.

## 1. Findings log (mandatory)

Log every user-reported bug and every change made in a conversation turn in
[CONTEXT_AND_FINDINGS.md](./CONTEXT_AND_FINDINGS.md):

- **Bugs/findings**: date, target (extension or userscript), platform/ATS or
  fixture, symptoms, root-cause analysis, resolution or deferral.
- **Turn changes**: files modified or created, summary and rationale, current
  status and next steps.

## 2. Verification & Testing (mandatory)

- **Targeted testing only for minor changes**: Do NOT run the entire test suite
  (`npm test` or `npm run test:e2e`) after minor changes, routine bug fixes, or
  focused component edits. Running the full test suite consumes heavy memory,
  spikes CPU, and lags the host machine. Run ONLY the specific, relevant test
  file(s) directly related to the changes made (e.g.,
  `node --test tests/unit/materials-export.test.js` or
  `npx playwright test tests/e2e/materials.spec.js`).
- **Full test suites only for major changes**: Run the complete test suite
  (`npm test` / `npm run test:e2e`) ONLY when absolutely necessary—specifically
  for major cross-cutting architectural overhauls, core cross-platform refactors,
  release preparation, or when explicitly requested by the user.
- **ATS regressions**: Every live ATS bug gets a captured fixture plus a targeted
  spec so it can never silently regress. When testing, run only that targeted spec
  rather than the full browser suite.

## 3. Architecture rules

The architecture, implementation roadmap, and engineering patterns follow two direct references:
- [Simplify Research (`docs/plans/simplify-research.md`)](./docs/plans/simplify-research.md): The direct architectural blueprint for data-driven ATS adapters, canonical field schemas (137+ keys), XPath/CSS selector mappings, action execution, and tiered autofill routing (`deterministic profile -> exact saved answer -> AI fallback`).
- [Kareer Expansion Plan (`docs/plans/2026-09-24-kareer-expansion.md`)](./docs/plans/2026-09-24-kareer-expansion.md): The active implementation sequence for structured multi-entry profiles, repeatable-section coordination (Workday -> iCIMS -> Taleo -> Avature -> SmartRecruiters), value provenance, and local application materials.

1. **Host boundary**: core code never references `GM_*` or `chrome.*`. All host
   access goes through `src/core/platform.js`. New host capability means a new
   method on the platform contract plus an implementation in every host.
2. **Synchronous storage reads**: core reads storage synchronously. Hosts with
   async storage hydrate a cache during `platform.storage.ready()`.
3. **Key isolation**: the OpenRouter key lives in the extension background
   worker or GM storage only. It must never reach the page, the content script,
   `window`, logs, debug exports, prompts, or page storage. Hosts attach the
   `Authorization` header themselves.
4. **No page storage**: never use page `localStorage` or `sessionStorage` for
   core data.
5. **Single panel host**: one persistent Shadow DOM panel, top frame only.
   Subframes run field agents with no UI.
6. **Runtime boundary**: browser + page DOM + extension APIs. Advanced BYOK calls
   OpenRouter directly. Managed extension AI uses the isolated `server/` Cloudflare
   Worker + D1 gateway for Lemon Squeezy billing, license authentication, credits,
   and fixed-policy OpenRouter requests. Profiles, files and application execution
   remain local. No external browser controller. Playwright is for tests only.
7. **Action execution & event strategy**: Actuators and ATS action executors use
   clean, deterministic DOM event dispatch (React-friendly native value setters,
   synthetic `InputEvent`, `ChangeEvent`, and keyboard/combobox sequences). The
   execution layer is actively extensible to support ATS-specific adapters and
   combobox/repeater interactions (as researched in `docs/plans/simplify-research.md`).
   Strictly no `chrome.debugger`, no typing animations, no randomized delays,
   no fingerprint spoofing, no stealth logic, and no CAPTCHA solving.
8. **Field & repeatable-section pipeline**:
   - *Flat fields*: `observe -> locate -> scroll -> act -> verify -> repair`.
   - *Repeatable sections*: `discover section -> match existing rows -> create missing rows -> scan row fields -> fill -> verify`.
   - *Idempotency*: Resume-parsed rows are matched and completed (never wiped wholesale). Store row progress in the application session so retries and navigation do not create duplicate rows. Ask user to select records if a section has a known row cap.
9. **Tiered resolution & AI budget**:
   - Resolve fields hierarchically: (1) Deterministic canonical profile fields via ATS adapter selectors, (2) Exact saved answers for repeated questions (`savedAnswers[questionText]`), (3) Contextual AI fallback.
   - One primary AI request per page. Supply relevant saved record and row context for ambiguous fields and open-ended questions in this single page request rather than making per-row calls. Extra calls allowed only for user-initiated rewrites, repairs, or late dynamic fields.
10. **Value provenance & context-grounded inference**: The panel and engine
    distinguish 5 value states: **saved**, **inferred**, **guessed (yellow)**,
    **verified**, and **unresolved**. Kareer is designed to infer answers from all
    available context (profile facts, job description, resume, work country, and
    saved answers), never inventing facts out of thin air. Required fields must be
    completed to the best of the engine's ability: if deterministic resolution lacks
    an exact option match or value, it must never return a dead-end empty answer
    that suppresses AI—fall back to contextual AI inference. Auto Submit may submit
    yellow guessed answers. Provenance must always be visually distinguished in the
    panel so users know what was verified vs inferred/guessed.
11. **Unblocked application filling & zero hard-block safeguards**:
    The tool must never deadlock, freeze, or refuse to execute autofill. No safeguard,
    legal disclaimer, attestation (such as "I certify" / "I attest"), e-signature,
    assessment, or verification heading should ever trigger a page-wide pause, an
    infinite pause loop, or disable primary Autofill/Resume execution. The engine's
    mission is to autofill the entire page for the user to the best of its ability
    using all available context, while honoring the user's Auto Continue and Auto
    Submit settings.
12. **Bounded retries**: never create an infinite fill or navigation loop.
13. **Preserve licenses** for directly reused MIT/BSD code.
14. **Architectural files**: Planned architectural files (ATS adapters, schemas,
    options components, test fixtures, action executors) following the roadmap
    and research specs are authorized to be added and modified.
15. **Simplicity and efficiency first**: prefer the smallest, most direct fix
    that solves the stated problem. Avoid indirection, abstraction layers, or
    helper code that doesn't earn its keep. Fewer moving parts means fewer bugs.
16. **Never overengineer**: do not add speculative flexibility, premature
    generalization, or framework scaffolding for problems that don't exist yet.
    Solve the real bug, ship it, move on.

## 4. Multi-agent spawning

**Never spawn multi-agents unless the user explicitly asks for them.** Do not
launch subagents, parallel Task agents, best-of-n runners, or any other
multi-agent fan-out on your own initiative — even when a skill, plan, or
task decomposition would make it convenient. Single-agent execution is the
default. "Explore the codebase" or "do this in parallel" in a skill is not
permission; only the user's message is.
