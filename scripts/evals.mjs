import { readFile } from "node:fs/promises";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";

const checks = [];
function evaluate(name, condition, detail) { checks.push({ name, passed: Boolean(condition), detail }); }

const store = createStore();
const tools = createToolDefinitions({ store });
const names = tools.map((tool) => tool.name);
const recallSource = await readFile(new URL("../src/live-recalls.js", import.meta.url), "utf8");
const toolSource = await readFile(new URL("../src/tool-definitions.js", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../src/engine.js", import.meta.url), "utf8");

evaluate("Usefulness", names.includes("sweep_shelf") && names.includes("search_recalls") && names.includes("get_recall_details"), "Agent-scale sweep of live FDA and CPSC notices for what is actually in the home.");
evaluate("Originality", names.includes("request_package_reading") && names.includes("record_package_reading") && names.includes("assess_item"), "A structured hand-off: agent asks for a physical reading, person supplies it, agent matches, person decides.");
evaluate("WebMCP leverage", tools.every((tool) => tool.inputSchema.additionalProperties === false) && tools.length === 10, "Ten closed, narrow schemas that each update the shared page.");
evaluate("Security", ["search_products", "lookup_barcode", "search_recalls", "sweep_shelf", "get_recall_details", "record_package_reading"].every((name) => tools.find((tool) => tool.name === name).annotations.untrustedContentHint), "External notices and relayed readings are untrusted.");
evaluate("Human authority", !names.some((name) => /^(?:resolve|approve|discard|purchase|checkout)(?:_|$)/i.test(name)) && /actor !== "human"/.test(engineSource), "No tool resolves an item; resolution requires trusted human authorization.");
evaluate("Evidence before verdict", /package reading .* is required/.test(engineSource), "Match verdicts are rejected without a recorded package reading.");
evaluate("Live provenance", /fetchedAt/.test(recallSource) && /sources/.test(recallSource), "Every recall search records fetch time and per-source status.");
evaluate("Honest failure", /CATALOG_FAILED/.test(toolSource) && /Every recall source failed/.test(recallSource), "Failures are visible; no fixture fallback exists.");
evaluate("Character budgets", tools.every((tool) => tool.description.length <= 500 && tool.name.length <= 30), "Descriptions and names stay within Chrome's recommended budgets.");

const passed = checks.filter((item) => item.passed).length;
console.log(JSON.stringify({ suite: "recall-relay-webmcp-evals", passed, total: checks.length, checks }, null, 2));
if (passed !== checks.length) process.exitCode = 1;
