# 345 -- THE SERVER'S SYSTEM MESSAGE: how the original tells a player a server's text (SA-43c step 1)

- Date: 2026-10-20. The server split's SA-43c (RESTART-NOTICE; the owner's word, H265: "alerts for players when the
  server is restarting"), its step 1: how the ORIGINAL client shows a player a message from the server, so the notice
  uses the original's channel and look where one exists (OT.R27). A read for the split lane (redotcom-52), by a research
  agent; nothing built here.
- Status: **reading, pending review.** The game's code read from the retail decompilation (`socom2_game.elf.decomp.c`,
  cited `FUN_<addr>` and `D:L<line>`; never pasted), instructions decoded by hand from the ELF where the decompilation
  hides an argument (cited by address), strings from `socom2_game.elf.strings.txt` (by address, bytes read where the
  colour matters), the disc's scripts as `tools/test/onlineDialogs.pinned.json` holds them, earlier notes where cited.
  The desktop's community server (Horizon) is cited `desktop@be557831` as evidence of what **that** server does, never
  of what Sony's servers did. Nothing here is measured on the original running: no capture or trace.
- Stands on research [97](97-service-shape-and-medius-map.md) §9, [118](118-popup-dialogs.md) §4-§5,
  [133](133-the-server-texts.md), [157](157-connecting-to-socom-ii-online-the-lobby-client-and-the-login.md),
  [158](158-the-socom-ii-online-menu.md), [263](263-chat-the-ignore-list-and-moderation.md) §2 and
  [266](266-the-chat-panels.md) §1.3/§3.3, and does not restate them.

## 1. The channels that carry a server's text to a client

| channel | the client's handler | level |
|---|---|---|
| **RT_MSG_SERVER_SYSTEM_MESSAGE** (transport type 0x1c: severity, encoding, language, end-of-message flag, text) | The network library's dispatch `FUN_006364c0` case 0x1c (D:L547491-547492) -> `FUN_00637438` (D:L548080-548110), which reads the four bytes and calls the connection's +0x94 callback (D:L548104), filled at connect (`FUN_00633a08` D:L545482) with `FUN_0061d9f8` (`FUN_00617788` D:L524863); it calls the library's global callback `DAT_006511b8` (D:L528810-528822), set at the library's init (`FUN_00616820` D:L524248-524254), which the game sets to **`FUN_0030dce0`** in `FUN_0030dbb0` (D:L210312-210322), called from `DMEInit` `FUN_00276ce0` at the DNAS step (D:L122627). Every connection goes through `FUN_00621810` -- the Medius library's connect `FUN_006476e0` (D:L560076) and the game session's `FUN_0030d380` from the join path `FUN_002b85c0` (D:L158930): **it reaches a player from the lobby server and from the game server**. | reading |
| Lobby 0x3c **ChatFwdMessage**, type 2 (BroadcastAcrossEntireUniverse) | registered by `FUN_00300840` (D:L202025-202046) through the Medius init `FUN_00647318` (D:L559804-559830) as `FUN_002f4ef0` (D:L194781-194803); drawn as `"name: text"` in the universe colour | reading (263, 266; the registration re-derived here) |
| Lobby 0x4d **GetAnnouncements** reply (request 0x4b) | `GetMediusAnnouncements` `FUN_0027d1f0` -> `FUN_002f7710` (D:L196520-196540); the reply `FUN_002f77a0` (D:L196542-196627) into MEDIUS_MOTD; "No server messages." on failure (S:0x3f5810); GetAllAnnouncements (0x4c) has no caller of its builder | reading (133, 158, 97) |
| LobbyExt 0x04 / Lobby 0xc9 universe description and news | `UpdateServerInfo` `FUN_00274c00` into SERVER_NEWS on SELECT UNIVERSE, before login | reading (133) |
| Lobby 0x4a **ErrorMessage** | slot 0x686b30, class 1, id 0x4a, handler `FUN_0064bc78` (D:L562455-562463; the registration order `FUN_0064db00` D:L564041-564312, the slot at D:L564120) -> `FUN_003008a0` (D:L202050-202058): **MP_MEDIUS_ERROR** with the text -- the disconnect popup | reading |
| GenericChatMessage / GenericChatFwdMessage (LobbyExt 0x23/0x24) | **not receivable**: no class-4 slot past id 0x0a is registered (D:L564041-564312) | reading |
| RT_MSG_SERVER_FORCED_DISCONNECT (0x11) | `FUN_00637150` hands the reason code to the connection's +0x90 callback (`FUN_00617560`); **no text**; where it lands on screen is not traced | reading; landing unknown |

