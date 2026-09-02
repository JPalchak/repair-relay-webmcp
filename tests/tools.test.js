import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";

const livePayload = { count: 2, products: [
  { code: "3168930003632", product_name: "Quaker Oats", brands: "Quaker", ingredients_text: "100% oats", allergens_tags: ["en:gluten"], nutriscore_grade: "a", last_modified_t: 1780104331, nutriments: { sugars_100g: 1.1 } },
  { code: "3560070614202", product_name: "Whole Oat Flakes", brands: "Example", ingredients_text: "Whole oats", nutriscore_grade: "a", last_modified_t: 1779551890, nutriments: { sugars_100g: 0.7 } }
] };

function setup() {
  const store = createStore(); let reason = null;
  const tools = createToolDefinitions({ store, onDecisionRequested: (value) => { reason = value; } });
  return { store, tools, get: (name) => tools.find((tool) => tool.name === name), reason: () => reason };
}

async function withFetch(payload, run, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(payload) });
  try { return await run(); } finally { globalThis.fetch = original; }
}

test("surface contains eight unique tools and no Luna or approval tool", () => {
  const { tools } = setup(); const names = tools.map((tool) => tool.name);
  assert.equal(tools.length, 8); assert.equal(new Set(names).size, 8); assert.equal(names.some((name) => /^(?:luna|approve|checkout|purchase)(?:_|$)/i.test(name)), false);
});
test("challenge-required search contract is exact", () => {
  const tool = setup().get("search_products"); assert.equal(tool.description, "Search the product catalog"); assert.equal(typeof tool.execute, "function");
});
test("all schemas are closed and external-data tools are untrusted", () => {
  const { tools, get } = setup(); assert.ok(tools.every((tool) => tool.inputSchema.additionalProperties === false)); assert.equal(get("search_products").annotations.untrustedContentHint, true);
});
test("search_products fetches live-shaped data, updates UI state, and returns provenance", async () => {
  const { store, get } = setup();
  const result = await withFetch(livePayload, () => get("search_products").execute({ query: "oat cereal" }));
  const parsed = JSON.parse(result); assert.equal(parsed.live, true); assert.equal(parsed.source, "Open Food Facts"); assert.equal(store.getState().search.results.length, 2); assert.ok(result.length <= 1500);
});
test("live API failure is honest and never replaced by fixtures", async () => {
  const { store, get } = setup();
  await assert.rejects(withFetch({}, () => get("search_products").execute({ query: "oats" }), 503), /rate-limited/);
  assert.equal(store.getState().search, null); assert.equal(store.getState().searchStatus, "error");
});
test("compare, check, and stage operate only on current live results", async () => {
  const { store, get } = setup();
  await withFetch(livePayload, () => get("search_products").execute({ query: "oats" }));
  const ids = store.getState().search.results.map((p) => p.id);
  assert.equal(JSON.parse(await get("compare_products").execute({ productIds: ids })).compared.length, 2);
  await get("record_package_check").execute({ productId: ids[0], checkType: "barcode_match", outcome: "match", note: "Printed code matches." });
  const staged = JSON.parse(await get("stage_verified_choice").execute({ productId: ids[0], rationale: "Best completeness." }));
  assert.equal(staged.choice.status, "awaiting_human_approval"); assert.match(staged.approval, /Not granted/);
  assert.deepEqual(staged.choice.requiredChecks, ["barcode_match", "ingredients_match"]);
  await get("record_package_check").execute({ productId: ids[0], checkType: "ingredients_match", outcome: "match", note: "Agent-supplied claim." });
  assert.deepEqual(store.getState().stagedChoice.requiredChecks, ["barcode_match", "ingredients_match"]);
});
test("runtime rejects malformed types and undeclared fields", async () => {
  const { get } = setup();
  await assert.rejects(get("search_products").execute({ query: 42 }), /string/);
  await assert.rejects(get("lookup_barcode").execute({ barcode: 3168930003632 }), /string/);
  await assert.rejects(get("search_products").execute({ query: "oats", hidden: true }), /Unsupported input field/);
});
test("human decision tool opens a checkpoint without approval", async () => {
  const ctx = setup();
  await withFetch(livePayload, () => ctx.get("search_products").execute({ query: "oats" }));
  const id = ctx.store.getState().search.results[0].id;
  await ctx.get("stage_verified_choice").execute({ productId: id });
  const result = JSON.parse(await ctx.get("request_human_decision").execute({ reason: "Verify the physical ingredients." }));
  assert.equal(result.checkpoint, "opened"); assert.match(ctx.reason(), /physical ingredients/); assert.equal(ctx.store.getState().approvedChoice, null);
});
test("snapshot and approved readers are read-only", () => {
  const { get } = setup(); assert.equal(get("get_workspace_snapshot").annotations.readOnlyHint, true); assert.equal(get("get_approved_choice").annotations.readOnlyHint, true);
});
