# 324 -- The equipped weapon on the others' bodies, after a swap and after a pick-up (NU-6, PARITY-2)

- Date: 2026-10-14 (17:15Z). The next-update checklist's row NU-6
  ([plan](../plans/2026-10-13-next-update-checklist.md), folded into
  [PARITY-2](../plans/2026-10-08-web-sprint-parity-2.md) by NU.R2; the checklist leads the lane by PTW.R9). **A read
  alone** ([brief](../plans/briefs/2026-10-14-nu6-remote-weapon-read.md)): the build is a later brief, from section 7.
  Branch `agent/nu6-read` from `3e3774ab5`.
- Review: a fresh review of `e31ad50eb` returned PASS WITH FINDINGS (high), upholding §4. F1 (medium: a launcher
  claim pushes `Swap rifle` on the copy too), F2 (low: P3 cannot land alone) and F3 (low: two cites) are folded
  here, each re-read at the source, the text they corrected kept beside ("was: ..."); the gameplay controller's
  ruling on §4 (2026-10-14) is recorded there and built as R1 (section 6). The status is unchanged.
- Build (2026-10-14, [brief](../plans/briefs/2026-10-14-nu6-remote-weapon-build.md), branch `agent/nu6`): P1 (pins),
  K1, P2, R1 and P3 of section 6 built, each marked "Built" in its row with what it replaced kept; the mount's offset
  read through the repository's reader (`REMOTE_LAUNCHER_MOUNT_READING`, §6 P2). Its values are reading, pending
  review. P2's room half, J1, W1, W2 and the copy's own swap selector stay held (section 6).
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, and the port's code was read. No game, emulator, reader, test or browser was run (no node process at all).
  Where the port's behaviour is stated it is read off its source, not run. Nothing here is proven, and nothing counts
  as a reading until a reviewer who did not write this note re-reads it at the source. A step marked *inference* is one
  interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The ELF
  `game/disc/socom2_game.elf` (read only, by its program headers, through a scratch script): the node names 0x65e6d8
  `null`, 0x65e6e0 `grenade`, 0x65e6e8 `rifle`, 0x65e6f0 `pistol`, 0x65e6f8 `launcher` (the kit's model instances, by
  family), 0x65f850 `grenade` (the name that gets no instance), 0x65c498 `rifle`, 0x65c4a0 `pistol`, 0x65c4a8 `grenade`
  (the body's item nodes), 0x65f138 `rifle`, 0x65f140 `pistol`, 0x65f148 `launcher` (a taken weapon's node names),
  0x65f8d8 `aimnodes`, 0x65c5b8 `launcher` (the body's launcher node). The disc's data: none read (no reader run, no
  golden needed). The desktop: none read (`desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` is the pin, unused). The
  port's lines are this branch's base `3e3774ab5`.
- Evidence read first, not restated: research [323](323-picking-up-dropped-weapons.md) §1.2, §1.3, §1.5, §6 (the
  accept, the record, the overlap this row takes), [234](234-the-inventory-as-built.md) (the inventory as built),
  [300](300-original-weapon-exchange.md) §4 (the remote rebuild left to `REMOTE_KIT_APPLY_PLACEHOLDER`),
  [211](211-the-weapon-swap-by-state.md) §1-§3.5 (the swap clips, the selector `FUN_005a64c0`, the re-parent),
  [193](193-m2-mp-net-replication.md) §2.3-§2.4, §4.1 (the SealObject's fields, the send policies, the late join; the
  wire's layout as a whole is the online lane's, research 312, 314, 315), [94](94-the-arsenal.md) §A6 (the kit on the
  wire, `REMOTE_KIT_APPLY_PLACEHOLDER`), [230](230-gameplay-feel-parity-audit.md) §5.2.10-§5.2.11
  (`LAUNCHER_RAISE_NETWORK_LOG_READING`, PAR-84), [317](317-bodies-and-drops-on-the-ground.md) §5 B1 (the corpse's
  item nodes hidden), [201](201-r2-c2-movement.md) §19 (the binoculars' body, unresolved there).

## The owner's item (NU.R1)

From the checklist's NU.R1 (the owner, 2026-10-13, verbatim): "Ensure SEALs and Terrorists display the correct equipped
weapon models, including picked-up weapons."

The row (NU-6, verbatim): "**SEALs and Terrorists show the equipped weapon's model, picked-up weapons included.** The
remote player's drawn weapon follows the seat's equipped weapon (the room's record, the wire's field), for both sides,
after a swap and after a pickup; the model from the weapon table's entry; a test per side and per transition."

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R324.1 | **A body draws one model per family, on its own node, from the kit's first slot of that family.** The kit's fill makes one model instance per slot from the record's model name (record `+0x1c`, `FUN_003d2750`), named for its family's node -- `rifle`, `pistol` or `launcher` -- into the kit's model list `+0x834` (`FUN_00599f00` D:L455793-455817, `FUN_005c72c0` D:L480077-480121); an item of any other family (`grenade`) gets none (D:L480112). `FUN_005c6a40` / `FUN_005c6da0` hang the **first primary slot's** model on the rifle node (`+0x350`), the **first pistol slot's** on the pistol node (`+0x354`) and the **first rocket launcher slot's** on the launcher node (`+0x3a8`) (D:L479768-479879, D:L479884-479990). No side is read | the same for the two firearms: `kitOf` hangs slot 0's and slot 1's models from the weapon table's entry (`matchCore.ts:142-147`, `loadout.ts:83-86`; `remotePlayers.ts:889-899`); the port's kit keeps the primary in 0 and the pistol in 1, so "first of the family" and "slot 0 / 1" agree. **No launcher is drawn on a remote body** (P2) | §1.1 |
| R324.2 | **Which model is in the hand is the item-in-hand class `+0xf79`, moved at the swap clip's hand-off**: the switch writes the kit's slot `+0x824` at once (`FUN_005c4b10` D:L478842, research 211 §2) and the clip re-parents the nodes at its trigger phase (0.72 / 0.82 / 0.62, the overlay 0.79; research 211 §1, §3.5). The drawn models do not change at a swap; which node is under the hand does, mid-clip | the same: the room's slot changes at the press (`viewer/src/net/moverSim.ts:182-187`, was `moverSim.ts`, the review's F3), the page hands off at the clip's phase (`remoteKitOf`, `remotePlayers.ts:71-77`, `HAND_OFF_READING`) | §1.2 |
| R324.3 | **Another console swaps its copy by the item field, with its own selector.** The SealObject's field at `+0x66` is the hand's item id (`FUN_005c89d0`, 0xff none; D:L162059-162066). The receiver, when it differs, selects that item in the copy's kit (`FUN_005c8a20` D:L162369-162381), which writes `+0x824` and sets the kit's swap-pending bit (`FUN_005c50b0` D:L481436, D:L478991-479013); the copy's own raise tick runs (the remote controller's tick answers 1, `FUN_005e6400` D:L497496; D:L418527, D:L418611) and calls the selector on the copy's stance and speed (`FUN_005c1660` D:L476707-476734 -> `FUN_005a64c0`). So the copy plays the same clip family, chosen on its own state, from the field's arrival | the port draws the room's own clip and clock (`BodyState.action`/`overlay`), the item and slot by the snapshot: **the same picture, a different source** -- no build (`REMOTE_SWAP_BY_ITEM_READING`, *note only*) | §1.3 |
| R324.4 | **A pick-up changes the taker's drawn weapon at the accept, on every console; a firearm's with no clip on a copy.** Each console's `FUN_0059f0c0` hangs the very node that lay on the ground on the family's item node (`+0x388 + family x 8`, D:L458181; the copy's old model detached and its taken-model freed, D:L458217-458229; D:L458231-458235) under its family name (D:L458239-458255), keeps it as the slot's model (`FUN_005b8f20` D:L458272, D:L458280), and sets the kit's pending and **instant** bits (D:L458293-458294), so the next raise tick re-mounts with no clip (`FUN_005a64c0`'s instant branch D:L462019-462031: `FUN_005c6a40` / `FUN_005c6da0`). The hand stays on its slot (research 323 R323.3): a claim into the hand's slot shows the taken weapon in the hand at once; into the stowed slot, on its carry or holster node. Only the taker's own console pushes `Swap rifle` after an exchange (D:L458209-458211); a launcher claim, whose node holds no model, takes the first branch on every console, the copy included, and pushes the same `Swap rifle` when `FUN_00589900` answers (D:L458199-458206; the review's F1). *Was:* "with no clip on a copy" and "Only the taker's own console pushes `Swap rifle`, after an exchange" -- true of a firearm only | the same in what is drawn: `taken { did, by, kit }` -> `RemotePlayers.setKit` re-hangs both firearms at once (`netPage.ts:1477`, `remotePlayers.ts:622-627`), no action on the body; the body's item follows the room's live kit (`room.ts:5990-5996`). Whether the others see the taker's `Swap rifle` (a Push Blend only if its row is `network_log`) is not read (`PICKUP_CLIP_NETWORK_LOG_PLACEHOLDER`): it decides research 323's X1 page half | §1.4 |
| R324.5 | **A throwable, the claymore, C4, the Detonator, the binoculars: the firearm stays drawn.** None of them has a model instance in the kit (D:L480112: the `grenade` node gets none). Selecting a grenade or a charge (class 3) sets pending with no clip: the selector keeps the firearm's node in the hand and takes a 0.3 s body snapshot cross-fade (D:L461891-461920; research 211 §2's table); any other item (class 0) only re-hangs a null model (`FUN_005c6980` D:L479013, D:L479740-479765). What a throw or a placing draws in the hand is the throw's (research 85, NU-8), and the binoculars' body research 201 §19's | the same picture: the room's body keeps the firearm's id (`room.ts:5995`), the page the firearm in the hand; the throw's clip by `hands.follow`. The wire differs (the original's field names the selected throwable): no drawing consequence; the online seat's terms | §1.5 |
| R324.6 | **The sidearm** is the first pistol slot's model, on the hand or the holster (`+0x304`) by `+0xf79` (`FUN_00553290` D:L419021-419061; research 94 §A6) | the same (`remoteKit`, `remotePlayers.ts:28-30`) | §1.1 |
| R324.7 | **A rocket launcher is drawn on every body that carries one**: the launcher node (`+0x3a8`, under `spinehi`, research 317 §5 B1) takes the first launcher slot's model (D:L479872-479876). **Raised, the copy raises it itself**: the item field names the launcher's slot (or its round, `REMOTE_LAUNCHER_ITEM_PLACEHOLDER`), the copy's selector reaches `FUN_005a6d30` (D:L461886), which sets the launcher anim set, pushes the raise clip on the copy, sets `+0xf79` = 4 and re-parents the launcher node to the hand (D:L462097-462130). No Push Blend is needed for that | **differs twice**: no launcher model on a remote body at rest (P2); raised, the room's body item is the launcher's id in the firearm slot's place, and the page **hangs the launcher's model into kit slot 0 or 1** -- drawn in the rifle's or pistol's grip, the stored kit changed until the lower (`remotePlayers.ts:688-694`) -- while `remoteBodyAction` drops the raise clip (`remotePlayers.ts:56-60`, `LAUNCHER_RAISE_NETWORK_LOG_READING`). This challenges that reading's drawing consequence (section 4; upheld by the review and ruled, built as R1) | §1.6 |
| R324.8 | **A taken launcher** hangs on the launcher node under `spinehi` at the accept (D:L458238-458249), on every console, and every console -- the copy included -- pushes `Swap rifle` on the taker when `FUN_00589900` answers (D:L458199-458206: the launcher node holds no model, research 323 F1; the review's F1; was: the clip unstated) | the port refuses a launcher claim (research 323 L1) and draws none; with L1, the clip is P2's room row | §1.6 |
| R324.9 | **The copy's kit is the owner's chosen list, at its creation and at each round's re-place**: the 48-byte list at `+0x34` (`FUN_0053ee10` -> `FUN_0053ed50`, the character's `+0x2f0`) is applied when the copy is made (`FUN_002bf070` D:L162596 -> `FUN_00599690` D:L455441-455446 -> `FUN_0053ec60`) and when another console's player is re-placed for a round (`FUN_00598b90` D:L455069-455081 through `FUN_002bd3d0` D:L161729-161745), not on a field update (D:L162408-162410 counts only). The live kit's later changes reach a copy by the accept and by the item field (D:L162373-162378 installs an absent item at the kit's count) | the same moments: `spawn.kit` and the welcome's `players[].kit` (`netPage.ts:1288-1294`, `1391-1398`); `REMOTE_KIT_APPLY_PLACEHOLDER` is now readable (a re-file, section 6) | §2 |
| R324.10 | **A late joiner's copy is built from the chosen list** (D:L162596, then the whole field set, D:L162601), so a weapon taken before the join is installed by the item field with **no model instance** (`FUN_005bc410` makes none) and the nodes keep the chosen kit's first models (*inference*, medium) | the welcome sends the live kit (`room.ts:1583`): the joiner draws the taken weapon. Held, not built (`REMOTE_JOIN_KIT_PLACEHOLDER`, capture NU6-5) | §2 |

## 1. What the original draws in another player's hands

### 1.1 The models: one per family, from the weapon table's entry

- **The instances.** `FUN_00599f00` fills the kit from the character's list, slot by slot (`FUN_005bdfb0` D:L455799),
  and for each record makes its model: the record's model name (`+0x1c`, `FUN_003d2750` D:L325065-325069; D:L455803),
  with the node name chosen by the item's family (`FUN_005b8820`): `launcher` for 4, `pistol` for 2, `rifle` for 1,
  else `grenade` (D:L455806-455815), then `FUN_005c72c0(kit, model, node)` (D:L455817). Its first call appends the
  `null` model under `null` (D:L455793) -- the list's entry 0, so a slot's model is entry `slot + 1` (*inference* from
  the `+1` indexing of `FUN_005b8f20` D:L471885-471899 and `FUN_005b8ff0` D:L471917-471926). `FUN_005c72c0` loads the
  model once into the cache at 0x44cda8 (D:L480098-480101) and appends an instance to `kit+0x834` only when the node
  name is not `grenade` (D:L480112-480116); a `grenade`-family item appends 0. So grenades, charges, rounds and gear
  carry no held model in the kit. (Research 94 §A6 glosses this first call as "clears the kit"; it appends.)
- **The nodes.** The body's setup makes the item nodes `rifle` and `pistol` (`FUN_00553290(.., 1)` and `(.., 2)`,
  D:L419663-419664; the node at `+0x388 + kind x 8`, D:L419059): the rifle's parent is the hand `+0x300` when `+0xf79`
  is 1, else `+0x2fc`; the pistol's the hand when 2, else `+0x304` (D:L419036-419056). `+0x350` and `+0x354` are the
  same two nodes (D:L419666-419667). The launcher node `+0x3a8` is made by the same set-up as `launcher` (0x65c5b8)
  under `spinehi` (`+0x310`; D:L419674-419676; research 317 §5 B1).
- **The assignment.** `FUN_005c6a40` (D:L479768-479879) and `FUN_005c6da0` (D:L479884-479990) find the kit's first slot
  whose item is a primary (`FUN_003d1d10`: SMG, rifle, shotgun, MG, sniper, grenade launcher; D:L479789), the first
  pistol (`FUN_003d1ce0`, D:L479806) and the first rocket launcher (`FUN_003d1cb0`, class 0x91, D:L479823), and set
  each node's model to that slot's instance, shown (`+0x38` with 1; D:L479849-479876; the launcher's also re-attached
  to its parent). They run from the swap's re-parents (`FUN_005a70f0` D:L462213, `FUN_005a7260` D:L462250) and the
  selector's instant branch (D:L462019-462031).
- **No side.** Nothing on this path reads a side or a team; a SEAL and a Terrorist are drawn by the same code from their
  own kits (the side enters only through which kit the menus let each build, research 300 §4).

So **the drawn model is the weapon table's model of the kit's first slot of each family**. For the port's five-slot kit
(0 the primary, 1 the sidearm, 2-4 equipment) "the first primary" is slot 0 and "the first pistol" slot 1: the page's
`kitOf` (`matchCore.ts:142-147`: `slotModel(table, l, 0)` and `(.., 1)`, the record's `model`, `loadout.ts:83-86`)
draws the same models. No difference for the firearms.

### 1.2 A swap: when the drawn model changes, and which clip carries it

- The owner's switch writes `+0x824` at the press (`FUN_005c4b10` D:L478842) and sets the pending bit; the next raise
  tick runs `FUN_005a64c0`, which picks the clip by the stance and the speed (research 211 §2: `Rifle -> Pistol` 0x35
  standing, 0x36 crouched, 0x37 prone, the moving overlay `seal_mv_rifle2pistol` above 20 u/s; backwards to the rifle).
- **The models never change at a swap.** Which model is in the hand changes when the clip re-parents the nodes: at its
  trigger, 0.72 / 0.82 / 0.62 of the stance clips and 0.79 of the overlay (research 211 §1, research 251 §10), with
  the body's 0.4 s cross-fade and the instant node move of research 211 §3.5. Before the hand-off the old weapon is in
  the hand; after it the new one; the clip's own end mounts the final weapon (`FUN_005a60d0`, research 211 §2.6).
- The port: the room's slot moves at the press (`viewer/src/net/moverSim.ts:182-187`, was `moverSim.ts`, the review's
  F3; the body's item is `p.held ?? p.loadout[slot]`,
  `room.ts:5990-5996`); the page hangs the pistol into the hand or the holster at `HAND_OFF_READING`'s phase of the
  room's clip (`remoteKitOf`, `remotePlayers.ts:62-77`; `remoteKit.test.ts` 'standing ...', 'moving ...'). **The
  same.**

### 1.3 On another console: the copy's own swap, from the item field

- **The field.** The owner's console writes the SealObject (`FUN_002bd640` D:L161854-162076); its `+0x66` (wire order
  28, research 193 §4.1) is `FUN_005c89d0(kit)` when the hand has a record, else 0xff (D:L162059-162066).
  `FUN_005c89d0` (D:L481311-481326) reads the item `+0x7c` of `FUN_005c6600(kit, +0x824, 0xff)`, which for a
  launcher-bearing record (`FUN_003c5d80`: 52, 61, 63, 142, 143, class 0x91) in a mode word above 3 answers the slot of
  the round the mode names (D:L479605-479640): in a round mode the field names the round.
