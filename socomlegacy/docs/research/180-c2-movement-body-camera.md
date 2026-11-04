# 180 -- C2 -- movement, stances, traversal, the body's animation and blending, camera and look

- Research date: 2026-10-04 (research wave 1; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/C2-movement-body-camera.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V1 (`research-wave-2026-10-04/V1-verify-core-combat.md`) has landed and is folded in as §8.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WEBISSUES`/`$NPX_TSX`; the archive's absolute root is dropped; references to the other reports are links to their notes. The substance is verbatim.

**Overridden in part (research 206 §1):** the wall probes are horizontal; the step height is 6.5 -- the prone probe tilts with the body on a slope; the step height is 4.0 in the ELF and 6.5 from the title screen on (written at boot) (V1 #3, §8.4).

Research agent C2, wave 2026-10-04. Read-only. Every value below names its source in the original: `D:L<line>` is a line
of `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001), `.data` reads are from
`C:/Projects/socom_pc/game/disc/socom2_game.elf`, captures from `C:/Projects/socom_pc/logs/parity/`. Scripts live in
`scratch/C2/` (see its `README.md`); `sh scratch/C2/show.sh FROM-TO` re-prints any cited decomp range with the function
that holds it. `$PORT` = the `agent/online` snapshot named in the brief.

## 7. Summary

Counts (59 ledger rows): **RESOLVED 19, PARTIAL 5, UNRESOLVED 23, NOT-A-GAP 12** (detail in `ledger-C2.tsv`).

### 7.1 The 18 named stand-ins

| item | status | grade | one-line answer |
|---|---|---|---|
| `RAMP_PER_SECOND_READING` | RESOLVED | PROVEN | The game frame is 30 Hz, not 60 (dt measured, 525/15734 s). The ramp is 0.0518 a frame, which is **1.553 a second** (the code has 2.334). A full push is reached in 0.42 s, not 0.28 s. |
| `PRONE_ROOT_READING` | RESOLVED | PROVEN | **2.1680** (555/256): `seal_prone`'s `skel_root` y. The camera's ramp floor 2.169155 was cut for it. |
| `HEAD_HEIGHT_READING` | RESOLVED | STRONG | The view-from-the-head eye is the **posed skel_root + (0, 4.4, -2.5)** (`FUN_0029ae50`). That gives 15.88 standing and 9.90 crouched, not 18.3 / 11.1. |
| `PRONE_HEIGHT_READING` | RESOLVED | STRONG | No single "prone top" exists. Prone eye = root + (max(6p,0)+1.8)·2/max(n_y,.5) = **5.77** on flat ground, 4.9 ahead. The prone wall probe sits at 3.0 with radius 8. The highest joint of the posed body is 3.89. |
| `HEADROOM_FROM_READING` | RESOLVED | STRONG | The ray foot is the **hips** node (`actor+0x304`, proven by the constructor) + 2. Crouch idle gives **7.504** (14 in the code). |
| `CROUCH_TOP_READING` | RESOLVED (re-framed) | STRONG | The original has no wall column top. Wall probes are horizontal segments at feet + `step_height` 6.5 (stand and crouch). The crouch size class is (3.5, 15.0). |
| `PRONE_TOP_READING` | RESOLVED (re-framed) | STRONG | Prone size class is (radius 8.0, height 6.0). Wall probes are at feet + 6.0 × 0.5 = **3.0**. |
| `DEAD_LOOK_READING` | RESOLVED | STRONG | Confirmed with a better citation. In state 8, `FUN_00551ec0` takes the dead branch and never copies the controller's turn into `actor+0x23c`. |
| `LANDING_HIT_DRAW_READING` | RESOLVED | PROVEN | The coin is newlib `rand()` on each console, so the original has no shared draw. **Correction:** a corpse never draws. Body bit `+0xe1` bit 4 clear forces class 3, `Land forward`, where the port uses `Hit`. |
| `DEATH_LANDING_GETUP_PLACEHOLDER` | NOT-A-GAP | PROVEN | This is the page's free walk only; the original always dies there. Same corpse correction as above. |
| `STANCE_HOLD_S_PLACEHOLDER` | NOT-A-GAP (ruled R5) | PROVEN rule | The game's rule is the peak Triangle pressure. Under 0.3 it toggles when the pressure falls; 0.3 or more goes prone at once (D:L453331-453425). |
| `ROOT_RATE_READING` | NOT-A-GAP (fallback) | PROVEN option | Used only when no clips are loaded. If kept, take `seal_stand2crouch` (0.9 s, root 11.52 → 5.50). |
| `AIM_WEIGHT_PLACEHOLDER` | NOT-A-GAP | BELIEVED | A fallback that play never reaches (research 101 §5). The game's weight is `FUN_00286b80(actor+0x1160)`. |
| `PEEK_STANCE_ENDS_PEEK_READING` | PARTIAL | STRONG | The press pops the peek, but **no transition plays**: none of the three stance functions has a case for state 3. The port plays one. |
| `PEEK_HOLD_CONTINUES_READING` | PARTIAL | RETRACTED 2026-10-05 (PF-20's review; was STRONG) | The pop at D:L462925 needs `cVar1 == cVar7`, and `FUN_0057dc20` never returns 3, so a still reload is pushed OVER the held peek (state 3 kept); it does **not** end it. The earlier reading ("pops the stack to the base, which ends the peek") was wrong. The port keeps the peek. **Retracted 2026-10-05 (PF-20's review, §1.13):** no pop in state 3; the port's keeping the peek is the original's. |
| `PEEK_CUTS_ACTION_READING` | PARTIAL | BELIEVED | The lean is pushed over the action and does not pop it (the lean types are not in `FUN_00588bc0`'s pop list). The port ends the action. |
| `BINOCULAR_LOWER_READING` | PARTIAL | BELIEVED | The binocular call is still not found. The game's own item lowering (the launcher) replays the raise backwards, which supports 'reversed'. |
| `BINOCULAR_BODY_READING` | UNRESOLVED | -- | Searched for anim ids 0x38-0x3a and 0x7e-0x80; no push site. |

### 7.2 Unnamed and note-only items (grouped; one row each in the ledger)

| item | status | grade | one-line answer |
|---|---|---|---|
| U1 the 60 Hz game tick (`mover.ts` `TICK`, research 71 §1.5) | RESOLVED | PROVEN | One `CCoreState::Tick(dt)` a frame with the measured dt. The cap is 30 fps (`DAT_003e1400` = 30 in `.data` and in the PCSX2 dumps; dt 0.03337 captured). |
| U2 the camera pass's 0.03 "a 60 Hz tick" (`playerCamera.ts:93`) | RESOLVED | PROVEN | It is 0.03 a **30 Hz** frame: a time constant of 1.09 s, not 0.55 s. |
| U3 the pass's lost scale "0.75 is the reading" (`playerCamera.ts:71`) | RESOLVED | PROVEN | 0.75: `lui $v0,0x3f40` → `$f12` at 0x29cab0, which the `jal 0x309180` at 0x29cac8 uses. |
| U4 the shake's `decr` × dt × 60 (`look.ts:341,385`) | RESOLVED | PROVEN (frame) | It is a per-frame step at 30 Hz, so the factor is dt × 30. |
| U5 `MOTION_BLEND` W2.R2 (`scene/motion.ts:32`) | RESOLVED | STRONG | Translations lerp (×1/256) and rotations use `CQuat_Slerp` (shortest arc, nlerp above dot 0.95). A key is held when t < 0.01 or t > 0.99. This applies only while body `+0xe0` bit 3 is set; otherwise the nearest key is used. |
| U6 ITOF15 against 1/32767 (R77 §10) | RESOLVED | PROVEN | `vitof15` = /32768 (D:L132428-132493). |
| U7 the grid's diamond label (`scene/grid.ts:335`) | RESOLVED | PROVEN | `|dx| + |dz|`: `FUN_002d7030` D:L177434-177436, with `FUN_00191428` = abs. |
| U8 the ripples' / overlay's `actor+0xe1` bit 4 (R86 §7.2; `OVERLAY_BODY_FLAG_READING` R150) | RESOLVED | STRONG | **Alive.** The node constructor sets it (D:L145030) and the death `FUN_00547af0` clears it (D:L413024 → `FUN_0029e8b0`). |
| U9 the Triangle's pressure (R86 §7.2) | RESOLVED | PROVEN | See `STANCE_HOLD_S_PLACEHOLDER`. |
| U10 the crouch/prone scope eye 11.1 / 1.7 (`cameraRig.ts:110`) | RESOLVED | STRONG | 9.90 crouched; prone by the formula above. |
| U11 the class compare's body (`physics.ts:251`) | RESOLVED (elsewhere) | -- | `FUN_005ac1f0`, already read by research 151 §2.2. |
| U12 the grid ×10 / landing rates as readings (`physics.ts:24,39,41`) | NOT-A-GAP | STRONG | The PCSX2 dump holds `DAT_0044c26c` = 6.5 and `DAT_0044c260` = 115, the scaled numbers the port uses. |
| U13 `KNOCK_LANDING_GATE_READING` (R151) | PARTIAL | BELIEVED | The only setter found is `FUN_005594b0` (vtable at 0x669268), on event 0 in a network game (D:L422309-422314). |
| others (`segment.ts`, `tuning.ts` camera_roll, `cameraParams` fog, `clipPath` fallback, `reloadClip` family gate, `GroundWish` boost, R149) | NOT-A-GAP | -- | Fallbacks, ruled items, the page's own, or no gap in C2's area. |
| the rest (R77 flags and pad lane, the head f32s, playback, R78 colour lane, matrix_id, lids, R80 switch blend, swap gates, head look, rotator clamp, eyes, the zoom readings A31-A34, the crouch diagonal A5, the slope slide A6, min_jump_height, ladder 7.59, `+0x45` camera blend, peek "180", weaponPose / weaponRaise / throwPose / animator readings, posture 6, the bob sign A29, the console runs research 88 §5 owes) | UNRESOLVED | -- | Not settled this wave. Search record and leads are in each ledger row and in "Leads" below. |

---

## 0. The one finding that moves the most: the game frame is 30 Hz, with a measured dt

**What the port assumes.** `mover.ts:17,130-131`: "`CGame::Tick` (`FUN_001E7040`) runs the game at 60 Hz (research 71
§1.5)", `TICK = 1/60`. The same 60 Hz is behind the look's ramp, the camera pass, the shake, the room and the
accuracy ticks (see the grep in `scratch/C2`: `look.ts:115,385`, `camera.ts:75`, `accuracy.ts:33`, `grenade.ts:53`,
`room.ts:304,1041`, `net/protocol.ts:145`).

