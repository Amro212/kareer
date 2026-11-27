import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScrollReveal } from '@/components/scroll-reveal';
import { Icon } from '@/components/site-icon';
import { AutofillDemo } from '@/components/autofill-demo';
import { DocumentStudio } from '@/components/document-studio';
import privacySections from './privacy-content.json';
import securitySections from './security-content.json';
import termsSections from './terms-content.json';
import offers from '../../src/core/offers.json';
import credits from '../../src/core/credits.json';
import { creditCount, pricingPlans, requestCosts } from './pricing';
import { Compatibility, TailoringGuide } from './guides';

const github = 'https://github.com/Amro212/kareer';
const chromeStore = 'https://chromewebstore.google.com/detail/kareer/gnbkbdbpajlpclicmapjghpodogkgblf';
const firefoxStore = 'https://addons.mozilla.org/addon/kareer/';
const setup = '/setup/';

function Brand() {
  return <a href="/" className="brand" aria-label="Kareer home"><img src="/assets/kareer-mark.svg" width="31" height="31" alt="" /><span>kareer<span className="brand-period">.</span></span></a>;
}

function Header({ home }: { home: boolean }) {
  const [open, setOpen] = useState(false);
  const base = home ? '' : '/';
  return <header className="site-header wrap">
    <Brand />
    <button className="menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'} /></button>
    <nav id="main-nav" className={`navigation ${open ? 'is-open' : ''}`} aria-label="Main navigation" onClick={() => setOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <a href={`${base}#how-it-works`}>How it works</a><a href={`${base}#documents`}>Your documents</a><a href={`${base}#faq`}>FAQ</a><a href="/pricing/">Pricing</a>
      <a className="nav-source" href={github} target="_blank" rel="noopener noreferrer">Source code <Icon name="diagonal" size={14} /></a>
    </nav>
    <Button asChild className="nav-install"><a href={setup}>Get Kareer <Icon name="arrow" size={16} /></a></Button>
  </header>;
}

function Footer() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/version.json', { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (typeof data?.version === 'string') setVersion(data.version); }).catch(() => { });
    return () => controller.abort();
  }, []);
  return <footer className="site-footer wrap" id="open-source">
    <div><Brand /><p>A little less busywork.<br />A little more you.</p></div>
    <div className="footer-links"><a href={chromeStore}>Chrome Web Store</a><a href={firefoxStore}>Firefox Add-ons</a><a href={setup}>Install & setup</a><a href="/compatibility/">Compatibility</a><a href="/pricing/">Pricing</a><a href="/privacy/">Privacy</a><a href="/security/">Security</a><a href="/terms/">Terms</a><a href="/llms.txt">AI site index</a><a href={github} target="_blank" rel="noopener noreferrer">GitHub <Icon name="diagonal" size={14} /></a><a href={`${github}/issues`} target="_blank" rel="noopener noreferrer">Report a bug</a></div>
    <div className="footer-note"><span>Made for the other side of the application.</span><span>Source available · FSL-1.1-MIT{version ? ` · v${version}` : ''}</span></div>
  </footer>;
}

const faqs: [string, React.ReactNode][] = [
  ['What does Kareer cost?', <>Local autofill is free. New users can try Kareer AI with {creditCount(credits.trial.credits)} for {credits.trial.days} days. The monthly plan costs {offers.monthly.price}/month for {creditCount(offers.monthly.credits)}. A one-time {offers.pack.price} pack adds {creditCount(offers.pack.credits)} that never expire. See <a href="/pricing/">Kareer pricing and request costs</a>.</>],
  ['Do I need an AI account?', 'No. Kareer AI activates with a reusable Kareer key that appears in Settings when you start the free trial or pay. No Kareer registration or AI provider account is needed. Developers who build Kareer from source can connect their own OpenRouter key instead. Never paste credentials into this website or a job application.'],
  ['Which browsers can I use?', <>Kareer is available for desktop Chrome and Firefox. Install from the <a href={chromeStore}>Chrome Web Store</a> or <a href={firefoxStore}>Mozilla Add-ons</a>. See the <a href="/setup/#browser">setup guide</a> for manual installation on Chrome, Edge and Brave.</>],
  ['Will it work on every application?', <>Kareer has dedicated support for Workday, Greenhouse, Lever, and Ashby, plus a generic form engine. Application forms vary, so some fields may need your attention. See <a href="/compatibility/">tested workflows and limits</a>.</>],
  ['Does my résumé leave my browser?', <>Your profile and documents are stored locally. Employers receive the information you submit or attach. If you use optional Kareer AI, relevant context goes through Kareer’s gateway to OpenRouter and its provider. See the <a href="/privacy/#ai-transmission">privacy policy</a> for details.</>],
  ['Can I review and edit the answers?', 'Yes. Kareer distinguishes saved, inferred, guessed, verified, and unresolved values so you can review the result. You can adjust answers and control Auto Continue and Auto Submit in settings. The website demo shows all five with fictional data.'],
];

