# fontsource-mcp

An MCP stdio server for **https://fontsource.org** — 2000+ open-source fonts (all of Google Fonts plus
extras) served as npm packages and via the jsDelivr CDN. Lets an agent search the catalog, read a font's
metadata, produce ready-to-paste embedding snippets, index the whole catalog, and download font files.
Uses the public Fontsource API and CDN; no API keys.

## Tools

- **`search_fonts`** — fuzzy `query` over id/family plus AND filters (`category`, `subsets`, `weights`,
  `styles`, `variable`, `license`, `type`), paginated. Rows carry everything needed to pick a font.
- **`get_font`** — full metadata for one `id`: subsets, weights, styles, variable axes, unicode ranges,
  license, version, npm package names, CSS font-family names, page URL, zip URL, CDN URL templates.
- **`get_font_css`** — `<link>` tags, `@import` lines, `npm i` + import lines, the `font-family` rule,
  and the actual `@font-face` CSS (absolute URLs, safe to inline). Static or `variable:true`.
- **`download_font`** — writes files to `<dest>/<id>/`. Static (`format` woff2/woff/ttf, filtered by
  subset/weight/style), `variable:true` (`<subset>-wght-<style>.woff2`), or `zip:true` (official zip, unextracted).
- **`index_fonts`** — facet counts (category / subset / license / type / variable) and, with `outFile`,
  dumps the full catalog JSON to disk for local grep/jq.
- **`get_axis_registry`** — variable-font axis registry (`wght`, `wdth`, `opsz`, `GRAD`, …).

## Download location

`download_font` writes under `dest` if given. Otherwise it uses **`FONTSOURCE_DOWNLOAD_DIR`**, and if that
is unset, `./fonts` relative to the server's working directory. Under a plugin install that cwd is not
your project, so either set the env var or pass `dest`:

- Claude Code: export `FONTSOURCE_DOWNLOAD_DIR` in your shell before launching `claude` (plugins inherit
  your environment).
- Claude Desktop `.mcpb`: the extension asks for a "Download folder" at install time.

## Install

### Option A — Claude Code plugin marketplace (recommended)

```
/plugin marketplace add nightious/fontsource-mcp
/plugin install fontsource-mcp@fontsource-mcp
```

This auto-wires the MCP server (the plugin config uses `${CLAUDE_PLUGIN_ROOT}`, no paths to edit) and
adds a skill that teaches agents how to drive it. Requires Node 18+ on your `PATH`.

### Option B — Desktop Extension (.mcpb, one-click Claude Desktop)

Download `fontsource-mcp.mcpb` from the repo's Releases and double-click it — Claude Desktop installs it
with no paths to edit and no `npm install` (the server is bundled into a single dependency-free
`dist/index.mjs`).

### Option C — manual (Claude Desktop / any MCP client)

Run `npm install && npm run build` first, then add to `claude_desktop_config.json`:

```json
"fontsource": {
  "command": "node",
  "args": ["C:\\path\\to\\fontsource-mcp\\dist\\index.mjs"],
  "env": { "FONTSOURCE_DOWNLOAD_DIR": "C:\\Users\\you\\fonts" }
}
```

> MSIX Claude Desktop installs put this config under
> `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\`, not plain `%APPDATA%`.

## Build (contributors)

The distributed artifact is a single bundled `dist/index.mjs` (esbuild). After editing anything in
`src/`, rebuild and commit `dist/`:

```
npm install
npm run build       # -> dist/index.mjs (what the plugin & .mcpb run)
npm run pack        # build + produce fontsource-mcp.mcpb for Claude Desktop
```

## Self-test

```
npm run selftest      # or: node src/selftest.js
```

Makes ~20 live requests to api.fontsource.org and cdn.jsdelivr.net (about 10s). Failure means the API
shape or CDN file naming drifted.

## Data sources

- `https://api.fontsource.org/v1/{fonts, fonts/:id, variable/:id, axis-registry, download/:id}`
- `https://cdn.jsdelivr.net/fontsource/fonts/:id[:vf]@latest/<subset>-<weight|axis>-<style>.<ext>`
- `https://cdn.jsdelivr.net/npm/@fontsource[-variable]/:id@latest/<file>.css`

Fonts themselves are licensed by their designers (OFL, Apache-2.0, CC0, …) — see each font's `license`.

## License

**All rights reserved** (see [LICENSE](LICENSE)). The source is public for viewing and for contributions
back to this repository via pull request. It is not open source — you may not redistribute it or publish
your own version.
