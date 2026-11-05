# CASREP analysis playbook

Use this reference for a full analysis, a department refresh, or a question that depends on equipment history. Its purpose is to turn all available reporting evidence into a navigable picture of what has happened, what remains unresolved, and what is worth investigating next.

The hierarchy is **Combat Systems → Engineering → Deck → Supply** at the first level. These are four sibling departments in that display order, not four sequential processing stages. Review every department, then work within its systems, equipment, parts, and source cases.

## Contents

1. Scope and completion
2. All-record acquisition and review ledger
3. Case, message, asset, and part identity
4. Department ownership and mapping gaps
5. Evidence extraction and equipment lifecycle
6. Metric definitions and limits
7. Comparisons and correlations
8. Findings and recommendations
9. Page population and drilldowns
10. Batching and cross-batch reduction
11. Refresh, staleness, and contradictions
12. Worked decisions and review checklist

## 1. Scope and completion

Start by stating the authorized data source, command or commands, fleet/training profile, retrieval time, and any known source limitations. “All CASREPs” means all authorized available CASREPs in that declared source, not an inferred Navy-wide or lifetime collection.

Include open, in-review, released, transmitted, corrected, cancelled, and other closed reporting cases when supplied. Read historical messages and observations for those cases. Displaying active cases on a chart does not justify omitting closed cases from the equipment history or recurrence review.

Keep three distinct scopes:

| Scope | Meaning |
| --- | --- |
| Corpus scope | The authorized available cases and related records acquired for review |
| Comparison scope | The command, profile, date window, evidence basis, and population used for a particular metric |
| Focus scope | The department, system, equipment, or part currently selected in the interface |

Build the corpus before narrowing the page. A selected date window can limit a trend, but an earlier casualty on the same verified asset can still be relevant to recurrence. Explain the difference instead of quietly changing the numerator or claiming the filter erased history.

A complete review requires both an inventory pass and substantive evidence review. Loading 1,000 rows proves that 1,000 rows were available; it does not prove their canonical text, revisions, and linked maintenance evidence were read. Report acquisition coverage and narrative-review coverage separately when they differ.

For a local export, completeness can mean that every supplied row was acquired and accounted for; it cannot establish the upstream source's total without external completeness evidence. For a paginated source, it requires reconciliation of all authorized pages and the source's totals. Preserve this boundary in the coverage statement and snapshot options. Record current canonical review, historical structured review, and historical canonical review separately; unavailable historical text remains unavailable even when its case identity is accounted for.

Stop short of a completeness claim if a page failed, totals cannot be reconciled, a batch is missing, source text was not available, or current revisions changed during review. Present the useful completed portion with the exact limitation.

## 2. All-record acquisition and review ledger

Enumerate every available page. Prefer stable identifiers and a consistent snapshot where the source supports them. Reconcile returned counts against source totals. A UI that shows 20 rows, a queue that shows six items, or an overview that shows eight priorities is a presentation limit, not the underlying corpus.

Acquire the related records needed to interpret cases: equipment assets, available message/revision history, explicit degradation observations, work orders, requisitions, and applicable configuration or dependency records. Do not assume such records exist merely because the analysis would benefit from them.

Record an inventory ledger with these concepts, using the current application's names where available:

| Ledger item | What it establishes |
| --- | --- |
| Source and retrieval time | Where the material came from and when it was acquired |
| Pages requested, completed, failed | Whether a paginated read finished |
| Source-reported total and loaded rows | Whether acquisition reconciles |
| Unique case identities | The casualty population before display filtering |
| Duplicate rows and conflicting duplicates | Which inputs were reconciled or require review |
| Rows without stable IDs | Evidence that cannot be safely joined or cited as a stable case |
| Current revisions/digests | Which message versions the result describes |
| Canonical text available/read | Whether the actual message was reviewed |
| Historical versions available/read | Whether earlier conditions and changes were reviewed |
| Assets linked/unlinked | Whether physical-asset recurrence is supportable |
| Linked work/material records | Whether maintenance and supply context was available |
| Department mappings explicit/provisional/unmapped | Whether ownership is verified |
| Batches complete/partial | Whether a multi-pass review covers the corpus |

