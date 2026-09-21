# Architecture Freeze v1 — Universal Opportunity Engine

Status: DRAFT-FROZEN FOR IMPLEMENTATION
Branch: phase-4.0.1-jev-paper-judge
Scope: paper research only; zero execution

## 1. Purpose

The project is no longer defined as a Polymarket arbitrage bot. The target architecture is a market-agnostic research system that discovers, validates, falsifies, records, and calibrates pricing relationships across markets.

Polymarket is the first proving ground. Future adapters may include futures, options, and ETFs.

The system must optimize for truth, replayability, and falsifiability rather than speed of feature delivery.

## 2. Non-negotiable principles

1. Paper-only until a later explicitly approved phase.
2. Deterministic impossibility cannot be overridden by AI.
3. Missing required evidence is not treated as positive evidence.
4. Vendor schemas never leak directly into core domain logic.
5. Raw evidence and normalized evidence are both retained when feasible.
6. Every decision is versioned and replayable.
7. Sampling rules are explicit and versioned.
8. Control samples are retained to detect selection bias.
9. A detected price discrepancy is not called arbitrage until execution, financing, settlement, and accessibility constraints are included.
10. Promotion to later phases requires evidence, not milestone pressure.

## 3. Opportunity taxonomy

### 3.1 Structural arbitrage

A deterministic pricing relationship is violated.

Examples:
- Polymarket complementary tokens: YES + NO ~= 1
- Futures cash-and-carry relationship
- Options put-call parity
- ETF market price versus replicating basket/NAV relationship

### 3.2 Relative-value dislocation

No strict identity is violated, but related instruments diverge beyond an evidence-based range.

Examples:
- Futures versus related ETF
- Cross-expiry futures
- Related option structures
- Cross-venue or cross-product basis

### 3.3 Semantic or information inconsistency

The opportunity depends on event meaning, contractual semantics, resolution rules, or logical dependencies.

Examples:
- Related prediction markets with inconsistent implied probabilities
- Resolution-rule ambiguity
- Conditional-probability contradictions

AI/Jev is most likely to add incremental value here.

## 4. Nine-layer architecture

### Layer 1 — Discovery Engine

Purpose: define what enters the observation universe.

Responsibilities:
- discover candidate markets/instruments
- apply explicit eligibility rules
- produce reproducible sampling sets
- support both target and control samples

Must not:
- make executable-edge decisions
- infer profitability

### Layer 2 — Normalization Layer

Purpose: convert vendor-specific data into internal domain objects.

Responsibilities:
- normalize identifiers
- normalize prices, sizes, timestamps, venues, currencies
- preserve malformed raw data for validation
- attach source and data-quality metadata

Rule:
Vendor schema != internal schema.

### Layer 3 — Relationship Graph

Purpose: represent why instruments are related.

Relationship types:
- complement
- parity
- replication
- hedge
- carry
- conversion
- conditional probability
- semantic dependency
- historical/statistical relationship

Each relationship must declare:
- inputs
- mathematical or semantic rule
- assumptions
- required data
- invalidation conditions
- model version

### Layer 4 — Deterministic Engine

Purpose: validate exact calculable constraints.

Responsibilities:
- price validity
- timestamp freshness/skew
- exact-share or exact-contract pairing
- depth and VWAP
- fees
- slippage
- gas / financing / borrow / other fixed costs
- contract multipliers
- settlement assumptions
- expected and worst-case economics
- hard rejection reasons

Rule:
A deterministic FAIL cannot be upgraded to ACCEPT by Jev or any statistical model.

### Layer 5 — Execution Simulator

Purpose: estimate whether an apparent relationship can survive real execution mechanics.

Responsibilities:
- multi-leg sequencing
- atomic versus non-atomic execution
- partial-fill risk
- latency
- adverse selection
- price movement between legs
- queue/priority assumptions where relevant
- edge half-life
- hedge completion
- capital/margin consumption

Output must distinguish:
- theoretical edge
- executable edge
- persistent executable edge

### Layer 6 — Probabilistic / AI Layer

Purpose: evaluate uncertainty not fully captured by deterministic math.

Jev may evaluate:
- semantic coherence
- contractual ambiguity
- data anomaly likelihood
- evidence sufficiency
- unusual market-state relationships
- whether a deterministic candidate deserves ACCEPT or REVIEW in paper mode

