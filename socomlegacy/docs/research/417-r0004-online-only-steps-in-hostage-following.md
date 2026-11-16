# 417 -- r0004's two online-only steps in hostage following: the fallback target's cell, and the trail emptied on a jump (LATER 957)

- Date: 2026-11-12. Sections 20 and 25 of the multi-title lane's one note on Fish Hook's hostages (research 404 as
  written on `agent/xs-cells` 41f1aa4fdb9f), brought to `main` by the hub's split; the text is the lane's.
- Track: **simulation** (readings, with measurements of the original where a section says so: the rig's scenario D in
  s25.10, the body classes of s25.4, and the rows the banners cite from research 404 s30 to s32). No reader and no
  consumer is
  changed by this note. MISSION OT.R97: r0004 is the specification for gameplay, so online these two steps ARE the
  specification (the main controller's ruling, quoted in research 404's head).
- What it holds. **Section 20:** r4 0x00594dd0, the r0004-only function the follow goal's update calls on its fallback
  arm in a network game (an eight-word insertion at r4 0x00602f34-0x00602f50): it rewrites the target CELL to the last
  acceptable cell on a straight line from the leader's cell toward the target position, inside the leader's sub-map;
  read twice. **Section 25:** the 26 words at r4 0x5be350-0x5be3b4 in the per-tick cell update of every body: online,
  for a locally driven human who is jumping or landing, they empty that body's trail; read twice, and MEASURED in kind
  by the rig's scenario D (s25.10, n = 1), with one correction to s25.6's plain words.
- Sources: the r0001 game ELF and its decompilation (`FUN_<addr>`, `D:L<line>`); the r0004 served ELF, cited "r4
  0x<addr>" from its bytes (it has no decompilation); the r0004 investigation's sweep of the two builds (the hub's
  evidence outside git), which COUNTED both functions' changes and read neither. The evidence tags [V1], [V4], [D],
  [I1] are research 404's (its "Sources" bullets).
- **Review on the hub: PASS WITH FINDINGS, high confidence** (2026-11-12, a reviewer on the hub who did not write it;
  one MEDIUM, on the line citations of s20.5, and seven LOW, each folded or recorded in the section at this note's
  end). The reviewer re-read at the source every claim a fix would rest on -- the eight inserted words, all 96 words
  of r4 0x594dd0 and its callback, the 26 words and what surrounds them, and s25.10 -- and found each to hold. With
  this review the note's claims count as **readings**, at the level each states; its measured rows are the rig's.

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
| 20 | r4 0x594dd0, the online step of the fallback arm | CORRECTED IN s20.11 (the second reader is in and agrees) | read twice | r0004 |
| 20.1 | the call and its arguments | STANDS | read twice | r0004 |
| 20.2 | what it writes | STANDS | read twice | r0004 |
| 20.3 | what it returns | STANDS | read twice | r0004 |
| 20.4 | the fourth argument | CORRECTED IN s20.11 (the arm is identified as the cross-sub-map walk; its body `FUN_005352d0` is still unread, s20.10) | read twice | r0004 |
| 20.5 | the walk, in plain terms | CORRECTED IN s20.11 (a per-node start offset, unread, is added); its line citations corrected by the hub's review (the last section) | mixed: read twice | r0004; r0001 |
| 20.6 | its origin | STANDS | read twice | both |
| 20.7 | an inference with its test; departure 4 | CORRECTED IN s20.11, s25, research 404 s31, research 404 s32 (the sub-map choice is by height, by the second reader; the 26 words read twice, ending r4 0x5be3b4; the fallback arm ran at an order, measured; no hit at r4 0x602f4c while gated) | mixed: inference | r0004; the port |
| 20.8 | the comparison rows; the table's second pass | CORRECTED IN s25 (the 26 words read twice) | one reader | both |
| 20.9 | what research 385-392 hold | CORRECTED IN s20.7 (the ruling on research 389 s3: a match in a room answers 1) | one reader | r0004 |
| 20.10 | not determined | CORRECTED IN research 404 s23.2 (the sentinel is 0xffffffff at run time) | one reader | r0004 |
| 20.11 | the second reader; the r0001 idiom's place | STANDS | read twice | both |
| 20.12 | the map loader's per-map patch: known ground R4B-11 | STANDS | one reader | r0004; the port |
| 20.13 | the correction's gate in r0004 | STANDS | one reader | both |
| 25 | the 26 words in the body's cell update | STANDS | read twice (read by three: research 404 s26.9) | r0004 |
| 25.1 | the twin and where the words sit | STANDS | read twice | both |
| 25.2 | the condition, term by term | STANDS | read twice (read by three: research 404 s26.9) | r0004 |
| 25.3 | the callees, as twins | STANDS | read twice | r0004 |
| 25.4 | which bodies: the classes | CORRECTED IN research 404 s30 (the classes measured; a remote human is r4 0x668f10) | read twice (the code); measured, n = 1 (the classes) | r0004 |
| 25.5 | the state ids already named | STANDS | read twice | r0001 |
| 25.6 | in plain words; departure 9 | CORRECTED IN research 404 s27.3 (the what-if has run), s25.10 (the plain words, against the rig's scenario D) | mixed: inference | r0004; the port |
| 25.7 | an enable the decompilation does not show | CORRECTED IN research 404 s26 (its caller read) | read twice | both |
| 25.8 | the body's vtable | STANDS | read twice | r0004 |
| 25.9 | not determined | CORRECTED IN research 404 s26 (slot `+0x40`'s caller read) | read twice | r0004 |
| 25.10 | after the lane closed: the rig's scenario D, which term, and the r0004 twins | STANDS | measured, n = 1 (scenario D); one reader (the term; the twins); the r0001 lines re-read on the hub | r0004; r0001 |

## 20. r4 0x00594dd0: the online-only step of the follow goal's fallback arm (one reader, from the r0004 bytes; a second reader pending) [machine code, r0004; reading, pending review; NOT measured]

**2026-11-12 -- CORRECTED IN s20.11:** the second reader is in and agrees.

> **2026-11-12, later: the second reader is in (s20.11).** Working from the bytes, and shown none of the first
> reader's answers, the second reader agrees on every point.

Date 2026-11-12. **The source.** One reader read this function from the r0004 bytes
(`evidence/forge-stim/xs/cells/review7/r4-594dd0.md`, scratch outside git). This section restates that reading in
this note's words and in the ruled citation form.

**What this author checked.** This author re-read the key instructions from the ELF with a standard-library decoder
(`t22/d4.py`; listings `t22/caller.dis.txt`, `t22/f594dd0.dis.txt`, `t22/r4.5952e0.dis.txt`, `t22/r4.595110.dis.txt`;
scratch outside git). This author also reproduced every word count of s20.8 (`t22/cmp.out.txt`, `t22/cmp.fb1c0.txt`).
A statement that rests on the first reader alone says so.

**The limits.** A second reader is pending. r0004 has no decompilation. A callee's behaviour is therefore read through
its r0001 twin's D:L: [D], and [I1] for r0004 beyond the word comparison. Nothing here is measured.

### 20.1 The call, and what it is handed [V4]

Just before the insertion, r4 0x602f2c `jal 0x530d90` (0x0c14c364) converts the position `+0xf8` into the cell
`+0x104`. Its delay slot is r4 0x602f30 `addiu a2,s4,260` (0x26860104). The callee is r4 0x530d90, `FUN_0052dc70`'s
twin (656 words, 648 identical, 8 relocated), D:L508719. The eight inserted words follow (s4 = G, the follow goal):

| r4 | word | instruction | what it does |
|---|---|---|---|
| 0x602f34 | 0x0c15e91c | `jal 0x57a470` | the network flag: r4 0x57a470, `FUN_005750a0`'s twin (4 words, 3 identical, 1 relocated), byte r4 0x45d481 |
| 0x602f38 | 0x00000000 | `nop` | delay slot |
| 0x602f3c | 0x10400006 | `beq v0,zero,0x602f58` | offline: skip the call |
| 0x602f40 | 0x268400a4 | `addiu a0,s4,164` | a0 = G+0xa4, the leader's position |
| 0x602f44 | 0x268500f8 | `addiu a1,s4,248` | a1 = G+0xf8, the target position |
| 0x602f48 | 0x26860104 | `addiu a2,s4,260` | a2 = G+0x104, the target cell |
| 0x602f4c | 0x0c165374 | `jal 0x594dd0` | the step |
| 0x602f50 | 0x24070001 | `addiu a3,zero,1` | a3 = 1, in the delay slot |

G+0xa4..0xac are three floats copied from the leader body's `+0x1c`..`+0x24` at the top of the update
(D:L508606-508608) [D; I1]. The call is reached only on the fallback arm, past r4 0x602e48 `bne s6,zero,0x602f58`
(0x16c00043), and only when the flag is non-zero. It is the only call to r4 0x594dd0 in the file (research 404 s15.6, step 3a).

### 20.2 What it writes, and when [V4]

- **Extent.** r4 0x594dd0 `addiu sp,sp,-80` (0x27bdffb0) to r4 0x594f48, the delay slot of `jr ra`. Its pad nop is r4
  0x594f4c. That makes 96 words with the pad.
- **One store through a2, and no other.** r4 0x594f28 `sw v0,0(s1)` (0xae220000), where s1 = a2 (r4 0x594e10
  `daddu s1,a2,zero`). The value comes from r4 0x594f24 `lw v0,0(s0)`, where s0 = sp+0x44 (r4 0x594df8).
- **Its guard.** r4 0x594f18 `lbu v0,64(sp)` (0x93a20040) and r4 0x594f1c `beq v0,zero,0x594f30` (0x10400004). The
  cell is stored only when the byte at sp+0x40 ("found") is non-zero.
- **The result record.** The byte at sp+0x40 is zeroed at r4 0x594df4 `sb zero,64(sp)`. The word at sp+0x44 is preset,
  field by field, to the "no cell" word r4 0x6599d0 (r4 0x594dfc-0x594e80). The two form a result record, handed to
  the walk's callback as t0 = sp+0x40 (r4 0x594ed8, r4 0x594f10).
- **Through a1, the target position G+0xf8: nothing.** a1 is saved in s2 (r4 0x594de8 `daddu s2,a1,zero`). It is only
  handed on, as the walk's third argument (r4 0x594ec0 and r4 0x594f00, `daddu a2,s2,zero`). The walk copies its
  three floats and never stores through it (`FUN_00537400` D:L403108-403110) [D; I1]. **So the position `+0xf8` is
  never written; only the cell `+0x104` can be.**
- **Through a0, the leader's position: nothing.** It is only the input of the position-to-cell conversion (r4
  0x594e84 `daddu a1,a0,zero`).
- **Globals.** None is written. It reads r4 0x6599d0 and r4 0x6599d2, and it forms the navigation object's address r4
  0x669b30 (r0001 0x66a1b0).

### 20.3 What it returns, and why the caller does not use it [V4]

r4 0x594f30 `lbu v0,64(sp)` (0x93a20040), then `jr ra` at r4 0x594f44: it returns "found" (1 = `+0x104` rewritten).
The caller does not use the value:
- r4 0x602f54 is a `nop`;
- r4 0x602f58 `addiu a0,s4,248` is also where both skips land (r4 0x602e48 and r4 0x602f3c), so v0 there is not
  this function's on every path;
- no instruction reads v0 before r4 0x602f60 `jal 0x3265a0`;
- r4 0x602f70 `ld v0,0(a1)` (0xdca20000) then overwrites it.

From r4 0x602f54 on, the code is the image of r0001 0x5fb754 onward (r4 = r0001 + 0x7800; s20.8). It works from the
POSITION `+0xf8`: the difference to `+0xd8` and its length (D:L508721 on) [V4/D, the first reader's]. **So online, on
this arm, the only change is this: `+0x104` may hold a cell other than the one under `+0xf8`.** Every later reader of
`+0x104` sees the rewritten cell. Those readers include the sub-map compare at r4 0x603518 and the request made in
INIT (0) (D:L508815). Offline, r4 runs as r0001.

### 20.4 What the fourth argument selects [V4]

**2026-11-12 -- CORRECTED IN s20.11:** the arm is identified as the cross-sub-map walk; its body `FUN_005352d0` is still unread, s20.10.

r4 0x594e7c `beq a3,zero,0x594ee8` (0x10e0001a). Its delay slot, r4 0x594e80 `sw v0,0(s0)`, finishes the preset. The
only caller passes 1.
- **a3 != 0, the arm taken:**
  1. r4 0x594e90 `jal 0x530d90` (0x0c14c364) converts the leader's position a0 into a cell at sp+0x4c, in the
     navigation object r4 0x669b30. The callee is r4 0x530d90, `FUN_0052dc70`'s twin (656 words, 648 identical, 8
     relocated), D:L397192 on.
  2. r4 0x594e98 `beq v0,zero,0x594f18`: if the position has no cell, nothing is written and the function returns 0.
  3. r4 0x594eac `jal 0x5317d0`, with a1 = the byte at sp+0x4c & 0x3f (r4 0x594eb0), fetches the leader's cell's
     sub-map object, or 0 when the id is past the count. The callee is r4 0x5317d0, `FUN_0052e6b0`'s twin (28 words,
     28 identical, 0 relocated), D:L397434.
  4. r4 0x594ed4 `jal 0x53be50` (0x0c14ef94) starts the walk, a walk inside that ONE sub-map. The callee is r4
     0x53be50, `FUN_00537400`'s twin (660 words, 649 identical, 11 relocated), D:L403011 on. Its arguments:
     - f12 = 0.2 (0x3e4ccccd, built at r4 0x594ebc and r4 0x594ec4);
     - a0 = that sub-map object;
     - a1 = sp+0x4c, the leader's cell;
     - a2 = the target position;
     - a3 = r4 0x595110, the callback (r4 0x594eb8 and r4 0x594ed0);
     - t0 = sp+0x40.
