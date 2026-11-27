# 425 -- The Forge room's character roster online: lent kits and hit skeletons (FN-1b)

- Date: 2026-11-15. The Forge lane (`agent/wm-forge`), task FN-1b of the plan `docs/plans/2026-11-14-forge-next.md`
  (row FN-1, rulings FN.R3 and FN.R5; the FC2 plan's FC2.R2 and FC2.R8); branch `agent/wm-forge-fn1b`, base
  `agent/wm-forge-fn1a` bc17576b77 (FN-1a's head; research 424 is this note's predecessor and its shape).
- Track: simulation. Status: **reading, pending review**. The roster is a **browser adaptation** (FG.R2): the original fixes
  each map's ARMORY columns; nothing of a type is invented -- every lent column is another disc MP map's own type, read
  through the code that already reads it (research 95, 94, 238). What this task adds is wiring: which code the Forge
  lobby's room and the lobby's ARMORY window call, one shared column rule, and central's admission and host ask. **Nothing
  here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the r0001 decompilation (`socom2_game.elf.decomp.c`, cited
  `FUN_<addr>` and `D:L<line>`), re-read for this note at the lines below; **(R)** the readings of research 95, 94 and 238,
  at their own levels; **(U)** unit tests over hand-built tables (`match/test/forgeRoomRoster.test.ts`,
  `central/test/forgeLobby.test.ts`, `creator-contracts/test/heldSettings.test.ts`,
  `viewer/test/forge/lobbyArmory.test.ts`, `viewer/test/forge/lobbyHeldSettings.test.ts`); **(F)** a fixture-tree case
  (`forgeRoomRoster.test.ts`'s last: a real `MatchServer.makeForgeRoom` over `test-fixtures/` MP2, MP6, MP72); **(P)** a
  dev-disc test over every MP map (`match/test/forgeRoomRoster.devdisc.test.ts`; skipped without the disc); **(O)** the
  original running -- none.
- New names: none. No `*_READING` or `*_PLACEHOLDER` is added or changed, and no value: the task changes no reading.
- The owner's words this rests on: "i'm willing to start applying the vanilla map settings"; on the roster itself
  (2026-11-10): "allow which characters the map can pick. Some maps use different player models".

## 0. The answer

1. **`characters` leaves the online hold** (`@s2u/creator-contracts` `ONLINE_HELD_SETTINGS_ADAPTATION`, FC2.R8). The
   four world settings (`defaultMaterial`, `reverb`, `fov`, `loading`) stay held, refused online in the hold's words.
2. **The room lends each roster column's kit and hit skeleton by the page's own rule.** The column rule is one pure
   function, `viewer/src/forge/rosterSetting.ts` `rosterLending`, which the page's `withRoster` (a column's body a
   `LoadedBody`) and the room's `match/src/forgeSimMap.ts` `forgeRoomRoster` (a column's body a hit skeleton) both call.
   `MatchServer.makeForgeRoom` applies it before the arsenal (`forgeRoomKits`), as the page's `composeLayoutFinish` does.
3. **Central admits the roster, refuses a column off the disc's list in the archive words, and asks the host for every
   archive the room reads** (`central/src/forgeLobby.ts` `layoutArchiveRefusal`, `layoutArchives`; LATER 1060's fix).
4. **The lobby's ARMORY window offers what the room accepts and gives** (`viewer/src/forge/match.ts` `lobbyArmoryOver`
   with the roster; page.ts's lobby `armoryData` composes the roster as the lobby's match does).
5. **Nothing new persists on a room between matches**: the kits and skeletons are read once at `makeForgeRoom`, from the
   lobby's layout, for the lobby's life, as FN-1a's arsenal is (research 424 section 6).

## 1. What a column is (the readings it rests on)

- **The columns of the original.** A map's ARMORY offers its side's `chartype.rdr` types, at most four, the fourth gated by
  the map's `InWhichAOP` (R: research 95 section 6 and section 3.2, `armoryTypeAllowed`, `fourthArmoryTypeOpen`, reading,
  reviewed). Which type a column is goes by name through `mission.rdr` `UiVehicles` (D, re-read for this note:
  `FUN_0053b4b0` D:L405168-405202 opens the type table and looks the name up in its three lists in turn, then takes the
  loaded character of the name found; `FUN_0053b5f0` D:L405207-405245 walks one list's records, compares each record's
  name without case and answers its character); on all 22 MP maps the two orders agree (R: research 95 section 6), so a
  roster character's `index` is its type's position in the side's `chartype.rdr` list -- the index the kits, the bodies,
  the skeletons and the room read.
