# 156 -- USER AGREEMENT (`dlgUsagePolicy`) and the invitations row's answer (ONL-08, SVC-09a)

Written 2026-10-04 for ONL-08 (`../roadmap/05-online-front-end.md` "ONL-08") and SVC-09a
(`../roadmap/06-online-services.md` "SVC-09a"), wave 1 of sprints 16 and 17 (`../plans/2026-10-02-online-path-target.md`,
OT.R16; OT.R6, OT.R8, OT.R17). Sources: `dlgUsagePolicy.rdr`'s layout and set as the repository's readers decode them
(`tools/dump-dialogs.ts --dialog dlgUsagePolicy.rdr`, `tools/dump-online-dialogs.ts --dialog dlgUsagePolicy.rdr`; ONL-33's
pin `tools/test/onlineDialogs.pinned.json`); `dlgWorldOfSOCOM.rdr`'s set by the same; the US disc's `UIMnLOC.rdr`; the
retail decompilation `socom2_game.elf.decomp.c` (`D:L<n>` its line, `FUN_<addr>` its functions; cited, never pasted);
the retail ELF's strings and words by address (`tools/elfImage.ts`); our Horizon's source read as files
(`server/horizon-server/` of the PC project); the archived captures `A_43_eula.png` (`logs/parity/s4_pcsx2/`, PCSX2
against our local Horizon), `08_eula.png` (`logs/parity/s17_q2_logoff/online1/`, the recomp) and the harness's title
crop `scripts/parity/refs/eula.png`. It stands on research 115-117 (the dialog host, input, the widgets), 128 (the
online dialogs, §4.6 and §4.7), 133 (SVC-05's texts: the policy is already served), 144 (how LOGIN was scored) and 147
(how SELECT UNIVERSE asks the server), and does not restate them.

The code: `packages/ui/src/screens/usagePolicyCommands.ts` (`GetUsagePolicy`, the reply, `LobbyLogout`'s stub,
`USAGE_POLICY_ENTRY_COMMANDS`); `packages/ui/src/screens/clanInvitations.ts` (the INVITATIONS row's client half:
`CheckMyInvites`, the received list, MY_CLAN_INVITES, `HasClanInvitations`); `packages/central/src/clanInvitations.ts`
(`POST /clan/invitations`), mounted in `packages/central/src/main.ts` beside SVC-05's texts; `packages/viewer/src/usagePolicyHost.ts`
and `clanInvitationsHost.ts` (the page's services); `packages/viewer/src/frontEnd.ts` (three lines: the option, the
registration, the service). The tests: `packages/ui/test/screens/usagePolicyCommands.test.ts`, `clanInvitations.test.ts`,
`usagePolicyScreen.test.ts` (the machine over the disc's own layout and set, from the disc or the committed fixtures:
it runs in CI), `packages/central/test/clanInvitations.test.ts`, `packages/viewer/test/usagePolicyHost.test.ts`, one case
in `packages/viewer/test/frontEnd.test.ts`, `tools/test/usagePolicyEntryCommands.test.ts`,
`tools/test/usagePolicyScore.test.ts` (the frame's score, dev host). Confidence: **reading, pending review** for every
transcription; the screen's chrome score is **met**, its text region **not met** by the owner's ruling (§1.7).

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R156.1 | **The dialog**: 11 objects and 3 controls on `multplay_back.tif`; `usage_policy` a WRAPPEDTEXT on UIVAR `UsagePolicy` (222, 167; 384 x 180, SPACING 20, the arrows); `playername` a TEXT on UIVAR `PLAYERNAMEVAR` (PERMANENT) at (25, 428); the CONTROLS `teletype_plate` (an IMAGE), `YesAccept` and `NoAccept` (literal captions ACCEPT, DECLINE); the set's seven animations | the pin; the screen test | §1.1 |
| R156.2 | **The chapter's eleven command lines are answered**: `GetUsagePolicy` and `LobbyLogout` (a stub with its cited answer) here; `SwitchMenu`, `PopUpDialog`, `ActivateButton` PLAT-10's; `SuspendMenuInput` PLAT-11's; `NetCnfClose`, `NetCnfUninit` ONL-01's; `RefreshRoomList` (ONL-11), `GetFriendInvitations` (ONL-24, parked) and `UnInitNetwork` (ONL-10) declared, the table answering each | `USAGE_POLICY_ENTRY_COMMANDS`; `usagePolicyEntryCommands.test.ts` | §1.2 |
| R156.3 | **GetUsagePolicy** (`FUN_002797c0` D:L123946-123953 -> `FUN_002f79f0` D:L196630-196652): only while the lobby session's +0x7d is set, UsagePolicy = "Retrieving Usage Policy.....", TempUsagePolicy = " ", the 0x2c request with the policy type 0 at +0x28; answer 1. The reply (`FUN_002f7ac0` D:L196655-196712) joins the chunks into an **array** -- TempUsagePolicy's string elements, then the chunk -- set into TempUsagePolicy until EndOfText, into UsagePolicy at it | `UsagePolicyCommands` | §1.3 |
| R156.4 | **+0x7d is the lobby session's flag**, set by `FUN_002e0030` (D:L182633-182634) from `LobbyConnect` `FUN_00276780` (D:L122535): the request goes only past ONL-07's connect (`LOBBY_SESSION_UP_READING`) | the ELF's callers | §1.3 |
| R156.5 | **The persona's name** is the UI variable `PLAYERNAMEVAR` (ELF 0x3ee980): the layout's `playername` TEXT shows it; `LobbyLogin` `FUN_0027dd20` reads it as the account name (D:L126251); ONL-06 writes it | the layout; D:L126251 | §1.1 |
| R156.6 | **ACCEPT**: `ForceUsagePolicyReturn` -- SOUND `.DINK`; `UsagePolicyReturnScreen` == 1 (dlgNetConnect's): STOP `menu_fade_up`, `SWITCHMENU(dlgWorldOfSOCOM.rdr)` (ONL-09's screen, built next by the machine); else `SWITCHMENU(PREVIOUS_SCREEN)` (R128.10) | the screen test | §1.5 |
| R156.7 | **DECLINE**: `ReturnToMMenu` -- `.DINK`, the #763 popup with #246 NO / #253 YES into `AreYouSure`; on YES (2): `SuspendMenuInput(3.0)`, `LobbyLogout`, `UnInitNetwork`, `socom_online_initialized` = 0, `NetCnfClose`, `NetCnfUnInit`, STOP `menu_fade_up`, `SWITCHMENU(REBOOT)` -- the relaunch to `dlgAfterErrorReboot.rdr` (N17's); NO closes the popup | the screen test | §1.5 |
| R156.8 | **LobbyLogout** (`FUN_0027dcc0` D:L126223-126238): state byte `DAT_0044f3d0` 0 -> 1; 0x12 -> 0; else the logout request (`FUN_002fa560`) and 0, a statement held until the state is back to 0. Stubbed here with that answer (`LOBBY_LOGOUT_STUB_READING`); ONL-10 owns the body | `UsagePolicyCommands.LobbyLogout` | §1.2 |
| R156.9 | **An open contradiction**: every capture of the agreement looked at (`A_43`; the recomp's `08_eula.png` of `s17_q2_logoff` and `blop_a`) shows ACCEPT lit on arrival with no press before the shot; the port's ring starts on `teletype_plate` (an IMAGE among CONTROLS, PLAT-11's `RING_ENABLED_READING`, traced in the ELF by research 144) and no pad press reaches a button -- the second instance of research 147 §6's drift, and here it blocks the pad: only a tap or a click (`MENU_TOUCH_READING`) can ACCEPT on the page | the screen test | §1.6 |
| R156.10 | **The score**: the chrome (the text region masked) **99.5** against `08_eula.png` and **99.7** against `A_43` (4:3), the title crop **95.9**, all met; the text region alone with the placeholder served **85.6** / **85.2**, **not met** -- the difference OT.R17 makes; with our Horizon's "EULA" served it scores 99.8 / 99.9 (the drawing measured) | `usagePolicyScore.test.ts` | §1.7 |
| R156.11 | **The invitations row's request** is CheckMyClanInvitations, Lobby 0x64 (research 97 §2's row "CheckClanInvites"): `dlgWorldOfSOCOM`'s ONSTART `init_screen` runs `CheckMyInvites` (id 85, `FUN_0027a3c0` D:L124390-124397 -> `FUN_002e8650` D:L187564-187581: the received list cleared, +0x28 zero, page size 999 at +0x2c); the row's `TurnOnInvitations` loops `IF HasClanInvitations` (id 130, ELF 0x277950 `j 0x2e8770`: `DAT_0044f704 != 0`) | the set; the ELF | §2.1 |
| R156.12 | **None, as the client reads it**: our Horizon answers an account with no undecided invitation with one reply, MediusNoResult (1), EndOfList, every other field zero (`MLS.cs:1553-1560`); `FUN_002e86c0` (D:L187584-187610) takes NoResult as a failure and rebuilds MY_CLAN_INVITES as `[" ", "No Invitations", " "]` (`FUN_002e8780` D:L187613-187665) with the count 0: the row draws `_794_NoInvitations_MSG` and is disabled | `MyClanInvitations`; `clanInvitations.test.ts` | §2.2 |
| R156.13 | **The match server answers it** at `POST /clan/invitations` (`{ start, pageSize }` -> `{ replies }`), mounted beside SVC-05's texts with the same Origin rule; every account has none while SVC-08 is parked -- the true answer (OT.R8) | `packages/central/test/clanInvitations.test.ts` | §2.3 |
| R156.14 | **The block's citation is off**: SVC-09/SVC-09a cite `MLS.cs:1930-2004`, which in the PC project's `server/horizon-server` is InvitePlayerToClan (1930), RespondToClanInvitation (1969) and the start of RevokeClanInvitation (2004); CheckMyClanInvitations is `MLS.cs:1521-1568` there (`:1518` in the older `research/horizon-server` copy research 97 cites) | the file | §2.3 |

## 1. USER AGREEMENT (ONL-08)

### 1.1 The dialog

The layout (`READERC.ZAR`, decoded data): the background `multplay_back.tif`; the title band `eq_title_back` and the
lower band `eq_Lower_back` (`backsolid.tif`, OPACITY 0.2); `bar_title` `_756_UserAgreement_MSG` (font_titlebar_01,
(83, 72, 36), 0.95); `InfoTextX` `_150_Select_MSG`; `playername` on `PLAYERNAMEVAR`; `Mint_plate` (FILENAME " ": no
bitmap, OPACITY 0.3, 184 x 158); `ContentChangeBkg` and its WRAPPEDTEXT `ContentChangeTxt` (a literal of 45 bytes, the
"GAME EXPERIENCE MAY CHANGE DURING ONLINE PLAY" the captures show); `UpDownTextBkg` and its child `UpDownText`
`_761_UseBtnsScrollAgreemt_MSG`; `usage_policy` (WRAPPEDTEXT on `UsagePolicy`, caption `_762_RetrievingAgreement_MSG`,
the arrows `arrow_top.tif` / `arrow_botm.tif` at OFFSET (175, -45) / (175, 150)); CONTROLS `teletype_plate` (IMAGE,
409 x 300 at (206, 75), OPACITY 0.3), `YesAccept` (308, 330) and `NoAccept` (513, 330), 140 x 32, `pop_butt.tif` /
`active_back.tif` with TEXT_GLOW. The bindings: SCREEN ONSTART `retrieve_usage`; `MP_SYSTEM_MESSAGE` `OnSystemMessage`
(`UIanim.rdr`); UP and DOWN (each bound for UP and for the DOWN state) `scroll_policy_up` / `_down`; the buttons' CROSS
`ForceUsagePolicyReturn` / `ReturnToMMenu`, their LEFT and RIGHT `activate_no` / `activate_yes`.

The set (`UIZANIM.ZAR` `dlgUsagePolicy.rdr`, 7 animations): `retrieve_usage` = `RefreshRoomList`, `GetFriendInvitations`,
`GetUsagePolicy`; `scroll_policy_up` / `_down` = `usage_policy.op4` / `op5` (WRAPPEDTEXT's `Scroll_Up` / `Scroll_Down`,
research 117 §13.8); `activate_yes` / `activate_no` = `ActivateButton`; `ForceUsagePolicyReturn` and `ReturnToMMenu`
(R156.6, R156.7). The texts (`UIMnLOC`): 756 USER AGREEMENT, 761 the scroll help, 762 "Retrieving User Agreement...",
763 the decline question, 246 NO, 253 YES, 150 SELECT.

**The persona's name** (R156.5): the layout names `PLAYERNAMEVAR` with LONGEVITY PERMANENT; the string at 0x3ee980 is
the var `LobbyLogin` (`FUN_0027dd20`, D:L126251) and `LobbyRegister` (`FUN_0027dde0`) read as the account name. ONL-06
(a parallel stream) writes it; this task reads it only through the UI variable, and its tests set it.

### 1.2 The commands

`USAGE_POLICY_ENTRY_COMMANDS` answers each of the chapter's eleven lines, as ONL-04's list does; the tools test holds it
to ONL-33's pin. The two rows here are registered by `UsagePolicyCommands.register` (PLAT-08's registry; the table is
not edited). `LobbyLogout` is ONL-10's row (logoff); DECLINE needs it now, so its answer is transcribed and the request
it would send is a hook (`LOBBY_LOGOUT_STUB_READING`): with no lobby (the port before ONL-07) it answers 1 and the
chain runs on. `UnInitNetwork` answers the constant 1 (D:L126505-126515) through the table unimplemented, as the DNAS
and universe screens leave it. `RefreshRoomList` (id 42, its answer not constant: the table's
not-implemented placeholder, true) and `GetFriendInvitations` (id 206, the constant 1) are their tasks'; the rooms
stream (SVC-06) and the friends (parked) own what they send.

### 1.3 The request and the reply

R156.3 and R156.4 above, with the strings: UsagePolicy 0x3f5828, "Retrieving Usage Policy....." 0x3f5840,
TempUsagePolicy 0x3f5860, " " 0x3f5870, the status label "GetPolicyRequest" 0x3f5880. The request's session key
(0x66a4d0, 17 bytes at +0x15) is not sent by the page: the policy is the same for every player and SVC-05's endpoint
takes `{ type }` only. The reply's builder is the value builder `FUN_00333ae0` / `FUN_003339b0` (open a level) /
`FUN_00333610` (append a string) / `FUN_00333770` (close it into an array), set by `FUN_00386460`. So the agreement is
an **array** var: the WRAPPEDTEXT prints it element by element (`printUiVar`, research 147 R147.8: a string only when
it fits what is left of the 0x2903-byte buffer) and wraps it. A failure status changes nothing ("Retrieving Usage
Policy....." stays, as does a request never answered). Before the reply the WRAPPEDTEXT shows GetUsagePolicy's own
"Retrieving Usage Policy....." over the layout's caption #762.

### 1.4 The server and the page

The text is SVC-05's: `POST /texts/policy` with `{ type: 0 }` answers `{ chunks }`, 255-byte pieces, the last with
EndOfText (`serverTexts.ts`, research 133 R133.4, R133.6) -- nothing reimplemented. `usagePolicyHost.ts`'s
`fetchUsagePolicyService` posts it at ONL-04's base (`universeServiceBase`: `server=`'s origin, else the page's own) and
checks each chunk's fields; `FrontEndSession` takes `usagePolicy` and registers `UsagePolicyCommands` over it.

### 1.5 The machine (the screen test)

`packages/ui/test/screens/usagePolicyScreen.test.ts` runs PLAT-10's machine over the disc's `READERC.ZAR` and
`UIZANIM.ZAR` (the disc, else the committed fixtures) with the screens' rows, PLAT-11's input, MENU-01a's rows,
ONL-01's NetCnf rows and this task's two, and a fake policy service. Pinned: the captions; ONSTART's three commands
(the two left to their tasks, one request `{ type: 0 }`); the reply in `usage_policy` and the persona in `playername`;
"Retrieving Usage Policy....." while unanswered; DOWN / UP scrolling a long text by one SPACING (20) each; the arrival
focus on `teletype_plate` (§1.6); LEFT / RIGHT moving between the buttons; ACCEPT with `UsagePolicyReturnScreen` 1 ->
`dlgWorldOfSOCOM.rdr` built, with 0 -> `SWITCHMENU(PREVIOUS_SCREEN)` (a deep link: nothing to pop); DECLINE -> the
popup, NO staying, YES running the chain in the set's order and relaunching to `dlgAfterErrorReboot.rdr`. The deep link
stands for the original's entry from `dlgNetConnect` (ONL-07's), which sets `UsagePolicyReturnScreen` to 1; the test
sets that valve.

### 1.6 The arrival focus: open (R156.9)

> Superseded 2026-10-05 by FOCUS-RING (research 116 §17): an IMAGE is built with its enabled bit clear, so the ring's
> start steps past `teletype_plate` to ACCEPT, as the captures show; the pad reaches both buttons. The settled frame
> is now the ACCEPT-lit frame: §1.7's "settled, focus `teletype_plate`" rows read 94.8 / 99.5 / 85.6 against
> `08_eula.png` and 94.8 / 99.7 / 85.2 against `A_43` (they were 94.5 / 98.9 and 94.7 / 99.1). The text below is the
> reading as it stood on 2026-10-04.

The ring's start (`FUN_00367950`'s tail, D:L263735-263745) takes the first control of the list at +0x290 -- filled in
the layout's CONTROLS order (`FUN_001feae0`, a tail insert, D:L263631-263633) -- and activates it when its +0x48 bit
reader answers non-zero, else steps on (`FUN_003670d0`). Research 144 read the IMAGE class's +0x48 as the base's
reader, so `teletype_plate` takes the focus; the dispatch then gives UP and DOWN to the screen's scroll bindings and
LEFT and RIGHT have no binding on the plate, so no pad press reaches ACCEPT or DECLINE. The original does not behave so:
`A_43` (`online_login.py` waits 30 s and shoots, no press) and the recomp's `08_eula.png` frames (shot on arrival, then
one CROSS accepts: `online_login_ours.py` L1892-1894) all show ACCEPT lit. Either the IMAGE control's creation through
its spec's +0x10 (`FUN_003696d0` D:L264427-264492, the call at D:L264444) leaves bit 7 clear, or something else focuses YesAccept; not traced. It is
PLAT-11's reading to settle (research 147 §6 is the same question for `MainWindow`); this task does not change it. On
the page a tap or a click on ACCEPT works (`MENU_TOUCH_READING`); the keyboard and the pad cannot.

