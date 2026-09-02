import { lookupLiveBarcode, searchLiveProducts } from "../src/live-catalog.js";

const probes = [
  { mode: "live text search", run: () => searchLiveProducts("quaker oats") },
  { mode: "live v3 barcode lookup", run: () => lookupLiveBarcode("3168930003632") }
];

let lastError;
for (const probe of probes) {
  try {
    const result = await probe.run();
    if (!result.live || result.source !== "Open Food Facts") throw new Error("Missing live provenance.");
    if (!result.results.length) throw new Error("Live API returned no normalized products.");
    if (!result.results.some((product) => product.name !== "Unnamed product" && product.sourceUrl.includes("openfoodfacts.org/product/"))) throw new Error("Live records lack product identity or source URL.");
    console.log(JSON.stringify({ passed: true, mode: probe.mode, source: result.source, fetchedAt: result.fetchedAt, totalReported: result.total, sample: result.results.slice(0, 3).map((p) => ({ code: p.code, name: p.name, brand: p.brand, lastModified: p.lastModified, sourceUrl: p.sourceUrl })) }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
  }
}
console.error(`Both live-data probes failed: ${lastError?.message ?? lastError}`);
process.exit(1);
