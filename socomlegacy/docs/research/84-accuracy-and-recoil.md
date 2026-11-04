# 84 — Accuracy and recoil: the reticle's size, its climb, the cone, the fire modes, the zoom and the scope (2026-09-28)

The ACCURACY & RECOIL workstream of the walk mode (the owner: "1:1 movement, animations, recoil -- the feel of SOCOM 2
is the most important"). Everything below is read off the SOCOM II disc and its game ELF: `RUN/ZWEAPON.ZAR`'s
`zweapon.rdr`, `READERC.ZAR`'s `controller.rdr`, `HUD2_TXR.ZED`'s bitmaps, and `socom2_game.elf` -- its Ghidra
decompilation `game/analysis/socom2_game.elf.decomp.c` (cited `decomp:line`), the recompiler's per-instruction
listing (`recomp/output/*_0x<addr>.cpp`) and, where the decompiler lost a switch or an argument, the ELF's own words
disassembled (jump tables at 0x65c320, 0x65c360, 0x65c3b0). No game run, no PCSX2. The code is `@s2u/scene`'s
`weapons.ts` (the record), `viewer/src/accuracy.ts` (the model), `viewer/src/zoom.ts` (the views), `viewer/src/reticle.ts`
(the HUD) and `viewer/src/fire.ts` (the round), tested by `scene/test/weapons.test.ts`, `viewer/test/accuracy.test.ts`,
`zoom.test.ts`, `reticle.test.ts`, `fire.test.ts` and `e2e/accuracy.spec.ts`.

The soldier's kit (`CZKit`, reCOM `zSeal/zseal.h:200-260`) lives at SEAL body `+0x5e0`; its fields line up with
reCOM's order from `+0x18`: `m_retposx/y` +0x18/+0x1c, `m_retoffsetx/y` +0x20/+0x24, `m_sniper_posx/y` +0x28/+0x2c,
`m_firerifle_kick_*` +0x38..+0x44, the selected item +0x824, the item list +0xe4, the fire modes +0x6fc, the body
+0x830. SOCOM II adds the reticle's size at +0x84c (and its previous value +0x850, its movement target +0x86c, its max
+0x870 and min +0x874) and the pull's round count at +0x818.

## 0. The answers

- **`m_minsize`/`m_maxsize` do not exist in SOCOM II's HUD.** The reticle's size is the kit's `+0x84c`, in PS2 pixels,
  clamped per weapon and per stance to `TargetMin`/`TargetMax` (the M4A1 SD standing: 1 to 26). The HUD draws the arms
  that many pixels out -- **halved in the third-person view**.
- **The bloom** (§3): movement aims the size at `|v|² / 65 × TargetDilateUponMovementMult + 158.7 × (turn² + pitch²)`
  (rates in radians a second) and opens toward it 1 pixel a game frame (30 Hz, 525/15734 s: 30 px/s, corrected
  2026-10-04 by PF-02 from "a 60 Hz tick", research 181 §6.1 X1; the port opens it continuously at the per-second
  equivalent, 29.97 px/s, MISSION R8: §10); it closes at `TargetConstrict` 50 a second; a
  round adds `TargetDilateUponFire` 7 (× 1 + the burst scalar, 0 on the SD). Crouched the speed term is × 13, prone × 63.
- **The recoil unscoped is the reticle, not the camera** (§4): each round moves the **whole reticle up** by
  `ReticuleKnock` (12; the first round of a pull × `KnockEntryStrength` 0.4 = 4.8), capped at `ReticuleKnockMax` 45,
  returning at `ReticuleKnockReturn` 70 a second; the rounds go where the reticle is. The view does not move.
- **The cone** (§5): the size becomes a square of half side `size × 0.707` pixels, turned to tangents by the game's
  own (quirky) `tan(tan(hfov))` law; each axis is `u·|u|` of a uniform `u` -- densest at the centre.
- **Fire modes** (§6): `MaxFireMode 3` = semi, burst, automatic; 1 / 3 / unlimited rounds a pull; the wait `FireWait`,
  × 0.8 in burst and automatic (the SD: 0.14 s semi, 0.112 s = 536 a minute auto). The switch is L3 (`FireMode`),
  refused while scoped; the rifle comes up on **burst** (the kit's spawn set-up; the console frame's three rounds).
- **The zoom** (§7): third person → first person (1.01) → the scope at `ZoomMode[state − 4]` -- **the M4A1 SD's one
  scope level is 3×, the M4A1's 2.5×; `ZoomMode0` (1.5 on every record) is never a magnification**. D-pad Up in, Down
  out, no wrap; the magnification runs linearly at 3× the target a second; the look is divided by it; the move stick
  is × 0.2 scoped. Every setter of the view state, row by row against `zoom.ts` and its tests: §7.1 (MATCH-04's audit).
- **The scoped kick** (§8): `FireRifleKick*` moves the aim pitch **only scoped, only on the first round of a pull** --
  a second round drops the scope to first person. Scoped the cone is a point, moved by the `SniperDist*` sway **divided
  by the magnification** (§17: a third on the SD's 3×).
- **The reticle is SOCOM II's per weapon** (§9): ten sets chosen by the weapon's `ID` and the view; the rifle's arms
  are coloured (200, 200, 24) at rest, green on a teammate, red on an identified enemy; the scope is a full-frame tube.

## 1. The record: `CZWeapon`'s parser (0x3cda30, decomp 322125-322640)

`FUN_003cda30` builds one `CZFTSWeapon` (0x28c bytes, `FUN_003c6320`) per `ZWEAPON` record. The fields this work reads,
with where the parser puts them:

| key | setter | lands at | note |
|---|---|---|---|
| `Reticule_Modifiers STANCE_STAND/CROUCH/PRONE` | loop 322200-322356 | `+0xf8 + 0x74 × stance` (`FUN_003c5a50`) | stance n starts as a **copy of n−1** (322215-322245); stance 0 as `FUN_003c59c0` made it |
| `ReticuleKnock`, `…Return`, `…Max` | `3c61a0`, `3c6190`, `3c6180` | stance +0x00, +0x04, +0x08 | |
| `SniperDistPPFrameX/Y`, `…LimitX/Y`, `SniperDecayRate` | `3c6070`, `3c6060`, `3c6030`, `3c6020`, `3c5ff0` | +0x0c, +0x10, +0x14, +0x18, +0x1c | |
| `TargetDilateUponFire` | `3c6140` | +0x20 | |
| `TargetDilateUponMovement` | `3c6120` | +0x24 (and its square root at +0x2c) | |
| `TargetDilateUponMovementMult` | `3c6110` | +0x28 | default 1.0 (`FUN_003c59c0`) |
| `TargetConstrict`, `TargetMin`, `TargetMax` | `3c6100`, `3c60f0`, `3c60e0` | +0x30, +0x34, +0x38 | |
| `FireRifleKickRate`, `…ReturnRate`, `…BaseDist`, `…RandomDist` | `3c5fd0`, `3c5fc0`, `3c5fb0`, `3c5fa0` | +0x3c, +0x40, +0x44, +0x48 | |
| `ScreenShake xaxis/yaxis` | inline | +0x4c..+0x68 | defaults 2, 1, 2, 2000 / 1, 1, 2, 250 |
| `KnockCount`, `KnockEntryStrength` | `3c5a90`, `3c5a80` | +0x6c, +0x70 | defaults **3** and 1.0 |
| `FireWait` | inline | weapon +0x50 | default 0.1 |
| `NumZoomModes`, `ZoomMode%d` | `3c5e70` (push) | vector +0x280 (count +0x284, data +0x288) | a missing mode is −1 |
| `AccBurstCnt_Min/_Max`, `AccScalar_Min/_Max` | `3c62b0`, `3c6260`, `3c6210`, `3c61c0` | +0x268, +0x26c, +0x270, +0x274 | slope (max−min)/(cntMax−cntMin) kept at +0x278 |
| `Muzzle_Velocity`, `ImpactRadius`, `Effective_Range`, `Maximum_Range` | `3d29b0`… | | **× `DAT_003dfe10` = 10.0** |
| `ID` | inline | +0x7c (byte) | the `EQUIP_ITEM`: the reticle set (§9) |
| `MaxFireMode`; `BurstMode`, `SingleMode`, `AutoMode` | `3d2a80`; `3d2a30`(2, 1, 3) | +0x24; flags +0xd0 + mode | `3d2a80(n)` enables 0..n; a mode key enables its mode and raises +0x24 |
| `RecoilPct` | `3d2010` | +0x6c | a round adds it to body +0x378, capped at 10 (`FUN_0057d510`) |

- **Units.** The file's ranges and speeds are metres: the parser multiplies them by `DAT_003dfe10` = 10.0 (read from the
  ELF's `.data`), the world's units being tenths of a metre (the HUD prints `RANGE(m): %.0f` of a distance / 10,
  decomp 70447). `UNITS_PER_METRE` = 10; the round now flies `Maximum_Range × 10` units (the M4A1 SD: 8,000), where the
  viewer used to fly 1,000.
- **Unread keys.** The records also carry per-stance `AccuracyBurstCnt_Min/_Max` and `AccuracyScalar_Min/_Max`; the ELF
  has no string for them (its strings at 0x3fc6d0-0x3fcd70 list every key the parser reads), so nothing reads them.

### The M4A1 SD (`ID 62`, `m4Acarbine_sd`), and the M4A1 beside it

| | M4A1 SD stand | crouch | prone | M4A1 stand / crouch / prone |
|---|---|---|---|---|
| ReticuleKnock / Return / Max | 12 / 70 / 45 | **11** / 75 / 45 | **10** / 75 / 20 | 12/70/45 · 9/75/45 · 8/75/20 |
| TargetDilateUponFire | 7 | 7 | 7 | 7 |
| TargetDilateUponMovement / Mult | 1 / (1) | 1 / 13 | 1 / 63 | same |
| TargetConstrict | 50 | 55 | 50 | same |
| TargetMin / TargetMax | 1 / 26 | **0.75** / 25 | 1 / 24 | 1/26 · 1/25 · 1/24 |
| SniperDistPPFrameX/Y, LimitX/Y | **6 / 6**, 20 / 24 | 5 / 5, 16 / 19 | 4 / 4, 12 / 15 | 5/4 · 4/4 · 4/4 (limits same) |
| SniperDecayRate | −0.04 | −0.05 | −0.2 | −0.06 · −0.06 · −0.2 |
| FireRifleKickRate / Return / Base / Random | 0.5 / 0.18 / 0.09 / 0.015 | … / 0.08 / … | … / 0.06 / … | same |
| KnockCount / KnockEntryStrength | 1 / 0.4 | 1 / 0.4 | 1 / 0.4 | same |

Weapon-wide, SD then M4A1: `FireWait` **0.14** / 0.12; `NumZoomModes` 2, `ZoomMode0` 1.5, `ZoomMode1` **3** / 2.5;
`AccBurstCnt` **5-10** / 4-7; `AccScalar` **0-0** / 0-0.03; `Muzzle_Velocity` 900 / 921; `ImpactRadius` 25 / 30;
`Effective_Range` 550 / 600; `Maximum_Range` 800 / 1000; `Damage_Modifier` 0.15 / 0.3; `Sound_Radius` 10 / 100;
`Ammo_Capacity` 30; `NumMags` 3; `MaxFireMode` 3; `RecoilPct` 0.2; `Rumble` 0.04 / 0.2 / 125 (SD). Transcribed as
`@s2u/scene`'s `HELD_RIFLE` (and the M4A1's `DEFAULT_RIFLE`), pinned to the file by `weapons.test.ts`.

## 2. The frame the numbers are pixels of

`FUN_003b1200` (decomp 305276) sets the frame `DAT_004a44c4` × `DAT_004a44c8` = 0x280 × 0x1c0 = **640 × 448**; the
HUD centres everything on (320, 224) (`FUN_00216770`, 70421). All the reticle's numbers -- the size, the knock, the
sway -- are pixels of it, which is what the viewer already draws the HUD in (one texel a PS2 pixel, research on W2.4).
The NTSC projection's per-axis scale `DAT_004a44a8/ac` is 1.0 / 1.0 (`FUN_003b14a0`, PAL's 8/7 aside).

## 3. The size: the bloom (`FUN_005c2670`, decomp 477256-477377; `FUN_005c3360`, 477683-477814)

**Each tick** (`FUN_005c0fd0` calls `FUN_005c2670(dt, kit)` once a game frame -- 30 Hz, `GAME_FRAME_DT` = 525/15734 s,
research 208; this section said "every 60 Hz tick" until PF-02 of 2026-10-04, research 181 §6.1 X1):

1. `min = TargetMin`, `max = TargetMax` of the current stance (`FUN_0058a720(body, 1)`: 0 stand, 1 crouch, 2 prone);
   four item ids (0x79, 0x97, 0xbe, 0xc9 -- grenades and the like) use 0 and 0. The size is lifted to `min`.
2. The knock returns (§4).
3. The target: `(vx² + vy² + vz²) × 0.015384615 × Mult + (ωx² + ωy² + ωz²) × 5.29 × 30 + (pitch rate)² × 5.29 × 30`,
   plus, while body `+0x105e` bit 5 is set, `|+0x1350..+0x1358|² / 65` -- the velocity at `+0x2c` is the body's
   `m_velM` (units a second), `+0x44` its `m_velR` (radians a second, reCOM `zEntity/zentity.h:126`), `+0x60` the pitch
   rate `FUN_00594600` writes (`(old − new pitch) / dt`, 452954); `+0x1350` is the carried velocity the air step moves
   by (`FUN_0054d9a0`, 416524-416547) [reading: bit 5 is the airborne bit]. A vehicle's own values stand in when
   mounted. Clamped to `[min, max]`.
