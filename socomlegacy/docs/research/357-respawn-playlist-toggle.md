# 357 -- CREATE GAME's respawn playlist toggle (RSP-1)

> Integration identifier correction, 2026-10-22: this unmerged respawn note was 347; main independently landed an overlay note at that ID. It is now 357, with evidence and confidence unchanged. Its original identity is preserved at `54c597752d05f5d095e183411baff6a7fc8b9fe2:socomlegacy/docs/research/347-respawn-playlist-toggle.md`.

- Date: 2026-10-21. Simulation track; [respawn fixes](../plans/2026-10-21-respawn-fixes.md), RSP-1.
- Base: `82f62a54f938f30b43f8dd7e592214717315d8ff`, branch `agent/respawn-menu`.
- Status: disc script and mission fields **reading**, fresh review **PASS (medium)**, 2026-10-21.
  The original-code references below remain inherited pointers, **reading, pending review**, not a fresh executable read. No original-runtime
  measurement, capture comparison or proven claim is made.
- Follows [356 F3](356-original-multiplayer-respawn-audit.md#f3-playlist-pruning-and-saverestore-are-incomplete).
  The standing respawn release gate and four-map owner offer remain in force.

## 1. Sources and method

The copied, ignored disc extraction was read through `Zar.parse`, `parseRdr` and `parseAnimSets`; `missionRecords`
provided the existing UI's typed mission table. The original RDR `NUMBER` and `TYPE` words were also inspected
directly after parsing. Only the common mission table and UI archives were inspected; no map archive was walked.

| source | field / member | SHA256 |
|---|---|---|
| `RUN/READERC.ZAR` | `missionlist.rdr`: `NUMBER`, `NAME`, `TYPE`, `MULTIPLAYER` | `1b7df1c9732d4d9be0c9ce49de342cd9b552f0d41269dc486be0075e62db9123` |
| `RUN/UIZANIM.ZAR` | set `dlgCreateGame.rdr`: `set_respawn_valve`, `refresh_cg_screen` | `375b3cf88cb4b412bf509339396804ecb4b9d6f987092e714dfac4dc5999495f` |

`RemoveNonSuppressionMaps` is the original table's `FUN_002791e0` (D:L123748-123820; research 163 §3).
`CopyUIVar` is `FUN_00281090`, with its two name indices built by `FUN_0027fd70` (research 302 §4). These function
bodies were not re-read here: no decompilation export is available in this worker's environment. The disc calls and
their arguments were freshly read; an independent review must re-read the executable semantics before promoting
the inherited code details. No decompiled text or raw disc data is included.

## 2. The original toggle, its selected rows and the implementation

The following are decoded fields of `set_respawn_valve`'s `NA` sequence. Offsets are the animation's byte offsets
reported by `parseAnimSets`, not executable addresses.

| branch / offsets | decoded effect |
|---|---|
| ON, 148 / 164 | save `RCountValve` / `RTimeValve` into `RoundCountValveSave` / `RoundTimeValveSave` |
| ON, 180 / 196 | set `RTimeValve = 20`, `RCountValve = 1` |
| ON, 212 / 236 | when `TestUIVar(PLAYLISTVAR)` succeeds, `CopyUIVar(PLAYLISTVAR, PLAYLISTVAR_SAVE)` |
| ON, 268 | otherwise `ClearUIVar(PLAYLISTVAR_SAVE)` |
| ON, 292 | `RemoveNonSuppressionMaps(PLAYLISTVAR)` |
| OFF, 348 / 372 | when `TestUIVar(PLAYLISTVAR_SAVE)` succeeds, `CopyUIVar(PLAYLISTVAR_SAVE, PLAYLISTVAR)` |
| OFF, 404 / 420 | restore `RCountValve` / `RTimeValve` from their saved valves |

Both copy records resolve their source and destination through the running animation's name table: the source's
index at record `+0x10`, the destination's at `+0x14`. They run through production `OptionsCommands` with the same
current-dialog and running-name callbacks as the viewer. The only copy change is admitting `dlgCreateGame.rdr`
to that handler's supported scope.

`refresh_cg_screen` disables `RoundTime_btn` / `NumberRounds_btn` for respawn (460 / 476), enables them for classic
(388 / 404), and maps 20 minutes and one round to `mp_max_round_time = 1200` (1676) and `mp_max_rounds = 1` (2132).
The script already performs all these changes; no replacement toggle or script rewrite was added.

The mission table has 22 multiplayer records. TYPE is SUPPRESSION for MP51 Vigilance, MP64 Shadow Falls, MP81 Chain
Reaction, MP2 Frostfire, MP5 Abandoned and MP8 Rat's Nest. MP72 Crossroads and MP7 Night Stalker are DEMOLITION.
The prune resolves each selected row's map number through this existing table and keeps only SUPPRESSION rows,
retaining their full values, existing order and repeats. It writes through `UiVarManager.set`; the saved array is
left intact. A playlist containing only non-SUPPRESSION rows becomes an empty array and can still restore its
nonempty backup on OFF. Starting with an empty array takes the script's clear-backup branch, preventing a stale
playlist from an earlier toggle from returning.

This does not change what the page offers. The four-map list is unchanged: Vigilance, Crossroads, Frostfire and
Night Stalker; with respawn on the existing available-list filter offers only Vigilance and Frostfire. Tests may
seed other table rows to exercise TYPE filtering, without making those maps selectable in the offer.

## 3. Verification and limits

The regression seam is the existing headless CREATE GAME rig, running the disc's animations and production command
handlers. The rig now mounts `OptionsCommands` with the viewer's dialog/name callbacks; no command is mocked or
playlist-pruning behavior substituted. The disabled RESPAWN row is bypassed only by directly invoking its original
animation as a test instrument; `RESPAWN_ROW_DISABLED_READING` and the global release gate are unchanged.

The first behavioral RED retained `[51,72,2]` instead of `[51,2]`; a separate COPY regression left the backup
undefined. After implementation, the focused command/classic-screen/options checks reported 54 passes. Added
regressions cover a later toggle with a new playlist, repeated rows, an empty list clearing an older backup, an
all-DEMOLITION list, and all TYPE entries in the one common mission table. Their first run revealed a test wait
that started the next toggle before the original selected-list refresh had finished; the test now waits for public
runtime completion with a bounded frame budget. That budget is an instrument, not an original game timing.

Verification command, from `socomlegacy/`, with `SOCOM_DISC` set to the local copied extraction:

```sh
../node_modules/.bin/vitest run packages/ui/test/screens/createGameRespawn.test.ts packages/ui/test/screens/createGameCommands.test.ts packages/ui/test/screens/createGameScreen.test.ts packages/ui/test/screens/optionsScreen.test.ts --maxWorkers=2
```

The final run reported **4 files, 58 tests passed, 0 failed, 0 skipped**. This is filtered unit and disc-backed
headless UI evidence; it is not a rendered browser run, a physical playtest or an original-runtime comparison. No all-map scan, full
suite, workspace typecheck, build, browser or game run was performed. The controller owns the integrated gate,
fresh source review and corpus rebuild. No new placeholder or reading constant was introduced; existing release
restrictions are retained at their existing confidence levels.

## 4. Independent review

The fresh reviewer independently re-read the toggle/copy records, archive hashes and all 22 mission TYPE fields,
reran the four-file 58-test command (58 passed, 0 failed, 0 skipped), and reproduced the missing prune/copy behavior
with bounded omission probes. Historical RED output is author-reported and corroborated by the parent source;
the original executable handlers were unavailable. Integrated rendered checks are recorded in the plan's Log.
