# The match stats API, finished, and match tracking -- design

> Written 2026-11-07T22:30Z (`date -u`) on `agent/misc-designs` from `main` at `964e9e47a`, by the controller's seat
> redotcom-a0 (Claude Fable 5.1). Evidence kind: source inspection and read-only git at `964e9e47a`, the read-only recon
> of 2026-11-07, and the sprint-43 plan (`../plans/2026-11-04-web-sprint-43-the-stats-api-and-the-discord-live-channels.md`).
> Nothing built or run. The sprint-43 plan stays the plan for its own rows; this document is the spec for the rows it
> left open and for the match tracking it named as a growth path, and the plan written from it amends sprint 43 or
> succeeds it (the controller's call at the plan).

**The owner's words.** 2026-11-04 (sprint 43's spec): "Kills, Kills (Respawn), Bombs Planted, Plants, Defuses,
Rescues, Time Played, Hit %, KD, HS%." 2026-11-07, in the seat: "The API work we previously scoped to track extra
information from matches." Asked (a) whether a player's match history is public by name and (b) whether bot games get
match rows: **"yes public by name. make all replays public with this. agreed."** (agreed = bot games tracked as
unranked rows, the proposed default).

**Track:** product (OT.R53). The original has no match history, no per-weapon numbers, no assists and no web page
(research 155 §3). Every route, table and field below is a labelled adaptation; the career record -- the original's
256-byte stats blob and its fold `applyMatch` (`match/src/stats/accountStats.ts:335-364`, `FUN_00225070`) -- is not
changed, and a test pins it byte-identical through everything here.

## 1. Intent

Anyone with `curl` reads a player's career numbers, today's top ten, the ladder's first page, who is online -- and,
new, what happened in a match: who played, on which map and mode, each round's result, each kill with its weapon and
hit part, the bombs and hostages with their times, and the replay to watch it. A player's page lists their recent
matches and their weapon breakdown. The Discord LIVE category gets its fourth channel. Every replay is public.

## 2. Rulings the owner gave tonight (to be numbered in MISSION at the plan, claimed in `agent-mail/LATER-CLAIMS.md`)

1. **A player's match history is public by name.** The names are already public on `/api/live` and the ladder's top
   ten (W43.R1); this extends W43.R1 to every `/api/stats/` route named here. H86 call 9's "no web page" ruling is
   superseded for these routes as W43.R1 already superseded it for its own.
2. **Every replay is public.** W36.R2 / H157's interim rule ("participants by account, and the operator") is replaced:
   `GET /replays` and `GET /replays/<id>` answer anyone, with no bearer, for every replay including a dedicated room's;
   the operator's `orphans` listing stays the operator's. H157 is answered and closed.
3. **Bot games are tracked** as match rows marked unranked, never in the career record. Today a bot match never
   leaves the host: `match/src/game.ts:973-979` (`onRoundOver`: `if (this.bots?.unranked) return;`, BTL.R10) sends no
   result for a match that ever had a CPU, and `room.ts:9598-9604` (`handOverOf`) returns no hand-over when any seated
   id names no account (research 155 §4.1); central's dead-letter at `hostResults.ts:646` is the second line. This
   design does not amend either rule: the match rows come by their own message (§4 B1), never through the results path.

## 3. What exists (read at `964e9e47a`)

