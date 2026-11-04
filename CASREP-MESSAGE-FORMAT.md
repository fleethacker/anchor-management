# CASREP sample message format

This document records the exact message conventions used for the ten fictional
DDG samples generated for this project. Use it as the fixture format when
generating more samples or implementing a parser for those samples.

The examples represent USS RESOLUTE (DDG 999), a fictional DDG-51-style ship,
with synthetic UIC `N99999`. Names, equipment identifiers, material identifiers,
technical publications, contact details, casualties, and schedules are test data.
The format follows the public Navy training examples cited below, which describe
a legacy NWP format. It is a project convention, not a claim about the current
official release format. A target application parser has not been supplied or
validated against these messages.

## Message envelope and text rules

```text
P 020900Z OCT 26
FM USS RESOLUTE
TO COMSECONDFLT
COMDESRON NINE NINE
COMNAVSURFLANT NORFOLK VA//N43//
MID ATLANTIC REGIONAL MAINTENANCE CENTER NORFOLK VA
INFO NAVSUP FLC NORFOLK VA
BT
UNCLAS
MSGID/CASREP/DDG 999 RESOLUTE/001//
POSIT/NORFOLK/020900ZOCT26//
<REPORT-SPECIFIC DATA SETS>
RMKS/EXERCISE EXERCISE EXERCISE. ALL DATA SYNTHETIC.
<NARRATIVE AND COORDINATION DETAILS>//
BT
NNNN
```

Angle-bracketed text in templates is a placeholder, not literal message content.

- Store messages as uppercase ASCII text with LF line endings and a final
  newline. Each physical line is at most 69 characters long.
- Start with precedence `P` and a header date-time group (DTG). Follow with `FM`,
  action recipients under `TO`, and information recipients under `INFO`.
  Continuation addresses occupy their own lines without repeating the label.
- The recipient lists are the variable PLAD distribution content. Address office
  codes may contain `//`, as in `COMNAVSURFLANT NORFOLK VA//N43//`.
- The first standalone `BT` ends the envelope. `UNCLAS` starts the message body,
  followed immediately by `MSGID` and then `POSIT`.
- Linear and free-text sets use `SET/FIELD/FIELD//`. A double slash terminates
  the set. A single slash can occur inside narrative text, such as `4790/2K`.
- A wrapped set continues on the following line without repeating its name.
  Line wrapping does not create a new field or set.
- `AMPN` amplifies the immediately preceding set. Limit each `AMPN` to ten
  physical lines, including its first line.
- `RMKS` is the final body set and can occupy at most 100 physical lines.
  Put the exercise marking, mission impact, repair actions, material status,
  support windows, and point of contact inside it. The samples do not introduce
  separate `SUBJ`, `DISCOV`, `EQUIP`, `JCN`, or `POC` sets.
- End the body with a standalone `BT`, then `NNNN` on the next line. When
  concatenating messages, separate complete messages with blank lines and add
  no decorative headings or sample markers.

## Report identity and field order

Every report uses `MSGID/CASREP/...//`. The subtype belongs in `CASUALTY`;
`CASUP`, `CASCOR`, and `CASCAN` are descriptive labels used in filenames and
indexes, not alternative `MSGID` values in these samples.

| Report label | First field of `CASUALTY` | Example |
| --- | --- | --- |
| CASREP / INITIAL | `INITIAL-YYNNN` | `INITIAL-26001` |
| CASUP / UPDATE | `UPDATE-XX-YYNNN` | `UPDATE-01-26001` |
| CASCOR / CORRECT | `CORRECT-YYNNN` | `CORRECT-26001` |
| CASCAN / CANCEL | `CANCEL-YYNNN` | `CANCEL-26003` |

`YYNNN` is the casualty's two-digit year and three-digit annual sequence.
`XX` is the two-digit update sequence for that casualty. The three-digit serial
in `MSGID` identifies an individual message and increments independently of
the casualty number. Follow-ons retain the original casualty number.

| Set, in order | INITIAL | UPDATE | CORRECT | CANCEL |
| --- | --- | --- | --- | --- |
| `MSGID` | Required | Required | Required | Required |
| `POSIT` | Required | Required | Required | Required |
| `REF` to the initial report | Omitted | Required | Required | Required |
| `CASUALTY` | Required | Required | Required | Required |
| `AMPN` immediately after `CASUALTY` | Discovery and short description | Discovery and short description | Repair statistics and final status | Cancellation reason and availability |
| `ESTIMATE` | Required | Required | Omitted | Omitted |
| `ASSIST` | Required | Required | Omitted | Omitted |
| `AMPN` after `ASSIST` | Required for `TECHNICAL` | Required for `TECHNICAL` | Omitted | Omitted |
| `PARTSID` | Required | Required | Omitted | Omitted |
| `TECHPUB` | Required | Required | Omitted | Omitted |
| `1PARTS`, then `AMPN`, then `1STRIP` | When off-ship parts are required | Use `CHANGE/1PARTS` and `CHANGE/1STRIP` when included | Omitted | Omitted |
| `RMKS` | Required | Required | Required | Required |

