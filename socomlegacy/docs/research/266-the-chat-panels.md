# 266 -- The chat panels: the keyboard, the line drawn, the scrolling (ONL-23)

- Date: 2026-10-10 (web sprint 22, wave 2; the plan `../plans/2026-10-10-web-sprint-22-the-results-and-the-lobbys-text.md`,
  W22.R4; the brief `../plans/briefs/2026-10-10-s22-w2-onl-23.md`); §2 the same day for ONL-16's chat half (W22.R5; the
  brief `../plans/briefs/2026-10-10-s22-w2-onl-16.md`); §3 2026-10-12 for SVC-19, the round's chat (web sprint 18,
  wave 3; W18.R6; the brief `../plans/briefs/2026-10-12-s18-w3-svc-19-round-chat.md`); §3.9 2026-10-12 for KEYBOARD-WHISPER,
  the online round's USB-keyboard `/w` whisper (OT.R48; the brief `../plans/briefs/2026-10-12-s18-keyboard-whisper.md`).
- Status: **reading, reviewed** (ONL-23 and ONL-16 2026-10-10, each by a reviewer who did not write it; the sprint's
  Log); §3 **reading, reviewed** (SVC-19, 2026-10-12; merged at 9bee502ac); §3.9 **reading, reviewed** (KEYBOARD-WHISPER,
  2026-10-12; 1613e03ca); §8 **reading, reviewed** (MATCH-01, MATCH-02 and MATCH-02b, 2026-10-13; 504ae730d, 77c4c2c88,
  f2018b128) -- each by a fresh reviewer before its merge, web sprint 18's Log. Every value below is transcribed from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted), from the ELF's strings and instructions
  read by address (`game/disc/socom2_game.elf` through `tools/elfImage.ts`; `S:0x<addr>` a string, a bare address an
  instruction where the decompiled text drops an argument or has no block), and from the disc's dialogs through
  `tools/dump-dialogs.ts` and the zAnim sets (`RUN/UIZANIM.ZAR`, `decodeUiProgram`); unit-tested against the
  transcription (the tests of §1.9 and §2.4). Nothing here is measured on the original running: the two-client exchange against
  `A_chat_02_entered.png`, `B_chat_A_to_B.png` and `A_chat_B_to_A.png` (PC research 66 rounds 2-3) is the proven level,
  owed to a browser window on the controller's word.
