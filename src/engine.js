const OFF_HOME = "https://world.openfoodfacts.org";

export function sanitizeText(value, max = 280) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

export function correctionUrl(productId) {
  const code = sanitizeText(productId, 20).replace(/\D/g, "");
  return code ? `${OFF_HOME}/cgi/product.pl?type=edit&code=${encodeURIComponent(code)}` : OFF_HOME;
}

export function isConfirmedPackageCheck(check) {
  if (!check || check.confirmationStatus === "rejected") return false;
  if (check.confirmationStatus === "confirmed") return true;
  return check.source === "human" && !check.confirmationStatus;
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
  const checkType = sanitizeText(input.checkType, 40);
  const outcome = sanitizeText(input.outcome, 20);
  if (!allowed.includes(checkType)) throw new Error("Unsupported package check type.");
  if (!outcomes.includes(outcome)) throw new Error("Package check outcome must be match, mismatch, or unclear.");
  const note = sanitizeText(input.note, 240);
  if (note.length < 3) throw new Error("Add a short factual note from the physical package.");

  const now = new Date().toISOString();
  const normalizedSource = source === "human" ? "human" : "agent_relay";
  return {
    id: `check-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: sanitizeText(input.productId, 20).replace(/\D/g, ""),
    checkType,
    outcome,
    note,
    source: normalizedSource,
    confirmationStatus: normalizedSource === "human" ? "confirmed" : "pending_human_confirmation",
    recordedAt: now,
    confirmedAt: normalizedSource === "human" ? now : null,
    confirmedBy: normalizedSource === "human" ? "human" : null
  };
}

function requireTrustedHuman(authorization) {
  if (authorization?.actor !== "human" || authorization?.confirmed !== true) {
    throw new Error("This action requires a trusted human interaction in the visible interface.");
  }
}

export function confirmRelayedPackageCheck(check, authorization) {
  requireTrustedHuman(authorization);
  if (!check) throw new Error("The relayed package check no longer exists.");
  if (check.source !== "agent_relay") throw new Error("Only an agent-relayed check needs confirmation.");
  if (check.confirmationStatus !== "pending_human_confirmation") throw new Error("This relayed check is no longer awaiting confirmation.");
  return {
    ...check,
    confirmationStatus: "confirmed",
    confirmedAt: new Date().toISOString(),
    confirmedBy: "human"
  };
}

export function rejectRelayedPackageCheck(check, authorization) {
  requireTrustedHuman(authorization);
  if (!check) throw new Error("The relayed package check no longer exists.");
  if (check.source !== "agent_relay") throw new Error("Only an agent-relayed check can be rejected here.");
  if (check.confirmationStatus !== "pending_human_confirmation") throw new Error("This relayed check is no longer awaiting confirmation.");
  return {
    ...check,
    confirmationStatus: "rejected",
    confirmedAt: new Date().toISOString(),
    confirmedBy: "human"
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
    lastModified: item.lastModified,
    sourceUrl: item.sourceUrl
  }));
}

function verificationState(productId, checks) {
  const confirmed = checks.filter((check) => check.productId === productId && isConfirmedPackageCheck(check));
  const matches = new Set(confirmed.filter((check) => check.outcome === "match").map((check) => check.checkType));
  const mismatches = confirmed.filter((check) => check.outcome === "mismatch");
  return {
    requiredChecks: ["barcode_match", "ingredients_match"].filter((type) => !matches.has(type)),
    mismatchCheckIds: mismatches.map((check) => check.id),
    pendingAttestationIds: checks
      .filter((check) => check.productId === productId && check.confirmationStatus === "pending_human_confirmation")
      .map((check) => check.id)
  };
}

export function reconcileChoice(choice, checks, { invalidateApproval = false } = {}) {
  if (!choice) return null;
  const verification = verificationState(choice.productId, checks);
  const hasMismatch = verification.mismatchCheckIds.length > 0;
  let status = choice.status;
  if (hasMismatch) status = "record_mismatch";
  else if (invalidateApproval || status !== "human_approved") status = "awaiting_human_approval";
  return {
    ...choice,
    ...verification,
    status,
    verdict: hasMismatch ? "record_mismatch" : verification.requiredChecks.length ? "verification_incomplete" : "package_attested_match",
    correctionUrl: correctionUrl(choice.productId),
    approvedAt: status === "human_approved" ? choice.approvedAt : null
  };
}

export function stageChoice(state, input, actor = "agent") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Staged choice input must be an object.");
  const extra = Object.keys(input).find((key) => !["productId", "rationale"].includes(key));
  if (extra) throw new Error(`Unsupported staged choice field: ${extra}.`);
  if (typeof input.productId !== "string") throw new Error("productId must be a string.");
  if (input.rationale != null && typeof input.rationale !== "string") throw new Error("rationale must be a string.");
  const product = state.search?.results?.find((item) => item.id === String(input.productId));
  if (!product) throw new Error("Choose a product ID from the current live result set.");

  const base = {
    id: `choice-${Date.now()}`,
    productId: product.id,
    name: product.name,
    brand: product.brand,
    quantity: product.quantity,
    ingredients: product.ingredients,
    allergens: product.allergens,
    nutriScore: product.nutriScore,
    completeness: product.completeness,
    lastModified: product.lastModified,
    rationale: sanitizeText(input.rationale, 220) || "Candidate selected from the current live result set.",
    status: "awaiting_human_approval",
    sourceUrl: product.sourceUrl,
    fetchedAt: state.search.fetchedAt,
    stagedBy: actor,
    stagedAt: new Date().toISOString()
  };
  return reconcileChoice(base, state.checks);
}

export function approveChoice(choice, authorization) {
  if (!choice) throw new Error("No choice is staged.");
  if (choice.status === "record_mismatch" || choice.mismatchCheckIds?.length) {
    throw new Error("This live record conflicts with a confirmed package attestation and cannot be approved for this package.");
  }
  if (choice.requiredChecks.length) throw new Error("Complete the visible barcode and ingredients attestations before approval.");
  requireTrustedHuman(authorization);
  return {
    ...choice,
    status: "human_approved",
    verdict: "package_attested_match",
    approvedAt: new Date().toISOString()
  };
}

export function buildVerifiedLabelSummary(state) {
  const approved = state.approvedChoice;
  if (!approved || approved.status !== "human_approved") return null;
  const attestations = state.checks
    .filter((check) => check.productId === approved.productId && isConfirmedPackageCheck(check))
    .map((check) => ({
      checkType: check.checkType,
      outcome: check.outcome,
      note: check.note,
      source: check.source,
      confirmedBy: check.confirmedBy ?? (check.source === "human" ? "human" : null),
      confirmedAt: check.confirmedAt ?? check.recordedAt
    }));
  return {
    status: "human_attested_match",
    product: {
      id: approved.productId,
      name: approved.name,
      brand: approved.brand,
      quantity: approved.quantity,
      ingredients: approved.ingredients,
      allergens: approved.allergens,
      nutriScore: approved.nutriScore,
      completeness: approved.completeness,
      lastModified: approved.lastModified,
      sourceUrl: approved.sourceUrl,
      sourceFetchedAt: approved.fetchedAt
    },
    attestations,
    usefulFor: [
      "Continue an ingredient, allergen, or dietary-screening conversation about this exact package.",
      "Share a source-backed summary while preserving which statements came from the database and which were attested by the person."
    ],
    limitations: [
      "Label Relay records a person's attestation; it cannot independently see or authenticate the physical package.",
      "Open Food Facts is community-contributed. The current package label remains authoritative for consequential dietary decisions."
    ]
  };
}

export function compactSnapshot(state) {
  return {
    search: state.search
      ? { query: state.search.query, fetchedAt: state.search.fetchedAt, resultIds: state.search.results.map((product) => product.id) }
      : null,
    checks: state.checks.slice(-8),
    pendingHumanConfirmations: state.checks.filter((check) => check.confirmationStatus === "pending_human_confirmation").map((check) => check.id),
    stagedChoice: state.stagedChoice,
    approvedChoice: state.approvedChoice,
    verifiedLabelSummary: buildVerifiedLabelSummary(state)
  };
}