- **The ledger**: SQLite `results_lines(id, file IN (journal, audit, dead, flags, hosts), line)` (SCHEMA V7,
  `serviceStore.ts:1501-1506`); V8 is `client_errors` (`:1514-1519`) -- **sprint 43's SL-02 said V8 for the respawn
  tally; V8 is taken, and SL-02 is dropped by this design (Phase A), so V9 is the match tables'.** No per-match table. A counted match writes one `results.audit` entry per account
  (`stats/results.ts:906-916`): `mark{seq, match{room, serial, startedAt}}`, `at`, `host`, `game{playersAtStart,
  password}`, `input.seat` (side, joinedInProgress, playedMs, roundsWon/Lost/Drawn, the full `MatchBlock`: headShots,
  hits, shots, kills, deaths, suicides, teamKills, escortees, objectives, bombs, score), `counters{before, added}`.
  A counted round writes one entry per account (`:884-888`) with `game.roundKills`, `roundMs`, `sidesAtStart`.
  Excluded results (respawn, under five, password) keep one `ExcludedLine` (`:443-456`) with the account ids and a
  round's kills; the match blocks are dropped. Signals (`stats/signals.ts:178-262`: shots, hits, hitsByPart, refusals,
  rtt, commandRate, build) are stored for counted rounds only; `trade` is dropped (NCW-19, LATER 750).
- **The wire, match → central**: `HostReport { game, match, key, result: HandOver, info: ResultGame, starts }`
  (`hostResults.ts:222-224`); `HandOver = RoomRoundResult | RoomMatchResult` (`match/src/stats/roomResults.ts:71-140`);
  `ResultGame` (`results.ts:219-231`) carries `gameType` (a number), `respawn`, `password`, `playersAtStart` -- **no map,
  no mode name, no settings.** Built in `match/src/game.ts:1056-1077` from `room.ts:9496-9522` (`roundReport`) and
  `:9558-9620` (`matchSeat`, `handOverOf`).
- **Captured by the room, never reported**: every kill with killer, victim, weapon, how (teamkill, orphan), clip,
  cause, hit part and tick (`room.ts:8777-8823`, broadcast as `{ type: 'kill' }`, so it is in the `.s2r` replays);
  per-round `roundDeaths`, `roundScore`, `roundRescued` per player (`:1714, :1726`, in `roundOver` ~`:9972`, only
  `roundKills` reaches central); bomb planted / defused / detonated with the actor (`:2616-2622`); hostage rescued /
  killed (`:2657-2668`); `RoomOptions` `roundSeconds`, `maxRounds`, `eqLimit`, `allowFriendlyFire`, `maxPlayers`,
  `teamSize` (`:197-281`); joins and leaves (host log lines only).
- **HTTP**: public, rate-limited (30 per 10 s per address), CORS `*`, GET/HEAD/OPTIONS, 10 s caches
  (`lobbyLinkHttp.ts:36-46, 64-68, 184-203, 219-306`), mounted `main.ts:324`: `/api/lobby/<id>`, `/online/lobby/<id>`,
  `/api/live`, `/api/ladder`, `/api/ladder/top.png`. Logged-in: `/lobby/*`, `/modern/account`, `/replays`
  (`replay/http.ts:129`; W36.R2 at its header). The Front Worker's `deploy/pages/routes.json` is the route table
  (`generate.js` → `worker.js`) and already passes `/replays` (exact) and `/replays/` (prefix); `deploy/central/nginx.conf:57`
  and the nightly's hold the family regex with `replays` in it; the tests `pagesRoutes`, `centralFront`,
  `centralDeploy` pin them.
