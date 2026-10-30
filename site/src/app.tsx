import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MotionPresence, MotionSurface } from '@/components/ui/presence';
import { TextReveal } from '@/components/ui/text-reveal';
import { ScrollReveal } from '@/components/scroll-reveal';
import { useChoreography } from '@/lib/cojeev-motion/choreography';
import privacySections from './privacy-content.json';
import termsSections from './terms-content.json';

const github = 'https://github.com/Amro212/kareer';
const download = '/downloads/kareer-firefox.xpi';

function Icon({ name = 'arrow', size = 20 }: { name?: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    diagonal: <><path d="M6 18 18 6M6 6h12v12" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    play: <path d="m9 5 10 7-10 7Z" />,
    reset: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /></>,
    file: <><path d="M14 3H5v18h14V8ZM14 3v6h5M8 13h8M8 17h5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.arrow}</svg>;
}

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
      <a href={`${base}#how-it-works`}>How it works</a><a href={`${base}#documents`}>Your documents</a><a href={`${base}#faq`}>FAQ</a>
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
    <div className="footer-links"><a href="/setup/">Install & setup</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href={github} target="_blank" rel="noopener noreferrer">GitHub <Icon name="diagonal" size={14} /></a><a href={`${github}/issues`} target="_blank" rel="noopener noreferrer">Report a bug</a></div>
    <div className="footer-note"><span>Made for the other side of the application.</span><span>Open source · MIT{version ? ` · v${version}` : ''}</span></div>
  </footer>;
}

const sampleFields = [
  { label: 'Full name', value: 'Alex Morgan', source: 'Saved', explanation: 'Copied directly from the fictional sample profile.' },
  { label: 'Email address', value: 'alex@example.com', source: 'Saved', explanation: 'Copied directly from the fictional sample profile.' },
  { label: 'University', value: 'Northfield University', source: 'Saved', explanation: 'Copied from the sample education record.' },
  { label: 'Degree', value: 'BSc, Computer Science', source: 'Saved', explanation: 'Copied from the sample education record.' },
  { label: 'Portfolio', value: 'alex.example.com', source: 'Saved', explanation: 'Copied directly from the fictional sample profile.' },
  { label: 'Why this role?', value: 'I’d love to turn my experience building student tools into thoughtful products for more people.', source: 'Inferred', explanation: 'Inferred from the sample profile and job description.' },
];

