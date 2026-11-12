// AX-2 (a browser adaptation, product track; contract C5): the guide's `testroom` topic.

export function testroomTopic(): string {
  return [
    "# testroom -- the solo test room (surface testroom-solo)",
    "",
    // viewer/src/agent/testroomTarget.ts dispatch: an operation that does not list testroom-solo is SURFACE_DENIED
    "Only the operations whose surfaces list testroom-solo work here (agent_capabilities). Every mutation carries " +
      "expectedRevision: the revision of `target.status` or `testroom.read`.",
    "",
    "## Read",
    // testroomTarget.ts testroom.read: {snapshot (objectives paged by 100), operations, objectivesTotal, nextCursor}
    "- `testroom.read` {cursor?}: the room's snapshot (map, name, pose, feet, equipment, action, plant, objectives), the " +
      "room's own operation schemas, objectivesTotal and nextCursor. Objectives come 100 at a time; nextCursor here is " +
      "an object {revision, offset} -- pass it back as cursor.",
    // viewer/src/agent/testroomTarget.ts roomFocus: feet, look (pose yaw/pitch), camera, nearest objective by distance
    "- `testroom.focus` {}: where the player is -- feet (null in the fly camera), look {yaw, pitch}, camera, and the " +
      "nearest named objective {name, kind, team, path, feet, distance}, measured from the feet (or the camera without " +
      "them). Ask the player to walk to a spot, then read it; teleport takes the objective's name.",
    "",
    "## Map",
    // testroomTarget.ts testroom.map: list:true -> map.list, else map.load; viewer/src/testroom/agent/target.ts map.load
    "- `testroom.map` {list: true} lists the maps. `testroom.map` {map, reload?, wait?} loads one; wait defaults to true. " +
      "With wait false the answer is only accepted: poll `testroom.read` until ready and the map's path matches, then " +
      "teleport in a separate call.",
    "",
    "## Teleport",
    // testroom/agent/target.ts teleport: {feet | destination, yaw?, map?}; AMBIGUOUS_DESTINATION / UNKNOWN_DESTINATION with choices
    "- `testroom.teleport` {feet: [x, y, z]} or {destination: <name or path>}, optional yaw and map. Destinations are the " +
      "snapshot's objectives (bomb sites and the map's named places). An ambiguous name refuses AMBIGUOUS_DESTINATION, an " +
      "unknown one UNKNOWN_DESTINATION; both answer the choices.",
    // target.ts passes yaw to the room's teleport unchanged; its unit is the room's, not settled in these files
    "- The unit of teleport's yaw is not settled by the target's code (it passes it to the room unchanged); leave it out " +
      "unless you have read it.",
    // target.ts: teleport and camera.set refuse BUILD_LOCKED unless the room is building (Play off)
    "- During Play, teleport and the camera refuse BUILD_LOCKED.",
    "",
    "## Input",
    // testroomTarget.ts testroom.input allowlist
    "- `testroom.input` {operation, arguments}: the same pad inputs as forge.input (`input.set`, `input.release`, " +
      "`action.press`, `action.hold`, `action.release`, `action.cancel`, `equipment.equip`, `armory.key`). Bare input.set " +
      "arguments with no operation are taken as `input.set`.",
    // protocol scenario.*; testroomTarget.ts refuses a scenario step camera.set (UNSUPPORTED_OPERATION, data.admitted =
    // SCENARIO_WIRE_STEPS; REVIEW-2 22); target.ts scenarioOperations
    "- `scenario.start`, `scenario.status`, `scenario.cancel` as in forge-test; the room's steps may also teleport (no map). " +
      "A camera.set step is refused UNSUPPORTED_OPERATION over the wire (data.admitted lists the steps it takes); move " +
      "the camera with testroom.settings instead.",
    "",
    "## Settings",
    // testroomTarget.ts testroom.settings: operation camera.set | session.play; protocol OPERATIONS["testroom.settings"] (edit)
    "- `testroom.settings` {operation: \"camera.set\", arguments: {x?, y?, z?, yaw?, pitch?}} sets the fly camera only " +
      "(yaw and pitch in degrees, topic coordinates). {operation: \"session.play\", arguments: {on}} is the room's Play " +
      "toggle; finish an ARMORY with armory.key inputs. Edit permission. Other operations: UNSUPPORTED_OPERATION.",
    "",
    "## Packs",
    // testroomTarget.ts packs.*: import/remove refuse BUILD_LOCKED unless building
    "- `packs.list` pages the locally approved packs; `packs.import` and `packs.remove` (import) refuse BUILD_LOCKED " +
      "during Play. Ask the player before removing one.",
  ].join("\n");
}
