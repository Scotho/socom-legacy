# Pack format 0.2 and the Forge's import and export (FX; DRAFT for the owner's read)

> Written 2026-11-11T07:05Z on `agent/forge-v4`, cut from `main` at `9002339114`, by the Forge lane's seat
> (redotcom-19). It **replaces** the proposal of PR #750 (`agent/fp-8`, `2026-11-08-pack-format-0.2.md`): that
> document's sections 2-9 are carried here by reference, re-timed and amended. The sprint that builds this is
> [the FX plan](../plans/2026-11-11-forge-export-sprint.md). **An adaptation:** the port's own pack formats and its
> map editor. Nothing here describes or changes what the original game does (product track, OT.R53), bar two collision
> items the plan marks `sim`. **FP.R7 still holds:** no pack of ours goes to Thunderstore before the owner has read
> this. Evidence: five read-only scopes of 2026-11-11 under `agent-mail/evidence/forge-path/scope-2026-11-11/`
> (A1-A5: source inspection at `9002339114`, nothing run) and the week's developer chat
> (`agent-mail/evidence/forge-path/devchat-2026-11-11/devchat.txt`). A value this document proposes is *proposed*:
> no code holds it yet.

## 1. Why now

- The store has nothing of ours: Thunderstore's community `socom-legacy` is live with no package (checked
  2026-11-11). A format change costs no published pack anything today; after the first upload it does.
- The page is served, so every player runs the newest reader. What must keep working is an old **pack** in a new
  build, not a new pack in an old build. Community hosts may lag a release; a pack they cannot read is refused by
  name, never half read.
