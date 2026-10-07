<div align="center">
  <a href="https://amro212.github.io/kareer/">
    <img src="./src/assets/brand/kareer-logo-horizontal.png" alt="Kareer Logo" width="380" />
  </a>

  <p><strong>AI-powered job application autofill for Chrome, Firefox, and Tampermonkey.</strong></p>

  <p>
    <a href="https://amro212.github.io/kareer/">
      <img src="https://img.shields.io/badge/%F0%9F%8C%90_Official_Website-amro212.github.io%2Fkareer-A3E635?style=for-the-badge&labelColor=0D1117" alt="Official Website" />
    </a>
  </p>

  <p>
    <a href="https://amro212.github.io/kareer/"><strong>🌐 Visit Official Website &amp; Interactive Flight Deck &rarr;</strong></a>
  </p>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
    <a href="./package.json"><img src="https://img.shields.io/github/package-json/v/Amro212/kareer?color=A3E635" alt="Version" /></a>
    <a href="#installation"><img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox%20%7C%20Tampermonkey-orange.svg" alt="Platform" /></a>
    <a href="./SECURITY.md"><img src="https://img.shields.io/badge/security-BYOK%20%7C%20Zero%20Telemetry-purple.svg" alt="Security: BYOK & Isolated" /></a>
  </p>

  <p><em>Apply to jobs in seconds without copy-pasting your resume 50 times a day.<br />Private, local-first, and powered by the LLM of your choice.</em></p>

  <p>
    <a href="https://amro212.github.io/kareer/"><strong>Website &amp; Downloads</strong></a> &bull;
    <a href="#quick-start-for-job-seekers"><strong>Quick Start</strong></a> &bull;
    <a href="#supported-ats-matrix"><strong>Supported ATS</strong></a> &bull;
    <a href="#key-features"><strong>Features</strong></a>
  </p>
</div>

