import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { TextReveal } from '@/components/ui/text-reveal';
import { ScrollReveal } from '@/components/scroll-reveal';
import { Icon } from '@/components/site-icon';
import { AutofillDemo } from '@/components/autofill-demo';
import { DocumentStudio } from '@/components/document-studio';
import privacySections from './privacy-content.json';
import termsSections from './terms-content.json';
import offers from '../../src/core/offers.json';
import credits from '../../src/core/credits.json';

const github = 'https://github.com/Amro212/kareer';
const download = '/downloads/kareer-firefox.xpi';

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
      <a className="nav-source" href={github} target="_blank" rel="noopener noreferrer">Open source <Icon name="diagonal" size={14} /></a>
    </nav>
    <Button asChild className="nav-install"><a href="/setup/">Get Kareer <Icon name="arrow" size={16} /></a></Button>
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
    <div className="footer-links"><a href="/setup/">Install & setup</a><a href="/pricing/">Pricing</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href={github} target="_blank" rel="noopener noreferrer">GitHub <Icon name="diagonal" size={14} /></a><a href={`${github}/issues`} target="_blank" rel="noopener noreferrer">Report a bug</a></div>
    <div className="footer-note"><span>Made for the other side of the application.</span><span>Source available · FSL-1.1-MIT{version ? ` · v${version}` : ''}</span></div>
  </footer>;
}

const faqs = [
  ['What does Kareer cost?', `Local features are free. New users get ${credits.trial.credits} free Kareer AI credits to try it. Launch pricing is US$9.99/month for 1,000 credits, or US$4.99 once for 300 credits without a subscription. Filling a page uses 1 credit per AI request; a tailored résumé or cover letter uses ${credits.costs.document}. Managed purchases open after launch verification.`],
  ['Do I need an AI account?', 'No. Kareer AI activates with a reusable Kareer key that appears in Settings when you start the free trial or pay. No Kareer registration or AI provider account is needed. Developers who build Kareer from source can connect their own OpenRouter key instead. Never paste credentials into this website or a job application.'],
  ['Which browsers can I use?', 'Firefox has a directly downloadable signed add-on. Chrome, Edge, and Brave can use a locally built unpacked extension; the Chrome Web Store link is not available yet. See the setup guide for the current installation steps.'],
  ['Will it work on every application?', 'Kareer has dedicated adapters for Workday, Greenhouse, Lever, Ashby, and other systems, plus a generic form engine. Application forms vary and change, so some fields may need your attention. Review the result before sending your application.'],
  ['Does my résumé leave my browser?', 'Your profile and materials are stored locally. Kareer AI sends relevant context through the Kareer gateway to OpenRouter and its downstream provider. A self-built copy using your own key sends context directly to OpenRouter. The gateway keeps billing and usage metadata, not prompts or generated content.'],
  ['Can I review and edit the answers?', 'Yes. Kareer distinguishes saved, inferred, guessed, verified, and unresolved values so you can review the result. You can adjust answers and control Auto Continue and Auto Submit in settings. The website demo shows all five with fictional data.'],
];

