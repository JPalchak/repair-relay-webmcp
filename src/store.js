import { approveChoice } from "./engine.js";

export function createInitialState() {
  return {
    search: null,
    searchStatus: "idle",
    searchError: "",
    checks: [],
    comparison: [],
    stagedChoice: null,
    approvedChoice: null,
    decisionRequest: null,
    activity: [{ id: "start", actor: "system", action: "Workspace opened", detail: "Ready for a live catalog search.", at: new Date().toISOString() }]
  };
}

function log(actor, action, detail) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, actor, action, detail, at: new Date().toISOString() };
}

export function reducer(state, event) {
  switch (event.type) {
    case "SEARCH_STARTED":
      return { ...state, searchStatus: "loading", searchError: "" };
    case "SEARCH_SUCCEEDED":
      return {
        ...state,
        search: event.search,
        searchStatus: "ready",
        searchError: "",
        comparison: [],
        stagedChoice: null,
        approvedChoice: null,
        activity: [log(event.actor, "Live catalog loaded", `${event.search.results.length} records for “${event.search.query}” from ${event.search.source}.`), ...state.activity].slice(0, 20)
      };
    case "SEARCH_FAILED":
      return {
        ...state,
        searchStatus: "error",
        searchError: event.message,
        activity: [log(event.actor, "Live search failed", event.message), ...state.activity].slice(0, 20)
      };
    case "ADD_CHECK": {
      const remaining = state.stagedChoice?.productId === event.check.productId && event.check.outcome === "match" && event.check.source === "human"
        ? state.stagedChoice.requiredChecks.filter((type) => type !== event.check.checkType)
        : state.stagedChoice?.requiredChecks;
      return {
        ...state,
        checks: [...state.checks, event.check].slice(-20),
        stagedChoice: state.stagedChoice ? { ...state.stagedChoice, requiredChecks: remaining ?? state.stagedChoice.requiredChecks } : null,
        activity: [log(event.actor, "Package check recorded", `${event.check.checkType}: ${event.check.outcome}.`), ...state.activity].slice(0, 20)
      };
    }
    case "SET_COMPARISON":
      return { ...state, comparison: event.comparison, activity: [log(event.actor, "Products compared", event.comparison.map((p) => p.name).join(" vs ")), ...state.activity].slice(0, 20) };
    case "CLEAR_COMPARISON":
      return { ...state, comparison: [] };
    case "STAGE_CHOICE":
      return { ...state, stagedChoice: event.choice, approvedChoice: null, activity: [log(event.actor, "Choice staged", `${event.choice.name} — not approved.`), ...state.activity].slice(0, 20) };
    case "REQUEST_DECISION":
      return { ...state, decisionRequest: { reason: event.reason, actor: event.actor, at: new Date().toISOString() }, activity: [log(event.actor, "Human decision requested", event.reason), ...state.activity].slice(0, 20) };
    case "CLEAR_DECISION_REQUEST":
      return { ...state, decisionRequest: null };
    case "APPROVE_CHOICE": {
      const approved = approveChoice(state.stagedChoice, event.authorization);
      return { ...state, stagedChoice: approved, approvedChoice: approved, decisionRequest: null, activity: [log("human", "Choice approved", `${approved.name}; visible physical-label checks completed.`), ...state.activity].slice(0, 20) };
    }
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
