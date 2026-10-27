# Hale One Strategy Scan — 2026-10-27 (read-only evidence log)

## Scope and provenance
- Read permanent registry from `main`: `docs/strategies/HALE-ONE-STRATEGY-REGISTRY.md` (blob SHA `98fb52ffcd9a7ccf009654c158fd2375e049f2b7`), IDs HO-STR-0001 through HO-STR-0018. Historical REJECTED entries were checked before classification.
- Read sprint gate document from `experiment/5m-microstructure-paper-v0.1` (blob SHA `121ec16ec55a5122b939e14a7d572470949296ed`).
- Sources: original official documentation, source repositories and dated independent discussions. This is a source/metadata audit, not an execution or PnL audit.
- No new permanent ID, no status promotion, no live trade, no credentials, wallet, signing, transfer, purchase, or region workaround.

## HO-STR-0014 / HO-STR-0001 — new no-signup BTC 5m dataset lead
- Source: https://poly5mcrypto.com/sample/ (vendor page; no independent provenance established).
- CLAIM: free one-hour sample for 2026-10-16 12:00–13:00 UTC, 12 five-minute BTC windows, 19,765 book rows, 17,904 trades, outcomes, CSV and Parquet. This is an additional source for the EXISTING replay/data infrastructure family, not a new trading mechanism.
- VERIFIED FACTS (independent arithmetic on *vendor-published HTML table only*): 12 window entries; trade_count sum = 17,904; 11/11 adjacent final_price to next price_to_beat equal; 12/12 UP/DOWN labels consistent with displayed start/final prices. These checks establish internal arithmetic consistency only.
- RAW STATUS: attempted direct CSV download in container, failed DNS resolution (`Could not resolve host: poly5mcrypto.com`). No raw bytes, SHA256, L2 depth, clock/ordering, complete-window continuity, CEX pairing, fee or settlement independent verification. No paper trades. Evidence level SOURCE_CONFIRMED, metadata arithmetic checked; NOT HISTORICAL_REPLAYED.
- Comparison: unlike previously found PMData/Marketlens/PredictionTicks, this vendor offers a small 12-window sample that may be easier to acquire; old latency, data fidelity, provenance and settlement failure modes remain unchanged. Vendor's book row count does not prove full depth or lossless incremental updates.
- Required inputs/tools/capital: no trading capital for read-only research; downloadable raw CSV/Parquet, source license, market IDs, event and receive timestamps, L2 sizes, CEX matched feed, authoritative settlement. For actual later execution, venue eligibility and separate financial authorization would be mandatory.
- Failure modes/falsification: incomplete or non-monotonic windows, missing price levels, stale receive timestamps, impossible book states, settlement mismatch, compressed/cadence-limited data unsuitable for 50–500ms edge, or negative costed arrival-price OOS PnL. Reopen only after raw hash and three independent 300s windows pass continuity and official outcome checks.

## HO-STR-0010 — x402 seller demand/retention caution
- Official mechanism: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server confirms discovery/calling of paid endpoints; this does NOT prove seller demand or revenue.
- Independent community CLAIM, 2026-10-26: https://www.reddit.com/r/AI_Agents/comments/1xfs53k/i_counted_one_week_of_x402_payments_on_base/ reports ~431,021 transfers, 692 sellers with a plausible payer, 343 with repeat-day payers, 18 with >=10 repeat payers; author reports 9,300 requests and only 8 paid calls to own products. Self-reported analysis, no reproducible wallet list/raw ledger/attribution independently checked here.
- Difference vs existing HO-STR-0010: adds a proposed retention/third-party-payer test, not a new revenue mechanism. Status remains WATCHLIST; no new ID.
- Costs/constraints: provider rights to resell market data, hosting/model/query costs, endpoint uptime, payment fees, refund/dispute and idempotency handling, false customer attribution, legal/ToS; no slippage/market fill since this is non-trading. Capital: developer time and hosting budget, no trading capital.
- Falsify monetization: no independently identifiable repeat external customers, or realized third-party receipts minus hosting/data/compliance costs <= 0. Reopen after consented, compliant pilot with reconciled external receipts and repeat use; no payment test authorized in this scan.

