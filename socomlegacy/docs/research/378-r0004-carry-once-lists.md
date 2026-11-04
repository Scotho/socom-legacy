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
| `CARRY_ONCE_PUT_BACK_R0004_READING` (*note only*) | §3-§6: r0004's put-back lists (0x2d3cd0's 0x2d3e04-0x2d3e30; 0x285150's 0x2851ac-0x285224; 0x284ea0's set), its own-side mask (0x2d3f4c-0x2d3f58), the thermal skips and the ARMORY's thermal drop, and the launcher-exit refills act on paths the port reaches only by construction (no remembered put-back, LATER 616); the port's outcome equals r0004's for B1, B2, B4 (put-back), B5, B6, B7, held by `carryOnceR0004.test.ts`. To proven: the cluster's B1 on both images in PCSX2 (SEAL, MP1, the M4A1-M203 swap, kit counts read). |
