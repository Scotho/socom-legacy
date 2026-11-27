# 381 -- The scoped sway on the view and the cross

**2026-11-02, simulation track** (Trello "Scoped: the crosshair stays still but the shots sway",
(the private board); branch `agent/scope-sway`). The owner (Craig): "while scoped, the crosshair has zero
sway, but internally it is swaying, so you don't shoot where you're physically aiming". The plan's Q26 default: port as
read, reading pending review. **Confidence: reading, pending review** -- every line below is transcribed from the
decompilation (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`; read-only on the owner's host), re-read
at the source in this task; none of it is measured on the original running yet (§5).

In short: the original **does** sway the view in a scope. The sway that moves the round (`kit+0x28/+0x2c`) is handed to
the camera's screen offset, which moves the projection's centre -- the world -- under the scope's tube and cross, which
are HUD parts at fixed frame coordinates. So the fixed cross stays on the round's pixel. Research 84 §8 and §15 said the
opposite ("no reader draws it", "the view does not sway"); both are corrected by dated notes there. One quirk: the
offset's x write in PlayerUpd goes to the **y** setter, so the view's x sway comes only from `FUN_005b9030`, which
gives it from view state 5: the 9x view (state 4) sways the view in y only.

## 1. What the original does

1. **The sway.** `FUN_005b9280` (D:L472136-472185, flag `DAT_00650940`) swings `kit+0x28` (x) and `kit+0x2c` (y),
   PS2 pixels of the 640 x 448 frame, within `SniperDistLimit x (0.8 steadiness + 0.2)` -- research 84 §8, unchanged.
2. **The offset's reset and its x.** PlayerUpd (`FUN_00594cf0`) calls `FUN_005b9030(kit)` at D:L453084 each frame.
   `FUN_005b9030` (D:L471943-471960): `kit+0x58 = kit+0x5c = 0`; the camera is `DAT_0045c380+0x128`; with no body, or
   the body's view state (`body+0x200`) under 5, `FUN_002915a0(0, cam)` and `FUN_00291550(0, cam)`; else
   `FUN_002915a0(kit+0x28, cam)` and `FUN_00291550(kit+0x2c, cam)`. The kit's reset `FUN_005c8190` repeats the block
   (D:L481041-481049).
3. **The setters.** `FUN_002915a0` (D:L137473-137488) writes `cam+0x480` (x), `FUN_00291550` (D:L137455-137470)
   `cam+0x484` (y), each held within +-200 (`look.ts` `SCREEN_OFFSET_LIMIT`).
4. **The round's offsets.** `FUN_005bd100` (PlayerUpd D:L453666, every frame), in view state 4 or more
   (D:L474218-474226): `kit+0x58 += kit+0x28`, `kit+0x20 = -kit+0x28`, `kit+0x5c -= kit+0x2c`, `kit+0x24 = -kit+0x2c`,
   and the round's offsets `body+0x5d4` / `+0x5d8` are made from `(-sway x, -sway y)` (D:L474250-474263; research 84
   §5).
   With the reset of item 2 the two accumulators end the call at `kit+0x58 = sway x`, `kit+0x5c = -sway y`.
5. **The hand-over to the camera.** PlayerUpd D:L453667-453676: when the body's controller (`+0xc0`) answers its
   virtual `+0x2c` -- the local player (research 205, 217; the bob's own gate, research 84 §7 row B9) --
   `FUN_00291550(FUN_005b90e0(kit), cam)` then `FUN_00291550(FUN_005b90d0(kit), cam)`. `FUN_005b90e0` returns
   `kit+0x58` (D:L471984-471988), `FUN_005b90d0` `kit+0x5c` (D:L471975-471979). **Both calls go to the y setter**: the
   first (the x accumulator) is overwritten by the second, so `cam+0x484 = kit+0x5c` and `cam+0x480` stays what item 2
   wrote. The decompilation names both call targets `FUN_00291550`; the disassembly was not re-read (§5).
6. **The bob shares the channel.** `FUN_005966a0` (from PlayerUpd D:L453175, between items 2 and 4) adds the view bob
   into `kit+0x5c` (`FUN_005b90c0`, D:L453823-453849) in view states 1-3 only (`look.ts` `ViewBob`). Scoped it adds
   nothing, so `kit+0x5c` is the sway's alone.
7. **The camera draws it.** `FUN_00294070` hands the projection its centre as `cam+0x478 + cam+0x480`,
   `cam+0x47c + cam+0x484` (D:L138944-138945), the centre being 2048, 2048 (`0x45000000`, D:L138760-138763, the GS
   frame's middle); the clip planes and the screen matrix take the same offsets (D:L138959-138986, D:L139020-139046).
   The picture moves by (`+0x480`, `+0x484`) pixels; the HUD does not -- the scope's tube and its cross are four quads
   centred on the frame (research 84 §9, `ChangeReticule` type 5).
8. **The shake adds to it.** `FUN_00299c40` writes `setter(shake + cam+0x480)` and `setter(shake + cam+0x484)`
   (D:L142072-142078), after the frame's offset.

## 2. What it comes to

| view state (`body+0x200`) | view offset x (`cam+0x480`) | view offset y (`cam+0x484`) |
|---|---|---|
| 0-3 (third person, first person, the night vision) | 0 | the bob (`kit+0x5c`; none in state 0) |
| 4 (the 9x view, the binoculars) | **0** (item 2: under 5) | `-sway y` (items 4-5) |
| 5 and up (a scope) | `sway x` (item 2) | `-sway y` (items 4-5) |

With the picture moved by (dx, dy) pixels (x right, y down), the frame's centre shows the point that was (-dx, -dy) from
the camera's axis: in a scope (-sway x, +sway y), which is the round's own offset (-sway x right, -sway y up) in the
frame's pixels. **The fixed cross is on the round**, to the precision of the two pixel-to-angle factors: the picture's
shift goes through the projection, the round's through `FUN_005bd100`'s `tan(tan(hfov))/320` (research 84 §5, the
port's `tangentPerPixel`: "the cone is ~1.2x the reticle"), so at the maps' `hfov` 0.6109 the round sits 1.20 x the
sway's angle off the axis while the cross sits at 1.00 x -- 0.2 x the sway apart (4 pixels at the SD's 20) in the
original. That factor, and `fVar9`'s aim-to-muzzle depth ratio taken as 1 (research 84 §17), are research 84's readings,
not changed here.

*Corrected 2026-11-02 (the review of `agent/scope-sway`, F1):* **the port's x residual is larger, about 0.39 x the sway
(about 7.7 PS2 pixels at the SD's 20), not 0.2 x.** The port's camera spans the picture's width at `tan(hfov)` (aspect
`tan(hfov) / tan(vfov)`, `main.ts` :191, :1825), but `look.ts` `viewOffset` (:572) moves it by a fixed
`(4/3) x 448/640` = 0.933 page pixel per PS2 pixel across (a 4:3 frame's), so a PS2 pixel of offset is
`0.933 x tan(vfov)/224` = 0.00190 in tangent where the original's projection gives `tan(hfov)/320` = 0.00219, and the
round's `tan(tan(hfov))/320` = 0.00263 is 1.39 x the port's shift. In y the same arithmetic gives the port 1.17 x
(`tan(tan(hfov) x 448/640)/224` over `tan(vfov)/224`); the original's own y factor is not derived here. The 0.933 is
older than this task (the shake and the bob ride it too) and is LATER 621.

*Corrected 2026-11-10 (LATER 621, `agent/scope-sway-x`; reading, pending review):* **the port's x factor is the
original's: the cross sits 0.2 x the sway off the round across, as in the original.** `look.ts` `viewOffset` now moves
the picture by `viewOffsetPerPixelX()` = `(tan(hfov)/320) / (tan(vfov)/224)` page pixels (of a frame 448 high) per PS2
pixel across -- 1.0756 at the maps' fov (0.6109 0.4276, research 72), taken from `accuracy.ts` `MAP_FOV`, the one fov
the round's `tangentPerPixel` and the page's `baseFov` read -- so a PS2 pixel of offset across is `tan(hfov)/320` =
0.00219 in tangent, the original's projection's (`FUN_00294070` D:L138944-138945: the offset added to the centre; the
scale across `cam+0x290` x `cam+0x470`, below). Measured through the page's own three.js camera (the scope
FOV of `Zoom.fov`, `FlyCamera.setKitOffset`, at 4:3, 16:9 and 21:9 and 3x/5x/10x), the round's offset across is
`tan(tan(hfov))/tan(hfov)` = 1.203 x the cross's shift (was 1.39 x) and down 1.1709 x, unchanged
(`scopeSwayView.test.ts`). **y is left as it was**: the page's y factor (one page pixel of 448 per PS2 pixel down)
puts the round 1.1709 x the cross down, and the original's own y factor (the projection's `cam+0x474`-side scale) is
still not derived here -- the 1.1709 is the port's, pinned, not proven equal to the original's. The shake and the bob
(research 83 §5, §6) ride the same offset, so their x is the original's projection's too (the bob has no x; the
shake's x moves 1.0756 / 0.933 = 1.152 x as far across as before).

*Corrected 2026-11-10 (the review of `agent/scope-sway-x`; `agent/scope-sway-docs`; reading, pending review):*
**the down figure is 1.1709, not 1.168.** `tangentPerPixel().y / (tan(vfov)/224)` = `tan(tan(0.6109) x 448/640) /
tan(0.4276)` = 1.17094 (recomputed); the 1.168 was a slip in the third decimal, passed by a pin at precision 2.
`scopeSwayView.test.ts` now pins 1.1709 at precision 3 and names 1.171 x; commit e1fc55aea's subject still carries the
old 1.168 (a commit subject is not rewritten). **The scale across, in full.** `FUN_00294070` hands `FUN_001c0410` both
`cam+0x290` and `cam+0x470` (D:L138943-138944) as the matrix's x scales, so the original's pixels across per unit of
tangent are `cam+0x290` x `cam+0x470`: `cam+0x290` = `cam+0x4b0` x `cam+0x1d8` (`FUN_002915f0` D:L137515), with
`cam+0x1d8` = 1 / tan(`cam+0xe0`) (D:L137507-137514, `cam+0xe0` the half fov from `cam+0x210`) and `cam+0x4b0` =
`DAT_004a44c4` >> 1 (D:L138780) = 320, half the frame's 640 (research 84 §2); `cam+0x470` = `DAT_004a44a8`
(D:L138758), which `FUN_003b14a0` sets to 1.0 in all three video modes (D:L305360, D:L305372, D:L305387), rewritten
as `DAT_004a44a8` x 1.0 by `FUN_00295260` (D:L139494, D:L139545), as the magnification x `DAT_004a44a8` by
`FUN_0029b2f0` (D:L142703; the scope's zoom, research 84 §7), and as `cam+0x118` x `DAT_004a44a8` by `FUN_002964f0`'s
branch for `cam+0xf4` == 2 (D:L140513-140526, a 1..30 factor). **The premise of the x fix**, reading, pending review:
walking, `cam+0x470` is 1.0 (the applied magnification is 1 off the scope); scoped, it is the magnification, and the
page carries the same factor in the scoped camera's tangent (`Zoom.fov`), so the page's `tan(hfov)/320` per PS2 pixel
in the unzoomed camera's terms is the original's `1 / (cam+0x290 x cam+0x470)` at every power. Not settled by this
reading: which camera state `FUN_002964f0`'s `cam+0xf4` == 2 branch is (not traced; if it runs in the walking or scoped
view, `cam+0x470` there is `cam+0x118`, not 1.0 or the magnification).

**The quirk.** In the 9x view the view sways vertically only; the rounds' cone there is as in a scope (both axes,
item 4). Nothing in the original moves the x of the view in state 4.

## 3. What the port does (since this task)

- `accuracy.ts` `scopeViewOffset(zoomState, sway)`: the table of §2 for states 4 and up (`[0, 0]` below; the bob is
  the camera's own); `Accuracy.viewOffset(zoomState)` gives it from the kit's sway now.
- `camera.ts` `FlyCamera.setKitOffset(x, y)`: the kit's offset added to the shake and the bob in the one screen offset
  (`setScreenOffset`, `look.ts` `viewOffset`), drawn at once and kept through the look's frames until the next; walking
  only, dropped off the walk. The +-200 clamp is on the sum, as `FUN_00299c40`'s write has it.
- `matchFirearm.ts` `gunFrame`: after the kit's tick and the zoom's, `fly.setKitOffset(...accuracy.viewOffset(...))`;
  `aimReticle` then reads `screenShift()`, so the reticle and the scope's overlay stay at the frame's centre while the
  world moves (as for the shake and the bob, research 83).
- Pinned by `packages/viewer/test/scopeSwayView.test.ts` (transcription; the cross-on-the-round identity in PS2 pixels;
  the camera's offset; the page's hand-over before the aim point is read; since 2026-11-10 the round against the page
  camera's cross, 1.203 x across and 1.1709 x down, LATER 621).

Was: the round swayed and the view did not (research 84 §15's reading), so the scoped round left the cross by the sway.

## 4. Not ported, named

- **The reticle's centre scoped.** `FUN_005bd100` also writes the knock fields `kit+0x20/+0x24 = -sway` while scoped
  (D:L474221, D:L474223); `FUN_005b9020` clears them on leaving (`Accuracy.leaveScope`). Scoped, the ring and arms are
  hidden (research 84 §9); what moves with that centre is the damage-direction markers (`hud+0x19b0`, research 84 §15).
  `Accuracy.reticle()` still gives the knock scoped. Owed: a row for the controller (the markers' scoped placement).
- **The frame order of the x.** The view's x is read from `kit+0x28` at D:L453084, the round's at D:L453666. Whether the
  sway's tick (`FUN_00550ef0` -> `FUN_005b9280`, through the actor's vtable -- an unread order, research 101's
  `PENDING_STANCE_RETRY_READING` row) falls between them is not read; if it does, the view's x trails the round's by one
  game frame (at most a frame's sway step, about 0.4 pixel at 13 px/s). The port runs the kit continuously (MISSION R8,
  research 208 §9) and draws both from the same sway; no value of the port's depends on the order.
- **Other bodies' PlayerUpd** (*added 2026-11-02, the review of `agent/scope-sway`, F2*). `FUN_005b9030` at D:L453084
  is not behind the local player's gate -- only the hand-over at D:L453669-453676 is (the controller's virtual `+0x2c`,
  D:L453671) -- and it writes the one camera (`DAT_0045c380+0x128`) for the body it is called for. Whether PlayerUpd
  reaches D:L453084 for other bodies (teammates, bots, remote players) after the local one in the frame, which would
  zero the camera's offset (their view state is under 5) or give it their sway, is **not read**: the branch's condition
  above D:L453070 and the bodies' update order were not traced. The port hands the camera the local kit's offset only.
  Settles it: the branch's gate at the source, or the capture of §5 (a still scope beside moving teammates).

No `*_READING` or `*_PLACEHOLDER` constant is added: every value ported is read at the lines above.

## 5. What would prove it

A capture of the original scoped with the M4A1 SD, standing still (the EPH harness, seat ac): the scene shifting against
the fixed tube on both axes at the sway's rate and limits (SD standing: +-20 px across, +-24 px down, research 84 §8);
the binoculars' view moving in y only; a round fired at a mark under the cross landing on it (within the 1.2x factor of
§2). The disassembly at PlayerUpd's two `jal`s (0x00594cf0's block for D:L453673-453676) would confirm the y setter
twice without a capture.

## 6. Leaving the scope: the aim stays where the cross was (the owner's intentional divergence)

**2026-11-22, simulation track; SCOPE-EXIT-AIM** (Kill's caption 5; the owner's ruling relayed by the main controller
2026-11-22T05:02:55Z after the deciding capture; branch `agent/scope-exit-aim`, the claim pending with seat-merge). The
port departs from the original **on purpose**, by the owner's word -- the owner's intentional divergence, MISSION
OT.R136: `SCOPE_EXIT_AIM_CARRY_ADAPTATION` (`packages/viewer/src/scopeCarry.ts`; named `*_ADAPTATION`, as
`CLAN_BAND_ALIGN_ADAPTATION` names an intended divergence, so the ledger lists it in §6.1 and refuses its silent removal). No value of the original's is changed: the sway's value, rate, limits and phase,
the knock's clear on d-pad Down, and the rounds' offsets stay as §1-§3.

**The owner's words** (verbatim): "kill is requesting that the position of the crosshair moves with the sway of the
zoomed in scope. so when you zoom back out after swaying you don't get an awkward jittery adjustment in position. he
demo'd it with an m4a1, and after watching, i agree - if the original is not like this, it will be our fix to implement
as an inentional divergenc.e"

**The original (the capture).** r0004 on PC 3, hand-scored, **unreviewed** (capture, not yet scored by the harness):
at the exit to first person the camera's offset `+0x480/+0x484` falls to 0 and the look is unchanged -- the view
**jumps back** by the sway's offset (M4A1 SD 3 of 3, M87ELR 3 of 3; `SCOPE-EXIT-AIM-PC3.zip`, sha256 `f74ca32e...`, on
the records drive, not in git). A zoom step inside the scope keeps the offset. The kit's sway (`actor+0x608/+0x60c`)
holds across the time out of the scope and resumes on re-entry, so the scope re-opens offset
(`SCOPE-EXIT-AIM-PC3-sway.zip`, sha256 `9547feb9...`). This agrees with §1-§2's reading (`FUN_005b9030`
D:L471951-471957: no offset below state 5 / 4; nothing read folds the sway into the actor's look).

**The page's rule ("A-prime", stateless).** At every view change that crosses the scope's 4-edge (one side under 4, the
other 4 or more), the look turns by the angle the scoped side's sway offset draws, so the drawn aim stays put:
- out (>= 4 -> < 4): the look turns onto the cross the scope drew;
- in (< 4 -> >= 4): the exact inverse -- the look whose scoped cross falls on the centre the player saw, so the scope
  opens with its cross where the first-person cross was (the sway itself, held by the original, still offsets the view).

The carry is computed from the sway **now** (`Accuracy.state().sway`), never stored; at the scoped side's **level**
magnification (the state's target, `Zoom.target()`: `ZoomMode[state - 4]`, 9 for the binoculars); per axis as
`scopeViewOffset` gives it (x from state 5, y from state 4: the binoculars carry y only, the yaw unchanged); and through
the direction, exactly: the cross's tangent point (`./look` `viewOffset` at the frame 448 high whose half-tangent is
tan(base / 2) / m) turned by the camera's YXZ rotation, then yaw = atan2, pitch = asin. The in-carry solves the inverse
in closed form (its pitch root nearest the look's), so an in and an out with no sway time between return the look to
1e-9 rad: ten quick toggles walk nothing (the trap). The turn goes through `FlyCamera.carryLook` (the yaw wrapped, the
pitch held as the kick's, `addPitch`), and `gunFrame`'s `lastLook` moves with it, so the exertion's turn and pitch
throttles (research 84 §17) never count it as a stick turn.

**Where it runs** (`matchFirearm.ts` `carryScope`): d-pad Down / Up / the cycle (`stepZoom`, before the walk builds the
command: the turn rides on the same command as the Scope bit's change), `setZoom` (a launcher-round mode's drop),
`switchZoom` (a switch's replayed view path, by its ends: an undone switch turns back by the same rule), the hold's drop
inside `stepZoom` (an item or a launcher taken up while scoped, `Zoom.setHold` -> 1: the edge is read above it; the knock's
clear and the exertion still read the view after the hold, as before; NOT carried: the same hold's drop reached through `switchFireMode`'s own `zoom.setHold(zoomHold())` (`matchFirearm.ts` ~:556), an item or a launcher up while still scoped -- it keeps the original's jump; stateless, so nothing drifts), and the second scoped round's drop (`dropScope`,
LATER 233). **Not**: the mount from a scope (`syncMount`: the turret places the aim,
`walk.ts` `setTurretAim`); death and leaving the walk (no look to keep); level steps inside the scope (5 <-> 6 ...) and
4 <-> 5, which keep the original's move of the cross (seat-kill's default; whether "one rule" should hold the aim across
level steps too is the owner's, not asked by his words).

**Named limits.**
- *A mid-run exit* (the magnification still running in): the last scoped frame drew at the running magnification, the
  carry is at the level's, so the cross moves by the difference on that exit. A settled scope exits exactly.
- *Exit and re-entry at different levels*: the look ends the cycle off its start by carry(m2) - carry(m1) -- the move the
  cross showed at the in-scope level step (the original's).
- *The pitch limits*: a carry past the stance's limits is cut (`carryLook`); the re-entry then still puts the cross on
  the pre-entry centre, and later cycles repeat the same two values -- the first cycle moves the look once (held by
  `scopeExitAim.test.ts` (b) "the trap at the limit, cutting": pitch 59.5 with sway (19, 13) and 59.99 with (-20, 24),
  after cycle 1 equal to after cycle 10 to 1e-9 rad).
- *`dropScope`'s order* (seat-kill's default: move the drop ahead of the command's send only if small and local): it is
  not -- the drop runs in the fire's round, whose order against the walk's send was not re-traced -- so the carry is
  applied in `dropScope` itself, and the watchers may see the turn one command after the Scope bit drops (a one-command
  lag of the turn behind the view's drop, on the second scoped round only).
- *The room's gate* (`lookGate.ts`), the exit: the exit command has the unscoped allowance (`wide = max(scale,
  prevScale)`) and holds one scoped stick tick plus the carry (the look's scale is written after the walk's ticks); held
  by `lookGate.test.ts` "SCOPE-EXIT-AIM: the exit command" over every scoped record on the disc's table at the fastest gain
  with the bank spent: never held.
- *The room's gate, the entry* (the review's F2; measured, not "does not arise"): by the same frame order the entry
  command carries a full *unscoped* stick tick plus the in-carry against the unscoped allowance (the previous command
  unscoped; the Scope bit makes it a kicking view). With both banks spent by a full first-person push at the fastest gain,
  the gate **holds** it -- HELD_RIFLE 36 of 36 rows, every scoped record on the disc's table 504 of 504; the most held
  1.787 deg of yaw and 0.175 deg of pitch -- and what it holds is the in-carry's part only, never the stick's tick: at
  most one carry per axis (`lookGate.test.ts` "SCOPE-EXIT-AIM: the entry command"). One gate for the page's prediction
  and the room's mover, so no desync; the scope opens up to one carry off its centre during a full-push turn at the
  fastest gain. With the bank not spent (a still or slow look), the entry is laid whole.
- *The carry read as a turn* (the review's F1; outside the claim, the room cannot compute the carry, LATER 640): (a) the
  gate's `meanTurn` (`net/lookGate.ts:330`, `:339`) averages the last ticks' yaw moves into the derived turn, which is
  `w.turn` on the room (`net/moverSim.ts:184-187`) and on the page's own mover (`walk.ts:2626`), and `traversal.ts:1930`
  sets `e.turn = w.turn !== 0`: so a **prone, still** body crossing the scope's edge with a non-zero x sway may play
  `seal_prone_turn` for a few ticks the original does not (the standing consumers, `animator.ts:989` and `:1644`, not
  traced); (b) the room's cone (`net/shotCone.ts:763-775`, `lookRates` from the command's look difference) sees the carry
  as a turn on the exit and entry commands, so the room's cone (bloom and exertion) is wider than the page's there -- the
  permissive direction, no round refused. The page's own kit does not count it (`lastLook` moves with the carry). The fix
  (exclude the carry from `meanTurn` / `lookRates` on the edge command) needs the carry on the wire or a flag (LATER 640);
  LATER 1375.
- *The Xbox prototype* (`xboxPrototype/combatRuntime.ts`, frozen) keeps the jump: an Xbox-prototype page and a browser
  page in one match have two exit-aim rules. A gap, named only (seat-merge's call).
- *Not run*: the room's shot cone on a round fired on the exit command (the touch list's (d2), `shotCone.ts`'s window
  blending a pre-carry and a post-carry tick).

**Held by** `packages/viewer/test/scopeExitAim.test.ts` (unit tests through the page's own camera and firearm; the
disc rows from the `test-fixtures` `ZWEAPON.ZAR`, skipped without it): (a) continuity on the way out <= 1e-6 rad over
every level, stance, sway corner, pitch (0, +45, 59, -60) and yaw (the wrap) of the fixture's rifle and every scoped
record (the M87ELR named), the binoculars' yaw unchanged, and on the page's d-pad Down, `setZoom` and `dropScope`;
(b) ten toggles back to the start to 1e-9 rad (at pitch 0, 45 and 59.5, the rig handing the mover its pitch), the
cutting rows at the limit, a reset's entry turning nothing, the entry's exact inverse; an item taken up while scoped
keeping the aim; (c1) the sway's value and rates untouched; (c2) the exit raising no exertion; (d) the first round out
along the cross.

If a reviewed capture ever shows the original keeps the swayed aim, this section is replaced by the correction and the
rule becomes the original's.

### 6.1 Adaptations

| Name | What | Status |
| --- | --- | --- |
| `SCOPE_EXIT_AIM_CARRY_ADAPTATION` | the owner's intentional divergence, MISSION OT.R136: the look carried across the scope's edge | live: a divergence by the owner's word (not a reading, not a placeholder); the original's side captured (unreviewed) |
