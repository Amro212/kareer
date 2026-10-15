# Resume tailoring quality implementation plan

**Goal:** Select the strongest truthful evidence for each job, give it enough detail, and retain supported skills and project keywords in PDF and Word.

**Architecture (updated 2026-10-13):** Keep profile-only generation context, one background AI request, the existing JSON model, and local exports. Let the writer select and rank records; normalize optional metadata without rejecting draft content. Display the complete generated draft without automatic text removal or page-limit rejection. Project keywords are editable in the existing section editor. No new dependency, service, or profile schema.

**Tech stack:** JavaScript, node:test, pdfmake, docx, pdfjs, Playwright.

**Status:** Implemented and built at v0.5.82. 37 focused unit checks and 20 focused materials browser checks pass; final rebuilt extension also passes the two tailoring flow checks. Synthetic PDF inspected, Word text extraction verified. No live model, native Word, real ATS scoring, commit, push or deployment.

**2026-10-13 policy correction:** The user explicitly rejects runtime content gates. The original keyword/skill evidence checks, metadata caps, unknown/duplicate ID rejection, destructive automatic page fitting, and page-limit save/rewrite rejection below are superseded. Evidence and page-budget guidance stays in the writing prompt; the user reviews the resulting draft. Renderer-compatible structure, HTTP/JSON handling, cancellation, secret isolation and stale-edit protection remain. Known source metadata stays authoritative; generated unknown sections remain viewable with unique editor IDs. Optional keyword deviations are normalized/ignored where inapplicable instead of discarding the resume.

## Research and design (2026-10-12)

- Reference PDF inspected in full (one page, text and rendered image): grouped skills, project tools next to titles, and concrete action/context/result bullets. Reference content is example data, not generation input or instructions; saved profile remains authoritative.
- [CareerOneStop work experience](https://cloudfront.careeronestop.org/JobSearch/Resumes/ResumeGuide/work-experience.aspx): select/emphasize jobs that add value, preserve chronology, describe context and outcomes, use accurate job vocabulary and transferable skills. Our 3-5 bullets for strongest entries and 1-2 for supporting entries are implementation heuristics, not a universal source rule.
- [Harvard AI guidance](https://careerservices.fas.harvard.edu/ai-resumes-and-cover-letters/): use real achievements and relevant keywords; generic AI prose is a risk. Expand only supplied facts; do not invent metrics or inflate responsibility to match a job.
- [CareerOneStop optional sections](https://cloudfront.careeronestop.org/JobSearch/Resumes/ResumeGuide/optional-sections.aspx): relevance decides inclusion; optional records need not appear just because saved.
- [Greenhouse parsing guidance](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse): text documents, clear sections and simple layouts reduce parsing risk. Keep ordinary text/paragraphs and test PDF/Word extraction; do not promise ATS scores, universal parsing, or interviews.

Decision: evidence selection plus bounded local fitting. Prompt-only changes cannot fix destructive overflow; separate retrieval/ranking calls add cost and moving parts. No hard cap on record count: accommodate sparse profiles, career changes, and one/two-page targets. Keep concise recent employment context where omission would mislead. Selected work stays reverse chronological; relevance is independent of display order.

Skills: choose saved skills verbatim or exact skill/tool phrases explicitly present in enabled source descriptions. Do not infer proficiency from a title or add a requirement merely because the job asks for it. Literal grounding is a guardrail, not semantic proof; prompt must exclude negated/aspirational mentions. Project keywords must occur in that project's source facts, not merely the global skills list. Original project titles, employers, dates, links and education remain protected.

## Execution

1. Add failing focused tests in `tests/unit/materials.test.js` for source selection, project keyword grounding, relevance validation, description-backed skills, legacy/manual compatibility and targeted rewrite preservation. Add exporter tests for keyword title placement, lower relevance removal despite chronology, and skills retention under overflow.
2. Update `src/core/materials-model.js`: validate optional relevance (1-3), optional project keywords, and source-grounded skills; preserve original display facts and selected subset. Reuse existing targeted rewrite merge.
3. Update `src/targets/extension/background/materials.js`: explicit requirement analysis, evidence selection, unequal detail budgets, accurate keywords, concise summary and self-audit in the existing request. Keep letter behavior and secret isolation.
4. Update `src/targets/extension/materials/export.js`: display project keywords beside source title in shared PDF/Word blocks; fit weaker records before strong bullets, retaining skills, one substantive entry and education. Bump template version for saved export migration.
5. Run only relevant unit files, targeted materials template/workspace browser checks, and extension build. Inspect a rendered synthetic export; log changed files, evidence and limitations in `CONTEXT_AND_FINDINGS.md`. No commits or release changes required; preserve existing staged work.

## Verification limits

Mocked AI responses verify transport and validation, not model editorial judgment. No interview/ATS guarantee or source-free expansion. Live model generation, native Word layout and real employer parsers require separate evidence.