Do not discard malformed or unmapped rows merely to produce a clean chart. Keep their identity, reason, and source location in the quality ledger. Quarantine contradictory duplicates from definitive calculations if a current authoritative version cannot be established.

A record skipped for a visible filter is different from a record excluded for invalid identity, outside authorization, or unavailable content. Explain those categories separately.

## 3. Case, message, asset, and part identity

### Casualty and message lineage

A CASREP case represents a reported casualty condition. Its INITIAL, UPDATE, CORRECT, and CANCEL messages are a lineage. Generic edits, retransmissions, review comments, approvals, and message retries are not additional casualties or equipment failure events.

Use the source case ID as the primary case identity. Preserve message type and revision separately. Where imported reports lack a reliable casualty lineage, identify the ambiguity and seek a verified mapping before claiming separate events or collapsing reports together.

When the same case appears more than once, identical duplicates can be counted once. A verified newer revision may supersede older current-state fields while the older message remains historical evidence. Conflicting rows with the same identity and no trustworthy revision ordering must remain a disclosed conflict; do not choose the row that makes a pattern strongest.

If a current record's revision is lower than one of its preserved authorized versions, flag an unresolved lineage discrepancy. A revision number alone does not identify which current condition or canonical copy is authoritative. Retain the conflicting evidence and request reconciliation; do not select, edit, or reconstruct a winner to make the history consistent.

### Physical equipment

Use a stable asset ID together with command and profile. A system name, equipment name, tag fragment, or similar narrative is not a safe physical-asset join by itself. Two ships can each have “Pump No. 2”; training and fleet records can reuse an identifier.

For equipment with no linked cases, use the registered asset population only when its applicability is known. A no-history asset can be shown as a comparator, but reporting coverage, installation dates, removals, and exposure may still be unknown.

When the registry and a case disagree about command, profile, identity, or system, surface the discrepancy. Do not migrate ownership or rewrite case identity as a side effect of analysis.

### Parts and installations

Prefer exact part number, supported revision/configuration, and available installation/removal evidence. A part name alone can conceal several incompatible items. A shared part number across equipment does not prove the same installed component or failure mechanism.

Distinguish a part that was requested, suspected, inspected, removed, replaced, tested, or confirmed failed. Several of these statuses can occur in one case; they must not become several independent failures. If one case contains several verified failed parts, show the individual findings while retaining one contributing case in each case-based aggregate.

Current source records may expose only one structured part number and part finding. Do not silently claim a complete multicomponent inventory from that representation. Read additional component evidence in the narrative and disclose whether it was structured, inferred, or still awaiting verification.

## 4. Department ownership and mapping gaps

The top-level display always contains these four entries in order:

1. Combat Systems
2. Engineering
3. Deck
4. Supply

Use the command's verified ownership registry or explicit case/asset department when available. Validate recognized department identifiers. If explicit sources conflict, retain the conflict for review rather than allowing a fallback name to overrule an explicit owner.

A command-approved exact system-to-department map may fill a missing owner. If the application supplies conservative default aliases, identify them as provisional ownership assumptions requiring command verification. They are organizational grouping aids, not engineering findings.

Avoid broad keyword classification. “Cooling” in a radar narrative does not make the casualty Engineering-owned; a radar-specific cooling component may remain in the combat-system configuration. A supply delay on an engineering pump does not make the pump a Supply system. A connected weapon or external sensor is not automatically an AEGIS core component.

