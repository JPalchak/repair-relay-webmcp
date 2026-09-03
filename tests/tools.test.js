import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";

const livePayload = {
  count: 2,
  products: [
    {
      code: "030000010402",
      product_name: "Quaker Old Fashioned Oats",
      brands: "Quaker",
      ingredients_text_en: "Whole Grain Rolled Oats",
      allergens_tags: ["en:gluten"],
      nutriscore_grade: "a",
      completeness: 0.92,
      last_modified_t: 1780104331,
      nutriments: { sugars_100g: 1.1 }
    },
    {
      code: "3560070614202",
      product_name: "Whole Oat Flakes",
      brands: "Example",
      ingredients_text: "Whole oats",
      nutriscore_grade: "a",
      completeness: 0.67,
      last_modified_t: 1779551890,
      nutriments: { sugars_100g: 0.7 }
    }
  ]
};

function setup() {
  const store = createStore();
  let reason = null;
  const tools = createToolDefinitions({ store, onDecisionRequested: (value) => { reason = value; } });
  return {
    store,
    tools,
    get: (name) => tools.find((tool) => tool.name === name),
    reason: () => reason
  };
}

async function withFetch(payload, run, { status = 200, raw } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw ?? JSON.stringify(payload)
  });
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function loadSearch(context) {
  await withFetch(livePayload, () => context.get("search_products").execute({ query: "Quaker oats" }));
  return context.store.getState().search.results.map((product) => product.id);
}

test("surface contains eight unique tools and no agent approval tool", () => {
  const { tools } = setup();
  const names = tools.map((tool) => tool.name);
  assert.equal(tools.length, 8);
  assert.equal(new Set(names).size, 8);
  assert.equal(names.some((name) => /^(?:luna|approve|checkout|purchase)(?:_|$)/i.test(name)), false);
});

test("challenge-required search contract remains exact", () => {
  const tool = setup().get("search_products");
  assert.equal(tool.description, "Search the product catalog");
  assert.equal(typeof tool.execute, "function");
});

test("all schemas are closed and external-data tools are marked untrusted", () => {
  const { tools, get } = setup();
  assert.ok(tools.every((tool) => tool.inputSchema.additionalProperties === false));
  assert.equal(get("search_products").annotations.untrustedContentHint, true);
  assert.equal(get("record_package_check").annotations.untrustedContentHint, true);
});

test("search_products uses live-shaped data, sorts by upstream completeness, and returns provenance", async () => {
  const context = setup();
  const result = await withFetch(livePayload, () => context.get("search_products").execute({ query: "Quaker oats" }));
  const parsed = JSON.parse(result);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.source, "Open Food Facts");
  assert.match(parsed.scope, /United States/);
  assert.equal(context.store.getState().search.results[0].completeness, 92);
  assert.equal(context.store.getState().search.results[1].completeness, 67);
  assert.ok(result.length <= 1500);
});

test("a 200 HTML response becomes a readable upstream error", async () => {
  const context = setup();
  await assert.rejects(
    withFetch({}, () => context.get("search_products").execute({ query: "oats" }), { raw: "<!doctype html><title>temporary</title>" }),
    /unreadable response instead of JSON/
  );
  assert.equal(context.store.getState().searchStatus, "error");
});

test("live API failure is honest and never replaced by fixtures", async () => {
  const context = setup();
  await assert.rejects(
    withFetch({}, () => context.get("search_products").execute({ query: "oats" }), { status: 503 }),
    /temporarily unavailable or rate-limited/
  );
  assert.equal(context.store.getState().search, null);
  assert.equal(context.store.getState().searchStatus, "error");
});

test("record_package_check creates a pending human confirmation instead of claiming verification", async () => {
  const context = setup();
  const ids = await loadSearch(context);
  await context.get("stage_verified_choice").execute({ productId: ids[0] });
  const result = JSON.parse(await context.get("record_package_check").execute({
    productId: ids[0],
    checkType: "barcode_match",
    outcome: "match",
    note: "The person said the printed barcode matches."
  }));
  assert.equal(result.pendingHumanConfirmation, true);
  assert.match(result.requiredAction, /confirm or reject/);
  assert.match(result.caution, /no required check was cleared/);
  assert.deepEqual(context.store.getState().stagedChoice.requiredChecks, ["barcode_match", "ingredients_match"]);
  assert.equal(context.store.getState().checks[0].confirmationStatus, "pending_human_confirmation");
});

