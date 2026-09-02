# Devpost submission package

## Project name

Repair Relay

## Tagline

The human supplies physical-world evidence; the agent turns it into a safer, compatible repair plan on one shared WebMCP workbench.

## Live URL

https://repair-relay-webmcp.ottermode.chatgpt.site

## Public code repository

https://github.com/JPalchak/repair-relay-webmcp

## Demo video

A complete narrated video file and recording script are included with the project handoff. Devpost requires the final video to be uploaded to a public YouTube or Vimeo URL before final submission.

## Description

### Repair gets better when the human and agent stop pretending they have the same senses

Repair Relay is an evidence-first shared repair bench for diagnosing a physical device under uncertainty.

A browser agent is excellent at searching structured records, enforcing compatibility constraints, comparing tradeoffs, and assembling a plan. It cannot look behind the purifier cover, feel weak airflow, hear a scrape, or accept risk on the person’s behalf. A person has access to that physical evidence and judgment, but should not have to manually correlate every model number, budget constraint, product record, and stop condition.

Repair Relay gives them one shared state and a deliberate relay:

1. The agent reads the active case and searches a bounded product catalog.
2. It identifies the physical observation most likely to change the answer.
3. The person performs that check and contributes evidence from the real world.
4. The agent reranks the candidates using the new evidence.
5. It compares options and stages a reversible repair plan.
6. It requests a visible human checkpoint.
7. Only the person can approve the plan.
8. The agent can then read the approved plan and help verify the outcome.

### Why this is a strong fit for WebMCP

This workflow needs the browser UI, the person, and the agent at the same time. A backend-only integration would duplicate state and bypass the visible workbench. Screenshot-and-click automation would be brittle and could not reliably express the application’s compatibility rules or authority boundary.

WebMCP lets Repair Relay expose the application’s real client-side capabilities as typed tools while preserving the human interface. When the agent calls `search_products`, the same candidate board the person sees is reranked. When it calls `record_observation`, the evidence appears in the visible evidence lane. When it stages a plan, the steps, assumptions, risk, and stop conditions appear for review. The page remains the shared artifact rather than being displaced by the agent conversation.

### How it creates a better user experience

The user never has to reconcile two versions of the task. The case, evidence, ranking, comparison, plan, and decision are all inspectable in one place.

The recommendation explains why it moved. Compatibility is a hard constraint, the response is bounded, and untrusted observations remain data rather than executable instructions. Electrical or model-incompatible parts are penalized even when they look semantically relevant.

Most importantly, Repair Relay makes the handoff of control explicit. The agent does meaningful analytical work but cannot silently cross the consequential decision boundary.

### What people and agents can do together that was difficult before

The project’s core demonstration begins with incomplete browser-visible information. The agent can offer only a provisional recommendation. The person then performs a light-through-filter check that does not exist anywhere online. That observation materially strengthens the filter hypothesis and changes the ranking.

This is not a user approving work the agent could have done alone. The person contributes a unique physical signal; the agent contributes rapid system-level recomputation. The improved result depends on both.

The same division of labor continues through execution: the agent assembles a bounded, reversible plan; the person reviews physical fit, risk, and stop conditions; the agent resumes only after that visible decision.

### How WebMCP was implemented

