# 07 -- The match (`MATCH-`)

The mission's item 6 ([`../MISSION.md`](../MISSION.md), "Scope, from boot to online"): the round itself -- the SEAL, the
weapons, the HUD, the sound, the effects -- is the work of web sprints 1 to 5 and their plans, and stays with them. This
segment owns only what nothing else owns between the loading screen (ONL-18) and the round and final screens (ONL-20):
the match's own START menu, its ABORT path, one ledger of the round's open 1:1 gaps so that none of them is left without
an owner, and the first-person view the owner restored on 2026-10-01 (MATCH-04). The campaign's pause-menu rows (REPLAY
MISSION, HELP) stay in the README's future scope.

Conventions: [README](README.md#conventions). `D:Lnnn` is a line of the r0001 decompilation; `S:0xADDR` a string of
`socom2_game.elf.strings.txt`.

## Facts this segment rests on

| # | Fact | Source |
|---|---|---|
| T1 | The in-round menu's strings: `SPECTATOR HUD: ON/OFF` (S:0x3e3b20/0x3e3b40), `VOICE MODULATION: ON/OFF` (0x3e3b60/0x3e3b80), `FIREMODE/SCOREBOARD: ALTERNATE/DEFAULT` (0x3e3ba0/0x3e3bc0), `FIREMODE/TACMAP: ALTERNATE/DEFAULT` (0x3e3be0/0x3e3c00), `RUN AND TALK: ON/OFF` (0x3e3c20/0x3e3c40), `VIBRATION: ON` / `VIBRATION OFF` (0x3e3c58/0x3e3c68), `IN-GAME TEXT MESSAGES : ON/OFF` (0x3e3c80/0x3e3ca0), ` ACCEPT` / ` BACK` (0x3e3cc1/0x3e3cd1), "Are you sure you want" / "to abort the game?" / "to replay the mission?" (0x3e3ce0/0x3e3d00/0x3e3d20); `CZPauseTest` (0x3e3ad8) just before them | `game/analysis/socom2_game.elf.strings.txt` L705-723 |
| T2 | The menu's action handler `FUN_002041e0` (D:L61644-61921) switches on the selected row's type byte (+0x9c): 1 and 2 open a confirm -- ~~(+0xbe0 = 1 or 2: abort or replay, a reading of which is which)~~ type 1 REPLAY MISSION (+0xbe0 = 1), type 2 ABORT (+0xbe0 = 2) (D:L61679-61698; web research 266 §8.2-§8.3, §8.10.1; research 114 §1.5, corrected 2026-10-13); 3 inverts pitch (`DAT_003df198`); 4 toggles VOICE MODULATION (`DAT_003df1a8`, the `VoiceMask` valve at 0x3e3db8, then `FUN_0030e5a0`) (L61722-61746); 5 RUN AND TALK (`DAT_0044d4f8`) (L61748); 8 vibration (`FUN_00592be0`) (L61794); 9 the fire-mode swap (`DAT_0044d500`), labelled FIREMODE/TACMAP when `DAT_0045a0c1 == 0` and FIREMODE/SCOREBOARD otherwise (L61823-61846); 10 SPECTATOR HUD (`DAT_003dc3e0`) (L61847); then IN-GAME TEXT MESSAGES (L61864) | decomp |
| T3 | `DAT_0045a0c1` is the game's multiplayer flag | PC research 18 L449 |
| T4 | The menu's open `FUN_00204a40` (D:L61922-62145) runs the pause calls `FUN_00346740` and `FUN_00341a60(0,0)` only when `DAT_0045a0c1 == 0` (L61948-61951), i.e. offline; it labels the rows at L62029-62109 with the same multiplayer test for the fire-mode row (L62075) | decomp |
| T5 | The confirm's texts are set by `FUN_00202370` (D:L61068-61113): ` ACCEPT`, ` BACK`, "Are you sure you want", "to abort the game?", "to replay the mission?" | decomp |
| T6 | The in-game command menu (RADIO, TEAMMATES, MESSAGES, TAUNTS) is a different menu, the TCM, "not the pause menu or the game lobby" | web R91 §17.3 L643 (`FUN_00232bc0` L83575-83644) |
| T7 | A mission run's pause menu (offline): RESUME / REPLAY MISSION / ABORT / INVERT PITCH / HELP / AIM ASSIST / VIBRATION / FIREMODE-TACMAP | PC research 78 §1 L46, run `ingame1` |
| T8 | SOCOM 1's pause menu in reCOM: RESUME, ABORT, REPLAY placed as text selections (structure only, not a SOCOM II fact) | `research/recom/src/Apps/FTS/hud/hud_pausemenu.cpp` L22, L27, L42 |

T2-T4 say the START menu is built for multiplayer too -- the multiplayer branches of T2 and T4, and rows absent from the
offline list T7 (VOICE MODULATION, RUN AND TALK, SPECTATOR HUD, IN-GAME TEXT MESSAGES) -- and that it does not pause the
game when the multiplayer flag is set. ~~Which rows an online round shows, and in what order, is not read: no capture of
it exists.~~ *[2026-10-13, MATCH-01; web research 266 §8.2-§8.3, reading, reviewed]* read: the menu is code-drawn (no
`.rdr`), its twelve-entry row table built by `FUN_00202520` (D:L61191-61335) and the seat's rows chosen by
`FUN_00205a70` (D:L62407-62452): online, a player RESUME, ABORT, INVERT PITCH, VOICE MODULATION, RUN AND TALK,
VIBRATION, FIREMODE/SCOREBOARD, IN-GAME TEXT MESSAGES; a spectator without the two voice rows and with SPECTATOR HUD;
a LAN game without IN-GAME TEXT MESSAGES. No capture of it exists (the proven level is ONL-32's).

## Tasks

### MATCH-01 -- The in-round START menu online
- **Goal:** START during an online round opens the original's menu with its online rows, toggles each as the original
  does, and does not pause the round.
- **What the original does:** T1-T5; the offline variant is T7. The VOICE MODULATION row writes the same `VoiceMask`
  valve OPT-15/SVC-22 name (V17 of segment 06).
- **Today:** ~~none in SOCOM Legacy; the viewer's own pause and settings UI (`viewer/src/ui.ts`) is not the game's.~~
  *[2026-10-13, built in web sprint 18 on the owner's word, merged at 504ae730d; web research 266 §8]*
  `viewer/src/startMenu.ts`: the row table and the seat's rows as read, each row's effect from `FUN_002041e0`'s cases,
  no pause online, the navigation, the sounds and the draw, mounted in both matches (OT.R43); its title and the confirm
  alone by MATCH-02b (f2018b128, 266 §8.11).
- **Gap:** ~~the menu (layout, rows, focus, the toggles' effects), wired to the HUD, the input layer and the valves.~~
  built (above); left: the proven level (ONL-32) and VIBRATION's row with OPT-13 (MENU-OC-9).
- **Acceptance:** reading level: unit tests (CI) of each toggle's effect transcribed from `FUN_002041e0`'s cases
  (L61644-61921), including the multiplayer label rule of row 9, and of "no pause when multiplayer" from `FUN_00204a40`.
  Proven level: a recomp online round on the local stack with START pressed, each row captured as the cursor walks it
  (ONL-32's window), compared with SOCOM Legacy frame by frame (PLAT-30), and each toggle's valve after the press equal.
- **Proven by:** ONL-32.
- **Dependencies:** PLAT-07, PLAT-11, PLAT-15, PLAT-16, OPT-15. **Size:** M.
- **Unknowns:** ~~**which rows appear online and in what order** (the row table at +0x9c is built elsewhere; T7 is the
  offline list) -- a read of the row-table builder plus ONL-32's capture; whether the menu is a dialog (`.rdr`) or
  code-drawn (the strings are code literals, not UIMnLOC ids, which points at code) -- the builder read;~~ *[2026-10-13]*
  read (266 §8.1-§8.3: code-drawn; the rows and their order above); left: what `FUN_0030e5a0` does with the
  modulation flag (SVC-22's unknown), and the frames (ONL-32's capture).
- **Owner calls:** VIBRATION follows OPT-13's call (MENU-OC-9).
- **Merged from:** the 2026-10-01 revision (the README had filed the whole pause menu under the campaign).

### MATCH-02 -- ABORT from an online round: the confirm and the way back
- **Goal:** ABORT in the online START menu confirms with the original's texts and lands where the original lands.
- **What the original does:** T2 (~~row type 1 opens the confirm~~ row type 2, ABORT, opens the confirm with +0xbe0 = 2;
  corrected 2026-10-13, web research 266 §8.2, §8.10.1), T5 (its texts). A kicked player's path is known (web
  R91 L612: UIMnLOC 539-541, "RETURNING TO SOCOM II ONLINE...", back to the lobby after 4 s); ~~ABORT's own destination
  online is not read~~ ABORT's own destination online is read (266 §8.10.2): SOCOM II ONLINE through `dlgNetAbort.rdr`.
- **Today:** ~~a `kicked`/`abandoned` protocol (`net/protocol.ts`) and no abort path.~~ *[2026-10-13, built in web sprint
  18 on the owner's word, merged at 77c4c2c88; web research 266 §8.10]* ABORT's confirm in `startMenu.ts` (the texts,
  the default NO, LEFT / RIGHT, BACK and NO back to the menu, START closing it) and the way back in
  `viewer/src/matchAbort.ts`: 3 s more of the round, then `dlgNetAbort.rdr`'s "ABORTING MISSION." / "RETURNING TO
  SOCOM II ONLINE" for 3 s, then SOCOM II ONLINE; the leave is the existing `GAME_LEAVE_ADAPTATION` (no new protocol
  message: the original sends none but the session's end). The confirm drawn instead of the menu by MATCH-02b
  (f2018b128, 266 §8.11.2).
- **Gap:** ~~the confirm (PLAT-16), the leave message to the room (SVC-07), the return through PLAT-10.~~ built
  (above); left: the proven level (ONL-32).
- **Acceptance:** the confirm's frame and default button against ONL-32's capture; the screen sequence after ACCEPT
  against the same run; BACK returns to the menu with the round unchanged (a trace).
- **Proven by:** ONL-32.
- **Dependencies:** MATCH-01, PLAT-10, PLAT-16, ONL-22, SVC-07. **Size:** S.
- **Unknowns:** ~~where ABORT lands online (the game lobby, the briefing room or SOCOM II ONLINE) and whether the other
  players see an abandon (`dlgNetAbandoned`, ONL-22) -- ONL-32's run and a read of the confirm's ACCEPT handler.~~
  *[2026-10-13]* where ABORT lands is read (266 §8.10.2): SOCOM II ONLINE (on a LAN, the LAN briefing room). Still
  open (266 §8.10.5): what the others' screens show after the leave (`MATCH_ABORT_OTHERS_READING`: the refresh only or
  `dlgNetAbandoned.rdr` by the game object's +0xcc, whose meaning is unread and read two ways), and the 3 s wait's
  mapping onto the round's valves (`MATCH_ABORT_WAIT_READING`); ONL-32's two-console capture settles both.
- **Owner calls:** none.
- **Merged from:** the 2026-10-01 revision.

### MATCH-03 -- The round's open 1:1 gaps: one ledger, each with an owner
- **Goal:** every known deviation of today's round from the original is listed once with its source, its validation and
  the task or sprint plan that owns it.
- **What the original does:** n/a (a ledger of gaps against it).
- **Today:** *(corrected 2026-10-01, web sprint 6; until then this line said the gaps were spread over the README's
  "Known gaps", research 90's open rows, research 72-95's placeholders and MISSION.md's rulings, with no one list.)*
  **The ledger is [web research 101](../research/101-the-rounds-open-gaps.md)**: 250 open rows -- 198 named
  placeholders and readings (a row each, by owner), 42 unnamed gaps, 10 rulings -- and 48 names excluded with the
  reason, each with its source line, its validation and its owner. First person (MATCH-04) and the binoculars are
  ruled and built, not gaps; **tap C crouch / hold C prone** is recorded as a deliberate deviation with its ruling (R5);
  **the Explore camera** is recorded as the owner's open call, not ruled. ONL-19, ONL-20, ONL-21, ONL-22, MATCH-01 and
  MATCH-02 are cited as the owners of their parts. Its finding: 122 rows (94 named readings, 28 unnamed gaps of the
  round itself) have no task in the roadmap -- recorded as the owner's call **OC-M3**, not ruled.
  `tools/test/roundLedger.test.ts` (CI) holds it to the sources: every `*_PLACEHOLDER` / `*_READING` of the viewer,
  server, scene and sound sources is a row of research 101 (the ledger or its exclusions).
- **Gap:** the ledger -- written (web research 101, 2026-10-01); what stays is placing OC-M3's rows (the owner's) and
  keeping the ledger current as rows close.
- **Acceptance:** a table (in this file or the next web research note) where every item of the sources above appears
  once with: its source line, its validation (a capture or test id from PLAT-31, or "owed"), and its owner (a sprint
  plan task, an ONL/SVC/MATCH task, or an owner call); a review against the sources finds no item missing.
- **Dependencies:** none. **Size:** S.
- **Unknowns:** none.
- **Owner calls:** the PC-over-console rulings (MISSION.md): first person and C tap/hold are ruled (R5, 2026-10-01),
  and the binoculars view (state 4) is ruled back as the original (2026-10-01); the Explore camera is still the owner's.
- **Merged from:** the 2026-10-01 revision (the mission's item 6 had no segment).

### MATCH-04 -- First person restored: the view state 1, reached by zooming in from third person
- **Goal:** the game's first-person view back in the round, entered and left as the original enters and leaves it
  (the owner, 2026-10-01, R5, overturning the 2026-09-29 "no first person" ruling), with tap C crouch / hold C prone
  unchanged.
- **What the original does:** the view state is the body's byte `+0x200`; `FUN_005448a0` (D:L410929) sets it and the
  magnification `+0x204` from the jump table at 0x65c3b0: 0 third person 1.0, **1 and 2 first person 1.01**, 3 night
  vision 1.01, 4 the binoculars 9.0, 5-12 the weapon's `ZoomMode[state - 4]` (web research 84 §7, L179-190). **Zoom in**
  (d-pad Up; `FUN_005445b0`, D:L410716, table 0x65c360): **0 -> 1** (2 in a turret); from 1, a vehicle, a raised rocket
  launcher or a launcher-round mode stays, a night map -> 3, two or more zoom modes -> 5, else -> 4 (hand-decoded at
  0x544780-0x54480c, Ghidra's case 1 being mangled; research 84 §7). **Zoom out** (d-pad Down; `FUN_00544400`,
  D:L410623, table 0x65c320): 1, 2 -> 0; 3, 4 -> 1; 5 -> 1 (3 at night); s > 5 -> s - 1. **What else sets it:** a
  second round of a pull while scoped -> 1 (`FUN_005c5340`, D:L479398-479406); a weapon switch drops only the night
  vision to 1 (`FUN_005c4b10` D:L478813-478833); an attached launcher selected -> 1 (`FUN_00216770` D:L70389); death ->
  0 (`FUN_00547af0`). The look is unchanged in first person (`FUN_005be660` returns 1 unless `state - 4` indexes the
  zoom table; web research 83 §4 L118-122). The first-person bob (`BOBBING_FIRSTPERSON`, `DAT_003df190`) acts only in
  states 1-3: 6 x cos(phase) PS2 px at 15 rad/s walking, 4 at 8 prone (web research 83 §6, L164-176).
- **Today:** *(corrected 2026-10-01, web sprint 6's audit; until then this line said that `zoom.ts` (204 lines) ported
  the three functions without state 1 and that the README's controls table said "There is no first person" -- true
  when the block was written, false after the same day's 601700c2, 06bdbd75 and 91fa310a..7457eb73.)* First person
  (state 1) and the binoculars (state 4) are built: `packages/viewer/src/zoom.ts` ports the three functions with every
  state the page enters, the README's right-button and d-pad rows describe them, and the bob runs in states 1-3
  (`look.ts` `ViewBob`, `zoom.ts` `eyeBob`). The audit (W6.R3) wrote the transition table row by row -- web research
  84 §7.1, 64 rows: 29 held by a test, 9 pinned now, 6 fixed (state 2 stays on a zoom in; the magnification `+0x204`
  is the last set's and is not written past the record's count; the run is in or out by the state; **death drops the
  view to third person**, and **a spawn -- a living body's at a round start too -- re-inits it**, which the page had not
  done), 4 the page's readings (no ruling), 1 an open owner call, 9 out of the page's reach, 1 in `main.ts` only, 5 owed -- with its tests in `viewer/test/zoomTable.test.ts`. The C stance (tap / hold 0.4 s,
  `STANCE_HOLD_S_PLACEHOLDER`) is the README's `C` row and `stanceButton.ts`; it stays as it is (R5), its five tests
  unchanged and green.
- **Gap:** state 1 in `zoom.ts` (0 -> 1 on zoom in for every weapon; 1 -> 5 for a scoped weapon, 1 -> 3 at night; the
  drops to 1 restored where the original drops to 1); the camera at the eyes with the body hidden at 1.01 (the scope's
  view already draws from the eyes); the bob behind OPT-11's HEAD BOB valve (default from `PersistentValves`, O15); the
  README's controls rows and `zoom.ts`'s header rewritten to cite R5. **Done 2026-10-01 beside R5:** the binoculars
  (the owner's yes): an unscoped weapon and an item go on from first person to 4 (9x), drawn as `ChangeReticule` type 7
  (`ret_binocs` + `ret_binocs2`, no reticle), "ZOOM: 9.0x", the look / 1.5 x 0.2, nothing fired, thrown or reloaded
  (`FUN_005be9a0`, `FUN_005c2a90`), the body's `*2binocular` clip seen by the others (`Button.Binoculars`,
  `BodyFlag.Binoculars`, additive); web research 84 §7, §9.
- **Acceptance:** reading level (CI): `zoom.ts`'s tests rewritten as the transition table of `FUN_005445b0` /
  `FUN_00544400` / `FUN_005448a0` above, row by row with the cited lines (state 1 entered from 0 for every weapon class,
  the scoped and night arms, the drops), the binoculars arm asserted as 1 -> 4 (the owner's yes, 2026-10-01; 3 and 4
  stay without a scope, 0x544810); the bob's amplitude
  and rate as unit tests from research 83 §6; tap/hold C's existing tests unchanged and green. Proven level: a recomp
  frame in first person (d-pad Up once from third person on an M4A1) against the browser's same pose, scored by
  PLAT-30, and a `PS2X_PEEK` of `body+0x200` reading 1 (PLAT-36).
- **Proven by:** PLAT-36 (the first-person frame and the `+0x200` PEEK).
- **Dependencies:** none (the round's code exists; it touches no front-end task). **Size:** M.
- **Unknowns:** where the first-person camera sits on the body -- **partly read (2026-10-01, research 84 §7.1)**:
  `FUN_0029b2f0` places no eye (the projection only); the run switches the camera to its preset 2 as it leaves 1.0
  (`FUN_001f1610` D:L53283, D:L53297), and the eye is `FUN_0029ae50` (D:L142565-142624): the camera's node (the body's
  `+0x2e8` node or a named one) plus (0, 4.4, −2.5) standing and crouched, a stance-dependent offset prone, plus the
  peek. Which node `+0x2e8` is (so the eye's height) stays for PLAT-36's recomp frame; the page keeps
  `HEAD_HEIGHT_READING`. What a grenade does to a scope (research 84 §7: not traced; the viewer drops to first person,
  a reading). The bob's one-axis sign (§7.1 B5) and what the `zoom_control` handle is (S13).
- **Owner calls:** **ruled** (R5, 2026-10-01): first person back; tap C crouch / hold C prone kept; the binoculars
  (state 4) back as the original (2026-10-01).
- **Merged from:** new on 2026-10-01 (R5; the ruling had no task).

## Proposed (OT.R23, web research 170): the round's voice UI, not in the graph until the controller places it

Written 2026-10-05 by OT-14 (the online-path plan's OT.R23); **promoted 2026-10-07 into sprint 20**, after
SVC-20c. Research 170 §7.2 originally proposed sprint 17, but that sprint closed before the placement was carried into
SPRINTS.md; the closed sprint is not rewritten.

### MATCH-05 -- The round's voice: the HUD's voice element, the speaker's name tag, the radio and mute rows
*([2026-10-08, web sprint 20] built on `agent/online` -- MATCH-05: `hudVoice.ts`, the element in `hud.ts`, the compass mark of type 9, the RADIO and TEAMMATES > MUTE rows (research 227 §2), merged cac3b8cca; a name-tag drawer and a spectator's RADIO-only menu owed (the plan's Log); the plan `../plans/2026-10-08-web-sprint-20-voice.md`, its Log.)*
- **Goal:** in an online round, the player sees which channel he is on, whether he is talking, and who is -- as the
  original draws it -- and sets the radio and mutes a teammate from the command menu.
- **What the original does:** web research 170 §4.2, §5.2, §5.3: the HUD's voice element (`FUN_00238f50`
  D:L85768-85835, `FUN_00238ac0` D:L85664-85722): the channel icon by base channel (`action_tune_team.tif`,
  `action_tune_defense.tif` for 1, `action_tune_offense.tif` for 2, `action_dead_zone.tif`,
  `action_tune_spectators.tif`, `action_no_talk2.tif` with the radio off; `FUN_002393f0` D:L85892-85944), the number
  beside it (`voice+0x5c`), the speaker's `[clan] name`, and the talk / busy icon (`action_ok_talk2.tif` while the
  player records, `action_channel_busy.tif` while another holds and 1 s after; `FUN_00239250` D:L85840-85887); the
  talk icon and `hud_arrow_off2.tif` over the speaking teammate's name tag with `DISPLAY_MP_TEAM_NAMES`
  (`FUN_002269a0` D:L77434-77443); the `WhoIsTalking` world object moved to the speaker (`FUN_00211510`
  D:L68061-68080); the command menu's RADIO > ACTIVE CHANNEL and RADIO ON/OFF (`FUN_0022f950`, `FUN_0022f880`,
  `FUN_0022f8f0` D:L81558-81573) and TEAMMATES > a teammate > MUTE ON:OFF (`FUN_0022f4c0`, `FUN_0022f530`); the talk
  buttons: CIRCLE held past 0.3 s (the talk stance) and L2 with RUN AND TALK ON, the `Default` preset's (T2's row 5).
  `s11_r0004_round1/A_hold01.png` and `B_hold01.png` show the element idle at the bottom right: "1" beside the TEAM
  icon.
- **Today:** none; the command menu is not built (`RADIO_MENU_PLACEHOLDER`, `netPage.ts`: K opens the page's list).
- **Gap:** the element and its five states, the name tag's icon and arrow, the marker (owed to its unknown), the
  RADIO and MUTE rows in the page's command list until the command menu is drawn, the talk buttons wired to SVC-20b
  (gamepad CIRCLE past 0.3 s and L2; keyboard `VOICE_TALK_KEY_PLACEHOLDER`, a labelled adaptation).
- **Acceptance:** unit tests of the element's icon, number and name from a channel, a table and a recording state,
  against the cites; the idle element compared with `A_hold01.png` / `B_hold01.png`'s region; a two-browser round: A
  (SEAL) holds, B (SEAL) sees A's name, the busy icon and the icon over A's tag; C (Terrorist) sees nothing; A dies and
  his icon becomes the dead zone's.
- **Proven by:** ONL-32's window (a recomp round with a talker: `VOICE_INDICATOR_LOOK_PLACEHOLDER`).
- **Dependencies:** SVC-20c, SVC-22. **Size:** M.
- **Unknowns:** `VOICE_CHANNEL_COUNT_READING`, `VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER`, `VOICE_TALK_STANCE_READING`,
  `VOICE_ROUND_TALK_BUTTON_READING`, `VOICE_OFFENSE_DEFENSE_NUMBER_READING`, `VOICE_INDICATOR_LOOK_PLACEHOLDER`
  (research 170 §10).
- **Owner calls:** H87 VOICE-KEY (the round's keyboard key), VOICE-SEAT.
- *([2026-10-04, R170-FIX] research 170's C5 (and C6, C7, C9, C11), from W2-R-03 and the R2-AV card: **there is no talk
  stance** -- the round's "state 5" is the command menu object's own "talking" state, so the text above ("the talk
  stance") means CIRCLE held past 0.3 s talks, a tap opens the command menu, and nothing about the soldier changes or
  draws; `VOICE_TALK_STANCE_READING` is resolved and leaves this task's unknowns. The talk buttons are the selected
  preset's (Goldeneye: SQUARE, no RUN AND TALK), CIRCLE is dead 1.3 s after a talk, and RUN AND TALK suppresses the
  weapon swap (SVC-22 owns the input). The `WhoIsTalking` marker is read: a pulsing `hud_talk.tif` at the speaker,
  hidden past 900 units (`VOICE_WHO_IS_TALKING_MARKER_PLACEHOLDER` resolved). The icons: DEFENSE is 1, OFFENSE 2 as
  drawn above, now confirmed against the menu's rows. In a respawn game the dying player's icon stays his living
  channel's, not the dead zone's -- the acceptance's "A dies and his icon becomes the dead zone's" holds only
  without respawn.)*
- **Merged from:** new (research 170 §7.1): the round's indicators of OT.R23's "UI to show who was talking ... (and
  perhaps in game)".
