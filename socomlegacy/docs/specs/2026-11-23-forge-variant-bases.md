# The Forge's variant bases and the lighting controls a layout lacks -- a spec for crispy (DAY-12)

Product track (DAY.R1; AGENTS.md "Two tracks"): the Forge has no original (FG.R2), and nothing here changes what a
standard match does. Written 2026-11-23T02:15Z against `agent/day-mode` at `39514b4f7e` by the day lane's DAY-12 seat,
from the plan `docs/plans/2026-11-23-day-mode.md` (the DAY-12 brief, DAY.R2-R4, DAY.R9, "Risks"). The Forge is crispy's
to rule on (MISSION OT.R112 as strengthened 2026-11-14; `docs/plans/2026-11-13-forge-crispy2.md` FC2.R10 (a)): each
proposal below is his to accept, change or refuse. A spec only: nothing is built. Paths are under `socomlegacy/packages/`
unless named otherwise; "inferred" marks a claim read from the code and not run. `withVariant` and `VariantProfile` are
DAY-2's (`viewer/src/variants/`, not at this head) and the variant table DAY-1's (`archive/src/mapNames.ts` holds no
variant at this head): this spec is written against DAY-2's brief.

The owner's word (NXS.R4, verbatim): "we do want forge to match, it gets these options with the patch applied as new
bases, and new lighting controls should be spec'd if we used some of that it does not have access to."

## 1. A variant becomes a Forge base

- **The shape.** `LayoutBase` (`creator-contracts/src/layout.ts:29-35`; its map member :31) gains an optional field on
  the map member only: `{ kind: "map"; archive: string; variant?: "day" | "night" }`. Absent: the disc's map, as today. A
  pair not in DAY-1's table is refused by the reader (DAY.R2). Blank floors and content bases take none.
- **Where the profile applies.** The brief says before `withLayoutEnvironment` (`viewer/src/forge/composeLayout.ts:131`).
  The line is right, but alone it is too late: :131 is inside `composeLayoutFinish`, reached only by Play and a lobby
  (`viewer/src/forge/page.ts:15398`); the editor draws the base from `prepareBase` (`page.ts:13540-13547`:
  `archives.load(stem)` at :13543, then `buildWorld(map)` at :13547) and never passes through it. Proposed: apply
  `withVariant(map, profile)` once in `prepareBase`, between :13543 and :13547, so `baseMap` (:13567) is the variant map.
  The editor's world, `composeGround`'s `groundMap` (:13293), `composeForMatch`'s base (:15311-15321) and the finish at
  :131 then all read it, in the order disc -> variant -> the layout's own settings (`ownEnvironment.ts:19-43`): a
  layout's rig, fog or night still lies over the variant's as it lies over the disc's. Not inside `archives.load`
  (`viewer/src/forge/archives.ts:186-198`): that cache, keyed by stem, also lends the pieces' libraries
  (`page.ts:15306-15309`); `withVariant` is pure (DAY.R3), so the cache stays the disc's.
- **What the base then shows.** The `LoadedMap` the match's loader builds for that variant (DAY-8), so Forge and official
  are one picture on every renderer (DAY.R3). Two differences remain (inferred): the time-of-day slider
  (`viewer/src/forge/lighting.ts:56-111`) still grades over it when the layout sets `timeOfDay` -- its baseline is
  calibrated per base map (`lighting.ts:18-25`), so a variant base gets its own; and pieces placed from the base's own
  archive keep their baked colours (the plan's "Props stay night").
- **The record.** The record v3 writes the base as text (`baseText`, `layout.ts:2351`), checked against `STEM`
  (`/^[A-Z]{1,3}\d{1,3}$/`, :2220) at :2843. Proposed: a record field `baseVariant?: "day" | "night"` beside `base`,
  written only when set (as `contentBase` is), so a layout with no variant writes the text it always wrote.
- **Without the data.** Where the variant's data is not in the build (DAY.R9: a release build before the owner's word),
  there is no profile: the editor says "this base's variant is not in this build" and draws the disc's map, never a half
  picture (DAY.R3).

## 2. What a layout cannot set today -- each a proposed control

On a disc map a layout sets today: the light rig, the drop-shadow direction, the fog colour, the fog's on, near and band,
and night (`ownEnvironment.ts:25-42`; FC2.R2 (2)); the fog distance and the legacy dimmer (`matchMap` `withSettings`);
and the time-of-day grade (`lighting.ts`, on three's node materials only). It cannot set the five below. Each proposed
control applies on the CPU to the base map in `prepareBase`, after the variant, for DAY.R3's reasons (every renderer
draws it, no shader edit), and is written only when set (section 3).

