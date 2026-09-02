# Code review checklist

- [ ] The required `search_products` name and description remain exact.
- [ ] New tool schemas set `additionalProperties: false`.
- [ ] Tool inputs and outputs stay bounded.
- [ ] Tool text is rendered as text, not HTML.
- [ ] Compatibility remains a structured hard constraint.
- [ ] Every state-changing tool updates the shared visible interface.
- [ ] Staged plans retain assumptions and stop conditions.
- [ ] No approval, authorization, purchase, or checkout tool is introduced.
- [ ] Read-only approved-plan access cannot mutate decision state.
- [ ] Unit, scenario, Luna, and browser tests pass.
- [ ] The live URL continues to load all modules over HTTPS.
