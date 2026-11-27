# 452 -- The game's round valves fed from the room's facts (`GAME_VALVES_FEED_READING`)

- Date: 2026-11-21. Branch `agent/forge-pr5-reds` (worktree `wt-forge-pr5-reds`), base `agent/forge-pr5` 48cc94b2f4. The
  constant came in with the Forge's owner's (crispy, OT.R112) import (`0ed80a521b`, viewer `src/gameValves.ts`); this note
  is its ledger row, which `tools/test/placeholderLedger.test.ts` asks of every `*_READING` the sources name.
- What it is: a **browser adaptation** (FG.R2, the doc comment's own label): the room's events written under the game's
  own valve names and numbers, for a Forge map script to test. It changes nothing the game does: nothing of the page's
  own reads these valves (the doc comment). The room keeps the same feed on its own world (match `src/room.ts`, its
  `valveFeed`; `GAME_VALVES_KEPT_ADAPTATION`, named in comments in `room.ts` and viewer `src/worldState.ts`).
- Level: the valve names and numbers carry the level the notes cited in section 2 give them; the feed's timing against
  the original is **not read** (two unknowns, section 3), and the constant names that gap.
- Sources read for this note: the doc comment above `GAME_VALVES_FEED_READING` (viewer `src/gameValves.ts`), and the
  sections of research 91, 192 and 175 it cites (section 2). Nothing else; no value here is new.

## 1. What the constant stands for

The port plays a round in its room, not through each map's `objectives` script (research 192 §2), so the valves that
script tests are kept by nothing of the game's own. `gameValves` keeps them from the room's events, under the game's
names, for `@s2u/creator-contracts`' `SCRIPT_GAME_VALUES`. `mp_bomb` is the bomb page's (`bombPage`), not this feed's.

`GAME_VALVES_FEED_READING` says what that costs: each value is the room's fact under the game's name, **not the game
script's own write**. When the original's script would have written it (the doc comment: "a frame later, after a WAIT")
is not kept, and `mp_winner` holds the last decided round's value until the next round is decided, where the original's
reset of it at a round's start is not traced.

## 2. The names and numbers, and where they are read

As the doc comment cites them; each line is the cited note's own:

- **Teams and the script's frame** (research 192 §2): the round logic is each map's `objectives` animation; it branches
  on `player_team` 0 SEAL, 8 Terrorist, 16 spectator; `success` / `failure` WAIT 20, add 1 to `round_count`, call
  `game_over`. Elimination tests `aiteam_08 == 0` and `aiteam_00 == 0` (192 §2; research 91 §18.2.1, "respawn off:
  elimination").
- **`mp_game_type`** (research 192 §1): it mirrors the game object's type, 1 BREACH, 2 DEMOLITION, 3 ESCORT,
  4 EXTRACTION, 5 SUPPRESSION.
- **`mp_timer`** (research 91 §18.1, the round clock's "at zero" row): created at 1; the master zeroes it at 00:00, the
  event the map's script waits for. The doc comment cites this as "research 91 s2"; the row is in §18's first subsection
  (the comment now says so).
- **`mp_winner`** (research 91 §18.2.1; 192 §2.1's time-out row): 0 or 8 for the side that wins, 99 a draw (`abort`).
  `mp_score00` / `mp_score08` and `mp_game_over` are the same table's.
- **`mp_penalty`** (research 192 §3.3, G11): EXTRACTION's scripts add 1 after a SEAL kills a hostage; the host takes a
  minute off the round's length for each.
- **EXTRACTION's counts** (research 175 §3, points 1, 2 and 4): `rescuecount` and `killcount` from the `RescueN`,
  `HostKillN` and `SealKillN` sequences; `mp_hostages_by_seals` tested by `start` for the Terrorists' win.
- **ESCORT's** (research 175 §4, points 1, 2, 4 and 6): each VIP's alive valve, tested by `RescueN` (point 1) and
  `EndRescueN` (point 4); `rescuecount` and `killcount`, tested by `SEALcheck` (point 2), `killcount` added to by both
  sides' kill watchers (point 6).

## 3. Readings

| name | what it stands for | the unknowns | the evidence that would settle it | status |
|---|---|---|---|---|
| `GAME_VALVES_FEED_READING` | the room's events written under the game's valve names (viewer `src/gameValves.ts`), not the original script's own writes | (1) when the original's own script writes each valve (the frame, after which WAIT); (2) whether and when the original resets `mp_winner` at a round's start (the port keeps the last decided round's) | a trace of the original running: the valve writes by name and frame around a round's start and a round's end, on at least one map of each type | open (a browser adaptation; its timing not read) |