- Three bodies of work now need things the 0.1.x contract cannot say: the Forge's own maps (tilt, scale, groups,
  scripting, sound), Fuse's zombies (behaviour claims, later a server plugin) and custom maps with their own mesh
  (Phil's). #750's review predates all three (scope A1).
- #750 timed four manifest fields "before 0.1.2 is published". Contract 0.1.2 shipped in v0.4.17 and v0.4.18
  without them (`creator-contracts/src/packs.ts:25`; A1 G1). They land here instead.

## 2. The decisions, in one place

1. **Our format is the native one** (the owner, FX.R1). The original's `ZDB`/`ZAR` files are read on import and
   never stored or published; writing one is a later, local-only tool.
2. **One zip is one pack, and the same zip is a Thunderstore package.** `s2u-pack.json` is ours; `manifest.json`,
   `icon.png`, `README.md` (and `CHANGELOG.md`) are the store's, at the root, outside the pack's digest
   (`packs.ts` `THUNDERSTORE_STORE_FILES`, already so).
3. **A map is a pack member.** Two kinds, both `gameplay`-role JSON, told apart by path:
   - `layouts/<slug>.json`: a Forge layout record, changes over a base map. *New.*
   - `maps/<mapId>.json`: a content map, a whole authored map with its own collision and navigation. *Exists*
     (`maps.ts`).
   A pack holds **one** layout (its one `rules/mode.json` and `rules/map.json` are that layout's; A3) and any
   number of content maps. A set of maps is a pack whose dependencies are the maps' packs, the store's own way.
   No new role and no manifest pointer: the path is the convention, as it already is for content maps (A3).
4. **A map's own pack is never in its own `requires`.** A member cannot hold the hash of the pack it sits in; the
   reader attaches the pack's reference after validation, as it does for a content map's own props (`maps.ts`, S3d).
5. **Other packs are referenced, never carried.** They are `dependencies` in our manifest and exact
   `Team-Name-x.y.z` strings in the store's, each under **its own** team (today `thunderstoreManifest` pins every
   one under the exporter's team, `packs.ts:1347`: a bug, fixed here).
6. **The layout record stays version 3 and grows by optional fields** (A2), as `zones` and `contentBase` were
   added: a layout that uses none of them saves byte for byte as today, and a reader that does not know one refuses
   the record by name.
7. **Scripting is rules data the engine runs, never code** (H343 stands). A layout's script is a rules member in its
   pack.
8. **Contract 0.2.0 in one step.** A build holds a **list** of the contract versions it reads (at 0.2.0:
   `0.1.2` and `0.2.0`), and a pack is read when its `contract` range matches **any one** of them. Today
   `readManifest` tests one version (`packs.ts:584-587`), so a 0.2.0 build would refuse every `^0.1.1` pack: each
   Forge rules draft (`viewer/src/forge/rulesAuthoring.ts:63`) and Fuse's. A writer writes the lowest range its
   content needs: a pack that uses no 0.2 field keeps `^0.1.1`; one that does (a layout member, `poses`,
   `license`) writes `^0.2.0`. Later additive fields are 0.2.x.

## 3. The pack at 0.2

Carried from #750 with its reasons (read there): sections 2 (forward compatibility), 3 (licence and provenance),
4 (identity), 6 (limits), 7 (withdrawal), 9 (conformance fixtures). What changes against it:

| part | 0.2 as built here | against #750 |
|---|---|---|
| versions | a build accepts a **set** of contract versions; a pack writes a range | lands now, not "at 0.2 later" |
| `extensions` | one object, at most 16 KiB, skipped by readers that do not know its keys | as proposed; lands at 0.2.0 |
| `license`, `authors` | an SPDX id; names only. Required by the **export to the store**, optional in a local pack | as proposed |
| per-file `provenance` | `original`, `derived` (from a named pack, or `import` from a file the player supplied), `extracted` (refused) | `zdb-import` widened to `import`, section 5 below |
| kinds | `content`, `rules`, `system`, and **`plugin` reserved**: `sides: server` only, never applied by a page; its runtime is Fuse's design (OT.R118) | new (A1 G9) |
| `sides` | read: a page never applies a `server` pack's members; the join check names `client` and `both` packs | was checked, read by nothing (A1 G13) |
| behaviour claims | every reader passes the build's published handler list (`handlers.ts`); the Mods screen stops refusing a pack that claims `behaviour.npc.patrol` | new (A1 G8; `viewer/src/packs/registry.ts:230`) |
| ids | *proposed, the owner's call (H442 k):* a published id is team-prefixed. A published `id@version` never changes bytes; a rename is a new pack | as proposed; the project's own team is `SOCOM_Legacy` (FX.R2); a creator's export goes under the creator's team (H442 m) |
| targets, textures through v2 | unchanged from #750 sections 5 and 8 | not in this sprint |

**Mesh and audio apply** (A1 G10). Today the `mesh` and `audio` roles are validated and never used. The format says
at 0.2 where they apply: where a map or a rule names them, in the Forge, the test room and a Forge lobby, under
section 6's limits. The code that applies them is FX-18, in the plan's third wave, not this batch. Nothing in a
standard match reads a pack.

**Withdrawal and the HD pack's README** are #750's sections 7 and its H-FP8-c, unchanged and the owner's
(H442 l and i).

## 4. The map

**The two classes** (the owner, chat 2026-11-10):
- **Disc-only**: a layout over a retail map, using retail assets, no `requires`. It carries no game data: it *names*
  assets, the player's disc supplies them. It may be shared as a link, a file or a pack, and plays in our lobbies.
- **Modded**: anything that needs a pack (assets, a content-map base, a rules mode). It plays offline and on
  community servers behind the join check (the community-mods spec, CM-1/CM-2); our own lobbies keep refusing it
  until the owner says otherwise (H442 g).

**The layout record's new optional fields** (version 3, contract 0.2.0):

| field | shape | from |
|---|---|---|
| `poses` | rows `[pieceIndex, pitch°, roll°, sx, sy, sz]`, only for a piece that is tilted or scaled; whole degrees in the editor's YXZ order beside the row's own yaw; scale per axis on a 0.01 lattice, *proposed* 0.1 to 4 | A2 |
| `groups` | rows `{id, name?, members: [ids]}`: which pieces belong together. Flat: a group holds pieces, never groups. A prefab is the editor's library entry that stamps pieces plus a group | A2 |
| `sounds`, audio settings | *shape waits on Crispy's own data* (FX.R10): a placed sound and the map's reverb setting | A4 |
| `archives` | the retail archives a layout borrows assets from, so a joiner's disc and a server's data can be checked before the match | A1 G12, A5 |

Markers (spawns, NPCs, hostages and the rest) keep a yaw only. Central refuses a sheared, mirrored or zero-scale
piece, which it admits today (A2: an exploit in Forge lobbies only, closed first).

**Collision for a tilted or scaled piece** (the owner: "collision and all"). The page and the server already carry a
piece's whole matrix into the hull (A2). Two gaps, both `sim` review: the climb's frame on a piece scaled
unevenly, and a surface's floor/wall flag, which is the disc's and so stays "wall" when a wall is laid flat.
*Proposed:* for a tilted piece only, the flag is re-derived from the placed polygon's own slope; an untilted piece
keeps the disc's flag, so nothing that exists changes (H442 a).

**The script.** Crispy's switch actions (play a sound, an effect, a message; show or hide an object; a trigger or a
charge on any object) become rules: the vocabulary already has `interact`, `message.show`, `cue.play`,
`door.open`, `player.eliminate` (`rules.ts:77-91`) and gains general actions for object show/hide, an effect at an
entity, a sound at a point, and damage at an entity. A layout's script is `rules/map.json` in its pack and runs under
any mode; a game mode is `rules/mode.json`, as `buildRulesPack` writes today. How the two compose is designed with
Crispy's data in hand (FX-16), not guessed here.

## 5. The Forge's import and export

**Save** is unchanged: the browser's own saves and autosave. The share link stays, for disc-only layouts.

**Export** is new and writes the pack zip (A3):

```text
my-map.zip
  s2u-pack.json            ours: id, version, kinds, files, dependencies, license, authors
  manifest.json            the store's: name, version_number, website_url, description, dependencies
  icon.png                 256x256, a generated top-down plan of the map (no disc pixels)
  README.md                generated: what the map is, what it needs, licence and authors
  layouts/<slug>.json      the layout record
  rules/mode.json          its game mode, when the layout has a rules draft
  rules/map.json           its script, when it has one
```

- One writer, two outputs: **Pack** (dependencies referenced, store-ready) and, later in the sprint, **Pack with
  dependencies included** (one file to hand to a friend, the map's pack and the packs it needs; the page cannot
  fetch from the store yet).
- The export refuses: a member that is disc data (a fixed list of allowed member kinds, strict readers, and a
  disc-backed scan in the tests); `extracted` provenance; for the store, a pack with no licence or an unknown team.
- The icon is a drawn plan by default. A viewport capture is a picture of the game's own textures going to a store:
  the owner's call (H442 f).
- An installed rules pack a layout uses is a dependency; the layout's **own** rules draft is folded into its pack.
- The agent gets the same act as `forge.export`.

**Import** has one front door, the same for the Forge's Open and the Mods screen:

| what is dropped | what happens |
|---|---|
| a pack with `layouts/` or `maps/` members | installed; its maps appear under Custom Maps, read-only, "Save as" makes a copy; a missing dependency is **listed**, not a refusal |
| a bare layout `.json` (v1, v2, v3), a `forge-authoring` envelope, a `forge-bundle.json` zip | read as today, for good; converted when saved or exported |
| a store zip downloaded by hand | the same as a pack |
| a model (GLB) with collision | a converter writes a content map into a local pack: the route for a full-mesh custom map, Phil's the first test (FX.R9) |
| a `ZDB`/`ZAR` the player supplies | a converter writes a content map into a local pack; SOCOM II first, then the other titles' variants |

A converted map is `derived: import` and **stays on the device**: that is H275's default (device-local only) and
it stands. *Proposed, for the owner's word (H442 j):* a converted map none of whose members matches a known disc
file may be published as its author's `original` work with a licence (A1 G6: a SocomMapBuilder map is a modder's
own). A map converted from **another title's** file can never match this disc's list, so the proposal does not
reach it: it stays on the device whatever the list says (A1 G7). The disc-file fingerprint list is a task of its
own and gates the first converted upload, not the converters.

**Export to `ZDB`** is last, local only, and limited to what the original engine can hold. Not in this sprint.

## 6. What this does not decide

- Whether the page fetches from Thunderstore's API (an outside service: H342's second half, the owner's).
- Programmatic creator code (H343's level 3): closed.
- Rules-mode and modded layouts in **our** lobbies (H442 g).
- Persistent progression and join/leave events for community servers (A1 G15): later.

## 7. What it asks the owner

One row, [H442](../HUMAN_TASKS.md), with the default each part follows meanwhile; it carries the questions #750
asked and never filed (its H-FP8-b, c, d, f, g) beside this sprint's own. H342's name is answered
(`SOCOM_Legacy`); the team itself is made on thunderstore.io by the owner when there is something to upload.