function Home() {
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (document.documentElement.dataset.entrances === 'pending') document.documentElement.dataset.entrances = 'ready';
  }, []);
  const startDemo = () => {
    setRun(value => value + 1);
    document.getElementById('demo')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  };
  return <>
    <section className="hero wrap" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title" className="hero-heading">Job application autofill for <span>Chrome and Firefox</span></h1>
        <div className="hero-side">
          <p className="hero-description">Kareer is a browser extension that fills job application forms from your saved profile for free.</p>
          <p className="hero-explanation">Optional AI helps answer questions and tailor résumés and cover letters. Review and edit answers, and choose when to continue or submit.</p>
          <div className="hero-actions"><Button size="lg" className="lime-button" onClick={startDemo}>Try the demo <Icon name="play" size={17} /></Button><a href={setup} className="text-link">Get Kareer <Icon name="arrow" size={18} /></a></div>
          <p className="browser-availability">Available on <a href={chromeStore}>Chrome</a> and <a href={firefoxStore}>Firefox</a>.</p>
          <div className="hero-reassurance"><Icon name="code" size={15} /><span>Source available. Your profile is stored locally.</span></div>
        </div>
      </div>
      <ScrollReveal><div className="hero-demo-entrance"><AutofillDemo run={run} onStart={startDemo} /></div></ScrollReveal>
    </section>
    <section className="compatibility wrap" id="supported-sites" aria-label="Supported application platforms"><a className="text-link" href="/compatibility/">See tested application platforms <Icon name="arrow" size={16} /></a><div className="ats-list"><span>Workday</span><span>Greenhouse</span><span>Lever</span><span>Ashby</span></div></section>
    <section className="benefits-section wrap" id="how-it-works">
      <div className="section-intro"><h2>How Kareer fills job applications</h2><p>Save your profile once, autofill a form, and review the answers before sending it.</p></div>
      <div className="benefits-grid" id="features"><ScrollReveal><div className="repetition-graphic" aria-hidden="true"><div className="repeat-slip slip-one"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">typed this already.</span></div><div className="repeat-slip slip-two"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">and here.</span></div><div className="repeat-slip slip-three"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">yep, here too.</span></div><div className="one-profile"><Icon name="check" size={20} /> One saved profile.</div></div></ScrollReveal><div className="benefit-list"><ScrollReveal><article><span className="benefit-symbol"><Icon name="file" /></span><div><h3>Meet the form. Skip the déjà vu.</h3><p>Save your profile once. Kareer matches your details to application fields across supported job sites.</p></div></article></ScrollReveal><ScrollReveal delay={0.08}><article><span className="benefit-symbol"><Icon name="sparkles" /></span><div><h3>A little context goes a long way.</h3><p>For questions your profile can’t answer directly, AI uses your experience and the role’s context to help draft an answer.</p></div></article></ScrollReveal><ScrollReveal delay={0.16}><article><span className="benefit-symbol"><Icon name="shield" /></span><div><h3>Your application. Your final say.</h3><p>See where answers came from, edit what needs attention, and choose how Kareer continues and submits.</p></div></article></ScrollReveal></div></div>
    </section>
    <section className="documents-section" id="documents"><div className="wrap documents-layout"><ScrollReveal><div className="documents-copy"><h2>Tailor your résumé and cover letter</h2><p>Pick a fictional posting to see how the same saved experience can be framed for different roles. Use your own profile in Kareer, then review and edit each draft.</p><ul className="check-list"><li><Icon name="check" size={17} />Grounded in your saved profile</li><li><Icon name="check" size={17} />Editable drafts, saved locally</li><li><Icon name="check" size={17} />Download as PDF or Word</li></ul><a className="text-link" href="/guides/tailor-resume-and-cover-letter/">Read the tailoring guide <Icon name="arrow" /></a></div></ScrollReveal><ScrollReveal delay={0.12}><div className="document-entrance"><DocumentStudio /></div></ScrollReveal></div></section>
    <section className="cost-section wrap" id="install"><div className="cost-copy"><h2>Less setup.<br />Clear spending.</h2><p>Local profile filling stays free. Add Kareer AI when you need answers and tailored documents. Your first {credits.trial.credits} credits are on us.</p><a href="/pricing/" className="text-link">See pricing <Icon name="arrow" /></a></div><ScrollReveal delay={0.08}><div className="cost-receipt"><div className="receipt-heading"><Brand /><span>KAREER AI PRICING</span></div><div className="receipt-row"><span>{offers.monthly.credits.toLocaleString('en-US')} monthly credits</span><strong>{offers.monthly.price}/month</strong></div><div className="receipt-row"><span>{offers.pack.credits} non-expiring credits</span><strong>{offers.pack.price} once</strong></div><div className="receipt-row"><span>Local features</span><strong>Free</strong></div><div className="receipt-row"><span>{credits.trial.credits} trial credits</span><strong>Free</strong></div><p>A completed autofill AI request uses {creditCount(credits.costs.autofill)}. Drafting a résumé or cover letter uses {creditCount(credits.costs.document)}. A run can make multiple requests. Monthly credits expire each paid billing period; packs never expire. No automatic top-ups.</p><p>Plans are purchased in the extension. Taxes may apply. All sales are final except where required by law. See the <a href="/terms/">Terms of Service</a> before purchase.</p><div className="receipt-footer"><Icon name="check" size={17} /> No Kareer account. Reusable activation key.</div></div></ScrollReveal></section>
    <section className="privacy-section" id="privacy"><div className="wrap privacy-summary"><div className="privacy-heading"><Icon name="lock" size={35} /><h2>Local-first.<br />Clear about what leaves.</h2></div><div><p>Your profile and files live in your browser. Kareer AI sends relevant context through Kareer’s gateway to OpenRouter and its provider; a self-built copy using your own key sends it directly. The gateway retains payment and request accounting metadata, never prompt bodies or generated content.</p><a href="/privacy/" className="text-link">Read the privacy policy <Icon name="arrow" /></a></div></div></section>
    <section className="faq-section wrap" id="faq"><div><h2>Kareer FAQ</h2><a href={`${github}/issues`} className="text-link">Ask us on GitHub <Icon name="diagonal" size={16} /></a></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question} name="kareer-faq"><summary>{question}<Icon name="plus" size={18} /></summary><p>{answer}</p></details>)}</div></section>
    <section className="closing-section wrap"><div className="closing-rule" /><ScrollReveal><div><h2>Your next application<br />can be <span>a little less work.</span></h2><Button asChild size="lg" className="lime-button"><a href={setup}>Get Kareer <Icon name="arrow" /></a></Button><p className="browser-availability">Available on <a href={chromeStore}>Chrome</a> and <a href={firefoxStore}>Firefox</a>.</p><p>Free local filling. {credits.trial.credits} free Kareer AI credits to start.</p></div></ScrollReveal><div className="closing-stamp" aria-hidden="true">LESS BUSYWORK.<br />MORE POSSIBILITY.</div></section>
  </>;
}

