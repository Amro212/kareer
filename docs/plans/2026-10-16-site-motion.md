# Public website motion refinement

**Goal:** Express the user's approved paper/ink/lime direction more strongly through hero kinetic typography, load choreography and clean scroll-triggered entrances.

**Scope:** Public landing page only. Preserve native scrolling, the demo's independent state, every section's geometry, no-JavaScript content, reduced-motion behavior, and the exact existing Cojeev subtle/comet settings. Reuse existing Cojeev components and motion utilities; no new dependency or extension change.

## Motion thesis

- Hero: Cojeev TextReveal folds the three headline lines into place with a short stagger; the lime underline draws in beneath the final line. Supporting copy, CTA and paper stack arrive with coordinated bounded easing.
- Scroll: Cojeev MotionSurface and its visibility utility coordinate one-time, locally scoped arrivals. Repeated profile slips settle as a group; document preview rises into place; receipt and closing action arrive at their own sections. Avoid pinning, scroll hijacking, loops, and animations that move adjacent sections.
- Budget: short transform/opacity/limited blur entrances; no layout-property animation, persistent scroll handlers or perpetual work. Normal-motion content starts concealed before hydration; no-JavaScript, startup-failure and reduced-motion content stays readable. Entrances settle fully.

## Implementation and verification

1. Add focused browser regressions for actual hero/scroll animation, one-time playback, stable section positions and reduced motion. Run against the current site to confirm the missing behavior.
2. Add a small composition over existing MotionSurface/useMotionVisibility; apply it at selected landing-page elements. Use TextReveal for hero typography and keep heading text/line count stable.
3. Update website motion rules, component notes, and the mandatory findings log.
4. Run only website browser tests, TypeScript and website production build. Inspect desktop/mobile intro and scrolled states in a bounded pass. No release build, full suite, commit, push or publication.
