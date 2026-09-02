// Probes the real production data sources. Nothing here is mocked.
import { lookupLiveBarcode, searchLiveProducts } from "../src/live-catalog.js";
import { searchRecalls } from "../src/live-recalls.js";

const report = { passed: true, probes: [] };

async function attempt(name, run, validate, retries = 2) {
  let lastError;
  for (let index = 0; index <= retries; index += 1) {
    try {
      const result = await run();
      const detail = validate(result);
      report.probes.push({ name, passed: true, ...detail });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (index + 1)));
    }
  }
  report.passed = false;
  report.probes.push({ name, passed: false, error: lastError?.message ?? String(lastError) });
}

await attempt("Open Food Facts text search", () => searchLiveProducts("peanut butter"), (result) => {
  if (!result.live || !result.results.length) throw new Error("No live catalog records.");
  return { fetchedAt: result.fetchedAt, totalReported: result.total, sample: result.results.slice(0, 2).map((p) => ({ code: p.code, name: p.name, brand: p.brand })) };
});

await attempt("Open Food Facts barcode lookup", () => lookupLiveBarcode("3168930003632"), (result) => {
  if (!result.results.length) throw new Error("Barcode record missing.");
  return { fetchedAt: result.fetchedAt, sample: { code: result.results[0].code, name: result.results[0].name } };
});

await attempt("openFDA food + drug enforcement search", () => searchRecalls("peanut butter", { scope: "all" }), (result) => {
  const fda = result.sources.filter((s) => s.source.startsWith("fda_"));
  if (fda.some((s) => s.status !== "ok")) throw new Error(`openFDA source error: ${JSON.stringify(fda)}`);
  return { fetchedAt: result.fetchedAt, sources: result.sources, sample: result.results.filter((r) => r.source === "FDA").slice(0, 2).map((r) => ({ id: r.id, firm: r.firm, reported: r.reported, code: r.codeInfo.slice(0, 80) })) };
});

await attempt("CPSC recall search", () => searchRecalls("heater", { scope: "consumer" }), (result) => {
  if (result.sources[0].status !== "ok") throw new Error(`CPSC source error: ${result.sources[0].message}`);
  return { fetchedAt: result.fetchedAt, total: result.sources[0].total, sample: result.results.slice(0, 2).map((r) => ({ id: r.id, firm: r.firm, initiated: r.initiated })) };
});

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
