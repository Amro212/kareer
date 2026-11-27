<div align="center">
  <a href="https://kareer.itsamro.me/">
    <img src="./src/assets/brand/kareer-logo-horizontal.png" alt="Kareer Logo" width="380" />
  </a>

  <p><strong>Free local job application autofill for Chrome and Firefox, with optional AI.</strong></p>

  <p>
    <a href="https://kareer.itsamro.me/">
      <img src="https://img.shields.io/badge/%F0%9F%8C%90_Official_Website-kareer.itsamro.me-A3E635?style=for-the-badge&labelColor=0D1117" alt="Official Website" />
    </a>
  </p>

  <p>
    <a href="https://kareer.itsamro.me/"><strong>🌐 Visit Official Website &amp; Interactive Flight Deck &rarr;</strong></a>
  </p>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-FSL--1.1--MIT-blue.svg" alt="License: FSL-1.1-MIT" /></a>
    <a href="./package.json"><img src="https://img.shields.io/github/package-json/v/Amro212/kareer?color=A3E635" alt="Version" /></a>
    <a href="#installation"><img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox%20%7C%20Tampermonkey-orange.svg" alt="Platform" /></a>
    <a href="./SECURITY.md"><img src="https://img.shields.io/badge/security-Local--first%20%7C%20Key%20Isolation-purple.svg" alt="Security: Local-first & Key Isolation" /></a>
  </p>

  <p><em>Fill job application forms from your saved profile, then review the answers.<br />Local profile tools with optional AI-assisted writing.</em></p>

  <p>
    <a href="https://kareer.itsamro.me/"><strong>Website &amp; Downloads</strong></a> &bull;
    <a href="#quick-start-for-job-seekers"><strong>Quick Start</strong></a> &bull;
    <a href="#supported-ats-matrix"><strong>Supported ATS</strong></a> &bull;
    <a href="#key-features"><strong>Features</strong></a>
  </p>
</div>

