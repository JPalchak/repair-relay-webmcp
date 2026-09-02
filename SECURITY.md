# Security model

Repair Relay is intentionally a local, static demonstration. It has no account system, server-side secrets, payments, purchasing, or remote write APIs.

## Trust boundaries

- Product records and user-entered observations are treated as untrusted text.
- The renderer uses `textContent`; it never injects catalog or tool input with `innerHTML`.
- WebMCP inputs are validated again at execution time, even though each tool publishes a strict JSON Schema with `additionalProperties: false`.
- Read-only tools are annotated with `readOnlyHint`.
- Tool responses are bounded to avoid returning the whole catalog or an unbounded case log.
- Tools may stage a proposal or open the review surface, but no WebMCP tool can approve a repair plan.
- Plan approval requires a deliberate human interaction in the visible page. The domain reducer additionally rejects approval requests whose actor is not `human`.
- Cancellation is honored through the `AbortSignal` supplied to each tool execution.

## Reporting

Open a GitHub issue without including private personal information. This demonstration does not collect or transmit data.
