# 129 -- The service store: persistence of the online services on our hosted box (SVC-04)

Written 2026-10-02 for SVC-04 (`../roadmap/06-online-services.md`, "SVC-04 -- Persistence on our hosted box"), on the
online path the owner set the same day (Main menu -> Online -> the traditional flow up to the match's start). The
shape is R6's (`../MISSION.md`; research 97 §7): the services live inside the match server, `packages/server`. The
code is `packages/central/src/serviceStore.ts` (the store) and `packages/central/src/serviceShow.ts` (the acceptance
instrument); the tests are `packages/central/test/serviceStore.test.ts`, `packages/central/test/serviceStoreCrash.test.ts`
(the write path under a fault) and `packages/central/test/serviceShow.test.ts`.
Sources: our Horizon's sources (`server/horizon-server/` of the recompilation project, `SOCOM_PC_ROOT`;
`Constants.cs` is `RT.Common/Constants.cs`, `Types.cs` `RT.Common/Types.cs`, `DbController.cs` and `DbSimulated.cs`
under `Server.Database/`, `MAS.cs` under `Server.Medius/Medius/`), `server/seed-simulated-db.ps1` (its `-Show`),
research 97 (the message map), the retail decompilation r0001 (`D:L<line>`) and the R7 spec
(`../specs/2026-10-01-web-r7-account-and-card-design.md` §7 item 5). **No server was contacted** (R293); nothing in the
tests leaves the machine; each test runs in its own temporary directory.

**Addendum, 2026-10-05 (OT.R37):** the store's records now live in one SQLite database, `services.sqlite`, through
`node:sqlite`, behind the same API; a `services.json` is imported once and left. R131.3's whole-file rewrite and its
SHA-256 check are replaced by a row diff in one transaction and a generation counter; the widths, the rules and
R131.5's backup format stand. The schema, the durability and the import: [research 220](220-the-service-store-on-sqlite.md).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R131.1 | **The original's server storage is unobservable**: the client sees only the records of V5-V12. What is fixed by the client is each record's **width**: Constants.cs's 32 / 32 / 200 / 256 / 256 / 1000 and the builders' terminator, which writes the NUL at `width - 1` (`FUN_0064f3d8`, D:L564314-564333), so a string field keeps `width - 1` bytes | the store refuses any text past `width - 1` bytes of UTF-8, and any stats blob that is not exactly 256 bytes; the operations above it (SVC-03 onward) map the refusal to the client's status | §2 |
| R131.2 | **A ladder post carries 15 ints** (`LADDER_STATS_COUNT_READING`): `UpdateLadderStats` is 0x58 bytes (`FUN_0064b248` D:L562069-562089) with the stats from +0x1c (`FUN_002faa80` D:L198436-198440 writes the rating there), and (0x58 - 0x1c) / 4 = 15 | the account's and the clan's ladder entries hold 15 int32s (type 0 and type 1, `MediusLadderType`, Types.cs:149-153) | §2 |
| R131.3 | **One document, rewritten whole and atomically on every change** (a temporary file written whole, fsync, rename, the directory flushed), validated whole before it is written and when it is opened; a refused or failed change leaves memory and file as they were; a damaged file is refused, never reset | our Horizon's simulated mode is also one document (`DbSimulated.cs`), saved on the next tick (`DbController.cs:62-67`); ours is on the disk before the call returns | §3 |
| R131.4 | **The acceptance's "-Show diff" is built as an instrument**: both stores brought to one view (what both keep), ids renumbered by first appearance, an operation's effect the list of changed paths. Tested against a Horizon document written from `DbController.cs`'s simulated branches -- a reading of Horizon, not a capture | the proven level is ONL-32's: the same step against our Horizon, its `-Show` before and after, diffed against ours | §4 |
| R131.5 | **Backup and restore**: a backup is a format line carrying the body's SHA-256, then the data file's bytes; a restore checks the format, the checksum and the body whole before it replaces the live file | the restore test passes (the block's acceptance); a damaged backup leaves the live store untouched | §5 |
| R131.6 | **Our store departs from Horizon's where Horizon is not the original**: no duplicate buddy or ignore entry (Horizon appends one, `DbController.cs:819-826`); a disbanded clan kept with `disbanded` (MediusClanStatus `ClanDisbanded`, Types.cs:191-195; the client reads MP_CLAN_DISBANDED from GetMyClans, research 97 §5 row 3) where Horizon's simulated DeleteClan removes the record | the view drops a disbanded clan, so the two still compare | §6 |

## 1. What the block asks, and what is built

The block's Gap: a schema holding each record at the original's widths, the account's password hash, the remember
tokens' hashes with their last-used time (R7, replacing R4's issued credentials), backup and restore. Its Goal names
accounts, clans, clan messages and invitations, buddies, ignore lists, stats blobs, ladder entries and announcements.
All of them are records of `ServiceData` (§2). The store holds records, not rules: who may disband, invite, post or
transfer is each operation's (SVC-03, SVC-08, SVC-09, SVC-13, SVC-16), which turns a `StoreError` (`width`, `format`,
`taken`, `not-found`, `state`, `corrupt`, `stale`) into the Medius status the client reads (research 97 §1.3: the client tells
success from failure, plus a few named codes). The store keeps only the invariants a record cannot be without: a
clan's leader is its member while it stands; an account is in one clan at most (one `ClanId`, as `AccountDTO`); one
undecided invitation per target and clan; an invitation is decided once (0 -> 1, 2 or 3,
`MediusClanInvitationsResponseStatus`, Types.cs:258-264); ids are unique and every reference resolves.