- **a3 == 0, which no caller passes:** r4 0x594f0c `jal 0x539d20` calls r4 0x539d20, `FUN_005352d0`'s twin (280
  words, 266 identical, 14 relocated), D:L401981. It is handed the whole navigation object and both positions. Its
  body was not read: the follow goal never takes this arm.

### 20.5 The walk, in plain terms [V4 for the instructions named; D for the walk's lines; I1 for r0004 beyond the comparison]

**2026-11-12 -- THE LINE CITATIONS OF THIS SUBSECTION ARE CORRECTED by the hub's review (the last section of this
note):** the behaviour described is right, but six of the `D:L` ranges given for `FUN_00537400` are a few lines early
in the decompilation; the right lines are listed there. The text below is kept as it was written.

**2026-11-12 -- CORRECTED IN s20.11:** a per-node start offset, unread, is added.

**The walk**, `FUN_00537400` (D:L403011 on), carried to r4 0x53be50 by the word comparison:
- It refuses at once, returning 0 without calling the callback, unless the start cell's row lies inside the sub-map
  and its x lies inside that row's span (D:L403056-403070).
- It starts from the CENTRE of the leader's cell (D:L403079-403085), not from the leader's position. It ends at the
  target position's x and z. The target's y is copied but not used (D:L403108-403110, D:L403131-403132).
- It steps by 0.2 of a cell width (D:L403128) while the callback returns non-zero and t < 1. Then it takes one last
  sample at t = 1 (D:L403207-403209).
- Each sample becomes a cell OF THE SAME SUB-MAP (D:L403158). The walk stops when a sample leaves the sub-map's
  rectangle, grid or row span (D:L403134-403180), or when the cell has no record (D:L403198-403200).
- For each new cell it calls the callback. The first such cell is the leader's own cell (D:L403181-403202).

**The callback** is r4 0x595110, `FUN_0058f8a0`'s twin (48 words, 45 identical, 3 relocated), D:L450179-450200. It
calls the acceptance test at r4 0x595134 `jal 0x5952e0`.
- If the cell is accepted, it stores the visited cell into the result (r4 0x5951a8 `sw v1,4(s0)`), sets found = 1
  (r4 0x5951ac), and returns 1, so the walk goes on.
- If the cell is refused, it sets found to whether the result cell differs from the "no cell" word (r4 0x595190), and
  returns 0, so the walk stops.

**The acceptance test** is r4 0x5952e0, `FUN_0058fa70`'s twin (92 words, 87 identical, 5 relocated),
D:L450240-450272.
1. It fetches the cell's record with r4 0x595308 `jal 0x5307c0`, the twin of `FUN_0052d6a0` (the first reader: 76
   words, all identical). A cell with no record is refused.
2. The class is byte 0 & 0x1f (r4 0x595324 `andi v0,v0,0x1f`). The cell is refused when the class is below 11 and its
   bit is set in 0x701 (r4 0x595328 `sltiu at,v0,11`; r4 0x59533c `andi v0,v0,0x701`). That refuses classes 0, 8, 9
   and 10.
3. When bit 5 of byte 0 is set (r4 0x595360-0x595368), the cell is refused if an object of the list at r4 0x669a40
   contains it. That list is r0001 `DAT_0066a0c0`, at the same 0x680 offset. The containment test is r4 0x515890,
   `FUN_00515750`'s twin (the first reader: 76 words, all identical).

**So, online, on the fallback arm, the target CELL becomes the last acceptable cell on a straight line from the
leader's cell toward the follow target position.** The line runs in the x-z plane, from the centre of the LEADER's
cell, inside the leader's cell's sub-map, in steps of 0.2 of a cell. It stops at the first unacceptable cell, the
first cell with no record, or the sub-map's edge. If the whole line is acceptable, the result is the cell under the
target's x and z in the leader's sub-map.

**Nothing is written** in three cases: the leader's position has no cell, the sub-map refuses the start, or the
leader's own cell is unacceptable. In the last case the callback finds the result still "no cell" and leaves found at
0.

It is a clip along a line of acceptable cells. It is not a snap to the nearest walkable cell. It never consults the
follower's position or sub-map, and the target's height plays no part. After a rewrite, `+0x104` need not be the cell
of `+0xf8`.

### 20.6 Its origin

