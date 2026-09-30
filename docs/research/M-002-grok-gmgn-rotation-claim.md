# M-002 — Grok / GMGN mechanical meme rotation claim

Status: CLAIM AUDIT IN PROGRESS
Classification: Directional high-frequency rotation / execution-discipline fixture
Arbitrage status: NOT ARBITRAGE
Live execution: OUT OF SCOPE

## Public claim

A viral Chinese/English post claims:
- initial balance: $50
- 12 meme assets
- 6 agents
- 99 trades
- peak balance: $3,532
- intermediate balance: $682.70
- 81 wins / 18 losses
- displayed win rate: 82.0%
- reported fees: $104
- reported turnover increasing from $233 to $25.4k
- example: sold BONK at 02:52:22 and bought BONK again at 02:52:25

The post frames the result as emotionless mechanical rotation rather than long-horizon conviction.

## Findings from source audit

### 1. The GMGN URL used in reposts is a referral URL, not trade-history proof

GMGN official documentation describes `gmgn.ai/r/...` URLs as referral links that bind referral codes and can generate referral commissions.

Therefore a referral URL cannot by itself prove:
- wallet identity,
- account balance,
- transaction history,
- realized PnL,
- model identity,
- autonomous execution.

This also creates an economic incentive for promoters to drive clicks / trading volume.

### 2. No primary wallet / transaction set has been identified

Current public reposts do not provide a verifiable wallet address or complete transaction-hash set for the alleged 99 trades.

Without wallet-level primary evidence, the claimed performance cannot be independently reconstructed.

### 3. Arithmetic inconsistencies exist

- 49 wins / 10 losses = 49 / 59 = 83.0508%, not 83.2%.
- 81 wins / 18 losses = 81 / 99 = 81.8182%, not 82.0% if displayed to one decimal in the ordinary way.
- $50 -> $3,532 is 70.64x (+6,964%).
- A later balance of $682.70 would be an ~80.67% drawdown from a $3,532 peak.
- GMGN official documentation states a 1% service fee per transaction. A reported $25.4k aggregate notional would imply ~$254 of GMGN service fees alone if the same fee basis applies, before priority/tip/gas/slippage. The viral claim reports $104, so the definitions or numbers do not presently reconcile.

### 4. Shared screenshot does not independently prove the headline result

The visible "Grok Bot" dashboard screenshot shows a much smaller balance/PnL state ($58.13 balance, +$8.13 P&L in the shared image), not the claimed $3,532 peak. It may be from a different point/run, but it is not direct evidence of the headline result.

### 5. Strategy classification

Even if all reported trades are genuine, this is not direction-independent arbitrage.

Before each exit, first-leg meme inventory carries market risk.

Correct classification:
`DIRECTIONAL_HIGH_FREQUENCY_ROTATION`

Potential scientific value:
- mechanical exit/re-entry discipline
- no anchoring to prior trades
- turnover / fee sensitivity
- short-horizon markout
- regime switching
- inventory duration
- adverse-selection measurement

## Required proof before accepting performance claims

1. Primary wallet address(es).
2. Complete transaction hashes for the run.
3. Exact experiment start/end timestamps.
4. Exact chain and token contract addresses.
5. Initial wallet state and funding transaction.
6. Full buy/sell fills and token quantities.
7. DEX / router / GMGN fee transfers.
8. Priority fees, tips, gas and MEV/slippage costs.
9. Realized vs unrealized PnL distinction.
10. Code/config/logs proving Grok/agents actually generated the decisions.
11. Reconciliation of all 99 trade outcomes and the displayed win-rate definitions.
12. Independent closing-balance verification.

## Research metrics if primary data becomes available

- realized net PnL
- gross PnL
- fee ratio
- slippage ratio
- profit factor
- expectancy
- max drawdown
- peak-to-final drawdown
- median / p95 holding time
- median / p95 turnover per dollar of capital
- 30s / 60s / 120s markout
- re-entry count after exits
- per-token contribution
- tail-loss contribution
- regime-conditioned performance
- unexplained cashflow / inventory residual

## Current verdict

`MECHANICAL_ROTATION_IDEA = RESEARCH-WORTHY`

`VIRAL_PERFORMANCE_CLAIM = INSUFFICIENT_EVIDENCE`

`ARBITRAGE = NO`

`LIVE_COPY = REJECT`

Do not promote this fixture to strategy evidence until primary wallet data and full ledger reconciliation are available.
