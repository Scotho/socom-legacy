# 181 -- C3 -- combat, HUD, effects: the placeholder and reading ledger, sourced

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C3-combat-hud-effects.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V1 (`research-wave-2026-10-04/V1-verify-core-combat.md`) has landed and is folded in as §9.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** hand grenades do not spin in flight (`SPIN_PLACEHOLDER` -> 0; §2.8, and V1's §9.3) -- they tumble: the free-flight step `FUN_003c9530` rotates the model by the distance moved, up to 50 half-turns/s (R2-C3 and V5, research 202 item 20 and §7).

**Overridden in part (research 206 §1):** the C4 readiness of 0.2 s (§2.5) -- the timer also resets when the target object moves; the SEAL's own movement is not tested; the 3.2 depth limit also guards item 0x9e (a mine) (V1 #9, §9.2).

Research agent C3-combat-hud-effects, 2026-10-04. Scope: the 44 files under `C3-combat-hud-effects` in `clusters.json`
(`$PORT` = the `agent/online` snapshot). Read-only. Every script is in `scratch/C3/` (its `README.md` says what each one
prints); decomp lines are `D:L<n>` in `socom2_game.elf.decomp.c` (r0001); addresses are r0001 unless stated.

**Inventory.** 51 ledger names (the `C3-` rows of `ledger_by_cluster.tsv`). Sweep (`sweep.py`): 17 more
`*_READING/_PLACEHOLDER` names occur in C3 files but are first listed under another cluster; the four that turned out to
be C3 gameplay are written up at the end (two unnamed items, two C1 rows). The "note only" rows of notes 79/84/85/87/89/94
in this area are `C4_REACH_READING` (covered) and research 94's retired rows; nothing else in my area is note-only.

**The cross-cluster 30 Hz lead (C2).** I checked it myself: `DAT_003e1400` = 30 in the ELF's `.data` and in
`spawn_pcsx2.rdram` / `postload_pcsx2.rdram` (`constants.py`, `rdram.py`). The desktop's `docs/KNOWN.md` agrees ("The
game targets 30 fps (two VBlanks)", KNOWN line 134). Research 73 (§1 and its sampler, "30.0 a second, 33.3 ms each")
measures the recompiled build's VBlank pacing under back-pressure, not the game's frame cap, so the two do not conflict.
It changes two C3 things (section X1, X4) and one item's wording (STICK_FOLLOW).

## 1. Summary

| Item | Status | Grade | One-line answer |
|---|---|---|---|
| ROCKET_LAUNCH_SPEED_READING | RESOLVED | STRONG | Muzzle velocity for every locally owned rocket. A remote player's replica starts at rest. |
| BACKBLAST_ORIGIN_READING | RESOLVED | PROVEN | The muzzle. The 9-unit point is computed and never read. |
| BACKBLAST_CONE_AXIS_READING | RESOLVED | STRONG | The +z row of the shooter's body node: behind the body, not the aim reversed. |
| PMN_FRIENDLY_READING | RESOLVED | STRONG | Any actor sets a PMN off, the owner and his team included. |
| C4_PLANT_TIME_READING | RESOLVED | STRONG | 1.098 s: `Put on wall`, 0.45 x 2.5 x 41/42. |
| LAUNCHER_BODY_READING | RESOLVED | STRONG | The crouch-entry test: false only when wading deeper than 8.5 u. |
| HAND_OFF_READING | RESOLVED | PROVEN | The code's constants: 0.72 / 0.82 / 0.62 / 0.79. |
| SPIN_PLACEHOLDER | RESOLVED | STRONG | 0 in flight: the code never turns a hand grenade's model. |
| EMPTY_SLOT_NAME_READING | RESOLVED | STRONG | `<NONE>` for 0xff, `-------` for 0xfe. |
| ARROW_TINT_SCALE_READING | RESOLVED | STRONG | VFTOI0 into RGBAQ, the 0-128 MODULATE scale: the port is right. |
| PROMPT_COLOUR_READING | RESOLVED | STRONG | The code's (100,100,20), alpha 100. |
| BLIND_FULL_READING | PARTIAL | STRONG | `blinded` is TRUE_COLOR_SCALE: `c x 0.75 + 60` on the lit colour, not a full white overlay. |
| STICK_FOLLOW_PLACEHOLDER | PARTIAL | PROVEN | 0.04 x the pad's pitch push, per 30 Hz frame, push > 0 only. |
| PEEK_THROW_READING | PARTIAL | STRONG | No magnitude: state 3 plus the playing lean clip. Neither clip means no throw. |
| PULSE_PHASE_READING | PARTIAL | STRONG | The picker pulse is reset on the menu's Init; the others carry over. |
| NO_FIREARM_RECORD_PLACEHOLDER | PARTIAL | STRONG | Empty and full slots are never selectable. The Designator's fire is not read. |
| MOUNT_BLEND_READING | PARTIAL | BELIEVED | The re-parent is instant. The game's only smoothing is the pose cross-fade. |
| FIREPOINT_203_READING | PARTIAL | BELIEVED | The code falls back to `body+0x14bc` (not read) when the node is missing. |
| C4_REACH_READING | UNRESOLVED | -- | `body+0x208`'s writer is not found statically. A capture is owed. |
| ARC_DEPTH_TEST_PLACEHOLDER | UNRESOLVED | -- | The line list's draw state was not reached. A GS dump is owed. |
| HUD_ROUND_MODE_COUNT_READING, PLACE_CAST_LIFT_READING, PLACE_REST_LIFT_READING, SCORCH_PROBE_READING, SCORCH_PARTIAL_ORDER_READING, RING_VOLUME_READING, SOUND_PRIORITY_SLOT_READING, SPECIAL_GLYPH_PLACEMENT_READING, THERMAL_LENS_FX_READING, UI_MODEL_FORM_READING | UNRESOLVED | -- | Not attempted this round: cosmetic, or another cluster's lane. Levers are listed below. |
| ARROW_ORIENT, CARD_TEXT_OFFSET, DRAW_ORDER, GLYPH, PAD_GLYPH, PUMP_BLOCKS_FIRE, RECOIL_PLACEHOLDER | NOT-A-GAP | PROVEN | Already retired in the notes. |
| CANDIDATE_MAX, MARK_CLIP_MAX_TRIANGLES, MUZZLE, HAND_PLACEHOLDER, EXPLOSION, SMOKE, SMOKE_ALWAYS | NOT-A-GAP | -- | Viewer bounds or fallbacks; the source path exists. |
| LOOK_JUMP, MENU_KEYS, WEAPON_SELECT_KEY/TOUCH/MENU_KEYS, INGAME_AUTOFILL_SIDE, WEAPON_SELECT_SOUND | NOT-A-GAP | -- | PC adaptations, or owner's calls on code that has already been read. |
| X1 (unnamed) `accuracy.ts` `TICK = 1/60` | RESOLVED | STRONG | The bloom's per-call dilate is per 30 Hz frame. The port opens it twice as fast. |
| X2 (unnamed) `CLAYMORE_RULES.maxSpeed` | RESOLVED | PROVEN | `+0xf88` is the water depth, not the speed. |
| X3 (C1 row) `C4_STILL_READING` | RESOLVED | STRONG | A 0.2 s aim-settle timer on the target, not the SEAL standing still. |
| X4 (C1 row) `FLIGHT_TICK_READING` | RESOLVED | STRONG | The frame's dt, which at 30 Hz is 1/30. |

Counts over the 51 C3 names: RESOLVED 11, PARTIAL 7, UNRESOLVED 12, NOT-A-GAP 21. There are 4 extra rows, all
RESOLVED. The ledger is `ledger-C3.tsv`, produced by `scratch/C3/write_ledger.py`.

---

## 2. Gameplay items

### 2.1 ROCKET_LAUNCH_SPEED_READING (`packages/scene/src/projectile.ts:877`)
- **What it stands for**: whether the player's LAW/RPG round leaves the tube at `Muzzle_Velocity` or at rest.
- **Current value**: `'muzzle'`.
- **Prior search**: "which branch the player's LAW/RPG takes is not traced" (R94 L1536).
- **What I did**: I disassembled `FUN_003cb1a0` at 0x3cb398-0x3cb3f4 (`rocket_backblast.py`). The velocity is set to
  `0 x dir` only when four things hold: the round's category is 0xb9 (LAW HEAT 185, RPG 186; `zweapon.txt`), bit 2 of
  the projectile's `+4` is clear, bit 4 is clear, and there is an owner. Otherwise it is `FUN_003d27c0(rec)` (`+0x44`,
  the MV) `x dir`.
  - Who sets bit 2: `FUN_005c5340`, the body's fire (D:L479363-479374), sets bit 3 = "owner is the local player" and
    bit 2 = `ctrl->vtable[0x34]() == 0`.
  - What slot +0x34 returns (`vt_classes.py`): `CRemoteCtrl` (vt 0x669590) returns 1 (`0x5e6260: jr ra; li v0,1`).
    `CSealCtrl` (0x6694b0), `CSealCtrlAi` (0x6693f0) and `CSealCtrlSquirm` (0x6699f0) share `0x544200`, which returns 0.
  - Bit 4 is set only by `FUN_003c6ac0(p,1)`: for the backblast (D:L325639) and for the zAnim `FIRE_WEAPON` online
    (D:L107308/107322).
  - The fire's call reaches `FUN_003d2d70` through the round record's vtable +0xc (vt 0x4083b0/0x4083e0 slot =
    0x3d2d70).
