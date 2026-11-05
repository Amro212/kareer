# Kareer public website

React + Vite multi-page static site, deployed to GitHub Pages at `https://kareer.itsamro.me/`.
Website dependencies are independent of the extension package.

```sh
npm ci --prefix site
npm run dev --prefix site
npm run build --prefix site
npm run typecheck --prefix site
npm run preview --prefix site -- --host 127.0.0.1 --port 4177
```

Production output: `site-dist/`. The build prerenders home, privacy, setup and 404 HTML,
then copies public assets, `CNAME`, `version.json`, `firefox-updates.json`, the Google
verification file, and any staged `downloads/` directory. Keep `tools/sync-amo.js`
before the website build in deployment. Do not publish `site/` as unbuilt source.

Focused checks (Playwright uses the root repository's existing test dependency):

```sh
node --test tests/unit/site-build.test.js tests/unit/sync-amo.test.js
npx playwright test --config tests/site/playwright.config.js
```

The demo is deterministic fictional data. It never accepts applicant details, calls
AI, submits forms, or asks for credentials. The existing 14-section privacy policy
is retained in `src/privacy-content.json`; update it deliberately rather than
regenerating it from the rendered page.

## Cojeev sources

Button, Tabs, Tooltip, Motion Presence/Surface, Spinner, Text Reveal, Icon, Badge,
Switch, Accordion and Progress come from the public [Cojeev registry](https://cojeev.com/ui/docs/).
Icon's full Lucide pack (`lucide-icon-data.ts`) is a lazy chunk only fetched for names
outside the authored set; the site uses authored names only. Their actual transitive
imports are in `src/lib/`, with component styles in `src/styles/cojeev/`.
`src/lib/cojeev/PROVENANCE.json` records source URLs and upstream content hashes.
The registry's embedded font data was extracted to local WOFF2 files; the font
CSS only changes those URLs. MIT notices and the font OFL licenses are retained.

`src/main.tsx` applies the user-selected subtle/comet settings. The library's
settings persist only presentation preferences on this public website, independently
of extension storage. Reduced-motion preferences override animation.

`src/components/autofill-demo.tsx` scripts the hero run (23 fictional fields, row
matching and creation, one unresolved field resolved by a second pass) and
`src/components/document-studio.tsx` swaps tailored documents per fictional posting.
Cojeev provides headline reveal, presence transitions, buttons, tabs, badges, switches,
progress, accordion and their interaction motion. `ScrollReveal` composes its existing
MotionSurface and visibility handling for one-time entrances; hero typography
uses TextReveal's folded-line preset. No second animation engine is installed.

TextReveal has a small local playback-state extension (recorded in provenance)
to start headline and demo together, then copy, then buttons on actual completion.
The home entry conceals pending motion before hydration, with readable static,
reduced-motion and startup-failure fallbacks. Keyboard focus settles an entrance
immediately rather than making navigation wait for animation.
