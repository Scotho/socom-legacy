# 135 -- The persona records on the virtual card (OPT-04a)

Written 2026-10-02 for OPT-04a (`../roadmap/04-options-memory-card.md` "OPT-04a"; the online-path plan
`../plans/2026-10-02-online-path-target.md`, OT.R6). Sources: PC research 80 (`docs/research/80-persona-card-format.md`
in the desktop tree: the record's sixteen nodes, the examples), PC `docs/KNOWN.md` ([persona-decoded],
[personas-per-server], [persona-headless]), research 102 (the card file codec; R102.9 on the file's size), the R7 spec
(`../specs/2026-10-01-web-r7-account-and-card-design.md` §3, §7 item 5), research 134 (PLAT-26a's libmc), and the
game's decompilation (`D:L<line>`). The code is `packages/card/src/persona.ts`; its tests
`packages/card/test/persona.test.ts` (CI, a card built in the test) and `tools/test/personaReference.test.ts` (dev host:
the fixtures). Confidence: **reading, pending review** for every transcription; the values of §5 are a placeholder and
readings.

## 0. Answers

| # | finding | where | section |
|---|---|---|---|
| R135.1 | **A record is the original's eight fields as JSON, under the module's names**: `{ CAcctDB: { AcctInfo: [record...] } }` in the `BASCUS-97275SOCOMII` file's `data`, each record `HOST, NAME, TOWN, GENDER, PORT, PASSWORD, SAVEPASSWORD, PROFILES { PROFILE_CHECKSUM, PROFILE_INFO }` | PC research 80 step 5 | §1 |
| R135.2 | **PASSWORD is `{ length }`** -- the password's length (cut at 12) under SAVE PASSWORD: YES, 0 under NO -- never the password or the remember token; a record holding any field beyond the eight, or PASSWORD as anything else, is refused as malformed | R7 §7 item 5 | §1 |
| R135.3 | **The save and the load go through libmc in the original's command order**: Mkdir, Delete, Open WRONLY\|CREAT, Write, Close; Open RDONLY, GetDir (one entry, its size), Read, Close | `FUN_0033dff0`, `FUN_0033d6d0`, `FUN_003a05a0` | §3 |
| R135.4 | **The block's nominal sizes hold for the online path's card**: 4,784 / 6,208 / 6,400 B are `virgin`, `one`, `two` -- three cards, the last two holding the ten UI-variable keys a card gains online (R102.9) -- the state of a card after the online path's save. Past two records, a placeholder step | research 102 §5 | §4 |
| R135.5 | **Personas are kept per HOST**: a login of the same HOST and NAME replaces its record where it stands, any other is appended -- with no maximum, a reading (§5); the form shows the first record of its HOST, none when the server has none | PC KNOWN [personas-per-server]; PC research 80 | §2 |

## 1. The record, field by field

PC research 80 step 5: `AcctInfo.rdr`'s root is the persona list; a persona is 16 nodes, name/value pairs. R7 keeps the
fields and their caps (OPT-04's ruling), as JSON:

| field | the original (PC research 80) | here | source of the value |
|---|---|---|---|
| HOST | string: the address the game connected to | string: the server the login connected to, as the caller names it | the login; OC-3 open (§5 `PERSONA_HOST_AS_GIVEN_READING`) |
| NAME | string | string, cut at 14 characters (code points) | the login; cap R7 (OPT-04) |
| TOWN | string, `''` on every card seen | string; a new record `''`, a replaced one keeps its own | `PERSONA_TOWN_READING` |
| GENDER | int, 0 on every card seen | whole number, as the login gives it | the login |
| PORT | int, 10075 on every card seen | whole number; a new record 10075 | `PERSONA_PORT_READING` |
| PASSWORD | string, **plain** | `{ length }`: 0..12 under YES, 0 under NO | R7 §7 item 5; `SAVE_PASSWORD_NO_CLEARS_READING` |
| SAVEPASSWORD | int, 1 on every card seen | 0 or 1, as the player set it | the login |
| PROFILES | list: str `PROFILE_CHECKSUM`, 16 ints, str `PROFILE_INFO`, empty list | `{ PROFILE_CHECKSUM: 16 whole numbers, PROFILE_INFO: [] }`; a new record 16 zeros, a replaced one keeps its own | PC research 80 step 5; the fixtures |

A login by the remember cookie (nothing typed: the keyboard on that row starts empty, R7's accepted deviation) passes
`password: null` and keeps the saved length. The login object is read field by field: a remember token or the typed
password never reaches the record (the test passes both on the login and reads every `setItem` and every log line).

**The reference** (the block: "the one- and two-persona fixtures' field values, read once with the dev tool under
`tools/`"): `tools/cardFile.ts` `readCardFile` over the PC project's `ps2xTest/fixtures/cards/{one,two}.bin`, 2026-10-02:
`one.bin` one record `s27pa`, `two.bin` `s16pc` then `s16pd`; each HOST `<the hosted box>`, TOWN `''`, GENDER 0, PORT 10075,
SAVEPASSWORD 1, a 6-character password, 16 zero checksum words, an empty PROFILE_INFO. Pinned as R7 records in
`packages/card/test/personaReference.ts` (the passwords as lengths: RS.R8, they are credentials); the dev-host test
re-reads the fixtures against it.

## 2. The list

The original's list is in the game's order and the login form shows the first record (PC research 80); personas are
kept per server, keyed by HOST (PC KNOWN [personas-per-server]: a card written under another server's address shows an
empty form). `withPersona` replaces the record of the same HOST and NAME where it stands, else appends -- `two.bin`'s
order is `one`'s record with one appended (PC research 80: "differ by exactly one appended record"). `formPersona(host)`
is the first record of that HOST; `personasFor(host)` its records in order. The list grows without a maximum: no
source gives one (PC research 80, PC KNOWN, research 102 and the R7 spec hold none; no card holds three records), so
that is a named reading, `PERSONA_NO_MAXIMUM_READING` (§5).

## 3. The commands

- **Save** (`PersonaCard.saveLogin`): Mkdir `/BASCUS-97275SOCOMII` (the card script's `Ensure_MC_Dirs`, O18; Mkdir's 0
  or -4 accepted as `FUN_003a0890` accepts them, D:L295490); then as `CSaveManager::Save` (`FUN_0033dff0`,
  D:L239225-239237) through `CMemCardIO`'s open with mode 0x1a: bits 0x10 and 0x08 delete the file first, its result
  synced and ignored (`FUN_003a05a0` D:L295406-295410), then Open with 0x02 -> `O_WRONLY` and 0x08 -> `O_CREAT`
  (D:L295395-295404, D:L295412); one Write of the buffer (vtable +0x2c, D:L239236) -- here the nominal size and the
  JSON -- and Close (vtable +0xc, D:L239237). Delete's result is ignored whatever it is (NoEntry, or DeniedPermit on a
  file held open, research 134's `MC_DELETE_OPEN_FILE_DENIED_READING`): the save goes on to Open. Any other failing
  command's result is the save's; the list in memory is then left as it was.
- **After a malformed load** the save is refused (`PersonaMalformedError`, thrown -- a guard on the API, not a result
  of the original's) until the caller calls `discardMalformed()`: a login never overwrites an unreadable list of
  personas before the caller's "Error loading data" path (OPT-05f) has run.
- **Load** (`PersonaCard.load`): as `CSaveManager::Load` (`FUN_0033d6d0`, D:L238915-238925) with mode 1: Open
  `O_RDONLY`; then GetDir of the path for one entry and its `FileSizeByte` as the file's size (D:L295420-295429); Read
  of that size; Close. Open's NoEntry is no file: no personas. A file whose JSON is not the shape of §1 loads with no
  personas and `malformed` saying why, the commands' result Succeed (the caller's "Error loading data" path, OPT-05f);
  nothing is written by a load.
- The other parts of the file's `data` (the other modules', OPT-01's and OPT-02's) are kept as read and written back
  beside `CAcctDB`, and the parts of `CAcctDB` beside `AcctInfo` (none per PC research 80 step 4) beside `AcctInfo`.

## 4. The file's nominal size

PLAT-25's block and OPT-04a give 4,784 B with no persona, 6,208 with one, 6,400 with two. Research 102 R102.9 found
these are three different cards: `one` and `two` hold the ten 64-byte UI-variable keys (`MPLOCALSOP1-5`,
`MPTAUNTMSG1-5`) a card gains once the game has been online, which `virgin` lacks (`virgin.bin` with one persona is
5,248 B, with two 5,440 B). The online path's save is made after a login, so the original's card then holds those keys:
6,208 and 6,400 are its sizes for one and two personas. The block's table is kept. Two limits: the original's size also
follows the strings' lengths (the rdr's string table, padded to 16), which a nominal size does not; and past two
records there is no card (§5).

## 5. Placeholders and readings

| name | value | why | what settles it |
|---|---|---|---|
| `PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER` | 192 B a record past two | the step from `one.bin` to `two.bin` (6,400 - 6,208); no card holds three records | a card the game writes with three personas |
| `PERSONA_PORT_READING` | 10075 | every card seen holds it (PC research 80's table); what the original writes for another server is not read | a recomp run against a server on another port; OC-3 |
| `PERSONA_TOWN_READING` | `''` | every card seen; no screen of the path sets it | `dlgNetPlayerName`'s read (ONL-06) |
| `SAVE_PASSWORD_NO_CLEARS_READING` | true: PASSWORD `{ length: 0 }` under NO | R7 §2 "stores no password", §3 "empty otherwise"; the original's write under NO (an empty string or no change) is OPT-04's open unknown | a recomp run on the local stack logging in with NO (ONL-32) |
| `PERSONA_SAME_LOGIN_REPLACES_IN_PLACE_READING` | true | the examples show an append only; a move to the front on use, or a name compared without case, is not read | a recomp run logging in with the second of two personas |
| `PERSONA_NO_MAXIMUM_READING` | true: a new HOST and NAME is always appended | no source gives a cap (PC research 80, PC KNOWN, research 102, the R7 spec); no card holds three records; the original may bound the list (drop the oldest, refuse a third). The `AcctInfo.rdr` loader is not read: `CSaveManager::Load` finds the module by name (`FUN_0033d370`, D:L238791-238809, called at D:L238939) and loads it through its vtable | a read of that module's load (the list's container), or a recomp run logging in a third and a fourth persona on one card |
| `PERSONA_HOST_AS_GIVEN_READING` | true: HOST is the caller's string, compared exactly | the original stores the resolved address; a page cannot resolve a name; OC-3 (the owner's) is open, OT.R3 is a reading for it | OC-3's ruling |

## 6. What is not done, and where the sources disagree

- ~~**The MP name's migration** (`s2u.mp.name`, the block's gap; `migrateOnce`, PLAT-24) is **not done**: `migrateOnce`
  writes a `ByteStore` (`StoreOp`s in one transaction), and the card is PLAT-25's `CardSlots`, not a `ByteStore`; and
  the old key holds a name only -- a record needs the HOST and the SAVE PASSWORD answer the original takes at a login,
  so a record made from it would be invented (MISSION's parity rule). Owed to ONL-06 (where the name keyboard can be
  seeded from it) or a ruling.~~ *(Struck 2026-10-09, OPT-04: done -- research 229 §5. The run writes the card slot's
  `ext` (`CardExtStore`); the record is made at the form, with the universe's HOST and PORT, as `UpdateAcctInfo`
  appends one, SAVEPASSWORD 0 under OT.R17; the old key stays, W6.R5.)*
  > 2026-10-04, ONL-06 (research 153 §7): still not done -- the keyboard has no initial-text argument (research 119
  > R119.3), so seeding it from the old key would be invented; what becomes of `s2u.mp.name` is the owner's.
- **The size table** (§4): the block's "by persona count" is kept; R102.9's caveat is that it is a count of personas
  on a card that has been online, not of personas alone.
- **The whole options save** stays OPT-01's (OT.R8): the original writes this module inside its save of twelve files;
  this slice writes the one file. What the original's save after connect writes besides the persona module on a card
  holding no options yet is the block's second unknown (PLAT-36's trace).
