# 157 -- CONNECTING (`dlgNetConnect`): the lobby client, the login, its error dialogs and the score (ONL-07)

Written 2026-10-05 by the online path's dating (the plan's Log dispatches wave 2 on that day; the host's own clock read
2026-10-03) for ONL-07 (`../roadmap/05-online-front-end.md` "ONL-07"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R16, OT.R17 and OT.R22). Sources: the disc's `RUN/UI/READERC.ZAR`
(`dlgNetConnect.rdr`, its record) and `RUN/UIZANIM.ZAR` (its set, decoded with `tools/dump-dialogs.ts --dialog` /
`--set` and ONL-33's chapter reader `tools/dump-online-dialogs.ts --dialog`, research 128 §4.5) through the
repository's readers; the retail decompilation `socom2_game.elf.decomp.c` under `SOCOM_PC_ROOT` (`D:L<n>` = its line;
cited, never pasted); the retail ELF read by address with `tools/elfImage.ts` (its strings, and the instructions of
the four state handlers and the two callbacks Ghidra left as labels); the US disc's `UIMnLOC.rdr`; our Horizon's source
read as files (`server/horizon-server/RT.Common/Types.cs`, `Server.Medius/Medius/MAS.cs`, `MLS.cs`); the archived
captures under `SOCOM_PC_ROOT` (`logs/parity/s4_pcsx2/A_41_afterconnect.png`, `A_42.png`, `A_05_online.png`;
`logs/parity/s17_q2_logoff/online1/07_after_connect.png`, `07_write_down.png`; and the frames of the connecting screen
this task found, §8), read-only, none copied. It stands on research 115-118 (the screens, the input, the widgets, the
popup), 128 (ONL-33), 132 (SVC-03: the accounts service), 143 (the card prompts), 153 (ONL-06: the persona form) and
156 (ONL-08: the agreement), and does not restate them.

