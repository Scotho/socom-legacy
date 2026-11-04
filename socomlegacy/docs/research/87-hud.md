# SOCOM II's in-game HUD: every element, its bitmap, place, colour and driver (2026-09-28)

The HUD workstream's reading for the viewer's walk mode (`packages/viewer/src/hud.ts`, `hudFont.ts`, `hudAssets.ts`).
Sources, all read-only, nothing launched:

- **The code.** `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (line numbers `Lnnnnn` below), with the
  `DAT_` constants read out of `C:/Projects/socom_pc/dist/socom2_game.elf` (string addresses checked against the
  decompilation's: `0x3e66c0` is `"%d MAG%c"`) and the class names of `recomp/socom2_names.csv`. Values the ELF holds as
  zero were resolved from their static initialisers (`0x3ff610`, the ammo text and the rounds' y; `0x3ff9c0`, the
  health bar's colours) or their runtime writers. reCOM (`research/recom/src/Apps/FTS/hud/hud.h`) names the classes;
  its `.cpp` files are empty.
- **The scripts.** `READERC.ZAR/hud.rdr` holds **no layout**: `static_radio (529 388)`, `dynamic_radio (575 388)`, the
  tactical map's polygon/line colours (`TacMap`) and the single-player tutorial pop-ups (`EventPopups`: 11
  `ActionIcon1stTime`, 119 `AnimCmd`, 2 `HudObjective` triggers). The layout is code. `READERC.ZAR/fonts.rdr` holds the
  two faces, `font_titlebar_01` and the HUD's `font_text_01` (§3).
- **The bitmaps.** Four libraries in every `MP*.ZDB` under `RUN\COMMON\`: `HUD_TXR` (37: the action icons, the pad's
  button faces), `HUD2_TXR` (72: the panels, the compass, the reticles, the nav marks), `HUDW_TXR` (65: the weapon icons,
  the fire-mode rounds), `FONT_TXR` (2: `font_text_01.tif`, `font_special_01.tif`); each against its own `_PAL`.
- **The pictures** (the console's own, PCSX2, 640x448 or 640x480 resized to 448 as the reference's notes do):
  `scripts/parity/refs/console_spawn_slot8.png` (Seeding Chaos at spawn, single player: the ammo box, the reticle, the
  compass, the team list) and, for the multiplayer HUD, `logs/parity/s4_pcsx2/A_ready091.png` (Vigilance, a SEAL in a
  round: ammo box, compass with a nav mark, info box "socomp / 04:49 / 2m", the radio icon), `A_rend053.png` (the
  `CROUCH` word), `A_ready024.png` (the "STARTING ROUND 1 OF 11" banner) -- the last three are not in the repository.

All positions are in pixels of the PS2 frame, **640x448, y down**: `CHUD` writes them straight (§2 on why a 480-line
reading is wrong), top-left corners unless said otherwise.

## 1. The elements of a multiplayer round

`CHUD` (the HUD object; its members are at the offsets named) draws three layers in order 0, 1, 2 (`FUN_001fba70`
L57752, called L50862-50869; `FUN_001f6e10` assigns a layer, 2 by default); the compass ring last (`FUN_00212130`).
The whole HUD is off while `CHUD+0x1a6f5` bit 0 is clear (`HUD_ON`/`HUD_OFF`). Every HUD string's colour is
`DAT_00408e40..4c` = **(128, 128, 128) at alpha 80** (the GS's 128 is 1: white at 0.625); the panels' alpha is **76.8
(0.6)**. On a spawn the ammo box and the team list **fade in**: hidden for 1.0 s, then alpha x (t - 1) x 2 to full at
1.5 s (`DAT_003dc380`, L56760-56800).

| # | element | bitmap / text | place and size | colour, alpha, motion | driven by | in the viewer's walk |
|---|---|---|---|---|---|---|
| 1.1 | ammo box panel | `newweapnbkrnd.tif` (HUD2, 128x64) stretched | x -10..160, y 364..439 (`DAT_003dcb90/98/a0/a8` = -10, 364, 170, 75) | alpha 0.6 x fade | -- | drawn |
| 1.2 | weapon icon | the weapon's HUDW icon (`FUN_005be050`); M4A1: `m4carbine_icon.tif` 128x32 | top-left (20, 389), its own size | alpha 1 x fade | the weapon in hand | drawn (`setWeaponIcon`) |
| 1.3 | rounds | `"%d/%d"` (`0x3e66b8`): rounds in the magazine / capacity | pen x 15, baseline 382, scale 0.9 | text colour x fade | `fire.state().magazine` | drawn |
| 1.4 | magazines | `"%d MAG%c"` (`0x3e66c0`): magazines - 1, `'S'` unless one; hidden with none | pen x 95, baseline 382, scale 0.9 | text colour x fade | the same | drawn |
| 1.5 | fire mode | `firemode.tif` (HUDW, 32x16) x 1, 3 or 4 for mode 1, 2, 3 (`FUN_00237b40` L85254) | x = 15 + 36i, the first moved to 10; y 422; its own size | alpha 1 x fade | the weapon's fire mode | drawn, 3 at rest (the console frame's; `setFireMode`) |
| 1.6 | compass ring | `compass_lo.tif` (HUD2, 128x128) at 0.75 | 96x96 centred on (565, 90) (`DAT_003dc508/50c`; `FUN_00211510` L67950-68287 overrides `CHUD_Init`'s 486-614 x 2-130) | alpha 100 (0.78); **turned** each frame by the player's facing (`FUN_00358730`) | the heading | drawn, turned by the walk's yaw |
| 1.7 | compass marks | `ret_nav_01..24`, `ret_able`, `ret_bravo`, `ret_objective`, `ret_bomb`, `ret_base`, `ret_hostage`, `ret_friendly`, `ret_extraction`, `ret_triangle`, `hud_talk`, `small_compass` (HUD2, 16x16) | 38 slots; within 200 units at radius distance x 0.005 x 65 and their own size, beyond it pinned at radius 64 at 1.2x with a 0.6x arrow at radius 50; most hidden beyond 900 | each type its own RGB (`FUN_002126f0` L68576); types 1-13 pulse alpha 64-128 at 250/s | objectives, team mates, the bomb, **nav points** | the nav points drawn (§10); the rest need objectives or a team the viewer has not |
| 1.8 | info box: health bar | untextured, (0, 128, 64) filled, (128, 64, 64) lost, (100, 100, 100) dead; a hit flashes white to green (`CHealthBar` `FUN_00241cc0` L89935) | (488, 396), 134x18 (`FUN_002388a0`) | alpha 80 | the player's health | drawn full |
| 1.9 | info box: the name on the bar | the player's name, scale 0.9 | centred on the bar, baseline 411 [measured on the Vigilance frames: ink x 535-575, y 402-411] | text colour | the profile | drawn when set (`setPlayerName`); empty by default |
| 1.10 | info box: timer line's box | `newweapnbkrnd.tif` mirrored [measured: x 488-622, y 418-438, its stripe on the left] | -- | alpha 0.6 | -- | drawn |
| 1.11 | round timer | `"%02d:%02d"` | pen (500, 433), scale 0.9 | text colour | the round clock | drawn **static** at 06:00 (`setTimer`) |
| 1.12 | range | `"%dm"` | pen (587, 433), scale 0.9 | text colour | the distance to what the reticle is on | drawn: the shot's own segment's hit, metres (`RangeFinder`, 5 Hz) [the game's source for the number not traced] |
| 1.13 | stance word | `STAND`, `CROUCH`, `PRONE` (`PoseBitmap`, `CHUD+0x11ca0`; it also loads `stance_*.tif`, never drawn) | right-aligned to x 480, baseline 431, scale 0.765 in multiplayer; (545, 380) in single player (`FUN_00222010` L75149) | alpha 127 at a stance taken (`FUN_00221d90`, D:L75090), down 64 a second (`FUN_00221c40`, D:L75042-75048): gone in 2 s | the stance taken: `actor+0x105f` bit 0, raised when the stance is taken (`FUN_00552d60` once `FUN_00552ec0` accepts the request, D:L418879, D:L418899, D:L418904; seven setters besides: `FUN_00553ea0` D:L419779, `FUN_00581660`'s else D:L442472, `FUN_00581990`'s else D:L442580, `FUN_00584c60` D:L444287, and the forced-stance writers D:L438417, D:L443490, D:L443869, D:L444087), read and cleared by `FUN_00582500` (D:L442890-442900) in `FUN_00221c40` (D:L75029-75037); the word is `actor+0x374` (the stance then). LATER 403, reading, pending review | drawn when the stance is taken (`walk.stance()`; was `walk.posture()`, the body, which a crouch run stands -- and, in LATER 403's first fix, `walk.stanceIntent()`, the press, which a pending request shows too early) |
| 1.14 | action prompt | an `action_*.tif` (HUD, 64x64) by flag (§5) | 50x50 centred on x 306, y 365..415 (`DAT_003dc628/630/640`); up to two more at x 306 -/+ 62n | base + pulse x delta (§5); pulse 0-1-0 at 5/s (`DAT_0040d750`) | the player's action flags | drawn; the climb from the traversal's `climbPrompt()` |
| 1.15 | reticle | `ret_rifle_01/02.tif` | the frame's centre | (204, 204, 31) arms | the aim | `./reticle` (W2.4), not this pass |
| 1.16 | radio icon | `action_tune_team/offense/defense/spectators`, `action_no_talk2`, `action_dead_zone` (`FUN_00239570`) with the channel's count | `hud.rdr`'s `static_radio (529 388)`, `dynamic_radio (575 388)`; on the frame a 32x32 box at x 590-621, y 361-392 with a "1" beside it | grey 128, alpha 0 until used | the radio channel | **not drawn** (no radio) |
| 1.17 | event banner | the round's messages ("STARTING ROUND 1 OF 11", "OBJECTIVE: ...") over a mirrored panel | [measured on `A_ready024`: panel x 147-492, y 0-99; the line centred on x 320, ink y 81-93] | panel 0.6, text colour | round events | drawn: the round start (§8), and `flashMessage` |
| 1.18 | help lines | six lines of spectator/death help | x 324, baseline 380 + 18i | text colour | death, spectating | **not drawn** (no death); no "killed" format string exists in the ELF: there is no kill feed |
| 1.19 | team list (single player) | names right-aligned at x 510 (scale 0.855; BLUDSHOT shrunk to 0.74), orders at x 545 (`FOLLOWING`, `HOLDING`, `COVERING`, ... at `0x65caa0`), a 65x14 health bar at x 450, `hud_satchel.tif` at (522, row - 11) when carrying item `0x98`; rows' baselines 379, 394, 418, 433; two mirrored `newweapnbkrnd` halves 435-640 x 364-397 and 405-438 (`CTeamNames` `FUN_00221070` L74747) | -- | alpha 80 / 0.6 x fade | the fire team | **not drawn**: single player only (the console frame's SPECTER/JESTER, WARDOG/VANDAL) |
| 1.20 | tactical map (single player) | `CZNewHudMap`/`CZLineMap` over `AIMAPS.MPS` (§9); its 486-614 x 2-130 rect at zoom 1300 is the closed state, never drawn (corrected 2026-09-28: this row called it a radar) | 232-628 x 62-365 | -- | SELECT | drawn on `M` (§9) |

**1.13's word, case by case (LATER 414, 2026-10-24; reading, pending review).** The word is drawn only when the shown
actor's one-time bit `+0x105f` bit 0 is set, read and cleared by `FUN_00582500` in `FUN_00221c40` (D:L75029-75037;
LATER 403). What raises it is a stance taken -- `FUN_00552d60` once `FUN_00552ec0` accepts the request, the toggle's own
handlers and the forced-stance writers (the 1.13 row) -- and nothing else; the motion code below writes the stance
without it:
- *A dive.* `FUN_0057e540` writes the request `+0x374` = 2 (D:L440912) and pushes its motions (`FUN_00588bc0` ->
  `FUN_0028dc90`, the stance an argument of the push), writing neither `+0x174` nor the bit; the prone stance is taken
  by `FUN_00552d60` once the body is free, which raises the bit: **PRONE shows at that take, after the dive**. *(LATER
  414's review, 2026-10-25:)* when that take comes is `FUN_00552ec0`'s answer (D:L418928-418949: the top play free or
  `FUN_00588080`, `FUN_00579ea0` 0, clip 0x11 not playing, `+0x174` 0 or 1); the dive pushes its plays at stance 2
  (D:L440896-440897) and a pop writes `+0x174` from the play beneath (D:L135104), so whether `+0x174` is 0 or 1 after the
  dive (PRONE) or 2 (the request never accepted, no word) is unread: `DIVE_PRONE_TAKE_READING` (the port: down and at rest).
  This is the held-Triangle dive (`FUN_00594cf0`, D:L453387-453390: the request, no bit). A second entry raises the bit
  at the dive's **start**: a prone request `FUN_00552ec0` accepts while moving -- `FUN_00552d60` raises the bit
  (D:L418879), then, the controller's slot +0x30 and `FUN_00584b00` answering yes, dives through `FUN_0057e540`
  (D:L418887-418893): PRONE shows as the dive begins. The port's press-time dive (`walk.ts`) models the held path only;
  the second is a named gap (LATER 434).
- *A crouched climb.* The climb's start (`FUN_00580b70`, D:L442225-442277) pushes its clips (`FUN_00588bc0`, stance 0
  or 1) and, on its crouched branch, writes the request crouch (D:L442239) -- no `+0x174`, no bit; its end's pop
  (`FUN_0028da00` D:L135104) writes `+0x174` back from the play under it through the stack's `+0x14`, `FUN_0058a6b0`
  (D:L446812-446828: the controller told, `+0x174` written, no bit), so the stance is crouch again, equal to the
  request: nothing is taken. **No word.**
- *A ladder mount.* `FUN_0057f880` (D:L441533-441576) pushes the ladder's clips (stance 5) -- no `+0x174`, no bit, no
  request. **No word.**
- *A turret.* *(Corrected by LATER 414's review, 2026-10-25: the earlier reading had the shown actor become the turret.)*
  At the mount (`FUN_005463c0`, D:L412189-412196) the turret's `+0xc0` is set to the SEAL's own controller (D:L412189),
  whose `+4` is the SEAL (`FUN_002a26f0` D:L146776-146780); then, when the mounting actor is the one shown,
  `FUN_002956e0` sets `DAT_00415ff0`+0xbc -- the actor `FUN_001fcd70` (D:L58313-58316) hands `FUN_00221c40` -- to
  `FUN_001821d0`'s cast of the turret to a `CZSealBody` (D:L139718), which is 0 for a `CTurret` -- in the ELF's type
  descriptors (name, bases) `0x3efd38` is `CZSealBody` (bases at `0x3efd20`: `0x3efb28` at +0x170 and `CEntity` at 0),
  `0x3efd10` `CEntity` (none) and `0x3fbfc0` `CTurret` (bases at `0x3fbfb0`: `CEntity` alone) -- and falls back to its controller's actor (D:L139719-139722): the SEAL. So the SEAL's bit is read while
  mounted: **a stance taken under the mount shows at the take**, and none at the dismount (research 215's
  `TURRET_CAMERA_PITCH_READING` reads the same fallback for the camera). (The `+0xc0` test at D:L75030-75036 is the
  controller's `IsRemote`, which a mount does not change.)
- *The word's text: the request, not the stance taken.* `FUN_00221c40` draws `+0x374` (D:L75036-75037), the request;
  the port feeds `walk.stance()`, the stance taken (`matchFirearm.ts`). They agree at a take's frame (the take makes
  `+0x174` the request); they differ only when the bit is read after a newer request is written and not yet taken -- a
  bit left unread off the walk (`takeStanceTaken` is false there without clearing) and a press then kept pending, where
  the original would show the pending request and the port shows the stance held. Named, not modelled (LATER 414's
  review, 2026-10-26).
The port's own: the dive sets the stance prone at its start (`traversal.ts` `dive`, `walk.ts` `setStance`), the crouched
climb STAND then CROUCH, a ladder mount STAND, a turret take its stance -- each fed to the word as a change of
`walk.stance()`. The bit modelled (LATER 414): the walker's one-time `stanceTaken` raised where the original raises
`+0x105f`, consumed by the HUD, mounted too (LATER 414's review). The setters the port raises at: `FUN_00552d60`'s three
branches (D:L418879, D:L418899, D:L418904: `applyStance`), `FUN_00553ea0` D:L419779 (the body's making, re-run at a
respawn by `FUN_00599b60` D:L455663: the port's new `Walker`), and the prone-pop's own word (the adaptation, labelled).
**Not raised** (LATER 434): D:L438417 (`FUN_00579a30`), D:L442472 (`FUN_00581660`'s else), D:L442580 (`FUN_00581990`'s
else), D:L443490 (`FUN_00583500`), D:L443869 (`FUN_005845c0`), D:L444087 and D:L444287 (`FUN_00584c60`) -- the concrete
case: deep water turns prone to crouch (`traversal.ts`) with no bit, where D:L442472 writes the crouch request and raises
the bit, so the original shows CROUCH there and the port nothing. *LATER 434 (2026-10-26; reading, pending review), deep water
raised:* the per-frame states' demotions -- prone over 2 deep is `FUN_005845c0`'s (D:L443869, for a local controller:
`+0x34` answers 0; then `FUN_00581990`, whose else over 8.5 writes the stand and the bit, D:L442580), crouched past 8.5
is `FUN_00584c60`'s (D:L444087). The port: `Traversal.water`'s two demotions call `markStanceTaken`. *Corrected by
LATER 434's review (2026-10-26):* the press's water writes (`FUN_00581660`'s else D:L442472, `FUN_00581990`'s else D:L442580)
are reached only after `FUN_00552ec0` accepts the request, and for a local actor it refuses both deep requests
(D:L418945-418946 via `FUN_00584c10`, the 2.0 test; D:L418973-418974 via `FUN_005857e0`, the 8.5 test); on acceptance
`FUN_00552d60` raises the bit itself (D:L418879, D:L418899). The local press resolves the water in its own table
(`FUN_00594cf0`: the tap D:L453358-453369, the hold D:L453393-453416) -- crouched 5 deep, a hold for prone STANDS (and
raises the bit at D:L418904), where the port stays crouched; standing 9 deep a tap for crouch raises nothing. Unported:
LATER 492 -- *ported 2026-10-26 (LATER 492; reading, pending review):* the press decides the water in its own table (`stanceButton.ts` `pressInWater`, with `Traversal.stanceAllows`: crouch to 8.5 deep, prone to 2): a tap with crouch refused asks stand; a hold with crouch allowed and prone refused asks crouch from stand and stand from crouch or prone, so crouched 5 deep a hold stands with its bit and standing 9 deep a tap asks nothing new; `Traversal.stanceFor`'s rewrite stays the remote actor's (the room's command) and the page's fallback; the walk's own Crouch bind (`WalkMode.crouch`) asks through the same table; the launcher's set, allowed crouch at any depth, is not asked (`STANCE_LAUNCHER_WATER_READING`) (was, in this note's first cut: "a crouched SEAL pressing prone 2-8.5 deep shows CROUCH" -- wrong for the
player). Still not raised -- each read, none with a port path to lay it on (2026-10-26, LATER 434's second part, §16):
D:L438417 (`FUN_00579a30`: PICKUP BODY, action 8, unported -- `STANCE_WORD_ACTION_CROUCH_READING`, LATER 494),
D:L444287 (`FUN_00584c60`, the refused crouch-move push's fallback: `STANCE_WORD_CROUCH_FALLBACK_READING`), and the dive's
second entry (D:L418879: never the player's, `CSealCtrl`'s `+0x30` answering 0 -- `STANCE_WORD_DIVE_REQUEST_READING`).
*Raised since (434b's review, 2026-10-26):* D:L443490, the prone crawl handler `FUN_00583500` over 1.5 deep, on the frames
`FUN_00586f00` answers 0 -- three branches by the ground states' memory in `+0x105e` (0x08 the last ground frame
crawled or moved, 0x10 it turned, both cleared idle; the second re-look, 2026-10-26): the lateral axis (`+0x244`) past 0.03
always; under 0x10 a forward or back push past the band (forward at least 0.03 + turn^2 x 0.27 or at most -(0.045 +
turn^2 x 0.455)); under 0x08 any |forward| past 0.03; under neither, past a stick within 0.03 of centre, the band
(D:L445057-445085; the first re-look, 2026-10-26):
`Traversal.water` crouches the SEAL with its word. The memory's writers (the third re-look, 2026-10-26): prone, 0x08 on
`FUN_00586f00`'s 0 (D:L443902-443903), 0x10 on a turn past 0.025 (D:L443930-443931), idle 0 (D:L443967-443968); crouch
(`FUN_00584c60`) the same by `FUN_00586f00` -- 0x08 (D:L444142-444143), 0x10 (D:L444196, D:L444231-444232), idle 0
(D:L444322-444323); stand (`FUN_00586570`) by its own test, the lateral or forward axis past 0.03 with the forward part
the band under 0x10 (D:L444861-444948) -- 0x08 (D:L444887-444888, D:L444914-444915, D:L444939-444940), 0x10 by
`FUN_00586050` (D:L444696-444697), idle 0 by `FUN_00586240` (D:L444783-444788). The early returns on a refused clip
push and the crouch idle's `+0x21c` bit-2 path are not ported (`STANCE_MEMORY_RETURNS_READING`). The prone state never asks the water's stick clamp `FUN_005b56c0`
(its callers the crouch and stand states, D:L444163, D:L444173, D:L444865), so prone the factor is 1.

Not found in the ELF at all: `compass_bkrnd.tif`, `action_door_open.tif`, `action_door_close.tif`, `action_defuse.tif`.
**Corrected the same day:** the door icon is named by the *map* -- `READERM.ZAR/actions.rdr` lists each map's actions on
scene nodes (`node`, `valve`, `anim`, `type DOOR`/`MPBOMB`, `range`, `bitmap action_door_open.tif`/`action_MP_bomb.tif`):
Frostfire's three doors `bdoor_4`, `wdoor_1`, `wdoor_2` at 30 units, Blizzard's six doors and two bomb sites, Desert
Glory's one door (§5). No map names `action_defuse.tif` or `action_door_close.tif`. `TCM.tif`/`TCMArrow.tif` are the tactical command (radio) menu's
(`0x413120`), `hud_check.tif` and `team_background.tif` the objective list's (L63441): none is on the HUD at rest.
The scope's picture (`ret_scope_01/02`, `nvg_*`) is the reticle's (the ACCURACY workstream). **Corrected
2026-09-29:** there is a zoom readout, and a range line in the scope -- §13 (research 84 found them).

## 2. The bitmaps: four libraries, stored bottom row first, drawn bilinear

- **Upside down.** Decoded the way the world's textures are (row 0 of the decode is row 0 of the stored texels), every
  HUD bitmap comes out upside down against the console: `m4carbine_icon.tif` with its magazine up, `compass_lo.tif`'s
  `N` mirrored top-to-bottom (a rotation cannot turn it back: the console frame's ring at a half turn shows a true `N`),
  and `font_text_01.tif`'s capitals in rows 103-127 where `fonts.rdr` says `A` is `UL (2 0) LR (13 25)`. `readHud`
  (`hudAssets.ts`) flips the rows once; everything downstream indexes top row first, as `fonts.rdr` and the frame do.
  (The reticle's pair, read by `./hudBitmaps` for W2.4, is not flipped: its arm is symmetric and W2.4 placed it by
  measurement.)
- **The font is PSMT4.** `font_text_01.tif` (512x128) is TEX0 PSM `0x14`, the only 4-bit texture on the 22 maps; its
  16-entry CT32 CLUT sits in palette 139's buffer as an **8x2 block** (entries 0-7, then 8-15 sixteen entries on): a
  white ramp, alpha 0-120 and 135-255. `@s2u/gs` decodes it since this note (`csm1Clut4Index`).
- **No 480-line space.** The console frame's ammo panel is 160 pixels wide and 74.67 tall, which reads like a 160x80
  box squeezed from 480 lines to 448 -- but `CHUD`'s own numbers are -10..160 x 364..439 (170x75, its left 10 pixels
  off-screen), the icon and the rounds sit at their own sizes, and the compass is round. The frame is the HUD's space.
- **Bilinear, sampled at the pixel's corner.** Every HUD bitmap's TEX1 asks for bilinear filtering; the GS samples a
  sprite at each pixel's integer corner where GL samples at the centre, so the console's content sits half a pixel
  right of and below GL's for the same quad. Drawn nearest-neighbour at the code's rectangles, every bitmap on the
  console frame was +0.2..+0.8 pixels off ours; the pass now filters bilinearly and moves the texels by
  `GS_SAMPLE_OFFSET` 0.5 (edges unmoved), which brings them to -0.5..+0.1 (§6).

## 3. The font and the text model

`fonts.rdr`'s `font_text_01`: `textures (font_text_01.tif font_special_01.tif)`, `xspacing 0`, `opacity 0.7`, `scale
1`, `topy 0`, `boty 15`, `dropshadow { offset (1.5 1.5) color (0 0 0) opacity 0.75 baseline 0 }`, 185 glyphs of 25-row
cells (the 95 printable ASCII ones are transcribed in `hudFont.ts`, checked against the archive by its test). `CHUD_Init`
(`FUN_001fa360` L57227) loads it, falling back to `arialblack` if the bitmap is missing.

The draw (`FUN_003639c0` -> `FUN_003635c0` L261085 -> one sprite a glyph, `FUN_00361bd0` L260233):

- the glyph's quad runs from `pen + DispPos.x x S` to `pen + (width x HorScale + DispPos.x - 1) x S + 0.5`, over texels
  `UL.x .. UL.x + width - 1` (`S` = the string's scale x `+0x78` x the font's `+0x34`, 0.9 on the ammo box);
- the pen then moves by **`int((width + DispPos.x - 1) x S + 0.5) + xspacing`** (`FUN_00363c20`) -- the integer step is
  what makes "30/30" and "2 MAGS" fit: at S 0.9 the advances 7 ('3'), 8 ('0'), 9 ('/'), 11 ('M'), 9 ('A', 'G') put
  the rendered glyph centroids within 0.4 pixel of the console frame's;
- the glyph stands on the string's y, the **baseline**: its quad from `y + (B - h) x S + DAT_0049e9a8` up to
  `y + B x S + 0.5 + DAT_0049e9a0` (`h` 25, `B` a short of the font texture's record); the two `DAT_` offsets are
  runtime values. Fitted on the frame: the 25 rows cover 25 x S x 448/480 pixels (0.84 at 0.9) with row 20 -- the
  letters' foot -- on the baseline + 0.3, and the pen 0.6 left of the formula (`PEN_NUDGE`, the same on all four
  lines measured). Those three numbers are fits, not readings.
- the drop shadow is a second pass offset by the font's `+0x40/+0x44`, **kept as integers** (the 1.5 truncates to 1),
  times S; its alpha is `min(string alpha, 0.75 x 128)` = 80, black.
- the string's alpha is `min(80, font opacity 0.7 x 128 = 89.6)` = **80**: the console frame's text peaks at 168 over
  the panel's 23, which is 23 + 0.625 x 232.

## 4. What the viewer's walk shows, and what it cannot

The viewer's walk is one SEAL on a multiplayer map with no round, no team and no objectives. It shows 1.1-1.6 (the ammo
box and the compass exactly as in a round, the compass with the map's nav points, §10), 1.8-1.12 (the info box: a full bar, the name empty unless set, the timer
**static** at a round's 06:00, the range live), 1.13 on a stance change, 1.14 when the traversal or a caller feeds a
prompt, 1.17 on `flashMessage`. It leaves out the compass marks, the radio icon, the help lines, and the two
single-player elements (the team list, the radar). The HUD is drawn **only in walk mode** (`hud.setVisible(walking)`)
and fades in over 1.5 s after entering it, as after a spawn.

## 5. The context prompts (`CZActionBitmap`, `CHUD+0x174d0`)

Init `FUN_0021ded0` (L73437), colours `FUN_0021f120` (L73835), render `FUN_0021f210` (L73868), flags to icons
`FUN_0021f850` (L74040). One primary icon 50x50 centred on x 306, y 365-415; up to two more alternately left and right
at x 306 -/+ 62n. A hidden "ACTION ICON" label at (306, 358) scale 0.9 and a black 585-635 x 345-360 box (probably the
hold bar), both alpha 0. (2026-10-09, PB-8: it is the bomb's hold bar, the box with a grey fill inset 2 px, shown while
the plant's or the defuse's hold plays: research 214 s3, "The hold bar".) The colour is `base + pulse x delta`, the pulse ramping 0-1-0 at 5 a second:

| entry | base | delta | used for |
|---|---|---|---|
| 0 red | 120, 0, 0 | 80, 24, 24 | KNIFE ATTACK, RESTRAIN, RIFLE BUTT, SATCHEL, PLACE C4 CHARGE (below) |
| 1 green | 24, 80, 24 | 24, 80, 24 | every other prompt (below) |
| 2 blue | 20, 50, 60 | 35, 80, 80 | no record (below; was: "an action that can be done (the viewer's default)", unsourced) |
| 3 grey | 42, 42, 42 | 8, 8, 8 | a map's action the player may not use (below) |

**Which entry each prompt takes (LkPaioX5, 2026-11-02; reading, pending review -- source inspection of the
decompilation, nothing run, nothing captured).** The entry is the record's `+0xd0` byte: `FUN_0021f210` reads it for the
primary icon (D:L73956) and each side icon (D:L74004) and indexes the table with it (D:L73961-73964, D:L74009-74012).
`FUN_0021ded0` sets it once per record at init and nothing else writes it (each record's `DAT_` byte has one writer).
Each record's type is its `+4` byte, its icon `+0`, its caption `+0x90` (the strings file's addresses):

| type | icon | caption | `+0xd0` (D:L) | the port's prompt |
|---|---|---|---|---|
| 0 | `action_x` | UNKNOWN | 1 green (73583) | -- |
| 1 | `action_x` | ACTION | 1 green (73603) | `action` |
| 2 | `action_climb` | CLIMB | 1 green (73613) | `climb` |
| 3 | `action_talk` | (0x3e4e08, not in the strings file) | 1 green (73623) | -- |
| 4, 5 | `action_pickup_item1`, `_item2` | (0x3e4e10, not in the strings file) | 1 green (73633, 73643) | `pickup` |
| 6 | `action_drop_MP_bomb` | DROP BOMB | 1 green (73654) | `bomb_drop` |
| 7 | `action_MP_bomb` | PRESS AND HOLD | 1 green (73663) | `bomb` |
| 8, 9 | `action_conceal_body` | PICKUP BODY, DROP BODY | 1 green (73673, 73683) | -- |
| 10 | `action_knife` | KNIFE ATTACK | **0 red** (73693) | `knife` |
| 11 | `action_restrain` | RESTRAIN | **0 red** (73703) | `restrain` |
| 12 | `action_close_combat` | RIFLE BUTT | **0 red** (73713) | -- |
| 13 | the map action's (`FUN_002209c0` D:L74562-74581) | UNDEFINED, or the action's | 1 green (73723); grey when unavailable | `door`, `button`, `lever` |
| 0xe, 0xf | `action_escortee` | FOLLOW!, HOLD POSITION | 1 green (73784, 73794) | `escortee` |
| 0x10 | `action_slide` | LADDER SLIDE | 1 green (73593) | `ladder_slide` |
| 0x11 | `action_x` | SATCHEL | **0 red** (73743) | -- |
| 0x12 | `action_place_c4` | PLACE C4 CHARGE | **0 red** (73734) | `c4` |
| 0x13, 0x14 | `action_mount_turret`, `action_dismount_turret` | USE TURRET, DISMOUNT TURRET | 1 green (73753, 73763) | `turret_mount`, `turret_dismount` |
| 0x15 | `action_victory_dance` | VICTORY DANCE | 1 green (73774) | `victory` |

No record takes entry 2: the blue the viewer drew for every prompt was the port's own. **Grey** is
`FUN_0021f210`'s override, for the type-13 record alone: when the player (`CHUD+500`) has a map action
(`FUN_005aa240`) and the player's `+200` word and the action's `+0x30` word share no bit, the entry is 3 (D:L73957-73959;
the side icons D:L74005-74007), and `FUN_00220350` captions it UNAVAILABLE (`0x3e4f50`, D:L74401-74403). What the two
words hold (a team mask, a lock) is not read; the port takes it from its caller (`setAction` / `setNearbyAction`'s
`allowed`), and no caller yet passes false. Every entry pulses, the grey included (delta 8). The port: `hud.ts`
`ACTION_PROMPT_COLOUR`, `MAP_ACTION_PROMPTS`. `door`, `button` and `lever` as the type-13 record is the port's mapping of
a map's `actions.rdr` action onto it (`FUN_002209c0` gives that record the action's icon); `action` is taken as the
ACTION record's (the defuse's `DEFUSE_PROMPT_ICON_READING`, read since as record 7's own icon -- "The action list", below -- is green). Not
ported: the RIFLE BUTT, SATCHEL, TALK, body and UNKNOWN prompts (the side icons and the captions: "The action list",
below). **What makes it proven:** a capture of the original with a prompt up -- a climb or a door (green), a C4
placement or a knife in reach (red) -- the icon's pixels against `base + pulse x delta` over a pulse cycle; and a
door its team may not use (grey, UNAVAILABLE).

**The action list (LkPaioX5 part 2, 2026-11-02; reading, pending review -- source inspection of the decompilation and
the ELF's data, nothing run, nothing captured).** Craig's card: "i remember there being a list to cycle through".

- **(a) The side icons.** `FUN_0021f210` draws the list's head (`CHUD+0x174d0`'s `+8` array, `+4` its count) at x 306,
  then walks list[1] on (D:L73979-74032): for list[1] and list[2] (index < 3, D:L73987) an odd index goes right and an
  even one left, each `DAT_003dc638 + 12.0` = 50 + 12 = 62 further out than the last on its side (D:L73989, D:L73995;
  `DAT_003dc638` 50.0, `DAT_003dc628` 306.0, `DAT_003dc630` 365.0 read off the ELF's data), the same y and size; list[3]
  on are hidden (vtable `+0x18`, D:L74028: the sprite class's vtable 0x406e80 holds `FUN_00364e50` there, the hide, and
  `FUN_00364e30` at `+0x1c`, the show, read off the ELF). Each side icon takes its own record's `+0xd0` colour, greyed as
  the head is (D:L74004-74007), on the one pulse (D:L74009-74012). So list[1] is right of the head and list[2] left. The
  port: `HUD_LAYOUT.action.gap` 12, `HudModel.actionSides`, element `actionSides` (hidden with `action` in every set).
- **The 19/28 and 28/90 words are the sprite's alpha step and cap, not sizes.** Before each draw `FUN_0021f210` writes
  the record sprite's `+0x1c` and `+0x20` (`puVar1[0xb]`, `puVar1[0xc]`, the sprite at the record's `+0x10`): 28.0 and
  90.0 for the head (D:L73952-73953), 19.0 and 28.0 for a side icon (D:L74001-74002). `FUN_003642d0` (D:L261609-261634),
  called next, takes the sprite's alpha (`+0x3c`, the colour's fourth word) to alpha + step, held at the cap and at 128,
  and sets it through the vtable's `+0x34` (0x406eb4 holds `FUN_00364860`, the alpha's setter) -- when the sprite's
  `+0x18` byte is set, which `FUN_0021ded0` sets for every record (`DAT_0040c228` = 1, D:L73587, and each record's
  likewise). A record put in the list starts at 0 (`FUN_002209c0` D:L74589; `FUN_0021f850`, D:L74042-74306, rebuilds the
  list when the action mask changes, D:L73391-73396), so the head fades in 28 a frame to 90 (90/128, about 0.70) and a
  side icon 19 a frame to 28 (about 0.22); a record turned from the head to a side drops to 28 at once. The port:
  `ACTION_ICON_FADE`, stepped by `Hud.step` on the game frame (`GAME_FRAME_DT`), drawn a step in on the rebuild's frame
  (the same frame's draw). (Was: the head at alpha 1, §15's "assumed like the other strings'".) A record that leaves the
  list is not hidden: `FUN_002200c0` (D:L74312-74382, after the draw, D:L73399) fades it at 400 a second where it was
  drawn last; the port hides it at once (`ACTION_ICON_FADE_OUT_READING`, §16).
- `ActionSelection.list()` lends the picker's list (`FUN_0021d9d0`'s order, turned by `FUN_00595320`), and
  `./matchActions`'s `prompt` feeds it whole to the HUD (`Hud.setNearbyAction`, `HudSources.nearby`), its traversal entry
  the slide's icon on a ladder and the climb's otherwise.
- **What makes it proven:** a capture of a two- or three-entry list (a door beside a C4 target; a corpse's two weapons
  beside a door): the side icons' places (244 and 368 centres), their alpha against 28/128 and the head's against
  90/128 over the first frames.
- **(b) The caption.** `FUN_0021f210` calls `FUN_00220350` (D:L74385-74496) with the head alone (D:L73978), which writes
  one label (`CHUD+0x174d0`'s `+0x14`), placed at (`DAT_003dc678`, `DAT_003dc67c`) = (306, 435) (`FUN_003631a0`;
  `DAT_003dc678` copied from `DAT_003dc628` by `FUN_003fe550` D:L327767), shown (vtable `+0x1c`). By the head's type:
  - **13, a map action** (the port's `door`, `button`, `lever`): UNAVAILABLE (0x3e4f50) when the player's `+200` and the
    action's `+0x30` share no bit (D:L74401-74403); else, when the action's `+0x3f` bit 2 is set (its `tcm` key,
    D:L157420-157423), a text at 0x436500 or PLEASE ADD TO MISSION.RDR (0x3e4f30, D:L74405-74416); else the record's
    `+0x90`, which `FUN_002209c0` set from the action's `+0x2c` -- `actions.rdr`'s `descriptor` (the loader's
    D:L157285, D:L157318-157321) -- or else `FUN_002b48e0`'s text for its type (OPEN DOOR or CLOSE DOOR by its valve,
    FLIP SWITCH, DEFUSE BOMB, MP BOMB, PLACE SATCHEL, BREACH, TAKE ITEM; D:L156967+), or UNKNOWN (D:L74567-74582). The
    port draws UNAVAILABLE and no caption for an allowed map action (`MAP_ACTION_CAPTION_READING`, §16).
  - **7, the bomb:** while the hold runs (the kit's `+0x171` bits 0x20 and 0x10) the hold bar (PB-8) and no new text
    (D:L74427-74443); else HudCLOC by id through `FUN_00361b40`: 0xec40 (60480) BOMB DEFUSAL with the world bomb's node
    set, 0xec41 (60481) DEMOLITION without (D:L74458-74463), with the label's flag 0 (no table lookup). The port:
    `ACTION_BOMB_CAPTION_IDS`, the strings from the page's HudCLOC (`Hud.setLocCaptions`, the sound data's
    `taunts.captions`, as the START menu takes them); none until they land.
  - **4, 5, the pick-ups:** while `FUN_00220870` found a weapon for the head (`+0x1b0`, D:L74470), "%s %s" (0x3e4f28) of
    the record's TAKE (0x3e4e10) and the name (D:L74471); the name is the drop's record's `+8` (`FUN_00541a90`,
    `FUN_003d2830`: `DisplayName`, research 212 §4.1), UNKNOWN (0x3e4b98) without a record (`FUN_00220870`
    D:L74508-74536). No weapon: the label is not written (`ACTION_CAPTION_EMPTY_READING`).
  - **every other:** the record's `+0x90` (D:L74479): CLIMB, LADDER SLIDE, ACTION, DROP BOMB, PLACE C4 CHARGE, USE
    TURRET, DISMOUNT TURRET, KNIFE ATTACK, RESTRAIN, VICTORY DANCE, FOLLOW! and HOLD POSITION (the hostage's, from its
    page). The port: `ACTION_RECORD_CAPTIONS` (each the ELF's literal at its address, compared on the disc by
    `hud.test.ts`).
  A caption written with the label's flag 1 (all but the bomb's) is looked up as a message name when it opens on '_'
  (`FUN_003631f0` D:L260990-260992, `FUN_003a3100` D:L296945-296949). The label's place, scale 0.9, grey 128 and alpha 80
  are `VICTORY_CAPTION_READING`'s (research 303), now every caption's. Element `actionCaption`. Nothing found hides the
  label when the list empties (`FUN_0021f210` returns at D:L73904-73905 before it): the port draws none
  (`ACTION_CAPTION_EMPTY_READING`). **What makes it proven:** a capture of each caption under its prompt.
- **(c) The two TAKE actions.** Actions 4 and 5 are set apart by `FUN_005937c0` (D:L452427-452434: action 4 while
  `FUN_00544c30`'s candidate, the kit's `+0x14c`, is set; action 5 while `FUN_00544c20`'s, `+0x150`), appended apart by
  `FUN_0021f850` (its bit 0x10 and 0x20 tests, D:L74217-74240) as two records, 0x40c580 and 0x40c660, which
  `FUN_0021ded0` sets up (D:L73632-73651), each its own icon, `action_pickup_item1.tif` and `action_pickup_item2.tif`,
  and the caption TAKE), so a body's two weapons are two
  entries, cycled with Cross held and the d-pad as every other. `FUN_00593da0` fills the two from one search: the return
  of `FUN_005a9c70` or `FUN_005a9f40` the first, their out-parameter the second (D:L452540-452575), and `FUN_00541d40`
  (D:L409206-409267) sends a weapon drop whose `+0xd` bit 1 is set to the out-parameter, every other to the return, each
  the nearest of its class within 20 (D:L409228-409259) -- the classes `PICKUP_HOLD_PER_CLASS_READING` already ports (a
  corpse's pistol second). So which weapon is which entry is settled; within a class the port keeps its nearest in front
  (`PICKUP_PROMPT_PICK_PLACEHOLDER`, narrowed: the facing test is the port's, the original's point offset by the actor's
  `+0x14b0` vector is unread). The port: contexts `pickup` and `pickup2` (`ACTION_CONTEXT_BITS` 0x10, 0x20), prompts
  `pickup` and `pickup2`, `WorldDrops.prompt`'s class, `drops.second` and `drops.item` lent by both pages, each TAKE
  claiming its own drop through the same `pickup` send (no wire change); the 3 s hold (`PICKUP_PROMPT_COOLDOWN_READING`)
  starts on either. (Was: one `pickup` context over both bits, `action_pickup_item.tif`, which no record names.)
  **What makes it proven:** a capture beside a fresh corpse: two TAKE icons, the pistol's to the right of the rifle's.
- **The defuse's icon is read** (`DEFUSE_PROMPT_ICON_READING`, research 214 s6): the plant and the defuse are one record
  (action 7, bit 0x80, `FUN_0021f850` D:L74109-74116); `FUN_002209c0` gives it a map action's icon (the site's
  `actions.rdr` bitmap) only while `DAT_0044d4a0` is clear -- the plant (D:L74560-74584) -- and keeps the record's own
  with the node set, the defuse (D:L74585-74586): `action_MP_bomb.tif` (`FUN_0021ded0` D:L73664). The port's
  `bomb_defuse` (was `action`, the generic `action_x.tif`). D:L74586 writes the icon word to itself, so after a plant on
  this console the record keeps the site's icon at a defuse until `FUN_0021ded0` sets the records up again
  (the HUD's init, D:L57421): not ported. The plant's own icon is the site's bitmap in
  the original; the port keeps `bomb` (`action_mp_bomb.tif`) -- not changed here.

| prompt | flag | bitmap (HUD_TXR, 64x64) | the viewer |
|---|---|---|---|
| climb (a ledge; a ladder's foot) | `0x4` | `action_climb.tif` (a ladder, an up arrow) | `setClimbPrompt(climbPrompt())` from the traversal: any of its `low`/`med`/`high` (`dynamics.rdr`'s `low/med/high_climb_height` 1.3/2.15/2.65 m, x 10 in units at L456970-456975) |
| ladder slide ("LADDER SLIDE") | `0x10000` | `action_slide.tif` | `setAction('ladder_slide')` |
| pick up | -- | `action_pickup_item1.tif` (action 4), `action_pickup_item2.tif` (action 5); `action_pickup_item.tif` ships, no record names it | `pickup`, `pickup2` (LkPaioX5 (c)) |
| the bomb: pick up, plant, defuse | -- | `action_MP_Bomb.tif`; drop `action_drop_MP_Bomb.tif` | `setAction('bomb')`, `'bomb_drop'` |
| C4, button, lever, turret, knife, restrain | -- | `action_place_c4`, `action_button`, `action_pull_lever`, `action_mount/dismount_turret`, `action_knife`, `action_restrain` | `setAction(...)` |
| a generic action; any missing icon | -- | `action_x.tif` (32x32, the pad's X) | the fallback; it is **not** drawn beside the others |
| a door (a map's `DOOR` action) | `actions.rdr` | `action_door_open.tif`, per the map's `bitmap` | `nearby: 'door'` within the door node's `range` (30) of the feet [the game's own reach test -- facing, a cone -- not traced] |
| defuse, door close | -- | `action_defuse.tif`, `action_door_close.tif` ship but nothing names them | not offered |

## 6. The viewer's drawing against the console's pixels (2026-09-28)

`e2e/hud.spec.ts` renders Frostfire in the PS2 presentation at spawn A, the heading the console frame's (yaw 180), the
magazine 30/30 and 2 spare, and cross-correlates each element's box of the drawn frame with
`console_spawn_slot8.png`'s (a 9-pixel box blur off both, the worlds under them differing; a 0.05-pixel search). The
content's offset, console minus ours, pixels:

| element | dx | dy | correlation |
|---|---|---|---|
| rounds "30/30" | -0.15 | +0.20 | 0.94 |
| magazines "2 MAGS" | 0.00 | +0.20 | 0.94 |
| rifle icon | -0.50 | -0.25 | 0.81 |
| fire-mode rounds | -0.35 | +0.05 | 0.98 |

Against the Vigilance round frame (not in the repository; the same script by hand): the compass ring +0.1/+0.1, the
timer "04:49" -0.1/+0.2, the range "2m" -0.1/+0.2, the `CROUCH` word +0.1/+0.7, the ammo box's lines within 0.2; the
health bar's edges 488-622 x 396-414 on both, the ammo panel's right edge at x 160 on both. Every element is within the
one-pixel bar; the rectangles themselves are `CHUD`'s numbers, asserted exactly by the unit tests.

## 8. The round start (2026-09-28, second round)

`FUN_001fb420` (called at L149758) resets the HUD, retracts any letterbox (`FUN_001fec60`), formats `"STARTING ROUND %d
OF %d"` (`0x3e3520`; `"PLAYING TIEBREAKER ROUND"` `0x3e3540` past the last) and posts it with `FUN_002b6530` into the
message window `READERC.ZAR/messages.rdr` configures -- left 157, bottom 91, maxlength 325, margins 10 and 8, which is
the panel **147-492 x 0-99** the frame shows (a line wider than 297 wraps: §14.1),
`newweapnbkrnd.tif` behind, up to 8 lines 15 apart, colour 0 (128, 128,
128) at alpha 100. Each line fades in at 280 alpha a second (0.36 s), holds `fadetime` 7 s from its posting, and fades
out the same way (`FUN_002b77a0`). "OBJECTIVE:" / the side's objective (`mp51LOC` 5100/5101: "ELIMINATE THE
TERRORISTS" for the SEALs in Suppression) arrives in the same window about 5 s later; what posts it was not found. The
only fader is `CFader_FadeIn(0.5)` at HUD init (L57476); no letterbox at spawn.

