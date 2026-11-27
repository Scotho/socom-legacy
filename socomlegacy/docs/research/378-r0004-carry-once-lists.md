# 378 -- r0004's carry-once and no-duplicate lists: no double mines, no second C4 (R4B-06, G9)

- Date: 2026-11-01. Task R4B-06 of the [r0004 plan](../plans/r0004-option-b.md), under the owner's ruling OT.R97
  (MISSION: r0004 is the specification for gameplay and front-end behaviour). Branch `agent/r4b-06`.
- Track: simulation. It changes what a kit may hold: a second C4 slot is refused in the weapon select, the WEAPON
  EXCHANGE, the ARMORY and the room's replay.
- Status: **reading, pending review** (R4B.R3). Nothing here is measured running. This note's author re-read every r4
  site cited below with capstone (the scratchpad's `r4dis.py`) in `game/overlays_r0004/socom2_game_r0004.elf` (the PINE
  dump) **and** the served decrypt `game/r0004/served/socom2_game_served.elf`: no word differs over 0x2d3cd0-0x2d3e40,
  0x2d3ef0-0x2d3f08, 0x2d3f40-0x2d3f5c, 0x2d4190-0x2d41b4, 0x2d41f8-0x2d420c, 0x285150-0x285230, 0x284ea0-0x284f64,
  0x2d2480-0x2d2520, 0x284510-0x284558, the six refill heads 0x2d2fa8-0x2d2fc0, 0x2d30bc-0x2d30d0, 0x2d31cc-0x2d31e0,
  0x2d33b0-0x2d33c4, 0x2d34c4-0x2d34d8, 0x2d35d4-0x2d35e8, and the call words 0x23c7c4, 0x23cafc (both `jal 0x2d2280`) and
  0x240050 (`jal 0x2d25e0`). A reviewer who did not write this re-reads them before they count as readings (R4B.R4). dot
  supported G9's added 0x99/0x9e comparisons and left the row's other claims unresolved
  (`r0004-dot/r0004-consolidated-adversarial.md`).
