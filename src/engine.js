const MAX_OBSERVATION_LENGTH = 280;
const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 5;
const ALLOWED_RISKS = new Set(["low", "medium", "high"]);
const KNOWN_TAGS = new Set([
  "blocked_filter",
  "low_airflow",
  "fan_running",
  "rattle",
  "odor",
  "electrical_fault",
  "measurement"
]);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeText(value, maxLength = MAX_OBSERVATION_LENGTH) {
  return normalizeText(value).slice(0, maxLength);
}

export function assertPlainObject(value, label = "input") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

export function assertNoExtraKeys(input, allowedKeys) {
  const extras = Object.keys(input).filter((key) => !allowedKeys.includes(key));
  if (extras.length) {
    throw new TypeError(`Unsupported field${extras.length === 1 ? "" : "s"}: ${extras.join(", ")}`);
  }
}

export function parseSearchInput(input = {}) {
  assertPlainObject(input);
  assertNoExtraKeys(input, [
    "query",
    "category",
    "model",
    "budget",
    "evidenceTags",
    "includeDiagnosticTools"
  ]);

  for (const key of ["query", "category", "model"]) {
    if (input[key] != null && typeof input[key] !== "string") {
      throw new TypeError(`${key} must be a string.`);
    }
  }
  if (input.budget != null && typeof input.budget !== "number") {
    throw new TypeError("budget must be a number.");
  }
  if (input.evidenceTags != null) {
    if (!Array.isArray(input.evidenceTags)) {
      throw new TypeError("evidenceTags must be an array.");
    }
    if (input.evidenceTags.length > 7 || input.evidenceTags.some((tag) => typeof tag !== "string")) {
      throw new TypeError("evidenceTags must contain at most seven strings.");
    }
  }
  if (input.includeDiagnosticTools != null && typeof input.includeDiagnosticTools !== "boolean") {
    throw new TypeError("includeDiagnosticTools must be a boolean.");
  }

  const query = sanitizeText(input.query ?? "", MAX_QUERY_LENGTH);
  const category = input.category ? sanitizeText(input.category, 60) : null;
  const model = input.model ? sanitizeText(input.model, 40).toUpperCase() : null;
  const budget = input.budget == null ? null : Number(input.budget);
  const evidenceTags = Array.isArray(input.evidenceTags)
    ? [...new Set(input.evidenceTags.map((tag) => sanitizeText(tag, 40)).filter((tag) => KNOWN_TAGS.has(tag)))]
    : [];
  const includeDiagnosticTools = input.includeDiagnosticTools !== false;

  if (input.budget != null && (!Number.isFinite(budget) || budget < 0 || budget > 10000)) {
    throw new RangeError("budget must be between 0 and 10000.");
  }

  return { query, category, model, budget, evidenceTags, includeDiagnosticTools };
}