**Measured on the Vigilance round start** (`logs/parity/s4_pcsx2/A_ready021..034`, one frame a second, the round clock
read off each frame: 05:59 on frame 21 ... 05:46 on 34): the whole picture at a third of its brightness on frame 21,
full on 22; the single line's ink y 81-94, "STARTING ROUND 1 OF 11" ink x 231-407 (scale 1.0 by its width, not the
code's 0.9 x 1.1429); on frame 26 the objective's two lines in half-faded and the first line moved up -- ink feet at 61,
76 and 91 (the objective line "ELIMINATE THE TERRORISTS" at 0.765, 149 wide); the first line half gone on 28, gone on 29;
the objective half gone on 33, the panel gone on 34. Fitted: the round clock's 06:00 at 0.58 s before frame 21; the
first message posted at 0.36 s, the second at 5.36 s -- so **both 0.36 s in, 7 s from posting, 0.36 s out**, 5 s apart.

The viewer (`ROUND_START`, `roundStartAt`) plays: the fade from black over 1.5 s [the frames' 0.33 visible at 0.58 s
and full by 1.58 s; `CFader_FadeIn`'s 0.5 argument not resolved], the ammo box's 1-1.5 s fade (§1), the two messages
at 0.36 and 5.36 s with the code's 0.357 s fades and 7 s `fadetime` -- which put the model at 0.62 and 0.38 where the
frames measure 0.54 and 0.39 on frames 26 and 28/33 -- lines stacked 15
apart from the newest's baseline at 83.4 + 10.6 x its scale. `setRound({ round, rounds, objective })` changes the words.

## 9. The tactical map (2026-09-28, second round)

**SOCOM II has no tactical map in a multiplayer round.** `controller.rdr` maps `Select` to `TACMAP` (action 12 of the
table ending `0x3f2c10`; `FUN_002c6670` L167011 numbers the pad: Pause 0, Select 1, Circle 7, Square 8, X 9, R1 10,
R2 11, L1 12, L2 13, R3 14, L3 15), but the map object is made (`FUN_001fb420` L57630) and ticked (L56700) only while
the multiplayer flag `DAT_0045a0c1` is 0. In a multiplayer round SELECT **holds the scoreboard** (shown on the press,
L56760 / `FUN_0022be20` L79675, refreshed each second, hidden on release, L79873; the options read
"FIREMODE/SCOREBOARD"). The single-player map (`CZNewHudMap` with `CZLineMap`), 1:1, is what the viewer draws on `M`:

- **Toggle:** SELECT opens (`FUN_00209ae0` L64434 -> `FUN_0020a780`) and closes (`FUN_00209ee0` L64539 ->
  `FUN_0020a470`). Opening hides the HUD and the compass (`FUN_001f71c0`) and puts the player in input mode 4; closing
  restores them through the 1.5 s fade-in (`FUN_001f7030`). No fade of the map itself was found.
- **Geometry:** `CZLineMap` (`FUN_0020ebd0` L66383) draws the map's `AIMAPS.MPS` (research 75): its polylines (type
  `word & 0x1f`, the `hud.rdr` `TacMap` type; filled fans on flag bit 0x20, `FUN_0020f5c0` L66770, else lines,
  `FUN_0020e470` L66172, thick when `Width` > 1.01; alpha opacity x 127), zones of kind 1 or 5 as (200, 0, 200)
  outlines at alpha 100 (`FUN_0020df70`), named points of kind 5 labelled (`FUN_0020dac0`); a vertex at its cell's centre
  (`FUN_002102e0` L67204); linked sub-maps at 0.3 alpha. Blizzard (79), Frostfire (253) and Bitter Jungle (56) have
  polylines; the file's `value` is 0 on 534 of 553 (type 0: white lines at full), 1-3 on 19. The fill flag's source in
  the file was not found: the viewer draws every polyline as lines.
