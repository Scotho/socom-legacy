# R7 -- the account and the card: plain name and password, a virtual card in localStorage

**Status:** the owner's ruling (Craig, 2026-10-01). It **replaces R4** (`../MISSION.md`, "R4 -- the card's storage and
the password"). The owner may overturn it, as with any ruling.
**Scope:** the rulings, the storage design, and the roadmap and sprint 6 changes that follow from them. No code is
written by this document. The web sprint 6 controller (seat `C:/Projects/wt-web-s6`) carries it out.

## 1. What the owner asked for

> Change the account sections to match the original and drop the SSO stuff for now: plain name/pass; the save state UI
> exactly mirroring the original, but the underlying save data can be our format in localStorage.

The owner answered four questions (2026-10-01):

1. **"The SSO stuff"** is R4's server-issued credential: the random credential of at least 128 bits in the card's
   `PASSWORD` field, its check, its list and its revocation. **It is dropped.**
2. **SAVE PASSWORD: YES** stores the password **obfuscated** (scrambled) in the persona record. This is the owner's
   pick over two other options: plain, and "never stored". See the risk in section 2.
3. **The PS2 card-image work is dropped, with no export and no import.** There are no `.ps2` images and no PCSX2 interop.
   A slot's data lives only in that browser's localStorage. Nothing goes to LATER.md.
4. **Every card state is reachable, simulated.** Each slot is a virtual card that can be absent, unformatted, full or
   pulled out, so every OPT-05 screen appears as on the console.

The owner chose approach A (a virtual card holding a file table) over B (save records with no card model; each screen
fakes its own states) and C (the filesystem port on localStorage, ruled out by the roughly 5 MB quota and by the
dropped image).

## 2. The ruling (R7), as it goes into MISSION.md in R4's place

- **R7 -- the account and the card** (the owner, 2026-10-01; replaces R4):
  - **The card.** It is two virtual memory-card slots in **localStorage**, in redotcom's own JSON format, one key per
    slot.
    - A slot holds the card's state (present or absent, formatted or not) and a table of files.
    - The files carry the original's names and **nominal sizes**. Their contents are our JSON, not the game's bytes.
    - There are no `.ps2` images, no PCSX2 import or export, and no file export of any kind.
  - **The save UI.** Every card prompt, slot select, free-space notice, overwrite warning and error is the original's,
    word for word and frame for frame.
  - **The account.** A plain **player name and password**, entered as the original asks for them (ONL-06).
    - The password goes to our server over TLS at account creation and at login. The server keeps only an
      **argon2id** (or scrypt) hash of it.
    - There is no server-issued credential and no revocation.
  - **SAVE PASSWORD: YES** stores the password in the slot's persona record, **obfuscated**.
    - The method is a fixed-key reversible scramble, then base64.
    - **The risk is accepted by the owner.** Anyone holding the page's code can reverse the scramble. It hides the
      password from a glance at devtools, not from a script on our origin (an XSS bug) or a hostile extension.
    - Players reuse passwords, so a leak can reach beyond our game.
    - This is a deliberate deviation from safety, made for fidelity. The code and the privacy page must not call the
      scramble encryption or protection.
  - **SAVE PASSWORD: NO** stores no password. The password keyboard opens at every login, as on the original.

## 3. The storage design (approach A)

**Keys.** `s2u.card.v1.slot1` and `s2u.card.v1.slot2`. A missing key is a fresh card that is inserted, formatted and
empty. That matches the original: an empty card folder is an inserted, formatted, empty card (KNOWN [card-folder]).

**A slot's record** (JSON, versioned):

```ts
interface CardSlotV1 {
  v: 1;
  present: boolean;          // false: "no card" (OPT-05b), set through OPT-07's control
  formatted: boolean;        // false: unformatted (OPT-05c); FORMAT sets it true and empties `files`
  files: Record<string, {    // the path on the card, e.g. "BASCUS-97275SOCOMII/SaveGame0"
    size: number;            // the nominal size in bytes, the original's (PLAT-25's 12-file list)
    mtime: number;           // ms since epoch
    data: unknown;           // our JSON: persona records, options, valves, loadouts
  }>;
}
```

