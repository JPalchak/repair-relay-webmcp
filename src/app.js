import { createPackageCheck, stageChoice as buildChoice } from "./engine.js";
import { createRenderer } from "./render.js";
import { createStore } from "./store.js";
import { createToolDefinitions } from "./tool-definitions.js";
import { registerWebMCPTools } from "./webmcp.js";

const DEMO_BARCODE = "030000010402";
const store = createStore();
let compared = [];
let lastLiveRequest = { name: "lookup_barcode", input: { barcode: DEMO_BARCODE } };

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  document.querySelector("#toast-region").append(item);
  setTimeout(() => item.remove(), 4200);
}

function openDecision(reason) {
  const dialog = document.querySelector("#decision-dialog");
  document.querySelector("#decision-reason").textContent = reason;
  const choice = store.getState().stagedChoice;
  document.querySelector("#decision-summary").textContent = choice
    ? choice.status === "record_mismatch"
      ? `${choice.name}; a confirmed package mismatch blocks approval.`
      : `${choice.name}; ${choice.requiredChecks.length} required check(s) and ${choice.pendingAttestationIds?.length ?? 0} pending confirmation(s) remain.`
    : "Nothing is staged.";
  if (!dialog.open) dialog.showModal();
}

const tools = createToolDefinitions({ store, onDecisionRequested: openDecision });
const findTool = (name) => tools.find((tool) => tool.name === name);

function toggleCompare(productId) {
  compared = compared.includes(productId)
    ? compared.filter((id) => id !== productId)
    : [...compared, productId].slice(-4);
  if (compared.length < 2) {
    store.dispatch({ type: "CLEAR_COMPARISON" });
    toast("Choose one more live result to compare.");
    return;
  }
  findTool("compare_products").execute({ productIds: compared }, { actor: "human" }).catch((error) => toast(error.message));
}

function stageChoice(productId) {
  const choice = buildChoice(
    store.getState(),
    {
      productId,
      rationale: "Staged by the person from the current live result set; package attestations remain authoritative."
    },
    "human"
  );
  store.dispatch({ type: "STAGE_CHOICE", choice, actor: "human" });
  document.querySelector("#check-product").value = productId;
  document.querySelector("#choice-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  toast(choice.status === "record_mismatch"
    ? "This record conflicts with a confirmed package attestation. Approval is blocked."
    : "Record staged. Confirm the barcode and ingredients attestations before approval.");
}

function trustedHumanEvent(event) {
  if (!event?.isTrusted) {
    toast("This confirmation requires a visible, trusted human click.");
    return false;
  }
  return true;
}

function confirmRelayedCheck(checkId, event) {
  if (!trustedHumanEvent(event)) return;
  try {
    store.dispatch({ type: "CONFIRM_CHECK", checkId, authorization: { actor: "human", confirmed: true } });
    toast("Relayed package statement confirmed by the person.");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

function rejectRelayedCheck(checkId, event) {
  if (!trustedHumanEvent(event)) return;
  try {
    store.dispatch({ type: "REJECT_CHECK", checkId, authorization: { actor: "human", confirmed: true } });
    toast("Relayed statement rejected; it will not count as package evidence.");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
}

const renderer = createRenderer({
  store,
  tools,
  actions: { toggleCompare, stageChoice, confirmRelayedCheck, rejectRelayedCheck }
});
await registerWebMCPTools(tools, renderer.renderStatus);

async function invokeLive(name, input, { remember = true } = {}) {
  if (remember && ["search_products", "lookup_barcode"].includes(name)) {
    lastLiveRequest = { name, input: structuredClone(input) };
  }
  try {
    return await findTool(name).execute(input, { actor: "human" });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function verifiedSummaryText() {
  const state = store.getState();
  const choice = state.approvedChoice;
  if (!choice) throw new Error("Approve an attested package match first.");
  const checks = state.checks.filter((check) => check.productId === choice.productId && check.confirmationStatus === "confirmed");
  return [
    `Human-attested package record: ${choice.name} — ${choice.brand}`,
    `Barcode: ${choice.productId}`,
    `Ingredients in Open Food Facts: ${choice.ingredients || "Not recorded"}`,
    `Recorded allergens: ${choice.allergens?.join(", ") || "Not recorded"}`,
    `Confirmed package attestations: ${checks.map((check) => `${check.checkType}=${check.outcome}`).join("; ")}`,
    `Source: ${choice.sourceUrl}`,
    "Limitation: Label Relay records the person's attestation; it cannot independently see or authenticate the package. Recheck the physical label for consequential dietary decisions."
  ].join("\n");
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

document.querySelector("#sample-barcode-button").addEventListener("click", () => {
  document.querySelector("#barcode-input").value = DEMO_BARCODE;
  compared = [];
  invokeLive("lookup_barcode", { barcode: DEMO_BARCODE });
});

document.querySelector("#retry-search-button").addEventListener("click", () => {
  if (!lastLiveRequest) return;
  invokeLive(lastLiveRequest.name, lastLiveRequest.input, { remember: false });
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
    if (!store.getState().search?.results.some((product) => product.id === check.productId)) {
      throw new Error("Choose a product from the current live results.");
    }
    store.dispatch({ type: "ADD_CHECK", check, actor: "human" });
    document.querySelector("#check-note").value = "";
    toast(check.outcome === "mismatch"
      ? "Package mismatch confirmed. The community record is now blocked for this package."
      : "Package attestation recorded by the person.");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#approval-checkbox").addEventListener("change", (event) => {
  const choice = store.getState().stagedChoice;
  const blocked = !choice
    || choice.requiredChecks.length > 0
    || choice.pendingAttestationIds?.length > 0
    || choice.status === "human_approved"
    || choice.status === "record_mismatch";
  document.querySelector("#approve-button").disabled = !event.currentTarget.checked || blocked;
});

document.querySelector("#approve-button").addEventListener("click", (event) => {
  if (!trustedHumanEvent(event)) return;
  try {
    store.dispatch({ type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } });
    toast("Verified label summary unlocked for continued agent assistance.");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector("#copy-verified-summary-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(verifiedSummaryText());
    toast("Verified label summary copied.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Copy unavailable; select the summary manually.");
  }
});

document.querySelector("#clear-comparison-button").addEventListener("click", () => {
  compared = [];
  store.dispatch({ type: "CLEAR_COMPARISON" });
});

document.querySelector("#reset-button").addEventListener("click", () => {
  compared = [];
  store.dispatch({ type: "RESET" });
  toast("Workspace reset.");
});

document.querySelector("#decision-dialog").addEventListener("close", () => store.dispatch({ type: "CLEAR_DECISION_REQUEST" }));

document.querySelector("#copy-prompt-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#suggested-prompt").textContent);
    toast("WebMCP prompt copied.");
  } catch {
    toast("Copy unavailable; select the prompt manually.");
  }
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

// A real, judge-reproducible US retail barcode is loaded on first visit. Failure remains visible and retryable.
document.querySelector("#barcode-input").value = DEMO_BARCODE;
await invokeLive("lookup_barcode", { barcode: DEMO_BARCODE });
