# 323 -- Picking up dropped weapons: who may take one, and the rules across deaths and rounds (NU-5, PARITY-2)

- Date: 2026-10-14 (15:45Z). The next-update checklist's row NU-5
  ([plan](../plans/2026-10-13-next-update-checklist.md), folded into
  [PARITY-2](../plans/2026-10-08-web-sprint-parity-2.md) by NU.R2; the checklist leads the lane by PTW.R9). **A read
  alone**: the build is a later brief, from section 7. Branch `agent/nu5-read` from `a2849b26f`.
- Review: a fresh review of `68939dcb8` returned PASS WITH FINDINGS (the headline and R323.1's no-side-test claim
  confirmed, high). F1 (medium: `FUN_005bac30`'s first clause read the wrong way round) and F2 (low: the accept's
  taker lookup) are folded here, each re-read at the source, the text they corrected kept beside ("was: ..."); O1
  stays held until capture NU5-4. The status is unchanged.
- Build (2026-10-14, [brief](../plans/briefs/2026-10-14-nu5-pickups-build.md), branch `agent/nu5`): P1 (pins), H1,
  L1 and X1 of section 7 built, with research 324's P2 room half, each marked "Built" in its row with what it replaced
  kept. The gameplay controller's decisions folded: the round's slot in the port's five-slot kit (decision (i),
  `PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`), the raise inside `Swap rifle` read (refused by the `NoFire` phase test),
  the taker's own clip at the room's message (`PICKUP_SWAP_OWN_LAG_READING`). The online seat cleared the `room.ts`
  sink and the two `ACTION_CODES` appends (no codec field: the accept carries no round count). Its values are
  reading, pending review; O1 and X2 stay held.
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, and the port's code was read. No game, emulator, reader, test or browser was run (no node process at all).
  Where the port's behaviour is stated it is read off its source, not run. Nothing here is proven, and nothing counts
  as a reading until a reviewer who did not write this note re-reads it at the source.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (read only, by its program headers, through a scratch script): the strings 0x65f138
  `rifle`, 0x65f140 `pistol`, 0x65f148 `launcher` (the hand nodes a taken weapon is hung on), 0x65f158 `Ammobox` and
  0x65f128 `fiftycal_box` (the bundle's node and model), 0x65f4e8 `drop_item` (a zAnim name), 0x65e698
  `camera_effects`; the float 0x6508a0 (32.0). The disc's data: none read (no reader run); a byte search of the
  committed fixtures finds the name `drop_item` in `test-fixtures/RUN/MP2.ZDB`, `MP6.ZDB` and `MP72.ZDB`, not decoded.
  The port's lines are this branch's base `a2849b26f`.
- Evidence read first, not restated: research [234](234-the-inventory-as-built.md) (the inventory as built: the
  drops, the claim's gates, the transfer, the readings of its §7), [300](300-original-weapon-exchange.md) (the Weapon
  Exchange audit: the confirm writes the character's next kit, §3 and §6),
  [317](317-bodies-and-drops-on-the-ground.md) §2 (the drops: what a death lays, how long it lies, what removes it),
  [91](91-the-round.md) §4.1-§4.3 (the respawn option, the rebuild), [94](94-the-arsenal.md) (the classes by id range,
  R94.6), [211](211-the-weapon-swap-by-state.md)
  (the `Swap rifle` clip), [313](313-the-climb-check.md) §2.1 (the Action button's release and `FUN_00592d50`),
  [214](214-demolition-as-built.md) §4 (the action picker), [106](106-the-zanim-ui-runtime.md) (the zAnim context
  0x414bb0, `FUN_0026a250`), [312](312-the-network-magazine-refill.md) and the online lane's rows NET-REFILL and
  NET-CAP (named in section 6, not re-read).

## The owner's item (NU.R1)

From the checklist's NU.R1 (the owner, 2026-10-13, verbatim): "Allow both teams to pick up dropped weapons. Verify the
original rules for keeping them into the next round or losing them upon death."

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R323.1 | **Any living player, of either side, may take any weapon lying on the ground** -- a foe's, a teammate's, his own exchange drop. No test of a side, a team mask, the drop's owner or the map's weapon valves runs anywhere on the path: the offer (`FUN_00593da0` D:L452538-452575; `FUN_005a81d0` D:L462753-462775; `FUN_005a9c70` D:L463660-463724, `FUN_005a9f40` D:L463750-463786, `FUN_00541d40` D:L409226-409267), the press (`FUN_00592d50` D:L452157-452177; `FUN_00547570` D:L412770-412783), the request (`FUN_0059f610` D:L458314-458334), the owner's accept (`FUN_0059e830` D:L457899-457932) and the apply (`FUN_0059dfb0` D:L457689-457709; `FUN_0059f0c0` D:L458174-458297) | the same: `WorldDrops.judge` (`worldDrops.ts:156-171`) and the page's prompt (`drops.ts:131-142`) test no side; the records are the kit table's by item id, both sides' (`KitTable.records`) | §1.1 |
| R323.2 | **A weapon is taken by the Action button, on its release; an ammunition bundle by walking over it.** Action (Cross, Default) released calls `FUN_00592d50`, which takes the selection's pickup bit: 0x10 (the controller's `+0x14c`, the first candidate) or 0x20 (`+0x150`, a pistol), lays the 3 s hold and calls `FUN_00547570` (D:L452157-452177). A bundle within 20 units is taken every update, no button (`FUN_00593da0` D:L452524-452537) | the same (research 234 §3-§5) | §1.2 |
| R323.3 | **The pick-up replaces both the slot's weapon and its ammunition.** The weapon's family slot (`FUN_005b8820`, `FUN_005b8630`) has its ring dropped as a bundle, then its weapon dropped, at the taker's console (D:L458187-458190); the taken record goes into that slot (`FUN_005bc410` D:L473823-473868) with an empty ring; **the hand stays on its slot** -- `FUN_005bc410` writes no current-slot word (`+0x824`) and refreshes the hand only when the slot is the hand's (D:L473852-473868) | the same; `PICKUP_HAND_PLACEHOLDER` is now readable: a candidate re-file (section 8) | §1.3-§1.4 |
| R323.4 | **An exchange plays the `Swap rifle` clip on the taker** (`FUN_00588bc0(actor, DAT_003dec78, stance, 0, 0)` D:L458209-458211; `DAT_003dec78` is `Swap rifle`, research 211: NoFire, NoInterrupt) and starts the zAnim `drop_item` on the dropped weapon (D:L458212-458213) | **differs**: no clip, no lock and no cue at a claim, room or page | §1.5 |
| R323.5 | **A rocket launcher (class 0x91: the LAW 145, the RPG-7 146) is claimable by a player who carries no launcher**: it is offered only when the kit holds no item of `FUN_003c5d80`'s list (the M203 rifles 52 and 61, the OICW 63, the MGL 142, the M79 143, any rocket launcher) and has a slot 2-4 free or replaceable (`FUN_005bac30` D:L473023-473084; D:L463675, D:L409249-409253); it goes into that equipment slot, else a new one, its round (0xb9 LAW HEAT, 0xba for the RPG-7) added with one round (D:L458238-458292). *Was:* "family 4, into the kit's launcher slot, else a free equipment slot ...; offered only when the kit has a place for it" -- the launcher-slot exchange is not reachable from the prompt (the review, F1) | **differs**: refused `'family'` (`pickups.ts:157-158`, `LAUNCHER_DROP_READING`'s doc); the page offers it and the room refuses | §1.6 |
| R323.6 | **A departed dropper's weapons cannot be taken online** (medium): the request goes to the drop's owner's console only if that player resolves (`FUN_002ba2c0` D:L159889-159893, `FUN_002bd4d0` D:L161795-161813); the claim of a gone owner's drop is sent nowhere and the drop lies on | **differs**: claimable under `DROP_OWNER_DEPARTURE_PLACEHOLDER` `'stays'` | §1.7 |
| R323.7 | **At the carrier's death a picked-up weapon is dropped like the kit's own**, empty, its ring's rounds in the one bundle laid first: `FUN_005a0040` finds the primary, secondary and launcher by the class of whatever each slot holds (`FUN_005c7230` D:L480057-480069, `FUN_005c71a0` D:L480032-480044, `FUN_005c7110` D:L480007-480019) | the same (`dropsOf`, `pickups.ts:109-126`, reads the live `loadout` and rings) | §2 |
| R323.8 | **At the next round the picked-up weapon is lost**: the round's reload rebuilds every player's actor, alive or dead (`FUN_00223680` D:L75925-75931 -> `FUN_00598b90` -> `FUN_00599b60` D:L455158), and the kit is refilled from the character's kit list (`FUN_00599f00` D:L455791-455830 reading `+0x540`'s `+0x2f0`, which the Weapon Exchange and the ARMORY write); a claim never writes that list | the same (`Room.spawn`, `room.ts:2728-2730`; `startRound` spawns every seat, `room.ts:5222-5225`) | §3 |
| R323.9 | **A respawn game allows no pick-up by absence, not by a gate**: it drops nothing at a death (R317.5), online no weapon is placed by the level (`FUN_002a8140` D:L149837-150047 offline only), so nothing lies to take; the claim's path tests no respawn flag. A respawn also rebuilds the kit (D:L455158) | the same (drops classic-only, `room.ts:4800`) | §4 |
| R323.10 | **The online byte gates the route, not the right**: offline a claim applies at once, online it is routed to the owner (D:L458315-458331); online only the owner's own console drops (D:L458376-458381, D:L458556-458563); the launcher drops online only (D:L458667-458672); the drops' lifetime and dedup are offline only (R317.6-R317.7); the bomb's candidate is online only (D:L463709, D:L452577) | the port is a network game throughout (`SOLO_IS_NETWORK_READING`) | §4 |
| R323.11 | **The taken weapon's fire mode is zeroed and stepped up** (2026-11-03, reading pending review): `+0x6fc` is the slot's fire mode (stepped by the switch `FUN_005c4600` D:L478578-478579); `FUN_005bc410` zeroes it (D:L473830-473834), nothing else on `FUN_0059f0c0`'s path writes it, and the zero is stepped: the hand's slot by `FUN_005c0fd0` (D:L476658-476668) up to `MaxFireMode` (+0x24), the weapon's highest mode; a slot not in the hand once at the swap to it (`FUN_005c4b10` D:L478930-478931), its first mode. `+0x684` is not read. *Was:* "what they hold (the fire mode is a candidate) is not read" | **as built** (`accuracy.ts` `pickupFireMode`, `takeKit.ts`); was: the record's spawn default (burst where enabled) | §1.4, §8 |

## 1. Who may take a dropped weapon, and how

### 1.1 No side test anywhere on the path

The weapon claim runs through seven functions; none reads a side, a team mask, the drop's owner's side or a weapon
valve:

- **The offer.** The player update calls `FUN_00593da0` (D:L453705, D:L453912). It asks `FUN_005a81d0` (alive bit
  `+0xe1` bit 4, stance not 6, no move holding the body, a squared speed at most 32.0 squared at 0x6508a0, `+0xeb8`
  clear, the kit's view not 4, not on a ladder, then `FUN_005a7de0(actor, 1, 0)`; D:L462753-462775), then
  `FUN_005a9c70` or `FUN_005a9f40` for the candidates (D:L452540-452543). Both search the pickup list through
  `FUN_00541d40` (D:L409226-409267), which filters by the kind (8), the distance (20 units), the `+0xd` bit 1 (the
  pistol class, the second output) and one item test (section 1.6) -- nothing else. The candidate's composite id is
  written to `+0x14c` or `+0x150` (D:L452544-452575).
- **The press.** `FUN_00592d50`'s 0x10 branch (D:L452166-452177) and 0x20 branch (D:L452157-452163) call
  `FUN_00547570`, which needs the alive bit (D:L412770) and dispatches a kind-8 pickup to `FUN_0059f610`
  (D:L412782-412783).
- **The request.** `FUN_0059f610` (D:L458314-458334): the alive bit again; offline `FUN_0059f0c0` at once; online
  the drop's owner (`+0x10`) decides -- the taker himself through `FUN_0059e830`, another console through
  `FUN_002ba2c0` (research 234 §3.1).
- **The accept.** `FUN_0059e830` (D:L457899-457932) checks that the pickup still exists and that its weapon's item
  (`+0x7c`) is the one requested (D:L457915-457918), broadcasts the accept (`FUN_002ba1f0`) and applies it to the taker
  (`FUN_0059dfb0`). The taker is resolved by id from the object list at 0x4362e0 (`FUN_0029e4e0`) and taken as null
  unless its `+0x10` is 2, a player actor (D:L457924-457928) -- the same test the round's reload makes of each object
  (D:L75927); a kind of object, not a side (the review, F2; was: the lookup unstated).
- **The apply.** `FUN_0059dfb0` (D:L457689-457709) calls `FUN_0059f0c0` for a kind-8 pickup, which checks the kind, the
  record and the node only (D:L458174-458175).

So **both teams take any weapon on the ground**: the other side's, their own side's, and their own exchange drop.
A side's weapon valves (research 300 §4: a SEAL cannot select the AK-47 in the menu) bind the menus, not the ground.
The 3 s hold (`PICKUP_PROMPT_COOLDOWN_READING`) is what keeps a taker from re-taking at once the weapon his exchange
just laid at his feet.

### 1.2 The button and its frame

- **A weapon: the Action button, on its release.** Action is Cross in the Default layout; the player update reads the
  button's state byte and on the release (state 3) calls the controller's +0x78, `FUN_00592d50` (research 313 §2.1:
  D:L453221-453222, the one-button layout D:L453241-453243). `FUN_00592d50` runs the one action bit the picker set in
  `+0xed4` (research 214 §4). For a pickup the bit is 0x10, the first candidate `+0x14c` (`FUN_00544c30`,
  D:L411149-411153), or 0x20, the pistol candidate `+0x150` (`FUN_00544c20`, D:L411139-411143). It lays the prompt's
  hold `+0x23c` = 3.0 (D:L452160, D:L452169) and calls `FUN_00547570`. It also sets the actor's `+0x105f` bit 0x40
  (D:L452162, D:L452175), for which this read found no reader (the patterns `<< 0x39` and `& 0x40` on `+0x105f`: its
  two setters and the actor initializer's clear, D:L419794).
- **An ammunition bundle: by walking.** Each update `FUN_00593da0` takes every kind-9 pickup within 20 units
  (`FUN_00541f10(20.0, .., 9)` D:L452526, D:L452533) through `FUN_00547570` (D:L452529), skipping the one taken last
  while it stays in reach (`DAT_0066b418`, D:L452528-452537). No button, no motion gate (research 234 §4).
- **When it lands.** Offline, on the release's frame (D:L458315-458316). Online, on the accept's arrival: the taker's
  console sends the request to the owner's (`FUN_002ba2c0` D:L159878-159893, 0x18 bytes: the pickup's id, the item, the
  taker's id), the owner validates and broadcasts the accept to every console (`FUN_002ba1f0` D:L159823-159836, 8
  bytes: the pickup's id, the taker's id, the count, the accepted mask), and each applies it on receipt (`FUN_002ba1a0`
  D:L159807-159817 -> `FUN_0059dfb0`). When the taker is the owner (his own exchange drop) it applies at once
  (D:L458324-458326). The owner of a death's drops is the dead player's console (`FUN_0059f730` lays them under the
  actor's id, D:L458441); of an exchange's, the taker's. The port's room is the one arbiter (`PICKUP_ROUTE_READING`).

### 1.3 What it replaces

`FUN_0059f0c0` (D:L458155-458300):

1. The destination family from the weapon's class (`FUN_005b8820` D:L471656-471679 over `FUN_003d1a60`'s id ranges):
   1 a primary (SMG, rifle, shotgun, MG, sniper, grenade launcher), 2 a pistol, 4 a rocket launcher, 3 the grenade and
   explosive classes (never a weapon on the ground). The kit's slot of that family: `FUN_005b8630` (D:L471567-471603),
   the first slot whose record is of it, else -1.
2. **The exchange, on the taker's own console only** (`IsRemote` false, D:L458177, D:L458187): that slot's ring dropped
   as a bundle (`FUN_0059fd50(actor, slot)` D:L458188), then its weapon (`FUN_0059f730(actor, slot, 1)` D:L458189). A
   remote copy of the taker drops nothing: the taker's console drops and replicates.
3. The ground's node is taken off the pickup and hung on the hand node of the family -- `rifle` (0x65f138), `pistol`
   (0x65f140) or `launcher` (0x65f148) (D:L458191-458256) -- and kept as the slot's model (`FUN_005b8f20`
   D:L458272, D:L458280). **The weapon in the hand is the very object that lay on the ground.**
4. The record installed in the slot (`FUN_005bc410` D:L458271, D:L458282). Its ring is the one the slot had, emptied
   by the exchange's bundle (or empty already): **the taken weapon carries no round** (`WEAPON_DROP_AMMO_READING`, as
   built). `FUN_005bc410` zeroes two per-slot words (`+0x6fc`, `+0x684`, D:L473830-473839), sets the slot's `+0x774`
   (D:L473840-473842) and the kit's dirty bits (D:L473845-473851); the controller's `+0x170` bit 0x10 it sets
   (D:L473845, and again D:L458295-458296) is read once a frame by the HUD (`FUN_00592c30` D:L451917-451921 from
   D:L56666-56672) to redraw the weapon panel.
