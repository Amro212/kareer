/** Shared contact/link presentation for the editor, PDF and Word. */
export function formatContactRuns(contact) {
  if (!contact) return [];
  const parts = String(contact).split(/\s*[·•|\n]\s*/).map(s => s.trim()).filter(Boolean);
  const runs = [];
  let portfolioUsed = false;
  for (const part of parts) {
    let run = { text: part };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) {
      run = { text: part, link: `mailto:${part}` };
    } else if (/linkedin\.com/i.test(part)) {
      run = { text: 'LinkedIn', link: /^https?:\/\//i.test(part) ? part : `https://${part}` };
    } else if (/github\.com/i.test(part)) {
      run = { text: 'GitHub', link: /^https?:\/\//i.test(part) ? part : `https://${part}` };
    } else if (/twitter\.com|x\.com/i.test(part)) {
      run = { text: 'Twitter', link: /^https?:\/\//i.test(part) ? part : `https://${part}` };
    } else if (/behance\.net/i.test(part)) {
      run = { text: 'Behance', link: /^https?:\/\//i.test(part) ? part : `https://${part}` };
    } else if (/dribbble\.com/i.test(part)) {
      run = { text: 'Dribbble', link: /^https?:\/\//i.test(part) ? part : `https://${part}` };
    } else if (/^https?:\/\//i.test(part) || /^(?:www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(?:[/?#]\S*)?$/i.test(part)) {
      const isPlain = /^[\d\s()+-.]+$/.test(part) || !part.includes('.');
      if (!isPlain) {
        const url = /^https?:\/\//i.test(part) ? part : `https://${part}`;
        const label = portfolioUsed ? 'Website' : 'Portfolio';
        portfolioUsed = true;
        run = { text: label, link: url };
      }
    }
    if (runs.length) runs.push({ text: ' · ' });
    runs.push(run.link ? { ...run, decoration: 'underline' } : run);
  }
  return runs.length ? runs : [{ text: contact }];
}

export function formatRightLink(loc) {
  if (!loc) return null;
  const textLoc = String(loc).trim();
  if (/github\.com/i.test(textLoc)) {
    return { text: 'GitHub', link: /^https?:\/\//i.test(textLoc) ? textLoc : `https://${textLoc}` };
  }
  if (/linkedin\.com/i.test(textLoc)) {
    return { text: 'LinkedIn', link: /^https?:\/\//i.test(textLoc) ? textLoc : `https://${textLoc}` };
  }
  if (/^https?:\/\//i.test(textLoc) || /^(?:www\.)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(?:[/?#]\S*)?$/i.test(textLoc)) {
    return { text: 'Website', link: /^https?:\/\//i.test(textLoc) ? textLoc : `https://${textLoc}` };
  }
  return { text: textLoc };
}

