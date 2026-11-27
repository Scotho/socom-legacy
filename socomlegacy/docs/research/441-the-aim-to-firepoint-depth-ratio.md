# 441 -- The aim-to-firepoint depth ratio: the climb's cap, the round's error at the firepoint (LATER 1141)

- Date: 2026-11-17, built 2026-11-18. Branch `agent/later-1141` (worktree `wt-later-1141`), base `agent/next`
  b679913838 (= `main`); LATER 1141 (the bugs seat's row, `handoffs/stage2/TASK-ROW-depth-ratio-from-bugs.md`). The
  research number was claimed through the merge seat (LATER-CLAIMS.md).
- Track: simulation. **BUILT, reading, pending review** (section 7). The hold of 2026-11-17 (the main controller
  e09c6f3d, option (ii)) was lifted by the owner's approval for the next patch; the main controller ruled on 2026-11-18
  (about 01:2xZ) to build way (a), the literal transcription, with f computed from the port's LIVE geometry. The
  section 3 miss sits in the inputs (the eye's distance, the wall stop, the firepoint depth), not the formula; it is
  reported, not fitted, and has its own row, LATER 1159.
- Evidence kinds, kept apart:
  - **(D) source inspection** of the decompilation, reviewed twice:
    - `reviews/later-1141-reading-review.md`: FAIL on the error's function, the rest passing;
    - `reviews/later-1141-reading-recheck.md`: PASS WITH FINDINGS on the corrected reading.
    - Both are under `evidence/weekend-mega-2026-11-14/` in agent-mail.
  - **(C) a capture of the original** scored by the bugs seat and a fresh reviewer: the 552 SD, crouched, unscoped, MP6,
    two poses (`bugs/captures/cap552/`, `bugs/P1-later1141-fresh-review.md`).
  - **(U) a unit measurement** of the port's own geometry: `viewer/test/depthRatioCheck.devdisc.test.ts`, committed on the branch,
    one hub run 2026-11-17 (about 02:55Z), passed, the disc present.
  - **(O) none beyond (C).**

## 1. The reading (D; reading, reviewed; levels below)
- **The factor** f = (d_aim − d_fire) / d_aim. A point's depth is d(P) = (cam+0x30 − P) · cam+0x20: +0x30 is the
  camera's position, +0x20 its axis (`FUN_00290830` D:L136933-136955). The sign cancels.
- **P1 (d_aim) = the local actor's `+0x1458`** (`FUN_002b3580` = `DAT_00440c38`), as the camera frame leaves it.
  `FUN_005aa6e0`, from the camera update `FUN_002998f0` D:L142026-142029, writes it by precedence:
  1. a picked target's jittered point, when `FUN_005ab1c0` picks one. This is the aim assist, OFFLINE ONLY:
     `DAT_0045a0c1 == 0`, D:L464201-464257 (research 302 §10);
  2. else an obstruction on the line of fire (D:L464335-464370; it overrides a ray hit unless within 0.008 an axis;
     written D:L464342);
  3. else the camera ray's hit (D:L464273);
  4. else the ray's end (D:L464261).
  - `FUN_005deec0` may restore last frame's point from `+0x147c` (D:L493790).
  - Some frames write nothing (D:L464084-464094).
  - Whether the camera frame runs before the kit within a game frame is not shown (D:L417891-417907): at most one frame
    late.
- **P2 (d_fire) = `+0x1c` + `+0x14b0`:** the actor's position plus the `firepoint` node's offset, stored already rotated
  by `FUN_005df450` / `FUN_005df930` (D:L493888-493889, D:L494079-494104). `FUN_00309240` is an add. A round mode's
  `firepoint_203` (D:L475529) is not followed.
- **The clamp** (`FUN_005c3360` D:L477753-477789), run only at zoom state ≤ 3 (the test at D:L477753):
  - vertical cap on kit+0x24 = ReticuleKnockMax (the stance record's +0x08) × cam+0x474 × f;
  - horizontal cap on kit+0x20 = ReticuleKnockMax × cam+0x470, with no f.
- **The stored offset** (`FUN_005bd100` D:L474215-474271): +0x5d4 / +0x5d8 = the knock's offset × k × tanf(...) / half
  the screen, with k = d_aim / (cam+0x474 × (d_aim − d_fire)) = 1 / (scale × f) at every zoom state. The radius +0x5dc
  takes no k, and is zeroed when scoped (D:L474219).
- **The emplaced weapon.** body+0xeb8 non-null is the mounted turret. Its vtable +0x60 writes P2 and P1 is set to P2
  (D:L477771-477776, D:L474234-474239), so d_aim − d_fire = 0. The cap then keeps cam+0x474 unmultiplied, and k = 1.0
  (not 1 / scale).
- **The round's error is applied AT THE FIREPOINT.** `FUN_005be9a0` calls `FUN_00592260` (vtable +0x74 in all four
  vtables, checked in the ELF) once a pellet (D:L475592-475602).
  - The direction is the normalised (`+0x1458` − the round's origin) (D:L475550), taken into the body frame.
  - It adds (+0x5d4 + +0x5dc·r1) along d × up and (+0x5d8 + +0x5dc·r2) along (d × up) × d, "up" the body's own. The axes
    are not normalised and the result is not renormalised; the values are tangents, so the spread is a square.
  - It is then rotated back (D:L475559, D:L475597).
  - The fallback: the cone is taken about `+0x1440` when the aim bit is clear, or when the dot product is ≤ 0.9 and
    +0x174 ≠ 2 (D:L475535-475547).
- **What follows, as algebra for small angles (not measured):**
  - In the camera's view the knock lands where the reticle points (k × f = 1 / scale).
  - **What is STORED:** the radius +0x5dc, the same at both depths: 0.01684 at size 10 (C). **What is DRAWN in the camera's
    view:** that radius applied at the firepoint, so f times smaller than the same radius about the camera's ray. The
    port applies it about the camera's ray today.
  - It breaks or changes for: a picked target or an obstruction point as P1; off-level aim (both axes × cos pitch); a
    rolled or leaning body; a fire line far off the camera's axis; `firepoint_203`; the +0x1440 fallback; a non-local
    body; mounted; scoped.
  - The reticle's own drawing was not re-read for this note.

## 2. Measured (C; capture-scored, one scope)
- **The cap:** −21.5..−21.6 at pose A-d30 and −37.5..−37.6 at A-d100 (crouch ReticuleKnockMax 54). None within thirteen
  rounds at the farther third pose.
- **The stored upward offset per pixel of climb:** medians 0.005963 and 0.003431, against the port's 0.0023822 (2.50 and
  1.44 times). The greatest offset is 0.12863 at both. The sideways offset is 0.
- Scope: the 552 SD, crouched, automatic, unscoped, one map spot, one hold per case.

## 3. The port's own geometry at the two poses (U): the check MISSED (built anyway under ruling (a); LATER 1159)
- **Inputs, all the port's:**
  - yaw 270, facing +x (`cameraRig.ts:106-109`);
  - crouched root 5.504 (`mover.ts:685`), eye 15.378 at pitch 0;
  - the camera 28.0 behind the target (`CAM_BACK`, `FUN_0029a950` "fStack_8 + 28.0" with the root's z zeroed by
    `FUN_0057a330` D:L439147-439148; the page's rig is recorded "confirmed against the console, to 0.001",
    `playerCamera.ts:37`);
  - the WALL from MP6's grid at x 1233.00 (5.88 past the body's stop at 1227.12);
  - the firepoint the crouch IDLE pose (1.341, 7.090, −11.438) (`PLANT_PICK_FIREPOINT_READING`, research 217 §1.3), NOT
    the firing pose.
- **Results** (cap = 54 × f):
  - A-d30: f 0.3826 / 0.3848 / 0.4020 at pitch 0 / −5 / +5, caps 20.66 / 20.78 / 21.71.
  - A-d100: f 0.7054 / 0.7114 / 0.7171, caps 38.09 / 38.41 / 38.73.
  - At pitch 0 the offsets per pixel are 0.006226 / 0.003377.
- **Against the measured:** near 4 % LOW, far 1.4 % HIGH. The misses go opposite ways, so no single firepoint or pitch
  fixes both. An input of the port's differs from the original's, or the poses or the wall are not what the logs say.
- **The port's own posed 552 SD firepoint** (U; `viewer/test/firepointPose.devdisc.test.ts`, committed on the branch, one hub run
  2026-11-17 about 03:07Z, passed; model `sig_commando`, first key, body frame from the feet):
  - crouched idle `seal_crouch`: (1.869, 6.997, −9.199), 9.20 ahead;
  - crouched firing `seal_fp_crouch` at raise 1: (2.263, 9.040, −11.093), 11.09 ahead.
  - With the firing firepoint the caps are 20.95 (−2.8 %) and 38.23 (+1.8 %): **still opposite ways**. With the idle
    firepoint, 22.55 and 39.00, both high.
  - So the firepoint alone does not explain the miss. The camera's position, the aimed point, or the pitch remains.
  - Side finding: `PLANT_PICK_FIREPOINT_READING`'s crouch 11.438 is the M4 SD's idle reach (model muzzle 7.7854). It is
    not the plain M4's (9.52 idle) nor any firing pose.