### 1.7 The score (R156.10)

`tools/test/usagePolicyScore.test.ts` (dev host: the disc and `SOCOM_PC_ROOT`'s captures, skipping without): the
dialog run on the disc with the disc's faces, the MP2 captions and the UIMP bank, drawn by PLAT-14's drawer
(`rasterizeUiDrawList`; undrawn: `Mint_plate`, whose FILENAME is " ", and the 3D pass), the persona each capture shows
set in `PLAYERNAMEVAR` (`A_43` socomp, `08_eula` socomc), 60 ticks (the fade is over by 45), then ACCEPT lit by the
set's own `ActivateButton(YesAccept)` (the captures' arrival focus, §1.6) and 30 ticks more. The text differs by the
owner's ruling (OT.R17: the placeholder until H73), so every frame is scored apart -- the **chrome** with
`USAGE_TEXT_REGION` [214, 128, 612, 326] masked, the **text region** alone (everything else masked) -- through
`tools/captureScore.ts`'s `judge` (bar 90, the black control's margin 5):

| reference | frame | whole | chrome (text masked) | text region alone | verdict |
|---|---|---|---|---|---|
| `08_eula.png` (recomp, 640 x 448) | settled, focus `teletype_plate` | 94.5 | 98.9 | 85.6 | chrome met; text not met |
| `08_eula.png` | ACCEPT lit | 94.8 | **99.5** (control 80.2) | **85.6** | chrome met; text **not met** (OT.R17) |
| `A_43_eula.png` (PCSX2, 640 x 480, 4:3 corrected) | settled | 94.7 | 99.1 | 85.2 | chrome met; text not met |
| `A_43_eula.png` | ACCEPT lit | 94.8 | **99.7** (control 80.1) | **85.2** (control 81.3) | chrome met; text **not met** (OT.R17) |
| `refs/eula.png` (title crop, 245 x 24; grey, 320 x 224, the `eula` box of `refs.json`) | ACCEPT lit | 95.9 (control 79.2) | -- | -- | met |
| `08_eula.png`, our Horizon's "EULA" served | ACCEPT lit | 99.6 | 99.5 | 99.8 | the drawing measured, not the port's text |
| `A_43_eula.png`, "EULA" served | ACCEPT lit | 99.8 | 99.7 | 99.9 | the same |