- **Answer**: every rocket owned by a local, non-remote controller (the shooter's own machine, the host's AI, offline)
  starts at `MV x dir`. A remote player's replica (`CRemoteCtrl`) starts at rest. STRONG: the code read is unambiguous;
  the one interpretive step is the class roles from their type names.
- **Implementation suggestion**: keep `'muzzle'` for the authoritative simulation; the reading becomes a sourced
  constant. If the client ever simulates other players' rockets locally, start those at 0 to match. Test: a fixture
  asserting `launchVelocity(record, {remote:false}) = MV*dir` and `{remote:true} = 0`.

### 2.2 BACKBLAST_ORIGIN_READING (`packages/scene/src/projectile.ts:867`)
- **What it stands for**: whether the backblast spawns at the muzzle or at a point 9 units along the aim.
- **Current value**: the muzzle.
- **Prior search**: "the computed point is not in the call's arguments as decompiled" (R94 L1538).
- **What I did**: I disassembled `FUN_003d2d70`.
  - 0x3d2e78-0x3d2ec8 builds `param_4 + 9 x norm(-param_5)` into `sp+0xf0` (`FUN_00309200`).
  - The virtual spawn call at 0x3d2fb0 passes `a3 = $s3 = param_4` (the muzzle), `t0 = sp+0x1a0` (= -dir) and
    `t1 = sp+0x190` (= -param_6).
  - In the whole function (to `jr ra` at 0x3d321c), the only reference to `0xf0($sp)` is the output argument.
- **Answer**: the muzzle. PROVEN. The 9-unit point is dead code.
- **Implementation suggestion**: rename the local to a plain constant with this citation; no behaviour change.

