const SEARCH_ENDPOINT = "https://world.openfoodfacts.org/cgi/search.pl";
const PRODUCT_ENDPOINT = "https://world.openfoodfacts.org/api/v3.6/product";
const SOURCE_HOME = "https://world.openfoodfacts.org";
const APP_ID = "LabelRelay/2.1 (https://github.com/JPalchak/repair-relay-webmcp)";
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "image_front_small_url",
  "ingredients_text_en",
  "ingredients_text",
  "allergens_tags",
  "nutriscore_grade",
  "nova_group",
  "last_modified_t",
  "completeness",
  "countries_tags",
  "nutriments"
].join(",");

function boundedText(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
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

function completenessPercent(product, ingredients) {
  const upstream = Number(product?.completeness);
  if (Number.isFinite(upstream)) {
    const percent = upstream <= 1 ? upstream * 100 : upstream;
    return Math.max(0, Math.min(100, Math.round(percent)));
  }
  return [product?.product_name, product?.brands, ingredients, product?.image_front_small_url, product?.nutriments]
    .filter(Boolean).length * 20;
}

export function normalizeProduct(product) {
  const code = boundedText(product?.code, 20).replace(/\D/g, "");
  if (!code) return null;
  const englishIngredients = boundedText(product?.ingredients_text_en, 420);
  const ingredients = englishIngredients || boundedText(product?.ingredients_text, 420);
  const allergens = Array.isArray(product?.allergens_tags)
    ? product.allergens_tags
        .slice(0, 12)
        .map((item) => boundedText(item, 50).replace(/^[a-z]{2}:/, ""))
        .filter(Boolean)
    : [];
  const countries = Array.isArray(product?.countries_tags)
    ? product.countries_tags
        .slice(0, 8)
        .map((item) => boundedText(item, 60).replace(/^[a-z]{2}:/, ""))
        .filter(Boolean)
    : [];

  return {
    id: code,
    code,
    name: boundedText(product?.product_name, 100) || "Unnamed product",
    brand: boundedText(product?.brands, 80) || "Brand not recorded",
    quantity: boundedText(product?.quantity, 40),
    imageUrl: safeImage(product?.image_front_small_url),
    ingredients,
    ingredientsLanguage: englishIngredients ? "English" : ingredients ? "Source language" : "Not recorded",
    allergens,
    countries,
    nutriScore: grade(product?.nutriscore_grade),
    novaGroup: [1, 2, 3, 4].includes(Number(product?.nova_group)) ? Number(product.nova_group) : null,
    sugar100g: nutrientNumber(product, "sugars_100g"),
    salt100g: nutrientNumber(product, "salt_100g"),
    completeness: completenessPercent(product, ingredients),
    lastModified: Number.isFinite(Number(product?.last_modified_t))
      ? new Date(Number(product.last_modified_t) * 1000).toISOString()
      : null,
    sourceUrl: `${SOURCE_HOME}/product/${code}`
  };
}

function apiError(status) {
  if (status === 429 || status === 503) return new Error("Open Food Facts is temporarily unavailable or rate-limited. Retry the live request shortly.");
  return new Error(`Open Food Facts returned HTTP ${status}. Retry the live request.`);
}

async function parseJsonResponse(response) {
  try {
    if (typeof response.text === "function") {
      const raw = await response.text();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("JSON response was not an object.");
      return parsed;
    }
    const parsed = await response.json();
    if (!parsed || typeof parsed !== "object") throw new Error("JSON response was not an object.");
    return parsed;
  } catch {
    throw new Error("Open Food Facts returned an unreadable response instead of JSON. Retry the live request.");
  }
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
    return await parseJsonResponse(response);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error("The live catalog did not respond within 12 seconds. Retry the live request.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

function sortResults(products) {
  return products.sort((left, right) => {
    if (right.completeness !== left.completeness) return right.completeness - left.completeness;
    return String(right.lastModified ?? "").localeCompare(String(left.lastModified ?? ""));
  });
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
    page_size: "10",
    fields: FIELDS,
    tagtype_0: "countries",
    tag_contains_0: "contains",
    tag_0: "en:united-states"
  }).toString();
  const data = await requestJson(url, options);
  const products = sortResults(Array.isArray(data?.products) ? data.products.map(normalizeProduct).filter(Boolean) : []);
  return {
    query: clean,
    total: Number(data?.count) || products.length,
    results: products,
    fetchedAt: new Date().toISOString(),
    source: "Open Food Facts",
    sourceUrl: SOURCE_HOME,
    searchScope: "Products reported as sold in the United States",
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
    searchScope: "Worldwide barcode record",
    live: true
  };
}

export const LIVE_CATALOG_META = Object.freeze({
  source: "Open Food Facts",
  sourceUrl: SOURCE_HOME,
  searchUrl: SEARCH_ENDPOINT,
  appId: APP_ID
});
