# 229 -- The options and the personas as JSON: what persists, the 65 valves, the toggles (OPT-02; OPT-03 and OPT-04 to follow)

Written 2026-10-09 00:41Z for OPT-02 (`../roadmap/04-options-memory-card.md` "OPT-02", as corrected by R7: the valves
are JSON in the `BASCUS-97275SOCOMII` file's data, no byte codec; web sprint 15,
`../plans/2026-10-08-web-sprint-15-the-cards-data.md`, W15.R3) against `agent/online` 680c84f1e. It stands on research
104 (the valve store, R104.5), 302 §4 (Chris's settings: the page's `CValveSaveManager` module), 143 (OPT-05i's save
chain) and 99 §7 (PLAT-25's slots). Sources: the game's decompilation `game/analysis/socom2_game.elf.decomp.c`
(`D:L<line>`, `FUN_<addr>`, cited, never pasted); the US disc through the repository's readers -- `global_valves.rdr`
(`RUN/READERC.ZAR`, `@s2u/archive`), the dialogs (`RUN/UI/READERC.ZAR`, `@s2u/ui` `loadDialog`) and their animations
(`RUN/UIZANIM.ZAR`, `@s2u/scene` `decodeUiSet`); the saved cards under the desktop tree (`SOCOM_PC_ROOT`): the f0 card
`logs/parity/f0`, the two archived cards `logs/parity/s16_l1b_step0` and `s16_l1b_step0b`, and the recomp's four fixture
cards, read with the dev tool (`tools/dialogInventory.ts` `persistentValvesOf`, `valveNames`, `valveValues`). The code is
`packages/viewer/src/originalOptions.ts`; the tests `packages/viewer/test/originalOptions.test.ts` (unit; its transcriptions
in `packages/viewer/test/optionToggles.ts`), `packages/viewer/test/personaHost.test.ts` and the dev-host
`tools/test/valveModuleDisc.test.ts`; the pin `tools/test/dialogInventory.pinned.json` (`persistentValveValues`, new).
Confidence: **reading, pending review** for every transcription; nothing here is proven -- the recomp's toggle-and-card-
diff runs are OPT-19's (H25).

*2026-10-09 03:49Z, OPT-02b (W15.R6; `agent/online-opt02b` from `agent/online` 8dcf870b7):* the page's boot now loads
the whole table (`bootValves`, `frontEnd.ts`), and the card's `CUIVarManager` module never holds a password-class UI
variable (`@s2u/ui` `CARD_PASSWORD_UI_VARS_PLACEHOLDER`, the port's rule) -- R229.5, §1, §6 and §7 below. Tests:
`packages/viewer/test/bootValves.test.ts` (unit, a fixture table), the live-session case of `valveModuleDisc.test.ts`
(dev-host), `packages/ui/test/uiVars.test.ts` and `personaHost.test.ts` (unit). **Reading, pending review.**

*2026-10-09 07:25Z, OPT-03 (`agent/online-opt03` from `agent/online` 0e726f6be):* the persistence rule in one table
with the tests that hold it (§4) -- the page already held it; a carried part the original never writes is filed for
OPT-04 (§4). **Reading, pending review.**

*2026-10-09 07:47Z, OPT-04 (`agent/online-opt04` from `agent/online` ba18aafea):* the persona records inside the whole
save, held by test; the stray part fixed -- the save rebuilt from the registered modules; the MP name's migration; SAVE
PASSWORD: YES under OT.R17; the HOST rule left to OC-3 (§5). **Reading, pending review.**

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R229.1 | **Every PERSIST valve is written, and every entry is read back.** `CValveSaveManager_Serialize` writes the registry's PERSIST valves, in registry order; `CValveSaveManager_UnSerialize` sets every entry of the module at PERSIST, making a name the registry lacks. The page restored the option valves only: it now restores every entry | `originalOptions.ts` `restoreValveModule` | §1 |
| R229.2 | **The 65 names are `global_valves.rdr`'s 65 PERSIST rows, in its order**, on every saved card; the page's save at the registry's defaults holds exactly them, with the archived cards' values | `valveModuleDisc.test.ts` | §2 |
| R229.3 | **The f0 card differs from the defaults at two valves, both a playthrough's state**: `ChosePresetOnce` 1 (table 0) and `ForGameCompleteScreen` 2 (table 1) | `optionToggles.ts` `PLAYTHROUGH_STATE` | §2 |
| R229.4 | **Each option's handler is a script, not code**: a strip's box's ONCHECK animation (or a button's or the dialog's pad) whose VALVE commands write one option valve -- two for a preset -- by name and value; the scripts' flags are TEMP and never reach the card | `optionToggles.ts` `OPTION_TOGGLES` (34 rows) | §3 |
| R229.5 | ~~**The page's boot still loads only the 22 option rows of the table**, so a live session's save holds the names its registry made PERSIST, not the 65; loading the whole table is left (§7)~~ *(Struck 2026-10-09, OPT-02b.)* **The page's boot loads the whole table, as `CValve_Open` does, before any screen makes a valve**: a live session's save holds the 65 in the table's order (dev-host); the card's `CUIVarManager` module never holds a password-class UI variable, whatever `SecurePassword` says -- the port's rule (W15.R6) | `frontEnd.ts`, `originalOptions.ts` `bootValves`; `@s2u/ui` `uiVarModule` | §1, §6, §7 |

## 1. What persists (the reading)

- **The save.** `FUN_00352a40` (D:L251450-251459) builds the module under the record name at 0x3f8180 (`PersistentValves`,
  research 104 §3) through `FUN_00352a90` (D:L251465-251482): it walks the registry's list from its head `DAT_0049e808`
  to the sentinel 0x49e804 (D:L251471-251472) and, for each valve whose type byte (+6) is 3 (D:L251473), writes a record
  of `NAME` (0x3f8170) and `VAL` (0x3f8178, the u16 at +4) (D:L251474-251477). So the module is **every PERSIST valve the
  registry holds at the save, in registry order** -- not a fixed list: `global_valves.rdr`'s 65, a mission's `PERSIST`
  tags (`FUN_002acc10`, research 104 §6), a valve a screen acquires at PERSIST (`PLAYERGENDER`, research 153) and
  whatever an earlier restore made.
- **The load.** `CValveSaveManager_UnSerialize` (`FUN_00352960`, D:L251412-251445): while the node is a list (type 4,
  D:L251424) and entries remain (D:L251425), each entry's `NAME` (`FUN_0032ee10`, D:L251439) and `VAL` (`FUN_0032e970`
  into a word, D:L251440) go to `FUN_003520d0(NAME, VAL, 3)` (D:L251441): **every entry, in the module's order**, made
  when absent, written through the watchers, promoted to PERSIST (D:L251116-251121). Nothing filters the names. A node
  that is not a list restores nothing.
- **When.** `UILoadConfig` (`FUN_0027b0e0`, D:L124789-124813) starts the save file's load (`FUN_003a1730`,
  D:L295956-295974); the save module list hands the module to its manager's `UnSerialize` (vtable slot 2,
  `recomp/socom2_names.csv`). The dispatch from the load's completion to that slot is not traced here (§6).
