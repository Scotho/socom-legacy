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
