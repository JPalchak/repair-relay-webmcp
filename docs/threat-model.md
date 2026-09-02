# Threat model

## Protected properties

- Compatibility constraints cannot be overridden by catalog prose.
- Untrusted observations cannot execute code or write arbitrary state.
- Agent tools cannot approve a repair.
- Tool responses remain bounded.
- The person can see every consequential state change.

## Primary threats and controls

| Threat | Control |
|---|---|
| Prompt injection in product or observation text | Inputs are normalized; schemas are closed; text is rendered with `textContent`; evidence is treated as data |
| Agent invents compatibility | Model compatibility is computed from structured catalog fields and exposed in the UI |
| Agent stages unsafe work | Case risk limit penalizes high-risk parts; plans include stop conditions; electrical enclosure work is excluded |
| Agent silently approves | No approval tool; reducer requires confirmed human actor; UI requires trusted interaction |
| Excessive data return | Search returns at most five results; snapshots and activity are bounded |
| Long-running tool continues after cancellation | Tool callbacks check the execution `AbortSignal` |
| Reviewer mistakes readback for authority | Luna's prohibition matches tool names that grant approval, not `get_approved_plan` |
