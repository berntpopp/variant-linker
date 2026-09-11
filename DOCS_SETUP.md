# Documentation setup

The documentation uses VitePress. Use Node.js 22.14 or newer and install the committed documentation lockfile:

```bash
npm --prefix docs ci
npm run docs:dev
```

Build and preview the static site with:

```bash
npm run docs:build
npm run docs:serve
```

`npm run verify` includes the documentation build and dependency audit. CI verifies Linux on Node.js 22 and 24 and Windows on Node.js 22. After the main branch passes, Pages receives the documentation artifact produced by that verified run.

## Reviewed Vite override

The documentation lockfile deliberately resolves Vite 6.4.3 through `docs/package.json`'s `vite` override. VitePress 1.6.4 declares Vite 5, whose dependency tree had security findings during the modernization. The override moves the build to a patched Vite line while retaining the latest stable VitePress release. As checked on September 11, 2026, the npm registry marks VitePress 1.6.4 as `latest`; VitePress 2 remains an alpha on the `next` tag.

This crosses VitePress's declared dependency range and is a reviewed compatibility exception. The committed tree installs with `npm --prefix docs ci`, builds successfully, and has zero reported npm audit vulnerabilities at verification time. Those checks establish installation and build compatibility for this site; they do not establish compatibility with every VitePress plugin or development-server feature. Repeat the build and audit when changing this override, and remove it when a stable VitePress release supports a patched Vite dependency directly.

Primary package metadata: [VitePress on npm](https://www.npmjs.com/package/vitepress), [Vite on npm](https://www.npmjs.com/package/vite). Dependency details are reproducible with `npm view vitepress dist-tags --json` and `npm --prefix docs ls vite vitepress`.
