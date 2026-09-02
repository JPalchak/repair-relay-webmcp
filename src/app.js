import { createPackageCheck, stageChoice as buildChoice } from "./engine.js";
import { createRenderer } from "./render.js";
import { createStore } from "./store.js";
import { createToolDefinitions } from "./tool-definitions.js";
import { registerWebMCPTools } from "./webmcp.js";

const store = createStore();
let compared = [];

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  document.querySelector("#toast-region").append(item);
  setTimeout(() => item.remove(), 3600);
}

function openDecision(reason) {
  const dialog = document.querySelector("#decision-dialog");
  document.querySelector("#decision-reason").textContent = reason;
  const choice = store.getState().stagedChoice;
  document.querySelector("#decision-summary").textContent = choice
    ? `${choice.name}; ${choice.requiredChecks.length} physical check(s) remain; no approval recorded.`
    : "Nothing is staged.";
  if (!dialog.open) dialog.showModal();
}

const tools = createToolDefinitions({ store, onDecisionRequested: openDecision });
const findTool = (name) => tools.find((tool) => tool.name === name);

function toggleCompare(productId) {
  compared = compared.includes(productId) ? compared.filter((id) => id !== productId) : [...compared, productId].slice(-4);
  if (compared.length < 2) {
    store.dispatch({ type: "CLEAR_COMPARISON" });
    toast("Choose one more live result to compare.");
    return;
  }
  findTool("compare_products").execute({ productIds: compared }, { actor: "human" }).catch((error) => toast(error.message));
}

function stageChoice(productId) {
  const choice = buildChoice(store.getState(), { productId, rationale: "Staged by the person from the current live result set; physical package checks remain authoritative." }, "human");
  store.dispatch({ type: "STAGE_CHOICE", choice, actor: "human" });
  document.querySelector("#check-product").value = productId;
  document.querySelector("#choice-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("Choice staged, not approved. Verify the physical barcode and ingredients.");
}

const renderer = createRenderer({ store, tools, actions: { toggleCompare, stageChoice } });
await registerWebMCPTools(tools, renderer.renderStatus);

async function invokeLive(name, input) {
  try {
    await findTool(name).execute(input, { actor: "human" });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  compared = [];
  invokeLive("search_products", { query: document.querySelector("#search-query").value });
});

document.querySelector("#barcode-form").addEventListener("submit", (event) => {
  event.preventDefault();
  compared = [];
  invokeLive("lookup_barcode", { barcode: document.querySelector("#barcode-input").value });
});

document.querySelector("#check-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const check = createPackageCheck({
      productId: document.querySelector("#check-product").value,
      checkType: document.querySelector("#check-type").value,
      outcome: document.querySelector("#check-outcome").value,
      note: document.querySelector("#check-note").value
    }, "human");
    if (!store.getState().search?.results.some((product) => product.id === check.productId)) throw new Error("Choose a product from the current live results.");
    store.dispatch({ type: "ADD_CHECK", check, actor: "human" });
    document.querySelector("#check-note").value = "";
    toast("Physical package check recorded.");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#approval-checkbox").addEventListener("change", (event) => {
  const choice = store.getState().stagedChoice;
  document.querySelector("#approve-button").disabled = !event.currentTarget.checked || !choice || choice.requiredChecks.length > 0 || choice.status === "human_approved";
});

document.querySelector("#approve-button").addEventListener("click", (event) => {
  if (!event.isTrusted) return toast("Approval requires a visible, trusted human click.");
  try {
    store.dispatch({ type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } });
    toast("Human approval recorded. The approved choice is now agent-readable.");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#clear-comparison-button").addEventListener("click", () => { compared = []; store.dispatch({ type: "CLEAR_COMPARISON" }); });
document.querySelector("#reset-button").addEventListener("click", () => { compared = []; store.dispatch({ type: "RESET" }); toast("Workspace reset."); });
document.querySelector("#decision-dialog").addEventListener("close", () => store.dispatch({ type: "CLEAR_DECISION_REQUEST" }));
document.querySelector("#copy-prompt-button").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(document.querySelector("#suggested-prompt").textContent); toast("WebMCP prompt copied."); }
  catch { toast("Copy unavailable; select the prompt manually."); }
});

window.__labelRelay = Object.freeze({
  getState: () => structuredClone(store.getState()),
  toolNames: tools.map((tool) => tool.name),
  invokeTool: async (name, input = {}) => {
    const tool = findTool(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(input, {});
  },
  reset: () => store.dispatch({ type: "RESET" })
});

// One deliberate startup request makes the public demo useful immediately; it is never a fixture.
await invokeLive("search_products", { query: "oat cereal" });
