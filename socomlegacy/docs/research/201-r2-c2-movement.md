# 201 -- R2-C2 -- movement, body and camera, round 2: the rows round 1 left unopened

- Research date: 2026-10-04 (research wave 1, round 2 and the close; the index is [178](178-the-research-wave-of-2026-10-04.md)).
- Origin: `research-wave-2026-10-04/R2-C2-movement.md` on the owner's host, in the evidence archive ([178](178-the-research-wave-of-2026-10-04.md) gives its root). A relative `scratch/...` path below is under `research-wave-2026-10-04/`; the per-cluster `ledger-*` files it names are merged in [`ledgers/2026-10-04/LEDGER-ALL.tsv`](ledgers/2026-10-04/README.md).
- Trees compared: **PORT** = `agent/online` at 2026-10-04 (written `$PORT`; `$PORT/..` is that branch's root, `$WEBISSUES` the `agent/web-issues` checkout); **WT** = the old-layout checkout (`$WT`, the clone's pre-restructure web project). WT-96..102 are notes 171-177 here; PORT's own notes 96-102 are other notes.
- **Status: reading, pending review -- not adopted.** Nothing in it is adopted until a sprint task takes it and a reviewer re-reads it at the source.
- Grades, translated to AGENTS.md's levels: the wave's PROVEN = an exact source read = **reading**; STRONG = reading with one interpretive step; BELIEVED = inference; UNRESOLVED = unresolved. The text keeps the wave's words.
- Verification: V5 (`research-wave-2026-10-04/V5-verify-hostage-closures-round2.md`) has landed and is folded in as §27; V6 (the loop-rate rescale) is research 206 §2. The ladder's 7.594 is wrong (13.5 u/s), two claims are corrected.
- Edits on import: the headings are numbered for the corpus; home-directory paths are replaced by `$PORT`/`$PORT/..`/`$WT`; the archive's absolute root is dropped; references to the other reports are links to their notes; the claims research 206 §1 overrides are named under this header. The substance is verbatim.

**Overridden in part (research 206 §1):** the ladder climbs at 7.594 u/s (§4) -- **13.5 u/s** (the loop-rate factor K 1.7778 of `FUN_0028aa20`); the port's 7.59 is the bug (V5 §27.4, V6 in research 206 §2).

**Overridden in part (research 206 §1):** V5's "every looped clip in the port is affected" by the loop-rate rescale (§27.6) -- only the ladder (2 clips); the port already applies K to the other 122 (V6, research 206 §2).

**Overridden in part (research 206 §1):** the swap's gates (§1) -- `UseVelY` belongs to the reload; a throw not refusing a swap is unproven (`FUN_005a7de0(actor,1,1)` adds refusals) (V5 §27.2).

**Overridden in part (research 206 §1):** the head look is forced forward when raised or posture > 1 (§5) -- the clamp stands; the forcing and the turn lead never run for the local player (their flag is never written) (V5 §27.5).

Research agent R2-C2, wave 2026-10-04. Read-only. `D:L<line>` is a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001); `.data` reads are from
`game/disc/socom2_game.elf`; dumps are from `logs/parity/` (`spawn_pcsx2.rdram` is PCSX2; per V1, `frostA/B` are
recomp dumps and are not used here). Disc data is read with the older checkout's parsers. Every script is in
`scratch/R2-C2/` (its `README.md` lists what each prints). `$PORT` = the `agent/online` snapshot named in the brief.

Settled inputs, not re-litigated: C2's ([180](180-c2-movement-body-camera.md)) main results as V1 confirmed them, and the 30 Hz game frame (dt 525/15734).
Wave-2's `W2-A` owns NoFire and the actor fire/reload permission. This report cites `FUN_005b4340` only for its **swap**
(code 4), **reload** (code 3, for posture 6) and **zoom** cases, and does not repeat W2-A's ([194](194-w2-a-combat-actor-gaps.md)) flinch/NoFire work.
W2-R ([197](197-w2-r-input-voice-integration.md)) owns the controller presets and TeamCommand.

## 0. Summary

Ledger `ledger-R2-C2.tsv`: **25 rows -- RESOLVED 16, PARTIAL 4, UNRESOLVED 3, NOT-A-GAP 2.**

Not re-opened, because round 1 did research them: `AIM_WEIGHT_PLACEHOLDER`, `PEEK_CUTS_ACTION_READING`,
`PEEK_STANCE_ENDS_PEEK_READING`, and `KNOCK_LANDING_GATE_READING` (also W2-A A08).