Repair Relay is a static JavaScript application that uses the imperative WebMCP API. `src/tool-definitions.js` defines eight tools with closed JSON Schemas, bounded inputs and outputs, descriptions, and annotations. `src/webmcp.js` registers them with:

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  inputSchema: searchProductsTool.inputSchema,
  execute: async (input, options) => searchProductsTool.execute(input, options)
}, { signal: controller.signal });
```

The required catalog tool is present with the exact contract:

```js
document.modelContext.registerTool({
  name: "search_products",
  description: "Search the product catalog",
  inputSchema: { /* closed, bounded JSON Schema */ },
  execute: async (input) => { /* rerank catalog and update shared UI */ }
});
```

The full tool surface is:

- `search_products`
- `record_observation`
- `compare_products`
- `stage_repair_plan`
- `request_human_decision`
- `get_case_snapshot`
- `get_approved_plan`
- `run_luna_review`

Every state-changing call is reflected in the page. Tool execution supports cancellation through `AbortSignal`. Read-only tools use `readOnlyHint`. Physical observations are sanitized and rendered with `textContent`. No tool can approve, purchase, or execute a repair.

### Human-only approval

There is deliberately no `approve_plan` tool. The agent can stage a proposal and request review, but approval requires an explicit checkbox and a trusted click in the visible interface. The domain reducer separately rejects any approval request that does not identify a confirmed human actor.

`get_approved_plan` is a read-only tool. It can report a decision after the person makes it; it cannot create that decision.

### Luna recurring evaluator

Luna is the project’s deterministic adversarial reviewer. It evaluates six dimensions aligned to the challenge goals:

- usefulness
- originality
- execution
- WebMCP leverage
- human-agent experience
- safety and trust

Luna reruns after meaningful state changes and every 60 seconds in the app. The repository also includes a command-line gate and a scheduled GitHub Actions workflow for recurring review from the default branch. The workflow writes recommendations to its run summary and stores machine-readable and Markdown reports as artifacts. It specifically checks for the required registration call, exact catalog tool, closed schemas, and accidental agent approval authority.

### Testing and execution quality

The project includes:

- domain and ranking unit tests
- all eight WebMCP tool contract tests
- source-level challenge requirement tests
- seven human-agent scenario evaluations
- a real-DOM Playwright smoke test
- repository completeness verification
- Luna’s adversarial quality gate
- manual ChatGPT in-app browser and Chrome WebMCP testing instructions

The browser smoke test registers the page’s actual tools, invokes the complete workflow, proves that physical evidence changes confidence, stages an unapproved plan, opens the human checkpoint, uses a trusted visible action to approve it, and confirms the agent can then read the approved plan.

### What I learned

The most important WebMCP design question is not “what buttons can an agent click?” It is “what capability should become a reliable tool, and where should authority stop?”

A useful human-agent app does not reduce the person to confirmation labor. It gives the person work only they can do and gives the agent work that benefits from structure and speed. Shared visible state is what makes that division legible and trustworthy.

### What is next

The demo uses a deterministic local catalog so judges can reproduce every result. The next version would add repair-manual provenance, manufacturer part feeds, saved multi-device cases, and optional image or sensor evidence—while preserving the same staged-plan and human-decision boundary.

## Built with

- WebMCP
- JavaScript
- HTML
- CSS
- Node.js
- Playwright
- GitHub Actions

## Testing instructions for judges

1. Open the live URL in ChatGPT’s in-app browser, or enable `chrome://flags/#enable-webmcp-testing` in Chrome and relaunch.
2. Ask: “Inspect this case, search for the best compatible fix under the budget, and explain which physical observation would most change your recommendation.”
3. Confirm the visible candidate board updates.
4. Record that the filter is gray and bright light cannot pass through it, at 0.95 confidence, then rerun the search.
5. Confirm the evidence appears and the ranking changes.
6. Ask the agent to compare the top two candidates, stage the best low-risk plan, and request a human decision.
7. Ask the agent to approve the plan. It should be unable to do so.
8. Review the visible assumptions and stop conditions, check the confirmation box, and click the human approval button.
9. Ask the agent to call `get_approved_plan`; it should now return the approved plan.

## Custom submission answers

- **Submitter Type (28249):** Individual
- **Country (28250):** United States
- **Organization (28251):** Not applicable
- **App Status (28252):** New
- **Existing project updates (28253):** Not applicable; Repair Relay was created for this challenge.
- **Live URL (28254):** https://repair-relay-webmcp.ottermode.chatgpt.site
- **Testing instructions (28255):** Use the nine-step judge path above. No credentials are required.
- **Public code repo (28256):** https://github.com/JPalchak/repair-relay-webmcp
- **Agent/client testing (28257):** Automated Chromium real-DOM WebMCP registration harness with WebMCP feature flags; manual Chrome/ChatGPT test procedure included for judges.
- **AI tools used (28258):** OpenAI ChatGPT GPT-5.6 Pro, GitHub connector, Devpost Hackathons connector, and Playwright-based browser evaluation.
- **Learning level (28259):** Significant
- **Career AI value (28260):** Yes
