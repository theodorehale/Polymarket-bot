# Hale One stored-strategy closure audit — 2026-11-22
Scope: read-only repository/CI inspection; no new strategy IDs, market requests, trades or new Paper replay. Registry 0001–0019 and REJECTED history unchanged.

## Verified GitHub evidence
- PR #3, #4, #5, #6 OPEN/DRAFT; #3 reports mergeable=false.
- Validation run 41199785959 (2026-10-31) SUCCESS at ce642e70adea4560cdaac722cd18742c74fc9779: code tests, not profitable Paper execution.
- Real Feed Smoke run 40691120774 (2026-10-28) FAILED. Job 122825878314 shows npm ci and build SUCCESS, BTC market discovery success, then WebSocket HTTP 451 and unhandled error, exit 1. https://github.com/theodorehale/Polymarket-bot/actions/runs/40691120774
- Validation run 41199785959 artifact listing was empty; this does not establish absence of artifacts in other runs.

## Code inspection: integration mismatch
- experiment/5m-microstructure-paper-v0.1/src/microstructure/paper-latency-sweep.ts selects first snapshot received at or AFTER hypothetical arrival, defaults feeRate to 0, and defaults sweep to 50/100/200/500ms rather than required 50/100/250/500ms.
- fix/paper-causality-fee-20261030/src/microstructure/paper-execution-simulator.ts rejects books received AFTER arrival and requires an explicit feeRate. The two inspected branch modules have inconsistent snapshot selection assumptions. Their integration was not executed this run. Use latest valid book observed no later than arrival; reject stale books and do not infer queue priority.
- Simulator PAPER_FILLED is a modeled taker depth-walk result, not observed execution. Source comments disclaim intervening deltas and queue position.

## Gate decisions
| Gate | Current observation | Decision |
|---|---|---|
| Raw L2, SHA256, 300-second paired capture, clock sync | No independently verified new raw sample | BLOCKED/UNVERIFIABLE |
| Official resolution/rules and venue fee version | No reconciled raw-source proof | NOT_EVALUABLE |
| 50/100/250/500ms causal replay | Inspected sweep defaults to 200ms and future snapshot selection | INTEGRATION REVIEW FAIL |
| Explicit realistic fees | Inconsistent zero default versus required fee | INTEGRATION REVIEW FAIL |
| Depth, slippage, partial/no-fill, inventory, queue | No independently reconciled real execution data | NOT_EVALUABLE |
| OOS net Paper PnL, independent replay | Not executed this run | NOT_EVALUABLE |

HO-STR-0014 and 0001: BLOCKED/UNVERIFIABLE, not FALSIFIED. 0004 stays REJECTED, 0009 WATCHLIST; 0002/0008/0015 research candidates, 0003 REJECTED; 0016/0017 WATCHLIST. Other IDs unchanged, including REJECTED 0005/0006/0011/0012. READY count 0.

Next: write deterministic cross-module integration tests with snapshots at arrival-1/arrival/arrival+1, explicit versioned fees, 250ms, stale and partial/no-depth cases; run CI. Then lawful raw 300s data, SHA256, full L2, official settlement, OOS net ledger and independent replay. No real orders, wallets, signatures, transfers, paid procurement or geoblock bypass.