## Existing trading hypotheses — historical blockers retained
- HO-STR-0002/0015 NegRisk/logical baskets: author-simulated profit is not Hale One realized PnL. Conversion can be atomic while independent order legs are not; rule identity, arrival depth, partial fills and official settlement are missing. RESEARCH CANDIDATE, no upgrade. Reference https://arxiv.org/abs/2610.23517 and https://docs.polymarket.com/trading/fees .
- HO-STR-0003 naive cross-venue: REJECTED; matched market titles do not prove settlement equivalence or two-leg execution. Reopen only with rule hashes and synchronized depth.
- HO-STR-0004 retail maker: REJECTED; queue position/adverse selection and unverified rebates. Do not count a fixed maker reward as guaranteed.
- HO-STR-0006 copy-whale: REJECTED; survivor bias, follower latency, fill attribution and net follower returns remain unverified.
- HO-STR-0007 wallet intelligence: WATCHLIST; signals/attribution need ground truth.
- HO-STR-0013 funding capture: WATCHLIST; basis, funding regime, borrow and liquidation constraints remain.
- HO-STR-0016/0017 Kalshi incentives: WATCHLIST; eligibility, snapshots, competitive reward share and adverse fills must be jointly reconciled. Source https://help.kalshi.com/en/articles/13823851-liquidity-incentive-program .
- New repository https://github.com/finnfujimura/agenttrader (README read via GitHub connector) is an agent/paper tooling candidate under HO-STR-0014, not new strategy; its own README states BaseStrategy lacks external Chainlink API support, so it does not close BTC 5m paired-signal gate. No code execution performed.
- https://github.com/cengizmandros/polymarket-backtest (README read) explicitly says no L2 replay and no partial fills; bar VWAP cannot validate sub-second executable BTC edge. Do not promote.

## Fee / synthetic falsification arithmetic
- Official international Crypto taker: `fee = shares * 0.07 * p * (1-p)`, source https://docs.polymarket.com/trading/fees (current docs; verify historical fee version per market).
- Synthetic 10 YES @0.48 + 10 NO @0.49: gross payout margin $0.30; fees $0.17472 + $0.17493 = $0.34965; theoretical net = -$0.04965 BEFORE slippage, delay and partial fills. This is not an observed opportunity or a paper fill.
- Polymarket US is a separate venue and fee schedule (effective 2026-10-19), source https://docs.polymarket.us/fees ; do not mix US and international fees.

## Engineering gate check (GitHub connector, 2026-10-27 scan)
- Experiment branch latest commit: `763383fef7eb174e31a4c64875b6c58685c4fa17` (2026-10-26), evidence-only; no later commit found in branch commit list at scan.
- PR #4: open/draft, head `experiment/coinbase-5m-paired-paper-v0.1`, not merged into primary experiment branch.
- CI Validation run 40322261127: build and tests succeeded; job logs explicitly show 25/25 tests, 7 test files.
- CI Real Feed Smoke run 40322261243: failed; logs show WebSocket `Unexpected server response: 451`. No legal bypass attempted.
- npm install logs show 32 dependency vulnerability advisories (2 critical, 8 high, 8 moderate, 14 low); severity advisories are not proof of exploitability.
- Gate 1 (Oct 25): NOT MET (end-to-end real-data paper ledger / 58 BBO mismatch disposition missing). Gate 2 (Oct 30): NOT YET MET (no verified 300s synchronized dual-source full-depth window and costed settlement ledger). Gate 3 (Nov 6): NOT EVALUABLE (no fixed-parameter OOS net fills).
- Actual new raw data bytes: 0. New raw SHA256: none. New real-depth paper fills: 0 verified. New net PnL: unavailable. No new test run was initiated by this scan; CI statuses were read, not reproduced locally.

## Next cheapest validation
1. Legally obtain the free one-hour CSV/Parquet, preserve raw SHA256/license, independently check each 300s window and market/outcome identity; if network access fails, mark BLOCKED rather than silently substituting vendor table.
2. Inspect official V2 market stream schema (https://docs.polymarket.com/market-data/realtime-data) against collector, separately from HTTP 451. Do not bypass any region restriction.
3. Feed only verified windows into causal depth-walk paper simulator with 50/100/200/500ms latency, missed/partial fills, market-specific historical fees, official settlement and per-trade reconciliation.
4. No library promotion or new ID without independently reproducible historical/Paper record and OOS after-fee results.