- **Layout:** the box 232-628 x 62-365, centre (430, 213.5); the grid 7 horizontal lines 38.125 apart and 9 vertical
  40.85 apart from x 230, `FOV.tif`'s texel at (0.5, 0.94) at alpha 24, each line wiping in over 1 s, 0.1 s apart; the
  north arrow's three strokes round (600, 100) (`FUN_0020be00`) and "N" at (596, 107), scale 1; the player
  (`FUN_002222e0`) an 8x8 `teammate_health.tif` and a 72-pixel `FOV.tif` cone in the team mate's (82, 205, 205)
  (enemy (150, 0, 0), dead (10, 10, 10)); markers 20x20 in their compass bitmap and colour (`FUN_0020e750`);
  `hud_arrow_off2.tif` at the box's edges, pulsing 0-128 at 1.5/s where more map lies that way, else 32; the legend
  (R2 held: a black 230-445 x 60-210 box, 16-pixel icons at x 257, text 0.72 at x 276) and the objective list on the
  left are not drawn.
- **Transform** (`FUN_0020ae50` L64993): minus the player's (x, z) (or the pan point), turned by
  atan2(-f.z, -f.x) + pi/2 so the camera's forward is up -- **heading-up, fixed while open** -- scaled by 396 / zoom,
  plus the box's centre. **Zoom** is the world width across the box: 2200 on opening, 1300-4000 (`mission.rdr`'s
  `TacMapZoom` defaults 1, 2.2, 0.55), 24 units a tick on the right stick; **pan** 36 units a tick on the left stick,
  clamped to the first sub-map; Circle centres between the player and the objective, Square on the player, X selects.
