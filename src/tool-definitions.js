import {
  buildVerifiedLabelSummary,
  compareProducts,
  compactSnapshot,
  createPackageCheck,
  sanitizeText,
  stageChoice,
  throwIfAborted
} from "./engine.js";
import { lookupLiveBarcode, searchLiveProducts } from "./live-catalog.js";

const OUTPUT_BUDGET = 1500;

function compactValue(value, { maxString = 300, maxArray = 6 } = {}) {
  if (typeof value === "string") return value.length > maxString ? `${value.slice(0, maxString - 1)}…` : value;
  if (Array.isArray(value)) return value.slice(0, maxArray).map((item) => compactValue(item, { maxString, maxArray }));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactValue(item, { maxString, maxArray })]));
  }
  return value;
}

function output(payload) {
  const first = compactValue(payload);
  let text = JSON.stringify(first);
  if (text.length <= OUTPUT_BUDGET) return text;

  const second = compactValue(payload, { maxString: 120, maxArray: 3 });
  second.notice = "Output was compacted to fit the WebMCP response budget; use a narrower follow-up request for more detail.";
  text = JSON.stringify(second);
  if (text.length <= OUTPUT_BUDGET) return text;

  return JSON.stringify({
    ok: false,
    code: "OUTPUT_BUDGET_EXCEEDED",
    message: "The result was too large for a safe WebMCP response. Narrow the request or read the visible workspace.",
    availableFields: Object.keys(payload).slice(0, 20)
  });
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
    ingredientsLanguage: product.ingredientsLanguage,
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
        properties: {
          query: {
            type: "string",
            minLength: 2,
            maxLength: 80,
            description: "Product, brand, or food phrase to search among Open Food Facts products reported as sold in the United States."
          }
        },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["query"], ["query"]);
        if (typeof input.query !== "string") throw new Error("query must be a string.");
        const actor = options.actor === "human" ? "human" : "agent";
        const query = sanitizeText(input.query, 80);
        const key = query.toLowerCase();
        const hit = cache.get(key);
        store.dispatch({ type: "SEARCH_STARTED", actor });
        try {
          const search = hit && Date.now() - hit.cachedAt < 300000
            ? hit.search
            : await searchLiveProducts(query, { signal: options.signal });
          if (!hit || search !== hit.search) cache.set(key, { search, cachedAt: Date.now() });
          store.dispatch({ type: "SEARCH_SUCCEEDED", search, actor });
          return output({
            ok: true,
            source: search.source,
            sourceUrl: search.sourceUrl,
            scope: search.searchScope,
            live: true,
            fetchedAt: search.fetchedAt,
            total: search.total,
            results: search.results.slice(0, 6).map(compactProduct),
            uiEffect: "The shared live result board was updated."
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          store.dispatch({ type: "SEARCH_FAILED", message, actor });
          throw new Error(message);
        }
      }
    },
    {
      name: "lookup_barcode",
      title: "Look up a package barcode",
      description: "Fetch the current Open Food Facts record for an 8–14 digit package barcode and show it in the shared workspace.",
      inputSchema: {
        type: "object",
        properties: {
          barcode: {
            type: "string",
            pattern: "^[0-9][0-9 -]{6,18}[0-9]$",
            minLength: 8,
            maxLength: 20,
            description: "Digits printed beneath the physical package barcode."
          }
        },
        required: ["barcode"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["barcode"], ["barcode"]);
        if (typeof input.barcode !== "string") throw new Error("barcode must be a string.");
        const actor = options.actor === "human" ? "human" : "agent";
        store.dispatch({ type: "SEARCH_STARTED", actor });
        try {
          const search = await lookupLiveBarcode(input.barcode, { signal: options.signal });
          store.dispatch({ type: "SEARCH_SUCCEEDED", search, actor });
          return output({
            ok: true,
            source: search.source,
            sourceUrl: search.sourceUrl,
            live: true,
            fetchedAt: search.fetchedAt,
            result: compactProduct(search.results[0]),
            uiEffect: "The live barcode record is visible."
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          store.dispatch({ type: "SEARCH_FAILED", message, actor });
          throw new Error(message);
        }
      }
    },
    {
      name: "record_package_check",
      title: "Relay a package attestation",
      description: "Relay what the person says they read on the physical package. The statement appears as pending and cannot satisfy verification until the person confirms it in the visible page.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", minLength: 8, maxLength: 20, description: "Barcode ID from the current result." },
          checkType: {
            type: "string",
            enum: ["barcode_match", "ingredients_match", "allergens_match", "package_date", "available_here"],
            description: "What the person says they checked."
          },
          outcome: { type: "string", enum: ["match", "mismatch", "unclear"], description: "The outcome the person reported." },
          note: { type: "string", minLength: 3, maxLength: 240, description: "Brief factual statement relayed from the person." }
        },
        required: ["productId", "checkType", "outcome", "note"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["productId", "checkType", "outcome", "note"], ["productId", "checkType", "outcome", "note"]);
        const productId = String(input.productId ?? "");
        if (!currentResults(store.getState()).some((product) => product.id === productId)) {
          throw new Error("productId must be in the current live result set.");
        }
        const check = createPackageCheck(input, "agent_relay");
        store.dispatch({ type: "ADD_CHECK", check, actor: "agent" });
        return output({
          ok: true,
          checkId: check.id,
          pendingHumanConfirmation: true,
          relayedStatement: {
            productId: check.productId,
            checkType: check.checkType,
            outcome: check.outcome,
            note: check.note
          },
          requiredAction: "The person must confirm or reject this relayed statement in the visible page before it counts as package verification.",
          caution: "The agent has not seen the package and no required check was cleared.",
          uiEffect: "A pending package attestation appeared in the human-evidence lane."
        });
      }
    },
    {
      name: "compare_products",
      title: "Compare live product records",
      description: "Compare two to four current records by Open Food Facts completeness, freshness, allergens, and available nutrition fields.",
      inputSchema: {
        type: "object",
        properties: {
          productIds: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            uniqueItems: true,
            items: { type: "string", maxLength: 20 },
            description: "Barcode IDs returned by the current search."
          }
        },
        required: ["productIds"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["productIds"], ["productIds"]);
        const comparison = compareProducts(currentResults(store.getState()), input.productIds);
        store.dispatch({ type: "SET_COMPARISON", comparison, actor: options.actor === "human" ? "human" : "agent" });
        return output({ ok: true, compared: comparison, uiEffect: "The comparison table is visible." });
      }
    },
    {
      name: "stage_verified_choice",
      title: "Stage a package record",
      description: "Stage one live record for human review, expose pending attestations or confirmed mismatches, and list checks still required; this never approves it.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", minLength: 8, maxLength: 20, description: "Barcode ID from the current live result set." },
          rationale: { type: "string", maxLength: 220, description: "Why this record fits the person's stated dietary or package-identification task, including uncertainty." }
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
        return output({
          ok: true,
          choice,
          approval: choice.status === "record_mismatch"
            ? "Blocked. A confirmed package attestation conflicts with the community record."
            : "Not granted. Only the visible human control can approve after required attestations are confirmed.",
          uiEffect: "The staged record, pending attestations, and verification outcome are visible."
        });
      }
    },
    {
      name: "request_human_decision",
      title: "Request a human decision",
      description: "Open the visible review checkpoint for the staged record; this tool cannot confirm an attestation or approve the record.",
      inputSchema: {
        type: "object",
        properties: {
          reason: { type: "string", minLength: 4, maxLength: 180, description: "Why package verification or personal judgment is needed now." }
        },
        required: ["reason"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["reason"], ["reason"]);
        if (typeof input.reason !== "string") throw new Error("reason must be a string.");
        if (!store.getState().stagedChoice) throw new Error("Stage a record before requesting a decision.");
        const reason = sanitizeText(input.reason, 180);
        store.dispatch({ type: "REQUEST_DECISION", reason, actor: "agent" });
        onDecisionRequested(reason);
        return output({
          ok: true,
          checkpoint: "opened",
          authority: "Human retained; no attestation was confirmed and no record was approved.",
          reason
        });
      }
    },
    {
      name: "get_workspace_snapshot",
      title: "Read the shared workspace",
      description: "Read a compact snapshot of the live results, pending or confirmed package attestations, staged record, mismatch verdict, and approval state.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, []);
        return output({ ok: true, ...compactSnapshot(store.getState()) });
      }
    },
    {
      name: "get_approved_choice",
      title: "Read the verified label summary",
      description: "After visible human approval, return a provenance-rich package summary for continued ingredient, allergen, or dietary-screening assistance.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, []);
        const summary = buildVerifiedLabelSummary(store.getState());
        return output(summary
          ? { ok: true, approved: true, verifiedLabelSummary: summary, uiEffect: "The same verified summary is visible in the page." }
          : { ok: true, approved: false, message: "No human-approved package record exists." });
      }
    }
  ];
  return tools;
}