> [!TIP]
> 🚀 **Official Website & Downloads**: Visit **[amro212.github.io/kareer](https://amro212.github.io/kareer/)** for the live interactive flight deck preview, direct Firefox `.xpi` self-updating install, and full product walkthrough.

---

## 📖 Table of Contents

- [What is Kareer?](#what-is-kareer)
- [Key Features](#key-features)
- [Supported ATS Matrix](#supported-ats-matrix)
- [Quick Start for Job Seekers](#quick-start-for-job-seekers)
  - [Step 1: Get an OpenRouter API Key](#step-1-get-an-openrouter-api-key)
  - [Step 2: Install the Extension or Userscript](#step-2-install-the-extension-or-userscript)
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

Kareer is an open-source browser assistant that scans job application forms, matches questions to your resume and experience, and accurately fills out inputs, comboboxes, dropdowns, radio buttons, and textareas.

Unlike proprietary autofill extensions that store your sensitive resume data on third-party servers or charge monthly subscriptions, Kareer:
- **Runs entirely in your browser** with **zero telemetry** and no external backend.
- Uses **Bring Your Own Key (BYOK)** with OpenRouter, allowing you to use fast, cost-effective models (such as `google/gemini-2.0-flash` or `anthropic/claude-3.5-sonnet`) for fractions of a cent per application.
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
- 🚀 **Unblocked Application Filling (Zero Deadlocks)**: Never freezes, deadlocks, or halts on legal disclaimers, certifications ("I certify"), attestations, or demographic disclosures. Fills the entire page unblocked to the best of its ability while honoring your Auto Continue and Auto Submit preferences.
- 🔄 **Automated Job Capture & Multi-Step Continuity**: Automatically captures job titles, companies, and requirements on navigation. Tracks multi-page workflows, reconciles parsed resume rows without duplicating records, and provides instant rescan/engine reset to prevent request-limit stalls.
- ✍️ **Inline Narrative Rewrite**: Easily tweak open-ended essay questions ("Why do you want to work here?") directly inside the form with an inline AI rewrite tool tailored to specific job requirements.
- 🔒 **Ironclad Key Isolation**: Your OpenRouter API key is stored in sandboxed extension storage and used only by background workers. It is never exposed to page scripts or web DOM.

---

## Supported ATS Matrix

Kareer includes dedicated adapters for major Applicant Tracking Systems (ATS) as well as an intelligent generic fallback:

| ATS / Platform | Adapter | Searchable Comboboxes | Multi-Page Steps | File Uploads | Repeatable Rows |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Ashby** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Greenhouse** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Lever** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Workday** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported | ✅ Supported |
| **Generic Forms** | ✅ Fallback | ✅ Standard HTML | ✅ Standard Forms | ✅ Standard Inputs | ✅ Preserved |

---

## Quick Start for Job Seekers

Follow this simple 4-step guide to get up and running in less than 5 minutes.

### Step 1: Get an OpenRouter API Key

Kareer connects to AI models via [OpenRouter](https://openrouter.ai/), an API aggregator providing access to dozens of leading LLMs.

1. Create a free account at [openrouter.ai](https://openrouter.ai/).
2. Navigate to **Keys** and click **Create Key**.
3. Add a small credit balance (e.g., $3–$5 is typically enough for hundreds of applications).
   > [!TIP]
   > We recommend the default model: **`google/gemini-2.5-flash-lite`**. It is extremely fast, accurate at structured JSON output, and costs fractions of a cent per application. All testing was done using this model.

---

### Step 2: Install the Extension or Userscript

Choose whichever method fits your browser:

#### Option A: Chrome, Brave, Edge, or Chromium Browsers
1. Download or clone this repository to your computer.
2. Build the project (or use the pre-built `dist/chrome` directory):
   ```bash
   npm install
   npm run build:extension
   ```
3. Open your browser and navigate to the Extensions page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
4. Toggle on **Developer mode** (usually a switch in the top-right corner).
5. Click **Load unpacked** and select the `dist/chrome` folder inside this project.

#### Option B: Firefox (Signed Add-on)
1. Download the latest signed extension directly:
   **[Download Kareer for Firefox (.xpi)](https://amro212.github.io/kareer/downloads/kareer-firefox.xpi)**
2. In Firefox, open the downloaded `.xpi` file (or drag it into any open Firefox tab).
3. Firefox will detect Mozilla's signature and prompt: *"Add Kareer? This extension has been verified by Mozilla"*. Click **Add** to install.
*(Alternatively, build from source and load temporarily via `about:debugging`)*.

#### Option C: Tampermonkey Userscript (Any Browser)
If you prefer userscripts:
1. Install the [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) browser extension.
2. Build the userscript:
   ```bash
   npm run build:userscript
   ```
3. Open `dist/kareer.user.js` in your browser or import it into your Tampermonkey dashboard.

---

### Step 3: Configure Your Profile & Resume

1. Click the **Kareer** icon in your browser toolbar (or open the floating side panel).
2. Go to the **Settings** tab:
   - Paste your **OpenRouter API Key**.
   - Select your preferred model (e.g. `google/gemini-2.0-flash`).
3. Go to the **Profile** tab:
   - Fill in your basic information (Full Name, Email, Phone, LinkedIn, GitHub, Portfolio).
   - Paste your **Resume text / context**.
   - Add any **Applicant Notes** (e.g. salary expectations, notice period, sponsorship requirements, preferred pronouns).
4. Click **Save Profile**. Your data is saved locally in your browser.

---

### Step 4: Autofill Your First Job Application

1. Navigate to any supported job application page (e.g., Greenhouse, Lever, Ashby, or Workday).
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
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- npm v9 or higher

### Project Architecture

Kareer is structured as a unified monorepo building multiple distribution targets from a single core:

```
kareer/
├── src/
│   ├── core/                    # Host-agnostic core logic
│   │   ├── adapters/            # ATS-specific logic (Greenhouse, Lever, Ashby, Workday)
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

```bash
# Install dependencies
npm install

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
<summary><b>Q: My API key returns an error or "Unauthorized"</b></summary>

- Verify that your OpenRouter API key starts with `sk-or-v1-`.
- Check that your OpenRouter account has an active credit balance at [openrouter.ai/credits](https://openrouter.ai/credits).
- Ensure your browser or network does not block requests to `openrouter.ai`.
</details>

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

- **License**: Released under the [MIT License](./LICENSE).
- **Security & Privacy**: Read our complete [Security Policy](./SECURITY.md) for details on key isolation and data protection.