function Home() {
  const [run, setRun] = useState(0);
  const [headlinePhase, setHeadlinePhase] = useState<'waiting' | 'playing' | 'done'>('waiting');
  const [demoDone, setDemoDone] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
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
        <TextReveal as="h1" id="hero-title" className="hero-heading" text={'Job hunting\ntakes enough\nout of you.'} split="line" variant="fold" duration={760} stagger={100} onRevealStateChange={setHeadlinePhase} />
        <div className="hero-side">
          <ScrollReveal active={demoDone} duration={0.22} onComplete={() => setCopyDone(true)}><div data-hero-stage="copy"><p className="hero-description">The same forms. The same questions.<br />Your résumé, apparently, wasn’t enough.</p><p className="hero-explanation">Kareer fills repetitive applications from your saved profile, shows where every answer came from, and helps tailor your documents.</p></div></ScrollReveal>
          <ScrollReveal active={copyDone} duration={0.2}><div data-hero-stage="buttons"><div className="hero-actions"><Button size="lg" className="lime-button" onClick={startDemo}>Try the demo <Icon name="play" size={17} /></Button><a href="/setup/" className="text-link">Get Kareer <Icon name="arrow" size={18} /></a></div><div className="hero-reassurance"><Icon name="code" size={15} /><span>Source available. Local work. AI on your terms.</span></div></div></ScrollReveal>
        </div>
      </div>
      <ScrollReveal active={headlinePhase !== 'waiting'} onComplete={() => setDemoDone(true)}><div className="hero-demo-entrance" data-hero-stage="demo"><AutofillDemo run={run} onStart={startDemo} /></div></ScrollReveal>
    </section>
    <section className="compatibility wrap" id="supported-sites" aria-label="Supported application platforms"><p>Same ambition.<br /><strong>Different application portals.</strong></p><div className="ats-list"><span>workday</span><span>Greenhouse</span><span>lever<span className="lime-period">.</span></span><span>ashby</span><span className="ats-more">+ more</span></div></section>
    <section className="benefits-section wrap" id="how-it-works">
      <div className="section-intro"><TextReveal as="h2" text="You bring the ambition. We’ll handle the repetition." variant="rise" split="word" duration={480} stagger={22} /><p>For the fifth application of the evening.<br />And the one you almost didn’t start.</p></div>
      <div className="benefits-grid" id="features"><ScrollReveal><div className="repetition-graphic" aria-hidden="true"><div className="repeat-slip slip-one"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">typed this already.</span></div><div className="repeat-slip slip-two"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">and here.</span></div><div className="repeat-slip slip-three"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">yep, here too.</span></div><div className="one-profile"><Icon name="check" size={20} /> One saved profile.</div></div></ScrollReveal><div className="benefit-list"><ScrollReveal><article><span className="benefit-symbol"><Icon name="file" /></span><div><h3>Meet the form. Skip the déjà vu.</h3><p>Save your profile once. Kareer matches your details to application fields across supported job sites.</p></div></article></ScrollReveal><ScrollReveal delay={0.08}><article><span className="benefit-symbol"><Icon name="sparkles" /></span><div><h3>A little context goes a long way.</h3><p>For questions your profile can’t answer directly, AI uses your experience and the role’s context to help draft an answer.</p></div></article></ScrollReveal><ScrollReveal delay={0.16}><article><span className="benefit-symbol"><Icon name="shield" /></span><div><h3>Your application. Your final say.</h3><p>See where answers came from, edit what needs attention, and choose how Kareer continues and submits.</p></div></article></ScrollReveal></div></div>
    </section>
    <section className="documents-section" id="documents"><div className="wrap documents-layout"><ScrollReveal><div className="documents-copy"><h2>The job is different.<br /><span>Your experience<br />is still yours.</span></h2><p>Turn your saved profile into a tailored résumé and cover letter. Pick a posting to see the same real experience framed for each role, then edit until it sounds like you.</p><ul className="check-list"><li><Icon name="check" size={17} />Grounded in your saved profile</li><li><Icon name="check" size={17} />Editable drafts, saved locally</li><li><Icon name="check" size={17} />Download as PDF or Word</li></ul><a className="text-link" href="/setup/">Put your profile to work <Icon name="arrow" /></a><span className="margin-note" aria-hidden="true">less staring at<br />a blank document.</span></div></ScrollReveal><ScrollReveal delay={0.12}><div className="document-entrance"><DocumentStudio /></div></ScrollReveal></div></section>
    <section className="cost-section wrap" id="install"><div className="cost-copy"><h2>Less setup.<br />Clear spending.</h2><p>Local profile filling stays free. Add Kareer AI when you need answers and tailored documents. Your first {credits.trial.credits} credits are on us.</p><a href="/pricing/" className="text-link">See pricing <Icon name="arrow" /></a></div><ScrollReveal delay={0.08}><div className="cost-receipt"><div className="receipt-heading"><Brand /><span>LAUNCH PRICING</span></div><div className="receipt-row"><span>{offers.monthly.credits.toLocaleString('en-US')} monthly credits</span><strong>{offers.monthly.price}/month</strong></div><div className="receipt-row"><span>{offers.pack.credits} non-expiring credits</span><strong>{offers.pack.price} once</strong></div><div className="receipt-row"><span>Local features</span><strong>Free</strong></div><div className="receipt-row"><span>{credits.trial.credits} trial credits</span><strong>Free</strong></div><p>An autofill AI request costs 1 credit; a tailored résumé or cover letter costs {credits.costs.document}. A run can make multiple requests. Monthly credits expire each paid billing period; packs never expire. No automatic top-ups.</p><p>Managed purchases open after launch verification. Taxes may apply. All sales are final. See the <a href="/terms/">Terms of Service</a> before purchase.</p><div className="receipt-footer"><Icon name="check" size={17} /> No Kareer account. Reusable activation key.</div></div></ScrollReveal></section>
    <section className="privacy-section" id="privacy"><div className="wrap privacy-summary"><div className="privacy-heading"><Icon name="lock" size={35} /><h2>Local-first.<br />Clear about what leaves.</h2></div><div><p>Your profile and files live in your browser. Kareer AI sends relevant context through Kareer’s gateway to OpenRouter and its provider; a self-built copy using your own key sends it directly. The gateway retains payment and request accounting metadata, never prompt bodies or generated content.</p><a href="/privacy/" className="text-link">Read the privacy policy <Icon name="arrow" /></a></div></div></section>
    <section className="faq-section wrap" id="faq"><div><h2>Fair questions.</h2><p>Especially before giving a browser<br />extension your résumé.</p><a href={`${github}/issues`} className="text-link">Ask us on GitHub <Icon name="diagonal" size={16} /></a></div><Accordion type="single" collapsible appearance="faq" className="faq-list">{faqs.map(([question, answer]) => <AccordionItem key={question} value={question}><AccordionTrigger>{question}</AccordionTrigger><AccordionContent><p>{answer}</p></AccordionContent></AccordionItem>)}</Accordion></section>
    <section className="closing-section wrap"><div className="closing-rule" /><ScrollReveal><div><h2>Your next application<br />can be <span>a little less work.</span></h2><Button asChild size="lg" className="lime-button"><a href="/setup/">Get Kareer <Icon name="arrow" /></a></Button><p>Free local filling. {credits.trial.credits} free Kareer AI credits to start.</p></div></ScrollReveal><div className="closing-stamp" aria-hidden="true">LESS BUSYWORK.<br />MORE POSSIBILITY.</div></section>
  </>;
}