- **The receiver.** `FUN_002be150` (D:L162221-162461), when the field differs from its copy's
  (D:L162369-162372), calls `FUN_005c8a20(kit, id)`; when the copy's kit lacks the item it installs it at the kit's
  count and selects it (D:L162373-162378).
- **The select.** `FUN_005c8a20` (D:L481331-481612) finds the slot holding the item (preferring one whose ring holds
  rounds, D:L481348-481372) and sets the HUD's dirty bit (D:L481378). For a firearm, launcher or item it writes
  `+0x824` (D:L481387), classes the old and new items and calls `FUN_005c50b0(kit, old, new, old slot, 0)`
  (D:L481436), the same as the local switch; for a round (`FUN_003c5d20`: class 0xab or 0xb9, D:L481385) it selects the
  first launcher-bearing slot (D:L481470-481487) and sets that slot's mode to the round (D:L481568).
- **The pending bit** is set for a launcher, a throwable or charge, and a firearm not already in the hand
  (`FUN_005c50b0` D:L478991-479010). The copy's actor tick calls its controller's tick, whose answer gates the raise
  tick (D:L418526-418527, D:L418531); the remote controller's tick answers 1 (`FUN_005e6400` D:L497367-497496; research
  193: the `CRemoteCtrl` PreTick), so `FUN_005dfc80` runs (D:L418611) and ends in `FUN_005c1660`
  (D:L476707-476734), which calls `FUN_005a64c0(copy, +0xf79, class, instant)` -- **the same selector, on the copy's
  stance word and speed**. The kit's bit 0 that would skip it is the first tick's only (set by the kit's constructor
  `FUN_005c8190` D:L480942, cleared by `FUN_005c0250` D:L476275, called on the first run D:L476745; the review's F3,
  was: "cleared on the first run D:L476745").
