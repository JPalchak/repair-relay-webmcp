import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";
import { fetchStub, withFetch } from "./fixtures.js";

function setup() {
  const store = createStore();
  const requests = [];
  const tools = createToolDefinitions({ store, onReadingRequested: (itemId, request) => requests.push({ itemId, request }), wait: async () => {} });
  const get = (name) => tools.find((tool) => tool.name === name);
  const call = (name, input = {}, options = {}) => withFetch(fetchStub(), () => get(name).execute(input, options));
  return { store, tools, get, call, requests };
}

async function shelfWithItem(ctx) {
  await ctx.call("search_products", { query: "peanut butter" });
  const productId = ctx.store.getState().catalog.search.results[0].id;
  const added = JSON.parse(await ctx.call("add_shelf_item", { productId }));
  return added.item.id;
}

test("surface contains ten unique tools and no resolve, approve, purchase, or development tool", () => {
  const { tools } = setup();
  const names = tools.map((tool) => tool.name);
  assert.equal(tools.length, 10);
  assert.equal(new Set(names).size, 10);
  assert.equal(names.some((name) => /^(?:luna|approve|resolve|discard|checkout|purchase)(?:_|$)/i.test(name)), false);
});

test("challenge-required search contract is exact and budgets are respected", () => {
  const { tools, get } = setup();
  assert.equal(get("search_products").description, "Search the product catalog");
  for (const tool of tools) {
    assert.ok(tool.name.length <= 30, tool.name);
    assert.ok(tool.description.length <= 500, tool.name);
    for (const [key, prop] of Object.entries(tool.inputSchema.properties)) assert.ok((prop.description ?? "").length <= 150, `${tool.name}.${key}`);
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
  }
});

test("annotations mark external and relayed content untrusted and readers read-only", () => {
  const { get } = setup();
  for (const name of ["search_products", "lookup_barcode", "search_recalls", "sweep_shelf", "get_recall_details", "record_package_reading", "get_shelf"]) assert.equal(get(name).annotations.untrustedContentHint, true, name);
  assert.equal(get("get_recall_details").annotations.readOnlyHint, true);
  assert.equal(get("get_shelf").annotations.readOnlyHint, true);
  assert.equal(get("sweep_shelf").annotations.readOnlyHint, false);
});

test("search_products fetches live-shaped data, updates the page state, and stays within budget", async () => {
  const ctx = setup();
  const result = JSON.parse(await ctx.call("search_products", { query: "peanut butter" }));
  assert.equal(result.live, true);
  assert.equal(result.source, "Open Food Facts");
  assert.equal(ctx.store.getState().catalog.search.results.length, 2);
  assert.ok(JSON.stringify(result).length <= 1500);
});

test("catalog failure is visible and never replaced by fixtures", async () => {
  const ctx = setup();
  await assert.rejects(withFetch(fetchStub({ catalogStatus: 503 }), () => ctx.get("search_products").execute({ query: "oats" })), /rate-limited/);
  assert.equal(ctx.store.getState().catalog.status, "error");
  assert.equal(ctx.store.getState().catalog.search, null);
});

test("add_shelf_item accepts catalog ids or descriptions and rejects stale ids", async () => {
  const ctx = setup();
  await assert.rejects(ctx.call("add_shelf_item", { productId: "0051500241219" }), /current catalog results/);
  const itemId = await shelfWithItem(ctx);
  assert.match(itemId, /^item-/);
  const described = JSON.parse(await ctx.call("add_shelf_item", { description: "Play yard mattress", brand: "Voomf", kind: "consumer" }));
  assert.equal(described.item.kind, "consumer");
  assert.equal(ctx.store.getState().shelf.length, 2);
});

test("search_recalls attaches live candidates to an item and flags barcode matches", async () => {
  const ctx = setup();
  const itemId = await shelfWithItem(ctx);
  const result = JSON.parse(await ctx.call("search_recalls", { query: "peanut butter", scope: "food", itemId }));
  assert.equal(result.live, true);
  assert.equal(result.attachedTo, itemId);
  assert.equal(result.results[0].upcMatch, true);
  assert.deepEqual(result.sources, [{ source: "fda_food", status: "ok", total: 1 }]);
  assert.equal(ctx.store.getState().shelf[0].candidates.length, 1);
  const loose = JSON.parse(await ctx.call("search_recalls", { query: "mattress", scope: "consumer" }));
  assert.equal(loose.attachedTo, null);
  assert.equal(loose.results[0].src, "CPSC");
});