- **The viewer:** `tacMap.ts` (`TacMap`, `tacMapLayout`, `readTacData`), the HUD pass's layer 1. `M` toggles it while
  walking; `-` / `=` held zoom out and in at 24 units a 60 Hz tick. No keyboard pan (WASD still walks: the viewer does
  not freeze the SEAL as input mode 4 does); `panBy`/`centre` wait for the pad's sticks. There is no box behind the map
  (none was found in the code), so it is drawn straight over the world.

## 10. The compass's nav marks (2026-09-28, second round)

`FUN_002acad0` makes a compass mark for each AIMAPS named point; its type is the name's first letter - 0x55 for c-z, so
Charlie is 14 and its bitmap `ret_nav_01.tif` (C; the green box is part of the bitmap), up to Zulu's `ret_nav_24`. The
nav marks' colour is (32, 62, 32) (`FUN_002126f0`'s table); their alpha `DAT_003dc500` 128. Of the nav marks only those
within 200 units and **the single nearest** show (L68254). Placement (`FUN_00211510`): the bearing from the view,
(sin, cos) clockwise from straight ahead; within 200 units at radius distance x 0.005 x 65 at the bitmap's own size;
farther, at radius 64 at 1.2x (`DAT_003dc510`), with the mark's second bitmap -- `ret_triangle.tif` at 0.6x, turned to
the bearing -- at radius 50. North is -z, east +x (the compass ring's own reading, §1.6). The pinned mark's arrow is
orange on the frames, (170, 124, 53) at its peak over a white bitmap: (85, 62, 27) as a GS colour [measured; the table
entry it takes was not resolved].

**Checked against the console:** Vigilance's round-2 start (`A_rend053`, the SEAL facing north: the ring's N at
(565.5, 57.0), bearing 0.0): the green "C" box's pixels x 590-608, y 27-45, centre (599.5, 36.5), the orange arrow x
589-593, y 46-49. The viewer at Vigilance's A (540, 1456) facing north: Charlie (689.76, 1216.11) 283 units off, 32.6
degrees right -- its box x 589-607, y 26-44 (centre (598.5, 35.5)), the arrow x 588-593, y 46-50: **one pixel** from the
console on each edge, the console's SEAL standing where KNOWN §1 puts A to within that. The viewer's nav points are the
map's kind-1 named points (Frostfire: Charlie, Delta, Echo, Foxtrot; Vigilance: Charlie, Delta, Echo, Foxtrot, Juliet,
Romeo, Whiskey). The marks' other types (the bomb, extraction, objectives, team mates) wait for data the viewer lacks;
the multiplayer handlers of types 0-13 (the jump table at `DAT_003e44b0`) were not resolved.

