# Kareer website redesign: approved design and implementation plan

**Goal:** Replace the public site with the user-approved “paperwork with attitude” direction, a working fictional autofill demonstration, a matching privacy page, and a focused setup guide.

**Architecture:** A separate React/Vite multi-page website in `site/`, with static output in `site-dist/`. Keep the extension package and runtime untouched. Build the website after the existing Firefox asset synchronization, preserving the custom domain, verification file, version feed, update feed and signed download paths.

**Tech stack:** React, TypeScript, Vite, Tailwind v4, genuine Cojeev registry components, Motion for React (already used by Cojeev). Single-agent execution, per the user's repository instructions. Execute directly in this session; no extra approval or separate session is needed.

## Approved brief

- Audience: exhausted repeat applicants, especially students and new graduates.
- Positioning: job hunting already costs time, money and energy; remove repetitive application work. Playfully fed-up voice, humor directed at the process.
- Hero: “Job hunting takes enough out of you.” Primary action: Try the demo. Secondary: Get Kareer.
- World: warm off-white paper, ink-black oversized tightly-set sans-serif headings, electric lime, precise grid, controlled tilted paperwork, annotations and stamps. Existing mark remains recognizable.
- Demo: fictional sample application, click Autofill, fields fill, inspect saved versus inferred answers, replay and install. No real applicant data, AI requests, submission or API key.
- Motion: use existing Cojeev components first. One expressive hero sequence, responsive hover/press feedback, restrained supporting entrances. Honor reduced motion and avoid perpetual loops.
- Exact settings: `setMotionMode("subtle")`; `setFlowSettings({variant:"comet",hover:true,speed:0.85,intensity:1.75,hoverStrength:0.75})`.
- Structure: hero/demo → concrete autofill benefits → tailored documents → setup/cost → privacy → FAQ → closing install action. Setup disclosure sits beside the demo's install action too.
- Pages: `/`, `/privacy/`, `/setup/`. Preserve existing section hashes with sensible anchors where possible.
- Truth: no invented testimonials, user counts, speed/cost guarantees, or employment outcomes. Explain OpenRouter/provider transmission, provider costs, and real installation availability.

## Visual and interaction contract

- Palette: paper `#f7f6f0`, ink `#20231c`, lime `#c5f55a`, secondary paper `#efeee6`, readable muted ink `#62665a`; amber for inferred values.
- Type: Cojeev's licensed Bricolage Grotesque for display, DM Sans for body, existing Geist Mono for compact form/data labels. Self-host fonts and retain OFL/MIT notices.
- Composition: generous 1240px container, big left-hand hero lettering and a full-size application-sheet demo right; the sheet becomes the stacked focal point on mobile. Large editorial sections, varied density, quiet reading pages.
- Demo states: idle, filling, complete. Disable re-entry while filling, cancel timers on unmount, provide replay, announce completion. Answer-source explanations work by click and keyboard, not hover alone. Always label the simulation.
- Accessibility: semantic headings/links/buttons, skip link, focus states, adequate contrast, touch targets, mobile navigation, reduced motion, no hidden-by-default essential content.

## Implementation sequence

1. Add focused unit regressions for public asset staging and site-specific Playwright coverage for demo/replay, answer explanations, setup/privacy navigation and mobile overflow. Observe the missing implementation fail.
2. Create the isolated website package and Vite multi-page build. Stage public files after build, including any Firefox XPI already staged by `sync-amo.js`. Include `.nojekyll` and a real 404 page. Preserve root package/version changes.
3. Retrieve official Cojeev registry sources; include only the chosen components' transitive source dependencies and styles. Record provenance and licenses. Reuse existing presence/motion primitives, buttons, tabs and tooltips; assess motion-drawer/text components before adding bespoke animation.
4. Build responsive landing page, clickable fictional demo, document showcase, clear cost/privacy copy and real navigation. Reuse the original privacy policy content and stable section IDs in its new layout. Add accurate browser-specific setup instructions.
5. Add the website install/build steps to `.github/workflows/deploy.yml` outside the conditional extension-build path, upload `site-dist`, and retain Firefox sync order. Add focused website instructions and design documentation. Log every changed file in `CONTEXT_AND_FINDINGS.md`.
6. Run only site build/unit/browser tests and the existing `sync-amo` regression tests. Inspect desktop/mobile captures together, batch fixes, confirm once. Run the Impeccable mechanical detector on authored UI. No full extension suite, release build, commit, push or production deployment in this task.

## Status

Design approved by the user through the structured selection card on 2026-10-16. User additionally requires reuse of existing useful motion components rather than rebuilding them. Implemented locally. Production build, TypeScript, six targeted unit/sync checks, and five website browser tests pass. Desktop/mobile routes and completed demo captures verified with clean console/network and valid internal links. Website preview available on local port 4177; no commit, push, or production deployment.
