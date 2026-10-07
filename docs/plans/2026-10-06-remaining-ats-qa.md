# Remaining ATS QA fixes

- [x] Reproduce actual Workday upload filename readback, synchronous FileList clearing with asynchronous acceptance, and stale failed results on retry. Fix the existing upload/verification path; preserve bounded parser waits.
- [x] Exclude Workday selectedItemList from available choices, use its real promptIcon, close only the owned prompt, and reject explicit foreign popup IDs. Preserve tokens and existing two-Enter behavior.
- [x] Inspect the live Greenhouse school catalog for university of guelph. Capture the first 100 choices and successful exact search. Search the saved institution beyond the first page before inference; reuse partial owned education rows after differently worded degree inference.
- [x] Measure multi-value verification. Eight tokens took 1979ms with sequential stability waits; one shared widget stability check takes 242ms with the same 200ms persistence requirement. Add per-field harvest/fill/settle/verify timings; no blanket timeout reduction.
- [ ] Run complete unit and real-extension browser suites, build all artifacts, record results and remaining live-runtime limits, then commit on feature/ux-enhancements.

Debug exports strip site scripts, so browser replays restore only observed search/commit/upload events. The supplied Phreesia fixture preserves accepted upload and selected pills but closes the open popup when Debug is clicked; its live results markup remains a human-QA limitation.