### 2.3 BACKBLAST_CONE_AXIS_READING (`packages/scene/src/projectile.ts:237`)
- **What it stands for**: the axis of the backblast's 45-degree damage cone.
- **Current value**: `'backwards'`, implemented as `-dir`, the aim reversed.
- **Prior search**: R94 L1551 (the z row through the matrix, read as the flight).
- **What I did**:
  - At spawn, `FUN_003cb1a0` (0x3cb308-0x3cb35c) handles ID 0x9f with an owner: `FUN_003156a0(owner node, &angles)`
    wraps `FUN_00308020`, matrix to Euler, whose argument registers I checked in the disassembly. `FUN_00315760`
    (backblast model, angles) then sets the backblast's model rotation to the owner node's.
  - The owner node is `FUN_0029ed20(body)` = `body+0x28` (D:L479492-479494).
  - `GetDamage` for 0x9f (D:L318784-318826) rebuilds the matrix from that model's Euler angles and takes `R x (0,0,1)`
    as the axis.
  - `FUN_003cabe0` never re-orients a 0x9f round: its category is 0x97, not 0xab/0xb9/0xe6, and it is not a bullet.
  - The model's forward is -z: `DAT_003f6500` reads (0,0,-1) at run time in `spawn_pcsx2.rdram` and
    `postload_pcsx2.rdram` (`rdram.py`).
- **Answer**: the axis is the shooter's body node's +z, which is **behind the body**. It follows the body's facing, and
  so has no aim pitch if the node carries yaw only. The port's `-dir` matches when aiming level but tilts the cone down
  behind the shooter when aiming up. STRONG.
- **Implementation suggestion**: `backblastAxis = bodyBack(yaw)`, i.e. `[sin(yaw), 0, cos(yaw)]` in the port's yaw-0
  faces -z convention, in place of `-dir`. Test: a target 5 m behind at the shooter's feet height is hit when he aims
  30 degrees up.
- **Owed evidence**: whether `body+0x28`'s matrix carries pitch. Read the node's matrix rows in an RDRAM dump while
  aiming up with a launcher; expect row 1 = (0,1,0).

### 2.4 PMN_FRIENDLY_READING (`packages/scene/src/projectile.ts:674`)
- **What it stands for**: whether the owner and his teammates can set off a PMN.
- **Current value**: `true` (any actor).
- **Prior search**: "no team test seen in that loop" (R94 L1545).
- **What I did**:
  - I re-read `FUN_00543930` (D:L410281-410311): Timer1 at or below 0, `d^2 < FUN_003d4430(ammo)` (`+0x3c`), then
    trigger (`FUN_003c5730` sets `+0xc4`). There is no team or owner field anywhere.
  - Its only caller is the seal body's tick `FUN_00550ef0` (D:L418452), which runs for every seal, the remote ones
    included: `CRemoteCtrl::Tick` (`FUN_005e6980`) returns 1.
  - What enters the list: `FUN_005bc730` (D:L474106-474108) adds a PMN only offline or when the owner is local (bit 2).
- **Answer**: any actor trips it, the owner and his team included. Each machine tests only its own mines, against
  every body it ticks. STRONG.
- **Implementation suggestion**: keep it and cite. The server is the owner of every mine in the port, which is
  equivalent.

### 2.5 C4_PLANT_TIME_READING (`packages/viewer/src/equipment.ts:150`)
- **What it stands for**: how long a C4 plant takes.
- **Current value**: 1.3 s, the claymore's own time.
- **Prior search**: "`LAB_005bfe40` not read; the action 0x3e's clip not probed" (R94 L1541).
- **What I did**:
  - `LAB_005bfe40` is `if (a1) *a1 = 0` (6 instructions, `constants.py`).
  - The plant (D:L475420-475452) starts action 0x3e with trigger `+0x60` = 0.45 (0x3ee66666) and argument
    `&kit+0x87c`, and writes 99.0 to `kit+0x87c`.
  - The kit tick (D:L476883-476901) counts `+0x87c` down by dt and places the C4 when it is at or below 0.
  - The trigger is a normalised phase: `FUN_0028c7c0` compares it against the action's `+0x1c`, which
    `FUN_0028c4f0` (D:L134236-134275) advances by `dt / (clip+0x10 x (n-1)/n)`. That is research 85 §3's release rule.
  - Action 0x3e is `Put on wall` (table at 0x661060, `motion_ids.py`). `animset.rdr` maps it to `seal_put_onwall`;
    `motion.rdr` gives playback 2.5 (pistol `seal_p_put_onwall` also 2.5); `MOTION_P.ZAR` gives 42 frames
    (`clip_frames.ts`).
- **Answer**: 0.45 x 2.5 x 41/42 = **1.098 s**, plus up to one frame. STRONG: the phase rule is the one research 85
  and 80 already use.
- **Implementation suggestion**: `C4_PLANT_SECONDS = 0.45 * playback * (n - 1) / n`, computed from the motion table
  for `seal_put_onwall`, as the release time is. The test asserts 1.098 against the disc files.
- **Ported** 2026-10-05 (web sprint 26 PF-13; research 210 s9): `C4_PLANT_SECONDS` / `c4PlantSeconds` in
  `viewer/src/equipment.ts`; `C4_PLANT_TIME_READING` retired.

### 2.6 LAUNCHER_BODY_READING (`packages/viewer/src/equipment.ts:64`)
- **What it stands for**: `FUN_005857e0(body)`, the rocket launcher's second selectability test.
- **Current value**: `true`.
- **Prior search**: not read (R94 L1548).
- **What I did**:
  - `FUN_005857e0` (D:L444332-444360) returns 1 when the body's anim set is `DAT_0044d408`. That is the
    "launcher anim set" (D:L496079-496081, string 0x662670).
  - Otherwise it needs the set to have actions 0x12 `Crouch` and 0x54 `Pistol crouch`, and then
    `!(bit7 of +0x105e) || +0xf88 <= 8.5`.
  - The same test gates the crouch entry (`FUN_00581990` D:L442552).
  - `FUN_005b52b0` (D:L469852-469902) writes `+0xf88` = water surface minus feet and sets bit 7 when in water (it also
    plays `big_ripple_anim`, `small_ripple_anim`, `seal_fall_in_water`, strings 0x65f420/470/4d0).
