# The operator announcement toast -- design

> Written 2026-11-07T22:30Z (`date -u`) on `agent/misc-designs` from `main` at `964e9e47a`, by the controller's seat
> redotcom-a0 (Claude Fable 5.1) from the owner's words in that seat the same evening. Evidence kind for the whole
> document: source inspection and read-only git at `964e9e47a`, plus the read-only recon of 2026-11-07 (the file and
> line numbers below are that head's). Nothing was built or run. The plan that builds it is written from this document
> (`../plans/TEMPLATE.md`); this document holds no rule: the rules are the root `AGENTS.md`.

**The owner's word (Craig, 2026-11-07, in the seat, verbatim):** "An operator central announcement toast, that shows
up like the server reset message (but is closable) that allows us to send players a message in games. Make it global
or specific to a single game." Asked whether the restart warning itself should move into the closable toast or stay
exactly as it is: **"Approved. Stay."**

**Track:** product (OT.R53). A browser adaptation with no original: SOCOM II's server never sent a free-text message
to a player in a round. Every wording, timing and size below is a `*_ADAPTATION` constant; nothing here changes what
the game does, draws or plays, and the original's own routing of a server system message (`FUN_0030dce0`, research
345 §4.5: a popup in the menus below severity 0x80, a "Server: ..." chat line above it, a HUD line in a round) is not
touched -- it keeps carrying the restart warning as today.

## 1. Intent

An operator -- Craig, Chris, or a community host's operator -- types one command on the server's box and every
player it names sees a panel they can read and close: in the lobby, in the briefing room, while a match loads, and in
a round. The panel reaches a single game ("game 3783: the host restarts after this round; rejoin from the lobby") or
everyone ("the playtest ends at 23:00Z; thank you"). It is not a chat line that fades in seven seconds, and it does not
need a page reload or a restart.

## 2. Goals, non-goals, anti-goals

**Goals**
- One command, two scopes: everyone on central, or one game by its number (the game id central already places on a
  host, `Placement.hostOf(game)`).
- Shown in every place a player can be: the online menus, the briefing room, the match's loading hold, a round, the
  spectator and dead views. Today a restart warning shows nowhere while a match loads (RUNBOOK §gaps).
- Closable from a pad (Cross), the keyboard (Escape, OT.R62) and a pointer (the X). LATER 187's lesson: the update
  notice could not be answered from a pad.
- A player who joins a game while the announcement is in force sees it (the room's kept-notice precedent, `room.ts`
  `systemKept`, LATER 261).