## 12. The round's scoreboard: SELECT held (2026-09-29, third round)

In a multiplayer round SELECT held shows the scoreboard (§9). `FUN_0022be20` (L79675): on the press
(`FUN_002c64e0(0xc) == 1`) `FUN_0022cc10` (L79974) builds it and sets `DAT_0040f608`; while held `DAT_00412e78`
accumulates and the layout is rebuilt every 1.0 s (L79866); the release (state 3) calls `FUN_0022bb30` (L79873).
`FUN_0022a8b0` (L79100) draws it; while it is up L56808-56828 hide the ammo box (`CHUD+0x1a700`), the compass, the
action prompts, the reticle and the timer every frame.

| part | what | place | colour |
|---|---|---|---|
| panel | `newweapnbkrnd.tif` nine-sliced (`FUN_0022ae90` L79223): 20-pixel corners, the corner texels 20/173 by 20/74 (`DAT_003e5718` 0.8844, `DAT_003e5720` 0.2703, L327982), the left corners mirrored | x 153..630, y 104..430 (the message window's bottom 91 + its YMargin 8 + 5) | bitmap white, alpha 100 [the colour is never set] |
| team bars | untextured, under the panel | x 153..630, y y0..y0 + 25; SEALs y0 104, TERRORISTS (104 + 430) / 2 = 267 (`FUN_00229d00` L78846) | SEALs (32, 32, 64), TERRORISTS (64, 32, 32), alpha 80 |
| team line | locale 60521 "SEALs" / 60522 "TERRORISTS", " :   " (0x3e5788), "%d" (game +0x120 / +0x124, rounds won [inferred]) | pen (171, y0 + 20), scale 1 | alpha 90 |
| columns | locale 60523 "KILLS", "DEATH" (0x3e5790), "SCORE" (0x3e5798), centred (C2DString +0x69) | centres 455, 522, 588 (175 and 175/3 from `DAT_003dc8e8`), baseline y0 + 20, scale 1 | alpha 90 |
| rows | 8 a team, by score (`FUN_0022de60` L80575: same team, not a spectator, named); the clan tag "[clan]" at x 163 in (128, 64, 32), the name at 223, the three numbers centred on the columns (kills +0x550 + 0x598, deaths +0x556 + 0x59e, score +0x580 + 0x5c8) | baseline y0 + 38 + 16.8 i (SEALs 142 .. 259.6, TERRORISTS 305 .. 422.6), scale 0.8 (`FUN_0022a290` L78951) | (115, 115, 115) alpha 110; the local player's blue 12 (yellow) [inferred: controller vtbl+0x2c]; the dead x 0.6 [inferred: +0xe1 bit 4] |
| stripes | odd rows 1, 3, 5, 7: `newweapnbkrnd`'s centre texel | x 161..624, baseline - 12 .. + 4 (`DAT_003dc990..9b0`) | alpha 60 |
| satchel | `hud_satchel.tif` on the row of the carrier of item 0x9a | x 200..216, baseline - 12 .. + 4 | -- |
| GAME DETAILS | a (64, 128, 64) `newweapnbkrnd` strip y 104..129 over its body y 129..229; "GAME DETAILS" (0x3e57c0) at (20, 124), scale 1, alpha 90; three lines at x 24, y 145 / 165 / 185, scale 0.8, (115, 115, 115) alpha 110, cut with "-" to 118: online the lobby, the game's name and its type (1 BREACH, 2 DEMOLITION, 3 ESCORT, 4 EXTRACT, 5 SUPPRESSION); LAN "LAN game", the name, the type (`FUN_0022ac30` L79186) | x 10..152 | strip alpha 80 |
| SPECTATORS | the same strip y 229..254, "SPECTATORS" (0x3e57b0) at (20, 249); up to 8 names at (24, 270 + 16.8 i), scale 0.8 | x 10..152, body to 430 | -- |
| Modern place (owner ruling 2026-09-29: "try to bump up the location of the scoreboard a bit when in modern mode") | the whole board -- panel, bars, rows, GAME DETAILS, SPECTATORS -- raised by `MODERN_SCOREBOARD_LIFT` 4 in the Modern presentation only (`scoreboard.ts`); the PS2 presentation keeps the game's place | top 100: clear of the message window above (panel to 99, its newest line's glyph cells to ~99.9), the same at every aspect (both centre-anchored, height-scaled) | -- |
| Modern size (owner ruling 2026-09-29, final: "you can just make it a bit smaller instead of moving the top chat") | the whole board scaled uniformly about its top-centre (320, 100) by `modernScoreboardFit` (`hud.ts`), Modern only: just enough that its bottom (426 at scale 1) and, where it stands beside rather than over, its sides keep `MODERN_SCOREBOARD_MARGIN` 4 from the bottom HUD still up -- PAR-48 (research 282 s1, s5): the info box and the number hide under the board (D:L56811, D:L56826), so the stance word (top 417.0, right-edge-anchored) and the zoom (403.5, left-edge-anchored) alone; until PAR-48 the health bar (396), the name's glyph cells (394.5), the box (418) and the range (416.5) too; floor `MODERN_SCOREBOARD_MIN_SCALE` 0.75; the message window untouched, the PS2 place pinned | scale 16:9 0.9268, 16:10 0.9187, 4:3 0.9187, phone 390x844 0.9187 (the zoom binds), 21:9 1, phone 812x375 0.9602 (the stance word binds); every aspect clears above the floor. Before PAR-48: 16:9 0.8957 (the bar bound), 16:10 and 4:3 0.8911, phone 390x844 0.8911 (the name bound) | -- |

