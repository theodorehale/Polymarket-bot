# Hale One — 2026-10-29 09:07 ET strategy evidence scan (read-only)

**Scope:** Review of existing permanent IDs; no new strategy IDs, no READY promotions, no trades/wallets/signatures/funds, no 451 bypass. This is **not** a profitability report.

## HO-STR-0014 / HO-STR-0001 — Vike free L2 historical archive (RESEARCH CANDIDATE / ACTIVE VALIDATION unchanged)

- Primary docs: https://vike.io/data/polymarket-historical-data
- Public manifest: https://data.vike.io/archive/manifest.json (generated_at **2026-10-29T00:52:36Z**).
- **SOURCE_CONFIRMED:** manifest advertises per-date streams `book_events`, `trades`, `l1_quotes`, plus per-asset/per-tenor coverage. BTC 5m 2026-10-28 manifest entry reports **85,013,878 book_events rows, 1,443,642,979 bytes**; trades **449,210 rows**; L1 **15,137,818 rows**. These are **provider-declared metadata**, not independently counted.
- Advertised no-key sample: https://data.vike.io/archive/samples/book_events.parquet ; one full crypto 5m market with both tokens, open through resolution. The provider advertises CC BY 4.0 for data.
- **NOT VERIFIED:** sample and manifest bytes could not be downloaded into the execution environment (DNS resolution failure); web viewer could read the manifest JSON, but cannot open Parquet. No SHA-256, row-count audit, gap audit, 300-second replay, source-clock validation, CEX pairing or settlement. The public manifest contains **no `sha256` field**; local checksum would have to be calculated after download.
- **Material delta versus earlier 0014 sources:** advertises event-by-event full-depth snapshot/delta stream with `seq`, source `ts` and `local_ts`, rather than only periodic L1 samples. However a vendor's self-reported manifest cannot prove integrity or availability. Existing 0014 data-quality and 0001 CEX-pairing blockers remain.
- **Cheapest falsification:** download free no-key sample; SHA-256; inspect Parquet schema, both token IDs, monotonic receive sequence, gaps, depth reconstruction, official settlement; require complete >=300s coverage; compare with official public CLOB for independent cross-check. Use no funds or accounts. If data inaccessible or clocks invalid, mark BLOCKED/UNVERIFIABLE, not zero profit.

## HO-STR-0002 / HO-STR-0015 / HO-STR-0008 — Polymarket US combo fee changed (SOURCE_CONFIRMED, no promotion)

- Primary: https://docs.polymarket.us/fees . The notice states **effective 2026-10-28 22:00 ET**, the combo `(1-p)^4` coefficient rises **0.06 → 0.085** while `0.0695` remains unchanged. At inspection, examples further down the page still used 0.06; **do not rely on those stale examples**.
- Formula: `fee = C * p * (0.0695*(1-p) + k*(1-p)^4)` with k=0.06 before and k=0.085 after effective time. This is **US combo only**, not international standalone crypto, not Kalshi and not a maker rebate.
- **SYNTHETIC_TESTED:** six deterministic Decimal arithmetic cases (p=0.10, 0.50, 0.90; C=10,100) passed three invariant assertions per case and three spot checks. At p=.10 C=100, old $1.019160 vs new $1.183185, increase **$0.164025**. At p=.50 C=100, old $1.925 vs new $2.003125, increase **$0.078125**. Unrounded model only; actual fee rounding and exchange execution response not tested.
- Local artifacts (not GitHub committed): `/mnt/data/hale_scan_2026_10_29_am/combo_fee_regression.py`, `combo_fee_regression.csv`. SHA256 script `ffb0959c8238d980cf1d5109c2d8659c07dd80238d906d1d1c4d77a06c9f`; CSV `decef5e3105dabd38fc51c67bbb61605ac49db60d18e212046b9fe482c6fa929`.
- **Delta:** executable basket payoff unchanged, but combo fee increases; recompute all threshold-based candidates with effective-time/versioned fee. **Falsification:** net basket edge <= depth walk + both-leg/combos fees + latency + adverse partial fills or payoff identity cannot be proven. No new ID, no READY.

## HO-STR-0005 — Calibration backtest claimed +18.8% (REJECTED unchanged)

- Code commit reviewed: https://github.com/l-marque/polymarket-calibration-study/commit/91b315e51d475a79fe00ffc8a67c29144267d9cd
- **CLAIM:** README reports 99,999 resolved markets, 1.36M Gamma price observations, +18.8% ROI on 187 short-YES trades with 2026 holdout, 0.5% slippage.
- **CODE_INSPECTED:** `backtest/engine.py` contains a docstring plan, not a fill-level backtest engine. `paper_trading/portfolio.py` calculates `NO = 1 - YES` from Gamma `outcomePrices`, rather than using actual NO ask/depth at simulated arrival; it checks `closed` and infers YES winner by `outcomePrices[0] > .5`, rather than independent authoritative settlement; `paper_trading/config.py` assumes fixed 2% round-trip fee and 0.5% slippage. The README itself admits partial identification/backtest overlap and 3-month OOS.
- **Failure mechanism unchanged:** quote not executable, no depth, no realistic time/fee schedule, settlement inference. Do **not** treat +18.8% as reproducible Hale One return. A more careful preregistration is a methodology delta, not a resolution of execution costs.
- **Reopen:** raw dated Gamma+L2+official settlement records, holdout manifests, independent entry NO ask/depth/fee, settlement reconciliation, OOS net PnL and confidence intervals. Otherwise REJECTED.

## Other existing IDs (no material new executable evidence)

- HO-STR-0003 naive cross-venue remains REJECTED: contract-rule identity, synchronized depth and asynchronous two-leg risk still unresolved.
- HO-STR-0004 ordinary making remains REJECTED: queue, inventory and adverse selection still unpriced.
- HO-STR-0006 wallet copy remains REJECTED; HO-STR-0007 wallet intelligence WATCHLIST: no independently reconciled follower OOS net returns.
- HO-STR-0010 Agent/x402 API remains WATCHLIST. Original Chainalysis report (2026-10-14): https://www.chainalysis.com/blog/north-america-crypto-adoption-2026/ reports >138M x402 Base txs through 2026-07-01, 87% payments $0.0001–$0.10 in extended observation. **Researcher's measurements**, not Hale One customers, receipts or margin. Falsify product thesis with no independent repeat paying customers after explicit outreach.
- HO-STR-0013 funding capture WATCHLIST: no new hedged fill/funding/basis/liquidation OOS reconciliation.

## Engineering dependency read

- `experiment/5m-microstructure-paper-v0.1` compared with prior `bbb50624...`: **identical**; no new commits on that branch.
- PR #4 https://github.com/theodorehale/Polymarket-bot/pull/4 remains **open/draft**, not merged.
- Latest experiment CI: Validation https://github.com/theodorehale/Polymarket-bot/actions/runs/40691120844 **success**; Real Feed Smoke https://github.com/theodorehale/Polymarket-bot/actions/runs/40691120774 **failure** (2026-10-28).
- No newly independently hashed real market file, no verified 300s synchronized CEX+prediction-market window, no real-book paper fills or settled after-fee OOS PnL. `NOT_EVALUABLE`, not a zero return or GO.
- Gate 2026-10-25 not met; 2026-10-30 remains unfulfilled as of this scan; 2026-11-06 cannot be evaluated.

**Priority:** obtain and hash lawful Vike free sample, then repair/replay causal fill ledger. Fee regression should be integrated into existing fee model with venue+effective timestamp, but synthetic arithmetic alone is not READY evidence.