The application's original demonstration fixture, when this skill was designed, had no authoritative department field and no recorded Deck or Supply systems. That is an example limitation, not a rule for later input. Explicit department fields in the supplied dataset take precedence over that example and over fallback aliases, including genuine Deck or Supply cases. Recorded ownership guides grouping but is not independent verification of command policy. If the actual supplied dataset has no mapped cases for a department, keep its card with an honest empty state. Do not relabel navigation, steering, training networks, or miscellaneous records solely to fill it.

Show unmapped and ambiguous cases in a quality area outside the four department hierarchy. Inspect the unassigned counts and case-by-case reasons alongside `mappingRequiresReview`; no single flag establishes complete ownership quality. Include these cases in corpus coverage. Because typed findings require a known department, put an unresolved case's concern in the summary, limitations, and linked quality evidence until ownership is established; never assign an owner merely to pass validation.

Within a department, preserve the recorded system name and scope. System identities should distinguish command and profile, especially when the same label is reused. Cross-command comparisons must name the populations explicitly rather than accidentally merging them into one physical system.

## 5. Evidence extraction and equipment lifecycle

Read the current canonical message, the structured fields, and available historical versions together. The message can contain context that a structured field omits; a structured field can be stale or inconsistent. Preserve that contradiction as evidence rather than silently treating either representation as universally authoritative.

In the current record model, useful source fields include `id`, `number`, `profile`, `command`, `assetId`, `system`, `equipment`, `equipmentModel`, `partNumber`, `partName`, `failureMode`, `failureStatus`, `failureEvidence`, `partFailureStatus`, `partFailureEvidence`, `rootCauseStatus`, `rootCause`, `description`, `impact`, `actions`, `mitigation`, `parts`, `assistance`, `versions`, `degradationEvents`, `awaitingPartsSince`, `restoredAt`, and canonical `traffic`. Use the fields actually supplied; do not substitute similarly named cause fields or infer a timestamp from narrative order. Linked work/material records have their own identities and statuses.

An asset-level work order or requisition can appear in the evidence for several linked cases. Deduplicate it by its source identity when discussing work or material totals. Its repeated appearance is shared asset context, not additional work, another casualty, or proof that it belonged to an earlier repair. Attribute it to a particular case or dated intervention only when its explicit relationship and timing support that attribution; otherwise state that case/date attribution is unavailable.

For each case or physical asset, build an evidence record around the available lifecycle:

| Evidence group | Review questions |
| --- | --- |
| Identity/configuration | Which physical asset, model, serial, revision, installed part, and configuration applied at the event time? |
| Initial observation | What was observed, when, in what operating mode, and under which measured conditions? |
| Degradation/failure chronology | Which observations were distinct events, continuing symptoms, or follow-on reporting? |
| Confirmation | What inspection, test, or other evidence supports equipment failure, part failure, or a cause finding? |
| Impact/mitigation | What function was reported limited, what remained, and which workaround was actually in use? |
| Troubleshooting | Which hypotheses were tested, what were the results, and what remained untested? |
| Maintenance | Which work was completed, planned, deferred, repeated, or reopened? |
| Material support | Which requisitions, shortages, deliveries, substitutions, or delays constrained recovery? |
| Restoration/test | What restoration time and operational test evidence were recorded, and what limitations remained? |
| Later recurrence | Did a distinct casualty follow a stated repair, and what changed between them? |
| Missing/contradictory evidence | What prevents a reliable comparison or conclusion? |

Preserve incident time, discovery time, report time, approval/release time, submission deadline evidence, requisition milestones, and restoration time separately. An UPDATE timestamp is not an event occurrence timestamp. Reporting closure does not by itself prove repair completion or equipment health.

Keep planned actions separate from completed actions and confirmed test outcomes. Phrases such as “will inspect,” “awaiting test,” and “suspected” must not become evidence of a completed successful intervention.

When asking what to investigate next, consider the complete available history for the equipment. Do not answer solely from the latest casualty count. Connect prior symptoms, previous repairs, repeated part findings, test results, changed configurations, and material constraints.

## 6. Metric definitions and limits

