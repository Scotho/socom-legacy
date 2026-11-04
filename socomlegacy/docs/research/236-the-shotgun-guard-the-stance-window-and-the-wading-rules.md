# 236 -- The shotgun guard, the stance window and the wading rules (web sprint 30, PF-37)

- Date: 2026-10-06 (web sprint 30). PF-37, three small rows under one task (ruling PF.R57; PF.R58: it lands without
  the parked PF-23): the shotgun's hit guard kept on the victim and reset once a victim update (§1); the server's
  stance-change tolerance per transition, 37 / 51 / 57 ticks (§2); the rocket launcher's take-up refused wading deeper
  than 8.5, and the water's stance fallbacks already built given their citations (§3).
- Status: **reading, pending review.** Every value below is a read of the decompilation (`D:L<n>` of
  `socom2_game.elf.decomp.c` r0001), re-read at the decomp by this task's implementer, or disc data through a read
  formula; nothing here is a capture. Research 194 and 181 grade these STRONG or source-plus-retail-instruction; under
  AGENTS.md a source read is a reading until reviewed (research 206). 194 itself is "reading, pending review -- not
  adopted" (its L6).
- Sources: research [194](194-w2-a-combat-actor-gaps.md) s7 A09 (the guard's reset; its L217: "A09's update-order gate
  precedes any shotgun guard policy change" -- ruling PF.R57 builds the shape, the window stays a reading);
  [94](94-the-arsenal.md) L1201-1202, L1534 (`SHOTGUN_HIT_GUARD_RESET_READING`); [179](179-c1-match-server.md)
  `STANCE_CHANGE_TICKS_PLACEHOLDER` (L695-710); [181](181-c3-combat-hud-effects.md) s2.6 (`LAUNCHER_BODY_READING`) and
  s8 (the C2 lead); [86](86-traversal.md) s5.2 (the water's stance fallbacks; issue #22); [219](219-the-bullet-as-built.md)
  s3 (PF-24's `bulletHit`); [198](198-wave-2-review-and-implementation-plan.md) s4.3 step 8, s4.4. Rulings PF.R57,
  PF.R58 (the controller, 2026-10-06).
- Code: `packages/match/src/shotgunGuard.ts` (new: `guarded`, `SHOTGUN_GUARD_TICKS`, `SHOTGUN_GUARD_WINDOW_READING`,
  `SHOTGUN_GUARD_SCOPE_READING`); `packages/match/src/room.ts` (`Player.qHitAt`, `bulletHit`'s volley branch, `spawn`'s
  clear, `raiseLauncher`'s depth); `packages/viewer/src/net/shotCone.ts` (`stanceChangeTicks`,
  `STANCE_REVERSE_TICKS_READING`; `STANCE_CHANGE_TICKS_PLACEHOLDER` retired); `packages/viewer/src/equipment.ts`
  (`LAUNCHER_BODY_READING` re-valued, `SlotContext.wadingDepth`, `slotSelectable`); `packages/viewer/src/rocket.ts`
  (`RocketSource.wadingDepth`, `RocketLauncher.wadingDepth`, `selectSlot`'s gate); `packages/viewer/src/traversal.ts`
  (the water constants' citations, no code).
- Tests: `packages/match/test/roomShotgunGuard.test.ts` (new; not `roomShotgun.test.ts`, PF-23's),
  `packages/viewer/test/shotCone.test.ts`, `packages/viewer/test/equipment.test.ts`,
  `packages/match/test/roomEquipment.test.ts`, `packages/viewer/test/equipmentPage.test.ts`;
  `packages/viewer/test/traversal.test.ts` unchanged (its water tests
  hold the built fallbacks).

## 0. The answers

1. **The guard is the victim's and it resets every victim update.** `FUN_005abbc0` skips a class-'Q' hit while the
   victim's remembered projectile is also 'Q'; `CZSealBody`'s update clears the memory. The port keeps the victim's
   tick of its last landed volley (`qHitAt`) and refuses a second volley inside one game frame (`SHOTGUN_GUARD_TICKS`
   2 at 60 Hz) as a `'guard'` miss; a volley two ticks later lands; the shooter's once-a-victim set (M4) stays.
2. **The stance window is the transition's clip:** 37 ticks stand<->crouch, 51 crouch<->prone, 57 stand<->prone, in
   place of the flat 60. Getting up is the same clip reversed, the same length. No honest round is refused at a
   transition's tail (the honest-rounds test), so the per-transition bounds stand; the fallback to one bound of 57 was
   not needed.
3. **The rocket launcher is not taken up wading deeper than 8.5 units**, page and room (`FUN_005857e0`, the crouch
   entry's test). The water's stance fallbacks (2 / 8.5 / 1.5) were built (research 86 s5.2); they now cite their lines.

## 1. The shotgun guard

**The consumer** (`FUN_005abbc0` D:L464701-464737, re-read): offline (`DAT_0045a0c1` 0), or online for a projectile whose `+4` byte has bit 2 set,
`cVar2 = FUN_003d1e10(ammo)` (the ammo's class); when the hit projectile is not the remembered `+0x1048` (or its class
is neither 0xab nor 'y'), a class-'Q' hit is applied only when `+0x1048` is 0 or its own class is not 'Q'
(L464703-464705); then the pellets (`FUN_005a1620` the count, `FUN_003c7600` each, the part by `DAT_006508e0`'s table,
`FUN_005a5830` the hit; online `FUN_005a5a80(param_1, 3, projectile)` L464735) and `*(iVar9 + 0x1048) = param_2` (L464737):
the applied one is remembered. A skipped one is not. The other classes take their own branches (L464740+) and
remember too, but never skip (`SHOTGUN_GUARD_SCOPE_READING`, 'class Q only').

**The reset** (`FUN_00550ef0` D:L418081-418083, re-read: `if (piVar14[0x412] != 0) piVar14[0x412] = 0;`, the word index
0x412 x 4 = 0x1048): after the `+0x105c & 0x40` gate (L418074: the update returns before it when the bit is clear --
"not an unconditional reset on every invocation", 194 A09) and before the controller's update call (L418091). Retail
0x550f9c `sw zero,0x1048(s5)`; vtable 0x6691a0 (`CZSealBody`) slot `+0x18`; the constructor `FUN_00553ea0` L419774
clears it too (194 s7 A09). `SHOTGUN_HIT_GUARD_RESET_READING` (research 94 L1534, note only) is resolved here: the reset
site is `FUN_00550ef0`'s.

**What it closes and what it does not.** The reset location, not the scheduling: which class-Q impacts share one
interval between resets depends on the order of the actor updates and the projectiles' contacts (194 A09: "do not
simply add a permanent 'last shotgun' latch or assert once per trigger is exactly equivalent"). The acceptance 194
and 198 s4.3 step 8 ask for: later volleys preserved, one volley not multiplied across the body's hit nodes.

**The port's window.** Before PF-37 the room's guard was the *shooter's volley* (`p.volley.hit`, `volleyHit`: once a
victim per shell, M4) -- two shooters' volleys on one victim in one frame both landed. Now (`room.ts` `bulletHit`, the
one line at the volley's call, `volleyHit`'s body untouched -- PF.R58):

- a volley's ray on a victim its volley has not yet answered asks `guarded(this.tick, victim.qHitAt)`
  (`shotgunGuard.ts`): inside the window it is a `'guard'` miss (the combat report's reason; the volley's set takes the
  victim so its later rays are silent, one answer a volley as a hit is); outside it the victim's `qHitAt` takes this
  tick and `volleyHit` applies the pellets as before;
- `SHOTGUN_GUARD_TICKS = round(GAME_FRAME_DT x TICK_HZ)` = round(2.002) = **2**: the victim's update is a game frame
  (PF.R8), the room steps it at 60 Hz. A volley on the same tick or the next is refused; two ticks later it lands (no
  latch) -- `SHOTGUN_GUARD_WINDOW_READING = 'victim update (one game frame)'`;
- a new body clears the memory (`spawn`: `qHitAt = -Infinity`, as the constructor's L419774);
- a dead victim is never a guard: the room's walk passes the dead (`fire`'s `!q.alive`), so a second volley after a
  kill on the same tick is a plain miss with no target ('not alive' is `bulletHit`'s for a body dead since struck);
- the bullets (class not Q) are untouched: a rifle round on a victim a volley hit on the same tick lands.

**PF-23 (parked, H92).** Its hunks -- `volleyHit`'s body (`pelletDamage(..., raw ? 'raw' : 'scaled')`, `blowback()`),
`damage.ts` `pelletDamage`'s third argument, `blast.ts` `blowbackKnock`/`blowbackFalloff`, `weapons.ts`'s blowback
fields, `roomShotgun.test.ts` -- are not touched here. Its rebase meets the wrapped volley branch in `bulletHit` and
must keep `roomShotgun.test.ts` green under the guard (its volleys are one shooter, one trigger at a time: unaffected
by design; the merge controller's check at H92, PF.R58).

## 2. The stance window per transition

`ShotCone` (the room's copy of the page's aim) lets the posed root stand anywhere between the two stances' roots for
a while after a posture change: the page's camera stands on the transition clip's posed root, the room has only the
stance's (`ROOT_POSE_SLACK_PLACEHOLDER` plus the change's span). The while was a flat 60 ticks
(`STANCE_CHANGE_TICKS_PLACEHOLDER`, research 91 s16: "the change clips' lengths are not read into the server").

Now `stanceChangeTicks(from, to)` = `ceil(ACTION_SECONDS[clip] x TICK_HZ)`, the clip `mover.ts`'s `ACTION_CLIPS`
names for the pair (motion.rdr `playback`, MOTION_P.ZAR keys, pinned against the disc by
`movementTables.parity.test.ts`), its length `oneShotSeconds` (`FUN_0028c4f0`: playback x ((n-1)/n)^2):

| transition | clip | playback, keys | seconds | ticks (ceil) |
|---|---|---|---|---|
| stand <-> crouch | `standToCrouch` | 0.65, 27 | 0.6027 | 36.16 -> **37** |
| crouch <-> prone | `crouchToProne` | 0.9, 33 | 0.8463 | 50.78 -> **51** |
| stand <-> prone | `standToProne` | 1, 36 | 0.9452 | 56.71 -> **57** |

(179 L701-708.) Getting up plays the same clip backwards (`Walker.changeStance`'s reversed hold, the same
`ACTION_SECONDS`): `STANCE_REVERSE_TICKS_READING = 'same as forward'` (179: "assumed the same length").

**The boundary.** A frame's own slack holds the span through the window's last tick (+37 / +51 / +57) and not past
it (+38 / +52 / +58: refused); `shotCone.test.ts` pins both directions of all three. The check reads a round's frame
and the one before it (the page draws between the two), so a round's eye at the midpoint of stand's and prone's roots
is taken through +58 and refused from +59 -- the test says so, in its title too (the frame-before slack is the
port's honest reading of the page drawing between two commands, so the check is not tightened to the frame's own).
The brief's "58 refused" holds for the frame's own slack, not for the round's check.

**The honest-rounds check.** `shotCone.test.ts`'s "the page's own frames at 144 and 30 Hz ..." gains an honest SEAL
changing stance (stand -> crouch -> prone -> crouch -> stand -> prone -> stand, the page's `WalkMode` and the room's
mover side by side, the round down the cone's centre every other page frame, tails included): none refused at 144 or
30 Hz. As a margin probe (not in the test) the windows scaled by 0.8 still refuse none, by 0.5 refuse 8, by 0 refuse
50 -- so the test bites and the per-transition bounds are not at the edge. The fallback PF.R57 allows (one bound of 57)
was not taken.

## 3. The launcher's wading and the built fallbacks

**The launcher** (`FUN_005857e0` D:L444332-444360, re-read): 1 when the body's anim set (`+0x528`) is the launcher set
(`DAT_0044d408`); else it needs the set's actions 0x12 `Crouch` and 0x54 `Pistol crouch` (`FUN_005e3e80`), then
`!(bit 7 of +0x105e) || +0xf88 <= 8.5`. The crouch entry `FUN_00581990` (D:L442524-442560) opens on the same test.
`FUN_005b52b0` (D:L469852-469902) writes `+0xf88` = the water surface less the feet and bit 7 in water (181 s2.6). A
SEAL's set always has both crouch clips (181: `animset.txt` lines 1243/1263). So the slot gate (`FUN_005bdc30`) refuses
the rocket launcher wading deeper than 8.5 units (0.85 m).

The port: `LAUNCHER_BODY_READING` re-valued from `true` ("not read", research 94 L1549) to `{ maxWadingDepth: 8.5 }`;
`slotSelectable` reads `ctx.wadingDepth?.()` (absent: 0); the room's `raiseLauncher` refuses a raise deeper than it as
`dropped('throw', 'wading')` (the claymore's refusal's wording, PF-13). A launcher already up is not lowered by the
water: the test is the take-up's. The page's depth is `equipment.ts` `wadingDepth(grid, feet)` (PF-13, `probeWater`),
the same as the room's: the number keys' `selectSlot` reads it from the rocket's source (`rocket.ts`); the R2
inventory's line reads the same depth since wave 4 (s4).

**The built fallbacks** (research 86 s5.2, issue #22; 181 s8's C2 lead), no code change:

- `FUN_00581990` (D:L442524-442560): the crouch entry refused wading deeper than 8.5 -- the SEAL stands
  (`WATER_CROUCH = 8.5`, `traversal.ts`);
- `FUN_00581660` (D:L442436-442470): the prone entry taken only at `+0xf88 <= 2.0` or out of the water; deeper, it
  sets `+0x374 = 1` and calls the crouch entry (L442470-442474) -- prone over 2 deep crouches, over 8.5 stands
  (`WATER_PRONE = 2`). **Its caller, transcribed** (`FUN_00552d60` D:L418877-418900): the requested stance `+0x374`
  is 2 -> `FUN_00581660` (or the dive `FUN_0057e540` when `FUN_00584b00` allows it), then `FUN_00581ed0(param_1, 2)`;
  1 -> `FUN_00581990`, then `FUN_00581ed0(param_1, 1)`. So `FUN_00581660` is the prone entry and research 86 s5.2's
  "prone -> crouch" is confirmed;
- `FUN_00583500`: the crawl moving to 1.5 (`WATER_CRAWL = 1.5`).

`traversal.test.ts`'s "over 2 deep, a prone press crouches ..." and "over 8.5 deep, a prone or a crouch press stands
..." hold them (registry `movement.water.stance-fallback`). `WATER_STANCE_READING` (note only) names the set.

## 4. The wiring (LANDED: sprint 30 wave 4)

The page has two launcher gates. **The number keys** (`main.ts` -> `RocketLauncher.selectSlot`, `rocket.ts`, not held)
read the depth already (the review's finding on 7418499e): `RocketLauncher.wadingDepth()` is the source's optional
`wadingDepth` hook, else `wadingDepth(grid(), snapshot().feet)` from the source's own grid and feet -- `main.ts`'s
`RocketLauncher` source already gives both (`walk.grid()`, `walk.snapshot()`), so this path needed no held line;
`equipmentPage.test.ts` "the slot key cannot bring the launcher up wading deeper than 8.5 ..." holds it. **The R2
inventory's `takeable`** was the one held line; it is **LANDED** in sprint 30's wave 4 (the commit `feat(web/viewer):
sprint 30 wave 4 -- PF-34/36/37's hooks in PART_DEPS and the test room's deps; takeKit in MatchFirearm`): the list no
longer shows the launcher takeable in deep water while the number key and the room refuse it.

| owed line | where it landed |
|---|---|
| `inventoryKit`'s `takeable`, the launcher's `SlotContext` literal (was `main.ts` L947, before ONE-WIRE) | `main.ts` L676 `if (equipmentKind(id) === 'launcher') return slotSelectable(id, { chargesDown: 0, roundsFor: (l) => rocket.roundsFor(l), wadingDepth: () => rocket.wadingDepth() });` -- the depth `selectSlot` reads; no import change |
| ~~`matchFirearm.ts`: the same literal's line~~ | **not needed, and no twin**: the R2 inventory and the launcher are `/testroom`'s (`main.ts`'s `inventoryKit`, lent to the one firearm through `FirearmHands.takeable`); the front end mounts neither (`./matchCore` `FRONT_END_CAPABILITIES.launcher` and `.inventory` false) and has no water to wade (`.traversal` false) |

The pin (wave 4, in place of the asymmetric pair `matchMount.test.ts` was to carry): `matchMount.test.ts` "PF-37: the
R2 inventory's launcher reads the wading depth (main.ts inventoryKit, the same depth selectSlot reads); the front end
mounts no launcher nor inventory, so no line there" -- the line as text in `main.ts`, the switch's two parts off, and no
`wadingDepth` in `matchMount.ts` or `matchFirearm.ts`. A behaviour test of the R2 list in water is owed with the
inventory's move into a part of its own (it is `main.ts`'s module-level wiring, research 222 §5).

*Corrected 2026-10-10: the inventory has moved into its own part -- `inventoryKit` and its launcher line are
`packages/viewer/src/matchThrow.ts`'s now, once for both pages -- and the front end mounts the launcher and the
inventory (`./matchCore` `FRONT_END_CAPABILITIES.launcher`, `.inventory` and `.traversal` true), so the table's second
row and the pin's "no line there" no longer hold. The pin is now `matchMount.test.ts` "PF-37: the R2 inventory's
launcher reads the wading depth (matchThrow.ts inventoryKit, the same depth selectSlot reads): once, for both pages".
A behaviour test of the R2 list in water (`matchThrow.ts` `inventoryKit`) is still owed.*

## 5. Readings and placeholders

| name | where | status |
|---|---|---|
| `SHOTGUN_GUARD_WINDOW_READING` | server `shotgunGuard.ts` (`room.ts` `bulletHit`) | `'victim update (one game frame)'`: a second class-Q volley on a victim inside `SHOTGUN_GUARD_TICKS` (2 room ticks = one game frame) of the last that landed is a `'guard'` miss; the original clears `+0x1048` once a victim update (`FUN_00550ef0` D:L418081-418083) and skips a Q hit while it holds a Q (`FUN_005abbc0` D:L464701-464737). Owed: 194 A09's capture (s6) |
| `SHOTGUN_GUARD_SCOPE_READING` | server `shotgunGuard.ts` | `'class Q only'`: the 12-gauge's volley (`pelletsOf > 1`) alone is skipped; the compare's other branches (L464740+) apply their hit and only remember -- the port's bullets are untouched |
| `SHOTGUN_HIT_GUARD_RESET_READING` | *note only* (research 94 L1534) | resolved 2026-10-06 (PF-37): the reset site is `CZSealBody`'s update `FUN_00550ef0` D:L418081-418083 (retail 0x550f9c), after the `+0x105c & 0x40` gate; the constructor `FUN_00553ea0` L419774 (194 s7 A09); the interval is `SHOTGUN_GUARD_WINDOW_READING`'s |
| `STANCE_CHANGE_TICKS_PLACEHOLDER` | *note only* (was viewer `net/shotCone.ts`) | retired 2026-10-06 (PF-37): `stanceChangeTicks(from, to)`, the transition's clip in ticks -- 37 / 51 / 57 (179 L695-710; s2) |
| `STANCE_REVERSE_TICKS_READING` | viewer `net/shotCone.ts` | `'same as forward'`: getting up takes the same ticks as going down (the same clip reversed, `ACTION_SECONDS`); the reversed play's speed is a mover reading |
| `LAUNCHER_BODY_READING` | viewer `equipment.ts` (`room.ts` `raiseLauncher`) | re-valued 2026-10-06 (PF-37) from `true` to `{ maxWadingDepth: 8.5 }`: `FUN_005857e0` D:L444332-444360, `+0xf88 <= 8.5` with bit 7 of `+0x105e` (181 s2.6) |
| `WATER_STANCE_READING` | *note only* (viewer `traversal.ts`, a comment) | the built water fallbacks: prone to 2 deep, crouched to 8.5, the crawl to 1.5 (`WATER_PRONE`, `WATER_CROUCH`, `WATER_CRAWL`; `FUN_00581660` D:L442436-442470, `FUN_00581990` D:L442524-442560, `FUN_00583500`; 181 s8, 86 s5.2); `FUN_00581660`'s caller `FUN_00552d60` D:L418877-418900 confirms it is the prone entry (s3) |

## 6. Owed

- **194 A09's capture** (owner list 5, capture B's "an 870 hit", an addition): two shooters' same-frame volleys on one
  SEAL, a second volley after the actor update, impacts spanning adjacent updates -- the window's size and ordering
  (`SHOTGUN_GUARD_WINDOW_READING`). The port's one game frame is a reading of shape, not of number.
- The `+0x105c & 0x40` gate's meaning (when the body's update skips the reset): not read; the port resets every frame.
- ~~The wiring of s4 (wave 4) and `matchMount.test.ts`'s asymmetric pin~~ LANDED (s4); still owed: a behaviour test of
  the R2 inventory's list in water (s4).
- The reversed stance clip's speed (`STANCE_REVERSE_TICKS_READING`): a mover reading; a capture of a get-up's length
  would close it.