test("trusted visible confirmation makes agent-relayed package checks consequential", async () => {
  const context = setup();
  const ids = await loadSearch(context);
  await context.get("stage_verified_choice").execute({ productId: ids[0] });
  for (const [checkType, note] of [
    ["barcode_match", "The person said the printed barcode matches."],
    ["ingredients_match", "The person said the package begins Whole Grain Rolled Oats."]
  ]) {
    await context.get("record_package_check").execute({ productId: ids[0], checkType, outcome: "match", note });
  }
  assert.equal(context.store.getState().stagedChoice.pendingAttestationIds.length, 2);
  for (const check of [...context.store.getState().checks]) {
    context.store.dispatch({
      type: "CONFIRM_CHECK",
      checkId: check.id,
      authorization: { actor: "human", confirmed: true }
    });
  }
  assert.deepEqual(context.store.getState().stagedChoice.requiredChecks, []);
  assert.equal(context.store.getState().stagedChoice.pendingAttestationIds.length, 0);
  context.store.dispatch({ type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } });
  const approved = JSON.parse(await context.get("get_approved_choice").execute({}));
  assert.equal(approved.approved, true);
  assert.equal(approved.verifiedLabelSummary.product.ingredients, "Whole Grain Rolled Oats");
  assert.match(approved.verifiedLabelSummary.usefulFor[0], /dietary-screening/);
});

test("a confirmed mismatch blocks approval and exposes a correction URL", async () => {
  const context = setup();
  const ids = await loadSearch(context);
  await context.get("stage_verified_choice").execute({ productId: ids[0] });
  await context.get("record_package_check").execute({
    productId: ids[0],
    checkType: "ingredients_match",
    outcome: "mismatch",
    note: "Package includes salt, but the community record says oats only."
  });
  const pending = context.store.getState().checks[0];
  context.store.dispatch({ type: "CONFIRM_CHECK", checkId: pending.id, authorization: { actor: "human", confirmed: true } });
  assert.equal(context.store.getState().stagedChoice.status, "record_mismatch");
  assert.match(context.store.getState().stagedChoice.correctionUrl, /cgi\/product\.pl\?type=edit/);
  assert.throws(
    () => context.store.dispatch({ type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } }),
    /conflicts/
  );
});

test("compare and stage accept only current live result IDs", async () => {
  const context = setup();
  const ids = await loadSearch(context);
  assert.equal(JSON.parse(await context.get("compare_products").execute({ productIds: ids })).compared.length, 2);
  await assert.rejects(context.get("stage_verified_choice").execute({ productId: "99999999" }), /current live result set/);
});

test("runtime rejects malformed types and undeclared fields", async () => {
  const { get } = setup();
  await assert.rejects(get("search_products").execute({ query: 42 }), /string/);
  await assert.rejects(get("lookup_barcode").execute({ barcode: 30000010402 }), /string/);
  await assert.rejects(get("search_products").execute({ query: "oats", hidden: true }), /Unsupported input field/);
});

test("human decision tool opens a checkpoint without confirming or approving", async () => {
  const context = setup();
  const ids = await loadSearch(context);
  await context.get("stage_verified_choice").execute({ productId: ids[0] });
  const result = JSON.parse(await context.get("request_human_decision").execute({ reason: "Confirm the relayed package statements." }));
  assert.equal(result.checkpoint, "opened");
  assert.match(context.reason(), /Confirm the relayed/);
  assert.equal(context.store.getState().approvedChoice, null);
});

test("all oversized outputs remain valid JSON within budget", async () => {
  const context = setup();
  const hugePayload = {
    count: 10,
    products: Array.from({ length: 10 }, (_, index) => ({
      code: `0300000104${String(index).padStart(2, "0")}`,
      product_name: `Extremely descriptive oat product ${index}`,
      brands: "A brand with a very long but still plausible name",
      ingredients_text_en: "Whole grain rolled oats, " + "descriptive ingredient text ".repeat(40),
      allergens_tags: ["en:gluten", "en:milk", "en:soy"],
      completeness: 0.9 - index / 100,
      last_modified_t: 1780104331,
      nutriments: { sugars_100g: 1.1 }
    }))
  };
  const result = await withFetch(hugePayload, () => context.get("search_products").execute({ query: "very broad oats" }));
  assert.doesNotThrow(() => JSON.parse(result));
  assert.ok(result.length <= 1500);
});

test("snapshot and approved readers are read-only", () => {
  const { get } = setup();
  assert.equal(get("get_workspace_snapshot").annotations.readOnlyHint, true);
  assert.equal(get("get_approved_choice").annotations.readOnlyHint, true);
});