- Sources: `C:/Projects/agent-mail/evidence/r0004-investigation/cluster-double-mines-armory.md` §0-§5 (B1-B7), REPORT.md
  row G9 and the corrections at its foot (the gameplay review's mines *placement* gates are R4B-08a, not this task).
  r0001 is cited `FUN_<addr>` / `D:L<line>` of `game/analysis/socom2_game.elf.decomp.c`. No decompiled or disassembled
  text is pasted.
- The link to the official March 10 2004 note ("players can no longer manipulate the armory and weapon selections to
  carry double the mines") is the cluster's, strong for B1/B2; that B3-B7 count under it is inference.

## 1. The question: does the port have each path?

The port's kit rules are one module, scene `arsenal.ts`: `selectable` (r0001 `FUN_0023c390`, D:L87358-87487),
`slotLocked`, `pick` (`FUN_0023fef0` with `FUN_0023eca0`), `autoFill` and `applyPicks`. Every consumer goes through it:
the room's authoritative replay (match `room.ts` `applyPicks`, ~:4648), the page's ARMORY (viewer `armoryState.ts`
`stepItem` and `readProfile`, `ARMORY_RULES_READING`), the in-game select and the WEAPON EXCHANGE (viewer
`weaponSelectState.ts`, `weaponExchange.ts`) and the bots' armory (match `bots/armory.ts`). A rule changed there is
changed for the page's offer and the room's check at once, so the two agree.

**The put-back is not modelled** (LATER 616). r0001 remembers the equipment a launcher primary displaces (the in-game
kit's `+0x1530`/`+0x1531`, `FUN_0023fef0` D:L89205-89316; the ARMORY's pair per character at `DAT_003dd060`,
`FUN_00283170` D:L128917-128920) and gives it back when the launcher leaves, through a helper that swaps a remembered
id only when it is already carried and on the carry-once list (`FUN_0023bc50` D:L87188-87271, list D:L87215-87221; the
ARMORY's `FUN_00283e60` D:L129233-129242). The port's `pick` forgets what a launcher displaces and refills the
launcher's slots by `autoFill`, which never takes an item of the no-duplicate list (§2) that the kit already carries.
Modelling the remembered pair means state the port's `Loadout` (five ids) does not carry, across the room's replay,
the page's three menus and the bots -- r0001's whole put-back, which the brief excludes. So each G9 item is decided
against the paths the port has.

## 2. C4 in the no-duplicate list -- ported

r0004's twin of `FUN_0023c390` is new code at r4 0x2d2280; both callers (`FUN_0023c6f0` at 0x23c7c4, `FUN_0023c840` at
0x23cafc) call it. Its one change: the record's id (`lbu +0x7c`, 0x2d24b0) is tested against **0x97 (C4)** first
(0x2d24b4-0x2d24b8), then r0001's seven -- 0xc2 2X, 0xc3 thermal, 0x9e PMN, 0x99 Claymore, 0xb9 LAW HEAT, 0x91 LAW,
0x92 RPG-7 (0x2d24bc-0x2d24fc; r0001 D:L87443-87444). A listed item already in another slot is refused, as in r0001
(D:L87452-87464).

The port's `SINGLE` was r0001's seven; it is now `NO_DUPLICATE_ITEMS_READING`, the eight. Effects:
- the room's `applyPicks` refuses a second C4 (`'refused'`), so a forged page cannot build one;
- the page's ARMORY scroll passes a C4 carried in another slot (`stepItem` asks `selectable`), as r0001's ARMORY
  script already did (research 95 §3.4 item 4, line 490: C4 refuses a duplicate) -- so r0004's in-game rule makes the
  port's ARMORY (built on the in-game rules, `ARMORY_RULES_READING`) agree with the original's ARMORY in both revisions;
- the in-game select's list and the WEAPON EXCHANGE skip it the same way;
- `autoFill` is unchanged: it already treated C4 as carried-once (its own condition names `ITEM.C4`).
A C4 locked by the side's 16/32 bit (`slotLocked`) is unaffected: its slot cannot be changed in either revision.

## 3. The double mines (B1, B2) -- already r0004's outcome by construction

r0004 adds **0x9e (PMN) and 0x99 (Claymore)** to the carry-once list in both put-back copies:
- in-game: new 0x2d3cd0 (the `FUN_0023bc50` rewrite; the set put-back `FUN_0023fef0`'s twin calls new 0x2d25e0 at
  0x240050 in place of `FUN_0023eca0`, which calls 0x2d3cd0): the list ends 0xc2 (0x2d3e04), 0x9e (0x2d3e0c), 0x99
  (0x2d3e18), each branching to "carried once" at 0x2d3e30;
- ARMORY: 0x285150 (the `FUN_00283e60` twin), list 0x2851ac-0x285224 = {0x92, 0x91, 0x8e, 0x8f, 0xc1, 0x8d, 0x97, 0xc3,
  0x98, 0x9a, 0xc2, 0x9e, 0x99}; its next-item walk 0x284ea0 (the `FUN_00283b50` twin) holds the same set
  (0x284ea4-0x284f5c). Both drop r0001's launcher rounds and 0xfe from the list (the cluster's §2.3).

In the port the exploit's sequence -- a mine in equipment 1, a launcher primary in (its round or the M203 into
equipment 1-2), a second mine in the freed slot, the launcher out -- ends with one mine slot: the first mine was not
remembered, and `autoFill` refuses the second's id while it is carried. `carryOnceR0004.test.ts` drives B1 (SEAL,
Claymore, the M4A1-M203) and B2 (Terrorist, PMN, the M79 and the MGL) through `applyPicks`, and walks (over the test's own table of 22 items, one valve set; the LAW, RPG-7, Satchel, F2000, M16-M203, a thermal sniper and pickups are outside it -- the claim rests on reading `pick`, `launcherFill` and the cost-2 partner write, and on the R4B-06 reviewer's own 22-map disc walk, 146,885 picks, none twice) **every kit any
pick sequence reaches** from a Claymore-and-C4 SEAL kit and a PMN-and-C4 Terrorist kit (a breadth-first search over
single picks of every item in every slot): none holds a Claymore, a PMN or a C4 twice. Before §2 the walk found
`[54, 15, 151, 151, 121]` -- the C4 twin of the exploit, which r0001's list allowed by the plain select, no launcher
needed.

