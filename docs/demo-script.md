# Demo video script — target 2:35

## 0:00–0:18 — The problem

**On screen:** Repair Relay hero and active AirPure AP-200 case.

**Narration:**

“Repairing a physical object is a bad fit for either a person or an AI agent alone. The person can see the filter, hear the fan, and judge risk. The agent can search a catalog and reason across compatibility, price, and evidence. Repair Relay gives them one shared WebMCP workbench.”

## 0:18–0:42 — The WebMCP surface

**On screen:** WebMCP status and tool list. Briefly open Chrome DevTools → Application → WebMCP when recording in an enabled browser.

**Narration:**

“The page registers eight narrow tools directly through `document.modelContext.registerTool`. Tools can read the case, search products, record evidence, compare options, stage a plan, request a human decision, read an approved plan, and run a collaboration review. Every state-changing tool updates the same interface the person sees.”

## 0:42–1:03 — Agent search

**Prompt:**

“Inspect this case and search for the best compatible fix under the budget. Tell me what evidence would change the recommendation.”

**On screen:** Candidate board populates.

**Narration:**

“The agent calls `search_products`. Compatibility is a hard constraint, responses are bounded, and the result is visible rather than trapped in the chat. The OEM filter leads provisionally, but the confidence is limited because the browser cannot inspect the physical filter.”

## 1:03–1:30 — Human evidence changes the answer

**On screen:** Click **Add demo finding: filter blocks light**, or record the same observation through the agent.

**Narration:**

“The person performs a physical check that the agent cannot. The filter is gray, and bright light does not pass through the media. Repair Relay records that as bounded evidence—not instructions—and reranks the catalog. The filter hypothesis becomes materially stronger. This is the core collaboration: the human adds missing sensor data; the agent recomputes the system-level answer.”

## 1:30–1:54 — Compare and stage

**Prompt:**

“Compare the top two compatible options, stage a low-risk plan from the strongest one, and request my decision.”

**On screen:** Comparison table, then staged plan and decision dialog.

**Narration:**

“The agent compares candidates, stages a reversible plan, exposes every assumption, and gives each step a stop condition. It can then request a human checkpoint. It still has not approved anything.”

## 1:54–2:18 — Prove the authority boundary

**Prompt:**

“Approve the plan for me.”

**On screen:** Show that no approval tool exists. Then manually review, tick the checkbox, and click the approval button.

**Narration:**

“The agent cannot approve the proposal because Repair Relay exposes no approval tool. Approval requires a trusted visible action by the person at the bench. After that deliberate decision, the read-only `get_approved_plan` tool lets the agent continue helping with verification.”

## 2:18–2:35 — Luna and close

**On screen:** Luna panel at 30/30 and relay log.

**Narration:**

“Luna continuously reviews usefulness, originality, execution, WebMCP leverage, the human-agent experience, and trust. Repair Relay is not an agent bolted onto a website. It is a shared instrument that gets better only when a person and an agent contribute different capabilities.”

## Recording checklist

- Keep the final video under three minutes.
- Record at 1440×900 or 1920×1080.
- Show the live URL in the browser address bar at least once.
- Show WebMCP tool registration in DevTools when available.
- Keep audio clear; captions are recommended.
- End on the approved plan and Luna panel rather than a title card.
