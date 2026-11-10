// AX-2 (a browser adaptation, product track; contract C5): the guide's `forge-test` topic.
import { LIMITS } from "@s2u/forge-agent-protocol";

export function forgeTestTopic(): string {
  return [
    "# forge-test -- playing the layout privately (forge.play, forge.input, scenarios, play.stop)",
    "",
    "## Start",
    // protocol OPERATIONS["forge.play"] (test, forge-editor, mutation); forgeTarget.ts forge.play -> api 'play.start' with no args
    "- `forge.play` {} (test permission, expectedRevision) starts offline private Play of the layout. It sends no " +
      "allowIssues, so a layout with map issues is refused: run `forge.check` and fix them first.",
    // protocol OPERATIONS surfaces + authorizeRequest; sessions.ts retry {operation, surface} (REVIEW-1 16)
    "- The surface becomes forge-play. Edits and camera shots are refused SURFACE_DENIED (retry.surface says forge-play) " +
      "until `play.stop`.",
    // forgeTarget.ts target.status adds play (viewer/src/forge/agent/play.ts ForgePlayState) once mounted
    "- Poll `target.status` until its play state is present and ready (it also says visible, menu, armory, map, pose, feet).",
    "",
    "## Inputs",
    // protocol OPERATIONS["forge.input"] (forge-play); forgeTarget.ts forge.input allowlist
    "`forge.input` {operation, arguments} (surface forge-play, expectedRevision) runs one normal pad input; inner operations:",
    // play.ts FORGE_PLAY_AXES / FORGE_PLAY_BUTTONS; api.ts input.set
    "- `input.set` {moveX, moveY, lookX, lookY: -1..1; jump, crouch, prone, stance, fire, reload, action, swap1, swap2: " +
      "true|false} -- any subset; held until released.",
    "- `input.release`, `action.press`, `action.hold`, `action.release`, `action.cancel`.", // api.ts
    "- `equipment.equip` {item: rifle | pistol | 1 | 2 | 3}; `armory.key` {code: ArrowUp | ArrowDown | ArrowLeft | " +
      "ArrowRight | Enter | Backspace}, only while the ARMORY is open.", // api.ts equipment.equip / armory.key; play.ts command
    // api.ts input.set description; play.ts wallLimit (30 000 ms)
    "- Held inputs are released on cancellation, a menu, a hidden page, the match's end or after 30 seconds wall time.",
    // play.ts execute: PLAY_NOT_READY unless visible, ready, private and no menu; BUSY while a scenario runs
    "- Refused PLAY_NOT_READY unless the match is visible, ready, private and no menu holds input; BUSY while a scenario runs.",
    "",
    "## Scenarios",
    // api.ts scenario.start; play.ts stepsOf (1..32 steps, seconds 0..60, total <= 60), the 30 s wall limit
    "- `scenario.start` {steps: [{operation, args?, seconds?}, ...]}: 1..32 steps; operations input.set, input.release, " +
      "action.press/hold/release/cancel, equipment.equip, armory.key, wait, observe. seconds 0..60 per step, at most 60 " +
      "simulation seconds in all and 30 seconds wall time. No positioning or game-state setters.",
    // play.ts fields; frame(): an observe step fails the scenario when not matched within its seconds
    "- observe {field, equals} passes when the field equals the value within the step's seconds, else the scenario fails. " +
      "Fields: map, feet, pose, equipment, action, plant, plant.state, plant.carrier, action.prompt, action.playerMode, " +
      "action.playing.",
    // play.ts status: {jobId, state, step, elapsed, results, observations, message}
    "- `scenario.status` {}: jobId, state (running, completed, failed, cancelled), step, elapsed, results, observations, " +
      "message. `scenario.cancel` {} stops it and releases its inputs.",
    // protocol LIMITS.scenarioMs
    "- The protocol's scenario bound: `scenarioMs` = " + LIMITS.scenarioMs + ".",
    "",
    "## Stop",
    // protocol OPERATIONS["play.stop"] (forge-play); sessions.ts and connection.ts: the stop lane (scenario.cancel, play.stop, camera.stop)
    "- `play.stop` {} returns to the editor. It, `scenario.cancel` and `camera.stop` ride a stop lane that never waits " +
      "behind other requests or the rate limit; one stop at a time (STOP_IN_FLIGHT).",
    "",
    "## Rules without Play",
    // protocol OPERATIONS["forge.rules.test"]; api.ts rules.test (seed, players <= 16, ticks <= 600)
    "- `forge.rules.test` {seed?, players?, ticks?} runs the layout's rules mode over a scripted run on the room's rule " +
      "host and applies nothing: up to 16 players and 600 ticks.",
    "",
    "## Ask the player",
    "Tell the player before you start Play: it takes over their view until `play.stop`.",
  ].join("\n");
}
