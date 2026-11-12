# 392 -- r0004's mine placing gates: the PMN's kit-timer refusal, the action gate before both placings (R4B-08a)

- Date: 2026-11-09. Task R4B-08a of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour) and the owner's bar for this wave
  (2026-11-09T01:45Z: a change goes in only at very high confidence that it is the original's and breaks no other
  system; anything short of that stays out, its gap named). Branch `agent/r4b-08a`.
- Track: simulation. **Nothing the game does changes in this task**: one sub-item is already r0004's outcome on the page
  (§2) and is pinned by a test; the other is not ported (§3), its gap named.
- Status: **reading** (R4B.R3; re-read by its fresh reviews, `agent-mail/evidence/r4b-w2/VERDICTS.md`, and the r0004 wave 2 lane batch review, `agent-mail/evidence/mega/REVIEW-R4B-AND-THREAT-BATCH.md`, PASS WITH FINDINGS (high), 2026-11-09). Nothing here is measured running. This note's author re-read every r4
  site cited below with capstone (the scratchpad's `r4dis.py`) in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE
  dump) **and** the served decrypt `game/r0004/served/socom2_game_served.elf`: no word differs over 0x5c56a0-0x5c5910
  (the claymore and PMN branches of r4 0x5c5550) or 0x5ba680-0x5baf74 (the action gate). The r0001 counterparts were
  read in `game/disc/socom2_game.elf` over 0x5beaf0-0x5bed20 and 0x5b4340-0x5b4c80, beside the decompilation. A
  reviewer who did not write this re-reads them before they count as readings (R4B.R4).
- Sources: `C:/Projects/agent-mail/evidence/r0004-gameplay-review/` (ADDENDUM-1.md "Claymore and PMN placement";
  WORKFLOW-G-REVIEW.md F4, which made these gates a row distinct from G9; `mine-activation-r4.asm.txt`, which the
  author's own read above matches word for word) and `C:/Projects/agent-mail/evidence/r0004-investigation/
  cluster-double-mines-armory.md` ("Not in this cluster" and §6). r0001 is cited `FUN_<addr>` / `D:L<line>` of
  `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled text is pasted.
- Not this task: G9's carry-once lists (R4B-06, [research 378](378-r0004-carry-once-lists.md)); the table of seven
  points in r0004's placing tick (r4 0x5c8860), which the gameplay review's F5 shows is G7's throw-release clearance
  query, not a mine-coordinate table.

## 1. What r0004 changes at the placement path

The claymore's and the PMN's fire is a branch of the kit's use, r0001 `FUN_005be9a0` (claymore D:L475306-475337, PMN
D:L475338-475369) -> r4 0x5c5550 (claymore 0x5c56b4-0x5c57d4, PMN 0x5c57d8-0x5c590c). Each branch, in both builds:
the item's id (0x99 / 0x9e) on the kit's current item, refused in view state 4 (actor `+0x200`, 0x5c56a8-0x5c56ac);
the SEAL's claymores down under 4 (`FUN_003cc1f0` -> r4 0x3ee390), else the message once its 2 s timer is out; the
wading test (actor `+0x105e`, `+0xf88` against 0.32 x the world scale); the `Place claymore` action pushed (r0001
`FUN_0057d540` with `DAT_003deb48` -> r4 0x582720 with the halfword at 0x409d18); the kit's placing bit; `+0x87c` =
1.3 (0x3fa66666; r0001 0x5bec00 and 0x5bed10, r4 0x5c57c4 and 0x5c58fc -- the value is unchanged); `+0x818` + 1.

r0004 adds three tests and nothing else to the two branches:

| # | where (r4) | what | r0001 |
|---|---|---|---|
| A | claymore, 0x5c5780-0x5c578c, after the wading test | `jal 0x5ba680` with the actor (`kit+0x830`) and 0; a 0 answer returns before the push | none: the wading test falls into the push (0x5bebd0) |
| B | PMN, 0x5c5848-0x5c585c, after the count, before the wading test | `kit+0x87c` read; not at or under 0 -> 0x5c58b0, a return, no message | none (0x5bec2c-0x5bec88) |
| C | PMN, 0x5c58b8-0x5c58c4, after the wading test | as A | none (0x5bece0) |

r4 0x5ba680 is the twin of r0001's actor action gate `FUN_005b4340` (D:L469307-469545): its prelude (0x5ba680-0x5ba75c against
0x5b4340-0x5b441c, compared word by word) differs only in its branch targets, its callees (`FUN_00588030` -> 0x58d660,
`FUN_00587fe0` -> 0x58d610, `FUN_00577e40` -> 0x57d220, `FUN_00555170` -> 0x55a4a0) and its two halfword statics
(`DAT_003deae0` -> 0x409cb0, `DAT_003def08` -> 0x40a0d8, twinned by their place in the otherwise identical words). With
argument 0 it runs the prelude (0x5ba694-0x5ba75c) and then misses every argument test (0x5ba768 not 1, 0x5ba9b0-0x5ba9c4
not 2-7 or 8, 0x5bab90-0x5baba4, 0x5babe0-0x5bac00, 0x5bac70, 0x5bad50, 0x5bae60, 0x5bae98, 0x5baec8) to 0x5baf58,
answer 1 -- as r0001's argument 0 reaches `uVar6 = 1` (D:L469536). So action 0 refuses exactly the prelude's cases
(D:L469320-469335):

