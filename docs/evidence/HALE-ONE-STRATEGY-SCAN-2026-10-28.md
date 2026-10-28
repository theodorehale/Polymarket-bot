# Hale One Strategy Scan — 2026-10-28 (read-only research + synthetic arithmetic)

Scope: checked the canonical permanent registry on `main` first. **No new strategy ID, no READY promotion, no live trade, no wallet/credential/signature/transfer, no region bypass.** This file is evidence history, not a trading instruction or independently reproduced profitability.

## Source and engineering baseline
- Registry: https://github.com/theodorehale/Polymarket-bot/blob/main/docs/strategies/HALE-ONE-STRATEGY-REGISTRY.md ; 18 permanent IDs.
- Sprint: https://github.com/theodorehale/Polymarket-bot/blob/experiment/5m-microstructure-paper-v0.1/docs/execution/HALE-ONE-14-DAY-SPRINT-2026-10-23.md
- Experiment branch HEAD at scan: `951549fb25b67ee5bc31b424e00f034f75f8ba46` (last commit Oct 27); no newer commits at scan.
- Validation run 40503342969: completed SUCCESS; real-feed run 40503343027: completed FAILURE. These are historical CI results, not new tests.
- PR #4: OPEN/DRAFT, separate Coinbase hypothesis `experiment/coinbase-5m-paired-paper-v0.1`, not merged.
- New verified raw-data SHA256: **none**. Full synchronized 300-second CEX+prediction-market windows: **none independently verified**. Real-book Paper settlement PnL: **NOT_EVALUABLE**.

## Lead A: Wallet intelligence/copying, HO-STR-0006 REJECTED and HO-STR-0007 WATCHLIST (no ID change)
- Original paper (submitted Oct 26): https://arxiv.org/abs/2610.34754 — *Beyond Profit Rankings: Identifying, Understanding, and Evaluating Smart Money in Prediction Markets*.
- CLAIM (authors, not independently replicated by Hale One): 283 paper BUY entries yield +44.18 pUSD; 20 live BUY fills yield -3.04 USDC; 18 commonly closed paper/live pairs lose -3.23 pUSD and -3.19 USDC respectively. Largest paper event contributes +56.07 pUSD. Source-follower entry gap mean +0.00619 and median +0.01 USDC/share (20 live buys); 13/20 bought higher than source. Confirmation gaps are NOT matching latency.
- VERIFIED this run: directly read the original paper text and recomputed the internal arithmetic `44.18 - 56.07 = -11.89`, `75.73 - 31.55 = 44.18`, `20 / 1384 = 1.45%`. No raw trade ledger or chain receipt independent reconciliation; source live PnL is a paper CLAIM with linked transaction examples, not Hale One performance.
- Delta vs rejected 0006: new study has explicit paper/live comparisons, fee/depth-aware FOK and timestamped follower evidence, unlike leaderboard screenshots. It does **not** fix delayed price disadvantage, survivorship, strategy-selection bias or economic replication; its own small live sample loses money. Keep 0006 REJECTED. Wallet profiling methodology is potentially useful to 0007, but not a signal with validated net edge.
- Testable mechanism: use completed on-chain source fills and immutable wallet eligibility cutoff to flag a follower entry; then take *post-detection* market L2, fee schedule, depth walk and simulated delay. No execution authorized. Required data: source on-chain OrderFilled/receipt, market/token/rule IDs, L2 at follower arrival, authoritative settlement, timestamp alignment. Capital for real execution would be required but **zero for read-only validation**.
- Failure modes: price already moved, limited depth, event misidentification, token transfer mistaken for buy, lookahead in wallet ranking, selection on resolved profits, open PnL valued on non-atomic snapshots, unavailable/unauthorized market.
- Falsification: after matched sample, fees, missing/nonfill and 30/60/120-second delay, follower OOS net PnL <= 0 or lower confidence bound <= 0; do not restore 0006 on author PnL. Reopen only with independently reproducible OOS follower fills and settlement.