| control | type | default | where it applies | what it cannot do |
|---|---|---|---|---|
| `settings.worldGrade` | `{ lift: [r,g,b]; gamma: [r,g,b]; gain: [r,g,b]; saturation: number } \| null` | null: the disc's (or the variant's) vertex colours | every `map.world` part's `colors`, rgb only, except sky parts and additively or destination-blended parts (DAY-2's rule) | repaint vertex by vertex: a colour pack (MP5's ~60 KB, keyed by DAY.R4) stays a variant base's or a creator pack's, never a layout field; props' colours untouched |
| `hiddenWorld` (top level, beside `hidden`) | `string[]`, world texture names | absent: none | world parts whose `textureName` is listed leave the draw (DAY-2's `hideTextures`): a moon, stars, light rays | hide one draw of a texture and keep another: world draws are merged by texture (`viewer/src/loadMap.ts:1162-1185`, the group key :1179); `hidden` stays props only (`forge/hide.ts:9-14`, `placementOf` :20-28) |
| `settings.skyFrom`, widened | `string \| null` (unchanged) | null: the map's own sky | a disc-map base too: `ownEnvironment.ts:23` (`base === 'blank'`), `page.ts:15393` (the dome's library loaded for blank only) and the editor's `drawSky` (`page.ts:5457`) widened | take the map's own dome away by itself: that needs `hiddenWorld` naming the dome's textures |
| `settings.textureSwaps`, `settings.textureGrade` | `Record<string, string>`: a base texture -> `texture.<MAP>.<name>` (the id geometry lends textures by, `forge/geometry/geometryFile.ts:21-22`); `{ names: string[] }` plus `worldGrade`'s grade | absent | `map.textures[name]` replaced or graded, its `textureMips` dropped (as DAY-2) | bring a texture the disc does not hold (a creator pack's); change UVs or a texture's flags |
| `settings.glow` | `{ scale: number } \| null`, scale 0..1 | null: glows as today | a fourth class `glow` in `createForgeLighting` (`lighting.ts:83`), its rgb scaled by `scale` on the day side of `timeOfDay` | reach the raw path (three node materials only; section 4, 2); change a placed flare's own behaviour |

- **The name filter is a separate bug (a LATER row, DAY-0).** The slider skips every object whose name matches
  `/shadow|glow|flare|beam/i`, with its children (`lighting.ts:75`), and every such material (:83). World meshes are
  named by their texture (`viewer/src/world.ts:1214`, `mesh.name = part.textureName ?? 'untextured'`), so ordinary
  textures match: `alaska4d_steelbeam01.tif` (named by the hand-off, `agent-mail/handoffs/stage2/HANDOFF-day-mode-2026-11-22.md`
  :67; not re-read off the disc here) stays ungraded in a day layout. A fix classes by draw state (the blend test already
  on :83), not by name. Not part of this spec.

## 3. Compatibility

- **Settings are strict.** `SETTINGS_FIELDS` (`layout.ts:466`) and `parseSettings` (:569; refusal at :572, `settings
  names no field <k>`) run for the layout file (`parseLayout`, :1765) and the record check (:2808). Central parses each
  lobby's layout (`central/src/forgeLobby.ts:773`, 400 `refused: 'layout'`), the host its boot's
  (`match/src/forgeProcess.ts:168`), and a page every save and share code: a build older than a new settings field
  refuses a layout carrying it, for one release.
