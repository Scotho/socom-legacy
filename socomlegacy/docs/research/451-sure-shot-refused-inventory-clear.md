# 451 -- SURE SHOT: a refused inventory open clears X, Circle and Triangle (R1 with fire held re-presses the trigger)

- Date: 2026-11-21. SURE-SHOT-R1, item B of the hand-over `agent-mail/handoffs/stage2/HANDOFF-sure-shot-r1-2026-11-21.md`
  (redotcom-51, the owner's word in that seat); simulation track. Branch `agent/sure-shot-r1` from `agent/next`
  f6456f6572, worktree `wt-sure-shot-r1`, seat-bugs.
- Status: **reading, pending review.** The game's code is read from the retail decompilation
  (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`; never pasted), every line the hand-over cites
  re-read at the source in this seat. Item A of the hand-over (the capture legs, §5) is the proven level, not
  claimed: legs 1-2 are captured, **a capture, pending review** (§5); leg 3 is still to come. The player's report (Discord, 2026-11-21: on SURE SHOT, X
  held, tapping R1 fires the rifle again) is what this reading predicts; it is not a confidence level.
- Stands on research [344](344-controller-presets.md) (the four configs, the pad's map, `AIM_MODE_HELD_READING`),
  [211](211-the-weapon-swap-by-state.md) §10.1 (the trigger's edge), [212](212-the-r2-menu-drawn.md) and
  [230](230-gameplay-feel-parity-audit.md) (the pad's sampled states), and does not restate them.
- Code: `packages/viewer/src/inventoryMenu.ts` (`INVENTORY_REFUSAL_CLEAR_BUTTONS`, `INVENTORY_REFUSAL_CLEAR_SEEN`,
  `refusalClearLanes`, `INVENTORY_REFUSAL_CLEAR_UPDATES_READING`, `INVENTORY_REFUSAL_CLEAR_SECONDS`,
  `InventoryMenu.press` / `frame` / `clears` / `triggerFeed`); the walking trigger's feed, `main.ts`:1776-1781 and
  `matchMount.ts`:1391-1395 (§4). Tests:
  `packages/viewer/test/inventoryMenu.test.ts` (the research 451 block), `packages/viewer/test/controllerConfigs.test.ts`
  (the cleared buttons through each config's map).

## 1. The original

1. **The map.** `Goldeneye` (SURE SHOT, page 4): X `Fire`, R1 `Inventory`, L1 `AimMode`, Circle `Action` and `Jump`
   (research 344 §4; `tools/test/controllerPresetsDisc.test.ts` holds it to the disc). The other three configs share
   `Fire` on R1, `Inventory` on R2 and `Action` on X.
2. **The pad's slots.** `FUN_002c6670` (D:L167011-167083) names the configurable buttons; the hand-over read the names'
   order off the ELF (0x3f2c70..0x3f2cd0): 7 Circle, 8 Square, 9 X, 10 R1, 11 R2, 12 L1, 13 L2. Slot 6 is the byte the
   menu reads as Triangle (pad +7, D:L72661). A slot's state is the byte at pad + 1 + slot.
3. **The sampler** `FUN_002d9ff0` (D:L179128-179186): a button up goes 1 or 2 -> 3, 3 -> 0; a button down goes
   0 -> 1, 3 -> 1, 1 -> 2 (D:L179153-179168). State 1 is "first down".
4. **Held is state 2.** `FUN_002c60c0` (D:L166671-166684) answers whether a result's button is at state 2.
5. **The trigger.** The player's controller update `FUN_00594cf0` steps the edge at `ctrl+0x118` from
   `FUN_002c60c0(2, pad)` (`Fire`; D:L453543-453567): 0 -> 2 when held, 2 or 1 -> 1 held / 3 let go, 3 -> 2 when held
   again or 0. The port's table is `weaponRaise.ts` `nextEdge`.
6. **The open.** `FUN_00219c80` state 0 (D:L71615-71621) calls `FUN_0021c6f0` (D:L72800) only on an `Inventory` press
   (result 4 at state 1), the body found, alive (`+0xe1` bit 4) and `FUN_005a7980` 0 -- **a dead body never reaches the
   open** (D:L71617-71620).
7. **The refusals inside the open.** `FUN_0021c6f0` refuses, each time by `FUN_003419c0` (the denied sound) then
   `FUN_0021aaa0`: when the kit's gate `FUN_005a8cb0` answers 0 (D:L72829-72832); when `FUN_005c4fd0` answers 0
   (D:L72836-72839); and when the posture `+0x174` is 9 or `+0xeb8` is set (D:L72823-72827, refused at
   D:L72933-72935). With **no body**, the open's whole body is skipped (D:L72815; the no-body tests at D:L72817-72822 sit
   inside it and are dead branches): no denied sound, no clear. `FUN_005a8cb0` answers 0 while the trigger's edge is
   1, held (D:L463174-463181; the port's `SWAP_HELD_EDGE_READING`).
8. **The clear.** `FUN_0021aaa0` (D:L72000-72036), the menu's close, sets the controller's mode byte back to 0 and, for
   the local pad (`DAT_0044f108`, and only while the controller's `+0x114` is 0), writes state 0 into slots 9, 7 and 6
   -- X, Circle, Triangle -- with `FUN_002da160` (D:L72015-72017). `FUN_002da160` (D:L179191-179197) writes the state
   byte and the slot's tap marker (-3.0).
9. **So** a button still down at the write is first-down (1) at the sampler's next read, then held (2): under
   `Goldeneye` with X held, `Fire` reads not-held for at least one controller update, the edge goes 1 -> 3, and at
   state 2 again back to 2 (3 -> 2, or through 0 with the HUD first, §3), a press. One more shot (or burst) per refused R1. Under the other configs `Fire` is R1
   (slot 10), which nothing writes: R1 held and R2 pressed is refused and fires nothing more.

## 2. What the port does

- `InventoryMenu.press` splits the refusal: dead, `refused` and nothing more; alive with `canChange` false (the page's
  `kitChangeGate`, `FUN_005a8cb0`, and `FUN_005c4fd0` as modelled), `refused` and the clear.
- **The clear reaches the lanes through the active config.** `INVENTORY_REFUSAL_CLEAR_BUTTONS` is the three buttons;
  `refusalClearLanes()` maps them through `./gamepad` `activePadMap()` (`padButtonLanes`): Default, Reverse and
  Config4 `action`, `boost`, `stance`; Goldeneye `fire`, `action`, `jump`, `boost`, `stance` (`boost` is the fly
  camera's Circle row, assumed; the menu runs in the walk only, so it changes nothing). No config name appears in the
  fix. The lanes are the port's merged lanes; in no original config is a cleared lane held by a button the clear does
  not write (a unit test), so masking the lane is the buttons' clear exactly.
- **How long, in GAME frames.** `InventoryMenu.frame` reads each cleared lane still down as up from the page frame after
  the refusal's until the frames' `dt` reach `INVENTORY_REFUSAL_CLEAR_SECONDS` = `INVENTORY_REFUSAL_CLEAR_UPDATES_READING`
  (1) x `GAME_FRAME_DT`, then as it is: a new press for every reader of the lane's edge (the trigger, the action, the
  jump). A lane let go inside the window leaves it. The updates are game frames, not page frames: the capture's frames
  are the 30 Hz game frames, and the firearm steps its pad once a game frame on the same `dt` (`fireCore.ts`:1788-1802,
  `padStep` per `GAME_FRAME_DT`). Was (to 8b0e9b1b49): one PAGE frame up, which the firearm's step missed whenever no
  step fell in it -- the real `Fire` fed the class's `fire` lane, five refused taps, X held, fired 1 or 6 rounds by phase
  at 60 Hz ([1, 6, 1]), [1, 1, 1, 6, 1] at 120 Hz, [4, 1, 1, 1, 4, 3] at 144 Hz (`inventoryMenu.test.ts`, "the real
  firearm"); now 6 at every phase of 30, 60, 120 and 144 Hz. The span is whole page frames, so where a page frame does
  not divide a game frame it can hold a second game step (60 Hz: 3 page frames, 0.05 s); the class cannot see the
  firearm's step phase, so "exactly one step" is not reachable inside it -- the round count is unchanged by the second.
- **No expiry by time.** The pending clear is applied at the menu's next `frame` whatever the host's clock says (tested:
  a main-thread stall, the clock 3x the frame's real seconds, still clears). An expiry that compared the host's clock
  with the frame's `real` (0d3b220872's `INVENTORY_REFUSAL_CLEAR_LATE`) was reverted at its review: `real` is the rAF
  timestamp's delta and the clock `performance.now()` inside the callback, two time bases, so a stall of over half a
  frame (or `real` 0 after `frameTime.restart()`) dropped the clear and that R1 fired nothing -- the reported bug back.
  The case it aimed at is §4's START residue.
- **Triangle: no stance press at the shipped value.** The stance block reads Triangle's byte and pressure itself, not
  `FUN_002c60c0` (D:L453331-453334): it re-arms only when it reads the byte at 0. With the controller's update before the
  HUD's (the order `INVENTORY_REFUSAL_CLEAR_UPDATES_READING` = 1 takes), the refusal's own update has read the byte
  before the write and the sampler sets it to 1 before the block runs again: the block never sees the 0, so there is no
  new stance press, no cancel and no tap. The port therefore leaves Triangle's lanes out of the clear
  (`INVENTORY_REFUSAL_CLEAR_SEEN` = X, Circle; `refusalClearLanes`): the `stance` lane passes as it is. **If leg 1 shows
  the HUD first**, the value is 2 updates AND the stance re-press (the block sees the 0 on the refusal's own update):
  Triangle goes back into the clear with the change, and the window then starts at the refusal's own update. Tested:
  `inventoryMenu.test.ts` (Triangle held, nothing moves; the constant pinned at 1 beside it) and
  `controllerConfigs.test.ts` (no config's cleared lanes hold `stance`).
- **The tap marker** (-3.0, `FUN_002da160`): `./fireModeInput` models the marker for `FireMode`'s button only, and none
  of slots 9, 7, 6 is `FireMode`'s in any config (L3 or R3, or SELECT with the fire-rate swap). Nothing to carry.
- **Touch** (a browser adaptation, FI.R3: a touch button means what the pad's button means): the touch layer's buttons
  ride the same merged lanes the active map gives the pad, so a touch button on a cleared lane (SURE SHOT's FIRE) held at
  a refused open reads up and down again with the pad's. The development keyboard's keys ride the same lanes and are
  cleared with them; the keyboard is out of scope (OT.R29), and its own `I` key's refused open clears as R2's would.
- **The Xbox page.** `InventoryMenu` is shared with `xboxPrototype/walkingMenus.ts` (its `inventory.frame`), whose pad
  reads `padInput` through the same active map (`xboxPrototype/walkingRuntime.ts`) and whose `canChange` is its own
  `kitChangeGate`; the fix reaches it through the class with no code in the fork's files, and that page behaves the same.

## 3. Readings and placeholders

| Name | What it stands for | Status |
|---|---|---|
| INVENTORY_REFUSAL_CLEAR_UPDATES_READING | 1: the GAME frames (`GAME_FRAME_DT`; held as `INVENTORY_REFUSAL_CLEAR_SECONDS` of the pages' `dt`) after the refusal's own for which a cleared lane still down reads up. The sampler's next read is state 1, not held for `FUN_002c60c0` (D:L166671-166684); the refusal's own update keeps what it sampled, which takes the controller's update (`FUN_00594cf0`) as running before the HUD's in a frame -- not read; the HUD's first would make it 2, counted from the refusal's own. Either way one press: the controller first, the edge goes 1 -> 3 -> 2; the HUD first, 1 -> 3 -> 0 -> 2 (D:L453546-453550: at 3 the edge goes to 0 while not held); the shot's frame moves. The stance follows the order: at 1 no stance press (§2, Triangle); at 2 the stance block's re-press too | in code (`packages/viewer/src/inventoryMenu.ts`); **a capture, pending review** (§5, legs 1-2) agrees with 1: slot 9 2 -> 1 -> 2, never 0 in a sampled frame, and the round 2 frames after R1's first-down; the name stays `*_READING` until the capture's review |
| AIM_MODE_HELD_READING | (research 344 §8, not new) the port's held lane is true at the first sample, one before the original's state 2. Its consequence here: the clear's up update(s) are modelled by the class, not by the lane; and a reader of the lane's rise (the action, the jump: the original's state 1 at the sampler's next read) gets the new press one update later than the original would, at the lane's return | note only; research 344's row |

## 4. Left out, named

- **The live pages' trigger now reads the game's lane, on the clear's reach (fixed; was the blocking half).** Until
  this fix the test room and the match page handed the firearm its trigger from the merged lanes before
  `InventoryMenu.frame` ran, so the clear's `fire` reached nothing that fires there; only the Xbox page fed the firearm
  the class's output (`xboxPrototype/walkingRuntime.ts`:410-412 -> `combatInput.ts`:63). Now both pages compute the
  clear's **reach** -- walking, no menu, the walk unlocked and alive, no turret held, the mouse not captured, no
  throwable or launcher up (`main.ts`:1777-1778, `matchMount.ts`:1391-1392) -- and call `InventoryMenu.triggerFeed` once
  a page frame, before `inventory.frame` (`main.ts`:1779, `matchMount.ts`:1393). On the reach the trigger is fed the
  merged lane less the clear, its edge against what the last call handed (`triggerFeed`: the merged lane, but where that
  call fed the clear's up; `main.ts`:1780, `matchMount.ts`:1395); off it the page runs **the old line, unchanged**
  (`main.ts`:1781, `matchMount.ts`:1394), and `triggerFeed`'s own answer there is the merged lane's edge
  exactly (`inventoryMenu.test.ts`, "the seam"). A `close` (the loading hold's flush, a screen's opening, a spawn --
  each lets the trigger go itself) ends a clear's hold on the feed ("a close inside the clear"). **No page frame changes
  order:** the trigger is still read before `inventory.frame`, because `clears` answers before `frame` what `frame` will
  hand the game (`inventoryMenu.test.ts` asserts the two equal on every frame on the reach). Moving the trigger behind
  `frame` would have changed one frame -- a fire edge on the same page frame as the menu's gate read (R2's open, or a
  confirm): the trigger can move the gate at once (a placed charge's pull sets the throw under way, `grenadeCore.ts`
  `pull` -> `startPlacing`, `matchThrow.ts`:808 `busy`), so the gate would have read the frame before the press. Idle
  (no clear pending), the feed is the merged lane exactly, so the edges are the same press for press:
  `inventoryMenu.test.ts` ("research 451 §4") runs the old and the new wiring on the class and the real `Fire` for every
  config, single, burst and auto, a hold and taps, at 30, 60 and 144 Hz, and finds the trigger's calls and the rounds
  equal frame for frame; a plain press's first-down on its own page frame and its round one game frame later
  (`fire.test.ts`:2514), both wirings; under SURE SHOT one more press and round per refused R1. The page text is pinned
  in the same file (a unit test on the class and a source pin; no mount-level harness reaches the pages' frames).
- **Mounted (a turret): LEFT OUT -- the clear does not reach the turret; unread.** Whether the original's turret sees
  the clear is not read (the clear is the pad's, `FUN_0021aaa0` D:L72015-72017, so a reader of the slot could; nor is it
  read whether the original refuses the open while mounted). Under the parity rule nothing is invented, so the mounted
  trigger is fed exactly as before this fix: a held turret (`acts.turrets.mounted()` set, `turretPage.ts`:738) and its
  mount's and release's lock (`turretPage.ts`:625, `walk.ts`:1090) put the page off the reach, where it runs the old
  line; the turret is handed the trigger only while it is held (`matchActions.ts`:601), so every call it receives is the
  old wiring's. Test: "MOUNTED (a turret ...)" and "off the reach (...)", with the guard's text pinned ("main.ts: the
  trigger fed by triggerFeed ...", "matchMount.ts: the same reach and feed ..."). The evidence that would settle it: a
  capture of the original, SURE SHOT, mounted on a manual turret on single, X held, R1 tapped -- one round, or one a tap.
  One residue of the reach, by construction: a clear's let-go handed on the reach, the reach then turning off inside the
  same clear (a mount, a lock, a capture, a throwable or the launcher taken up within one game frame of the refused R1)
  and staying off past the clear's end, is not followed by its re-press: the trigger stays let go with X held until the
  lane's own next press, as the old line reads it. Back on before the clear ends, the re-press comes as if it had never
  left. Test: "the reach toggled inside a clear" (144 Hz, the trigger's level every frame: on -> off -> on, on -> off ->
  on -> off -> on, off -> on, off throughout, the residue and its recovery by the next X press on or off the reach, and
  a seeded run: never held with X up, held after every X press outside a clear).
- **A throwable or the launcher in the hands: LEFT OUT -- the clear does not reach a throw or a rocket; unread.** The
  firearm's `trigger` hands every edge to the hands first (`matchFirearm.ts`:910 -> `matchThrow.ts`:830-858): a
  throwable up, a let-go throws the pin pulled and a press pulls the next (`matchThrow.ts`:854-858); the launcher up, a
  press is a rocket (:841-851). Whether the original's clear (the pad's slot write, `FUN_0021aaa0` D:L72015-72017)
  reaches a thrown grenade or a second rocket pull is not read -- nor whether the original refuses the open with either
  up -- so nothing is invented: a throwable equipped (`grenade.equipped()`, `grenadeCore.ts`:1137) or the launcher up
  (`rocket.up()`, `rocket.ts`:212), the very predicates the hands test (`matchThrow.ts`:840, :841, :854), puts the page
  off the reach (`main.ts`:1778, `matchMount.ts`:1392), where it runs the old line and the hands get the old wiring's
  calls. Test: "SURE SHOT, a grenade in the hands ..." and "... a launcher in the hands ..." (30 / 60 / 144 Hz: the
  calls, the throws and the rockets as before; the firearm fires nothing), with the guard's text pinned in the two
  source pins. The evidence that would settle it: a capture of the original, SURE SHOT, a grenade's pin held on X (and
  the launcher up, X held), R1 tapped -- a throw, or a rocket, a tap or none. Not guarded, by what the pages can read:
  the firearm's own return after the launcher is lowered (`matchThrow.ts`:853, `firearmReadyAt`, not exposed to the
  pages), where the hands take a press and owe it to the firearm (`matchFirearm.ts`:918). There the clear's let-go ends
  what was owed (:904) and its press owes it again with `owedPulls` 0, where a hold carried over the slot change owed
  the firearm's own pulls (`suspendTrigger`, :897-899): at the firearm's return (:1529-1531) `fire.pull(0)` replaces
  `fire.pull(1)` (`fireCore.ts`:951-954). **Shipped so, named (the controller's ruling, 2026-11-22): under SURE SHOT
  only, with X physically held from the launcher's lower (`matchThrow.ts`:570) through `firearmReadyAt`, a refused R1
  in that window makes the returning gun fire ONE round on single, or a full burst on burst, that the code before this
  note refused.** It follows this note's own model of the clear (a refused open with X held is a new press); whether
  the original does it after a launcher lower was UNREAD (now traced, below) -- the evidence asked for: a capture of r0004,
  SURE SHOT, the launcher lowered with X held, R1 in that window. If the original refuses there, the guard is a page
  predicate on `firearmReadyAt` (outside this note's files, for a later patch). It cannot fire with X up.
  **Now traced (BUG-SURESHOT-READY, LATER 1354; 2026-11-24): a trace of the original running, unscored -- a capture,
  pending review.** The record `D:/s2u-records/SURESHOT-LAW-PC3/SURESHOT-LAW-PC3.zip` (sha256
  5cb78115c1b858a845915fd5e1d0c93a70534cfde2fa8d146212e60ff9c3f16b; r0004, LAN Vigilance, SEAL M4A1 + AT-4, the rifle on
  single; `runs/*.csv`, a row a game frame; not in git). M0 is the first frame the hand word `actor+0xe04` reads 0, the
  lower's confirm on the pad 1-2 frames before it; X is held from M0. Re-read at the frames in this seat (the record's
  `SUMMARY.md` counts magazine drops only):
  - **(i) X held, no R1** (ctl-xheld-3, -4): the rifle's raise `+0xf74` 2 -> 17 -> 1 by M0+5..7, no round before it,
    ONE round at M0+42 / M0+43. The trace shows the wait, not its cause. The port's model fitted to it (a reading, not
    what the trace shows): the wait is the lower's clip and no second lockout -- `launcherLowerSeconds(0)` from the
    confirm ends at M0+41 at the game frame, where the port's owed trigger fires its one round. **Supported.**
  - **(iii) R1 at M0+5 .. +30** (r1-5, r1-6, r1-10, r1-20, r1-30; 12 trials): ONE round at M0+41 .. +44, no extra -- the
    port's: the clear's let-go ends what was owed, its press is owed again, one round at the lower's end. **Supported.**
  - **(iv) R1 after the held round** (r1-45-1, r1-60-1..3): the held round and ONE more, counted from R1's first frame
    down on the pad word: +3 in 3 of 4 (4 of 5 with r1-45-2), +4 in r1-60-2 (the summary's "tap+4": the tap is
    logged a frame before the pad shows it) -- the port's N+3 at
    a 30 Hz page (§5's named one-frame residue stands; the pad word is not slot 9's sampled state). **Supported.**
  - **(v) R1 with X not held** (r1noX-6-1..3): no round; `+0xf74` stays 2. The port's: none. **Supported.**
  - **(ii) R1 at M0+1 .. +4: OPEN.** The summary reads "0 rounds, 12/12, the early R1 cancels the held round". The
    frames do not carry it -- a harness artefact: (a) in all 12, and in ctl-xheld-2 (no tap, also 0), the kit's fire
    step ran at M0+41..44 as in every other trial -- `kit+1` bit 2 set at the press and cleared there (cleared only after the
    fire call, `FUN_005c0fd0` D:L476620-476641), `+0xe58` up by one -- only the magazine `+0x7b4` did not drop; (b) the
    13 are one consecutive block of the run, straight after ctl-xheld-1 emptied the magazine on automatic and the
    harness wrote it 0 -> 30 (`run.log`), each start logged `30 -> 30`; every X-held trial after the block fires (19 of
    19: r1-6 x3, r1-10 x3, ctl x2, r1-60 x3, r1-5 x2, r1-20 x2, r1-30 x2, r1-45 x2), and no +1..+4 trial was run
    outside it; (c) in 6 of the 12 (r1-1-1..3, r1-2-1, r1-2-3, r1-3-2)
    the pad word shows no R1 press after M0 at all -- the tap ran into the confirm's R1, still held. What the written
    magazine's state is, is unread. Also seen (the re-read's): `+0xe58` climbs 31 .. 43 through the block, past the
    magazine's 30, then reads 0 at r1-6-1, where the rounds resume, after a longer gap between trials (about 625 frames
    against about 485) whose cause is unrecorded. Nothing is built on it: the port fires its one round there, as in
    (iii). **What
    settles it:** the +1..+4 trials run again interleaved with the later ones, the magazine never emptied and written
    (or a reload played out first), the confirm's R1 let go before the tap so the tap is its own pad edge, and the
    inventory's state and slot 9's sampled state logged beside the pad word.
  Test (unit; the real `mountFirearm`, `Fire` and `InventoryMenu` under `Goldeneye`, the hands stood in by
  `matchThrow.ts`'s two `firearmReadyAt` lines, their text pinned): `packages/viewer/test/sureShotReady.test.ts` -- (i),
  (iii), (iv), (v); (ii) is not pinned. No source changed.

- **Any skipped `frame` on the update right after a refused open** (a browser residue, no original: the PS2 runs every
  update). The pages skip `InventoryMenu.frame` while the body is not walking or another menu has the pad (START, WEAPON
  EXCHANGE, chat), so if one of those holds on the update right after the refusal, the pending clear waits and is applied at the inventory's next `frame` with the button still held -- one
  late extra press. A clean fix is a one-line drop of the pending clear at the three call sites that skip `frame`
  (`main.ts`:1789-1790, `matchMount.ts`:1396-1397, `xboxPrototype/walkingMenus.ts`:126), outside this task's claim and the frozen
  Xbox fork: for the next patch. A time-based expiry inside the class is not one (§2, "No expiry by time").

- **The open's other refusals.** `FUN_005c4fd0` 0 (D:L72836-72839) is reached only as far as the page's `canChange`
  stands in for it; the posture `+0x174` == 9 and `+0xeb8` set (D:L72823-72827, refused at D:L72933-72935) the port does
  not model (`inventoryMenu.ts` header): their clear is not carried.
- **The clear at every close.** `FUN_0021aaa0` runs at each close of the menu too, and the START menu's close writes
  X, Square, Triangle, Circle (D:L62166-62169); the port holds a button the menu took until it is let go
  (`INVENTORY_LANES`). The hand-over's item C, its legs 4-6; not changed here. **A known departure, not this note's
  fix (LATER 1340):** PC 4's capture (the same record, pending review) shows the INVENTORY's close re-pressing a held
  button -- under PRECISION SHOOTER, Triangle held through the close is a new first-down 6 frames after it, and the SEAL
  goes prone (leg 4) -- the same `FUN_0021aaa0` write; the port's holding a button away at the inventory's close is
  therefore NOT the original's. The START menu's close did not re-press its closing X under SURE SHOT (leg 6). Nothing
  here or in its tests is a claim that the menus rightly hold buttons away at a close; this note's fix is the refused
  open only.
- **The controller's `+0x114`** guard on the clear (D:L72011-72013) is supported, not left out: the player's controller
  update `FUN_00594cf0` makes the same test on its own pad -- `DAT_0044f108` only while `+0x114` is 0, else none -- at
  D:L453094-453096 and D:L453679-453681. A controller with `+0x114` set reads no pad at all, so the clear's guard only
  spares a pad no such controller reads; for the local player's pad-driven controller the clear always runs, and the
  port's "the local player always clears" follows.
- **The denied sound** `FUN_003419c0` is not wired (the menu is silent, as before).

## 5. The evidence that would settle it (the hand-over's item A; PCSX2 alone, ships nothing)

1. SURE SHOT, a rifle on single shot: hold X, press R1 five times, spaced. **Predicted: 6 shots**, each new one a fixed
   number of frames after its R1 press -- that number fixes `INVENTORY_REFUSAL_CLEAR_UPDATES_READING`.
2. The same on burst: one burst per R1 press.
3. The control, PRECISION SHOOTER: hold R1, press R2 five times. **Predicted: 1 shot.**

If leg 1 or 3 fails, the sampler is misread and this fix is wrong (the hand-over: B does not merge on legs 1-3 failing).

**Legs 1-2 captured: a capture, pending review** (not proven until reviewed). The original, PCSX2, r0004 by the boot
footer, PC 4, one PINE stamp of the pad per frame; the records sit on the hub at `D:/s2u-records/SURESHOT-PC4/` (not in
git). Leg 1: SURE SHOT, the M4A1 SD on single, X held, R1 tapped five times: **6 rounds**. All five R1 presses alike: R1
first-down at frame N; X's slot 9 a new first-down (state 1) at N+1, and never 0 in a sampled frame (2 -> 1 -> 2); the
round at N+2. The R1 -> round gap is 2 frames, fixed. Leg 2, burst: one 3-round burst per R1 press, its first round at
N+2. This is what `INVENTORY_REFUSAL_CLEAR_UPDATES_READING` = 1 with the controller's update first predicts (§3): one
update up after the refusal's own, the edge 1 -> 3 -> 2 at N+2; the HUD first would read slot 9 at 0 in a sampled frame
and move the round to N+3. The port: `inventoryMenu.test.ts` ("the trigger's new press (edge 2) is at N+2, each of five")
finds `nextEdge`'s new press at N+2 for each of five R1 presses; that test sees the game's lanes only, not the round,
which is the firearm's (`./fire`). The constant keeps its `*_READING` name until the capture's review. **Leg 3** (the
PRECISION SHOOTER control) is still to come.

**The round is one frame late in the port -- a reading, by source, NOT measured in the port.** The firearm keeps its
own pad machine on the `fire` lane (`fireCore.ts`:1802 `padStep`; `padButton.ts`:32, :37): a lane that goes down at
update M reads state 1 at M and state 2 at M+1, and the round leaves only at state 2 (`fireCore.ts`:1817, `pullRound`).
For a plain press that is the original's own wait (`fire.test.ts`:2514). For the clear it is not: the original's X goes
2 -> 1 -> 2 and never reads 0, so its state 1 is at N+1 and the round at N+2 (the capture above); the port's boolean
lane cannot say "state 1 while held", reads up at N+1 and down at N+2, so the firearm's state 1 is at N+2 and **the
round at N+3: one GAME frame (~33 ms) late** -- every tap at a 30 Hz page; at 60-144 Hz the round is at N+2 or N+3 by
the page's phase against the kit step (N+3 where the step that reads R1 falls in R1's own page frame; measured in the
port's unit test with the real `Fire`, "the real firearm": 60 Hz all N+3, 120 and 144 Hz N+2 or N+3). The count is right
(six rounds for five taps; one burst a tap).
Shipped so by the controller's ruling (2026-11-21): today R1 does nothing, so this is a strict step toward the original.
The fix is for the next patch (a LATER row): the firearm's pad, or a "state 1 while held" lane; `fireCore.ts` and
`padButton.ts` are hot and serve every press. Its red test first: beside `fire.test.ts`:2514, a clear's re-press fires
on its first read.

**LATER 1345, read 2026-11-24: no lane can carry it; the faithful route is named for v0.4.33 (the controller's ruling:
no fix in v0.4.32).** Measured in the port's unit tests with the real `Fire` (`inventoryMenu.test.ts`, the three "GAP
(LATER 1345)" expected failures, registered in `tools/test/itFailsRegister.test.ts`): (a) the round at N+3 on every tap
at 30 Hz and N+2 or N+3 by phase above it; (b) the firearm's held answer reads false for 2 or 3 game updates per
refused R1 against the original's 1; (c) **the 60 Hz span** (the side finding of LATER 1412's pin review):
`GAME_FRAME_DT` exceeds two 1/60 s page frames, so the clear, counted in seconds (`INVENTORY_REFUSAL_CLEAR_SECONDS`),
holds `fire` up for three page frames, which in some phases hold two of the firearm's steps (144 Hz too) -- at 10 R1
taps a second, single, FireWait 0.12, the rounds over 3 s are [15, 0, 15, 0, 15, 1] by phase against 15 for X
re-tapped at its best phase. Why the class cannot fix either: the firearm steps its own pad from a boolean
(`fireCore.ts`:1802), and an up then a down passes through state 1, so the held answer's true, false, true of the
original's 2 -> 1 -> 2 is out of a lane's reach; and the class cannot see the firearm's step phase (`gameTime`,
private; `triggerFeed` is handed no `dt`, `frame` is skipped in a menu or off the walk while the firearm steps on), so
a span counted in game steps inside the class would drift from the firearm's on the pages.

The route, the original's own mechanism (`FUN_0021aaa0` D:L72015-72017 writes the slot to 0 with the button down,
`FUN_002da160` D:L179191-179197; the sampler does the rest, `FUN_002d9ff0` D:L179153-179168; all re-read at the
decompilation 2026-11-24, whose build, r0001 or r0004, was not established in that seat): a pad clear in `fireCore.ts`
-- a method beside `release` (about :1050) that marks it pending, applied (`pad` = 0, the trigger still held) after the
step's gate (:1817), so the step that reads R1 keeps what it sampled, and reset where the pad is (:1428, :1651,
:1868); a pass-through in `matchFirearm.ts` beside `trigger` (:972-992); `main.ts`'s and
`matchMount.ts`'s `triggerFeed` call on the reach (at this tree `main.ts`:1807 and `matchMount.ts`:1533; the older
:1777-1781 / :1391-1395 cited in §1 and §6 have moved) calling it at the refusal; `triggerFeed` no longer withholding `fire` there.
It needs no step phase. The class's seconds span stays for `action` and `jump`; the frozen Xbox fork keeps the lane's
clear and this residue. **A prototype** (a scratch copy of the test file that wrote the firearm's `pad` to 0 after
the step that reads R1; not committed) turned all 9 cases green. On the same prototype LATER 1412's pin
(`origin/agent/later-1412-pin`) went red in 11 cases, on two assertions: "never out-fires X re-tapped at the same
rate" (a cleared X costs one update not held, a real X re-tap two; that harness holds the gate closed at every tap,
where the original's kit gate refuses only while the trigger's edge is 1, §1.7 -- rapid R1 taps of the original are
unmeasured) and the burst's rounds a pull (its counter opens a pull on a page-level edge, which the pad write does
not make; burst lengths not checked). The pin's baseline is to be settled with the route.

## 6. The walking trigger's feed: the blast radius (§4's fix)

**The invariants everything below stands on.** (1) **Off the reach** (`main.ts`:1777-1778, `matchMount.ts`:1391-1392: a
menu, off the walk, the walk locked or dead, a turret held, the mouse captured, a throwable or the launcher up) the page
runs the old line (`main.ts`:1781, `matchMount.ts`:1394), unchanged: every call made there is the old wiring's ("off the reach (...)": seeded scripts with
the reach off at random runs, a clear running inside them, 30 / 60 / 144 Hz, single / burst / auto -- the calls equal
on every off frame). (2) **On the reach** the feed differs from the old one only on the page frames where
`InventoryMenu.clears('fire', input)` is true and the frame after one. Reason by source: `frame` changes `fire` only
through the clear (`inventoryMenu.ts` `frame`: the held mask is `INVENTORY_LANES`, :76, which holds no `fire`; the
paired reload adds `reload` only), and `triggerFeed` departs from the merged lane's edge only where its last call fed
the clear's up. The clear holds `fire` only where X or Circle is `Fire` -- SURE SHOT alone (`refusalClearLanes`; §2) --
and only after a refusal with the body alive (`press`, :647). Test (unit, the class and the real `Fire`):
`inventoryMenu.test.ts`, "the blast radius" -- seeded random pads (trigger, R2 / R1, Cross, Up, Triangle), gate open
and closed, all four configs, single / burst / auto, 30 / 60 / 144 Hz: under Default (PRECISION SHOOTER), Reverse,
Config4, and SURE SHOT with the gate open, no clear of fire and the trigger's calls and rounds equal the old wiring on
every frame; SURE SHOT with the gate closed, the calls and `Fire.triggerHeld` equal on every frame outside the clear and
the one after it.

Every reader, and how each is closed (SHOWN: a test, `inventoryMenu.test.ts` unless named; UNCHANGED BY CONSTRUCTION:
the change does not reach it, file:line):

| Reader | Closed | On a clear's frames |
|---|---|---|
| The fire: single, burst, auto | SHOWN: "the blast radius", "the inventory closed and idle" (rounds frame for frame) | one let-go and one new press per refused R1 (the fix) |
| A plain press's latency | SHOWN: "a plain press" (first-down on its own page frame, its round one game frame later, both wirings) | -- |
| ADS / zoom | UNCHANGED BY CONSTRUCTION: it reads its own lanes (`zoom`, `zoomOut`; `playerLanes` on `game`, `main.ts`:1805), never the trigger feed; not edited | none |
| A throwable or a charge (a pin held on X) | UNCHANGED BY CONSTRUCTION, and SHOWN: `grenade.equipped()` (`grenadeCore.ts`:1137), the hands' own test (`matchThrow.ts`:854), puts the page off the reach (`main.ts`:1778, `matchMount.ts`:1392) and the old line runs; the hands take every edge first (`matchFirearm.ts`:910). Test: "SURE SHOT, a grenade in the hands ..." (calls and throws as before), the two source pins. LEFT OUT, unread: whether the original's clear reaches a held pin (§4) | none: the old feed |
| The launcher | UNCHANGED BY CONSTRUCTION, and SHOWN: `rocket.up()` (`rocket.ts`:212), the hands' own test (`matchThrow.ts`:841), puts the page off the reach (`main.ts`:1778, `matchMount.ts`:1392); the old line runs. Test: "SURE SHOT, a launcher in the hands ..." (calls and rockets as before), the two source pins. LEFT OUT, unread (§4). Open: the firearm's return after the lower (`matchThrow.ts`:853), not readable by the pages (§4) | none: the old feed |
| The raise (`weaponRaise` edge), the dry click, reload-on-fire | SHOWN: all inside `Fire` / `Play`, driven only by `fire.pull` / `release` and `fire.padHeldRead` (`matchFirearm.ts`:959), whose calls "the blast radius" holds equal | a press, as the original's X re-press (§1.9) |
| The mounted gun (a turret) | UNCHANGED BY CONSTRUCTION, and SHOWN: held (`acts.turrets.mounted()`, `turretPage.ts`:738) or in its mount's or release's lock (`turretPage.ts`:625), the page is off the reach (`main.ts`:1777-1778, `matchMount.ts`:1391-1392) and runs the old line; the turret takes calls only while held (`matchActions.ts`:601). Tests: "MOUNTED (a turret ...)", "off the reach (...)", the two source pins. LEFT OUT, unread: whether the original's turret sees the clear (§4) | none: the old feed |
| START, ARMORY, WEAPON EXCHANGE, chat | UNCHANGED BY CONSTRUCTION: all in `menu` (`main.ts`:1747; `matchMount.ts`:1375), off the reach: the old line and the menu's let-go, untouched (`matchLanes.test.ts`:160, `matchMount.test.ts`:2603 pin them) | -- |
| The inventory open / held / closing | SHOWN: walking, not `menu`: on the reach, but `frame` never masks `fire` (`INVENTORY_LANES`), so equal; "the blast radius" opens and confirms it (gate open, Cross, Up, Triangle) | a clear started at a refusal can still run if R2 opens it inside its one game frame: the clear's own rule |
| A close inside a clear (the loading hold's flush, `main.ts`:1712; a screen's opening, :717; a spawn) | SHOWN: "a close inside the clear": the next edge is the merged lane's, as the old line reads it; each such close lets the trigger go itself (`main.ts`:1713, :717; `matchMount.ts`:1327) | the clear ends |
| Touch fire (the merged lane) | SHOWN: the same lane as the pad's (`mergeInput`, `main.ts`:1727); the tests feed the merged lane | cleared with the pad's (§2, Touch; FI.R3) |
| The development keyboard | SHOWN: the same lanes; its `I` key's refused open (`main.ts`:802 `inventory.key`) clears as R1's would | as R1 |
| The mouse | UNCHANGED BY CONSTRUCTION, and SHOWN: its trigger goes down only while captured (`camera.ts`:1196-1197) and is let go when the capture ends (`camera.ts`:1322-1324) or the input is suspended (:991); captured, the page is off the reach (`!fly.isLocked()`, `main.ts`:1777, `matchMount.ts`:1391) and runs the old line. So the clear never lets go of a mouse-held trigger, and an X let go inside the clear lets the trigger go on the same frame as before. Tests: "the mouse held with X (captured) ... X let go inside the clear" (calls, level and rounds frame for frame) and "the mouse, random" (every frame the mouse holds: the old calls). A browser adaptation's boundary: with the mouse captured the SURE SHOT re-press is off (the old feed) | none while captured |
| Spectate | UNCHANGED BY CONSTRUCTION: a spectator's walk is locked -- from the connect until a spawn (`net/client.ts`:423; a spectator gets none), demoted (:950), a new walk (:474, `!alive`) -- and a locked walk is off the reach; a watcher (the map viewer's) has `playOn` false, so `walking` false (`main.ts`:1776); a dead body refuses the open with no clear (`inventoryMenu.ts`:647). SHOWN: "a spectator or the dead" (off the reach, alive false: no clear, the old calls), and the source pins of `!walk.isLocked() && !walk.isDead()` | -- |
| Replay viewer | UNCHANGED BY CONSTRUCTION: the replay viewer frames `main.ts` (MU-11, `REPLAY_WORLD`), so its `padFrame` runs, but with `playOn` false (`main.ts`:298), so `walking` false (:1776): off the reach, and the old line itself needs `playOn` -- no lane trigger at all. Its steer lane (`main.ts`:1756) writes no `fire` and no `inventory` (`modern/replays/worldSteer.ts`:49-61): SHOWN, "the replay viewer". A recording never reaches the pad's lanes; were play switched on there, a clear would need the live pad's own refused R1, as on any test-room page. `?devmode&replay=` (`main.ts`:2486) is a watcher's NetPage on the same rule | -- |
| The network's trigger | SHOWN: `net?.trigger` / `net?.frame` read `fire.triggerHeld() || acts.triggerHeld()` (`main.ts`:2206, :2215; `matchMount.ts`:1439, :1448); "the blast radius" holds `triggerHeld` equal off the clear | the re-press goes on the wire, as the original's trigger bit would |
| The Xbox page | UNCHANGED BY CONSTRUCTION: `xboxPrototype/walkingMenus.ts` not edited (`git diff`); it already fed the class's output | -- |

One residue of the reach, by construction (§4): a clear's let-go handed on the reach, the reach then turning off
inside the same clear (a mount, a lock, a capture within one game frame of the refused R1), is not followed by its
re-press -- the trigger stays let go until the lane's own next press. Every call on the off frames is still the old
line's ("off the reach (...)").

Left to the box's browser run: a rendered firefight on SURE SHOT and PRECISION SHOOTER (the spec the box names).
