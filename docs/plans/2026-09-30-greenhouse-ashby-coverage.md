# Greenhouse and Ashby coverage inventory

Development inspection: 2026-09-30. Reference: [Simplify research](simplify-research.md) and [public configuration](https://sabre.simplify.jobs/?v=2.4.5). Response size: 6,363,379 bytes. SHA-256: `64fb641e27f0af5922c78acae21fce108855147583c13148b10f7c1a44155fc7`. Counts below refer to configuration entries, including alternate selectors and auxiliary actions, not distinct questions. Recipes are authored locally; no runtime configuration fetch or execution.

## Greenhouse: all 55 entries

| Configuration entries | Local handling |
| --- | --- |
| `begin`, `wait_for_location_loaded` | Apply discovery and bounded application/menu settling; auxiliary actions, not profile fields. |
| `first_name`, `last_name`, `full_name`, `preferred_first_name`, `email`, `highestDegree` | Existing structured profile names, email, education level. Missing facts remain unset. |
| `phone_country`, `phone_stripped` | Derive country and national number from saved phone, independently of residence. Exact owned country choice; formatting verified by digits. |
| `location`, `city_state_full`, `country_location`, `country`, `city`, `postal_code` | Saved residence components; Places and React-select must commit an owned option. Compound location abbreviations use existing geographic matching. |
| `resume` | Existing stored-resume attachment; accepted filename and settled parser required. Unknown acceptance layout pauses. |
| `coverLetter` | File attachment manual. Textarea remains an unresolved narrative eligible for the existing page AI request or an exact saved answer. |
| `experience`, `education` | Existing enabled profile records; match parsed rows, reuse empty rows, then bounded Add. Canonical row identity, current-job dependencies, segmented dates, and application-scoped progress. Ambiguity, caps, unavailable Add, changed/reordered rows, or timeout stop. |
| `linkedin`, `github`, `portfolio`, `twitter`, `behance`, `dribbble`, `additional_url` | Saved links; added optional fields default unset. |
| `work_auth`, `sponsorship` | Explicit eligibility for the question/job country, or an exact saved Yes/No answer. Residence never establishes eligibility; unknown/multiple countries remain unresolved. |
| `pronouns`, `gender`, `transgender`, `lgbt_v2`, `hispanic`, `ethnicity`, `veteran_v2`, `disability_v2` | Explicit saved disclosures only; exact or narrow existing semantic aliases with one unique owned match. No implicit decline, eligibility, or demographic guessing. |
| `source` | LinkedIn when an unambiguous offered option exists; Other is not silently substituted. |
| `first_name_2`, `last_name_2`, `preferred_first_name_2` | Alternate classic/modern selectors consolidated into canonical name metadata. |
| `linkedin_2`, `additional_url_2`, `lgbt_v2_2`, `ethnicity_2`, `hispanic_2`, `veteran_v2_2`, `disability_v2_2` | Alternate controls consolidated into their canonical link/disclosure mappings. |
| `linkedin_3`, `additional_url_3`, `lgbt_v2_3`, `ethnicity_3`, `hispanic_3`, `veteran_v2_3`, `disability_v2_3` | Modern selector variants consolidated into their canonical mappings. |

The base group contains 38 entries; the three alternate groups contain 3, 7, and 7. Total: 55. Coverage includes classic Select2, native choices, modern React-select/chips, Places, EU hostnames, and application markup on custom domains. Filters, menu search controls, unrelated forms, and duplicate required overlays are excluded.

## AshbyHQ: all 27 entries

| Configuration entries | Local handling |
| --- | --- |
| `resume`, `coverLetter` | Same resume acceptance/manual cover-letter boundary as Greenhouse. |
| `first_name`, `last_name`, `first_name_preferred`, `last_name_preferred`, `full_name`, `email`, `phone` | Existing saved identity/contact fields; stable system identifiers and owning question titles. |
| `ethnicity`, `veteran_v2` | Explicit disclosures, including native radio/checkbox groups. |
| `location`, `country`, `city_state`, `state`, `city`, `address` | Existing saved address/residence; owned autocomplete selections must commit. |
| `linkedin`, `github`, `portfolio`, `twitter`, `behance`, `dribbble`, `website` | Saved optional links; no invented defaults. |
| `source` | LinkedIn only when available as one unique offered choice. |
| `current_company_name` | Exactly one enabled current work record; ambiguity stays unset. |
| `education` | Bound enabled education records, parsed-row matching, empty-row reuse, capped Add and persisted progress. Repeated tenant input IDs become distinct record IDs. |

Total: 2 + 7 + 2 + 6 + 7 + 1 + 1 + 1 = **27**. Hosted/embedded forms use the same local recipes. Visible Yes/No buttons are one question; unchecked backing input is not a second field. Conditional questions use bounded late discovery.

## Workflow and boundaries

Canonical profile resolution precedes exact question-keyed saved answers and one primary page AI request. Workday routing is retained; generic/Lever regressions remain in the suite. Known saved forms make zero AI calls. Missing disclosures remain blank; required missing values block advancement. Guessed answers retain yellow provenance and existing Auto Submit policy.

Top frame owns review, answer generation, session and submission countdown. Existing frame transport now supports `stepState`, Continue, Submit, and cancellation. States include URL, classification, full observed field signature, validation and available controls. Commands reject stale signatures and navigation validates again. Discovery retains zero-field confirmations and supports frame replacement. More than one application owner pauses. Only fixtures are submitted during tests.

Cover-letter files, other documents, unsupported/ambiguous tenant controls and explicit safety boundaries require manual action. No document-management service, debugger, stealth interaction or CAPTCHA solving is introduced. Userscript receives shared recipes and verification within its existing file/frame capabilities.

## Evidence and verification

Synthetic replay: `fixtures/greenhouse-ashby-workflow.html`, `fixtures/ats-workflow-host.html`; existing classic/modern/Ashby fixtures and unit regressions. Synthetic fixtures explicitly label their origin and keep submission local.

Live capture: `fixtures/greenhouse-promptio-captured.html`, captured through panel Debug → Save page fixture on 2026-09-30 from [Prompt.io](https://job-boards.greenhouse.io/promptioinc/jobs/4420814009). Contact fields and phone-country commit were verified without a key; live phone formatting exposed a verifier failure, repaired with a digits-preserving regression. Required missing resume/questions pause normally. No application submitted.

Acceptance tools: `tools/verify-ats-live.js` loads the real Chrome extension in a temporary profile with synthetic facts and Auto Submit disabled. `tools/verify-firefox-ats.js` temporarily seeds/probes the real Firefox extension against local forms. Test injection never reaches shipped artifacts.

Additional live captures: `fixtures/ashby-sift-captured.html` from [Sift](https://jobs.ashbyhq.com/siftstack/be082df3-225c-4269-a159-bdb362b21c8e/application), and `fixtures/ashby-cursor-embed-captured.html` from [Cursor embed mode](https://jobs.ashbyhq.com/cursor/d0e5b41d-84ab-4887-bd3a-55589b11dd7b/application?embed=true). Sift exposed accessibility-hidden sibling fields while a portal menu stayed open; Cursor exposed repeated education IDs and component date labels. Both fixes have exact captured-DOM regressions. Captures remove site scripts; browser replays explicitly add only the observed menu/formatter behavior.

Live hosted and actual cross-origin iframe checks verify saved contacts without a key, then pause at missing resume/required questions. A controlled host embeds the live HTTPS applications; it does not replace their application DOM. Hosted Greenhouse/Sift/Cursor verify 5/4/5 fields; embedded Greenhouse/Sift verify 5/4. These checks do not verify live uploads, application submission, or every tenant's Add/menu layout. Those behaviors are exercised in local real-extension fixtures. Unknown accepted-file markup remains a manual pause.

Final suite totals, build version, live hosted/embed outcomes and any remaining limitations are recorded in `CONTEXT_AND_FINDINGS.md`. This inventory accounts for the snapshot; it does not claim verification of undocumented future tenant layouts.