- the alive bit (`+0xe1` 0x10) clear, or state 8 (`+0x174`);
- `Fall forward` / `Fall backwards` playing (`FUN_00588030`), `Land forward` / `Land backwards` (`FUN_00587fe0`)
  (research 201 §1's names; the port's `fallForward`, `fallBackwards`, `landDeath`, `landBackwards`);
- the action `seal_180` (`DAT_003deae0`, `FUN_00577e40`);
- state 5 (the ladder), or the top motion's kind (`+0x2b`) 5;
- the action `seal_dive2prone` (`DAT_003def08`, `FUN_00577e40`).

Seen in the same function and not this task's: r0004's argument 10 (the turret's mount, `FUN_005a88c0`) gains a test of
the `Place claymore` action (0x5baed4-0x5baef0, the halfword 0x409d18 the branches push) -- a mount refused while a
mine is being placed. It belongs to whichever row ports the mount's gate (G10 or the emplacement work), not here.

## 2. The PMN refused while `+0x87c` runs (B) -- already r0004's outcome on the page

**What `+0x87c` is in the port's terms (certain).** It is the kit's placing timer: the two branches write 1.3 into it
(D:L475324-475327, D:L475356-475359; r4 0x5c57c4, 0x5c58fc), C4's 99 s (D:L475447-475451); the placing tick
`FUN_005c1970` subtracts the frame's time while the placing bit is set (D:L476883-476884) and at or under 0 clears the
bit, zeroes the timer and sets the charge down (D:L476886-476901, the claymore and PMN at D:L477001-477010). The page's
twin is `GrenadeThrower.placing.left` (viewer `grenade.ts`; `placingClock()` already documents it as `+0x87c`): set to
`CLAYMORE_RULES.placeSeconds` (1.3) or `C4_KIT_TIMER_SECONDS` by `startPlacing`, run down by `update`, the charge set
down (`placeCharge`) and `placing` cleared at or under 0.

**Why only the PMN's own placing reaches the test.** The swap is refused while `+0x87c` is above 0 or the placing bit
is set (`FUN_005c4fd0` D:L478947; research 201 §1), so the kit's current item cannot become the PMN while another
placing runs: test B refuses a second PMN fire during the PMN's own 1.3 s. In r0001 such a fire, if it got past the
round gate (`FUN_005c0ae0`), would push the clip again and write 1.3 again (D:L475354-475360) -- a restarted placing.

**The page.** A second placing never starts while one runs: `pull` acts only in phase `ready` (a placing puts the
thrower in `throwing` until its clip's tail ends), and `startPlacing` returns at once while `placing` is set. So the
page refuses B's case, with no message, as r0004 does. Already r0004's outcome by construction; not a port, and no RED
run exists. `packages/viewer/test/r0004MinePlacingGates.test.ts` holds it: a re-press inside the 1.3 s neither
restarts the timer nor lays a second placing, one PMN is set down at 1.3 s and one is spent.

**The room.** The room is told the placing's end (the `throw` event, `Room.placeCharge`), not its start, and runs no
test for B. An honest page never sends a PMN that B refuses, so the page and the room agree on every path the port's
own page has. A room-side refusal (the PMN's placing start, seen by the room's walker as a `place` hold in
`noteThrowHold`, refused while a previous placing's 1.3 s runs on the command clock) would guard only against a
modified client, which the original's own consoles did not guard against either, and its timing against the page's
clamped frame clock (the page's placing runs on `update`'s `dt`; the room counts commands, with
`FIRE_ARRIVAL_JITTER_TICKS` of arrival slack) is unproven: a wrong bound would drop an honest PMN. **Not ported**
(`PMN_PLACING_TIMER_ROOM_R0004_READING`, note only, §6).

Out of scope, recorded (pre-existing, not r0004's change): the page also refuses a claymore re-press during its own
placing and any re-press during the placing clip's tail after the charge is down; r0004 has no `+0x87c` test on the
claymore's branch (A only), and whether the original's other gates (`FUN_005c0ae0`'s `+0x818` against
`FUN_005c0940`, D:L476439-476440, and the common gate `FUN_005a7de0(actor, 1, 1)`, D:L476442) refuse those presses is
not read here.

## 3. The action gate before both placings (A, C) -- not ported

The reading of A and C is unambiguous (§1). The port's path for it is not clear enough to meet the owner's bar:

1. **The r0001 gate beneath it is missing in the port.** In both builds the placing's fire is reached through
   `FUN_005c0ae0`, which asks the common gate `FUN_005a7de0(actor, 1, 1)` for every placed class (D:L476375-476379,
   D:L476442). That gate takes only states 0, 1, 2, 3 and 6 (D:L462612; viewer `traversal.ts` `NOFIRE_STATE_READING`),
   so the ladder (state 5) -- and the `seal_180` at the ladder -- and the hang already refuse a placing in r0001, and
   the dive's bare `NoFire` likely does too. The port's placing start asks neither: `matchThrow.ts`'s trigger calls
   `GrenadeThrower.pull` for a placing with no `walk.fireAllowed()` (the launcher asks it, LATER 199), and
   `startPlacing` tests only the claymore count, the wading and the net cap. Porting r0004's prelude alone would add
   half of a gate over a path that lacks r0001's own; which of A's cases r0004 actually adds beyond `FUN_005a7de0`
   (the knock-down falls and landings, unless their clips carry `NoFire` too) is not settled.
2. **Two predicates have no certain port identity.** `FUN_00577e40` (D:L437398-437411) compares the playing motion's
   type (`actor+0x534`) with the action, or with `FUN_005e1a90` of the anim set `+0x528` (D:L437404-437409); the port's `seal_180` and `seal_dive2prone` are traversal kinds (`turn180`, `dive`), and whether
   "the top is that action" is the same set of ticks as "that traversal kind runs" is not shown. State 5 or the top's
   kind 5 is the ladder (research 201 §1); which of the port's traversal kinds and clips are kind 5 is not read off
   `motion.rdr`.
3. **The room would have to judge it at the placing's start.** The room hears the placing's end; the gate is asked at
   its start (the press). C4's offer gate shows the cost: `bankPlaceGate` banks the common gate's verdict at the
   start's command because the plant is decided past the cone's 64 commands (`Room.placeStart.gate`, LATER 220 head 3
   and its review F1). A claymore or PMN gate would need the same banking, its own review, and agreement between the
   page's walker and the room's at that command; a disagreement drops an honest charge online.

**What closes it:** (a) the placing start asking r0001's `FUN_005c0ae0` -> `FUN_005a7de0(actor, 1, 1)` on the page and
in the room, as a task of its own; (b) `FUN_00577e40`'s sites against the traversal kinds and the kind-5 motions read
off `motion.rdr` through the repository's reader; (c) a PCSX2 `--build r0004` run -- the claymore's and the PMN's
trigger pressed during a knock-down `Fall forward` and its `Land forward`, and during the dive (whether r0001's common
gate already refuses a placing there is unsettled, (1) above), the kit's `+0x87c` and the placed count read
-- against the same on r0001. Then A and C are the prelude's five cases asked before the push, on both sides
(`MINE_PLACE_ACTION_GATE_R0004_READING`, note only, §6).

## 4. Unchanged and moot

- The 1.3 s placing timer: the same constant in both builds (§1); the port's `CLAYMORE_RULES.placeSeconds` (scene
  `projectile.ts`) already holds it. Nothing to port.
- The count of the SEAL's claymores (`FUN_003cc1f0`, unchanged per the cluster's changed-function table), the 2 s
  message and the wading test: the same in both builds' branches (§1); already the port's (`startPlacing`, the room's
  `claymoresDown` and `wadingDepth`).
- The seven-point table in the placing tick (r4 0x5c8860): G7's release clearance (the gameplay review's F5), not a
  mine change: moot here.

## 5. Tests

- `packages/viewer/test/r0004MinePlacingGates.test.ts` (new): the page refuses a PMN re-press while its kit timer runs
  -- the timer not rewritten, no message, one PMN down at 1.3 s, one spent. A pin of r0004's outcome the page already
  had: it passed at its first run (no RED exists; no source changed).
- Kinds kept apart: unit test (the pin above); source inspection (both images and the decompilation, this note). No
  dev-disc test, rendered browser run, physical playtest or capture comparison.

## 6. Readings

| name | listed at | in code | kind | validation |
|---|---|---|---|---|
| `MINE_PLACE_ACTION_GATE_R0004_READING` (*note only*) | §1, §3 | -- | reading | not ported: r0004 asks the action gate r4 0x5ba680 (= r0001 `FUN_005b4340`, argument 0: the prelude only, D:L469320-469335) before the claymore's push (0x5c5780-0x5c578c) and the PMN's (0x5c58b8-0x5c58c4); r0001 asks none (0x5bebd0, 0x5bece0); owed: (a) the placing start asking r0001's `FUN_005c0ae0` -> `FUN_005a7de0(actor, 1, 1)` (D:L476442), which the port's placing does not; (b) `FUN_00577e40`'s `seal_180` / `seal_dive2prone` and the kind-5 motions identified in the port's traversal; (c) a PCSX2 r0004 / r0001 pair, the trigger pressed during a knock-down fall, its landing and the dive (r0001's common gate during the dive unsettled) |
| `PMN_PLACING_TIMER_ROOM_R0004_READING` (*note only*) | §2 | -- | reading | already r0004's outcome on the page (viewer `grenade.ts` `pull` / `startPlacing` refuse while `placing`, the kit's `+0x87c`; pinned by `r0004MinePlacingGates.test.ts`); not ported in the room: r4 0x5c5848-0x5c585c refuses a PMN fire while `+0x87c` > 0, and the room, told the placing's end only, runs no such test -- an honest page never sends one; owed: a room-side bound for a PMN placing's start against the previous one's 1.3 s on the command clock, proven against the page's clamped frame clock, before it may refuse anything |