Use the application's deterministic calculations as the numerical source. Review their scope and evidence basis before interpreting them. A polished narrative cannot repair an invalid denominator.

| Measure | Definition or required interpretation |
| --- | --- |
| Distinct CASREP cases | Unique reconciled casualty case IDs in the disclosed scope |
| Active cases | Cases whose current reporting status is active; this is a reporting workload measure |
| Confirmed equipment-failure cases | Distinct cases with recorded equipment confirmation and nonblank supporting evidence |
| Confirmed part-failure cases | Distinct cases with part identity, part-specific confirmation, and supporting evidence |
| Registered assets | Applicable equipment identities supplied by the registry, including no-history items |
| Repeated assets | Verified physical assets linked to more than one distinct casualty case |
| No-history assets | Registered assets with no linked cases in the available corpus; not proven healthy |
| CAT 2/3/4 distribution | Current reported category distribution for the stated case population; specify active or all-history basis |
| Degradation observations | Separately identified explicit observations; do not infer them from every edit |
| Follow-on messages | Distinct preserved follow-on messages/revisions for an existing case |
| Confirmed-failure report share | Confirmed equipment-failure cases divided by distinct cases in the same scope |
| Part recurrence | Distinct supporting cases for an identified part within the disclosed system/configuration scope |
| Repair/restoration interval | Elapsed time between valid, defined milestones; not operating-time failure rate |

For every displayed percentage, disclose numerator, denominator, scope, time window, and unavailable coverage. A 3/3 confirmed-failure report share means all three linked cases have confirmed equipment findings; it does not mean the equipment has a 100% chance of failing.

An operating-time occurrence rate requires verified operating hours, cycles, or another valid exposure measure and a defined at-risk population. MTBF, first-failure hazard, fleet downtime, failure probability, and reliability estimates need appropriate data and methodology. Do not derive them from raw report counts.

When the denominator is zero, unavailable, incompatible, or incomplete, show unavailable rather than a synthetic 0%. A zero current case count is different from no loaded data, no registered assets, no mapped owner, or no confirmed evidence.

Do not sum overlapping signals as extra incidents. A confirmed equipment failure, failed part, degradation observation, UPDATE, and work order can all describe the same casualty. Department, system, equipment, and part totals are different groupings of source evidence, not additive independent populations.

## 7. Comparisons and correlations

Start with the comparison that answers the command's question, then add the evidence needed to discriminate between explanations. Prefer a few meaningful comparisons over a large menu of speculative charts.

| Comparison | Decision value | Main qualification |
| --- | --- | --- |
| Department workload | Where active reporting or confirmed findings are concentrated | Departments differ in inventory and exposure |
| Systems within a department | Which systems merit deeper inspection | Raw counts do not adjust for system size or usage |
| Confirmed versus suspected findings | Whether a ranking depends on unconfirmed evidence | Keep evidence bases separate |
| Same asset across casualties | Whether one item repeatedly returns with problems | Verify physical identity and separate events |
| Asset versus model population | Whether recurrence may extend beyond one item | Require comparable model/configuration and nonfailed comparators |
| Parts across equipment | Whether a part number recurs in independent cases | Verify actual failed parts, revisions, and installation context |
| Equal time windows | Whether recorded volume changed | Match coverage and reporting practices |
| Pre/post maintenance | Whether recurrence followed an intervention | Consider exposure, scope of work, and restoration tests |
| Material delay versus repair work | Which recovery milestone is constrained | Use actual requisition and work milestones |
| Configuration/revision | Whether findings cluster in a configuration | Account for age, exposure, and concurrent changes |
| Operating conditions | Whether faults coincide with load, mode, or environment | Use measured, time-aligned conditions |
| Shared support | Whether otherwise different equipment has a verified common path | Require applicable engineering dependencies and observations |
| Cross-command | Whether a pattern appears in comparable commands | Keep fleet/training profiles and configurations explicit |
| Evidence completeness | Whether the apparent pattern may be a data artifact | Inspect missingness, duplicates, and narrative conflicts |

