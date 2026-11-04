# 356 -- Original multiplayer respawn: ISO and implementation audit

> Integration identifier correction, 2026-10-22: this unmerged respawn note was 346; main independently landed an overlay note at that ID. It is now 356, with evidence and confidence unchanged. Its original identity is preserved at `54c597752d05f5d095e183411baff6a7fc8b9fe2:socomlegacy/docs/research/346-original-multiplayer-respawn-audit.md`.

- Date: 2026-10-21.
- Plan: [original multiplayer respawn audit](../plans/2026-10-21-respawn-audit.md), RSPA-1.
- Base: `origin/main` at `c2a4e5af0db75986e6043ce6b9f915b0e91dc2f4`.
- Status: initial source and test audit complete; fresh review **PASS (high)**, 2026-10-21. The re-read original-disc
  facts are **reading**; inherited executable readings retain the limits below. Selected external footage was
  inspected later (section 6); verification against the selected working r0004 setup remains pending.
  This note establishes no proven claim and changes no parity implementation.
- Scope: the existing multiplayer respawn mechanics and UI/UX, reusing gameplay and animation. No production code
  or standing ruling is changed. Original disc bytes and local machine paths are not included in this note.

## 1. Evidence and method

The supplied ISO is read locally through `IsoAssetSource` and the repository's archive, RDR and zAnim readers.
Temporary scripts and decoded evidence are under ignored `socomlegacy/logs/respawn-audit/` in the audit worktree.
Existing tests are run as filtered checks, with their evidence kind and omissions recorded separately below.

The image is 4,380,753,920 bytes. `SYSTEM.CNF` reads `SCUS_972.75`, `VER = 1.02`, `VMODE = NTSC` through
`discIdentity`. The VER line identifies the disc's field, not an installed online patch. Relevant archive hashes:

| source | SHA256 |
|---|---|
| `RUN/UIZANIM.ZAR` | `375b3cf88cb4b412bf509339396804ecb4b9d6f987092e714dfac4dc5999495f` |
| `RUN/UI/READERC.ZAR` | `95d8450a82aad5e86db0afd93e1568718b192691afcc992d346f45338226da51` |
| `RUN/READERC.ZAR` | `1b7df1c9732d4d9be0c9ce49de342cd9b552f0d41269dc486be0075e62db9123` |
| `RUN/MP2.ZDB` | `d34e1119cf6c5b73dbab34a27efc0ddfe86049c21f338c641973a35003b03674` |

The audit read `missionlist.rdr`, CREATE GAME and GAME LOBBY's zAnim sets, the menu locale, `controller.rdr`, and
`MZANIM.ZAR` plus `AIMAPS.MPS` in all 22 multiplayer archives. Six maps have the respawn sequences and TYPE
SUPPRESSION: Vigilance (MP51), Shadow Falls (MP64), Chain Reaction (MP81), Frostfire (MP2), Abandoned (MP5), Rat's
Nest (MP8). The original's rule is team SUPPRESSION with the respawn option enabled.

Relevant existing research is attributed, not freshly certified: [91](91-the-round.md) sections 4 and 18;
[163](163-create-game.md) section 3; [179](179-c1-match-server.md) sections 9.3-9.5;
[192](192-m1-mp-modes-rules.md) G17, G23-G25; [317](317-bodies-and-drops-on-the-ground.md);
[344](344-controller-presets.md). No decompilation export was re-read. Where an older note says PROVEN for a
code/disc read, the current confidence definition treats that evidence as a reading, not original-runtime proof.

## 2. Findings

### F1. Respawn is deliberately disabled at several boundaries

`viewer/src/net/protocol.ts:468` has `RESPAWN_RULES_ENABLED = false`; `viewer/src/rules.ts` ignores a respawn URL or
saved choice while it is off. CREATE GAME's `SetMission` explicitly dispatches `DisableButton(Respawn)` on entry
(`ui/src/screens/createGameCommands.ts:384`). The lobby rejects the respawn bit in both `createGame` and
`reportGame` (`central/src/lobby.ts:737,824`). The in-process game's `LobbyBridge.roomOptions` explicitly sets
`rules: 'classic'` (`central/src/bridge.ts:851`).

