# Kareer candidate source build

This archive contains the source for the Kareer store packages. The release version is in `package.json`. No credentials or environment files are required to build it.

Use Node.js 24 and npm on Windows, Linux or macOS:

```sh
npm ci
npm run build:extension -- --production --amo
```

Outputs:

- `dist/chrome/` and `dist/kareer-chrome.zip`: Chrome MV3.
- `dist/firefox/` and `dist/kareer-firefox.xpi`: listed Firefox package, unsigned until AMO signing. Mozilla manages updates after publication.

The build defaults to the production origin in `src/core/endpoints.js` when --production is present. Do not use the default staging build for store review. No API key or server deployment is needed to reproduce the browser packages. Fresh builds keep the package version; the source-change cache may bump it if a previous build cache is present.

The source uses esbuild to bundle/minify the extension and keeps third-party license notices. `tools/build.js` copies the local PDF worker, fonts, HTML, icons and licenses. It does not fetch executable code at extension runtime. The Kareer AI gateway (managed billing and inference) is a separate closed-source Cloudflare Worker; the extension only calls its HTTPS API and embeds none of its code.

The public site and privacy policy are at https://kareer.itsamro.me/. The site build is separate from the browser packages.
