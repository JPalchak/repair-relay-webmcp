import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = [
  "index.html", "styles.css", "manifest.webmanifest", "LICENSE", "README.md", "SECURITY.md", "DEVPOST.md",
  "src/app.js", "src/live-catalog.js", "src/live-recalls.js", "src/engine.js", "src/render.js", "src/store.js", "src/tool-definitions.js", "src/webmcp.js",
  "tests/engine.test.js", "tests/tools.test.js", "tests/recalls.test.js", "tests/repository.test.js",
  "scripts/evals.mjs", "scripts/live-data-smoke.mjs", "scripts/browser-smoke.mjs", "docs/browser-test.md", "docs/demo-script.md"
];
const failures = [];
for (const path of required) { try { await access(resolve(root, path)); } catch { failures.push(`Missing ${path}`); } }

const read = (path) => readFile(resolve(root, path), "utf8");
const registration = await read("src/webmcp.js");
const tools = await read("src/tool-definitions.js");
const appSurface = [await read("index.html"), await read("src/app.js"), await read("src/render.js"), tools].join("\n");
const readme = await read("README.md");
const recalls = await read("src/live-recalls.js");

const assertions = [
  [registration.includes("document.modelContext.registerTool({"), "registerTool literal missing"],
  [registration.includes('name: "search_products"'), "required tool is not explicitly registered"],
  [registration.includes('description: "Search the product catalog"'), "required description changed"],
  [/world\.openfoodfacts\.org/.test(await read("src/live-catalog.js")), "live catalog host missing"],
  [/api\.fda\.gov/.test(recalls) && /saferproducts\.gov/.test(recalls), "live recall hosts missing"],
  [!/luna/i.test(appSurface), "development reviewer leaked into product UI or WebMCP surface"],
  [!/name:\s*["'](?:resolve|approve|discard|purchase|checkout)/i.test(tools), "agent authority tool present"],
  [(tools.match(/additionalProperties:\s*false/g) || []).length >= 10, "not every schema is closed"],
  [/openFDA/.test(readme) && /CPSC/.test(readme), "live sources not documented"],
  [/chrome:\/\/flags\/#enable-webmcp-testing/.test(readme), "Chrome flag instructions missing"]
];
for (const [ok, message] of assertions) if (!ok) failures.push(message);
if (failures.length) { console.error(JSON.stringify({ passed: false, failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ passed: true, checkedFiles: required.length, data: "live Open Food Facts + openFDA + CPSC", tools: 10, resolution: "human-only" }, null, 2));
