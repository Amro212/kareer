# Workday Row Reconciliation Implementation Plan

**Goal:** Reuse resume-parsed and manually entered Workday rows, correct their saved profile values, and add only genuinely missing records.

**Architecture:** Extend the existing Workday section matcher and `needsFill` hook. Match all rows before creating any; use normalized exact identities, unique employer/school anchors, and dates only to resolve ties. No positional or AI matching, deletion, reordering, or generic coordination framework.

**Tech stack:** JavaScript, existing native DOM actuators, Node unit tests, Playwright with the real MV3 extension.

## Accepted design

The user chose to preserve unmatched populated rows, correct matched rows, and allow a unique employer/school match despite an incorrect title/degree. Review ties instead of adding duplicates.

1. Read committed row values, not prompt search text. Normalize Unicode, whitespace, and case; retain existing narrow option aliases.
2. Resolve mutually unique complete identity matches before partial matches. For jobs use company/title; education institution/degree. For repeated identities, use matching start/end date components to disambiguate. An incorrect date does not reject an otherwise unique match.
3. After stronger matches are reserved, accept a unique employer/school pair even if title/degree disagrees. Accept a unique partial identity when other identity values are absent, not conflicting. If plausible associations remain tied, stop before any Add in that section.
4. Reuse unassigned empty rows only after matching; create genuinely missing rows through the existing bounded Add mechanism. Preserve unmatched rows and blank profile values, including with overwrite enabled. Rebuild bindings on each run so disabled or removed records stop owning page rows.
5. Bind each row to its record plus original identity values. A rerender may retain either the parsed identity or corrected saved identity; an unrelated external identity edit invalidates the binding. Never use an index alone as identity.
6. Compare saved row values through the existing `needsFill` hook, including wrong populated text, committed choices, numeric date components, and explicit checkbox false. Set current-job dependencies before rescanning dates. Verify with existing actuators.

## Execution

1. Add failing unit regressions to `tests/unit/workday.test.js`: wrong date/title/degree, stronger matches before partial rows, repeated roles with date tie-breaks, ambiguous rows before Add, rerender/retry, false checkbox, blank values, and unmatched rows.
2. Run `rtk proxy node --test tests/unit/workday.test.js`; confirm failures concern the reported behavior.
3. Modify `src/core/adapters/workday-sections.js` and `workday-fields.js`, plus the three existing consumer target filters only where needed to respect row decisions with overwrite enabled. Run targeted unit tests.
4. Add an explicitly synthetic parsed-row fixture and E2E spec using existing extension test helpers. Verify correction in place, preserved unmatched rows, one missing record, and no extra Add on retry/rerender. Include education, current-job dates, disabled records, and ambiguity. Exact live tenant acceptance requires the user's Debug -> Save page fixture capture; none has been supplied.
5. Build through `rtk npm run build`, run mandatory `rtk npm test` and `rtk npm run test:e2e`, inspect `rtk git diff --check`, and update `CONTEXT_AND_FINDINGS.md` with results and remaining live-capture limitation.

Work stays in the user's current `workday` branch. Single-agent execution; no publishing or branch changes.