function Setup() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Install and use Kareer</h1><p>Get Kareer for desktop Chrome or Firefox, save your profile, and fill your first job application.</p></div><div className="reading-layout"><aside className="reading-toc"><span>GET UP AND RUNNING</span><a href="#browser">Install Kareer</a><a href="#profile">Save your profile</a><a href="#first-run">Fill your first application</a><a href="#key">Activate optional AI</a><a href="#costs">Understand costs</a><a href="#troubleshooting">Need a hand?</a></aside><article className="reading-content">
    <section id="browser">
      <h2>Install the browser extension</h2>
      <p>Choose your desktop browser. Kareer is available on both official extension stores.</p>
      <div className="browser-install-grid">
        <div className="browser-install-card">
          <h3>Google Chrome</h3>
          <p>Open the Chrome Web Store, choose Add to Chrome, then pin Kareer to your toolbar.</p>
          <Button asChild className="lime-button"><a href={chromeStore}>Add to Chrome <Icon name="arrow" size={17} /></a></Button>
          <p className="helper-text">Chrome Web Store · automatic updates</p>
        </div>
        <div className="browser-install-card">
          <h3>Mozilla Firefox</h3>
          <p>Open Mozilla Add-ons, choose Add to Firefox, confirm the permissions prompt, then pin Kareer to your toolbar.</p>
          <Button asChild className="lime-button"><a href={firefoxStore}>Add to Firefox <Icon name="arrow" size={17} /></a></Button>
          <p className="helper-text">Mozilla Add-ons · automatic updates</p>
        </div>
      </div>
      <details><summary>Build for Chrome, Edge or Brave from source</summary><p>You can also install manually with Node.js and Git.</p><ol><li>Clone <a href={github}>the Kareer repository</a> and open a terminal in its folder.</li><li>Run <code>npm ci</code>, then <code>npm run build:extension</code>.</li><li>Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and enable Developer mode.</li><li>Choose <strong>Load unpacked</strong> and select the repository’s <code>dist/chrome</code> folder.</li></ol><a className="text-link" href={`${github}#installation`}>Read the source installation guide <Icon name="diagonal" size={16} /></a></details>
    </section>
    <section id="profile"><h2>Save your profile</h2><p>Open <strong>Profile</strong> and add your contact details, education, work experience, projects, and other relevant facts. Save your changes. More useful context means fewer fields to fix later.</p><p>Keep your structured profile records current. The <a href="/guides/tailor-resume-and-cover-letter/">résumé and cover letter guide</a> shows how to use and review those facts in a draft.</p></section>
    <section id="first-run"><h2>Fill your first job application</h2><ol><li>Open a job application and launch Kareer.</li><li>Choose <strong>Autofill</strong>. Kareer scans the form and resolves its fields.</li><li>Review the answers and their source labels. Edit anything that needs attention.</li><li>Continue or submit when you’re ready. Auto Continue and Auto Submit are settings you control.</li></ol><p>Check <a href="/compatibility/">tested application platforms</a> or <a href="/#demo">try the fictional demo</a> first.</p></section>
    <section id="key"><h2>Activate optional AI</h2><p>Local profile filling works immediately. For AI, open <strong>Settings</strong> in the extension and find <strong>Kareer AI</strong>.</p><ol><li>Choose <strong>Start free trial</strong> to get {credits.trial.credits} credits that last {credits.trial.days} days. No payment needed.</li><li>When you want more, choose a plan right there (see <a href="/pricing/">pricing</a>). Stripe’s secure checkout opens for it.</li><li>Pay on Stripe’s checkout. Kareer activates on its own once the payment is confirmed. If you close Settings, it activates the next time you open it within 24 hours.</li><li>Choose <strong>Show key</strong> and keep your Kareer key somewhere safe. Paste it into Activate key on another browser to share the same credits.</li></ol><p>There is no Kareer registration and keys are never emailed. Use Manage billing to cancel or update your card. Lost your key? Email <a href="mailto:kareer@itsamro.me">kareer@itsamro.me</a>. Removing the extension does not cancel a subscription.</p><details><summary>Building Kareer yourself?</summary><p>Copies you build from source for personal use can also connect your own OpenRouter key instead of Kareer AI. See the <a href={`${github}#installation`}>GitHub guide</a>. Provider charges are separate.</p></details><div className="reading-callout"><Icon name="lock" /><p>Enter credentials only in Kareer’s extension settings or the userscript’s own settings. Never enter a key into a job application or this website.</p></div></section>
    <section id="costs">
      <h2>Understand AI request costs</h2>
      <p>See <a href="/pricing/#request-costs">Kareer pricing and credit costs</a> for current plans and the cost per completed request. Automatic follow-ups count separately. A single autofill run may use multiple credits.</p>
      <p>Oversized inputs are rejected without a charge. Provider errors, timeouts, truncated or malformed completions release their reservation. A validated and settled request remains charged if delivery fails or the application rejects the answer. We do not store completed answers on the server. An explicit retry is a new request and may consume another credit.</p>
      <p>Check your balance in Settings. Local filling remains available during outages or credit exhaustion. See the <a href="/terms/">Terms of Service</a> for billing and refunds.</p>
    </section>
    <section id="troubleshooting"><h2>Troubleshoot Kareer</h2><details><summary>My Kareer key won’t activate<Icon name="plus" size={18} /></summary><p>Open Already purchased? in Settings and paste the key from Show key in your other browser. If the service is temporarily unavailable, retry activation later; local filling still works. For a payment problem, open Manage billing. Lost or disabled key? Email <a href="mailto:kareer@itsamro.me">kareer@itsamro.me</a>. Don’t share your key in a bug report.</p></details><details><summary>My own OpenRouter key returns “Unauthorized” (self-built copies)<Icon name="plus" size={18} /></summary><p>Check that the correct OpenRouter key was saved. Confirm it hasn’t been revoked and that your OpenRouter account can use the selected model.</p></details><details><summary>A field didn’t fill correctly<Icon name="plus" size={18} /></summary><p>Review the field, check your saved profile and the available choices, and adjust the answer. To refill after editing documents, use Rescan and enable Overwrite Existing if you want to replace filled values. If the problem persists, report the application platform and symptoms on GitHub. Remove applicant details and credentials from anything you share.</p></details><p><a className="text-link" href={`${github}/issues`}>Report a bug on GitHub <Icon name="diagonal" size={16} /></a></p></section>
  </article></div></div>;
}

