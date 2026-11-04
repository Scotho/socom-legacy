# 246 -- The session export (Download session)

Written 2026-10-07 for PT-17 of web sprint 34 (the plan `docs/plans/2026-10-07-web-sprint-34-the-session-and-the-briefing.md`;
the design `docs/specs/2026-10-06-playtest-and-replay-design.md` §4.5, "Download session"). The code:
`packages/playtest/src/zip.ts`, `packages/playtest/src/exportSession.ts`, the `export` verb in
`packages/playtest/src/cli.ts`. The tests: `packages/playtest/test/zip.test.ts`, `packages/playtest/test/exportSession.test.ts`.
**A playtest instrument with no original** (PLAYTEST_INSTRUMENT_ADAPTATION): nothing here reads or changes a game value
or behaviour (PT.R3), so nothing here is a parity finding. No game, emulator, browser or dev server was run for this
note; the tests build ZIPs in memory and from temporary session directories.

The verb, run from `socomlegacy/`: `npx tsx packages/playtest/src/cli.ts export [--dir <session dir>] [--out <file>]`. It
acts on the session's directory, not on the service, so it runs whether or not the session is live. With no `--dir` it
takes the newest session under `socomlegacy/.playtest/` (by the record's `createdAt`); with no `--out` it writes
`<dir>/export/<session id>-<yyyymmdd-hhmm>.zip` (the time in UTC, as the session id's date is). It prints the file it
wrote, the number of files, the size in bytes and the sha256 of the ZIP, and no other path.

The ZIP holds:

| entry | from |
|---|---|
| `report/index.html` | the report as a static page: a caller's `report(record)` when given; else a plain HTML table of the observations (id, the player's words, the state, the decision). PT-12's static page replaces the plain table when it lands (note 247). The report is given the **filtered** record. |
| `session.json` | the record through `exportRecord` (§2) |
| `marks/<id>/frame.png`, `marks/<id>/clip.webm` | the mark's frame and clip, where present, byte for byte |
| `marks/<id>/telemetry.json` | the mark's telemetry, where present, through the same filter (§2); a telemetry file that is not JSON is left out |
| `segments/<n>.s2r` | the closed segments, gzipped already (`segments.ts`); an open `.part` is not taken |

Nothing else of the session's directory enters the ZIP (an `export/` directory of earlier exports, a stray file under a
mark). The manifest `exportSession` returns lists the entries in the ZIP's order, its size, and the sha256 of the ZIP's
bytes.

## 1. The ZIP

**Why store-only.** What the ZIP carries is compressed already: the frames are PNG, the clips WebM, the segments
gzipped `.s2r` files (`gzipReplay`). Deflating them again saves next to nothing and adds a decoder path that can be
wrong; a stored entry is its bytes, so a reader that finds the entry finds the file. And no new npm dependency
(W34.R3): the format is short enough to write by hand.

**The parts, as written** (APPNOTE's plain form, little-endian):

| part | fields written |
|---|---|
| local file header (`PK\3\4`, per entry) | version needed 2.0; general purpose flags `0x0800` (bit 11: the name is UTF-8); method 0 (stored); DOS time and date; CRC-32; compressed size = uncompressed size; the name's length; no extra field; the name; then the bytes |
| central directory (`PK\1\2`, per entry, in the same order) | version made by 2.0 on MS-DOS; version needed 2.0; the same flags, method, time, date, CRC and sizes; no extra field, no comment; disk 0; internal and external attributes 0; the local header's offset; the name |
| end of central directory (`PK\5\6`) | disk numbers 0; the entry count (on this disk and in all); the central directory's size and offset; no comment |

The CRC-32 is the IEEE polynomial (`0xEDB88320`, reflected) by a 256-entry table; the test holds it to the known vector
(`The quick brown fox jumps over the lazy dog` is `0x414FA339`) and to Node's `zlib.crc32` over random bytes. The time
is the DOS time of the entry's `mtime` in UTC (`exportSession` gives every entry the same time, the export's `now`, so
the same session and the same `now` give the same bytes); with no `mtime`, or one before 1980, it is the DOS epoch,
1980-01-01 00:00:00.

