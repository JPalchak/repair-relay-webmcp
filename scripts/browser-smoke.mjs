import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.LIVE_URL || "http://127.0.0.1:4173";
let server;

async function waitFor(url) {
  for (let index = 0; index < 60; index += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Unable to reach ${url}`);
}

if (!process.env.LIVE_URL) {
  server = spawn(process.execPath, [resolve(root, "scripts/serve.mjs")], { cwd: root, stdio: "ignore" });
}

const product = {
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
};
const alternate = {
  code: "3560070614202",
  product_name: "Whole Oat Flakes",
  brands: "Example",
  quantity: "18 oz",
  ingredients_text: "Whole oats",
  nutriscore_grade: "a",
  completeness: 0.67,
  last_modified_t: 1779551890,
  nutriments: { sugars_100g: 0.7 }
};

try {
  await waitFor(target);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--enable-features=WebMCP,WebMCPTesting"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  // Deterministic upstream responses test the complete production client lifecycle. npm run test:live separately probes Open Food Facts.
  await page.route("https://*.openfoodfacts.org/**", async (route) => {
    const body = route.request().url().includes("/api/v3.6/product/")
      ? { product }
      : { count: 2, products: [product, alternate] };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin" },
      body: JSON.stringify(body)
    });
  });

  await page.addInitScript(() => {
    const registered = new Map();
    Object.defineProperty(Document.prototype, "modelContext", {
      configurable: true,
      get() {
        return {
          async registerTool(tool) {
            if (registered.has(tool.name)) throw new DOMException("Duplicate tool", "InvalidStateError");
            registered.set(tool.name, tool);
          },
          async getTools() { return [...registered.values()]; }
        };
      }
    });
    window.__registeredWebMCPTools = registered;
  });

  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__labelRelay?.toolNames?.length === 8);
  const registered = await page.evaluate(() => [...window.__registeredWebMCPTools.values()].map((tool) => ({
    name: tool.name,
    description: tool.description,
    closed: tool.inputSchema?.additionalProperties === false,
    untrusted: tool.annotations?.untrustedContentHint === true
  })));
  if (registered.length !== 8 || !registered.every((tool) => tool.closed)) throw new Error("WebMCP registration contract failed.");
  const required = registered.find((tool) => tool.name === "search_products");
  if (required?.description !== "Search the product catalog") throw new Error("Required search_products contract changed.");
  if (registered.some((tool) => /^(?:luna|approve|purchase|checkout)(?:_|$)/i.test(tool.name))) {
    throw new Error("Development or authority tool leaked into WebMCP.");
  }

  await page.waitForSelector("#product-list .product-card", { timeout: 30000 });
  const liveState = await page.evaluate(() => window.__labelRelay.getState().search);
  if (!liveState?.live || liveState.source !== "Open Food Facts" || !liveState.fetchedAt) {
    throw new Error("Browser did not receive provenance-rich API-shaped data.");
  }
  if (liveState.results[0].id !== "030000010402" || liveState.results[0].ingredients !== "Whole Grain Rolled Oats") {
    throw new Error("Judge-demo barcode or English ingredient preference failed.");
  }

  const productId = liveState.results[0].id;
  await page.evaluate(async (id) => window.__registeredWebMCPTools.get("stage_verified_choice").execute({ productId: id, rationale: "Judge demo record." }, {}), productId);
  for (const [checkType, note] of [
    ["barcode_match", "The person said barcode 030000010402 matches."],
    ["ingredients_match", "The person said the package reads Whole Grain Rolled Oats."]
  ]) {
    const raw = await page.evaluate(async ({ id, checkType, note }) => window.__registeredWebMCPTools.get("record_package_check").execute({
      productId: id,
      checkType,
      outcome: "match",
      note
    }, {}), { id: productId, checkType, note });
    const parsed = JSON.parse(raw);
    if (!parsed.pendingHumanConfirmation || !/confirm or reject/.test(parsed.requiredAction)) {
      throw new Error("Agent-relayed check did not create a pending human attestation.");
    }
  }

  let state = await page.evaluate(() => window.__labelRelay.getState());
  if (state.stagedChoice.requiredChecks.length !== 2 || state.stagedChoice.pendingAttestationIds.length !== 2) {
    throw new Error("Agent relay incorrectly satisfied physical verification.");
  }
  if (await page.getByRole("button", { name: "Confirm I said this" }).count() !== 2) {
    throw new Error("Pending attestations did not render trusted confirmation controls.");
  }
  await page.getByRole("button", { name: "Confirm I said this" }).first().click();
  await page.getByRole("button", { name: "Confirm I said this" }).first().click();
  state = await page.evaluate(() => window.__labelRelay.getState());
  if (state.stagedChoice.requiredChecks.length || state.stagedChoice.pendingAttestationIds.length) {
    throw new Error("Trusted confirmations did not clear the staged requirements.");
  }

  await page.locator("#approval-checkbox").check();
  await page.locator("#approve-button").click();
  await page.locator("#verified-outcome").waitFor({ state: "visible" });
  const approved = JSON.parse(await page.evaluate(() => window.__registeredWebMCPTools.get("get_approved_choice").execute({}, {})));
  if (!approved.approved || approved.verifiedLabelSummary?.product?.ingredients !== "Whole Grain Rolled Oats") {
    throw new Error("Trusted approval did not unlock a useful verified label summary.");
  }

  // A later human-confirmed mismatch must invalidate approval and expose the correction path.
  await page.locator("#check-product").selectOption(productId);
  await page.locator("#check-type").selectOption("ingredients_match");
  await page.locator("#check-outcome").selectOption("mismatch");
  await page.locator("#check-note").fill("The package also lists salt, so this record is wrong for the package in hand.");
  await page.locator("#check-form button[type=submit]").click();
  await page.locator("#choice-verdict").waitFor({ state: "visible" });
  state = await page.evaluate(() => window.__labelRelay.getState());
  if (state.approvedChoice !== null || state.stagedChoice.status !== "record_mismatch") {
    throw new Error("Contradictory package evidence did not revoke approval and block the record.");
  }
  const correctionHref = await page.locator("#correction-link").getAttribute("href");
  if (!correctionHref?.endsWith("type=edit&code=030000010402")) throw new Error("Official correction link was not exposed.");

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`Mobile horizontal overflow: ${overflow}px`);

  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  await mkdir(resolve(root, "reports"), { recursive: true });
  await page.screenshot({ path: resolve(root, "reports/browser-smoke.png"), fullPage: true });
  console.log(JSON.stringify({
    passed: true,
    target,
    registeredTools: registered.length,
    liveSource: liveState.source,
    fetchedAt: liveState.fetchedAt,
    sampleProduct: liveState.results[0].name,
    agentRelayedChecks: 2,
    trustedHumanConfirmations: 2,
    approvalUnlockedSummary: true,
    laterMismatchRevokedApproval: true,
    correctionHref,
    mobileOverflowPixels: overflow,
    runtimeErrors: errors,
    claimBoundary: "This deterministic browser harness captures the production WebMCP callbacks and DOM. Native browser protocol testing is documented separately."
  }, null, 2));
  await browser.close();
} finally {
  server?.kill("SIGTERM");
}
