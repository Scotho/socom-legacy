# 321 -- The weapon crosshairs: every firearm class's reticle, the original's against the port's (NU-3)

- Date: 2026-10-14 (11:40Z). PARITY-2's next wave, row NU-3 of the
  [next-update checklist](../plans/2026-10-13-next-update-checklist.md) (NU.R1: "Update weapon crosshairs to match
  SOCOM II."; NU.R2, NU.R3), read alone in a host gap (OT.R54), the reads-only brief of 2026-10-14 (NU-2 and NU-3).
  NU-3 depends on NU-2: [research 320](320-the-grenade-aim-reticle.md) holds the grenade's set (4), the throw meter and
  the arc, and is not repeated here. Branch `agent/nu23-read` from `2d4cd649c`. The build -- RED first -- is a later
  brief from section 7.
- Review: a fresh review of `5ce652eab` returned PASS WITH FINDINGS (high); F3-F7 (and F1's cause, which research 320
  holds) are folded here with the text they corrected kept beside ("was: ..."); status unchanged.
- AD-3 (2026-10-16 07:09Z, web sprint 40, the reconciliation's C88; branch `agent/ad3` from `e9a8ed8ce`): the perception
  that marks an other and the special actors, read (section 4.1.1) and built (`reticle.ts` `Perception`,
  `perceptionLook`, `reticleTargetState`; `matchFirearm.ts` `perceive`, `aimTarget`); `ENEMY_IDENTIFIED_PLACEHOLDER` and
  `TARGET_KIND_PLACEHOLDER` retired, four placeholders filed for the unread parts (section 7.5). Reading, pending review
  (W40.R4: chunk 14 line 17's independent review covers C88's source chain; this note's transcription awaits its own).
- Status throughout: **reading, pending review.** Source inspection only: the decompilation and the game ELF's bytes
  were read, and the port's code was read. No game, emulator, reader, test or browser was run (no node process at all).
  Where the port's behaviour is stated it is read off its source, not run. Nothing here is proven.
  (BLOOM-SWAP, 2026-11-02, section 3.4, is the exception: its captured values are **proven**, its mechanism a reading,
  pending review.)
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note); the desktop pin
  `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3` (`ref/desktop`). The ELF `game/disc/socom2_game.elf` (read only,
  through scratch scripts): the nineteen bitmap names `BitmapReticule_Init` loads (0x3e4880 `ret_sidearm_01.tif`,
  0x3e48a0 `ret_rifle_01`, 0x3e48c0 `ret_shotgun_01`, 0x3e48e0 `ret_rocket_01`, 0x3e4900 `ret_grenade_02`, 0x3e4920
  `ret_scope_02`, 0x3e4940 `ret_scope_01`, 0x3e4958 `ret_binocs`, 0x3e4968 `nvg_part`, 0x3e4980 `ret_sidearm_02`,
  0x3e49a0 `ret_rifle_02`, 0x3e49c0 `ret_shotgun_02`, 0x3e49e0 `ret_rocket_02`, 0x3e4a00 `ret_binocs2`, 0x3e4a10
  `ret_laser_designator`, 0x3e4a30 `ret_threat`, 0x3e4a40 `ret_grenade_01`, 0x3e4a60 `ret_accuracy`, 0x3e4a78
  `noise50`), the strings 0x3e4848 `"[%s] %s"` and 0x3e4840 `" "`, the floats `DAT_003dc5a0/a8/b0` (200, 200, 24),
  `DAT_003dc588/90/98` (130, 130, 130), `DAT_003dc5b8..f0` (the threat marks' 0.9, 0.6, 0.65, 0.5, 0.9, 0.6, 0.65, 0.52),
  `DAT_003dc528/530` (415, 215), and `DAT_0040c0a8..c0` (past the load segment's file bytes -- the segment at 0x1e7000
  holds 0x221480 bytes of the file, which so end at 0x408480 -- zero-filled at load, .bss; section 4) (the review, F3;
  was: "(0 in the file; section 4)"). The action-type names at the table
  0x661060 (0x21 `Stand -> Hang`, 0x2a `Climb crate`, 0x2c `Stand -> Ladder`) and the runtime ids' strings (0x661928
  `Step up`, 0x661940 `Climb medium`, 0x661968 `Climb over`, research 313's). **The disc's values only from the committed
  goldens**: `packages/scene/test/golden/weapon-records.json` (`readKitTable(...).records` over `RUN/ZWEAPON.ZAR`, 44
  records, extracted 2026-10-02: every stance's `Reticule_Modifiers`, the burst scalar, the zoom modes) and
  `arsenal-items.json` (`readArsenal`, the ids and classes). No reader was run; the reticle bitmaps' sizes and texels
  beyond the rifle's and the sidearm's, and the rocket launchers' records, need one and are named as owed (section 7.2).
- Built on: [research 84](84-accuracy-and-recoil.md) sections 2-4 (the frame, the bloom, the knock), 9 (the sets, the
  rifle's draw, the colours, the scope, the binoculars), 15 (the sway undrawn) and 16 (the sidearm's set);
  [research 94](94-the-arsenal.md) sections C1.4-C1.5 and C6 (the scoped weapons, the arming grey R94.16, the set by
  class); [research 87](87-hud.md) section 13 (the zoom readout and the scope's range); research 320 (set 4). Cited, not
  re-derived, except where this read adds to them or corrects them (section 8).

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R321.1 | **Four shapes for the firearms.** Set 0 (pistols) and set 1 (SMGs, rifles, MGs, unscoped snipers): a fixed ring at its own size on the centre and four arms, each the floating bitmap at its own size with its inner edge `size` out along an axis -- the cross. Set 2 (shotguns): the ring and four **corner** pieces, each at a diagonal corner of the square of half side `size`. Set 3 (grenade launchers, rocket launchers, an M203 or the F2000 in a round mode): the corners at 0.7 of the floating bitmap, and the fixed bitmap drawn as **four mirrored quads of 0.7 its size meeting at the frame's centre**, never at the knock's. Set 5 (any scope): the tube and its inner ring, no reticle | sets 0 and 1 as the original (pinned); sets 2 and 3 drawn as the cross (D1, D2) | 1, 2 |
| R321.2 | **The size is the kit's bloom** (research 84 sections 3-4, confirmed at its lines): halved in third person, the whole reticle moved by the knock; per weapon and stance from `Reticule_Modifiers` -- the table of section 3.3 holds all 44 records | ported and pinned (MISSION R8's continuous clock, the owner's ruling) | 3 |
| R321.3 | **A swap carries the size**: the kit's `+0x84c` has no writer but the tick and the round, so a new weapon starts from the old size, lifted to its own `TargetMin`, and opens or closes to its target at its own rates | the page resets to the new record's `TargetMin` on every swap (D3) | 3.2 |
| R321.3a | **A grenade up closes the size** (BLOOM-SWAP, 2026-11-02; R321.3 kept): the kit's tick runs the selected slot's item, so a hand grenade, a charge, a gear item (the Detonator) or the armour up ticks the one kit size at its own `Reticule_Modifiers` with its range taken as 0 to 0 -- 60 a second to 0 on the disc; back on the firearm the size carried is lifted to its `TargetMin` and opens at its own rate. Captured on r0004: the Mk141 up from 26 falls 2 a frame to 0 in about 0.45 s; the rifle re-enters at 2 and opens +1 a frame to 26 in about 0.8 s | built (`Accuracy.setItem`, `matchFirearm.ts` `gunFrame`); was: the rifle's record ticked on through the grenade, the size held at 26 | 3.4 |
| R321.4 | **Colours** (`FUN_00215c10`): rest (200, 200, 24); a teammate under the reticle within 320 units across the ground (500 scoped) green (24, 200, 44); an identified other red (200, 24, 44); grey (130, 130, 130) inside a rocket launcher's or its rocket's arming distance (class 0x91 / 0xb9; R94.16 as ARMING-GREY corrected it, 2026-10-17; *was:* "a launcher round's"), **while the muzzle is blocked** past the drawn size, and **while a climb or a ladder's start is on top**; black (the unwritten `DAT_0040c0b8..c0`) with nothing left to fire. The ring is never coloured; set 3's big sight is | the page has rest and the arming grey only (D4, D5, D6) | 4 |
| R321.5 | **A target's name and a teammate's health**: over a target the colour picks, the name at scale 0.7 (`"[%s] %s"` with a clan tag) beside the reticle's upper right, and a 60 x 5 health bar 15 above it for a teammate -- under every set while the player is alive, the meter, the scope and the binoculars included (the review, F4) | none (D4, D10) | 4.2 |
| R321.6 | **The scopes' overlays are research 84 section 9's, confirmed**: the tube `ret_scope_01` and the soft ring `ret_scope_02` as four mirrored 320-pixel quads over (0, -96)-(640, 544), the F2000 without the ring, the range line at (415, 215), the sway undrawn; the binoculars and the goggles likewise | as the original (pinned) | 5 |
| R321.7 | **The build's test is a table test per class**: `packages/viewer/test/reticleClass.test.ts`, one row per class (section 7.3) | -- | 7.3 |
| R321.9 | **The red is the body's perception's mark, and the special actors are green** (AD-3): a record per actor fills by the rate times each completed query's time, clamped to [0, 2], marked at 1 or more and no veto; cleared at once when the target is inactive or rejected (out of the 80-degree cone and slow); falls at 1 a second unseen. A body carrying the escortee bit (online) -- the hostages, the escort's VIPs -- is green with its name and bar, red only in ESCORT for a Terrorist-side observer | built (`Perception`, `perceptionLook`); the seen rate, the sight, the queries' schedule and the veto placeholders (section 7.5). From 2026-10-18 the room also spawns ESCORT's VIPs (`ExtractionAuthority`, game type 3) | 4.1.1 |
| R321.8 | **Corrected**: research 84 section 9's binoculars paragraph and `reticle.ts`'s header call `hud+0x4544`, `+0x45e0` "the ring and dot" and `+0x2930` "the threat polys": they are the target's name, its health bar and the four arms; the ring and dot are `+0x70`, the threat marks `+0x19b0` (eight, `ret_threat`) | a comment's words; the code is right | 8 |

## 1. The set each class draws

`FUN_005be300` (D:L474896-474951; research 84 section 9, re-read whole) keeps the set at `kit+0x54`; the swap re-asks
it as soon as it has written the new item (`FUN_005c4b10` D:L478907-478912); the reticle frame `FUN_00216770`
(D:L70297-70467) lays a changed set by `ChangeReticule` (`FUN_00213e20`, D:L69260-69678) while the body is alive
(D:L70391-70411), and -1 (nothing) while it is dead (D:L70413). The order: the 9x view 7; a magnification over 1.01 5
(the record's `ZoomMode[state - 4]` while the index is under `NumZoomModes`, D:L474917-474923); a fitted launcher
(`FUN_003c5d80`) 3, but 1 for an M203 rifle or the F2000 (`FUN_003c5e40`, or id 0x3f) whose slot's mode is under 5
(D:L474942-474947); then the id (D:L474926-474939). By class, over the goldens' ids:

| class (`arsenal-items.json` `cls`) | ids | set | fixed part | floating part | shape (section 2) |
|---|---|---|---|---|---|
| pistol | 4-16 | 0 | `ret_sidearm_01` | `ret_sidearm_02` | the cross |
| smg | 31-38 | 1 | `ret_rifle_01` | `ret_rifle_02` | the cross |
| rifle | 51-68 | 1; the M16A2-M203 (52), M4A1-M203 (61), F2000 (63) in a round mode 3 | as set 1 / set 3 | | the cross / the launcher's |
| shotgun | 81-84 | 2 | `ret_shotgun_01` | `ret_shotgun_02` | the corners |
| mg | 91-93 | 1 | `ret_rifle_01` | `ret_rifle_02` | the cross |
| sniper | 101-106 | 1 unscoped; 5 scoped | as set 1 / the scope | | the cross / the tube |
| grenade launcher | 142 MGL, 143 M79 (141 the M203 is no hand item) | 3 (a carrier, `FUN_003c5d80`) | `ret_rocket_01` | `ret_rocket_02` | the launcher's |
| rocket launcher | 145 LAW, 146 RPG | 3 (a carrier) | `ret_rocket_01` | `ret_rocket_02` | the launcher's |
| any scoped firearm, scoped | the 13 of research 94 section C1.4 | 5 | `ret_scope_02` (the F2000 none) | -- (the tube `ret_scope_01`, `hud+0x44d4`) | the tube |
| any, in the 9x view | -- | 7 | `ret_binocs` | `ret_binocs2` | the binoculars |
| the Designator | 11 | 9 | `ret_sidearm_01` | `ret_laser_designator` | its own (2.4) |
| a turret | 205, 207, 230 | 0 | `ret_sidearm_01` | `ret_sidearm_02` | the cross, and the tube in view state 2 (2.5) |
| the throwables and charges | 121-189 | 4 or none | research 320 | | the meter |

The port's `reticleType` (`reticle.ts`) is this function, row for row, pinned (section 7.4).

## 2. The shapes

`ChangeReticule` sets what shows; `BitmapReticule_UpdateAccuracy` (`FUN_00215250`, D:L69708-69903) lays the arms each
frame (from `FUN_00216770` D:L70433, every set but 4). In both, `(cx, cy)` is the reticle's centre `hud+0x44ac/+0x44b0`
= `(320 + kit+0x18 + kit+0x20, 224 + kit+0x1c + kit+0x24)` (D:L70421-70424: the knock's offset moves it), `s` the drawn
size (`hud+0x44b4` = the kit's `+0x84c`, D:L70419; halved in view state 0, D:L69730-69735), `W`, `H` the floating
bitmap's size (`hud+0x452c/+0x4530`; the fixed bitmap's when a set has no floating one, D:L69298-69309).

### 2.1 The cross: sets 0 and 1

- **The ring** (`hud+0x70`, the fixed bitmap) at its own size centred on the centre, alpha 128 (D:L69654-69662), moved
  to the centre each frame (D:L70425-70431). Never coloured (`FUN_00215c10` colours only the arms, section 4).
- **The arms** (`+0x2930`, `+0x2b20`, `+0x2d10`, `+0x2f00`, D:L69824-69841): each a quad of the floating bitmap's own
  size, its inner edge `s` from the centre: the right arm x `cx + s` .. `cx + s + W`, the left `cx - s - W` .. `cx - s`,
  both over y `cy - 1` .. `cy - 1 + H`; the top y `cy - s - H` .. `cy - s`, the bottom `cy + s` .. `cy + s + H`, both
  over x `cx + 1 - W` .. `cx + 1`. The stored bitmap is turned and mirrored per arm by three UV permutations
  (`FUN_00358cc0`, `FUN_00358d50`, `FUN_00358e20`, D:L254804-254890: the right arm the first, the left the first and the
  third, the bottom the third, the top none); how each maps onto the quad's corners depends on the first triangle's
  vertex order, which the decompiler loses (`FUN_00360fc0`'s arguments), so the arms' orientation is taken from the
  console frame, as W2.4 measured it for the rifle (all four bright at the outer end).
- **The rest on the console**: set 1 in third person at `TargetMin` 1 halved -- the arms' outer ends 31-32 pixels out,
  the 65x65 cross of `scripts/parity/refs/console_spawn_slot8.png` (research 84 section 9, `reticle.ts`'s header).
- **Set 0** the same with `ret_sidearm_01` (32x32: a dark disc and a 2x2 dot) and `ret_sidearm_02` (16x16), research 84
  section 16's sizes.

### 2.2 The corners: set 2 (the shotguns)

- **The ring**: `ret_shotgun_01` at its own size on the centre, as set 1's (D:L69654-69662).
- **The corners** (D:L69799-69823): each a quad of `ret_shotgun_02`'s own size with one corner on a corner of the
  square of half side `s` about the centre: the upper right x `cx + s` .. `cx + s + W`, y `cy - s - H` .. `cy - s`; the
  upper left x `cx - s - W` .. `cx - s`, the same y; the lower left the same x, y `cy + s` .. `cy + s + H`; the lower
  right x `cx + s` .. `cx + s + W`, the same y. So the shotgun's floating parts go out **diagonally** as the size grows --
  from the shotguns' large rest (`TargetMin` 20-30, section 3.3) -- where the cross's go out along the axes. Their
  orientation is the permutations' (2.1): the upper left as stored, the upper right `FUN_00358d50`, the lower left
  `FUN_00358e20`, the lower right `FUN_00358cc0`; the texels are owed (section 7.2).

### 2.3 The launcher's: set 3

- **The corners** as set 2's, at 0.7 of `ret_rocket_02`'s size (D:L69800-69803, restored at D:L69819-69822).
- **The big sight** (`ChangeReticule`, D:L69595-69652): the ring quad hidden (D:L69604); instead the four quads the
  scope uses (`+0xa30`, `+0xc20`, `+0xe10`, `+0x1000`) shown at alpha 128, each `ret_rocket_01` at 0.7 of its size,
  each with one corner on the **frame's centre (320, 224)** -- upper left, upper right, lower left, lower right, their
  vertex orders mirroring the one stored bitmap about the centre lines -- sampled at 0.01-0.99. Laid once at the
  change and never moved by the frame (D:L70425-70431 moves `+0x70` only), so the knock climbs the corners and not the
  sight. Coloured with the arms (D:L70278-70283), so it greys with the arming test.
- **No pip**: the blocked-muzzle pip fades out under sets 3, 4 and 10 (D:L70435-70445). Corrected at NU-3a's build
  (2026-10-14): under set 3 (and 10) `FUN_00215250` still runs first (D:L70433) and steps the pip -- up 32 while blocked
  and under 128 (D:L69753-69771) -- before the frame's fade takes 32 off, so from rest it never shows, but a pip already
  shown (a blocked muzzle as the set changes) holds at its alpha, at most 96, while the muzzle stays blocked, and drops
  64 a frame once clear; only set 4 skips the step (D:L70415-70417). (Was: "fades out under sets 3, 4 and 10".)

### 2.4 The Designator: set 9 (not a firearm; noted)

`ret_sidearm_01` as the ring and `ret_laser_designator` as four arms laid as a pinwheel (D:L69782-69798): each arm
offset to one side of its axis (the right arm above the horizontal line, the top arm left of the vertical, ...). The
page never holds the Designator as itself (research 84 section 7).

### 2.5 A turret in view state 2 (not a firearm class; noted)

Set 0 by its id (205-253), and in view state 2 `ChangeReticule` shows the scope's tube quads `+0x11f0..` too
(D:L69663-69670). *Read 2026-10-17 (TURRET-RETICLE, research 215 s8.2; reading, pending review):* the mount takes the
turret's slot up and the switch asks its set (`FUN_005463c0` D:L412214-412218, `FUN_005c4b10` D:L478907-478912), so the
HUD draws set 0 for PKM TURRET 205, LMG TURRET 207 and MGL FRAG TURRET 230 whatever was held (none is a carrier,
`FUN_003c5d80`; each record has one zoom mode), at the turret record's bloom; at the mount, view state 2 is entered only
on a THERMAL turret, from any view from the head (D:L412247-412255), third person staying 0 -- after it the d-pad's Up
enters 2 from third person, again only on a THERMAL turret (a plain one's Up gives 1: research 84 Z2, corrected by
LATER 97, which builds both; the tube quads built by LATER 164, below). *Was (LATER 97):* "... view state 2 is entered only from
first person on a THERMAL turret (D:L412247-412255), third person staying 0 -- after it the d-pad's Up enters 2 from
third person (research 84 Z2; the port's mounted zoom, LATER 97)". *Was (the review's F2):* "view state 2 is entered only
from first person on a THERMAL turret (D:L412247-412255), third person staying 0". Built on the page (`./matchFirearm` `aimReticle`;
`reticleClass.test.ts` "TURRET-RETICLE"). *Was:* "and in view state 2 (the first person a turret steps into, research 84
section 7) ... Research 215's turret reticle is open (`TURRET_ROUND_LINE_PLACEHOLDER`'s row); this note does not settle
it." (Settled since: the reticle by TURRET-RETICLE, 2026-10-17, and the rounds against it by TURRET-CONE, 2026-10-18 --
the line placeholder is now `TURRET_ROUND_LINE_READING`, research 215 s4 and s8.2.)

*The tube, built 2026-10-21 (LATER 164; reading, pending review).* `ChangeReticule` first hides the tube and the
soft ring `ret_scope_02` on its generic branch (D:L69576-69594), then, set 0 laid in view state 2, shows the
tube's four quads `hud+0x11f0..` (D:L69663-69670) beside the ring and the arms; `ret_scope_02` stays hidden. The
quads are laid once at the HUD's making, over (0, -96)-(640, 544) at alpha 128 (`FUN_002178c0` D:L70918-70963), and
the HUD draws its three lists in turn (`FUN_002151f0` D:L69697-69702: `+0x1c`, `+0x34`, `+0x4c`, filled at
`FUN_002178c0` D:L70965-71005) -- the ring in the first, the tube in the second, the arms in the third. *The page:*
`reticle.ts` `Reticle.setTube(on)` shows the four `ret_scope_01` meshes under the reticle mode, laid as the scope's
(`scopeLayout`, the scope's black bars beside it on a wide frame -- the same adaptation as the scope's), at
`renderOrder` 0.5 between the ring's 0 and the arms' 1 (`ret_scope_02` stays at 2, unshown); `state().tube` says
it is drawn; `matchFirearm.ts` `aimReticle` asks `setTube(set === 0 && zoom.state() === 2)` each frame. *The re-lay
reading:* the original lays the reticle -- and so the tube -- only when `ChangeReticule` runs: at a set change, and
at every view change while a lens plays (`FUN_001f0750` D:L52912-52920 -> `FUN_005be570(kit, 1)`, gated on
`DAT_003dc358` and `DAT_00408cd0`); a view change into or out of 2 with no lens playing would leave the last
laying until the next set change. *The lens-name scan* (the gameplay seat's read, 2026-10-21; a disc scan, not
re-run by the build): the six maps with a THERMAL turret hold every lens zAnim view 2 plays, so on every map the
page can reach the lens plays at each such change and the per-frame ask draws what the original's re-lay draws.
Tests: `reticle.test.ts` "LATER 164: the scope's tube over set 0's cross in view state 2" (two),
`matchFirearm.test.ts` "LATER 164 ..." (ZWEAPON). Owed: a rendered look on a THERMAL turret (no browser run here).

### 2.6 Beside every set: the threat marks (noted)

Eight `ret_threat` quads (`hud+0x19b0..`, research 84 section 15's "damage-direction markers") laid by `FUN_00215250`
(D:L69842-69899): four on the axes, centred 15 beyond the arms' outer ends (`size + W + 15`, `W` the arm's width as
`ChangeReticule` kept it in `hud+0x4534/+0x4538`: halved under set 4, 32 under set 5), four on the diagonals turned 45
degrees, each one's length the bitmap's times a body float `+0xf00` .. `+0xf1c`, the diagonals drawn only while their
alpha is above 0. What drives `+0xf00..` is not read here (`THREAT_MARKS_READING`); research 91 section 6's "no
damage-direction markers" stands against this and is for that row's owner.

## 3. The spread: its growth and its settle

### 3.1 The rule (research 84 sections 3-4, confirmed at their lines)

Re-read at `FUN_005c2670` (D:L477256-477377) and `FUN_005c3360` (D:L477683-477814): the stance's `TargetMin`/`TargetMax`
(`FUN_0058a720(body, 1)`), 0 and 0 for the classes 0x97, 0x79, 0xbe, 0xc9 (D:L477282-477288); the size lifted to the min
(D:L477295-477297); the target from the speed and the look rates (`|v|^2 / 65 x Mult + 158.7 (turn^2 + pitch^2)`) clamped
to the range; up by `TargetDilateUponMovement` a game frame toward it, down by `TargetConstrict` a second
(D:L477356-477368); a round adds `TargetDilateUponFire x (1 + burst scalar)`, clamped (D:L477797-477804); the knock
`ReticuleKnock` (x `KnockEntryStrength` on the `KnockCount`-th round), capped at `ReticuleKnockMax`, returning at
`ReticuleKnockReturn` a second; none scoped. The HUD halves the size in third person (D:L69730-69735) and draws the
whole reticle at the knock's offset (D:L70421-70424). The port runs it continuously (`accuracy.ts`, MISSION R8: the
owner's ruling of 2026-10-04, research 208 section 9) -- a known deviation, not this row's.

### 3.2 A swap carries the size (new here)

The kit's `+0x84c` is written only by the tick (D:L477295-477297, D:L477356-477368) and the round (D:L477797-477804): a
grep of every `+ 0x84c)` store in the decompilation finds no other writer on a kit: the other hits -- D:L35770, D:L37450,
D:L267135, D:L520356, D:L520365, D:L520379, D:L521050, D:L534613, D:L537804 -- are stores on other objects, none in a
kit function (the review, F5; was: "(the hits at D:L35770 and D:L37450 are other objects')"). So a swap does not reset it: the new weapon's first tick lifts it to the new `TargetMin` if under,
and it moves to the new target at the new rates -- a Mark 23 at 30 taken over to the M4A1 SD (max 26) closes at 50 a
second; an M4A1 at rest (1) taken to the Mark 23 opens to 10 at once. The port's `Accuracy.setWeapon` calls `reset()`,
which sets the size to the new record's `TargetMin` and zeroes the knock (D3). Whether the knock's offsets reset on a swap
is likewise unread in the switch; nothing in `FUN_005c4b10` writes `kit+0x20/+0x24` (the knock returns at the new
record's rate, `SWAP_KNOCK_READING` for the capture).

**What else the page's `reset()` drops on a swap** (the review, F7). `Accuracy.reset()` (`accuracy.ts:337-343`) also
zeroes the scope's sway and the pull's round count and sets the exertion to 1. In the original the switch
(`FUN_005c4b10`, D:L478779-478938) writes none of them: not the sway (kit `+0x28/+0x2c`, which `FUN_005b9280` steps,
D:L472140-472176), not the pull's count `kit+0x818` (reset only by the trigger, research 84 section 6), not the knock
(`+0x20/+0x24`), and not the exertion, which is the body's (`body+0xeb0`, research 84 section 17), not the weapon's.
The exertion is **raised** instead: when the set changes (the switch marks it, D:L478909-478911), the HUD frame's take of
the mark (`FUN_005be5f0`, D:L475041-475044) adds 0.5 to it (`FUN_00578150(0.5, body)`), as a scope's entry does --
capped at 1 (`FUN_00578150` D:L437518-437540: a value already 1 is left, a sum over 1 becomes 1; research 84 section 17).
So a swap that changes the set carries the exertion and lifts it by 0.5 to at most 1; the page sets it to 1 -- the same
whenever the exertion stood at 0.5 or more, different only below (the re-review, item 4; was: "lifts it by 0.5; the
page sets it to 1"). D3 holds all four; the sway
matters only scoped (and a swap leaves a scope, research 84 section 7), the pull's count only until the trigger moves.

### 3.4 A grenade up closes the size (BLOOM-SWAP, 2026-11-02)

Craig's report: "nade swapping doesn't reset bloom". Simulation track, OT.R97 (r0004 the specification). Branch
`agent/bloom-swap` from `adb4e58fb`.

**The capture (proven).** Seat ac's capture of r0004 on M51, the M4A1 SD with the Mk141 on L2 (`qs-t1..3`) and through
the R2 menu (`menu-t1..3`), with controls (`ctl-t1..3`, `run-t1..3`), three trials each, agreeing in their values and their frame counts,
not sample for sample: the capture drops and duplicates samples (`qs-t3`'s 17.99 twice, `menu-t3`'s 7.98 twice; the
review of ba6e7d8a4, item 4; was: "identical to the frame")
(`agent-mail/evidence/eph-hunt-2026-11-01/bloom-swap/`; the kit's size `actor+0xe2c` = kit `+0x84c`, the selected slot
`actor+0xe04` = kit `+0x824`, 0 the rifle, 4 the Mk141): running opens the rifle 1 -> 26 at +1 a frame; the Mk141 up,
26 -> 24 on the slot's first frame, then about 2.002 a frame (60 x 525/15734) to 0 in about 0.45 s; back on the rifle,
0 -> 2 on its first frame, then +1 a frame to 26 in about 0.8 s; L2 and the R2 menu the same. Controls: running with no
swap holds 26; stopping closes to 1 in about 0.5 s. The port held 26 throughout (`port.txt`): the grenade never became
the firearm's `kitItem`, so the rifle's record ticked on.

**The mechanism (reading, pending review).** `FUN_005c2670` (D:L477256-477377) reads the item in the SELECTED slot
(`kit+0xe4 + kit+0x824 x 4`, D:L477280), whatever it is, cast to a weapon (`FUN_001821d0`, D:L477280-477281), and its
`Reticule_Modifiers` stance (`FUN_003c5a50(item, FUN_0058a720(body, 1))`, D:L477283-477284). For the categories
`FUN_003d1e10` names 0x97, 0x79, 0xbe and 0xc9 (the charges, the hand grenades, the gear, the armour) it takes
`TargetMin` and `TargetMax` as 0 and 0 (D:L477285-477288); any other item its own (D:L477290-477293). The rest of the tick
is section 3.1's on that item's stance: the size lifted to the min (D:L477295-477297), the knock's return at its
`ReticuleKnockReturn` (D:L477298-477318), the target clamped to the range (D:L477339-477353), the size up by its
`TargetDilateUponMovement` or down by its `TargetConstrict` a second (D:L477354-477370). So:

- **Why 2 a frame to 0, not 50 a second to 1**: the Mk141's own `TargetConstrict` is 60 (`zweapon.rdr` `Mark141`
  `Reticule_Modifiers`, read through `readKitTable` -> `KitTable.itemReticles`), and its range is 0 to 0 by category,
  not its file's 2 to 6. Every item of the four classes on the disc carries the same stances (2 / 6 / 60 / 6, every
  stance; read over all of them, `bloomSwap.test.ts`), so every grenade type, charge and the Detonator close alike.
- **The grenade's own record, not a generic path**: the tick takes the selected item's own stance (D:L477283-477284);
  only the range is zeroed by category.
- **One size per kit, shared**: `+0x84c` is the kit's (section 3.2), so the rifle inherits what the grenade's tick left:
  0, lifted to the rifle's 1 and opened by 1 in the same tick -- the capture's 2 on re-entry. R321.3 (the size carried,
  not reset, at a swap) is kept: the capture does not contradict it; what the port lacked was the grenade slot's tick.
- **r0004** (OT.R97): the twin is r4 `0x5c9b40`-`0x5c9f54`. The code-diff's `fundiff.py` over r0001 `0x5c2670` against
  it differs only in branch targets and the body's `+0x1350/+0x1354/+0x1358` read as `+0x1354/+0x1358/+0x135c` (a field
  shifted by 4); the category test, the range, the rates and the size's steps are the same. The capture is r0004's.

**The port (built, 2026-11-02).** `KitTable.itemReticles` (`@s2u/scene` `arsenal.ts`): every grenade, charge, gear and
armour item's stances. `Accuracy.setItem` (`viewer/src/accuracy.ts`, `ITEM_RETICLE_ZERO_CATEGORIES`, `itemReticleOf`):
the tick's terms on the item's stance, its range 0 to 0 for the four categories. `matchFirearm.ts` `gunFrame` names the
hand's item each frame (`FirearmHands.handItem`, from the item's press: L2's quick swap and the R2 menu raise it alike,
`./grenade` `equip`), null for the firearm, a raised launcher or a mounted turret. The port runs it continuously (MISSION
R8, the owner's ruling: bloom is the kit's, not movement's); the capture's frame counts are pinned at one 30 Hz game frame
a tick (`bloomSwap.test.ts`), the page's wiring at its 60 Hz frames (`matchFirearm.test.ts`, "BLOOM-SWAP").

**The first shot after the swap** (ac's first-shot capture, `.../bloom-swap/first-shot/`, r0004, three trials each).
Walking at half stick, the trigger pressed 0.1 s after the rifle's return: the round leaves about 0.33 s after the return,
the size the frame before 6.42-6.47 (6.56 walking with no swap), the round +7 (`TargetDilateUponFire` 7) to 13.37. The
model reaches it: from 0 the rifle re-enters at 2 and stands at the walk's target by its sixth frame (0.2 s), so by the
release the size is the target, and the round adds 7 (`bloomSwap.test.ts`, the walk's speed chosen for a 6.45 target,
20.5 units a second; the CSV's positions give about 21 units a second at the median over its uneven sample intervals,
a target near 6.9, the samples' spread about it wide enough to hold 6.45 -- the review, item 4; was: "the capture's
speed is not in the data"). Pressed 0.8 s after the return, the round leaves about 1.03 s after it, at 5.86.
Two things the capture shows that are not this row's (the original's code not read for them): (a) about 0.33 s from the
return to the round leaving, the same in all trials -- the port refuses a firearm round below a fully raised rifle
(`Fire`'s `raiseRefused`, LATER 180), whose timing against 0.33 s was not measured here (LATER 655); (b) no round at all
while running after a swap (full stick or 0.8, the trigger held 2 s), where with no swap a run fires about 0.15 s after
the press -- player-visible; the port's behaviour there not checked (LATER 656; was: "the port has no such gate", which
was not checked).

**Not built, named.** (1) The room's cone (`net/shotCone.ts`, `room.ts` `aim`) runs the firearm's record through a grenade
up: no command or event names a hand grenade selected (the room knows the raised launcher only, `Player.held`). Its size
never stands under the page's (the item closes faster and lower, and from the return both run the firearm's size rule:
`bloomSwap.test.ts`). The knock's offset is not covered (the review of ba6e7d8a4, item 1; was: "both then run the same
firearm rule"): with the item up the page's offset returns at the item's `ReticuleKnockReturn` (60 a second), the room's
at the firearm's (70 the M4A1 SD, 75 item 5's) -- for the SD a lag of 6.4 pixels at most, inside the cone's cover (about
11.3); for item 5 about 22 pixels against 12, so a full knock, the item held about 1.47 s and a round within about 0.23 s
of the return could be refused `cone` -- probably unreachable behind the raise (LATER 180), checked by nothing (LATER
652). (2) A raised rocket launcher is the selected slot too (its range its own 2 to 6, category 0x91): not fed, its
reticle runs the firearm's as before; uncaptured (LATER 653). (3) `FUN_00550ef0`'s exertion pull reads the selected
slot's record as well (`FUN_005c3780` D:L477826-477834, D:L418341-418350): the port's keeps the firearm's (it matters
only scoped; LATER 654).

### 3.3 The constants, by weapon and stance (the golden `weapon-records.json`)

Read off the committed golden, not run. The size: `TargetMin`-`TargetMax` / `TargetConstrict` (pixels a second) /
`TargetDilateUponMovement` (pixels a game frame) x `TargetDilateUponMovementMult` / `TargetDilateUponFire`; the set by
section 1. In PS2 pixels of the 640x448 frame, before the third-person halving.

| id | name | class | set | stand: min-max / constrict / move x mult / fire | crouch | prone |
|---|---|---|---|---|---|---|
| 4 | F57 | pistol | 0 | 10-30 / 75 / 0.5 x 1 / 20 | 4-30 / 75 / 0.5 x 13 / 20 | 6-34 / 75 / 0.5 x 63 / 20 |
| 5 | M9 | pistol | 0 | 12-26 / 60 / 0.5 x 1 / 20 | 12-26 / 60 / 0.5 x 13 / 20 | 16-30 / 60 / 0.5 x 63 / 20 |
| 6 | 226 | pistol | 0 | 8-22 / 40 / 0.55 x 1 / 20 | 8-22 / 40 / 0.55 x 13 / 20 | 12-26 / 40 / 0.55 x 63 / 20 |
| 7 | DE .50 | pistol | 0 | 32-70 / 35 / 2 x 1 / 40 | 29-70 / 35 / 2 x 13 / 40 | 26-70 / 35 / 2 x 63 / 40 |
| 8 | 9mm Pistol | pistol | 0 | 8-20 / 40 / 0.75 x 1 / 10 | 8-20 / 40 / 0.75 x 13 / 10 | 10-24 / 40 / 0.75 x 63 / 10 |
| 12 | P228 | pistol | 0 | 8-22 / 40 / 0.55 x 1 / 20 | 8-22 / 40 / 0.55 x 13 / 20 | 12-26 / 40 / 0.55 x 63 / 20 |
| 13 | SR-1 Gyurza | pistol | 0 | 8-22 / 40 / 0.55 x 1 / 20 | 8-22 / 40 / 0.55 x 13 / 20 | 12-26 / 40 / 0.55 x 63 / 20 |
| 14 | Model 18 | pistol | 0 | 15-65 / 70 / 0.5 x 1 / 10 | 17-65 / 70 / 0.5 x 13 / 10 | 15-70 / 70 / 0.5 x 63 / 10 |
| 15 | Mark 23 | pistol | 0 | 10-30 / 75 / 0.75 x 1 / 20 | 10-30 / 75 / 0.75 x 10 / 20 | 14-34 / 75 / 0.75 x 60 / 20 |
| 16 | Mark 23SD | pistol | 0 | 10-30 / 75 / 0.75 x 1 / 20 | 10-30 / 75 / 0.5 x 13 / 20 | 14-34 / 75 / 0.5 x 63 / 20 |
| 31 | HK5 | smg | 1 | 5-20 / 30 / 0.25 x 1 / 4 | 4-18 / 30 / 0.25 x 13 / 4 | 5-20 / 30 / 0.25 x 63 / 4 |
| 33 | HK5SD | smg | 1 | 5-20 / 30 / 0.25 x 1 / 4 | 4-18 / 30 / 0.25 x 13 / 4 | 5-20 / 30 / 0.25 x 63 / 4 |
| 34 | F90 | smg | 1 | 6-40 / 60 / 0.25 x 1 / 8 | 6-40 / 60 / 0.25 x 13 / 7 | 6-40 / 60 / 0.25 x 63 / 9 |
| 37 | 9mm Sub | smg | 1 | 8-71 / 100 / 0.25 x 1 / 4 | 8-55 / 100 / 0.25 x 13 / 6 | 8-71 / 100 / 0.25 x 63 / 6 |
| 38 | MP5K | smg | 1 | 6-44 / 36 / 1 x 1 / 8 | 5-42 / 36 / 1 x 63 / 8 | 4-40 / 36 / 1 x 13 / 4 |
| 51 | M16A2 | rifle | 1 | 0.5-20 / 37 / 1.5 x 1 / 22 | 0.25-15 / 37 / 1.5 x 13 / 22 | 0-12 / 37 / 1.5 x 63 / 22 |
| 52 | M16A2-M203 | rifle | 1 (3 in a round mode) | 1.5-23 / 32 / 1.5 x 1 / 22 | 1.25-21 / 34 / 1.5 x 13 / 22 | 1-19 / 37 / 1.5 x 63 / 22 |
| 54 | M4A1 | rifle | 1 | 1-26 / 50 / 1 x 1 / 7 | 1-25 / 55 / 1 x 13 / 7 | 1-24 / 50 / 1 x 63 / 7 |
| 57 | 552 | rifle | 1 | 1.5-27 / 50 / 1 x 1 / 9 | 1.25-25 / 50 / 1 x 13 / 8 | 1-23 / 50 / 1 x 63 / 7 |
| 58 | AK-47 | rifle | 1 | 1.5-31 / 40 / 1 x 1 / 9 | 1-27 / 40 / 0.5 x 6 / 9 | 1-25 / 40 / 0.5 x 63 / 8 |
| 59 | AKS-74 | rifle | 1 | 0.5-55 / 45 / 2 x 1 / 8 | 0.5-51 / 45 / 2 x 13 / 8 | 0.5-47 / 45 / 2 x 63 / 8 |
| 60 | M14 | rifle | 1 | 0-34 / 37 / 1.5 x 1 / 8 | 0-31 / 37 / 1.5 x 13 / 7 | 0-29 / 37 / 1.5 x 63 / 6 |
| 61 | M4A1-M203 | rifle | 1 (3 in a round mode) | 1.25-32 / 40 / 1.15 x 1 / 7 | 1.25-29 / 45 / 1.15 x 13 / 9 | 1-26 / 50 / 1.15 x 63 / 7 |
| 62 | M4A1 SD | rifle | 1 | 1-26 / 50 / 1 x 1 / 7 | 0.75-25 / 55 / 1 x 13 / 7 | 1-24 / 50 / 1 x 63 / 7 |
| 63 | F2000 | rifle | 1 (3 in a round mode) | 1.5-23 / 32 / 1.5 x 2 / 22 | 1.25-21 / 34 / 2 x 13 / 22 | 1-19 / 37 / 1.5 x 63 / 22 |
| 64 | SA-80 A2 | rifle | 1 | 0.5-20 / 37 / 1.5 x 1 / 22 | 0.25-15 / 37 / 1.5 x 13 / 22 | 0-12 / 37 / 1.5 x 63 / 22 |
| 65 | AK-105 | rifle | 1 | 2-30 / 45 / 0.75 x 1 / 8 | 2-30 / 45 / 0.75 x 13 / 8 | 2-30 / 45 / 0.75 x 13 / 8 |
| 66 | KBP OTs-14 Groza | rifle | 1 | 10-35 / 45 / 1 x 1 / 8 | 10-35 / 45 / 1 x 13 / 8 | 8-30 / 45 / 1 x 63 / 8 |
| 67 | 552SD | rifle | 1 | 2.5-27 / 45 / 1 x 1 / 9 | 2-25 / 45 / 1 x 13 / 8 | 1.5-23 / 45 / 1 x 63 / 7 |
| 68 | Steyr Aug | rifle | 1 | 10-45 / 60 / 0.25 x 1 / 8 | 10-45 / 60 / 0.25 x 13 / 8 | 8-42 / 65 / 0.25 x 63 / 7 |
| 81 | Spas 12 | shotgun | 2 | 25-52 / 65 / 12 x 2 / 5 | 25-50 / 65 / 8 x 13 / 5 | 25-48 / 65 / 4 x 63 / 5 |
| 83 | JACKHAMMER | shotgun | 2 | 30-75 / 65 / 3 x 1 / 7 | 30-68 / 50 / 3 x 13 / 7 | 30-60 / 65 / 3 x 63 / 7 |
| 84 | 870 | shotgun | 2 | 25-52 / 45 / 3 x 2 / 7 | 21-52 / 45 / 2.5 x 13 / 7 | 20-51 / 45 / 2.5 x 63 / 7 |
| 91 | M60E3 | mg | 1 | 8-35 / 32 / 6 x 1 / 5.5 | 6-30 / 32 / 6 x 13 / 5.5 | 4-25 / 57 / 6 x 63 / 5.5 |
| 92 | M63A | mg | 1 | 6-30 / 17 / 6 x 1 / 4 | 4-25 / 17 / 6 x 13 / 7 | 3-20 / 30 / 6 x 63 / 3.75 |
| 93 | .PKM | mg | 1 | 6-30 / 17 / 6 x 1 / 4 | 4-25 / 17 / 6 x 1 / 7 | 3-20 / 30 / 6 x 1 / 3.75 |
| 101 | M82A1A | sniper | 1 | 50-100 / 22 / 2.5 x 13 / 40 | 46-96 / 35 / 2.5 x 13 / 40 | 41-92 / 60 / 2.5 x 170 / 30 |
| 102 | M40A1 | sniper | 1 | 35-65 / 37 / 3 x 1 / 32 | 31-61 / 37 / 3 x 13 / 28 | 27-57 / 37 / 3 x 63 / 32 |
| 103 | M87ELR | sniper | 1 | 50-100 / 22 / 2.3 x 2 / 30 | 44-96 / 22 / 2.3 x 13 / 30 | 40-92 / 22 / 2.3 x 63 / 25 |
| 104 | Dragunov | sniper | 1 | 45-65 / 43 / 1.7 x 1 / 30 | 41-61 / 43 / 1.7 x 13 / 27 | 37-61 / 43 / 1.7 x 63 / 27 |
| 105 | SR-25 SD | sniper | 1 | 45-65 / 43 / 1.7 x 1 / 30 | 41-61 / 43 / 1.7 x 13 / 27 | 37-61 / 43 / 1.7 x 63 / 27 |
| 106 | SR-25 | sniper | 1 | 45-65 / 43 / 1.7 x 1 / 30 | 41-61 / 43 / 1.7 x 13 / 27 | 37-57 / 43 / 1.7 x 63 / 27 |
| 142 | MGL | grenadeLauncher | 3 | 2-6 / 60 / 6 x 1 / 13 | 2-6 / 60 / 6 x 1 / 13 | 2-6 / 60 / 6 x 1 / 13 |
| 143 | M79 | grenadeLauncher | 3 | 2-6 / 60 / 6 x 1 / 13 | 2-6 / 60 / 6 x 1 / 13 | 2-6 / 60 / 6 x 1 / 13 |

The knock: `ReticuleKnock` / `ReticuleKnockReturn` (pixels a second) / `ReticuleKnockMax`, `KnockCount` x
`KnockEntryStrength`, per stance; the burst scalar `AccBurstCnt_Min`-`_Max`, `AccScalar_Min`-`_Max`; the zoom modes
(`ZoomMode0` 1.5 is never a magnification, research 84 section 7).

| id | name | stand: knock / return / max, count x entry | crouch | prone | burst: count min-max, scalar min-max | zoom modes |
|---|---|---|---|---|---|---|
| 4 | F57 | 20 / 52 / 42, 1 x 1 | 20 / 52 / 42, 1 x 1 | 20 / 52 / 42, 1 x 1 | 0-0, 0-0 | 1.5 |
| 5 | M9 | 20 / 75 / 110, 1 x 1 | 20 / 75 / 110, 1 x 1 | 20 / 75 / 110, 1 x 1 | 0-0, 0-0 | 1.5 |
| 6 | 226 | 20 / 80 / 30, 1 x 1 | 20 / 80 / 30, 1 x 1 | 20 / 80 / 30, 1 x 1 | 0-0, 0-0 | 1.5 |
| 7 | DE .50 | 45 / 60 / 60, 1 x 1 | 45 / 60 / 60, 1 x 1 | 45 / 60 / 60, 1 x 1 | 0-0, 0-0 | 1.5 |
| 8 | 9mm Pistol | 10 / 40 / 20, 1 x 1 | 10 / 40 / 20, 1 x 1 | 10 / 40 / 20, 1 x 1 | 0-0, 0-0 | 1.5 |
| 12 | P228 | 20 / 80 / 30, 1 x 1 | 20 / 80 / 30, 1 x 1 | 20 / 80 / 30, 1 x 1 | 0-0, 0-0 | 1.5 |
| 13 | SR-1 Gyurza | 20 / 80 / 30, 1 x 1 | 20 / 80 / 30, 1 x 1 | 20 / 80 / 30, 1 x 1 | 0-0, 0-0 | 1.5 |
| 14 | Model 18 | 20 / 40 / 60, 1 x 1 | 20 / 40 / 60, 1 x 1 | 20 / 40 / 60, 1 x 1 | 4-10, 0-0 | 1.5 |
| 15 | Mark 23 | 20 / 60 / 40, 1 x 1 | 20 / 60 / 40, 1 x 1 | 20 / 60 / 40, 1 x 1 | 0-0, 0-0 | 1.5 |
| 16 | Mark 23SD | 20 / 60 / 40, 1 x 1 | 20 / 60 / 40, 1 x 1 | 20 / 60 / 40, 1 x 1 | 0-0, 0-0 | 1.5 |
| 31 | HK5 | 11 / 50 / 20, 1 x 1 | 11 / 50 / 20, 1 x 1 | 11 / 50 / 20, 1 x 1 | 5-20, 0-0.05 | 1.5 |
| 33 | HK5SD | 11 / 50 / 20, 1 x 1 | 11 / 50 / 20, 1 x 1 | 11 / 50 / 20, 1 x 1 | 5-20, 0-0.05 | 1.5 |
| 34 | F90 | 12 / 40 / 32, 1 x 0.4 | 12 / 42 / 30, 1 x 0.4 | 12 / 44 / 34, 1 x 0.4 | 1-3, 0-1 | 1.5 |
| 37 | 9mm Sub | 12 / 80 / 42, 3 x 1 | 12 / 80 / 42, 3 x 1 | 12 / 80 / 42, 3 x 1 | 3-8, 0.2-2.8 | 1.5 |
| 38 | MP5K | 11 / 60 / 17, 1 x 1 | 11 / 50 / 20, 1 x 1 | 11 / 50 / 20, 1 x 1 | 1-8, 0.2-2.8 | 1.5 |
| 51 | M16A2 | 11 / 20 / 25, 3 x 0.4 | 11 / 20 / 25, 3 x 0.4 | 11 / 20 / 25, 3 x 0.4 | 1-3, 0-0.05 | 1.5 |
| 52 | M16A2-M203 | 9 / 20 / 25, 3 x 0.4 | 8 / 20 / 25, 3 x 0.4 | 7 / 20 / 25, 3 x 0.4 | 0-0, 0-0 | 1.5 |
| 54 | M4A1 | 12 / 70 / 45, 1 x 0.4 | 9 / 75 / 45, 1 x 0.4 | 8 / 75 / 20, 1 x 0.4 | 4-7, 0-0.03 | 1.5, 2.5 |
| 57 | 552 | 11 / 50 / 60, 3 x 0.4 | 10 / 55 / 60, 3 x 0.4 | 9 / 55 / 60, 3 x 0.4 | 3-10, 0-0.01 | 1.5, 3 |
| 58 | AK-47 | 10 / 26 / 31, 2 x 0.4 | 9 / 26 / 31, 2 x 0.4 | 6 / 26 / 25, 2 x 0.4 | 1-15, 0-0.003 | 1.5 |
| 59 | AKS-74 | 10 / 26 / 14, 3 x 0.4 | 10 / 26 / 14, 3 x 0.4 | 8 / 26 / 12, 3 x 0.4 | 1-8, 0-0.005 | 1.5 |
| 60 | M14 | 12 / 42 / 60, 3 x 1 | 10 / 42 / 50, 3 x 1 | 9 / 42 / 35, 3 x 1 | 5-10, 0-0.002 | 1.5 |
| 61 | M4A1-M203 | 11.5 / 75 / 45, 1 x 0.4 | 7 / 75 / 45, 1 x 0.4 | 9.25 / 75 / 45, 1 x 0.4 | 5-10, 0-0.01 | 1.5 |
| 62 | M4A1 SD | 12 / 70 / 45, 1 x 0.4 | 11 / 75 / 45, 1 x 0.4 | 10 / 75 / 20, 1 x 0.4 | 5-10, 0-0 | 1.5, 3 |
| 63 | F2000 | 9 / 32 / 40, 1 x 0.6 | 8 / 32 / 40, 3 x 0.4 | 7 / 34 / 35, 1 x 0.4 | 5-10, 0-0.01 | 1.5, 6 |
| 64 | SA-80 A2 | 11 / 20 / 25, 3 x 0.4 | 11 / 20 / 25, 3 x 0.4 | 11 / 20 / 25, 3 x 0.4 | 1-3, 0-0.05 | 1.5, 4 |
| 65 | AK-105 | 7 / 26 / 14, 3 x 0.4 | 7 / 26 / 14, 3 x 0.4 | 5 / 26 / 12, 3 x 0.4 | 1-8, 0-0.005 | 1.5 |
| 66 | KBP OTs-14 Groza | 12 / 26 / 22, 3 x 0.4 | 12 / 26 / 22, 3 x 0.4 | 12 / 26 / 22, 3 x 0.4 | 1-8, 0-0.005 | 1.5, 3 |
| 67 | 552SD | 11 / 47 / 57, 3 x 0.4 | 10 / 44 / 54, 3 x 0.4 | 9 / 55 / 60, 3 x 0.4 | 3-10, 0-0.01 | 1.5, 3 |
| 68 | Steyr Aug | 12 / 40 / 32, 1 x 0.6 | 12 / 40 / 32, 1 x 0.6 | 12 / 45 / 28, 1 x 0.4 | 1-3, 0-1 | 1.5, 2.5 |
| 81 | Spas 12 | 8 / 40 / 70, 1 x 1 | 8 / 40 / 50, 1 x 1 | 8 / 40 / 50, 1 x 1 | 0-0, 0-0 | 1.5 |
| 83 | JACKHAMMER | 8 / 40 / 50, 1 x 1 | 8 / 40 / 50, 1 x 1 | 8 / 40 / 50, 1 x 1 | 0-0, 0-0 | 1.5 |
| 84 | 870 | 8 / 40 / 70, 1 x 1 | 8 / 40 / 70, 1 x 1 | 8 / 40 / 70, 1 x 1 | 0-0, 0-0 | 1.5 |
| 91 | M60E3 | 10 / 42 / 50, 1 x 1 | 8 / 42 / 40, 1 x 1 | 6.5 / 42 / 17, 1 x 1 | 3-12, 0.01-0.5 | 1.5 |
| 92 | M63A | 10 / 42 / 50, 1 x 1 | 8 / 42 / 42, 1 x 1 | 7 / 42 / 20, 1 x 1 | 4-16, 0-0.001 | 1.5 |
| 93 | .PKM | 10 / 42 / 50, 1 x 1 | 8 / 42 / 42, 1 x 1 | 7 / 42 / 20, 1 x 1 | 4-16, 0-0.001 | 1.5 |
| 101 | M82A1A | 50 / 40 / 50, 1 x 1 | 40 / 40 / 50, 1 x 1 | 35 / 40 / 50, 1 x 1 | 0-0, 0-0 | 1.5, 8, 16 |
| 102 | M40A1 | 35 / 15 / 40, 1 x 1 | 31 / 18 / 40, 1 x 1 | 27 / 22 / 40, 1 x 1 | 0-0, 0-0 | 1.5, 6, 12 |
| 103 | M87ELR | 50 / 25 / 60, 1 x 1 | 40 / 25 / 60, 1 x 1 | 35 / 25 / 60, 1 x 1 | 0-0, 0-0 | 1.5, 8, 16 |
| 104 | Dragunov | 30 / 40 / 60, 1 x 1 | 26 / 45 / 60, 1 x 1 | 20 / 48 / 60, 1 x 1 | 0-0, 0-0 | 1.5, 8 |
| 105 | SR-25 SD | 30 / 40 / 60, 1 x 1 | 26 / 45 / 60, 1 x 1 | 20 / 48 / 60, 1 x 1 | 0-0, 0-0 | 1.5, 8 |
| 106 | SR-25 | 30 / 40 / 60, 1 x 1 | 26 / 45 / 60, 1 x 1 | 20 / 48 / 60, 1 x 1 | 0-0, 0-0 | 1.5, 8 |
| 142 | MGL | 13 / 60 / 70, 3 x 1 | 9 / 60 / 70, 3 x 1 | 9 / 60 / 70, 3 x 1 | 0-0, 0-0 | 1.5 |
| 143 | M79 | 13 / 60 / 70, 3 x 1 | 9 / 60 / 70, 3 x 1 | 9 / 60 / 70, 3 x 1 | 0-0, 0-0 | 1.5 |

Where a class stands, standing: the pistols rest at 8-32 and open to 20-70; the SMGs and rifles rest at 0-10 (the
rifles mostly 0.5-2.5) and open to 20-71; the shotguns rest at 25-30 and open to 52-75, the largest rest of the
firearms that are not snipers; the MGs rest at 6-8 and open to 30-35; the snipers unscoped rest at 35-50 and open to
65-100 -- the unscoped sniper is the widest reticle of all; the MGL and the M79 rest at 2 and open to 6. The movement
multiplier standing is 1 on most records (2 on the F2000, the Spas 12, the 870 and the M87ELR, 13 on the M82A1A);
crouched 13 on most (6 on the AK-47, 10 on the Mark 23, 63 on the MP5K, 1 on the .PKM, the MGL and the M79); prone 63 on
most (60 on the Mark 23, 13 on the MP5K and the AK-105, 170 on the M82A1A, 1 on the .PKM, the MGL and the M79). The
MP5K's crouch and prone rows run against the pattern (63 crouched, 13 prone) --
the file's, kept as read.

## 4. The colour states (`FUN_00215c10`, D:L69908-70292)

### 4.1 The colour

Each frame, for the HUD's body alive (D:L69977-69979), in this order (the last that applies wins):

1. **Blocked muzzle: grey (130, 130, 130).** Kit byte 0 bit 3 set (`FUN_005aa6e0` found the muzzle's ray blocked, the
   pip's own bit, research 84 section 9) and the blocked point's offset beyond the size on either axis -- the HUD's
   unhalved `hud+0x44b4` against `+0xe44` or `+0xe48`, signed, as the pip's test -- gives the grey and hides the name and
   the bar, skipping the target (D:L69985-69992).
2. **Nothing left: black.** When the hand's item has no rounds left in any magazine of its mode (`FUN_005bdb00` ->
   `FUN_005bda70` answers 0), the colour is `DAT_0040c0b8/bc/c0` (D:L70064-70072), past the file's bytes of its segment
   (.bss, zero-filled at load) and written by no line of the decompilation: black arms, the name hidden
   (`EMPTY_RETICLE_COLOUR_READING`) (the review, F3; was: "0 in the ELF's file").
3. **The C4 in hand** (id 0x97 with charges): research 320 section 5 (the meter's quads, no set shown).
4. **A target** (the actor under the reticle, `FUN_005aa690`), when nothing above applied (D:L70094-70182): within
   **320 units** across the ground (x and z, `FUN_003091d0`; 102400 = 320 squared) or **500 scoped** (set 5, 250000),
   - **a teammate** -- the target's `+0xc8` team bits meet the body's (`piVar18[0x32]`), D:L70107-70108 -- **green (24,
     200, 44)** (D:L70159-70171);
   - a target the game flags otherwise (offline `+0xc8` bit 31 without bits 1 and 18, online bit 17; D:L70109-70118)
     green, or red when `DAT_00437ce8 + 0x111` is 3 (ESCORT) and `FUN_002c30b0(body)` answers -- the body on the
     Terrorist side (D:L70137-70158) -- with its own name and its bar: the hostages and the escort's VIPs (AD-3, section
     4.1.1; was: "which kind of target this is (a VIP, a hostage?) is unread (`TARGET_KIND_READING`)");
   - **an identified other** -- the record `FUN_002a0190(body+0xd0, target)` carries `+0x2c` bit 0x200 (D:L70122-70130),
     the body's perception's mark (section 4.1.1) -- **red (200, 24, 44)** (D:L70172-70176);
   - an unidentified other, or beyond the range: **rest** (200, 200, 24), the name and the bar hidden (D:L70133-70135,
     D:L70178-70181).
5. **The arming grey (130, 130, 130)** for the selected slot's record (`FUN_005c3780`) of class 0x91, a rocket launcher
   (`FUN_003c5ca0`), or 0xb9, its rocket (`FUN_003c5c70`) -- in play the LAW HEAT's or the RPG round's, an M203 or GL
   round (class 0xab) never -- while the aimed point (`body+0x3c0`, research 84 section 19) is nearer the muzzle than
   that record's `ArmingDistance` (`FUN_003d2030`) (D:L70222-70258; research 94 section C1.5 and C0 row 16, R94.16;
   ARMING-GREY, 2026-10-17, research 215 s8.2). *Was:* "for a record that launches a round (`FUN_003c5ca0` or
   `FUN_003c5c70`) ... than the round's `ArmingDistance`".
