export function sanitizeText(value, max = 280) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

export function createPackageCheck(input, source = "human") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Package check input must be an object.");
  const allowedFields = new Set(["productId", "checkType", "outcome", "note"]);
  const extra = Object.keys(input).find((key) => !allowedFields.has(key));
  if (extra) throw new Error(`Unsupported package check field: ${extra}.`);
  if (typeof input.productId !== "string" || typeof input.checkType !== "string" || typeof input.outcome !== "string" || typeof input.note !== "string") {
    throw new Error("Package check fields must be strings.");
  }
  const allowed = ["barcode_match", "ingredients_match", "allergens_match", "package_date", "available_here"];
  const outcomes = ["match", "mismatch", "unclear"];
  const checkType = sanitizeText(input?.checkType, 40);
  const outcome = sanitizeText(input?.outcome, 20);
  if (!allowed.includes(checkType)) throw new Error("Unsupported package check type.");
  if (!outcomes.includes(outcome)) throw new Error("Package check outcome must be match, mismatch, or unclear.");
  const note = sanitizeText(input?.note, 240);
  if (note.length < 3) throw new Error("Add a short factual note from the physical package.");
  return {
    id: `check-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: sanitizeText(input?.productId, 20).replace(/\D/g, ""),
    checkType,
    outcome,
    note,
    source,
    recordedAt: new Date().toISOString()
  };
}

export function compareProducts(results, productIds) {
  if (!Array.isArray(productIds) || productIds.length < 2 || productIds.length > 4) {
    throw new Error("Choose two to four product IDs from the current live search.");
  }
  if (!productIds.every((id) => typeof id === "string")) throw new Error("Every product ID must be a string.");
  const unique = [...new Set(productIds)];
  if (unique.length !== productIds.length) throw new Error("Comparison IDs must be unique.");
  const found = unique.map((id) => results.find((item) => item.id === id));
  if (found.some((item) => !item)) throw new Error("Every comparison ID must come from the current live results.");
  return found.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    nutriScore: item.nutriScore,
    allergens: item.allergens,
    sugar100g: item.sugar100g,
    completeness: item.completeness,
    lastModified: item.lastModified
  }));
}

export function stageChoice(state, input, actor = "agent") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Staged choice input must be an object.");
  const extra = Object.keys(input).find((key) => !["productId", "rationale"].includes(key));
  if (extra) throw new Error(`Unsupported staged choice field: ${extra}.`);
  if (typeof input.productId !== "string") throw new Error("productId must be a string.");
  if (input.rationale != null && typeof input.rationale !== "string") throw new Error("rationale must be a string.");
  const product = state.search?.results?.find((item) => item.id === String(input?.productId));
  if (!product) throw new Error("Choose a product ID from the current live result set.");
  const relevantChecks = state.checks.filter((check) => check.productId === product.id && check.outcome === "match" && check.source === "human");
  const verifiedTypes = new Set(relevantChecks.map((check) => check.checkType));
  const requiredChecks = ["barcode_match", "ingredients_match"].filter((type) => !verifiedTypes.has(type));
  return {
    id: `choice-${Date.now()}`,
    productId: product.id,
    name: product.name,
    brand: product.brand,
    rationale: sanitizeText(input?.rationale, 220) || "Candidate selected from the current live result set.",
    status: "awaiting_human_approval",
    requiredChecks,
    sourceUrl: product.sourceUrl,
    fetchedAt: state.search.fetchedAt,
    stagedBy: actor,
    stagedAt: new Date().toISOString()
  };
}

export function approveChoice(choice, authorization) {
  if (!choice) throw new Error("No choice is staged.");
  if (choice.requiredChecks.length) throw new Error("Complete the visible barcode and ingredients checks before approval.");
  if (authorization?.actor !== "human" || authorization?.confirmed !== true) {
    throw new Error("Approval requires a trusted human interaction in the visible interface.");
  }
  return { ...choice, status: "human_approved", approvedAt: new Date().toISOString() };
}

export function compactSnapshot(state) {
  return {
    search: state.search ? { query: state.search.query, fetchedAt: state.search.fetchedAt, resultIds: state.search.results.map((p) => p.id) } : null,
    checks: state.checks.slice(-8),
    stagedChoice: state.stagedChoice,
    approvedChoice: state.approvedChoice
  };
}