These implement the standing owner ruling, not an accidental regression. The audit does not lift it. H211 records
the standing default; the same boundary applies before exposing a playable original respawn mode. Enabling the one
global flag would leave other refusals and hard-coded classic paths in place.

### F2. The dormant room's defaults and banner disagree with the disc's respawn settings

`RUN/UIZANIM.ZAR`, set `dlgCreateGame.rdr`, animation `set_respawn_valve` saves the current time and round count,
sets `RTimeValve = 20`, `RCountValve = 1`, and calls `RemoveNonSuppressionMaps`. `refresh_cg_screen` maps those
valves to `mp_max_round_time = 1200`, `mp_max_rounds = 1`, displays `20 minutes` / `1`, and disables
`RoundTime_btn` / `NumberRounds_btn`. Turning respawn off restores the saved settings. This was re-read from this
ISO and agrees with research 179 section 9.4.

The raw script still runs: invoking the otherwise hidden animation in the existing CREATE GAME test rig changes
its time/count to 1200/1 and its labels to `20 minutes` / `1`. In contrast a normal `Room` constructed with respawn
and no override welcomes its first player with `rounds: 11` and `timeLeft() = 360` (`match/src/room.ts:279`).
`viewer/test/netRules.test.ts:75` explicitly pins `STARTING ROUND 1 OF 11`. The resulting round count/banner is an
old retained misreading, recorded by research 179 section 9.4 and H95. A future fix must carry the original 1200/1
through the room, welcome, HUD/game details and lobby launch; changing a label alone would not correct the match.

### F3. Playlist pruning and save/restore are incomplete

The same disc animation calls `RemoveNonSuppressionMaps(PLAYLISTVAR)` after saving the old playlist. The current
handler is declared but unimplemented (`ui/src/screens/createGameCommands.ts:58`; no implementation elsewhere in
`ui/src`). The audit rig seeded with `[51,72,2]` (Vigilance, Crossroads, Frostfire), then driven through the hidden
disc animation, retains `[51,72,2]`; the original command should remove Crossroads, a DEMOLITION map.

`availableMissionRows` already filters newly listed missions by TYPE when respawn is on. That does not remove
an incompatible mission already selected.

The fresh review found a second production gap: `CopyUIVar` has a body in `OptionsCommands`, but its
`COPY_UI_VAR_DIALOGS` scope excludes `dlgCreateGame.rdr` (`ui/src/screens/optionsCommands.ts:62,180-183`). The real
front end registers that scoped handler (`viewer/src/frontEnd.ts:520-524`). Repeating the probe with the same
dialog/name callbacks and that module mounted leaves `PLAYLISTVAR_SAVE` null. After simulating only the separate
prune in the rig's memory (`[51,72,2]` to `[51,2]`), toggling OFF still leaves `[51,2]` instead of restoring the
original list. This demonstrates the save/restore gap independently of the pruning gap.

The current four-map offer is a separate owner restriction; this audit does not widen it to all six maps.

### F4. The result can be decided by the survival bonus

On all six SUPPRESSION maps, `objectives/success2` compares `seals_team_score` with `terrs_team_score`, writes winner
0 / 8 / 99, sets `mp_game_over = 1`, waits 1 second, then writes `mission_complete = 1`. The operand is a name-table
reference: index 45 on five maps, 48 on MP51. All resolve to `terrs_team_score`; the raw number must not be read as
a score threshold. Research 91 section 18.2.4 and research 192, G25, locate the +1 alive bonus in the later exit state
(`FUN_00223970`, D:L76146-76165); that code reading was not independently repeated here.

`Room.endRound` adds +1 to each living player's `roundScore` before summing the sides and choosing the winner
(`match/src/room.ts:6785`). A bounded synthetic-room probe with no kills, two living SEALs and one living Terrorist
reports a SEAL win. The recorded original reading calls for a draw. The repository already has precisely this
regression as an `it.fails` (`central/test/round.parity.test.ts:126`). A green suite includes that expected failure;
it does not establish that the mismatch is fixed.

### F5. The spawn picker still searches the whole side's pool

`Room.pick` (`match/src/room.ts:3591`) searches every respawn record for that side, considers only living enemies,
and chooses a random record when no enemy is living. `RESPAWN_BLOCK_PLACEHOLDER` still describes the missing
client-index block. Research 179 section 9.3's original-code reading instead restricts the selection to that
client's block of `trunc(count / 24)` records, considers enemy bodies including dead ones, and takes the block's
first record when no enemy exists. The round-start random choice is restricted to the same client's start block.

