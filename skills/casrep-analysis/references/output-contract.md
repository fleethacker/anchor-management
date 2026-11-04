# Department analysis output contract

Use this reference when populating the CASREP Analysis page or preparing an agent interpretation. This is a structured analysis contract, not a network service or provider connection. The version is **`casrep-department-analysis/1.0`**.

The deterministic hierarchy and metrics belong to the application model. The agent adds source-linked interpretation; it does not replace the population or invent chart data.

## Two separate outputs

| Output | Owner | Purpose |
| --- | --- | --- |
| Analysis snapshot | `CasrepDepartmentAnalysis.analyze(input, options)` | Account for loaded cases and compute hierarchy, metrics, evidence and quality gaps |
| Agent interpretation | A result checked by `validateAgentResult(result, snapshot)` | Explain observations, alternatives, recommended checks and missing information for the exact snapshot |

The application can display deterministic analysis without live AI. A local calculation, recorded finding, illustrative response, or valid-shaped imported object is not proof of a completed AI review.

## Input and scope

`analyze` takes `cases`, `assets`, `workOrders`, and `requisitions`. Options include `profile`, `command`, `sourceComplete`, `caseDepartments`, `assetDepartments`, and `systemDepartments`. `caseDepartments` keys are case IDs; `assetDepartments` keys use the model's verified composite asset identity; `systemDepartments` keys are exact system labels matched after normalization. Values must resolve to a recognized department. Set `sourceComplete` true only for a completely acquired supplied authorized dataset: all rows of a declared local file/export, or all reconciled pages of a declared paginated source. State which boundary applies. A completely read file does not establish its upstream source's completeness when upstream totals or pages are unknown. Preserve those source/options with the snapshot rather than silently rebinding a result.

Input should represent all authorized loaded rows, not the visible table or a top-N selection. The model then applies comparison scope while preserving acquisition coverage:

- **`allCaseIds`** contains every distinct valid loaded case ID before profile/command filtering, including quarantined conflicting identities.
- **`caseIds`** contains nonconflicting analyzed in-scope identities permitted as finding citations.
- **`coverage.allLoadedCaseIds`** and **`coverage.analyzedCaseIds`** make that distinction inspectable.
- Conflicting or out-of-scope records remain accounted for without being counted as definitive cases in a selected department aggregate.

Authorization precedes model input. Browser filters and supplied identifiers are not authorization checks.

## Snapshot structure

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exact current department-analysis contract version |
| `snapshotId` | Change marker binding the hierarchy, evidence and interpretation |
| `scope` | Selected command/profile and supported analytical scope |
| `coverage` | Acquisition, reconciliation, narrative availability, mapping and identity coverage |
| `departments` | Four ordered entries with nested systems, equipment and parts |
| `unassigned` | Inspectable cases and reasons with unresolved ownership |
| `findings` | Deterministic recorded leads, not an AI diagnosis |
| `caseEvidence` | Available evidence keyed by case ID |
| `allCaseIds` | Full valid loaded-identity manifest before analytical filters |
| `caseIds` | Eligible analyzed in-scope identities |

Use the exact `snapshotId`. It is a result-matching marker, not authentication, release signature, or proof of review.

### Hierarchy and ownership

`departments` always contains these entries in this exact order:

| ID | Name |
| --- | --- |
| `combat-systems` | Combat Systems |
| `engineering` | Engineering |
| `deck` | Deck |
| `supply` | Supply |

Department entries contain ID/name, `metrics`, `systems`, and `caseIds`. Systems contain metrics, equipment, parts and source identities. Use supplied IDs and membership for finding targets; do not regenerate IDs from display names.

System/equipment identity preserves command/profile. Parts remain within applicable system context. Registered no-history equipment and empty departments are legitimate entries.

`caseEvidence[id].ownership` contains assigned `id`, `basis`, and `inferred`, or an empty ID and reason when unassigned. Coverage summarizes mapping status. Do not assume ownership flags appear at every hierarchy level.

