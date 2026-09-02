const SEARCH_ENDPOINT = "https://world.openfoodfacts.org/cgi/search.pl";
const PRODUCT_ENDPOINT = "https://world.openfoodfacts.org/api/v3.6/product";
const SOURCE_HOME = "https://world.openfoodfacts.org";
const APP_ID = "RecallRelay/3.0 (https://github.com/JPalchak/repair-relay-webmcp)";
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "image_front_small_url",
  "ingredients_text",
  "allergens_tags",
  "nutriscore_grade",
  "nova_group",
  "last_modified_t",
  "nutriments"
].join(",");

function boundedText(value, max = 240) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "images.openfoodfacts.org" ? url.href : "";
  } catch {
    return "";
  }
}

function grade(value) {
  const normalized = boundedText(value, 1).toLowerCase();
  return ["a", "b", "c", "d", "e"].includes(normalized) ? normalized : "unknown";
}

function nutrientNumber(product, key) {
  const value = Number(product?.nutriments?.[key]);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

export function normalizeProduct(product) {
  const code = boundedText(product?.code, 20).replace(/\D/g, "");
  if (!code) return null;
  const ingredients = boundedText(product?.ingredients_text, 420);
  const allergens = Array.isArray(product?.allergens_tags)
    ? product.allergens_tags.slice(0, 12).map((item) => boundedText(item, 50).replace(/^[a-z]{2}:/, "")).filter(Boolean)
    : [];
  const completeness = [product?.product_name, product?.brands, ingredients, product?.image_front_small_url, product?.nutriments]
    .filter(Boolean).length * 20;

  return {
    id: code,
    code,
    name: boundedText(product?.product_name, 100) || "Unnamed product",
    brand: boundedText(product?.brands, 80) || "Brand not recorded",
    quantity: boundedText(product?.quantity, 40),
    imageUrl: safeImage(product?.image_front_small_url),
    ingredients,
    allergens,
    nutriScore: grade(product?.nutriscore_grade),
    novaGroup: [1, 2, 3, 4].includes(Number(product?.nova_group)) ? Number(product.nova_group) : null,
    sugar100g: nutrientNumber(product, "sugars_100g"),
    salt100g: nutrientNumber(product, "salt_100g"),
    completeness,
    lastModified: Number.isFinite(Number(product?.last_modified_t))
      ? new Date(Number(product.last_modified_t) * 1000).toISOString()
      : null,
    sourceUrl: `${SOURCE_HOME}/product/${code}`
  };
}

function apiError(status) {
  if (status === 429 || status === 503) return new Error("Open Food Facts is temporarily rate-limited. Wait a moment and retry.");
  return new Error(`Open Food Facts returned HTTP ${status}. Retry the live search.`);
}

async function requestJson(url, { signal, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Live catalog request timed out.")), 12000);
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "X-User-Agent": APP_ID },
      signal: controller.signal
    });
    if (!response.ok) throw apiError(response.status);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("The live catalog did not respond within 12 seconds. Retry shortly.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export async function searchLiveProducts(query, options = {}) {
  if (typeof query !== "string") throw new Error("Search query must be a string.");
  const clean = boundedText(query, 80);
  if (clean.length < 2) throw new Error("Enter at least two characters to search the live catalog.");
  const url = new URL(SEARCH_ENDPOINT);
  url.search = new URLSearchParams({
    search_terms: clean,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "8",
    fields: FIELDS
  }).toString();
  const data = await requestJson(url, options);
  const products = Array.isArray(data?.products) ? data.products.map(normalizeProduct).filter(Boolean) : [];
  return {
    query: clean,
    total: Number(data?.count) || products.length,
    results: products,
    fetchedAt: new Date().toISOString(),
    source: "Open Food Facts",
    sourceUrl: SOURCE_HOME,
    live: true
  };
}

export async function lookupLiveBarcode(barcode, options = {}) {
  if (typeof barcode !== "string") throw new Error("Barcode must be a string.");
  const code = boundedText(barcode, 20).replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) throw new Error("Barcode must contain 8 to 14 digits.");
  const url = new URL(`${PRODUCT_ENDPOINT}/${code}.json`);
  url.searchParams.set("fields", FIELDS);
  const data = await requestJson(url, options);
  const product = normalizeProduct(data?.product);
  if (!product) throw new Error(`No live Open Food Facts record was found for barcode ${code}.`);
  return {
    query: code,
    total: 1,
    results: [product],
    fetchedAt: new Date().toISOString(),
    source: "Open Food Facts",
    sourceUrl: product.sourceUrl,
    live: true
  };
}

export const LIVE_CATALOG_META = Object.freeze({ source: "Open Food Facts", sourceUrl: SOURCE_HOME, appId: APP_ID });
