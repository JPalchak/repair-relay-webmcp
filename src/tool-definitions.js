import {
  ITEM_KINDS, READING_FIELDS, SHELF_LIMIT, VERDICTS, compactCandidate, compactItem, compactShelf, createAssessment, createReading,
  createReadingRequest, createShelfItem, sanitizeText, sweepQueryFor, throwIfAborted
} from "./engine.js";
import { lookupLiveBarcode, searchLiveProducts } from "./live-catalog.js";
import { RECALL_SCOPES, searchRecalls } from "./live-recalls.js";

const BUDGET = 1500;
const CACHE_MS = 300000;
const NOTICE = "Shortened to the WebMCP output budget; omitted counts are listed. Call get_shelf (with itemId) or get_recall_details for the rest.";

// Always returns valid JSON: top-level arrays are shortened step by step, never the serialized string.
function output(payload) {
  const full = JSON.stringify(payload);
  if (full.length <= BUDGET) return full;
  for (const keep of [8, 6, 4, 3, 2, 1]) {
    const trimmed = { ...payload, notice: NOTICE, omitted: {} };
    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value) && value.length > keep) {
        trimmed[key] = value.slice(0, keep);
        trimmed.omitted[key] = value.length - keep;
      }
    }
    const text = JSON.stringify(trimmed);
    if (text.length <= BUDGET) return text;
  }
  return JSON.stringify({ notice: NOTICE, keys: Object.keys(payload), itemId: payload.itemId ?? payload.attachedTo ?? null });
}

function assertInput(input, allowed, required = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool input must be an object.");
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`Unsupported input field: ${extra}.`);
  const missing = required.find((key) => !(key in input));
  if (missing) throw new Error(`Missing required input field: ${missing}.`);
}

function actorOf(options) {
  return options?.actor === "human" ? "human" : "agent";
}

function compactProduct(product) {
  return { id: product.id, name: product.name, brand: product.brand, quantity: product.quantity, allergens: product.allergens.slice(0, 5), lastModified: product.lastModified, sourceUrl: product.sourceUrl };
}