- **When.** The field is registered with the policy `FUN_002bd120` (D:L162691-162692: the LAN record 0x440d10, online
  0x440da0, D:L161579-161593) and sent when it changed (`FUN_0061b2a0` D:L527146-527200) and its interval since its last
  send has run (`FUN_0061a488` D:L526640-526706); research 193 §2.3 reads the record as at least 100 ms on a LAN and
  200 ms online (not re-read here: the records are built by a static initializer at run time). A newly accepted client
  is sent the whole object (research 193 §2.4). So **the copy starts its swap at the field's arrival**, one send
  interval and the transit after the press at most, and hands off at its own clip's phase.

The port draws the room's clip on the room's clock, its hand-off at the same phase, the body interpolated
(`INTERP_DELAY_MS`): the same clip family, the same hand-off, chosen from the owner's state rather than the copy's. In a
stance or speed that differs between the owner and his copy at that moment the original's copy could pick another
clip of the four; that is the wire's timing, not a rule to build. *Note only*: `REMOTE_SWAP_BY_ITEM_READING`.

### 1.4 After a pick-up: at the accept, at once, no clip on a copy

`FUN_0059f0c0` (D:L458155-458300; research 323 §1.3) runs on every console when the accept arrives (research 323 §1.2:
`PU OK` -> `FUN_002ba1a0` -> `FUN_0059dfb0`), on the taker's own console and on each copy of him:

1. `cVar5` is the controller's `IsRemote` (D:L458177); `iVar1` the family's item node, `+0x388 + family x 8`
   (D:L458181: the rifle node for 1, the pistol node for 2, the launcher node for 4); `iVar13` the parent of the model
   it holds (D:L458184).
2. **The taker's own console** exchanges (drops the slot's ring and weapon, D:L458186-458189) and, after an exchange,
   pushes `Swap rifle` and the `drop_item` cue (D:L458208-458213; research 323 §1.5).
