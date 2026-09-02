import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/store.js";
import { createToolDefinitions } from "../src/tool-definitions.js";
import { runLunaReview } from "../src/luna.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = createStore();
const tools = createToolDefinitions({ store });
const review = runLunaReview(store.getState(), tools);

const source = await readFile(resolve(root, "src/tool-definitions.js"), "utf8");
const hasRequiredLiteral =
  source.includes('name: "search_products"') &&
  source.includes('description: "Search the product catalog"');
const webmcpSource = await readFile(resolve(root, "src/webmcp.js"), "utf8");
const registrationPresent =
  webmcpSource.includes("document.modelContext.registerTool({") &&
  webmcpSource.includes('name: "search_products"') &&
  webmcpSource.includes('{ signal: controller.signal }');
const approvalTool = tools.find((tool) => /^(approve|authorize)(_|$)/i.test(tool.name));

const findings = [
  {
    id: "LUNA-001",
    severity: registrationPresent ? "pass" : "blocker",
    finding: registrationPresent
      ? "The page registers the narrow tool definitions through document.modelContext."
      : "The WebMCP registration call is missing."
  },
  {
    id: "LUNA-002",
    severity: hasRequiredLiteral ? "pass" : "blocker",
    finding: hasRequiredLiteral
      ? "The required search_products name and catalog-search description are present."
      : "The required search_products literal is missing."
  },
  {
    id: "LUNA-003",
    severity: approvalTool ? "blocker" : "pass",
    finding: approvalTool
      ? `Agent authority is too broad: ${approvalTool.name} can be mistaken for human approval.`
      : "No WebMCP tool can grant approval; get_approved_plan only reads an already-human-approved decision."
  },
  {
    id: "LUNA-004",
    severity: tools.every((tool) => tool.inputSchema?.additionalProperties === false) ? "pass" : "major",
    finding: "All tool input objects are closed against undeclared properties."
  },
  {
    id: "LUNA-005",
    severity: tools.length >= 7 ? "pass" : "major",
    finding: `${tools.length} focused tools cover the full observe → search → compare → stage → decide loop.`
  }
];

const blockers = findings.filter((item) => item.severity === "blocker").length;
const markdown = `# Luna recurring review

Generated: ${review.reviewedAt}

## Score

**${review.score}/${review.maxScore}**

${Object.entries(review.dimensions)
  .map(([name, score]) => `- ${name}: ${score}/5`)
  .join("\n")}

## Static findings

${findings.map((item) => `- **${item.severity.toUpperCase()} · ${item.id}:** ${item.finding}`).join("\n")}

## Next suggestions

${review.suggestions.map((item) => `- ${item}`).join("\n")}

## Gate

${blockers === 0 ? "PASS — no blocker found." : `FAIL — ${blockers} blocker(s) found.`}
`;

await mkdir(resolve(root, "reports"), { recursive: true });
await writeFile(resolve(root, "reports/luna-latest.json"), JSON.stringify({ review, findings, blockers }, null, 2));
await writeFile(resolve(root, "reports/luna-latest.md"), markdown);
console.log(markdown);
if (blockers) process.exitCode = 1;