- Withdrawable: `notice withdraw <id>` takes it down everywhere, which also closes LATER 273 for the new kind.
- Reaches games on community hosts through central, not only through the host operator's own file -- **by the
  lobby poll**, which every logged-in page runs in every state (§3, the builder check's finding), so no host, link or
  room change is needed for this.

**Non-goals**
- No change to the restart warning: its command, its wording, its routing, its HUD line and popup stay (the owner's
  "Stay").
- No web admin page, no HTTP admin endpoint, no token: the operator channel stays a command line writing a file in
  DATA_DIR that central checks once a second (`match/src/notices.ts:26-28`: "no network surface, no unauthenticated
  path").
- No rich text, no links, no images, no sound. Plain text, at most `PIPE_SYSTEM_TEXT_MAX` (1000 bytes) on the pipe and
  999 bytes in the file, as the announcements' limit.
- Not recorded in a replay (`roomSystem.test.ts`'s "never recorded" pin extends to the new kind).
- No per-player targeting, no per-team targeting, no scheduled announcements (a `--until` end is the one time field).

**Anti-goals (a failure even if it works)**
- A panel a player cannot get rid of in a round, or one that steals the pad's focus from the game for longer than the
  press that closes it.
- A message that changes the round: pauses, blocks input, hides the HUD's own messages, or shows in a replay.
- A second place the restart warning appears (two restart notices for one restart).
- A control-link change: the link's version check is exact-match both ways (`central/src/controlLink.ts:1022` refuses
  4001, `host/src/link.ts:600` shuts), an unknown type closes an older host's link as malformed (`link.ts:713`), and
  hosts rebuild from `main` on a 15-minute cron (RUNBOOK `:97`), so a new message type or a version bump disconnects
  hosts in an order nobody controls. This design touches neither the link nor the room (§4.2).

## 3. What exists (read at `964e9e47a`)

- **The restart notice** (SA-43c Parts 1-2, B126 / PR #428, LATER 261 / PR #435): `central/src/cli/noticeMain.ts:11-12`
  accepts only `restart <minutes>|now`; `writeNoticeOnce` writes DATA_DIR's `notices.json` (`match/src/notices.ts:117`,
  a duplicate within 25 s skipped); central watches the file each second (`main.ts:313-316`, `watchNoticeFile`
  `notices.ts:137`) into an in-memory `Notices` store; a notice written before this central started is never told. The
  shapes: `SystemNotice { id; severity; text }`, `Notice extends SystemNotice { at; until; restartAt? }`
  (`match/src/noticeHold.ts:9, 16`); live for 60 s, at most 8 kept (`:26, :28`); wording and severity 0 at `:74-89`.
- **Central to the page**: on the 1 s chat poll, `/lobby/chat-lines` answers `{ lines, system?: SystemNotice[] }`
  (`central/src/lobbyHttp.ts:77, 312, 471-472`); the page parses it in `viewer/src/briefingRoomHost.ts:121-131` and
  shows each id once (`ui/src/screens/briefingRoomChat.ts:488-494`). **The poll runs whenever the lobby client is
  logged in, not only in the lobby**: `BriefingRoomChat.up()` is `lobby.up` (`briefingRoomChat.ts:332`), set at login
  and cleared at logout (`lobbyClient.ts:413, 436`); the `round` and `loading` sinks (`frontEnd.ts:505-509`,
  `briefingRoomChat.ts:470-476`) exist because polled system messages arrive during a match. The page knows its game
  id in the game lobby (`gameLobbyHost.ts:709`) and in the match (`matchMount.ts:1665`). A fresh page's `lastSystem`
  is 0, so a live notice reaches a late joiner on its first poll. An old page keeps `id / severity / text` of each
  `system` entry and routes it by severity (`briefingRoomHost.ts:121-131`); the poll carries no page version.
- **A host's own notice**: `host.mjs notice restart <m>|now` writes `host-notices.json` (`host/src/cli/notice.ts:34`);
  the supervisor watches it (`supervisor.ts:864-869`) and `tellSystem` (`:428-433`) sends every ready process the pipe
  message `{ t: 'system'; severity; text; restartAt? }` (`match/src/pipe.ts:198`, parsed `:387-392`, capped
  `PIPE_SYSTEM_TEXT_MAX = 1000` `:78`); `tellActive` (`:440-444`) re-sends the latest to a process that becomes ready.
  The process: `MatchServer.tellSystem` (`server.ts:960`) tells every room; `Room.tellSystem` (`room.ts:10474-10478`)
  sends every connection `{ type: 'system'; severity; text }` (`viewer/src/net/protocol.ts:1692`, protocol 11 kept) and
  keeps it in `systemKept`, re-told at each welcome (`room.ts:3061-3064`, `noticeHeldAt`).
- **Central to a host**: the control link, protocol 7 (`central/src/controlLink.ts:458-500`, shapes `:677-693`);
  `Directory.send(hostId, body)` (`directory.ts:910`) and `tellLive(body)` (`:921`); on the host a `GAME_MESSAGES`
  type (`host/src/link.ts:451-456`) goes to `procs.get(m.game)`'s pipe (`supervisor.ts:703-714`). **No notice message
  exists on the link**; the only related one is `drain { reason? }`. One game is one match process (plus standing
  rooms and forge processes), so a process-wide tell is a game-wide tell. Central constructs a `MatchServer`
  unconditionally (`main.ts:444`; without the local host it has no source) and its notices never call it. **None of
  this path is used by this design** (§4.2): it is recorded for the LATER row that may add the link path as a second
  channel for a page whose central session dropped mid-round.
- **The page's rendering**: one router, `BriefingRoomChat.systemMessage(text, severity)`
  (`ui/src/screens/briefingRoomChat.ts:468-476`), fed by the lobby poll, the game-lobby socket
  (`gameLobbyHost.ts:808`, `frontEnd.ts:533`) and the match socket (`netPage.ts:2214` → `matchMount.ts:263, 1663` →
  `frontEnd.ts:1182, 1199`). In a round: `roundChat.ts:78-88` → `Hud.postMessage` (`hud.ts:2323`), colour 1
  (128,128,64), a 0.36 s fade in, gone after 7 s, not closable. While a match loads (`frontEnd.ts:509`,
  `lobbyMatch.ts:575`): dropped. In the menus below 0x80: `MP_SYSTEM_MESSAGE` (0x3a) opens the disc's `OnSystemMessage`
  popup, closed by CROSS, bound by 20 of 36 dialogs. At 0x80 and above: a "Server: ..." chat line.
- **The closable DOM elements that exist**: the PWA update notice with Restart and Later (`pwa/update.ts:389-445`,
  z 20000, hidden during a match, `:363`); `showPageLine` (`pageLine.ts:14-30`, not closable, hidden in a match); the
  server-update alert (`serverUpdate.ts:27-39`, `role=alert`, z 20001, `#000e11` / `#e7eef2` / border `#c4a04a`, not
  closable, reloads after 5 s); the test room's `#toast` pill (`ui.ts:943-983`). Stacking: canvas 1000, loading screen
  19000, toasts 20000, server-update alert 20001. `pageInMatch(win)` (`pwa/matchSignals.ts:20-48`) says whether a match
  is up.
- **SERVER NEWS announcements** (Part 3) are a different thing and stay: `notice announce` writes
  `announcements.json`, reconciled into SQLite, pulled by the client on entering SOCOM II ONLINE (`serverTexts.ts`).
- **Rows**: H265 (the owner's ask for the restart alerts), H266, H73; LATER 273 (a host's kept notice cannot be
  withdrawn), 261 (done), 187 (the pad lesson); MISSION OT.R62 (Escape closes popups); RUNBOOK gaps `:823-826`.

## 4. The design

### 4.1 The command (central's box)

```
$CENTRAL_CLI notice say --all "<text>"
$CENTRAL_CLI notice say --game <id> [--until <UTC>] [--warn] "<text>"
$CENTRAL_CLI notice say --withdraw <id>
$CENTRAL_CLI notice say --list
```

- `say` writes one entry to `notices.json` through `writeNoticeOnce`, the same file, watcher and id sequence as the
  restart notice, with the new fields: `kind: 'say'`, `game?: number`, `closable: true`, `until` (the time it stops
  being told to newcomers; default `SAY_HOLD_DEFAULT_ADAPTATION` = 10 minutes from `at`; `--until` sets it, at most
  `SAY_HOLD_MAX_ADAPTATION` = 24 h), `severity` 0 (info) or `SAY_WARN_SEVERITY_ADAPTATION` with `--warn` (the toast's
  accent only; nothing routes on it). Text: UTF-8, trimmed, 1..999 bytes, no control characters; the command refuses
  anything else with its reason and exit 2, as `announceMain.ts` does.
- `say --withdraw <id>` writes `{ kind: 'withdraw', of: <id>, at }`: central removes the say from its live set and
  tells the poll a withdrawal once; a page closes the toast if open. Exit 1 if the id is not a live `say`. The verb
  `notice withdraw <key>` already belongs to the SERVER NEWS announcements (`cli/announceMain.ts:19, 44-46, 79-82`,
  dispatched at `noticeMain.ts:29`) and is not reused; the flag form keeps the two apart.
- `say --list` prints the live says with their ids (the operator needs the id to withdraw; today nothing prints one).
- `restart` is unchanged in grammar, wording, routing and file shape; its entries carry no `kind` (read as `'restart'`).
  `NOTICE_USAGE`'s first line keeps the literal words `usage: notice restart` -- `deploy/central/box.sh:179` finds the
  command by grepping the bundle for them.
- `deploy/central/box.sh say ...` and the RUNBOOK's preamble (`CENTRAL_CLI` is defined at `:18`; the recipe goes
  beside the restart notice's) gain the recipe (`$CENTRAL_CLI` over SSM as today; `runbook.test.ts` pins the lines).
  `update-host.sh` is not touched.

### 4.2 Central: the store and the poll (no link, no host, no room change)

- `Notices` (`match/src/notices.ts`) keeps `say` notices live until their `until` (not the 60 s restart hold), at most
  `SAY_LIVE_MAX_ADAPTATION` = 8 beside the restart ones, and drops one on a withdrawal. `noticeHold.ts` stays
  node-free (the page bundles the room).
- **The poll carries says under their own key.** `/lobby/chat-lines` answers `{ lines, system?, says?: Say[] }` with
  `Say { id; severity; text; game?: number; until: number }` and, once after a withdrawal, `{ id, withdrawn: true }`.
  `system` is untouched in shape and content, so a page from before this change -- which routes every `system` entry
  by severity into the disc's popup or the HUD line -- never shows a say as a restart; it ignores the key it does not
  know. `says` is present only while one is live or a withdrawal is pending for that page's `lastSystem` watermark.
- **Scope on the page.** A say with a `game` is kept only when the page's game id (the game lobby's or the match's) is
  that game; a page in the general lobby shows `--all` only. Both scopes reach a player in the lobby, in the game lobby,
  under the loading hold and in a round, since the poll runs in every one of those states (§3).
- **Not built, filed as a LATER row at the plan:** a second channel through the control link and the room for a page
  whose central session dropped mid-round (the room re-tells a kept notice at each welcome, so that page would hear it
  on its next join anyway). If ever built: an additive hello capability flag at the unchanged link version (the
  repository's precedent, "protocol 7 unchanged, additive"), never a version bump or a bare new type (§2's anti-goal).
  `room.ts` is a hot file; this design leaves it alone.

### 4.3 The page: the toast

- A new module `viewer/src/operatorToast.ts` owns one DOM panel (`role=status`, `aria-live=polite`) at z-index 20000
  in the server-update alert's style (`#000e11` / `#e7eef2` / `#c4a04a`, the same font stack), above the loading
  screen (19000) and below the server-update alert (20001). One panel at a time; a second live `say` queues and shows
  when the first closes. It shows the text and one "OK" button; it closes on the button, on Escape, on Cross (the pad
  path the START menu uses), or on a click or tap anywhere on it; it never closes on its own while in force, and a
  withdrawal closes it. Closing remembers the id for the session (`sessionStorage`), so the room's re-tell at a
  welcome or the poll's repeat does not reopen it.
- **Where it shows**: on every page that draws the online lobby, the briefing room, the loading hold or a match
  (`frontEnd`'s pages; the test room and the forge pages are out of scope, as the RUNBOOK's gap list leaves them).
  It is not hidden by `updateNoticeHidden`'s rule (that rule is the update notice's).
- **Routing**: `chatReplyOf` (`briefingRoomHost.ts`) parses `says` beside `system`; a say goes to the toast and
  nowhere else -- not to `BriefingRoomChat.systemMessage`, not to the HUD's message window, not to the disc's popup,
  not to the chat line -- so the original's routing of a `restart` (and of every `system` entry) is unchanged. One
  entry point (the poll), so deduplication is by id against the session's seen set only.
- **Input**: while the panel is up the game keeps every input but the one press that closes it; in a round the panel
  sits in the lower third over the HUD's message window area (the builder places it so the reticle and the compass are
  clear), its width at most 60% of the canvas, text wrapped, at most `SAY_TOAST_LINES_ADAPTATION` = 6 lines shown
  (longer text scrolls inside the panel).
