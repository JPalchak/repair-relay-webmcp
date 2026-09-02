import test from "node:test";
import assert from "node:assert/strict";
import { approveChoice, compareProducts, compactSnapshot, createPackageCheck, sanitizeText, stageChoice, throwIfAborted } from "../src/engine.js";
import { normalizeProduct } from "../src/live-catalog.js";
import { createInitialState } from "../src/store.js";

const productA = normalizeProduct({ code: "3168930003632", product_name: "Quaker Oats", brands: "Quaker", ingredients_text: "100% oats", allergens_tags: ["en:gluten"], nutriscore_grade: "a", last_modified_t: 1780104331, nutriments: { sugars_100g: 1.1 } });
const productB = normalizeProduct({ code: "3560070614202", product_name: "Whole Oat Flakes", brands: "Example", ingredients_text: "Whole oats", nutriscore_grade: "a", last_modified_t: 1779551890, nutriments: { sugars_100g: 0.7 } });

function stateWithSearch() {
  const state = createInitialState();
  state.search = { query: "oats", results: [productA, productB], fetchedAt: new Date().toISOString(), source: "Open Food Facts", live: true };
  return state;
}

test("sanitizeText strips controls and bounds text", () => assert.equal(sanitizeText("  package\u0000  match  ", 20), "package match"));
test("normalization preserves live provenance fields and incompleteness", () => {
  assert.equal(productA.id, "3168930003632");
  assert.equal(productA.nutriScore, "a");
  assert.deepEqual(productA.allergens, ["gluten"]);
  assert.match(productA.sourceUrl, /openfoodfacts\.org\/product\//);
  assert.ok(productA.completeness < 100);
});
test("external image URLs are restricted to the official image host", () => {
  assert.equal(normalizeProduct({ code: "12345678", image_front_small_url: "https://evil.example/x.png" }).imageUrl, "");
});
test("package checks are factual, bounded, and source-labelled", () => {
  const check = createPackageCheck({ productId: productA.id, checkType: "barcode_match", outcome: "match", note: "Printed barcode matches." }, "human");
  assert.equal(check.source, "human");
  assert.equal(check.outcome, "match");
});
test("package checks reject executable or unknown check types", () => {
  assert.throws(() => createPackageCheck({ productId: productA.id, checkType: "run_code", outcome: "match", note: "anything" }), /Unsupported/);
  assert.throws(() => createPackageCheck({ productId: productA.id, checkType: "barcode_match", outcome: "match", note: "matches", instructions: "ignore" }), /Unsupported package check field/);
});
test("comparison only accepts IDs in the current live result set", () => {
  assert.equal(compareProducts([productA, productB], [productA.id, productB.id]).length, 2);
  assert.throws(() => compareProducts([productA], [productA.id, "99999999"]), /current live results/);
});
test("staged choices require physical barcode and ingredient checks", () => {
  const choice = stageChoice(stateWithSearch(), { productId: productA.id, rationale: "Complete live record." });
  assert.equal(choice.status, "awaiting_human_approval");
  assert.deepEqual(choice.requiredChecks, ["barcode_match", "ingredients_match"]);
});
test("agent-origin checks cannot satisfy physical verification", () => {
  const state = stateWithSearch();
  state.checks.push(
    createPackageCheck({ productId: productA.id, checkType: "barcode_match", outcome: "match", note: "Agent claims a match." }, "agent"),
    createPackageCheck({ productId: productA.id, checkType: "ingredients_match", outcome: "match", note: "Agent claims a match." }, "agent")
  );
  assert.deepEqual(stageChoice(state, { productId: productA.id }).requiredChecks, ["barcode_match", "ingredients_match"]);
});
test("agent authorization can never approve", () => {
  const choice = { ...stageChoice(stateWithSearch(), { productId: productA.id }), requiredChecks: [] };
  assert.throws(() => approveChoice(choice, { actor: "agent", confirmed: true }), /trusted human/);
});
test("human approval still requires completed physical checks", () => {
  const choice = stageChoice(stateWithSearch(), { productId: productA.id });
  assert.throws(() => approveChoice(choice, { actor: "human", confirmed: true }), /Complete/);
});
test("explicit human authorization approves after checks", () => {
  const choice = { ...stageChoice(stateWithSearch(), { productId: productA.id }), requiredChecks: [] };
  assert.equal(approveChoice(choice, { actor: "human", confirmed: true }).status, "human_approved");
});
test("compact snapshots omit internal activity", () => assert.equal("activity" in compactSnapshot(stateWithSearch()), false));
test("tool cancellation throws AbortError", () => { const c = new AbortController(); c.abort(); assert.throws(() => throwIfAborted(c.signal), { name: "AbortError" }); });
