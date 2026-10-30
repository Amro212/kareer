import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('.', import.meta.url));

export async function stagePublicFiles(source, output) {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (['assets', 'downloads', 'CNAME', 'version.json', 'firefox-updates.json'].includes(entry.name)
      || /^google[a-f0-9]+\.html$/.test(entry.name)) {
      await fs.cp(path.join(source, entry.name), path.join(output, entry.name), { recursive: true });
    }
  }
  await fs.writeFile(path.join(output, '.nojekyll'), '');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { build, createServer } = await import('vite');
  await build({ configFile: path.join(site, 'vite.config.ts') });
  const output = path.resolve(site, '../site-dist');
  const server = await createServer({ configFile: path.join(site, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { App } = await server.ssrLoadModule('/src/app.tsx');
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    for (const [name, page] of [['index.html', 'home'], ['privacy/index.html', 'privacy'], ['terms/index.html', 'terms'], ['setup/index.html', 'setup'], ['404.html', '404']]) {
      const destination = path.join(output, name);
      const html = await fs.readFile(destination, 'utf8');
      await fs.writeFile(destination, html.replace('<div id="root"><!--app--></div>', `<div id="root" data-rendered="true">${renderToString(createElement(App, { page }))}</div>`));
    }
  } finally {
    await server.close();
  }
  await stagePublicFiles(site, output);
}
