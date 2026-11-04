# 245 -- Every match recorded: the hosted recording, its sidecar, retention and the listing (PT-24..PT-28)

Written 2026-10-08 for PT-24 of web sprint 36 (the plan `docs/plans/2026-10-08-web-sprint-36-every-match-recorded.md`,
rulings W36.R1-R6; the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.9). This note's §1-2 are
PT-24's; §3 (retention) is PT-25's, §4 (the listing and the fetch) PT-26's, §5 (watching by URL) PT-27's and §6 (the
recorder's cost) PT-28's, each written by its task; §7 (the server's records: the orphan `.s2r`, the stale `.part`, the
bounded sweep) is RE-8's, of web sprint 38; §8 (the listing's cursor and the sidecar's result) is RV-4's, of web sprint
39. It stands on research 240 §6 (the server's recording, PT-04).

**A replay instrument with no original** (`REPLAY_ADAPTATION`, research 240 §3): SOCOM II keeps no match, so nothing
here is read from the disc or the decompilation, nothing here is a parity finding, and nothing changes a game value or
behaviour (PT.R3). With `REPLAYS_DIR` unset the server makes no recorder and writes nothing, as before. The evidence
for §1-2 is unit tests (`packages/central/test/replaySidecar.test.ts`; `replayFiles.test.ts` adjusted for the sidecar),
an integration test through the bridge over real sockets on the fixtures' MP2 (`replayBridge.test.ts`), and one
3-second `tools/mp-bots.ts --spawn-server --replays` run on the owner's host (§1, "The smoke"). No game, browser,
build or deploy was run.

## 1. The files and the sidecar

The code: `packages/match/src/replay/sidecar.ts` (new), `packages/match/src/replay/files.ts`
(`ReplayFiles`, `SegmentRecorder`, `replaysRetentionEnv`), `packages/match/src/server.ts` (`makeRoom`'s `game`,
`recording()`'s `accounts`), `packages/central/src/bridge.ts` (`GameBridge.open` hands the game to `makeRoom`),
`packages/central/src/main.ts` (the environment), `tools/mp-bots.ts` (`--replays`).

**The file layout** is research 240 §6's: `<REPLAYS_DIR>/<room key, safe>/<startedAt, ':' as '-'>.s2r`, one file a
match, `.s2r.part` while open, gzipped through `.s2r.tmp` and a rename at the close. What PT-24 adds:

- **The per-game key part** (W36.R1, review focus 1). `MatchServer.makeRoom(stem, opts, game?)` takes an optional
  `{ id, accounts }`; given, the game's room records under the key `game/<MAP>/<game id>` (directory
  `game_<MAP>_<id>/`), so two games on one map never share a directory, let alone a file name; `open`'s `-2`, `-3`
  suffix for a second file started in the same millisecond under one key stays the guard. Without `game` the key is
  `game/<MAP>` as before (research 240 §6's "the server is not told the game's id", true until PT-24). **The bridge
  passes it**: the game's id and its seats live in `GameBridge` (`packages/central/src/bridge.ts`, `LiveGame.id` and
  `LiveGame.seats`, keyed by account id), and `GameBridge.open` calls
  `makeRoom(stem, this.roomOptions(id, live), { id, accounts: () => [...live.seats.keys()] })`, `RoomMaker.makeRoom`
  widened to match (two lines, in a window the merge controller granted after PT-24's first commit). The tests:
  `replaySidecar.test.ts` -- two games on MP2 made with their game, closing in the same (faked) second, give
  `game_MP2_7/` and `game_MP2_8/`, each with its `.s2r` and sidecar and its own accounts; made without (a caller that
  passes none), `game_MP2/<stamp>.s2r` and `<stamp>-2.s2r`, each with a sidecar -- and `replayBridge.test.ts`, through
  the room service and real sockets on the fixtures' MP2: a game of three launched, a fourth account joined into the
  running match, one of the three gone before the end; at the game's end (`endGame`: the room dropped, `removed`) its
  one file is `game_MP2_<id>/<stamp>.s2r` and its sidecar's `accounts` names all four, its `players` the four names.
- **What `live.seats` does on a leave, and why a leaver stays in `accounts`.** A seat enters `live.seats` when the room
  has seated its page (the seat's `seated`, after `Room.hello`), and leaves it when its socket closes (the seat's
  `left`, which deletes the account's entry when it is still the current one). The getter answers the seats now; the
  recorder keeps every account it has ever answered for the file (a union, not a snapshot). It is asked at the file's
  open, at each roster change and at the close. A joiner is not yet in `live.seats` at its own join's roster change
  (`Room.hello` records the roster before the bridge's `seated` runs), so it is counted at the next roster change or
  at the close. A leaver is counted at the latest at its own leave: the server's close handler calls `Room.leave` --
  whose roster change asks the getter while the seat is still there -- before the bridge's `left` removes it. So a
  leaver stays in `accounts`. A takeover (a reload) keeps one account. **Watchers are participants too**: `live.seats`
  holds every seat the bridge gave, a spectator's (joinType Spectator, `GameSeat.watch`) as a player's (`seatFor`
  makes both, and both enter `live.seats` at `seated`), so a watcher's account is in `accounts` and counts as a
  participant for W36.R2's visibility check -- it may list and fetch the match it watched. That is this task's
  reading of "participants", not a ruling: the owner row on who may see a replay (W36.R2) carries it. With `REPLAYS_DIR` unset the getter is never
  asked (`recording()` returns no recorder; `replayBridge.test.ts` holds a hosted game's room without one).
- **A map's (dedicated) room** keeps its key, `MP2/classic` (directory `MP2_classic/`); its seats' accounts are not
  known to the recorder (a maps' seat with a ticket holds a `MapSeat`, which names no account), so its sidecar's
  `accounts` is `[]` (W36.R1); W36.R2 makes its replays the operator's until the owner rules.

**The sidecar** (W36.R1) is `<file>.s2r.json` beside each closed `.s2r`, one JSON object of exactly thirteen fields:

| field | value |
|---|---|
| `id` | `replayId(<room key, safe>/<name>.s2r)`: the first 16 hex digits of the SHA-256 of the path relative to `REPLAYS_DIR`, '/' between the parts (`REPLAY_ID_PLACEHOLDER`, §2) -- never the path itself |
| `room` | the room's key as the server names it (`MP2/classic`, `game/MP2/7`), not its directory |
| `kind`, `map`, `rules`, `gameType`, `startedAt` | the header's (research 240 §6) |
| `endedAt` | the wall clock at the file's close, ISO 8601 |
| `ticks` | the match's length in room ticks (60 Hz): the last record's tick less the first snapshot's. A room steps only while occupied, so time it stood empty is not in it (research 240 §6) |
| `bytes` | the closed `.s2r`'s size, gzipped |
| `reason` | the `end` record's: `match-over`, `abandoned`, `removed`, `error` |
| `players` | every name the file's `players` records carried, once each in the order first seen, with the last side seen (`seal`, `terrorist`, or null for a watcher; a null never overwrites a known side) |
| `accounts` | a game's room's seats' account ids seen in the match, ascending, once each; `[]` for a map's room |

- **Where the facts come from.** The file's recorder (`SegmentRecorder`, one per file, so one per match) gathers them
  as it records: the names and sides from its own `players` calls -- which `RoomRecording` makes from the room's roster
  at each lobby change, and once at a file's open with the last roster -- and the ticks from its records. The accounts
  come from a getter `open` is handed (`OpenOptions.accounts`), asked at the file's open, at each roster and at the
  close: a seat that joins is counted at the next roster change or at the close, and one that leaves at its own leave
  (the server's close handler calls `Room.leave` -- whose roster change polls the getter -- before the bridge's
  `left` removes the seat). A getter that throws, or answers a value that is not a non-negative integer, counts nothing
  for that poll and never reaches the room.
- **Nothing personal beyond the names** (spec 4.9). The sidecar is built field by field: never the header's `build`
  or `serverName`, never a roster entry's anything but its name and side, never a ticket, a token, an address or a
  path; the account ids are for PT-26's visibility check only, and the listing will not return them (W36.R2). The
  test scans a sidecar made from a roster entry carrying a session token, a ticket and an address, under a header
  whose server name looks like a Windows path: none of them, no directory, no file name and no IPv4 form is in it.
- **When it is written** (review focus 5). At the close: the `.part` gzipped into `.s2r.tmp`, renamed to `.s2r`, the
  `.part` removed -- and only then the sidecar, itself through `<file>.s2r.json.tmp` and a rename, so a reader never
  sees half of one. So no sidecar ever stands beside a `.part`, and every sidecar names a complete `.s2r`. The tests
  hold the disk at the `.s2r`'s rename (a `.part` and a `.tmp`, no sidecar) and at the `.part`'s removal (the `.s2r`
  and the `.part`, still no sidecar), and check the order: rename `.s2r`, remove `.part`, rename `.s2r.json`.
- **When it is not.** A recorder that failed (research 240 §6: its `.part` stays as written) and a close that failed
  (the `.part` kept) write none. A `.part` that cannot be removed after the rename leaves the `.s2r` without one. A
  sidecar that cannot be written (its `.tmp` removed) leaves the `.s2r` in place and logs one line, `replay: the
  sidecar of <room>/<name>.s2r was not written (the file is kept, unlisted)`. ~~A `.s2r` without a sidecar is not listed
  (PT-26) and not swept (PT-25, review focus 2): it waits for the operator.~~ Changed by RE-8 (§7): such a `.s2r` is
  never listed to a participant, the operator's listing names it under `orphans`, and the sweep counts it against the
  budget and ages it by its file's mtime.
- **Reading one.** `readSidecar(file)` returns the sidecar, or null for none, for one that is not JSON, or for one of
  another shape (a field missing or of another kind, an `id` that is not 16 lower-case hex digits).
- **The stop** (research 240 §6): `ReplayFiles.idle()` and `pending()` cover the sidecar's write, so `stop`'s bounded
  wait (`REPLAYS_IDLE_LIMIT_MS`) includes it.

**The environment** (W36.R3). `main.ts` reads, with `REPLAYS_DIR` set, `REPLAYS_BUDGET_MB` and `REPLAYS_KEEP_DAYS`
through `replaysRetentionEnv`: unset or empty, the placeholders 2048 and 30 (§2); one to nine decimal digits not
starting with 0, that number; anything else (`0`, `-1`, `2.5`, `1e3`, a space, `0x10`, `00`) a fatal start -- one
`{"level":"fatal","msg":"REPLAYS_KEEP_DAYS must be a positive whole number of days (got \"forever\")"}` line on stderr
and exit 2, before the directory is made or a port opened, as a bad `MAPS` stops it. They go to `ReplayFiles`
(`budgetMb`, `keepDays`), which hands them to each retention sweep (§3, PT-25); the start's `recording every room`
line names them. With `REPLAYS_DIR` unset they are not read.

**The deploy** (W36.R3; nothing deployed). `deploy/compose.yaml` sets `REPLAYS_DIR: /data/replays` on `mp`, inside
the `mp_data` volume (the image makes `/data` the `node` user's; it outlives the container). `deploy/env.example`
names `REPLAYS_DIR=/data/replays`, `REPLAYS_BUDGET_MB=2048`, `REPLAYS_KEEP_DAYS=30` and `GIT_COMMIT=`, in place of
the commented `/srv/socom-replays`, which the container could neither write nor keep; under the systemd unit
`/var/lib/socom-mp/replays` (its `StateDirectory`, the only place its `ProtectSystem=strict` lets it write).
`deploy/README.md`'s "Connections" says the same. Setting the deploy is the owner's (an owner row at the PR).

**`mp-bots --replays <dir>`** (W36.R6). With `--spawn-server`, the in-process server is built from
`spawnServerOptions(source, players, spectators, dir)`: a `ReplayFiles` on `<dir>` (its lines to the console), so every
room records as the hosted server does; the bots' run ends with the server's `stop`, which finishes the files. Without
`--spawn-server` the flag is refused (exit 2): a running server records with its own `REPLAYS_DIR`.

**The smoke** (a run on the owner's host, 2026-10-08, the host lock FREE; not a capture of the original):
`npx tsx tools/mp-bots.ts --spawn-server --players 2 --spectators 0 --seconds 3 --replays <scratch dir>` on the
test fixtures' MP2 printed 60.0 ticks/s held (180 in 3.0 s), step 0.865 / 4.409 ms mean / worst, 3.44 KiB/s per client,
snapshots 30.0 Hz, and wrote `MP2_classic/<stamp>.s2r` (4247 bytes) and its sidecar (322 bytes):
`{"id":"856aa6375ca59740","room":"MP2/classic","kind":"dedicated","map":"MP2","rules":"classic","gameType":"5",
"startedAt":...,"endedAt":...,"ticks":182,"bytes":4247,"reason":"removed","players":[{"name":"BOT0","team":"terrorist"},
{"name":"BOT1","team":"seal"}],"accounts":[]}`. The cost with and without the recorder is PT-28's (§6).

## 2. Placeholders

The values this task chose; each has no original (the game keeps no replay) and waits for the owner's word or a
later task's measure.

| name | value | what it is | settles it |
|---|---|---|---|
| `REPLAY_ID_PLACEHOLDER` | 16 | the replay id's form: that many hex digits of the SHA-256 of the file's path relative to `REPLAYS_DIR` (`replayId`, `sidecar.ts`); opaque, stable, short in `/replays/<id>`, 64 bits that never collide among one box's files | the owner's row on the replays (an id he would rather see), or PT-26's review of the route |
| `REPLAYS_BUDGET_MB_PLACEHOLDER` | 2048 | `REPLAYS_BUDGET_MB`'s default, the megabytes of closed replays kept (`files.ts`); the spec's number (4.9) | the owner's row on the retention and the box's disk; PT-28's file size per hour |
| `REPLAYS_KEEP_DAYS_PLACEHOLDER` | 30 | `REPLAYS_KEEP_DAYS`' default, the days a closed replay is kept (`files.ts`); the spec's number (4.9) | the owner's row on the retention |

## 3. Retention

PT-25 (web sprint 36; spec 4.9; W36.R3; review focus 2). The code: `packages/match/src/replay/retention.ts` (new,
`sweep`), `packages/match/src/replay/files.ts` (`ReplayFiles` sweeps after each finish). The evidence is unit tests
only: `packages/central/test/replayRetention.test.ts` (the rules against an in-memory fs and a fixed clock; the
serialisation, the wiring and the default fs on a temporary directory) and `replaySidecar.test.ts`'s sidecar-failure
test (its second line is now the sweep's). No server, deploy, browser or `mp-bots` run. A replay instrument with no
original (`REPLAY_ADAPTATION`): nothing here is read from the disc or the decompilation.

**The rule** (`sweep(dir, { budgetMb, keepDays, now, fs, log })`, resolving to `{ kept, deleted, over }`, each path
relative to `REPLAYS_DIR`). It walks `<dir>/<room>/` and judges each closed `.s2r` by its sidecar (§1), never by
opening a replay:

1. **Orphan sidecars.** A `<file>.s2r.json` whose `.s2r` is gone is removed, after its `.s2r`'s absence is re-checked
   (a listing taken while a file is renamed in may miss it; found after all, it is left for the next sweep).
2. **The days.** Every replay whose sidecar's `endedAt` is more than `keepDays` before `now` is deleted
   (`REPLAYS_KEEP_DAYS`; exactly `keepDays` is kept). `endedAt` is read strictly (`isoMs`, PT-25 review): only the
   form the server writes, `toISOString`'s `YYYY-MM-DDTHH:mm:ss.sssZ`, and only a real instant; a looser string
   `Date.parse` would take (a date alone, an offset, no milliseconds, a 30th of February) leaves its `.s2r` unread, in
   `over`.
   **A future `endedAt`** (W36.R8, the controller's, 2026-10-08) can only come from before a setback of the clock, so
   in real time that replay predates every replay recorded since. The budget (step 3) takes it as the **oldest**:
   ahead of every replay dated in the past, and among such replays by path alone, since their dates say nothing of
   their real order. **For the days its real age is unknown**: the sidecar holds no other time, so it is left to the
   clock and ages once `now` passes its `endedAt` (deleted when `now` is more than `keepDays` past it, like any
   replay). Until then only the budget can remove it. (The review's first fix clamped a future `endedAt` to `now`;
   that left such a replay sorting as the newest, and W36.R8 replaced it.)
3. **The budget.** Then, while the closed `.s2r` left exceed `budgetMb` (`REPLAYS_BUDGET_MB`; MB = 2^20 bytes, each
   `.s2r`'s size on disk; a sidecar's own bytes are not counted), the oldest by `endedAt` is deleted -- a
   future-dated one first (above) -- the path breaking a tie. Exactly the budget is within it.
4. **The order of a replay's two files.** The `.s2r` is deleted before its sidecar, so a crash between the two leaves
   an orphan sidecar, which step 1 of the next sweep removes, never a `.s2r` without one (~~which no sweep would touch,
   below~~ which RE-8's sweep counts and ages by its mtime, §7). A delete the disk refuses (by the days or by the budget) keeps its file, reported in `over` ("delete
   refused"), and takes it out of the budget's total, so it never costs another replay -- as nothing else the sweep
   leaves alone is counted (PT-25 review); the sweep goes on to the next oldest still over.
5. **The directories.** A room's directory left empty is removed; `REPLAYS_DIR` itself never is. The removal is
   `rmdirSync`: non-recursive, so a directory holding a `.part` (a recording open in that room) is never removed, and
   synchronous, so no recorder's first flush (`mkdirSync` then `appendFileSync`, both synchronous on the same thread)
   can fall between the emptiness and the removal. A recorder whose room directory was removed before its first flush
   makes it again (`mkdirSync`, recursive). Removing a file changes its room directory's modification time, and
   removing a room changes `REPLAYS_DIR`'s, which is what a listing caching by those times needs (PT-26).

**Never touched** (review focus 2) -- bar the large file, which the days still reach -- each reported in `over` with
its reason and never counted against the budget:

| what | why |
|---|---|
| a `.part` | a recording still open, or one that stopped on a disk failure (research 240 §6): the operator's -- RE-8 (§7): one no recorder of this process writes is swept once its mtime is `REPLAYS_PART_STALE_PLACEHOLDER` (a day) old |
| a `.tmp` (`.s2r.tmp`, `.s2r.json.tmp`) | a gzip or a sidecar mid-rename |
| ~~a `.s2r` without a sidecar~~ | ~~a sidecar that failed to be written (§1, "When it is not"), or one being written now: unlisted, the operator's~~ -- RE-8 (§7): counted and aged by its mtime; only one being written now (its sidecar mid-rename, its `.part` beside it, its recorder live) is left |
| a `.s2r` whose sidecar does not read, or whose `endedAt` is not a date in the form the server writes | not judged without one |
| a single `.s2r` larger than the whole budget | spared by the budget rule only (W36.R7): never deleted to make room; the age rule deletes it past `keepDays` like any replay |
| any other file | not a replay's |

- **Why the exempt files are not counted.** Counted, one file over the budget (or a large unlisted one) would make
  the budget rule delete every other replay and still not reach it. The budget therefore bounds the replays the sweep
  may judge; what it never touches is said in its line each sweep, for the operator. The disk the box holds is then
  the budget plus what is in `over`.
- **The large file and the days** (W36.R7, the controller's, 2026-10-08). "Never deleted unread" (review focus 2)
  means the budget pass never deletes a file larger than the whole budget to make room: within `keepDays` it is kept,
  reported in `over` each sweep, and not counted. The age rule still deletes it once its sidecar's `endedAt` is more
  than `keepDays` old, `.s2r` before its sidecar, as for any replay; otherwise it would sit on the disk for good. (The
  task first kept it under both rules; the ruling replaced that reading.) The tests: one within `keepDays` kept and
  reported, one past it deleted.
- **The log.** One line a sweep, and only when something was deleted or is over:
  `replay: retention: deleted <n> replays (<a> by age, <b> by budget)[ and <c> orphan sidecars]: <paths>; kept <k>
  (<MB> of <budget> MB, <days> days); not touched: <file> (<reason>); ...` -- paths relative to `REPLAYS_DIR`, never
  the directory itself. A `.part` of a room recording now is in it; ~~it is the only way the operator sees a stale one~~
  -- RE-8 (§7): a stale one (no recorder writing it, a day old) is swept and said in the line (`and <p> stale .part`),
  and a kept `.s2r` without a sidecar is said (`without a sidecar (counted, aged by the file's mtime): <paths>`).

**When it runs** (`ReplayFiles`). After each finish that made a `.s2r` -- its sidecar written or not; a finish that
failed adds nothing and asks none -- with `REPLAYS_BUDGET_MB` and `REPLAYS_KEEP_DAYS` as `main.ts` reads them (§1,
"The environment"; unchanged) and `now` the wall clock at the sweep's start:
- **Off the tick.** It runs on the promise chain after the gzip and the sidecar, never inside a room's close: the
  close returns at once and `pending()` never lists a sweep. Its disk operations are `node:fs/promises`' but for the
  one `rmdirSync` of an empty directory.
- **Serialised.** Never two at once. Asks made while one runs, however many, give one more sweep after it (the test:
  a sweep held at its listing; two more files closed and finished meanwhile, sidecars and all; let go, exactly one
  more sweep, never two at once).
- **Waited for by `idle()`.** The server's stop waits for it within its bound (`REPLAYS_IDLE_LIMIT_MS`); a stop cut
  short mid-sweep leaves at worst an orphan sidecar (step 4). If a sweep is what holds the stop to its limit, the stop's
  warning names the files still unfinished, which may then be none.
- **A sweep that fails** (`REPLAYS_DIR` not listable) logs `replay: retention: the sweep failed (nothing more
  deleted): <error>`; the next finish sweeps again. A missing `REPLAYS_DIR` is an empty sweep.
- **`REPLAYS_DIR` unset**: no `ReplayFiles`, so no recording, no finish and no sweep (the test: a server without
  replays makes, steps and drops a room and the sweep is never called; with replays, the same drop sweeps once).

**Its cost** (measured on this host by PT-25's review, a script over the real `sweep` on a temporary directory; not a
test): about 0.35-0.41 ms a replay, so 5,000 replays take about 1.8 s a sweep; the close's second review re-measured
0.66-0.68 ms a replay (3,000 replays, 3 runs) the same day -- the cost is the host's, under its load. A stop can wait for
two sweeps in a row (the serialisation above: one running or begun by the stop's first finish, and one more for the
rest), so ~~at about 7,500-12,000 replays, by those figures, those two can pass `REPLAYS_IDLE_LIMIT_MS` (10 s): the stop then gives up waiting
and logs only its warning, with `files` empty, since no recording is unfinished -- the sweep alone held it.~~ Closed by
RE-8 (§7): a sweep is now one pass of at most `REPLAYS_SWEEP_CAP_PLACEHOLDER` entries and as many deletes. On this host
a pass took 0.42-0.53 s when it deleted nothing, 0.62-0.92 s when it deleted the whole cap (two unlinks a replay), and
1.19-1.67 s when the budget re-stat'ed the cap's known replays and then deleted, so two in a row took 1 s to 3.0 s of the
10 s, whatever the number of replays (§7, "The measure"). The sweep
goes on in the process until it exits; a sweep cut there leaves at worst an orphan sidecar (step 4).

The values are §2's `REPLAYS_BUDGET_MB_PLACEHOLDER` (2048) and `REPLAYS_KEEP_DAYS_PLACEHOLDER` (30), unchanged; this
task names no new placeholder.

## 4. The listing and the fetch (PT-26)

Written 2026-10-08 for PT-26 (W36.R2, W36.R4; review focus 3, 4, 5). The code: `packages/central/src/replay/http.ts`
(new: `mountReplays`, `NODE_REPLAYS_FS`, `REPLAYS_ROUTES`, `REPLAYS_LIST_MAX_PLACEHOLDER`) and one mount line in
`packages/central/src/main.ts`, inside the `REPLAYS_DIR` block: `mountReplays(NODE_REPLAYS_FS, services?.accounts ??
null, { allowedOrigins, metricsToken: env['METRICS_TOKEN'] || undefined, dir: replaysDir, log })`, pushed onto the
server's `http` handlers before the `MatchServer` is made. `server.ts` is unchanged. A replay instrument with no
original (`REPLAY_ADAPTATION`). The evidence is unit tests and one integration test of the real entry point
(`packages/central/test/replayHttp.test.ts`), and the deploy's pins (`deployEnv.test.ts`); no game, browser, build or
deploy was run.

**The routes.**

| request | answer |
|---|---|
| `GET /replays?room=<key>&limit=<n>` | 200 `{ replays: [{ id, room, map, rules, startedAt, seconds, players: [{ name, team }] }] }`: the caller's visible replays, newest first by `startedAt` (then `endedAt`, then `id`); `room` an exact room key (`game/MP2/7`, `MP2/classic`); `limit` one to nine digits not starting with 0, capped at `REPLAYS_LIST_MAX_PLACEHOLDER` and that cap when absent; any other `limit` 400. `seconds` is the sidecar's `ticks / TICK_HZ`, rounded |
| `GET /replays/<id>` | 200 with the closed `.s2r`'s bytes as stored (gzipped), `application/octet-stream` and its `content-length`; 404 otherwise |
| `OPTIONS` either | 204: `access-control-allow-methods: GET`, `access-control-allow-headers: authorization` |
| any other method | 405 |

A listing entry carries exactly those seven fields (RV-4 adds an eighth, `result`, when the sidecar holds one; §8):
never `accounts`, `bytes`, `endedAt`, `reason`, a path or a file name (the test scans the answer for the account ids,
`accounts`, `.s2r` and the directory names). Every answer is `Cache-Control: no-store`; one log line each names the operation and the status, never the bearer, the id or a name.

**Who sees a replay** (W36.R2, review focus 4). `Authorization: Bearer <x>`, matched as `bearerIdentify`'s
(`/^Bearer\s+(\S+)$/i`):
- `x` equal to `METRICS_TOKEN` (SHA-256 of both compared with `timingSafeEqual`, as `/metrics`' `metricsAllowed`) is
  the operator: every replay, a dedicated room's (`accounts []`) among them.
- else `x` goes to `AccountService.sessionOf` (a use of the session, as a lobby request is): a live session's account
  sees the replays whose sidecar's `accounts` holds it -- a game's seats, players and watchers alike (§1).
- anyone else -- no header, another scheme, a garbage, expired or logged-out ticket, `METRICS_TOKEN` unset (no bearer
  is then the operator's), or a server without `DATA_DIR` (no accounts: only the operator) -- gets an empty listing
  and 404 on every fetch, and no file is read for them. A stranger's 404 is the same answer as an id no sidecar names
  (status, header names, body), so it does not tell a replay exists; never 403.
- `/metrics`' loopback rule is **not** taken: behind the tunnel, `cloudflared` reaches the server from the loopback.
- A `sessionOf` that throws is 500 with no body and its class logged.

**The fetch never builds a path from the request** (review focus 3). The raw path's part after `/replays/` must be
exactly `REPLAY_ID_PATTERN` (16 lower-case hex digits, §2), tested before any decoding and before any file is touched:
`..`, `%2e%2e` in either case, `..%2f`, a backslash, `D:`, `C:/...`, a NUL raw or as `%00`, a doubled '/', an
absolute path, `%2F`, an upper-case, short, long or non-hex id, a trailing '/', `.s2r` or space, and a room's path
are each 404 with a counting file system that recorded no call (31 forms). A well-formed id is looked up among the
scan's sidecars; the file served is the `.s2r` the scan found beside its sidecar, by the names `readdir` gave.

**The scan** (review focus 5). A directory's read lists `REPLAYS_DIR`'s directories and in each
takes every regular file `<stem>.s2r.json` whose regular file `<stem>.s2r` stands beside it; it reads that sidecar
(`readSidecar`, read-only) and keeps it only if its shape is sound and its `id` equals `replayId('<dir>/<stem>.s2r')`
-- the path the scan found it at. So:
- a `.part` is never listed or served: `<stem>.s2r.part` is no `.s2r`, a sidecar named for it (`.s2r.part.json`) is
  no `.s2r.json`, and a sidecar beside a `.part` whose `.s2r` is absent names nothing -- tested with forged sidecars
  of both kinds, even for the operator;
- a sidecar copied beside another file (its `id` another path's) names nothing, and never doubles the original;
- a symbolic link, a `.tmp`, a file at the top level and a sidecar of another shape are passed over.

**The index, cached by each directory's mtime** (PT-26's review, F2; `SidecarIndex` in `http.ts`). The first
version had no cache and scanned afresh at every request. The review measured one listing over 2000 sidecars at about
1.08 s of libuv's thread pool on the owner's host -- the pool the recorders' writes use -- so a logged-in account at
the request-rate limit could have stalled recordings. Now:
- A request stats `REPLAYS_DIR` and each room directory it holds: 1 + R stats. It re-reads (`readdir` and that
  directory's sidecars) only a directory whose mtime moved since its last read, and re-lists the top only when the
  top's mtime moved. The sidecars' parsed contents are held in memory, a few hundred bytes each.
- **Invalidation needs no hook.** PT-24 writes a sidecar through a `.tmp` and a rename, and PT-25's sweep unlinks.
  Either changes the directory's mtime, so a new sidecar is listed at the next request and a swept one is gone from
  it; a new or removed room directory moves the top's mtime.
- **The mtime is taken before the read**, so a change during the read leaves a newer mtime and is read again next
  time.
- **A coarse clock:** a directory read less than `REPLAYS_INDEX_RACY_MS` (2000 ms) after its mtime is read again at
  every request until it is older. So a change in the same mtime tick as the read is never missed. The value is not
  chosen: it is the coarsest mtime resolution among the file systems a box may use (FAT's 2 s; ext4, XFS, NTFS and
  APFS are finer).
- **Single-flight:** requests that arrive while a walk runs share it. However many come at once, the listings hold at
  most one of the pool's threads (four by default), and the recorders keep the others. Such a request's answer is at
  most that one walk's duration old.

**The cost before and after** (derived from the pool operations, not measured; the 1.08 s is the review's
measurement). Before, each request made 1 + R `readdir`s plus N `readFile`s. Each `readFile` is about four pool
operations (open, fstat, read, close), so N = 2000 made 8,000-10,000 operations, R from a handful (dedicated rooms)
to N (a directory per game): about 1.08 s, so about 0.1 ms an operation. After, with nothing changed, it makes 1 + R
stats and no read:
- under a millisecond when the replays sit in a few room directories;
- about 0.2 s in the worst layout (2000 game directories of one file each), on one pool thread at a time because of
  the single-flight.

A change costs one directory's `readdir` and its sidecars' reads. The tests hold:
- a second listing with nothing changed makes exactly `stat .` and one `stat` per room, no `readdir` and no
  `readFile`, and the fetch uses the same index;
- a new sidecar in a known directory re-reads only that directory, and one in a new directory is seen;
- a swept file and its sidecar are gone, as is a file swept without its sidecar (a sweep that crashed between them);
- a directory changed within the window while its mtime is held still is read again;
- six concurrent requests make one top `stat` and one read of each sidecar.

**The fetch's stream** (PT-26's review, F1, blocking). The first version piped the file into the response. A client
that aborted mid-download left the stream unpiped but never destroyed, so its descriptor stayed open: the review held
3 descriptors after 3 aborted 4 MB fetches. At the request-rate limit that would exhaust the process's descriptors in
about a minute (the systemd unit sets no `LimitNOFILE`), and the `EMFILE` that follows breaks the WebSockets and the
recordings. Now:
- the stream is joined to the response by `pipeline`, so an aborted client destroys the stream;
- a client that left during the scan gets no stream opened at all;
- an error before the file opens (the file swept between the scan and the read) is a 404, with the stream destroyed;
- a read error after the headers cuts the response short of its `content-length`, with no second answer and one error
  line logged.

The tests:
- three clients that destroy their sockets after the first chunk of a 32 MB file each leave their stream destroyed
  and closed (RED before the fix: "not within 3000 ms");
- a stream that fails after the headers gives the client a 200 that is not `complete`, one `http: 200` log line and
  one error line;
- a file unlinked at the `stat` or at the open is a 404 with CORS, not a 500 (the review's non-blocking 2).

**A stalled download is cut, which bounds the server's stop** (the sprint 36 close, review A). `stop()` ends in
`http.close()`, which waits for every open connection, and `pipeline` has no deadline: a client that stopped reading a
large replay held the stop open for ever -- past the recordings' bounded wait (`REPLAYS_IDLE_LIMIT_MS`), until the
supervisor's kill at 1300 s (`stop_grace_period`, `TimeoutStopSec`), which loses the logins' final flush
(`shutdownOnSignals`, `server.ts`, flushes the accounts' sessions only once `stop()` has resolved). The
review reproduced it with a paused socket on a 32 MB file: `http.close()` had not resolved after 8 s and the file's
descriptor was still open. Now the fetch's response sets `res.setTimeout(REPLAYS_STREAM_IDLE_PLACEHOLDER)` (30 s; the
option `streamIdleMs` for a test): when no byte has moved on the socket for that long, the stream and the response are
destroyed and one `stalled` line is logged (`level: warn`, the operation, never the id or the bearer). Node restarts
that timer at every write the socket completes, and after the response its own keep-alive timeout replaces it, so the
timer is the fetch's only. **A stop is then held by a stalled fetch for at most the timeout** after its last byte
moved. The tests (`replayHttp.test.ts`, "a stalled download never holds the server's stop"):
- a raw client that sends the request and pauses its socket, against a 32 MB file and a 300 ms timeout: the stream is
  destroyed and closed (not sooner than half the timeout), and `http.close()` then resolves with the client still
  connected (RED before the fix: "not within 5000 ms: the stalled fetch's stream destroyed and closed");
- a client that pauses 50 ms after every chunk for three seconds, against a 1000 ms timeout, receives the whole 32 MB,
  `complete`. On this host (Windows) a socket's write completes only as the reader's window reopens, so such a reader
  leaves gaps of about 250 ms between completed writes (measured by a scratch script, not a test): a reader slow enough
  that no write completes within the timeout is a stalled one, by this rule.

**CORS** (W36.R4) is `lobbyHttp`'s rule: an `Origin` in `ALLOWED_ORIGINS`, echoed with `Vary: Origin` on every
answer (200, 400, 404, 405, the preflight), never `*`; any other `Origin`, and a request with none, is 403 with no CORS
header and no file read -- the operator's bearer included, so an operator's `curl` sends an allowed `Origin`. With
`ALLOWED_ORIGINS` empty every request is 403, as the lobby's.

**The drain.** `DRAIN_REFUSED_PATHS` (`server.ts`) refuses, during a drain, the `POST`s that would start something new
(a login, an account, a game, a join); a session's own requests are answered as ever. A replay's listing and fetch are
`GET`s that start nothing and hold no room, so the drain's design does not ask for them: they are not added, and
`server.ts` is untouched.

**The mount and the public surface** (W36.R4). With `REPLAYS_DIR` unset the handler is not mounted and both paths are
the server's own 404 (no CORS header): the integration test starts `main.ts` (on the fixtures' MP2, port 0) twice,
with and without `REPLAYS_DIR`, both with `DATA_DIR`, `ALLOWED_ORIGINS` and `METRICS_TOKEN`; with it, a created and
logged-in participant's ticket gets 200 on both routes, a second account's 404 and an empty listing, the operator's
200 on both; without it, 404 on both for the operator too. After those passed, in the same commit:
`deployEnv.test.ts`'s `PUBLIC` is `/health`, `/replays`, `/replays/<id>`, `/rooms`, `/ws` (the server's paths now
include `REPLAYS_ROUTES` when `main.ts` mounts the handler), the README's first paragraph names both routes and who
they answer, and the documented tunnel ingress is `^/(ws|health|rooms|replays(/[0-9a-f]{16})?)$` -- tested to pass
every public path and to refuse `/metrics`, `/replays/`, an upper-case, short, long or suffixed id, `..`, `%2e%2e`
and the service paths. The live tunnel and the box are the owner's: his deploy widens the rule and sets
`REPLAYS_DIR`; nothing is deployed. Caddy already proxies every path but `/metrics`, so its file needs no change
~~(its comment's list of public paths still names the three)~~ (its comment corrected by RE-8, §7: it names the five,
`/replays` and `/replays/<id>` with `REPLAYS_DIR` set, and the services' routes with `DATA_DIR` set).

### 4.1 Placeholders

| name | value | what it is | settles it |
|---|---|---|---|
| `REPLAYS_STREAM_IDLE_PLACEHOLDER` | 30000 | how long (ms) a `/replays/<id>` response may move no byte on its socket before it is cut (`http.ts`, `res.setTimeout`); bounds a stalled fetch's hold on the server's `stop()` (§4, "A stalled download is cut"). Chosen: long beside a reader still reading (a background tab, a congested link's retransmissions), short beside the supervisor's 1300 s grace. A bound no original has | a measure of the hosted fetches' pauses, or the owner's row on the replays |
| `REPLAYS_LIST_MAX_PLACEHOLDER` | 100 | the most entries one `/replays` listing returns; `limit` is capped at it and is it when absent (`http.ts`). A page of a list no original has | the owner's row on where replays appear in the front end (its list's page), or PT-27's use of the listing |

## 5. Watching by URL from the test room (PT-27)

Written 2026-10-08T22:25Z for PT-27 of web sprint 36 (the plan `docs/plans/2026-10-08-web-sprint-36-every-match-recorded.md`,
W36.R2, W36.R5; the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.8, §4.9). It extends research 244
§2 (the replay mode's address, W35.R2). The code: `packages/viewer/src/replay/load.ts` (`checkReplayUrl`,
`loadSegment`, `REPLAY_NOT_FOUND_OR_NOT_YOURS`) and `packages/viewer/src/replay/mount.ts` (`replayServer`, the
`ReplayMountDeps` fields `server` and `ticket`; wiring only). The tests: `packages/viewer/test/replayLoad.test.ts` (node)
and `replayMode.test.ts` (jsdom).

**A replay instrument with no original** (`REPLAY_ADAPTATION`, research 240 §3; PT.R3): SOCOM II keeps and plays back no
match, so nothing here is read from the disc or the decompilation, nothing here is a parity finding, and nothing changes
a game value or behaviour. The mode is still `?devmode` on a development build only (`replayAsked`, main.ts's
`replayOn`; spec 4.8): a production page is unchanged. The evidence is unit tests only; no browser, dev server, match
server, build or deploy was run. The client was written beside the server's routes (PT-26, §4), against their
contract as the plan states it (`/replays/<id>`, `Authorization: Bearer <ticket>`, CORS by `ALLOWED_ORIGINS`). Both are
merged on `agent/playtest` (PT-26 at 3f2ab15f1, PT-27 at 483fe8622), and the seam was re-checked against the merged code
at the sprint's close (source inspection, and each side's own tests):
- **the id's form**: the client's `HOSTED_REPLAY_PATH` (`load.ts`, `/replays/` and 16 lower-case hex digits, nothing
  after) is the server's `REPLAY_ID_PATTERN` (`sidecar.ts`, `REPLAY_ID_PLACEHOLDER` = 16 lower-case hex digits) under
  `/replays/`, which `http.ts` tests on the raw path;
- **the identical 404**: `http.ts` answers a caller with no ticket, a stranger's ticket and an id no sidecar names with
  the same `reply(404)` -- the status, the CORS headers and no body (`replayHttp.test.ts`, "a well-formed id in no
  sidecar is 404, as a stranger's") -- so the client's one sentence (`REPLAY_NOT_FOUND_OR_NOT_YOURS`) is the answer's
  whole meaning;
- **the preflight**: `OPTIONS` answers 204 with `access-control-allow-headers: authorization` and
  `access-control-allow-methods: GET` for an allowed origin, which the client's `Authorization` header needs.

**The address** (W36.R5). `checkReplayUrl(url, { server })` takes, besides the localhost rule (an http(s) URL on
`localhost` or `127.0.0.1`, unchanged: research 244 §2), exactly one more form: a URL whose origin is the page's
configured match server's and whose path is `/replays/<16 lower-case hex>` (the id's form, §2), with no query (not
even a bare `?`), no hash (not even a bare `#`) and no user or password.
- **The server** is the target the page joins, never re-derived: `mount.ts`'s `replayServer` is main.ts's own `NET`
  composition, `onlineTarget(MULTIPLAYER, SEARCH, () => SHARE.online ?? readOnline(), PAGE_LOCATION)` -- through
  `online.ts`'s `resolveOnline` (the address's `&mp` / `&server=` first, else the Online setting). With multiplayer off
  or Online Off there is none, and a hosted address is refused as before.
- **Its HTTP origin** is that ws(s) URL read by `universeHost.ts`'s `universeServiceBase` rule, the one the page's other
  services on the match server use (`wss:` -> `https:`, `ws:` -> `http:`, the same host and port); a target it cannot
  read is no server, never the page's own origin.
- **Refused** (the tests): the same path on another host or a host that only starts with the server's; another port;
  `http` when the server is `wss` (and the reverse); `/rooms`, `/replays`, `/replays/`, `/segments/<id>`, the listing's
  `/replays?room=`; an upper-case, 15-, 17- or non-hex id; a trailing `/`, `.s2r` or further segment; a user.
- The refusal's sentence names the server's `/replays/` when there is one, and is research 244's otherwise.

**The bearer.** `loadSegment(url, { fetch, server, ticket })` re-reads the same rule itself (it does not trust its
caller), and only for a hosted replay on the configured server:
- sends `Authorization: Bearer <ticket>` when `ticket()` gives a non-empty string, and no header otherwise;
- sets `redirect: 'error'` (the platform rejects a 3xx and never makes the second request, so the bearer never follows
  one) and also refuses an answer whose own address (`response.url`, `redirected`) is not the one asked, without
  reading its bytes;
- sends no cookie (`credentials: 'omit'`, as `connectHost.ts`'s account requests).
Every other address -- localhost's session service (`/segments/<n>.s2r`), another host, another path on the server --
is fetched exactly as before (`{ cache: 'no-store' }`, no header). One reading the brief left open: when the configured
server is itself on this machine (Online = Local, `ws://localhost:8787/ws`), its own `/replays/<id>` is the configured
server's, so it gets the bearer; a localhost address on any other origin or path never does.

**The 404** (W36.R2). A hosted replay's 404 reads `REPLAY_NOT_FOUND_OR_NOT_YOURS`: "This recording was not found on the
match server, or it is not yours to watch." -- one sentence for both, since the server answers a stranger exactly as
an id it does not hold (§4). Localhost's 404 keeps research 244's "(HTTP 404)". A failed fetch of a hosted replay says
"the match server did not answer, answered with a redirect, or this page's address is not among the server's allowed
origins" -- the platform rejects all three alike, a server's 403 to an origin not in `ALLOWED_ORIGINS` carrying no CORS
header (the sprint 36 close, review B).

**Where the login ticket lives, and what that means here.** The login's ticket is kept in the front end's lobby
client's memory only (`LobbyClient.ticket()`, read as `FrontEndSession.lobby?.ticket()`; `connectHost.ts`'s header,
"The session's ticket: the seam"): never in `localStorage`, `sessionStorage`, a cookie or the address, so a reload or
another page ends the hold. The test room's replay mode is a page opened at `/testroom?devmode&replay=...`, a new page:
it holds no ticket. So `mount.ts`'s own deps carry the server but **no ticket**, and the seam (`ReplayMountDeps.ticket`)
is there for a page that does hold one. Until the owner places replays in the front end (the owner's row, below), a
participant's hosted replay -- visible by account only (W36.R2) -- answers 404 to the test room; only a replay an
anonymous caller may see could play there, and under W36.R2 none is. Nothing was made to carry the ticket across pages:
that would put it in storage or the address, which `connectHost.ts`'s header and research 169 §6.2 rule out (OT.R22, `../plans/2026-10-02-online-path-target.md:215`).

**What a run against the hosted server would need** (not done here; the owner's deploy):
- PT-26's routes on the server (`REPLAYS_DIR` set) and the tunnel's ingress widened to `/replays` (W36.R4).
- The development page's origin (for example `http://localhost:5304`) in the server's `ALLOWED_ORIGINS`: a
  cross-origin fetch with `Authorization` is preflighted, and §4's CORS answers 403 to any other origin.

**The address's `server=`.** Under `?devmode` on a development build -- the only place the replay mode exists -- the
address's `server=` names the configured server (`netSettings`), as it names where the account requests go there
(`accountServiceBase`). A crafted development link can therefore name another server; it gets a bearer only from a
page that holds a ticket, which the test room does not. A front-end placement that holds one must pin the server as
the account requests are pinned (HARD-SEAT's `matchSocketUrl` rule), and the owner's row says so.

No value here is chosen: the route, the id's form and the bearer are PT-26's contract, and the sentences are words.
No `*_PLACEHOLDER` or `*_READING` is added.

## 6. The recorder's cost under `mp-bots` (PT-28)

Measured 2026-10-08T23:58Z-2026-10-09T00:08:53Z on the owner's host (W36.R6), in the merge controller's window, with the
lane at 5774452ba. **Evidence kind: a measured run on this host** -- not a capture of the original (the game has no replays)
and not a production box. The command, twice, the same map and load, the second with the recorder on:

`npx tsx tools/mp-bots.ts --spawn-server --disc <the disc> --map MP2 --players 16 --spectators 8 --seconds 300 [--replays <dir>]`

| measure | recorder off | recorder on |
|---|---|---|
| server ticks / s (60 Hz) | 60.0 (18000 in 300.0 s): holds | 60.0 (18001 in 300.0 s): holds |
| step time mean / worst (ms; budget 16.667) | 3.448 / 43.118 | 2.493 / 23.453 |
| bytes out per client per s | 26.41 KiB | 26.41 KiB |
| snapshot rate, players and spectators (Hz) | 30.0 / 30.0 | 30.0 / 30.0 |
| process CPU, server and bots (% of one core) | 54.4 | 35.2 |
| process RSS (MB) | 508 | 513 |

**The file.** One replay, `MP2_classic/<start>.s2r`: **2,069,910 bytes** gzipped for 300.4 s (18,026 ticks) of 16 players
and 8 spectators -- **about 6.9 KB/s, about 24.8 MB an hour** (extrapolated from the 300 s run, linear in time; a match
with fewer bodies is smaller). Its sidecar, 1,030 bytes, named the 24 bots and `accounts: []` (a dedicated room). Under the
2048 MiB budget (2^20 bytes each, as the sweep counts) that is about 87 hours of full 16-player play, or about 346 fifteen-minute full matches.

**The close.** The match ended at 00:08:53.451Z (the sidecar's `endedAt`); the `.s2r` landed at 00:08:53.578Z and its
sidecar at 00:08:53.582Z -- **about 127 ms** for the gzip of 2 MB and the rename, off the tick (the stop's
`REPLAYS_IDLE_LIMIT_MS` is 10 s).

**Reading the numbers.** The recorder's cost is **below this run's noise**: the run with the recorder on had the *lower*
step mean and CPU, which a recorder cannot cause. The host was not quiet -- another lane's gate (its unit phase) shared it
during both runs, 11.8 GB free at the start -- so the two step means differ by the host's load, not by the recorder. What
the runs do show: the tick rate holds at 60 Hz with the recorder on, the bytes to the clients are unchanged (the recorder
writes no wire), the memory is flat (+5 MB), and the close is ~0.1 s. A quiet host, the runs repeated and interleaved, would
bound the recorder's step cost; nothing here asks for it before the owner deploys.

## 7. The server's records: the orphan `.s2r`, the stale `.part`, the bounded sweep (RE-8, sprint 38)

Written 2026-10-10T03:27Z for RE-8 of web sprint 38 (the plan `docs/plans/2026-10-10-web-sprint-38-the-replay-engine.md`,
its RE-8 row and W38.R1). It closes what §1, §3 and §4 left owed: a `.s2r` without a sidecar was never listed or swept
(§1, "When it is not"; §3's table), a stale `.part` showed only in the sweep's line (§3, "The log"), two sweeps in a row
could pass the stop's `REPLAYS_IDLE_LIMIT_MS` at about 7,500-12,000 replays (§3, "Its cost"), and the Caddyfile's
comment named three public paths (§4). The code: `packages/match/src/replay/retention.ts` (`SweepState`, the orphan
and `.part` rules, the bounded pass, `REPLAYS_SWEEP_CAP_PLACEHOLDER`, `REPLAYS_PART_STALE_PLACEHOLDER`),
`packages/match/src/replay/files.ts` (`ReplayFiles.retention`, its live set, the note at each finish),
`packages/central/src/replay/http.ts` (the operator's `orphans`); the comment in `deploy/Caddyfile` and two sentences of
`deploy/README.md`.

**A replay instrument with no original** (`REPLAY_ADAPTATION`, research 240 §3; PT.R3): SOCOM II keeps no match, so
nothing here is read from the disc or the decompilation, nothing here is a parity finding, and nothing changes a game
value or behaviour. **The evidence** is unit tests: `packages/central/test/replayRetention.test.ts` (the rules against
an in-memory fs and a fixed clock; `ReplayFiles` on a temporary directory), `replayHttp.test.ts` (in-process HTTP on
port 0), `replaySidecar.test.ts` (its sidecar-failure test now expects the orphan counted), and
`replaySweepBound.test.ts` (12,000 replays on a temporary directory, timed, with the work asserted). Besides them, one
scratch measure on the owner's host (a script over the real `sweep`, not a test; below). No server process, deploy,
browser or build was run.

### The orphan `.s2r`

A closed `.s2r` with no sidecar beside it -- its sidecar failed to be written (§1, "When it is not") -- is an
**orphan**.

- **The listing.** No sidecar means no room key, no players and no `accounts`, so no participant ever sees it: a
  participant's (and a stranger's) answer is `{ replays }` exactly as before. **The operator's** answer adds
  `orphans: [{ id, file, bytes, modifiedAt }]`: the id its path would carry (`replayId`), its path relative to
  `REPLAYS_DIR` (the form the sweep's line names; the operator's own box), its size and its mtime (ISO 8601). Against
  W36.R1 ("never a path but the id's hash"): that ruling is the sidecar's and the participants' listing's, and both
  still hold it. The operator's `orphans[].file` is the one place a path is shown: only to the operator, only relative
  to `REPLAYS_DIR`, never absolute, because an orphan has no sidecar to name it by (`sidecar.ts`'s
  `REPLAY_ID_PLACEHOLDER` doc says so). Newest
  first by the mtime, then the path. `limit` holds for it as for `replays`; `room=` matches its directory
  (`safeRoomKey` of the key: `game/MP2/7` -> `game_MP2_7/`). `/replays/<id>` is unchanged: an orphan is not served,
  since no sidecar names it. Read by the same mtime-cached index (§4): an orphan costs one `stat` when its directory
  is re-read, none otherwise.
- **The sweep counts it.** It enters the budget's total and both rules like any replay, and is deleted alone (it has
  no sidecar).
- **Its age: the file's mtime** (the brief offered the mtime or the header's start). Argued:
  - The sweep never opens a replay (§3, "The rule"). The header is the first record of the gzipped stream, so its
    start would be an inflate per orphan per pass; the mtime is the `stat` the size already needs.
  - The `.s2r` is written at the close (`ReplayFiles.finish`: the `.tmp` written, then renamed, which keeps its mtime),
    so its mtime is the close's instant within the gzip's time (about 127 ms for 2 MB, §6). That is the instant a
    sidecar's `endedAt` holds. An orphan therefore ages on the same clock as the replays with sidecars, and the budget
    orders it fairly among them.
  - The header's `startedAt` is earlier by the whole match: an hour's match would age an hour early and go before
    replays that ended before it. The file's name carries the same start and is not read either.
  - What it costs: a copy that does not keep the time (`cp` without `-p`), or a `touch`, restarts the orphan's age.
    That is the operator's act. An mtime in the future (a clock set back) is read as W36.R8 reads a future `endedAt`:
    the budget's oldest, and left by the days until the clock passes it.
- **Never one being written.** Each of these is left, reported in `over` as "being finished", and judged at a later
  sweep:
  - one whose sidecar is mid-rename (`.s2r.json.tmp` beside it);
  - one whose `.part` is still beside it (renamed in, the `.part` not yet removed);
  - one the live set names (below: its recorder is still finishing).
  At the delete it is checked again: still not live, and its sidecar still absent. A sidecar landed since the walk
  keeps the file, and the next walk judges it with its sidecar.
- **What stays as it was:** a `.s2r` whose sidecar exists but does not read (or whose `endedAt` is not in the server's
  form) is still never touched and never listed (§3's table). It is not an orphan by this definition (§7.2).

### The stale `.part`

- **How the recorder marks liveness: it does not, on disk.** `FileRecorder` appends at each flush, every 30 snapshots
  (about a second), and only while its room steps. A room steps only while someone is in it (research 240 §6). So a
  recording open in an empty room can stand unflushed for as long as the room stands empty, and its mtime cannot tell
  it from a dead one.
- **So liveness is the process's own.** `ReplayFiles` holds the files it is writing (`writing`, by `<room>/<name>.s2r`).
  Each enters at `open` and leaves when its finish has settled (the sidecar written or not, just before the sweep is
  asked), or at its close when its recorder had failed. The sweep is handed `live(rel)`.
- **The rule.** A `.part` is deleted only when `live` does not name its `.s2r` and its mtime is more than
  `REPLAYS_PART_STALE_PLACEHOLDER` (a day) before `now`; exactly a day is kept. A live one is never judged by its
  mtime, however old.
- **What the mtime bound adds.** A `.part` not live can only be a dead process's, or a failed recorder's after its
  close. The day is the operator's window to keep it: it holds the match up to the failure, readable (research 240 §6),
  and the sweep's line names it at every sweep until it goes.
  - It also covers a second process on the same `REPLAYS_DIR`, while that process's room steps. That is not a
    supported layout: one server owns its `REPLAYS_DIR`.
- **The line.** `replay: retention: deleted <n> replays (...) and <p> stale .part (no recording open, older than 24 h):
  <paths>; ...`. One kept is reported in `over` (`a .part, no recording open: swept once older than 24 h`); a live one
  as `a .part: its recording open now`.
- A `.part` is still never counted against the budget.
- **The tests:**
  - a live `.part` nine days old kept;
  - one exactly a day old kept, one a millisecond past it deleted and logged;
  - through `ReplayFiles` on a real directory, a recording open with its `.part` three days old kept across another
    file's finish, while a planted dead `.part` three days old is deleted and named in the line.

### The bounded sweep

**The cost before.** The scratch measure on the owner's host, 2026-10-10: 12,000 replays of one byte and their sidecars
over 120 room directories, made in 5.2-6.2 s. One whole sweep took 5.9 s before this change and 6.0 s after with the cap
lifted -- about 0.5 ms a replay, within §3's 0.35-0.68 -- so two in a row (12 s) passed the stop's 10 s.

**The pass.** A sweep is now one pass of a walk that `SweepState` carries on from pass to pass. `ReplayFiles` holds
one, so each sweep after a finish is a pass.
- **The walk.** A round lists `REPLAYS_DIR`, then each room in name order, then judges each entry of that room in name
  order. A pass visits at most `REPLAYS_SWEEP_CAP_PLACEHOLDER` (2,000) entries: a listing is one, each file judged is
  one. It stops at the cap or at its round's end, and the next pass starts where it stopped.
  - A room's listing is one `readdir` of all its names, whatever their number: a few milliseconds even for a room of
    thousands.
  - A file removed since its room's listing is passed by.
- **What it knows.** `known` holds every closed replay the walk has judged (its sidecar's `endedAt` or an orphan's
  mtime, and its size). `ReplayFiles` also notes each file it finishes, so the budget counts a new replay at once,
  before the walk reaches its room. A room's listing forgets what it no longer holds; the top's, the rooms gone.
- **The rules** run over everything known, as before -- the days, then the budget, oldest first -- and delete at most
  the cap a pass.
- **A partial knowledge never deletes what the whole sweep would keep** -- while what is known still exists. The age
  rule judges each replay alone. The budget, run oldest-first over a subset, deletes a replay only while the known
  replays as new or newer than it exceed the budget; the whole set's are at least those, so the whole sweep deletes it
  too. The test runs a cap of 10 entries over 20 replays and checks every deletion against the uncapped sweep's, and
  the final set equals it.
- **A replay deleted from outside** (the operator's shell, the recourse §7.2 names) stays known until its room is
  listed again. Counted, it would make the budget take older replays the whole sweep keeps (the RE-8 review's
  finding). So before the budget deletes anything, the replays it would keep are re-stat'ed, newest first, until those
  found exceed the budget, at most `REPLAYS_SWEEP_CAP_PLACEHOLDER` stats a pass. One gone is forgotten and leaves the
  total. One whose stat fails otherwise (`EACCES`) leaves the total too, kept, known and said in `over` (`not sized`),
  as the walk leaves uncounted a `.s2r` it cannot size and as a refused delete never costs another replay (the RE-8
  re-review). **Exactly:** whenever the replays the budget keeps fit in the cap's stats (2,000 replays, where the
  2,048 MiB budget holds about 1,000 of §6's 2 MB five-minute full matches), every replay it deletes is one the whole
  sweep would delete. The kept ones are then confirmed on the disk, the replay where the confirmed sizes pass the budget
  and every older one go in both, and those not yet walked only add to the whole sweep's deletes (the bullet above).
  Beyond the cap's stats, an outside deletion or an unreadable file is still counted until its room's next listing, a
  round at most: then, and only then, the budget can take an older replay the whole sweep would keep. Below the budget
  no stat is made, nor once the age rule has used the pass's deletes (the budget could delete nothing more).
  - The tests:
    - an outside deletion (RED before the fix: it deleted `B/old.s2r`): three replays at exactly the budget walked;
      the newest deleted by hand and a new one noted; a pass that does not reach their room again deletes nothing;
    - an `EACCES` (the re-review's case, RED before its fix: it deleted `B/a.s2r`): a and b at the 8 MB budget walked,
      c noted and then unreadable; the whole sweep deletes nothing, and so does a pass that does not list the room
      again, which reports c and keeps it known;
    - the age rule taking the pass's one delete leaves `restated` at 0.
- **What it costs.**
  - A fresh start knows only what it has walked or finished since. Until a round completes (13 passes, so 13 finishes,
    at 12,000 replays and 120 rooms), the disk may stand above the budget by what is not yet walked.
  - After a long stop the age rule's backlog goes at most the cap a pass.
  - Both are bounded delays. The one bounded wrong deletion is an outside deletion's past the cap's stats (above).

**The measure** (the scratch script, the same directory): eight passes of 2,000 entries that deleted nothing took
**0.42-0.53 s** each. Passes that also deleted the whole cap -- an age backlog, 2,000 replays, 4,000 unlinks -- took
**0.62-0.92 s** each (two runs of two, 2026-10-10). Passes on the budget's path -- a 2,100-byte budget over 1-byte
replays, so the re-stat runs to the cap (2,000 stats) and the budget then deletes 995-1,880 replays -- took
**1.19-1.67 s** each (two runs of two, the host busier: the 12,000 replays took 8.6 s to make against 4.3-6.2 s before).
Two in a row take 1 s to 3.0 s, under a third of `REPLAYS_IDLE_LIMIT_MS`. The re-review measured 1.63 s for its pair.
The worst a pass can do is the cap's entries, the cap's re-stats and the cap's deletes: the re-stat is skipped once the
age rule has used the deletes. **The tests** (`replaySweepBound.test.ts`, the same directory made by the test):
- three pairs of passes on one state that delete nothing: each pass's `visited` exactly the cap, the replays it knows
  after six passes exactly what those entries hold (each judged once), and the worst pair under
  `REPLAYS_IDLE_LIMIT_MS`;
- the RE-8 review's: three passes walked while the replays are young, then a pair with the clock 40 days on. The first
  deletes exactly the cap (2,000 `.s2r` and 2,000 sidecars) while visiting the cap, the second some and at most the
  cap, and the one and the pair are each under `REPLAYS_IDLE_LIMIT_MS`;
- the RE-8 re-review's: three passes walked under the large budget, then a pair under a 2,100-byte budget. Each
  re-stats exactly the cap (`state.restated`) and visits the cap; the first deletes more than 1,000 and at most the
  cap; the one and the pair are each under `REPLAYS_IDLE_LIMIT_MS`.

The work is asserted, as PTT-6 asserts the records its fold visits (research 244 §7): a loaded host can slow the
timing, which has a margin of three or more, but cannot hide a second walk. In memory
(`replayRetention.test.ts`): 12,000 replays walk in exactly `ceil(24,121 / 2,000)` = 13 passes, every entry once, each
pass at most the cap; 12,000 replays all past `keepDays` go at most 2,000 a pass, the room directories with them.

### The Caddy comment

`deploy/Caddyfile`'s comment named `/health`, `/rooms` and `/ws` as the public paths. It now names the five
(`deployEnv.test.ts`'s `PUBLIC`): `/health`, `/rooms` and `/ws`, and with `REPLAYS_DIR` set `GET /replays` and
`/replays/<id>` (who sees what, §4). It also says that every path but `/metrics` is proxied, so with `DATA_DIR` set the
services' routes (`/account/*`, `/lobby/*`, `/texts/*`, `/clan/invitations`) pass too, and anything else is the server's
404. The matcher and the proxy are unchanged. `deploy/README.md`'s retention sentence (it said the sweep never touches
a replay without a sidecar) and its `/replays` paragraph (the operator's `orphans`) say the same as this section.

### For `agent/modern-ui` (W38.R1)

The segment HTTP changes additively only:
- `GET /replays` with the operator's bearer (`METRICS_TOKEN`) gains one key, `orphans`, an array of `{ id, file,
  bytes, modifiedAt }`, always present for the operator (empty when there are none).
- A participant's or anyone else's answer is unchanged: `{ replays: [...] }`, the same seven fields an entry.
- `GET /replays/<id>`, `/segments` and `/segments/<n>.s2r` are unchanged.

W38.R1 asks for such a change to be named in research 249: it is, in 249 §6 (the RE-8 review's round; §3-§5 are the
plan's for RE-2, RE-3 and RE-4).

### 7.1 Placeholders

| name | value | what it is | settles it |
|---|---|---|---|
| `REPLAYS_SWEEP_CAP_PLACEHOLDER` | 2000 | the most a retention sweep's pass does: entries visited (a directory's listing and each file judged, one each) and, apart, replays deleted and known replays re-stat'ed (`retention.ts`). Chosen so two passes stay under a third of the stop's `REPLAYS_IDLE_LIMIT_MS` on this host (0.42-0.53 s a pass deleting nothing, 0.62-0.92 s one deleting the cap, 1.19-1.67 s one re-stat'ing the cap and deleting), while a round over 12,000 replays still takes only 13 finishes. A bound no original has | a measure of the hosted box's disk, or the owner's row on the retention |
| `REPLAYS_PART_STALE_PLACEHOLDER` | 86400000 | how old (ms, by its mtime) a `.part` no recorder of this process writes must be before the sweep deletes it: a day (`retention.ts`). The operator's window to keep a dead process's `.part`, named at each sweep until it goes. A bound no original has | the owner's row on the retention |

### 7.2 Owed

- A `.s2r` whose sidecar exists but does not read (or whose `endedAt` is not in the server's form) is still never
  swept or listed (§3's table). Not RE-8's brief: one rule could count it as an orphan by its mtime too.
- The operator cannot fetch an orphan through `/replays/<id>` (no sidecar names it). Reaching it is the box's shell.
- The listing may name a file in the instant between its `.part`'s removal and its sidecar's `.tmp` as an orphan; its
  directory's next change re-reads it.
- After a restart, the budget counts only what the walk has reached or the process has finished, until a round
  completes (above).
- A replay deleted from outside, past the cap's re-stats, is counted until its room's next listing (above).
- The RE-8 review's finding 5, cosmetic: a sweep that walks a room while another file there finishes can take that
  room's listing between the `.part`'s removal and the sidecar's `.tmp`, and judge the file after it has left the live
  set. It is then noted as an orphan and named in that sweep's line as `without a sidecar` though its sidecar has just
  landed. Its delete would re-check the sidecar and keep it, and the next walk judges it with its sidecar, so only the
  line is wrong, once.

## 8. The listing's cursor and the sidecar's result (RV-4, sprint 39)

Written 2026-10-11T04:34Z for RV-4 of web sprint 39 (the plan
`docs/plans/2026-10-11-web-sprint-39-the-replay-viewer-to-release.md`, its RV-4 row and W39.R2, W39.R4). It adds two
things to §1 and §4, both additive under W39.R2: a cursor that pages `GET /replays` past `REPLAYS_LIST_MAX_PLACEHOLDER`,
and a `result` in the sidecar and the listing's entry. The page that uses both is research 276 §3. The code:
`packages/central/src/replay/http.ts` (`replaysCursor`, `readReplaysCursor`, the listing's filter), `sidecar.ts`
(`ReplayResult`, `resultOf`, `readSidecar`) and `files.ts` (`SegmentRecorder.event`, the sidecar's fields).
`recorder.ts` and `room.ts` are unchanged.

**A replay instrument with no original** (`REPLAY_ADAPTATION`, research 240 §3; PT.R3). SOCOM II keeps no match and
lists none, so nothing here is a parity finding. The result's fields are the room's own broadcast, copied, not a value
of the game read anew. **The evidence** is unit tests: `packages/central/test/replayHttp.test.ts` ("RV-4: the listing
pages by a cursor ...", in-process HTTP on port 0 over temporary directories) and `replaySidecar.test.ts` ("RV-4: the
sidecar's result ..."). No server process, browser, build or deploy was run.

### The cursor

- **The route.** `GET /replays?before=<cursor>` (with `room=` and `limit=` as before) answers the page after the
  cursor. An answer with more of the caller's replays after its last entry carries `next`, the cursor for that page;
  the last page has no `next` key. With no `before`, the answer is §4's, plus `next` when the caller has more than
  `limit`.
- **The page's order** (`data.ts` `replaysOf`, RV-4's review) sorts by `startedAt` alone, stably, so replays started in
  the same millisecond keep the order the server sent: the entry carries no `endedAt`, the server's tie key. Pages
  joined end to end are then the server's order across their edges.
- **What a cursor is.** The last entry's place in the listing's order, `<startedAt>|<endedAt>|<id>` as base64url
  (`replaysCursor`, `http.ts:314`). The page treats it as an opaque token and passes it back unread. It is not a count
  and not an offset. Decoded, it shows that entry's `endedAt`, which the entry itself leaves out (§4). That is the end
  time of a replay the caller may already fetch whole, not personal data.
- **The order is the listing's own** (`newestFirst`, `http.ts`): newest `startedAt` first, then `endedAt`, then the
  id. The brief stated it as "by `startedAt`, ties by id"; the listing's order since PT-26 also breaks a tie on
  `startedAt` by `endedAt` first. It was kept, so the first page is unchanged by this task, and the cursor carries all
  three keys.
- **A page** is the caller's visible replays (§4's rule: the operator all, an account its own by `accounts`), then
  `room`, then those strictly after the cursor's place (`after`, `http.ts:340`), ordered, and only then `limit`
  (`http.ts:433-439`). So:
  - **who asks is filtered before the limit.** A participant's page holds only their own replays and is full when
    they have more. With 120 of their own among 400, they see 100, then 20 and no `next`.
  - **nothing about another account leaks through the cursor.** The answer carries no count, no gap and no other
    account's id. A cursor names only a place in the order: the caller's own last entry, or, forged or another
    account's, a place in the order that tells nothing of whose replays lie around it. The test compares whole answer
    bodies, `next` included, between a directory of 400 and one holding only the participant's 120, and gets them
    equal. It does the same for another account's cursor.
  - **added and swept replays move no later page.** A replay added between pages is newer than the cursor (or, if it
    started earlier, takes its place in the order once). A replay swept is simply absent, even when it is the one the
    cursor names, since the place is compared, not looked up. The test adds the newest replay and sweeps one the first
    page showed, one the second would have shown, and the one the cursor names; the later pages are then exactly
    today's listing after the cursor, once each.
- **A malformed cursor** is the route's existing bad request: the 400 a bad `limit` gets, with no body, the same CORS
  headers, before the bearer is read, so the same answer for anyone (`http.ts:410`). Never a 500. The form is
  canonical base64url of two times in the server's form (`retention.ts`'s `isoMs`: `toISOString()`'s 24 characters)
  and an id (`REPLAY_ID_PATTERN`), with '|' between them. A `before` longer than that form's own length (`CURSOR_MAX`,
  computed from the form, not a chosen bound) is refused before it is decoded. The test runs 15 forms, each for the
  operator, a participant and a garbage bearer.
- **The operator** pages the same way. Their answer keeps `orphans` (§7) on every page, as the newest `limit` of them;
  the orphans are not paged.

### The result

- **What the sidecar gains.** An optional `result: { round, winner, wins: { seal, terrorist }, matchOver }`, taken from
  the last `roundOver` the file recorded (`SegmentRecorder.event`, `files.ts:143`).
  - That event is the room's own broadcast at a round's end: `Room.endRound` builds
    `{ round, winner, wins, matchOver, screens, stats }` (`room.ts:4679`) and broadcasts it (`room.ts:4681`), and
    `broadcast` hands every broadcast event to the recorder (`room.ts:5160`).
  - So the existing hook carries it, and `room.ts` is not touched.
  - Only those four fields are kept, each checked (`resultOf`, `sidecar.ts:115`): `round` and each of `wins` a whole
    count, `winner` a side or null, `matchOver` a boolean. The event's `screens` and its per-player `stats` (which hold
    per-player numbers) are never taken. The test scans the sidecar's text for them.
  - Nothing personal enters the sidecar: a side, three counts and a flag (W36.R1, §1).
- **What it means** (the room's words, not recomputed):
  - `winner` is the last round's winner (null: a draw);
  - `wins` are the rounds each side has won (`mp_score00` / `mp_score08`, research 91 §18, 2.2);
  - `matchOver` says whether the room ended the match at that round. A file closed at a `roundOver` with `matchOver`
    has `reason` `match-over` (§1). A `result` whose `matchOver` is false belongs to a match cut short: its file ended
    for another reason (`removed`, `abandoned`, `error`).
- **None.** A file that recorded no `roundOver` gets no `result` key; neither does one whose `roundOver` is not of that
  shape (the recorder passes it over). A recorder that failed writes no sidecar at all (§1).
- **An older sidecar reads with none.** `readSidecar` keeps its thirteen-field check, and `result` is optional:
  - absent, the sidecar reads as before;
  - of another shape (or null), the sidecar still reads, with no result, because an unreadable sidecar would leave
    its replay unlisted and never swept (§3, §7.2), which an optional field must not cost;
  - present and sound, it is copied field by field, and an extra key in it is not carried.
- **The listing's entry** carries `result` when its sidecar holds one (`entryOf`, `http.ts:300`), the same four fields.
  An entry of an older sidecar has §4's seven fields exactly.

### For readers of `GET /replays` (W39.R2)

- The answer gains `next` (a string, absent on the last page). An entry gains `result` (absent when its sidecar holds
  none). A request may add `before`. Nothing is removed or renamed, and the first page's entries and order are as
  before.
- A `before` that is not a cursor's form is 400 for anyone; without `before`, every answer is as before.
- The sidecar gains `result` (optional). Retention reads only `endedAt` and sizes (§3), so it is unaffected.
- `/replays/<id>`, `/segments` and `/segments/<n>.s2r` are unchanged.

### 8.1 Placeholders, and what is owed

- No new placeholder: the page's size is `REPLAYS_LIST_MAX_PLACEHOLDER` (§4.1), and the cursor's bound is the form's
  own length, not a chosen one. No ledger row is added (research 101 §5).
- A sidecar whose `startedAt` or `endedAt` is not in the server's form (none the server writes: the header's start
  and the close's time are both `toISOString()`) still lists. Its place cannot be a cursor, so a page whose last entry
  it is carries no `next`: the route sends `next` only when it reads back (`readReplaysCursor`, `http.ts:439`; RV-4's
  review), never one it would then refuse. Paging ends at that page, and the replays after it are not reached by the
  cursor (the operator can narrow by `room=`, or move the file). Only a hand-written sidecar can do that. The test plants
  a sidecar whose start has no milliseconds: as a page's last entry it brings no `next`, and a page ending one entry
  earlier pages on past it.
- The orphans are not paged (above). There are few of them (one per failed sidecar write), and every page carries the
  newest `limit`.