The text region's score is the placeholder's difference, reported and not rounded up; the whole-frame 94.8 passes the
bar only because the text is a small share of the frame, and is not offered as the screen's score. The last two rows
serve the captures' own text to measure the WRAPPEDTEXT's place, wrap and glyphs; the port serves the placeholder. The
visible differences inside the chrome: the help line `UpDownText` and ACCEPT's caption draw darker than the captures'
(their COLOR (91, 72, 36) and the glow's phase); not chased here. The golden manifest's row `online.user-agreement`
carries the numbers; `08_eula.png` is now looked at.

### 1.8 The browser look

2026-10-04, the lock FREE: Vite on 5395, the match server on 8860 (`npx tsx src/main.ts`, `DATA_DIR` in the task's
scratch folder, `ALLOWED_ORIGINS=http://localhost:5395`), Chromium over Playwright at
`?devmode&menuflow=dlgUsagePolicy.rdr&server=ws://localhost:8860/ws`. The server wrote the placeholder `texts.json`,
warned (H73) and logged the page's request (`texts`, op `policy`, HTTP 200). The page: `dlgUsagePolicy.rdr` at
`/main/online/dnas/universe/persona/connect/agreement`; `UsagePolicy` the one-chunk array of the placeholder agreement;
the screenshot shows USER AGREEMENT, GAME EXPERIENCE MAY CHANGE DURING ONLINE PLAY, the scroll help, the placeholder
text wrapped in four lines, ACCEPT and DECLINE (neither lit: the focus on `teletype_plate`, §1.6), SELECT bottom
right, and no name bottom left (`PLAYERNAMEVAR` unset: ONL-06 is not on this base). The screenshot stays in the
scratch folder (RS.R8).

## 2. The invitations row's answer (SVC-09a)

### 2.1 The request (R156.11)

`dlgWorldOfSOCOM`'s set: ONSTART `TurnOnInvitations` (`IF HasClanInvitations(NA)`: `EnableButton(invitations)`,
`invitations.op1(_476_INVITATIONS_MSG)`; else `invitations.op1(_794_NoInvitations_MSG)`, `DisableButton(invitations)`;
`WAIT 1`; `LOOP forever`) and `init_screen`, whose first sequence runs `GetMediusAnnouncements`, **`CheckMyInvites`**,
`ROOMLIST.op16`, the 30-s room refresh and `GetClan`. `CheckMyInvites` is the table's id 85 (`FUN_0027a3c0`) ->
`FUN_002e8650`: `FUN_002e9380(0x44f700)` clears the received list; the 0x30-byte request (MessageID, the session key at
+0x15, +0x28 left zero, 999 at +0x2c) goes through `FUN_00645c38` with the callback `FUN_002e86c0` -- Lobby 0x64
CheckMyClanInvitations by SVC-02's map (research 97 §2, its row "CheckClanInvites": the names csv's name for the same
`FUN_0027a3c0`). Horizon's `MediusCheckMyClanInvitationsRequest` reads +0x28 as Start and +0x2c as PageSize. The row
reads `HasClanInvitations` (id 130): ELF 0x277950 is `lui a0, 0x45; j 0x2e8770; addiu a0, a0, -0xc90`, and 0x2e8770
`lui at, 0x45; lw v0, -0x8fc(at); jr ra; sltu v0, zero, v0` -- the received count `DAT_0044f704` is not 0.