5. **The hand.** `FUN_005bc410` writes no current slot (`+0x824`). When the installed slot is the hand's it refreshes
   the hand on the new record (D:L473852-473868: `FUN_00592d40`, a scale test, `+0x810` cleared). So a claim into the
   stowed slot leaves the hand as it was; a claim into the hand's slot puts the taken weapon in the hand. This is the
   port's rule (`worldDrops.ts:183`); `PICKUP_HAND_PLACEHOLDER`'s "whether `FUN_005bc410` selects the installed weapon
   is not read" is now read (section 8).
6. The pickup removed (`FUN_00542470` D:L458297).

With no slot of the family (`-1`) nothing is exchanged and the record goes into a new slot at the kit's count
(`FUN_005be030` D:L474748-474752, D:L458267-458272), or for a launcher an equipment slot (section 1.6).

### 1.4 The exchange's bundle, at the taker's feet

The exchange's bundle and weapon are laid at the taker's position (`FUN_0059fd50` D:L458592-458598, `FUN_0059f730` at
the hand node's place, D:L458413-458415), under the same rule as a death's drops (research 317 §2). The bundle is
within the 20-unit walk-over, so the next update meets it (section 1.2). `FUN_005bb000` (D:L473158+), which pours a
bundle's weapon entry into the kit, matches it **by the carried weapon's own item** first (D:L473211-473238) -- the
port's `transferAmmo` match by record id (`pickups.ts:185`); its fallback when no slot carries that weapon
(D:L473239+) is not read (`AMMO_TRANSFER_PLACEHOLDER`, unchanged). So the old weapon's magazines stay on the ground
unless the taker still carries that weapon.

### 1.5 The exchange's clip and cue

After the install, when the exchange laid a weapon (`lVar15` the new pickup, D:L458208-458215) on the taker's own
console (`IsRemote` false, or no node, D:L458199):

- the clip: `FUN_00588bc0(actor, DAT_003dec78, FUN_0058a720(actor, 0), 0, 0)` (D:L458210-458211). `DAT_003dec78` is
  `Swap rifle` (research 211's table: `seal_swaprifle`, NoPitchtwist, NoFire, NoInterrupt); `FUN_0058a720(actor, 0)`
  the stance (research 179). With no exchange and a launcher taken (family 4) while `FUN_00589900` answers, the same
  clip in `+0x174`'s stance, with `+0x350`'s `+0x42` bit 0 and the action's `+0x24` cleared (D:L458201-458206);
- the cue: `FUN_00272bb0(DAT_0044d508, 1, 3, node, 0)` on the dropped weapon's node (D:L458212-458213). `DAT_0044d508`
  is the zAnim `drop_item` (0x65f4e8), looked up in the zAnim context 0x414bb0 (`FUN_0026a250`, D:L461004, D:L461064;
  research 106). The same cue runs on a death's weapon (`FUN_0059f730` with its third argument 0, D:L458446-458447)
  and on every bundle (D:L458615-458616); what the script plays is not read (`DROP_ITEM_ZANIM_PLACEHOLDER`, section 8).

A remote copy of the taker (`IsRemote`, with its node) takes the node and the record only (D:L458217-458235); what
another console draws of the clip comes with the taker's replicated state, not read here.

### 1.6 The rocket launcher

A rocket launcher (class 0x91, ids 145-150: the LAW 145 and the RPG-7 146 on the disc, research 94) is family 4
(`FUN_003d1d90` D:L324424-324428) and is claimable **by a player who carries no launcher**:

- **The offer** skips a class-0x91 weapon unless `FUN_005bac30(kit)` answers: `FUN_005a9c70` and `FUN_005a9f40` pass
  `FUN_005bac30(kit) == 0` to `FUN_00541d40` (D:L463675, D:L463693; D:L463751, D:L463769), which then refuses a
  candidate whose class is 0x91 (D:L409249-409253). `FUN_005bac30` (D:L473023-473084) first looks for a slot holding an
  item of `FUN_003c5d80`'s list (ids 52 M16A2-M203, 61 M4A1-M203, 63 the OICW, 142 the MGL, 143 the M79, or class
  0x91; D:L317287-317299). **Finding one, it answers false** (the jump to `LAB_005baca8` with the index not -1,
  D:L473027; `bVar2` left false, D:L473033-473035, D:L473084). Only with none does it search slots 2-4 and answer true
  for one with an empty ring and an item outside a list of ten ids, or empty (item 0xff), or past the kit's count
  (D:L473035-473082). So **a player carrying any launcher -- a grenade launcher on his rifle included -- is never
  offered a rocket launcher**. Reading the ten ids as "the slot's item may be replaced" is an interpretation, not read
  further. *Was:* "`FUN_005bac30` ... answers when a slot holds an item of `FUN_003c5d80`'s list ..., or an equipment
  slot 2-4 has ..." -- the first clause the wrong way round (the review, F1).
- **The apply** (D:L458238-458292): the node on `launcher` (+0x3a8), `+0xe9c` cleared and the hand node re-parented
  (D:L458239-458249); the slot is `FUN_005bae60(kit, -1)` (D:L473101-473152: the first of slots 2-4 with the same test
  as `FUN_005bac30`'s second half), else a new slot; when that slot is the hand's (`+0x824`), the hand is re-chosen
  (`FUN_005bdc30`, `FUN_005c4b10`, D:L458273-458276). Then the round: item 0xb9 (LAW HEAT), or 0xba (the RPG round)
  for item 146 (`-0x6e`), installed at the kit's count (`FUN_005bdfb0` D:L474724-474731) and given **one round**
  (`FUN_005ba3d0(kit, slot, 1)` D:L472704-472773). The family-4 exchange (`FUN_005b8630(kit, 4) != -1`,
  D:L458187-458190) is not reachable from the prompt: a kit with a rocket launcher is offered none. *Was:* "the slot is
  the kit's launcher slot (exchanged, as section 1.3), else `FUN_005bae60(kit, -1)` ..." (the review, F1).
- **Not read:** `FUN_005bae60`'s ten-id list's meaning, a round item (0xb9, 0xba) carried with no launcher, and
  `FUN_00589900` (`PICKUP_LAUNCHER_SLOT_PLACEHOLDER`, section 8). *Was:* "what becomes of a replaced launcher's own
  round slot" (`PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`) -- no launcher is replaced (the review, F1).

A launcher lies on the ground online only with its round having rounds (`LAUNCHER_DROP_READING`, research 234 §2.2).

### 1.7 A departed dropper's drops (medium)

Online a claim on another's drop is sent to the owner's console by `FUN_002ba2c0`, which resolves the owner's player
by id (`FUN_002bd4d0` D:L161795-161813, through a player table `FUN_00622818`) and sends only when it resolves
(D:L159889-159893). At a departure the actor's id becomes -1 (`FUN_005998b0` D:L455524, research 317 §1.5); the drop
keeps the old owner id (`+0x10`). So a request for a departed player's drop goes nowhere: no accept, no change, the
drop lies on, drawn, until the result's sweep (research 317 §2.3: the body's +0x50 removes an owner's drops there).
*Medium:* `FUN_00622818` is not read, and whether a departed player's entry is gone from its table at once is
inferred from the departure's id write. The port keeps such drops claimable (`DROP_OWNER_DEPARTURE_PLACEHOLDER`
`'stays'`, `worldDrops.ts:41`; `judge` reads no `from`).

## 2. A picked-up weapon at the carrier's death

`FUN_005a0040` (D:L458646-458706; research 234 §2, 317 §2.1) runs once at the death's edge and finds the slots **by
the class of the record each holds**: the primary (`FUN_005c7230`, the first slot whose class is `FUN_003d1d10`'s,
D:L480057-480069), the secondary (`FUN_005c71a0`, class 4, D:L480032-480044) and online the launcher
(`FUN_005c7110`, class 0x91, D:L480007-480019; dropped only with its round, D:L458673-458685, D:L458705-458706). A
claim's record is in the kit like any other, so **a picked-up weapon is dropped exactly as the kit's own**, wherever it
went. The one bundle is laid first (`FUN_0059fd50(actor, -1)` D:L458686): it holds the rings' entries, the picked-up
weapon's included -- whatever the walk-overs (and, online for a pistol, NET-REFILL) put there -- and the weapon lies
after it, empty. Nothing marks a weapon as picked up: no flag on the kit, the record or the pickup (`FUN_0059f730`
lays the record and the `+0xd` pistol bit only, D:L458441-458445). A respawn game drops nothing (D:L458659).

The port: `dropsOf` reads the seat's live `loadout`, `records` and `mags` at `kill` (`pickups.ts:109-126`), so a
claimed weapon is dropped in its slot with its ring's entries in the bundle. **No difference.**

## 3. A picked-up weapon at the next round

- **The round's reload re-places every player not marked `+0xfd1`, alive or dead** (`FUN_00223680` states 3 and 5,
  D:L75920-75933), through `FUN_00598b90(p, 0)`, which online always rebuilds the actor (`FUN_00599b60(p, 0)`,
  D:L455158; the round's start and the respawn differ only in the spawn record, D:L455229).
- **The rebuild is whole.** `FUN_00599b60` (D:L455604-455711) runs the actor's teardown and its initializer
  (`(*vtable+8)(actor, -1)`, `FUN_00553ea0`, D:L455659-455664) and `FUN_00599f00` (D:L455674), which fills the kit
  from the character's list `+0x540` -> `+0x2f0`, slot by slot (`FUN_005bdfb0` D:L455797-455830) -- the list the
  Weapon Exchange's confirm and the ARMORY write (`FUN_0053eee0`; research 300 §6, research 94 S4). Two kit values
  are saved before and written back (`+0x7ec`, `+0x7f0`: `FUN_005c4960`, `FUN_005c4890`, D:L455643-455644,
  D:L455676-455677); no slot is.
- **A claim never writes that list**: `FUN_0059f0c0` and `FUN_005bc410` write the live kit (`+0x5e0`) only.

So **a picked-up weapon is kept for the rest of the round only, and lost at the next round's start** (and at a
respawn, in a respawn game, where none can be taken anyway). A survivor who took a weapon starts the next round with
his chosen kit. The port: `Room.spawn` sets `p.loadout = p.next ?? this.typeKit(p)` and fresh rings at every spawn
(`room.ts:2728-2730`), `startRound` spawns every seat (`room.ts:5222-5225`), and the claim writes the live kit only
(`worldDrops.ts:180-182`; `p.next` untouched). **No difference.**

