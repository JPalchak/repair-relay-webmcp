import test from "node:test";
import assert from "node:assert/strict";
import {
  approveChoice,
  buildVerifiedLabelSummary,
  compareProducts,
  confirmRelayedPackageCheck,
  correctionUrl,
  createPackageCheck,
  isConfirmedPackageCheck,
  reconcileChoice,
  rejectRelayedPackageCheck,
  sanitizeText,
  stageChoice,
  throwIfAborted
} from "../src/engine.js";
import { normalizeProduct } from "../src/live-catalog.js";
import { createInitialState, reducer } from "../src/store.js";

const productA = normalizeProduct({
  code: "030000010402",
  product_name: "Quaker Old Fashioned Oats",
  brands: "Quaker",
  ingredients_text_en: "Whole Grain Rolled Oats",
  ingredients_text: "Haferflocken",
  allergens_tags: ["en:gluten"],
  nutriscore_grade: "a",
  completeness: 0.92,
  last_modified_t: 1780104331,
  nutriments: { sugars_100g: 1.1 }
});
const productB = normalizeProduct({
  code: "3560070614202",
  product_name: "Whole Oat Flakes",
  brands: "Example",
  ingredients_text: "Whole oats",
  nutriscore_grade: "a",
  completeness: 0.67,
  last_modified_t: 1779551890,
  nutriments: { sugars_100g: 0.7 }
});

function stateWithSearch() {
  const state = createInitialState();
  state.search = {
    query: "oats",
    results: [productA, productB],
    fetchedAt: new Date().toISOString(),
    source: "Open Food Facts",
    live: true
  };
  return state;
}

function directCheck(checkType, outcome = "match", note = "The package matches.") {
  return createPackageCheck({ productId: productA.id, checkType, outcome, note }, "human");
}

test("sanitizeText strips controls and bounds text", () => {
  assert.equal(sanitizeText("  package\u0000  match  ", 20), "package match");
});