- **Two-point solves: SENSITIVE, NOT A RESULT.** They are recorded only to show the size of what is missing, and nothing
  is fitted:
  - with the camera and firepoint both free, the measured caps give a camera about 36.4 behind the feet and a firepoint
    about 7.0 ahead;
  - with the camera held at 28.0, the firepoint would have to be 10.35 at one pose and 12.83 at the other.
  - Each moves by whole units for a 0.1 px change in the cap, or a degree of pitch.

## 4. What the capture must give, and when the check passes
- **Ordered of relay-1** through the coordinator: at A-d30 and A-d100, crouched, idle AND while firing, one snapshot a
  frame keyed by the game's frame counter:
  - **cam+0x30** (the camera's position) and **cam+0x20** (its axis), from the camera `DAT_0045c380+0x128`;
  - **cam+0x474** and **cam+0x470** (the scales);
  - **the local actor's +0x1c** (position) and **+0x14b0** (the rotated firepoint offset);
  - **+0x1458** (the aimed point);
  - **kit+0x24** (the climb) and **DAT_0066b678** (the stored factor). The rig's earlier three-distance trace read the
    latter as 0 on r0004: the address is r0001's, so either the r0004 address or the cap via kit+0x24 alone.
  - the pitch (the look), and the body's +0xeb8 (null).
- **The check passes when both hold:**
  - **(a) internal:** f computed from the captured cam+0x30, cam+0x20, +0x1458 and +0x1c + +0x14b0 reproduces the captured
    cap (|kit+0x24| at its hold) within 0.5 % at both poses. The same frame's arithmetic should agree to float, so a miss
    means the reading is wrong.
  - **(b) the port:** the port's own camera position and firepoint at those poses lie within 0.5 u of the captured ones,
    and its aimed point within 0.5 u of +0x1458. Together that is under 1 % on the cap.
  - Where (b) fails, the differing input is its own finding, under its own constant and note, before LATER 1141 builds.

### 3.1 The residual the build carries (the controller's condition 1; U, a dev-disc run 2026-11-18 about 01:21Z)
- Re-run on the trunk (b679913838) with the port's camera and the crouch idle firepoint: near f 0.383 (cap 20.66), far
  f 0.705 (cap 38.09) at pitch 0. **Against the measured caps, the built cap is 0.9 px under at the near pose and 0.5 px
  over at the far pose.**
- The flat solve (the two measured caps, the poses 70 u apart along the level look): d_aim(near) **71.9** and d_fire
  **43.1**, where the port has **63.9** and **39.4**. REPORTED, NOT FITTED: the port takes its own geometry.
- (Superseded by §3.1a: the check ran at pitch 0.) Held as a documented, not-yet-met check: `CAP552_MEASURED_F_READING` in `viewer/test/depthRatioCheck.devdisc.test.ts`,
  an `it.fails` (the miss held as a miss; it turns red, to be re-filed, when the geometry meets it).
- The 20-minute look for existing evidence (the controller's condition 2) found none that settles it: the cap552 traces'
  camera columns are empty (`f_66b678` 0, `cam_474`/`cam_470` blank: the camera pointer was not read) and `poses.log`
  holds the feet and yaw only. One side fact: the original stopped the body at x 1227.12, the port's grid wall is at x
  1233.00. LATER 1159.

### 3.1a The geometry gap closed (LATER 1159, 2026-11-18; a trace of the original read from memory)
- **The pitch, not the eye.** PC 3 read the original at both poses (r0004 on stock PCSX2 2.8.2, MP6, one console; the
  posture word `actor+0x174` 1 crouched on every row, plus a standing set at 0; 30 rows a set; agent-mail
  `evidence/bugs-2026-11-18/l1159-crouch-read`). The original rests looking 9.17 deg DOWN in every stance with no pitch
  input -- `+0x1070` (-0.0799, 0, 0), cam+0x20's y 0.159 -- `dynamics.rdr`'s `init_aim_pitch` -9.167, which the page's
  camera already spawns at (`playerCamera.ts` `INIT_AIM_PITCH`, `walk.ts` `setPose`). §3.1's check ran at pitch 0.
- **The eye matches.** cam+0x30 is 24.906 behind the feet and 19.603 up crouched (25.709 standing); `localCamera` at
  -9.167 with the pass's reach (dist + `CAM_MARGIN`) gives the same to 0.01 u (`playerCamera.ts`'s console dump note).
- **The aim matches.** +0x1458 lies on the wall face x 1233 at A-d30 (y 9.78) and on the FLOOR at x 1223.58 at A-d100:
  the 9.17-deg look lands before the wall. The port's grid ray meets both within 0.12 u (A-d100: 1223.69 against 1223.57).
- **The original's own f**, d(P) = (cam+0x30 - P) . cam+0x20 from its own firing sets' means: A-d30 **f 0.39812**,
  A-d100 **f 0.69538**. Against `CAP552_MEASURED_F_READING`: A-d100 inside; A-d30 at the band's LOWER EDGE (0.002 px
  under it; 14 of its 30 rows inside). The capture's scoring and the memory agree to within half the capture's 0.1-px
  reading step (§4's check (a)), the tolerance the tests state (`CAP_TOLERANCE_F`, 0.05 px).
- **The port with the original's firing +0x14b0** (carried into the port's pose along the original's own heading, 1.5 deg
  off +x; +0x14b0's own frame is unread) gives the original's own f to 0.007 px (A-d30) and 0.010 px (A-d100). With its
  OWN posed firing firepoint at -9.167 it gives f 0.38935 at A-d30 (0.47 px under the original's: the miss) and 0.69443 at
  A-d100 (0.0515 px under: AT the 0.05-px tolerance, not told apart from it -- the frame question alone moves f ~0.04 px). The residual is the firing firepoint (§3.2), LATER 1202. The tests:
  `viewer/test/depthRatioCheck.devdisc.test.ts` (three passes, one `it.fails`).
- §3.1's "flat solve" (d_aim 71.9) assumed a level look; it is withdrawn. The wall (the aim ray's material filter) and
  the eye's 28 are not the inputs.

### 3.2 The firepoint under aim pitch (U; the brief's first step; a reading)
- The port's posed firepoint FOLLOWS the aim pitch: the page hands the camera's pitch to the body (`walk.ts`
  ~:2657, `snapshot`'s `pitch`) and the animator's spine twist (`FUN_005aca70`, `TWIST_SHARE` 0.1 / 0.4,
  `animator.ts` ~:1579-1592) turns the gun. The 552 SD crouched firing (raise 1): the barrel's elevation 9.5 deg at pitch
  0, 26.4 at +20, -7.3 at -20; the firepoint's height 9.04 / 11.59 / 6.31
  (`viewer/test/firepointPose.devdisc.test.ts`, a measurement). No root there.
- **16.9 deg of barrel per 20 deg of aim** -- the transcribed twist's sin-weighted share -- is a READING; the original's
  ratio is unmeasured (an RDRAM read of `+0x14b0` across a pitch sweep settles it).
- **Against the original (LATER 1202; PC 3, 2026-11-18, at the spawn pitch -9.167):** idle, the original's +0x14b0 is
  (9.37 ahead, 6.91 up, 1.97 across) against the port's posed (9.20, 7.00, 1.87) -- a match within 0.2 u. Firing, the
  original's reads 10.95 ahead, 9.42 up at A-d30 and 11.13 ahead, 8.21 up at A-d100 (its own height moves 1.2 u between
  the poses: the burst's climb), against the port's posed 11.27 ahead, 7.78 up (firepointPose's posing: the clip's
  lowest key frame). That leaves the port's f 0.47 px under the original's at A-d30 (A-d100 sits at the tolerance); the
  `it.fails` holds it.

## 5. Open
- The reticle's drawing against the climb (not re-read here).
- The bloom at close range on screen: a reading, until a capture of impact heights at 30 / 100 / 400 u.
- Other weapons, stances, sideways and scoped: the code's reading only.
- The camera-frame and kit order within a game frame.
- The firing pose's firepoint: see section 6.

## 6. Where the port's two inputs come from (for the controller's question)
- **`CAM_BACK` 28.0:** `FUN_0029a950`'s literal (D:L142485 "+ 28.0" on the posed root's z, which `FUN_0057a330` zeroes).
  The page's rig is recorded "CONFIRMED against the console, to 0.001" (`playerCamera.ts:37`, research 17 §3) -- at what
  stance is not stated there.
- **The crouch idle firepoint (1.341, 7.090, −11.438), 11.44 ahead:** `PLANT_PICK_FIREPOINT_READING` (`objective.ts:184-186`),
  research 217 §1.3: the M4's `firepoint` on the port's pose at each idle's first key. **reading, pending review**, with
  an RDRAM read of `actor+0x14b0` owed.
- **The FIRING pose's firepoint is readable from the disc today** in principle: the page poses it live (`heldItem.ts`
  `muzzleOf`, the weapon's `firepoint` node through the posed skeleton). For a stand aimed clip the note records
  `seal_fp_stand` 15.15 ahead. A dev-disc test posing the 552 SD on the crouched firing clip is not written: the f check
  used the idle pose.

## 7. The build (way (a); reading, pending review)
- **The page's kit** (`viewer/src/accuracy.ts`): `depthRatio(eye, axis, aim, fire)` -- `FUN_00290830` twice, null where
  d_aim - d_fire is exactly 0 (P1 = P2); `Accuracy.round(..., depth)` caps the climb at ReticuleKnockMax x f, the
  sideways cap unchanged (`clampKnock`: the code's two branches, literal for a negative cap when f <= 0);
  `Accuracy.cone(..., depth)` multiplies the offsets by 1 / (magnification x f) -- 1.0 where P1 = P2 -- and leaves the
  radius bare. A caller with no depth keeps today's (f taken as 1).
- **The round** (`viewer/src/fire.ts` `ray`): with a muzzle, the eye's ray is the BARE look and finds P1 (the hull's hit,
  a body under the reticle, or the ray's end); the gun rolls the cone on the firepoint-to-P1 line with f
  (`FUN_00592260` on that direction, `matchFirearm.ts`'s gun). The round leaves the muzzle (or the walled round's kept
  head, LATER 366) and flies its range on its own line; a body it meets is asked down that line. Without a muzzle the
  eye stands in for the firepoint (d_fire 0, f 1): the eye's round, as before.
- **The wire, protocol 19** (`viewer/src/net/protocol.ts`): `fire`'s `aim` is the bare look for a muzzle round, and it
  gains `at`, P1. The page sends `at` only for a round rolled at the muzzle. An 18 peer and a 19 peer refuse each other
  at the hello; no frame changes (an 18 `.s2r` decodes on the live decoders). **The next release drains every host.**
- **The room** (`viewer/src/net/shotCone.ts`, `match/src/room.ts`): for a claim with `at`, it works out the same f
  (`claimDepth`) and judges the round's `dir` in the cone about `from` -> `at`, its offsets (and the scoped sway) x 1 / f,
  the radius bare; its kit blooms the round at f (`ShotCone.round(seq, f)`). What it checks of `at` -- on the claimed
  look within `AT_SLACK_ADAPTATION`, ahead of the eye, no farther than its own first kept hit along the look (the eye's
  query: `aimQueryAdmits` 'eye' with `aimHitKept` on the map's materials), and the look itself bare -- is a BROWSER
  ADAPTATION (our wire, our anti-cheat), in place of the old aim cone and the bind for such a round. A claim without
  `at` is judged as before 19.
- **A walled round** (LATER 366, the owner's divergence: a muzzle the room's start lines meet a wall on leaves its round
  from the kept head): its P2 is that head, the point the round leaves and the room judges from (`claimDepth` takes
  `from`), so page and room hold one f (the fresh review's finding 1; `fire.test.ts`). It follows from LATER 366's
  divergence, not the original (whose round leaves the firepoint).
- **The cheat surface, pinned** (`shotCone.test.ts` (d)): a forged nearer `at` shrinks the cap, but the round's line then
  crosses the look at that point and leaves the reticle past it.
- **The near `at`, bounded** (the fresh review's finding 2; the main controller's ruling, a product-track call logged for
  the owner: a loose form of the body floor): an `at` nearer than the room's own hull along the look (its first kept hit,
  or with none the weapon's range) by more than `AT_SLACK_ADAPTATION` stands only where a LIVE body the round could strike
  -- `rewoundBodies`' set and a player dead now who stood alive then (a superset of it: the hit test also drops one dead now):
  another player (a bot is one) or a targetable hostage, **as it stood at the round's rewound
  tick** (the hit test's `at`: the shown or view tick, capped; alive then, whatever since -- the full review's M1, the room's
  present having refused an honest round at a body killed inside the page's view lag) (`ShotCone.setBodies`, `room.ts`) --
  has a volume within `AT_BODY_REACH_ADAPTATION`: **the hit test's own volumes** at that tick, as `rewoundBodies` builds them
  (the live skeleton's posed boxes, or the stance's set with its lean and prone tilt; the placeholder's capsules only without a
  skeleton), the distance to the nearest box (`bodyPointDistance`) -- the controller's ruling (a) on the delta re-review's S-1:
  capsules with no lean or tilt clamped an honest `at` on a leaning head, a tilted prone body or an outstretched arm
  (`shotCone.test.ts`, "S-1 (a)") -- so the reach covers the slack, the quantisation and the drift alone; otherwise the room takes the hull's point for it (`ShotCone.aimPoint`), and judges and blooms the round from there
  (`check`, `depthOf`). An honest small f needs a wall the hull sees or a body the room knows roughly; a forged `at` in open
  air buys nothing (`shotCone.test.ts`, "a loose (C)" (i)-(iii)).
  - **The reach's basis -- 12 u** (the main controller's ruling on the full review's S1, 2026-11-18, logged for the owner):
    with the bodies rewound, inside the seat's rewind cap the room's body is where the page drew it, as the hit test assumes.
    What the reach covers: the root's pose slack (`ROOT_POSE_SLACK_PLACEHOLDER`, 4) + about 1 u of the history's tick
    quantisation and interpolation (65 u/s over a tick) + about 7 u of drift for a view up to about 100 ms past the seat's cap
    (`rewindCapTicks`: the rewind clamped at `earliest`) at the standing run's 65 u/s (W2.R2; the clips' `maxVelocity` 65); a
    seat lagging further already loses the rewind's fidelity. It narrows the forged-`at` window (LATER 1162's teammate case)
    about 2.5 times. *Was:* 30 u, 65 u/s over the 400 ms rewind ceiling + the slack, when the bodies stood at the room's present
    (`roomAtClaim.test.ts`; `shotCone.test.ts`, "the reach is 12 u": 11.5 u taken, 12.5 u clamped).
  - **The hull's reference** is the room's first kept hit along the look, or the weapon's range, but never farther than
    `AT_OPEN_REACH_ADAPTATION` (550 u): the page's eye ray ends at `min(max(range, 600), MID + the view state's extension)`
    (`FUN_005aa6e0` D:L464097-464114) and the smallest MID on the disc is 550 (MP5, MP82; research 232 s8); the room has no
    map camera, so a capped page's open-sky `at` (its eyeEnd) stands without a body (the second re-review's finding 1). A
    forged `at` at 550 or past has f >= (550 - d_fire) / 550, 0.93 at the port's 39.4: no widening worth having.
  - **The largest cap** (the main controller's question): on MP81 (MID 2500; +300 scoped, research 232 s8) the page's
    open-sky `at` stands at 2500-2800 -- past the 550 reference, so the room takes it AS SENT (`aimPoint` moves only an
    `at` nearer than its reference): the same f, the same cap on the knock. A 30-round burst at 2500 and at 2800, at the
    cone's corners, is taken whole with the room's knock the page's (`roomAtClaim.test.ts`, "the LARGEST camera cap"). The
    550 floor is a lower bound only; no map needs its own MID in the room.
  - **What it costs:** inside 12 u of any body (as it stood at the rewound tick) the near `at` is unbounded as before; a body falling faster than the
    standing run, or a round whose view lies more than about 100 ms past the seat's rewind cap, can stand more than 12 u from the
    room's rewound volume (its bone boxes; capsules only without a skeleton), so an honest near `at` on it, nothing behind within the hull, is clamped (the second re-review's
    low finding 3; the full review's S1). **A door leaf** (the full review's S2; not measured): the room's hull holds the leaves
    as they stand now (`doors.ts`), the page's eye query as it saw them, so an honest `at` on a swinging leaf can be refused
    `at` (the room's leaf now before it) or clamped (the leaf gone); LATER 1162. Hostages vouch as players do (the controller's word: a refused round at a close hostage
    would be a regression in the hostage modes; `roomAtClaim.test.ts`).
  - **Rejected on measurement** (the controller's first proposal, a ceiling at the pre-19 eye-ray cone): it refuses honest
    rounds in the original's own small-f transient -- after a knock built at f 0.9, an honest round's eye-view stands
    0.17-1.04 tangent up at f 0.20-0.10 against the old box's 0.115 (hub unit runs; the first-order argument fails where the
    muzzle's sideways offset dominates |at - from|). Kept as `handoffs/stage2/later1141-F2-ceiling-wip-20261118T021045Z.patch`
    in agent-mail.
- **Refused rounds** the room still blooms (`refuseRound`: rate, a walled muzzle inside the cone) bloom at the round's f
  (the fresh review's finding 3).
- **The emplaced weapon** (P1 = P2, k = 1.0) is built in `Accuracy.cone(..., null)` but the turret's cone does not call it
  yet: LATER 1163 (the fresh review's finding 4).
- **Not moved -- THE BOT EXCEPTION** (the main controller's word, 2026-11-18): the bots' claims (`match/src/bots/shot.ts`
  `sampledClaim`, `viewer/src/net/botAim.ts`) stay on the pre-19 rule (no `at`, the cone on the eye's ray, the climb
  capped at the full maximum), which the room still judges as before. The room's bots are a browser adaptation with no
  original counterpart online (OT.R81, BTL.R3); their move to `at`, the depth ratio and a grid clamp for a wall between
  bot and target is LATER 1161; the launcher round mode
  (`fire.ts` `launch`) keeps its eye-ray cone (no depth given); the turret's own line (`checkLine`, k unchanged).
- **Evidence:** unit tests on the hub (`depthRatio.test.ts`, `accuracy.test.ts`, `fire.test.ts`, `shotCone.test.ts`;
  match `roomAtClaim.test.ts`, red with `room.ts` at the trunk's), each red first; dev-disc measurements; no capture of
  the port, no browser run.

## 8. Readings and adaptations

| Name | Where | What | Status |
| --- | --- | --- | --- |
| `DEPTH_RATIO_AIM_POINT_READING` | `viewer/src/accuracy.ts` | P1 the port takes: the point under the bare reticle found for the round being fired; the original reads `+0x1458` as `FUN_005aa6e0` last wrote it (section 1's precedence; which frame's write the clamp and the cone see is not read) | open: an RDRAM trace of `+0x1458` against the kit's frame settles it |
| `AT_SLACK_ADAPTATION` | `viewer/src/net/shotCone.ts` | 0.05 u: how far the claimed `at` may stand off the claimed look and short of the room's first hit. Basis: the page puts `at` on its look and sends doubles (rounding ~1e-12); the room's first hit is the page's own query on the same hull | a browser adaptation (no original); kept |
| `AT_BODY_REACH_ADAPTATION` | `viewer/src/net/shotCone.ts` | 12 u: how near a body's volume (the hit test's bone boxes; capsules without a skeleton), as it stood at the round's rewound tick, must stand to a claimed `at` nearer than the hull for the room to take it. Basis: the 4 u root slack + ~1 u tick quantisation + ~7 u drift for a view ~100 ms past the rewind cap at 65 u/s (section 7; the controller's S1 ruling) | a browser adaptation (no original); kept; a tighter floor is LATER 1162 |
| `AT_OPEN_REACH_ADAPTATION` | `viewer/src/net/shotCone.ts` | 550 u: the farthest the room takes its hull reference for a claimed `at` -- the smallest page eye reach (the disc's smallest MID, research 232 s8) | a browser adaptation (no original); kept |
| `CAP552_MEASURED_F_READING` | `viewer/test/depthRatioCheck.devdisc.test.ts` (a test) | the capture's f band at the two poses (21.5..21.6 / 54, 37.5..37.6 / 54); the original's own f from memory (0.3981 / 0.6954) sits at it (A-d30 at its lower edge); the port gives the original's f with the original's firing firepoint, not yet with its own | note only (a test constant): LATER 1159 closed (§3.1a); open for the firing firepoint, LATER 1202 |
| the barrel per aim, 16.9 / 20 deg | `viewer/src/animator.ts` (the transcribed twist) | section 3.2 | note only: the original's ratio unmeasured |
| the `+0x1440` fallback | not built | `FUN_005be9a0` (D:L475535-475547) rolls the cone about `+0x1440` when the aim bit is clear, or the dot <= 0.9 with `+0x174` != 2; the port always rolls about the line to P1 (section 1) | note only: the port departs; owed on the simulation track (LATER 1141's row) |