test("sweep_shelf checks every unresolved item with a source-appropriate scope", async () => {
  const ctx = setup();
  await shelfWithItem(ctx);
  await ctx.call("add_shelf_item", { description: "Play yard mattress", brand: "Voomf", kind: "consumer" });
  const result = JSON.parse(await ctx.call("sweep_shelf"));
  assert.equal(result.swept.length, 2);
  assert.deepEqual(result.swept.map((entry) => [entry.query, entry.found, entry.upcMatch]), [["Jif", 1, true], ["Voomf", 1, false]]);
  assert.equal(ctx.store.getState().sweep.status, "done");
  assert.ok(JSON.stringify(result).length <= 1500);
});

test("get_recall_details returns the full code text for a known candidate only", async () => {
  const ctx = setup();
  const itemId = await shelfWithItem(ctx);
  const search = JSON.parse(await ctx.call("search_recalls", { query: "jif", scope: "food", itemId }));
  const details = JSON.parse(await ctx.call("get_recall_details", { recallId: search.results[0].id }));
  assert.match(details.code, /1274425 through 2140425/);
  assert.match(details.url, /api\.fda\.gov/);
  await assert.rejects(ctx.call("get_recall_details", { recallId: "fda-unknown" }), /Unknown recallId/);
});

test("the reading loop: request, relayed and human readings, gated assessment, human-only resolution", async () => {
  const ctx = setup();
  const itemId = await shelfWithItem(ctx);
  const search = JSON.parse(await ctx.call("search_recalls", { query: "jif", scope: "food", itemId }));
  const recallId = search.results[0].id;
  await assert.rejects(ctx.call("assess_item", { itemId, verdict: "likely_affected", reasoning: "Looks like the recalled lot range.", recallId }), /package reading/);
  const asked = JSON.parse(await ctx.call("request_package_reading", { itemId, fields: ["lot_code"], whereToLook: "Lot code printed beneath the best-by date on the lid; recall covers 1274425–2140425.", recallId }));
  assert.equal(asked.waitingOn, "person");
  assert.equal(ctx.requests[0].itemId, itemId);
  assert.deepEqual(JSON.parse(await ctx.call("get_shelf")).awaitingPerson, [itemId]);
  const relayed = JSON.parse(await ctx.call("record_package_reading", { itemId, field: "lot_code", value: "1301425" }));
  assert.equal(relayed.recorded.source, "agent_relayed");
  const assessed = JSON.parse(await ctx.call("assess_item", { itemId, verdict: "likely_affected", reasoning: "1301425 is inside 1274425–2140425 on the same product.", recallId }));
  assert.equal(assessed.assessment.verdict, "likely_affected");
  assert.match(assessed.authority, /No tool can resolve/);
  assert.equal(ctx.store.getState().shelf[0].resolution, null);
  ctx.store.dispatch({ type: "RESOLVE_ITEM", itemId, action: "discard", authorization: { actor: "human", confirmed: true } });
  const shelf = JSON.parse(await ctx.call("get_shelf"));
  assert.equal(shelf.items[0].resolution, "discard");
  assert.equal(shelf.unresolved, 0);
  await assert.rejects(ctx.call("sweep_shelf"), /no unresolved items/);
});

test("runtime rejects malformed types and undeclared fields", async () => {
  const ctx = setup();
  await assert.rejects(ctx.call("search_products", { query: 42 }), /string/);
  await assert.rejects(ctx.call("lookup_barcode", { barcode: 3168930003632 }), /string/);
  await assert.rejects(ctx.call("search_recalls", { query: "jif", hidden: true }), /Unsupported input field/);
  await assert.rejects(ctx.call("search_recalls", { query: "jif", scope: "toys" }), /scope must be/);
  await assert.rejects(ctx.call("request_package_reading", { itemId: "item-missing", fields: ["lot_code"], whereToLook: "On the lid, under the date." }), /not on the shelf/);
});

test("cancellation is honoured before network work", async () => {
  const ctx = setup();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(ctx.get("search_products").execute({ query: "oats" }, { signal: controller.signal }), { name: "AbortError" });
});