## 4. Online against offline, classic against respawn

| gate | where | effect |
|---|---|---|
| the online byte `DAT_0045a0c1` | `FUN_0059f610` D:L458315-458331 | offline the claim applies at once; online it goes to the drop's owner |
| | `FUN_0059f730` D:L458376-458381, `FUN_0059fd50` D:L458556-458563 | online only the player's own console (controller +0x2c) drops a weapon or a bundle, at a death or an exchange |
| | `FUN_005a0040` D:L458657-458672 | online: no drop for a spectator, a `+0xfb0` 6 death or a respawn game; the launcher drops online only |
| | `FUN_005a0040` D:L458688-458702 | offline only: no weapon dropped where the same lies within 50 units (R317.7) |
| | `FUN_00541700` D:L408887-408910; `FUN_002aa490` D:L151163-151165 | offline only: the 60 s lifetime (R317.6) |
| | `FUN_002a8140` D:L149837-150047 | offline only: the level's own weapons and bundles (kinds 8 and 9, D:L149936, D:L150037) -- a campaign's; online the ground holds only death and exchange drops |
| | `FUN_005a9c70` D:L463709; `FUN_00593da0` D:L452577-452616 | online only: the MP bomb (kind 11) as a candidate and its walk-over (research 214) |
| the respawn flag (game `+0xdc`) | `FUN_005a0040` D:L458659 | no death drop; **nothing else on the claim's path reads it** |
| the side | -- | read nowhere on the path (section 1.1) |