Jev must not:
- convert deterministic REJECT to ACCEPT
- silently fill missing required deterministic inputs
- be treated as proof of profitability
- be treated as calibrated until empirical calibration exists

Required statuses:
- ACCEPT
- REVIEW
- REJECT
- JEV_UNAVAILABLE

### Layer 7 — Opportunity Classifier

Classifies each observation as:
- STRUCTURAL
- RELATIVE_VALUE
- SEMANTIC
- NONE

Also records:
- candidate strength
- required assumptions
- accessibility
- persistence state
- confidence source

This is a research classification, not a trade order.

### Layer 8 — Evidence Store

Every important observation should retain enough evidence to reconstruct the decision.

Minimum conceptual bundle:
- raw evidence reference/snapshot
- normalized evidence
- relationship definition/version
- deterministic output
- execution simulation
- Jev judgment
- final paper classification
- errors
- timestamps
- model versions

### Layer 9 — Calibration & Learning

Purpose: determine whether each model actually adds information.

Questions:
- Does Jev REVIEW predict later failure better than deterministic PASS alone?
- Does a candidate survive 100ms, 500ms, 1s, 5s, 30s?
- Which rejection reasons are most predictive?
- Which relationship families produce persistent executable edge?
- How much of apparent edge disappears after costs?
- Does a new model improve out-of-sample results?

No model is retained merely because it sounds intelligent.

## 5. Universal observation schema

The exact TypeScript schema will be implemented separately, but the conceptual v1 contract is frozen as follows.

### Identity
- schemaVersion
- observationId
- observedAt
- venue
- marketType
- instrumentIds
- conditionId where applicable

### Data provenance
- dataSource
- feedType
- snapshotOrIncremental
- sourceTimestamp
- receivedTimestamp
- observationTimestamp
- dataDepth
- sourceVersion if known

### Discovery
- samplingVersion
- samplingGroup
- discoveryReason
- eligibilityChecks

### Relationship
- relationshipType
- relationshipVersion
- relatedInstrumentIds
- assumptions
- requiredInputs

### Deterministic
- engineVersion
- status
- rejectionReasons
- targetSize
- expectedGrossProfit
- worstCaseGrossProfit
- expectedNetProfit
- worstCaseNetProfit
- expectedNetEdgeBps
- worstCaseNetEdgeBps
- fees
- slippage
- financingCosts
- otherCosts
- freshness
- depthSummary

### Execution simulation
- executionModelVersion
- atomicity
- legCount
- estimatedLatency
- partialFillRisk
- hedgeCompletionStatus
- capitalRequired
- marginRequired
- accessibilityStatus

### Jev
- promptVersion
- acceptThreshold
- startedAt
- completedAt
- latencyMs
- probability
- status
- error
- vendor metadata only when actually supplied by SDK

### Classification
- opportunityClass
- finalPaperDecision
- reasons

### Follow-up / calibration
- recheck100ms
- recheck500ms
- recheck1s
- recheck5s
- recheck30s
- laterOutcome
- calibrationLabel

Not every market will populate every field. Requiredness is relationship-specific and must fail closed when a required deterministic field is missing.

## 6. Data quality model

Data quality must be explicit.

Possible states:
- VALID
- STALE
- SKEWED
- PARTIAL
- MALFORMED
- UNSUPPORTED
- SOURCE_UNAVAILABLE

Rules:
- malformed values are preserved and rejected, not silently filtered
- top-of-book data must not be treated as full-depth data
- unknown depth must not support a large-size executable claim
- source timestamps and local receipt timestamps must be distinguished
- source failure must be recorded rather than replaced with optimistic defaults

## 7. Accessibility layer

A theoretical opportunity and an executable opportunity are different.

For every opportunity, record whether the user/system can actually:
- access the venue
- trade the required instruments
- obtain required borrow
- post required margin
- perform creation/redemption
- settle/convert/redeem
- meet minimum size
- execute all required legs

Possible states:
- ACCESSIBLE
- RESTRICTED
- INSTITUTIONAL_ONLY
- UNKNOWN

Example: ETF creation/redemption may be a valid structural relationship while direct AP execution is unavailable to a normal retail account.

