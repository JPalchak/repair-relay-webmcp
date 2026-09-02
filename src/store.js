import { SHELF_LIMIT, attachCandidates, createResolution, staleAssessment } from "./engine.js";

export function createInitialState() {
  return {
    catalog: { status: "idle", error: "", search: null },
    shelf: [],
    sweep: { status: "idle", message: "", at: null },
    recallMeta: {},
    highlightItemId: null,
    activity: [{ id: "start", actor: "system", action: "Workspace opened", detail: "Add what is on your shelf, then sweep live recall sources.", at: new Date().toISOString() }]
  };
}

function log(actor, action, detail) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, actor, action, detail, at: new Date().toISOString() };
}

function withLog(state, actor, action, detail) {
  return { ...state, activity: [log(actor, action, detail), ...state.activity].slice(0, 30) };
}

function updateItem(state, itemId, updater) {
  if (!state.shelf.some((item) => item.id === itemId)) throw new Error("That item is not on the shelf.");
  return { ...state, shelf: state.shelf.map((item) => (item.id === itemId ? updater(item) : item)) };
}

function mergeMeta(state, search) {
  const recallMeta = { ...state.recallMeta };
  for (const entry of search.sources) {
    recallMeta[entry.source] = { status: entry.status, lastUpdated: entry.lastUpdated ?? recallMeta[entry.source]?.lastUpdated ?? null, checkedAt: search.fetchedAt, message: entry.message };
  }
  return recallMeta;
}

export function reducer(state, event) {
  switch (event.type) {
    case "CATALOG_STARTED":
      return { ...state, catalog: { ...state.catalog, status: "loading", error: "" } };
    case "CATALOG_SUCCEEDED":
      return withLog({ ...state, catalog: { status: "ready", error: "", search: event.search } }, event.actor, "Catalog searched", `${event.search.results.length} live records for “${event.search.query}” from ${event.search.source}.`);
    case "CATALOG_FAILED":
      return withLog({ ...state, catalog: { ...state.catalog, status: "error", error: event.message } }, event.actor, "Catalog search failed", event.message);
    case "ADD_ITEM": {
      if (state.shelf.length >= SHELF_LIMIT) throw new Error(`The shelf holds at most ${SHELF_LIMIT} items per session. Resolve or remove one first.`);
      return withLog({ ...state, shelf: [...state.shelf, event.item], highlightItemId: event.item.id }, event.actor, "Item added to shelf", `${event.item.name} (${event.item.kind}).`);
    }
    case "REMOVE_ITEM": {
      const item = state.shelf.find((entry) => entry.id === event.itemId);
      if (!item) return state;
      return withLog({ ...state, shelf: state.shelf.filter((entry) => entry.id !== event.itemId) }, "human", "Item removed", item.name);
    }
    case "ATTACH_CANDIDATES": {
      let added = 0;
      const next = updateItem(state, event.itemId, (item) => {
        const attached = attachCandidates(item, event.search);
        added = attached.candidates.length - item.candidates.length;
        return added > 0 ? { ...attached, assessment: staleAssessment(attached.assessment, "New recall candidates were attached after this assessment.") } : attached;
      });
      const item = next.shelf.find((entry) => entry.id === event.itemId);
      const upc = item.candidates.filter((candidate) => candidate.upcMatch).length;
      const stale = added > 0 && item.assessment?.stale ? "; the earlier assessment is now outdated" : "";
      return withLog({ ...next, recallMeta: mergeMeta(state, event.search) }, event.actor, "Recall sources searched", `“${event.search.query}” → ${event.search.results.length} candidate(s) for ${item.name}${upc ? `; ${upc} contain this barcode` : ""}${stale}.`);
    }
    case "RECALL_SEARCHED":
      return withLog({ ...state, recallMeta: mergeMeta(state, event.search) }, event.actor, "Recall sources searched", `“${event.search.query}” → ${event.search.results.length} candidate(s), not attached to an item.`);
    case "SWEEP_STARTED":
      return { ...state, sweep: { status: "running", message: event.message ?? "Sweeping live recall sources…", at: state.sweep.at } };
    case "SWEEP_FINISHED":
      return withLog({ ...state, sweep: { status: event.failed ? "error" : "done", message: event.message, at: new Date().toISOString() } }, event.actor, "Shelf sweep finished", event.message);
    case "REQUEST_READING": {
      const next = updateItem(state, event.itemId, (item) => ({ ...item, readingRequests: [...item.readingRequests, event.request].slice(-6) }));
      return withLog({ ...next, highlightItemId: event.itemId }, event.actor, "Package reading requested", `${event.request.fields.join(", ")} — ${event.request.whereToLook}`);
    }
    case "ADD_READING": {
      const next = updateItem(state, event.itemId, (item) => ({
        ...item,
        readings: [...item.readings, event.reading].slice(-12),
        assessment: staleAssessment(item.assessment, "A new package reading was recorded after this assessment.")
      }));
      return withLog(next, event.reading.source === "human" ? "human" : "agent", "Package reading recorded", `${event.reading.field}: ${event.reading.value}${event.reading.source === "agent_relayed" ? " (relayed by agent)" : ""}`);
    }
    case "SET_ASSESSMENT": {
      const next = updateItem(state, event.itemId, (item) => ({ ...item, assessment: event.assessment }));
      return withLog({ ...next, highlightItemId: event.itemId }, event.actor, "Agent assessment posted", `${event.assessment.verdict.replaceAll("_", " ")} — awaiting the person's decision.`);
    }
    case "RESOLVE_ITEM": {
      const resolution = createResolution({ action: event.action, note: event.note }, event.authorization);
      const next = updateItem(state, event.itemId, (item) => ({ ...item, resolution }));
      const item = next.shelf.find((entry) => entry.id === event.itemId);
      return withLog(next, "human", "Item resolved by person", `${item.name}: ${resolution.action.replace("_", " ")}.`);
    }
    case "CLEAR_HIGHLIGHT":
      return { ...state, highlightItemId: null };
    case "RESET":
      return createInitialState();
    default:
      return state;
  }
}

export function createStore(initial = createInitialState()) {
  let state = structuredClone(initial);
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch(event) {
      state = reducer(state, event);
      listeners.forEach((listener) => listener(state, event));
      return state;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