**A respawn game:** no death drop (R317.5) and online no level weapon, so no weapon lies, no claim is made and no
exchange drops anything: no pick-up, by absence. A claim's own path has no respawn test; if a weapon did lie it could
be taken. The port is the same: drops are laid only in a classic round (`room.ts:4800`); `judge` reads no rules.

## 5. The port against the read

The port's tree is `a2849b26f`. Rows marked "--" agree.

### 5.1 The room

| # | the original | the room | difference |
|---|---|---|---|
| -- | any side takes any weapon (§1.1) | `WorldDrops.judge` tests no side (`worldDrops.ts:156-171`); records by item id from the kit table | none |
| -- | the claim's gates (§1.1; research 234 §3.2) | `judge`: alive, in play, not mounted, fresh, lying, a weapon, 20 u, 32 u/s, may fire, not swapping, not the binoculars | none new (research 234's readings) |
| -- | the family's slot, its ring and weapon dropped, the record installed, an empty ring, the hand kept (§1.3) | `claimWeapon` (`pickups.ts:155-169`), `take` (`worldDrops.ts:174-187`) | none; `PICKUP_HAND_PLACEHOLDER` re-filed (§8) |
| L1 | a rocket launcher is claimable, with one round, by a player carrying no launcher and with a slot 2-4 free or replaceable (§1.6; was: "when the kit has a place", the review, F1) | `pickupSlotOf` gives null for it and `claimWeapon` refuses `'family'` (`pickups.ts:79-82`, `:157-158`) | **the launcher not taken** *(built 2026-10-14, NU-5 L1: `claimWeapon`'s launcher branch, `WorldDrops.take`; was: the difference stood)* |
| X1 | an exchange pushes `Swap rifle` (NoFire, NoInterrupt) on the taker (§1.5) | `take` lays no hold; the taker may fire the next tick | **no clip, no lock** *(built 2026-10-14, NU-5 X1: `swapRifleExchange` on the taker's mover from the claim's command + 1, its `NoFire ()` refusing the fire; was: the difference stood)* |
| O1 | a departed owner's drop cannot be taken online (§1.7, medium) | `judge` reads no `from`; such drops are claimable (`worldDrops.ts:41`) | **claimable** |
| -- | a picked-up weapon drops at the death like the kit's own (§2) | `kill` -> `WorldDrops.death` -> `dropsOf` over the live kit (`room.ts:4800`, `worldDrops.ts:120-123`) | none |
| -- | lost at the next round: the kit rebuilt from the chosen list (§3) | `spawn`: `p.next ?? typeKit(p)` (`room.ts:2728-2730`); every seat spawned (`room.ts:5222-5225`) | none |
| -- | a respawn game: nothing lies (§4) | drops only in a classic round (`room.ts:4800`) | none |
| F1 | the taken weapon's fire mode `+0x6fc` zeroed and stepped (§1.3, R323.11) | -- (the page sets the mode, below) | **as built** 2026-11-03 (reading pending review); was: unknown, §8 |

### 5.2 The page

| # | the original | the page | difference |
|---|---|---|---|
| -- | the Action button's release, the 3 s hold, a bundle walked over (§1.2) | the `pickup` context's one-shot on the release, `NetPage.pickup(did)` (`netPage.ts:1012-1016`), the hold (`PICKUP_PROMPT_COOLDOWN_READING`) (research 234 §5) | none |
| L1 | a launcher offered only to a kit with no launcher-list item and a slot 2-4 free or replaceable (§1.6; was: "when the kit has a place", the review, F1) | `WorldDrops.prompt` offers any weapon drop in reach and in front (`drops.ts:131-142`), so a launcher, which the room refuses | **offered, then refused**; with L1 built, offered by `FUN_005bac30`'s test *(built 2026-10-14, NU-5 L1: `launcherClaimSlots` over the page's kit, `WorldDropsDeps.kit`; was: the difference stood)* |
| X1 | the taker plays `Swap rifle` after an exchange (§1.5) | `takeKit` re-hangs the model and renews the HUD (`takeKit.ts:42-57`); no clip | **no clip** on the taker's own body; the others' bodies by the room's state (section 6) *(built 2026-10-14, NU-5 X1: the own walk plays it at the room's `kit` (`PICKUP_SWAP_OWN_LAG_READING`); the others draw none of the exchange's -- SOLDIER's `Swap rifle` row carries no `network_log`, research 324 `PICKUP_CLIP_NETWORK_LOG_READING` -- and the launcher claim's from the body; was: the difference stood)* |
| X2 | `drop_item` runs on each weapon and bundle laid (§1.5) | `WorldDrops.place` lays a model only (`drops.ts:85`); no script, no cue | **no cue** (also a death's drops: NU-4's ground) |
| -- | the taker's record and node on every console, by the accept (§1.2, §1.3) | `taken` -> `drops.remove`, `remote.setKit(by, kit)` (`netPage.ts:1477`; `remotePlayers.ts:622-627`); the taker's `kit` -> `takeKit` (`netPage.ts:1478`) | none in what is held; how the remote draws it is NU-6's |
| F1 | the fire mode zeroed and stepped (§1.3, R323.11) | a replaced slot's mode is `pickupFireMode` (`takeKit.ts`): the highest mode in the hand, the first mode in the other slot | **as built** 2026-11-03 (reading pending review); was: the record's spawn default (burst where enabled), unknown |
| -- | the next round's kit: the chosen list (§3) | `spawn` -> `respawned(ev.kit)` for the page's own, `remote.setKit` for others (`netPage.ts:1391-1398`) | none |

