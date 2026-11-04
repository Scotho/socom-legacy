# 348 -- Respawn's original clock, round count and result

- Date: 2026-10-21.
- Task: RSP-2, simulation track, in the [respawn fixes plan](../plans/2026-10-21-respawn-fixes.md).
- Base: `82f62a54f938f30b43f8dd7e592214717315d8ff`.
- Status: disc settings and result comparison **reading**, fresh review **PASS (medium)**, 2026-10-21; the exit-state
  bonus reading is inherited, **reading, pending review**, and still awaits a fresh executable-source re-read. No original-runtime claim is made.
- Scope: the parked respawn room's default clock/count, the data carried to its banner, and the order of its result
  and existing score bonuses. The release gate stays off.

## 1. The original clock and count

The supplied disc's `RUN/UIZANIM.ZAR`, set `dlgCreateGame.rdr`, animation `set_respawn_valve`, saves the current
settings and sets `RTimeValve = 20`, `RCountValve = 1` when respawn is enabled. `refresh_cg_screen` writes
`mp_max_round_time = 1200`, `mp_max_rounds = 1` for those settings. These are the values re-read through
`FsAssetSource`, `Zar.parse`, `parseAnimSets` and `decodeEffectProgram`, and independently reviewed in
[research 356 F2](356-original-multiplayer-respawn-audit.md#f2-the-dormant-rooms-defaults-and-banner-disagree-with-the-discs-respawn-settings).

| ordinary constant in `viewer/src/net/rules.ts` | value | original field |
|---|---|---|
| `RESPAWN_ROUND_SECONDS` | 1200 seconds | `refresh_cg_screen`: `mp_max_round_time` for `RTimeValve = 20` |
| `RESPAWN_MAX_ROUNDS` | 1 | `refresh_cg_screen`: `mp_max_rounds` for `RCountValve = 1` |

`Room` selects these defaults after `playedRules` resolves the map's effective rules. A requested respawn room that
plays classic on an incompatible game type therefore keeps classic's existing 360 seconds / 11 rounds. The classic
clock/count in `DEFAULT_OPTIONS` remain unchanged; the room's existing unspecified-rules choice is also retained.
Explicit `RoomOptions` clock/count values remain available to the existing test and operator instruments.

Central's startup previously supplied 360/11 to every room even when neither environment override was set.
`roomRoundOverrides` now passes only explicitly supplied finite positive `ROUND_SECONDS` / `MAX_ROUNDS` values.
These knobs are labelled as operator/test adaptations. An absent or invalid override leaves the choice to `Room`,
so it cannot silently replace the original respawn defaults with classic's settings. The split match process
receives its clock/count from its launch record, and that record's 0 did need a change (P32, below).

**P32 (2026-11-03, the online-parity sweep's RS-3; reading, pending review).** The sentence above once said the
split process's production caller needed no change. It did: central's placement (`central/src/placement.ts`
`record`) resolved a 0 in GameStats bytes 1 and 2 (ROUND COUNT, ROUND TIME) to classic's 11 rounds / 360 seconds
(`PLACEMENT_ROUND_DEFAULTS`, the seat's ruling 10) whatever the game's RulesSet, so a placed respawn game with 0 bytes
played 11 rounds of 6 minutes where the bridge's in-process room for the same game plays 1 round of 1200 s. A
game whose PLAYED rules are respawn now resolves `PLACEMENT_RESPAWN_ROUND_DEFAULTS`, the two constants of the
table above; a classic game's 0 is unchanged; a byte the game writes is kept, each byte on its own. The played rules
are resolved as `Room` resolves them (the fresh review's F1): `playedRules` over the RulesSet's `AllowRespawn` bit
and the map's missionlist TYPE, which central holds for the 22 maps (`central/src/lobbyCard.ts` `MAP_TYPES`, now
read through `missionTypeOf`; the same types `viewer/test/rules.test.ts` reads off the disc's `READERC.ZAR`). So
respawn holds on SUPPRESSION -- the only missions the original's CREATE GAME offers with respawn on
(`FUN_00274940`, D:L121528-121530) -- and on a map off the list (type 0, `RESPAWN_TYPE0_KEEPS_CHOICE_ADAPTATION`),
and a forged respawn bit on another type plays classic on its host and takes classic's 11 x 360 s, as the bridge's
room does. `PlacementOptions.roundDefaults`, when given, applies to every game; no production caller passes it
(`main.ts`'s `ROUND_SECONDS` / `MAX_ROUNDS` reach the in-process rooms only), so only a test's does. Held by
`central/test/placement.test.ts`'s four P32 cases. An original client never sends the 0: CREATE GAME writes the
valves (20 / 1 with respawn on); the FF lobby writes its own (FF.R13, 1 x 10 min).

**The original's zero-valve fallback, a reading not taken.** `FUN_001f5e70`, D:L55622-55631, at the map's load,
after `FUN_002a7560` has set the rules: a round-time valve of 0 is set to 300 (and the round's clock taken from it,
x 1000, D:L55626-55627), a round-count valve of 0 to 9 -- with no respawn condition (`viewer/src/net/rules.ts`
`MAX_ROUNDS`'s comment names the 9). So the original's own answer to a 0 is 9 rounds of 300 s for either rule, not
ruling 10's server default. It is not taken: ruling 10 makes a 0 the server's default on both paths (the bridge's
room and placement alike), and the branch's guards (`DAT_0045a0c1`, `DAT_00408685`, `DAT_0045a0c0`; which console
and which load runs it) are not read. Ruling 10 is the seat's, not the owner's, so under the parity rule the
original decides once those guards are read: [LATER 660](../LATER.md) holds it, with ruling 10 the default meanwhile.
The evidence that would settle it: the guards read, or a capture of an original console joining a game whose
GameStats bytes 1 and 2 are 0. No constant is named for it, so no ledger entry.

The welcome's `rounds` and each `roundStart`'s `rounds` come from that same room setting. The page already formats the
received number through `roundBanner`; its old 11-round respawn fixture was corrected to 1. Tests also receive
explicit instrument counts of 3 and 5 to hold the existing data-driven display. The banner's executable citation,
`FUN_001fb420`, D:L57633-57648, is inherited from research 91; it was not freshly re-read here. No independent
respawn display branch was added.

## 2. The result precedes the bonuses

[Research 356 F4](356-original-multiplayer-respawn-audit.md#f4-the-result-can-be-decided-by-the-survival-bonus)
and its independent review re-read all six SUPPRESSION maps: MP2, MP5, MP8, MP51, MP64 and MP81. Each map's
`MZANIM.ZAR`, animation `objectives`, sequence `success2`, compares `seals_team_score` with `terrs_team_score`, sets
`mp_winner` to 0 / 8 / 99 for SEAL / Terrorist / draw, then sets `mp_game_over = 1`; after its existing wait it sets
`mission_complete = 1`. The numeric operand in the comparison names the other valve; it is not a score threshold.
This task made a bounded fresh read of Frostfire's MP2 sequence through the same archive/animation readers and
`conditionTokens`; the other five maps' coverage is the reviewed audit's, not a new all-map walk.

The existing bonus transcription is research 91 sections 8 and 18.2.4 / research 192 G25:
`FUN_00223970`, D:L76146-76165, gives +1 to each living player and +5 to each player on the selected winning side,
including its dead players. That reading places the awards in the later MP exit state, after `mp_winner` is set.
No decompilation export or independently verified executable was available for a fresh re-read in this task.
The code-reading claim therefore remains inherited, **reading, pending review**; the disc comparison does not
independently establish the bonus routine's ordering.

The room now sums the round points and selects the respawn winner before adding those existing bonuses. The
existing explicit classic result remains the winner for classic, with its existing +1/+5 awards retained.

The former exact `it.fails` regression is now a normal test: no kills, two living SEALs and one living Terrorist
produce a draw, and all three retain their +1 survivor point. A second tie case gives each side one kill and then
respawns both fallen players; 2:2 round points still draw with the same unequal living counts. The existing actual
point-advantage case keeps the Terrorist win and its 2 + 1 + 5 score. Classic's elimination awards and counters
across rounds remain covered by the same file.

## 3. Verification and limits

The tests use Room's hello/clock/emitted events, NetPage's received events and HUD state, and the existing local
socket test. Synthetic floors, shortened clocks, environment overrides and socket-clock tolerance are test
instruments, not additional original values.

| evidence kind | result |
|---|---|
| focused RED, original expected-failure promoted | 1 failed, 18 filtered skips: expected draw, received SEAL win |
| focused RED, normal respawn defaults | 1 failed: welcome expected 1 round, received 11 |
| focused RED, environment normalizer seam | 1 failed, 3 filtered skips: normalizer did not yet exist |
| targeted unit tests | `round.parity`, `netRules`, `roomRespawnRules`: 3 files, 41 passed, 0 failed, 0 skipped |
| focused fixture-backed socket test | `server.test` / room-key test: 1 passed, 0 failed, 41 filtered skips |
| source inspection | CREATE GAME settings and bounded MP2 `success2` re-read; reviewed 346 supplies six-map coverage |
| rendered browser / physical playtest / original-runtime comparison | not run |
| full suite / workspace typecheck / build / gate | not run by this worker; controller's serial verification remains |

Commands from `socomlegacy/`, with `SOCOM_DISC` set to the ignored copied disc extraction; the socket test also points
`S2U_TEST_FIXTURES` at that extraction:

```sh
../node_modules/.bin/vitest run packages/central/test/round.parity.test.ts packages/viewer/test/netRules.test.ts packages/match/test/roomRespawnRules.test.ts --maxWorkers=2
../node_modules/.bin/vitest run packages/central/test/server.test.ts -t 'keys the rooms by map and rules' --maxWorkers=2
```

No other phase timing, audio, animation, spawn selection, lobby launch/return or prompt implementation was changed. The original
result and clock readings remain short of original-runtime proof; a verified executable re-read and the planned
original capture comparison are the remaining evidence. No new placeholder or measured-reading constant is
introduced, so this task adds no placeholder-ledger entry. Shared notes/indexes and the plan's Log are the
controller's responsibility.

## 4. Independent review

The fresh reviewer re-read the original CREATE GAME values and all six SUPPRESSION `success2` comparisons,
independently ran the three-file unit set (41 passed, 0 failed, 0 skipped) and the selected fixture-backed socket
check (1 passed, 41 filtered-out). Parent-source probes reproduced the old defaults and tie result, and the absent
normalizer seam. The executable bonus handler and shared banner reader remain inherited and pending fresh review;
their absence is not cured by the unit tests or by the unscored local runtime capture in the plan's Log.
