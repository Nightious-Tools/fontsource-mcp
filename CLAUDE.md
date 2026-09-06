# fontsource-mcp

MCP stdio server for fontsource.org. It reads the public JSON API and the jsDelivr CDN with Node
`fetch`: no key, no bot-blocking, no throttle (the API allows 2500 requests per 10s).

`src/index.js` registers tools. All logic is in `src/fontsource.js`, and its comments carry the
reasoning. Read them before editing.

## dist/ is what runs

`dist/index.mjs` is committed and both install channels execute it directly. Nothing builds on the
user's machine: `.claude-plugin/plugin.json` runs `${CLAUDE_PLUGIN_ROOT}/dist/index.mjs` and
`manifest.json` runs `${__dirname}/dist/index.mjs`. The two variables belong to different hosts.
`npm start` runs `src/`, which nothing in production does.

After any `src/` edit, run `npm run build` and commit `dist/` in the same commit. The selftest never
loads `dist/`, so a stale bundle fails only in CI.

## Lockstep

| When you change | Also update |
|---|---|
| version | `package.json`, `manifest.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`. `src/index.js` imports it from package.json and esbuild inlines it. Then `npm install --package-lock-only`, rebuild, and cut a release. CI fails if the four disagree. |
| a tool or param | `src/index.js`, `README.md`, `skills/fontsource-mcp/SKILL.md`. The manifest carries no `tools` array on purpose. |
| param guidance | The `.describe()` strings in `src/index.js` repeat SKILL.md on purpose: `.mcpbignore` drops `skills/`, so `.mcpb` users never see the skill. |
| `FONTSOURCE_DOWNLOAD_DIR` | `src/fontsource.js`, `manifest.json` (`user_config.download_dir`), `README.md`, SKILL.md, the `download_font` description. |
| `keywords` | The four JSON files and the GitHub repo topics. Nothing checks them. |

Never regex-bump a version: `manifest.json` also carries `"manifest_version": "0.3"`, the MCPB spec
version. The JSON import in `src/index.js` needs Node 18.20 or 20.10 to run from `src/`; the bundle
runs on any Node 18.

## Releasing

The README points Claude Desktop users at the `.mcpb` on Releases, and the `.mcpb` is gitignored, so an
unreleased version is a broken install path.

```
npm run selftest
npm run pack
git push
gh release create v<X.Y.Z> fontsource-mcp.mcpb --title "v<X.Y.Z>" --notes "..."
```

Run `npm run pack` right before attaching; a `.mcpb` left in the working directory may be stale. Publish
as GitHub user `nightious` (`gh auth switch -u nightious`). This repo's git `user.name` is set to match.

## Verification

`npm run selftest` uses `node:assert/strict`, makes live requests, and takes about ten seconds. It is
pinned to live state (Inter has a `wght` max of 900 and at least 300 files; noto-sans-jp has more than
20 unicode-range subsets; the catalog exceeds 2000 fonts), so treat a failure as possible drift before
treating it as a regression. CI runs it.

For the bundle, copy `dist/index.mjs` alone into an empty directory and pipe `initialize` plus
`tools/list` JSON-RPC into `node index.mjs`. It must list six tools.

## Pitfalls

- `slug()` is the traversal guard. The id goes into URLs and into `path.join(dir, id)`. Keep the
  regex strict.
- The npm CDN CSS uses relative `url(./files/...)`. That works for `<link>` and `@import`;
  `getFontCss` absolutizes only the inlined `css` text. The `cdn.jsdelivr.net/fontsource/css/` mirror
  has absolute URLs but lacks per-subset files, which is why the npm CDN is used.
- `full.css` and `standard.css` exist only for some variable fonts (Inter has neither). Every variable
  font has `wght[-italic].css`, so `variableFile` defaults to `wght`.
- Axis-registry keys are case-sensitive OpenType tags (`wght`, `GRAD`); `getAxisRegistry` tries both.

The `ponytail:` comments in `fontsource.js` name each shortcut's ceiling and upgrade path.
