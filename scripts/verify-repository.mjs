import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredFiles = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "DEVPOST.md",
  "src/app.js",
  "src/catalog.js",
  "src/engine.js",
  "src/luna.js",
  "src/render.js",
  "src/store.js",
  "src/tool-definitions.js",
  "src/webmcp.js",
  "tests/engine.test.js",
  "tests/tools.test.js",
  "tests/repository.test.js",
  "scripts/evals.mjs",
  "scripts/luna-review.mjs",
  "scripts/browser-smoke.mjs",
  "docs/browser-test.md",
  "docs/demo-script.md"
];

const failures = [];
for (const relativePath of requiredFiles) {
  try {
    await access(resolve(root, relativePath));
  } catch {
    failures.push(`Missing ${relativePath}`);
  }
}

const source = await readFile(resolve(root, "src/tool-definitions.js"), "utf8");
const registration = await readFile(resolve(root, "src/webmcp.js"), "utf8");
const license = await readFile(resolve(root, "LICENSE"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");

const assertions = [
  [source.includes('name: "search_products"'), "search_products tool name is absent"],
  [source.includes('description: "Search the product catalog"'), "required catalog description is absent"],
  [registration.includes("document.modelContext.registerTool({"), "registerTool call is absent"],
  [registration.includes('name: "search_products"'), "search_products is not registered explicitly"],
  [registration.includes('{ signal: controller.signal }'), "tool registration lacks lifecycle cancellation"],
  [!source.match(/name:\s*["']approve(?:_|-)/i), "an agent approval tool is present"],
  [source.match(/additionalProperties:\s*false/g)?.length >= 8, "not every input schema is closed"],
  [license.startsWith("MIT License"), "MIT license is malformed or missing"],
  [readme.includes("Human-only approval"), "README omits the authority-boundary explanation"],
  [readme.includes("Luna recurring reviewer"), "README omits the recurring evaluator"],
  [readme.includes("chrome://flags/#enable-webmcp-testing"), "README omits Chrome WebMCP setup"]
];

for (const [passed, message] of assertions) {
  if (!passed) failures.push(message);
}

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  checkedFiles: requiredFiles.length,
  requiredTool: "search_products",
  approvalBoundary: "human-only",
  license: "MIT"
}, null, 2));