The code: `packages/ui/src/screens/lobbyClient.ts` (the client's lobby object: the session flag, the state byte, its
queue and valve, the handlers of the states the connect and the login pass through), `packages/ui/src/screens/connectCommands.ts`
(`LobbyLogin`, `LobbyRegister`, the chapter's entry list, the password's end, the event poster),
`packages/viewer/src/connectHost.ts` (the page: SVC-03's endpoint, the wiring), `packages/viewer/src/frontEnd.ts`
(nine lines added and five changed; claimed in HANDOFF §3), `packages/viewer/src/personaHost.ts` (the deep link's
connection; the slot the list is read from), `packages/card/src/persona.ts` (`setLogins`' key),
`packages/ui/src/popup/popup.ts` (the text lines' alpha), `packages/ui/src/keyboard/softKeyboard.ts` (`forgetText`),
`packages/ui/src/screens/personaCommands.ts` (`AcctDb.forgetPasswords`; three docs). The tests:
`packages/ui/test/screens/lobbyClient.test.ts` (CI: every state), `connectCommands.test.ts` (CI: the two rows, the
password), `connectScreen.test.ts` over the rig `personaRig.ts` (CI on the fixtures: the machine over the disc's own
layout and set), `tools/test/connectEntryCommands.test.ts` (CI: the pin), `packages/viewer/test/connectHost.test.ts`
(CI), five cases in `packages/viewer/test/frontEnd.test.ts` (CI on the fixtures), three in
`packages/viewer/test/personaHost.test.ts`, one in `packages/card/test/persona.test.ts`, two in
`personaScreen.test.ts`, `tools/test/connectScore.test.ts` (dev host: the score), `tools/test/connectNote.test.ts`
(the fix round's N4 and §7; its two decompilation lines on the dev host). Confidence: **reading, pending
review** for every transcription; the frames are **scored** (§8), not pixel-exact; §11 lists the placeholder, the
adaptations and the readings touched.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R157.1 | **`socom_online_state` is the lobby's state byte**: the lobby object (0x44f370) keeps a queue of state bytes; its step `FUN_002dfe50`, called once a frame by the network update, takes one queued state a call -- the standing handler called with 3, the byte replaced, the new handler called with 1 -- and writes the byte into the valve through its watchers when it differs. The valve is acquired PERM by the lobby's init | D:L182517-182587; D:L182796; D:L210249, D:L210256 | §2 |
| R157.2 | **Where the connection's MP_SUCCESS is posted** (research 153's open question): state 12's entry sends SessionBegin; its reply's callback `FUN_002ee910` keeps the session key and posts MP_SUCCESS (the string at 0x3f4a10) through the lobby's event callback. Research 153 called that site "the clan's": it is this connection's. A refused SessionBegin queues state 10 and posts nothing | D:L190874-190924 (D:L190919) | §2 |
| R157.3 | **The login's branches**: `LobbyLogin` (`FUN_0027dd20`) answers 0 unless PLAYERNAMEVAR and PLAYERPASSWORD both hold text, else the lobby's login (`FUN_002fa5a0`: 0 with the session down; else state 7 queued, 1). State 7 sends AccountLogin; its reply `FUN_002eefa0`: -998 queues state 10; -997 posts MP_PLAYER_LOGGED_IN; -978 MP_INVALID_PASSWORD; any other failure MP_MEDIUS_ERROR with "Login Failure"; success queues state 16 | D:L126241-126269; D:L198285-198325; D:L191093-191283 | §2, §3 |
| R157.4 | **The block's unknown, answered: a new persona sends Login first.** -998 puts the lobby in state 10, which does nothing itself (0x2ee6c0 is `jr ra`); the screen's set shows "STATE: LOGIN FAILURE" and asks "Player Name not found. Would you like to register this Player Name?" (YES #253 / NO #246). YES runs `LobbyRegister` (`FUN_0027dde0` -> `FUN_002fa320`: state 3): the text filter on the name, AccountRegistration, then AccountLogin again; any failure of the three queues state 6 ("STATE: REGISTRATION FAILURE", WAIT 1, back), the filter's with MP_FILTER_FAILURE first | D:L126272-126300; D:L198228-198267; D:L190926-191090 | §2, §4 |
| R157.5 | **After the login: state 16, then 11.** State 16 closes the transport and connects the lobby server named in the login's reply; its callback queues state 11 and posts MP_JOIN_ROOM (state 2 on a refusal: MP_MEDIUS_ERROR with UIMnLOC 450's text). At 11 the set writes "STATE: LOGGED IN", runs `DownloadCharacterProfile` (blocking; its own second sequence stops it after 3 s), waits 1 s and switches to `dlgUsagePolicy.rdr` -- about 4 s on the screen, which is the state every archived frame of it shows | D:L191516-191667; the set; §8 | §2, §4, §8 |
| R157.6 | **Which failure shows which dialog** (N21 corrected): 543 MP_PLAYER_LOGGED_IN (-997), 544 MP_FILTER_FAILURE (the registration's name filter), 545 MP_INVALID_PASSWORD (-978), 547 the screen's own 90 s watchdog, MP_MEDIUS_ERROR its own text ("Login Failure"; UIMnLOC 450 from state 2) -- the last two followed by #515 LOADING... for 5 s. **546 is started by nothing** (its program `notify_connect_failure` is named by no binding, no program and no string of the ELF) and **548 is named by no dialog**. Every one returns by `exit_connect_screen`: `SWITCHMENU(PREVIOUS_SCREEN)`, the persona form | the set; the ELF's strings | §4 |
| R157.7 | **`UsagePolicyReturnScreen` is the set's own write**: `init_socom_online`'s second statement is `VALVE UsagePolicyReturnScreen = 1`, before `LobbyLogin`; no command sets it. ONL-08's ACCEPT then lands on `dlgWorldOfSOCOM.rdr` (held over the machine) | the set; `connectScreen.test.ts` | §4 |
| R157.8 | **The screen has no input**: no BUTTON binding in the layout or the set; its one control, `ConnectAnim`, is a TEXT built disabled (research 116 §17), so nothing is active and every press falls to bindings that do not exist | the layout; `connectScreen.test.ts` | §1, §4 |
| R157.9 | **The connecting screen has captures after all** (research 113: "no frame of `dlgNetConnect` was found"): six recomp frames at "STATE: LOGGED IN", found by comparing a drawn frame with 2,516 menu captures of the archive. The port scores **99.8** against the two scored (control 82.6 / 82.3; 62.76 % / 62.71 % of their pixels equal) | `tools/test/connectScore.test.ts` | §8 |
| R157.10 | **A popup's text draws at its face's opacity** (corrects research 118 §12.2 finding 3's corollary and PLAT-16's `POPUP_TEXT_ALPHA`): the wrapped text's setter gives each line node the object's font through `FUN_00362b20`, which rewrites an alpha of 128 to the face's opacity x 128. The port drew the lines at 128 -- white, where `A_41`, `A_42`, `A_05` and the recomp's `07_write_down.png` show them at the body text's level (peak 191-193 of 255 against 255). Fixed: the write-down notice 98.2 -> **99.8** (`A_41`), 98.6 / 98.7 -> **99.6** (the recomp's two); LOGIN's #581 against `A_05` 95.2 -> **99.8**, its panel band 87.4 (not met) -> **99.6** (met) | D:L273492; D:L260712-260723; `connectScore.test.ts`, `popupPlaceScore.test.ts` | §8 |
| R157.11 | **The first popup of a dialog is not brighter in the captures** (research 118 finding 3's open check for OPT-19): `A_41` (#606, the form's first popup) and `A_42` (#831, its second) peak at the same 191. With the lines at the face's opacity the port's two agree as well (the first's vertex colour 255 clamps where the second's 128 already reaches the glyphs' white) | the two captures | §8 |
| R157.12 | **What the service must answer** (for SVC-07a's reconciliation): the page uses SVC-03's endpoint as it stands -- `POST /account/login` `{ name, password, savePassword: false }` -> `{ status, ticket? }`; `POST /account/create` `{ name, password }` -> `{ status }`; `POST /account/logout` `{ ticket }` -> `{ status }` -- and on this base the match server's `main.ts` does not mount it | `connectHost.ts`; `packages/central/src/accountHttp.ts` | §6 |

## 1. The dialog as the original builds it

28 widgets: 27 objects and 1 control, the library `ui/assetlib/uimp`, the background `multplay_back.tif`, the font
`font_text_01`, the scripts `dlgNetConnect.rdr` and `uianim.rdr`. The objects, in file order: `eq_title_back` (16, 15;
`backsolid.tif` 610 x 46, OPACITY 0.2) and `eq_Lower_back` (16, 399; 610 x 32, 0.2); `DescFieldBack` (90, 90; 480 x 32,
0.3) and `Window` (90, 90; 480 x 190, 0.4); `bar_title` (30, 65; `font_titlebar_01`, (83, 72, 36), SCALE 0.95,
`_448_ConnectingNoDots_MSG` "CONNECTING"); `ONLINE_LOBBY_STATE` (325, 118; HCENTERED, (91, 72, 36), SCALE 0.9, the
literal caption "STATE: SESSION BEGIN"); `playername` (25, 428; UIVAR `PLAYERNAMEVAR`, LONGEVITY PERMANENT);
`ConnectBackAnim` (330, 230; a blank caption); `ConnectingAnim` (330, 200; HCENTERED, (128, 128, 128),
`_542_ConnectingSocom_MSG` "CONNECTING TO SOCOM II ONLINE"); the progress strip the DNAS screen also has --
`Progress_dummy` (200, 250; 260 x 20, 0.7) with its seventeen children (`Progress_back` `LittleBlack.tif`, the two
rules, the two leads and their ghosts on `goldstreak.tif`, `Progress_Scale1..5` and `Progress_Scale-1..-5`). The one
CONTROL is `ConnectAnim`, a TEXT at (315, 360) with a blank caption: built disabled, so the ring's index rests on it
and nothing is active (research 116 §17; `connectScreen.test.ts` reads the bit).

The bindings are nine, all on SCREEN and all events: ONSTART `init_socom_online`, `Connect_flash` and
`monitor_timeout`; MP_MEDIUS_ERROR `OnNetError`; MP_SYSTEM_MESSAGE the library's `OnSystemMessage`; MP_INVALID_PASSWORD
`OnInvalidPassword`; MP_PLAYER_LOGGED_IN `OnPlayerLoggedIn`; MP_FILTER_FAILURE `OnFilterFailure`;
MP_MEDIUS_FILE_DOES_NOT_EXIST `StopProfileDownload`. No BUTTON binding exists (R157.8). The set has 14 animations and
77 names; its valves are `socom_online_state`, `UsagePolicyReturnScreen`, `AreYouSure`, `ConfirmPopup` and
`NameIsVulgar`; its captions are UIMnLOC 448, 515, 542-547 and twelve literals (the eleven state lines and the register
question). `tools/test/connectEntryCommands.test.ts` holds all of this to ONL-33's pin.

## 2. The lobby object (`lobbyClient.ts`)

**The object** (0x44f370). +0x7d the session flag; +0x60 the state byte (`DAT_0044f3d0`, which `LobbyLogout` reads);
+0x64 a queue of state bytes, its count +0x78; +0x80 the valve `socom_online_state` (the string at 0x3f3a40), acquired
PERM by the lobby's init `FUN_002e0450` (D:L182796); the slots +4n hold state n's handler, filled by `FUN_002ed460`
(D:L190161-190218) and called by `FUN_002dfe10` (D:L182502-182514) with 1 at the state's entry, 2 each step it stands
and 3 at its exit. `FUN_002efe20` (D:L191670-191680) appends a state to the queue. The lobby's event callback
`DAT_0044f3c8(name, argument)` posts a named event into the dialog host; `FUN_00367810` (D:L263357-263396) then starts
each bound animation with the event's argument as its input string when it has one (`lobbyEventInto`).

**The step** `FUN_002dfe50` (D:L182517-182587): R157.1. The network update `FUN_0030da00` calls it once a frame on
either transport (D:L210249, D:L210256), `FUN_0030d9b0` once more (D:L210217), and a connect that cannot start once
itself (D:L182754). Its tail counts a UI variable at +0xec down (another screen's; not transcribed). On the page it is
called once a frame before the front end's own frame (`ConnectCommands.frame`); the order of the two inside the
original's frame was not read.

**The connect** `FUN_002e0030` (D:L182591-182762), `LobbyConnect`'s last call: with the flag clear -- the flag set, the
session key (0x66a4d0), the logged-in byte (0x66a8e0) and the state byte cleared, the address kept (0x66a9b0,
0x66aab0), the name and password buffers seeded with two fixed strings (0x3f39c8, 0x3f39d0), the queue emptied, the
handlers installed, the lobby's UI variables added (`FUN_002df6a0`), and the connection started with the callback at
0x2e0440, whose four instructions queue state 12; answer 1. With the flag set, answer 0. A connection that cannot
start queues state 2 and steps once.

**The states** (the set's caption for each; a state the retail table gives no handler has none here):

| state | the set's caption | entry | reply |
|---|---|---|---|
| 12 | STATE: SESSION BEGIN | `FUN_002ee830` D:L190874-190897: while no session key is held, SessionBegin (label 0x3f4a00) and one more request whose callback is empty (0x2efe00, `jr ra`) | `FUN_002ee910` D:L190900-190924 (its instructions read at 0x2ee910): success -- the key kept, MP_SUCCESS; failure -- state 10 |
| 7 | STATE: ACCOUNT LOGIN | `FUN_002eede0` D:L191093-191144: two requests of no consequence here (one carries the DNAS signature when it has one), then AccountLogin, 0x66 bytes, the name and the password 32 bytes each | `FUN_002eefa0` D:L191147-191283: R157.3 |
| 10 | STATE: LOGIN FAILURE, then the register question | nothing (0x2ee6c0 is `jr ra`) | -- |
| 3 | STATE: ACCOUNT REGISTRATION | `FUN_002ee9b0` D:L190926-190947: the text filter on the name | `FUN_002eea70` D:L190950-190982: result below 0, MP_FILTER_FAILURE and state 6; else AccountRegistration. `FUN_002eeb50` D:L190984-191012: failure state 6, success AccountLogin again. `FUN_002eec10` D:L191015-191090: failure state 6, success state 16 |
| 6 | STATE: REGISTRATION FAILURE | nothing (0x2ee6d0 is `jr ra`) | -- |
| 16 | (none: the line keeps the last) | `FUN_002efa90` D:L191516-191616: the transport closed, the lobby server of the login's reply connected | `FUN_002efc80` D:L191621-191667: -1 state 2; else state 11 and MP_JOIN_ROOM (0x3f4b68) -- state 15 instead when a game join is pending (0x66a5e8), another task's |
| 11 | STATE: LOGGED IN | `FUN_002ee540` D:L190777-190801: the lobby world's housekeeping (a request at entry, another every 300 s); **not transcribed** -- ONL-09's | -- |
| 2 | (none) | `FUN_002ee610` D:L190804-190820: the transport closed, MP_MEDIUS_ERROR with UIMnLOC 450's text (`FUN_00361b40(0x1c2)`) | -- |
| 0x12 | (none) | `FUN_002ee6e0` D:L190823-190847: with no session key, state 0; else SessionEnd | `FUN_002ee7b0` D:L190850-190871: the key cleared, state 0 on either status |
| 8, 4, 9, 5 | USER LOGIN, USER REGISTRATION, SCREENNAME LOGIN, SCREENNAME REGISTRATION | no handler is installed and nothing queues them: the set's branches for them never run in retail | -- |

Every status is read as `FUN_002f42d0` reads it: success is 0 (research 97 §1.3). The numbers are
`MediusCallbackStatus`'s (`Types.cs:68-136`): -1000 BeginSessionFailed, -999 AccountAlreadyExists, -998 AccountNotFound,
-997 AccountLoggedIn, -995 LoginFailed, -994 RegistrationFailed, -978 InvalidPassword, -966 Fail (`MEDIUS_STATUS`, held
equal to the server's `MEDIUS` by `connectEntryCommands.test.ts`).

**The login, the registration, the logout, the disconnect.** `FUN_002fa5a0` (D:L198285-198325): with the flag clear, 0;
else the account id reset to -1, the name and the password copied into the lobby's buffers (0x66a4f4, 0x66a514, 0x20
bytes each), the profile record reset, state 7 queued, 1. `FUN_002fa320` (D:L198228-198267): the same with state 3.
`FUN_002fa560` (D:L198270-198282): with the flag set, state 0x12 queued; the flag is the answer. `FUN_002dfdd0`
(D:L182488-182499), `LobbyDisconnect`'s call (research 147 had left it unfollowed): with the flag set -- the flag
cleared, the transport closed, the lobby's lists reset (`FUN_002df8e0`); the state byte stays until the next connect
zeroes it.

**What the port's transport changes** (each named in the code, none the game's behaviour):
`SESSION_BEGIN_ADAPTATION` -- SVC-03's endpoint has no session before the login, so SessionBegin is answered Success
where it would be sent and MP_SUCCESS follows as the callback posts it; `LOBBY_SERVER_ADAPTATION` -- our server is one
host, so state 16's second connection stands at once (the service's optional `enterLobby(ticket)` is where a step that
proves the ticket to the lobby goes); a request whose promise rejects is a request never answered, as a silent server
is on the console; a reply that arrives after `disconnect` or a new `connect` is dropped. The connect's own "cannot
start" branch (state 2 from `FUN_002e0030`) has no trigger on the page: an HTTP request needs no connection opened
first.

## 3. The rows (`connectCommands.ts`)

**LobbyLogin** `FUN_0027dd20` (D:L126241-126269): PLAYERNAMEVAR (0x3ee980) and PLAYERPASSWORD (0x3ee990), each added
TEMPORARY; either no string or empty, answer 0; else `FUN_002fa5a0` with both, whose answer is the row's.
**LobbyRegister** `FUN_0027dde0` (D:L126272-126300): the same two variables into `FUN_002fa320`. Both are registered
through PLAT-08's host (`ConnectCommands.register`); the table is not edited.

### 3.3 `CharacterProfile`: read, and left PLAT-34's

`DownloadCharacterProfile`'s two calls are the chapter's third bound function. `CharacterProfile` (`FUN_00275770`
D:L121919-122131; its record builder `FUN_00275d30` D:L122135-122195) takes one of eight words into the int at +0x10:
LOAD 0, SAVE 1, EXISTS 2, SaveToServer 3, WaitForServerSaveComplete 4, LoadFromServer 5, WaitForLoadComplete 6, DELETE
7 (none: 0xffffff, nothing done). The screen's two are **5 then 6** (`connectScreen.test.ts` reads the words): the
persona's weapon profile, a file named `WeapProfile_<account id>.dat` (the format at 0x3ee9e0), asked of the server's
file service -- `FUN_0033ea10` (D:L239541-239589: the file object not ready, 0; not open, opened and 0; open with the
account list's own checksum, MP_MEDIUS_FILE_DOES_NOT_EXIST posted and 0; else the download started, 1) and
`FUN_0033e850` (D:L239480-239538: 0 until the transfer is idle, then the records handed over, 1). Sub-ops 0, 1, 2 and
7 read and write the account list's profile records with the valves `primsel`, `secsel`, `equip1sel`..`equip3sel` and
`MpCharSet`: the ARMORY's loadout.

The row is the ARMORY's (PLAT-08's table: PLAT-34) and no file service exists on our server, so it is **not
registered here**: the table answers its not-implemented placeholder (true) for both calls, and the animation's own
second sequence (`WAIT 3`, `STOP DownloadCharacterProfile`) ends it after 3 s either way -- which is also what a
transfer that never completes would give. With a file service that answers "does not exist" (our Horizon's
`MLS.cs:3742-3793` does) the event's binding `StopProfileDownload` would end it at once and the screen would show
"STATE: LOGGED IN" for 1 s, not 4. The six archived frames of the screen all show that state (§8), which fits the 4 s
and does not prove it. `CONNECT_ENTRY_COMMANDS` declares the row with this reason.

### 3.4 The typed password's end (OT.R17)

The original keeps the password where it put it: PLAYERPASSWORD, the account list's record under SAVE PASSWORD: YES,
the lobby's buffer at 0x66a514, the keyboard's edit line until the next keyboard opens. The owner's ruling ("a typed
password goes once to the service ... and is held nowhere after") is applied as two named adaptations:
`PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION` (`lobbyClient.ts`: the client's copy is let go when the request that needs it
is answered) and `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION` (`connectCommands.ts`: when the login is over -- a success, a
refusal, a registration's end -- or on the first frame the connecting screen is no longer the dialog built while a
login was pending, PLAYERPASSWORD is set to the empty string as `ClearUIVar` empties a string, every record of the
account list in memory loses its password (`AcctDb.forgetPasswords`), and the keyboard lets its edit lines go
(`SoftKeyboard.forgetText`)). **Where it drops, by path:** success -- at the login's answer, before state 16; -997,
-978 or any other refusal -- at the answer, under the popup; -998 -- the client's copy at the answer, PLAYERPASSWORD
only when the register question is answered (`LobbyRegister` reads the variable again): YES, at the registration
chain's end; NO, on the first frame back on the form; a login never answered -- on the first frame back on the form
after the watchdog; a row that read a password and answers 0 (the lobby session down -- the persona form's deep link
with no universe reply never connects -- or no name) -- at once, in the row
(`PASSWORD_DROPPED_ON_REFUSED_ROW_ADAPTATION`, the fix round's N2: before it, that path kept PLAYERPASSWORD and the
account list's copy). What follows on the form is the original's own script on an empty variable: `OnLoginRoomstart`
lights PASSWORD and `CheckConnectEnable` leaves CONNECT dark until it is typed again -- where the console's form would
show the stars still. JavaScript cannot erase a string: "dropped" is the last reference from the page's state let go.
The persona form's scripts keep the typed text as `OnSKBApply`'s argument until the form is left; that map is cleared
at the switch to the connecting screen.

## 4. The screen over the machine (`connectScreen.test.ts`)

The rig is ONL-06's (`personaRig.ts`) with one option more: `connectService`, a `LobbyService` the test fakes, over
which the rig makes the lobby client and the two rows as the page does, hands the client to the persona rows as their
lobby, registers ONL-08's two rows over its session flag and `LobbyDisconnect` over its disconnect, and steps it before
every frame. The screen is reached as the original reaches it: CONNECT on the persona form. 21 tests on the disc or the
committed fixtures (CI).

`init_socom_online`, as the set has it: `CALL ScaleSet`; `VALVE UsagePolicyReturnScreen = 1`; `IF LobbyLogin` -- else
`exit_connect_screen` -- then a loop on `socom_online_state` writing the state line (`ONLINE_LOBBY_STATE.op1`), with
state 10's question, state 6's `WAIT 1` and exit, and state 11's way out: the line, `CALL DownloadCharacterProfile`
(blocking), `WAIT 1`, `SWITCHMENU(dlgUsagePolicy.rdr)`. Beside it run `Connect_flash` (the strip: `ScaleProgress`'s
sweeps, 0.3 s a step, looping) and `monitor_timeout` (`WAIT 90`, then `notify_unknown_failure`).

**The error-to-dialog table** (R157.6; each row forced through the fake service and held):

| what happens | the client | the screen | returns |
|---|---|---|---|
| AccountLogin answers -978 InvalidPassword | MP_INVALID_PASSWORD (D:L191174-191178); state stays 7 | `OnInvalidPassword`: **#545** "The password supplied does not match the registered password ..."; CROSS | the persona form, PASSWORD lit and empty |
| AccountLogin answers -997 AccountLoggedIn | MP_PLAYER_LOGGED_IN (D:L191169-191173); state stays 7 | `OnPlayerLoggedIn`: **#543** "The account information you provided is already logged in ..."; CROSS | the persona form |
| AccountLogin answers any other failure (-995 the attempt limit; an HTTP answer with no status, §5) | MP_MEDIUS_ERROR "Login Failure" (D:L191179-191182); state stays 7 | `OnNetError`: its own text, CROSS, then **#515** LOADING... for 5 s | the persona form |
| AccountLogin answers -998 AccountNotFound | state 10 (D:L191165-191168) | "STATE: LOGIN FAILURE", the fader to 0.7, the question; NO: `exit_connect_screen`; YES: `LobbyRegister` (answer 0: exit) | NO: the persona form |
| the registration's name filter answers below 0 | MP_FILTER_FAILURE, state 6 (D:L190961-190966) | `OnFilterFailure`: `init_socom_online` stopped, **#544** "... questionable content in the name ...", CROSS, `NameIsVulgar` = 1 | the persona form, PLAYER NAME lit (`OnLoginRoomstart` tests and clears the valve) |
| AccountRegistration fails (-999 a taken name, -994 its fields), or the login after it | state 6 (D:L190996-190999, D:L191029-191032) | "STATE: REGISTRATION FAILURE", WAIT 1 -- **no popup** | the persona form |
| nothing answers for 90 s | -- | `monitor_timeout`: **#547** "A valid link could not be established ...", CROSS, then #515 for 5 s | the persona form |
| the lobby server refuses after the login | state 2: MP_MEDIUS_ERROR with #450's text (D:L190804-190820) | `OnNetError`: "Connect failure. Press (CROSS) to return to the Main Menu.", CROSS, then #515 for 5 s | the persona form (the text's "Main Menu" notwithstanding: this screen's program exits to the previous screen) |
| `LobbyLogin` answers 0 (no session; an empty name or password) | -- | `exit_connect_screen` at once | the persona form |
| (nothing) | -- | **#546** "Could not connect to the SOCOM II server ...": `notify_connect_failure` is defined and never started | -- |

None returns to LOGIN or the main menu: `exit_connect_screen` hides the three animation texts, writes the valve
`socom_online_state` 0 (the lobby's byte stays), sets the state line to "STATE: Logout" and switches to
PREVIOUS_SCREEN. `OnPlayerLoggedIn` and `OnInvalidPassword` do not stop `init_socom_online` or `monitor_timeout`: a
player who leaves #543 or #545 up for 90 s gets #547 over it. The tests also hold: the state line's sequence on a
success (12 "", 12 SESSION BEGIN, 7 ACCOUNT LOGIN, 16 unchanged, 11 LOGGED IN), the 4 s (119 frames +- 2) between
LOGGED IN and the switch, ACCEPT landing on `dlgWorldOfSOCOM.rdr`, a retry after #545 sending the retyped password, the
nine pad buttons doing nothing, and the way in from SELECT UNIVERSE with the placeholder retired: `LobbyConnect`'s
connection, #614 kept up until the client's own MP_SUCCESS, TRIANGLE on the form holding on `LobbyLogout` until the
state is back to 0, `enter_server_select`'s `LobbyDisconnect`, and a second CROSS connecting again.

## 5. The page (`connectHost.ts`, `frontEnd.ts`)

`fetchAccountService(base)` is the `LobbyService` over SVC-03's endpoint at the page's own origin
(`pageAccountService` / `accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`, the fix round's N1: `server=` is
honoured for the account requests only under the developer's `?devmode` on a development build -- Vite's
`import.meta.env.DEV`, false in every built page -- so a crafted link cannot send a typed password to another host; the
universe list and the match keep ONL-04's `universeServiceBase`): `login` posts `{ name, password, savePassword: false }` to `/account/login`,
`register` `{ name, password }` to `/account/create`, `logout` `{ ticket }` to `/account/logout`, each as JSON with
`credentials: 'omit'` and `cache: 'no-store'`. It has no `sessionBegin`, `filterName` or `enterLobby`: the client's two
adaptations and its placeholder stand. `ACCOUNT_HTTP_REFUSAL_ADAPTATION`: an HTTP answer whose body carries an integer
`status` is that status whatever its code (200; 429 at the limits); an answer with none (403 a refused Origin, 404 no
endpoint mounted, 5xx, another shape) reads as MediusFail (-966) -- the login callback's "any other" branch, "Login
Failure"; no answer at all (the fetch rejects) is a request never answered, and the 90 s watchdog decides.

**SA-6b, 2026-10-18** (the server split, SA.R22 (3)-(4); product track, `GAME_DOOR_ADAPTATION`): `pinnedMatchSocket`'s
`PinnedSocketUrl` also carries `devDoors` -- whether this page may follow a placed game's loopback door -- by the same
rule as `server=` here (a development build under `?devmode`, not origin-only, `accountOriginOnly`), so the front end
passes nothing new (`frontEnd.ts` unchanged). `connectHost.ts` holds the door's pinned type (`PinnedGameDoor`, made only
by `pinnedGameDoor` over central's answer), the token's form (`isGameToken`, `GAME_TOKEN_CHARS_MAX`) and the game seat
(`GameSeat`, `isGameSeat`, `gameSeatOpen`, `gameSeatOf`, `voiceReportSocket`); §6 says what they carry.

`sessionLobby(host, parts, service)` makes the client and the rows over a session's parts (`FrontEndSession.connect`;
`FrontEndSession.lobby` is the client, null with no account service). `frontEnd.ts`'s lines: the import, the option
`account`, the two members, `LobbyDisconnect`'s hook into `UniverseCommands`, the three lobby hooks into
`UsagePolicyCommands` (`lobbyUp`, `lobbyState`, `lobbyLogout`: research 156's "no pass-through"), the client handed to
`connectPersona` as its lobby (retiring `LOBBY_CONNECT_PLACEHOLDER` on the page), the frame's call in `advance`, and
the page's service in `mountFrontEnd`. A deep link to the persona form (`menuflow=dlgNetPlayerName.rdr`) now runs both
halves of `LobbyConnect` (`personaHost.ts` `entered`), so CONNECT can log in from it.

**Our service against the brief's reading of OT.R17.** The brief has "our service creates the account on first login as
our Horizon does". SVC-03's does not: `AccountService.login` answers -998 for a name it does not hold and leaves the
create to `/account/create` (research 132 §6). On the page that is the original client's own path for -998 (R157.4):
the register question, and on YES the registration and a second login. Our Horizon's `CreateAccountOnNotFound`
(`MAS.cs:619`) makes the account inside the login and so never shows the question -- which is why no capture has it.
Either server is the original client's to talk to; which one ours is to be is the service's (SVC-07a's, or the
owner's): with create-at-login the question never appears and a new name's password crosses the network once. Against
a server that answers -998, as SVC-03's does, a new name's password crosses three times inside one CONNECT (the
login's -998, the registration, the login) -- **and so it does on the original client**, which is not a cost of
SVC-03's choice: the registration's request `FUN_002eea70` copies the lobby's password buffer (0x66a514, 0x20 bytes)
into AccountRegistration (D:L190975), and its reply `FUN_002eeb50` copies it again into the second AccountLogin
(D:L191007), after the first login of state 7 (`FUN_002eede0`). (Corrected in the fix round, N4: this paragraph and the
plan's Log had laid the three crossings to SVC-03 not creating at login; the Log is the controller's to correct.)

**2026-10-09 (web sprint 37, PTT-3; issue #100): the page's line for an absent account service.** A login screen's
account request -- `/account/login`, or `/account/create` (the register question's YES) -- answered 404 with a body that
carries no integer `status` now also shows a line of the page's own, `ACCOUNT_SERVICE_ABSENT_ADAPTATION` ("no account
service at this origin", `connectHost.ts`; §11), because each of #100's four hand-set pieces showed the same "Login
Failure" and the 404 one (a link without `?devmode`, whose logins go to the dev server's own origin) said nothing of its
cause. **The rule, a 404 with no status:** a 404 whose body carries `{ "status": <integer> }` is a service's own answer and
reads as that status, with no line; a 404 with none (no body, HTML, text, another JSON shape) is an origin with no
account service behind it. A match server started with no `DATA_DIR` shows the line **only when it is reached at the
page's own origin**: under `?devmode&server=` (cross-origin, PTT-1's link) the JSON POST's preflight `OPTIONS` gets the
same bare 404 (`server.ts` :956) with no CORS headers, so the browser rejects the fetch, no line shows, and the
connecting screen waits on its 90 s watchdog (`monitor_timeout`, #547), as for any request never answered (the review's
F2). SVC-03's handler never answers 404 itself (`packages/central/src/accountHttp.ts`
`accountHandler`: 403, 204, 405, 415, 400, 200, 429, 500); the match server's own 404 for a path no handler takes
(`packages/match/src/server.ts` :956, no `DATA_DIR` so no account handler mounted) has no body, and so has Vite's (7.3.6
`vite404Middleware`: `statusCode = 404; end()`). The content type is not read: the body's shape decides, as it does for
every other answer (`ACCOUNT_HTTP_REFUSAL_ADAPTATION`). **What does not change:** the reply the lobby client gets is still
MediusFail (-966), so the original's MP_MEDIUS_ERROR "Login Failure" (`FUN_002eefa0` D:L191179-191182) still shows on the
connecting screen; -978 (MP_INVALID_PASSWORD), -997 (MP_PLAYER_LOGGED_IN) and every other status the service answers
keep their own events and show no line; 403, 5xx and a bare 429 stay `ACCOUNT_HTTP_REFUSAL_ADAPTATION`'s alone; the
keep-alive's 404 stays the session lost (`KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`) and the logout's stays silent; every
request is the same URL, method, headers and body. The line shows beside the original's Login Failure, not instead of
it (#100's bar reworded 2026-10-09, the merge controller's word). **Where it shows:** the original's Login Failure is a
game dialog (`@s2u/ui`), so the line is not put on it: it is a `<p id="account-service-absent">` of the page's over the
front end's canvas (design system `s2u-notice`, no pointer), reading "This page, not the game (a browser adaptation):
no account service at this origin (<the account base>)", with `data-adaptation` naming the constant. **At the window's
top right** (moved there at the review, F1): in the 640 x 448 frame the top band (`eq_title_back`, (16, 15) 610 x 46)
holds nothing on `dlgNetConnect` or `dlgNetPlayerName` (their titles are at (30, 65)), while the foot holds
`dlgNetConnect`'s `playername` (25, 428) and the persona form's BACK and SELECT legends (470, 428), (540, 428)
(`RUN/UI/READERC.ZAR`, read with `tools/dump-dialogs.ts --dialog`), which the first place, the bottom left, covered on a
wide window; the Login Failure popup is mid-frame (`OnNetError`'s two POPUP records in `RUN/UIZANIM.ZAR`, read with
`readPopupRecord` in a throwaway probe, not kept: the panel at (150, 180) 340 x 200, then #515's at (150, 180) 340 x 80, no buttons); the playtest
badge holds the top left. It is made by `pageAccountService` on the page's document (`frontEnd.ts` unchanged: its call
takes the default), shown once however many 404s, and removed at the next login-screen answer that carries a status
**and at the lobby's disconnect** -- `LobbyDisconnect` (backing out) and the lobby's `close`, which the front end's
`stop` calls (`FrontEndSession.close`) -- through the page's lobby client (`connectLobby`'s subclass of `LobbyClient`,
whose `disconnect` also clears the line); while no lobby connection stands a 404 shows nothing, so a late answer after
the stop cannot bring it back (the review's F1: before, it could stay over the game's screens for the page's life). The tests:
`packages/viewer/test/connectHostAbsent.test.ts` (unit, jsdom); `connectHost.test.ts` unchanged and green. Not seen in
a browser (no browser run for this task).

## 6. The seam, and what the server must answer

**The seam.** A login's success carries the server's `ticket`. The lobby client keeps it in memory
(`LobbyClient.ticket()`), with the account's name (`account()`) and the flag (`loggedIn()`); the page reaches it as
`FrontEndSession.lobby` (and, for a browser run, `window.__frontEnd.session.lobby`). A later screen's service takes
`() => session.lobby?.ticket() ?? null` and presents it as its bearer (`/lobby/*`, the WebSocket's join). It is never
written to `localStorage`, `sessionStorage`, a cookie or the address (held by `connectHost.test.ts` and
`frontEnd.test.ts`), so a reload ends the page's hold on the session. `LobbyService.enterLobby(ticket)` is the place for
a step that proves the ticket to the lobby before the menu opens (state 16); `LobbyService.logout(ticket)` is called by
state 0x12 (`LobbyLogout`: TRIANGLE on the form, DECLINE, ONL-10's logoff).

**What the server must answer, exactly** (what `fetchAccountService` reads; SVC-03's `accountHttp.ts` as it is):

| request | body | answer the page reads |
|---|---|---|
| `POST <base>/account/login` | `{ "name": string, "password": string, "savePassword": false }`, `content-type: application/json`, no credentials | any HTTP code with a JSON body `{ "status": <integer> }`; on `status` 0 also `"ticket": <non-empty string>` (absent: logged in with no ticket). -998 unknown name; -978 wrong password; -997 already logged in; any other integer: "Login Failure" |
| `POST <base>/account/create` | `{ "name": string, "password": string }` | `{ "status": <integer> }`: 0 created; anything else is a registration failure (state 6) |
| `POST <base>/account/logout` | `{ "ticket": string }` | `{ "status": <integer> }`; either way the page ends its session |

and CORS for the page's origin (the endpoint answers only origins on its list, with a preflight for
`content-type: application/json`). **For the controller to reconcile with SVC-07a:**

1. **The endpoint is not mounted.** `packages/central/src/main.ts` on this base mounts SVC-05's texts and SVC-09a's
   invitations only; `/account/*` answers 404, which the page reads as "Login Failure" (§5). The browser run of §9 used
   a scratch launcher, outside the tree, that makes the same `MatchServer` with `accountHandler(new
   AccountService(ServiceStore.open(DATA_DIR)), { allowedOrigins, log })` pushed onto `http` beside the texts.
2. **The ticket's lifetime.** SVC-03's ticket waits `SOCKET_TICKET_MS` (60 s) for one `claimTicket`; unclaimed, the
   session ends. The menu path needs a ticket that lives as long as the session and can be presented many times; that
   is the bridge's session (research 159 §1), which ends 60 s after its last use unless a match socket holds it. The
   page now renews it (the fix round's N3): while the client holds a ticket and no game socket holds it
   (`LobbyClient.socketHolds`, the seam for the bridge's `attach` / `detach`), it posts `/lobby/update-user-state`
   `{ userAction: 1 }` with `Authorization: Bearer <ticket>` every `LOBBY_KEEPALIVE_MS` (30 s, half the server's 60 s),
   to the account requests' base; it stops at the logout, a disconnect or the ticket dropped. **NU-16, 2026-10-15:** it no
   longer stops while a game socket holds the ticket ("and no game socket holds it" above is this round's text, kept;
   `KEEPALIVE_THROUGH_MATCH_ADAPTATION`, `lobbyClient.ts`): the page heard a socket's close only on its next animation
   frame, so a window hidden when its game ended renewed nothing and was logged off 60 s after the close (viewer
   `sessionAfterMatch.test.ts`). A 401 is the session
   lost (`SESSION_LOST_READING`): the ticket and the logged-in flag dropped and state 2 queued -- MP_MEDIUS_ERROR with
   UIMnLOC 450's text (`FUN_002ee610` D:L190804-190820), shown by the built dialog's binding (`OnNetError` on the
   connecting screen and the persona form, `UIanim.rdr`'s `OnMultiplayerDisconnect` on `dlgWorldOfSOCOM`) and by
   nothing on `dlgUsagePolicy`, which binds no MP_MEDIUS_ERROR. The endpoint is not on this base: the controller
   reconciles the `LobbyService.keepAlive` seam with the bridge at the merge.
3. **A session outlives the page.** A reload drops the page's ticket while the server still holds the session: the next
   login of that name answers -997 (#543) until the session lapses. The console's server sees the connection drop; ours
   needs the bridge's rule (a heartbeat, a short idle lifetime, or the WebSocket's close ending it). The page calls
   `/account/logout` only through `LobbyLogout`. **NU-16b, 2026-10-15:** the bridge's idle for a session no socket holds
   is now `SESSION_SILENT_MS_READING` (300 s, research 159 §1, §8), so the page also logs off when it goes away: at a
   non-persisted `pagehide` the front end stops and its session's close sends the logout with `keepalive: true`
   (`PAGEHIDE_LOGOUT_ADAPTATION`, `connectHost.ts`; the listener in `frontEnd.ts`, cleared by the gameplay seat and
   applied at addee21d5), so a reload logs in at once (on a `?devmode&server=` link, cross-origin, a browser may drop
   the keepalive logout -- the adaptation's doc); a page gone without it (a crash) holds the name -997 for up to 300 s.
   **SESSION-TAKEOVER, 2026-10-15** (the owner's word, in the merge controller's seat): that logout is best-effort -- a
   whole-browser close, a crash, a phone backgrounding, sleep or a back/forward-cache keep loses it -- and the owner met
   -997 when signing in again after reopening the browser. The server now relieves it: a login whose secret is right
   (a password, typed or browser-filled, or a remember token -- the page sent no remember cookie then:
   `credentials: 'omit'`, `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`, the modern panel's `MU_REMEMBER_ME_ENABLED`
   false; *2026-10-17, SAVE-PASSWORD: the LOGIN now sends it for a saved persona, a right secret for the takeover too,
   research 153 §8, research 132 §8.5a*) for an account whose session no socket holds (no match socket, no map seat) ends that session, told as an
   expiry is told (logged off the room service), and logs in; only a session a socket holds is still answered -997
   (#543). The lobby page holds no socket (it renews by requests), so a second window open in the lobby only is taken
   over too and learns it at its next request: a 401 carrying `{ reason: 'taken-over' }` (server
   `SESSION_TAKEN_OVER_REASON`, the lobby endpoint's `bearerIdentify`). `SESSION_TAKEOVER_ADAPTATION` (server
   `accounts.ts`; research 159 §1, §8): a service adaptation (OT.R27) -- the original server's rule for a second login
   is unread. **The displaced window's message** (the merge controller's condition): the original's flow is unchanged
   -- the session lost queues state 2, MP_MEDIUS_ERROR with UIMnLOC 450 (`SESSION_LOST_READING`) -- and no caption of
   the original says the account signed in elsewhere (research 315 §2: #365 is the GAME LOBBY's errno-32 popup, #548 no
   script's, #1067 / #1068 the network library's), so the page asks why once (`LobbyService.sessionEndedWhy`) and, for a
   takeover, shows its own labelled line beside the dialog: "this account signed in elsewhere, so its session here ended"
   (viewer `connectHost.ts`, `SIGNED_IN_ELSEWHERE_ADAPTATION`), cleared at the next login's answer; the modern panel says
   "Signed out: this account signed in elsewhere" (`modern/session.ts`, `MU_SIGNED_IN_ELSEWHERE_ADAPTATION`). After a
   restart the reason is forgotten and the line does not show. `claimTicket` is called by no production path (the
   bridge holds a session by `attach` / `detach`, which leave it unclaimed), so after a match a session no socket holds
   idles out `SESSION_SILENT_MS_READING` (300 s) after its socket's close, or is taken over by a login before that.
4. **Create at login, or not** (§5).
5. **`savePassword`** follows the card's SAVE PASSWORD (MISSION OT.R61, SAVE-PASSWORD; research 153 §8): a saved
   persona not retyped is the remember cookie's quick sign-in, a password typed under YES the remembered login, both
   with credentials included; a password typed under NO goes `savePassword: false` with credentials omitted
   (`pageLoginService`, `SAVED_PASSWORD_BY_COOKIE_ADAPTATION`). *Was, until 2026-10-17: always false, no cookie sent or
   kept (OT.R17; `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`, retired).*

**HARD-SEAT, 2026-10-04 (research 169 measures 1 and 7).** (a) The game socket's half of the seam is built in
`NetPage` (`NetPageDeps.game`: the hello's `game` and `ticket`; `holds` is `lobby.socketHolds`, true at the welcome,
false at every close -- 4006, 4007, 4008, 1011, a network drop -- and at the page's own close; `netPageGame.test.ts`).
**No page code opens a game socket with a ticket yet** (the game lobby's screens, ONL-13 on, will pass
`session.lobby?.socketHolds` there): the helper and its test are built, the frontEnd wiring is not. (b) The socket that
carries the ticket is pinned to the page's own origin by the account requests' rule (`matchSocketUrl`, `connectHost.ts`:
`accountServiceBase`'s `server=` only under `?devmode` on a development build; `netSettings(search, location,
{ devBuild })`); a socket without a ticket -- the maps' rooms of `?mp`, `/testroom` -- keeps `server=` for development.
No other request on the universe base carries the ticket (the texts, the agreement, the news and the invitations send
none). The review's fix round made the pin a guard: a game's socket that carries the ticket takes its URL from
`pinnedMatchSocket` only (`NetPageDeps.game.pinned`), and `NetPage` refuses a game whose URL did not come from it -- or,
since SA-6b, from `pinnedGameDoor` with a game token (below); *was, until 2026-10-18: "a game's socket takes its URL
from `pinnedMatchSocket` only"*; a 4010 close
(`JOIN_FAILED_CLOSE`, a hello the server failed to answer) is retried, not final. (c) Item 3 above is bounded twice now: the bridge's 60 s idle end, and an absolute end
`SESSION_ABSOLUTE_LIFETIME_MS` (12 h, an owner's default) after the login whatever its use; the page meets either as
today, the keep-alive's 401 and state 2 (UIMnLOC 450).

**SA-6b, 2026-10-18: a placed game's door and game token** (the server split, `docs/plans/2026-10-17-server-split.md`
SA.R22 (1)-(4), (6); product track, labelled adaptations, the game's behaviour unchanged). With the split on, central
may place a lobby game on a validated host (SA-6); then its `/lobby/join-game` success answers `{ status, mediusWorldId,
door, token }` and the creator's `/lobby/world-report` that places it `{ status, door, token }` -- both or neither. The
page:
- reads the two as strings (`fetchGameLobbyService`; a token not of SA-4's form, or a field not a string, is not the
  shape), and the GAME LOBBY keeps the last successful answer's pair for the game held and hands it to the socket's
  `open` (`@s2u/ui` `GameLobbyCommands`, `GAME_SEAT_PASS_ADAPTATION`; the report's pair supersedes the join's,
  `HOST_REPORT_BEFORE_JOIN_ADAPTATION` re-filed: the host's socket opens on the report's answer);
- refuses **one without the other** on its existing paths, no socket opened: a join answer takes `FUN_002edba0`'s
  refusal branch (state 11; `joinRefused` asked with status 0, so an invite's join shows its own 'failed' line; else
  MP_MEDIUS_JOIN_GAME_FAILURE) and posts no `/lobby/leave-game`, as a status refusal does; a report answer is one not
  accepted, create_game's failure (#295);
- pins the **door** (`pinnedGameDoor`, `GAME_DOOR_ADAPTATION`): exactly `wss://<host>.play.socom2legacy.com/g/<game>`
  (H251; the host one DNS label, 1-32 letters, digits and hyphens, not starting or ending with one -- central's
  `HOST_NAME`, `packages/central/src/directory.ts`, mirrored, the packages sharing no code), or with `devDoors` only
  `ws://127.0.0.1:<5343-5349>/g/<game>`; the game the one joined; any other scheme, host, port, path, query or
  credentials refused, and a refused door opens nothing (`GameSocketHost.open` false: #425 for a joiner, #295 for the host);
- opens the socket on the door with the hello's `token` in place of `ticket` (`NetOptions.game` `{ id, token }`,
  `protocol.ts`'s hello `token`); the login's bearer stays pinned to the page's origin (SA.R5) and never goes to a door,
  a token never to the pinned socket (`GameSeat`: the pinned socket with the ticket, or a pinned door with the token;
  `isGameSeat` refuses a mixed seat and an unpinned URL of either kind -- `NetPage`'s guard now);
- hands the door and the token on at the match's start (`GameLobbyHandOff` = its fields and a `GameSeat`; `matchMount`'s
  `gameSeatOf`); every reconnect re-tokens since SA-6c (below) -- *was, at SA-6b: every reconnect reopened the door with
  the same token, a token older than its lifetime refused there and the seat ended*;
- a spectator's join the same (the token carries the join type, SA.R19).
A **local** game (the split off, or no host placeable: today's path) answers neither and is joined as before -- the
pinned socket, the login's ticket in the hello. **A gap, not neutral** (the seat's word): a placed game's voice report
(VOICE-LATE-3's devmode counters, `voiceReport.ts`) goes **nowhere** today -- `reportTo` is null for it
(`voiceReportSocket`, `GameSocketHost.reportTo`), since a door routes only `/g/<gameId>` (the SA-7 brief, 7b) and the
report's route keeps only the socket's host; the server split plan's SA-7d (VOICE-REPORT-DOOR; was LATER 106, filed by the online seat and promoted). The tests: viewer `gameDoor.test.ts`,
`gameLobbyDoor.test.ts`, `gameLobbySplit.test.ts` (over SA-6's `splitRig`, central's handlers in process),
`netPageDoor.test.ts`, `netClient.test.ts`'s hello; ui `gameLobbyDoor.test.ts` (unit; no browser run, no match server
reads the hello's `token` until SA-7a).

**SA-6c, 2026-10-18: the awaited re-token before a placed seat's reconnect** (SA.R22 (5), (7) as amended 2026-10-18 at
SA-6c's read; SA.R18, SA.R21 (a); product track, `GAME_RETOKEN_ADAPTATION`, the game's behaviour unchanged). A **placed**
seat -- one opened on a pinned door -- asks central before **every** reconnect, the lobby's (`GameSocketHost.frame`) and
the match's (`NetPage.retry`): `POST /lobby/game-token` with the login bearer on the page's own origin and the body exactly
`{ game }` (`fetchGameLobbyService.gameToken`; never to a door), through the seat's one provider (`gameSeatProvider`, made
at the lobby's `open` and handed on at the match's start, `GameLobbyHandOff.reseat` into `NetPageDeps.game.reseat`; the
client given back keeps it). No socket opens until it answers; one request is out at a time, the backoff paused while it
is, and a request that hangs is aborted and both paths' waits answered as the backoff at `GAME_RETOKEN_WAIT_MS_ADAPTATION`
(10 s), a later answer dropped -- as one after BACK, the page's close or the match's release is. Central's answers
(`packages/central/src/bridge.ts` `retoken`, `gameToken.ts` `RETOKEN_STATUS`, all over HTTP 200; `lobbyHttp.ts` 401):
- `{ status: 0, door, token }`: the seat opens on that door with that token -- the door pinned as the join's was
  (`pinnedGameDoor`; under SA.R13 it does not move, and a different door is followed only when it passes the pin) and the
  re-tokened seat taken only by its own identity (`isSeatOf`: `isGameSeat`, a door's `/g/<id>` and any id it carries
  the seat's game; the provider's pin refuses another game's door at the source), else the seat ends as 4008;
- `{ status: 0 }` alone: the game is no longer placed; the seat reconnects as a local game (the pinned socket, the login
  ticket read at the answer) and asks no more;
- -977 (the game gone) ends the seat as `GAME_ENDED_CLOSE` (4007) does -- #528 in the match, the lobby's `seatEnded(4007)`;
  -972 (banned), -966 (not held, `SEAT_HELD_ELSEWHERE_STATUS_ADAPTATION`), any other refusal, and a broken status-0 answer
  (a door without a token or the reverse, a door that fails the pin, a token not of its form) as `SEAT_FREED_CLOSE` (4008)
  does -- #365, `seatEnded(4008)` -- with no retry loop against a refused door;
- HTTP 401: the session lost (`lobby.sessionLost`), the signed-out path: the lobby's seat ends with no close
  (`seatEnded(null)`, as a ticket gone), the match's retries stop with no dialog of its own and the session's close ends it
  (`frontEnd` `sessionGone`, `LobbyMatch.stop`);
- anything else -- no answer, a 5xx, 400, 403, 415, 429, a body not of the shape, and 404 from a central without the split
  (the route is mounted only with it, `lobbyHttp.ts` `LOBBY_GAME_TOKEN_PATHS`; today's default) -- back into the backoff,
  the next attempt asking again.
A **local** seat never asks and reconnects as today. No token is kept between reconnects, so a token's expiry (central's
`GAME_TOKEN_LIFETIME_PLACEHOLDER`, 60 s) is never the seat's end; the adopted socket needs none until its first drop. The
tests: viewer `gameRetoken.test.ts`, `gameLobbyRetoken.test.ts`, `netPageRetoken.test.ts`, `gameLobbySplit.test.ts`'s
SA-6c case (central's route in process), `matchMount.test.ts`'s hand-over case (unit; no browser run).

## 7. What the login exposes (OT.R22; for research 169)

Stated plainly, as built.

- **In transit.** The name and the typed password cross the network in the body of `POST /account/login` (and, for a
  new name, `/account/create` and a second login, as the original client sends them: §5). They are protected only
  when the page is served over HTTPS (the account requests go to its own origin); a page served over `http:` -- a
  local run, a LAN playtest -- sends them in clear, readable by anyone on the path. The page does not refuse to log in
  over `http:`. This remains after N1.
- **Where the password is sent: the page's own origin (closed by the fix round's N1).** Before it the account
  requests' base was `server=`'s origin whenever the address carried one (`universeServiceBase`), so a link to the
  genuine page with `server=https://evil.example` made it post the name and the typed password to that host -- the
  login's sharpest edge, needing only a followed link. Now `/account/login`, `/account/create`, `/account/logout` and
  the keep-alive (which carries the ticket) go only to the page's own origin (`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`,
  held by `connectHost.test.ts`); `server=` moves them only under `?devmode` on a development build, which no built
  page is. **What remains:** `server=` still chooses the universe list, the user agreement's text and the match
  server, so a crafted link can show a player another host's universe list and news and send their game to another
  match server -- with no password, and (until the match socket carries the ticket, the bridge's) no ticket; the
  page's own origin is trusted as served (a compromised or look-alike site is outside this fix).
- **In the page's memory.** From the keyboard's ENTER until the login is answered (§3.4) the password is in
  PLAYERPASSWORD, in the keyboard's edit line, in the persona form's script argument, under SAVE PASSWORD: YES in the
  account list, and in the lobby client. Any script running in the page -- a browser extension, an injected script, a
  dependency -- can read it there while it is typed and until the answer; the page also exposes its session on the
  window (`__frontEnd`), which saves such a script the search. After the answer no reference is kept (and since N2
  none either when CONNECT runs with the lobby down), but JavaScript strings cannot be wiped and the engine frees them
  when it chooses. N1 does not touch this: it remains.
- **The session's ticket.** Kept in memory only, for the life of the page; readable by any script in the page for that
  whole time (`__frontEnd.session.lobby.ticket()`), which is the account's session while it lasts -- and, since N3, a
  session the page keeps alive for as long as it stays open. Not in storage, a cookie or the address: another site's
  page cannot read it, a shared link does not carry it, a reload loses it. Its lifetime on the server is the server's
  (60 s after its last use, renewed every 30 s by the page, §6). It remains readable by any script in the page.
- **What a hostile page on another origin can do.** Not call the endpoint from a browser (the Origin list refuses it,
  403) and not act as a logged-in player (no cookie, no ambient authority: nothing to forge a request with). It can
  frame or imitate the page; the page sets no frame policy of its own.
- **What a hostile client that is not a browser can do.** Send any `Origin` it likes: the Origin check is no barrier to
  it. It can guess passwords online at SVC-03's rate (10 failures in 15 minutes a name and an address, research 132
  §4), lock a name out for a window by spending that name's failures (research 132 §6a), learn whether a name exists
  (-998 against -978: the original's own distinction, and the register question shows it), and register names it does
  not want anyone else to have (10 creates in 15 minutes an address).
- **The passwords themselves.** No rule beyond the keyboard's caps (1 to 12 characters; H80 is the owner's): a
  one-character password is accepted. The server stores an argon2id hash.
- **What is not exposed.** The card's record holds the name, hometown and gender, never a password, a length or a
  token (ONL-06); the page writes no log line with a password or a ticket; no remember token exists to steal.
- **2026-10-05, the review's second round (left open).** (a) *The hidden tab* (`KEEPALIVE_HIDDEN_TAB_READING`, §11):
  Chrome slows a repeating timer in a tab hidden for more than 5 minutes to about once a minute, so the 30 s keep-alive
  against the server's 60 s idle end can lose the session of a player who leaves the tab behind USER AGREEMENT; not
  measured and not mended here. (b) *The match socket* still follows `server=` (`universeServiceBase`); once a ticket
  rides its hello it must take the same own-origin rule as the account requests (research 169 weak point 11, measure
  7) -- left to the game socket's wiring, not this round. Mended in the same round: the keep-alive's 403 and 404 end the
  session loudly (`KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`, `connectHost.ts`; 5xx stays alive-unknown, retried), a 401
  during a logout posts nothing (`LOGOUT_SILENCES_SESSION_LOST_ADAPTATION`), a 401 for a ticket a logout and a new
  login replaced is ignored, and the front end's `stop` logs the lobby out and disconnects it
  (`LOBBY_CLOSE_AT_STOP_ADAPTATION`, `lobbyClient.ts`), so no keep-alive outlives the page's front end.

## 8. The score

`tools/test/connectScore.test.ts` runs the persona form and the connecting screen on the disc through the rig with the
disc's faces, PLAT-04's tables and the page's banks, draws each state through PLAT-14's drawer and scores it with
PLAT-30's scorer (`captureScore.ts` `judge`), each frame against its own state's capture (W9.R8). Every bitmap and
glyph is drawn (`undrawn` is the 3D pass alone).

| reference | the state | score | control | matched |
|---|---|---|---|---|
| `logs/parity/s4_pcsx2/A_41_afterconnect.png` (PCSX2, 640 x 480; the 4:3 correction) | the write-down notice #606 over the form: `socomp`, six `*`, CONTINUE lit | **99.8** | 83.5 | yes |
| `logs/parity/s4_pcsx2/A_42.png` | the save prompt #831 after CONTINUE: YES lit, NO | **99.9** | 90.3 | yes |
| `logs/parity/s17_q2_logoff/online1/07_after_connect.png` (the recomp, 640 x 448) | the same notice, the saved persona `socomc`, five `*` | **99.6** | 83.4 | yes; 51.66 % of its pixels equal |
| `logs/parity/s17_q2_logoff/online1/07_write_down.png` | the same state: the harness shoots before and after it recognises the prompt | **99.6** | 83.4 | yes; 51.66 % |
| `logs/parity/persona_card_proof2/login/07_after_connect.png` (the recomp) | the connecting screen at STATE: LOGGED IN, persona `s17pc` | **99.8** | 82.6 | yes; 62.76 %; with the strip masked 99.8 (control 82.5) |
| `logs/parity/s16_l1b_step0/launch3/07_after_connect.png` (the recomp) | the same, persona `s27pa` | **99.8** | 82.3 | yes; 62.71 %; masked 99.8 (82.1) |

**The popup's text (R157.10, R157.11).** ONL-06's browser look had measured the notice at 98.2 against `A_41`; the unit
frame gave the same, and 98.6 / 98.7 against the recomp's two, with seven and four blocks over the scorer's threshold --
all on the popup's lines of text. In the port those lines peaked at 255 where `A_41` and `A_42` peak at 191 and
`07_write_down.png` at 193, the level of the form's own body text (the value `socomp` peaks at 189-191 in `A_39`). The
cause is one line of the wrapped text's setter `FUN_00379f70`: after it makes a line node (`FUN_00363e70`, D:L273467:
alpha 128) it hands the node the object's font through `FUN_00362b20` (D:L273492), and that function rewrites an alpha
of 128 to the face's `opacity` x 128 (D:L260712-260723) -- 0.7 for both faces of `fonts.rdr`. PLAT-16 had read "each
line node starts at 128 and nothing in the popup writes it" (`POPUP_TEXT_ALPHA`). With the lines at the face's opacity
the port's text peaks at 192. The same line moved LOGIN's #581 against `A_05` (`popupPlaceScore.test.ts`): the whole
frame 95.2 -> 99.8, the panel band 87.4 (under the bar, read by research 142 §3a as the 4:3 correction's resample) ->
99.6, and the odd result that two rows up scored better than the record's place (87.8 over 87.4) is gone -- every move
now scores lower (97.6 two rows up). Research 118 finding 3's corollary, "the first popup of each menu draws its text
at 255", stands as a statement about the vertex colour and is invisible: at alpha 0.7 a colour of 255 clamps where 128
already reaches the glyphs' white, and the two captures agree (R157.11).

**Not pixel-exact (N20).** Against the recomp's frames the shapes land on the same pixels (no block over the
threshold; mad 0.0084 on the notice, 0.0043 on the connecting screen) and the shades differ at the glyphs' and quads'
edges -- PLAT-14's `GS_SPRITE_COVERAGE_READING`, `UI_TEXTURE_FILTER_READING` and `GS_MODULATE_BLEND_READING`, as on
LOGIN and the persona form (research 144 §7, 153 §4).

**The connecting screen's captures (R157.9).** Research 113 and the manifest recorded none. A frame of the port's
screen was compared (`captureScore.ts` `thumb` / `thumbDistance`) with every 640-wide capture under `logs/parity` and
`scripts/parity` that is not an in-round walk frame (`w<n>_<n>.png`), a title-menu walk (`s<n>_*.png`) or a two-client
round frame: 2,516 compared, 108,245 passed over by name, 728 of another size or unreadable. Six recomp frames are the
screen, all at "STATE: LOGGED IN": `persona_card_proof2/login/07_after_connect.png`,
`s16_l1b_step0/launch3/07_after_connect.png`, `w10_virgin_b/05_password.png` (opened; the first two scored) and
`v6_20260925_160634/b/07_after_connect.png`, `s16_l1b_step0b/launch3/07_after_connect.png`,
`w10_virgin_b/lobby_fail_login_saved-password_empty.png` (by their distance; not opened). They are the harness's shot
"after CONNECT" on runs whose persona needed no write-down notice. No PCSX2 frame of the screen was found, and none of
its other state lines. The strip's lead stands wherever its sweep was at the shot; masking the strip moves no score.

**Found beside it, not this task's:** `logs/parity/pcsx2_psrewired/` and `pcsx2_psrewired_url/` hold PCSX2 frames of
the DNAS screen (`A_07_after_login.png`: LOCATING UNIVERSES with the DNAS logo and the trademark line; `A_w007.png`:
the same stage without them) -- frames the manifest's `state.dnas-connecting-authenticating` row and H70 say no archive
holds. They were opened and not scored; they are ONL-03's to weigh.

**The manifest.** `online.connecting` is a new row (three captures; `dlgNetConnect.rdr` leaves the no-frame list);
`online.write-down-notice` gains `07_after_connect.png` and its `07_write_down.png` is marked looked at; the two rows
and `online.persona-save-prompt` carry a note with these numbers; six states are owed to ONL-32 for the connect's
dialogs no capture shows (`state.connect-error-543`, `-544`, `-545`, `-547`, `-medius`, `state.connect-register-question`).
The pins of `goldenManifest.test.ts` moved: 59 -> 60 rows, 184 -> 188 captures, 13 -> 19 states, ONL-32's no-frame
dialogs 22 -> 21. No capture is copied.

## 9. The browser

A rendered browser run (2026-10-05 by the path's dating; headless Chromium over Playwright, automated keys; Vite on
5412; a scratch match server on 8868 with a scratch `DATA_DIR`, made as `main.ts` makes it with the account endpoint
mounted as §6 item 1 says; `?devmode&menuflow=dlgNetPlayerName.rdr&server=ws://localhost:8868/ws`). Evidence of its
own kind: not a unit test and not a playtest.

- **A new name** (typed through the page's keys and the soft keyboard): the form; CONNECT's notice #606 and the save
  prompt #831 (answered NO); the connecting screen at "STATE: LOGIN FAILURE" under the register question, YES lit;
  YES; "STATE: LOGGED IN"; after its 4 s, USER AGREEMENT with the persona's name and ACCEPT lit. The page's requests,
  in order: `POST /account/login`, `POST /account/create`, `POST /account/login`; the server's log lines: -998, 0, 0.
  At LOGGED IN the lobby held a ticket (43 characters), PLAYERPASSWORD was empty, and neither the password nor the
  ticket was in `localStorage`, `sessionStorage`, the address or a cookie. The address followed the flow
  (`.../persona/connect/agreement`, OT.R10).
- **The same name with a wrong password**, in a fresh page: #545 over "STATE: ACCOUNT LOGIN" (the server's line:
  -978); CROSS; the persona form again with PASSWORD lit and empty, CONNECT dark.
- **The right password while the first page's session was still live**: #543 (the server's line: -997) -- §6 item 3's
  case, met inside the unclaimed ticket's 60 s.

The canvas's own 640 x 448 pixels, scored with the same scorer (the persona's name differs from each capture's): the
notice 99.8 against `A_41`, the save prompt 99.9 against `A_42`, the connecting screen at LOGGED IN 99.8 against
`persona_card_proof2/login/07_after_connect.png`, the agreement 94.8 against `A_43` (ONL-08's whole-frame number, its
text the placeholder). Looked at and not pinned; the frames stay in the implementer's scratch folder. Not run: the
90 s watchdog, #544 (no filter to force it) and the default server without the mount (its 404 reads "Login Failure":
`connectHost.test.ts`).

## 10. ONL-06's review findings, and what is left

| finding (the plan's Log, 2026-10-04 ~22:10Z) | outcome |
|---|---|
| a persona saved to slot 2 is never read back | **fixed as far as the page's boot allows.** The console loads in the boot's `load_initial_config`: `find_a_memcard` takes the one card present, or asks #828 when both slots hold one, and `LoadConfig` reads that slot (`UIMemCardAnim.rdr`). The page's boot stubs that chain (BOOT-05 parked) and its virtual card always holds a card in each slot, so the console would ask every time and the page cannot. `PERSONA_LOAD_ADAPTATION` now reads the first slot that holds the save file (slot 1, then slot 2): a persona saved to slot 2 alone comes back; with a save in both, slot 1's, where the console would have asked (`personaHost.test.ts`). The prompt itself is BOOT-05's |
| `contents()` writes slot 1's other modules into slot 2's file | **refuted as a defect**: the console holds one config in memory, loaded from the slot chosen at boot, and `SaveConfig` writes every module of it to whichever slot the save's own select (#830) picks (`CSaveManager::Save`, research 143 R143.8). The page's file is the loaded slot's modules and the list, the same thing; with the load fixed the modules are the loaded slot's (held) |
| the #603 caption not held at the delete popup | **held** (`personaScreen.test.ts`: the popup's text is UIMnLOC 603's) |
| two of the nine `frontEnd.ts` lines have no session-level test | **held**: `locText: captionTextOf(...)` (the keyboard's title drawn through the tables: 34 glyph quads for "Enter Player Name", 48 for the name as written without them) and `standing: this.opener.stubs.entries()` (off the form the boot's stubs answer -- slot 2 empty; on it the page's card). Each fails with its line removed |
| the SAVE PASSWORD placeholder not named where the row toggles | **named**: `UpdateAcctInfo`'s doc (where both boxes' ONCHECK programs end) names `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER` and what the card and the memory keep |
| ONL-07's block orders connect before the write-down and the save prompt | **corrected** in the block with a dated line; the two prompts are scored where they run, on the persona form (§8) |
| a name typed with a trailing space leaves two records | **pinned and noted, not fixed: it is the set's own order.** `OnSKBApply` ends `UpdateAcctInfo(NA)`, `CALL CheckConnectEnable`, and `CheckConnectEnable`'s first row is `PruneUIVarSpaces(PLAYERNAMEVAR)`: the list files the name as typed, then the form's variable is cut, and the next `UpdateAcctInfo` files the cut name beside it. The original does not prune first (`personaScreen.test.ts`) |
| `setLogins` matches by HOST and NAME, not PORT | **fixed**: a login that names its port finds the record of HOST, PORT and NAME (`FUN_002fbce0`'s key, R153.1); one that names none (OPT-04a's callers) still finds it by HOST and NAME (`persona.test.ts`). `saveLogin` and `withPersona`, OPT-04a's own login API that the page's save does not use, keep the two-field key of research 135's reading |

**Unknowns left.**

- **The connecting screen on the console**: no PCSX2 frame; its lines other than LOGGED IN are unseen; whether the
  profile download really takes its 3 s on our Horizon or ends at once on FileDoesNotExist (§3.3).
- **The error dialogs' frames**: none archived (ONL-32, the manifest's six rows).
- **The frame's order**: the lobby's step against the menu's tick inside one frame (§2).
- **State 11's handler** `FUN_002ee540` and what it asks every 300 s (ONL-09).
- **A refused SessionBegin** leaves SELECT UNIVERSE under #614 at state 10 with no program to show it (the question is
  the connecting screen's); what the console's player then sees was not traced beyond the set.
- **The two requests state 7 sends before AccountLogin** and state 12's second request are not modelled (no
  consequence read on this screen).
- **`MP_SYSTEM_MESSAGE`** (the library's `OnSystemMessage`): nothing on the page posts it.
- **The route guard** `session` (`ROUTE_SESSION_PLACEHOLDER`, research 129) is still "no session": a session in memory
  does not survive the reload a deep link is, so it would change Forward alone; left for ONL-09 / ONL-10.
- **A deep link to the agreement** (`menuflow=dlgUsagePolicy.rdr`, a developer's start) no longer fetches its text on
  the page: `GetUsagePolicy` sends only while the lobby session is up, and now the page has the flag (research 156's
  `LOBBY_SESSION_UP_READING` foresaw it). The screen is reached with its text through CONNECT.

**What ONL-09 and ONL-10 will find.** `FrontEndSession.lobby`: the client at state 11 after ACCEPT's switch, with
`ticket()`, `account()`, `loggedIn()`, `connectedTo()`; `setHandler(state, fn)` for the states of the rooms and games
(13, 14, 15, 17, 0x13, 0x14 are installed by `FUN_002ed460` and unread here); `queueState`; MP_JOIN_ROOM already posted
once at the login (no binding on the connecting screen; `dlgWorldOfSOCOM` binds it). `LobbyLogout` is still registered
by both `UsagePolicyCommands` and `PersonaCommands`, both now over the one client (the persona's registers last); the
logout's states run to 0 and call `/account/logout`, but nothing here clears the session flag after it --
`LobbyDisconnect` does, on SELECT UNIVERSE's ONSTART, and the reboot path (`UnInitNetwork`) is ONL-10's.

## 11. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `NAME_FILTER_PLACEHOLDER` (`packages/ui/src/screens/lobbyClient.ts`) | no text filter: every name passes | state 3's filter on a new name (`FUN_00648678`, reply `FUN_002eea70`) is SVC-23's; the name rules are the owner's (H80; OT.R17: meanwhile the keyboard's caps only) | SVC-23's filter handed in as `LobbyService.filterName`; H80's ruling |
| `SESSION_LOST_READING` (`packages/ui/src/screens/lobbyClient.ts`) | a keep-alive answered 401 queues state 2: MP_MEDIUS_ERROR with UIMnLOC 450's text | state 2 (`FUN_002ee610` D:L190804-190820) is the client's one MP_MEDIUS_ERROR for a lobby connection that fails (the event's string is posted there and at the login's "Login Failure", D:L191181, only); which site the console's Medius library reaches when its lobby connection drops in mid-session is not traced | the Medius library's socket callback traced to the lobby's state byte |
| `KEEPALIVE_HIDDEN_TAB_READING` (a note only, no constant: §7, 2026-10-05) | the 30 s keep-alive is assumed to fire on time in a hidden tab | Chrome throttles a repeating timer in a tab hidden more than 5 minutes to about once a minute, which against the server's 60 s idle end can lose the session behind USER AGREEMENT; not measured **2026-10-15 (NU-16), met in a playtest:** the owner's server log (outside the tree; routes and times only) shows two pages renewing after a game's end, then one: the other sent nothing more -- no renewal, no poll, no 401, no logout -- until a fresh page and login 2 min 44 s later, so its script had stopped (a hidden window frozen or discarded by the browser, or closed). *NU-16's
  review (L1):* the lobby's request lines carry no account, so which page stopped is an inference from that account's
  fresh login; the game's third seat (the late joiner) renewed nothing after the game either -- probably a closed window,
  which would also explain its socket closing first (NU-17), not accounted for here; and the mechanism NU-16 fixed (a
  window hidden at its game's end, the keep-alive paused while a socket held the session) is a real latent defect, not
  the owner's case, whose two renewing pages both heard the close; its session ended 60 s after its last request and the lookup that followed found no one. No page code can renew from a stopped script; the mend left is this row's second, a longer idle for a session no socket holds (the original's server holds a silent client 300 s, research 159 §1), the server's and the seat's to decide (NU-16's report). **2026-10-15 (NU-16b), that mend built** on the merge controller's word (option (a)): an account's session no socket holds idles out after `SESSION_SILENT_MS_READING` (300 s, Horizon's `ClientLongTimeoutSeconds`, a reimplementation's figure; research 159 §1, §8), not 60 s, so a script stopped for less than 5 minutes keeps its player found (viewer `sessionAfterMatch.test.ts`); the cost, a reload answered -997 for those 5 minutes, met by the logout at a non-persisted `pagehide`, sent `keepalive` (`PAGEHIDE_LOGOUT_ADAPTATION`, `connectHost.ts`; its `frontEnd.ts` listener waits on the gameplay seat's clearance). Not measured in a browser: the row stays open | a hidden-tab run measured against the bridge's idle end, then a mend (a renewal on `visibilitychange`, or a longer idle while the page holds no socket) or this row retired |
| `ACCOUNT_SERVICE_ABSENT_ADAPTATION` (`packages/viewer/src/connectHost.ts`; 2026-10-09, PTT-3, #100) | "no account service at this origin": the page's own labelled line, beside the original's Login Failure, when a login screen's account request (`/account/login`, `/account/create`) is answered 404 with no integer `status` in its body | a browser adaptation with no original: the console's transport carries a status or nothing; a 404 with no status is an origin with no account service (Vite's dev server, a static host, a match server with no `DATA_DIR` reached at the page's own origin; cross-origin its preflight fails and no line shows), which SVC-03's handler never answers (§5, 2026-10-09); the lobby's reply stays MediusFail, so the original's screens are unchanged | nothing to settle: an adaptation; it stands while the page can be served from an origin with no account service (a development or static host) |

Adaptations, named and not ledger suffixes: `SESSION_BEGIN_ADAPTATION`, `LOBBY_SERVER_ADAPTATION`,
`PASSWORD_HELD_UNTIL_ANSWER_ADAPTATION` (`lobbyClient.ts`), `PASSWORD_DROPPED_AT_ANSWER_ADAPTATION`
(`connectCommands.ts`), `ACCOUNT_HTTP_REFUSAL_ADAPTATION` (`connectHost.ts`); added by the fix round:
`ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION` (`connectHost.ts`, N1: a browser adaptation -- the account requests, which
carry the typed password and the ticket, go only to the page's own origin, because ONL-04's `server=` takes any host
and a crafted link would otherwise send a player's password elsewhere; the console has no such parameter),
`PASSWORD_DROPPED_ON_REFUSED_ROW_ADAPTATION` (`connectCommands.ts`, N2: OT.R17 where a row answers 0) and the
keep-alive's period `LOBBY_KEEPALIVE_MS` (`lobbyClient.ts`, N3: 30 s under the bridge's 60 s idle end; the console
holds a TCP connection instead); added by the review's second round (2026-10-05): `KEEPALIVE_REFUSAL_IS_LOSS_ADAPTATION`
(`connectHost.ts`), `LOGOUT_SILENCES_SESSION_LOST_ADAPTATION` and `LOBBY_CLOSE_AT_STOP_ADAPTATION` (`lobbyClient.ts`;
§7); added by PTT-3 (2026-10-09): `ACCOUNT_SERVICE_ABSENT_ADAPTATION` (`connectHost.ts`; its row above, §5); changed: `PERSONA_LOAD_ADAPTATION`
(`personaHost.ts`, §10). Earlier notes' names this task touched, each still in the code for a host with no lobby and
each with a dated line in its doc: research 153's `LOBBY_CONNECT_PLACEHOLDER` (retired on the page: the client's
connect and its MP_SUCCESS) and `LOBBY_STATE_PLACEHOLDER` (the client's state byte on the page); research 156's
`LOBBY_SESSION_UP_READING` (the client's flag handed in) and `LOBBY_LOGOUT_STUB_READING` (its state and logout handed
in; ONL-10 still owns the body); research 147's `LOBBY_DISCONNECT_READING` (`FUN_002dfdd0` followed). Reused, not
added: research 153's `SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER` (the login always sends `savePassword: false`;
retired 2026-10-17 by SAVE-PASSWORD, research 153 §8) and
`PERSONA_HOST_PLACEHOLDER`; research 118's `POPUP_FONT_READING` (the face whose opacity the popup's lines now take).
Added 2026-10-15 by NU-16: `KEEPALIVE_THROUGH_MATCH_ADAPTATION` (`lobbyClient.ts`: the keep-alive runs whenever the session
holds a ticket, a game socket or not). Added 2026-10-15 by NU-16b: `PAGEHIDE_LOGOUT_ADAPTATION` (`connectHost.ts`: the
logout sent `keepalive`, for the front end's stop at a non-persisted `pagehide`; §7 item 3). Added 2026-10-15 by
SESSION-TAKEOVER, on the server: `SESSION_TAKEOVER_ADAPTATION` (`accounts.ts`: a login with the right secret takes over
its account's session no socket holds; §6 item 3) and `SESSION_TAKEN_OVER_REASON` (the displaced ticket's 401 says why);
on the page `SIGNED_IN_ELSEWHERE_ADAPTATION` (`connectHost.ts`: the line beside state 2's dialog) and
`MU_SIGNED_IN_ELSEWHERE_ADAPTATION` (`modern/session.ts`) -- adaptations, no ledger row.

**2026-10-04 (C8-FIX, from `C8-card-online-services.md` (research wave 2026-10-04; held outside the tree, at the controller's) Q3; H85's default meanwhile).** The client's persona-name rules, as the tree already
enforces them (`keyboardDisc.test.ts` over the disc's `GetTextInput` block for `dlgNetPlayerName`; `PERSONA_NAME_MAX` 14
in `@s2u/card`): at most **14 characters and 31 UTF-8 bytes**; `NoDQuote` -- a typed `"` becomes `'`; the keyboard's grid
characters only; **no reserved-name list** (none in the ELF: reserved names were the original server's filter). No code
changed: the rules are the disc's block values already read, and the tests above hold them. They are H85's default until
the owner rules; a word list and reserved names stay SVC-23's. The second, silent filter at entry (`NetCensorText`, a
type 1 replace that writes the reply back into the field) is `NET_CENSOR_TEXT_PLACEHOLDER`'s (C5a), not done here.
