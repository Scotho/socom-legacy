# 367 -- SocomMapBuilder (FatalityDevelopment), surveyed against redotcom's readers and the forge

Written 2026-10-25 in the owner's seat, at his ask ("check out how this project is doing forge and how it compares to
ours"). **Confidence: source inspection of a third-party tool, plus our own readers' notes it is compared with. Nothing
in the original survey is a reading of the original; nothing is cited from the tool as evidence of the game.**
R4B-00's original-source correction in §3 (2026-11-04) is separately **reading, pending review**. What was read: the
repository https://github.com/FatalityDevelopment/SocomMapBuilder at `master` 2a90555f (one squashed commit dated
2026-10-25, 164 files, no licence file), its `docs/formats/` (545 lines) and its server and page sources.
[Corrected 2026-11-11, C1: `master` is now bb53b753ad, 216 commits, with a GPL-3.0 `LICENSE.txt`.]

**Superseded in part (the corrections of 2026-11-11, below):** the survey of 2026-10-25 describes the repository at
2a90555f; where its `master` has moved on (C1-C4), the corrections win. §3's AIMAPS verdict still holds (C5); the
rest of §3 and §4-§6 were not re-read against it.

## Corrections of 2026-11-11 (its `master` at bb53b753ad)

Written 2026-11-11 in the Forge lane's seat (redotcom-19). Evidence: **source inspection of the public repository
through GitHub's API on 2026-11-11, nothing cloned, built or run; every layout below is a lead until re-read on a
disc's bytes.** Nothing here is a reading of the original. The survey's text stays where it stands, with a bracketed
correction at each place a point is superseded, so the survey of 2026-10-25 can still be read.

- **C1, the commit and the licence.** The survey read `master` 2a90555f (2026-10-25, 164 files, "no licence file").
  `master` is now bb53b753ad (pushed 2026-11-08): 216 commits by one contributor, and a GPL-3.0 `LICENSE.txt` (no
  per-file notices).
- **C2, what it reads now.** A .NET 8 server with one format library (`server/CodeDesigner.Ps2.FileFormats`) and a
  `docs/formats/` page per format. Beyond SOCOM II (read and write) it now reads: SOCOM (SCUS-97134) loose map folders
  (world, props, clutter; not AIMAPS); Combined Assault (SCUS-97545) location archives, worlds, missions, points,
  tables; Fireteam Bravo and Fireteam Bravo 2 (the ZDB with version word 7; worlds, textures, characters, missions);
  Fireteam Bravo 3 (`.ssg` containers). SOCOM 3 is claimed only (no SOCOM 3 check or code found; its retail checks
  are against the Combined Assault disc). Tactical Strike and the SOCOM demo's older ZAR heads are not covered.
- **C3, no collision and no navigation beyond SOCOM II.** For every title but SOCOM II it has no collision reader and
  no navigation cells (its own docs say so).
- **C4, its retail checks are its author's.** Its retail-disc checks run only on its author's machine (CI uses
  synthetic fixtures), so each count and layout is a claim.
- **C5, still true.** Its AIMAPS point layout disagrees with ours by one word (`MapPoints.cs`, §3), so its point
  writes are not evidence.
- **C6, cautions for a clone.** `cds/` holds patch payloads for the r0004 build (never copied or run);
  `Zipper/ZDB/ZdbChecksum.cs` reads as a transliteration of the game's own routine (not to be ported: a standard
  CRC-32 is the fact to prove on disc entries); a checked-in `.mcp.json` means no agent session is opened inside a
  clone.
- **C7, the owner's word on its code.** The owner, 2026-11-11 (the Forge lane's seat): its code may be built, run or
  ported as an EXPERIMENT on the multi-SOCOM test machine, attributed; what ships stays our own readers re-read on the
  disc's bytes.

## 1. What it is

A local editor for the game's own package files, not a port. A .NET 8 server owns an opened `.ZDB` in memory, every
edit is an `ASSET_*` command with undo, and a React plus three.js page previews and sends commands. Save writes a new
`.ZDB`, or a `.CDB` pack (the original r0004 also has a native memory-card path, §3). Its Map Builder page edits GEO
instances (move, duplicate, delete; `worldmodel` refused), `CLUTTER.ZAR` placements (move, add, delete) and the AIMAPS
named points (move, §3); it imports a prop, vehicle, weapon or character from another package with its textures and
palettes. Beyond the map: a model editor, an animation editor for `MOTION_S.ZAR`, an asset browser, and SOCOM 3,
Combined Assault and GTA San Andreas converters. The README credits "Code Designer AI" for the research and the build.
[Corrected 2026-11-11, C2-C4: it now reads SOCOM, Combined Assault and the three Fireteam Bravos beside SOCOM II;
SOCOM 3 is claimed only; no collision or navigation beyond SOCOM II.]

## 2. Against the forge

Different questions. Theirs changes the disc's files so the original game draws them; ours keeps the disc untouched
and composes a layout (a recipe, FG.R3) for our own engine and match server. Theirs writes every format we only read;
ours has everything after placement (Play as the offline match, lobbies on central, NPCs, objectives, settings, saves,
share links, the pad, the map check), which theirs lacks. Neither edits world nodes (their refusal; our FG.R5, FG-3,
FG-6 open). Theirs edits clutter; §4 says how much of that the forge already has.

