import { upcMatches } from "./live-recalls.js";

export const ITEM_KINDS = Object.freeze(["food", "drug", "consumer"]);
export const READING_FIELDS = Object.freeze(["lot_code", "best_by", "upc", "model_number", "other"]);
export const VERDICTS = Object.freeze(["likely_affected", "likely_not_affected", "no_recall_found", "cannot_determine"]);
export const RESOLUTIONS = Object.freeze(["keep", "discard", "return", "contact_firm"]);

export function sanitizeText(value, max = 280) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function assertObject(input, allowed, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} input must be an object.`);
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`Unsupported ${label} field: ${extra}.`);
}

function optionalString(value, name) {
  if (value != null && typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value == null ? "" : value;
}

// A shelf item is something physically in the person's home. It may come from the live catalog or be described by the person.
export function createShelfItem(input, actor = "human", product = null) {
  assertObject(input, ["productId", "description", "brand", "kind", "note"], "shelf item");
  const description = sanitizeText(optionalString(input.description, "description"), 120);
  const brand = sanitizeText(optionalString(input.brand, "brand"), 80);
  const note = sanitizeText(optionalString(input.note, "note"), 160);
  const kind = sanitizeText(optionalString(input.kind, "kind"), 20) || (product ? "food" : "");
  if (!product && description.length < 2) throw new Error("Give a catalog productId or a short description of the item on the shelf.");
  if (!ITEM_KINDS.includes(kind)) throw new Error("kind must be food, drug, or consumer.");
  return {
    id: uid("item"),
    name: product ? product.name : description,
    brand: product ? product.brand : (brand || "Brand not stated"),
    barcode: product ? product.code : "",
    kind,
    imageUrl: product?.imageUrl ?? "",
    sourceUrl: product?.sourceUrl ?? "",
    catalogSource: product ? "Open Food Facts" : "",
    note,
    addedBy: actor,
    addedAt: new Date().toISOString(),
    candidates: [],
    readingRequests: [],
    readings: [],
    assessment: null,
    resolution: null,
    lastSweep: null
  };
}

export function sweepQueryFor(item) {
  const brand = item.brand && item.brand !== "Brand not stated" && item.brand !== "Brand not recorded" ? item.brand.split(",")[0].trim() : "";
  if (brand.length >= 2) return brand.slice(0, 60);
  return item.name.split(" ").slice(0, 3).join(" ").slice(0, 60);
}

export function attachCandidates(item, search) {
  const known = new Map(item.candidates.map((candidate) => [candidate.id, candidate]));
  for (const result of search.results) {
    if (known.has(result.id)) continue;
    known.set(result.id, {
      ...result,
      upcMatch: upcMatches(item.barcode, result.product, result.codeInfo),
      matchedQuery: search.query,
      attachedAt: search.fetchedAt
    });
  }
  return {
    ...item,
    candidates: [...known.values()].slice(0, 12),
    lastSweep: { query: search.query, scope: search.scope, at: search.fetchedAt, found: search.results.length, sources: search.sources.map((entry) => ({ source: entry.source, status: entry.status, total: entry.total })) }
  };
}

export function createReadingRequest(item, input, actor = "agent") {
  assertObject(input, ["itemId", "fields", "whereToLook", "recallId"], "reading request");
  if (!Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 4) throw new Error("fields must list one to four package fields to read.");
  if (!input.fields.every((field) => READING_FIELDS.includes(field))) throw new Error(`fields must be from: ${READING_FIELDS.join(", ")}.`);
  const fields = [...new Set(input.fields)];
  const whereToLook = sanitizeText(optionalString(input.whereToLook, "whereToLook"), 240);
  if (whereToLook.length < 8) throw new Error("whereToLook must tell the person where on the package to look.");
  const recallId = sanitizeText(optionalString(input.recallId, "recallId"), 60);
  if (recallId && !item.candidates.some((candidate) => candidate.id === recallId)) throw new Error("recallId must be a candidate already attached to this item.");
  return { id: uid("ask"), fields, whereToLook, recallId, requestedBy: actor, requestedAt: new Date().toISOString() };
}

export function createReading(input, source = "human") {
  assertObject(input, ["itemId", "field", "value"], "package reading");
  if (typeof input.field !== "string" || typeof input.value !== "string") throw new Error("field and value must be strings.");
  if (!READING_FIELDS.includes(input.field)) throw new Error(`field must be from: ${READING_FIELDS.join(", ")}.`);
  const value = sanitizeText(input.value, 80);
  if (value.length < 1) throw new Error("value must contain what is printed on the package.");
  return { id: uid("read"), field: input.field, value, source, recordedAt: new Date().toISOString() };
}

export function pendingReadingFields(item) {
  const have = new Set(item.readings.map((reading) => reading.field));
  return [...new Set(item.readingRequests.flatMap((request) => request.fields))].filter((field) => !have.has(field));
}

export function createAssessment(item, input, actor = "agent") {
  assertObject(input, ["itemId", "verdict", "reasoning", "recallId"], "assessment");
  if (typeof input.verdict !== "string" || !VERDICTS.includes(input.verdict)) throw new Error(`verdict must be from: ${VERDICTS.join(", ")}.`);
  const reasoning = sanitizeText(optionalString(input.reasoning, "reasoning"), 320);
  if (reasoning.length < 12) throw new Error("reasoning must explain the verdict in at least 12 characters.");
  const recallId = sanitizeText(optionalString(input.recallId, "recallId"), 60);
  if (recallId && !item.candidates.some((candidate) => candidate.id === recallId)) throw new Error("recallId must be a candidate already attached to this item.");
  if (input.verdict === "likely_affected" || input.verdict === "likely_not_affected") {
    if (!item.candidates.length) throw new Error("No recall candidate is attached; use no_recall_found or search_recalls first.");
    if (!item.readings.length) throw new Error("A package reading (lot code, date, UPC, or model) is required before judging a match. Use request_package_reading.");
    if (input.verdict === "likely_affected" && !recallId) throw new Error("likely_affected must name the matching recallId.");
  }
  if (input.verdict === "no_recall_found" && !item.lastSweep) throw new Error("Search recalls for this item before reporting no_recall_found.");
  return {
    verdict: input.verdict,
    reasoning,
    recallId,
    readingsConsidered: item.readings.map((reading) => reading.id),
    by: actor,
    at: new Date().toISOString()
  };
}

// Disposition of a physical object in the home is human-only. No WebMCP tool calls this.
export function createResolution(input, authorization) {
  if (authorization?.actor !== "human" || authorization?.confirmed !== true) throw new Error("Resolving an item requires a trusted human interaction in the visible interface.");
  assertObject(input, ["action", "note"], "resolution");
  if (!RESOLUTIONS.includes(input.action)) throw new Error(`action must be from: ${RESOLUTIONS.join(", ")}.`);
  return { action: input.action, note: sanitizeText(optionalString(input.note, "note"), 160), by: "human", at: new Date().toISOString() };
}

export function itemStatus(item) {
  if (item.resolution) return { key: `resolved_${item.resolution.action}`, label: `Resolved: ${item.resolution.action.replace("_", " ")}`, tone: item.resolution.action === "keep" ? "good" : "warn" };
  if (item.assessment) {
    const tones = { likely_affected: "bad", likely_not_affected: "good", no_recall_found: "good", cannot_determine: "warn" };
    return { key: item.assessment.verdict, label: `Agent assessment: ${item.assessment.verdict.replaceAll("_", " ")}`, tone: tones[item.assessment.verdict] };
  }
  if (pendingReadingFields(item).length) return { key: "reading_requested", label: "Your reading is needed", tone: "warn" };
  if (item.candidates.some((candidate) => candidate.upcMatch)) return { key: "upc_match", label: "Barcode appears in a recall notice", tone: "bad" };
  if (item.candidates.length) return { key: "candidates", label: `${item.candidates.length} recall candidate${item.candidates.length === 1 ? "" : "s"}`, tone: "warn" };
  if (item.lastSweep) return { key: "clear_sweep", label: "No candidates in the last sweep", tone: "good" };
  return { key: "unchecked", label: "Not checked yet", tone: "neutral" };
}

export function compactCandidate(candidate, size = "list") {
  const short = size === "list";
  return {
    id: candidate.id,
    src: candidate.source,
    firm: candidate.firm.slice(0, short ? 40 : 120),
    product: candidate.product.slice(0, short ? 80 : 240),
    reason: candidate.reason.slice(0, short ? 70 : 240),
    code: candidate.codeInfo.slice(0, short ? 110 : 600),
    status: candidate.status,
    reported: candidate.reported,
    upcMatch: candidate.upcMatch === true
  };
}

export function compactItem(item) {
  return {
    id: item.id,
    name: item.name.slice(0, 60),
    brand: item.brand.slice(0, 40),
    barcode: item.barcode || null,
    kind: item.kind,
    status: itemStatus(item).key,
    candidates: item.candidates.length,
    candidateIds: item.candidates.slice(0, 6).map((candidate) => candidate.id),
    upcMatches: item.candidates.filter((candidate) => candidate.upcMatch).length,
    pendingReading: pendingReadingFields(item),
    readings: item.readings.map((reading) => `${reading.field}=${reading.value}`).slice(0, 6),
    assessment: item.assessment?.verdict ?? null,
    resolution: item.resolution?.action ?? null
  };
}

export function compactShelf(state) {
  return {
    items: state.shelf.map(compactItem),
    unresolved: state.shelf.filter((item) => !item.resolution).length,
    awaitingPerson: state.shelf.filter((item) => pendingReadingFields(item).length).map((item) => item.id),
    lastSweep: state.sweep.at,
    note: "Resolutions (keep, discard, return, contact_firm) are recorded only by the person in the visible interface."
  };
}