The first reader finds it new as a function in r0004, but built from r0001 material:
- It sits between the image of the r0001 function that ends at r0001 0x58f6d8 and r4 0x594f50, `FUN_0058f6e0`'s twin
  (112 words, 99 identical, 13 relocated) [the first reader's].
- **Its a3 != 0 arm is, call for call, a block that r0001 has inline** at r0001 0x58f46c-0x58f570
  (D:L450099-450108). This author checked that block's calls [V1, t22 `r1.58f46c.dis.txt`]:
  - r0001 0x58f508 `jal 0x52dc70`;
  - r0001 0x58f524 `jal 0x52e6b0`;
  - 0.2 built at r0001 0x58f534 and r0001 0x58f53c;
  - the callback r0001 0x58f8a0, formed at r0001 0x58f548;
  - r0001 0x58f54c `jal 0x537400`;
  - the store r0001 0x58f568 `sw v0,0(s1)`.
- Its a3 == 0 arm has the shape of D:L450118.
- So it is an out-of-line packaging of an r0001 idiom, called from one new place.
- Against `FUN_0058f6e0`, it has no early accept of the start cell (r0001 0x58f7b8-0x58f7dc; D:L450155,
  D:L450166-450167) [the first reader's].

### 20.7 An inference with its test, and the port's fourth departure

**2026-11-12 -- CORRECTED IN s20.11, s25, research 404 s31, research 404 s32:** the sub-map choice is by height, by the second reader; the 26 words read twice, ending r4 0x5be3b4; the fallback arm ran at an order, measured; no hit at r4 0x602f4c while gated.

**AN INFERENCE, NOT A READING.** Take a leader standing on a non-walkable cell, such as MP71's tophost row 5 at x 11-14
(class 0, research 404 s21.2). His position locates to that cell, or to the stacked sub-map-0 cell (218,68), which is also class
0 (research 404 s19.3; research 404 s21.2). The walk calls the callback on that cell first. The acceptance test refuses class 0, so found stays
0 and nothing is written. `+0x104` then keeps r0001's value, and r0001's reading of the arm carries. Which sub-map
`FUN_0052dc70` picks among overlapping sub-maps (D:L397275 on) was not read through.
- **The test:** the hit-or-no-hit at r4 0x602f4c (research 404 s15.6, step 3a). With a hit, compare `+0x104` with the cell under
  `+0xf8` at the next pause.

**Departure 4, with lines on both sides** (STATUS; a departure BY READING, not yet shown to cause the pin or the
missing wait; not run):
- **The port builds the position.** The port's fallback arm is the `else` at `hostageFollow.ts:473-477` of `if
  (goal)` at `:463`. It is taken when the trail has no entry at the slot's depth (`trail.points[depth]`, `:462`). It
  builds a POSITION, `this.goal`, from three things:
  - the leader's feet, minus 0.65 x his velocity (`:475-476`; the factor is `:53`);
  - the slot's depth and side (`:458-459`);
  - the trail heading, or else the yaw (`:460-461`).

  Its counterpart is D:L508699-508718. These lines carry no citation of their own. The constant set cites
  `FUN_005fb1c0` D:L508635-509081 (`:50`). The citation of `FUN_005fd790` D:L509862-509875 at `:468` belongs to the
  trail arm's sideways step, not to this arm.
- **The port derives the cell.** The cell is `this.planner.locate(this.goal, there.map)` (`:478`), on both arms.
  `locate` is `locateAiCell` over the stored cells (`hostagePath.ts:353-356`, cited there as `FUN_0052dc70`
  D:L397225-397428). It ignores its second argument (`_preferredMap`). This is the counterpart of D:L508719.
- **Nothing in the port re-derives that cell.** The port has no straight-line walk from the leader's cell toward the
  target. Its only line tests (`canTravel`, `:518` and `:540`) run from the follower's cell to route cells, for the
  shortcut and for passing a point. The cell goes to the request as it is (`:495`).
- **What the port lacks online, against r4 0x594dd0:** on the fallback arm, the target cell re-derived as the last
  acceptable cell on the leader's sub-map, along the line from the centre of the leader's cell toward the target
  position. On that arm the port's target cell is r0001's, so it can differ from r0004's in two ways:
  - the port's cell can lie on another sub-map than the leader's, where r0004's lies on the leader's sub-map;
  - the port's cell can be one the acceptance test refuses, where r0004's is acceptable.

  In the inference's case above, both builds keep r0001's cell. The position `this.goal` agrees with both builds,
  because r4 0x594dd0 never writes it.
- **What a fix would also need.** Until 2026-11-12, the port had no ruling on which of its matches answer the network
  byte (research 389 s3, below), and a port of this step needs one.
- **The ruling** (the main controller, 2026-11-12, on research 389 s3; LATER 957 is the main controller's row). One
  default applies to every reader of the network-flag byte at once: the original's own answer. The byte is 1 only in
  a network game.
  - A match in a ROOM answers 1. That covers central and a host, and a LAN game too.
  - A page walking with NO room answers 0. That covers the test room's free walk and the Forge's local play.

  The rows that port r4 0x594dd0's step, and the 26 words at r4 0x5be350-0x5be3b8 (s20.8), inherit it. **Nothing of
  it is built** before the rig's hit-or-no-hit (research 404 s15.6, step 3a) is in and the 26 words are read. Departure 4 therefore
  applies wherever the port answers the byte as 1: by this default, a match in a room, and not a page walking alone.
  **2026-11-12, later:** the 26 words are now read twice (s25), at r4 0x5be350-0x5be3b4; the rig's hit-or-no-hit is
  still owed.

### 20.8 The comparison rows (the narrow r0001 -> r0004 table; it replaces the small table first written here)

**2026-11-12 -- CORRECTED IN s25:** the 26 words read twice.

**Superseded 2026-11-12.** The narrow table (`evidence/forge-stim/xs/cells/cmp-r1-r4/table.md`, scratch outside git;
one reader; source inspection of the two ELFs' bytes, nothing run) replaces the small table of one-reader rows first
written in this section. Its counts use each function's span, from its start to the next listed function's start, so
padding is included. Some therefore differ from the first rows: the follow tick is 212 words here against 204, and the
goal update is 1,260 r4 words with 116 relocations against 1,252 r0001 words with 112 relocations and 4 branches.

**The method, in three lines.**
1. Both builds' words are masked by one rule: jal and j targets, lui immediates, branch displacements, and gp- or
   lui-based 16-bit offsets.
2. Each r0001 function is located in r4 by a unique masked window, or else by an aligned call site, and is then
   compared by a sequence alignment. A differing word counts as a relocation only when it is one of those fields, and
   a branch only when its target maps through the alignment. Every other differing run is a real change.
3. As an extra check, the bytes behind every rebuildable lui-based load or store were compared between the builds. No
   difference was found anywhere in the table.

**The rows for the functions this note cites**, in the ruled form:

| r0001 | r4 | result |
|---|---|---|
| `FUN_005fae70` | r4 0x602650, `FUN_005fae70`'s twin (212 words, 199 identical, 13 relocated) | relocations only (13) |
| `FUN_005fb1c0` | r4 0x6029a0, `FUN_005fb1c0`'s twin (1260 words, 1136 identical, 116 relocated) | CHANGED (1 run(s); 116 relocations besides) |
| `FUN_005483d0` (it holds the correction's gate, D:L413920-413922; header D:L413291) | r4 0x54cf30, `FUN_005483d0`'s twin (1,520 words; 1,150 aligned: 1,000 identical, 132 relocated, 18 altered branch words; 370 unaligned against r1's 262), against 1,412 r0001 words (restated 2026-11-12, later, in the form that sums; first written with "1,016 identical, 132 relocated" alone) | **CHANGED**: 132 change runs = 105 replace (93 of them differ only in a stack offset) + 5 insert + 4 delete + 18 altered branch words. **The gate itself lies in an unchanged block**: r4 0x54e454 `lbu v0,-0x5680(at)` (0x66a980, a relocation of r0001 0x549744's 0x66b000), r4 0x54e460 `lbu v0,0x171(v1)` and r4 0x54e474 `lbu v0,0x172(v1)` (identical). The rest is the r0004 lane's ground (research 385-392 cover the mover; whether they cover these runs was not checked); not interpreted here |
| `FUN_005fc7d0` | r4 0x603fd0, `FUN_005fc7d0`'s twin (80 words, 78 identical, 2 relocated) | relocations only (2) |
| `FUN_005fd790` | r4 0x604f90, `FUN_005fd790`'s twin (208 words, 199 identical, 9 relocated) | relocations only (9) |
| `FUN_005fd150` | r4 0x604950, `FUN_005fd150`'s twin (164 words, 148 identical, 16 relocated) | relocations only (16) |
| `FUN_005fd3e0` | r4 0x604be0, `FUN_005fd3e0`'s twin (32 words, 29 identical, 3 relocated) | relocations only (3) |
| `FUN_005fd460` | r4 0x604c60, `FUN_005fd460`'s twin (112 words, 105 identical, 7 relocated) | relocations only (7) |
| `FUN_005fe1f0` | r4 0x6059f0, `FUN_005fe1f0`'s twin (180 words, 168 identical, 12 relocated) | relocations only (12) |
| `FUN_005fdad0` | r4 0x6052d0, `FUN_005fdad0`'s twin (156 words, 147 identical, 9 relocated) | relocations only (9) |
| `FUN_005fdd40` | r4 0x605540, `FUN_005fdd40`'s twin (144 words, 132 identical, 12 relocated) | relocations only (12) |
| `FUN_005fdf80` | r4 0x605780, `FUN_005fdf80`'s twin (156 words, 144 identical, 12 relocated) | relocations only (12) |
| `FUN_005fc590` | r4 0x603d90, `FUN_005fc590`'s twin (144 words, 141 identical, 3 relocated) | relocations only (3) |
| `FUN_00556370` | r4 0x55b690, `FUN_00556370`'s twin (732 words, 672 identical, 60 relocated) | relocations only (60) |
| `FUN_0056de10` | r4 0x573160, `FUN_0056de10`'s twin (1052 words, 860 identical, 192 relocated) | relocations only (192) |
| `FUN_0056cbf0` | r4 0x571f30, `FUN_0056cbf0`'s twin (296 words, 287 identical, 9 relocated) | relocations only (9) |
| `FUN_0056d090` | r4 0x5723d0, `FUN_0056d090`'s twin (12 words, 11 identical, 1 relocated) | relocations only (1) |
| `FUN_0056d890` | r4 0x572be0, `FUN_0056d890`'s twin (36 words, 35 identical, 1 relocated) | relocations only (1) |
| `FUN_00560a60` | r4 0x565da0, `FUN_00560a60`'s twin (24 words, 23 identical, 1 relocated) | relocations only (1) |
| `FUN_00567900` | r4 0x56cc40, `FUN_00567900`'s twin (1804 words, 1651 identical, 153 relocated) | relocations only (153) |
| `FUN_00567840` | r4 0x56cb80, `FUN_00567840`'s twin (48 words, 48 identical, 0 relocated) | identical |
| `FUN_00569530` | r4 0x56e870, `FUN_00569530`'s twin (8 words, 8 identical, 0 relocated) | identical |
| `FUN_005e0010` | r4 0x5e77e0, `FUN_005e0010`'s twin (8 words, 8 identical, 0 relocated) | identical |
| `FUN_0052c5b0` | r4 0x52f6d0, `FUN_0052c5b0`'s twin (4 words, 3 identical, 1 relocated) | relocations only (1) |
| `FUN_0052c320` | r4 0x52f440, `FUN_0052c320`'s twin (164 words, 161 identical, 3 relocated) | relocations only (3) |
| `FUN_0052bdf0` | r4 0x52ef10, `FUN_0052bdf0`'s twin (328 words, 317 identical, 11 relocated) | relocations only (11) |
| `FUN_0052d480` | r4 0x5305a0, `FUN_0052d480`'s twin (136 words, 127 identical, 9 relocated) | relocations only (9) |
| `FUN_0052dc70` | r4 0x530d90, `FUN_0052dc70`'s twin (656 words, 648 identical, 8 relocated) | relocations only (8) |
| `FUN_005169b0` | r4 0x516af0, `FUN_005169b0`'s twin (344 words, 328 identical, 16 relocated) | relocations only (16) |
| `FUN_00600f70` | r4 0x608770, `FUN_00600f70`'s twin (64 words, 62 identical, 2 relocated) | relocations only (2) |
| `FUN_0054f6e0` | r4 0x554630, `FUN_0054f6e0`'s twin (64 words, 53 identical, 11 relocated) | relocations only (11); r4 holds 114 more words after the image (r4 0x554730-0x5548f4), with no r0001 match and no jal from any image in the table |
| `FUN_002b3a00` | r4 0x2b5410, `FUN_002b3a00`'s twin (88 words, 79 identical, 9 relocated) | relocations only (9) |
| `FUN_002b28d0` | r4 0x2b42e0, `FUN_002b28d0`'s twin (276 words, 248 identical, 28 relocated) | relocations only (28) |
| `FUN_005999e0` | r4 0x59f4e0, `FUN_005999e0`'s twin (96 words, 85 identical, 11 relocated) | relocations only (11) |
| the setter body r0001 0x557ee0 | r4 0x55d200, its twin (20 words, 20 identical, 0 relocated) | identical |
| the setter body r0001 0x592030 | r4 0x597860, its twin (20 words, 17 identical, 3 relocated) | relocations only (3) |
| the setter body r0001 0x2b3c70 | r4 0x2b5680, its twin (20 words, 20 identical, 0 relocated) | identical |
| `FUN_001b3620` | r4 0x1b3620, `FUN_001b3620`'s twin (10 words, 10 identical, 0 relocated) | identical |
| `FUN_00309180` | r4 0x326520, `FUN_00309180`'s twin (12 words, 12 identical, 0 relocated) | identical |
| `FUN_00309240` | r4 0x3265e0, `FUN_00309240`'s twin (16 words, 16 identical, 0 relocated) | identical |
| `FUN_00524760` | r4 0x524a20, `FUN_00524760`'s twin (72 words, 72 identical, 0 relocated) | identical |
| `FUN_00526540` | r4 0x526800, `FUN_00526540`'s twin (152 words, 147 identical, 5 relocated) | relocations only (5) |
| `FUN_00527e70` | r4 0x528130, `FUN_00527e70`'s twin (84 words, 84 identical, 0 relocated) | identical |
| `FUN_005623b0` | r4 0x5676f0, `FUN_005623b0`'s twin (248 words, 229 identical, 19 relocated) | relocations only (19) |
| `FUN_005e7390` | r4 0x5eeb60, `FUN_005e7390`'s twin (124 words, 117 identical, 7 relocated) | relocations only (7) |
| `FUN_005e7580` | r4 0x5eed50, `FUN_005e7580`'s twin (56 words, 56 identical, 0 relocated) | identical |
| `FUN_00524d50` | r4 0x525010, `FUN_00524d50`'s twin (300 words, 293 identical, 7 relocated) | relocations only (7) |
| `FUN_00525810` | r4 0x525ad0, `FUN_00525810`'s twin (276 words, 263 identical, 13 relocated) | relocations only (13) |
| `FUN_00526f20` | r4 0x5271e0, `FUN_00526f20`'s twin (248 words, 245 identical, 3 relocated) | relocations only (3) |
| `FUN_002b5760` | r4 0x2b71d0, `FUN_002b5760`'s twin (28 words, 25 identical, 2 relocated) | CHANGED (1 run(s); 2 relocations besides) |
| `FUN_00517eb0` | r4 0x517ff0, `FUN_00517eb0`'s twin (128 words, 124 identical, 4 relocated) | relocations only (4) |
| `FUN_005180b0` | r4 0x5181f0, `FUN_005180b0`'s twin (52 words, 51 identical, 1 relocated) | relocations only (1) |
| `FUN_005f0180` | r4 0x5f7960, `FUN_005f0180`'s twin (188 words, 167 identical, 20 relocated) | CHANGED (1 run(s); 20 relocations besides) |
| `FUN_005f6010` | r4 0x5fd7f0, `FUN_005f6010`'s twin (16 words, 15 identical, 1 relocated) | relocations only (1) |
| `FUN_005f8330` | r4 0x5ffb10, `FUN_005f8330`'s twin (12 words, 12 identical, 0 relocated) | identical |
| `FUN_005750a0` | r4 0x57a470, `FUN_005750a0`'s twin (4 words, 3 identical, 1 relocated) | relocations only (1) |
| `FUN_00516940` | r4 0x516a80, `FUN_00516940`'s twin (28 words, 28 identical, 0 relocated) | identical |
| `FUN_00516920` | r4 0x516a60, `FUN_00516920`'s twin (8 words, 8 identical, 0 relocated) | identical |
| `FUN_00530d10` | r4 0x533e80, `FUN_00530d10`'s twin (44 words, 44 identical, 0 relocated) | identical |
| `FUN_00519290` | r4 0x519550, `FUN_00519290`'s twin (20 words, 20 identical, 0 relocated) | identical |
| `FUN_00527300` | r4 0x5275c0, `FUN_00527300`'s twin (4 words, 4 identical, 0 relocated) | identical |
| `FUN_0052e6b0` | r4 0x5317d0, `FUN_0052e6b0`'s twin (28 words, 28 identical, 0 relocated) | identical |
| `FUN_0052d8b0` | r4 0x5309d0, `FUN_0052d8b0`'s twin (40 words, 39 identical, 1 relocated) | relocations only (1) |
| `FUN_005f5c00` | r4 0x5fd3e0, `FUN_005f5c00`'s twin (24 words, 22 identical, 2 relocated) | relocations only (2) |
| `FUN_002b4d80` | r4 0x2b67f0, `FUN_002b4d80`'s twin (32 words, 27 identical, 4 relocated) | CHANGED (1 run(s); 4 relocations besides) |

**The walker `FUN_00567900`, sub-range by sub-range** (research 418 s22): the dispatch r0001 0x567c14-0x567c58 is r4
0x56cf54-0x56cf98, relocations only (3). The table base becomes r4 0x65c9f0. The type-7 body r0001 0x567c60-0x567ce4 is
r4 0x56cfa0-0x56d024, identical (34 words). The type-4 body r0001 0x567ce8-0x567ee0 is r4 0x56d028-0x56d220, relocations
only (10). The type-1 body r0001 0x567ee8-0x568150 is r4 0x56d228-0x56d490, relocations only (7). The r4 table at r4
0x65c9f0 holds 0x0056d600, 0x0056d228, 0x0056d600, 0x0056d600, 0x0056d028, 0x0056d600, 0x0056d600 and 0x0056cfa0. Each
of the eight entries is the r4 image of its r0001 entry (8 of 8).

**The real changes it found** (no other function in the table has one):
1. `FUN_005fb1c0`: the ONE insertion, the eight words at r4 0x602f34-0x602f50 (s20.1).
2. The action object's id is read at `+0x40` in r0004, against `+0x3c` in r0001. That is one altered word in each of
   three functions:
   - `FUN_002b5760`: r0001 0x2b577c `lhu a1,0x3c(a1)` (0x94a5003c), r4 0x2b71ec `lhu a1,0x40(a1)` (0x94a50040);
   - `FUN_005f0180`: r0001 0x5f01fc `lhu a1,0x3c(s1)` (0x9625003c), r4 0x5f79dc `lhu a1,0x40(s1)` (0x96250040);
   - `FUN_002b4d80`: r0001 0x2b4dc0 `lhu v1,0x3c(v0)` (0x9443003c), r4 0x2b6830 `lhu v1,0x40(v0)` (0x94430040).

   So r0001 lines that read an action's id at `+0x3c` (research 334 s14, D:L157310) hold for r0004 only with `+0x40`.
   These are shared helpers: reported, and not compared further.
3. `FUN_005483d0`, heavily changed (the row above). The correction's gate itself lies in an unchanged block. The rest is
   the r0004 lane's ground (research 385-392 cover the mover), and this note does not interpret it.

**A gap the table does not cover: `FUN_005b7ba0`**, the body's per-tick cell update and the CALLER of the trail
append (research 404 s19.1, research 404 s21.6), is not one of its rows. Another reader finds its r4 twin, r4 0x5be100, with **26 words
INSERTED** at r4 0x5be350-0x5be3b8. The insertion holds, in order:
- a call through the controller's vtable `+0x2c`;
- the network-flag reader r4 0x57a470;
- calls to r4 0x58d580, r4 0x58d540 and r4 0x5275d0, with a0 = s1+0x434.

It is **UNREAD**, and a reader is on it now. Not checked by this author.
(Wording, 2026-11-12, later: the 26 words were COUNTED by the r0004 investigation's sweep, outside git, unread there;
they are READ here, twice (s25). "Finds" above means that reader's own count, not a discovery.)

**Later, 2026-11-12: read twice, by two readers independent of each other, and re-checked here at the bytes (s25).**
The 26 words are r4 0x5be350-0x5be3b4. The calls are as listed above; the last, r4 0x5275d0 (`FUN_00527310`'s twin)
with a0 = s1+0x434, is the one that empties the trail. s25 reads what each does.

**The main controller's rule, a rule of the simulation track** (quoted): "nothing built on an r0001 reading of hostage
following merges until its functions are shown identical in r0004 or read there; every function a 933 fix relies on
carries its row of the comparison table in the fix's report."

**Rows this note cites that are not in the narrow table** (first counted by review7 and reproduced by t22, `t22/d4.py
cmp`):
- r4 0x52f6e0, `FUN_0052c5c0`'s twin (388 words, 374 identical, 14 relocated);
- r4 0x53be50, `FUN_00537400`'s twin (660 words, 649 identical, 11 relocated);
- r4 0x595110, `FUN_0058f8a0`'s twin (48 words, 45 identical, 3 relocated);
- r4 0x5952e0, `FUN_0058fa70`'s twin (92 words, 87 identical, 5 relocated);
- r4 0x539d20, `FUN_005352d0`'s twin (280 words, 266 identical, 14 relocated).

**The table's second pass, 2026-11-12, later.** Source: the same `cmp-r1-r4/table.md`, revised (r2), now 286 rows;
one reader; source inspection of the two ELFs' bytes, nothing run. **Reported, not interpreted.** What this author
checked: the row count; the rows quoted below against the table; the instructions marked [V1] or [V4], decoded with a
standard-library decoder (`t28/v.py`, scratch outside git).
- **The gap, and how it arose.** The first issue missed `FUN_005b7ba0` because the trail's writers were searched by
  field offset inside the trail object. That finds the functions that store the trail's fields, not the functions
  that call them, and `FUN_005b7ba0` has no `jal` caller: its only reference is the data word r1 0x6691e8, slot `+0x48`
  of the body's vtable (s25.8; research 404 s26.2) [V1]. The second pass added, for every listed writer of the trail, the route,
  the goal, the marker and the body's cells, every `jal` site and every data word equal to its address, and compared
  each containing function: 180 new rows. It stops at one level; the callers of those callers were not examined.
- **`FUN_005b7ba0`'s row:** r4 0x5be100, `FUN_005b7ba0`'s twin (406 words, 332 identical, 48 relocated): CHANGED, one
  insertion of 26 words at r4 0x5be350-0x5be3b4, between the images of r1 0x5b7dec and r1 0x5b7df0, and two r4-only
  words after the image, r4 0x5be758-0x5be75c. This agrees with s25's two readers on the range.
- **The method's limit, stated at the table's head.** A `jal` is masked to its opcode, so a call retargeted to a
  different function aligns as a relocation. A check of every aligned `jal`'s r4 target against the window-located
  twin of its r1 target lists eight groups: r1 0x2232f0 (`FUN_002232a0`); 15 sites in `FUN_0023bc50` and
  `FUN_0023eca0`; r1 0x23becc, 0x23ed18 and 0x23ed2c; r1 0x23ff30; r1 0x2c0b50 (`FUN_002c0850`); r1 0x52b174 and
  0x52b190; r1 0x27f894; r1 0x595904 (`FUN_00594cf0`). One more limit: a lui and its low half split across a branch
  target show as a change (`FUN_002041e0`).
- **The real changes among the callers that touch hostage following or the doors:**
  1. **The action object grew by 4 bytes in r0004.** The action loader `FUN_002b4f40` (r4 0x2b69b0, `FUN_002b4f40`'s
     twin (372 words, 273 identical, 89 relocated), CHANGED, 12 runs) allocates 0x40 bytes in r0001, r1 0x2b5138
     `addiu a0,zero,64` (0x24040040), and 0x44 in r0004, r4 0x2b6ba8 `addiu a0,zero,68` (0x24040044) [V1; V4]. Every
     field it touches after `+0x30` is 4 further on. The id moves from `+0x3c` to `+0x40` in ten functions:
     `FUN_002b5760`, `FUN_005f0180` and `FUN_002b4d80` (above); `FUN_002a8140` (two words); `FUN_005743c0`;
     `FUN_005d6770`; `FUN_005ebf00`; `FUN_005ec230`; `FUN_005ec4e0`; and `FUN_005911f0`, which also reads `+0x34`
     where r0001 reads `+0x30`, and `+0x38` where r0001 reads `+0x34`. The loader's own store of the id is r4 0x2b6bf0 `sh t0,0x40(v0)`.
  2. **The binder's twin** is r4 0x2a9930, `FUN_002a8140`'s twin (724 words, 649 identical, 73 relocated). Its only
     changed words are the two offset words (r4 0x2aa3b4 and r4 0x2aa3e4, research 418 s22.10), and its jump table at r4 0x41c6f0
     maps 8 of 8.
  3. **The door action's tick `FUN_005efa50` changed** (D:L502470 on; the AI's door task, research 364 L165). r4
     0x5f7220, `FUN_005efa50`'s twin (462 words, 394 identical, 63 relocated), CHANGED, 5 runs. At the door use: r0001
     calls r1 0x5f0048 `jal 0x2b44e0` with r1 0x5f004c `daddu a2,v0,zero` in its delay slot; r0004 inserts r4 0x5f7818
     `daddu a2,v0,zero` before r4 0x5f781c `jal 0x2b5ef0`, and its delay slot is r4 0x5f7820 `addiu a3,zero,-1`
     (0x2407ffff) [V1; V4]. **One more argument, -1; the callee is unread.** The table pairs r1 0x2b44e0 with r4
     0x2b5ef0, while the window-located image of `FUN_002b44e0` is r4 0x2b5f08 (its `details.txt`: "DISAGREES").
     The other runs read a byte at `+0x42` for `+0x3e` (r1 0x5f006c / r4 0x5f7840; r1 0x5f0080 / r4 0x5f7858) and
     insert a nop at r4 0x5f784c. **So the r0001 reading of use-and-wait is not shown to hold word for word in r0004
     at that call.**
  4. **The map loader `FUN_002ac410`'s insertion.** r4 0x2addd0, `FUN_002ac410`'s twin (396 words, 254 identical, 138
     relocated), CHANGED: r4 0x2ae130 `lui a1,0x67`, 0x2ae134 `daddu a0,s0,zero`, 0x2ae138 `jal 0x5294b0`, 0x2ae13c
     `addiu a1,a1,-25808` [V4], so a1 = r4 0x669b30, the navigation manager (s20.2). r4 0x5294b0 has no r0001 match.
     It is known ground, the r0004 plan's open row R4B-11; review16's independent read is s20.12.
  5. **The local human's tick `FUN_00594cf0`** (a caller of `FUN_005fcc40`): r4 0x59a6e0, `FUN_00594cf0`'s twin (1688
     words, 1464 identical, 167 relocated), CHANGED, 19 runs. One reader places every run outside the 0.6 s placement
     (research 404 s26.2). The r0004 investigation's sweep counts +49 words in it; the table's 44 is by span; the two were not
     reconciled word by word here (research 404 s26.2).
- **The rows this note cites that the second pass adds**, in the ruled form: r4 0x604170, `FUN_005fc970`'s twin (180
  words, 166 identical, 14 relocated), relocations only; r4 0x604440, `FUN_005fcc40`'s twin (60 words, 58 identical, 2
  relocated), relocations only; r4 0x54b7a0, `FUN_00546c40`'s twin (36 words, 34 identical, 2 relocated), relocations
  only (s25.7's "40 words, 38 identical" is review13's extent); the five changed rows above. research 404 s26 and research 404 s28 give the
  rest of their rows.

### 20.9 What research 385-392 already hold, and where this extends them

**2026-11-12 -- CORRECTED IN s20.7:** the ruling on research 389 s3: a match in a room answers 1.

- **The network byte.** "r4 0x45d481 (r0001 `DAT_0045a0c1`)" is the byte r0004 tests for a network game in:
  - research 385 s5 (P5, the jump's climb-request refusal);
  - research 389 s3 and s4 (the bomb-drop and use offers);
  - research 391 s2.10 (the online push-apart), research 391 s2.11 (no fall damage for an AI online) and research 391 s6.1 (every landing lands
    online).

  This note cites that reading and does not re-derive it. It adds two more readers of the byte: the follow tick's gate
  (r4 0x6027fc, research 404 s15.3) and the follow goal's update (r4 0x602f34, s20.1).
- **The twin form.** The form "`FUN_<r1>`'s twin (r4 0x...)" is research 391's (its s2.9 and s2.11) and the r0004 plan's.
  This note adds word counts to each twin, as the main controller ruled.
- **Hostages online.** Research 391 s2.11 reads that, online, the original's AI bodies are the hostages (research 193
  s12.8). Research 389 s3 records that no ruling yet says which of the port's matches answer the byte: "a room's match
  always; the test room's offline walk, the Forge's, a LAN game" are unruled. Departure 4 inherits that open ruling.
- **The extension.** The r0004 lane's notes (385-392) and its plan (`plans/r0004-option-b.md`) read movement, stance,
  jumps, blasts, offers and mines. They have no row for hostage following; R4B-04 is the hostage's credit. This
  section is the first r0004-only reading in hostage following. Its step lies outside every R4B row.

### 20.10 Not determined

**2026-11-12 -- CORRECTED IN research 404 s23.2:** the sentinel is 0xffffffff at run time.

- what classes 0, 8, 9 and 10 mean, and what the list at r4 0x669a40 holds;
- how `FUN_0052dc70` chooses among overlapping sub-maps;
- the body of `FUN_005352d0` (the unused arm), and the walk's deeper callees;
- the run-time value of the "no cell" word r4 0x6599d0. Its file value is 0. The first reader finds a start-up routine
  that ORs it to 0xffffffff, and does not determine that it runs before play. **Later, 2026-11-12 (research 404 s23.2 (b)):** the same
  construction is in r0001, the static initialiser r1 0x668680-0x668708, whose address is the data word at r1
  0x6690ec; a fourth reader settles it as 0xffffffff at run time. That the table holding r1 0x6690ec is walked at
  start-up is still not read;
- whether RAM equals the served ELF;
- how often the fallback arm runs online.
### 20.11 The second reader (review9), and the r0001 idiom's place

**The source and the method.** `evidence/forge-stim/xs/cells/review9/r4-594dd0-second.md`, scratch outside git. The
second reader worked from the bytes with its own standard-library decoder, and was shown none of the first reader's
answers.

**It agrees on every point:**
- the single store through a2 (r4 0x594f28) and its guard;
- nothing is written through a0 or a1;
- the return is the found byte, and the caller ignores it;
- the fourth argument selects the one-sub-map walk (a3 != 0) or the cross-sub-map walk (a3 == 0);
- the callees: every one is the r0001 function's twin with 0 different words, to depth 3.

**The differences between the two, as they are:**
- **Word counts differ by a few, through different extents.** Examples: r4 0x594dd0 is 95 words against 96 (the pad
  word); `FUN_0052dc70` is 653, 645, 8 against 656, 648, 8; `FUN_00537400` is 658, 647, 11 against 660, 649, 11;
  `FUN_0058fa70` is 89, 84, 5 against 92, 87, 5.
- **The address of the list.** The second reader gives the list's head as r1 0x66a0bc, against `DAT_0066a0c0`. Its r4
  address was not resolved by the second reader; s20.5 gives r4 0x669a40 from the load's address.
- **The sub-map choice.** The second reader adds that `FUN_0052dc70` picks among stacked sub-maps by the position's
  HEIGHT. That also matches review10's reading (research 404 s21.2).
- **The walk's start.** The second reader adds that the start may be adjusted by a per-node offset (D:L403095-403104).
  It was not read.
- **The sub-map of the written word.** The written word always carries the START's sub-map id (D:L403161, D:L403251).
  So even with every cell acceptable, the word stored at `+0x104` may differ in its id bits from the one written at r4
  0x602f2c.

**The r0001 idiom** (the second reader's answer).
- **Where it is.** The block r0001 0x58f46c-0x58f570 lies in `FUN_0058f230` (D:L450038-450136). It is the branch for a
  selector of 0x15, 2 or 0, taken when the word at param_2+0x3dc is 0 (D:L450086-450109; the block itself is
  D:L450097-450108).
- **Its walk.** The start is the object's own position, param_2+0x1c. The end is a point f units along the object's
  local -Z axis, in world space (r0001 0x58f440-0x58f468, D:L450093-450096).
- **Its callers.** `FUN_0058f230` is called from `FUN_0058fbe0` and `FUN_00590bc0`, which are slots `+0x84` and
  `+0x28` of the AI controller's vtable r0001 0x6693f0, and from `FUN_005e8e10`.
- **It is still in r0004.** The r0001 block exists unchanged in r0004, inside r4 0x594920, `FUN_0058f230`'s twin
  (298 words, 246 identical, 52 relocated). **So r4 0x594dd0 is an addition, not a move.**

### 20.12 The map loader's per-map patch of the AI maps: known ground, R4B-11 (r4 0x5294b0) [machine code, r0004; one reader's independent read; reading, pending review; NOT measured]

Date 2026-11-12, later. **This is known ground:** the r0004 plan's OPEN row R4B-11 (`plans/r0004-option-b.md:92`, "G2
nav-map edits and the spawn re-sort (mp10, 11, 52, 71, 73, 81, 82): `applyR0004AiMapEdits` after `parseAiMaps` ...";
its evidence `cluster-ai-navmap-patches.md`; its level "reading, pending review"), and NOT BUILT: `git grep -iE
"5294b0|applyR0004AiMapEdits|nav-map edits"` on this branch finds the plan's row and this note, and nothing under
`packages/`. **review16** (`evidence/forge-stim/xs/cells/review16/`, its summary page `README.md`, scratch outside git)
is an independent read of it from the bytes by a reader who had seen neither the plan nor the dossier, offered to the
r0004 lane; not its discovery; no further reading by this lane. This author checked [V4, `t28/v.py`] the loader's four
inserted words (s20.8, change 4), the map-name string "mp71" at r4 0x65b018 and MP71's block word for word: six cell
words of sub-map 0 (x 231, 232, 197, 198, 174, 175; z 89, 89, 122, 122, 87, 87), a loop of six, and the store r4
0x52a484 `sb v1,0(s1)` of (byte 0 & 0xe0) | 0. **The one line, in the deciding seat's words:** "MP71's walkable data in
r0004 differs from the disc's by six cells of the first sub-map set to type 0 -- (231,89), (232,89), (197,122),
(198,122), (174,87), (175,87) -- (R4B-11, open); none is on the flight or the landing (none within ten columns of the
flight), and the port's AI map for MP71 lacks all of R4B-11's edits until that row is built." (Their distances, in
cells, from the foot (219,84) and the landing (218,71): (231,89) 13.0 and 22.2; (232,89) 13.9 and 22.8; (197,122) 43.9
and 55.2; (198,122) 43.4 and 54.8; (174,87) 45.1 and 46.8; (175,87) 44.1 and 45.9.)

### 20.13 The correction's gate in r0004 (review19; one reader) [machine code, both builds; reading, pending review; NOT measured]

Date 2026-11-12, later. **The source.** One reader, `evidence/forge-stim/xs/cells/review19/` (`runs.out.txt`,
`cfg.r1.out.txt`, `cfg.r4.out.txt`, `callees.out.txt` and its scripts), scratch outside git. **What this author
checked** [V1, V4, `t28/v.py`]: the branch r1 0x548410-0x54842c / r4 0x54cf70-0x54cf8c and D:L413400-413402; the
line D:L385318 and the call D:L396307-396308. The rest is the reader's.
- **The gate block.** r1 0x549724-0x549788 = r4 0x54e434-0x54e498, 26 words, 22 identical, 4 relocated (s20.8's
  row). The gate calls r1 `FUN_00516f10`, whose twin is r4 0x517050 (44 words, 41 identical, 3 relocated), which calls
  r1 `FUN_005169b0`, twin r4 0x516af0 (344 words, 328 identical, 16 relocated). r4 0x517050 is not r1 `FUN_00517050`
  (the head's citation rule).
- **Its conditions**, the same in both builds: G1 the global byte r1 0x66b000 / r4 0x66a980; G2 bit 7 of controller
  `+0x171`; G3 bit 0 of controller `+0x172`. No other, and no network byte in the function.
- **One branch before the gate can avoid it:** r1 0x548420 / r4 0x54cf80 `bne v1,zero` on bit 3 of the actor's
  `+0x1061` (D:L413402) [V1; V4].
- **By graph reachability, 0 of the function's 132 changed runs changes whether the gate is reached.** Whether the
  added calls and loop terminate is not determined.
- The reader's remarks on other notes (research 399 L182; research 217's +113) are reported to redotcom-19, not
  written here.

## 25. The second online insertion: the body's cell update [machine code, r0004; two readers, independent, agreed; still a reading; NOT measured]

Date 2026-11-12. **Who read it.** Two readers, independent of each other, from the r0004 bytes:
- the first: `evidence/forge-stim/xs/cells/review11/` (`r4_5be100.txt`, `align_5b7ba0.txt`, `vt_rtti.txt` and the
  rest), scratch outside git;
- the second: `evidence/forge-stim/xs/cells/review13/` (`r4_5be100.lst`, `cmp_5b7ba0.txt`, `twin_callees.txt`,
  `vtfam_r4.txt`, `rtti_r4.txt` and the rest), scratch outside git. It agrees with the first on every point.

**Standing** (the deciding seat's wording, 2026-11-12, later): the 26 words were COUNTED by the r0004 investigation's
sweep (the hub's evidence, outside git: +26 in `FUN_005b7ba0`, unread there); they are READ here, twice,
independently. This section adds what they DO.

**What this author checked** [V4 and V1, `t22/d4.py`]: all 26 words; the four retargeted branches and the branch that
puts the words inside the trail-enabled block; the callees' first words (r4 0x58d580, r4 0x58d540, r4 0x57d220, r4
0x5275d0, r4 0x5153b0); the twin counts of `FUN_00577e40` and `FUN_00546c40`; the vtable words and the class names of
the six vtables named below; the tail jump of s25.7 in both builds. **Still a reading:** r0004 has no decompilation,
and a callee's behaviour is read through its r0001 twin's D:L, [D] with [I1] beyond the word comparison.

### 25.1 The twin, and where the words sit

r4 0x5be100, `FUN_005b7ba0`'s twin. The two readers count it differently, through different extents and classes:
- the first: 405 words against 379; 331 identical, 48 relocated (the retargeted branches among them), 26 inserted at
  r4 0x5be350-0x5be3b4;
- the second: 332 identical, 44 relocated, and 4 branches retargeted, each grown by 26 words; its own comparison file
  counts 380 r0001 words against 408 r4 words and 28 inserted, the 26 here and two pad words at the end.

This author checked the four retargeted branches (each target 26 words further): r1 0x5b7cbc / r4 0x5be21c, r1
0x5b7d40 / r4 0x5be2a0, r1 0x5b7d5c / r4 0x5be2bc, and r1 0x5b7dc0 / r4 0x5be320. The last is the test of the body's
`+0x105e` bit 0 (D:L471319): r4 0x5be320 `beq v1,zero,0x5be3b8` (0x10600025) skips both the trail append and the
inserted words.

**Where they sit.** Right after the trail append, r4 0x5be348 `jal 0x525010` (0x0c149404), the append's twin r4
0x525010 (`FUN_00524d50`'s twin, 300 words, 293 identical, 7 relocated: unchanged), and before r4 0x5be3b8 `lbu
v1,225(s1)` (0x922300e1), the image of D:L471325's `+0xe1` test. So: between D:L471324 and D:L471325, on the
walkable, changed-cell, trail-enabled path. s1 is the body.

**The append's twin, counted two ways** (2026-11-12, later; not reconciled): r4 0x525010, `FUN_00524d50`'s twin
(300 words, 293 identical, 7 relocated) by the comparison table, whose span runs from r1 0x524d50 to the next listed
function at r1 0x525200 (the pad word r1 0x5251fc included); and (299 words, 292 identical, 7 relocated) by review11
(`find_r4_525010.txt`), whose extent ends at the `jr ra` delay slot r1 0x5251f8. Both find 7 relocations and no other
change.

### 25.2 The condition, term by term [V4]

| r4 | word | instruction | the term |
|---|---|---|---|
| 0x5be350 | 0x8e2400c0 | `lw a0,192(s1)` | the body's controller, `+0xc0` |
| 0x5be354 | 0x10800006 | `beq a0,zero,0x5be370` | no controller: the answer is 0 (v1 = 0 in the delay slot) |
| 0x5be35c-0x5be364 | | `lw t9,0(a0)`; `lw t9,44(t9)`; `jalr ra,t9` | **term 1: the controller's slot `+0x2c` answers non-zero** |
| 0x5be370-0x5be374 | | `andi v1,v1,0xff`; `beq v1,zero,0x5be3b8` | otherwise, skip |
| 0x5be37c | 0x0c15e91c | `jal 0x57a470` | **term 2: the network byte (r4 0x45d481) is non-zero** (s20.1) |
| 0x5be384 | 0x1040000c | `beq v0,zero,0x5be3b8` | otherwise, skip |
| 0x5be38c | 0x0c163560 | `jal 0x58d580` | **term 3a: r4 0x58d580 answers non-zero** (a0 = the body) |
| 0x5be394 | 0x14400006 | `bne v0,zero,0x5be3b0` | if so, go to the call |
| 0x5be39c | 0x0c163550 | `jal 0x58d540` | **term 3b: else r4 0x58d540 answers non-zero** |
| 0x5be3a4 | 0x10400004 | `beq v0,zero,0x5be3b8` | otherwise, skip |
| 0x5be3b0 | 0x0c149d74 | `jal 0x5275d0` | **the action**, with a0 = s1+0x434 (r4 0x5be3b4 `addiu a0,s1,1076`, 0x26240434, in the delay slot) |

### 25.3 The callees, as twins

- r4 0x58d580, `FUN_00587f50`'s twin (16 words, 14 identical, 2 relocated): r4 0x57d220(body, 8) or r4 0x57d220(body,
  9) [V4: r4 0x58d584 `addiu a1,zero,8`, r4 0x58d5a8 `addiu a1,zero,9`]: **the current action id is 8 or 9**.
- r4 0x58d540, `FUN_00587f10`'s twin (16 words, 14 identical, 2 relocated): the same with 10 or 11 [V4: r4 0x58d544,
  r4 0x58d568].
- r4 0x57d220, `FUN_00577e40`'s twin (24 words, 23 identical, 1 relocated): r4 0x57d234 `lh v0,1332(a0)`
  (0x84820534) reads the short at body+0x534 and answers 1 when it equals the id; else it compares that short with
  what r4 0x5e9260 returns for the word at body+0x528 and the id (r4 0x57d248-0x57d260).
- r4 0x5275d0, `FUN_00527310`'s twin (42 words, 42 identical, 0 relocated), on body+0x434, the trail object [V4]: if
  the route byte at obj+0x80 is 1-3 (an unsigned compare, research 419 s22.9), it cancels the pending request (r4 0x5275f0 `jal
  0x5107b0`); then, if the byte is no longer 1-3, it zeroes the trail's entry count at obj+0x9c through r4 0x5153b0
  (r4 0x52760c, a0 = obj+0x98; r4 0x5153b0 is `jr ra` with `sw zero,4(a0)`, the same two words as r1 0x5153b0) and
  zeroes other path-result words (r4 0x52761c-0x52763c). **The trail is emptied.**
- **The byte, when the trail is enabled** (the second reader's addition): enabling the trail sets the trail object's
  state byte `+0x80` to 4 (D:L392531-392536, opened here) [D; I1]. So on this path, which runs only with the trail
  enabled, the clear is unconditional.
  (2026-11-12, later: the second reader of research 404 s26, review20, reads `FUN_00525210` there as doing BOTH: trail `+0x1c` |= 4,
  the trail's flag bit 2 of research 404 s28.8, and byte trail `+0x80` = 4, with `+0x94` = n. The three stores are r1 0x5252fc
  `sw s1,148(s0)`, r1 0x525318 `ori a0,a0,0x4` with its store at r1 0x52531c, and r1 0x525320 `sb v1,128(s0)` with
  v1 = 4 [V1, read here in review14's listing].)

It cannot change the body's `+0xe4` or `+0xe8`: those are written before it (D:L471318), and none of its callees
writes the body.

### 25.4 Which bodies: the class names behind the vtable words [V4]

**2026-11-12 -- CORRECTED IN research 404 s30:** the classes measured; a remote human is r4 0x668f10.

Slot `+0x2c` of each controller vtable, with the class name from the vtable's type-info record (first reader's
`vt_rtti.txt`; second reader's `vtfam_r4.txt`; the names and the slot words re-checked here):

| vtable | class | slot `+0x2c` | the recipe's read (research 404 s15.6) |
|---|---|---|---|
| r4 0x668e30 | CSealCtrl | r4 0x547c40, `jr ra` with `addiu v0,zero,1`: **1** | the player's controller (read 2) |
| r4 0x669370 | CSealCtrlSquirm | r4 0x547c40: **1** | |
| r4 0x668d70 | CSealCtrlAi | r4 0x57b010, `jr ra` with `daddu v0,zero,zero`: 0 | the follower's and an idle hostage's controller (reads 1 and 3) |
| r4 0x668f10 | CRemoteCtrl | r4 0x5eda20, the same: 0 | measured (research 404 s30): the other player's copy, and the host's copies of the hostages |
| r4 0x432b60 | CSealCtrlCopy | r4 0x2b55e0, the same: 0 | (an earlier inference put a remote human here, research 404 s15.3a; measured otherwise, research 404 s30) |

So the words act only on a body whose controller is a CSealCtrl or a CSealCtrlSquirm: in the readings so far (research 404 s15.3a),
the locally driven human.
**2026-11-12, later (research 404 s30), measured once:** the own player's controller is r4 0x668e30 (CSealCtrl); the hostages'
are r4 0x668d70 on the leader's console and r4 0x668f10 on the host's copies; the other player's copy is r4 0x668f10
(CRemoteCtrl), not r4 0x432b60 as the earlier inference had.

### 25.5 The state ids are already named in the repository

- **Which id is which:** research 369 s13 (`369-the-action-prompts-common-gate.md`): 8 "Jump launch", 9 "Jump fall"
  (`FUN_00587f50`), 10 "Jump land", 11 "Jump land hard" (`FUN_00587f10`).
- **The two tests on those ids:** research 201 (`201-r2-c2-movement.md:761`, "jump types 8-11 (`FUN_00587f50` /
  `FUN_00587f10` = types 8/9 and 10/11)"); research 217 (`217-the-body-as-built.md:779-781`, the jump's and the
  knock's actions in the resolution); research 218 (`218-the-permission-as-built.md:54`, the jump and the landings in
  the gate).
- **body+0x534 as the current motion's top id:** research 180 (`180-c2-movement-body-camera.md:368`) and research 215
  (`215-emplaced-weapons-as-built.md:2264`, read through `FUN_00577e40`).

This note re-derives none of them. **What it adds:** the r0004-only use of the two tests in the body's cell update.

### 25.6 In plain words, the consequence, and the port

**CORRECTED IN s25.10 (2026-11-12, after the lane closed): the plain words below ("each time the locally driven
human's body enters a new walkable cell while its current action is a jump's launch, fall, landing or hard landing,
its trail is emptied") are contradicted AS WORDED by the rig's scenario D: the trail emptied one frame after the jump
BEGAN, with the body still in its starting cell. The reading's own condition stands (the append runs on "the cell
changed, OR bit 6 of body `+0x1061`").**

**2026-11-12 -- CORRECTED IN research 404 s27.3:** the what-if has run.

**In plain words.** In a network game, each time the locally driven human's body enters a new walkable cell while its
current action is a jump's launch, fall, landing or hard landing, its trail is emptied.

**The consequence** [INF]: online, the original's follower is on the fallback arm -- and so on r4 0x594dd0's step
(s20) -- after its leader jumps or drops, until three new cells are walked and the trail gives a cell again. Whether
the traced leader jumped or dropped is not known: the trace had one placement of the leader before the order, "and a
body placed above the floor lands" (research 404 s24.6). The existing capture is not on this host, so whether it holds the
leader's action id or trail count was not determined here; the reads of research 404 s15.6 (the addition) would show it.

**The port** (departure 9, the head). The port's leader trail is written in one place, `extraction.ts:737-748` (the
add at `:746`), through `FollowTrail.add` (`hostageFollow.ts:133-140`). Neither has any term for the leader's jump or
landing. Searched: `packages/match/src` for `FollowTrail`, `trails.`, `trail.add` and writes to a trail's `points`
(`unshift`, `splice`, `length =`): the writers are `hostageFollow.ts:136-139` (inside `add`), and the deletes
`extraction.ts:642`, `:748`, `:1088` and `:1108` (the last re-keys a trail); and `extraction.ts` and `hostageFollow.ts`
for `jump`, `land` and `airborne`: none on a trail's path. **The port never empties the trail.** A departure by
reading (two readers of the 26 words), effect not run; a what-if is running.

### 25.7 An enable of the trail that the decompilation does not show (the second reader's addition) [V4; V1]

**2026-11-12 -- CORRECTED IN research 404 s26:** its caller read.

r4 0x59d980 ends in a tail jump into the trail's enable:
- r4 0x59d98c `addiu a1,zero,1`, r4 0x59d990 `swc1 $f0,304(a0)`, r4 0x59d994 `sw v0,232(a0)`, r4 0x59d998 `lw
  a0,4(a0)` (the controller's own body), r4 0x59d99c `j 0x54b7a0` (0x08152de8), r4 0x59d9a0 `addiu a2,zero,75`
  (0x2406004b) in the delay slot;
- r4 0x54b7a0 is `FUN_00546c40`'s twin (40 words, 38 identical, 2 relocated): the enable, with 1 and capacity 75;
- r4 0x59d980 is slot `+0x40` of the CSealCtrl, CRemoteCtrl and CSealCtrlCopy vtables (the words r4 0x668e70, r4
  0x668f50 and r4 0x432ba0 hold it).

**r0001 has the same tail jump** [V1, this author]: r1 0x597e80-0x597ea0, the same nine words but the constant's
offset and the jump's target (`j 0x546c40`, 0x08151b10), held by the words r1 0x6694f0, r1 0x6695d0 and r1 0x406310.
No function at r1 0x597e80 is in the decompilation's text (searched), and the text shows two calls of the enable
function only: D:L509301 (switch on, 75) and D:L509398 (switch off, 0, 0x32).

**UNREAD:** who calls slot `+0x40`, and when. It could change research 404 s24.3's premise "the trail is empty at the first follow
of the session", which rests on the two calls the text shows; that premise is [INF] until it is read.
**Read 2026-11-12, later, by one reader (research 404 s26):** the body build calls it; the premise does not hold for a CSealCtrl
leader.

### 25.8 The body's vtable (the second reader's addition) [V4]

The function is reachable only through the CZSealBody vtable: the one data word equal to r4 0x5be100 is r4 0x668b68,
slot `+0x48` of the vtable r4 0x668b20, whose type-info record (r4 0x65c2e8) names "CZSealBody" (checked here). That
is the word the recipe finds bodies by ("first word r4 0x668b20", research 404 s15.6).

### 25.9 Not determined

**2026-11-12 -- CORRECTED IN research 404 s26:** slot `+0x40`'s caller read.

- who calls the controllers' slot `+0x40` (s25.7), and when; **read 2026-11-12, later, by one reader: research 404 s26;**
- what r4 0x5e9260 maps (the second compare of r4 0x57d220);
- whether the traced leader's action id was ever 8-11 between the order and the top;
- whether RAM equals the served ELF.

### 25.10 After the lane closed: the rig's scenario D, which term it was, and the r0004 twins (2026-11-12) [measured, n = 1 (the rig, relayed); one reader for the term and the twins; the r0001 lines re-read on the hub]

- **Measured (r0004, MP71, n = 1; the hub's record
  `agent-mail/evidence/v0420/fishhook-hostages/README.md`, "SCENARIO D", outside git).** A follow running, the leader
  running west, then a jump (state id 8). Before it: the trail held 7 entries, the goal in state 7 with [G+0x78] = 1.
  Per frame: at jump -0.033 s the trail 7, state 2; at +0.000 the trail 7, state 8; at +0.033 s the trail is EMPTY (0 entries), state 8, the body
  STILL in its starting cell (213,88). The trail stayed 0 through four new cells crossed
  in the air, the landing (+0.697 s, state 10) and about six seconds of standing; no entry was appended in states 8,
  10 or 1. One second after the landing: the goal in state 3 with [G+0x78] = 0, the FALLBACK ARM, its target cell #0
  (207,90).
- **In plain words, as measured:** online, a jump empties the local human's trail within a frame of the jump
  beginning, in the cell he jumped from, and nothing is appended while the body is in its jump and landing states; the
  follower then takes its fallback target. LATER 957's row carries this wording.
- **Which term of the condition (one reader of the r0001 text on the lane; the two cited stores and the test re-read
  on the hub).** The cell update reaches its append when the cell changed OR bit 6 of body `+0x1061` is set
  (D:L471307-471325; the test at D:L471309), and the 26 words sit straight after the append in that branch. THE JUMP'S
  LAUNCH SETS THAT BIT: `FUN_0057e1b0` (header D:L440776) requests action 8 (`FUN_00588bc0(body, 8, 6, 0, 0xd)`) and
  at D:L440838 stores bit 6 of `+0x1061` from that request's result; `FUN_00551ec0` (header D:L418465) clears it at
  D:L418491, near its top (a one-tick mark; its callers not traced); the body's constructor `FUN_00553ea0` clears it
  at D:L419793. Of 57 stores to that byte in the r0001 text, three touch bit 6 (the reader's count, re-made by the hub's reviewer). So the launch tick sets the bit, the next cell update appends in the UNCHANGED cell, and online the 26 words
  empty the trail there: the rig's "trail 0 at jump +0.033, the body still in its starting cell". This closes research
  333's "the forced add of body+0x1061 bit 6: its meaning is unread".
- **The r0004 twins (one reader on the lane; re-read in both ELFs by the hub's reviewer, who also scanned each build for bit-6 stores and found three sites in each).** The bit-6 store at the jump's launch
  (r4 0x583858-0x583870, seven words identical to r1 0x57e4f8-0x57e510; bit 6 := the action-8 request's result
  non-zero, so a FAILED request clears it) and its clear (r4 0x557108-0x557114) are present and unchanged in r0004,
  which has no extra setter or clearer of bit 6 (three sites in each build). What r0004 changed in that function is
  the GATE BEFORE the action-8 request, which is research 385's ground (its P4 to P7; the r0004 plan's R4B-14). A
  second requester of action 8 with no bit-6 store exists in both builds (r1 0x5881dc in `FUN_005880e0`, the call at D:L445775; the function's header is D:L445738).

## Review on the hub (2026-11-12)

A fresh reviewer on the hub, who did not write this note and saw none of the sessions behind it, re-read it at the
sources on the hub. No test or tool was run. **Verdict: PASS WITH FINDINGS, high confidence.** Nothing is wrong in any
claim a fix would rest on; the findings are citation and wording defects.

**What it re-read, kinds apart.** *r0004 bytes:* the eight inserted words at r4 0x602f34-0x602f50 and their
neighbours; all 96 words of r4 0x594dd0 (one store through a2, at r4 0x594f28, behind a guard; the 0.2 step; the
callback r4 0x595110, 48 words; the acceptance test r4 0x5952e0, which masks the class with 0x701 and so refuses
classes 0, 8, 9 and 10); the 26 words at r4 0x5be350-0x5be3b4 decoded one by one, the four retargeted branches, the
five callees, the vtable slots and both tail jumps; the bit-6 store and clear of s25.10. *r0001 bytes:* the
counterpart blocks, word for word where the note says they are identical. *Decompilation:* the fallback arm
(D:L508699-508719), the inline walk in `FUN_0058f230` (D:L450097-450108), the walk `FUN_00537400`, and every line
s25.10 cites; the count of 57 stores to `+0x1061`, three touching bit 6, re-made. *The port's source:* every
`hostageFollow.ts`, `hostagePath.ts` and `extraction.ts` line cited in s20.7 and s25.6, on this branch: they hold.
*The rig's record:* the scenario D section.

**Findings.**

- 1, MEDIUM, s20.5: the walk's line citations are early at this decompilation (the behaviour is right at the nearby
  lines). "Refuses at once (D:L403056-403070)": the test is D:L403061-403073. "The centre (D:L403079-403085)":
  D:L403084-403090. "The same sub-map (D:L403158)": the id is stamped at D:L403161. "The callback (D:L403181-403202)":
  D:L403185-403208. "No record (D:L403198-403200)": D:L403203-403205. "One last sample at t = 1 (D:L403207-403209)":
  D:L403217-403221. A banner at s20.5's head points here.
- 2, LOW, s20.1: "G+0xa4..0xac (D:L508606-508608)": the three copies are D:L508608-508610.
- 3, LOW, s25.1: "the image of D:L471325's `+0xe1` test": line 471325 is the closing brace of the `+0x105e` block; the
  `+0xe1` test is D:L471326.
- 4, LOW, s25.10, folded: D:L445738 is `FUN_005880e0`'s header; the second requester's call is D:L445775.
- 5, LOW, s25.10, folded: the measured bullet said a little more than the rig's record ("by raw and by recorded cell"
  and "the leader's console" are not in the scenario's lines) and left out "state 2" at -0.033 s.
- 6, LOW, s20.7 and s20.8: "the 26 words at r4 0x5be350-0x5be3b8" still carries the old end in two places; 0x5be3b8 is
  the first word AFTER the insertion, and the end is r4 0x5be3b4, as the banners and s25 say.
- 7, LOW, folded: the head undercounted what is measured (s25.4's classes and the rows from research 404 s31 and s32,
  beside s25.10). The headings of s20 and s25 still read "a second reader pending" and "NOT measured"; their banners
  and later subsections carry the corrections.
- 8, LOW, s25.3: "the clear is unconditional" is an inference, not shown at the source: the store `+0x80 = 4`
  (D:L392532) sits on the arm taken only when the capacity changes (D:L392524), and `FUN_00527310` empties the trail
  only when `+0x80` is not 1 to 3 after the cancel. The rig's one run agrees with the emptying.

**A limit on "read twice".** The lane's second readers (its review9, review11, review13) and its comparison table are
scratch files on the lane's machine, outside git, and were not available to the hub's reviewer: every "read twice" in
this note rests on them. Where the hub's reviewer re-read the same bytes itself -- all of section 20's insertion and
function, and all of section 25's 26 words -- the claims hold, so for those the hub is an independent second reader.

**Not checked.** The comparison table's word counts (s20.8) and its action-object offset rows; the map loader's block
(s20.12) and the correction's gate block (s20.13); the class names behind the vtable words (s25.4); five of section
20's about 47 line citations (D:L157310's context, D:L385318, D:L396307-396308, D:L397275, D:L397225-397428).

**Found after this review, by the hub's own scan (2026-11-12), and folded.** Research 418's reviewer found that the
split had turned a bare "s14" meaning research 334's into "research 404 s14". A scan of all four notes for the same
mistake found five more, all in s20.9 of this note, where the lane listed sections of research 391 and research 193
after naming the note once: "research 391 s2.10 ..., s2.11 ... and s6.1", "research 391's (s2.9, s2.11)" and
"(research 193 s12.8)" had each been given "research 404". They read as the lane wrote them again. The scan's rule (a
qualified reference that follows another note's name in the same sentence, or opens a line whose previous line ends
with one) found no other case in the four notes; it is a scan, not a proof.
