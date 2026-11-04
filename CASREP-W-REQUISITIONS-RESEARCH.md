# CASREP, W (Whiskey) Requisition, and PLAD Research

## Scope and authority

This note summarizes publicly available Navy material for the local prototype. It is not a release checklist, routing authority, supply instruction, or substitute for current command, TYCOM, Navy message, maintenance, and supply direction. Confirm the currently applicable NTRP 1-03.1, 3-M/maintenance procedure, supply policy, approved message addressees, and local business rules before acting on a real casualty or requisition.

The principal public source used here is NAVSEA's *Joint Fleet Maintenance Manual* (JFMM), Volume VI, Revision D Change 4 (24 September 2024). Public copies can lag controlling instructions.

## Major findings

1. A CASREP communicates operational degradation and the need for assistance; it is not the maintenance or supply transaction itself. The public JFMM says it is used when a material casualty cannot be corrected within 48 hours and reduces the unit's ability to perform an assigned mission or task.
2. The CASREP and its 4790/2K are linked but distinct. The JFMM identifies the 4790/2K as the principal maintenance record and requires an associated active 4790/2K for an active CASREP. It explicitly says a CASREP does not replace the 4790/2K or a requisition.
3. Keep the reporting record current as the material picture changes. Receipt or status changes for parts, assistance updates, a replacement 2K, schedule changes, and ETR changes are among the events that require a CASREP update. The public guide lists update intervals of 72 hours for C4, 10 days for C3, and 30 days for C2, with an update required at least 24 hours before an ETR change.
4. A correction report does not automatically close the supply demand. The public JFMM specifically notes that a CASCOR with a part requested via a Whiskey number does **not** cancel the requisition. In other words, reporting closure and material status must remain independently tracked.
5. “W/Whiskey requisition” is a locally managed supply-tracking concept in the public examples, not a format this prototype should treat as Navy-wide or authoritative. A JFMM CNIF process example directs users to check a locally managed “W Requisition/MILSTRIP Tracking Spreadsheet” for the next DD1348 document number, generate the MILSTRIP and DD1348, perform funding checks, record accounting information, and capture the requisition/cost in the maintenance workflow. Command-specific systems, document-number rules, and authorization still govern.
6. PLAD means **Plain Language Address Directory**. It is useful for reusable lists of message addresses, but a saved PLAD list does not establish that it is currently authorized for any specific report. Recipient requirements and message handling must be validated at release time.

## Practical process map

1. Identify and troubleshoot the casualty; determine mission impact and the proper CASREP category.
2. Create or update the required maintenance record (including the relevant 4790/2K) and associate it with the CASREP.
3. If material support is needed, follow the command's supply process to create the official demand/requisition and capture its local W/Whiskey tracking reference where applicable.
4. Track the material independently: linked CASREP, equipment, JCN/2K reference, NSN/part number, quantity, status, expected delivery, and responsible owner.
5. Issue required CASREP updates as material status, assistance, repair estimates, or the casualty condition changes.
6. When capability is restored, complete the appropriate reporting action and maintenance documentation. Do not assume that reporting closure cancels an outstanding demand.

## How this prototype applies the findings

The **Logistics** view is intentionally a local W-requisition tracker. It links a planning record to a CASREP and asset and keeps the JCN/4790/2K reference, NSN/part number, quantity, delivery estimate, owner, and material status visible. It does **not** create, fund, submit, or cancel an official requisition.

The **PLAD Manager** stores editable local templates of plain-language addresses. Selecting a template on a CASREP draft copies the template's address list into that draft's recipient field, preserving the copied text for review. The prototype does not validate addresses, determine addressees, apply an AIG, or transmit a message.

## Public references

- [NAVSEA JFMM, Volume VI, Revision D Change 4 (PDF)](https://www.navsea.navy.mil/Portals/103/Documents/SUBMEPP/JFMM/Volume_VI.pdf) — CASREP purpose, maintenance-record relationship, required updates, CASCOR/Whiskey-number note, and the public W-requisition/MILSTRIP process example.
- [NAVSEA searchable JFMM, Revision D Change 1 (PDF)](https://www.navsea.navy.mil/Portals/103/Documents/SUBMEPP/JFMM/Searchable_JFMM_RevD_Chg1.pdf) — public reference containing PLAD terminology and plain-language-address examples. This older public copy is terminology support, not controlling direction.
- [Navy: Naval Supply turns up heat on critical weapon system orders](https://www.navy.mil/Press-Office/News-Stories/display-news/Article/2239984/naval-supply-turns-up-heat-on-critical-weapon-system-orders/) — context on the need to accurately record high-priority supply-order status; it is background, not a procedural authority.