**What is refused**, each with an error that says why: a file of 4 GB or more (its size would need ZIP64, which is not
written); an archive whose offsets pass 4 GB; more than 65535 entries (the end record's count is 16 bits); a name
longer than 65535 bytes; a name that would leave the archive when extracted (empty, absolute, a drive letter, a
backslash, a `..` segment); a name given twice.

**The test's reader** (the plan's review focus 5) is written in the test, not imported: it finds the end record from
the back, walks the central directory, follows each entry to its local header, checks the two agree, and compares the
bytes, over a 4 MB random buffer, a name with a space, a UTF-8 name (`clip ü.webm`), an empty file and several entries
at once. The extraction by a stock tool is not part of the unit tests; it was done once by hand (2026-10-07, a manual
run, not a test): the CLI's `export --dir --out` on a scratch session with a 4 MB random clip and a 1000-byte segment,
listed and extracted by Windows' own `tar.exe` (bsdtar) and checked by Python's `zipfile.testzip()`, every file byte
for byte (`cmp`), the flags 0x0800, the record's `tree` absent and its `url` withheld. bsdtar shows the stored time as
local time (DOS times carry no zone); the writer stores UTC, so a listing may show it shifted by the reader's offset.

## 2. The privacy filter

The spec's boundary for the ZIP (4.5): no paths beyond the ZIP, no server diagnostics, no tokens -- the same boundary
as the report. `exportRecord(r)` returns a copy of the record (the record given is not changed) with:

| rule | why |
|---|---|
| `target.tree` dropped | the served tree is a host path; the CLI already keeps it out of the record (`cli.ts` `start`), and the filter drops it should a record carry it |
| a string holding a drive path (`X:\` or `X:/`, a letter not ending a URL's scheme) -> `(withheld)` | a Windows path names the host's layout and often the user |
| a string holding a Unix home path (the root's `home` or `Users` directory, as a path) -> `(withheld)` | a home directory names the user |
| a string holding a URL with a port (`scheme://host:port`) -> `(withheld)` | the session's own addresses (the page's `launch.url`, the service's socket, a match server's address in the telemetry): local ports and addresses, the server diagnostics the spec keeps out |
| in a field whose name contains `token`, `key` or `secret`, a string holding a run of 32 or more of `[A-Za-z0-9_-]` -> `(withheld)` | a credential; the length keeps a short value (an option named `keyboard`, a flag) |

The rules apply to every string at any depth (the observations' words, the harness notes, the history, the options);
a string that matches is replaced whole, never cut, so nothing of it survives. The marks' `telemetry.json` goes through
the same rules. The evidence paths the record keeps (`marks/<id>/frame.png`) are relative to the session and so to the
ZIP (`evidence.ts`), and pass. The filter is a boundary, not a proof: a bare IP address without a port, a UNC path
(`\\server\share`), a `~/` or `%USERPROFILE%` home path, or a secret in a field with another name, is not caught by these
rules -- what the session itself writes holds none of them; the review of 2026-10-07 named them, and sprint 36 adds the
rules with their tests. *(2026-10-08: added by PT-29 of web sprint 36, §4.2.)*

## 3. Placeholders

None. This task chooses no value that stands for the original, and no tuning value: the 4 GB and 65535 limits are the
ZIP format's own without ZIP64, and the token rule's 32 characters is the brief's rule.

## 4. The privacy review (PT-29, web sprint 36)

Written 2026-10-08T20:44Z for PT-29 of web sprint 36 (the plan `docs/plans/2026-10-08-web-sprint-36-every-match-recorded.md`,
review focus 6; the spec's §4.5 and §4.9: nothing personal enters a file or the export). The code:
`packages/playtest/src/exportSession.ts` (`exportRecord`), `packages/playtest/src/scrub.ts` (the shared sources and
`holdsSecret`). The tests: `packages/playtest/test/exportSession.test.ts` and `packages/playtest/test/scrub.test.ts`,
the `PT-29` blocks. Still a playtest instrument with no original (PLAYTEST_INSTRUMENT_ADAPTATION); source inspection
and unit tests only -- no browser, server or game was run for this section.

### 4.1 What each file carries, field by field

"Personal" is what names or locates a person (a name, an account, a home path, an address of a host of theirs, a
secret); "internal" is the project's machinery (a branch, a port, a commit, a room key); "neither" is the match itself.
The fates: **kept** (it leaves as it is), **withheld** (replaced by `(withheld)` or dropped on the way out), **never
written** (no code path puts it in the file).

**A replay file** (`.s2r`; `packages/match/src/replay/format.ts` `ReplayHeader`, `ReplayRecord`):

| field | holds | kind | fate |
|---|---|---|---|
| header `format`, `protocol`, `map`, `rules`, `gameType`, `tickHz`, `snapshotHz`, `kind`, `startedAt` | the format's and the match's settings, the wall clock at the open | neither | kept |
| header `build.commit`, `build.dirty` | a page's badge commit; on a server `GIT_COMMIT` or `unknown`, never dirty (`server.ts` `recording()`) | internal | kept |
| header `build.branch`, `build.branchCreated` | a playtest page's build branch and its creation time; `null` on a server | internal | kept (a playtest's own segments; the report shows the branch's friendly name, §2's rule in `scrub.ts`) |
| header `serverName` | the operator's `SERVER_NAME` (`main.ts`), the name the room list shows | neither | kept |
| header `session` | a playtest's session id and segment; `null` on a server | internal | kept |
| `players` (`ReplayPlayer` `{ id, name, team, role, char }`) | the lobby's members after each change; `name` is the display name (the account's in a game room, `fixedNames`; the page's in a dedicated room) | personal, already public in the room (spec 4.9) | kept |
| `event` | the room's broadcasts only (`RoomRecorder.event` at `Room.broadcast`): `joined`/`renamed` carry a name, `score` its rows' names and the spectators' names; the rest ids, ticks, places | personal (names, public as above) | kept |
| a player's own typed text (`communication`/`taunt` `text`) | sent per recipient (`room.ts`, the two `case`s, `this.send`), never broadcast | personal | **never written** |
| `snap`, `cmd`, `mark`, `end` | bodies' states; a playtest's commands (the server's rooms record none, `files.ts` `RoomRecording`); a mark's observation id and time; the end's tick and reason | neither | kept |
| an account id, a ticket, the page's session token, an address, a host path | none of the records has a field for one (`ReplayPlayer` and the header above are the whole of it) | personal | **never written** |
| the file's own path (`<dir>/<room key>/<startedAt>.s2r`) | the server's directory layout | internal | **never written** into the file; the listing names a replay by W36.R1's opaque id, never its path |

**A sidecar** (`<file>.json`; W36.R1's design, built by PT-24 -- merged on `agent/playtest` at 5940abf21, and this
table re-read at the sprint's close against `ReplaySidecar`, `packages/match/src/replay/sidecar.ts`: its fields are the
table's, `id` to `accounts`, and no other):

| field | holds | kind | fate |
|---|---|---|---|
| `id` | a 16-hex hash of the relative path (`REPLAY_ID_PLACEHOLDER`'s form), never the path | internal | kept |
| `room`, `kind`, `map`, `rules`, `gameType`, `startedAt`, `endedAt`, `ticks`, `bytes`, `reason` | the room key and the match's facts, for the listing and the sweep | internal / neither | kept |
| `players` `[{ name, team }]` | the display names, as the replay holds them | personal, public | kept; the listing returns them (W36.R2) |
| `accounts` `[accountId]` | the participants' accounts, for the visibility check only (W36.R1); `[]` for a dedicated room | **personal** | kept on the server beside the file, **never** in the replay (so a shared replay carries none) and never in a listing (names only, the plan's global constraints) |
| a ticket, a token, an address, a host path | -- | personal | **never written** (the plan's global constraints) |

**The session export** (the ZIP, §1; `exportRecord` over the record and each mark's `telemetry.json`):

| field | holds | kind | fate |
|---|---|---|---|
| `id`, `createdAt`, `closedAt`, `closeReason`, `lastHumanInputAt` | the session's id (PT.R7) and times | neither | kept |
| `target.tree` | the served tree, a host path | personal / internal | **never written** by the CLI (`cli.ts` `start`), and dropped should a record carry it |
| `target.asked` | the human's word: `current`, `main` or a ref | internal | kept; withheld when it holds any form below |
| `target.commit`, `target.dirtyHash`, `fix.tested` | a git commit, the sha256 of `git status` | internal | kept (lower-case hex: no rule reads a hash as a secret) |
| `target.branch`, `branchCreated`, `fix.branch` | the build's branch, its time, the fix-now branch | internal | kept |
| `launch.map`, `mode`, `online`, `options` | the test room's own settings | neither | kept; any value holding a form below withheld |
| `launch.url` | the page's address: `localhost:<dev port>` and the socket's `127.0.0.1:<service port>` | internal | **withheld** (a URL with a port) |
| `segments[]` | each segment's index, relative file, map, times, ticks, reason | neither | kept |
| `observations[].player[].words` | the player's own words | personal (the player's) | kept as said; withheld whole only when they hold a form below |
| `observations[].evidence` | relative paths (`marks/<id>/frame.png`) | neither | kept |
| `harness`, `decision`, `history`, `card`, `retests`, `pins`, `retestOf` | the harness's and the controller's text, writers, times | internal | kept; any string holding a form below withheld |
| telemetry `stats`, `net`, `camera`, `badge`, `source`, `tick`, `clip`, `recording`, `kit`, `feet` | the page's state at the mark (`viewer/src/main.ts`'s hook `net()`: ids, team, bodies, RTT -- no URL and no name) | neither / internal | kept |
| telemetry `search` | the page's address as `URLSearchParams` writes it, with `playtest=ws%3A%2F%2F127.0.0.1%3A<port>` | internal | **withheld** -- before PT-29 it passed (the rules read no encoded `://`); the record's `launch` keeps the map, mode and options |
| `segments/<n>.s2r` | the replay file above, byte for byte | as above | kept (its own table) |

**The live and the static report** (`report/page.ts`; research 247): the build's name (an `agent/` prefix dropped, or
"this build"), the short commit, the map, mode, online, the times; per card the id, the evidence by path, the player's
words (escaped, never edited -- the live page is the player's own, on this host), and the harness's notes, finding,
reference, writers and history through `scrubInternals`. The static page renders the **filtered** record (§2), so the
forms below reach it as `(withheld)`; the live page's event stream carries the filtered record too (`report/sse.ts`).
The live page's replay `<iframe>` names the two local ports in its `src`, an attribute the player does not read
(research 247) -- internal, kept on the live page only, never in the static one. The summary (`summary.ts`) and the
ready sheet (`readySheet.ts`) take every text through the same scrub.

### 4.2 The remaining forms, and why each rule is the shape it is

Each is one source in `scrub.ts`, tested whole by `exportRecord` (a string that matches is replaced whole, §2) and
withheld as a span by `scrubInternals`, so the export, the static report, the summary and the ready sheet hold one rule.
The percent-decoding is one too: both read every layer `percentLayers` (`scrub.ts`) gives (the sprint 36 close, review
B F1, F2: before it the export decoded the whole string once and the scrub recursed through itself).

| form | rule | what it leaves, and why |
|---|---|---|
| a bare IPv4, no port | four dotted octets of 0-255 (`25[0-5]\|2[0-4]\d\|1\d\d\|[1-9]?\d`), not after a word character or a dot, not before a digit, `.digit` or a letter -- the leak check's own boundaries (`workflow/release/leakrules.py` `IPV4_RE`) | `1.2.3` (a version of three parts), `round 1.5`, `12:30`; a four-part version string *is* withheld (the cost, named) |
| a UNC path | two backslashes, a host, a backslash, a share's first character (`\\\\[^\\\s]+\\[^\\\s]`) | a single backslash (`B\C`, a name such as `Sniper\2`) |
| `~/` | `~/`, `~\` or `~<user>/` at a word's start (not after a word character or `~`), then a path character; `<user>` a POSIX user name, `[a-z_][a-z0-9_.-]*` (useradd's default) | `~5/10 shots`, a gamertag such as `~Ghost/1` (upper case), `a~/b` inside a word |
| a profile variable | `%NAME%` with an upper-case name of three or more (cmd writes them so: `%USERPROFILE%`, `%APPDATA%`), and the profile's own in any case (`%LocalAppData%`) -- either only standing alone or opening a path: after the start, a space, a quote, `(` or `=`, and before `\`, `/`, a space, a quote, `)`, `,`, `.`, `;`, `:` or the end (the review's tightening); `$HOME`, `${HOME}`, `$USER`, `$USERNAME`, `$USERPROFILE` as whole names; PowerShell's `$env:<name>` | `50% of the way, 20% left` (a space after the percent), `it was 100%LAG% of the time` (a digit before the `%`), `$5`, `$HOMEWORK` (not the whole name) |
| a long secret, any field | a run of 32 or more of `[A-Za-z0-9+/=_-]` shaped as the leak check's opaque rule (`leakrules.py` `OPAQUE_RE`, `opaque_hit`): both cases, at least three separate digit runs, no `/`, no `__`, at most two of `_-` (`holdsSecret`) | a lower-case hex digest (a commit, the dirty hash, so `target` passes whole), a UUID, a kebab-case name, a word in capitals, a relative evidence path. The field rule of §2 stays: under a *token*, *key* or *secret* field any run of 32 still goes |
| percent-encoded | both read the text and each layer of its decoding (`percentLayers`): one layer decodes every word holding a `%` and two hex digits, run of escapes by run (a run that is not UTF-8, escape by escape where the escape is ASCII), never throwing, so a stray `%` (`50% of`, `50%;`) beside an encoded address leaves the address read; the layers go on in a loop to `PERCENT_DECODE_LIMIT` (4), so a twice-encoded address is read at its second; a word that would decode further after the limit is withheld (fail closed). `exportRecord` withholds the string when a rule reads any layer; `scrubInternals` withholds the word whole when a rule reads any of its layers (the PT-29 review's finding: before it, only the export decoded; the sprint 36 close's: the export's one `decodeURIComponent` of the whole string threw at a stray `%`, and the scrub's recursion overflowed the stack on a word nested thousands deep) | an encoded word that decodes to nothing internal within the limit (`map=MP2%20x`, `100%25`) -- (the telemetry's `search` is the case) |

A player's words or name that only looks like a path stays: `go to A/B`, `took the 1/2 route`, `and/or`, `flank B\C`,
`~Ghost/1`, `Sniper\2` -- each a test (`exportSession.test.ts`, "leaves a player's words ..." and the telemetry test;
`scrub.test.ts`, "leaves the player's words ..."). The scrub's older rooted-path rule (`~name/...` at a word's start, any
case, since sprint 34) still withholds `~Ghost/1` in the *summary* and the ready sheet; the export and the report keep
it as said. That difference is the scrub's own wider rule for text shown to the player, not a new one.

**Not caught still** (a boundary, not a proof, as §2 says): a bare IPv6 address (a rule that tells `fe80::1` from a time
`12:30:15` or a C++ `a::b` was not written); a base64 secret whose `/` breaks it into runs under 32; a secret shorter than
32; a person's real name typed as words (no rule can know one); an address hidden by an encoding other than
percent-encoding (an HTML entity such as `&#58;`, a `\u003a` escape, base64), which nothing decodes. Percent-encoding
itself is no longer among them: a stray `%` does not stop the decoding, and a word nested past `PERCENT_DECODE_LIMIT` is
withheld, not read as it is (the sprint 36 close); a non-ASCII byte that is not UTF-8 stays encoded, and no rule's
character is one. **The any-field secret rule misses part of this
project's own secrets**: of the server's login tickets (`randomBytes(32).toString('base64url')`,
`packages/central/src/accounts.ts`, the session's issue), about 17.5% are left -- fewer than three digit runs, or more
than two of `_`/`-` (17.56% of 100,000 drawn, measured 2026-10-08 by this task and by the review, a Node script over
the same predicate; not a test) -- and a lower-case hex secret of any length is always left (it has the shape of a
commit or a digest). The leak check's opaque rule (`opaque_hit`) has the same gaps: the shape is a chosen trade-off
that keeps commits, digests, UUIDs, kebab names and evidence paths, not a proof. A ticket under a field named *token*,
*key* or *secret* is caught whole by §2's field rule. What the session itself writes holds none of these.

### 4.3 Placeholders

None. The 32 characters are §2's; the opaque shape and the IPv4 boundaries are the repository's leak check's.
`PERCENT_DECODE_LIMIT` (4, the sprint 36 close) is a loop's bound, not a stand-in for a value: a word still encoded past
it is withheld, so a different bound could only keep or withhold more of the player's encoded words, never let an
address through.
