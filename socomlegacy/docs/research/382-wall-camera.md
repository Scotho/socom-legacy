# 382 -- Wall-side camera presentation and actor-follow obstruction

Date: 2026-11-02. Track: simulation. Status: **reading** for the original calls and filters, independently re-read in WALL-CAM review through `8e3bd450c` (PASS, high confidence); existing owner-authorised presentation adaptations remain adaptations. Source inspected: the supplied `socom2_game.elf.decomp.c` r0001 export. Section 6 says what of draft PR #639's note stays with its body half.

**Landed alone (2026-11-03).** This note comes to `main` with the camera half of draft PR #639 only, cut at `119c2ecf1` onto `main` `09ce85618` on `agent/wall-camera` (the lane's decision; the plan's Log). The body half (#639's segment fan and contact resolution, its research 383) did not come over: the body on `main` is still research 217's, and the camera work here neither needs nor changes it.

## 1. The ordinary downward look

The camera target can be beyond a wall while the body remains outside it. In the synthetic reproduction, feet z=3.5 face a wall at z=0 and pitch is -45 or -70. `localCamera` puts the target ahead of the body's clearance; the obstruction pass starts at that target and can return an eye on its side of the wall. This is the already recorded H337 / research 201 section 14 uncertainty, not evidence to replace `LEAD_PROBE_START_PLACEHOLDER`.

H309 and OBF.R1 require the drawn view to stay outside walls. `NEAR_CLEARANCE_ADAPTATION` previously anchored only a peek's eye and target to the body axis. The same safeguard now applies to ordinary views. Both focus and eye are checked from the body's axis using the existing `headEye` stand-off and the pass's cameratype-1 proximity filter. Ordinary views keep their pre-clearance look direction; peeks keep their existing two-anchor correction. The camera's game eye and target remain the original pass's results and continue to feed shots, orders and perception.

Safe tick endpoints do not establish a safe frame between them. `PlayerCamera.view` checks the interpolated body/eye/focus and near rectangle again, without advancing the pass state. This is presentation protection, not a reading of an additional original collision pass. Existing adaptation constants and `HEAD_EYE_WALL_BACK_PLACEHOLDER` are reused; no new tuned game values are introduced.

## 2. Spectator actor follow

`FUN_002998f0`, D:L141991-141999, dispatches camera kind 2 through `FUN_00296f10`. That computes the actor rig and calls `FUN_0029bf70` before placement (D:L140696, D:L140791, D:L140797-140799). `FUN_002956e0` binds the actor at both camera pointers (D:L139718-139738); `FUN_0029a950` therefore reads the actor root and look for this camera (D:L142451-142545). The old fixed standing offset in `followPose` skipped this pass entirely.

Both the test room and ordinary match now route spectator follow and dead-player teammate watch through the shared
`PlayerCamera`. The live world grid is `WalkMode.gridOfGround`, which stays available outside walking mode and contains
door/world updates. The rig reads replicated stance and peek; its pitch is not the watched body's aim but the remote
look's set-up pitch, `WATCHED_LOOK_PITCH_READING` = 0 (SPECTATE-PITCH, 2026-11-13, section 7: the camera reads the
actor's look, and a remote actor's look is not its aim -- measured for the dead watcher's view by the rig's capture Q6,
a reading for the spectator's follow, measured there at rest only). This is the original's follow camera
(`spectateFollow`); the player's view adaptation that rebuilds the watched player's own camera is research 402's. The
remote body is drawn before the spectator frame; `RemotePlayers.cameraRoot` exposes its existing posed `Play.rootY` to
the rig. With no rendered skeleton, the same measured stance/traversal root fallback as the player is used. Target/map
changes and leaving follow discard the obstruction state; ordinary frames preserve its hold/regrowth.

`followPose` remains only for non-rendering legacy hosts lacking the follow callback. The production shared match builder supplies the callback to both pages. The actual pose looks from the resolved eye through the resolved target, rather than retaining a fixed pitch.

This does **not** implement the original spectator orbit (`FUN_00294b40`, D:L139269-139343), camera transition blend (`FUN_00296f10`, D:L140729-140790), or all actor-local root translation components. Those remain research 248's limitations. Followed dead bodies retain the existing binding lifecycle; this change supplies the shared obstruction pass, not a new death-orbit state machine.

