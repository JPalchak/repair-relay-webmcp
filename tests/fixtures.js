// Test-only API-shaped payloads. The application itself never falls back to these.
export const catalogPayload = {
  count: 2,
  products: [
    { code: "0051500241219", product_name: "Creamy Peanut Butter", brands: "Jif", quantity: "16 oz", ingredients_text: "Roasted peanuts, sugar", allergens_tags: ["en:peanuts"], nutriscore_grade: "d", last_modified_t: 1780104331, nutriments: { sugars_100g: 9 } },
    { code: "3168930003632", product_name: "Quaker Oats", brands: "Quaker", quantity: "800 g", ingredients_text: "100% oatmeal", allergens_tags: ["en:gluten"], nutriscore_grade: "a", last_modified_t: 1779551890, nutriments: { sugars_100g: 1.1 } }
  ]
};

export const fdaPayload = {
  meta: { disclaimer: "Do not rely on openFDA…", last_updated: "2026-08-19", results: { skip: 0, limit: 10, total: 1 } },
  results: [
    {
      recall_number: "F-0001-2026",
      event_id: "90001",
      recalling_firm: "Sample Nut Company",
      product_description: "Creamy Peanut Butter, 16 oz plastic jar, UPC 0 51500 24121 9",
      reason_for_recall: "Potential Salmonella contamination",
      code_info: "Lot codes 1274425 through 2140425, printed beneath the best-by date on the lid.",
      classification: "Class I",
      status: "Ongoing",
      recall_initiation_date: "20260501",
      report_date: "20260510",
      distribution_pattern: "Nationwide",
      product_quantity: "12,000 jars"
    }
  ]
};

export const cpscPayload = [
  {
    RecallID: 10904,
    RecallNumber: "26669",
    RecallDate: "2026-08-06T00:00:00",
    Description: "Tri-fold play yard mattresses, white with letter print.",
    URL: "https://www.cpsc.gov/Recalls/2026/Sample-Recall",
    Title: "Play Yard Mattresses Recalled Due to Entrapment Hazard",
    ConsumerContact: "Sample by email.",
    LastPublishDate: "2026-08-07T00:00:00",
    Products: [{ Name: "Voomf Play Yard and Crib Mattresses", Description: "", Model: "VM-100", Type: "", NumberOfUnits: "About 2,401" }],
    Manufacturers: [{ Name: "Voomf" }],
    Retailers: [{ Name: "Online at Amazon.com" }],
    ProductUPCs: [],
    Hazards: [{ Name: "Undersized mattress poses an entrapment hazard." }],
    Remedies: [{ Name: "Stop using immediately and contact Voomf for a refund." }]
  }
];

export function fetchStub(overrides = {}) {
  return async (url) => {
    const href = String(url);
    const respond = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) });
    if (href.includes("openfoodfacts.org")) return respond(overrides.catalogStatus ?? 200, overrides.catalog ?? catalogPayload);
    if (href.includes("api.fda.gov/food")) return respond(overrides.fdaStatus ?? 200, overrides.fda ?? fdaPayload);
    if (href.includes("api.fda.gov/drug")) return respond(404, { error: { code: "NOT_FOUND", message: "No matches found!" } });
    if (href.includes("saferproducts.gov")) return respond(overrides.cpscStatus ?? 200, overrides.cpsc ?? cpscPayload);
    throw new Error(`Unexpected fetch: ${href}`);
  };
}

export async function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await run(); } finally { globalThis.fetch = original; }
}