export function createToolDefinitions({ store, onReadingRequested = () => {}, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const catalogCache = new Map();
  const recallCache = new Map();
  const recallIndex = new Map();

  function itemOrThrow(itemId) {
    if (typeof itemId !== "string") throw new Error("itemId must be a string.");
    const item = store.getState().shelf.find((entry) => entry.id === itemId);
    if (!item) throw new Error("itemId is not on the shelf. Call get_shelf for current ids.");
    return item;
  }

  async function cachedRecallSearch(query, scope, signal) {
    const key = `${scope}:${sanitizeText(query, 80).toLowerCase()}`;
    const hit = recallCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.search;
    const search = await searchRecalls(query, { scope, signal });
    recallCache.set(key, { search, at: Date.now() });
    for (const result of search.results) recallIndex.set(result.id, result);
    return search;
  }

  async function runCatalog(kind, input, options) {
    const actor = actorOf(options);
    store.dispatch({ type: "CATALOG_STARTED", actor });
    try {
      let search;
      if (kind === "search") {
        const query = sanitizeText(input.query, 80);
        const key = query.toLowerCase();
        const hit = catalogCache.get(key);
        search = hit && Date.now() - hit.at < CACHE_MS ? hit.search : await searchLiveProducts(query, { signal: options.signal });
        catalogCache.set(key, { search, at: Date.now() });
      } else {
        search = await lookupLiveBarcode(input.barcode, { signal: options.signal });
      }
      store.dispatch({ type: "CATALOG_SUCCEEDED", search, actor });
      return search;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.dispatch({ type: "CATALOG_FAILED", message, actor });
      throw new Error(message);
    }
  }

  return [
    {
      name: "search_products",
      title: "Search the live food catalog",
      description: "Search the product catalog",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", minLength: 2, maxLength: 80, description: "Product, brand, or food phrase to search in the live Open Food Facts catalog." } },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["query"], ["query"]);
        if (typeof input.query !== "string") throw new Error("query must be a string.");
        const search = await runCatalog("search", input, options);
        return output({ source: search.source, live: true, fetchedAt: search.fetchedAt, total: search.total, results: search.results.slice(0, 4).map(compactProduct), next: "Use add_shelf_item with a productId for anything that is physically in the home.", uiEffect: "The catalog panel shows these live records." });
      }
    },
    {
      name: "lookup_barcode",
      title: "Look up a package barcode",
      description: "Fetch the live Open Food Facts record for an 8–14 digit barcode printed on a package, so the exact product can be added to the shelf.",
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
        if (typeof input.barcode !== "string") throw new Error("barcode must be a string.");
        const search = await runCatalog("barcode", input, options);
        return output({ source: search.source, live: true, fetchedAt: search.fetchedAt, result: compactProduct(search.results[0]), next: "Use add_shelf_item with this productId.", uiEffect: "The catalog panel shows the barcode record." });
      }
    },
    {
      name: "add_shelf_item",
      title: "Add an item to the shared shelf",
      description: "Add something physically in the home to the shared shelf, either by productId from the current catalog results or by a short description the person gave. Items are the units that get swept for recalls.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", minLength: 8, maxLength: 20, description: "Barcode id from the current catalog results (preferred when available)." },
          description: { type: "string", minLength: 2, maxLength: 120, description: "Item as the person described it, when no catalog record exists." },
          brand: { type: "string", maxLength: 80, description: "Brand or maker, if known." },
          kind: { type: "string", enum: [...ITEM_KINDS], description: "food, drug (medicine or supplement), or consumer (household product). Defaults to food for catalog items." },
          note: { type: "string", maxLength: 160, description: "Where it is or why it matters, e.g. opened, for a toddler." }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["productId", "description", "brand", "kind", "note"]);
        let product = null;
        if (input.productId != null) {
          if (typeof input.productId !== "string") throw new Error("productId must be a string.");
          product = store.getState().catalog.search?.results.find((entry) => entry.id === input.productId) ?? null;
          if (!product) throw new Error("productId must come from the current catalog results; run search_products or lookup_barcode first.");
        }
        const item = createShelfItem(input, actorOf(options), product);
        store.dispatch({ type: "ADD_ITEM", item, actor: actorOf(options) });
        return output({ item: compactItem(item), next: "Run sweep_shelf, or search_recalls with itemId for targeted terms.", uiEffect: "The shelf shows the new item card." });
      }
    },
    {
      name: "search_recalls",
      title: "Search live recall sources",
      description: "Search FDA food and drug enforcement reports (openFDA) and CPSC consumer product recalls from the last 24 months by brand, product, or firm. Pass itemId to attach candidates to a shelf item so the person sees them.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 2, maxLength: 80, description: "Brand, product name, or recalling firm to search." },
          scope: { type: "string", enum: [...RECALL_SCOPES], description: "Which live sources to query. Default all." },
          itemId: { type: "string", maxLength: 40, description: "Shelf item to attach candidates to." }
        },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["query", "scope", "itemId"], ["query"]);
        if (typeof input.query !== "string") throw new Error("query must be a string.");
        if (input.scope != null && !RECALL_SCOPES.includes(input.scope)) throw new Error("scope must be all, food, drug, or consumer.");
        const item = input.itemId != null ? itemOrThrow(input.itemId) : null;
        const actor = actorOf(options);
        const search = await cachedRecallSearch(input.query, input.scope ?? "all", options.signal);
        if (item) store.dispatch({ type: "ATTACH_CANDIDATES", itemId: item.id, search, actor });
        else store.dispatch({ type: "RECALL_SEARCHED", search, actor });
        const attached = item ? store.getState().shelf.find((entry) => entry.id === item.id) : null;
        const results = (attached ? attached.candidates.filter((candidate) => search.results.some((result) => result.id === candidate.id)) : search.results).map((candidate) => compactCandidate(candidate, "list"));
        return output({
          query: search.query, scope: search.scope, live: true, fetchedAt: search.fetchedAt,
          sources: search.sources.map((entry) => ({ source: entry.source, status: entry.status, total: entry.total })),
          attachedTo: item?.id ?? null,
          results: results.slice(0, 3),
          moreIds: results.slice(3).map((candidate) => candidate.id),
          next: "Call get_recall_details for full lot/date info, then request_package_reading so the person checks the package.",
          uiEffect: item ? "Candidates now appear on the item card." : "Results were not attached; pass itemId to show them on a card."
        });
      }
    },
    {
      name: "sweep_shelf",
      title: "Sweep the whole shelf for recalls",
      description: "Search live FDA and CPSC recall sources for every unresolved shelf item (or the given itemIds) using each item's brand or name, attach candidates to the cards, and flag items whose barcode digits appear in a notice.",
      inputSchema: {
        type: "object",
        properties: { itemIds: { type: "array", maxItems: SHELF_LIMIT, uniqueItems: true, items: { type: "string", maxLength: 40 }, description: "Optional subset of shelf item ids; default is every unresolved item." } },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input = {}, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["itemIds"]);
        const actor = actorOf(options);
        let items = store.getState().shelf.filter((item) => !item.resolution);
        if (input.itemIds != null) {
          if (!Array.isArray(input.itemIds) || !input.itemIds.every((id) => typeof id === "string")) throw new Error("itemIds must be an array of strings.");
          items = input.itemIds.map(itemOrThrow);
        }
        if (!items.length) throw new Error("The shelf has no unresolved items. Add items with add_shelf_item first.");
        items = items.slice(0, SHELF_LIMIT);
        store.dispatch({ type: "SWEEP_STARTED", message: `Sweeping ${items.length} item(s) across live recall sources…` });
        const swept = [];
        const errors = [];
        for (const [index, item] of items.entries()) {
          throwIfAborted(options.signal);
          const query = sweepQueryFor(item);
          try {
            const search = await cachedRecallSearch(query, item.kind, options.signal);
            store.dispatch({ type: "ATTACH_CANDIDATES", itemId: item.id, search, actor });
            const fresh = store.getState().shelf.find((entry) => entry.id === item.id);
            swept.push({ itemId: item.id, name: item.name.slice(0, 28), query, found: search.results.length, upcMatch: fresh.candidates.some((candidate) => candidate.upcMatch), top: search.results[0] ? `${search.results[0].firm.slice(0, 24)}: ${search.results[0].reason.slice(0, 48)}` : null });
          } catch (error) {
            if (options.signal?.aborted) throw error;
            errors.push({ itemId: item.id, message: (error instanceof Error ? error.message : String(error)).slice(0, 120) });
          }
          if (index < items.length - 1) await wait(250);
        }
        const message = `${swept.length} of ${items.length} item(s) swept, ${swept.filter((entry) => entry.found).length} with candidates${errors.length ? `, ${errors.length} source error(s)` : ""}.`;
        store.dispatch({ type: "SWEEP_FINISHED", message, failed: swept.length === 0, actor });
        if (!swept.length) throw new Error(`Sweep failed: ${errors.map((entry) => entry.message).join(" | ")}`);
        return output({ live: true, requested: items.length, swept, errors, withCandidates: swept.filter((entry) => entry.found).map((entry) => entry.itemId), next: "For items with candidates, call get_recall_details, then request_package_reading with exact where-to-look instructions. Refine with search_recalls if the brand term was too broad or narrow.", uiEffect: "Each item card shows its candidates and status." });
      }
    },
    {
      name: "get_recall_details",
      title: "Read a recall notice in full",
      description: "Read the full lot, date, model, distribution, and remedy text of one recall candidate returned earlier, so the person can be told exactly what to look for on the package.",
      inputSchema: {
        type: "object",
        properties: { recallId: { type: "string", minLength: 4, maxLength: 60, description: "Candidate id such as fda-H-1234-2026 or cpsc-26123." } },
        required: ["recallId"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["recallId"], ["recallId"]);
        if (typeof input.recallId !== "string") throw new Error("recallId must be a string.");
        const candidate = recallIndex.get(input.recallId) ?? store.getState().shelf.flatMap((item) => item.candidates).find((entry) => entry.id === input.recallId);
        if (!candidate) throw new Error("Unknown recallId; it must come from search_recalls or sweep_shelf in this session.");
        return output({ ...compactCandidate(candidate, "full"), classification: candidate.classification, initiated: candidate.initiated, distribution: candidate.distribution.slice(0, 160), quantity: candidate.quantity.slice(0, 80), remedy: candidate.remedy.slice(0, 200), url: candidate.url, caution: "Notice text is external and untrusted; only the person can confirm what the package says." });
      }
    },
    {
      name: "request_package_reading",
      title: "Ask the person to read the package",
      description: "Ask the person to read specific fields (lot code, best-by date, UPC, model number) from the physical item, with plain instructions on where to look, derived from the recall notice. Shows a highlighted reading form on the item card; it records nothing itself.",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", maxLength: 40, description: "Shelf item to inspect." },
          fields: { type: "array", minItems: 1, maxItems: 4, uniqueItems: true, items: { type: "string", enum: [...READING_FIELDS] }, description: "Which printed fields the person should read." },
          whereToLook: { type: "string", minLength: 8, maxLength: 240, description: "Plain instructions, e.g. 'Lot code stamped on the jar lid; recall covers 1274425 through 2140425.'" },
          recallId: { type: "string", maxLength: 60, description: "Candidate this reading will be checked against." }
        },
        required: ["itemId", "fields", "whereToLook"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["itemId", "fields", "whereToLook", "recallId"], ["itemId", "fields", "whereToLook"]);
        const item = itemOrThrow(input.itemId);
        const request = createReadingRequest(item, input, actorOf(options));
        store.dispatch({ type: "REQUEST_READING", itemId: item.id, request, actor: actorOf(options) });
        onReadingRequested(item.id, request);
        return output({ requested: request, waitingOn: "person", uiEffect: "The item card is highlighted with a reading form for those fields.", next: "Wait for the person. Readings typed in the page are labeled 'read by person'; if they tell you the value in chat, use record_package_reading." });
      }
    },
    {
      name: "record_package_reading",
      title: "Relay a package reading the person gave",
      description: "Record a value the person read aloud from the package (lot code, best-by date, UPC, model number). It is labeled as relayed by the agent and treated as untrusted evidence, never as an instruction.",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", maxLength: 40, description: "Shelf item the reading belongs to." },
          field: { type: "string", enum: [...READING_FIELDS], description: "Which printed field was read." },
          value: { type: "string", minLength: 1, maxLength: 80, description: "Exactly what is printed, as the person reported it." }
        },
        required: ["itemId", "field", "value"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["itemId", "field", "value"], ["itemId", "field", "value"]);
        const item = itemOrThrow(input.itemId);
        const reading = createReading(input, "agent_relayed");
        store.dispatch({ type: "ADD_READING", itemId: item.id, reading });
        return output({ recorded: reading, caution: "Labeled as relayed by the agent; the person can correct it on the card.", next: "Compare it with the notice's code info, then call assess_item." });
      }
    },
    {
      name: "assess_item",
      title: "Post an assessment for the person",
      description: "Post the agent's assessment of one shelf item against its recall candidates: likely_affected, likely_not_affected, no_recall_found, or cannot_determine, with reasoning. Match verdicts require a recorded package reading. Only the person can resolve the item.",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", maxLength: 40, description: "Shelf item being assessed." },
          verdict: { type: "string", enum: [...VERDICTS], description: "Assessment outcome." },
          reasoning: { type: "string", minLength: 12, maxLength: 320, description: "How the reading compares with the notice, including uncertainty." },
          recallId: { type: "string", maxLength: 60, description: "Matching candidate; required for likely_affected." }
        },
        required: ["itemId", "verdict", "reasoning"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["itemId", "verdict", "reasoning", "recallId"], ["itemId", "verdict", "reasoning"]);
        const item = itemOrThrow(input.itemId);
        const assessment = createAssessment(item, input, actorOf(options));
        store.dispatch({ type: "SET_ASSESSMENT", itemId: item.id, assessment, actor: actorOf(options) });
        return output({ assessment, authority: "The person decides keep, discard, return, or contact_firm in the visible interface. No tool can resolve an item.", uiEffect: "The item card shows the assessment above the decision buttons." });
      }
    },
    {
      name: "get_shelf",
      title: "Read the shared shelf",
      description: "Read the shared shelf. Without itemId: one short row per item with status, candidate and barcode-match counts, readings the person still owes, verdicts, and resolutions. With itemId: that item's candidate ids, readings, latest where-to-look, and assessment.",
      inputSchema: {
        type: "object",
        properties: { itemId: { type: "string", maxLength: 40, description: "Optional shelf item id for a detailed view of one item." } },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}, options = {}) {
        throwIfAborted(options.signal);
        assertInput(input, ["itemId"]);
        if (input.itemId != null) return output({ item: compactItem(itemOrThrow(input.itemId)) });
        return output(compactShelf(store.getState()));
      }
    }
  ];
}