- **No composition root** builds a `PersonaCard` yet (ONL-06 and ONL-07 are its callers). ONL-07 calls `saveLogin`
  only after a load; on a malformed load it must run OPT-05f's "Error loading data" path and `discardMalformed()`
  first, or `saveLogin` throws (§3).
  > 2026-10-04, ONL-06 (research 153 §5): `packages/viewer/src/personaHost.ts` is that root, on the session
  > (`FrontEndSession.persona`): it loads slot 1's personas when the session is made and writes them through
  > `SaveConfig` with `PersonaCard`'s new `setLogins` / `contents` / `restore` -- no password under OT.R17.
- **What ONL-06's read of the game's account list settles** (added 2026-10-04; research 153 R153.1-R153.3; the §5 rows'
  names stay the code's): the list is keyed by HOST, PORT and NAME, each compared exactly, and a login of a held one
  rewrites its record where it stands (the in-place reading holds; a name in another case is another persona); nothing
  bounds the list, and the form offers no fourth persona for a server (the no-maximum reading holds for the list); under
  SAVE PASSWORD: NO the original leaves a held record's password as it stands and a new one's empty (the "no change"
  half of the NO question -- R7's record under NO stays as ruled); the hometown is the form's HOMETOWN row (20
  characters, 63 bytes); the port is the universe entry's, not a constant.

**2026-10-04 (C8-FIX, from `C8-card-online-services.md` (research wave 2026-10-04; held outside the tree, at the controller's) #14).** `withPersona` now matches HOST, **PORT** and NAME, the account list's key
(`FUN_002fbce0` D:L199060-199062); it had omitted PORT, so two logins differing only in port were one record. `saveLogin`
finds the record it keeps TOWN, PASSWORD and PROFILES from the same way (a login naming no port finds it by HOST and NAME
and keeps that PORT, as `setLogins` already did). **Saved lists:** the key is not stored and every record in a file is
read, so no migration is needed: a list an older build wrote (one record per HOST and NAME) loads whole and its records
stay; only a later save of another port is now appended rather than replacing.
