import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = ["index.html","styles.css","manifest.webmanifest","LICENSE","README.md","SECURITY.md","DEVPOST.md","src/app.js","src/live-catalog.js","src/engine.js","src/render.js","src/store.js","src/tool-definitions.js","src/webmcp.js","tests/engine.test.js","tests/tools.test.js","tests/repository.test.js","scripts/evals.mjs","scripts/live-data-smoke.mjs","scripts/browser-smoke.mjs","docs/browser-test.md","docs/demo-script.md"];
const failures = [];
for (const path of required) { try { await access(resolve(root, path)); } catch { failures.push(`Missing ${path}`); } }
const registration = await readFile(resolve(root, "src/webmcp.js"), "utf8");
const tools = await readFile(resolve(root, "src/tool-definitions.js"), "utf8");
const appSurface = [await readFile(resolve(root,"index.html"),"utf8"),await readFile(resolve(root,"src/app.js"),"utf8"),await readFile(resolve(root,"src/render.js"),"utf8"),tools].join("\n");
const readme = await readFile(resolve(root,"README.md"),"utf8");
const assertions = [
  [registration.includes("document.modelContext.registerTool({"),"registerTool literal missing"],
  [registration.includes('name: "search_products"'),"required tool is not explicitly registered"],
  [registration.includes('description: "Search the product catalog"'),"required description changed"],
  [/world\.openfoodfacts\.org/.test(await readFile(resolve(root,"src/live-catalog.js"),"utf8")),"live API host missing"],
  [!/luna/i.test(appSurface),"Luna leaked into product UI or WebMCP surface"],
  [!/name:\s*["'](?:approve|purchase|checkout)/i.test(tools),"agent authority tool present"],
  [(tools.match(/additionalProperties:\s*false/g)||[]).length>=8,"not every schema is closed"],
  [/Open Food Facts/.test(readme),"live source not documented"],
  [/chrome:\/\/flags\/#enable-webmcp-testing/.test(readme),"Chrome flag instructions missing"]
];
for (const [ok,message] of assertions) if (!ok) failures.push(message);
if (failures.length) { console.error(JSON.stringify({ passed:false, failures },null,2)); process.exit(1); }
console.log(JSON.stringify({ passed:true, checkedFiles:required.length, data:"live Open Food Facts", tools:8, approval:"human-only", luna:"development subagent only" },null,2));