- **Answer**: the launcher can be taken up unless the SEAL is wading deeper than 8.5 units (0.85 m). A SEAL whose anim
  set lacks the crouch clips also fails, but that never happens to a SEAL (`animset.txt` lines 1243/1263). STRONG.
- **Implementation suggestion**: `slotSelectable` gets `ctx.waterDepth`; the launcher is refused when
  `depth > 8.5 && inWater`. Test: depth 9 refused, 8 allowed. The same depth test applies to crouching (C2).

### 2.7 HAND_OFF_READING (`packages/viewer/src/kit.ts:58`)
- **What it stands for**: the clip phase at which the swap moves the pistol to the hand.
- **Current value**: the readings 0.72 / 0.82 / 0.62 / 0.79.
- **Prior search**: "the phases are this round's research's, not settled" (R84 L544).
- **What I did**: `FUN_00588bc0` (D:L446304-446398) sets the action's callback trigger `+0x60` per playing action
  (`constants.py`):

  | Action | Trigger | Callback |
  |---|---|---|
  | 0x35 `Rifle -> Pistol` | 0.72 | |
  | 0x36 crouch | 0.82 | |
  | 0x37 prone | 0.62 | |
  | `Rifle -> Launcher` | 0.27 | `FUN_005a73c0`/`7520` |
  | `Pistol -> Launcher` | 0.13 | |
  | `Stand -> Turret` | 0.5 | `FUN_005a73c0`/`7520` (added 2026-10-16, PB-2b: the rifle stowed on its carry, back in the hand reversed; research 215 s7.3) |
  | `Pistol stand -> Turret` | 0.4 | `FUN_005a75d0`/`7730` (added 2026-10-16, PB-2b: the pistol to its holster on `rthigh`, back reversed) |

  The moving overlay (D:L438580-438625, `+0x1f4`): states 6/5 at 0.79, 10 at 0.13, 8 at 0.27, each with a 0.4 at
  `+0x10d0`.
- **Answer**: the port's four values are the code's own constants, so they are no longer readings. PROVEN.
- **Implementation suggestion**: rename to `HAND_OFF` with these citations, and add the launcher (0.27, 0.13) and
  turret (0.5, 0.4) phases for when those swaps exist. *(The turret's built 2026-10-16, PB-2b: `net/emplacement.ts`
  `TURRET_STOW_PHASE`, `turretStow`.)*

### 2.8 SPIN_PLACEHOLDER (`packages/viewer/src/grenade.ts:57`)
- **What it stands for**: the grenade's tumble in flight.
- **Current value**: 14 rad/s.
- **Prior search**: "`SetModelOrientation` 0x3cabe0 is not read" (R85 L609).
- **What I did**: I read `FUN_003cabe0` (D:L320444-320561). With `param_2 = 0` (a non-bullet) it sets the model's
  rotation only for categories 0xab, 0xb9, 0xe6 or a bullet (`FUN_003d1e20`), facing the flight direction. Otherwise it
  writes only the position (`FUN_003157d0`). The hand grenades are category 0x79.
- **Answer**: in flight the game does not turn a hand grenade's model: **0 rad/s**. The model keeps the orientation it
  was given at the throw (D:L479376-479384). STRONG.
- **Implementation suggestion**: set the spin to 0 and keep the release orientation. Test: the flight's quaternion is
  constant.
- **Owed evidence**: `HandleBounce` (0x3c9b70) and the roll were not read for rotation. An RDRAM series of a thrown
  M67's model matrix would settle the bounce.

### 2.9 STICK_FOLLOW_PLACEHOLDER (`packages/viewer/src/rifleKick.ts:38`)
- **What it stands for**: how much a pad's pitch push lifts the kick's rest while the kick falls.
- **Current value**: 0.
- **What I did**: `FUN_005b9280` (D:L472095-472117) handles the falling kick (state 2). When `param_2 > 0` it raises
  the rest by `param_2 x DAT_00650980` and caps it at the current pitch. `param_2 = ctrl+0x138 x DAT_003df198`
  (D:L418393). Read from the ELF: 0.04 and 1.0.
- **Answer**: 0.04 x the push, **once per call, so per 30 Hz frame** (not per second, and not per 60 Hz tick). Upward
  pushes only. PROVEN for the constants and the rule; `ctrl+0x138`'s unit (the pad's pitch rate) is not read.
- **Implementation suggestion**: gamepad only, `rest += max(0, padPitchRate) * 0.04` per 30 Hz frame, capped at the
  pitch. The mouse stays 0.