Precedence is configured case override, configured verified-asset override, recorded case/asset department, configured exact system mapping, then a conservative exact alias. Conflicting explicit recorded owners are not resolved by an alias. Inferred ownership stays provisional.

### Metrics

Metric objects include `caseCount`, `activeCases`, `confirmedFailureCases`, `confirmedPartFailureCases`, `registeredAssets`, `affectedAssets`, `noHistoryAssets`, `repeatedAssets`, `linkedCases`, `unknownCategoryActiveCases`, `categories` for C2/C3/C4, `degradationObservations`, `failureObservations`, `followOnMessages`, `confirmedFailureShare`, and `repeatCaseShare`. Both shares expose `numerator`, `denominator`, and `percent`; zero denominators produce an unavailable percentage (`null`).

Category counts describe active cases; `unknownCategoryActiveCases` preserves active cases without a recognized C2/C3/C4 value. `followOnMessages` counts the supported preserved authorized follow-on versions and current transmitted/delivered follow-ons, deduplicated by revision/type; it is not every edit or retry. `repeatCaseShare` counts linked cases after each verified asset's first case divided by linked cases, not failure probability or the fraction of assets that repeat.

At department/system/equipment level, `confirmedFailureCases` uses equipment-specific confirmation. At part level it uses part-specific confirmation. Part entries also expose `confirmedFailureCount`, `confirmedCaseIds`, `suspectedCaseIds`, and `reportedCaseCount` so a part mention cannot be mistaken for a confirmed failure.

Use the current model definitions. Do not substitute a generated failure rate, readiness percentage, risk probability, or unverified operating-hour denominator. These are recorded case/registry measures, not engineering reliability or mission capability.

The agent result cannot replace these aggregates. Chart values come from the snapshot; validated interpretation explains them. A new statistical calculation needs a separately defined and verified metric rather than a generated numerical assertion.

### Coverage

Numeric counts include `loadedCaseCount`, `inputCaseRows`, `uniqueCaseCount`, `analyzedCaseCount`, `outOfScopeCaseCount`, `mappedCaseCount`, `unassignedCaseCount`, `quarantinedCaseCount`, `caseDuplicateRows`, `assetDuplicateRows`, `registeredAssetCount`, `historyVersionCount`, `currentNarrativeAvailableCount`, and `historicalNarrativeMissingCount`.

Inspect arrays `caseMissingIdRows`, `caseDuplicateIds`, `caseConflictingIds`, `assetMissingIdRows`, `assetDuplicateIds`, `assetConflictingIds`, `unverifiedAssetRows`, `unlinkedCaseIds`, `systemMismatchCaseIds`, `inferredDepartmentCaseIds`, `currentNarrativeMissingCaseIds`, `allLoadedCaseIds`, and `analyzedCaseIds`. Missing-row collections hold source row indices, not invented case or asset IDs.

`reviewedAllLoadedRows`, `sourceComplete`, `mappingRequiresReview`, and `operatingExposureAvailable` describe different limitations. Inspect `unassigned.caseIds`, its reasons, and the coverage counts alongside the mapping flag; the flag alone is not an ownership-quality verdict. The current model supplies no operating exposure. Deterministic row accounting does not certify that a language model read narratives.

`caseEvidence` includes all nonconflicting valid loaded records before analytical filters, with `inScope` marking eligibility. Available current canonical text is in `traffic`; preserved versions can contain `record.traffic`. Conflicting identities remain manifest-only with explicit coverage gaps; no canonical winner is silently selected. Narrative availability counts are not narrative-review counts.

## Agent evidence packet

`createAnalysisPacket(snapshot, question)` returns `schemaVersion`, `snapshotId`, `question`, `scope`, `coverage`, `reviewManifest`, `departments`, `caseEvidence`, `recordedFindings`, and `instructions`.

