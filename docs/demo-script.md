# Judge demo script (about 2:30)

## 0:00–0:20 — The asymmetry

Show the hero.

“Recall notices publish exact lot ranges. Almost nobody checks, because it means reading a database and then reading a lid. An agent will happily do the first. Only I can do the second. Recall Relay puts both on one page.”

## 0:20–0:50 — Shelf and sweep

Click **Add a three-item sample shelf**, then ask the agent to sweep (or press **Sweep shelf**).

“Three live sources: openFDA food, openFDA drug, CPSC. Each card shows the query, per-source status, and fetch time. If a source fails, the card says so. Nothing here is a fixture.”

Expand a candidate to show the code text block.

## 0:50–1:25 — The agent asks me to read the package

Ask: “Read the full notice for the peanut butter and tell me exactly what to look for.”

The agent calls `get_recall_details`, then `request_package_reading`. Show the highlighted card, the banner, and the prefilled form.

“That is the tool that makes this collaborative: the agent hands me a physical task with where-to-look text derived from the notice.”

## 1:25–1:55 — Evidence before verdict

Ask the agent to assess the item before typing anything. Show the rejection.

“The page refuses a match verdict without a reading.” Type a lot code. Ask again. Show the assessment with reasoning on the card.

## 1:55–2:20 — Human-only decision

Show the tool list: no resolve tool. Click **Discard**. Ask the agent to call `get_shelf`.

“My decision is now agent-readable, so the conversation can continue, but only a trusted click could record it.”

## 2:20–2:30 — Close

“Recall Relay is better together because the agent does the part people never do, and the person does the part agents cannot.”
