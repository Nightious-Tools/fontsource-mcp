// All logic lives here; src/index.js only registers tools.
// Data sources are public, need no auth, and allow 2500 req/10s, so there is no throttle:
//   https://api.fontsource.org/v1/{fonts,fonts/:id,variable/:id,axis-registry,download/:id}
//   https://cdn.jsdelivr.net/fontsource/fonts/:id[:vf]@latest/<subset>-<weight|axis>-<style>.<ext>
//   https://cdn.jsdelivr.net/npm/@fontsource[-variable]/:id@latest/<file>.css
//   https://fonts.google.com/metadata/fonts (popularity, trending, dateAdded, designers, axes; joined on family)
import fs from "node:fs";
import path from "node:path";

const API = "https://api.fontsource.org/v1";
const CDN = "https://cdn.jsdelivr.net";
const TTL = 3_600_000;
// Every Fontsource id is a lowercase slug. The id is spliced into URLs and filesystem paths,
// so this regex is the injection and traversal guard. Keep it strict.
const SLUG = /^[a-z0-9-]+$/;

export function slug(id) {
  if (typeof id !== "string" || !SLUG.test(id))
    throw new Error(`bad font id "${id}": ids are lowercase slugs like "open-sans"; use search_fonts to find one`);
  return id;
}
// axis, variableFile, and subsets also reach file names and URLs. Same guard, but tags may be uppercase (GRAD).
const tag = (v, what) => { if (typeof v !== "string" || !/^[A-Za-z0-9-]+$/.test(v)) throw new Error(`bad ${what} "${v}": letters, digits, and hyphens only; see get_font`); };

async function get(url, as = "json", ms = 60_000) {
  // The timeout covers the body too, so a stalled CDN fails the call instead of hanging it.
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok)
    throw new Error(`fontsource HTTP ${r.status}: ${url}${r.status === 404 ? " (unknown font id or file; use search_fonts or get_font)" : ""}`);
  return as === "json" ? r.json() : as === "text" ? r.text() : Buffer.from(await r.arrayBuffer());
}

// ponytail: in-memory memo, 1h TTL. The catalog is 540KB and per-font metadata 5 to 60KB. Errors are not cached.
const cache = new Map();
async function cached(url, ms) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const v = await get(url, "json", ms);
  cache.set(url, { at: Date.now(), v });
  return v;
}
const catalog = () => cached(`${API}/fonts`);
const font = (id) => cached(`${API}/fonts/${slug(id)}`);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// Lower popularity and trending ranks come first; newest sorts dateAdded descending.
const SORT = { popular: (g) => g.popularity, trending: (g) => g.trending, newest: (g) => -Date.parse(g.dateAdded) };
// The last Google metadata failure. It is replayed for 5 min, so a stalled host costs one 15s wait, not one per search.
let gmDown = { at: -Infinity };

export async function searchFonts({ query, category, subsets, weights, styles, variable, license, type, axes, sort, limit = 20, offset = 0 } = {}) {
  const lic = license?.toLowerCase();
  // ponytail: fonts.google.com/metadata/fonts is undocumented (2.7MB, 1h cache, 15s timeout). If it fails or changes shape,
  // rows come back unenriched, unsorted, and unfiltered by axes, with a warning. Mirror the fields if it breaks for good.
  let gm = null, warning;
  try {
    if (Date.now() - gmDown.at < 300_000) throw gmDown.e;
    gm = new Map((await cached("https://fonts.google.com/metadata/fonts", 15_000)).familyMetadataList.map((g) => [g.family, g]));
  } catch (e) {
    if (e !== gmDown.e) gmDown = { at: Date.now(), e };
    warning = `Google Fonts metadata unavailable (${e.message}): no popularity, designers, sort, or axes filter`;
  }
  let list = (await catalog()).filter((f) =>
    (category == null || f.category === category) &&
    (type == null || f.type === type) &&
    (variable == null || f.variable === variable) &&
    (lic == null || f.license?.toLowerCase() === lic) &&
    (subsets ?? []).every((s) => f.subsets.includes(s)) &&
    (weights ?? []).every((w) => f.weights.includes(w)) &&
    (styles ?? []).every((s) => f.styles.includes(s)) &&
    (!gm || (axes ?? []).every((t) => gm.get(f.family)?.axes?.some((a) => a.tag === t))));
  const q = query?.trim().toLowerCase();
  if (q) {
    const nq = norm(q), toks = q.split(/\s+/);
    const score = (f) => {
      const id = f.id, fam = f.family.toLowerCase(), nid = norm(id), nfam = norm(fam);
      if (nid === nq || nfam === nq) return 100;
      if (nid.startsWith(nq) || nfam.startsWith(nq)) return 80;
      if (nid.includes(nq) || nfam.includes(nq)) return 60;
      if (toks.every((t) => id.includes(t) || fam.includes(t))) return 40;
      return 0;
    };
    // ponytail: no edit-distance rung. Add one at score 20 if agents report typo misses.
    list = list.map((f) => [score(f), f]).filter(([s]) => s)
      .sort((a, b) => b[0] - a[0] || a[1].family.length - b[1].family.length || a[1].family.localeCompare(b[1].family))
      .map(([, f]) => f);
  }
  if (sort && gm) {
    // Fonts with no Google entry sort last; the stable sort keeps relevance order among ties.
    const v = (f) => { const g = gm.get(f.family), x = g && SORT[sort](g); return Number.isFinite(x) ? x : Infinity; };
    list.sort((a, b) => v(a) - v(b));
  }
  const rows = list.slice(offset, offset + limit).map((f) => (gm ? { ...f, popularity: gm.get(f.family)?.popularity ?? null, designers: gm.get(f.family)?.designers ?? null } : f));
  return { total: list.length, offset, limit, rows, warning };
}