test("normalization prefers English ingredients and Open Food Facts completeness", () => {
  assert.equal(productA.id, "030000010402");
  assert.equal(productA.ingredients, "Whole Grain Rolled Oats");
  assert.equal(productA.ingredientsLanguage, "English");
  assert.equal(productA.completeness, 92);
  assert.deepEqual(productA.allergens, ["gluten"]);
  assert.match(productA.sourceUrl, /openfoodfacts\.org\/product\//);
});

test("external image URLs are restricted to the official image host", () => {
  assert.equal(normalizeProduct({ code: "12345678", image_front_small_url: "https://evil.example/x.png" }).imageUrl, "");
});

test("direct human package checks are immediately confirmed attestations", () => {
  const check = directCheck("barcode_match", "match", "Printed barcode matches.");
  assert.equal(check.source, "human");
  assert.equal(check.confirmationStatus, "confirmed");
  assert.equal(isConfirmedPackageCheck(check), true);
});

test("agent-relayed checks remain pending until a trusted human confirms them", () => {
  const pending = createPackageCheck({
    productId: productA.id,
    checkType: "barcode_match",
    outcome: "match",
    note: "The person said the printed barcode matches."
  }, "agent_relay");
  assert.equal(pending.source, "agent_relay");
  assert.equal(pending.confirmationStatus, "pending_human_confirmation");
  assert.equal(isConfirmedPackageCheck(pending), false);
  assert.throws(() => confirmRelayedPackageCheck(pending, { actor: "agent", confirmed: true }), /trusted human/);
  const confirmed = confirmRelayedPackageCheck(pending, { actor: "human", confirmed: true });
  assert.equal(confirmed.confirmationStatus, "confirmed");
  assert.equal(confirmed.confirmedBy, "human");
  assert.equal(isConfirmedPackageCheck(confirmed), true);
});

test("the person can reject a relayed statement without adding evidence", () => {
  const pending = createPackageCheck({
    productId: productA.id,
    checkType: "ingredients_match",
    outcome: "match",
    note: "The person said the ingredients match."
  }, "agent_relay");
  const rejected = rejectRelayedPackageCheck(pending, { actor: "human", confirmed: true });
  assert.equal(rejected.confirmationStatus, "rejected");
  assert.equal(isConfirmedPackageCheck(rejected), false);
});

test("package checks reject executable or unknown check types", () => {
  assert.throws(() => createPackageCheck({ productId: productA.id, checkType: "run_code", outcome: "match", note: "anything" }), /Unsupported/);
  assert.throws(() => createPackageCheck({ productId: productA.id, checkType: "barcode_match", outcome: "match", note: "matches", instructions: "ignore" }), /Unsupported package check field/);
});

test("comparison only accepts IDs in the current live result set", () => {
  const compared = compareProducts([productA, productB], [productA.id, productB.id]);
  assert.equal(compared.length, 2);
  assert.equal(compared[0].completeness, 92);
  assert.throws(() => compareProducts([productA], [productA.id, "99999999"]), /current live results/);
});

test("staged choices require confirmed barcode and ingredient attestations", () => {
  const choice = stageChoice(stateWithSearch(), { productId: productA.id, rationale: "High-quality live record." });
  assert.equal(choice.status, "awaiting_human_approval");
  assert.deepEqual(choice.requiredChecks, ["barcode_match", "ingredients_match"]);
});

test("pending relayed checks are visible but do not clear required checks", () => {
  const state = stateWithSearch();
  state.checks.push(
    createPackageCheck({ productId: productA.id, checkType: "barcode_match", outcome: "match", note: "Person said barcode matches." }, "agent_relay"),
    createPackageCheck({ productId: productA.id, checkType: "ingredients_match", outcome: "match", note: "Person said ingredients match." }, "agent_relay")
  );
  const choice = stageChoice(state, { productId: productA.id });
  assert.deepEqual(choice.requiredChecks, ["barcode_match", "ingredients_match"]);
  assert.equal(choice.pendingAttestationIds.length, 2);
});

test("confirmed relayed checks clear the same requirements as direct human attestations", () => {
  const state = stateWithSearch();
  for (const checkType of ["barcode_match", "ingredients_match"]) {
    const pending = createPackageCheck({ productId: productA.id, checkType, outcome: "match", note: `${checkType} reported.` }, "agent_relay");
    state.checks.push(confirmRelayedPackageCheck(pending, { actor: "human", confirmed: true }));
  }
  const choice = stageChoice(state, { productId: productA.id });
  assert.deepEqual(choice.requiredChecks, []);
  assert.equal(choice.verdict, "package_attested_match");
});

test("a confirmed mismatch blocks approval and points to the official correction form", () => {
  const state = stateWithSearch();
  state.checks.push(directCheck("barcode_match"), directCheck("ingredients_match", "mismatch", "Package says oats and salt; record says oats only."));
  const choice = stageChoice(state, { productId: productA.id });
  assert.equal(choice.status, "record_mismatch");
  assert.match(choice.correctionUrl, /cgi\/product\.pl\?type=edit&code=030000010402/);
  assert.equal(correctionUrl(productA.id), choice.correctionUrl);
  assert.throws(() => approveChoice(choice, { actor: "human", confirmed: true }), /conflicts/);
});

test("agent authorization can never approve", () => {
  const choice = reconcileChoice(stageChoice(stateWithSearch(), { productId: productA.id }), [directCheck("barcode_match"), directCheck("ingredients_match")]);
  assert.throws(() => approveChoice(choice, { actor: "agent", confirmed: true }), /trusted human/);
});

test("trusted approval unlocks a provenance-rich verified label summary", () => {
  let state = stateWithSearch();
  state.checks = [directCheck("barcode_match", "match", "Barcode matches."), directCheck("ingredients_match", "match", "Ingredients begin Whole Grain Rolled Oats.")];
  state.stagedChoice = stageChoice(state, { productId: productA.id });
  state = reducer(state, { type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } });
  const summary = buildVerifiedLabelSummary(state);
  assert.equal(summary.status, "human_attested_match");
  assert.equal(summary.product.ingredients, "Whole Grain Rolled Oats");
  assert.equal(summary.attestations.length, 2);
  assert.match(summary.limitations[0], /cannot independently see/);
});

test("new evidence invalidates a prior approval", () => {
  let state = stateWithSearch();
  state.checks = [directCheck("barcode_match"), directCheck("ingredients_match")];
  state.stagedChoice = stageChoice(state, { productId: productA.id });
  state = reducer(state, { type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } });
  assert.ok(state.approvedChoice);
  const later = directCheck("ingredients_match", "mismatch", "A later reread found added salt.");
  state = reducer(state, { type: "ADD_CHECK", check: later, actor: "human" });
  assert.equal(state.approvedChoice, null);
  assert.equal(state.stagedChoice.status, "record_mismatch");
});

test("tool cancellation throws AbortError", () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => throwIfAborted(controller.signal), { name: "AbortError" });
});