These requirements describe the generated fixture set. They do not attempt to
define every set or optional field allowed by Navy reporting publications.

### Common linear sets

```text
MSGID/CASREP/DDG 999 RESOLUTE/002//
POSIT/NORFOLK/040830ZOCT26//
REF/CASREP/RESOLUTE/020900ZOCT26//
CASUALTY/UPDATE-01-26001/NO 2 CHILLED WATER PLANT/EIC:Z901/CAT:2//
ESTIMATE/081800ZOCT26//
ASSIST/TECHNICAL/NORFOLK//
AMPN/REQUEST PUMP ALIGNMENT TECHNICIAN WITH TEST EQUIPMENT.//
PARTSID/APL:9990001/-/JCN:N99999-EA02-2601//
TECHPUB/EXERCISE TM-DDG999-CWP-001 REV A//
```

| Field | Convention used in the samples |
| --- | --- |
| Header DTG | `DDHHMMZ MMM YY`, for example `020900Z OCT 26` |
| Body DTG | `DDHHMMZMMMYY`, for example `020900ZOCT26`; `Z` means UTC |
| Originator | `DDG 999 RESOLUTE` in `MSGID`; `RESOLUTE` in `REF` |
| Message serial | Three digits, `001` through `010` in this set |
| `CASUALTY` fields | Report identifier, equipment description, `EIC:XXXX`, `CAT:N` |
| EIC | Four synthetic uppercase alphanumeric characters, such as `Z901` |
| Category | `2`, `3`, or `4`; retain the reported category on closure messages |
| `ESTIMATE` | A body DTG representing estimated repair completion |
| `ASSIST` | `NONE`, `TECHNICAL/DISTANCE`, or `TECHNICAL/NORFOLK` |
| `PARTSID` fields | `APL:<NUMBER>`, `-` for the unused component field, `JCN:<VALUE>` |
| APL | Seven synthetic digits, such as `9990001` |
| JCN | Synthetic UIC, four-character work center, four-digit job sequence; `N99999-EA02-2601` |
| `TECHPUB` | An invented exercise manual name following `PARTSID` |

Discovery time is carried in the `AMPN` after `CASUALTY`. Equipment asset IDs
and detailed observations can be carried in `RMKS`; they do not change the
linear set structure. Follow-ons always reference the original report's DTG,
even when there have been intervening updates.

## Parts and Whiskey requisitions

The material section is columnar. Its set ends at the double slash on the last
data row. The header and each data row begin with a single slash.

```text
1PARTS
/DL NATIONAL STOCK NO. RQD COSAL ONBD CIRCUIT
/01 9G5330-00-999-9001 001 001 000 -
/02 9G3110-00-999-9002 001 001 000 -//
AMPN/REQUIRED MATERIAL NOT ON BOARD. ON BOARD STOCK WAS EXHAUSTED.//
1STRIP
/DL DOCUMENT ID QTY PRI RDD ACTIVITY REQN STATUS
/01 N99999-6275-W001 001 02 999 PFZ 020830ZOCT26
/02 N99999-6275-W002 001 02 999 PFZ 020835ZOCT26//
```

| Table | Columns |
| --- | --- |
| `1PARTS` | Data line (`DL`), stock identifier, quantity required (`RQD`), allowance quantity (`COSAL`), quantity on board (`ONBD`), circuit |
| `1STRIP` | Data line (`DL`), document ID, quantity, priority (`PRI`), required delivery code (`RDD`), activity, requisition status |

Keep matching data-line identifiers and quantities in the two tables. Quantities
are three digits. The stock identifier includes a two-character cognizance
prefix followed by a synthetic NSN. `-` represents an unused circuit field.
Whitespace separates columns; requisition status is the remainder of the row
and can contain spaces, such as `ON ORDER` or `RECEIVED 190600ZOCT26`.

`N99999-6275-W001` contains the synthetic six-character UIC, a four-digit
Julian date (`YDDD`), and a four-character document serial beginning with `W`.
Its compact representation is `N999996275W001`. A narrative tracking label
such as `W-26001-01` is a separate local reference, not the document ID.
The samples use `02`, `999`, and `PFZ` for the priority, delivery code, and
activity fields; these are fixture values, not inferred supply decisions.

Update messages prefix material table names with `CHANGE/`:

