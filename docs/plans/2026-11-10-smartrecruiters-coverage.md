# SmartRecruiters coverage inventory

Development inspection: 2026-11-10. Reference: [Simplify research](simplify-research.md) and [public configuration](https://sabre.simplify.jobs/?v=2.4.5) (`v=3.1.6` returns the same bytes). Response size: 44,169,174 bytes. SHA-256: `1bc5a79421806fe6dcc4e48fd1eb93c5d81d42e38870603ce3c4deb10bcb162b`. `ATS.SmartRecruiters.inputSelectors` contains 25 entries. Recipes are authored locally in `src/core/adapters/smartrecruiters.js` and `smartrecruiters-sections.js`; no runtime configuration fetch or execution.

## Page controls

| Configuration | Local handling |
| --- | --- |
| `urls`: `jobs.smartrecruiters.com/oneclick-ui/company/*`, `jobs.smartrecruiters.com/*/*` | Adapter detection by hostname. |
| `applyButtonPaths`: `a.js-oneclick[href*=/oneclick-ui/]` | `applyControl`. |
| `continueButtonPaths`: `oc-button[data-test=footer-next]` → `spl-button` shadow `button` | `continueControl`. |
| `submitButtonPaths`: `footer-submit` | `submitControl`; only clicked when Auto Submit is on. |
| `submittedSuccessPaths`: `h2[data-test=success-page-confirmation]` | `confirmation`. |
| `defaultMethod`: `defaultWithoutBlur` | Kareer's deterministic setter + input/change/blur. Blur is needed: the date picker commits `YYYY-MM` only on blur (verified live). |

## All 25 entries

| Configuration entries | Local handling |
| --- | --- |
| `first_name`, `last_name`, `email`, `email_confirm` | Stable inner ids `first-name-input`, `last-name-input`, `email-input`, `confirm-email-input`; confirm maps to `email`. |
| `city_state`, `postal_code` | `oc-personal-information` `location-autocomplete` maps to `location` (search by the city part, commit an owned option) or `postal_code` when labelled postal/zip. |
| `phone_country`, `phone_stripped` | Inside `spl-phone-field`: `Country code` select and the `tel` input. Country from the saved phone; overwrite-off keeps existing values. |
| `experience` | Row recipe: Add (`add-experience`, prepends), title/company autocompletes, location, description, From/To date pickers, current checkbox, Save (`experience-save`). |
| `education` | Row recipe: Add (`add-education`), institution autocomplete, major, degree, location, dates, Save. |
| `linkedin`, `portfolio`, `additional_url`, `behance`, `twitter`, `dribbble` | `[data-test^=web-profiles-]`: linkedin, website → portfolio, twitter. Others use generic link classification when present. |
| `resume` | `spl-dropzone[data-test=resume-upload]` only. The top `apply-with-resume-container` parser is excluded from scanning (user decision 2026-11-10, matching Simplify). |
| `work_auth`, `sponsorship` | Screening questions inside `sr-screening-questions-form`: label from the owning labelled `spl-*` host, key from shared `canonicalField`. Existing eligibility rules apply. |
| `veteran_v2`, `disability_v2`, `gender`, `ethnicity`, `hispanic` | Same screening mapping; explicit saved disclosures only. |
| `source` | Same screening mapping; Kareer keeps its LinkedIn policy instead of Simplify's Other/Job Board. |

## Rows

Repeatable rows are created from the saved profile, not from the parser:

1. Match enabled records to existing cards by title + company (experience) or institution + degree (education). Matched cards are never edited and nothing is deleted.
2. Unmatched records reuse a matching or empty open editor, otherwise click Add and wait for exactly one new editor. Work is processed in reverse because Add prepends, so the final order follows the profile.
3. Fill the bound editor (current checkbox first, dates as `YYYY-MM`), then Save and wait for the editor to close. A rejected Save leaves the editor open and bound; retries reuse it instead of adding again.

Deviation from the expansion plan: this lives in a SmartRecruiters sections module (Workday precedent) instead of new hooks in `application-sections.js`, because rows are prepended and must be saved before the next one.

Screening questions are on page 2. They are covered by fixtures and Simplify's selectors, not by a live page-2 inspection.