What the port still does not do, in either revision: give back the remembered *non-listed* item (a grenade displaced by
the M4A1-M203 comes back in r0001 and r0004; in the port the slot is refilled by `autoFill`, the first acceptable
equipment item after the launcher in the file's order). That is LATER 616, kept open and widened to say so.

## 4. The side mask (B4) -- already r0004's outcome where the port has the path

r0001's `FUN_0023bc50` walks a substitute with the side inverted -- mask 8 for a SEAL (MIPS 0x23be94-0x23bea0, research
94 R94.4). r0004's 0x2d3cd0 turns it the right way: `addiu a0,1 / addiu v1,8 / movz a0,v1,s2` (0x2d3f4c-0x2d3f58), a
SEAL walking with 1. The rewrite of the next-item walk, 0x2d3fc0 (`FUN_0023b9b0`'s twin), **keeps** r0001's order
(0x2d41fc-0x2d4208: `addiu a0,8 / addiu v1,1 / movz a0,v1,s5`).

The port's `autoFill` refills from the player's own side everywhere (`INGAME_AUTOFILL_SIDE_READING`, the divergence
filed for the owner, R94.4). For the put-back -- which the port does not have -- that is r0004's mask. For the walk it
stays the named divergence under r0004 as under r0001: r0004 did not change it. Not changed here; research 101's row
says so.

## 5. The thermal scope (B5) -- already r0004's outcome by construction

Both r0004 in-game walks reject 0xc3 before the class tests (0x2d3ef0-0x2d3f08 in 0x2d3cd0, 0x2d4198-0x2d41b0 in
0x2d3fc0); r0001's in-game `FUN_0023b9b0` / `FUN_0023bc50` had no such test (the ARMORY's `FUN_00283b50` did,
D:L129189). The port's `autoFill` has always skipped the thermal scope. The ARMORY put-back's new drop (r4 0x284480 at
0x284518-0x284554: the slot-0 item's class, `jal 0x3f3cb0`, not 0x65 sniper -> a remembered 0xc3 becomes 0xff) acts on
a remembered item, which the port has none of; a sniper leaving the port's kit takes its thermal scope with it
(`dependentOf`). The test drives `autoFill` from every item of the table with only the thermal scope left allowed: it
returns `EMPTY_ITEM`.

## 6. The launcher's rounds on its exit (B6, B7) -- already r0004's outcome by construction

r0004's 0x2d25e0 (the `FUN_0023eca0` rewrite) refills, when the M79 leaves, the slots holding 0xb3 GL FRAG, then 0xb0
GL HE and 0xb2 GL SMOKE (heads 0x2d2fb4, 0x2d30c8, 0x2d31d8); when the MGL leaves, 0xaf M203 FRAG, then 0xab M203 HE
and 0xad M203 SMOKE (0x2d33bc, 0x2d34d0, 0x2d35e0). r0001's in-game undo refilled only the FRAG (`FUN_0023eca0`
D:L88676-88711 for the M79, D:L88713-88766 for the MGL); r0001's ARMORY already did all three for the M79
(`FUN_00283170` D:L128954-128991).

The port's `dependentOf` has always cleared every GL round (176-180) for the M79 and every M203 round (171-175, with
the M203 item) for the MGL and the M203 rifles -- r0004's rule. Under r0001 that was an unrecorded divergence of the
in-game select; under OT.R97 it is the specification. Held by the test (the M79 with GL HE and GL SMOKE reached through
`applyPicks`, the AK-47 back: no GL round left; the MGL likewise).

## 7. R4B-01's follow-up: the arsenal's FireWait

