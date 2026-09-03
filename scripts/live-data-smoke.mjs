import { lookupLiveBarcode, searchLiveProducts } from "../src/live-catalog.js";

const probes = [
  { mode: "US live text search", run: () => searchLiveProducts("Quaker Old Fashioned Oats") },
  { mode: "worldwide v3.6 barcode lookup", run: () => lookupLiveBarcode("030000010402") }
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runWithRetries(probe, attempts = 3) {
  const errors = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await probe.run();
      if (!result.live || result.source !== "Open Food Facts") throw new Error("Missing live provenance.");
      if (!result.results.length) throw new Error("Live API returned no normalized products.");
      if (!result.results.some((product) => product.name !== "Unnamed product" && product.sourceUrl.includes("openfoodfacts.org/product/"))) {
        throw new Error("Live records lack product identity or source URL.");
      }
      return {
        passed: true,
        mode: probe.mode,
        attempt,
        source: result.source,
        sourceUrl: result.sourceUrl,
        scope: result.searchScope,
        fetchedAt: result.fetchedAt,
        totalReported: result.total,
        sample: result.results.slice(0, 3).map((product) => ({
          code: product.code,
          name: product.name,
          brand: product.brand,
          completeness: product.completeness,
          ingredientsLanguage: product.ingredientsLanguage,
          lastModified: product.lastModified,
          sourceUrl: product.sourceUrl
        }))
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (attempt < attempts) await wait(750 * attempt);
    }
  }
  return { passed: false, mode: probe.mode, attempts, errors };
}

const results = [];
for (const probe of probes) results.push(await runWithRetries(probe));

console.log(JSON.stringify({ passed: results.every((result) => result.passed), probes: results }, null, 2));
if (results.some((result) => !result.passed)) process.exit(1);
