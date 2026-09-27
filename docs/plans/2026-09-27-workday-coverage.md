# Workday adapter implementation and coverage

This implementation hardens the reported Enter-only search bug and the Workday field families observed in the public configuration. It uses local adapter code and existing scanner, filler, verifier, profile, and session interfaces. It does not download Simplify's configuration at runtime or introduce an action-executor framework.

## Evidence

- Architectural reference: [Simplify research](simplify-research.md).
- Public configuration: [sabre.simplify.jobs, v2.4.5](https://sabre.simplify.jobs/?v=2.4.5), inspected on 2026-09-27. The `ATS.Workday.inputSelectors` array contains 44 entries, including nested repeater recipes. Snapshot SHA-256: `ab121f97d114831ece64573b6f4563f929c25b45e9ddf63530e0824066ba3d4b`.
- User-provided debug log: source and country-phone-code prompt searches never exposed options without Enter; selected chips were not always understood; repeated scans filled the 100-entry debug buffer. A log alone cannot establish every DOM variant or the precise CBC React implementation.
- Regression fixtures are **synthetic**. `fixtures/workday-prompts-fixture.html` reproduces the reported interaction. `fixtures/workday-fields-fixture.html` inventories representative public selector variants. Neither is a captured CBC application.

## Implementation

- `workday-fields.js` maps known Workday controls to profile or bound record keys. Explicit legal name parts take priority. Splitting an older full name produces a yellow guessed value. Phone country and national number come from bundled `libphonenumber-js/min`; residence is only a default for national phone input. A conflicting explicit phone country remains unresolved. Missing optional disclosures are left unanswered.
- `workday.js` owns popup attribution, Enter search, committed chips, exact source aliases, known source groups, bounded virtual scrolling, checkbox-choice groups, accepted upload items, validation messages, and navigation selectors. Query text and attempted clicks are not enough to verify a prompt selection.
- `workday-sections.js` binds experience, education, language, and website rows to saved records. It matches existing identity values, completes parsed rows, reuses empty rows, adds only missing records, and never deletes or reorders user rows. Session or host storage persists associations. A changed identity invalidates the binding. Ambiguous matches, disabled Add buttons, duplicate record IDs, and row limits stop for review.
- Country, preferred-name checkbox, and current-job checkbox are applied before primary discovery. Dependencies must settle within three seconds. Each Add waits for a single new row for at most five seconds. Virtual or group discovery allows at most 20 advances within the existing menu timeout.
- Known values resolve before AI. Exact profile `savedAnswers[questionText]` and existing workflow answer memory remain available. Unresolved Workday questions share one primary page request, including record context and writing instructions; no separate narrative editor pass runs. Search results for Workday resolve locally without another AI request. Existing bounded workflow repair and late-field requests remain.
- Manual filling, workflow filling, and frame agents use the same Workday hooks. Workday can fill known profile fields without an API key. Existing values are preserved unless overwrite is enabled; missing multi-value tokens are completed without removing existing tokens.
- Workday text and date-part verification compare the expected value. Prompt verification requires stable committed tokens before and after closing. Upload verification requires an accepted named upload item; parser waits also track pending uploads. `inputError` blocks navigation. Submit is never treated as Continue, and the existing per-step review pause remains.
- Options expose optional legal/preferred names, phone country/type/extension, birth date, address line 3, extra disclosures, and structured language records. Guessed answers remain yellow and retain their provenance through workflow memory. Scan logging emits only state changes.

## Public field inventory

The table accounts for all 44 public entries. This is field-family coverage, not proof of every tenant layout, locale, or future Workday version. Calendar icons are auxiliary controls: the adapter fills segmented inputs rather than opening a date picker.

| Public entries | Local resolution and mechanics | Automated evidence |
| --- | --- | --- |
| `resume` | Stored resume, accepted upload item, parser wait | Inventory discovery; accepted-item verifier unit regression; existing real upload E2E |
| `country` | Saved residence; exact owned choice; dependency preparation | Inventory, dependency unit regression, Workday dropdown E2E |
| `first_name`, `last_name`, `middle_name`, `full_name` | Explicit legal parts/full name; guessed split fallback | Inventory; no-AI resolver unit; prompt E2E |
| `preferred_name`, `preferred_last_name` | Preferred checkbox dependency, revealed preferred inputs | Inventory; dependency implementation; options E2E for optional identity persistence |
| `email` | Explicit email, including `textInput.email` variant | Inventory |
| `phone_type`, `phone_stripped`, `phone_country`, `phone_extension` | Optional saved type/extension; parsed national number and phone country; Enter prompt | Inventory; parser unit regression; UK-phone/Canada-residence prompt E2E |
| `state`, `address`, `address_2`, `address_3`, `city`, `postal_code` | Saved address components; country-first preparation | Inventory; dependency regression; exact text rejection regression |
| `experience` | Bound title/company/location/current/description/start/end components | Inventory; parsed-row, ambiguity, row-cap, replacement, identity-change units; repeat-run E2E |
| `highestDegree`, `education` | Saved highest level; bound institution/degree/field of study/GPA/year components | Inventory; repeater matching uses exact values and narrow aliases |
| `skill` | Saved array; repeated grounded search; preserve existing tokens | Inventory; array fill/verify unit; missing-token E2E |
| `languages_text`, `language` | Existing free text; structured language/fluent/reading/writing/speaking records | Inventory; structured language options E2E |
| `websites`, `linkedin` | Separate saved LinkedIn/GitHub/portfolio records; standalone LinkedIn answer | Inventory and bound website value assertion |
| `over18` | Explicit birth date; question polarity preserved | Inventory; deterministic resolver implementation |
| `gender`, `lgbt_v2`, `visible_minority`, `ethnicity`, `hispanic`, `veteran_v2`, `armed_forces`, `disability_v2` | Explicit saved disclosures; exact labels/narrow aliases; prompt/native/declared checkbox choice mechanics | Inventory; unset disclosure and exact disability-checkbox regressions |
| `current_date_YYYY`, `current_date_MM`, `current_date_DD`, `current_date` | Today's segmented year/month/day; calendar icon ignored; legal boundary still applies | Inventory; date normalization regression |
| `birthday_YYYY`, `birthday_MM`, `birthday_DD` | Explicit saved birth-date components | Inventory |
| `source` | LinkedIn policy; Enter-only prompt, selected chips, known group paths | Inventory; Enter/no-submit, harvest/no-selection, ownership, hierarchy, committed-token units; prompt E2E |

## Acceptance and limits

The repeat-run browser regression asserts exact name, national phone number, source and phone-country tokens, preservation of a pre-existing skill, completion of a parsed experience, one missing row, zero implicit submits, zero navigation clicks, and zero AI requests. Another browser regression runs the same flow without an API key. Options persistence is verified through a reload.

Additional unit regressions cover stale global popups, owned virtual scrolling, grouped source results, required question metadata, ambiguous parsed records, row caps, framework replacement, changed row identity, wrong nonempty text, padded dates, optional disclosures, narrative/disclosure separation, multi-checkbox normalization, Workday validation messages, and accepted upload state.

Live acceptance remains outstanding: capture the reported CBC page with Debug → Save page fixture, sanitize it, and add its exact DOM replay. Also exercise actual upload/parser timing, localized tenant labels, institutions/majors that display qualifiers, and any controls that expose selection only through `promptAriaInstruction`. Those variants must remain unresolved if no stable committed value can be read. There is no honest guarantee of all future tenant fields; new layouts need a captured regression and a small adapter recipe.

Final verification results are recorded in `CONTEXT_AND_FINDINGS.md`.
