# Greenhouse and Ashby review fixes

Read-only review complete. Fix only the four reported defects; preserve staged implementation changes.

- [x] Recheck host safety boundaries throughout embedded workflows, including submission countdown. Reuse the existing workflow guard; test a host attestation appearing after filling.
- [x] Resolve an exact saved answer when a canonical profile value is empty. Preserve canonical precedence, explicit disclosures, country eligibility and bound records; test text and choice answers.
- [x] Refresh empty cached canonical answers from the current profile on hosted retries. Reuse adapter resolution without another primary AI request; test saving a missing email then resuming.
- [x] Retain hidden file inputs with visible upload containers in hosted discovery. Use the existing validation visibility rule; test missing uploads and accepted resume processing in the real extension.
- [x] Run unit tests, build, full extension E2E tests and Firefox smoke; record results and files changed in CONTEXT_AND_FINDINGS.md.

Verification: `rtk npm test` **314 passed**; `rtk npm run build` succeeded at **v0.4.100** for Chrome, Firefox and userscript; `rtk npm run test:e2e` **81 passed**; actual Firefox extension smoke passed Greenhouse and Ashby. Each defect had a failing unit regression before its minimal fix. Browser submissions used local synthetic fixtures only.
