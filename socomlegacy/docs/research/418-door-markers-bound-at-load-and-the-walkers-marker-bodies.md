# 418 -- The door markers are bound at load, and the walker's marker bodies the decompilation omits (LATER 958)

- Date: 2026-11-12. Section 22 of the multi-title lane's one note on Fish Hook's hostages (research 404 as written on
  `agent/xs-cells` 41f1aa4fdb9f), less 22.9 and 22.12 (research 419), brought to `main` by the hub's split; the text
  is the lane's.
- Track: **simulation** (a reading; the binding itself is MEASURED, research 404 s30). No reader and no consumer is
  changed by this note.
- What it holds: the walker `FUN_00567900`'s marker dispatch, three of whose case bodies the decompiled text drops at
  an unrecovered jump table (table 0x65c990), read from the bytes; the binder `FUN_002a8140`, read twice, which writes
  each door marker's action id at load; and the type-1 request reconciled with research 334 section 14. **It
  contradicts research 334 section 14's conclusion** ("on the four EXTRACTION maps every marker id is 0xffff after the
  load, so none binds"): the markers ARE bound (measured on MP71: ids 1, 3, 4, 0, 2, 5, research 404 s30), so
  `FOLLOW_ACTION_BIND_PLACEHOLDER` settles as bound; research 334 carries a dated correction pointing here. What a
  following hostage DOES at a shut door is still a reading (s22.11, s22.13).
- Sources: the r0001 game ELF and its decompilation; the r0004 served ELF ("r4 0x<addr>"); the disc's AIMAPS through
  the repository's reader. The evidence tags [V1], [V4], [D] are research 404's.
