# 382 -- Wall-side camera presentation and actor-follow obstruction

Date: 2026-11-02. Track: simulation. Status: **reading** for the original calls and filters, independently re-read in WALL-CAM review through `8e3bd450c` (PASS, high confidence); existing owner-authorised presentation adaptations remain adaptations. Source inspected: the supplied `socom2_game.elf.decomp.c` r0001 export. Section 6 says what of draft PR #639's note stays with its body half.

**Landed alone (2026-11-03).** This note comes to `main` with the camera half of draft PR #639 only, cut at `119c2ecf1` onto `main` `09ce85618` on `agent/wall-camera` (the lane's decision; the plan's Log). The body half (#639's segment fan and contact resolution, its research 383) did not come over: the body on `main` is still research 217's, and the camera work here neither needs nor changes it.

## 1. The ordinary downward look

The camera target can be beyond a wall while the body remains outside it. In the synthetic reproduction, feet z=3.5 face a wall at z=0 and pitch is -45 or -70. `localCamera` puts the target ahead of the body's clearance; the obstruction pass starts at that target and can return an eye on its side of the wall. This is the already recorded H337 / research 201 section 14 uncertainty, not evidence to replace `LEAD_PROBE_START_PLACEHOLDER`.

H309 and OBF.R1 require the drawn view to stay outside walls. `NEAR_CLEARANCE_ADAPTATION` previously anchored only a peek's eye and target to the body axis. The same safeguard now applies to ordinary views. Both focus and eye are checked from the body's axis using the existing `headEye` stand-off and the pass's cameratype-1 proximity filter. Ordinary views keep their pre-clearance look direction; peeks keep their existing two-anchor correction. The camera's game eye and target remain the original pass's results and continue to feed shots, orders and perception.

Safe tick endpoints do not establish a safe frame between them. `PlayerCamera.view` checks the interpolated body/eye/focus and near rectangle again, without advancing the pass state. This is presentation protection, not a reading of an additional original collision pass. Existing adaptation constants and `HEAD_EYE_WALL_BACK_PLACEHOLDER` are reused; no new tuned game values are introduced.

## 2. Spectator actor follow

`FUN_002998f0`, D:L141991-141999, dispatches camera kind 2 through `FUN_00296f10`. That computes the actor rig and calls `FUN_0029bf70` before placement (D:L140696, D:L140791, D:L140797-140799). `FUN_002956e0` binds the actor at both camera pointers (D:L139718-139738); `FUN_0029a950` therefore reads the actor root and look for this camera (D:L142451-142545). The old fixed standing offset in `followPose` skipped this pass entirely.

Both the test room and ordinary match now route spectator follow and dead-player teammate watch through the shared `PlayerCamera`. The live world grid is `WalkMode.gridOfGround`, which stays available outside walking mode and contains door/world updates. The rig reads replicated stance, pitch and peek. The remote body is drawn before the spectator frame; `RemotePlayers.cameraRoot` exposes its existing posed `Play.rootY` to the rig. With no rendered skeleton, the same measured stance/traversal root fallback as the player is used. Target/map changes and leaving follow discard the obstruction state; ordinary frames preserve its hold/regrowth.

`followPose` remains only for non-rendering legacy hosts lacking the follow callback. The production shared match builder supplies the callback to both pages. The actual pose looks from the resolved eye through the resolved target, rather than retaining a fixed pitch.

This does **not** implement the original spectator orbit (`FUN_00294b40`, D:L139269-139343), camera transition blend (`FUN_00296f10`, D:L140729-140790), or all actor-local root translation components. Those remain research 248's limitations. Followed dead bodies retain the existing binding lifecycle; this change supplies the shared obstruction pass, not a new death-orbit state machine.

Free spectator flight is separate. `FUN_002964f0` bounds it by authored extents and spatial-cell heights (D:L140531-140593); it does not call the player obstruction pass. Scenic/free behavior is retained. Zero wall penetration for arbitrary free flight would be a further adaptation, not original parity.

## 3. Downward probe filter

`FUN_0029cbb0` explicitly selects mode 0 at D:L143678 and then `FUN_0029cd20` at D:L143689. The lead probe therefore uses the existing movement/peek predicate (bit 18 skipped), and the picker's cameratype-1 proximity rule. The old mode-1 `isCameraSurface` predicate skipped bit 19 instead. The headless room validation does not duplicate this cast: `net/shotCone` sweeps the documented 0..8 lead uncertainty along the facing, so the corrected lead remains within the existing validation domain.

The probe's uninitialised start word remains `LEAD_PROBE_START_PLACEHOLDER` with H337's default. This correction resolves the filter only, not that runtime unknown.

## 4. Evidence and remaining checks

Synthetic tests cover the camera/body-side disagreement, aim preservation, near-plane corners, a wide-aspect corner orbit and interpolated samples. Shared-page tests exercise the spectator callback, stance/pitch/peek, map/target changes, living/dead follow and resets. Disc fixtures exercise existing tight wall cases where available. These are unit/dev-disc evidence, not a physical playtest or original capture comparison.

No new placeholder is introduced. Existing fallbacks: research 201 owns `LEAD_PROBE_START_PLACEHOLDER`; research 83/90 own `HEAD_EYE_WALL_BACK_PLACEHOLDER` and camera presentation; research 180/217 own stance roots. H337 still owns the original downward-eye capture.

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
