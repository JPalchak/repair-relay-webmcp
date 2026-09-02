# Decision boundary

Repair Relay separates three states that ordinary agent workflows often collapse:

1. **Suggested:** a candidate appears in a ranking.
2. **Staged:** the candidate has a proposed sequence, assumptions, and stop conditions.
3. **Approved:** the person has reviewed the visible plan and deliberately authorized it.

WebMCP tools can create the first two states and request review. They cannot create the third.

The boundary is enforced twice:

- the WebMCP surface contains no approval or authorization tool;
- the domain function accepts approval only with `{ actor: "human", confirmed: true }` from the trusted visible interaction path.

The browser-test API intentionally has no approval function. The normal UI also requires both an explicit checkbox and a trusted click event.

`get_approved_plan` is a read-only continuation tool. Its presence lets the agent resume useful work after the person decides without granting the agent decision authority.
