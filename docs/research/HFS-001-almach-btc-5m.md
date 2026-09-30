# HFS-001 — almach BTC 5m short-horizon scalp fixture

Status: RESEARCH FIXTURE ONLY  
Classification: P2 candidate / high-frequency short-horizon inventory & spread capture  
Arbitrage status: NOT PROVEN  
Live execution: OUT OF SCOPE

## Why this fixture exists

Public discussion describes an account named `almach` repeatedly trading Polymarket BTC Up/Down short-horizon markets by entering at lower prices and exiting at higher prices before settlement.

This behavior is scientifically useful because it may expose a real high-frequency inventory / spread-capture mechanism, but it must not be mislabeled as risk-free arbitrage.

First-leg inventory is directional risk until an offsetting exit or deterministic hedge is locked.

## Claims that must remain unverified until independently reconstructed

Examples of social-media claims include very large trade counts, multi-month realized profit, large aggregate volume, low current inventory, and specific entry/exit bands.

Do not use those figures as facts or as model labels until reconstructed from primary/public evidence.

## Core research question

Does the observed PnL come primarily from:

1. spread capture / short-horizon mean reversion,
2. maker rebates or incentives,
3. directional timing,
4. inventory skew / recovery,
5. settlement exposure,
6. survivorship / selection bias,
7. unexplained or missing data?

## Required measurements

- first-leg entry distribution
- exit distribution
- round-trip completion rate
- median / p95 / p99 holding time
- post-fill markout at 30s / 60s / 120s
- maker vs taker composition
- rebate / incentive contribution
- forced-exit frequency and loss
- unresolved inventory
- maximum capital tied up
- realized PnL by source
- regime-conditioned results (oscillating / trending / event)
- queue / fill evidence where available

## Core metrics

`RTR = completed round trips / first-leg entries`

Use alongside:
- LCR
- IER
- DRR
- LockedPnL
- InventoryPnL
- DirectionalPnL
- RebatePnL
- ForcedExitLoss
- UnexplainedPnL

## Falsification conditions

The mechanism fails as a repeatable P2 edge if any of the following dominates after complete accounting:

- adverse selection exceeds spread capture,
- forced exits absorb expected gains,
- profits are mostly directional,
- profits are mostly rebates that are not durable,
- apparent performance depends on omitted losing inventory,
- unresolved/missing events prevent full reconciliation,
- capital cycle time or depth prevents scale,
- performance disappears out of sample or in different regimes.

## Promotion rule

HFS-001 may inform P2 design only after:

1. raw history is losslessly ingested,
2. normalized events reconcile,
3. inventory and cash ledgers close,
4. PnL attribution is complete,
5. missing/unknown events are zero or explicitly block proof,
6. the result survives failure-case reconstruction.

Until then:

`P2_CANDIDATE != ARBITRAGE_PROVEN`
