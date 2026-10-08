import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { searchFonts, getFont, getFontCss, downloadFont, indexFonts, getAxisRegistry, defaultDownloadDir, checkText, compareFonts } from "./fontsource.js";

const server = new McpServer({ name: "fontsource", version: pkg.version });
const text = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
const RO = { readOnlyHint: true };

const id = z.string().describe('Fontsource id slug such as "inter", "open-sans", or "noto-sans-jp". Get it from search_fonts. It is not the display name.');
const subsets = z.array(z.string()).optional().describe('Subsets such as ["latin","latin-ext","cyrillic"]. Omit for all.');
const weights = z.array(z.number()).optional().describe("Weights such as [400,700]. Omit for all.");
const styles = z.array(z.enum(["normal", "italic"])).optional().describe('["normal"], ["italic"], or both. Omit for all.');

server.registerTool("search_fonts",
  { description: "Search the Fontsource catalog of 2000+ open-source fonts. The fuzzy query matches id and family (exact, then prefix, then substring, then all words). Filters are AND. Rows are the catalog rows (the id every other tool needs, weights, styles, subsets, variable) plus Google Fonts popularity (rank, lower is more popular) and designers, null for fonts not on Google Fonts. Filters without a query browse a category. sort replaces relevance order. If Google Fonts metadata is unreachable, rows come back unenriched with a warning.",
    annotations: { title: "Search fonts", ...RO },
    inputSchema: {
      query: z.string().optional().describe('Name fragment such as "inter", "open sans", or "mono".'),
      category: z.enum(["sans-serif", "serif", "display", "monospace", "handwriting", "other", "icons"]).optional(),
      subsets, weights, styles,
      variable: z.boolean().optional().describe("true returns only variable fonts."),
      license: z.string().optional().describe("OFL-1.1 | Apache-2.0 | CC0-1.0 | mit | Unlicense | UFL-1.0"),
      type: z.enum(["google", "other"]).optional().describe("google means mirrored from Google Fonts."),
      axes: z.array(z.string()).optional().describe('Variable axis tags the font must all have, such as ["wdth","opsz"]. Uses Google Fonts axes, so fonts not on Google Fonts never match.'),
      sort: z.enum(["popular", "trending", "newest"]).optional().describe("Google Fonts popularity rank, trending rank, or dateAdded. Fonts not on Google Fonts sort last."),
      limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
      offset: z.number().int().min(0).optional(),
    } },
  async (a) => text(await searchFonts(a)));

server.registerTool("get_font",
  { description: "Metadata for one font: subsets, weights, styles, variable axes, unicode ranges, license, npm package names, CSS font-family names, fontsource.org page, zip URL, and CDN URL templates for every file. Call it before get_font_css or download_font to learn which subsets and weights exist.",
    annotations: { title: "Get font metadata", ...RO },
    inputSchema: { id } },
  async ({ id }) => text(await getFont(id)));

server.registerTool("get_font_css",
  { description: "Font embedding snippets: CDN stylesheet urls (use each in <link rel=\"stylesheet\"> or @import), a preload <link> for the first latin woff2 (null if none), npm install and import lines, the font-family rule, and the @font-face CSS text with absolute URLs, safe to inline. Defaults to weight 400 normal. Each extra weight and style combination adds about 1.5KB of CSS. Set variable:true for the variable package; the font-family then becomes \"<Family> Variable\".",
    annotations: { title: "Get font CSS and links", ...RO },
    inputSchema: {
      id,
      weights: z.array(z.number()).optional().describe("Static only. Default [400]."),
      styles: z.array(z.enum(["normal", "italic"])).optional().describe('Default ["normal"].'),
      subsets: z.array(z.string()).optional().describe('Static only. Omit for the all-subsets file per weight, or set it for the smaller per-subset files such as ["latin"].'),
      variable: z.boolean().optional().describe("Use @fontsource-variable/<id>. The font must be variable."),
      variableFile: z.string().optional().describe('Variable only. CSS file stem: "wght" (default, always exists), or "standard", "full", "opsz", and so on where the package ships them.'),
    } },
  async (a) => text(await getFontCss(a)));

