import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("imperative WebMCP registration contains the exact required literal", async () => {
  const source = await read("src/webmcp.js"); assert.match(source, /document\.modelContext\.registerTool\(\{/); assert.match(source, /name:\s*["']search_products["']/); assert.match(source, /description:\s*["']Search the product catalog["']/);
});
test("live catalog calls Open Food Facts and has no fixture catalog", async () => {
  const source = await read("src/live-catalog.js"); assert.match(source, /world\.openfoodfacts\.org/); assert.match(source, /fetchedAt/); await assert.rejects(read("src/catalog.js"));
});
test("Luna is absent from the product surface", async () => {
  for (const path of ["index.html", "src/app.js", "src/render.js", "src/tool-definitions.js"]) assert.doesNotMatch(await read(path), /luna/i);
});
test("repository has an identifiable MIT license", async () => assert.match(await read("LICENSE"), /^MIT License/));
test("debug surface omits approval authority", async () => {
  const source = await read("src/app.js"); const block = source.slice(source.indexOf("window.__labelRelay")); assert.match(block, /invokeTool/); assert.doesNotMatch(block, /APPROVE_CHOICE|approveChoice/);
});
test("documentation includes judge flag, live source, and human-only approval", async () => {
  const readme = await read("README.md"); assert.match(readme, /chrome:\/\/flags\/#enable-webmcp-testing/); assert.match(readme, /Open Food Facts/); assert.match(readme, /human-only/i);
});
test("HTML has an accessible named main workspace and live regions", async () => {
  const html = await read("index.html"); assert.match(html, /<main id="workspace">/); assert.match(html, /aria-live="polite"/); assert.match(html, /Skip to workspace/);
});