Treat correlation as a lead. Shared timing, a shared symptom, repeated replacement, common supply delay, or common system membership does not establish causation. Show plausible competing explanations such as usage, asset age, configuration, incomplete repair, reporting intensity, duplicate lineage, or a common measured support condition.

For equal-window trends, require data for both windows. A filter that hides the prior window must not convert missing prior history into zero. If the prior count is zero, show an absolute change and its context rather than an infinite percentage increase.

For repair effectiveness, identify the completed action, actual test, restoration evidence, and subsequent operating opportunity. A later report may be a continued unresolved condition rather than a new post-repair failure. Do not claim an intervention caused improvement simply because fewer reports followed it.

## 8. Findings and recommendations

Each material finding should answer these questions:

1. What was observed?
2. Which cases, revisions, assets, and parts support it?
3. What is the current scope and evidence basis?
4. Why does it merit attention?
5. What alternative explanations fit the same evidence?
6. Which missing fact or test would most usefully distinguish those explanations?
7. What would weaken or disconfirm the finding?

Use plain statuses such as investigate or monitor where the current output contract supports them. Do not invent calibrated risk probabilities or claim an official readiness rating. A transparent review priority can use active workload, recurrence, confirmed findings, unresolved impact, and missing evidence, but its ordering must be explainable.

Recommendations should identify a useful next investigation, verification, comparison, or question. Tie each recommendation to the evidence and uncertainty. Do not issue maintenance direction, approve a workaround, order parts, authorize restoration, accept mission risk, or close reporting from analytical output.

Separate four statement types:

- **Recorded fact:** directly supported by an identified source record.
- **Association:** a disclosed relationship or repeated observation in the supplied data.
- **Hypothesis:** an explanation proposed for review, with alternatives and a discriminating check.
- **Confirmed cause:** a source finding with explicit supporting evidence; it is not established by the agent's wording alone.

If the information is insufficient, state the smallest useful next step. “Inspect the part-specific test evidence in these three cases” is more useful than an unsupported diagnosis or a generic request to collect everything.

## 9. Page population and drilldowns

The first analysis screen contains only the four department entry points, a concise scope/coverage summary, and quality information. Keep unmapped or incomplete evidence visible without inventing a fifth organizational department.

### Department overview

For each department show concise workload and evidence metrics, a category or finding distribution, repeat-equipment context, and an honest empty state. Keep counts sourced to the complete reviewed population. A department with no mapped cases can still have mapping or registry gaps that need attention.

### Selected department

Show its systems in an understandable comparison. Rank by a stated metric and let the user change or inspect the evidence basis where supported. Include source counts, active versus historical context, and repeated equipment. A top-N visual must disclose the remaining systems and allow access to them.

### Selected system

Show the equipment and parts associated with that system. Use the same scope and metric definitions as the parent. Allow comparisons that distinguish repeated physical assets from model-wide patterns and suspected parts from confirmed failures.

### Selected equipment or part

Show the contributing cases, chronology, degradation observations, maintenance/test evidence, material context, and important gaps. Identify the asset/configuration and date coverage. A part view should explain whether it represents one installation, multiple physical parts, or a part-number grouping.

### Source evidence

Every substantive count, bar, timeline point, and finding should lead to contributing case IDs and inspectable messages. Preserve the current selection and filters while drilling down and returning. Do not silently switch command or profile when opening a source.

Use ranked bars, stacked category distributions, timelines, matched-period trends, and explicit relationship diagrams when their underlying data supports them. Do not add a fabricated ship silhouette, pretend physical layout, or unlabeled dependency network.

## 10. Batching and cross-batch reduction

When context limits require batches, make a manifest before analysis. Assign each eligible case/revision to a batch, record its identity and digest, and track whether the available canonical and historical text was reviewed. Maintain a list of missing or failed batches.

