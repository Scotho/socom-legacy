# 263 -- Chat, the ignore list and moderation: the line, the whisper and the cut (SVC-18)

- Date: 2026-10-09 (web sprint 10, wave 1; the plan `../plans/2026-10-09-web-sprint-10-the-services.md`, W10.R4).
- Status: **reading, reviewed** (SVC-18 and SVC-17 2026-10-09; SVC-23c, SVC-23d and SVC-23 2026-10-10). Every value below is transcribed from the retail decompilation
  (`socom2_game.elf.decomp.c`, `D:L<n>`, `FUN_<addr>`; cited, never pasted), from the ELF's strings read by address
  (`game/disc/socom2_game.elf`, `S:0x<addr>`), and from our Horizon at the `ref/desktop` pin (`desktop@be557831`,
  `server/horizon-server/...`, the tracked files, read with `git show be5578311:<path>`); unit-tested against the
  transcription (`packages/central/test/chat.test.ts`; the game socket's relay in `test/bridge.test.ts`); re-read
  by a reviewer who did not write it at each task's review (the sprint's Log). Nothing here is measured on the original running: ONL-32's transcript of a line and a whisper is the
  proven level, not claimed. The s4 slice (`logs/parity/s4_pcsx2/slice-Medius.log`) holds no chat or text-filter line.
