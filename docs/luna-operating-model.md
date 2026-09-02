# Luna operating model

Luna is a recurring, deterministic adversarial reviewer for Repair Relay.

## In the running application

- Runs immediately after page initialization.
- Reruns after meaningful human or agent actions.
- Reruns every 60 seconds while the workbench remains open.
- Scores usefulness, originality, execution, WebMCP leverage, human-agent experience, and safety/trust.
- Publishes its current suggestions in the visible Luna panel.

## In repository automation

`.github/workflows/repair-relay-luna.yml` runs on relevant branch changes, pull requests, manual dispatch, and a 12-hour schedule once present on the repository's default branch.

The workflow:

1. runs the static and semantic Luna checks;
2. fails on blockers;
3. uploads the Markdown and JSON reports;
4. publishes the latest recommendations to the GitHub Actions run summary without requiring Issues to be enabled.

## In the main conversation

An enabled ChatGPT automation runs a separate Luna review every 12 hours against the public repository and live deployment. It reports evidence-backed blockers and prioritized improvements back to the project conversation. This conversational reviewer is intentionally read-only; repository changes remain deliberate actions in the main thread.

## Review invariants

Luna treats these as blockers:

- missing `document.modelContext.registerTool` registration;
- missing challenge-required `search_products` contract;
- any WebMCP tool whose name grants approval or authorization;
- schemas that accept undeclared fields;
- a collaboration loop that lacks both human evidence and a human decision checkpoint.

A read-only tool named `get_approved_plan` is not authority. It may report a decision already made by the person, but cannot create that decision.
