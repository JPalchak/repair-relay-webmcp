import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";

function setup() {
  const store = createStore();
  let requestedReason = null;
  const tools = createToolDefinitions({
    store,
    onDecisionRequested: (reason) => {
      requestedReason = reason;
    }
  });
  return {
    store,
    tools,
    getRequestedReason: () => requestedReason,
    getTool: (name) => tools.find((tool) => tool.name === name)
  };
}

test("tool surface contains eight unique focused tools", () => {
  const { tools } = setup();
  assert.equal(tools.length, 8);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 8);
});

test("challenge-required search_products contract is exact", () => {
  const { getTool } = setup();
  const tool = getTool("search_products");
  assert.ok(tool);
  assert.equal(tool.description, "Search the product catalog");
  assert.equal(typeof tool.execute, "function");
});

test("all schemas reject undeclared properties", () => {
  const { tools } = setup();
  assert.ok(tools.every((tool) => tool.inputSchema.type === "object"));
  assert.ok(tools.every((tool) => tool.inputSchema.additionalProperties === false));
});

test("no WebMCP tool can approve or authorize a plan", () => {
  const { tools } = setup();
  const prohibited = tools.filter((tool) => /^(approve|authorize|purchase|checkout)(_|$)/i.test(tool.name));
  assert.deepEqual(prohibited, []);
});

test("case and approved-plan readers are marked read-only", () => {
  const { getTool } = setup();
  assert.equal(getTool("get_case_snapshot").annotations.readOnlyHint, true);
  assert.equal(getTool("get_approved_plan").annotations.readOnlyHint, true);
});

test("search_products returns a bounded response and updates visible state", async () => {
  const { store, getTool } = setup();
  const result = JSON.parse(await getTool("search_products").execute({
    query: "direct-fit filter for weak airflow",
    model: "AP-200",
    budget: 65
  }));
  assert.ok(result.results.length > 0 && result.results.length <= 5);
  assert.equal(store.getState().search.results.length, result.results.length);
  assert.match(result.uiEffect, /reranked/i);
});

test("record_observation stores evidence as data, not instructions", async () => {
  const { store, getTool } = setup();
  const result = JSON.parse(await getTool("record_observation").execute({
    text: "<img src=x onerror=alert(1)> The filter blocks light.",
    tag: "blocked_filter",
    confidence: 0.9
  }));
  assert.equal(result.caution.includes("not as executable instructions"), true);
  const recorded = store.getState().evidence.at(-1);
  assert.equal(recorded.source, "agent");
  assert.match(recorded.text, /filter blocks light/i);
});

test("compare_products compares only candidates in current results", async () => {
  const { store, getTool } = setup();
  await getTool("search_products").execute({ model: "AP-200", budget: 65 });
  const ids = store.getState().search.results.slice(0, 2).map((item) => item.id);
  const result = JSON.parse(await getTool("compare_products").execute({ productIds: ids }));
  assert.equal(result.compared.length, 2);
  assert.equal(store.getState().comparison.length, 2);
});

test("stage_repair_plan cannot imply approval", async () => {
  const { store, getTool } = setup();
  await getTool("search_products").execute({ model: "AP-200", budget: 65 });
  const candidateId = store.getState().search.results[0].id;
  const result = JSON.parse(await getTool("stage_repair_plan").execute({ candidateId }));
  assert.equal(result.plan.status, "staged");
  assert.match(result.approval, /not granted/i);
  assert.equal(store.getState().approvedPlan, null);
});

test("request_human_decision opens a checkpoint without deciding", async () => {
  const { store, getTool, getRequestedReason } = setup();
  await getTool("search_products").execute({ model: "AP-200" });
  const candidateId = store.getState().search.results[0].id;
  await getTool("stage_repair_plan").execute({ candidateId });
  const result = JSON.parse(await getTool("request_human_decision").execute({
    reason: "The person must verify the stop conditions."
  }));
  assert.equal(result.checkpoint, "opened");
  assert.equal(store.getState().stagedPlan.status, "staged");
  assert.match(getRequestedReason(), /verify the stop conditions/i);
});

test("get_approved_plan distinguishes a staged draft from approval", async () => {
  const { store, getTool } = setup();
  await getTool("search_products").execute({ model: "AP-200" });
  const candidateId = store.getState().search.results[0].id;
  await getTool("stage_repair_plan").execute({ candidateId });
  const before = JSON.parse(await getTool("get_approved_plan").execute({}));
  assert.equal(before.approved, false);

  store.dispatch({
    type: "APPROVE_PLAN",
    authorization: { actor: "human", confirmed: true }
  });
  const after = JSON.parse(await getTool("get_approved_plan").execute({}));
  assert.equal(after.approved, true);
  assert.equal(after.plan.approvedBy, "human");
});

test("run_luna_review scores the complete authority-bounded surface", async () => {
  const { getTool } = setup();
  const result = JSON.parse(await getTool("run_luna_review").execute({}));
  assert.equal(result.score, 30);
  assert.equal(result.maxScore, 30);
});

test("tool executions honor cancellation", async () => {
  const { getTool } = setup();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    getTool("search_products").execute({ model: "AP-200" }, { signal: controller.signal }),
    { name: "AbortError" }
  );
});
