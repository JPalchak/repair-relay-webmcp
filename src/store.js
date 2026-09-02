import { approvePlan, computeCaseConfidence } from "./engine.js";

export function createInitialState() {
  return {
    caseId: "case-ap200-airflow",
    title: "AirPure AP-200 has weak airflow",
    device: {
      maker: "AirPure",
      model: "AP-200",
      voltage: 120,
      dimensionsMm: { width: 315, height: 205, depth: 36 }
    },
    constraints: {
      budget: 65,
      maxRisk: "low"
    },
    evidence: [
      {
        id: "ev-initial-1",
        text: "The fan starts and sounds normal, but outlet airflow is weak.",
        tag: "fan_running",
        confidence: 0.85,
        source: "human",
        recordedAt: "2026-09-01T13:00:00.000Z"
      },
      {
        id: "ev-initial-2",
        text: "No electrical odor or intermittent power was noticed.",
        tag: "low_airflow",
        confidence: 0.7,
        source: "human",
        recordedAt: "2026-09-01T13:01:00.000Z"
      }
    ],
    search: null,
    comparison: [],
    stagedPlan: null,
    approvedPlan: null,
    decisionRequest: null,
    luna: null,
    activity: [
      {
        id: "activity-initial",
        actor: "system",
        action: "Case opened",
        detail: "Shared repair state is ready.",
        at: "2026-09-01T13:02:00.000Z"
      }
    ]
  };
}

function activity(actor, action, detail) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor,
    action,
    detail,
    at: new Date().toISOString()
  };
}

export function reducer(state, event) {
  switch (event.type) {
    case "ADD_EVIDENCE": {
      const duplicate = state.evidence.some(
        (item) => item.tag === event.observation.tag && item.text.toLowerCase() === event.observation.text.toLowerCase()
      );
      if (duplicate) return state;
      return {
        ...state,
        evidence: [...state.evidence, event.observation].slice(-20),
        activity: [
          activity(event.actor, "Evidence recorded", `${event.observation.tag}: ${event.observation.text}`),
          ...state.activity
        ].slice(0, 24)
      };
    }

    case "SET_SEARCH":
      return {
        ...state,
        search: event.search,
        comparison: [],
        activity: [
          activity(event.actor, "Catalog ranked", `${event.search.results.length} bounded results for ${event.search.model}.`),
          ...state.activity
        ].slice(0, 24)
      };

    case "SET_COMPARISON":
      return {
        ...state,
        comparison: event.comparison,
        activity: [
          activity(event.actor, "Options compared", event.comparison.map((item) => item.name).join(" versus ")),
          ...state.activity
        ].slice(0, 24)
      };

    case "CLEAR_COMPARISON":
      return { ...state, comparison: [] };

    case "STAGE_PLAN":
      return {
        ...state,
        stagedPlan: event.plan,
        approvedPlan: null,
        decisionRequest: null,
        activity: [
          activity(event.actor, "Plan staged", `${event.plan.title} — not approved.`),
          ...state.activity
        ].slice(0, 24)
      };

    case "REQUEST_DECISION":
      return {
        ...state,
        decisionRequest: {
          reason: event.reason,
          requestedAt: new Date().toISOString(),
          actor: event.actor
        },
        activity: [
          activity(event.actor, "Human checkpoint requested", event.reason),
          ...state.activity
        ].slice(0, 24)
      };

    case "CLEAR_DECISION_REQUEST":
      return { ...state, decisionRequest: null };

    case "APPROVE_PLAN": {
      const approved = approvePlan(state.stagedPlan, event.authorization);
      return {
        ...state,
        stagedPlan: approved,
        approvedPlan: approved,
        decisionRequest: null,
        activity: [
          activity("human", "Plan approved", `${approved.title} — approval recorded in the visible UI.`),
          ...state.activity
        ].slice(0, 24)
      };
    }

    case "SET_LUNA":
      return {
        ...state,
        luna: event.review,
        activity: event.log
          ? [
              activity("luna", "Collaboration reviewed", `${event.review.score}/30; ${event.review.suggestions.length} suggestion(s).`),
              ...state.activity
            ].slice(0, 24)
          : state.activity
      };

    case "RESET":
      return createInitialState();

    default:
      return state;
  }
}

export function createStore(initialState = createInitialState()) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    dispatch(event) {
      state = reducer(state, event);
      for (const listener of listeners) listener(state, event);
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    confidence() {
      return computeCaseConfidence(state);
    }
  };
}