Free spectator flight is separate. `FUN_002964f0` bounds it by authored extents and spatial-cell heights (D:L140531-140593); it does not call the player obstruction pass. Scenic/free behavior is retained. Zero wall penetration for arbitrary free flight would be a further adaptation, not original parity.

## 3. Downward probe filter

`FUN_0029cbb0` explicitly selects mode 0 at D:L143678 and then `FUN_0029cd20` at D:L143689. The lead probe therefore uses the existing movement/peek predicate (bit 18 skipped), and the picker's cameratype-1 proximity rule. The old mode-1 `isCameraSurface` predicate skipped bit 19 instead. The headless room validation does not duplicate this cast: `net/shotCone` sweeps the documented 0..8 lead uncertainty along the facing, so the corrected lead remains within the existing validation domain.

The probe's uninitialised start word remains `LEAD_PROBE_START_PLACEHOLDER` with H337's default. This correction resolves the filter only, not that runtime unknown.

## 4. Evidence and remaining checks

Synthetic tests cover the camera/body-side disagreement, aim preservation, near-plane corners, a wide-aspect corner
orbit and interpolated samples. Shared-page tests exercise the spectator callback, stance/peek and the level set-up
pitch (section 7), map/target changes, living/dead follow and resets. Disc fixtures exercise existing tight wall cases
where available. These are unit/dev-disc evidence, not a physical playtest or original capture comparison.

No new placeholder is introduced here (section 7, 2026-11-13, adds the reading `WATCHED_LOOK_PITCH_READING`). Existing
fallbacks: research 201 owns `LEAD_PROBE_START_PLACEHOLDER`; research 83/90 own `HEAD_EYE_WALL_BACK_PLACEHOLDER` and
camera presentation; research 180/217 own stance roots. H337 still owns the original downward-eye capture.

## 5. MP7 hull-sweep precondition correction

The complete fixture run exposed three failures in the old test's purported legal standing positions, all at `RUN/MP7.ZDB` `worldmodel/build2/mp7_house_h` and its `g26` sibling. The test placed a body 3.5 from one face centroid without checking whether it was inside a neighboring solid. The decoded collision geometry, through `simMapFromBytes` / `worldCollision`, establishes that all three roots are inside a 1.5-unit wall slab:

| fabricated feet | enclosing x faces | outward x normals |
|---|---|---|
| 1229, 113.841920906, 1431.362736967 | 1228.5 / 1230 | -1 / +1 |
| 1229, 105.636481112, 1425.815292818 | 1228.5 / 1230 | -1 / +1 |
| 1174.5, 109.496260194, 1393.765365698 | 1174 / 1175.5 | -1 / +1 |

Both the standing low and head probe heights meet those paired outward faces. This is a solid-interior finding, not a claim that the original's 3.5 segment scale is a capsule radius in every direction. The rendered eye remains between the faces, but its near rectangle cannot fit there. No camera solver change attempts to escape a root teleported inside a solid.

The sweep now rejects only paired outward faces enclosing the axis at both standing probe heights, tested along the sampled face's horizontal normal and tangent. Admission uses body-side polygons and `surfaceMaterial` with the map's `DefaultMaterial`; VOLUMETRIC, LIQUID and camera-only faces cannot establish a solid interior. Tests retain those cases (including material-byte-zero defaults), a single nearby wall and an opposed pair facing into a passage. The sweep still asserts 80 tested anchors per map and preserves its camera-crossing assertion. There are no map/path exclusions.

The three exact rejected samples are held separately with geometry assertions and actual `Walker` approaches from both sides. The first two have supported feet y=102; the camera candidate's approaches stopped at x=1225 and x=1233.5. For the third, its fabricated feet lie below available exterior support: initial supported roofs are y=137.079671921 and y=125.429902260; approaches stopped outside the slab at x=1173 and x=1179. These coordinates were measured with the walker on main (research 217's body, which this note does not change); the regression asserts that approaches remain outside the slab, not those stopping distances, so a later body change does not re-pin them. The reachable trajectories also exercise the camera at pitches -70, -45, 0 and 60. These are dev-disc and port-movement tests, not an original-runtime trace.

## 6. What stays with the body half