4. `size < target`: `size += TargetDilateUponMovement` (**a frame**, not a second: 29.97 px/s at the game's frame;
   the port's old 60 Hz tick gave 60) up to the target;
   `size > target`: `size −= TargetConstrict × dt` down to it.

**Each round** (`FUN_005c3360(kit, weapon)`, from `FUN_005c5340` 479542): unless scoped (§8), `size += Dilate ×
(1 + s)`, `s` the burst scalar -- `n = count + 1 − AccBurstCnt_Min`, and when positive `min(n, AccBurstCnt_Max) ×
slope` (the cap is on `n`, so the M4A1 reaches 7 × 0.01 = 0.07, not 0.03) -- clamped to `[min, max]`.

What it comes to on the SD (`accuracy.test.ts`): standing still 1; walking 30 units a second 13.8; the standing run
(65, research 71's bands) 65 → pinned at 26; crouch-walking 10 a second 20; a turn of 0.41 rad/s (23°/s) alone pins it
at 26 -- the look is the biggest term; a round +7, closing again in 0.14 s; automatic fire (+7 every 0.112 s against
−5.6 of constriction) climbs 1.4 a round to 26.

## 4. The knock: the recoil you see (`FUN_005c3360` 477755-477790; `FUN_005c2670` 477297-477321)

- A round, not scoped (`body+0x200 < 5 && != 4`): if the pull's count (`kit+0x818`, §6) equals `KnockCount`, `kit+0x24
  −= ReticuleKnock × KnockEntryStrength`; if greater, `−= ReticuleKnock`; below, nothing. The count is incremented
  before (`FUN_005be9a0` 475516), so on the SD the first round climbs 4.8 pixels and each after it 12.
- Clamped to ± `ReticuleKnockMax` × the camera's y scale (`cam+0x474` = the zoom × 1.0, `FUN_0029b2f0`) × the
  aim-to-muzzle depth ratio `(d_aim − d_fire) / d_aim` (`FUN_00290830` of the two points) -- ≈ 1, taken as 1.
  `kit+0x20` (x) is clamped the same way but no round moves it.
- Each tick both offsets return toward 0 at `ReticuleKnockReturn × dt` (70 px/s standing).
- **Where it shows:** the HUD's reticle centre is `(320 + kit+0x18 + kit+0x20, 224 + kit+0x1c + kit+0x24)`
  (`FUN_00216770` 70421-70424), ring (`+0x70`, 70430) and arms alike: the whole reticle jumps up. **Where it goes:**
  `FUN_005bd100` turns the same offsets into the round's aim offset (§5). The camera is not touched.
- Automatic on the SD: +12 against 70 × 0.112 = 7.8 of return a round, so it climbs ~4.2 pixels a round to the cap of
  45 (≈ 6.1° up in the 49° view's tangents) after about ten rounds, and is back in 0.65 s after the trigger lets go.

## 5. The cone: where a round goes (`FUN_005bd100` 474185-474277; `FUN_00592260` 451531-451578)

`FUN_005bd100` (`CZKit_SetCurAccuracy`, named in `recomp/socom2_names.csv`) writes three floats on the body:

- `cam+0x290` = `(W/2) / tan(hfov)` (`FUN_002915f0`: `+0x4b0` = W/2 × `+0x1d8` = 1/tan(`+0x210`)), so `W / cam+0x290` =
  2 tan(hfov); the game then takes **`tanf` of half of it as though it were an angle** (`FUN_001b3808` is `tanf`) and
  divides by the half frame: `tx = tan(tan(hfov)) / 320`, `ty = tan(tan(hfov) × 448/640) / 224`. With the map's
  `hfov` 0.6109: tx = 0.0026346, ty = 0.0023817 per pixel -- ~1.2× the true tangent of a drawn pixel (0.0020342
  vertically), so the cone is a fifth wider than the reticle drawn. Ported as is (`tangentPerPixel`).
- `+0x5d4 = kit+0x20 × tx × k`, `+0x5d8 = −kit+0x24 × ty × k` (up positive), `+0x5dc = size × ty × 0.707` -- `k` =
  `d_aim / (cam+0x474 × (d_aim − d_fire))`, the depth ratio (≈ 1) **over the magnification** (§17); the radius has no
  `k`. Scoped, see §8.
- `FUN_00592260(seal, dir)` for each round: `right = dir × (0, 1, 0)`, `up = right × dir` (**unnormalised**: cos(pitch)
  long), `a = +0x5d4 + +0x5dc × s1`, `b = +0x5d8 + +0x5dc × s2`, `dir += right·a + up·b`, with `s = u·|u|`, `u =
  (rand() − 0x3fffffff) × 9.313226e-10` in [−1, 1). A square whose corners are on the circle of radius `size`; three
  quarters of the rounds within its inner half (`P(u² < ½) = 0.707` per axis). The same rule serves the AI's aim
  (`FUN_005aa6e0` 464229, scaled by the distance).
- On the SD at rest (size 1) the half side is 0.0017 rad (0.10°): 1.7 units at 100 m; pinned at 26, 0.044 rad
  (2.5°): 4.4 units (0.44 m) at 10 m.

## 6. The fire modes and the trigger (`FUN_005c0940`, `FUN_005c09f0`, `FUN_005c4600`, `FUN_005c0ae0`)

- **Rounds a pull** (`FUN_005c0940`, 476281): mode 1 → 1, 2 → 3, 3 → 10,000, 0 → 0, ≥ 4 → 1.
- **The wait** (`FUN_005c09f0`, 476313): mode 1 `FireWait`; 2 and 3 `FireWait × 0.8`; 0 → 1 s. The SD: 0.14 s semi,
  0.112 s burst and automatic (536 a minute); the M4A1 0.12 / 0.096 (625).
- **The timer** (LATER 326, 2026-10-23; reading, pending review): the wait is the kit's timer `+0x81c`, **set** to it when
  a round leaves (`FUN_005be9a0` D:L475488, D:L475517, `param_2` the rate `FUN_005c09f0` hands it at D:L476571), run down
  by the frame's dt once a game frame and **clamped at 0** (`FUN_005c0fd0` D:L476644-476646: no leftover carried), the
  gate refusing a round while it is above 0 (`FUN_005c0ae0` D:L476446-476448). So a held trigger fires at most one
  round a game frame (`GAME_FRAME_DT`, 525/15734 s), its gaps the wait rounded **up** to whole game frames: the M4A1's
  0.096 s automatic is 3 frames (0.1001 s, 599 a minute, not 625), its 0.12 s single 4 (0.1335 s). The page's kit
  (`viewer/src/fire.ts` `update`) steps the browser's time in whole game frames and sets the timer; was: run down a
  browser frame at a time and *added to* a round (`wait += interval`), the leftover carried -- rounds up to a frame
  early against the rate, refused 'rate' by the room (game 195: #455), and faster than the original on a fast page.
  The run-down sits inside the fire tick (D:L476643-476647), which runs only while the kit's other timer `+0x820` is 0
  and `FUN_005c1970` passes (D:L476549-476568): a bolt's or a pump's lock sets `+0x820` in the round's frame
  (`FUN_005be9a0` -> `FUN_005c5340` D:L475604 -> `FUN_005c32b0` D:L479320, D:L479342; set D:L477666-477675), so the
  timer is *held* through the lock and runs on after it (the review's F2); the page runs it down through the lock (its
  `timed` frame skips only the dry branch): LATER 330. That other timer (`+0x820`, the reload and after-shot:
  D:L476550-476560, ended on the frame it goes below 0) the page also runs on its browser frames: LATER 330.
- **Every weapon's rate, the original's against the port's** (OBF-19, Trello cFOg4UJu, 2026-10-30; reading, pending
  review). `FireWait` is seconds (the record's `+0x50`, research 94 C1; default 0.1, `FUN_005c09f0` D:L476324), and the
  game frame 525/15734 s (research 180 s0, 208), so the original's rate is 1 / (ceil(wait / frame) x frame): the timer
  above, run in float32 (`viewer/src/accuracy.ts` `fireFrames`; the nearest any wait comes to a whole number of frames
  is 0.1 s at 2.997, so the precision decides nothing). The fire timer alone: a bolt's or a pump's lock and clip hold it
  on top (above; LATER 330). The port's tick has been 60 Hz since the wire's first commit (`TICK_HZ`, 53db33d3b,
  2026-09-29): there was no change of rate; what moved the fire's timing is PF-01 (the 30 Hz game frame, 2026-10-04) and
  LATER 326 (the page's kit on it, 2026-10-22). `match/test/fireRateParity.test.ts` reads the disc's table
  (`RUN/ZWEAPON.ZAR` through `readKitTable`; its pin without the disc) and, for each of the 44 weapons and each mode it
  enables (81 rows), drives the page's kit (`Fire`) held at 30, 60 and 144 fps, its semi-automatic pressed every page
  frame, and the room's bot (`BotFirePolicy`) on the 60 Hz tick.
  - **The page's kit held** (every weapon, every mode, every fps): never sooner than the original's frames, never a page
    frame later; its steady rate the original's (the table: 10.000 at 60 fps against 9.990 over six seconds, the 0.1% a
    60 Hz page's frame against the 29.97 Hz game frame, made up over the long run by the carried leftover).
  - **The bots did not match: fixed.** They waited `ceil(wait x 60)` ticks, the frame quantisation lost -- faster than
    the original wherever the wait's ticks round up short of its frames': the Model 18 automatic 20 a second against
    14.985 (+33.5%); the HK5, F90 and F2000 in burst and automatic, the M16A2 and M16A2-M203 in burst, the SA-80 A2 and
    Steyr Aug in automatic, 12 against 9.99 (+20.1%); the AKS-74, AK-105, M4A1-M203 and M4A1 SD in burst and automatic
    and the M60E3, 8.57 against 7.49 (+14.4%); the M9, 226, 9mm Pistol, P228 and SR-1 Gyurza 5.45 against 4.995 (+9.2%);
    the JACKHAMMER automatic 4.0 against 3.75 (+6.8%); the Spas 12 2.22 against 2.14 (+3.8%); the 870 1.33 against 1.30
    (+2.3%). The rest matched within 0.1% or were held slower by the bot's own spacing between pulls (10 ticks single,
    15 burst and automatic, the bot's authored discipline). Now the bot counts the original's frames
    (`match/src/bots/roles.ts` `botFireFrames`) on its tick: a held chain's next round at its anchor's frames rounded up
    to a tick (3 frames: 7, 6, 6 ... ticks, 6.006 on average), never a tick short of the console's; a pull's first gap
    is a tick long (the 60 Hz tick cannot hold 2.002 ticks a frame), so a short pull reads up to 11% slow (the 9mm Sub's
    three-round burst: 5 then 4 ticks against 4.004 each).
  - **Fixed (LATER 587, 2026-10-30; reading, pending review): the page's semi-automatic pressed every page frame.** A
    press's round keeps the kit's frame clock when the last page frame's step brought the timer to 0 (`Fire.pull`,
    `gateOpened`): the original fires a pressed round on the frame its timer reads 0 (`FUN_005c0ae0` D:L476446-476448;
    the release reset the count, D:L476381-476382, D:L476439), and that frame began at the step. Round j goes on the
    first page frame at or after j x ceil(wait / frame) frames from the chain's first; every single mode at 30, 60 and
    144 fps within -0.5%, -0.2% and -0.1% of the original over the table's 6 s (its last part-frame; the page's kit
    alone, offline -- `match/test/fireRateParity.test.ts`). A press later than the page frame after the step starts the
    clock as before (LATER 326's F1). **Online, the room's gate (corrected 2026-10-30, the second review).** The first
    fold's account -- that the room refuses none of these rounds at a steady 30, 60 or 144 fps, and that a floor on the
    page's own time (`PRESS_TICK_FLOOR_ADAPTATION`) made uneven frames safe -- held only for a test page whose commands
    carried the Trigger bit on every frame, which never holds a press's round back. The page names a press's round at the
    first command after it (LATER 347), up to a tick after its moment, and a step's at the tick at or before it (LATER
    338), up to a tick before; the floor measured from the moments, not the commands, so a tapped burst or automatic came
    a command inside the room's gap at every rate but a steady 30 fps (the 9mm Sub's and MP5K's 2 against a cycle of 2.6;
    the review's probe: 30 of 36 runs refused 'rate'; `roomFireCadence.test.ts`'s taps: refusals in every band). Now
    (LATER 587's second fold, reading, pending review): online, the kit fires no round the room's gate would refuse at
    the command the page will name it at (`viewer/src/fire.ts` `ROOM_GATE_MIRROR_ADAPTATION`, `FireSource.roundSeq` ->
    `viewer/src/netPage.ts` `roundSeq`, the same rule as `fireEvent` and `flushPressRounds`); the gate is one module
    both run (`viewer/src/net/fireGate.ts`). A round it holds goes on a later step or page frame while the trigger is
    still down; a press's round held and the trigger let go before the gate opens is not fired at all (a one-frame tap
    at 144 fps with no game-frame step in it). Never faster than the original, sometimes slower -- the second review's
    F3, both kinds counted: over seeded uneven frames, pressed every frame, the worst the Model 18 single on 20-40 ms
    frames, 3.7% slower by the review's rate measure (6.3% under the first fold's floor) and 5.0% fewer rounds by count
    (57 in 4 s against 60); none at a steady 30, 60 or 144 fps (the review's measure, the bolt guns aside: it leaves
    their lock out). `roomFireCadence.test.ts` holds every weapon's count on uneven frames to the original's less 5%
    (`F3_COST`), pressed every frame, held a frame and let go, and tapped. Offline (`roundSeq` null) it never binds. `roomFireCadence.test.ts`: every weapon in every
    firearm mode tapped (held 1-10 page frames, let go 1-4, the commands' Trigger bit the frame's own), three seeds at a
    steady 30, 60, 144 fps and 15-35, 20-40 ms, none refused; the review's probe through the same page model, 6 seeds x 6
    frame patterns, 0 of 36 refused. What was found (OBF-19):
  - **Found (for a ruling; LATER 587, fixed above): the page's semi-automatic at 60 fps is a page frame slow a press.**
    A press's round starts the kit's frame clock (`Fire.pull`, LATER 326's review F1); at 60 fps two page frames are
    33.333 ms, 34 us short of the game frame, so the n-th frame's end always falls just after a page frame and the round
    waits one more: a press every page frame fires every 2n + 1 page frames where the console fires every n game frames
    -- the HK5, F90, 9mm Sub, MP5K, M16A2(-M203), F2000, SA-80 A2 and Aug single 8.57 against 9.99 (-14.2%), the Model
    18 single 12.0 against 14.985 (-19.9%), the M4A1, HK5SD, AKS-74, AK-105, M14 and Groza single -11.0%, the 552(SD),
    AK-47, M4A1-M203, M4A1 SD, Dragunov and SR-25s -9.0%, the pistols -7.6%, down to the M82A1A's -0.7%; at 144 fps up
    to -3.9%. A held trigger pays it once a pull (a burst's second round). The original fires a pressed round on the
    frame its timer reads 0 (the count is reset by the release, `FUN_005c0ae0` D:L476381-476382, D:L476439). Not fixed
    here: a tolerance on the step (a round up to a fraction of a page frame before the frame's end) brings an honest
    round a tick inside the room's 'rate' cycle (`room.ts` `fire`: `rate - 1`, its float) for the weapons whose
    `FireWait` x 30 is whole and have no faster mode (F57, Mark 23, Mark 23SD, DE .50, M40A1, M82A1A, M79) at fps where
    the step does not land on a tick -- the room and the page change together or not at all.
  - **The room's 'rate' bound on the console's frames (LATER 588 (a), 2026-10-30; reading, pending review).** The
    room's gap (BL-1, LATER 326: a round's command at least the fastest mode's wait x 60, less a tick, after the last)
    held a forger only to the unquantised wait; it stays, and beside it the console's period is held over the chain
    (`viewer/src/net/fireGate.ts`, `match/src/room.ts` `fireAt`): `Q` = 2 x `fireFrames` ticks for the fastest enabled
    mode (OBF-19's frames, `FUN_005c0fd0` D:L476643-476647 with `FUN_005c09f0` D:L476323-476341; a game frame is 2.002
    ticks, so `Q` is at most the console's period); a round at command `c` is taken only if `c` >= `S + Q - 2`, then
    `S` = `S + Q` if `c - (S + Q)` <= 7, else `c`. The 2 and the 7 are the port's, not the original's
    (`FIRE_SCHEDULE_SLACK_ADAPTATION`: the naming's tick either side of a round's moment; `FIRE_SCHEDULE_WINDOW_ADAPTATION`:
    a page frame under the 0.1 s clamp and a tick). The `Q` of 2 x `fireFrames`, not 2 x ceil(30 x wait): the float32
    wait of 0.1 s is 3.0000000447 x 30, which would round to 4 frames against the console's 3. A forger is held to the
    console's average (`roomFireCadence.test.ts`: an HK5 automatic every 5 commands, 40 of 48 fired in 4 s, the
    console's 40; every 4: 40 of 60; the Model 18 every 2: 61 of 120 against 59.9); an honest page is held to the same
    gate by its own mirror (above), so none of its rounds is refused.
  - **Found (LATER 588; (b) and (c) done 2026-10-30, `agent/later-588`, LATER 588's row; the room's bound is the
    bullet above):** (a) the mounted gun's page cadence (`viewer/src/actionWiring.ts`
    `TurretTrigger`) runs its wait down a browser frame at a time (PAR-24's pin), so a PKM or LMG TURRET (0.096 s, 3
    frames: 9.99 a second) fires 10.0 at 60 fps and 10.29 at 144 (+3%), the MGL FRAG TURRET (1 s, 30 frames) 1.000
    against 0.999; (b) the room's own 'rate' bound is the unquantised wait less a tick (`room.ts` `fire`,
    `turretRound`), so it holds a forged client only to the wait (12.5 a second on an HK5 automatic), not to the
    console's 9.99 -- an honest page fires at the console's rate; (c) a bot's bolt-action rifle: the original adds the
    after-shot lock to the wait -- the fire timer runs only while the lock `+0x820` is 0 (`FUN_005c0fd0`
    D:L476550-476559, its run-down D:L476643), and the clip follows (above, LATER 330) -- where the bot
    (`match/src/bots/roles.ts` `botFireFrames`) takes the longer of the two: the M40A1 (0.5 s wait, 15 frames;
    `ReloadDelayAfterShot` 0.5 s, 15) every ~15 frames against the original's ~30, the M87ELR (0.7 s, 21; 0.5 s, 15)
    every 21 against ~36, both before the clip (the 870 has no `ReloadDelayAfterShot`, its pump the clip alone).
- **The pull's count** `kit+0x818`: +1 per round (`FUN_005be9a0` 475516, before the round leaves); **reset to 0 when the
  trigger (`ctrl+0x118`) is up or just released** (`FUN_005c0ae0` 476382-476400), which also stops a burst mid-way.
  The press's own round is the pull's first: the count was zeroed on the frames the trigger was up (state 0,
  D:L476381-476382), and the press (state 1) goes on to the fire with it at 0 (D:L476418-476422). The room's cone (`viewer/src/net/shotCone.ts` `tick`) restarts the count on the commands' Trigger edges, so
  a round must reach it at a command carrying its press (LATER 347, 2026-10-23; reading, pending review): the page sets
  the bit before the walk builds the frame's commands (`main.ts`, `matchMount.ts`: `NetPage.trigger`) and names a
  press's round -- fired in the pad's read, before them -- at the **first** command after it (`NetPage.fireEvent`'s
  hold), not the frame's last (at 20 fps that would bring the pull's second round inside the room's gap, LATER 338).
  A held round after it (LATER 338, 2026-10-24) is named at the command of its own game frame. What is read: the kit's
  frame runs once a game frame -- the fire gate, then the timer run down (`FUN_005c0fd0` D:L476569, D:L476638; LATER 326's
  steps) -- and fires on that frame's camera. What is the port's: the console has no command tick; the 60 Hz command is
  the port's transport (ruling PF.R8, `mover.ts`'s header), so the round takes the walk's tick at or before the step's
  moment in the page frame -- its command and its camera, the third person's pass or the head's eye at that tick
  (`WalkMode.tickAim`, `Fire.update`) -- a transport convention, not a reading. Two rounds of one long frame no longer
  share a command, and a round's claim is its own tick's look, inside the room's cone at that command in either view
  (`walkTickAim.test.ts`).
  Was: named at the previous frame's command, no Trigger on it -- the room bloomed it before the edge restarted its
  count, and ran a round behind the page's for the whole burst (the second round's knock the entry's again, about 7 px
  less a press): bursts of five rounds or more with short releases refused 'cone'. A tap inside one page frame never
  reaches a command at all: LATER 352.
- **The switch** (`FUN_005c4600`, 478555): only when the magnification is ≤ 1.01 (not scoped); mode + 1, past
  `MaxFireMode` back to 1, skipping a mode whose flag is off.
- **The mode at spawn:** the kit's set-up (`FUN_005c0250`) first selects the primary (`FUN_005c4b10`, D:L476156), or
  the sidearm when the primary is empty (D:L476105); the select steps a zero mode once only when the selection changes
  (D:L478930-478931), and the kit's constructor `FUN_005c8190` leaves it at 0 (D:L480856), so the primary is not
  stepped there and a sidearm with no primary is. Then, with no kept mode to restore (D:L476181-476184), it steps the
  selected slot's mode once with the switch (D:L476185: from 0, the first mode the weapon enables) and puts the slot
  on **burst** when the weapon enables mode 2 (`FUN_003d2a60(slot, 2)`, D:L476186-476192; the second slot the same,
  D:L476215-476221) -- which is what the console frame at spawn shows (three `firemode.tif` rounds = mode 2, research
  87). So burst where enabled, else the first mode: the M14, the Model 18, the JACKHAMMER, the SA-80 A2 and the Steyr
  Aug (semi + auto) come up on single -- but a sidearm with no primary is stepped twice, so a Model 18 alone comes up
  on automatic (`originalSpawnFireMode`'s `sidearmOnly`; the single result rests on the selection being 0 at entry, the
  constructor's: whether a respawn builds the kit anew is not read) (`accuracy.ts` `originalSpawnFireMode`; 2026-11-03, reading pending review; *was:*
  "a mode still 0 is cycled up to `MaxFireMode`", which is the pickup's path, research 323 R323.11). A slot left at 0 is
  stepped once at the swap to it (`FUN_005c4b10` D:L478930-478931); a mode still 0 in the hand is cycled up to
  `MaxFireMode` (`FUN_005c0fd0` D:L476658-476668). Online the player's last mode per weapon is restored
  (`DAT_0066b580`, D:L476236-476250, not modelled: LATER 665). **The page departs from the spawn default by the
  owner's ruling OT.R100** (`DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION`, §11): a weapon with automatic comes up on it. `controller.rdr` binds it to `LeftStickTap` (L3) in the Default layout (`RightStickTap` in
  Reverse).

## 7. The views and the zoom (`FUN_005448a0`, `FUN_005445b0`, `FUN_00544400`)

`FUN_005448a0(body, state)` (410927) sets `body+0x200`, keeps the old one at `+0x201`, flags `+0x202`, and sets the
magnification `+0x204` by the jump table at 0x65c3b0: **0** third person 1.0; **1, 2** first person 1.01; **3** night
vision 1.01 (with its effect callbacks); **4** the 9× view (9.0, the `zoom_control` motion, the `ret_binocs` HUD); **5-12**
`FUN_003c5980(weapon, state − 4)` = `ZoomMode[state − 4]` when that index exists (0x544adc: `addiu a1, a1, -0x4`, then
`jal 0x3c5980`; `FUN_003c5980` returns 500.0 for an index past the count). Entering 4 or 5+ resets the kick
(`FUN_005b9180`).

- **Zoom in**, d-pad Up (`FUN_005445b0`, table 0x65c360): 0 → 1 (2 mounted on a THERMAL turret, Z2); 1 → 3 on a night map (`DAT_0045c380
  +0x5dc`), else → 5 with two or more zoom modes, else → 4; 3, 4 → 5 (two or more); 5-11 → s + 1 while `s − 3 <
  NumZoomModes`. **No wrap.** With `NumZoomModes 2` (both M4A1s) the only scope state is 5 = `ZoomMode1`: **3× on the
  SD, 2.5× on the M4A1.** `ZoomMode0` (1.5 on all 86 records) is never a magnification; the sniper rifles' three modes
  give two levels (M40A1 6×, 12×); a one-mode weapon (a sidearm, an unscoped primary) zooms from first person into the
  binoculars, state 4, and the page does too (2026-10-01, the last point). From 3 or 4 with fewer than two modes the
  step **stays** (0x544810-0x54482c: `beqz s0`, `lw +0x284`, `sltiu at,v0,2`, `bnez at` to the end with `s4`
  unchanged): on a night map an unscoped weapon stops at the night vision and never reaches the binoculars.
- **The night step's gate (2026-10-01).** Before the map flag, `FUN_005445b0` (410733-410744; 0x5445ec-0x54464c) reads
  two flag pairs on the record in the hand's ID (`+0x7c`): `DAT_00436674` set and a primary (`FUN_003d1d10`: SMG,
  rifle, shotgun, MG, sniper, grenade launcher) gives `s3 = 1`, `s2 = DAT_00436678 != 0`; else `DAT_0043667c` set and a
  pistol (`FUN_003d1ce0`: class 4) the same with `DAT_00436680`. At 0x5447b8 `bnez s3` skips the map's `+0x5dc`: the
  night vision is `s2` when a flag covers the item, the map flag otherwise. `FUN_00544400` (410638-410647, 5 → 3) and
  `FUN_005c4b10` (478822-478830, the switch's drop of 3, on the new record) read the same pairs. **On the disc they never
  apply:** all four lie in BSS (segment 0x1e7000, file size 0x221480, so zero at boot); a scan of every load/store/addiu
  under `lui 0x43` in the ELF (2026-10-01) finds only reads (0x1f0a9c-0x1f0b18 the HUD, 0x54443c-0x54448c,
  0x5445f0-0x544648, 0x5c4c44-0x5c4c90), no pointer word points at 0x4365c0-0x4366c0, and the one base below them
  (0x436624, at 0x56eec8, 0x60acd8, 0x60ade4) is read at +0x0c..+0x28 only. So the step is the map flag. The page ports
  the gate anyway (`zoom.ts` `nightView`, `NIGHT_OVERRIDE` both off; `Zoom`'s in, out and switch take it;
  `test/zoom.test.ts` 'the night step gate').
- **Zoom out**, d-pad Down (`FUN_00544400`, table 0x65c320, entries read off the ELF 2026-10-01: 0x544578, 0x5444c0,
  0x5444c8, 0x5444d0, 0x5444d8, 0x5444f0 x8): 1, 2 → 0; 3 → 1; 4 → 1 clearing the knock (0x5444d8: `jal
  FUN_005b9020`; the night vision does not clear it); 5 → 1 (3 at night), clearing the knock; s > 5 → s − 1.
- **What else sets it:** a second round of a pull while scoped → 1 (`FUN_005c5340` 479404); a weapon switch drops
  **only the night vision** to 1 (`FUN_005c4b10` 478813-478833: `if (body+0x200 == 3) ... FUN_005448a0(body, 1)`),
  and only off a night mission: the same `DAT_0045c380 +0x5dc` flag gates it (478815-478833: `if (cVar3 == 0)`), so on
  a night map the goggles stay on through a switch; what a scope does when a grenade comes up was not traced, and the viewer drops it to first person [reading]; an attached launcher selected → 1 (`FUN_00216770` 70387-70389, when `+0x200 > 1`: the night vision too); death → 0
  (`FUN_00547af0`), the vehicle and ladder paths → 0/1 (`FUN_005463c0`, `FUN_00579720`). Nothing on reload, stance or movement.
- **The run** (`FUN_001f1610`, `FUN_001f0750` 52864-52990): the applied magnification `DAT_003dc338` moves linearly to
  the target `DAT_003dc340` at `DAT_00408c48` = 3 × the target a second in, at least 3 × the old target out (1.01 →
  3 in 0.22 s). `FUN_0029b2f0` puts it on the projection (`cam+0x470/+0x474` = zoom × 1.0): **tan(half FOV) ÷ zoom**
  -- the 49° view becomes 17.3° at 3×.
- **The look** (`FUN_005966a0` 453739): both look axes × 1.72 (`DAT_00650628/30`) then **÷ `FUN_005be660`** =
  `ZoomMode[state − 4]` when the index exists, else 1 -- first person changes nothing, the SD's scope ÷ 3, the 9× view
  ÷ `ZoomMode0` × 0.2 (`DAT_00650638`). The move stick is × 0.2 in states ≥ 4 (453818-453821). The body's pitch rate itself
  is `dynamics+0xf4 × 500 / body+0x1080`, `+0x1080` a constant 500 (0x554c54): no zoom term there.
- **Correction to research 83 §4:** "5 and up the weapon's `ZoomMode(mode − 5)`" and "the M4A1's ZoomMode 1.5 and 2.5"
  as two scope levels are both off by one: the index is `state − 4` and the M4A1 has one scope level, 2.5.
- **State 4 is the binoculars, and the page does not zoom into it (2026-09-30, the owner's play test of e373be70;
  superseded 2026-10-01 by the last point).**
  The Ghidra C of `FUN_005445b0`'s case 1 is mangled (every arm reads `caseD_2`); hand-decoded at 0x544780-0x54480c:
  `lw v0,0xeb8(s5)` (a vehicle: stay), `jal FUN_003d1cb0` on the class byte `+0x7c` (a rocket launcher, class 0x91:
  stay), `jal FUN_005bd7e0` (a launcher-round mode: stay), then the night test (`lw 0x45c380`, `lbu +0x5dc`: `li s4,3`
  at 0x5447e4), then `lw v0,0x284(s0)` (NumZoomModes), `sltiu at,v0,2`: two or more `li s4,5` (0x544804), fewer
  `li s4,4` (0x54480c). State 4 is `ChangeReticule` type 7 -- the full-screen twin-lens `ret_binocs` mask -- with the
  `*2binocular` motions, reCOM's `ZOOMSTATE_BINOCS`: the **binoculars**, which every unscoped weapon reaches (the disc's
  READERC `M62_BINOC` tutorial: switch to the pistol and press up for first person, the NVG, then binoculars). The page
  had sent the 20 one-mode primaries (M16A2, M16A2-M203, M4A1-M203, AK-47, AKS-74, M14, AK-105, M60E3, M63A, PKM, HK5,
  HK5SD, F90, 9mm Sub, MP5K, Spas 12, Jackhammer, 870, MGL, M79), the raised LAW / RPG-7 and the launcher-round modes to
  it as a "9x scope" (small reticle set 7, `ZOOM 9.0x`). **Now:** `zoom.ts` `zoomsIn(weapon)` = `scopeLevels(weapon)
  .length > 0` (NumZoomModes >= 2) -- the 13 scoped weapons of research 94 §C1.4 keep 0 → 5 and their levels; every
  other weapon (the pistols with them), a raised launcher, a launcher-round mode and the Detonator (`ZoomHold`) do not
  zoom; the night vision on a night map stays for all. The binoculars view is **not rebuilt** (a later owner call), and
  the owner's rulings (no first person; no pistol scope, 2026-09-29) override the tutorial's pistol-to-binoculars path.
- **First person is back (2026-10-01, the owner's ruling; it supersedes the 2026-09-29 "no first person").** `zoom.ts`
  ports state 1 as decoded above: 0 → 1 always, for every weapon and hold (the pistol too); from 1 a raised launcher or
  a launcher-round mode stays, a night map goes to 3, a scoped weapon (NumZoomModes ≥ 2, held as a firearm in its own
  mode) to 5, and every other weapon **stops at first person** -- the binoculars (state 4) stay unbuilt, the ruling not
  covering them (an open owner question that day, answered the same day: the next point). Out per `FUN_00544400`: 1 → 0, 3 → 1, 5 → 1 (3 at night). The drops that
  went to third person go to 1 again: the second scoped round (`FUN_005c5340`), a launcher round selected past 1
  (`FUN_00216770`), and the page's readings (a scope left with a weapon or a hold that has none). The view is drawn
  from the eye with the body hidden, as the scope is; the reticle is the class's full-size set (§9: `FUN_005be300`
  picks by `ID` at 1.01, `FUN_00215250` halves only in state 0); the look and move scales are 1 (`FUN_005966a0`:
  `FUN_005be660` is 1 below state 4, the 0.2 only from 4); the bob runs in states 1-3 only (453829), not in a scope.
  Tap `C` crouch / hold `C` prone is unchanged. The `M62_BINOC` tutorial's pistol path now matches up to first person.
- **The binoculars are back (2026-10-01, the owner's yes: "oh yeah sure", restoring state 4 as the original).** The
  binoculars are **not a scope**: the 2026-09-29 "no pistol scope" ruling was about a scope on the Mark 23 and stands;
  the owner's 2026-10-01 yes covers the binoculars, which the pistol reaches as the disc's own `M62_BINOC` tutorial walks
  it ("switch to your pistol and press up on the d-pad ... finally binoculars"). `zoom.ts` ports the decoded steps whole:
  from 1 a vehicle, a raised LAW / RPG-7 (class 0x91) or a launcher-round mode stays; a night map goes to 3; two or more
  `ZoomMode`s go to 5, **fewer to 4** (9.0x, `FUN_005448a0` case 4: `+0x204` 0x41100000, the `zoom_control` motion
  0x65c398, `FUN_005b9180`'s scope entry); 3 and 4 go to 5 only with two or more, else stay; out 4 → 1. An item in the
  hand (a throwable, a charge, the Detonator) goes on as a one-mode record: `FUN_005445b0` has no item gate and reads
  the record in the hand, and every item record on the disc has `NumZoomModes 1` (`ZWEAPON.ZAR`'s 86 records, read
  2026-10-01: the 13 scoped firearms 2 or 3, the unused `Binoculars` gear 2, every other 1; `ZoomMode0` 1.5 on all 86)
  -- `ITEM_ZOOM_MODES`. **The drops:** a weapon switch leaves state 4 (`FUN_005c4b10` drops only 3), so the binoculars
  stay through the swap and a scoped weapon then steps 4 → 5; a launcher-round mode drops 4 to 1 (`FUN_00216770`: `> 1`);
  the second-round drop is `> 4` only (`FUN_005c5340` 479398); death, the ladder and a vehicle → 0 as before; the page's
  readings (a scope left with a weapon or a hold that has none; a raised launcher) go to 1 and leave 4 alone.
  **The look and the walk:** `FUN_005be660` in state 4 is `ZoomMode0` (index 0 is under every count), so the look is
  ÷ 1.5 × 0.2 (`DAT_00650638`, 0.2 in the ELF's bytes) = 0.133, the move stick × 0.2 (453818-453821). **The fire**
  (`FUN_005be9a0` 475303-475305): every item's use but ID 0x0b's (the Designator: `cVar4` is the record's `+0x7c`, the
  `ID` key `FUN_003cda30` stores at L322435, not a class byte; its class by range is the pistol's) sits under
  `if (+0x200 != 4)` -- no
  round, no throw, no charge, no rocket with the binoculars up -- and the reload begins only `if (+0x200 != 4)`
  (`FUN_005c2a90` 477410); `fireRefused(state)` / `reloadRefused` take the view state alone (the page never holds the
  Designator as itself: no firearm record, its slot fires the baked placeholder; its branch fires no round), `Fire`'s `fireRefused` / `reloadRefused` (a held trigger
  fires on once they come down), `main.ts` `trigger`, and the room's `fire` (a round at a command carrying
  `Button.Binoculars` is dropped as `binoculars`). reCOM's SOCOM 1 `motion.rdr` marks every `*2binocular` row `NoFire`,
  which agrees. **The body:** the six `*2binocular` clips (READERC: "Stand -> Binocular" `seal_stand2binocular`, the
  crouch's, the prone's, and the pistol's `seal_p_*`; all in `MOTION_P.ZAR`, each a one-shot) play on the others' view
  of the body (`binocularPose.ts`, `BodyFlag.Binoculars` off the command's `Button.Binoculars`, both additive -- protocol
  9 kept); the page's own body is hidden in the view. Which function plays the clip on a body was not found (the
  `*2binocular` names are data indices in the anim set); the way down and the body mask are readings
  (`BINOCULAR_LOWER_READING`, `BINOCULAR_BODY_READING`, §11).

### 7.1 The transition table, row by row (MATCH-04's audit)

Web sprint 6, MATCH-04 (W6.R3: an audit of what 2026-10-01 built, not a rebuild), 2026-10-01. Every setter of
`body+0x200` was re-read in the decompilation (`grep FUN_005448a0(`: eleven call sites) and the three jump tables and
the mangled cases of `FUN_005445b0` / `FUN_00544400` were decoded again off the ELF's bytes (`game/disc/socom2_game.elf`,
a scratch decoder; 0x65c360 = 0x544688, 0x544780, 0x544860, 0x544810 ×2, 0x544830 ×7, 0x544860; 0x65c320 = 0x544578,
0x5444c0, 0x5444c8, 0x5444d0, 0x5444d8, 0x5444f0 ×8; 0x65c3b0 = 0x5449e8, 0x544a10 ×2, 0x544a38, 0x544a68, 0x544ac0
×8). Each row below is a state × an input × a condition → the next state, with where it is read, what `zoom.ts` (or its
caller) does, and the test that holds it. **The answer: 64 rows -- 29 held by a test before the audit, 9 pinned now
(implemented, not asserted: the assertion added, green at once), 6 fixed (a failing test first), 4 the page's readings
(no ruling: research 101 A31-A34, owner OC-M3), 1 an open owner call (X12: research 101 B8), 9 out of the page's reach,
1 implemented in `main.ts` and not unit-tested, 5 not implemented (owed, each in web research 101).** The review of
2026-10-01 added X14 (a spawn) and strengthened three pins that a mutant got past (Z16 now on a ten-mode record, S1 on
a record changed under the scope, B7 on the phase itself: each mutant shown failing). The new tests are `viewer/test/zoomTable.test.ts` (each row carries its function
and line); "zoom.test" is `viewer/test/zoom.test.ts`, "sights" `sights.test.ts`, "accuracy" `accuracy.test.ts`, "look"
`look.test.ts`.

**Zoom in, d-pad Up (`FUN_005445b0`, D:L410716).**

| # | from × condition → to | read at | `zoom.ts` | held by | verdict |
|---|---|---|---|---|---|
| Z1 | 0, no vehicle → 1, every weapon, every hold, night or day | 0x544778-0x54477c (D:L410751-410790) | `zoomIn` `s === 0` | zoom.test 'the M4A1 SD: third -> first person'; sights '41 firearms'; zoomTable '0 -> 1 for every weapon class' | held (widened to every hold × night) |
| Z2 | 0, mounted (`+0xeb8`) on a THERMAL turret (its `+0x298`) → 2; on a plain one → 1 | 0x544688-0x544778 (D:L410751-410790: `lbu +0x298`, `li s4,2` in 0x544738's delay slot, then `FUN_003aa020`; else `li s4,1` at 0x54477c) | `zoomIn` (`Zoom.setMount`'s `thermal`) | zoomTable 'LATER 97 ... Z2, Z3'; matchFirearm 'LATER 97 ... the row' | **held** (LATER 97, 2026-10-19; reading, pending review). *Was:* "0, a vehicle with a turret → 2 ... out of reach: no vehicles" -- corrected: 2 only on a THERMAL turret, by the ELF's bytes |
| Z3 | 1, mounted (`+0xeb8`) → 1 | 0x544780-0x544784 | `zoomIn` (`Zoom.setMount`) | zoomTable 'LATER 97 ... Z2, Z3'; matchFirearm 'LATER 97 ... the row' (TURRET-CONE's review F2 held 1 before it) | **held** (LATER 97, 2026-10-19; reading, pending review). *Was:* "1, a vehicle (`+0xeb8`) → 1 ... out of reach" |
| Z4 | 1, a raised rocket launcher (`FUN_003d1cb0`) → 1 | 0x544794-0x54479c | `staysFirst` ('launcher') | zoom.test 'a launcher-round mode and a raised LAW'; zoomTable | held |
| Z5 | 1, a launcher-round mode (`FUN_005bd7e0`) → 1 | 0x5447a8-0x5447b0 | `staysFirst` ('round') | the same | held |
| Z6 | 1, a night map, no class flag → 3 | 0x5447c0-0x5447e4 | `nightStep` | zoom.test 'night maps', 'the pistol reaches first person' | held |
| Z7 | 1, a class flag covering the item: set → 3, clear → on as a day map | 0x5447b8, 0x5447d8 | `nightView`, `NIGHT_OVERRIDE` | zoom.test 'the night step gate' | held (the flags are never set on the disc) |
| Z8 | 1, two or more `ZoomMode`s → 5 | 0x5447f0-0x544804 | `n >= 2 ? 5` | zoom.test 'the M4A1 SD' | held |
| Z9 | 1, fewer than two (a pistol, an unscoped weapon, an item) → 4 | 0x544808-0x54480c | `BINOCULARS` | zoom.test 'a sniper steps 6 then 12', 'the pistol' | held |
| Z10 | 1, no record in the hand → 4 | 0x5447e8 | -- | -- | out of reach: the page always holds a record |
| Z11 | 2 → 2 (stays) | 0x65c360[2] = 0x544860 (D:L410807-410809) | was 2 → 3 / 4 / 5 as from 1 | zoomTable '0x65c360[2]' ×3 | **fixed** (2 was not entered by the page then; since LATER 97 a THERMAL turret enters it, and it stays: zoomTable 'LATER 97 ... Z11') |
| Z12 | 3 or 4, two or more modes → 5 | 0x544810-0x54482c | | zoom.test 'night maps', 'the binoculars stay through a weapon switch' | held |
| Z13 | 3 or 4, fewer than two → stays | 0x544810-0x544824 | | zoom.test 'the pistol', 'a sniper' | held |
| Z14 | s in 5..11, `s − 3 < NumZoomModes` → s + 1 | 0x544830-0x54485c (D:L410817-410820) | | zoom.test 'a sniper steps 6 then 12' | held |
| Z15 | s in 5..11, `s − 3 ≥ NumZoomModes` → stays | 0x544848 | | zoom.test 'the M4A1 SD' | held |
| Z16 | 12 → 12 | 0x65c360[12] = 0x544860 | `s <= 11` | zoomTable '0x65c360[12]' | pinned now |
| Z17 | 11 → 12 (nine modes) | 0x544830-0x54485c | | zoomTable '11 -> 12' | pinned now (no record has nine) |

**Zoom out, d-pad Down (`FUN_00544400`, D:L410623).**

| # | from × condition → to | read at | `zoom.ts` | held by | verdict |
|---|---|---|---|---|---|
| O1 | 0 → 0 | 0x65c320[0] = 0x544578 | | zoom.test 'the M4A1 SD' | held |
| O2 | 1 → 0 | 0x5444c0 | | zoom.test | held |
| O3 | 2 → 0 | 0x5444c8 | | zoomTable '0x5444c8' | pinned now |
| O4 | 3 → 1, night or not | 0x5444d0 | | zoom.test 'night maps' | held |
| O5 | 4 → 1, the knock cleared (`FUN_005b9020`, `kit+0x20/+0x24` zeroed, D:L471932-471937) | 0x5444d8-0x5444e0 (D:L410660) | the state; the knock is `matchFirearm.ts` `stepZoom`'s `leaveScope` | zoom.test (the state) | held (the knock: `matchFirearm.ts`, not unit-tested). *LATER 168 (2026-10-21; reading, pending review):* this row and O6 are the decompilation's only two callers of `FUN_005b9020` -- the set `FUN_005448a0` (D:L410927-411019), the mount (X10) and the second round's drop (X1) call none. *Was:* "the knock is `main.ts` `stepZoom`'s `leaveScope` ... (the knock: `main.ts`, not unit-tested)" |
| O6 | 5 → 1 on a day map, the knock cleared | 0x544514-0x544540 (D:L410674-410682; `FUN_005b9020` at D:L410682) | the knock: `matchFirearm.ts` `stepZoom`'s `leaveScope` | zoom.test 'the M4A1 SD' | held (the knock, with O5: the only clears; LATER 168) |
| O7 | 5 → 3 at night or by a class flag | the same | `nightStep` | zoom.test 'night maps', 'the night step gate' | held |
| O8 | s > 5, `s − 5 < NumZoomModes` → s − 1 | 0x544558-0x544570 (D:L410684-410686) | | zoom.test 'a sniper'; zoomTable '12 -> 11' | held |
| O9 | s > 5, `s − 5 ≥ NumZoomModes` → stays | 0x544558-0x544560 | | zoomTable '7 stays' | pinned now (reached only by a record changed under a scope) |
| O10 | s ≥ 5, no record → stays | 0x5444f8 | -- | -- | out of reach |

**The set and the magnification (`FUN_005448a0`, D:L410929).**

| # | row | read at | `zoom.ts` | held by | verdict |
|---|---|---|---|---|---|
| S1 | a set to the state it is in does nothing | D:L410938 | `set` returns | zoomTable 'D:L410938' | pinned now |
| S2 | 0 → 1.0 | D:L410963 | `ZOOM_THIRD` | zoomTable | pinned now |
| S3 | 1, 2 → 1.01 | D:L410971 | `ZOOM_FIRST` | zoom.test (1); zoomTable (2) | held |
| S4 | 3 → 1.01 | D:L410978 | `ZOOM_NIGHT` | zoom.test 'night maps' | held |
| S5 | 4 → 9.0 | D:L410986 | `ZOOM_BINOCULARS` | zoom.test 'the binoculars: 9x' | held |
| S6 | 5-12 → `ZoomMode[state − 4]` under the count | D:L411005-411008 | | zoom.test, sights | held |
| S7 | 5-12 past the count → `+0x204` not written: the old value stays | D:L411006 | was 1.01 | zoomTable 'D:L411006' | **fixed** |
| S8 | `+0x204` is written only by the set: a weapon switched under a scope keeps the old magnification until the next set (`FUN_005c4b10` writes none) | D:L410961-411019; the run reads `+0x204` (D:L52864) | was the live record's | zoomTable 'D:L411006' | **fixed** (reachable: a classic round survived in a scope, a two-mode rifle picked in the ARMORY between rounds, the round's start -- the page drew the new rifle at the old 12x in a state it cannot reach; X14 closes that path; since 2026-10-02 (INT.R3) the ARMORY no longer opens between rounds, and the fix stands on the decomp alone) |
| S9 | the run is in or out by the state (`+0x201 < +0x200`), not by the magnification: in at 3 × the new target, out at least 3 × the old | `FUN_001f0750` D:L52864-52873, D:L52895-52900; `FUN_001f1610` D:L53275, D:L53289 | was by the magnification | zoomTable 'FUN_001f0750' | **fixed** (reachable: the binoculars, a switch to the SD, d-pad Up -- 9 → 3 ran at 27 a second, the original's 9) |
| S10 | entering 4, or 5-12 from anything but 6 → `FUN_005b9180` (+0.5 exertion) | D:L410995, D:L411010-411012 | `accuracy.ts` `enterRaises` | accuracy 'enterRaises' | held |
| S11 | leaving or entering 3 → the night vision's callbacks (`DAT_0044ce38` / `DAT_0044ce30`, vtable +0xc) | D:L410942-410949 | `main.ts`: the lens and `reticle.setNight` by `zoom.view()` | -- | implemented in `main.ts`, not unit-tested |
| S12 | any state but 1 → the projection's screen offset set to 0 (`FUN_002915a0` / `FUN_00291550` with 0) | D:L410957-410960 | -- | -- | not implemented: the page writes the offset (shake + bob) every frame, so the difference lasts no frame; owed (web research 101) |
| S13 | 4 and 5-12 start the `zoom_control` handle at `body+0x53c` (`FUN_0026a250(0x414bb0, "zoom_control", 0)`), 0-3 stop it (`FUN_002707c0`) | D:L410964-411019 | -- | -- | not implemented: what the handle is (a sound, a motion) was not identified; owed |
| S14 | entering 3 or 4 → `FUN_00544b60` (the local player: bit 0x200 of `+0x2c` cleared on each entry of the list at `+0xd8`) | D:L410979, D:L410987; 411115-411134 | -- | -- | not implemented, not identified; owed |

**The other setters.**

| # | row | read at | the page | held by | verdict |
|---|---|---|---|---|---|
| X1 | a pull's second round while `+0x200 > 4` → 1 (the first kicks); not the binoculars | `FUN_005c5340` D:L479399-479406 | `Accuracy.round` `dropZoom`, `matchFirearm.ts` `setZoom(1)` | accuracy 'scoped (5+)'; zoomTable 'FUN_005c5340' (states 0-12) | held (widened) -- the state. **The knock: LATER 233 (2026-10-21; reading, pending review):** the drop is `FUN_005448a0(camera, 1)` alone (D:L479404), no `FUN_005b9020`, so the knock carried into the scope stays: the page's `dropScope` (no `leaveScope`), the room's `ShotCone` taking no leave on the command after a dropping round's own (`ConeRun.dropped`, either arrival order); matchFirearm, shotCone 'LATER 233 ...'. *Was (open):* "the page's `setZoom` clears it (`leaveScope`, `before >= 4`) and the room's `ShotCone` clears on the Scope bit's drop". *Was:* "`main.ts` `setZoom(1)` ... held (widened)" |
| X2 | a switch: 3 → 1 unless a night mission (the map, or the new record's class flag) | `FUN_005c4b10` D:L478813-478833 | `setWeapon` | zoom.test 'a weapon switch drops the night vision'; zoomTable | held |
| X3 | a switch leaves 1, 4 and 5+ as they are | the same: a switch is refused from 4 and up (`FUN_005c4fd0`, research 201 §1-§2 A31), but the zoom read after it in the same update steps against the new slot (`+0x824`, D:L478842; `FUN_005445b0` via `FUN_005c3780`), so a step into 4 or 5+ in the press's tick reaches the new slot's view and it stays up | `setWeapon` keeps 4 and a scope a scoped weapon has; the kit refuses a switch from the 4 and up the last tick left (`WalkMode.swapGate`, `kit.ts` `pressShoulder`) and, at its press, steps that tick's zoom presses again against the new slot (`Zoom.switchWeapon`; research 211 §2): the rifle at 1, Up, then L2 reaches 4 | zoom.test 'the binoculars stay through a weapon switch', 'a switch in the tick a zoom step was taken in'; e2e binoculars.spec (refused at 4) | held: the page's 5+ drop removed 2026-10-05 (research 211 G4) |
| X4 | a launcher-round mode with `+0x200 > 1` → 1 (every frame) | `FUN_00216770` D:L70387-70389 | `setHold('round')`; `main.ts` `switchFireMode` | zoom.test; zoomTable 'FUN_00216770' | held |
| X5 | a raised LAW / RPG-7 past 1 → 1 | not traced (`FUN_005445b0` keeps it at 1) | `setHold('launcher')` | zoom.test | the page's reading, no ruling (research 101 A32) |
| X6 | an item taken up under a scope → 1 | not traced (§7) | `setHold('item')` | zoom.test | the page's reading, no ruling (research 101 A33) |
| X7 | death → 0, the camera's projection at 1.0 at once (`FUN_0029b2f0`) | `FUN_00547af0` D:L413083, D:L413084, D:L413095 | **was not implemented** (the zoom outlived the death and the respawn); now `NetPage` `died` → `main.ts` `zoom.reset()` | zoomTable 'FUN_00547af0' | **fixed** (the knock cleared with it is the page's reading: `FUN_00547af0` calls no `FUN_005b9020`; research 101 A30). *2026-10-21 (LATER 233's read; reading, pending review):* the original zeroes the knock at the spawn, not at the death -- the kit's constructor `FUN_005c8190` (D:L480916-480927) from the body's init `FUN_00553ea0` (D:L419459), reached from `FUN_00599b60` (D:L455663) at the round start and the respawn (X14); the page's death clear is earlier than the original's, with nothing reading the knock between (no reticle while dead) |
| X8 | the body's destructor (by its shape: the null test, the vtable reset at 419079-419080, the delete flag) → 0 | `FUN_005533e0` D:L419128 | a new map's `zoom.reset()` (`main.ts`) | -- | out of reach as such |
| X9 | → 0 | `FUN_00579720` D:L438329 (two bodies set to actions 9 and 10: not identified; the "ladder" of the bullets above is not confirmed by this read) | -- | -- | out of reach |
| X10 | the mount, from a view from the head (any state but 0) → 1, or 2 on a THERMAL turret (`FUN_003aa020` with it); third person stays 0 | `FUN_005463c0` D:L412247-412255 (the THERMAL test D:L412226-412245, `+0x298`) | `Zoom.setMount`; `matchFirearm` `syncMount` | zoomTable 'LATER 97 ... X10'; matchFirearm 'LATER 97 ... X10', '... third person'; shotCone 'LATER 168 ...' | **held** (LATER 97, 2026-10-19; reading, pending review). **The knock at the mount: LATER 168 (2026-10-21; reading, pending review)** -- the mount and the set call no `FUN_005b9020` (O5, O6 are its only callers), so a scoped player who mounts carries the knock onto the turret's view, where it returns at the turret record's `ReticuleKnockReturn` (`SWAP_KNOCK_READING`): `matchFirearm` `syncMount` no longer calls `leaveScope`, and the room's `ShotCone.tick` takes no leave on the first command with a turret held after one without (the Scope `room.ts` `onTurret` strips; recorded for the replay as no scope edge). *Was (a pin, not parity):* "the knock carried into the scope cleared" at the mount (`[0, 0]`). **The round trip before the take (LATER 236, 237; 2026-10-21; reading, pending review) -- the back-dated mount's adaptation (LATER 124/96), page = room by the controller's ruling, not the console:** the room takes the mount at `after` -- its command when it resolves the ask, K or later under a backlog (`room.ts` `resolveMounts`) -- and strips Scope from the commands above it (the console, online, stays on foot until the host's word, `FUN_00546210` D:L412075-412084, and its Down after the ask clears the knock -- LATER 239). The page keeps its knock at each command and, at the take, whatever the view, re-derives it from the room's `after` at the turret record's return (LATER 237); a d-pad Down clears at once: both pages run the lanes before `walk.frame`, so the Down's own command carries no Scope and the room clears on it, and a lanes ask names the previous command as K -- each ring entry is the room's (LATER 236); a take never heard leaves page and room both cleared on the Down's command. *Was (Option A):* the clear at the end of the Down's frame's `gunFrame`, fitted to a hand-built stream that put the Scope bit and K a command off the pages' order. The visible cost: after a Down between the ask and the take, the reticle keeps a knock the console would clear, through the round trip and its return. Left: a room with no `steer.after` (pinned for LATER 239); a round trip past the ring (`KNOCK_RING`, the ask's window and half a second) or over the mount clip's 17 commands (the rifle firing past K+17); and LATER 240, not reproduced on the page's own commands (a harness artefact; `matchFirearm.test.ts` case 8). *Was:* "into a vehicle from a view from the head → 1, or 2 in a turret ... out of reach" |
| X11 | the release, 2 → 1; every other view stays (no view from before the mount is restored) | `FUN_00545ee0` D:L412018-412019 | `Zoom.setMount(null)` | zoomTable 'LATER 97 ... X11'; matchFirearm 'LATER 97 ... X11' | **held** (LATER 97, 2026-10-19; reading, pending review). *Was:* "out of a turret, 2 → 1 ... out of reach" |
| X12 | the page's own: leaving the walk → 0; the mouse's one button wrapping to 0 | -- | `main.ts` `gunFrame`; `Zoom.cycle` | zoom.test 'the mouse cycle' | open owner call (the PC keys and mouse, O-S4-3: research 101 B8) |
| X13 | the dead do not step the zoom | not traced | `main.ts` `stepZoom` | -- | the page's reading, no ruling (new with X7; research 101 A34) |
| X14 | a spawn → `+0x200` 0, `+0x201` 0xff, `+0x202` 0, `+0x204` 1.0, written by the body's init, not through `FUN_005448a0`; at a classic round's start every living body is spawned again, and the run's applied and target magnification are reset to 1.0 (sourced at the round start only: `FUN_00223680` → `FUN_002a7d40` D:L75935 → `FUN_001fb420` D:L149758 → D:L57659 → `FUN_001f1880` D:L53345-53346; at a respawn after a death, `FUN_00598b90(..., 1)` from D:L412726, that path was not shown and the run's reset is the page's reading -- the death already set 0, so nothing visible depends on it). [Reading: that `+0x113` 3 and 5 in `FUN_00223680` mean "the next round" is inferred from its other branch being the final score's; the function is in `CMPExitState`'s vtable, word at 0x405794.] | `FUN_00223680` L75913-75931 → `FUN_00598b90` L455158 → `FUN_00599b60` (destructor, then `FUN_00553ea0` D:L419886-419889); the run's reset as just said | **was not implemented** (a living player kept its view state, and its 12x, into the next round); now `Zoom.respawn` from `main.ts` `spawnKit` | zoomTable 'FUN_00599b60 -> FUN_00553ea0' | **fixed** |

**The bob (`FUN_005966a0` D:L453823-453849; research 83 §6).** It runs today, ungated by the option: the valve is
OPT-11's.

| # | row | read at | the page | held by | verdict |
|---|---|---|---|---|---|
| B1 | in view states 1, 2, 3 only | D:L453829 | `eyeBob`; `main.ts` `fly.setBody` | zoom.test 'the first-person bob'; zoomTable | held |
| B2 | walking: `Walk_Amplitude` 6 × cos(phase) PS2 px, the phase + push × dt × `Walk_Rate` 15 | D:L453844-453845 (`DAT_0044d4e8`, `DAT_0044d4f0`) | `look.ts` `ViewBob` | look 'moving, 6 x cos(phase)'; zoomTable (four steps, a half push) | held |
| B3 | prone (stance 2): `Crawl_Amplitude` 4, `Crawl_Rate` 8 | the same, `[stance == 2]` | `ViewBob` | look (the amplitude only); zoomTable 'prone' | pinned now (the rate) |
| B4 | both axes pushed: the mean of their sizes | D:L453839-453842 | `ViewBob` | zoomTable 'two axes' | pinned now |
| B5 | one axis pushed: the push **with its sign** (no `fabs` on that branch) | D:L453833-453837 | `ViewBob` takes the size | -- | **differs, not fixed**: the axes' signs (`FUN_002c6110` / `FUN_002c6290`) were not traced, so the direction the phase turns walking back is unknown; cos is even, so a walk from phase 0 draws the same either way; owed (web research 101) |
| B6 | still: no offset (zeroed each frame by `FUN_005b9030`), the phase kept | D:L453831 | `ViewBob` | look 'still, 0' | held |
| B7 | the phase wraps past 2π | D:L453846-453847 | `ViewBob` | zoomTable 'wraps' | pinned now |
| B8 | only with the option `DAT_003df190` (`BOBBING_FIRSTPERSON`'s switch) set | D:L453823 | -- | -- | not implemented: OPT-11's HEAD BOB valve (its default from `PersistentValves`, O15); no default invented here |
| B9 | only the local player (`+0xc0` vtable +0x2c), no vehicle, a stance under 3 | D:L453825-453831 | the page's own camera | -- | out of reach (no vehicle; the page bobs only its own view) |

**Corrections to the bullets above (2026-10-01, this audit).** "The vehicle and ladder paths → 0/1 (`FUN_005463c0`,
`FUN_00579720`)" said the vehicle drops the view to 0: it does not -- `FUN_005463c0` sets 1, or 2 in a turret, when the
view is not already third person (X10); `FUN_00579720` sets 0 but is a two-body action, not shown to be the ladder
(X9). "Out at 3 × the old one" holds, but in and out are the state's way, not the magnification's (S9); and the
magnification is the one the last set wrote (S7, S8). `zoom.ts`'s header carries the same corrections.

**Where the first-person eye sits (MATCH-04's unknown; read 2026-10-01, not settled).** `FUN_0029b2f0` (D:L142695-142707)
puts the zoom on the projection only (`cam+0x470/+0x474` = zoom × `DAT_004a44a8/ac`, and `cam+0x2c8` = `cam+0x2cc` ÷
zoom): it places no eye. `FUN_00297410`, the camera's update, reads no `+0x200`. The switch is in the run: when a zoom
in leaves 1.0, `FUN_001f1610` sets the camera's preset index `cam+0xe4` to 2 (D:L53283, D:L53297) and keeps the old
one in `DAT_003dc348`. The eye of the view from the head is `FUN_0029ae50` (D:L142565-142624; research 86 §4.2 names
it first person): the position of the camera's node (`cam+0xc8`: the body's `+0x2e8` node, or a node named to the
camera's attach, D:L139748-139752) in the body's frame, plus (0, 4.4, −2.5) standing and crouched (z 0 while
`FUN_005a78d0` or `FUN_005a77e0(body, 1, 1, 1)` answers), and in action 2 (prone) y + (max(`cam+0x24` × 6, 0) + 1.8) ×
2 ÷ max(`body+0x1348`, 0.5), z = max(`body+0x1348`, 0.5) × 0.7 × −7; plus the peek (× 3.3 left, × 4.35 right). Which
node `+0x2e8` is was not read here. **Since 2026-10-04 (web sprint 25, PF-05):** research 180 §1.3 read it -- the
`skel_root` (`FUN_0028e7b0` D:L419606-419608) -- and V1 #2 confirmed it, so the page's eye and the room's head are
`cameraRig.ts` `scopeEye` on the root (`SCOPE_EYE_READING`, §11): 15.884 standing, 9.904 crouched, 5.768 prone on
`seal_prone`'s 2.168. The comparison is still PLAT-36's (a recomp first-person frame against the page's, PLAT-30, and
a PEEK of `body+0x200` and `cam+0xd8`).

## 8. Scoped: the kick, the drop and the sway

- **The kick starts only scoped, on the first round.** `FUN_005c5340` (479059-479549), the round's leaving: `if
  (body+0x200 > 4 && weapon) { if (kit+0x818 < 2) FUN_005b91c0(kit) /* the kick */ else FUN_005448a0(body, 1) /* drop
  to first person */ }` (479398-479406). There is no other caller of `FUN_005b91c0`.
- **It ticks only scoped:** `FUN_00550ef0` calls `FUN_005b9280` only when `FUN_005b9990 || FUN_005b90f0` -- state > 4 or
  == 4 (418390-418393). So in third person and in the plain first-person view **the camera never kicks**; the recoil there is
  §4's climbing reticle. **The WEAPON workstream's `rifleKick.ts` kicks on every round in every view -- it wants this
  gate** (`accuracy.ts` exports `kickStarts(zoomState, roundOfPull)` and `kickTicks(zoomState)`).
- `FUN_005b9280`'s kick (472095-472135, flag `DAT_00650938` = 1): rising at `FireRifleKickRate` 0.5 rad/s to `BaseDist
  + RandomDist × rand` (0.09-0.105 rad standing, 0.08 crouched, 0.06 prone); falling at `ReturnRate` 0.18 rad/s to the
  pitch it started from, which an upward pitch stick drags along at 0.04 x the push a game frame (`DAT_00650980`).
- **In a scope the round is exact but for the sway:** `FUN_005bd100` with `body+0x200 ≥ 4` sets the radius 0 and the
  offsets to `(−sway x, −sway y)` (474217-474226). No bloom and no knock scoped (`FUN_005c3360`'s gate).
- **The sway** (`FUN_005b9280` 472136-472185, flag `DAT_00650940` = 1): per axis `p += dt × ((PP + 0.75)|p/L| + PP +
  0.25)`, `L = SniperDistLimit × (0.8 × steadiness + 0.2)`, and at ±L the sign of `SniperDistPPFrame` flips -- in the
  weapon's own table -- so it swings end to end, a little faster going positive (the +0.75/+0.25). Steadiness is the
  float behind body `+0xeb0` (1 when whole; `FUN_00578150` raises it). The SD standing: ±20 px across at 6.25-13 px/s,
  ±24 px vertically. Turned by §5's tangents and divided by the magnification (§17) that is up to 0.018 rad at 3× (0.053 at 1×, what
  the viewer used until 2026-09-29) -- 20 PS2 pixels of the scoped frame -- and **no reader of it
  draws it**: the scope overlay is at fixed frame coordinates (§9), and `kit+0x58/+0x5c`, which accumulate the sway,
  have no reader in the kit's functions. So scoped rounds wander off the scope's cross invisibly [reading: the view's
  own sway, if the game has one, was not found; the viewer ports the rounds' sway as the code has it].
  *Corrected 2026-11-02 ([research 381](381-the-scoped-sway-on-the-view.md); reading, pending review):* the view's own
  sway is there. `FUN_005b9030` (PlayerUpd D:L453084) hands the camera's screen offset `kit+0x28/+0x2c` from view state
  5, and PlayerUpd hands `kit+0x5c` (the y, `-sway y`) to it after the round's cone (D:L453669-453676); the projection
  adds that offset to its centre (`FUN_00294070` D:L138944-138945), so the world moves under the fixed tube and the
  cross stays on the round. The 9x view (state 4) sways the view in y only (the x write goes to the y setter). The
  text above is kept as written.

## 9. The reticle SOCOM II draws

- **The sets** (`BitmapReticule_Init` 0x2178c0, decomp 70828-70870: fixed parts at `hud+0x44bc + 4·type`, floating at
  `+0x44e8 + 4·type`): 0 `ret_sidearm_01/02`, 1 `ret_rifle_01/02`, 2 `ret_shotgun_01/02`, 3 `ret_rocket_01/02`, 4
  `ret_grenade_02` (+ `ret_grenade_01`, the throw meter), 5 `ret_scope_02`, 6 `ret_scope_01`, 7 `ret_binocs/ret_binocs2`,
  8 `nvg_part`, 9 `ret_sidearm_01` + `ret_laser_designator`; `ret_accuracy`, `ret_threat`, `noise50` beside them.
- **The choice** (`FUN_005be300` 474894, kept at `kit+0x54`, sent to `ChangeReticule` 0x213e20): state 4 → 7; a
  magnification over 1.01 → 5; a fitted launcher → 3 (or 1 when out of launcher rounds); then the `ID`: 11 → 9, 4-30 →
  0, 31-80 → 1, 81-90 → 2, 91-120 → 1, 121-140 and 151-189 → 4, 190-253 → 0, 151/152 → none. **The M4A1 SD (62) and
  the M4A1 (54) are set 1**, the sidearms (4-16) set 0, the 870/Spas/Jackhammer (81-84) set 2, the snipers (101-106)
  set 1 until scoped. `reticle.ts`'s `reticleType` and `RETICLE_SETS`; all nineteen bitmaps load with the map
  (`hudBitmaps.ts`), the rifle's and the scope's are drawn.
- **The rifle's draw** (`BitmapReticule_UpdateAccuracy` 0x215250, 69706-69905): the drawn size `hud+0x44b4` is the
  kit's `+0x84c` (`FUN_00216770` 70419), **× 0.5 when `body+0x200` is 0** (third person, 69729-69731); each arm's quad
  starts that many pixels from the centre and is the arm bitmap's 32 × 32 (`+0x452c/+0x4530`) -- so an arm's outer end
  is `32 + size` out. The console frame's rest (outer ends 31-32 out, W2.4) is TargetMin 1 halved. The ring and dot
  (`ret_rifle_01`) are drawn at the centre, which the knock moves.
- **The colours** (`FUN_00215c10` 69906-70294, `FUN_003590e0` on the four arms): (200, 200, 24) at rest
  (`DAT_003dc5a0/a8/b0`; the frame's measured (204, 204, 31)); (24, 200, 44) on a teammate within 320 units (500
  scoped); (200, 24, 44) on an identified enemy; (130, 130, 130) past a launcher's range [corrected by research 94 §C1.5 / R94.16: the grey marks an aimed point *inside* the launcher round's arming distance, 10 m, not past its range]. `reticleTint`; the viewer has
  no targets, so it stays at rest.
- **The scope** (`ChangeReticule` type 5, 69434-69510; `Init` 70870-70940): no ring, no arms; `ret_scope_01` and
  `ret_scope_02` each as four 320 × 320 quads over (0, −96)-(640, 544) with mirrored UVs (0.01-0.99), centred on the
  frame -- not the reticle. Decoded, `ret_scope_01` is the black tube (clear inside a radius of 81 of its 128 texels, 202
  pixels on the frame) with a two-texel grey cross along the centre edges (decoded columns 126-127;
  research 341, reader-backed inspection on 2026-10-16), dashed for its inner 22
  texels; `ret_scope_02` a soft black ring inside the tube (alpha 255 at 95 texels fading to 0 at 44). The F2000 (ID
  63) skips `ret_scope_02`. `scopeLayout`.
- **The binoculars** (`ChangeReticule` type 7, 69510-69572; drawn since 2026-10-01): the weapon's reticle hidden --
  the ring and dot (`hud+0x4544`, `+0x45e0`, `+0x70`), the threat polys (`+0x2930` x4), the six other parts
  (`+0xf0` .. `+0x840`) [corrected by research 321 section 8: `+0x4544` is the target's name and `+0x45e0` its health
  bar, `+0x70` alone the ring and dot; `+0x2930` x4 the four arms, the threat marks `+0x19b0` x8; the six others research
  320's meter and its hidden alternative -- the text before it kept as written] -- and the four mask polys shown at PS2 alpha 128 (`0x43000000`): `ret_binocs` (`hud+0x44d8`,
  set 7's fixed part) as (0, 0)-(320, 448) and (319, 0)-(640, 448), then `ret_binocs2` (`DAT_0040c080`, the same name
  loaded again at 70864; set 7's floating part) over the same two, its alpha set to `DAT_003dc610` = 128 (0x43000000 in
  the ELF). The UVs (`FUN_00359140`): the left quad u 0.01 → 0.97, v 0.01 → 0.99 (0x3c23d70a, 0x3f7851ec, 0x3f7d70a4)
  as stored, the right one mirrored (0.97 → 0.01). Decoded (128 × 128 each), `ret_binocs` is one lens's opaque black
  surround, open towards the bitmap's right edge -- the frame's centre, where the two lenses meet -- and `ret_binocs2` a
  dark grey rim (20-39) with a faint tint (alpha 40) over the open lens. No reticle, no pip, whatever is in the hand
  (`FUN_005be300` puts state 4 first: set 7 for the pistol and a grenade alike). `binocularsLayout`, `Reticle` mode
  `binoculars`; on a frame wider than 640 × 448's shape (Modern 16:9) the black bars fill the sides as the scope's do.
- **The HUD in a scope** (`FUN_001f6ce0` 56025-56066): when the magnification (`FUN_005be660`, 9 in state 4) is over
  1.01 the HUD writes **`ZOOM: %2.1fx`** (string 0x3e3098) at (20, 420), scale 0.9 -- "ZOOM: 3.0x" on the SD -- and
  hides it otherwise; research 87 found no zoom readout. The value is the **state's**, not the running magnification:
  9.0 in state 4 (`case 4: fVar3 = 9.0`), `FUN_005be660` in 5-12, 0 below -- so "ZOOM: 9.0x" in the binoculars from the
  press (`zoom.ts` `hudZoom`, 2026-10-01). The reticle's own `RANGE(m): %.0f` line (`DAT_00408e58`,
  `FUN_00216770` 70440-70448) is shown only in the scope, the 9x view and the night vision (`ChangeReticule`: types 5, 7,
  8), placed at (415, 215) in the scope, (515, 40) in the binoculars and (515, 70) in the night vision
  (`DAT_003dc528..550`, read off the ELF: 415/215, 515/40). Both are drawn (`hud.ts`: `zoom`, `scopeRange` at
  `HUD_LAYOUT.scopeRange` or `binocularsRange`; `hud.setZoom(zoom.hudZoom(), zoom.binoculars())`); the night vision's
  is not (its magnification is 1.01). `FUN_002122a0` (68371)
  hides two more HUD parts whenever the view is first person or scoped (state > 1), not identified.
- **The accuracy pip** (`ret_accuracy`, `hud+0x1f0`): placed at the centre + body `+0xe44/+0xe48` (clamped to 200
  pixels), which `FUN_005aa6e0` (464351) sets to the screen position of where the **muzzle's** ray actually lands; hidden
  while that is inside the reticle, faded in and out 32 a frame. It marks an obstructed muzzle. Not drawn yet: it needs
  the WEAPON workstream's muzzle leg (§10). [AD-2, 2026-10-15: drawn since (`fire.ts` `blockedMuzzle`); its two rays,
  the eye's (`FUN_005aa6e0`) and the muzzle's (`FUN_005b6240`, called at D:L464333), take the original's admission --
  §19, "AD-2". Was: the muzzle's ray took "the first polygon met", and so did the pip's eye ray, unfiltered (LATER 35).]
- **SOCOM 1 against SOCOM II.** reCOM's `BitmapReticule` (`Apps/FTS/hud/hud.h:465-520`; `hud_bitmapreticule.cpp` is
  empty) holds the same family -- `m_reticuleTex[10]`, `m_floatingreticuleTex[10]`, four floating polys, four scope
  polys, eight threat polys, `m_accuracyxtex` -- **plus `m_minsize`/`m_maxsize` on the HUD**. SOCOM II's HUD object has
  no such pair: the range moved into the weapon's per-stance `TargetMin/Max`, the size into the kit, and the draw gained
  the third-person halving and the knock's offset. The viewer's reticle before this work was already SOCOM II's own
  bitmaps at the console's rest place (W2.4); what was not SOCOM II's was its behaviour -- a 0..1 "spread" pushing the
  arms to 1.5× (an estimate), the ring fixed, the knock mapped onto that spread as 12/45 of it, no colours, no sets,
  no scope.

## 10. What the viewer does now, and what others must call

- `accuracy.ts` -- `Accuracy`: `update(dt, {stance, velocity, airborne, yawRate, pitchRate, zoomState})` (one
  continuous `tick` of `dt`, the per-frame terms -- `TargetDilateUponMovement` and the exertion's raise -- x dt /
  `GAME_FRAME_DT`, each frame reading its own look rate: **MISSION R8, a known deviation the owner ruled 2026-10-04**,
  [research 208 §9](208-the-game-frame.md); the original steps them once a 30 Hz frame, as PF-02 had run them through
  `GameFrameAccumulator`, and the per-second totals are the original's; the server's `ShotCone` feeds it one 1/60 s
  command at a time, so page and room run the same continuous law: at a round the page stands at most a part-tick
  past the room (measured at most 0.39 px), inside the cone slack PF.R9, which is kept; the honest-rounds test models
  the page's frames at 144 and 30 Hz), `trigger()` (a press or release: the pull's count restarts), `round(zoomState, stance)` → `{dropZoom, kick}`,
  `cone(zoomState)` (tangents), `reticle(zoomState)` → `{size, offset}` for the HUD, `leaveScope()`, `state()`.
  `perturb(dir, cone)`; `roundsPerPull`, `fireInterval`, `nextFireMode`, `defaultFireMode`; `kickStarts`, `kickTicks`.
- `zoom.ts` -- `Zoom`: `zoomIn()` (d-pad Up), `zoomOut()` (d-pad Down), `cycle()` (the mouse's one button: in, and from
  the last level back to third person -- the viewer's convenience), `set(state)`, `update(dt)`, `state()`, `view()`,
  `target()`, `magnification()`, `hudZoom()`, `fov(baseDeg)`, `lookScale()`, `moveScale()`, `firstPerson()`,
  `binoculars()`, `scoped()`; `fireRefused(state, id)`, `reloadRefused(state)`, `hudZoom(state, modes)`.
- `fire.ts` -- `setGun(FireGun)`: `trigger`, `roundsPerPull`, `interval`, `round(dir)`; the range × 10.
- `main.ts` -- the M4A1 SD's record (`HELD_RIFLE`) drives the fire, the bloom and the zoom; `gunFrame` each frame (the
  bloom off `walk.snapshot()` and `fly.pose()`'s look rates, a look jump over 45° a frame counted as a placement; the
  zoom's run and `fly.setFov(zoom.fov(base))`; the LOOK workstream's `fly.setZoom(magnification, mode4)` when the camera
  has it). **The right mouse button is the zoom's press** (it was the held first-person aim: the game's first zoom step
  is that view, so they are one); the view from the eye shows while the zoom is at 1 or more (the held aim lane went
  on 2026-09-29; first person, state 1, came back on 2026-10-01).
  **`B` switches the fire mode** (free; not while scoped). The hook: `zoom()`, `zoomIn()`, `zoomOut()`, `cycleZoom()`,
  `fireMode()`, `switchFireMode()`, `accuracy()`, `trigger(down)`.
- **Requests.**
  - UI (the pad): **done at the merge** -- `zoom` = d-pad Up → the game's no-wrap step in, `zoomOut` = d-pad Down, and
    `fireMode` = L3 (replacing the launcher's crouch shortcut there; the stance is Triangle); the walk hint reads
    "right click zoom · d-pad up/down zoom · B fire mode". The zoom and the fire mode do nothing while the grenade is up.
  - HUD: draw `ZOOM: %2.1fx` and the scope's `RANGE(m)` line (above) off `hud.setZoom`; `hud.setFireMode` is fed.
  - WEAPON (`rifleKick.ts`): start the kick only when `kickStarts(zoom.state(), accuracy.rounds())` and tick it only when
    `kickTicks(zoom.state())`; unscoped the camera must not kick. **Done at the merge**: `FireGun.kickStarts/kickTicks`
    gate `Fire`'s `RifleKick`, whose per-stance numbers now come off the parsed stances (the parser's inheritance). The two-leg shot sends its muzzle-leg hit
    (`fire.ts` `blockedMuzzle`) to the reticle for the accuracy pip (§9).
  - LOOK: `fly.setZoom` is called with `ZoomMode[state − 4]` (1 unscoped) and `mode4`; the move stick's × 0.2 is
    `zoom.moveScale()`.

## 11. Placeholders and readings, by name

| what | value | why |
|---|---|---|
| the aim-to-muzzle depth ratio in the knock clamp and the cone | 1 | `FUN_00290830`'s two depths ≈ equal at range |
| steadiness (`body+0xeb0`) | the exertion, ported (§17) | the pitch stick from the mouse's pitch rate is a reading; its divisor `pitch_rate` x 1.72, no stick gain (LATER 351, 2026-10-25) |
| the room's pitch throttle without the zoom (`CONE_PITCH_MAGNIFICATION_READING`, `net/shotCone.ts`) | was 1 | retired 2026-10-26 (LATER 476): the look's own divisor is `1 / zoom.lookScale()` (`FUN_005be660` D:L453807-453812, × 0.2 more in view state 4, D:L453813-453816) -- the page's throttle inverts it (`look.ts` `pitchStickInView`) and the room's cone the command's (`AimMover.lookScale` from `lookGate.ts` `lookScaleOf`); was: the page at the zoom on screen and the room at 1 (binoculars at RECRUIT: the page 0.78 at the settled x9.0 on screen, the room 0.087, for the original's 0.65) |
| the room's scope level (`CONE_SCOPE_LEVEL_READING`, `net/shotCone.ts`) | the scope's least magnification | LATER 476's review (F1): the command carries the scope bit, not the view state, so `lookScaleOf` gives a scoped command 1 / `ZoomMode[1]`; on the M40A1 [1.5, 6, 12] at state 6 the page reads RECRUIT's full push 0.65 and the room's cone 0.325. Settled by the level on the wire, or the room tracking the zoom steps. P13 (2026-11-02, the online-parity sweep's AR-8): no verdict reads it while `CONE_SWAY_BOX_ADAPTATION` stands (a scoped command's exertion feeds no check); it goes live with that box's build, LATER 640, which settles it |
| the room's scoped box (`CONE_SWAY_BOX_ADAPTATION`, `net/shotCone.ts`; P13, the sweep's AR-1) | the whole box, +-`SniperDistLimit` at the most exertion, magnification 1 | an adaptation, the room's trust (no original: the game has no server): the page's scoped round leaves at the sway's point (§8, divided by the magnification, §17), the room takes any claim in the box -- at least three times an honest round's reach at a 3x scope and up to about eight at a low exertion (3 / 0.36: the sway steps only while the exertion is over 0.2, `FUN_005b9280` D:L472139, so its limits never close below 0.36 of the box); honest play untouched. The point's check over the window with a named slack is LATER 640; research 91 §16 |
| the room's raise (`ROOM_RAISE_TRUST_ADAPTATION`, `match/src/room.ts`; P13, the sweep's AR-3 = WK-4) | none: the page refuses | an adaptation, the room's trust (no original): `FUN_005c0ae0` refuses a bullet-class round below a full raise (D:L476420-476438; research 215 §8.3-8.5); the page holds it for the rifle (LATER 180) and the rocket launcher (LATER 192), the room only the launcher's take-up and the firearm's way back (`heldReadyAt`, `firearmReadyAt`), so a forged page fires 2 game frames early from a lowered rifle or launcher; honest play untouched. The room's own raise is LATER 641 |
| the look gate's kick term (`net/lookGate.ts` `lookAllowance`, `kickingView`; P13, the sweep's AR-5) | `LookContext.kickRate` on a command with `Button.Scope` or `Button.Binoculars` only | reading, pending review: the kick starts and ticks only in the 9x view or a scope (§8; `kickStarts` / `kickTicks`), so the gate's pitch allowance takes its rate there alone, on the command's own view (an unscoping command's kick laid a frame late rides in the bank, `LOOK_SLACK_TICKS_PLACEHOLDER`; `lookGate.test.ts` 'leaving the scope mid-kick'). Was: on every command -- a forged unscoped page had 0.5 rad/s of pitch over the fastest stick and the return. `OPEN_LOOK_CONTEXT` holds no pitch in any view |
| the airborne term | `(vx² + vz²) / 65` while `airborne` | `+0x1350` read as the carried air velocity, bit 5 as airborne |
| the look rates (`LOOK_JUMP_READING`, `accuracy.ts` `lookRates`) | differences of `fly.pose()` a frame (the page) or of the command's yaw/pitch a tick (the server's `ShotCone`) | the body's `+0x44`/`+0x60` (`FUN_005c2670` 477256); a jump of 45° or more is a placement -- the game has no such gate |
| the scoped sway | ported, not drawn | no drawing reader found (§8) |
| the scope's eye standing (`HEAD_HEIGHT_READING`, `stature.ts`) | 18.3 | an estimate: 0.936 of the measured 19.6 stature (web sprint 2, W2.3). **Retired 2026-10-04 (web sprint 25, PF-05; research 180 §1.3, V1 #2):** the eye is `FUN_0029ae50`'s on the skeleton root (`SCOPE_EYE_READING`); the 18.3 stays only for the placeholder head capsule, renamed `HEAD_VOLUME_HEIGHT_READING` |
| the placeholder head capsule's height (`HEAD_VOLUME_HEIGHT_READING`, `stature.ts`) | 18.3 | an estimate: 0.936 of the stature (W2.3), read only by `net/hitVolumes.ts`'s fallback volumes without a skeleton; PF-21 (sprint 28) retires those volumes for `skeletonVolumes` |
| the view from the head's eye (`SCOPE_EYE_READING`, `cameraRig.ts`) | posed `skel_root` + (0, 4.4, -2.5); prone + (max(6q, 0) + 1.8) x 2 / max(n_y, 0.5) up, max(n_y, 0.5) x 0.7 x -7 ahead: 15.884 standing, 9.904 crouched, 5.768 prone | `FUN_0029ae50` (D:L142565-142624) on `cam+0xc8` = the body's `+0x2e8` = `skel_root` (`FUN_002956e0` D:L139749-139750, `FUN_0028e7b0` D:L419606-419608); research 180 §1.3, CONFIRMED by V1 #2. A reading for one step: that `FUN_00295b00`'s view is the scope's and first person's; the z 0 while `FUN_005a78d0` / `FUN_005a77e0(body,1,1,1)` answers is not taken. Owed: PLAT-36's first-person frame standing and prone, PINE `cam+0xd8` (research 206 §4.4 S2 item 2). The page stands it on the posed root, the room (`headPoint`) on the move's or the stance's |
| the prone eye's inputs (`PRONE_EYE_TERMS_PLACEHOLDER`, `cameraRig.ts`) | was: look term q 0, ground normal y 1 | replaced 2026-10-31 (PRONE-TILT-2 (2), research 217 s7.7): the ground normal's y is the body's saved floor normal (`body+0x1348`, `Walker.floorNormal`), carried in the room's frame (`AimFrame.groundNormalY`); the look term is `PRONE_EYE_LOOK_PLACEHOLDER` |
| the prone eye's look term (`PRONE_EYE_LOOK_PLACEHOLDER`, `cameraRig.ts`) | 0 | q (`cam+0xb4` -> `+0x24`) has no settled meaning (research 180 §1.3); 0 is a level or downward look |
| the view from the head kept off a wall (`HEAD_EYE_WALL_BACK_PLACEHOLDER`, `cameraRig.ts`) | 0.1 | an estimate, no source: the page's eye and the room's start head (`room.ts` `startRefused`) put 0.1 short of a wall between the body's axis and `FUN_0029ae50`'s eye, along one line (`cameraRig.ts` `headEye`, level at the eye's height; shared since 2026-10-04: the page stops at a camera surface, the room at any polygon, so a wall the camera skips still holds the room's head on the body's side). Owed till PF-16: the room's line stands at the stance root's eye (prone 5.4), the page's at the posed root's (about 5.77), so a wall top between the two can refuse an honest prone start. The original needs none: its prone probe, a fan of segments (PF-16), keeps the body off a wall; the port's shared radius 3.5 leaves the prone eye 1.4 past one |
| the prone body's top (`PRONE_HEIGHT_READING`, `stature.ts`) | 3 | resolved 2026-10-05 (web sprint 28, PF-21): the original has no prone height; `PRONE_HEIGHT` is the prone size class's 6.0 (`FUN_0054aa30` D:L415119-415122), the old name an alias for the held `main.ts` (research 180 §1.4, research 217 §4) |
| the kick's stick follow (`STICK_FOLLOW_PLACEHOLDER`, `rifleKick.ts`) | 0, now `STICK_FOLLOW` 0.04 x the push a game frame | while the kick falls the game raises the rest by the pad's pitch push (`ctrl+0x138` x `DAT_003df198` x `DAT_00650980` 0.04, `FUN_005b9280` D:L472095-472117), capped at the falling pitch; resolved 2026-10-04 (PF-06): `DAT_00650980` = 0x3d23d70a, `DAT_003df198` = 1.0 in `.data`, once a call so once a game frame of 525/15734 s (research 181 §2.9), `ctrl+0x138` the pad's pitch axis in [-1, 1] that also drives the look's pitch (`FUN_002c6280` -> `FUN_002c65b0`, research 202 §2.5); the page reads it from the look law's ramped push (`LookLaw.pitchAxis`: the pad's stick, the arrow keys standing for it), the raw mouse gives 0; owed, minor: a dump with the right stick held up and one down for the axis's sign on the console (research 202 §2.5); retired |
| night maps (state 3) | ported | `main.ts` reads the map's `NightMission` (§14, `FUN_00318da0` 217135) into `Zoom.setNight`; `test/zoom.test.ts` 'night maps: third person zooms into the night vision' |
| the reticle colour | rest | no targets in the viewer |
| the accuracy pip | drawn | `fire.ts` `blockedMuzzle` (`FUN_005aa6e0`, the 0.008 tolerance each axis at D:L464356-464370, none without a kept aim D:L464339-464341; was: "at 464340-464350") -> `main.ts` -> `reticle.ts` `stepPip` (`FUN_00215250`); its two rays take the original's admission since AD-2 (§19) |
| the reload's blend (`RELOAD_BLEND_PLACEHOLDER`, `weaponPose.ts`) | 0.2 s | the reload clips have no `BlendTime` in `motion.rdr`; the game's cross-fade into a motion without one is `FUN_00287620`'s 0.4 (`BLEND_TIME_DEFAULT`, `locomotion.ts`), but whether the reload overlay takes that path is not traced. **Resolved 2026-10-03 (research 150 §3):** a still reload is a main-channel play, in over its `BlendTime` default 0.4 and out over the next play's from its last key; the moving overlay is the second channel, laid at 1.0 with the body's 0.4 s cross-fade at its start and end (`OVERLAY_BLEND`) |
| the reload's length without its clip (`RELOAD_SECONDS_PLACEHOLDER`, `reloadClip.ts`) | 2 s | a fallback only (a source or a server without `MOTION_P.ZAR`): the reload lasts its clip's `playback` -- `seal_reload` 1.6, `seal_crouch_reload` 1.9, `seal_prone_reload` 1.7, `seal_mv_reload` 1.2 (§18); the page and the room read one table (`reloadClip.ts`, launch fix MJ-1). Web sprint 4 M4 (research 94 §C1.2): re-derived from the record where it has `ReloadTime` (still: the clip lasts it, clip or none) and the class's clip family; the lock is `ReloadDelay` + that; the 2 s stays only for a clipless source and a record without `ReloadTime` |
| the swap's hand-off phases (`HAND_OFF_READING`, `kit.ts`) | stand 0.72, crouch 0.82, prone 0.62, moving 0.79 | a reading of the code's own constants: the phase at which the callbacks (`FUN_005a7730` / `FUN_005a75d0`) move the pistol to the hand -- the swap actions' trigger `FUN_00588bc0` sets (D:L446304-446398, research 181 §2.7) and the overlay's `+0x1f4` = 0.79 `FUN_0057a010` sets for kinds 6 and 5 (D:L438603-438624, research 211 §1); pending review, the name keeps its suffix |
| the weapon's ease between mounts (`MOUNT_BLEND_READING`, `heldItem.ts`; retired 2026-10-04) | none: the weapon goes onto its new mount at once (0.4 s, `BLEND_TIME_DEFAULT`, until 2026-10-04) | retired by the owner's ruling, 2026-10-04, in the controller's seat ("is the ease the animation? yeah try swapping that now"; C3-MOUNT), over the 2026-09-29 ease (the owner's playtest; review 3, E1): the game re-parents the weapon's node at once (`FUN_005a7260`, `FUN_005a70f0`; `FUN_005a7730` / `FUN_005a75d0`, D:L462350-462416) and the swap clip has no `BlendTime`, so the only smoothing is the body's pose cross-fade, `FUN_00287620`'s default 0.4 (research 181 §3.5, research 202 §3.11); `MountEase` is now `HeldMounts`, which draws each weapon on its mount's matrix as it is -- the swap clip's first key, its muzzle 3-4 units off the idle's, drawn as the game draws it |
| the aim weight without the raise (`AIM_WEIGHT_PLACEHOLDER`, `animator.ts`) | 1 | the rifle taken as up when a mover gives no `aimWeight`; unreached in play (the page and the remote bodies always give one, `FUN_00286b80(actor+0x1160)`) |
| the binoculars' way down (`BINOCULAR_LOWER_READING`, `binocularPose.ts`) | the raise played backwards, then a 0.4 s fade | a reading: READERC's anim set names only `Stand / Crouch / Prone -> Binocular` (and the pistol's), reCOM's enum has no lowering type, and the call that plays the clip on a body was not found in the decomp (§7); a swap clip's reversed play (`ActionReversed`) is the nearest the game has |
| the binoculars' clip over the whole body (`BINOCULAR_BODY_READING`, `binocularPose.ts`) | every part, full weight once blended in | a reading: as the throw's clip is laid (`throwPose.ts`); whether the game blends it over the upper body only is not traced |
| the room's schedule slack (`FIRE_SCHEDULE_SLACK_ADAPTATION`, `net/fireGate.ts`; LATER 588 (a)) | 2 ticks | an adaptation, no original (the console has no command gate): the page names a round up to a tick either side of its moment (LATER 347, LATER 338); §6 |
| the room's schedule window (`FIRE_SCHEDULE_WINDOW_ADAPTATION`, `net/fireGate.ts`; LATER 588 (a)) | 7 ticks | an adaptation, no original: a page frame under the 0.1 s clamp (6 ticks) and a tick of naming, inside which a late round keeps its chain's schedule; §6 |
| the page's mirror of the room's gate (`ROOM_GATE_MIRROR_ADAPTATION`, `fire.ts`; LATER 587's second fold) | online, no round the room's gate refuses at its named command | an adaptation, no original; replaces the first fold's `PRESS_TICK_FLOOR_ADAPTATION`; §6. The page and the room can drift after a refusal only the room makes (cone, muzzle or early through `refuseRound`, nofire): the room is the more lenient side on every path found, so no honest round is wrongly refused, but that is unproven and has no test |
| the fire mode a weapon comes up in (`DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION`, `accuracy.ts` `defaultFireMode`, `fullAutoDefault`; OT.R100, the owner, 2026-11-03) | automatic for every weapon whose modes include 3, at spawn, the page's mount and a pickup | a browser adaptation on the owner's ruling, no original: the original's spawn default is burst where enabled, else the first mode (`originalSpawnFireMode`, `FUN_005c0250` D:L476181-476192, §6), and a pickup's the highest mode in the hand, the first at a swap (`pickupFireMode`, research 323 R323.11). It moves the spawn default of 20 weapons: off burst, the 15 with single, burst and automatic (M4A1, M4A1 SD, M4A1-M203, 552, 552SD, AK-47, AKS-74, AK-105, KBP OTs-14 Groza, HK5, HK5SD, F90, 9mm Sub, MP5K, F2000); off single, the 5 with single and automatic (Model 18, M14, JACKHAMMER, SA-80 A2, Steyr Aug); the automatic-only M60E3, M63A and .PKM already come up on it (`weapons.parity.test.ts`). The player's in-game L3 switch (`FUN_005c4600`) overrides it, kept per slot across respawns while the weapon is unchanged (`matchFirearm.ts` `spawnKit`) |
| the tracer's start without a muzzle (`MUZZLE_READING`, `fire.ts`) | (1.2, -1.5, 3) units in the view's right, up, ahead | a reading, no source: an offset from the eye drawn only when the shot has no muzzle point (no held weapon's muzzle, or the aim point too near it: `fire.ts` `drawTracer`'s `fromMuzzle` false) |

## 12. Evidence

Screenshots (PS2 presentation, Frostfire spawn A; `socomlegacy/test-fixtures/screens/accuracy/`, git-ignored, from
`e2e/accuracy.spec.ts`): `1-rest.png` (third person, size 1 drawn at 0.5: the console's 65-pixel cross),
`2-moving.png` (W held: pinned at 26, the arms 45 out), `3-burst.png` (automatic held 0.45 s: the reticle climbed and
opened), `4-first-person.png`, `5-scope.png` (the SD at 3×: the tube and the dashed cross). The binoculars
(`e2e/binoculars.spec.ts`, 1280 × 720, Modern): `test-fixtures/screens/binoculars/binoculars.png` -- the Mark 23 at 9×,
the two-lens mask with its rim and the black bars beside it, "ZOOM: 9.0x" and the RANGE line at (515, 40).

## 13. Penetration: what a round goes through

`HandleIntersections` (0x3c9b70, decomp 319920-320067) walks a round's intersections nearest first, from the round's
origin, skipping the shooter's own nodes; `FUN_003c8920` (319339-319527) takes each:

- **Passed over, no effect:** a material whose `PENETRATION` (material `+0x24`, `materials.rdr` SOILS; the table is
  `@s2u/scene`'s `materialTable`) is exactly 1.0 -- `PARTICLE_SYSTEM`, `ACTION`, `INVISIBLE_DI`, `ITEM`, the `*_VOL`s.
- **Out of range:** a hit farther than the round's remaining range (`projectile+0x94`, squared) ends the round there,
  in the air, unmarked (return 4). The range starts at `Maximum_Range` x 10.
- **Struck:** the node's damage callback, the mark (`FUN_003d0ba0`), an AI noise, the impact (`bullet_hit_<material>`),
  then the penetration: `next = (range + range x Piercing x 0.1) x PENETRATION`, the range becomes `next` when smaller;
  the round goes on (return 2) while this hit lies within the range, else it stops here (4). `Piercing` is the round's
  (`ZAMMO`, ammo `+0x14` by `FUN_003d4520`): **3 for 5.56 x 45mm**, so a round keeps `1.3 x PENETRATION` of its range --
  glass 0.99 (1.287: nothing lost), `GLASS_MEDIUM`/`METAL_GRATE_THIN` 0.985, `CHAINLINK_FENCE`/`CAMO_NET` 0.98,
  `PERSON` 0.97 (1.26), `METAL_RAILING` 0.95, `LEATHER` 0.9, `FABRIC_HEAVY` 0.85, `RUBBER`/`LEAFY_TREE`/`THATCH` 0.8
  (1.04), `SNOWY_TREE` 0.7 (0.91), `WATER` 0.6 (0.78), `BARREL` 0.5 (0.65), `METAL_GRATE` 0.4 (0.52), `METAL_THIN` and
  `PIPE_STEAM` 0.35 (0.455), `WOOD_THIN` 0.25 (0.325); every other material 0 -- stone, dirt, wood and metal thick,
  plaster, glass thick and opaque -- stops it. There is no count limit: only the range.
- A launcher's round (`FUN_003c5d20`) stops at any non-liquid surface; `RICOCHET` is read and never used.

`accuracy.ts`'s `penetrate` is the walk; `Fire.setPenetration` takes the material byte to its `PENETRATION` (`main.ts`:
the effects' material names to `materialTable()`); every surface struck is marked and its impact played (`Shot.through`,
the round event's `through`); the eye's ray to the point under the reticle passes over the 1.0 materials too.

**LATER 413 (2026-10-24; reading, pending review): the round's own segment query passes the camera-only faces.** Source
inspection of the decompilation; no game run. The projectile queues its intersection object (`projectile+0x28`) on the
collision world's pending list each frame -- `FUN_0031dd90` (D:L219868-219903, called at D:L320432): type 2, a
segment from `projectile+0x48` to `+0x54`, at the world's `+0x150`, counted at `+0x550` -- and the world's collision
task `FUN_0031de30` (D:L219905-219910, no direct caller: a scheduled task) runs the whole list through `FUN_002d3cf0`
(D:L175409-175734), which tests each polygon by `FUN_002d3030` under the query-class flag `DAT_0044d758`
(D:L175299-175312): at 0 a polygon is taken only with surface-word bit 18 clear (`m_cameratype` bit 0); at 1 only with
bit 19 clear and not VOLUMETRIC. The flag is set only by `FUN_002d4fd0` (D:L176021), around the eye's aim query and
back to 0 (AD-2's table above), so the batch runs at 0: **a round passes every `m_cameratype` 1 or 3 polygon** (bit 18)
and still meets an `m_cameratype` 2 one (bit 19 alone) and the rest; `HandleIntersections` then walks what is left
(the pass-over materials, the penetration). So the port's round trace, every polygon (`round.ts` `roundPath` ->
`segmentHits`; `fire.ts`'s `segmentHit` without a penetration table; the room shares `roundPath`), meets faces the
original's passes -- the camera-only frames 0.5-1 u in front of Frostfire's three breakable panes, so a round down the
pane's line stops short and never breaks it (LATER 413, issue #505). The type-2 branch also records only a polygon
with surface-word bit 1 set (`m_ditype` bit 1, D:L175350-175352; LATER 413's review, 2026-10-24), as the aim's queries
require it (AD-2's table): ported (`roundAdmits` takes both). Not read: the function's front-only mode (`DAT_003df270`
0x20 / 0x30, D:L175276-175281) -- whether a round's segment runs under it.

**LATER 416 (2026-10-26; reading, pending review): a blast's rays take the round's class.** Source inspection; no game run.
The blast's two rays queue through the same `FUN_0031dd90` (type 2) and so run in the same batch at `DAT_0044d758` 0 (the flag's setters raise it only around the immediate `FUN_0031e1d0` queries and the camera's span -- D:L176021, D:L143370/143373 under `DAT_004161c0` with resets at D:L143656/143678, D:L441228-441284, D:L453962-453971, D:L464117-464125; the batch, `FUN_0031de30`, is argued to run outside those windows, not traced; the front-only mode gap above holds for it too):
the line to a body's head (`FUN_005ac070` D:L464853) and a destructible's reach line (`FUN_003c80e0` via
`FUN_003c7ee0` D:L319056). Both therefore pass the camera-only faces and record only side-bit faces, as the round does; a bit-19-alone face (`m_cameratype` 2) is kept.
Ported: `blastSeen` (`net/blast.ts`, the room's head and charge lines) and `blastLine` (`sceneHealth.ts`, the reach
gate's surfaces) take `roundAdmits`; *was* every polygon, so a camera-only frame (Frostfire's panes' `camcol`) refused
the blast. `REACH_HITS_READING`'s surface-test clause settled with it (209 §14, 101).

## 14. Night vision

- **Which maps:** the world root's `NightMission` u32 (`FUN_00318da0` 217135: `CWorld+0x5dc`): **MP1 Blizzard, MP5,
  MP7, MP8, MP11, MP61, MP64, MP73 and MP83** (9 of the 22, read off every archive's `MP*.ZED`). On them the zoom's
  first step from first person is state 3 (§7); a weapon switch drops it to first person only off a night mission
  (`FUN_005c4b10`, §7), so on these maps the goggles stay on through a switch.
- **What the game draws** (`FUN_005c1800`, called from the HUD's update 0x205200/0x20a470 in state 3):
  - the goggles: `nvg_part.tif` (256x256: a green inside at PS2 alpha 22, a dark opaque rim), four mirrored 320x224
    quads over the whole frame (`BitmapReticule_Init` 70940-70975), shown by `ChangeReticule` while `kit` is in state 3;
  - the colour: `FUN_003b78d0(0, LensFX_NVG)` loads a colour matrix whose rows are all `(r, g, b) x 0.33` and
    `a x 3.03` of the map's `LensFX_NVG` -- `(0.2, 0.898, 0.2, 0.24)` on every map -- and the camera's colour
    `cam+0xd0` becomes the lens times the fog's; leaving, `FUN_003b78d0(0.25, (1, 1, 1, 0))` eases it back in four steps;
  - `noise50.tif` (64x64), refilled with random texels every frame, over x 5-635, y 75-373 at alpha 64 -- **not drawn**:
    its palette ramp (`FUN_00354a00(tex, 0x42, 0x49, 0x7f)`) is not decoded, and white noise at half alpha is not what
    the frame would show;
  - `.NV_GOGGLES_ON` / `.NV_GOGGLES_OFF` on the way in and out (`DAT_0044ce30/38`, `FUN_005448a0`).
  `LensFX_StarlightScope` (0.3, ...) is the same for a scope on a night map (states 4+) [not ported].
- **The viewer:** the goggles on the reticle's layer (`nightLayout`); the colour as a frame filter on the canvas -- an
  approximation: the game's matrix acts on the lit vertex colours (`0.066 R + 0.296 G + 0.066 B + 0.727`, a lift of
  the night's dark lighting) before the textures modulate them, which only the world renderer can do; the viewer takes
  the rows' weights as a luminance, a gain of 3 for the lift, tinted by the lens. **Request (maps/lighting):** in state 3
  replace each vertex colour's channels by that sum.

## 15. The scope's sway, settled

- `kit+0x58/+0x5c`, which `FUN_005bd100` accumulates the sway into, have **no reader**: the only other writer is
  `FUN_005b9030` (a reset, 471941); every function that touches `+0x58` of a kit-sized pointer was checked
  (`FUN_005be9a0`'s `+0x58` is the body's quaternion).
- The sway is **used**: `FUN_005bd100` runs every frame for the local player (`FUN_00594cf0` 453666, unconditionally)
  and in a scope writes `body+0x5d4/+0x5d8` from `-sway`; each round's direction is perturbed by them through the
  player controller's virtual `+0x74` -- the controller's vtable at 0x4062d0 holds `FUN_00592260` there (0x406344) --
  called by `FUN_005be9a0` for every round. So scoped rounds land off the scope's cross by the sway.
- It is **not drawn**: in a scope (reticle type 5) the tube and its cross are at fixed frame coordinates, the ring and
  arms are hidden; only the damage-direction markers (`hud+0x19b0`), placed about the reticle's centre (`320 + kit+0x20`),
  move with it. The view does not sway. The viewer does the same.
- *Corrected 2026-11-02 ([research 381](381-the-scoped-sway-on-the-view.md) §1; reading, pending review):*
  `kit+0x58/+0x5c` have readers -- `FUN_005b90e0` and `FUN_005b90d0` (D:L471975-471988), called by PlayerUpd at
  D:L453673-453676 for the local player, which hand them to the camera's y offset (`FUN_00291550`, twice: the x one
  overwritten); and `FUN_005b9030` hands the sway itself to the camera's x and y offset from view state 5
  (D:L471951-471957). The view does sway, the world under the fixed cross; the viewer does too since research 381.
  The bullets above are kept as written.

## 16. The sidearm's reticle and numbers

- The kit's sidearm is the **Mark 23** (`mp_seal1`'s second `wep_name`; `ID 15` -> reticle set 0: `ret_sidearm_01`, a
  32x32 dark disc with a 2x2 dot, and `ret_sidearm_02`, a 16x16 arm). `FUN_00215250` draws set 0 as the rifle's
  (type != 2, 3, 9): each arm its own 16x16 quad `size` out from the centre -- `reticleLayout` takes the set's sizes,
  `Reticle.setSet(reticleType(id, state, zoom))`.
- Its record (pinned by the fixture test): `FireWait` 0.2, 12 rounds, `45 ACP` (Piercing 4), `Maximum_Range` 125 m;
  standing `ReticuleKnock` 20 / 60 / 40, `TargetDilateUponFire` 20, `TargetDilateUponMovement` 0.75, `TargetConstrict`
  75, **`TargetMin` 10 / `TargetMax` 30** (prone 14 / 34), `KnockCount` 1 at strength 1 (the first round climbs the
  whole 20), no `FireRifleKick` (no kick even scoped), one fire mode (single), one zoom mode (1.5) -- so d-pad Up from
  first person goes to the binoculars (state 4, `ret_binocs`), not a scope, and so does the page since 2026-10-01 (§7,
  the owner's yes to the binoculars; the 2026-09-29 "no pistol scope" ruling stands -- they are no scope). `accuracy.ts`, `zoom.ts` and the reticle take it as they take the SD.

## 17. The zoom's factor on the round (2026-09-29, the owner: "the zoom is supposed to increase accuracy by quite a bit")

- **The rule** (`FUN_005bd100`, decomp 474236-474266): `fVar8 = cam+0x474`; `fVar9 = d_aim / (fVar8 × (d_aim −
  d_fire))` (`FUN_00290830`: a point's depth along the camera's axis; the aim point `+0x1458` and the fire point
  `+0x1c`); `+0x5d4 = kit+0x20 × fVar9 × tx`, `+0x5d8 = −kit+0x24 × fVar9 × ty`; `+0x5dc = size × ty × 0.707` without
  `fVar9`. `cam+0x474` is `FUN_0029b2f0`'s `zoom × DAT_004a44ac` (NTSC 1.0), fed every frame the **running**
  magnification `DAT_003dc338` (decomp 52802). `cam+0x290` (the tangents' `tx`, `ty`) is `W/2 / tan(fov)` of the
  unzoomed `+0x210` (`FUN_002915f0`): no zoom there.
- **So per view:** third person (1.0) -- the cone is the bloom's square, the knock's offset as is; the night vision
  (1.01) -- the same, the offset ÷ 1.01; the scope (state 5+) -- **no cone at all** (the radius is 0: no bloom from
  moving, turning or firing, §8) and the sway's offset **÷ `ZoomMode[state − 4]`: ÷ 3 on the M4A1 SD, ÷ 2.5 on the
  M4A1**; the 9× view (state 4) -- the sway ÷ 9. Stance and movement act on the scope only through the sway's limits
  (`SniperDistLimit` per stance: 20 / 16 / 12 × 24 / 19 / 15 on the SD) and the move stick's × 0.2 (§7).
- **The viewer before** (`accuracy.ts` `cone(zoomState)`): the offsets were never divided, so the SD's scoped rounds
  wandered up to 20 × 0.0026346 = 0.053 rad (3.0°) off the cross -- three times the game's 0.018 -- worse on average
  than walking in third person with the reticle pinned open. **Now** `cone(zoomState, magnification)` takes
  `Zoom.magnification()` (required, so no caller can drop it again); `accuracy.test.ts` "the zoom on the cone" pins
  the third and measures 600 rounds per stance against third person walking. The reticle is unchanged: the arms are
  the size (halved in third person, §9) and the scope's tube is drawn at fixed frame coordinates, the sway undrawn --
  both as the game. The multiplayer server walks the client's already-perturbed direction (`room.ts` `fire`), so it
  applies the same rule by construction.
- **Steadiness is an exertion, not health** (corrects §8 and §11; ported 2026-09-29). `body+0xeb0` points at
  `{cur, target, mode}` made `{1.0, 0, 0}` (decomp 419589-419598). Each tick `FUN_00550ef0` (418340-418390), for the
  body holding a weapon under a player controller:
  - **raises** `cur` (`FUN_00578150`: `+ x`, clamped to 1, nothing at 1) by `|+0x240| + 0.1 × |+0x23c| + |+0x244|`
    and `0.05 × |controller+0x138|`. The three body fields are the controller's `m_throttle[3]` (reCOM
    `zEntity/zentity.h:159-176`, `CEntityCtrl` at `+0x8/+0xc/+0x10`), copied at 418613-418615 and zeroed in the
    held animation states; `FUN_005966a0` (453738-453864, the player controller's tick) fills them from the pad:
    `[2]` = the move stick's long axis (`+0x240`, forward), `[3]` = its strafe (`+0x244`), both × 0.2 in the 9× view
    or a scope; `[4]` = the look's x after × 1.72, the curve and ÷ the zoom (`+0x23c`, the turn: ω = `turn_maxrate` 2 ×
    it, research 83); `+0x138` is the raw pitch stick (`FUN_002c6280`, also the kick's stick follow) -- *LATER 351
    (2026-10-25; reading, pending review):* the pad's processed axis v.y, `FUN_002c6280` -> `FUN_002c65b0` summing the pad's
    floats (+0x224, +0x22c) after the pad reader's dead zone, curve × gain and ramp (`FUN_002da930`, `look.ts`'s header),
    stored at D:L453772-453773 before the look's × 1.72 (D:L453774) and ÷ magnification (`FUN_005be660`,
    D:L453807-453812; × 0.2 more in view state 4, D:L453813-453816); raised by 0.05 × it
    (D:L418364-418366). From a pitch rate (`pitch_rate` × v.y × 1.72 ÷ magnification) it is |rate| × magnification ÷
    (`pitch_rate` × 1.72) -- no stick gain in the divisor (`look.ts` `pitchStickOf`). Was ÷ `MAX_PITCH_RATE`, which
    carries RECRUIT's 0.65: a full push read 1, not 0.65, raising the exertion 1/0.65 times the original's at every
    setting. The room's cone takes the command's look scale (LATER 476, 2026-10-26; was magnification 1, `CONE_PITCH_MAGNIFICATION_READING`, §11);
  - **pulls** it toward the target 0: `cur += −rate × dt × (0 − cur)`, `rate` = the **raw** stance's `SniperDecayRate`
    (`FUN_0058a720(body, 0)`, `+0x174`, 418349 -- a crouch run decays at the crouch row, where the round and the tick
    read `FUN_0058a720(body, 1)`, which is stand for a crouch run, §3, 477722; `AccuracyInput.rawStance`)
    (−0.04 / −0.05 / −0.2 on the SD: a decay) or, while `FUN_0058a820` says running (`|v|² ≥ 400`), `1 − |+0x240|`
    (a climb); within the step (or 0.005) of 0 it snaps to 0 (`FUN_0052eb60`).
  A round adds 0.35 (479407, every view); entering the 9× view, or a scope from any state but 6, adds 0.5
  (`FUN_005448a0` 410995/411011 -> `FUN_005b9180` 472025). The sway's limits are `SniperDistLimit × (0.8 cur + 0.2)`
  and it moves only while `cur > 0.2` (472137-472185) -- below, it **stops where it is**, so the rounds keep that last
  offset. The breath sound (`FUN_00592b40`, period `(1 − cur) × 0.24 + 0.3` s, 472076-472095) is not ported.
- **What it does, still in the SD's scope (3×) from entering it** (the sway's offset off the cross, mean / worst,
  mrad, each window up to the time; `accuracy.ts`): standing 9.4 / 21.0 to 2 s, 8.6 / 13.1 at 8-10 s (f 0.67),
  5.0 / 9.8 at 30-40 s, frozen at 40.3 s (f 0.2); crouched frozen at 32 s; **prone 6.3 / 11.1 to 2 s, 3.6 / 5.7 at
  5-8 s, frozen at 8.05 s** (483 ticks: `(1 − 0.2/60)^n ≤ 0.2`). Any move stick pins it back at 1; a look adds 0.1 ×
  the turn axis a tick. Client-only: the server walks the client's deflected direction. (Measured at the port's 60 Hz
  tick. PF-02, 2026-10-04, runs the exertion once a game frame of 525/15734 s, research 208: the freezes then come at
  241 frames prone (`(1 − 0.2 × 525/15734)^n ≤ 0.2`, 8.04 s), 964 crouched (32.2 s) and 1206 standing (40.2 s); the
  mrad figures above were not re-measured. MISSION R8 then runs it continuously at the page's frames, the raise x dt /
  `GAME_FRAME_DT`: the pull is already per second, so the freeze times stay within a frame of these.)
- **Found here, ported since:** the move stick's × 0.2 while scoped (453818-453821) reached the exertion's throttles
  (`main.ts`) but not the mover, which walked at full speed in the scope. Now the shared `Walker` takes it
  (`Walker.scoped`, research 80 section 6e), and the server's from the command's `Button.Scope` (not `Button.Aim`,
  which the night vision sets too).

## 18. The magazines: the ring, the reload, the ammo box (2026-09-29)

The owner's report (2026-09-29, the Mark 23): "10/12 -> reload -> 12/12 -> 8/12 -> reload -> 11/12". The rule, from
the decompilation (`socom2_game.elf.decomp.c`) and reCOM (`src/gamez/zSeal/zseal.h:233-236`):

- **The store.** `CZKit` keeps `s32 m_reloads[30][10]` -- ten magazine slots for each of the kit's thirty item slots,
  each holding its own rounds -- and `s32 m_currentmag[30]`, the index of the magazine in the weapon (SOCOM II's kit:
  `+0x1d4 + slot*0x28 + i*4` and `+0x684 + slot*4`; the item pointers `m_item[30]` at `+0xe4`). There is no pool of
  loose rounds and no separate count "in the gun": the weapon's rounds **are** `m_reloads[slot][m_currentmag[slot]]`.
- **What is carried.** `FUN_005ba3d0` (472706-472775, the fill) and `FUN_005ba5b0` (472779-472830, "can this slot take
  rounds") both bound the magazines at `NumMags` (`CZWeapon+0x2c`) of `Ammo_Capacity` (`+0x28`) each, the slots past
  it set to 0; **doubled when the kit holds item 0xC2** (the Double Ammo Load, `-0x3e` in the loop) for a firearm of
  the categories `FUN_003d1a60` gives as 4, 0x1f, 0x33, 0x51, 0x5b, 0x65 (item ids 4-30 the sidearms -- the Mark 23 is
  15 -- 51-80 the rifles -- the M4A1 54), and never more than 10. The M4A1 SD: 3 x 30; the Mark 23: 3 x 12. [Reading:
  the viewer does not double. `mp_seal1`'s `default_weapons` list the Double Ammo Load (`weapons.ts`), which would
  make these 6 x 30 and 6 x 12, but the console frame of a live spawn (research 87 §6, `console_spawn_slot8.png`)
  shows `30/30  2 MAGS`. The item is 0xC2 in SOCOM II (`zweapon.rdr`'s `Double Ammo Load` is `ID 194`, read
  2026-09-29, with the Mark 23 `ID 15` and the M4A1 SD `ID 62`, both `NumMags 3`), but the path that fills a kit at a
  spawn was not traced -- `FUN_005ba3d0` and `FUN_005ba5b0` are the ammo pickup's -- and that frame's kit is not known
  to be `mp_seal1`'s. `magazinesCarried(numMags, doubleAmmo)` holds the rule; `KIT_DOUBLE_AMMO` (false) was what the
  page and the server passed until a spawn with a known kit settled it.] Web sprint 4 settled it and retired
  `KIT_DOUBLE_AMMO`: the spawn's doubling is `FUN_005c75f0` (research 94 §A7), applied through the kit that holds the
  item (`viewer/src/loadout.ts` `withDoubleAmmo`), so a record reaches the ring with its `NumMags` already the kit's.
- **A round** (`FUN_005c1970` 477038-477042, and `FUN_005bc730` 474123-474126, `FUN_005be9a0` 475621-475623) takes one
  from `m_reloads[slot][m_currentmag[slot]]` when it is above 0, and from nothing else.
- **A reload** (`FUN_005c2a90`, 477379-477560): after the gates (not mid-swap `FUN_005a7ab0`, not in the states
  `FUN_005a7d10` / `FUN_005a78d0` refuse), when any of the slot's ten holds rounds, it walks from `m_currentmag + 1`
  round the ring (wrapping at 10) back to `m_currentmag`, skipping the slots `< 1`, and **takes the first slot with
  rounds** (477462-477476) -- whole or part-spent, whichever is next in order, not the fullest. The swap is made **at
  the reload's start**: `m_currentmag = next` (477483), then the reload animation (`FUN_005a82e0`) and the sound. The
  magazine taken out keeps its rounds in its slot; nothing is topped up, nothing moved between magazines. So the total
  -- the rounds in the weapon plus those in the other magazines -- only falls, by the rounds fired. With no other slot
  holding rounds the walk finds nothing, and offline no reload starts. In a network game (`DAT_0045a0c1`, `IsNetwork`:
  research 107) the magazine in the weapon is refilled to `Ammo_Capacity` instead, with the reload's clip and sound,
  for a pistol (class 4) in any network game and, in a respawn game (`DAT_00437ce8 + 0xdc`), for any primary firearm
  but the MGL and the M79 (D:L477490-477541); a like rule hides MAGS in the ammo box: a pistol in the hand, and in a
  respawn game any primary class, the MGL and the M79 included (`FUN_00237760` D:L85181-85192). Research 312; built by
  NET-REFILL. (Corrected 2026-10-14 by NET-REFILL, research 312 §8; was: "read as an unlimited-ammo mode, not
  identified further and not modelled".)
- **The request.** `R` (the pad's reload, `FUN_002c64e0(6)` in `FUN_00594cf0`, 453459-453463) arms the kit's reload
  timer (`FUN_005c32b0`: `kit+0x820` = the weapon's `ReloadDelay`, 0.01 by default); `FUN_005c0fd0`'s frame (476549-476561)
  runs it down and calls `FUN_005c2a90`. **The automatic reload**: mounted, `FUN_005c5340` arms the same timer at the
  magazine's last round; unmounted only at 0 before the spend -- a shotgun's last shell -- else the dry branch reloads
  at once (research 94 §C1.1, re-filed 2026-10-19; which non-firearms reach the arm is LATER 181). *Was:* "**The
  automatic reload**: `FUN_005c5340` (479297-479320) arms the same timer when the magazine in the weapon is empty (not
  for the grenades and the other non-firearms, the item-id list there)."
  **No fullness gate**: the walk from `m_currentmag + 1` (477462-477483) is the only magazine test, so `R` on a full
  magazine reloads whenever another slot holds rounds, and a one-magazine kit finds nothing and does not. The page and
  the server once refused it (an uncited rule that failed the touch spec's RELOAD step); both dropped it in the launch
  fixes (MJ-2: `fire.ts`, `room.ts`; `fire.test.ts`, `magazines.test.ts` and `room.test.ts` pin the walk). A reload is
  refused during a weapon swap (`FUN_00594cf0` 453460-453463: `FUN_005a7ab0` before `FUN_005c32b0`) and in the air
  (`FUN_005c2a90` 477394). It lasts its clip (`reloadClip.ts`, §11's `RELOAD_SECONDS_PLACEHOLDER` only without one).
  `FUN_005a7ab0` is the body's one action lock for the reload's clip and the swap's: the swap gate `FUN_005a8cb0`
  (463150-463160) passes only when `FUN_005a7de0(body,1,1)` does (462594-462634), so a swap is refused while a reload
  plays, and a round (452383) or a reload while a swap plays. The server holds all of it as the page does (review 2,
  M-3 and m-7: `room.ts` `swapRefused`, the frame's `swapping`, the reload's airborne test; `room.test.ts` pins them).
  The swap's clip is the walker's own (`Walker.swapProgress`, the state the page's kit ends its swap on), not a count
  fixed at the swap's start: a standing swap cut by the stick goes on as the moving overlay at the phase it reached
  (`mover.ts`, `FUN_00550ef0` 418226-418245) and ends two commands before the standing clip's length (1.1973 s against
  1.2388 s), so the count refused the page's next swap and its rounds (review 3 B1). The reload's lock counts on the
  room's command clock (`Player.ran`); commands lost past the gap wait count on it as run, each charged against the
  credit, so a loss during a reload does not stretch the lock past the page's, and a number skipped on purpose buys no
  more than the one-second burst the credit already allows (review 3 B1).
- **The ammo box** (`FUN_00237760`, 85128-85201): `"%d/%d"` (0x3e66b8) is `FUN_005c3890` -- the magazine in the
  weapon, `m_reloads[slot][m_currentmag]` (477877-477910) -- over `FUN_005c3ce0`, `Ammo_Capacity`. `"%d MAG%c"`
  (0x3e66c0) is `FUN_005c49b0() - 1`, where `FUN_005c49b0` (478716-478770) **counts the slots with rounds, the one in
  the weapon among them**; hidden below 1, `'S'` unless 1. So with rounds in the weapon MAGS is the other magazines
  holding rounds; with the weapon empty it is one fewer than they (three magazines, the first spent: `0/12  1 MAG`
  until the reload swaps -- then `12/12  1 MAG`).

**Where the 11 comes from.** The page already kept the ring (`fire.ts` since the sidearm round), and from a fresh
Mark 23 the report's steps give `10/12 -> 12/12 -> 8/12 -> 12/12`: the second reload takes the third, whole, magazine.
An 11 needs a magazine left at 11: one round fired from the first magazine and a reload before the report's `10/12`
(that 10 is then the second magazine, and the second reload comes round the ring past the third to the first, as it
was left). That is the game's rule -- a part-spent magazine is kept and comes back in order -- and `magazines.test.ts`
replays both sequences. What was wrong beside it, and is fixed with this section (`magazines.ts`, shared by the page
and the server):

- the **server** (`room.ts`) counted differently from the page -- a reload dropped the part-spent magazine
  (`spare - 1`, the weapon refilled to capacity), so after two reloads it held no spare while the page still had two
  part-spent magazines, and every round the page fired from them was refused by the server; it now keeps the same
  ring and takes the same next magazine;
- the **MAGS** figure was "the other magazines with rounds" -- one more than the game's with the weapon empty;
- `fire.ts`'s header still said a part-spent magazine is dropped.

The counts are pinned by `viewer/test/magazines.test.ts` (the ring, the box, the owner's sequences for both weapons,
the automatic reload, an empty pouch, a swap mid-reload, and the total falling only by the rounds fired over a random
run of rounds, reloads and swaps) and `central/test/room.test.ts` (the server's ring against the same sequence).

## 19. The aim point on a body under the reticle (INT-NET-2, 2026-10-02)

Chris's browser-beta-v5 (`chris/browser-beta-integration` d578f347: `fire.ts` `targetDistance`, `remotePlayers.ts`
`aimDistance`) converges the muzzle's leg on a remote body under the reticle; ours took the eye's ray's hit on the hull
only, so at close range a round aimed at a player before a far wall left the muzzle toward the wall's depth and could
pass beside the body (the triage split on it: netcode "defer", remote players and weapons "best of both"; INT.R6 had the
read decide). The read, before any code:

| value | meaning | citation |
|---|---|---|
| the player's camera calls `FUN_005aa6e0(body, eye, matrix)` every frame while it has a body (and `DAT_0044d688` is 1) | the aim point is found from the camera's eye, as ours | `FUN_00299ed0` D:L142026-142029 |
| the eye's segment: `(0, 0, -r)` through the camera matrix, `r` = max(the weapon's range `FUN_003d27f0`, 600) capped at the camera's `+0xec` | how far the eye looks; ours, since AD-1, `aimReach` (research 232 §8; was: "ours looks `Maximum_Range` x 10") | D:L464097-464114 |
| the shooter's own node is switched out of the query and back (`vtable+0x38` with 0, then its old bit) around `FUN_0031e160` | the eye's ray could meet the shooter's body, so bodies are in the query | D:L464119-464124 |
| each hit (0x20 bytes: point, node, normal, owner) [corrected by AD-2, 2026-10-15: `FUN_002d2890` writes the surface at `+0xc` and the node at `+0x1c` (D:L174887-174888: the hit's words 3 and 7), so the four are point, surface, normal, node; and the node's class is asked only of a hit the material rule does not keep (D:L464171-464194), so an action node whose material is kept is an aim point like any other -- the text before kept as written]: an ACTION node (a `CNodeAction`, the typeinfo at 0x65c638 whose name is at 0x65c618) goes to the action record `+0x3e0` (the door under the reticle, research 92), never the aim; any other is skipped when its material is VOLUMETRIC (`+0x3c` bit 0), LIQUID (bit 1) or of `PENETRATION` >= 0.98 without PICKUP (bit 4; the flag names by the parser, D:L181403-181421: `VOLUMETRIC`, `LIQUID`, `UNDERWATER`, `PICKUP` at 0x3f3798, 0x3f37c8, 0x3f37d0, 0x3f37e0) | glass (0.99), the nets and fences (0.98), the thin grate (0.985), water (LIQUID) and the volumes are looked through; **`PERSON` (0.97) is not** | D:L464134-464156 |
| the nearest hit kept is the aim point: `FUN_005df4e0(body, hit, normal, 0)` writes body `+0x1458` and sets `+0x105c` bit 2; also `+0x3c0`; none, the segment's end | a body nearer than any wall under the reticle is the aim point | D:L464164-464170, D:L464262-464290 |
| offline only (`DAT_0045a0c1` 0: not multiplayer, research 91 §15) a lock branch (`FUN_005ab1c0`, a target flagged `0x200`) may set the aim point instead, through the cone | not online: the match never takes it | D:L464202-464257 |
| the round leaves the muzzle toward `+0x1458` (`FUN_00309200(+0x1458, muzzle)`, normalised) when the aim point is valid | the muzzle's leg converges on the body | `FUN_005be9a0` D:L475535-475559 |
| a launched round lofts onto `+0x3c0` | the same point | `FUN_005bf8a0` from D:L475574 |

So the original converges on a body under the reticle, and Chris's behaviour is the original's (the named
`AIM_CONVERGENCE_BODY_READING` the brief held in reserve for a "no" is not needed). What a body's hit carries is the
`PERSON` material (`DAT_003e14f8`, research 91 §23), so the skip rule above passes it to the aim.

**Ported** (`fire.ts`, `remotePlayers.ts`, `main.ts` one line): `FireSource.targetDistance(eye, ray, reach)` -- the
distance along the eye's ray to the nearest living body drawn -- ends the eye's ray on a body nearer than the hull
(`Fire.bodyAim`), for the round's two legs, the eye's own round, the accuracy pip (`blockedMuzzle`) and a launched
round's loft. The page answers it on the **room's capsules** (`RemotePlayers.aimDistance`: `bodyVolumes` / `rayBody` at
the drawn feet, yaw and posture, each type's stance volumes picked as `Room.volumesOf` picks them, from the page's own
bodies as the loopback's are), not on his rendered skinned meshes (skinned on the CPU for every remote on every shot):
the page converges on the shape that decides the hit. The page's round strikes the body unmarked and with no impact
of its own; the room decides the hit and sends the blood (research 91 §23). *Was* (INT-NET-2 to P12): an extra surface
of penetration 0, the round ending there; since P12 (2026-11-02, the online-parity sweep's SW-2; reading, pending
review) every body on the round's line is a surface at PERSON's 0.97 (`fire.ts` `BODY_PENETRATION`), as the room's
since PF-24, so the wall behind it is marked (research 219 §3.2). The room's checks take the converged ray as they took any (`shotCone.ts` `bound`: the muzzle's
segment meets the eye's ray ahead of both); `central/test/room.test.ts` pins a round converged on a body 25 away.
Tests: `viewer/test/fire.test.ts` (his two cases, the open air, the stop, the eye's own round, the pip),
`viewer/test/remoteAim.test.ts` (his file, re-targeted to the capsules).

**Resolved** -- `AIM_RAY_READING` (*note only*; resolved by AD-1, 2026-10-15): the reach is ported in `fire.ts`
(`aimReach`, `cameraAimCap`, `FireSource.aimCap`, passed by the page's one `Fire` source in `matchFirearm.ts`; reading,
pending review): max(range, 600) capped at the camera's `+0xec`, which is the map record's MID (`CameraParams.mid`,
0x2C) plus the view state's extension (D:L464097-464114; research 232 §8, which files the reading); the round's own
flight stays `Maximum_Range` x 10 (§13). What would prove it: the original's endpoint trace (232 §8.5). The caller is `FUN_002998f0` (D:L142026-142029), not `FUN_00299ed0` as the
table above has it (that one begins at D:L142127). Was: "**Not ported, and so named** -- `AIM_RAY_READING` (*note
only*): ours keeps its eye's ray `Maximum_Range` x 10 long; the original's is max(range, 600) capped at the camera's
`+0xec` (D:L464097-464114), which is not read." The pass rule
is ported (2026-10-10; reading, pending review): the eye's ray looks through VOLUMETRIC, LIQUID and >= 0.98 non-PICKUP
(D:L464149-464151) -- glass, a net, a fence, water, the volumes -- and stops at an ITEM (1.0, PICKUP), by `@s2u/scene`'s
`aimPickBlocks`, the hostage order's pick's rule too (`viewer/src/fire.ts` `eyeStops`, the page's whole material table
by `Fire.setMaterials`); the muzzle's leg keeps the round's own rule (only `PENETRATION` exactly 1 passed over). His `fire.ts` also reads the reload's length from the
record's `reloadTime` before the source's clip; ours is kept (§18, research 94 §C1.2) and his change was not taken.

**AD-2 (web sprint 40, 2026-10-15; reconciliation C10, LATER 35): the accuracy pip's two rays.** Reading, pending review
(the reconciliation's chunk 08 re-read the shared material predicate independently; the rest is this read). The pip is
`FUN_005aa6e0`'s second half: after the aim point it casts the muzzle's segment by `FUN_005b6240` and marks a block.

| value | meaning | citation |
|---|---|---|
| both queries run `FUN_0031e160` -> `FUN_002d4780` -> `FUN_002d2890` with the shooter's own node switched out (`vtable+0x38` 0, then its old bit) | the same machinery, every node but the shooter's: the others' bodies are in both | D:L464119-464124; D:L470353-470358; `FUN_0031e160` D:L220103-220120 |
| `FUN_002d2890` takes a surface only with the side bit (surface word bit 1), then by `DAT_0044d758`: at 0 one with bit 18 (`m_cameratype` bit 0) is skipped; at 1 one with bit 19 is skipped, and one whose material (the raw byte, no default) is VOLUMETRIC | the query's class | D:L174845-174862 |
| the eye's query sets the flag to 1 around its call and back to 0; the muzzle's (its one caller, D:L464333) runs at 0, every setter putting 0 back | the eye's skips bit 19, the muzzle's bit 18 | D:L464117, D:L464125; `FUN_002d4fd0` D:L176018-176021 |
| the hit rule, the same in both: an empty material slot (`DAT_0044f358[i]` 0) is passed; a hit on an `m_cameratype` 1 surface (bit 18 alone) is passed; any other is passed when VOLUMETRIC, LIQUID or of `PENETRATION` >= 0.98 without PICKUP, else kept | one predicate (`aimHitKept`); `aimPickBlocks` for the material part | D:L464145-464159; D:L470381-470397 |
| the material index: `FUN_002dc1d0` reads bits 10-17, 0 the map's default (none for a hit with no surface), and an index past the table's count is 0 | as `surfaceMaterial` | D:L180303-180320; D:L464139-464143; D:L470375-470379 |
| each keeps the nearest kept hit by squared distance from its start, not the first met | `segmentHit` with the filter | D:L464162-464169; D:L470400-470407 |
| the eye's query hands a hit it does not keep, on an action node (`FUN_001821d0` to the typeinfo 0x65c638, or `FUN_005aa470`), to the action record `+0x3e0`, never the aim; the muzzle's drops it | an ACTION volume is no aim and no block | D:L464171-464194; D:L464291-464314 |
| the block: the muzzle's kept hit, when the eye's query kept none (`bVar3` 0), or when it is off the eye's kept point by more than 0.008 on any one axis (x, then y, then z) | `PIP_TOLERANCE`, componentwise, only against a kept aim | D:L464335-464370 |
| the gates before it: no lock branch this frame, an item in hand whose `+0x7c` is not 0xbe, `FUN_005e0010` 1 or `+0xf74` 0x12, the raise `FUN_00286c90(+0x1160)` not 0 | not changed by AD-2: the page's `matchFirearm.ts` asks the pip only with the raise up, unscoped, a firearm in hand | D:L464315-464318; D:L464335-464337 |

**Ported** (`viewer/src/fire.ts`: `aimQueryAdmits`, `aimHitKept`, `Fire.eyeStops`, `blockedMuzzle`): the pip's eye ray is
the shot's own (`eyeStops`: the eye's class and the hit rule), and the muzzle's ray `aimKeeps('muzzle')` (the muzzle's class,
the same rule), the nearest kept; a body on the muzzle's segment (`FireSource.targetDistance` from the muzzle) is a hit
like a wall's, the nearer taken; the tolerance only against a kept aim. The mode-1 query's own VOLUMETRIC skip is not
repeated: the hit rule passes the same surfaces (byte 0's raw slot is `UNKNOWN`, never VOLUMETRIC). Without the page's
material table (a browser fallback) the class is still judged and every material kept. **The shot's own eye ray, and the
M203's loft's, now take the query class as well**, because the pip's eye ray and the shot's are one query in the original
(`FUN_005aa6e0` writes the aim point `+0x1458` the round leaves toward and then casts the pip from it): a change to what
the shot aims at. A surface with `m_cameratype` 1 (bit 18 alone: passed by the hit rule), 2 or 3 (bit 19: skipped by the
eye's query), or one without the side bit (surface word bit 1), no longer stops the eye's ray (`eyeStops`), so the round
and the loft aim past it at the next kept surface; the round's own flight was left unchanged (every polygon, §13; *corrected by LATER 413, §13: the round's own query passes bit-18 polygons, the camera-only faces*), so a round
still strikes such a surface on its way.
Was: "the pip's eye ray `segmentHit(grid, eye, eyeEnd)` and its muzzle ray `segmentHit(grid, muzzle, target)` take the
first polygon met, unfiltered" (LATER 35); and the shot's eye ray had the material rule without the class. Tests:
`viewer/test/fire.test.ts`, the "AD-2" describe (the 44 SOILS and the two built-ins off `READERC.ZAR/materials.rdr`, the
fence, the nearest kept, the class, the shot's class, the predicates, a body on the muzzle's segment, the tolerance).
**Open, not modelled here:** a model whose `+0x80` bit 0 is set ends its polygon loop at its first admitted crossing in
surface order (D:L174831, D:L174890; research 230 §3.4, PAR-50's review F1); with the hit rule applied after the list, a
looked-through polygon first in such a model's order would hide a kept one behind it in the same model. Which models carry
the bit is unread; `segmentHit` keeps every crossing. Settled by reading the bit off the disc's models, or a capture of the
pip through a window of one model. **The other copies of the same query (AD-2's review F1, folded on `agent/ad2`).**
`FUN_005aa6e0` is one query; the port casts it in five places. Besides the shot's eye ray (and the loft's) and the
pip's, four callers cast it through `viewer/src/net/hostageOrder.ts`'s `pickSurfaces` then `crosshairPick`: the
reticle's target pick (`matchFirearm.ts` `aimTarget`), the page's hostage order's pick in the test room (`main.ts`) and
in a match (`matchMount.ts`), both through `hostagePage.ts`, and the room's (`match/src/room.ts` `orderPick`, through
`match/src/hostageOrders.ts`'s re-export). The admission moved to `viewer/src/net/aimQuery.ts` (`aimQueryAdmits`,
`aimHitKept`; no three.js, no DOM -- the server imports it; `fire.ts` re-exports it): `pickSurfaces` takes only what the
eye's query reaches and gives each surface its `kept` (the hit rule over `surfaceMaterial`: byte 0 the map's default,
an empty slot not kept), and `crosshairPick` stops at the nearest kept one (a surface without `kept`, the material rule
alone). So a player behind a palm trunk on M62 or MP62 (`palmtree01/02`, WOOD_THICK, `m_cameratype` 2), whom the
shot aims at since AD-2, is named by the reticle and can be given a hostage order through it, and MP1's
`alaska4d_dredge` (`m_cameratype` 1) the same; the room is the authority for the order and takes the same rule.
Tests: `viewer/test/hostageOrderPick.test.ts`, `viewer/test/matchFirearm.test.ts` ("AD-2 F1"),
`central/test/roomHostageOrders.test.ts` (the order through a palm trunk's face). Was: "**The room** does not cast the
pip; its hostage order's pick (`match/src/hostageOrders.ts` `crosshairPick`, `aimPickBlocks`) is the eye's material
rule without the class, not changed by AD-2 (another task's)" -- `crosshairPick` is defined in the viewer's
`net/hostageOrder.ts` (the server re-exports it), and AD-2 had left the four callers on the material rule alone.

**The line's direction (LATER 305, 2026-10-22; reading, pending review -- the merge controller's call between
readings).** The camera step calls `FUN_005aa6e0(cam+0xbc, cam+0xd8, m)` (D:L142028, when `DAT_0044d688` is 1, an
actor is set and the mode is not 6) with `m` the matrix `FUN_00296f10` has just built from the eye after the pass: its
-z is the eye toward the MOVED look-at target (`viewer/src/playerCamera.ts`'s header, the last line), and
`FUN_005aa6e0` transforms `(0, 0, -range)` by it (D:L464097-464114). So the eye's query -- the shot's aim point, C4's and
the SWITCH's target, the reticle's pick, the hostage order's -- runs from the eye through that target, and the round
leaves the muzzle toward its hit (`FUN_005be9a0` D:L475550). The page had cast toward `FUN_00297410`'s far point
instead (1000 along the pitched look from the goal target); the two agree until the pass shifts the eye (its side and
up probes, at most `CAM_MARGIN` x sqrt 2), when the far-point cast parts from the view by about s/d (d the eye's
distance from the target, at least 0.75). Since LATER 305 the page's third-person `fireAim` far point is on the view
(`playerCamera.ts` `viewFar`, `walk.ts` `follow`), `|far - eye|` long as before; the head's view is unchanged (its
target is on its look).

**The room (LATER 305).** The look's direction is now the eye's place, so the claimed eye cannot merely be bounded: the
work's own probe found an eye forged 1-3 u behind the moved target steering an accepted round 5 to 60 degrees off the
look under a bounded-eye rule (refused by main), and the fix was taken before anything landed. `net/shotCone.ts`
`aimFits` keeps today's rule as the floor -- the aim about the look from the claimed eye toward the far point -- and
passes a round the floor refuses only down the view line from an eye the room REPRODUCES: the original's pass
(`cameraPass`, `FUN_0029bf70`, moved to `viewer/src/cameraRig.ts` so the page and the room run one function) on the
room's hull from a cell's goal eye toward its moved target, the cells the root's pose slack and the lead's run, the
claimed eye within `VIEW_EYE_REPRO_PLACEHOLDER` and the cell's half-diagonal of it (`viewCells`, `reproducedEye`). A page
eye in the pass's hold or regrow, or one on a hull moved since (a door, a crane), gets the floor's verdict; no hull, the
floor alone. At most `VIEW_PASS_CAP_ADAPTATION` (24) passes a claim, nearest the nominal state first. What a forger
keeps (the gameplay seat's read, 2026-10-22): an eye within 0.1 and the cell's half-diagonal of a real camera's turns
the look at most atan((0.1 + half) / the eye's distance to the moved target), about 1.6 degrees at 28 u with a 1 u
cell, more on a close pull-in. And the pass is not continuous across a cell: a wall's pull-in starting inside one can put
an honest eye at its edge past that tolerance of the eye reproduced at its middle; such a claim gets the floor's verdict
(today's), where honest view-line acceptances are lost -- what `VIEW_EYE_REPRO_PLACEHOLDER`'s measurement settles. C4's and the
SWITCH's page eye (`throw`'s and `action`'s optional `eye`) takes the same test and is only ever added to the room's own
eyes (`room.ts` `pageEye`). Cost, measured (a scratch probe): an honest claim 0.005-0.012 ms; a near-miss claim that
passes the cheap bound, at -70 prone just after a stance change by walls, 0.13-0.15 ms -- about 6 ms of the room's time
a second for one connection at the text rate's cap (40 a second); main's far-point check, 0.007 ms. Tests:
`viewer/test/viewAimLine.test.ts` (the page), `viewer/test/shotConeViewLine.test.ts` (the room's rule, the forged eyes,
the reproduction, the moved hull, the cap), `match/test/roomBarriers.test.ts` (the switch's page eye). Was: "the eye's
ray along the view's centre line" with the page casting toward the far point, and the room's cone about the claimed eye's
line to the far point alone.

**The use prompt's ray** (MAP-07, PR #427, 2026-10-22; reading, pending review). The switch under the reticle is
`FUN_005aa6e0`'s action record (`+0x3e0`, D:L464171-464194) on this same segment from `cam+0xd8` (`FUN_002998f0`
D:L142029). `FUN_0029bc90` builds the camera matrix with forward = target - eye, so the port's use ray is the drawn
eye along its look axis (`walk.ts` `lookAim`). Since LATER 305's redo (2026-10-24, after #427 landed) that axis's
point is `fireAim`'s and the reticle's (`aim()`) alike -- `playerCamera.ts` `viewFar`, the eye toward the moved
target, which retired #427's `reticleFar` -- so LATER 308's `aim()` half is moot. A hit not kept on an action node or under one, strictly
nearer than the opaque hit, is the record (`actionRayDetail`); research 230 §3.4 has the per-model first-hit rule the
action ray takes. Tests: `viewer/test/gates.test.ts` ("a switch pick"), `actionPage.test.ts`.
