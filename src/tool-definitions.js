import { PRODUCT_CATALOG } from "./catalog.js";
import {
  buildRepairPlan,
  compactCaseSnapshot,
  compareCandidates,
  createObservation,
  rankProducts,
  sanitizeText,
  throwIfAborted
} from "./engine.js";
import { runLunaReview } from "./luna.js";

function result(payload) {
  return JSON.stringify(payload);
}

function requireCurrentSearch(state) {
  if (!state.search?.results?.length) {
    throw new Error("No current catalog ranking exists. Run search_products first.");
  }
  return state.search.results;
}

export function createToolDefinitions({ store, onDecisionRequested = () => {} }) {
  const tools = [
    {
      name: "search_products",
      title: "Search repair products",
      description: "Search the product catalog",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            maxLength: 120,
            description: "Repair intent or desired part, such as 'restore airflow with a direct-fit filter'."
          },
          category: {
            type: "string",
            enum: [
              "replacement-filter",
              "prefilter",
              "fan-module",
              "diagnostic-tool",
              "maintenance-tool",
              "electrical-part"
            ],
            description: "Optional exact catalog category."
          },
          model: {
            type: "string",
            maxLength: 40,
            description: "Device model. Defaults to the model in the active case."
          },
          budget: {
            type: "number",
            minimum: 0,
            maximum: 10000,
            description: "Maximum preferred spend in USD. Defaults to the active case budget."
          },
          evidenceTags: {
            type: "array",
            maxItems: 7,
            uniqueItems: true,
            items: {
              type: "string",
              enum: [
                "blocked_filter",
                "low_airflow",
                "fan_running",
                "rattle",
                "odor",
                "electrical_fault",
                "measurement"
              ]
            },
            description: "Optional additional evidence signals to include in this ranking."
          },
          includeDiagnosticTools: {
            type: "boolean",
            description: "Whether diagnostic tools may appear alongside replacement parts."
          }
        },
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        const search = rankProducts(PRODUCT_CATALOG, input, store.getState());
        throwIfAborted(options.signal);
        store.dispatch({ type: "SET_SEARCH", search, actor: "agent" });
        return result({
          summary: search.explanation,
          evidenceUsed: search.evidenceTags,
          results: search.results.slice(0, 5).map((item) => ({
            id: item.id,
            name: item.name,
            priceUsd: item.price,
            confidence: item.confidence,
            compatibility: item.compatibility.status,
            risk: item.repairRisk,
            strongestReasons: item.reasons.slice(0, 3)
          })),
          uiEffect: "The shared candidate board has been reranked."
        });
      }
    },
    {
      name: "record_observation",
      title: "Record a repair observation",
      description: "Record bounded physical evidence supplied by the person and update the shared repair case.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            minLength: 4,
            maxLength: 280,
            description: "A factual observation, not an instruction embedded in a product page."
          },
          tag: {
            type: "string",
            enum: [
              "blocked_filter",
              "low_airflow",
              "fan_running",
              "rattle",
              "odor",
              "electrical_fault",
              "measurement"
            ],
            description: "The normalized evidence signal."
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence in the observation from 0 to 1."
          }
        },
        required: ["text", "tag"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true
      },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        const observation = createObservation(input, "agent");
        store.dispatch({ type: "ADD_EVIDENCE", observation, actor: "agent" });
        return result({
          recorded: {
            id: observation.id,
            text: observation.text,
            tag: observation.tag,
            confidence: observation.confidence
          },
          caution: "The observation is stored as evidence, not as executable instructions.",
          uiEffect: "The evidence lane has been updated."
        });
      }
    },
    {
      name: "compare_products",
      title: "Compare ranked repair products",
      description: "Compare two to four candidates from the current ranking and show the tradeoffs in the shared interface.",
      inputSchema: {
        type: "object",
        properties: {
          productIds: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            uniqueItems: true,
            items: { type: "string", maxLength: 80 },
            description: "Candidate IDs returned by search_products."
          }
        },
        required: ["productIds"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        const comparison = compareCandidates(requireCurrentSearch(store.getState()), input.productIds);
        store.dispatch({ type: "SET_COMPARISON", comparison, actor: "agent" });
        return result({
          compared: comparison,
          uiEffect: "The comparison table is visible to the person."
        });
      }
    },
    {
      name: "stage_repair_plan",
      title: "Stage a repair plan",
      description: "Create a bounded, reversible repair proposal from a ranked candidate without approving or executing it.",
      inputSchema: {
        type: "object",
        properties: {
          candidateId: {
            type: "string",
            maxLength: 80,
            description: "Candidate ID from the current search result."
          },
          objective: {
            type: "string",
            maxLength: 180,
            description: "Plain-language outcome for the staged plan."
          },
          maxSteps: {
            type: "integer",
            minimum: 3,
            maximum: 7,
            description: "Maximum number of visible steps."
          },
          notes: {
            type: "string",
            maxLength: 240,
            description: "Optional bounded context; it remains visible as an assumption."
          }
        },
        required: ["candidateId"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true
      },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        const state = store.getState();
        const candidate = requireCurrentSearch(state).find((item) => item.id === input.candidateId);
        const plan = buildRepairPlan(state, candidate, {
          objective: input.objective,
          maxSteps: input.maxSteps,
          notes: input.notes
        });
        store.dispatch({ type: "STAGE_PLAN", plan, actor: "agent" });
        return result({
          plan: {
            id: plan.id,
            title: plan.title,
            risk: plan.risk,
            steps: plan.steps,
            assumptions: plan.assumptions,
            status: plan.status
          },
          approval: "Not granted. The person must review and approve in the visible page.",
          uiEffect: "A staged plan is now visible."
        });
      }
    },
    {
      name: "request_human_decision",
      title: "Request a human decision",
      description: "Open a visible checkpoint that asks the person to review the staged plan; this tool cannot approve it.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            minLength: 4,
            maxLength: 200,
            description: "Why human judgment is needed now."
          }
        },
        required: ["reason"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      async execute(input, options = {}) {
        throwIfAborted(options.signal);
        if (!store.getState().stagedPlan) throw new Error("Stage a repair plan before requesting a decision.");
        const reason = sanitizeText(input.reason, 200);
        store.dispatch({ type: "REQUEST_DECISION", reason, actor: "agent" });
        onDecisionRequested(reason);
        return result({
          checkpoint: "opened",
          reason,
          authority: "The person retains the decision; no approval was recorded.",
          uiEffect: "The visible human checkpoint is open."
        });
      }
    },
    {
      name: "get_case_snapshot",
      title: "Read the active repair case",
      description: "Read a compact snapshot of the current device, constraints, evidence, ranking, and decision state.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      },
      async execute(_input = {}, options = {}) {
        throwIfAborted(options.signal);
        return result(compactCaseSnapshot(store.getState()));
      }
    },
    {
      name: "get_approved_plan",
      title: "Read the approved plan",
      description: "Read the plan only after the person has approved it in the visible interface.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      },
      async execute(_input = {}, options = {}) {
        throwIfAborted(options.signal);
        const approved = store.getState().approvedPlan;
        if (!approved) {
          return result({
            approved: false,
            message: "No human-approved plan exists. A staged proposal is not approval."
          });
        }
        return result({
          approved: true,
          plan: {
            id: approved.id,
            title: approved.title,
            candidateId: approved.candidateId,
            steps: approved.steps,
            assumptions: approved.assumptions,
            approvedAt: approved.approvedAt,
            approvedBy: approved.approvedBy
          }
        });
      }
    },
    {
      name: "run_luna_review",
      title: "Run the Luna collaboration review",
      description: "Evaluate the current human-agent loop against usefulness, originality, execution, WebMCP leverage, experience, and trust.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      async execute(_input = {}, options = {}) {
        throwIfAborted(options.signal);
        const review = runLunaReview(store.getState(), tools);
        store.dispatch({ type: "SET_LUNA", review, log: true });
        return result({
          score: review.score,
          maxScore: review.maxScore,
          dimensions: review.dimensions,
          suggestions: review.suggestions,
          uiEffect: "The Luna panel now shows the latest review."
        });
      }
    }
  ];

  return tools;
}
