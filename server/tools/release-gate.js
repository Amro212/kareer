import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function checkRelease(checks, submission = false) {
  const required = ['gatewayStaging', 'stripeSandbox', 'chromeStagingPurchaseAi', 'firefoxStagingPurchaseAi', 'releaseVerification', 'multiUserCosts', 'productionGateway', 'chromeStoreApproval', 'firefoxSignedRelease'];
  return required.filter(key => !(submission && ['chromeStoreApproval', 'firefoxSignedRelease'].includes(key)))
    .filter(key => checks[key]?.passed !== true || !checks[key]?.evidence?.trim());
}

/** Placeholder values left in the production section of wrangler.toml. */
export function productionPlaceholders(toml) {
  const section = toml.split(/^\[env\.production\]$/m)[1] || '';
  return [...section.matchAll(/^\s*([A-Z_]+)\s*=\s*"CONFIGURE_[^"]*"/gm)].map(m => m[1]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const checks = JSON.parse(fs.readFileSync(new URL('../../docs/release-checklist.json', import.meta.url)));
  // --submission: the store approval and signing gates are what this release produces.
  // --config: deploying the production Worker only needs complete production config.
  const missing = process.argv.includes('--config') ? [] : checkRelease(checks, process.argv.includes('--submission'));
  const placeholders = productionPlaceholders(fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'));
  if (missing.length) { console.error(`Public release is blocked: ${missing.join(', ')}. Record verified evidence in docs/release-checklist.json.`); process.exitCode = 1; }
  if (placeholders.length) { console.error(`Production config still has placeholders: ${placeholders.join(', ')}. Set them in server/wrangler.toml.`); process.exitCode = 1; }
  if (!process.exitCode) console.log(process.argv.includes('--config') ? 'Production config is complete.' : 'Public release evidence is complete.');
}
