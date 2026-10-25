# fontsource-mcp

MCP stdio server for fontsource.org. It reads the public JSON API and the `jsDelivr` CDN with Node
`fetch`: no key, no bot-blocking, no throttle (the API allows 2500 requests per 10s).

`src/index.js` registers tools. All logic is in `src/fontsource.js`, and its comments carry the
reasoning. Read them before editing.

## dist/ is what runs

Every install channel runs the committed `dist/index.mjs`; `npm start` runs `src/`, which no install does.

After any `src/` edit, run `npm run build` and commit `dist/` in the same commit. The selftest never
loads `dist/`, so a stale bundle fails only in CI.

## Cloud sessions

On claude.ai/code repo-declared plugins don't install: the server loads from `.mcp.json` and the skill
from `.claude/skills/fontsource-mcp`, a symlink to `skills/fontsource-mcp` (edit the original). The
server connects in the background and can miss the first prompt: if its tools aren't listed,
`ToolSearch` for `fontsource` (it waits for a connecting server) before saying they're unavailable.
Cloud-session network access must allow `api.fontsource.org` and `cdn.jsdelivr.net`.

## Lockstep

| When you change | Also update |
|---|---|
| version | `package.json`, `manifest.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`. `src/index.js` imports it from package.json and esbuild inlines it. Then `npm install --package-lock-only`, rebuild, and cut a release. CI fails if the four disagree. |
| a tool or param | `src/index.js`, `README.md`, `skills/fontsource-mcp/SKILL.md`. The manifest carries no `tools` array on purpose. |
| param guidance | The `.describe()` strings in `src/index.js` repeat SKILL.md on purpose: `.mcpbignore` drops `skills/`, so `.mcpb` users never see the skill. |
| `FONTSOURCE_DOWNLOAD_DIR` | `src/fontsource.js`, `manifest.json` (`user_config.download_dir`), `README.md`, SKILL.md, the `download_font` description. |
| server name `fontsource` | `.claude-plugin/plugin.json`, `.mcp.json`, `README.md`. |
| `keywords` | The four JSON files and the GitHub repo topics. Nothing checks them. |

Never regex-bump a version: `manifest.json` also carries `"manifest_version": "0.3"`, the MCPB specification
version. The JSON import in `src/index.js` needs Node 18.20 or 20.10 to run from `src/`; the bundle
runs on any Node 18.

Releasing and verification: `docs/MAINTAINING.md`.

## Pitfalls

- `slug()` is the traversal guard. The id goes into URLs and `path.join(dir, id)`. Keep the regex strict.
- `tag()` is the same guard for `axis`, `variableFile`, and `subsets`, which also reach file names and
  URLs. It allows uppercase for custom axis tags such as `GRAD`.
- The npm CDN CSS uses relative `url(./files/...)`. That works for `<link>` and `@import`;
  `getFontCss` makes absolute only the inlined `css` text. The `cdn.jsdelivr.net/fontsource/css/` mirror
  has absolute URLs but lacks per-subset files, which is why the npm CDN is used.
- `full.css` and `standard.css` exist only for some variable fonts (Inter has neither). Every variable
  font has `wght[-italic].css`, so `variableFile` defaults to `wght`.
- Axis-registry keys are case-sensitive OpenType tags (`wght`, `GRAD`); `getAxisRegistry` tries both.
