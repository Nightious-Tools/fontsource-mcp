// All logic lives here; src/index.js only registers tools.
// Data sources (public, no auth, 2500 req/10s ceiling — no throttle needed):
//   https://api.fontsource.org/v1/{fonts,fonts/:id,variable/:id,axis-registry,download/:id}
//   https://cdn.jsdelivr.net/fontsource/fonts/:id[:vf]@latest/<subset>-<weight|axis>-<style>.<ext>
//   https://cdn.jsdelivr.net/npm/@fontsource[-variable]/:id@latest/<file>.css
import fs from "node:fs";
import path from "node:path";

const API = "https://api.fontsource.org/v1";
const CDN = "https://cdn.jsdelivr.net";
const TTL = 3_600_000;
// Every Fontsource id is a lowercase slug. The id is spliced into URLs AND filesystem paths,
// so this regex is the injection/traversal guard — keep it strict.
const SLUG = /^[a-z0-9-]+$/;

export function slug(id) {
  if (typeof id !== "string" || !SLUG.test(id))
    throw new Error(`bad font id "${id}" — ids are lowercase slugs like "open-sans"; use search_fonts to find one`);
  return id;
}

async function get(url, as = "json") {
  const r = await fetch(url);
  if (!r.ok)
    throw new Error(`fontsource HTTP ${r.status}: ${url}${r.status === 404 ? " — unknown font id or file? use search_fonts / get_font" : ""}`);
  return as === "json" ? r.json() : as === "text" ? r.text() : Buffer.from(await r.arrayBuffer());
}

// ponytail: in-memory memo, 1h TTL. The catalog is 540KB; per-font metadata ~5–60KB. Errors aren't cached.
const cache = new Map();
async function cached(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const v = await get(url);
  cache.set(url, { at: Date.now(), v });
  return v;
}
const catalog = () => cached(`${API}/fonts`);
const font = (id) => cached(`${API}/fonts/${slug(id)}`);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const row = (f) => ({
  id: f.id, family: f.family, category: f.category, variable: f.variable,
  weights: f.weights, styles: f.styles, subsets: f.subsets, license: f.license, type: f.type,
});

export async function searchFonts({ query, category, subsets, weights, styles, variable, license, type, limit = 20, offset = 0 } = {}) {
  const lic = license?.toLowerCase();
  let list = (await catalog()).filter((f) =>
    (category == null || f.category === category) &&
    (type == null || f.type === type) &&
    (variable == null || f.variable === variable) &&
    (lic == null || f.license?.toLowerCase() === lic) &&
    (subsets ?? []).every((s) => f.subsets.includes(s)) &&
    (weights ?? []).every((w) => f.weights.includes(w)) &&
    (styles ?? []).every((s) => f.styles.includes(s)));
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
    // ponytail: no edit-distance rung; add one at score 20 if agents report typo misses
    list = list.map((f) => [score(f), f]).filter(([s]) => s)
      .sort((a, b) => b[0] - a[0] || a[1].family.length - b[1].family.length || a[1].family.localeCompare(b[1].family))
      .map(([, f]) => f);
  }
  return { total: list.length, offset, limit, rows: list.slice(offset, offset + limit).map(row) };
}

export async function getFont(id) {
  const f = await font(id);
  const axes = f.variable
    ? await cached(`${API}/variable/${id}`).then((v) => v.axes, (e) => { if (/HTTP 404/.test(e.message)) return null; throw e; })
    : null;
  let count = 0; const formats = new Set();
  for (const byStyle of Object.values(f.variants ?? {}))
    for (const bySub of Object.values(byStyle))
      for (const v of Object.values(bySub)) {
        const ks = Object.keys(v.url ?? {}); count += ks.length; ks.forEach((k) => formats.add(k));
      }
  const ur = f.unicodeRange ?? {}, urKeys = Object.keys(ur);
  return {
    id: f.id, family: f.family, category: f.category, license: f.license, type: f.type,
    version: f.version, npmVersion: f.npmVersion, source: f.source, lastModified: f.lastModified,
    variable: f.variable, defSubset: f.defSubset, subsets: f.subsets, weights: f.weights, styles: f.styles,
    axes,
    // noto-sans-jp has ~120 subsets of ranges; cap so get_font stays small
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
    files: { count, formats: [...formats] },
  };
}

const GENERIC = { serif: "serif", monospace: "monospace", handwriting: "cursive", display: "cursive" };