## 2. Where and when the system message is drawn (`FUN_0030dce0`, D:L210355-210398)

The text accumulates in a 1000-byte buffer (0x45b330); a fragment of 1000 bytes or more becomes "[Server message too
long]" (S:0x3f6740). On the end-of-message byte the severity sets a flag -- below 0x80: 2; 0x80-0xBF: 1; 0xC0 and above:
0 (D:L210380-210389) -- and the current state's +0x2c is called with the text, the name "Server" (S:0x3f6760) and the
flag (D:L210394); the ninth argument (the kind) is **1** (0x30ddb0-0x30ddb4, decoded by hand).

- **Front end, flag 2 (severity below 0x80):** `FUN_001f4d20` (D:L54919-54934) raises **MP_SYSTEM_MESSAGE**
  (S:0x3e2e50) with the text; the disc's `UIanim.rdr` `OnSystemMessage` (the pinned dump, L15674-15680) shows it as a
  popup with no button drawn, valve `ConfirmPopup`, closed by CROSS (118 §4), modal (118 §5). Bound in 20 online dialogs
  (dlgNetPlayerName, dlgNetConnect, dlgUsagePolicy, dlgWorldOfSOCOM, dlgMPBriefingRoom, dlgCreateGame, dlgGameLobby, the
  options, filters, SOP and taunts screens, friends, ignore, the clan screens, both ladders); not in 16 (among them
  dlgNetLogin, dlgNetAuthenticate, dlgNetServerSelect, dlgLoad, dlgNetError/Abort/Abandoned/Banned, the three round
  screens) -- there the event finds no binding (that the text is then lost is an inference).
- **Front end, flag 1 or 0 (severity 0x80 and above):** a chat line -- in the briefing room (lobby state 11)
  `FUN_001f5020` (D:L55017-55158) adds it to every room's history as a universe line, name "Server", the text cut to 63
  characters, colour `#C 80 80 40` (S:0x3f5658, bytes read); in the game lobby `FUN_001f4df0` (D:L54936-55011) appends
  `"#C\x80\x80@" + "Server: " + text` (S:0x3e2e70, 0x3e2e80) to the panel.
- **In a round (game state 0x4085d0):** `FUN_001ecc40` (D:L51076-51099) posts **the text alone** on the HUD's main
  window in the colour the kind selects (0x1eccac, decoded by hand): kind 1 -> (128,128,64) whatever the severity; not
  modal, gone after 7 s (266 §3.3).
- **While a match loads:** the loading states' +0x2c is empty (`FUN_001e7c80`, 266): the message is dropped.

The announcement is fetched only on arriving at SOCOM II ONLINE (`init_screen`) and in dlgManageRosterLeader, shown in
the SERVER NEWS popup once a launch (`PopupNewsOnce`) and in MESSAGES on each arrival (158); never pushed.

## 3. The repository today (2026-10-20, the lane at `b6b0d9eb2`)

- Announcements: central answers `/texts/announcement` with the latest whose window is open
  (`packages/central/src/serverTexts.ts`); `addAnnouncement` exists in the store but **no operator command adds one**.
