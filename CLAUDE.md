# fontsource-mcp

MCP stdio server for fontsource.org. Public JSON API + jsDelivr CDN via Node `fetch` — no keys, no
Cloudflare block, no throttle (ceiling is 2500 req/10s).

`src/index.js` is a thin shim — tool registration only. All logic is `src/fontsource.js`. Its comments
are load-bearing; read them before editing.

## The rule that bites first

**`dist/index.mjs` is committed and IS what runs.** Both install channels execute it directly and no build
runs on the user's machine — `.claude-plugin/plugin.json` (`${CLAUDE_PLUGIN_ROOT}/...`) and
`manifest.json` (`${__dirname}/...`). The two path syntaxes are not interchangeable. `npm start` runs
`src/`, but nothing in production does.

So: **any `src/` edit → `npm run build` → commit `dist/` in the same commit.** The selftest tests `src/`
and never loads `dist/`; CI catches a stale bundle.

## Lockstep

| When you change | Also update |
|---|---|
| version | `package.json`, `manifest.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — 4 hand edits (`src/index.js` imports it from package.json; esbuild inlines it into `dist/`). Never regex-bump: `manifest.json` `"manifest_version": "0.3"` is the MCPB spec version. Then rebuild, and **cut a release** (see below). CI fails if the 4 disagree. |
| a tool / param | `src/index.js`, `README.md`, `skills/fontsource-mcp/SKILL.md`. The manifest carries **no** `tools` array (optional in MCPB 0.3; a hand copy would drift). |
| param *guidance* | The `.describe()` strings in `src/index.js` duplicate SKILL.md advice on purpose: `.mcpbignore` drops `skills/`, so `.mcpb` users get the schema and never the skill. Change one, change the other. |
| `FONTSOURCE_DOWNLOAD_DIR` | `src/fontsource.js`, `manifest.json` (`user_config.download_dir` → env), `README.md`, SKILL.md, the `download_font` description. |
| `keywords` | 4 JSON files + GitHub repo topics. Nothing checks them. |

`src/index.js` uses `import pkg from "../package.json" with { type: "json" }` — needs Node ≥18.20/20.10
to run from `src/`; the bundle has it inlined so `dist/` runs on any Node 18.

## Releasing

README Install Option B points at the `.mcpb` on Releases, so **an unreleased version is a broken install
path**. The `.mcpb` is gitignored — the Release is its only channel.

```
npm run selftest
npm run pack                      # rebuild + fresh fontsource-mcp.mcpb — always right before attaching
git push
gh release create v<X.Y.Z> fontsource-mcp.mcpb --title "v<X.Y.Z>" --notes "..."
```

Publish as GitHub user `nightious` (`gh auth switch -u nightious`); this repo's git `user.name` is set to
`nightious` locally.

## Verification

`npm run selftest` — `node:assert/strict`, live, ~10s. Pinned to live state (Inter has a 900 wght max and
≥300 files, noto-sans-jp has >20 unicode-range subsets, catalog >2000). A failure is as likely API/CDN
drift as a regression — check which before "fixing" code. CI runs it (public API, safe on runners).

Standalone bundle check (what a marketplace install actually hits): copy `dist/index.mjs` alone into an
empty dir and pipe `initialize` + `tools/list` JSON-RPC into `node index.mjs` — must list 6 tools.

## Traps

- **`slug()` is the traversal guard.** The id goes into both URLs and `path.join(dir, id)`. Don't relax
  the regex.
- **npm-CDN CSS has relative `url(./files/…)`.** Fine for `<link>`/`@import`; `getFontCss` absolutizes
  only the inlined `css` text. The `cdn.jsdelivr.net/fontsource/css/` mirror has absolute URLs but
  lacks per-subset files (`latin-700-italic.css` 404s there), which is why the npm CDN is used.
- **`full.css`/`standard.css` don't exist for every variable font** (Inter has neither). `wght[-italic].css`
  always does — hence `variableFile` defaults to `wght` and anything else is the agent's call.
- Axis-registry keys are case-sensitive OpenType tags (`wght` vs `GRAD`); `getAxisRegistry` tries both cases.

The `ponytail:` markers in `fontsource.js` name each shortcut's ceiling (no edit-distance search, no
unzip, in-memory cache only). Read them before assuming something is an oversight.
