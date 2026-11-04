# 312 -- The network magazine refill (NET-REFILL)

- Date: 2026-10-14 (web sprint 19's clans' half, the online seat; the row NET-REFILL of
  `plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md`, filed from PAR-87's flag read, the clans' half's
  Log 2026-10-13 19:51Z in `plans/2026-10-13-web-sprint-18-the-clans-pages.md`; written before its build, no code
  changed with it).
- Status: **reading** (reviewed 2026-10-14 by a fresh reviewer: FAIL on the ledger marker of three rows, folded with its notes N2-N5; a narrow re-review PASS, high -- the plan's Log; the dry pull's same-frame round stays a placeholder). Every value of the original below is read from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted) and, for the items' ids and records, the
  disc's `zweapon.rdr` as research 94 read it through the repository's readers. Source inspection only: **no test,
  node, build or browser was run for this note**, and nothing here is measured on the original running -- ONL-32's
  capture of an online reload with no magazine left is the proven level (§7).
- Built: **NET-REFILL**, 2026-10-14 (`agent/online-netrefill`; reading, pending review): §6 N1-N5 -- the rule
  (`packages/viewer/src/net/netRefill.ts`), `MagazineRing.refill`, the room's `reload`, the page's three doors, its
  journal and the dry pull at once (`fire.ts`), the match's rule handed through `NetPageDeps.netRefill`, the ammo box's
  MAGS (`hud.ts`); §8's corrections applied. **NET-CAP**, 2026-10-14 (`agent/online-netcap`; reading, pending review):
  §10 -- the throwables' cap online read, the rule (`packages/viewer/src/net/netCap.ts`), the room's refusal and the
  page's (`grenade.ts`, `matchThrow.ts`, cleared by the gameplay seat; §10.4). §5's "the port" column and §1's "the port" row describe the port before
  it. **LATER 179 + 48**, 2026-10-20 (`agent/l179`, the gameplay seat; reading, pending review): the dry branch run
  each page frame (`Fire.dryFrame`) -- the pressed path while the trigger is held and, on the refill weapons, the `bVar6`
  path with the trigger up -- asked again each frame its reload is refused (`DRY_CLICK_FRAME_READING`), and the last
  round of an unmounted firearm of one projectile arming nothing (§2.4, §4.1, §5). *Was:* "Not built: the dry branch's
  per-frame retry while the reload is refused ... (`DRY_PULL_RETRY_READING` 'the press only'; LATER 48)".
