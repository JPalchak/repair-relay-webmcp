import {
  approveChoice,
  confirmRelayedPackageCheck,
  reconcileChoice,
  rejectRelayedPackageCheck
} from "./engine.js";

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
    activity: [
      {
        id: "start",
        actor: "system",
        action: "Workspace opened",
        detail: "Ready for a live catalog or barcode lookup.",
        at: new Date().toISOString()
      }
    ]
  };
}

function log(actor, action, detail) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor,
    action,
    detail,
    at: new Date().toISOString()
  };
}

function replaceCheck(checks, replacement) {
  return checks.map((check) => (check.id === replacement.id ? replacement : check));
}

function updateChoiceAfterEvidence(state, checks, detail) {
  const hadApproval = Boolean(state.approvedChoice);
  const stagedChoice = reconcileChoice(state.stagedChoice, checks, { invalidateApproval: hadApproval });
  const activity = hadApproval
    ? [
        log("system", "Prior approval withdrawn", "New or newly confirmed package evidence requires another human review."),
        detail,
        ...state.activity
      ]
    : [detail, ...state.activity];
  return {
    ...state,
    checks,
    stagedChoice,
    approvedChoice: hadApproval ? null : state.approvedChoice,
    decisionRequest: hadApproval ? null : state.decisionRequest,
    activity: activity.slice(0, 24)
  };
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
        decisionRequest: null,
        activity: [
          log(event.actor, "Live catalog loaded", `${event.search.results.length} records for “${event.search.query}” from ${event.search.source}.`),
          ...state.activity
        ].slice(0, 24)
      };
    case "SEARCH_FAILED":
      return {
        ...state,
        searchStatus: "error",
        searchError: event.message,
        activity: [log(event.actor, "Live search failed", event.message), ...state.activity].slice(0, 24)
      };
    case "ADD_CHECK": {
      const detail = log(
        event.actor,
        event.check.confirmationStatus === "pending_human_confirmation" ? "Package attestation relayed" : "Package attestation recorded",
        `${event.check.checkType}: ${event.check.outcome}${event.check.confirmationStatus === "pending_human_confirmation" ? "; awaiting human confirmation." : "."}`
      );
      return updateChoiceAfterEvidence(state, [...state.checks, event.check].slice(-24), detail);
    }
    case "CONFIRM_CHECK": {
      const current = state.checks.find((check) => check.id === event.checkId);
      const confirmed = confirmRelayedPackageCheck(current, event.authorization);
      const detail = log("human", "Relayed attestation confirmed", `${confirmed.checkType}: ${confirmed.outcome}.`);
      return updateChoiceAfterEvidence(state, replaceCheck(state.checks, confirmed), detail);
    }
    case "REJECT_CHECK": {
      const current = state.checks.find((check) => check.id === event.checkId);
      const rejected = rejectRelayedPackageCheck(current, event.authorization);
      const checks = replaceCheck(state.checks, rejected);
      return {
        ...state,
        checks,
        stagedChoice: reconcileChoice(state.stagedChoice, checks),
        activity: [log("human", "Relayed attestation rejected", `${rejected.checkType}; the statement was not accepted as package evidence.`), ...state.activity].slice(0, 24)
      };
    }
    case "SET_COMPARISON":
      return {
        ...state,
        comparison: event.comparison,
        activity: [log(event.actor, "Products compared", event.comparison.map((product) => product.name).join(" vs ")), ...state.activity].slice(0, 24)
      };
    case "CLEAR_COMPARISON":
      return { ...state, comparison: [] };
    case "STAGE_CHOICE":
      return {
        ...state,
        stagedChoice: event.choice,
        approvedChoice: null,
        decisionRequest: null,
        activity: [log(event.actor, "Choice staged", `${event.choice.name} — ${event.choice.status === "record_mismatch" ? "confirmed mismatch blocks approval" : "not approved"}.`), ...state.activity].slice(0, 24)
      };
    case "REQUEST_DECISION":
      return {
        ...state,
        decisionRequest: { reason: event.reason, actor: event.actor, at: new Date().toISOString() },
        activity: [log(event.actor, "Human decision requested", event.reason), ...state.activity].slice(0, 24)
      };
    case "CLEAR_DECISION_REQUEST":
      return { ...state, decisionRequest: null };
    case "APPROVE_CHOICE": {
      const approved = approveChoice(state.stagedChoice, event.authorization);
      return {
        ...state,
        stagedChoice: approved,
        approvedChoice: approved,
        decisionRequest: null,
        activity: [
          log("human", "Verified label summary unlocked", `${approved.name}; confirmed attestations now support a source-backed ingredient and dietary-screening summary.`),
          ...state.activity
        ].slice(0, 24)
      };
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
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