export async function getFontCss({ id, weights = [400], styles = ["normal"], subsets, variable = false, variableFile = "wght" } = {}) {
  const f = await font(id);
  if (variable && !f.variable) throw new Error(`"${id}" is not a variable font — call get_font_css without variable:true`);
  const ital = (s) => (s === "italic" ? "-italic" : "");
  const names = [];
  if (variable) {
    // ponytail: one file name, no axis logic. wght[-italic].css exists for every variable font;
    // standard/full/opsz/... exist only for some — the agent passes variableFile and a 404 names the URL.
    for (const s of styles) names.push(`${variableFile}${ital(s)}.css`);
  } else {
    for (const w of weights) for (const s of styles) for (const sub of subsets?.length ? subsets : [null])
      names.push(`${sub ? sub + "-" : ""}${w}${ital(s)}.css`);
  }
  const pkg = variable ? `@fontsource-variable/${id}` : `@fontsource/${id}`;
  const base = `${CDN}/npm/${pkg}@latest/`;
  const urls = names.map((n) => base + n);
  const fontFamily = variable ? `${f.family} Variable` : f.family;
  // The package CSS references ./files/… relative to itself. Fine for <link>/@import (the browser
  // resolves against the stylesheet URL) but broken once inlined, so absolutize the inlined copy.
  const css = (await Promise.all(urls.map((u) => get(u, "text")))).join("\n")
    .replaceAll("url(./files/", `url(${base}files/`);
  return {
    fontFamily,
    cssRule: `font-family: "${fontFamily}", ${GENERIC[f.category] ?? "sans-serif"};`,
    urls,
    link: urls.map((u) => `<link rel="stylesheet" href="${u}">`),
    import: urls.map((u) => `@import url("${u}");`),
    npm: { install: `npm i ${pkg}`, import: names.map((n) => `import "${pkg}/${n}";`) },
    css,
  };
}

export const defaultDownloadDir = () => path.resolve(process.env.FONTSOURCE_DOWNLOAD_DIR || "fonts");

export async function downloadFont({ id, dest, format = "woff2", subsets, weights, styles, variable = false, axis = "wght", zip = false } = {}) {
  slug(id);
  const dir = path.join(dest ? path.resolve(dest) : defaultDownloadDir(), id);
  const want = (arr, k) => !arr?.length || arr.map(String).includes(String(k));
  const jobs = [];
  if (zip) {
    // ponytail: saved as-is — Node has no stdlib unzip; per-file mode IS the extracted path.
    jobs.push({ name: `${id}.zip`, url: `${API}/download/${id}` });
  } else {
    const f = await font(id);
    if (variable) {
      if (!f.variable) throw new Error(`"${id}" is not a variable font — call download_font without variable:true`);
      for (const sub of f.subsets.filter((s) => want(subsets, s)))
        for (const st of f.styles.filter((s) => want(styles, s)))
          jobs.push({ name: `${sub}-${axis}-${st}.woff2`, url: `${CDN}/fontsource/fonts/${id}:vf@latest/${sub}-${axis}-${st}.woff2` });
    } else {
      for (const [w, byStyle] of Object.entries(f.variants ?? {})) if (want(weights, w))
        for (const [st, bySub] of Object.entries(byStyle)) if (want(styles, st))
          for (const [sub, v] of Object.entries(bySub)) if (want(subsets, sub) && v.url?.[format])
            jobs.push({ name: `${sub}-${w}-${st}.${format}`, url: v.url[format] });
    }
  }
  if (!jobs.length) throw new Error(`no files match those filters for "${id}" — see get_font for its subsets/weights/styles`);
  fs.mkdirSync(dir, { recursive: true });
  const results = await Promise.all(jobs.map(async (j) => {
    try {
      const buf = await get(j.url, "buffer");
      fs.writeFileSync(path.join(dir, j.name), buf);
      return { name: j.name, bytes: buf.length };
    } catch (e) { return { name: j.name, error: e.message }; }
  }));
  const files = results.filter((r) => r.bytes != null), failed = results.filter((r) => r.error);
  return { dir, files, totalBytes: files.reduce((n, f) => n + f.bytes, 0), ...(failed.length ? { failed } : {}) };
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
  // registry keys are case-sensitive OpenType tags: registered axes lowercase (wght), custom uppercase (GRAD)
  const key = [tag, tag.toLowerCase(), tag.toUpperCase()].find((k) => reg[k]);
  if (!key) throw new Error(`unknown axis "${tag}"; known: ${Object.keys(reg).join(", ")}`);
  return { tag: key, ...reg[key] };
}
