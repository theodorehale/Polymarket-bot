# Hale One daily strategy scan — 2026-10-25 (read-only evidence log)

## Scope and decision
Reviewed permanent registry (18 IDs, including REJECTED) before assessing candidates. No new ID; no status changes; no READY. All evidence below is either public source inspection or independently cross-checked **metadata**, NOT raw market data verification, trade fills, profit, or payment reconciliation. No orders/wallet/signatures/transfers/purchases.

## HO-STR-0014 / HO-STR-0001: OutcomeTick free BTC 5m day — newly discovered data candidate (not a new strategy)
Source repository: https://github.com/Ligengxin96/polymarket-data-samples ; release https://github.com/Ligengxin96/polymarket-data-samples/releases/tag/samples-2026-09-08 ; manifest https://github.com/Ligengxin96/polymarket-data-samples/blob/main/samples/manifest.json ; README as inspected 2026-10-25.

**CLAIM (vendor):** Sep 8 UTC sample has 292 market records, 141,402 full-book snapshots (up to ~1/sec/token), 3,516,537 throttled price-change events (~20ms BTC capture), 1,314,078 unthrottled BBO events (price only), 480,491 trade prints, 81,969 Chainlink 60s TWAP reports. Vendor claims 253/253 outcomes with both exact boundary-second reports match official outcomes, while 35 of 288 same-day settlements cannot be independently re-derived. Vendor also claims throttled deltas capture only 63.4% of top-of-book changes. These numbers are **not independently recalculated from raw files**.

**VERIFIED METADATA:** Queried GitHub Release API and repository manifest independently. All 9 release assets (8 component files + bundle) match manifest on filename, byte size and SHA256 digest: 9/9 metadata matches. Release tag samples-2026-09-08, published 2026-09-11. Bundle declared 330,215,988 bytes and sha256 9ded382d298476c6061bfa13ed675d9147216b817dc0800fe84eb62937831506. Book declared 33,445,527 bytes, sha256 e54595d9bc2a4877bc38d5be0ea3a1e809f6027dc26a9776ba3b83816b2d7de7; market metadata declared 102,390 bytes, sha256 4096a32ef2a42628a81a5d221b4e9c6f28fdebe26c805b835972dc490bcc3d88. **Downloaded original asset bytes: 0; raw SHA independently computed: 0.** Container network connection to GitHub release asset failed, and the download tool could not fetch it. 9/9 proves publisher metadata consistency only, not dataset correctness or completeness.

**Material difference versus prior HO-STR-0014 vendors:** Public one-day multi-stream sample includes claimed authoritative Chainlink TWAP settlement feed, full book, BBO and trade prints, rather than only coarse BBO snapshots. No difference in underlying HO-STR-0001 signal hypothesis; historical Binance-vs-Coinbase identity and 451 still unresolved. Full book snapshots at ~1/sec and throttled 20ms deltas cannot by themselves prove exact 50–500ms arrival-time depth or queue/fill priority. BBO has no sizes; trade prints are explicitly not reconciled with on-chain fills. Settlement rule version must be read from each market metadata (not assumed from date); vendor says 60s TWAP in Sep 2026. Missing exact boundary timestamps => NOT_EVALUABLE, never interpolate to invent a resolved outcome.

**Cheapest falsification:** Obtain legally permitted free release bytes, independently hash all components, select 3 complete nonoverlapping 5m windows, verify market rule and exact Chainlink TWAP boundaries, reconstruct snapshot/delta state, quantify BBO mismatch/gaps, depth-walk with delays 0/100/250/500ms, realistic fees/partial/no fills and settlement. Fail/mark NOT_EVALUABLE if missing sizes, event ordering, valid settlement or legal data rights. No dataset purchase approved. Status HO-STR-0014 RESEARCH CANDIDATE, HO-STR-0001 ACTIVE VALIDATION unchanged.

## HO-STR-0010: Agent paid API revenue — WATCHLIST
Primary platform mechanism: https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server . Agent402 https://agent402.tools/revenue shows a claimed self-classified external-payment ledger and separately identifies canary/self-funded traffic, but its public summary is not independent attribution or Hale One receipts. Different cached page versions show incompatible counts; do not repeat revenue figures as verified. Mechanism: sell licensed market-rule/liquidity QA reports per API call. Required: redistribution permission, original data provenance, buyer interviews, idempotent metering, cost/revenue ledger, payment settlement proof. No customers, payments or profitability validated. Falsify if no external paid demand after an explicit authorized pilot, or net unit economics negative. No API deployment, payment acceptance or wallet use performed.

## HO-STR-0017: Kalshi liquidity incentives — WATCHLIST
Official https://help.kalshi.com/en/articles/13823851-liquidity-incentive-program and https://help.kalshi.com/en/articles/16076644-liquidity-incentive-programs-where-to-find-them confirm per-market pool, random within-second order-book snapshots, target depth and eligibility; reward estimates are not paid credits. Distinct from terminated volume incentive (HO-STR-0012) and from sports component maker bonus (0016). No read-only exact per-market score/fill loss reconciliation, so not READY. Maker adverse selection and eligibility remain failure conditions.

## Rejections and no-change review
- HO-STR-0003 naive cross-venue arbitrage: REJECTED; no settlement-identity proof or synchronized two-leg depth/fill evidence. HO-STR-0008 retains research candidate status.
- HO-STR-0004 retail market making, 0005 favorite/longshot standalone, 0006 leaderboard copy trading, 0011 autonomous screenshot bot, 0012 abusive volume farming remain REJECTED; no material executable change.
- HO-STR-0002/0015 NegRisk and combinatorial baskets remain RESEARCH CANDIDATE; paper https://arxiv.org/abs/2610.23517 (v3 2026-10-20) is author simulation, not independent full-basket fills/settlement proof.
- HO-STR-0013 perp funding remains WATCHLIST (basis, liquidation, funding flip, capital and venue eligibility).

## Fee and execution gate
Official international fee page https://docs.polymarket.com/trading/fees shows Crypto taker fee = C*0.07*p*(1-p), maker fee zero; hypothetical 10 shares at $0.50 => $0.175 taker fee per leg, $0.35 two-leg total before spread/slippage. **This is formula-only, not observed execution.** US and international venues have distinct schedules. US official https://docs.polymarket.us/fees was retrieved showing a July 1 schedule with theta 0.06 while more recent Oct 19 reports describe theta 0.0695 and changed rebate tiers; do not rely on stale cached US fee pages. For any test record venue, market, timestamp, fee-version and authoritative effective schedule; do not interchange venues.

## GitHub delivery check at 2026-10-25 09:xx ET
- experiment/5m-microstructure-paper-v0.1 head a649ccbd4325601335240aa0dd784c51d9d5a5b0, commit dated 2026-10-24 12:55:57Z. No later branch commit found.
- PR #4 OPEN, not merged, updated 2026-10-21 00:08:18Z.
- Latest workflow run Microstructure Validation 40095984828 SUCCESS; Real Feed Smoke 40095984762 FAILURE (previously reported 451; logs not re-read in this scan).
- No independently confirmed new full 300s paired window, end-to-end paper fill, official settlement ledger or OOS net PnL. Oct 25 Gate 1 NOT MET on evidence inspected; Oct 30 and Nov 6 pending.

**Next action:** Prioritize downloading and verifying free data (or another permitted source) and integrating existing paper settlement component into offline book replay, rather than buying data, adding strategies, or treating metadata checks as PnL. No strategy promoted.
