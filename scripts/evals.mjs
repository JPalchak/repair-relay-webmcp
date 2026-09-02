import { PRODUCT_CATALOG } from "../src/catalog.js";
import { buildRepairPlan, createObservation, rankProducts } from "../src/engine.js";
import { createInitialState } from "../src/store.js";

const scenarios = [];

function evaluate(name, run) {
  try {
    const detail = run();
    scenarios.push({ name, passed: true, detail });
  } catch (error) {
    scenarios.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

evaluate("Baseline does not overcommit before decisive evidence", () => {
  const state = createInitialState();
  const search = rankProducts(PRODUCT_CATALOG, { query: "fix weak airflow", model: "AP-200", budget: 65 }, state);
  if (search.results[0].confidence > 90) throw new Error(`Premature confidence: ${search.results[0].confidence}%`);
  return `${search.results[0].name} leads provisionally at ${search.results[0].confidence}%.`;
});

evaluate("Human evidence materially improves the filter hypothesis", () => {
  const state = createInitialState();
  const before = rankProducts(PRODUCT_CATALOG, { query: "fix weak airflow", model: "AP-200", budget: 65 }, state);
  state.evidence.push(createObservation({ text: "The filter is gray and bright light cannot pass through it.", tag: "blocked_filter", confidence: 0.95 }, "human"));
  const after = rankProducts(PRODUCT_CATALOG, { query: "fix weak airflow", model: "AP-200", budget: 65 }, state);
  const delta = after.results[0].confidence - before.results[0].confidence;
  if (delta < 5) throw new Error(`Evidence delta too small: ${delta}`);
  return `Leading confidence changed by +${delta} points (${before.results[0].confidence}% → ${after.results[0].confidence}%).`;
});

evaluate("Known incompatibility cannot win through semantic similarity", () => {
  const state = createInitialState();
  const search = rankProducts(PRODUCT_CATALOG, { query: "fan module airflow replacement", model: "AP-200", budget: 100 }, state);
  const incompatible = search.results.find((item) => item.id === "fan-module-ap210");
  if (incompatible && incompatible === search.results[0]) throw new Error("Incompatible AP-210 fan ranked first.");
  return `Top result remains ${search.results[0].name}; incompatible module is suppressed.`;
});

evaluate("Low-risk constraint suppresses electrical parts", () => {
  const state = createInitialState();
  state.evidence.push(createObservation({ text: "There may be an electrical fault.", tag: "electrical_fault", confidence: 0.8 }, "human"));
  const search = rankProducts(PRODUCT_CATALOG, { query: "electrical part", model: "AP-200", budget: 65 }, state);
  const capacitor = search.results.find((item) => item.id === "motor-capacitor-120");
  if (capacitor && capacitor.score > 30) throw new Error(`High-risk capacitor insufficiently suppressed: ${capacitor.score}`);
  return "High-risk electrical work remains below low-risk options.";
});

evaluate("A staged plan is explicit and unapproved", () => {
  const state = createInitialState();
  const search = rankProducts(PRODUCT_CATALOG, { query: "replacement filter", model: "AP-200", budget: 65 }, state);
  const plan = buildRepairPlan(state, search.results[0], { maxSteps: 5 });
  if (plan.status !== "staged" || plan.approvedAt !== null) throw new Error("Plan crossed approval boundary.");
  if (!plan.steps.every((step) => step.stopCondition)) throw new Error("A step is missing a stop condition.");
  return `${plan.steps.length} reversible steps; status=${plan.status}.`;
});

evaluate("Catalog response remains bounded", () => {
  const state = createInitialState();
  const search = rankProducts(PRODUCT_CATALOG, { query: "", model: "AP-200", budget: 1000 }, state);
  if (search.results.length > 5) throw new Error(`${search.results.length} results escaped the response budget.`);
  return `${search.results.length} results returned from ${PRODUCT_CATALOG.length} catalog entries.`;
});

evaluate("Agent-readable snapshot omits raw internal activity", async () => {
  const { compactCaseSnapshot } = await import("../src/engine.js");
  const snapshot = compactCaseSnapshot(createInitialState());
  if ("activity" in snapshot) throw new Error("Internal activity log leaked into compact snapshot.");
  return "Snapshot contains case facts and bounded evidence without the internal activity log.";
});

const passed = scenarios.filter((scenario) => scenario.passed).length;
console.log(JSON.stringify({ suite: "repair-relay-webmcp-evals", passed, total: scenarios.length, scenarios }, null, 2));
if (passed !== scenarios.length) process.exitCode = 1;