R4B-01 made `weaponRecord` store r0004's 0.16 over the M60E3's read FireWait (r4 0x3f054c-0x3f057c, research 374 §2),
but `arsenalOf`'s `ArsenalItem.fireWait` still read the disc's 0.14 -- two values for one weapon field (`+0x50`), where
the original has one. Both readers now take one step, `parsedFireWait` (scene `weapons.ts`), keyed on
`R0004_M60E3_NAME` and valued `M60E3_FIRE_WAIT_READING`. Nothing in the port fires the M60E3 off the item's value (the
firearm path reads the record; the item's is read for launched rounds and the Detonator), so no behaviour changes; the
pin `arsenal-items.json` moves to 0.16 for the M60E3 with its `_source` naming R4B-06, and `weaponTable.parity.test.ts`
holds research 94's row at r0001's 0.14 beside it.

## 8. Re-filed (R4B.R6)

- r0001's no-duplicate list without C4 (`FUN_0023c390` D:L87443-87444; research 94 §A5's "duplicates" row and step 5,
  research 94 L951's list) -- **r0001, superseded by r0004 (OT.R97)** for the port's rule; the rows stay r0001's record.
- r0001's carry-once lists without the mines (`FUN_0023bc50` D:L87215-87221; `FUN_00283e60` D:L129233-129242) and the
  inverted put-back mask (0x23be94-0x23bea0) -- r0001's, superseded; the port never modelled them (LATER 616).
- No `*_READING` is retired.

## 9. Tests

- scene `test/carryOnceR0004.test.ts` (new; no data): the eight-item set; a second C4 refused by `selectable` and by
  `applyPicks`; B1 and B2 through `applyPicks`; the every-reachable-kit walk for both sides; the thermal scope never
  auto-picked; the own-side refill; the M79's and the MGL's exit; the M60E3's item FireWait equal to its record's.
- match `test/roomLoadout.test.ts`: the room's replay refuses a second C4 (`'refused'`, the kit kept) -- a row of the
  refusal table.
- viewer `test/armoryState.test.ts`: the ARMORY scroll passes a C4 carried in another slot.
- scene `test/weaponTable.parity.test.ts`: research 94's row keeps r0001's 0.14 for the M60E3, the pinned item 0.16;
  the disc half re-reads `arsenal-items.json` whole.

## 10. Readings

