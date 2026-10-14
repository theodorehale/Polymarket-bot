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
| HO-STR-0015 | Conditional logical-implication contract baskets | RESEARCH CANDIDATE | Prior 2026-10-13 scan described 19 synthetic checks but raw execution and rule identity unverified; not yet independently replicated | Exact official implication proof plus time-synced multi-leg depth, latency and OOS net fills |
| HO-STR-0016 | Legitimate sports-prop component maker incentive (Kalshi) | WATCHLIST | Official fee-funded pool pays monthly Bonus Credit subject to 0.01 score threshold, maker volume share and exclusions; no Hale One fills, credits or profitability verified | Independently reproduce eligible component/score/bonus and adverse-selection-adjusted maker OOS PnL |
| HO-STR-0017 | Kalshi resting-book liquidity incentive (distinct from volume and component-maker programs) | WATCHLIST | Official snapshots and depth-weighted score can pay even without fills; adverse selection, minimum two-sided depth, competing quotes, eligibility, credits and real net PnL unverified | Read-only program terms, full-depth time series and score/reward reconciliation including bad fills |

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

## 2026-10-13 review note
- HO-STR-0015 is a **previously discussed** candidate, backfilled under its existing ID rather than assigned a duplicate.
- HO-STR-0016 is materially distinct from HO-STR-0004 because the official sports-prop combo fee-funded incentive changes the payoff, but maker adverse selection remains; distinct from rejected HO-STR-0012 because wash/self-match/prearranged volume is explicitly excluded and not permitted.
- Primary source for HO-STR-0016: https://help.kalshi.com/en/articles/17184676-sports-prop-combo-market-component-legs-liquidity-incentive-program . Official example arithmetic checked, not realized earnings.
- Liquidity benchmark (research input for HO-STR-0014 / HO-STR-0008): https://github.com/vcorp-dev/prediction-market-liquidity-benchmark . Only public summary internal arithmetic checked; underlying 34,560 rows and checksum have NOT been independently reverified. This is NOT an executable edge.
- Replay framework (HO-STR-0014 research input): https://github.com/Oddpool/PredictionMarketBench . Historical fee schedule in example is October 2025, so fee models must be updated before use. Public episodes do not establish BTC 15m profitability.
- Safety: no live orders, credentials, wallets, signatures or capital transfers.

## 2026-10-14 evidence update (read-only, no strategy promotion)
- HO-STR-0017: Official Kalshi liquidity incentive rules: https://help.kalshi.com/en/articles/13823851-liquidity-incentive-program . This is distinct from HO-STR-0016 (sports component-maker execution incentive) and HO-STR-0012 (disallowed manipulative volume farming). Score is share of qualifying book depth over snapshots, adjusted by valid snapshot fraction; fills can create losses. Status WATCHLIST, not READY.
- HO-STR-0012 / HO-STR-0016 / HO-STR-0017: CFTC designated-contract-market rule filing search reports Kalshi's **Volume Incentive Program termination** filing dated 2026-09-28 certified 2026-10-13; do not confuse terminated volume incentives with separate live resting-liquidity program: https://www.cftc.gov/IndustryOversight/IndustryFilings/TradingOrganizationRules . Confirm actual current terms before any financial action.
- HO-STR-0014: Third-party Polymarket dataset https://github.com/DineshKumar8399/polymarket-orderbook-dataset , release `data-2026-09-13` (200,099,823-byte asset metadata verified on GitHub). README claims 484,045,253 quote observations across 314,123 markets, but only 57 crypto market slugs; broad quotes are top-of-book ~2min polls without full depth/fill prints. Four-day gap 2026-07-17 17:26:09 to 2026-07-22 10:32:48, crossed books, volume24hr 94.4% null, biased convergence labels and time-censored API labels. **Not suitable for BTC high-frequency executable-edge P0** without a different full-depth source. Original Parquet bytes not downloaded or independently audited. No duplicate strategy ID created.
- Synthetic data-quality gate: 11/11 pass after correcting an initial test fixture that accidentally combined time reversal with a segment jump. This verifies only rejection logic; no historical replay or real PnL. Keep raw-source hashes, authoritative settlement, depth, latency, fees and OOS records as mandatory READY gates.
