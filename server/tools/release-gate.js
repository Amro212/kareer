import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function checkRelease(checks, submission = false) {
  const required = ['gatewayStaging', 'lemonSandbox', 'chromeStagingPurchaseAi', 'firefoxStagingPurchaseAi', 'releaseVerification', 'multiUserCosts', 'productionGateway', 'chromeStoreApproval', 'firefoxSignedRelease'];
  return required.filter(key => !(submission && ['chromeStoreApproval', 'firefoxSignedRelease'].includes(key)))
    .filter(key => checks[key]?.passed !== true || !checks[key]?.evidence?.trim());
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const checks = JSON.parse(fs.readFileSync(new URL('../../docs/release-checklist.json', import.meta.url)));
  const missing = checkRelease(checks);
  if (missing.length) { console.error(`Public release is blocked: ${missing.join(', ')}. Record verified evidence in docs/release-checklist.json.`); process.exitCode = 1; }
  else console.log('Public release evidence is complete.');
}