### 2.2 How the client reads the reply (R156.12)

`FUN_002e86c0` reads the 0x65 response (+0x18 status, +0x1c invitation id, +0x20 clan id, +0x24 response status, +0x28
message 200 bytes, +0xf0 leader id, +0xf4 leader name 32 bytes, +0x114 EndOfList: Horizon's
`MediusCheckMyClanInvitationsResponse` field for field). Status not 0 (`FUN_002f42d0` "CheckMyClanInvitations"):
`FUN_002e8780` at once. Status 0: kept when the response status is 2 or less (`FUN_002e9240` D:L187961-188001, once per
invitation id); at EndOfList with a non-empty list, `MP_MEDIUS_HAS_INVITES` (0x3f44d0) through the event sink
`DAT_0044f3c8`, then `FUN_002e8780`. `FUN_002e8780` sets MY_CLAN_INVITES (lobby +0xd0, added at the session's start,
D:L182219-182220): an empty list gives one row `[" ", "No Invitations", " "]` (0x3f3f18, 0x3f44e8); otherwise one row
per invitation, `["%d" of its id, its message, Undecided / Accepted / Declined / Unknown]` (0x3f4090, 0x3f40b0,
0x3f40a0, 0x3f40c0). So Horizon's none -- NoResult -- leaves the count 0 and the row "NO INVITATIONS", disabled. A
success that ended the list with nothing kept would write nothing at all; no server we know sends that.

