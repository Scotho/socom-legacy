# Layout record v3 -- the contract (FCW-07a, part 1)

Product adaptation, 2026-10-25 (OT.R53 product track). The forge has no original: the record is the project's own
save format, and nothing the game does changes -- the room reads the same known fields it read before
(`applyForgeObjectives`, `forgeBombActions`, pinned in `viewer/test/forge/recordV3.test.ts`). The plan of record is
`docs/plans/2026-10-24-forge-creator-wishlist.md`, FCW-07a and "Shared interfaces"; the code is
`packages/creator-contracts/src/{layout,content,actors}.ts` (`@s2u/creator-contracts`), re-exported by the viewer's
`forge/layout.ts` and `forge/record.ts`, and the saves writer `viewer/src/forge/savesStore.ts`.

## One reader

`readCreatorRecord(text, {name?, available?, modes?}) -> {record, warnings, missing}` reads a layout file (v1,
`{forge: 1}`), a record v2 (`{v: 2}`) and a record v3, and gives a record v3. It throws with the reason (`not a forge
layout: ...`, or the file parse's own) for anything else. Pure: no DOM, no Node API. The viewer's `readSaved(text,
name)` is its `.record`; a share code decodes through it (records only -- a v1 file is not a share code's content);
the agent's `layout.import` admits a v3 record. `checkCreatorRecord(r, {modes?})` (the viewer's `checkRecord`) admits
a v2 record by its own check, unchanged, and a v3 record strictly. A server's policy runs the same check.

## The record v3

| field | rule |
|---|---|
| `schema`, `version` | `"forge-layout"`, `3` (`RECORD_SCHEMA`, `RECORD_VERSION`) |
| `name`, `base` | as v2: 1-48 printable characters; an archive stem, `blank:<stem>` or `blank:floor`; and (FCW-10, S3b) `content:<stem>`, an authored map with `<stem>` its library |
| `contentBase?` | `{ref: PackRef, mapId}`: the authored map a `content:<stem>` base stands on, present exactly then (the layout's `ContentLayoutBase {kind: "content", ref, mapId, library}`); its pack is among `requires`, derived as a piece's pack is; a v2 record never carries it |
| `assets` | each once, first-use order: a disc id `<ARCHIVE>:<prototype>`, or a `ContentRef` `{kind: "pack", pack: {id, version, hash}, assetId}` |
| `pieces`, `spawns`, `npcs?` | the v2 rows, unchanged: `[asset#, x, y, z, yawDeg, locked?]`, `[team, x, y, z, yawDeg, locked?]`, `[side, type, x, y, z, yawDeg, locked?]`; a coordinate a multiple of `1 / RECORD_POSITION_DENOMINATOR` (10) |
| `ids` | `{pieces, spawns, npcs?, bomb?, sites?}`: one authored id per row in row order (`bomb` the bomb's start, `sites` its plant sites); `npcs`, `bomb`, `sites` exactly when those rows exist |
| `hidden?`, `settings?`, `camera?`, `missing?` | as v2 |
| `objectives?` | strict: `gameType` (1..5) and `bomb` `{start?, startLocked?, sites: [{team, at, yaw, range, elevation, locked?}]}`, points at one decimal; no other key at any level |
| `requires?` | every pack the record needs, each once, sorted by `<id>@<version>#<hash>`: derived from the content its pieces name, plus the packs the layout declares (`Layout.requires`); 1-64 |
| `mode?` | `{id, version, params}`, admitted only when the build's mode catalogue (`modes`, FCW-07b's) names it |
| `zones?` (FCW-30) | `{id, shape: "cylinder", at, radius, height, locked?}` or `{id, shape: "box", at, size, yaw, locked?}`: a rules pack's volumes; absent when empty |
| `markers?` (FCW-30) | `{id, at, yaw, locked?}`: named points; absent when empty |
| `spawners?` (FCW-30) | `{id, source, at, yaw, radius, team?, side?, type?, locked?}`: `team` (`A`/`B`) for players, `side` and `type` for NPCs, neither for items; absent when empty |
| `legacyCarry?` | `{version: 1, objectives?, bomb?, sites?}`: the legacy members below |

The three entity lists share the record's one id space with the rows' `ids`. An earlier build's check refuses a record
carrying them by name (`unknown field zones`); without them a record's text is unchanged (no version step, FCW-10's
`contentBase` precedent).

Refused: an unknown top-level key; an unknown objective kind (`objectives.zones`), bomb key or site key in `objectives`;
a game type outside 1..5; a mode not in the catalogue; an id that is not 1-64 of `A-Z a-z 0-9 _ . -`; a duplicate id
anywhere in the record (across kinds); an `ids` list that is not one per row; a content asset whose pack `requires`
does not name with the same id, version and hash; a `requires` naming one id and version twice; a carry naming a key
this build reads or a site that is not there. No revision ref is persisted.

## Stable authored ids and the migration

A v1 file's rows and a v2 record's rows take their kind's default from their position: `p<i>`, `s<i>`, `n<i>`, `b0`,
`bs<i>` (`ID_PREFIX`). So the same input always yields the same v3 text (`JSON.stringify` of the record, fixed key
order), and v1 -> v3 and v1 -> v2 -> v3 give the same text. Once written, an id stays with its row: `recordOfLayout`
keeps a row's own id, and a row without one takes the first default free from its position (`layoutIds`), so a new
piece after `p0, p2` is `p3`. In a `Layout` (the v1 file, the editor's state), a row's id is optional and a row without
one has its default: `layoutOfRecord` leaves a default id implied (a layout of defaults is the v1 file it was) and
writes any other. An editor that reorders, deletes or copies rows first makes every id explicit (`withIds`); the ids
then ride the layout text, so the history's undo and redo keep them. An id a later row repeats in memory (an editor's
copy of a row) is the first row's and the copy takes a fresh one; a file or a record that repeats one is refused.

The bomb's start and its sites have no row of their own in a layout: their ids live in a parallel section,
`Layout.ids = {bomb?, sites?}` (`bomb` the start's, `sites` one per site in order), never inside the objectives -- as in
the record, where they are `ids.bomb` and `ids.sites`. An `id` on a site or a `startId` on the bomb was an unknown key
before v3 and stays one: a legacy member carried inert (below), never read as an authored id (the review's F2), so a v2
save whose site names `id: "north site"` or `id: 3` reads as it did. The layout file's `ids` section is checked for
shape only (authored ids, at most `BOMB_SITES_MAX` sites); an entry missing is its default, and the record's check holds
the record's `ids` to one per row.

## Legacy members, carried inert

A v1 file's or a v2 record's objectives may hold keys this build does not read (a later build's, or a hand edit) at
three levels: the objectives block, the bomb, and a site (a site's `id` and the bomb's `startId` among them). They are
read as before (`parseLayout` keeps them), and the
migration moves each set into `legacyCarry` (`objectives`, `bomb`, and `sites` keyed by the site's id). Nothing reads
them; `layoutOfRecord` puts each back at its own path, so a legacy export (`serializeLayout`) keeps each value byte for
byte. Each carried member is a non-blocking warning (`record.LEGACY_CARRY`, source `check`, severity `warning`, its
field path, a site's id); the record is admitted as any other (`checkRecord` null) and plays as before. A known value
that is invalid still fails beside them.

## Pack references and missing packs

A record holds references only, never a pack's bytes (the registry, FCW-06, owns those; H276). The record's `requires`
is derived (the review's F1): `recordOfLayout` lists the packs its pieces' content names plus the layout's declared
`requires`, and `layoutOfRecord` gives back only the declared ones (those no piece's content names), so deleting a
pack's last piece and saving drops the pack. `readCreatorRecord`'s `missing` lists the record's `requires` not among
`available` (same id, version and hash); with no `available`, all of them.
A record with missing packs is still read and edited whole -- every piece kept, a pack piece's layout key
`contentAssetKey(ref)` (`pack:<id>@<version>#<hash12>/<assetId>`, a label, never read as a disc archive) -- and part 2's
UI blocks Play on `missing` without discarding work. `onlineRecordRefusal(record)` is the online policy (H273, H274):
`record.ONLINE_CONTENT_MAP` for a `contentBase` (FCW-10, S3b), `record.ONLINE_PACKS` for any `requires`,
`record.ONLINE_MODE` for a `mode`; the same record reads and plays locally. `onlineCreatorLayoutRefusal(layout)` is the
same policy over a parsed layout file, one body (`onlineLayoutRefusal` is its earlier name and calls it): a content base,
the base's pack, any piece's `content`, any declared `requires`, any `mode`. It is wired where a server holds a layout:
central's forge lobby create and its restart's re-parse
(`central/src/forgeLobby.ts`: refused `layout`, the refusal any layout it will not take answers; at the restart the row
dropped `layout`), and the match host's forge process (`match/src/forgeProcess.ts`: `bootFailed 'layout'`).

## Actors

`actorsOfRecord(record)` lists the team spawns and the NPC seats as `ActorSpec`s (`{id, kind: "spawn" | "npc", at,
yaw, locked}` plus `team`, or `side` and `type`). FCW-12b extends it (profiles, routes); concrete modes come later.

## The share code

A code carries the v3 record gzipped (a v2 record is migrated before it is encoded); a v2 code still decodes,
migrated. The 12,000-character link limit is unchanged: past it the offer is the file, never a cut link. The ids cost
little under gzip (a 300-piece layout's v3 code is within 1.5 times its v2 code: `viewer/test/forge/share.test.ts`).

## The one saves writer -- `SavesStore`

IndexedDB database `s2u-forge` (version 1), one object store per list -- `saves`, `savesAside`, `autosaveAside` -- each
holding one record `{generation, text}`, and a `meta` store for the migration's marker.

- `open()`; `read(store) -> {generation, text}` (`{0, null}` when never written);
- `write(store, text, expectedGeneration) -> "written" | "conflict" | "refused"`: in ONE readwrite transaction it
  reads the record and puts `generation + 1` only when the generation is still the one expected, else `conflict`
  and nothing written. IndexedDB serializes readwrite transactions on a store, so of two writers from the same
  generation (two tabs, an agent and a person) one wins and the other is told; `refused` for a closed store, a list
  it does not keep, a bad argument or a failed transaction (the quota).
- `migrateFromLocal(store)`: copies `s2u-forge-saves`, `s2u-forge-saves-aside` and `s2u-forge-layout-aside` into
  their stores ONCE, each at generation 1, the marker set in the same transaction; a later call answers `already`.
  When any of the three stores already holds a record (a write reached it first), the migration answers `refused` and
  writes nothing, the marker neither: a list's generation never goes back (the review's F5b). Whether a list is copied
  or renamed out of localStorage (F5a) is part 2's, with the writers.
  First it keeps each text as a recovery copy in localStorage (`<key>-recovered-v3`), read back; an existing recovery
  copy is never written over, none is ever deleted, and when a copy cannot be kept nothing migrates (`refused`).

Part 1 builds the writer only: the page, the Saves card and the agent bridge still read and write the localStorage
lists, so the original keys stay as they are and nothing calls `migrateFromLocal` yet. Part 2 wires every native
writer through `SavesStore` (FCW-06's map adapter consumes it), runs the migration once, and shows `missing`.

## Not in part 1

The UI (open/save, missing-ref recovery, Play blocked on `missing`), the writers' delegation to `SavesStore`, the
autosave's store, a mission block and per-entity typed extension data
(the plan's "Shared interfaces"), the mode catalogue itself (FCW-07b) and a rendered-browser run.