- **A column's kit** is that map's type's `character.rdr` `default_weapons` (R: research 94 section A4, reading, reviewed;
  `@s2u/scene` `mapKits`, read on a server by `simKitsFromBytes`, the function the page's loader builds
  `LoadedMap.arsenal` with). The kits are one table every map shares (`RUN/READERC.ZAR`, `RUN/ZWEAPON.ZAR`); the type list
  is the donor map's `READERM.ZAR/chartype.rdr`. Kits are not filtered by the valves (R: research 94 section A4): a lent
  kit's item the base's valves do not give its side is carried, not re-selectable once changed -- the same on the page.
- **A column's hit skeleton** is that map's type's model's skeleton (`viewer/src/simMap.ts` `loadSimSkeletons` ->
  `simSkeletonsFromBytes`, `chartype.rdr` order, research 95 section 6's "the types' skeletons differ" and research 238
  section 1.8 for the hostages' family, reading).
- **The adaptation.** `settings.characters` (`CharacterRoster`: each side at most four columns, each `{ map: 'MPnn', index:
  0..3 }`, held by `parseRoster` to `^MP\d{1,3}$` and 0..3) names columns from any disc MP map on the same side. The
  valves, the selectable items, the fourth column's gate (the base's `InWhichAOP`) and the hostages stay the base's.

## 2. The room (R1, R2)

`forgeRoomRoster(kits, layout, donorOf, skeleton)` (`match/src/forgeSimMap.ts`), over `rosterLending`:

- Each side the roster names, its columns in order. A column naming the base is the base's own type (its kit and skeleton).
  A donor map is what `makeForgeRoom` read off its archive on this disc -- its kits (`simKitsFromBytes`) and its type
  skeletons (`loadSimSkeletons`) -- each stem through `forgeArchivePath` (CMV-0: a stem off the disc's list forms no path
  and reads nothing). A donor not read at all (off the list, a read that rejects, a `donorOf` that throws) is left out,
  "would not load"; a type the donor does not list (no kit, no skeleton), "has no SEAL / Terrorist type n". A side left
  with no column keeps the base's. Each refusal is a `forge: roster: ` note in the page's own words, joined to the
  composition's notes (`makeForgeRoom`'s `notes`, logged and kept on the lobby). The step never throws.
- **The kits.** A kept side's kits are its columns' kits when every kept column has one; else the side keeps the base's
  kits, said ("a column's map has no kits, so the side keeps the map's own kits") -- the page's rule exactly. The room's
  `armoryTypeAllowed` then admits the roster's column count (`kits[side].length`), the fourth under the base's gate, and
  `typeKit` reads each column's kit; the arsenal (`forgeRoomKits`) is laid after, so its picks reach a lent kit.
- **The skeletons.** Each kept column's skeleton is its donor type's at its index, so the room's `skeleton[side][type]` --
  its hit volumes and hit bodies (`Room.volumesOf`, `hitBodyOf`) -- is the column's own body, index for index with its
  kit. In the column rule the skeleton stands where the page's body stands (the page keeps a type with a body or a kit).
- **A column kept for its kit whose skeleton did not read** is null in `skeleton[side]`. No fallback is added: the room's
  own takes it -- `room.ts` `volumesOf` (and `hitBodyOf` alike): the type's own, else its side's first, else the SEAL's
  first, else the placeholder capsules. What the page draws there depends on its own read (FN-1b's fresh review,
  finding 3): when the page's body for that type is missing too it draws the map's first body of the side
  (`viewer/src/teamBody.ts` `bodyForTeam`: `map.body` / `map.terrorist`, which a roster does not change), so the room
  hits the roster's first column and the page draws the base's first; when the page's body decoded, the page draws
  the lent body while the room hits its side's first skeleton. Both are the same 26-bone family (research 95
  section 6). Not reached on a disc whose donor archive reads (the skeleton reads with its kit).
