# Research & Execution Security Policy

Status: mandatory architecture policy. This file records controls that are enforceable now and controls that become mandatory when their trigger appears.

## Permanent trust model

Everything outside the deterministic process is untrusted by default:
- venue APIs and WebSockets
- market titles/descriptions/resolution text
- SDK/vendor responses and errors
- AI/Jev output
- external URLs
- configuration imported from third parties

A hash proves integrity of captured bytes; it does **not** prove authenticity of the source.

## Enforced now

1. **Paper-only boundary** — research modules must not receive wallet, signer, private key, broker, or order-submission capabilities.
2. **Deterministic veto** — probabilistic/AI judgment cannot promote deterministic rejection.
3. **Relationship gate** — an unverified relationship cannot become a universal ACCEPT. Before live execution, relationship verification must move before edge calculation.
4. **Evidence integrity** — durable evidence requires explicit provenance, canonical hashing, engine input snapshots, and version metadata.
5. **Secret hygiene** — vendor errors must be sanitized before persistence. Raw/replay evidence must reject secret-like material.
6. **External input firewall** — external structures must be bounded by size/depth and schema-validated before research use.
7. **Unknown means fail closed** — unknown fees, malformed prices, stale/skewed books, insufficient depth, unknown execution accessibility, or unavailable required evidence must never be silently converted to PASS.

## Mandatory trigger controls

### Trigger: market text is sent to Jev/any LLM
Before enabling:
- treat all market text as UNTRUSTED_DATA, never instructions
- fixed system policy must dominate
- structured fields preferred over free-form concatenation
- no tools, secrets, wallet, filesystem write, shell, or order capability in the model context
- adversarial prompt-injection tests required

### Trigger: persistent live-data collection
Before enabling:
- deterministic observation IDs and deduplication
- repeated observations clustered by market/event
- independent control samples
- source lifecycle/status capture
- bounded retention and storage quotas
- evidence required for conclusions must not rely only on mutable external URLs

### Trigger: any credentialed market-data endpoint
Before enabling:
- credentials supplied only by secret store/environment
- never serialize credentials into evidence/logs
- least-privilege read-only credentials
- rotation/revocation procedure
- sanitizer tests using representative SDK errors

### Trigger: second venue / options / futures / ETF
Before enabling:
- versioned instrument master
- contract multiplier/tick/lot/expiry/settlement semantics
- native settlement currency and reporting currency separated
- timestamped FX evidence for conversions
- financing/borrow/margin provenance
- venue calendars and contemporaneous-tradability checks
- relationship-specific verifier

### Trigger: real-money execution
This is a new security boundary, not a mode flag.

Required architecture:
Research Engine -> signed/validated candidate -> independent Risk Engine -> Execution Gateway -> Venue.

Jev/LLM must never possess execution credentials.

Execution Gateway minimum controls:
- venue/instrument allowlist
- maximum order size/notional
- maximum position and daily loss
- price collars
- duplicate/idempotency protection
- rate limits
- stale-candidate expiry
- partial-fill reconciliation
- order/fill reconciliation against venue state
- kill switch
- audit log
- separate credentials from research process
- deny-by-default on missing/ambiguous state

### Trigger: CI/deployment used as a security gate
Before relying on CI:
- committed lockfile
- frozen-lockfile install
- dependency vulnerability/license review
- pin security-sensitive direct dependencies deliberately
- pin GitHub Actions to reviewed commit SHAs
- minimal GitHub permissions
- no production/execution secrets in pull-request jobs
- provenance/SBOM/signing considered for deployable artifacts

Current repository note: a committed `pnpm-lock.yaml` was not found during the 2026-09 security review, and the Phase 4 workflow uses `pnpm install --no-frozen-lockfile`. Therefore dependency reproducibility is **not yet a verified security property**.

## Research-integrity attacks

Treat the following as security failures, not merely statistical mistakes:
- duplicate observations counted as independent evidence
- look-ahead leakage
- prompt/threshold tuning on evaluation data
- survivorship/selection bias
- stale fee or contract semantics
- model/vendor regime changes mixed without versioning
- control samples selected after outcomes are known

No profitability, calibration, or model-value claim may be promoted without an out-of-sample protocol that addresses these risks.

## Reminder rule

Whenever development reaches any trigger above, stop advancement and satisfy the corresponding controls first. A green unit-test suite does not waive a trigger control.