6. **Climbing: grey (130, 130, 130)** while `FUN_005a78d0(body)` answers -- the top play is `Climb crate` (0x2a), `Climb
   medium`, `Stand -> Hang` (0x21), `Climb over`, `Step up` or `Stand -> Ladder` (0x2c) (D:L462449-462466) -- or the top
   play's byte `+0x2b` is 5 (`FUN_00219390(body+0x1c0)`, D:L70260-70266; what that byte is, `TOP_PLAY_GREY_READING`).
7. **Applied** to the four arms; under set 3 to the big sight's four quads too, else those (the scope's) at (128, 128,
   128) (D:L70267-70290). The ring `+0x70` is never coloured.

GS vertex colours: 128 is the texel unchanged, so (200, 200, 24) brightens a white arm past 1 and the GS clamps it --
the console frame's measured (204, 204, 31) (W2.4). The page turns them by one scale, the rest's measured tint over
(200, 200, 24) (`reticleTint`); the other colours by the same scale is the page's conversion, not a measurement
(`RETICLE_COLOUR_SCALE_READING`).

#### 4.1.1 The perception that marks an other, and the special actors (AD-3's read, 2026-10-16)

Read for AD-3 (web sprint 40; the reconciliation's C88, its chunk 07's source chain and chunk 14 line 17's independent
review), at the pinned decompilation and the ELF's bytes (read only, by scratch scripts; one scratch dev-disc read of
`vehicles.rdr`, below). It answers the brief's four questions; none contradicts C88's claim, and nothing here needs a
wire field, a room change or a HUD change.

