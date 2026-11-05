import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Switch, SwitchRow } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MotionPresence, MotionSurface } from '@/components/ui/presence';
import { useChoreography } from '@/lib/cojeev-motion/choreography';
import { Icon } from '@/components/site-icon';

type State = 'saved' | 'verified' | 'inferred' | 'guessed' | 'unresolved';
type Section = 'info' | 'exp1' | 'exp2' | 'edu' | 'questions';
type Field = { id: string; label: string; value: string; state: State; section: Section; record: string; why: string; kind?: 'select' | 'date' | 'textarea'; prefilled?: boolean; required?: boolean };

const states: Record<State, { label: string; icon?: string; meaning: string }> = {
  saved: { label: 'Saved', icon: 'check', meaning: 'Copied from your profile or a saved answer.' },
  verified: { label: 'Verified', icon: 'shield', meaning: 'Filled, then confirmed on the page.' },
  inferred: { label: 'Inferred', icon: 'sparkles', meaning: 'Drafted from your facts and the job description.' },
  guessed: { label: 'Guessed', icon: 'alert', meaning: 'Best guess from context. Check before submitting.' },
  unresolved: { label: 'Unresolved', meaning: 'Nothing to go on yet.' },
};
const order: State[] = ['saved', 'verified', 'inferred', 'guessed', 'unresolved'];

