# Zombie waves -- an example rules pack (issue #766)

A labelled modded mode with no original (product track, OT.R53). It is built only on the published creator rules
contract (`docs/specs/2026-10-27-creator-rules-contract.md`, vocabulary 0, engine contract `^0.1.1`), the same way as
the paintball example in this folder. There is no zombie engine module and no mode-specific path. With the pack off,
a standard match is unchanged.

The counts are the test room's own wave sizes for waves 1 to 3 (`4 + (wave - 1) * 3`) and its ten-second rest. Those
are that mode's numbers, written here as pack defaults. They are not values from the original game.

## The files

| file | what it is |
|---|---|
| `s2u-pack.json` | the v2 manifest: kind `rules`, sides `server`, contract `^0.1.1`, one member, intent `new-behaviour`, one handler claim `behaviour.npc.patrol` |
| `rules/waves.json` | the `RulesSpec` (`s2u-rules`, vocabulary 0): mode `zombie-waves`, "Zombie waves" |
| `README.md` | this note; at the pack's root it is one of Thunderstore's store files, outside the pack's identity |
| `../zombie-waves.run.json` | not a member: the acceptance runs for `forge.rules.test`, and the horde spawner's place |
| `../zombie-waves.crossroads.json` | not a member: the Forge authoring file for the Crossroads test map, rules already imported |

## How to load it

The Forge is at `/forge` in a browser build. The test map is offline. A layout that carries these rules is refused
in an online lobby by the existing check.

1. Open the Forge and choose **Open**, then `packages/creator-contracts/examples/zombie-waves.crossroads.json`.
   The base is Crossroads (`MP72`). The file is the layout after `forge.rules.import`: mode `zombie-waves`, the pack
   required, the rules kept as the layout's draft.
2. Press **Play the layout**. Play runs on your machine. The map's own player spawns are the squad. The round starts
   in phase `wave-1` and shows "Wave 1".

To build that layout again instead of opening the file: open Crossroads, place one NPC spawner with authored id
`horde` (side terrorist, character type 0), then import this pack with `forge.rules.import` (the Forge's Agent tab:
`s2u-pack.json` and `rules/waves.json`). Play reads the imported draft. Home > Experiments > Mods refuses this
pack today (`pack.HANDLER_UNKNOWN`): that screen offers no behaviour handlers yet. Open it in the Forge as above.

## What each wave does

The first phase is `wave-1`. A wave ends when the `horde` spawner reports empty. The rest is the match timer `rest`,
ten seconds, then the next wave. Sizes, cash and points are the configuration (the defaults below).

| phase | when it starts | what the rules do |
|---|---|---|
| `wave-1` | round start | wave number 1, `left` set to **4**, message "Wave 1", HUD for the wave and for `left`, release **4** from `horde` with `behaviour.npc.patrol` |
| `rest-1` | `horde` is empty during wave 1 | message "Wave 1 cleared", start the ten-second rest |
| `wave-2` | the rest timer fires | wave number 2, `left` set to **7**, message "Wave 2", release **7** |
| `rest-2` | `horde` is empty during wave 2 | message "Wave 2 cleared", start the rest again |
| `wave-3` | the rest timer fires | wave number 3, `left` set to **10**, message "Wave 3", release **10** |
| `cleared` | `horde` is empty during wave 3 | message "All waves cleared", the round ends, the SEALs win |

Each `npc.death` on `horde` adds the bounty (default 100) to that attacker's `cash`, awards the points (default 1)
to him, and subtracts one from `left`.

When no player is alive (`player.eliminated` and the alive count is 0), the message is "The squad is down" and the
round ends with no winner. That rule does not wait for a wave to finish.

A second empty report while the phase is already the rest does not open another wave. The next wave waits for the
timer.

## The layout it needs

One NPC spawner, authored id `horde`. The Crossroads file places it at `[480, 0, -360]`, yaw 0, radius 120, side
terrorist, character type 0. Those numbers are authored for this test map. Move the spawner in the Forge and the
same rules follow it. The pack names no zone, marker, door or switch.

## What is pack data and what is the engine's

**Pack data:** the configuration and its bounds, the variables `wave`, `left` and `cash`, the rest timer, the six
phases, the eight rules, the messages, and the claim on `behaviour.npc.patrol`.

**Engine-owned:** every event, the phase and the timer, `spawner.release` (the room seats the NPCs), `score.award`,
`round.end`, and the presentation of `message.show` and `hud.value`. The patrol brain is the engine's
`behaviour.npc.patrol`. This pack does not claim `behaviour.zombie.chase-melee` (that capability stays reserved).
The Mods screen offers no behaviour catalogue, so it refuses this pack (`pack.HANDLER_UNKNOWN`).

**Forge Play seats the horde.** A `spawner.release` with `behaviour.npc.patrol` seats that many NPCs on the map at the
spawner, on its side, through the same room hello a marker NPC uses. A dead release leaves its seat, so the next wave
is not capped by those corpses. A side still holds 8; a larger wave seats the rest as seats free up. Shooting one is
`npc.death` (the `Left` HUD drops by one) and the last of that release is `spawner.empty`, which opens the rest and
the next wave. Clearing the last wave is the pack's `round.end`. A new round drops a horde still seated, so the next
round tracks that round's wave 1. Where the map has a navigation graph, the lobby's patrol brain drives them, in every
round, unless the layout's marker NPCs are set to sentry. With marker NPCs set to sentry, or with no nav graph,
released patrol NPCs stand. The scripted run still tells `npc.death`,
`spawner.empty` and `timer.fire` itself, the same way the paintball run tells `player.eliminated`, so the trace does
not wait on shots. `forge.rules.test` gives those releases seat ids and tracks them; it still applies no room action.

## The scripted runs

`zombie-waves.run.json` holds two runs. The main run clears all three waves (4, then 7, then 10 kills), including
one extra empty report during the first rest that must not open wave 2 early. The wipe run is one kill and then
the only player eliminated: the round ends, and wave 2 does not start.