1. **The dispatcher's arithmetic.** The human's controller -- built by `FUN_005442c0` (D:L410581-410614) through
   `FUN_00598280` (table 0x6694b0, D:L454681-454683), or `FUN_005ff0f0`'s 0x6699f0 under `DAT_00440c30` -- holds slot
   +0x3c `FUN_005970b0` and slot +0xac `FUN_005ca170` in both tables (and 0x669590 its +0xac; read off the ELF). The body's
   update calls slot +0x3c (`FUN_005506a0` D:L417904-417907), which runs `FUN_005c9b30` while `DAT_003df1b0` is set
   (D:L454091-454095; 1 at load, the cinematics' and the scripts' gate D:L454840-454841). Over the body's records
   (`+0xd4` count, `+0xd8` the 48-byte records, the list `FUN_002a0190` searches): a target not active (`+0xe1` bit 4) or
   of a refused type is cleared through slot +0xac with false (D:L482115-482129, D:L482176). A record whose query
   (`+0x28`) has completed (state 4) takes the rate `FUN_0060aa20` times the query's `+0x24` -- the frame times the query
   gained while it waited and at its launch (`FUN_0060bc40` D:L516713, D:L516738; reset to 0 when a query is made,
   `FUN_005c97d0` D:L481915) -- onto `+0x18`, clamps it to [`DAT_00650998` 0, `DAT_0065099c` 2] (`FUN_00539b70`,
   D:L404121-404137; D:L482208-482209), keeps the rate at `+0x1c`, and marks the record while `+0x18` is at
   `DAT_00650990` 1 or more (D:L482210-482212) unless the target body's `+0x105c` bit 4 is set -- the veto
   (D:L482214-482218); `FUN_005ca170` sets or clears `+0x2c` bit 0x200 by that Boolean (D:L482279-482283). The veto bit is
   copied from the mission's flag word `CMission+0x140` bit 0x2000 (`FUN_002b28d0` D:L155878-155879 for the player,
   `FUN_00573130` D:L434809-434810); the word's writer was not found by its offset (`PERCEPTION_VETO_PLACEHOLDER`).
   **The clears**: a rejected record at once (2 below), an inactive target at once (above), and a completed query that
   leaves `+0x18` under 1; never by the clamp alone. The clock is the frame's (`FUN_0060bc40`'s `param_1`).