- **The one unaligned case is the page's own**: a donor whose kits did not read but whose skeleton did keeps the column
  (by its skeleton); the side then keeps the base's kits while its skeletons are the roster's -- exactly the page's types
  and kits in the same case. Every other kept side has kits and skeletons aligned column for column (held by (U)).
- **The bots' appearance catalogue** (`skeleton.catalogue` -> `map.characters`, the all-maps character libraries switch,
  `hasCharacterLibraries`) stays the base's: it names a bot's appearance from the base's own regional library, presentation
  only (OT.R81: a bot is hit on its type's volumes), and its `multiplayerModels` are the base's native models. A lent
  column does not enter it, so a bot never names a body the pages cannot resolve; the wire carries a player's type index
  only, and every page resolves it to the lent body through its own composed map (`types[side][i]`). No wire or protocol
  change.
- No roster, or an empty one: the kits and skeletons the very objects read.

## 3. Central (R3, LATER 1060)

- `characters` is admitted (the hold no longer names it); a create carrying a roster is taken, its room made with it.
- `layoutArchiveRefusal` reads each roster column's map: one off the disc's list (`isDiscArchiveStem`; `parseRoster`
  admits `MP999` by shape) is refused at the create (`{ refused: 'archive', map }`) and dropped at the restart's reload
  (`why: 'archive'`), in today's archive words, before anything is placed or composed.
- `layoutArchives` (what a host must hold to be placed on) names every source `layoutArchiveRefusal` reads -- the placed
  doors', gates', barriers', turrets' and flares' sources, a hostage's `source`, `settings.skyFrom`, and the roster's maps
  -- beside the base and the pieces, upper case, once each, sorted, a non-disc one left out as a piece's is. Before this, a
  host lacking a placed door's archive was still eligible and the room counted the door missing (LATER 1060); now
  `Directory.eligibleArchives` passes it over.

## 4. The lobby's ARMORY window (R4)

- **The data.** `lobbyArmoryOver(data, arsenal, roster)`: for each side the roster names, the window's characters follow
  the composed map's kits by column (`kits[side][i]` for i under four): type, character and loadout the column's; a column
  the base's roster has at that index keeps its `column`, `portrait`, `model` and `textures`; a column past the base's
  columns is the side's next `ARMORY_COLUMNS` name with no portrait, no model, no textures; a base column past the roster's
  count is dropped. A side the roster does not name keeps FN-1a's rule (the base character's kit at its index, declined
  when the type or character differs). So the screen's columns (`armoryState.ts` `columnCount`: `min(4, ctx.kits.length)`,
  the fourth under `fourthOpen` of the same valves) are the room's (`armoryTypeAllowed`: `min(4, kits[side].length)`, the
  fourth under the base's `InWhichAOP`), and each column's kit is the one the room's `typeKit` gives, the screen laying
  the EQlimit over it as the room does (research 424 section 7).
- **The page.** `page.ts` `enterLobby`'s `armoryData` composes the roster before the arsenal -- the donors loaded as the
  lobby's match loads them (`hostageLibOf`), `withRoster`, then `mapWithArsenal` -- over the layout as the lobby holds it
  (`withoutHeldSettings`), and hands the roster to `lobbyArmoryData`.
- **What is shown for a lent column (the adaptation's limit, as local Forge Play's own).** The portraits and captions are
  not carried (`rosterSetting.ts`, "Not carried"): a lent column shows the base map's portrait at its column (the base
  map's `EMnn_TXR` image named by its `UiVars` `Seal1..4` / `Terr1..4`, research 95 section 6), or none past the base's
  columns, and the caption the screen's own scripts and strings give that column position (research 95 sections 2.3 and
  6: "SEAL 4" / "TERRORIST 4" on MP1-MP12, the unlockable's name over the fourth on 51-83, by the base's `InWhichAOP`) --
  not the donor's. The donor's library is not read for it, and nothing is
  invented. Its type, character and kit are the lent ones. A row for the seat: section 7.

## 5. What holds each agreement

