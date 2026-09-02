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
4. creates or updates one GitHub issue titled `[Luna] Repair Relay recurring review` so the main development thread receives the latest suggestions rather than accumulating duplicate issues.

## Review invariants

Luna treats these as blockers:

- missing `document.modelContext.registerTool` registration;
- missing challenge-required `search_products` contract;
- any WebMCP tool whose name grants approval or authorization;
- schemas that accept undeclared fields;
- a collaboration loop that lacks both human evidence and a human decision checkpoint.

A read-only tool named `get_approved_plan` is not authority. It may report a decision already made by the person, but cannot create that decision.
