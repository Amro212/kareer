import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the actual production exporter
import { exportMaterial } from '../src/targets/extension/materials/export.js';

const __dirname = path.resolve();
const outDir = path.join(__dirname, 'sample-output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sampleResume = {
  kind: 'resume',
  name: 'Alex Rivera',
  contact: 'alex.rivera@example.com · +1 (555) 234-5678 · San Francisco, CA · linkedin.com/in/alexrivera · github.com/arivera',
  summary: 'Senior Software Engineer with 6+ years of experience designing high-throughput distributed systems, event-driven microservices, and developer platforms. Proven track record of reducing system latency by 45% and optimizing cloud infrastructure costs.',
  sections: [
    {
      id: 'work_1',
      category: 'Experience',
      heading: 'Staff Software Engineer — Acme Cloud Technologies',
      facts: 'San Francisco, CA · 2022-03 · Present',
      bullets: [
        'Architected real-time event streaming pipeline processing 150M+ daily events using Node.js, Kafka, and PostgreSQL, reducing end-to-end latency by 45%.',
        'Led team of 8 engineers migrating legacy monolith into decoupled microservices deployed on Kubernetes with automated CI/CD pipelines.',
        'Engineered high-concurrency rate limiting and resilience middleware, achieving 99.99% service uptime during peak enterprise loads.'
      ]
    },
    {
      id: 'work_2',
      category: 'Experience',
      heading: 'Senior Full Stack Engineer — Horizon Financial',
      facts: 'New York, NY · 2019-06 · 2022-02',
      bullets: [
        'Built secure transactional banking APIs handling over $20M in monthly volume with strict zero-trust authentication and audit logging.',
        'Refactored core reporting engine with caching and parallel query execution, decreasing customer dashboard load times from 8.2s to 1.1s.',
        'Mentored junior engineers and instituted code review standards that reduced production defects by 30%.'
      ]
    },
    {
      id: 'edu_1',
      category: 'Education',
      heading: 'B.S. in Computer Science — University of California, Berkeley',
      facts: '2015-08 · 2019-05 · GPA 3.85',
      bullets: [
        'Honors in Computer Science. Focus on Distributed Systems and Database Architecture.'
      ]
    },
    {
      id: 'proj_1',
      category: 'Projects',
      heading: 'FlowMesh — Distributed Workflow Engine',
      facts: 'github.com/arivera/flowmesh · 2023-01 · Present',
      bullets: [
        'Open-source directed acyclic graph (DAG) execution engine supporting distributed task coordination and automatic retry backoffs.'
      ]
    },
    {
      id: 'skills',
      category: 'Skills',
      heading: 'Skills',
      facts: '',
      bullets: ['JavaScript', 'TypeScript', 'Node.js', 'Python', 'Go', 'React', 'PostgreSQL', 'Redis', 'Kafka', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'REST APIs', 'CI/CD']
    }
  ]
};

const sampleCoverLetter = {
  kind: 'coverLetter',
  name: 'Alex Rivera',
  contact: 'alex.rivera@example.com · +1 (555) 234-5678 · San Francisco, CA · linkedin.com/in/alexrivera',
  paragraphs: [
    'Dear Hiring Team,',
    'I am writing to express my strong enthusiasm for the Senior Software Engineer position at Acme Cloud Technologies. Having built high-concurrency distributed systems and event-driven architectures throughout my career, I was immediately drawn to Acme’s mission of empowering engineering teams with resilient cloud infrastructure.',
    'In my current role at Acme Cloud Technologies, I architected a real-time event streaming pipeline processing over 150 million daily events using Node.js and Kafka, successfully slashing end-to-end message latency by 45%. Previously at Horizon Financial, I spearheaded the overhaul of core transactional APIs handling $20M+ in monthly volume, cutting dashboard response latency by 85% while upholding strict reliability and security requirements. My background aligns closely with the challenges outlined in your technical roadmap.',
    'I thrive in collaborative, high-ownership engineering environments where clarity and technical excellence go hand-in-hand. I would welcome the opportunity to discuss how my hands-on background in cloud backend systems and microservices can help accelerate your platform’s growth.',
    'Thank you for your time and consideration.',
    'Sincerely,\nAlex Rivera'
  ]
};

const job = { company: 'Acme Cloud Technologies', title: 'Senior Software Engineer' };

async function run() {
  console.log('Compiling sample resume...');
  const resumeResult = await exportMaterial(sampleResume, job, 1);
  console.log(`Resume compiled! Pages: ${resumeResult.pages}`);
  fs.writeFileSync(path.join(outDir, 'sample-resume.pdf'), Buffer.from(resumeResult.files.pdf.buffer));
  fs.writeFileSync(path.join(outDir, 'sample-resume.docx'), Buffer.from(resumeResult.files.docx.buffer));

  console.log('Compiling sample cover letter...');
  const letterResult = await exportMaterial(sampleCoverLetter, job, 1);
  console.log(`Cover letter compiled! Pages: ${letterResult.pages}`);
  fs.writeFileSync(path.join(outDir, 'sample-cover-letter.pdf'), Buffer.from(letterResult.files.pdf.buffer));
  fs.writeFileSync(path.join(outDir, 'sample-cover-letter.docx'), Buffer.from(letterResult.files.docx.buffer));

  console.log('Successfully written files to:', outDir);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