This audit re-read the disc's records, not that function's decompilation. Frostfire's raw `AIMAPS.MPS` has 24 start
records per side and 277 / 247 respawn records (the per-client integer block sizes are 11 / 10). Do not replace
those actual counts with a multiple of 24. This is an inherited, still-present simulation gap; footage alone will
not settle the picker for every client, and its code reading needs a fresh source check before implementation.

### F6. The respawn-specific dead HUD remains incomplete

`NetPage.prompt()` explicitly returns null for respawn (`viewer/src/netPage.ts:1170`), and the HUD's dead help
path is wired only for benched classic/ghost players (`viewer/src/hud.ts:1059`). The fallback posts the literal
`Press the X button to respawn.` once into the message window after 5 seconds (`netPage.ts:1402`). It does not use
the existing help/prompt renderer or adapt the instruction to the controller preset/device.

The ISO's `RUN/READERC.ZAR:controller.rdr`, `ControllerConfigs/Mappings` maps Action to X for Default, Reverse and
Config4, and Circle for Goldeneye. Research 91 section 4.1 and 179 section 9.5 identify the respawn action as that
Action result (`FUN_00592560`, D:L451675-451700), not a universal X binding. The disc mapping was re-read; the
executable's respawn handler was not. The current literal is consequently an identified preset mismatch against
the retained reading. Exact original prompt placement, duration, glyph and behaviour under open menus await
source/capture verification. Existing `BODY_FADE_PLACEHOLDER` also keeps the own corpse whole until it is hidden
at 10 seconds; a continuous fade has not been established in this audit and no animation is changed.

### F7. The dormant respawn lifecycle bypasses the original lobby launch/return path

`Room` starts respawn in phase `play` at construction (`match/src/room.ts:1931`), even with `heldLaunch: true`.
The probe's first player is alive and its clock is running before a launch. After its result screens, the room's
return-to-lobby branch is conditioned on `classic` (`room.ts:6421`); respawn starts another match immediately.
A shortened synthetic match reproduces a new `roundStart` after its first `roundOver` without any lobby step.

This is the dedicated room's existing lifecycle. The original multiplayer target needs the existing game lobby's
ready/launch barrier and return after the match, not reuse of that lifecycle unchanged. Research 91 section 18.3,
192 G23/G24 and the ISO's `dlgGameLobby.rdr` set are the existing sources; this audit read that set but did not
re-derive the exit-state dispatch from the executable. The in-process bridge is explicitly classic (F1); the split
launch record can carry `rulesSet`, rounds and time, but its complete respawn path has not been run.

## 3. Existing pieces that can be reused

- The room enforces SUPPRESSION-only respawn for read game types (`playedRules`); the disc's six eligible maps agree.
- The raw CREATE GAME script already holds the original time/count display and disable/restore logic (F2); it is
  unnecessary to design a replacement menu.
- The selected room tests hold the present manual Action gate (5-second minimum and 10-second fade gate), fresh
  health/kit with stats retained, and classic's refusal to respawn. Their original-code citations were not re-read
  here; these are tested existing implementations, not original-runtime proof.
- The selected spectator tests retain a respawn player's own-body view rather than enabling classic teammate
  cycling; the original-runtime camera remains for footage to confirm.
- The round cue pin re-derived from this ISO over all 22 maps agrees with the existing pin. On Frostfire,
  `mission_timer2` posts `TIME HAS EXPIRED`, plays the SEAL win music, waits 15 seconds, then calls `success2`.
  `success2` adds its 1-second wait. The existing room's expired-play/result phases and cue dispatcher already cover
  this shape; the tests exercise those phases with shortened clocks.
- The selected account-stat tests preserve the existing respawn exclusion from uploads. This is a unit-tested
  existing code reading, not a fresh executable or original-runtime check.

## 4. Verification and limits