| Name | Status and evidence needed |
|---|---|
| `NO_DUPLICATE_ITEMS_READING` | scene `arsenal.ts`: `{0x97, 0xc2, 0xc3, 0x9e, 0x99, 0xb9, 0x91, 0x92}` (§2: r4 0x2d2280's 0x2d24b4-0x2d24fc, reached from 0x23c7c4 and 0x23cafc); r0001's seven without C4 (D:L87443-87444) superseded. Reading, pending review. To proven: a PCSX2 `--build r0004` round, the in-game select (dead, MP2 SEAL with C4 unlocked) scrolled over a second equipment slot -- C4 absent from the list; and the same on the r0001 image, present. |
| `CARRY_ONCE_PUT_BACK_READING` | scene `arsenal.ts` (§11): the in-game put-back helper's carry-once list -- r0001 `FUN_0023bc50` D:L87215-87221 with 0x9e and 0x99 added by r0004 `FUN_002d3cd0` D4:L182764 (the atlas's masked diff, nothing dropped). Reading, pending review. To proven: a capture of the in-game select on r0004 with a remembered carried item of the list (the Claymore sequence of §11) and one not on it. |
| `PUTBACK_SLOT_ORDER_READING` | scene `arsenal.ts` (§11): where the two ids go -- the M203 rifles' first into the M203's slot (r0001 `FUN_0023eca0` D:L88864-88880), the second into slot 3 when it holds any M203 round (the slot-3 test of every round loop, D:L88897, D:L88936, D:L88975, D:L89014, D:L89053; r4 0x2d2938-0x2d2958, 0x2d2a70-0x2d2a90, 0x2d2ba8-0x2d2bc8); the M79's, the MGL's and the F2000's first into the first slot holding one of its rounds in r0004's loop order FRAG, HE, SMOKE (the flag cleared once, r4 0x2d2fa8, carried across the loops, r4 0x2d3028-0x2d3258 and the MGL's 0x2d3424, 0x2d3534, 0x2d3644; r0001's FRAG loop alone, D:L88676-88710, D:L88730-88763, D:L88784-88817); any other the walk's. Reading, pending review; Q221-PC2 proves the unmoved case. To proven: capture Q-221 with the FRAG moved out of slot 3 before the M4A1 comes back. |
| `ARMORY_THERMAL_DROP_READING` | scene `arsenal.ts` (§5, §11): r0004 `FUN_00284480` D4:L136662-136669 drops a remembered thermal unless the LEAVING slot-0 item is a sniper (`FUN_002856f0` D4:L137156-137157, as the atlas lead reads it -- NOT re-read on this host: the call order supports "the leaving slot-0 item", its writer `FUN_00543930` not traced; second read 2026-11-24); a launcher, never a sniper, is what leaves with a pair, so a remembered thermal is always dropped -- the in-game undo's own rule (D:L88646-88652). Reading, pending review. Unread: whether a remembered thermal is reachable in the ARMORY and what a sniper leaving does; settles: a read of the ARMORY's remember step -- r0001 `FUN_00283170` WRITES the pair at D:L128859 and D:L128870 (the LAW / RPG-7 partner slot), reads it back at D:L128917-128920 (`FUN_00283e60` on DAT_003dd060/061) and clears it at D:L128947-129009 (corrected 2026-11-24 by the second read: D:L128917-128920 had been called the remember step) -- or capture Q-221 with a sniper kit. |
| `CARRY_ONCE_PUT_BACK_R0004_READING` (*note only*, replaced 2026-11-24 by `CARRY_ONCE_PUT_BACK_READING` and §11) | §3-§6: r0004's put-back lists (0x2d3cd0's 0x2d3e04-0x2d3e30; 0x285150's 0x2851ac-0x285224; 0x284ea0's set), its own-side mask (0x2d3f4c-0x2d3f58), the thermal skips and the ARMORY's thermal drop, and the launcher-exit refills act on paths the port reaches only by construction (no remembered put-back, LATER 616); the port's outcome equals r0004's for B1, B2, B4 (put-back), B5, B6, B7, held by `carryOnceR0004.test.ts`. To proven: the cluster's B1 on both images in PCSX2 (SEAL, MP1, the M4A1-M203 swap, kit counts read). |

## 11. The remembered put-back (R4P-221, 2026-11-24; LATER 616)