**What the original does.**
- `FUN_001e7040` (D:L47855-47878) is the main loop. It runs the current core state's vtable `+0x1c`, Tick, with
  `DAT_004a449c` forever: **one tick per video frame**, with no fixed sub-step.
- `DAT_004a449c` is written once per frame by `zVid_Swap` (`FUN_003aff30`, D:L304731-304768; name from
  `recomp/socom2_names.csv`, callgraph 0.80): timer 0's count × `DAT_0049e2d8`.
- Before measuring, the swap waits vertical blanks while `elapsed + 1/60 < 1/DAT_003e1400` (D:L304746-304749).
- `DAT_003e1400` is the frame-rate cap. reCOM names its setter `CVideo::MaxFrameRate(s32)`: `FUN_003b17d0`
  (D:L305431-305441) maps 60 to -1 (uncapped). The core state's init restores `CVideo::m_defaultFrameRate` =
  `DAT_003e13f8` (`FUN_001ec480`, D:L50954; reCOM `st_core.cpp:51`).
- **`.data`:** `python scratch/C2/elfread.py 3e13f8` → `0x0000001e int=30`; `elfread.py 3e1400` → 30.
- **Captures** (`scratch/C2/rdram.py`):

  | dump | `DAT_003e1400` | `DAT_004a449c` (dt) | `DAT_004a4498` (fps) |
  |---|---|---|---|
  | `spawn_pcsx2.rdram` | 30 | **0.03336723** | **30** |
  | `postload_pcsx2.rdram` | 30 | 0.03336723 | 30 |
  | `frostA_probe600.rdram` | 30 | 0.03330367 | 30 |
  | `frostB_probe600.rdram` | 30 | 0.03330367 | 30 |

  0.03336723 = 525/15734: two NTSC fields of H-blanks over the game's integer H-blank rate. The UI lane reached the
  same frame in `packages/ui/src/clock/uiClock.ts` (research 110), but the walk never took it.
- KNOWN.md row 134 says the same in passing: "The game targets 30 fps (two VBlanks)".