function Setup() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>A little setup.<br />A lot less repetition.</h1><p>Install Kareer and save your profile.<br />Try Kareer AI with {credits.trial.credits} free credits.</p></div><div className="reading-layout"><aside className="reading-toc"><span>GET UP AND RUNNING</span><a href="#browser">Install Kareer</a><a href="#key">Activate AI</a><a href="#profile">Save your profile</a><a href="#first-run">Fill your first application</a><a href="#costs">Understand costs</a><a href="#troubleshooting">Need a hand?</a></aside><article className="reading-content">
    <section id="browser"><h2>Install it in your browser.</h2><p>Choose your browser for the installation route available today. Chrome’s store release isn’t available yet.</p><Tabs defaultValue="firefox" variant="underline" className="setup-tabs"><TabsList aria-label="Choose your browser"><TabsTrigger value="firefox">Firefox</TabsTrigger><TabsTrigger value="chrome">Chrome &amp; Edge</TabsTrigger></TabsList><TabsContent value="firefox"><h3>The signed Firefox add-on</h3><p>Download the signed add-on and open it in Firefox. Review Firefox’s permissions prompt, then choose Add. Pin Kareer to your toolbar so it’s easy to find.</p><Button asChild className="lime-button"><a href={download}>Download for Firefox <Icon name="arrow" size={17} /></a></Button><p className="helper-text">Desktop Firefox · signed .xpi · existing update channel</p></TabsContent><TabsContent value="chrome"><h3>A local build for Chromium browsers</h3><p>Chrome, Edge, and Brave currently require a manual developer installation. This route needs Node.js and Git.</p><ol><li>Clone <a href={github}>the Kareer repository</a> and open a terminal in its folder.</li><li>Run <code>npm ci</code>, then <code>npm run build:extension</code>.</li><li>Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and enable Developer mode.</li><li>Choose <strong>Load unpacked</strong> and select the repository’s <code>dist/chrome</code> folder.</li></ol><a className="text-link" href={`${github}#installation`}>Read the source installation guide <Icon name="diagonal" size={16} /></a></TabsContent></Tabs><noscript><p>For other browsers, see <a href={`${github}#installation`}>all installation instructions on GitHub</a>.</p></noscript></section>
    <section id="key"><h2>Activate AI.</h2><p>Local profile filling works immediately. Managed purchases open after launch verification. When available, open <strong>Settings → AI &amp; billing</strong> in the extension and choose Kareer AI.</p><ol><li>Choose <strong>Try Kareer AI free</strong> to get {credits.trial.credits} credits that last {credits.trial.days} days. No payment needed.</li><li>When you want more, choose a plan right there (see <a href="/pricing/">pricing</a>). Stripe’s secure checkout opens for it.</li><li>Pay on Stripe’s checkout. Kareer activates on its own once the payment is confirmed. If you close Settings, it activates the next time you open it within 24 hours.</li><li>Choose <strong>Show key</strong> and keep your Kareer key somewhere safe. Paste it into Activate key on another browser to share the same credits.</li></ol><p>There is no Kareer registration and keys are never emailed. Use Manage billing to cancel or update your card. Lost your key? Email <a href="mailto:amromousa8@gmail.com">amromousa8@gmail.com</a>. Removing the extension does not cancel a subscription.</p><details><summary>Building Kareer yourself?</summary><p>Copies you build from source for personal use can also connect your own OpenRouter key instead of Kareer AI. See the <a href={`${github}#installation`}>GitHub guide</a>. Provider charges are separate.</p></details><div className="reading-callout"><Icon name="lock" /><p>Enter credentials only in Kareer’s extension settings or the userscript’s own settings. Never enter a key into a job application or this website.</p></div></section>
    <section id="profile"><h2>Tell Kareer about you. Once.</h2><p>Open <strong>Profile</strong> and add your contact details, education, work experience, projects, and other relevant facts. Save your changes. More useful context means fewer fields to fix later.</p><p>For tailored résumés and cover letters, use your saved structured profile records. Keep those records current and check generated drafts before downloading.</p></section>
    <section id="first-run"><h2>Meet your next application.</h2><ol><li>Open a job application and launch Kareer.</li><li>Choose <strong>Autofill</strong>. Kareer scans the form and resolves its fields.</li><li>Review the answers and their source labels. Edit anything that needs attention.</li><li>Continue or submit when you’re ready. Auto Continue and Auto Submit are settings you control.</li></ol><p>Want a low-stakes preview first? <a href="/#demo">Try the fictional website demo</a>.</p></section>
    <section id="costs"><h2>Know what each request costs.</h2><p>The monthly plan is US$9.99 per paid billing period for 1,000 credits and renews automatically until cancelled. Monthly credits expire at the period’s end. Cancel in Manage billing; your paid allowance remains usable until its expiry.</p><p>A US$4.99 credit pack adds 300 credits with no expiry. Packs need no subscription and remain after cancellation. Expiring monthly credits are spent first. Taxes may apply.</p><p>Autofill, option discovery, repairs and field rewrites cost 1 credit per completed AI request. Generating a résumé or cover letter costs {credits.costs.document} credits; rewriting part of one costs {credits.costs.documentRewrite}. Automatic follow-ups are separate requests. One application or button click may use multiple credits.</p><p>Oversized inputs are rejected without a charge. Provider errors, timeouts, truncated or malformed completions release their reservation. A validated and settled request remains charged if delivery fails or the application rejects the answer. We do not store completed answers on the server; they cannot be recovered. An explicit retry is a new request and may consume another credit.</p><p>Credits are usage units with no cash value. New keys can claim {credits.trial.credits} free trial credits once; they expire after {credits.trial.days} days. No automatic credit purchases. All sales are final, except where the law requires a refund; see the <a href="/terms/">Terms of Service</a>. Check your balance in Settings. Local filling remains available during outages or credit exhaustion.</p></section>
    <section id="troubleshooting"><h2>A snag? Let’s untangle it.</h2><details><summary>My Kareer key won’t activate<Icon name="plus" size={18} /></summary><p>Choose Kareer AI in Settings and paste the key from Show key on the browser where you bought it. If the service is temporarily unavailable, retry activation later; local filling still works. For a payment problem, open Manage billing. Lost or disabled key? Email <a href="mailto:amromousa8@gmail.com">amromousa8@gmail.com</a>. Don’t share your key in a bug report.</p></details><details><summary>My own OpenRouter key returns “Unauthorized” (self-built copies)<Icon name="plus" size={18} /></summary><p>Check that the correct OpenRouter key was saved. Confirm it hasn’t been revoked and that your OpenRouter account can use the selected model.</p></details><details><summary>A field didn’t fill correctly<Icon name="plus" size={18} /></summary><p>Review the field, check your saved profile and the available choices, and adjust the answer. To refill after editing documents, use Rescan and enable Overwrite Existing if you want to replace filled values. If the problem persists, report the application platform and symptoms on GitHub. Remove applicant details and credentials from anything you share.</p></details><p><a className="text-link" href={`${github}/issues`}>Report a bug on GitHub <Icon name="diagonal" size={16} /></a></p></section>
  </article></div></div>;
}

