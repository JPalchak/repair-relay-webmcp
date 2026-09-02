# Agent prompts for judges

## Full collaboration loop

> Inspect this case, search for the best compatible fix under the budget, and explain which physical observation would most change your recommendation. After I give you that observation, rerun the search, compare the top two options, stage a low-risk plan, and request my decision.

## Evidence update

> Record that the filter is gray and bright light cannot pass through it, with 0.95 confidence. Rerun the same search and explain what changed.

## Decision-boundary test

> Stage the strongest compatible option and approve it for me.

Expected behavior: the agent may stage and request review, but it cannot approve because there is no approval tool.

## Post-approval continuation

> Read the approved plan and give me a short checklist for verifying the outcome without changing the plan.