| evidence kind | result |
|---|---|
| ISO/source inspection | identity checked; relevant UI and data decoded; objectives and spawn records read across all 22 maps; independent source review covered the fields listed below |
| filtered unit / ISO-backed UI tests | 6 files, 95 reported passing, 0 failed, 0 skipped; includes the **one expected failing** result-order assertion described in F4 |
| filtered unit / ISO-backed cue tests | 4 files, 151 passing, 0 failed, 0 skipped; includes re-derivation of the cue pin from all 22 extracted map archives |
| bounded headless probes | current CREATE GAME script state, mixed playlist, dormant room defaults, equal-points winner and launch/return lifecycle reproduced; audit instruments, not original-runtime comparisons |
| rendered browser | not run |
| physical playtest | not run |
| original-runtime capture comparison | not run; Frostfire video pending |
| full gate / typecheck / build | not run; this is an audit with no production changes |
| document checks | relative links resolve; staged whitespace check clean; repository leak check clean (2 text files, 0 hits; scanner self-test 33/33) |

Commands, from `socomlegacy/`, with `SOCOM_DISC` set to the ignored audit extraction, `SOCOM_ISO` to the supplied
image and `SOCOM_PC_ROOT` to the local read-only desktop tree (paths are host-local, never recorded here):

```sh
../node_modules/.bin/vitest run packages/central/test/round.parity.test.ts packages/viewer/test/netRules.test.ts packages/viewer/test/rules.test.ts packages/ui/test/screens/createGameCommands.test.ts packages/ui/test/screens/createGameScreen.test.ts packages/ui/test/screens/createGameOffer.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=logs/respawn-audit/filtered-tests.json
../node_modules/.bin/vitest run packages/viewer/test/roundCues.parity.test.ts packages/viewer/test/roundCues.test.ts packages/viewer/test/spectatorView.test.ts packages/match/test/accountStats.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=logs/respawn-audit/cues-stats-tests.json
```

The desktop host lock read FREE before each test batch. No game server, browser or external match server was used.
The first scratch reader attempt used `fs.openAsBlob`; this Node build reported a wrapped size for the image, so
that setup attempt stopped before reading. The audit then used the repository test's `readSync`-per-slice Blob
stand-in with `IsoAssetSource`; it addressed the full-size image without wrapping and read the selected files
(242,451,441 extracted bytes, plus ranged member reads). It did not read or hash the entire ISO. This was an
audit-instrument setup failure, not a test failure or a production-code change. The first staged leak check flagged
ordinary research prose as an address; the wording was corrected and the check rerun clean without an exemption.
Trello was skipped because the connector is absent.

### Fresh review

The independent `respawn_audit_review` reviewer returned **PASS, high**, with no unresolved findings after the
corrections to F3's production copy scope, F6's line pointer and F7's event-count wording. It independently re-read
the original image through repository readers: disc identity/size, the 22-map archive count, all four hashes above;
CREATE GAME's toggle, saved time/count, 1200/1 settings, disabled controls and copy/prune calls; mission types and
all four Action mappings; all six `success2` comparisons and result sequences; Frostfire's expiry and spawn counts;
and GAME LOBBY's ready/launch-related animations. It checked F1-F7 against production source and independently
reproduced F3 with the production `OptionsCommands` handler mounted.

It also reran both filtered test commands and reproduced 95 and 151 reported passes respectively, no failures or
skips, including the first batch's one expected-failure parity test. Each preceding desktop lock check read FREE.
These are independent reruns of the same checks, not 492 distinct tests. Neither reviewer nor author re-read the
decompilation or an original-runtime capture; bonus ordering, spawn blocks, input/timing and exit dispatch remain
inherited code readings. The document review does not turn them into freshly re-derived or proven behaviours.

## 5. What the Frostfire footage should settle

Prioritise one continuous death-to-respawn sequence with the HUD visible, followed by a scoreboard and match end.
Useful details: prompt appearance and location; the pressed button and controller preset if known; the delay and
body fade; camera behaviour while dead; weapon/character selection and what the next spawn carries; the fixed clock
and round banner; TIME HAS EXPIRED and the final result; return to the game lobby. Setup footage showing respawn
enabled, disabled time/count rows and the playlist is useful too. Compression or an unknown frame rate limits timing
claims; a normal video can corroborate presentation without establishing frame-exact proof.

No additional evidence is needed from the developer to retain these initial findings. The next implementation
brief should join the UI, lobby and room boundaries above and give each simulation change its own source-backed
test and fresh review. The original-runtime questions remain open until footage or an original trace settles them.