- **Where the replays are.** Under the split, central records nothing: its `REPLAYS_DIR` is null in production and
  "the hosted replays alone are listed" (`replay/http.ts:105-110, 139`). Each hosted replay is a file on its **host**,
  announced to central by the control-link message `replay { row: HostedReplayRow }` (`controlLink.ts:726`; the row's
  `room` is `game/<map>/<gameId>`, its `startedAt` the file's open at `matchReset`, `room.ts:9387`, no match serial),
  kept by `HostedReplays` in memory (`central/src/replays.ts:20-24`) and lost on a restart until the host's inventory
  re-sends (H247). A page fetches one from the host's door, `https://<host>.play.socom2legacy.com/replays/<id>`, with
  a 60 s grant minted by `POST /replays/grant` for a logged-in account from the page origin
  (`central/src/replays.ts:247-300`, `tickets.ts:469-484` the `acct` claim); the host verifies the grant offline and
  requires an Origin (`host/src/replays.ts:26-31`). The control link's limits: version 7 exact-match both ways
  (`controlLink.ts:1022`, `host/src/link.ts:600`), an unknown type closes the link (`link.ts:713`),
  `CONTROL_MAX_MESSAGE_BYTES` 262,144 (`controlLink.ts:131`); the repository's precedent for a new capability is an
  additive hello field at the unchanged version. `readHandOver` / `readResultGame` (`hostResults.ts:980-1116`) copy
  known members and ignore unknown top-level ones; `readBlock` (`:932`) refuses any extra key inside a seat's block.
  A refused report's raw is dropped past `HOST_DEAD_LETTERS_PER_HOUR_ADAPTATION` = 100 per host per hour
  (`hostResults.ts:232, 736`). A `RoomMatchResult` exists only at a match's end, not when a side empties
  (`room.ts:9611`): an abandoned match yields round results only.
- **Sprint 43's open rows** (its task table `:483-494`): SL-00 (the lane `agent/stats-live`, never cut), SL-01 the public
  player view, SL-02 the respawn tally (dropped here: derived from the match rows, Phase A), SL-03 the day fold, SL-05 `statsApiHttp.ts` with `/api/stats/player/<name>`,
  `/api/stats/today`, `/api/stats/card/<hash>.png` and the routes/nginx rows, SL-07's fourth channel (today's top ten),
  SL-08 the old Worker's repo cleanup, SL-09 the record. Decision 9 and the growth path (`:66-67, :268-272`) name
  `/api/stats/match/<room>-<serial>-<startedAt>` and `/api/stats/player/<name>/matches` and say "Nothing in this sprint
  builds them." Owner rows H400-H403 (H402's KV namespace and `#server-status` channel are the owner's hands).

## 4. The design

### Phase A -- finish sprint 43 as written, with these corrections
- **SL-02 (the respawn tally) is dropped**: `respawnKills` is derived from the match rows of Phase B (the kills of a
  player's rows with `reason 'respawn'`, five or more humans at the start and no CPU -- SL-02's own rule), one
  source instead of two that would disagree; W43.R3's decision ("a separate tally beside the record, never in it")
  holds, the mechanism changes. SL-01's `publicPlayer` takes the derived tally. Every `main`-at-`236cef76b` line
  citation in the plan is re-read at the plan's base before dispatch (`handOverOf`, `tagOriginFor`, `main.ts` mounts
  moved).
- The plan's example shapes `/api/live/lobbies` and `/api/live/card/` (`:253-261`) are corrected to the shipped exact
  routes and the private-lobby card's `/api/stats/card/`.
- SL-05's routes are exact paths under `/api/stats/` so `routes.json`, both nginx regexes and their three tests change
  once for the whole prefix (W43.R12).
- SL-07's fourth channel (today's top ten) and SL-08, SL-09 as written.

### Phase B -- match tracking (new rows, `SL-10` on)

