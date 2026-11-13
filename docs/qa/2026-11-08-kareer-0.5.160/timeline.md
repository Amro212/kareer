# Production QA action timeline

Times are America/Toronto (EST), November 8, 2026. ISO UTC timestamps and redacted UI snapshots are retained in [action-log.jsonl](evidence/action-log.jsonl). These are recorded actions/checkpoints, not every address-bar keystroke.

Corrections: record 75 overestimated elapsed loading time; record 76 corrects it. Records 82–83 describe uncertain native input observations; record 84 confirms successful recovery after reacquiring the window. The final report uses the corrected observations.

| Record | Local time | Action | Observation / purpose |
|---:|---|---|---|
| 1 | 21:51:52 | Resume QA from existing DoorDash paused state | v0.5.160; 296 credits; 26 detected; 25 answered; 13 verified; 12 inferred; zero failed; 1 untouched; multiple Submit controls warning. User confirmed education dates correct. |
| 2 | 21:52:12 | DoorDash click Rescan page fields | Retry after target-window activation; initial obscured-window click did not execute. |
| 3 | 21:52:20 | DoorDash rescan settled | READY replaces PAUSED; counts preserved; no credit consumed. |
| 4 | 21:52:26 | DoorDash run again with existing values and overwrite off | Testing idempotent re-entry after rescan; existing education row must remain one. |
| 5 | 21:52:39 | DoorDash second run settled | Inspect counts, row IDs, optional fields and repeated warning. |
| 6 | 21:52:55 | DoorDash open page Web Console | Read-only inspection; no console commands executed. |
| 7 | 21:53:09 | Zen shortcut did not open Web Console | Ctrl+Shift+K produced a Tabs Closed toast in this Zen configuration. No console evidence obtained; use visible menu actions instead. |
| 8 | 21:53:31 | DoorDash select Console tab | Read page logs without executing JavaScript. |
| 9 | 21:53:42 | DoorDash console settled | Kareer INFO field action/timing logs visible; repeated Empty string passed to getElementById warnings; red error counter 3 needs inspection. |
| 10 | 21:54:12 | DoorDash close Developer Tools | Observed page React error #418 in Greenhouse Rollbar/scheduler stack; no extension exception established. Repeated extension getElementById empty-string warnings recorded. |
| 11 | 21:56:37 | Lever open ShyftLabs Software Developer application | Baseline before fill. |
| 12 | 21:57:08 | Lever prefill joining timeline sentinel | Inserted a clearly marked synthetic test answer to check overwrite-off preservation; no submission. |
| 13 | 21:57:14 | Lever click Autofill | Baseline 296 credits, 12 fields; overwrite off; joining answer prefilled. |
| 14 | 21:57:25 | Lever running checkpoint | Check resume upload, state progression and preserved joining answer. |
| 15 | 21:57:56 | Lever final field review | READY FOR REVIEW; 12 detected, 5 fields answered, 6 verified, 0 inferred, 0 failed, 6 untouched. Resume parser populated contact/current company/GitHub; sentinel preserved. Balance 296. Pause attempt failed because run had already completed; no valid pause test. |
| 16 | 21:58:08 | Lever console settled | 14-error toolbar count; displayed security errors for Lever/hCaptcha attempting file:/// links and source-map warnings. No visible Kareer exception; attribution not established. |
| 17 | 21:58:16 | Lever close console | Additional Empty string passed to getElementById warnings from extension also appear on Lever; shared warning, not evidence of a failed fill. |
| 18 | 21:58:41 | Lever clear the temporary QA joining answer | Cleanup only; checking whether Ready for Review updates after a required value is removed. |
| 19 | 21:59:03 | Lever blur after clearing required joining answer | Checking persisted review UI after manual form edit; no Submit click. |
| 20 | 21:59:33 | Lever type a new answer using keyboard input | Confirm UIA-only set_value is not the sole reason for stale review text. |
| 21 | 21:59:48 | Lever clear required answer with keyboard | Required joining timeline empty via native key input; checking stale review state and field card. |
| 22 | 21:59:56 | Lever stale review confirmed after keyboard edit | Joining timeline is empty, yet panel still READY FOR REVIEW and its field card still shows the original QA preservation answer. Confirmed UI-state issue; submit-time validation not tested. |
| 23 | 22:00:25 | Lever save raw HTML capture | Local scratch capture for sanitization; no file uploaded. |
| 24 | 22:01:45 | Ashby Strada posting loaded | Observe job-description versus application detection before entry. |
| 25 | 22:01:53 | Ashby switch Overview to Application | Testing SPA form detection and automatic panel opening. |
| 26 | 22:02:09 | Ashby application detection settled | SPA transition opened one panel; Ashby adapter; 8 fields; READY; balance296. |
| 27 | 22:02:38 | Ashby click Pause immediately after Run | Testing pause while upload/preparation is active. |
| 28 | 22:02:55 | Ashby Resume with required transcript still absent | Previous Pause click landed after the run had already paused for missing transcript; manual active-run pause remains unproven. Resume tests bounded recovery without replacing the transcript with a resume. |
| 29 | 22:03:02 | Ashby attempt Pause during Resume | Capture the resulting reason rather than assuming manual pause succeeded. |
| 30 | 22:03:10 | Ashby retry outcome | Returns to same missing-transcript pause; no extra AI credit (295); uploaded resume and selected answers retained; transcript remains empty. Pause attempts landed after bounded run completion, so no manual pause pass claimed. |
| 31 | 22:03:21 | Ashby console settled | Toolbar error count25. Visible empty-ID extension warnings; reCAPTCHA/Ashby file:/// security messages; reCAPTCHA CSP and source-map warnings. No observed managed-AI request failure. |
| 32 | 22:04:14 | Workday Clio posting loaded | Inspect availability and application entry choices. |
| 33 | 22:04:24 | Workday click Autofill from zero-field job description | Test entry-flow navigation when panel advertises Workday Application before form entry. |
| 34 | 22:04:39 | Workday false review state confirmed on job description | Zero fields answered/detected; page remains job description with Apply entry button; panel now READY FOR REVIEW and Submit Application. No application form opened. Balance unchanged295. |
| 35 | 22:05:19 | Workday save job-description raw HTML | Capture before entering actual application. |
| 36 | 22:05:26 | Workday click site Apply entry button | Open actual entry chooser; this is not final submission. |
| 37 | 22:05:34 | Workday choose Apply Manually | Inspect whether guest application is available; do not automate authentication. |
| 38 | 22:05:43 | Workday entry route settled | Inspect current form or authentication gate. |
| 39 | 22:06:00 | Workday Pause while generating answers | Clicked Pause from RUNNING / Generating answers for9fields state. |
| 40 | 22:06:09 | Workday user pause settled | Inspect that fields do not continue filling while paused and capture current credit balance. |
| 41 | 22:06:18 | Workday Resume after user pause | Paused state stayed stable for9seconds, no fields answered, balance295; now resume same application step. |
| 42 | 22:06:57 | Workday resumed run checkpoint | Observe fill progress and progression to next step; no manual interaction with fields. |
| 43 | 22:07:23 | Workday hierarchical source prompt repair checkpoint | How Did You Hear About Us remains uncommitted while LinkedIn search text is present; inspect bounded repair result. |
| 44 | 22:07:41 | Workday source-dropdown repair outcome | Check whether two repair attempts end in a bounded pause. |
| 45 | 22:07:50 | Workday click failed source field locator | Test review-card scroll/highlight affordance and inspect the failed control. |
| 46 | 22:07:58 | Workday manually open source hierarchy | No code change; inspect top-level categories to diagnose why LinkedIn search failed. |
| 47 | 22:08:15 | Workday manually expand Job Sites source category | Inspect leaf options; manual recovery investigation. |
| 48 | 22:08:32 | Workday inspect Career Websites leaves | Job Sites leaves included Glassdoor, Great Place to Work, Grow Remote, Indeed, Other, RepVue, University Job Boards; LinkedIn not present there. |
| 49 | 22:10:34 | Workday save complete live form | HTML-only source capture yielded a shell for Workday; complete-page capture requested for actual dynamic DOM. |
| 50 | 22:11:00 | Workday manually select Job Sites then Other | Manual recovery only; original automated LinkedIn search failed. This test posting was discovered through this QA chat. |
| 51 | 22:11:12 | Workday Resume after selecting valid Other leaf | Check whether repaired manual value is accepted and auto-continue reaches My Experience. |
| 52 | 22:11:25 | Workday manual recovery settled | Observe whether next step opens; source Other was committed manually. |
| 53 | 22:11:44 | Workday click Continue to Next Step after manual source recovery | Step-review card still labels source FAILED/Empty despite committed Other and accepted validation; examine next-step transition. |
| 54 | 22:11:57 | Workday continue control settled | Record actual step transition or repeated state. |
| 55 | 22:12:23 | Workday Resume on file-only My Experience step | Step2 has one required resume upload plus optional Websites Add; panel reports Job listing detected. Test whether Resume can recover. |
| 56 | 22:13:03 | Workday save file-only step capture | Complete-page DOM capture requested before adding optional website field. |
| 57 | 22:13:20 | Workday add one optional website row | Manual diagnostic: introduce visible text input on previously file-only step. |
| 58 | 22:13:31 | Workday Resume after adding website URL control | Test whether one visible text field unblocks file upload on the same step. |
| 59 | 22:14:05 | Workday dynamic website workaround outcome | Adding visible URL field allowed Resume to start and upload My_Resume.pdf; evaluate website resolution and step review. |
| 60 | 22:14:24 | Workday Continue from My Experience | Step2 completed only after optional-website workaround: one43.53KB PDF plus three unique website rows; 4verified, no extra AI credit. |
| 61 | 22:14:50 | Workday Application Questions step checkpoint | Capture questions and current engine state after Continue. |
| 62 | 22:15:02 | Workday Continue to final Review | Step3: eligibility Yes from profile, hub commute preference inferred; one AI credit, balance293. Final submission remains off. |
| 63 | 22:15:27 | Workday final review settled | Verify no submission and inspect saved sections before backward-navigation test. |
| 64 | 22:15:59 | Workday minimize panel to reach site navigation | Panel overlays right side of form; use site Back without touching either Submit control. |
| 65 | 22:16:07 | Workday site Back from final review | Navigate backward to test preserved answers; no Submit click. |
| 66 | 22:16:28 | Workday backward navigation to questions settled | Check persisted answers and locate Back to My Experience. |
| 67 | 22:16:37 | Workday Back to My Experience | Test persistence of attachment and three URLs on step revisit. |
| 68 | 22:16:48 | Workday reopen panel on revisited experience step | Inspect restored session and row counts. |
| 69 | 22:17:13 | Workday stale final-review state after site Back | Actual step2 My Experience with 4 controls, but panel READY FOR REVIEW / Submit Application and3stepscompleted. Attachment and3URLs persisted. Saved screenshot evidence. |
| 70 | 22:17:21 | Workday rescan on revisited experience step | Testing explicit recovery from stale final-review state while preserving existing upload/rows. |
| 71 | 22:17:34 | Workday rerun revisited experience step after rescan | Expected one attachment and three website rows; check idempotency and credit usage. |
| 72 | 22:18:01 | Workday revisit rerun settled | Inspect row/attachment count, current step, cumulative counters and credit balance. |
| 73 | 22:21:34 | Workday revisit rerun verified | STEP REVIEW; 4 verified; one PDF and three URLs preserved; 293 credits unchanged. |
| 74 | 22:22:02 | SmartRecruiters posting baseline | Posting loaded; pebble minimized; no form interaction yet. |
| 75 | 22:22:22 | SmartRecruiters application loading checkpoint | Header rendered but form remains blank after roughly 45 seconds; no Run available. |
| 76 | 22:22:54 | SmartRecruiters form loaded baseline | Eventually rendered after blank header interval. 12 controls, READY, 293 credits, company unknown uncertain. Prior note timing estimate corrected: checkpoint was about 20 seconds after click, not 45. |
| 77 | 22:23:01 | SmartRecruiters Run clicked | 12 detected; generic fallback; observe repeatable sections, duplicate control detections and next-step behavior. |
| 78 | 22:23:22 | SmartRecruiters run checkpoint | 12 fields detected; inspect transient upload verification failures and duplicate City/Phone wrappers; wait for settled result before final verdict. |
| 79 | 22:24:12 | SmartRecruiters first run settled | READY/Ready to start despite Autofill complete. 22 detected; 6 fields answered; 5 verified, 2 inferred, 2 failed, 13 untouched; balance293->292. Phone initially parsed with Canada+1 and saved number; now country and number cleared, required error. Resume list still contains PDF. Education editor open with empty Institution/Degree and profile degree in Major. |
| 80 | 22:24:29 | SmartRecruiters Next attempt offscreen | Native click rejected as outside window; no Next activation claimed. |
| 81 | 22:25:35 | SmartRecruiters Next blocked | Next activated; site scrolled to empty country code/phone and displays Please provide a valid phone number. Still same form; no submission. |
| 82 | 22:26:11 | SmartRecruiters manual phone recovery | Selected Canada +1 and entered saved national number. Verify retained before retry; not changing profile settings. |
| 83 | 22:27:13 | SmartRecruiters manual phone recovery unsuccessful | Canada +1 restored. set_value and native text entry did not persist a phone value; input focus could not be confirmed reliably, so no successful phone workaround claimed. |
| 84 | 22:28:04 | SmartRecruiters phone recovery verified after window rebind | Rehydrated returned Zen window after stale cached-element error. set_value now persists full saved phone with Canada+1 and validation cleared. Earlier recovery failures were tool observation/focus uncertainty, not an additional product bug. |
| 85 | 22:28:05 | SmartRecruiters retry after manual phone recovery | Rerun with valid phone/country, existing PDF and four parsed work rows. Check preservation, duplication and credits. |
| 86 | 22:28:53 | SmartRecruiters retry settled with console errors | 292->291 credits; READY;22detected;7 fields answered;5verified3inferred2failed12untouched. Console7 errors; repeated Kareer Error filling Institution/School location: The question changed or disappeared. Scan the page again. Compiled index.js82:53940,380:1442,1797:8505. Uploads still failed. Empty-ID warnings and site file:/// security error separately. |
| 87 | 22:29:46 | SmartRecruiters final rescan and stop | Rescan without another fill; 291credits; phone Canada+1 and saved number retained; one resume;four work rows;one parsed education card plus incomplete open editor. No Next after phone correction and no final submission. Live QA concluded; no product fixes. |
