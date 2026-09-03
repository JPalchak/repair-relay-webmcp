import { createPackageCheck } from "../src/engine.js";
import { normalizeProduct } from "../src/live-catalog.js";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";

const checks = [];
function evaluate(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
}

const product = normalizeProduct({
  code: "030000010402",
  product_name: "Quaker Old Fashioned Oats",
  brands: "Quaker",
  quantity: "42 oz",
  ingredients_text_en: "Whole Grain Rolled Oats",
  allergens_tags: ["en:gluten"],
  nutriscore_grade: "a",
  completeness: 0.92,
  last_modified_t: 1780104331,
  nutriments: { sugars_100g: 1.1 }
});

const store = createStore();
store.dispatch({
  type: "SEARCH_SUCCEEDED",
  actor: "system",
  search: {
    query: product.id,
    total: 1,
    results: [product],
    fetchedAt: new Date().toISOString(),
    source: "Open Food Facts",
    sourceUrl: product.sourceUrl,
    searchScope: "Worldwide barcode record",
    live: true
  }
});

const tools = createToolDefinitions({ store });
const byName = (name) => tools.find((tool) => tool.name === name);
const names = tools.map((tool) => tool.name);

evaluate("Coherent tool surface", tools.length === 8 && new Set(names).size === 8, "Eight non-overlapping tools are available.");
evaluate("Human authority", !names.some((name) => /^(?:approve|confirm|purchase|checkout)(?:_|$)/i.test(name)), "No agent tool can confirm an attestation or approve a record.");
evaluate("Closed schemas", tools.every((tool) => tool.inputSchema.additionalProperties === false), "Every tool rejects undeclared properties.");
evaluate("Untrusted relay", byName("record_package_check").annotations.untrustedContentHint === true, "Agent-relayed package statements are untrusted.");

await byName("stage_verified_choice").execute({ productId: product.id, rationale: "Evaluate the judge relay." });
for (const [checkType, note] of [
  ["barcode_match", "The person said the barcode matches."],
  ["ingredients_match", "The person said the ingredients read Whole Grain Rolled Oats."]
]) {
  const result = JSON.parse(await byName("record_package_check").execute({ productId: product.id, checkType, outcome: "match", note }));
  evaluate(`Pending ${checkType}`, result.pendingHumanConfirmation && /no required check was cleared/.test(result.caution), "The relay remains pending and honest.");
}

evaluate(
  "Relay cannot self-verify",
  store.getState().stagedChoice.requiredChecks.length === 2 && store.getState().stagedChoice.pendingAttestationIds.length === 2,
  "Both requirements remain until trusted visible confirmation."
);

for (const check of [...store.getState().checks]) {
  store.dispatch({ type: "CONFIRM_CHECK", checkId: check.id, authorization: { actor: "human", confirmed: true } });
}
evaluate("Trusted confirmation is consequential", store.getState().stagedChoice.requiredChecks.length === 0, "Human confirmation clears the exact package requirements.");

store.dispatch({ type: "APPROVE_CHOICE", authorization: { actor: "human", confirmed: true } });
const approved = JSON.parse(await byName("get_approved_choice").execute({}));
evaluate(
  "Approval consequence",
  approved.approved === true && approved.verifiedLabelSummary?.product?.ingredients === "Whole Grain Rolled Oats",
  "Approval unlocks a provenance-rich summary for continued assistance."
);

const mismatch = createPackageCheck({
  productId: product.id,
  checkType: "ingredients_match",
  outcome: "mismatch",
  note: "A later package reading found an added ingredient."
}, "human");
store.dispatch({ type: "ADD_CHECK", check: mismatch, actor: "human" });
evaluate(
  "Mismatch overrides approval",
  store.getState().approvedChoice === null && store.getState().stagedChoice.status === "record_mismatch" && /type=edit&code=030000010402/.test(store.getState().stagedChoice.correctionUrl),
  "Contradictory package evidence revokes approval and exposes correction."
);

const passed = checks.filter((item) => item.passed).length;
console.log(JSON.stringify({ suite: "label-relay-webmcp-evals", passed, total: checks.length, checks }, null, 2));
if (passed !== checks.length) process.exitCode = 1;