Batch by stable identity or another reproducible partition. Do not batch only the highest-ranked cases and call that a full review. For very long cases, keep lineage and related evidence together or explicitly link its continuation fragments.

Each batch should return source-linked evidence and unresolved questions, not free-floating summaries that lose case identity. Do not add batch totals without deduplication. Reconcile case identities and review state across batch boundaries.

After all batches complete, reduce across the full corpus:

- Reconcile duplicate and changed revisions.
- Join the same verified physical asset across batches.
- Join exact part/configuration groupings across equipment.
- Compare systems and departments using consistent definitions.
- Revisit apparent patterns using contradictory or no-event comparators.
- Confirm that every eligible case is accounted for as reviewed, excluded with reason, or unavailable.

If only some batches complete, the result is partial. Preserve completed findings with their scope and a clear remaining manifest. A source model that supports at most 250 cases per packet needs this process or another deliberate complete-data mechanism; it must not silently truncate or claim an all-history review.

## 11. Refresh, staleness, and contradictions

Bind the analysis to its source snapshot, scope, ownership mapping, and relevant linked records. Keep message revision/digest references where available. Recompute deterministic metrics when their source data changes.

If a case changes while a response is being prepared, validate it against the original snapshot before display. Mark old interpretation stale; do not attach it to the new message merely because the case ID stayed the same.

A new chat can use a newly disclosed snapshot. Retrying an old question against changed data is a new analysis, not a duplicate response to the old snapshot. Explain the changed scope or data when it materially affects the answer.

When current and historical messages disagree, describe the chronology and the unresolved contradiction. A later update can supersede current condition, but it does not erase earlier observations. A later asserted cause does not retroactively establish that every previously suspected part failed.

Keep analysis findings separate from canonical message text and workflow. Reviewing history must not save, submit, approve, sign, release, transmit, cancel, close, change recipient snapshots, or move reporting deadlines.

## 12. Worked decisions and review checklist

### Repeated pump with several UPDATEs

Suppose a verified pump has three distinct casualty cases and six preserved UPDATE messages. Show three cases, the six follow-ons separately, and the explicit observations as their own chronology. If all three cases have confirmed equipment findings, 3/3 is the confirmed-failure report share. It is not operating-time failure probability. Review the repair and test history before claiming a recurring mechanism.

### Requested component without confirmation

Suppose several cases request the same module, but only one contains a part-specific failed bench test. The requested-module pattern can support a material or investigation question. Only the evidenced case qualifies for a confirmed failed-part comparison. Do not turn the requisition list into a most-failed-parts ranking.

### Empty Deck department

If no Deck-owned case or system is supplied, keep Deck in the first-level hierarchy with an honest empty state. Show whether the registry or ownership coverage is also incomplete. Do not move steering or navigation into Deck solely to fill the card.

### Shared cooling symptom across systems

A cooling-related symptom in several systems is an association. To investigate a common support cause, seek applicable dependency records, time-aligned measured conditions, isolation tests, configuration, and alternatives. Do not draw a confirmed common-cause edge from matching words alone.

Before presenting a completed analysis, verify:

- All authorized available pages and eligible case identities are accounted for.
- Canonical and historical text coverage is stated honestly.
- Open and closed cases, follow-ons, and linked evidence were considered.
- The four departments appear in the requested order.
- Explicit ownership, provisional mapping, conflicts, and unknowns remain distinguishable.
- Physical-asset and part joins preserve command/profile/configuration scope.
- Numerical aggregates use deterministic definitions and inspectable source cases.
- Updates, observations, parts, and work records are not added as extra casualties.
- Percentages have valid disclosed denominators; missing exposure is not invented.
- Comparisons use compatible populations and time coverage.
- Findings distinguish facts, associations, hypotheses, and confirmed causes.
- Alternatives, disconfirming checks, missing evidence, and useful next steps are present.
- Output matches the current snapshot and versioned result contract.
- No canonical record or workflow state was changed by analysis.
