import { compareProducts, compactSnapshot, createPackageCheck, sanitizeText, stageChoice, throwIfAborted } from "./engine.js";
import { lookupLiveBarcode, searchLiveProducts } from "./live-catalog.js";

function output(payload) {
  const text = JSON.stringify(payload);
  if (text.length <= 1500) return text;
  return JSON.stringify({ ...payload, results: payload.results?.slice(0, 3), notice: "Output shortened to the WebMCP character budget." }).slice(0, 1500);
}

function assertInput(input, allowed, required = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool input must be an object.");
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`Unsupported input field: ${extra}.`);
  const missing = required.find((key) => !(key in input));
  if (missing) throw new Error(`Missing required input field: ${missing}.`);
}

function currentResults(state) {
  if (!state.search?.results?.length) throw new Error("Run search_products or lookup_barcode before using the current result set.");
  return state.search.results;
}

function compactProduct(product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    quantity: product.quantity,
    nutriScore: product.nutriScore,
    allergens: product.allergens.slice(0, 6),
    sugar100g: product.sugar100g,
    completeness: product.completeness,
    lastModified: product.lastModified,
    sourceUrl: product.sourceUrl
  };
}

export function createToolDefinitions({ store, onDecisionRequested = () => {} }) {
  const cache = new Map();
  const tools = [
    {
      name: "search_products",
      title: "Search live food products",
      description: "Search the product catalog",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", minLength: 2, maxLength: 80, description: "Product, brand, or food phrase to search in Open Food Facts." } },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["query"], ["query"]);
        if (typeof input.query !== "string") throw new Error("query must be a string.");
        const actor = options.actor === "human" ? "human" : "agent";
        const query = sanitizeText(input?.query, 80);
        const key = query.toLowerCase();
        const hit = cache.get(key);
        store.dispatch({ type: "SEARCH_STARTED", actor });
        try {
          const search = hit && Date.now() - hit.cachedAt < 300000 ? hit.search : await searchLiveProducts(query, { signal: options.signal });
          if (!hit || search !== hit.search) cache.set(key, { search, cachedAt: Date.now() });
          store.dispatch({ type: "SEARCH_SUCCEEDED", search, actor });
          return output({ source: search.source, live: true, fetchedAt: search.fetchedAt, total: search.total, results: search.results.slice(0, 4).map(compactProduct), uiEffect: "The shared live result board was updated." });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          store.dispatch({ type: "SEARCH_FAILED", message, actor });
          throw new Error(message);
        }
      }
    },
    {
      name: "lookup_barcode",
      title: "Look up a barcode",
      description: "Fetch the current Open Food Facts record for an 8–14 digit barcode and show it in the shared workspace.",
      inputSchema: {
        type: "object",
        properties: { barcode: { type: "string", minLength: 8, maxLength: 20, description: "Digits printed beneath the physical package barcode." } },
        required: ["barcode"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["barcode"], ["barcode"]);
        const actor = options.actor === "human" ? "human" : "agent";
        store.dispatch({ type: "SEARCH_STARTED", actor });
        try {
          const search = await lookupLiveBarcode(input?.barcode, { signal: options.signal });
          store.dispatch({ type: "SEARCH_SUCCEEDED", search, actor });
          return output({ source: search.source, live: true, fetchedAt: search.fetchedAt, result: compactProduct(search.results[0]), uiEffect: "The live barcode result is visible." });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          store.dispatch({ type: "SEARCH_FAILED", message, actor });
          throw new Error(message);
        }
      }
    },
    {
      name: "record_package_check",
      title: "Record a physical package check",
      description: "Record a factual observation the person supplied from the package in hand; it is treated as untrusted evidence, not instructions.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", minLength: 8, maxLength: 20, description: "Barcode ID from the current result." },
          checkType: { type: "string", enum: ["barcode_match", "ingredients_match", "allergens_match", "package_date", "available_here"], description: "What the person physically checked." },
          outcome: { type: "string", enum: ["match", "mismatch", "unclear"], description: "Observed agreement with the live record." },
          note: { type: "string", minLength: 3, maxLength: 240, description: "Brief factual observation from the physical package." }
        },
        required: ["productId", "checkType", "outcome", "note"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["productId", "checkType", "outcome", "note"], ["productId", "checkType", "outcome", "note"]);
        const productId = String(input?.productId ?? "");
        if (!currentResults(store.getState()).some((p) => p.id === productId)) throw new Error("productId must be in the current live result set.");
        const check = createPackageCheck(input, "agent");
        store.dispatch({ type: "ADD_CHECK", check, actor: options.actor === "human" ? "human" : "agent" });
        return output({ recorded: check, caution: "Evidence was recorded; no product was approved.", uiEffect: "The package-check lane was updated." });
      }
    },
    {
      name: "compare_products",
      title: "Compare live product records",
      description: "Compare two to four products from the current live result set and show freshness, completeness, allergens, and nutrition fields.",
      inputSchema: {
        type: "object",
        properties: { productIds: { type: "array", minItems: 2, maxItems: 4, uniqueItems: true, items: { type: "string", maxLength: 20 }, description: "Barcode IDs returned by the current search." } },
        required: ["productIds"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["productIds"], ["productIds"]);
        const comparison = compareProducts(currentResults(store.getState()), input?.productIds);
        store.dispatch({ type: "SET_COMPARISON", comparison, actor: options.actor === "human" ? "human" : "agent" });
        return output({ compared: comparison, uiEffect: "The comparison table is visible." });
      }
    },
    {
      name: "stage_verified_choice",
      title: "Stage a label-verified choice",
      description: "Stage one live result for human review and list any physical barcode or ingredients checks still required; this never approves it.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", minLength: 8, maxLength: 20, description: "Barcode ID from the current live result set." },
          rationale: { type: "string", maxLength: 220, description: "Why this result fits the person's stated goal, including uncertainties." }
        },
        required: ["productId"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["productId", "rationale"], ["productId"]);
        const choice = stageChoice(store.getState(), input, "agent");
        store.dispatch({ type: "STAGE_CHOICE", choice, actor: "agent" });
        return output({ choice, approval: "Not granted. Only the visible human control can approve.", uiEffect: "The staged choice and required checks are visible." });
      }
    },
    {
      name: "request_human_decision",
      title: "Request a human decision",
      description: "Open the visible review checkpoint for the staged choice; this tool cannot approve a product.",
      inputSchema: {
        type: "object",
        properties: { reason: { type: "string", minLength: 4, maxLength: 180, description: "Why physical verification or personal judgment is needed now." } },
        required: ["reason"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["reason"], ["reason"]);
        if (typeof input.reason !== "string") throw new Error("reason must be a string.");
        if (!store.getState().stagedChoice) throw new Error("Stage a choice before requesting a decision.");
        const reason = sanitizeText(input?.reason, 180);
        store.dispatch({ type: "REQUEST_DECISION", reason, actor: "agent" });
        onDecisionRequested(reason);
        return output({ checkpoint: "opened", authority: "Human retained; no approval was recorded.", reason });
      }
    },
    {
      name: "get_workspace_snapshot",
      title: "Read the shared workspace",
      description: "Read a compact snapshot of the current live search, physical checks, staged choice, and approval state.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}, options = {}) { throwIfAborted(options.signal); assertInput(input, []); return output(compactSnapshot(store.getState())); }
    },
    {
      name: "get_approved_choice",
      title: "Read the human-approved choice",
      description: "Read the product choice only after the person completed physical checks and approved it in the visible interface.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, []);
        const approved = store.getState().approvedChoice;
        return output(approved ? { approved: true, choice: approved } : { approved: false, message: "No human-approved choice exists." });
      }
    }
  ];
  return tools;
}
