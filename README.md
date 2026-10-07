# fontsource-mcp

An MCP stdio server for https://fontsource.org, which packages 2000+ open-source fonts (all of Google
Fonts plus extras) as npm modules served from the jsDelivr CDN. It reads the public API and CDN and
needs no key.

A subset is a font file cut down to one script, such as `latin`. A variable font packs a whole weight
range into one file and exposes axes such as `wght`.

## Tools

- `search_fonts`: fuzzy `query` over id and family, plus AND filters (`category`, `subsets`, `weights`,
  `styles`, `variable`, `license`, `type`). Paginated. Rows carry enough to pick a font.
- `get_font`: subsets, weights, styles, axes, unicode ranges, license, version, npm names, CSS
  font-family names, page URL, zip URL, and CDN URL templates for one `id`.
- `get_font_css`: `<link>` tags, `@import` lines, npm install and import lines, the `font-family`
  rule, and inlinable `@font-face` CSS with absolute URLs. `variable:true` selects the variable package.
- `download_font`: writes to `<dest>/<id>/`. Filters by subset, weight, style, and `format` (woff2,
  woff, ttf). `variable:true` fetches `<subset>-wght-<style>.woff2`. `zip:true` saves the official zip
  unextracted.
- `index_fonts`: facet counts by category, subset, license, type, and variable. With `outFile` it
  writes the full catalog JSON to disk.
- `get_axis_registry`: the variable-font axis registry.

## Download location

`download_font` writes under `dest` when given, else `FONTSOURCE_DOWNLOAD_DIR`, else `./fonts` in the
server's working directory. Under a plugin install that directory is not your project, so set the
variable or pass `dest`. In Claude Code, export it before launching `claude`. The Claude Desktop
extension asks for a folder at install.

## Install

Claude Code:

```
/plugin marketplace add nightious/fontsource-mcp
/plugin install fontsource-mcp@fontsource-mcp
```

The plugin wires the server through `${CLAUDE_PLUGIN_ROOT}` and adds a skill for agents. Needs Node 18+.

Claude Desktop: download `fontsource-mcp.mcpb` from Releases and open it. The server is one
dependency-free `dist/index.mjs`, so nothing runs `npm install`.

Manual: run `npm install && npm run build`, then add to `claude_desktop_config.json`:

```json
"fontsource": {
  "command": "node",
  "args": ["C:\\path\\to\\fontsource-mcp\\dist\\index.mjs"],
  "env": { "FONTSOURCE_DOWNLOAD_DIR": "C:\\Users\\you\\fonts" }
}
```

The MSIX build of Claude Desktop keeps that file under
`%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\`.

## Build and test

`dist/index.mjs` is the shipped artifact and is committed. After any change under `src/`, rebuild and
commit it.

```
npm run build       # dist/index.mjs
npm run pack        # build, then fontsource-mcp.mcpb
npm run selftest    # about 20 live requests, ten seconds
```

A selftest failure means the API shape or CDN file naming changed.

## Data sources

- `https://api.fontsource.org/v1/{fonts, fonts/:id, variable/:id, axis-registry, download/:id}`
- `https://cdn.jsdelivr.net/fontsource/fonts/:id[:vf]@latest/<subset>-<weight|axis>-<style>.<ext>`
- `https://cdn.jsdelivr.net/npm/@fontsource[-variable]/:id@latest/<file>.css`

Each font carries its own license (OFL, Apache-2.0, CC0, and others) in the `license` field.

## License

Source-available, not open source. You may install and run it; you may not redistribute or modify it. See [LICENSE](LICENSE).
