// AX-2 (a browser adaptation, product track; contract C5): the guide's `coordinates` topic.

export function coordinatesTopic(): string {
  return [
    "# coordinates -- units, axes, angles and refs",
    "",
    "## Units and axes",
    // viewer/src/camera.ts Pose: "position in game units"; viewer/src/forge/layout.ts: base keys in whole game units
    "- Positions are [x, y, z] in the map's game units -- the disc map's own units, not metres.",
    // viewer/src/forge/camera/pageShot.ts: the map's MetersPerUnit is read per map
    "- How many metres a unit is differs by map (its MetersPerUnit); judge sizes from `forge.assets` bounds and the " +
      "refs' positions, not from a fixed scale.",
    // viewer/src/forge/camera/driver.ts poseOfShot: pitch = atan2(dy, horizontal distance) -- y is the vertical axis
    "- y is up. The ground is the x-z plane; a higher y is higher in the world.",
    // driver.ts poseOfShot: the camera looks down its own -z; yaw = atan2(-dx, -dz)
    "- Every yaw turns about the y axis. The camera's yaw 0 looks toward -z; a placement's facing at yaw 0 is its " +
      "model's own and not settled here.",
    // viewer/src/forge/agent/api.ts number schema: -100000..100000
    "- Every coordinate an operation takes is a finite number within -100000..100000.",
    "",
    "## Angles: radians unless an operation says degrees",
    // api.ts piece.rotate / selection.rotate "in radians"; turret/gate/barrier/door.place "yaw radians";
    // editorFacade.ts refs' yaw = the placement's rotation.y (radians); viewer/src/forge/group.ts yawOf (radians)
    "- Placement yaw is radians: `piece.place`, `piece.rotate`, `selection.rotate`, `spawn.place`, `npc.place`, " +
      "`turret.place`, `door.place`, `gate.place`, `barrier.place`, and the yaw the refs report.",
    // api.ts view.place: "yaw and pitch in degrees"
    "- `view.place` (a spectator view) takes yaw and pitch in DEGREES.",
    // viewer/src/camera.ts Pose: "yaw and pitch in degrees"; api.ts camera.pose; testroom/agent/target.ts camera.set (Partial<Pose>)
    "- The fly camera is DEGREES: `camera.pose` and the test room's `camera.set`; the view's camera reads back in degrees too.",
    // driver.ts SHOT_PITCH_LIMIT_DEGREES_ADAPTATION; camera.ts PITCH_LIMIT 89.9
    "- A camera shot's look may not be steeper than 89 degrees from level.",
    // testroom/agent/target.ts teleport passes yaw on unchanged
    "- The test room's teleport yaw: its unit is not settled by the code the guide reads.",
    "",
    "## Refs",
    // viewer/src/forge/agent/api.ts ForgeAgentSnapshot: "Refs live for ONE revision, never across edits"
    "- A ref names one placement for ONE layout revision. After any edit that advances the revision (yours or the " +
      "player's), every ref you hold is void: read `forge.read` {section: \"refs\"} again before naming one.",
    // viewer/src/forge/page.ts placementIds: "<kind>:<index>" (piece, spawn, respawn, npc, bomb, flare, hostage, point, view, turret, door, gate, barrier, xzone)
    "- A ref reads <kind>:<index>, e.g. piece:3, spawn:0, npc:1; deleting renumbers the rest of that kind.",
    // editorFacade.ts agentSnapshot refs: {ref, revision, scope, asset, team, npc, bomb, locked, at, yaw}
    "- Each ref row: {ref, revision, scope: \"revision\", asset, team, npc, bomb, locked, at, yaw}.",
    // viewer/src/forge/layout.ts: a base map placement key `model@x,y,z` in whole game units
    "- Base-map placements (the disc map's own props) are keys, not refs: model@x,y,z in whole game units, e.g. " +
      "crate@100,0,-20. `piece.hide` and `piece.restore` take {keys}; the catalogue's basePlacements lists them.",
    "",
    "## Revisions",
    // api.ts ForgeAgentStatus: revision is the layout's; viewRevision the camera's, palette's and tool's
    "- revision is the layout's. viewRevision moves with the camera, palette and tool and never makes a request stale.",
    // protocol parseRequest REVISION_REQUIRED; forgeTarget.ts REVISION_CONFLICT; api.ts STALE_REVISION
    "- A mutation carries expectedRevision = the current revision; a stale one refuses REVISION_CONFLICT or " +
      "STALE_REVISION (the same condition): read, recompute, retry.",
  ].join("\n");
}