function tokens(value) {
  return new Set(normalizeText(value).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function tokenOverlap(query, product) {
  if (!query) return 0;
  const queryTokens = tokens(query);
  const productTokens = tokens(
    `${product.name} ${product.maker} ${product.category} ${product.description} ${product.notes}`
  );
  if (!queryTokens.size) return 0;
  const matches = [...queryTokens].filter((token) => productTokens.has(token)).length;
  return matches / queryTokens.size;
}

function modelCompatibility(product, model) {
  if (!model) return { points: 0, label: "model not supplied", status: "unknown" };
  if (product.compatibleModels.includes(model)) {
    return { points: 34, label: `documented for ${model}`, status: "exact" };
  }
  if (product.universal) {
    return { points: 8, label: "universal; verify fit", status: "conditional" };
  }
  return { points: -90, label: `not documented for ${model}`, status: "incompatible" };
}

function evidenceSet(caseState, requestedTags) {
  const observed = (caseState.evidence ?? [])
    .filter((item) => Number(item.confidence) >= 0.5)
    .map((item) => item.tag);
  return new Set([...observed, ...requestedTags]);
}

function reason(label, points) {
  return { label, points };
}

export function rankProducts(catalog, rawInput, caseState) {
  const input = parseSearchInput(rawInput);
  const model = input.model ?? caseState.device.model;
  const budget = input.budget ?? caseState.constraints.budget;
  const activeEvidence = evidenceSet(caseState, input.evidenceTags);

  const ranked = catalog
    .filter((product) => input.includeDiagnosticTools || product.category !== "diagnostic-tool")
    .map((product) => {
      const reasons = [];
      let score = 20;

      const compatibility = modelCompatibility(product, model);
      score += compatibility.points;
      reasons.push(reason(compatibility.label, compatibility.points));

      const overlap = tokenOverlap(input.query, product);
      if (overlap > 0) {
        const points = Math.round(overlap * 18);
        score += points;
        reasons.push(reason("query intent match", points));
      }

      if (input.category) {
        const points = product.category === input.category ? 17 : -7;
        score += points;
        reasons.push(reason(points > 0 ? "requested category" : "different category", points));
      }

      const evidenceMatches = product.resolves.filter((tag) => activeEvidence.has(tag));
      if (evidenceMatches.length) {
        const points = Math.min(32, evidenceMatches.length * 12);
        score += points;
        reasons.push(reason(`matches evidence: ${evidenceMatches.join(", ")}`, points));
      }

      if (activeEvidence.has("fan_running") && product.category === "fan-module") {
        score -= 24;
        reasons.push(reason("running fan weakens fan-failure hypothesis", -24));
      }

      if (product.diagnosticValue >= 0.8 && !activeEvidence.has("measurement")) {
        score += 10;
        reasons.push(reason("can reduce remaining uncertainty", 10));
      }

      if (budget != null) {
        if (product.price <= budget) {
          score += 8;
          reasons.push(reason("within budget", 8));
        } else {
          const penalty = Math.min(36, Math.ceil((product.price - budget) / 3));
          score -= penalty;
          reasons.push(reason(`$${product.price - budget} over budget`, -penalty));
        }
      }

      if (product.stock === "in-stock") {
        score += 5;
        reasons.push(reason("available now", 5));
      } else if (product.stock === "limited") {
        score -= 3;
        reasons.push(reason("limited stock", -3));
      }

      const riskCap = caseState.constraints.maxRisk;
      const riskOrder = { low: 0, medium: 1, high: 2 };
      if (riskOrder[product.repairRisk] > riskOrder[riskCap]) {
        score -= 45;
        reasons.push(reason(`exceeds ${riskCap}-risk limit`, -45));
      }

      const confidence = clamp(Math.round((score + 70) / 1.9), 4, 98);
      return {
        id: product.id,
        name: product.name,
        maker: product.maker,
        category: product.category,
        description: product.description,
        price: product.price,
        currency: product.currency,
        stock: product.stock,
        leadDays: product.leadDays,
        compatibility,
        repairRisk: product.repairRisk,
        warrantyMonths: product.warrantyMonths,
        notes: product.notes,
        score,
        confidence,
        evidenceMatches,
        reasons: reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 5)
      };
    })
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .slice(0, MAX_RESULTS);

  const top = ranked[0] ?? null;
  const evidenceSummary = [...activeEvidence].sort();
  const explanation = top
    ? `${top.name} leads at ${top.confidence}% fit because ${top.reasons
        .filter((item) => item.points > 0)
        .slice(0, 3)
        .map((item) => item.label)
        .join(", ")}.`
    : "No candidates satisfy the current search.";

  return {
    query: input,
    model,
    budget,
    evidenceTags: evidenceSummary,
    explanation,
    results: ranked
  };
}

export function createObservation(rawInput, source = "human") {
  assertPlainObject(rawInput);
  assertNoExtraKeys(rawInput, ["text", "tag", "confidence", "source"]);
  const text = sanitizeText(rawInput.text);
  const tag = sanitizeText(rawInput.tag, 40);
  const confidence = Number(rawInput.confidence ?? 0.75);
  const normalizedSource = source === "agent" || rawInput.source === "agent" ? "agent" : "human";

  if (text.length < 4) throw new RangeError("Observation text must contain at least 4 characters.");
  if (!KNOWN_TAGS.has(tag)) throw new RangeError(`Unknown evidence tag: ${tag}`);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError("confidence must be between 0 and 1.");
  }

  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    tag,
    confidence: Math.round(confidence * 100) / 100,
    source: normalizedSource,
    recordedAt: new Date().toISOString()
  };
}

export function compareCandidates(results, productIds) {
  const uniqueIds = [...new Set(productIds)].slice(0, 4);
  if (uniqueIds.length < 2) throw new RangeError("Choose at least two candidates.");
  const selected = uniqueIds.map((id) => results.find((item) => item.id === id)).filter(Boolean);
  if (selected.length < 2) throw new RangeError("At least two selected candidates must exist in the current results.");

  return selected.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    confidence: item.confidence,
    compatibility: item.compatibility.label,
    risk: item.repairRisk,
    leadDays: item.leadDays,
    strongestReason: item.reasons[0]?.label ?? "No dominant signal"
  }));
}