**Grade: PROVEN.** Three lines agree: the code (`.data` cap 30 and the flip's wait), the measured dt in four PCSX2
captures, and the UI lane's independent read. A slow frame stretches dt (three fields: 0.05 s); it does not double the
tick.

**What moves with it** (each a separate change; tests first):
1. The look's ramp (`RAMP_PER_SECOND_READING`, below).
2. The camera pass's out-easing: `DAT_003de270` = 0.03 per frame, so 1.09 s rather than 0.55 s. `derived.py`:
   "time constant 1.094 s, 95 % in 3.28 s" at 30 against "0.547 s, 1.64 s" at 60.
3. The shake's per-frame fall (`look.ts:385` `frames = dt * 60` → `dt * 30`).
4. Every "per tick" constant elsewhere. These belong to C1 and C3: `accuracy.ts` `TICK` (`TargetDilateUponMovement`
   per tick), `FLIGHT_TICK_READING`, the room's 60 Hz step.
5. **Discrete integrations change too.** The running jump's top with the port's own order (v then y) is 12.92 at 1/60
   but **12.27** at 525/15734 (`derived.py`, last lines). Whether the game integrates v then y or y then v (14.93 at
   30 Hz) is not read. That is a lead, not a claim: `FUN_0059b440`'s order settles it.

**Implementation suggestion.**
- Make the mover's and the look's step the game frame: `GAME_FRAME_DT = 525/15734`, shared with `uiClock.ts`'s
  `GAME_FRAME_DT_SECONDS`.
- Keep the net protocol's 60 Hz command cadence only if C1 rules it a transport choice. The simulation constants must
  then be applied per 1/30 s of game time, not per command.
- Test first: a `look.test.ts` case "a flick to full push reaches 0.65 in 13 game frames (0.42 s)", and a
  `playerCamera.test.ts` case "the pass eases out 3 % per 1/30 s".

---

## 1. Named stand-ins

### 1.1 `RAMP_PER_SECOND_READING` (`$PORT/packages/viewer/src/look.ts:115`)
- **Stands for:** the look ramp's growth per second.
- **Current value:** `60 × rampStep(1/60)` = 2.334.
- **Prior search:** research 83 §8.1 — "open: the console's frame rate is not measured here".
- **What I did:**
  - Read the ramp: `FUN_002da930` D:L179774-179776, `fVar16 = dt + (1-dt)·(1-(s·0.13+0.87))`, ÷ (s+0.5) when s > 0.5.
  - Followed its dt: `FUN_002d9e40(param_1)` ← `CCoreState_Tick` `FUN_001ebed0` (D:L50795) ← the main loop with
    `DAT_004a449c` (D:L47874).
  - Read the frame (§0).
  - `python scratch/C2/derived.py` → "ramp game 525/15734: 0.05183 a frame, 1.5532 a second, full 0.65 in 12.5
    frames = 0.418 s".
- **The setting s = 0.75 and the curve are verified on the capture** (C5b's lead, re-read here).
  `python scratch/C2/padrec.py` on `spawn_pcsx2.rdram`, pad record 0x849e90 →

  | field | value |
  |---|---|
  | dead zone `+0x2b0` | 0.3 |
  | k `+0x2b8` | 0.65 |
  | n `+0x2bc` | 3 |
  | ramp s `+0x2cc` | 0.75 |
  | rescale, circle, ramp on, curve x and y (`+0x2c8/2c9/2ca/2d0/2d1`) | 1 |

  These are `FUN_002da6c0`'s preset 0 (D:L179394-179403), chosen by the `stick_preset` valve (D:L125077-125078,
  D:L125202-125203); presets 1 and 2 are at D:L179404-179417. The port's `RIGHT_STICK` holds exactly these, so only
  the frame is wrong. The port offers no stick-preset option (ruling B6: a controller always takes the game's
  curve), which is preset 0, the game's default.
- **Answer:** 0.05183 a frame at the game's frame, **1.5532 a second**; a full push takes 0.42 s. **PROVEN**: the
  formula's dt operand is the measured frame (§0), and its setting is read from the capture.
- **Implementation:**
  - `RAMP_PER_SECOND_READING` → `RAMP_PER_SECOND = rampStep(GAME_FRAME_DT) / GAME_FRAME_DT` (1.5532).
  - Or step `LookLaw.frame` once per game frame with `rampStep(dt)` itself, as the game does.
  - Update research 83 §1's "0.28 s at 60 Hz".
  - Test: `look.test.ts` "0.65 reached after 13 frames of 525/15734 s".

### 1.2 `PRONE_ROOT_READING` (`mover.ts:177`, `STANCE.prone.rootY`)
- **Stands for:** the prone skeleton root's height.
- **Current value:** 1.8 (estimate).
- **Prior search:** "under the ramp's floor 2.169155 ... an estimate; W2.2c measures".
- **What I did:**
  - Ran `tsx scratch/C2/roots.ts` over `RUN/MOTION_P.ZAR`. It prints `seal_prone ... rootY key0 2.1680 min 2.1680 max
    2.1680`.
  - The same clip family gives the two values the port already measured from the console dump: `seal_stand` 11.4844
    (port 11.484) and `seal_crouch` 5.5039 (port 5.504). So "idle clip root = posed root" is checked on two stances.
  - `seal_fp_prone`, `seal_p_prone` and `seal_headlooks_prone` are also 2.1680.
  - `FUN_0029a950`'s ramp floor 2.169155 (D:L142412-142562, research 17 §3) sits 0.001 above it: the camera's lowest
    stance was cut for this root.
- **Answer:** **2.1680** (555/256). **PROVEN**: disc data, read by the port's own parser, with the convention checked
  against `spawn_pcsx2.rdram` on two stances.
- **Implementation:**
  - `PRONE_ROOT_READING` → `PRONE_ROOT = 555/256`.
  - Test: `mover.test.ts` asserts `rootY('prone') === 2.16796875` and that the camera fallback's prone target is
    `2.168 + ramp(2.168)` = 2.168 + 5.5 + 0.0017.

### 1.3 `HEAD_HEIGHT_READING` and `PRONE_HEIGHT_READING`'s eye use (`stature.ts:13-15`, `cameraRig.ts:109-116`)
- **Stands for:** the scope's and first person's eye over the feet.
- **Current value:** 18.3 standing; 11.1 crouched and 1.7 prone (top − 1.3).
- **Prior search:** research 84 L397-407 — "Which node `+0x2e8` is, and so the eye's height, was not read".
- **What I did:**
  - **Which node is `+0x2e8`.** The `CZSealBody` constructor `FUN_0028e7b0` sequence (D:L419606-419622) stores
    `FindPart(body, name)` into `param_1[0xba..]`, with `param_1` an `int*`. The names were read from `.data`
    (`scratch/C2`, inline python using `elfread`):

    | slot | offset | part |
    |---|---|---|
    | `[0xba]` | +0x2e8 | **skel_root** (0x65c4c0) |
    | `[0xbc]` | +0x2f0 | lfoot |
    | `[0xbd]` | +0x2f4 | rfoot |
    | `[0xbe]` | +0x2f8 | lhand |
    | `[0xbf]` | +0x2fc | spinelo |
    | `[0xc0]` | +0x300 | rhand |
    | `[0xc1]` | +0x304 | **hips** (0x65c4f8, 'hips') |
    | `[0xc2]` | +0x308 | head (0x65c500, 'head') |
    | `[0xc3]` | +0x30c | neck (0x65c508) |
    | ... | ... | the reCOM `zseal.h:535-559` order (`[0xbb]` = +0x2ec is not a part) |

  - The camera's node `cam+0xc8` is `actor+0x2e8` unless a name is passed: `FUN_002956e0` D:L139744-139753. The only
    named attach is `spinelo` (0x3efd98), in the death camera `FUN_002980d0` D:L141484.
  - `FUN_0029ae50` (D:L142565-142624; the first-person mode `FUN_00295b00` calls it at D:L139949):
    - eye = the node's posed position + (0, **4.4**, **−2.5**) standing and crouched; z 0 while `FUN_005a78d0` or
      `FUN_005a77e0(body,1,1,1)` answers.
    - Prone: y += (max(`cam[0xb4]+0x24` × 6, 0) + 1.8) × 2 / max(`body+0x1348`, 0.5), and z = max(`body+0x1348`,
      0.5) × 0.7 × −7.
    - `body+0x1348` is the ground normal's y (written from a ground hit's `+0x14`, D:L456532).
- **Answer** (`derived.py`), all **STRONG**: constant operands, with one interpretive step — that `FUN_00295b00` is
  the view the scope and first person use, which research 84/86 name and research 17 found off the third-person path.
  - Standing (`seal_stand` root 11.4844): **15.884**.
  - Crouched (`seal_crouch` 5.5039): **9.904**.
  - Prone on flat ground, level or downward look: **5.768**, and 4.9 ahead of the root (−z is forward).
  - In the `seal_fp_*` clips the standing root is 10.797, which gives 15.197. The eye follows the posed root.
- **Implementation:**
  - `scopeEyeHeight(stance)` → `posedRoot + 4.4` (stand, crouch), with z −2.5 ahead.
  - Prone: `posedRoot + (max(6·q.x, 0) + 1.8) · 2 / max(n_y, 0.5)`, z `−4.9 · max(n_y, .5)`. `q.x` is the look's
    pitch term (`cam+0xb4 +0x24`; its exact meaning is owed).
  - The port already has the posed root (`WalkMode.setPosedRoot`). `shotCone.ts:308` and `walk.ts:761` move with it:
    **this changes where a scoped round starts** (2.4 lower standing, 4 higher prone). Remote players see it, and it
    changes gameplay.
  - Test first: `cameraRig.test.ts` "the scope's eye is the root + 4.4: 15.884 standing at the stand idle".