const fields: Field[] = [
  { id: 'first', label: 'First name', value: 'Alex', state: 'saved', section: 'info', record: 'contact', why: 'Copied from your contact details.', required: true },
  { id: 'last', label: 'Last name', value: 'Morgan', state: 'saved', section: 'info', record: 'contact', why: 'Copied from your contact details.', required: true },
  { id: 'email', label: 'Email', value: 'alex.morgan@example.com', state: 'saved', section: 'info', record: 'contact', why: 'Copied from your contact details.', required: true },
  { id: 'phone', label: 'Phone', value: '(555) 010-4477', state: 'saved', section: 'info', record: 'contact', why: 'Copied from your contact details.' },
  { id: 'country', label: 'Country', value: 'Canada', state: 'verified', section: 'info', record: 'contact', kind: 'select', why: 'Picked “Canada” from 195 options, then confirmed the dropdown kept it.', required: true },
  { id: 'city', label: 'City', value: 'Toronto', state: 'saved', section: 'info', record: 'contact', why: 'Copied from your contact details.' },
  { id: 'exp1-title', label: 'Job title', value: 'Student Developer', state: 'verified', section: 'exp1', record: 'campus', prefilled: true, why: 'Already on the page from résumé parsing. Kareer matched it to your saved role instead of retyping it.' },
  { id: 'exp1-company', label: 'Company', value: 'Campus Collective', state: 'verified', section: 'exp1', record: 'campus', prefilled: true, why: 'Already on the page from résumé parsing. Kareer matched it to your saved role instead of retyping it.' },
  { id: 'exp1-from', label: 'From', value: '09/2024', state: 'verified', section: 'exp1', record: 'campus', kind: 'date', why: 'Typed into the date picker from your saved role, then confirmed the page accepted it.' },
  { id: 'exp1-to', label: 'To', value: '04/2026', state: 'verified', section: 'exp1', record: 'campus', kind: 'date', why: 'Typed into the date picker from your saved role, then confirmed the page accepted it.' },
  { id: 'exp1-desc', label: 'Role description', value: 'Built an accessible student resource directory used across campus.', state: 'saved', section: 'exp1', record: 'campus', kind: 'textarea', why: 'The parser left this empty. Kareer completed the existing row from your saved role.' },
  { id: 'exp2-title', label: 'Job title', value: 'IT Help Desk Assistant', state: 'saved', section: 'exp2', record: 'helpdesk', why: 'Kareer added this row because your profile has a second role the page didn’t have yet.' },
  { id: 'exp2-company', label: 'Company', value: 'Northfield University', state: 'saved', section: 'exp2', record: 'helpdesk', why: 'Copied from your second saved role.' },
  { id: 'exp2-from', label: 'From', value: '05/2023', state: 'verified', section: 'exp2', record: 'helpdesk', kind: 'date', why: 'Typed into the date picker from your saved role, then confirmed the page accepted it.' },
  { id: 'exp2-to', label: 'To', value: '08/2024', state: 'verified', section: 'exp2', record: 'helpdesk', kind: 'date', why: 'Typed into the date picker from your saved role, then confirmed the page accepted it.' },
  { id: 'exp2-desc', label: 'Role description', value: 'Resolved hardware and account issues for students and staff.', state: 'saved', section: 'exp2', record: 'helpdesk', kind: 'textarea', why: 'Copied from your second saved role.' },
  { id: 'school', label: 'School', value: 'Northfield University', state: 'verified', section: 'edu', record: 'education', kind: 'select', why: 'Searched the school list, chose the matching entry, then confirmed the selection.', required: true },
  { id: 'degree', label: 'Degree', value: 'Bachelor’s', state: 'verified', section: 'edu', record: 'education', kind: 'select', why: 'Matched “BSc” in your profile to the form’s “Bachelor’s” option.', required: true },
  { id: 'major', label: 'Field of study', value: 'Computer Science', state: 'saved', section: 'edu', record: 'education', why: 'Copied from your education record.' },
  { id: 'authorized', label: 'Are you legally authorized to work in Canada?', value: 'Yes', state: 'saved', section: 'questions', record: 'answers', kind: 'select', why: 'You answered this exact question before. Kareer reused your saved answer.', required: true },
  { id: 'sponsor', label: 'Will you now or in the future require sponsorship?', value: 'No', state: 'saved', section: 'questions', record: 'answers', kind: 'select', why: 'You answered this exact question before. Kareer reused your saved answer.', required: true },
  { id: 'why', label: 'Why do you want to work at Northwind Labs?', value: 'Building tools for people who just need software to work is what I enjoyed most at Campus Collective. Northwind’s focus on small clinics is that same problem, with higher stakes.', state: 'inferred', section: 'questions', record: 'campus', kind: 'textarea', why: 'No saved answer for this question. Drafted from your Campus Collective role and the job description’s focus on small clinics. Edit it to sound like you.', required: true },
  { id: 'heard', label: 'How did you hear about this role?', value: 'Company careers page', state: 'guessed', section: 'questions', record: 'none', kind: 'select', why: 'Unresolved after the first pass: no saved answer and nothing in your profile. A second pass picked the likeliest option instead of leaving a required field empty. Check it before you submit.', required: true },
];
const byId = Object.fromEntries(fields.map(field => [field.id, field]));
const ofSection = (section: Section) => fields.filter(field => field.section === section);

const records = [
  { id: 'contact', title: 'Contact', lines: ['Alex Morgan', 'alex.morgan@example.com · (555) 010-4477', 'Toronto, Canada'] },
  { id: 'campus', title: 'Experience', lines: ['Student Developer · Campus Collective', 'Sep 2024 – Apr 2026', 'Built an accessible student resource directory used across campus.'] },
  { id: 'helpdesk', title: 'Experience', lines: ['IT Help Desk Assistant · Northfield University', 'May 2023 – Aug 2024', 'Resolved hardware and account issues for students and staff.'] },
  { id: 'education', title: 'Education', lines: ['Northfield University', 'BSc, Computer Science · 2026'] },
  { id: 'answers', title: 'Saved answers', lines: ['Legally authorized to work in Canada? → Yes', 'Require sponsorship? → No'] },
];

