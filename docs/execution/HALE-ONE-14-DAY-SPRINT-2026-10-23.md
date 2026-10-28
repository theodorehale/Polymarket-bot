# Hale One | 14-day execution sprint

Start: 2026-10-23. Owner: Hale One. Scope: read-only and paper only. This is a delivery gate, not a profitability claim.

## Priorities
- 70%: HO-STR-0001 BTC 5m real-feed paper validation, with HO-STR-0014 replay infrastructure.
- 20%: separate non-trading revenue track (paid API / Ziwei website); revenue only when actual receipts and costs reconcile.
- 10%: strategy discovery; deduplicate against permanent strategy registry, including rejected IDs.

## Acceptance gates
- **2026-10-25 / Gate 1**: Reproducible paper execution and ledger tests. Diagnose all 58 previously reported intermediate BBO mismatches; do not silently discard them. Validate source message ordering and snapshot/delta consistency; timestamp grouping is a hypothesis, not assumed atomicity. Record code commit, CI run, tests and evidence hash. Synthetic tests are labeled SYNTHETIC.
- **2026-10-30 / Gate 2**: At least one full, non-overlapping BTC 5-minute window with synchronized lawful public CEX and prediction-market feeds, source hashes, complete replay, signal timestamp, executable depth/VWAP, fees, simulated latency, fills/nonfills, position and settlement ledger. Missing data => NOT_EVALUABLE, not zero cost or positive PnL.
- **2026-11-06 / Gate 3**: Fixed-parameter out-of-sample windows and per-trade after-fee PnL with rejected signal reasons, partial fills, adverse scenarios and GO/NO-GO decision for further PAPER testing only. If no evidence of executable edge, pause HO-STR-0001 and choose next existing candidate by evidence quality.

## Daily report (evidence first)
1. GitHub PR, commit, CI status and reproducible tests since previous report.
2. Raw data duration/windows, SHA256, source timestamp coverage, snapshot/delta integrity.
3. Paper ledger: evaluated/not-evaluable signals, fills/nonfills, fees, net PnL, settlement reconciliation.
4. Blockers, owner, next concrete action, remaining gate criteria and deadline.
5. At most 1-2 new strategy leads with CLAIM vs VERIFIED and existing registry ID; no duplicate IDs.

## Constraints
No live trades, wallet access, signatures, transfers, paid services, bypass of region restrictions, or unauthorized financial action. No live-trading date is implied by these milestones. No READY FOR STRATEGY LIBRARY without independent reproducible evidence and concrete validation record. GO means permission to continue paper testing, not live execution. Preserve failed tests, rejection history and reopen triggers.
