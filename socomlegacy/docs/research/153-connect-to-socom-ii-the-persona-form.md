# 153 -- CONNECT TO SOCOM II (`dlgNetPlayerName`): the persona form and list, the account list, the card and the score (ONL-06)

Written 2026-10-04 by the online path's dating (the plan's Log opens wave 1 on that day; the host's own clock read
2026-10-03) for ONL-06 (`../roadmap/05-online-front-end.md` "ONL-06"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R16 and OT.R17: "for now, persona name is saved but password isn't").
Sources: the disc's `RUN/UI/READERC.ZAR` (`dlgNetPlayerName.rdr`, its record) and `RUN/UIZANIM.ZAR` (its set and the
library sets it reaches, decoded with ONL-33's chapter reader, `tools/dump-online-dialogs.ts --dialog`, research 128
§4.4) through the repository's readers; the retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT`
(`D:L<n>` = its line; cited, never pasted); the retail ELF read by address with `tools/elfImage.ts` (strings, and the
instructions of `FUN_002fd0d0` and of the connect's callback, which the decompiler folds); the archived captures under
`SOCOM_PC_ROOT` (`logs/parity/s4_pcsx2/A_35_persona.png` .. `A_39_pw.png`,
`logs/parity/s17_q2_logoff/online1/02_persona.png`,
`scripts/parity/refs/persona.png`), read-only, none copied. It stands on research 115 / 116 / 117 (the screens, the
input, the widgets), 119 (the software keyboard), 128 (ONL-33), 135 (OPT-04a: the persona records), 143 (OPT-05i: the
card prompts), 144 (ONL-01) and 147 (ONL-04), and does not restate them.

The code: `packages/ui/src/screens/personaCommands.ts` (the account list, ten rows, the entry list),
`packages/ui/src/screens/universeCommands.ts` (two lookups; the two CROSS rows' entries), `packages/card/src/persona.ts`
(`setLogins`, `contents`, `restore`), `packages/viewer/src/personaHost.ts` (the page's connection, the card's module,
the deep link), `packages/viewer/src/frontEndAssets.ts` (the UISK bank; the keyboard's title),
`packages/viewer/src/frontEnd.ts` (nine lines, four added and five changed; claimed in HANDOFF §3). The tests:
`packages/ui/test/screens/personaCommands.test.ts` (CI: every row),
`packages/ui/test/screens/personaScreen.test.ts` with its rig `personaRig.ts` (CI on the fixtures: the machine over the
disc's own layout and set), `packages/card/test/persona.test.ts` (CI), `packages/viewer/test/personaHost.test.ts` (CI,
and the machine over the page's connection and a virtual card), `packages/viewer/test/frontEnd.test.ts`,
`packages/viewer/test/frontEndAssets.test.ts`, `tools/test/personaEntryCommands.test.ts` (CI: the pin),
`tools/test/personaScore.test.ts` (dev host: the score). Confidence: **reading, pending review** for every
transcription; the frames are **scored** (§4), not pixel-exact; §8 lists the placeholders and the readings.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R153.1 | **The account list is a vector of 0x1318-byte records keyed by HOST, PORT and NAME**, each compared exactly (HOST and NAME by `strcmp`, PORT as a word): HOST +0 (0x80), PORT +0x80, NAME +0x84 (0x20), PASSWORD +0xa4 (0x20), HOMETOWN +0xc4 (0x3f), GENDER the byte +0x103, SAVEPASSWORD the byte +0x1314; a record not found is appended zeroed, one found is rewritten where it stands. Nothing bounds the list. PC KNOWN's "the discriminator is one of two things" is both: the address and the port | `FUN_002fbce0` D:L199016-199184; `FUN_002fb920` D:L198911-198932 | §2 |
| R153.2 | **Under SAVE PASSWORD: NO the original hands the list no password**: `FUN_002fd0d0`'s instructions (0x2fd0d0-0x2fd100, folded by the decompiler) null the password argument when SAVEPASSWORD is 0 (`movz t0, zero, t3`), so a new record's password is empty and a held record's is **left as it stands** -- research 135's open "an empty string or no change" is no change | the ELF at 0x2fd0ec; `AcctDb.update` | §2 |
| R153.3 | **The list's three rows are a pad, not a cap**: `FUN_00276af0` writes PLAYERPERSONALIST as one `[place, NAME]` row a persona of LOBBY_HOST and LOBBY_PORT, then `[-1, "<New Persona>"]` rows `for (; i < 3; i++)`. With three personas no `<New Persona>` row is drawn, and that row is the only way to the name keyboard (`ChoosePersona`: `CompareValues(INPUT_STRING, "-1")`), so the form can make at most three personas a server; a fourth held in the list would be listed (the block's first unknown) | `FUN_00276af0` D:L122548-122583; the set | §2, §3 |
| R153.4 | **HOMETOWN's cap is 20 characters / 63 bytes, empty allowed; GENDER has no keyboard**: `set_player_hometown`'s `GetTextInput` block is `CREATEPLAYERNAME`, `_605_EnterHometown_MSG`, MaxChars 20, MaxBytes 63, AllowEmpty (research 119 §5); `set_player_gender` flips the valve PLAYERGENDER between 0 (#596 Male) and 1 (#597 Female) on CROSS (the block's second unknown) | the set; `personaScreen.test.ts` | §3 |
| R153.5 | **The cursor after the build follows the account list**: `OnLoginRoomstart` queues `ActivateButton(connect_btn)` when PLAYERNAMEVAR and PLAYERPASSWORD both hold text, `ActivateButton(passwd_btn)` when only the name does, then `ActivateButton(playername_btn)` always; M's records are taken from the top (research 115), so the row queued first is lit last -- CONNECT (PC KNOWN [persona-headless], W10), PASSWORD (the recomp's `02_persona.png`), or PLAYER NAME on an empty form (`A_35`) | the set; `personaScreen.test.ts` | §3 |
| R153.6 | **The prefill is `LobbyConnect`'s**, SELECT UNIVERSE's CROSS: LOBBY_HOST and LOBBY_PORT from the universe entry (+0x9c, +0x11c), the form's three variables and two valves from that address's **first** record, the persona list built, then the connection. `GetMUISPersonaInfo` fills the same from a place (the list's CROSS: byte +0x10 of the command is 1, `atoi` of the row's first cell) or from a name (the keyboard's `ON_SKB_APPLY`) | `FUN_00276780` D:L122454-122545; `FUN_00275350` D:L121799-121888 | §2 |
| R153.7 | **`VerifyPatchLevel` reads the universe's extended info**: `FUN_002fdaf0` splits it on space and tab into a 32-byte word at the entry's +0x338 and a 128-byte word at +0x358 (research 147 §6's untraced two words); the row is true when the first is empty or `r0001` (0x3f5dd8), else it puts the second into `PatchServerURL` and `select_server` switches to `dlgDownloadPatch` | `FUN_002766b0` D:L122429-122451; `FUN_002fd6e0` D:L199827-199850 | §2 |
| R153.8 | **The card is written where the console writes it**: `memcard_operations` -> `save_and_leave` -> `SaveConfig`, on CONNECT or TRIANGLE with `SaveAvailable` 1 and the player's YES to #831. On the page that is OPT-05i's `CardCommands` (registered here: research 143 §5's owed call) with the save file's `CAcctDB` module from `@s2u/card`'s `PersonaCard`. Under OT.R17 a record keeps HOST, PORT, NAME, TOWN and GENDER and **no password**: SAVEPASSWORD 0, PASSWORD `{ length: 0 }` *(2026-10-17, SAVE-PASSWORD, OT.R61: still no password; under YES SAVEPASSWORD 1 and the password's length, §5a)* | `personaHost.ts`; `personaHost.test.ts` | §5 |
| R153.9 | **The scores are met**: 99.8 against `A_35` (the empty form), 99.9 against `A_36` (the list; 99.7 on its panel alone), 99.1 against `A_37` (the name keyboard), 99.8 against `A_38` (a name typed) and `A_39` (a password typed), 99.6 against the recomp's `02_persona.png` (55.08 % of its pixels equal), 96.9 on the title crop | `tools/test/personaScore.test.ts` | §4 |
| R153.10 | **The page drew the keyboard as its title line alone**: the keyboard's twelve bitmaps are `RUN/UI/UISK_TXR.ZED`'s, a bank no dialog names -- the menu state's own load opens `ui/assetlib/uisk` after the keyboard's file -- and the page loaded UIMP, UI2D and UIBF only (the same frame then scores 86.0 against `A_37`); and its title was the purpose's name (`_455_EnterPlayerName_MSG`), the page handing the keyboard no caption tables. Both are fixed | `FUN_001f4860` D:L54818-54821; `frontEndAssets.ts` | §4 |
| R153.12 | **SAVE PASSWORD is the card's, never the wire's** (2026-10-17, SAVE-PASSWORD): the card's writer `FUN_002fc440` writes PASSWORD only when the record's password is non-empty **and** SAVEPASSWORD is set (D:L199263-199265), SAVEPASSWORD always (D:L199266); its reader `FUN_002fc280` reads both (D:L199229, D:L199233; SAVEPASSWORD 1 when absent) and passes SAVEPASSWORD as `FUN_002fbce0`'s ninth argument (the ELF at 0x2fc3c0, `sd v0, 0(sp)`); `LobbyConnect` fills PLAYERPASSWORD from the record whatever SAVEPASSWORD says (D:L122497-122500), and the AccountLogin request carries the name and the password alone (`FUN_002eede0` D:L191138-191139) | the decompilation; the ELF | §5a |
| R153.13 | **A refused saved password returns to the form with it still drawn**: -978 posts MP_INVALID_PASSWORD (`FUN_002eefa0` D:L191175-191178); `dlgNetConnect.rdr`'s `OnInvalidPassword` shows #545 (`_545_PasswordNotMatch_MSG`) and `exit_connect_screen` switches back; the form's ONSTART clears neither PLAYERPASSWORD nor the strip and opens no keyboard, so CONNECT is lit again (R153.5). The form's TEMPORARY variables outlive the switch: `FUN_00385c30`, which makes them dormant, is called by four state functions (D:L53410, D:L55558, D:L75873, D:L75937), not by `SwitchMenu` `FUN_0027e720` | the set (`tools/dump-online-dialogs.ts --dialog`); the decompilation | §5a |
| R153.11 | **The page's card rows are BOOT-04's stubs for the whole session** (a fixed f0 card in slot 1, registered over MENU-01a's real rows until BOOT-05): left so, the form's save asks the stub whether the folder exists and then writes through libmc at the real card's root. On the persona form the twelve card rows are the real ones; elsewhere the stubs stand | `personaHost.ts` `PERSONA_FORM_CARD_ROWS_ADAPTATION` | §5 |

## 1. The dialog as the original builds it

26 widgets: 16 objects and 10 controls, the library `ui/assetlib/uimp`, the background `multplay_back.tif`, the
scripts `dlgNetPlayerName.rdr`, `uianim.rdr`, `UIMemCardAnim.rdr`, `USES_MEMCARD`. The rows are 145 x 30 BUTTONs at x
16:
`playername_btn` y 100 (`_317_PlayerName_MSG`), `passwd_btn` 130 (`_251_PASSWORD_MSG`), `Store_Password` 160 (a
RADIOSTRIP, `_588_SavePassword_MSG`; its CHECKBOXes `Store_password_yes` `_589_YES_MSG` at +150 and `Store_password_no`
`_590_NO_MSG` at +215, `op_checkbox.tif` / `op_check.tif`), `hometown_btn` 190 (`_591_HomeTown_MSG`), `gender_btn` 220
(`_592_GENDER_MSG`), `connect_btn` 363 (`_452_CONNECT_MSG`). The values: `playername_val` (180, 127) on PLAYERNAMEVAR,
the
SECURETEXT `password_val` (180, 162) on PLAYERPASSWORD, `hometown_val` (180, 217) on PLAYERHOMETOWN, `gender_val`
(180, 247) with the caption `M` until a script sets it. `bar_title` `_587_ConnectToSocom_MSG` (scale 0.95),
`DescriptionText` (321, 95), `InfoTextT` `_149_Back_MSG`, `InfoTextX` `_150_Select_MSG`.

`PersonaList`: a LISTBOX child of MENUFADER at (168, -400), 200 x 150, `popupOp.tif`, SPACING 22, SCALE 0.9,
LEFT_MARGIN 15, TOP_MARGIN 28, NOSELECT, PADHOG, the highlight `brown_back.tif`, ACTIVE_COLOR (91, 72, 36), two COLUMNS
at -290 (the place: off the panel) and 0 (the name), on the UI variable PLAYERPERSONALIST; its three legends are TEXTs
under it (`_52_Select_MSG` at (10, 115), `_593_DotDELETE_MSG`, `_594_HookCANCEL_MSG`). The CONTROLS in file order are
the six rows, the list and its three legends: the focus ring walks them so, and the legends, being TEXTs in CONTROLS,
are stops that light nothing (research 144 R144.3) -- DOWN from CONNECT passes three of them before PLAYER NAME
(`personaScreen.test.ts`). *(Superseded 2026-10-05 by FOCUS-RING, research 116 §17: a TEXT is built disabled, so DOWN
from CONNECT goes straight to PLAYER NAME -- the stops are `playername_btn`, `passwd_btn`, `Store_Password`,
`hometown_btn`, `gender_btn`.)*

The bindings (the chapter, pinned by ONL-33): ONSTART runs `check_store_password`, `OnLoginRoomstart`,
`CheckConnectEnable` and the library's `has_memcard_changed`; `ON_SKB_APPLY` `OnSKBApply`; `MEMCARD_ERROR`
`handle_memcard_error`; `LOADED_FROM_MEMCARD` `CheckConnectEnable`; `MP_MEDIUS_ERROR` `OnNetError`; `MP_SYSTEM_MESSAGE`
the library's `OnSystemMessage`; TRIANGLE `leave_player_name_screen`; each row's ONACTIVATE its help line (#598, #599,
#595, #600, #601, #602) and its CROSS (`set_player_name`, `set_player_password`, `set_player_hometown`,
`set_player_gender`, `register_new_account`); the YES / NO boxes' ONCHECK `enable_store_password` /
`disable_store_password`; the list's CROSS `ChoosePersona`, TRIANGLE `CancelPersonaChoice`, CIRCLE `DeletePersona`.
The set has 25 animations; the valves they keep are `SecurePassword`, `PLAYERGENDER`, `SaveAvailable`,
`DoNotChangeSaveAvailable`, `PasswordChanged`, `HomeTownChanged`, `PersonaChanged`, `OldSecurePassword`, `NameIsVulgar`,
`AreYouSure`, `num_memcards` and the card chain's.

## 2. The rows (`personaCommands.ts`)

Every argument is the command's `names[+8]` (`FUN_0026ed60`), `INPUT_STRING` (0x3ee898) replaced by the running
animation's first string input (`FUN_00272480(ctx+0x18, 0)`). The names: LOBBY_HOST 0x3ee960, LOBBY_PORT 0x3ee970,
PLAYERNAMEVAR 0x3ee980, PLAYERPASSWORD 0x3ee990, PLAYERHOMETOWN 0x3ee9a0, PLAYERGENDER 0x3ee9b0, SecurePassword
0x3ee9c0, `<New Persona>` 0x3eeb08, PLAYERPERSONALIST 0x3eeb20, PatchServerURL 0x3eeae0, LANPLAYERNAMEVAR 0x3eeaf0.
LOBBY_HOST and LOBBY_PORT are added PERMANENT, the form's three and the list TEMPORARY.

**The account list** (`AcctDb`; the object at 0x44fc60, count +4, data +8). `FUN_002fb920` (D:L198911-198932) counts
the records of a HOST and PORT; `FUN_002fb9f0` (D:L198935-198960) answers a NAME's place among them, their count when it
is not there; `FUN_002fbbf0` (D:L198993-199013) whether one is held; `FUN_002fd510` / `FUN_002fd410` / `FUN_002fd310`
(D:L199704-199800) a place's NAME, PASSWORD, HOMETOWN (null past the list); `FUN_002fd110` / `FUN_002fd210`
(D:L199636-199701) its GENDER and SAVEPASSWORD bytes (0 past it); `FUN_002fbae0` (D:L198963-198990) erases a place's
record. The update is `FUN_002fd0d0` (D:L199622-199633; its instructions, read in the ELF: `beq a3, zero` and
`lb v1, 0(a3)` / `beq v1, zero` skip a null or empty NAME; `sd t3, 0(sp)` passes SAVEPASSWORD as the ninth argument;
`movz t0, zero, t3` nulls the PASSWORD when it is 0; `move t3, zero` in the call's delay slot zeroes the profiles
argument) into `FUN_002fbce0` (D:L199016-199184): the record of HOST, PORT and NAME found (D:L199058-199066) or one
appended and zeroed (`FUN_002fe3e0`, D:L199067-199071); `strncpy` of HOST 0x80, NAME 0x20, then PASSWORD 0x20 and
HOMETOWN 0x3f only when handed (D:L199072-199080); the two bytes (D:L199081-199082); the profile branch not taken (its
argument is 0). A
field filled to its last byte has no terminator and the original reads on into the next: the keyboards' MaxBytes keep
the name and the password one byte short (31 of 32), and a 63-byte hometown ends on the GENDER byte.

**UpdateAcctInfo** `FUN_00275130` (D:L121727-121796): the form -- LOBBY_HOST (a string, else null), LOBBY_PORT (an int,
a real truncated, else 0), the three variables (strings, else null), `PLAYERGENDER != 0` (the valve acquired PERSIST),
`SecurePassword != 0` (acquired PERM) -- into the update, then the persona list rebuilt (`FUN_00276af0`). Answer 1. The
set calls it from `enable_store_password`, `disable_store_password`, `OnSKBApply`, `set_player_gender` and
`memcard_operations`.

**The persona list** `FUN_00276af0` (D:L122548-122583): R153.3. The value is set through `FUN_00386460`, so the list's
UI-variable watcher rebuilds its items (research 144 R144.2): the row's first cell prints `%d` at column -290 and is
the argument the list's bindings start their animations with.

**GetMUISPersonaInfo** `FUN_00275350` (D:L121799-121888), **DeleteMUISPersona** `FUN_002761a0` (D:L122290-122391) and
**MUISPersonaExists** `FUN_00276580` (D:L122394-122426): R153.6. Delete takes the place by `atoi`, compares the form's
name with that record's without case (`FUN_00198b80`), erases it, and when it was the form's fills the form from place 0
of what is left -- or empties it (the string at 0x3eead8) -- then rebuilds the list. The form is filled the same way in
all three and in `LobbyConnect`: a variable is set only when the place has a record; the two valves take the record's
bytes, 0 past the list, through their watchers.

**CompareValues** `FUN_00274db0` (D:L121617-121672) over its builder's record (`FUN_00274fc0` D:L121675-121724:
`VALUE1` / `UIVAR1` at +0x10 with +0x11 set for a variable, `VALUE2` / `UIVAR2` at +0x12 / +0x13, `CASE_INSENSITIVE`
+0x14, `COMPARE_AFTER_FORMATTING` +0x15): the form's two uses are `VALUE1 INPUT_STRING` against `VALUE2 "-1"`.
**PruneUIVarSpaces** `FUN_00278370` (D:L123368-123404): the spaces at both ends of a string variable cut.
**NetCensorText** `FUN_002776e0` (D:L122958-122979): on the network with the LAN lobby down, the variable's text to the
lobby's text filter (`FUN_002f4df0`; SVC-23's); its argument's stand-in for the input is `$1` (0x3eeb58), not
`INPUT_STRING`. **LobbyLogout** `FUN_0027dcc0` (D:L126223-126238): the lobby state byte `DAT_0044f3d0` -- 0 answers 1;
0x12 answers 0; any other asks the logout (`FUN_002fa560`) and answers 0 (ONL-10's).

**VerifyPatchLevel** `FUN_002766b0`: R153.7. **LobbyConnect** `FUN_00276780` (D:L122454-122545): with the LAN lobby
down, the first universe of the name -- none, or a status word of 0 (`FUN_002fd7e0` D:L199853-199872: the red dot of
research 147 R147.7 cannot be connected to), answers 0; else R153.6, and the answer is the connection's
(`FUN_002e0030` D:L182591-182762: 1 when it starts one, 0 while one is in flight; its DME callback at 0x2e0440 is
`j FUN_002efe20` with state 12). With the LAN lobby up it copies LANPLAYERNAMEVAR into PLAYERNAMEVAR and answers the
LAN connect's (`FUN_00304420`).

The chapter's other names are answered by earlier tasks or stay declared: `PERSONA_ENTRY_COMMANDS`, held to ONL-33's
pin by `tools/test/personaEntryCommands.test.ts`. `UNIVERSE_ENTRY_COMMANDS` now names ONL-06 for `VerifyPatchLevel` and
`LobbyConnect` (they were declared for ONL-05 and ONL-07).

## 3. The form over the machine (`personaScreen.test.ts`)

The rig (`personaRig.ts`) is ONL-04's with PLAT-11's pad a frame at a time, PLAT-17's keyboard over the disc's
`UiParams.rdr` typed through its USB queue, PLAT-23's cues, MENU-01a's card rows, and this task's rows over an account
list the test fills; it runs on the disc or the committed fixtures (CI). 25 tests.

| step | what the scripts do | what is held |
|---|---|---|
| the build, an empty list | `check_store_password` (`SecurePassword` 0: `Store_Password.op4` -> NO); `OnLoginRoomstart` (the list disabled, hidden and moved; `gender_val` #596; the three `...Changed` valves 0); `CheckConnectEnable` (no name: PASSWORD, HOMETOWN, GENDER, CONNECT disabled, `gender_val` hidden) | no "not implemented" outcome; PLAYER NAME lit with #598; the rows' enabled bits; the strip on NO; the list's three `-1` rows (`A_35`) |
| PLAYER NAME, CROSS | `set_player_name`: `.DINK`, the list enabled, active and shown, MENUFADER to 0.75 | the list visible, its first row lit (`A_36`); DOWN moves it; TRIANGLE (`CancelPersonaChoice`) hides it, the fader back to 0 |
| a `<New Persona>` row, CROSS | `ChoosePersona`: `CompareValues` true -> `GetTextInput(PLAYERNAMEVAR)`; `PersonaChanged` 1 | the keyboard: `CREATEPLAYERNAME`, `_455_EnterPlayerName_MSG`, 14 characters / 31 bytes, no double quote (`A_37`); a fifteenth key refused |
| ENTER | `OnSKBApply`: the name not yet saved -> `SaveAvailable` 1, the password and hometown cleared, PLAYERGENDER 0; `UpdateAcctInfo`; `CheckConnectEnable` | the name in the form and the account list, the list's first row `0`, the three rows enabled, Male shown, CONNECT dark (`A_38`) |
| ENTER on a name already saved | `MUISPersonaExists` true -> `GetMuisPersonaInfo` by name | no second record; the saved hometown and gender in the form |
| PASSWORD, CROSS | `set_player_password`: `GetTextInput(PLAYERPASSWORD)`, `PasswordChanged` 1 | `_604_EnterPassword_MSG`, 12 / 31; the SECURETEXT one `*` a character; CONNECT enabled; under NO the account list holds no password |
| SAVE PASSWORD, LEFT / RIGHT | the YES box checked: `enable_store_password` (`SecurePassword` 1, `SaveAvailable` 1, `UpdateAcctInfo`); NO: `disable_store_password` | the strip's selection, the valve, the list's record |
| HOMETOWN, CROSS | `set_player_hometown`; `OnSKBApply`'s `NetCensorText(PLAYERHOMETOWN)` | `_605_EnterHometown_MSG`, 20 / 63, empty allowed; the row dispatched |
| GENDER, CROSS | `set_player_gender` | Male / Female, the valve, no keyboard |
| a saved persona | `LobbyConnect`'s prefill before the build | the name in the form; with no password the cursor on PASSWORD with #599 (the recomp's `02_persona.png`); with one, on CONNECT, the strip on YES (PC KNOWN [persona-headless]) |
| a saved row, CROSS | `GetMUISPersonaInfo` by place | that persona in the form, the list hidden |
| a saved row, CIRCLE | `DeletePersona`: #603 with the literals `No` / `Yes` -> `AreYouSure`; 2: `DeleteMUISPersona`, `CheckConnectEnable`, `SaveAvailable` 1 | No keeps it; Yes erases it, the form takes the next; on `<New Persona>` nothing |
| three saved personas | -- | no `<New Persona>` row |
| CONNECT | `register_new_account` (§6) | #606 with a password typed, then #831; NO: `dlgNetConnect` built |
| TRIANGLE | `leave_player_name_screen`: `memcard_operations`, `LobbyLogout`, `SWITCHMENU(PREVIOUS_SCREEN)` | back on SELECT UNIVERSE |

**The way in** (the second suite): on SELECT UNIVERSE, CROSS on the universe runs `select_server` --
`VerifyPatchLevel(INPUT_STRING)`, the popup #614 (kept), WAIT 0.5, the form's three variables cleared, PLAYERGENDER 0,
`LobbyConnect(INPUT_STRING)` -- and the event MP_SUCCESS runs `server_connected`: `SWITCHMENU(dlgNetPlayerName.rdr)`.
With no lobby the row posts MP_SUCCESS itself (`LOBBY_CONNECT_PLACEHOLDER`); with one handed in, SELECT UNIVERSE stands
under #614 until its MP_SUCCESS. A universe naming another patch level switches to `dlgDownloadPatch.rdr` (ONL-05; OC-2
ruled none for now, OT.R17: ours names no level).

## 4. The score

`tools/test/personaScore.test.ts` runs the form on the disc through the rig with the disc's faces, PLAT-04's tables
and the page's banks (`pageUiTextures`: UIMP, UI2D, UIBF, UISK and the font bank), draws each state through PLAT-14's
drawer and scores it with PLAT-30's scorer (`captureScore.ts` `judge`), each frame against its own state's capture
(W9.R8). Every bitmap and glyph is drawn (`undrawn` is the 3D pass alone).

| reference | the state | score | control | matched |
|---|---|---|---|---|
| `logs/parity/s4_pcsx2/A_35_persona.png` (PCSX2, 640 x 480; the 4:3 correction, W7.R7) | the empty form, PLAYER NAME lit | **99.8** | 76.0 | yes |
| `scripts/parity/refs/persona.png` (the harness's title crop, 245 x 24: the frame grey at 320 x 224, the box [5, 8, 250, 32] of `refs.json`) | the same frame | **96.9** | 75.5 | yes; 46.16 % of its pixels equal |
| `A_36_personalist.png` | the list open, its first row lit, the form dimmed to 0.75 | **99.9** | 93.2 | yes (the dimmed frame is near black: the margin is 6.7) |
| the same | the list's panel alone (200 x 150 at (168, 127)), the rest masked | **99.7** | 42.0 | yes |
| `A_37_namekbd.png` | the name keyboard open over the form dimmed to 0.5 | **99.1** | 79.5 | yes |
| `A_38_named.png` | `socomp` typed, PLAYER NAME lit | **99.8** | 75.8 | yes |
| `A_39_pw.png` | six `*`, PASSWORD lit | **99.8** | 76.7 | yes |
| `logs/parity/s17_q2_logoff/online1/02_persona.png` (the recomp, 640 x 448) | the saved persona `socomc`, PASSWORD lit and empty | **99.6** | 76.0 | yes; 55.08 % of its pixels equal |

**Not pixel-exact (N20).** Against the recomp's frame the shapes land on the same pixels (block 0, mad 0.0072) and the
shades differ at the glyphs' and quads' edges -- PLAT-14's `GS_SPRITE_COVERAGE_READING`, `UI_TEXTURE_FILTER_READING`
and `GS_MODULATE_BLEND_READING` (research 112 §9), as on LOGIN (research 144 §7); what would raise it is a GS-level
comparison of one textured quad, PLAT-14's.

**The keyboard (R153.10).** Before this task the `A_37` frame scored **86.0** (control 79.5, not met), its cause the
page's banks: the drawer reported `SkbBackground: no bitmap Skbbg_LC.tif` and `SkbKey: no bitmap SkbHighlight.tif`.
`UISK_TXR.ZED` holds the twelve keyboard bitmaps (research 119 §2) and no dialog's `LIBRARY` names it: the menu state's
load (`FUN_001f4860`) reads the keyboard's file (`FUN_0038d6a0`) and then opens `ui/assetlib/uisk` (0x3e2dc0) and
`common/assetlib/font` (D:L54818-54821). `FRONT_END_TEXTURE_STEMS` now holds `UISK`. The keyboard's title is its
request's `Purpose`, a caption name; the page's `SoftKeyboardFrontEnd` was handed no `locText` and drew the name
itself, so `frontEnd.ts` now hands it the tables (`captionTextOf`). `A_37`'s cursor bar is in its blink's other half.

**The manifest.** `online.persona-form` gains `A_38_named.png` (the block's acceptance names it; 4 -> 5 captures, the
manifest's total 183 -> 184, `goldenManifest.test.ts`'s pin moved) and its recomp frame is marked looked at; the three
rows `online.persona-form`, `online.persona-list` and `online.name-keyboard` carry a note with these numbers. No capture
is copied.

**The browser** (2026-10-04; Chromium over Playwright, Vite on 5390, the match server on 8854 with a scratch
`DATA_DIR`; `?devmode&menuflow=dlgNetPlayerName.rdr&server=ws://localhost:8854/ws`, and through
`menuflow=dlgNetServerSelect.rdr`): the canvas's own 640 x 448 pixels score 99.9 (`A_35`), 99.9 (`A_36`), 99.1
(`A_37`), 99.8 (`A_38`) and 99.9 (`A_39`) -- the unit frames up to the lit row's glow phase. Looked at and not pinned:
the write-down notice 98.2 against `A_41_afterconnect.png` and the save prompt 99.8 against `A_42.png`, both ONL-07's
acceptance. The run typed a name and a password, answered #606, #831 YES and slot 1, and read the card's record in
localStorage (`HOST ""`, `NAME socomp`, `PASSWORD { length: 0 }`, `SAVEPASSWORD 0`; the typed password nowhere in
storage); a reload in the same context showed the name prefilled with PASSWORD lit and empty. The frames stay in the
implementer's scratch folder.

## 5. The page (`personaHost.ts`)

`connectPersona(host, { machine, uiVars, libmc, menu, universes, parts, standing })` makes the account list, registers
`PersonaCommands` and OPT-05i's `CardCommands`, and answers `FrontEndSession.persona`.

**The card (R153.8).** `PersonaCard` (research 135) gains three members for a caller that reads and writes the file
itself: `restore(data)` (what `load` does after its Read), `setLogins(logins)` (the list in memory replaced by the
form's personas, each as `personaFromLogin` makes a record, a held persona keeping its PROFILES; nothing written) and
`contents()` (the file `saveLogin` would write). The page's `CardConfigFile` is `contents`: `setLogins` over the
account list, then `contents()`; `restore`: `PersonaCard.restore`, then the account list replaced. The file's other
modules are kept as read.

**OT.R61 (SAVE-PASSWORD, 2026-10-17).** `loginFromAcct` hands each record to the card as the strip says: under YES
SAVEPASSWORD 1 and the password's length, under NO 0 and none (§5a). *Was, until 2026-10-17 (OT.R17):
`loginFromAcct` handed every record to the card as under SAVE PASSWORD: NO (`SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`):
no length, no token, SAVEPASSWORD 0; the next login found the strip on NO and PASSWORD lit and empty.*

**Adaptations, each labelled, none the original's:** `PERSONA_LOAD_ADAPTATION` (the list is read from slot 1 when the
session is made: the console reads it in the boot's `LoadConfig`, which the page's boot stubs);
`PERSONA_MALFORMED_DISCARD_ADAPTATION` (a file whose personas do not parse is said in the console in the place of
"Error loading data", OPT-05f's, and the next save writes the list in memory); `PERSONA_FORM_CARD_ROWS_ADAPTATION`
(R153.11: the twelve rows of the save chain are the real ones while the form is the dialog built; elsewhere the boot's
stubs answer as before, and the three rows no stub answers -- IsMemcardSaveOK, SaveConfig, MC_CreateIconFiles -- answer
what the table answered unimplemented; the page hands the stubs in as `standing`, so `connectPersona` is called after
the `Opener` is made); the
deep link (`readsUniverseFirst`: the universe list is read before the session for `menuflow=dlgNetPlayerName.rdr` as for
SELECT UNIVERSE, and `entered` runs `LobbyConnect`'s form half for its first universe, with no connection and no
MP_SUCCESS). *(2026-10-05, ONL-07, research 157 §5 and §10: `entered` now starts the lobby client's connection too, so
CONNECT can log in from the deep link; and `PERSONA_LOAD_ADAPTATION` reads the first slot that holds a save -- slot 1,
then slot 2 -- where it read slot 1 alone.)*

**HOST (OC-3).** A persona is filed under LOBBY_HOST and LOBBY_PORT as the universe entry gives them
(`PERSONA_HOST_PLACEHOLDER`): with SVC-05's placeholder universe an empty DNS and port 0. The owner's ruling on what
the browser stores settles it; a change of either orphans the saved personas, as moving the server's address does on
the console (PC KNOWN, the personas-per-server row).

## 5a. SAVE PASSWORD: YES honoured (SAVE-PASSWORD, MISSION OT.R61's game half, 2026-10-17)

Written 2026-10-17 by SAVE-PASSWORD (web sprint 41; the brief `../plans/briefs/2026-10-17-save-password.md`); the
ruling is MISSION OT.R61 (on the console batch 3's branch at 7affb64ba until it lands). Every claim here is **reading,
pending review** (source inspection; nothing measured on the original running).

**The original's path (R153.12, R153.13).** The strip runs `enable_store_password` / `disable_store_password`
(`SecurePassword` 1 / 0, `SaveAvailable` 1 unless `DoNotChangeSaveAvailable`, then `UpdateAcctInfo`); `FUN_002fd0d0`
nulls the password under NO (0x2fd0ec), so the list keeps a held one in memory (R153.2); the card's writer keeps it only
under YES (D:L199263-199265); the next boot's reader hands it back (D:L199229) and `LobbyConnect` puts it in
PLAYERPASSWORD (D:L122497-122500) with the strip on YES (D:L122520-122532). The SECURETEXT draws one `*` a character
(`FUN_0036aff0` D:L265383-265411); `OnLoginRoomstart` lights CONNECT, and `register_new_account` skips #606
(`PasswordChanged` 0): one CROSS, no keyboard. A NO after YES logs in with the password PLAYERPASSWORD still holds, and
the card's next write forgets it (or keeps it, if the player declines the save). A refused saved password: #545, back on
the form with it still drawn, CONNECT lit, refused again until retyped.

**The page's mapping.** The card keeps the length (R7; `@s2u/card` `personaFromLogin`, unchanged: its validator refusing
a length under NO is the writer's own rule). A YES record is read back as that many U+0001
(`SAVED_PASSWORD_STAND_IN_ADAPTATION`, viewer `personaHost.ts`: a character no key types -- `UiParams.rdr`'s twelve grids
and every USB key, proved in `packages/viewer/test/savedPassword.test.ts`), so the form draws and lights as the
original's. The login (viewer `connectHost.ts`, `pageLoginService`, `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`) sends a
stand-in as the server's quick sign-in (`{ name, savePassword: true }`, credentials included, research 132 §8.5 step 2)
whatever the strip says now -- the seat's word: the strip decides the card, never the wire, as on the console -- a
password typed under YES as the remembered login (step 1, included), and one typed under NO as
`{ name, password, savePassword: false }` with credentials omitted (**the merge controller's ruling, item 3 (a), product
track**: the cookie is never shown, so the console's remembered sign-in on the same account stays; the game sees no
difference, its card record deciding whether it ever presents the cookie). After the answer the stand-in stays in
PLAYERPASSWORD and the list (**the controller's choice, at parity**: the original keeps the saved password), and a
password typed under YES becomes the stand-in of its length **only when its login succeeds, and only in the record of
the HOST, PORT and NAME logged into** (`savedAtSuccess`, called by `connectLobby` at a successful answer with the
lobby's `connectedTo()`; the record found as the list finds it, `FUN_002fbce0` D:L199058-199066, the name with case;
SAVED-AT-SUCCESS-HOST, product track): a row of the same name on another universe keeps no stand-in, its typed password
let go at the answer, so a later CONNECT there sends a typed password (retyped, as every typed one is after an answer),
as the original sends the typed one -- never a quick sign-in by the other universe's cookie. *Was, until 2026-10-18
(LATER 101): every record of that NAME, whatever its HOST and PORT -- an in-session form of the divergence below, a
typed password left in universe A's row becoming the cookie's stand-in at a login on universe B.* Refused, a typed
password is let go like any other (`PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`, narrowed to typed passwords), so a wrong
one is never sent on as the cookie
(the review's F1: a wrong typed password does not clear a live cookie, `accounts.ts` :554, and the next CONNECT would
have logged in by it). *Was, until the review (2026-10-17): a typed YES password became the stand-in at every answer.*

**A departure, for the owner (LOGIN-CRASH, Trello k3r8P8nY, 2026-11-02; product track).** #545's handling kept the saved
password after -978, "as the original keeps it" (`connectHost.test.ts`'s pin until then; the controller's choice above).
Now, when the saved **stand-in** -- our cookie adaptation, not the original's password -- is refused with -978, it is
cleared from PLAYERPASSWORD and the record (`standInRefused`, as LATER 332's refused registration) and the password is
asked for, with the page's own labelled line (`SAVED_PASSWORD_LOGIN_LINE_ADAPTATION`, viewer `connectHost.ts`); SAVE
PASSWORD stays, and a typed login under YES saves anew. Why: -978 to the stand-in means this browser holds no remember
cookie that signs in (cleared, another browser or device), so kept, it was sent and refused at every CONNECT and counted
against the attempt limit. The game's #545 popup is unchanged, and a typed password's -978 (and any other refusal of the
stand-in, -997 among them) behaves as before. This departs from the original's "refused again until retyped" above for
the stand-in only; the attempt limit itself is unchanged (the ruling below).

**A known divergence, inherent to OT.R61's "length only".** The card is written at CONNECT (`memcard_operations`,
before `dlgNetConnect`), before the answer, and keeps the length alone; the cookie is issued only by a right password.
So after a reload a YES record stands for the last **right** password (the cookie), where the original's card keeps the
last **typed** one: a player who saved under YES and then typed a wrong password comes back logged in by the cookie of
the earlier right one, where the console would show #545. The page cannot do otherwise without storing the password,
which OT.R61 forbids; named here, not a placeholder (behaviour the ruling fixes). A stand-in handed to the registration
(the -998 question's YES) is answered -994 with no request (`SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION`). The stand-in
is pinned never sent, never stored and never logged (`savedPassword.test.ts`).

**A second live login (-997, H179).** The console's START awaits its plain logout before the hand-over
(`console/adapters/launch.ts` :175, bounded by `LOGOUT_TIMEOUT_MS`); a late one meets a session the game's login has
taken over, since a quick sign-in by the cookie is a right secret for `SESSION_TAKEOVER_ADAPTATION` (server
`accounts.ts` :555-576; `sessionTakeover.test.ts` :120-131), and its dead ticket answers -995 and touches neither the
game's session nor the cookie (`accounts.ts` :704-712). Only a session a socket holds is still -997 (#543).

**The attempt limit on the cookie path (the review's F4; answered).** Every login takes a slot by address and by name
before any check (`accounts.ts` :522), a refused quick sign-in keeps its slot (:563), and only a right secret gives the
slots back (:568); at `LOGIN_ATTEMPTS_PLACEHOLDER` (10) failures within `LOGIN_WINDOW_MS_PLACEHOLDER` (15 min) the next
login, the right password included, is -995 with HTTP 429 (`accountHttp.ts` :164) -- the client's "Login Failure"
(`FUN_002eefa0` D:L191179-191182). Pinned in `packages/central/test/accounts.test.ts` ("the attempt limit on the cookie
path"). **The merge controller's ruling: the 10-in-15 lockout stays** (it guards brute force), so a player whose saved
password is stale locks themselves out after ten CONNECTs -- #545 ten times, then "Login Failure", and even the right
typed password is refused until the window ends. No placeholder: the behaviour is unchanged; named for the owner in the
sprint 41 plan's Log.

**What stays open.** Whether `SaveAvailable` is 1 at the form's entry, so that #831 shows before a saved persona's
CONNECT (a capture, ONL-32); the console's half writing the card's YES record with the password's length
(redotcom-ea's, PERSONA-PERSIST).

## 6. What CONNECT dispatches (for ONL-07)

`register_new_account`: `.DINK`; with `PasswordChanged` 1, MENUFADER to 0.7 and the popup #606
(`_606_WriteDownName_MSG`, CONTINUE #457 -> `AreYouSure`); `memcard_operations` (blocking);
`SWITCHMENU(dlgNetConnect.rdr)`.
`memcard_operations`, with `SaveAvailable` 1: `CanWeSavePassword` (`MC_ChPort(0)`, `IsMemCardInserted`, `MC_ChPort(1)`,
`IsMemCardInserted`; `num_memcards`); with a card, `UpdateAcctInfo` and the library's `save_and_leave` -- `StoreOptions`
(declared, MENU-01: the table's constant 1), #831 YES / NO, the slot select #830, #829, #832 / #833, WAIT 1,
`Ensure_MC_Dirs_Fast`, `IsMemcardSaveOK`, `IsSpaceForSaveGameFile`, the overwrite warning #857 when the folder was
there,
#834 / #835, `Ensure_MC_Dirs` (on a card without the folder: `MC_MkDir`, `MC_ChDir`, `MC_CreateIconFiles`,
`SaveConfig`), `SaveConfig`, `KILLPOPUP`; with no card #607 (CONTINUE), else #608; then MENUFADER to 0.99 over 0.5 s.
`personaScreen.test.ts` pins the rows for a save declined; `personaHost.test.ts` runs the YES path to the card's file.

What the next wave finds: `dlgNetConnect.rdr` is built and its `init_socom_online` dispatches `LobbyLogin`
(not implemented: ONL-07), the status line a literal and the watchdog running; PLAYERNAMEVAR, PLAYERPASSWORD (the typed
password, in memory only), LOBBY_HOST and LOBBY_PORT hold what the login needs; `FrontEndSession.persona` is the
account list and the rows; `PersonaLobby` is the interface for the connection, its state byte, the logout and the text
filter, and handing `connect` in retires `LOBBY_CONNECT_PLACEHOLDER` (the lobby then posts MP_SUCCESS itself). The
prompts #606, #831, #830 and #857 already run on the page; their scores (`A_41`, `A_42`, `07_*`) are ONL-07's.

## 7. Unknowns, drifts, and where the sources disagree

- **Answered:** the block's two unknowns (R153.3, R153.4); research 135's `SAVE_PASSWORD_NO_CLEARS_READING` question
  (R153.2: no change -- R7's `{ length: 0 }` under NO stays the port's ruled record), its
  `PERSONA_SAME_LOGIN_REPLACES_IN_PLACE_READING` (rewritten where it stands; names compared with case) and
  `PERSONA_NO_MAXIMUM_READING` (the list has no cap; the form offers no fourth); research 147 §6's two words (R153.7).
- **`PERSONA_PORT_READING` (10075)** is the card API's default for a login that names no port; the form always names
  LOBBY_PORT, the universe entry's. The fixtures' 10075 is our Horizon's lobby port.
- **The block and the roadmap place #606 and the save prompt under ONL-07**; the set places them on this dialog, before
  the switch (`register_new_account`; the manifest's `online.write-down-notice` row already names `dlgNetPlayerName`).
  They run here; their scores stay ONL-07's.
- **The MP name's migration** (`s2u.mp.name`, research 135 §6: "owed to ONL-06 ... or a ruling") is **not done**: the
  keyboard has no initial-text argument (research 119 R119.3), so seeding it would be invented. The old key is left;
  what becomes of it is the owner's.
- **The #614 popup across the switch**: under the placeholder the form is built half a second after CROSS, and a frame
  caught at the switch shows #614 over the form's fade-up from black. What the console shows there needs ONL-07's
  connection and a capture.
- **Where MP_SUCCESS is posted** after the connect was not found (§8, `LOBBY_CONNECT_PLACEHOLDER`). *(Found
  2026-10-05, ONL-07, research 157 R157.2: state 12's SessionBegin reply, `FUN_002ee910`, D:L190919 -- one of the two
  sites §8 called "the clan's".)*
- **`NameIsVulgar`**: `OnLoginRoomstart` tests and clears it; its writer is not in this set (the connect screen's
  filter failure, ONL-07's to read).
- **The persona list keeps its focus** between two openings (the widget's own index); no capture shows a second opening.
- **`dlgLANConnect` no longer walks on**: its ONSTART's `LobbyConnect` was answered by the table's placeholder 1, which
  switched it to `dlgLANBriefingRoom`; the transcribed row answers 0 with no LAN lobby up (LAN is paused, OT.R1) and no
  universe of its argument's name, so the screen stays. `frontEndWiring.test.ts`'s count of start dialogs that reach a
  widget-bearing screen in 30 frames moves 89 -> 88 (its comment says so). The LAN lane's to take up with its lobby
  (`PersonaLobby.lanUp` / `lanConnect`).

## 8. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER` (`packages/viewer/src/personaHost.ts`) | was true: every record to the card as under NO | OT.R17 (the owner, 2026-10-04): the name is saved, the password is not, for now | retired 2026-10-17 by SAVE-PASSWORD (MISSION OT.R61): YES honoured through the remember cookie, the record's flag and length (§5a) |
| `PERSONA_HOST_PLACEHOLDER` (`packages/viewer/src/personaHost.ts`) | LOBBY_HOST and LOBBY_PORT as the universe entry gives them | OC-3 is the owner's; the console stores the lobby's resolved address | OC-3's ruling *Modern profile (MU-13e, 2026-10-09, controller's ruling): a persona made on the modern profile is filed under the first connectable universe entry's `dns` and `port` (`console/universe.ts`, read from the page's own `POST /texts/universe` with `UNIVERSE_QUERY`; the entry `LobbyConnect` `FUN_00276780` D:L122454-122545 would take); unreadable, creating is withheld.* |
| `LOBBY_CONNECT_PLACEHOLDER` (`packages/ui/src/screens/personaCommands.ts`) | answer 1, MP_SUCCESS posted at once | no lobby connection before ONL-07; where the connection's MP_SUCCESS is posted was not found (the two `(*DAT_0044f3c8)` sites of that string are the clan's, D:L186962, D:L190919) | ONL-07's connection handed in as `PersonaLobby.connect`; the state machine past `FUN_002efe20` read. *2026-10-05: done on the page (research 157 §2, §5: the lobby client's connect; MP_SUCCESS at D:L190919, which is this connection's, not the clan's); the constant stands for a host with no lobby* |
| `LOBBY_STATE_PLACEHOLDER` | 0 | no lobby state before ONL-07; `LobbyLogout` then answers 1 | ONL-07's state byte, ONL-10's logout. *2026-10-05: on the page the byte is the lobby client's (research 157 §2); the constant stands for a host with no lobby* |
| `NET_CENSOR_TEXT_PLACEHOLDER` | nothing asked, the text as typed | the text filter is SVC-23's; its reply's callback 0x2777c0 was not read | SVC-23 |
| `IS_NETWORK_ON_PATH_READING` | true | `DAT_0045a0c1`'s writers not followed; the form is reached only past `InitNetwork` | the byte's writer read |
| `ACCT_NO_LOBBY_HOST_READING` | `''` | the bodies pass a null HOST while LOBBY_HOST is no string; the form is reached only after `LobbyConnect` set it | -- (unreachable on the path) |
| `PRUNE_ALL_SPACES_READING` | `''` | the walk back over a string of spaces alone leaves the buffer (D:L123388-123393) | the byte below the buffer at run time (a trace) |
| `COMPARE_VALUES_UIVAR_ADD_READING` | looked up, not made | `CUIVarManager_Add` is called with no longevity argument (D:L121646) | the register's value at the call (a trace); no CompareValues of the path names a variable |
| `COMPARE_AFTER_FORMATTING_READING` | the host's caption parse; without one, as given | the formatting is a text object's set-string (`FUN_00363830`); no CompareValues of the form sets the byte | a dialog that sets it, with its task |

Adaptations, named and not ledger suffixes: `PERSONA_LOAD_ADAPTATION`, `PERSONA_MALFORMED_DISCARD_ADAPTATION`,
`PERSONA_FORM_CARD_ROWS_ADAPTATION` (§5); SAVE-PASSWORD's `SAVED_PASSWORD_STAND_IN_ADAPTATION` (viewer `personaHost.ts`),
`SAVED_PASSWORD_BY_COOKIE_ADAPTATION` and `SAVED_PASSWORD_REGISTER_REFUSED_ADAPTATION` (viewer `connectHost.ts`) (§5a). Reused, not added: research 135's seven, research 143's
`CONFIG_FILE_PLACEHOLDER` (the page's card absent) and research 139's `BOOT_CARD_STUB_PLACEHOLDER` (R153.11).
