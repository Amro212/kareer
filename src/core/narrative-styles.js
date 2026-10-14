// Matched examples demonstrate expression; their facts are not applicant evidence.
export const NARRATIVE_STYLES = [
  {
    id: 'natural', label: 'Natural',
    description: 'Candid, conversational, and straightforward.',
    prompt: 'Write candidly and conversationally. Explain what happened, what you did, and why it mattered in ordinary language. Let personality come through practical observations and straightforward phrasing. Avoid polishing away the speaker\'s individuality.',
    examples: [
      { question: 'Describe a project.', answer: 'I built a form-filling tool because the ones I tried kept failing on custom dropdowns. Getting those fields to work reliably became the main challenge.' },
      { question: 'Describe a process you improved.', answer: 'Customer requests were taking three days to get a follow-up because ownership was unclear. I introduced a shared tracker with an owner for each request. Follow-up time dropped to one day.' },
    ],
  },
  {
    id: 'warm-personal', label: 'Warm & personal',
    description: 'Approachable, with a personal connection to the work.',
    prompt: 'Address a person rather than a committee. Bring out the human side of the work: what the candidate cared about, noticed, enjoyed, or wanted to improve. Use approachable phrasing and personal perspective. Keep warmth specific rather than sentimental or flattering.',
    examples: [
      { question: 'Describe a project.', answer: 'I wanted filling out forms to feel a little less like a chore, so I built a tool to handle them. Custom dropdowns kept tripping up the tools I tried, and I enjoyed getting those details to work reliably.' },
      { question: 'Describe a process you improved.', answer: 'I cared about customers getting a reply without having to chase us. When I found that unclear ownership was slowing requests down, I introduced a shared tracker with an owner for each one. Follow-up time fell from three days to one.' },
    ],
  },
  {
    id: 'quietly-confident', label: 'Quietly confident',
    description: 'Calm conviction, with contributions at the forefront.',
    prompt: 'State contributions and judgments with calm conviction. Own the candidate\'s actions and explain their relevance without apologetic framing. Prefer clear statements over unnecessary hedging. Confidence comes from substance, not superlatives or inflated responsibility.',
    examples: [
      { question: 'Describe a project.', answer: 'I built a form-filling tool that handles custom dropdowns reliably. The tools I tried failed at those fields, so I focused the work there.' },
      { question: 'Describe a process you improved.', answer: 'I introduced a shared tracker that made ownership of each customer request clear. Follow-up time fell from three days to one. Reviewing the handoffs had identified where requests were getting stuck.' },
    ],
  },
  {
    id: 'story-led', label: 'Story-led',
    description: 'A short account of the situation, your actions, and what changed.',
    prompt: 'Turn a relevant experience into a short, engaging account. Establish the situation quickly, follow the candidate\'s actions, and show what changed. Weave personal perspective into the account. Avoid a rigid STAR template, cinematic padding, and a compulsory lesson at the end. Answer promptly, even when the field is short.',
    examples: [
      { question: 'Describe a project.', answer: 'I tried automating the forms, then kept hitting the same obstacle: custom dropdowns. I started building a tool that could handle them. Most of the work went into making those fields reliable.' },
      { question: 'Describe a process you improved.', answer: 'I started by reviewing why customer requests were waiting three days for a follow-up. Ownership was unclear, so I introduced a shared tracker showing who was responsible for each request. Follow-up time fell to one day.' },
    ],
  },
  {
    id: 'light-wit', label: 'Light wit',
    description: 'Understated personality and the occasional dry observation.',
    prompt: 'Use understated, observant, occasionally wry phrasing. A small aside or dry observation may add personality when it fits. Keep the candidate credible and the answer useful. Never force a joke, stock punchline, sarcasm, or a clever ending. Stay straightforward when humor would distract.',
    examples: [
      { question: 'Describe a project.', answer: 'The tools I tried could fill a text box. Custom dropdowns apparently had other plans. I built a form-filling tool and focused on getting those fields to work reliably.' },
      { question: 'Describe a process you improved.', answer: 'Customer requests were spending three days waiting for someone to own them. I gave each request an owner in a shared tracker, which was less exciting than it sounds and much more useful. Follow-up time dropped to one day.' },
    ],
  },
];

export function getNarrativeStyle(id) {
  return NARRATIVE_STYLES.find(style => style.id === id) || NARRATIVE_STYLES[0];
}