Draft PR #639's version of this note also held a section 6, two bounded, unscored original-runtime traces (a copied
r0001 M51 campaign state under PCSX2, 2026-11-02) whose recorded instruction ranges include the body's segment fan and
contact resolver. It is not brought to main with the camera half: it supports no value used here, its body content
belongs with the body work (SEGMENT-BODY), and it stays readable at `119c2ecf1:socomlegacy/docs/research/382-wall-camera.md`.
Neither trace settles H337 or any camera value; nothing in sections 1-5 depends on it.

## 7. Readings (named in the code)

SPECTATE-PITCH (8a's finding 13, 2026-11-13; players reported, through the owner, that spectating follows the watched
player's aim up into a sharp upward angle). Simulation track; **reading, pending review**; the dead watcher's half
**measured** by the rig's capture Q6 (2026-11-13, below), the spectator's follow measured at rest only.

- `WATCHED_LOOK_PITCH_READING` (viewer `src/matchNet.ts`, `spectateFollow`) = 0 degrees: the pitch the original's
  follow camera turns by for a watched remote body. Section 2's "the rig reads replicated pitch" is corrected by it.
  - **What the camera reads.** It aims along the bound actor's look quaternion `+0x1070` turned onto (0, 0, -1000) when
    `cam+0xc0 == cam+0xbc`, a level vector otherwise (`FUN_00297410` D:L140992-140999).
  - **Who writes the look.** Its one writer is `FUN_005af470` (D:L466564; a grep of every store to `+0x1070..+0x107f`
    finds no other on an actor). Its callers:
    - the body's set-up, pitch 0, the identity (`FUN_00553ea0` D:L419805);
    - the pitch routine `FUN_00594600` (D:L452953), on its controller's actor (`ctrl+4`) with the controller's pitch
      `ctrl+0x130`;
    - three camera helpers (`FUN_00299ed0`, `FUN_0029a180`, `FUN_0029a3f0`, D:L142196, D:L142259, D:L142320), each
      writing the look of `FUN_002b3580`, the local actor (`DAT_00440c38`) -- but each first stores a camera-geometry
      angle (clamped to +-1.57) into the BOUND actor's controller pitch, `*(cam+0xc4)+0x130` (D:L142194, D:L142257,
      D:L142318), on a change of camera kind (`FUN_002998f0` D:L141981-142008). So a dead watcher bound to a remote who
      changes view kind can leave that remote's controller pitch non-zero, and state 7 turns it into the remote's look
      (clamped to [0, 0.5] online): not the aim, so the reading stands, but a view non-level at rest that Q6 should look
      for.
  - **Who runs the pitch routine.** `FUN_00594600`'s callers:
    - the local pad controller `FUN_005966a0` (D:L453866) and an AI controller `FUN_005fe880` (D:L510366);
    - the local actor's camera `FUN_002980d0` (D:L141633-141636), only when the bound actor is the camera's own
      (`cam+0xbc == cam+0x150`);
    - camera state 7, `FUN_00295f20` (D:L140144), on `cam+0xc4` -- the BOUND actor's controller (`FUN_002956e0`
      D:L139725-139728). This corrects the investigation seat's read that both camera callers act on the local actor.
      On a dead watcher's console it would turn the watcher's own stick (`FUN_002c6280`, times 2) into the watched
      body's look, by this reading. Q6 (below) measured the watcher's stick orbiting the view while the watched
      controller's `+0x130` did not move, so the stick did not move that pitch; which path the orbit takes (the death
      camera's stick orbit, `FUN_00297a30` D:L141219-141221, is one candidate) is not read here. With his hands off the
      view rests level. The port's teammate follow has no orbit and stays level whatever the watcher's stick does: the
      orbit is measured and unbuilt, research 248 section 3's orbit, its own task.
  - **No network writer was found.** A remote body's controller is a `CRemoteCtrl` (vtable `0x669590`, built by
    `FUN_00599690` D:L455434-455436 on the `CSealCtrl` constructor `FUN_00598280`). Its pitch `ctrl+0x130` starts at
    `DAT_0044c2a4` = -0.16 radians (D:L454774, D:L328380). Every store to `+0x130` and to `[0x4c]` in the export was
    read: the constructors; the camera helpers and their reset (`FUN_002991c0` D:L141699, to 0); a recoil kick
    (`FUN_005b9280` D:L472109-472131, from the body's tick `FUN_00550ef0` D:L418393); a spawn's set (`FUN_002b28d0`
    D:L155855, offline only); and none from a packet. The record apply `FUN_002be150` (D:L162221-162420) feeds a
    controller's stick axes 0, 2 and 1 and the body's lean byte, not the pitch. This is a search, not a proof.
  - **State 7 at rest.** With no stick, `FUN_00594600` still clamps the controller's pitch and writes the look. Online
    with `DAT_00437ce8+0xcc` set, the clamp is [0, 0.5] (or [0, 1] when `+0xf7a == 1`), so the remote's -0.16 lands on
    0, a level look; the other branch's [-0.4, -0.1] would not be level (D:L452923-452952). Which branch a match takes
    is not read here, so the capture below decides it at rest (the online branch also needs `DAT_0045a0c1 != 0`). For a
    PRONE remote (`+0x174 == 2`) the routine first shifts the bounds by the ground's slope (D:L452839-452884) and eases
    toward them (D:L452908-452919): a prone remote on a slope, watched in state 7, can hold a look above 0 at rest. "0
    at rest online" is for flat ground and the other stances; Q6 to look for both.
  - **The measured point at rest.** The rig's 2026-11-12 captures (r0004 on every console, while every transcription
    above is r0001; `agent-mail/evidence/spectate-ease/2026-11-12/`, LISTING.txt's hashes): leg 1, the dead player's
    camera (state 7 in all 7011 samples); leg 2, the lobby spectator (state 0 in all 6986). The stored eye (`+0x2c`) and
    target (`+0x38`) are at one height in 6974 of 7011 and 6968 of 6986 samples, 25.4 to 29.2 apart across. The other 37
    and 18 differ by at most 0.57 and 0.62, each where the eye height was moving (a sample's target matching a later
    sample's eye): torn reads. The watched player only turned and strafed, never touching his vertical stick, and the
    watcher's hands were off -- partial support at rest, not a changing pitch.
  - **Q6, measured** (2026-11-13; the rig, r0004 on every console; the files under the box store's
    `shadow/out/2026-11-13/1c-q6-watch-pitch/`). Three clients, A and B on one team and C on the other; B dead, its
    camera bound to A, the camera kind (`cam+0x144`) 7 on every frame; A standing on flat ground, never prone; B's pad
    untouched but in (c).
    - (a) A still, looking fully up (2.2 s) then fully down (4.4 s), three runs of about 980 frames: A's own pitch -70
      to +60 degrees (A's own eye.y - target.y -13.7 to +13.9). On B's console: eye.y - target.y = 0.000 on every
      frame, eye.y 38.484 throughout; A's `+0x1070` as B holds it the identity (0, 0, 0, 1) throughout; the bound
      controller's `*(cam+0xc4)+0x130` -0.160 throughout (the `CRemoteCtrl` start value `DAT_0044c2a4` above).
    - (b) A walking while pitching, three runs: B's eye.y - target.y within -0.069 to +0.025 (the walk's ground); the
      look still the identity, kind 7, `+0x130` -0.160.
    - (c) A level, B's own right stick: B's eye.y - target.y -23.42 to +23.71, eye.y 3.6 to 50.8 -- the watcher's
      stick orbits the view; kind still 7, `+0x130` constant.
  - **What Q6 settles.** For the dead watcher's view (state 7) the reading is **measured under a changing pitch**: a
    memory trace of the original compared value for value with the port's level follow (eye and target at one height,
    `WATCHED_LOOK_PITCH_READING` = 0); n = 6 runs (three standing, three walking), within 0.0005 u at rest (0.000 at
    the trace's three decimals) and 0.07 u walking. That is PROCESS's definition of proven; it is filed here as
    measured, the reading confirmed, until the trace is committed as the golden trace that holds a proven value. The
    watched player's pitch does not reach the dead watcher's view, and in these runs nothing wrote the remote's look,
    as the search read.
  - **What Q6 does not settle.** The spectator's follow (the lobby spectator) is measured at rest only (the 2026-11-12
    captures above) and is otherwise the reading; its capture under a changing pitch is owed (8a's Q6-S). Neither
    non-level source above occurred in Q6 (no view-kind change, no prone watched body), so both stay readings,
    unmeasured. Whether a remote's recoil kick reaches its look is not measured. The watcher's own stick orbit (about
    23 u either way, (c)) is measured and unbuilt in the port's teammate follow.
- The peek stays the watched body's (`body.peek`): the camera's lean `DAT_004161c0` eases toward the BOUND actor's
  lean byte `+0x375` (`FUN_002998f0` D:L141961-141976; state 8 or 2 gives 0). The record apply writes that byte
  (`FUN_002be150` D:L162319); `FUN_0055d120` (D:L424468) and `FUN_005631b0` (D:L427336, from the message handler
  `FUN_005d09f0` D:L485760) do too. Which of these runs for a remote on a watcher's console is not settled. The captures
  hold the lean byte at 2 and `DAT_004161c0` at 0 throughout, so they do not measure it.
- The player's view (research 402) is a separate adaptation that passes the watched body's pitch and peek to its own
  camera on purpose. This reading is the plain follow's and that view's fallback, and changes nothing there.

## 8. The pass is one-sided on the hull (LATER 1057, issue #812)

2026-11-15. Simulation track; **reading, pending review** (transcribed from the r0001 decompilation, unit- and
dev-disc-tested against the transcription; no capture). The playtest finding (PT-20261115-4a3a-1, MP72): walking in and
out of either gray tent, the third-person boom (target at a standing SEAL's y 64.98) crosses the front valance of
`tent_gray` (tent 1: x 1405.5-1438, y 62.5/63.8-70, z 1550.7-1554.5; material 30, camera-class) from inside. The valance
is one-sided, facing out, with no inward twin. The port's pass cast both ways, so the boom dropped 26.80 -> 0.75 in
one tick and a 1.5 s hold was set; on the way out it sat at 3.38 through the hold (not under the hold's floor, 3.3),
then let out 3 % a game frame (about 4 s).

**The reading** (re-read at the source for this task):
- `FUN_0029bf70`'s main probe: `FUN_0031e0a0(DAT_0045c380, target, eye, ..)` at D:L143385; `FUN_0031e0a0`
  (D:L220080-220099) fills the world's query and runs `FUN_002d4780` (D:L220094), which calls `FUN_002d2890` for each
  collider in the cells it walks (D:L175777, D:L175782, D:L175788).
- Its four side probes: `FUN_0031de90(DAT_0045c380, &puStack_300, 4)` at D:L143549, the four segments queued just before
  it (D:L143514-143543); `FUN_0031de90` (D:L219994-219999) runs `FUN_002d3cf0` (D:L219997), which calls `FUN_002d3030`
  per collider (D:L175698, D:L175703, D:L175710).
- Both per-collider tests set the start word `DAT_003df270` to 0x30 when the collider's `+0x80` bit 1 is set and to 0x20
  otherwise: `FUN_002d2890` D:L174831-174837, `FUN_002d3030` D:L175277-175282 (type 2, D:L175246). With 0x20 the hull
  polygon's VU0 plane test hits only a start in front of the face's normal and an end behind it (research 281 s4.3,
  micro 288-333).
- The hull's colliders are made by `FUN_00316e30`, which sets `+0x80` bit 0 and clears bit 1 (D:L215827-215828).
- **The builders** (2026-11-15; a reading from the decompilation, re-read at the source by LATER 1057's fresh re-review
  at 80478ffe5d and again for its fold): the level reader's node dispatch `FUN_00311520` builds a type 1 or 5 node with
  `FUN_00316e30` (D:L212597-212602); a type 2 node through `FUN_00310da0` (D:L212604-212608), which looks its prototype
  up by name (`FUN_0031fd10`, D:L212344) and instances it with `FUN_00317d90` (D:L212356; the function D:L216393);
  types 8 and 9 (`FUN_003152d0`, `FUN_00321db0`) call `FUN_00316e30` first (D:L214771, D:L222316); the dispatch's other
  branch builds with `FUN_00316e30` too (D:L212652). `FUN_00317d90` writes no `+0x80` itself: its copy is
  `FUN_00316e10` (D:L216411 -> D:L215801), a virtual call through the prototype's vtable `+0xc` whose target the
  decompilation does not show (research 182 s2.3 names it, for a node, as the clone `FUN_00316820`, D:L215638-215790,
  which builds a fresh copy with `FUN_00316e30`, D:L215664, and writes no `+0x80` itself, its callees not read for it:
  supporting, not settling). So an instance's bit rests on its prototype being an `FUN_00316e30` node, on no bit-1
  setter on that path, and on the capture of MP51's `access1` instance, whose collider read `+0x80` = 0x41 (research 281
  s4.3, SEGMENT-BODY part 11). The `+0x80` writes that set bit 1 (`& 0xfd | 2`) are exactly three: `FUN_0032ad20`
  (D:L227610-227611), on a node it names by the string at 0x3f6fe0 (D:L227596; "PARTICLE DI NODE" in the strings
  file), a particle effect's node only; the SEAL's body (D:L419731); and `FUN_001ff8a0`'s structure (D:L59846), already
  accounted for by research 281 s4.3. None is a node the level reader builds.

So the original's pass, main and side, counts a hull face only entered from its front. The same path LATER 250 and
INV-WATER-CROUCH made front-only for the throw's clearance and the overhead rays (research 281 s4.3).

**What changed.** Viewer `cameraRig.ts` `cameraPass` casts every probe through `segmentHits(.., accept, ALL_LAYERS,
true)` (`frontOnly`). It was the two-sided `segmentHit` for the side probes and the two-sided `segmentHits` for the main
probe. The main probe's "any hit" (`DAT_00416038`) is the front-only list's, as the original's is the same query's.
The room's reproduction (`net/shotCone.ts` `reproducedEye`, LATER 305) calls `cameraPass` itself, so the eye that shots,
orders and perception are judged from follows. Nothing else in `shotCone.ts` casts the pass.

**What did not change.** These stay as they were:
- the in-at-once pull, the 1.5 s hold (`CAM_HOLD`), the hold's 3.3 floor and the 3 % let-out (`CAM_REGROW`), all the
  original's by reading;
- the drawn camera's own casts (section 1: the body-side pull, `HEAD_EYE_WALL_BACK_PLACEHOLDER`; H309's
  `clearNearRect`). These are adaptations and stay two-sided, so the drawn eye still jumps at the valance. Whether they
  go front-only is a question for the owner once this lands, not this task.

No constant was added or renamed.

**The tests.**
- viewer `cameraPassFrontOnly.test.ts` (unit): a one-sided face met from behind moves neither the main probe nor a side
  probe and sets no hold; met from its front it does (the controls).
- `shotConeViewLine.test.ts` ("LATER 1057: ...", the room's reproduction): a back wall met from behind pulls neither
  the page's eye nor the room's.
- `cameraPassTentDisc.test.ts` (the dev disc, MP72): the investigation's walk in and out under the valance holds the
  boom at 26.80 and the hold at 0 at every tick.
- The existing camera tests' synthetic walls were written with their normals away from the target, and a one-sided pass
  would meet them from behind. They are re-wound to face the side the boom comes from, so those synthetic cases'
  numbers stand: `playerCamera`, `cameraWallClip`, `cameraThinPost` (the post's faces now face out), `shotConeViewLine`
  (the back wall), `matchNet`, `povCamera`, match `roomBarriers` (`CAMWALL`).
  - `cameraWallClip`'s WALL-CAM downward case is the one wall re-wound to face the target. Its look target lies past
    the wall (H337), and the case asks the drawn guard to protect a game eye left past it.
- *Corrected 2026-11-15* (*was:* "so the base's numbers stand"): three tests' numbers did not stand, and were re-filed
  where the original's pass meets a face from behind (5ddc625b1b). `enowapiStandDisc`'s LATER 491 case (MP11 gate 1,
  pitch -45): the pass meets `g342_1` from behind and no longer holds the eye, so the use ray descends about 43.5
  degrees where it descended about 83 (LATER 491's addendum; `LEAD_PROBE_START_PLACEHOLDER` unchanged, H337).
  `cameraThinPost`'s full peek, its target inside the post: the pass now leaves the eye unpulled at its goal, its near
  rectangle clear of the post (the drawn-eye assertions unchanged). `cameraWallClip`'s stand sweep takes a stand only on
  a face's front (`frontOnly` on the approach).

**Not settled.**
- *A two-sided hull owner.* The port takes every polygon of its grid as the hull's. A collider with `+0x80` bit 1 set is
  two-sided in the original. *Was:* "`FUN_0032ad20`'s (D:L227610-227611) sets it, and what that collider is has not
  been read." Read since (the builders, above): it is a particle effect's node, and every node the level reader builds
  is an `FUN_00316e30` node, bit 1 clear. Still not settled: an instance's bit is carried by `FUN_00316e10`'s virtual
  copy, whose target the decompilation does not show (one instance captured, MP51's `access1`, 0x41); a bit-1 writer
  not of the `& 0xfd | 2` form is not ruled out. The builder citations do not cover clutter nodes or r0004's nodes:
  clutter's `+0x80` stays inferred (research 422 s2.5), and r0004's are not traced.
- *What would settle it* (and move this reading to proven): a trace of the original running, reading `DAT_003de268`
  (the pass's distance) and `cam+0x4c` (the hold) as a standing SEAL's boom leaves a one-sided camera face from behind.
  That trace is owed somewhere other than the r0004 gray tent, because r0004's own 0x2d8500 quads there are camera-class
  and would confound it. The expected result by this reading: the distance stays the goal's and the hold stays 0.

**Owed for the box** (no node run on the authoring host): the targeted files above and the whole viewer, match and
central suites (the pass feeds the room's view-line rule, LATER 305); the disc-backed camera files (`cameraWallClip`'s
disc spots and hull sweep, `cameraThinPost`'s arcade, `povPassCorner`, `playersViewWallLeg`, `h337PredictionDisc`,
central `roomHostageOrderEye`, `turretHold`, `turretPage`), whose disc faces may be met from behind; the corpus
regeneration (`docs/corpus`).

## 9. The view switch's re-pitch (FP-REPITCH, LATER 1582 / 1583)

*Added 2026-11-25 by seat-shots (FP-REPITCH; the controller's ruling (B)). Reading, pending review; r0004 measured.*

**The original.** On the pass the camera's mode changes, before the view is built, the camera re-pitches the local
actor's look once (r0001 dispatcher `FUN_002998f0` D:L141981-142008, the last mode at `cam+0x13a`; r0004
CAppCamera::Tick D4:L149867-149895, ATLAS's throw-aim reading s13.2):

- new 3 (the head) from 2 (third person): `FUN_0029a3f0` (D:L142266-142320; r0004 FUN_0029b980 D4:L150150-150208). The
  vertex is the head eye `FUN_0029ae50`; the look is the actor's `+0x1070` turning (0, 0, -1); the point is the stored
  aim point `+0x1458` (D:L142299-142301) taken into the body's space; each angle `FUN_001b38e0(dy, dz)` in the body's
  y-z plane, both wrapped into [0, 2 pi] with the float 6.2831855; `*(cam+0xc4)+0x130 += a1 - a2`, **unclamped**; then
  `FUN_005af470` turns the head. With z behind the result is the elevation from the head eye to the point.
- new 2 from not 2: `FUN_00299ed0` (D:L142129-142198; r0004 FUN_0029b460 D4:L150013-150084): the same about the tether's
  target `FUN_0029a950` with the look (0, 0, -1000), **clamped to +-1.57 rad** (D:L142185-142194).
- new 1 from 2: `FUN_0029a180` (D:L142203-142261; its r0004 twin `FUN_0029b710`, as viewer `headRepitch.ts` cites it), unclamped; the port's views never enter mode 1 (LATER 1583).

*Correction to section 7's Q6 note:* it says each of the three helpers stores its angle "clamped to +-1.57". Only
`FUN_00299ed0` clamps; `FUN_0029a3f0` and `FUN_0029a180` store the sum as it is (D:L142257, D:L142318).

The stored point `+0x1458` is written every camera pass by CheckDIShoot (r0004 FUN_005b0370; r0001 `FUN_005aa6e0`)
through SetAimPointW (r0004 FUN_005e6cb0, D4:L536093-536101): the eye query's nearest kept hit along the placed eye's
centre line, whatever item is up; equal to the throw's `+0x1464` except after the muzzle-obstruction branch (keep = 1,
D4:L505378-505405, a firearm state; LATER 1583). ATLAS s13.4.

**Measured on r0004** (PC 2; MP51 face 1575, heading 298.6, standing, flashbang):
- C7-OFFCLAMP-PC2: first-person look -5.88 / +1.85 / +4.24 / +7.10 at open / d 30 / 25 / 21 (third person -9.17); the
  launch the same in both views (third / first 18.08 / 18.03, 21.07 / 21.02, 24.50 / 24.41; open 11.73 both).
- THROW-H15-PC2 leg B: switched at d 45.32 the pitch goes -9.17 -> -2.06 and HOLDS walked in to d 22.55 (launch 16.08);
  switched at d 21.32, -9.17 -> +7.10 (launch 24.37).
- REPITCH-BACK-PC2 (d 25): -9.17 -> +4.28 / +4.25 -> -8.70 on both trials.

**The port** (`../../packages/viewer/src/headRepitch.ts` `repitchToward`, `walk.ts` `setScoped` / `repitchOnSwitch`,
`matchFirearm.ts` `walk.aimPointAt`): the transcription above. The vertex is `scopeEye` (third -> first) or
`localCamera(...).target` without its lead probe (first -> third). The point is cast at the switch along the view being
left (`placed`) by the page's eye query (`fire.eyeStops`) within the held item's reach (`throwAimReach` with an item up,
else `fire.eyeReach`). Unit-tested against REPITCH-BACK-PC2 (`headRepitch.test.ts`: +4.15..+4.35; back -8.5..-8.9 from
the port's own `scopeEye` / `localCamera`); the page's switch in a synthetic room (`fpRepitchWalk.test.ts`: +2.01 / +4.50
/ +7.44 at d 30 / 25 / 21 on the port's eye geometry, held 20 ticks, first person's line through T within 0.3 u).

**What the tests hold, and what they do not** (ATLAS's second read F3; review 1 note 7): `headRepitch.test.ts` holds the
transcription against r0004's own REPITCH-BACK-PC2 values. `fpRepitchWalk.test.ts` holds the page's behaviour (re-pitched on
the switch, held, the line through T, the switch back, no hook no change) against the port's own geometry: its +2.01 / +4.50 /
+7.44 are computed from the port's eye, NOT asserted against r0004's +1.85 / +4.24 / +7.10. The capture-level comparison is
the rendered run below.

**Rendered AFTER** (PC 4, FP-REPITCH-AFTER-PC4, at dbe5844039, MP51 face 1575, flashbang, 10 ticks waited a throw, two
trials; backend webgpu): the first-person look after the switch -6.12 / +1.87 / +4.50 / +7.31 at open / d 30 / 25 / 21
(r0004 -5.88 / +1.85 / +4.24 / +7.10); first person launches 0.02 under third at every d (r0004 0.05-0.09 under; 18.22 /
21.31 / 24.77 against r0004's 18.03 / 21.02 / 24.41), where before (67b7183023) it was 6.50 / 9.60 under and NO RELEASE at
d 21. Switch back at d 25: +4.42 -> -8.75 after 10 ticks (r0004 -8.70). Walk-in (switched at 45 u, walked to 22.47 u, no
look): the look held -2.03 -> -2.01, launch 16.24 (r0004 THROW-H15-PC2 16.08; before 11.74). The ~0.3 degree residual is
the port's eye geometry (`scopeEye`).

**The reticle** (review 1 F1): the switch's re-pitch is no stick turn, so `matchFirearm` `viewLanes` carries `lastLook`
with it (as `carryScope`) and the page's exertion throttle never sees it. Which rate the original's bloom reads after the
head write is not read (reading, pending review); PC 4's reticle-size reads on the switch frame hold the page's side.

### 9.1 Readings (named in the code)

- `FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER` (viewer `src/headRepitch.ts`; `walk.ts` `setScoped`) = 'the re-pitch reaches
  the body at the look gate's law': a named DEPARTURE (LATER 1582), not a browser adaptation. The original writes the new
  pitch into the controller and the head on the switch's pass; the port's body, page and room alike, takes it through the
  look gate at ~1.87 degrees a tick (a still body's 4 banked ticks on the first), r0004's 7-17 degree re-pitches in ~1-5
  ticks, and the room's cone reads that ramp as a full-stick pitch turn. Settled by a wire word for the switch (the owner's,
  v0.4.33).

**Departure, named:** `FP_REPITCH_ROOM_LAG_DEPARTURE_PLACEHOLDER` (9.1, LATER 1582). **Not built:** LATER 1583 (the other
entries into third person; the stored point's keep = 1, auto-aim and body-hit overrides; mode 1; the item-up branch untested).
**Reviews:** review 1 (fresh, non-author; pilot/shots/FP-REPITCH-REVIEW.md) and ATLAS's second read of the transcription
(pilot/shots/FP-REPITCH-2ND-READ.md), both PASS WITH FINDINGS, folded.
