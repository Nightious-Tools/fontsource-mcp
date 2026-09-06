import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { searchFonts, getFont, getFontCss, downloadFont, indexFonts, getAxisRegistry, defaultDownloadDir } from "./fontsource.js";

const server = new McpServer({ name: "fontsource", version: pkg.version });
const text = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
const RO = { readOnlyHint: true };

const id = z.string().describe('Fontsource id slug, e.g. "inter", "open-sans", "noto-sans-jp". Get it from search_fonts; it is NOT the display name.');
const subsets = z.array(z.string()).optional().describe('Subsets like ["latin","latin-ext","cyrillic"]. Omit for all.');
const weights = z.array(z.number()).optional().describe("Weights like [400,700]. Omit for all.");
const styles = z.array(z.enum(["normal", "italic"])).optional().describe('["normal"], ["italic"], or both. Omit for all.');

server.registerTool("search_fonts",
  { description: "Search the Fontsource catalog (2000+ open-source fonts). Fuzzy `query` matches id/family (exact > prefix > substring > all words); filters are AND. Returns compact rows with the `id` every other tool needs. No query + filters = browse a category.",
    annotations: { title: "Search fonts", ...RO },
    inputSchema: {
      query: z.string().optional().describe('Name fragment, e.g. "inter", "open sans", "mono".'),
      category: z.enum(["sans-serif", "serif", "display", "monospace", "handwriting", "other", "icons"]).optional(),
      subsets, weights, styles,
      variable: z.boolean().optional().describe("true = only variable fonts."),
      license: z.string().optional().describe("OFL-1.1 | Apache-2.0 | CC0-1.0 | mit | Unlicense | UFL-1.0"),
      type: z.enum(["google", "other"]).optional().describe("google = mirrored from Google Fonts."),
      limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
      offset: z.number().int().min(0).optional(),
    } },
  async (a) => text(await searchFonts(a)));

server.registerTool("get_font",
  { description: "Full metadata for one font: subsets, weights, styles, variable axes, unicode ranges, license, npm package names, CSS font-family names, fontsource.org page, zip URL, and CDN URL templates for every file. Call before get_font_css/download_font to learn what subsets/weights exist.",
    annotations: { title: "Get font metadata", ...RO },
    inputSchema: { id } },
  async ({ id }) => text(await getFont(id)));

server.registerTool("get_font_css",
  { description: "Ready-to-paste font embedding: CDN <link> tags, @import lines, npm install + import lines, the font-family rule, and the actual @font-face CSS text (absolute URLs, safe to inline). Defaults to weight 400 normal; each extra weight×style adds ~1.5KB of CSS. Set variable:true for the variable package (font-family becomes \"<Family> Variable\").",
    annotations: { title: "Get font CSS / links", ...RO },
    inputSchema: {
      id,
      weights: z.array(z.number()).optional().describe("Static only. Default [400]."),
      styles: z.array(z.enum(["normal", "italic"])).optional().describe('Default ["normal"].'),
      subsets: z.array(z.string()).optional().describe("Static only. Omit for the all-subsets file per weight; set to get per-subset files (smaller)."),
      variable: z.boolean().optional().describe("Use @fontsource-variable/<id> (font must be variable)."),
      variableFile: z.string().optional().describe('Variable only. CSS file stem: "wght" (default, always exists), or "standard"/"full"/"opsz"/… where the package ships them.'),
    } },
  async (a) => text(await getFontCss(a)));

server.registerTool("download_font",
  { description: `Download font files to disk under <dest>/<id>/. Default dest = $FONTSOURCE_DOWNLOAD_DIR or ./fonts (currently ${defaultDownloadDir()}). Static mode filters subsets/weights/styles/format; variable:true fetches <subset>-<axis>-<style>.woff2 variable files (weights/format ignored); zip:true saves the official all-files zip as-is (not extracted). Returns saved names + bytes.`,
    annotations: { title: "Download font files", readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      id,
      dest: z.string().optional().describe("Directory to write into (absolute or relative to the server cwd). Files go in <dest>/<id>/."),
      format: z.enum(["woff2", "woff", "ttf"]).optional().describe("Static only. Default woff2."),
      subsets, weights, styles,
      variable: z.boolean().optional(),
      axis: z.string().optional().describe('Variable only. "wght" (default), "standard", "full", or a single axis tag.'),
      zip: z.boolean().optional().describe("Save api.fontsource.org/v1/download/<id> zip instead of individual files."),
    } },
  async (a) => text(await downloadFont(a)));

server.registerTool("index_fonts",
  { description: "Catalog facets: counts per category, subset, license, type, and variable/static. With outFile, also writes the full 2000+ font catalog JSON (id, family, subsets, weights, styles, category, license, type, variable) to that path so you can grep/jq it locally instead of paginating search_fonts.",
    annotations: { title: "Index the catalog", readOnlyHint: false, destructiveHint: false },
    inputSchema: { outFile: z.string().optional().describe("Path to write the full catalog JSON. Omit for facets only.") } },
  async (a) => text(await indexFonts(a)));

server.registerTool("get_axis_registry",
  { description: "Variable-font axis registry: name, description, min/max/default for every axis tag (wght, wdth, opsz, slnt, ital, GRAD, …). Pass a tag for one entry.",
    annotations: { title: "Axis registry", ...RO },
    inputSchema: { tag: z.string().optional() } },
  async ({ tag }) => text(await getAxisRegistry(tag)));

await server.connect(new StdioServerTransport());