## 3. Their format claims against our readers

| Their claim | Ours | Verdict |
|---|---|---|
| `nparams` word 22: 7 on a model root, 1 elsewhere | `sceneGraph.ts` `NODE_MODEL` = 7, `NODE_GENERIC` = 1 (reCOM `znode.h`) | agrees |
| `nparams` word 23 flags `0x80800051`, `+0x40000` on visual owners; zeros leave the model unbound in game | we name bits 1-3, 5, 6 and 8-9 (facade); bits 0, 4, 18, 23, 31 unnamed | a histogram over the archives would name nothing we act on; the "unbound" claim is loader behaviour, a `derive-from-desktop` candidate only if GEO is ever written. Not pursued (the owner, 2026-10-25). |
| texture header `+0x08` = TEX0.TBP0 | `loadMap.ts` keys a library's textures by `gsaddr`, the TBP0 and MIPTBP1 space | agrees; already ours |
| `vparams` flag `0x20000` selects int16/32768 (weapons) over /16 | `mesh/interpret.ts` reads the VIF command (`0x70` ITOF15, `0x68` ITOF4; research 15 §0) | the microcode's command is authoritative; the GEO bit can only confirm it. Not pursued. |
| clutter `params`: a matrix layout and a quaternion layout | `scene/clutter.ts` reads both | agrees |
| a `.CDB` pack is mounted natively from `mc0:/BASCUS-97275<NAME>/<NAME>.CDB` | the survey checked retail's strings only; r0004 `FUN_003c8c80` builds `BASCUS-97275<NAME>/<NAME>.CDB` at `0x3c8ec0-0x3c8f0c`, then tries card port 0 followed by port 1 (`0x3c8f80-0x3c90e8`) | **native in the inspected r0004; absent from the inspected retail path** (`FUN_0039c440`, D:L292959-292976). The native card API supplies the port; a literal `mc0:` string is not required. R4B-00 correction, reading, pending review; this does not establish that the tool's output meets every native format/check or that r0004 was the first build with support. |
| AIMAPS named points: `count`, "one more u32", then 24-byte records `{name[16], team u8, kind u8, 2 pad, packed cell u32}`; a move rewrites the cell | research 75 §5.1 and `scene/aimaps.ts`: `count`, then 24-byte records `{u32 loc; char name[16]; u32 word}`, parsed to the last byte on all 22 files; Frostfire's bytes at 0x159d0 read count 6, loc, `PlayerStart`, word, the next loc | **their layout is shifted one word** (`MPS/MapPoints.cs:31-45`): their "one more u32" is the first point's `loc`, their "packed cell" at `+0x14` is the *next* point's `loc`, their team and kind bytes are our `word`'s bytes 0-1 (kind in byte 1 agrees with 75 §5.1). Their move rewrites the following point's cell and the last point reads past the table. Their own doc says the move is unconfirmed in game. The owner passes it on. |
| facade trees turned by the name pattern `*_facade*` | `facadeOf(flags)`, bits 8-9 of the node flags (reCOM) | ours is the engine's rule; nothing to take |

The corrected `.CDB` reading comes from the original instructions, re-read at those r0004 addresses in both
`game/overlays_r0004/socom2_game_r0004.elf` and pristine `game/r0004/served/ftscore.bin`; the path pieces are
strings `0x428018` (`.CDB`), `0x428020` (`BASCUS-97275`) and `0x428030` (`/`). This bounds the old retail-only
negative. No native package-load or tool-export comparison was run; the third-party claim itself is not evidence
of the game's behaviour.

## 4. Clutter in the forge: what is already there, what is not

By source inspection (a browser check on MP2 is owed before any of this is relied on): `loadMap.ts` joins
`CLUTTER.ZAR`'s placements into `LoadedMap.props` (lines 1340-1396, grid cells of kind `clutter`); `forge/library.ts`
`palette()` offers every prototype with geometry bar the world facade model, so bushes and clutter trees are already
placeable pieces; `hidden` keys a placement by model and place, so a disc bush can already be hidden; facade turning is
the view's (`world.ts` `turnFacade` on `facadeOf`), so a placed facade tree turns; clutter has no `di`, so a placed bush
is not solid, as the walk never reaches clutter.

What they have that the forge lacks, filed as LATER 462-464 under the scope ruling of 2026-10-25 (S1-S3 nailed, S4
cut): a uniform scale per piece (the v2 row is yaw-only, FG.R10, while the disc scales clutter per placement through
`scale_inverse`); a scatter tool (N copies on the surface under a brush, random yaw, a scale range, one undo step);
a clutter filter in the assets dock (`clutterPlaced` tells the disc's clutter apart).

## 5. For the MC plan's command layer

A modest help, folded into `plans/2026-10-22-forge-agent-workflow.md` "Research and recommendations" (pass 3): four
plumbing details of their `POST /api/command` worth MC-3's brief. The command vocabulary stays MC-3's.

## 6. Deferred by the owner (2026-10-25)

A layout-to-package bridge (their `moveInstance` / `duplicateInstance` ops describe the same thing as a v2 piece) and
the reverse check (their edited package opened by our loader); their cheat-code loader (`lib_models`, `place_lib`,
`free_guard`) as prior art on what the retail client can load at runtime, beside the extensibility plan.