function ApplicationDemo({ run, onStart }: { run: number; onStart: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'filling' | 'complete'>('idle');
  const [filled, setFilled] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const { quiet, transition } = useChoreography();
  const complete = phase === 'complete';
  useEffect(() => {
    if (!run) return;
    setSelected(null);
    if (quiet) { setFilled(sampleFields.length); setPhase('complete'); return; }
    setFilled(0);
    setPhase('filling');
    const timers = sampleFields.map((_, index) => window.setTimeout(() => setFilled(index + 1), 250 + index * 140));
    timers.push(window.setTimeout(() => setPhase('complete'), 1250));
    return () => timers.forEach(window.clearTimeout);
  }, [run, quiet]);
  return <div id="demo" className={`demo-desk ${complete ? 'demo-done' : ''}`} aria-label="Interactive fictional application demo">
    <div className="desk-note" aria-hidden="true">your résumé has<br />already answered this.<svg viewBox="0 0 70 45" width="70" height="45"><path d="M4 5q45-5 53 30m-12-7 13 9 6-15" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></div>
    <MotionSurface className="ghost-sheet ghost-back" initial={false} animate={{ rotate: quiet ? 0 : complete ? 0 : -7, x: complete ? 0 : -15, y: complete ? 0 : -12 }} transition={transition} aria-hidden="true"><span>YOUR NEXT APPLICATION</span><b>Full name</b><div /><b>Work experience</b><div /></MotionSurface>
    <MotionSurface className="ghost-sheet ghost-front" initial={false} animate={{ rotate: quiet ? 0 : complete ? 0 : 5, x: complete ? 0 : 13, y: complete ? 0 : -5 }} transition={transition} aria-hidden="true"><span>AND THE ONE AFTER THAT</span><b>Full name. Again.</b><div /><b>Education. Again.</b><div /></MotionSurface>
    <MotionSurface className="application-sheet" initial={false} animate={{ rotate: quiet || complete ? 0 : -1.2 }} transition={transition}>
      <div className="sheet-browser"><span className="browser-dots" aria-hidden="true"><i /><i /><i /></span><span>your next opportunity</span><Icon name="lock" size={12} /></div>
      <div className="sheet-content">
        <div className="application-heading"><div><span className="sample-label">FICTIONAL COMPANY · SAMPLE DATA</span><h2>Junior Product Engineer</h2><span className="job-meta">Early career · Full-time · Your next chapter</span></div><div className="mini-mark" aria-hidden="true"><Icon name="file" size={24} /></div></div>
        <div className="form-caption"><span>Your application</span><span>{filled}/{sampleFields.length} fields</span></div>
        <div className="sample-form">
          {sampleFields.map((field, index) => <div key={field.label} className={`sample-field ${index === 5 ? 'wide-field' : ''} ${filled > index ? 'field-filled' : ''}`}>
            <div className="field-label"><span>{field.label}</span>{filled > index && <Tooltip><TooltipTrigger asChild><button className={`source-tag ${field.source === 'Inferred' ? 'inferred' : ''}`} aria-label={`Explain answer: ${field.label}`} aria-expanded={selected === index} aria-controls="answer-explanation" onClick={() => setSelected(selected === index ? null : index)}>{field.source === 'Saved' && <Icon name="check" size={11} />}{field.source}</button></TooltipTrigger><TooltipContent>Click to inspect this answer’s source</TooltipContent></Tooltip>}</div>
            <div className={`sample-value ${filled > index ? 'has-value' : ''}`}>{filled > index ? <MotionSurface preset="fade" className="answer-value">{field.value}</MotionSurface> : <span className="blank-rule" aria-hidden="true" />}</div>
          </div>)}
        </div>
        <div id="answer-explanation" className="answer-explanation" aria-live="polite">{selected !== null ? <><strong>{sampleFields[selected].source} answer.</strong> {sampleFields[selected].explanation}</> : complete ? <>Your facts stay yours. <strong>Click a source label to take a closer look.</strong></> : <>One profile. Another form. <strong>You know the drill.</strong></>}</div>
        <div className="demo-controls"><div className={`demo-status ${complete ? 'status-complete' : ''}`} role="status"><span className="status-dot" />{complete ? 'Ready for your review' : phase === 'filling' ? 'A little less busywork…' : 'Let’s skip the retyping.'}</div><Button size="sm" className="demo-action" disabled={phase === 'filling'} aria-busy={phase === 'filling'} onClick={onStart}>{phase === 'filling' ? 'Filling…' : complete ? <><Icon name="reset" size={14} />Replay demo</> : <>Autofill <Icon name="arrow" size={15} /></>}</Button></div>
      </div>
    </MotionSurface>
    <MotionPresence>{complete && <MotionSurface key="stamp" preset="settle" className="completion-stamp" aria-hidden="true"><Icon name="check" size={20} /> YOUR EVENING,<br />HANDED BACK.</MotionSurface>}</MotionPresence>
    <div className="demo-footnote"><span>Interactive demo. Fictional data. Nothing submitted.</span><a href="/setup/">Get Kareer <Icon name="arrow" size={14} /></a></div>
    <p className="demo-cost-note">Local tools are free. Optional Kareer AI credits.<br />Advanced users can bring their own key.</p>
  </div>;
}

function DocumentPreview() {
  return <Tabs defaultValue="resume" variant="notebook" className="document-preview">
    <TabsList aria-label="Sample tailored document"><TabsTrigger value="resume">Résumé</TabsTrigger><TabsTrigger value="letter">Cover letter</TabsTrigger></TabsList>
    <TabsContent value="resume"><div className="document-paper"><span className="document-note">ILLUSTRATIVE PREVIEW</span><h3>Alex Morgan</h3><p className="document-contact">alex@example.com · alex.example.com</p><hr /><h4>MADE FOR THIS OPPORTUNITY</h4><p>Computer science graduate who builds practical tools for real people. Bringing hands-on project experience and a thoughtful approach to product engineering.</p><h4>PROJECT EXPERIENCE</h4><strong>Campus Collective</strong><p>Built a student resource directory with accessible search and a responsive interface.</p><div className="document-highlight">Your experience. More relevant framing.</div><h4>EDUCATION</h4><p>BSc, Computer Science<br />Northfield University</p></div></TabsContent>
    <TabsContent value="letter"><div className="document-paper"><span className="document-note">ILLUSTRATIVE PREVIEW</span><h3>A proper introduction.</h3><p className="document-contact">Alex Morgan · Junior Product Engineer</p><hr /><p>Dear hiring team,</p><p>Building tools for my campus taught me that the best products start with listening. I’d love to bring that same curiosity to your product engineering team.</p><p>For Campus Collective, I built an accessible student resource directory. Working through search, navigation, and feedback helped me connect technical decisions to the people using the product.</p><div className="document-highlight">Less blank-page panic. More your voice.</div><p>I’d welcome the chance to discuss how that experience could contribute to your team.</p><p>Best,<br />Alex Morgan</p></div></TabsContent>
  </Tabs>;
}

const faqs = [
  ['What does Kareer cost?', 'Local features are free and open source. Launch pricing for managed AI is US$10/month for 1,000 credits, or US$5 once for 300 credits without a subscription. Each completed AI request costs one credit. Advanced BYOK remains available with separate provider charges. Managed purchases open after launch verification.'],
  ['Do I need an AI account?', 'No. Kareer AI activates with a reusable Kareer key that appears in Settings after you pay. No Kareer registration or AI provider account is needed. Advanced BYOK users can instead connect a personal OpenRouter key in Settings. Never paste credentials into this website or a job application.'],
  ['Which browsers can I use?', 'Firefox has a directly downloadable signed add-on. Chrome, Edge, and Brave can use a locally built unpacked extension; the Chrome Web Store link is not available yet. A userscript build is also available for compatible managers. See the setup guide for the current installation steps.'],
  ['Will it work on every application?', 'Kareer has dedicated adapters for Workday, Greenhouse, Lever, Ashby, and other systems, plus a generic form engine. Application forms vary and change, so some fields may need your attention. Review the result before sending your application.'],
  ['Does my résumé leave my browser?', 'Your profile and materials are stored locally. Managed AI sends relevant context through the Kareer gateway to OpenRouter and its downstream provider. Advanced BYOK sends context directly to your selected provider through OpenRouter. The gateway keeps billing and usage metadata, not prompts or generated content.'],
  ['Can I review and edit the answers?', 'Yes. Kareer distinguishes saved, inferred, guessed, verified, and unresolved values so you can review the result. You can adjust answers and control Auto Continue and Auto Submit in settings. The website demo shows a simplified saved/inferred example.'],
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
        <ScrollReveal active={headlinePhase === 'done' && demoDone} duration={0.4} onComplete={() => setCopyDone(true)}><div data-hero-stage="copy"><p className="hero-description">The same forms. The same questions.<br />Your résumé, apparently, wasn’t enough.</p><p className="hero-explanation">Kareer fills repetitive applications and helps tailor your documents. Give the busywork less of your day.</p></div></ScrollReveal>
        <ScrollReveal active={copyDone} duration={0.35}><div data-hero-stage="buttons"><div className="hero-actions"><Button size="lg" className="lime-button" onClick={startDemo}>Try the demo <Icon name="play" size={17} /></Button><a href="/setup/" className="text-link">Get Kareer <Icon name="arrow" size={18} /></a></div><div className="hero-reassurance"><Icon name="code" size={15} /><span>Open source. Local work. AI on your terms.</span></div></div></ScrollReveal>
      </div>
      <ScrollReveal active={headlinePhase !== 'waiting'} onComplete={() => setDemoDone(true)}><div className="hero-demo-entrance" data-hero-stage="demo"><ApplicationDemo run={run} onStart={startDemo} /></div></ScrollReveal>
    </section>
    <section className="compatibility wrap" id="supported-sites" aria-label="Supported application platforms"><p>Same ambition.<br /><strong>Different application portals.</strong></p><div className="ats-list"><span>workday</span><span>Greenhouse</span><span>lever<span className="lime-period">.</span></span><span>ashby</span><span className="ats-more">+ more</span></div></section>
    <section className="benefits-section wrap" id="how-it-works">
      <div className="section-intro"><TextReveal as="h2" text="You bring the ambition. We’ll handle the repetition." variant="rise" split="word" duration={480} stagger={22} /><p>For the fifth application of the evening.<br />And the one you almost didn’t start.</p></div>
      <div className="benefits-grid" id="features"><ScrollReveal><div className="repetition-graphic" aria-hidden="true"><div className="repeat-slip slip-one"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">typed this already.</span></div><div className="repeat-slip slip-two"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">and here.</span></div><div className="repeat-slip slip-three"><span>FULL NAME</span><b>Alex Morgan</b><span className="repeat-comment">yep, here too.</span></div><div className="one-profile"><Icon name="check" size={20} /> One saved profile.</div></div></ScrollReveal><div className="benefit-list"><ScrollReveal><article><span className="benefit-symbol"><Icon name="file" /></span><div><h3>Meet the form. Skip the déjà vu.</h3><p>Save your profile once. Kareer matches your details to application fields across supported job sites.</p></div></article></ScrollReveal><ScrollReveal delay={0.08}><article><span className="benefit-symbol"><Icon name="code" /></span><div><h3>A little context goes a long way.</h3><p>For questions your profile can’t answer directly, AI uses your experience and the role’s context to help draft an answer.</p></div></article></ScrollReveal><ScrollReveal delay={0.16}><article><span className="benefit-symbol"><Icon name="check" /></span><div><h3>Your application. Your final say.</h3><p>See where answers came from, edit what needs attention, and choose how Kareer continues and submits.</p></div></article></ScrollReveal></div></div>
    </section>
    <section className="documents-section" id="documents"><div className="wrap documents-layout"><ScrollReveal><div className="documents-copy"><h2>The job is different.<br /><span>Your experience<br />is still yours.</span></h2><p>Turn your saved profile into a tailored résumé and cover letter. Keep your real experience, put the relevant parts forward, and edit until it sounds like you.</p><ul className="check-list"><li><Icon name="check" size={17} />Grounded in your saved profile</li><li><Icon name="check" size={17} />Editable drafts, saved locally</li><li><Icon name="check" size={17} />Download as PDF or Word</li></ul><a className="text-link" href="/setup/">Put your profile to work <Icon name="arrow" /></a><span className="margin-note" aria-hidden="true">less staring at<br />a blank document.</span></div></ScrollReveal><ScrollReveal delay={0.12}><div className="document-entrance"><DocumentPreview /></div></ScrollReveal></div></section>
    <section className="cost-section wrap" id="install"><div className="cost-copy"><h2>Less setup.<br />Clear spending.</h2><p>Local profile filling stays free. Add Kareer AI when you need answers and tailored documents, or use your own provider key.</p><a href="/setup/#costs" className="text-link">How credits work <Icon name="arrow" /></a></div><ScrollReveal delay={0.08}><div className="cost-receipt"><div className="receipt-heading"><Brand /><span>LAUNCH PRICING</span></div><div className="receipt-row"><span>1,000 monthly credits</span><strong>US$10/month</strong></div><div className="receipt-row"><span>300 non-expiring credits</span><strong>US$5 once</strong></div><div className="receipt-row"><span>Local features</span><strong>Free</strong></div><p>One completed AI request costs one credit. A run can make multiple requests. Monthly credits expire each paid billing period; packs never expire. No automatic top-ups.</p><p>Managed purchases open after launch verification. Taxes may apply. All sales are final. See the <a href="/terms/">Terms of Service</a> before purchase.</p><div className="receipt-footer"><Icon name="check" size={17} /> No Kareer account. Reusable activation key.</div></div></ScrollReveal></section>
    <section className="privacy-section" id="privacy"><div className="wrap privacy-summary"><div className="privacy-heading"><Icon name="lock" size={35} /><h2>Local-first.<br />Clear about what leaves.</h2></div><div><p>Your profile and files live in your browser. Managed AI sends relevant context through Kareer’s gateway to OpenRouter and its provider; BYOK sends it directly. The gateway retains payment and request accounting metadata, never prompt bodies or generated content.</p><a href="/privacy/" className="text-link">Read the privacy policy <Icon name="arrow" /></a></div></div></section>
    <section className="faq-section wrap" id="faq"><div><h2>Fair questions.</h2><p>Especially before giving a browser<br />extension your résumé.</p><a href={`${github}/issues`} className="text-link">Ask us on GitHub <Icon name="diagonal" size={16} /></a></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<Icon name="plus" size={20} /></summary><p>{answer}</p></details>)}</div></section>
    <section className="closing-section wrap"><div className="closing-rule" /><ScrollReveal><div><h2>Your next application<br />can be <span>a little less work.</span></h2><Button asChild size="lg" className="lime-button"><a href="/setup/">Get Kareer <Icon name="arrow" /></a></Button><p>Optional Kareer AI credits. Advanced BYOK. Your call.</p></div></ScrollReveal><div className="closing-stamp" aria-hidden="true">LESS BUSYWORK.<br />MORE POSSIBILITY.</div></section>
  </>;
}

