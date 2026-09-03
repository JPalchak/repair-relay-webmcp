import { cp, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const reports = resolve(root, "reports");
const target = "http://127.0.0.1:4173";
const sampleBarcode = "030000010402";

await mkdir(reports, { recursive: true });

const narration = `Label Relay is for allergy-aware households and caregivers using browser agents to compare packaged foods. Open Food Facts can search millions of community records, but it cannot know whether this record matches the box in a person's hand. The person can read the box, but should not have to manually reconcile database fields, provenance, and agent context.

The demo begins with a real Open Food Facts version three point six barcode lookup for Quaker Old Fashioned Oats. The page shows the source, retrieval time, upstream completeness, English ingredient text when available, and the exact barcode. There is no static product fallback in the application.

The browser agent now stages the current record. It can search and organize, but it cannot see the package. When the person says that the barcode and the words Whole Grain Rolled Oats match, the agent relays those statements through Web M C P.

Notice what does not happen. The required checks remain blocked. Each statement appears as a pending attestation, and the tool explicitly says that it cleared nothing. Label Relay records an attestation, not proof that the package was inspected.

The person confirms each exact statement with a visible trusted click. Only then do the barcode and ingredient requirements clear. The person reviews the remaining uncertainty and approves the match.

Approval now has a practical consequence. A source-backed label summary appears in the page and becomes readable through get approved choice. The person and agent can continue an ingredient, allergen, or dietary-screening conversation without losing which facts came from Open Food Facts and which were confirmed by the person.

The mismatch path is even more important. When the person reports that the package contains an extra ingredient, the prior approval is revoked. The record is marked wrong for this package, further approval is blocked, and Label Relay opens the official Open Food Facts correction form for the exact barcode.

The agent contributes live catalog scale. The person contributes package truth. Web M C P makes the handoff visible, specific, and consequential.`;
await writeFile(resolve(reports, "demo-narration.txt"), narration, "utf8");

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error(`Unable to reach ${url}.`);
}

async function callTool(page, name, input) {
  return page.evaluate(async ({ name: toolName, input: toolInput }) => {
    if (document.modelContext?.getTools && document.modelContext?.executeTool) {
      const tool = (await document.modelContext.getTools()).find((item) => item.name === toolName);
      if (!tool) throw new Error(`Native WebMCP tool not found: ${toolName}`);
      const result = await document.modelContext.executeTool(tool, JSON.stringify(toolInput));
      return { transport: "document.modelContext", result };
    }
    if (navigator.modelContextTesting?.listTools && navigator.modelContextTesting?.executeTool) {
      const tools = await navigator.modelContextTesting.listTools();
      if (!tools.some((item) => item.name === toolName)) throw new Error(`Native preview tool not found: ${toolName}`);
      const result = await navigator.modelContextTesting.executeTool(toolName, JSON.stringify(toolInput));
      return { transport: "navigator.modelContextTesting", result };
    }
    const result = await window.__labelRelay.invokeTool(toolName, toolInput);
    return { transport: "production callback fallback", result };
  }, { name, input });
}

async function waitForLiveProduct(page) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await page.locator("#product-list .product-card").first().waitFor({ state: "visible", timeout: 16_000 });
      const state = await page.evaluate(() => window.__labelRelay.getState());
      if (state.search?.live && state.search.results?.length) return state.search.results[0];
    } catch {}
    const retry = page.locator("#retry-search-button");
    if (await retry.isVisible().catch(() => false)) await retry.click();
    else {
      await page.locator("#barcode-input").fill(sampleBarcode);
      await page.locator("#barcode-form button[type=submit]").click();
    }
    await wait(2_000 * attempt);
  }
  const state = await page.evaluate(() => window.__labelRelay.getState());
  throw new Error(`Live barcode lookup never produced a product: ${state.searchError || "unknown error"}`);
}