**Free space** is counted against the virtual 8 MB card, not against the real localStorage quota.
- GetInfo answers the recomp stub's "free 8000" on an empty card. The free figure falls by the nominal sizes rounded up
  to 1 KB clusters, by the recomp's `mcUsedClusters` rule (`MemoryCard.cpp:245-287`).
- So "At least 3000KB is needed" (OPT-05d) means what it meant on the console.
- A test reaches the full state by filling the card's table with nominal files, not by filling the browser.

**PLAT-26's libmc semantics** run over this file table instead of over PLAT-37's filesystem. They keep the same
commands, result codes (0, -1 ... -7) and FAILED line. The game logic sees the card it saw on the console.

**Writes are atomic.** A save builds the new slot record and writes it in **one `setItem`**. A `setItem` that throws (a
`QuotaExceededError`, or storage refused) writes nothing, so the previous record stays whole.
- The failure reaches the game as the libmc failure the original reports.
- The player sees "Error saving" (OPT-05f), never a browser alert.

**Corrupt data.** If a record does not parse, has an unknown `v`, or fails its shape check, the slot is a present card
whose save is damaged. The game shows the original's corrupt-file path ("Error loading data", `_841`, OPT-05f). The
record is not silently reset.

**No storage** (a private window, or localStorage refused): both slots read as **no card** (OPT-05b), the original's
own words for a missing card. *This is the controller's default; the owner may overturn it.* It closes OPT-07's open
call ("what a browser without storage reads as").

**The persona record** (OPT-04) keeps the original's `AcctInfo.rdr` fields, one record per persona, per HOST:
HOST, NAME, TOWN, GENDER, PORT, PASSWORD, SAVEPASSWORD, PROFILES.
- PASSWORD holds the obfuscated password when SAVEPASSWORD is YES, and is empty otherwise.
- The caps are the original's: name 14, password 12.

**The armory profile and the MP name** move onto the card. They move by OPT-20 (`WeapProfile_%d.dat`) and OPT-04, as
before. PLAT-24's migration of the other keys (W6.R5, migrate) is unchanged.

## 4. What changes in the roadmap (`docs/roadmap/`, `MISSION.md`, `README.md`, `SPRINTS.md`)

