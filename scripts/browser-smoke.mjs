import { access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPayload, cpscPayload, fdaPayload } from "../tests/fixtures.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.LIVE_URL || "http://127.0.0.1:4173";
let server;

async function waitFor(url) {
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`Unable to reach ${url}`);
}

async function executablePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { await access("/opt/pw-browsers/chromium"); return "/opt/pw-browsers/chromium"; } catch { return undefined; }
}

if (!process.env.LIVE_URL) server = spawn(process.execPath, [resolve(root, "scripts/serve.mjs")], { cwd: root, stdio: "ignore" });

try {
  await waitFor(target);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, executablePath: await executablePath(), args: ["--enable-features=WebMCP,WebMCPTesting"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  // The browser lifecycle stays deterministic with API-shaped responses; npm run test:live probes the production sources.
  const json = (body) => (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("https://world.openfoodfacts.org/**", json(catalogPayload));
  await page.route("https://api.fda.gov/food/**", json(fdaPayload));
  await page.route("https://api.fda.gov/drug/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "NOT_FOUND" } }) }));
  await page.route("https://www.saferproducts.gov/**", json(cpscPayload));

  await page.addInitScript(() => {
    const registered = new Map();
    Object.defineProperty(Document.prototype, "modelContext", {
      configurable: true,
      get() {
        return {
          async registerTool(tool) { if (registered.has(tool.name)) throw new DOMException("Duplicate tool", "InvalidStateError"); registered.set(tool.name, tool); },
          async getTools() { return [...registered.values()]; }
        };
      }
    });
    window.__registeredWebMCPTools = registered;
  });

  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__recallRelay?.toolNames?.length === 10);
  const registered = await page.evaluate(() => [...window.__registeredWebMCPTools.values()].map((tool) => ({ name: tool.name, description: tool.description, closed: tool.inputSchema?.additionalProperties === false })));
  if (registered.length !== 10 || !registered.every((t) => t.closed)) throw new Error("WebMCP registration contract failed.");
  if (registered.find((t) => t.name === "search_products")?.description !== "Search the product catalog") throw new Error("Required search_products contract changed.");
  if (registered.some((t) => /^(?:luna|approve|resolve|discard|purchase|checkout)(?:_|$)/i.test(t.name))) throw new Error("Authority or development tool leaked into WebMCP.");

  const run = (name, input = {}) => page.evaluate(async ([toolName, toolInput]) => JSON.parse(await window.__registeredWebMCPTools.get(toolName).execute(toolInput, {})), [name, input]);

  // Agent: catalog → shelf → sweep → details → ask the person.
  const search = await run("search_products", { query: "peanut butter" });
  if (!search.live || !search.results.length) throw new Error("Agent search did not return live-shaped catalog data.");
  const added = await run("add_shelf_item", { productId: search.results[0].id });
  await page.waitForSelector(`[data-item-id="${added.item.id}"]`);
  const sweep = await run("sweep_shelf");
  if (!sweep.swept[0]?.upcMatch) throw new Error("Sweep did not flag the barcode match.");
  await page.waitForSelector(".candidate-upc");
  const shelf = await run("get_shelf");
  const recallId = shelf.items[0].candidateIds[0];
  const details = await run("get_recall_details", { recallId });
  if (!/1274425/.test(details.code)) throw new Error("Recall details missing lot text.");
  await run("request_package_reading", { itemId: added.item.id, fields: ["lot_code"], whereToLook: "Lot code printed beneath the best-by date on the lid; the recall covers 1274425 through 2140425.", recallId });
  await page.waitForSelector(".ask-open");
  if (await page.locator("#ask-banner").isHidden()) throw new Error("Reading request banner is not visible.");

  // Agent cannot judge before the person reads the package.
  const premature = await page.evaluate(async ([itemId, id]) => { try { await window.__registeredWebMCPTools.get("assess_item").execute({ itemId, verdict: "likely_affected", reasoning: "Guessing from the brand alone.", recallId: id }, {}); return null; } catch (error) { return error.message; } }, [added.item.id, recallId]);
  if (!/package reading/.test(premature ?? "")) throw new Error("Assessment was accepted without a package reading.");

  // Person: reads the lid (trusted UI), agent assesses, person decides.
  const card = page.locator(`[data-item-id="${added.item.id}"]`);
  await card.locator(".reading-form select").selectOption("lot_code");
  await card.locator(".reading-form input").fill("1301425");
  await card.locator(".reading-form button[type=submit]").click();
  await card.locator(".reading-human").waitFor();
  const assessed = await run("assess_item", { itemId: added.item.id, verdict: "likely_affected", reasoning: "Lot 1301425 is inside 1274425–2140425 and the UPC matches the notice.", recallId });
  if (assessed.assessment.verdict !== "likely_affected") throw new Error("Assessment did not post.");
  await card.locator(".assessment").waitFor();
  await card.locator(".decide-discard").click();
  await card.locator(".resolved").waitFor();
  const final = await run("get_shelf");
  if (final.items[0].resolution !== "discard" || final.unresolved !== 0) throw new Error("Human decision did not become agent-readable.");
  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);

  await mkdir(resolve(root, "reports"), { recursive: true });
  await page.screenshot({ path: resolve(root, "reports/browser-smoke.png"), fullPage: true });
  console.log(JSON.stringify({ passed: true, target, registeredTools: registered.length, sweep: sweep.swept, assessment: assessed.assessment.verdict, resolvedBy: "human", runtimeErrors: errors }, null, 2));
  await browser.close();
} finally {
  server?.kill("SIGTERM");
}