```text
CHANGE/1PARTS
/DL NATIONAL STOCK NO. RQD COSAL ONBD CIRCUIT
/01 7H5998-00-999-9003 001 001 001 -
/02 9G6620-00-999-9004 002 002 000 -//
AMPN/DL01 RECEIVED. DL02 REMAINS OUTSTANDING.//
CHANGE/1STRIP
/DL DOCUMENT ID QTY PRI RDD ACTIVITY REQN STATUS
/01 N99999-6290-W003 001 02 999 PFZ RECEIVED 190600ZOCT26
/02 N99999-6290-W004 002 02 999 PFZ ON ORDER//
```

For tech-assist-only or onboard-spare scenarios, omit both material tables.
Record that no off-ship material or Whiskey requirement exists in `RMKS`.
Receipt and installation are separate events. A CASCOR or CASCAN does not
automatically cancel an outstanding requisition.

## Correction and cancellation

A correction uses `CORRECT-YYNNN` and an immediately following `AMPN` with
the supply delay, manhours expended, operating hours since the last similar
failure, equipment-use pattern, and final parts status. Put the actual
restoration time and test outcome in `AMPN` or `RMKS`.

```text
CASUALTY/CORRECT-26001/NO 2 CHILLED WATER PLANT/EIC:Z901/CAT:2//
AMPN/72 HOURS DELAY DUE TO PARTS UNAVAILABILITY. 44 MANHOURS
EXPENDED. 1240 OPERATING HOURS SINCE LAST SIMILAR FAILURE; CONTINUOUS
USE. SEAL KIT RECEIVED 051030ZOCT26. BEARING OBTAINED BY LOCAL ISSUE
061000ZOCT26. W-26001-02 REMAINS IN TRANSIT. CASUALTY CORRECTED
071400ZOCT26.//
```

A cancellation uses `CANCEL-YYNNN` and an immediately following `AMPN`
explaining the reporting action. The steering example transfers repair into
an accepted scheduled availability. It does not assert restoration.

```text
CASUALTY/CANCEL-26003/STEERING CONTROL SYSTEM/EIC:Z903/CAT:4//
AMPN/REPAIR ACCEPTED INTO SCHEDULED MAINTENANCE AVAILABILITY AT
NORFOLK FROM 21OCT26 TO 15NOV26. WORK PACKAGE EX-DDG999-AV-26-041.
CANCEL PER EXERCISE TYPE COMMANDER DIRECTION 201600ZOCT26. SYSTEM
REMAINS UNAVAILABLE. CANCELLATION DOES NOT REPORT RESTORATION.//
```

Both types retain the common envelope, `MSGID`, `POSIT`, and initial-report
`REF`, followed by their `CASUALTY`, `AMPN`, and final `RMKS` sets.

## Parser handling and validation

1. Isolate the message body between the standalone `BT` lines before splitting
   on `//`; address office codes in the envelope can also contain `//`.
2. Read `UNCLAS` as the classification line, then read data sets through their
   end markers. Join continuation lines with whitespace for linear and
   free-text fields. Preserve columnar table rows until their fields are read.
3. Recognize `CHANGE/1PARTS` and `CHANGE/1STRIP` as material table sets.
   A wrapped narrative mentioning `1PARTS` does not begin a new set.
4. Obtain the report subtype and casualty identity from `CASUALTY`, not from
   a filename, `MSGID` serial, or descriptive narrative.
5. Link follow-ons by originator and casualty number, and check their `REF`
   against the initial report's DTG. Keep the original equipment identity and
   JCN when a closure message omits those fields.
6. Validate field counts, identifier shapes, category, DTG calendar values,
   chronological consistency, material data-line linkage, and physical line
   limits. Keep reporting closure separate from equipment restoration and
   requisition disposition.

The generated samples were checked for envelope and terminator structure,
allowed set names, field counts, DTGs, follow-on references, matching parts
quantities, uppercase ASCII, and line limits. Those checks establish fixture
consistency; they are not certification by an external Navy message validator.

## Public format references

- [Navy Gunner's Mate training manual, chapter 13, figures 13-5 through 13-9](https://www.maritime.org/doc/pdf/gunnersmate.pdf): initial, update, correction, and cancellation message examples.
- [NAVEDTRA 12801, Radioman Communications, figure 6-5](https://www.navy-radio.com/manuals/rm-comm-12801-9408.pdf): correction message structure and repair statistics.
- [NAVEDTRA 14241, Storekeeper 2, figure 2-9](https://electronicsandbooks.com/edt/manual/Military/USA/Navy/Training/14241%20c20010523%20%5B294%5D.pdf): parts identification and columnar material sets.
- [NAVSEA Joint Fleet Maintenance Manual, Volume VI](https://www.navsea.navy.mil/Portals/103/Documents/SUBMEPP/JFMM/Volume_VI.pdf): reporting, maintenance, and requisition relationships.