> [!TIP]
> 🚀 **Official Website & Downloads**: Visit **[kareer.itsamro.me](https://kareer.itsamro.me/)** for the interactive autofill demo, Chrome Web Store and Mozilla Add-ons setup guide, [compatibility matrix](https://kareer.itsamro.me/compatibility/), [pricing](https://kareer.itsamro.me/pricing/), and [privacy policy](https://kareer.itsamro.me/privacy/).

---

## 📖 Table of Contents

- [What is Kareer?](#what-is-kareer)
- [Key Features](#key-features)
- [Supported ATS Matrix](#supported-ats-matrix)
- [Quick Start for Job Seekers](#quick-start-for-job-seekers)
  - [Step 1: Install Kareer](#step-1-install-kareer)
  - [Step 2: Turn On AI](#step-2-turn-on-ai)
  - [Step 3: Configure Your Profile & Resume](#step-3-configure-your-profile--resume)
  - [Step 4: Autofill Your First Job Application](#step-4-autofill-your-first-job-application)
- [Safety & Privacy Guarantees](#safety--privacy-guarantees)
- [Developer & Contributor Guide](#developer--contributor-guide)
  - [Prerequisites](#prerequisites)
  - [Project Architecture](#project-architecture)
  - [Build Commands](#build-commands)
  - [Testing & ATS Fixture Capture](#testing--ats-fixture-capture)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License & Security](#license--security)

---

## What is Kareer?

Kareer is a source-available browser assistant that scans job application forms, matches questions to your resume and experience, and accurately fills out inputs, comboboxes, dropdowns, radio buttons, and textareas.

- **Stores your profile, resume and files in your browser.** Optional Kareer AI sends relevant context through the Kareer gateway to OpenRouter and its provider. See the [privacy policy](https://kareer.itsamro.me/privacy/#ai-transmission) for details.
- Fills from your saved profile for free. You can start an optional **Kareer AI** trial in the official extension. See [current plan and trial details](https://kareer.itsamro.me/pricing/). Self-built copies can use **your own OpenRouter key**.
- Uses a **non-intrusive Shadow DOM floating panel** that never conflicts with website stylesheets.

---

## Key Features

- 🎯 **High-Accuracy Field Detection & Repeatable Sections**: Handles standard inputs, custom searchable comboboxes, multi-select dropdowns, date pickers, radios, checkboxes, and multi-row sections (such as education and work experience) across diverse ATS layouts.
- ⚡ **Tiered Resolution & Value Provenance**: Resolves fields through a clear 3-tier hierarchy:
  1. *Deterministic profile fields* via ATS adapter selectors.
  2. *Exact saved answers* for repeated custom questions (`savedAnswers[questionText]`).
  3. *Contextual AI fallback* using a single batched request per page.
  Every field carries visual provenance: **verified (green)**, **saved**, **inferred**, **guessed (yellow)**, or **unresolved**.
- 🤖 **Truthful Context-Grounded Grounding**: Inferences are strictly grounded in your resume, profile, applicant notes, work country, and captured job context. Built-in prompts forbid inventing credentials, dates, tools, or companies.
- **Application review controls**: Review filled answers, including certifications and disclosures, and correct anything that needs attention. Auto Continue and Auto Submit follow your settings; Auto Submit is off by default.
- 🔄 **Automated Job Capture & Multi-Step Continuity**: Automatically captures job titles, companies, and requirements on navigation. Tracks multi-page workflows, reconciles parsed resume rows without duplicating records, and provides instant rescan/engine reset to prevent request-limit stalls.
- ✍️ **Inline Narrative Rewrite**: Easily tweak open-ended essay questions ("Why do you want to work here?") directly inside the form with an inline AI rewrite tool tailored to specific job requirements.
- 🔒 **Ironclad Key Isolation**: Your Kareer key (or your own OpenRouter key in a self-built copy) is stored in sandboxed extension storage and used only by background workers. It is never exposed to page scripts or web DOM.

---

## Supported ATS Matrix

Kareer includes dedicated adapters for major Applicant Tracking Systems (ATS) as well as an intelligent generic fallback (see [tested workflows and limits](https://kareer.itsamro.me/compatibility/)):

| ATS / Platform | Adapter | Searchable Comboboxes | Multi-Page Steps | File Uploads | Repeatable Rows |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Workday** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Greenhouse** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Lever** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Ashby** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **SmartRecruiters** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Generic Forms** | ✅ Fallback | ✅ Standard HTML | ✅ Standard Forms | ✅ Standard Inputs | ✅ Preserved |

---

## Quick Start for Job Seekers

Follow this simple 4-step guide to get up and running in less than 5 minutes.

<a name="installation"></a>

### Step 1: Install Kareer

#### Install from a browser store

- Install for Google Chrome from the **[Chrome Web Store](https://chromewebstore.google.com/detail/kareer/gnbkbdbpajlpclicmapjghpodogkgblf)** and receive automatic updates.
- Install for Firefox from **[Mozilla Add-ons](https://addons.mozilla.org/addon/kareer/)** and receive automatic updates.
- See the **[Setup Guide](https://kareer.itsamro.me/setup/)** for walkthrough steps and troubleshooting.

#### Build Kareer from source

You can clone and build Kareer for your own use under the [project license](./LICENSE). Install Node.js 24 and run these commands:

```bash
git clone https://github.com/Amro212/kareer.git
cd kareer
npm ci
npm run build:extension
```

- **Chrome, Brave, or Edge** — Open `chrome://extensions`, `brave://extensions`, or `edge://extensions`. Enable **Developer mode**, choose **Load unpacked**, and select `dist/chrome`.
- **Firefox** — Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Firefox unloads temporary add-ons when it restarts.
- **Tampermonkey or Violentmonkey** — Run `npm run build:userscript` and import `dist/kareer.user.js` into your userscript manager.

---

### Step 2: Turn On AI

Filling from your saved profile works without AI. For AI answers, open **Settings → AI & billing** and choose **Start free trial** for 20 free credits over 30 days, or pick a plan. No account is required. See [pricing and request costs](https://kareer.itsamro.me/pricing/).

Self-built copies can also use your own OpenRouter key. Create and fund a key in OpenRouter, then choose **Use my own OpenRouter key** in the local build’s settings. If the request returns “Unauthorized,” check the key, credit balance, and connection. [OpenRouter credits](https://openrouter.ai/credits)

---

### Step 3: Configure Your Profile & Resume

1. Click the **Kareer** icon in your browser toolbar (or open the floating side panel).
2. Go to the **Profile** tab:
   - Fill in your basic information (Full Name, Email, Phone, LinkedIn, GitHub, Portfolio).
   - Paste your **Resume text / context**.
   - Add any **Applicant Notes** (e.g. salary expectations, notice period, sponsorship requirements, preferred pronouns).
3. Click **Save Profile**. Your data is saved locally in your browser.

---

### Step 4: Autofill Your First Job Application

1. Navigate to any supported job application page (e.g., Workday, Greenhouse, Lever, Ashby, or SmartRecruiters).
2. The **Kareer** instrument panel appears on the right (or press `Alt+Shift+J` to toggle).
3. Under the **Run** tab, job title and company metadata are automatically captured.
4. Click **Autofill Application** (or **Scan Fields** to inspect detected fields).
5. Inspect the filled values and provenance in the review list:
   - **Green (Verified / Saved)**: Exact profile match or confirmed DOM-committed selection.
   - **Yellow (Inferred / Guessed)**: Contextual AI fallback inference grounded in your resume, notes, and country facts.
   - **Unresolved**: Questions lacking profile context, left open for your review.
6. Verify your answers, upload your resume file if prompted, and submit when satisfied. (By default, **Auto Submit** is OFF so you maintain complete control).

---

## Safety & Privacy Guarantees

Kareer is engineered with strict boundaries to protect both your privacy and the integrity of your job search:

> [!IMPORTANT]
> **Human-in-the-Loop & Transparent Automation**
> - **Zero Fabrications**: Prompt constraints enforce truthful grounding. The model will never invent job titles, employment dates, certifications, or past companies.
> - **Unblocked Filling, Candidate Control**: Kareer autofills applications unblocked—without freezing on legal certifications, attestations, or disclosure surveys—while keeping Auto Submit disabled by default so you retain final review before submitting.
> - **5-State Value Provenance**: Every populated field distinguishes between `saved`, `inferred`, `guessed`, `verified`, and `unresolved`, so you always know which values came from exact profile facts versus contextual inference.
> - **No Stealth or Anti-Bot Bypass**: No `chrome.debugger` or CDP hacks. DOM events use clean, native synthetic dispatches.
> - **Complete Key Isolation**: Your API keys are kept in isolated background workers or userscript storage and are never exposed to the page DOM.

For full details, please review our [SECURITY.md](./SECURITY.md).

---

## Developer & Contributor Guide

Contributions, issue reports, and ATS adapters are welcome!

### Prerequisites
- [Node.js](https://nodejs.org/) 24 (the version used by CI)
- npm v9 or higher

### Project Architecture

Kareer is structured as a unified monorepo building multiple distribution targets from a single core:

```
kareer/
├── src/
│   ├── core/                    # Host-agnostic core logic
│   │   ├── adapters/            # ATS-specific logic (Workday, Greenhouse, Lever, Ashby, SmartRecruiters)
│   │   ├── fields/              # Field actuators (fillers, comboboxes, observers)
│   │   ├── ai.js                # Prompt construction & OpenRouter API client
│   │   ├── application.js       # High-level autofill coordinator
│   │   ├── platform.js          # Platform abstraction (Extension vs. Userscript)
│   │   └── ui.js                # Shadow DOM floating panel & review UI
│   └── targets/                 # Platform-specific entrypoints & manifests
│       ├── extension/           # Chrome / Firefox MV3 extension
│       └── userscript/          # Tampermonkey userscript entrypoint
├── tools/
│   ├── build.js                 # Esbuild-powered multi-target builder
│   └── zip.js                   # Extension packager
├── fixtures/                    # Captured ATS HTML fixtures for regression tests
└── tests/                       # Unit & Playwright E2E test suites
```

### Build Commands

Run `npm ci` from the repository root before building a newly pulled branch. Git
does not update `node_modules`; this installs the versions in `package-lock.json`,
including the Tiptap packages used by the application materials editor. If the
build reports `Could not resolve "@tiptap/..."`, rerun `npm ci` before building.

Deprecation/funding notices and audit findings can appear after a successful
install. Inspect findings with `npm audit`; avoid `npm audit fix --force` on this
branch. It can downgrade `web-ext` and `mammoth` to obsolete major versions and
introduce additional vulnerable dependencies.

```bash
# Install the locked dependencies, including after branch updates
npm ci

# Build all targets (Chrome extension, Firefox extension, and Userscript)
npm run build

# Watch mode for rapid development
npm run dev

# Build only the browser extensions
npm run build:extension

# Build only the Tampermonkey userscript
npm run build:userscript

# Increment version numbers
npm run bump:patch
npm run bump:minor
npm run bump:major
```

#### Which Kareer AI gateway a build talks to

Gateway origins live in `src/core/endpoints.js`. The build writes the chosen
origin into the background script and both manifests' host permissions.

| Command | Gateway | Output folder |
|---|---|---|
| `npm run build` / `npm run build:extension` / `npm run dev` | staging Worker (`https://kareer-gateway-staging.amromousa8.workers.dev`) | `dist/chrome`, `dist/firefox` (load unpacked / temporary add-on) |
| `node tools/build.js --target=extension --staging` | staging Worker; named "Kareer (Staging)", Kareer AI on by default, separate Firefox ID, no version bump | `dist/staging/chrome`, `dist/staging/firefox` |
| `node tools/build.js --target=extension --production` | `KAREER_GATEWAY_ORIGIN` if set, otherwise `https://api.kareer.itsamro.me` | `dist/chrome`, `dist/firefox`, `dist/kareer-chrome.zip`, `dist/kareer-firefox.xpi` |

Run **Prepare store packages** in GitHub Actions after committing a new release
version. Submit the Chrome ZIP to the Chrome Web Store and the unsigned Firefox
XPI with its matching source ZIP to Mozilla Add-ons. The website has its own
deployment workflow.

Only `--production` builds can use the production gateway, and they can't use
the staging one. `--production` builds are the official store packages: they
use Kareer AI only and leave out the "Use my own OpenRouter key" option. Every
other build keeps it. The store packaging workflow builds with `--production` and reads
`KAREER_GATEWAY_ORIGIN` from the repository variable of the same name.
`--gateway=https://…` overrides the gateway for non-production builds. Plan
prices and credits come from `src/core/offers.json`, which the gateway, the
extension and the website all read.

### Testing & ATS Fixture Capture

Kareer requires tests to pass on every code change to avoid regressions:

```bash
# Run unit tests
npm test

# Run Playwright E2E tests (real browser loading the extension)
npm run test:e2e
```

#### Capturing an ATS Bug Fixture
If you encounter a form or ATS edge case that doesn't fill correctly:
1. Open the floating panel on the application page.
2. Go to the **Debug** tab and click **Save page fixture**.
3. Move the downloaded `.html` and metadata files into the `fixtures/` directory.
4. Add a Playwright test under `tests/` verifying the fix.

---

## Troubleshooting & FAQ

<details>
<summary><b>Q: The floating panel is not appearing on a job page</b></summary>

- Check if the extension icon is active in your browser toolbar.
- Click the extension icon in the toolbar and click **Toggle Panel**.
- Refresh the application page. If the page is inside an `iframe`, Kareer will mount the panel in the top frame while scanning subframes in the background.
</details>

<details>
<summary><b>Q: Why wasn't a specific field filled?</b></summary>

- Kareer resolves fields through a 3-tier hierarchy: deterministic profile facts, exact saved answers, and contextual AI inference. If an answer cannot be determined with confidence from your profile or resume context, it remains `unresolved` so you can manually answer it or add details to your **Applicant Notes**.
</details>

<details>
<summary><b>Q: Does Kareer freeze on legal attestations or e-signatures?</b></summary>

- No. Kareer follows an unblocked autofill policy: it completes questions, certifications, and disclosures using your saved profile facts and contextual inference rather than hard-pausing or freezing the page. However, **Auto Submit** is strictly disabled by default, giving you full control to inspect, edit, and sign before submitting.
</details>

---

## License & Security

- **License**: [FSL-1.1-MIT](./LICENSE) (Functional Source License). You can read, modify and build Kareer for your own use, for non-commercial education and research. You can't offer it, or a substantially similar product, to others commercially. Each release becomes MIT-licensed two years after it is published.
- **Trademark**: The Kareer name and logo are not covered by the license. See [TRADEMARK.md](./TRADEMARK.md).
- **Kareer AI**: Official builds use Kareer AI only. The Kareer AI gateway is a separate, closed-source service.
- **Security & Privacy**: Read our complete [Security Policy](./SECURITY.md) for details on key isolation and data protection.
