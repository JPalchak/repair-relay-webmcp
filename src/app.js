import { PRODUCT_CATALOG } from "./catalog.js";
import { buildRepairPlan, compareCandidates, createObservation, rankProducts } from "./engine.js";
import { runLunaReview } from "./luna.js";
import { createRenderer } from "./render.js";
import { createStore } from "./store.js";
import { createToolDefinitions } from "./tool-definitions.js";
import { registerWebMCPTools } from "./webmcp.js";

const store = createStore();
let comparisonSelection = [];

function toast(message) {
  const region = document.querySelector("#toast-region");
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 3600);
}

function runSearch(actor = "human") {
  const search = rankProducts(
    PRODUCT_CATALOG,
    {
      query: "restore weak airflow with a compatible low-risk fix",
      model: store.getState().device.model,
      budget: store.getState().constraints.budget,
      includeDiagnosticTools: true
    },
    store.getState()
  );
  store.dispatch({ type: "SET_SEARCH", search, actor });
  return search;
}

function stagePlan(candidateId, actor = "human") {
  const state = store.getState();
  const search = state.search ?? runSearch(actor);
  const candidate = search.results.find((item) => item.id === candidateId);
  const plan = buildRepairPlan(store.getState(), candidate, {
    objective: `Restore AP-200 airflow with ${candidate.name}`,
    maxSteps: 5
  });
  store.dispatch({ type: "STAGE_PLAN", plan, actor });
  toast("Plan staged. It remains unapproved.");
}

function toggleCompare(productId) {
  comparisonSelection = comparisonSelection.includes(productId)
    ? comparisonSelection.filter((id) => id !== productId)
    : [...comparisonSelection, productId].slice(-3);

  if (comparisonSelection.length >= 2) {
    const comparison = compareCandidates(store.getState().search.results, comparisonSelection);
    store.dispatch({ type: "SET_COMPARISON", comparison, actor: "human" });
  } else {
    store.dispatch({ type: "CLEAR_COMPARISON" });
    toast("Choose one more candidate to compare.");
  }
}

function openDecision(reason) {
  const dialog = document.querySelector("#decision-dialog");
  const state = store.getState();
  document.querySelector("#decision-reason").textContent = reason;
  document.querySelector("#decision-summary").textContent = state.stagedPlan
    ? `${state.stagedPlan.title}. ${state.stagedPlan.steps.length} visible steps; still unapproved.`
    : "No plan is staged.";
  if (!dialog.open) dialog.showModal();
}

const tools = createToolDefinitions({
  store,
  onDecisionRequested: openDecision
});

const renderer = createRenderer({
  store,
  tools,
  actions: { toggleCompare, stagePlan }
});

await registerWebMCPTools(tools, renderer.renderStatus);

function runLuna(log = false) {
  const review = runLunaReview(store.getState(), tools);
  store.dispatch({ type: "SET_LUNA", review, log });
  return review;
}

document.querySelector("#observation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const observation = createObservation(
    {
      text: document.querySelector("#observation-text").value,
      tag: document.querySelector("#observation-tag").value,
      confidence: Number(document.querySelector("#observation-confidence").value)
    },
    "human"
  );
  store.dispatch({ type: "ADD_EVIDENCE", observation, actor: "human" });
  event.currentTarget.reset();
  document.querySelector("#observation-confidence").value = "0.75";
  toast("Physical evidence recorded.");
  runLuna(false);
});

document.querySelector("#demo-evidence-button").addEventListener("click", (event) => {
  if (!event.isTrusted) {
    toast("Demo evidence requires a visible user action.");
    return;
  }
  const observation = createObservation(
    {
      text: "The filter is gray and a bright light does not pass through the media.",
      tag: "blocked_filter",
      confidence: 0.95
    },
    "human"
  );
  store.dispatch({ type: "ADD_EVIDENCE", observation, actor: "human" });
  const search = runSearch("human");
  toast(`Evidence changed the ranking: ${search.results[0].name} now leads at ${search.results[0].confidence}% fit.`);
  runLuna(false);
});

document.querySelector("#run-search-button").addEventListener("click", () => {
  const search = runSearch("human");
  toast(`${search.results.length} candidates ranked.`);
  runLuna(false);
});

document.querySelector("#clear-comparison-button").addEventListener("click", () => {
  comparisonSelection = [];
  store.dispatch({ type: "CLEAR_COMPARISON" });
});

document.querySelector("#approval-checkbox").addEventListener("change", (event) => {
  const plan = store.getState().stagedPlan;
  document.querySelector("#approve-button").disabled = !event.currentTarget.checked || plan?.status === "approved";
});

document.querySelector("#approve-button").addEventListener("click", (event) => {
  if (!event.isTrusted) {
    toast("Approval rejected: a trusted human interaction is required.");
    return;
  }
  const checked = document.querySelector("#approval-checkbox").checked;
  if (!checked) return;
  try {
    store.dispatch({
      type: "APPROVE_PLAN",
      authorization: { actor: "human", confirmed: true }
    });
    toast("Human approval recorded. The agent may now read the approved plan.");
    runLuna(true);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#run-luna-button").addEventListener("click", () => {
  const review = runLuna(true);
  toast(`Luna review complete: ${review.score}/${review.maxScore}.`);
});

document.querySelector("#copy-prompt-button").addEventListener("click", async () => {
  const prompt = document.querySelector("#suggested-prompt").textContent;
  try {
    await navigator.clipboard.writeText(prompt);
    toast("Prompt copied.");
  } catch {
    toast("Copy failed; select the prompt manually.");
  }
});

document.querySelector("#reset-button").addEventListener("click", () => {
  comparisonSelection = [];
  store.dispatch({ type: "RESET" });
  runLuna(false);
  toast("Case reset.");
});

document.querySelector("#decision-dialog").addEventListener("close", () => {
  store.dispatch({ type: "CLEAR_DECISION_REQUEST" });
  if (store.getState().stagedPlan) {
    document.querySelector(".plan-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
});

runLuna(false);
window.setInterval(() => runLuna(false), 60_000);

// Exposed only for reproducible browser evaluation and the demo recorder.
// It deliberately does not expose an approval method.
window.__repairRelay = Object.freeze({
  getState: () => structuredClone(store.getState()),
  toolNames: tools.map((tool) => tool.name),
  invokeTool: async (name, input = {}) => {
    const tool = tools.find((item) => item.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(input, {});
  },
  reset: () => store.dispatch({ type: "RESET" }),
  runLuna: () => runLuna(false)
});