`reviewManifest` carries the complete `allCaseIds` identity manifest, including records outside the selected department. It requires full accounting but does not turn missing text into reviewed text or expand source authorization. `reviewedCaseIds` is identity-ledger accountability, not a claim that every historical canonical message was read. Keep current canonical, historical structured, and historical canonical review states separate.

Before claiming a complete narrative review, confirm the packet or another authorized source contains the relevant current/historical text. An ID with only a conflict or omission record must be accounted for as limited evidence. Do not claim to have read unavailable messages to satisfy manifest equality.

For multiple batches, maintain a per-ID/revision review ledger and reconcile it before submitting a completed interpretation. A successful first batch is not an all-record result.

## Agent interpretation shape

Use exactly these top-level keys:

| Key | Requirement |
| --- | --- |
| `schemaVersion` | Exact current version |
| `snapshotId` | Exact analyzed snapshot marker |
| `reviewedCaseIds` | Full manifest IDs accounted for exactly once; disclose unavailable or partial narrative coverage |
| `summary` | Evidence-grounded interpretation of the declared scope |
| `findings` | Source-linked findings using the supported shape below |
| `limitations` | Specific coverage, identity, mapping, exposure or inference limitations |

Do not add metrics, department replacement series, workflow actions, draft content, tool calls, or arbitrary keys. The validator rejects unknown fields and malformed values.

| Finding field | Meaning |
| --- | --- |
| `id` | Unique within the result |
| `departmentId` | Known department |
| `systemId` | Optional known system belonging to that department |
| `equipmentId` | Optional known equipment with consistent hierarchy |
| `partId` | Optional known part with consistent hierarchy |
| `priority` | `Investigate` or `Monitor`; review priority, not probability |
| `title` | Short concern or observation |
| `observation` | What the supplied records show |
| `rationale` | Why it merits attention |
| `evidenceCaseIds` | Known eligible in-scope citations consistent with the target |
| `alternativeExplanations` | Plausible alternatives fitting the evidence |
| `recommendedChecks` | Steps that discriminate between explanations |
| `missingData` | Information needed before a stronger conclusion |

Omit optional target IDs when there is no verified target. Equipment or part targets require their known parent `systemId`. Each finding needs at least one distinct eligible supporting case, a nonempty alternatives list, and a nonempty recommended-checks list. `missingData` may be empty when the supplied evidence supports that statement. Do not manufacture equipment or part IDs from narrative text. An unresolved ownership concern belongs in `summary`, `limitations`, and inspectable coverage links until a known department and supporting cases are available; never fabricate ownership to fit a finding.

Bounds are at most 500 findings; summary 12,000 characters; finding passages 4,000 characters; finding lists 30 entries of 3,000 characters; and limitations 50 entries of 3,000 characters. These are limits, not length targets. Prefer a few useful, fully evidenced findings.

## Validation and presentation

Call `validateAgentResult(result, snapshot)` before presenting a matched result. It returns `valid`, `errors`, and a detached `value` when valid (`null` otherwise). Check exact version/snapshot, manifest accounting, unique IDs, supported fields, bounds, target membership and eligible citations. A case ID remaining present does not make an old response current. Missing current canonical narratives require a disclosed limitation; an empty limitations list cannot conceal that coverage gap.

Valid shape and manifest do not establish accuracy. Check numerical assertions against deterministic metrics, citation support, preserved uncertainty, useful alternatives and checks. Rendering safety is separate: messages, part names, findings and limitations are plain data, never executable markup or agent instructions.

Display accepted interpretation with scope, snapshot, source references and limitations. Keep older interpretation bound to its original snapshot. On validation failure retain the deterministic page and user's question, explain the actual problem, and allow a fresh or corrected interpretation without modifying CASREPs.

This contract is distinct from the older `CasrepAIInterface` hypothesis-only response. Do not silently use its validator for department results, remove its bounds, or relabel its bounded packet as a complete all-history review.