type Action = { delay: number; status?: string; fill?: string; unresolved?: string; row?: 'match' | 'add'; thinking?: boolean; done?: boolean };
const fill = (ids: string[], first = 110): Action[] => ids.map((id, index) => ({ delay: index ? 110 : first, fill: id }));
const script: Action[] = [
  { delay: 0, status: 'Scanning the page…', thinking: true },
  { delay: 600, status: `Found ${fields.length} fields. Filling from your saved profile.` },
  ...fill(ofSection('info').map(field => field.id)),
  { delay: 260, status: 'Work experience: your résumé already started row 1. Matching it.', row: 'match' },
  ...fill(ofSection('exp1').map(field => field.id), 380),
  { delay: 260, status: 'Your profile has a second role. Adding row 2.', row: 'add' },
  ...fill(ofSection('exp2').map(field => field.id), 480),
  { delay: 240, status: 'Education and saved answers.' },
  ...fill(['school', 'degree', 'major', 'authorized', 'sponsor']),
  { delay: 260, status: 'Asking Kareer AI: 2 open questions, one request.', thinking: true },
  { delay: 1100, fill: 'why', status: 'Verifying what landed on the page…' },
  { delay: 420, unresolved: 'heard', status: '1 required field still unresolved.' },
  { delay: 700, status: 'Second pass: inferring it from context.', thinking: true },
  { delay: 950, fill: 'heard' },
  { delay: 380, done: true, status: 'Ready for your review' },
];

function derive(step: number) {
  const values: Record<string, State> = {};
  let status = 'Workday-style form detected.', matched = false, added = false, done = false, active = '';
  for (const action of script.slice(0, step)) {
    if (action.status) status = action.status;
    if (action.fill) { values[action.fill] = byId[action.fill].state; active = action.fill; }
    if (action.unresolved) { values[action.unresolved] = 'unresolved'; active = action.unresolved; }
    if (action.row === 'match') matched = true;
    if (action.row === 'add') added = true;
    if (action.done) done = true;
  }
  return { values, status, matched, added, done, active, thinking: !!script[step - 1]?.thinking };
}

function StateBadge({ state }: { state: State }) {
  const info = states[state];
  return <MotionPresence mode="popLayout"><MotionSurface key={state} preset="settle" className="state-badge-motion">
    <Badge size="sm" variant={state === 'unresolved' ? 'dashed' : 'default'} className="state-badge" data-kind={state}>{info.icon && <Icon name={info.icon} size={11} feedback={false} />}{info.label}</Badge>
  </MotionSurface></MotionPresence>;
}

