# Maintaining

## Releasing

The README points Claude Desktop users at the `.mcpb` on Releases, and git ignores the `.mcpb`, so an
unreleased version is a broken install path.

```
npm run selftest
npm run pack
git push
gh release create v<X.Y.Z> fontsource-mcp.mcpb --title "v<X.Y.Z>" --notes "..."
```

Run `npm run pack` right before attaching; a `.mcpb` left in the working directory may be stale.

## Verification

`npm run selftest` uses `node:assert/strict`, makes live requests, and takes about ten seconds. CI runs it.
It's pinned to live state (Inter has a `wght` max of 900; noto-sans-jp has more than 20 unicode-range
subsets, numbered variable slices, and `日本語` in them; the catalog exceeds 2000 fonts; Google Fonts
ranks `inter` or `roboto` in its top 5), so treat a failure as possible drift before
treating it as a regression.

For the bundle, copy `dist/index.mjs` alone into an empty directory and pipe `initialize` plus
`tools/list` JSON-RPC into `node index.mjs`. It must list eight tools.
