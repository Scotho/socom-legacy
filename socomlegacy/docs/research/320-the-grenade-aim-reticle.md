# 320 -- The grenade aim reticle: the throw meter and the yellow arc, the original's against the port's (NU-2)

- Date: 2026-10-14 (11:10Z). PARITY-2's next wave, row NU-2 of the
  [next-update checklist](../plans/2026-10-13-next-update-checklist.md) (NU.R1: "Add the original grenade aiming
  crosshair."; NU.R2, NU.R3), read alone in a host gap (OT.R54), the reads-only brief of 2026-10-14 (NU-2 and NU-3;
  NU-3's read is [research 321](321-the-weapon-crosshairs.md), which depends on this one). Branch `agent/nu23-read`
  from `2d4cd649c`. The build -- RED first -- is a later brief from section 8.
- Review: a fresh review of `5ce652eab` returned FAIL (F1 blocking), medium-high; F1-F3 (and research 321's F4, which
  shares F1's cause) are folded here with the text they corrected kept beside ("was: ..."); status unchanged.
- Build (NU-2, 2026-10-14, branch `agent/nu2` from `4878ec8a9`; brief `../plans/briefs/2026-10-14-nu2-throw-meter.md`):
  G1's set rule, G2's meter and G3's frozen centre and power rule are built in `packages/viewer/src/reticle.ts`
  (`handReticleType`, `meterLayout`, `meterPower`, `Reticle.setSet(4)` / `setSet(-1)` / `setMeter`), held by
  `packages/viewer/test/reticle.test.ts` and the dev-disc `hudBitmaps.test.ts`; the bitmaps read (section 2, "The
  bitmaps, read") and the constants filed (section 8.4). Then, the brief widened by the gameplay controller the same day:
  the hand's item and power handed to `aimReticle` (`FirearmHands.handItem` / `throwPower`, `matchThrow.ts`'s `hands`;
  section 8.1) and D7 built (`grenade.ts`, section 7). (Was: "the hand's item and power are **not yet handed to
  `aimReticle`** (section 8.1, the wiring owed)".) Reading, pending review.
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, and the port's code was read. No game, emulator, reader, test or browser was run (no node process at
  all). Where the port's behaviour is stated it is read off its source, not run. Nothing here is proven.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, the bytes research 230 and 251 pin; re-hashed for
  this note); the desktop pin `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` (`ref/desktop`). The ELF
  `game/disc/socom2_game.elf` (read only, through scratch scripts) for the names and constants: the reticle bitmaps'
  name strings `BitmapReticule_Init` loads (`ret_grenade_02.tif` 0x3e4900, `ret_grenade_01.tif` 0x3e4a40, and the
  others in research 321 section 1), `DAT_003dc600` = 36.0, `DAT_003dc608` = 64.0, `DAT_003dc5f8` = 32.0,
  `DAT_003dc610` = 128.0, `DAT_003dc618` = 1 (a byte), and `DAT_0040c0f0..f8`, which lie past the load segment's file
  bytes (the segment at 0x1e7000 holds 0x221480 bytes of the file, which so end at 0x408480): zero-filled at load, .bss,
  and written at run time (section 2) (the review, F3; was: "= 0 in `.data` (written at run time, section 2)"). The disc's values only from the committed goldens: `packages/scene/test/golden/throwables.json` and
  `arsenal-items.json` (the throwables' and items' ids and classes, `readKitTable` / `readArsenal` over
  `RUN/ZWEAPON.ZAR`, extracted 2026-10-02). No reader was run; the two grenade bitmaps' sizes and texels need one and
  are named as owed (section 8.2).
- Evidence beside the code (kept apart, section 9): the frame `h00_hud_grenade_in_hand` of research 212 section 11's
  capture of 2026-10-05 (our recompilation of the original, `socom_pc` 60d2dad6, 640x448, an M67 in hand, not winding;
  in a capture agent's scratch, not in the tree, RS.R8), and `l01_after_L1_menu_closed` (the HE in hand), both read
  pixel by pixel by a scratch PNG decoder for this note. A frame of the recompilation, not scored by the harness: it is
  consistent with the reading, it does not raise it to proven.
- Built on: [research 85](85-grenades.md) sections 2 (the power), 3 (`GetThrowAnim`), 4 (the launch), 9.2 (the classes)
  and 11 (the yellow arc); [research 84](84-accuracy-and-recoil.md) section 9 (the reticle sets; it named set 4
  `ret_grenade_02` "+ `ret_grenade_01`, the throw meter" and drew neither); [research 87](87-hud.md) (the HUD, row 1.15:
  the reticle is `./reticle`'s pass, not `hud.ts`'s); [research 251](251-the-effective-action-life-model.md) section 12.8
  (the throw in the air, whose note left the arc in the air unread); [research 212](212-the-r2-menu-drawn.md) section 11
  (the capture). Cited, not re-derived, except where this read adds to them.

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R320.1 | **A thrown grenade's reticle is a throw meter, not a crosshair.** Reticle set 4 (`FUN_005be300`: ids 121-140, the hand grenades -- M67, AN-M8, Mark141, HE, the red smoke, the chem light -- and 153-189 but the C4 and the satchel) hides, at the change, the ring, the four arms, the target's name and its health bar -- the name and the bar shown again each frame over a target by the colour pass, as under every set (section 2; the review, F1; was: "hides the ring, the four arms and the target's name") -- and shows four quads: the frame `ret_grenade_02` twice, the top half and its mirror below, and the fill `ret_grenade_01` twice the same way | the page keeps drawing the last firearm's ring and arms with a grenade up: `reticleType` is asked for the firearm's record, and `Reticle.setSet(4)` keeps the drawn set (D1) | 1, 2, 7 |
| R320.2 | **The meter is a vertical bar centred on the reticle's centre, the frame's height the bitmap's width (64 on the frame), its width the bitmap's height**; the frame in (200, 200, 0) at alpha 36 of 128, the fill in (128, 70, 32) at alpha 64 | none | 2 |
| R320.3 | **The fill is the throw's power.** Each HUD frame, while the hand holds a hand grenade or a placed charge (`FUN_005b8760` = 3), the meter is laid at the controller's power `ctrl+0x11c` -- 0 when the hand has none left: the fill grows from the centre line up and down together, `power x 32` pixels each way at full power on the 64 frame, and holds the release's power through the throw until the controller clears it | none | 4 |
| R320.4 | **It does not move.** Under set 4 the HUD takes no size and moves no centre: no bloom, no knock, no third-person halving; the meter stays where the last reticle frame left the centre ((320, 224) at rest) | the page's firearm reticle blooms and climbs with the firearm's record under a grenade | 3 |
| R320.5 | **Grenade, flash, smoke and the toss draw the same meter**: no item and no clip enters it; the toss is only a power under 0.6 with the aim's sine under 0.3 (research 85 section 3), so a toss's fill stops under 60 % | -- | 5 |
| R320.6 | **The claymore and the PMN show the meter's empty frame; the C4 and the satchel show nothing; the Detonator shows the sidearm's set at a size that falls to 0** | the page draws the firearm's reticle with each | 5 |
| R320.7 | **The yellow arc is research 85 section 11's, confirmed**: the player controller's draw `FUN_005970b0`, from the press to the let-go, a hand grenade (class 0x79) only, under view 4. Added: its gate does not test the floor, so it is drawn in the air; over a running jump (`+0x174` 6) `GetThrowAnim` writes no row (D:L441875-441877) and the draw ignores that, so the arc's start in the air is unread | the page's arc matches on the floor (pinned); in the air it draws the floor's row | 6 |
| R320.8 | **The room draws nothing**: the meter and the arc are the page's | -- | 7 |

## 1. Which reticle a throwable gets

- **The choice** (`FUN_005be300`, D:L474896-474951; research 84 section 9 read it first, re-read here whole): the 9x view
  (state 4) gives set 7; a magnification over 1.01 set 5; a fitted launcher set 3 (or 1); then the item's id: 0x0b 9,
  4-30 0, 31-80 1, 81-90 2, 91-120 1, **121-140 4**, 141-150 none, **151-189 4 except 0x97 and 0x98** (D:L474926-474928,
  none), 190-253 0, else none. A throwable's record has `NumZoomModes 1` (research 84 section 7), so its state 5 index is
  past the count and the magnification stays 1 (D:L474917-474921): a grenade never gets the scope's set. Over the
  goldens' ids (`arsenal-items.json`): set 4 for the M67 121, AN-M8 122, Mark141 123, HE 126, RED SMOKE GRENADE 127,
  BLUE CHEM LIGHT 128; the claymore 153, MPBOMB 154, PMN Mine 158 and the class's other ids (155-159, the launcher and
  rocket rounds 171-186, which are never the hand's item); none for the C4 151 and the satchel 152; set 0 for the gear
  190-200 (the Detonator 193).
- **When it changes**: the kit keeps the set at `kit+0x54`; the switch (`FUN_005c4b10`) asks `FUN_005be300` again as
  soon as it has written the new item (D:L478907-478912, and D:L478805-478811 for the same slot), and marks the change
  (kit byte 0 bit 1); the HUD's reticle frame takes a marked change (`FUN_005be5f0`, D:L475036-475047) and lays the new
  set by `ChangeReticule` (`FUN_00213e20`) from `FUN_00216770` (D:L70391-70411). The same switch clears the wind-up bit
  and zeroes the power (D:L478914-478915, `FUN_00592d40`), research 85 section 11's "a weapon switch clears bit 6".
- **While dead** the frame lays -1 (D:L70413): nothing, the meter included (research 321 section 1; the port's
  `reticleShown`).

## 2. The meter's shape, size and colour

`ChangeReticule` (`FUN_00213e20`, D:L69260-69678) takes a set only if its fixed bitmap loaded (D:L69279). For set 4:

- **The bitmaps** (`BitmapReticule_Init`, `FUN_002178c0`, D:L70828-70870): set 4's fixed part `hud+0x44cc` is
  `ret_grenade_02.tif` (D:L70836-70837); its floating slot `hud+0x44f8` is 0 (D:L70856); `ret_grenade_01.tif` is loaded
  apart, at `hud+0x4514` (D:L70867-70868). The floating size falls back to the fixed bitmap's (D:L69298-69309), and set
  4 halves its width into `hud+0x4534` (D:L69310-69312), which only the damage-direction marks read (research 321
  section 2.6).
- **What it hides at the change** (D:L69389-69431): the ring and dot `hud+0x70`, the target's name `+0x4544` and its
  health bar `+0x45e0` (D:L69411-69413), the four arms `+0x2930..` (D:L69321-69327), the scope's and the tube's quads `+0xa30..`,
  `+0x11f0..` (D:L69414-69422); the two quads `+0xf0` and `+0x170` too (D:L69397-69398, and again each frame at
  D:L69238-69239) -- an alternative layout (a right half of the frame over the fill) that is laid and never shown.
- **The name and the bar come back** (the review, F1; the bullet above said "What it hides" without "at the change"):
  `ChangeReticule` hides `+0x4544` and `+0x45e0` once, at the change; the colour pass `FUN_00215c10` runs every frame
  for every set (from `FUN_00216770`, D:L70464), and its target logic (D:L70094-70219) has no set-4 test (it tests set 5 alone, for the range at D:L70097 and the
  offset at D:L70201; the re-review, item 2; was: "has no set test") -- over a target it
  shows the name (D:L70212) and, for a teammate or the flagged kind, the bar (D:L70218). The aim ray that finds the
  target (`FUN_005aa6e0`) runs from the camera's update `FUN_002998f0` (D:L142026-142028) with no item test. So with an
  M67 up and a teammate 200 units off under the centre, the original shows his 60 x 5 bar (and his name online, `" "`
  offline) at `(cx + W/2, cy - H/2)` and 15 above it, `W` and `H` here `ret_grenade_02`'s (the floating size's fallback,
  D:L69298-69309): `(cx + 32, cy - H/2)` with `W` = 64, the capture's evidence, and `H` unread
  (`GRENADE_METER_BITMAP_READING`; the capture's figure spans about 50 pixels across) (the re-review, item 1; was:
  "`(cx + 32, cy - 32)` on a 64 bitmap"). Research 321 section 4.2 holds the rule. The colours that pass
  picks land on the hidden arms (D:L70274-70277; the C4's branch aside), so the meter's colours stay its own.
- **What it shows**: four quads, `+0x270`, `+0x460`, `+0x650`, `+0x840` (D:L69399-69402), and the damage-direction marks
  (D:L69419). Their geometry is `FUN_00213a60(power)` (D:L69177-69255), with `W` and `H` the frame bitmap's width and
  height (`ret_grenade_02`'s texture record, D:L69198-69201) and `(cx, cy)` the reticle's centre (`hud+0x44ac/+0x44b0`):
  - **the frame**, `ret_grenade_02` twice: `+0x650` from `cy - W/2` to `cy`, `+0x840` from `cy + W/2` to `cy`, both
    `cx - H/2` to `cx + H/2`, the whole texture each (D:L69222-69237) -- the bitmap squeezed into half the height and
    mirrored about the centre line, its decoded first row on the line and its last at the outer edge: the line is the
    texture's v 1, and v 1 holds the decoded first row (NU-2's review, finding 1: "The bitmaps, read" below,
    `GRENADE_METER_BITMAP_READING`; was, at the build: "as the recompilation's frame shows it"; and before it: "its last
    row on the line", the texture's v read as the decoded row);
  - **the fill**, `ret_grenade_01`: `+0x270` from `cy` up to `cy - power x W/2`, `+0x460` from `cy` down to
    `cy + power x W/2`, the same width, sampled from the row `1 - power` to the last (D:L69206-69221) -- the fill's
    texture at the frame's density, uncovered from the centre line outward as the power rises (NU-2: the texture's v
    from `1 - power` at the outer edge to 1 on the line; laid as the frame is, the decoded rows 0 to `power` from the
    line out, `GRENADE_METER_BITMAP_READING`).
  So the meter is a bar `H` wide and `W` tall about the reticle's centre, empty at power 0 and full at 1.
- **The colours and alphas** (the GS's vertex colour, 128 = 1): the fill (128, 70, 32) -- `DAT_0040c0f0..f8` set once
  to 0x43000000, 0x428c0000, 0x42000000 on the first set-4 change (D:L69390-69395, D:L69403-69404; nothing else writes
  them) -- an orange; the frame (200, 200, 0) (0x43480000 twice and 0, D:L69405-69406) -- the rifle's yellow without its
  blue. Alphas: the fill `DAT_003dc608` 64, the frame `DAT_003dc600` 36 (D:L69407-69410). The reticle's colour pass
  (`FUN_00215c10`) recolours these four only for the C4's item id (D:L70073-70091, D:L70267-70272), which draws no set
  (section 5): a grenade's meter keeps these colours, whatever is under it (no green, red or grey).
- **On the recompilation's frame** (h00, the M67 in hand, power 0; section 9): a dim yellow figure about (320, 224) --
  rungs across x 295-344 at y 192 and 255, narrowing toward the centre (x 304-336 at y 198, 309-330 at 203, 313-326 at
  208, 316-323 at 213 and their mirrors at 234-249), a short vertical bar x 318-321 at y 213-219 and 228-234, two
  horizontal bars x 300-312 and 327-339 at y 223-224; peak about (100-106, 101-109, 43-53) over a background of 16-70.
  The figure is 64 rows tall and mirrored about y 224, as the reading's frame of `W` = 64 would be; the HE's frame
  (l01) shows the same figure. No fill shows (power 0). The bitmap's own size and texels are owed to a reader run
  (section 8.2) (NU-2: read, next bullet).
- **The bitmaps, read** (NU-2, 2026-10-14; `readReticle` over `HUD2_TXR.ZED` / `HUD2_PAL.ZED` of the fixtures' MP2, MP6
  and MP72, `hudBitmaps.test.ts`, a dev-disc test): `ret_grenade_02` (the frame) and `ret_grenade_01` (the fill) are
  **64 x 64** on all three, 1356 and 1036 texels inked, both mirror-symmetric across (alpha exactly, an inked texel's grey
  within 4), so `W` = `H` = 64 and the side the columns run from does not show. The frame's decoded rows: rows 0-1 two
  bars (columns 12-24, 39-51) and the stem's foot (30-33), the stem rows 7-21, rungs at rows 20-21, 30-31, 40-41,
  50-51 and 61-63 widening to columns 4-59; the fill is the same wedge, filled. Laid with the **first decoded row on
  the centre line**, the frame covers section 2's figure on h00 rung by rung within two pixels (the bars at y 223-224,
  the stem at 213-219, the rungs at 213, 208, 203, 198 and 192, and their mirrors); laid the other way up it would put
  the widest rungs on the centre line and the bars at 192 and 255. **The code gives the same** (NU-2's review, finding
  1): the meter's UVs put v 0 at the outer edge and v 1 on the line (`FUN_003591d0` D:L254975-254983 over
  `FUN_00359590` D:L255114-255123), and the rifle's arms calibrate the GS's v against the decoded rows -- `FUN_00215250`'s set-1 branch lays the top arm `+0x2b20` as `FUN_00359490` gives it (D:L69829-69831) and the bottom arm `+0x2f00` with `FUN_00358e20`'s swap of its positions (D:L69838-69840, D:L254860-254891), both with v 0 at their outer end, and the console frame shows each arm bright at its outer end (`reticle.ts`'s header) where the decoded arm is white at row 30 (`hudBitmaps.test.ts`), so v 0 holds the decoded last rows (`FUN_00361000` stores v negated, D:L259761-259774) -- so the decoded first row lies on the line. That is the reading;
  h00 is a third source that agrees, not the deciding one (`GRENADE_METER_BITMAP_READING`, section 8.4). The same read
  mirrors u (u 0 at the right edge): real, and invisible on these bitmaps -- their alpha is mirror-symmetric and their
  grey differs by 4 at most. (Was: "The UVs read off the code -- `FUN_003591d0`'s pairs (D:L254977-254983) against
  `FUN_00359590`'s second triangle (D:L255116-255123; its first is cut short in the decompilation): v 0 at the outer
  edge, 1 on the line -- would put the decoded last row on the line if v 0 were the decoded first row. The page lays
  the rows as the frame shows them; which is the GS's own row order is `GRENADE_METER_BITMAP_READING` (section 8.4). The
  same reading puts u 0 at the right edge, which these symmetric bitmaps do not show" -- it took v for the decoded row
  index, which the arms show it is not.)

## 3. Where it sits

- **No size, no move.** The reticle frame (`FUN_00216770`) lays the size and the centre and runs the layout only when
  the set is not 4 (D:L70415-70434): under set 4 it clears kit byte 0 bit 3 (the blocked-muzzle mark) and does nothing
  else. So `hud+0x44ac/+0x44b0` keep the value the last firearm frame wrote -- `(320 + kit+0x18 + kit+0x20, 224 +
  kit+0x1c + kit+0x24)` (D:L70421-70424), the knock's offset in it (research 84 section 4) -- and the meter never
  climbs, blooms or halves in third person. At rest (Init's (320, 224), D:L71139-71140, and a returned knock) it is the
  frame's centre: the capture's figure is centred at x 319.5-320, y 224.
- **The corner case**: a grenade taken while the firearm's knock is up keeps the meter at the centre the last firearm
  frame left (the knock returns at `ReticuleKnockReturn` while the firearm is still drawn through the swap's first part;
  how much is left at the switch's write is unread, `GRENADE_METER_CENTRE_READING`).
- **The pip** (the blocked-muzzle mark `ret_accuracy`): faded out 32 a frame under set 4 (D:L70435-70445). The aim ray
  still marks a blocked muzzle with a grenade up -- its write of kit byte 0 bit 3 (D:L464335-464341) tests no set -- but
  the reticle frame clears that bit under set 4 (D:L70415-70417) before the colour pass reads it (D:L70464), so neither
  the pip nor the blocked-muzzle grey shows (the review, F2; was: "and the aim ray computes no blocked muzzle while the
  set is 4 (`FUN_005aa6e0`'s test of `FUN_005be560`, D:L464203)" -- that test gates the offline aim at an identified
  target, D:L464202-464256, not the blocked muzzle).

## 4. What it does: the power, the aim, the stance

- **The power.** The HUD frame (`FUN_001f7ff0`, D:L56673-56688), for the HUD's body (`DAT_00415ff0 + 0xbc`): when
  `FUN_005b8760(kit)` is 3 -- the item's class (`FUN_003d1a60`) is 0x79, the hand grenades, or 0x97, the placed charges
  (D:L471609-471644; research 85 section 9.2) -- it calls `FUN_00213a60` with the controller's power `ctrl+0x11c`, or 0
  when `FUN_005c3890(kit)` -- the rounds left in the hand's current magazine, here the throwables left (research 84
  section 18's `m_reloads` layout, `FUN_005c3890` D:L477877-477998, the read at D:L477910-477911) -- is under 1. `FUN_00213a60` itself acts only under set 4
  (D:L69189). The test `(id < 400 || ...)` at D:L56676-56677 is always true for a byte.
- **The power's life** (research 85 section 2; research 251 section 12.8): 0 at rest; on the press of a hand grenade
  with one left, the wind-up bit and the chase -- 3/s toward the pressure rising, 1.5/s falling -- so the fill rises as
  `1 - 0.95^n` a 60 Hz frame on a digital button (0.54 at 0.25 s, 0.78 at 0.5 s, 0.95 at 1 s); at the release the power
  is kept, so **the fill holds at the throw's power through the throw clip**; when the release bit is set and no throw is
  on top the controller clears both bits and **zeroes the power** (D:L453483-453489): the meter empties. A short tap
  refused, a release refused in the air (research 251 section 12.8) and a swap zero it too.
- **Mounted** (TURRET-RETICLE, 2026-10-17; research 215 s8.2; reading, pending review): the mount takes the turret's slot up
  through the switch (`FUN_005c4b10`, D:L412218), which zeroes the power (D:L478914-478915) and asks the turret's set, 0:
  no meter while mounted, whatever throwable was up. The page lays none (`./matchFirearm` `aimReticle`, the meter at 0).
- **The aim** moves nothing on the meter (no aim term in `FUN_00213a60`); the aim lifts and turns the arc (section 6).
- **The stance** moves nothing on the meter either (no stance term; no size read). It changes the arc's row and the
  farthest distance: the standing or crouched, still or moving, prone and peek rows of `GetThrowAnim`, 600 standing
  and 300 otherwise (research 85 sections 3, 4; `FUN_005970b0` picks `+0x19c` in state 0, else `+0x1a0`, D:L454103-454110).

## 5. Grenade, flash, smoke, the toss, and the other items

- **The four hand grenades of the kits** (M67, HE, AN-M8 smoke, Mark141 flash) are class 0x79 (research 85 section
  9.2): one set (4), one meter, one power, one arc. Nothing in `ChangeReticule`, `FUN_00213a60` or `FUN_00215c10` reads
  which of them is up. The red smoke (127) and the chem light (128) are the same class (in no multiplayer kit).
- **The toss** is not a reticle state: `GetThrowAnim` picks it when the power is under `toss_power_threshold` 0.6 and
  the aim's sine under `toss_aim_threshold` 0.3 (research 85 section 3.1). On the meter it is only a fill under 60 %; on
  the arc, the toss's row (its table point, its clip) -- research 85 section 11 draws the arc from that row.
- **The claymore and the PMN** (153, 158; class 0x97, set 4): the frame alone -- the power is never chased for them (the
  wind-up bit is the hand grenades', research 85 section 11), so the fill stays at 0. **The C4 and the satchel** (151,
  152): no set (D:L474926-474928): no reticle at all, while `FUN_00215c10` keeps a C4 branch that colours the meter's four
  quads by the C4's target (D:L70073-70091) -- quads set -1 never shows. What the player sees with C4 up is
  `C4_RETICLE_READING` (section 8.2). **The Detonator** (193, class 0xbe): set 0, the sidearm's ring and arms, its size
  clamped to 0 by its class (`FUN_005c2670` D:L477282-477288: classes 0x97, 0x79, 0xbe, 0xc9 take min and max 0) -- the
  arms closing to their rest at the item record's `TargetConstrict`.

## 6. The yellow arc (`FUN_005970b0`)

- **What it is**: research 85 section 11, re-read at its gate and its call here and confirmed: the player controller's
  per-frame draw (vtable slot, `DAT_003df1b0` the player-control gate), shown while the controller's `+0x170` bit 6 is
  set and bit 7 clear and the view is under 4 (D:L454091-454101), the throw the release would make now from
  `GetThrowAnim`'s table point at the power of the frame (D:L454102-454125), 100 steps of the analytic parabola from
  t = -1 s to twice the fall to the feet, (0.78, 0.78, 0) fading from alpha 0.75 to 0.1, (1, 1, 0.8) in the night
  vision; no hull, no bounce, no marker. It is the throw's preview in the world; the meter is the power on the HUD; both
  show together through a wind-up.
- **In the air** (research 251 section 12.8's open item): the gate tests no floor, and the wind-up bit stays set through
  a jump (research 251 section 12.8: a held button sets it again in the air), so the original draws the arc in the air.
  Its row: `GetThrowAnim` answers by the body's state `+0x174` (D:L441773-441877) -- 3 peek, 2 prone, 1 crouch, 0
  stand -- and for any other state returns 0 and writes neither the clip nor the table point (D:L441875-441877); the arc's
  draw does not test the answer (D:L454111) and goes on with the stack's unwritten point. Over a running jump the state
  is 6 (`Jump launch`, research 251 section 12.8), so the arc's start there is unread (`ARC_IN_AIR_READING`); a walk-off
  keeps the state and draws its row. The farthest distance is the 300 of a state other than 0 (D:L454103-454110).
- **The port** (`@s2u/scene` `throwArc.ts`, `grenade.ts` `drawArc`): the same gate but the air (the walk's stance, the
  floor's row in the air), the same launch, the same strip -- matching on the floor and pinned (section 8.3).
  `ARC_DEPTH_TEST_PLACEHOLDER` (the translucent line list's Z test) stays as research 85 section 11 filed it.

## 7. The port, against it

The room draws no HUD; everything here is the page's.

- **`reticle.ts`** holds set 4 in `reticleType` (ids 121-140 and 151-189 but 151/152, `sights.test.ts` line 72) and
  `RETICLE_SETS[4] = { fixed: 'ret_grenade_02.tif', floating: null }`, and `hudBitmaps.ts` decodes both grenade bitmaps
  with every map. But `Reticle.setSet` returns early for a set with no floating bitmap and keeps the drawn set ("a set
  with no arms (the grenade's, the scope's) keeps the drawn ones -- those have their own draws"), and no meter draw
  exists.
- **`matchFirearm.ts` `aimReticle`** asks `reticleType(fire.weaponRecord().id, ...)` -- the kit's firearm, which a
  throwable never replaces (the throwables are `matchThrow.ts`'s hands, `itemUp: () => grenade.equipped()`). So with a
  grenade up the page draws **the last firearm's ring and arms, at that firearm's bloom and knock, in its colours**.
  It also keeps the blocked-muzzle pip off with an item up (`!item`), as the original does under set 4.
- **`matchThrow.ts` / `grenade.ts`** hold the power (`GrenadeThrower` `power`, `stats().power`) and its chase as research
  85 section 2 and research 251 section 12.8 read them, and the arc (section 6). Nothing hands the power to the
  reticle.
- **`hud.ts`** draws no reticle (research 87 row 1.15); with a throwable up it hides the fire-mode row
  (`HudModel.fireModeRow`, `FUN_005bc300`), as the capture's h00 shows -- matching, pinned by `hud.test.ts`.

**The differences**, and the frame each shows on:

| # | difference | the frame it shows on |
|---|---|---|
| D1 | A thrown grenade up: the page draws the firearm's ring and arms; the original hides them and draws the meter's frame | any frame with an M67, HE, AN-M8 or Mark141 in hand (the capture's h00 and l01) |
| D2 | No fill: the original's `ret_grenade_01` rises from the centre with the power, holds through the throw, and empties when the controller clears it | a wind-up (R1 held), the throw clip after the release |
| D3 | The page's reticle under a grenade blooms with the walk and the look, climbs with no shot, halves in third person and takes the firearm's colours; the meter does none of it | a grenade up while walking or turning, or aimed at a teammate |
| D4 | The claymore and the PMN up: the page draws the firearm's reticle, the original the empty frame; the C4 and the satchel: the page the firearm's, the original none; the Detonator: the page the firearm's, the original the sidearm's set closing to size 0 | those items up |
| D5 | The arc over a running jump: the page draws the floor's row, the original an unwritten row (`ARC_IN_AIR_READING`) | a wind-up held through a running jump |
| D6 | A target under the centre with a grenade up: the original shows the name and, for a teammate, the 60 x 5 health bar beside the meter, at `ret_grenade_02`'s `(cx + W/2, cy - H/2)` (the review, F1); the page shows no name and no bar under any set (research 321 D4). Built, NU-3b G4 (2026-10-15): the name at `ret_grenade_02`'s `(cx + W/2, cy - H/2)` about the meter's centre, the bar 15 above it once its health is known (research 321's `TARGET_HEALTH_PLACEHOLDER`) | a grenade up, a teammate or an identified enemy within 320 units under the centre |
| D7 | (Found at the NU-2 build, 2026-10-14; source inspection.) The power's clear: the page's `GrenadeThrower.letGo` zeroes `power` at the hand-open (`grenade.ts`, the release's `this.power = 0`), so a meter fed from `stats().power` empties there; the original keeps `ctrl+0x11c` through the clip and zeroes it when the release bit is set and `FUN_005a7d10` finds no throw (D:L453483-453489, section 4) -- the meter holds to the clip's end. **Built** (NU-2, widened, 2026-10-14): `letGo` keeps the power, `finishThrow` -- the clip's end, or a cut after the hand opened (the page's "no throw on top") -- clears it, and a hand-open with no body clears it too; `grenade.test.ts` ("NU-2 D7"). **Owed** (NU-2's review, finding 4; PAR-19 D08's pending clock): a knock between the release request and the hand-open pops the clip, yet `letGo` still fires on its clock and the power then holds until `recover` runs out, where the original zeroes it on the first floor frame with no throw on top (D:L453483-453489). (Was: "`finishThrow` -- the clip's end or its cut, the page's "no throw on top" -- clears it".) Nothing else reads the power once the throw is under way (the chase, the release request and the arc read it only while held; `throwInAir`, `matchThrow`, `throwSound` and the replay read none). (Was: "`grenade.ts`, not NU-2's files: owed".) | the throw clip after the hand opens |

## 8. The build list

### 8.1 Rows for the build brief (RED first; the page only)

| row | change | the test that shows it (RED first) |
|---|---|---|
| G1 (D1, D4) | The reticle's set from the hand's item, not the kit's firearm: `aimReticle` asks `reticleType` for the throwable's, the charge's or the Detonator's id while one is up (`matchThrow` hands the id); set -1 draws nothing; the Detonator's set 0 at the class's size 0 (`Accuracy` given min and max 0 for classes 0x79, 0x97, 0xbe, 0xc9, as `FUN_005c2670` D:L477282-477288) | `reticle.test.ts` / `matchFirearm` hook test: an M67 up -- RED: `reticle().type` 1 (the rifle's); GREEN: 4. The C4 up: -1, nothing drawn. The Detonator: 0, the size falling to 0 |
| G2 (D1, D2) | A meter draw in `Reticle` for set 4 (`meterLayout(frame, centre, power, bitmaps)`): the frame bitmap twice (top and its mirror), the fill bitmap twice from the centre line out to `power x W/2`, sampled from row `1 - power`; colours (200, 200, 0) at alpha 36/128 and (128, 70, 32) at 64/128, as GS vertex colours over the texels by the page's one conversion (research 321 section 4); no ring, no arms, no pip | `reticle.test.ts`: `meterLayout` at 640x448, power 0, 0.5, 1 -- RED: no such layout; GREEN: the quads' rectangles (the fill's half height 0, W/4, W/2) and their UV rows. Then a scaled frame (the Modern presentation) |
| G3 (D2, D3) | The power fed each frame (`grenade.stats().power`, 0 when none left), held through the throw and emptied when the thrower clears it; no size, no knock, no halving under set 4; the meter at the centre as the last reticle frame left it | a hook test over a wind-up: RED: the meter's fill height 0 throughout; GREEN: 0 at the press, rising as `1 - 0.95^n`, held at the release's value through the clip, 0 after. Under a walk and a turn: the meter's rectangle unchanged |
| G4 (D3, D6) | The meter's own colours unchanged under set 4 (the colour pass lands on the hidden arms); the name and the bar shown as `FUN_00215c10` lays them, at `ret_grenade_02`'s `(cx + W/2, cy - H/2)` (the review, F1; was: "No target colour, name or health bar under set 4: the meter's colours are the set's own") | with research 321's C4: a teammate at 200 units under the centre with an M67 up -- RED: no name, no bar; GREEN: the bar at the teammate's health, handed `(cx + W/2, cy - H/2 - 15)` with `ret_grenade_02`'s `W` and `H` from the served bitmap (`FUN_00241ca0`), the name online at `(cx + W/2, cy - H/2)`, the meter's colours unchanged (the re-review, items 1 and 3; was: "with research 321's C4: a teammate at 200 units under the centre with an M67 up -- RED: no name, no bar; GREEN: the bar at the teammate's health, handed `(cx + 32, cy - 47)` on a 64 bitmap (`FUN_00241ca0`), the name online, the meter's colours unchanged", itself rewritten by F1 from "with research 321's colour build: a teammate under the reticle with a grenade up -- the meter's colours unchanged") |
| G5 (D5) | After `ARC_IN_AIR_READING` is settled, not before | -- |

A dev-disc test owed with G2: the two bitmaps' sizes and the frame's rows from the served archive (`hudBitmaps.test.ts`,
the fixture tier), so the layout's `W` and `H` are the bitmap's, not 64 by hand. (NU-2: written; section 2, "The
bitmaps, read".)

**The build, NU-2 (2026-10-14; reading, pending review).**
- **G1, built in part.** `handReticleType(item, firearm, state, magnification, mode)` (`reticle.ts`) is `FUN_005be300`
  asked with the hand's item (its magnification 1); `Reticle.setSet` takes 4 (the meter, when the map served both
  bitmaps), -1 (nothing drawn, `C4_RETICLE_READING`) and the Detonator's 0 (the sidearm's ring and arms), and gives the
  firearm's set back from either. **Wired** (the brief widened the same day): `FirearmHands.handItem` -- in
  `matchThrow.ts`'s `hands`, the held item's record `ID`, else the arsenal table's, the Detonator 193 with no table
  read (`arsenal-items.json`, section 1) -- and `aimReticle` asks `handReticleType` with it each frame
  (`matchFirearm.test.ts`, `matchThrow.test.ts`). (Was: "**Owed:** `aimReticle` still asks `reticleType` for the kit's
  firearm, because nothing hands it the hand's item: `FirearmHands` (`matchFirearm.ts`, outside `aimReticle`) and
  `matchThrow.ts`'s `hands` were outside the brief's files".) **Still owed:** the Detonator's size falling to 0
  (`Accuracy` given min and max 0 for the classes 0x79, 0x97, 0xbe, 0xc9, `FUN_005c2670` D:L477282-477288) is
  `accuracy.ts`'s, outside the brief: the Detonator draws the sidearm's ring and arms at the firearm's size today. The
  C4 with neither the disc's records nor the arsenal table read has no id to hand (`handItem` null): the firearm's
  set then, as before.
  **A difference, owed (NU-2's review, finding 3; research 321 D3's family; not built):** `FUN_005c2670`
  (D:L477282-477288) sets the size's min and max to 0 for the classes 0x79 and 0x97 too, not only the Detonator's
  0xbe -- so with a grenade or a charge up the original's size closes toward 0, and the swap back lifts it from there to
  the firearm's `TargetMin`. The page keeps blooming the firearm's own record under the meter, so the rifle shows wider
  after a grenade than the original's.
  **Named, not built (NU-2's review, finding 5; marginal):** with a grenade up the 9x view's set 7 is refused by the
  page's `Reticle.setSet` (its draw is the binoculars' own), so the drawn set stays 4 and the meter's centre is never
  laid again; the original takes set 7 and lays the centre again, the knock in it (`FUN_00216770` D:L70418-70424), so
  the meter comes back at the new centre after the binoculars.
- **G2, built.** `meterLayout(frame, centre, power, bitmap)` and the four meshes in `Reticle`, in their colours
  (`meterTint`); `W` and `H` from the served `ret_grenade_02`.
- **G3, built in part.** `meterPower(power, left)` and `Reticle.setMeter`; under set 4 no size, no knock, no move: the
  meter stays at the centre the last frame of another set laid (`GRENADE_METER_CENTRE_READING`), the pip fades.
  **Wired:** `FirearmHands.throwPower` (`matchThrow.ts`: `meterPower(stats().power, stats().left)`, 0 with nothing up)
  fed to `Reticle.setMeter` by `aimReticle` each frame; with D7 built the fill holds the release's power to the clip's
  end (`matchFirearm.test.ts`: set 4 with the grenade up, the fill on the thrower's power over a throw, the firearm's
  set 1 again after). (Was: "**Owed:** the feed each frame from `grenade.stats()` (the same wiring as G1's), and D7 (the
  thrower's clear at the hand-open)".)
- **G4 and G5, owed** (named, not built): G4 goes with research 321's colour build (its C4; the name and the bar at
  `ret_grenade_02`'s `(cx + W/2, cy - H/2)`, now `(cx + 32, cy - 32)` with the served 64 x 64); G5 waits on
  `ARC_IN_AIR_READING`.
- **G4, built** (NU-3b, 2026-10-15; reading, pending review): research 321's C4 build lays the target's name under every
  set, set 4 among them -- `Reticle`'s `targetDrawn` takes the served `ret_grenade_02`'s `W` and `H` about the meter's
  centre (`GRENADE_METER_CENTRE_READING`), so the name's pen is `(cx + 32, cy - 32)` and the bar's corner 15 above it;
  the colour pass lands on the hidden arms, the meter's four quads keep `meterTint` (`reticle.test.ts`,
  `matchFirearm.test.ts` "NU-3b G4"). The bar is drawn only with a known health (`TARGET_HEALTH_PLACEHOLDER`: none on
  the wire). G5 still waits on `ARC_IN_AIR_READING`.

### 8.2 The unknowns, as candidate constants (for the ledger at the build; none added now)

(NU-2, 2026-10-14: the four its build consumes are filed in section 8.4 and in research 101; `ARC_IN_AIR_READING` and
`GRENADE_METER_SPECTATED_READING` stay candidates here.)

| candidate | stands for | the evidence that settles it |
|---|---|---|
| `GRENADE_METER_BITMAP_READING` | `ret_grenade_02`'s and `ret_grenade_01`'s sizes and texels (the meter's `W`, `H`, rows); the capture's 64-row figure is consistent with a 64-texel width | a reader run: `hudBitmaps`' decode of `HUD2_TXR` on a served map (owed, the brief forbade it here); then the capture's h00 against the drawn frame |
| `GRENADE_METER_COLOUR_READING` | the GS vertex colours (200, 200, 0) at 36 and (128, 70, 32) at 64 turned into the page's colours by the one conversion `reticleTint` uses (a measured scale for the rifle's yellow) | the capture's h00 (the frame at power 0, measured above: about (100-106, 101-109, 43-53) over 16-70) and a capture of a wind-up for the fill |
| `GRENADE_METER_CENTRE_READING` | the meter's place when a grenade is taken with the firearm's knock up: the centre the last firearm frame wrote | a capture: fire a burst, swap to the M67 at once, the meter's place over the first frames |
| `ARC_IN_AIR_READING` | the arc over a running jump: `GetThrowAnim` writes no row in state 6 and the draw takes the stack's point | a recomp trace of the arc's first point (`fStack_40..` at D:L454111) over a jump with R1 held; or a capture of the arc mid-jump |
| `C4_RETICLE_READING` | the C4 and the satchel up: no set (D:L474926-474928), while `FUN_00215c10` colours the meter's quads for the C4 | a capture with C4 in hand, at and off a plantable target |
| `GRENADE_METER_SPECTATED_READING` | a followed player's meter: the HUD frame reads the HUD's body's controller power (`DAT_00415ff0 + 0xbc`), which a remote body's controller may not carry | a capture spectating a teammate's wind-up (research 282's spectator HUD) |

Every wind-up and placing question above is settled by one capture session: the HUD with each throwable and the
claymore readied, moved, wound up and thrown, standing, crouched and prone, and one over a running jump.

### 8.3 Where the port matches: the pins (NU.R3)

- **The arc on the floor**: `packages/scene/test/throwArc.test.ts` (the 100 steps, the fall's root, the alpha, the
  flight on it) and `packages/viewer/test/grenade.test.ts`'s "the yellow arc while the throw is held (FUN_005970b0,
  research 85 section 11)" (from the press, the power, gone at the let-go, the colours, the night's) -- held.
- **The throw's row by stance and the toss**: `packages/scene/test/projectile.test.ts` ("tosses under power 0.6 with the
  aim's sine under 0.3 ...") -- held.
- **The set's id ranges**: `packages/viewer/test/sights.test.ts` (line 72: 121, 175, 153 -> 4) and `reticle.test.ts`
  ("picks the set by the view, then the weapon ID") -- held for `reticleType`; the gap is its caller (G1).
- **The fire-mode row hidden with a throwable**: `packages/viewer/test/hud.test.ts` -- held.
- **No reticle while dead**: `reticle.test.ts`'s `reticleShown` -- held.

### 8.4 Readings and placeholders (NU-2's build)

Filed 2026-10-14 by NU-2 (`packages/viewer/src/reticle.ts`); reading, pending review. Research 101 holds their rows.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `GRENADE_METER_BITMAP_READING` | which way up the meter's decoded rows lie (its capture settles the threat marks' wedges too: research 321 §7.6 `THREAT_QUAD_ORIENTATION_READING`, 2026-11-09): the decoded first row on the centre line, read off the code -- the line is v 1 and the rifle's arms, against the console frame, show v 0 holds the decoded last rows -- with the recompilation's frame h00 a third, agreeing source (section 2, "The bitmaps, read"; NU-2's review, finding 1; was: "the frame's code read (v 0 at the outer edge) against the recompilation's frame h00"); the sizes are read (64 x 64, served) | `'first row on the centre line'` (`meterLayout`'s rows) | a console capture of the meter (h00's shot on the console), or the GS's texture row order for a HUD sprite traced |
| `GRENADE_METER_COLOUR_READING` | the meter's GS vertex colours (200, 200, 0) at 36 and (128, 70, 32) at 64 (read, section 2) turned into the page's tint by `reticleTint`'s one scale (`meterTint`) | `{ frame: { rgb: [200, 200, 0], alpha: 36 }, fill: { rgb: [128, 70, 32], alpha: 64 } }` | the capture's h00 (the frame at power 0, about (100-106, 101-109, 43-53) over 16-70) scored against the page's draw; a capture of a wind-up for the fill |
| `GRENADE_METER_CENTRE_READING` | the meter's place when a throwable is taken with the firearm's knock up: the centre the last frame of another set laid (section 3) | `'the last firearm frame\'s'` (`Reticle`'s `laid`) | a capture: a burst, the M67 taken at once, the meter's place over the first frames |
| `C4_RETICLE_READING` | the C4 and the satchel up: no set (D:L474926-474928), nothing drawn, though `FUN_00215c10` colours the meter's quads for the C4 (section 5) | `'nothing'` (`Reticle` under set -1) | a capture with C4 in hand, at and off a plantable target |

## 9. Evidence, apart

- **Source inspection** (the decompilation at the pinned bytes; the ELF's strings and `.data`): every section's
  finding. Reading, pending review.
- **The committed goldens** (`throwables.json`, `arsenal-items.json`): the ids and classes of section 1. Read, not run.
- **A frame of the recompilation** (h00, l01; research 212 section 11's capture, `socom_pc` 60d2dad6; not in the tree):
  section 2's figure, read pixel by pixel by a scratch decoder. Consistent with the reading; not scored by the harness,
  not a capture of the console; it raises nothing to proven. No frame of a wind-up or of the fill exists.
- **The port's code**, read: section 7. No unit test, dev-disc test, browser run or playtest was run for this note.
- **NU-2's build** (2026-10-14), kept apart: unit tests (`reticle.test.ts`: G1's table, G2's layout and draw, G3's
  centre, pip and a throw driven through `GrenadeThrower`) and a dev-disc test over the fixtures' MP2, MP6 and MP72
  (`hudBitmaps.test.ts`: the sizes, the symmetry, the frame against h00's figure). No browser run, no playtest, no
  capture comparison. (Was: "the page does not yet hand `aimReticle` the hand's item (section 8.1), so no page draws the
  meter"; the wiring is now built and unit-tested -- `matchFirearm.test.ts`, `matchThrow.test.ts`, `grenade.test.ts`'s
  D7 -- but no rendered browser run has shown it.)
