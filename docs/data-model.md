# Data model

## Case

- `caseId`
- `title`
- `device`: maker, model, voltage, dimensions
- `constraints`: budget and maximum repair risk
- bounded `evidence`
- current bounded `search`
- optional `comparison`
- optional `stagedPlan`
- optional `approvedPlan`
- optional visible `decisionRequest`
- current `luna` review
- bounded local `activity` log

## Evidence

Each observation contains an identifier, plain text, normalized tag, confidence from 0 to 1, source, and timestamp. Evidence cannot add executable fields or arbitrary tags.

## Candidate

Each candidate separates structured compatibility, price, stock, repair risk, and resolvable evidence signals from descriptive text. The ranking engine computes reasons and confidence; catalog prose does not define authority.

## Plan

A plan contains a candidate reference, visible objective, risk, three to seven steps, a stop condition per step, visible assumptions, version, status, and optional human approval metadata.