### 5.3 What the online lane's rows already touch (named, not re-read)

- **NET-REFILL** (research 312, merged on `main`): online, a reload with no other magazine refills the one in the
  weapon to `Ammo_Capacity` -- a pistol in any game. A picked-up pistol (which arrives empty, §1.3) is therefore
  loaded by its first reload online; a picked-up primary in a classic game needs a bundle. NU-5 changes nothing there;
  a NU-5 test of a picked-up pistol's ammunition must expect NET-REFILL's refill.
- **NET-CAP** (research 312 §4.3, the online lane's): a rocket round (class 0xb9) counts toward the five-projectile
  cap. Once L1 lets a launcher be taken, its one round is subject to it; nothing in NU-5 touches the cap.

## 6. The overlap with NU-6

NU-6 draws the equipped weapon on both sides after a swap and a pickup. What the wire carries for a picked-up weapon:

- **The original:** no state field. The weapon's identity reaches every console with the drop's announce
  (`FUN_00541700` D:L408884-408905 -> `FUN_002ba660` D:L160013-160053: 0x18 bytes, the pickup's id, its position, its
  packed orientation and the item `+0x7c`). The claim's accept (`FUN_002ba1f0`, 8 bytes: the pickup's id, the taker's
  id, the count, the mask) tells each console which of its pickups went to whom; each runs `FUN_0059f0c0` on its copy
  of the taker, hanging that pickup's own node on the taker's `rifle`/`pistol`/`launcher` node and installing the
  record (§1.3). Whether the replicated player state also names the weapon in the hand is NU-6's to read.