- **The base is not.** `parseLayout` rebuilds a map base from `kind` and `archive` only (`layout.ts:1524`), so an older
  build reading `base.variant` drops it silently and draws the disc's map (inferred: no strictness on the base or the top
  level found in :1517-1800). In a Forge lobby that is one page drawing night beside others drawing day -- cosmetic, as
  nothing in the room reads colours (the plan's "Desync: none expected"), but visible.
- **Staging, proposed: three routes the code already has, used together.**
  1. **Written only when set.** The precedent is record v4 (FN-4; `docs/specs/2026-10-25-layout-record-v3.md`, "Version
     4": written only when a piece's angle needs it). A layout using no new control writes byte-identical text, so only
     a layout that uses one meets an older build, and that build refuses it loudly (settings) rather than guessing.
  2. **Held online first.** A new environment control enters `ONLINE_HELD_SETTINGS_ADAPTATION` (`layout.ts:3463-3465`,
     FC2.R8): the page strips it before a lobby (`withoutHeldSettings`, `page.ts:15330`, :15814, :16153), so central and
     the host never see it, and it plays in local Forge Play at once. It is lifted from the list only in a release after
     the one that put it in `SETTINGS_FIELDS`, when every central, host and page reads it -- the brief's "accepted
     everywhere one release before any page writes it", with no lost release for local play.
  3. **The variant rides the join gate.** For a lobby on a variant base, an older page is kept out by DAY.R6's bump
     (`PROTOCOL_VERSION` 19 -> 20) or, under its alternative, by the hello's `variants: true` (as `cranes: true`,
     `viewer/src/net/client.ts:434`) refusing a variant room. Inferred to cover Forge lobbies too; DAY-7a should pin it.
     Central and the host pass the text through unchanged (`forgeLobby.ts:915` places `lobby.text`).

## 4. Open points for crispy

1. **The pack key on the Forge's own loads.** The Forge's base load is `forgeWorker.ts:159-168`, with
   `{ worldNodes: true }` at :167 (the brief's ":157-161" spans the census load at :157, no options, and the start of
   this one). `worldNodes` only tags triangles (`loadMap.ts:488-493`; `worldNode` :591; `triNodes` :1211) and the merge's
   group key (:1179) holds no node, so the world's parts, order and positions should equal `loadMap` with no options, and
   DAY.R4's key should hold (inferred, unmeasured; a test in DAY-2 or DAY-P1a that the key matches on both loads settles
   it). This contradicts the plan's Risks line that the Forge's `worldNodes` gives a mismatch. What does change
   `map.world` in the Forge is an edited geometry (`Layout.geometry`, `layout.ts:166-173`; `editedMap`, `page.ts:13293`,
   `forge/geometry/editor.ts:1359`): with the variant applied in `prepareBase`, the edit is made over the variant and its
   meshes save with the variant's colours (inferred: `forge/geometry/worldMesh.ts:16` lists `colors` among the edited
   attributes). Is an edited variant base still a variant base, or a disc base with baked colours?
2. **Forge Play on the raw path.** A variant base is CPU-side and draws the same on any path (DAY.R3). Only `timeOfDay`
   (and the proposed `glow`) are three-bound: `createForgeLighting` replaces node materials' `setupOutput`
   (`lighting.ts:97-105`), with no raw equivalent (`agent-mail/planning/renderer-convergence/SCOPE.md`, "Wants from the
   planner" 2). Whether Forge Play and Forge lobbies move to the raw WebGL2 path in Phase 2 or stay on three until
   Phase 4 is his; if they move, the time-of-day grade needs a raw (or CPU) form first.
3. **FN.R3's class for a variant base.** FN.R3 (`docs/plans/2026-11-14-forge-next.md:30-36`; the owner, "first is
   good"): class 1 is the disc map's environment UNCHANGED; FC2-5's draft (`docs/plans/2026-11-13-forge-crispy2.md:192-214`)
   puts the rig, fog, night, another map's sky, reverb, the view and the surface in class 2 or Forge Play only. Two
   readings: (A) a variant is not the disc's environment, so a variant base is class 2, as any lighting change; (B) an
   accepted variant (DAY.R7) is the release's own official look, a row of CREATE GAME, so a variant base with no class-2
   setting is class 1, and every control of section 2 is class 2. The lane recommends (B) once a variant is accepted and
   (A) before (an unaccepted variant is offered on test and nightly hosts only). FN.R3 is the owner's ruling: a reading
   that widens it goes to him as a `HUMAN_TASKS.md` row.
4. **The controls' surface.** Which of section 2's five he wants, their names, and where they sit in his panels
   (OT.R112: the Forge's UI is his).

## 5. Not in this spec

- Code and tests; the variants' profile values (DAY-2, DAY-P1a..P3).
- A colour pack as a layout field; a props colour pack (the plan's "Props stay night").
- The slider's name-filter fix (its LATER row, DAY-0).
- Forge lobbies' online classes beyond the variant base (FN-1, CMV).
- The raw renderer's own form of the Forge grade (the renderer-convergence lane).
- Variants of blank floors or content (authored-map) bases.
