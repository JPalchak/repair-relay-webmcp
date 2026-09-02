import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("imperative WebMCP registration contains the exact required literal", async () => {
  const source = await read("src/webmcp.js");
  assert.match(source, /document\.modelContext\.registerTool\(\{/);
  assert.match(source, /name:\s*["']search_products["']/);
  assert.match(source, /description:\s*["']Search the product catalog["']/);
});

test("live clients call production hosts and no fixture catalog ships in src", async () => {
  assert.match(await read("src/live-catalog.js"), /world\.openfoodfacts\.org/);
  const recalls = await read("src/live-recalls.js");
  assert.match(recalls, /api\.fda\.gov/);
  assert.match(recalls, /saferproducts\.gov/);
  assert.match(recalls, /fetchedAt/);
  await assert.rejects(read("src/catalog.js"));
  await assert.rejects(read("src/fixtures.js"));
});

test("development reviewer names are absent from the product surface", async () => {
  for (const path of ["index.html", "src/app.js", "src/render.js", "src/tool-definitions.js"]) assert.doesNotMatch(await read(path), /luna/i);
});

test("repository has an identifiable MIT license", async () => assert.match(await read("LICENSE"), /^MIT License/));

test("debug surface omits resolution authority", async () => {
  const source = await read("src/app.js");
  const block = source.slice(source.indexOf("window.__recallRelay"));
  assert.match(block, /invokeTool/);
  assert.doesNotMatch(block, /RESOLVE_ITEM|createResolution|resolveItem/);
});

test("documentation includes judge flag, live sources, and human-only decisions", async () => {
  const readme = await read("README.md");
  assert.match(readme, /chrome:\/\/flags\/#enable-webmcp-testing/);
  assert.match(readme, /openFDA/);
  assert.match(readme, /CPSC/);
  assert.match(readme, /human-only/i);
});

test("HTML has an accessible named main workspace and live regions", async () => {
  const html = await read("index.html");
  assert.match(html, /<main id="workspace">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Skip to workspace/);
});