The draw order: the team bars, the panel, the details' body and header, "GAME DETAILS", the stripes, the teams'
strings, the detail lines, the spectators' panels and names, the satchel last.

**The viewer** (`scoreboard.ts`, `scoreboardLayout`): SELECT on a pad (the `scoreboard` lane, `./gamepad`'s
`PAD_LAYOUT`, standard button 8) or **Tab** held on the keyboard (`scoreboardKeys.ts`), walking only; the HUD pass's
layer 1, the bars as its shapes. Filled with the one SEAL -- `hud.setPlayerName`'s name, else "SEAL" -- on the first row
in the local player's yellow, its three numbers 0; the TERRORISTS empty; the details "LAN game", the map's name and its
game type (`./mapOrder`'s `mode`); no spectators. No console frame of the held scoreboard is in the captures
(`A_rend050`'s "ROUND COMPLETE" is the round's end screen, another screen), so it is drawn from the code alone.

## 13. The zoom readout and the scope's range (2026-09-29, third round)

`FUN_001f6ce0` (L56025): the magnification from the view mode (`+0x200`: 4 gives 9.0, 5..12 the weapon's zoom,
`FUN_005be660`; else 0); over 1.01 **`"ZOOM: %2.1fx"`** (0x3e3098) into `CHUD+0x744` at the pen (20, 420), scale 0.9
(`CHUD_Init` L57311-57319: the HUD's text colour, alpha 80); hidden otherwise. Re-evaluated on the HUD's scoped and
normal switches (`FUN_001f7360` L56238, `FUN_001f7560` L56287); in the scoped state the ammo box hides
(`FUN_00237de0` L56217-56225), so the readout stands where it was. The reticle's range: **`"RANGE(m): %.0f"`**
(0x3e4850) of the distance to what the reticle is on / 10, `"RANGE(m): ----"` (0x3e4860) with nothing
(`FUN_00216770` L70446-70463), written into CHUD's own string (scale 0.9, L57320-57326), shown by the reticle's switch
(`FUN_00213e20` L69258) at (415, 215) with the scope's `ret_scope_02` (`DAT_003dc528/530`, L69508), at (515, 40) with
the binoculars, (515, 70) with the night vision, hidden otherwise.

**The viewer** draws both while `hud.setZoom` (the ACCURACY workstream's `zoom.hudZoom()`: the state's own value, 9.0
in the binoculars, `FUN_001f6ce0`) is over 1.01: the readout at (20, 420), the range at (415, 215) in a scope and at
(515, 40) in the binoculars (since 2026-10-01, research 84 §7, §9) from the range finder's metres (§1.12), and hides the
ammo box. The night vision's (515, 70) is not drawn: its value is 1.01.

## 14. The message window's posts (2026-09-29, third round)

`FUN_002b6530(scale, window, text, colour, centred, fade)` (L157901): a scale of 0 is the window's own, else scale x
1.1429; `colour & 0xff` indexes (`FUN_002b7530` L158316) 0 (128, 128, 128), 1 (128, 128, 64), 2 (64, 64, 96), 3 (64,
128, 64), 4 (128, 64, 32), 5 (128, 64, 64), all alpha 100; `fade` 0 is the window's `fadetime`. The windows: the main
one `0x4366a0` (`messages.rdr`: left 157, bottom 91, scale 0.9, fadetime 7), the small one `0x437060`
(`small_messages.rdr`: left 12, bottom 91, scale 0.9, fadetime 5, maxlength 120), the subtitles `0x436b80`.

What one SEAL can make the game post: an item's name on a pick-up and "Satchel" (colour 0, the small window,
`FUN_005bb000` L473374, L473660); "Unable To Deploy: Max Equipment Items Placed (4)" (colour 2, the main window,
`FUN_005be9a0` L475331); in multiplayer the deaths -- "%s falls to their death" (0x65c440), "%s commits suicide with
%s" (0x65c460), "%s fragged %s with %s" (0x65c480) (colour 0, `FUN_00547860` L412893, `FUN_00547a90` L412970); the comm
menu's and the taunts' "%s : %s" (colours 3 and 5, `FUN_005e7960` L498224). **Not posted by anything:** reload, out of
ammo, low ammo, an empty magazine, the fire mode's name, the stance, the weapon switch, the zoom -- the ELF has no such
strings ("RELOAD" and "NOAMMO" are `CHRSND_*` sound ids); the fire mode is only `firemode.tif`'s rounds, the stance only
its word. "%s : FIRE IN THE HOLE!" (locale 60592) is a team mate's grenade, never the local player's.

**The viewer** posts with `hud.postMessage(text | lines, scale = 0.9)` on the main window (0.357 s in, out 7 s after
posting, the newest 8 lines, a colour per line, a line wider than the window wrapped as §14.1 reads), and posts the
one death it can cause: a landing of the death class (`FUN_005ac1f0`'s class 3) is "%s falls to their death" with
the player's name -- the viewer's SEAL then walks on. No pick-ups, deploys, grenade kills or comms exist in the viewer
yet.

### 14.1 The window's line width: a long line wraps (TAUNT-WRAP, 2026-11-02; reading, pending review)

Task 8mqnCJBx: a long name and a full 45-character taunt ran past the panel, the port posting "name : text" as one
line with no width limit. The original's rule, read in `FUN_002b6530` (D:L157901) and `FUN_002b6fc0` (D:L158200):

- **The limit.** `FUN_002b6fc0` reads the window's `maxlength` into +0x430 (D:L158227), `XMargin` into +0x444
  (D:L158236) and `TtySpeed` into +0x434 (D:L158295). `messages.rdr` (READERC.ZAR, through `@s2u/archive`
  `parseRdr`; the dev-disc test in `packages/viewer/test/hudMessagePanel.test.ts`) holds `maxlength 325`,
  `XMargin 10`, `YMargin 8`, `TtySpeed 13000`, `maxsize 8`, `spacing 15`, `left 157`, `bottom 91`, `scale 0.9`,
  `fadetime 7`. The post's limit is `int(DAT_003de6f8 + (maxlength - 2 x XMargin))` (D:L158010), `DAT_003de6f8` the
  int -8 (the ELF's word at 0x3de6f8, 0xfffffff8): **297** in the frame's units at the line's scale.
- **When it wraps.** When `maxlength` is not 0, the text (its leading spaces skipped, D:L157930) measures wider than
  297 at the scale it is drawn (`FUN_00362b70`'s +0x3c, the pen's travel of §3) **and** holds a space (`FUN_00199a10`,
  a `strstr` for 0x3f2278 = " ", D:L158011-158012). A text with no space is never broken and may run wide.
- **The measure's scale** is the scale the line is drawn at: the text's +0x40 is `fVar12` -- the window's `scale` 0.9
  (`messages.rdr`, +0x400, D:L158210) when the post's own is 0, else the post's x 1.1429 (D:L157983-157987) -- times
  its +0x78 and the font's +0x34 (`FUN_00362b70` D:L260748-260750, D:L260794). The taunts (D:L498230), the kill feed
  (D:L412893, D:L412970), the chat and comms and the claymore's refusal post 0, so 0.9; a script's `MESSAGE`
  (`FUN_00267760` D:L113376) posts its own scale, so its 0.7 lines measure 0.8 and its 0.9 lines 1.0286. The product
  +0x78 x +0x34 is `MESSAGE_TEXT_SCALE_READING`, taken as 1: the face's `scale` is 1 (`fonts.rdr`, §3; research 111
  §1.1) and `FUN_003631f0` writes +0x78 = 1.0 (D:L261029) after a locale lookup whose result the decompilation drops;
  against it, the Vigilance frames (§8) draw the 0.9 post at 1.0 (0.97 of 1.0286) and the 0.7 objective at 0.765
  (0.96 of 0.8). Each prefix is measured whole: `FUN_00362b70` re-measures the text right after each `FUN_00362e00`
  append (D:L158018-158019).
- **Where it breaks.** It appends the text (from its first byte, leading spaces included) a character at a time until
  the prefix reaches 297 (D:L158015-158020), backs off spaces there (D:L158021-158022), and looks back for a space up
  to `DAT_003de700` = 24 characters (D:L158023-158027): found, the line ends before it; not found, it ends at
  `DAT_003de708` = 32 characters if the text is longer than 32, else where the limit was reached (D:L158028-158032,
  `MESSAGE_WRAP_HARD_BREAK_READING`). A break at 0 posts nothing (D:L158034-158043).
- **What a piece is.** The piece (the text's first bytes, D:L158044 -- so a piece cut again keeps a leading space) is
  pushed as **its own line node** of the window (`FUN_001feae0`, D:L158050), the window's line count raised
  (D:L158051), and the rest posted again the same way, colour, scale and fade alike (D:L158052-158055); the last piece,
  which fits, has its leading spaces skipped. **A wrapped message is two (or more) of the window's lines**: each counts
  toward `maxsize` 8, which the window's update trims one line node (the oldest) a frame (`FUN_002b5db0`
  D:L157786-157792). Not a clip and not an ellipsis.
- **The line node's +0xa0 is not the width.** It is set to 10000.0 at the node's construction (D:L157977) and then to
  the window's `TtySpeed` (+0x434, 13000 for the main window, D:L158002): the line's type-out rate, not its width.
  What 13000 means on screen (a rate in characters a second, so a line whole within a frame, or another unit) is not
  read; the port draws a line whole at its posting.

**The port** (`packages/viewer/src/hudMessagePanel.ts` `wrapMessageLine`, called by `Hud.postMessage` for every post
-- the kill feed's, the chat's, the taunts', the comms' -- for OT.R59's held notice, and by `objectivePosts` for the
round start's objective lines): the same rule, each piece a `BannerLine` of the post with its drawn scale and colour, so
`capLines` counts it as a line. The width is `./hudFont` `textWidth` of each prefix at the original's measure scale
(`messageMeasureScale`): 0.9 for a post of the window's own (a `BannerLine` without `post`), the script's scale x
1.1429 for `Hud.postMessage(text, scale)` (`./roundAudio`'s and the bomb's lines) and for the objective. The port's
drawn scale is unchanged (the frames' 1.0 and 0.765 for the round start, the script's own scale for a script's later
lines), so a script line is drawn narrower than it is measured and its pieces stay inside the panel (LATER 639: draw it
at the measure scale once `MESSAGE_TEXT_SCALE_READING` is settled). `eliminationLines` carries its script scale as
`post`. OT.R82's
widening (LATER 385, an adaptation) is unchanged and now takes only a line the window cannot break. Open against the
original: `capLines` drops the oldest **message** whole where the window drops the oldest **line** (D:L157786-157792),
so a wrapped message at the top of a full window goes whole in the port where the original lets its first piece go
first -- recorded here, not changed by this task.

## 15. Estimates and open ends

- The text's vertical factor (25 x S x 448/480), its foot row offset (+0.3) and `PEN_NUDGE` (-0.6) are fitted (§3);
  the `CROUCH` word at scale 0.765 sits 0.7 high of the console's, which says the vertical model is not the code's.
- The name's place on the bar, the timer box's rectangle and the banner are measured, not read.
- The range readout's source in the code was not traced; the viewer uses the rifle's shot segment.
- The fire-mode count at rest is the console frame's three (mode 2); the viewer's rifle fires fully automatic (W2.5
  reads `MaxFireMode 3` as automatic, which the HUD would show as four rounds). `setFireMode` is the switch.
- The stance word's shadow is assumed like the other strings'. (The prompt's vertex alpha was too, at 1; read since,
  LkPaioX5 part 2: §5, "The action list", `ACTION_ICON_FADE`.)
- The fader's 1.5 s and the two postings (0.36, 5.36 s) are fitted on one round start; what posts the objective is not found.
- The tactical map's fill flag, its background (none found), and its pad controls (sticks, Circle/Square) unbound.

## 16. Readings and placeholders (LATER 414)

Filed 2026-10-26 by LATER 414's review fold (`packages/viewer/src/traversal.ts`); reading, pending review. Research 101
holds its row too (its LATER-414 group). LATER 492's review (2026-10-26) adds `STANCE_LAUNCHER_WATER_READING`
(`packages/viewer/src/stanceButton.ts`). TAUNT-WRAP (2026-11-02, §14.1; reading, pending review) adds
`MESSAGE_WRAP_APPEND_MEASURE_READING` (resolved in its review fold), `MESSAGE_WRAP_HARD_BREAK_READING` and
`MESSAGE_TEXT_SCALE_READING` (`packages/viewer/src/hudMessagePanel.ts`).

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `MAP_ACTION_CAPTION_READING` | LkPaioX5 part 2 (b), §5 "The action list": an allowed map action's caption -- its `actions.rdr` `descriptor`, else `FUN_002b48e0`'s type text (OPEN DOOR / CLOSE DOOR by the valve, FLIP SWITCH, ...), else UNKNOWN (`FUN_002209c0` D:L74567-74582); a `tcm` action's text (D:L74405-74416). Reading, pending review | `'not drawn: ...'` (`hud.ts`): the port reads neither key | the `descriptor` and `tcm` keys read into `mapActions.ts`'s records and the door's valve state at the rebuild; a capture of a door's and a switch's captions |
| `ACTION_CAPTION_EMPTY_READING` | LkPaioX5 part 2 (b): the label once the list is empty (`FUN_0021f210` returns at D:L73904-73905 before `FUN_00220350`) or a pick-up without a weapon (D:L74470): nothing found hides or clears it. Reading, pending review | `'none: ...'` (`hud.ts`) | the label's hide traced (the HUD's frame), or a capture of a prompt going away |
| `ACTION_ICON_FADE_OUT_READING` | LkPaioX5 part 2 (a), §5 "The action list": a record that leaves the action list keeps its last place and colour and fades at 400 a second (`FUN_002200c0` D:L74312-74382, after the draw at D:L73399); only list[3] on are hidden (D:L74028). Reading, pending review | `'hidden at once: ...'` (`hud.ts`): the fade-out is not drawn | a capture of a prompt leaving (a door walked away from), frame by frame |
| `DIVE_PRONE_TAKE_READING` | when the dive's prone request (`+0x374` = 2, D:L440912) is taken, raising the stance word's bit (1.13): `FUN_00552d60` takes it once `FUN_00552ec0` accepts -- the top play free or `FUN_00588080`, `FUN_00579ea0` 0, `+0x174` not 7, clip 0x11 not playing, `+0x174` 0 or 1 (D:L418928-418949); the dive pushes its plays at stance 2 (D:L440896-440897) and a pop writes `+0x174` from the play beneath (`FUN_0028da00` D:L135104), so whether `+0x174` is 0 or 1 when the dive is done (a take: PRONE) or 2 (never accepted: no word) is unread | `'down and at rest'` (`diveTick`, the dive's end) | a read of the play stack at the dive's end (which play `FUN_0028da00`'s last pop leaves on top), or a memory trace of `actor+0x174` and `actor+0x105f` bit 0 through a dive |
| `MESSAGE_WRAP_APPEND_MEASURE_READING` | the prefix's width as `FUN_002b6530` appends the text a character at a time with `FUN_00362e00` (D:L158018), whose decompiled width step (D:L260934-260947) was not read through (§14.1; TAUNT-WRAP 2026-11-02, reading, pending review) | `'each prefix measured whole, as FUN_00362b70'` (`packages/viewer/src/hudMessagePanel.ts`: `textWidth` of each prefix) | resolved 2026-11-02 by the review fold: `FUN_00362b70` re-measures the whole prefix right after each `FUN_00362e00` append (D:L158018-158019), as the port's `textWidth` of each prefix does (reading) |
| `MESSAGE_TEXT_SCALE_READING` | the measure's +0x78 x font +0x34 (`FUN_00362b70` D:L260748-260750, D:L260794) beyond the post's scale (§14.1): the face's `scale` 1 (`fonts.rdr`) and +0x78 written 1.0 by `FUN_003631f0` (D:L261029) after a locale lookup (`FUN_003a3700`, `FUN_003a32f0`) whose result the decompilation drops; against it the Vigilance frames' 1.0 for the code's 1.0286 and 0.765 for 0.8 (§8), 0.97 and 0.96 (reading, pending review) | `1` (`packages/viewer/src/hudMessagePanel.ts`, `messageMeasureScale`) | the disassembly of `FUN_003631f0`'s +0x78 store (a per-string scale from the locale entry or not), or a frame of a line posted at a known scale measured against `textWidth` |
| `MESSAGE_WRAP_HARD_BREAK_READING` | the break with no space within 24 characters back: `MESSAGE_WRAP_HARD` 32 when the text is longer than 32, else where the limit was reached (D:L158028-158032), transcribed as decompiled (§14.1; reading, pending review) | `'as decompiled: 32 characters when longer, else at the limit'` (`packages/viewer/src/hudMessagePanel.ts`) | the disassembly before `LAB_002b6978`, or a frame of a long unbroken word posted |
| `STANCE_LAUNCHER_WATER_READING` | `FUN_005857e0` allows the launcher's anim set (`+0x528` == `DAT_0044d408`) a crouch at any depth, before its depth test (D:L444334-444340); the deep crouch is then accepted and `FUN_00581990` stands the SEAL with the stance word's bit over 8.5 deep (D:L442580) | `'the depth alone: the launcher set not asked'` (`stanceButton.ts`; the port's press table, `Traversal.stanceAllows`, takes the depth alone) | the launcher's set read into `stanceAllows`, the accepted deep crouch then stood by the water with its bit |
| `STANCE_WORD_ACTION_CROUCH_READING` | PICKUP BODY (action 8, bit 0x100, label record 9: `FUN_0021ded0` D:L73681-73682; `FUN_00592d50` D:L452069 -> `FUN_00546c00`, the nearest dead body, `FUN_005940d0` D:L452680-452684, cap 900; offered within a squared distance of at most 300 (about 17.3 units), `FUN_005a89c0` D:L463119, and taken by `FUN_00579a30` with the SEAL nearly still, its velocity's square at most 64, D:L438367-438371 -- ~~within 8 of the body~~, corrected by research 368 §0.1): `FUN_00579a30` writes the crouch request and the bit (D:L438417) when clip 0x12 is not playing and clips 0x11/0x13 are not or the top play is not crouched | `'not raised: PICKUP BODY unported (LATER 494)'` (`mover.ts`) | the body carry's port (LATER 494) |
| `STANCE_WORD_CROUCH_FALLBACK_READING` | `FUN_00584c60`'s stand and bit (D:L444287) when the crouch move's clip (type 0x12) cannot be pushed | `'not raised: the clip is always held'` | `FUN_00589900`'s refusals of the push read, with the per-weapon-class motion record |
| `STANCE_MEMORY_RETURNS_READING` | the crouch and stand states' early returns on a refused clip push before their memory writes (D:L444157, D:L444186, D:L444218, D:L444883, D:L444910, D:L444935; `FUN_00586050`'s when `+0x105d` bit 2 is clear, after its clip-0x10 push, D:L444681-444683; the crouch's clip-0x12 fallback, D:L444282-444311, `STANCE_WORD_CROUCH_FALLBACK_READING`'s path) and the crouch idle's `+0x21c` bit-2 clip (D:L444316-444317), which leave `+0x105e` as it was | `"not ported: the clip-push returns leave the memory unwritten that frame, and the crouch's idle under +0x21c bit 2 pushes a clip without clearing it"`: the port writes the memory every ground frame | the clip pushes' port: which of them a player's frame refuses |
| `STANCE_WORD_DIVE_REQUEST_READING` | the dive's second entry: an accepted prone request raises the bit at once (`FUN_00552d60` D:L418879), then `FUN_0057e540` when the controller's `+0x30` answers; the player's `CSealCtrl` answers 0 (0x5499d0), so never the player's -- the player's dive is the press's, its bit at the later acceptance | `"never the player's: CSealCtrl's +0x30 answers 0"` | which controllers answer `+0x30` |
