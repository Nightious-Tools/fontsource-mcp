// Live tripwires against the real API/CDN. `npm run selftest`. No framework.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { searchFonts, getFont, getFontCss, downloadFont, indexFonts, getAxisRegistry, defaultDownloadDir } from "./fontsource.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontsource-mcp-selftest-"));
const magic = (p, s) => assert.equal(fs.readFileSync(p).subarray(0, s.length).toString("latin1"), s, `${p} magic`);
const block = async (name, fn) => { await fn(); console.log(`${name} ... ok`); };

try {
  await block("search", async () => {
    let r = await searchFonts({ query: "inter" });
    assert.equal(r.rows[0].id, "inter"); assert.ok(r.total > 1, "exact must beat inter-tight, not exclude it");
    r = await searchFonts({ query: "open sans" });
    assert.equal(r.rows[0].id, "open-sans", "family-exact rung");
    r = await searchFonts({ query: "OpenSans" });
    assert.equal(r.rows[0].id, "open-sans", "normalized rung");
    r = await searchFonts({ category: "monospace", variable: true, subsets: ["latin"] });
    assert.ok(r.total > 0);
    for (const f of r.rows) { assert.equal(f.category, "monospace"); assert.equal(f.variable, true); assert.ok(f.subsets.includes("latin")); }
    assert.equal((await searchFonts({ query: "zzqqxx" })).total, 0);
    r = await searchFonts({ limit: 5, offset: 5 });
    assert.equal(r.rows.length, 5); assert.ok(r.total > 2000, `catalog size ${r.total}`);
  });

  await block("get_font", async () => {
    const inter = await getFont("inter");
    assert.equal(inter.variable, true); assert.equal(Number(inter.axes.wght.max), 900);
    assert.equal(inter.npm.variable, "@fontsource-variable/inter"); assert.ok(inter.files.count >= 300, `files ${inter.files.count}`);
    assert.ok(JSON.stringify(inter).length < 20_000, "get_font payload must stay small");
    const jp = await getFont("noto-sans-jp");
    assert.ok(jp.unicodeRange.omitted > 20, "unicodeRange cap"); assert.ok(JSON.stringify(jp).length < 20_000);
    const af = await getFont("abril-fatface");
    assert.equal(af.variable, false); assert.equal(af.axes, null); assert.equal(af.npm.variable, null);
    await assert.rejects(getFont("nope-not-a-font"), /HTTP 404/);
    await assert.rejects(getFont("../x"), /bad font id/);
  });

  await block("get_font_css", async () => {
    let r = await getFontCss({ id: "inter" });
    assert.equal(r.fontFamily, "Inter"); assert.match(r.css, /@font-face/); assert.match(r.css, /font-weight: 400/);
    assert.ok(!r.css.includes("url(./files/"), "inlined css must have absolute urls");
    assert.match(r.css, /url\(https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource\/inter@latest\/files\//);
    r = await getFontCss({ id: "inter", subsets: ["latin"], weights: [700], styles: ["italic"] });
    assert.ok(r.urls[0].endsWith("/latin-700-italic.css"), r.urls[0]); assert.match(r.css, /font-style: italic/);
    r = await getFontCss({ id: "inter", variable: true });
    assert.equal(r.fontFamily, "Inter Variable"); assert.match(r.css, /font-weight: 100 900/);
    await assert.rejects(getFontCss({ id: "abril-fatface", variable: true }), /not a variable font/);
  });

  await block("download_font", async () => {
    let r = await downloadFont({ id: "inter", dest: tmp, subsets: ["latin"], weights: [400], styles: ["normal"] });
    assert.equal(r.files.length, 1); assert.equal(r.files[0].name, "latin-400-normal.woff2");
    assert.ok(r.files[0].bytes > 10_000); magic(path.join(r.dir, r.files[0].name), "wOF2");
    r = await downloadFont({ id: "inter", dest: tmp, variable: true, subsets: ["latin"], styles: ["normal"] });
    assert.equal(r.files[0].name, "latin-wght-normal.woff2"); magic(path.join(r.dir, r.files[0].name), "wOF2");
    r = await downloadFont({ id: "inter", dest: tmp, zip: true });
    assert.ok(r.files[0].bytes > 100_000); magic(path.join(r.dir, "inter.zip"), "PK");
    await assert.rejects(downloadFont({ id: "../x", dest: tmp }), /bad font id/);
    await assert.rejects(downloadFont({ id: "inter", dest: tmp, subsets: ["klingon"] }), /no files match/);
    process.env.FONTSOURCE_DOWNLOAD_DIR = path.join(tmp, "envdir");
    assert.equal(defaultDownloadDir(), path.join(tmp, "envdir"));
    r = await downloadFont({ id: "abel", subsets: ["latin"] });
    assert.ok(r.dir.startsWith(path.join(tmp, "envdir")), r.dir); assert.equal(r.files.length, 1);
  });

  await block("index_fonts", async () => {
    const out = path.join(tmp, "idx", "catalog.json");
    const r = await indexFonts({ outFile: out });
    assert.ok(r.facets.category["sans-serif"] > 100); assert.ok(r.facets.variable.true > 0); assert.ok(r.facets.subsets.latin > 1000);
    assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).length, r.total);
  });

  await block("get_axis_registry", async () => {
    const w = await getAxisRegistry("wght");
    assert.equal(w.min, 1); assert.equal(w.max, 1000);
    assert.equal((await getAxisRegistry("grad")).tag, "GRAD", "case fallback");
    const all = await getAxisRegistry();
    assert.ok(all.wght && all.wdth);
    await assert.rejects(getAxisRegistry("nope"), /unknown axis/);
  });

  console.log("ALL BLOCKS PASSED");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