function Privacy() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Kareer Privacy Policy</h1><p>What stays in your browser. What goes to AI providers.<br />And who has access to what.</p><span className="policy-date">Privacy policy · November 21, 2026 · Version 2.4</span></div><div className="reading-layout"><aside className="reading-toc"><span>THE PRIVACY POLICY</span>{privacySections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="reading-content policy-content">{privacySections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2><div dangerouslySetInnerHTML={{ __html: section.html }} /></section>)}</article></div></div>;
}

function CreditEstimator() {
  const [apps, setApps] = useState(40);
  const low = apps * credits.costs.autofill, high = low * 3;
  const fit = high <= offers.pack.credits ? `A ${offers.pack.price} Credit Pack covers even the high end, and pack credits never expire.`
    : high <= offers.monthly.credits ? 'Kareer Monthly covers even the high end.'
    : 'Kareer Monthly covers the low end. At the high end, add a Credit Pack.';
  return <section className="estimator" aria-labelledby="estimator-title">
    <div className="estimator-copy"><h2 id="estimator-title">Estimate your credits.</h2><p>Compare one to three completed autofill AI requests per application. A form your saved profile fully answers uses no AI credits.</p></div>
    <div className="estimator-card">
      <label htmlFor="estimator-apps"><span>Applications with AI help each month</span><output htmlFor="estimator-apps">{apps}</output></label>
      <input id="estimator-apps" type="range" min={5} max={500} step={5} value={apps} onChange={event => setApps(Number(event.target.value))} style={{ '--fill': `${(apps - 5) / 4.95}%` } as React.CSSProperties} />
      <div className="estimate" aria-live="polite"><strong>{low.toLocaleString('en-US')}–{high.toLocaleString('en-US')}</strong><span>estimated credits a month</span></div>
      <p className="estimate-fit">{fit}</p>
      <p className="estimator-note">Each tailored résumé or cover letter adds {creditCount(credits.costs.document)}. Automatic follow-ups count separately.</p>
    </div>
  </section>;
}