2026-11-24, task R4P-221 (`agent/lobby-221`; simulation track). **Reading, pending review**; the put-back itself
**proven** for the M4A1-M203 by capture Q221-PC2 (r0004, Desert Glory, SEAL, 3/3 each way: `54 15 121 126 151` ->
`61 15 141 175 151` -> `54 15 121 126 151`; the register's "Q-221", `../atlas/handover/r0004-parity-ready-queue.md`).
This section supersedes §1's "the put-back is not modelled" and §3's last paragraph for the port.

- **What is built** (scene `arsenal.ts`). `pick` takes and returns the remembered pair (`Remembered`, the kit's
  `+0x1530`/`+0x1531`): a launcher primary coming in remembers slots 2 and 3 (the M16-M203, the M4A1-M203) or slot 2
  with the other half kept (the M79, the MGL, the F2000) -- r0001 `FUN_0023fef0` D:L89203-89316, recorded after the
  old item's undo. A launcher primary leaving works out the two ids first, on the kit and valves with the launcher still
  in (`FUN_0023eca0` D:L88638-88653; r0004 `FUN_002d25e0`, the pair read at D4:L182089-182092), through r0004's helper
  `putBackItem` (`FUN_002d3cd0`, of r0001 `FUN_0023bc50` D:L87188-87271): a remembered id comes back as itself unless it
  is carried in slots 2-4 and on the carry-once list (`CARRY_ONCE_PUT_BACK_READING`); then the next item after it in
  the file's order that is equipment, not the thermal scope (D4:L182791) and allowed to the player's own side
  (D4:L182796) takes its place, tested again. The second id is walked when the helper changed it and it equals the
  first (D:L88643-88645); either id that is none, 0xfe, the thermal scope or the bomb 0x9a is replaced by the walk
  (D:L88646-88652; D4:L182097-182102). An empty slot holds no record: the helper's carried test skips it (r0001
  `FUN_0023bc50` D:L87202-87210), and the M203 rifles coming in over an empty slot 2 remember none for both ids
  (D:L89301-89306; r4 0x240250-0x240274; fold of the review's finding 5). The ids go where `PUTBACK_SLOT_ORDER_READING`
  says (the fold of the review's finding 1): the M203 rifles' first id to the M203's slot (D:L88864-88880) and the second
  to slot 3 whichever M203 round it holds -- every round loop carries the same slot-3 test (D:L88897, D:L88936,
  D:L88975, D:L89014, D:L89053; r4 0x2d2938-0x2d2958, 0x2d2a70-0x2d2a90, 0x2d2ba8-0x2d2bc8); the M79's, the MGL's and the
  F2000's first id to the first slot found holding one of the launcher's rounds, r0004's loops in the order FRAG, HE,
  SMOKE with the first-id flag cleared once (r4 0x2d2fa8) and carried across them (r4 0x2d3028/0x2d3038,
  0x2d3138/0x2d3148, 0x2d3248/0x2d3258; the MGL's indexed `+0x1530` writes r4 0x2d3424, 0x2d3534, 0x2d3644) -- r0001
  had the FRAG loop alone (the M79 D:L88676-88710, the MGL D:L88730-88763, the F2000 D:L88784-88817; the F2000 keeps
  only it on r0004). The leaving launcher's other
  rounds are swept after (r0001 D:L88920-89070; r0004's added HE and SMOKE loops, D4:L182162-182231, D4:L182286-182355),
  which also refills a substitute that is one of its rounds (the helper walks under the launcher's own round valves).
  The walk is the port's `autoFill`, as before. `replayPicks` carries the pair across one request's picks (the room's
  `applyPicks` replays through it, the pair starting empty at the type's kit); the in-game select
  (viewer `weaponSelectState.ts`) keeps it across confirms and opens until the round's reset.
- **The lists, corrected.** The in-game helper's carry-once list is r0001's (D:L87215-87221: 0xb7, 0x8e, 0x8f, 0xb3,
  0xae, 0xad, 0xac, 0xab, 0xaf, 0xc1, 0x8d, 0xff, 0x97, 0xfe, 0xc3, 0x98, 0x9a, 0xc2) with 0x9e and 0x99 added and
  nothing dropped: the atlas's masked diff of r0004 `FUN_002d3cd0` against r0001 (`docs/atlas/data/r0004/labels/
  reread2-002.check.md` lines 86-90, UPHELD). §3's "both drop r0001's launcher rounds and 0xfe" holds for the ARMORY's
  copy (r4 0x285150) only; the port's ARMORY takes the in-game rules (`ARMORY_RULES_READING`). The same masked diff says
  r0004's `FUN_002d25e0` differs from r0001's `FUN_0023eca0` only by the M79's and the 0x8e branch's added HE and SMOKE
  loops (lines 80-85), so r0001's put-back steps are r0004's.
- **What that gives, by transcription.** A grenade displaced by a launcher comes back that grenade (the capture's M67
  and HE); a remembered PMN or Claymore comes back once (carried, it is swapped for the own-side substitute); a
  remembered thermal scope never comes back.
- **Two C4: the port follows the original's code (the main controller's ruling, 2026-11-24).** The sequence: SEAL
  `[54, 15, Claymore, C4, x]`, the M4A1-M203 in (remembering the Claymore and the C4), a Claymore into equipment 3, the
  M4A1 back. The Claymore is carried and on r0004's list, so the helper swaps it for the next SEAL equipment item after
  it, C4 on the disc's order (the PMN between is the Terrorists'); the remembered C4 comes back as itself, and only a
  second id the helper changed is compared with the first and walked (r0001 `FUN_0023eca0` D:L88643-88645; r4
  0x2d267c-0x2d269c; the helper's list r4 0x2d3e18), so the kit holds two C4. The select refuses a second C4 (§2), but
  the put-back writes its ids without the select's test. The port follows the original's code exactly here even though
  it lets a player carry two C4 -- the original decides; the port's old refusal (R4B-06's "no C4 twice", by omission)
  was the departure. Level: **reading**, the in-game select only, not measured running; a capture of the sequence on
  r0004 settles it. It needs one exact pick order and depends on the map's `Enable_claymore` / `Enable_c4` letting the SEALs
  carry both and `Enable_pmn` not (the disc's per-map values not checked: named here, the second read of 2026-11-24);
  the Terrorists reach the same shape through the PMN, then C4. The ARMORY's copy is unread for it (r4 0x284480 / 0x285150, below). On r0001 the same sequence gives
  two Claymores, not two C4: the Claymore is not on r0001's carry-once list (D:L87215-87221), so the helper gives it back
  as itself. Held by `carryOnceR0004.test.ts` ("the put-back second id"); the reachable-kit walk carries the pair and
  asserts no mine twice and C4 twice only in that shape.
- **The page carries the room's pair** (the room replays the side's whole list from the type's kit, match `room.ts`
  `loadout`, unchanged): the in-game menu opens with the pair that list leaves (viewer `weaponExchange.ts` deps
  `remembered`, wired in `matchExchange.ts`); `compactPicks` shortens a list only into one leaving the same kit and the
  same pair; the ARMORY's scroll takes its column's pair from the column's picks (`armoryState.ts` `stepArmory`), and
  `picksToReach` keeps the picks as made when the one-a-slot list would leave another pair. Held by viewer
  `test/putBackCarry.test.ts`. The bots replay one list through `applyPicks`, so carry it already.
- **Not built here.**
  - The console's loadout editor: `chooseItem` commits a kit computed by `pick` without the pair
    (`console/loadoutModel.ts` :171 and :193, `console/adapters/loadouts.ts` :387), so a launcher leaving there refills
    by the walk where the original gives back what it displaced (the review's finding 3).
  - The ARMORY's own copy (r0004 `FUN_00284480` / `FUN_00285150`, its list with the LAW and the RPG-7) is not modelled
    apart from the in-game rules; it differs structurally (no second-id re-walk; an extra gate, r4 0x2821a0, unread).
  - The cost-2 put-back (the review's finding 2): a cost-2 item (the LAW, the RPG-7) also writes `+0x1530` with what its
    partner slot displaced (r0001 `FUN_0023fef0` D:L89196-89201; r4 0x240130-0x24014c) and gives it back when it leaves
    (r0001 `FUN_0023eca0` D:L89080-89128; r4 0x2d39a0-0x2d3b24); the port does neither -- the partner slot refills by
    the walk. Settles: a transcription task with a red case on a LAW over a grenade and back.
  - The F2000 coming in reads slot 2's record with no null test (D:L89276-89281); the port's empty slot reads none
    there, the original's read of an absent record is unread.
  - The refill walk is chained in the original: each iteration passes the previous RESULT -- an item id (FUN_0023b9b0
    returns param_3, D:L87183-87185) -- masked to a byte as the walk's start index, the first call seeded 0xff (D:L88640,
    wrapping to record 0) (r0001 D:L88690, D:L88895; the argument read as a record index, D:L87143-87159; r4
    0x2d3014-0x2d3020). The port gives every
    other round slot the same `autoFill` item (arsenal.ts, the put-back's last loop). Reading, pending review.
  - The port sweeps rounds the original has no loop for: the F2000's HE (181) and F2000 SMOKE (182) -- the port's sweep is dependentOf 181-184 (arsenal.ts ~:658) -- and the MGL's 172 and 174. The original loops
    only 0xb7 for the F2000 (both revisions), 179/176/178 for the M79 and 175/171/173 for the MGL (r4). So an F2000 with
    its FRAG switched to HE keeps the HE and the remembered pair on the original, where the port writes the walk's item
    and clears the pair (arsenal.ts `dependentOf` use and the put-back's clear; predates R4P-221, R4B-06). Reading,
    pending review.
  - The M203 rifles read slot 3 with no null test once slot 2 holds a record (r0001 D:L89305; r4 0x240268-0x240274); the
    port reads none there. Reading, pending review.