export async function getFont(id) {
  const { variants, unicodeRange: ur = {}, ...f } = await font(id);
  const axes = f.variable
    ? await cached(`${API}/variable/${id}`).then((v) => v.axes, (e) => { if (/HTTP 404/.test(e.message)) return null; throw e; })
    : null;
  const formats = new Set();
  for (const byStyle of Object.values(variants ?? {}))
    for (const bySub of Object.values(byStyle))
      for (const v of Object.values(bySub)) Object.keys(v.url ?? {}).forEach((k) => formats.add(k));
  const urKeys = Object.keys(ur);
  return {
    ...f,
    axes,
    // noto-sans-jp has about 120 unicode-range subsets. Cap them so get_font stays small.
    unicodeRange: urKeys.length > 20 ? { omitted: urKeys.length, url: `${API}/fonts/${id}` } : ur,
    npm: { static: `@fontsource/${id}`, variable: f.variable ? `@fontsource-variable/${id}` : null },
    fontFamily: { static: f.family, variable: f.variable ? `${f.family} Variable` : null },
    page: `https://fontsource.org/fonts/${id}`,
    downloadZip: `${API}/download/${id}`,
    cdn: {
      file: `${CDN}/fontsource/fonts/${id}@latest/{subset}-{weight}-{style}.{${[...formats].join("|") || "woff2"}}`,
      variableFile: f.variable ? `${CDN}/fontsource/fonts/${id}:vf@latest/{subset}-{wght|standard|full}-{style}.woff2` : null,
      css: `${CDN}/npm/@fontsource/${id}@latest/{weight}[-italic].css`,
      variableCss: f.variable ? `${CDN}/npm/@fontsource-variable/${id}@latest/wght[-italic].css` : null,
    },
    files: { formats: [...formats] },
  };
}

// display falls through to sans-serif: cursive would put Comic Sans behind Abril Fatface.
const GENERIC = { serif: "serif", monospace: "monospace", handwriting: "cursive" };