3. **A copy with a model on that node** detaches it (D:L458218), frees the slot's earlier taken model if any
   (D:L458221-458227), and takes the ground's node as the node's model (D:L458229). **No clip** is pushed on a copy
   by this branch. **A node with no model** (`iVar13` 0) sends every console, the copy included, down the taker's
   branch (D:L458199): with no exchange (always so on a copy, and for a launcher claim on the taker's too) a family-4
   claim pushes `Swap rifle` (`DAT_003dec78`) in the stance `+0x174` when `FUN_00589900` answers, the rifle node's
   blend bit cleared (D:L458200-458206). A launcher claim always meets an empty launcher node, since a kit carrying a
   launcher is offered none (research 323 F1), so **a launcher claim plays the clip on every console**. The copy's
   push sends nothing on (`FUN_00588bc0` sends only for an actor whose `IsRemote` answers 0, D:L446408-446414).
   (The review's F1; was: "**No clip** is pushed on a copy." unconditioned.)
4. Every console then hangs the ground's node on the node's parent (D:L458231-458235), names it for its family
   (`launcher` D:L458239, `pistol` D:L458252, `rifle` D:L458255), keeps it as the slot's model (`FUN_005b8f20`
   D:L458272 or D:L458279-458280), installs the record (`FUN_005bc410` D:L458271 or D:L458282), and sets the kit's
   pending (0x10) and **instant** (0x20) bits (D:L458293-458294).
5. The next raise tick: `FUN_005c1660` passes the instant bit (D:L476734); `FUN_005a64c0`'s instant branch re-mounts
   by the item in hand -- `FUN_005c6a40` with the rifle in the hand, `FUN_005c6da0` with the pistol, else by the
   nodes' parents (D:L462019-462031) -- **no clip, no change of hand**.

So **the taker's drawn weapon changes at the accept**, not at the next swap, on every console. With the claim into the
hand's slot (the hand kept, research 323 R323.3) the taken weapon is in his hands at once; into the stowed slot it is on
the stowed node (the rifle's carry `+0x2fc`, the pistol's holster `+0x304`) and comes to the hand at the next swap like
any slot. The weapon drawn is **the very object that lay on the ground** (research 323 §1.3), whose model is the item's
own (the drop's announce names the item, research 323 §6).

Whether the others also see the taker's `Swap rifle` after a firearm's exchange depends on its push being sent (a
launcher claim's is each console's own, step 3; the review's F1): `FUN_00588bc0` sends a Push Blend
for a local actor only when the type's anim-set row carries `network_log` (research 230 §5.2.10: `FUN_002bbaf0`
D:L160789-160790). `Swap rifle`'s row was not read (no golden holds `animset.rdr`'s flags; no reader was run):
`PICKUP_CLIP_NETWORK_LOG_PLACEHOLDER` (section 6). It decides research 323's X1 page half ("the other pages see it
through the taker's replicated state"): with no `network_log`, another page must draw no clip on the taker.

The port: the room broadcasts `taken { did, by, kit }` with the live kit (`worldDrops.ts:184`), and the next snapshot's
body item follows the live kit (`room.ts:5995`; the hand kept, `worldDrops.ts:183`). The page removes the drop and
`setKit(by, kit)` re-hangs both firearms from the weapon table at once (`netPage.ts:1477`; `remotePlayers.ts:622-627`,
`889-899`); a snapshot whose item differs from the stored kit's slot also re-hangs at once (`remotePlayers.ts:688-694`,
the receiver's install-if-absent, D:L162373-162378). No action reaches another page. **No difference in what is drawn**
(the port draws a fresh model of the same item, not the ground's object; the ground's object goes in both).

### 1.5 A throwable, the claymore, C4, the Detonator, the binoculars

- **No held model.** None of these is a primary, a pistol or a rocket launcher, so the kit's fill makes no instance for
  it (D:L455806, D:L480112) and the three nodes never show it.
- **Selected.** A grenade or a charge (class 3: 0x79, 0x97) sets the pending bit and re-hangs the slot's (null) model
  under `aimnodes` (`FUN_005c50b0` D:L478991-478994, `FUN_005c6980` D:L479740-479765); the selector, from a firearm to
  class 3, takes the body's 0.3 s snapshot cross-fade and moves no node (D:L461869, D:L461891-461920): **the firearm
  stays in the hand**. Any other item (class 0: the Detonator, gear) calls `FUN_005c6980` alone, with no pending bit
  (D:L479013). The binoculars are a view state, not a kit item (research 84 X3; research 201 §19 leaves their body
  unresolved).
- **In use.** The throw and the placing draw their own object and clip (research 85 §8.1, research 214, NU-8's row);
  not re-read here.
- The port: the room's body item stays the firearm's (`room.ts:5995`: only the rocket launcher enters `p.held`), the
  page draws the firearm in the hand and the hold's clip (`hands.follow`, `remotePlayers.ts:702`). **The same picture.**
  The wire differs: the original's field names the selected throwable or charge; the port's names the firearm. No
  drawing follows from it; the online seat's terms if anything else needs it.

### 1.6 The sidearm and the rocket launcher

- **The sidearm**: the pistol node, on the hand or the holster (section 1.1), its model the first pistol slot's. The
  port's `remoteKit` (`remotePlayers.ts:28-30`): **the same**.
- **The rocket launcher at rest**: the launcher node under `spinehi` carries the first launcher slot's model
  (D:L479872-479876, re-attached to its parent) on every body whose kit holds one -- at the kit's fill (*inference*: the
  first re-mount after the fill runs `FUN_005c6a40`) and after a launcher claim (D:L458238-458249: the taken launcher's
  node named `launcher`, the launcher node re-parented under `spinehi` `+0x310`). At a remote's death it is hidden
  with the other item nodes (research 317 §5 B1). **The port draws no launcher on a remote body** (and no carried
  launcher on the page's own third-person body either: the `Mount` type has no launcher mount, `heldItem.ts:77`).
- **The rocket launcher raised**: the owner's raise is a kit select of the launcher's slot (research 230 §5.2.10), so
  the item field changes. On the copy, `FUN_005c8a20` -> `FUN_005c50b0(.., 4, ..)` sets pending (D:L478996-478998)
  and the copy's selector reaches `FUN_005a6d30(copy, from)` (D:L461886), which sets the launcher anim set
  (D:L462105), pushes the raise -- `DAT_003df0e0` with the rifle in the hand, `DAT_003df0e8` with the pistol
  (D:L462108-462116) -- sets `+0xf79` = 4 (D:L462119) and re-parents the launcher node to the hand (D:L462120-462125).
  The lower is the same path back (`FUN_005a6b70`, D:L461875). **So another console draws the raise and the lower on
  its copy without any Push Blend.** Two steps are not read: which id the field carries for a raised launcher (the
  launcher's, or its round's when its mode word names the round, `FUN_005c4600` D:L478557-478640 through
  `FUN_005c4480`, not read), and, for a round, which carrier the copy selects when the kit holds two launcher-bearing
  items (the first, D:L481470-481484) -- `REMOTE_LAUNCHER_ITEM_PLACEHOLDER`.
- The port: the room's body item is the launcher's id while raised (`p.held`, `room.ts:4304`, `:5995`) in the firearm
  slot's place (`slot` stays 0 or 1). The page then finds `known[slot] !== held` and **hangs the launcher's model into
  kit slot 0 or 1** (`remotePlayers.ts:688-694`): the LAW is drawn in the rifle's (or the pistol's) grip, and the stored
  kit keeps the LAW in that slot until the lower's snapshot hangs the firearm back. `remoteBodyAction` drops the raise
  and lower actions (`remotePlayers.ts:56-60`) by `LAUNCHER_RAISE_NETWORK_LOG_READING` (`false`): research 230 §5.2.10
  reasoned that with no `network_log` "the others then see the item" and drop the clips. **This read finds the copy
  plays the clips itself from the item** (section 4).

## 2. The copy's kit: when another console takes it up

- **At the copy's creation** (a SealObject create, `FUN_002bf070` D:L162547-162620): a player (state word without
  0x10020000, D:L455441) gets the remote controller (`PTR_PTR_00669590`, D:L455436) and a character whose list is the
  object's 48-byte `+0x34` (`FUN_0053ec60` D:L455445, D:L407354-407378), then the actor is built from it
  (`FUN_005999e0` D:L455446 -> the kit's fill, section 1.1), then every field is applied (D:L162601).
- **At each round's re-place**, online, for a player whose controller is not the local one (`+0x2c`), the list is read
  again from the object (`FUN_002bd3d0` D:L161729-161745: the object's `+0x34`) into the character `+0x540`
  (D:L455069-455081) before the rebuild (research 323 §3). The list is the owner's **chosen** kit: `FUN_0053ee10` packs
  his character's `+0x2f0` (D:L407412-407437, `FUN_0053ed50` D:L407387-407405), the list the Weapon Exchange and the
  ARMORY write (research 300 §6).
- **A field update does not apply it**: the loadout's field (registered twice, D:L162707-162710) only counts on receipt
  (D:L162408-162410).
- **Between rounds of play**, the copy's live kit changes only by the accept (section 1.4) and by the item field's
  install-if-absent (D:L162373-162378).

So `REMOTE_KIT_APPLY_PLACEHOLDER`'s "when another console's body takes up a received kit ... is not traced" is now
read: at the copy's creation and at each round's re-place, from the chosen list (section 6). The port's moments are the
same (`spawn.kit`, `netPage.ts:1391-1398`; the welcome's `players[].kit`, `:1288-1294`; `taken.kit`, `:1477`).

**A late joiner** (*inference*, medium): the owner sends the joiner the whole object (research 193 §2.4), so the
joiner's copy is built from the chosen list, then the item field selects the hand's item, installing it at the kit's
count when the chosen list lacks it (D:L162373-162378). `FUN_005bc410` makes no model instance (D:L473811-473870), and
the three nodes take the first slot of each family (section 1.1) -- the chosen kit's. So a weapon taken before the join
would be drawn as the chosen kit's weapon of its family, in the hand or stowed. The port's welcome sends the live kit
(`room.ts:1583`), so its joiner draws the taken weapon. Held (`REMOTE_JOIN_KIT_PLACEHOLDER`, capture NU6-5): the
inference rests on the instance list not growing at an install, which `FUN_005c72c0`'s only callers (the fill)
support, and on the item field arriving after the create, which D:L162601 shows.

## 3. What the wire carries for the drawing

| the original's field | written | applied | sent | the port |
|---|---|---|---|---|
| SealObject `+0x66` (u16, the hand's item id; 0xff none) | `FUN_002bd640` D:L162059-162066 (`FUN_005c89d0`) | `FUN_002be150` D:L162369-162381 -> `FUN_005c8a20` (select; install when absent) | on change, no sooner than the policy `FUN_002bd120`'s interval (D:L162691-162692; LAN 0x440d10, online 0x440da0: >= 100 / >= 200 ms by research 193 §2.3), and whole at a late join or refresh | `BodyState.weapon` (u8, the item id) and `BodyState.slot` (1 bit) **every snapshot** (`net/codec.ts:163-164`; `room.ts:5990-5996`) |
| SealObject `+0x8a` (u8, the hand slot's mode word `+0x6fc`) | `FUN_005c3790` D:L162067, D:L477840-477845 | `FUN_005c37b0` D:L162361-162368 (the mode set) | policy `FUN_002bd160` (D:L162689-162690) | none on the body: no drawing follows from it (the fire mode); named for the online seat |
| SealObject `+0x34` (48 bytes, the chosen list: 8 x {id and round, rounds, magazines}) | `FUN_0053ee10` D:L162068 | at the copy's create (D:L162596) and each round's re-place (D:L455069-455081); counted only on update (D:L162408-162410) | policy `FUN_002bd0a0` (D:L162707-162710) | `spawn.kit` (`room.ts:2767`), the welcome's `players[].kit` (the live kit, `room.ts:1583`) |
| `PU OK` (8 bytes: the pickup, the taker, the count, the mask) | `FUN_002ba1f0` (research 323 §1.2) | `FUN_002ba1a0` -> `FUN_0059f0c0` on every console (section 1.4) | once, at the accept | `taken { did, by, kit }` (`worldDrops.ts:184`) |
| the swap's clip | not sent: each copy chooses its own (section 1.3) | -- | -- | `BodyState.action` / `overlay` with their clocks and directions (the room's clip) |

**Fields the port lacks, for the drawing: none.** The firearm models, the swap's hand-off and a pick-up are drawn
from what the port sends. Two wire differences are named for the online seat's terms, not designed here: in a launcher
round mode (the M203's grenade, a raised rocket launcher if `REMOTE_LAUNCHER_ITEM_PLACEHOLDER` reads the round) the
original's `+0x66` names the round, the port's `weapon` the carrier; with a throwable or a charge selected the
original's names it, the port's the firearm. Neither changes a drawn model (sections 1.5, 1.6).

## 4. A finding against `LAUNCHER_RAISE_NETWORK_LOG_READING`'s drawing consequence

PAR-84 (research 230 §5.2.10-§5.2.11, built) read that the rows `Rifle -> Launcher` and `Pistol -> Launcher` carry no
`network_log`, so no Push Blend is sent for the raise or the still lower -- a reading this note does not dispute -- and
concluded that "another page drops the two codes for drawing, playing the body's ground" (`remoteBodyAction`), on the
premise that without the push "the others then see the item" only. This read finds the item is enough: the copy's
item field selects the launcher's slot (or its carrier through the round), which sets the pending bit
(`FUN_005c50b0` D:L478996-478998), and the copy's own raise tick runs the selector into `FUN_005a6d30`
(D:L461886, D:L462097-462130) -- the raise clip pushed on the copy, the launcher in its hand. So the original's others
likely **do** see the raise and the lower, played by their copies (reading of the path; one step unread, which id the
field carries, `REMOTE_LAUNCHER_ITEM_PLACEHOLDER`). This is for the controller and PAR-84's reviewer; nothing here
changes it. A capture settles it (NU6-4).

**The ruling (the gameplay controller, 2026-10-14, after the review of `e31ad50eb` upheld this section).** The merged
`LAUNCHER_RAISE_NETWORK_LOG_READING = false` (no Push Blend sent) stands; its drawing consequence, "the others see
only the item", is wrong. Each copy plays the raise and the lower itself:

- the raise: the item field (D:L162369-162373) -> `FUN_005c8a20` (D:L481436) -> `FUN_005c50b0` class 4
  (D:L478996-478998) -> the copy's tick (`FUN_00551ec0` D:L418611) -> `FUN_005c1660` (D:L494228) -> `FUN_005a64c0` on
  the copy's own `+0xf79` (D:L476734) -> `FUN_005a6d30` (D:L461886), which installs the set (D:L462105) and pushes the
  raise (D:L462113, D:L462116);
- the send is gated on `IsRemote` answering 0 (D:L446408-446414), so the copy plays without re-broadcasting;
- the lower comes back the same way: `FUN_005a6b70` (D:L461875), the pending bit set for a firearm not in the hand
  (D:L479001, D:L479007).

Built as R1 (section 6). *Was:* "This is for the controller and PAR-84's reviewer; nothing here changes it." (still
true of this note: the code changes are R1's build). Research 230 §5.2.10 step 7, §5.2.11's first row and
`LAUNCHER_REMOTE_SET_READING` carry the correction with their own "was".

## 5. The port against the read

The port's tree is `3e3774ab5`. Rows marked "--" agree.

### 5.1 The room

| # | the original | the room | difference |
|---|---|---|---|
| -- | the hand's slot moves at the press (§1.2) | `MoverSim` moves `weapon` at the press (`viewer/src/net/moverSim.ts:182-187`, was `moverSim.ts`, the review's F3); the body's item `p.held ?? p.loadout[slot]` (`room.ts:5990-5996`) | none |
| -- | a pick-up's accept to every console, the live kit's record (§1.4) | `taken` with the live kit to every page (`worldDrops.ts:174-187`); the body's item from the live kit, the hand kept | none |
| -- | the copy's kit is the chosen list at creation and at each round (§2) | `spawn.kit` = the spawned kit (`room.ts:2767`), `p.next ?? typeKit` (research 323 §3) | none |
| W1 | a throwable or charge selected: the field names it (§1.5) | the body's item stays the firearm's (`room.ts:5995`) | wire only; nothing drawn differs |
| W2 | in a round mode the field names the round (§1.3) | the carrier's id (the M203 rifle; a raised launcher's own id) | wire only; nothing drawn differs |
| J1 | a joiner's copy from the chosen list and the item field (§2, *inference*) | the welcome sends the live kit (`room.ts:1583`) | **the taken weapon drawn to a joiner**; held |

### 5.2 The page

| # | the original | the page | difference |
|---|---|---|---|
| -- | the first primary's and pistol's models from the weapon table's entry, either side (§1.1) | `kitOf`: slot 0's and 1's `model` (`matchCore.ts:142-147`, `loadout.ts:83-86`), no side read | none (the port's kit order makes "first" slot 0 / 1) |
| -- | the swap: the models unchanged, the hand-off at the clip's phase (§1.2-§1.3) | `remoteKitOf` at `HAND_OFF_READING` on the room's clip (`remotePlayers.ts:62-77`) | none drawn; the copy's own selector against the room's clip (`REMOTE_SWAP_BY_ITEM_READING`, note) |
| -- | a pick-up: the family's node takes the taken weapon at the accept, hand kept, no clip on a copy for a firearm (§1.4; a launcher claim's clip on every console is P2's, the review's F1; was: "no clip on a copy") | `taken` -> `setKit` -> `hang`, both firearms re-hung at once, no action (`netPage.ts:1477`, `remotePlayers.ts:622-627`, `889-899`) | none drawn; unpinned by a test per side (P1) |
| -- | a throwable, charge, Detonator, binoculars: the firearm stays in the hand (§1.5) | the firearm in the hand, the hold's clip | none |
| -- | the sidearm on the hand or the holster (§1.6) | `remoteKit` (`remotePlayers.ts:28-30`) | none |
| P2 | a carried rocket launcher drawn on the launcher node under `spinehi`, a taken one too (§1.6) | none drawn; no launcher mount (`heldItem.ts:77`) | **no launcher on a remote body** *(built 2026-10-14, NU-6 P2: the kit's first launcher on the body's `launcher` node at the `launcher` gear's offset, `REMOTE_LAUNCHER_MOUNT_READING`; was: the difference stood)* |
| P3 | a raised launcher: the copy raises it, the launcher node in the hand (§1.6, §4) | the launcher's model hung into kit slot 0 / 1 and drawn in the firearm's grip; the stored kit changed until the lower (`remotePlayers.ts:688-694`); the clip dropped (`:56-60`) | **the launcher in the rifle's place, the kit overwritten**; the clip's half is R1 (the ruling; was: "held on §4") *(built 2026-10-14, NU-6 P3 with R1 and P2: the kit kept, the launcher in the hand while the body's item is a launcher's and on through the still lower's clip to its end (`FUN_005a6d30` D:L462120-462126 re-parents it to the hand at the raise's push; `FUN_005a6b70` D:L462045-462092 re-parents nothing; `FUN_00582540` D:L443057-443071 -> `FUN_005a60d0(.., firearm, 4)` D:L461769-461820 puts it back under `spinehi` at the reversed clip's end), the firearm stowed meanwhile, the raise and the lower drawn; `REMOTE_LAUNCHER_HAND_READING`; was: the difference stood)* |
| P4 | `REMOTE_KIT_APPLY_PLACEHOLDER`'s question (§2) | `'spawn'` | none: a re-file (section 6) |

## 6. The build list

Each row is RED first, room and page on the same command where both exist; every row is the simulation track. A test
per side (a SEAL seat and a Terrorist seat) and per transition (a swap each way, a pick-up into the hand's slot and into
the stowed slot), as NU-6's row asks.

- **P1 -- the rules held by tests (no behaviour change).** These pass on today's code; they pin it before P2 and P3
  touch the same functions.
  - The page (`remoteKit.test.ts`, `remotePlayers.test.ts` with a stub `SideKit`): for each side, a body spawned with
    a kit draws slot 0's model in the hand and slot 1's on the holster; a swap each way hands off at the clip's phase
    (the existing standing and moving cases, now for a Terrorist body too); `taken` with a kit whose slot 0 changed
    re-hangs the hand's model at once with the rifle in the hand, and the carried model with the pistol in the hand;
    no action is drawn on the taker for a `taken`.
  - The room (`roomPickups.test.ts`): for each side, a claim into the hand's slot makes the next body's `weapon` the
    taken item and leaves `slot`; a claim into the stowed slot leaves `weapon`; `taken.kit` is the live kit.
  - A dev-disc case over the kit table: a cross-side weapon's record has a model the map's library builds (`kitOf`
    resolves a Terrorist's AK-47 for a SEAL seat), skipping without the disc (a skip is said).
- **P3 -- a raised launcher keeps the kit (§1.6).**
  - The page: an item in the hand of the rocket-launcher class is not written into kit slot 0 / 1
    (`remotePlayers.ts:688-694` tests the item's class before the install-if-absent), so the firearms stay hung and
    the stored kit unchanged. What is drawn in the hand while raised is P2's launcher mount with the hand's parent,
    and the raise and the lower are drawn by R1. *Was:* "and whether the raise clip is drawn waits on §4 (the
    controller's call with PAR-84's reviewer; no change to `remoteBodyAction` before it)" -- ruled (§4).
  - **P3 lands with P2 and R1, on one command** (the review's F2): alone it would leave a raised launcher drawn as
    nothing -- the rifle in the hand and the clip dropped -- which is worse than today's LAW in the rifle's grip.
    *Was:* P3 listed alone, before P2, with no word on its order.
  - *RED:* `remotePlayers.test.ts` -- a body whose snapshot item becomes 145 with `slot` 0 keeps its rifle model on
    the rifle and `playerKit(id)` unchanged; at the lower the rifle is in the hand with no re-hang.
  - *Built 2026-10-14 (NU-6 P3, with R1 and P2 on adjacent commits; reading, pending review).* `remotePlayers.ts`:
    an item of the rocket launcher class is never written into the kit (`remoteLauncherInHand` before the
    install-if-absent); the launcher is drawn in the hand while the body's item is a launcher's and on through the still lower's clip to its end (`FUN_005a6d30` D:L462120-462126 re-parents it to the hand at the raise's push; `FUN_005a6b70` D:L462045-462092 re-parents nothing; `FUN_00582540` D:L443057-443071 -> `FUN_005a60d0(.., firearm, 4)` D:L461769-461820 puts it back under `spinehi` at the reversed clip's end),
    on the hand's held node at its origin as the page's own raised launcher is (`./rocket`; `HOLSTER_TRACK_READING`),
    where the original's launcher node under `rhand` sits at the launcher clips' `launcher` track or, with none, the
    `launcher` gear's offset (`FUN_0058acc0` D:L447128-447229) -- not built, named under `HOLSTER_TRACK_READING` (F3),
    the firearm stowed meanwhile (`Play.setRifleStowed`, the own page's rule) -- `REMOTE_LAUNCHER_HAND_READING`. The
    stick's moving lower (PAR-83) rides no body action, so another page puts the launcher back at the item's change;
    its own end mount is not read (named in the reading). Tests: `remotePlayers.test.ts` "NU-6 P3" (both sides),
    `remoteLauncher.test.ts` "NU-6 R1 + P3" (the room's mover laying 21 and 22, raise and still lower, across the
    wire to another page's body: the clips played, the launcher in the hand and back, the kit and the firearms
    untouched).
  - *The room's timing (F1 of the build's review, 2026-10-14; reading, pending review):* the body's item and the
    launcher clip change on one command -- the raise's push and the launcher to the hand on one frame (`FUN_005a6d30`
    D:L462105-462126), the lower's push with the item (`FUN_005a6b70` D:L462045-462092) -- so `room.ts` takes a raise's
    or a still lower's item on the clip's own command, the event's seq + 1 (`Player.heldNext`, `heldOn`;
    `roomLauncherBody.test.ts`). *Was:* the item at the event, the clip on seq + 1: a snapshot between drew the still
    lower with the LAW on the back (the review's F1).
    *Residual (N2 of the re-review, record only):* inside a dropped backlog the item is taken on its dropped command
    (`room.ts:2412`, `heldOn` in the backlog loop) while the kept clip starts only in `MoverSim.prepare`
    (`viewer/src/net/moverSim.ts:177`) on the kept command, which waits for the next tick (`room.ts:2468`): another page
    draws about one snapshot (33 ms) of the LAW in the hand before a raise's clip, or on the back on a still lower's
    first snapshot. Only on a dropped backlog and a snapshot tick; before F1 the split was every event.
    *A swap before a waiting raise (N1 of the re-review):* the raise's press lands inside the swap's clip, where the take
    is refused (`FUN_005a8cb0` D:L463150 -> `FUN_005a7de0` D:L462594 -> `FUN_005a7ab0` D:L462512, D:L462636), so the
    room refuses it (`refuseRaise`: its set put back, nothing up, its kept clip refused). *Was:* the raise dropped with
    its set left `until: Infinity` and its clip played on the swapped-to firearm, every later jump refused.
    *Named residual:* the room decides the raise when its event arrives, not at its own command, so a raise pressed
    after the swap's clip ended but arriving while the room still queues that swap is refused too, where the original
    takes it as a fresh press (LATER 49).
- **R1 -- the remote raise and lower (§1.6, §4; the ruling of 2026-10-14).** Listed for the build, not made here.
  *Built 2026-10-14 (NU-6 R1, on the commit with P3; reading, pending review):* `remoteBodyAction` keeps every
  action; its doc, `LAUNCHER_RAISE_NETWORK_LOG_READING`'s (`mover.ts`, the value `false` unchanged) and
  `locomotion.ts`'s comment carry "was"; `remoteLauncher.test.ts`'s two PAR-84 cases inverted, the old pins kept in
  its doc. *Was:* "Listed for the build, not made here."
  - The page: `remoteBodyAction` (`remotePlayers.ts:56-59`) keeps `rifleToLauncher` / `pistolToLauncher`: the room's
    mover action stands in for the copy's self-pushed clip, as the swap's already does (§1.3). Its doc
    (`remotePlayers.ts:49-55`) and `LAUNCHER_RAISE_NETWORK_LOG_READING`'s doc (`mover.ts:1034-1044`) each get a "was:"
    line; `locomotion.ts:70`'s comment ("another page draws them per `LAUNCHER_RAISE_NETWORK_LOG_READING`") is
    corrected to the copy's own push. The constant and its value (`mover.ts:1045`, `false`) are unchanged: no Push
    Blend is sent.
  - *RED first:* `remoteLauncher.test.ts:49-78`'s two cases inverted -- `remoteBodyAction` keeps both codes, raised
    and lowered (the swap's code still the control), and a remote body carrying code 21 or 22 plays the action, not
    its ground.
  - The room: none (the action already rides `BodyState.action`, PAR-84).
  - With P2 and P3 on the same command (F2): the launcher mount in the hand under the clip.
- **P2 -- the carried rocket launcher (§1.6).**
  - The page: a launcher mount on the body (the node under `spinehi`), `hang` takes the kit's first rocket launcher's
    model (from `spawn.kit`, the welcome's, `taken.kit`) onto it; hidden at a death with the firearms (NU-4 B1's
    rule, `remotePlayers.ts:713`); in the hand while raised (P3). The mount's offset is not read
    (`REMOTE_LAUNCHER_MOUNT_PLACEHOLDER`): the build reads it first (the node's local transform under `spinehi`, as
    research 317 §5 B1 names the node) or holds.
  - *Built 2026-10-14 (NU-6 P2; reading, pending review).* The offset reads: the set-up's node gets no matrix of its
    own (`FUN_00316e30`, `FUN_0028ec30`, D:L419668-419676); the kit's fill looks up the gear named `launcher`
    (`FUN_0058b0f0` D:L447285-447286, 0x65d198) and pairs it with the node (D:L447287-447295); `FUN_0058b040`
    (D:L447235-447266) writes the gear's translation and turn into the node at the lower's end (`FUN_005a60d0(.., 4)`
    D:L461769-461784), the kit's switch (`FUN_005c50b0` D:L479053) and a launcher claim (D:L458241-458249), and
    `FUN_0058acc0` (D:L447128-447229) on every clip with no track for the node. So the mount is `character.rdr`'s gear `launcher` (model `NONAME`, `ofs` on `spinehi`: (0, -1.61, -1.5), turned (463.68, 190.57, 181.51) DEG, `READERC.ZAR` through `parseCharacterTable`, turned by `gearMatrix`):
    `REMOTE_LAUNCHER_MOUNT_READING` and `launcherCarryMatrix` (`heldItem.ts`), `firstLauncher` and
    `RemotePlayers.placeLauncher` (`remotePlayers.ts`), hung from the kit at `hang` (`spawn.kit`, the welcome,
    `taken.kit`), hidden at a death with the firearms. The launcher's model is the `SideKit` callback's own `launcher`
    field (`matchCore.ts` `setRemoteMap`: the kit's first rocket launcher's record's model; `remoteKitModels.test.ts`:
    AT4 for 145, RPG7 for 146 on Frostfire) -- F2 of the build's review. *Was:* "comes through the page's `SideKit`
    callback asked for the kit with the launcher in the firearm's slot (`slotModel` resolves any record's model by its
    id), so `matchCore.ts` is unchanged" -- a map without the tables drew the baked rifle on `spinehi`. Tests: `heldItem.test.ts` (the transcription, and the dev-disc re-read),
    `remotePlayers.test.ts` "NU-6 P2". The own body's carried launcher (`rocket.ts`, `play.ts` `launcherNode`) still
    hangs at the node's origin (`HOLSTER_TRACK_READING`): the same read settles it, a follow-up outside this build's
    files. *Was:* "The mount's offset is not read" (above).
  - *RED:* `remotePlayers.test.ts` -- a SEAL body with a LAW in slot 2 and a Terrorist body with an RPG-7 each draw the
    launcher's model on the back mount; a kit with none draws none; a corpse draws none.
  - The room: the kit is already on the wire; a claimed launcher (research 323 L1) reaches the page through
    `taken.kit`. With L1 built, a launcher claim's `Swap rifle` -- pushed on every console, the copy included
    (§1.4 step 3, D:L458199-458206) -- is the taker's mover action in the room (an action code appended as PAR-84's
    were, under `FUN_00589900`'s gate as research 323 X1 takes it), so every page draws it from the body; *RED:*
    `roomPickups.test.ts` (a LAW claim lays the clip on the taker's mover; a firearm claim with no exchange lays
    none), and a page test drawing the action on the taker's remote body. *Was:* "The room: none (the kit is
    already on the wire). A claimed launcher (research 323 L1) reaches the page through `taken.kit`." (the review's
    F1).
  - *Built 2026-10-14 (NU-5, the room half; reading, pending review).* `WorldDrops.take` asks the room's `swapRifle`
    sink after a launcher claim (`room.ts`: kept on `MoverSim.launcherClips` at the claim's command + 1, as PAR-84's
    raise), under `PICKUP_LAUNCHER_CLIP_GATE_PLACEHOLDER` (research 323 §8); the action `swapRifleClaim` appended to
    `ACTION_CODES` (code 24), which `remoteBodyAction` keeps, so another page draws it on the taker's body
    (`remoteLauncher.test.ts` "NU-5"); the exchange's `swapRifleExchange` (code 23) it drops. The body's item does not
    change at a launcher claim (the launcher stows), so no snapshot splits an item from its clip.
- **K1 -- `REMOTE_KIT_APPLY_PLACEHOLDER` re-filed** as `REMOTE_KIT_APPLY_READING` (`'spawn'`), its doc citing §2: a
  rename and its doc, no behaviour; P1's spawn and `taken` cases hold it.
- **Held, not built:** J1 (a joiner's copy, capture NU6-5); W1 and W2 (the online seat's terms); the copy's own swap
  selector (`REMOTE_SWAP_BY_ITEM_READING`, note only). *Was:* "; research 323's X1 page half until
  `PICKUP_CLIP_NETWORK_LOG_PLACEHOLDER` is read" -- read and built by NU-5 (2026-10-14; §7).

## 7. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `REMOTE_FAMILY_MODEL_READING` (*note only*; candidate, P1) | viewer `matchCore.ts` `setRemoteMap` (doc) | `'the first slot of each family, the weapon table's model'`: `FUN_00599f00` D:L455793-455817, `FUN_005c72c0` D:L480077-480121, `FUN_005c6a40` D:L479768-479879, `FUN_005c6da0` D:L479884-479990; owed: capture NU6-1 |
| `REMOTE_PICKUP_REMOUNT_READING` (*note only*; candidate, P1) | viewer `remotePlayers.ts` `setKit` (doc) | `'at the accept, the hand kept, no clip on a copy'`: `FUN_0059f0c0` D:L458177-458235, D:L458293-458294; `FUN_005c1660` D:L476734; `FUN_005a64c0` D:L462019-462031; owed: capture NU6-3 |
| `REMOTE_SWAP_BY_ITEM_READING` (*note only*; candidate, none: held) | viewer `remotePlayers.ts` `remoteKitOf` (doc) | `'the copy's own selector at the item field's arrival'`: D:L162369-162381, `FUN_005c8a20` D:L481331-481612, `FUN_005c50b0` D:L478991-479013, D:L418611, D:L497496, D:L476707-476734; the port draws the room's clip; owed: capture NU6-2 |
| `REMOTE_KIT_APPLY_READING` (built 2026-10-14, NU-6 K1: the re-file of `REMOTE_KIT_APPLY_PLACEHOLDER`, which was its name; was: *note only*, candidate) | viewer `remotePlayers.ts` | `'spawn'`: the chosen list at the copy's creation (D:L162596, D:L455441-455446) and each round's re-place (D:L455069-455081, D:L161729-161745), not on an update (D:L162408-162410); owed: capture NU6-5 for the join |
| `PICKUP_CLIP_NETWORK_LOG_READING` (built 2026-10-14, NU-5 X1: read -- SOLDIER's `Swap rifle` row, `seal_swaprifle`, carries no `network_log`, over the tracked `READERC.ZAR` through the repository's reader (`roomPickups.test.ts` "NU-5 the Swap rifle clip"), so no Push Blend of the exchange's clip: another page drops `swapRifleExchange` (`remoteBodyAction`), and draws the launcher claim's, each console's own; was `PICKUP_CLIP_NETWORK_LOG_PLACEHOLDER`, *note only*, candidate, research 323 X1's page half) | viewer `remotePlayers.ts` `remoteBodyAction` | whether `Swap rifle`'s anim-set rows carry `network_log` (a Push Blend of the taker's clip, research 230 §5.2.10's rule; the copy pushes none itself for a firearm, D:L458217-458235, and its own for a launcher claim, D:L458199-458206 -- the review's F1, was: "the copy pushes none itself, D:L458217-458235"); settles: the rows through the repository's reader over the tracked `READERC.ZAR` (as PAR-84 read the launcher's), or capture NU6-3 |
| `REMOTE_LAUNCHER_MOUNT_READING` (built 2026-10-14, NU-6 P2; was the candidate `REMOTE_LAUNCHER_MOUNT_PLACEHOLDER`, *note only*, its offset unread) | viewer `heldItem.ts`, `remotePlayers.ts` | read: `character.rdr`'s gear `launcher` (model `NONAME`, `ofs` on `spinehi`: (0, -1.61, -1.5), turned (463.68, 190.57, 181.51) DEG, `READERC.ZAR` through `parseCharacterTable`, turned by `gearMatrix`) -- the gear the kit's fill pairs with the node (`FUN_0058b0f0` D:L447285-447295) and `FUN_0058b040` (D:L447235-447266) / `FUN_0058acc0` (D:L447128-447229) write into it; owed: capture NU6-4. Was: the launcher node `+0x3a8` under `spinehi` (research 317 §5 B1) holds the first launcher slot's model (D:L479872-479876); its local transform is not read; settles: the set-up's node read -- made as `launcher` (0x65c5b8) under `+0x310` and kept at `+0x3a8` (D:L419674-419676), its transform `FUN_0028ec30`'s -- or capture NU6-4 |
| `REMOTE_LAUNCHER_HAND_READING` (built 2026-10-14, NU-6 P3 with R1) | viewer `remotePlayers.ts` (`remoteLauncherInHand`) | `'the item, and through the still lower'`: a rocket launcher in the hand while the body's item is a launcher's and on through the still lower's clip to its end (`FUN_005a6d30` D:L462120-462126 re-parents it to the hand at the raise's push; `FUN_005a6b70` D:L462045-462092 re-parents nothing; `FUN_00582540` D:L443057-443071 -> `FUN_005a60d0(.., firearm, 4)` D:L461769-461820 puts it back under `spinehi` at the reversed clip's end); on the hand's held node at its origin (`HOLSTER_TRACK_READING`), the firearm stowed; the stick's moving lower (no body action) puts it back at the item's change, its own end mount unread; owed: capture NU6-4 |
| `REMOTE_LAUNCHER_ITEM_PLACEHOLDER` (*note only*; candidate, P3 and §4) | viewer `remotePlayers.ts` | which id `+0x66` carries for a raised rocket launcher (the launcher's, or its round's through the mode word: `FUN_005c6600` D:L479605-479640, `FUN_005c4600` D:L478557-478640, `FUN_005c4480` not read) and the carrier a round selects with two launcher-bearing items (D:L481470-481484); either way the copy raises (D:L461886, D:L462097-462130); settles: those read, or capture NU6-4 |
| `REMOTE_JOIN_KIT_PLACEHOLDER` (*note only*; candidate, J1; *inference*) | server `room.ts` `joinWire` (doc) | a joiner's copy from the chosen list, the taken weapon installed with no model instance (D:L162596-162601, D:L162373-162378, `FUN_005bc410` D:L473811-473870); the port sends the live kit; settles: capture NU6-5 |

`LAUNCHER_RAISE_NETWORK_LOG_READING` (`false`) stands as read; its drawing consequence is corrected by the ruling (§4)
and built as R1 (was: "is questioned in §4, for the controller"). `PICKUP_HAND_PLACEHOLDER` (re-filed as
`PICKUP_HAND_READING` by NU-5 H1, 2026-10-14) and research 323's candidates stand as research 323 files them.

**The captures that settle them** (a `HUMAN_TASKS.md` row when the build files them; two consoles, each side, the
second console's copy watched):

- **NU6-1, the models per side:** a SEAL and a Terrorist with different primaries and sidearms, each swapped once,
  seen from the other console -- the hand's and the stowed models (`REMOTE_FAMILY_MODEL`).
- **NU6-2, a remote swap each way:** standing, crouched, prone and running; the clip on the copy and the frame its
  pistol reaches the hand, against the owner's (`REMOTE_SWAP_BY_ITEM`).
- **NU6-3, a remote pick-up, each side:** a SEAL takes a Terrorist's rifle into his rifle slot while holding his pistol,
  and a Terrorist a SEAL's rifle while holding his rifle -- on the other console, the frame the taken model appears,
  where, and whether any clip plays on the taker (`REMOTE_PICKUP_REMOUNT`, `PICKUP_CLIP_NETWORK_LOG`). Extends research
  323's NU5-1.
- **NU6-4, a remote rocket launcher:** a player carrying a LAW, then raising and lowering it, seen from the other
  console -- the launcher on the back, the raise clip on the copy (`REMOTE_LAUNCHER_MOUNT`, `REMOTE_LAUNCHER_ITEM`,
  §4).
- **NU6-5, a late joiner:** a player takes a weapon, then a third console joins and watches him
  (`REMOTE_JOIN_KIT`, `REMOTE_KIT_APPLY`).
