# The agent's cinematic camera -- `camera.shot` (R5-A)

Product adaptation, 2026-10-25 (OT.R53 product track). The original has no agent and no scripted editor camera: this
is a browser instrument for the Forge editor's Build view and the solo test room only. It moves the editor's fly
camera and nothing else -- never the game's own camera, Play, a match, the layout or any simulation value. The owner's
ask (2026-10-25): an agent submits a shot ONCE (points and a duration) and the page plays it smoothly, frame by frame,
in place of the per-command teleport loop that looked janky. The seam is the UI seat's entry of 2026-10-25 ~15:15Z in
the agent mailbox ("cinematic camera: the seam, the ownership and the placement").

## The operations

| operation | permission | surfaces | arguments | reply |
|---|---|---|---|---|
| `camera.shot` | `edit` (a mutation: `expectedRevision` = the layout revision) | `forge-editor`, `testroom-solo` | `{ points: { at: [x,y,z]; look: [x,y,z] }[]; seconds: number; hold?: number }` | `{ shotId, revision, replaced? }` |
| `camera.stop` | `edit` (not a mutation: never refused as stale) | all three | `{}` | `{ stopped: shotId \| null }` |
| `camera.status` | `inspect` | all three | `{}` | `{ shot: shotId \| null; t; ended? }` |

Permissions: `edit` for `camera.shot` and `camera.stop`, as the camera controls already there (Forge's
`camera.pose`/`look`/`focus`/`objective` and `view.set`, reached through `forge.edit`; the room's `camera.set`, through
`testroom.settings`); `inspect` for `camera.status`. The reason: a shot moves the person's view in Build exactly as those
controls do, so a test-only grant must not gain a Build camera mutation it did not have before (the UI seat's ruling of
2026-10-25 on the other seat's security question, withdrawing round 5a's "`test`, never `edit`").
The catalogue the gateway and its clients read is the protocol's
`OPERATIONS` (`packages/forge-agent-protocol`); the page's own lists are `FORGE_AGENT_OPERATIONS`
(`packages/viewer/src/forge/agent/api.ts`) and `SOLO_TESTROOM_OPERATIONS` (`packages/viewer/src/testroom/agent/target.ts`).

## The bounds (this adaptation's own)

| constant | bound |
|---|---|
| `CAMERA_SHOT_POINTS_ADAPTATION` | 2..64 points |
| `CAMERA_SHOT_SECONDS_ADAPTATION` | 1..120 s of motion, first point to last |
| `CAMERA_SHOT_HOLD_ADAPTATION` | 0..10 s held at the last point |

Every coordinate is finite; anything else refuses `INVALID_ARGUMENT` (`parseCameraShot`). Every point's `at` and
`look`, and the path the sampler draws between them (30 samples a second -- a cubic can overshoot), lie inside the
loaded map's box, else `OUT_OF_BOUNDS` (`shotOutsideBounds`). No map loaded: `NOT_READY`.

Round 5b's admission order (`shotAdmission`, `forge/camera/driver.ts`): `parseCameraShot`; no box (no map, or the
Forge's blank floor, which has neither a box nor a map scale) `NOT_READY`; the page's check with the map's scale
(`ShotDriver.check`: dot's `checkShot(spec, metersPerUnit)` once it lands, until then `standInShotCheck` --
no scale, or a point looking at its own position) `INVALID_ARGUMENT`; then ONE walk of the points and the sampled
path for the box (`OUT_OF_BOUNDS`) and the pitch limit (`OUT_OF_RANGE`, past 89 degrees), each instant sampled once
for both, at 30 a second but never more than `SHOT_ADMISSION_SAMPLES_CAP_ADAPTATION` (1200) samples -- 10 a second
at the 120 s bound -- so a long shot does not hold the main thread for seconds (dot's sampler costs ~0.7 ms a sample).

## One driver

One shot at a time, in one driver (`packages/viewer/src/forge/camera/driver.ts`, `createShotDriver`): the page builds it
with its motion law (`sampler`) and its fly-camera setter (`apply`, the page's `Pose` as `FlyCamera.lookFrom` makes
one), and calls `frame(dt)` each rendered frame while `active()`. A second `camera.shot` replaces the running one and
its reply names it (`replaced`). The motion law is dot's `sampleShot` (`forge/camera/shot.ts`) once it lands;
`linearShotSampler` until then. No per-frame save, history step or layout revision: the Forge's layout revision never
moves with a shot; the solo room's revision ignores the shot's own motion and settles once when it ends.

## What ends a shot -- `ended`

| reason | when |
|---|---|
| `manual` | the person's camera input (the page's call) |
| `mode` | Walk, Play, a lobby's hold; the page refusing the pose |
| `map` | a map change |
| `stopped` | `camera.stop`, the chip's "Stop camera" or Circle, the agent's own camera.pose/look/focus/objective, camera.set or teleport |
| `revoked` | the permission revoked |
| `disconnected` | the connection closed (a re-pairing) or the target disposed |
| `done` | `seconds + hold` elapsed; the last pose is the last point's, exactly |

