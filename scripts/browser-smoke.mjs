import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.env.LIVE_URL || "http://127.0.0.1:4173";
let server = null;

async function waitForUrl(url, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Unable to reach ${url}`);
}

if (!process.env.LIVE_URL) {
  server = spawn(process.execPath, [resolve(root, "scripts/serve.mjs")], {
    cwd: root,
    stdio: "ignore"
  });
}

try {
  await waitForUrl(target);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-features=WebMCP,WebMCPTesting"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

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
          async getTools() {
            return [...registered.values()];
          }
        };
      }
    });
    window.__registeredWebMCPTools = registered;
  });

  await page.goto(target, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__repairRelay?.toolNames?.length === 8);

  const registered = await page.evaluate(() =>
    [...window.__registeredWebMCPTools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      closed: tool.inputSchema?.additionalProperties === false
    }))
  );
  if (registered.length !== 8) throw new Error(`Expected 8 registered tools, found ${registered.length}.`);
  if (!registered.every((tool) => tool.closed)) throw new Error("At least one registered schema is not closed.");
  const required = registered.find((tool) => tool.name === "search_products");
  if (!required || required.description !== "Search the product catalog") {
    throw new Error("Required search_products contract is missing or changed.");
  }
  if (registered.some((tool) => /^(approve|authorize)(_|$)/i.test(tool.name))) {
    throw new Error("An agent approval tool is exposed.");
  }

  await page.evaluate(async () => {
    await window.__repairRelay.invokeTool("search_products", {
      query: "restore weak airflow with a direct-fit filter",
      model: "AP-200",
      budget: 65
    });
  });
  await page.waitForSelector("#product-list .product-card");
  const before = await page.evaluate(() => window.__repairRelay.getState().search.results[0].confidence);

  await page.evaluate(async () => {
    await window.__repairRelay.invokeTool("record_observation", {
      text: "The filter is gray and a bright light cannot pass through the media.",
      tag: "blocked_filter",
      confidence: 0.95
    });
    await window.__repairRelay.invokeTool("search_products", {
      query: "restore weak airflow with a direct-fit filter",
      model: "AP-200",
      budget: 65
    });
  });
  const after = await page.evaluate(() => window.__repairRelay.getState().search.results[0].confidence);
  if (after - before < 5) throw new Error(`Physical evidence changed confidence by only ${after - before}.`);

  const candidateId = await page.evaluate(() => window.__repairRelay.getState().search.results[0].id);
  await page.evaluate(async (id) => {
    await window.__repairRelay.invokeTool("stage_repair_plan", {
      candidateId: id,
      objective: "Restore AP-200 airflow safely"
    });
  }, candidateId);
  const staged = await page.evaluate(() => window.__repairRelay.getState().stagedPlan);
  if (staged.status !== "staged" || staged.approvedAt !== null) throw new Error("Staged plan was implicitly approved.");

  await page.evaluate(async () => {
    await window.__repairRelay.invokeTool("request_human_decision", {
      reason: "The compatibility and stop conditions are ready for human review."
    });
  });
  await page.waitForFunction(() => document.querySelector("#decision-dialog")?.open === true);
  await page.locator("#decision-dialog button[value=review]").click();
  await page.locator("#approval-checkbox").check();
  await page.locator("#approve-button").click();

  const approved = JSON.parse(
    await page.evaluate(async () => window.__repairRelay.invokeTool("get_approved_plan", {}))
  );
  if (!approved.approved || approved.plan.approvedBy !== "human") {
    throw new Error("Trusted human approval did not become readable to the agent.");
  }

  const luna = JSON.parse(
    await page.evaluate(async () => window.__repairRelay.invokeTool("run_luna_review", {}))
  );
  if (luna.score !== 30) throw new Error(`Luna score was ${luna.score}/30.`);
  if (runtimeErrors.length) throw new Error(`Page errors: ${runtimeErrors.join(" | ")}`);

  await mkdir(resolve(root, "reports"), { recursive: true });
  await page.screenshot({ path: resolve(root, "reports/browser-smoke.png"), fullPage: true });

  console.log(JSON.stringify({
    passed: true,
    target,
    registeredTools: registered.length,
    evidenceConfidenceDelta: after - before,
    stagedStatus: staged.status,
    approvedBy: approved.plan.approvedBy,
    lunaScore: luna.score,
    runtimeErrors
  }, null, 2));

  await browser.close();
} finally {
  server?.kill("SIGTERM");
}
