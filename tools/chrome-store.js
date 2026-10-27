import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkRelease } from '../server/tools/release-gate.js';

export async function uploadChrome({ env = process.env, fetcher = fetch, submit = false, checks, zip } = {}) {
  const missing = checkRelease(checks, true);
  if (missing.length) throw new Error(`Store submission blocked: ${missing.join(', ')}`);
  for (const key of ['CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID', 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN']) {
    if (!env[key]) throw new Error(`Configure ${key} before submitting to the store.`);
  }
  if (!/^[a-p]{32}$/.test(env.CWS_EXTENSION_ID) || !/^[a-zA-Z0-9_-]+$/.test(env.CWS_PUBLISHER_ID)) throw new Error('Invalid Chrome store identity.');
  async function json(url, init) {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Chrome store request failed (HTTP ${response.status}). Check the developer dashboard.`);
    return response.json();
  }
  const token = await json('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: env.CWS_CLIENT_ID, client_secret: env.CWS_CLIENT_SECRET, refresh_token: env.CWS_REFRESH_TOKEN, grant_type: 'refresh_token',
  }) });
  if (!token.access_token) throw new Error('Chrome store authorization failed.');
  const name = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const uploaded = await json(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip,
  });
  if (uploaded.uploadState !== 'SUCCEEDED') throw new Error('Chrome upload is not complete. Review upload processing in the developer dashboard before submitting.');
  if (submit) await json(`https://chromewebstore.googleapis.com/v2/${name}:publish`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ publishType: 'STAGED_PUBLISH' }),
  });
  return { uploaded: true, submittedForStagedReview: submit };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    const manifest = JSON.parse(fs.readFileSync(new URL('../dist/chrome/manifest.json', import.meta.url)));
    const background = fs.readFileSync(new URL('../dist/chrome/background/index.js', import.meta.url), 'utf8');
    if (manifest.name.includes('Staging') || background.includes('.workers.dev') || !background.includes('https://api.kareer.itsamro.me')) throw new Error('Only production gateway packages can be submitted.');
    const checks = JSON.parse(fs.readFileSync(new URL('../docs/release-checklist.json', import.meta.url)));
    console.log(await uploadChrome({ checks, zip: fs.readFileSync(new URL('../dist/kareer-chrome.zip', import.meta.url)), submit: process.argv.includes('--submit-review') }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