- **Owed evidence**: `ctrl+0x138` (radians a second, or the stick's -1..1?) from its writer in the controller tick.

### 2.10 PEEK_THROW_READING (`packages/viewer/src/grenade.ts:139`)
- **What it stands for**: when a throw becomes the lean's toss.
- **Current value**: a peek value past 0.5.
- **What I did**: `GetThrowAnim` (D:L441773-441796): when `body+0x174 == 3`, the side comes from whichever clip is
  playing. 0x1e/0x20 (`Peek right`/`Crouch peek right`) give the right toss at release 0.55 (0x3f0ccccd). 0x1d/0x1f
  give the left at 0.87 (0x3f5eb852). With neither playing it returns 0 and there is no throw.
- **Answer**: there is no magnitude threshold. The test is state 3 plus the lean clip that is playing. STRONG.
- **Implementation suggestion**: drive the lean throw from the port's lean state (in peek and the lean clip running)
  rather than `|peek| > 0.5`. Refuse the throw in state 3 when no lean clip is playing.
- **Owed evidence**: where `+0x174` becomes 3, which no static store with that immediate shows (`scan_store.py`
  0x174 found none). A dump during a lean would settle it.

### 2.11 NO_FIREARM_RECORD_PLACEHOLDER (`packages/viewer/src/loadout.ts:51`)
- **Answer**: `FUN_005bdc30` (D:L474643-474646) never makes 0xff or 0xfe selectable, so an empty slot fires nothing.
  The Designator (ID 11, present in the loaded list) is not in any MP default kit, and its fire was not read. PARTIAL,
  STRONG.
- **Implementation suggestion**: an empty slot cannot be taken up, so the fallback is unreachable for it; keep the
  fallback only for the Designator.

---

## 3. HUD and menu items

### 3.1 EMPTY_SLOT_NAME_READING (`packages/viewer/src/weaponSelect.ts:204`)
- **Current value**: `''`, because "the arsenal has no such record".
- **What I did**: `FUN_003c4b40(0x4b5210, id)` (D:L316433-316449) searches the loaded weapon list by `+0x7c`.
  `weapon_list.py` walked that list in `spawn_pcsx2.rdram`: 86 records, including 254 and 255. In `zweapon.rdr`,
  `FULL_SLOT` has DisplayName `-------` and `EQUIP_NONE` has `<NONE>`. The row setter is the same `+0x70` call used for
  real items (D:L88328-88339). Rows beyond the slot count are first cleared with a null record (D:L88328).
- **Answer**: an empty slot's row reads `<NONE>`, a second-slot row reads `-------`, and rows past the count are blank.
  STRONG (the setter's use of DisplayName is inferred from its use for real items).
- **Implementation suggestion**: make `kitTableOf`/the arsenal keep the two records (or look them up in `zweapon.rdr`)
  and drop the `''`. Test: `rowName(0xff) === '<NONE>'`.

### 3.2 ARROW_TINT_SCALE_READING (`packages/viewer/src/weaponSelect.ts:189`)
- **What I did**: the polygon's draw (D:L259676-259701) copies the vertex colour `+0x30` through `FUN_001bfef8`. That is
  `lqc2 vf4; vftoi0 vf5,vf4; sqc2 vf5` (0x4be5217c = VFTOI0), so there is no scaling into the RGBAQ word. `FUN_00361120`
  treats alpha 128 as opaque.
- **Answer**: the float lands in the GS byte as is, on the 0-128 MODULATE scale. (255,255,128) doubles the texel,
  saturating. STRONG: TFX = MODULATE is inferred from the HUD texture path the port already uses.
- **Implementation suggestion**: rename to a sourced constant; no behaviour change.

### 3.3 PROMPT_COLOUR_READING (`packages/viewer/src/weaponSelect.ts:299`)
- **What I did**: re-read D:L57296-57303 (colour words `+0x48..+0x50` = 100, 100, 20) and D:L56540-56561 (alpha 100,
  10 s hold, a 0.5 s fade to 0).
- **Answer**: the code's values. The §B4 row (128,128,128 a80) has no source. STRONG.
- **Implementation suggestion**: drop the `_READING` suffix.

### 3.4 PULSE_PHASE_READING (`packages/viewer/src/weaponSelect.ts:192`)
- **What I did**:
  - The picker pulse (`+0xf28/+0xf2c`) is reset by `FUN_0023cd20`, called from the menu's Init `FUN_00240e60`
    (D:L89595-89600).
  - The block's pulses (`+0x1154/58`, `+0x1538/3c`) are set only by the ctor `FUN_00241a90` (D:L89868). They advance
    only in the tick branches that show their part (D:L89400-89488), so they carry their value from one opening to the
    next.
- **Answer**: the picker matches the port (0 rising at opening). The bar and the arrows resume where they stopped,
  starting from 0 rising at the first opening. PARTIAL, STRONG.
- **Owed evidence**: whether `FUN_00240e60` runs per opening or once per round. Find its callers (none appear as direct
  calls in the decomp; probably a vtable).

### 3.5 MOUNT_BLEND_READING (`packages/viewer/src/heldItem.ts:109`)
- **What I did**: `FUN_005a7730`/`FUN_005a75d0` (D:L462397-462416, D:L462350-462372) detach the weapon node and
  re-attach it to `+0x300` (the hand) or `+0x318` at once.
- **Answer**: the game has no weapon ease. What smooths the swap's start is the body's pose cross-fade into the swap
  clip (`BlendTime`, 0.4 by default per `FUN_00287620`), which carries the mounted weapon. BELIEVED.
- **Implementation suggestion**: ease only via the pose cross-fade, and make the hand-off re-parent instant. Keep the
  owner's playtest preference as an explicit owner ruling if he wants the ease.

### 3.6 FIREPOINT_203_READING (`packages/viewer/src/fire.ts:108`)
- **What I did**: `FUN_005c5340` (D:L479455-479462) looks up node `firepoint_203` (0x65f8b8) only for a carrier round
  (`FUN_003c5d20`) and falls back to `body+0x14bc` when it is absent.
- **Answer**: the code has the same "absent, fall back" shape the port uses. I did not read what `+0x14bc` points at
  (in the capture it is a node with no name string). BELIEVED.
- **Owed evidence**: the node `body+0x14bc` names in a dump with the M203 carbine held. Compare its world position with
  the weapon's `firepoint`.

### 3.7 BLIND_FULL_READING (`packages/viewer/src/flash.ts:18`)
- **What it stands for**: the flashbang's white-out strength.
- **Current value**: strength 60 drawn as a full white DOM overlay.
- **What I did**:
  - The zAnim set-0 registration (`FUN_0025bc20`, index = line - 106864) makes 0x24 = 36 `TRUE_COLOR_SCALE`
    (`FUN_002642f0`) and 0x21 = `BLUR3D` (`constants.py`). The thermal reader in `lensFx.ts` uses the same numbering.
  - `FUN_002642f0` (D:L111608-111705) eases the command's keys into the rows `DAT_004b4d40`, one 4-float row per mask
    bit.
  - The per-frame combine (D:L308514-308527) multiplies the rows' rgb and sums their w, plus 0.5.
  - `FUN_003b5a10`/`FUN_003b59a0` (D:L307585-307634) apply `c' = c x rgb + w` to the lit colours.
- **Answer**: the blind is a lift of every lit colour: `c x 0.75 + 60` (levels 2 and 3) on the VU lane's 0-255 scale,
  where the port's own `lensFx.ts` treats 128 as full. It is not a full-screen white: textures stay visible, washed
  out. Mechanism STRONG; the perceived amount needs a frame.
- **Implementation suggestion**: drive `nightVision.ts`'s lit-colour path with a `TRUE_COLOR_SCALE` row
  (grey, grey, grey, strength) over `BLIND_KEYS`, in place of the DOM overlay. Test: at t=0 of level 3 the row is
  (0.75, 0.75, 0.75, 60).
- **Owed evidence**: a PCSX2 frame 1 s into a level-3 flash on Frostfire, to confirm the look. RDRAM `0x4b4d30..3c`
  should read (0.75, 0.75, 0.75, 60.5).

---

## 4. Unresolved, with the search record and what settles each

- **C4_REACH_READING** (`body+0x208 < 396`):
  - Searched: `scan_store.py 0x208` over both code segments (every `sw/swc1/sd/sq/sqc2` with that immediate);
    `scan_addiu.py 0x208` (address-of); readers grep. The only seal-body store is the init 100000.0 (0x5542f8,
    `FUN_00553ea0` D:L419564).
  - Captures: `spawn_pcsx2`, `postload_pcsx2`, `frostA/B_probe600` all read 100000.0.
  - 396 is about 19.9^2, which suggests a squared distance written through another base register.
  - Owed: a PCSX2 write breakpoint on `body+0x208` (body = `*(0x440c38)`) while walking up to a C4 target on a
    demolition map. Then read the writer's PC.
- **ARC_DEPTH_TEST_PLACEHOLDER**:
  - Searched: `FUN_003373b0` only queues the arc's segments (four vectors plus depth `FUN_00290aa0`) into 0x488df8 via
    `FUN_00336f60`. The list's draw callback goes through `puVar1[8]+0xc` (D:L235435), not resolved.
  - Owed: a GS dump of a frame with the arc over terrain (`tools_py/gsdump_extract.py`); read the line prims' `TEST_1`
    ZTE/ZTST.
- **HUD_ROUND_MODE_COUNT_READING**, **PLACE_CAST_LIFT_READING / PLACE_REST_LIFT_READING**, **SCORCH_PROBE /
  SCORCH_PARTIAL_ORDER**: not attempted this round. The levers are the functions the notes name (`FUN_00237760` with
  the redirect; `FUN_005c2430`'s column and `FUN_005bc730`'s placement height; `FUN_0031df50`/`FUN_002d4c20`,
  `FUN_003b3800` 306401-306417).
- **THERMAL_LENS_FX_READING**: the handlers are now named (`IRIS_EFFECT` `FUN_00264610`, `CAMERA` `FUN_00266320`,
  `BLUR3D` `FUN_00264a40`, `TRUE_COLOR_SCALE` `FUN_002642f0`). Decoding them is the next step; the blind work above
  gives `TRUE_COLOR_SCALE`'s semantics.
- **RING_VOLUME_READING, SOUND_PRIORITY_SLOT_READING** (C7's lane), **SPECIAL_GLYPH_PLACEMENT_READING** (needs the dead
  player's prompt on a console frame), **UI_MODEL_FORM_READING** (C4's lane): not attempted.

## 5. NOT-A-GAP rows (brief)

- **Retired in the notes**: ARROW_ORIENT, CARD_TEXT_OFFSET, DRAW_ORDER, GLYPH, PAD_GLYPH, PUMP_BLOCKS_FIRE,
  RECOIL_PLACEHOLDER.
- **Viewer bounds or fallbacks only**: CANDIDATE_MAX, MARK_CLIP_MAX_TRIANGLES, MUZZLE, HAND_PLACEHOLDER. EXPLOSION,
  SMOKE and SMOKE_ALWAYS are drawn only for a map without effect data; the real source is `PARTICLE_SOURCE` (cmd 27,
  `FUN_00266830`, research 89 §3).
- **PC adaptations or owner's choice on code already read**: LOOK_JUMP (the game has no such gate; the hook and the
  respawn need one), MENU_KEYS, WEAPON_SELECT_KEY/TOUCH/MENU_KEYS, INGAME_AUTOFILL_SIDE. WEAPON_SELECT_SOUND is
  research 94's grep, not re-run here.

## 6. Extra items found on the way

### 6.1 X1 -- `accuracy.ts` `TICK = 1/60` (unnamed)
- **What it stands for**: the tick the bloom runs at.
- **What I did**: `FUN_005c2670` runs once per kit tick (`FUN_005c0fd0` D:L476543), i.e. once per game frame. It adds
  `FUN_003c60c0` (`TargetDilateUponMovement`) per call (D:L477359-477363) and subtracts the constrict `x dt`
  (D:L477366).
- **Answer**: with the frame at 30 Hz (`DAT_003e1400` = 30, checked; C2 §0), the port's 60 Hz ticks open the bloom
  twice as fast as the game. The header's "158.7 = 5.29 x 30" already assumes 30. STRONG.
- **Implementation suggestion**: `TICK = 1/30`. Re-run research 84's bloom tests; the constrict (per second) does not
  move.

### 6.2 X2 -- `CLAYMORE_RULES.maxSpeed` 3.2 (unnamed, `scene/projectile.ts:189`)
- **What I did**: the claymore test (D:L475310-475320) reads `+0xf88` only when bit 7 of `+0x105e` is set.
  `FUN_005b52b0` writes `+0xf88` as the water depth and sets bit 7 in water (see LAUNCHER_BODY).
- **Answer**: the claymore is refused when wading deeper than 3.2 u (10 x 0.32), never for moving. The port's
  `server/room.ts:1762` and `grenade.ts:898` refuse a moving SEAL, which the game does not. PROVEN.
- **Implementation suggestion**: rename to `maxWaterDepth`, test on depth, and drop the speed refusal.
- **Ported** 2026-10-05 (web sprint 26 PF-13; research 210 s9): `CLAYMORE_RULES.maxWaterDepth`, `wadingDepth`, page
  and room, the PMN too.

### 6.3 X3 -- `C4_STILL_READING` (C1 row; also `equipment.ts:149`)
- **What I did**: `body+0xe84` is `kit+0x8a4` (kit = body+0x5e0). `FUN_005be6f0` (D:L475130-475197) resets it to 0.2
  when the aimed object `body+0x3dc` changes, is not plantable (`+0x94` vtable +0x10), or has moved. Otherwise it counts
  it down by dt. The dumps read 0.2.
- **Answer**: the C4 needs the reticle to rest on the same valid target for 0.2 s. "The SEAL still" is not the rule.
  STRONG.
- **Implementation suggestion**: `c4Ready = aimTargetStableSeconds >= 0.2`.
- **Ported** 2026-10-05 (web sprint 26 PF-13; research 210 s9): `C4_AIM_SETTLE_S`, `C4Settle`, `c4PlantAllowed`;
  `C4_STILL_READING` retired.

### 6.4 X4 -- `FLIGHT_TICK_READING` (C1 row; `grenade.ts:53`)
- **Answer**: the projectile steps on the frame's dt, and the frame is 30 Hz. The fixed step should be 1/30
  (measured dt 0.0334) if the port wants the game's integration and its collision sampling. STRONG.

## 7. Sourced but not implemented (multiplayer-relevant)

- A remote player's rocket replica starts at rest (ROCKET above). It matters only if clients ever simulate others'
  rockets.
- Wading rules: no launcher above 8.5 u of water, no claymore above 3.2 u, and the crouch-entry test (the same 8.5).
- The C4's 0.2 s aim-settle timer (X3) and its 1.098 s plant (`Put on wall`).
- The backblast cone follows the body, not the aim (BACKBLAST_CONE_AXIS).
- The flashbang is a lit-colour wash (`TRUE_COLOR_SCALE`), applied per client.
- Only locally owned PMNs are tested on each machine, against every body ticked there.

## 8. Leads for other workstreams

- **C2**: the crouch-entry test `FUN_00581990` (D:L442524-442560) refuses crouching when wading above 8.5 u, and
  another stance test, `FUN_00581660` (D:L442447), uses the same wading depth at 2.0 u (which stance change it gates
  was not read). `+0xf88`/bit 7 is the water model (`FUN_005b52b0`).
- **C1**: X3 and X4 are your rows; the claymore's moving refusal at `room.ts:1762` should be a water-depth refusal.
  `body+0xe84` ≡ `kit+0x8a4`.
- **C7**: `TRUE_COLOR_SCALE` (36) and `BLUR3D` (33) are the blind's commands; RING_VOLUME's bus lowering is still
  open.
- **Everyone using zAnim command numbers**: the set-0 index is `line - 106864` in `FUN_0025bc20` (`constants.py`).
  Research 85's "particle command (set 0, 0x27)" does not match that table (39 is `WHILE`), so its set or number needs
  re-checking.
- **Harry62 tables**: his `PlayerObject` offsets did not match the seal body's fields used here (`+0x208`, `+0xe84`).
  It is likely a different object (the player record), so cross-check before using it for body reads.

## 9. Verification (V1, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V1-verify-core-combat.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V1/`). V1 verified C1, C2 and C3. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V1, 2026-10-04. Read-only. Every claim was re-derived from the primary sources: the r0001 decomp
(`socom2_game.elf.decomp.c`, `D:L<line>`), the r0001 ELF (`game/disc/socom2_game.elf`), the r0004 ELF
(`game/overlays_r0004/socom2_game_r0004.elf`), the disc (`game/disc/RUN/`), the RDRAM dumps (`logs/parity/`) and the
SOCOM 1 demo's `.symtab`. Where I could, I used a second route: my own ELF reader, disassembly instead of the decomp,
and the RDRAM dumps instead of the parser. Scripts and outputs are in `scratch/V1/` (see its README).

**Which ELF the decomp is.** The disc ELF and `game/overlays/socom2_game.elf` are byte-identical (md5 a6259bee...).
The decomp's `FUN_003aff30` matches the disc ELF instruction for instruction (`vdis.py 3aff30`). Every RDRAM dump in
`logs/parity/` carries the same code bytes at 0x3aff30 (`rd_frame.out`: "code_r0001" for all 25 dumps). So the decomp
addresses, the ELF and the dumps all share one address space: r0001.

### 9.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 9 | C4 plant 1.098 s; readiness = 0.2 s aim rest; `+0xf88` = water depth (claymore > 3.2, launcher > 8.5 refused) | **CONFIRMED-WITH-CORRECTION** | All the values hold. Two additions: the same 3.2 depth refusal also guards item 0x9e (D:L475338-475350), not only the claymore 0x99. The 0.2 s timer also resets when the target object **moves**; the SEAL's own motion is not tested. |
| 10 | no grenade spin; flash = `c x 0.75 + 60` wash; backblast at muzzle, cone behind body | **CONFIRMED** | `FUN_003cabe0` never rotates category 0x79. The flash's lit-colour scale is `c x rgb + w`, with w + 0.5 (60.5). The 9-unit point (`sp+0xf0`) is never read. A side finding: the backblast does **no damage offline** (`DAT_0045a0c1 == 0` gives 0). |

### 9.2 Claim 9: C3: C4 plant, readiness, water depth

- **The plant.**
  - D:L475420-475452: action 0x3e; trigger `+0x60 = 0x3ee66666` (0.45); callback `+0x64 = LAB_005bfe40`, which
    zeroes `*a1`; `+0x68 = &kit+0x87c`, which is set to 99.0.
  - The kit tick (D:L476883-476901) places the C4 when `+0x87c <= 0`. So the plant lands at phase 0.45.
  - The phase advance `FUN_0028c4f0` (D:L134236-134275) is `dt x w / (clip+0x10 x FUN_0028ada0)`, where
    `FUN_0028ada0` = (n-1)/n (D:L133345-133363).
  - The ELF table at 0x661060[0x3e] = "Put on wall" (`elfv.py`).
  - `motion.rdr` gives `seal_put_onwall` playback 2.5. `clip_frames.ts` re-run gives 42 frames.
  - So 0.45 x 2.5 x 41/42 = **1.098 s**. Confirmed, STRONG: the action's speed weights are taken as 1, as in research
    85.
- **Readiness.** `FUN_005be6f0` (D:L475130-475197):
  - The timer `+0x8a4` is set to 0.2 (0x3e4ccccd) when there is no target, a different target, a target that is not
    plantable (vtable +0x10), or **a target that has moved** (its position delta is non-zero).
  - Otherwise it counts down by dt.
  - The target is controller `+0x3dc`, written by `FUN_005aa6e0` (D:L464262-464286) from the aim ray, after the
    accuracy jitter.

  "The crosshair rests 0.2 s on the same, still, plantable object" is right, and the SEAL's own motion is not
  tested.
- **Depth.**
  - `FUN_005b52b0` writes `+0xf88 = surface - (feet + bbox)` (D:L469852).
  - The launcher test `FUN_005857e0` (D:L444354) refuses above 8.5 when bit 7 of `+0x105e` is set.
  - The claymore (0x99) refuses above `DAT_003dfe10 x 0.32`, where `DAT_003dfe10` = 10.0 in both the ELF and the dump.
    That is 3.2 (D:L475310-475320).
  - **Addition:** the identical 3.2 test guards item **0x9e** at D:L475338-475350. The port names 0x9e a mine
    (`projectile.ts` L669). C3 mentions only the claymore.
  - Other depth gates exist at 2.0 (D:L442448, 443864, 443991, 444028) and 1.5 (D:L443387). They belong to C2's
    stance and action rules.

**Verdict: CONFIRMED-WITH-CORRECTION** (additions only: item 0x9e, and the target-moved reset).

### 9.3 Claim 10: C3: spin, flash, backblast

- **Spin.**
  - `FUN_003cabe0` (D:L320444-320561) calls `FUN_00315820` (set rotation) only for categories 0xab / 0xb9 / 0xe6 or a
    bullet, and in the bullet-tracer branch.
  - My caller scan (`callers_rotation.out`) finds one other projectile-side rotation writer, `FUN_003c5310`
    D:L316854. It runs only when the projectile is attached to a node (`+200` != 0) and copies the node's matrix. That
    is a stuck object, not a flight tumble.
  - So hand grenades (0x79) keep their release orientation. Confirmed, STRONG.
- **Flash.**
  - D:L106900 registers `FUN_002642f0` under the ELF string 0x3ecf30 = `TRUE_COLOR_SCALE`. 106900 = 106864 + 0x24.
  - The combine (D:L308514-308527) multiplies the rows' rgb and sums their w, **+ 0.5**.
  - `FUN_003b5a10` / `FUN_003b59a0` (D:L307585-307634) apply `vmul` then `vaddbc` (w broadcast): `c' = c x rgb + w`.
  - With the `blindplayer` keys (grey 0.75, strength 60) that is `c x 0.75 + 60.5`. Confirmed, STRONG for the
    mechanism. The look needs a frame, as C3 owes.
- **Backblast origin.** `vdis.py 3d2d70`:
  - 0x3d2e9c-0x3d2ea8 builds `$s3 + 9 x dir` into `sp+0xf0`.
  - The spawn call at 0x3d2fb0 passes `a3 = $s3` (the muzzle; `$s3 = a3` from 0x3d2da4, never rewritten).
  - No later instruction reads `0xf0($sp)` (`dis_3d2d70.txt`). PROVEN.
- **The cone.**
  - D:L320709-320714: for 0x9f with an owner, the model rotation is set from the owner node (`FUN_003156a0` →
    `FUN_00315760`).
  - `GetDamage` 0x9f (D:L318784-318826) rotates (0,0,1) by the model's matrix, with a half-angle 0x3f490fdb (pi/4).
    STRONG, as C3 graded.
- **Side finding:** the same block starts `if (DAT_0045a0c1 == 0) fVar9 = 0.0`. The **backblast deals no damage
  offline**, only online. This matters for any offline mode in the port.

**Verdict: CONFIRMED.**

### 9.4 Things to carry forward (items 5, 6 of the verifier's list)

5. **C3:** the 3.2 depth refusal also covers item 0x9e. The C4 settle resets when the target moves.
6. **New, for whoever owns the backblast:** it is online-only damage (`DAT_0045a0c1` gate, D:L318785-318787).