- A development build logs each `say` and withdrawal to the console with its id (the playtest seat reads consoles).

### 4.4 Constants (all adaptations, in `noticeHold.ts` or `operatorToast.ts`)

`SAY_HOLD_DEFAULT_ADAPTATION` 10 min; `SAY_HOLD_MAX_ADAPTATION` 24 h; `SAY_LIVE_MAX_ADAPTATION` 8;
`SAY_WARN_SEVERITY_ADAPTATION` 1; `SAY_TOAST_LINES_ADAPTATION` 6; `SAY_TEXT_MAX_BYTES_ADAPTATION` 999 (the
announcements' limit). The control link's version stays 7. Nothing here is a `*_PLACEHOLDER`: there is no original
value to read.

## 5. Tests the builder writes first (vitest, the existing files' pattern)

| where | test | holds |
|---|---|---|
| central `test/notices.test.ts` | `say` parses, refuses bad text and bad `--until`, writes the entry; `--withdraw` removes a live say and refuses an unknown id; `--list` prints ids; a `say` lives to its `until`, a restart to 60 s; `NOTICE_USAGE` starts with `usage: notice restart`; `notice withdraw <key>` still reaches the announcements | 4.1, 4.2 |
| central `test/lobbyHttp*.test.ts` | `/lobby/chat-lines` carries `says` beside an unchanged `system`; a withdrawal appears once per watermark; `says` absent when nothing is live | 4.2 |
| match `test/matchNodeFree.test.ts` | `noticeHold.ts` stays node-free | 4.2 |
| ui `test/screens/systemMessage.test.ts` | every `system` entry routes as before (`FUN_0030dce0`); nothing of a say reaches `systemMessage` | 4.3 |
| viewer `test/systemMessagePage.test.ts` | `chatReplyOf` parses `says` and a withdrawal; a say with another game's id is dropped; an old reply without `says` parses as today; the same id on two polls shows once | 4.3 |
| match `test/replay*.test.ts` | nothing of a say enters the replay stream (nothing of it reaches the room) | 4.2 |
| viewer `test/operatorToast.test.ts` (new) | shows above the loading screen, closes on OK / Escape / Cross, remembers a closed id, queues a second say, closes on withdrawal, never auto-closes | 4.3 |
| central `test/runbook.test.ts`, `test/centralDeploy*.test.ts` | the RUNBOOK and box.sh recipe lines | 4.1 |

Acceptance beyond the units: one rendered browser run (the e2e tier) in which a say reaches a page in a round and is
closed from the keyboard, and one in which a late joiner sees a live say; the evidence kinds kept apart in the plan's
Log.

## 6. Rollout

Central and the page in one release: the poll path reaches every logged-in player on every host, ours or a
community's, with no host change. A page from before the release ignores `says`; a page after it shows them. No
host update, no link change, no ordering constraint.

## 7. Left to the builder

The exact CSS and the panel's placement in a round; the pad-focus mechanics (reuse the START menu's Cross path);
whether `notices.json`'s withdrawals are a second array or entries of a kind; the `--list` output's columns; the
console log line's shape; the e2e spec's fixtures; the poll's watermark for withdrawals. The id sequence is the
existing one.

## 8. For the owner

Nothing open. The one question (the restart warning into the toast) was answered: stay. The rulings this document
rests on are the owner's words quoted at the top; the plan records them under its own prefix.
