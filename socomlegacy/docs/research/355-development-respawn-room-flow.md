# 355 -- Development respawn through the selected game rules

- Date: 2026-10-21.
- Plan: [original respawn fixes](../plans/2026-10-21-respawn-fixes.md), RSP-9, RSP.R7.
- Base: `agent/respawn-fixes` at `d6b56de62cd1f54148ffc0b5e4e8a579f567098e`.
- Track: simulation wiring of existing selected rules; the local-development capability is a labelled adaptation.
- Status: implementation independently reviewed **PASS (medium)**, 2026-10-21; six focused files,
  **102 passed / 0 failed/skipped/filtered**. Existing original-code citations below are inherited readings;
  their decompilation export was unavailable for a fresh re-read by this worker. Existing reviewed disc readings
  retain their confidence. No new original numeric value, measured timing, placeholder or proven claim is added.
- Scope: backend capability and rule selection. The global `RESPAWN_RULES_ENABLED` remains false. The frontend
  toggle, local launcher, rendered two-player test and shared document registration belong to the controller's
  other streams.
- **Superseded by OT.R71 (2026-10-22; #421 finished by the online seat).** The development gate this note describes
  (`S2U_DEV_RESPAWN`, `NODE_ENV=development`, a loopback bind; the page's `devrespawn=1`) is removed: the switch is on,
  central and the match process default the capability on, and the selected RulesSet bit decides a game's rules in
  every environment. The rule selection in sections 1-3 (the world report's bit, the room's original 1200/1, the held
  launch) is unchanged. Split hosts now declare they play respawn and central places a respawn game only on one that
  does (the plan's Log, 2026-10-22).

## 1. Original selection and settings reused

| fact reused | original source and existing research |
|---|---|
| Native CreateGame1 sends RulesSet zero; the selected rules arrive in the host's world report. | `FUN_002edda0`, D:L190575; `FUN_002ef590`, D:L191375-191384; `FUN_002ef9f0`, D:L191496-191512. These are the existing citations at `central/src/lobby.ts` `RULES_SET`. |
| RulesSet bit 1 (`AllowRespawn = 2`) carries `mp_allow_respawn`; bit 0 (`FriendlyFire = 1`) carries `mp_friendly_fire`. | Same world-report functions and lines. `match/src/game.ts` now names the same existing respawn bit as `RULES_SET_ALLOW_RESPAWN`; no new bit value is inferred. |
| The reported GameStats D record carries round count in byte 1 and round minutes in byte 2. | Existing bridge reading: `FUN_002f7c40`, D:L196725-196728. `gameStatsD` decodes it; the bridge still passes positive reported values, and the split still uses its existing PlacementRecord clock/count. |
| Enabling respawn selects one 20-minute round and removes non-SUPPRESSION maps. | Reviewed original `RUN/UIZANIM.ZAR`, `dlgCreateGame.rdr`, `set_respawn_valve` and `refresh_cg_screen`; [research 357](357-respawn-playlist-toggle.md) and [348](348-respawn-clock-and-result.md). |
| A held respawn room waits for lobby launch and load completion, then returns to the same lobby after the existing final screens. | Existing room implementation and [research 350](350-respawn-held-lobby-lifecycle.md). The launch/dispatch readings keep that note's limits; no new timer or phase is introduced here. |

The native zero-at-create / selected-bit-at-report sequence is preserved. A development capability does not force
every created game to respawn and does not rewrite a hello. Friendly fire keeps its existing independent bit test.
SUPPRESSION-only `playedRules` remains the final map/rules guard in `Room`; a non-SUPPRESSION request still plays
classic. Clock/count bytes, defaults, lobby admission limits, load barrier, scores, death/Action gates and final
screen durations are unchanged.

## 2. Development capability (adaptation)

`match/src/devRespawn.ts` is a pure process-policy helper. A process enables the capability only when all three
facts hold: `S2U_DEV_RESPAWN` is exactly `1`, `NODE_ENV` is exactly `development`, and its resolved listener bind is
exactly `127.0.0.1`, `::1` or `localhost`. Other spellings, whitespace, wildcard/public binds, production/test mode
or an absent opt-in leave it false. Central passes its actual default bind `0.0.0.0`; the match entry passes its
actual default `127.0.0.1`. Existing TRUST_PROXY bind restrictions remain separate and unchanged.

Both source entrypoints evaluate this policy themselves. Central passes the resulting `respawnRules` boolean to
its standalone MatchServer and `createServices`; the latter passes it to both RoomService and GameBridge. All
optional capability parameters default false and only accept boolean true. A client create/report field named
`respawnRules` cannot supply the capability.

RoomService lifts its existing RulesSet-bit refusal on both create and world-report only when the capability is
true. Default/release behavior retains `RESPAWN_REFUSED_STATUS_PLACEHOLDER` and refuses the report before changing
the stored game. GameBridge constructs its held room from the stored game's actual selected RulesSet, and only
with that server capability. A classic report therefore stays classic on an opted-in process.

The source match entry passes its own checked capability to MatchGame and MatchServer. MatchGame reads the placed
record's existing RulesSet, without a new placement/pipe field or handshake. Its status now reports
`room.stats().rules`, so the report reflects the actual room after `playedRules`, including an incompatible map
falling back to classic. Those status messages are the port's service transport, a labelled adaptation with no
original client-wire change.

The host's existing `childEnv` already retains `S2U_*` and `NODE_ENV`, while setting the child bind to `127.0.0.1`.
Only a test is added there; no host environment filtering or schema changes. An ordinary host keeps its ordinary
environment and the capability remains false. A caller merely asking for respawn while these checks are false
cannot enable it. The source launcher and page must opt in separately; this backend change alone does not expose
the native Create Game row.

## 3. Tests and evidence boundaries

The focused tests exercise the pure environment matrix, RoomService's create/report admission and refusals,
main's `createServices` factory, MatchGame's selected-rule construction and actual status, source
`startMatchProcess` environment propagation, and the existing host child environment.

The factory test runs native create-zero/report-two against the actual service objects on a synthetic SUPPRESSION
map, observes a held 1200-second/one-round room and welcome, then releases the existing launch/load barrier. It
also holds classic selection, default/explicit-false refusal, and the existing incompatible-map guard. It does
not bypass the ordinary report by changing the room options afterward. New process-policy tests replace map I/O
and listener effects while using real boot, MatchGame and Room code; no port or game loop starts in those tests.
The existing fixture-backed headless process tests in the same targeted command retain their own ports/cleanup.

RED was captured before production changes in ignored `logs/respawn-dev-back/red.log` and `red.json`:

```text
Test Files  4 failed | 1 passed (5)
     Tests  5 failed | 68 passed (73)
```

The five behavioral failures reproduced the create/report refusal and forced-classic room construction. The
fourth failing file was the new policy test's missing-module suite, rather than an additional behavioral test.
The first post-change run had two test-expectation failures: the optional welcome `waiting` flag describes an
empty side, while the held room's phase remains `waiting` for both seats. The tests now assert that existing phase
and the absence of `startTick`; no production waiting behavior was changed to satisfy the test.

Final targeted GREEN, with no failed, filtered or skipped tests:

```text
Test Files  6 passed (6)
     Tests  102 passed (102)
```

The complete stdout and JSON are retained under ignored `logs/respawn-dev-back/green-final.log` and
`green-final.json`. Reviewer command, from `socomlegacy/`:

```sh
../node_modules/.bin/vitest run packages/match/test/devRespawn.test.ts packages/match/test/matchGame.test.ts packages/match/test/matchMain.test.ts packages/central/test/lobbyBridge.test.ts packages/central/test/mainRespawn.test.ts packages/host/test/games.test.ts --maxWorkers=2
```

These checks establish service wiring and transcription behavior, not original-runtime parity. No full suite,
workspace typecheck, build, browser, original
game, all-map data walk, capture comparison or physical playtest was performed by this worker. The controller owns
the actual frontend-to-lobby-to-match-to-results-to-lobby test and the serialized integration gate.

## 4. Placeholders and review

No new placeholder name is introduced. The existing `RESPAWN_REFUSED_STATUS_PLACEHOLDER` remains the default
restriction's unchanged status; only the authorized local development capability bypasses that existing refusal.
The original UI data and rule values are reused. The new boolean/environment policy is explicitly an adaptation,
not an unmeasured original setting. Fresh code review re-ran the focused set and checked the native-selection wiring, policy, actual room status
and retained defaults. It does not certify a new original-code reading. The controller owns shared note-range
registration, corpus rebuilding and the rendered lifecycle proof.