**B1. A match record of its own, beside the results path, never through it.**
- A new host → central control-link message `matchRecord`, sent by the match process for **every** match -- counted,
  respawn, under five, password, with CPUs -- in chunks, each well under the link's 256 KiB:
  `{ t: 'matchRecord', game, match: { room, serial, startedAt }, part: 'open' | 'round' | 'close', ... }`.
  `open` carries the identity: `map` (the code, `MP2`; the display name is `@s2u/archive`'s table, OT.R113, never
  stored twice), `mode` (the game type's name beside its number), `settings { roundSeconds, maxRounds, friendlyFire,
  maxPlayers, teamSize, eqLimit }`, `lobbyName`, `host`, the seats at the start. `round` carries one round: its
  number, winner, reason, `ms`, the per-seat `kills, deaths, score, rescued`, and its events, at most
  `MATCH_EVENTS_PER_ROUND_MAX_ADAPTATION` (500; the oldest dropped and `eventsDropped: n` said):
  `kill { tick, killer, victim, weapon, part, how }` (the room's own `kill()` fields) and `objective { tick, kind:
  planted | defused | detonated | rescued | hostageKilled | extracted, actor }`. `close` carries `ended: 'complete' |
  'abandoned'`, the per-seat totals (the `MatchBlock`'s fields for every seat, bots included) and `playedMs`; it is
  sent at the match's end **and** when the room resets without one (`matchReset`, the abandoned case), so an
  unfinished match has its rows. Seats are the account id where there is one and `cpu:<n>` for a bot.
- **Sent only when central's hello advertises `matchRecords: true`** -- an additive hello field at the unchanged link
  version 7, the repository's precedent; a host older than this design sends nothing new, a central older than it is
  sent nothing new, and no link closes in either order. The results path (`HostReport`, `HandOver`, `ResultGame`,
  `readBlock`) is **not changed**: BTL.R10 and `handOverOf`'s no-account rule stand, and the career record's
  byte-identity pin is trivial.

**B2. Central keeps match rows (SCHEMA V9, Phase A's number now that the tally is derived), for every record.**
- `matches (id TEXT PRIMARY KEY, room, serial, started_at, ended_at, ended TEXT, host, map, mode, settings_json,
  players_at_start, counted INTEGER, reason TEXT NULL, replay_id TEXT NULL)` -- `id` is the growth path's
  `<room>-<serial>-<startedAt>`; `counted` 1 once the results worker folds that match's hand-over into the record
  (joined by `room + serial + startedAt`), else 0 with `reason` in `respawn | underFive | password | cpu | abandoned |
  void | pending`.
- `match_rounds (match_id, round, winner, reason, ms, PRIMARY KEY (match_id, round))`.
- `match_players (match_id, seat TEXT, account INTEGER NULL, name, side, joined_in_progress, played_ms, kills, deaths,
  suicides, team_kills, head_shots, hits, shots, score, bombs_planted, bombs_defused, rescues, rounds_won,
  rounds_lost, PRIMARY KEY (match_id, seat))` -- `account` null for a bot.
- `match_events (match_id, round, seq, tick, kind, actor, target, weapon, part, how, PRIMARY KEY (match_id, round, seq))`.
- `replays (host TEXT, id TEXT, room, started_at, ended_at, map, rules_json, ticks, players_json, result_json, PRIMARY KEY (host, id))`
  (**amended 2026-11-08 by the MS-4 review:** a replay id is a hash of the room key and the start, unique only within one
  host -- `central/src/replays.ts:15-16` -- so two hosts' standing rooms give equal ids; keyed by `id` alone, host B's
  row overwrote host A's and A's sweep deleted B's)
  -- the `replay` control message's row persisted, so the join survives a restart (H247's gap, partly closed) and the
  public listing reads a table, not memory. `matches.replay_id` is set when a row's `room` and `started_at` match
  within `REPLAY_JOIN_TOLERANCE_MS_ADAPTATION` (5000; the two clocks are the room's own).
- Indexes on `match_players(account, match_id)`, `matches(started_at)`, `matches(map)`, `replays(room, started_at)`.
- Written by a `matchRecords` intake beside `hostResults.ts`, one transaction per chunk; a void (`cli/voidMatch.ts`)
  sets `reason 'void'` and leaves the rows. **Retention**: counted matches' rows are kept as the ledger is;
  uncounted matches' `match_events` are pruned after `MATCH_EVENTS_UNCOUNTED_RETENTION_DAYS_ADAPTATION` (30) by the
  existing retention sweep, the `matches` and `match_players` rows kept (the 24/7 bot lobby writes on the order of
  100k event rows a day otherwise).
- `results*.test.ts` gains the pin: `accounts.stats`' 256 bytes after a counted match, a CPU match, an abandoned
  match and a void equal the bytes before this change.

**B3. The routes (public, CORS `*`, the live routes' limiter and 10 s cache).**

| route | answers |
|---|---|
| `GET /api/stats/match/<id>` | `{ match: { id, map, mapName, mode, settings, startedAt, endedAt, ended, host, counted, reason, replay: "/replays/<replayId>" \| null }, players: [...match_players], rounds: [...], events: [...] }`; 404 for an unknown id; the replay link is central's public route of B4 |
| `GET /api/stats/matches?limit&before` | the newest matches first, `{ matches: [{ id, map, mapName, mode, startedAt, players: n, counted }], next? }`; limit 1..50 |
| `GET /api/stats/player/<name>/matches?limit&before` | that player's rows newest first, each with their own `match_players` row and the match's header; `next?` |
| `GET /api/stats/player/<name>/weapons` | `{ weapons: [{ weapon, kills, headShots, teamKills }] }` from `match_events` over counted and uncounted matches alike, `counted` said per row group |
| the sprint's `GET /api/stats/player/<name>`, `/today`, `/card/<hash>.png` | as SL-05 |

Names resolve by `accountByName` as SL-05's player route; a bot's name is never a player route. Pagination cursors are
opaque strings of `started_at` and `id`. Every answer carries `adaptations: [...]` naming the constants, as SL-01's
`publicPlayer` does.

**B4. Replays public -- down to the host's door.** The ruling reaches three places:
- **The listing** `GET /replays` (`replay/http.ts`) answers every caller, no bearer, from the `replays` table (B2) and
  `HostedReplays`; the bearer is read only to recognise the operator (the `orphans` list stays the operator's). The
  header's W36.R2 paragraph is rewritten to the new ruling with its date; `REPLAYS_LIST_MAX_PLACEHOLDER` and the id
  pattern stay.
- **The fetch** `GET /replays/<id>` on central answers **302** to the host's door with a fresh grant in the query --
  `https://<host>.play.socom2legacy.com/replays/<id>?grant=<token>` -- for any caller, under the public routes'
  existing limiter only (30 per 10 s per address, the same as every public route) and **no bound of its own** (the
  owner, 2026-11-07: "no bound"); 404 for an id no row names. A community host's opt-out is a LATER row, not built
  ("opt out can be something to put in the way later stack"). The grant is the existing 60 s ticket with `public: true` in place
  of the `acct` claim (`replays.ts:247-300`, `tickets.ts:469-484`); `POST /replays/grant` for a logged-in page stays.