2. **The rate** (`FUN_0060aa20` D:L516124-516248): **-1 when the query's visibility (`FUN_0060b120`
   D:L516326-516386) is 0 or less** (D:L516159, D:L516162) -- so a marked record from the clamp's 2 holds a second unseen
   -- else the visibility's product of the scene's lighting (`FUN_0031d940` over the light grid `DAT_00651080`; the
   mission's `.bss` terms `DAT_00436640`..`0x43664c`, zero in the file, the loader's), the target's speed (`+0x38`..`+0x40`)
   and stance (`FUN_0058a720`: 0.5 for one stance, 0 for another, else 1, D:L516203-516212), smoke (`FUN_00538e30`
   over 0x66a1b0), the observer's item 0xbe (x 0.1, D:L516167-516169), the fog-like term `DAT_00436624` x `FUN_002948d0`
   (D:L516239-516243) and the record's `+0x100` bit (x `DAT_006510e8` 2, D:L516244-516246), through a composite
   (`FUN_0053ae20`, `FUN_0053abe0`) not read; all times the controller's `+0xe8`, 1 for the human (D:L454716;
   D:L516248). The visibility itself takes, from 1, each surface the query met's material `+0x20` (clamped) and, for a
   foliage-like material, a random share by distance band (D:L516363-516382); an unknown material makes it 0. So the
   constants transcribed are the unseen -1, the scale 1, the clamp and the threshold; the seen rate, the visibility's
   materials and the queries' schedule are named (`PERCEPTION_SEEN_RATE_PLACEHOLDER`, `PERCEPTION_SIGHT_PLACEHOLDER`,
   `PERCEPTION_QUERY_PLACEHOLDER`).
3. **The eligibility** (the controller's update `FUN_00594cf0`, slot +0xc of 0x6694b0: slot +0xa8 `FUN_005c9520` then
   `FUN_005ca9f0`, D:L453085-453086). `FUN_005c9520` (D:L481800-481863) lays the cone from the camera when it follows
   this body (`DAT_00415ff0`, its matrix `+0xb4`), else from the body's eye: its reach `+0x80` the controller's `+0xa8`
   times the body's magnification `+0x204`, its radius `DAT_00650a80` 25 at the eye, widening by `tan(fov / 2)`
   (`FUN_001b3808`, tanf) over the reach a unit out, divided again by the magnification above 1 (D:L481801-481806);
   `+0xa8` is 1000 at most 0.95 of the camera's MID (`camera+0xec`, D:L454794-454802), the field of view 1.3962634 rad, 80
   degrees (D:L454793; clamped to [0.01, pi / 2], D:L481877). The magnification `+0x204` is 1, 1.01, 9 or the zoom
   mode's by the view state (`FUN_005448a0` D:L410961-411008), written at the view's change -- the page's `Zoom.target`,
   not the magnification on screen easing toward it (AD-3's review F1, 2026-10-16; was: `zoom.magnification()`). `FUN_005ca9f0` walks the records by distance and **stops
   at the first beyond the reach**, leaving the rest untouched (D:L482552-482553); each other passes `FUN_005cc120`
   (D:L483169-483305) or is **rejected: its query dropped, `+0x18` decayed by `DAT_006509e0` -0.15 of itself a second,
   and the mark cleared** (D:L482556-482566). `FUN_005cc120` takes a target that is active, of type 2 (a body), or 3 or 4
   by their flags, not carrying its controller's `+0x265` bits 0 or 1, within the reach and the camera's current MID, and
   **in the cone** -- in front and no farther along it than its reach -- or, out of it but in front, **moving faster
   across the ground than 50 a second** (`DAT_006509e8` 2500); the near test behind (within 100, `DAT_006509f0`) needs
   the observer's slot +0x38, which the human's answers none (0x5431e0: `jr ra; daddu v0, zero, zero`), so it never
   applies. The side test lets every body through for the human: its slot +0x2c answers 1 (0x5431f0: `jr ra; addiu v0,
   zero, 1`), so teammates are perceived too (their green does not read the mark). A taken target gets a query from the
   observer's eye (`DAT_0066b7a8`, the body's slot +0x34) to the target's point (its slot +0x38), made fresh
   (`FUN_005c97d0` D:L481903-481920: state 3, `+0x24` 0) or moved (D:L483288-483294).
4. **The special actors.** The authored records' `team` lists build the mask (`FUN_00533370` D:L400379-400443) applied
   at the spawn (`FUN_002b28d0` D:L155843-155868 -> `FUN_0029ed10` D:L144912-144915; the network's swap D:L155859-155867,
   the script's `FUN_005cea40` D:L484660-484721). Across the 22 MP maps (chunk 07, chunk 14's independent recount; a
   scratch dev-disc read for AD-3 of every MP map's `READERM.ZAR/vehicles.rdr`, not committed): twelve hostages in MP6,
   MP10, MP11 and MP71 (team 17 30 31, 0xc0020000) and nine VIPs in MP52, MP53 and MP82 (team 17 30, 0x40020000), every
   record's `display` the same as its `name` -- `Hostage`, `Hostage2`, `Hostage3`, `VIP1`, `VIP2`, `VIP3`. The reticle
   (D:L70107-70158): online the bit 17 flags both kinds; offline bit 31 without bits 1 and 18 flags the hostages and not
   the VIPs. A flagged target is green -- red only when the round's type `+0x111` is 3, ESCORT, and `FUN_002c30b0(body)`
   answers: the body's team word the Terrorists' mask (0x80000100, or 0x40000001 under `DAT_004412d8`'s swap,
   D:L164672-164704) -- with its name (`+0x14`, the record's `display`, `FUN_0029ec70` at D:L155845-155846; else the
   record's `name` on the body's `+0x28` at `+0x90`, `FUN_00314ee0` D:L155844, D:L214574-214581) and its bar
   (D:L70213-70219); the bar reads its own health, which no page is sent for a hostage (NU-3c's feed sends seats', and
   is not changed here). **How the page knows them:** a hostage is in the room's list (`NetPage.hostages`, HX-1's
   welcome and `hostageState`, carrying the record's `name`), the round's type is `NetPage.gameType`, the page's side
   its client's team -- no wire field. Until 2026-10-18 the room built escortees on game type 4 only
   (`match/src/extraction.ts` `ExtractionAuthority`), so on ESCORT no VIP was drawn and no page named one. From that
   date `ExtractionAuthority.of` admits game type 3, and ESCORT's `VIP1`–`VIP3` are the same welcome list (research
   175 §2.1, research 334). The reticle rule above is unchanged.
