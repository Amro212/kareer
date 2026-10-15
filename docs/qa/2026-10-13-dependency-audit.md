# Dependency audit and local install recovery

Branch: `feature/materials-editor-ux`. Verification date: October 13, 2026.

## What the Windows log shows

`npm ci` successfully installed 457 packages and reported eight audit findings.
The deprecation notices and funding message did not block that installation.
The subsequent `npm audit fix --force` selected `web-ext` 5.1.0 and `mammoth`
0.3.29, replacing the branch's modern versions with obsolete dependency trees.
The resulting report rose to 60 findings: 24 moderate, 26 high and 10 critical.
Npm's force-fix suggestion is unsuitable for this dependency tree.

## Compatible changes

| Dependency | Change | Reason |
| --- | --- | --- |
| `fx-runner → shell-quote` | 1.10.0 → 1.12.0, scoped override | The Firefox runner pins an affected version. The upstream patched version preserves the major version and normal runner behavior. |
| `source-map-js` | 1.2.1 → 1.2.2, lockfile update | Patched source-map parsing within the existing dependency range. |
| `web-ext` | Retained 10.7.0 | Keeps current Firefox tooling; no forced downgrade. |
| `mammoth` | Retained 1.13.0 | Keeps the tested Word text extraction API; no forced downgrade. |

The audit rerun against the original branch lockfile reported 15 findings
(3 moderate, 9 high, 3 critical). This differs from the user's earlier eight;
audit counts depend on the advisory data returned at the time of the request.
The patched lockfile reports **6 findings: 3 moderate, 3 high, 0 critical**.
These six entries trace to two underlying packages and their parent chains:

- `node-forge` 1.4.0 through `@devicefarmer/adbkit → web-ext`:
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
  The registry's latest stable release is affected. This is development Firefox/
  Android tooling; it is not bundled into the application extension.
- `sprintf-js` 1.0.3 through `argparse → mammoth`:
  [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
  The latest stable sprintf-js release, 1.1.3, remains affected. Argparse is used
  by Mammoth's CLI; Kareer uses Mammoth's library API in Word export verification.
  The application source does not import Mammoth or its CLI.

These findings remain recorded, rather than being hidden or treated as resolved.
Replacing either parent with npm's suggested old major version is not a
compatible security fix. Review again when upstream patched releases are available.

## Recover from the forced downgrade

From the repository root in PowerShell, preserve the changed dependency files,
restore just those two files, and pull the compatible fixes on the feature branch:

```powershell
Copy-Item package.json package.audit-backup.json
Copy-Item package-lock.json package-lock.audit-backup.json
git restore --source=HEAD -- package.json package-lock.json
git pull --ff-only
npm ci
npm run build
```

The backup copies preserve local dependency changes for review. Other source
changes are untouched. The remaining audit report can still be printed by
`npm ci`; it does not mean the install or build failed.

## Verification

The compatible dependency installation and exact `npm run build` command pass
for userscript, Chrome ZIP and Firefox XPI. Real Firefox generation/upload,
Materials editing/proof/download and Profile saving smoke checks pass after the
runner override. Targeted panel and PDF/Word export unit files pass. The unchanged
watch-build regression passes with local process access after the sandboxed test
runner timed out during startup. No whole-repository suite or native Windows
execution is claimed.
