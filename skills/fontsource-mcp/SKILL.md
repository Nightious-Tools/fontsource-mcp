---
name: fontsource-mcp
description: Drive the fontsource-mcp server to find, embed, and download open-source fonts from fontsource.org, the npm and CDN mirror of Google Fonts plus extras. Use it whenever a task needs a web font: picking a typeface, producing a link, @import, npm snippet, or @font-face CSS for a site, checking a font's weights, subsets, or variable axes, downloading woff2 or ttf files, or scanning the 2000+ font catalog by category, subset, or license. Applies when the user says Google Fonts too; every Google font is here under the same id.
---

# Driving fontsource-mcp

Public API, no key, no rate limit to plan around. Every tool takes the font id slug (`open-sans`,
`noto-sans-jp`), never the display name. Get it from `search_fonts`.

## Flow

1. `search_fonts` with a `query` (fuzzy: `"open sans"`, `"OpenSans"`, and `"mono"` all match) or with
   filters alone to browse, such as `category:"monospace", variable:true, subsets:["latin"]`. Rows
   carry weights, styles, subsets, and the variable flag, so pick from them directly.
2. `get_font` only for axes, unicode ranges, license, version, or CDN URL templates.
3. `get_font_css` for a website (`link[]`, `import[]`, `npm`, `cssRule`, and `css`, the `@font-face`
   text with absolute URLs), or `download_font` for files on disk under `<dest>/<id>/`.

## Pitfalls

- Variable and static are different packages. `variable:true` selects `@fontsource-variable/<id>` and
  the CSS family becomes `"<Family> Variable"`. Prefer it when the design needs more than two weights;
  one file covers 100 to 900. `get_font_css` defaults to static weight 400 normal.
- Do not request every weight, style, and subset of CSS; Inter alone is 9 by 2 by 7 files. Ask for
  what the design uses (`weights:[400,700]`) and set `subsets:["latin"]` for the small files.
- `download_font` defaults to `$FONTSOURCE_DOWNLOAD_DIR`, then `./fonts` in the server's cwd, which
  under a plugin install is not the user's project. Pass an absolute `dest` when it matters. `zip:true`
  saves the zip unextracted. Variable downloads ignore `weights` and `format`.
- For whole-catalog questions ("all CC0 serif fonts with Vietnamese"), call `index_fonts` with
  `outFile` and grep or jq the JSON locally instead of paginating `search_fonts`.
- A 404 means a wrong id or a file the font does not ship, such as `variableFile:"full"` on a
  wght-only font. Check `get_font` instead of retrying.

Example: `search_fonts {query:"inter"}`, then `get_font_css {id:"inter", variable:true}` and paste
`link[0]` plus `cssRule`, or `download_font {id:"inter", dest:"C:/proj/public/fonts", variable:true,
subsets:["latin"]}`.
