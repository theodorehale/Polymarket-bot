# Hale One daily strategy scan — 2026-11-15

Evidence standard: CLAIM_ONLY vs SOURCE_CONFIRMED vs INDEPENDENTLY_REPRODUCED. This is a read-only source/engineering scan; no trading or data replay.

## Registry-first check
Authoritative docs/strategies/HALE-ONE-STRATEGY-REGISTRY.md blob SHA d0326f531dd41ee15b23a8611cc6650644c5fc7b. Reviewed all HO-STR-0001..0019 including REJECTED. No new ID or READY promotion.

## New external negative evidence: HO-STR-0004 and 0011
Paper https://arxiv.org/abs/2610.26789 (Lejmi, 2026-10-19), "Cooperative Multi-Agent Reinforcement Learning for Market Making on Prediction-Market Order Books". AUTHOR CLAIM / SOURCE_CONFIRMED: trained maker agents on 417 real Polymarket markets, reconstructed order-level books from L2, evaluated held-out end-of-episode portfolio value. Reported improved quoting/lower losses for redesigned models but **no positive average portfolio value in periodic held-out evaluations**, one training seed. This is not independent Hale One replication. Material delta versus prior generic LLM bots: order-level reconstruction, inventory risk management, held-out PnL evaluation. It does not remove 0004's adverse-selection, queue or one-sided-fill failure; nor prove an autonomous AI profit engine. Status 0004 REJECTED and 0011 REJECTED remain. Cheapest falsification: obtain reproducible code/data, rerun multiple seeds and chronological holdout with fee-version, queue, slippage, inventory and settlement ledger; stop if net OOS <=0.

## NegRisk HO-STR-0002 / logical baskets 0015
https://github.com/Polymarket/neg-risk-ctf-adapter/pull/41 currently OPEN per GitHub page: proposed reverse YES->NO conversion remains proposal, not deployed. Official operator docs https://github.com/Polymarket/neg-risk-ctf-adapter/blob/main/docs/NegRiskOperator.md describe oracle, flags and one-hour delay before resolving questions. No executable new reverse conversion established. Prior failure remains: direction, conversion collateral/gas, incomplete outcome sets, asynchronous legs and settlement. SOURCE_CONFIRMED; no own transactions. Keep 0002/0015 RESEARCH CANDIDATE. Reopen on merged deployed contract address, authoritative active-outcome proof, synchronized executable L2 and independent paper replay.

## Cross-venue 0003/0008
https://arxiv.org/abs/2601.01706 reports semantic non-fungibility and cross-venue deviations; AUTHOR CLAIM, not Hale One executable proof. Existing registry's independently identified 10/382 false-positive semantic matches remain relevant. No new execution mechanism; 0003 REJECTED, 0008 RESEARCH CANDIDATE. Reopen with official exact payoff state and two-leg synchronized depth/latency/fees.

## BTC 0001/0009 and data 0014
https://arxiv.org/abs/2604.24366 reports feed-derived trade direction only ~59-62% aligned with on-chain OrderFilled truth. Already documented in registry, not a new strategy. Recheck on-chain join, clocks and fee version before interpreting wallet/aggressor signals. 300-second synchronized lawful L2 + CEX source still not independently validated in this scan. Keep 0001 ACTIVE VALIDATION but profitability NOT_EVALUABLE; 0014 RESEARCH CANDIDATE.

## Incentives 0016/0017, wallets 0006/0007, funding 0013, Agent/API 0010, DEX 0019
No new reproducible net PnL, credited reward, paying customer, or full-cycle receipts found in this targeted scan. Existing states unchanged. Kalshi volume farming 0012 remains REJECTED for compliance; no exploitation. Venue/jurisdiction eligibility must be confirmed before any future paper execution model.

## GitHub check
PR #4 OPEN/DRAFT, PR #5 OPEN/DRAFT, PR #6 OPEN/DRAFT (as fetched 2026-11-15). Main recent commit search includes 706d58f9 but did not establish fresh 300s dual-feed evidence. This run did not execute TypeScript tests, fetch raw market bytes, compute raw SHA256, or run historical Paper replay. No claims of engineering success.

## Next evidence gates
1. 58-case BBO diagnosis and explicit PR/CI commit-SHA reconciliation.
2. One legal 300s full-depth dual-source window with raw SHA256, timestamp and gap report, official market identity and settlement.
3. Causal replay with 50/100/250/500ms latency, depth walk, queue/no-fill, partial fills, fees by venue/time, inventory and settlement.
4. Chronological OOS, negative controls, independent reproduction and explicit GO/NO-GO.
5. Until complete: Trading NO-GO, Paper PnL NOT_EVALUABLE, READY 0.

No live trading, wallet connection, signing, transfers, paid purchases, or geographic restriction circumvention.
