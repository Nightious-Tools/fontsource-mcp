---
name: fontsource-mcp
description: Drive the fontsource-mcp server to find, embed, and download open-source fonts from fontsource.org (the npm/CDN mirror of Google Fonts plus extras). Use this WHENEVER a task needs a web font — picking a typeface, getting a <link>/@import/npm snippet or @font-face CSS for a site, checking which weights/subsets/variable axes a font has, downloading .woff2/.ttf files to disk, or scanning the whole 2000+ font catalog by category/subset/license. Reach for it even when the user says "Google Fonts" — every Google font is here with the same id.
---

# Driving fontsource-mcp

Public API, no keys, no rate-limit worries. All tools take the font **`id` slug** (`open-sans`,
`noto-sans-jp`), never the display name — get it from `search_fonts`.

## Flow

1. **`search_fonts`** — `query` for a name (fuzzy: `"open sans"`, `"OpenSans"`, `"mono"` all work), or
   filters alone to browse (`category:"monospace", variable:true, subsets:["latin"]`). Rows already
   carry weights/styles/subsets/variable, so pick from the rows without extra calls.
2. **`get_font`** — only when you need axes, unicode ranges, license/version, or the CDN URL templates.
3. Then one of:
   - **`get_font_css`** for a website — returns `link[]`, `import[]`, `npm`, `cssRule`, and `css`
     (the real `@font-face` text with absolute URLs, safe to paste into a stylesheet).
   - **`download_font`** for local files — writes to `<dest>/<id>/`.

## Traps

- **Variable vs static are different packages.** `variable:true` → `@fontsource-variable/<id>` and
  `font-family: "<Family> Variable"`. Prefer variable when the font has it and you need >2 weights (one
  file covers 100–900). `get_font_css` defaults to static weight 400 normal.
- **Don't request every weight×style×subset of CSS** — Inter is 9×2×7 files. Ask for what the design
  uses (`weights:[400,700]`), and set `subsets:["latin"]` to get the small per-subset files.
- **`download_font` dest**: defaults to `$FONTSOURCE_DOWNLOAD_DIR`, else `./fonts` relative to the
  *server's* cwd (under a plugin install that's not the user's project) — pass an absolute `dest` when it
  matters. `zip:true` saves the official zip **unextracted**; per-file mode is the extracted form.
  Variable downloads ignore `weights`/`format` (always `<subset>-wght-<style>.woff2`).
- **Whole-catalog questions** ("all CC0 serif fonts with Vietnamese") → `index_fonts` with `outFile`,
  then grep/jq the JSON locally instead of paginating `search_fonts` with `limit:100`.
- A 404 from any tool means a wrong id or a file that doesn't exist for that font (e.g. `variableFile:"full"`
  on a font with only a `wght` axis) — check `get_font`, don't retry blindly.

Example: `search_fonts {query:"inter"}` → `get_font_css {id:"inter", variable:true}` → paste `link[0]`
and `cssRule` → or `download_font {id:"inter", dest:"C:/proj/public/fonts", variable:true, subsets:["latin"]}`.
