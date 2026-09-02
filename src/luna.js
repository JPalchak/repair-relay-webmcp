import { compactCaseSnapshot } from "./engine.js";

const DIMENSIONS = [
  "usefulness",
  "originality",
  "execution",
  "webmcpLeverage",
  "humanAgentExperience",
  "safetyAndTrust"
];

export function runLunaReview(state, toolDefinitions) {
  const names = new Set(toolDefinitions.map((tool) => tool.name));
  const writeTools = toolDefinitions.filter((tool) => !tool.annotations?.readOnlyHint);
  const approvalTools = toolDefinitions.filter((tool) => /^(approve|authorize|purchase|checkout)(_|$)/i.test(tool.name));
  const strictSchemas = toolDefinitions.filter(
    (tool) => tool.inputSchema?.type === "object" && tool.inputSchema?.additionalProperties === false
  ).length;
  const snapshot = compactCaseSnapshot(state);

  const checks = {
    usefulness:
      names.has("search_products") &&
      names.has("record_observation") &&
      names.has("stage_repair_plan") &&
      Boolean(state.title),
    originality:
      names.has("record_observation") &&
      names.has("request_human_decision") &&
      names.has("get_approved_plan"),
    execution:
      strictSchemas === toolDefinitions.length &&
      toolDefinitions.length >= 7 &&
      Boolean(snapshot.device?.model),
    webmcpLeverage:
      names.has("get_case_snapshot") &&
      names.has("compare_products") &&
      writeTools.length >= 4,
    humanAgentExperience:
      approvalTools.length === 0 &&
      names.has("request_human_decision") &&
      state.evidence.some((item) => item.source === "human"),
    safetyAndTrust:
      approvalTools.length === 0 &&
      toolDefinitions.every((tool) => typeof tool.description === "string" && tool.description.length >= 18) &&
      toolDefinitions.filter((tool) => tool.annotations?.readOnlyHint).length >= 2
  };

  const dimensionScores = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, checks[dimension] ? 5 : 3])
  );

  const suggestions = [];
  if (!state.search) suggestions.push("Run an evidence-sensitive catalog search so the shared board shows a consequential agent action.");
  if (!state.evidence.some((item) => item.tag === "blocked_filter")) {
    suggestions.push("Ask the person to perform the light-through-filter check; it should materially change the leading hypothesis.");
  }
  if (state.search && !state.stagedPlan) suggestions.push("Stage a bounded plan from the leading compatible candidate.");
  if (state.stagedPlan && !state.approvedPlan) suggestions.push("Keep the plan staged until the person reviews the visible stop conditions.");
  if (state.approvedPlan) suggestions.push("Record the post-repair measurement to close the evidence loop.");
  if (strictSchemas !== toolDefinitions.length) suggestions.push("Make every input schema closed with additionalProperties: false.");
  if (approvalTools.length) suggestions.push("Remove approval authority from the WebMCP surface.");

  const score = Object.values(dimensionScores).reduce((sum, value) => sum + value, 0);
  return {
    reviewer: "Luna",
    version: "1.0",
    score,
    maxScore: 30,
    dimensions: dimensionScores,
    checks,
    suggestions: suggestions.slice(0, 4),
    reviewedAt: new Date().toISOString()
  };
}