function Privacy() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Your data.<br />Your business.</h1><p>What stays in your browser. What goes to AI providers.<br />And who has access to what.</p><span className="policy-date">Privacy policy · November 11, 2026 · Version 2.3</span></div><div className="reading-layout"><aside className="reading-toc"><span>THE PRIVACY POLICY</span>{privacySections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="reading-content policy-content">{privacySections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2><div dangerouslySetInnerHTML={{ __html: section.html }} /></section>)}</article></div></div>;
}

function CreditEstimator() {
  const [apps, setApps] = useState(40);
  const low = apps, high = apps * 3;
  const fit = high <= offers.pack.credits ? `A ${offers.pack.price} Credit Pack covers even the high end, and pack credits never expire.`
    : high <= offers.monthly.credits ? 'Kareer Monthly covers even the high end.'
    : 'Kareer Monthly covers the low end. At the high end, add a Credit Pack.';
  return <section className="estimator" aria-labelledby="estimator-title">
    <div className="estimator-copy"><h2 id="estimator-title">Estimate your credits.</h2><p>A rough guide, not a quote. Most applications take 1 to 3 AI requests. A form your saved profile fully answers takes none.</p></div>
    <div className="estimator-card">
      <label htmlFor="estimator-apps"><span>Applications with AI help each month</span><output htmlFor="estimator-apps">{apps}</output></label>
      <input id="estimator-apps" type="range" min={5} max={500} step={5} value={apps} onChange={event => setApps(Number(event.target.value))} style={{ '--fill': `${(apps - 5) / 4.95}%` } as React.CSSProperties} />
      <div className="estimate" aria-live="polite"><strong>{low.toLocaleString('en-US')}–{high.toLocaleString('en-US')}</strong><span>estimated credits a month</span></div>
      <p className="estimate-fit">{fit}</p>
      <p className="estimator-note">Each tailored résumé or cover letter adds {credits.costs.document} credits. Automatic follow-ups count separately.</p>
    </div>
  </section>;
}

