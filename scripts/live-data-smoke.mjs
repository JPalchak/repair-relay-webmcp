import { searchLiveProducts } from "../src/live-catalog.js";

let lastError;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const result = await searchLiveProducts("quaker oats");
    if (!result.live || result.source !== "Open Food Facts") throw new Error("Missing live provenance.");
    if (!result.results.length) throw new Error("Live API returned no normalized products.");
    if (!result.results.some((product) => product.name !== "Unnamed product" && product.sourceUrl.includes("openfoodfacts.org/product/"))) throw new Error("Live records lack product identity or source URL.");
    console.log(JSON.stringify({ passed: true, source: result.source, fetchedAt: result.fetchedAt, totalReported: result.total, sample: result.results.slice(0, 3).map((p) => ({ code: p.code, name: p.name, brand: p.brand, lastModified: p.lastModified, sourceUrl: p.sourceUrl })) }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
  }
}
console.error(`Live-data smoke failed after 3 attempts: ${lastError?.message ?? lastError}`);
process.exit(1);
