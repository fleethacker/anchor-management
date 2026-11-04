# Fictional DDG CASREP samples

Ten formal naval-message text fixtures for a fictional DDG-51-style ship,
USS RESOLUTE (DDG 999), synthetic UIC N99999. All casualty scenarios, hull
assignment, contacts, EICs, APLs, NSNs, JCNs, requisitions and schedules are
invented. Technical publication names are also invented exercise references.
Equipment descriptions are generic across DDG-51 configurations.

The set contains 4 INITIAL CASREPs, 3 CASUPs, 2 CASCORs, and 1 CASCAN.
Lengths vary from brief notifications to a detailed steering casualty.
PLAD lists vary by engineering, material, navigation, steering, availability,
and freshwater support. They combine public organization names with invented
exercise activities and COMDESRON NINE NINE. They are illustrative, not a
validated current directory. All email contacts use example.invalid.

Formatting follows the published Navy training examples listed below:

- Standard precedence/DTG, FM, TO, INFO, BT and UNCLAS envelope.
- MSGID/CASREP/originator/serial// in every message, including follow-ons.
- POSIT and a REF to the original message on follow-ons.
- CASUALTY/INITIAL-NNNNN, UPDATE-XX-NNNNN, CORRECT-NNNNN or CANCEL-NNNNN,
  followed by equipment, EIC and CAT fields. CASUP, CASCOR and CASCAN are
  filename/index labels; the CASUALTY set contains the report subtype.
- ESTIMATE and ASSIST on initial/update messages; AMPN immediately follows
  TECHNICAL assistance, correction and cancellation sets as appropriate.
- PARTSID contains APL and JCN. Matching 1PARTS and 1STRIP data lines carry
  the same DL and quantity. Updates use CHANGE/1PARTS and CHANGE/1STRIP.
  Whiskey document serials begin W. TECHPUB follows PARTSID.
- Correction AMPN includes supply delay, manhours, hours since last similar
  failure, use pattern and final material status.
- ASCII, uppercase, LF line endings and lines no longer than 69 characters.
- Fictional-data marking is inside RMKS, not above the message envelope.

The public Navy training examples use a legacy NWP format. These files follow
that documented structure and have been checked for internal consistency.
No target application parser was supplied or found in this project, so
acceptance by a specific strict parser has not been verified. No claim is
made that this legacy public format is the current operational release format.

| File | Type | Case | Category | Scenario |
| --- | --- | --- | --- | --- |
| 01_CASREP_26001_chilled-water.txt | CASREP / INITIAL | 26001 | C2 | No 2 chilled water plant degraded (354 words) |
| 02_CASUP_26001_chilled-water.txt | CASUP / UPDATE | 26001 | C2 | No 2 chilled water plant material delay and tech assist request (503 words) |
| 03_CASCOR_26001_chilled-water.txt | CASCOR / CORRECT | 26001 | C2 | No 2 chilled water plant restored (322 words) |
| 04_CASREP_26002_navigation.txt | CASREP / INITIAL | 26002 | C3 | No 1 inertial navigation system intermittent output (184 words) |
| 05_CASUP_26002_navigation.txt | CASUP / UPDATE | 26002 | C3 | No 1 inertial navigation system on site tech assist required (318 words) |
| 06_CASCOR_26002_navigation.txt | CASCOR / CORRECT | 26002 | C3 | No 1 inertial navigation system restored after tech assist (178 words) |
| 07_CASREP_26003_steering.txt | CASREP / INITIAL | 26003 | C4 | Steering control system unavailable tech assist and material required (687 words) |
| 08_CASUP_26003_steering.txt | CASUP / UPDATE | 26003 | C4 | Steering control tech assist findings and material status (463 words) |
| 09_CASCAN_26003_steering.txt | CASCAN / CANCEL | 26003 | C4 | Steering control casrep cancelled on entry into scheduled availability (224 words) |
| 10_CASREP_26004_freshwater.txt | CASREP / INITIAL | 26004 | C2 | No 1 reverse osmosis unit reduced output (138 words) |

Related messages retain the original casualty number, discovery time, equipment
asset, and JCN. References identify earlier messages actually included in the set.
The authorization cited by message 09 is a fictional scenario fact, not an
additional sample message.

Useful sample cases:

- 01-03: two Whiskey requirements, a delivery delay, added tech assist, local
  material issue, and correction while one requisition remains open for separate
  supply disposition.
- 04-06: tech assist without Whiskey requirements, distance support followed by
  an on-site visit, then verified restoration.
- 07-09: long C4 steering casualty, multiple parts, received-versus-installed
  distinction, and cancellation after acceptance into scheduled availability.
  Cancellation does not represent restoration or requisition cancellation.
- 10: brief C2 freshwater casualty, an onboard spare, and no outside assistance.

The combined text file contains the same ten raw messages, separated by blank
lines and their BT/NNNN terminators. It contains no decorative sample markers.
Use the individual files when a parser expects one message per input.
The ZIP contains this index and the ten individual messages.

Public Navy source documents consulted for format and equipment context:

- [Navy Gunner's Mate training manual, chapter 13, figures 13-5 through 13-9](https://www.maritime.org/doc/pdf/gunnersmate.pdf)
- [NAVEDTRA 12801, Radioman Communications, figure 6-5](https://www.navy-radio.com/manuals/rm-comm-12801-9408.pdf)
- [NAVEDTRA 14241, Storekeeper 2, figure 2-9](https://electronicsandbooks.com/edt/manual/Military/USA/Navy/Training/14241%20c20010523%20%5B294%5D.pdf)
- [NAVSEA Joint Fleet Maintenance Manual, Volume VI](https://www.navsea.navy.mil/Portals/103/Documents/SUBMEPP/JFMM/Volume_VI.pdf)
- [Navy photo of reverse-osmosis maintenance aboard DDG 58](https://www.navy.mil/Resources/Photo-Gallery/igphoto/2002429084/)
- [NAVSEA advanced reverse osmosis unit overview](https://www.navsea.navy.mil/Resources/Fact-Files/Energy-Initiatives/Advanced-Reverse-Osmosis-Unit/)

Source documents supply background only. None of the fictional message content
represents a real unit's condition or an official reporting action.