The first reason is kept; a later stop answers `null`. After a shot ends, `camera.status` names it with its `ended`.

## Admission

Build only: in the Forge, Walk and Play refuse `PLAYING` and a lobby's hold or match `BLOCKED` (the facade's existing
guard); in the solo room, Play refuses `BUILD_LOCKED` and anything but a visible offline room `SURFACE_DENIED`. Until
the page or the room's install code provides the driver and the map's box, the three operations refuse `UNSUPPORTED`.

## Round 5b, the page's (landed on `agent/forge-ui`; the items below are what it was owed)

The Forge page builds `createPageShot` (`forge/camera/pageShot.ts`) once a mount on `FlyCamera.setPose`; the sampler
closure reads the base map's `MetersPerUnit` per call (`PAGE_SHOT_LAW`: the linear stand-in until dot's `sampleShot`
is the one line in its place); its frame replaces the fly update while a shot runs, the update kept only as the
takeover test (after the shot's own setPose it moves nothing without an accepted input; with one the shot ends `manual`
before it overwrites the pose); a moved camera between frames is `manual` too; no settle save while it runs, ONE save
when it ends. `mode` on Walk, Play, a match or a lobby; `map` on a new base; `stopped` on Circle and the agent chip's
"Stop camera"; `disconnected` on a hidden or closing page. The solo room builds the same on its fly camera (fly mode
only, never `WalkMode.setCamera`). The transports route the three operations; `camera.stop` rides both stop lanes.


The Forge page builds the driver, passes `shotDriver` and `mapBounds` to the facade, drives `frame` from its loop
(skipping its own fly update and `agentSaveCamera` while a shot runs) and calls `stop` at its seams; the solo room's
install code builds the driver with the room's fly camera; the two transports (`src/agent/forgeTarget.ts`,
`src/agent/testroomTarget.ts`) route the three protocol operations to `execute`.

Also owed, from the R5-A review (2026-10-25):
- **The words for `OUT_OF_BOUNDS`.** The FUI-4 code table (`packages/viewer/src/agent/codes.ts`, another writer's
  file in round 5a) needs a row for it -- suggested: `OUT_OF_BOUNDS: 'The camera shot leaves the map.'`. Until it
  has one, `packages/viewer/test/agentPanel.test.ts` ("every code the agent's sources send has words in the table")
  is red on this code alone.
- **The pitch limit.** The page's admission refuses a shot whose look, at any point or on the sampled path, is steeper
  than `SHOT_PITCH_LIMIT_DEGREES_ADAPTATION` (89 degrees; `FlyCamera` clamps at 89.9), with `OUT_OF_RANGE` and its own
  row in the code table; the check is `shotPastPitchLimit` (driver.ts), not yet called by the facade or the room. The
  look law is unchanged; a look straight up or down keeps the previous yaw (`poseOfShot`), so it never snaps mid-shot.
- **Stop is never queued behind the rest.** `camera.stop` joins both priority-stop lanes -- the gateway's
  (`packages/forge-agent/src/sessions.ts`, beside `scenario.cancel` and `play.stop`) and the browser connection's --
  without weakening the auth or edit checks. Round 8 (R8-4): the facade's serial queue is the third lane -- `camera.stop`
  runs at once there too, never behind a slow edit; a `camera.shot` admitted before that stop but still waiting in the
  queue resolves `CANCELLED` ("A camera.stop sent after this shot ended it") instead of starting after it, and that
  refusal is its receipt. `camera.stop` keeps no receipt.
- **The room's revision.** A shot's start and its stop move the solo room's revision once; the reply names the
  settled revision whether or not anything is subscribed (`settleShot`, target.ts).
