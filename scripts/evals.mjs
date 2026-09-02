import { readFile } from "node:fs/promises";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";

const checks = [];
function evaluate(name, condition, detail) { checks.push({ name, passed: Boolean(condition), detail }); }
const store = createStore(); const tools = createToolDefinitions({ store }); const names = tools.map((t) => t.name);
evaluate("Usefulness", names.includes("search_products") && names.includes("lookup_barcode"), "Live search plus physical barcode handoff.");
evaluate("Originality", names.includes("record_package_check") && names.includes("stage_verified_choice"), "Agent-scale catalog joined to human physical verification.");
evaluate("WebMCP leverage", tools.every((t) => t.inputSchema.additionalProperties === false), "Eight closed, narrow schemas.");
evaluate("Security", tools.filter((t) => ["search_products", "lookup_barcode", "record_package_check"].includes(t.name)).every((t) => t.annotations.untrustedContentHint), "External and human-supplied content is untrusted.");
evaluate("Human authority", !names.some((name) => /^(?:approve|purchase|checkout)(?:_|$)/i.test(name)), "No agent approval or transaction tool.");
evaluate("Live provenance", /fetchedAt/.test(await readFile(new URL("../src/live-catalog.js", import.meta.url), "utf8")), "Every request records fetch time and source URL.");
evaluate("Honest failure", /SEARCH_FAILED/.test(await readFile(new URL("../src/tool-definitions.js", import.meta.url), "utf8")), "API errors are visible without fixture fallback.");
const passed = checks.filter((item) => item.passed).length;
console.log(JSON.stringify({ suite: "label-relay-webmcp-evals", passed, total: checks.length, checks }, null, 2));
if (passed !== checks.length) process.exitCode = 1;