export function buildRepairPlan(caseState, candidate, rawInput = {}) {
  if (!candidate) throw new RangeError("A valid candidate is required.");
  assertPlainObject(rawInput);
  assertNoExtraKeys(rawInput, ["objective", "maxSteps", "notes"]);
  for (const key of ["objective", "notes"]) {
    if (rawInput[key] != null && typeof rawInput[key] !== "string") {
      throw new TypeError(`${key} must be a string.`);
    }
  }
  if (rawInput.maxSteps != null && !Number.isInteger(rawInput.maxSteps)) {
    throw new TypeError("maxSteps must be an integer.");
  }
  const objective = sanitizeText(rawInput.objective || `Restore safe airflow using ${candidate.name}.`, 180);
  const maxSteps = clamp(rawInput.maxSteps ?? 5, 3, 7);
  const notes = sanitizeText(rawInput.notes ?? "", 240);
  const hasBlockedFilter = caseState.evidence.some((item) => item.tag === "blocked_filter" && item.confidence >= 0.7);
  const hasFanRunning = caseState.evidence.some((item) => item.tag === "fan_running" && item.confidence >= 0.7);
  const candidateIsFilter = candidate.category === "replacement-filter";
  const candidateIsDiagnostic = candidate.category === "diagnostic-tool";

  const steps = [
    {
      title: "Isolate power and record the baseline",
      detail: "Unplug the AP-200. Photograph the installed orientation and note current airflow at the same fan setting.",
      stopCondition: "Stop if the cord, plug, or housing shows heat damage."
    },
    candidateIsDiagnostic
      ? {
          title: `Measure with ${candidate.name}`,
          detail: "Take three readings at the center outlet from the same distance and calculate the median.",
          stopCondition: "Stop if the unit produces electrical odor, smoke, or intermittent power."
        }
      : {
          title: "Open only the user-serviceable filter compartment",
          detail: "Remove the rear cover without opening the motor or electrical enclosure.",
          stopCondition: "Stop if access requires removing electrical-safety screws."
        },
    candidateIsFilter
      ? {
          title: `Install ${candidate.name}`,
          detail: "Match the airflow arrow and seat every edge; do not force or trim a direct-fit cartridge.",
          stopCondition: "Stop if the frame bows, gaps remain, or the cover will not close normally."
        }
      : {
          title: `Use ${candidate.name} for the narrow task`,
          detail: candidate.notes,
          stopCondition: candidate.repairRisk === "high" ? "Do not proceed without qualified service." : "Stop if the task requires bypassing a guard."
        },
    {
      title: "Run a controlled verification",
      detail: "Restore power, run the same setting for two minutes, and compare airflow, noise, and odor with baseline.",
      stopCondition: "Disconnect immediately for scraping, smoke, electrical odor, or worsening vibration."
    },
    {
      title: "Capture the outcome",
      detail: "Record whether airflow improved and preserve the old part until the result is confirmed.",
      stopCondition: "If improvement is negligible, reject the filter hypothesis and escalate diagnosis."
    }
  ].slice(0, maxSteps);

  const assumptions = [
    `${caseState.device.model} is the model printed on the device label.`,
    `${candidate.name} is obtained from a reputable seller and arrives undamaged.`,
    hasFanRunning ? "The fan-running observation remains true under the same operating setting." : "Fan operation has not yet been independently confirmed.",
    hasBlockedFilter ? "The blocked-filter evidence is strong enough to justify a filter-first test." : "Filter blockage remains a hypothesis, not a confirmed cause."
  ];
  if (notes) assumptions.push(`Agent note: ${notes}`);

  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: objective,
    candidateId: candidate.id,
    candidateName: candidate.name,
    risk: candidate.repairRisk,
    steps,
    assumptions: assumptions.slice(0, 5),
    status: "staged",
    version: (caseState.stagedPlan?.version ?? 0) + 1,
    createdAt: new Date().toISOString(),
    createdBy: "agent-or-human",
    approvedAt: null,
    approvedBy: null
  };
}

export function approvePlan(plan, authorization = {}) {
  if (!plan) throw new RangeError("No staged plan exists.");
  if (authorization.actor !== "human" || authorization.confirmed !== true) {
    throw new Error("Approval denied: a deliberate human confirmation is required.");
  }
  return {
    ...plan,
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: "human"
  };
}

export function compactCaseSnapshot(state) {
  return {
    caseId: state.caseId,
    title: state.title,
    device: state.device,
    constraints: state.constraints,
    evidence: state.evidence.slice(-8).map(({ id, text, tag, confidence, source, recordedAt }) => ({
      id, text, tag, confidence, source, recordedAt
    })),
    topCandidates: state.search?.results?.slice(0, 3).map(({ id, name, price, confidence, compatibility, repairRisk }) => ({
      id,
      name,
      price,
      confidence,
      compatibility: compatibility.status,
      repairRisk
    })) ?? [],
    stagedPlan: state.stagedPlan
      ? {
          id: state.stagedPlan.id,
          title: state.stagedPlan.title,
          status: state.stagedPlan.status,
          version: state.stagedPlan.version,
          candidateId: state.stagedPlan.candidateId
        }
      : null,
    approvedPlan: state.approvedPlan
      ? {
          id: state.approvedPlan.id,
          title: state.approvedPlan.title,
          approvedAt: state.approvedPlan.approvedAt,
          approvedBy: state.approvedPlan.approvedBy
        }
      : null
  };
}

export function computeCaseConfidence(state) {
  const evidenceWeight = state.evidence.reduce((sum, item) => sum + item.confidence * 9, 0);
  const topFit = state.search?.results?.[0]?.confidence ?? 25;
  const measurementBonus = state.evidence.some((item) => item.tag === "measurement") ? 8 : 0;
  return clamp(Math.round(18 + evidenceWeight + topFit * 0.34 + measurementBonus), 18, 96);
}

export function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new DOMException("Tool execution was cancelled.", "AbortError");
    throw error;
  }
}

export const ENGINE_LIMITS = Object.freeze({
  maxObservationLength: MAX_OBSERVATION_LENGTH,
  maxQueryLength: MAX_QUERY_LENGTH,
  maxResults: MAX_RESULTS,
  knownTags: [...KNOWN_TAGS],
  allowedRisks: [...ALLOWED_RISKS]
});
