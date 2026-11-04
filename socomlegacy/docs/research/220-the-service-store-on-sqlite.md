# 220 -- The service store on SQLite: the schema, the durability and the one-time import (OT.R37)

Written 2026-10-05 for SQLITE-STORE, on the owner's ruling OT.R37 (the same day, verbatim in
[the online path's plan](../plans/2026-10-02-online-path-target.md): "we are going to bite the bullet and swap to sqlite
now instead of the single json plan"). An addendum to [research 131](131-the-service-store.md) (SVC-04, the store):
its records, widths, rules and backup format stand; what changes is where they are kept. The code is
`packages/central/src/serviceStore.ts`; the tests are `packages/central/test/serviceStoreSqlite.test.ts` (new),
`serviceStore.test.ts`, `serviceStoreCrash.test.ts` (rewritten) with its child `test/fixtures/storeKill.ts`, and
`dataFileMode.test.ts`; the loadouts (SQLITE-LOADOUTS, after ONL-17's merge) also `loadouts.test.ts`. Nothing here contacts a server; each test runs in its own temporary directory.

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R220.1 | **One SQLite database, `DATA_DIR/services.sqlite`, through Node's built-in `node:sqlite`** (`DatabaseSync`): no native module and no npm install. The store keeps its whole document in memory as before; the database is the durable truth | every read and all 27 mutators (the 25 before ONL-17 and its `setLoadout` and `deleteLoadouts`) keep their bodies; only `open`, `restore`, `backup` and `commit` were rewritten, and `close()` and `importedFrom` added | §1 |
| R220.2 | **A change writes only the rows that differ**, in one `BEGIN IMMEDIATE` transaction, after the whole-document check; a monotonic `meta.generation` with a random `meta.instance`, both read under the write lock, replace R131.3's whole-file SHA-256 | a refused or failed change leaves the database and the memory as they were (R131.3 holds); another writer, a restore or a file moved away makes an open store's next change `stale`, as before; a change waiting past 250 ms for the lock is the new `busy` | §2, §3 |
| R220.2a | **Amended 2026-10-06 (NET-STORE, [research 223](223-netcode-hardening.md) §5): the check and the copy cost only the changed records.** The mirror's records are deep-frozen once validated; a change's draft copies only the records a mutator writes; `validateData` checks a frozen record only for its references and uniqueness; the diff compares by identity first | a commit at 10,000 accounts measured 197 ms before, 14-21 ms after on this host (about 7 of it SQLite's DELETE/FULL commit); one transaction per change, the mirror adopted after COMMIT, the error codes unchanged | §1, §3 |
| R220.3 | **The schema (version 1) is twelve STRICT tables**; the widths stay the code's (`field`, `blob`, `validateData`), the CHECKs and the unique indexes (a live clan's name, one undecided invitation per clan and target) are a backstop | a newer schema is refused `corrupt` (R131: never migrated silently); an older one runs `MIGRATIONS[v]` forward in one transaction | §2 |
| R220.4 | **A legacy `services.json` is imported once**, when the database has no schema yet, read and validated before any file is made, and never written, renamed or deleted | a damaged JSON refuses the start (`corrupt`) and leaves no database; a crash mid-import leaves a schema-less file that the next start imports again; `main.ts` logs one info line with the JSON's SHA-256 | §4 |
| R220.5 | **Durability: `journal_mode=DELETE`, `synchronous=FULL`**, one connection per open and per change | power-safe on NTFS and ext4; no WAL `-shm` mmap (which a network or bind-mounted volume breaks); Windows can delete the directory between changes. Kept by NET-STORE (2026-10-06): WAL/NORMAL measured 0.01 ms a commit against DELETE/FULL's 7 (research 223 §5.5), the trade-off recorded there for the owner | §3 |
| R220.7 | **Schema 2 (NET-DRAIN, 2026-10-07, OT.R38 / H117 "keep logins"; [research 223](223-netcode-hardening.md) §7): the `sessions` table**, the login sessions: `hash` (the ticket's SHA-256, 64 hex digits, the remember tokens' hashing; never the ticket), `account_id` (UNIQUE, `ON DELETE CASCADE`), `created`, `last_used`, `expires` (the login plus `SESSION_ABSOLUTE_LIFETIME_MS`), indexed on `expires`. `MIGRATIONS[2]` creates it: a version-1 database migrates forward at open in the open's one transaction; a new one (and an import from `services.json`, unchanged) runs 1 and 2 | outside the document: no mutator, no `validateData`, no backup; its writes (`writeSessions`, the service's batch each sweep; `dropSessions`, a logoff; `loadSessions`, the start) are transactions of their own that check the instance but neither check nor bump the generation; a restore empties it | §2 |
| R220.6 | **`loadouts` holds SVC-24 / ONL-17's records (OT.R36, research 167 §2)**: a row per account, mission and side, keyed `(account_id, mission, side)` with the mission `COLLATE NOCASE`, the profile in columns (`char_set`, `item0`..`item4`, `valid`, all NULL for a side without a record), `pos` the mission's place in the account's table, CHECKs on every width, cascading with its account. Changed in v1 in place, not by a migration: no database exists anywhere (OT.R31: nothing is deployed; v1 only on this branch) | the mirror's `AccountRecord.loadouts` is loaded from and diffed into these rows; an ONL-17 `services.json` with `loadouts` is imported into them; the JSON backup carries them on its accounts and a restore replaces them | §2, §4, §5 |

## 1. The choice: a mirror in memory, the database underneath

The JSON store kept the document in memory and rewrote it whole. The SQLite store keeps the same `ServiceData` mirror,
so every read stays a copy of it (`snapshot`, `account`, `accountByName`, ...), and every mutator keeps its body: clone,
change, `validateData`. Only the last step differs -- the draft's rows that differ from the mirror are written in one
transaction, and the draft is adopted after COMMIT. The public API is the same, plus `SERVICE_DB_FILE`
(`services.sqlite`), `SERVICE_DB_SCHEMA` (1; 2 since NET-DRAIN's `sessions`, R220.7; 3 since SVC-07, 2026-10-10 -- research 264 §2.1), `store.importedFrom`, `close()` (a later change is refused `state`; it is the
place for a long-lived handle if ONL-17 wants one), `StoreOptions.beforeCommit` (tests only: inside the transaction,
before COMMIT) and the error code `busy`. `SERVICE_STORE_FILE` now names the legacy JSON; `SERVICE_STORE_VERSION`
remains the record shape's and the backup format's version *(2026-10-10, SVC-07: 2 -- each account's `lastResult` and
`lastAudit`; a version 1 database migrated once after `services.v1.backup` is written, a version 1 `services.json` or
backup migrated as it is read, a version 3 refused; research 264 §2.1)*. The callers (`accounts.ts`, `bridge.ts`,
`serverTexts.ts`, `serviceShow.ts`) are unchanged; `main.ts` gained the import's log line.

**One connection per change.** `open` opens, migrates or imports, loads and closes; each change opens, runs its
transaction and closes. Windows cannot delete a file SQLite holds open, and every caller's test removes its temporary
directory without closing a store; a long-lived handle would have meant editing every teardown. Opening the
connection costs under a millisecond a change (0.7 ms measured against a held one, research 223 §5.1); the commit's
own fsyncs under DELETE/FULL are 6-7 ms on this host, the floor of a change while it runs on the rooms' thread.

**The mirror is frozen (NET-STORE, 2026-10-06, research 223 §5.2).** Every mutator keeps its body, but a record it
writes is reached through `need`, `needClan`, `needLiveClan` or `needToken`, which copy that one record into the draft;
the draft's other records are the mirror's own frozen objects, so the whole-document `structuredClone` is gone and a
write that skipped the copy throws `TypeError` and changes nothing.

## 2. The schema, version 1 (and version 2's sessions)

`schema_version`, `meta` (`generation`, `instance`, `imported_sha256`, `imported_at`), `counters` (the five `next` ids),
`accounts`, `account_lists` (friends and ignored, `pos` keeps their order), `remember_tokens`, `clans`, `clan_members`
(`UNIQUE(account_id)`: one clan an account; an account's `clanId` is read from here, its single home),
`clan_invitations`, `clan_messages`, `announcements`, and `loadouts`. Every table is STRICT and every connection runs
`foreign_keys=ON`. The full DDL is `SCHEMA_V1` in `serviceStore.ts`.

- `name_key` is `nameKey()` computed in code, never in SQL, so `NAME_KEY_CASE_FOLD_PLACEHOLDER` keeps one home.
- The stats are BLOBs of 256 bytes, base64 only at the mirror's edge; a ladder is its JSON array or NULL.
- On load the id-less lists come back in `pos` order and the records in `id` order (the store only appends them).
- **`loadouts`** (SVC-24, OT.R36): ONL-17's per-mission record `{mission, seal, terrorist}` is two rows, one per side,
  `PRIMARY KEY (account_id, mission, side)`; the mission is `COLLATE NOCASE` (the original compares it so,
  `FUN_00198b80`; `setLoadout` stores it upper-cased, an imported one keeps its case), 1-8 of `[A-Za-z0-9_]`; a side
  with no record has `char_set`, `item0`..`item4` and `valid` NULL together (a CHECK), so a record with both sides null
  survives as it was; `char_set` 1-8, the items u16, `valid` 0 or 1, `pos` 0-127 (the 0x80 missions). `ON DELETE
  CASCADE` from `accounts`. The diff rewrites a changed account's loadout rows with its lists; the load folds them back
  in `pos` order, and an account with none has no `loadouts` key. v1 was changed in place (its reserved
  `(account_id, side, profile JSON)` table did not fit per-mission records): no v1 database exists outside the tests.
- **`sessions`** (schema 2, NET-DRAIN, research 223 §7.2): `CREATE TABLE sessions (hash TEXT PRIMARY KEY CHECK (64
  lowercase hex digits), account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE, created INTEGER
  NOT NULL, last_used INTEGER NOT NULL, expires INTEGER NOT NULL, CHECK (last_used >= created AND expires > created))
  STRICT` and `sessions_expires` on `expires` (`SCHEMA_V2`). The migration follows this note's rules: forward only
  (`MIGRATIONS[2]`), `SERVICE_DB_SCHEMA` 2, a version-1 database migrated at open (tested: `sessionsPersist.test.ts`,
  the table and its version row taken away and the database reopened), a database newer than 2 refused `corrupt`, the
  import from `services.json` untouched (it runs every migration from 0). *(2026-10-10, SVC-07: schema 3,
  `SCHEMA_V3` -- `accounts.last_result` and `accounts.last_audit`, JSON text, NULL in every row an older store wrote;
  `MIGRATIONS[3]`, run after the open writes `services.v1.backup`; `sessionsPersist.test.ts`'s schema 1 cases now open
  at `SERVICE_DB_SCHEMA`; research 264 §2.1.)* The rows are not part of `ServiceData`: the
  service (`AccountService`) loads the unexpired ones at its start and writes a login's row, its logoff's and its
  expiry's delete, and its last uses in a batch (`SESSION_TOUCH_FLUSH_MS`); `RECORD_TABLES` lists it first, so a
  restore empties it.
- The whole document is validated after every load (`validateData`): a clan name past its width (no CHECK holds it) or
  a clan led by an account outside it is refused `corrupt` at open, as R131 refused such a file. An account name past
  its width, written past the CHECKs by hand (`PRAGMA ignore_check_constraints`), is caught earlier, by the CHECK at
  `quick_check`; the tests hold both.

## 3. Transactions, errors and durability

A change: the whole-document check (`format`, as before; since NET-STORE a frozen, already validated record is
checked only for its references and uniqueness, research 223 §5.2); the file still there (`stale` if it was moved or deleted:
only `open` makes a database); `BEGIN IMMEDIATE`; `meta.instance` and `meta.generation` compared with the store's
(`stale`; the instance is a random id written at the schema's creation and by every restore, so a recreated file whose
generation restarted at 1 is not taken for the store's own); the diff (records gone deleted, changed ones upserted, a changed account's or clan's lists deleted and
inserted again, the counters set; children cleared before their parents, inserted after every parent); the generation
bumped; `beforeCommit`; COMMIT. Any throw rolls back and leaves the mirror. SQLite's errors map: BUSY or LOCKED to
`busy` (after the lock wait), CORRUPT or NOTADB or a failed `quick_check` at open to `corrupt`, a constraint the
whole-document check let through to `format` (a change) or `corrupt` (a document read or imported).

Pragmas on every connection: `busy_timeout` (5000 for an open or a restore, 250 for a change: a change runs on the
thread that ticks the rooms, which freeze while it waits), `journal_mode=DELETE`, `synchronous=FULL`, `foreign_keys=ON`. Before
SQLite opens the file it is created if missing and narrowed to `DATA_FILE_MODE` (0600) on POSIX, at every open; the
`-journal` takes the database file's mode, and a backup is still written by `writeAtomic` at 0600 (HARD-FLOOD-2,
research 169 §6.6). A change sets no mode. On Windows no mode is set, as before.

The crash tests: a throw before COMMIT rolls the rows back and the next create gets id 2; a child process killed by
SIGKILL before COMMIT leaves only what was committed (its journal, when its header was never synced, is not hot and
the next change writes over it); killed after COMMIT returned, its account is there; garbage bytes in
`services.sqlite` are refused `corrupt` and left byte for byte; a stray `services.json.tmp` is ignored. A hot journal's
rollback after the database pages were already written (a transaction larger than SQLite's page cache) is not forced
by these tests; the store's changes are a few rows each.

## 4. The import

`open` reads `services.json` only when the database is new (no file, or a file without a `schema_version` table), and
reads it before creating anything, so a damaged one refuses the start with no database left behind. The schema, the
imported rows (or the empty document; an ONL-17 file's `loadouts` on its accounts go into the `loadouts` table), `generation=1`, `imported_sha256` and `imported_at` go in one transaction: the
DDL is transactional, so a crash leaves a schema-less file that the next start imports again. Once a schema exists the
JSON is never read again, even damaged; it is never written, renamed or deleted -- removing it is the operator's, once
the import is checked (deploy/README.md).

## 5. Backup and restore

R131.5 stands: `backup(path)` writes the `s2u-service-backup` v1 format line and the document as JSON, atomically and
0600, from the mirror. `restore` checks the backup exactly as before, then replaces every record row in one transaction
(the database made if missing; `schema_version` and `meta` kept; the loadouts replaced by the backup's, which carries
them on its accounts; children emptied before parents and every reference checked by `foreign_key_check` before COMMIT) and bumps the generation and writes a new instance, so a store
still open gets `stale`, even one opened on an empty directory whose generation equals the new file's. It never writes `services.json`. For a copy of the database itself the deploy README names
`sqlite3 services.sqlite ".backup ..."` while running, or a copy with the server stopped. No automatic backups (there
were none before).

## 6. `node:sqlite` on our Nodes

Unflagged from Node 22.13.0 and 23.4.0 (22.5-22.12 need `--experimental-sqlite`). `open` loads it through
`process.getBuiltinModule` and, when it is missing, throws `Node >= 22.13 needed (node:sqlite)`; `main.ts` logs a store that does not open as one fatal line with
its reason and exits 2 (only with `DATA_DIR` set: without it no store is opened). The engines field
(`>=22`) and the `node:22` / `node:22-slim` images stay as `deployEnv.test.ts` pins them; the floating tags are past
22.13. Node 24.13.1 (this host) still prints `ExperimentalWarning: SQLite is an experimental feature`: the Dockerfile's
CMD and the systemd unit run `node --disable-warning=ExperimentalWarning`. Both esbuild lines mark `node:sqlite`
external (a builtin is external already; a precaution). Only `DatabaseSync`, `exec`, `prepare().run/get/all` and
`close` are used; every id and time is a safe integer.

## 7. What is not done here

- `restore` cannot rebuild a database file SQLite refuses as not a database: move the damaged file aside first.
- **The dated research notes** that name `services.json` (132, 133, 147, 169) are left as they were written; research
  131's header points here.