export async function getFontCss({ id, weights = [400], styles = ["normal"], subsets, variable = false, variableFile = "wght" } = {}) {
  tag(variableFile, "variableFile"); subsets?.forEach((s) => tag(s, "subset"));
  const f = await font(id);
  if (variable && !f.variable) throw new Error(`"${id}" is not a variable font; call get_font_css without variable:true`);
  const ital = (s) => (s === "italic" ? "-italic" : "");
  const names = [];
  if (variable) {
    // ponytail: one file name, no axis logic. wght[-italic].css exists for every variable font.
    // standard, full, opsz, and the rest exist only for some, so the agent passes variableFile and a 404 names the URL.
    for (const s of styles) names.push(`${variableFile}${ital(s)}.css`);
  } else {
    for (const w of weights) for (const s of styles) for (const sub of subsets?.length ? subsets : [null])
      names.push(`${sub ? sub + "-" : ""}${w}${ital(s)}.css`);
  }
  const pkg = variable ? `@fontsource-variable/${id}` : `@fontsource/${id}`;
  const base = `${CDN}/npm/${pkg}@latest/`;
  const urls = names.map((n) => base + n);
  const fontFamily = variable ? `${f.family} Variable` : f.family;
  // The package CSS references ./files/ relative to itself. That works for <link> and @import, where
  // the browser resolves against the stylesheet URL, but breaks once inlined, so absolutize the inlined copy.
  const css = (await Promise.all(urls.map((u) => get(u, "text")))).join("\n")
    .replaceAll("url(./files/", `url(${base}files/`);
  const pre = css.match(/url\(([^)]+-latin-(?!ext)[^)]*\.woff2)\)/)?.[1];
  return {
    fontFamily,
    cssRule: `font-family: "${fontFamily}", ${GENERIC[f.category] ?? "sans-serif"};`,
    urls,
    preload: pre ? `<link rel="preload" as="font" type="font/woff2" href="${pre}" crossorigin>` : null,
    npm: { install: `npm i ${pkg}`, import: names.map((n) => `import "${pkg}/${n}";`) },
    css,
  };
}

export const defaultDownloadDir = () => path.resolve(process.env.FONTSOURCE_DOWNLOAD_DIR || "fonts");

export async function downloadFont({ id, dest, format = "woff2", subsets, weights, styles, variable = false, axis = "wght", zip = false } = {}) {
  slug(id); tag(axis, "axis");
  const dir = path.join(dest ? path.resolve(dest) : defaultDownloadDir(), id);
  const want = (arr, k) => !arr?.length || arr.map(String).includes(String(k));
  const jobs = [];
  if (zip) {
    // ponytail: saved as-is. Node has no stdlib unzip, and per-file mode is the extracted path.
    jobs.push({ name: `${id}.zip`, url: `${API}/download/${id}` });
  } else {
    const f = await font(id);
    if (variable) {
      if (!f.variable) throw new Error(`"${id}" is not a variable font; call download_font without variable:true`);
      // :vf files are named by unicodeRange key, not by subset. noto-sans-jp's japanese has no key of its
      // own: it is the numbered slices [0]..[119], so a subset without a key means those slices.
      const ks = Object.keys(f.unicodeRange ?? {}), keys = (ks.length ? ks : f.subsets).map(unbracket);
      const nums = keys.filter((k) => /^\d+$/.test(k));
      const subs = subsets?.length ? [...new Set(subsets.flatMap((s) => (keys.includes(s) ? [s] : f.subsets.includes(s) ? nums : [])))] : keys;
      for (const sub of subs)
        for (const st of f.styles.filter((s) => want(styles, s)))
          jobs.push({ name: `${sub}-${axis}-${st}.woff2`, url: `${CDN}/fontsource/fonts/${id}:vf@latest/${sub}-${axis}-${st}.woff2` });
    } else {
      for (const [w, byStyle] of Object.entries(f.variants ?? {})) if (want(weights, w))
        for (const [st, bySub] of Object.entries(byStyle)) if (want(styles, st))
          for (const [sub, v] of Object.entries(bySub)) if (want(subsets, sub) && v.url?.[format])
            jobs.push({ name: `${sub}-${w}-${st}.${format}`, url: v.url[format] });
    }
  }
  if (!jobs.length) throw new Error(`no files match those filters for "${id}"; see get_font for its subsets, weights, and styles`);
  fs.mkdirSync(dir, { recursive: true });
  const one = async (j) => {
    try {
      const buf = await get(j.url, "buffer");
      fs.writeFileSync(path.join(dir, j.name), buf);
      return { name: j.name, bytes: buf.length };
    } catch (e) { return { name: j.name, error: e.message }; }
  };
  // ponytail: batches of 8 fetches, each batch waiting for its slowest. A static noto-sans-jp download is about
  // 1,125 files; switch to a worker pool if slow stragglers matter, tune the 8 if jsDelivr throttles.
  const results = [];
  for (let i = 0; i < jobs.length; i += 8) results.push(...(await Promise.all(jobs.slice(i, i + 8).map(one))));
  const files = results.filter((r) => r.bytes != null), failed = results.filter((r) => r.error);
  return { dir, files, totalBytes: files.reduce((n, f) => n + f.bytes, 0), ...(failed.length ? { failed } : {}) };
}

