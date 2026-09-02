import { RESOLUTIONS, createReading, sweepQueryFor } from "./engine.js";
import { createRenderer } from "./render.js";
import { createStore } from "./store.js";
import { createToolDefinitions } from "./tool-definitions.js";
import { registerWebMCPTools } from "./webmcp.js";

const store = createStore();

function toast(message, tone = "info") {
  const item = document.createElement("div");
  item.className = `toast toast-${tone}`;
  item.textContent = message;
  document.querySelector("#toast-region").append(item);
  setTimeout(() => item.remove(), 4200);
}

function onReadingRequested(itemId) {
  toast("Your agent needs you to read something off a package.", "ask");
  requestAnimationFrame(() => document.querySelector(`[data-item-id="${itemId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}

const tools = createToolDefinitions({ store, onReadingRequested });
const findTool = (name) => tools.find((tool) => tool.name === name);

async function invoke(name, input = {}) {
  try {
    return await findTool(name).execute(input, { actor: "human" });
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), "error");
    return null;
  }
}

// Human-only actions. None of these are reachable through WebMCP or the debug surface.
const actions = {
  addFromCatalog: (productId) => invoke("add_shelf_item", { productId }),
  checkItem: (item) => invoke("search_recalls", { query: sweepQueryFor(item), scope: item.kind, itemId: item.id }),
  removeItem: (itemId) => store.dispatch({ type: "REMOVE_ITEM", itemId }),
  recordReading(itemId, field, value) {
    try {
      const reading = createReading({ itemId, field, value }, "human");
      store.dispatch({ type: "ADD_READING", itemId, reading });
      toast("Reading recorded as read by you.");
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    }
  },
  resolveItem(itemId, action, event) {
    if (!event?.isTrusted) return toast("Decisions require a real click in the page.", "error");
    if (!RESOLUTIONS.includes(action)) return toast("Unknown decision.", "error");
    try {
      store.dispatch({ type: "RESOLVE_ITEM", itemId, action, note: "", authorization: { actor: "human", confirmed: true } });
      toast(`Decision recorded: ${action.replace("_", " ")}.`);
    } catch (error) {
      toast(error.message, "error");
    }
  }
};

const renderer = createRenderer({ store, tools, actions });
await registerWebMCPTools(tools, renderer.renderStatus);

store.subscribe((state) => {
  if (!state.highlightItemId) return;
  requestAnimationFrame(() => document.querySelector(`[data-item-id="${state.highlightItemId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  setTimeout(() => store.dispatch({ type: "CLEAR_HIGHLIGHT" }), 2400);
});

document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  invoke("search_products", { query: document.querySelector("#search-query").value });
});

document.querySelector("#barcode-form").addEventListener("submit", (event) => {
  event.preventDefault();
  invoke("lookup_barcode", { barcode: document.querySelector("#barcode-input").value });
});

document.querySelector("#manual-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const description = document.querySelector("#manual-description").value;
  const brand = document.querySelector("#manual-brand").value;
  const kind = document.querySelector("#manual-kind").value;
  const result = await invoke("add_shelf_item", { description, brand, kind });
  if (result) { document.querySelector("#manual-description").value = ""; document.querySelector("#manual-brand").value = ""; }
});

document.querySelector("#sample-shelf-button").addEventListener("click", async () => {
  const samples = [
    { description: "Creamy peanut butter", brand: "Jif", kind: "food", note: "Sample item — replace with what is actually in your pantry." },
    { description: "Children's ibuprofen oral suspension", brand: "Children's Ibuprofen", kind: "drug", note: "Sample item — medicine cabinet." },
    { description: "Smart electric space heater", brand: "Govee", kind: "consumer", note: "Sample item — bedroom." }
  ];
  for (const sample of samples) await invoke("add_shelf_item", sample);
  toast("Sample shelf added. Ask your agent to sweep it, or press Sweep shelf.");
});

document.querySelector("#sweep-button").addEventListener("click", () => invoke("sweep_shelf", {}));
document.querySelector("#reset-button").addEventListener("click", () => { store.dispatch({ type: "RESET" }); toast("Workspace reset."); });
document.querySelector("#copy-prompt-button").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(document.querySelector("#suggested-prompt").textContent); toast("Prompt copied."); }
  catch { toast("Copy unavailable; select the prompt manually.", "error"); }
});

window.__recallRelay = Object.freeze({
  getState: () => structuredClone(store.getState()),
  toolNames: tools.map((tool) => tool.name),
  invokeTool: async (name, input = {}) => {
    const tool = findTool(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(input, {});
  },
  reset: () => store.dispatch({ type: "RESET" })
});
