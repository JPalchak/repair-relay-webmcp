import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const reports = resolve(root, "reports");
const target = process.env.PUBLIC_URL || "https://repair-relay-webmcp.ottermode.chatgpt.site";
const barcode = "030000010402";
await mkdir(reports, { recursive: true });

function sleep(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function executeNative(page, name, input) {
  return page.evaluate(async ({ name: toolName, input: toolInput }) => {
    if (document.modelContext?.getTools && document.modelContext?.executeTool) {
      const tool = (await document.modelContext.getTools()).find((item) => item.name === toolName);
      if (!tool) throw new Error(`Native document.modelContext tool missing: ${toolName}`);
      return { transport: "document.modelContext", raw: await document.modelContext.executeTool(tool, JSON.stringify(toolInput)) };
    }
    if (navigator.modelContextTesting?.listTools && navigator.modelContextTesting?.executeTool) {
      const tools = await navigator.modelContextTesting.listTools();
      if (!tools.some((item) => item.name === toolName)) throw new Error(`Native preview tool missing: ${toolName}`);
      return { transport: "navigator.modelContextTesting", raw: await navigator.modelContextTesting.executeTool(toolName, JSON.stringify(toolInput)) };
    }
    throw new Error("No native WebMCP testing surface is available in this browser.");
  }, { name, input });
}

let browser;
try {
  const { chromium } = await import("playwright");
  const launchOptions = {
    headless: true,
    args: ["--enable-features=WebMCP,WebMCPTesting", "--disable-dev-shm-usage", "--no-sandbox"]
  };
  try {
    browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOptions);
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const browserErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));

  const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (!response?.ok()) throw new Error(`Public URL returned HTTP ${response?.status() ?? "unknown"}.`);
  const title = await page.title();
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes("For allergy-aware households and caregivers")) {
    throw new Error(`Public origin is not the current Label Relay release. Title: ${title}`);
  }
  await page.waitForFunction(() => window.__labelRelay?.toolNames?.length === 8, null, { timeout: 20_000 });

  const surface = await page.evaluate(() => ({
    documentModelContext: Boolean(document.modelContext),
    documentTesting: Boolean(document.modelContext?.getTools && document.modelContext?.executeTool),
    navigatorModelContext: Boolean(navigator.modelContext),
    navigatorTesting: Boolean(navigator.modelContextTesting)
  }));
  if (!surface.documentTesting && !surface.navigatorTesting) throw new Error("Public origin loaded, but the browser exposed no native WebMCP testing surface.");

  const tools = await page.evaluate(async () => {
    if (document.modelContext?.getTools) return (await document.modelContext.getTools()).map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));
    return navigator.modelContextTesting.listTools();
  });
  if (tools.length !== 8) throw new Error(`Expected 8 native tools on public origin; found ${tools.length}.`);
  const recordTool = tools.find((tool) => tool.name === "record_package_check");
  if (!recordTool || !String(recordTool.description).includes("pending")) throw new Error("Public origin exposes the obsolete record_package_check contract.");

  const lookup = await executeNative(page, "lookup_barcode", { barcode });
  const lookupResult = JSON.parse(lookup.raw);
  const productId = lookupResult.result?.id;
  if (!productId) throw new Error("Public native barcode lookup returned no product ID.");

  await executeNative(page, "stage_verified_choice", { productId, rationale: "Public-origin verification." });
  for (const [checkType, note] of [
    ["barcode_match", `The person says the printed barcode ${productId} matches.`],
    ["ingredients_match", "The person says the package reads Whole Grain Rolled Oats."]
  ]) {
    const result = JSON.parse((await executeNative(page, "record_package_check", { productId, checkType, outcome: "match", note })).raw);
    if (result.pendingHumanConfirmation !== true || !String(result.caution).includes("no required check was cleared")) {
      throw new Error(`Public ${checkType} relay bypassed or misreported the human boundary.`);
    }
  }

  const confirmations = page.getByRole("button", { name: "Confirm I said this" });
  if (await confirmations.count() !== 2) throw new Error("Public page did not render two pending human confirmation controls.");
  await confirmations.first().click();
  await confirmations.first().click();
  await page.locator("#approval-checkbox").check();
  await page.locator("#approve-button").click();
  await page.locator("#verified-outcome").waitFor({ state: "visible", timeout: 10_000 });
  const approved = JSON.parse((await executeNative(page, "get_approved_choice", {})).raw);
  if (!approved.approved || !approved.verifiedLabelSummary) throw new Error("Public approval did not unlock the verified-label summary.");

  await page.locator("#check-product").selectOption(productId);
  await page.locator("#check-type").selectOption("ingredients_match");
  await page.locator("#check-outcome").selectOption("mismatch");
  await page.locator("#check-note").fill("The package also lists salt, so the community record is wrong for this package.");
  await page.locator("#check-form button[type=submit]").click();
  await page.locator("#choice-verdict").waitFor({ state: "visible", timeout: 10_000 });
  const finalState = await page.evaluate(() => window.__labelRelay.getState());
  if (finalState.approvedChoice !== null || finalState.stagedChoice?.status !== "record_mismatch") {
    throw new Error("Public mismatch path did not revoke approval and block the record.");
  }

  await page.screenshot({ path: resolve(reports, "public-origin-smoke.png"), fullPage: true });
  const report = {
    passed: true,
    target,
    checkedAt: new Date().toISOString(),
    title,
    browserVersion: browser.version(),
    nativeSurface: surface,
    registeredTools: tools.map((tool) => tool.name),
    transport: lookup.transport,
    liveProductId: productId,
    liveSourceUrl: lookupResult.sourceUrl,
    trustedHumanConfirmations: 2,
    trustedHumanApproval: true,
    mismatchRevokedApproval: true,
    correctionUrl: finalState.stagedChoice.correctionUrl,
    browserErrors,
    failedRequests,
  };
  if (browserErrors.length) throw new Error(`Public browser errors: ${browserErrors.join(" | ")}`);
  await writeFile(resolve(reports, "public-origin-smoke.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = {
    passed: false,
    target,
    checkedAt: new Date().toISOString(),
    error: error instanceof Error ? error.stack : String(error)
  };
  await writeFile(resolve(reports, "public-origin-smoke.json"), JSON.stringify(report, null, 2), "utf8");
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