- **The page.** `restoreValveModule` restored the option valves only (`OPTION_VALVES`), leaving the module's other names
  in the file for the next save (`valveModule`). It now restores every entry at PERSIST (`ValveStore.restorePersistent`),
  the old line struck in its doc (2026-10-09). `valveModule` is kept (W15.R3): it writes the module as held with every
  PERSIST valve over it; once the restore has made each held name a PERSIST valve, the held names add nothing
  `FUN_00352a90` would not write. The page's check of its own JSON stays an adaptation: a module whose values are not
  whole numbers in 0..0xFFFF restores nothing (the original reads `VAL` as a word and keeps its low 16 bits).
- **What the page's registry holds.** ~~The boot reads `global_valves.rdr`'s option rows only (`readOptionValves`,
  `frontEnd.ts`)~~ *(struck 2026-10-09: OPT-02b, the next bullet)*, the online menu seeds its twelve (`seedWorldOfSocomValves`, four of them PERSIST), the persona form
  acquires `PLAYERGENDER` at PERSIST; `CValve_Open` loads all 185 rows (`FUN_00351d40`, the call D:L152619). ~~So a
  session that starts on an empty card saves those names, not the 65 (§7).~~ *(struck at the merge, 2026-10-09: the next bullet; the review's low)* `readGlobalValves` / `globalValvesOf`
  (new) read the whole table; the dev-host test loads it as `CValve_Open` does.
- **The boot loads the whole table (OPT-02b, 2026-10-09; W15.R6).** `readFrontEndDisc` reads every row
  (`readGlobalValves`, the disc's field `globalValves`) and the session's opener starts on `bootValves`' registry: the
  table loaded before any screen makes a valve, as `CValve_Open` runs at the game's start (D:L152619), so the registry's
  order, and the save's, is the table's; the online menu's and the briefing room's seeds then write the same values over
  their rows. In the store a row typed PERSIST is PERSIST (3); an untyped row takes the call's fallback, PERM (1); a
  `PERM` word would be PERM and a `TEMP` word TEMP (2, dropped at a relaunch, `RELAUNCH_VALVES_READING`) -- the US
  disc's 185 rows are 65 PERSIST and 120 untyped, none PERM or TEMP (held by the dev-host test). A live session's save
  holds exactly the 65, in the cards' order, at `s16_l1b_step0`'s values (dev-host); a valve a screen later acquires at
  PERSIST (`PLAYERGENDER`, research 153) is written after them, as the original's registry would. The option rows are
  among the 65 at the same defaults, so the options behave as before. The relaunch is unchanged (it reads no table).

## 2. The 65 names and their values (the dev tool's)

- **The table.** `global_valves.rdr` declares 185 rows, 65 typed PERSIST (research 104 §6); the 65 in the table's order
  are the cards' 65 in their order (`valveModuleDisc.test.ts`): the registry appends in creation order (research 104
  §3) and the cards hold the table's order, as they would if the table made the 65 before any other PERSIST valve.
- **The cards.** Each of the seven cards holds a 4,144-byte `PersistentValves.rdr` naming the same 65 in the same order
  (`dialogInventoryDisc.test.ts`). Their values: `s16_l1b_step0` and `s16_l1b_step0b` hold the table's value at all 65;
  the recomp fixtures `one` and `two` likewise; f0, `created` and `virgin` differ at two (the fixtures' values read with
  the dev tool, not test-held; f0's and the archived cards' are):

| valve | table | f0 | why (a playthrough's state, not a default) |
|---|---|---|---|
| `ChosePresetOnce` | 0 | 1 | (read, not tested) set to 1 only by CONTROLLER PRESETS' `PressPreset1`-`4` (`dlgControllerPresets.rdr`, `RG`/`CS` variants alike): a preset was chosen; SELECT RANK's `ProceedAs*` test it |
| `ForGameCompleteScreen` | 1 | 2 | (read, not tested) written only by the campaign's scripts: SELECT RANK's `ProceedAsEnsign`/`Lieutenant`/`Commander` set 1/2/3, `dlgMenu`'s `CallMissionSelection` 1, the debriefing's `TestForCompletionLevel` copies `GameComplete` and adds 1 (f0's `GameComplete` is 0); 2 is `ProceedAsLieutenant`'s |

- **The defaults** (the table's, the 65's): 18 non-zero -- `STEREO_CONTROLLER`, `VIBRATION_CONTROLLER`,
  `SUBTITLE_CONTROLLER`, `ORDER_RESPONSE_CONTROLLER`, `BOBBING_1ST_PERSON`, `AutoAim`, `SelectedControllerConfig`,
  `HelpWindowsEnabled`, `ForGameCompleteScreen`, `SecurePassword`, `DISPLAY_MP_TEAM_NAMES`, `EnableExternalWhispers` 1;
  `GamePasswordFilter`, `FF_FILTER`, `LockedFilter` 2; `ScreenOriginX`, `ScreenOriginY` 128; `GameSpeedFilter` 65000 --
  and the other 47 are 0. The pin holds the f0 card's values (`persistentValveValues`, written by
  `npx tsx tools/dump-dialogs.ts --pin`; held to the card by `dialogInventoryDisc.test.ts`).
- **The page's save.** With the registry loaded as `CValve_Open` loads it, the page's own save path (`connectPersona`'s
  config under OPT-05i's `SaveConfig`, over PLAT-26a's libmc) writes a `CValveSaveManager` module of exactly the 65, in
  the cards' order, equal to `s16_l1b_step0`'s and `s16_l1b_step0b`'s values and to f0's but for the two above
  (dev-host). The round trip through a slot and an older save's absent value (the registry's default kept) are unit
  tests.

## 3. The toggles' valves (a reading)

**The chain.** A RADIOSTRIP's pad (`FUN_00370f60`, D:L268669-268722) moves its selection and checks the selected box
(`FUN_00370db0`, D:L268618-268666), which runs that box's ONCHECK animation; the animation's VALVE commands run through
`FUN_00353fd0` -- op 11 `=` (D:L252215-252228), op 12 `+=` (D:L252229-252243), op 13 `-=` (D:L252244-252263) -- on the
named valve. The script's parse made each name the registry lacked TEMP (`FUN_00351ff0(name, 2)`, D:L251782), so the
flags the scripts raise (`OptionsMenuChanged`, `PitchChanged`, `STEREO_CHANGED`, ...) never reach the module; the option
valves are PERSIST since the table, so each write shows in the next save. RETURN's `StoreOptions` then copies them to the
globals (research 302 §4). The handler of each option is therefore the disc's script, read through `@s2u/scene`, and
the code that runs it is cited above.

| task | dialog | bound | animation | persistent valve(s) it leaves |
|---|---|---|---|---|
| OPT-10 | `dlgOptions_Audio` | strip `mono_stereo`: Stereo / Mono / Dolby | `enable_stereo` / `disable_stereo` / `enable_dolby` | `STEREO_CONTROLLER` 1 / 0 / 2 |
| OPT-11 | `dlgOptions_Video` | strip `TeamMateNames`: on / off | `Enable_TeamNames` / `Disable_TeamNames` | `DISPLAY_MP_TEAM_NAMES` 1 / 0 |
| OPT-11 | `dlgOptions_Video` | strip `video_mode`: VideoNTSC | `video_ntsc` | `video_mode` 0 |
| OPT-11 | `dlgOptions_Video` | strip `helpwindows`: on / off | `enable_Help` / `disable_Help` | `HelpWindowsEnabled` 1 / 0 |
| OPT-11 | `dlgOptions_Video` | strip `headbobbing`: on / off | `enable_headbob` / `disable_headbob` | `BOBBING_1ST_PERSON` 1 / 0 |
| OPT-13 | `dlgControllerSelection` | strip `Vibration`: on / off | `enable_vibration` / `disable_vibration` | `VIBRATION_CONTROLLER` 1 / 0 |
| OPT-13 | `dlgControllerSelection` | strip `AutoAim`: on / off | `AutoAimOn` / `AutoAimOff` | `AutoAim` 1 / 0 |
| OPT-13 | `dlgControllerSelection` | strip `invert_pitch`: on / off | `enable_inverted_pitch` / `disable_inverted_pitch` | `INVERT_PITCH_CONTROLLER` 1 / 0 |
| OPT-13 | `dlgControllerSelection` | strip `firerate`: SELECT / L3 | `select_fire_rate` / `L3_fire_rate` | `FIREMODESWAP_CONTROLLER` 1 / 0 |
| OPT-13 | `dlgControllerSelection` | strip `stick_presets`: Custom / Trainee / Soldier / Seal | `StickPreset<box>` (the set's `stickPreset<box>`, found case-blind) | `stick_preset` 3 / 0 / 1 / 2 |
| OPT-14 | `dlgControllerPresets` | `Preset<n>Btn` CROSS | `PressPreset1`-`4` | `ChosePresetOnce` 1 and `SelectedControllerConfig` n |
| OPT-15 | `dlgOnlineOptions` | strip `TeamMateNames`: on / off | `Enable_TeamNames` / `Disable_TeamNames` | `DISPLAY_MP_TEAM_NAMES` 1 / 0 |
| OPT-15 | `dlgOnlineOptions` | strip `ExternalWhispers`: on / off | `Enable_Whispers` / `Disable_Whispers` | `EnableExternalWhispers` 1 / 0 |
| OPT-12 | `dlgScreenAdjust` | the dialog's LEFT / RIGHT / UP / DOWN | `screen_left` / `_right` / `_up` / `_down` | `ScreenOriginX` -1 / +1, `ScreenOriginY` -1 / +1, inside 0..250 (X) and 80..250 (Y) |

The unit test runs each row's VALVE commands, in order, on a registry at the table's defaults and holds the saved module
to the defaults with exactly the row's valves changed; the dev-host test holds each row's binding to the layout and its
commands to the animation, and every strip box of the four OPTIONS pages and ONLINE OPTIONS to a row or a reason.
**Left out, with why:** the HDD row (OPT-16; `dlgOptions_Menu`'s only strip, so OPT-09's page has no other valve):
behind `HDD_Operations` and its confirm popup, `HDD_ENABLE` 1 then 0 again when `GET_MISSION_DATA` fails, or 0 then 1
again -- its value is the HDD probe's; VIDEO MODE's progressive box (`video_dtv`: `video_mode` 1 only once its
AreYouSure popup answers YES). ~~The stick presets: whether the animation lookup is case-blind is not read.~~ *(Struck
2026-10-09, the review: it is read.)* The stick presets' ONCHECK names `StickPreset<box>` and the set holds
`stickPreset<box>`; the box's ONCHECK runs through `FUN_0026a250` (D:L268634, D:L268653), whose lookup `FUN_0026c8f0`
(D:L115048, D:L115062) compares with `FUN_00198b80` (D:L116537), case-blind over ASCII letters (research 106 §5, 107
R107.2) -- so each box writes `stick_preset`, one of the 65, and is a row; its `if` on `stick_preset` comes after the
writes and only enables the three sliders. Not toggles, not tabled:
DEFAULT SETTINGS (`do_audio_default`, `do_video_default`, `do_controller_default`) and the discards (`OnAudioBack`,
`OnVideoBack`, `OnContSelectBack`, `OnOptionsBack`: each copies its `TEMP_*` back); `enable_stickswap` /
`disable_stickswap` (`STICK_SWAP_CONTROLLER` 0 / 1) exist in `dlgControllerSelection`'s set and no strip binds them.
**Proof:** OPT-19's recomp runs, toggling each option and diffing the card (H25); none was run here.

## 4. OPT-03

*2026-10-09 07:25Z, OPT-03 (`agent/online-opt03` from `agent/online` 0e726f6be; roadmap 04 OPT-03 under R7 and its
2026-10-07 note; W15.R3, W15.R6).* What persists, written as the original's rule and held by tests. **The page already
held the rule**: no test of it went red, and the tests below are the proof at the reading level. One case off the
rule's path does not hold -- a part the original never writes, read from a file, is carried into the next save --
and it is filed for the file's owner below. Nothing here is measured on the original running: the save-and-relaunch
diffs are OPT-19's (H25). **Reading, pending review.**

| what | longevity or type that persists | the cite | the test that holds it |
|---|---|---|---|
| a valve, into `CValveSaveManager` | type 3 (PERSIST); type 2 (TEMP) and 1 (PERM) are not written. The type at the save decides: a set at PERSIST promotes, PERM and TEMP never lower a PERSIST valve | `CValveSaveManager_Serialize` `FUN_00352a90`: the registry walk D:L251471-251472, the type byte (+6) == 3 at D:L251473; the promotion `FUN_003520d0` D:L251116-251121; a script's flags made TEMP by the parse, D:L251782 | `packages/ui/test/valves.test.ts` "the persistence rule for valves" (unit); `packages/viewer/test/persistenceRule.test.ts`, `valveModule` (unit) |
| a UI variable, into `CUIVarManager` | longevity 3 (PERSISTENT); 1 and 2 are not written. `CUIVarManager_Add` only raises a longevity (R104.7), so a var added at 1 or 2 and later at 3 is written, one added at 3 stays 3 | `CUIVarManager_Serialize` `FUN_00385670` D:L279389 (the longevity byte +0x24 == 3); `FUN_003857c0` D:L279438-279440 (the raise) | `packages/ui/test/uiVars.test.ts` "the persistence rule for UI variables" (unit) |
| a system tuner as `InitSystemTuners` makes it | longevity 2, stored directly over `Add`'s 1 -- a persistent var is lowered -- so not written | `FUN_0038a7a0` D:L282254-282255 (the first tuner; the same pair for each) | `uiVars.test.ts`, the same block (unit) |
| `MPLOCALSOP1-5`, `MPTAUNTMSG1-5` | longevity 3: `dlgNetLogin.rdr`'s ten TEXT objects bind them with a `UIVAR` spec of `LONGEVITY PERSISTENT`, `VALUE` the HudCLOC keys 60757-60766 (302 §4) | the spec's reader `CUIVariableSpec` `FUN_00386ff0` D:L280328-280346 (PERSISTENT 3) | `packages/ui/test/screens/persistenceRuleDisc.test.ts` (dev-disc, through `@s2u/archive` and `dialogLookup`): the ten specs off the disc, and the page opening the dialog (`netLoginRig`) -- its card module holds exactly the ten |
| the password class | longevity 3, never written: the port's rule | `CARD_PASSWORD_UI_VARS_PLACEHOLDER` (§6; W15.R6) | `uiVars.test.ts` (OPT-02b's), `persistenceRule.test.ts` (unit) |
| the save file's data | the three modules and nothing else -- `CUIVarManager`, `CValveSaveManager`, `CAcctDB`, in that order -- each holding only the rows above | `CSaveManager::Save` `FUN_0033dff0`: a new in-memory archive at each save (D:L239190), its module list (D:L239201), each registered module serialized under its name (D:L239205-239216); the order of every game-written card (`tools/test/cardFileDev.test.ts`, `two.bin`) | `persistenceRule.test.ts` (unit): a session with every kind of value, a built slider, and a save after a read-back |

- **The sliders.** The eight tuners -- `SOUND_VOLUME` (SFX), `MUSIC_VOLUME`, `DIALOG_VOLUME`, `HEADSET_CONTROLLER`
  (`dlgOptions_Audio.rdr`'s four SLIDERBARs), `BRIGHTNESS` (`dlgOptions_Video.rdr`'s one), `STICK_SENSITIVITY`,
  `STICK_INERTIA`, `STICK_DEADZONE` (`dlgControllerSelection.rdr`'s three) -- are longevity 2 from `InitSystemTuners`
  and reach no module while no slider of theirs is built. Each slider's `UIVAR` spec says `LONGEVITY PERSISTENT` (the
  dev-disc test reads all eight), and the slider's set-up `FUN_003724f0` adds its var with the spec's longevity
  (D:L269307, the spec's byte the reader writes), which `Add` raises: from then the tuner is written into
  `CUIVarManager`, never into the valves' module or another part (R104.10 revised; 302 §4). On the page the main menu's
  OPTIONS builds those pages (OPT-09..OPT-14), so a session that opened AUDIO saves its four. The roadmap block's "the
  volume, brightness and stick vars ... appear in no saved file" (O15, O16) is the state before a slider is built; the
  tests name the eight and hold both states.
- **The `ext` rule (R7; PLAT-25).** Anything SOCOM Legacy keeps that the original never saved goes to the slot's `ext`
  (`CardSlot.setExt`, under its own namespace), never into a key of the save file's data. Today SOCOM Legacy keeps nothing
  there: no caller of `setExt` in `packages/*/src` (searched 2026-10-09), and the save leaves `ext` empty (the test).
  *(2026-10-09, OPT-04: one caller now -- the MP name's run, `CardExtStore` in its `migrate` namespace (§5): its mark,
  once per slot and an absent key included (`migrateOnce`'s rule), and the name until the form takes it. A save still
  writes nothing there.)*
  The persona record's PASSWORD holds a length, not the password (R7's change to an original field, `persona.ts`), and
  the file's size is nominal -- neither is a new part.
- **Found: a part the original never writes is carried** (for OPT-04, whose file it is this wave). `PersonaCard` keeps
  the file's other parts as read (`persona.ts` `parsePersonaFile`'s `rest`, written back by `fileOf`), so a file the
  page reads holding a fourth key has that key in the next save -- RED, a probe not committed: the keys
  `CUIVarManager, CValveSaveManager, Stray, CAcctDB`. The original builds the archive anew from its three registered
  modules (D:L239190-239216) and writes nothing else. The page never writes such a key itself (the table's last row),
  so only a file another writer left reaches it. The fix is `persona.ts`'s: write the three modules only (and the same
  question for `CAcctDB`'s parts beside `AcctInfo`, `acctRest`). *(Fixed 2026-10-09, OPT-04: both, §5.)*
- **What OPT-19 settles** (H25): the recomp toggling each row of §3 and the card diff showing that valve change; MUSIC
  VOLUME and BRIGHTNESS moved, saved and relaunched -- whether the tuners are in the `CUIVarManager` module and the
  knob's position after the relaunch (the block's acceptance, against `s10_audio_options/s06`); and a save from a
  session that opened no options page, which should hold no tuner. Until then every row above is a reading.
- **No new suffixed name**: §6 is unchanged.

## 5. OPT-04

*2026-10-09 07:47Z, OPT-04 (roadmap 04 OPT-04 under R7 and OPT-04a; W15.R3; research 135 §5, §6).* The records inside
the whole save, the stray part, the MP name's migration, the password under SAVE PASSWORD: YES and NO, the HOST rule.
Nothing here is measured on the original running. **Reading, pending review.**

- **The records in the whole save -- held, no source change.** Through OPT-01's rig (the page's `SaveConfig` through
  `CardCommands`, the `PersonaCard` as its `CardConfigFile`, over a real `Libmc`, `save_and_leave`'s order): the save
  file's data holds the three modules in the module list's order, `CAcctDB` the records; the nominal size is 4,784 B
  with none (no UI variable: `virgin.bin`), 6,208 with one and 6,400 with two (with `dlgNetLogin`'s ten), 6,592 with
  three (`PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER`, research 135 §5); a second persona is appended after the first
  across a `LoadConfig` read and a second save -- `two.bin`'s order. Tests: `packages/viewer/test/personaSave.test.ts`
  (unit, the reference records) and `tools/test/personaSaveDev.test.ts` (dev host: `one.bin` and `two.bin` read
  through `tools/cardFile.ts` -- each record's fields but PASSWORD and SAVEPASSWORD, the file's size, the modules'
  order). The fixtures' SAVEPASSWORD is 1; the page's is 0 (the YES bullet).
- **The stray part (§4's finding) -- fixed.** `PersonaCard` keeps, of a file it reads, only the two modules beside
  `CAcctDB` (`SAVE_FILE_MODULES`), writes `CAcctDB` as `AcctInfo` alone, and builds each save in the module list's
  order; `setPart` refuses a name no module registers. So each save is rebuilt from the modules, as `CSaveManager::Save`
  builds a new archive (`FUN_0033dff0` D:L239190), opens the module list (D:L239201) and serializes each registered
  module under its name (D:L239203-239216). What a stray part's data was: whatever another writer left -- an older
  build, a card edited by hand, a key a later task wrote -- never one the page makes (§4's last row); none is carried
  now. RED: `persona.test.ts`, a file read with a fourth part `Stray` and a `CAcctDB.other` kept both, and a file read
  `CValveSaveManager` first saved in that order; GREEN, the three modules in their order, `CAcctDB` `{ AcctInfo }`; the
  same on the page's path (`personaSave.test.ts`). The two older tests that pinned the carry are rewritten.
- **The MP name's migration (research 135 §6 struck).** `s2u.mp.name` -- the name W3.R12's settings field keeps for
  `/testroom` -- is read once by `migrateOnceSync` (S15 CLOSE-FIX-1, 2026-10-09; it read `migrateOnce` until then) when the session is made (`personaHost.ts`, `MP_NAME_MIGRATION_ADAPTATION`,
  a browser adaptation): `mpNameMigration` (`persona.ts`) takes the field's text (printable ASCII, 1-30), cuts it at 14
  and puts it in the card slot's `ext` -- unless the card already holds a persona, whose list stands. The run's store is
  `CardExtStore` (`migrate.ts`): one `ext` namespace of the slot, written at the revision read in the same step, so the
  name and the run's mark land together or not at all (the card is not a `ByteStore`, the reason 135 §6 gave;
  `migrateOnce` now takes a `MigrationStore`, the two calls it makes). The record needs the HOST and PORT the form
  connects to, so it is made there: at the form's first entry with no persona (`LobbyConnect` for a universe it
  accepts, or the deep link) the name is taken from `ext` and appended as `UpdateAcctInfo` appends one (`FUN_002fbce0`
  D:L199067-199071: none found, one appended zeroed; HOST, PORT, NAME written; no password, no hometown, GENDER and
  SAVEPASSWORD 0). The form lists it first; the card holds it once the player saves, as on the console -- nothing is
  written to the save file at the session's start. A second run does nothing (the mark). **Where the name is read
  now:** the online path reads the persona's NAME -- the form's first record (`fillForm`'s PLAYERNAMEVAR) and the
  login's record (`UpdateAcctInfo`); it never read `s2u.mp.name`. **Two differences from the brief.** The old key is
  not removed: W6.R5 (the owner, 2026-10-01: keys migrate, non-destructively; research 99 §3, `migrate.ts`'s rule).
  And `s2u.mp.name` keeps one reader, `/testroom`'s W3.R12 name field (`main.ts:884-898`: the name its match client
  sends), which thirteen Playwright specs and `voiceFixtures.ts` seed by that key (`packages/viewer/e2e/`); retiring
  the field moves `/testroom`'s name to the card and those specs with it -- a browser run, which this task's host rule
  forbids. Left for the seat (searched 2026-10-09: `main.ts` the only reader in `packages/*/src`).
  *(2026-10-09, the close's fix 1: the run is now `migrateOnceSync` -- the same rule and outcomes, `migrate.ts`, settled
  before `connectPersona` returns. With `migrateOnce` the write came after an `await`, and `FrontEndSession`'s
  constructor calls `entered` straight after `connectPersona` (`frontEnd.ts`), so on a page's first session opened by a
  deep link to the form the name was not yet in `ext` and the form listed no record; `CardExtStore` is synchronous
  underneath, as the slots are. Tests: `personaHost.test.ts`, `entered` with nothing awaited; `migrate.test.ts`, the
  two runners alike.)*
- **SAVE PASSWORD: YES under OT.R17.** `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER` stays (`personaHost.ts`
  `loginFromAcct`). A login under YES leaves the account list in memory holding the typed password (the game's list:
  `FUN_002fbce0` writes it only when handed, D:L199075-199076) and writes the record **as under NO**: SAVEPASSWORD 0,
  PASSWORD `{ length: 0 }` -- not R7's flag and length, which wait on SVC-03's remember token. Test
  (`personaHost.test.ts`, YES and NO through `LobbyConnect`, `UpdateAcctInfo` and `SaveConfig`): no localStorage write
  and no card file holds the password; the only key written is the card slot's; the page's old settings are never
  written. No token exists on the page to leak: SVC-03's cookie is HttpOnly and not built (OT.R17).
- **The HOST rule** is OC-3's (H-next b): `PERSONA_HOST_PLACEHOLDER` and `PERSONA_HOST_AS_GIVEN_READING` unchanged; the
  migrated record's HOST and PORT are the universe entry's, under that placeholder. *If OC-3 later rules another
  HOST* (the plan's H-next b): the migrated record stays filed under today's universe HOST and PORT; the form for the
  new HOST lists nothing, as the original keeps one list per server (PC KNOWN [personas-per-server]); and the name is
  not migrated again, the run's mark being set. Moving held records to the ruled HOST, if wanted, is that ruling's
  task, not this run's.
- **The cut** (the review's nit, 2026-10-09): a name cut at 14 is trimmed again, so a cut never ends on a space
  (`Seal Team Six A` -> `Seal Team Six`), as the form's own path trims a typed name (`PruneUIVarSpaces`); a
  `migrate.test.ts` row holds it.
- **`CAcctDB`'s children**: `AcctInfo.rdr` alone on `one.bin` and `two.bin`, read with the dev tool
  (`personaSaveDev.test.ts`), as `desktop@be5578311:docs/research/80-persona-card-format.md:30-33` lists the
  modules; the page writes `CAcctDB` as `{ AcctInfo }` alone.
- **No new suffixed name**: §6 is unchanged (`MP_NAME_MIGRATION_ADAPTATION` is a labelled adaptation).

## 6. Placeholders and readings

~~No `*_PLACEHOLDER` or `*_READING` name is added: the values are the table's and the cards', each test-held, and what is
not read is a gap no constant stands in for.~~ *(Struck 2026-10-09, OPT-02b: one placeholder is added, the first row.)*
The values are the table's and the cards', each test-held; what is not read is a gap no constant stands in for, but
for the port's rule below.

| name | stands for | searched / reading | status |
|---|---|---|---|
| `CARD_PASSWORD_UI_VARS_PLACEHOLDER` (`packages/ui/src/uiVars.ts`) | the UI variables the card's `CUIVarManager` module never holds, whatever `SecurePassword` says -- the port's rule (W15.R6; OT.R17, R7), at `uiVarModule`: `PLAYERPASSWORD`, `STORE_PASSWORD`, `PlayerGamePassword`, `SpectatorGamePassword`, case-blind | the original holds back only the first two (0x3fa490, 0x3fa4a0, D:L279391-279392) and only while `SecurePassword` is 0 (`CUIVarManager_Serialize` `FUN_00385670` D:L279384-279394; R104.9); `uiVarsToSerialize` stays that transcription. A placeholder, not a reading: the decompilation names two, the port's class is wider, and it may grow -- settled by reading every dialog's `UIVAR` specs and keyboard targets for a password typed into a persistent UI variable (the clan and LAN screens not yet read), or by the owner revisiting OT.R17 (H-next e's alternative). `SecurePassword`'s valve stays the original's (PERSIST 1 from the table, the SAVE PASSWORD toggle's flag, saved in `CValveSaveManager`); the persona record's SAVEPASSWORD byte is unchanged (`@s2u/card` `persona.ts`: the flag and the length only, H87; 0 and no length under `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`) | open |
| the boot's table | the page loads `global_valves.rdr`'s 22 option rows, not its 185 | `CValve_Open` loads every row (`FUN_00351d40`, D:L152619); `readGlobalValves` reads them; the boot loads them all since OPT-02b (`bootValves`, §1) | resolved |
| the stick presets' lookup | ONCHECK `StickPreset<n>` against the set's `stickPreset<n>` | read (the review, 2026-10-09): case-blind, `FUN_0026c8f0` through `FUN_00198b80` (research 106 §5, 107 R107.2); the four rows are in §3 | resolved |
| the load's dispatch | which call hands the loaded module to `CValveSaveManager_UnSerialize` | vtable slot 2 (`recomp/socom2_names.csv`); the completion path from `FUN_003a1730` not traced | *note only* |

## 7. What is left

- **OPT-19's diffs** (H25): the recomp toggling each row of §3 and the card diff that shows the same valve change --
  the proven level of §3; and a save-and-reload of the original for §1.
- ~~**The page's boot loading the whole table.** Loading the 185 rows as `CValve_Open` does would make the page's save
  hold the 65 from the first session. It is not done here: it makes `SecurePassword` 1 (PERSIST) the default, so
  `CUIVarManager_Serialize` would write `PLAYERPASSWORD` and `STORE_PASSWORD` whenever they are longevity 3 (R104.9),
  which meets OT.R17's no-password-on-the-card rule and the persona form's `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`;
  and it sets 23 non-zero defaults (the 18 of the 65 among them) the online screens read. A task for the boot's owner,
  with that question first; the relaunch (`RELAUNCH_VALVES_READING`) is unchanged. So R7's acceptance (the 65 names,
  their values) holds on a registry loaded the way the original loads it (the whole table), not yet for a live
  session's save; the question is filed as the plan's H-next e.~~ *(Closed 2026-10-09 by W15.R6 -- the merge
  controller's answer to H-next e in the owner's stead, his to overturn -- and done in OPT-02b: the boot loads the
  whole table (§1), so a live session's save holds the 65; the card's `CUIVarManager` module never holds a
  password-class UI variable, `CARD_PASSWORD_UI_VARS_PLACEHOLDER` (§6), so OT.R17 and R7 stand. The table's 23
  non-zero defaults are now the session's, as on the console; the relaunch is unchanged. The alternative, OT.R17
  revisited, is the owner's.)*
- **The fixed 4,144 B** of the module stays research only (R7): no task needs the VAL encoding.
- **The rows left out of §3**: the HDD row with OPT-16, VIDEO MODE's progressive box with OPT-11.
