# Browser test procedure

## Judge path: ChatGPT in-app browser

1. Open the live URL:
   `https://repair-relay-webmcp.ottermode.chatgpt.site`
2. Ask the browser agent:

   > Inspect this repair case, search for the best compatible fix under the budget, and explain which physical observation would most change your recommendation.

3. Confirm that the candidate board on the page changes when the agent calls `search_products`.
4. Tell the agent:

   > Record that the filter is gray and bright light cannot pass through it, with 0.95 confidence, then rerun the search.

5. Confirm that the evidence appears in the Human lane and the ranking is recomputed.
6. Ask the agent to compare the top two candidates, stage a plan from the strongest compatible option, and request a human decision.
7. Confirm that the page shows an unapproved staged plan and opens a visible checkpoint.
8. Ask the agent to approve the plan. It should be unable to do so because no approval tool exists.
9. Review the stop conditions, select the confirmation checkbox, and click **Approve as the person at the bench**.
10. Ask the agent to call `get_approved_plan`. It should now be able to read the human-approved plan.

## Google Chrome path

1. Use a current Chrome build that includes WebMCP testing support.
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Set **WebMCP testing** to **Enabled**.
4. Relaunch Chrome completely.
5. Open the live URL over HTTPS.
6. Open DevTools.
7. In **Application → WebMCP**, verify these tools:
   - `search_products`
   - `record_observation`
   - `compare_products`
   - `stage_repair_plan`
   - `request_human_decision`
   - `get_case_snapshot`
   - `get_approved_plan`
   - `run_luna_review`
8. Inspect `search_products` and confirm its description is exactly `Search the product catalog`.
9. Repeat the judge path above with a WebMCP-capable browser agent.

## Deterministic developer fallback

The page exposes a narrow browser-test API so the visible workflow can be reproduced even when the browser has no WebMCP agent UI. This API exposes tool invocation and state inspection, but deliberately exposes no approval method.

Open DevTools Console and run:

```js
await window.__repairRelay.invokeTool("search_products", {
  query: "restore weak airflow with a direct-fit filter",
  model: "AP-200",
  budget: 65
});
```

Then add physical evidence and rerank:

```js
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
```

Stage the leading candidate:

```js
const candidateId = window.__repairRelay.getState().search.results[0].id;
await window.__repairRelay.invokeTool("stage_repair_plan", {
  candidateId,
  objective: "Restore AP-200 airflow safely"
});
```

The staged plan must remain unapproved until the visible checkbox and approval button are used by the person.

## Automated real-DOM smoke test

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

To test the deployed build instead of the local server:

```bash
LIVE_URL="https://repair-relay-webmcp.ottermode.chatgpt.site" npm run test:browser
```

The smoke test injects a deterministic `document.modelContext` registration harness before page load, while also launching Chromium with WebMCP feature flags. It then uses the actual page DOM and actual tool callbacks to validate the complete collaboration loop.