const server = spawn(process.execPath, [resolve(root, "scripts/serve.mjs")], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

let browser;
try {
  await waitForServer(target);
  const { chromium } = await import("playwright");
  const launchOptions = {
    headless: true,
    args: [
      "--enable-features=WebMCP,WebMCPTesting",
      "--disable-dev-shm-usage",
      "--no-sandbox"
    ]
  };
  try {
    browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOptions);
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: { dir: resolve(reports, "demo-video-raw"), size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const product = await waitForLiveProduct(page);
  const liveState = await page.evaluate(() => window.__labelRelay.getState().search);
  await page.screenshot({ path: resolve(reports, "demo-live-first-frame.png"), fullPage: false });
  await wait(9_000);

  await page.locator("#product-list .product-card").first().scrollIntoViewIfNeeded();
  await wait(6_000);

  const stage = await callTool(page, "stage_verified_choice", {
    productId: product.id,
    rationale: "This is the current live barcode record; package attestations remain authoritative."
  });
  await page.locator("#choice-panel").scrollIntoViewIfNeeded();
  await wait(8_000);

  const relays = [];
  for (const [checkType, note] of [
    ["barcode_match", `The person says the printed barcode ${product.id} matches.`],
    ["ingredients_match", "The person says the package ingredient line reads Whole Grain Rolled Oats."]
  ]) {
    relays.push(await callTool(page, "record_package_check", {
      productId: product.id,
      checkType,
      outcome: "match",
      note
    }));
    await wait(2_000);
  }
  await page.locator("#human-heading").scrollIntoViewIfNeeded();
  await wait(10_000);

  const confirmations = page.getByRole("button", { name: "Confirm I said this" });
  if (await confirmations.count() !== 2) throw new Error("Expected two pending human attestation controls.");
  await confirmations.first().click();
  await wait(4_000);
  await confirmations.first().click();
  await wait(6_000);

  await page.locator("#choice-panel").scrollIntoViewIfNeeded();
  await page.locator("#approval-checkbox").check();
  await wait(4_000);
  await page.locator("#approve-button").click();
  await page.locator("#verified-outcome").waitFor({ state: "visible", timeout: 8_000 });
  await wait(10_000);

  const approved = await callTool(page, "get_approved_choice", {});
  await wait(6_000);

  await page.locator("#human-heading").scrollIntoViewIfNeeded();
  await page.locator("#check-product").selectOption(product.id);
  await page.locator("#check-type").selectOption("ingredients_match");
  await page.locator("#check-outcome").selectOption("mismatch");
  await page.locator("#check-note").fill("The package also lists salt, so the community record is wrong for this package.");
  await wait(5_000);
  await page.locator("#check-form button[type=submit]").click();
  await page.locator("#choice-verdict").waitFor({ state: "visible", timeout: 8_000 });
  await page.locator("#choice-panel").scrollIntoViewIfNeeded();
  await wait(13_000);

  await page.locator(".hero").scrollIntoViewIfNeeded();
  await wait(8_000);

  const finalState = await page.evaluate(() => window.__labelRelay.getState());
  const nativeSurface = await page.evaluate(() => ({
    documentModelContext: Boolean(document.modelContext),
    documentTesting: Boolean(document.modelContext?.getTools && document.modelContext?.executeTool),
    navigatorModelContext: Boolean(navigator.modelContext),
    navigatorTesting: Boolean(navigator.modelContextTesting)
  }));

  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
  if (!finalState.search?.live) throw new Error("Capture did not use a live search result.");
  if (finalState.stagedChoice?.status !== "record_mismatch") throw new Error("Capture did not finish on the mismatch path.");

  const video = page.video();
  await page.close();
  await context.close();
  const recordedPath = await video.path();
  await cp(recordedPath, resolve(reports, "label-relay-demo-raw.webm"));

  const report = {
    capturedAt: new Date().toISOString(),
    browserVersion: browser.version(),
    liveData: {
      source: liveState.source,
      sourceUrl: liveState.sourceUrl,
      fetchedAt: liveState.fetchedAt,
      searchScope: liveState.searchScope,
      product: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        sourceUrl: product.sourceUrl,
        lastModified: product.lastModified,
        completeness: product.completeness
      }
    },
    nativeSurface,
    toolTransport: stage.transport,
    relayTransports: relays.map((item) => item.transport),
    approvedTransport: approved.transport,
    trustedHumanConfirmations: 2,
    trustedHumanApproval: true,
    mismatchRevokedApproval: finalState.approvedChoice === null,
    correctionUrl: finalState.stagedChoice.correctionUrl,
    browserErrors,
    claimBoundary: "The screen capture uses the production application and actual Open Food Facts network data on a local static server. The report records whether this runner exposed a native testing transport or required the production-callback fallback."
  };
  await writeFile(resolve(reports, "demo-capture-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await writeFile(resolve(reports, "demo-capture-failure.txt"), `${error instanceof Error ? error.stack : error}\n\n${serverLog}`, "utf8");
  throw error;
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
