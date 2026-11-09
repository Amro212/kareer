import { Fragment, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { MotionPresence, MotionSurface } from '@/components/ui/presence';
import { useChoreography } from '@/lib/cojeev-motion/choreography';

// The saved profile facts every version draws from; postings only choose and reframe them.
const facts = {
  directory: 'Built an accessible student resource directory used across campus.',
  feedback: 'Ran weekly feedback sessions with students and shipped fixes within days.',
  audit: 'Audited keyboard and screen reader support, then turned fixes into reusable components.',
  tickets: 'Resolved hardware and account issues for students and staff.',
  guides: 'Wrote step-by-step guides for the most common account problems.',
};
const pick = (text: string) => `[[${text}]]`;

// [[...]] marks the parts chosen or reframed for the selected posting.
const postings = [
  {
    id: 'product', company: 'Northwind Labs', role: 'Junior Product Engineer', asks: ['User empathy', 'Shipping small', 'React'],
    summary: 'Computer science graduate who [[builds practical tools by listening to the people who use them]]. [[Comfortable taking a feature from rough idea to shipped React interface.]]',
    first: 'campus',
    campus: [facts.directory, pick(facts.feedback)],
    helpdesk: [facts.tickets],
    skills: '[[React · TypeScript · user interviews]] · accessibility · SQL',
    opening: 'Building tools for my campus taught me that [[the best products start with listening]]. I’d love to bring that same curiosity to Northwind’s product team.',
    middle: 'For Campus Collective, I built an accessible student resource directory. [[Running weekly feedback sessions and shipping small fixes taught me to connect technical decisions to the people using the product.]]',
  },
  {
    id: 'frontend', company: 'Harbor Health', role: 'Frontend Developer', asks: ['Accessibility', 'Design systems', 'TypeScript'],
    summary: 'Computer science graduate [[focused on accessible, well-structured interfaces]]. [[Experienced building reusable components that work for every user.]]',
    first: 'campus',
    campus: [facts.directory, pick(facts.audit)],
    helpdesk: [facts.tickets],
    skills: '[[Accessibility · TypeScript · component libraries]] · React · SQL',
    opening: 'Patients shouldn’t have to fight a website to book care. [[Accessibility is the part of frontend work I care about most]], and Harbor Health takes it seriously.',
    middle: 'For Campus Collective, I built an accessible student resource directory. [[Auditing keyboard and screen reader support taught me to treat accessibility as a design system concern, not a final checklist.]]',
  },
  {
    id: 'support', company: 'Civic Transit', role: 'Technical Support Analyst', asks: ['Troubleshooting', 'Clear writing', 'Documentation'],
    summary: 'Computer science graduate [[with hands-on technical support experience]]. [[Turns messy problems into clear fixes and clearer documentation.]]',
    first: 'helpdesk',
    campus: [facts.directory],
    helpdesk: [facts.tickets, pick(facts.guides)],
    skills: '[[Troubleshooting · documentation · ticketing]] · SQL · React',
    opening: 'When a fare system goes down, [[someone has to explain the fix calmly and clearly]]. That’s the work I enjoyed most on Northfield’s help desk.',
    middle: 'At Northfield University, I resolved hardware and account issues for students and staff. [[Writing step-by-step guides for the most common account problems taught me that clear documentation is part of the fix.]]',
  },
];

function Marked({ text }: { text: string }) {
  return <>{text.split(/\[\[|\]\]/).map((part, index) => index % 2 ? <mark key={index} className="tailored">{part}</mark> : <Fragment key={index}>{part}</Fragment>)}</>;
}

export function DocumentStudio() {
  const [chosen, setChosen] = useState(postings[0]);
  const [tailoring, setTailoring] = useState(false);
  const { quiet } = useChoreography();
  useEffect(() => {
    if (!tailoring) return;
    const timer = window.setTimeout(() => setTailoring(false), quiet ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [tailoring, quiet]);
  const choose = (posting: typeof postings[number]) => {
    if (posting.id === chosen.id) return;
    setChosen(posting);
    setTailoring(true);
  };
  const roles = { campus: { title: 'Student Developer', org: 'Campus Collective · 2024–2026' }, helpdesk: { title: 'IT Help Desk Assistant', org: 'Northfield University · 2023–2024' } };

  return <div className="document-studio">
    <div className="posting-picker" role="group" aria-label="Choose a fictional job posting">
      {postings.map(posting => <button type="button" key={posting.id} className="posting-card" aria-pressed={posting.id === chosen.id} onClick={() => choose(posting)}>
        <span className="posting-company">{posting.company}</span><strong>{posting.role}</strong>
        <span className="posting-asks">{posting.asks.map(ask => <i key={ask}>{ask}</i>)}</span>
      </button>)}
    </div>
    <Tabs defaultValue="resume" variant="notebook" className="document-preview">
      <TabsList aria-label="Sample tailored document"><TabsTrigger value="resume">Résumé</TabsTrigger><TabsTrigger value="letter">Cover letter</TabsTrigger></TabsList>
      <div className="document-paper" aria-busy={tailoring}>
        <div className="document-meta"><span className="document-meta-label">{postings.map(posting => <span key={posting.id} aria-hidden={posting.id !== chosen.id}>ILLUSTRATIVE PREVIEW · TAILORED FOR {posting.company.toUpperCase()}</span>)}</span><span className="tailored-key"><mark className="tailored">Highlighted</mark> = chosen or reframed for this role</span></div>
        <MotionPresence>{tailoring && <MotionSurface key="tailoring" preset="fade" className="tailoring-veil" role="status"><Spinner aria-hidden="true" role="presentation" /><span>Tailoring for {chosen.company}…</span></MotionSurface>}</MotionPresence>
        <div className="document-pages"><TabsContent value="resume" forceMount>
          <MotionSurface key={chosen.id} preset="soften" className="document-versions">
            {postings.map(posting => {
              const experience = (posting.first === 'campus' ? ['campus', 'helpdesk'] : ['helpdesk', 'campus']) as ('campus' | 'helpdesk')[];
              return <div key={posting.id} className="document-body" aria-hidden={posting.id !== chosen.id}>
                <h3>Alex Morgan</h3><p className="document-contact">alex.morgan@example.com · Toronto · alex.example.com</p><hr />
                <h4>SUMMARY</h4><p><Marked text={posting.summary} /></p>
                <h4>EXPERIENCE</h4>
                {experience.map(key => <div className="document-role" key={key}><strong>{roles[key].title}</strong><span>{roles[key].org}</span><ul>{posting[key].map(line => <li key={line}><Marked text={line} /></li>)}</ul></div>)}
                <h4>SKILLS</h4><p><Marked text={posting.skills} /></p>
                <h4>EDUCATION</h4><p>BSc, Computer Science · Northfield University · 2026</p>
              </div>;
            })}
          </MotionSurface>
        </TabsContent>
        <TabsContent value="letter" forceMount>
          <MotionSurface key={chosen.id} preset="soften" className="document-versions">
            {postings.map(posting => <div key={posting.id} className="document-body" aria-hidden={posting.id !== chosen.id}>
              <h3>A proper introduction.</h3><p className="document-contact">Alex Morgan · {posting.role}, {posting.company}</p><hr />
              <p>Dear {posting.company} hiring team,</p>
              <p><Marked text={posting.opening} /></p>
              <p><Marked text={posting.middle} /></p>
              <p>I’d welcome the chance to discuss how that experience could help your team.</p>
              <p>Best,<br />Alex Morgan</p>
            </div>)}
          </MotionSurface>
        </TabsContent></div>
        <p className="document-ground">Same saved facts in every version. Only the selection and emphasis change.</p>
      </div>
    </Tabs>
  </div>;
}
