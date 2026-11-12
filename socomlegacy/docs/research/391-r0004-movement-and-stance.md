# 391 -- r0004's movement and stance, parts A-D: eleven items read, none ported; the contact model held (R4B-13, G4)

- Date: 2026-11-09. Task R4B-13 (parts A+B+C, then part D) of the [r0004 plan](../plans/r0004-option-b.md), under the
  owner's ruling OT.R97 (MISSION: r0004 is the specification for gameplay). Branch `agent/r4b-13` (base d3af57e31:
  JUMP-AIR's `agent/jump-air` ff0f41f6d merged with `agent/v0416-bundle` 52138bf61).
- Track: simulation. **It changes nothing the game does.** Items 3, 4, 5, 6, 8, 10, 11 and 16 (parts A+B+C) and items
  7, 9 and 15 (part D, the room's side) are read and filed here with the gap that keeps each one out. Two of item 15's
  three halves are r0004's outcome in the port already, with no change (§6). A draft of item 11's state-8 half and two
  change-free pins (items 6 and 16) were backed out at the first review's fold (§2.6-§2.8 say why). No code and no test
  changes, and no constant is named, so research 101 takes no row and the placeholder ledger is unchanged.
- The owner's bar for this task (Craig, 2026-11-09T01:45Z): "Do not fudge things you are not confident in. If you don't
  have a very high confidence in the change (that it is original and won't break our other systems, leave it as not in
  until that gap is closed)". An item is ported only when its r4 site and its r0001 counterpart read unambiguously, and
  the port's path for it is clear and cannot plausibly break another system (room authority, replays, bots, the Forge,
  the test room, JUMP-AIR's airborne readings, other maps). Everything short of that is in §2, with the gap and the
  evidence that would close it.
- Status: **reading** (R4B.R3; re-read by its fresh reviews, `agent-mail/evidence/r4b-w2/VERDICTS.md`, and the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09; items 1, 2 and 12-14 held, below). Nothing here is measured running. This note's author re-read every r4
  site below with capstone 5.0.7 in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE dump) **and** the served
  decrypt `game/r0004/served/socom2_game_served.elf`. No word differs over 0x586c00-0x587000, 0x558080-0x558600,
  0x54fa00-0x54fe00, 0x584d00-0x585100, 0x553b00-0x554200, 0x5ad600-0x5ad700, 0x5b5a00-0x5b5f80, 0x5b6b80-0x5b6c80 and
  the data 0x409cc0-0x409ce0. None of those ranges holds the dump's contaminated words (0x1e70cc, 0x2cc670/674). The
  r0001 counterparts were read in `game/disc/socom2_game.elf` and are cited as `FUN_<addr>` / `D:L<line>` of
  `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled text is pasted. Each site counts as a reading
  only once a reviewer who did not write it has re-read it (R4B.R4). The first review re-read item 11's site
  (r4 0x554090-0x554108 in both images; r0001 0x54f260-0x54f2c0, D:L417095-417108) and agreed with §2.6's reading.
  Part D (items 7, 9, 15) was read the same way, at 2026-11-09T04:35Z: no word differs between the two r4 images over
  0x554700-0x554f00, 0x5b2000-0x5b2400, 0x5b5200-0x5b5400 and 0x5b7200-0x5b7900; its r0001 sites were disassembled in
  `game/disc/socom2_game.elf` beside the decomp (0x5ac4a0-0x5ac5f0, 0x5af590-0x5af610). Its twins: r4 0x5b1e80 =
  `FUN_005ac1f0` (the call r4 0x5b5310 stands where r0001 0x5af5dc calls it), 0x54c600 = `FUN_00547aa0`, 0x54c5f0 =
  `FUN_00547a90` and 0x2b4f90 = `FUN_002b3580` (each aligned here against r0001 0x5ac5c0-0x5ac5e0); and, through the
  deep read's call map only, 0x5ad5b0 = `FUN_005a78d0`, 0x584cf0 = `FUN_0057f7d0`, 0x584f20 = `FUN_0057f9c0`, 0x2bbb30 =
  `FUN_002b9f60`, 0x2aaa00 = `FUN_002a9210`, 0x29f9e0 = `FUN_0029e4e0` and 0x5b7f80 = `FUN_005b1c80`.
  The second review of part D (2026-11-09) re-read item 9's whole function; its fold re-read r4 0x5547e0-0x555490 in
  both images (no line of the disassembly differs) beside r0001 0x54f7e0-0x550330, and §2.10 now holds every change
  found there. Review 3 (PASS, high; VERDICTS.md) re-read the folded §2.10, so item 9 is a reading.
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-movement-constants.md`. Its §0 gives the
  actor's +4 shift from `+0x133c` and the dynamics table at r4 0x44f5e0 (r0001 0x44c250). Its §1 table supplies the item
  numbers used below, and `scratch/movement-constants/d2_*.txt` holds the diffs. Also REPORT.md's row G4 and its
  corrections: dot corroborated G4 at the 5.0 -> 3.5 instruction level only, and the gameplay review gave "no verdict
  on all 16 items". Every r4 `jal` below is named by its r0001 twin through the deep read's call map, `fd2.py`
  (`code-diff/bmap.py`). The twins used are r4 0x57d220 = `FUN_00577e40` (is this type on the stack's top), 0x582e60 =
  `FUN_0057dc80` (leave the peek), 0x58a240 = `FUN_00584c10`, 0x58fd20 = `FUN_0058a720`, 0x5ad660 = `FUN_005a7980`,
  0x5bb370 = `FUN_005b4f30`, 0x5b52b0 = `FUN_005af590` and 0x5b69e0 = `FUN_005b0bb0`.
- **Where this note corrects the deep read** (the cluster note's wording, not its addresses):
  - item 4 is a per-frame rule, not a stance press's handling (§2.2);
  - item 8's refusal is wider than a weapon swap (§2.4);
  - item 11's posture 8 is the death landing's posture, not "carried" (§2.6);
  - item 16's `*(+0x2e8)+4` is the skeleton root's height over the feet, not a ground record (§2.8).

## 0. The answers

| # | r0004 (reading) | the port | this task | level |
|---|---|---|---|---|
| 3 | `FUN_005817d0`'s twin gains a default case: a state not 4/0/2 calls the actor's vtable +0x90 with 0, then takes the "from stand" case | r0001: a crouch press while peeking ends the peek, no transition (`PEEK_STANCE_ENDS_PEEK_READING`) | **not ported** (§2.1) | reading |
| 4 | where `FUN_00552ec0`'s outer gate refuses, the obstacle slot is cleared, and a SEAL in a prone peek is made to leave it (water over 2 deep; or when the controller's vtable +0x34 answers non-zero -- "a non-local controller" is an inference, not a reading: +0x34 is not read, §2.2) | r0001's: returns 0 | **not ported** (§2.2) | reading |
| 5 | `FUN_0054aa30`: a prone peek counts as prone; `FUN_0058a720`'s 3 is mapped to 2 under it (the prone size class) | the peek holds the mover: no segment pass runs during a peek | **not ported** (§2.3): no path | reading |
| 6 | the climb-contact store keeps no SEAL (research 385 §3) | the grid holds no body, so no SEAL is climbed | **not ported**: no change made, the pin backed out (§2.7) | reading |
| 8 | the two class-2 (ladder) climb starts refuse while `FUN_005a7980(actor, 1)` answers, and while type 0x2c is on top | a move holds the mover (the 0x2c half's outcome); `FUN_005a7980` not asked | **not ported** (§2.4) | reading |
| 10 | the slide's floor search: a walkable floor hit above the probe's bottom clears the slide speed | the port's slide has no forward search (its move snaps) | **not ported** (§2.5) | reading |
| 11 | the slide exit plays no landing in states 8, 9, 10 (r0001: 9, 10), nor with posture 8 on top; the slide speed is handed over in `$f12` (both builds) | a dead SEAL's exit plays `Land forward` again; the speed is handed over already | **not ported**: the draft backed out (§2.6) | reading |
| 16 | the knock-down landing completes when the skeleton root's height is at most `min(20, 4 / n_y)` (20 when `n_y <= 0`), two copies | the port's knock lands on the floor's contact, with neither build's root gate | **not ported**: the pin backed out (§2.8) | reading |
| 1, 2, 12, 13, 14 | the contact model (ledge probe 5.0 -> 3.5, stand-off 13 -> 12, anti-perch, steep-only contacts, resolve skips) | -- | **held by the owner** for a capture (OWNER-WORDS 2026-11-09): not touched | -- |
| 7 | the host's climbable-object handler (`FUN_005b1350`'s twin) gains a release request (type 4) and clears an occupant that no longer stands for a live actor before it grants; the client (`FUN_005b1570`'s twin) re-asks the two ladder starts when the grant arrives and sends the release when they refuse | the port has no climbable-object occupancy at all: each mover mounts a ladder on its own commands (`Traversal.touchLadder`), with no ask, no grant and no holder | **not ported** (§2.9): nothing to attach it to | reading |
| 9 | the online push-apart between SEALs (`FUN_0054f7e0`'s twin) skips a climbing SEAL unless "Step up" is on top, skips type 0x23 on top, and when the state `+0x174` is 2 (prone) or type 0x13 or 0x19 is on top, is pushed only by a prone or state-8 body, keeps a push only against the velocity `+0xf44` (the velocity zeroed, the depth capped at 1) and drops one along it, and floors the second site's velocity dot at -1 with the velocity zeroed; unflagged, the first site's depth is capped at 6 (new at that site); both cases remove the push's component from `+0x1354` at the first site (r0001: the second site only) | the port has no push-apart between SEALs in either build's form: its bodies pass through each other (LATER 711) | **not ported** (§2.10): the push-apart itself is not built | reading |
| 15 (landing) | `FUN_005af590`'s twin lands when its timer is out **or** in a network game | the port's mover lands every time; nothing reads the timer | **already r0004's** online, no change (§6.1) | reading |
| 15 (AI) | `FUN_005ac1f0`'s twin: in a network game an AI controller (vtable +0x30) returns class 0 after the sound: no damage, and the landing's clip is class 0's | the port's hostages take no fall damage (they never reach `fallDamage`) but their landing clip is still classed; the port's CPU seats (an adaptation) take fall damage as players | **not ported** (§2.11) | reading |
| 15 (credit) | `FUN_005ac1f0`'s twin: a fall death's killer online is the faller (`actor+4`); offline still the local player | the room counts a fall death the faller's own: `kill(p, null, ...)`, the faller's -2 and a suicide | **already r0004's**, no change (§6.2) | reading |

## 1. What changed

Nothing in the game. The branch holds this note, PROCESS's research range, and the HANDOFF claim and its release
(parts A+B+C). Part D changed this note only: it touched no hot file, so it took no HANDOFF claim. r0001's readings
stand as filed (`PEEK_STANCE_ENDS_PEEK_READING`, research 86, research 217 §3.1, research 201 §27.3).
Nothing is replaced, so R4B.R6 asks for no re-filing.

## 2. Not ported -- each gap and what would close it

### 2.1 Item 3: a crouch press while peeking

r4 0x586da8-0x586dd4 in the twin of `FUN_005817d0` (r0001 D:L442479-442524, cases 4, 0 and 2 only): a state not 4, 0 or
2 calls the actor's vtable +0x90 with 0 (0x586dc0-0x586dcc), sets the argument to 0 (0x586dd0) and falls into the
"from stand" case (0x586de4 -> 0x586e38: clip 0x12, then 2 or 0x14 by speed with vtable +0x90 again, or 0x11). The
reading of the new case itself is unambiguous. It is not ported because:
1. **The path that hands `FUN_005817d0` the peek's state 3 is not established.** The crouch press (`FUN_00594cf0`,
   D:L453351-453425) writes the request `+0x374` only; the per-frame applier `FUN_00552d60` (D:L418867-418912, called
   D:L418606-418611) asks `FUN_00552ec0(actor, +0x374)` first, whose crouch branch (D:L418952-418994) returns 1 only
   from state 0, or from 2 under its own tests, and returns 0 from state 3 (r4's twin keeps that: its additions in
   that branch, 0x5583a4-0x5583d8, are for states 0 and 2 online). `FUN_00581990` has six other callers (D:L438418,
   D:L442473, D:L442708, D:L442765, D:L442875, D:L443491, D:L443870); which one a crouch press mid-peek reaches is not
   read. This also bears on the r0001 reading the port holds: research 217 §3.1 has the crouch press reach
   `FUN_005817d0` with state 3; this read could not find that path through `FUN_00552ec0` (a finding for its reviewer,
   not a change: `PEEK_STANCE_ENDS_PEEK_READING` stays as filed; the doubt is filed beside that name in research 101's
   ledger row, DOCS-A1 2026-11-10).
2. **vtable +0x90's effect is not read.** `FUN_00581ed0` calls it with the asked stance and then still branches on the
   old `+0x174` (D:L442696-442697), so it is not a plain write of `+0x174`; the cluster's "set stance 0" is an
   inference.
3. **The default catches every state but 0, 1, 2 and 4** (the press's caller already excludes 1, D:L442560): not the
   peek alone.
4. In a crouched peek it would play a stand-to-crouch transition from a crouched body (clip 0x12 first); whether that
   is what the original shows is unmeasured.
Closes it: the r0004 call chain from the crouch press to `FUN_005817d0` with state 3 traced (r4 twins of `FUN_00594cf0`,
`FUN_00552d60`, `FUN_00581990`), vtable +0x90 named, and a PCSX2 `--build r0004` capture of a crouch press mid-peek,
standing and crouched (`+0x174`, `+0x375`, the top type `+0x534` per frame). R4B.R6: nothing replaced, so
`PEEK_STANCE_ENDS_PEEK_READING` (research 86, research 217 §3.1) stays r0001's, filed.

### 2.2 Item 4: the prone peek where the stance applier's gate refuses

r4 0x5580c0-0x558184 in the twin of `FUN_00552ec0` (r0001 D:L418914-418930: where the outer gate -- the top entry's flag
0x40 or `FUN_00588080` -- refuses, return 0). r0004 there: clears the obstacle slot (`FUN_005b0bb0(actor, 0)`'s twin,
0x5580c4), and when `+0x174` is 3 and the top is "Prone peek left" or "right" (anim ids at r4 0x409cd0/0x409cd8, r0001
`DAT_003deb00/08`): if the controller's vtable +0x34 answers 0 and `FUN_00584c10` answers 0 -- the SEAL in water over 2
deep (`FUN_00584c10` D:L444022-444031: the in-water bit `+0x105e` bit 7 and `+0xf88 > 2`) -- it writes the request
`+0x374 = 1`, leaves the peek (`FUN_0057dc80`'s twin) and returns 1, so `FUN_00552d60` then applies a crouch; if vtable
+0x34 answers non-zero it leaves the peek unless `+0x374` is 2, and returns 1. `FUN_00552d60` runs every frame
(D:L418606- 418611, unless the top's posture is 8), so this is **not a stance press's handling** (the cluster's reading)
but a per-frame rule. Not ported: vtable +0x34's meaning (it also gates `FUN_0057f7d0`, D:L441506-441509) is not read -- §0 row 4's and §6.2's
"non-local controller" for it is an inference from where it gates (here, and the queued blast ray's online return in
`FUN_005ac070`, D:L464826-464834), not a reading;
whether a prone peek's top fails the outer gate is not read (its type's flag 0x40, `FUN_00588080`); the obstacle-slot
clear runs on every frame the gate refuses, in every state -- a contact-model effect beside the owner's held items 13
and 14; and the port's peek has no water-forced stance. Closes it: vtable +0x34 named; the prone peek types' flags read
off motion.rdr; a PCSX2 `--build r0004` prone peek held as the water rises past 2 (or a remote SEAL's prone peek, if +0x34 is what the
inference takes it for),
`+0x174`, `+0x374`, `+0x1120` per frame.

### 2.3 Item 5: the prone peek's size class

r4 0x54fc4c-0x54fc7c in the twin of `FUN_0054aa30` (r0001 D:L415100-415133): the "prone" flag (r0001 `bVar5`: ... or
state 2, D:L415108-415109) is also set when "Prone peek left" or "right" is on top, and 0x54fd48-0x54fd6c maps
`FUN_0058a720(actor, 1)`'s answer 3 to 2 under it, so the class is the prone (8.0, 6.0) (r0001's answer 3 fell to the
default 3.5 / 19.1, D:L415116-415118). The same flag also skips the block at 0x54fc90-0x54fd1c and sets the prone turn's
flag when `+0x48` is not 0 (0x54fd20-0x54fd40). Not ported: **no path** -- the port's peek owns the walker's tick
(`Traversal.owns`: the peek held), so no segment pass runs during a peek in which the size class could act; and the rest
of r4's `FUN_0054aa30` (+89/-19 instructions) is unread in full (the cluster's §2). Closes it: the twin read whole, a
segment pass during a held peek built (its own task), and a capture of a prone peek beside a wall on r0004.

### 2.4 Item 8: the ladder starts' refusals

r4 0x584d50-0x584db8 and 0x584f80-0x584fe8, the twins of `FUN_0057f7d0` (D:L441495-441530) and `FUN_0057f9c0`
(D:L441576-441607) -- the class-2 (ladder, appflags `>> 4 == 2`) starts `FUN_005b2620` asks by the climb's height
(D:L468440, D:L468447; the cluster's "climb starts" are these ladder starts): each adds a refusal while
`FUN_005a7980(actor, 1)` answers (0x584d50-0x584d68; 0x584f80-0x584f98) and while type 0x2c is on top
(0x584da0-0x584db8; 0x584fd0-0x584fe8). 0x2c is the ladder's own clip (`FUN_0057f880` pushes 0x2d then 0x2c in state 5,
D:L441545-441548), so that half refuses a ladder start during a ladder climb; the port reaches its ladder touch
(`Traversal.touchLadder`) only when no move holds the mover (`step`'s switch returns first), so the port seems to have
that outcome already (source inspection only; not pinned, not reviewed). The other half is not ported:
`FUN_005a7980(actor, 1)` (D:L462471-462508) answers for `+0x5e1` bit 4, for types 0x35, 0x36, 0x37 and four named types
on top (`DAT_003df0e0`, `0e8`, `108` "Stand -> Turret", `110`), and for three upper-body types in the slot `+0x1e4` --
wider than "a weapon swap" (the cluster's label). The page's `Traversal` has no answer of it; the room holds some of its
terms (match `room.ts`'s swap and launcher gates), so a port needs one answer shared by page and room, and it touches
the ladder start R4B-14's reservation changes. Closes it: `FUN_005a7980`'s terms mapped onto the port's actions (each
type named off motion.rdr), the answer built once for page and room, and a PCSX2 `--build r0004` ladder pushed into
mid-swap.

### 2.5 Item 10: the slide stops on a walkable floor ahead

r4 0x553fb0-0x553fe8, after the slide's floor search in the twin of `FUN_0054edf0` (r0001 D:L417164-417194: the search
from the feet along the frame's displacement times k, k from 1.0 by 0.1 under 10, `FUN_005b4f30` each step; r4 the loop
0x553e60-0x553f1c): with a hit (`$s4`), the floor's y `$f23` (the hit's +4 plus the per-type +0x38, 0x553f54-0x553f68,
as r0001 D:L417186) above the value at `($s2)` (the probe's bottom y, written at 0x553ebc-0x553ed4), and the hit's +0x14
over 0 and over the dynamics table's cos(max_slope) (r4 0x44f5f8): the slide speed `+0x1344` is set to 0. Not ported:
the port's slide has **no forward floor search** (`slideOrMove` moves and snaps, standing in for `FUN_005b4f30`,
research 201 §27.3), so there is no hit to test; the hit record's +4 and +0x14 are read as the floor's y and normal y by
inference (`FUN_005b4f30` not read); and the effect is not small -- the speed cleared on the frame the search meets a
walkable floor leaves the next frame's exit (§2.6) at speed 0, so the exit landing steepSlide.test.ts pins ("leaving
onto gentler ground faster than land_fall_rate is a landing") would mostly not play from a slide onto walkable ground.
Closes it: `FUN_005b4f30`'s record read; the search built into the port's slide (its own task, with the exit's tests); a
PCSX2 `--build r0004` slide onto flat ground, `+0x1344` per frame and whether `Jump land` plays.

### 2.6 Item 11: the slide exit's landing skips (state 8 and posture 8)

**The reading.** The slide exit sits in the twin of `FUN_0054edf0`, at r4 0x5540a8-0x5540fc (r0001 0x54f278-0x54f2b4,
D:L417102-417105). The exit runs when the floor no longer slides (r4 `FUN_0054f330`'s twin answers 0) and the slide
speed `+0x1344` is over the dynamics table's +0xc. The speed's r0001 offset is `+0x1340` (the +4 shift); the threshold
is r4 0x44f5ec, r0001 `DAT_0044c25c`, which is the port's `land_fall_rate`. There:

- r0001 calls `FUN_005af590` unless `state - 9 < 2` unsigned, that is unless the state is 9 or 10 (0x54f294-0x54f29c).
- r0004 skips the call when `state - 8 < 3`, that is in states 8, 9 and 10 (0x5540c4-0x5540cc). It also skips it when
  the top entry's posture byte `+0x2b` is 8 (0x5540d4-0x5540e4).
- Either way the speed is cleared (0x5540fc; r0001 0x54f2b4).
- Posture 8 is the death landing's: `FUN_005af590` pushes `Land forward` with posture 8 and then sets state 8,
  D:L466690-466699. The cluster's "carried" label does not fit.
- **The speed handed over** (the cluster's "passes the speed") is not an r0004 change. r0004 loads the slide speed into
  `$f12` before the call (0x5540ec). r0001 loads it into `$f12` for the compare (0x54f27c) and writes nothing to `$f12`
  before the call (0x54f2a4). So both builds hand `FUN_005af590` the slide speed, and the port's `land` already passes
  it (`slideExit`).

**The draft, backed out.** The draft made `Walker.slideOrMove` (viewer `mover.ts`) skip `land` when the walker is dead
(`Walker.dead`). Its viewer test showed a dead body sliding off a steep face playing no `Land forward`, with an alive
control. The first review re-read the site in both r0004 images and found the reading holds. It kept the change out of
this task for the owner's bar:

1. **That the port's `dead` is r0004's state 8 and nothing else is not established.** `FUN_005af590`'s state-8 branch
   (D:L466696) suggests it, but nobody has traced which other paths set state 8, or whether a SEAL the port does not
   mark dead (the offline fall death that gets up, `DEATH_LANDING_GETUP_PLACEHOLDER`; a knock) can be in state 8.
2. **The effect on the room, replays and bots is not shown.** Page and room run the one `Walker`. A dead body's slide is
   folded into replays (`REPLAY_CORPSE_LANDING_READING`, research 276 §5) and seen by bots. No test showed the change
   leaves those paths unchanged.
3. The posture-8 half has no path at all: the port's actions carry no posture byte, and which of its actions (an
   offline `landDeath`, a blast's falls) stand for posture 8 is not mapped one to one.

**What would close it:**
- r0004's state-8 writers traced and mapped onto the port's `dead`;
- the posture-8 types listed off motion.rdr and mapped onto the port's actions;
- the change run through the room's and the replay fold's tests with a dead body on a steep face;
- best of all, a PCSX2 `--build r0004` capture of a SEAL killed on a steep face, showing whether `Land forward` plays
  twice.

### 2.7 Item 6: no climb onto a SEAL

**The reading.** r4 0x5b6bc4-0x5b6bd4 is the twin of `FUN_005b0d30` (D:L467394-467420; research 385 §3 read it at the
same site, and it was served-checked here over 0x5b6b80-0x5b6c80). It casts the hit's node to `CSealEx` and stores no
contact for a SEAL. The climb planner reads that contact, so r0004 plans no climb on a SEAL, where r0001 stored any hit.

**The port.** Its collision grid holds the map's polygons alone (research 217 §7.1), so a body is never a contact. That
matches r0004's outcome with no change; the bodies passing through each other is the port's own (LATER 711).

**Why it is not filed as already r0004's.** A room test was drafted to pin the outcome: a SEAL standing, then prone, in
the walk's path with the action button pressed on every command, with roomClimb.test.ts's 12-high crate as the control.
It was never run, because the host's one test slot stayed held, and it was backed out at the fold. The first review
also did not re-read the r4 site.

**What would close it:** a reviewer's re-read of r4 0x5b6bc4-0x5b6bd4 against `FUN_005b0d30`, and the pin committed
and run green.

### 2.8 Item 16: the knocked-down landing's gate on a slope

**The reading.** r4 0x5b5ac8-0x5b5b24 and its copy 0x5b5ec8-0x5b5f24 are the twins of r0001 `FUN_005af930` (D:L466839
and D:L466932).

- r0001 completes the knock landing when `*(actor+0x2e8)+4 <= 4.0`. `actor+0x2e8` is the skeleton root node, and `+4`
  is its height over the feet (mover.ts's `actor+0x2e8 -> +0x04`; the cluster called it a ground record).
- r0004 compares that height with `4 / n_y`, capped at 20 (0x5b5b04-0x5b5b1c), and uses 20 when `n_y <= 0` (0x5b5afc).
  `n_y` is the slide normal's y at r4 `+0x134c` (r0001 `+0x1348`, the +4 shift; the slide's own `1 - n_y` reads the same
  field at r4 0x553de4).
- So on a slope the gate opens with the root higher.

**The port.** Its knock (`Walker.knock`) is airborne and lands on the floor's contact (`land`: `Fall forward` ->
`landDeath`, `Fall backwards` -> `landBackwards`). It has neither build's root-height gate, flat or sloped. Its
landing's timing is therefore not r0004's on either kind of ground, and calling its slope outcome "r0004's" would
overstate it. The drafted pin (a knock onto a 40-degree slope lands `landDeath`) was never run and was backed out at the
fold. The first review did not re-read either site.

**What would close it:**
- the gate itself built: the skeleton root's height over the feet in the port's knock, and both builds' compare;
- its own task, with a reviewer's re-read of the two sites;
- a PCSX2 `--build r0004` knock onto a slope, with the root height and the landing's frame per frame.

### 2.9 Item 7: the climbable object's holder freed, and the release request

**The reading.** The host's handler is r4 0x5b7200-0x5b763c, the twin of `FUN_005b1350` (D:L467638-467688). Its object
is looked up by id (`FUN_002a9210`'s twin over the table at r4 0x4446f4); the object's `+0x1c` is a count and its
`+0x20` the holder's id; the actor's `+0x1062` names the object it holds.

- r0001 has one path: when the actor already names this object in `+0x1062` (D:L467655), or names none (the float
  compare with `DAT_003f3438`, D:L467660) and the object's count is under 1 -- with the AI controller's extra test
  (vtable +0x30, then +0x38's `+0x3f4 == 7` and `+0x448 & 7`) -- and the holder is empty (`DAT_003effb0`, D:L467681), it
  takes the holder and grants (`FUN_002b9e50`, D:L467683).
- r0004 adds a request type 4 first (r4 0x5b723c-0x5b7334): when the object resolves and its holder is this actor's id
  (0x5b7258-0x5b7260): when `+0x1062` already holds the empty value (the float at r4 0x41eb18, the compare at
  0x5b729c-0x5b72a8) the next two steps are skipped; otherwise the object `+0x1062` names is looked up again
  (0x5b72b8) and, when found, that object's count is lowered by 1 (0x5b72c8-0x5b72d0) -- no ownership test -- and
  `+0x1062` is set to the empty value (0x5b72d8-0x5b7320); either way the holder is set empty
  (r4 0x41b360, 0x5b7328-0x5b7334). Nothing is granted on that request.
- r0004 also clears a stale holder before its grant (r4 0x5b7450-0x5b74c4), under the same eligibility r0001's grant
  asks (0x5b7340-0x5b744c): a holder that is not empty is looked up (`FUN_0029e4e0`'s twin over r4 0x442ce8) and kept
  only when it is this actor, or when its `+0xf7a` is 1; anything else -- a holder found with `+0x10` not 2, or one not
  found at all -- is cleared, and r0001's grant follows unchanged (0x5b74c8-0x5b7618). The cluster's wording ("flagged
  gone (`+0xf7a`)") reads the byte the other way: a holder is **kept** while its `+0xf7a` is 1. With a holder that is
  not found, r4 0x5b74a8 reads `+0xf7a` off a null base; what that read gives on the console is not read.
- The client's side is r4 0x5b76d0-0x5b79e8, the twin of `FUN_005b1570` (D:L467709-467775). Where r0001's grant mounts
  the ladder at once (`FUN_005b1c80`, D:L467724), r4 first asks the two ladder starts again (`FUN_0057f7d0`'s twin at
  0x5b789c, `FUN_0057f9c0`'s at 0x5b78bc, chosen by the request's byte 9) and mounts (`FUN_005b1c80`'s twin, 0x5b78ec)
  only when the start answers; else it falls to 0x5b7900, which drops the actor's own hold (count down, `+0x1062`
  emptied) and calls `FUN_002b9f60`'s twin (0x5b79c0). A send of type 4 is r4 0x5b785c (`FUN_002b9f60`'s twin with
  `$a1 = 4`).

**The port.** It has no climbable-object holder at all. Each mover mounts a ladder on its own commands
(`Traversal.touchLadder`, viewer `traversal.ts`: the contact, the facing and the stick, then `mountBottom` /
`mountTop`); the room runs the same `Traversal` per player and asks nothing of a holder; there is no request, no grant
and no protocol message for one. The hostages' entry says so too (`Traversal.tickAi`: "Ladders require
mode7/reservation and are not started by this normal-mode entry"). Two SEALs can take one ladder at once in the port --
the r0001 grant's refusal is the gap, before r0004's freeing has anything to free.

**Not ported.** No base: r0004's change is a refinement of r0001's ask-and-grant, which the port has not built. Building
it means a holder per climbable object in the room, an ask before every ladder mount on the page and in the room (the
mount waits for the grant), the release, and the protocol to carry them -- a change to the room's authority, the page's
prediction, replays (a mount's timing) and the hostages' entry, far wider than this item. **What would close it:** a
task building r0001's holder first (`FUN_005b1350`, `FUN_005b14e0` D:L467690-467707, `FUN_005b1570`, the request's
sender and its bytes, the `+0x1330` / `+0x132c` fields) with the room's protocol additive; then r0004's type 4 and the
stale-holder clear on it, with `+0xf7a` and the null-base read settled (`+0xf7a` named; a PCSX2 `--build r0004` game: a
SEAL killed on a ladder and a second SEAL mounting it, `+0x1062` and the object's `+0x1c` / `+0x20` per frame). R4B-14's
plan row names "the room's ladder reservation" as a file to touch: no such reservation exists in the port (this read).

### 2.10 Item 9: the online push-apart's skips

**The reading.** r4 0x554808-0x5548d0, 0x554b58-0x554bb4, 0x554df8-0x554f0c and 0x5551c8-0x555224, in the twin of `FUN_0054f7e0` (D:L417351-417668, which
r0001 calls only in a network game, `DAT_0045a0c1`, D:L416574-416576). r0001's function pushes this SEAL off the other
SEALs near it (a radius of 6, 7 in state 1, 8 in state 2, x1.75 while `FUN_00286b80(+0x1160)` is over 0.05,
D:L417441-417453), the push laid on the body's velocity `+0xf44` (D:L417572); its climbing gate returns 0 in state 5,
posture 5 or with type 0x2e on top unless 0x2e's flag 0x20 test lets it through (D:L417426-417437).

- r0004 replaces that gate (0x554838-0x554884): when climbing (`FUN_005a78d0`'s twin, 0x554838) it returns 0 unless
  "Step up" is on top (r4 0x409e50, r0001 `DAT_003dec80` by the anim-id table's constant offset 0x2b1d0, which also
  maps r4 0x409cd0 / 0x40a2d8 to r0001 0x3deb00 / 0x3df108; research 251 names `DAT_003dec80` "Step up"); it returns 0
  with type 0x23 on top.
- It sets a flag (0x554888-0x5548cc) when the state `+0x174` is 2 (prone; 0x554894 branches straight to the store
  that sets it), **or** type 0x13 is on top, **or** type 0x19 is on top. The push is the horizontal direction to the
  other SEAL (its y zeroed at 0x554da4, normalised at 0x554ddc-0x554df0), scaled by the depth `$f20` (0x554d70).
  - Without the flag (0x554e68-0x554e88) the depth is capped at 6. That cap is **r0004's addition at this site**:
    r0001's first site goes from the depth (`sub.s` at 0x54fd68) through the normalise (0x54fdcc-0x54fdf0) to the
    scale and add (0x54fdf8-0x54fe28) with no compare against 6 between them (review of part D's fold, P2;
    `d2_0054f7e0.txt` marks 0x554e68 as added). An r0001-against-r0004 test pins no cap on r0001's side here.
  - Under the flag (0x554df8-0x554e64) the push direction is dotted with the velocity `$s3 = actor+0xf44` (set at
    0x5547d8; its x and z words, 0x554e04-0x554e1c). When the dot is below 0 -- the push runs against the velocity --
    the velocity is zeroed (0x554e38-0x554e48) and the depth capped at 1, and the push is then added to the velocity
    (0x554f10-0x554f3c). When the dot is 0 or more, the depth is set to 0 (0x554e64, the branch's delay slot) and
    0x554e98 skips the push altogether.
  - An earlier draft of this note (and the cluster's wording) had this the other way round: the flag excluding prone,
    the push compared with the body's facing, and the opposing push zeroed. The bytes above are the reading
    (review of part D, 2026-11-09).
- The flag is read at two more places, and the first site gains a third change (second review of part D, P2; each
  re-read in both images):
  - **Which bodies push a flagged SEAL** (0x554ba8-0x554bb4). For each other body the function first sets `$a0` to 1
    when that body's state `+0x174` is 2 or 8 (0x554b58-0x554b74, the same test as r0001 0x54fb68-0x54fb84). When the
    flag is set and `$a0` is 0, r0004 skips that body (to 0x5553f0). r0001 has no flag and no such skip: at 0x54fbb8
    `$a0` only picks the radius. A prone SEAL, or one under type 0x13 or 0x19, is therefore pushed only by a prone or
    state-8 body.
  - **The second push site** (0x5551c8-0x555224). When the velocity's dot with that site's direction is below 0
    (0x5551c8) and the byte `sp+0x120` is clear (r0001's `sp+0x110`, read at 0x5500bc, with its call and return; r4
    0x5551d4-0x5551ec), r0004 adds a flagged branch: under the flag the velocity's three words are zeroed
    (0x555208-0x555218) and the dot `$f12` is floored at -1 (0x5551fc-0x555224) before the scale. r0001's second site
    goes from that byte's test straight to the scale (0x5500d8).
  - **The first site removes the push's component from `+0x1354`** (0x554ea8-0x554f0c; r0001 `+0x1350`, §0's +4
    shift): after the depth test at 0x554e98, the push direction is dotted with `+0x1354..+0x135c`, and when the dot
    is below 0 the direction is scaled (`0x326520`) and taken off that vector (`0x3265a0`). r0001 does this at its
    second site only (0x550110-0x550158); its first site has no such step. This runs flagged or not.

**The port.** It has no push-apart between SEALs. The walker's `pushOut` (viewer `mover.ts`) pushes a body out of walls
only; the movers' grid holds the map's polygons alone, so one SEAL passes through another (LATER 711; research 385 §3).
Nothing in the room or the page runs `FUN_0054f7e0`'s push in either build's form (`git grep` for the function, for a
body-vs-body push or separation, 2026-11-09: none).

**Not ported, not moot.** In the port a climbing SEAL, or one under type 0x23, is never shoved -- r0004's outcome in
those two cases -- but only because no SEAL is ever shoved; and a prone SEAL, or one under type 0x13 or 0x19, is shoved
in r0004 by a push against its velocity, which the port never does. The push both builds make online is missing, and
r0004's skips and its flagged case have nothing to attach to. Filing the item as already r0004's would hide that gap.
**What would close it:** a task building
`FUN_0054f7e0` itself online (the radius, the push and its fraction, `FUN_00550330`'s test D:L417605, the sounds at
D:L417637-417647) on the page and in the room, in r0004's form with all of §2.10's changes (the gate, the flag and its body skip, the flagged velocity cases at both
sites, the first site's 6 cap and its `+0x1354` removal); types 0x13, 0x19 and 0x23 named off
motion.rdr; a PCSX2 `--build r0004` online pair: one SEAL climbing, one prone, one getting up, each walked into by the
other, with `+0xf44` per frame.

### 2.11 Item 15's AI half: no fall damage for an AI online

**The reading.** r4 0x5b2168-0x5b21a4 in the twin of `FUN_005ac1f0` (r4 0x5b1e80; r0001 D:L464866-464960). After the
landing's sound (both builds) and r0001's remote-controller return (vtable +0x34, D:L464932; r4 0x5b2138-0x5b2164),
r0004 adds: in a network game (the flag byte r4 0x45d481, r0001 `DAT_0045a0c1`) with an AI controller (vtable +0x30,
`IsAi`: `CSealCtrlAi`'s answers 1, research 193 §12.8), return class 0 (0x5b21a0-0x5b21a4) -- no exertion, no damage
loop, no reaction, no death, and the class `FUN_005af590` chooses its clip by is 0. Online, the original's AI bodies are
the hostages (research 193 §12.8).

**The port.** The hostages' bodies (match `hostageFollow.ts`, one `Walker` each) never reach the room's `fallDamage`
(it runs over the players' landings alone), so a hostage takes no fall damage already (source inspection). But the
shared `Walker.land` classes every landing by `landingClass(speed)` for its clip (`hit` / `hitStomach` / `landDeath`
over `land_hard_fall_rate`), where r0004's class 0 online would leave an AI the `Jump land hard` or no clip. The port's
CPU seats are an adaptation (the original has no online bots, `VOTE_HUMAN_SEATS_ADAPTATION`); they take fall damage as
players do. Whether r0004's AI rule binds them is not settled: the OT.R93 mapping of a CPU seat to `IsAi` (COMBINED-CUT,
`MoverSim.ai`) and `WEAPON_LINE_BOTS_READING` are each ruled for their own rule.

**Not ported.** Damage alone for the CPU seats would leave their landing clip r0001's (a heavy landing playing `Hit`
with no damage), and the clip half needs the shared `Walker` to know the network game and the AI controller, on the page
(which predicts and draws other bodies) and in the room alike; the hostages' clip half has the same need. **What would
close it:** the controller's word on whether the CPU seats are r0004's AI for this rule (a `HUMAN_TASKS.md` row if the
owner's); `Walker.land`'s class taken as 0 for an AI online, with the room's and the page's agreement pinned (a bot's
and a hostage's heavy landing: clip, damage, sound); a PCSX2 `--build r0004` online Extraction game, a hostage led off a
ledge over 115 a second (its clip and its health).

## 3. Held by the owner (not touched)

Items 1 (the ledge-contact probe 5.0 -> 3.5, R4B.R5), 2 (the stand-off 13 -> 12), 12 (anti-perch), 13 (steep-only
contacts) and 14 (the contact resolve's skips): held for a capture (OWNER-WORDS 2026-11-09). Nothing here changes them.
The port already carries part of item 12 from an earlier task (`STEEP_FLOOR_CONTACT_READING`, research 217 §2.8,
MP51-FLOOR-TRAP); untouched.

## 4. Found beside the items

- r4's `FUN_00552ec0` twin also writes the request `+0x374` back to the current state online when a crouch or prone
  request is refused (0x5583a4-0x5583d8, 0x558524-0x558558, gated on the network flag), and clears the obstacle slot
  where r0001 called `FUN_005b0bb0` (0x558334-0x558364, 0x5584d0-0x5584e4): G20's "refused stance resets" (R4B-20b),
  not this part's.

## 5. Tests

None. Nothing is ported, so there is no test to write or run. The drafted viewer `test/r0004Movement.test.ts` (items 11
and 16) and central `test/roomR0004Climb.test.ts` (item 6) were never run and were backed out at the fold (§2.6-§2.8).
Part D wrote no test either: no item is ported, so there is no red to show. Item 15's credit half (§6.2) is held by pins
that were already there: central `test/round.parity.test.ts` ("a fall of 120 units or more kills, and counts a suicide":
-2, a death, the line's killer null and how `fall`) and match `test/roomFall.test.ts` (the deadly landing "a suicide's
-2"). They were not changed; the part D report records whether they were run on this tree.

## 6. Already r0004's outcome in the port (item 15: two of its three halves)

### 6.1 Every landing lands online

r4 0x5b52d8-0x5b5300, the head of `FUN_005af590`'s twin (r4 0x5b52b0): the landing runs when the timer at r4 0x442ff8
is at most 0 (r0001 `DAT_004365e8`, D:L466654; the same instructions at r0001 0x5af5b8-0x5af5d0), **or** when the
network flag byte r4 0x45d481 is set (0x5b52f0-0x5b52fc: r0001 has only the timer's branch, 0x5af5d0 to the end);
offline the timer still gates. `FUN_001ecb10` sets the timer to 10.0 (D:L51045); what counts it down is not read. The
port's mover lands every time (`Walker.land`, viewer `mover.ts`); nothing in the page or the room reads the timer (`git
grep` 2026-11-09: no reader; research 230 §5 lists it unread). Online -- the room and its pages -- that is r0004's
outcome, with no change. Offline (the test room) both builds gate on the timer and the port does not: r0001's gap,
unchanged by r0004, already listed (research 230, the landing's first test), not this item's.

### 6.2 A fall death online is the faller's own

r4 0x5b228c-0x5b22c8 in `FUN_005ac1f0`'s twin: a death the fall caused sets the killer (`FUN_00547aa0`'s twin) to the
faller's own id (`actor+4`, 0x5b229c) in a network game, and to the local player's (`FUN_002b3580`'s twin +4,
0x5b22b8-0x5b22c0) offline; r0001 always the local player (r0001 0x5ac5c0-0x5ac5d4, D:L464957-464958). Then the cause
0xfd (`FUN_00547a90`) in both. Online in r0001 the damage runs only on a console whose controller is local (vtable
+0x34, D:L464932) -- for a player, the faller's own console, where the local player is the faller -- so the two builds
differ online only for a body whose console is not its own player's, the AI on the host, which r0004 now spares
altogether (§2.11). The room counts every fall death the faller's own: `kill(p, null, null, 'fall', DEATH_CAUSE.FALL)`
(match `room.ts` `fallDamage`), which charges the victim -2 and a suicide (`kill`: no killer, or the killer the
victim), the line "%s falls to their death" naming the faller alone, the combat report naming the player its own
attacker (research 151 §2.5, §3.2-§3.3). Central's stats read the room's counters (`suicides`, `deaths`, `score`), not
a killer id, so they agree. That is r0004's outcome, with no change; the wire's `killer: null` for a fall is the port's
own message, not the original's.