- **Owed:** a PCSX2/recomp first-person frame standing and prone (PLAT-36). PINE-read `cam+0xd8` (the placed eye) in
  state 1 against the actor's `+0x1c..+0x24`.

### 1.4 `PRONE_HEIGHT_READING`'s other uses
`main.ts:1922` (the camera's stance limit), `hitVolumes.ts:170` (the placeholder volumes only) and `traversal.ts`
`BODY_TOP`. The original has no "prone height" value. What it has:
- The prone wall probe at feet + **3.0**, radius **8.0** (§1.6).
- The posed skeleton: `tsx scratch/C2/fk.ts seal_prone` → "top rshoulder_wgt 3.891 ... head 3.637". These are joint
  origins; the skinned mesh reaches higher.
- The posed hit capsules the server already builds from the skeleton (`skeletonVolumes`).
- **STRONG.** Suggest retiring the constant: placeholder volumes → `skeletonVolumes`; traversal `BODY_TOP.prone` → 6.0
  (the size class's height) with a citation to D:L415119-415122.

### 1.5 `HEADROOM_FROM_READING` (`mover.ts:340`)
- **Stands for:** the foot of `FUN_0057efe0`'s headroom ray.
- **Current value:** 14 (estimate).
- **Prior search:** "the node's height is not in hand".
- **What I did:**
  - `FUN_0057efe0` D:L441190-441245: from (0, `FUN_002869d0(node actor+0x304)`.y + 2, 0) in actor space up to (x,
    feet + 19) for mode 0 (stand up), or feet + **12** for mode 1 (prone → crouch).
  - `+0x304` = **hips** (§1.3, D:L419618-419619).
  - Hips heights from `fk.ts`: crouch idle 5.504, crouch walk 9.328, prone idle 2.168.
- **Answer:** foot = **posed hips y + 2** = **7.504** in the crouch idle (11.33 crouch-walking), 4.168 prone. **STRONG.**
- **Implementation:**
  - `HEADROOM_FROM_READING` → `posedHips + 2` (the animator's hips; fallback 7.504).
  - Add mode 1 (to 12) for prone → crouch (§5.2).
  - Test: a 10-unit roof over a crouched SEAL refuses the crouch-run's stand (the ray 7.5 → 19 hits); a 16-unit roof
    over a prone SEAL allows prone → crouch (the ray 4.17 → 12 is clear).

### 1.6 `CROUCH_TOP_READING` and `PRONE_TOP_READING` (`mover.ts:171,182`)
- **Stands for:** the port's body column top that walls must reach into.
- **Current value:** 14 crouched, 9 prone (estimates).
- **Prior search:** an estimate; desktop research 24 §2's column 6-20 is itself "[inference] ... the movement-collision
  routine is not decompiled".
- **What I did:** found the routine.
  - `FUN_0054aa30` (D:L414515-416190) builds the body's collision segments each tick and registers them with
    `FUN_0054f410` (D:L417251-417272: type-2 segment queries into `PTR_DAT_003de940`). `FUN_005483d0` resolves the
    contacts (D:L413380-413560).
  - The size class `FUN_0058a720(actor,1)` (the stance, adjusted during transitions; D:L446828-446870) picks
    (D:L415110-415133):

    | class | radius | height |
    |---|---|---|
    | stand / default | 3.5 | 19.1 |
    | crouch (1) | 3.5 | 15.0 |
    | prone (2, with `bVar5`) | 8.0 | 6.0 |

  - The segments reach `r × 1.4` ahead (D:L415166).
  - Their **height** is `DAT_0044c26c` (step_height, 6.5 in `spawn_pcsx2.rdram`), or height × 0.5 when `bVar5` (prone,
    or the actions 0x1a/0x1b/`DAT_003dec58`/`DAT_003decc0..d0`) (D:L415167, 415231-415233, applied at
    D:L415418-415419).
- **Answer:** the original does not test a column.
  - Standing and crouched it tests horizontal segments at **feet + 6.5**, radius 3.5.
  - Prone at **feet + 3.0**, radius 8.0.
  - 19.1 and 15.0 matter only when `bVar5` holds while standing or crouched.
  - **STRONG** for the constants (operands). **BELIEVED** that nothing else in the ~1,200 lines adds a vertical
    extent: the branches for state `+0x2b == 8` and `bVar6` (D:L415243-415340) cast posed-bone segments instead,
    spinelo → head+2.25, hands, feet.
- **Implementation:** this is gameplay-visible (what a crouched or prone SEAL can pass under, and how close prone gets
  to a wall).
  - Proposed: the column becomes a single probe height per class: `{stand: 6.5, crouch: 6.5, prone: 3.0}`, radius
    `{3.5, 3.5, 8.0}`.
  - Keep the headroom rules (§1.5, §5.2) for overheads.
  - Test first: a 10-high slot (a horizontal bar from 7 to 10 over the floor) blocks nothing at 6.5, is passed
    crouched, and stops a standing SEAL only if the owner rules to keep the port's column. **Owner call**: the
    original lets a standing SEAL walk under an overhang lower than his head; the camera hides it.
- **Owed:** the remaining branches of `FUN_0054aa30` read to the end, to confirm no second height is probed for the
  controlled player.

### 1.7 `DEAD_LOOK_READING` (`walk.ts:524`)
- **Stands for:** whether a dead player's stick turns the corpse.
- **Current value:** no.
- **Prior search:** "`FUN_00592560` reads the respawn press ... and runs no move or turn".
- **What I found:**
  - `FUN_00592560` **does** call `FUN_005966a0` (D:L451672), which writes the controller's move and turn
    (`ctrl[2..4]`) and the pitch (`FUN_00594600`).
  - The actor does not take them. `FUN_00551ec0` (D:L418511-418523): in state 8 (`(short)param_2[0x5d] == 8`) it runs
    the controller's `+0x14`, `FUN_005929a0` and the actor's `+0x8c`, and **skips** the branch whose
    `param_2[0x8f..0x91] = ctrl[4], ctrl[2], ctrl[3]` (D:L418611-418615) copies turn and move into
    `actor+0x23c/+0x240/+0x244`.
- **Answer:** the dead body neither turns nor moves; the port's reading holds. **STRONG.**
- **Implementation:** cite D:L418511-418523 / 418611-418615 in `walk.ts`; rename to `DEAD_LOOK` (retired).
- **Owed:** none for the turn. The pitch the dead controller writes feeds no view: the death camera (`FUN_00297a30`)
  takes over.

### 1.8 `LANDING_HIT_DRAW_READING` and `DEATH_LANDING_GETUP_PLACEHOLDER` (`mover.ts:712,724`)
- **The draw:**
  - The coin: `FUN_005af590` D:L466667-466669, `FUN_00197740() × 4.656613e-10 <= 0.5`.
  - `FUN_00197740` (D:L14524-14537) is newlib `rand()`: `recomp/socom2_names.csv` row 218
    `rand` (toml-stub 0.90), and its body is the 64-bit LCG `x·0x5851f42d4c957f2d + 1`, `>> 32 & 0x7fffffff`, from the
    reent struct.
  - **One global stream per console**, so the original never shares the coin between machines.
  - **PROVEN.** The port's seq hash is a necessary adaptation, not a stand-in for something the original has.
- **The corpse (a correction):**
  - D:L466658-466660: `if (((byte)body+0xe1 << 0x3b) >= 0) cVar1 = 3`, i.e. bit 4 **clear** forces class 3.
  - Bit 4 of `+0xe1` is **alive**: the node constructor sets it (`FUN_0029ee10` D:L145030), and the death
    `FUN_00547af0` clears it (D:L413024 → `FUN_0029e8b0` D:L144775).
  - Class 3 above `DAT_0044c260` (115 in the dump) pushes `lVar3 = 8` with `DAT_003deee8`. Its registration line
    D:L495332 names it **"Land forward"** (0x661fa8).
  - So a corpse's hard landing is always the death landing, never the coin and never `Hit`.
  - The port (`mover.ts:1651-1652`) gives a corpse `Hit`. **STRONG.**
  - Fix: `cls = this.dead_ ? 3 : landingClass(speed)` above the hard rate. The corpse needs no draw at all, which also
    removes review 3 A2's problem.
- **The get-up:** the original always kills in that landing (research 80 §6c, research 151 §2.5). The placeholder
  covers the free walk only, where nothing kills. **NOT-A-GAP** (the page's own mode); rename to `_PAGE_OWN` or keep
  with "no original counterpart".

### 1.9 `STANCE_HOLD_S_PLACEHOLDER` (`stanceButton.ts:15`)
- Owner-ruled (R5). The game's rule, read: D:L453331-453425.
  - The press's peak pressure `DAT_0066b410` is tracked (pad `+0x2c`, Triangle).
  - The decision is taken when the pressure first falls below the peak, or at once when it reaches 0.3.
  - Under 0.3, a stand/crouch toggle:
    - stand → crouch;
    - crouch → stand;
    - prone → stand, or crouch when `FUN_005857e0` answers.
  - 0.3 or more: prone (`FUN_0057e540`), when `FUN_00584b00` allows.
  - **PROVEN.** KNOWN.md row 124 agrees.
- Suggestion: when the browser reports an analog value for the stance button (`0 < GamepadButton.value < 1`), apply
  the game's 0.3 peak rule. Keep the owner's 0.4 s hold for digital buttons and `C`.

### 1.10 `ROOT_RATE_READING` (`playerCamera.ts:130`)
- A fallback, used only when no clips are on hand. The original eases nothing; the camera reads the posed root
  (`FUN_0029a950`).
- If the fallback stays, take the disc's transition:
  - `seal_stand2crouch`: 27 frames, 0.900 s, root 11.5156 → 5.5039, so (11.484 − 5.504)/0.9 = 6.64 units/s, not 29.9.
  - `seal_stand2prone` 1.2 s; `seal_crouch2prone` 1.1 s (`roots.ts`).
- **NOT-A-GAP** (fallback). PROVEN values if used.

### 1.11 `AIM_WEIGHT_PLACEHOLDER` (`animator.ts:349`)
Unreached in play: every mover gives `aimWeight`, the game's `FUN_00286b80(actor+0x1160)` (research 84 §11, research
101 §5). Not re-verified here. **NOT-A-GAP, BELIEVED.**

### 1.12 `PEEK_STANCE_ENDS_PEEK_READING` (`traversal.ts:170`)
- **What I did:** read the three press functions and their transition callees.
  - Prone press `FUN_00581660` D:L442436-442477.
  - Crouch press D:L442540-442575 → `FUN_005817d0` D:L442479-442524.
  - Stand press → `FUN_00581c10` D:L442605-442648.
  - Each pops the stack to depth 1, sets the peek byte `+0x375 = 2`, then calls the transition with the state taken
    **before** the pop (3).
  - The cases: `FUN_00581540` has 4/0/1, `FUN_005817d0` has 4/0/2, `FUN_00581c10` has 7/4/2/1. **None has 3.**
- **Answer:** the press ends the peek and plays **no transition**. The SEAL is left in the stance under the peek: the
  pop writes `+0x174` from the base entry (research 86 §4.1). **STRONG.** The port plays the stance's transition first.
- **A consequence to test:** with the d-pad still held, the next frame's gate (`FUN_005b4340`) re-peeks at once. In the
  original, a stance press while holding the peek flickers the lean rather than changing stance.
- **Implementation:** `PEEK_STANCE_ENDS_PEEK` = end the peek, no transition, stance unchanged.
- **Owed:** a capture of a prone press while holding the d-pad peek on PCSX2 (PINE poll `actor+0x174`, `+0x375` and the
  top anim id `actor+0x534` per frame).

### 1.13 `PEEK_HOLD_CONTINUES_READING` (`traversal.ts:157`)
- **What I found:** the still reload `FUN_005a82e0`.
  - D:L462925-462928: `if (still && cVar1 == cVar7) FUN_0058a4d0(actor, 0)` pops the stack to the base, then pushes
    the reload.
  - `cVar7` is `FUN_0057dc20`, the first entry whose posture is not 3 (research 150 §3.1), so a reload mid-peek pops
    the lean.
- **Answer:** a still reload **ends the peek**. **STRONG** for the pop.
- **Not read:** whether the reload clip's `NoInterrupt` then refuses the re-peek (`FUN_00587c20`) for its window, and
  whether the reload gate refuses state 3 before this. The lean's toss (research 86 §4.4) is pushed over the held lean
  and is unaffected.
- **Implementation:** a still reload while peeking ends the peek; test in `traversal.test.ts`.
- **Owed:** a capture of R pressed mid-peek, crouched.
- **Retracted 2026-10-05 by PF-20's review:** the pop does not happen mid-peek. `cVar1` is `+0x174` (3 while peeking)
  and `cVar7` (`FUN_0057dc20`, D:L440540) is the first posture down the stack that is **not** 3, so `cVar1 == cVar7` is
  false in state 3: no `FUN_0058a4d0`, and `FUN_00588bc0(actor, clip, cVar1, 0, 0)` pushes the reload over the lean in
  posture 3 -- the peek continues (research 217 §3.2). Not read: whether `FUN_00588bc0`'s mapped-type pops
  (D:L446070-446240) catch a reload's type.

### 1.14 `PEEK_CUTS_ACTION_READING` (`traversal.ts:148`)
- **What I found:**
  - The peek start `FUN_0057d810` (D:L440470-440525) pushes the lean pair with `FUN_00588bc0(actor, lean, stance, 1, 0)`
    then `(lean, 3, 0, 0)`. It pops only when "Jump" (`DAT_003deae8`) is on top (`FUN_0058a4d0`).
  - `FUN_00588bc0` pops only for the mapped types 0x11-0x13, 0x19, 0x1a, 0x21-0x24 and `DAT_003def50/60`
    (D:L446070-446240).
  - The lean ids are 0x1d-0x20 (the static anim table: `nametable.py 661000 661160 661060` gives 'Peek left' = 0x1d)
    and the prone leans `DAT_003deb00/08` = 0xe9/0xea (`animtype_rdram.py`). They are not in that list.
- **Answer:** the lean is pushed **over** the action; the action is not popped. It returns when the lean is popped
  (`FUN_0028da00` hands back the play). **BELIEVED**: the push semantics are read; the paused action's clock under the
  lean is not.
- **The port's divergence:** it ends the action. It has one action slot, so implementing the original needs a two-deep
  action stack.
- **Owed:** a capture of a peek started during a get-up.

### 1.15 `BINOCULAR_LOWER_READING`, `BINOCULAR_BODY_READING` (`binocularPose.ts:38,40`)
- **Search:**
  - The static anim-type table starts at 0x661060 (id 0 'Reference'; `scratch/C2/nametable.py`). It gives `Stand/Crouch/
    Prone -> Binocular` = ids **0x38/0x39/0x3a**, and the pistol's = **0x7e/0x7f/0x80** (`findptr.py 660830 ...` →
    table slots 0x661140-0x661148, 0x661258-0x661260).
  - No `FUN_00588bc0` / `FUN_00577e40` call takes those ids as literals (grep of every push's second argument in
    `scratch/C2`). The lines comparing `== 0x7e` (D:L479236, 479412) are in the round-leaving code, on another field.
  - The item-swap function `FUN_005a64c0`'s slot 4 is the **launcher**, not the binoculars: `DAT_003df0e0..f8` are
    registered at D:L495408-495411 as "Rifle -> Launcher", "Pistol -> Launcher", "moving_rifle_to_launcher",
    "moving_pistol_to_launcher".
- **The lead it gives:** the launcher's way down, `FUN_005a6b70` (D:L462043-462095), replays the raise **reversed**
  (`FUN_00588bc0(actor, "Rifle -> Launcher", 0, 1 /*reversed*/, 0)`) in one anim set, and plays a separate
  `moving_*_to_launcher` clip in the other. The game's own item lowering is a reversed raise. **BELIEVED** for 'reversed'.
- **Body:** UNRESOLVED.
- **Owed:**
  - The caller that maps the binoculars' item to 0x38+stance (search `FUN_0058c820`'s mapping table for 0x38).
  - A capture of R1/L1 binoculars raise and lower (PINE `actor+0x534` top id, `anim+0x180` second channel).

---

## 2. The body's animation (unnamed items)

### 2.1 The key blend, W2.R2 (`scene/motion.ts:32` `MOTION_BLEND`; research 77 §10 "blend or hold, and which slerp")
- **The call chain:**
  - The body pose `FUN_005777d0` (D:L437177-437300) samples each part.
  - When body `+0xe0` bit 3 is set (`bVar2` false, D:L437262): translations by `FUN_002898a0` — the lerp of the two
    keys' int16 × 1/256 (`0x3b800000`) by t (D:L132544-132612) — and rotations by `FUN_00289570` (D:L132414-132496).
  - Rotations: the nearer key when t < 0.01 or t > 0.99, else `CQuat_Slerp` `FUN_00306ae0`.
  - Otherwise both use the **nearest key** (`FUN_002897d0`, `FUN_00289470`, `t < 0.5`).
- **The slerp** (D:L205929-206000): shortest arc (negates the second quaternion when the dot is below 0), normalised
  lerp above dot 0.95, true slerp below.
- **The phase:** `FUN_0028d670` (D:L134879-134906) keeps `key = floor(t·n)` and the fraction. A one-shot's last pair is
  clamped by `+0x49` bit 6.
- **Who interpolates:** bit 3 comes from the per-frame animation LOD `FUN_00552850` (D:L418746-418864), run for the
  camera's body:
  - The local body gets 0x3d (always interpolated).
  - Another character gets bit 3 when `FUN_00315580(node, 2)` (in view) and `+0x265` bits 0-1 are clear, or always if
    `DAT_003df1b0` == 0. It is 1 in `.data` and in the dump.
  - Bit 0 by distance² < 6400 (80 units), or < 62500 when scoped.
  - Bits 4/5 for at most `DAT_0064fc70` = 3 characters within 500 units; bit 2 likewise (`DAT_0064fc78` = 3).
- **Answer:** the port's blend matches the interpolated mode, up to the 0.95 against 0.9995 nlerp threshold and the
  0.01/0.99 holds. **STRONG.**
- **Implementation:** rename `MOTION_BLEND` to sourced. Optionally add the 0.01/0.99 holds and the 0.95 threshold.
  Remote bodies out of view could take the nearest key; local-only, no gameplay effect.
- **Leads:** what bits 0, 2, 4 and 5 gate (likely IK, head-look and detail LODs).

### 2.2 ITOF15 (research 77 §10)
Rotation keys are converted by `vitof15` (D:L132428-132493), which is /32768. Translations use `vitof0` × 1/256.
**PROVEN** (the instruction). The port's 1/32767 differs by 3e-5 and is normalised away; change it to 1/32768 for
exactness.

### 2.3 The camera pass's minimum (`playerCamera.ts:71` "the scale is lost ... 0.75 is the reading")
`python scratch/C2/disasm.py 29bf70 29cbb0 | grep -B8 "jal 0x309180"`: at 0x29cab0 `lui $v0,0x3f40; mtc1 $v0,$f12`
(0.75), `c.olt.s $f0,$f12`, then at 0x29cac8 `jal 0x309180` with `$f12` unchanged. **PROVEN: 0.75.**

### 2.4 The grid's ordered-cell label (`scene/grid.ts:335`, "reCOM's reading, unchecked")
`FUN_002d7030` (D:L177397-177446) stores `abs(dx) + abs(dz)` (D:L177434-177436; `FUN_00191428` is abs). **PROVEN.**

---

## 3. Unresolved, with the search record

| item | searched | owed |
|---|---|---|
| R77: the head f32s +0x10/+0x14 (-1, 1); flag bits 0x04/0x08; the pad lane; `playback` beyond `seal_crouch_step` | Not attempted this wave. Lead: the samplers test the loaded track's byte `+8` bit 2 (constant rotation → key 0) and the `+8` int's bit 1 (constant translation) (D:L132428, 132510) -- the loader's patched flags, not the file's 0x10/0x20 | `CZSIObject_Read` 0x289380, `FUN_0028a100` |
| R78: data quadword 338 (unity colour), "lit", `matrix_id` 0x3fc2d0, the lids | not attempted (render; C9's lane) | a VU1 dump of a skinned draw |
| R80 §7: the weapon switch's blend, the swap's gates (`mover.ts:1006`), the head look's `FUN_005e0010` test, the rotator clamp `FUN_005ae040`, eyes/lids | not attempted | read `FUN_005e0010`, `FUN_005ae040`, the swap caller of `FUN_005a64c0` |
| zoom readings A31-A34 (`zoom.ts:181-193,364-365`) | not attempted | `FUN_005c4b10`, `FUN_005445b0` |
| A5 the crouch diagonal's 19.8 (`mover.ts:68`) | not attempted | console run (research 79's harness), now to be read at 30 Hz |
| A6 the steep-ground slide (`physics.ts:272`); `min_jump_height`'s use (`physics.ts:294`) | not attempted | `FUN_005b56c0`, readers of the table's `min_jump_height` slot |
| the ladder's 7.59 (R86 §7.2) | not attempted | console measure |
| `+0x45` camera blend and the -5/+5 nudge (`playerCamera.ts:27`); last frame's target z (`:211`) | not attempted | `FUN_00296f10` D:L140630-140830 |
| peek-top "180" instant (`traversal.ts:1039`) | the anim type exists ("180", 0.883 s per research 86 §7.2) | play it |
| `animator.ts:201,747`, `weaponPose.ts:43,108`, `weaponRaise.ts:40`, `throwPose.ts:16`, `mover.ts:127,1581,1598` | not attempted | as each comment names |
| `RELOAD_POSTURE_SIX_READING` (R150) | not attempted | `FUN_0057dc20` D:L440546-440556's sixth posture |
| `KNOCK_LANDING_GATE_READING` (R151) | the only setter of `+0x105c` bit 3 is `FUN_005594b0` (vtable slot at 0x669268, r0004 twin 0x55e7d0) on its event 0 in a network game (D:L422309-422314), after `FUN_00543480`; no `& 0xf7` clear found | the class of vtable 0x669268; a trace of a knock-down's landing |
| A29 the bob's sign | not attempted | `FUN_002c6110`/`FUN_002c6290` |
| research 88 §5's console runs (research 79's predictions, a timed jump/turn/camera, the W+D standing jump's 92) | -- | the captures as written there, read at the 30 Hz frame |
| `gamepad.ts` "assumed" bindings | not attempted | the packer D:L179819-179861 |

---

## 4. Sourced but not implemented (what remote players see, or what changes gameplay)

1. **The 30 Hz game frame** (§0). The port simulates and eases at 60 Hz everywhere but the UI.
2. **The stance-change gates** `FUN_00552ec0` (D:L418914-419025):
   - Prone from stand or crouch is refused when `FUN_0054d620(11.2, 8.0, step_height × 0.5 = 3.25)` finds an obstacle
     (then `FUN_005b0bb0(actor,0)`).
   - Crouch from stand or prone needs `FUN_0054d620(|v|·1.2` (prone `|v| + 0.5`), `7.0, 6.5·1.2 = 7.8)` clear.
   - Prone → crouch needs the headroom ray to feet + 12; crouch or prone → stand needs it to feet + 19 (§1.5).
   - The port gates none of these (no `FUN_00552ec0`/`FUN_0054d620` in `$PORT`).
3. **The body's wall probes per size class** (§1.6).
4. **A corpse's landing is `Land forward`** (§1.8).
5. **The view-from-the-head eye**, and with it the scoped shot's origin (§1.3).
6. **A stance press during a peek plays no transition; a still reload ends the peek; the peek is pushed over an
   action** (§1.12-1.14).
7. **Animation LOD**: out-of-view characters sample the nearest key (§2.1). Visual only.

## 5. Leads for other workstreams

- **C1 (match/server):** the room's 60 Hz step and the command cadence (§0). The corpse landing (§1.8) removes the
  corpse coin from the protocol. The stance gates (§4.2) need the room's mover too, since it is authoritative.
- **C3 (combat):** `accuracy.ts` `TICK = 1/60` ("per-tick terms are per 1/60 s") and `FLIGHT_TICK_READING` must be
  re-read against the 30 Hz frame (§0). The scoped shot's eye (§1.3) moves the round's origin. Body bit 4 = alive
  resolves `OVERLAY_BODY_FLAG_READING` (the reload overlay plays only alive).
- **C9 (render):** the animation LOD bits (§2.1); R78's colour lane.
- **Everyone:** the static anim-type table at 0x661060 (id = index) and the runtime registrations at D:L495200-495420
  (`DAT_003dXXXX = FUN_005e4f90(name)`) name any anim id: `scratch/C2/nametable.py`, and `grep -n "DAT_003dXXXX ="`.
  The `CZSealBody` part slots `actor+0x2e8..` are now named (§1.3).

## 6. Reproduce

```
cd research-wave-2026-10-04/scratch/C2
python elfread.py 3e13f8; python rdram.py C:/Projects/socom_pc/logs/parity/spawn_pcsx2.rdram 4a449c   # the frame
python derived.py                                                                                   # ramp, pass, eye, headroom
C:/projects/redotcom/web/node_modules/.bin/tsx roots.ts "seal_(stand|crouch|prone)$"               # 11.4844 5.5039 2.1680
C:/projects/redotcom/web/node_modules/.bin/tsx fk.ts seal_stand seal_crouch seal_prone             # hips, head, top
python disasm.py 29bf70 29cbb0 | grep -B8 "jal 0x309180" | tail -9                                  # the 0.75
python nametable.py 661060 661160 661060                                                            # anim ids
sh show.sh 419606-419622 441190-441245 415110-415135 466655-466675 418511-418523 442407-442434 462920-462928
```

## 8. Verification (V1, 2026-10-04)

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

### 8.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| 1 | 30 Hz game frame (`DAT_003e1400` = 30, dt 0.03337) | **CONFIRMED** | The cap is 30 in the ELF and in all 25 dumps. The main loop runs one Tick a frame with the measured dt. No 60 Hz game-logic subsystem was found. A new corroboration: the pad reset primes the look ramp with a literal 1/30 s. One evidence correction: `frostA/B` are recomp dumps, not PCSX2. |
| 2 | ramp 1.553/s; eye 15.88 / 9.90; prone root 2.1680; headroom foot 7.504 | **CONFIRMED** | The formula and the constants are the instruction operands. The roots 11.4844 and 5.5039 also sit in the PCSX2 dumps' `skel_root` nodes, and hips is about 0 off the root. The eye's "first person / scope" attribution stays STRONG, as C2 graded it. |
| 3 | no wall column; probes at feet + 6.5 (r 3.5) stand/crouch, feet + 3.0 (r 8.0) prone | **CONFIRMED-WITH-CORRECTION** | The constants are right. The correction: the prone segment is **not** strictly horizontal. Its end y gets a lift from `FUN_0054ecd0` (the segment through the body's matrix), so it tilts with a slope-aligned body. The step height is 4.0 in the ELF and 6.5 in every dump from the title screen on. |

### 8.2 Claim 1: The 30 Hz game frame

**Independent route.**
- **The frame end.** I disassembled `FUN_003aff30` (zVid_Swap) myself. At 0x3aff58-0x3aff9c it loads `DAT_003e1400`
  via `lui 0x3e; lw 0x1400`. It skips the wait when the cap is -1, then adds 1/60 (0x3c888889) until
  `elapsed + 1/60 >= 1/cap`. This matches D:L304746-304749.
- **The main loop.** `FUN_001e7040` (D:L47873-47875) calls the core state's vtable `+0x1c` with `DAT_004a449c` forever:
  one Tick per swap, with no sub-step.
- **Every writer of the cap.** `FUN_003b17d0` maps 60 to -1, and `DAT_003e1400` is written only there (D:L305440).
  Its callers:
  - D:L50752 / L51260: -1, the loading uncap.
  - D:L51134: restores the saved value.
  - D:L50954 and D:L207717: `DAT_003e13f8`.
  - D:L207813: 0x1e (movie).

  Nothing sets 60 for a match.
- **.data and the dumps** (`elfv.py`, `rd_frame.out`):
  - The ELF holds `0x3e13f8` = 30 and `0x3e1400` = 30.
  - All 25 dumps read cap 30 and default 30.
  - The three PCSX2 dumps (`spawn`, `postload`, `title`) read dt 0.03336723. Times the H-blank rate 15734
    (`DAT_0049e2d4`, also read from the dump), that is exactly 525 = two NTSC fields.
  - **Correction to C2 §0's table:** `frostA_probe600` / `frostB_probe600` are recompiler dumps
    (`PS2X_RDRAM_DUMP_AT`, socom_pc research 21 L644), not PCSX2. They read dt 0.03330367, the recomp's own 524/15734.
    They are still 30 fps, so the conclusion stands.
  - Recomp dumps under load read 15 or 20 fps (dt 0.0666 / 0.0500), and one reads 60 (`s4rand_ours`, dt 0.01665). These
    are host artefacts of the recompiler, not the console.
- **A second, independent line I found.** The pad reset `FUN_002dba60` primes the look ramp `FUN_002da930` with a
  **literal dt of 1/30**: `lui 0x3d08; ori 0x8889; mtc1 $f12` at 0x2dbae8 and 0x2dbb18 (`dis_padreset_1_30.out`;
  0x3d088889 = 0.0333333). A movie-path caller does the same (`FUN_002d9e40(0x3d088889)`, D:L208635). The authors wrote
  the frame as 1/30 s in code.

**Could any subsystem still tick per vblank?** I looked for:
- **Interrupt handlers.** `AddIntcHandler` registers only library work:
  - `vblank_e_handler` 0x1bf600 (USB keyboard, names CSV).
  - VIF/DMA plumbing 0x33c010 and 0x3515a0.
  - An empty `jr ra` stub 0x631388 for all causes.

  None runs game logic.
- **Threads.** There are six `CreateThread` sites. The one long-lived loop besides the main loop is `FUN_002ce930`
  (D:L171840). It sleeps `zSysSleep(DAT_0049e2d4 / 20)` (50 ms, an alarm on the H-blank clock) and pumps the network
  through `FUN_0030d9b0(0x45a0c0)`. So the **net receive pump is time-based, about 20 Hz, on its own thread**: neither
  60 Hz nor frame-locked. This agrees with M2's per-field send intervals in ms. The others are loaders, the audio/IOP
  helpers and `FUN_003b1dd0` (sleeps on a semaphore).
- **Fixed-step constants.** The decomp contains no 1/60 (0.016666) except in the swap wait itself (D:L304747).

**The port's research.** None of it measured a game-frame timing that contradicts 30 Hz:
- Research 88 §5: "A jump, a turn and a camera in motion, timed. None exists on the console." The 60 Hz is "research
  71's reading, not a measurement".
- Research 110 R110.1 and 116 R116.14 had already ruled 30 Hz (29.97) for the front end from the same cap.
- Desktop KNOWN row 134 reads "the game targets 30 fps (two VBlanks)".
- Measured speeds in units per second are dt-scaled, so they do not move with the frame.

**Verdict: CONFIRMED.**

### 8.3 Claim 2: C2: ramp, eye, prone root, headroom

- **Ramp.** D:L179774-179780 in `FUN_002da930`:
  - The step is `dt + (1-dt)*(1-(s*0.13+0.87))`, divided by (s+0.5) when s > 0.5.
  - `fVar17 = 1.0 - param_1` (the only assignment of that form in the function).
  - With s = 0.75 (C2's pad record), `derived.out` gives 0.0389 per frame at 1/60 (2.334/s) and **0.05183 per frame
    at 525/15734 = 1.5532/s**, full 0.65 in 12.5 frames = 0.418 s. Confirmed.
- **The eye.**
  - `FUN_0029ae50` (D:L142565-142624): non-prone `y += 4.4`, z = -2.5 (or 0 per the two tests). Prone takes the 1.8 /
    0.7 / -7 formula. The node is `cam+0xc8`.
  - `FUN_002956e0` D:L139749-139750 sets `cam+0xc8 = actor+0x2e8` when no name is passed.
  - The constructor D:L419606-419608 stores `FindPart(0x65c4c0)` in `param_1[0xba]` (int*, so +0x2e8). The ELF string
    at 0x65c4c0 is `skel_root`, at 0x65c4f8 `hips` ([0xc1] = +0x304) and at 0x3efd98 `spinelo`.
  - **A second route for the roots.** `rd_actor.out`: in `postload_pcsx2.rdram` the actor's `+0x2e8` node holds
    translation y **11.4844**. In `spawn_pcsx2.rdram` (crouched) it holds **5.5039**. These are the same values the
    port's parser reads from `seal_stand` / `seal_crouch` (`roots.ts` re-run).
  - So eye = 15.884 / 9.904. Confirmed, STRONG: the step "this view is the scope/first person" is C2's, and I did not
    re-prove it.
- **Prone root.** `roots.ts` re-run: `seal_prone` key0/min/max 2.1680 (555/256). Research 88 §5 had predicted "prone
  about 2.17". Confirmed, PROVEN as disc data.
- **Headroom.** `FUN_0057efe0` (D:L441190-441245):
  - The ray starts at `FUN_002869d0(node actor+0x304).y + 2`, in actor space, then is transformed by the actor matrix.
  - It ends at `feet + 19` (mode 0) or `feet + 12` (mode 1).
  - The dumps' hips node has a local translation of about 0 off the root (0.0231 / 0.0). `fk.ts` gives hips = root in
    both idles.
  - So the foot is 5.504 + 2 = **7.504** crouched. Confirmed.

**Verdict: CONFIRMED.**

### 8.4 Claim 3: C2: wall probes

Read again at D:L415100-415233 and L415400-415435 (`FUN_0054aa30`):
- **The size class.** Class 0 or default gives (3.5, 19.1). Class 1 gives (3.5, 15.0). Class 2 gives (8.0, 6.0) only
  when `bVar5`, otherwise (3.5, 19.1).
- **The reach.** Segments reach `r x 1.4` (D:L415166).
- **The height** `fVar22` = `DAT_0044c26c`, or `fVar19 * 0.5` when `bVar5` (D:L415231-415233). It is added to both
  ends (D:L415418-415419).

So standing and crouched without `bVar5`: horizontal at feet + 6.5, r 3.5. Prone: feet + 3.0, r 8.0. C2 is right that
there is no column.

**Corrections and additions:**
- **(a) The prone segment tilts.** When `bVar5`, the end point's y is further raised by `FUN_0054ecd0(body matrix, ...)`
  (D:L415426-415431, function at D:L416972: it pushes the segment through the body's 4x4 matrix). On a slope-aligned
  prone body the probe follows the body's pitch. It is flat only on flat ground.
- **(b) The other `bVar5` triggers.** `bVar5` is also true for actions 0x1a/0x1b/`DAT_003dec58`, and for the other
  conditions at D:L415094-415108. In the stand/crouch class this gives heights 9.55 / 7.5. C2 says this in words.
- **(c) The step height's source.** `DAT_0044c26c` is statically initialised to **4.0** (D:L328375). It reads **6.5** in
  every dump, the title-screen dumps included (`elfv.py ... 44c26c`). It is set at boot, map-independent, so 6.5 is the
  right value. Its writer (a valve or config load) was not traced.
- **(d) What C2 did not read.** The bone-segment branches (state 8, `bVar6`) were not re-read by me. C2's own
  "BELIEVED nothing else adds a vertical extent" stands as graded.

**Verdict: CONFIRMED-WITH-CORRECTION** (the prone probe is body-tilted, not horizontal).

### 8.5 Things to carry forward (items 1, 2, 8 of the verifier's list)

1. **C2 §0 evidence table:** `frostA/B_probe600` are recomp dumps (dt 0.03330367 = 524/15734), not PCSX2. The PCSX2
   triple is `spawn`, `postload` and `title`.
2. **C2 §1.6:** the prone probe tilts with the body (`FUN_0054ecd0`). Add "on flat ground" to "feet + 3.0". The step
   height's static init is 4.0; the boot-time writer of 6.5 is untraced.
8. **New corroboration of 30 Hz:** the pad reset passes a literal 1/30 s dt to the look ramp (0x2dbae8, 0x2dbb18).