- **The host's verifier** (`host/src/replays.ts:26-31`) accepts a `public` grant with no account and **without an
  Origin** (a `curl` has none); everything else about it -- the signature, the 60 s, the id match -- holds. Hosts
  pick this up on their 15-minute rebuild; until a host has it, central's 302 still points at it and the door answers
  403 as today: the API's `replay` field carries `available: false` for a host whose hello does not say
  `publicReplays: true` (the same additive-hello mechanism as B1).
- `deploy/THREAT_MODEL.md` (or the deploy README's threat section, the builder finds it) gains the row: a host's
  replay files are served to anyone with a grant central mints for anyone, under the public routes' limiter only
  (the owner's word); the exposure is the hosts' egress, not a player's data (a replay holds names and moves already public on `/api/live` and in the
  match rows). H157 is marked answered. The `.s2r` is gzipped bytes; a reader is the replay viewer (`?devmode`), not
  this API's concern.

**B5. The Discord LIVE Worker** is not extended beyond SL-07's fourth channel in this work; a per-match post is a
later ask.

### What is excluded, by design
Assists (the original has none; KD not KDA, W43 decision 2); ping, rtt and `commandRate` per player (the signals stay
in the ledger, never on a public route); IP addresses, hosts' internal names; the `.s2r` parsed on central (the events
come from the room's report, not from the replay); a web page in the launcher (a later product task reads these
routes).