server.registerTool("download_font",
  { description: `Download font files to disk under <dest>/<id>/. Default dest is $FONTSOURCE_DOWNLOAD_DIR, else ./fonts (currently ${defaultDownloadDir()}). Static mode filters subsets, weights, styles, and format. variable:true fetches <subset>-<axis>-<style>.woff2 variable files and ignores weights and format; a CJK subset such as japanese fetches its numbered unicode-range slices (0, 1, ... 119), and check_text names the slices a text needs. zip:true saves the official all-files zip without extracting it. Returns saved names and bytes.`,
    annotations: { title: "Download font files", readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      id,
      dest: z.string().optional().describe("Directory to write into, absolute or relative to the server cwd. Files go in <dest>/<id>/."),
      format: z.enum(["woff2", "woff", "ttf"]).optional().describe("Static only. Default woff2."),
      subsets, weights, styles,
      variable: z.boolean().optional(),
      axis: z.string().optional().describe('Variable only. "wght" (default), "standard", "full", or a single axis tag. Letters, digits, and hyphens only.'),
      zip: z.boolean().optional().describe("Save the api.fontsource.org/v1/download/<id> zip instead of individual files."),
    } },
  async (a) => text(await downloadFont(a)));

server.registerTool("index_fonts",
  { description: "Catalog facets: counts per category, subset, license, type, and variable or static. With outFile it also writes the full 2000+ font catalog JSON (id, family, subsets, weights, styles, category, license, type, variable) to that path so you can grep or jq it locally instead of paginating search_fonts.",
    annotations: { title: "Index the catalog", readOnlyHint: false, destructiveHint: false },
    inputSchema: { outFile: z.string().optional().describe("Path to write the full catalog JSON. Omit for facets only.") } },
  async (a) => text(await indexFonts(a)));

server.registerTool("get_axis_registry",
  { description: "Variable-font axis registry: name, description, min, max, and default for every axis tag (wght, wdth, opsz, slnt, ital, GRAD, and the rest). Pass a tag for one entry.",
    annotations: { title: "Axis registry", ...RO },
    inputSchema: { tag: z.string().optional() } },
  async ({ tag }) => text(await getAxisRegistry(tag)));

server.registerTool("check_text",
  { description: "Which characters of a text a font covers, from its declared unicode-range subsets (the subset declaration, not the font's glyph table). Returns missing characters and the subset keys the text needs, ready for download_font subsets. Named keys such as \"latin-ext\" also work as get_font_css subsets; numbered CJK slices such as \"45\" do not, so pass get_font_css the named subset (\"japanese\") instead.",
    annotations: { title: "Check text coverage", ...RO },
    inputSchema: { id, text: z.string().describe("The text to render, such as a heading or a sample with accents.") } },
  async (a) => text(await checkText(a)));

server.registerTool("compare_fonts",
  { description: "Write one HTML specimen comparing fonts side by side: each font in its CDN stylesheet (variable package when the font is variable), each weight at 16, 24, and 48px. Weights a static font lacks are skipped rather than faux-bolded. Open or screenshot the file in a browser. Returns outFile and the CSS font-family name per id.",
    annotations: { title: "Compare fonts", readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      ids: z.array(z.string()).min(1).describe('Fontsource id slugs such as ["inter","abril-fatface"].'),
      text: z.string().optional().describe("Sample text. Default: the quick brown fox pangram plus digits."),
      weights: z.array(z.number()).optional().describe("Default [400,700]."),
      outFile: z.string().describe("HTML path to write, absolute or relative to the server cwd."),
    } },
  async (a) => text(await compareFonts(a)));

await server.connect(new StdioServerTransport());