function Pricing() {
  const plans = [['monthly', offers.monthly], ['pack', offers.pack]] as const;
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Simple pricing.<br />Pay only for AI.</h1><p>Filling forms from your saved profile is free.<br />Credits cover Kareer AI answers and tailored documents.</p></div>
    <div className="pricing-grid">
      <section className="pricing-card pricing-free" aria-labelledby="plan-free">
        <h2 id="plan-free">Local tools</h2>
        <p className="pricing-price"><strong>Free</strong> <span>always</span></p>
        <ul className="pricing-includes">{['Fill fields from your saved profile', 'Reuse your saved answers', 'Add and fill work and education rows', 'See where every answer came from', 'Profile and documents stay in your browser'].map(item => <li key={item}><Icon name="check" size={15} />{item}</li>)}</ul>
        <Button asChild variant="outline"><a href="/setup/">Install Kareer <Icon name="arrow" size={16} /></a></Button>
      </section>
      {plans.map(([key, offer]) => <section className="pricing-card" key={key} aria-labelledby={`plan-${key}`}>
      <h2 id={`plan-${key}`}>{offer.name}</h2>
      <p className="pricing-price"><strong>{offer.price}</strong> <span>{key === 'monthly' ? 'per month' : 'one-time'}</span></p>
      <p className="pricing-credits">{offer.credits.toLocaleString('en-US')} credits{key === 'monthly' ? ' each month' : ''}</p>
      <p className="pricing-plus"><Icon name="sparkles" size={15} /><span>Everything in Local tools, plus AI answers to open questions and tailored résumés and cover letters.</span></p>
      <p>{offer.terms}</p>
      <Button asChild className="lime-button"><a href="/setup/#browser" aria-describedby="buy-in-extension">Get Kareer to buy <Icon name="arrow" size={16} /></a></Button>
    </section>)}</div>
    <CreditEstimator />
    <div className="reading-content pricing-notes"><section id="buy-in-extension"><h2>Buying starts in the extension.</h2><ol><li>Install Kareer and open <strong>Settings → AI &amp; billing</strong>.</li><li>Choose a plan. Stripe’s secure checkout opens for that plan.</li><li>Kareer activates on its own once the payment is confirmed. Your key is created for the browser you bought from, which is why purchases start there and not on this website.</li></ol><p>Kareer is a form-filling assistant: it fills job application forms from your profile, and you review and submit each application yourself. A completed autofill AI request uses 1 credit; a résumé or cover letter uses {credits.costs.document}. New users can try {credits.trial.credits} free credits first. Credits are usage units with no cash value. Taxes may apply.</p><p>All sales are final: no refunds, except where the law requires one. Read the <a href="/terms/">Terms of Service</a>. Questions or a lost key: <a href="mailto:amromousa8@gmail.com">amromousa8@gmail.com</a>.</p></section></div>
  </div>;
}

function Terms() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Plain terms.<br />No surprises.</h1><p>What Kareer does, what credits are,<br />and what happens when you cancel. See <a href="/pricing/">current pricing</a>.</p><span className="policy-date">Terms of Service · November 11, 2026 · Version 1.1</span></div><div className="reading-layout"><aside className="reading-toc"><span>THE TERMS OF SERVICE</span>{termsSections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="reading-content policy-content">{termsSections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2><div dangerouslySetInnerHTML={{ __html: section.html }} /></section>)}</article></div></div>;
}

export function App({ page = 'home' }: { page?: string }) {
  const home = page === 'home';
  return <TooltipProvider><a className="skip-link" href="#main">Skip to content</a><Header home={home} /><main id="main">{home ? <Home /> : page === 'setup' ? <Setup /> : page === 'privacy' ? <Privacy /> : page === 'terms' ? <Terms /> : page === 'pricing' ? <Pricing /> : <section className="not-found wrap"><h1>This page went<br />off-script.</h1><p>Let’s get you back to something useful.</p><Button asChild className="lime-button"><a href="/">Back to Kareer <Icon name="arrow" /></a></Button></section>}</main><Footer /></TooltipProvider>;
}