5. **The records' life** (AD-3's review F2 and its re-check, 2026-10-16; the merge controller's conditions: a clear only
   where the original's own is read; a seat's record dropped only as cited or labelled). The records are the observing
   body's list (`+0xd0`). `FUN_002a0450` makes one, zeroed, on every actor for each actor that enters the world
   (D:L145796-145806 -> `FUN_002a0200` D:L145639-145661) and removes it from every actor when one leaves
   (D:L145818-145824 -> `FUN_002a0310` D:L145669-145708). **The observing body's rebuild empties its list**:
   `FUN_00599b60` (`CZSealBody_ReCreate`, research 212 section on the menu's ReCreate, `212-the-r2-menu-drawn.md`:493;
   research 179's "the round start / respawn rebuilds", `179-c1-match-server.md`:503) runs the body's destructor in place
   (D:L455659: vtable +8, `FUN_0029ed30` -- `FUN_002a0f70(body, 0)` D:L144943, `FUN_0029ff60(body+0xd0)` D:L144952 freeing
   the list), then its constructor (D:L455663, `FUN_00553ea0` -> `FUN_0029ee10` D:L144978-144980: `+0xd0/+0xd4/+0xd8` 0),
   the list refilled with zeroed records by `FUN_002a0a10` (D:L145892-145926 through `FUN_002a1160`
   D:L146106-146116). It runs **at every online round start** -- `FUN_00223680` D:L75925-75931 calls `FUN_00598b90(body,
   0)` for each body not a ghost (`+0xfd1` 0), the page's own included, and `FUN_00598b90` calls `FUN_00599b60(body, 0)`
   directly inside its network block (`DAT_0045a0c1`, D:L455070-455339, at D:L455158) -- **and at a respawn**: online
   `FUN_00547350` (D:L412721-412726) -> `FUN_00598b90(body, 1)` -> the same `FUN_00599b60` at D:L455158, whatever its
   second argument; offline `FUN_005994a0` (D:L455369, D:L455385), run only with `DAT_0045a0c1` 0 (D:L412708-412713) (the
   second re-check, 2026-10-16; was: "(`FUN_005994a0` D:L455369, D:L455385)" alone). **The observed body's rebuild alone keeps the watchers' records of it**: its
   destructor's leave (`FUN_002a0f70(body, 0)`, queued at 0x436370, D:L146051-146056) is cancelled by `FUN_002a0f70(body,
   1)` at D:L455668 (D:L146058-146068: taken off the leave queue, not re-added while it is still a member of 0x436330), so
   `FUN_002a0450` never removes it. The second clear, `FUN_002a10c0(actor, 0)` (D:L146079-146088, through `FUN_002a0090`),
   is not a human observer's: its callers are `FUN_0056d0c0` on the AI object's `+0x265` snooze bits (D:L431799-431822),
   `FUN_005714b0` (its word at 0x669408, in neither human table), `FUN_0029f850` (D:L145229) and `FUN_0029f9f0`
   (D:L145272) on the fresh dummy `DAT_004362c4` whose list is empty, and `FUN_005f1c70` (D:L503585) and `FUN_005f1e40`
   (D:L503637, its argument the `+0xa0` bit) -- these two with no direct caller in the decompilation, unread (the second
   re-check; was: "is an AI's", the first two named alone). **Built**: the page empties its records at its own spawn
   (`matchFirearm.ts` `spawnKit`, the room's spawn of the page, each round's and a respawn's) and keeps them across
   another seat's death and respawn (`PERCEPTION_RECORD_LIFE_READING`). **A seat's leaving**: the original's departure
   (`FUN_002bef60` D:L162520-162539) marks the body a ghost (`+0xfd1`, D:L162534) and retires it (`FUN_005998b0`
   D:L455500-455537), writing its `+0x4` to `DAT_003effb0` (0xffffffff, no writer; D:L455524); at the next online round
   start `FUN_0029fcb0` (D:L75924) deletes it (`FUN_0029fd80` D:L145398-145402) -> vtable +8 `FUN_005533e0` ->
   `FUN_0029ed30` (D:L419349) -> `FUN_002a0f70(body, 0)` (D:L144943), and `FUN_002a0450` removes the watchers' records
   (`FUN_002a0310`): a deferred leave. The page drops a seat's record as soon as the seat is gone from the room --
   **the page's own earlier timing**, not a reading (`Perception.keepOnly`; a joiner seated on the same id starts zeroed
   as a new actor does, `FUN_002a0200`). (The second re-check; was: "with no leave read, so whether the watchers' records
   of it are freed is not read; the page drops a seat's record ... -- the page's own bookkeeping (a record of a body that
   no longer exists on the page ...), not a reading".) (Was, the F2 fold 72c7bba73: "no line read resets them at a death, a respawn or a
   round ... No clear is built: the page keeps its records for the mount" -- **the read missed `FUN_00598b90`'s direct
   call of `FUN_00599b60` at D:L455158**, which the re-check found; its "not exhaustive" list named the body's slots +0x3c
   / +0x40, `FUN_002a7d40` and `FUN_003aa9d0`, not that call.)
6. **A special actor's bar** (AD-3's review F3). The reticle draws the bar for a special actor as for a teammate
   (`bVar5 || bVar3`, D:L70213-70219) at the actor's own health; no page is sent a hostage's health (`NetClient.healthOf`
   holds seats only, NU-3c), so the page draws none (`SPECIAL_ACTOR_HEALTH_PLACEHOLDER`, note only).

The port (AD-3): `reticle.ts` `PERCEPTION` (the constants above), `perceptionLook` (3), `Perception` (1, 2) and
`reticleTargetState` (4); `matchFirearm.ts` steps the records once a HUD frame for every body the page knows (the room's
seats but its own, its hostages, the body under the reticle) from the camera's eye and forward, and hands the target its
mark and its kind. Was, before AD-3: an other under the reticle red whenever the page's pick reached him
(`ENEMY_IDENTIFIED_PLACEHOLDER`), a hostage at the rest (`TARGET_KIND_PLACEHOLDER`). Not claimed: the acquisition's
latency (the queries' schedule) -- a capture or a trace (chunk 07: the record's `+0x18`, `+0x28`, `+0x2c`, the query's
timestamps and result, the callback's third argument, and the reticle rendered) settles it.

### 4.2 The name and the health bar

- **The name** (`hud+0x4544`, a string at scale 0.7 made at Init, D:L70816-70818): the target's name (`+0x14`, or the
  type's at `FUN_0029ed20(target)+0x90`), `"[%s] %s"` (0x3e4848) with the clan tag `FUN_002c3ac0(target+0xfc8)` when its
  length passes `FUN_00199288`'s test (< 2 none) and the name is not `" "` (D:L70189-70200); shown at
  `(cx + W/2, cy - H/2)` (`W/4`, `H/4` in a scope) -- beside the reticle's upper right (D:L70201-70212). For a teammate it
  is `" "` offline, and online the name unless the HUD's flag `+0x17b64` is set (D:L70162-70170); for an identified other
  the name (D:L70172-70176). (NU-3b, 2026-10-15, from research 329, reading, pending review: `+0x17b64` is the TEAMMATE
  NAMES option, `DISPLAY_MP_TEAM_NAMES`, read once at the over-head tags' set-up, D:L77558-77559, default 1 -- so by
  default a teammate under the reticle shows the blank and his bar; `TEAMMATE_NAMES_OPTION_READING`.) Hidden with no target, beyond the range, unidentified, blocked or empty.
- **Under every set while the player is alive** (the review, F1 and F4): `ChangeReticule` hides the name and the bar
  only at a set's change (sets 4, 5, 7: D:L69411-69412, D:L69440-69441, D:L69511-69512), and this pass runs every frame
  for every set (D:L70464) with no set test in its target logic (D:L70094-70219), the aim ray that finds the target
  testing no item either (`FUN_005aa6e0` from `FUN_002998f0`, D:L142026-142028). So they show over a target under the
  grenade's meter (research 320 section 2), the scope and the binoculars alike; only set 5 changes the range (500) and
  the offset (half), and `W`, `H` are each set's floating size or its fixed one's fallback (`ret_grenade_02` under 4,
  `ret_scope_02` under 5, `ret_binocs2` under 7).
- **The health bar** (`hud+0x45e0`, a `CHealthBar` 60 x 5, D:L70822-70823; research 87 row 1.8's class): for a teammate
  or the flagged kind, 15 pixels above the name's place, filled with the target's health (`FUN_00241cc0(bar, target, 1)`,
  D:L70213-70219).

#### 4.2.1 What the bar reads, and who gets it (NU-3c's read, 2026-10-15 04:07Z)

Written for NU-3c (the [next-update checklist](../plans/2026-10-13-next-update-checklist.md) row NU-9 (b); the brief
`plans/briefs/2026-10-15-nu3c-teammate-health-bar.md`, step 1). Source inspection of the decompilation at the pinned
bytes (the header's hash) and two floats of the ELF's `.data` read through a scratch script (no node process, no
reader); reading, pending review. Sections 4.2 and 7.5 above are kept as written; what this adds to them is said here.

**1. What the bar reads: one total, made from the six parts -- and on another console, from the six bytes.**

- `FUN_00241cc0` (D:L89937-90040) reads one float, the target's `+0x1044` (D:L89957), as the fill: the split at
  `(int)(x + width x health)` (D:L90005); online, with `FUN_002c2fd0(target)` answering, it forces 0 and the colour
  `0x4148f0` (D:L89959-89978, D:L89990-89991; section 6's NU-3b note, not this row's).
- `+0x1044` is written only by `FUN_005477a0` (D:L412821-412841), with the value `FUN_005a54d0` (D:L461358-461411) hands
  it: 0 when the head (`+0xffc`) or the body (`+0x1008`) is at 0 or the actor not alive (D:L461376-461380), else
  `FUN_005a56d0` (D:L461416-461437) -- **`(3 x p0 + p1 + p2 + p3 + p4 + p5) / (3 x m0 + m1 + ... + m5)`**, the parts
  `+0xffc..+0x1010` over their maxima `+0x1014..+0x1028`, the head weighted three times (the port's
  `net/damage.ts` `overall`, pinned by `roundDamage.parity.test.ts`).
- A part is set by `FUN_005a5790` (D:L461441-461464): `part = max x ratio`, floored at 0, then `FUN_005a54d0` re-makes
  the total. On a console that does not own the body the ratios are the SealObject's six bytes 0x82-0x87 (research 193
  section 4.1): the owner writes each as **`ceilf(clamp(part / max, 0, 1) x 255)`** (`FUN_002bd640` D:L161982-162034:
  the clamp `FUN_00267a60` D:L113440-113456 with the bounds at `0x3de768` = 0.0 and `0x3de770` = 1.0, read off the ELF;
  `FUN_001b3470` D:L32918-32947 is `ceilf` by its bit arithmetic), in the order head, body, left leg, right leg, left
  arm, right arm, and every other console sets each part to **`max x byte x 0.003921569`** (`FUN_002be150`
  D:L162325-162347, `FUN_005a5790` with the parts 0, 3, 5, 4, 2, 1).
- So the bar another console draws is a function of those six bytes and the body's maxima (a seat's are
  `MP_HEALTH`'s, the same on every console), and of nothing else. One byte holding the total could not reproduce it: the
  total of six ceiled bytes, quantised again, may land on the other side of a pixel at `(int)(x + 60 h)`. **The payload
  is the six bytes**, in the port's `PART` order (head, right arm, left arm, body, right leg, left leg; the wire's order
  above is the original's and no part of the page's).
- The rate (research 193 section 12.4, corrected there: part health online every 100 ms or slower, flag 0x40): each
  byte is its own field, with its own last-sent time; `FUN_0061a488` (D:L526642-526706) puts a field on the wire when
  its bytes differ from the copy last sent (`FUN_0061b2a0`) and `lastSent + interval < now` in the DME's millisecond
  clock, strictly (D:L526672-526674), and stamps the field's time when it goes (D:L526693). Sent on a change, never on
  a timer.
- **The quantisation, corrected at NU-3c's review** (F1, 2026-10-15; reading, pending review): the room publishes a byte
  when `tick - told >= 7` -- on the 7th tick after its last, never the 6th (`PART_HEALTH_INTERVAL_TICKS_READING` = 7).
  The DME's clock is whole milliseconds: seconds x 1000 plus microseconds / 1000, cut (`FUN_0063d2d8` D:L552697),
  advanced by whole deltas (`FUN_0061bee8` D:L527618-527619); the strict `lastSent + 100 < now` needs 101 counted. Six
  59.94 Hz frames (100.1 ms) count 101 only when the stamp fell within 0.1 ms of a millisecond's end, about one time in
  ten; seven frames (116.8 ms) always do. So a field usually goes again on the 7th frame, the 6th the rare case; the
  room's tick standing for a frame, the 7th tick. That the pump runs once a frame is still the reading (not read);
  pinned by `roomTeamHealth.test.ts` (a change held through the 6th tick, sent on the 7th); the capture below settles it.
  *Was, at the build (the controller's term):* the room publishes a byte when
  `tick - told >= 6` -- on the 6th tick after its last, never the 5th (`PART_HEALTH_INTERVAL_TICKS_READING` = 6). The
  original's test is strictly `lastSent + 100 < now`; the console's pump runs at its frames, and six of its 59.94 Hz
  frames are 100.1 ms, which passes it, so a field goes again on the 6th frame. The room's 60 Hz tick stands for a
  frame, so publishing on the 6th tick keeps the console's cadence, where the 7th (at 60 Hz six ticks are 100 ms exactly,
  not past the strict test) would not. That the pump runs once a frame is the reading (not read); pinned by
  `roomTeamHealth.test.ts` (a change held through the 5th tick, sent on the 6th).

**2. Who gets the bar: a teammate, or a body flagged as the escortee kind -- never an enemy seat.**

- The bar is drawn for a teammate or a flagged target (D:L70213). A teammate: the target's team word `+0xc8` meets the
  HUD body's (`piVar18[0x32]`, D:L70108). Flagged: offline, bit 31 without bits 1 and 18 (D:L70109-70114); online (the
  `DAT_0045a0c1` flag, read as online by research 115 and by research 101's `GUN_EMPTY_UNPRESSED_READING` row) **bit
  17, 0x20000** (D:L70115-70118), which marks the target a teammate too. Only a living target is asked (`+0xe1` bit 4,
  D:L70095).
- Bit 17 is the escortee fireteam's (`team 17 30 31` = 0xC0020000 in MP6's `vehicles.rdr`, research 189's table and
  190 U8; "0x20000 NPC" in research 193 section 4.1, row 0x0c): a hostage or the escort's VIP, an AI body. A seat's
  words are SEAL 0x40000001 and terrorist 0x80000100 (the two captured SealObjects, research 193 section 4.1's check),
  which do not meet, and neither carries bit 17.
- The writers of `+0xc8` (all through `FUN_0029ed10`, D:L144912-144916) were read for a path that gives a seat bit 17
  or the other side's bit: the local player's from `DAT_00441470` at its creation (`FUN_005442c0` D:L410614); a remote
  seat's from its owner's SealObject (`FUN_002be150` D:L162383); a body from its map record, with an online swap of bits
  30 and 31 for the sides' exchange (`FUN_002b28d0` D:L155849-155868); a restrained hostage's -- the leader's side kept,
  bit 17 kept, 0x4000000 added (`FUN_00607d70` D:L514835, `FUN_00601910` D:L511801). None gives a seat bit 17. One
  writer is not settled: a script action ORs or clears an arbitrary mask on an actor it finds by its id
  (`FUN_005cea40` D:L484703-484711); the actors a multiplayer map's scripts name were not read (no reader run), so that
  no script there marks a seat stays a reading.
- **Answer: no -- on an original console an enemy seat never gets the bar.** What gets it besides a teammate is the
  escortee kind: a hostage's 0xC0020000 meets either side's word and carries bit 17, so every seat sees a living hostage
  or VIP green, named, with its bar -- red, still with its bar, to a terrorist in a round of `DAT_00437ce8 + 0x111` = 3
  with `FUN_002c30b0` answering (D:L70137-70158; research 191 reads `FUN_002c30b0` as the terrorist test). That is an AI
  body, not a seat: the port holds it as `TARGET_KIND_PLACEHOLDER` (rest, no bar; section 7.5), unchanged by NU-3c.
- **So the recipients may leave out the other side.** The original sends every console every SealObject; the port's
  room sends a seat's six bytes to its side and to the spectators only (`TEAM_HEALTH_RECIPIENTS_ADAPTATION`, the
  brief's term under OT.R27 / OT.R26): nothing a player sees changes, since no enemy seat's bar is ever drawn.

**3. Beside it, for the build (named, not this read's to settle).**

- **The spectator's info box** draws the viewed body's bar from the same `+0x1044` (`FUN_00238500`,
  `FUN_00241cc0(+0x20, viewed)` D:L85555-85556; research 282 section 4, `SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER`): the
  original does use it, and the spectators are among the recipients; the page's consumer is `hud.ts`, outside NU-3c's
  files -- reported to the controller, not built. *(2026-10-19, LATER 119: built -- `spectatorHudView` reads
  `healthOf`, `SPECTATOR_FOLLOWED_HEALTH_READING`; research 282 §4.)*
- **Replays:** a `.s2r` is played by the replay's own client (`replay/replayClient.ts`, its seeks folded in
  `replay/fold.ts`), which no part of NU-3c reaches; the build's proposal is that the room does not record the event, so
  a replay's bar stays empty (named at the build).

**4. As built (NU-3c, 2026-10-15; reading, pending review).**

- **The wire** (`net/protocol.ts`): the `health` event, `{ id, parts }`, additive under protocol 11 -- the six bytes
  (`partHealthBytes`, the writer's ceiling) in `PART` order; the page's total `partHealthOf` (the reader, then
  `FUN_005a56d0`); a malformed `parts` kept by no page (`partHealthWire`).
- **The room** (`room.ts` `tellHealth`, each step after the tick's changes, before the snapshot): pass 1 publishes each
  seat's changed bytes, each on its own clock (above); pass 2 sends each connection, one event a seat, the bytes it does
  not hold yet that `healthTold` gives it -- its side's and, to a spectator, every seat's -- never its own seat's (the
  `hurt` event holds it) and never the other side's (`TEAM_HEALTH_RECIPIENTS_ADAPTATION`). A connection newly entitled
  (a join, a promotion, SWITCH TEAMS) gets the current bytes on its next tick, a wound as it stands
  (`roomTeamHealth.test.ts`: a join, and a switch from the enemy's side to the teammates').
- **Only welcomed connections are sent to**, with no guard: `hello` enters a connection (`conns.set`, room.ts L1617)
  only past every refusal (the returns at L1583, L1584, L1597, L1600, L1607, L1614) and sends its welcome in the same
  synchronous call (L1647), so no step sees a connection in its handshake or refused; one held for the load is sent like
  the others; `drop` takes it out (L1877) with its last-sent copies.
- **The cost**, measured once on the owner's host by `roomTeamHealth.test.ts` (16 seats, 18 connections, 2000 passes,
  wall clock under a landing gate on the same host; a measurement, no bound asserted): **9.80 us a tick** with nothing
  changed (both passes, no send), **89.75 us** re-telling all 144 events at once (16 seats x 7 teammates and 2
  spectators x 16; each pass's sends JSON-encoded) -- the worst tick, which only a whole side's change or a full
  rejoin approaches.
- **The client** (`net/client.ts`): the latest bytes per seat, forgotten at its `left`; `NetClient.healthOf(id)`, null
  for a seat whose bytes the room never sent (an enemy's, never). **The page** (`matchFirearm.ts` `aimTarget`): the
  target's health is `healthOf`, so the bar over a teammate fills from the room's bytes (section 7.5:
  `TARGET_HEALTH_PLACEHOLDER` retired). Room and page on the same command (PTW.R3): `roomTeamHealth.test.ts` hands the
  room's own frames to a real `NetClient` and draws its bar through `reticleTargetState` -- the bar never under the
  room's own total, and within a byte's step of it.
- **Replays: a replay's bar stays empty.** The event is sent, never broadcast, so no `.s2r` holds it; `replay/fold.ts`
  classes it transient, and `ReplayClient.healthOf` answers null (the controller's clearance, 2026-10-15).
- **Not built:** the spectator's info box over the followed body (`hud.ts`, part 3 above; the bytes reach the
  spectators, its consumer is a later row's -- `SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER` unchanged; *2026-10-19, LATER 119:
  built, `SPECTATOR_FOLLOWED_HEALTH_READING`, part 3*); the bar's online
  branch (`FUN_002c2fd0`) and its hit flash (section 6, NU-3b's note); a hostage's or the VIP's bar
  (`TARGET_KIND_PLACEHOLDER`, part 2).

## 5. The zoomed scopes' overlays (research 84 section 9, confirmed)

`ChangeReticule` set 5 (D:L69434-69509): the ring, the name, the bar and the arms hidden at the change (the name and the
bar shown again over a target each frame, section 4.2; the re-review, item 3; was: "the ring, the name, the bar and the
arms hidden"); the tube `ret_scope_01`'s four
quads (`+0x11f0..`) shown; `ret_scope_02`'s four (`+0xa30..`) laid over (0, -96)-(640, 544) as four 320-pixel quads
mirrored to meet at the frame's centre, sampled 0.01-0.99 (D:L69466-69507), and shown at alpha 128 unless the weapon is
the F2000 (`FUN_005c89d0` = `'?'`, id 63, D:L69434-69439, D:L69449-69455); the reticle's range line `"RANGE(m): %.0f"` at
(415, 215) (D:L69508; research 87 section 13); the damage marks kept (D:L69446). The scoped sway is undrawn (research
84 section 15). Set 7 (the binoculars, D:L69510-69572) and the goggles (`+0x4100`, D:L69349-69367, D:L69673-69675) as
research 84 section 9 read them. The friend range is 500 under set 5 (section 4.1). Over a target, the name and the
bar show in the scope and in the binoculars too (section 4.2; the review, F4).

## 6. The port, against it

The room draws no HUD; everything here is the page's: `reticle.ts` (the pass; `hud.ts` draws no reticle, research 87
row 1.15), fed by `matchFirearm.ts` `aimReticle`.

- **Sets and the choice**: `reticleType`, `RETICLE_SETS` and the bitmaps match section 1 (pinned, 7.4).
- **Sets 0 and 1**: `reticleLayout` -- the ring at its own size, four quads of the arm's own size turned a quarter each,
  the inner edge `size` out, the core on the centre lines (the rifle measured on the console frame; other arms by `1.5 -
  arm / 2` across, which is the original's `+ 1` edge within the half pixel of the rifle's measurement); halved in third
  person (`Accuracy.reticle`); the knock's offset; matching, pinned.
- **Set 2**: `setSet(2)` swaps in `ret_shotgun_01/02` and `reticleLayout` lays them as **the cross**: the floating
  pieces along the axes, not on the diagonals (D1).
- **Set 3**: `setSet(3)` swaps in `ret_rocket_01/02` and lays them as the cross: `ret_rocket_01` at its own size on the
  knock-moved centre, `ret_rocket_02` at full size along the axes -- not the four 0.7 quads at the frame's centre, not
  0.7 corners (D2); the pip still runs under set 3 (its gate is `!item` and not scoped), where the original fades it (D7).
  Built, NU-3a C1 and C2 (2026-10-14): `reticleLayout` lays set 2 as the corners and set 3 as the launcher's -- the ring
  hidden, the sight at the frame's centre, the corners at 0.7 -- from the served bitmaps' sizes; the pip under set 3 is
  the step and the fade (section 2.3's correction). The two bullets above are the port before it, kept.
- **The colour**: `setColour(armingColour('rest', ...))` -- rest and the arming grey only. No teammate green, no enemy
  red, no name, no health bar (D4); no blocked-muzzle grey (D5); no climbing grey (D6); no empty black (D8).
  Built, NU-3b C4 (2026-10-15): `aimReticle` finds the actor under the reticle (`crosshairPick` over the room's capsules,
  `RemotePlayers.aimBodies`, and the hull, out to `ORDER_PICK_REACH_READING`) and `reticleTargetState` gives the colour,
  the name and the bar as section 4 reads them; `Reticle` writes the name in the HUD's font at 0.7 and draws the bar
  (`targetLayout`), under every view. The bullet above is the port before it, kept.
  **Not built** (NU-3b; the review's F4, 2026-10-15): the bar's online branch -- `FUN_00241cc0` with `FUN_002c2fd0`
  answering forces the health to 0 and the colour `0x4148f0` (D:L89959-89978), owed with the health itself (NU-3c,
  `TARGET_HEALTH_PLACEHOLDER`); and the bar's hit flash, the `+0x130` part (D:L90009-90035).
  Built, NU-3c (2026-10-15; section 4.2.1, part 4): the health itself -- a teammate's six part bytes from the room
  (`health`), the bar filled from them; the online branch and the hit flash above still not built.
- **The swap**: `Accuracy.setWeapon` -> `reset()`, the size at the new `TargetMin` and the knock zeroed (D3). Built,
  NU-3a C3 (2026-10-14): `setWeapon` carries the size, the knock (`SWAP_KNOCK_READING`), the sway, the pull's count and
  the exertion; the page's HUD frame (`matchFirearm.ts` `aimReticle`) takes the switch's set-change mark when what is in
  the hand changed and its set with it (`Accuracy.reticleSetChanged`, +0.5 capped); `reset()` is called by `spawnKit` (a
  life) and `setView` (a map) only. The callers of `setWeapon`: the page's swap (`Kit`'s `item`, `matchFirearm.ts`) and a
  room kit's pickup (`takeKit.ts`) now carry; `spawnKit` carries then resets; the server's cone (`net/shotCone.ts`
  `setWeapon`, from `room.ts`'s `aim` and `worldDrops.ts`'s pickup) carries as the page does, so the two cones stay one
  (its spawn makes a new `ShotCone`); the zoom's switch replay (`undoViewTick`, `applyViewPath`) calls neither.
  NU-3a's fold, F1 (the review of db22d91d3): the page took the new record with `m_item` (`Kit`'s `item`), which a swap
  to the rifle moves only at the clip's end, where the original's tick reads the selected slot `+0x824` from the press
  (`FUN_005c2670` D:L477280; `FUN_005c4b10` D:L478842) and the room takes it there: the Mark 23's rest held through the
  clip and carried into the rifle. Now the kit's `started` names the new slot's record at the press, and each frame the
  bloom runs the selected slot's (a swap the room undid or redid, a pickup into the slot mid-swap); the reticle's set is
  asked of the same slot (`FUN_005be300(kit, +0x824)` via `FUN_005c67d0`, D:L478908), so a swap to the rifle shows the
  rifle's set, and takes the set change's +0.5, from its press (was: the hand's record, `fire.weaponRecord()`). Corrected
  at N1 of the re-review of 2a2b732bf: the set is asked with that slot's own fire mode too (`+0x6fc[slot] < 5`,
  D:L474944-474945), as `zoomHold` reads it -- the hand's mode had still been passed, so an M203 rifle or the F2000 in a
  round mode drew set 1 from a swap's press to the clip's end where the original draws 3 (was: "the reticle's set is
  asked of the same slot", the slot's record only). A room
  kit's pickup into the selected slot: the page names it on the frame after the room's `taken`, as `worldDrops.ts`
  takes it into the seat's slot at its own take -- the same slot, the page a message behind.
- **The scope, binoculars, goggles**: `scopeLayout`, `binocularsLayout`, `nightLayout`, `setScopeBitmaps` (the F2000's
  tube alone) and `hud.ts`'s zoom readout and scope range -- the overlays matching, pinned; the name and the bar over a
  target under them not (D10; the review, F4; was: "-- matching, pinned.").
- **The threat marks** (2.6): not drawn (D9, outside NU-3's classes; named).

| # | difference | the frame it shows on |
|---|---|---|
| D1 | The shotguns' floating pieces on the axes (the cross) where the original puts them on the diagonals. Built, NU-3a C1 (2026-10-14): the corners, `SHOTGUN_CORNER_READING`'s mirrors | any frame with the 870, Spas 12 or Jackhammer up |
| D2 | The launchers' reticle: the page's cross of `ret_rocket_01/02` at full size on the moving centre; the original's 0.7 corners and the four-quad 0.7 sight fixed at the frame's centre. Built, NU-3a C2 (2026-10-14): the sight and the 0.7 corners, `LAUNCHER_SIGHT_READING`'s mirrors | the MGL, M79, LAW or RPG up; an M203 rifle or the F2000 in a round mode |
| D3 | A swap resets the size (and the knock, the sway, the pull's count, the exertion to 1) to the new record's rest; the original carries the size and closes or opens it, carries the rest, and lifts the exertion by 0.5, capped at 1, when the set changes -- unlike the page only from an exertion under 0.5 (section 3.2; the re-review, item 4, added the cap; the review, F7; was: "A swap resets the size (and the knock) to the new record's rest; the original carries the size and closes or opens it"). Built, NU-3a C3 (2026-10-14): carried, and the set change's +0.5 at the page's HUD frame for a swap of what is in the hand (the other marks of a set change -- the zoom's, the fire mode's, `FUN_005be570` and `FUN_005c4600` D:L478609-478612, marked whether or not the set changed -- are not this row's: found at the build, not built) | the frames after a swap from a bloomed weapon (a pistol at 30 to a rifle; a running rifle to the pistol) |
| D4 | No green on a teammate within 320 (500 scoped), no red on an identified other, no name, no teammate health bar. Built, NU-3b C4 (2026-10-15): the green, the red (`ENEMY_IDENTIFIED_PLACEHOLDER`; was: `ENEMY_IDENTIFIED_READING`, refiled by the review's F1), the name "[tag] name" (the tag from two characters, D:L70193-70198) and the bar's place; the bar's health is `TARGET_HEALTH_PLACEHOLDER` -- no page learns another body's health, so no bar is drawn until the room sends it. Built, NU-3c (2026-10-15; section 4.2.1, part 4): the room sends a seat's part bytes to its side and the spectators, and the bar fills from them | aiming at a teammate or an enemy within range |
| D5 | No grey while the muzzle is blocked past the size. Built, NU-3b C5 (2026-10-15): the grey over the pip's offset past the bloom's unhalved size, signed, the name and the bar hidden (D:L69983-69992) | the muzzle against a wall the eye's ray clears (the pip showing) |
| D6 | No grey while a climb or a ladder's start is on top. Built, NU-3b C5 (2026-10-15): the grey last, over every other colour, while the move's clip is one of `FUN_005a78d0`'s six (`CLIMB_GREY_CLIPS`); the top play's byte `+0x2b` = 5 not held (`TOP_PLAY_GREY_READING`, *note only*) | mid-climb at a crate, a ledge's hang, a ladder's foot |
| D7 | The pip runs under set 3 (built, NU-3a C2: the step and the fade, section 2.3's correction) | a launcher round mode with the muzzle blocked |
| D8 | No black with nothing left to fire. Built, NU-3b C5 (2026-10-15): the black (`EMPTY_RETICLE_COLOUR_READING`) with no round in any magazine of the hand's mode, the target skipped (D:L70064-70072) | a firearm with every magazine empty |
| D9 | No threat marks (2.6) | being hit (unread driver) |
| D10 | Under the scope (set 5) and the binoculars (set 7) -- and research 320's meter (set 4, its D6) -- the original shows the target's name and a teammate's bar; the page's binoculars hide everything and no page set shows them (the review, F4). Built, NU-3b C4 (2026-10-15): the name (and the bar, once its health is known) over the scope (`ret_scope_02`'s `W/4`, `H/4`, the range 500) and the binoculars (`ret_binocs2`'s `W/2`, `H/2`, the range 320); the meter's is G4 (research 320) | scoped or in the binoculars with a teammate or an identified enemy under the centre |
| D11 | Found at NU-3a's build (2026-10-14): a raised LAW or RPG-7 drew the firearm's set, not 3 -- the page's `aimReticle` asked the set with the hands' throwable only (`handItem`), and the launcher is not one. Built, NU-3a C2: the raised launcher is the hand's item (`ITEM.LAW`; the RPG-7's 146 is the same carrier class, so the same set) | a LAW or an RPG-7 raised |
| D12 | Found at NU-3a's build, not built: under a raised launcher the page's bloom (`Accuracy`) keeps the firearm's record, where the original's kit runs the hand's -- the LAW's and the RPG-7's own `Reticule_Modifiers` (2-6 / 60 / 6 x 1 / 13 every stance, the M79's size columns; the knock 13 / 60 / 70 every stance, the M79's 13 standing only -- 9 crouched and prone; read off `ZWEAPON.ZAR`, `reticleClass.test.ts`; the review of db22d91d3, F3; was: "(2-6 / 60 / 6 x 1 / 13 every stance, the M79's;"); the record the hands' launcher lends is `matchThrow.ts`'s, outside NU-3a's files | a LAW raised after a sprint or a burst |

## 7. The build list

### 7.1 Rows for the build brief (RED first; the page only)

| row | change | the test that shows it (RED first) |
|---|---|---|
| C1 (D1) | `reticleLayout` by shape: set 2 lays the four floating quads at the diagonal corners of the square of half side `size` (section 2.2), each quad's corner on it, the stored bitmap mirrored per corner as the console shows (after `SHOTGUN_CORNER_READING`) | `reticleClass.test.ts`'s shotgun row: the 870 at size 25 -- RED: a quad centred on the vertical through the centre; GREEN: the four quads' rectangles at (cx + 25 .. cx + 25 + W, cy - 25 - H .. cy - 25), ... |
| C2 (D2, D7) | Set 3: the corners at 0.7 of `ret_rocket_02`; the ring hidden; `ret_rocket_01` as four 0.7 quads meeting at the frame's centre (not the knock's), coloured with the arms; no pip under set 3 | the launcher row: the M79 -- RED: one fixed quad on the moving centre; GREEN: four sight quads with a corner on (320, 224) at any knock, the corners at 0.7 W; the pip's alpha 0 under set 3 |
| C3 (D3) | `Accuracy.setWeapon` keeps the size (lifted to the new min next tick), the knock's offsets, the sway, the pull's count and the exertion, and adds 0.5 to the exertion, capped at 1 (`FUN_00578150`), when the set changes (the cap: the re-review, item 4); `reset()` stays for a life and a map (the review, F7; was: "keeps the size (lifted to the new min next tick) and the knock's offsets") | `accuracy.test.ts`: the Mark 23 bloomed to 30, swapped to the M4A1 SD -- RED: size 1 at once; GREEN: about 29.17 after one 1/60 s tick (30 - 50/60: the tick lifts to the min, clamps only the target and closes the size in the same frame, D:L477365-477369; the review, F6; was: "30 on the first frame"), closing at 50 a second to the rest, 1 after (30 - 1) / 50 = 0.58 s standing still. The exertion kept and lifted by 0.5 to at most 1 (a set change): from 0.3 it reads 0.8 where the page's reset reads 1 (the re-review, item 4; was: "lifted by 0.5 (a set change)"); the sway kept |
| C4 (D4, D10) | The target's colour, name and bar: the actor under the reticle (`remote.aimDistance`'s body, INT-NET-2), within 320 units across the ground (500 scoped): a teammate green with its name online and its health bar; an identified other red with its name; else rest; the name `"[clan] name"` at 0.7 at `(cx + W/2, cy - H/2)` (`W/4`, `H/4` scoped); the bar 60 x 5 15 above; under every set, the scope's, the binoculars' and the meter's included (the review, F4) | a hook test over a two-team room: RED: the colour 'rest' with a teammate under the reticle at 200 units; GREEN: 'friendly', the name shown, the bar at the teammate's health; at 400 units rest; scoped at 400 friendly. The enemy: red when identified (after `ENEMY_IDENTIFIED_READING`). The binoculars (D10): in view state 4 with a teammate at 200 units under the centre -- RED: the mask alone, no name, no bar; GREEN: the mask with the name online at `(cx + W/2, cy - H/2)` and the bar 15 above, `W`, `H` `ret_binocs2`'s from the served bitmap, the range 320 (not set 5's 500) (the re-review, item 4) |
| C5 (D5, D6, D8) | The other colour states in `FUN_00215c10`'s order: the blocked-muzzle grey (the unhalved size), the empty black (after `EMPTY_RETICLE_COLOUR_READING`), the climbing grey (the walk's climb clips and the ladder's start) | `reticle.test.ts` / hook: a blocked muzzle at offset (40, 0) with size 26 -- RED: rest; GREEN: grey. A crate climb: grey from the climb's first frame to its end. Candidate difference, *note only* (NU-3b's review, F4, 2026-10-15; not built, no constant): the page computes the blocked muzzle only unscoped (`matchFirearm.ts`'s `!zoom.scoped()` gate, older than NU-3b), so under the scope it never greys; `FUN_005aa6e0` (D:L464315-464373) shows no scope test |
| C6 | The comment corrections of section 8 in `reticle.ts`'s header (the name, the bar, the arms), and a pointer "[corrected by research 321 section 8]" beside research 84 section 9's binoculars paragraph (84:468) (the review, F7) | none (words) |
| C3-room (NU-3a's fold, F2; 2026-10-14) | **The room's cone follows the client's through a swap.** The room's accuracy check (OWNER-3, the launch review: `ShotCone`, `packages/viewer/src/net/shotCone.ts` -- `check` and `aimFits`, a round inside the cone the page could have drawn over `CONE_WINDOW_PLACEHOLDER` commands, with `CONE_SLACK_PX_PLACEHOLDER`; documented in research 91's protocol 5 paragraph and its section 16 tolerances) runs the page's own `Accuracy` from the commands, and the page's cone is the original client's: C3's carry (`FUN_005c4b10` D:L478779-478938 writes no `kit+0x84c`), the tick on the selected slot `+0x824` (`FUN_005c2670` D:L477280) that the switch writes at the press (D:L478842), the exertion's raise (`FUN_00578150`). No host-side cone check is read in the original: the room's is the port's adaptation (a round refused outside the cone the client could have drawn), and to refuse no honest round it must follow the client's cone -- so it carries as the client does, through a swap (`room.ts` `aim`, the record taken at the press: `net/moverSim.ts`) and a pick-up (`worldDrops.ts`, into the seat's slot). What the carry means for the bound: **a swap or a pick-up from a bloomed weapon widens the room's first-command bound, as the client's own cone does** -- a DE .50 at 70 taken to the .PKM: about 49 at the first command a round may leave, where the reset cone stood at the .PKM's rest 6. What it adapts: the check itself, never the cone it checks against. Built: `ShotCone.setWeapon` carries through `Accuracy.setWeapon`; the page takes the record at the press (F1, `matchFirearm.ts` `started` and the selected slot's record each frame). **Residuals, named, not built** (the re-review of 2a2b732bf): (1) a swap the room undoes (PAR-37, under a victory dance) -- the page runs the target's record for about a round trip while the room's never changed; were the target's `TargetMin` above the size, the page would draw wider than the room's bound and an honest round could be refused (narrower than before the fold; the dance only); (2) a pick-up into the hand's slot -- the page names the new record a message after the room's take; were the old record's `TargetMin` above the new one's and the lag past the room's window (`CONE_WINDOW_PLACEHOLDER`, 6 commands), the page could draw wider than the bound | `packages/central/test/roomSwapCone.test.ts`, through the room's command path (`binary`, `step`, a `fire` claim): (a) a round inside the carried cone and outside the reset one -- refused at the base, taken now; (b) one outside the carried cone -- refused both; (c) the room's size on the first command after the swap the client's from the press (the page's own pinned to the same by `matchFirearm.test.ts`'s F1 tests) |

### 7.2 The unknowns, as candidate constants (for the ledger at the build; none added now)

(NU-3a, 2026-10-14: the candidates its build consumes are filed in section 7.5 and in research 101 --
`SHOTGUN_CORNER_READING` (C1), `LAUNCHER_SIGHT_READING` (C2), `SWAP_KNOCK_READING` (C3); `ROCKET_LAUNCHER_SPREAD_READING` settled by the reader run
(below), no constant; the others stay candidates here.)
(NU-3b, 2026-10-15: C4 files `ENEMY_IDENTIFIED_READING` -- refiled by its review's F1 the same day as
`ENEMY_IDENTIFIED_PLACEHOLDER`, the passes' callers unread -- and the target's kind -- as `TARGET_KIND_PLACEHOLDER`, the page
holding no flag to read -- in section 7.5 and research 101, with three more its build named:
`TEAMMATE_NAMES_OPTION_READING` (was: `TEAMMATE_NAME_HIDDEN_READING`, corrected from research 329 the same day),
`TARGET_HEALTH_PLACEHOLDER`, `TARGET_NAME_LOOK_READING`.)

| candidate | stands for | the evidence that settles it |
|---|---|---|
| `SHOTGUN_CORNER_READING` | `ret_shotgun_02`'s size and texels and each corner's orientation (the UV permutations' vertex order is lost in the decompilation) | a reader run (`hudBitmaps`' decode of `HUD2_TXR`, owed); a capture of the 870 at rest and walking. **Built** (NU-3a C1, 2026-10-14; section 7.5): the reader run made -- `ret_shotgun_02` served 32 x 32 (`ret_shotgun_01` 64 x 64) on MP2, MP6 and MP72, one arc of radius 16 about its decoded top-right corner (`hudBitmaps.test.ts`) -- and the orientation filed as a reading; the capture still owed |
| `LAUNCHER_SIGHT_READING` | `ret_rocket_01/02`'s sizes and texels; the four sight quads' mirroring | a reader run; a capture of the M79 and the LAW raised, at rest and after a round. **Built** (NU-3a C2, 2026-10-14; section 7.5): the reader run made -- both served 64 x 64 on MP2, MP6 and MP72; `ret_rocket_01` a quarter disc about its decoded top-right corner with a dot on it (`hudBitmaps.test.ts`) -- the quads' vertices and UVs read (`FUN_00359590`, `FUN_00359140`), the row order research 320's; the capture still owed |
| `ROCKET_LAUNCHER_SPREAD_READING` | the LAW's and the RPG's `Reticule_Modifiers` (the golden's 44 records hold neither) | a reader run of their two records (`readKitTable` over `ZWEAPON.ZAR`, owed). **Settled** (NU-3a, 2026-10-14) by the reader run: `weaponRecord` over `ZWEAPON.ZAR`'s `zweapon.rdr` (`LAW`, `RPG LAUNCHER`, roundless carriers -- `readKitTable` skips equipment) reads both at 2-6 / 60 / 6 x 1 / 13 every stance -- the M79's size columns -- and the knock 13 / 60 / 70, 3 x 1 every stance, where the M79's is 13 standing and 9 crouched and prone (`reticleClass.test.ts`); no constant -- the page does not run them (D12) (the review of db22d91d3, F3; was: "reads both at the M79's 2-6 / 60 / 6 x 1 / 13, knock 13 / 60 / 70, 3 x 1, every stance") |
| `TARGET_KIND_READING` | the flagged target (offline `+0xc8` bit 31 without 1 and 18; online bit 17) and its red under `DAT_00437ce8 + 0x111` = 3 | a capture aiming at a hostage and at the escort's VIP; the flag bits by a PINE read. **Replaced** (NU-3b C4, 2026-10-15; section 7.5) by `TARGET_KIND_PLACEHOLDER`: the page knows no such flag, so a body on no seat's side (a hostage) is drawn at the rest |
| `ENEMY_IDENTIFIED_READING` | what sets the record's `+0x2c` bit 0x200 that makes an other red | a capture aiming at an enemy before and after he is seen or shot; a PINE trace of the record. **Built** (NU-3b C4, 2026-10-15; section 7.5): `'under the reticle'`. **Refiled** (NU-3b's review, F1, 2026-10-15) as `ENEMY_IDENTIFIED_PLACEHOLDER`, the same value: the passes that set the bit have no direct caller in the decompilation, so the page's value is an inference |
| `EMPTY_RETICLE_COLOUR_READING` | the colour with nothing left to fire: `DAT_0040c0b8..c0`, .bss (zero-filled at load; was: "0 in the file", the review, F3), no writer found | a capture of an empty M4A1's reticle. **Built** (NU-3b C5, 2026-10-15; section 7.5): (0, 0, 0) |
| `TOP_PLAY_GREY_READING` | the top play's byte `+0x2b` = 5 that greys the reticle | a PINE trace of the top play's `+0x2b` over the stances and the clips; the source of the byte. Held by no code at NU-3b C5 (2026-10-15; section 7.5, *note only*) |
| `RETICLE_COLOUR_SCALE_READING` | the page's one scale from the GS colours to the screen's, measured on the rest's yellow only | a capture of the green and the red (C4's frames). Held by no named constant at NU-3b C4 (2026-10-15): the green and the red take `reticleTint`'s one scale (section 7.5, *note only*) |
| `SWAP_KNOCK_READING` | the knock's offsets across a swap (no writer in the switch) | a capture: a burst, a swap at once, the new reticle's place. **Built** (NU-3a C3, 2026-10-14; section 7.5): carried; the capture still owed |
| `THREAT_MARKS_READING` | the eight `ret_threat` marks' driver `body+0xf00..+0xf1c` | a source read of the writers of `+0xf00..`; a capture being shot from the side |

One capture session settles most of them: the HUD with each firearm class up (a pistol, an SMG, a rifle, the 870, an
MG, a sniper unscoped and scoped, the M79, the LAW), at rest, walking, firing, crouched and prone, aimed at a
teammate, an enemy and a wall at the muzzle, mid-climb, empty, and each swap between them.

### 7.3 The table test the build holds: `packages/viewer/test/reticleClass.test.ts`

One row per class -- the pistol (the Mark 23, 15), the SMG (the HK5, 31), the rifle (the M4A1 SD, 62), the M203 rifle
in a round mode (52 with 175), the shotgun (the 870, 84), the MG (the M60E3, 91), the sniper unscoped and scoped (the
M40A1, 102), the grenade launcher (the M79, 143), the rocket launcher (the LAW, 145), and research 320's throwable (the
M67, 121), charge (the claymore, 153) and C4 (151) -- each asserting, off the pinned records (`weapons.ts`' and the
golden's) and the served bitmaps' sizes: the set (`reticleType`); the fixed and floating bitmaps; the shape's quads at
640x448 at the stance's `TargetMin` and `TargetMax`, first person and third (halved); where the knock moves them (all
but set 3's sight); the colours rest, friendly, hostile, grey and empty; and the pip's gate. RED first: the shotgun's
and the launcher's rows fail on today's cross. (NU-3b, 2026-10-15: the colour column, NU-3a's `it.todo`, is a case in
every row -- the six colours off `reticleTargetState` and each laid on the class's own arms, and on set 3's sight; no
row is a todo.)

### 7.4 Where the port matches: the pins (NU.R3)

- **The set per class**: `packages/viewer/test/reticle.test.ts` ("picks the set by the view, then the weapon ID
  (FUN_005be300)"), `sights.test.ts` (the `reticleType` rows; "every in-scope firearm off the disc"),
  `weapons.parity.test.ts` ("the reticle set per pinned record") -- held.
- **The cross (sets 0, 1)**: `reticle.test.ts`'s `reticleLayout` group (the console frame's cross within a pixel; the
  sidearm's 32 and 16; the size, the knock, the third-person rest) -- held.
- **The bloom and the knock per weapon and stance**: `packages/viewer/test/accuracy.test.ts` and `weapons.parity.test.ts`
  ("a round on the reticle off the pinned records", "the scoped kick ...") -- held; section 3.3's table is what a
  per-record sweep would add, owed with C3.
- **Rest and the arming grey**: `reticle.test.ts` ("colours the arms as FUN_00215c10 does"), `sights.test.ts`
  (`armingColour`) -- held.
- **The scope, the binoculars, the goggles**: `reticle.test.ts` (the scope's quads, the wide frame's bars, the
  binoculars' group, the goggles), `sights.test.ts` ("the scope overlay: set 5's two bitmaps ..., the F2000 without
  ret_scope_02") -- held for the overlays; the name and the bar under them are C4's (D10; the review, F4).
- **No reticle while dead**: `reticle.test.ts` (`reticleShown`) -- held.

### 7.5 Readings and placeholders (NU-3a's build)

Filed 2026-10-14 by NU-3a (`packages/viewer/src/reticle.ts`, `accuracy.ts`); reading, pending review. Research 101
holds their rows. NU-3b's (2026-10-15; `reticle.ts`, fed by `matchFirearm.ts` `aimReticle`) follow them, reading (or
placeholder), pending review; NU-3c's (2026-10-15; `net/protocol.ts`, section 4.2.1) follow those, reading, pending
review.

| name | stands for | value in the code | the evidence that settles it |
|---|---|---|---|
| `SHOTGUN_CORNER_READING` | how each corner quad of sets 2 and 3 shows its floating bitmap (section 2.2): the rectangles are read (`FUN_00215250` D:L69799-69823), the mirrors are not -- the three UV permutations (`FUN_00358d50`, `FUN_00358e20`, `FUN_00358cc0`, D:L254804-254890) land on the quad's corners through the first triangle's vertex order, which the decompiler loses (`FUN_00359490` D:L255082-255092). Read so: the upper left "as stored" with the decoded last row at its top (research 320's `GRENADE_METER_BITMAP_READING`), the lower left `FUN_00358e20`'s vertical mirror of it, the upper right `FUN_00358d50`'s mirror across, the lower right `FUN_00358cc0`'s swap of its upper-left and lower-right corners (taken with the first triangle A, B, C -- which the rifle's left arm, `FUN_00358cc0` then `FUN_00358e20`, does not bear out against the console frame; so a reading, not the code's word). The served bitmaps agree: `ret_shotgun_02` is one arc of radius 16 about its decoded top-right corner, mirror-symmetric across the diagonal through it; `ret_rocket_02` one stroke across that diagonal, 24-34 texels out (`hudBitmaps.test.ts`) | `[[true, true], [false, true], [false, false], [true, false]]` -- `[flipX, flipY]` of the decoded bitmap per corner, unturned, in the code's order (`+0x2930` upper right, `+0x2b20` upper left, `+0x2d10` lower left, `+0x2f00` lower right): the decoded top-right corner on the square's corner, the four mirrored about the centre lines (`cornerQuads`) | a capture of the 870 at rest and walking (and of the M79 for set 3's corners) |
| `LAUNCHER_SIGHT_READING` | how set 3's four sight quads show `ret_rocket_01` (section 2.3): the vertices are read -- each quad from its outer corner to the frame's centre (320, 224), mirrored about the centre lines, sampled (0.01, 0.01), (0.01, 0.99), (0.99, 0.99), (0.99, 0.01) in vertex order (`ChangeReticule` D:L69595-69652; `FUN_00359590`, `FUN_00359140`), so the bitmap lies transposed; which decoded row v 0 is, is not (research 320's `GRENADE_METER_BITMAP_READING`: the last). With it the decoded top-right corner meets the frame's centre, where the served `ret_rocket_01` (64 x 64) has its dot, and its quarter disc closes into one ring about 41 pixels out (`hudBitmaps.test.ts`) | `[[false, false], [false, true], [true, false], [true, true]]` -- `[flipX, flipY]` of the decoded bitmap before a quarter turn clockwise, in the code's order (`+0xa30` upper left, `+0xc20` upper right, `+0xe10` lower left, `+0x1000` lower right; `sightQuads`) | a capture of the M79 and the LAW raised, at rest and after a round |
| `SWAP_KNOCK_READING` | the knock's offsets across a swap (section 3.2): the switch (`FUN_005c4b10` D:L478779-478938) writes no `kit+0x20/+0x24`, nor was another writer found in the swap; what clears them at a death or a spawn was not found either (research 101 A30) | `'carried'` (`Accuracy.setWeapon`: the climb kept, back at the new record's `ReticuleKnockReturn`) | a capture: a burst, a swap at once, the new reticle's place over the first frames |
| `ENEMY_IDENTIFIED_PLACEHOLDER` (retired by AD-3, 2026-10-16; was: `ENEMY_IDENTIFIED_READING`, a reading at C4's build; refiled by the review's F1, 2026-10-15) | an other under the reticle is red and named when the HUD's body's record of it carries `+0x2c` bit 0x200 (D:L70122-70130); was **not read**: the passes' callers. AD-3 read them (section 4.1.1): slot +0xac of the human's tables, called by the dispatcher `FUN_005c9b30` from slot +0x3c | was `'under the reticle'`: every other the page's pick reached red; now the perception's mark (`Perception.identified`), its unread parts the four AD-3 placeholders below | retired by AD-3: the constant removed |
| `TEAMMATE_NAMES_OPTION_READING` (was: `TEAMMATE_NAME_HIDDEN_READING`, `false`, "the byte written by no line found by its offset; the page holds it clear, the teammate's name shown" -- replaced 2026-10-15 from research 329, reading, pending review) | online, a teammate's name is the blank `" "` while the HUD's (`DAT_00408e58`) byte `+0x17b64` is set (D:L70162-70170); that byte is the over-head tags' part's (`CMPTeammateNames`, HUD `+0x17580`, `FUN_00227340` D:L77524-77562) `+0x5e4`, set once at its set-up from the TEAMMATE NAMES option, the valve `DISPLAY_MP_TEAM_NAMES` not 0 (`FUN_00351ff0`, D:L77558-77559; research 329), whose default is 1 (the golden `global-valves.json`, `valves[152]`); NU-3b C4 | `{ valve: 'DISPLAY_MP_TEAM_NAMES', on: true }`: by default a teammate under the reticle shows the blank and his bar (his name is over his head, NU-9 (c)); with the option off his "[tag] name" (`reticleTargetState`'s `teammateNames`, the default when absent: no page path hands the valve yet, the wiring owed to NU-9 (c)'s T4) | a capture online aiming at a teammate with the option on and off |
| `TARGET_KIND_PLACEHOLDER` (retired by AD-3, 2026-10-16; was: section 7.2's candidate `TARGET_KIND_READING`) | the flagged target (offline `+0xc8` bit 31 without bits 1 and 18, online bit 17, D:L70109-70118), green with its name and bar, or red under `DAT_00437ce8 + 0x111` = 3 and `FUN_002c30b0` (D:L70137-70158); AD-3 read the bodies (section 4.1.1): the hostages (0xc0020000) and the escort's VIPs (0x40020000) | was `'rest'`: a hostage at the rest, no name, no bar; now `ReticleTarget.kind` from the room's hostage list, green with its record's name (the VIP: no body in the room yet) | retired by AD-3: the constant removed |
| `PERCEPTION_SEEN_RATE_PLACEHOLDER` | a seen query's rate a second (`FUN_0060aa20` D:L516162-516246): the scene's lighting (the mission's `.bss` terms, the light grid), the target's speed and stance, smoke, an item 0xbe's 0.1, the fog-like term, the record's `+0x100` bit's 2, through a composite (`FUN_0053ae20`, `FUN_0053abe0`) not read (section 4.1.1, 2); AD-3 | `Number.POSITIVE_INFINITY`: a seen query fills the record to 2 at once, so a seen other is marked on his first query (the acquisition the page had before AD-3, kept); the unseen -1, the clamp, the threshold and the clears are read | a capture or a PINE trace of the record's `+0x18` / `+0x1c` against the queries' timestamps, an enemy coming into view at a few distances, lit and in shade |
| `PERCEPTION_SIGHT_PLACEHOLDER` | the query's visibility over 0 (`FUN_0060b120` D:L516326-516386: from the observer's eye `DAT_0066b7a8` to the target's slot +0x38 point, each surface's material `+0x20` off 1, foliage a random share by distance band) and the record's distance `+0x10`; AD-3 | `{ surfaces: "the eye query's kept surfaces", from: "the aim's eye", to: "the feet raised by EYE_HEIGHT", record: "feet to feet" }`: seen when `crosshairPick` finds no kept surface (`pickSurfaces`) between the aim's eye and the target's feet + `EYE_HEIGHT` 15.4; the reach tested on the feet-to-feet distance (`matchFirearm.ts` `perceive`) | a PINE trace of the query's two points and of the record's `+0x10`; the materials' `+0x20` read off the disc |
| `PERCEPTION_QUERY_PLACEHOLDER` | the queries' schedule: `FUN_0060bc40` launches at most `DAT_0044d5e4` a frame from the queue `0x44d5f0`, each query's `+0x24` gaining the frame's time while it waits (D:L516700-516742), the dispatcher taking a completed one on the next pass; AD-3 | `"one query a body a frame, its elapsed time the frame's"`: the page steps every body's record once a HUD frame with that frame's `dt` (`Perception.step`), none when no time passed | a trace of the queries' timestamps and results with several bodies in view (the acquisition's latency; not claimed) |
| `PERCEPTION_VETO_PLACEHOLDER` | the target body's `+0x105c` bit 4 that keeps the mark clear (D:L482214-482218), copied from the mission's flag word `CMission+0x140` bit 0x2000 (`FUN_002b28d0` D:L155878-155879, `FUN_00573130` D:L434809-434810), whose writer was not found by its offset; AD-3 | `false`: no body carries it (`Perception.step`'s `veto` absent) | a reader run over the 22 MP missions for the flag word's writer, or a PINE read of `CMission+0x140` in a match |
| `PERCEPTION_RECORD_LIFE_READING` (re-filed by the re-check of AD-3's F2, 2026-10-16; was: "kept across a death, a respawn and a round", the page keeping its records for the mount -- the read had missed `FUN_00598b90`'s direct call of `FUN_00599b60`, D:L455158) | the records' life (section 4.1.1, 5): the observing body's list `+0xd0`, a record made zeroed at an actor's entry into the world (`FUN_002a0450` D:L145796-145806, `FUN_002a0200`); the whole list emptied and refilled zeroed at the observing body's rebuild (`FUN_00599b60`, research 179:503, 212:493: D:L455659 the destructor, `FUN_0029ff60` D:L144952; D:L455663 `FUN_00553ea0` -> `FUN_0029ee10` D:L144978-144980; `FUN_002a0a10`), at every online round start (`FUN_00223680` D:L75925-75931 -> `FUN_00598b90` D:L455158) and an online respawn (`FUN_00547350` D:L412721-412726 -> `FUN_00598b90(body, 1)` -> D:L455158; offline `FUN_005994a0` D:L455369, D:L455385; was: the respawn cited as `FUN_005994a0` alone); kept across the observed body's rebuild alone (`FUN_002a0f70`'s leave cancelled, D:L455668, D:L146058-146068) | `{ owner: "the observing body (+0xd0)", created: "zeroed at an actor's entry into the world and at the body's rebuild", emptied: "at the observing body's rebuild: every online round start, its respawn", kept: "across the observed body's rebuild alone (its leave cancelled)" }`: `Perception.clear` at the page's own spawn (`spawnKit`); another seat's record kept across his death and respawn; a seat gone from the room loses its record at once (`Perception.keepOnly`, the page's own earlier timing, not a reading: the original's leave is deferred to the next online round start, `FUN_005998b0` D:L455524 -> `FUN_0029fcb0` D:L75924 -> `FUN_0029fd80` -> `FUN_0029ed30` D:L419349 -> `FUN_002a0f70(body, 0)`; was: "the page's own bookkeeping") | a capture or a PINE read of an observer's `+0xd8` records across a round's start and across an enemy's respawn alone |
| `SPECIAL_ACTOR_HEALTH_PLACEHOLDER` (*note only*; no constant: `ReticleTarget.health` is null for a hostage) | a special actor's bar (section 4.1.1, 6; AD-3's review F3): drawn as a teammate's (`bVar5 \|\| bVar3`, D:L70213-70219) at the actor's own health (`FUN_00241cc0`, its `+0x1044`); no page is sent a hostage's health (`NetClient.healthOf`: seats only, NU-3c) | *note only*: no bar drawn for a hostage (`reticleTargetState`'s `bar` the target's `health`, null) | the room sending a hostage's health to the pages (an online-seat change to `net/protocol.ts` / `room.ts`, not AD-3's); a capture aiming at a hostage, whole and hurt |
| `TARGET_HEALTH_PLACEHOLDER` (retired, NU-3c 2026-10-15) | the bar's fill: the target's health (`FUN_00241cc0(bar, target, 1)`, the body's `+0x1044`, D:L70213-70219, D:L89957); the room sends no page another body's health (`net/protocol.ts` `CombatReport`), as research 282's `SPECTATOR_FOLLOWED_HEALTH_PLACEHOLDER`; NU-3b C4 | was `null`: no bar drawn (its place and its two colours built, `targetLayout`, `Reticle`); now the room's six bytes through `NetClient.healthOf` (section 4.2.1, part 4) | a room change carrying a teammate's health to his side's pages (made, NU-3c); a capture of the bar on a wounded teammate (still owed). Retired by NU-3c: the constant removed |
| `EMPTY_RETICLE_COLOUR_READING` | the arms' colour with nothing left to fire (`FUN_005bdb00` answering 0): `DAT_0040c0b8/bc/c0` (D:L70064-70072), .bss, zero-filled at load, written by no line of the decompilation; NU-3b C5 | `[0, 0, 0]`: the arms black (`reticleTint('empty')`), the target skipped | a capture of an empty M4A1's reticle |
| `TOP_PLAY_GREY_READING` (*note only*) | the top play's byte `+0x2b` = 5 that greys the reticle beside `FUN_005a78d0`'s climbs (`FUN_00219390`, D:L70260-70266); what the byte is, is unread | *note only* (not built: the page greys on the six climb clips alone, `CLIMB_GREY_CLIPS`) | a PINE trace of the top play's `+0x2b` over the stances and the clips; the source of the byte |
| `RETICLE_COLOUR_SCALE_READING` (*note only*) | the page's one scale from the GS colours to the screen's (`reticleTint`), measured on the rest's yellow only, now carrying the green, the red, the greys and the black too | *note only* (no constant: `gsTint` is the conversion) | a capture of the green and the red (C4's frames) |
| `TARGET_NAME_LOOK_READING` | the target's name string (`hud+0x4544`, made at Init by the HUD's string class at 0.7, D:L70816-70817) is coloured nowhere in the reticle's code; its place `FUN_003631a0` (D:L70209-70211); NU-3b C4 | the HUD's every string's: (128, 128, 128) at alpha 80 with the font's drop shadow (`hud.ts` `HUD_COLOURS`, `FONT_TEXT_01`), the place the pen and the baseline, left-aligned (`hudFont.ts` `layoutText`) | a capture of a teammate's name beside the reticle |
| `PART_HEALTH_INTERVAL_TICKS_READING` | how soon a seat's part byte may change again for the others (section 4.2.1, part 1): 100 ms online (research 193 section 12.4), `lastSent + 100 < now` strictly in the DME's millisecond clock, each of the six bytes its own field and time (`FUN_0061a488` D:L526672-526674, D:L526693); how often the pump runs is unread; NU-3c (2026-10-15, `net/protocol.ts`) | `7` ticks of the room's 60 Hz: the clock is whole milliseconds (`FUN_0063d2d8` D:L552697), so the strict 100 needs 101 counted, which six 59.94 Hz frames (100.1 ms) reach about one time in ten and seven (116.8 ms) always; the room's tick standing for a frame (was `6`, on 100.1 ms passing with the clock taken as continuous; NU-3c's review, F1) | a two-console capture timing a wounded seat's part-byte field updates |
| `SEAT_SCRIPT_TEAM_MASK_READING` (*note only*) | that no multiplayer map's script gives a seat the escortee bit or the other side's (section 4.2.1, part 2): `FUN_005cea40` (D:L484703-484711) ORs or clears a mask on an actor found by id; the MP maps' scripts were not read; NU-3c | *note only* (no constant: the room's recipients leave out the other side whatever a script does) | a reader run over the MP maps' scripts for that action and its targets |

## 8. Against earlier notes (history kept; those notes are not edited by this row)

- **Research 84 section 9's binoculars paragraph** lists what set 7 hides as "the ring and dot (`hud+0x4544`, `+0x45e0`,
  `+0x70`), the threat polys (`+0x2930` x4), the six other parts (`+0xf0` .. `+0x840`)". Read here: `+0x4544` is the
  target's name (a 0.7 string, D:L70816-70818), `+0x45e0` its health bar (D:L70822-70823), `+0x70` the ring and dot;
  `+0x2930` x4 are the four arms (D:L69824-69841); the threat marks are `+0x19b0` x8 (D:L69842-69899); the "six other
  parts" are research 320's meter (`+0x270..+0x840`) and its hidden alternative (`+0xf0`, `+0x170`). `reticle.ts`'s header
  repeats the first two; the build's C6 corrects the comment. (Done at NU-3a C6, 2026-10-14: `reticle.ts`'s header
  corrected with its old words kept, and a pointer "[corrected by research 321 section 8: ...]" beside research 84
  section 9's paragraph, that paragraph's text otherwise as written.)
- **Research 84 section 9's colours** gave the teammate's range as "within 320 units (500 scoped)": it is across the
  ground (x and z) and also gates the red (section 4.1). Its "(130, 130, 130) past a launcher's range" was corrected by
  research 94 R94.16; the two more greys and the empty black are new here.
- **Research 91 section 6's "damage-direction markers ... none (no strings, no HUD element)"** meets the eight `ret_threat` marks
  (2.6): not settled here; for that row's owner.

## 9. Evidence, apart

- **Source inspection** (the decompilation at the pinned bytes; the ELF's strings and `.data`): sections 1-5. Reading,
  pending review.
- **The committed goldens** (`weapon-records.json`, `arsenal-items.json`): section 1's ids and classes, section 3.3's
  table. Read, not run.
- **The console frame** `console_spawn_slot8.png` (in the tree): the rifle's rest, as W2.4 measured it (research 84
  section 9); not re-measured here.
- **The port's code**, read: section 6. No unit test, dev-disc test, browser run or playtest was run for this note.
- **NU-3a's build** (2026-10-14; C1, C2, C3, C6 and section 7.3), kept apart: unit tests (`reticle.test.ts`: the corners,
  the sight, the pip under set 3; `accuracy.test.ts`: the swap's carry and the set change's raise; `matchFirearm.test.ts`:
  the raised launcher's set, the HUD frame's raise, the spawn's reset; `shotCone.test.ts`: the server's cone carrying as
  the page's) and dev-disc tests over the fixtures' MP2, MP6, MP72 and `ZWEAPON.ZAR` (`reticleClass.test.ts`: the class
  table off the pinned records and the served bitmaps, the LAW's and the RPG-7's records read; `hudBitmaps.test.ts`: the
  four bitmaps' sizes and ink). No browser run, no playtest, no capture comparison; the readings filed in section 7.5
  stay readings, pending review. The class table's friendly, hostile, blocked, climbing and empty colours are `it.todo`,
  NU-3b's (C4, C5).
- **NU-3b's build** (2026-10-15; C4), kept apart: unit tests (`reticle.test.ts`: `reticleTargetState`'s target rows, the
  tag's two-character rule against `taggedName`'s one, `targetLayout`, the name's glyphs and the bar drawn by `Reticle`,
  under the binoculars and the scope; `matchFirearm.test.ts`: `aimReticle` over a two-team room of fakes -- the pick,
  the side, the range, the scope's 500, the binoculars' 320). No dev-disc test is new for C4, no browser run, no
  playtest, no capture comparison; the constants filed in section 7.5 are readings and placeholders, pending review.
  G4 (research 320) and C5 (2026-10-15), the same kinds: `reticle.test.ts` (the meter's pen and bar; the blocked
  muzzle's grey, the empty black, the climbing grey and their order, `CLIMB_GREY_CLIPS` against `TRAVERSAL_CLIP`) and
  `matchFirearm.test.ts` (an M67 up over a teammate; a crate climb's frames, an empty magazine, a blocked muzzle's pip
  through `aimReticle`).
  The review's folds (2026-10-15): F1 refiles the enemy's mark as `ENEMY_IDENTIFIED_PLACEHOLDER`; F2 the bar's split
  (`targetLayout`'s `fill`, `reticle.test.ts`); F3 `/testroom`'s feed (`main.ts`, pinned in `matchFirearm.test.ts`); F4
  names two parts unbuilt (section 6, the C5 row).
- **NU-3c's read and build** (2026-10-15; section 4.2.1), kept apart: source inspection (the decompilation; two `.data`
  floats of the ELF read by a scratch script, no node process) for parts 1-3; unit tests for part 4 --
  `partHealthWire.test.ts` (the writer's bytes, the reader's total, the recipients, the interval, the wire's check),
  `roomTeamHealth.test.ts` (the room through `binary` -> `step`: the recipients, change only, the 7th-tick interval, each
  byte's own clock, a join, a switch of sides, the cost measured; and room and page on the same command through a real
  `NetClient`), `netClient.test.ts` (the latest per seat, `left`, a malformed frame, a type a page has no case for),
  `matchFirearm.test.ts` and `reticle.test.ts` (the bar filled from `healthOf`; the placeholder gone). No dev-disc test,
  no browser run, no playtest, no capture comparison; reading, pending review.
- **AD-3's read and build** (2026-10-16; section 4.1.1), kept apart: source inspection (the decompilation; the ELF's
  `.data` floats, three controller tables' slots and two one-instruction slot functions read by scratch scripts); one
  scratch dev-disc read of the 22 MP maps' `vehicles.rdr` (the special records' `name`, `display` and `team`; not
  committed); unit tests -- `reticle.test.ts` (`PERCEPTION`, `Perception`'s fill, threshold, clamp, unseen fall,
  rejection, inactivity, reach and veto; `perceptionLook`'s cone, reach, mover and magnification; `reticleTargetState`'s
  mark, hostage, VIP by game type and side, offline flag; the two retired names) and `matchFirearm.test.ts` (`aimReticle`
  with a low wall: never seen, then seen, then a second's hold; a body seen off the reticle; a hostage by the room's list
  on EXTRACTION and ESCORT for each side) -- and the dev-disc table `reticleClass.test.ts` (the mark, the hostage's green,
  the VIP's red on every class; over the fixtures' MP2, MP6, MP72 and `ZWEAPON.ZAR`). No browser run, no playtest, no
  capture comparison: the acquisition's latency and the rendered target are owed (section 7.5's four placeholders);
  reading, pending review. The review's folds (2026-10-16, PASS WITH FINDINGS): F1 the cone's magnification the zoom's
  target (`matchFirearm.test.ts`); F2 the records' life read, no clear built (`PERCEPTION_RECORD_LIFE_READING`;
  `reticle.test.ts`, `matchFirearm.test.ts` pin it); F3 a hostage's bar filed (`SPECIAL_ACTOR_HEALTH_PLACEHOLDER`, note
  only). Source inspection and unit tests; no capture. The re-check of F2 (FAIL, 2026-10-16): the observer's rebuild
  (`FUN_00598b90` -> `FUN_00599b60` D:L455158) empties the records -- the clear built at the page's own spawn, the
  observed body's rebuild alone keeping them, a seat's leaving dropping its record as the page's bookkeeping; the two F2
  pins flipped (`reticle.test.ts`; `matchFirearm.test.ts`, three cases).