`packages/ui/src/screens/clanInvitations.ts` transcribes this: `MyClanInvitations` (`check`, `reply`, `publish`,
`count`, `has`) and `ClanInvitationCommands` (`CheckMyInvites`, `HasClanInvitations`, `register(host)`), with
`CLAN_INVITATIONS_QUERY` = `{ start: 0, pageSize: 999 }`.

### 2.3 The server's answer (R156.13, R156.14)

`server/horizon-server/Server.Medius/Medius/MLS.cs:1521-1568` (read as a file): the account's invitations from the
database, only the undecided ones, paged; none -> one `MediusCheckMyClanInvitationsResponse` with
`MediusNoResult` and EndOfList (`:1553-1560`); the last always ends the list. Our match server answers the same at
`POST /clan/invitations` (`packages/central/src/clanInvitations.ts`): `{ start, pageSize }` (integers; anything else
400) -> `{ replies: [{ status: 1, clanInvitationId: 0, clanId: 0, responseStatus: 0, message: '', leaderAccountId: 0,
leaderAccountName: '', endOfList: true }] }`. While SVC-08 is parked no clan can exist, so no account holds an
invitation: this is the true answer, not a stand-in (OT.R8). The handler is its own file, mounted in `main.ts` by one
line inside the `DATA_DIR` block beside SVC-05's texts (unset, nothing is mounted: the deployed surface unchanged, H32),
with `textsHandler`'s Origin rule repeated (403 before the body, CORS for an allowed origin, a preflight, 405, 415,
400) and one log line per request (`clan`, `invitations`, the HTTP status, the address). Horizon refuses the request
without a logged-in session (`:1523-1529`); ours does not check it (`CLAN_INVITATIONS_SESSION_READING`).