- Stands on research [97](97-service-shape-and-medius-map.md) §2.4 and §6 (the Medius map: TextFilter 0x98, FindPlayer
  0x39, ChatMessage 0x3b, ChatFwdMessage 0x3c), [119](119-the-software-keyboard.md) §5 (the keyboards' caps),
  [157](157-connecting-to-socom-ii-online-the-lobby-client-and-the-login.md) §2 (the lobby client's states),
  [162](162-the-briefing-room-the-join-and-the-game-list.md) §4 (the panel, ONL-23a), [154](154-the-briefing-rooms-and-the-game-list.md)
  (the lobby's HTTP seam) and [115](115-the-screen-and-state-manager.md) (the system-message queue), and does not
  restate them.
- Code: `packages/central/src/chat.ts` (`ChatService`, `chatCut`, the constants of §6), `ignore.ts` (SVC-17's
  `IgnoreService`, §4), `room.ts` (SVC-23d's vote, §5.2), `lobbyHttp.ts` (`LOBBY_CHAT_PATHS`, `LOBBY_IGNORE_PATHS`), `lobby.ts` (`RoomService.roomMembers`), `bridge.ts` (`GameBridge.chatLine`, the service wired in
  `createServices`), `viewer/src/net/protocol.ts` (the `chat` events). No page draws a line (W10.R4): the page's
  dispatch already ends every unknown event in its `default` (`netPage.ts`), so it needed no line.

## 1. The transport: the briefing room is the lobby server's, the game lobby the game session's

The roadmap's open question (V18; "whether game-lobby chat is MLS or DME") has two answers, one per screen. Which UI
action each screen runs is research 119 §5's: `dlgMPBriefingRoom`'s `do_chat` ends in `SendMediusChat`,
`dlgGameLobby`'s (online) in `SendChatText`.

| screen | the send | the line goes | received by |
|---|---|---|---|
| BRIEFING ROOM | `SendMediusChat` `FUN_0027d220` D:L125872-125880 opens the keyboard (`FUN_00281d40`) with ELF 0x27d250 as its callback, which reaches `FUN_002f4860` D:L194526-194590 | **MLS**: TextFilter (Lobby 0x98, type 1 Replace, D:L194565), then in its callback `FUN_002f4ba0` D:L194653-194711 `ChatMessage` (Lobby 0x3b) type 0, target -1 (D:L194560-194561) | `ChatFwdMessage` (Lobby 0x3c) -> `FUN_002f4ef0` D:L194781-194803, installed with two other pushes' handlers by `FUN_00300840` D:L202025-202046 |
| GAME LOBBY, no recipient | `SendChatText` `FUN_0027cb80` D:L125617-125625 -> `FUN_0027cbb0` D:L125627-125640, recipient none -> `FUN_002ba850` D:L160057-160063 | **the MLS text filter** (`FUN_002f4df0`, D:L160062), then **DME**: `FUN_002ba870` D:L160067-160114 sends the game session's message `DAT_00440e40` with target -1 -- a broadcast through the DME server to the session, not peer-to-peer (`FUN_0030cef0(0x45a0c0, 0x40, .., -1, ..)` D:L160109) and draws the sender's own line (D:L160111) | the session's handler for that message, `FUN_002ba9d0` D:L160117-160194 (registered by `FUN_002b8660` at D:L159083) |
| either, a recipient named | `/w ''name'' message` parsed by `FUN_00281d40` (D:L128201-128324; its usage line `S:0x3ef6d0`); `FUN_0027cbb0` with a recipient, or `SendMediusChat`, reaches `FUN_002f4860`'s whisper branch | **MLS**: FindPlayer (Lobby 0x39, by name, D:L194573-194586) -> `FUN_002f4a20` D:L194594-194651 (MP_PLAYER_NOT_FOUND on a failure, D:L194618) -> TextFilter -> `ChatMessage` type 1 to the account found (+0x48 of the reply) | `ChatFwdMessage` -> `FUN_002f4ef0` |
| a LAN game | `FUN_00281d40` D:L128314-128320: with `ComeFromLan` (`FUN_003045b0`, `S:0x3f6328`) set, `SendChatText` goes straight to `FUN_002ba870` (no filter) and `SendMediusChat` sends nothing | DME | `FUN_002ba9d0` |

So `chatFanoutRecv` 0x2f4ef0 (V18: "never fired" in Sprint 11's game-lobby trace) is the lobby server's push only: a
game-lobby line never reaches it, because the game lobby's line travels on the game session. What the port does with
each:

- **The briefing room's line and every whisper**: the lobby's HTTP seam (research 154 §4), three paths beside SVC-06's --
  `/lobby/find-player` (FindPlayer), `/lobby/chat` (`ChatMessage`; no reply, 204) and `/lobby/chat-lines`, the
  receiver's waiting `ChatFwdMessage`s (`CHAT_POLL_ADAPTATION`: the console's connection is pushed to, the HTTP seam
  is not). The fields are the messages': `ChatMessage` type +0x28, target +0x2c, message +0x30:64 (research 97 §2.4);
  `ChatFwdMessage` originator id +0x18, name +0x1c:32, type +0x3c, message +0x40:64 -- what `FUN_002f4ef0` reads
  (D:L194791-194799) and our Horizon writes (desktop@be557831 `RT.Models/Lobby/MediusChatFwdMessage.cs:15-51`).
- **The game lobby's line**: the game socket. The page sends `{ type: 'chat', text }`; the bridge (`GameBridge.chatLine`,
  the game seat's own requests, as READY and SWITCH TEAMS are) cuts and filters it and sends `{ type: 'chat', sender,
  name, text }` -- the sender's seat id and its account's name (V25: the event had no sender) -- to every other seat of
  the game, players and watchers: the DME server broadcasts a target -1 message to the whole session. Before the launch
  only (`ROUND_CHAT_SCOPE_PLACEHOLDER`, §6): a line sent once the game is launched reaches no seat, the round's team
  scopes being SVC-19's. `room.ts` is not touched: a maps' room's socket
  that sends `chat` reaches the room's `text`, which has no case for it. *2026-10-12, SVC-19: relayed in every state by
  its scope (research [266](266-the-chat-panels.md) §3.1); the placeholder retired.*

## 2. The line and the whisper: who receives what

- **A room's line** goes to every member of the sender's room but the sender: our Horizon relays a broadcast to the
  channel's clients but the sender (desktop@be557831 `MLS.cs:4113-4150`), and the console draws its own line when it
  sends (`FUN_002f4ba0` D:L194700-194707: unless the target is itself). A sender in no room sends to no one
  (`MLS.cs:4127-4129`).
- **Who receives a room's line while others sit in a game lobby** (`ROOM_LINE_SKIPS_GAME_SEATS_READING`): the
  receiver's handler draws a type-0 line only in the lobby client's state 11, logged in (`FUN_002f4ef0` D:L194797);
  JoinGame's reply sets state 17 (`FUN_002edba0` D:L190483-190484; state 11 again on a failure, D:L190423-190424). A
  member seated in a game therefore sees none -- the client's half, a reading. The port sends him none -- the server's
  half, which nothing in the client transcribes: whether Sony's server forwarded the line is not observable, so this
  half is **inferred until ONL-32**.
- **A whisper** reaches the one player named, wherever he is on the lobby (`WHISPER_REACH_READING`): FindPlayer is
  answered from every logged-in player (desktop@be557831 `MLS.cs:1346-1396`), and the receiver draws a type-1 line
  (handler kind 5) and a type-2 line (kind 1, `BroadcastAcrossEntireUniverse`) in every state (D:L194791-194797); in a
  round a whisper from outside it is drawn only with EnableExternalWhispers on (`FUN_001f7ff0` D:L56712; the option's
  setter `FUN_002a41f0`, `S:0x3f09d0`) -- SVC-19's. Our Horizon's own `ChatMessage` handler looks the target up in the
  sender's channel only (`MLS.cs:4119`, `:4152-4163`): Horizon's, and not followed -- the client's lobby-wide search
  and drawing are followed instead. The client's half (the search, the drawing in every state) is a reading; the
  server's reach is **inferred until ONL-32**, and so is our server's narrowing of Horizon's "any logged-in player" to a
  player the room service holds in a room or a game, which no client code names; FindPlayer answers AccountNotFound (-998,
  desktop@be557831 `RT.Common/Types.cs:72`) otherwise, with the request's id (the client's 0, D:L194580) and name, as Horizon does (`MLS.cs:1370-1379`).
- **Another message type** does nothing (Horizon logs it unhandled, `MLS.cs:4165-4169`); the console sends only 0 and 1
  (`MediusChatMessageType`, `Types.cs:360-367`).
- **The game lobby's line** goes to every other seat; the receiver drops it when the scope is a team it is not on
  (`FUN_002ba9d0` D:L160137-160145, the scopes 1-3 set from the `ChatRecipient` variable, `S:0x3f26e8`, D:L160079-160102),
  when it is empty (D:L160146) and when the sender is on its ignore list (D:L160149-160152, `FUN_003008e0`). The port
  sends scope 0 only ("(All)"), and only before the launch (`ROUND_CHAT_SCOPE_PLACEHOLDER`); the team scopes are
  SVC-19's (§7). *2026-10-12, SVC-19: built -- the scopes 1-3 by the sender's side or the spectators', in every state;
  the placeholder retired (research [266](266-the-chat-panels.md) §3.1).*
- **The filter hook** (`ChatHooks`): `line`, once per line, is the text filter the console asks before every line
  (TextFilter Replace, D:L194565 and D:L160062; Horizon's own check drops a failing line, `MLS.cs:3889-3890`) --
  SVC-23's to fill; `receives`, once per receiver, is SVC-17's ignore list (W10.R4: the ignorer does not get the ignored
  player's line, a third does). Both were no-ops in SVC-18: every line as sent, every receiver taking it. SVC-17 fills
  `receives` in `createServices` (§4); `line` stays SVC-23's.

## 3. The cut, and what the panels keep

- **The cut: 63 characters.** `FUN_002f4860` copies 64 bytes of the text into the message field and zeroes the last
  (D:L194556-194558); `FUN_002f4ba0` does the same with the filtered text (D:L194694-194697). The briefing room's
  keyboard takes up to 99 bytes (`ChatSkb` 100 / 99, research 119 §5; `MAX_CHAT_TEXT_LENGTH` 99, V18), so a line of 64
  or more characters goes out as its first 63; the game lobby's keyboard stops at 63 (`ChatSkb` 63 / 63), and its
  line is cut by the same filter field. Our Horizon forwards at most 63 as well (`ChatClamp.Fit(.., CHATMESSAGE_MAXLEN)`,
  `MLS.cs:4131`; `Constants.cs:34` 64). `chatCut` holds it: 63 sent whole, 64 and 99 sent as their first 63
  (`chat.test.ts`).
- **What is never sent**: a line with no character but spaces, or one opening `$~` (`FUN_00281d40` D:L128300-128313,
  the whole text checked before the cut). A character outside printable ASCII becomes `?` (`CHAT_PRINTABLE_ADAPTATION`,
  the desktop's own clamp, desktop@be557831 `Server.Medius/Medius/ChatClamp.cs:22-50`): the keyboard makes none; a page
  could. What the original's text filter or Sony's server did with such bytes is unread.
- **The briefing room's history** (`ROOM_CHAT_LINES_READING`, 11): the panel's lines are kept per room in 0x80-byte
  records (name +0x1c, type +0x3c, text +0x40); past 10 the oldest is dropped and the new one added (`FUN_001f5020`
  D:L55057-55101 for a whisper or a universe line, added to every room's list; D:L55110-55154 for a room's line, its
  room's list), drawn by `FUN_002f5020` D:L194822-194884 as `"%s %s: %s"` (`S:0x3f5660`: a colour code, the name, the
  text; `"%s%s"` with no name, `S:0x3f5670`) in the colour of its type (`S:0x3f5648` room, `0x3f5650` whisper, `0x3f5658`
  universe). The client keeps it; a page's waiting lines on the server are held to the same 11.
- **The game lobby's history** (for ONL-23's panel): the last 20 lines and the new one, 21 (`FUN_002ba9d0`
  D:L160155-160188), each `"#C\x80\x80\x80%s (All): %s\n"` (`S:0x3f2720`) or, a team's, `"#C@\x80@%s (Team): %s\n"`
  (`S:0x3f2700`); the sender's name `"Unknown"` when it has none (`S:0x3f26f8`). V18's `S:0x3f2704` and `0x3f2725` are
  these strings past their colour codes. The relay holds no history: each line goes as it is sent.

## 4. SVC-17

*Written 2026-10-09 for SVC-17 (wave 2 of web sprint 10). Reading, reviewed 2026-10-09; nothing proven -- ONL-32's
transcripts of add, remove and list and of a line from an ignored player (the ignorer's panel and a third's) are the
proven level.*

The code: `IgnoreService.list`, `add`, `remove`, `ignores` and `receives` (`packages/central/src/ignore.ts`) over the
store's `ignored` list (`serviceStore.ts` `addIgnored` / `removeIgnored`, unchanged); the paths `POST /lobby/ignore-list`,
`/lobby/ignore-add`, `/lobby/ignore-remove` beside the chat's (`LOBBY_IGNORE_PATHS`, `lobbyHttp.ts`); `createServices`
(`bridge.ts`) builds the service, mounts it, and gives the chat its `receives`. The tests: `ignore.test.ts` (the pairs,
the cap, the hook, the endpoint, the three-login mount), `chat.test.ts` (the hook through `createServices`, three
personas), `bridge.test.ts` (the game lobby's line over real sockets).

### 4.1 The pairs

Horizon's lines are `desktop@be557831` `Server.Medius/Medius/MLS.cs` and `Server.Database/DbController.cs` (simulated
mode), read with `git show be5578311:<path>` (the roadmap's `MLS.cs:754-864` agrees with the pin; the block runs to
:902). Every handler first throws on a request without a logged-in session (`MLS.cs:757-762`, `:827-832`,
`:867-872`); ours answers 401 at the endpoint and reads no body. The statuses: Success 0, NoResult 1, DBError -988,
MaxExceeded -956 (`RT.Common/Types.cs:82, :114, :136-137`); the Lobby ids 0xc0-0xc5 (`Types.cs:766-771`).

| pair | the console's side | Horizon's answer | ours |
|---|---|---|---|
| GetIgnoreList, Lobby 0xc0 -> 0xc1 | `FUN_00300f00` D:L202303-202318 (the list emptied, `FUN_00302fc0`; 0x26 bytes, `FUN_00649400` D:L561114-561135) -> cb `FUN_00300f70` D:L202321-202340: a Success row is added (`FUN_00301ed0` D:L202884-202948, one row per account id, D:L202914-202921) and the list drawn at the row ending it; any other status draws the list as it stands (empty) | `MLS.cs:754-822`: a Success row per listed account, its id, name and the client's status (`:776-787`), the last ending the list (`:791-797`); none, one NoResult row ending it (`:799-807`); the account not read, DBError (`:810-819`) | the same, in the list's order; PlayerStatus the `presence` hook's (`IGNORE_PLAYER_STATUS_READING`); a listed account the store no longer holds is skipped |
| AddToIgnoreList, 0xc2 -> 0xc3 | `FUN_00279f50` D:L124215-124230 (the name from `PLAYER_IGNORE_NAME`, `S:0x3eee00`) -> `FUN_00300c50` D:L202208-202244: a name on the list (case-blind, `FUN_00198b80`) raises PLAYER_IS_IGNORED (`S:0x3f5fa0`, D:L202239) and sends nothing; else AccountGetID by name -> cb `FUN_00300db0` D:L202246-202273, its status checked under the label "FindIgnoreListPlayerID" (`S:0x3f5fc0`, D:L202258): a failure MP_PLAYER_NOT_FOUND (`S:0x3f5fe0`), else the account at +0x28 (0x2c bytes, `FUN_006494a0` D:L561137-561158) -> cb `FUN_00300e60` D:L202275-202301: **any** status but Success raises MP_IGNORE_LIST_FULL (`S:0x3f6010`, D:L202287-202290; V4), Success asks GetIgnoreList again | `MLS.cs:824-862`; `AddIgnored` (`DbController.cs:894-930`): either account unknown, false (`:902-904`); else the account appended -- a second time if listed, the caller itself too -- and true (`:906-915`) -> Success (`MLS.cs:844-851`), false DBError (`:852-859`) | either account unknown, DBError; the caller itself, `IGNORE_SELF_STATUS_PLACEHOLDER` (DBError); already listed, Success and no second row (the console shows one row per account either way); the list at `IGNORE_LIST_CAP_PLACEHOLDER` (64), MaxExceeded; else added, Success; a store that refuses the write, DBError |
| RemoveFromIgnoreList, 0xc4 -> 0xc5 | `FUN_00300fe0` D:L202343-202366: sent only for an account on the list (D:L202354-202358; 0x2c bytes, `FUN_00649540` D:L561160-561181) -> cb `FUN_003010c0` D:L202370-202386: Success asks the list again (`S:0x3f6040` its label); a failure says nothing | `MLS.cs:864-902`; `RemoveIgnored` (`DbController.cs:937-974`): either account unknown, false (`:945-947`); else the list filtered -- an account not on it, no change -- and true (`:948-960`) -> Success (`MLS.cs:884-891`), false DBError (`:892-899`) | the same: unknown, DBError; not listed, Success and no change; else removed, Success; a store that refuses the write, DBError |

**`FindIgnoreListPlayerID` is not a filter.** The roadmap names it (`S:0x3f5fc0`) beside the effect on chat; it is the
label `FUN_00300db0` passes to `FUN_002f42d0` (D:L194338-194344, which answers `status == 0` and does nothing with the
label) when it checks AccountGetID's reply -- the add's lookup of the typed name. It has no other user (D:L202258 is
its only reference).

### 4.2 The filtering side: the console filters the game lobby's line, not the lobby server's

The client's list is the vector at 0x44fde0 (count `DAT_0044fde4`, records of 0x48 bytes at `DAT_0044fde8`: the
status +0x18, the account id +0x1c, the name +0x20:32, the PlayerStatus +0x40, the end of list +0x44). Its lookup by
name is `FUN_003008e0` (D:L202062-202086, the case-blind compare `FUN_00198b80` D:L15551+), whose only callers are:

- **The game lobby's line** (DME): its receiver `FUN_002ba9d0` drops a line whose sender's name (`FUN_002c3a70`,
  D:L165181-165200, the session slot's player) is on the list (D:L160149-160152) -- **the console filters on
  receipt**: the DME server relays a target -1 line to every peer (§1), and the ignorer's console draws none. The
  port's page keeps no list, so the bridge drops the line before sending it to an ignorer's seat
  (`ChatService.gameLine` through `receives`): `IGNORED_GAME_LINE_ADAPTATION`, a port adaptation of where the drop
  happens, by account where the console compares names (one name per account, compared case-blind by the store's
  `nameKey`). What the ignorer sees is the console's; a third seat takes the line.
- **The voice mute at a join** (`FUN_002c5830` D:L166403-166406): SVC-20c's (research 170 R170.10), untouched here.

The lobby server's lines -- a room's line and a whisper, `ChatFwdMessage` -- are **not filtered by the console**:
their receiver `FUN_002f4ef0` (D:L194781-194803) reads the type, the lobby state, the name and the text and draws
them, never consulting the list; the list's other readers are the add's local check (D:L202221), the remove
(D:L202354), the reply's insert (D:L202905) and the draw (`FUN_00301920` D:L202685-202721). So on the original an
ignored player's room line or whisper was absent from the ignorer's panel only if the lobby server did not forward
it. Our Horizon's `ChatMessage` consults no list (`MLS.cs:4113-4163`). The port drops it at the server
(`IGNORED_LOBBY_LINE_READING`): the client's half -- no filter -- is a reading; the server's drop is **inferred** (the
list is the lobby server's, kept by AddToIgnoreList and answered by GetIgnoreList, and the console filters only the
line the lobby server does not carry) and is the plan's ruling (W10.R4), until ONL-32's transcript. Both are one way:
the ignored player still receives the ignorer's lines.

### 4.3 The cap (`IGNORE_LIST_CAP_PLACEHOLDER`)

Horizon has none (`DbController.cs:906-913` appends). The console's message for any refused add is
MP_IGNORE_LIST_FULL, so Sony's server had one, unread. The client has no cap of its own: its list is a growable
vector (`FUN_003022f0` D:L203040+ doubles its storage), resized to 64 empty records at boot (`FUN_00402420`
D:L328712; `FUN_00303250` D:L203744-203747 fills them zeroed), which the first fetch empties (`FUN_00302fc0`
D:L202312) and inserts grow past freely. 64 is a boot count, not evidence of a cap -- only the one number the client
gives, so the default: **64**, a 65th refused with MaxExceeded (-956, the
status the clan caps answer, research 262 §4.2); the console shows the same message for any status.

### 4.4 The row's PlayerStatus (`IGNORE_PLAYER_STATUS_READING`)

Horizon's is the client's status (`MLS.cs:778-785`; `Server.Medius/Medius/Models/ClientObject.cs:300-309`):
Disconnected unless connected and logged in, InGameWorld in a game, else InChatWorld. Ours, through `createServices`'s
`presence` (the room service): InGameWorld (3) seated in a game, InChatWorld (2) in a briefing room, else Disconnected
(0). The last is **the port's own narrowing, not a transcription**: a logged-in player on the menus is Horizon's
InChatWorld and ours Disconnected (the room service knows no session); following Horizon's rule needs a
session-by-account lookup, which `AccountService` has none of today. The console draws one glyph for 0 and another for the rest (`FUN_00301920` D:L202705-202710; `S:0x3f6140`,
`0x3f6148`).

## 5. SVC-23

The moderation block in three parts, each a reading, reviewed 2026-10-10, and none proven: §5.1 SVC-23c (the flood limits'
row confirmed: every limit ours), §5.2 SVC-23d (the room's vote read rule by rule against research 91 §17), §5.3 SVC-23
(the block's acceptance clause by clause, the deviations listed, H170 (H-next d)'s two defaults). SVC-23a and SVC-23b, the
ladder's guard and the round's cheat signals, are sprint 22's (PROMOTE-155; W10.R5) and not read here.

### 5.1 SVC-23c

*2026-10-09, SVC-23c (sprint 10, wave 4; W10.R5 keeps what HARD-FLOOD and HARD-FLOOD-2 built, 2026-10-04).* A
confirmation of the built row, on `agent/online` 268554d13: no code changed. **Every limit here is ours** -- a server
policy with no original, a named deviation under OT.R26 (harden now) and OT.R27 (the network modern, the original's
look kept); none is the original's: such limits were Sony's servers', unobservable, and V22 names the original's only
moderation (a team's vote; no idle kick, no host kick) -- nothing of a flood limit is in the client. The names: the
stand-ins `D9_SOCKETS_PER_ADDRESS_PLACEHOLDER`, `D9_SOCKETS_TOTAL_PLACEHOLDER`, `D9_SEND_BACKLOG_BYTES_PLACEHOLDER`,
`D9_HTTP_RATE_PER_S_PLACEHOLDER`, `D9_HTTP_BURST_PLACEHOLDER` (`limits.ts`), `D9_CREATES_TOTAL_PLACEHOLDER`
(`accounts.ts`), `HASH_QUEUE_DEPTH_PLACEHOLDER` (`passwordHash.ts`), `GAME_PASSWORD_TRIES_PER_ADDRESS_PLACEHOLDER`,
`GAME_PASSWORD_TRIES_PER_WORLD_PLACEHOLDER`, `GAME_PASSWORD_WINDOW_MS_PLACEHOLDER` (`limits.ts`) -- each listed in
research 169 §9 and in research 101 §5's rows (286 on this base; none was missing); and the policies stated without
a stand-in, each justified at its declaration: `HTTP_BODY_BYTES`, `HTTP_HEADERS_TIMEOUT_MS`, `HTTP_REQUEST_TIMEOUT_MS`,
`HTTP_KEEP_ALIVE_TIMEOUT_MS`, `HTTP_TIMEOUT_CHECK_MS` (`limits.ts`), `HASH_CONCURRENCY`, `HASH_WORKER_RESTARTS`,
`HASH_WORKER_BACKOFF_MS` (`passwordHash.ts`), `DATA_FILE_MODE` (`serviceStore.ts`), `LAST_RESORT_EXIT`
(`lastResort.ts`; added to research 169 §9's list today). `limits.ts` also holds `VOICE_BACKLOG_SKIP_PLACEHOLDER`,
SVC-20b-relay's voice skip, whose ledger is research 225 §6 (and 101 §5's row), not this block's. The idle time a
watcher is closed at is the room's idle kick (`idleKickMs`, W3.R13's owner's 3-5 minutes), not a number of this block.

The runs (unit tests over local servers on ports they pick; `npx vitest run --maxWorkers=1`, one file set per call,
2026-10-09): `flood.test.ts` and `lastResort.test.ts` 23 passed of 23; `roomHostile.test.ts` and `roomFuzz.test.ts` 16
of 16; `hardFlood2.test.ts` and `dataFileMode.test.ts` 26 of 26 (the worker-backed `it.skipIf` at `hardFlood2.test.ts:133`
ran, not skipped); `mainStart.test.ts` and `server.test.ts` 40 of 40. None skipped. The block's acceptance
(`docs/roadmap/06-online-services.md`, SVC-23c), clause by clause (the files under `packages/server/test/`):

| clause | test:line | state |
|---|---|---|
| a connection that stops reading is closed once its unsent bytes pass the bound | `flood.test.ts:58` (`sendBounded`: nothing sent, closed 1008 once, :63-:65); `flood.test.ts:214` (through `connect` and the room's own sends, a peer object that never reads: 1008 at :229, the backlog at most the bound :231, counted :232) | reading; **owed**: the same over a real socket whose peer stops reading (the block's still-open item: the bound is held through `connect`, not over a kernel's buffers) |
| a silent watcher is moved out or refused past the limit | `roomHostile.test.ts:46` (closed `WATCHER_IDLE_CLOSE` 4009 :57, a pinging one stays :59, the place freed :60, counted :61); `roomHostile.test.ts:66` (a late joiner's whole idle time, :74); `flood.test.ts:252` (the counter on `/metrics`) | reading |
| `/metrics` is refused to a request that is not the host's | `flood.test.ts:74`, `:83` (`metricsAllowed`: the loopback without a proxy header, or the token's bearer); `flood.test.ts:203` (a running server: a proxied request 403 :206, counted :207, without the token 403 :210) | reading |
| connections past the cap from one address are refused while others are served | `flood.test.ts:139` (the ninth upgrade 503 :142, counted :143, a closed one frees its place :146; the eight stay open); `flood.test.ts:149` (past the total, 503) | reading for the cap; **owed**: a second address served while one is at its cap on a running server -- no test opens from a second address (the key is `clientAddress`, `server.ts:384`; `socketsFull`, `:737`; source inspection only) |
| a burst of requests past the rate is refused with the endpoint still answering others | `flood.test.ts:176` (429 on every path :179-:180, counted :181); `flood.test.ts:184` (the upgrade takes the bucket); `flood.test.ts:30` (`RateBuckets`: another address its own bucket, :34) | reading; the "others" half a unit test of the buckets, keyed by address in the server (`server.ts:388`, `:906`; source inspection); **owed** with the clause above: a second address on a running server |
| a login or create burst from many addresses lengthens no room's tick | `hardFlood2.test.ts:133` (24 logins over 24 addresses with the real argon2id hash, not the clause's sleeping stub: a bare 60 Hz `setTimeout` on the event loop is late by less than one tick, 16.7 ms, :152 -- the hash is off the thread; no room is ticked); `hardFlood2.test.ts:83` (2 at once :99, one past the queue refused :92); `:102` (a full queue refuses the create, :110); `:58` (the 31st create refused before any hash, :65-:66) | reading for the logins, as an event-loop timer's lateness, not a room's tick; **owed**: the create half -- no test times a create burst against a tick, and a create's store write still runs on the room's thread (the still-open item below); and a room's own tick timed under the burst (the load test) |
| a room made to throw inside its tick is ended alone while another room's match goes on | `server.test.ts:792` (the other room ticks on :803, the throwing one stepped once :804, logged by its class :806-:807); `server.test.ts:811` (its sockets closed 1011 :818, `/health` answers :820) | reading (SVC-07a's fix round) |
| the data file is created owner-only on POSIX | `dataFileMode.test.ts:41` (every `fchmod` 0600 while posing as Linux, :45, :53; the real mode read at :56-:57 only on a POSIX host); `dataFileMode.test.ts:61` (Windows: no mode set, documented) | reading; the real file mode not read on this Windows host; **owed** (a later task's): :55-:58 sit in an `if` on the platform, so on Windows they pass bypassed and no skip is reported -- the trap `docs/TESTING.md:90-93` names; the fix an `it.skipIf(process.platform === 'win32')` for the POSIX check, so the skip is said |
| the server refuses to start with a service mounted, a proxied bind and `TRUST_PROXY` unset | `hardFlood2.test.ts:263` (`proxyStartCheck` refuses, :264-:265), `:267` (no service: a warning), `:402` (a value other than 1 or 0 refused); `mainStart.test.ts:17` (`main.ts` itself: exit 2 :29, the fatal line :31, never listening :32) | reading |
| each limit is a named server policy listed as a deviation in the docs | research 169 §9 (the table and its policies), research 101 §5's rows; this section; `tools/test/placeholderLedger.test.ts`, `tools/test/roundLedger.test.ts` | reading |

Beside the acceptance, the block's own **still open**, unchanged: the front door's own limit written into the deploy's
documents (the owner's deploy, H32); the load test that would revise every number, D9's and HARD-FLOOD-2's (research
169 §10: a local load test reading `/metrics`) -- the measurement, so nothing here is proven; a create's store write
still on the room's thread (bounded by the 30; research 220 R220.2), which leaves the acceptance's create half owed. The two test files that hold the room-throw and
start-up clauses (`server.test.ts`, `mainStart.test.ts`) were missing from PLATFORM.md's row and are added there.

### 5.2 SVC-23d

*2026-10-10, SVC-23d (sprint 10, wave 4; W10.R5: the vote kick in `room.ts` read against research 91 §17 and kept or
changed).* The room's team vote to remove (W3.R13, `packages/match/src/room.ts`: the data and the rules
`vote`/`votesAgainst`/`votePasses`/`applyVotes` and their comment :4709-4797, the `'vote'` event :1915, the leave's
clear in `drop` :1617, the point set in `endRound` :4667 and run in `clock` :4344, the rejoin refused in `hello` :1339;
`VOTE_BAN_MS`, `VOTE_KICK_POINT_READING` and `voteKickDelayS` :202-239) read rule by rule against
research 91 §17, every line it relies on re-read in the decompilation (`socom2_game.elf.decomp.c`), and against
what research 91 §17 left believed and the 2026-10-04 wave read since (research 179 §6.2-§6.6; research 187 §7.1, ROUND COMPLETE's only).
**Every rule matches or is a labelled server's part but one, changed: when the kick applies.** The room removed a
passed vote's target at the round's result (`endRound`); the original tests the votes as ROUND COMPLETE starts -- or
GAME COMPLETE, after a match's last round -- the engine's read (3 s, `ENGINE_READ_S`) and at a match's end FINAL ROUND
(10 s) later; FINAL ROUND tests nothing. Now `endRound` sets `voteKickAt` to that screen's start (`voteKickDelayS`)
and `clock` applies the votes then, the side and the votes counted at that moment (research 179 §6.5). One name is
new: `VOTE_KICK_POINT_READING` (§6). The rules and their cites are the vote block's comment in `room.ts`. **Reading,
reviewed 2026-10-10**; nothing is proven -- the recomp's vote run and ONL-32 are the proven level.

*2026-11-01, R4B-08 (OT.R97; research 379 §2, §5): this section reads r0001. Its "when it applies" -- the screen only --
is **r0001, superseded by r0004**: r0004's Voter receive (r4 0x2bbc10) acts on the pass test and removes the target at
the deciding vote (`VOTE_KICK_AT_ONCE_READING`); the screen's test stays as the second trigger. The other rules stand.*

| rule | the original | the room | state |
|---|---|---|---|
| who votes | an online player, living or dead, never a spectator: the vote is in the player's TCM only (`FUN_00232bc0` D:L83575-83640; the spectator's has RADIO only, D:L83641-83644); no life test on its path: the row under TEAMMATES > PLAYER n (`FUN_00232bc0` D:L83607-83631; TEAMMATES carries no enable, D:L83793), its enable `FUN_0022f440` D:L81384-81396 (a teammate selected), the toggle `FUN_0022f3c0` D:L81363-81370, the target's count `FUN_002ba040` D:L159762-159767; the send `FUN_0030cef0` between them untraced. `FUN_0022f810` (D:L81519-81527) enables for a living actor, else, online, for a spectator, and gates only the NODEACTION ROOT, TAUNTS and RADIO roots (D:L83757, D:L83774, D:L83787) *(2026-10-17, AD-10, research 227 §2.9)* | a seat in `players` (a spectator has none); else ignored | reading, pending review; the spectator's refusal and the dead voter's count tested. Was: "a living online player ... its items gated on alive and not a spectator (`FUN_0022f810` D:L81511-81526)", a seat "that is alive": the misread, the polarity of its spectator half inverted |
| on whom | another actor of the voter's side, not a spectator, not flag `0x20000` (`FUN_0022f5b0` D:L81460-81463; the menu's PLAYER 1..8) -- oneself never offered | a teammate in `players`; oneself, the other side or a spectator ignored (nothing sent, nothing kept) | kept (reading); a vote on oneself is **ignored**, not answered with a refusal; the flag `0x20000` not read |
| the toggle | the voter's flag flipped, its new state (1 byte) sent to the target's console only -- "Voter" (`FUN_0022f3c0` D:L81365-81369; `FUN_002ba140` D:L159798) | the page sends the state (`remove`); a set of targets per voter | kept (reading) |
| what the voter sees | no line and no count: the toggle (`FUN_0022f3c0` D:L81356-81372) writes the voter's own flag on the target's slot record (+0x49: `FUN_002c3980` D:L165117-165137 reads it, `FUN_002c39d0` D:L165143-165158 writes it) and sends it to the target's console alone (`FUN_002ba140` D:L159787-159802, the target's +0xfc8 the address); the count line is drawn on the target's console only (`FUN_002ba040` D:L159763-159766), and the target's "Alert" is read by nothing (D:L159770-159780; the row below). The voter's one sign is the row's caption: its enable `FUN_0022f440` (D:L81377-81397) sets it from that flag each time the row is drawn -- VOTE REMOVE (S:0x3e5ce0) while unset, VOTE RETAIN (S:0x3e5cd0) once set (D:L81387-81394) | the same: the row reads VOTE RETAIN once the page has sent the vote (`netPage.ts` `votingToRemove`, `matchChat.ts` the VOTE row; `matchChat.test.ts`, the TEAMMATES tests) | reading, pending review (2026-11-02, Trello d3xR0sr2 item 4): the original confirms nothing to the voter beyond the caption's flip, which the port has; nothing to build |
| who counts | the target's console: the voter's flag set (`FUN_002c3a20`), every set flag counted (`FUN_002c3920`), "Voting: You have %d votes against you." (S:0x3f26c0; `FUN_002ba040` D:L159763-159766) | the server counts and tells the target `votes` (the page posts the line, `netPage.ts`) | a labelled server's part (OT.R27: the network ours, the look the original's) |
| whose votes count | every set flag: the count has no side test (`FUN_002c3920`), a flag set by a teammate only | a voter only while on the target's side | kept; differs only for a voter whose side changed (here only before the launch, `switchTeam`) -- whether the original's side switch clears the flag is not read (`FUN_002c4290` D:L165538-165568 shows no clear) |
| the threshold | `votes > side / 2.0`, the side the target's own, the target counted (`FUN_002c3550` D:L165002, D:L165078; both sides alike): 8 -> 5, 6 -> 4, 4 -> 3, 3 -> 2, 2 -> never; a tie fails | `votesAgainst > side / 2`, the side every seat of the target's in `players` (dead or alive). Since VOTE-LOG (2026-11-02; Trello d3xR0sr2): the side's human seats only, the target counted, a CPU target never passing -- `VOTE_HUMAN_SEATS_ADAPTATION`, a browser/server adaptation (the original has no online bots; the controller's call, 5d, in the r0004 plan's Log for the owner); with no CPU on the side the count is the original's | kept (reading); the human-only filter an adaptation |
| expiry, cooldown, prompt | none: a standing flag until retracted or its voter leaves -- the leaver's slot record freed (`FUN_002c5750` D:L166323-166324), a joiner's flags cleared (`FUN_002c5830` D:L166376-166377); no prompt to the team | none; `drop` forgets the leaver's votes and those on it | kept (reading) |
| when it applies | the start of ROUND COMPLETE (`dlgMultiplayerRound.rdr`) and of GAME COMPLETE (`dlgMultiplayerFinalReally.rdr`), not FINAL ROUND (`dlgMultiplayerFinal.rdr`, no `ExitOnStart`): IF `HaveBeenBannedFromGame`: `BanSelfFromGame`, WAIT 0.5, `dlgNetBanned.rdr`, on the victim's own console (research 179 §6.2 from READERX and `RUN/MPZANIM.ZAR`, the three screens; research 187 §7.1 read ROUND COMPLETE's again, `dlgMultiplayerRound` only -- it calls it "the only way" to `dlgNetBanned` from a player's own game, GAME COMPLETE's not read there; the command row's target `FUN_002c3550`, 179 §6.2's `.data` read). Seen here: the fixture `test-fixtures/RUN/MPZANIM.ZAR` holds `ExitOnStart`, `HaveBeenBannedFromGame`, `BanSelfFromGame`, `dlgNetBanned.rdr`, `ReplayMission` in its `dlgMultiplayerRound.rdr` set (by its strings, 0x6f4-0x74c); the GAME COMPLETE half rests on READERX's `dlgMultiplayerFinalReally.rdr` through research 179 §6.2 (re-read at SVC-23d's review, 2026-10-10). The pass test's one visible call discards its result (`FUN_002ba040` D:L159767) | **changed**: at that screen's start -- `ENGINE_READ_S` after the result, plus `FINAL_ROUND_S` at a match's end (`voteKickAt`, `voteKickDelayS`); before, at the result | **changed**, named `VOTE_KICK_POINT_READING` (§6); the room's screen timings are research 91 §18's |
| the removed player | UIMnLOC 539 "YOU HAVE BEEN KICKED FROM THIS GAME", 541, 540; 4 s, then the lobby (SOCOM 1's `dlgNetBanned.rdr`) | `kicked` 'vote', the close 4002; the page routes it to #539's `dlgNetBanned.rdr` (`GAME_KICKED_DIALOG_READING`, `netPage.ts`; `MATCH_KICKED_DIALOG`, `lobbyMatch.ts`) | kept (the room's part); the screen's three lines and its 4 s the page's, not built here |
| the rejoin | the victim's console asks its own ban: `BanSelfFromGame` (`FUN_00278d30` D:L123707) sends MediusBanPlayer -- its account, 120 (unit not read; minutes believed, research 203 §4), the game's world (`FUN_002f95f0` D:L197800-197804; research 179 §6.3); the server then refuses "that game": JoinGame -972 `MediusPlayerBanned` -> MP_BANNED_FROM_GAME, UIMnLOC 443/444 (`FUN_002edba0` D:L190430); the world outlives a match (research 179 §6.4) | the address refused for 10 minutes with 443's words (`VOTE_BAN_MS`, `VOTE_BAN_SCOPE_PLACEHOLDER`, H170 (H-next d); research 91 §16) | placeholder, unchanged; **owed with SVC-23**: the lobby's `RoomService.banFromGame` (`lobby.ts`: the account's -972 for that game) is called by nothing -- the room's kick does not reach it |
| the "Alert" after each vote | the target broadcasts {1, before, after}; its receivers store an account id and 2 that nothing reads (D:L159770-159780; research 179 §6.6) | none | not built (purpose unknown) |
| a host's kick | none | none (the idle kick is the room's own, OT.R41; H141 stands) | kept |
| "VOTE ALL", the spectators' eject | over 60 % of the players, the host decides (`FUN_002c2e30` D:L164516-164544); "Reject", MaxSpectatorsValve 0 (91 §17 1.1) | none: the room has no such vote | **owed**, SVC-23 or later |

The tests (`packages/central/test/room.test.ts`, the kicks' block): W3.R13's own (:1345: a majority of 3, the other
side's vote ignored, the rejoin refused; its steps after the passing vote lengthened by the 13 s to GAME COMPLETE's
start) and SVC-23d's eleven -- the majorities 8 -> 5, 6 -> 4, 4 -> 3, 3 -> 2, 2 never (:1386); a tie (:1396); a vote on
oneself (:1402); a spectator's (:1411); across the sides (:1421); the retraction (:1430); a voter's leave and return
(:1438); the screens named (:1448); a match's end -- nothing at the result or through FINAL ROUND, the removal as GAME
COMPLETE starts (:1454); a round within a classic match -- the removal as ROUND COMPLETE starts (:1472); a voter
leaving during FINAL ROUND no longer counts (:1487).
The runs (unit tests; `npx vitest run --maxWorkers=1`, one file set per call, 2026-10-10): **RED** -- the base
`room.ts` (a9607a864) with the new tests, the kicks' block (`-t "the kicks"`): 4 failed, 11 passed, 157 skipped (by the
filter) -- the four of the point (:1448, :1454, :1472, :1487) red; the seven rules' and W3.R13's own green on the base
(the rules kept). **GREEN** -- `room.test.ts` whole, 172 of 172; `bridge.test.ts` 23 of 23; `placeholderLedger.test.ts`
13 of 13; `roundLedger.test.ts` 4 of 4; `docs.test.ts` 16 of 16; the server package's `tsc --noEmit` (its `src` and
`test`), 0 errors. None skipped but the RED run's filter.

**What a trace of `BanSelfFromGame` would prove** (the recomp's vote run: research 206 §4.5, S3's item 23; the proven
level). The request is read (`FUN_002f95f0`), so the trace would measure rather than discover: the moment the
victim's console runs it -- ROUND COMPLETE's or GAME COMPLETE's start, and the 0.5 s before `dlgNetBanned`
(`VOTE_KICK_POINT_READING`); its fields on the wire as our Horizon's 0x8A handler logs them (the account, 120, the
world -- what -972 keys on, the account against the room's address); and, with a rejoin attempted later, how long the
refusal lasts -- the game's life or 120 of some unit (`VOTE_BAN_SCOPE_PLACEHOLDER`). A watch on `0x44fb48` during the
vote would give the "Alert"'s purpose.

### 5.3 SVC-23

*2026-10-10, SVC-23 (sprint 10, wave 4, the block's last task; W10.R5; H170 (H-next d)'s defaults). A reading, reviewed 2026-10-10;
nothing proven -- the recomp's vote run and ONL-32 are the proven level.*

**The acceptance, clause by clause.** The block's (`docs/roadmap/06-online-services.md`, SVC-23): "the original's parts
verified against web R91 §17's lines by the room tests (`packages/central/test/room.test.ts`) and a recomp vote run; the
non-original parts listed as deviations in the docs". Research 91 §17's lines, each with the test that holds it (the
kicks' block of `room.test.ts`, lines on this branch) or owed with its home:

| R91 §17's line | test | state |
|---|---|---|
| who may vote: a player, living or dead, never a spectator (§1 "who may vote"; no life test on its path: the row under TEAMMATES > PLAYER n (`FUN_00232bc0` D:L83607-83631; TEAMMATES carries no enable, D:L83793), its enable `FUN_0022f440` D:L81384-81396 (a teammate selected), the toggle `FUN_0022f3c0` D:L81363-81370, the target's count `FUN_002ba040` D:L159762-159767; the send `FUN_0030cef0` between them untraced) *(2026-10-17, AD-10, research 227 §2.9)* | a spectator's vote refused (:1411); a dead player's counted (AD-10; was "refused", **new here** at SVC-23, on the misread of `FUN_0022f810`, which gates other roots) | reading, pending review |
| who can be voted on: teammates only, oneself never offered (`FUN_0022f5b0`) | across the sides (:1433); W3.R13's own, the other side's vote ignored (:1345); oneself (:1402) | reading |
| how a vote is cast: a standing toggle (`FUN_0022f3c0`) | the retraction (:1442) | reading |
| who counts, and the target's line "Voting: You have %d votes against you." | the `votes` count sent to the target in every vote test (:1345, :1402, :1411, :1421, :1433, :1442) | a labelled server's part (OT.R27; §5.2) |
| the threshold: `votes > side / 2.0`, the target counted (`FUN_002c3550`) | the majorities 8 -> 5, 6 -> 4, 4 -> 3, 3 -> 2, 2 never (:1386); a tie (:1396) | reading |
| no expiry, no cooldown, no prompt; a leaver's flags cleared | a voter's leave and return (:1450); a voter leaving during FINAL ROUND (:1499) | reading |
| when the kick applies | the screens named (:1460); GAME COMPLETE's start (:1466); ROUND COMPLETE's start (:1484) | reading (`VOTE_KICK_POINT_READING`, §5.2) |
| the kicked player's screen (UIMnLOC 539, 541, 540; 4 s) | the room's half: `kicked` 'vote' and the close 4002 (:1345) | the room's half a reading; **owed**: the page's #539 (the script's 0.5 s, the three lines, its 4 s) -- ONL-22's screens |
| the rejoin refused, -972 "banned from that game" | the room's address refusal (:1345, `refused` /banned/) | **placeholder** (`VOTE_BAN_SCOPE_PLACEHOLDER`, §6); **owed**: the account's -972 for that game (below) |
| the "Alert" after each vote | none | not built: its purpose untraced (research 179 §6.6); a watch on `0x44fb48` in the recomp's vote run |
| no host kick | none needed: the room has no host's kick (no event asks one; source inspection) | kept |
| no idle kick (§2) | the room's idle kick is ours (:1310, :1323) | a deviation (below) |
| the spectators' eject "VOTE ALL" (§1.1) | none | **owed**, not built: to sprint 22 with the rejoin's -972, one proposed slice (below; the room has no spectators' vote) |
| whether a side switch clears a voter's flag | none | not read (`FUN_002c4290` D:L165538-165568 shows no clear); the recomp's vote run |
| "and a recomp vote run" | none | **owed**: research 206 §4.5, S3's item 23 -- `BanSelfFromGame`'s request on the wire (§5.2's last paragraph); the proven level |

**The rejoin's -972: owed, not wired.** The lobby's `RoomService.banFromGame` (`lobby.ts`, the account refused that
game with PlayerBanned -972, `FUN_002edba0` D:L190430; held by `lobby.test.ts:371`) still has no caller. Wiring it
needs the bridge to learn which seat a passed vote removed, and nothing tells it: the room's hooks (`RoomOptions`) are a
round's start, its end (`onRoundOver`), an abandon and the load hold; the removal's close (4002) reaches the bridge as
any socket's close (`GameSeat.left`, `server.ts`'s close handler, no code passed), the same as a page closed. So it
needs a new room hook called in `applyVotes` beside the bridge's `banFromGame(game, account of the seat)` -- more than
the bridge and a hook the room already has, which this task's dispatch left owed rather than built. Its test, owed with
it: the removed account's JoinGame to that game answers -972, another game admits it. Its home: **owed to sprint 22**,
beside SVC-23a and SVC-23b (moderation's slices there), as one proposed slice, the vote's rejoin refusal (-972 through `banFromGame`, a room hook in `applyVotes`) and the spectators' VOTE ALL (it
opens `room.ts`'s options, a hot file; the roadmap block is the next planner's); the room's address ban stays beside it
until the owner rules (H-next d).

**The deviations: what the port does that the original did not** (OT.R26, harden now; OT.R27, the network modern, the
original's look kept; V22: the original's moderation is the vote, the voice mute, the ignore list -- nothing more):

| the deviation | where | the original | the ruling or default |
|---|---|---|---|
| the idle kick | `room.ts` (`idleKickMs`, held to `IDLE_KICK_MIN_MS`-`IDLE_KICK_MAX_MS`, 3-5 minutes; `kicked` 'idle'), from round 1 in a launched game; a watcher's own idle close (§5.1) | none (research 91 §17 §2; V22) | the owner's (W3.R13; OT.R41: kept from round 1); talking is not activity (H141's default, W20.R13) |
| the ban by address | `room.ts` (`banned`, `VOTE_BAN_MS`: 10 minutes, in the room only) | the account refused "that game" (-972), on the victim's own MediusBanPlayer (§5.2) | `VOTE_BAN_SCOPE_PLACEHOLDER` on H170 (H-next d)'s default. Its weakness (research 169 §5, §8.1 point 15): a network address is not a person -- it refuses everyone who shares it (a household, a university; every player when the proxy's address is all the server sees, `TRUST_PROXY` unset, research 169 §6.7) and is dodged by changing it |
| the server counts the votes | `room.ts` (§5.2) | the target's console | labelled (OT.R27) |
| the flood limits | `limits.ts`, `accounts.ts`, `passwordHash.ts` (§5.1's names: the `D9_*` stand-ins, `HASH_QUEUE_DEPTH_PLACEHOLDER`, the `GAME_PASSWORD_*` limits) and the policies stated without a stand-in | nothing of a flood limit in the client (Sony's servers', unobservable) | OT.R26; research 169 §9 |
| name sanitising | a typed room name cleaned to at most 30 printable characters and made unique (`viewer/src/net/lobby.ts` `sanitizeName`, `NAME_MAX`; V25); the server's `name` event at most 256 characters (`room.ts`); an account's name the accounts' rule (research 169 §6.5) | the console's keyboard (research 91's `NAME_MAXLEN_PLACEHOLDER`: 30 used) | OT.R26; the look-alike names H85's |
| a line's characters outside printable ASCII | `chat.ts` (`CHAT_PRINTABLE_ADAPTATION`, §3) | the keyboard makes none | labelled (OT.R26) |
| **not built: the reporting path** | -- | none | research 169 §7 measure 10's least form: a report names a player and a match, is rate-limited, and is kept beside the audit ledger for a moderator. Owed to sprint 22 with SVC-23a/b; nothing of it here |
| **not built: the account ban** | -- (the ladder's seam `LADDER_BANNED_SOURCE_PLACEHOLDER`, research 261 §6, stays empty) | none beyond the game's -972 | an operator's tool; what a banned account keeps is H86 call 11 (LADDER-BANNED). Owed to sprint 22 with SVC-23a/b; nothing of it here |

**The two defaults on H170 (H-next d)** (H34 open; each a placeholder, §6):

- **The ban's scope**: `VOTE_BAN_SCOPE_PLACEHOLDER` unchanged -- the address, 10 minutes, in the room; its row (§6) now
  says the original's "that game" (-972) and what settles it.
- **The chat filter**: `CHAT_FILTER_PLACEHOLDER` (`chat.ts`) -- no filter beyond the 63/64 cut: `ChatHooks.line` stays
  unset in `createServices`. **Where a filter existed, read on the client's send path: on the server.** Before every
  online line the console sends the lobby server's TextFilter (Lobby 0x98, type 1 Replace) -- the briefing room's line
  from `FUN_002f4860` (the type at D:L194565, the request at D:L194571 with `FUN_002f4ba0` as its continuation,
  D:L194569), a whisper's after its FindPlayer (`FUN_00648f10`, D:L194585) from that reply's callback `FUN_002f4a20`
  (D:L194614-194647, the request at D:L194646), the game lobby's from `FUN_002f4df0` (D:L194753-194759, called at D:L160062) -- and its
  callback `FUN_002f4ea0` (D:L194765-194778) hands the reply's text field (+0x15, after the 21-byte message id; our
  Horizon's `RT.Models/Lobby/MediusTextFilterResponse.cs`) on to the send without reading the reply's status. The
  client holds no word list and replaces nothing itself; a LAN game's line skips the request (`FUN_00281d40`
  D:L128313-128320). So the filtering was Sony's server's, and what it replaced is **unknown**: no capture holds a
  TextFilter exchange (the s4 slice has none). A server-side filter, if built, would be our Horizon's: a Replace removes
  a configured pattern's matches and trims (desktop@be557831 `Server.Medius/Medius/MLS.cs:3959-4000`,
  `Server.Medius/Program.cs:443-482`), its chat check drops a matching line (`MLS.cs:3889-3890`), the patterns
  configuration (V24) -- a deviation until its words are known, so not built. Test: `chat.test.ts`, "SVC-23:
  CHAT_FILTER_PLACEHOLDER" (the name; a room's line, a whisper and the game lobby's line unchanged but for the cut; the
  same through `createServices`' mount).

Horizon's bans, for the record (V24; none followed): an address checked at the connection (desktop@be557831
`Server.Medius/Medius/BaseMediusComponent.cs:108-115`, `Server.Database/DbController.cs:658`), a MAC
(`DbController.cs:685`, `:712`, checked at JoinGame `MLS.cs:2844-2860`, answering MediusFail), an account at the login
(`Server.Medius/Medius/MAS.cs:569-582`, MediusAccountBanned -953, `RT.Common/Types.cs:117`); it names MediusBanPlayer (0x8A, `RT.Common/Types.cs:712`)
and handles none, so the victim's own ban request has no Horizon answer to copy.

The runs (unit tests; `npx vitest run --maxWorkers=1`, one file set per call, 2026-10-10): **RED** -- `chat.test.ts`
with the new block on the base's `chat.ts`: 1 failed (the name: `CHAT_FILTER_PLACEHOLDER` undefined), 22 passed -- the
two behaviour tests green on the base (the default already held: no filter was ever mounted); the kicks' block of
`room.test.ts` with the dead voter's test (`-t "the kicks"`), 16 passed, 157 skipped by the filter -- a verification
of a rule kept, green on the base. **GREEN** -- `room.test.ts` whole 173 of 173; `chat.test.ts` and `ignore.test.ts`
44 of 44; `bridge.test.ts` and `lobby.test.ts` 83 of 83; `placeholderLedger.test.ts` 13 of 13; `roundLedger.test.ts`
4 of 4; `roadmapGraph.test.ts` 54 of 54; `docs.test.ts` 16 of 16; the server package's `tsc --noEmit`, 0 errors. None skipped but
the RED run's filter. `room.ts` changed in its comments only (the rejoin's owed line, `VOTE_BAN_MS`'s settling line, VOTE ALL's home).

## 6. Placeholders and readings

| name | value | what it stands in for | what would settle it | status |
|---|---|---|---|---|
| `ROOM_CHAT_LINES_READING` (server `chat.ts`) | `11` | the most lines a receiver's mailbox holds for its poll: the briefing room panel's per-room list (`FUN_001f5020` D:L55057-55154) | ONL-32's capture of a room with more than 11 lines | reading |
| `ROOM_LINE_SKIPS_GAME_SEATS_READING` (server `chat.ts`) | a member seated in a game is not sent the room's line | the server's delivery of a room's line to a member in a game lobby, unobservable; the client's half read: it draws none in state 17 (`FUN_002f4ef0` D:L194797; D:L190483-190484) | a capture of a console in a game lobby while its room chats (ONL-32) | the client's gate a reading; the server's delivery inferred until ONL-32 |
| `WHISPER_REACH_READING` (server `chat.ts`) | any player in a briefing room or a game | how far Sony's server carried a whisper, and whom FindPlayer finds: the client's half read -- it finds its recipient lobby-wide (FindPlayer) and draws one in every state; Horizon's `ChatMessage` stops at the sender's channel (`MLS.cs:4119`), Horizon's FindPlayer takes any logged-in player (`MLS.cs:1346-1396`), the room-or-game set is ours | ONL-32's transcript of a whisper across two rooms and to a player in a game | the client's search and drawing a reading; the server's reach inferred until ONL-32 (the client followed, not Horizon) |
| `IGNORE_LIST_CAP_PLACEHOLDER` (server `ignore.ts`) | `{ entries: 64, status: -956 }` | the most accounts an ignore list holds and the status past it: Horizon has none; the console says MP_IGNORE_LIST_FULL for any refusal (`FUN_00300e60` D:L202287-202290); 64 the client's list's boot count, 64 empty records it grows past (`FUN_00402420` D:L328712), no cap's evidence, MaxExceeded the clan caps' status (§4.3) | ONL-32's transcript of an add past the original's cap | placeholder |
| `IGNORE_SELF_STATUS_PLACEHOLDER` (server `ignore.ts`) | DBError (-988) | an account ignoring itself: the console does not stop it; Horizon's store takes it and answers Success (`DbController.cs:902-915`); ours keeps no account on its own lists, so DBError, Horizon's answer for a refused add (`MLS.cs:852-859`) | ONL-32's transcript of a player ignoring himself | placeholder |
| `IGNORE_PLAYER_STATUS_READING` (server `ignore.ts`; wired in `bridge.ts`) | in a game 3, in a room 2, logged in the menus' lobby 2, else 0 | a row's PlayerStatus: Horizon's client status (`MLS.cs:778-785`, `ClientObject.cs:300-309`) as the room service's seat; a logged-in player in no room the menus' lobby's status (`MAIN_MENU_PRESENCE_PLACEHOLDER`, `AccountService.loginAt` the session-by-account lookup; 2026-10-16, CLAN-DOT, research 272 §12 -- the port's narrowing to Disconnected retired) (§4.4) | ONL-32's transcript of the list with an ignored player on the menus | reading: Horizon's game and room states; the menus' a placeholder |
| `MAIN_MENU_PRESENCE_PLACEHOLDER` (server `ladder.ts`; the ignore list's status in `bridge.ts`) | `PLAYER_STATUS.InChatWorld` (2) | the status a logged-in account in no room and no game answers: the console on the menus sits in a lobby world the roster's builder (`FUN_002e6af0` D:L186670) and the friend list's (D:L202759-202762) draw MAIN MENU; the value a reimplementation's -- Horizon's session status, logged in and not in a game InChatWorld (`desktop@be557831 Server.Medius/Medius/Models/ClientObject.cs:300-309`, its roster `MLS.cs:1702`) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript of a roster or friend row for a member on the menus | placeholder: a reimplementation's figure |
| `MAIN_MENU_LOBBY_NAME_PLACEHOLDER` (server `ladder.ts`) | `'Medius'` | that account's lobby world's name: both builders test its first six characters against "Medius" (S:0x3f4020, S:0x3f6090) and draw MAIN MENU; Sony's name for the world is not on the disc (Horizon's default channel "Default", `Models/Channel.cs:27` at be557831, would not draw it) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |
| `MAIN_MENU_LOBBY_WORLD_ID_PLACEHOLDER` (server `ladder.ts`) | `-1` | that world's id (+0x144): Horizon's for a client in no channel (`MLS.cs:1706` at be557831, a reimplementation); no list draws it, PLAYER INFO copies it (D:L191830-191854) (2026-10-16, CLAN-DOT, research 272 §12) | ONL-32's transcript | placeholder |
| `IGNORED_LOBBY_LINE_READING` (server `ignore.ts`) | the lobby server does not forward an ignored sender's line or whisper | the server's half of the ignore list's effect on the lobby's chat; the client's half read: `FUN_002f4ef0` (D:L194781-194803) never consults the list, whose lookup `FUN_003008e0` serves only the game session's line (D:L160150) and the voice mute (D:L166404) (§4.2) | ONL-32's transcript of an ignored player's room line and whisper on the ignorer's and a third's console | the client's half a reading; the server's drop inferred until ONL-32 (W10.R4) |
| `ROUND_CHAT_SCOPE_PLACEHOLDER` (server `chat.ts`; used in `bridge.ts`) | no relay once launched | the round's chat: the same game-session message with a team scope from `ChatRecipient` (`FUN_002ba870` D:L160079-160102), dropped by a receiver of another team (`FUN_002ba9d0` D:L160137-160145); the port had no scope, so a line in a launched game reached no seat | SVC-19's round chat with its scopes | retired 2026-10-12 (SVC-19, research [266](266-the-chat-panels.md) §3.1: the scopes read and built, the line relayed in every state; reading, pending review) |
| `VOTE_KICK_POINT_READING` (server `room.ts`; `voteKickDelayS`) | `['roundComplete', 'gameComplete']`: a passed vote's target removed as ROUND COMPLETE starts (`ENGINE_READ_S`, 3 s, after the result) or, after a match's last round, GAME COMPLETE (13 s after it); never at FINAL ROUND | the screens whose `ExitOnStart` runs `HaveBeenBannedFromGame` (`FUN_002c3550`) and `BanSelfFromGame` on the victim's console (research 179 §6.2 for both screens -- READERX's `dlgMultiplayerRound.rdr` and `dlgMultiplayerFinalReally.rdr`; research 187 §7.1 for ROUND COMPLETE only; the fixture's `RUN/MPZANIM.ZAR` `dlgMultiplayerRound.rdr` set, §5.2); the room's screen timings research 91 §18's | the recomp's vote run timing the request and `dlgNetBanned` against the screens (research 206 §4.5, S3's item 23) | reading (SVC-23d, 2026-10-10; reviewed 2026-10-10) |
| `VOTE_BAN_SCOPE_PLACEHOLDER` (server `room.ts`: `banned`, `VOTE_BAN_MS`; first listed in research 91's placeholders) | the removed player's network address refused by the room for 10 minutes (443's words) | the original's rejoin refusal: the account refused "that game" -- JoinGame -972 `MediusPlayerBanned` (`FUN_002edba0` D:L190430) after the victim's own MediusBanPlayer, its account, 120 of an unread unit and the game's world (`FUN_002f95f0` D:L197800-197804; research 179 §6.3-§6.4, research 203 §4); a dedicated room never ends; the lobby's `banFromGame` (the account's -972) not yet called (§5.3) -- *2026-10-10, SVC-23e: called beside this ban, the account's -972 for that game (research 264 §4, `GAME_BAN_LIFE_PLACEHOLDER`); this name still the room's address ban* | the owner (H-next d, H34); ONL-32's transcript of a removed player's rejoin; the recomp's vote run for how long the refusal lasts | placeholder (H-next d's default kept, SVC-23 2026-10-10) |
| `CHAT_FILTER_PLACEHOLDER` (server `chat.ts`) | `'none beyond the cut'`: `ChatHooks.line` unset, every line as `chatCut` makes it | the text filter Sony's lobby server applied to every online line: the client asks it (TextFilter Replace) and sends the reply's text, holding no list of its own (`FUN_002f4860` D:L194565-194571, a whisper's `FUN_002f4a20` D:L194614-194647, `FUN_002f4df0` D:L194753-194759, `FUN_002f4ea0` D:L194765-194778; §5.3); what it replaced unread; a server-side one would be our Horizon's (desktop@be557831 `MLS.cs:3959-4000`, `Program.cs:443-482`; V24) | the owner (H-next d, H34); ONL-32's transcript of a TextFilter exchange | placeholder (SVC-23, 2026-10-10) |

Four labelled adaptations stand beside them, no unknown of the original's (no ledger row): `CHAT_PRINTABLE_ADAPTATION`
(OT.R26 hardening, §3), `CHAT_POLL_ADAPTATION` (the HTTP seam's mailbox, §1; its cost: a line one poll late, the
period ONL-23's, and lines past 11 between two polls dropped, oldest first), SVC-17's `IGNORED_GAME_LINE_ADAPTATION`
(the game lobby's line dropped at the bridge where the console's receiver drops it, §4.2; no cost seen) and VOTE-LOG's
`VOTE_HUMAN_SEATS_ADAPTATION` (match `room.ts`: the vote threshold counts the target side's human seats, the target
counted -- the original has no online bots, so its side count was its human count, §5.2; Trello d3xR0sr2).

## 7. What is left

- **The panels** (ONL-23, sprint 22; W10.R4): R1 and the keyboard, the briefing room's `CHATLIST` and the game lobby's,
  the `"%s: %s"` line `FUN_002f4ef0` queues (`S:0x3f5638`) and the panel's colours, the sender's own line drawn locally
  (D:L194700-194707, D:L160111), and the poll's period. `TEXT_CHAT_GATE_READING` stays until then. *2026-10-10:
  built by ONL-23 -- research [266](266-the-chat-panels.md) §1 (the poll's period `CHAT_POLL_MS_ADAPTATION`; the gate
  retired; the received line's form read from the instructions, `CHAT_LINE_ARGS_READING`).*
- **The history's length** on the console is read (§3: 11 and 21); a capture confirming it is ONL-32's.
- **Who receives what across rooms** is read at the client (§2); what Sony's server did is not observable, so the two
  readings of §6 stand until a transcript.
- **SVC-17** (wave 2, 2026-10-09): built -- the three pairs, the cap, `receives` filled for the room's line, the
  whisper and the game's line (§4). Left: the panel (`dlgIgnoreList`, `IgnoreListVar`, PLAYER_IS_IGNORED's local
  check, the PlayerStatus glyphs) with ONL-23's panels (W10.R4); AddToIgnore's AccountGetID step is the page's (the
  add takes an account id, as the console's AddToIgnoreList does); the voice mute at a join is SVC-20c's (R170.10);
  the cap, the self-ignore's status, the row's status off the rooms and the lobby server's drop wait on ONL-32 (§6).
  *2026-10-11: the panel, PLAYER_IS_IGNORED's local check, the glyphs and AddToIgnore's lookup built by ONL-25 --
  research [269](269-the-players-pages-and-the-medals.md) §1 (the lookup FindPlayer, `IGNORE_NAME_LOOKUP_PLACEHOLDER`).*
- **SVC-23** (wave 4, 2026-10-10; §5.3): the acceptance read clause by clause, the dead voter's refusal tested, the
  deviations listed, H170 (H-next d)'s two defaults named (`VOTE_BAN_SCOPE_PLACEHOLDER` kept; `CHAT_FILTER_PLACEHOLDER`, `line`
  unset). Left: the page's #539; whether a side switch clears a voter's flag; the recomp's vote run (the proven
  level); the owner's two calls (H-next d); and, **owed to sprint 22** beside SVC-23a and SVC-23b (moderation's slices
  there): the reporting path and the account ban (H86 call 11), and one proposed slice, the vote's rejoin refusal (-972 through `banFromGame`, a room hook in `applyVotes`) and the spectators' VOTE ALL
  -- the lobby's `RoomService.banFromGame` (the account's -972 for that game) wired to the room's vote kick with its
  test, and "VOTE ALL" (not built; §5.3). *2026-10-10: both built by SVC-23e -- research 264 §4 (reading, pending
  review); the page's part and the proven level left, 264 §7.*
- **SVC-23d** (wave 4, 2026-10-10): the vote read against the original; the kick moved to the screens' start
  (`VOTE_KICK_POINT_READING`). Left: the page's half of #539 (the 0.5 s, the screen's three lines, its 4 s; ONL-22's
  screens); the recomp's vote run (the proven level); whether a side switch clears a voter's flag (not read).
- **SVC-19**: the round's team scopes (`ChatRecipient`, scopes 1-3, `"(Team)"`), the in-round message window, and the
  EnableExternalWhispers rule for a whisper drawn in a round. *2026-10-12: built by SVC-19 -- research
  [266](266-the-chat-panels.md) §3 (reading, pending review).*
- **A universe broadcast** (type 2) is drawn by the client in every state; no sender of it was found in the client
  (Sony's announcements, likely): not built.
