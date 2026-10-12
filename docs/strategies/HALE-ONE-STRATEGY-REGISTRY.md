# Hale One — numbered strategy registry (v1)

**Purpose:** Preserve rejected, unverified, and validated strategies so new proposals can be compared against prior evidence rather than researched from scratch. This is a research index, NOT proof of profitability. IDs are permanent; never recycle IDs or delete rejected entries.

## Status vocabulary
`REJECTED` = evidence or execution constraints defeat the stated implementation; `WATCHLIST` = insufficient evidence or prerequisites; `RESEARCH CANDIDATE` = testable hypothesis; `ACTIVE VALIDATION` = concrete ongoing validation; `READY FOR STRATEGY LIBRARY` = reproducible independent evidence plus a concrete validation record. A `REJECTED` entry can reopen only with a documented material change and fresh evidence. Distinguish `FALSIFIED` from `BLOCKED/UNVERIFIABLE` and `LOW PRIORITY` in `rejection_class`.

## Registry (seeded from Hale One research history; historical findings are NOT newly independently revalidated here)
| ID | Strategy family | Status | Previous conclusion / blocking evidence | Reopen trigger |
|---|---|---|---|---|
| HO-STR-0001 | BTC CEX-to-prediction-market quote lag | ACTIVE VALIDATION | Real-feed smoke failed with HTTP 451; no verified executable net edge; 5m and 15m contracts differ | Compliant market, timestamped depth, realistic delay and OOS net PnL |
| HO-STR-0002 | NegRisk multi-outcome conversion arbitrage | RESEARCH CANDIDATE | Protocol-dependent conversions, depth, costs and partial fills unvalidated | Confirm allowed conversions and net depth-walk paper results |
| HO-STR-0003 | Naive cross-venue price-difference arbitrage | REJECTED | Stale/asynchronous quotes, event semantics and two-leg execution invalidate naive price differences | Exact settlement equivalence plus synchronized executable two-leg evidence |
| HO-STR-0004 | Ordinary retail prediction-market making | REJECTED | Adverse selection, one-sided fills and queue risk; no demonstrated durable net edge | Reproducible fill-level OOS PnL including inventory and adverse selection |
| HO-STR-0005 | Favorite/longshot bias standalone trades | REJECTED | Gross statistical bias not enough after executable spread/fees | Independent OOS net profitability at actual ask/depth |
| HO-STR-0006 | Wallet leaderboard / copy-whale bot | REJECTED | Inferred trade direction, survivorship and follow latency; screenshots not execution evidence | Verified on-chain fill attribution and follower OOS net PnL |
| HO-STR-0007 | Wallet-intelligence data signals | WATCHLIST | On-chain fills may support research; attribution and monetization unproven | Ground-truth attribution and independent predictive/paid-customer evidence |
| HO-STR-0008 | Cross-venue identity engine and fee-aware read-only router | RESEARCH CANDIDATE | Execution-aware comparison unproven; event rule mismatch risk | Exact contract-rule hashes, synchronized depth and costed paper results |
| HO-STR-0009 | BTC 15m mid-market strong-direction entry | WATCHLIST | External claimed small edge; no independent fill-level OOS replication | Raw book data, fees, latency, resolution and OOS replication |
| HO-STR-0010 | Agent/x402 paid market-data API | WATCHLIST | Payment counts/volume not verified third-party net revenue | Independent paying customers and reconciled unit economics |
| HO-STR-0011 | Autonomous LLM trading / screenshot-return bots | REJECTED | No independently auditable fill-level evidence; model claims not realized PnL | Auditable independently replicated trades and net PnL (read-only research first) |
| HO-STR-0012 | Volume farming / multi-account rewards exploitation | REJECTED | Platform/ToS and abuse risk; not an acceptable Hale One strategy | Do not reopen without explicit compliant legitimate use case |
| HO-STR-0013 | Crypto perpetual funding-rate capture | WATCHLIST | Fee, basis, funding volatility, liquidation and capital constraints | Venue-permitted hedged OOS execution-cost and risk analysis |
| HO-STR-0014 | Historical order-book replay via third-party provider | RESEARCH CANDIDATE | Data-source infrastructure, not itself a trading strategy; coverage/accuracy unverified | Raw sample, gaps, timestamp reconciliation and provider terms verified |

## Required record for each new or revisited strategy
- `strategy_id` and `family_id` (stable), `aliases`, `discovered_at`, `last_reviewed_at`, `status`, `rejection_class` (`FALSIFIED`, `BLOCKED/UNVERIFIABLE`, `LOW PRIORITY`, or `NOT_APPLICABLE`).
- `claim`, `verified_facts`, `primary_sources`, `repository_commit`, `dataset_manifest`, `raw_sha256`, `market_rules_hash`, `fee_version`.
- `mechanism`, `venue/jurisdiction/ToS`, `data/tools/capital`, `latency`, `spread/fees/slippage`, `depth/liquidity`, `fill/miss`, `partial-fill`, `settlement`, `risk/failure_modes`.
- `test_protocol`, `sample`, `OOS_split`, `net_paper_pnl`, `confidence_interval`, `falsification_rule`, `decision`, `reopen_trigger`.
- **Evidence level:** `CLAIM_ONLY`, `SOURCE_CONFIRMED`, `CODE_INSPECTED`, `SYNTHETIC_TESTED`, `HISTORICAL_REPLAYED`, `LIVE_PAPER_VALIDATED`, `INDEPENDENTLY_REPRODUCED`.

## Similarity/revisit procedure
1. Before adding a new strategy, search existing IDs by venue, payoff/settlement rules, mechanism, time horizon, signal, order type, data source and cost model.
2. Cite closest historical IDs and show a **delta table**: what is genuinely new, what old failure persists, what new evidence resolves it, and the cheapest falsifying test.
3. If no material difference, attach the new link/evidence to the old ID; **do not create a duplicate**.
4. If material difference exists, assign next monotonic ID and link `related_strategy_ids`; keep parent failure history.
5. Do not overwrite historical verdicts. Append dated review entries with evidence links. Do not mark `READY` absent reproducible records.

## Current caveat
This is an initial index distilled from previous Hale One discussions, not a backfilled audit of original source data. Historical statuses may be revised after retrieving original test artifacts; do not invent test counts, profits or sources. No live trades, wallet signing or fund movements are authorized.