function Pricing() {
  return <div className="reading-page wrap">
    <div className="reading-intro">
      <a href="/" className="back-link">← Back to Kareer</a>
      <h1>Kareer pricing and AI credits</h1>
      <p>Kareer autofills job applications from your saved profile for free on desktop Chrome and Firefox. Credits pay for optional AI answers, tailored résumés, and cover letters.</p>
    </div>
    <div className="table-scroll" role="region" aria-label="Kareer plans" tabIndex={0}>
      <table className="comparison-table">
        <caption>Compare Kareer plans</caption>
        <thead><tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">AI credits</th><th scope="col">How it works</th></tr></thead>
        <tbody>{pricingPlans.map(([name, price, allowance, terms]) => <tr key={name}>
          <th scope="row">{name}</th><td>{price}</td><td>{allowance}</td><td>{terms}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="comparison-actions">
      <Button asChild className="lime-button"><a href={setup}>Get Kareer <Icon name="arrow" size={16} /></a></Button>
      <a className="text-link" href="/pricing.md">Pricing in Markdown</a>
    </div>
    <div className="reading-content guide-content">
      <section id="request-costs">
        <h2>Cost per completed AI request</h2>
        <dl className="request-costs">{requestCosts.map(([label, cost]) => <div key={label}><dt>{label}</dt><dd>{creditCount(cost)}</dd></div>)}</dl>
        <p>One autofill run can make multiple requests. Eligible credits that expire soonest are used first. Kareer never tops up credits automatically.</p>
      </section>
    </div>
    <CreditEstimator />
    <article className="reading-content pricing-notes">
      <section id="buy-in-extension">
        <h2>Buy credits in the extension</h2>
        <ol><li><a href={setup}>Install Kareer</a> for Chrome or Firefox and open <strong>Settings → Kareer AI</strong>.</li><li>Start the trial with {credits.trial.credits} free credits, or choose a paid plan to open Stripe checkout.</li><li>Kareer activates when payment is confirmed. Use Show key in Settings to access the same credits in another browser.</li></ol>
        <p>Paid prices are in USD. Taxes may apply. Credits have no cash value.</p>
        <p>All sales are final except where the law requires a refund. See the <a href="/terms/">Terms of Service</a>. For questions or a lost key, email <a href="mailto:kareer@itsamro.me">kareer@itsamro.me</a>.</p>
      </section>
    </article>
  </div>;
}

function CreditTerms() {
  return <>
    <p>Filling forms from your saved profile is free. Kareer AI is optional. New users can start a free trial in Settings. Trial credits expire {credits.trial.days} days after activation and have no cash value. See <a href="/pricing/">current pricing</a> for the trial allowance. The monthly plan is {offers.monthly.price} per month and adds {creditCount(offers.monthly.credits)} each paid month. Unused monthly credits expire when that month ends. The credit pack is {offers.pack.price} once for {creditCount(offers.pack.credits)} that do not expire. Taxes may apply. Payment is handled by Stripe.</p>
    <p>Credits are usage units for Kareer AI with no cash value. They cannot be transferred, exchanged or redeemed for cash. See <a href="/pricing/#request-costs">the credit cost per completed request</a>. One autofill run can make several requests. Failed or invalid results use no credit. Prices and credit amounts can change for future purchases. They never change for a purchase you already made.</p>
  </>;
}

function Terms() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Kareer Terms of Service</h1><p>What Kareer does, what credits are,<br />and what happens when you cancel. See <a href="/pricing/">current pricing</a>.</p><span className="policy-date">Terms of Service · November 21, 2026 · Version 1.2</span></div><div className="reading-layout"><aside className="reading-toc"><span>THE TERMS OF SERVICE</span>{termsSections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="reading-content policy-content">{termsSections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2>{section.id === 'credits' ? <CreditTerms /> : <div dangerouslySetInnerHTML={{ __html: section.html ?? '' }} />}</section>)}</article></div></div>;
}

function Security() {
  return <div className="reading-page wrap">
    <div className="reading-intro">
      <a href="/" className="back-link">← Back to Kareer</a>
      <h1>Kareer Security</h1>
      <p>How Kareer handles application data, protects credentials, and receives vulnerability reports.</p>
    </div>
    <div className="reading-layout">
      <nav className="reading-toc" aria-label="On this page">
        <span>ON THIS PAGE</span>
        {securitySections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
      </nav>
      <article className="reading-content policy-content">
        {securitySections.map(section => <section key={section.id} id={section.id}>
          <h2>{section.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: section.html }} />
        </section>)}
      </article>
    </div>
  </div>;
}

export function App({ page = 'home' }: { page?: string }) {
  const home = page === 'home';
  return <TooltipProvider><a className="skip-link" href="#main">Skip to content</a><Header home={home} /><main id="main">{home ? <Home /> : page === 'setup' ? <Setup /> : page === 'privacy' ? <Privacy /> : page === 'security' ? <Security /> : page === 'terms' ? <Terms /> : page === 'pricing' ? <Pricing /> : page === 'compatibility' ? <Compatibility /> : page === 'tailoring' ? <TailoringGuide /> : <section className="not-found wrap"><h1>This page went<br />off-script.</h1><p>Let’s get you back to something useful.</p><Button asChild className="lime-button"><a href="/">Back to Kareer <Icon name="arrow" /></a></Button></section>}</main><Footer /></TooltipProvider>;
}
