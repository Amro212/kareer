# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Job seekers applying to multiple positions across major Applicant Tracking Systems (Workday, Greenhouse, Lever, Ashby, and generic web forms) who want to apply quickly, accurately, and privately without repetitive manual copy-pasting.

## Product Purpose
Kareer is an open-source, local-first browser assistant (Chrome/Firefox extension and Tampermonkey userscript) that matches job application fields to saved profile facts and contextual AI answers. It fills inputs, comboboxes, radios, checkboxes and file uploads. Users review saved, inferred, guessed, verified and unresolved values; AI answers can be wrong.

## Positioning
Local profiles, files and application execution, with optional managed Kareer AI in extensions and explicit advanced BYOK. Managed AI uses a Cloudflare Worker/D1 for Stripe payments, reusable Kareer keys, credits and OpenRouter routing. Kareer is a form-filling assistant: it fills forms for the user to review, and the user submits every application. Request accounting metadata is retained; prompt bodies and generated content are not persisted by the gateway. The userscript remains BYOK.

## Operating Context
Operates directly within candidate-facing application pages across Ashby, Greenhouse, Lever, Workday, and generic job boards. The user interacts with the tool while viewing the job application form itself in real-time.

## Capabilities and Constraints
- In-browser field detection, classification, and multi-page application navigation.
- Actuator layer with synthetic events for custom comboboxes and multi-selects.
- Sandboxed API key handling in background workers/GM storage (isolated from page scripts).
- Single persistent Shadow DOM host in top frame only, avoiding host page style collisions.
- Frozen actuator layer (no chrome.debugger, no stealth scripts, no CAPTCHA solving).
- Bounded fill/repair loops; Auto Continue and Auto Submit preferences remain under user control, with Auto Submit off by default. Headings and attestations do not trigger a blanket autofill pause.

## Brand Commitments
- Name: Kareer
- Voice: Precise, trustworthy, unobtrusive, transparent, professional.
- Design Language: Operates within the page without hijacking focus; dark, focused HUD with high-contrast semantics and restrained accents.

## Evidence on Hand
- Full browser extension codebase (Chrome MV3 + Firefox) and Tampermonkey userscript.
- Dedicated adapters for Workday, Greenhouse, Lever, Ashby, and Generic forms.
- Full profile and settings storage schemas.

## Product Principles
- **Unobtrusive presence**: The assistant serves the task; it never obscures critical form fields or submit buttons.
- **Truthful grounding**: Never invent credentials, dates, tools, or metrics. Highlight missing data for the user.
- **Reviewable execution**: Preserve local work, show answer provenance and honor user navigation/submission settings.
- **Instant scanability**: Status, progress, and reviewable items must be readable in milliseconds.

## Accessibility & Inclusion
- High contrast (≥4.5:1 for body/labels, ≥3:1 for large text).
- Full keyboard navigability (Escape to collapse, Tab indexing).
- Clear screen-reader semantics and aria-labels for all interactive states.
