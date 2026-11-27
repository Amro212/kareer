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

Production output is `site-dist/`. The build prerenders home, setup, pricing, compatibility,
the tailoring guide, privacy, security, terms and the 404 page. Vite copies `robots.txt`,
`sitemap.xml` and `llms.txt` from `public/`. The build generates `pricing.md` from the
same plan and request-cost data used by the pricing page. The build preserves the
custom domain, verification file, and signed Firefox download and
update feed staged by `tools/sync-amo.js`. **Deploy website** uploads `site-dist/`
to GitHub Pages on relevant pushes to `master`, on manual runs, and hourly. When
Mozilla cannot supply a signed file, the workflow carries forward the live
download and update feed together. Store packages are built by the separate
**Prepare store packages** workflow.

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
Cojeev provides presence transitions, buttons, tabs, badges, switches, progress,
and their interaction motion. `ScrollReveal` composes its MotionSurface and visibility
handling for one-time entrances.

The homepage heading, definition and setup links are visible before hydration.
The demo and other sections that opt into a scroll entrance respect reduced motion.
Keyboard focus settles a pending entrance immediately.

## Search visibility checks

Before publishing SEO changes, export the previous 28 days from Google Search
Console, Bing Webmaster Tools, Chrome Web Store, and Mozilla Add-ons wherever
access is available. Inspect index and canonical status for the homepage, setup,
and pricing. Record organic clicks, impressions, and store installs. Include
store referral attribution only where the dashboards expose it.

For an AI search baseline, run each prompt below three times in separate sessions
on Google AI Overviews, ChatGPT Search, and Perplexity. Use a consistent English
locale. Record the date, platform, whether an AI answer appeared, the cited URLs,
whether Kareer was mentioned or recommended, and any factual errors. Keep missing
answers and inaccessible runs visible in the sample counts.

| Topic | Prompt |
| --- | --- |
| Autofill | How can I autofill job application forms from a saved profile? |
| Chrome | Which Chrome extensions autofill job applications for free? |
| Firefox | What is a good Firefox extension for job application autofill? |
| Workday | Which extensions can fill Workday work history and education? |
| Greenhouse | Can a browser extension fill a Greenhouse application and attach my résumé? |
| Other platforms | Which job application autofill tools work on Lever, Ashby, and SmartRecruiters? |
| Privacy | Where does Kareer store my profile and what is sent when I use AI? |
| Submission | Can I review answers before Kareer submits a job application? |
| Pricing | Is Kareer free, and how much do its AI credits cost? |
| Documents | How do I tailor a résumé and cover letter to the same job in Kareer? |
| Simplify | What are alternatives to Simplify Copilot for local job application autofill? |
| SpeedyApply | How do Kareer and SpeedyApply compare for autofill in Firefox? |

After a successful Pages deploy, check live URL statuses, redirects, canonicals,
and search crawler access. Submit the sitemap and inspect the changed URLs in
Google and Bing. Measure mobile home, setup, and pricing under the same conditions
as the baseline. At 30, 60, and 90 days, compare search and install trends and
repeat the AI prompts. Correct any inaccurate claims on their canonical page and
check public store and GitHub descriptions for agreement.
