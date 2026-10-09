# Hale One P0 — read-only validation gates (2026-10-09)

Status: ACTIVE VALIDATION (engineering); NOT READY FOR STRATEGY LIBRARY.

## Objective
Validate whether a legally accessible US prediction-market BTC product offers net executable edge after realistic latency, fees and liquidity. No live trading or wallet activity is authorized.

## Verified inputs
- Official Polymarket US SDK (`Polymarket/polymarket-us-python` and `polymarket-us-typescript`) documents public unauthenticated markets.list, markets.book, markets.bbo. Actual eligible BTC market and matching resolution semantics remain unverified.
- Existing Real Feed Smoke failed on HTTP 451; do not bypass jurisdiction controls.
- OpenMarket arXiv:2607.26245 reports observable quote lag but negative out-of-sample simulated performance; latency is not profit.

## P0 acceptance checklist
- [ ] Confirm venue, jurisdiction, market availability, contract rules, resolution time/source, permitted API usage.
- [ ] Read-only market discovery and exact market-ID mapping, fail closed on ambiguity.
- [ ] Timestamped raw L2 snapshots and reference BTC feed with source/collector clock metadata, immutable hashes, gap/staleness checks.
- [ ] Reconcile price levels, depth, fee version, order size, hypothetical arrival at 50/100/200/500ms, partial/no fills, slippage and market impact.
- [ ] Record paper fill/miss, markout and eventual resolution; never equate midpoint with executable price.
- [ ] Walk-forward OOS tests, cost/latency stress tests, reproducible scripts, manifest, confidence bounds and GO/NO-GO.

## P1 NegRisk gate
Read-only scanner only. Confirm market is a genuine NegRisk market, outcome completeness and allowed conversion direction; walk executable book depth and subtract fees, conversion/gas and capital lockup. Reject missing/stale book, unsupported conversions and semantic mismatches.

## Evidence schema per run
`run_id`, `commit_sha`, `source`, `venue`, `market_id`, `resolution_rules_hash`, `captured_at`, `source_timestamp`, `clock_uncertainty_ms`, `raw_data_sha256`, `fee_schedule_version`, `order_size`, `arrival_delay_ms`, `depth_vwap`, `fill_or_miss`, `estimated_slippage`, `fees`, `net_paper_pnl`, `markout_horizon`, `failure_reason`, `oos_split`, `verdict`.

## Safety
Read-only, paper-only. No credentials, orders, wallet connection, transactions, fund movement, geographic circumvention, or strategy promotion absent reproducible evidence. Human approval required before any financial action.

## Next executable step
Implement a read-only market discovery and snapshot collector on an isolated experiment branch, test with fixtures, then run against officially permitted endpoints. If BTC 5m-equivalent product does not exist, record NO-GO rather than substitute an unrelated market.