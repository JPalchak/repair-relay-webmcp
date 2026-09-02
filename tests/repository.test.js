import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(new URL(path, new URL("../", import.meta.url)), "utf8");

test("imperative WebMCP registration is present", async () => {
  const source = await read("src/webmcp.js");
  assert.match(source, /document\.modelContext\.registerTool\(\{/);
  assert.match(source, /name:\s*["']search_products["']/);
  assert.match(source, /description:\s*["']Search the product catalog["']/);
  assert.match(source, /\{ signal: controller\.signal \}/);
});

test("required catalog tool literals are present in source", async () => {
  const source = await read("src/tool-definitions.js");
  assert.match(source, /name:\s*["']search_products["']/);
  assert.match(source, /description:\s*["']Search the product catalog["']/);
});

test("repository includes an identifiable MIT license", async () => {
  const license = await read("LICENSE");
  assert.ok(license.startsWith("MIT License"));
  assert.match(license, /Jason Frankiewicz-Palchak/);
});

test("debug surface deliberately omits approval", async () => {
  const source = await read("src/app.js");
  const exposedBlock = source.slice(source.indexOf("window.__repairRelay"));
  assert.match(exposedBlock, /invokeTool/);
  assert.doesNotMatch(exposedBlock, /approvePlan|APPROVE_PLAN/);
});

test("documentation contains judge instructions and authority rationale", async () => {
  const readme = await read("README.md");
  assert.match(readme, /chrome:\/\/flags\/#enable-webmcp-testing/);
  assert.match(readme, /Human-only approval/);
  assert.match(readme, /Luna recurring reviewer/);
  assert.match(readme, /search_products/);
});

test("HTML uses an accessible named main workspace", async () => {
  const html = await read("index.html");
  assert.match(html, /<main id="workspace">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Skip to workbench/);
});
