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

test("live catalog uses US search, worldwide barcode data, English ingredients, and upstream completeness", async () => {
  const source = await read("src/live-catalog.js");
  assert.match(source, /us\.openfoodfacts\.org\/cgi\/search\.pl/);
  assert.match(source, /world\.openfoodfacts\.org\/api\/v3\.6\/product/);
  assert.match(source, /ingredients_text_en/);
  assert.match(source, /product\?\.completeness/);
  assert.match(source, /unreadable response instead of JSON/);
  await assert.rejects(read("src/catalog.js"));
});

test("agent-relayed observations require trusted confirmation and mismatch has a correction path", async () => {
  const engine = await read("src/engine.js");
  const tools = await read("src/tool-definitions.js");
  assert.match(engine, /pending_human_confirmation/);
  assert.match(engine, /record_mismatch/);
  assert.match(engine, /cgi\/product\.pl\?type=edit&code=/);
  assert.match(tools, /pendingHumanConfirmation:\s*true/);
  assert.match(tools, /no required check was cleared/);
});

test("WebMCP output budgeting never slices serialized JSON", async () => {
  const source = await read("src/tool-definitions.js");
  assert.doesNotMatch(source, /JSON\.stringify\([^\n]+\)\.slice\(/);
  assert.match(source, /OUTPUT_BUDGET_EXCEEDED/);
});

test("Luna is absent from the product and submission surface", async () => {
  for (const path of ["index.html", "src/app.js", "src/render.js", "src/tool-definitions.js", "README.md", "DEVPOST.md"]) {
    assert.doesNotMatch(await read(path), /recurring Luna|Luna subagent|Luna is/i);
  }
});

test("repository has an identifiable MIT license", async () => {
  assert.match(await read("LICENSE"), /^MIT License/);
});

test("debug surface omits approval and attestation-confirmation authority", async () => {
  const source = await read("src/app.js");
  const block = source.slice(source.indexOf("window.__labelRelay"));
  assert.match(block, /invokeTool/);
  assert.doesNotMatch(block, /APPROVE_CHOICE|CONFIRM_CHECK|approveChoice|confirmRelayedPackageCheck/);
});

test("documentation names the audience, the attestation limitation, and the unresolved public video", async () => {
  const readme = await read("README.md");
  assert.match(readme, /allergy-aware households/i);
  assert.match(readme, /attestation, not proof/i);
  assert.match(readme, /Demo video:\*\* not yet published|Demo video:\s+not yet published/i);
  assert.match(readme, /chrome:\/\/flags\/#enable-webmcp-testing/);
});

test("HTML has accessible live regions, retry, pending confirmation, and a downstream summary", async () => {
  const html = await read("index.html");
  assert.match(html, /<main id="workspace">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Skip to workspace/);
  assert.match(html, /id="retry-search-button"/);
  assert.match(html, /Confirm I said this|pending human confirmation/i);
  assert.match(html, /id="verified-outcome"/);
  assert.match(html, /id="correction-link"/);
});
