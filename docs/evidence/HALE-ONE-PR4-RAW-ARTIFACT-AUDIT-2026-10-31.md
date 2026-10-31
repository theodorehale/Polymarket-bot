# Hale One PR #4 — independent raw artifact integrity audit (2026-10-31)

**Scope:** Read-only, local inspection of the original GitHub Actions artifact for PR #4. This is an independent **file integrity and event-count audit**, NOT a trading performance or full-order-book reconstruction result.

## Evidence identity
- PR: https://github.com/theodorehale/Polymarket-bot/pull/4
- Source workflow run: https://github.com/theodorehale/Polymarket-bot/actions/runs/39519012676
- Artifact ID: `12310945580`, name `coinbase-polymarket-paired-public-evidence`, created 2026-10-21, GitHub artifact expiry shown as 2026-11-04 UTC.
- Independently downloaded ZIP: 140,827 bytes; SHA256 `943e077b91fe71d4270242e22a25c3f5ea0ca9134ca7e695ba32f157c288afd7` (matches artifact metadata digest).
- Independently extracted raw JSONL: 797,933 bytes; SHA256 `aa490791cf957a15d6d77c2fa4acd30fc434801c3b60e9fc89cf0fe1f6e499e3` (matches submitted capture summary).
- Raw gzip SHA256: `f5e1ea8225aa9b04c6ac32c0ac1d49810704e3560fcfcc451adedbf6d15051ba` (matches capture summary).

## Independent read-only parse of the original raw file
- Total raw JSONL records: **973**.
- Coinbase: **118** WebSocket messages: 97 tickers, 20 heartbeats, 1 subscriptions; first-to-last receive span **19,695 ms**, max inter-message gap **990 ms**.
- Polymarket: **855** WebSocket messages: 2 book snapshots, 853 price_change events; first-to-last receive span **19,534 ms**, max inter-message gap **972 ms**.
- Polymarket price_change events contain **1,706 token-level change entries**, split 853 per token; the 2 snapshots add one event per token. There was also one non-JSON protocol frame `PONG`, not a malformed market event.
- The Polymarket message source-to-local receive lag derived from the included timestamps ranges **41–145 ms**, median **45 ms**. This is an observed clock difference, **not a verified network latency measurement**, because clock synchronization was not independently established.
- No receive-time order reversal was detected within either stream.

## Gate verdict
- **Gate 1 (2026-10-25): NOT ACCEPTED**: no independently evidenced closure of all 58 BBO discrepancies or complete execution/ledger acceptance.
- **Gate 2 (2026-10-30): NOT ACCEPTED**: this artifact covers ~20 seconds, not a complete 300-second synchronized BTC market window. No independent complete depth reconstruction, official settlement reconciliation or after-fee Paper ledger.
- **Gate 3 (2026-11-06): NOT_EVALUABLE**: no fixed-parameter OOS net PnL established.
- **Status:** NO-GO for any live trading. This audit confirms a lawful public paired-feed access proof and raw file integrity, not an executable edge.

## Reproduction and limitations
The 2026-10-31 audit was run locally against the extracted ZIP using a Python JSONL parser; it counted event types and receive timestamps and calculated SHA256 of the exact raw bytes. The local audit script SHA256 is `56062fe5f0130c630ce2510b0f3bb1f422cc9c373230aef1d9b290f02126d06a`, result JSON SHA256 is `e50b75ffdd00aa64cead0c9ae2e2822fb749c5ed497d15c4d4c97b2254a9e417`. The script/results and downloaded ZIP were preserved as local conversation artifacts, not added to the repository. Raw file checksums can be reproduced with `sha256sum`; event counts require parsing the `raw` field as nested JSON, including Polymarket arrays and nested `price_changes`.

**Next:** obtain complete permitted 300-second dual-source data; reconstruct snapshots+deltas; resolve the 58 BBO discrepancies; run causal depth, market identity, fee, settlement and rejection-ledger tests. Do not infer fills from snapshots or from source-provider claims.