- Stands on research [263](263-chat-the-ignore-list-and-moderation.md) (§1 the transport, §2 who receives what, §3 the
  cut and the histories, §4.2 the ignore list's filtering side), [119](119-the-software-keyboard.md) §5 (the keyboards'
  caps), [162](162-the-briefing-room-the-join-and-the-game-list.md) §4 (the briefing room's panel, ONL-23a) and
  [165](165-the-game-lobby-to-the-launch.md) (the game lobby), and does not restate them.
- Code: `packages/ui/src/screens/briefingRoomChat.ts` (`BriefingRoomChat`: `SendMediusChat`, `mediusChat`, `received`,
  `screenLine`, `drawRoom`, `frame`; `parseChatInput`, `runChatCommand`, `appendGameLobbyChat`, `gameLobbyChatLine`,
  `lobbyPanelLine`); `gameLobbyCommands.ts` (`SendChatText`, `chatLine`, the panel emptied by `ConnectToGameServer`);
  `briefingRoomCommands.ts` (the join's draw; the gate removed); `packages/viewer/src/briefingRoomHost.ts` (the three
  paths, `chatLinesOf`, the mount's `chat` and `frame`), `gameLobbyHost.ts` (`GameSocketHost.chat`, the `chat` event to
  `chatLine`, the headset's lines among the chat's), `frontEnd.ts` (the poll stepped, the chat handed to the game
  lobby). No server file changed; `protocol.ts` untouched (the game's `chat` exists both ways, :529 and :1120).
  §3 (SVC-19): `packages/central/src/chat.ts` (`GAME_CHAT_SCOPE`, `gameChatScope`, `gameChatReaches`), `bridge.ts`
  (`chatLine` in every state, by scope), `server.ts` (`refuse`: REFUSED-MAP); `viewer/src/net/protocol.ts` (`chat`'s
  `team` both ways, `refused.map`); `ui/src/screens/briefingRoomChat.ts` (`gameLobbyChatLine`'s team form, `round`),
  `gameLobbyCommands.ts` (`ChatRecipient` to the send); `viewer/src/roundChat.ts` (new), `netPage.ts` (`gameChat`),
  `matchMount.ts`, `frontEnd.ts`, `briefingRoomHost.ts`, `gameLobbyHost.ts` (the wires). §3.9 (KEYBOARD-WHISPER):
  `viewer/src/roundTextLine.ts` (new), `hud.ts` (`TEXT_LINE_LAYOUT`, `Hud.setTextLine`, the line drawn), `matchMount.ts`
  (`textLine`), `frontEnd.ts` (its two reads), `roundChat.ts` (the retired name's doc removed).

## 1. The chat panels (ONL-23)

### 1.1 The keyboard (R1, a USB keyboard's ENTER)

The disc binds R1 and USBKBD_ENTER to `do_chat` on both screens (`dlgMPBriefingRoom.rdr`, `dlgGameLobby.rdr`, the
dialogs' dump). The animations, read off `RUN/UIZANIM.ZAR`:

| screen | `do_chat` | the keyboard (`GetTextInput`'s block, research 119 §5) | its APPLY |
|---|---|---|---|
| BRIEFING ROOM | `STOPANIMATION menu_fade_up`, `ClearUIVar(MsgPlayer_Recipient)`, `ClearUIVar(CHATMESSAGE)`, `KeyboardPurpose = 1`, `GetTextInput(CHATMESSAGE)` | `ChatSkb`, title #361, CHATMESSAGE 100 chars / 99 bytes, the recipient edit MsgPlayer_Recipient (14 / 31) | ON_SKB_APPLY `send_chat`: IF `KeyboardPurpose == 1`, `SendMediusChat(CHATMESSAGE)` with MsgPlayer_Recipient at +0x10; ELSE `KeyboardCameBack = 1` |
| player info (PLAYER LIST's CROSS) | `playerinfo_send_message` (R1 on `playerinfo_ctl_desc`): `KeyboardPurpose = 99`, IF PLAYER_INFO_NAME_VAR: `ClearUIVar(CHATMESSAGE)`, `GetTextInput(CHATMESSAGE)`, WHILE `skb_done == 0`, `PruneUIVarSpaces`, IF CHATMESSAGE: `SendMediusChat(CHATMESSAGE)` with PLAYER_INFO_CHAT_NAME_VAR at +0x10 | `PlayerChatSkb`, 55 / 55 | `send_chat`'s ELSE (purpose 99) |
| GAME LOBBY | IF `late_joiner == 1`: a popup (#360) 5 s; ELSE IF `ComeFromLan`: `PlayerChatSkb`; ELSE `GetTextInput(CHATTEXT)` | `ChatSkb`, CHATTEXT 63 / 63, the recipient edit MsgPlayer_Recipient | `send_chat`: `SendChatText(CHATTEXT)` with MsgPlayer_Recipient at +0x10 |

The keyboard is PLAT-17's (`GetTextInput`, `SoftKeyboardFrontEnd`): Square backspace, R1 case, Enter / Circle accept,
Triangle cancel (research 301 §6's pattern). ONL-23 only removed the gates that took `do_chat`, `send_chat` and
`playerinfo_send_message`; every animation above runs as the disc has it. The late joiner's popup is ONL-16's to hold;
the player info is reached only once PLAYER LIST has rows (`ROOM_PLAYER_LIST_PARKED_READING`, research 162 §6).

### 1.2 The send: `SendMediusChat` and `SendChatText`

Both rows run `FUN_00281d40` (D:L128201-128324), with a callback each: `SendMediusChat` (row 48, 0x27d220,
D:L125872-125879) 0x27d250, whose four instructions (0x27d250-0x27d264) jump to `FUN_002f4860(0x44f370, text,
recipient)`; `SendChatText` (row 31, 0x27cb80, D:L125617-125626) `FUN_0027cbb0` (D:L125627-125641): no recipient
`FUN_002ba850`, one `FUN_002f4860`. `FUN_00281d40`:

- the text is the string of the variable the argument names, or the argument's name itself when it holds none
  (D:L128220-128225); the recipient the string of the variable named at the command's +0x10, none when empty
  (D:L128226-128239);
- with no recipient, a text opening `/w ` or `/W ` names one (D:L128240-128299): past its spaces, up to the closing `"`
  when it opens with one, else to the next space; the text is what follows and its spaces; a name that runs to the
  end draws the usage line `"Whisper usage: /w ''player name'' message"` (S:0x3ef6d0, D:L128278-128288) and sends
  nothing;
- the line goes only when it does not open `$~` and holds a character but spaces (D:L128300-128313); a LAN game skips
  the lobby (D:L128314-128320, not the port's path).

`FUN_002f4860` (D:L194526-194590): nothing with the lobby down (+0x7d, D:L194549); the text's 64 bytes and its NUL
(D:L194556-194558): **63 characters** sent; no recipient, the text filter then ChatMessage type 0 to -1
(D:L194559-194571); a recipient, FindPlayer by its name (0x20 bytes, D:L194583-194585), whose reply `FUN_002f4a20`
(D:L194594-194651) posts MP_PLAYER_NOT_FOUND on a failure (S:0x3f5620, D:L194618) or sends type 1 to the account found
(+0x48, D:L194636). `FUN_002f4ba0` (D:L194653-194711) sends and draws the own line unless the target is the sender's
own account (D:L194700-194707; the page by name, `OWN_WHISPER_BY_NAME_ADAPTATION`). The text filter is the server's
(`CHAT_FILTER_PLACEHOLDER`, research 263 §6): the page sends at once and draws its line at the send.

The game lobby's line (`FUN_002ba850` D:L160057-160063 -> the filter -> `FUN_002ba870` D:L160067-160116): the game
session's message to -1 (D:L160109) -- the page's `{ type: 'chat', text }` on the game socket (`GameSocketHost.chat`, an
open socket only) -- and the seat's own line through the receiver at once (D:L160111), under the seat's own name. The
original sends and draws the filter's reply text (`FUN_002f4df0` -> `FUN_002f4ea0`, +0x15, D:L194765-194778); the page
sends and draws the raw text, identical while `CHAT_FILTER_PLACEHOLDER` only cuts -- a real filter would show the sender
its raw line, so this own line is tied to that placeholder. The briefing room's own line is the unfiltered text in the
original too (`FUN_002f4ba0` draws the record's pre-filter text, D:L194707): the port matches it there.

What the page sends: `/lobby/chat` `{ messageType: 0, targetId: -1, message }` for a room's line; `/lobby/find-player`
`{ name }` then `/lobby/chat` `{ messageType: 1, targetId: <accountId>, message }` for a whisper; `{ type: 'chat', text }`
on the game socket for the game lobby's line. SVC-18's paths and the bridge are unchanged.

### 1.3 The line's drawn form

Every line reaches the screen's line call, the front end screen's vtable +0x2c, `FUN_001f4d20` (D:L54919-54934): in the
lobby's state 11 the room's history (`FUN_001f5020`), else the game lobby's panel (`FUN_001f4df0`). The decompiled text
drops the call's ninth argument (a stack word) and the front end's frame has no block, so the arguments are read from
the instructions (`CHAT_LINE_ARGS_READING`):

| line | caller | text | name | flag | kind |
|---|---|---|---|---|---|
| received | the frame at 0x1f4640, dequeuing 0x437690 (0x1f46b8-0x1f46ec) | `"%s: %s"` of the sender's name and the message (S:0x3f5638, `FUN_002f4ef0` D:L194798) | **none** (0) | 1 | the queued kind: 0 a room's line, 5 a whisper, 1 a universe line (D:L194789-194795) |
| own | `FUN_002f4ba0` (0x2f4cc4-0x2f4d34) | the text sent (63) | the session's (0x66a4f4) | 1 | 5 for a whisper (type 1), else 0 |
| usage | `FUN_00281d40` (0x281fe0-0x282040) | S:0x3ef6d0 | `""` (S:0x3eead8) | 0 | 1 |

`FUN_002f4ef0` (D:L194781-194803) queues a room's line only in state 11, a whisper and a universe line in every state
(D:L194797); the queue (`FUN_002a4050` D:L147615-147669) cuts only a text of 128 bytes or more (D:L147643-147656),
which a name of 32 and a message of 63 never reach.

**The briefing room** (`FUN_001f5020` D:L55020-55158, drawn by `FUN_002f5020` D:L194822-194884 into
MEDIUS_CHAT_RECV_VAR): a record of the name (31, D:L55041), the type (kind 1 -> 2, 5 -> 1, 0 -> 0) and the text (63,
D:L55042, `FUN_0039fc60`); drawn `"%s %s: %s"` (S:0x3f5660: the colour, a space, the name, the text) or, with no name,
`"%s%s"` (S:0x3f5670), a `"\n"` element (S:0x3f5678) between two lines. The colours (read from the ELF): a room's line
`#C` 80 80 80 (S:0x3f5648), a whisper `#C` 80 40 40 (S:0x3f5650), a universe line `#C` 80 80 40 (S:0x3f5658), any other
`#C` ff ff ff (S:0x3f5640). So:

- **a received room line** is drawn `"#C\x80\x80\x80bob: hi all"` -- the name inside the text, no space after the colour
  -- its record's text the whole `"bob: hi all"` cut to 63;
- **the own line** is drawn `"#C\x80\x80\x80 socomc: hello room"` -- a space after the colour, the name a field of its
  own -- in the whisper colour for a whisper;
- **the usage line** `"#C\x80\x80\x40Whisper usage: ..."`.

No "(All)" in the briefing room: that form is the game lobby's. The plan's "name (All): text" (W22.R4) is the game
lobby's line; the briefing room's is "name: text" as above.

**The game lobby** (`FUN_002ba9d0` D:L160117-160195; BCHATLISTVAR is the game object's +0x94, added PERMANENT and set
empty by `FUN_002a76d0` D:L149534-149539): a line `"#C\x80\x80\x80%s (All): %s\n"` (S:0x3f2720, D:L160181) of the
sender's name -- "Unknown" with none (S:0x3f26f8, D:L160177-160179) -- and the text, as one element after the array's
last 20 (D:L160155-160188); none when the text is empty (D:L160146). A team's `"(Team)"` (S:0x3f2700) is SVC-19's
(`ROUND_CHAT_SCOPE_PLACEHOLDER`). A lobby-server line out of state 11 (a whisper received in the game lobby, the own
whisper, the usage line) goes the same way through `FUN_001f4df0` (D:L54939-55015): the kind's colour (0x3e2e78,
0x3e2e68, 0x3e2e70), the name and `": "` when one is passed (D:L55000-55001), the text, `"\n"`.

### 1.4 The histories: 11 and 21

The briefing room's per room (`ROOM_CHAT_LINES`, 11): past 10 the oldest is dropped before the new one is added
(D:L55057-55101, D:L55110-55154); a room's line goes to the room MEDIUS_LOBBY_NAME holds (D:L55107-55155), a whisper and
a universe line (and the flag 2) to every room's (D:L55052-55106). The histories live in the room records
(`BriefingRoomChat`'s WeakMap by record, as the games are kept), so a room list's refresh frees them; the join's
success draws the room's lines (`FUN_002efc80` D:L191662-191664: `FUN_002f5020` with MEDIUS_CHAT_RECV_VAR held). The
game lobby's 21 (`GAME_LOBBY_CHAT_LINES`): the variable's own last 20 and the new line; `ConnectToGameServer` empties
it (`FUN_0027e4c0` D:L126462 -> `FUN_002a9f00` -> `FUN_002a76d0`). The headset's two lines (ONL-16b's
`LOBBY_VOICE_LINE_ADAPTATION`) now go through the same 21, one element each.

### 1.5 The scrolling (L1 / L2)

The disc's animations, read off `RUN/UIZANIM.ZAR`: the briefing room's `scroll_chat_down` (L1) is `CHATLIST.op5`,
`scroll_chat_up` (L2) `CHATLIST.op4`; the game lobby's the same on `B_CHATLIST`, each followed by `WAIT 0.1`. Ops 5 and
4 are the WRAPPEDTEXT's `Scroll_Down` / `Scroll_Up` (`FUN_00379b10`, PLAT-15's `scrollWrapped`): a SPACING (20) a press
while there is more. Nothing new: the panels' lines give them something to scroll. AUTOSCROLL puts the scroll back to 0
at each new text (PLAT-15's setter).

### 1.6 The poll (`CHAT_POLL_MS_ADAPTATION`)

The console's lobby connection is pushed ChatFwdMessage (`FUN_00300840` D:L202025-202046 installs `FUN_002f4ef0`); no
push the page already has carries the lobby's lines (the game socket is the game lobby's alone), so the page asks
SVC-18's `/lobby/chat-lines` once each 1000 ms while the lobby is up with a ticket, one request at a time, a reply taken
only under the ticket it was sent with (as `GAME_LIST_LATEST_REPLY_ADAPTATION`); the front end's frame steps it
(`connectBriefingRoom`'s `frame`, on the page's animation-frame clock). Each line is handed on in order, with no queue
between. A browser adaptation of the transport; its cost a line drawn up to a second late, well under the server's
20 requests a second per address (`D9_HTTP_RATE_PER_S_PLACEHOLDER`).

### 1.7 The ignore filter's effect

The page keeps no ignore list: an ignored sender's room line and whisper are held back by the server
(`IGNORED_LOBBY_LINE_READING`), its game lobby line dropped at the bridge (`IGNORED_GAME_LINE_ADAPTATION`; the
console's receiver drops it, D:L160149-160152). The page draws what it is sent. The host tests build it from what the
server sends -- SVC-18's `ChatService` with SVC-17's `receives` rule, three pages: the ignorer's panel lacks the
line, a third's draws it, and the ignored player still hears the ignorer (one way).

### 1.8 The retirements

`TEXT_CHAT_GATE_READING` (`briefingRoomCommands.ts`, research 162 §6) and `LOBBY_TEXT_CHAT_GATE_READING`
(`gameLobbyCommands.ts`, research 165's table) are retired with their gates (`BRIEFING_ROOM_GATED`, `GAME_LOBBY_GATED`
and their binding gates removed); `SendMediusChat` moved from parked to ONL-23's (`BRIEFING_ROOM_ENTRY_COMMANDS`);
`SendChatText` joined `GAME_LOBBY_COMMAND_ROWS`. `CopyUIVar` and `AddToIgnore` (`on_skb_apply_2`, the chat keyboard's
Action2) stay parked: the table's declared rows answer; the ignore by name is ONL-25's. *2026-10-11: both answered by
ONL-25 -- `CopyUIVar` CHATMESSAGE -> PLAYER_IGNORE_NAME, then `AddToIgnore` (research [269](269-the-players-pages-and-the-medals.md) §1.4).*

### 1.9 The tests

`packages/ui/test/screens/briefingRoomChat.test.ts` (the row, the room's line and its request, the cut, never sent,
`/w` and a quoted name, the recipient edit, not found, to oneself, the usage line, `parseChatInput`, the received
forms and colours, the 11, the cut of a received text, per room, out of state 11, the game lobby's 21, the poll, the
ticket, the ignorer and a third); `briefingRoomCommands.test.ts` (no gate stands; the join's draw);
`briefingRoomScreen.test.ts` over the machine (R1 opens `ChatSkb` with its caps, typed and applied sends and draws; a
USB ENTER runs `do_chat`; 70 typed go out as 63; the polled lines drawn, 11 kept; L1 / L2 scroll `CHATLIST`);
`gameLobbyScreen.test.ts` (R1 -> `SendChatText`, the socket's line and the own line at once; the relay's 21, an empty
one not drawn; L1 / L2 scroll `B_CHATLIST`; `ConnectToGameServer` empties the panel); the viewer's
`briefingRoomHost.test.ts` (the three paths, the mount's poll, the ignore filter's effect over `ChatService`),
`gameLobbyHost.test.ts` (the socket's `chat` both ways, the ignore filter over `ChatService.gameLine`),
`gameLobbyVoice.test.ts` (the headset's line in the 21); `tools/test/briefingRoomEntryCommands.test.ts` (the bindings,
the entry). The whisper typed through the screen rig is not run (its USB map types no `/`): the unit test holds it.

## 2. The game lobby's chat half (ONL-16)

Written 2026-10-10 (web sprint 22, wave 2; the brief `../plans/briefs/2026-10-10-s22-w2-onl-16.md`, W22.R5: the chat
half only). **Reading, reviewed 2026-10-10.** The scripts read off `RUN/UIZANIM.ZAR`'s `dlgGameLobby.rdr` set through
`tools/dump-online-dialogs.ts --dialog dlgGameLobby.rdr` (`decodeUiProgram`), the strings through `parseLocTable` over
`RUN/LOCALE/STATES/UIMNLOC.ZAR`; the code from the decompilation. Nothing measured on the original running.

### 2.1 The late joiner: no chat while `late_joiner` is 1

- **When, for whom.** `Enable_SM_Launch`'s third sequence calls `SetupLateJoiner` when the seat is not the session
  master and the valve `late_joiner` is 1 (the master's `SetupSessionMaster` comes first, so a master is never a late
  joiner here). `SetupLateJoiner` writes #351 "Chat disabled for late joiners" over the panel's caption
  (`ChatText.op1(#351)`, the caption the layout gives as #343), hides the voice caption (`InfoTextCT`, ONL-16b), and
  asks #352 (a spectator, `player_team` 16) or #353 (a player: the ghost) -- locs 350-353 of `Enable_SM_Launch`.
- **The gate.** R1 and USBKBD_ENTER run `do_chat`: `STOP menu_fade_up`, then IF `late_joiner == 1` -- `POPUPDIALOG`,
  `POPUP #360 keep` ("Sorry, no chat for late joiners."), `WAIT 5`, `KILLPOPUP`, `DescriptionTextLow.op1` -- ELSE the
  keyboard (`GetTextInput(CHATTEXT)`, §1.1). So a late joiner never reaches the keyboard and `send_chat` never runs.
  This is the original's only gate: `SendChatText` (0x27cb80 -> `FUN_00281d40` with `FUN_0027cbb0`, D:L125617-125641)
  and the game line's send (`FUN_002ba850` D:L160057-160063 -> the filter -> `FUN_002ba870` D:L160067-160116) test
  neither `late_joiner` nor the game's `+0xcc` (contrast `VCButton` and `CheckForcedLaunch`'s voice half, D:L125660).
  The page runs `do_chat` as the disc has it over the valve the page writes at the first `gameLobby` of a launched game
  (`GameLobbyCommands.gameLobby`), so no gate is added in code.
- **Until when.** For as long as `late_joiner` stays 1: `SetupLateJoiner`'s own loop (`WHILE late_joiner == 1`,
  `RefreshGamePlayerList`, `WAIT 5`) waits on the same valve. The console's writer that clears it is not read; the page
  clears it at the room's next `roundStart` and goes to the match (`LATE_JOINER_NEXT_ROUND_READING`, research 165), so
  in the page a late joiner's chat stays disabled for its whole stay in the lobby, and a match's return
  (`matchReturned`, `late_joiner` 0) gives the keyboard back.
- **Received lines.** The receiver (`FUN_002ba9d0` D:L160117-160195, registered for the game's chat message by
  `FUN_002b8660` D:L159083) tests the game object, the scope, an empty text and the ignore list (D:L160135-160152), never the late
  joiner: a late joiner's panel draws the others' lines (§1.3).

### 2.2 The lines across SWITCH TEAMS and the ARMORY

BCHATLISTVAR is the game object's `+0x94`, added at longevity 2, PERMANENT (`FUN_002a76d0` D:L149534-149535), and set
to an empty array there (D:L149536-149539). `FUN_002a76d0` has two callers -- the game object's creation at boot
(`FUN_002ad290` D:L152600, from D:L47893) and `FUN_002a9f00` (D:L150860) -- and `FUN_002a9f00` two:
`ConnectToGameServer` (`FUN_0027e4c0` D:L126462) and `HostLANGame` (`FUN_0027e540` D:L126489). The other writers of
`+0x94` append: the receiver (D:L160188) and the lobby server's line out of state 11 (`FUN_001f4df0`, §1.3). So:

- **SWITCH TEAMS** (`switch_teams_anim`: `SwitchSides` 0x27d100, `FromBriefing`, `Enable_SM_Launch`): no call empties the
  panel; `Enable_SM_Launch` only disables `B_CHATLIST` as a control (`DisableButton(B_CHATLIST)`). The lines are kept.
- **The ARMORY** (`goto_eq_mp_set_return_valve`: `SWITCHMENU(dlg_equipment_mp.rdr)`, and back through `returnto_lobby`):
  no clear frees a permanent var (`FUN_00385c30`, the clear the state changes call, frees longevity 1 only, D:L279534-279555;
  `uiVars.ts`), and
  a line received while the ARMORY is up is appended (the receiver has no screen test): the lobby on its return draws
  the lines from before and the ones that came meanwhile.

### 2.3 The panel at the launch: carried

The launch (`check_loop`'s `SWITCHMENU(LOAD_SCREEN)`) calls neither emptier, and BCHATLISTVAR, permanent, outlives the
state change; so the panel's lines are carried, not cleared, and the next game's `ConnectToGameServer` is what empties
it (§1.4). The receiver appends every game line while the game object stands (D:L160135) -- the round's included, which is why
its format has the team scope's `"(Team)"` (S:0x3f2700) -- so on the console the lobby after a match also shows the
round's lines; the round's chat is SVC-19's (`ROUND_CHAT_SCOPE_PLACEHOLDER`), and the page hands the game socket to the
match, so its panel after a match holds the lobby's lines only (§7). The page keeps the panel the same way: one
`UiVarManager` across the match (`packages/viewer/src/frontEnd.ts`), nothing at the launch or at `matchReturned`
touching BCHATLISTVAR.

### 2.4 The tests

`packages/ui/test/screens/gameLobbyScreen.test.ts`, over the machine with the disc's dialogs: a late joiner -- the
caption #351, R1's #360 still up at 4 s and gone after 5, no `GetTextInput`, nothing sent, the panel empty, a relay
line drawn; the lines across SWITCH TEAMS and the ARMORY's open and close, one received while in the ARMORY; the panel
across the launch (`SWITCHMENU(LOAD_SCREEN)`), the state change's clear of temporary vars (`UiVarManager.clearTemporary`,
the console's `FUN_00385c30`, called by the test where the load state would) and the match's return. All three passed
on their first run against ONL-23's code: the disc's scripts already held them, so no code row changed (the RED the
brief asked for was not there to see; a mutation that stops the page writing `late_joiner` fails the first, and one
that adds BCHATLISTVAR at longevity 1 instead of 2 fails the third at the clear -- the PERMANENT reading of §2.2-2.3
is what it holds).

## 3. The round's chat (SVC-19)

Written 2026-10-12 (web sprint 18, wave 3; the plan `../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md`,
W18.R6; the brief `../plans/briefs/2026-10-12-s18-w3-svc-19-round-chat.md`). **Reading, reviewed** (at its merge, 9bee502ac). The code from
the retail decompilation (`D:L<n>`, `FUN_<addr>`; cited, never pasted); the ELF's strings and its data bytes read by
address through `tools/elfImage.ts` (`S:0x<addr>`); the disc's scripts through `tools/dump-online-dialogs.ts`'s
readers (`readChapterSets` over `RUN/UIZANIM.ZAR`, `RUN/EXTZANIM.ZAR` and `RUN/MPZANIM.ZAR`). Unit-tested against the
transcription (§3.7). Nothing here is measured on the original running: ONL-32's two-instance recomp round (a team
line, an all line and a custom message, each side's message window against the page's) is the proven level, owed.

### 3.1 The game line's scope, and where it is sent from

- **The scope.** `FUN_002ba870` (D:L160067-160116) gives the game session's line a second short, its scope: 0 unless
  the `ChatRecipient` valve (S:0x3f26e8, found by `FUN_00351ef0`, its +4 short) is non-zero, then 1 when the sender's
  side passes `FUN_002c31a0` (D:L164708-164720), else 2 when it passes `FUN_002c3080` (D:L164647-164659), else 3 when it
  is a spectator (`FUN_002c2fa0` D:L164597-164606 -> `FUN_002f6d00` D:L196201-196216: `JoinAsSpectator` S:0x3f5730 or
  `DAT_004413d8`); a sender on neither side and no spectator keeps 0 (D:L160079-160102). The two side tests compare the
  team word `DAT_00441470` with the SEALs' and the Terrorists' words, which `DAT_004412d8` swaps together (research 189
  §2: `FUN_002c32e0` / `FUN_002c32c0` D:L164779-164800), so 1 is the SEALs' and 2 the Terrorists' whichever way the swap
  stands; a spectator's word is 0x10000 (`FUN_002c3330(0x10000)` at D:L159276, D:L159343, D:L166262), neither side's.
- **`ChatRecipient`** is the chat keyboard's TEAM/ALL key (`Recip`, `FUN_00396220` D:L289181-289203, set at PERM; its
  images `SkbRecipState0/1.tif`; research 119 §2), on the game lobby's `ChatSkb`; an open does not reset it (research
  119 §3). The page's keyboard already toggles it (`packages/ui/src/keyboard/softKeyboard.ts` `toggleRecip`).
- **The receiver** (`FUN_002ba9d0` D:L160117-160195) drops a line of scope 1, 2 or 3 whose own test fails
  (D:L160137-160145), an empty one (D:L160146) and an ignored sender's (D:L160149-160152); it tests the game object
  only (`DAT_00437ce8`, D:L160135) -- **no game state and no life**. So a team line reaches the sender's side, a
  spectator's team line the spectators only, a side's team line never a spectator, and an ALL line every seat; the dead
  receive the living's lines and the living the dead's. The brief's two unknowns (the dead and the living; spectators
  and team lines) are read, so no name stands for either.
- **Where it is sent from.** The game line's send has two callers: `SendChatText`'s callback (`FUN_0027cbb0`
  D:L125627-125641 -> `FUN_002ba850` D:L160057-160063) and the LAN path of `FUN_00281d40` (D:L128319). `SendChatText` is
  called by one script on the disc: `dlgGameLobby.rdr`'s `send_chat` (the three zAnim archives searched; no MPZANIM or
  EXTZANIM set names it, and none names `ChatRecipient`). The soft keyboard's root is made at a front-end load
  (`FUN_0038dea0` D:L284281-284298, research 119 §3), so a round has no soft keyboard. **The original sends the game
  line from the game lobby only, and receives it in every state.** On the pad, what a round's player sends is the Chat
  menu's (TACTICAL ORDERS, MESSAGES, TAUNTS; §3.5), behind CIRCLE's tap (research 301 §3); R1 in a round is the round's
  own binding, not a chat key.
- **The round's typed line: a USB keyboard's whisper** (*2026-10-12, corrected after SVC-19's review, finding 1: the
  first text said "a round types no text", which was wrong*). An online round does type text, on a USB keyboard, and
  sends it as a whisper through the lobby server, never as the game line. The round's frame, online (`DAT_0045a0c1`)
  with the `ComeFromLan` valve (S:0x3f6328, `FUN_003045b0(0x44fe10)`) at 0, calls `FUN_002c6c70` (`FUN_001f7ff0`
  D:L56828-56830), which reads the USB key codes (`FUN_002dbd90`) into the HUD's 128-character text line 0x437540
  (D:L167242-167320; the line built by `FUN_001fa360` D:L57429-57431, `FUN_002c9960(0x437540, 0x80)`), drawn on the
  living HUD (`FUN_001f7a90` D:L56424), the dead's (D:L57179) and a spectator's (D:L56879). ENTER (key 0x28) runs
  `FUN_002c9b80` (D:L169081-169131): a line opening `/` and a word of at most seven letters matching `w` (S:0x3f2f10,
  case-blind by `FUN_00198b80`) goes to `FUN_002c9990` (D:L169000-), which parses ` <name|"name"> <message>`, then
  `FUN_002c9810` (D:L168944-168982): a target that is an actor of the round (`FUN_0029e590`) passes only as a teammate
  -- the two actors' +200 team flags shared, +0xe1 bit 4 alike, `FUN_002c2fd0` (the spectator test) alike -- else the
  HUD's main window says `:: Player "%s" is unavailable` (S:0x3f2ef0) in colour 2 and nothing is sent; a target that
  passes, or one no actor of the round bears, is whispered through the lobby server (`FUN_002f4860`, §1.2) and the text
  is echoed on the main window in colour 0. Every line, sent or not, is then cleared (D:L169128-169129): a line that is
  not a `/w` is never sent. Reading, reviewed (SVC-19's review). **Built by KEYBOARD-WHISPER** (§3.9; `ROUND_KEYBOARD_WHISPER_READING`
  retired, §6) under OT.R48 (the owner, 2026-10-12: "keyboard in round is acceptable" -- the original's keyboard text
  entry in a round), which admits a physical keyboard into the round for this past OT.R38 (controller only) and OT.R29
  (the keyboard local only). *(2026-10-12, KEYBOARD-WHISPER: "128-character" above is the set-up's argument; the line
  holds 100 at most -- `FUN_002c9960` clamps 0x80 to 5..100 -- and takes a key while under 98, §3.9.)*
- **The port.** `packages/central/src/chat.ts`: `GAME_CHAT_SCOPE`, `gameChatScope(team, side)` (the sender's, the side
  the room holds for the seat, a spectator's none) and `gameChatReaches(scope, side)` (the receiver's test). The bridge
  (`bridge.ts` `chatLine`) relays a game seat's `chat` **in every state** -- `ROUND_CHAT_SCOPE_PLACEHOLDER` (research 263
  §6) retired -- to the seats its scope reaches, the room's side of each seat now, through the ignore filter as before;
  a seat out of scope is not sent the line, where the console's receiver drops it (as SVC-17's
  `IGNORED_GAME_LINE_ADAPTATION`, the server holding no client of the console's). The page's `chat` carries `team: true`
  when `ChatRecipient` is non-zero (`net/protocol.ts`, additive); the relayed line carries `team: true` on a scope 1-3.
  The sender's side is never the page's to name: the server takes it from the seat. `room.ts` is not touched: the game
  seat's text reaches the bridge first (`server.ts`, `session.game?.text`), and a maps' room has no game lobby.

### 3.2 The game lobby's two forms

The receiver writes `"#C\x80\x80\x80%s (All): %s\n"` (S:0x3f2720) for scope 0 and `"#C@\x80@%s (Team): %s\n"`
(S:0x3f2700) for 1-3 (D:L160180-160185), "Unknown" for no name (S:0x3f26f8); the team's colour code is the three bytes
0x40 0x80 0x40 at 0x3f2702-0x3f2704, read off the ELF (64, 128, 64: green). The sender's own line goes through the
receiver at once (D:L160111) with its own scope, which its own test passes, so a seat's own team line is drawn in the
team's form. The page: `gameLobbyChatLine(name, text, team)` and `TEAM_CHAT_COLOUR` (`briefingRoomChat.ts`);
`GameLobbyCommands.gameLine` reads `ChatRecipient` (`FUN_00351ef0(0x3f26e8)`'s short) and sends and draws with it;
`GameLobbyCommands.chatLine` draws a relayed line's `team`; `GameSocketHost.chat(text, team)` (`gameLobbyHost.ts`) sends
it.

### 3.3 The in-round message window: what a round draws

- **The drain.** The lobby server's lines wait in the queue 0x437690 (`FUN_002f4ef0` D:L194781-194803 through
  `FUN_002a4050` D:L147615-147669: a ring of ten 0xa1-byte records -- the kind at +8, the text at +9, up to 126 bytes, the
  sender's name at +0x89, 0x20 bytes -- full at nine, a new line dropped when full, D:L147629-147636). The front end's
  frame drains it into the screen's line (§1.3); in a round the round's frame does, `FUN_001f7ff0` (D:L56708-56719): each
  line posted by `FUN_002b6530(0, 0x4366a0, text, kind, 0, 0)` -- the HUD's main window (research 87 §14), the window's
  own scale (0), the kind as the colour index, not centred, no fade of its own -- so a whisper is drawn
  `"name: text"` in colour 5, (128, 64, 64), and a universe line in colour 1, (128, 128, 64) (`FUN_002b7530`'s table,
  `matchMessages.ts` `MESSAGE_COLOURS`). A room's line is queued in the lobby's state 11 only (D:L194797), so a round
  sees whispers and universe lines alone. The history's length and the timing are the window's own (`Hud.postMessage`:
  its lines and its 7 s fade, research 87 §14 and 222 §9), as for every other post.
- **EXTERNAL WHISPERS** (D:L56712-56715): a whisper (kind 5) is posted only while the global `DAT_003de620` is non-zero
  or an actor of the round bears the sender's name (`FUN_0029e590` D:L144706-144720 over the actor list 0x4362e0, each
  actor's `+0x28` record's `+0x90`, compared case-blind by `FUN_00198b80` D:L15551); the loop dequeues the line either
  way, so a dropped whisper is gone. The global's initial byte is 1 (the ELF's data at 0x3de620); `FUN_002a41f0`
  (D:L147670-147692) writes it and its valve (S:0x3f09d0, `EnableExternalWhispers`) from `StoreOptions` (research 265
  §1.2) and from the in-game menu's entry 0xb, "IN-GAME TEXT MESSAGES : ON" / "... : OFF" (`FUN_002041e0`
  D:L61858-61867; S:0x3e3c80, 0x3e3ca0).
- **`ROUND_ACTOR_NAMES_READING`** (§6): the actor list's adds are not traced, so the page takes the round's players as
  the room's score names them (`NetPage.rows`: the page's own seat and the dead among them, a spectator not).
- **The page.** `packages/viewer/src/roundChat.ts` (`roundQueueLine`, `mountRoundChat`, `externalWhispers`,
  `EXTERNAL_WHISPERS_INITIAL`); `BriefingRoomChat`'s `round` option (`packages/ui`): while it answers a sink, a polled
  whisper or universe line goes to the round with its text, name and kind and never to the game lobby's panel (the
  console's queue is drained by one frame or the other); the front end's mount (`frontEnd.ts`) hands it the mounted
  match's `MountedMatch.lobbyLine` (`matchMount.ts`) from the mount to the return, and the match reads the option from
  the session's `OptionGlobals` (`EnableExternalWhispers`, else the initial 1). The page hands each polled line on with
  no queue between (§1.6), so the ring's nine is not reproduced: a poll answers at most 11 (`ROOM_CHAT_LINES_READING`,
  the server's), one frame takes them all.

### 3.4 The round's lines into the game lobby's panel

The receiver appends every game line to BCHATLISTVAR with no state test (D:L160135; §2.3), so a line a seat sends from
the game lobby while the others play -- the round's lines, as the console has them -- is in the panel at the match's
return, which keeps the panel (PERMANENT, §2.2-§2.3). The page: `NetPageDeps.gameChat` (`netPage.ts`, the match chat's
case: `chat` handed on, nothing posted on the HUD), given by the front end's match (`matchMount.ts` `gameChat`) as the
session's `GameLobbyCommands.chatLine` (`frontEnd.ts`). The events the match replays at its mount (`LobbyMatch`'s, held
from the hand-off through the load, and the mount's own pending) are the ones heard after the lobby let the socket go,
so no line is drawn twice. The §7 item of 2026-10-10 ("the page's panel is not fed during a match") is settled.

### 3.5 The custom messages and the taunts in the round

Built before this task and not reopened (W18.R6): MESSAGES -- the five `MPLOCALSOP1-5`, "Custom Team Message n"
(0x3e6490-0x3e6550), sent to the sender's team and drawn in colour 3 (research 302 §3, `viewer/src/matchChat.ts`) -- and
TAUNTS' five custom rows -- `MPTAUNTMSG1-5` (S:0x3f29d0-0x3f2a10, read off the ELF), sent to the enemies with the
sender's echo, colour 5 (research 301 §3-§4, `viewer/src/matchTaunts.ts`). Where the original keeps them: the persistent
UI variables, saved on the memory card in the save file's `CUIVarManager` module and edited by ONLINE OPTIONS' SETUP
MESSAGING and SETUP TAUNTS (OPT-15; research 301 §6, 302 §3) -- the page restores them from its card at the session's
start and the front end's match reads them from the session (`frontEnd.ts` `taunts`, `messages`). Their tests:
`viewer/test/matchChat.test.ts`, `matchTaunts.test.ts`, `communications.test.ts`, `taunts.test.ts`.

### 3.6 TEAMMATE NAMES in the round

`DISPLAY_MP_TEAM_NAMES` (S:0x3e5540) is read into the name tags' part's +0x5e4 at its set-up (`FUN_00227340`
D:L77558-77559) -- the part of eight tags (the loop from D:L77534, each at scale 0.9), the talk icon
`action_ok_talk2.tif` (S:0x3e5500) and the arrow `hud_arrow_off2.tif` (S:0x3e5520) -- and `FUN_00226960`
(D:L77290-77301) sets the part's draw bit 0x40 with the flag on (`FUN_00364e30` D:L262084-262089) and clears it with the
flag off (`FUN_00364e50` D:L262094-262099); a part's children are drawn only with the bit set (`FUN_00364e70`
D:L262104-262112). So TEAMMATE NAMES off hides the teammates' name tags (`FUN_002269a0` D:L77305-77460). **Not built
here:** the page draws no name tag yet (`hudVoice.ts` `tagDrawn`, note 227 §2.2: the tags wait for a tag drawer), so the
option's effect lands with that drawer; `FUN_00226960` is reached through a table, not a call the decompiled text
holds, so when the flag is applied is not read (note only). H183's default holds: the row on ONLINE OPTIONS (OPT-15,
research 265 §1.1), its effect here.

### 3.7 The tests

`packages/central/test/chat.test.ts` (the scope and the receiver's test, every side), `bridge.test.ts` (a TEAM line to
the sender's side only and an ALL line to every seat, before the launch and once launched, over real sockets; with two
watchers, a side's TEAM line reaching neither, a watcher's TEAM line -- scope 3 -- the other watcher only, its ALL line
every seat; the ignore filter as before), `servedMaps.test.ts` (REFUSED-MAP: the refused frame's `map`, none for a map
sent as no string), `resultsNegative.test.ts` (a
TEAM line among the messages no page may move a record with); `packages/ui/test/screens/gameLobbyScreen.test.ts`
(`ChatRecipient` 1 sends the team's line and draws the "(Team)" form, a relayed team line the same, 0 keeps "(All)"),
`briefingRoomChat.test.ts` (the round takes the polled whisper and universe line with name and kind, never the panel;
the two forms); `packages/viewer/test/gameLobbyHost.test.ts` (`chat(text, true)` on the wire, the relayed `team`
handed on), `roundChat.test.ts` (the drain's colours and scale, EXTERNAL WHISPERS on and off, an actor's whisper drawn
with it off, case-blind, a universe line always; the NetPage's `chat` to `gameChat` with no HUD post). Not driven by a
unit test: the front end's two wires (`frontEnd.ts`: `roundChat` -> `roundLine`, `gameChat` -> `chatLine`) -- a
rendered two-client run (the plan's e2e) holds them.

### 3.8 REFUSED-MAP (with SVC-19's `protocol.ts` claim)

A refusal that names the hello's map now carries it on the frame (`server.ts` `refuse`: `{ type: 'refused', reason,
map }`; `protocol.ts`'s `refused` event, `map` optional), 4004's "no such map" among them -- before, `detail.map`
reached the log alone, so the test room kept the map from its own hello to show the refusal (the merge controller's
note for TR-2). Only a map the hello sent as a string goes on the frame: a number or none is named in the log alone
(`String(ev.map)`), never "5" or "undefined" on the frame (SVC-19's review, finding 2). A game's hello's refusal names
none. No page change here beyond the type. Not a fact of the original:
the match server's frame is the port's own transport (OT.R27).

### 3.9 KEYBOARD-WHISPER: the online round's USB-keyboard text line (OT.R48)

Written 2026-10-12 (web sprint 18; the brief `../plans/briefs/2026-10-12-s18-keyboard-whisper.md`). **Reading,
reviewed** (at its merge, 1613e03ca). The code from the retail decompilation (`D:L<n>`, `FUN_<addr>`; cited, never pasted); the ELF's strings, data
and instructions read by address through `tools/elfImage.ts` (`S:0x<addr>`, a bare address an instruction or a datum).
The proven level is ONL-32's two-instance round with a USB keyboard on one instance (§7). Built in
`packages/viewer/src/roundTextLine.ts`, drawn by `hud.ts`.

- **When it reads.** The round's frame calls `FUN_002c6c70` online (`DAT_0045a0c1`) with `ComeFromLan`
  (`FUN_003045b0(0x44fe10)`) at 0 (`FUN_001f7ff0` D:L56828-56830), in every state of the round -- no pause, life or menu
  test before the call -- and `FUN_002c6c70` pops every pending key (`FUN_002dbd90`, D:L167254) while `DAT_0045a0c1`
  holds. The pad's input runs beside it untouched: nothing in the round's input reads the line. **The port's
  equivalent:** the front end's match (`matchMount.ts` `textLine.online`, given by `frontEnd.ts`) reads the session's
  `ComeFromLan` valve (`opener.valves`, 0 on the online path: `worldOfSocomCommands.ts`' PERM table; the LAN game is
  parked, `createGameCommands.ts` `HostLANGame`); an offline round (`/testroom`'s own `LoopbackMatch`) has no line.
- **The keys** (`roundKey`; D:L167256-167318). Letters 4-0x1d: `hid + 0x5d`, upper (`hid + 0x3d`) when the shift (the
  key record's +4) differs from the caps lamp (+0x14). The digit row 0x1e-0x27 from 0x3f2b30 (`1234567890`) or, shifted,
  0x3f2b20 (`!@#$%^&*()`); 0x2d-0x38 from 0x3f2b10 (`` -=[]\];'`,./ ``) or, shifted, 0x3f2b00 (`_+{}|}:"~<>?`) -- 0x32,
  the non-US #, types `]` / `}`; the keypad's 0x59-0x63 from `s_LeftStickVert_003f2d18[hid + 7]` (D:L167280), the bytes at 0x3f2d78
  past the valve names (`1234567890.`) -- so the keypad's digits type here, where the soft keyboard's do not
  (`SKB_KEYPAD_READING`); its `+ - * /` (0x57, 0x56, 0x55, 0x54) and space (0x2c). All read off the ELF. A key that
  types nothing then: 0x29 runs `FUN_002c9cc0`, 0x28 `FUN_002c9b80`, 0x2a `FUN_002c9d00` (D:L167307-167314); any other
  (Tab, the arrows, the keypad's Enter 0x58, the function keys) is dropped.
- **A character** (`FUN_002c9d90` D:L169171-169198; the test D:L169187-169188) is appended while the text's width (the line's +0xe0) is under
  `DAT_003de7b8 - DAT_003de7a8 - DAT_003de7e0 x 4` = 615 - 25 - 12 = **578** and its length under the cap less 2. The cap
  is `FUN_002c9960(0x437540, 0x80)` (D:L57430): 0x80 clamped to 5..100 (D:L168984-168997), so **100**, and the line takes
  **98** characters at most.
- **ESC** (0x29, `FUN_002c9cc0` D:L169134-169142): the text set to none (the text object's vtable +0x70 with 0) and the
  line refreshed (`FUN_00362b70`) -- the line is cleared, nothing sent. **BACKSPACE** (0x2a, `FUN_002c9d00`
  D:L169145-169168): with any text, a copy cut one character short (the copy at +1, its last character's byte zeroed)
  set back -- the last character dropped; an empty line is left alone.
- **ENTER** (`FUN_002c9b80` D:L169081-169131). With text: when it opens on `/`, the word after it is copied into an
  8-byte buffer first set from `DAT_003de7e8` -- read off the ELF: `xxxx` and four NULs -- until a space or 7
  characters; a line that ends inside the word leaves the buffer's own bytes after it (`/w` alone is `wxxx`). A word
  equal to S:0x3f2f10 `w`, case-blind (`FUN_00198b80`), hands the rest from the space to `FUN_002c9990`
  (D:L169000-169077): more than one character and a space first; then a name in double quotes (to the next quote; none,
  nothing) or bare (to the next space, kept only when not empty -- two spaces after `/w` find none); then the message
  from the next character that is not a space to the end, its own spaces kept. A name and a message go to
  `FUN_002c9810`. **Every ENTER clears the line** (D:L169128-169129), sent or not: `hello` is cleared unsent.
- **The target rule** (`FUN_002c9810` D:L168944-168982): the name looked up among the actors (`FUN_0029e590(0x4362e0)`,
  case-blind). An actor passes when it is not the sender (`FUN_002b3580`), shares a team flag (+200) with the sender, has
  +0xe1 bit 4 as the sender has it and is a spectator exactly when the sender is (`FUN_002c2fd0`); else
  `:: Player "%s" is unavailable` (S:0x3f2ef0, `FUN_001988d0` into 128 bytes, D:L168972) is posted on the main window in colour 2 (D:L168973)
  and nothing is sent. A name no actor bears, or an actor that passes: `FUN_002f4860(0x44f370, message, name)` -- the
  lobby server's whisper, the page's `BriefingRoomChat.mediusChat` (SVC-18 / ONL-23's `/lobby/find-player` then
  `/lobby/chat` type 1, the 63 cut its own) -- and the message alone echoed on the main window in colour 0 (D:L168977-168978). Both posts are
  `FUN_002b6530(0, 0x4366a0, text, colour, 0, 0)` with `$f12` 0 (0x2c98e8, 0x2c9920): the window's own scale. The
  page's actors are the score's rows (`ROUND_ACTOR_NAMES_READING`: a row's team for the flags, `alive` for the bit, no
  spectator among them); the sender the seat (`NetPage.client`: its row, a spectator role none) -- so a living
  teammate passes to the living, a dead one to the dead, and a spectator passes only a name no row bears.
- **The whisper's answers in a round** (the review's finding 2). `FUN_002f4860` asks FindPlayer first; its reply
  `FUN_002f4a20` on "no such player" calls the lobby's event callback `DAT_0044f3c8` with `MP_PLAYER_NOT_FOUND`
  (S:0x3f5620, D:L194616-194618), which is `FUN_0027e610` (set by `FUN_00276dc0` D:L122664): it hands the event to the
  state current then (D:L126518-126551) -- the front end (0x408538, `FUN_001f3bf0`, D:L126534) raises the dialog's
  event; the game state (0x4085d0, made by `FUN_001eca50`, its update `FUN_001ebed0` running the round's frame D:L50856;
  `FUN_001eb070`, D:L126544) queues S:0x3e1e90 `PLAYER NAME DOES NOT EXIST. CHECK ENTERED NAME AND TRY AGAIN.` on the
  lobby's queue as a universe line with no name (`FUN_002a4050(0x437690, 0x3e1e90, 1, 0)`, D:L50558-50561), which the
  round's frame draws in colour 1 (§3.3); any other state drops it. A sent whisper's own line is `FUN_002f4ba0`'s call of
  the current state's +0x2c (D:L194700-194707): for the game state its vtable 0x404f60's +0x2c, `FUN_001ecc40`
  (D:L51076-51099, read off the ELF), which builds `name: message` and frees it unused and posts the message alone on the
  main window at the window's scale (`$f12` 0, 0x1eccb4) in the colour its stack word carries -- 5, set at 0x2f4cd4-0x2f4ce0
  for a whisper (type 1). The loading states' +0x2c is the empty `FUN_001e7c80`. **The page:** `BriefingRoomChat.mediusChat`
  (`packages/ui`), while the round's sink is up, hands the round `ROUND_PLAYER_NOT_FOUND_TEXT` as a universe line (no
  dialog) and the own line as `own` (`RoundQueueLine.own`: posted by `roundChat.ts` with no EXTERNAL WHISPERS test, colour
  5) -- the lobby's panel untouched; with no sink, the front end's way as before. So a sent `/w` in a round shows twice:
  the echo in colour 0 at once, then the own line in colour 5 once sent. Which state counts as current is
  `ROUND_WHISPER_REPLY_STATE_READING` (§6).
- **Where and how it is drawn** (`FUN_002ca100` D:L169289-169322, called by `CHUD`'s init `FUN_001fa360`
  D:L57429-57431; `hud.ts` `TEXT_LINE_LAYOUT`): an untextured box `FUN_003646d0(25, 338, 615, 360)` (the floats
  `DAT_003de7a8..c0`; x0, y0, x1, y1 by `FUN_003646d0` D:L261746-261766) coloured black (`FUN_00364930(0, 0, 0)`); the
  text object made by its vtable +0x7c (0x3631c0) at scale 0x3f4ccccd, **0.8**, in the HUD's font (+0x498, the main
  window's too: `FUN_002b6fc0(0x4366a0, +0x498)` D:L57423; the page's `FONT_TEXT_01`), its pen `DAT_00441678`,
  `DAT_00441680` -- BSS floats the decompiled text never writes, written by the static initializer at 0x400830-0x400868
  (disassembled): 25 + `DAT_003de7e0` 3 = **28** and 360 - `DAT_003de7d8` 6 = **354**; its colour the line's +0xec,
  +0xf0, +0xf4 = **(100, 100, 20)** (over the text object's default 255 at +0x48..+0x50, `FUN_00363e70`), on the GS's
  128-as-1 scale as the message window's colours. Its fade (`FUN_002c9e90` D:L169201-169254, the line's vtable +0x38):
  while the line holds text the box's alpha (+0xa0) rises to `DAT_003de798` **76.8** at `DAT_003de7a0` **200** a second
  and the text's (+0x13c) to `DAT_003de7c8` **100** at `DAT_003de7d0` **200**; with none both fall at the same rates. The
  shadow at `min(alpha, 96)` (`FUN_003625e0`, as the help lines'). Shown (vtable +0x1c, 0x364e30) on the living HUD
  (D:L56424), the spectator's (D:L56879) and the dead's (D:L57179); hidden (+0x18, 0x364e50) with the whole HUD by
  `FUN_001f71c0` (D:L56190, beside the main window's) -- the page's tactical map keeps only the fader (`hudPass`), so the
  line goes with the rest. **A round's start clears it** (the review's finding 1): `FUN_001fb420` calls
  `FUN_002ca0b0(0x437540)` (D:L57631), which frees the text (the text object's +0x8c, `FUN_00363d50`) and zeroes both
  alphas (D:L169276-169286) -- gone at once, no fade; the page's `Hud.startRound` does the same, and the line reads its
  text from the HUD (`Hud.textLineText`), so the next ENTER sends nothing. What the page chooses beyond this is
  `ROUND_TEXT_LINE_DRAW_READING` (§6).
- **The page's keys** (`attachRoundTextKeys`; `ROUND_TEXT_KEYS_READING`, §6): the window's keydown on its capture phase,
  `KeyboardEvent.code` through `HID_BY_CODE` (`softKeyboardKeys.ts`), Shift XOR CapsLock; a key the line takes
  (`RoundTextLine.takes`) is the line's alone (default prevented, propagation stopped) -- **the game's controls
  untouched**. In a **release build** -- no key is a control (OT.R29) -- the line is the original's exactly: it takes
  every key `roundKey` acts on whenever the round is online, with no open state. In a **development build**, with the
  keyboard testing layer, it is `ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION` (§6; the Online seat's ruling at the second
  review, for the owner's local playtests on the DEV keyboard, OT.R29), a labelled browser adaptation: the line is
  closed until ENTER opens it, and while closed every key but ENTER goes on to the testing layer (WASD, G, C, Space, R,
  V as before); open, it takes every printing key as the original's does, the DEV talk key's V included; ENTER sends
  (`FUN_002c9b80`) and closes it, ESC clears (`FUN_002c9cc0`) and closes it, and every round's start closes it, empty
  or not (`Hud.roundStarts`; the second review's finding 1). *(This replaces the first review's accepted "the DEV testing keys are inert for the whole online round",
  2026-10-12.)* The voice's DEV talk key (V, `voice/headset.ts`, on the window's capture phase before the line) asks
  `roundLineKeys.ts` first and leaves a key the line takes alone (the review's finding 4: a V typed into the open line
  never keys the radio). Every other key, a chord, and every keyup pass on. In every build a key aimed at one of the
  page's own controls -- an input, a select, a textarea, a button, an editable element (`/testroom`'s map bar and
  `#maps`) -- is that control's and never opens the line: `ROUND_TEXT_LINE_FORM_CONTROL_ADAPTATION` (§6; the second
  review's finding 2), a browser adaptation the original's screen, with no such controls, needs no counterpart of. A player's text entry in every build (OT.R48), not a testing keyboard path: no `keyboardSite`
  (`keyboardTesting.ts` unchanged, the release pin `build_keyboard.test.ts` unchanged), listed by the gate scan
  (`keyboardGate.test.ts`) beside the soft keyboard's text entry, with a release-build test.
- **Under a menu** (ROUND-LINE-YIELDS, issue #260, 2026-10-17; **reading, pending review**; `ROUND_LINE_UNDER_MENU_READING`, §6). The round's frame ticks the R2 inventory (`CWeaponSel`, `FUN_00219c80`, D:L56657) and WEAPON EXCHANGE (`FUN_00240600`, D:L56660) from the pad (`DAT_0044f108`, the frame's `iVar5`) and then calls `FUN_002c6c70` (D:L56828-56830); between them no test of the controller's HUD mode (its +0x221, read into the frame's `bVar1` at D:L56538: 1 while either menu is open, research 94 `DEAD_CYCLE_WHILE_MENU_READING`, research 188), of a menu or of a life gates the call, and `FUN_002c6c70` tests only `DAT_0045a0c1` (D:L167253). Neither menu pops a USB key: `FUN_002dbd90`'s other callers are the front end's screen update `FUN_00368650` (D:L264243, called from `FUN_003654c0` D:L262268, which takes ENTER, 0x28, or the keypad's 0x58 as its own), the soft keyboard's `FUN_0038c990` (D:L283492) and `FUN_00395540` (D:L288863-288864). So the original's line is **live under WEAPON EXCHANGE and the R2 inventory**: a USB key typed with either open is the line's, the pad's buttons the menu's -- two devices. The ARMORY is not read here: the original's is the game lobby's screen, where no round's frame runs, and the page's seat ARMORY is a stand-in (`ARMORY_SEAT_READING`), which the page treats as the two HUD menus. **The page:** a release build -- no key a control (OT.R29) -- keeps the original's line under every menu; a development build's keyboard is the pad's stand-in too (the testing layer gives the ARMORY, WEAPON EXCHANGE and the R2 inventory their keys, ENTER among them), so a **closed** DEV line leaves every key, ENTER included, to a menu that holds the pad's keys (`attachRoundTextKeys`' `menu`, the mount's `menu`: `main.ts` and `matchMount.ts` pass the page's own `armory`, `exchange` and R2 inventory `isOpen()`s), and `roundLineKeys.ts` answers false for those keys -- **a browser adaptation**, a dev-keyboard one over OT.R29's shared keys, `ROUND_LINE_MENU_YIELD_ADAPTATION` (§6): the original's line is live under the menus, on its own device, and nothing of it is changed. A closed DEV line never opens on the browser's repeat of a held ENTER either (a menu's ENTER held past its close stays the menu's; `ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION`, §6). An **open** line keeps its keys under a menu, as the original's does, until ENTER or ESC closes it. The defect it fixes: since KEYBOARD-WHISPER (ef9653c34) a closed DEV line on the window's capture phase took ENTER ahead of `/testroom`'s match keys, so ENTER in the ARMORY, WEAPON EXCHANGE or the R2 inventory opened the line (red in `armoryMp`, `grenadeSelfMp`, `weaponExchangeMp`). Settled by ONL-32's two-instance round with a USB keyboard: ENTER and a letter typed with WEAPON EXCHANGE and the R2 inventory open.
- **Both matches (OT.R43).** The front end's match mounts it (`matchMount.ts` `textLine`, given by `frontEnd.ts`:
  `ComeFromLan` from the session's valves, the whisper the session's `briefing.chat.mediusChat`). `/testroom` mounts it
  too (`main.ts`, the one block after `const hud = new Hud();`, under the seat's claim), online while its `NetPage` is a
  server's (not its own `LoopbackMatch`). It has no lobby session, so **a whisper there is echoed and unsent**, as the
  original's is with the lobby down: `FUN_002f4860` tests the lobby's +0x7d and answers 0 sending nothing (D:L194549-194550),
  and `FUN_002c9810` posts the echo regardless of that answer (D:L168977-168978).
- **The tests** (unit tests against the transcription): `packages/viewer/test/roundTextLine.test.ts` (the key map, the
  parse, the target rule, the line's cap, width, ESC, BACKSPACE and ENTER, the keys online and not, a release build's,
  the mount, the HUD's place, colour, fade and draw), `matchMount.test.ts` (the front end's match: the line on the HUD, an
  enemy row refused, a name no row bears whispered and echoed, nothing offline or without the option),
  `keyboardGate.test.ts` (the listener listed; a release build types only online and only the line's keys),
  `roundChat.test.ts` (the retired name's case removed; the own line posted with EXTERNAL WHISPERS off). After the
  review: `roundTextLine.test.ts` (a new round clears the line and the next ENTER sends nothing; `/testroom`'s block held
  on `main.ts`'s source), `headset.test.ts` (a V typed into the online line never keys the talk; with no line online it
  does), `packages/ui/test/screens/briefingRoomChat.test.ts` (in a round, no such player the round's universe line and no
  dialog, the own line `own` and not the panel; with no round, the dialog). After the second review:
  `roundTextLine.test.ts` (the DEV open state -- closed, every key passed on; ENTER opens and is taken; open, the printing
  keys the line's; ENTER sends and closes, ESC clears and closes -- and a release build's line taking its keys at once
  and after ENTER), `headset.test.ts` (V talks while the line is closed, never once it is open). PAR-17's pin
  (`parityExemptions.test.ts`) held: `matchMount.ts` takes the queue's line type from `roundChat.ts`, which re-exports
  `@s2u/ui`'s own -- one definition, no `@s2u/ui` import in the mount. After the second pass's review:
  `roundTextLine.test.ts` (an open, empty DEV line closed by a new round, G then the testing layer's; a key aimed at a
  select, an input, a textarea, a button or an editable element passing untouched in a release build, ENTER at a select
  not opening the DEV line), `testroomMapBar.test.ts` (with the release line mounted online, the map bar keeps every key,
  by code too, and its keyed change is still undone). After ROUND-LINE-YIELDS: `roundTextLine.test.ts` (a closed DEV line under a menu leaves ENTER to it and the registry answers false, the menu closed ENTER opens it; an open line keeps its keys under a menu until ENTER closes it; a repeated ENTER never opens it; a release build unchanged under a menu; `attachRoundTextKeys`' fourth argument absent, no menu).

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `CHAT_LINE_ARGS_READING` (`packages/ui/src/screens/briefingRoomChat.ts`) | received: one text "name: message", no name; own: the session's name, kind 5 a whisper else 0; usage: "" and kind 1 | the screen's line call's arguments where the decompiled text drops the stack word (the own line, 0x2f4cc4-0x2f4d34; the usage, 0x281fe0-0x282040) and where the caller has no block (the front end's frame, 0x1f4640, its dequeue 0x1f46b8-0x1f46ec), read from the instructions | a second reader of the three call sites; ONL-32's capture of a briefing room with a received line and an own line (`A_chat_02_entered.png`, `B_chat_A_to_B.png`) | reading, reviewed 2026-10-10 (ONL-23's review re-derived it from the ELF) |
| `CHAT_POLL_MS_ADAPTATION` (`briefingRoomChat.ts`) | 1000 ms, one request at a time, under the ticket sent with | the lobby server's push of ChatFwdMessage, which the HTTP seam does not make | a push on a socket the page holds in the briefing room (none today) | adaptation (no original value) |
| `OWN_WHISPER_BY_NAME_ADAPTATION` (`briefingRoomChat.ts`) | the target is the sender when FindPlayer's name is the session's, case-blind | `FUN_002f4ba0`'s compare of the target with the own account id (D:L194700), which the page does not hold | the login's reply carrying the account id | adaptation |
| `ROUND_KEYBOARD_WHISPER_READING` (`packages/viewer/src/roundChat.ts` until 2026-10-12; SVC-19's review, finding 1; §3.1) | was: not built here | the original's typed line in an online round (`FUN_002c6c70`, `FUN_002c9b80`, `FUN_002c9990`, `FUN_002c9810`) | built by KEYBOARD-WHISPER (§3.9) | retired 2026-10-12 (KEYBOARD-WHISPER, OT.R48: the owner, "keyboard in round is acceptable"): the line, its `/w` and its target rule built in `roundTextLine.ts` |
| `ROUND_ACTOR_NAMES_READING` (`packages/viewer/src/roundChat.ts`; SVC-19, §3.3) | the round's players as the room's score names them (`NetPage.rows`): the page's own seat and the dead among them, a spectator not | who is "an actor of the round" for a whisper posted with EXTERNAL WHISPERS off: `FUN_0029e590` (D:L144706-144720) walks the actor list 0x4362e0 by name, its adds not traced | the list's adds read (`FUN_001eaaf0`, `FUN_001feae0` among D:L145281-145377), or ONL-32's two-instance round: a whisper from the game's spectator, and from outside it, with the option off | reading, reviewed (SVC-19, 2026-10-12) |
| `ROUND_TEXT_LINE_DRAW_READING` (`packages/viewer/src/roundTextLine.ts`; KEYBOARD-WHISPER, §3.9) | the width `FUN_002c9d90` tests taken as `hudFont`'s `textWidth` at 0.8; the line hidden with the whole HUD by the tactical map (`hudPass`, as `FUN_001f71c0` hides it, D:L56190) and by none of the scoreboard's, the round screens' or a spectator view's hides; drawn as typed; anchored on the centre line | the line's +0xe0 (its text object's +0x3c), whose writer is not read; whether the scoreboard's or the round screens' parts hide the line; the set text's string-table lookup (`FUN_003631f0` D:L260982-: `FUN_003a3700(0x49e9d0, text)`, a typed line equal to a string's key drawn as that string), not reproduced | the width's writer read; ONL-32's two-instance round with a USB keyboard: the line's frames, over the scoreboard, against the page's | reading, reviewed (KEYBOARD-WHISPER, 2026-10-12) |
| `ROUND_TEXT_KEYS_READING` (`packages/viewer/src/roundTextLine.ts`; KEYBOARD-WHISPER, §3.9) | `KeyboardEvent.code` -> HID (`HID_BY_CODE`), the US characters, Shift XOR CapsLock, the browser's repeat typed, chords the browser's; the line's keys its alone on the window's capture phase while it takes them -- a release build always online, a development build only while open (`ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION`); the DEV talk key asks `roundLineKeys.ts` and leaves them | the USB keyboard `FUN_002dbd90` pops in an online round, the USB library's repeat not read; the page's own keys beside it (a browser adaptation) | the USB library's repeat read; ONL-32's round with a USB keyboard | reading, reviewed (KEYBOARD-WHISPER, 2026-10-12) |
| `ROUND_WHISPER_REPLY_STATE_READING` (`packages/ui/src/screens/briefingRoomChat.ts`; KEYBOARD-WHISPER's review, finding 2; §3.9) | a whisper's two answers go to the round while its sink is up (from the match's mount to its return), else the front end's way | the state current when FindPlayer's reply and the send's answer come (`FUN_0027e610` D:L126518-126551; `FUN_002f4ba0`'s +0x2c, D:L194707): the front end's, the game state's, or another that drops both (the loading states' empty +0x2c `FUN_001e7c80`) | ONL-32's round: a whisper whose reply comes across the match's load and its end | reading, reviewed (KEYBOARD-WHISPER, 2026-10-12) |
| `ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION` (`packages/viewer/src/roundTextLine.ts`; the second review's finding B; §3.9) | a development build's line closed until ENTER opens it -- a fresh ENTER, not the browser's repeat (ROUND-LINE-YIELDS), and none under a menu (`ROUND_LINE_MENU_YIELD_ADAPTATION`); open, every key `FUN_002c6c70` acts on, a menu open or not; ENTER sends and closes, ESC clears and closes, every round's start closes it, empty or not; a release build the original's, no open state | none: the original's line has no open state (its keyboard is no game control); the owner's local playtests on the DEV keyboard layer (OT.R29) need its keys through an online round | the owner's word on the DEV keyboard layer (OT.R29), if it changes; nothing of the original | adaptation (a development build's only; KEYBOARD-WHISPER, 2026-10-12) |
| `ROUND_TEXT_LINE_FORM_CONTROL_ADAPTATION` (`packages/viewer/src/roundTextLine.ts`; the second pass's review, finding 2; §3.9) | every build: a key whose target is an input, a select, a textarea, a button or an editable element is left to it, and never opens the line | none: the original's screen has no page controls; `/testroom`'s map bar and `#maps` (and any control a page shows over the round) keep their keys | nothing of the original; a page control added over a round | adaptation (every build; KEYBOARD-WHISPER, 2026-10-12) |
| `ROUND_LINE_UNDER_MENU_READING` (`packages/viewer/src/roundTextLine.ts`; ROUND-LINE-YIELDS, issue #260; §3.9) | the line live under WEAPON EXCHANGE and the R2 inventory (a release build's line takes its keys with either open; a development build's open line keeps them); the page's seat ARMORY treated as the two | whether the original's line takes the USB keys while a menu is open: read for the two HUD menus (`FUN_001f7ff0` D:L56657, D:L56660, then D:L56828-56830: no HUD-mode, menu or life test; neither menu pops `FUN_002dbd90`), not for the ARMORY, the original's a game lobby screen with no round running (`ARMORY_SEAT_READING`'s stand-in) | ONL-32's two-instance round with a USB keyboard: ENTER and a letter typed with WEAPON EXCHANGE and the R2 inventory open; the lobby's ARMORY replacing the seat stand-in (ONL-17) | reading, pending review (ROUND-LINE-YIELDS, 2026-10-17) |
| `ROUND_LINE_MENU_YIELD_ADAPTATION` (`packages/viewer/src/roundTextLine.ts`; ROUND-LINE-YIELDS, issue #260; §3.9) | a development build: while a menu holds the pad's keys (the page's ARMORY, WEAPON EXCHANGE, R2 inventory: `main.ts` and `matchMount.ts` pass their `isOpen()`s) a closed line takes no key and does not open, ENTER going on to the menu and `roundLineKeys.ts` answering false; an open line keeps its keys; a release build the original's | none: a dev-keyboard adaptation over OT.R29's shared keys -- the page's development keyboard is both the line's and the pad's stand-in, where the original's line is live under the menus on its own device (`ROUND_LINE_UNDER_MENU_READING`) | the owner's word on the DEV keyboard layer (OT.R29), if it changes; nothing of the original | adaptation (a development build's only; ROUND-LINE-YIELDS, 2026-10-17) |

The server's names this note leans on stand in research 263 §6 as they were (`CHAT_POLL_ADAPTATION`
now has its period, here); no server name is added.

ROUND-LINE-YIELDS (§3.9, issue #260) adds `ROUND_LINE_UNDER_MENU_READING` and `ROUND_LINE_MENU_YIELD_ADAPTATION` (above; both in research 101 §5) and widens `ROUND_TEXT_LINE_DEV_OPEN_ADAPTATION` (a closed DEV line does not open on the browser's repeat of ENTER).

KEYBOARD-WHISPER (§3.9): `ROUND_KEYBOARD_WHISPER_READING` retired (OT.R48); it adds `ROUND_TEXT_LINE_DRAW_READING` and
`ROUND_TEXT_KEYS_READING` (above; all three in research 101 §5), and after its review the ui's
`ROUND_WHISPER_REPLY_STATE_READING` (above; a ui name, so in no row of 101); `ROUND_ACTOR_NAMES_READING` now also stands for the
target rule's actors (§3.9). `TEXT_LINE_LAYOUT`, `ROUND_TEXT_LINE_CAP`, `WHISPER_WORD`, `UNAVAILABLE_FORMAT` and the
key tables are transcriptions, not stand-ins.

SVC-19 (§3) adds `ROUND_ACTOR_NAMES_READING` and, after its review, `ROUND_KEYBOARD_WHISPER_READING` (retired since; both in
research 101 §5) and retires the server's
`ROUND_CHAT_SCOPE_PLACEHOLDER` (research 263 §6): the scopes and their reach are read, the dead and the spectators among
them, so no name stands for either of the brief's two unknowns. `TEAM_CHAT_COLOUR`, `GAME_CHAT_SCOPE` and
`EXTERNAL_WHISPERS_INITIAL` are transcriptions (§3.1-§3.3), not stand-ins.

ONL-16 (§2) adds no name: its three readings are the disc's scripts and the code's call graph, every one cited where
it stands, and the one unread writer it touches -- the console's clear of `late_joiner` -- is research 165's
`LATE_JOINER_NEXT_ROUND_READING` (`gameLobbyCommands.ts`), unchanged.

## 7. What is left

- **The proven level**: the two-client exchange against `A_chat_02_entered.png`, `B_chat_A_to_B.png`,
  `A_chat_B_to_A.png` (PC research 66 rounds 2-3) -- a browser window on the controller's word, owed; and ONL-32's
  transcripts (a line, a whisper, an ignored sender's line on the ignorer's and a third's console).
- ~~**The typechecks**: the ui and viewer packages' at the merge (the seat runs them).~~ *(2026-10-10: both exit 0 at
  ONL-23's merge, 5f0c6a83d, after the typecheck fix 21c767d4f.)*
- **The player info's whisper** (`playerinfo_send_message`): runs as the disc has it, reached only once PLAYER LIST
  has rows (`ROOM_PLAYER_LIST_PARKED_READING`; ONL-30's player info).
- ~~**The ignore by name** from the chat keyboard's Action2 (`on_skb_apply_2`: `CopyUIVar`, `AddToIgnore`) -- ONL-25's.~~
  Built by ONL-25, 2026-10-11 (research 269 §1.4): the name typed is ignored.
- ~~**The late joiner's popup** in the game lobby's `do_chat` (#360) -- ONL-16's.~~ Read and pinned (§2.1, ONL-16): it
  already ran as the disc has it.
- ~~**The round's lines in the game lobby's panel after a match** (§2.3): the console's receiver appends them to
  BCHATLISTVAR; the page's panel is not fed during a match -- SVC-19's, with the round's chat.~~ *2026-10-12: built by
  SVC-19 (§3.4): the match hands the room's `chat` to the panel.*
- **Temporary uiVars at the state change**: the page never calls `UiVarManager.clearTemporary` (no caller in
  `packages/`), where the console frees longevity 1 at its state changes (`FUN_00385c30`; research 104). The launch
  test calls it itself, so BCHATLISTVAR's permanence (§2.2, §2.3) is held by a test; that the page's own launch frees
  nothing is a front-end matter outside ONL-16, noted for the controller.
- **A universe line's sender** (type 2): drawn as read; no sender in the client (research 263 §7).
- ~~**The round's chat** (team scopes, the HUD's window, EnableExternalWhispers): SVC-19's. Until then, a front end
  ticking through a round with the lobby up polls in-round whispers into the hidden game lobby panel, where the
  original draws them on the HUD (the round's frame dequeues them, D:L56708-56719).~~ *2026-10-12: built by SVC-19
  (§3.1-§3.3; reading, reviewed).* Left of it:
  - **The proven level**: ONL-32's two-instance recomp round -- a team line, an all line, a custom message, a whisper
    from outside with EXTERNAL WHISPERS on and off, each side's window and lobby panel against the page's.
  - ~~**The in-game menu's IN-GAME TEXT MESSAGES** (`FUN_002041e0` D:L61858-61867, entry 0xb): the round's options menu
    is not built in the port, so EXTERNAL WHISPERS is set from ONLINE OPTIONS only (OPT-15).~~ *2026-10-13: built by
    MATCH-01 (§8.4; reading, reviewed): the row writes the valve and the global the round's drain reads; its mount
    in the two pages is the seat's (§8.7).*
  - **TEAMMATE NAMES' effect** (§3.6): waits for the name tags' drawer (note 227 §2.2).
  - **The front end's two wires** (§3.7): held by no unit test; a rendered two-client run is owed.
  - **The queue's nine** (§3.3): not reproduced; the page hands each polled line on.
  - ~~**The online round's USB-keyboard whisper** (§3.1, `ROUND_KEYBOARD_WHISPER_READING`): read, not built here.~~
    *2026-10-12: built by KEYBOARD-WHISPER under OT.R48 (§3.9; the name retired): every item of the spec below built,
    the two it left to the row -- ESC's and BACKSPACE's bodies, the line's place and font -- read in §3.9 (and the cap
    corrected there: 100, a key taken under 98). Left of it: its proof (below); `/testroom`'s wiring (a `main.ts` block,
    the seat's claim -- made after the review, §3.9); the readings of §6.* The spec as it stood, every value read at the cites of §3.1:
    - *When it reads.* The round's frame polls the keyboard only online and with `ComeFromLan` 0 (`FUN_001f7ff0`
      D:L56828-56830); `FUN_002c6c70` (D:L167242-167320) drains every pending key code each frame. The page's physical
      keys feed it only inside the online match: a release-build exception to the gate `keyboardGate.test.ts` holds
      (OT.R29), the pad's play untouched.
    - *What it reads.* USB key codes through `FUN_002c6c70`'s map: letters 4-0x1d (shift XOR caps lock picks the
      case), the digit rows 0x1e-0x27 and the symbols 0x2d-0x38 from the tables at 0x3f2b00-0x3f2b30 (shifted or
      not), the keypad 0x59-0x63 and its `+ - * /` (0x57, 0x56, 0x55, 0x54), space (0x2c); a printing key appends to
      the line (`FUN_002c9d90`), ENTER (0x28) sends (`FUN_002c9b80`), and 0x29 / 0x2a go to `FUN_002c9cc0` /
      `FUN_002c9d00` (escape and backspace by the USB table; their bodies to be read by the row).
    - *Where it draws.* The HUD's text line 0x437540, 128 characters (`FUN_002c9960(0x437540, 0x80)`, set up by
      `FUN_001fa360` D:L57429-57431, `FUN_002ca100` with the HUD's +0x498), drawn on the living HUD (`FUN_001f7a90`
      D:L56424), the dead's (D:L57179) and a spectator's (D:L56879); its place and font are `FUN_001fa360`'s and
      `FUN_002ca100`'s, to be read by the row.
    - *The send.* ENTER takes a line opening `/` and a word of at most seven letters matching `w` (S:0x3f2f10,
      case-blind, `FUN_00198b80`), then `FUN_002c9990` (D:L169000-): a space, the name bare or in quotes, a space, the
      message. Any other line is not sent. Every ENTER clears the line (D:L169128-169129).
    - *The target rule* (`FUN_002c9810` D:L168944-168982). The name is looked up among the round's actors
      (`FUN_0029e590`, case-blind; the page's `ROUND_ACTOR_NAMES_READING`). An actor passes only when it is not the
      sender, shares a +200 team flag with the sender, has +0xe1 bit 4 (alive) as the sender has it, and is a spectator
      exactly when the sender is one (`FUN_002c2fd0`): a living teammate to the living, a dead one to the dead, a
      spectator to a spectator. An actor that fails gets `:: Player "%s" is unavailable` (S:0x3f2ef0) on the HUD's main
      window in colour 2, and nothing is sent. A name no actor bears passes. A passing whisper goes through the lobby
      server (`FUN_002f4860`, §1.2: the page's `/lobby/find-player` then `/lobby/chat`, type 1), and the message is
      echoed on the main window in colour 0 at the window's scale (`FUN_002b6530(0, 0x4366a0, text, 0, 0, 0)`).
    - *The receiver.* The whisper arrives as any whisper does: the round's drain (§3.3), under EXTERNAL WHISPERS'
      rule, colour 5.
    - *Its proof.* ONL-32's two-instance round with a USB keyboard on one instance: a `/w` to a teammate, to a living
      enemy (unavailable), to a name outside the game, each instance's message window against the page's.

## 8. The in-round START menu (MATCH-01)

- Date: 2026-10-13 (web sprint 18, MATCH-01; the plan `../plans/2026-10-11-web-sprint-18-the-carried-and-the-players-pages.md`,
  its row MATCH-01; the brief `../plans/briefs/2026-10-13-s18-match-01-start-menu.md`; roadmap 07 MATCH-01). The
  owner's priority (2026-10-13 ~01:10Z, in the merge controller's seat): "Please ensure that the in game start menu is a
  priority tonight". Filed here, as a new section of 266 rather than a note of its own: one of its rows is this note's
  EXTERNAL WHISPERS (§3.3), and a new number would need the counter's bump in PROCESS.
- Status: **reading, reviewed** (at its merge, 504ae730d). Every value is transcribed from the retail decompilation (`D:L<n>`,
  `FUN_<addr>`; cited, never pasted), from the ELF by address through `tools/elfImage.ts` (`S:0x<addr>` a string; the
  colours' static initialiser at 0x3fdb20-0x3fdbbc, whose stores the decompiled text drops), and from `HudCLOC.rdr`
  (`RUN/READERC.ZAR`) through the repository's readers (`tauntCaptions`). Nothing is measured on the original running:
  the proven level is ONL-32's window (a recomp online round, START pressed, each row captured as the cursor walks it,
  each toggle's valve after the press).
- Code: `packages/viewer/src/startMenu.ts` (new: the table, `rowSelectable`, `startMenuLayout`, `rowLabel`,
  `StartMenu`, `drawStartMenu`, `sessionStartMenuOptions`, `localStartMenuOptions`, `playOptionsGlobals`); `hud.ts` (`START_MENU_HIDES`, the `startMenu` element,
  `HudModel.startMenu` / `spectatorHud`, `Hud.setStartMenu` / `setSpectatorHud`, `hudPass`'s two hides);
  `voice/headset.ts` (`Headset.setVoiceMask`); `matchTaunts.ts` (`runAndTalk`); ui `screens/optionsCommands.ts`
  (`OptionGlobals.set`). The two mounts are the seat's hot hunks (§8.7). Test: `packages/viewer/test/startMenu.test.ts`.

### 8.1 The menu and where it lives

The menu is the HUD's `CHUD+0x18900` -- the class named next to its strings, `CZPauseTest` (S:0x3e3ad8): made by
`FUN_00205800` (D:L62324-62375: the table at +0x18 allocated as 12 entries of 0xa4 bytes, `FUN_00182070(.., 0xa4, 0xc)`,
each made by `FUN_00205970` as type 12 with no flags), filled by **`FUN_00202520`** (D:L61116-61617) from the HUD's
init `FUN_001fa360` (D:L57454; the menu's font, its +0x20, is the HUD's own `CHUD+0x498` just before, D:L57453: the
face every HUD string uses, `font_text_01`), re-armed at each round's start by `FUN_00202370` (D:L61068-61104, from
`FUN_001fb420` D:L57616), closed by the HUD's reset `FUN_001fb790` (D:L57716), ticked each frame by `FUN_00201690`
(D:L60726-61025, from the HUD's frame D:L56697, only with a pad), opened by `FUN_00204a40` (D:L61922-62142) from
`FUN_002011f0` (D:L60615-60708), its rows acted on by `FUN_002041e0` (D:L61644-61918), and closed by `FUN_00205200`
(D:L62146-62212). **It is code-drawn**: no `.rdr`; its labels are code literals or HudCLOC strings by id
(`FUN_00361b40`), so the builder is code, as the brief expected.

### 8.2 The row table (`FUN_00202520` D:L61191-61335)

Entry i of the table is at +0x18 + 0xa4 i: its text object (+0x00, vtable at +0xc), its label's HudCLOC id at +0x98,
its type at +0x9c, its flags at +0x9d. **Every entry's type is its index** (the labels' writes in `FUN_002041e0`'s
cases address entry `type`: +0x1ec is 3 x 0xa4, +0x290 4 x 0xa4, ... +0x70c 11 x 0xa4). The flags: bit 0 offered
offline, bit 1 offered in multiplayer (`FUN_00205a70`), bit 2 its label set by code (`FUN_00204a40` D:L62017), bit 3 a
press starts the blink (D:L61869-61870), bit 4 a press closes the menu (D:L61872-61873). The id 0xffffffff sets bit 2
too, but each entry then writes bit 2 itself.

| entry / type | +0x98 (HudCLOC) | label | offline | online | code label | closes | written at |
|---|---|---|---|---|---|---|---|
| 0 | 60512 (0xec60) | RESUME | 1 | 1 | 0 | 1 | D:L61193-61203 |
| 1 | 60514 (0xec62) | REPLAY MISSION | 1 | 0 | 0 | 0 | D:L61205-61215 |
| 2 | 60513 (0xec61) | ABORT | 1 | 1 | 0 | 0 | D:L61217-61227 |
| 3 | 60519 (0xec67) | INVERT PITCH: ON / OFF (60519 / 60520 by the sign of `DAT_003df198`) | 1 | 1 | 1 | 0 | D:L61229-61239 |
| 4 | -1 | VOICE MODULATION: ON / OFF (S:0x3e3b60 / 0x3e3b80) | 0 | 1 | 1 | 0 | D:L61277-61287 |
| 5 | -1 | RUN AND TALK: ON / OFF (S:0x3e3c20 / 0x3e3c40) | 0 | 1 | 1 | 0 | D:L61253-61263 |
| 6 | 60517 (0xec65) | HELP: ON / OFF (60517 / 60518 by `FUN_001fdeb0`) | 1 | 0 | 1 | 0 | D:L61289-61299 |
| 7 | 60515 (0xec63) | AIM ASSIST: ON / OFF (60515 / 60516 by `DAT_003df1a0`) | 1 | 0 | 1 | 0 | D:L61301-61311 |
| 8 | -1 | VIBRATION: ON / VIBRATION OFF (S:0x3e3c58 / 0x3e3c68) | 1 | 1 | 1 | 0 | D:L61241-61251 |
| 9 | -1 | FIREMODE/TACMAP or FIREMODE/SCOREBOARD: ALTERNATE / DEFAULT (S:0x3e3be0-0x3e3c00, 0x3e3ba0-0x3e3bc0) | 1 | 1 | 1 | 0 | D:L61265-61275 |
| 10 | -1 | SPECTATOR HUD: ON / OFF (S:0x3e3b20 / 0x3e3b40) | 0 | 1 | 1 | 0 | D:L61325-61335 |
| 11 | -1 | IN-GAME TEXT MESSAGES : ON / OFF (S:0x3e3c80 / 0x3e3ca0) | 0 | 1 | 1 | 0 | D:L61313-61323 |

Every entry blinks (bit 3). The HudCLOC strings are read off the disc (`HudCLOC.rdr`: 60512 RESUME, 60513 ABORT, 60514
REPLAY MISSION, 60515/60516 AIM ASSIST: ON/OFF, 60517/60518 HELP: ON/OFF, 60519/60520 INVERT PITCH: ON/OFF; the
dev-disc case of the test). A code-labelled row of no case would be "DYNAMIC TEXT: MISSING" (S:0x3e3e00,
D:L62113-62114); none is.

### 8.3 Which rows a seat is offered, in what order

`FUN_00205a70` (D:L62407-62452) answers whether entry i is offered. **Offline**: bit 0, AIM ASSIST also needing the
`NoAutoAim` valve (S:0x3e3e48) 0 where it is held. **In multiplayer** (`DAT_0045a0c1`): a player who is not a spectator
(`FUN_002c2fa0` 0, research 179) -- bit 1, SPECTATOR HUD never; a spectator -- bit 1, VOICE MODULATION and RUN AND TALK
never; and IN-GAME TEXT MESSAGES never while `FUN_003045b0(0x44fe10)` holds -- the `ComeFromLan` valve (S:0x3f6328)
non-zero, a LAN game. The builder places the offered rows on lines in table order (D:L61343-61363: line n at y 155 +
21 n, the others hidden). So **the online rows, in order**:

| seat | rows |
|---|---|
| a player (living or dead), online | RESUME, ABORT, INVERT PITCH, VOICE MODULATION, RUN AND TALK, VIBRATION, FIREMODE/SCOREBOARD, IN-GAME TEXT MESSAGES |
| a spectator, online | RESUME, ABORT, INVERT PITCH, VIBRATION, FIREMODE/SCOREBOARD, SPECTATOR HUD, IN-GAME TEXT MESSAGES |
| either, on a LAN | the same, less IN-GAME TEXT MESSAGES |
| offline (T7, for comparison) | RESUME, REPLAY MISSION, ABORT, INVERT PITCH, HELP, AIM ASSIST, VIBRATION, FIREMODE/TACMAP -- roadmap 07's T7 (the desktop's research 78 §1, its run `ingame1`), the same eight in the same order |

The dead are not spectators: no alive test anywhere in the menu. Row 9's multiplayer label rule (D:L62074-62094 at the
open, D:L61823-61846 at a press): FIREMODE/TACMAP offline, FIREMODE/SCOREBOARD in multiplayer, ALTERNATE while
`DAT_0044d500` is set.

**The show and the hide, and REPLAY / ABORT (for MATCH-02 and research 114).** The widgets' slot +0x1c is the show and
+0x18 the hide: the builder hides the rows a seat is not offered with +0x18 and shows the others with +0x1c
(D:L61347-61359), the open shows the menu with +0x1c (D:L61953), the close hides it with +0x18 (D:L62206). So type 1
(entry 1, REPLAY MISSION) shows the confirm lines +0xeb8..+0xfe8 -- "Are you sure you want" / "to replay the mission?"
(S:0x3e3d20, set by `FUN_00202370` D:L61097) -- and sets +0xbe0 to 1, and type 2 (entry 2, ABORT) shows +0xcf0..+0xe20,
"to abort the game?" (S:0x3e3d00), and sets +0xbe0 to 2 (D:L61679-61698). The confirm's ACCEPT then writes
`mission_abort` 2 for choice 1 (REPLAY: the exit state pops with no screen) and 1 for choice 2 (ABORT, with
`FUN_00592ac0`), as research 114 §1.5 reads the writes (D:L61884-61908). Research 114 pairs the rows the other way
(`EXIT_PAUSE_ROW_READING`: "+0x18 shows and +0x1c hides"); the builder's and the open's own use of the two slots says
the reverse. MATCH-02 settled it (§8.10.1): the box class's own two slots read -- `FUN_00364e30` sets the visible bit and
`FUN_00364e50` clears it -- and research 114 §1.5 and §7 corrected.

### 8.4 Each row's effect (`FUN_002041e0`'s cases, D:L61679-61867)

A row acts on CROSS let go (the pad's byte +10 at 3, `ParseButtonAnim`'s rising, research 117; D:L61660-61662) while
the menu is not in its confirm: the select sound `.TCM_SELECT` (+0xbd0, S:0x3e3d48, D:L61672-61674), the case, the blink
(bit 3), the close (bit 4).

| row | the original | the page (`startMenu.ts` `StartMenu.effect`) |
|---|---|---|
| RESUME (0) | no case; its bit 4 closes (D:L61872-61873) | closed |
| ABORT (2) | the confirm: +0xbdc 1, +0xbe0 2, the abort lines shown (D:L61689-61698) | the confirm (MATCH-02, §8.10): the menu's own state, drawn over it, the menu staying up; its YES `StartMenuDeps.abort` |
| INVERT PITCH (3) | `DAT_003df198 *= -1`; `INVERT_PITCH_CONTROLLER` (S:0x3e3d80) found or made TEMP (`FUN_00351ff0(.., 2)`) and written 1 when the sign is not positive, else 0; the label 60519 / 60520 (D:L61699-61721) | the global (`OptionGlobals.set`) and the valve (TEMP), so the stored options the match applies (`./matchOptions`, `playOptionsOf`) carry the new sign to the camera |
| VOICE MODULATION (4) | `DAT_003df1a8` flipped; the `VoiceMask` valve (S:0x3e3db8) written where it is held (`FUN_00351ef0`); `FUN_0030e5a0(voice, DAT_003df1a8 == 0)`, no spectator test (D:L61722-61746; research 226 §5) | the page's global (`StartMenuPage`, 1 at the start), the valve where held, and `Headset.setVoiceMask` (the round's blocks unshifted while it is off) |
| RUN AND TALK (5) | `DAT_0044d4f8` flipped (.bss: 0 at the start); the label (D:L61748-61757) | the page's global; `./matchTaunts` hands it to the talk input (`runAndTalk`: L2 held is the talk, research 197); the lanes' `playerLanes` option is the mounts' (§8.7) |
| VIBRATION (8) | `FUN_00592be0(!FUN_00592bd0())` (`DAT_00650698`, 1 in the ELF's data; `StoreOptions` sets it from `VIBRATION_CONTROLLER`, D:L125188-125193); the valve where held (D:L61794-61822) | **OPT-13's call followed** (MENU-OC-9, the owner's, open): OPTIONS' VIBRATION row is parked (OT.R8: "their pad does nothing, no sound"), so the row is drawn and offered with its state's label and its press does nothing (`START_MENU_PARKED_TYPES`) |
| FIREMODE (9) | `DAT_0044d500` flipped and `FUN_00592050` (the FireMode and TACMAP buttons swapped); **no valve** (D:L61823-61846) | the global `FIREMODESWAP_CONTROLLER` only: the stored options carry the swap and the firearm's setting (`fireModeSetting`); the next `StoreOptions` copies the valve over it, as the original's does |
| SPECTATOR HUD (10) | `DAT_003dc3e0` flipped (D:L61847-61857); off, the frame hides what the scoreboard hides (D:L56808-56827), for every seat; 1 again at the HUD's teardown (D:L57799) | the menu's own flag and `Hud.setSpectatorHud`: `hudPass` drops `SCOREBOARD_HIDES` while it is off |
| IN-GAME TEXT MESSAGES (11) | `FUN_002a41f0(DAT_003de620 == 0)`: `EnableExternalWhispers` (S:0x3f09d0) found or made PERM and written, the global set (D:L147670-147692; D:L61858-61867) | the valve (PERM) and the global: the round's drain (`./roundChat`, §3.3) reads the global, so a whisper from outside the game is dropped while it is off |
| REPLAY MISSION, HELP, AIM ASSIST | offline's (T7): the replay confirm; `FUN_001fde30` / `FUN_001fdeb0` over a valve at `DAT_00408e30`; `DAT_003df1a0` and `AutoAim` (D:L61759-61793) | transcribed, not mounted (`START_MENU_OFFLINE_ROWS_READING`): AIM ASSIST's global and valve written, REPLAY's and HELP's presses nothing |

The original also relabels the toggled row in place (each case's +0x70 call); the page draws each row's label from the
state at every frame, which is the same picture.

### 8.5 The open, the navigation, the close, the HUD

- **The open** (`FUN_002011f0` D:L60628-60655): no START for `DAT_003dc420` = 2.0 s after the round's start and the
  build (`DAT_00409088` counts the seconds, zeroed by `FUN_00202370` and the builder); then START's press (byte +1 at 1,
  falling) opens it while bit 3 of the local controller's +0x171 is set (`START_MENU_CONTROL_FLAG_READING`), no ABORT has
  been confirmed (`DAT_00409070`), and the control state is neither 3 (this menu) nor 5. Offline a pad gone opens it too
  (+0xdc, D:L60644-60646; not mounted). `FUN_00204a40` then: the Chat menu closed (`FUN_00235300(0x413120, 0)`,
  D:L61936); **offline only** the sound paused and the game's speed held (D:L61948-61951, D:L61978-61995) -- **online
  the round runs on**; the control state saved and set to 3 (D:L61962-61963; the SEAL's buttons are read in state 0
  only, e.g. D:L451674, D:L453192 -- the page's lanes take nothing while it is up, as its other menus do); the hide-all
  (`FUN_001f77c0`, D:L61964; `START_MENU_HIDES`, mapped as research 282 §1 maps it, `START_MENU_HIDES_READING`); the
  cursor on entry 0, RESUME (D:L61973), the bar on its line (D:L61974-61976), every row (100, 100, 100) at alpha 128
  (D:L62119-62126), the title the mission's name (`FUN_002a42a0(0x4364e0)`, D:L62129-62131: `mission.rdr`'s `description`, read by MATCH-02b, §8.11.1),
  and last **the open's sound**: +0xbd0, `.TCM_SELECT` (D:L62136-62139), the call CROSS's press makes (D:L61672-61673).
  The pad and the look: the open marks START held on the pad (`FUN_002da160(pad, 0, 2)`, D:L61945-61946: byte +1 at 2)
  and the close lets CROSS, SQUARE, CIRCLE and TRIANGLE go (`FUN_002da160(pad, 9 / 8 / 6 / 7, 0)`, D:L62165-62169) --
  the page's `./exchangeInput` holding each button the menu took until it is let go; the open clears bit 7 of the
  actor's +0x5e1 (D:L61999-62000), set again at the close (D:L62203-62205), which gates the look's update (D:L418390,
  `FUN_00550ef0`) -- the pages' camera suspended while the menu holds the pad (`fly.setInputSuspended`, `menuOpen`).
  Not transcribed (`START_MENU_OPEN_CALLS_READING`): `FUN_0023b190(0x414680, 1)` (D:L61937; the round's code pairs it
  with the Chat menu's close, D:L56643-56644, D:L78532-78533; its object not read), `FUN_00592ac0(controller)` (D:L61940;
  the pad's +0xb4 / +0xb5, `FUN_002da930(0)`, the controller's +0x13c-+0x144, `FUN_002d9e00`, `FUN_00543a80`), and each
  open frame the sound frame at 0 s (`FUN_00341a60(0, ..)`, D:L60796).
  The page places the rows at the open (`START_MENU_LAYOUT_TIME_READING`: the original at the HUD's init, by the seat
  then; the same rows unless the seat's spectator state changes inside the HUD's life).
- **The cursor** (`FUN_00201690` D:L60805-60867): a gate (`DAT_00409098`) opens once `DAT_00409090` passes
  `DAT_003dc430` = 0.2 s; open, DOWN or UP pressed or held (bytes +6 / +5 at 1 or 2) moves to the next offered entry,
  12 wrapping to 0 and -1 to 11, with `.TCM_SLIDE` (S:0x3e3d58, +0xbd8 / +0xbd4), shuts the gate and puts every row's
  alpha back to 128. So a held direction repeats every 0.2 s and a press inside the gate is not taken.
- **The rows' presses** (`FUN_002041e0`, called only with bit 3 set, D:L60891-60893): START pressed closes
  (D:L61664-61666); TRIANGLE let go closes unless START is held (D:L61669-61671); CROSS let go acts (§8.4). The close
  (`FUN_00205200`) plays nothing; offline it resumes the sound and the speed (D:L62152-62202); it sets +0xbc1, and the HUD's
  show `FUN_001f7a90` (D:L56366-56447) runs at the first closed tick past the lockout (D:L60702-60704) -- after the open
  branch on that tick, and the open (D:L61920-62140) never writes +0xbc1, so a menu reopened on the very next tick has
  the HUD shown under it, and nothing in the menu's own code hides it again while the menu is up (LATER 245, reading,
  reviewed 2026-10-21; a widget's own per-frame logic is `START_MENU_HIDES_READING`'s). The menu is
  hidden at once (D:L62206): the 300-a-second fade of `FUN_002011f0` (D:L60658-60697) runs on hidden widgets.
  *(Superseded: the menu is still drawn while the fade runs -- §8.11.2, built by LATER 40.)*
  *Amended by MATCH-02b (§8.11.2):* the menu is not gone at the close -- `FUN_00205200` hides it (D:L62206, through
  `FUN_00201590`, which clears +0xbc0 and the menu's own show bit) and sets `DAT_00409080` (D:L62208), and the menu's draw
  `FUN_002015a0` keeps drawing while that flag is set (0x2015c8), so the original shows the menu fading out; the port
  drops it at once (research 101 §2, A44).
- **The selected row** pulses (`DAT_004090a0`, 0 to 1 and back at 7 a second, D:L60928-60935): its colour (100 + 28p,
  100 + 28p, 100 - 36p) (D:L60956-60961); the bar's (35, 51, 56) + p (17, 25.5, 28) (`DAT_004090c8` = (52, 76.5, 84),
  D:L60942-60948, less `DAT_00409050`.. = (35, 51, 56), D:L60936-60939). A press blinks it (`DAT_003dc418` from -1 to 0):
  hidden for 0.1 s, shown 0.1 s, hidden 0.1 s, then shown (D:L61001-61022).
- **The bar** (+0x6b0) moves toward the selected line each frame (D:L60745-60790): within 31 px at 400 px a second,
  farther in one jump (`DAT_003dc428` 3.0 selects the jump), never past it.

### 8.6 The draw (`FUN_00202520` D:L61364-61449; the open's alphas D:L62002-62011)

On the 640 x 448 frame, x on the screen's centre line (`DAT_004a44c4 >> 1`); the page scales by the height and centres
as the HUD's centred widgets (`hudLayout`'s `C`), the shade over the whole frame (`START_MENU_LAYOUT`):

- the shade +0x30: the whole screen black, its corners 0 and 3 at alpha 100 and 1 and 2 at 0 (D:L61365-61372,
  D:L62002-62003) -- by `FUN_00359310`'s two triangles (TL, BL, BR and TL, BR, TR) the top two corners: dark at the
  top, clear at the bottom (the page: one quad turned a quarter, its left edge the top);
- the rows' box +0x220 (164, 119)-(476, 361) in (35, 51, 56) at alpha 80, its inside +0x2a0 (170, 125)-(470, 355) in
  (11, 21, 24) at 100; the title's +0x320 (164, 56)-(476, 106) and +0x3a0 (170, 62)-(470, 100), the same colours
  (`FUN_003646d0` D:L61373-61401; the colours are the static initialiser's stores at 0x3fdb20-0x3fdbbc: `DAT_00409020`..
  = (11, 21, 24), `DAT_00409030`.. = (35, 51, 56), `DAT_00409040`.. = (11, 45, 64), `DAT_00409050`.. = (35, 51, 56));
- the title +0x420, centred (+0x69, D:L61413) at (320, 92), scale 1.3, (128, 128, 64), alpha 110 (D:L61405-61414);
- the bar +0x6b0: x 171, 297 x 21 (D:L60789), its top the line's y - 19 (`START_MENU_BAR_Y_READING`), at alpha 100 (D:L62006);
- the prompts "¦ ACCEPT" / "¬ BACK" (S:0x3e3cc0 / 0x3e3cd0: 0xa6 the cross glyph, 0xac the triangle) at (245, 345) and
  (337, 345), scale 0.8, not centred, (128, 128, 64), alpha 110 (D:L61428-61449);
- the rows: centred at x 320, line n at y 155 + 21 n, scale 1.1, (100, 100, 100), alpha 128 (D:L61351-61360).

A string is `font_text_01` with its drop shadow (`hudFont`), the pad glyphs from `font_special_01`; the colours as the
HUD's: untextured 0-255 as is, a string's 128 is 1, alpha 128 is 1 (`hud.ts` `HUD_COLOURS`). The order is the build's
adds (`FUN_001feae0`): the shade, the boxes, the title, the bar, the prompts, then the rows.

### 8.7 The page's wiring, and what the seat's hot hunks owe

Built and tested: the module (`StartMenu`: `frame`, `pad`, `draw`, `roundStart`, `reset`, `teardown`, `runAndTalk`), the
HUD's two hides and setters, the headset's mask, the talk input's RUN AND TALK, `OptionGlobals.set`, and
`sessionStartMenuOptions` over the session's globals and valves. **Not wired**: the two mounts, hot files (the gameplay
seat's `matchMount.ts` by content; `main.ts`), a few lines each that the Online seat claims and lands -- in each page
the menu's construction (`new StartMenu({...})`: the options, the seat from the net page's gate, the captions, the
title, the match's audio, `allowed`, `voiceMask` the headset's `setVoiceMask`, `opened` the taunts part's `reset`,
`hud`); its `pad` first in the pad frame, its `owns` in the frame's `menu`, its `held` handed to `taunts.pad`; its
`draw` on the overlay; `roundStart` at each round's start, `reset` at the respawn, `teardown` at the dispose; RUN AND
TALK into `mountTaunts` and `playerLanes`. The front end's options are the session's `OptionGlobals` and valves
(`frontEnd.ts` hands them to the mount, `sessionStartMenuOptions`); `/testroom`'s are the menu's own store over the
card's stored options (`localStartMenuOptions(playOptionsGlobals(..))`), which its `matchOptions` source reads through
`playOptionsOf`, so INVERT PITCH and FIREMODE reach its camera and pad as the session carries them on the front end.

### 8.8 Readings and placeholders

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `START_MENU_BAR_Y_READING` (`startMenu.ts`) | the bar's top int(line y + 0) - 19 | the row text's +0x80 in D:L60760 and D:L61974-61976: 0 from its constructor (`FUN_00363e70`), written only by `FUN_003631f0`'s localised path (a locale table's offset, not read) | the locale table's entries for the rows' strings read; ONL-32's capture of the menu | reading, reviewed (MATCH-01, 2026-10-13) |
| `START_MENU_CONTROL_FLAG_READING` (`startMenu.ts`) | the page's `allowed` (in a round, no other screen up), for the living, the dead and a spectator | bit 3 of the local controller's +0x171 (D:L60639, D:L60808), its writer not read | the bit's writer read; ONL-32's round: START pressed living, dead and spectating | reading, reviewed (MATCH-01, 2026-10-13) |
| `START_MENU_OVER_SCREENS_READING` (`startMenu.ts`) | no open while WEAPON EXCHANGE, the R2 inventory or the ARMORY holds the pad; the Chat menu closed at the open | the original opens over control states 1 and 2 (D:L60651-60654), closing the TCM (D:L61936) and hiding WEAPON EXCHANGE and the R2 inventory (D:L56332-56336); their pads under it not read | ONL-32's round: START over WEAPON EXCHANGE and over the R2 inventory | reading, reviewed (MATCH-01, 2026-10-13) |
| `START_MENU_OFFLINE_ROWS_READING` (`startMenu.ts`) | offline's rows transcribed; REPLAY's and HELP's presses nothing; HELP's label ON | the replay confirm, and HELP's valve at `DAT_00408e30` (`FUN_001fde30`, `FUN_001fdeb0`) | T7's own task (the campaign's pause menu, the roadmap README's future scope) | reading, reviewed (MATCH-01, 2026-10-13) |
| `START_MENU_TITLE_READING` (`startMenu.ts`, `StartMenuDeps.title`) | the mission's name as the page held it (the front end's the hand-off's stem, "mp72"; `/testroom`'s the map's name) | `FUN_002a42a0(0x4364e0)` through `FUN_00361b60` (D:L62129-62131) | read by MATCH-02b (§8.11.1): `mission.rdr`'s `description`, both matches from `LoadedMap.name`; `START_MENU_TITLE_MISSING` and `startMenuTitle` | retired (MATCH-02b, 2026-10-13) |
| `START_MENU_LAYOUT_TIME_READING` (`startMenu.ts`) | the rows placed at each open, by the seat then | the builder's placing at the HUD's init (D:L57454, D:L61343-61363) | a seat whose spectator state changes inside the HUD's life, on the original | reading, reviewed (MATCH-01, 2026-10-13) |
| `START_MENU_HIDES_READING` (`packages/viewer/src/hud.ts`, `START_MENU_HIDES`) | the hide-all's widgets held hidden for the whole open, mapped as research 282 §1; the three unnamed children and the reticle's root unmapped; `'voice'` out of the set (PAR-97, 2026-10-16, reading, pending review: D:L56341 is `+0x17580`, the name tags; the voice element `+0x390`, `FUN_00238f50` D:L85656, is the info box's and stays shown in control state 3, D:L56344-56347, D:L61963-61964; was: "`'voice'` mis-mapped" -- NU-9's review, F3, 2026-10-15, research 101's row) | whether a widget's own frame shows itself again under the menu; the children at D:L56332-56334 | ONL-32's capture: the HUD under the open menu | reading, reviewed (MATCH-01, 2026-10-13) |
| `START_MENU_OPEN_CALLS_READING` (`startMenu.ts`, `StartMenu.openMenu`) | not transcribed: `FUN_0023b190(0x414680, 1)`, the open frames' `FUN_00341a60(0, ..)` (the third, `FUN_00592ac0(controller)` with the `+0x5e1` bit, is the firearm's since CTL-2, 2026-10-23: research 302 §10, `RUMBLE_MENU_STOP_READING`) | the open's three calls with no part in the page (D:L61937, D:L61940, D:L60796): the object at 0x414680 (paired with the Chat menu's close, D:L56643-56644, D:L78532-78533), the controller's reset, a sound frame at 0 s | each function read to what it drives; ONL-32's round: the HUD, the pad and the sound under the open menu | reading, reviewed (MATCH-01 review F5, 2026-10-13) |
| `START_MENU_FADE_RATE_READING` (`startMenu.ts`, `StartMenu.fadeTick`) | 300 alpha a second off four groups (the shade; the insides and the bar; the frames; the title, the prompts and the rows), from the open's 100, 100, 80, 110, each floored at 0; the flag cleared on the tick all four fall below 0 | the close's fade, `FUN_002011f0` D:L60657-60699, run only while the menu is closed (`FUN_00201690` D:L60792-60793), set by the close (D:L62208), drawn by `FUN_002015a0` (0x2015c8), cleared by `FUN_00202210` (D:L61039) | a capture of a close (ONL-32, H267) | reading, reviewed (LATER 40, 2026-10-21) |

`START_MENU_PARKED_TYPES` (VIBRATION) was the owner's call followed (MENU-OC-9, OPT-13's parked row), not a stand-in;
empty since CTL-2 built the row (OT.R72, LATER 319, 2026-10-23).
The table, the labels, the timings, the sounds, the geometry and the colours are transcriptions. The eight names were in
research 101 §4 (MATCH-01's rows); seven since MATCH-02b retired `START_MENU_TITLE_READING` (its row removed there). MATCH-01's ninth, ABORT's seam `MATCH_02_ABORT_SEAM_READING`, was retired by MATCH-02 (2026-10-13): the confirm is built (§8.10), its rows removed here and in research 101.

### 8.9 The tests

`packages/viewer/test/startMenu.test.ts`: the table (types, ids, the five bits); the online rows of a player, a
spectator, a LAN seat and offline, with their labels and row 9's rule; the open's 2 s lockout, START's and TRIANGLE's
closes, the open's .TCM_SELECT, another screen's refusal, the round start and the reset; no pause online (the offline seam told at the open and
the close); DOWN / UP over the rows not offered with the wrap, the 0.2 s repeat, `.TCM_SLIDE`; the bar's slide and
jump; each row's effect -- RESUME, ABORT's confirm opened (its own tests §8.10.7), INVERT PITCH (the global and the TEMP valve), VOICE MODULATION (the
page, the valve where held, the mask), RUN AND TALK, FIREMODE (no valve), IN-GAME TEXT MESSAGES (the PERM valve; the
round's drain drops an outside whisper), SPECTATOR HUD (the scoreboard's hides), VIBRATION inert; the blink; the systems
-- the headset unshifted with the mask off, the talk input's L2 with RUN AND TALK on; the pad held while open;
`START_MENU_HIDES` in `hudPass`; the draw's quads; the two pages' options (the session's globals, `/testroom`'s store
over the card's, cleared when the card is read again) read back by `playOptionsOf`; the three pages' wiring by text; with `SOCOM_DISC`, the ELF's literals, constants and colour
initialiser, and HudCLOC's nine strings.

### 8.10 MATCH-02: ABORT -- the confirm, BACK, and where it lands online

- Date: 2026-10-13 (web sprint 18, MATCH-02; the plan's row MATCH-02; the brief
  `../plans/briefs/2026-10-13-s18-match-02-abort.md`; roadmap 07 MATCH-02). After MATCH-01 (§8.1-§8.9).
- Status: **reading, reviewed** (at its merge, 77c4c2c88). Transcribed from the retail decompilation (`D:L<n>`, `FUN_<addr>`; cited, never
  pasted), the ELF by address through `tools/elfImage.ts` (the strings, the box class's vtable), UIMnLOC through the
  repository's readers (`parseLocTable`), and `dlgNetAbort.rdr`'s scripts as the online dialogs' pin holds them
  (`tools/test/onlineDialogs.pinned.json`, written by `tools/dump-online-dialogs.ts`, held to the disc by
  `onlineDialogsDisc.test.ts`). Nothing measured on the original running: the proven level is ONL-32's capture (the
  confirm's frame, its default, the screens after YES, on the aborting console and another).
- Code: `packages/viewer/src/startMenu.ts` (the confirm: `START_MENU_CONFIRM_TEXT`, `START_MENU_CONFIRM_LAYOUT`,
  `StartMenu`'s confirm state, `confirmLines`, `aborted`, `drawnState`, `drawStartMenu`'s confirm); new
  `packages/viewer/src/matchAbort.ts` (`MatchAbort`, `MATCH_ABORT_WAIT_SECONDS`, `MATCH_ABORT_DIALOG_ID`, `abortLines`);
  `lobbyMatch.ts` (`MATCH_ABORT_DIALOG`, `returnDialog`'s #529, the return's `aborted`); `matchTaunts.ts` (`aborting`, the
  talk gate). The two mounts are the seat's hot hunks (§8.10.6). Tests: `packages/viewer/test/startMenu.test.ts` (the
  confirm), `packages/viewer/test/matchAbort.test.ts` (the landing).

#### 8.10.1 The confirm (`FUN_002041e0` D:L61689-61698 and D:L61877-61915; `FUN_00201690` D:L60750-60996)

- **The show and the hide, settled.** The confirm's widgets are the box class (vtable 0x406e80, made by `FUN_00364c50`
  D:L262009-262050) and the text class (0x406df0, `FUN_00363e70`). The box's slot +0x1c is `FUN_00364e30`, which sets bit
  6 of +0x14 (D:L262086-262091), its +0x18 `FUN_00364e50`, which clears it (D:L262096-262101), and its draw
  `FUN_00364e70` walks its children only with the bit set (D:L262106-262115); the vtable's two words read 0x364e50 and
  0x364e30 in the ELF (the dev-disc case). The six lines cases 1 and 2 show and hide are the text class (vtable 0x406df0,
  set by `FUN_00363e70` D:L261452): its +0x18 is 0x363c10, `thunk_FUN_00364e50` (D:L261318), and its +0x1c 0x363c00, read
  as raw MIPS (not in the decompilation): `j 0x364e30` -- each a jump to the box class's hide and show (the ELF's words,
  the same dev-disc case; *review F3*). With the builder's use (D:L61347-61359) and the open's and the close's (D:L61953,
  D:L62206): **+0x1c shows, +0x18 hides.** So case 1 (REPLAY MISSION) shows the replay lines and case 2 (ABORT) the
  abort lines -- research 114's `EXIT_PAUSE_ROW_READING` read them the other way (corrected there, §1.5 and §7).
- **ABORT's press** (CROSS let go on row 2, outside a confirm): `.TCM_SELECT` (D:L61672-61674), then case 2 shows +0xcf0 /
  +0xd88 / +0xe20 and hides +0xeb8 / +0xf50 / +0xfe8 (D:L61690-61695), sets +0xbdc 1 and +0xbe0 2 (D:L61696-61697); the
  row blinks (its bit 3, D:L61869-61870) and the menu stays up (no bit 4).
- **The texts** (`FUN_00202370` D:L61093-61100, the builder's same at its end): +0xcf0 "Are you sure you want"
  (S:0x3e3ce0), +0xd88 "to abort the game?" (S:0x3e3d00), +0xe20 " " (S:0x3e3d18, one space); the replay's +0xeb8 the same
  first line, +0xf50 "to replay the mission?" (S:0x3e3d20), +0xfe8 " "; YES (+0x1080, S:0x3e3d38) and NO (+0x1220,
  S:0x3e3d40). The confirm's widgets are shown each frame while +0xbdc is set, hidden otherwise (its frame +0xc70,
  D:L60750-60755): its children with it.
- **The default is NO**: +0xbe4 (1 YES, 0 NO -- YES is the branch that acts, D:L61884-61889) is 0 from the menu's
  constructor (`FUN_00205800` D:L62373) and set 0 by every way out (D:L61886, D:L61906, the close D:L62210); case 2 does not
  touch it.
- **The buttons** (`FUN_00201690` D:L60869-60886, under the cursor's gate `DAT_00409098` open, which they do not shut):
  RIGHT (the pad's byte +3; research 118 §4's map) on YES -> NO, with +0xbd4 (`.TCM_SLIDE`); LEFT (byte +4) on NO -> YES,
  with +0xbd8 (`.TCM_SLIDE`); a held direction does nothing more. UP and DOWN are not read under it (D:L60816) and the bar
  holds (D:L60756).
- **BACK and NO** (D:L61878-61888): TRIANGLE let go sets +0xbe4 0 and +0xbe0 -1 and acts as CROSS; CROSS let go on NO
  clears +0xbdc -- **back to the menu**, still open, the cursor on ABORT, `.TCM_SELECT` (+0xbd0, D:L61910-61913). Nothing
  else is touched: online the round ran on under the menu (§8.5) and runs on.
- **START** under the confirm closes the menu (D:L61664-61666), the confirm with it (`FUN_00205200` D:L62209-62211).
- **YES** (D:L61889-61908): for +0xbe0 2 (ABORT) the `mission_abort` valve (`DAT_0043668c`, the mission 0x4364e0's
  +0x1ac; research 114 §1.4) written 1 through its watchers (D:L61891-61895) and `FUN_00592ac0` on the local controller
  (D:L61896-61897); for +0xbe0 1 (REPLAY, offline's) it is written 2 (D:L61899-61902). Then `DAT_00409070` 1 (D:L61904) --
  the open refuses START while it is set (D:L60653) until `FUN_00202210` clears it (D:L61041) at the HUD's reset
  (D:L57717) -- the confirm cleared (D:L61905-61907), the menu closed (D:L61908) and `.TCM_SELECT`.
- **The draw** (the builder, D:L61448-61589; the open frame's colours D:L60955-60996), on the 640 x 448 frame, x on the
  centre line: the frame +0xc70 (182, 125)-(458, 275) in (35, 51, 56) at alpha 80; its inside +0xbf0 (192, 135)-(448,
  265) in (11, 21, 24) at 100 (`FUN_00364660` takes the corners, D:L261712-261720); the three lines centred (+0x69) at y
  165, 185, 205, scale 1.1, (100, 100, 100), alpha 128 (the text's constructor's +0x54, D:L261476); YES centred at (260,
  245) and NO at (380, 245), scale 1.1, each in an outer box 4 px round its inner one -- YES (216, 219)-(304, 253) and
  (220, 223)-(300, 249), NO (336, 219)-(424, 253) and (340, 223)-(420, 249) -- all four (35, 51, 56) at alpha 128 (the box's
  constructor's +0x34(128), D:L262047). The selected button's word pulses as a selected row does, (100 + 28p, 100 + 28p,
  100 - 36p), and its inner box as the bar, (35, 51, 56) + p (17, 25.5, 28); the other's word (100, 100, 100) and inner box
  (35, 51, 56) (D:L60968-60996). Under the confirm no row pulses (D:L60955) and the bar's colour holds where it was. The
  confirm's frame is a root of its own (no `FUN_001feae0` puts it under the menu's widgets), and the menu's own draw
  draws it **instead of** the menu's rows, boxes, title, bar and prompts, the shade under it (MATCH-02b, §8.11.2; it was
  `START_MENU_CONFIRM_OVER_READING`, the confirm drawn over the menu).

#### 8.10.2 Where ABORT lands online (the row's own unknown)

- **The mission tick** (`FUN_002aa490`) adds the frame's seconds to the mission's clock +0xe0 (D:L151067) and, with
  `mission_abort` (+0x1ac) non-zero, calls `FUN_002a9b30(mission, 4)` every tick (D:L151146; D:L151157-151158) -- in
  that order of precedence (D:L151137-151158): with +0x13c clear, `mission_complete` (+0x1a4) set gives state 2 and
  `mission_failure` (+0x1a8) state 3 first, so an abort reaches state 4 only while both are 0; with +0x13c set, the abort
  alone is tested. The wait's +0xe4 is the session master's other-state branch's clock as well (D:L150629-150631), and is
  set back to -1 only at the mission's (re)start (`FUN_002a7d40` D:L149684). Not transcribed: the port does not map its
  round events onto those valves (`MATCH_ABORT_WAIT_READING`, §8.10.5).
- **State 4 online** (`FUN_002a9b30` D:L150614-150627; `DAT_0045a0c1` set, the game object +0x1808 held): each tick
  `FUN_002c1970` (D:L150616) and `FUN_0030e6e0(voice, 0)` -- the talk flag off (D:L150618; research 170, 225: the voice
  object's +0x4a); the first tick sets +0xe4 to +0xe0 + 3.0 (D:L150619-150620); a later tick with +0xe4 below +0xe0 clears
  `DAT_0044f3cc`, copies `dlgNetAbort.rdr` (S:0x3f1380) into the menu state's start dialog 0x408568 (`FUN_00199800`,
  0x40 bytes; research 115 §7), switches to the menu state (`FUN_002cf410(0x4084c0, 0x408538)`; research 115 §8.1) and
  stops the level's tasks and sounds (`FUN_002aa910`) (D:L150622-150626). Offline the same state pushes the exit state
  instead (research 114 §1.4).
- **`dlgNetAbort.rdr`** (READERC; the pin): its title `bar_title` #529 "ABORTING MISSION.", its text `disconnect` set by
  ONSTART `LANorMPAbortCaption` -- #531 "RETURNING TO SOCOM II ONLINE", or #530 "RETURNING TO LAN BRIEFING ROOM" when
  `ComeFromLan` is 1 (UIMnLOC, the dev-disc case); ONSTART `onstart_handler`: `StopAllSounds`, `VagStreaming(OFF)`,
  `DisconnectFromGameServer`, `WAIT 3`, `CALL exit_lobby` -> `ReturnToWorldOfSOCOM` (`UIanim.rdr`): `SWITCHMENU
  dlgWorldOfSOCOM.rdr`, or `dlgLANBriefingRoom.rdr` on a LAN. TRIANGLE runs `exit_lobby` at once; `MP_MEDIUS_ERROR`
  the library's `OnMultiplayerDisconnect`.
- **So ABORT online lands in SOCOM II ONLINE** (`dlgWorldOfSOCOM.rdr`) -- not the game lobby, not the briefing room (a
  LAN game's own briefing room only on a LAN): 3 s more of the round, then "ABORTING MISSION." / "RETURNING TO SOCOM II
  ONLINE" for 3 s, then the room list. This answers research 187 §7.4's open line ("who sets `mission_abort` in an online
  game ... not traced"): the START menu's ABORT confirm (D:L61891-61895), as it guessed.
- **The message to the room**: none of its own. The leave is the dialog's `DisconnectFromGameServer` (`FUN_0027e420`
  D:L126433-126451): the session master that is the game's last client tells the lobby server the game is over
  (`FUN_002f80c0`, D:L126438-126440, not on a LAN), then the peer session ends (`FUN_002b79f0`, `FUN_002b8390`), the
  lobby's state 11 is queued (`FUN_002e3730`) and the mission let go (`FUN_002a9ef0`) (D:L126442-126445). The port has it
  already: `GAME_LEAVE_ADAPTATION` (ui `gameLobbyCommands.ts`: the game socket closed, `/lobby/leave-game`, state 11), and
  the room's `leave` on the socket's close (`room.ts`). **No new protocol message** -- the brief's "a new message only if
  the original's is not there": the original sends none but the session's end.
- **What the others see**: each other console's ClientLeaves handler `FUN_002bc530` (D:L161111-161146) clears the
  leaver's slot (D:L161124-161125) and, in the game (the game object's +0xcc clear), refreshes the game's record for the
  lobby server (`FUN_002c00f0` D:L161134-161135: `mp_friendly_fire`, `EQlimit`, `mp_locked_game`, `mp_winner`,
  `FUN_002f82e0`); a console still joining (+0xcc set, the late joiner; research 187 §7.4's caveat) with fewer than 3
  left shows `dlgNetAbandoned.rdr` (#528, D:L161138-161141). No abort dialog, no line of the aborting player's: the
  others see only his leave. The port's room: `left` to every other page (`room.ts` `leave`, the page's `remote.forget`),
  the leaver noted for the results (SVC-12d; the quitter's match by OT.R33), and a classic round whose side is left
  empty abandoned (the room's existing rule; `abandoned`, research 231 §5). Whether anything else is posted on the
  others' screens is `MATCH_ABORT_OTHERS_READING`'s (§8.10.5).

#### 8.10.3 The page

- **The confirm** is `StartMenu`'s, in both matches by the one part (OT.R43). **No pause online** under it, as under the
  menu (§8.5).
- **YES** calls `StartMenuDeps.abort`, which the mounts fill with `MatchAbort.abort` (`./matchAbort`): the mission's
  state 4, ticked by the match's frame (`MatchAbort.frame(dt)`, the mission tick's +0xe0), the talk held off while it is
  held (the taunts part's `aborting`: `talkAllowed` false), and after the 3 s `ended()` gives #529.
- **The front end's match** (`./matchMount`): its handle's `ended` gives #529 first; `LobbyMatch` maps it to
  `dlgNetAbort.rdr`, `why: 'aborted'` (`returnDialog`), closes the client (the room's `leave`, the others' `left`) and
  hands the front end its existing return (`FrontEndSession`'s `back`: the start dialog written, the menu state left and
  entered again -- the load state's way out, ONL-18). The menu state then runs the disc's `dlgNetAbort.rdr` as it stands:
  its ONSTART's `DisconnectFromGameServer` is the game lobby's command (`/lobby/leave-game`, state 11), and after its
  `WAIT 3` the menu state is on `dlgWorldOfSOCOM.rdr` (the dev-disc case of `matchAbort.test.ts`: from the menu state on
  `dlgNetAbort.rdr`, the next dialog is `dlgWorldOfSOCOM.rdr`, 3 s later). No `frontEnd.ts` change.
- **`/testroom`** (`./main`) has no menu state: at the switch it closes its client (the leave, no rejoin) and posts the
  dialog's two lines (`abortLines`, `ABORT_LINES_READING`), staying on its map (`TESTROOM_ABORT_ADAPTATION`, a browser
  adaptation of a playtest page).
- **Offline** (REPLAY MISSION, the T7 list) stays unmounted: REPLAY's press opens no confirm
  (`START_MENU_OFFLINE_ROWS_READING`); the confirm's state machine holds choice 1's branch only as the read.

#### 8.10.4 Research 114 corrected

Research 114 §1.5 paired the confirm's choices with the rows the wrong way (reading +0x18 as show and +0x1c as hide from
the pairing alone): choice 1 is REPLAY MISSION, which writes `mission_abort` **2** (the exit state then pops with no
screen, `EXIT_ABORT_POP_READING`), and choice 2 is ABORT, which writes **1** with `FUN_00592ac0`. Corrected there at
§1.5, §1.7, §6 and §7 (`EXIT_PAUSE_ROW_READING` resolved by this read; `EXIT_ABORT_POP_READING`'s writer named as
REPLAY's), with §8.10.1's cites.

#### 8.10.5 Readings and placeholders

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `MATCH_ABORT_WAIT_READING` (`packages/viewer/src/matchAbort.ts`) | the 3 s between YES and the switch: the round runs on as it stands, the talk held off; the switch due 3 s after the confirm whatever the round's result | the confirm's `FUN_00592ac0` (D:L61897) and the state-4 branch's `FUN_002c1970` each tick (D:L150616), not transcribed: what either does to the seat's play; and the mission tick's precedence (D:L151137-151158: `mission_complete` +0x1a4 or `mission_failure` +0x1a8 set gives state 2 or 3 first, so no switch), +0xe4 shared with the master's other-state branch (D:L150629-150631) and reset only at the mission's (re)start (D:L149684) -- the port's round events not mapped onto those valves (*review F2*) | ONL-32's capture: ABORT confirmed in an online round, in play and after the round's result, the 3 s on the aborting console and another | reading, reviewed (MATCH-02, 2026-10-13) |
| `ABORT_LINES_READING` (`matchAbort.ts`) | `/testroom` posts `dlgNetAbort.rdr`'s two texts (#529, then #531 or on a LAN #530) on its message window | the dialog itself, which `/testroom` (no dialog runtime) cannot show | none for `/testroom` (a playtest page); the front end shows the dialog | reading, reviewed (MATCH-02, 2026-10-13) |
| `START_MENU_CONFIRM_OVER_READING` (`startMenu.ts`) | the confirm drawn after (over) the menu | its frame +0xc70 a root of its own, built after the menu's (D:L61448-61589); the render list's order not read | read by MATCH-02b (§8.11.2): the menu's draw `FUN_002015a0` draws the shade, then +0xc70 alone while +0xbdc is set, else +0x220 and the rows | retired (MATCH-02b, 2026-10-13) |
| `MATCH_ABORT_OTHERS_READING` | the others see the leave only (`left`): no line, no dialog. **The port today**, by evidence kind: *seen* (rendered browser, MATCH-02's run, 20261013T0458Z / 0501Z, two pages): the session master's ABORT took the other page out of the round, and the other page's frame shows SOCOM II ONLINE; *read, not seen* (source inspection): the path between. The leaver's socket closes and the match room's `leave` runs; `room.ts` `abandonIfSideEmpty` / `abandon` only puts the room back into waiting (`abandoned`). What ends the game is the bridge's `ABANDON_BELOW_PLAYERS_READING` (3) rule, on every leave of a launched game, a side emptied or not (`bridge.ts` `leave`, :480-494, and `onAbandon`, :617-624; the constant :757): fewer than three players left, `endGame`, so the other page's `ended` is #528 and `lobbyMatch.ts` `returnDialog` sends it to `dlgNetAbandoned.rdr`, whose script returns to SOCOM II ONLINE. `lobby.ts` `hostGone` is for unlaunched games only (`bridge.ts` :484-488). `dlgNetAbandoned.rdr` in between is read from `returnDialog`, not seen in the run. | **The original, as far as read** (MATCH-02b): each other console's ClientLeaves `FUN_002bc530` (D:L161111-161146) clears the leaver's slot and counts the slots left (D:L161124-161132); then, by the game object's +0xcc, either `FUN_002c00f0` (+0xcc clear, D:L161134-161135: a record refresh that runs only for the session master, its guard `DAT_0045a0c1` and `DAT_0045a0c0` both set, D:L163049) or, +0xcc set, `dlgNetAbandoned.rdr` when `FUN_0030d510(0x45a0c0)` less the count is under 3 (`FUN_002a47b0(0x4364e0, S:0x3f2780)`, D:L161137-161141). **What +0xcc means is not read, and two readings conflict**: research 187 §7.4 (+0xcc's meaning BELIEVED there; #528 reads "All players left the game before you were able to join.") and MATCH-02 took +0xcc set as a console still joining (the late joiner), so in a round only the refresh runs; the server takes the +0xcc-set branch as the in-round abandon below three (`bridge.ts` :619-621, :749; `room.ts` :1915-1918, citing D:L161130-161140). +0xcc's other uses do not settle it: D:L55862 (multiplayer, not the session master, +0xcc set: `FUN_002a7490(game, 2)`), D:L125603-125609 (a timed branch: clear `FUN_002c3fc0(game, 2)`, set `FUN_002a7420` and `FUN_002a73b0(game, 1)`), D:L160945 (a state-4 message, +0xcc set: `FUN_002a7340(game, 0)`); none of the four callees is read. *2026-10-14 (WATCH-DOCS; research 315 §3.3, R315.4): **+0xcc is the late flag** -- `FUN_002a7340` (D:L149273-149280) stores it together with the valve `late_joiner` (the game record's +0x2c, S:0x3f10f8, D:L149565-149566), and the load state clears it once loaded (D:L55711-55716; research 314 §4.2); of the uses above, D:L125603-125609 is `ReadyToLoad`'s late branch (`FUN_0027caf0`: `FUN_002a7420` writes the major state 2, `FUN_002a73b0` the minor 1; W19.R12, 314 §4.2) and D:L160945 clears the flag on the network's message 4 (`FUN_002bbfa0` D:L160943-160947). So the conflict leans to research 187's and MATCH-02's reading -- the below-three `dlgNetAbandoned.rdr` is a late joiner's, and in a round a leave that leaves two players shows no #528 on the seated consoles; the server is not changed on that alone (`ABANDON_LATE_JOINER_READING`, note only in research 315 §7; W19.R10): what a round does with a side emptied or two players left is unread, and ONL-32's capture B settles both. Reading, pending review.* | ONL-32's two-console capture: one console aborts in a round, the other's screen recorded to its end (the refresh only, or `dlgNetAbandoned.rdr`), which settles +0xcc and the rule together | *note only* (2026-10-14: told of research 315 §3.3's +0xcc reading, WATCH-DOCS; MATCH-02, 2026-10-13; the port's path, the read and the conflict named by MATCH-02b and its review, 2026-10-13; the server not changed) |

`TESTROOM_ABORT_ADAPTATION` (`matchAbort.ts`) is a browser adaptation (no original), not a stand-in. The three
code names were in research 101 §4 (MATCH-02's rows); two since MATCH-02b retired `START_MENU_CONFIRM_OVER_READING` (its row removed there; the other player's gap is 101 §2's A43).

#### 8.10.6 The seat's hot hunks (claimed, made)

The confirm, the mission's wait and the return are built and tested; the two mounts are hot files, their hunks claimed
by the seat (HANDOFF §3 on `agent/online` ca5415b04, by content) and made as listed:
- `matchMount.ts`: `import { MatchAbort } from './matchAbort';`; `const matchAbort = new MatchAbort();` before
  `mountTaunts`; in `mountTaunts`'s deps `aborting: () => matchAbort.aborting(),`; in the `StartMenu`'s deps
  `abort: () => { matchAbort.abort(); },`; after `const start = startMenu.pad(down, mergeInput(touch.input, pad), dt);`
  the line `matchAbort.frame(dt);`; the handle's `ended: () => matchAbort.ended() ?? endedDialog ?? (net ? null :
  finalCloseDialog(o.client)),`; beside `startMenu.dispose();` the line `matchAbort.reset();`.
- `main.ts` (`/testroom`): `import { abortLines, MatchAbort } from './matchAbort';`; `const matchAbort = new MatchAbort();`
  before `mountTaunts`; in its deps `aborting: () => matchAbort.aborting(),`; in the `StartMenu`'s deps
  `abort: () => { matchAbort.abort(); },`; after `const start = startMenu.pad(down, input, dt);` the line
  `if (matchAbort.frame(dt)) { net?.close(); for (const line of abortLines(false)) hud.postMessage(line); }`; beside
  `startMenu.teardown(); startMenuOptions.clear();` the call `matchAbort.reset();`.
- Then every viewer test that reads `main.ts` or `matchMount.ts` as text, one per call (44 files, all green, no pin
  widened), and `startMenu.test.ts`'s wiring case for MATCH-02 (the new lines in each mount, their order).

#### 8.10.7 The tests

`packages/viewer/test/startMenu.test.ts` (MATCH-02's block): ABORT's press opens the confirm (`.TCM_SELECT`, the blink, the
menu up); the lines and the buttons' words, NO the default; LEFT / RIGHT with `.TCM_SLIDE`, UP / DOWN and the bar held;
BACK from NO and from YES back to the menu with nothing aborted and nothing paused; CROSS on NO the same; CROSS on YES the
abort once, the menu closed, START refused until the HUD's reset; START under the confirm closing both; the draw (the six
boxes' corners and colours, the pulse on the selected button, the rows plain). `packages/viewer/test/matchAbort.test.ts`:
the wait (the first tick sets it, a strict test ends it, #529 once), the talk gate, `returnDialog`'s #529,
`LobbyMatch`'s return (`dlgNetAbort.rdr`, `aborted`, the client closed), the pin's `dlgNetAbort.rdr` and
`ReturnToWorldOfSOCOM`, `/testroom`'s lines; with `SOCOM_DISC`, the ELF's strings and the box class's two slots, UIMnLOC
529-531, and the front end on `dlgNetAbort.rdr` reaching `dlgWorldOfSOCOM.rdr` after its `WAIT 3`.

### 8.11 MATCH-02b: the title and the confirm over the rows

- Date: 2026-10-13 (web sprint 18, MATCH-02b; the plan's row MATCH-02b; the brief
  `../plans/briefs/2026-10-13-s18-match-02b-menu-fixes.md`), from MATCH-02's rendered run (20261013T0501Z: the title
  "mp72" on the front end's match against "CROSSROADS" on `/testroom`; the confirm drawn over the menu's rows).
- Status: **reading, reviewed** (at its merge, f2018b128). Transcribed from the retail decompilation (`D:L<n>`, `FUN_<addr>`; cited, never
  pasted), the ELF by address (the menu's draw is raw MIPS not in the decompilation, read off the ELF's words; the
  strings), and `mission.rdr` through the repository's readers (`listMaps`, the archive package). Nothing measured on the
  original running: the proven level is ONL-32's capture of the menu and of the confirm.
- Code: `packages/viewer/src/startMenu.ts` (`START_MENU_TITLE_MISSING`, `startMenuTitle`, `StartMenuDeps.title`,
  `drawStartMenu`); the two claimed `title` lines of `matchMount.ts` and `main.ts`. Test:
  `packages/viewer/test/startMenu.test.ts` (MATCH-02b's blocks).

#### 8.11.1 The title

- The open sets the title widget +0x420 to `FUN_00361b60(FUN_002a42a0(0x4364e0))` (D:L62129-62131), over the builder's
  "MISSION NAME" (S:0x3e3d70, D:L61408). `FUN_002a42a0` is the mission's +0xa0 (D:L147716-147720). That field is written
  by `FUN_002aab20` (D:L151313-151317; the one write of it found among the mission's functions): the `description` string
  (S:0x3f13e0) of the node it is handed, or "MISSION DESCRIPTION : MISSING" (S:0x3f0a30) when there is none. Its caller
  `FUN_002acc10` (the map's load, on the mission 0x4364e0: D:L47903, D:L123881, D:L126674) hands it the reader
  `mission.rdr` (S:0x3f19d0, D:L152347, D:L152422).
- `FUN_00361b60` (D:L260211-260221) looks the string up as a locale key in the HUD's table (0x49e9d0) and, found, gives its
  string; the lookup (`FUN_003a3100`) finds nothing for a string not led by `_` (D:L296949), so a plain description shows
  as it stands. Every MP map's description on the disc is plain (the 22 names, research 36 §0; the dev-disc case), so the
  key's branch is not built.
- **So the title is `mission.rdr`'s `description`** -- "CROSSROADS" for MP72 -- the string the repository already reads as
  the map's shown name (`loadMap`'s `missionName`, `mapIndex`'s `mapName`: research 36 §6). Both matches hand it to the
  menu from their loaded map (`LoadedMap.name`: `title: () => map?.name ?? null` on the front end's match,
  `title: () => loaded?.name ?? null` on `/testroom`), and the menu draws `startMenuTitle` of it: the description, or the
  original's default before a map. The front end's hand-off stem ("mp72") is no longer the title. `loadMap` falls back on
  the archive's stem when `mission.rdr` has no description, where the original would show the default; no disc map takes
  that path (the dev-disc case lists all 22 by their descriptions). `START_MENU_TITLE_READING` retired (§8.8).

#### 8.11.2 The confirm: drawn instead of the menu, not over it

- The menu object's vtable (0x405320, set by `FUN_00205800` D:L62333) has its draw at +0xc, `FUN_002015a0` -- the slot
  the HUD's frame calls each frame (`FUN_001ebed0` D:L50876-50877), and the slot the box class's draw (`FUN_00364a30`,
  `FUN_00364e70` D:L262106-262115) calls on each child. `FUN_002015a0` is not in the decompilation; read off the ELF's
  words (0x2015a0-0x20168c; the dev-disc case pins them): while the menu is closed (+0xbc0 0) and the close's fade
  `DAT_00409080` is 0 it draws nothing; else it draws the shade +0x30; then **if +0xbdc (the confirm up) is set, the
  confirm's frame +0xc70 -- with its tree: the inside, the three lines, the four boxes, YES and NO -- and it returns**;
  else the rows' box +0x220 (its tree: the inside, the title's boxes and the title, the bar, the two prompts) and then the
  twelve rows' own text widgets (a hidden row skips itself).
- The per-frame show and hide of +0xc70 (D:L60750-60755) and cases 1 and 2 (D:L61679-61698) touch only the confirm's
  widgets; no row is hidden -- the rows are simply not drawn while the confirm is up. **So under the confirm the screen
  is the shade and the confirm alone** (no row, title, bar or prompt), and BACK or NO (+0xbdc cleared, D:L61878-61888,
  D:L61910-61913) draws the menu again as it was, the cursor on ABORT. `START_MENU_CONFIRM_OVER_READING` retired
  (§8.10.5).
- The port's draw: `drawStartMenu` emits the shade, then either the confirm's quads or the menu's. The HUD's renderer
  batches by bitmap (`hud.ts`'s `build`: within a layer `WHITE` before `FONT_TEXT_01.texture`), so boxes always go down
  before text whatever order the quads are listed in. With the rows not drawn under the confirm, that order is the read
  one in both states (each tree's boxes lie under its own text; the confirm's lines end above YES's and NO's boxes), so
  no change to `hud.ts` is needed.
- **Built (LATER 40, reading, reviewed 2026-10-21 -- re-read at the decompilation and the draw disassembled at 0x2015a0-0x20168c; `START_MENU_FADE_RATE_READING`, `startMenu.ts` `StartMenu.fadeTick`):** the
  close `FUN_00205200` hides the menu (D:L62206: `FUN_00201590`, D:L60713-60718, clears +0xbc0, the menu's open flag)
  and sets `DAT_00409080` (D:L62208), after clearing the confirm (+0xbdc 0, D:L62209) -- so after YES the fade is the
  menu's, not the confirm's. The draw keeps drawing while the flag is set (the test at 0x2015c8, above). `FUN_002011f0`
  is called only while +0xbc0 is 0 (`FUN_00201690` D:L60792-60793), after the round start's lockout (D:L60628-60630);
  unless START opens the menu that tick, it takes `dt` x 300 off four alphas, each floored at 0 (D:L60657-60699): the
  shade +0x30 (its own, from 100); the rows' inside +0x2a0, the bar +0x6b0 and the title's inside +0x3a0 (+0x2a0's,
  from 100); the rows' frame +0x220 and the title's +0x320 (+0x220's, from 80); the title +0x420, the prompts +0xa90
  ("¦ ACCEPT") and +0xb28 and the twelve rows (the title's +0x474, from 110 -- so the rows fall from 110, not
  their 128). The flag clears on the tick all four fall below 0 (D:L60697-60699; a tick of no time never ends it):
  about 0.37 s. Nothing fades while the menu is open: a reopen inside the fade is the open's frame, which puts every
  group back (D:L62002-62011) and the rows at 128 (D:L62119-62126), `DAT_00409080` left set until the next close. The
  flag's other clear is `FUN_00202210` (D:L61039): the HUD's reset (D:L57716-57717) and its teardown, through the
  destructor `FUN_00205480` (D:L57827 -> D:L62227). The selected row's blink (D:L61001-61022) runs on
  every tick after it, closed or open. Raised to proven by a capture of a close (ONL-32, H267).

#### 8.11.3 The other player (F3)

Named in `MATCH_ABORT_OTHERS_READING`'s row (§8.10.5): the port's path (the bridge's below-three rule ending the game,
#528, `dlgNetAbandoned.rdr`, SOCOM II ONLINE -- the last seen in the rendered run, the rest read from the source), the
original's ClientLeaves as read, the unread meaning of the game object's +0xcc and the conflict between the two readings
of it (research 187 §7.4 and MATCH-02 against the server's `bridge.ts` / `room.ts`), and ONL-32's capture as what settles
it. No server change here (research 101 §2, A43).

#### 8.11.4 The tests

`packages/viewer/test/startMenu.test.ts`: under the confirm only the shade and the confirm's six boxes, its lines and
words (no pad glyph, no row, title, bar or prompt); BACK and CROSS on NO draw the menu again, glyph for glyph; the title
`startMenuTitle` (the description; none, the default) and the menu's drawn title from its deps; the two mounts' `title`
lines on `LoadedMap.name`, not the stem. With `SOCOM_DISC`: the menu's vtable and `FUN_002015a0`'s words, the title's
four strings, and the 22 maps' descriptions through `listMaps` (none a `_` key; MP72's "CROSSROADS" drawn as the title).
