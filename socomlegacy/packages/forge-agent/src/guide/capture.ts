// AX-2 (a browser adaptation, product track; contract C5): the guide's `capture` topic.
import {
  CAPTURE_REFS_MAX_ADAPTATION,
  CAPTURE_SMALL_WIDTH_ADAPTATION,
  CAMERA_SHOT_ENDED,
  CAMERA_SHOT_HOLD_ADAPTATION,
  CAMERA_SHOT_POINTS_ADAPTATION,
  CAMERA_SHOT_SECONDS_ADAPTATION,
  LIMITS,
} from "@s2u/forge-agent-protocol";

const range = (r: { min: number; max: number }) => r.min + ".." + r.max;

export function captureTopic(): string {
  return [
    "# capture -- pictures of the game view, and the camera",
    "",
    "## target.capture",
    // protocol OPERATIONS["target.capture"] (capture, every surface): "Capture only the game canvas"
    "- `target.capture` {view?, refs?, name?, size?} (capture permission, every surface) pictures the game canvas only -- never the page around it.",
    // AX-16: protocol capture.ts CAPTURE_VIEWS / parseCaptureArgs; viewer agent/forgeTarget.ts and testroomTarget.ts capture
    "- view \"current\" (the default; {} is the same) takes the canvas as it is now.",
    // viewer forge/camera/framing.ts topViewPose: every ref's `at`, else the base map's box (forge/agent/api.ts mapBounds)
    "- view \"top\" looks straight down over every placed piece and marker (the base map's box when nothing is placed). Forge Build only.",
    // framing.ts threeQuarterPose; forgeTarget.ts presetPose: each ref must be on the current revision
    "- view \"refs\" {refs: [ref, ...]} (1.." + CAPTURE_REFS_MAX_ADAPTATION + " refs from forge.read {section: \"refs\"}) frames them in a " +
      "three-quarter view. Refs live for one revision: pass expectedRevision (the revision you read them at, or \"current\"); a ref " +
      "the page no longer holds, or another revision, refuses STALE_REVISION -- read the refs again. Forge Build only.",
    // forgeTarget.ts presetPose (the layout's scenicViews rows); testroomTarget.ts framedCapture (objectives, as teleport matches)
    "- view \"named\" {name}: in the Forge a placed spectator view (view:N, or its name) from its own pose; in the test room a " +
      "named objective from testroom.read. An unknown name refuses INVALID_REFERENCE listing the names there are.",
    // viewer agent/capturePreset.ts captureFramed: camera.pose / camera.set, the picture, then the pose read before
    "- A preset sets the camera for the picture and restores it exactly after, on a failed capture too; a running camera shot " +
      "ends stopped first. No need to move the camera yourself and back.",
    // forgeTarget.ts capture (PLAYING in Play); testroomTarget.ts framedCapture (UNSUPPORTED; camera.set's BUILD_LOCKED in Play)
    "- Play refuses the presets PLAYING (Forge) or BUILD_LOCKED (room): take \"current\" there. The test room takes \"current\" " +
      "and \"named\" only: \"top\" and \"refs\" refuse UNSUPPORTED.",
    // viewer agent/install.ts captureGameCanvas maxWidth; capturePreset.ts canvasOptionsOf
    "- size \"small\" scales the picture to at most " + CAPTURE_SMALL_WIDTH_ADAPTATION + " pixels wide (quicker, smaller); " +
      "\"medium\" (the default) is the canvas's own size.",
    // forge-agent/src/mcp.ts result(): an image content block and {image: {mimeType, bytes}}; connection.ts capture (png | jpeg)
    "- The answer carries the picture as an image (PNG or JPEG) beside {image: {mimeType, bytes}}. At most " +
      "`transferBytes` = " + LIMITS.transferBytes + " bytes; larger refuses CAPTURE_TOO_LARGE: retry with size \"small\" " +
      "first, and only then ask the player to make the window smaller.",
    // viewer/src/agent/codes.ts CAPTURE_*; connection.ts capture
    "- CAPTURE_UNAVAILABLE: the tab is hidden or nothing is drawn yet; CAPTURE_TIMEOUT and CAPTURE_FAILED: try once more.",
    "",
    "## Aim first (Forge, through forge.edit; edit permission)",
    // viewer/src/forge/agent/api.ts camera.pose {x, y, z, yaw, pitch}; viewer/src/camera.ts Pose (yaw and pitch in degrees)
    "- `camera.pose` {x, y, z, yaw, pitch}: all five; yaw and pitch in degrees (topic coordinates).",
    "- `camera.look` {from: [x, y, z], to: [x, y, z]}: stand at from and look at to -- the simplest way to frame something.", // api.ts camera.look
    "- `camera.focus` {ref}: frame a placement by its ref; `camera.objective` {name, archive?}: frame a named disc objective.", // api.ts
    // editorFacade.ts AGENT_VIEW_OPERATIONS: view edits need the current revision and do not advance it
    "- These need the current revision but do not change it. `view.set` {toggle, on} switches a drawing toggle " +
      "(wireframe, untextured, collision, grid, spawns, fog, shadows, detail, billboards, alternate, blendgraded, " +
      "engineorder, ps2).", // api.ts view.set
    // testroomTarget.ts testroom.settings camera.set
    "- In the test room: `testroom.settings` {operation: \"camera.set\", arguments: {x?, y?, z?, yaw?, pitch?}}.",
    "",
    "## Camera shots (forge-editor and testroom-solo)",
    // protocol OPERATIONS["camera.shot"] (edit, mutation); CAMERA_SHOT_*_ADAPTATION; parseCameraShot
    "- `camera.shot` {points: [{at: [x, y, z], look: [x, y, z]}, ...], seconds, hold?} (edit, expectedRevision): " +
      range(CAMERA_SHOT_POINTS_ADAPTATION) + " points, seconds " + range(CAMERA_SHOT_SECONDS_ADAPTATION) + ", hold " +
      range(CAMERA_SHOT_HOLD_ADAPTATION) + " at the last point. Submit it once; the page plays it frame by frame.",
    // protocol CameraShotReceipt
    "- Answer {shotId, revision, replaced?}: a second shot replaces the first.",
    // viewer/src/forge/camera/driver.ts shotAdmission (OUT_OF_BOUNDS, OUT_OF_RANGE, SHOT_PITCH_LIMIT_DEGREES_ADAPTATION 89); api.ts NOT_READY / UNSUPPORTED
    "- Refused OUT_OF_BOUNDS when a point or the path leaves the map's box, OUT_OF_RANGE when a look is steeper than 89 " +
      "degrees, NOT_READY with no map loaded, UNSUPPORTED where the page has no shot driver. In the Forge, Build only " +
      "(Play refuses SURFACE_DENIED, with retry.surface).",
    // protocol CameraShotStatus, CAMERA_SHOT_ENDED
    "- `camera.status` {}: {shot, t (seconds elapsed), ended?}; ended is one of " + CAMERA_SHOT_ENDED.join(", ") + ".",
    // protocol camera.stop; the stop lane (sessions.ts, connection.ts, api.ts STOP_LANE_OPERATIONS)
    "- `camera.stop` {}: answers {stopped: <shot id or null>}; it rides the stop lane. Your own camera.pose, camera.look, " +
      "camera.focus or camera.objective also end a running shot, as does the player's own camera input.",
    "",
    "## A tour",
    "Read the layout's refs or the room's objectives, choose 3..8 points around them, submit one `camera.shot`, and call " +
      "`target.capture` while it runs (view \"current\": a preset would end the shot) or after with `camera.look` at each point.",
    "To check your own work, `target.capture` {view: \"top\"} or {view: \"refs\", refs} is one call and leaves the camera where it was.",
  ].join("\n");
}