function Setup() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>A little setup.<br />A lot less repetition.</h1><p>Install Kareer and save your profile.<br />Activate optional Kareer AI or bring your own key.</p></div><div className="reading-layout"><aside className="reading-toc"><span>GET UP AND RUNNING</span><a href="#browser">Install Kareer</a><a href="#key">Activate AI</a><a href="#profile">Save your profile</a><a href="#first-run">Fill your first application</a><a href="#costs">Understand costs</a><a href="#troubleshooting">Need a hand?</a></aside><article className="reading-content">
    <section id="browser"><h2>Install it in your browser.</h2><p>Choose your browser for the installation route available today. Chrome’s store release isn’t available yet.</p><Tabs defaultValue="firefox" variant="underline" className="setup-tabs"><TabsList aria-label="Choose your browser"><TabsTrigger value="firefox">Firefox</TabsTrigger><TabsTrigger value="chrome">Chrome &amp; Edge</TabsTrigger><TabsTrigger value="userscript">Userscript</TabsTrigger></TabsList><TabsContent value="firefox"><h3>The signed Firefox add-on</h3><p>Download the signed add-on and open it in Firefox. Review Firefox’s permissions prompt, then choose Add. Pin Kareer to your toolbar so it’s easy to find.</p><Button asChild className="lime-button"><a href={download}>Download for Firefox <Icon name="arrow" size={17} /></a></Button><p className="helper-text">Desktop Firefox · signed .xpi · existing update channel</p></TabsContent><TabsContent value="chrome"><h3>A local build for Chromium browsers</h3><p>Chrome, Edge, and Brave currently require a manual developer installation. This route needs Node.js and Git.</p><ol><li>Clone <a href={github}>the Kareer repository</a> and open a terminal in its folder.</li><li>Run <code>npm ci</code>, then <code>npm run build:extension</code>.</li><li>Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and enable Developer mode.</li><li>Choose <strong>Load unpacked</strong> and select the repository’s <code>dist/chrome</code> folder.</li></ol><a className="text-link" href={`${github}#installation`}>Read the source installation guide <Icon name="diagonal" size={16} /></a></TabsContent><TabsContent value="userscript"><h3>Use a userscript manager</h3><p>For compatible desktop browsers with Tampermonkey or Violentmonkey installed.</p><ol><li>Clone the repository and run <code>npm ci</code>.</li><li>Run <code>npm run build:userscript</code>.</li><li>Import <code>dist/kareer.user.js</code> into your userscript manager and enable it.</li></ol><a className="text-link" href={`${github}#installation`}>See userscript instructions <Icon name="diagonal" size={16} /></a></TabsContent></Tabs><noscript><p>For other browsers, see <a href={`${github}#installation`}>all installation instructions on GitHub</a>.</p></noscript></section>
    <section id="key"><h2>Activate AI.</h2><p>Local profile filling works immediately. Managed purchases open after launch verification. When available, open <strong>Settings → AI &amp; billing</strong> in the extension and choose Kareer AI.</p><ol><li>Choose View plans to compare current offers and review their terms on the hosted purchase page.</li><li>Pay on Stripe’s secure checkout. Kareer activates on its own once the payment is confirmed. If you close Settings, it activates the next time you open it within 24 hours.</li><li>Choose <strong>Show key</strong> and keep your Kareer key somewhere safe. Paste it into Activate key on another browser to share the same credits.</li></ol><p>There is no Kareer registration and keys are never emailed. Use Manage billing to cancel or update your card. Lost your key? Email <a href="mailto:amromousa8@gmail.com">amromousa8@gmail.com</a>. Removing the extension does not cancel a subscription.</p><details><summary>Advanced: use my own OpenRouter key</summary><p>Select advanced BYOK explicitly in Settings, paste your personal OpenRouter key, choose a model and save. The userscript uses BYOK only. Provider charges are separate. Kareer never silently uses your personal key when managed credits run out.</p></details><div className="reading-callout"><Icon name="lock" /><p>Enter credentials only in Kareer’s extension settings or the userscript’s own settings. Never enter a key into a job application or this website.</p></div></section>
    <section id="profile"><h2>Tell Kareer about you. Once.</h2><p>Open <strong>Profile</strong> and add your contact details, education, work experience, projects, and other relevant facts. Save your changes. More useful context means fewer fields to fix later.</p><p>For tailored résumés and cover letters, use your saved structured profile records. Keep those records current and check generated drafts before downloading.</p></section>
    <section id="first-run"><h2>Meet your next application.</h2><ol><li>Open a job application and launch Kareer.</li><li>Choose <strong>Autofill</strong>. Kareer scans the form and resolves its fields.</li><li>Review the answers and their source labels. Edit anything that needs attention.</li><li>Continue or submit when you’re ready. Auto Continue and Auto Submit are settings you control.</li></ol><p>Want a low-stakes preview first? <a href="/#demo">Try the fictional website demo</a>.</p></section>
    <section id="costs"><h2>Know what each request costs.</h2><p>The monthly plan is US$10 per paid billing period for 1,000 credits and renews automatically until cancelled. Monthly credits expire at the period’s end. Cancel in Manage billing; your paid allowance remains usable until its expiry.</p><p>A US$5 credit pack adds 300 credits with no expiry. Packs need no subscription and remain after cancellation. Expiring monthly credits are spent first. Taxes may apply.</p><p>Every completed AI request costs one credit: autofill, option discovery, repairs, field rewrites, résumés and cover letters. Automatic follow-ups are separate requests. One application or button click may use multiple credits.</p><p>Oversized inputs are rejected without a charge. Provider errors, timeouts, truncated or malformed completions release their reservation. A validated and settled request remains charged if delivery fails or the application rejects the answer. We do not store completed answers on the server; they cannot be recovered. An explicit retry is a new request and may consume another credit.</p><p>Credits are usage units with no cash value. No free trial or automatic credit purchases. All sales are final, except where the law requires a refund; see the <a href="/terms/">Terms of Service</a>. Check your balance in Settings. Local filling remains available during outages or credit exhaustion. Advanced BYOK has separate provider pricing.</p></section>
    <section id="troubleshooting"><h2>A snag? Let’s untangle it.</h2><details><summary>My Kareer key won’t activate<Icon name="plus" size={18} /></summary><p>Choose Kareer AI in Settings and paste the key from Show key on the browser where you bought it. If the service is temporarily unavailable, retry activation later; local filling still works. For a payment problem, open Manage billing. Lost or disabled key? Email <a href="mailto:amromousa8@gmail.com">amromousa8@gmail.com</a>. Don’t share your key in a bug report.</p></details><details><summary>My advanced BYOK key returns “Unauthorized”<Icon name="plus" size={18} /></summary><p>Choose advanced BYOK and check that the correct OpenRouter key was saved. Confirm it hasn’t been revoked and that your OpenRouter account can use the selected model.</p></details><details><summary>A field didn’t fill correctly<Icon name="plus" size={18} /></summary><p>Review the field, check your saved profile and the available choices, and adjust the answer. To refill after editing documents, use Rescan and enable Overwrite Existing if you want to replace filled values. If the problem persists, report the application platform and symptoms on GitHub. Remove applicant details and credentials from anything you share.</p></details><p><a className="text-link" href={`${github}/issues`}>Report a bug on GitHub <Icon name="diagonal" size={16} /></a></p></section>
  </article></div></div>;
}