function FormField({ field, state, active, selected, onSelect }: { field: Field; state?: State; active: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const value = state && state !== 'unresolved' ? field.value : field.prefilled ? field.value : '';
  return <div className={`ats-field ${field.kind === 'textarea' ? 'ats-wide' : ''}`} data-field={field.id} data-state={state} data-active={active || undefined} data-selected={selected || undefined}>
    <div className="ats-label"><span>{field.label}{field.required && <i aria-hidden="true">*</i>}</span>
      {state && <button type="button" className="field-chip" aria-label={`Explain answer: ${field.label}`} aria-pressed={selected} onClick={() => onSelect(field.id)}><StateBadge state={state} /></button>}
    </div>
    <div className="ats-input" data-kind={field.kind}>
      {value ? <MotionSurface key={value} preset="fade" className="ats-value">{value}</MotionSurface> : <span className="ats-placeholder">{field.kind === 'select' ? 'Select one' : field.kind === 'date' ? 'MM/YYYY' : ''}</span>}
      {field.kind === 'select' && <svg className="ats-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>}
    </div>
  </div>;
}

export function AutofillDemo({ run, onStart }: { run: number; onStart: () => void }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState('run');
  const [sheetOpen, setSheetOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { quiet } = useChoreography();
  const { values, status, matched, added, done, active, thinking } = derive(step);
  const running = step > 0 && !done;
  const filledCount = fields.filter(field => (values[field.id] && values[field.id] !== 'unresolved') || (field.prefilled && !values[field.id])).length;
  const counts = order.map(state => [state, Object.values(values).filter(value => value === state).length] as const);

  useEffect(() => {
    if (!run) return;
    setSelected(null);
    setTab('run');
    if (quiet) { setStep(script.length); return; }
    let index = 1, timer = 0;
    setStep(1);
    const next = () => { if (index < script.length) timer = window.setTimeout(() => { index += 1; setStep(index); next(); }, script[index].delay); };
    next();
    return () => window.clearTimeout(timer);
  }, [run, quiet]);

  const reveal = (id: string) => {
    const box = scroller.current, element = box?.querySelector<HTMLElement>(`[data-field="${id}"]`);
    if (!box || !element) return;
    const top = element.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight * 0.3;
    box.scrollTo({ top, behavior: quiet ? 'auto' : 'smooth' });
  };
  useEffect(() => { if (active && running) reveal(active); }, [active]);

  const select = (id: string) => {
    const next = selected === id ? null : id;
    setSelected(next);
    setTab('run');
    if (next) { setSheetOpen(true); reveal(next); }
  };
  const chosen = selected ? byId[selected] : null;
  const row = (section: Section) => ofSection(section).map(field => <FormField key={field.id} field={field} state={values[field.id]} active={active === field.id && running} selected={selected === field.id} onSelect={select} />);

  return <div id="demo" className={`demo-stage ${done ? 'demo-done' : ''}`} aria-label="Interactive fictional application demo">
    <div className="desk-note" aria-hidden="true">your résumé has<br />already answered this.<svg viewBox="0 0 70 45" width="70" height="45"><path d="M4 5q45-5 53 30m-12-7 13 9 6-15" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></div>
    <div className="demo-window">
      <div className="window-bar"><span className="browser-dots" aria-hidden="true"><i /><i /><i /></span><span className="window-url"><Icon name="lock" size={11} feedback={false} />careers.northwind.example/apply</span><span className="window-tag">Fictional company · sample data</span></div>
      <div className="window-body">
        <div className="ats-page" ref={scroller}>
          <div className="ats-header"><span className="ats-logo" aria-hidden="true">N</span><div><span className="ats-company">Northwind Labs · Careers</span><h2>Junior Product Engineer</h2><p>Build simple, reliable tools for small clinics. Toronto · Hybrid · Full-time</p></div></div>
          <ol className="ats-steps" aria-label="Application steps"><li data-current>My information</li><li>Experience</li><li>Questions</li><li>Review</li></ol>
          <section className="ats-section" aria-label="My information"><h3>My information</h3><div className="ats-grid">{row('info')}</div></section>
          <section className="ats-section" aria-label="Work experience"><h3>Work experience</h3>
            <div className="ats-row" data-matched={matched || undefined}><div className="ats-row-head"><span>Work experience 1</span>{matched && <MotionSurface preset="settle" className="row-note">Matched to your saved role</MotionSurface>}</div><div className="ats-grid">{row('exp1')}</div></div>
            <MotionPresence>{added && <MotionSurface key="row2" preset="mask" className="ats-row" data-added><div className="ats-row-head"><span>Work experience 2</span><span className="row-note">Added by Kareer</span></div><div className="ats-grid">{row('exp2')}</div></MotionSurface>}</MotionPresence>
            <span className={`ats-add ${added ? 'is-used' : ''}`} aria-hidden="true"><Icon name="plus" size={13} feedback={false} />Add another</span>
          </section>
          <section className="ats-section" aria-label="Education"><h3>Education</h3><div className="ats-grid">{row('edu')}</div></section>
          <section className="ats-section" aria-label="Application questions"><h3>Application questions</h3><div className="ats-grid ats-questions">{row('questions')}</div></section>
          <div className="ats-submit" aria-hidden="true"><span>Save draft</span><b>Review application</b></div>
        </div>

        <aside className="kareer-panel" data-open={sheetOpen || undefined} aria-label="Kareer panel (demo)">
          <button type="button" className="sheet-handle" aria-expanded={sheetOpen} aria-label={sheetOpen ? 'Collapse Kareer panel' : 'Expand Kareer panel'} onClick={() => setSheetOpen(!sheetOpen)}><span /></button>
          <div className="panel-head"><span className="panel-brand"><img src="/assets/kareer-mark.svg" width="18" height="18" alt="" />kareer<b>.</b></span><span className="panel-chip">Kareer AI</span></div>
          <Tabs value={tab} onValueChange={value => { setTab(value); setSheetOpen(true); }} variant="underline" className="panel-tabs">
            <TabsList aria-label="Kareer panel sections"><TabsTrigger value="run">Run</TabsTrigger><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>
            <TabsContent value="run" className="panel-body">
              <div className="panel-detect"><span>Workday-style form</span><span>{fields.length} fields</span></div>
              <Button className="lime-button panel-action" disabled={running} aria-busy={running} onClick={onStart}>{running ? 'Filling…' : done ? <><Icon name="reset" size={15} />Replay demo</> : <><Icon name="play" size={15} />Autofill Workday-style form</>}</Button>
              <div className={`panel-status ${done ? 'status-complete' : ''}`} role="status">{thinking ? <Spinner className="panel-spinner" aria-hidden="true" role="presentation" /> : <span className="status-dot" />}<span>{status}</span></div>
              <Progress appearance="line" size="sm" value={filledCount} max={fields.length} aria-label="Fields filled" className="panel-progress" />
              <div className="panel-counts">{counts.map(([state, count]) => <span key={state} data-kind={state} data-empty={!count || undefined}><b>{count}</b>{states[state].label}</span>)}</div>
              <div id="answer-explanation" className="panel-explain" aria-live="polite">
                {chosen ? <MotionSurface key={chosen.id} preset="rise" className="explain-card">
                  <div className="explain-top"><StateBadge state={values[chosen.id] ?? chosen.state} /><button type="button" className="explain-close" aria-label="Close explanation" onClick={() => setSelected(null)}><Icon name="close" size={14} /></button></div>
                  <strong>{chosen.label}</strong>
                  <p>{chosen.why}</p>
                  {chosen.record !== 'none' && <button type="button" className="explain-link" onClick={() => setTab('profile')}>See the source in Profile <Icon name="arrow" size={13} /></button>}
                </MotionSurface>
                : done ? <div className="review-first"><span>Check these first</span>
                  {fields.filter(field => field.state === 'inferred' || field.state === 'guessed').map(field => <button type="button" key={field.id} onClick={() => select(field.id)}><StateBadge state={field.state} /><span>{field.label}</span><Icon name="arrow" size={13} /></button>)}
                  <p className="explain-hint">Or click any badge on the form to see where that answer came from.</p></div>
                : <ul className="state-legend">{order.map(state => <li key={state}><StateBadge state={state} /><span>{states[state].meaning}</span></li>)}</ul>}
              </div>
            </TabsContent>
            <TabsContent value="profile" className="panel-body">
              <p className="panel-caption">Fictional saved profile. Every answer traces back to one of these.</p>
              <ul className="record-list">{records.map(record => <li key={record.id} data-source={chosen?.record === record.id || undefined}><span>{record.title}</span>{record.lines.map(line => <p key={line}>{line}</p>)}</li>)}</ul>
            </TabsContent>
            <TabsContent value="settings" className="panel-body">
              <p className="panel-caption">Preview. These don’t change the demo; in Kareer they decide what happens after a page is filled.</p>
              {[['Kareer AI', 'Answer open questions with AI credits.', true], ['Auto Continue', 'Move to the next page after filling.', false], ['Auto Submit', 'Submit on the final page.', false], ['Overwrite existing', 'Replace values already on the page.', false]].map(([label, hint, on]) => <SwitchRow key={label as string} className="setting-row"><span><b>{label}</b><small>{hint}</small></span><Switch defaultChecked={on as boolean} aria-label={label as string} /></SwitchRow>)}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
    <MotionPresence>{done && <MotionSurface key="stamp" preset="settle" className="completion-stamp" aria-hidden="true"><Icon name="check" size={20} feedback={false} /> YOUR EVENING,<br />HANDED BACK.</MotionSurface>}</MotionPresence>
    <div className="demo-footnote"><span>Interactive demo. Fictional data. Nothing is submitted and no AI is called.</span><a href="/setup/">Get Kareer <Icon name="arrow" size={14} /></a></div>
  </div>;
}