- **Review on the hub: PASS WITH FINDINGS, high confidence** (2026-11-12, a reviewer on the hub who did not write it;
  three MEDIUM and seven LOW, each folded or recorded in the section at this note's end; the first MEDIUM was the
  hub's own split, which had pointed eight references at the wrong note). Every claim a fix would rest on holds at the
  source: the walker's table and its three bodies, the binder's store after the reset, the r0004 twins, and the
  conditional grant of the type-1 request. With this review the note's claims count as **readings**, at the level each
  states; the binding is measured.

**Where each section lives (the hub's split, 2026-11-12).** The four notes were written as ONE on the multi-title lane
(`agent/xs-cells` 41f1aa4fdb9f, documents only) and keep that note's section numbers, so a reference "s25.6" means the
same section whichever note cites it: sections 20 and 25 are research 417 (r0004's two online-only steps; LATER 957);
section 22 is research 418 (the door markers and the walker's marker bodies; LATER 958), except 22.9 and 22.12, which
are research 419 (what the decompiled text omits; LATER 956); every other section, 0 to 33, is research 404 (LATER
933's landing). A reference to a section that lives in another of the four is written "research <n> s<m>"; a range
such as "s13-s20" is left as it was written.

## Index

| s | subject | standing | level | build |
|---|---|---|---|---|
| 22 | `FUN_00567900`'s text omits three case bodies | CORRECTED IN s22.10, s22.11 (the binder read twice; the type-1 request reconciled: conditionally granted) | read twice | r0001 |
| 22.1 | the warning and the false return | STANDS | read twice | r0001 |
| 22.2 | the table | STANDS | read twice | r0001 |
| 22.3 | the record | STANDS | mixed: one reader | r0001 |
| 22.4 | the three bodies and the flag block | STANDS | read twice | r0001 |
| 22.5 | callees absent from the function's text | STANDS | read twice | r0001 |
| 22.6 | MP71: no marker on the stairs | STANDS | one reader | the disc |
| 22.7 | r0004 twins of the bodies | STANDS | one reader | r0004 |
| 22.8 | what on this branch cites `FUN_00567900` | STANDS | one reader | the port |
| 22.10 | the binder `FUN_002a8140` | CORRECTED IN research 404 s30 (the binding measured: ids 1, 3, 4, 0, 2, 5) | measured, n = 1 (the binding); read twice (the code) | both |
| 22.11 | the type-1 request reconciled | CORRECTED IN research 404 s30 (the binding measured; a follower at a shut door is still a reading) | mixed: inference | r0001; the port |
| 22.13 | after the lane closed: the rig's door slot (not done), the door's two changed words, and which doors a follower is forced through | STANDS | measured, n = 1 (the door's words); one reader (the use count); one unreviewed script on the port's graph (the forcing) | r0004; r0001; the disc; the port |

## 22. The decompilation's `FUN_00567900` omits three case bodies of its marker dispatch [machine code, r0001; reading, pending review]

**2026-11-12 -- CORRECTED IN s22.10, s22.11:** the binder read twice; the type-1 request reconciled: conditionally granted.

Date 2026-11-12. **Who found it.** One reader found it. A second reader re-read it from the bytes. redotcom-19
confirmed it on another machine, from the text and the table's words. The source is
`evidence/forge-stim/xs/cells/review8/`, scratch outside git: the controller's summary `walker-dropped-block.md`, and
the whole function's listing, `walker_567900_569530.dis.txt`.

**What this author checked.** Each fact below marked [V1] was checked by this author in the r0001 ELF's bytes
(`t22/d4.py`; `t22/r1.567900.bodies.dis.txt`) and against the decompilation.

**The citation form.** r0001 bytes are cited "r1 0x<addr>", in the ELF named at the head: `game/disc/socom2_game.elf`
under the desktop tree, 4,835,072 bytes, sha256 `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`. **No D:L exists for the ranges r1
0x567c60-0x568150 and r1 0x567ba8-0x567bc0**: the decompilation's text of the function (D:L429361-429959) has no line
for them.

**What was known before** (corrected 2026-11-12, the main controller's correction). An earlier draft of this section
said the omission had shown "in no reading made from the text". That was WRONG.
- **The order of the reads** (from the lane's hub): the walker's table was first read in research 200 s3.1, and next
  in research 334 s14.
- **Research 334 s14 (DF-10, 2026-11-08) is the first read of the type-1 handler, and the fuller read of the table.**
  Its author had
  already seen that "the decompilation lost the jump". It disassembled the retail ELF and recorded the eight-entry table
  at 0x65c990 with the same eight words. It also recorded:
  - the type-1 handler: the marker's action id looked up in the map's action list, the valve test, and the push of AI
    state 0xb, CAiSAction (vtable 0x669660), aimed by `FUN_005f0180`;
  - that `FUN_005f5cd0`'s gate ADMITS that push on a FOLLOW stack [9, 0x17], by the allowed-next masks
    (`AI_STACK_MASKS_READING`);
  - a second push before the table, for a marker of any type but 4 whose bound action's valve reads 1
    (D:L429523-429540). It is filed and not built;
  - MP71's six markers, all type 1 and id 0xffff, one at each DOOR record, and MP6's one type-0 marker;
  - types 4 and 7 as UNREAD.

  The port carries all this as `followActionDispatch` (`hostageFollow.ts:62-113`), under `FOLLOW_ACTION_CELL_READING`
  and `FOLLOW_ACTION_BIND_PLACEHOLDER`.
- **Research 200 s3.1**, the first read, names the table and its three targets, from the disassembly (`:402-406`).
- **The readers who found the table this time** (review8, and redotcom-19's confirmation) found it unaided, without
  sight of research 334 s14. Research 200 s3.1 and then research 334 s14 found it first.

**What this section ADDS to research 334 s14:**
1. **The scope of the omission, as a property of the decompilation.** The warning's text, "Could not recover jumptable
   at ... Too many branches", followed by a false `return`, marks the places where the text omits code. A work-list of
   its occurrences is with the project's main controller, not in this note.
2. **Types 4 and 7, read** (review8; s22.4).
3. **Type 1's REFUSED path** (from r1 0x5680e0), and its "state == 1" counterpart, as one reader's reading. Their
   reconciliation with research 334 s14's "the gate admits it" is **being reconciled**. This note draws no conclusion.
   **Reconciled 2026-11-12 (s22.11):** conditionally granted on a FOLLOW stack; the refused path and the "state == 1"
   block are the other branches.
4. **The flag block** (r1 0x567ba8-0x567bc0), and the callees absent from the text (s22.5).
5. **A lead for research 334 s14's placeholder.** `FOLLOW_ACTION_BIND_PLACEHOLDER` says its "settling read is a writer outside the
   idiom this read searched". One reader has found a candidate writer, `FUN_002a8140` (D:L149772 on), behind a SECOND
   unrecovered jump table:
   - the warning is at D:L150084, "Could not recover jumptable at 0x002a8b5c" [D, checked here];
   - the table at r1 0x3f1340 reads 0x002a8bf8, 0x002a8b88, 0x002a8b88, 0x002a8b88, 0x002a8b68, 0x002a8b88,
     0x002a8bf8, 0x002a8b88 [V1, checked here];
   - its case bodies, r1 0x2a8b68-0x2a8c20, are absent from the text.

   By that reader's reading, it binds a marker of types 1, 2, 3, 5 or 7 to an action object by name, or else to the
   nearest one within 25 units of height. **One reader; a second read is pending.** Nothing more is drawn from it here.
   **Later, 2026-11-12: read twice, blind, and the readers agree (s22.10); it contradicts research 334 s14's conclusion.**

### 22.1 The warning, and the false return [V1; D]

- **D:L429547** reads "Could not recover jumptable at 0x00567c54. Too many branches", and D:L429548 reads "Treating
  indirect jump as call".
- **D:L429549-429550** then call through the table, and **D:L429551** is a `return`.
- **In the bytes there is no return.** r1 0x567c54 is `jr v0` (0x00400008).
- **For types 0, 2, 3, 5 and 6 the `return` is false.** Their table entry is r1 0x5682c0, which is the code the text
  continues with at D:L429554: r1 0x5682cc `jal 0x54f6e0`, `FUN_0054f6e0`(..., 1, 1, 1).
- **A type of 8 or more** branches there before the table (r1 0x567c34 `sltiu at,v0,8`; r1 0x567c38 `beq
  at,zero,0x5682c0`).

### 22.2 The table [V1]

- **The index** is the type, bits 7-11 of the u16 at record+6: r1 0x567c28 `lhu v0,6(v0)`, r1 0x567c2c `dsll32
  v0,v0,20`, r1 0x567c30 `dsrl32 v0,v0,27`.
- **The table's address** is formed at r1 0x567c40 `lui v1,0x66` and r1 0x567c48 `addiu v1,v1,-13936`, which gives r1
  0x65c990.
- **Its eight words** at r1 0x65c990 are: 0x005682c0, 0x00567ee8, 0x005682c0, 0x005682c0, 0x00567ce8, 0x005682c0,
  0x005682c0, 0x00567c60.

| type | goes to |
|---|---|
| 1 | r1 0x567ee8 |
| 4 | r1 0x567ce8 |
| 7 | r1 0x567c60 |
| 0, 2, 3, 5, 6 | r1 0x5682c0, the default path |

### 22.3 The record

The record is the 40-byte marker record. The text fetches it with `FUN_0052d8b0` (D:L429545; r1 0x567c1c), which goes
on to `FUN_00530d10`. Read as the u32 at +4, its fields are:
- the id, bits 4-19;
- the state, bits 20-22;
- the type, bits 23-27. This author checked the type field by the shift in s22.2.

**The writers of the three state bits** are the second reader's, by the summary. This author checked only that each
function starts at the line cited:
- `FUN_002b5760` (D:L157529-157547), a listener registered by `FUN_002b4f40`, writes (object state) & 7;
- two clearers, `FUN_00517eb0` (D:L385760-385798) and `FUN_005180b0` (D:L385801-385822);
- the initial value is the file's (`FUN_0051b820`, D:L387883-387910).

No writer of the type field was found.

### 22.4 The three bodies, and the flag block (the summary's terms; the instructions named are [V1])

**2026-11-12 -- TWO ADDITIONS to the type-4 body by the hub's review (the last section):** the flag register starts at
1 (r1 0x567db4), so the flags stored are 0x9 or 0x11 (plus 0x80000), not 0x8 or 0x10; and the body's first exit to the
default path is r1 0x567ce8. Neither matters on MP71, which has no type-4 marker; a port of type 4 must not be built
from the text below without them.

- **Type 7, r1 0x567c60-0x567ce4.**
  - It tests bits 4-6 of the byte at record+6: r1 0x567c60 `lbu v0,6(fp)`, then r1 0x567c64-0x567c68.
  - If they are non-zero, it takes the default path (r1 0x567c6c `bne v0,zero,0x5682c0`).
  - If they are zero, it issues four zero commands through the controller's slot `+0x20`, on channels 1, 2, 0 and 3
    (the `jalr` at r1 0x567c84, 0x567c9c, 0x567cb4 and 0x567ccc). It then stores zero to `+0xc`, `+0x10`, `+0x8` and
    `+0x14`, and returns. There is no call, no timer and no replan [the summary's].
- **Type 4, r1 0x567ce8-0x567ee0.**
  - It makes link and height comparisons. Its calls are r1 0x567d10 `jal 0x52d810`, r1 0x567d28 and r1 0x567d68 `jal
    0x52d8b0`, r1 0x567db8 `jal 0x52cd30`, and r1 0x567de0 `jal 0x1b3620`.
  - It can fall to the default path (r1 0x567d00, 0x567d98, 0x567e00).
  - Otherwise it builds flags in s3: up 0x8 or down 0x10 (r1 0x567e20, r1 0x567e28), and 0x80000 from bit 7 of the
    controller's `+0x171` (r1 0x567e30-0x567e48; research 404 s15.2's added line).
  - It issues four zero commands, and stores the flags at `+0x448` (r1 0x567ec8) and values at `+0x440` and `+0x444`
    (r1 0x567ed0, 0x567ed8).
  - Finally it calls `FUN_0056cbf0`(this, 7) (r1 0x567ed4, with a1 = 7 at r1 0x567ebc). That is the entry to movement
    state 7.
- **Type 1, r1 0x567ee8-0x568150.**
  - Research 334 s14 reads it as far as the CAiSAction push, `FUN_005f5c00`(actor, 0xb, ...) at r1 0x567fb0. The
    object comes by the marker's id.
  - The tail begins at r1 0x567fb8 `beq v0,zero,0x5680e0`.
  - If the push is refused, it issues the same four zero commands from r1 0x5680e0, and returns.
  - If it is accepted, it aims the action (r1 0x567ff4 `jal 0x5f0180`), sets fields, and returns (r1 0x5680d8).
- **The flag block, r1 0x567ba8-0x567bc0.** It sets s7 = 1 when the sub-map ids (`andi 0x3f`) of the cells at s1 and
  s2 match (r1 0x567bb8 `beq v1,v0`), and 0 otherwise. Only the type-4 body reads it (r1 0x567d00 `bne s7,zero`).

### 22.5 Callees absent from the function's text [V1; D]

Three callees appear nowhere in D:L429361-429959; this author searched the text:
- `FUN_0052d810`, called at r1 0x567d10;
- `FUN_001b3620`, called at r1 0x567de0;
- `FUN_005f8330`, called at r1 0x567f34.

The other callees of the bodies do appear in the text, from other places: `FUN_0052d8b0`, `FUN_0052cd30`,
`FUN_002b4d80`, `FUN_005f5c00`, `FUN_005f0180` and `FUN_0056cbf0`.

**One more function is absent from the decompilation: the goal's name function, r1 0x5fdec0** (the head's state
names). It is slot `+0x18` of the type-9 goal's vtable r1 0x6699a0 (the word at r1 0x6699b8). Its jump table is at r1
0x662e70, and its strings are at r1 0x662e08-0x662e68 [V1, this author, t22 `r1.5fdec0.dis.txt`]. No function at r1
0x5fdec0 was found in the decompilation's text.

### 22.6 MP71

The dispatch is reached only at a route point whose cell has bit 7 set (an action cell), with more than one point left
(D:L429515; research 404 s10.5). The disc read of research 404 s21.5 finds MP71's six markers all type 1 and state 0, and none on the flight,
whose cells have bit 7 clear. **So none of the three bodies can act from a marker ON the stairs.**

### 22.7 r0004 twins

r0004 twins: pending the narrow table. **Filled 2026-11-12** (the narrow table, research 417 s20.8): the walker is relocations only
(1,804 words, 1,651 identical, 153 relocated):
- the dispatch is r4 0x56cf54-0x56cf98, relocations only (3);
- the type-7 body is r4 0x56cfa0-0x56d024, identical;
- the type-4 body is r4 0x56d028-0x56d220, relocations only (10);
- the type-1 body is r4 0x56d228-0x56d490, relocations only (7);
- the r4 table at r4 0x65c9f0 holds the r4 images of all eight entries.

So the three undecompiled bodies are unchanged in r0004. One shared change bears on type 1: the action's id is read at
`+0x40` in r0004, against `+0x3c` in r0001, in `FUN_002b4d80`, `FUN_005f0180` and `FUN_002b5760` (research 417 s20.8).

### 22.8 What on this branch cites `FUN_00567900`, and whether it lies in the affected ranges

The list comes from a grep of this branch, and each cited line was read. "Affected" means the dispatch on the marker
type: D:L429545-429551 and the bodies that have no D:L. "Elsewhere" means another part of the function.

| file:line | cites | affected? |
|---|---|---|
| `packages/match/src/hostageFollow.ts:61-73` (`FOLLOW_ACTION_CELL_READING`'s doc; the name is at :63) | the dispatch, the table, the type-1 body to r1 0x567fb4 | **affected**. It holds types 4 and 7 as unread. Whether its `'action'` outcome carries the type-1 tail's refusal stop (r1 0x5680e0) was not checked |
| `packages/match/src/hostageFollow.ts:104-113` (`followActionDispatch`) | the dispatch | **affected**. Types 4 and 7 return `'unread'` (`:110`) |
| `packages/match/src/hostageFollow.ts:528` | D:L429574-429592, arrival at a point's cell | elsewhere |
| `packages/match/src/hostageFollow.ts:537` | D:L429692-429719 | elsewhere |
| `packages/match/src/hostageFollow.ts:543` | D:L429595-429624, the look ahead | elsewhere |
| `packages/match/src/hostageFollow.ts:555` | D:L429631-429634 | elsewhere |
| `packages/match/src/hostageSteering.ts:3` | the function as a whole (research 334 s5) | not checked |
| `packages/match/src/hostageSteering.ts:25` | D:L429706-429719 | elsewhere |
| `packages/match/src/hostageSteering.ts:37` | D:L429876-429890 | elsewhere |
| `packages/match/src/hostageSteering.ts:60` | D:L429851-429874 | elsewhere |
| `packages/match/src/hostageAvoidance.ts:49` | D:L429626-429635 | elsewhere |
| `packages/central/test/hostageFollow.test.ts:476-479` | the dispatch (DF-10) | **affected**; it pins 4 and 7 as unread |
| `packages/match/test/extractionWalkway.test.ts:137`; `packages/viewer/e2e/bodyWalkway.ts:33`, `fishHookRound.spec.ts:43`, `sceneRoundHarness.ts:294` | D:L429574-429592 | elsewhere |
| research 200 s3.1 (`200-h5-ai-pathfinding.md:387`, `:402-406`) | the whole function (D:L429361-429950); the table and its three targets, from the disassembly | **affected** at `:402-406`; the rest is not checked |
| research 200 `:510` (U2) | the steering's gains | elsewhere |
| research 334 `:54` | D:L429556-429566, the link throttle | elsewhere (the default path) |
| research 334 `:62` | "Followers never activate doors", by the dispatch (research 200 s3.1) | **affected** |
| research 334 `:134` | D:L429551-429566 | **affected** at D:L429551, the false `return`; the rest lies elsewhere |
| research 334 `:150`, `:286`, `:371`, `:432`, `:453` | D:L429692-429719, 429595-429624, 429849, 429617-429635, 429626-429635 | elsewhere |
| research 334 `:280` | D:L429517-429540, the second push before the table | elsewhere (before the dispatch) |
| research 334 s14 (`:597-625`) and its table row `:639` | the dispatch, read from the bytes | **affected**; it is the reading this section extends |
| research 404 `:313`, `:457`, `:564` (research 404 s11.3), `:753`, `:850`, `:972`, `:1006`, research 404 s15.3 (the call r4 0x56cc40), research 404 s15.3a M3 | other lines, or the call itself | elsewhere |
| research 404 s10.5 (`:500`) and research 404 s11.5 (`:611`) | name the jump table as unread | **affected**; this section answers them in part |
| `docs/LATER.md:902` (row 933) and `docs/plans/2026-11-08-desert-glory-fish-hook.md:82` (DF-10) | the row's and the plan's text | not checked (this note does not touch LATER.md) |

Line numbers for research 404 are as of dacda9c1d, before this edit.

### 22.10 The binder `FUN_002a8140`, now read twice from the bytes [V1; D; V4 for the r4 lines] (2026-11-12)

**2026-11-12 -- CORRECTED IN research 404 s30:** the binding measured: ids 1, 3, 4, 0, 2, 5.

**Who read it.** Two readers, blind to each other, from the r0001 bytes: review8's reader (the lead in s22, point 5)
and review12 (`evidence/forge-stim/xs/cells/review12/`, `fun_002a8140.lst` and its scripts, scratch outside git).
**What this author checked** [V1, `t22/d4.py`]: the table's eight words; every instruction of r1 0x2a8b30-0x2a8c24
named below; D:L149776 and D:L150084 opened; the call sites D:L152160, D:L152161, D:L152191-152194 and D:L151881
opened; the r4 lines marked [V4]. Not checked: the bodies of `FUN_002a8f50`, `FUN_002b4b40`, `FUN_00530f40`,
`FUN_00351ef0` and `FUN_002b4e00`, and the expected ids below.

**The wording, as it stood and as it stands.**
- redotcom-19's line as written at the time (2026-11-12, before the second read): "one reader; contradicts 334 section
  14; settler: the memory read section 14 itself names".
- Now that the blind second read is in: "two readers, blind to each other, agreed; still a reading; settler: the
  memory read" -- the u32 at +4 of each of MP71's six marker records after the load. redotcom-19 has asked that it go
  FIRST in the rig's next MP71 slot.

**The dispatch.** The marker's type (bits 7-11 of the u16 at record+6: r1 0x2a8b30 `lhu v1,6(s1)`, r1 0x2a8b34-0x2a8b38)
is bounded by r1 0x2a8b3c `sltiu at,v1,8`; a type of 8 or more goes to r1 0x2a8bf8 (r1 0x2a8b40). The table is formed
at r1 0x2a8b48-0x2a8b50 as r1 0x003f1340, and r1 0x2a8b5c `jr v1` (0x00600008) jumps through it. Its eight words
[V1]:

| type | entry | what it does |
|---|---|---|
| 0, 6 | r1 0x002a8bf8 | nothing stored (s3 is still -1, r1 0x2a8b44) |
| 1, 2, 3, 5, 7 | r1 0x002a8b88 | the action-object binding: steps A and B below |
| 4 | r1 0x002a8b68 | `FUN_002a8f50` with a0 = the word at r1 0x437ce4 (another container) and f12 = 25.0 (r1 0x2a8b70 `lui v0,0x41c8`); by the readers, the nearest record of that container under 25.0 with a 15.0 height band, stored as 0x8000 \| its index (the 15.0 and the 0x8000 not checked here) |
| 8-31 | r1 0x002a8bf8 | nothing stored |

**Step A, by name** (r1 0x2a8b88-0x2a8bc4): only when the cell record s0 is non-null and bit 6 of its byte 0 is set
(r1 0x2a8b90 `lbu v1,0(s0)`, r1 0x2a8b94-0x2a8b98, r1 0x2a8b9c); then r1 0x2a8ba4 `jal 0x530f40` (`FUN_00530f40`,
D:L399102), r1 0x2a8bac `jal 0x351ef0` with a0 = its result + 4 (`FUN_00351ef0`, D:L250995), r1 0x2a8bb4 `jal
0x2b4e00` (`FUN_002b4e00`, D:L157188): an object found by name; if found, its id, r1 0x2a8bc4 `lhu s3,60(v0)`.
**Step B, nearest** (r1 0x2a8bc8-0x2a8bf4), when A gave none: r1 0x2a8be4 `jal 0x2b4b40` (`FUN_002b4b40`, D:L157074)
with f12 = 25.0 (r1 0x2a8bd4); by the readers, the nearest object in x-z within 25.0 in height, with no horizontal
limit; if found, r1 0x2a8bf4 `lhu s3,60(v0)`.

**The one store.** r1 0x2a8bfc skips it when s3 is still -1. Otherwise r1 0x2a8c04-0x2a8c20: the u32 at record+4
becomes (word & 0xfff0000f) | (id << 4), stored by r1 0x2a8c20 `sw v1,4(s1)` (0xae230004): **bits 4-19, the marker's
id, are replaced.** The decompilation lists that block as removed: D:L149776 reads "Removing unreachable block
(ram,0x002a8c04)", and D:L150084 is the second "Could not recover jumptable at 0x002a8b5c" [D, checked here].

**The object's id.** The u16 at object+0x3c in r0001, assigned at D:L157310 as the count of objects created so far
(research 334 s14's "load index"). In r0004 it is at +0x40 [V4, this author]: r4 0x2b6830 `lhu v1,64(v0)`, r4 0x2b71ec
`lhu a1,64(a1)`, and the writer r4 0x2b6bf0 `sh t0,64(v0)`. The binder's twin reads it at r4 0x2aa3b4 and r4 0x2aa3e4
(`lhu s3,64(v0)`), and stores at r4 0x2aa3f4-0x2aa410, ending r4 0x2aa410 `sw v1,4(s1)` (0xae230004).

**The load order** (`FUN_002ac410`, D:L152015 on): the AI maps and their reset at D:L152138; the actions at D:L152160
(`FUN_002b4f40`); the type-4 container at D:L152161 (`FUN_002a9260`); then the binding loop over every sub-map,
D:L152191-152194, calling `FUN_002a8140`. **So the binder runs after the reset that sets every id to 0xffff, and after
the actions have their ids.** A second caller, `FUN_002abd40` (D:L151881), re-runs the loop; the readers found no
reset on that path.

**The second reader's two flags, listed and not examined here:** a hazard -- no null test before the name lookup --
and the re-run path without a reset.

**So research 334 s14's conclusion is CONTRADICTED.** research 334 s14 and `FOLLOW_ACTION_BIND_PLACEHOLDER` say that no writer of
an action id into a marker was found and that every marker stays 0xffff, so none binds. Two readings of the bytes,
blind to each other, find the writer. **Why research 334 s14 could not see it:** the writer sits behind the second unrecovered jump
table (D:L150084), and its store is listed in the text as a removed "unreachable block" (D:L149776); research 334 s14 searched the
text for the `& 0xfff0000f | x << 4` idiom, which the text does not hold there. It is still a reading.

**MEASURED 2026-11-12 (the rig; research 404 s30): the six markers are bound, ids 1, 3, 4, 0, 2, 5, as predicted below.**
**The settling measurement, still owed** (as first written): one live read of MP71's six marker records after the load. Expected, by the
readers (not checked here): ids 1, 3, 4, 0, 2, 5, in the order #0 (238,45), (251,65), (223,83), (217,65), #1 (10,4),
(15,24), in place of 0xffff. For example #0 (223,83)'s u32 at +4 would read 0x00800044, where the file has 0x008ffff4
(`t23/routes.out.txt`). The recipe's line is research 404 s15.6, the addition of 2026-11-12.

### 22.11 The type-1 request, reconciled with research 334 s14 [D; V1 for the veto] (2026-11-12)

**2026-11-12 -- line (c) below is SUPERSEDED (the hub's review):** "0 means shut" is read by research 92 from
`FUN_002b4760` and was measured on one door (0 shut, 1 open, n = 1: s22.13). And the gate has three run-time bits, not
two, with a third argument that can skip two of its tests (the last section, finding 7).

**2026-11-12 -- CORRECTED IN research 404 s30:** the binding measured; a follower at a shut door is still a reading.

**Conditionally GRANTED on a FOLLOW stack.**
- The mask keeps bit 11 (0xb): `FUN_005f7470` (D:L506408-506593), as research 334 s14 found through
  `AI_STACK_MASKS_READING`.
- The FOLLOW goal's veto is slot `+0x1c` of its vtable r1 0x6699a0, the word at r1 0x6699bc = r1 0x555390, which is
  `jr ra` (0x03e00008) with `addiu v0,zero,1` (0x24020001) in its delay slot [V1, this author]: it always allows.
- Two run-time bits and one override remain (D:L506578-506581; the override sets `+0xc` to 0x100 when
  `FUN_0060e7a0`'s word has bit 0).
- The walker's push sets the action's flag 2, so the action skips its own approach and uses the object from where the
  actor stands. There is no timeout in stages 6-7. On completion FOLLOW gets event 3, and its state resets to INIT (0)
  (research 404 s24.1).
- The "state == 1" block (D:L429523-429540 = r1 0x5681b8-0x5682bc) is the other branch: it acts on the marker saved by
  a granted type-1 push (the bound action's valve reading 1, D:L429527), wanted state 0. Research 334 s14 filed it as
  "the second push".
- The refused path (r1 0x5680e0, s22.4) is the third.

**Three lines, carried exactly:**
- (a) the port's `followActionDispatch` and `markerAction` have no caller outside tests (`hostageFollow.ts:99-113`),
  so `FOLLOW_ACTION_CELL_READING` is today a tested reading that nothing runs;
- (b) the loop the code permits (the action completes at once when the door's animation cannot start, the walker
  meets the same marker again) is flagged as permitted by the code and observed by nobody;
- (c) "0 means shut" is not established by the code and stays [INF] wherever it appears.

**The numbers** (MP71; `t23/routes.out.txt`, the port's planner under node; the distances recomputed here from the
cell centres):
- The approach cells are the marker cells, all class 1: door_rg_1 at #0 (223,83), 45.49 units from the trace's stop;
  door_ft_2 at #0 (217,65), 193.38; door_ft_5 at #1 (10,4), 181.63. **None is at the stop.**
- None of the 30 port-planner routes from the three hostage starts passes #0 (223,83), as a node or as a walked cell
  (the nearest, 4.12 cells, on the route to (219,84)). #1 (10,4) is a node only on routes to tophost rows north of row
  4 ((10,3), (12,3)).

**The port at a type-1 marker** (verified on this branch):
- `followActionDispatch` (`hostageFollow.ts:108-113`) and `markerAction` (`:99-102`) have no caller outside tests
  (`packages/central/test/hostageFollow.test.ts`).
- The follower slows at the node before the marker and walks into the leaf: the route point's `action` flag
  (`hostagePath.ts:582`) makes the step `final` (`hostageFollow.ts:566`), and a final step requests no forward speed
  (`hostageSteering.ts:58`).
- What it lacks if the binder's reading holds: there is no state 0xb in `HostageStateId` (`hostageAi.ts:28`: 0x17, 9,
  0x11, 2), and no AI door use (the room's door use, `room.ts:6798`, is called only from a client's event,
  `room.ts:4394`).

**A departure by reading, for every map with door markers; NOT a candidate for LATER 933** (no marker is on the
stairs, research 404 s21.5, and no route passes one, above). It waits on the settling measurement.
**2026-11-12, later: the binding is measured (research 404 s30); what a follower does at a shut door is still a reading.**

### 22.13 After the lane closed: the rig's door slot, the door's two words, and which doors force a follower through a marker cell (2026-11-12) [measured, n = 1, relayed; one reader; one unreviewed script on the port's graph]

- **The rig's door slot ended NOT DONE** (r0004, MP71, reads only; the hub's record
  `agent-mail/evidence/v0420/fishhook-hostages/README.md`, "LATER 958's door slot", outside git): no following hostage
  was led across `door_rg_1`'s marker cell with the door shut, so what a follower does at a shut door is still not
  measured.
- **Measured there (n = 1):** `door_rg_1` is action id 4; its marker (sub-map 0, (223,83)) held 0x00800044 all slot.
  Opened by the leader's own pad, exactly two words changed: the u16 at [object+0x18]+4 went 0 to 1 (0 shut, 1 open:
  the valve's state, research 92) and the byte at object+0x42 went 0 to 1.
- **That byte is r0001's `+0x3e`, the action's use count (one reader on the hub; the four reads of the byte re-read in both ELFs by the hub's reviewer).** research 417 s20.8's
  row for the door action's tick reads `+0x42` in r0004 where r0001 reads `+0x3e`. In r0001 the use (`FUN_002b44e0`,
  D:L156798-156800) and the offer (`FUN_002b46f0`, D:L156879-156881) refuse an action whose bit 3 of `+0x3f` is set
  once that byte is non-zero, and the action task's tick (`FUN_005efa50`, slot +0x10 of CAiSAction's vtable, so it runs for any action and not only a door) records it at its use (D:L502660) and leaves its wait when the
  count exceeds the record (D:L502666). The store that increments it was not looked for.
- **A lead, not a row:** the open needed the action button HELD: a 150 ms press with the prompt up did nothing, twice;
  600 ms opened it. Research 92 reads the button as a press branch (`FUN_00592d50`, D:L452002-452022) and names no threshold. Inside that range D:L452013-452014 handle an action whose `+0x3f` bit 2 is set: the press does not call the use and sets bit 2 of `DAT_004365dc` instead, a deferred use (found by the hub's reviewer): a candidate for the hold, to be read before the rig's injection is blamed.
- **Which doors force a hostage through a marker cell ON ITS START-TO-EXTRACTION ROUTE: none** (one script on the PORT's route graph over the
  disc's cells, `socomlegacy/tools/hostage-door-forcing.ts` on `agent/xs-doors` 716d15dd5: not reviewed, not run on the
  hub; a property of the port's graph, not of the original's planner). On MP71 only `door_rg_1` (id 4, #0 (223,83))
  lies on a shortest route, and on all three hostages': costs 3014 / 2907 / 3060 with it, 3513 / 3612 / 3559 round it.
  The other five doors are on no shortest route; MP82's nine markers are crossed by none (by the script's own
  single-sub-map search: the port's planner fails the three start-to-extraction requests there. The lane's own probe -- a scratch script, not committed, relayed in its handoff note's addendum on `agent/xs` -- put the exit at the closed-list capacity, `hostagePath.ts:455`, which is the original's capacity as read; the planner has four other failure exits (`:436`, `:466`, `:481`, `:487`) and the hub has not re-run it); MP6, MP10, MP11, MP52 and
  MP53 have hostages and no type-1 marker. By the lane's own run (relayed; not run on the hub) its marker ids, named by the nearest door action, reproduce the rig's six measured pairs on MP71; nothing measured checks MP82's. An inference from that, not the script's result (it tests no leader positions, and a follower's route goes toward its leader from wherever it stands): a follower crosses `door_rg_1`'s cell only if the leader goes through the doorway.
- **A test-harness note, not a row (2026-11-15, wm-hostage task 1):** the room's order check (`orderPickTrusted`) refuses 'eye' an order whose camera eye was taken in the open (shotCone's camera look) with a wall behind the leader -- the head-to-eye line crosses it (box run b9a232cacd, MP71, the leader at the rig's ordering spot (2140, 785)); a page clips its camera short of the wall, so no player effect is shown, and the open-door test now sends the eye pulled in on the room's own `orderOrigin` line (5775747132).

## Review on the hub (2026-11-12)

A fresh reviewer on the hub, who did not write this note and saw none of the sessions behind it, re-read it at the
sources on the hub. No test or tool was run; the forcing script was read, not run. **Verdict: PASS WITH FINDINGS, high
confidence.**

**What it re-read, kinds apart.** *r0001 bytes:* the eight words of the table at r1 0x65c990 and how its address and
index are formed; the three case bodies and the flag block, instruction by instruction; the binder's table at r1
0x3f1340 and every instruction from r1 0x2a8b30 to 0x2a8c24, with the one store at r1 0x2a8c20 (mask 0xfff0000f, the
id shifted left by 4); the reads of `+0x3e`. *Decompilation:* the warning and the false `return` at D:L429547-429551;
the callees absent from the walker's text; the load order (the reset inside the call at D:L152138, its store at
D:L395962; the actions at D:L152160; the binding loop at D:L152191-152194); every line s22.10, s22.11 and s22.13 cite.
*r0004 bytes:* all of s22.7's ranges and counts (3 differing words in the dispatch, 0, 10 and 7 in the three bodies;
the table at r4 0x65c9f0 maps eight of eight); s22.10's six r0004 lines; the reads of `+0x42`. *The port's source:*
every `file:line` in s22.11 and s22.13, and s22.8's rows. *The rig's record:* the six marker words before any follow
(ids 1, 3, 4, 0, 2, 5) and the door slot, bullet for bullet. The dated correction in research 334 section 14 says what
this note supports and no more.

**Findings.**

- 1, MEDIUM, folded: eight references read "research 404 s14" where the lane wrote a bare "s14" meaning research 334
  section 14 (the marker read this note contradicts). The hub's split made the error when it qualified cross-note
  references; all eight now read "research 334 s14".
- 2, MEDIUM, folded: s22.13 gave the planner's exit on MP82 (the closed-list capacity) as a fact; neither the script
  nor the hub's record shows it. It is the lane's own unreviewed probe, relayed, and is now said so.
- 3, MEDIUM, folded: "none forced" holds for start-to-extraction routes on the port's graph, which is all the script
  tests; a follower's route goes toward its leader. The last sentence of that bullet is an inference and is now marked
  as one.
- 4, LOW, folded: that the script's marker ids reproduce the rig's six pairs is the lane's own run, relayed.
- 5, LOW, folded: a lead inside the lines research 92 cites for the button: D:L452013-452014, a deferred use for an
  action with `+0x3f` bit 2 set.
- 6, LOW, folded as a banner: s22.11 line (c) ("0 means shut is not established") was stale against research 92 and
  the rig.
- 7, LOW, recorded: s22.11's "two run-time bits and one override (D:L506578-506581)" cites only the override. The
  run-time tests are in the gate `FUN_005f5cd0` at D:L505609-505611: two bits of `+0x265` and bit 4 of
  `[actor+4]+0xe1`. The walker's third argument is 0 or 3 (r1 0x567f30 / 0x567fa0); with 3 the gate skips the mask
  test (D:L505621) and the same-type test (D:L505625). "Conditionally granted" stands.
- 8, LOW, folded as a banner: the type-4 body's flags and its first exit (s22.4).
- 9, LOW, folded: "the AI's door task" is `FUN_005efa50`, which runs for any action. The reviewer re-read the four
  byte reads behind `+0x3e` / `+0x42` that s22.13 had marked "not re-read": they hold.
- 10, LOW, recorded: on this branch `FOLLOW_ACTION_CELL_READING`'s comment is `hostageFollow.ts:61-75` with the
  constant at `:76`, not 61-73; the other port citations match, and `followActionDispatch` and `markerAction` have no
  caller outside tests.

**Not checked.** s22.11's distances and its thirty routes, and the source of s22.10's expected ids (the lane's
scratch, not on the hub); the bodies of `FUN_002a8f50`, `FUN_002b4b40`, `FUN_00530f40`, `FUN_00351ef0`, `FUN_002b4e00`
and `FUN_005f7ee0`; the state writers' logic in s22.3; the store that increments `+0x3e`; s22.6's disc read; about a
dozen walker ranges cited through the port's lines in s22.8.