- (U) `match/test/forgeRoomRoster.test.ts`: the room's kits equal the page's (`withRoster`) for a lent column and a base
  column, a side with fewer columns (the room accepts exactly the roster's columns), the refusals in the page's words with
  the prefix (a donor not read, a type not listed, a read that throws), and the arsenal after the roster on a lent kit; the
  skeletons each donor's at its index, aligned with the kits, null when not read, the page's unaligned case, the
  hostages and catalogue the base's; no roster, the same objects. The page/room equality runs both sides over one input;
  that the INPUTS agree (the room's donor kits are the page's `LoadedMap.arsenal`) is a reading: both read them by
  `simKitsFromBytes` over the same archive's bytes.
- (F) the same file's fixture case: a real `MatchServer.makeForgeRoom` (Crossroads base; MP6 SEAL 1, MP72 SEAL 2, MP2
  TERRORIST 2, and `MP999`) gives the room the donors' kits and hit bodies, independently read off the fixture archives,
  and notes `MP999` "would not load".
- (U) `central/test/forgeLobby.test.ts`: a roster taken; `MP999` refused in the archive words; `layoutArchives` asks for
  a roster map, a placed door's archive and every source; a host lacking a roster map not eligible; the reload's two
  outcomes; `reverb` still refused in today's words. `creator-contracts/test/heldSettings.test.ts` and
  `viewer/test/forge/lobbyHeldSettings.test.ts`: the list is the four world settings.
- (U) `viewer/test/forge/lobbyArmory.test.ts`: with a roster (a SEAL side of one lent column against the base's two, a
  Terrorist side of two against one), with and without an arsenal pick and under EQlimit 1, a real `Armory` behind a real
  `ForgeLobbyArmory` offers exactly the columns a real `Room` accepts (`armoryTypeAllowed` over the room's kits) and, for
  each, the room's `loadout` answer; the lent column's entry follows the composed kit, its portrait the base column's.
  page.ts's half (the roster composed into the window's map) is held on its source (`lobbyHeldSettings.test.ts`).
- (P) `match/test/forgeRoomRoster.devdisc.test.ts`: over every MP map the disc holds as a donor, each of its types lent to
  one base (and every base given one donor), each lent column's kit and skeleton exist, every item id in a lent kit is one
  the disc's `ZWEAPON.ZAR` table holds (or 254 / 255), and the room's step returns what the page's returns for one input.
  Written; skipped without the disc; run on the boxes.

## 6. Limits and what is not done

- **Nothing new persists on a room between matches** (source inspection of `makeForgeRoom`): the donors are read and the
  kits and skeletons fixed at the room's construction, from the lobby's layout, as FN-1a's arsenal.
- **The degraded skeleton case** (section 2): the room's fallback and the page's differ in which first body stands in.
- **A page that cannot load a donor map disagrees with the room on the columns** (FN-1b's fresh review, finding 1;
  source inspection): the page's donor loader caches a failed load as none (`viewer/src/forge/page.ts`
  `hostageLibOf`), so a page whose origin does not serve a donor map, or whose load of it fails, drops that column
  (`withRoster`: "would not load") while the room on an eligible host keeps it -- that page's ARMORY window then shows
  fewer columns and its type indexes name other kits and bodies than the room's. The class is not new (a page that
  cannot load an archive the room holds already misses that archive's placed doors and pieces), but with a roster it
  is a type-index disagreement. Not changed here: central asks the HOST for every donor archive, nothing asks the
  page; whether such a page should be refused the lobby is a question for the main controller, not built.
- **Portraits and captions** of a lent column are the base's (section 4).
- **Deploy order** (as FN-1a's, research 424's review finding 7): a host's forge process older than this branch still
  holds `characters` in its list and refuses to boot a placed lobby carrying it (`match/src/forgeProcess.ts` about :171, the boot's
  `onlineCreatorLayoutRefusal` -> `bootFailed 'layout'`); update hosts before central.
- **Not measured on the original**: the original has no roster; every type, kit and skeleton is the disc's own mechanism,
  lent across maps by the layout (OT.R112's class 1).

## 7. A LATER row for the seat (not written here)

"FN-1b (research 425 section 4): a lent ARMORY column shows the base map's portrait at its column (none past the base's
columns) and the screen's own caption, not the donor's. The donor's portrait is its own map's `EMnn_TXR` image named by
its `UiVars` `Seal1..4` / `Terr1..4`; carrying it means reading the donor's equipment library and `UiVars` into the
ARMORY's data (`armoryData.ts`, `@s2u/scene` `armoryRoster`) -- for the lobby window and local Forge Play alike. Product
track (presentation of an adaptation); the original has no lent column to compare."
