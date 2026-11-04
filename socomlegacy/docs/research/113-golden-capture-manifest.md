# 113 -- The golden capture manifest: every front-end screen, the frame that shows it, the run that took it (PLAT-31)

Written 2026-10-01 for task **PLAT-31** (`../roadmap/01-platform.md`, "PLAT-31 -- The golden capture manifest for the
front end"). The manifest is `../parity/golden-manifest.json`; its reader and validator are `../../tools/goldenManifest.ts`,
held by `../../tools/test/goldenManifest.test.ts`. It owns one mapping: **screen or state -> capture path -> method**;
PLAT-01's matrix (`../roadmap/PLATFORM.md`) owns subsystem -> package -> status -> test.

Sources, all read-only: the dialog list of PLAT-06 (`../../tools/test/dialogInventory.pinned.json`, web research 96);
the PC project under `SOCOM_PC_ROOT` (`C:/Projects/socom_pc` on the build host) -- its `logs/parity/` runs (git-ignored
there), its tracked `scripts/parity/` references, `docs/parity/REPORT.md`, `docs/KNOWN.md` and its research notes 18,
64, 66, 80 (both); the parity archive `SOCOM_PARITY_ARCHIVE` (`D:/socom_archive/parity` on the build host), where older
`logs/parity/` runs were moved; web research 98 §1-2 (which boot captures are which SONY448 pictures) and the web
sprint 7 plan's W7.R7 (the 4:3 correction per capture set) and W7.R8 (dark frames). Dialog attribution uses the
repository's own reader: `npx tsx tools/dump-dialogs.ts --dialog <name>.rdr` with `SOCOM_DISC` set, whose
"message ids named by the layout" line names a dialog's caption ids (names only; no caption text is copied). **No frame,
crop or hash of a frame is in git**: the manifest holds file names, byte counts and pixel sizes.

## 0. Answers

| # | question | answer | section |
|---|---|---|---|
| R113.1 | the manifest's form | JSON data, `docs/parity/golden-manifest.json`, as the brief names it: PLAT-01 and the capture tasks read it as data, a JSON file needs no build to be read by the PC project's Python, and the TypeScript reader holds the types and the rules | §1 |
| R113.2 | how much of the front end has a frame | **58 rows, 175 captures; 26 of the inventory's 103 dialogs** are in a row; **77 dialogs** (and the dangling `dlgStickSetup`) are in the no-frame list: **43 owed** by a capture task (`dlgMPswitch`, which draws nothing, to PLAT-36's trace), **34 owed by none** (the campaign dialogs under R1); each of the 77 names its capture method (`owedMethods`), as does each of the eleven states (twelve since BOOT-02 added `state.boot-loader-panel`, 2026-10-02, research 130 §4) | §1, §3 |
| R113.3 | how many frames were looked at | **130 of the 175 captures** (and 4 more left out: in-game or black); 45 are mapped by name, each marked `looked: false`, and a row with no looked capture is `name-only` (none is: every row has a looked frame) | §2.2 |
| R113.4 | the source of a capture | `pcsx2` when the run is named so (`golden`, `pcsx2_*`, `s4_pcsx2`, a `.pcsx2.png` reference) -- every such full frame on this host is 640x480 but one; `recomp` for the 640x448 runs driven with `--target ours` or whose frame has no 4:3 pillar bars (W7.R7); `owner-photo` exists in the schema and is used by no row (§4) | §2.3 |
| R113.5 | which screens PCSX2 can reach offline (the block's Unknown) | per no-frame dialog: `yes` (extras, options, campaign), `no-our-server` (every online dialog: R293, **our** local stack only), `unknown` (LAN, the relaunch popups, the code-named dialogs), `never` (`dlgStickSetup`) | §3 |
| R113.6 | PLAT-01's citation of rows by id | **owed** to PLAT-01's matrix: the block's acceptance says the matrix cites the manifest's rows; this task corrected the matrix's own PLAT-31 row only (status partial, its test) | §5 |

## 1. The manifest

`schema` 1; `roots` describes the two named roots (no host path is written in the file: the test refuses a drive
letter or a user folder anywhere in it); `methods` names each run or script once (`how`, `cites`); `owedMethods` names
each run not yet taken the same way (from the owing tasks' blocks); `rows`; `screensWithoutFrame`;
`statesWithoutFrame`. A **row** is one screen or state: `id` (lower-case, dotted, unique), `screen` (what the frame
shows, in words), `dialogs` (the inventory's names; empty for what no dialog draws -- the
loader's LOADING.RAW, SCUSNGUI.ELF), `segment`, `confidence` (§2.2), `cites`, and one or more `captures`, each `root`,
`path` (relative, forward slashes, `.png`), `bytes`, `width`, `height`, `source`, `method` (a key of `methods`),
`looked`, and an optional `note`. One capture is in one row only.

The rows (captures: how many, how many looked at):

| id | dialogs | captures | sources | confidence |
|---|---|---|---|---|
| `boot.loading-logo` | (none) | 3 (2 looked) | pcsx2, recomp | seen |
| `boot.card-slot-select` | `dlgIntroScreen` | 2 (1 looked) | pcsx2 | seen-flow |
| `boot.card-searching` | `dlgIntroScreen` | 1 (1 looked) | recomp | seen-flow |
| `boot.card-no-data` | `dlgIntroScreen` | 2 (2 looked) | pcsx2, recomp | seen-flow |
| `boot.sony-card-typing` | `dlgIntroCinematic` | 2 (2 looked) | pcsx2 | seen |
| `boot.sony-card-fade` | `dlgIntroCinematic` | 2 (2 looked) | pcsx2 | seen |
| `boot.zipper-card` | `dlgIntroCinematic` | 4 (4 looked) | pcsx2, recomp | seen |
| `boot.intro2-opening` | `dlgSecondCinematic` | 5 (5 looked) | pcsx2, recomp | seen-flow |
| `menu.main` | `dlgMenu` | 12 (8 looked) | pcsx2, recomp | seen |
| `menu.main.options-lit` | `dlgMenu` | 1 (1 looked) | recomp | seen |
| `menu.attract-fade` | `dlgMenu` | 1 (1 looked) | recomp | seen |
| `menu.attract` | `dlgAttractCinematic` | 2 (2 looked) | recomp | seen-flow |
| `campaign.select-rank` | `dlgSelectRank` | 3 (3 looked) | pcsx2, recomp | seen |
| `campaign.controller-config-select` | `dlgControllerPresetsNewGame` | 2 (2 looked) | pcsx2, recomp | seen |
| `campaign.precision-config` | `dlgControllerPresetsRG` | 3 (3 looked) | pcsx2, recomp | seen |
| `card.save-prompt` | `dlgControllerPresetsRG` | 6 (5 looked) | pcsx2, recomp | seen |
| `card.save-slot-select` | `dlgControllerPresetsRG` | 4 (3 looked) | pcsx2, recomp | seen |
| `card.saving` | `dlgControllerPresetsRG` | 1 (1 looked) | pcsx2 | seen |
| `card.overwrite-warning` | `dlgControllerPresetsRG` | 1 (1 looked) | recomp | seen |
| `campaign.albania-aop` | `dlgAlbaniaCinematic` | 11 (11 looked) | pcsx2, recomp | seen-flow |
| `campaign.briefing-overview` | `dlg_Brief_Alb51` | 7 (7 looked) | pcsx2, recomp | seen-flow |
| `campaign.briefing-objectives` | `dlg_Brief_Alb51` | 1 (1 looked) | recomp | seen-flow |
| `campaign.briefing-maps-intel` | `dlg_Brief_Alb51` | 1 (1 looked) | recomp | seen-flow |
| `campaign.briefing-deploy` | `dlg_Brief_Alb51` | 1 (1 looked) | recomp | seen-flow |
| `options.menu` | `dlgOptions_Menu` | 2 (2 looked) | recomp | seen |
| `options.menu.hdd-row` | `dlgOptions_Menu` | 1 (1 looked) | recomp | seen |
| `options.menu.video-row` | `dlgOptions_Menu` | 1 (1 looked) | recomp | seen |
| `options.audio` | `dlgOptions_Audio` | 2 (2 looked) | recomp | seen |
| `options.audio.default-confirm` | `dlgOptions_Audio` | 1 (1 looked) | recomp | seen |
| `options.video` | `dlgOptions_Video` | 1 (1 looked) | recomp | seen |
| `options.controller-presets` | `dlgControllerPresets` | 2 (2 looked) | recomp | seen |
| `online.login.no-config-popup` | `dlgNetLogin` | 1 (1 looked) | pcsx2 | seen |
| `online.login.no-config` | `dlgNetLogin` | 2 (2 looked) | pcsx2, recomp | seen |
| `online.login` | `dlgNetLogin` | 2 (2 looked) | pcsx2, recomp | seen |
| `online.netgui` | (none) | 2 (2 looked) | pcsx2 | seen |
| `online.netgui-return` | (none) | 1 (1 looked) | pcsx2 | seen |
| `online.netgui-return.card-slot` | `dlgReturnFromNTGUI2` | 1 (1 looked) | pcsx2 | seen-flow |
| `online.locating-universes` | `dlgNetAuthenticate` | 1 (1 looked) | recomp | seen-flow |
| `online.select-universe` | `dlgNetServerSelect` | 2 (2 looked) | pcsx2, recomp | seen |
| `online.persona-form` | `dlgNetPlayerName` | 4 (3 looked) | pcsx2, recomp | seen |
| `online.persona-list` | `dlgNetPlayerName` | 1 (1 looked) | pcsx2 | seen |
| `online.name-keyboard` | `dlgNetPlayerName` | 3 (1 looked) | pcsx2, recomp | seen |
| `online.write-down-notice` | `dlgNetPlayerName` | 3 (2 looked) | pcsx2, recomp | seen |
| `online.persona-save-prompt` | `dlgNetPlayerName` | 1 (1 looked) | pcsx2 | seen |
| `online.persona-save-slot` | `dlgNetPlayerName` | 2 (2 looked) | pcsx2, recomp | seen |
| `online.user-agreement` | `dlgUsagePolicy` | 3 (2 looked) | pcsx2, recomp | seen |
| `online.server-news` | `dlgWorldOfSOCOM` | 3 (3 looked) | pcsx2, recomp | seen |
| `online.menu` | `dlgWorldOfSOCOM` | 2 (1 looked) | pcsx2, recomp | seen |
| `online.briefing-rooms-list` | `dlgWorldOfSOCOM` | 2 (2 looked) | pcsx2, recomp | seen |
| `online.logoff-prompt` | `dlgWorldOfSOCOM` | 2 (2 looked) | recomp | seen |
| `online.briefing-room` | `dlgMPBriefingRoom` | 5 (4 looked) | pcsx2, recomp | seen |
| `online.create-game` | `dlgCreateGame` | 4 (3 looked) | pcsx2, recomp | seen |
| `online.play-list` | `dlgCreateGame` | 3 (2 looked) | pcsx2, recomp | seen |
| `online.play-list.map-rows` | `dlgCreateGame` | 25 (1 looked) | recomp, pcsx2 | seen |
| `online.game-lobby.ready-notice` | `dlgGameLobby` | 1 (1 looked) | pcsx2 | seen |
| `online.game-lobby` | `dlgGameLobby` | 7 (3 looked) | pcsx2, recomp | seen |
| `online.loading` | `dlgLoad` | 2 (2 looked) | pcsx2 | seen |
| `match.round-complete` | `dlgMultiplayerRound` | 2 (2 looked) | pcsx2 | seen |

Card popups ("Searching MEMORY CARD slots...", the save prompt, the slot select, "Saving...", the overwrite warning)
are `POPUPDIALOG` commands inside a dialog's scripts, not dialogs (research 96 §3.4); their rows name the dialog that
raises them. The campaign rows are kept although the campaign is future scope (R1): the frames exist, and the boot to
briefing runs pass through them; no capture is owed for the campaign dialogs that have none (§3).

## 2. Method

### 2.1 The walk

The block's "Existing coverage" was the starting inventory, each directory listed and every PNG's byte count and IHDR
size read: `D:/socom_archive/parity/golden` (s00..s19, `final`); `logs/parity/runs/pcsx2_mission_a` (s00..s06, the
boot captures research 98 §1 matched); `logs/parity/s4_pcsx2` (A_00..A_60, A_b*, A_r0004_*, B_00..B_44 and the 1 Hz
`A_ready*`/`B_ready*`/`A_rend*`/`B_rend*` series, 867 files); `logs/parity/virgin_card` (s00..s24, the `wNN_*` waits);
`logs/parity/gate/x51_gate_iop/title` (s00..s22, w00_*); `logs/parity/runs/options_explore`, `presets_explore`;
`D:/socom_archive/parity/s10_audio_options`, `s8_save_yes`, `online/login` (the PCSX2 login run of PC
`tools_py/parity/online_login.py`, 2026-09-07; only its `07_card_slot.png` is a row); `logs/parity/s17_q2_logoff/online1`; `logs/parity/s11_chat_A`
(PC research 66 L10-14); `scripts/parity/refs/` (68 tracked files, of which **61 are PNGs**: the block's "68 tracked
crops" counts the JSON, WAV, script and text files too) and `scripts/parity/ref_*.png`. The `wNN_*` per-second wait
frames, the 1 Hz match series beyond the four cited frames, and the NETGUI screens A_09..A_28 are not rows: each is a
moment of a screen already in a row, or a screen of SCUSNGUI.ELF (not a dialog of the inventory). Eleven reference
PNGs are left out as not front-end screens: `console_spawn_slot8.png`, `mission_failure_banner.png`, and
`heldout/mission_s06..s24`, `heldout/transition_s06`, `transition_s08` (in a mission).

The values were written by a scratch script (in the session's scratchpad, not committed) that reads each file's size
and PNG header off the host; the dev-host test re-reads every one of them, so a script that wrote a wrong number would
fail there.

### 2.2 Looking, and the confidence

Every row's screen is what its frames show, not what their file names say: each frame of a row was opened and read
(the Read tool shows images) unless marked `looked: false`. Where the file name and the frame disagree, the frame won
(§4). A row is **seen** when the dialog is read off the frame -- its title or captions against the layout's message
ids (`dump-dialogs.ts --dialog`; e.g. `_181_PrecisionConfig_MSG` is `dlgControllerPresetsRG`'s title and
`_170_SureShotConfig_MSG` `dlgControllerPresetsCS`'s, so PRECISION SHOOTER CONFIGURATION is RG; `_587_ConnectToSocom_MSG`
is `dlgNetPlayerName`'s, so the persona form is not `dlgNetConnect`); **seen-flow** when the frame was read but the
dialog drawing it is inferred from research 96's graph (the boot's card popups under `dlgIntroScreen`; a movie
background; the briefing, whose twelve dialogs share their captions; the slot popup after the NetGUI reboot under
`dlgReturnFromNTGUI2`, §4);
**name-only** when no frame of the row was looked at (no row is).

Looked at: 130 of the 175 captures. The 45 mapped by name only: `s4_pcsx2/A_00_boot.png` (the same byte count as
golden s00), `A_01.png`, `A_55_readyfocus.png`, `B_44_joined.png`; `s17_q2_logoff/online1/02_persona.png`,
`07_write_down.png`, `08_eula.png`, `09_lobby_no_news.png`; `s11_chat_A/17_game_lobby_ok.png`;
`scripts/parity/ref_main_menu_ours.png` (the same byte count as `refs/main_menu.png`), `ref_save_prompt_ours.png`,
`ref_osk_normal.png`, `ref_osk_accent.png`; `refs/ref_save_slot_ours.png`; `refs/heldout/title_s03`, `title_s09`,
`title_s15`; `refs/lobby/title_briefing_room.png`, `title_create_game.png`, `title_game_lobby.png`,
`title_play_list.pcsx2.png`; and 24 of the 25 `refs/map_*.png` crops (`map_vigilance.png` was looked at). Four more
frames were looked at and left out: `virgin_card/s20_none.png` and `s4_pcsx2/A_60_select.png` (in a match),
`A_ready008.png` (black), `scripts/parity/ref_popup_prompt_ours.png` (a mission's HELP pop-up).

### 2.3 PCSX2 or the recomp

The PC project's runs do not all record their target. The rule used, and its evidence: `tools_py/parity/drive.py`
takes `--target pcsx2|ours`; every run on this host named for PCSX2 (`golden`, per `docs/parity/REPORT.md` "Golden:
PCSX2 2.8.1"; `runs/pcsx2_*`, `mb10_pcsx2`, `transition_pcsx2`; `s4_pcsx2`, PC research 18 §1) has 640x480 frames,
and the recomp's runs that say so (`mb10_ours`, `s8_save_yes` by its script `logs/s8_save_yes.sh --target ours`, the
title gate) have 640x448 frames. One PCSX2 frame is 640x448: `scripts/parity/ref_main_menu_ours.pcsx2.png`, and it
shows W7.R7's narrower picture with bars at the sides; the 640x448 frames of `options_explore`, `presets_explore`,
`s10_audio_options` and `virgin_card` fill the width with no bars, so they are the recomp's. **Those four runs' target
is inferred, not recorded** (their methods say so). A `.pcsx2.png` reference is the console's by the harness's own
rule (`drive.py` `ref_for_target`, L310-321); the other references are the recomp's (`refs/main_menu.png` carries the
recomp's "Runtime Debug" overlay).

For W7.R7: the PCSX2 full frames are 640x480 (65 of 66) -- the picture stretched to fill, no bars (research 98 §2.2) --
and one is 640x448 with bars; the harness reads each capture's size from this manifest. For W7.R8: the dark frames are
noted in the rows' cites (`boot.sony-card-fade`, `boot.intro2-opening`, `campaign.albania-aop`).

### 2.4 The checks

`tools/test/goldenManifest.test.ts`. CI: the manifest parses at schema 1; it passes `validateManifest` against the
pin's 103 dialogs; every dialog is in exactly one of a row and the no-frame list, and a no-frame dialog names one of
BOOT-01, OPT-19, ONL-32, PLAT-36 or an `outOfScope` reason, and a `method` of `owedMethods` (all but the dangling
name; every state too); ids are unique; every capture has a relative `.png` path and
a defined method; no absolute user path appears anywhere; a row with no looked frame is `name-only`; every row id and
its capture count are pinned (58 rows, 175 captures, eleven states -- twelve since 2026-10-02, BOOT-02's `state.boot-loader-panel` -- the no-frame list's count per owing task), so a
row or a capture lost from the file fails; the two slot popups of §4 are pinned to their dialogs; planted manifests
fail each rule. Dev host (skips unless `SOCOM_PC_ROOT` or `SOCOM_PARITY_ARCHIVE` names an existing directory; each
root's rows skip when its variable is unset): every capture exists with the recorded byte count and PNG width and
height. Run from `redotcom`:

```sh
npx vitest run tools/test/goldenManifest.test.ts
SOCOM_PC_ROOT=C:/Projects/socom_pc SOCOM_PARITY_ARCHIVE=D:/socom_archive/parity npx vitest run tools/test/goldenManifest.test.ts
```

## 3. The screens without a frame

77 of the inventory's dialogs have no capture, and `dlgStickSetup` (dangling, research 96 R96.7) is listed with them.
Each names the task that owes it, whether PCSX2 can reach it offline, and **how it is to be captured** (`method`, a key
of `owedMethods`: the sprint 9 plan's owner default 4, L347-348, and its gate's PLAT-31 row, L310). **Online screens
need our server**: a PCSX2 or recomp run against our local Horizon stack (R293); no other server is ever suggested.

The owed methods, each from its owing task's block: `pcsx2-boot-timed` (BOOT-01's acceptance: PCSX2, no presses,
2 Hz or more, per card state); `recomp-relaunch` (BOOT-10: the relaunch path with its start dialog);
`recomp-driven-offline` (OPT-19's gap: `drive.py --target ours` step scripts in the style of `*_explore.txt`);
`pcsx2-driven-offline` (OPT-19: PCSX2 only where the recomp cannot present the state, the unformatted card);
`recomp-local-stack-walk` (ONL-32's gap: our recomp on our local stack, a frame, the Medius pair and the DB diff per
step); `recomp-lan-pair` (two instances, the s4 A/B way, into LAN); `call-trace` (PLAT-36's CALL_TRACE run over the flow
that would enter the dialog).

| owed by | PCSX2 offline | method | n | dialogs |
|---|---|---|---|---|
| ONL-32 | no (our server) | `recomp-local-stack-walk` | 20 | `dlgNetConnect`, `dlgDownloadPatch`, `dlgOnlineFilters`, `dlgFriendList`, `dlgIgnoreList`, `dlgLadderLobby`, `dlgClanLadderLobby`, `dlgCreateClan`, `dlgManageRoster`, `dlgManageRosterLeader`, `dlgInvitedPlayers`, `dlgRespondToInvites`, `dlgNetAbort`, `dlg_equipment_mp`, `dlgExitState`, `dlgNetError`, `dlgNetAbandoned`, `dlgNetBanned`, `dlgMultiplayerFinal`, `dlgMultiplayerFinalReally` |
| ONL-32 | no (our server) | `recomp-relaunch` | 1 | `dlgAfterErrorReboot` |
| ONL-32 | unknown | `recomp-lan-pair` | 1 | `dlgReturnFromNTGUI2LAN` |
| OPT-19 | yes | `recomp-driven-offline` | 9 | `dlgNetUnlockableExtras`, `dlg_WeapUnlock`, `dlg_CharUnlock`, `dlgArtGal2`, `dlgMakeMusicMovie`, `dlgPlayTutMovies`, `dlgCredits`, `dlgControllerSelection`, `dlgScreenAdjust` |
| OPT-19 | no (our server) | `recomp-local-stack-walk` | 3 | `dlgOnlineOptions`, `dlgSetSOP`, `dlgSetTaunts` (OPT-19 names ONLINE OPTIONS, SETUP MESSAGING, SETUP TAUNTS; they open from the online menu) |
| OPT-19 | unknown | `recomp-lan-pair` | 4 | `dlgLANPlayerName`, `dlgLANConnect`, `dlgLANBriefingRoom`, `dlgLAN_Options` (LAN with no peer) |
| BOOT-01 | unknown | `recomp-relaunch` | 1 | `dlgAfterReboot` (BOOT-10's popup; BOOT-10's proven level names BOOT-01's recomp capture) |
| PLAT-36 | unknown | `call-trace` | 3 | `dlgDebriefing`, `dlgGameComplete` (reached only from code-named dialogs, R96 §3.4), `dlgHype` (named by no dialog, R96.8) |
| PLAT-36 | yes | `call-trace` | 1 | `dlgMPswitch`: it draws nothing (0 objects, no card set; its ONSTART leaves for `dlgNetLogin`: §4), so no frame can show it; its passage between MULTIPLAYER and `dlgNetLogin` is a trace's, PLAT-36's by the plan's owner default 4 (changed in review from "owed by none") |
| none: R1 | yes | `recomp-driven-offline` | 34 | the campaign dialogs with no frame: `dlgControllerPresetsCS`, `dlgMISSIONSELECTION`, `dlgCareerStats`, `dlg_equipment_main`, the other three AOP cinematics, the four `dlg_areaop_*`, eleven `dlg_Brief_*`, the twelve `dlg_Map*`. R1 (MISSION, the owner's ruling of 2026-10-01) and OPT-19's block ("the screens of MENU-10..MENU-16 are future scope and need no capture") are the ruling that no task owes them; the method is named so that an overturn of R1 changes `owedBy` alone |
| none: dangling | never | (none) | 1 | `dlgStickSetup`: on no disc archive, so nothing draws it and no method applies |

`statesWithoutFrame` lists eleven popups and states that are not dialogs [twelve since 2026-10-02: BOOT-02 added the
loader's PULOADGP panel, `state.boot-loader-panel`, owed by BOOT-01 with `pcsx2-boot-timed` (research 130 §4)]: boot
with no card, with an unformatted card,
on an existing save (timed), the controller-connected and DTV popups (BOOT-01; OPT-19 for the unformatted card's
format flow); the card faults, the OPTIONS triangle popup / RETURN / HDD / 480p popups, CONTROLLER PRESETS pages 3-4
(OPT-19); the DNAS screen's other stages, the chat keyboard and the online menu walk (ONL-32). Their methods: the four
BOOT-01 states `pcsx2-boot-timed`; the unformatted card `pcsx2-driven-offline`; OPT-19's other three
`recomp-driven-offline`; ONL-32's three `recomp-local-stack-walk`.

## 4. Where the file names, the docs and the frames disagree

- **`logs/parity/s17_q2_logoff/online1/01_universe.png` is not SELECT UNIVERSE.** It shows LOCATING UNIVERSES ("LOCATING
  AVAILABLE SOCOM II UNIVERSES" and a progress bar) -- `dlgNetAuthenticate`'s stage (N7: `_536`/`_537` are its set's),
  before `dlgNetServerSelect`. Mapped by the frame.
- **`docs/parity/REPORT.md` labels golden s06 "warning / intro screen".** The frame is INTRO_2's dark opening flyover,
  no warning -- as research 98 §4.1 found for the PCSX2 boots.
- **The persona form is `dlgNetPlayerName`, not `dlgNetConnect`** (roadmap N4 calls A_35 "CONNECT TO SOCOM II", the
  title `_587_ConnectToSocom_MSG` that `dlgNetPlayerName`'s layout names; `dlgNetConnect` names only the "connecting"
  ids 448 and 542). No frame of `dlgNetConnect` was found. *(Corrected 2026-10-05, ONL-07, research 157 §8: six
  recomp frames of it were found by comparing a drawn frame with every menu capture of the archive -- the harness's
  shot "after CONNECT" on runs with no write-down notice; the manifest's row `online.connecting`. No PCSX2 frame.)*
- **The golden run and `pcsx2_mission_a` are one step apart at boot**: golden's s02 is the "No SOCOM data" notice and
  s03 the typing Sony card, where `pcsx2_mission_a`'s s02 is already the Sony card (roadmap B12); two cards in one
  and one in the other, not a contradiction.
- **Golden s13 carries PCSX2's own notice** ("Memory Card 'Mcd001.ps2' was saved to storage.") over the top left, and
  `s4_pcsx2/A_07_editnet.png` its patches notice: a scorer must mask them.
- **The owner's ARMORY captures** (`orig-armory-select.png`, `orig-armory-weapon.png`, web research 95 §2.8) are under
  neither root on this host (searched under the PC project, the SOCOM Legacy trees, the archive and the user's Desktop,
  Downloads and Pictures). `dlg_equipment_mp` is in the no-frame list until they are placed under a root; the schema's
  `owner-photo` source is ready for them.
- **The online "Select MEMORY CARD slot:" frame `s4_pcsx2/A_30.png` is `dlgReturnFromNTGUI2`'s, not `dlgMPswitch`'s**
  (corrected in review; roadmap 05 N4 and ONL-01 read it as ONLINE from the main menu). `npx tsx tools/dump-dialogs.ts
  --dialog dlgMPswitch.rdr`: 0 objects, scripts `dlgMPswitch` and `uianim` only (no `UIMemCardAnim`), ONSTART
  `StopStreaming` = VagStreaming(OFF), SWITCHMENU(dlgNetLogin): it cannot raise a card popup. `--dialog
  dlgReturnFromNTGUI2.rdr`: 0 objects, an empty background file, its scripts include `UIMemCardAnim`, and ONSTART
  `do_onstart` holds HardDriveOperation(OPEN), HardDriveOperation(GET_MISSION_DATA), SWITCHMENU(dlgNetLogin) and calls
  `intro_onstart` (`dlgIntroScreen`'s card check) and `DisplayHDDError`. The dump lists a handler's ops, then its calls:
  it does **not** show whether `intro_onstart` runs before or after the switch (corrected in review: an earlier
  version said "before"). `dlgMenu` calls `intro_onstart` too (its ONSTART `has_memcard_changed`, of `UIMemCardAnim`),
  so the call alone does not pick the dialog; the background does: A_30's popup is over black, which
  `dlgReturnFromNTGUI2`'s empty background file leaves, where `dlgMenu` draws over the MENULOOP movie
  (`menuloop.pss`) and `dlgNetLogin` over `multplay_back.tif`. The s4 file times agree: A_30 is 26 s after
  `A_29_backtogame` (the reboot back from SCUSNGUI.ELF) and 29 s before A_31 (LOGIN), and A_04 (the main menu) to
  A_05 (ONLINE: LOGIN with the no-config popup) has no slot popup between. The popup has no "Abort", as the boot's
  (`boot.card-slot-select`) has none. Row `online.netgui-return.card-slot`; `dlgMPswitch` is in the no-frame list.
- **The harness crop `scripts/parity/refs/card_slot.png` is the persona-save slot prompt**, not an online-entry popup:
  PC `tools_py/parity/online_login_ours.py` `login_prompts` (L1864-1891) answers `write_down`, `save_card`, then
  `card_slot` between CONNECT and the EULA, and `online_login.py` L124-128 shoots `07_card_slot` after `07_save_card`.
  The archived PCSX2 frame `online/login/07_card_slot.png` shows it over CONNECT TO SOCOM II with "(triangle) Abort."
  (`dlgNetPlayerName`). Row `online.persona-save-slot`.
- **PC research 66's chat rounds** (`logs/parity/s13_o2_chat_*`) are not on this host; only `s11_chat_A` is.

## 5. What is not known, and what would settle it

- **The target of four runs** (`options_explore`, `presets_explore`, `s10_audio_options`, `virgin_card`): inferred
  from the 4:3 bars (§2.3), not recorded. Their drive logs, if kept, or a re-run, would say.
- **Which dialog raises the boot card popups and the slot popup after the NetGUI reboot**: `dlgIntroScreen` and
  `dlgReturnFromNTGUI2` by the flow and the dump (`tools/dump-dialogs.ts --dialog`: both carry `UIMemCardAnim` and run
  `intro_onstart`; `dlgMPswitch` carries neither, §4; the black behind A_30's popup, §4); a trace of the active dialog
  at the popup (PLAT-36) would raise the rows from `seen-flow` to `seen`, and say whether `do_onstart`'s card check
  runs before its SWITCHMENU(dlgNetLogin), which the dump does not show.
- **Roadmap 05's N4 and ONL-01 still read `A_30` as ONLINE from the main menu** (`../roadmap/05-online-front-end.md`
  L26 N4's "ONLINE -> 'Select MEMORY CARD slot' (`A_30`)", L51 ONL-01's goal, L62 its Unknowns): §4, the s4 file
  times (A_04 12:25:41 -> A_05 12:26:16, straight to LOGIN; A_29 12:32:55 -> A_30 12:33:21 -> A_31 12:33:50) and the
  dump (`dlgMPswitch`: 0 objects, no `UIMemCardAnim`) contradict them. The correction is ONL-01's and ONL-02's blocks'
  (the sprint 9 plan's W9.R4: a stream edits only its own block's lines), owed for the controller to carry: ONL-01's
  slot popup is the NetGUI return's (`online.netgui-return.card-slot`), not the online entry's.
- **Which briefing**: `dlg_Brief_Alb51` by the flow (the first Albania mission after ALB_AOP); the twelve briefings'
  layouts share their captions.
- **`dlgSetSOP` as SETUP MESSAGING**: OPT-19's name, not read off a layout.
- **PCSX2's offline reach** for the `unknown` entries of §3 (LAN with no peer, the relaunch popups, the code-named
  dialogs): the block's own Unknown, answered only by the capture windows.
- **PLAT-01's citation**: the matrix cites the manifest's rows by id per the block's acceptance; this task changed only
  the matrix's PLAT-31 row (status partial, its test). Adding the row ids to the matrix's other rows is owed to PLAT-01.

## 6. Placeholders and readings

None. This note and `tools/goldenManifest.ts` name no stand-in value; the manifest's `seen-flow` rows are its readings,
marked row by row.
