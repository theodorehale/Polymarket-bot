# M-001 — Real MERGE sample reconstruction

Status: IN PROGRESS  
Classification: Structural complete-set merge fixture  
Arbitrage status: UNPROVEN  
Execution mode: Research only

## Verified on-chain facts

Transaction:
`0xf3aebee5e703233859780a8e532da16652c3d8d6f6a635eadf1967bdacdfead2`

Wallet:
`0x20dBb007C9ddCd32F4E851297A1F69CF0f93Dd80`

Conditional Tokens contract:
`0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`

Collateral token:
`0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb`

Condition:
`0xc29051acc4742fc978bcd0fd00587272948515e60a9ed7aba207931ebad18a94`

Outcome token IDs consumed:
- `74723590345630129580943120325811377226397996327954836114025620041749236992770`
- `45018063954518665503779092595505913113503898317727084084694604098994439338695`

Amount merged:
`11,000,000` base units per outcome = 11 outcome shares at 6 decimals.

Collateral returned:
`11,000,000` base units = 11 pUSD.

Transaction status:
SUCCESS

Observed transaction fee:
`0.014360315380725681 POL`

Observed contract semantics:
- `mergePositions(... partition=[1,2], amount=11,000,000)`
- two ERC-1155 outcome positions were burned
- 11 pUSD was transferred from Conditional Tokens to the wallet

## What this proves

1. The wallet held a complete binary set of 11 + 11 outcome tokens immediately before execution.
2. The complete set was successfully merged.
3. The merge returned 11 units of collateral.
4. The merge payoff itself is direction-independent.

Therefore:

`MERGE_MECHANISM = PASS`

`MERGE_DIRECTION_INDEPENDENCE = PASS`

## What this does NOT prove

It does not prove that the complete set was acquired below 11 pUSD total cost.

Missing evidence still includes:

- provenance of the two outcome-token inventories,
- matched acquisition prices,
- maker/taker fees,
- rebates/incentives,
- transfers or splits that may have created inventory,
- pre-existing inventory,
- any relevant protocol cashflows before the merge.

Therefore:

`HISTORICAL_ARBITRAGE = UNPROVEN`

## Required accounting closure

To prove structural arbitrage, reconstruct all inventory lots contributing to the 11-share complete set.

For the exact matched quantity:

`AcquisitionCostYES + AcquisitionCostNO + Fees + Gas - Rebates < 11 pUSD`

and verify:

`OpeningInventory + NormalizedEvents = PreMergeInventory`

`PreMergeInventory - MergeConsumption = ClosingInventory`

`OpeningCash + CashFlows = ClosingCash`

Residuals must remain within predeclared tolerances.

## Immediate next evidence targets

1. Locate all activity for this wallet and condition before 2026-05-08 07:48:19 UTC.
2. Trace both token IDs backward to their earliest contributing acquisition lots.
3. Classify each source as TRADE / SPLIT / TRANSFER / CONVERSION / OTHER.
4. Preserve raw records before normalization.
5. Match at least 11 shares of each side using explicit lot provenance.
6. Reconstruct cash spent and fees.
7. Feed the normalized events through TokenLedger, CashLedger, and Reconciler.
8. Only after full closure compute historical locked PnL.

## Fail-closed conditions

Stop proof and retain `UNPROVEN` if any of the following remains:

- unknown event type,
- unexplained inventory,
- history truncation,
- unmatched acquisition lot,
- unexplained cashflow,
- protocol-version ambiguity,
- residual beyond declared tolerance.

## Research conclusion so far

This is a real and clean example of the MERGE leg of complete-set arbitrage, but it is not yet a proven profitable arbitrage cycle.

The scientific target is acquisition provenance, not the merge itself.