The block cites `MLS.cs:1930-2004`; in the same file those lines are the invite, respond and (the start of) revoke
handlers, not CheckMyClanInvitations (R156.14). The blocks keep their text; their Today lines say where the handler is.

*2026-10-09 (SVC-08, research 262): clans can now be created, disbanded, looked up and handed over (`packages/central/src/clans.ts`,
`POST /clan/<op>`); no invitation can be made until SVC-09, so the none above is still every account's answer, and SVC-09's
CheckMyClanInvitations must skip a disbanded clan's invitations, which the store keeps (research 262 §3.2).*

*2026-10-09 (SVC-09, research 262 §4): the answer is the real list -- the caller's undecided invitations of standing clans, Horizon's paging, the leader's id and name (`myClanInvitations(store, accountId, q)`) -- and the caller is the session's: the handler is mounted by `createServices` (`bridge.ts`) with `bearerIdentify`, no longer by `main.ts`; a ticket of no session is 401. The page's `clanInvitationsHost.ts` sends no ticket yet, and that ticketless request keeps this section's none (`CLAN_INVITATIONS_TICKETLESS_ADAPTATION`, a port seam, research 262 §4.5), so the row reads "NO INVITATIONS" by an answer; its owner is the task that unparks the clan panels (W10.R4's follow-up), which sends the ticket and retires the seam. [2026-10-15: retired 2026-10-15 by INVITE-TICKETLESS: a ticketless request 401, research 273 §9.]*

### 2.4 The interface ONL-09 calls

ONL-09 draws the row; it registers the two rows over the page's service:

```ts
new ClanInvitationCommands({
  list: new MyClanInvitations({ uiVars: session.uiVars, event: (k) => { session.machine.shell()?.event(k); } }),
  service: fetchClanInvitationsService(universeServiceBase(search, location)),   // packages/viewer/src/clanInvitationsHost.ts
}).register(session.host);
```

`ClanInvitationsService` is `{ check(q: { start, pageSize }): Promise<ClanInvitationReply[]> }` (exported by `@s2u/ui`).
Until then `CheckMyInvites` and `HasClanInvitations` stay the table's declared rows (ONL-28's in the table): the
not-implemented answers are 1 and the placeholder true, so an unregistered `HasClanInvitations` would light the row --
ONL-09 must register them.

