# Hale One — Historical Strategy Review and Execution Plan (2026-11-14)

Status: REVIEW PROPOSAL. This document is not an amendment to the authoritative numbered registry until reviewed and merged. No strategy is READY; no live trading is authorized.

## Canonical source and invariants
Authoritative registry: docs/strategies/HALE-ONE-STRATEGY-REGISTRY.md (19 permanent IDs, 0001–0019). Never recycle IDs, delete rejected records, infer net profitability from screenshots, or create a new ID for an unchanged mechanism. Preserve CLAIM / SOURCE_CONFIRMED / CODE_INSPECTED / SYNTHETIC_TESTED / HISTORICAL_REPLAYED / LIVE_PAPER_VALIDATED / INDEPENDENTLY_REPRODUCED. A negative result is a useful permanent artifact.

## Complete inventory (status from authoritative registry)
| ID | Mechanism | Status | Main barrier / reopen condition |
|---|---|---|---|
| 0001 | BTC CEX→prediction quote lag | ACTIVE VALIDATION | HTTP 451, missing synchronized 300s full-depth evidence; lawful data, OOS executable net PnL |
| 0002 | NegRisk conversion | RESEARCH CANDIDATE | Only actually deployed conversions, depth, cost and settlement proof |
| 0003 | Naive cross-venue spread | REJECTED | Semantic mismatch, asynchronous fills; exact rule identity and dual-leg executable proof |
| 0004 | Retail market making | REJECTED | Adverse selection, queue and one-sided fills; independent OOS fill-level PnL |
| 0005 | Favorite/longshot bias | REJECTED | Gross bias disappears after execution costs; OOS ask/depth evidence |
| 0006 | Wallet copy-trading | REJECTED | Survivorship, attribution, follow delay; ground-truth fills and follower PnL |
| 0007 | Wallet intelligence | WATCHLIST | Independent signal/attribution and paying-customer evidence |
| 0008 | Rule-aware cross-venue router | RESEARCH CANDIDATE | Authoritative rules, synchronized depth, venue/time-specific fees and paper fills |
| 0009 | BTC 15m directional | WATCHLIST | Raw OOS execution/settlement evidence |
| 0010 | Agent/x402 API | WATCHLIST | Unique paying customers, receipts and net unit economics |
| 0011 | LLM/screenshot trading bots | REJECTED | No independent reconciled PnL |
| 0012 | Volume farming/multi-account abuse | REJECTED | Compliance: do not reopen absent legitimate compliant use |
| 0013 | Perpetual funding capture | WATCHLIST | Basis, funding variability, margin/liquidation and fees |
| 0014 | Historical order-book replay infrastructure | RESEARCH CANDIDATE | Raw bytes, hashes, gaps, clocks, depth, rights and official outcomes |
| 0015 | Logical implication baskets | RESEARCH CANDIDATE | Rule/payoff proof, multi-leg latency, partial fills, settlement |
| 0016 | Kalshi sports-prop maker incentive | WATCHLIST | Eligibility, actual credits and adverse-selection-adjusted net |
| 0017 | Kalshi resting-liquidity incentive | WATCHLIST | Score/reward reconstruction, competing depth and adverse fills |
| 0018 | Kalshi rule QA bounty | RESEARCH CANDIDATE | Eligible original issue, human-approved private report and realized payout |
| 0019 | Lending-driven DEX dislocation | RESEARCH CANDIDATE | Borrow availability, debt, MEV, non-atomic exits and full-cycle PnL |

## Five economic families
A. BTC/microstructure: 0001,0004,0009,0014; latest external Probit + mean-variance inventory / paired UP-DOWN concept is an **unverified variant** of 0001/0004, NOT a new ID. The bosona account's displayed PnL and promoter's attribution do not establish the algorithm or reproducible edge.
B. Payoff/settlement arbitrage: 0002,0003,0008,0015,0019. A price difference is not risk-free profit; prove full state-payoff equivalence and actual fillability.
C. Incentives/QA: 0012,0016,0017,0018. Distinguish compliant rewards from prohibited volume manipulation; incentives are not realized net profit.
D. Crypto/wallet: 0006,0007,0013. Historical leaders and headline funding rates omit follow, financing and liquidation risks.
E. Agent/data businesses: 0010,0011, plus non-trading 0018. Protocol payment counts are not third-party revenue.

## Durable conclusions
1. Evidence > Narrative; Reconciliation > Screenshots; Executable Edge > Theoretical Edge; Realized Revenue > Hypothetical Profit; Human Authorization > Autonomous Action; Missing Evidence != Positive Evidence.
2. Public claims of 90%+ win rate, six-figure wallet PnL or AI-driven gains cannot prove execution-adjusted expectancy or attribution.
3. Venue and jurisdiction matter: Polymarket US and International are not interchangeable. Fees require exact venue, product and effective timestamp; US 2026-11-14 tier claims need current official confirmation before modeling.
4. Historical synthetic checks and CI success prove code paths, not market profits. A 20s feed, top-of-book polling, or 15m sample cannot certify a 300s 5m subsecond strategy.
5. REJECTED remains archived, reopen only on a documented material change and new evidence.

## Next 14-day execution plan (proposal)
Days 1–2: audit PR #4/#5, workflow SHA, failed Real Feed Smoke, BBO 58-case diagnosis; freeze test spec and fee/rule versions.
Days 3–5: obtain permitted 300-second raw BTC market L2 plus matching CEX feed; store SHA256, timestamps, clock offset, gap log, market identity and official outcome. If unavailable, declare 0001 BLOCKED, do not extend with unsupported claims.
Days 6–8: implement causal replay, depth walk, fees, slippage, delay grid (50/100/250/500ms), queue/nonfills, partial fills, expiry guard, inventory and settlement reconciliation. Synthetic unit tests are separate from historical validation.
Days 9–11: run pre-registered chronological train/test split and negative controls for 0001; compare simple baseline against Probit and inventory variant without look-ahead; report sample count, net PnL, drawdown and uncertainty. If no real data, NOT_EVALUABLE.
Days 12–14: independent reproduction from raw SHA and commit SHA, publish GO/NO-GO report and update dated evidence records in canonical registry. Parallel read-only 0017 reward-scoring sample only if it does not delay core data engineering.

## Acceptance gate
A strategy is READY only with lawful venue, official settlement proof, source-hashed raw data, reproducible code/commit, no look-ahead, actual available depth at arrival, versioned fees, latency, queue/nonfills, inventory/partial fills, chronological OOS, uncertainty and independent reproduction. Positive synthetic PnL or promotional claims do not qualify.

## Operating rules
Research scan is subordinate to engineering delivery. Every daily report must distinguish actual code/test/data changes from research links; publish blockers and failed gates. No live orders, wallet connections, signatures, transfers, paid procurement, or geographic restrictions bypass without explicit human authorization.