function Privacy() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Your data.<br />Your business.</h1><p>What stays in your browser. What goes to AI providers.<br />And who has access to what.</p><span className="policy-date">Privacy policy · October 17, 2026 · Version 2.0</span></div><div className="reading-layout"><aside className="reading-toc"><span>THE PRIVACY POLICY</span>{privacySections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="reading-content policy-content">{privacySections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2><div dangerouslySetInnerHTML={{ __html: section.html }} /></section>)}</article></div></div>;
}

function Terms() {
  return <div className="reading-page wrap"><div className="reading-intro"><a href="/" className="back-link">← Back to Kareer</a><h1>Plain terms.<br />No surprises.</h1><p>What Kareer does, what credits are,<br />and what happens when you cancel.</p><span className="policy-date">Terms of Service · October 30, 2026 · Version 1.0</span></div><div className="reading-layout"><aside className="reading-toc"><span>THE TERMS OF SERVICE</span>{termsSections.map(section => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="reading-content policy-content">{termsSections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2><div dangerouslySetInnerHTML={{ __html: section.html }} /></section>)}</article></div></div>;
}

export function App({ page = 'home' }: { page?: string }) {
  const home = page === 'home';
  return <TooltipProvider><a className="skip-link" href="#main">Skip to content</a><Header home={home} /><main id="main">{home ? <Home /> : page === 'setup' ? <Setup /> : page === 'privacy' ? <Privacy /> : page === 'terms' ? <Terms /> : <section className="not-found wrap"><h1>This page went<br />off-script.</h1><p>Let’s get you back to something useful.</p><Button asChild className="lime-button"><a href="/">Back to Kareer <Icon name="arrow" /></a></Button></section>}</main><Footer /></TooltipProvider>;
}
