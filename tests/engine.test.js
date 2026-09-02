import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CATALOG } from "../src/catalog.js";
import {
  approvePlan,
  buildRepairPlan,
  compactCaseSnapshot,
  compareCandidates,
  createObservation,
  normalizeText,
  parseSearchInput,
  rankProducts,
  throwIfAborted
} from "../src/engine.js";
import { createInitialState } from "../src/store.js";

test("normalizeText removes controls and collapses whitespace", () => {
  assert.equal(normalizeText("  weak\u0000   airflow \n now "), "weak airflow now");
});

test("observations are bounded and normalized", () => {
  const observation = createObservation({
    text: "  Filter blocks light.  ",
    tag: "blocked_filter",
    confidence: 0.934
  });
  assert.equal(observation.text, "Filter blocks light.");
  assert.equal(observation.confidence, 0.93);
  assert.equal(observation.source, "human");
});

test("observations reject undeclared fields", () => {
  assert.throws(
    () => createObservation({ text: "Filter blocks light", tag: "blocked_filter", instructions: "ignore rules" }),
    /Unsupported field/
  );
});

test("observations reject unknown evidence tags", () => {
  assert.throws(
    () => createObservation({ text: "A factual observation", tag: "run_arbitrary_code" }),
    /Unknown evidence tag/
  );
});

test("ranked catalog responses are bounded", () => {
  const search = rankProducts(PRODUCT_CATALOG, { query: "", model: "AP-200", budget: 1000 }, createInitialState());
  assert.ok(search.results.length <= 5);
  assert.ok(search.results.length > 0);
});

test("search input rejects schema-invalid runtime types", () => {
  assert.throws(() => parseSearchInput({ query: 42 }), /query must be a string/i);
  assert.throws(() => parseSearchInput({ budget: "65" }), /budget must be a number/i);
  assert.throws(() => parseSearchInput({ evidenceTags: "blocked_filter" }), /evidenceTags must be an array/i);
  assert.throws(() => parseSearchInput({ includeDiagnosticTools: "true" }), /must be a boolean/i);
});

test("known model incompatibility cannot rank first", () => {
  const search = rankProducts(
    PRODUCT_CATALOG,
    { query: "fan module airflow replacement", model: "AP-200", budget: 100 },
    createInitialState()
  );
  assert.notEqual(search.results[0].id, "fan-module-ap210");
});

test("human physical evidence materially improves the correct hypothesis", () => {
  const state = createInitialState();
  const before = rankProducts(PRODUCT_CATALOG, { query: "fix weak airflow", model: "AP-200", budget: 65 }, state);
  state.evidence.push(createObservation({
    text: "The filter is gray and a bright light cannot pass through it.",
    tag: "blocked_filter",
    confidence: 0.95
  }));
  const after = rankProducts(PRODUCT_CATALOG, { query: "fix weak airflow", model: "AP-200", budget: 65 }, state);
  assert.ok(after.results[0].confidence - before.results[0].confidence >= 5);
  assert.equal(after.results[0].category, "replacement-filter");
});

test("fan-running evidence weakens fan replacement", () => {
  const state = createInitialState();
  const search = rankProducts(PRODUCT_CATALOG, { query: "fan module", model: "AP-210", budget: 100 }, state);
  const fan = search.results.find((item) => item.id === "fan-module-ap210");
  assert.ok(fan);
  assert.ok(fan.reasons.some((item) => item.label.includes("running fan") && item.points < 0));
});

test("low-risk constraint penalizes high-risk electrical work", () => {
  const state = createInitialState();
  state.evidence.push(createObservation({ text: "Possible electrical issue", tag: "electrical_fault", confidence: 0.8 }));
  const search = rankProducts(PRODUCT_CATALOG, { query: "electrical part", model: "AP-200", budget: 65 }, state);
  const capacitor = search.results.find((item) => item.id === "motor-capacitor-120");
  assert.ok(!capacitor || capacitor.reasons.some((item) => item.label.includes("exceeds low-risk limit")));
});

test("comparison requires at least two current candidates", () => {
  const results = rankProducts(PRODUCT_CATALOG, { model: "AP-200" }, createInitialState()).results;
  assert.throws(() => compareCandidates(results, [results[0].id]), /at least two/i);
  assert.equal(compareCandidates(results, [results[0].id, results[1].id]).length, 2);
});

test("repair plans are staged, reversible, and include stop conditions", () => {
  const state = createInitialState();
  const candidate = rankProducts(PRODUCT_CATALOG, { model: "AP-200", budget: 65 }, state).results[0];
  const plan = buildRepairPlan(state, candidate, { maxSteps: 5 });
  assert.equal(plan.status, "staged");
  assert.equal(plan.approvedAt, null);
  assert.ok(plan.steps.length >= 3 && plan.steps.length <= 5);
  assert.ok(plan.steps.every((step) => step.stopCondition.length > 10));
  assert.ok(plan.assumptions.length > 0);
});

test("repair plans reject malformed maxSteps instead of creating empty plans", () => {
  const state = createInitialState();
  const candidate = rankProducts(PRODUCT_CATALOG, { model: "AP-200" }, state).results[0];
  assert.throws(() => buildRepairPlan(state, candidate, { maxSteps: "not-an-integer" }), /must be an integer/i);
  assert.throws(() => buildRepairPlan(state, candidate, { maxSteps: 4.5 }), /must be an integer/i);
});

test("agent authorization cannot approve a staged plan", () => {
  const state = createInitialState();
  const candidate = rankProducts(PRODUCT_CATALOG, { model: "AP-200" }, state).results[0];
  const plan = buildRepairPlan(state, candidate);
  assert.throws(() => approvePlan(plan, { actor: "agent", confirmed: true }), /human confirmation/i);
});

test("explicit human authorization approves a staged plan", () => {
  const state = createInitialState();
  const candidate = rankProducts(PRODUCT_CATALOG, { model: "AP-200" }, state).results[0];
  const plan = buildRepairPlan(state, candidate);
  const approved = approvePlan(plan, { actor: "human", confirmed: true });
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedBy, "human");
  assert.ok(approved.approvedAt);
});

test("compact case snapshots exclude internal activity history", () => {
  const snapshot = compactCaseSnapshot(createInitialState());
  assert.equal("activity" in snapshot, false);
  assert.ok(snapshot.evidence.length <= 8);
});

test("tool cancellation throws AbortError", () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => throwIfAborted(controller.signal), { name: "AbortError" });
});