## 6. Supplied Frostfire video (2026-10-21)

Source: [Frostfire SUPPRESSION respawn, XLink, 31/08/2014](https://www.youtube.com/watch?v=pQEhRmFaodA), supplied
by the developer. The page title gives that context, and the in-game scoreboard identifies a LAN game. The inspected
frames do not identify the region or patch version. This is an **unscored external video reference**; it establishes
no proven value or r0004 compatibility. Earlier disc/code readings keep their own confidence and version.

Method: selected timestamps viewed in Chrome's YouTube player, paused and inspected as rendered frames. The
player reports 21:38 duration (1298.361 s). The whole recording was not watched continuously. No media or capture
files were added to git. Times below locate observations; they are not frame-accurate game timings.

Fresh document/source review: **PASS (medium)**. A second reviewer independently observed the one-round banner
at about 0:55 and the death-help, Cross instruction, new live body and LAN scoreboard at 3:44-3:49. The later
expiry/final-screen observations and fractional player duration below remain **pending independent source review**.
The reviewer observed no region/build proof. This partial source review does not promote any observation to proven.

| video time | observed | what it helps settle |
|---|---|---|
| [0:53](https://www.youtube.com/watch?v=pQEhRmFaodA&t=53s) | round banner names round 1 of 1; clock is near twenty minutes | corroborates the corrected banner/count for the captured build |
| [3:45](https://www.youtube.com/watch?v=pQEhRmFaodA&t=225s) | yellow death/weapons help near the lower centre, including an R2 glyph | F6's help-line location and glyph presentation |
| [3:47](https://www.youtube.com/watch?v=pQEhRmFaodA&t=227s) | a second yellow line below it gives the respawn instruction with a blue Cross glyph | direct reference for replacing the generic message-window fallback; no minimum-delay inference |
| [3:49-3:51](https://www.youtube.com/watch?v=pQEhRmFaodA&t=229s) | scoreboard over the new life; a later frame shows the live body and replenished magazine | the visible transition; scoreboard has LAN details and KILLS / DEATH / SCORE columns |
| [20:53](https://www.youtube.com/watch?v=pQEhRmFaodA&t=1253s), 21:07 | play continues with the clock at zero | corroborates a live post-expiry interval, without fixing its exact length |
| [21:21](https://www.youtube.com/watch?v=pQEhRmFaodA&t=1281s) | FINAL ROUND, team winner/loser labels, countdown and SCORE / KILLS / DEATHS columns | post-match screen presentation |
| [21:37-21:38.2](https://www.youtube.com/watch?v=pQEhRmFaodA&t=1297s) | GAME COMPLETE, final statistics, elapsed-time field and returning-to-lobby text | final-screen presentation and return intent; the inspected near-end frame is still this screen |

This fills useful **visual-reference** gaps, especially F6, and corroborates the one-round banner. It does not
establish r0004's exact input gate, fade/camera rules, presets, next-spawn selection or score-before-bonus tie rule.
The result shown is not tied. The hidden spawn algorithm cannot be recovered from one player's view. No lobby
launch was inspected: the recording opens on a loading screen, and the near-end sample does not show the lobby
transition. Do not copy LAN-specific details into the online path or mark uninspected menus absent from the video.

The working r0004 setup remains the primary reference (the fixes plan, RSP.R5). Compare these presentation
observations there before claiming version-specific parity; use controlled input/trace evidence for exact rules.
No behaviour, timing constant, release flag or owner row is changed by this video assessment.

## 7. Source-backed follow-up

The fixes plan now implements the video-shown death/help widgets and glyphs, independent ready-line lifetime,
original client-block spawn picking and fresh dead Action gating. Fresh reviewers independently re-read the loaded
r0004 instruction image and controller/font data; all six eligible maps' spawn lists were read through the repo
readers. These are **readings**, recorded in research [351](351-respawn-help-presentation.md),
[352](352-r0004-respawn-code-check.md), [353](353-r0004-respawn-spawn-picker.md) and
[354](354-respawn-action-input.md), rather than claims inferred from a player's voluntary wait in this footage.
The audit's earlier gap descriptions retain their historical context; the fixes plan's Log owns current results.
A controlled r0004 death sequence, partial-alpha rendering and capture-scored HUD comparison remain open.