| item | status | grade | one-line answer |
|---|---|---|---|
| U-SWAP-GATES (`mover.ts:1006`) | RESOLVED | PROVEN | The swap needs `FUN_005a8cb0 && FUN_005b4340(actor,4) && FUN_005c4fd0`. It is refused dead, in the air (jump, slide), on a ladder, hang, peek or carry, in a vehicle, in a knock-down, landing, get-up, `180` or dive, during a swap, reload, CQB, stab or restraint, on a `UseVelY` clip, and **in zoom states 4-12**. Most actions do **not** refuse it. |
| U-ZOOM-READINGS-A31-A34 | RESOLVED | PROVEN | Every player-driven switch is refused in the binoculars and in a scope (`FUN_005c4fd0`). So A31 and A33 cannot happen, and A32 differs from the game only on a night map. A34: a zoom step needs the actor alive (`FUN_005a8da0`). |
| U-SLOPE-SLIDE-A6 | RESOLVED | STRONG | `FUN_0054edf0`, starting from the projected velocity: speed += (1 − n_y)·g·dt; the move is speed·dt·n_y·(n_x, n_z); `Slide` (`seal_slide`) plays past g/4. It runs on ground with n_y < cos 50° whose polygon spans 4 units or more (any span when prone). Leaving the slope at more than 40 is a landing. |
| U-LADDER-7.59 | RESOLVED | STRONG | **7.594 u/s** at full stick. Each factor is now read from code: duration 0.533/3, speed 0.135 × stick, stride 10.0 a cycle (`FUN_0028ab10`). |
| U-R80-HEADLOOK-ROTATOR | RESOLVED | PROVEN | `FUN_005e0010` is the rifle's raise state. The look is forced **forward** (priority 3) while the rifle is up or rising, or when the posture is above crouch. The clamp `FUN_005ae040` holds **pitch −60..+80°, yaw ±89°** (`dynamics.rdr` `min/max_look_pitch`, `max_look_yaw`; the dump agrees). |
| U-CROUCH-DIAGONAL-A5 | RESOLVED | STRONG | Scale = 1/√(w² + (1−w)²), with w = asin(\|x\|/len)·2/π, applied to the extracted root velocity every frame. The crouch plays one set per class, so 45° gives ×1.4142, which is **19.80** (the reading holds). The stand blends two sets, and the scale compensates them. |
| U-BOB-SIGN-A29 | RESOLVED | PROVEN | With one axis pushed, the phase steps by the **signed** push. With two, it steps by the mean of the absolute values. The phase is a global that is never reset and wraps only above 2π. |
| U-MOTION-PLAYBACK-RULE (R77) | RESOLVED | PROVEN | A one-shot clip, or any clip with max_velocity < 0: duration := `playback`. A looped clip with max_velocity ≥ 0: duration := file duration / `playback`. Speed scale = max_velocity/10 (1 when 0) for looped clips, else 1. |
| U-MOTION-FLAGS-PADLANE (R77) | RESOLVED | PROVEN | The loader reads only track flags 0x20 and 0x10. 0x04 and 0x08 are never read, and the pad lane is 4-byte alignment. |
| U-MOTION-HEAD-F32S (R77) | RESOLVED | PROVEN | Head +0x14 (1.0) is the clip's rate multiplier. Head +0x10 (−1) lands in the stride slot. Both equal the constructor defaults. |
| RELOAD_POSTURE_SIX_READING (R150) | RESOLVED | STRONG | Posture 6 is **in the air**. In the air the reload gate refuses unless the weapon is in a launcher-round mode, so the no-clip branch is not reached in play. |
| PEEK_HOLD_CONTINUES_READING | RESOLVED | STRONG | The reload gate does not refuse posture 3. A still reload mid-peek runs and pops the peek (C2's pop, now with its gate). |
| U-R80-SWITCH-BLEND | RESOLVED | STRONG | The blend is 0.4 s. No swap clip has a `BlendTime`, so the loader default 0.4 applies, and the moving swap overlay uses the literal 0.4 body cross-fade. |
| U-PEEK-TOP-180 | RESOLVED | STRONG | `180` plays when the SEAL faces away from the ladder. The turn is spread over the clip (yaw rate −angle/0.916 s for 0.883 s) and the clip's own root rotation is zeroed. It is not instant. |
| U-CAM-0x45-BLEND-NUDGE | RESOLVED | PROVEN | The −5/+5 nudge happens only offline, with a dead viewed actor: **never online**. The +0x45 blend runs in two cases: the online death camera's state 7, eased by min(6·dt, 1) each frame, and a vehicle change over 1 s. |
| U-CAM-LAST-TARGET-Z | RESOLVED | PROVEN | The original reads an **uninitialised stack slot** here. It has no defined value, so the port's choice is a legitimate adaptation. |
| U-MIN-JUMP-HEIGHT | NOT-A-GAP | PROVEN | `min_jump_height` (and `min_stand_height`, `min_running_*`) is loaded and never read. |
| U-GAMEPAD-ASSUMED | NOT-A-GAP | PROVEN | The only `assumed` row is Circle → boost, the page's own control. The disc's Default preset maps Circle to TeamCommand (W2-R). |
| U-MOVER-TRANSITION-JUMP-ORDER | PARTIAL | PROVEN | Velocity is integrated before position, giving a **12.27** top at 30 Hz. `JUMP_DELAY`'s reading is confirmed. `mover.ts:127` and `:1598` were not attempted. |
| U-ANIM-WEAPONPOSE-RAISE-THROW | PARTIAL | BELIEVED | A scope (states 5-12) forces the rifle up. No writer of the "aim" field `ctrl+0xc0` was found. The other readings were not attempted. |
| U-R78-MATRIXID-LIDS | PARTIAL | PROVEN | 0x3fc2d0 is `"matrix_id"`, read into the visual's +0x68. The lids at rest are still owed. |
| BINOCULAR_LOWER_READING | PARTIAL | BELIEVED | Unchanged. No lowering push was found either. |
| BINOCULAR_BODY_READING | UNRESOLVED | -- | No push of the binocular types anywhere in r0001 (whole-text scan), and zoom state 4 starts no clip. A capture is owed. |
| U-R78-COLOUR-LIT | UNRESOLVED | -- | A capture is owed (VU1). |
| U-R88-CONSOLE-RUNS | UNRESOLVED | -- | A capture is owed; the exact captures are in §24. |

---

## 1. The swap's gates (`$PORT/packages/viewer/src/mover.ts:1006`, `U-SWAP-GATES`)

- **Stands for:** when a rifle ↔ pistol (or any slot) switch is refused.
- **Current value:** "refused in the air and while an action plays [reading: the caller's gate is not read]".
- **Prior search:** C2 and research 80 §7, not attempted. The lead was the caller of `FUN_005a64c0`.
- **What I did.**
  - The press. The controller tick `FUN_00594cf0` reads action 9 (`SwapWeapon1`) and action 10 (`SwapWeapon2`,
    skipped when RUN AND TALK `DAT_0044d4f8` is set, as W2-R found) at D:L453288-453312.
  - Each switch calls `FUN_005c4b10(weapons, slot)` only when all four pass:
    - `FUN_005a8cb0(actor)`;
    - `FUN_005bdc30(weapons, slot)`, the slot is usable;
    - the slot is within the count (`FUN_005be030`);
    - `FUN_005c4fd0(weapons)`.

    Otherwise it plays the refusal sound `FUN_003419c0`.
  - The HUD weapon menu `FUN_0021bda0` opens behind the same `FUN_005a8cb0` + `FUN_005c4fd0` test
    (D:L72829-72845).
  - The animation is not the gate. `FUN_005a64c0` is reached only from `FUN_005c1660` (the raise-state tick,
    D:L476695-476740), which plays the hand clip once the switch is accepted, and from the moving-launcher drop
    (D:L418255-418280).
- **Answer: the swap is allowed only when every test below passes.** PROVEN: each is a read branch.
  - `FUN_005a8cb0` (D:L463148-463190) requires:
    - alive (`+0xe1` bit 4);
    - `FUN_005a7de0(actor,1,1)`;
    - `FUN_005b4340(actor, 4)`;
    - not `+0x105e` bit 5 (airborne) and not posture 6;
    - no vehicle (`+0xeb8` == 0);
    - not body `+0xc0`→`+0x118` == 1.
  - `FUN_005b4340(actor, 4)` (D:L469305-469520) refuses:
    - Posture: 8 (dead), 5 (ladder) or entry kind 5, 9/10 (carry), 4 (hang) or kind 4, 3 (peek) or kind 3, 6 (air).
    - Knock-downs and landings: `Fall forward/backwards` (`FUN_00588030`), `Land forward/backwards` (`FUN_00587fe0`).
    - Clips: `180`, `dive_to_prone`.
    - `+0xeac` set.
    - Actions: a swap already playing (`FUN_005a7980`: `Rifle -> Pistol` ×3, `Rifle/Pistol -> Launcher`,
      `Stand -> Turret` ×2, the moving swap and moving launcher clips); any reload or shotgun pump (`FUN_005a7ab0`);
      `CQB attack`, `Stab`, `Apply restraints` (all pistol twins).
    - Flags and sets: `+0x1060` bit 4; anim set `DAT_0044d3f8`.
    - Jumps: any of `Jump launch/fall/land/land hard` (types 8-11).
    - **The slide**: `+0x1340` > 0.001, the slide speed of §3.
    - Any clip with **`UseVelY`** (`FUN_0057b510`: motion `+0x4a` bit 4, named by the `motion.rdr` loader D:L131390-131396).

    The names come from `python scratch/R2-C2/regname.py 3deae0 3def08 3dee20 3dee28 3dee10 3dee08 3dee48 3dee50
    3deee8 3deef0 3df0e0 3df0e8 3df108 3df110 3dec68`.
  - `FUN_005c4fd0` (D:L478939-478956) refuses:
    - weapons byte 1 bit 1;
    - `+0x87c` > 0;
    - **zoom state ≥ 4** (the binoculars and every scope).
  - So most one-shots do **not** refuse a swap: a stance transition, a throw (the throw types are not in the code-4
    list), the climb's step-up and a flinch.
- **Implementation.** Replace `if (this.inAir || this.action_) return null` with a predicate built from the list above.
  - Test first: `mover.test.ts` cases.
    - Swap refused while `Jump fall` plays, while sliding, while peeking, while a reload plays, at zoom state 4 and at
      state 5.
    - Swap accepted during a stance transition and right after a throw.
  - The room must refuse the same switches (an authoritative swap check), and remote players will see fewer swaps.
- **Owed:** none for the rule. A one-shot capture would confirm the throw case: swap pressed mid-throw, PINE `actor+0x534`.

## 2. The zoom readings A31-A34 (`zoom.ts:181-193, 364-365`)

- **Stands for:** what a weapon switch, a raised launcher, an item taken up, and death do to the view state `+0x200`.
- **Current value:** the page drops a scope or a raised launcher to first person.
- **Prior search:** research 101 A31-A34, "owed: trace".
- **What I did.**
  - Read the switch `FUN_005c4b10` (D:L478777-478937). It writes `+0x200` only when the old state is 3 (night
    vision): 3 → 1 off a night map, with the `DAT_00436674..80` overrides that the port already models.
  - For a scope state at or past the new record's count, the set `FUN_005448a0` (D:L410927-411050) leaves `+0x204`
    unwritten. The tail of the switch picks the new record's `ZoomMode[state−4]` or 1.0 (D:L478918-478926).
  - Read the zoom in `FUN_005445b0` and the zoom out `FUN_00544400` (D:L410621-410926).
  - Read their caller's gate `FUN_005a8da0` (D:L453313-453330 → D:L463193-463300).
- **Answers.** PROVEN unless noted.
  - **A31** (a swap drops a scope): **unreachable.** Every player switch path, the buttons and the HUD menu, is refused
    while `+0x200` ≥ 4 (`FUN_005c4fd0`, §1). The only switch-driven state change is 3 → 1 off a night map. The port's
    statement "the binoculars stay through a switch" is moot for the same reason: the switch is refused in state 4.
  - **A32** (a raised launcher drops to 1): a launcher is raised by an ordinary switch to its slot (class 4,
    `FUN_005c1660` → `FUN_005a64c0(…, 4)`).
    - In states 4-12 the raise is refused.
    - In state 3 it drops to 1 off a night map and **stays 3 on a night map**.
    - In state 1 it stays (the zoom-in's launcher gate).
    - The port's "launcher && s > 1 → 1" is wrong only for the night-map night vision.
  - **A33** (an item taken up under a scope drops to first person): unreachable through the player's switch, as A31.
    - BELIEVED (not traced): the pickup path `FUN_0059f0c0` (D:L458275) and the replication of a remote player's slot
      `FUN_0021bda0` (D:L72700) call `FUN_005c4b10` without `FUN_005c4fd0`.
    - In those paths a scope state over a weapon with too few modes keeps `+0x200` and its old magnification.
  - **A34** (the dead do not step the zoom): confirmed. A zoom step needs `FUN_005a8da0`, whose first test is
    `+0xe1` bit 4 (alive). It also refuses:
    - an online `FUN_002c2fd0` actor;
    - any posture but 0/1/2/3/6, and kind-8 entries;
    - the throws and peek tosses, a swap (`FUN_005a7980`), CQB, stab and restraints;
    - an active overlay (`+0x1e4`, e.g. the moving reload), the ladder (`FUN_0054f6e0`), anim set `DAT_0044d3f8`
      and `FUN_00579ea0`.

    The `+0x113` 3/5 "next round" reading and the respawn's 1.0 magnification were not re-opened.
- **Implementation (zoom.ts).**
  - `setWeapon`: drop only 3 → 1 off a night map, and leave 5+ alone. The caller must make `Zoom.state() >= 4`
    refuse the swap (§1).
  - `setHold('launcher')`: night map and state 3 → keep 3.
  - Zoom in/out: refused when dead, swapping, throwing, on a ladder or under an overlay.
  - Tests in `zoom.test.ts`: "swap refused in state 4 and 5"; "launcher raised under night vision on a night map
    keeps 3".

## 3. The steep-ground slide (`physics.ts:272`, `U-SLOPE-SLIDE-A6`)

- **Stands for:** the motion on ground steeper than `max_slope`.
- **Current value:** `slideAcceleration` = g·n_y·(n_x, n_z), "the natural one ... [reading]".
- **Prior search:** research 86 §6.2 / 101 A6, "not modelled". C2's lead `FUN_005b56c0` is the uphill and water
  slowdown, which the port already has (`traversal.ts:633`).
- **What I did.**
  - Found the users of the `Slide` type (`DAT_003dead8` = "Slide", D:L495203; `rdrrec.ts animset.rdr Slide` →
    `seal_slide`). The slide is `FUN_0054edf0`, called each body tick unless `Climb over` plays (D:L416558-416561).
  - Read it and its test `FUN_0054f330`, and checked the test in disassembly (`python disasm.py 54f330 54f410`).
  - Measured the polygon field the test reads on every map (`polybits.ts` → `polybits.out`).
- **Answer.** STRONG: the code is read and the constants are operands. The step that remains interpretive is the
  meaning of `FUN_002dbfb0`'s two points, read as top and bottom as `climb.ts` does.
  - **When it slides** (`FUN_0054f330`, D:L417206-417245), on the ground hit `actor+0x400`:
    - Bits 4-6 of polygon byte +0xb (packed-word bits 28-30) give a kind. With no polygon the kind is 4.
    - Kind 1: never slides.
    - n_y < `DAT_0044c268` (cos 50° = 0.6428): slides when the polygon's top − bottom ≥ **4.0** (`lui 0x4080` at
      0x54f3c8), or when prone, or when the extent read fails.
    - Walkable ground: slides only for kind 0.
    - On the disc **every** collision polygon of every map carries kind 4 (`polybits.out`: 304,126 polygons, all
      bits 28-30 = 4). So in practice the condition is "steep, and at least 4 tall".
  - **The motion** (`FUN_0054edf0`, D:L417030-417200). Slide speed is `+0x1340`; the normal `+0x1344..0x134c` is the
    stored ground normal.
    - Entry (speed 0): the speed starts as the horizontal velocity's projection on the fall line. The fall line is the unit vector down the slope (`FUN_0054edf0` D:L417112-417153, `FUN_00309110`); its horizontal part has length n_y, so the entry is `n_y · (v_h · ĥ)`.
    - Each frame: speed += (1 − n_y)·g·dt (g = 235).
    - The displacement this frame is speed·dt·n_y·(n_x, n_z) (`+0xf44`, `+0xf4c`).
    - The feet are then re-placed on the ground by a downward search in up to 10 steps of 0.1 (`FUN_005b4f30`).
    - Above g/4 = **58.75**, `Slide` is pushed with posture 6, unless a carry or a swap is in progress.
      `seal_slide`: `BlendTime` 0.85, `NoFire`, `NoInterrupt`, `max_velocity` −1, one-shot, `playback` 6.
    - Leaving the steep ground: `Slide` is popped. If the speed exceeds `land_fall_rate` 40 (and the SEAL is not
      carrying), the landing `FUN_005af590` classes it. Then the speed resets to 0.
    - In the air (`+0x105e` bit 5) the slide stops.
  - `derive.py`: on 60° the speed grows 117.5 u/s² and the Slide clip starts 0.50 s after a standing start.
  - The port's acceleration g·sin(a) along the plane differs from the game's (1 − cos a)·g, which is horizontal
    speed·cos a·sin a.
  - The slide also gates other things: the swap (§1) and the landing test (`FUN_0059b440`'s `0.001 < +0x1340`).
- **Implementation.**
  - The port runs this in `steepSlide.ts` through `Walker` (the room's `MoverSim` and the page's prediction both tick
    it), on every body tick except `Climb over`, overwriting that tick's root displacement. A wall that leaves the
    resolved y in [0, 0.01) clears the speed (`FUN_005483d0` D:L413912-413917); a stuck move writes no displacement
    (D:L413602-413611). The exit landing is `FUN_005af590` without `FUN_005af930`'s 0.4 s jump lock. The stick half of
    its soft clip is the rest test already in `idle` (research 80 §2.4, research 230); no wider small-stick threshold
    is transcribed. `SLIDE_SPAN_MEASURE_READING` (research 86 §7.2) is the one unpinned measure. `seal_slide` is
    flagged, not pushed. Reading, pending review; the capture below is still owed.
  - Replace `slideAcceleration` with a `SlideState` that carries the speed, the entry projection, the (1 − n_y)g gain,
    the n_y-scaled move, the 4-unit span rule, the `Slide` clip at 58.75 and the exit landing over 40.
  - Test first: on a 60° ramp at least 4 tall, after 0.5 s from rest the speed is 58.75 and `Slide` starts; a 3-tall
    steep step does not slide a standing SEAL but slides a prone one.
- **Owed:** a capture to confirm. MP slope, PINE `actor+0x1340` and position per frame while standing on a steep
  face, and the top anim id `actor+0x534`.

## 4. The ladder's 7.59 (research 86 §7.2, `traversal.ts:48`, `U-LADDER-7.59`)

- **Stands for:** the climb's rise at full stick.
- **Current value:** 7.59 u/s, "derived (W2.2c to measure)".
- **Prior search:** research 86 §2.3 derived it from the parser's fields.
- **What I did.** I sourced each factor in the code.
  - The `motion.rdr` loader (D:L131280-131310, §8): `seal_climbladder` is looped with `max_velocity` 1.35 and
    `playback` 3 (`rdrrec.ts motion.rdr seal_climbladder`). So the in-memory duration is 0.5333/3 = 0.1778 and the
    speed scale `+0x1c` is 1.35·10/100 = 0.135.
  - `FUN_00584240` sets the node speed to stick × `+0x1c`.
  - `FUN_0028d570` (D:L134832-134840) multiplies a looped clip's speed by clip `+0x14`, which is 1.0 (§8).
  - `FUN_0028c4f0` (D:L134249-134252) advances t by dt·weight·speed/(duration × 1).
  - **The stride**: `FUN_0028ab10` (D:L133270-133285) stores, in clip `+0x18`, the root's (key n−1 − key 0)·n/(n−1),
    its y component for a `VerticalMotion` clip. `rootkeys.ts seal_climbladder`: +0.625 a key for 15 keys = 9.375,
    × 16/15 = **10.0**.
- **Answer:** `derive.py` gives 0.7594 cycles/s × 10.0 = **7.594 u/s** (0.2534 a frame). STRONG. The step that
  remains is that the actor's rise equals stride × cycle rate; the stride slot is read, its consumer is not.
- **Implementation:** cite the chain in `traversal.ts` and keep 7.59, renaming it as sourced. Test that the climb
  covers 10 units per cycle at full stick.
- **Owed:** PINE `actor+0x20` (y) through a 2 s full-stick climb on MP82's guard-tower ladder.

## 5. The head look (`headLook.ts`, research 80 §7, `U-R80-HEADLOOK-ROTATOR`)

- **Stands for:** the controller's `FUN_005e0010` test, and the rotator clamp `FUN_005ae040`.
- **Current value:** the test is not read; the clamp is left out.
- **What I did.**
  - `FUN_005e0010` (D:L494304-494310) returns `actor+0xf74 & 0xef`.
  - The writers of `+0xf74` are `FUN_005dfc80` and `FUN_005dfe30` (D:L494179-494290), the rifle raise machine:
    1 raised, 2 lowered, 0x11 raising, 0x12 lowering, with the 0x10 bit meaning "in transition".
  - `FUN_00596f10` (D:L453998-454010) asks for a forward look (vector 0x3f6500 = (0, 0, −1) in the dump) at
    **priority 3** when the test is 1 (raised or raising) or the posture is above 1 (prone, peek, hang, ladder, air
    and so on). Otherwise it drops priority 3 and runs the turn lead the port has.
  - The clamp `FUN_005ae040` (D:L465767-465850) is called by `FUN_005adc70` (D:L465719) with
    `DAT_0044c2c4`/`c8`/`cc`. These are `dynamics.rdr` fields at the table's `+0x74`/`+0x78`/`+0x7c`
    (`FUN_0059ba80` D:L456781-456791): `max_look_pitch` 80, `min_look_pitch` −60, `max_look_yaw` 89
    (`dynamics.ts`), read in the dump as 1.396263 / −1.047197 / 1.553343 (`rdram.py ... 44c2c4 3`).
  - The `.data` static initialiser holds ±89° for all three (D:L328393-328397), and the loader overwrites them.
  - Before clamping, `FUN_005adc70` (D:L465690-465711) accepts a request inside the cosines `DAT_0044c2fc/300/304`
    (cos 80°, cos −60°, cos 89°, also in the dump).
  - The clamp gives the request's elevation and yaw. Out of range, it projects onto the limit with `FUN_00286e50`. A
    request behind the head (dot with (0,0,1) > 0.8) keeps the side the head is already on (±2π unwrap).
- **Answer:** PROVEN.
  - While the rifle is up (`ctrl` raise 1 or 0x11) or the SEAL is not standing or crouched, the look is ahead at
    priority 3 and no turn lead or glance runs.
  - The look direction is clamped to pitch −60..+80° and yaw ±89°, behind-requests on the current side.
  - Also read: `NoHeadlooks` clears motion `+0x4a` bit 5 (loader D:L131348-131353).
- **Implementation:** in `headLook.ts`, add `if (raise === 1 || posture > 1) request(forward, 3)`, and clamp with
  `SEAL_TUNING.lookPitch` / `lookYaw`, which `tuning.ts` already parses. Test: a request at yaw 120° settles at 89° on
  its side; a raised rifle centres the head.

## 6. The crouch diagonal (`mover.ts:68`, `U-CROUCH-DIAGONAL-A5`)

- **Stands for:** the crouch walk's speed-up at a diagonal (19.8 at 45°).
- **Current value:** a reading, "W2.2c measures".
- **What I did.**
  - Read `FUN_00583350` (D:L443326-443364): w = asin(\|x\|/len)·0.63661975 (2/π), clamped 0..1, and
    `DAT_0064fc80` = 1/√(w² + (1−w)²).
  - It is reset to 1.0 each tick (D:L418170) and multiplies the freshly extracted root velocity in the body tick
    (D:L438909-438985, after `FUN_0028c250`).
  - Both walks call it. The crouch `FUN_00582d10` plays **one set** per class `+0x1338` (D:L443181-443197). The stand
    `FUN_00583030` plays the forward/back set and the strafe set together (D:L443262-443283).
- **Answer:** STRONG.
  - The crouch at 45° runs ×1.4142 along its class's clip, which is 14 → **19.80** (`derive.py`; 30° gives 18.78).
  - For the stand, the factor compensates the two-set vector sum.
- **Implementation:** cite the lines and rename the reading as sourced. A test exists in spirit; pin 19.80 at 45° and
  18.78 at 30°.
- **Owed:** the console run as research 88 §5 writes it (crouch, 45° stick, PINE `actor+0x2c..0x34`).

## 7. The view bob's sign (`look.ts` `ViewBob`, `U-BOB-SIGN-A29`)

- **What I did.**
  - Disassembled the bob block, 0x596bc8-0x596cb8 in `textdis.txt`.
  - With both axes non-zero, it takes the mean of two `fabs` calls (`jal 0x1b3620`).
  - With exactly one axis non-zero, it is a plain `mov.s` of the signed axis: no `fabs`.
  - The phase `DAT_0066b3f0` is a global. It is wrapped only when it exceeds 2π (`c.ole.s` against 0x40c90fdb) and is
    never reset by the bob.
  - The axes are `FUN_002c6110` (strafe: digital actions 7/8 → −1/+1, else the stick through `FUN_002c6520`, which
    negates) and `FUN_002c6290` (forward: pad `+0x214`/`+0x21c`).
- **Answer:** PROVEN. Walking only backwards or strafing only one way runs the phase backwards.
  - The output is amplitude·cos(phase), so the shape is the same; a direction change mid-swing continues the cosine
    the other way.
  - The phase survives stops (the port keeps it too) and is never reset on death.
- **Implementation:** in `ViewBob.step`, `push = x === 0 ? moveY : y === 0 ? moveX : (|x|+|y|)/2` with the signs
  kept, wrapping only above 2π. Keep `reset()` only if the page needs it; the game has none.

## 8. The motion format's open items (research 77 §10: head f32s, flags, pad lane, `playback`)

- **What I did.** I read both clip loaders.
  - `FUN_0028a100` (D:L132841-132885) takes the in-memory pack. It reads head words 0 (version → `DAT_003de1e0`),
    1 (duration → clip `+0x10`), 2 (frames → `+4`), 3 (parts → `+6`), 6 and 7, and skips 4 and 5.
  - `FUN_0028a5c0` (D:L133054-133110) takes a stream. At D:L133094-133103 it reads head `+0x10` into clip `+0x18` and head `+0x14` into
    clip `+0x14`.
  - The clip constructor's reset `FUN_0028ae40` sets `+0x14` = 1.0 and `+0x18` = −1.0, the very values every file holds.
  - `FUN_0028d570` multiplies a looped clip's speed by `+0x14`, and `FUN_0028cc10` (D:L134500-134515) starts a play at
    ±`+0x14`.
  - `FUN_0028ab10` writes the per-cycle stride into `+0x18` (§4).
  - The track reader `CZSIObject_Read` = `FUN_00289380` (D:L132327-132363):
    - it copies flag 0x20 into byte `+8` bit 1 (constant translation) and 0x10 into bit 2 (constant rotation);
    - it clears bit 0 and sets `+0xb` = 0xff;
    - a translation channel is (const ? 1 : n+1) × 6 bytes after the 4-byte flag word, padded to a multiple of 4;
    - the rotation channel is × 8.
  - The `motion.rdr` loader `FUN_00287620` (D:L131280-131310): `max_velocity` < 0 sets `+0x49` bit 7 and counts as 0.
    - `+0x1c` = looped ? (mv·10/100, or 1 when 0) : 1.
    - `+0x10` = playback for a one-shot or a negative-mv clip, else `+0x10` / playback.
    - `BlendTime` defaults to 0.4 (`+0x20`, D:L131465).
- **Answers:** PROVEN, by instruction.
  - (a) Head +0x14 is the clip's rate multiplier (1.0 on all 341), and head +0x10 is the stride slot's default (−1),
    which the stride computation overwrites. The port can treat them as 1 and "unset".
  - (b) Track flag bits 0x04 and 0x08 are never read.
  - (c) The "pad lane", the fourth int16 of a constant translation, is the 4-byte alignment and is never read.
  - (d) The `playback` rule is as above. It reproduces research 25's two in-memory reads: `seal_crouch_step`
    (looped, mv −2) gives 0.4, which is `playback`; `seal_run` (looped, mv 6.5) gives 0.633 / 1.
- **Implementation:** add `inMemoryDuration(record, fileDuration)` and `speedScale(record)` to `motionTable.ts`, then
  test the two research-25 values and `seal_climbladder` (0.1778, 0.135).

## 9. The reload's posture 6 (`RELOAD_POSTURE_SIX_READING`, research 150 §3.1)

- **What I did.**
  - Posture values are reCOM's `SEAL_STATE` (`zSeal/zseal.h:59-73`: 6 = `stateInAir`), confirmed by the pushes that
    carry 6: `Jump launch` (`FUN_00588bc0(actor, 8, 6, …)`, D:L440820) and `Slide` (D:L417198).
  - The reload gate `FUN_005b4340(actor, 3)` (D:L469494-469520) refuses an airborne actor (`+0x105e` bit 5 or
    posture 6) and the jump types 8-11 **unless** `FUN_005bda00` holds, which is a launcher-round mode with at least 4
    rounds.
  - In `FUN_005a82e0` (D:L462837-462842), posture 6 plays `Moving rifle reload` when `bVar4` holds (which includes
    `FUN_005bda00`), else it returns 1 with no clip.
- **Answer:** posture 6 is the air. The no-clip branch needs an airborne entry without `FUN_005bda00`, which the gate
  refuses, so it is not reached in normal play. STRONG.
- **Implementation:** none needed beyond a comment. In the air, the port must refuse the reload except in a
  launcher-round mode, where `Moving rifle reload` plays.

## 10. A still reload while peeking (`PEEK_HOLD_CONTINUES_READING`, completing C2 §1.13)

- C2 read the pop (D:L462925-462928) but not whether the gate refuses posture 3.
- `FUN_005b4340`'s code-3 path (D:L469305-469520) has no posture-3 refusal: posture 3 is refused for code 4 (the swap)
  only.
- **Answer:** a still reload mid-peek is accepted and ends the peek. STRONG. The re-peek during the reload's
  `NoInterrupt` is still unread.
- **Implementation:** as C2 wrote it, with this citation.

## 11. The weapon switch's blend (`U-R80-SWITCH-BLEND`)

- `motion.rdr` (`rdrrec.ts`): `seal_rifle2pistol`, `seal_crouch_rifle2pistol`, `seal_prone_rifle2pistol` and
  `seal_mv_rifle2pistol` carry no `BlendTime`, so the loader's default 0.4 applies (D:L131465). The moving one is
  `BlendOverlay`.
- The second channel's body cross-fade is the literal 0.4 (`FUN_0057a010` D:L438556-438640, five stores of
  0x3ecccccd), as research 150 read for the reload overlay.
- **Answer:** the switch comes in over 0.4 s (a full-body action, the incoming clip's default) and the moving overlay
  over 0.4 both ways. STRONG: same mechanism as research 150. The port's "the playing motion's `BlendTime`" should be
  "the incoming clip's, 0.4".

## 12. The ladder head's "180" (`traversal.ts:1039`, `U-PEEK-TOP-180`)

- D:L468228-468250: when the facing's dot with the head quad's normal is below 0, the angle is acos (or 2π − acos by
  side).
  - `180` (`DAT_003deae0`, `seal_180`: one-shot, `playback` 0.95, `NoInterrupt`, 28 frames) is pushed.
  - The angular velocity `+0x48` is set to −angle/(duration × (n−1)/n) = −angle/0.9161 s.
- While `180` plays, the root rotation from the clip is replaced by identity (D:L439117-439123; the quaternion
  0x3f6460 is (0, 0, 0, 1) in the dump).
- At the clip's end `FUN_005b1890` continues the mount (D:L446650-446651).
- Its play lasts 0.95 × (27/28)² = 0.883 s (`derive.py`; research 86 had 0.883).
- **Answer:** the turn is spread over 0.883 s. STRONG. The exact total, about 0.964 × angle before the mount aligns, is
  BELIEVED: the consumer of `+0x44..0x4c` was not read. The port's instant turn is a timing divergence that remote
  players see.

## 13. The camera's `+0x45` blend and −5/+5 nudge (`playerCamera.ts:27`)

- `FUN_00296f10` (D:L140700-140790).
- **The nudge.** When the viewed actor (`cam+0xbc`) exists **and the game is offline** (`DAT_0045a0c1` == 0), its body
  answers vtable `+0x2c`, it is **not alive** (`+0xe1` bit 4 clear) and `+0x105e` bit 7 is clear: the look target's
  y −5, z +5. It never applies online.
- **The blend.** When `cam+0x45` is set, eye and target are lerped from the last frame's (`cam+0x2c`, `+0x38`) by
  `cam+0x48`, with two settings:
  - `+0x46` == 0: `+0x48` = 6·dt each frame, an exponential ease at about 0.2 a frame at 30 Hz. Set by `FUN_00297410`
    (D:L141025-141033) **in a network game when the death camera's state `+0x144` reaches 7**, which `FUN_002980d0`
    sets when the dead player moves the stick or the viewed body stops answering (D:L141378-141392, 141605-141625).
  - `+0x46` == 1: `+0x48` += dt, clamped to 1, and the blend ends at 1, so it is linear over 1 s. Set on entering or
    leaving a vehicle (D:L411979, 412193; no vehicle in the port).
  - Cleared by the camera's attach functions (D:L139716, 139853, 139989, 140194).
- **Answer:** PROVEN. The nudge is NOT-A-GAP online. The death camera's release to state 7 with the 6·dt ease is a gap:
  the port's `deathCamera.ts` has no mode 7 (see "Sourced but not implemented").

## 14. The downward lead probe's start -- `LEAD_PROBE_START_PLACEHOLDER` (was: last frame's target z, `playerCamera.ts:211`)

- `FUN_00296f10` passes `sp+0x1c0` as `FUN_0029a950`'s `param_3`, and nothing writes it before the call (prologue
  0x296f10-0x296f48, `disasm.py`).
- `FUN_0029a950` reads `param_3[2]` (`sp+0x1c8`) as the lead probe's start z before writing it (D:L142498-142518).
- **Answer:** the original reads an uninitialised stack word. Its value is whatever the previous call at that depth
  left there. PROVEN. There is no defined value to port.
  - The probe runs only when n.y > 0.625 (looking well down).
  - *LATER 308 (2026-10-26; placeholder):* the start is `LEAD_PROBE_START_PLACEHOLDER` (`playerCamera.ts`, research 83
    section 8.1), with two candidates. `'target'` (the port's value since LATER 308): this frame's target, the probe
    from the target 8 ahead (Fuse's `325f24fb6`). `'lastOutput'` (the port's before): last frame's lead, which the
    word holds if nothing between two frames' calls writes that slot; against a surface at local z = W inside the
    probe's span the lead is then `Z_n = L0 + 8 + W - Z_{n-1}`, a two-frame orbit of several units with the feet,
    yaw and pitch held (Fuse's disc check r7: the eye 1.7-2.7 x and 5.7-6.6 z at a held steep aim on Death Trap and
    Enowapi). Neither is the original's known value. Settles it: a PCSX2 read of `sp+0x1c8` at the read, or a capture
    of the eye at a steep look against a wall (an orbit there is `'lastOutput'`; a still eye, `'target'` or a slot
    another call rewrites).
  - *LATER 491 (2026-10-26; the placeholder's consequence, disc-backed, `enowapiStandDisc.test.ts`):* under `'target'`
    the page's use and fire aim at MP11 gate 1's stand (1128, -100, 425), pitch -45, descends ~83 degrees (82.9,
    section 14.1): the target lies 0.65 past the plane of the panel wall `g342_1` (z 419.35 against 420; LATER 484), and
    `viewFar`'s line through the passed eye and the target (LATER 305) runs nearly straight down. With the stick held,
    `'lastOutput'` gives the same still eye there (section 14.1). The view from the head is 45 degrees under either.
    Neither number is the original's. The capture settles it (H337: stage A on M51, then stage B 5 back from the gate,
    section 14.1), and `'target'` is followed meanwhile.
    Was: "the target lies 0.65 short of the panel wall", "under `'lastOutput'` it is 43.5 degrees, with the two-frame
    orbit against a surface inside the 8", and "the capture at that stand settles it". The target lies past the wall,
    not short of it; the 43.5 came from the page's pitch jumping from -9.17 to -45 in one call; and the gate stand does
    not separate the two starts (section 14.1).

### 14.1 The capture's prediction (H337, 2026-10-27; the port's numbers, not the original's)

**Reviewed 2026-10-27** by the lane's fresh Opus reviewer (`agent-mail/evidence/review-h337-prep.md`, outside the
repository), who re-read the camera object at 0x415ff0 (the ELF's word at 0x406178 included), the fields, the -70 limit
and the stands at their sources, and by the dispatcher's re-look (`review-h337-prep-relook.md`): the readings below,
filed as "reading, pending review", have had the review the truth rule asks of a reviewer who did not write them.

What H337's capture is compared against (the plan: `C:/Projects/agent-mail/evidence/plan-h337-capture.md`, outside the
repository; the steps: `docs/plans/briefs/2026-10-27-h337-capture-steps.md`). Computed from the port's own camera by
`packages/viewer/test/h337PredictionDisc.test.ts` (dev-disc, `SOCOM_DISC`): it replays `PlayerCamera.tick` with either
start -- `localCamera`, the lead probe, `toWorld`, the re-placed target, `cameraPass`, `viewFar` -- and checks the
`'target'` replay against the page's own camera (`WalkMode.gameCamera`, `lookAim`) to 0.001 at each stand.

- **The approach is part of the prediction.** `'lastOutput'` starts from whatever the last call left, so the test
  replays the capture's approach: `init_aim_pitch` (-9.167) held 1 s, look-down at the stick's full `pitch_rate`
  (0.85 rad/s, `FUN_00594600`) one call a game frame (`GAME_FRAME_DT`), then held 10 s.
- **The pitch.** Holding look-down stops at the standing aim limit `min_aim_pitch` -70 (research 83 §2, `pitchLimits`),
  not at -45 as the plan has it. -45 is LATER 491's pitch, reached only by letting go there. Both are predicted, and the
  trace reads the look quaternion (`actor+0x1070`), so the pitch held is known either way.
- **The gate stand does not separate the candidates.** At (1128, -100, 425) the wall `g342_1` is 5.0 ahead, nearer than
  the target's lead (5.66 at -45, 7.52 at -70). The target lies 0.65 *past* the wall's plane (z 419.35; LATER 484), not
  short of it as the LATER 491 line above says. So the `'target'` probe starts behind the wall and never meets it. Under
  `'lastOutput'` the approach's first probing call meets the wall and its next lands past it; from there on the probe
  never meets it either. Both starts end in one still eye. LATER 491's 43.5 degrees under `'lastOutput'` came from the
  page's pitch jumping from -9.17 to -45 in one call, which a held stick does not do. A still eye there at the values
  below is consistent with both starts; only an orbit, or a still eye elsewhere, would tell anything.
- **5 back, at (1128, -100, 430)**, facing the panel (yaw 358.29: the port's look is (-sin yaw, 0, -cos yaw)), the wall
  is 10 ahead: inside the lead probe's span at both pitches (5.66-13.66 ahead at -45, 7.52-15.52 at -70). Stage B
  stands here.
- **Stage A, offline: M51 Seeding Chaos**, the campaign's first mission (research 82: the console's spawn
  (939.44, -145.87, 857.07), `spawn_pcsx2.rdram`). The stand is (960, -140.48, 696), yaw 270 (looking +x).
  - It is 162.4 units from the spawn (toward +x and -z), 16.2 m at the map's 0.1 m a unit, on flat ground; the port's
    walker holds those feet.
  - Along the straight line from the spawn the ground is the terrain (`worldmodel/land119`, then `land122`), rising
    about 5 units, with nothing standing on the line.
  - Facing +x, the map's boundary wall `worldmodel/boundary1`, cameratype 2 (surface bit 19), stands 3.58 ahead
    (x 963.58); a cameratype-0 surface stands 8.99 ahead (x 968.99) at the target's height.
  - **The two probe filters differ here** (the H337 review, finding 1; LATER 341). The port's lead probe tests
    `isCameraSurface`, which skips bit 19: it passes `boundary1` and meets the x 968.99 surface. The original's
    `FUN_0029cbb0` sets mode 0 itself (`FUN_002d4fd0(0)`, D:L143678), so its probe skips bit 18 and hits bit 19: it
    meets `boundary1`. The test replays both (`MODE0` is `isPeekCameraSurface`'s test; `FUN_0029cd20`'s cameratype-1
    picker is not modelled, and the probes here meet cameratype 0 and 2 only).
    - `'target'` starts past `boundary1` (5.66 ahead at -45, 7.52 at -70), so it is the same under both filters.
    - `'lastOutput'` under the original's filter orbits between leads 2.31 and 0.78 ahead at -70 (the eyes 1.53
      apart), not 2.31 and 6.20; at -45, 1.46 apart. So the stand still separates the two starts.
    - At MP11, both stands give the same values under both filters.
  - The stand search kept only stands on flat, dry ground that the walker holds (the pond `pond3` at a larger z than the
    spawn, and the steep bank, were excluded). It found a strip at x 960, z 680-704, with the orbit at yaws 255-285.
  - **No stand with a clear probe reach was found, so this one is kept** (the review's second option). A second search
    (2026-10-27, a scratch test, not kept) looked for a stand on flat, dry ground on a straight walk from the spawn
    whose probe reach (17 ahead at the target's height) meets no cameratype-1 or -2 surface first. Within 260 units of
    the spawn, the nearest side surface was cameratype 2 at every one of 1,378 stand-yaws. Out to 700 units, 7 met
    cameratype 0 first; the one with it 8.5-13 ahead, 370.6 from the spawn at (635.44, -109.37, 1069.07), gave a
    `'lastOutput'` pair only 0.4 apart, and it is no short walk.

The values (two decimals; world units; "eye" is `cam+0x2c`, "target" `cam+0x38`, "placed" `cam+0xd8`; pinned in the
test):

| Stand, pitch | `'target'`: eye / target / placed (still) | `'lastOutput'`: eye, the two calls | Use aim down |
|---|---|---|---|
| MP11 gate (1128, -100, 425), -45 | (1127.56, -65.72, 432.13) / (1128.35, -78.52, 419.35) / (1128.34, -77.57, 419.47) | the same, still | 82.9 |
| MP11 gate, -70 | (1128.15, -64.57, 422.56) / (1128.46, -78.52, 417.50) / (1128.35, -72.17, 419.30) | the same, still | 74.1 |
| MP11 back (1128, -100, 430), -45 | (1127.68, -65.72, 440.79) / (1128.06, -78.52, 428.00) / (1127.65, -65.53, 441.66) | (1127.78, -65.72, 437.49) and (1127.69, -65.72, 440.44): 2.95 apart in z | 43.5 |
| MP11 back, -70 | (1127.91, -64.57, 433.07) / (1128.06, -78.52, 428.00) / (1127.92, -65.70, 432.66) | (1127.95, -64.57, 431.75) and (1128.03, -64.57, 428.88): 2.87 apart in z | 70.0 |
| M51 stage A (960, -140.48, 696), -45 | (948.19, -106.19, 696.00) / (960.99, -118.99, 696.00) / (947.66, -105.66, 696.00) | the original's filter: (947.09, -106.19, 696.00) and (948.55, -106.19, 696.00), 1.46 apart in x. The port's: (952.51, -106.19, 696.00) and (948.55, -106.19, 696.00), 3.96 apart | 45.0 |
| M51 stage A, -70 | (955.92, -105.04, 696.00) / (960.99, -118.99, 696.00) / (955.66, -104.34, 696.00) | the original's filter: (957.24, -105.04, 696.00) and (955.71, -105.04, 696.00), 1.53 apart in x. The port's: (957.24, -105.04, 696.00) and (961.12, -105.04, 696.00), 3.88 apart | 70.0 |

The MP11 rows are the same under both probe filters. On M51 the capture is compared with the original's filter's row
(`MODE0` in the test).

The orbit runs along the look: in z at MP11 and in x on M51. Its size is the replay's approach, not a fixed
prediction. Under `'lastOutput'` the lead's map is l -> c - l (c = L0 + 8 + W), whose fixed point is l = c/2: an
approach that leaves the word at the midpoint gives a still eye, and another approach another size. The 2.9-unit orbit
at the back stand and the 1.5 on M51 are what the replayed approach gives. What is predicted is orbit or still, and
the `'target'` eye. Fuse's disc check r7 (1.7-2.7 in x, 5.7-6.6 in z) was taken at other stands, which are not
recorded, so it is not reproduced here.

**What the capture means** (the instrument's `summarise`, `tools/parity/h337PinePoll.ts`). The window judged is the
trace's held part: the feet within 0.05 and the pitch within 0.05 degrees. Eyes within 0.05 are one position.

- **The sampling.** The window's samples per game tick are its samples over the runs of the clock word. An orbit
  sampled once per two ticks shows one position, so under 2 a tick (or with the clock never stepping) a still-looking
  eye is reported `undersampled`, never still. A skipped tick has no run, so the count can only over-state the rate.
- **The tolerance.** A still eye counts as the `'target'` eye within 0.05; with `--stand` (the feet the prediction was
  computed at) the tolerance grows by the recorded feet's distance from the stand. The instrument's reading is
  provisional either way: a hand-walked stand is off by tenths, so the prediction is recomputed at the feet and pitch
  the trace recorded (`h337PredictionDisc.test.ts` with the recorded stand added).

| The trace's eye over the held window | The reading |
|---|---|
| Two positions alternating frame by frame | `'lastOutput'` |
| One still position, at the `'target'` eye (within the tolerance) | `'target'` |
| One still position anywhere else | **still, not at target**. Not yet a new candidate. First rule out, in order: (1) `'lastOutput'`'s fixed point (an approach that left the word at the midpoint c/2, above); (2) `FUN_0029a950`'s second branch (D:L142501-142529: the lead from n.y with no probe), which a live match may take; (3) the probe's filter (LATER 341: recompute under `MODE0`). Only then (4) another call rewrites the slot, and the placeholder needs a new candidate, not a flip. |
| One position, fewer than 2 samples a game tick | `undersampled`: no reading; poll again |
| At the gate stand (1128, -100, 425): one still position at the values above | either start: no information |

Stage A (single player) settles orbit-or-still offline, but not the gate: the stack word's leftovers can differ in a
live match (the plan's §7).

**The fields the capture reads** (r0001, the disc the console boots; each is reading, pending review). The desktop is
cited at the `ref/desktop` pin.

- **The camera object** is the word at 0x415ff0.
  - `FUN_0029b5d0` builds the 0x188-byte object stored there (D:L49109-49114).
  - Its vtable (0x406170) holds `FUN_002998f0` at +8: the ELF word at 0x406178 reads 0x2998f0, located through the
    ELF's program headers (re-read by the H337 review).
  - `FUN_002998f0` runs `FUN_00296f10` on it, chosen by the object's mode at +0x139 (D:L141977-141979, D:L141999).
  - Desktop research 17 measured this object as the "global camera"
    (`desktop@be557831:docs/research/17-ground-height.md:73`).
- **`camera_ptr` 0x488de8 is not this object** (`desktop@be557831:tools_py/parity/guest_addresses.py:247`). It holds the
  scene's render camera, `*(scene + 0x128)` (D:L50901, D:L54815). The camera object keeps a render camera at `+0xb4`
  (D:L142851), passed in by `FUN_0029b5d0`'s caller from `*(DAT_00408b78 + 0x128)` (D:L49112).
  - Read through 0x488de8, `+0x2c` would be the render camera's words, not the eye.
  - The instrument reads the camera through 0x415ff0. It also records 0x488de8 and `+0xb4`, so the run shows whether
    the two are one render camera.
  - The plan's "`camera_ptr` ... `cam+0x2c`" is corrected here. Whether the two scene words (`DAT_00408b78`,
    `DAT_0045c380`) are one object is not read.
- **Eye, `cam+0x2c`**: the world eye after `FUN_00297410` (D:L140697), before the pass. `FUN_00296f10` stores it at
  D:L140733-140735, or at D:L140786-140788 when blending.
- **Target, `cam+0x38`**: the target re-placed on the eye-to-far line (D:L140713-140715), stored at D:L140730-140732, or
  at D:L140767-140769 when blending.
- **Placed eye, `cam+0xd8`**: `FUN_0029bc90`, D:L143138-143140.
- The three agree with the console's spawn dump, read off desktop research 17 §1 (`:78-80`), to 0.001: the header of
  `packages/viewer/src/playerCamera.ts`.
- **The feet, the actor's `+0x1c..+0x24`**:
  - The actor is the word at 0x408c58 (`desktop@be557831:tools_py/parity/guest_addresses.py:59`).
  - `FUN_00296f10` reads a viewed actor's position there (D:L140794-140796).
  - Desktop research 17 names it the actor's position copy (`:29`).
- **The look quaternion, `actor+0x1070`**: `FUN_0029a950` turns the camera by it. On the console's dump it is
  (-0.0799, 0, 0, 0.9968), the pitch -9.167 (the header of `playerCamera.ts`).
- **The clock word, 0x4365c0** (`guest_addresses.py:60`): recorded raw, to tell one frame's samples from the next
  (`summarise`'s samples per tick).
- **How the words are read.** Every batch is READ64 commands, each 32-bit field the low or high half of its 8-aligned
  double word, as the desktop's client batches (`desktop@be557831:tools_py/parity/pine.py:92-113`). The desktop never
  batched READ32 against PCSX2 (the H337 review, finding 6), so the instrument does not.
- **Not confirmed:**
  - that the r0001 build's camera object is the one PCSX2 shows in a live MP11 match (the run's `cam` and `camB4`
    words will show it);
  - the vtable layout's slot meaning. The object's methods are read, not which slot the frame update calls.

## 15. `min_jump_height` (`physics.ts:294`)

- `FUN_0059ba80` stores it at table `+0x188` (0x44c3d8, D:L456978); its static value is 20.0 (D:L328439), and the disc
  value is 2 m → 20.
- `tableuse.py 188` finds only the static initialiser's store; the getter `FUN_0058ce60`'s three callers read
  `+0x19c..+0x1a8`.
- The same holds for `min_stand_height` (`+0x184`), `min_running_reload_speed` and `min_running_chgweapon_speed`
  (`+0x170`, `+0x174`), and the climb heights (`+0x178..+0x180`; `climb.ts` already found these). The swap's literal
  `|v|² <= 400` equals `min_running_chgweapon_speed` 2 m/s squared, but the code uses the literal.
- **Answer:** NOT-A-GAP. Nothing reads it. PROVEN for absolute and getter access, which are the only ways the table
  base escapes (four `addiu -0x3db0` sites, all checked).

## 16. The jump's integration order (`mover.ts`, `U-MOVER-TRANSITION-JUMP-ORDER`)

- `FUN_0059b440` (D:L456496-456498) integrates in this order:
  1. fall speed `+0x133c` += g·dt (×0.8 during `Ladderslide`);
  2. then y `+0x2e4` −= speed·dt.
- That is velocity then position: the port's order. At the game's frame the running jump tops at **12.27** (C2's
  `derived.py`: "dt=0.03337 v-then-y: 12.267"), not 12.92. PROVEN.
- `JUMP_DELAY`'s reading ("the landing is off while `actor+0x1360` runs") is confirmed:
  - `FUN_005af930` counts `+0x1360` down and launches when it reaches 0 (D:L466797-466803);
  - the landing call `FUN_005b0c10` needs `+0x1360` ≤ 0 (D:L456313-456322);
  - meanwhile `FUN_0059b440` snaps the feet to the ground (D:L456510-456524).
- Not attempted: `mover.ts:127` (the ground state during transitions) and `:1598` (the fall push one tick later).

## 17. The raise readings (`weaponRaise.ts:40` `AIM_HOLDS_RAISE`, `U-ANIM-WEAPONPOSE-RAISE-THROW`)

- D:L453087-453092: the controller asks for the raise (1) when `ctrl+0xc0` > 0, **or when `FUN_005be6c0` (zoom state
  ≥ 4) holds and it is not the binoculars**, that is, in any scope. Otherwise it asks for the lower (2).
- `ctrl+0xc0` is zeroed by the constructor (D:L454805). `vtwrites.py 6694b0 c0` finds no store to `+0xc0` (other than
  to the stack) in any `CSealCtrl` vtable method.
- **Answer:** the game holds the rifle up in a scope. No aim lane was found that holds it. BELIEVED: the writer search
  covered the vtable methods only. `animator.ts:201,747`, `weaponPose.ts:43`, `throwPose.ts:16` were not attempted.

## 18. `matrix_id` (`U-R78-MATRIXID-LIDS`)

- 0x3fc2d0 is the string `"matrix_id"`. `CVisual::Read` reads it into `+0x68` (D:L309604). This confirms research
  78 §2.6's elimination. PROVEN.
- The lids at rest are still owed.

## 19. The binoculars' body (`binocularPose.ts:38,40`)

- **New search.**
  - Disassembled the ELF's executable segments (`textdis.py`).
  - Resolved the anim-id argument of every call to the play and check functions: `0x588bc0`, `0x577e40`, `0x28e780`,
    `0x28e3e0`, `0x28da00`, `0x28e7b0` (`callargs.py`). None passes 0x38-0x3a or 0x7e-0x80 as a literal; the
    computed ones are network or AI replays (`FUN_005a2390`, `FUN_005a2490`, `FUN_005a2690`, the `+0x58` record push).
  - The zoom set's state 4 (D:L410985-410995) only:
    - sets 9.0;
    - starts the `zoom_control` **sound** (0x65c398, via `FUN_0026a250(0x414bb0, …)`);
    - calls `FUN_005b9180` (resets the weapons block's `+0x3c`, then `FUN_00578150(0.5, actor)`, not traced further).

    It starts no body clip.
  - The swap that would carry a hand change is refused in state 4 (§1).
  - The animset rows for the six binocular types carry no `network_log` flag, which the replicated types do
    (`rdrrec.ts animset.rdr …`).
- **Status:** UNRESOLVED. No r0001 path plays the binocular types for the local player; the network replay could. A
  plain "the original shows no binocular body" is not claimed.
- **Owed:** PCSX2, any MP map. Raise the binoculars (d-pad up from first person with an unscoped rifle) standing,
  then crouched. PINE poll each frame the local actor's top anim id (`actor+0x534`), the second channel (`actor+0x1e4`
  → `+0x22`), and `+0x200`. On a second console, poll the same fields for the remote copy of that player.

## 20. The character colour and "lit" (`U-R78-COLOUR-LIT`)

- Not static: data quadword 338 is an EE upload (research 78 §6.2).
- **Owed:** a PCSX2 GS dump of one frame with a SEAL on screen in MP8 (day). Read the skinned draw's vertex-colour
  quadword and whether the light command precedes it.

## 21. The gamepad's "assumed" rows (`gamepad.ts:213`)

- The only `assumed` row is Circle → `boost`, the page's own control.
- `READERC.ZAR/controller.rdr`, preset `Default` (`dynamics.ts controller.rdr`), maps:
  - Circle → `TeamCommand`;
  - L1 → `SwapWeapon1`, L2 → `SwapWeapon2`;
  - R2 → `Inventory`, Square → `Jump`, X → `Action`;
  - LeftStickTap → `FireMode`, RightStickTap → `Reload`.
- W2-R owns the TeamCommand integration. NOT-A-GAP for this cluster.

## 22. Not re-opened

- `AIM_WEIGHT_PLACEHOLDER`, `PEEK_CUTS_ACTION_READING` and `PEEK_STANCE_ENDS_PEEK_READING`: C2 researched them and
  nothing new was brought.
- `KNOCK_LANDING_GATE_READING`: covered by W2-A A08 (`+0x105c & 8`, the setter universe not closed); not duplicated.

## 23. Reproduce

```
cd research-wave-2026-10-04/scratch/R2-C2
python textdis.py                                   # once: textdis.txt
python callargs.py 588bc0 a1 38 39 3a 7e 7f 80      # empty: no binocular push
python regname.py 3deae0 3def08 3dead8 3def50 3deb70 3dec68
python tableuse.py 188; python tableuse.py 18       # min_jump_height unread; max_slope readers
python vtwrites.py 6694b0 c0
python rdram.py C:/Projects/socom_pc/logs/parity/spawn_pcsx2.rdram 44c2c4 3   # look limits 80/-60/89 deg
python disasm.py 54f330 54f410                      # the slide test (0x4080 = 4.0)
python derive.py
T=$WT/node_modules/.bin/tsx
$T dynamics.ts dynamics.rdr; $T rdrrec.ts motion.rdr seal_climbladder; $T rootkeys.ts seal_climbladder
$T polybits.ts > polybits.out
sh show.sh 453288-453312 463148-463190 469305-469520 478939-478956 417030-417200 417206-417245 443326-443364
```

## 24. Owed captures (the console runs, `U-R88-CONSOLE-RUNS`)

All on PCSX2 with PINE, frame-stamped, read at the 30 Hz frame:

1. **The jump.** MP2, a standing jump and a running jump on flat ground. Poll `*0x408c58+0x1c:3` (position),
   `actor+0x133c`, `+0x1360` and `+0x534` every frame. Settles the 12.27 top and the 0.1 s wind-up.
2. **The turn and the camera.** A 1 s full right-stick hold, then a 2 s full run. Poll `actor+0x48`, `cam+0xd8` and
   `actor+0x1070`. Settles research 88 §4 items 1 and 3.
3. **The W+D standing jump's 92.** As research 88 §6.4 writes it: the stick at 45°, the jump pressed. Poll `actor+0x2c..0x34`.
4. **The crouch diagonal** (§6). Crouched at a 45° stick for 2 s; `actor+0x2c..0x34`. Expect 19.80.
5. **The ladder** (§4). MP82's guard-tower ladder at full stick for 2 s; `actor+0x20`. Expect 7.594 u/s.
6. **The slide** (§3). Stand on a steep face, at least 4 tall; `actor+0x1340`, `+0x1344..0x134c` and `+0x534`.

---

## 25. Sourced but not implemented (what remote players see, or what changes gameplay)

1. **The swap's real gate** (§1): refused in a scope or the binoculars, on a slide or a `UseVelY` clip, and during
   reloads, but allowed during stance transitions and after throws. The room must hold the same predicate.
2. **The slide** (§3): a SEAL on a steep face slides and plays `seal_slide`, and its exit can be a hard landing that
   damages. This is gameplay and visible.
3. **The head look's forward lock and clamp** (§5): remote bodies keep their heads forward while aiming, and never
   look past ±89° or −60°/+80°.
4. **The ladder-head "180"** (§12): a 0.88 s turn clip, where the port turns instantly.
5. **The death camera's state 7 hand-off** (§13): online, an eased 6·dt blend when the dead player moves the stick.
6. **The scope holds the rifle up** (§17), which changes the remote pose.
7. **Zoom gates** (§2): no zoom while dead, swapping, throwing, on a ladder or under an overlay. A night-map night
   vision survives a launcher raise.
8. **The bob's signed single-axis phase** (§7): local only.

## 26. Leads for other workstreams

- **W2-A / C1 ([179](179-c1-match-server.md)) (actor permission):** `FUN_005b4340` codes 3 and 4 are read here (§1, §9). Codes 1, 2, 5-8, 10 and 0xb
  share the same frame. The slide speed `+0x1340` and `UseVelY` (motion `+0x4a` bit 4) are new refusal inputs.
- **The `motion.rdr` flag byte** `+0x4a`, all bits now named from the loader (D:L131341-131396):
  - bit 0 `Lateral`, bit 1 `VerticalMotion`, bit 2 `BlendOverlay`;
  - bit 3 !`NoPitchtwist`, bit 4 `UseVelY`, bit 5 !`NoHeadlooks`;
  - bit 6 `OverridePlayerControl`, bit 7 !`NoTurn`.
- **C9 ([188](188-c9-world-render-platform.md)) (render):** `matrix_id` confirmed (§18). The colour lane is owed (§20).
- **C1 (room):** the swap predicate (§1) and the slide (§3) must run in the authoritative mover too.
- **Hostage / H-lane:** `+0xeac` refuses swap and reload and appears in the action gates. It is plausibly the
  controlled-hostage link, but this was not read.
- **Polygon packed-word bits 28-30**, the slide kind: value 4 on all 304,126 disc polygons (`polybits.out`). A map
  editor or port loader can ignore it.

## 27. Verification (V5, 2026-10-04)

The verifier's file: `research-wave-2026-10-04/V5-verify-hostage-closures-round2.md` (its scripts and outputs under `research-wave-2026-10-04/scratch/V5/`). V5 verified H4 ([199](199-h4-hostage-closures.md)), round 2's R2-C2 and R2-MN ([203](203-r2-mn-match-modes-net.md)), two R2-C3 ([202](202-r2-c3-combat.md)) items and the grenade-spin dispute between C3 ([181](181-c3-combat-hud-effects.md))/V1 and R2-C3. What follows is the verifier's own text for this report's claims, verbatim; its claims about the other reports are in their notes ([178](178-the-research-wave-of-2026-10-04.md) has the table).

Verifier V5, wave 2026-10-04. Read-only; no builds, runs, git writes or network. `D:L<n>` is a line of
`C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (r0001). I used my own tools, not the authors' helpers.
- `scratch/V5/v5.py` reads `game/disc/socom2_game.elf` through pyelftools, disassembles with capstone and prints the
  decomp.
- The jal, word, lui and store scanners are mine.
- Second-route values come from the PCSX2 RDRAM dump `logs/parity/spawn_pcsx2.rdram` and from raw disc bytes.

Every script and output is in `scratch/V5/`; its `README.md` lists them.

### 27.1 Verdicts

| # | claim | verdict | one-line reason |
|---|---|---|---|
| R2-C2 swap | Swap gate lists | **CONFIRMED-WITH-CORRECTION** | `UseVelY` (`FUN_0057b510`) is in the **reload** (code 3) branch, not the swap. "Most actions do not refuse it" ignores `FUN_005a7de0(actor,1,1)`, which also refuses postures 4/5/7+, CQB/stab clips, the overlay +0x1e4 and the NoFire windows of the active layers. |
| R2-C2 slide | > 50°, polygon ≥ 4 tall, speed += (1−n_y)g·dt | **CONFIRMED** | cos 50° = 0.64279 and g = 235 are read from RAM; lui 0x4080 at 0x54f3c8; the motion lines are exact. Minor: the foot search runs a multiplier from 1.0 to < 10 in steps of 0.1 (~90 probes), not "10 steps". |
| R2-C2 ladder | 7.594 u/s | **WRONG** | Missed `FUN_0028aa20` (D:L131631 → D:L133196-133219): a looped clip's +0x14 = duration × 100 / stride. In RAM, `seal_climbladder` +0x14 = **1.7778**, not 1.0. Rise = 0.135 × 1.778 / 0.1778 × 10 = **13.5 u/s** (= max_velocity × 10). |
| R2-C2 head look | Clamp −60..+80 / ±89; forced forward when raised or posture > 1 | **CONFIRMED-WITH-CORRECTION** | The clamp values are confirmed in RAM. But the forcing block (and the turn lead and `FUN_00600550`) sits under `DAT_0066b3e0 != 0`. That BSS byte has no writer anywhere in the ELF and is 0 in three dumps, so the forcing never fires in play. |

### 27.2 R2-C2 swap gate (CONFIRMED-WITH-CORRECTION)

- **Press path.** Actions 9 and 10 (D:L453288-453312). Both require `FUN_005a8cb0`, the slot usable, the slot within
  the count, and `FUN_005c4fd0`; otherwise the refusal sound plays. Confirmed.
- **`FUN_005c4fd0`** (D:L478941-478956): refuses byte 1 bit 1, +0x87c > 0, or zoom state ≥ 4. Confirmed.
- **`FUN_005b4340(actor,4)`** (D:L469307-469559), as I read it:
  - dead / posture 8;
  - fall and land knock-downs;
  - clip `DAT_003deae0`;
  - posture 5 or kind 5;
  - clip `DAT_003def08`;
  - kind 8, posture 9/10, +0xeac;
  - a swap or a reload playing;
  - the dee20/28, dee10/08 and dee48/50 clips;
  - +0x1060 bit 4; anim set 0x44d3f8;
  - posture 4 or kind 4;
  - posture 3 or kind 3;
  - airborne or posture 6;
  - jump types 8-11 (`FUN_00587f50` / `FUN_00587f10` = types 8/9 and 10/11);
  - slide speed > 0.001.

**Correction 1.** "Any clip with `UseVelY`" is wrong for the swap. `FUN_0057b510` is tested only in the
`param_2 == 3` branch (reload, D:L469494-469520).

**Correction 2.** `FUN_005a8cb0` also requires `FUN_005a7de0(actor,1,1)` (D:L462594-). That function refuses:
- every posture except 0, 1, 2, 3 and 6;
- +0x1060 bit 5; kind 8;
- the debxx clips and the 0x3deb20/30 pair;
- a reload or swap; the CQB, stab and restraint clips;
- posture 9; `FUN_00587f90`'s clips;
- an overlay at +0x1e4; +0xeac; +0x1060 bit 4;
- a jump while holding the 0x97-category weapon;
- and, with param_3 = 1, the active layers' 0x20-flag time windows (`FUN_0058a8c0`; W2-A's NoFire).

So R2-C2's "a throw does not refuse a swap" is unproven until the throw clips' windows are read (W2-A's lane). The rest
of the list stands.

### 27.3 R2-C2 slope slide (CONFIRMED)

- **Test** `FUN_0054f330` (D:L417208-417246):
  - kind 1 never slides;
  - n_y < `DAT_0044c268` = **0.6427876** (RAM; D:L328374 writes 0x3f248d3b);
  - top − bottom ≥ 4.0 (lui 0x4080 at 0x54f3c8), or prone, or no extent.
- **Motion** (D:L417093-417199):
  - speed += (1 − n_y) · `DAT_0044c250` · dt, with `DAT_0044c250` = **235.0** (RAM);
  - move = speed · dt · n_y · (n_x, n_z);
  - `Slide` is pushed past 0.25 · g;
  - the landing test applies past `DAT_0044c25c` = **40.0** (RAM).
- Minor correction: the foot search (D:L417164-417180) scales the step by 1.0, 1.1, … < 10 (about 90 probes).

### 27.4 R2-C2 ladder (WRONG: 13.5 u/s, not 7.594)

R2-C2's chain is right up to `FUN_0028d570` (D:L134834-134842): the node speed is stick × scale × **clip+0x14** for a
looped clip. R2-C2 took +0x14 = 1.0 from the file head and the constructor. But the motion loader then calls
`FUN_0028aa20` (D:L131631), which for a looped clip with stride > 0.2 sets **+0x14 = duration × 100 / stride**
(D:L133196-133219; duration / stride when max_velocity < 0).

In RAM (`clips_rdram.py`, `out_clips.txt`):

| clip | +0x10 duration | +0x14 | +0x18 stride | +0x1c scale |
|---|---|---|---|---|
| seal_climbladder | 0.1778 | **1.7778** | 10.0 | 0.135 |
| seal_run | 0.6333 | 1.7330 | 36.54 | 0.65 |
| seal_walk | 0.8333 | 5.5758 | 14.95 | 0.65 |

The duration, stride and scale R2-C2 derived are all right. With `FUN_0028c4f0`'s advance (D:L134252; the
`FUN_0028ada0` factor is 1 for looped clips):
- cycles per second = stick × 0.135 × 1.7778 / 0.1778 = **1.35 × stick**;
- rise = 1.35 × 10 = **13.5 u/s** at full stick.

In general a looped clip's root speed is max_velocity × 10 × stick. The port's 7.59 is 0.5625× too slow. The same
correction applies to R2-C2 §8's "head +0x14 is the rate multiplier, 1.0 on all 341": that is true of the file, but
looped clips overwrite it in memory.

Grade STRONG; owed: the PINE climb R2-C2 already lists (expect about 0.45 u/frame).

### 27.5 R2-C2 head look (CONFIRMED-WITH-CORRECTION)

- **Clamp values** (RAM): 0x44c2c4 = 1.3962634 (80°), 0x44c2c8 = −1.0471975 (−60°), 0x44c2cc = 1.5533430 (89°);
  cosines 0x44c2fc/300/304 = 0.17365 / 0.5 / 0.01745.
- **Loader:** keys `max_look_pitch`/`min_look_pitch`/`max_look_yaw` (0x65eae8/f8/0x65eb08, D:L456781-456791).
- **Forcing rule:** `FUN_005e0010` = +0xf74 & 0xef; `(== 1) || posture > 1` → priority-3 forward (D:L454004-454006).
  Correct as code.
- **Correction.** That whole block, including the turn lead and the call `FUN_00600550`, is inside
  `if (DAT_0066b3e0 != 0)` (D:L454002-454023):
  - `memscan.py`/`basescan.py` find **no store** to 0x66b3e0..0x66b3e3 (and none to 0x66b3dc), only the read at
    0x596f54;
  - `findw.py` finds no data pointer to it;
  - it is BSS, and it reads 0 in `spawn_pcsx2`, `postload_pcsx2` and `title_pcsx2`.
- So for the local player's controller (CSealCtrl slot +0x10 = 0x596f10) the forcing never runs in the shipped game.
- Implement the clamp (it is reached from 0x5ae674 for other users). Do **not** implement the forward-forcing or the
  turn lead for the local player. The latter is also a correction to the port, which already has the turn lead (per
  R2-C2).
- Grade: STRONG. The one remaining risk is a write through an unusual base pointer, which my two scans did not find.

### 27.6 Things to carry forward (items 2, 4 of its "Sourced but not implemented" and items 1, 2 of its "Leads")

**Sourced but not implemented (found while verifying)**

- **Looped-clip rate normalisation** `+0x14 = duration × 100 / stride` (`FUN_0028aa20`). It affects every looped clip
  in the port's motion playback, not only the ladder.
- **SEAL anim set top speeds** from RAM: forward 65, back 37, strafe 65, crouch 20.

**Leads for other workstreams**

- **W2-A (NoFire):** `FUN_005a7de0(actor,1,1)`'s window test also gates the swap and the HUD weapon menu.
- **R2-C2 / port:** remove the local player's head-look forcing and turn lead (dead behind `DAT_0066b3e0`); re-check
  `FUN_00600550`'s other caller 0x56fd70 (the AI tick) for what remotes and AIs do.