- Chat: central sends types 0 and 1 only (`central/src/chat.ts`): **no universe line (type 2) is ever sent**; the page
  draws one (`ui/src/screens/briefingRoomChat.ts`, the round's sink in `viewer/src/roundChat.ts`).
- The system message: **nothing sends it and the page raises no MP_SYSTEM_MESSAGE**; the plumbing is there (the event id
  `MP_SYSTEM_MESSAGE` 0x3a in `ui/src/dialog.ts`, `lobbyEventInto` in `ui/src/screens/connectCommands.ts`, the unused
  `systemMessages` hook in `menuState.ts`).
- The match server sends no server text to its seats; central's control link has `drain { reason }` toward hosts only.

## 4. For SA-43c (the seat's to rule; recorded as the research agent's recommendation)

1. **The original's own channel: the system message.** In the online menus, severity below 0x80: the OnSystemMessage
   popup (the text, CROSS to close); in a round: the bare text on the HUD in (128,128,64), not interrupting play. The
   page delivers MP_SYSTEM_MESSAGE through `lobbyEventInto` in the menus and a kind-1, nameless line to the round's sink.
   The transport is ours (central's lobby seam for a central restart, the match socket for a host's); in the original
   both connections carry it. (Horizon sends this message at severity 0 for "Server in maintenance." --
   `desktop@be557831:<RT.Common/...BaseMediusComponent.cs>` -- a community server's choice, not Sony's.)
2. **When it reaches a player:** any bound online menu (modal); a round (a HUD line: a placed game plays on, SA-21, so the
   text says so); **not** while a match loads, nor on the 16 unbound dialogs -- so it is sent again before the restart.
   Severity 0x80 and above is the non-modal alternative (a "Server: ..." line, 63 characters in the briefing room). The
   severity is a taste call on the product track (OT.R53).
3. **A scheduled notice** in the original's channel too: the restart written as a timed announcement (SERVER NEWS on
   arrival) -- an operator command calling `addAnnouncement` with a window. *Built by SA-43c Part 3 (2026-10-21):*
   `main.ts notice announce --from <UTC> --until <UTC> "<text>"` into DATA_DIR's `announcements.json`, reconciled into the
   store by a running central (`packages/central/src/announcementsFile.ts`; research 133 §4); the page's side was
   already the original's (SOCOM II ONLINE's `GetMediusAnnouncements`, MEDIUS_MOTD in SERVER NEWS and MESSAGES).
4. **What the original cannot show** (labelled browser adaptations in its style, if wanted): a player not signed in; a
   live countdown; the split's reconnect after the cut (the original shows the disconnect popup and returns to the main
   menu). Lobby 0x4a ErrorMessage is not used: it is the disconnect popup.
5. **The track:** routing a server's message by severity to a popup, a line or the HUD transcribes `FUN_0030dce0` and
   `FUN_001f4d20` -- what the client draws -- so that half is **simulation track** (this note, a fresh review); the
   operator command, the transport and the wording are product track.

## 5. Part 1 built: central's own restarts (SA-43c, 2026-10-21; reading, pending review)

What SA-43c's Part 1 settles on the page and what it depends on here (the routing a transcription of §2, the simulation
track; the carrier, the store, the command, the wording and the timing ours, the product track):

- **The routing** (`packages/ui/src/screens/briefingRoomChat.ts` `systemMessage`): the text cut as `FUN_0030dce0`
  (D:L210366-210376: one fragment of 1000 bytes or more becomes S:0x3f6740; the page counts UTF-8 bytes), the flag from the
  severity (D:L210380-210389), the name "Server" and the kind 1 to the current state: a round's sink -- the text alone, kind 1,
  the state's own line (`FUN_001ecc40`; the HUD's main window in (128,128,64) at the window's scale and time, `viewer/src/roundChat.ts`);
  a load -- dropped and never shown later (`FUN_001e7c80`); the front end -- the flag 2, MP_SYSTEM_MESSAGE with the text,
  raised at the menu state's tick step (6) (`systemMessages`, the hook of `menuState.ts`) through `lobbyEventInto`, so the
  built dialog's `OnSystemMessage` binding runs (an unbound dialog runs nothing); the flag 1 or 0 the screen's line, "Server".
  Each notice's id is taken once, wherever it went.
- **Re-read for the review** (source inspection, 2026-10-21): (a) `FUN_001f3bf0`'s name-to-id chain compares by
  `FUN_00198f18` (strcmp) and answers 0x3a for "MP_SYSTEM_MESSAGE" (S:0x3e22b0, D:L54618-54620), delivered by
  `FUN_00367810(G, 0x3a, text)` (D:L54698-54700) -- the page's `DIALOG_EVENTS.MP_SYSTEM_MESSAGE` is 0x3a; (b) the page's
  `KillPopUp` (`menuShell.ts` `killPopUp`, `popup.ts` `killPopUp`) hides the `POPUP` node and writes no valve, and its
  SWITCHMENU unload (`MenuShell.unload`) hides the node, drops M's popup object (`FUN_0027ef10`) and stops the scripts --
  research 118 §6's rows; so a popup a switch interrupts is gone with its `WHILE ConfirmPopup == 0`.
