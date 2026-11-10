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
0.00219 in tangent, the original's projection's (`FUN_00294070` D:L138944-138945: the offset added to the centre, the
scale across `cam+0x290` = 320 / tan(hfov), `FUN_002915f0`). Measured through the page's own three.js camera (the scope
FOV of `Zoom.fov`, `FlyCamera.setKitOffset`, at 4:3, 16:9 and 21:9 and 3x/5x/10x), the round's offset across is
`tan(tan(hfov))/tan(hfov)` = 1.203 x the cross's shift (was 1.39 x) and down 1.168 x, unchanged
(`scopeSwayView.test.ts`). **y is left as it was**: the page's y factor (one page pixel of 448 per PS2 pixel down)
puts the round 1.168 x the cross down, and the original's own y factor (the projection's `cam+0x474`-side scale) is
still not derived here -- the 1.168 is the port's, pinned, not proven equal to the original's. The shake and the bob
(research 83 §5, §6) ride the same offset, so their x is the original's projection's too (the bob has no x; the
shake's x moves 1.0756 / 0.933 = 1.152 x as far across as before).

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
  camera's cross, 1.203 x across and 1.168 x down, LATER 621).

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
