# Development review rubric

Each checkpoint during development was reviewed against the challenge’s judging dimensions. `npm run eval` encodes the invariants that can be checked mechanically; the questions below were applied by hand to the concept, the live-data path, the tool surface, and the interface.

| Dimension | Release question |
|---|---|
| Usefulness | Would a person actually run this on their own pantry, and would the result change what they do? |
| Originality | Is the human contribution essential (physical readings, decisions) rather than a confirmation click? |
| Execution | Do live sources, per-source errors, empty results, and rate limits behave honestly on real data? |
| WebMCP leverage | Does each tool update shared visible state that a chat-only agent could not maintain? |
| Human-agent experience | Can either collaborator see what happened, what is owed, and what remains? |
| Trust | Is external text untrusted, is evidence required before verdicts, and is consequential authority human-only? |