- Stands on research [84](84-accuracy-and-recoil.md) (§18, the ring, the walk, the request, the automatic reload),
  [91](91-the-round.md) (§1's vocabulary: `DAT_0045a0c1` != 0 = online, `DAT_00437ce8` = the game; §4.1 the respawn
  option, game `+0xdc`, `+0x111` the game type), [107](107-the-ui-command-table.md) (`IsNetwork` answers the byte at
  0x45a0c1), [94](94-the-arsenal.md) (§A0 the class ranges `FUN_003d1a60` and the slot classes, §C4 the launchers and
  their round modes, the ids), [202](202-r2-c3-combat.md) and [215](215-emplaced-weapons-as-built.md) (`+0x28` =
  `Ammo_Capacity`, the ammo box's `%d/%d` and MAGS), [81](81-sounds.md) (the record's `+0x98` = `ReloadSound`),
  [205](205-r2-av-audio-card-world.md) (§2.10 `.GUN_EMPTY` at kit `+0x88c`), [234](234-the-inventory-as-built.md)
  (`BUNDLE_SLOTS_PLACEHOLDER`) and [251](251-the-effective-action-life-model.md) (§12.3 "PAR-87": the landing's walk,
  the round mode's redirect, the hand-off this note answers), and does not restate them.
- Code as read (nothing changed): `packages/match/src/room.ts` (`reload` L4688-4738, the round's refusal at
  L3046, `RoomOptions.rules` L140-141); `packages/viewer/src/magazines.ts` (`MagazineRing`: `next` L97, `canReload`
  L106, `reload` L114, `shownMags` L131, the header's "last magazine" bullet L26-27); `packages/viewer/src/fire.ts`
  (`pull` L685-694, `reload` L1010-1015, `beginReload` L1039-1058, `tryFire`'s automatic reload L1316-1319);
  `packages/viewer/src/hud.ts` (`ammoLines` L804-807, `feed` L1553-1556); `packages/viewer/src/inventoryMenu.ts`
  (`magsText` L193-194); `packages/viewer/src/net/protocol.ts` (`RESPAWN_RULES_ENABLED` L442);
  `packages/viewer/src/net/loopback.ts` (`SOLO_IS_NETWORK_READING` L29); `packages/viewer/src/netPage.ts` (the
  `reload` sent at L893); `packages/scene/src/arsenal.ts` (`itemClass`, `CLASS_RANGES`).

## 1. The answers

| question | answer | source |
|---|---|---|
| when | a reload landing in `FUN_005c2a90` whose walk finds **no other** magazine with rounds: either the one in the weapon still holds rounds and no other does (branch 1), or none of the ten does (branch 2) | D:L477447-477477, D:L477490, D:L477515-477517 |
| the gate | only while `DAT_0045a0c1` is set -- the online byte, `IsNetwork` (research 91 §1, 107); offline neither branch refills | D:L477490, D:L477517 |
| what refills | the record reloaded (the hand's slot, or in a round mode the round's slot) when its class is 4, **a pistol** (ids 4-30), in any network game; **or**, in a respawn game, any item `FUN_003d1d10` accepts -- SMG, rifle, shotgun, MG, sniper, grenade launcher -- **but the MGL (142, 0x8e) and the M79 (143, 0x8f)** | D:L477492-477497, D:L477519-477524; `FUN_003d1d10` D:L324404-324419; `FUN_003d1a60` D:L324336-324352 |
| the respawn game | the game's `+0xdc`, written by `FUN_002a7560`: the host option `mp_allow_respawn` set **and** game type 5 (SUPPRESSION) -- research 91 §4.1's `Respawn` valve | D:L149415-149433; callers D:L55620, D:L163202, D:L163244 |
| what is written | the record's `Ammo_Capacity` (`FUN_003d2810`, `+0x28`) into the magazine in the weapon (`m_reloads[slot][m_currentmag[slot]]`, kit `+0x1d4`); the index does not move | D:L477498-477500, D:L477525-477527; D:L325153-325157 |
| then | the reload clip (`FUN_005a82e0(actor, 0)`) and the record's `ReloadSound` (`+0x98`) at the actor, at full volume -- the same two calls, in the same order, as an ordinary reload | D:L477501-477509, D:L477528-477537; ordinary D:L477479-477488 |
| timing | the ordinary reload's: the same request and timer (R, or a shotgun's last shell, `ReloadDelay`), the same clip and lock; the dry branch online reloads at once, with no timer and no press -- the usual way at empty, the last round of a firearm of one projectile arming nothing (§2.4, §4.1; corrected 2026-10-20, LATER 179; was "R or the automatic reload ...; a dry pull online reloads at once") | §2.4, §4.1 |
| the HUD | online the ammo box hides MAGS for a pistol in the hand, and in a respawn game for any primary class (the grenade launchers included); the inventory menu's MAGS is not hidden | `FUN_00237760` D:L85181-85192; `FUN_002193d0` reads no flag (§4.2) |
| what the player sees online | a pistol's magazines never run out: the other magazines are walked first as offline, then the last one is refilled at every reload, R on a part-spent last magazine included; its box reads `12/12` with no MAGS line; in a respawn game the same for every primary firearm but the MGL and the M79 | §2, §4.2 |
| the port | refills nothing: room and page reload only from another magazine with rounds and show MAGS always; they agree with each other and both differ from the original in every match (the port's matches are network games) | §5 |

## 2. `FUN_005c2a90`, both branches, line by line

### 2.1 Before the branches

- The gates (D:L477394-477410): no actor, in the air (body `+0x105e` bit 5), not alive (`+0xe1` bit 4), the states
  `FUN_005a7d10` / `FUN_005a78d0` refuse, the action lock `FUN_005a7ab0`, state 9, the flinch's `FUN_005b4340(actor, 3)`
  (D:L477404-477406), the binoculars (`+0x200` == 4, D:L477410). Research 84 §18 and 251 §12.3 read them; unchanged.
- The slot (D:L477411-477445): the hand's slot (`kit+0x824`); in a round mode (`FUN_005bd7e0`, D:L477413) the first
  kit slot whose item is the mode's round, one with rounds before an empty one (research 251 §12.3 "PAR-87"). Call it
  *the slot*; its record is the item at `kit+0xe4 + slot x 4`.
- The scan (D:L477447-477459): whether any of the slot's ten magazines holds rounds -- the one in the weapon among
  them.

### 2.2 Branch 1 -- some magazine holds rounds (D:L477461-477514)

1. The walk (D:L477462-477477): from `m_currentmag + 1` round the ten (wrapping at 10) back to `m_currentmag`, for a
   magazine with rounds. It never looks at the one in the weapon.
2. Found (D:L477478-477489): the clip pushed (D:L477479; a refused push returns 0 before anything moves,
   D:L477480-477482), then `m_currentmag` = the one found (D:L477483), then the `+0x98` sound (D:L477484-477488).
   The ordinary reload.
3. Not found, online (D:L477490-477511). Since the scan found rounds and the walk found none, **the only magazine with
   rounds is the one in the weapon** -- part-spent, or full. The test (D:L477491-477497): the slot's record's class
   (`FUN_003d1e10`, D:L477492) is 4; or its id passes `FUN_003d1d10` (D:L477494), is not 0x8e (D:L477495), is not
   0x8f (D:L477496), and the game's `+0xdc` is set (D:L477497). Passing: `Ammo_Capacity` (D:L477498) written into the
   magazine in the weapon (D:L477499-477500), the clip pushed (D:L477501; refused, return 0: D:L477502-477504 -- the
   magazine already written), the `+0x98` sound (D:L477505-477509). `m_currentmag` is not touched.
4. Not found, offline -- or online with the test failing: nothing is written, pushed or played.
5. In every case of branch 1 but a refused push's early return (D:L477512-477513) the function returns 1 and sets the kit's bit 2 (the first byte's
   `0x4`), which `FUN_005bc2c0` tests and clears (research 251 §12.3; its readers not followed here).

### 2.3 Branch 2 -- no magazine holds rounds (D:L477515-477543)

1. Offline (D:L477517 fails): nothing; the function returns 0 (the `uVar5` of D:L477409).
2. Online: the same test (D:L477518-477524, its clauses grouped differently, the same set), the same write
   (D:L477525-477527), the same push (D:L477528); refused, return 0 (D:L477529-477531); else the sound
   (D:L477533-477537), return 1 and bit 2 (D:L477538-477539). Test failing: return 0, nothing written.

### 2.4 The push, the timing and the sound

- **The push cannot refuse here.** `FUN_005a82e0` (D:L462788-462946) answers 0 only when `FUN_005b4340(actor, 3)`
  answers no (D:L462816-462818) and 1 otherwise (D:L462943); `FUN_005c2a90` has asked the same at its gate
  (D:L477404-477406) in the same call. So the written-but-refused case (D:L477502-477504, D:L477529-477531) does not
  arise from this caller. `FUN_005a82e0(actor, 0)` is the reload's clip (not the after-shot's, which `FUN_005c3000`
  pushes with 1): its family by the record's class, over `ReloadTime` when still (research 84 §18, 251 §12.3) --
  the clip, its hold and its lock are those of an ordinary reload of the same weapon.
- **The timing.** `FUN_005c2a90` is reached (1) when the kit's timer `kit+0x820` runs out (`FUN_005c0fd0`
  D:L476549-476561): armed by R (`FUN_00594cf0` D:L453459-453463 -> `FUN_005c32b0`) or by `FUN_005c5340`'s arm, over the
  record's `ReloadDelay`, **with no test of the ring** (armed whether or not another magazine has rounds) -- mounted at
  the magazine's last round, and unmounted only at 0 before the spend (D:L479287-479300, D:L479317-479320): a shotgun's
  pellets after the first, its shell spent at the first (research 94 §C1.1); or (2) from the kit frame's dry branch,
  directly (§4.1) -- the usual way an unmounted firearm of one projectile reloads at empty, its last round arming
  nothing. In (1) the refill lands exactly where an ordinary reload would have swapped the magazine. The ordinary path
  swaps after the push (D:L477483); the refill writes before it (D:L477499-477501) -- no difference a frame can show.
  *Corrected 2026-10-20 (LATER 179, after research 94 §C1.1's re-filing; reading, pending review). Was:* "armed by R
  ... or by the automatic reload at the magazine's last round (`FUN_005c5340` D:L479297-479320, **with no test of the
  ring**: armed whether or not another magazine has rounds), over the record's `ReloadDelay`; or (2) from the dry pull,
  directly (§4.1)."
- **The sound.** The record's `+0x98` -- its `ReloadSound` (research 81 §5) -- through its vtable `+0x14` at the actor's
  `+0x1c`, 1.0, 0xff: the call of the ordinary path (D:L477486-477487) repeated (D:L477507-477508, D:L477535-477536).
- Other callers of `FUN_005c2a90`, the AI's (`FUN_005fe880` D:L510425, `FUN_00608840` D:L515060), take the same
  branches; not followed (no AI in a network game's MP).

## 3. `FUN_003d1d10` and the set

- `FUN_003d1d10` (D:L324404-324419) takes an item id, asks its class of `FUN_003d1a60` (D:L324410; the id ranges
  D:L324336-324352, research 94 §A0) and answers for the classes 0x1f, 0x33, 0x51, 0x5b, 0x8d and 0x65 (D:L324411-324412):
  **SMG (31-50), rifle (51-80), shotgun (81-90), MG (91-100), grenade launcher (141-144), sniper (101-120)** -- the
  primary slot's classes (research 94 §A0 "slot class", L89; §B6 L946: "Class 0 takes primary categories only").
  `FUN_003d1db0` (D:L324442-324455) is the same test on a class rather than an id; `FUN_003d1ce0` (D:L324392-324399)
  and `FUN_003d1da0` (D:L324433-324437) are class 4's two forms; `FUN_003d1e10` (D:L324460-324465) is
  `FUN_003d1a60` of a record's `+0x7c`.
- 0x8e = **142, the MGL**; 0x8f = **143, the M79** (research 94's id table, rows 142-143; the menu's valves
  `Enable_mglmk1`, `Enable_m79`). The grenade-launcher class also holds 141, the M203 -- the M203 rifles' attached
  launcher item, Cap 0, an equipment-slot dependent (research 94 §C4) -- which the test lets through: a refill of it
  would write 0; no record has id 144.
- **The respawn set, exactly:** the pistols (class 4, in any network game) and, in a respawn game, the SMGs, rifles,
  shotguns, MGs and sniper rifles (and the Cap-0 M203). Not refilled: the MGL and the M79 (their own rings: MGL 6 x 2,
  M79 8 x 1), every launcher round (class 0xab, 171-184: a round mode's slot, research 251 §12.3), the rocket
  launchers and rounds, grenades, explosives, gear, turrets. The MGL and the M79 have no firearm mode (MaxFireMode 0,
  research 94 §C4.2) and fire through a round mode while a round is held, so the exclusion bites only on their own
  ring.
- **PAR-87's read, checked.** Its two ranges (D:L477490-477510, D:L477517-477541), the pistol, the respawn valve, the
  exclusions, the write, the push and "the flag is the online byte" are what the source says. One part disagrees:
  it called `FUN_003d1d10` "a firearm-ring predicate, not read: research 234, `BUNDLE_SLOTS_PLACEHOLDER`". It was read --
  research 94 §A0 (L324404, the primary slot class) and research 251 §12.3 cite it -- and it is the primary-class
  test above. `BUNDLE_SLOTS_PLACEHOLDER` asks a different question (which kit slots join a death's bundle,
  `FUN_005ba040`) and is not settled by this note. The row's cite D:L477486-477541 opens on the ordinary path's sound
  (D:L477486-477488); the refill is D:L477490-477541. `FUN_002a7560` is D:L149407-149434 (L149405 is its banner).

## 4. The flag's other effects on the weapon, ammo and HUD path

`DAT_0045a0c1` has 389 reads in the decompilation. Those in the kit (`FUN_005b*`-`FUN_005c*`), the pad's reload
(`FUN_00594cf0`) and the HUD's weapon box (`FUN_00237760`, `FUN_00237e50`) were read; two belong to this row.

### 4.1 The dry pull (`FUN_005c0fd0` D:L476564-476635) -- the refill's second door

*Corrected by PAR-93 (2026-10-14, the gameplay lane, on the online seat's consent for this section; research 305 §2.3
re-filed with it). Reading, pending review.* The section read the branch as entered "when the fire is asked
(`FUN_005c1970`, D:L476566)" and called the pressed path "offline"; the online path's trigger and its once or every
frame were left to PAR-93. The text as it stood is kept under "Was" below.

Each kit frame -- `FUN_005c0fd0` runs from the actor's frame, `FUN_005506a0` D:L417907 -- whose timer is still
(`kit+0x820` == 0: D:L476549-476563; a reload's `ReloadDelay` or a bolt's or pump's lock running keeps the branch shut)
and whose `FUN_005c1970` answers (D:L476565-476568). `FUN_005c1970` (D:L476815-477151) is not a request of the fire: it
answers 1 straight for a controller whose vtable `+0x34` answers (D:L476875, D:L477147-477149), and otherwise 1 for any
item in the hand (D:L477144) but on an explosive's or a placed item's release frame (`kit+1` bit 1 with `kit+0x87c` run
out, D:L476883-477021: returns 0); with no item in the hand, 0 (D:L476878-476879). It reads no trigger. Then, the fire
not given (`FUN_005c0ae0` 0, D:L476569 -- which it answers at rest and at the release, trigger states 0 and 3,
D:L476380-476416, so the branch runs with the trigger up too), with an item in the hand whose magazine is empty
(`FUN_005bd530` 0, D:L476575; the magazine in the weapon, D:L474296-474297) and which is a firearm (not the ids of
D:L476579-476589 -- 0xff, 0xfe, 0xc3, 0xc2, 0x91, 0x8d, 0x92, 0x0b, 0xc1, 0xbe -- and `FUN_003d1e20`, D:L476590):

- *the pressed path* (`bVar11`; **offline and online alike** -- it reads no `DAT_0045a0c1`): while the dry count
  `kit+0x818` (which the pull's rounds raise too: a firearm's round, `FUN_005be9a0` D:L475514-475517) is under the
  pull's limit (`FUN_005c0940`, D:L476283-476310: 1 when no magazine holds rounds, else the fire mode's 1, 3 or 10000;
  0 for a mode word 0, which the spawn cycles up, research 94 §C4.2) and the trigger is down (states 1 and 2, D:L476591-476592, D:L476616), the empty
  click (`.GUN_EMPTY`, `kit+0x88c`, while the count is under 2: D:L476617-476620, research 205 §2.10), then
  `FUN_005c2a90` **at once** when a magazine of the slot holds rounds (`FUN_005bdb00` -> `FUN_005bda70`
  D:L474519-474538: any of the slot's ten; D:L476621-476622) -- no `FUN_005c32b0`, so no `ReloadDelay` -- else the
  count rises (D:L476630-476631), which with the limit 1 makes one click a press.
- *online, a refill weapon* (`bVar6`, D:L476596-476615): for an item whose id (`+0x7c`) is not 0x8e or 0x8f and whose
  class is 4, or in a respawn game passes `FUN_003d1db0` (the same set as §3), `FUN_005c2a90` runs **whatever the
  count, the trigger or the ring** (D:L476616, D:L476621) -- **no press is needed** -- so the refill; the click plays
  while the count is under 2 (D:L476618) and the count does not rise on this path (D:L476630 is not reached; corrected
  at the review); and when `FUN_005c0ae0` then answers, the round is fired in the same frame (`FUN_005be9a0`,
  D:L476623-476627). Whether it answers right after the push is not followed (`FUN_005c0ae0`'s lock test
  `FUN_005a7de0`, D:L476442, reads the clip just pushed): `NET_REFILL_DRY_PULL_READING`.
- **Every frame, until a reload lands** (PAR-93). Neither path keeps a once where a reload is asked: the count is raised
  only where none is (D:L476630-476631). So while `FUN_005c2a90` refuses (its gates, §2.1: in the air, mid-swap, the
  flinch), the pressed path asks the click (under the count of 2) and the reload again every frame the trigger stays
  down, and the refill path every frame whatever the trigger; the first frame its gates pass, the reload lands, the
  magazine holds rounds and the branch shuts (D:L476575). With no magazine to take and no refill, one click a press. The
  port runs the branch once a page frame (`Fire.dryFrame`, LATER 48, 2026-10-20): the reload lands on the first frame
  whose gates pass, as the original's; the click, asked each refused frame while the count is under 2, repeats at the
  page's frame rate, not the kit's (`DRY_CLICK_FRAME_READING`, viewer `fire.ts`). *Was:* "The port's dry door is the
  press only (`Fire.pull`'s edge): `DRY_PULL_RETRY_READING` ..., the online lane's LATER 48".
- Online, an unmounted refill weapon of one projectile (the pistols; in a respawn game the primaries too, §3) arms nothing at its last round (§2.4; research 94 §C1.1), so this unpressed path is its usual door: on the frame after
  the last round, the click and the refill at once, with no press and no `ReloadDelay`; refused (in the air, mid-swap,
  in the flinch), again each frame until it lands. A shotgun's last shell still arms `ReloadDelay` (§2.4), which keeps
  the branch shut while it runs. *Corrected 2026-10-20 (LATER 179; reading, pending review). Was:* "Online, a refill
  weapon reaches this door only when its automatic reload did not land (refused at `FUN_005c2a90`'s gates: in the air,
  mid-swap, in the flinch); the automatic reload (§2.4) is the usual door."

**Was** (until PAR-93; kept): "When the fire is asked (`FUN_005c1970`, D:L476566) and cannot be given (`FUN_005c0ae0`
0, D:L476569), with an item in the hand whose magazine is empty ... and which is a firearm ...: *offline*: while the dry
count `kit+0x818` is under the mode's rounds a pull (`FUN_005c0940`, D:L476283-476310) and the trigger is down
(D:L476591-476592, D:L476616), the empty click ..., then `FUN_005c2a90` **at once** when the slot has a magazine with
rounds ... -- else the count rises (D:L476630-476631). *online* (D:L476596-476615): for an item that is not 0x8e or 0x8f
and is class 4, or in a respawn game passes `FUN_003d1db0` (the same set as §3), `FUN_005c2a90` runs **whatever the
count, the trigger or the ring** ..." -- `FUN_005c1970` read as the fire's request, and the pressed path labelled
offline.

### 4.2 The ammo box (`FUN_00237760` D:L85181-85205)

- MAGS is `FUN_005c49b0` (the magazines with rounds, D:L85159) less one (D:L85191), hidden below 1, with no weapon, or
  (D:L85192) when the flag test set `cVar3`. The test (D:L85181-85188): online and a kit, the hand's class
  (`FUN_005c8040` D:L480686-480696: the item at the hand's slot, **not** a round mode's redirect) is 4
  (`FUN_003d1da0`, D:L85183); else, in a respawn game (D:L85184), it passes `FUN_003d1db0` (D:L85186).
- So online: a pistol in the hand shows `%d/%d` and no MAGS line, in every network game; in a respawn game every
  primary class does -- **the MGL and the M79 included** (`FUN_003d1db0` has no id exclusion), though their own rings
  are not refilled. In a round mode the class is the carrier's, and a round is one magazine (no MAGS line anyway,
  research 202 item 3). `%d/%d` is unchanged (D:L85189-85190).
- The in-game select's MAGS (`FUN_002193d0`, D:L71387 on; HUDCLOC 60482/60483, `inventoryMenu.ts` `magsText`) reads no
  flag: online it still counts the spare magazines.
- `FUN_00237e50` (D:L85354-85356) gates the box's drawing on the flag and the player's alive bit (box visibility, not
  ammo).
- Consistent with research 87 §6's console frame (`30/30 2 MAGS` on a rifle): a rifle shows MAGS offline and in a
  network game without respawn.

### 4.3 Found, not this row's

- **The throwables' cap online** (`FUN_005c0ae0` D:L476470-476491): for a hand item of class 0x79 (grenade), 0x97
  (explosive), 0xab (launcher round) or 0xb9 (rocket round), online and for a local actor (controller `+0x34`), the use
  is refused while the player owns more than five such projectiles in the pool (`FUN_003cb8f0(DAT_004b5220, id)`,
  D:L320898-320952, counts them). Not in any note found; for the controller, a row of its own (the room's throw and
  launch paths). Read, and built in the room, by NET-CAP: §10.
- `FUN_005bb990` (D:L473536-473616, five reads): the bundle pickup's network split (who takes, what is told) -- research
  234's (`AMMO_TRANSFER_PLACEHOLDER`, `FUN_005bb000`); not a refill.
- `FUN_005bc730` (D:L473981-473984): an MPBOMB (0x9a, 154) placement online is a request to the host (`FUN_002c2090`).
- `FUN_005c0250` (D:L476239-476251): online, for the local actor, the slots' mode words set from a table at
  `DAT_0066b580` (not followed).
- `FUN_005c5340` (D:L479130, D:L479232, D:L479495): the shot's network messages and an offline-only call; no ammo.
- `FUN_00594cf0` (D:L453099, D:L453107): not the reload's request (D:L453459-453463 has no flag test).

## 5. Offline, online and the port

| | the original offline | the original online | the port (room and page) |
|---|---|---|---|
| R with another magazine holding rounds | the walk's next (D:L477478-477489) | the same | the same (`MagazineRing.reload`; room `reload` L4716) |
| R, last magazine part-spent | returns 1, nothing moves (D:L477512) | pistol / respawn primary: refilled, clip and sound | page refuses (`Fire.reload` L1011, `canReload`); no `reload` sent; room would refuse (L4716) |
| last round fired | unmounted, one projectile: nothing armed -- the dry branch reloads (§4.1: held, the next frame; else at the next press); a shotgun's last shell or mounted: timer armed (D:L479287-479320), lands on nothing when no magazine holds rounds | the same; a refill weapon's dry branch refills the next frame with no press (§4.1) | *since LATER 179 + 48 (2026-10-20)*: as the original -- `tryFire` arms only a pull of more than one projectile (`n > 1`), `Fire.dryFrame` each frame; the room unchanged (the page's `reload` at its `reloadStart`). *Was:* "page arms only when `canReload` (L1316-1319); none"; the original's columns were "timer armed (D:L479318-479320), lands on nothing" and "timer armed, lands on the refill" |
| R, every magazine empty | nothing (D:L477517) | refill as above | refused, room and page |
| dry pull | click; reload at once if a magazine holds rounds (D:L476621-476622) | refill weapon: click and reload at once, always (§4.1) | click; reload after `ReloadDelay` if `canReload` (`pull` L689-693) -- *before PAR-93 (the gameplay lane, 2026-10-14): the reload now starts at once, `FUN_005c2a90` in the same frame, D:L476622, offline and online* |
| ammo box MAGS | magazines with rounds less one | hidden for a pistol; in respawn for primaries (§4.2) | always shown (`ammoLines`, `shownMags`) |
| round in the room | from the magazine in the weapon | the same | refused when empty (L3046) |

- **Which side owns what.** The room is authoritative for the rings (a round is refused at L3046 when the room's
  magazine is empty) and decides the reload at its command (`reload`, L4697); the page predicts the same ring (`Fire`)
  and sends `reload` at its own `reloadStart` (`netPage.ts` L893). A refill on one side only would desynchronise them:
  the page firing rounds the room refuses (page refills, room does not), or a page that never asks (room refills, page
  does not). Both change together.
- **Every port match is a network game.** The match server's rooms are; the page's single-player match runs the same
  room with every `DAT_0045a0c1` rule on its network branch (`SOLO_IS_NETWORK_READING`, `loopback.ts` L29), so the
  refill applies there too. A page with no match (the free roam, the test room's instruments) is offline: no refill.
- **The respawn half** is the room's `rules === 'respawn'` (SUPPRESSION with RESPAWN on, `protocol.ts` L422; game
  `+0xdc`, the room's `RoundOverReport.respawn`). `RESPAWN_RULES_ENABLED` is off (L442, the owner's ruling of
  2026-09-29), so live games are classic and only the pistol half shows today; the respawn half is held by tests.
- The room knows its records (`p.records[w]`, `magazine` = `Ammo_Capacity`) and has no round mode (research 251 §12.3);
  the page's `Fire.ring` is the round's in a round mode, where the class is a launcher round's -- no refill, so no
  page reload reaches the room in a round mode, as today. That rests on the kit table (the online parity sweep's WK-6,
  2026-11-02): every launcher and rocket round has `NumMags` 1 (6 x 1, 8 x 1, 3 x 1, 1 x 1) and no carrier a
  `ReloadDelay`, held by `match/test/launcherRoundReload.test.ts` over the readers' goldens; a table that gave a round a
  second magazine (a modded or DLC one) would let a reload in its mode move the rifle's ring and read the carrier's
  delay in `Room.reload` / `reloadPress`, which carry no mode (the comment in `Room.reload`). Latent; not built.

## 6. What NET-REFILL builds

About **3 points**, simulation track, room AND page. `room.ts` and `fire.ts` are hot files shared with the gameplay
lane: claimed through HANDOFF §3 after the gameplay seat is told (W19.R4).

1. **N1 -- the rule and the ring (S, 0.5).** A shared module both sides import, as `net/flinchReload.ts` is
   (proposed `packages/viewer/src/net/netRefill.ts`): `netRefills(id, { respawn })` -- class 4 (`itemClass` 'pistol');
   or `respawn` and a primary class (`smg`, `rifle`, `shotgun`, `mg`, `sniper`, `grenadeLauncher`) and the id not 142
   or 143 -- carrying `NET_REFILL_READING`; and `MagazineRing.refill()` in `magazines.ts`: the magazine in the weapon
   to `capacity`, the index and the other slots unchanged. *Test first*: `packages/viewer/test/netRefill.test.ts` (on
   the disc's ids: the Mark 23 15 true in both rules; the M4A1 54 false classic, true respawn; the MGL 142, the M79
   143, the M203 HE 171, the LAW 145, the M67 false in respawn; every pistol and every primary of the kit table by
   class) and `packages/viewer/test/magazines.test.ts` (`refill` on a part-spent last magazine and on an empty ring:
   capacity in the current slot, the rest as they were; `next()` still -1).
2. **N2 -- the room (S, 1).** `room.ts` `reload`: when `p.mags[w].reload()` finds nothing and
   `netRefills(p.records[w].id, { respawn: this.opts.rules === 'respawn' })`, `refill()` and go on as the ordinary
   reload -- the lock, the life and the `reloadSound` broadcast unchanged (D:L477501-477509 are the ordinary calls).
   The refusals before it (the lock, the swap, the air, the flinch, the cover) stay first. *Test first*:
   `packages/central/test/roomReloadRefill.test.ts` (new): a classic room, the pistol's three magazines fired out -> R
   accepted at its command, 12 rounds, the reload's lock, the others told `reloadSound`; R on a part-spent last pistol
   magazine -> full; the M4A1 in classic refused as today; a respawn room: the M4A1 refilled, the MGL's own ring not;
   the next round accepted where it was refused (L3046).
3. **N3 -- the page (S, 1).** `fire.ts`: the match gives `Fire` its network rule (a `FireSource.netRefill?()`
   answering `{ respawn }` from `NetPage`'s rules, null with no match); `reload`, `tryFire`'s automatic reload and
   `pull`'s dry path ask `canReload() || refills` (never in a round mode: the round's class fails the rule);
   `beginReload` refills when the walk finds none, logged in the ring's journal so `undoReload` / `restoreReload` take
   it back; the dry pull of a refill weapon online reloads at once, with no `ReloadDelay` and no round in the same frame
   (`NET_REFILL_DRY_PULL_READING`). The `magazines.ts` header's "last magazine" bullet says the offline rule and names
   the network one. *Test first*: `packages/viewer/test/fire.test.ts` "NET-REFILL" (the Mark 23 fired out with the rule
   on: `reloadStart` after `ReloadDelay`, 12/12; R on the part-spent last; off: refused as today; in a round mode on the
   M4A1-M203 with respawn on: nothing) and a bridged test on `roomReloadLock.test.ts`'s pattern (the page's `Fire` and
   the room through `NetPage.fireEvent`: the same command, the same ring, the same lock; the next round accepted).
4. **N4 -- the HUD's MAGS online (S, 0.5).** The box's MAGS hidden when the rule's HUD form holds for the hand's
   record (class 4 online; a primary class -- the MGL and M79 included -- in a respawn game: D:L85181-85188), the
   inventory menu's MAGS unchanged; `NET_REFILL_MAGS_HIDDEN_READING`. *Test first*: `packages/viewer/test/hud.test.ts`
   (the Mark 23 online `12/12`, no MAGS; the M4A1 classic `30/30 2 MAGS`, respawn no MAGS; the MGL in respawn no
   MAGS) and `packages/viewer/test/inventoryMenu.test.ts` (the pistol's row keeps its MAGS online).
5. **N5 -- the documents (with N1-N4).** §8's corrections; research 101's ledger rows for §7's names; `fire.ts`'s and
   `magazines.ts`'s comments citing this note; the corpus regenerated (`tools/build-corpus.ts`, which
   `tools/test/corpus.test.ts` checks -- this note is not in it yet: no node was run for it).

**Flagged, not counted**: the throwables' cap online (§4.3), a row of its own; the dry pull's offline timing (the page
waited `ReloadDelay` where the original reloads at once, D:L476621-476622: one frame for most records, 0.5-1 s for the
Spas 12, the JACKHAMMER and the 870) -- the gameplay lane's, **built by its PAR-93** (2026-10-14: the reload at once, offline
and online, the pressed path reading no network flag); the dry branch's per-frame retry while the reload is refused stays
LATER 48.

## 7. Placeholders and readings

Proposed for NET-REFILL; each was *note only* until the build carried it (the ledger's rule). Built by NET-REFILL (2026-10-14): all three in code (the first two in viewer `net/netRefill.ts`, the third in viewer `fire.ts`); research 101 lists them (NET-REFILL).

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `NET_REFILL_READING` (in code: viewer `net/netRefill.ts`; read by server `room.ts` `reload`, viewer `fire.ts`) | `'online, a reload whose walk finds no other magazine with rounds refills the one in the weapon to Ammo_Capacity: a pistol in any game; in a respawn game any primary but the MGL and the M79'` | `FUN_005c2a90` D:L477490-477541, `FUN_003d1d10` D:L324404-324419, `FUN_002a7560` D:L149415-149433 | ONL-32's capture of an online reload with no magazine left: the Mark 23 fired out in a classic game (refilled, clip, sound), the M4A1 in the same (refused, dry), in a respawn game the M4A1 (refilled) and the MGL out of rounds; R on a part-spent last magazine | reading, pending review |
| `NET_REFILL_MAGS_HIDDEN_READING` (in code: viewer `net/netRefill.ts`, `netMagsHidden`; read by `fire.ts` `state`, drawn by `hud.ts` `ammoLines`) | `'online the ammo box hides MAGS for a pistol in the hand; in a respawn game for any primary class; the select's MAGS is not hidden'` | `FUN_00237760` D:L85181-85192, `FUN_005c8040` D:L480686-480696; `FUN_002193d0` reads no flag | an online frame of the box with a pistol and spare magazines (classic), a rifle in a respawn game, and the select's row | reading, pending review |
| `NET_REFILL_DRY_PULL_READING` (in code: viewer `fire.ts`, `Fire.dryFrame`, the dry branch; was `Fire.pull`'s dry door) | `'at once, no round in the same frame'` (online, the dry branch on a refill weapon reloads at once, no `ReloadDelay`; the code's value) | `FUN_005c0fd0` D:L476596-476627 (the dry branch asks with no press on the refill weapons and re-asks each frame while the reload is refused -- built by LATER 48, 2026-10-20: `Fire.dryFrame`, `DRY_CLICK_FRAME_READING`; was "not built, PAR-93's `DRY_PULL_RETRY_READING`"); whether `FUN_005c0ae0` answers after the push (`FUN_005a7de0` D:L476442) not followed | the same capture: a pistol fired dry in the air online -- the click each frame, the refill on the landing frame with no press (was: "a pistol's automatic reload refused in the air, then a dry pull on landing") | reloads at once: reading, pending review; no round in the same frame: placeholder (`FUN_005a7de0` D:L462592 -> `FUN_005a7ab0` D:L462510- not followed) |

The names this note leans on are each listed where they live: `SOLO_IS_NETWORK_READING` (viewer `net/loopback.ts`),
`RESPAWN_RULES_ENABLED` (viewer `net/protocol.ts`, the owner's ruling), `BUNDLE_SLOTS_PLACEHOLDER` and
`AMMO_TRANSFER_PLACEHOLDER` (research 234; not settled here), `RELOAD_SECONDS_PLACEHOLDER` (viewer `reloadClip.ts`).

## 8. Corrections owed (the build row applies them; applied by NET-REFILL, 2026-10-14)

- **Research 84 §18**, "A reload" (L734-737). Now: "With no other slot holding rounds the walk finds nothing and no
  reload starts (the `DAT_0045a0c1` branch, 477486-477505, refills the current magazine instead; the same flag hides
  MAGS in the ammo box, `FUN_00237760` 85181-85188, 85192 -- read as an unlimited-ammo mode, not identified further and
  not modelled)." Corrected: "With no other slot holding rounds the walk finds nothing, and offline no reload starts.
  In a network game (`DAT_0045a0c1`, `IsNetwork`: research 107) the magazine in the weapon is refilled to
  `Ammo_Capacity` instead, with the reload's clip and sound, for a pistol (class 4) in any network game and, in a
  respawn game (`DAT_00437ce8 + 0xdc`), for any primary firearm but the MGL and the M79 (D:L477490-477541); a like rule
  hides MAGS in the ammo box: a pistol in the hand, and in a respawn game any primary class, the MGL and the M79 included
  (`FUN_00237760` D:L85181-85192). Research 312; built by NET-REFILL."
- **Research 251 §12.3**, "PAR-87", *The network refill* (L1586-1589). Now: "... research 107 identifies 0x45a0c1 as
  `IsNetwork`. The firearms' half waits on `DAT_00437ce8 + 0xdc` (unread). Not modelled by the port. For the controller:
  a row of its own." Corrected: "... research 107 identifies 0x45a0c1 as `IsNetwork`. The firearms' half is the respawn
  game: `+0xdc` is the `Respawn` valve, the host option set and game type 5 (research 91 §4.1; `FUN_002a7560`
  D:L149415-149433); `FUN_003d1d10` is the primary-class test, the MGL (0x8e) and the M79 (0x8f) excluded (research 312
  §3). Built by NET-REFILL (room and page; the ammo box's MAGS with it)." And in "The landing" (L1548): "a firearm
  class (`FUN_003d1d10` D:L324404-324419)" -> "a primary class (`FUN_003d1d10` D:L324404-324419: SMG, rifle, shotgun,
  MG, sniper, grenade launcher)".
- **`packages/viewer/src/magazines.ts`'s header**, "The last magazine" (L26-27): "offline, with no other magazine
  holding rounds a reload finds nothing and does not start; the weapon runs dry and its trigger clicks. Online the
  last magazine is refilled for the classes research 312 names (`./net/netRefill`)."
- **The clans' half's Log, PAR-87's entry** (sprint 18's plan, 2026-10-13 19:51Z): not edited (a Log is a record); the
  build row's Log entry names §3's correction of "`FUN_003d1d10` ... not read".

## 9. What is left

- **Not read here**: what `FUN_005bc2c0` does with the kit's bit 2 (D:L477513, D:L477539); whether `FUN_005c0ae0`
  answers right after the dry pull's push (§4.1); the AI callers of `FUN_005c2a90` (§2.4); `FUN_005c0250`'s table
  (§4.3); the throwables' cap's projectile pool (§4.3; read: §10).
- **The proven level**: ONL-32's capture (§7) -- the refill's moment, its clip and sound, and the box's MAGS online.

## 10. The throwables' cap online (NET-CAP, 2026-10-14)

The row NET-CAP of `plans/2026-10-13-web-sprint-19-clan-games-and-the-clans-ladder.md` (§4.3's find). Status: **reading,
pending review**. Source inspection of the retail decompilation (`D:L<n>`, `FUN_<addr>`; cited, never pasted); built in
the room with unit tests (§10.4); nothing measured on the original running -- ONL-32's capture of a sixth use refused
online is the proven level (§10.5). Written here rather than in a note of its own: the find is §4.3's, and the read is
one function and its count.

### 10.1 The refusal (`FUN_005c0ae0` D:L476470-476491)

- **Which use.** The record in the hand's slot (`kit+0xe4 + kit+0x824 x 4` -- the slot itself, not a round mode's
  redirect) when it is none or its class (`FUN_003d1e10` -> `FUN_003d1a60` D:L324336-324352) is 0x79 grenade (121-140),
  0x97 explosive (151-170), 0xab launcher round (171-184) or 0xb9 rocket round (185-189) (D:L476470-476477).
- **When.** The manager 0x4b5220 built and `DAT_0045a0c1` set -- online (D:L476478-476479); the actor's controller
  answering no at its vtable `+0x34` -- `IsRemote` (research 193, its finding 9): the console's own actor
  (D:L476480-476485); and `5 < FUN_003cb8f0(DAT_004b5220, actor+4)` (D:L476485-476486): the sixth live projectile
  refuses the next use. Then `bVar2` is false and `FUN_005c0ae0` answers 0 (D:L476487-476488, D:L476496-476498).
- **Where in the gate.** After the trigger's state, the pull's count (D:L476439-476441), the kit's lock `FUN_005a7de0`
  (D:L476442-476445), the kit's timer `+0x81c` (D:L476446-476448) and the empty-magazine test (D:L476449-476469); before
  the round mode's own (`FUN_005bd7e0` / `FUN_005bdb00`, D:L476500-476503).
- **What a refusal does.** `FUN_005c0fd0` asks `FUN_005c0ae0` (D:L476569); given, `FUN_005be9a0` runs
  (D:L476637-476638): the hand grenade's release request (D:L475490), the claymore's and the PMN's placing (D:L475306,
  D:L475338). Refused, the dry branch (D:L476573-476575) does nothing at all for these uses: past its empty-magazine
  test it needs `FUN_003d1e20` to answer non-zero (D:L476590), and `FUN_003d1e20` answers 0 for every one of the four
  classes (D:L324477-324479) -- so no click, no pull count, no refill, no second ask. A refused use pushes no clip,
  spends nothing and shows no message (no UI call in D:L476470-476491). *(Corrected by NET-CAP's review, F1: the first
  text listed C4's `Put on wall`, D:L475420, among the gated uses, and read the refused branch only to its
  empty-magazine test.)* What the controller's wind-up and release bit do over a refused
  frame is not followed (`FUN_00594cf0`, research 251 §12.8's chase): `NET_CAP_REFUSED_USE_PLACEHOLDER`.
- **Which uses that leaves.** Grenades (the M67, the AN-M8, the Mark141, the HE) and the claymore and the PMN (the
  satchel is on no MP kit, research 94). **Not C4** (F1 of the review): C4 is planted by the Action button (mask
  0x40000, `FUN_00592d50` D:L452030-452055), which calls `FUN_005c0020(..., 0x97)`; `FUN_003d1e20` answers 0 for C4's
  class, so `FUN_005c0020` goes straight to `FUN_005be9a0` (D:L475985-475994) and `FUN_005c0ae0` is never asked --
  its only callers are D:L424497, D:L427749, D:L428062 and the kit's frame (D:L476569, D:L476623). The port already
  holds that path (`grenade.ts` `plantC4`; the mover's C4 action). DEMOLITION's bomb plant, `FUN_005c0020(..., 0x9a)`
  (D:L451514), likewise bypasses it, and the port's bomb plant is uncapped. C4 set down still counts (§10.2).
  **Not a launch**: choosing a round puts the hand on its
  carrier (`FUN_005c8a20` D:L481385, D:L481471-481487 -- `FUN_003c5d20` a round, `FUN_003c5d80` a carrier: 52, 61, 63,
  142, 143 or class 0x91, D:L317258-317300), so an M203 round leaves with an M203 rifle (0x33) or the MGL / the M79
  (0x8d) in the hand, and a rocket with its launcher (0x91): none of the four. The classes 0xab and 0xb9 in the hand's
  test meet a slot that holds the round itself, which this selection never leaves (the other writers of `kit+0x824` --
  D:L65237, D:L65504, D:L126872-127033, D:L478842 -- not followed). The rounds and rockets in flight count all the same
  (§10.2). The Detonator (193, gear) is never refused. `NET_CAP_READING`.

### 10.2 The count (`FUN_003cb8f0` D:L320898-320952)

- **The manager** (its layout from `FUN_003cca90` D:L321497-321532, `FUN_003cbdf0` D:L321035-321094, `FUN_003cc3c0`
  D:L321250-321297): `+0` a pool array of 0xc4-byte projectiles, `+4` a pointer list (`+8` its count, `+0xc` its data),
  `+0x10` the pool's active bytes, `+0x14` the first free slot, `+0x18` the high mark (the highest active slot, -1 with
  none), `+0x1c` the pool's size.
- **The list** (D:L320915-320929): entries whose owner `+0xac` is the actor's `+4` and whose record `+0xc` is of the
  four classes. It holds **the charges set down**: `FUN_005bc730` makes each on the heap (`FUN_00180e10(0x110)`,
  D:L473988-473992 -- not the pool), launches it with the actor's `+4` as its owner (D:L474064-474065; `FUN_003cb1a0`
  writes `+0xac`, D:L320745) and appends it (D:L474104): C4 (0x97), the satchel (0x98), the claymore (0x99), the PMN
  (0x9e); MPBOMB online is the host's request instead (D:L473980-473983). An entry leaves when it has gone off (the
  frame's walk `FUN_003cc770`, its vtable `+0xc` answering, D:L321414-321424), by `FUN_003cc2d0` (D:L321221-321246),
  the satchel's `FUN_003cbc60` (D:L320993-321031) or an owner's sweep `FUN_003cceb0` (D:L321647-321728; the round's
  end, research 203 §11).
- **The pool** (D:L320931-320947): its active entries of the owner's, the same test. It holds **what flies**: the take
  `FUN_003cca90` serves the round's leaving `FUN_005c5340` (D:L479345-479349: every round but item 11's -- a grenade's
  throw, research 85; a launched round; a rocket; a firearm's round too), the backblast (`FUN_003d2d70` D:L325635), a
  turret's round (D:L300347); `FUN_003cbdf0` another's (D:L107202, research 213). An entry leaves at the frame's walk
  when its vtable `+0xc` answers 1 (D:L321433-321458), or by `FUN_003cc3c0` / `FUN_003cc500` / `FUN_003cceb0`.
- **So, for one owner**: every grenade thrown until it is removed (a smoke's whole cloud: the record's removal time,
  `+0x90`), every launched round and rocket until it bursts, the backblast (159, class 0x97) for its frame, every
  charge set down until it goes off.
- **The empty pool.** The pool's walk runs only when the high mark is not -1; when it is, the function answers **-1**,
  the list's count already made dropped (D:L320931-320933; the mark raised by the take, D:L321508-321510, and
  recomputed at a free, D:L321272-321285). So charges set down never refuse while nothing at all flies in the level;
  anything in the air, anyone's, makes them count. -1 too when the manager is not built (D:L320909-320914).
  `NET_CAP_EMPTY_POOL_READING`.

### 10.3 The port's equivalents

- **The room** (`packages/match/src/room.ts`): `flying`, per owner by the player object (as `chargesDown`): a charge
  set down is an entry with `facing` that is not the backblast (the list); the rest -- grenades, launched rounds,
  rockets, the backblast -- the pool; live until `removed` (`@s2u/scene` `stepGrenade`: the record's fuse and removal
  times). A firearm's round is no projectile in the room, so a pool held only by rounds in flight is not seen (the
  reading's remainder).
- **The page** (`packages/viewer/src/grenade.ts` `GrenadeThrower.live`): its own entries (not `remote`) -- a grenade
  thrown, a charge set down (`facing`), a launched round or rocket (`launchRound`); the others' (`launchRemote`) hold
  the pool.

### 10.4 What NET-CAP builds

1. **The rule** (`packages/viewer/src/net/netCap.ts`, both sides import it, as `netRefill.ts`): `netCapCounts` (the
   four classes), `netCapLive` (`FUN_003cb8f0`, the empty pool's -1), `netCapRefuses(handId, live)` (`FUN_005c0ae0`'s
   test: the hand's record of the four classes and `live > 5`). Online is every port match (`SOLO_IS_NETWORK_READING`)
   and the local actor every command the room judges (its own console's). Pinned by `packages/viewer/test/netCap.test.ts`.
2. **The room**: `throwGrenade` and `placeCharge` refuse `throw: net cap` (tallied, told the requester with the combat
   report on, nothing spent, nothing broadcast -- as the room's other refusals of a throw), after the throw's rate and
   before its geometry, and before the placing's own tests (the claymore's four, the wading, the ground) -- never for
   C4, whose plant never asks `FUN_005c0ae0` (§10.1; F1 of the review: `placeCharge`, and the page's `startPlacing` as
   `plantC4` reaches it):
   `FUN_005c0ae0` answers before `FUN_005be9a0` runs. `launchRound`, `launchRocket` and `raiseLauncher` are unchanged
   (§10.1: a launch is its carrier's; PAR-84's launcher clip refusals untouched). Pinned by
   `packages/central/test/roomNetCap.test.ts`.
3. **The page** (the same prediction where it gates the use: `grenade.ts` `startThrow`, the release request, and
   `startPlacing`, the placing's fire; with a bridged room-and-page case): built after the gameplay seat cleared its
   hunks (the file is that seat's) -- `GrenadeSource.online` (`matchThrow.ts`: `d.net() !== null`, the page predicting
   only where a room judges its throws), `GrenadeThrower.netCapRefused` over its own `live`, the release refused as a
   short tap and the placing not started (`NET_CAP_REFUSED_USE_PLACEHOLDER`). Pinned by
   `packages/viewer/test/grenadeNetCap.test.ts` and the bridged block of `packages/central/test/roomNetCap.test.ts`.
- **Against the original.** The room judges at the throw's let-go command and at the charge's set-down -- what the page
  sends -- where the original asks at the release request and at the placing's start. The owner's count cannot rise
  between (no other use runs during a throw's clip or a placing), so the two can differ only through the empty pool (a
  grenade of another's thrown in between).

### 10.5 Placeholders and readings

Each *note only* until code carries it (the ledger's rule); research 101 lists those in code.

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `NET_CAP_READING` (in code: viewer `net/netCap.ts`; read by server `room.ts` `throwGrenade`, `placeCharge`, viewer `grenade.ts` `netCapRefused`) | `'online, a local SEAL's use of the item in its hand's slot, when that is a grenade, an explosive, a launcher round or a rocket round, is refused while it has more than five of its own projectiles of those classes live (set down or in flight); a launch is its carrier's and C4 is the Action button's, and neither is refused'` | `FUN_005c0ae0` D:L476470-476491, `FUN_003cb8f0` D:L320898-320952; the carrier in the hand `FUN_005c8a20` D:L481385, D:L481471-481487; C4's plant `FUN_00592d50` D:L452030-452055 -> `FUN_005c0020` D:L475985-475994 | ONL-32's capture online: six grenades or charges out and a seventh pressed (refused, nothing spent, no message); an M203 round launched and C4 planted with six out (both taken) | reading, pending review |
| `NET_CAP_EMPTY_POOL_READING` (in code: viewer `net/netCap.ts` `netCapLive`; read by server `room.ts`) | `'the count is -1, so no refusal, while nothing is in flight in the level: the placed charges alone never refuse'` | `FUN_003cb8f0` D:L320931-320933 with the high mark of `FUN_003cca90` D:L321508-321510 and the frees (D:L321272-321285); a firearm's round in the pool (`FUN_005c5340` D:L479345-479349) not modelled | the same capture: six charges set down and nothing in the air (a seventh set down), then a grenade of another's in the air (refused) | reading, pending review |
| `NET_CAP_REFUSED_USE_PLACEHOLDER` (in code: viewer `grenade.ts` `startThrow`) | the port's page: the release refused as a short tap (`refuseRelease`: the power zeroed, the grenade still up), the placing not started | what a press the cap refuses leaves of the controller's wind-up and release bit (`FUN_00594cf0`; research 251 §12.8) | the same capture: a grenade held then let go with six out, and again once one has burst | placeholder |

### 10.6 Found, not this row's

- **The claymore's four counts claymores only.** `FUN_003cc1f0` (D:L321196-321216) counts the owner's entries whose
  `+0xc5` is set (D:L321207) and whose model `+0x5c` bit 0 is (D:L321209); `FUN_005bc730` sets `+0xc5` only for a
  claymore (type 0x99, D:L474101; `FUN_003c51c0` D:L316753-316757). Both the claymore's and the PMN's placings ask it
  (D:L475306-475308, D:L475338-475340). The room's `chargesDown` and the page's `placedCount` count every charge of the
  owner's set down -- the PMN and C4 among them. For the gameplay lane (research 85 §9.7.1, "the SEAL's charges down"):
  taken as its PAR-96 (the gameplay seat, 2026-10-14); not changed by NET-CAP.