- **The port:** `taken { did, by, kit }` to every page (`worldDrops.ts:184`), whose `kit` is the taker's five item ids,
  applied by `RemotePlayers.setKit(by, kit)` (re-hangs both firearms, `REMOTE_KIT_APPLY_PLACEHOLDER`); the taker's own
  `kit { loadout, slot, rounds }` (`worldDrops.ts:218-223`); a spawn's `kit` (`room.ts:2767`) and the welcome's
  players' `kit` (the live kit, `room.ts:1583`). The hand is not on `taken` (the hand kept, §1.3). **The field is
  `taken.kit`** (with `spawn.kit` and the welcome's `players[].kit` for the same seat later).

## 7. The build list

Each row is RED first, room and page on the same command where both exist; every row is the simulation track.

- **P1 -- the rules held by tests (no behaviour change; the row's "dev-disc test over the kit table").**
  - The room: `roomPickups.test.ts` -- a SEAL seat takes a Terrorist's dropped rifle and a Terrorist a SEAL's pistol
    (R323.1); the carrier dies and lays a bundle holding the taken weapon's ring's entries, then the taken weapon
    (R323.7); the next round's spawn has `p.next ?? typeKit` and not the taken weapon, for a survivor too (R323.8); a
    respawn room lays nothing to take (R323.9).
  - A dev-disc case over the kit table: a cross-side weapon's record resolves from the table for the taker
    (`kitRecords`), so the remote's re-hang has a model (skips without the disc; a skip is said).
  - These pass on today's code; they are pins, written before L1, X1 and O1 touch the same functions.
- **L1 -- the rocket launcher is taken (§1.6).**
  - The predicate, one function shared in `net/pickupRules.ts` (`FUN_005bac30`): **no** item of `FUN_003c5d80`'s list
    in the kit (52, 61, 63, 142, 143, any rocket launcher) **and** a slot 2-4 free or replaceable.
  - The room: `pickupSlotOf`/`claimWeapon` accept class 0x91 when the predicate holds, into the first of slots 2-4
    that `FUN_005bae60`'s test takes (else a new slot), the round item (185, or 186 for 146) beside it with one round
    in the seat's `KitRounds`; no exchange (the launcher-slot exchange is unreachable); refused `'family'`
    otherwise.
  - The page: `WorldDrops.prompt` and `holdCandidates` skip a launcher unless the predicate holds; `takeKit` takes an
    equipment slot and its round.
  - *Was:* "into the kit's launcher slot, else the first of slots 2-4 ...; the exchange of a launcher slot drops the
    old launcher (its round slot: the placeholder below); refused `'family'` when the kit has no place" and the
    page's "skip a launcher when the kit has no place" (the review, F1: the predicate inverted).
  - The wire: `kit` carries the five ids and the two firearm rings only; the launcher's round count needs a field (the
    online seat's terms, as research 317's B2 named).
  - *RED:* `pickups.test.ts` (a LAW claimed into an empty equipment slot, LAW HEAT with 1; refused for a kit holding
    a LAW, an M203 rifle or the MGL, and for one with no slot 2-4 free); `roomPickups.test.ts` (the claim, the
    `taken` and the `kit`); `drops.test.ts` (no prompt for a launcher to a kit carrying a launcher-list item; was:
    "a kit with no place refused", "no prompt for a launcher without a place", the review, F1). Low frequency: a
    launcher lies only when its carrier died with a round.
  - *Built 2026-10-14 (NU-5 L1; reading, pending review).* `net/pickupRules.ts`: `launcherListed`, `launcherSlotOf`,
    `launcherOffered`, `launcherClaimSlots`, `launcherRoundOf`, `pickupKitOf`, `launcherKitRounds`; server
    `pickups.ts` `claimWeapon` (the launcher branch) and `worldDrops.ts` `take` (the seat's `KitRounds`, the `kit` with
    no firearm slot and `filled` empty); the page's `drops.ts` (the offer, the hold) and `takeKit.ts`
    (`launcherTaken`), wired by `main.ts` / `matchMount.ts` (the kit as `dropModels`' fourth argument) and
    `matchFirearm.ts` (`launcherTaken`, `heldRounds`). A slot the port counts nowhere (the Satchel, `equipmentKind`
    'none') reads its kit-table fill, not empty (`pickupKitOf`; the review of 7c374ad0a, F1: the launcher was laid over a
    held Satchel; the Satchel reaches no multiplayer kit, `Enable_satchel` 0 on all 22 maps). **The wire: no field** -- the original's accept carries no round
    count (`FUN_002ba1f0` D:L159823-159836: the pickup, the taker, the request's entry count, the mask; each console
    installs the one round by rule), so the port's `taken.kit` stands for it and every page applies
    `PICKUP_LAUNCHER_ROUNDS_READING`. **The five-slot kit** (the controller's decision (i)): the round into the first
    other empty slot 2-4, else the claim refused and not offered (`PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`). *Was:*
    "The wire: `kit` carries the five ids and the two firearm rings only; the launcher's round count needs a field" --
    read: none needed. The page's own launcher takes the claimed kit through `FirearmHands.kitTaken`
    (`matchThrow.ts`: `RocketLauncher.setKit`, no pouch refilled; `matchThrow.test.ts` and `matchFirearm.test.ts`
    "NU-5"). *Was (a01b2229a):* "**Not wired:** ... whose implementer is `matchThrow.ts`'s (outside the brief's
    files): until it lands the taker's page cannot raise the taken launcher (the room can)" -- closed the same day.
- **X1 -- the exchange's `Swap rifle` (§1.5).**
  - The room: when `take` laid an old weapon, the taker's mover takes the swap's hold (`Swap rifle`, its NoFire) as
    `Room.aim`'s swap does (research 211), so a fire command under it is refused; none when nothing was exchanged.
  - The page: on a `kit` whose `slot` replaced a weapon, the own walk plays the same clip (the one swap path the page
    has); the other pages see it through the taker's replicated state (the room's mover).
  - *RED:* `roomPickups.test.ts` (an exchange, then a fire at the next tick refused, and allowed after the clip's
    length; no hold for a claim into an empty slot); a page test on `takeKit`'s caller (the clip after an exchange).
  - *Built 2026-10-14 (NU-5 X1; reading, pending review).* The room: `WorldDrops.take` asks its `swapRifle` sink, which
    `room.ts` keeps on `MoverSim.launcherClips` at the claim's command + 1 (the clip `swapRifleExchange`,
    `seal_swaprifle`: playback 1.1, 31 keys, `NoInterrupt ()` and `NoFire ()` bare, read over the tracked fixtures),
    the fire refused under it by the `NoFire` phase test (`../../packages/viewer/src/net/fireCapability.ts`), and a
    raise inside it refused (`liveOn`: the original's take refused by the same test, `FUN_005a8cb0` D:L463157 ->
    `FUN_005a7de0(actor, 1, 1)` D:L462695-462705; `DAT_003dec78` is in neither `FUN_005a7ab0`'s list D:L462523-462549
    nor `FUN_005a7980`'s D:L462484-462491). The wire: `swapRifleExchange` appended to `ACTION_CODES` (code 23), which
    another page drops (`remoteBodyAction`: no `network_log`, no Push Blend). The page: `takeKit` asks the walk
    (`WalkMode.pickupSwap`) at the room's `kit`, from the claim's command with its clock caught up (`pickupClaimed`;
    `PICKUP_SWAP_OWN_LAG_READING`, the review's F3; was "a message after the claim"). *Was:*
    "the other pages see it through the taker's replicated state (the room's mover)" -- read: they see none of it.
- **O1 -- a departed owner's drops lie untaken (§1.7; medium).**
  - The room: `judge` refuses a claim (`'owner'`) on a drop whose `from` seat has left the room; the drop stays
    (`DROP_OWNER_DEPARTURE_PLACEHOLDER` re-filed). The page: none (the room refuses).
  - *RED:* `roomPickups.test.ts` (a dropper leaves; another's claim refused `'owner'`; the drop still in `wire()`).
  - Held until the review agrees with §1.7, or capture NU5-4 below.
- **X2 -- the `drop_item` cue (§1.5): a read first.** Read the `drop_item` zAnim script (the map archives hold the
  name) through the repository's readers; then the page plays it on each weapon and bundle laid, a death's included.
  No build before the read.
- **H1 -- `PICKUP_HAND_PLACEHOLDER` re-filed** as `PICKUP_HAND_READING` (§1.3, item 5): a rename and its doc, no
  behaviour; the existing pin (`takeKit`'s hand kept) holds it.

## 8. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `PICKUP_ANY_SIDE_READING` (*note only*; candidate) | server `pickups.ts` (doc), held by P1 | `'any living player'`: no side test on the path (§1.1: D:L452538-452575, D:L462753-462775, D:L409226-409267, D:L458314-458334, D:L457899-457932, D:L458174-458297); owed: capture NU5-1 |
| `PICKUP_HAND_READING` (built 2026-10-14, NU-5 H1: re-filed from `PICKUP_HAND_PLACEHOLDER`; was: candidate re-file) | server `pickups.ts` (`worldDrops.ts`) | `'the hand kept'`: `FUN_005bc410` writes no `+0x824` and refreshes the hand only for its slot (D:L473823-473868); a launcher into the hand's slot re-chooses it (D:L458273-458276); owed: capture NU5-1 (an exchange into the stowed slot) |
| `PICKUP_KIT_LOST_AT_ROUND_READING` (*note only*; held by P1) | server `room.ts` `spawn` (doc) | `'lost at the next round'`: `FUN_00223680` D:L75925-75931, `FUN_00599b60` D:L455158, D:L455659-455674, `FUN_00599f00` D:L455791-455830; owed: capture NU5-3 |
| `PICKUP_LAUNCHER_READING` (built 2026-10-14, NU-5 L1, both halves: the page's `net/pickupRules.ts`, `drops.ts`, `takeKit.ts`, and the room's `pickups.ts` `claimWeapon` and `worldDrops.ts` `take`; was: the page half first, "the room half waits on the reported `room.ts` and slot questions"; was: candidate, L1) | server `pickups.ts`; viewer `net/pickupRules.ts`, `drops.ts` | `'claimable with one round, by a kit carrying no launcher'`: offered only when `FUN_005bac30` answers -- no item of `FUN_003c5d80`'s list carried (D:L473027, D:L473033-473035, D:L317287-317299) and a slot 2-4 free or replaceable (D:L473035-473082) -- else `FUN_00541d40` refuses it (D:L409249-409253); installed by `FUN_0059f0c0` D:L458238-458292 into `FUN_005bae60`'s slot, one round (`FUN_005ba3d0` D:L472704-472773); was: "`'claimable with one round, when the kit has a place'`" (the review, F1); owed: capture NU5-5 |
| `PICKUP_LAUNCHER_ROUNDS_READING` (built 2026-10-14, NU-5 L1) | viewer `net/pickupRules.ts` (the room and the page) | `1`: the claimed launcher's round installed at the kit's count (`FUN_005bdfb0` D:L474716-474731) with one round (`FUN_005ba3d0(kit, slot, 1)` D:L458285-458291); the accept carries no count of it -- `FUN_002ba1f0` (D:L159823-159836) sends 8 bytes: the pickup's id (u32), the taker's id (u16), the request's entry count (u8: 1 for a weapon, `FUN_0059f610` D:L458326, D:L458330) and the accepted mask (u8, bit 0 set when the pickup's weapon item matches, D:L457918); each console's `FUN_002ba1a0` (D:L159807-159817) -> `FUN_0059dfb0` (D:L457694-457706) -> `FUN_0059f0c0` installs the one round by rule; owed: capture NU5-5 |
| `LAUNCHER_SLOT_KEPT_READING` (built 2026-10-14, NU-5 L1) | viewer `net/pickupRules.ts` | the ten ids an empty-ringed slot 2-4 keeps in `FUN_005bac30` / `FUN_005bae60` (D:L473062-473066, D:L473128-473132): 0xff, 0xfe, 0xc3, 0xc2, 0x91, 0x8d, 0x92, 0x0b, 0xc1, 0xbe; their meaning (which item a launcher displaces) stays `PICKUP_LAUNCHER_SLOT_PLACEHOLDER`'s; owed: capture NU5-5 |
| `PICKUP_LAUNCHER_SLOT_PLACEHOLDER` (candidate, L1, named in `net/pickupRules.ts`'s docs, no constant; was `PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER`, a name since given to the five-slot question below) | server `pickups.ts` | `FUN_005bae60`'s ten-id list's meaning (which equipment item a launcher displaces), a round item (0xb9, 0xba) carried with no launcher beside the new round installed at the kit's count (D:L458285-458291), and `FUN_00589900`; settles: a read of those, or capture NU5-5. The duplicate-pouch consequence from review 7c374ad0a F2 is resolved by MLS-EQ (2026-10-23, research 361 §3, reading pending review): `pickupKitOf` reads each slot's remaining ring, so one spent duplicate qualifies independently. *Was:* a name-pooled pouch kept that slot occupied until every matching stack was empty; "what becomes of a replaced launcher's round slot" first -- no launcher is replaced from the prompt (the review, F1) |
| `PICKUP_EXCHANGE_CLIP_READING` (*note only*; the behaviour built 2026-10-14 by NU-5 X1 as the mover action `swapRifleExchange`, no constant of this name; was: candidate, X1) | server `worldDrops.ts` (`take`); viewer the `kit` path | `'Swap rifle after an exchange'`: D:L458208-458211 (`DAT_003dec78`, research 211), the taker's own console (D:L458199); owed: capture NU5-1 |
| `PICKUP_LAUNCHER_ROUND_SLOT_PLACEHOLDER` (built 2026-10-14, NU-5 L1, the gameplay controller's decision (i); the name reused from the retired candidate above) | viewer `net/pickupRules.ts` (`launcherClaimSlots`; server `pickups.ts`, viewer `drops.ts`) | `'the first empty slot 2-4; none: refused'`: the original installs the round at the kit's count, a slot past the five (`FUN_005be030`, `FUN_005bdfb0` D:L458285-458289); the port's five-slot kit puts it in the first other empty slot 2-4 and, with none, neither offers nor takes the launcher; settles: a kit of more than five slots, or capture NU5-5 (a kit whose only free slot is a spent grenade's) |
| `PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER` (built 2026-10-14, NU-5 / research 324 P2) | server `worldDrops.ts` (`take`); viewer `walk.ts` (`pickupSwap`) | `'no action on the body'`: `FUN_00589900` answers 1 with no action on the stack (D:L446436-446437); with one, further tests (D:L446439-446470) not read; the port lays the launcher claim's clip only on an actionless body; with an action playing `FUN_00589900` still answers 1 (D:L446469) unless one of its tests answers 0 -- online with `+0x1061`'s bit (D:L446439-446440), `+0x1060`'s bit 4 with a knock-down type on top (D:L446441-446451), the top's `+0x2b` 8 outside stance 10 with neither fall (D:L446453-446461), or alive with `DAT_003dead8` playing (D:L446464-446466) -- so the port's 'no clip with any action' is the less likely default, for capture NU5-5 to settle (the review of 7c374ad0a, F4); settles: those tests read, or capture NU5-5 |
| `PICKUP_SWAP_OWN_LAG_READING` (built 2026-10-14, NU-5 X1, the gameplay controller's point 3) | viewer `walk.ts` (`pickupSwap`, `pickupClaimed`; `takeKit.ts`) | `"from the claim's command"`: the taker's own page starts `Swap rifle` at its claim's command + 1 (`pickupClaimed`), its clock caught up when the room's `kit` arrives (`pickupSwap`), so its phase is the room's from the message's next command and a fire is refused on both; what remains: the commands between the claim and the message ran on the page without the clip; the claim's command is told by the action part's fire table (`matchActions.ts` `pickup`), so only a claim sent some other way starts at the message (was: "with no claim's command told the page starts at the message", unwired). Was `'at the kit message'` (the review of 7c374ad0a, F3: a round trip behind the room); the page cannot know at the press (the room may refuse); the original's online taker applies the accept on receipt too (`FUN_002ba1a0` D:L159807-159817 -> `FUN_0059f0c0` D:L458209-458211); owed: capture NU5-1 (the taker's clip timed from the press) |
| `DROP_ITEM_ZANIM_PLACEHOLDER` (*note only*; candidate, X2) | viewer `drops.ts` | the `drop_item` zAnim (0x65f4e8; `FUN_00272bb0` D:L458212-458213, D:L458446-458447, D:L458615-458616) on each drop laid; what it plays is not read; settles: its script read off the map archives |
| `DROP_OWNER_DEPARTURE_PLACEHOLDER` (existing; candidate value `'stays, not takeable'`, O1) | server `worldDrops.ts` | the request sent only to a resolved owner (`FUN_002ba2c0` D:L159889-159893, `FUN_002bd4d0` D:L161795-161813); the departure's id -1 (D:L455524); medium: `FUN_00622818` not read; stays a placeholder until the review or capture NU5-4 |
| `PICKUP_FIRE_MODE_PLACEHOLDER` (*note only*; resolved 2026-11-03 as a reading, pending review: R323.11) | viewer `takeKit.ts` | the taken weapon's mode: `FUN_005bc410` zeroes `+0x6fc`, the slot's fire mode (D:L473830-473834); `FUN_005c0fd0` (D:L476658-476668) steps the hand's slot up to `MaxFireMode`, `FUN_005c4b10` (D:L478930-478931) a slot not in the hand once at the swap -- `accuracy.ts` `pickupFireMode`. The hand with an item or a launcher up (`+0x824` an equipment slot): neither firearm slot is the hand's, so the taken one steps once at the swap -- the page's `TakeKitDeps.inHand` (`matchFirearm.ts`'s `!itemUp && !launcherUp`) (closed 2026-11-03 at the review's F1; was: open, the page read `kitItem`, the last firearm). Capture NU5-1 would measure it running. *Was:* "whose meaning is not read; the port uses `defaultFireMode` (burst where enabled)" |

`WEAPON_DROP_AMMO_READING`, `PICKUP_FAMILY_READING` (its doc's "anything else ... is not claimed" changed with L1,
2026-10-14, the old text kept), `LAUNCHER_DROP_READING` (its doc's "not claimable this sprint" changed with L1, likewise), `AMMO_TRANSFER_PLACEHOLDER`,
`PICKUP_ROUTE_READING` and `PICKUP_PROMPT_COOLDOWN_READING` stand as research 234 files them.

**The captures that settle them** (a `HUMAN_TASKS.md` row when the build files them; these extend research 234's
capture B):

- **NU5-1, a pick-up by each team:** a SEAL takes a Terrorist's rifle into his rifle slot while holding his pistol, and
  a Terrorist takes a SEAL's pistol while holding it -- the prompt, the clip, the hand after, the fire mode shown, what
  lies at the taker's feet, and the cue (`PICKUP_ANY_SIDE`, `PICKUP_HAND`, `PICKUP_EXCHANGE_CLIP`,
  `PICKUP_FIRE_MODE`, `DROP_ITEM_ZANIM`).
- **NU5-2, a death carrying a picked-up weapon:** what lies on the ground after (the bundle, the taken weapon, the
  remaining slot) and the rounds in the bundle (R323.7).
- **NU5-3, the next round:** the carrier, alive at the round's end, at the next round's start
  (`PICKUP_KIT_LOST_AT_ROUND`).
- **NU5-4, a quitter's drops:** a player dies, leaves the game; another presses on his rifle (`DROP_OWNER_DEPARTURE`).
- **NU5-5, a launcher taken:** a LAW on the ground before a player with a free equipment slot (offered), one without
  (not offered) and one carrying an M203 rifle or a LAW (not offered) (`PICKUP_LAUNCHER`, `PICKUP_LAUNCHER_SLOT`;
  was: "by a player with a free equipment slot and by one without", the review, F1).
