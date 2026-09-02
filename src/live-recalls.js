// Live recall sources. Every request goes to a production government API; there is no fixture fallback.
const FDA_BASE = "https://api.fda.gov";
const CPSC_ENDPOINT = "https://www.saferproducts.gov/RestWebServices/Recall";
const APP_ID = "RecallRelay/3.0 (https://github.com/JPalchak/repair-relay-webmcp)";

export const RECALL_SOURCES = Object.freeze({
  fda_food: { key: "fda_food", label: "FDA food enforcement reports", home: "https://open.fda.gov/apis/food/enforcement/", scope: "food" },
  fda_drug: { key: "fda_drug", label: "FDA drug enforcement reports", home: "https://open.fda.gov/apis/drug/enforcement/", scope: "drug" },
  cpsc: { key: "cpsc", label: "CPSC consumer product recalls", home: "https://www.cpsc.gov/Recalls", scope: "consumer" }
});

export const RECALL_SCOPES = Object.freeze(["all", "food", "drug", "consumer"]);

export function boundedText(value, max = 240) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

// A shelf barcode can appear in a notice as EAN-13, UPC-A, or UPC-A without its check digit, often with spaces.
export function barcodeVariants(barcode) {
  const code = digitsOnly(barcode);
  if (code.length < 11) return [];
  const variants = new Set([code]);
  if (code.length === 13 && code.startsWith("0")) variants.add(code.slice(1));
  for (const item of [...variants]) if (item.length === 12) variants.add(item.slice(0, 11));
  return [...variants].filter((item) => item.length >= 11);
}

export function upcMatches(barcode, ...texts) {
  const variants = barcodeVariants(barcode);
  if (!variants.length) return false;
  const haystack = digitsOnly(texts.join(" "));
  return variants.some((variant) => haystack.includes(variant));
}

function fdaDate(value) {
  const digits = digitsOnly(value);
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : null;
}