## Lead B: Fee-aware cross-venue detector, HO-STR-0008 RESEARCH CANDIDATE; HO-STR-0003 remains REJECTED
- Source repo (existing code, not a newly published repo): https://github.com/jtdoherty/kalshi-poly-arb at `26f5ef22337d172de0277407305e2944c50767b8`. Inspected README, `src/kalshi_poly_arb/fees.py`, `sizing.py`, `arbitrage.py` and venue clients through GitHub read-only.
- CLAIM: hand-curated pairs and depth-aware fees find cross-venue matched YES/NO baskets with net edge. No independent profit or executable fill evidence.
- VERIFIED CODE ISSUE: `POLYMARKET_K['sports']=0.03`, `['crypto']=0.072`, `['economics']=0.06`; unknown platform returns 0; Polymarket fee rounded to 4dp with 0.0001 minimum. Official international Polymarket schedule is sports 0.05, crypto 0.07, economics 0.05, and 5dp fee precision: https://docs.polymarket.com/trading/fees . US venue has a different time-dependent schedule: https://docs.polymarket.us/fees . This makes detector's sports fee too low and potentially invents net opportunities. Clients may fall back to Gamma summary prices when CLOB depth fails, which cannot prove executable depth.
- VERIFIED SYNTHETIC ARITHMETIC (independently calculated locally, NOT repo test or real book): 1 Kalshi YES @0.43 (general fee $0.02 using repo one-contract model), 1 Polymarket international sports NO @0.54. Repo sports fee $0.00750 -> claimed net edge `1 - .43 - .54 - .02 - .00750 = +$0.00250`. Official sports fee `0.05*.54*.46=$0.01242` -> net `-$0.00242`. Classification flips. This is a **synthetic fee-model counterexample**, not a real opportunity or proof of realized loss.
- Delta vs 0003: manual pair selection and depth walk improve discovery relative to naive fuzzy matching; they do NOT prove exact payoff/settlement equivalence, simultaneous fills, same-time L2, capital lock-up, jurisdiction eligibility, or fees. Keep 0008 RESEARCH CANDIDATE; 0003 REJECTED.
- Cheapest falsification: freeze venue fee versions and rule hashes; unit-test fee curves and unknown-market fail-closed; manually verify 2-3 exact binary contracts; replay time-aligned books with 50/100/200/500ms arrival, nonfills, partial fills and official settlements. Reject any flagged edge with net <= 0 at arrival or any mismatched payoff state.

## Other lines (no status changes)
- 0001/0014: priority remains full lawful historical L2 + CEX feed, raw hashes, deterministic reconstruction, causality and fee-correct Paper ledger; third-party datasets' published counts are not independently validated here. https://www.poly5mcrypto.com/polymarket-historical-data/ advertises 2-level BTC 5m book/trade sample; no raw file downloaded or hash checked.
- 0002/0015: https://arxiv.org/abs/2610.23517 offers authors' simulated multi-leg arbitrage, not independently executable all-leg atomic settlement; no new independent replay.
- 0004/0016/0017: Kalshi resting liquidity incentives remain contingent on actual eligible two-sided depth, competing liquidity, bad fills and program dates: https://help.kalshi.com/en/articles/13823851-liquidity-incentive-program . Do not treat rebates as guaranteed.
- 0010: https://www.chainalysis.com/blog/north-america-crypto-adoption-2026/ supports large x402 payment activity but does not demonstrate Hale One's third-party paying customers; https://github.com/savecharlie/x402-census supplies a public sampled dataset, not independently rerun. Payment counts are not net revenue.
- 0013 and 0018: no new evidence meeting validation gate; statuses unchanged.
- 0011 and 0012: remain REJECTED; no AI screenshot-return bot or volume farming accepted.

## Validation state and next steps
1. **ACTIVE VALIDATION remains only existing 0001**, not newly initiated by this scan; 0014 remains research data infrastructure.
2. No new live-feed/real-L2 replay or independently verified SHA; all PnL outside the synthetic arithmetic above is third-party CLAIM.
3. Fix causality and fee fail-closed in Hale One Paper engine; obtain one full lawful synchronized 300s window, raw SHA, complete depth, official outcome, then execute historical replay and reconciliation. Missingness => NOT_EVALUABLE.
4. For 0008, add a versioned fee regression test covering sports 0.05 and unknown-category rejection; for 0006/0007, record the paper/live replication gap and keep negative history.
5. Gate 1 Oct 25 missed; Gate 2 Oct 30 not yet met; Gate 3 Nov 6 NOT_EVALUABLE. No READY FOR STRATEGY LIBRARY.
