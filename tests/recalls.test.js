import test from "node:test";
import assert from "node:assert/strict";
import { barcodeVariants, digitRuns, normalizeCpscRecall, normalizeFdaRecall, searchRecalls, sourcesForScope, upcMatches } from "../src/live-recalls.js";
import { cpscPayload, fdaPayload, fetchStub } from "./fixtures.js";

test("barcode variants cover EAN-13, UPC-A, and UPC-A without check digit", () => {
  assert.deepEqual(barcodeVariants("0051500241219"), ["0051500241219", "051500241219", "05150024121"]);
  assert.deepEqual(barcodeVariants("12345678"), []);
});

test("UPC matching ignores spaces and punctuation inside notices", () => {
  assert.equal(upcMatches("0888109010027", "2.55 oz twin pack UPC 8 88109 01002 7"), true);
  assert.equal(upcMatches("0051500241219", fdaPayload.results[0].product_description), true);
  assert.equal(upcMatches("0051500241219", "no numbers here"), false);
  assert.equal(upcMatches("", "UPC 0 51500 24121 9"), false);
});

test("UPC matching never joins digits across separate fields or words", () => {
  assert.equal(upcMatches("123456789012", "Model 123456", "lot 789012"), false);
  assert.equal(upcMatches("123456789012", "Model 123456 lot 789012"), false);
  assert.equal(upcMatches("123456789012", "Model 123456, lot 789012, 16 oz"), false);
  assert.equal(upcMatches("123456789012", "UPC 1 23456 78901 2"), true);
  assert.deepEqual(digitRuns("2.55 oz twin pack UPC 8 88109 01002 7; lot 5167832"), ["888109010027"]);
});

test("FDA normalization keeps lot text, dates, and a source record link", () => {
  const recall = normalizeFdaRecall(fdaPayload.results[0], "food");
  assert.equal(recall.id, "fda-F-0001-2026");
  assert.equal(recall.source, "FDA");
  assert.match(recall.codeInfo, /1274425 through 2140425/);
  assert.equal(recall.initiated, "2026-05-01");
  assert.equal(recall.reported, "2026-05-10");
  assert.match(recall.url, /^https:\/\/api\.fda\.gov\/food\/enforcement\.json\?search=recall_number/);
  assert.equal(normalizeFdaRecall({}, "food"), null);
});

test("CPSC normalization extracts hazard, remedy, models, and only cpsc.gov links", () => {
  const recall = normalizeCpscRecall(cpscPayload[0]);
  assert.equal(recall.id, "cpsc-26669");
  assert.equal(recall.firm, "Voomf");
  assert.match(recall.codeInfo, /Models: VM-100/);
  assert.match(recall.remedy, /Stop using/);
  assert.equal(recall.url, "https://www.cpsc.gov/Recalls/2026/Sample-Recall");
  assert.equal(normalizeCpscRecall({ ...cpscPayload[0], URL: "https://evil.example/x" }).url, "https://www.cpsc.gov/Recalls");
});

test("scope selects sources", () => {
  assert.deepEqual(sourcesForScope("food").map((s) => s.key), ["fda_food"]);
  assert.equal(sourcesForScope("all").length, 3);
  assert.throws(() => sourcesForScope("toys"), /scope must be/);
});

test("searchRecalls merges live sources, treats NOT_FOUND as empty, and records provenance", async () => {
  const search = await searchRecalls("peanut butter", { scope: "all", fetchImpl: fetchStub() });
  assert.equal(search.live, true);
  assert.ok(search.fetchedAt);
  assert.deepEqual(search.sources.map((s) => [s.source, s.status, s.total]), [["fda_food", "ok", 1], ["fda_drug", "ok", 0], ["cpsc", "ok", 1]]);
  assert.deepEqual(search.results.map((r) => r.id), ["cpsc-26669", "fda-F-0001-2026"]);
});

test("a single failing source is reported, a total failure throws", async () => {
  const partial = await searchRecalls("peanut", { scope: "all", fetchImpl: fetchStub({ cpscStatus: 503 }) });
  assert.equal(partial.sources.find((s) => s.source === "cpsc").status, "error");
  assert.equal(partial.results.length, 1);
  await assert.rejects(searchRecalls("peanut", { scope: "food", fetchImpl: fetchStub({ fdaStatus: 500 }) }), /Every recall source failed/);
  await assert.rejects(searchRecalls("peanut", { scope: "food", fetchImpl: fetchStub({ fdaStatus: 429 }) }), /rate limit/);
});

test("queries are cleaned and too-short queries rejected", async () => {
  await assert.rejects(searchRecalls("x", { fetchImpl: fetchStub() }), /at least two characters/);
  const search = await searchRecalls('  jif "peanut" <b>  ', { scope: "food", fetchImpl: fetchStub() });
  assert.equal(search.query, "jif peanut b");
});
