# 99 -- The simulated card store: the storage interface, the card versus the page's settings, the keys (web sprint 6)

Written 2026-10-01 for web sprint 6 (plan `../plans/2026-10-01-web-sprint-6-foundations.md`, rulings W6.R2, W6.R5,
W6.R6), task **PLAT-24** (`../roadmap/01-platform.md`, section E). This note is the card stream's (W6.R6): PLAT-24's
sections are §0-§6; PLAT-25's is §7 (PLAT-27's codec is research 102).
Sources: the owner's mission and its ruling **R4** (`../MISSION.md`), the PLAT-24/25/26/37 blocks, segment 04's facts
O1-O22 and its OPT-01, OPT-03, OPT-04, OPT-07, OPT-08 and OPT-20 blocks (`../roadmap/04-options-memory-card.md`), the
viewer's sources at the commit that lands this note, and the browsers' documented storage limits where marked.

> **Rewritten to R7, 2026-10-01 (PLAT-25).** The owner's ruling **R7** (`../specs/2026-10-01-web-r7-account-and-card-design.md`,
> with its §7 amendments) replaced R4: the card is **two virtual slots in localStorage**, one JSON record per slot, in
> redotcom's own format -- no `.ps2` images, no import or export. What this note said under R4 is kept where it was,
> struck through or marked *(R4; changed 2026-10-01 by R7)* with what replaced it; the slot store itself is §7. Its
> sources add the R7 spec, the recomp's libmc stub (`C:/Projects/socom_pc`,
> `third_party/ps2recomp/ps2xRuntime/src/lib/Kernel/Stubs/MemoryCard.cpp`), PC KNOWN's card rows (`docs/KNOWN.md` L72
> [card-folder], L108 [virgin-save]) and one browser run (§7.8, the abandoned R4 branch's probe).

## 0. Answers

| # | finding | consequence | section |
|---|---|---|---|
| R99.1 | ~~The card stands on **`ByteStore`**~~ *(R4; changed 2026-10-01 by R7: the card stands on `CardSlots`, R99.9)*. **`ByteStore`** (`packages/card/src/store.ts`): named `Uint8Array` values, asynchronous -- `get`, `read`, `readMany` (several keys in one transaction), `keys`, `put`, `delete`, an atomic `write` batch with optional preconditions checked in its own transaction, and `estimate`. Two backends: `IdbStore` (IndexedDB) and `MemoryStore` (tests, with injected faults and a quota) | ~~PLAT-25 builds the two slots on it~~ (R4). Under R7 it is **parked** (amendment 4): kept, tested, unused by the card, for expansion data that outgrows localStorage; `migrateOnce` still writes through it | §1, §7.7 |
| R99.2 | **A store that cannot be read reads as an empty card** (`get`/`keys` never reject); **a write that fails rejects with a typed `StoreError`** (`quota`, `unavailable`, `failed`, `conflict`; the operation; the key) -- never dropped; the bytes written are the bytes at the call | the original's "Error saving" (OPT-05f, PLAT-26) has a typed failure to map from; the ARMORY's dropped profile write (`armory.ts`) is the contrast, retired by OPT-20 | §1.2 |
| R99.3 | The page's own keys go through **`Settings`** (`packages/card/src/settings.ts`): synchronous, guarded, on the browser's key-value storage; a failed write is handed to a report the composition root must give and is returned as a `WriteResult` | `packages/viewer/src/pageStore.ts` is the one place the viewer names `localStorage`, `sessionStorage` and `indexedDB` | §1.3 |
| R99.4 | **The card holds what the game writes to its card; the page's settings hold what the page added that the game does not have.** ~~Nothing the game would read back from its card lives outside the slot image (it would not export to PCSX2, R4)~~ *(R4; changed 2026-10-01 by R7: there is no image and no export; what the game writes is a file in the slot's table, and what SOCOM Legacy saves that the original never did, if it belongs to a card, goes to the slot's `ext`)* | the rule; of the six questions, two are closed by R7 and four stay open | §2 |
| R99.5 | **The page's keys migrate in place** (W6.R5): all twelve are per-viewer conveniences (R4: these stay on localStorage), so the settings path reads each under the name it always had -- nothing copied, nothing removed, nothing to import twice | `migrateOnce` (run once, the old key left in place, the value and the run's mark in one transaction, conditional on no other tab having run) is built and tested for the two keys that **do** change home, OPT-04's and OPT-20's | §3 |
| R99.8 | **Two tabs could both import** when the run's mark was read in one transaction and written in another (the PLAT-24 review): the later tab wrote the old value over the first tab's newer state. The write is now conditional on the mark's absence inside its own transaction; the loser reports `already` | `ByteStore.write(ops, when)`: PLAT-25's pointer swap uses the same precondition ("the pointer is still the generation I read") | §1.2, §3 |
| R99.6 | Fifteen storage uses in the viewer: 12 page keys (in place), the MP name (OPT-04), the ARMORY profile (OPT-20), the tab's session token (stays) -- plus one retired key never read | the table | §4 |
| R99.7 | *(R4; superseded 2026-10-01 by R7, kept as the record of the design dropped)* Two slots are **17,301,504 B**; a whole-image import in flight makes **25,952,256 B**; a save that touches *k* erase blocks adds *k* x 8,448 B. localStorage (about 5 MiB of strings per origin) could not hold one image | measured in real Chromium 153: the `.ps2` design fitted (§7.8); it was dropped for scope, not capacity | §5, §7.8 |
| R99.9 | **The card is two virtual slots on localStorage** (`packages/card/src/cardSlots.ts`, `CardSlots`): one versioned JSON record per slot under `s2u.card.v1.slot1` / `slot2` -- the card's state, its file table (the original's names and nominal sizes, our JSON as contents), its folders, `ext` and a revision. A missing key is an inserted, formatted, empty card (KNOWN [card-folder]) | the page builds it on its `localStorage` (`pageStore.ts` `pageCard`); PLAT-26's libmc runs over its file table | §7.1 |
| R99.10 | **Free space is the virtual card's, by the stub's rule**: 8000 clusters of 1 KB (`MemoryCard.cpp:47-48`), less **one per folder** and each file's nominal size rounded up (`mcUsedClusters`, :245-288). The options save's 12 files take 2,992 clusters, 2,993 with their folder -- not the "3020 KB" the PLAT-25 block quotes (that is the host's 4 KB blocks) | "At least 3000KB is needed" means what it meant; a write whose growth does not fit is refused whole as `full` | §7.2 |
| R99.11 | **A save is one `setItem` of the whole record**; one that throws writes nothing and is reported (`StoreError`, PLAT-24's kinds). **Every save moves `rev`; a save carrying a revision the record no longer has is refused whole as `changed`** -- any save to the slot since the read, `ext` included, from another tab or this one (§7.9); the original's ChangedCard. The check and the write are one synchronous step; between tabs a window remains (§7.6) | PLAT-26 maps `changed` to -1, `full` to -3, `write-failed` to the failure the original reports | §7.6 |
| R99.12 | **Every card state is reachable**: no card (pulled out; its files kept), unformatted (its files wiped, as the stub's Unformat), formatted; a corrupt record is a **damaged** save, never reset by a read, and only `format` replaces it; **no storage reads as no card** in both slots (the controller's default, the owner may overturn it) | OPT-07's control and OPT-05's screens stand on these | §7.3-§7.5 |

## 1. The interface, and why it has this shape

### 1.1 What its users need

| user | needs | so the interface has |
|---|---|---|
| PLAT-25, the slot store | two 8,650,752-B images, kept as erase-block chunks (16 x 528 B) under a generation; an interrupted write leaving the old image; a quota check before a growing write; a reload reading the same image; another tab on the same card | binary values (`Uint8Array`, **copied at the call**, so a working image the slot store keeps changing cannot leak into a generation after its swap); `keys(prefix)` to find a generation's chunks; **`write(ops, when)` applying puts and deletes in one transaction** (the swap) **only if its preconditions hold in that transaction** (the pointer still the generation read: two tabs cannot both swap from it); **`readMany(keys)`**: the pointer and up to 1,024 chunks in one transaction, so a reader cannot assemble a torn image across another tab's swap and cleanup (one transaction per load, not 1,025); `estimate()`; a reload is a new `IdbStore` on the same database |
| PLAT-26 / OPT-05f, libmc and the card dialogs | a failed write reaches the game as the libmc failure the original reports, the player sees "Error saving" | `StoreError.kind`: `quota` (to -3 FullDevice), `unavailable`, `failed`, `conflict` (another tab moved the card under this one) -- the mapping is PLAT-26's |
| OPT-07, the card outside the game | an open call on what a browser without storage reads as | `IdbStore` with no factory, or one whose opening fails, reads empty and refuses writes as `unavailable`: either answer OPT-07 picks can be built on it |
| OPT-01, the options save | writes the card exactly as the game does, through PLAT-26 and PLAT-37 | nothing directly: it reaches the store through the slot store; the store is format-blind |
| the page's settings | synchronous reads at start-up (`main.ts` reads the Mode, Online and the rules before the first frame), small strings, a private window that throws | **a separate synchronous path** (`Settings`), not the async store: making them async would reorder the page's start |
| OPT-04, OPT-20 | move `s2u.mp.name` and `s2u.armory.v1.*` onto the card, once | `migrateOnce` (§3) |

*(Changed 2026-10-01 by R7.)* The table is R4's. Under R7 the PLAT-25 row's needs (two 8,650,752-B images, chunks,
generations, a pointer swap) are gone: a slot is one small JSON record written by one synchronous `setItem` (§7). The
PLAT-26 row's typed failures are `CardSlots`' outcomes, which reuse `StoreError` for a refused `setItem` (§7.9). OPT-07's
open call is closed: no storage reads as no card (§7.5). OPT-01 reaches the card through PLAT-26 over the slot's file
table, not PLAT-37 (dropped). The settings row and `migrateOnce` stand; a migration whose new home is a slot file is
OPT-04's and OPT-20's to write against `CardSlots` (`migrateOnce` is typed on `ByteStore` today).

### 1.2 The promises (`ByteStore`)

- **Reads absorb failure.** `get` and `keys` resolve to nothing there whenever the store cannot be read: no IndexedDB
  (a private window that refuses it), an opening that throws (`SecurityError`) or errors (a database at a newer version
  than this code: `VersionError`), a transaction that throws (the database without its object store), or a value of the
  wrong type. The failure goes to the backend's `report`; `read` returns it for a caller that must tell "nothing" from
  "could not look". An absent card is PLAT-25's to turn into a freshly formatted empty card (KNOWN [card-folder]).
- **Writes never fail silently.** `put`, `delete` and `write` reject with a `StoreError` whose `cause` is the browser's
  error. An awaited write throws; a forgotten one is an unhandled rejection the runtime reports. A batch is all or
  nothing: a bad op (a key not a string, a value not bytes, a detached buffer) is refused before the transaction
  starts, and an op that throws inside it aborts the transaction (tested by an injected throw on the third op). A
  write **settles only when its transaction ends** -- `complete`, or `abort` for a refusal, a failed request or a
  failure at commit (the quota) -- never when its requests are issued (a mutant that resolved early is caught by the
  test whose request fails after it is issued).
- **The bytes are the bytes at the call.** `prepareBatch` checks and copies every value (and every precondition's
  bytes) synchronously, before the first `await`. The first version copied them after `await this.open()`, so a caller
  who changed its array before the write settled stored the changed bytes (the PLAT-24 review's blocking finding,
  reproduced on fake-indexeddb: `[0,0,0,0]` stored for `[1,2,3,4]`); the shared contract now changes the array before
  awaiting, on both backends.
- **Conditional writes.** `write(ops, when)` takes preconditions -- a key `absent`, or a key that `equals` given
  bytes -- read in the write's own `readwrite` transaction before any op is issued; if one fails, the transaction is
  aborted and the call rejects with kind `conflict` naming that key, the store as it was. A precondition read in a
  separate transaction would leave the window §3's two-tab finding fell through.
- **Consistent reads of several keys.** `readMany(keys)` issues every `get` in one `readonly` transaction. IndexedDB
  runs a `readonly` transaction after any overlapping `readwrite` one created before it and before any created after
  it, so a batch written beside the read is seen whole or not at all (the contract test runs a read and a batch side by
  side four times; a mutant reading key by key sees `1,2`).
- **Opening is bounded, retried, and owns its connection.** An opening that does not end -- held up, for instance, by
  a pending `deleteDatabase` that another connection blocks, where no `blocked` event reaches this request -- is given
  up after `OPEN_TIMEOUT_MS` (10 s, chosen; the timer is injected, `openTimer`) and the call rejects `unavailable`. A
  failed opening is forgotten, so the next call tries again. Only the current connection's `close` and `versionchange`
  handlers may drop it (an older connection's late event changes nothing), and a connection that arrives after its
  opening was given up, or after `close()`, is closed at once rather than leaked. A schema change by another tab
  (`versionchange`) closes this connection and the next call reopens.

Kinds (`classifyFailure`), by the error's `name` and, for the quota, its legacy `code`: `QuotaExceededError`,
`NS_ERROR_DOM_QUOTA_REACHED`, code 22 (`QUOTA_EXCEEDED_ERR`, WebIDL's legacy code, thrown by old Safari) or code 1014
(Firefox's legacy quota error; MDN's `storageAvailable` tests both codes) -> `quota`; `SecurityError`,
`InvalidStateError`, `VersionError` -> `unavailable`; anything else -> `failed`. `conflict` comes only from a
precondition that does not hold; a precondition key holding something that is not bytes is `failed` (corruption,
not another tab), in both backends.

### 1.3 The settings path (`Settings`)

A getter for the storage (`() => localStorage`), asked at each call -- reaching `localStorage` itself throws in some
browsers, and a test swaps it. `get` reads null on any failure; `set` and `remove` return `{ ok: true }` or
`{ ok: false, error }` and hand the error to the report, which the constructor requires: no instance can be built
that drops a failure. The viewer's report (`reportOnce`) warns once per page at the first failure and counts the rest,
so a private window gets one console line, not one per slider step.

## 2. The rule: what lives on the card, what in the page's settings

**The rule** *(R4's wording struck; R7's, 2026-10-01, after it).* ~~*A value the original game writes to its memory
card lives on the simulated card -- inside the slot's `.ps2` image, in the game's own file -- and nowhere else. A
value the page added, that the original has no counterpart for on its card, is a page setting. The typed account
password lives nowhere.*~~

*A value the original game writes to its memory card lives on the virtual card -- a file in the slot's table, under the
game's own name and nominal size -- and nowhere else. A value SOCOM Legacy saves that the original never did is either a
page setting (a convenience of this browser, the twelve keys of §4) or, when it belongs with a card (it should follow
the card, not the browser), an entry in that slot's `ext`, which no card screen shows and which takes no free space
(R7 amendment 2). Where SAVE PASSWORD: YES keeps the password is re-opened by the owner (R7 amendment 5); until he
rules, none is stored.*

Why, from the sources:

1. ~~R4 makes each slot a raw PCSX2 `.ps2` image **so that real cards import and export** (OPT-08). A value kept beside
   the image does not travel with an export; a value the game would read back from its card must therefore be in the
   image, or an exported card loads differently in PCSX2 than in the page.~~ *(R4; changed by R7: there is no image,
   no import and no export (R7 §1 q3). The card's table holds what the game reads back so that every card screen sees
   the card the console saw (R7 §3); `ext` keeps redotcom's own saves out of that table so they never show on it.)*
2. R4 / the PLAT-24 block: "localStorage stays only for per-viewer conveniences such as a remembered tab". The page's
   conveniences are of this browser, not of a card: they do not move with an export, and a second card in slot 2 does
   not change them.
3. ~~R4 / OPT-04: the typed password is never persisted in the browser, on the card or anywhere else; the card's
   `PASSWORD` field holds the server-issued credential.~~ *(R4; changed by R7: no server-issued credential. R7 §2 put
   an obfuscated password in the persona record for SAVE PASSWORD: YES; amendment 5 re-opened it, so for now no
   password is stored.)*
4. What the game writes is segment 04's: the options save's 12 files (O12, OPT-01), the 65 persistent valves (O15,
   OPT-02), longevity-3 UI vars only (O16, OPT-03), the personas (OPT-04), `WeapProfile_%d.dat` (O22, OPT-20). What it
   does **not** write stays off the card even when the page has an equivalent: the volume, brightness and stick
   sliders are longevity 2 and in no saved file by the source reading (O15, O16) -- OPT-03 settles it by a run, and
   "no persistence is invented".

**Settled by the rule:** the Mode (`recom`), the picture (`look`), the panel (`panelOpen`), the controls' tab
(`controlsTab`), the phone's tip (`mobileTipDismissed`, `mobileTipSeen`), the rules (`rules`; retired by the owner's
ruling, read only while respawn is offered), the last Explore map (`lastMap`; the viewer's map, not the lobby's
`GameTypeMapIndex` filter valve) -- **page settings**. The MP name -- **the card** (OPT-04, the persona's NAME). The
ARMORY profile -- **the card** (OPT-20). The tab's session token (`s2u.session:<origin>`) -- **neither**: the
server's per-tab credential, sessionStorage.

**Not settled -- owner questions** (the sources do not decide; nothing here picks by taste):

| # | key | the question | why the sources do not settle it |
|---|---|---|---|
| Q99.1 | `s2u.viewer.volume`, `s2u.viewer.muted` | When the OPTIONS screen exists, is the page's volume the game's MUSIC/SOUND/DIALOG VOLUME (then, by O15/O16, not persisted at all if OPT-03's run agrees) or a page convenience kept beside it? | the page's slider predates the mission; the original has three volumes and no mute; OPT-03 is open. **Open under R7** (R7 adds a third home, the slot's `ext`, and does not choose) |
| Q99.2 | `s2u.viewer.mouseLook` `invertPitch` | Is the page's invert pitch the game's `INVERT_PITCH` valve (persisted on the card, O15) or the mouse's own? | the original has one INVERT_PITCH for the pad; the page's applies to the mouse. **Open under R7** |
| Q99.3 | `s2u.viewer.mouseLook` `sensitivity`, `pitchRatio` | Page settings (the PS2 had no mouse), or tied to the game's `STICK_SENSITIVITY` (longevity 2, not saved)? | no counterpart for a mouse in the original. **Open under R7** (were they to follow the card, `ext` is where they would go) |
| Q99.4 | `s2u.viewer.online` | Once personas exist, is the Online choice (shared / local / a URL) the persona's HOST? | OPT-04's own open owner call ("the HOST value the browser writes"). **Open under R7** (R7 §3 keeps HOST in the persona record and does not say what the browser writes there) |
| Q99.5 | (all page keys) | Should a card **import** (OPT-08) ever change a page setting? By the rule, no. | stated so the owner can overturn it. **Closed by R7** (2026-10-01): there is no import (R7 §1 q3; OPT-08 dropped) |
| Q99.6 | (a browser without storage) | What a private window reads as -- OPT-07's open call | not this task's; the interface supports either answer (§1.1). **Closed by R7 §3** (2026-10-01): **both slots read as no card** -- the controller's default, which the owner may overturn; built in §7.5 |

## 3. The migration (W6.R5)

**The owner's ruling** (2026-10-01, "migrate"): an existing localStorage key is read once into the new interface and
left in place.

**For the page's twelve keys** (§4), the new interface's home *is* the old key: they are page settings by §2's rule,
and R4 keeps per-viewer conveniences on localStorage. The settings path therefore reads and writes each under the
name it always had. That is the least destructive migration there is: what a visitor stored is what the page reads
(present), nothing there reads as before (absent), a value the page never wrote is handed to the reader that always
judged it (malformed: `playOn` is `=== '1'`, `wantedArchive` skips an empty map, `onLookControls` falls back on bad
JSON -- unchanged), a storage that throws reads as nothing and a write is reported (throwing), the old key is never
moved or removed (left in place), and a later load reads the newest write because there is only one copy (run once).
Pinned in `packages/viewer/test/pageStore.test.ts`. Renaming them into a new namespace would have bought nothing and
broken what reads them by name: the viewer's unit tests, six Playwright specs that seed or read them
(`packages/viewer/e2e/`: multiplayer, online, playersOnline, settings, share, touch), `playwright.config.ts`, `tools/release-sweep.ts` and `tools/entry-links.ts`.

**For a key that changes home** -- OPT-04's `s2u.mp.name` and OPT-20's `s2u.armory.v1.*`, whose moves those tasks own
-- `migrateOnce(legacy, store, migration)` (`packages/card/src/migrate.ts`):

| the old key | outcome | the store | the run |
|---|---|---|---|
| present, parses | `imported` | the value's ops and the run's mark, **one transaction** | spent |
| absent | `absent` | the mark only | spent (a key an old tab writes later is not imported) |
| present, malformed (`parse` -> undefined, or `parse` throws) | `malformed` | the mark only | spent |
| present, parses, but the migration's `ops` throws (a bug in the migration, not bad data) | `broken`, carrying the error | nothing | not spent: the fixed code imports at a later load |
| the old storage throws | `unreadable` | nothing | not spent: the next load tries |
| the store refuses the write | `failed` | nothing (the batch is whole) | not spent |
| the mark cannot be read | `failed` | nothing (it might be over newer state) | not spent |
| the mark is there | `already` | nothing read, nothing written | -- |
| the mark appeared after it was read (another tab ran meanwhile) | `already` | nothing: the write's precondition (mark absent) failed in its own transaction | -- |

**The two-tab finding** (the PLAT-24 review). The first version read the mark in one transaction and wrote the value
and the mark in another. Tab B reads the mark (absent) and stalls; tab A imports and its player renames; tab B then
writes the old value and the mark -- both report `imported`, and the rename is lost. The write is now conditional on
the mark's absence, checked inside the write's transaction; B's write is refused as a `conflict` and B reports
`already`. Pinned with two `IdbStore`s on one fake-indexeddb database, B's write held at a gate. A throwing `parse`
(`JSON.parse` of `{bad`) used to reject the whole call, mark nothing, and throw again at every load; it is `malformed`.

The old key is never written or removed in any row. Pinned in `packages/card/test/migrate.test.ts` on a stand-in key
shaped like the MP name.

## 4. The inventory: every storage use in the viewer

At this note's commit (`packages/viewer/src/`; the PLAT-24 block's line numbers were sprint 5's).

| key | storage | file:line (read / write) | disposition | why |
|---|---|---|---|---|
| `s2u.viewer.recom` (`PLAY_KEY`) | local | `features.ts:21` / `:24` | in place, settings path | the Mode: a page convenience (§2) |
| `s2u.viewer.online` (`ONLINE_KEY`) | local | `online.ts:108` / `:111` | in place, settings path | page; Q99.4 |
| `s2u.viewer.rules` (`RULES_KEY`) | local | `rules.ts:39` / none | in place, settings path | page; read only while respawn is offered |
| `s2u.viewer.controlsTab` (`CONTROLS_TAB_KEY`) | local | `ui.ts:469` / `:431` | in place, settings path | the block's own example of a convenience |
| `s2u.viewer.panelOpen` | local | `ui.ts:354` / `:358` | in place, settings path | page |
| `s2u.viewer.look` | local | `ui.ts:576` / `:569` | in place, settings path | page (no counterpart in the original) |
| `s2u.viewer.volume` | local | `ui.ts:682-683` / `:688` | in place, settings path | page for now; Q99.1 |
| `s2u.viewer.muted` | local | `ui.ts:684` / `:692` | in place, settings path | page for now; Q99.1 |
| `s2u.viewer.mouseLook` | local | `ui.ts:716` / `:729` | in place, settings path | page for now; Q99.2, Q99.3 |
| `s2u.viewer.lastMap` (`LAST_MAP_KEY`) | local | `main.ts:1672` / `:1683` (`pageStore.ts` `readLastMap`, `writeLastMap`) | in place, settings path | page |
| `s2u.viewer.mobileTipDismissed` | local | `mobileTip.ts:45` / `:77` (`main.ts:1574`) | in place, settings path | page |
| `s2u.viewer.mobileTipSeen` | session | `mobileTip.ts:61` / `:63` (`main.ts:1574`) | in place, settings path (`tabSettings`) | the tab's visit |
| `s2u.mp.name` | local | `main.ts:1122` / `:1132` | **left for OPT-04** | the persona's NAME (OPT-04 retires the key) |
| `s2u.armory.v1.<MAP>.<side>` | local | `main.ts:302`, `:2412`; `armory.ts:220` / `armory.ts:309-310` (via `mobileTip.ts` `storeOf`) | **left for OPT-20** | `WeapProfile_%d.dat` (OPT-20 retires the key); sprint 5's code untouched |
| `s2u.session:<origin>` | session | `net/session.ts:50` (its own guarded, injected getter) | stays | the server's per-tab token, not a setting |
| `s2u.viewer.panelCollapsed` | local | none (`ui.ts:1019`'s comment) | retired before this task, never read, left in place | its meaning inverted when the panel's default changed; `features.test.ts` pins that it opens nothing |

Outside the viewer: the landing site (`../landing/src/main.ts`, `home.ts`: `s2u:muted`, `s2u:volume`,
`s2u:home-sound`) is another page with its own keys, out of this task. `pageStore.test.ts` holds the viewer to the
table: every `s2u.viewer.*` literal in its sources is in `PAGE_SETTING_KEYS`, and no source but `pageStore.ts` names
the browser's storages, the OPT-04/OPT-20 lines and `net/session.ts` aside.

## 5. Quota: what can be said without a browser run

*(R4; superseded 2026-10-01 by R7, kept as the record of the dropped design. Under R7 the card's free space is the
virtual card's (§7.2) and a slot is one JSON record on localStorage, as large as its files' data, not their nominal
sizes; the one browser measurement of the R4
design is §7.8.)*

- **The card's size** (PLAT-25's block, mymcplus L42-44, L598): one image 16,384 x 528 = **8,650,752 B**; an erase
  block 16 x 528 = **8,448 B**, 1,024 of them per image. Two slots: **17,301,504 B**. PLAT-25's atomic write keeps the
  old generation until the swap, so the peak is the two slots plus what is in flight: a whole-image import (OPT-08) or
  a fresh format, **25,952,256 B**; a save touching *k* erase blocks, 17,301,504 + *k* x 8,448 B. IndexedDB's own
  per-record overhead is the browser's and is in the measurement.
- **localStorage could not hold it**: the browsers allow about 5 MiB of strings per origin, and an image in base64 is
  11,534,336 characters. One of R4's reasons, stated with numbers.
- **IndexedDB's quota is the browser's, not ours**: per the browsers' documentation (MDN, "Storage quotas and eviction
  criteria"; not measured here) best-effort storage is a share of the disk measured in gigabytes on a desktop, and is
  evicted least-recently-used under storage pressure unless the origin was granted persistence
  (`navigator.storage.persist()`). Safari is documented to clear script-written storage of a site not visited for
  seven days of browser use (WebKit's tracking prevention), which for a card is a loss of saves: PLAT-25's
  measurement should record it, and asking for persistence (PLAT-25's unknown) is where it would be answered.
- **`estimate()` is approximate by design** (the browsers pad it): a quota check against it is a guard against an
  obviously too-large write, not an exact free-space count. The original's own free space (8000 on the recomp's stub,
  8,135 allocatable clusters on a formatted image) is PLAT-26's and lives inside the image, not in the browser quota.

## 6. Placeholders and readings

None. PLAT-24 reproduces nothing of the original: its constants (`CARD_DB_NAME` `s2u.card`, `CARD_DB_VERSION` 1,
`CARD_DB_STORE` `kv`, `OPEN_TIMEOUT_MS` 10,000, the mark's `migrated/` prefix) are ordinary code. The browser limits in §5 are documentation,
marked so; the one measurement is §7.8.

*(Added 2026-10-01, PLAT-25 under R7; one reading added at its review round, the same day.)* `CARD_TOTAL_CLUSTERS`
(8000) and `CARD_CLUSTER_BYTES` (1024) are read from the stub (`MemoryCard.cpp:47-48`) and the used-cluster rule from
its lines (:245-288, :1677-1680); the slot keys (`CARD_SLOT_KEYS`), the record's version (1) and the record's shape are
ordinary code, R7 §3's. `EXT_NAMESPACE_MAX_CHARS` and `EXT_TOTAL_MAX_CHARS` are a budget the controller ruled, not a
fact about the original (§7.11). One constant stands in for a fact read only from a third party:

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `CARD_NAMES_CASE_SENSITIVE_READING` (`packages/card/src/cardSlots.ts`) | `true` | whether the PS2 card filesystem tells `SaveGame0` from `savegame0`: read from mymcplus (`ps2mc.py` L1156 compares an entry's name byte for byte; L1749 matches a pattern with `fnmatchcase`), not from Sony's card driver (§7.12) | the PS2's own `mcman` read, or a PCSX2 run that writes two names differing in case |

## 7. The slot store under R7 (PLAT-25, 2026-10-01)

`packages/card/src/cardSlots.ts` (`CardSlots`, `CardSlot`); tests `packages/card/test/cardSlots.test.ts`; the page's
instance `pageCard` in `packages/viewer/src/pageStore.ts`, built on `() => globalThis.localStorage` and the page's report.

### 7.1 The record

One key per slot, `s2u.card.v1.slot1` and `s2u.card.v1.slot2`, each holding one JSON record:

| field | meaning | source |
|---|---|---|
| `v` | 1; any other value is a damaged record (§7.4) | R7 §3 |
| `rev` | a whole number; 0 for a missing key, and every successful save adds one | R7 amendment 3 |
| `present` | false: no card in the slot (pulled out; its files kept) | R7 §3 |
| `formatted` | false: an unformatted card, which holds no entries | R7 §3; the stub's Unformat (§7.3) |
| `files` | path -> `{ size, mtime, data }`: the nominal size in bytes (the original's), ms since the epoch, our JSON | R7 §3 |
| `dirs` | path -> `{ mtime }`: the card's folders | **this module's addition** (below) |
| `ext` | namespace -> our JSON: what SOCOM Legacy saves that the original never did | R7 amendment 2 |

**`dirs` is not in the spec's record.** The stub counts a folder as one cluster and lists it (`MemoryCard.cpp:262-266`),
the game makes its folder before writing into it (Mkdir), and libmc's Delete of a non-empty folder answers NotEmpty
(-6); a table keyed by file path alone cannot hold an empty folder, cost it or list it. The spec's `files` stays as
written; `dirs` sits beside it. A path is the original's, from the card's root, segments joined by `/`
(`BASCUS-97275SOCOMII/SaveGame0`); no empty, `.` or `..` segment, no backslash, no C0 control character (0x00-0x1f) and
*(review round, 2026-10-01)* no DEL (0x7f) either: DEL is ASCII's other control character, the original's names are
printable ASCII (the save's twelve), and nothing on a card needs it. The stub refuses `:` and a name ending in a space
or a dot (`isSafeMcPathComponent`, :750-758, guarding its Windows host) and resolves `.`, `..`, `mc0:` and the current
folder (:395-465); those are PLAT-26's, which hands this module the resolved path. Names are compared case-sensitively
(§7.12). A file's folder must exist.

**A missing key is a fresh card**: inserted, formatted, empty, `rev` 0 -- an empty or missing card folder is an
inserted, formatted, empty card (PC KNOWN L72 [card-folder]; the stub's GetInfo, `MemoryCard.cpp:1195-1206`). Reading
it writes nothing: the key appears at the slot's first save.

**`ext`** has its own small API -- `getExt(namespace)`, `setExt(namespace, value, rev)` (`undefined` clears),
`extNames()` -- so later features never reach into `files`. It is not a file on the card: no listing shows it, it
takes no free space, and it can be read and written while the card is out or unformatted. A `setExt` is a save like
any other: it checks and moves `rev`. Values (and file `data`) are copied through JSON at the call; a value JSON
cannot hold (`undefined` as file data, a function, a cycle, a BigInt) is refused as `invalid`, nothing written.
*(Review round, 2026-10-01.)* `ext` is capped -- one namespace at `EXT_NAMESPACE_MAX_CHARS`, the whole at
`EXT_TOTAL_MAX_CHARS` -- and a larger value is refused as `too-large` (`scope`, `limit`, `size`), not attempted (§7.11).

### 7.2 Free space: the virtual card, by the stub's rule

The free figure is counted against the virtual 8 MB card, never against the browser's quota:

- **Total**: 8000 clusters of 1,024 B (`kMcTotalClusters`, `kMcClusterBytes`, `MemoryCard.cpp:47-48`). An empty card
  answers 8000 -- the stub's `[MC] GetInfo port=0 type=2 free=8000 format=1` on an empty folder (KNOWN L72).
- **Used** (`mcUsedClusters`, :245-288): **one cluster per folder** (:262-266), each file's size rounded up to whole
  clusters (:280; a 0-byte file takes none), never more than 8000 (:281-287). The root itself is not counted (the walk
  lists its children). **The brief's sentence ("falls by each file's nominal size rounded up to 1 KB clusters") leaves
  out the folder's cluster; the lines win**, and the code counts it.
- **A write** is refused whole as `full` (`needed`, `free`, in clusters) when its **growth** -- the new size's clusters
  less the old file's -- is positive and does not fit (`sceMcWrite`, :1677-1680); a replace inside the file's existing
  clusters always fits. Mkdir is **not** refused for space: the stub's Mkdir has no check (:1278-1328), so a folder
  made on a full card is taken and the used figure stays capped at 8000. PLAT-26 inherits this as the stub has it.
- **An unformatted card** reports no free space (the stub answers 0, :1204): `info()` gives the state and the revision
  only.

**The options save** (`logs/parity/f0/mc0/BASCUS-97275SOCOMII/`, names and sizes): `BASCUS-97275SOCOMII` 4,784 (5
clusters), `icon.sys` 964 (1), `LIST.ICO` 50,234 (50), `PATCHFILE.DAT` 2,048,000 (2,000), `SaveGame0..6` 1,952 each
(2 each, 14), `SCRATCHPAD.DAT` 944,128 (922): **2,992 clusters, 2,993 with the folder**, free 5,007. The PLAT-25 block's
and KNOWN L72's "3020 KB" is the host's allocation (the same files in 4 KB blocks: 8 + 4 + 52 + 2,000 + 7 x 4 + 924 +
4 for the folder = 3,020), not the stub's count. "At least 3000KB is needed" (OPT-05d) is tested by filling the table
with nominal files until 2,999 clusters are free.

*(The review's measurement, 2026-10-01.)* With one save on the card, `info()` -- what GetInfo will answer -- gives
**free 5,007** (8000 - 2,993). Whether a second save fits, and so where OPT-05d's "At least 3000KB is needed" appears,
is the game's comparison of that figure against what it needs (the stub's own `kCvMcRequiredFreeKb`, :125-129, is a
different sum), and **PLAT-26's and OPT-05d's to pin**, not this module's: this module only answers the free figure.

### 7.3 The card's states

| state | the record | `info()` | file operations |
|---|---|---|---|
| formatted (a missing key too) | `present`, `formatted` | `formatted`, `rev`, free and used clusters | as asked |
| unformatted | `present`, not `formatted`, no entries | `unformatted`, `rev` | refused `unformatted` |
| no card | not `present` (entries kept) | `no-card`, `rev`, `why: 'removed'` | refused `no-card` |
| no storage | -- (§7.5) | `no-card`, `rev: null`, `why: 'no-storage'`, the error | refused `no-card` |
| damaged | anything that fails §7.4 | `damaged`, `rev: null`, the reason | refused `damaged` |

The transitions, for OPT-07's control and the tests: **`insert`** (the card back, as it was), **`remove`** (pulled out;
its files stay on it, as a real card's do), **`format`** and **`unformat`** (both refused `no-card` when the card is
out: the stub asks `isMcCardPresent` first, :967, :1616). An `insert` of a card already in, or a `remove` of one already
out, writes nothing; *(review round)* nor does a `format` of a card already formatted and empty, or an `unformat` of one
already unformatted (§7.6, "a save that changes nothing"). `format` answers `{ ext: 'kept' | 'lost' }` (§7.4).

**`format` keeps `ext`; both `format` and `unformat` wipe the entries.** The choice, from the sources: a format erases
the card's files (the stub's Format removes the folder's contents, :969-983, and so does its Unformat, :1618-1629, which
is why `unformat` wipes too, not only clears the flag); `ext` is not on the card (R7 amendment 2: "not a file on the
card"), so wiping the card does not touch it. R7's OPT-05c line ("FORMAT sets `formatted` and empties the table") says
the same of the table and nothing of `ext`.

### 7.4 A corrupt record

A record that does not parse, is not an object, has a `v` other than 1, or fails the shape check -- `rev` not a whole
number, `present` or `formatted` not a boolean, `files` / `dirs` / `ext` not objects, a file without a whole
non-negative `size`, a finite `mtime` or a `data` field, a bad path, a name that is both a file and a folder, an entry in
no folder, an unformatted card holding entries -- is **a present card whose save is damaged**: `info()` says `damaged`
with the reason, and every operation is refused `damaged` (the game's "Error loading data" path, `_841`, OPT-05f;
PLAT-26 maps it). **No read writes it**, and no operation but **`format`** replaces it: an explicit wipe, taken with
the revision `null` (what a damaged read gives), which writes a fresh formatted empty card.

- **Its `ext`** *(corrected 2026-10-01 at review; it said: "with an empty `ext` (the damaged `ext` cannot be
  trusted)")*: when the damaged record's `ext` is itself a well-formed object, **the wipe keeps it** and `format`
  answers `{ ext: 'kept' }`; only when `ext` is unreadable (the text is not JSON, or `ext` is missing or not an
  object) is it lost, and `format` answers `{ ext: 'lost' }`. The controller's ruling, following R7 amendment 2 (a
  format keeps `ext`); the owner may overturn it.
- **Its revision** *(corrected 2026-10-01 at review; it said: "one past any whole `rev` still legible in the damaged
  text (so a tab that read the record before it was damaged does not find its old revision again)")*. That held only
  while a revision was legible: tab A saves at revision 1, the record moves on to 4, the key is replaced by text that is
  not JSON, the wipe wrote revision 1 -- and tab A's stale save at revision 1 was accepted (the review's sequence, now a
  test). The wipe's revision is now **`max(any legible revision, now()) + 1`**, `now` being the clock `CardSlots` is
  given (the page passes `Date.now`): ordinary revisions count saves and stay far below the clock's milliseconds, so no
  tab can hold the wiped card's revision. What remains: a clock set back by more than the card's whole history of saves
  after the wipe, which the legible-revision term covers whenever the old revision can still be read.

### 7.5 No storage

`CardSlots` takes the storage as a getter, asked at every operation (as `Settings` does). When the getter gives
nothing, throws (a browser that refuses site data on access), or `getItem` throws (a private window), **both slots read
as no card** -- R7 §3's call, **the controller's default; the owner may overturn it**. `info()` carries the
`StoreError` (`get`, the slot's key) for a caller that must tell "no card" from "could not look"; every operation is
refused `no-card` and nothing is reported (it is not a failed write, it is no card). This closes Q99.6 and OPT-07's
open call.

### 7.6 Atomic saves and the revision; the two-tab window

**One save, one `setItem`.** Every operation that changes a slot reads the key, parses it, checks the caller's
revision, applies its change to a copy, and writes the whole new record with **one `setItem`**, in one synchronous step.
A `setItem` that throws (`QuotaExceededError`, `SecurityError`, anything) has written nothing: the previous record is
byte-equal (pinned). The failure goes to the `report` the composition root gave (the page's `reportOnce`) **and** is
returned as `write-failed` with the `StoreError` (`quota`, `unavailable` or `failed`; operation `write`; the slot's
key) -- never silent.

**The revision** (R7 amendment 3). Each save names the revision its caller read (`null` for a damaged slot). If the
stored record's revision is not that one, the save is refused whole as `changed` (`expected`, `found`), and nothing is
written: a save to the slot moved it since -- any save, `setExt` included, from another tab or another writer in
this tab. PLAT-26 maps it to libmc's ChangedCard (-1).

**The order of the checks** *(corrected 2026-10-01 at review; it said the revision is checked "before any other
check", which the code never did)*: first the **arguments**, judged without reading the slot (a path, a size, a time,
a namespace, a value that is not JSON or is past its namespace's cap: `invalid` / `too-large`); then the slot is read
(no storage: `no-card`); then **the revision** (`changed`); then the card's state (`damaged`, `no-card`,
`unformatted`) and the operation's own refusals (`no-entry`, `wrong-kind`, `not-empty`, `full`, `ext`'s total cap). So a
bad path with a stale revision answers `invalid` (pinned). Kept so, not reordered: an argument the caller got wrong is
wrong whatever the card holds, and answering it without a read is what a call that cannot succeed should cost.

**A save that changes nothing writes nothing** *(review round)*: after the change is applied to the copy, a copy whose
content (state, files, folders, `ext`) equals the stored record's is not written, and the revision does not move -- a
Mkdir of a folder already there, an `insert` of a card already in, a `format` of a formatted empty card, an `unformat`
of an unformatted one, clearing an `ext` namespace that is not there, setting one to the value it holds, a
`setFileInfo` with no time or the same time, a `rename` onto itself. Another tab is never told the card changed when it
did not.

**The window that remains.** localStorage has no transactions and no lock between tabs. Inside one tab nothing can
interleave the read, the check and the `setItem` (one synchronous step on one thread). Across tabs there is no such step: the HTML standard's
storage mutex was never implemented, and a browser may keep each page's view of localStorage in that page's process
and carry another tab's write to it asynchronously (Chromium's design; not measured here), so two
tabs that each save within that propagation delay can both pass the check against the same revision; the later
`setItem` wins whole and the earlier save is lost without a `changed`. What the revision does catch is every save made
from a read older than the last write this tab has seen -- the case of a player who saved in one tab and goes back to a
card screen left open in another. The record is never torn either way (one key, one `setItem`). Closing the window
needs a lock across tabs (Web Locks, a `BroadcastChannel` handshake) that the page would pass in; not built, not asked.

### 7.7 The IndexedDB backend: parked

PLAT-24's `ByteStore` / `IdbStore` (and `MemoryStore`, their tests and the `fake-indexeddb` devDependency) stay in
`@s2u/card` **unused by the card** (R7 amendment 4): built, reviewed and measured, held for expansion data that
outgrows localStorage's roughly 5 MB of text. The page's factory is renamed `openParkedIdbStore()` and annotated as not
the card's store, so nobody takes it for the card's. `migrateOnce` is still typed on `ByteStore`.

### 7.8 The one measurement (R4's design, in a real browser)

Real **Chromium 153** on the dev host, 2026-10-01, the abandoned R4 branch's probe (`packages/card/e2e/quota.spec.ts`
on `agent/web-s6-card`, not merged; the sprint plan's Log): quota **about 6.44 GB**; one `.ps2` slot **9.07 MB**, two
slots **18.06 MB**, two slots plus one generation in flight **27.03 MB**; `navigator.storage.persist()` **false, with no
prompt**. **Firefox and WebKit were not measured** (their builds are not installed on the host). So the `.ps2` design
was feasible on storage grounds, in the one browser measured; R7 dropped it for scope -- the filesystem, the image
codec and the import and export work, and future saves that do not map to the original's reads and writes (the owner,
R7 §7) -- not for capacity. The figures are a record of the dropped design; nothing in R7's store depends on them.

### 7.9 The outcomes PLAT-26 maps

`CardSlots` names no libmc command, result code or trace line (PLAT-26's). Each outcome is typed so libmc's can be
told apart:

| outcome | when | the stub's result PLAT-26 would map it to (PLAT-26 decides) |
|---|---|---|
| `ok` (with `rev` and the value) | done | 0 |
| `no-card` | pulled out; no storage | GetInfo type 0 / NoEntry, as the stub (`MemoryCard.cpp:1215-1218`) |
| `unformatted` | an unformatted card | NoFormat (-2) |
| `changed` | the revision moved (any save to the slot, ext included; another tab or another writer in this tab) | ChangedCard (-1), after PLAT-26's re-read (roadmap 01, PLAT-26: on a slot whose present, formatted, files and dirs are unchanged it retries once with the fresh `rev`) |
| `full` (`needed`, `free`) | a write's growth does not fit | FullDevice (-3) |
| `no-entry` (`path`) | nothing there, or no such folder | NoEntry (-4) |
| `wrong-kind` (`path`, `is`) | a file where a folder is wanted, or the reverse | DeniedPermit (-5), as the stub's Mkdir over a file (:1308) |
| `not-empty` (`path`) | removing a folder with entries | NotEmpty (-6) |
| `damaged` (`reason`) | a corrupt record | the game's "Error loading data" path (OPT-05f) |
| `invalid` (`reason`) | a bad path, size, namespace or non-JSON value | DeniedPermit (-5), as the stub's unsafe path (:1298-1300) |
| `write-failed` (`StoreError`) | the `setItem` threw | the failure the original reports ("Error saving", OPT-05f) |

| `too-large` (`scope`, `limit`, `size`) | an `ext` value past its cap (§7.11) | none: `ext` is not on the card, and no libmc call reaches it |

The operations: `info`, `list(dir)`, `stat`, `readFile`, `writeFile(path, size, data, rev)` (create or replace;
`created` says which), `deleteFile`, `makeDir` (one already there is taken as made, as the stub's Mkdir, :1306-1308),
`removeDir`, *(review round)* `rename(from, to, rev)` and `setFileInfo(path, { mtime }, rev)`, `insert`, `remove`,
`format`, `unformat`, `getExt`, `setExt`, `extNames`. Writes stamp `mtime` from the clock `CardSlots` is given (the page
passes `Date.now`).

- **`list(dir)`** (`''` is the root; a folder's size 0) *(corrected 2026-10-01 at review; it sorted case-sensitively)*
  sorts as the stub's GetDir does: **by the name lower-cased in ASCII** (A-Z only), compared code unit by code unit
  (`std::sort` with `toLowerAscii(lhs) < toLowerAscii(rhs)`, `MemoryCard.cpp:1099-1104`; no locale). The save folder
  lists `BASCUS-97275SOCOMII, icon.sys, LIST.ICO, PATCHFILE.DAT, SaveGame0..6, SCRATCHPAD.DAT` (pinned). Two names that
  differ only in case -- which this card allows (§7.12) and the stub's Windows host cannot hold -- are ordered by the
  name itself. **What PLAT-26 adds on top**: the `.` and `..` entries the stub puts first (:1085-1086), the wildcard
  (`*`, `?`, :1027-1028, `wildcardMatch`) and a query naming a file rather than a folder (:1042-1055), the table's
  64-byte entries and the `maxEntries` cut (:1130-1131).
- **`rename(from, to, rev)`**: one save, revision-checked, of a file or a folder with everything in it. As the stub's
  Rename (:1439-1484): `from` must exist, `to`'s folder must exist (else `no-entry`), then the host's rename decides;
  where Windows and POSIX agree this module follows them -- a file onto a file replaces it (its clusters freed); onto a
  folder, or a folder onto a file, is refused (`wrong-kind`; the stub's DeniedPermit, :1474). A folder onto an existing
  folder is refused too: Windows refuses it, POSIX would take an empty one, and the stub's result therefore depends on
  its host. A folder into itself is `invalid`. Both paths are whole card paths; the stub resolves the new name against
  the current folder (:1460-1461), and libmc's Rename takes a new *name*, which PLAT-26 turns into a path.
- **`setFileInfo(path, { mtime }, rev)`**: the stub's SetFileInfo **keeps nothing** -- it answers Succeed when the entry
  exists and NoEntry when not (:1524-1562) -- so the record has **no attribute field** (none added). With no `mtime` it
  only checks the entry, as the stub does; with one it sets the file's or the folder's time.

### 7.10 Where the sources disagree

- **"3020 KB" vs 2,993 clusters** (§7.2): the PLAT-25 block and KNOWN L72 quote the host folder's allocation; the
  stub's own count of the same files is 2,993. The free figure the game sees is the stub's.
- **The record's shape** (§7.1): R7 §3 gives `files` only; folders need their own table (`dirs`).
- **The free-space sentence** of the brief omits the folder's cluster; the stub counts it (:262-266).
- **Mkdir on a full card**: the stub takes it (no check, :1278-1328); a real card might refuse it. Kept as the stub
  has it, since the stub is the cited rule; PLAT-26's proven level (a PCSX2 or recomp trace) would settle it.
- **The case of names** (§7.12): the stub defers to its host's filesystem; the card is case-sensitive here.

### 7.11 The size of `ext`, and the quota the slots share (review round, 2026-10-01)

**The failure mode.** localStorage is one quota per origin, shared by both slots, the page's settings and anything
else the page keeps there: about 5 MiB per origin (MDN, "Storage quotas and eviction criteria", Web Storage; the
browsers count the keys and values as UTF-16 text; **not measured here**). When it is full, every `setItem` that would
grow a value throws `QuotaExceededError`: every later save of **either** slot that grows its record fails as
`write-failed` (`quota`), reported, the record unchanged -- the player sees "Error saving" -- and the page's own settings
fail to save too (reported once by `reportOnce`). A save that shrinks a record still goes through. Nothing in the card
recovers on its own; the caps below keep `ext` from causing it.

**The caps** (the controller's ruling at review; named constants; the owner may change them). Counted as the JSON's
length in UTF-16 characters, what the quota counts:

| what | budget (characters) | from |
|---|---|---|
| the origin | about 5,242,880 (5 Mi) | MDN, documentation, not measured |
| the page's settings and the keys left for OPT-04 / OPT-20 | under 262,144 (0.25 Mi) | twelve settings, short strings and one small JSON (the mouse look's); the legacy `s2u.mp.name` and `s2u.armory.v1.*` keys, held to that bound, not measured |
| one slot's files' `data` | under 131,072 (0.125 Mi) | the save's game-written bytes are about 21 KB (`BASCUS-97275SOCOMII` 4,784-6,400, `icon.sys` 964, `SaveGame0..6` 7 x 1,952); our JSON of them, at four times that, is about 85,000; `LIST.ICO`, `PATCHFILE.DAT` and `SCRATCHPAD.DAT` (icon and filler, 3 MB nominal) carry no data of ours. OPT-01 has not written it: an estimate |
| one slot's `ext` | **`EXT_TOTAL_MAX_CHARS` = 1,048,576 (1 Mi)** | the ruling |
| one `ext` namespace | **`EXT_NAMESPACE_MAX_CHARS` = 262,144 (0.25 Mi)** | a quarter of `ext`, so four features at their cap fit |
| **worst case, everything full** | 2 x (1 Mi + 0.125 Mi) + 0.25 Mi = **2.5 Mi** | half the origin, the other half margin for the browsers' accounting (Safari's and Firefox's differ), the record's own keys and future page keys |

`setExt` refuses a value whose JSON is past its namespace's cap, and a change that would take `ext` past its total
while growing it, as **`too-large`** (`scope: 'namespace' | 'ext'`, `limit`, `size`) -- not `write-failed`: nothing is
attempted, nothing reported, the record unchanged. A change that shrinks `ext` is always taken. A file's `data` has no
cap here: the files are the game's, fixed by OPT-01 to the save's twelve, and their bound is the table above.

**Expansion data too large for this** -- anything measured in megabytes -- **belongs in the parked IndexedDB backend**
(§7.7; about 6.44 GB of quota measured in Chromium, §7.8), not in `ext`.

### 7.12 The case of names (review round, 2026-10-01)

**The card here is case-sensitive**: `SaveGame0` and `savegame0` are two entries, and `stat`, `readFile`, `writeFile`,
`list`, `rename` and the rest look a name up exactly as given. Why:

- **The PS2 card filesystem compares names exactly**, as far as a source here reads it: mymcplus (the tool the project's
  PCSX2 cards were made and read with; the PLAT-25 block's citation) looks an entry up by `ent[8].decode("ascii") ==
  name` (`ps2mc.py` L1156) and matches a pattern with `fnmatchcase` (L1749). Sony's own card driver (`mcman`) was not
  read, so this is a **reading**: `CARD_NAMES_CASE_SENSITIVE_READING` (§6).
- **The recomp's stub is not a source for it**: it keeps the guest's name and hands it to its host's filesystem
  (`guestMcPathToHostPath`, :467), so on Windows (NTFS, case-insensitive) `SAVEGAME0` finds `SaveGame0` and on Linux it
  does not; its only case rule is GetDir's case-insensitive *order* (:1099-1104), which `list` follows (§7.9).
- **What it changes for the game**: nothing that is known -- the game asks for its fixed names (the save's twelve) in
  one spelling. A PLAT-26 trace replay recorded on Windows that asks with another case would answer NoEntry here where
  the recomp found the file; that would show as a difference and settle the reading.
