// Matched examples demonstrate expression; their facts are not applicant evidence.
export const NARRATIVE_STYLES = [
  {
    id: 'natural', label: 'Natural',
    description: 'Candid, conversational, and straightforward.',
    prompt: 'Use two or three relaxed, direct sentences. Start with what you did and the practical reason. Explain it as you would to a colleague. Keep emotional openings, story hooks and wit for other styles.',
    examples: [
      { question: 'Describe a project.', answer: 'I built a form-filling tool because the ones I tried kept failing on custom dropdowns. Getting those fields to work reliably became the main challenge.' },
      { question: 'Describe a process you improved.', answer: 'Customer requests were taking three days to get a follow-up because ownership was unclear. I introduced a shared tracker with an owner for each request. Follow-up time dropped to one day.' },
    ],
  },
  {
    id: 'warm-personal', label: 'Warm & personal',
    description: 'Approachable, with a personal connection to the work.',
    prompt: "Make your personal reason for caring audible in the first sentence: 'I wanted...', 'I cared about...', or 'I liked...'. Connect that feeling to the specific people or work involved, then explain your action and its supported outcome. Use a modest inferred reaction if needed, without inventing an event. This should feel personal rather than like a neutral report. No generic excitement or sentimental praise.",
    examples: [
      { question: 'Describe a project.', answer: 'I wanted filling out forms to feel a little less like a chore, so I built a tool to handle them. Custom dropdowns kept tripping up the tools I tried, and I enjoyed getting those details to work reliably.' },
      { question: 'Describe a process you improved.', answer: 'I cared about customers getting a reply without having to chase us. When I found that unclear ownership was slowing requests down, I introduced a shared tracker with an owner for each one. Follow-up time fell from three days to one.' },
    ],
  },
  {
    id: 'quietly-confident', label: 'Quietly confident',
    description: 'Calm conviction, with contributions at the forefront.',
    prompt: "Start with 'I' and your concrete action or contribution, followed by the supported outcome. Use two or three compact, firm sentences. Put your contribution before the problem setup. Remove hedging, emotional framing, self-praise and redundant explanation. Let the work carry the confidence; never inflate responsibility or results.",
    examples: [
      { question: 'Describe a project.', answer: 'I built a form-filling tool that handles custom dropdowns reliably. The tools I tried failed at those fields, so I focused the work there.' },
      { question: 'Describe a process you improved.', answer: 'I introduced a shared tracker that made ownership of each customer request clear. Follow-up time fell from three days to one. Reviewing the handoffs had identified where requests were getting stuck.' },
    ],
  },
  {
    id: 'story-led', label: 'Story-led',
    description: 'A short account of the situation, your actions, and what changed.',
    prompt: 'Start with the specific friction or problem you noticed, before describing your contribution. Then make the sequence clear: what you changed, and what happened next. Use three or four connected sentences when space permits. Tell the small story through supplied events, not a list of tasks. Do not invent scenes, dialogue, chronology or dramatic stakes; no compulsory lesson at the end.',
    examples: [
      { question: 'Describe a project.', answer: 'I tried automating the forms, then kept hitting the same obstacle: custom dropdowns. I started building a tool that could handle them. Most of the work went into making those fields reliable.' },
      { question: 'Describe a process you improved.', answer: 'I started by reviewing why customer requests were waiting three days for a follow-up. Ownership was unclear, so I introduced a shared tracker showing who was responsible for each request. Follow-up time fell to one day.' },
    ],
  },
  {
    id: 'light-wit', label: 'Light wit',
    description: 'Understated personality and the occasional dry observation.',
    prompt: 'Sound helpful, observant and lightly amused by an awkward workflow. Include one brief dry aside about the process, delivered casually, then get back to what you did and what changed. A quiet understatement is enough; do not explain the joke. Keep people respected and capable. Never imply a task was obvious or people were incompetent. Avoid sarcasm, self-deprecation, stock metaphors, "rocket science", theatrical comparisons and a joke tacked onto the ending. For serious or sensitive subjects, stay straightforward.',
    examples: [
      { question: 'Describe a process you improved.', answer: 'The rota had several versions, which was several too many. I moved it into one shared document so everyone could check the current schedule.' },
      { question: 'Describe a project.', answer: 'A help page is less helpful when its links go nowhere. I wrote a checker to catch broken links before publication, so readers had fewer dead ends.' },
    ],
  },
];

export function getNarrativeStyle(id) {
  return NARRATIVE_STYLES.find(style => style.id === id) || NARRATIVE_STYLES[0];
}