## 8. Replayability

A historical observation must be replayable against a later engine version whenever evidence is sufficient.

Replay requirements:
- immutable observation ID
- original timestamps
- original normalized input
- raw-source snapshot/reference where feasible
- relationship version
- fee/cost model version
- deterministic engine version
- prompt version
- sampling version

Goal:
Engine v2 can be run on Engine v1 observations without rewriting history.

## 9. Sampling design

Do not only record apparent opportunities.

Minimum sampling groups:
- CONTROL_RANDOM
- CONTROL_LIQUID
- DETERMINISTIC_CANDIDATE
- JEV_REVIEW
- JEV_ACCEPT

Purpose:
- estimate base rates
- detect selection bias
- compare opportunity persistence
- measure Jev incremental value

Sampling rules must be deterministic or explicitly randomized with a recorded seed/method when appropriate.

## 10. Edge persistence

A candidate is more useful if it persists long enough to be executable.

Define edge half-life research checks at:
- immediate
- 100 ms where technically available
- 500 ms
- 1 s
- 5 s
- 30 s

For slower markets, wider windows may be added.

Metrics:
- candidate survival rate
- net-edge decay
- time to first invalidation
- time to loss of worst-case profitability

## 11. Market adapters

### 11.1 Polymarket adapter
Relationship families:
- complementary token parity
- related-event semantic consistency

Additional risks:
- resolution semantics
- binary token structure
- CLOB depth
- fee model
- stale books
- leg mismatch

### 11.2 Futures adapter
Relationship families:
- spot-futures carry
- calendar spreads
- related contract basis

Additional inputs:
- financing rate
- dividends/carry
- contract multiplier
- margin
- expiry
- roll
- settlement
- borrow where relevant

### 11.3 Options adapter
Relationship families:
- put-call parity
- box structures
- vertical/calendar relationships
- synthetic underlying relationships
- volatility-surface consistency

Additional inputs:
- strike
- expiry
- exercise style
- multiplier
- rates
- dividends
- borrow
- early exercise / assignment
- Greeks
- volatility surface
- multi-leg complex-order mechanics

### 11.4 ETF adapter
Relationship families:
- ETF versus basket/NAV
- related ETF basis
- ETF versus futures/derivatives

Additional inputs:
- basket composition
- indicative NAV where available
- creation/redemption mechanics
- AP accessibility
- borrow
- financing
- tracking error
- market hours mismatch

## 12. What is reusable across markets

Reusable core:
- normalization
- timestamps/freshness
- data quality
- depth/VWAP
- fees
- slippage
- multi-leg representation
- worst-case economics
- evidence storage
- versioning
- replay
- calibration
- control sampling

Market-specific:
- mathematical relationship
- settlement rules
- financing model
- contract semantics
- accessibility constraints
- venue-specific execution mechanics

Do not force one formula across all markets.

## 13. Failure modes to guard against

### Research errors
- selection bias
- survivorship bias
- look-ahead bias
- data snooping
- overfitting thresholds
- tuning Jev threshold to the same sample used for evaluation
- changing prompts mid-sample without versioning
- treating repeated observations of one market as independent samples

### Data errors
- stale timestamps
- top-of-book mistaken for full depth
- missing levels
- malformed prices
- source clock mismatch
- cached data mistaken for fresh data
- venue outage
- duplicate observations

### Execution errors
- legging risk
- partial fills
- order rejection
- queue-position assumptions
- latency
- spread widening
- insufficient margin
- borrow failure
- settlement/conversion delay

### Modeling errors
- wrong fee schedule
- wrong contract multiplier
- wrong option exercise assumptions
- wrong dividend/rate assumptions
- wrong market relationship
- semantic equivalence that is not truly equivalent

### AI errors
- hallucinated relationships
- confidence without calibration
- vendor API failure
- prompt drift
- probability interpreted as objective truth
- model change by vendor without detection

## 14. Model governance

Every decision-producing component must have a version.

Minimum:
- schemaVersion
- samplingVersion
- relationshipVersion
- deterministicEngineVersion
- executionModelVersion
- feeModelVersion
- costModelVersion
- promptVersion

Threshold changes are model changes and must be recorded.

## 15. Promotion gates

