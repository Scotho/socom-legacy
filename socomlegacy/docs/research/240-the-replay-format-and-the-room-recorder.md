# 240 -- The replay format and the Room recorder (`.s2r`, PT-01..04)

Written 2026-10-06 for web sprint 33's PT-01 (the plan `../plans/2026-10-06-web-sprint-33-recording-and-the-room.md`,
the design `../specs/2026-10-06-playtest-and-replay-design.md` §4.1). This note owns the `.s2r` replay format: the
records, their byte layout, the writer, the gzip of a closed segment and the seek rule. The code is
`packages/match/src/replay/format.ts`; its test is `packages/match/test/replayFormat.test.ts`. Later tasks append
sections here: the Room recorder (PT-02, PT-02b), offline recording and the segments (PT-03), the server's recording of
every room (PT-04). No game or emulator was run; no server was contacted.

Nothing here is a parity finding. A replay file is a browser and engineering adaptation with no original in the game
(`REPLAY_ADAPTATION`, §3): SOCOM II records no match, so nothing in this note is read from the disc, the decompilation
or a capture. The format carries only what the Room already sends its connections, through the wire's own codecs
(`packages/viewer/src/net/codec.ts`, protocol 10), and it changes no game value or behaviour (the design's PT.R3).

## 1. The format

A replay is one **segment**: one file per room and context (a map, a session's segment), extension `.s2r`
(`REPLAY_EXTENSION`). A segment is a stream of records, a `header` first. While it is being written it is plain
bytes, appended by `ReplayWriter` and handed to its sink at each `flush` (only the bytes since the last flush, nothing
when nothing was written); once closed, the file is the gzip of the concatenated records (`gzipReplay`,
`gunzipReplay`; `node:zlib`'s `gzipSync`/`gunzipSync`).

**A record** is a u8 tag, a u32 payload length (little endian) and the payload: a five-byte prefix. `decodeRecords`
reads records in order until the bytes end. A trailing partial record -- a prefix cut short, or a payload shorter
than its length -- is reported as `truncated: true` with every whole record before it, not thrown: a tab closed
mid-segment leaves a readable prefix (the plan's review focus 1). A whole record whose payload does not decode is a
corrupt file and throws. A whole record with a tag the reader does not know is skipped by its length in a format-2
file (counted in the result's `skipped`, a key present only when one was), and throws in a format-1 file, which never
held one (RE-2, research 249 §3).

**The version.** `REPLAY_FORMAT_VERSION` is 2 (1 until web sprint 38's RE-2), written in the header beside the wire's
`PROTOCOL_VERSION` (10 at this writing): a `snap` or `cmd` payload is the wire's frame of that protocol, so a reader
decodes it with the codec of the protocol the header names. Format 2 added the `hostages` record (tag 8). The format-1
reader threw on any tag it did not know, so it could not skip the new kind, and the version moved (W38.R2). This build
reads formats 1 and 2 (`REPLAY_FORMATS`); a format-1 file has no `hostages` record. From format 2 on the reader skips a
kind it does not know, so a later kind needs no new version (research 249 §3).

**Gzip in the page.** The module also loads in the page's bundle, which never gzips: the page sends a segment
uncompressed and the session service gzips it. `node:zlib` is therefore not imported at the top; `gzipReplay` and
`gunzipReplay` load it when called through `process.getBuiltinModule` (Node 22.3 and later, the way
`packages/central/src/serviceStore.ts` loads `node:sqlite`), and throw a plain error where there is no Node.

## 2. The records

| tag | record | payload | content |
|---|---|---|---|
| 1 | `header` | JSON | `{ header }`: `format` (`REPLAY_FORMAT_VERSION`), `protocol` (`PROTOCOL_VERSION`), `build` (`commit`, `dirty`, `branch` or null, `branchCreated` or null), `map` (the stem, `MP2`), `rules` (`offeredRules`' value), `gameType` (`SimMap.gameType` as a string, or null), `tickHz`, `snapshotHz`, `kind` (`solo`, `dedicated`, `game`), `serverName` or null, `startedAt` (ISO 8601, wall clock), `session` (`{ id, segment }` for a playtest's, null for a server recording) |
| 2 | `players` | JSON | `{ tick, players }`: each `{ id, name, team (or null), role, char }`, at the start and at every change (the lobby's `joined`/`left`/`renamed`) |
| 3 | `snap` | binary | the wire's `Frame.Snapshot`: `encodeSnapshot({ tick, own: null, bodies, doors, env })` -- every body, one `BodyState` each, no recipient's own state left out and no own state added; the doors (`DoorWire`); the world's `EnvWire` |
| 4 | `event` | JSON | `{ tick, event }`: one broadcast `ServerEvent` (spawn, shot, grenade, flinch, score, the round and match screens, turret, bomb, reload sound, action) |
| 5 | `cmd` | binary | u32 tick, u32 player id, then the wire's `Frame.Commands`: `encodeCommands({ viewTick: tick, commands: [command] })` |
| 6 | `mark` | JSON | `{ tick, observation, at }`: a playtest mark, its observation id and its wall clock |
| 7 | `end` | JSON | `{ tick, reason }`: the last tick and why the segment closed |
| 8 | `hostages` | JSON | format 2 (RE-2, research 249 §3): `{ tick, hostages }`: EXTRACTION's roster as the room's welcome carries it (`HostageWire`: `id`, `name`, `character`, `at`, `yaw`, the state `alive`, `ai`, `leader`, `rescuer`, `opacity`, `unit`, and a dead one's `deathClip` and `age`), at a file's open and whenever the roster (each hostage's id, name and model) changes |

**JSON records** are the record without its `kind`, as UTF-8 JSON; the tag gives the kind back.

**`snap`.** The payload is the wire's snapshot frame byte for byte, so a viewer decodes it with `decodeSnapshot`: u8
frame kind, u32 tick, u8 has-own (0 here), u8 body count and 56 bytes a body, u8 door count and 2 bytes a door, then
the environment (u32 revision, u16 round epoch, u16 count, 3 bytes an instance). The record's tick is the frame's. The
frame's sizes give the record's: 21 bytes with no body, 77 with one, 917 with sixteen (5 + 16 + 56 x 16), on a map
without doors or changed instances -- measured with `encodeRecord` at this writing. At `SNAPSHOT_HZ` (30) sixteen
bodies are 27.5 KB/s, about 99 MB an hour before gzip, the design's "~100 MB"; the budget is measured in PT-28. The
codec's quantisation applies: a position is a float32, a yaw 1/182 of a degree (the test reads a foot back to 0.1).
An empty `bodies` is a valid `snap` (21 bytes), so a room with no players still has a timeline without a hole (the
plan's review focus 5, held by PT-02).

**`cmd`.** The wire's command frame carries no player id, and its `viewTick` is a float32, exact only to 2^24 ticks
(77.6 hours at `TICK_HZ` 60); so the payload leads with its own u32 tick and u32 player id, and the decoder reads the
tick from there, not from `viewTick`. The frame holds exactly one command (21 bytes; the record 34); a frame with
another count is refused. The command comes back quantised as the server reads it (`quantiseCommand`'s steps). The
`cmd` stream is on for playtests only, for investigators (the exact inputs at a moment), never for playback.

**Versions** (PT-01b). The header records two versions: `format`, the record layout (`REPLAY_FORMAT_VERSION`, 2; this
build reads `REPLAY_FORMATS`, 1 and 2), and
`protocol`, the wire protocol whose frames the `snap` and `cmd` payloads are (`PROTOCOL_VERSION` when recorded).
`decodeRecords` reads the header first and refuses, before decoding any payload: a buffer whose first whole record is
not a header (`replay has no header`); another format (`unsupported replay format F (this build reads 1, 2)`); another
protocol (`unsupported replay protocol P (this build decodes Q)`). An empty buffer, or a first record cut short, holds
no whole record and returns none. The reason is the wire: the online lane's NET-WIRE bump (`PROTOCOL_VERSION` 10 to
11, a slimmer snapshot) changes the `snap` frame, and the current codec would misdecode an older file silently rather
than fail. `readReplayHeader(bytes)` returns the header alone (null when there is none) without checking either
version, so a player or a lister can show what a file is before refusing it. `decodeRecords(bytes, { allowProtocols })`
is the hook for a versioned decoder, but today only the current protocol has a decoder, so any other value listed
there is still refused. How an older recording stays readable (the merge controller's word of 2026-10-07 for the online lane's NET-WIRE bump to 11): the online lane keeps a frozen `decodeSnapshotV10` beside v11, exported and pinned by a fixture, and sprint 35's reader makes `decodeRecords` choose the snap decoder by the header's `protocol`, so a protocol-10 recording stays readable through `allowProtocols: [10]`; a protocol with no kept decoder is refused, never guessed (W33.R6, PT.R10).

## 3. Placeholders and adaptations

There is no placeholder or reading in this format: no value in it stands for an unread value of the original.
`REPLAY_FORMAT_VERSION` is a version, not a chosen value. The names below are adaptations with no original, exported
as strings: the first two from `packages/match/src/replay/format.ts` and stated in its header, the third from
`packages/match/src/room.ts` (the room writes the record).

| name | what it is | why it has no original |
|---|---|---|
| `REPLAY_ADAPTATION` | the `.s2r` file itself: the records, the tags, the layout, the gzip of a closed segment | SOCOM II records no match; the format is an engineering adaptation for the playtests and replays, carrying only what the Room already sends and changing nothing the game does (PT.R3) |
| `SEEK_SNAPSHOT_RULE_ADAPTATION` | the design's seek rule (spec §4.1): `seekIndex` returns the index of the `snap` with the greatest tick at or before the target (the later record on a tie), or -1 when there is none; the events between that snapshot and the target are skipped, never replayed | a viewer's seek is not the game's; a shot's tracer or a grenade's arc is transient, and the next event draws itself |
| `REFUSAL_RECORD_ADAPTATION` | SIMDROP-INSTR (2026-11-02; product track, an instrument): the format-3 `refusal` record, one a `fire: cone: *` refusal -- the claimed eye and aim, the room's eye locus at the command's blend and the claim's distance from it, the body's feet, ground and stance -- and its log line, capped a seat a round (`REFUSAL_LINES_PER_ROUND`; `room.ts` `noteRefusal`, `takeRefusals`); replay-only, nothing judged changes | the original has no replay and no such record; it names what the room already decided, after the fact (J-MOS game 3201 r7: a `fire: cone: eye` could not be told from the room's own eye locus without it) |

## 4. The recorder

Written 2026-10-06 for PT-02 and PT-02b. The code is `packages/match/src/replay/recorder.ts` (`RoomRecorder`,
`FileRecorder`) and `RoomOptions.recorder` with `Room.closeRecording` in `packages/match/src/room.ts`; the test is
`packages/central/test/replayRecorder.test.ts`. It is the same adaptation as the format (`REPLAY_ADAPTATION`, §3): no
value of the original, nothing the game does changed.

**The call sites**, by function, each one added line and nothing else moved:

| `Room` function | the call | what it records |
|---|---|---|
| `snapshots()` | `recorder.snapshot(tick, list, doors, env)`, before the loop over the connections | the omniscient snapshot: every seated body (`list`, the same `BodyState`s the pages get), the doors and the world; no recipient's own state and nobody left out -- a page's own body is filtered out per connection after the call, as before |
| `broadcast()` | `recorder.event(tick, ev)`, its first statement | every broadcast `ServerEvent`, the one an `except` leaves out of a page and the one sent when no page is in the room included (the test sees two: the first joiner's own `joined` and the last leaver's `left`) |
| `broadcastChanges()` | `recorder.players(tick, members)` after its loop over the changes, when there were changes | the lobby's members after the change: `Lobby.players()` then `Lobby.spectators()` (every member; no accessor added to `lobby.ts`), each `{ id, name, team, role, char }`, `char` the seat's character type (`Player.char`), 0 for a spectator, who has no seat |
| `snapshots()` (RE-2) | `recorder.hostages?.(tick, this.extraction.wire())`, just before the snapshot's call, in a room with hostages only | EXTRACTION's roster as the welcome carries it; the recorder writes it at its file's open and on a roster change (research 249 §3). Without a recorder, or with one that has no `hostages`, `wire()` is not called |
| `aim()` | `recorder.command?.(tick, p.id, cmd)`, the line before `p.cone.tick(cmd, ...)` (W33.R1, PT-02b) | each command the room runs on a live body, at the tick it runs, in run order; `cmd` is the command `run()` handed `aim` (a mounted body's turret-held one, MAP-10b). The queue logic in `run()` is not touched. Optional: a recorder without `command` records no `cmd` (a server recording); the playtests' has it |

`p.cone.tick(cmd, ...)` stands in `aim()`, which `run()` calls once a command, not in `run()` itself: the call is at
that line, so a dead body's command (`run()` reads only its respawn press and never calls `aim`) is not recorded.

**What is not recorded.** A per-recipient `send` -- the welcome, the joiner's score rows, `queue`, `promoted`,
`demoted`, `kicked`, `hurt`, `combat`, a turret occupant's `turret` -- is not: the replay is the room's broadcast
view plus the omniscient snapshot. The `players` record carries what the welcome would tell a spectator joining
(names, sides, roles, types), and since RE-2 the `hostages` record the welcome's `hostages`; the rest is one page's own
view.

**The flush cadence.** `FileRecorder` writes the `header` record at construction, then each call as its record
through a `ReplayWriter`; it hands the bytes to its sink every `flushEvery` snapshots (default 30, about a second at
`SNAPSHOT_HZ`) and at `close` (an `end` record at the last tick it recorded, then the flush). After `close` it records
nothing. `mark(tick, observation, at)` writes a `mark` record (PT-03's and the session service's). `Room.closeRecording
(reason)` calls the recorder's `close`; its callers are the server's (PT-04) and the loopback's (PT-03).

**An empty room** still snapshots: every `Room.step()` runs `snapshots()` on its clock whoever is in it, so a room
every seat has left records `snap` records with `bodies: []` for as long as it is stepped, and the tick timeline has
no hole (the plan's review focus 5; the test "an empty room still snapshots"). Who steps it differs. The server's loop
(`MatchServer.stepRoom` in `packages/match/src/server.ts`) steps a room only while it has players or spectators, so
under PT-04 a dedicated room everyone has left records nothing more until `closeRecording`: its ticks run on without
a gap when someone comes back, but the wall time between has none of its records. The page's loopback room
(`LoopbackMatch` in `packages/viewer/src/net/loopback.ts`) steps on its clock regardless, so an empty one goes on
recording empty snapshots.

**A failing recorder stops itself.** An error from a record's encoding or from the sink never reaches the room:
`FileRecorder` catches it, stops (`failed`; every call after returns at once, `close` included) and reports it once
through its optional `onError` (the fourth constructor argument), so the room steps on and its connections get the
same bytes (the tests "a sink that throws ..." and "a record that does not encode ...").

**The room's behaviour is unchanged.** Every call is a read of values the room has already computed, made before or
beside the send it shadows; the test "leaves the room's bytes to its connections unchanged (PT.R2)" runs the same two
players and commands with and without a recorder and compares every frame each connection received, byte for byte.

## 5. Offline recording and the segments

Written 2026-10-06 for PT-03. The code is `packages/viewer/src/net/loopback.ts` (`setLoopbackDefaults`),
`packages/viewer/src/playtestSession.ts` (the `recording` block), `packages/playtest/src/segments.ts` (`SegmentFiles`)
and the segment messages in `packages/playtest/src/service.ts`; the tests are
`packages/viewer/test/loopbackRecorder.test.ts`, `packages/viewer/test/playtestSession.test.ts` ("the recording"),
`packages/playtest/test/segments.test.ts` and `packages/playtest/test/service.test.ts` ("the segments over the
socket"). The same adaptation as the format (`REPLAY_ADAPTATION`, §3) and a playtest instrument
(`PLAYTEST_INSTRUMENT_ADAPTATION`, research 241): no value of the original, nothing the game does changed. No new
placeholder: the flush cadence is the recorder's own (`FileRecorder`'s `flushEvery`, §4).

**The seam.** The page's `LoopbackMatch` is built in `main.ts`, which the playtest lane never edits (PT.R5). So
`loopback.ts` holds a module-level `defaults` that `setLoopbackDefaults(opts)` replaces (`{}` clears them), and the
constructor reads `{ ...defaults, ...opts }`: the caller's keys win. `opts` may be a function, called at each
construction: the playtest mount registers one that first checks its segment's context, then returns `{ recorder }`,
and clears it at dispose; nothing registers any outside a playtest (`?devmode&playtest=` on a development build). The solo
player is seated at its `hello`, so 60 ticks of a joined room record the header and 30 `snap`s with one body each.

**The header's sources.** `build` from the session message's badge (`commit`, `dirty`, `branch`, `created` as
`branchCreated`; the badge's commit is the service's 7-character short form); `map` is the map's **stem**, read from the
address's `map=` parameter (`main.ts`'s `updateAddress` writes `map=<stem>` with `replaceState` when each load
starts); only where the address has no `map=` (a dropped local file) is it `__viewer.stats().map`, the hook's mission
name; `rules` `offeredRules(null)`, the rules the page's
room is offered when none is asked: `classic` while the respawn rules are off (`RESPAWN_RULES_ENABLED`); `gameType`
null (not on the hook); `tickHz`/`snapshotHz` `TICK_HZ`/`SNAPSHOT_HZ`, `protocol` `PROTOCOL_VERSION`
(`net/protocol.ts`); `kind` `solo`; `serverName` null; `session` `{ id, segment }`; `startedAt` the page's clock when
the segment opens.

**The segment rule.** The first segment opens when the session message arrives, at the index it names. A new one opens
when the map (the address's `map=` stem, else `stats().map`), the address's `mode`, or online/offline (`server=` or `mp`
in the search, or `online=shared` or `local`; the page writes `online=off` into an offline page's address, and that is
offline) differs from when the segment opened -- checked at every frame (`host.frame`, the
overlay's poll) **and** when a `LoopbackMatch` is constructed (the defaults' function). The rotation is the page's
own: the service sends no `segment` message to the page. Then: `recorder.close('context changed')`,
`{ type: 'segmentEnd', segment, reason }`, the index advanced by one, a new `FileRecorder` with its own header, `{ type: 'segment', header }` sent before its first binary frame, and the defaults
now returning the new recorder. **The rebuild fact:** `main.ts` builds a new `LoopbackMatch` when the map changes --
with `&noarmory`, or when the armory entry is that map, in the same `show()` call that sets the loaded map -- and the
address's `map=` has changed when the load started, before that construction; the construction-time check rotates the
segment first if no frame has yet, so the new room always takes the new segment's recorder (the test "a room built in
the tick its map changes, before any poll, takes segment 1"). A mode change that does not rebuild the room leaves the running room on
the closed recorder (it records nothing more), and the new segment records only from the next `LoopbackMatch`. At
dispose: `close('disposed')`, `segmentEnd`, `setLoopbackDefaults({})`. A page that connects to a session that already
kept segments is greeted with the index after the last one, so a reloaded page never writes over a kept file. A
`segment` naming an index the record already holds is refused with `{ type: 'segmentRefused', index, next }`; the page
takes `next` as its index and sends a new header under it, the rooms already built following (their recorder's target
moves to the new `FileRecorder`; the refused one's unsent bytes are abandoned). **Online** (by that rule, in the live
search; the W33 close review) the page opens no recording -- no `FileRecorder`, no `segment` message --
because no `LoopbackMatch` is built and the match server records the match (§6): the segment still takes its index
and restarts the ring, marks and clips go out as offline, and the mark's telemetry says `recording: 'server'`.

**The video ring and the segments** (with PT-06, research 241 §4). The page's rotation (a map, mode or online
change) restarts the video ring and opens a new replay segment together, so a clip never spans segments. The clip's bytes share the session socket's binary channel with the replay's
frames: the service takes the binary frame right after a `clip` message as that clip's, keeps it as
`marks/<obs id>/clip.webm` (research 242 §2), and never appends it to a segment.

**The tick and the marks.** The hook's `tick` (`__viewer.playtest().tick`) is the last snapshot tick the page's room
recorded: the page registers a wrapper of the `FileRecorder` whose `snapshot` keeps it (the recorder exposes none; the
hook's `net()` carries no tick). `mark()` writes `recorder.mark(tick, observation, at)` into the open segment with that
tick (0 before any snapshot) and the page's own `local-<n>` id; the service's `marked` reply maps it to `PT-<session>-<n>`.
A flushed record cannot be rewritten, and `local-<n>` restarts at 1 on a reload, so the service keeps the join in the
record: the observation's history holds `mark local id: local-<n>, segment <s>`. **A reader joins a `mark` record to
its observation by (segment, tick) first, and by the local id within that segment second.**

**The flush-to-frame mapping.** Each `FileRecorder` flush (every 30 snapshots, about a second, and at `close`) is one
binary WebSocket frame through the socket's `sendBinary`; a flush holds whole records, so a frame boundary is a record
boundary. A socket without `sendBinary` (the PT-05 socket before PT-06's) records nothing, and the mark's telemetry
says `recording: 'unsent'` (else `'streaming'`, `'failed'` after the recorder stopped itself, `'server'` online,
`'off'` before the session message).

**The service side.** `SegmentFiles` (one per session directory, one segment open at a time): `open(n, header)`
creates `segments/<n>.s2r.part`, empty (the page's first frame carries the header); `append` adds a frame's bytes;
`close(n, reason, endedAt)` gzips the `.part` into `segments/<n>.s2r` (its modification time `endedAt`), removes the
`.part`, and returns the file (relative to the session) and `ticks`, the last `snap`'s tick in the bytes (0 with none,
or when they do not decode). The session record's `segments` entry is written at `segment` (`index`, `file`, `map`,
`online` = the header's kind is not `solo`, `startedAt` the header's, `endedAt` null, `ticks` 0) and completed at the
close (`endedAt`, `ticks`, and `reason`). A binary frame with no segment open, or from a socket other than the one that
opened the segment (a second tab, a stale page), is dropped with a log line; so is that socket's `segmentEnd`.

**The socket-closed case.** When the socket that opened a segment closes with it still open (a closed tab, a crash),
the service closes it with the reason `socket-closed`. The file then holds every record of every flush that arrived
and **no `end` record** (the page never sent it); it decodes with `truncated: false` because frames are whole records
(the plan's review focus 1; the test "a stream cut after 7 flushes"). The session record's entry says why it ended.
Only the unflushed tail -- under a second -- is lost.

**What the service validates.** A `segment` header is refused (logged, nothing opened) unless its `format` is
`REPLAY_FORMAT_VERSION` and its `map` a string. A `protocol` other than this tree's `PROTOCOL_VERSION` is logged and
kept: the page's header is authoritative for its own room and is never rewritten by the service. A `segment` arriving
while another is open closes the open one as `superseded`. A `segmentEnd` naming a segment that is not open is logged
and ignored.

## 6. The server's recording (PT-04, `REPLAYS_DIR`)

Written 2026-10-06 for PT-04. The code is `packages/match/src/replay/files.ts` (`ReplayFiles`, `RoomRecording`,
`safeRoomKey`), wired in `packages/match/src/server.ts` (`ServerOptions.replays`) and `packages/central/src/main.ts`
(`REPLAYS_DIR`); its test is `packages/central/test/replayFiles.test.ts`. A replay instrument with no original
(`REPLAY_ADAPTATION`, §3): no value here stands for the game's, and the rooms' bytes to their pages are the same with
it on (§4). No game was run; the integration test runs a `MatchServer` on port 0 over a synthetic map.

**Turning it on.** `REPLAYS_DIR` set: `main.ts` makes the directory (`mkdirSync(dir, { recursive: true })`) at the
start and hands the server `new ReplayFiles(dir, log)`; every line it logs is an `info` line. Unset: no room records.

**The file layout.** One file per room and match: `<REPLAYS_DIR>/<room key, safe>/<startedAt, ':' as '-'>.s2r`. A
room key is reduced to `[A-Za-z0-9._-]` (every other character, a path separator included, becomes `_`, a leading
`.` too): a map's room `MP2/classic` is `MP2_classic/`, a game's room `game/MP2` is `game_MP2/` (the server is not
told the game's id: `makeRoom(stem, opts)` names only the map). While a file is open it is `<name>.s2r.part`, appended
at each flush (every 30 snapshots, about a second, and at the close); at the close it is gzipped whole -- off the
tick, through `zlib.gzip` on libuv's pool, so an hour's file never stalls the rooms -- into `<name>.s2r.tmp`, renamed
to `<name>.s2r`, and the `.part` removed: a `.s2r` is always complete, a `.part` is a recording still open or one cut
by a crash (a readable prefix, §5's socket-closed case). Two files of one room started in the same millisecond take
`-2`, `-3` after the stamp. The server's `stop` closes every room's recording and waits for the gzips at most
`REPLAYS_IDLE_LIMIT_MS` (10 000 ms, `server.ts`; a chosen shutdown bound of this port, no game value): past it the stop
resolves anyway and logs one `warn` line naming the files still unfinished (`ReplayFiles.pending()`), whose `.part`
files stay readable prefixes -- a stalled disk never hangs the shutdown.

**The header on the server.** `map` the room's `SimMap.stem`; `rules` the room's; `gameType` `SimMap.gameType` as a
string, else null; `kind` `dedicated` for a map's room, `game` for a bridge's game room; `serverName` the rooms'
`SERVER_NAME`, else null; `startedAt` the wall clock when the file opens; `protocol`, `tickHz`, `snapshotHz` the
wire's (`PROTOCOL_VERSION`, `TICK_HZ`, `SNAPSHOT_HZ`); `session` null (no playtest). `build`: `commit` the
environment's `GIT_COMMIT`, else `unknown` -- the server runs from a copied tree with no git, and **the deploy does not
set `GIT_COMMIT` today** (`deploy/env.example` names it; setting it in the deploy is owed), so a hosted file says
`unknown` until it does; `dirty` false, `branch` and `branchCreated` null (a server is not a playtest's working tree).
The server's rooms record no `cmd` records: `RoomRecording` has no `command` (spec 4.1: a dedicated room pays nothing).

**One file per match.** The server's rooms outlive a match: a map's room starts the next one, a game's may reopen its
lobby. So the room's recorder is a `RoomRecording`, which hands each match to a file of its own (spec 4.9: "closes the
segment at the match's end or its abandonment"). It opens a file at the room's first snapshot; the room's own
broadcast of `abandoned` closes it with the reason `abandoned`, a `roundOver` with `matchOver` set with `match-over`;
the next snapshot opens the next file, which starts with the last `players` roster and the events broadcast since the
close. The match's end is read from the room's broadcasts, not from a server call: the server has no hook for either
(the Room's `onAbandon` is the bridge's for a game room, and there is none for a match's end), and `room.ts` is not
edited (the merge controller's rule).

**The close reasons.** `abandoned` and `match-over` (above, from the room's broadcasts); `removed` -- a game's room
dropped (`dropRoom`, the game's end) or the server stopping; `error` -- a room that threw in its step and was dropped
(`stepRoom`). A map's room is otherwise never removed: emptied, it stays loaded and its open file stays a `.part` until
the next match ends in it or the server stops. The reasons other than the two from broadcasts reach the recorder
through `Room.closeRecording` (§4); after one, the room records nothing more.

**Only occupied rooms step** (§4, PT-02's review F2). `stepRoom` steps a room with a player or spectator in it, so an
empty room makes no snapshot: a room nobody entered writes no file at all, and the time a room stands empty is not in
its file -- the room's tick stands still while it is not stepped, so the ticks show no gap; only the wall clock moved.

**Failures.** A disk failure (a full disk, a directory that cannot be made) stops that one recorder
(`FileRecorder.failed`), is logged once (`replay: the recording <room>/<file> stopped (the room plays on): <why>`), and
never reaches the room -- §4's containment; its `.part` is left as written. A failure to gzip or rename at the close is
logged once and keeps the `.part`; a `.s2r.tmp` already written is removed (a failure to remove it is ignored), so no
complete-looking file is left beside the `.part`.

**Not here.** Retention (`REPLAYS_BUDGET_MB`, `REPLAYS_KEEP_DAYS`), the list endpoint (`GET /replays`), serving a file
and who may see a replay are web sprint 36's (PT-24..PT-29, spec 4.9). Until then nothing sweeps `REPLAYS_DIR`: a
server recording all day fills its disk at the rate spec 4.1 estimates, so it is set on purpose, for a playtest's
server (spec 4.2) or a host whose disk is watched.
