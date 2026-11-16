# 419 -- What the decompiled text omits: lost jump tables, "unreachable" blocks, unrecovered functions (LATER 956)

- Date: 2026-11-12. Sections 22.9 and 22.12 of the multi-title lane's one note on Fish Hook's hostages (research 404
  as written on `agent/xs-cells` 41f1aa4fdb9f), brought to `main` by the hub's split, with pointers to the instances
  that live in the other three notes; the two sections' text is the lane's.
- Track: **simulation track's ground** (what "re-read at the source" rests on). No reader and no consumer is changed
  by this note. Its rule is HAZARDS, "sources and citations": a reader of a function that holds a "Could not recover
  jumptable" warning reads the table's words in the ELF and each target, or says it did not.
- Sources: the r0001 game ELF and its decompilation (`socom2_game.elf.decomp.c`); the r0004 served ELF for the twins.
  The evidence tags [V1], [V4], [D] are research 404's.
- **Review on the hub: PASS WITH FINDINGS, high confidence** (2026-11-12, a reviewer on the hub who did not write it;
  five LOW findings, each folded or recorded in the section at this note's end). The note was written on the lane's
  own machine; with this review its claims count as **readings**, at the level each states, except where the review
  section says a thing was not checked.

**Where each section lives (the hub's split, 2026-11-12).** The four notes were written as ONE on the multi-title lane
(`agent/xs-cells` 41f1aa4fdb9f, documents only) and keep that note's section numbers, so a reference "s25.6" means the
same section whichever note cites it: sections 20 and 25 are research 417 (r0004's two online-only steps; LATER 957);
section 22 is research 418 (the door markers and the walker's marker bodies; LATER 958), except 22.9 and 22.12, which
are research 419 (what the decompiled text omits; LATER 956); every other section, 0 to 33, is research 404 (LATER
933's landing). A reference to a section that lives in another of the four is written "research <n> s<m>"; a range
such as "s13-s20" is left as it was written.

## The three kinds of omission, and where each instance is read

The decompiled text is the project's reading copy of r0001, and it is not the whole program. Three kinds of omission
were met while LATER 933 was read, each shown from the bytes:

- **A switch whose jump table was not recovered: the case bodies are simply absent.** The text prints "Could not recover jumptable" and shows a bare `return` where the machine code jumps through the table (there is no return in the bytes); the cases' code is in the ELF. Shown on the walker `FUN_00567900`
  (D:L429547-429551; table 0x65c990, eight words): research 418 s22.1 (the warning), s22.2 (the table), s22.4 (the
  three bodies) and s22.5 (callees absent from the function's text). The text holds 26 such warnings; one is shown here and a second in the binder below, and whether the other 24 also leave bodies out was not checked.
  The table's first readers were research 200 section 3.1 and research 334 section 14.
- **A block the text lists as removed and "unreachable" that a table reaches.** The binder `FUN_002a8140`'s storing
  block (D:L150084, table 0x3f1340; the block at D:L149776): research 418 s22.10. The text holds 555 such warnings (554 distinct blocks); ONE is shown to be reachable, and the rest are not claimed to be.
- **A function the text never recovered**, reached only through a vtable: section 22.12 below (nothing at r1 0x597e40,
  0x597e80 or 0x597eb0 between `FUN_00597c00` and `FUN_00597f50`); the second of them enables a human body's trail:
  research 417 s25.7 and research 404 s26.1. So a callee's caller list taken from the text is a lower bound.
- **A fourth, smaller: a compare's signedness** the text shows wrongly: section 22.9 below.
- **How one of these was missed, and the withdrawn recipe:** research 404 s13.7; the standing branches re-read against
  the machine code: research 404 s23.

## Index

| s | subject | standing | level | build |
|---|---|---|---|---|
| 22.9 | WAIT's compare is unsigned | STANDS | read twice | r0001 |
| 22.12 | a third kind of omission: unrecovered functions | STANDS | one reader | r0001 |

### 22.9 The WAIT state's compare is unsigned in the machine code [V1; D] (2026-11-12)

WAIT (2) tests the route byte with r1 0x5fbb60 `lbu v1,128(s0)`, r1 0x5fbb64 `addiu v0,v1,-1` (0x2462ffff), r1 0x5fbb68
`sltiu at,v0,3` (0x2c410003) and r1 0x5fbb6c `bne at,zero,0x5fbbe0` [V1, this author]. That is an UNSIGNED compare:
a byte of 0 gives 0xffffffff, which is not below 3, so the goal falls through to the failure arm. The decompiled text
reads it as a signed test (`2 < byte - 1`) that would hold a route byte of 0 in WAIT (2) for ever; the machine code
does not. **One more place where the text misleads.** The same idiom is in `FUN_00527310`: r1 0x52731c `lbu
v0,128(a0)`, r1 0x527320 `addiu v0,v0,-1`, r1 0x527324 `sltiu at,v0,3` [V1, this author]. (The blind reader and the
fourth reader found both, research 404 s23.)

### 22.12 A third kind of omission: functions the text never recovered [V1; D] (2026-11-12)

The first two kinds are the lost jump tables (research 418 s22.1; the binder's, research 418 s22.10; the deciding seat counts 26 of them from
the decompilation's warning text) and the block listed as "unreachable" (D:L149776, research 418 s22.10). **The third: functions that the decompilation does not have at all.**
- **The list.** The decompilation's function list (`socom2_game.elf.functions.txt`) goes from `FUN_00597c00` (568
  bytes, so ending at r1 0x597e38) straight to `FUN_00597f50`. In the text `FUN_00597c00` begins at D:L454530 and
  `FUN_00597f50` at D:L454591, with no function between them. The names `FUN_00597e40`, `FUN_00597e80` and
  `FUN_00597eb0` occur nowhere in the text (searched by this author).
- **The bytes** [V1, this author, `t28/v.py`]: three functions lie in that gap.
  - r1 0x597e40-0x597e7c: `lui at,0x65`, `lbu v1,1688(at)`, a float clamp on the controller's `+0x13c`, `jr ra` at r1
    0x597e78.
  - r1 0x597e80-0x597ea0: the tail jump into the trail's enable (research 417 s25.7, research 404 s26.1): r1 0x597e8c `addiu a1,zero,1`, r1
    0x597e98 `lw a0,4(a0)`, r1 0x597e9c `j 0x546c40` (0x08151b10), r1 0x597ea0 `addiu a2,zero,75` (0x2406004b).
  - r1 0x597eb0 on: a prologue (`addiu sp,sp,-32`), then `jal 0x56dca0` and writes to the controller's `+0x171`.
- **An earlier note already had an address the text lacks:** research 317 (`317-bodies-and-drops-on-the-ground.md`,
  about line 311) names `CSealCtrl`'s method at r1 0x597eb0 (its slot `+0x60`, a reset of the controller's state).
  research 418 s22.5 records one more absent function, the goal's name function r1 0x5fdec0.
- **What it costs.** A search of the text for the callers of a routine misses these. The trail's enable at r1
  0x597e80 was found only from the bytes (research 417 s25.7), and that changed research 404 s24.3's premise (research 404 s26).

## Review on the hub (2026-11-12)

A fresh reviewer on the hub, who did not write this note and saw none of the sessions behind it, re-read it at the
sources on the hub: the r0001 decompilation, the r0001 ELF's bytes and, for one twin, the r0004 ELF's. No test or tool
was run. **Verdict: PASS WITH FINDINGS, high confidence.** The main claims hold; the five findings are wording and
precision, and none changes a conclusion.

**What it re-read, kinds apart.** *Decompilation:* both totals counted by their exact strings ("Could not recover
jumptable": 26 lines at 26 addresses; "Removing unreachable block": 555 lines, 554 distinct addresses); the two shown
functions' warnings and returns at the cited lines; no header and no mention of 0x597e40, 0x597e80 or 0x597eb0
anywhere in the text; the WAIT compare as the text shows it. *r0001 bytes:* the three unrecovered functions decoded
(each is code and they fill the gap); every instruction word sections 22.9 and 22.12 quote; both jump tables' eight
words; a scan of the whole file for the three addresses as data words and as `jal` / `j` targets (data words only, at
the vtable slots the notes name). *r0004 bytes:* the nine-word twin of 0x597e80. Every pointer into research 404, 417
and 418 lands on what this note says is there.

**Findings (all LOW).**

- 1, folded above: "555 such notes" could be read as 555 reachable blocks. It is 555 warnings, 554 distinct blocks,
  ONE shown reachable (the binder's 0x2a8c04, and that indirectly: the table's entry 0x2a8bf8 branches or falls into
  it).
- 2, folded above: "returns false" read as a boolean result; the point is that the text's `return` is untrue of the
  bytes (r1 0x567c54 is `jr v0`). Only two of the 26 warnings were looked at.
- 3, recorded, section 22.12's text unchanged: "`FUN_00597c00` (568 bytes, so ending at r1 0x597e38)" takes the
  function list's size literally; in the bytes the epilogue's `jr ra` is at 0x597e38 and its delay slot at 0x597e3c,
  so the code ends at 0x597e40. The conclusion is the same: the gap starts at 0x597e40.
- 4, recorded: section 22.12 cites the two neighbours by their signature lines (D:L454530, D:L454591); their `// ----`
  header lines are D:L454528 and D:L454589.
- 5, folded: the hazards row on this (HAZARDS, "sources and citations") named research 404 as its source; it now names
  this note first.

**Not checked.** Whether the other 24 jump-table warnings also drop bodies; whether any code forms the three addresses
by `lui` / `addiu` rather than holding them as data words; the r0004 site of the WAIT compare (section 22.9 makes no
r0004 claim).