| Task | Change |
|---|---|
| MISSION R4 | Replaced by R7 (section 2); R4 kept struck through with "replaced by R7, 2026-10-01". R6 (the online services in our match server, OC-7 shape (c)) is untouched and consistent: accounts live in the match server. MISSION's "What SOCOM Legacy is" paragraph, which restates R4 (IndexedDB, raw `.ps2` images, PCSX2 import), is rewritten with it. |
| Totals | Three M tasks go (PLAT-27, PLAT-37, OPT-08): 150 tasks / 458 points become 147 / 449. `tools/test/roadmapGraph.test.ts` pins the totals, the layer map, the two-seat table and every sprint's count, so all documents change in one commit. Sprint 15 goes from 9 / 25 to 7 / 19. |
| PLAT-24 | **Merged** with an IndexedDB backend. Keep the interface; add a **localStorage backend** and make the card use it; the IndexedDB backend is removed (no reader left) or left unused -- the controller's call, removal preferred (YAGNI). The 8.6 MB binary round-trip acceptance goes; a slot record round-trip and a throwing `setItem` reported, not silent, replace it. |
| PLAT-25 | **Rewritten:** "two virtual card slots in localStorage" per section 3. Its acceptance: two slots kept apart; a record round-trips; a throwing `setItem` leaves the previous record byte-equal; a reload reads the same slot; free space by nominal sizes; a corrupt record reads as a damaged save; no storage reads as no card. The quota measurement and `navigator.storage.persist()` go. |
| PLAT-26 | Kept; over PLAT-25's file table instead of PLAT-37. Its "free on an image" unknown closes: the stub's 8000 stands. |
| PLAT-27 | **Dropped -- and it is already merged** (1c20d326): remove `@s2u/card`'s `scramble.ts`, `saveFile.ts`, `persona.ts` and the ZAR V2 / rdr **writers** in `@s2u/archive`; the pre-existing readers (`zar.ts`, `rdr.ts`) stay for disc data; research 102 stays as research. The four fixture round-trips go. PLAT-06's dev-host `PersistentValves` test (65 valves, 4,144 B, read from game-written cards) goes back to spawning the Python reference `tools_py/card_save.py`. Dependents re-pointed: OPT-02, OPT-03, OPT-04, OPT-01, BOOT (02-boot.md:135-142), the HDD-branch task (04-options L507-513) and MENU's save list (03-menus L238-243) depend on PLAT-25/PLAT-26 instead. |
| PLAT-37 | **Dropped** (the `.ps2` filesystem). |
| OPT-01 | "Writes the card exactly as the game does" now means: the same files, names, nominal sizes and op sequence (PLAT-26's trace), with our contents. The byte-equal acceptance becomes op-sequence-equal. |
| OPT-02, OPT-03 | Kept as the rule of *what* persists (the 65 valves, the longevity rule); the encode/decode of `PersistentValves.rdr` bytes goes -- the valves are JSON in the file's `data`. |
| OPT-04 | Persona records in our JSON (section 3); the credential write goes; SAVEPASSWORD YES writes the obfuscated password. |
| OPT-05a..h | Kept, all reachable (owner, question 4). OPT-05c: FORMAT sets `formatted` and empties the table; the "erased image" route goes. OPT-05f: the corrupt and refused-write cases of section 3. |
| OPT-07 | Kept: the insert / remove / format control, over `present` and `formatted`. Its "no storage" call closed (section 3). |
| OPT-08 | **Dropped** (no export, no import). MENU tasks whose proven level used an imported owner card (03-menus L104-110, L240) use a slot record built in the test instead. |
| ONL-06 | Unchanged in look: the persona form exactly as the original; the password row masked as the original masks it. |
| SVC-03 | **Shrunk:** account create and login by name and password, the argon2id hash, the login errors in the console's words. The credential issue, check, list, revoke and its open calls (who may revoke, a credential's lifetime) go. |
| SVC-04 | The credential hashes and their revocation state go from what is persisted. |
| README | The R4 summary (L27-28), the IndexedDB quota unknown (L219), the GetInfo-on-image unknown (L224), the import/export ruling (L272) and the layer map entries for PLAT-27, PLAT-37, OPT-08 updated. |
| SPRINTS | Sprint 6: PLAT-27 out, PLAT-25's gate rewritten (the points recounted). Sprint 15 (Chris's seat): PLAT-37 and OPT-08 out, its gate (L289-294) rewritten -- **Chris is told** (a line in `docs/HUMAN_TASKS.md`'s owner row, or however the two seats pass word). |

## 5. Sprint 6 in flight

- **PLAT-25** (dispatched, `agent/web-s6-card`): stop it and re-brief it to section 3 and the new PLAT-25 acceptance.
- **PLAT-27** (merged as 1c20d326; its fix round paused on `agent/web-s6-codec`): drop the fix round. A follow-up task
  removes the merged writer code (section 4's PLAT-27 row) and re-points PLAT-06's dev-host test. Remove the worktree
  through `scripts/agent_worktree.sh`.
- **PLAT-24** (merged as a8b8e0ec, with the IndexedDB backend, `fake-indexeddb`, a conditional write and `readMany`): a
  follow-up task adds the localStorage backend and removes the IndexedDB backend and `fake-indexeddb`.
- **Owner confirmation:** the controller confirms R7 with Craig in its own seat before landing it, since R7 replaces an
  owner ruling and undoes merged work.
- **The sprint 6 plan:** a `## Log` line for R7; the task table updated; a W6 ruling line pointing at this document.
  PLAT-25's dev-host quota measurement drops out of the browser-window owed list.
- **Privacy and data page:** the landing's `data_page.test.ts` text concerns the desktop recomp. A web privacy text, when
  one is written, says the saved password is kept scrambled in the browser and is not encrypted.

## 6. Testing

- **Unit (CI):** PLAT-25's acceptance above; PLAT-26's result-code tables over a file table built in the test.
- **The obfuscation:** a round-trip test, plus a test that the stored string does not contain the password.
- **Persona records:** cap and field tests.
- **The card control:** each OPT-07 action produces OPT-05a's state.
- **Screens (proven level):** unchanged; they are compared against the recomp and PCSX2 captures. The card states that
  used to be built from `.ps2` images are now built from slot records.

## 7. Confirmed, and amended, in the controller's seat (the owner, 2026-10-01)

The owner confirmed R7 to the web sprint 6 controller ("Agreed on all counts. Proceed with the limited format.") after
asking whether the original format had been feasible (it was: two `.ps2` images in IndexedDB measured at 18.06 MB in
Chromium 153 against a quota of about 6.44 GB; the plan's Log) and saying what decided it: future work will need to
save things that do not map to the original's reads and writes, and single player is a long way off. Four amendments
to the sections above, each agreed by the owner, and one clause re-opened:

1. **The card codec's read side stays, as a dev instrument** (amends section 4's PLAT-27 row and section 5): the
   readers of a game-written save (the unscrambler, the save file and its modules, the persona decode, the lossless
   ZAR and rdr readers) move out of the shipped packages into `tools/`; the writers are deleted. Nothing in a shipped
   package knows the card's byte formats. A later one-way importer of a real PCSX2 save needs only readers. PLAT-06's
   dev-host `PersistentValves` test reads through that tool, not through Python.
2. **A slot record keeps the original's data and ours apart** (amends section 3): beside `files` (the virtual card's
   table, counted against the virtual 8 MB) it has an **extension area** (`ext`) for anything SOCOM Legacy saves that the
   original never did. `ext` is not a file on the card: it takes no free space and no card screen ever shows it.
3. **Another tab's save is the original's "card changed"** (amends section 3): the record carries a revision counter;
   a save that finds the stored revision moved since it read the slot is refused whole and reaches the game as
   libmc's ChangedCard result (-1).
4. **The IndexedDB backend is parked, not removed** (amends section 4's PLAT-24 row and section 5): it is built,
   reviewed and measured, and localStorage holds about 5 MB of text. The card uses localStorage; the IndexedDB
   backend and its tests stay in `@s2u/card`, unused by the card, for expansion data that outgrows localStorage.
5. **Ruled the same day: SAVE PASSWORD: YES keeps a server-issued remember token in a cookie, never the
   password** (replaces section 2's "obfuscated" clause and its accepted risk; section 6's obfuscation tests go). The
   owner asked whether the central server lets the saved password be handled more safely, the controller proposed
   this, and he agreed ("agreed on cookie").
   - At a login with SAVE PASSWORD: YES the password goes to our server once over TLS, as at any login. The server
     checks it against the argon2id (or scrypt) hash, issues a long random token, and keeps only the token's hash.
   - The token is set as an **HttpOnly, Secure, SameSite cookie on the match server's host**, so page script cannot
     read it. The slot's persona record keeps SAVEPASSWORD: YES and the **length** of the password, for the masked
     row; it never holds the password or the token.
   - A later login presents the cookie instead of a password. The server expires a token that has gone unused for a
     period and drops every token of a persona when its password changes. The login endpoint checks the request's
     Origin and limits attempts (the original's keyboard caps a password at 12 characters).
   - **The screens are the original's.** One deviation, accepted: a saved password cannot be edited character by
     character; opening the keyboard on that row starts empty.
   - **What it does not fix:** the password is still typed into the page at a login, so a script present at that
     moment could capture it. The gain is that nothing reusable is kept in the browser afterwards.
   - **The controller's default, which the owner may overturn:** where the hosting cannot carry the cookie (a
     self-hosted page on another site than its server), SAVE PASSWORD: YES behaves as NO; the token is never put in
     storage that page script can read.
   - To confirm before it is relied on: Safari may cap this cookie at about a week when the match server's host
     resolves to another network than the site's.
   - Tasks: SVC-03 (the token's issue, check, expiry and drop; the HTTPS login endpoint beside the WebSocket; the
     Origin check and the attempt limit), OPT-04 (the persona record: SAVEPASSWORD and the length), ONL-06 (the
     masked row).