- **The severity** is the merge controller's (`RESTART_NOTICE_SEVERITY_ADAPTATION` = 0, 2026-10-21; §4.2's taste call):
  the popup in the 20 bound menus, the HUD in a round. **The known gap**: the 16 unbound online dialogs and a match's load
  show nothing, and no second send at 0x80 or above is made for now.
- **The carrier** (central, `packages/central/src/notices.ts`): `/lobby/chat-lines`' optional `system` -- the live
  notices, `{ id, severity, text }`, only when one is live -- polled once a second by the page (`CHAT_POLL_MS_ADAPTATION`),
  where the console's connection would carry the message pushed; the operator's `notice restart <minutes>|now` writes
  DATA_DIR's `notices.json`, which a running central polls. Who sends and when: `deploy/central/box.sh` ("now" before each
  restart; `--notice-minutes N` first) and `autorelease.sh` (its first sight of a new commit), the controller's
  `RESTART_NOTICE_LEAD_ADAPTATION`.
- **Part 2 built** (SA-43c, 2026-10-21; the level unchanged: the page's routing is Part 1's reading, pending review; the
  rest the product track's): a host's restart told to its seats over the **game connection** (§1: the original's network
  library hands the message to `FUN_0030dce0` from the game server's connection as from the lobby server's). The room's
  `system` event (`viewer/src/net/protocol.ts`, additive, protocol 11 kept), sent by `Room.tellSystem` to each of its
  connections and never recorded; the page reuses Part 1's routing -- `NetPage` hands it to the front end's
  `BriefingRoomChat.systemMessage` (a round: the HUD's line, kind 1), the game lobby's socket (`GameSocketHost`) likewise
  (dlgGameLobby: MP_SYSTEM_MESSAGE at the menu state's tick), and a match loading drops it by its type alone
  (`lobbyMatch.ts`, `FUN_001e7c80`; `SYSTEM_MESSAGE_STATE_READING`). The carrier and its timing are ours: the
  supervisor's `host-notices.json`, written by `host.mjs notice restart` that `update-host.sh` runs before a swap. Known
  gaps beside Part 1's: a standing room's page (`/testroom`) and a forge lobby's page do not draw it; the game lobby's
  "now" popup is brief (a room with no round running closes at once on the drain that follows). A game placed during a
  lead, a gap at first (the supervisor's re-tell at a process's ready, removed by the fresh review's F1, reached no
  player -- the ready comes before any page connects), hears it since LATER 261 (2026-10-21, pending review): the
  lead records its restart (`restartAt`), the supervisor tells the latest notice again at a process's ready, and each
  room keeps it and sends it to every connection after its welcome while it holds -- a lead until its restart, its
  minutes as they stand then; a "now" 25 s (`NOTICE_NOW_KEPT_MS_ADAPTATION`) -- never recorded. The keeping and the
  re-tell are ours (product track), as the carrier is; the page's routing is unchanged. A `restartAt` more than a day
  past its notice (`NOTICE_LEAD_MAX_MS_ADAPTATION`, the command's cap) is refused. Known gap: a kept lead cannot be
  withdrawn -- an update interrupted during its wait leaves it told until its restart time; restarting the supervisor
  clears it; a real `host.mjs notice cancel`: LATER 273.
- **Open**: none of SA-43c's parts (Part 3, the timed SERVER NEWS announcement of §4.3, built 2026-10-21).

## Readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `SYSTEM_MESSAGE_STATE_READING` (`packages/ui/src/screens/briefingRoomChat.ts`; SA-43c Part 1) | a round while its sink is up; a load from the hand-off until then (dropped); else the front end, at the menu tick | which state is current when the message comes (`FUN_0030dce0` D:L210394 calls the current state's +0x2c from the network update): the page knows the round by its sink, the load by the match's phase (`viewer/src/frontEnd.ts`: `loading` or `match` before the sink), and raises the front end's event at the menu state's next tick step (6), at most a frame after the reply | a capture of a system message sent across a match's load and its end (ONL-32's kind) | reading, pending review |

## Unknowns

The severity, wording and timing Sony's servers used (unobservable); whether the original raised the system message for
restarts at all; what the forced-disconnect reason does on screen.
