const compatibility = [
  ['Workday', 'Fills profile fields, commits searchable choices, and completes existing work and education rows without duplicating them.', 'Check rows with similar employers or schools and review each step before continuing.'],
  ['Greenhouse', 'Fills saved fields on hosted and embedded forms, and attaches a saved résumé on tested file controls.', 'Some forms keep the cover letter upload manual. Check that the site accepted the résumé.'],
  ['Lever', 'Fills profile fields on hosted applications, including tested university selectors and custom checkboxes.', 'Review employer-specific questions and any required choice Kareer could not match.'],
  ['Ashby', 'Fills saved fields on hosted and embedded forms, and verifies accepted résumé uploads on tested layouts.', 'Check custom fields and attachments before submitting, especially when the form refreshes after parsing.'],
  ['Generic forms', 'Fills standard web fields on recognized job applications, including tested embedded forms.', 'Custom widgets and multi-step controls vary by employer. Complete anything marked unresolved.'],
] as const;

export function Compatibility() {
  return <div className="reading-page wrap">
    <div className="reading-intro">
      <a className="back-link" href="/">← Back to Kareer</a>
      <h1>Job application autofill compatibility</h1>
      <p>Kareer autofills tested Workday, Greenhouse, Lever, Ashby, and standard web forms. Exact fields and steps depend on the employer’s application.</p>
    </div>
    <div className="table-scroll" role="region" aria-label="Application platform coverage" tabIndex={0}>
      <table className="comparison-table">
        <caption>Tested application workflows and limits</caption>
        <thead><tr><th scope="col">Platform</th><th scope="col">What Kareer can fill</th><th scope="col">What to check</th></tr></thead>
        <tbody>{compatibility.map(([platform, tested, limits]) => <tr key={platform}>
          <th scope="row">{platform}</th><td>{tested}</td><td>{limits}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <article className="reading-content guide-content">
      <section>
        <h2>Review a filled application</h2>
        <p>Open the application, launch Kareer, and choose Autofill. Review the answer sources and resolve any gaps. Auto Submit is off by default. You can control Auto Continue and Auto Submit in Settings.</p>
        <p><a href="/setup/">Install Kareer and fill your first application</a> or <a href="/#demo">try the fictional demo</a>. See the <a href="/security/">security page</a> for how Kareer handles application data.</p>
      </section>
    </article>
  </div>;
}

export function TailoringGuide() {
  return <div className="reading-page wrap">
    <div className="reading-intro">
      <a className="back-link" href="/">← Back to Kareer</a>
      <h1>Tailor a résumé and cover letter with Kareer</h1>
      <p>Use your saved experience and the job description to create a résumé and cover letter for the same role. Review both drafts before exporting them.</p>
    </div>
    <article className="reading-content guide-content">
      <section>
        <h2>Start with a saved profile and a job posting</h2>
        <p>In this fictional example, Alex Morgan applies for a Frontend Developer role at Harbor Health. The posting asks for accessibility and experience with reusable components. Alex’s saved profile says they built a campus resource directory, audited its keyboard and screen reader support, and turned fixes into reusable components.</p>
        <p>Save your own work and project details in Kareer’s Profile. Open the job posting or application, then use <strong>Tailor resume</strong> and <strong>Generate cover letter</strong> in the Kareer panel. These actions use optional <a href="/pricing/">Kareer AI credits</a> in the official extension.</p>
      </section>
      <section>
        <h2>Use the same experience in two ways</h2>
        <h3>Résumé bullet</h3>
        <blockquote>Audited keyboard and screen reader support for a campus resource directory and turned fixes into reusable components.</blockquote>
        <h3>Cover letter paragraph</h3>
        <blockquote>While building a campus resource directory, I audited keyboard and screen reader support and turned fixes into reusable components. I’d bring that same approach to making Harbor Health’s frontend easier to use.</blockquote>
        <p>The résumé makes the work easy to scan. The cover letter connects that work to the role. Both examples use the facts Alex saved.</p>
      </section>
      <section>
        <h2>Review and export both documents</h2>
        <ol>
          <li>Check the employer and role names, dates, tools, and claims against the posting and your profile. Remove anything you cannot verify.</li>
          <li>Open each document in the Kareer workspace and edit the draft. Use the PDF preview to check page breaks and alignment.</li>
          <li>Choose <strong>Download PDF</strong> or <strong>Download Word</strong> from the Download menu. Use PDF or Word (.docx) based on the application’s requirements.</li>
        </ol>
        <p><a href="/#documents">Try the fictional document preview</a> or <a href="/setup/">install Kareer</a>. The <a href="/privacy/#ai-transmission">privacy policy</a> explains what context is sent for optional AI.</p>
      </section>
    </article>
  </div>;
}