## 5. Tests the builder writes first

| where | test |
|---|---|
| match `test/matchRecord*.test.ts` (new) | `open` / `round` / `close` chunks for a counted, a respawn, an under-five, a CPU and an abandoned match; each chunk under 256 KiB with 500 events; `eventsDropped` said; a bot seat `cpu:<n>`; **nothing sent when central's hello lacks `matchRecords`**; the results path's messages unchanged (`HandOver`, `ResultGame` byte-equal to today's for the same match) |
| match `test/replay*.test.ts` | nothing new enters the replay stream |
| host `test/link*.test.ts` | the capability read from central's hello; `matchRecord` forwarded; a public grant verified without an Origin, a non-public one still needing it |
| central `test/serviceStore*.test.ts` | V9 migrates from V8 on a copy of a V8 store; the five tables and their indexes exist; the uncounted events' prune |
| central `test/matchRecords.test.ts` (new) | each chunk written in one transaction; `counted` set by the results worker's fold and `reason` by the record; a void marks `reason 'void'`; the replay join within tolerance; **the career record is byte-identical** before and after each case |
| central `test/statsApi.test.ts` | each route's shape, 404s, pagination, the limiter and cache headers, CORS; a bot name on the player route is 404; `respawnKills` derived as SL-02's rule |
| central `test/replayHttp*.test.ts` | anyone lists; the fetch 302s to the host with a public grant under the public routes' limiter and no other; the operator alone sees `orphans`; an unknown id is 404; `available: false` for a host without the capability |
| central `test/controlLink*.test.ts` | the hello's two additive flags; a protocol-7 host without them is unchanged |
| central `test/pagesRoutes.test.ts`, `centralFront.test.ts`, `centralDeploy.test.ts` | the `/api/stats/` prefix row (the `/replays` rows already pass) |
| `tools/test/placeholderLedger.test.ts`, `conventions.test.ts` | the new constants listed; H157 and the MISSION rows |

Acceptance: the routes answer on the nightly through its hostname (HTTP 200s recorded by kind), one real match's rows
read back against the host's log of the same match (kills and rounds agree), and the ledger's record unchanged for
the playtest accounts (a `SELECT` of `accounts.stats` before and after, compared).

## 6. Left to the builder

The exact column types; the cursor encoding; the hello flags' names; where the `matchRecord` intake lives beside
`hostResults.ts`; the public grant's claim shape; the threat-model file; the order of B1-B4 within the lane (B1 and B2
land together in one release of central and the hosts; the hello flags make either order safe).

## 6a. Weighed and not taken
- **Amending BTL.R10 and `handOverOf` so bot and short matches enter the results path**: three cited rules edited and
  an accept-then-refuse intake, for the same rows the record message gives with no change to the record's path.
- **Hanging `events` on `RoomMatchResult`**: 2000 events at ~110 bytes is ~220 KB before the signed envelope against
  the link's 256 KiB, an abandoned match has no match result, and `readBlock` refuses extra keys -- the per-round
  chunks avoid all three.
- **Keeping SL-02's tally beside the match rows**: two definitions of "Kills (Respawn)" that would disagree.
- **Hosts serving replays with no grant at all**: the minted public grant keeps the door's verifier and the 60 s
  window in place, so a replay link is central's to give; the owner chose no bound beyond the public routes' limiter.

## 7. For the owner

1. **"Every replay public" reaches the hosts' doors** (B4) -- asked 2026-11-07 whether the grant should carry its own
   bound and whether community hosts may opt out: **"no bound, opt out can be something to put in the way later
   stack."** So: the public routes' existing limiter only, no grant cap; the opt-out a LATER row.
2. Nothing else: the three rulings in §2 are his words tonight and are numbered into MISSION by the plan (numbers
   claimed in `agent-mail/LATER-CLAIMS.md` first). H402's two hands (the KV namespace, `#server-status`) stay his.