## 2. The schema at the original's widths

| record | field | width or form | source |
|---|---|---|---|
| account | `name` | 32 (31 bytes + NUL) | ACCOUNTNAME_MAXLEN, Constants.cs:11 |
| account | `passwordHash` | a PHC string, `$argon2id$` or `$scrypt$`; a plain password is refused | R7 (SVC-03 chooses the parameters) |
| account | `stats` | exactly 256 bytes, base64; 256 zero bytes at creation | ACCOUNTSTATS_MAXLEN, Constants.cs:12; V10; Horizon's create, MAS.cs:405 |
| account | `ladder` | 15 int32s or null (no post yet) | R131.2 |
| account | `friends`, `ignored` | account ids, each once, never the account itself | V2, V1 |
| account | `clanId` | a clan id or null | AccountDTO.ClanId |
| account | `tokens` | `{ hash, created, lastUsed }`: the SHA-256 of a remember token (64 hex digits), times in ms | R7 §7 item 5; SVC-03 |
| clan | `name` | 32 (31 + NUL); unique among standing clans | CLANNAME_MAXLEN, Constants.cs:13; CreateClan's +0x2c:32 (research 97 §2.1) |
| clan | `stats` | exactly 256 bytes, base64; 256 zero bytes at creation | CLANSTATS_MAXLEN, Constants.cs:14; V6; DbController.cs:1530 |
| clan | `ladder` | 15 int32s or null | R131.2 (type 1, the clan's mean, research 97 R97.6) |
| clan | `invitations` | `{ id, targetId, message (200), status 0-3, responseMessage (200 or empty), responseTime }` | V5; CLANMSG_MAXLEN, Constants.cs:15; RespondToClanInvitation's +0x30:200 |
| clan | `messages` | `{ id, text (200) }` | SendClanMessage's +0x26:200, ModifyClanMessage's +0x2c:200 |
| clan | `disbanded` | boolean; the members leave, undecided invitations become 3 | §6 |
| announcement | `body`, `from`, `to` | 1000 (999 + NUL); a window in ms, `to` null for open | ANNOUNCEMENT_MAXLEN, Constants.cs:26 |

Ids count from 1 per kind, as Horizon's simulated counters (`DbSimulated.cs:12-15`), and are never reused. Text widths
are counted in bytes of UTF-8: the original's keyboard writes ASCII, and what character set the field allows is
ONL-33's and SVC-03's (the keyboard side and the name rules), not the store's. Names are unique under
`nameKey`, which folds ASCII case as our Horizon's lookups do (`GetAccountByName` DbController.cs:167, `GetClanByName`
:1462) -- `NAME_KEY_CASE_FOLD_PLACEHOLDER`, §8.

## 3. Durability

`ServiceStore.open(dir)` reads `dir/services.json` and validates it whole (`validateData`: the version, every width,
the id counters above every id, unique names and token hashes, every reference resolving, the membership both ways); a
directory with no file is an empty store, written at its first change. Every change runs on a copy: the copy is
changed, validated whole, written to `services.json.tmp`, flushed (`fsync`) and renamed over `services.json`, the
directory is flushed so the rename itself survives a power cut, and only then is the copy adopted. Details that hold
it:

- **The whole-document check is the last guard.** Each operation checks its own inputs; `validateData` on the draft
  then refuses anything an operation let through (a clock value that is no whole ms, an announcement's negative
  window), as `format`, before anything is written (tested, and a test fails if the check is removed).
- **A short write is carried on.** `writeSync` may write fewer bytes than asked without an error (a nearly full disk);
  the store loops until every byte is written, so a truncated temporary file is never renamed over the good one
  (tested with a write that returns half its count).
- **A write killed half-way leaves the old document.** The tests make the write stop half-way with an error (ENOSPC)
  and reopen: `services.json` is byte-equal to before, the store's memory is unchanged, and the next change writes on
  from it; a partial `services.json.tmp` left beside a good file is ignored at open and replaced by the next write;
  the call order (temporary file opened, written, flushed, renamed, directory flushed) is pinned. The fault is
  injected by wrapping `node:fs` in the test; a real kill of the process mid-write was not run (no harness for it).
- **The directory flush.** On POSIX the directory is opened and flushed after the rename. Windows cannot flush a
  directory (`EPERM`; NTFS journals the rename), so that one refusal is ignored there and only there. If the
  directory flush fails elsewhere, the call throws with the new file already in place; the store has not adopted it
  and its next change is refused as `stale` (below), so it is reopened rather than overwritten.
- **One writer per file.** The store keeps the SHA-256 of the file as it last read or wrote it, and before each write
  checks that the file is still that one; if it is not (a restore, another process), the change is refused as
  `stale` and the file is left as it is. The check and the rename are not one atomic step: two live writers on one
  directory are a deployment error this narrows, not a mode it supports.

A refused change throws before the write; a failed write throws before the adoption; in both cases the store and the
file are as they were (tested). A file that does not parse, has another version or breaks a rule is refused
(`corrupt`) and left on the disk as it is -- never reset, so the owner's data is never lost to a bug.

The store never logs, so neither a password hash nor a token hash reaches a log line (SVC-03's acceptance asks that of
the typed password and the token).

## 4. The acceptance instrument: Horizon's `-Show` diff, ids normalised

The block's acceptance is "each operation's DB effect equals Horizon's `-Show` diff for the same ONL-32 step, ids
normalised". `seed-simulated-db.ps1 -Show` decrypts and prints our Horizon's `simulated.db`, which is the `DbSimulated`
document (counters, `Accounts`, `Clans`, `AppSettings`). `serviceShow.ts` brings both stores to one view
(`showOfStore`, `showOfHorizon`): per account its id, name, friends' and ignored ids, clan id and stats blob; per
standing clan its id, name, leader id, member ids, stats blob, invitations (id, target, message, status, response) and
messages. Left out on purpose: the password hash (ours argon2id/scrypt, Horizon's an unsalted SHA-256, MAS.cs:403),
the ladder (the client's plain 0xce post has no Horizon handler, research 97 §3-§4), the tokens, times, counters, app
and machine ids and Horizon's wide stats. `normaliseIds` renumbers each kind of id by first appearance and rewrites
every reference (a dangling one becomes 0, so it shows); `diffShow` lists the paths that changed between two views.

At the reading level the test builds the Horizon document a sequence of steps would leave -- two registrations and a
third, a clan created, an invitation accepted, a clan message, a buddy, an ignore -- from `DbController.cs`'s
simulated branches (CreateAccount :228-240 with MAS.cs:400-406, CreateClan :1522-1535, CreateClanInvitation
:1741-1751, RespondToClanInvitation :1850-1863 with its accept, ClanAddMessage :2004-2008, AddBuddy :819-826,
AddIgnored :906-913), with Horizon's own ids, and checks that it and our store after the same steps normalise to the
same view. That is a reading of Horizon's code, not a capture. **Owed to ONL-32:** the same steps run against our
Horizon, its `-Show` print taken before and after each, and the two diffs compared step by step.

## 5. Backup and restore

`backup(path)` writes, atomically, one line `{"format":"s2u-service-backup","v":1,"sha256":"<hex>"}` and then the data
file's bytes as they stand *(2026-10-10, SVC-07: `"v":2` since the document's version 2 -- each account's `lastResult`
and `lastAudit`; `restore` reads a version 1 backup migrated as it is read and refuses a version 3; the open that
migrates a version 1 database first writes `services.v1.backup` in this format at version 1; research 264 §2.1)*; the SHA-256 is the body's. `ServiceStore.restore(backup, dir)` refuses a file with another
format or version, a body whose SHA-256 differs, or a body that fails `validateData`, and only then replaces
`services.json` atomically and returns the restored store. The test backs up, changes the store (a new account, a
disbanded clan), restores, and reads back exactly the backed-up document, in the returned store and in a fresh open; a
damaged backup (one byte changed, or not a backup) is refused and the live file stays byte-equal.

**A restore is offline**: stop the match server, restore, start it again. A store still open on the directory when
the file is replaced (in the same process or another) would otherwise write its old data over the restored file at its
next change; instead that change is refused as `stale` and the restored file is kept (tested).

Our Horizon encrypts its document with a key from its settings (`DbSimulated.cs:20-57`). Ours is plain JSON: it holds
no password and no token, only their hashes, and encryption at rest would need a key on the same box. Whether the
hosted copy and its backups are encrypted (the disk, the off-box pull) is a hosting matter, the owner's (the block's
owner calls).

