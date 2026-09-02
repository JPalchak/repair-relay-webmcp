# Development review rubric

The recurring Luna development subagent reviews each checkpoint and reports suggestions to the main development thread. It is not included in the deployed product.

| Dimension | Release question |
|---|---|
| Usefulness | Does the workflow resolve a real gap between live database scale and physical verification? |
| Originality | Is the human contribution essential rather than decorative? |
| Execution | Do live data, errors, freshness, and incomplete fields behave honestly? |
| WebMCP leverage | Do narrow tools update shared visible state more reliably than UI automation? |
| Human-agent experience | Can either collaborator understand what happened and what remains? |
| Trust | Are external data untrusted, consequential authority human-only, and claims bounded? |

Automated `npm run eval` covers corresponding invariants. Luna adds adversarial qualitative review before implementation, after implementation, and before release.
