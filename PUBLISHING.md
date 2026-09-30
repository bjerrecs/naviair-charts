# Publishing checklist

This file is for maintainers and is not included in the npm package.

## 1. Fill in the placeholders (one time)

| File | Placeholder | Replace with |
| --- | --- | --- |
| `package.json` | `AUTHOR NAME` | Author, e.g. `Jane Doe <jane@example.com>` (public on npm) |
| `package.json` | `OWNER` (in `homepage`, `bugs`, `repository`) | GitHub user/org hosting the repo |
| `LICENSE` | `AUTHOR NAME` | Copyright holder |
| `CHANGELOG.md` | `OWNER` | GitHub user/org |

Check that none are left: `grep -rnE "OWNER|AUTHOR NAME" --exclude-dir=node_modules .`

## 2. Decisions to confirm

- **Package name**: `naviair-charts` (not taken on npm as of 2026-09-30). Check again: `npm view naviair-charts`.
- **License**: MIT.
- **Version**: `0.1.0`. A 0.x version signals that the API may still change; use `1.0.0` if you want to commit to it.
- **Supported Node versions**: `>=20.10` (the output uses JSON import attributes). Checked on Node 20, 22 and 26.
- **ESM only**: there is no CommonJS build. Node 20.19+ / 22.12+ can `require()` it; older CommonJS code needs
  `await import("naviair-charts")`.
- **Disclaimer / use of the NAVIAIR API**: the package calls the same public JSON endpoints as the aim.naviair.dk
  website (`/umbraco/api/naviairapi/getsearch` and `getnodesforparent`). These are not a documented public API and
  could change without notice. Consider asking NAVIAIR (aim@naviair.dk) whether they are fine with it.

## 3. What gets published

`npm run pack:check` lists the files. Expected contents (≈45 kB packed):

```
LICENSE  README.md  CHANGELOG.md  package.json
dist/index.js      dist/index.d.ts      public API
dist/client.js     dist/client.d.ts     NaviairClient
dist/server.js     dist/server.d.ts     naviair-charts/server
dist/names.js      dist/names.d.ts      name matching
dist/types.js      dist/types.d.ts
dist/cli.js        dist/cli.d.ts        `naviair-charts` binary
dist/catalogue.json                     bundled chart list
```

Also `CHANGELOG.md`. Not published: `src/`, `test/`, `site/`, `scripts/`, `.github/`, source maps and this file.

## 4. Before each release

```sh
npm ci
npm run crawl         # refresh src/catalogue.json from aim.naviair.dk
npm run build
npm test              # offline tests
npm run test:live     # against aim.naviair.dk
npm run pack:check    # review the file list
```

Update `CHANGELOG.md` and bump the version: `npm version patch|minor|major` (commits and tags `vX.Y.Z`).

## 5. Publish

### First release (manual)

npm only lets you set up trusted publishing for a package that already exists, so publish the first version from
your machine:

```sh
npm login
npm publish --dry-run   # final review
npm publish             # prepublishOnly builds and tests first
```

Then on npmjs.com → package → Settings → **Trusted publishing** → add GitHub Actions with your repo and workflow
file `release.yml`. Recommended: under **Publishing access**, choose "Require two-factor authentication and
disallow tokens".

### Later releases (GitHub Actions)

1. `npm version minor` → `git push --follow-tags`
2. Create a GitHub release from the tag. `.github/workflows/release.yml` checks that the tag matches
   `package.json`, then builds, runs the tests (including live) and publishes with provenance.

## 6. Automation included

| Workflow | What it does |
| --- | --- |
| `ci.yml` | Build + tests on Node 22/24/26, smoke test of the build on Node 20, live check against NAVIAIR (allowed to fail) |
| `release.yml` | Publishes to npm on GitHub release (trusted publishing, provenance) |
| `refresh-catalogue.yml` | Every Thursday (AIRAC day) re-crawls NAVIAIR and opens a PR if the chart list changed |
