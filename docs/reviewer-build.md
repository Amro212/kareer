# Kareer candidate source build

This source archive contains the current v0.5.160 working-tree candidate, including the store-preparation fixes. It is not an archive of the earlier branch HEAD. No credentials, applicant data, node_modules, .env files or development secret files are needed for the build.

Use Node.js 24 and npm on Windows, Linux or macOS:

```sh
npm ci
npm run build:extension -- --production
```

Outputs:

- `dist/chrome/` and `dist/kareer-chrome.zip`: Chrome MV3.
- `dist/firefox/` and `dist/kareer-firefox.xpi`: current self-hosted Firefox channel, unsigned until AMO signing.

The build defaults to the production origin in `src/core/endpoints.js` when --production is present. Do not use the default staging build for store review. No API key or server deployment is needed to reproduce the browser packages. Fresh builds keep the package version; the source-change cache may bump it if a previous build cache is present.

The source uses esbuild to bundle/minify the extension and keeps third-party license notices. `tools/build.js` copies the local PDF worker, fonts, HTML, icons and licenses. It does not fetch executable code at extension runtime. The separate `server/` source implements optional managed billing/inference and is included for review, not embedded as an extension server.

The public privacy/terms JSON is included under `site/src/` for review context. The full website build is separate in the repository and is not reproduced from this browser-source archive. The optional promotional export script uses Windows System.Drawing and is not part of the extension build.