// unicodeRange keys for sliced CJK fonts are "[0]".."[119]"; CDN file names and variants use "0".."119".
const unbracket = (k) => k.replace(/^\[(\d+)\]$/, "$1");

// ponytail: unicode-range is the subset declaration, not the font's cmap. A codepoint inside a declared range
// can still lack a glyph; parse the woff2 cmap if agents hit that.
export async function checkText({ id, text } = {}) {
  const f = await font(id);
  const ranges = Object.entries(f.unicodeRange ?? {}).map(([k, v]) => [unbracket(k), v.split(",").map((r) => {
    const [a, b = a] = r.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(a.replaceAll("?", "0"), 16), parseInt(b.replaceAll("?", "f"), 16)];
  })]);
  if (!ranges.length) throw new Error(`"${id}" declares no unicodeRange, so coverage is unknown`);
  const covers = (rs, cp) => rs.some(([lo, hi]) => cp >= lo && cp <= hi);
  const missing = [], subsets = [];
  for (const ch of new Set(text)) {
    const cp = ch.codePointAt(0);
    if (ranges.some(([k, rs]) => subsets.includes(k) && covers(rs, cp))) continue;
    const hit = ranges.find(([, rs]) => covers(rs, cp));
    if (hit) subsets.push(hit[0]); else missing.push(ch);
  }
  return { missing, subsets };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function compareFonts({ ids, text = "The quick brown fox jumps over the lazy dog 0123456789", weights = [400, 700], outFile } = {}) {
  const links = [], rows = [], fontFamilies = {};
  for (const f of await Promise.all(ids.map((id) => font(id)))) {
    const fam = f.variable ? `${f.family} Variable` : f.family;
    // A weight the font lacks would render faux-bold, so it is skipped; a font with none of them shows its first weight.
    const ws = weights.filter((w) => f.weights.includes(w));
    if (!ws.length) ws.push(f.weights[0]);
    fontFamilies[f.id] = fam;
    const base = `${CDN}/npm/@fontsource${f.variable ? "-variable" : ""}/${f.id}@latest/`;
    for (const n of f.variable ? ["wght.css"] : ws.map((w) => `${w}.css`)) links.push(`<link rel="stylesheet" href="${base}${n}">`);
    // The family sits in a CSS string inside an HTML attribute: CSS-escape \ and ', then HTML-escape.
    const cssFam = esc(fam.replace(/[\\']/g, "\\$&"));
    for (const w of ws) for (const px of [16, 24, 48])
      rows.push(`<small>${esc(fam)} ${w}, ${px}px</small><p style="font: ${w} ${px}px '${cssFam}', ${GENERIC[f.category] ?? "sans-serif"}">${esc(text)}</p>`);
  }
  const p = path.resolve(outFile);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Font specimen</title>
${links.join("\n")}
<style>body{margin:24px;font:14px system-ui,sans-serif}small{display:block;color:#555}p{margin:4px 0 20px;overflow-wrap:anywhere}</style>
${rows.join("\n")}
`);
  return { outFile: p, fontFamilies };
}

export async function indexFonts({ outFile } = {}) {
  const list = await catalog();
  const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
  const facets = { category: {}, subsets: {}, license: {}, type: {}, variable: { true: 0, false: 0 } };
  for (const f of list) {
    inc(facets.category, f.category); inc(facets.license, f.license); inc(facets.type, f.type);
    inc(facets.variable, f.variable); f.subsets.forEach((s) => inc(facets.subsets, s));
  }
  const out = { total: list.length, facets };
  if (outFile) {
    const p = path.resolve(outFile);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const s = JSON.stringify(list);
    fs.writeFileSync(p, s);
    out.outFile = p; out.bytes = Buffer.byteLength(s);
  }
  return out;
}

export async function getAxisRegistry(tag) {
  const reg = await cached(`${API}/axis-registry`);
  if (!tag) return reg;
  // Registry keys are case-sensitive OpenType tags: registered axes are lowercase (wght), custom ones uppercase (GRAD).
  const key = [tag, tag.toLowerCase(), tag.toUpperCase()].find((k) => reg[k]);
  if (!key) throw new Error(`unknown axis "${tag}"; known: ${Object.keys(reg).join(", ")}`);
  return { tag: key, ...reg[key] };
}