## 3. Unknowns, contradictions, what is not done

- **The arrival focus** (§1.6, R156.9): PLAT-11's to settle; it blocks ACCEPT from the pad on the page.
- **The lobby session's flag** (`LOBBY_SESSION_UP_READING`) and **LobbyLogout's state** (`LOBBY_LOGOUT_STUB_READING`):
  ONL-07 and ONL-10 hand in the real ones; the logout request `FUN_002fa560` is not followed.
- **The session check** on `/clan/invitations` (`CLAN_INVITATIONS_SESSION_READING`): SVC-09's.
- **What `RefreshRoomList` and `GetFriendInvitations` send** from the agreement's ONSTART: the rooms stream's (SVC-06,
  ONL-11) and the parked friends' (ONL-24); the table answers them today.
- **The decline path against a recomp capture** (the block's acceptance): no frame of the #763 popup or of the reboot
  after it is on record; ONL-32's.
- **The agreement's text**: the placeholder (OT.R17, H73); no new owner row.
- **`UsagePolicyReturnScreen`** is set by `dlgNetConnect` (ONL-07); a deep link leaves it 0, so ACCEPT on the page's
  deep link pops a history it does not have and stays.
- **The chrome's two darker texts** (§1.7): the help line and ACCEPT's caption; the drawer's, not chased.
- **Not done here**: `dlgWorldOfSOCOM` (ONL-09, the next wave), the row's drawing, the clan lifecycle (SVC-09),
  `PROCESS.md`'s range line (the controller's), the corpus (the controller's rebuild).

## 4. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `LOBBY_SESSION_UP_READING` (`packages/ui/src/screens/usagePolicyCommands.ts`) | no hook: the session counts as up | `FUN_002f79f0` sends only while +0x7d is set (`LobbyConnect`, D:L122535, D:L182633-182634); the port has no lobby session before ONL-07, and the original reaches the agreement only past it | ONL-07 handing in its connect flag (`lobbyUp`). *2026-10-05: handed in on the page (the lobby client's flag; `lobbyState` and `lobbyLogout` with it, research 157 §5); the reading stands for a host with no lobby* |
| `LOBBY_LOGOUT_STUB_READING` (`packages/ui/src/screens/usagePolicyCommands.ts`) | the answer of `FUN_0027dcc0` transcribed (0 -> 1; 0x12 -> 0; else the hook told and 0); no state hook: 0 | DECLINE's chain needs the row before ONL-10 builds logoff; the request `FUN_002fa560` not followed | ONL-10's body replacing the stub |
| `CLAN_INVITATIONS_SESSION_READING` (was `packages/central/src/clanInvitations.ts`) | the session not checked | every account's answer is the same while clans are parked, and the page's login is not on the match server's HTTP surface yet; Horizon refuses without a logged-in session (`MLS.cs:1523-1529`) | SVC-09, whose answers differ per account -- retired 2026-10-09 by SVC-09: a ticket is checked and gets the caller's list; the page's ticketless request keeps the none as a labelled port seam (`CLAN_INVITATIONS_TICKETLESS_ADAPTATION`, research 262 §4.5), owned by the task that unparks the clan panels (W10.R4's follow-up) -- *retired 2026-10-15 by INVITE-TICKETLESS: a ticketless request 401, research 273 §9* |