### Gate A — Infrastructure correctness
Required:
- build pass
- full tests pass
- zero-execution architecture verified
- replay schema stable
- raw/normalized evidence path defined

### Gate B — Data integrity
Required:
- public data collection stable
- malformed/stale cases correctly rejected
- duplicate handling
- timestamp provenance verified
- sampling controls active

### Gate C — Polymarket research validity
Required:
- meaningful observation sample
- persistent-edge distribution measured
- false-positive modes catalogued
- deterministic and Jev outputs separately evaluated

No fixed observation count alone is sufficient.

### Gate D — Jev incremental-value test
Retain Jev only if it demonstrates measurable out-of-sample information value.

Possible evidence:
- REVIEW flags materially higher later invalidation rate
- semantic-risk flags identify issues not encoded in deterministic checks
- calibration is stable enough to be useful

If no incremental value is found, remove or narrow Jev's role.

### Gate E — Cross-market portability
Before any capital deployment:
- implement a second market adapter in paper mode
- prove the core observation/evidence/replay stack survives without redesign
- keep market-specific formulas isolated

### Gate F — Real-money discussion
Not automatic.

Requires a separate architecture and risk review covering:
- legal/account access
- broker/venue rules
- capital limits
- kill switches
- order controls
- monitoring
- reconciliation
- tax/accounting implications
- operational incident handling

## 16. Kill criteria

The project should stop or change direction if evidence shows:
- apparent edge consistently disappears after realistic costs
- opportunity half-life is materially shorter than attainable execution latency
- data quality cannot support executable conclusions
- market access prevents practical execution
- Jev adds no incremental information
- results disappear out of sample
- profitability depends on unrealistic fill assumptions
- required infrastructure would mean competing primarily on sub-millisecond latency against colocated professional firms

A negative result is a valid research result.

## 17. Six-to-twelve-month research roadmap

### Months 0-2 — Freeze and evidence foundation
- freeze universal observation v1
- implement source provenance
- implement sampling groups
- implement replayable evidence storage
- run small Polymarket public-data samples
- verify deterministic/Jev audit path

### Months 2-4 — Polymarket calibration
- expand observations
- measure edge persistence
- measure rejection reasons
- evaluate Jev incremental value
- test semantic relationship candidates
- keep zero execution

### Months 4-6 — Generalization test
- implement Relationship Graph v1
- add one non-Polymarket paper adapter
- preferred candidates: options or futures depending data availability
- verify core architecture works without invasive changes

### Months 6-9 — Cross-market research
- compare structural versus relative-value opportunities
- introduce market-specific financing/margin models
- improve execution simulation
- build out-of-sample evaluation

### Months 9-12 — Decision point
Possible outcomes:
1. persistent accessible edge exists -> design a separate controlled execution phase
2. opportunity exists but is institutionally inaccessible -> keep as research/analytics platform
3. edge exists only in slower semantic/relative-value cases -> specialize there
4. no robust edge -> stop trading objective or repurpose the engine as market analytics infrastructure

## 18. Current Phase 4.0.1 boundary

The current branch remains paper-only.

Current verified checkpoint before this architecture document:
- TypeScript build passed locally
- 248/248 tests passed locally
- isolated real TypeSafe/Jev API smoke test returned a valid probability
- no wallet, signer, private key, or order submission was used in the Jev smoke path

Those facts do not prove:
- Jev calibration
- Jev usefulness
- persistent arbitrage
- real fillability
- future profitability

## 19. Immediate implementation order after this freeze

Do not jump directly to a large live sampler.

Implement in this order:
1. Universal Observation v1 types
2. Version metadata
3. Data provenance/data-quality types
4. Sampling-group model
5. Evidence record/replay structure
6. Adapt current Polymarket observation into the universal schema
7. Add small deterministic discovery rules
8. Add small public-data end-to-end sample
9. Add edge-persistence rechecks
10. Only then expand sample size

Each step must preserve existing deterministic safety invariants.

## 20. Core research question

The system is successful only if it can answer, with evidence:

"When a pricing relationship appears abnormal, does it remain abnormal after realistic data quality, execution, cost, accessibility, and timing constraints, and can the system explain why?"

That question is broader and more durable than "did the bot find an arbitrage?"
