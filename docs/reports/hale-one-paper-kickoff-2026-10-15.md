# Hale One Paper v0.1 — kickoff (2026-10-15)

Scope: HO-STR-0001 / HO-STR-0014. No live trading, API keys, wallet, orders, signatures, or funds.

The first isolated local simulator was executed on 2026-10-15. It requires an explicit JSONL data input, with timestamp, market ID, rules hash, bid/ask levels, reference probability, fee and resolution. With no real data, it returned NO_GO / NO_REAL_MARKET_DATA, 0 trades, null verified PnL. Five synthetic fixtures passed (signal, delay rejection, insufficient depth, crossed book, no-trade threshold). These tests prove rejection logic only, not strategy profitability.

Source artifact: hale_one_paper_v01.py generated in the session, not yet integrated with the repository's existing execution engine. Important limitations: simple historical single-leg sensitivity, no arrival-time future book, no authoritative settlement verification, no live paper performance, no reproducible real feed. It refuses any nonzero delay unless a future book is available. Do not treat the hypothetical fill as a real or executable fill.

Next acceptance gates: (1) legally accessible read-only L2 source and exact settlement mapping; (2) timestamp and raw hash manifest; (3) arrival-time book and depth walk with 50/100/200/500ms sensitivity, partial/no fills; (4) official fee version; (5) chronological OOS forward paper log and independent replay. No READY promotion until these are completed.
