# Architecture Audit v1 — Hardening Backlog

Baseline: `fda2ef6` (local evidence: build PASS, 30/30 test files, 263/263 tests)
Scope: research architecture; paper-only; no execution

## Severity rule

- **P0** — must be resolved before collecting a dataset that we intend to use as durable research evidence.
- **P1** — must be resolved before interpreting live public samples as executable/persistent opportunities.
- **P2** — must be resolved before adding a second market family (futures/options/ETF) or making cross-market comparisons.

The goal is not to maximize field count. It is to prevent false evidence from becoming permanent training/calibration data.

## P0 — Evidence integrity

### P0.1 Units and currency are implicit

Current generic fields such as `targetSize`, `expectedNetProfit`, `capitalRequired`, and `marginRequired` have no explicit unit/currency contract.

Risk:
- 10 can mean shares, contracts, token pairs, or basket units.
- profit can mean USD, USDC, EUR, or settlement units.
- cross-market aggregation becomes invalid while remaining type-correct.

Required design:
- explicit quantity unit
- explicit reporting/settlement currency
- money values represented with currency metadata
- market adapters must map native units deliberately

### P0.2 Provenance timestamps are not causally validated

Current schema records source/receive/observation timestamps but does not enforce coherent ordering or explicitly represent source-clock uncertainty.

Risk:
- impossible or mismatched snapshots can pass validation
- apparent freshness can be manufactured by local receipt time while source data is stale
- later latency analysis becomes unreliable

Required design:
- distinguish exchange/source event time, client receive time, decision time
- validate local monotonic ordering where applicable
- never assume source and local clocks are synchronized
- store clock-domain/uncertainty metadata when known

### P0.3 Data-depth claims are self-declared

`FULL_DEPTH` is currently caller-supplied metadata. The Polymarket adapter marks deterministic depth as known because the executable quote consumed book levels, but that does not independently prove the upstream feed is complete.

Risk:
- a partial feed can be treated as sufficient depth
- executable size can be overstated

Required design:
- provenance must distinguish source-asserted depth capability from observed levels
- adapter must not upgrade unknown/partial source capability to full depth
- executable claims requiring unseen depth must fail closed

### P0.4 Replay evidence is not yet content-verifiable

Current replay envelope supports content hash references but does not define hash algorithm, canonical byte representation, or verification behavior.

Risk:
- two logically equivalent JSON objects can hash differently
- a hash string can be recorded without being verified
- external references can disappear

Required design:
- versioned canonical serialization
- explicit hash algorithm
- content digest validation
- embedded evidence or durable content-addressed storage for evidence required to reproduce a decision
- engine-input snapshot sufficient to rerun deterministic logic

### P0.5 Relationship truth is represented as assumptions, not evidence

For Polymarket, the adapter currently states that tokens are a complementary binary pair. That is an assumption in the universal record, not a verified relationship artifact.

Risk:
- two tokens can be treated as complements without preserving the market/resolution evidence that proves it
- future parity/replication relationships can silently rely on wrong contract semantics

Required design:
- relationship evidence object
- verification status: VERIFIED / UNVERIFIED / INVALID / SOURCE_UNAVAILABLE
- source/reference for contract semantics
- deterministic PASS cannot become universal ACCEPT when a required relationship remains unverified

## P1 — Live-sample validity

### P1.1 Observation identity and deduplication

Need a deterministic observation identity strategy based on market/instruments, evidence snapshot identity, relationship version, and observation time bucket/event identity.

Without this, duplicate polling can be mistaken for independent evidence.

### P1.2 Sampling independence and base rates

Current sampling groups are labels only.

Need:
- sampling frame definition
- inclusion probability/method where relevant
- deterministic seed for randomized controls
- market-cluster/event-cluster identifiers
- distinguish repeated observations from independent market opportunities

### P1.3 Edge persistence must use new evidence, not reused snapshots

100ms/500ms/1s/5s/30s checks are only meaningful if each recheck has a distinct evidence identity and timestamp.

Need:
- parentObservationId
- recheck observation IDs
- fresh source/receive timestamps
- explicit invalidation cause

### P1.4 Cost model provenance

Fee/cost version strings are not enough.

Need to preserve:
- actual fee parameters used
- source/effective date when sourced externally
- financing/borrow/rate assumptions
- worst-case assumptions
- whether a cost is observed, configured, estimated, or unknown

### P1.5 Decision states mix evidence and workflow

`ACCEPT / REVIEW / REJECT / JEV_UNAVAILABLE` are useful workflow states but should not be confused with factual labels.

Need separate concepts:
- deterministic result
- AI judgment
- research workflow disposition
- later empirical outcome

This prevents calibration labels from being contaminated by the original decision.

### P1.6 Market lifecycle and settlement risk

A quote can look executable while the market is near close, paused, disputed, non-accepting, or subject to unusual settlement semantics.

Need explicit lifecycle snapshot:
- active/closed
- accepting orders if available
- end/expiry time
- settlement/resolution mechanism
- halt/suspension status where available

## P2 — Cross-market portability

### P2.1 Instrument master

Need stable instrument definitions:
- venue
- symbol/token ID
- asset class
- multiplier
- currency
- tick size
- lot size
- expiry
- strike/right/exercise style where applicable
- settlement type

Do not put all of these directly into every observation; reference a versioned instrument definition.

### P2.2 Multi-currency valuation

Cross-market opportunities require FX conversion with timestamped FX evidence. A USD profit and EUR profit cannot be added without a valuation basis.

### P2.3 Capital, margin, and financing model

Futures/options/ETF comparisons require capital efficiency as well as nominal edge.

Need:
- initial/maintenance margin assumptions
- collateral currency
- financing rate
- borrow availability/cost
- opportunity cost
- capital lock-up duration

### P2.4 Trading calendar and clock domains

Cross-market relationships can span venues with different:
- trading hours
- holidays
- auction periods
- time zones
- settlement cutoffs

A price relationship is invalid if one leg is not contemporaneously tradable.

### P2.5 Contract semantics

Options require exercise/assignment/dividend/borrow semantics.
Futures require expiry/roll/settlement semantics.
ETFs require basket/AP/creation-redemption semantics.

These belong in relationship-specific validators, not generic hard-coded assumptions.

## Statistical and AI governance findings

Before claiming model value:
- split calibration and evaluation samples
- prevent prompt/threshold tuning on evaluation data
- group observations by market/event to avoid pseudo-replication
- report base rates
- evaluate Jev against a deterministic-only baseline
- use out-of-sample scoring/calibration metrics
- record vendor/model identity only when actually exposed by the provider
- treat vendor model changes as a new model regime when detectable

Jev should be retained only if it adds measurable information beyond deterministic features and simple baselines.

## Architectural consequence

Do **not** start large live sampling on the current universal schema.

The safe sequence is:

1. harden P0 schema/evidence contracts
2. run build + full tests
3. add a very small public-data probe
4. inspect raw records manually
5. harden P1 based on actual source behavior
6. collect a bounded pilot dataset
7. only then define a calibration experiment
8. address P2 before the second market adapter

## Non-goals for the P0 hardening patch

Do not add:
- wallet
- signer
- order submission
- broker connectivity
- automated trading
- profitability claims
- futures/options/ETF network integrations

P0 is evidence integrity only.
