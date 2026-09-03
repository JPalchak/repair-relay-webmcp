# Tested browser-agent behavior

## Native browser protocol run

The corrected production client was tested on September 3, 2026 in Chromium `144.0.7559.96` with:

```text
--enable-features=WebMCP,WebMCPTesting
```

That browser exposes the earlier native preview APIs `navigator.modelContext` and `navigator.modelContextTesting`. Label Relay prefers the current `document.modelContext` API and uses the Navigator path only as a compatibility fallback; no model-context polyfill or replacement object was installed for this native run.

The native run verified:

- eight tools registered through the browser protocol;
- every input schema parsed and used `additionalProperties: false`;
- `lookup_barcode` updated the visible result board;
- `stage_verified_choice` staged the same record in the page;
- two `record_package_check` calls created pending human attestations and explicitly reported that no requirement was cleared;
- two trusted visible **Confirm I said this** clicks cleared the corresponding requirements;
- a trusted visible approval unlocked the verified-label summary;
- `get_approved_choice` returned the same summary shown in the page;
- no browser console errors occurred.

Machine-readable evidence is committed at `docs/evidence/judge-relay-browser.json`.

## Deterministic ordinary-browser run

The ordinary Chromium journey uses the same production modules, callbacks, store, and DOM with controlled Open Food Facts-shaped responses. It additionally verifies:

- English ingredients are preferred;
- Open Food Facts completeness values remain distinguishable;
- a later confirmed mismatch revokes the prior approval;
- the official per-barcode correction URL appears;
- the approval control remains disabled on mismatch;
- there is no horizontal overflow at a 390-pixel viewport.

## Claim boundary

These runs prove production-client behavior and native protocol behavior in the available Chromium preview. The upstream responses were deterministic fixtures so edge cases remained reproducible.

They do **not** prove that:

- the exact public deployment has been updated to this commit;
- current Chrome 149+ accepts every schema and registration option;
- ChatGPT’s in-app browser discovers and invokes the tools;
- the public origin can currently reach both live Open Food Facts endpoints.

`npm run test:live` separately probes both production Open Food Facts paths. The remaining release test is to run the full workflow on the final public URL in current Chrome’s Application → WebMCP panel and in ChatGPT’s in-app browser.