function isoDate(value) {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function idPart(value) {
  return boundedText(value, 40).replace(/[^A-Za-z0-9._-]/g, "-");
}

function safeUrl(value, hosts) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.includes(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeFdaRecall(record, scope) {
  const recallNumber = boundedText(record?.recall_number, 40);
  if (!recallNumber) return null;
  return {
    id: `fda-${idPart(recallNumber)}`,
    source: "FDA",
    scope,
    recallNumber,
    firm: boundedText(record?.recalling_firm, 120) || "Firm not stated",
    product: boundedText(record?.product_description, 400) || "Product not described",
    reason: boundedText(record?.reason_for_recall, 400) || "Reason not stated",
    codeInfo: boundedText(record?.code_info, 900) || "No lot, date, or code information published.",
    classification: boundedText(record?.classification, 20) || "Unclassified",
    status: boundedText(record?.status, 30) || "Unknown",
    initiated: fdaDate(record?.recall_initiation_date),
    reported: fdaDate(record?.report_date),
    distribution: boundedText(record?.distribution_pattern, 240),
    quantity: boundedText(record?.product_quantity, 120),
    remedy: "",
    url: `https://api.fda.gov/${scope}/enforcement.json?search=recall_number:"${encodeURIComponent(recallNumber)}"`
  };
}

function names(list, key = "Name") {
  return Array.isArray(list) ? list.map((item) => boundedText(item?.[key], 120)).filter(Boolean) : [];
}

export function normalizeCpscRecall(record) {
  const recallNumber = boundedText(record?.RecallNumber, 40) || boundedText(record?.RecallID, 40);
  if (!recallNumber) return null;
  const products = Array.isArray(record?.Products) ? record.Products : [];
  const models = products.map((item) => boundedText(item?.Model, 160)).filter(Boolean);
  const upcs = Array.isArray(record?.ProductUPCs) ? record.ProductUPCs.map((item) => boundedText(typeof item === "string" ? item : item?.UPC, 40)).filter(Boolean) : [];
  const identification = [
    models.length ? `Models: ${models.join("; ")}` : "",
    upcs.length ? `UPCs: ${upcs.join(", ")}` : "",
    boundedText(record?.SoldAtLabel, 200) ? `Sold at: ${boundedText(record?.SoldAtLabel, 200)}` : "",
    boundedText(record?.Description, 500)
  ].filter(Boolean).join(" · ");
  const firm = names(record?.Manufacturers)[0] || names(record?.Importers)[0] || names(record?.Distributors)[0] || "Firm not stated";
  return {
    id: `cpsc-${idPart(recallNumber)}`,
    source: "CPSC",
    scope: "consumer",
    recallNumber,
    firm,
    product: names(products).join("; ").slice(0, 400) || boundedText(record?.Title, 400) || "Product not described",
    reason: names(record?.Hazards)[0]?.slice(0, 400) || boundedText(record?.Title, 400) || "Hazard not stated",
    codeInfo: identification.slice(0, 900) || "No model, date, or code information published.",
    classification: "CPSC recall",
    status: "Announced",
    initiated: isoDate(record?.RecallDate),
    reported: isoDate(record?.LastPublishDate) || isoDate(record?.RecallDate),
    distribution: names(record?.Retailers).join("; ").slice(0, 240),
    quantity: boundedText(products[0]?.NumberOfUnits, 120),
    remedy: names(record?.Remedies)[0]?.slice(0, 400) || "",
    url: safeUrl(record?.URL, ["www.cpsc.gov", "cpsc.gov"]) || "https://www.cpsc.gov/Recalls"
  };
}

function cleanQuery(query) {
  const clean = boundedText(query, 80).replace(/[^\p{L}\p{N}\s.&'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (clean.length < 2) throw new Error("Recall search needs at least two characters of brand, product, or firm name.");
  return clean;
}

async function requestJson(url, { signal, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Recall source timed out.")), 15000);
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json", "X-User-Agent": APP_ID }, signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, ok: response.ok, body };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error("The recall source did not respond within 15 seconds.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

function windowStart(months) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

function compact(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function searchFda(scope, query, { months, signal, fetchImpl }) {
  const url = new URL(`${FDA_BASE}/${scope}/enforcement.json`);
  const from = compact(windowStart(months));
  const to = compact(new Date());
  url.search = new URLSearchParams({
    search: `(product_description:"${query}" OR recalling_firm:"${query}") AND report_date:[${from} TO ${to}]`,
    sort: "report_date:desc",
    limit: "10"
  }).toString();
  const { status, ok, body } = await requestJson(url, { signal, fetchImpl });
  if (status === 404 && body?.error?.code === "NOT_FOUND") return { results: [], total: 0, lastUpdated: null };
  if (status === 429) throw new Error("openFDA rate limit reached. Wait a minute and retry.");
  if (!ok) throw new Error(`openFDA returned HTTP ${status}.`);
  const results = Array.isArray(body?.results) ? body.results.map((item) => normalizeFdaRecall(item, scope)).filter(Boolean) : [];
  return { results, total: Number(body?.meta?.results?.total) || results.length, lastUpdated: boundedText(body?.meta?.last_updated, 20) || null };
}

async function searchCpsc(query, { months, signal, fetchImpl }) {
  const url = new URL(CPSC_ENDPOINT);
  url.search = new URLSearchParams({ format: "json", ProductName: query, RecallDateStart: windowStart(months).toISOString().slice(0, 10) }).toString();
  const { status, ok, body } = await requestJson(url, { signal, fetchImpl });
  if (!ok) throw new Error(`CPSC returned HTTP ${status}.`);
  const list = Array.isArray(body) ? body : [];
  const results = list.map(normalizeCpscRecall).filter(Boolean).sort((a, b) => String(b.initiated).localeCompare(String(a.initiated))).slice(0, 10);
  return { results, total: list.length, lastUpdated: null };
}

export function sourcesForScope(scope = "all") {
  if (!RECALL_SCOPES.includes(scope)) throw new Error("scope must be all, food, drug, or consumer.");
  return Object.values(RECALL_SOURCES).filter((source) => scope === "all" || source.scope === scope);
}

// Runs every selected live source; per-source failures are reported, and only a total failure throws.
export async function searchRecalls(query, { scope = "all", months = 24, signal, fetchImpl } = {}) {
  const clean = cleanQuery(query);
  const sources = sourcesForScope(scope);
  const settled = await Promise.allSettled(sources.map((source) => (
    source.key === "cpsc" ? searchCpsc(clean, { months, signal, fetchImpl }) : searchFda(source.scope, clean, { months, signal, fetchImpl })
  )));
  const report = settled.map((entry, index) => {
    const source = sources[index];
    if (entry.status === "fulfilled") return { source: source.key, label: source.label, status: "ok", total: entry.value.total, lastUpdated: entry.value.lastUpdated, message: "" };
    const message = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
    return { source: source.key, label: source.label, status: "error", total: 0, lastUpdated: null, message };
  });
  if (report.every((entry) => entry.status === "error")) {
    throw new Error(`Every recall source failed: ${report.map((entry) => `${entry.label}: ${entry.message}`).join(" | ")}`);
  }
  const results = settled.flatMap((entry) => (entry.status === "fulfilled" ? entry.value.results : []))
    .sort((a, b) => String(b.reported ?? "").localeCompare(String(a.reported ?? "")))
    .slice(0, 12);
  return { query: clean, scope, months, fetchedAt: new Date().toISOString(), live: true, sources: report, results };
}