## 6. Where our store departs from our Horizon

Our Horizon is a reimplementation; its behaviour is evidence of Horizon, not of Sony (segment 06's preamble).
- **Buddies and ignore entries are a set.** Horizon's AddBuddy and AddIgnored append without looking (`DbController.cs:819-826`,
  `:906-913`), so a repeated add lists a player twice; the client refuses a repeated friend locally (MP_PLAYER_IS_FRIEND,
  research 97 §2.3) and a repeated ignore (PLAYER_IS_IGNORED, §2.4). The store refuses the second (`state`).
- **A disbanded clan stays as a record.** Horizon's simulated DeleteClan removes it (`DbController.cs:1588`) after
  clearing the members' `ClanId` and setting each invitation's status to 3; Medius has a `ClanDisbanded` status and the
  client raises MP_CLAN_DISBANDED from GetMyClans' response (research 97 §5 row 3), so a member who was away can be
  told. The store clears the members, revokes only the undecided invitations (Horizon revokes all, decided ones
  included, `DbController.cs:1584-1585`: a decided answer is history, not an open offer; tested) and keeps the clan with `disbanded: true`; its name is free again. The view drops it, as Horizon does.
- **The leader stays a member.** Horizon's ClanLeave refuses the leader (`DbController.cs:1678-1680`); the store does too.

## 7. What is not done here

- **The store is not opened by the match server yet.** No operation uses it until SVC-03 (accounts) lands; the mount
  point (a data directory from the environment, opened in `main.ts`, and a volume in `deploy/compose.yaml`) belongs to
  the first operation that needs it. Which box hosts it, retention and migrating the hosted Horizon's accounts are the
  owner's (the block's owner calls; CLAUDE.md boundaries).
- **The pending friend confirmations** (X 0x05-0x08, research 97 R97.4) are SVC-16's store; nothing here holds them.
- **The token's idle lifetime** is SVC-03's open owner call: the store drops tokens idle since a cutoff it is given.
- **No account delete and no rename** (of an account or a clan): no operation on the path to the match's start asks for
  one; the stream that needs one adds it with its test.
- **No map from a `StoreError` to a Medius status.** Each operation does that (research 97 §1.3), with its own test.
- **A disbanded clan takes nothing**: stats, ladder posts, members, invitations and messages are refused with `state`.
- **Scale.** The whole document is rewritten per change, as Horizon's is; at our player counts that is milliseconds. A
  store past a few megabytes would move to an embedded database behind the same methods.

## 8. Placeholders and readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `LADDER_STATS_COUNT_READING` (`packages/central/src/serviceStore.ts`) | 15 | the ints of a ladder post: (0x58 - 0x1c) / 4, the request's length from `FUN_0064b248` and the stats' offset from `FUN_002faa80` (R131.2), read as the stats running to the request's end | ONL-32's transcript of a ladder post (the s4 slice shows the rating at byte 28 but not what follows it) |
| `NAME_KEY_CASE_FOLD_PLACEHOLDER` (`packages/central/src/serviceStore.ts`) | `true` | whether two names differing only in case are one account or clan: our Horizon folds case (DbController.cs:167, :1462); Sony's servers are gone and their rule is unobservable (SVC-03's Unknowns) | the owner's ruling; no capture can settle it |
