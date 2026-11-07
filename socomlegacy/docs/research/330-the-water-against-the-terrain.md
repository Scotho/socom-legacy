# 330 -- The water against the terrain: FISH HOOK's water through the slope (NU-15, PARITY-2)

- Date: 2026-10-15 (01:45Z). The next-update checklist's row NU-15 (the owner's NU.R7, in his batch 2; the gameplay
  lane's). **A read alone** ([brief](../plans/briefs/2026-10-15-nu15-water-through-terrain-read.md)): the build is a
  later brief, from section 5. Branch `agent/nu15-read` from `9cd88266a`.
- Review: a fresh review of `18c22457a` returned **PASS WITH FINDINGS (high)**: the cause holds (the reviewer read the
  walk's two `ZBUF` packets off the ELF and decoded `TEST 0x5000c` itself); the one line at `world.ts:497` judged safe
  against everything drawn after the walk, the engine order the full answer (W1.R3's follow-on). Six findings folded
  here (2026-10-15), each with a "was" beside: B2's TEST decode (F1), the LOD fade twins as a second no-depth path (F2,
  NU15-W3), two more users of `materialSpec.ts:269` (F3), a shoreline in B3 (F4), the map counts (F5), the trace's
  scope and the ELF's packets (F6). The status is unchanged.
- Build (2026-10-15, [the build brief](../plans/briefs/2026-10-15-nu15-walk-depth-build.md), branch `agent/nu15` from
  `812ccb71d`): **B1 and B2 built** (§7), the cited interim fix; the engine order as the default (W1.R3) untouched and
  with the owner. B3, the rendered check, is owed. The build's values are **reading, pending review**: unit tests and a
  dev-disc test, no browser run, no capture.
- Status: **reading, pending review.** Source inspection only: the decompilation was read, the port's code was read,
  committed goldens were read, and the owner's two screenshots were looked at. No game, emulator, reader, test or
  browser was run (no node process at all). Where the port's behaviour is stated it is read off its source, not run.
  Nothing here is proven: no capture of FISH HOOK exists. Nothing counts as a reading until a reviewer who did not write
  this note re-reads it at the source. A step marked *inference* is one interpretive step past the code.
- Sources. `D:L<n>` is a line of `game/analysis/socom2_game.elf.decomp.c` (SHA256
  `B9E863762F08D55602C4310C9491286879CFCF2947683E723BC2905E1AAA42D4`, re-hashed for this note). The disc's data only
  through committed goldens: `packages/scene/test/golden/world-roots.json` (each root's `Material_Palette`, the
  reflection textures), `packages/archive/test/golden/map-archives.json` (stems and names),
  `packages/mesh/test/golden/map-chains.json` and `packages/scene/test/golden/scene-graphs.json` (MP71's counts),
  `packages/gs/test/golden/map-textures.json` (per-map counts; per texture only for Frostfire). The desktop at the
  `ref/desktop` pin, `desktop@be5578311ff2dd33a814d39e7d6d4f2255da4da3`: `docs/research/26-water-polygons.md` (the live
  GS trace of a water draw). The ELF `game/disc/socom2_game.elf` (SHA256
  `06b83684719a78ad0580f236bd0eddd40453f87d9c30c0d39021331915798872`, read only, by its program headers, through a
  scratch script, for the review's F6): the `ZBUF_1` packets at 0x3e1140 and 0x3e1180. The port's lines are this
  branch's base `9cd88266a`. The screenshots:
  `agent-mail/evidence/20261015-fishhook-water-clip.png` and `-clip-2.png` (outside the repository).
- Evidence read first, not restated: research [82](82-map-fidelity-audit.md) D5 (the environment-map pass, which maps'
  palette entries are bound to water), round 4 (the untextured entries' `specular_map.tif`), round 5 D8 (the vertex
  alpha: 1,711 blended packets over the 22 maps, MP71's `sand_beach` among them, MP72 none) and D9 (the alpha pass and
  its `ZMSK`, with the review's correction of 2026-10-03); `desktop@be5578311:docs/research/26-water-polygons.md` §3.2
  (lines 59-86: the `0x34` block's `TEST_1 0x5000c`, the trace `zmsk=0 test=5000c abe=1`; its banner refutes its own
  condition sentence about GL depth quantisation, not the trace).

## The owner's item (NU.R7)

From the checklist (the owner, 2026-10-15 ~01:45Z, verbatim): "Please add this item from fishook. at my present
location at the back of the map on terrorist side, the water is visible on seal side clipping through terrain"

The row (NU-15, its first sentences, verbatim): "**FISH HOOK's water shows through the terrain.** On MP71, from the dirt
rise at the back of the terrorist side looking toward the SEAL side, the water surface is drawn through the slope that
should hide it (NU.R7, the screenshot)."

**The two frames** (the nightly 20261014-6635caa41, offline, both looked at for this note):

- **Spot 1** (`20261015-fishhook-water-clip.png`): the walker on the dirt rise between two stone walls at the back of
  the terrorist side, looking down the rise. Right of the reticle, on the rise's own slope, a pale, cloud-textured
  quadrilateral with straight edges lies over the dirt, roughly level, as a flat surface far beyond the rise would
  project; a few dark shapes inside it are drawn over it (things nearer than it that do occlude it).
- **Spot 2** (`20261015-fishhook-water-clip-2.png`): the SEAL-side beach by the crab traps, looking at the hostage
  building's stairs. On the grass slope right of the stairs, above the traps, a pale, soft-edged, cloud-like patch lies
  over the grass.

Both patches are pale and cloud-textured, not the water's dark body: the look of the environment-map pass whose texture
on MP71 is a sky (§1.1) -- *inference*, `NU15_LEAKED_DRAW_READING` (§6). The cause below covers it whichever late draw
it is.

## 0. Answers

| # | finding | the port | section |
|---|---|---|---|
| R330.1 | **The original writes depth under every draw of the walk and tests it on the water.** `RenderWorld` (`FUN_00339de0`) opens with `FUN_003b7150(0)` (D:L236792), which kicks the `ZBUF_1` packet with `ZMSK` 0 (`FUN_003b7150` D:L308483-308488 -> `FUN_003afe70` D:L304682-304710; research 82 D9 as corrected); the ELF's two packets settle it: 0x3e1180 holds `ZBUF_1` with `ZMSK` 0, 0x3e1140 with `ZMSK` 1 (§1.3); a live trace agrees, `zmsk=0` on 1748 of 1755 submits of a whole trace, not the water's draws alone (research 26 §3.2). (Was: "the live trace has `zmsk=0` on the water's draws" -- the review's F6.) The water's passes test `ZTE` 1, `ZTST` GEQUAL (`TEST_1 0x5000c`, research 26 §3.2): a water fragment behind nearer terrain whose depth is already written fails, whichever of the two the walk drew first -- and a slope drawn after the water overwrites it. Blended terrain packets are no exception: `ZMSK` is the pass's, not the packet's | -- | §1.3 |
| R330.2 | **The reflection is drawn in the visual's own command list, right after its base, inside the walk.** `FUN_003b5b90` (called per visual from `FUN_003b5f20`, D:L307913, D:L307973) appends the `0x34`/`0x36` block between the gate `0x72` and `0x74` (D:L307711, D:L307716-307737, D:L307758-307779, D:L307793), with the GS state of the palette entry's own texture's bind packet (`FUN_003549b0` D:L252528-252530, called at D:L307728 and D:L307770) | the env pass is a second mesh in three's **transparent list** with `depthWrite` false and `LessEqual` (`world.ts:745-747`), numbered after **every** walk draw (`world.ts:769` with `restOrder`, `:840`, `REST_WALK_SCALE` 2^-24, `:256`) | §1.2, §2.3 |
| R330.3 | **The cause (one depth-state line).** In three's order -- `engineOn` false (`world.ts:346`), the default of every page, the match's included (`setup/index.html:235` unchecked; the panel opens at its defaults, `ui.ts:95-101`; the forge's `page.ts:113` off) -- a blended walk draw is put in the transparent list **with no depth written**: `drawState`'s three's branch, `materialSpec.ts:269`, applied to every world and prop draw by `world.ts:497`. A blended terrain packet (a vertex-alpha ramp, `sand_beach` and the grass blends on MP71, research 82 D8) therefore leaves no depth, and every draw the port issues after the walk -- the env passes at +0.75, the alpha pass and the shadow decals at 1, a blended base's detail pass -- is depth-tested only against the **opaque** draws: where a slope is drawn by blended packets alone, the water's reflection (or the water itself, or an alpha-pass draw) behind it is drawn over it. The console wrote that slope's depth (R330.1) | **NU15-W1** | §2.2, §2.5 |
| R330.4 | **Not the other candidates.** No world draw turns the depth test off or sets `always` (only the HUD, the blit and screen passes do: `hud.ts:1767`, `:1838`, `renderer.ts:167`, `:210`); the depth buffer is ordinary (no logarithmic or reversed depth in the viewer; near 4, far `max(2000, extent x 1.6)`, `camera.ts:76-77`, `:288`, `matchMount.ts:623`, `main.ts:1809`), and the patches have the clean outlines of geometry, not precision speckle; the water's extent is not in a committed golden (`MP71_WATER_EXTENT_READING`), and is not needed: the console hides a water surface behind nearer terrain by its depth test wherever the water lies. **One other no-depth path is not ruled out** (the review's F2, NU15-W3): a LOD copy in its fade band draws with its twin, which writes no depth (`lodFade.ts:52-55`), at its walk `renderOrder` (`world.ts:471-486`, `restOrder` `:840`), so the env pass is drawn over it in either order; B1 does not touch it (`NU15_SLOPE_LOD_FADE_READING`). **On FISH HOOK it is ruled out** by B2: MP71 builds no LOD copy at all (§7; was "not ruled out" on every map, before B2's count) | -- | §2.4, §2.5 |
| R330.5 | **It reaches every map, not FISH HOOK's water alone.** Any blended walk draw nearer than a late draw: the env passes of the thirteen water maps research 82 D5 names (MP5, MP7, MP9, MP10, MP12, MP52, MP53, MP62, MP64, MP71, MP73, MP81, MP83), Sujo's glass and car panels (MP61), Guidance's ice (MP82), MP11's and MP51's textured entries (`sky01.tif`; `canal_wall.tif`, and `cloud_scroll.tif` drawn with `specular_map.tif`), and the campaign archives the forge loads; the alpha pass and the shadow decals on every map; with blended walk draws on every map that has one -- vertex ramps on 21 of the 22 (research 82 D8: MP72 has none), texture ramps possibly on MP72 too. (Was: the list without MP11 and MP51, and "blended terrain on 21 of the 22 maps" -- the review's F5.) | one rule, in `apply` | §3 |
| R330.6 | **A one-line fix exists, at `world.ts:497`, not at `materialSpec.ts:269`.** `drawState`'s three's branch is also the LOD fade twins' state (`lodFade.ts:55`), which must keep writing no depth (two copies crossing over), and the effects' and the body's (`effectMaterials.ts:57`, `bodyView.ts:157`, the review's F3); so the walk's draws write depth in either order where `apply` takes their state, the alpha pass, the shadow decals, the fade twins, the detail and env passes unchanged. It changes every blended walk draw of every map in the default order, so a rendered check is owed before it counts (§4, §5) | -- | §4 |
| R330.7 | **A second, minor difference** (NU15-W2): the env pass is drawn after the whole walk in both orders, not after its base; under the engine order it also follows the alpha pass (the pass is in the opaque list there, the env pass in the transparent one), where the console draws it before. Not the owner's symptom; named, not fixed | -- | §2.3 |

**NU.R3: the port does not match.** The original never draws a water surface (or its reflection) over nearer terrain:
its walk writes the terrain's depth whatever the packet's blend, and the water tests it. The port, in its default order,
writes no depth under a blended walk draw and draws the reflection after the whole walk.

## 1. How the original draws water against the terrain

### 1.1 The water's geometry and its reflection

- The water is ordinary world geometry: visuals of the world model (and props) drawn by the family-A/C world
  programs like any other surface (research 26 §3.2: the Seeding Chaos stream's visual, `0x28` then `0x34`). Its base
  pass blends by its texture's `ALPHA` and its vertices' alpha (research 82 D8 names MP2's `a_water.tif` and MP53's
  `water.tif` edges as vertex ramps); `PRIM.ABE` is set on every world packet (research 82 D8).
- A visual whose `vparams` byte 7 names a `Material_Palette` entry gets the environment-map pass (research 82 D5;
  `LoadedMesh.reflect`, `loadMap.ts:82-86`). On MP71 the world root's palette holds two entries; `palEntry_1` names
  `congo4s_sky01.tif` (`world-roots.json`, MP71's `Material_Palette`), a sky: research 82 D5 records the multiplayer
  maps' textured entries as bound to the water, Fish Hook among them. The pass samples that texture at the sphere-map
  `st` of the eye ray's reflection, its alpha `(1 + a) x vertex alpha x rim` (research 82 D5; `envVertex`,
  `materialSpec.ts:336-365`): a pale sky over the water.
- **The extent** -- whether MP71's water is one plane under the whole map or sectors clipped to the shore -- is not in
  any committed golden (the goldens hold MP71's counts, not its water's bounds: `map-chains.json` MP71's `WORL_MDL.ZED`
  has 695 meshes, 5 of them unfogged). Named `MP71_WATER_EXTENT_READING` (§6). It does not bear on the cause (§1.3).

### 1.2 The draw order

- `RenderWorld` (`FUN_00339de0`) walks the grid ring by ring outward from the camera's cell (D:L236851-236945; the
  port's `engineOrder.ts:28-40`), and each visual is drawn as the walk reaches it; the alpha pass comes after the walk
  (`FUN_00336cb0` from D:L237235; research 82 D9). Nothing else is sorted.
- **The reflection is part of its visual's own command list.** `FUN_003b5f20` (D:L307802) builds a visual's VU1 list
  and calls `FUN_003b5b90` (D:L307913, D:L307973); that appends the gate `0x72` (D:L307711 / D:L307753), then -- when
  `DAT_004b4dc0` is set -- the env block `0x36` (D:L307716-307737) or `0x34` (the no-clip branch, D:L307758-307779),
  then the detail and other passes, and closes with `0x74` (D:L307793). So the reflection goes out right after its
  base, in the walk, before the next visual -- not deferred.
- The env block's GS state is the palette texture's own bind packet: `FUN_003549b0` copies the texture record's packet
  (as many quadwords as the record's count at +0x30 says, from its pointer at +0x34, D:L252528-252530) into the
  block (D:L307728, D:L307770), the texture being the entry's (its word at +0x38 of the current palette entry,
  `DAT_004b4aa0`) or `DAT_004b4d90` (`specular_map.tif`, research 82 round 4) (D:L307723-307726, D:L307765-307768);
  `FUN_003b6fa0` uploads it (D:L307729, D:L307771; D:L308416-308443). Its `TEST` is therefore its texture's --
  on the Seeding Chaos block, `0x5000c` (research 26 §3.2, line 70).

### 1.3 The depth state, decoded

- **`ZBUF_1.ZMSK` is 0 for the whole walk.** `RenderWorld` calls `FUN_003b7150(0)` (D:L236792); `FUN_003b7150`
  (D:L308483-308488) stores its argument and calls `FUN_003afe70` with it inverted (zero becomes one); `FUN_003afe70`
  (D:L304682-304710) kicks the 16-byte packet at `DAT_003e1200` for a non-zero argument and `DAT_003e11c0` for zero.
  Research 82 D9 (as corrected at its review, 2026-10-03) reads `DAT_003e1200` (-> 0x3e1180) as `ZMSK` 0 and
  `DAT_003e11c0` (-> 0x3e1140) as `ZMSK` 1; the alpha pass sets 1 (D:L235137) and restores 0 (D:L235185). **The ELF
  settles it on its own** (read for this fold, the review having read the same): the 16-byte words at 0x3e11c0 and
  0x3e1200 are DMA tags addressing 0x3e1140 and 0x3e1180; each of those holds a GIF A+D block whose one register is
  `ZBUF_1` (0x4e) -- 0x3e1140 the value `0x13a000118` (`ZBP` 0x118, `PSM` 0x3a Z16S, **`ZMSK` 1**), 0x3e1180
  `0x3a000118` (the same, **`ZMSK` 0**). The live trace agrees: `zbp=118 zpsm=3a zmsk=0 test=5000c abe=1` on 1748 of
  1755 submits (research 26 §3.2, lines 82-84) -- the submits of a whole trace, not the water's draws alone. The mask is
  the pass's state, set once; no world packet changes it, blended or not.
- **The walk's second mask call agrees** (NU-15's review, 2026-10-15; re-read at the lines for this fold):
  `RenderWorld`'s second `FUN_003b7150` call (D:L236821) has an argument the decompiler lost, but its block closes
  with `FUN_003afed0` (D:L236843), which sends the packet at `DAT_003e0980` (D:L304723) -- by the review's read of the
  ELF, the reset block with `ZBUF_1 0x3a000118` (`ZMSK` 0) and `TEST_1 0x5000d`. So the grid walk from D:L236851 runs
  with `ZMSK` 0 either way, as B1 builds it.
- **`TEST_1 = 0x5000c`**, by field (GS manual layout; `@s2u/gs` `decodeTest`, `gsState.ts:72-76`, reads bits 0, 4-11
  and 16): `ATE` (bit 0) 0 -- no alpha test, so `ATST` (bits 1-3, 6) and `AREF` (bits 4-11, 0) are inert; `AFAIL`
  (12-13) 0, `DATE` (14) 0, `DATM` (15) 0; **`ZTE` (bit 16) 1 -- the depth test on; `ZTST` (bits 17-18) 2 -- GEQUAL.**
  The GS's Z grows toward the eye (`materialSpec.ts:202-204` says the same of the detail pass), so GEQUAL keeps a
  fragment at the stored depth or nearer.
- **What it means for a water fragment behind nearer terrain:** if the walk drew the terrain first (the usual case, the
  walk running outward), the terrain's depth is in the buffer and the water fragment, farther, fails GEQUAL; if the walk
  drew the water first, it wrote its own depth and the terrain, nearer, passes and overwrites it. The reflection pass
  lies exactly on its base and tests the same way. Either order, nearer terrain hides the water -- blended terrain
  included, because `ZMSK` 0 writes depth under a blended packet too (research 82 D9: "a blended surface then lands
  where the hardware put it, holes and all", `materialSpec.ts:249-258`). The depth buffer is Z16S (`zpsm 0x3a`,
  research 26 §3.2): coarse, but a slope metres nearer than the water is far outside its step.
- **What the water's extent does not change:** a water surface that ran on under the slope would still fail the test
  there. Only a draw with the test off, or a draw after nearer terrain that left no depth, could show it; the original
  has neither in the walk.

### 1.4 Its alpha and its fog

- Base pass: the texture's `ALPHA` (source-over, `0x44`, on the Seeding Chaos block) and the vertex alpha; the
  reflection: `ALPHA_1 0x44`, its alpha `(1 + a) x vertex alpha x rim` (§1.1).
- Fog: each draw's `PRIM.FGE` (`MeshData.fog`). The Seeding Chaos water's base pass has `PRIM 0x7b`, `FGE` set
  (research 26 §3.2, line 62); `fog.ts:35`'s doc says "the skies, the water and the glows clear it". The code takes the
  packet's own bit either way (`world.ts:750` for the env pass, `apply`'s `spec.fog` for the base), so the doc line is
  only a description; MP71's own water bit is not read here (`map-chains.json`: 5 unfogged meshes in its world model,
  not identified). Fog does not bear on the occlusion.

## 2. What the port does

### 2.1 Two orders, and the default

`WorldView.setEngineOrder` (`world.ts:85-98`): **on**, every draw goes out in the grid walk's order in three's opaque
list, writing depth under every blend (research 26 §2; `drawState`'s engine branch, `materialSpec.ts:267-268`); **off**,
the scene walk's order (`restOrder`), blended draws in three's transparent list with no depth written. `engineOn` starts
false (`world.ts:346`), "off by default until the sweep and the poses clear it (W1.R3)" (`world.ts:94`; W1.R3 kept it
off for "the flares' black box", `plans/2026-09-28-web-sprint-1.md:71`, which research 82 D9's alpha pass later
addressed). Nothing in the match turns it on: the setup page's box is unchecked (`setup/index.html:235`), the panel opens
at the page's defaults every time (`ui.ts:95-101`), the menu-launched match calls no toggle (PAR-35's
`worldBlendGraded.test.ts` doc), and the forge's is off (`forge/page.ts:113`). **The owner's nightly drew in three's
order.**

### 2.2 The walk's draw state

`apply` (`world.ts:490-511`) gives every world and prop draw its state: a shadow decal transparent with no depth
(`:494-495`), an alpha-pass draw `alphaPassState` (no depth in either order, `:496`), **everything else
`drawState(spec, engineOn)` (`:497`)**. `drawState` (`materialSpec.ts:264-270`): an unblended draw (opaque or a cutout)
is opaque with depth written; a blended one, under the engine order opaque with depth written, **under three's order
`{ transparent: true, depthWrite: false, factors }` (`:269`)**. A draw blends when its texture's alpha is a ramp or its
vertices carry an alpha below unity (`discSpec`, `materialSpec.ts:84-110`; `LoadedMesh.vertexAlpha`, `loadMap.ts:100-107`,
which names "the terrain blends of Sandstorm, Guidance and Fish Hook").

### 2.3 What is drawn after the walk

three draws the opaque list, then the transparent list, each sorted by `renderOrder` first (the port's own premise,
`world.ts:1086-1089`, `materialSpec.ts:230`). In three's order a walk draw's `renderOrder` is its scene-walk place times
`REST_WALK_SCALE` = 2^-24 (`world.ts:252-256`, `:840`) -- at most a few thousandths; after them:

- the **detail passes** at base + 0.5, in their base's list, `depthWrite` false, `LessEqual` (`materialSpec.ts:192-223`);
- the **env passes** at base + 0.75 (`world.ts:769`, `:1095`, `:1318`), **always in the transparent list**, `depthWrite`
  false, `LessEqual` (`world.ts:745-747`), blended source-over, fogged as the base (`:748-750`);
- the **alpha pass** and the shadow decals at 1 (`ALPHA_PASS_REST_ORDER`, `world.ts:256`; `inAlphaPass`,
  `engineOrder.ts:77-79`).

**NU15-W3** (the review's F2): a LOD copy (a prop in a LOD band; the world's parts have none) in its fade band is drawn
with its fading twin (`drawFaded`, `world.ts:471-486`), transparent with no depth written in either order
(`fadeMaterial`, `lodFade.ts:52-55`), but it keeps its walk `renderOrder` (`restOrder`, `:840`). So the env pass at
+0.75 -- and the alpha pass -- is drawn over a fading copy, whatever B1 does. The console draws a fading visual in its
alpha pass, after the walk (research 82 D9; `lodFade.ts:10-12`), under `ZMSK` 1 too: the water is drawn first and the
fading copy blends over it. If either of the owner's slopes is such a copy at that range, B1 alone does not clear it
(`NU15_SLOPE_LOD_FADE_READING`, B3).

Each of these tests depth -- but in three's order the only depth in the buffer when they draw is the opaque list's: the
blended walk draws wrote none (§2.2). The env pass's `LessEqual` is the right translation of GEQUAL; what it is tested
against is not the console's.

**NU15-W2** (minor): the console draws the reflection right after its base (§1.2), the port after the whole walk. Under
three's order, once the walk writes depth (§4), the only visible effect left is a blended walk draw lying on the water
and drawn after it in the walk (a shore blend, *inference*) taking the reflection over it; under the engine order the
env pass also follows the alpha pass (opaque list there, `alphaPassState`, `materialSpec.ts:284-287`), so a flare or
decal over water gets the reflection over it. `ENV_PASS_PLACE_READING` (§6); not the owner's symptom.

### 2.4 The depth buffer

`createRenderer` (`renderer.ts:134`) asks three's `WebGPURenderer` for nothing depth-specific: no logarithmic or
reversed depth (no such option in `packages/viewer/src`). The camera's near plane is the map's `nearPlane` or 4, its far
`max(2000, extent x 1.6)` (`matchMount.ts:623`, `main.ts:1809`; `camera.ts:76-77`, `:288`). No world material turns its
depth test off; the ones that do are screen passes (`renderer.ts:167`, `:210`) and HUD quads (`hud.ts:1767`, `:1838`);
the effects test depth (`effectMaterials.ts:59`). A precision fault would speckle along the slope; the patches have
straight geometric edges and dark occluders inside them (spot 1), which is what a depth-tested draw over a surface
that left no depth looks like.

### 2.5 The cause, against the brief's candidates

| candidate | verdict |
|---|---|
| a water draw with the depth test off or `always` | **no**: the env pass and the base test `LessEqual` (§2.3, §2.4) |
| a water draw in three's transparent list after the terrain, the terrain's depth unwritten because the slope is a blended packet | **yes** -- NU15-W1: `materialSpec.ts:269` via `world.ts:497` (§2.2-§2.3) |
| depth precision, near or far | **no** (§2.4) |
| a LOD copy in its fade band (its twin writes no depth, at its walk order) | **ruled out on MP71** by B2 (no LOD copy on the map, §7); elsewhere **not ruled out** -- NU15-W3 (§2.3); world terrain has no LOD band, so only a prop slope (was: "not ruled out", B3 to check it on MP71) |
| the water's extent wrong | **not needed and not read**: the console hides water under nearer terrain by depth wherever it lies (§1.3); `MP71_WATER_EXTENT_READING` |

**Both frames fit** (*inference*, `NU15_SLOPE_DRAWS_READING`): spot 1's dirt rise and spot 2's grass slope are MP71's
terrain blends (research 82 D8 names `sand_beach`; the grass's soft edges are a vertex ramp), with no opaque packet
under them at those pixels -- if there were one, its depth (opaque list, written) would hide the env pass. The dark shapes
inside spot 1's patch are opaque draws nearer than the water, occluding it as they should. That the pale draw is the env
pass and not the water's base or an alpha-pass draw is the frames' look, not a read (`NU15_LEAKED_DRAW_READING`); the
cause covers all three.

## 3. Every map

- **The late draws that can leak** (R330.5): the env passes -- MP71 and the twelve other water maps research 82 D5 names
  (MP5 ABANDONED, MP7 NIGHT STALKER, MP9 BITTER JUNGLE, MP10 BLOOD LAKE, MP12 THE RUINS, MP52 THE MIXER, MP53 FOXHUNT,
  MP62 ENOWAPI, MP64 SHADOW FALLS, MP73 SANDSTORM, MP81 CHAIN REACTION, MP83 REQUIEM), Sujo's glass and car panels
  (MP61), Guidance's ice (MP82); MP11's `sky01.tif` and MP51's `canal_wall.tif` and `cloud_scroll.tif` (drawn with
  `specular_map.tif`), which research 82 D5's water list does not name (was: left out -- the review's F5); the twelve
  campaign archives' entries (`world-roots.json`: every one of the M51-M83 roots names
  reflection textures; the forge loads them, FG-22); and the untextured entries the engine draws with
  `specular_map.tif` (research 82 round 4) wherever a visual names one. The palette golden lists, per root, which
  entries name a texture: MP1, MP2, MP6, MP8 and MP72 name none. Which draws use an entry is per visual and not in a
  committed golden (the dev-disc test of §5 counts it). Beyond the water: the alpha pass and the shadow decals on every
  map, and a blended base's detail pass.
- **The surfaces that leave no depth**: every blended walk draw in three's order -- texture ramps and vertex ramps;
  research 82 D8 counted 1,711 vertex-alpha packets over the 22 maps, on every map but MP72; MP72's texture ramps (a
  graded texture with a source or additive blend) are blended walk draws too, not counted here. And the LOD copies in
  their fade band (NU15-W3).
- **Frostfire's water** (MP2, `a_water.tif`, a vertex ramp, no textured palette entry) has no env pass; its base, blended,
  sorts among the blended walk draws by walk order, so it too draws over a nearer blended draw that precedes it in the
  scene walk (*inference*).
- So the rule reaches every map; the fix is one rule in `apply`, not a map's or a spot's.

## 4. Is it one line?

**The cause is one depth-state line:** `materialSpec.ts:269` (three's branch of `drawState`), as `world.ts:497` applies it
to the walk, against `FUN_003b7150(0)` D:L236792 (`ZMSK` 0 for the walk).

**The fix is one line, at `world.ts:497`**, not at `:269`: the walk's draws write depth in either order --
`drawState(spec, engineOn)` with `depthWrite` forced true there -- leaving the transparent list and the walk order
(`restOrder`) as they are. `materialSpec.ts:269` itself must not flip: `fadeMaterial` takes the LOD fade twins' state
from it (`lodFade.ts:55`), and two copies crossing over must not cut each other out of the depth buffer
(`lodFade.ts:46-50`); `materialSpec.test.ts:148-152` and `lodFade.test.ts:52-53` pin it. Two more files take their state
from the same branch: the effects (`effectMaterials.ts:57`) and the body (`bodyView.ts:157`) -- a further reason the
line is `world.ts:497`, which reaches only the walk's draws (the review's F3). Unchanged by the fix: the alpha
pass and the shadow decals (no depth, `ZMSK` 1 on the console), the detail and env passes (no depth, `LessEqual` on
their base), the engine order (already writes it). The docs that say "writes no depth under a blend" move with it:
`world.ts:89-96`, `materialSpec.ts:260-262`, the setup page's title (`setup/index.html:235`).

**Why it is not a blind one-liner** (the controller's to weigh): it changes every blended walk draw of every map in the
default order. With depth written, a translucent ramp drawn earlier in the **scene** walk hides a blended draw behind it
drawn later -- the console's own behaviour under `ZMSK` 0, but the console's order is the **grid** walk outward from the
camera, so the set of such cut-outs can differ (`THREE_ORDER_WALK_HOLES_READING`, §6). The opaque list is drawn first,
so only blended draws behind a ramp are affected, never the opaque world. The alternative root -- the engine order as
the default -- is W1.R3's decision (`plans/2026-09-28-web-sprint-1.md:164`), not this note's.

## 5. The build list

On the simulation track (what the game draws). RED first; one rule for every map.

- **B1 -- the walk writes depth under its blends, in either order (`world.ts:497`).**
  - *RED (unit, no disc):* a new `packages/viewer/test/worldWalkDepth.test.ts` in `worldBlendGraded.test.ts`'s shape:
    a synthetic map built as the match builds it (`buildWorld`, every reveal task run, no `setEngineOrder` call) with a
    solid walk draw, a vertex-ramp walk draw nearer the camera (`vertexAlpha`, as MP71's `sand_beach`) and a water draw
    with `reflect: 1` and an `envMaterials` entry. Asserts: the ramp's material is in the transparent list **with
    `depthWrite` true** (fails today: false) at its walk order (`renderOrder` below the env pass's); the env pass is
    transparent, `depthWrite` false, `depthFunc` `LessEqualDepth`, numbered after the ramp; with `setEngineOrder(true)`
    the ramp opaque with depth written (green today). Pins, green today and after: an alpha-pass draw and a shadow decal
    write none in either order; a LOD fade twin writes none (`fadeMaterial`); `drawState(spec('source'), false)` is
    unchanged (`materialSpec.test.ts:148-152`).
  - *Docs:* `world.ts:89-96`, `materialSpec.ts:245-263`, `setup/index.html:235` say the walk writes depth in both orders;
    each old sentence gets a "was" pointing here.
- **B2 -- the dev-disc test over every map's draw state:** `packages/viewer/test/waterDepthDisc.test.ts` (reads
  `SOCOM_DISC`; skips without it, the skip said). For each of the 22 multiplayer archives and the 12 campaign archives
  of `world-roots.json`: `loadMap` and `buildWorld`, every reveal task run, the default order. Asserts: every walk draw -- a `Built` world or
  prop material that is neither a shadow decal nor in the alpha pass -- writes depth (RED today on every map with a
  blended walk draw: vertex ramps on 21 of the 22 by research 82 D8, and texture ramps, so possibly MP72 as well; the
  test's own count stands, not this note's) (was: "21 of the 22 by research 82 D8" -- the review's F5); every env and
  detail pass writes none and tests `LessEqual`.
  Records per map: the env-pass draws, the blended walk draws, and the bounds of the `reflect > 0` draws (settles
  `MP71_WATER_EXTENT_READING`); asserts MP71 has at least one env pass on `congo4s_sky01.tif` and records that texture's
  raw `TEST_1` value, or its `ZTE` (bit 16) and `ZTST` (bits 17-18) decoded, asserting `ZTE` 1 and `ZTST` 2 (GEQUAL)
  (settles `ENV_PASS_TEST_READING` for the port's read of the disc). `decodeTest` (`gsState.ts:72-76`) reads `ZTE`
  alone, not `ZTST`, and `decodeGsState` defaults `depthTest` to true when the packet has no `TEST` register
  (`gsState.ts:118`), so `gs.depthTest` cannot settle it. (Was: "and that the texture's `gs.depthTest` is true" -- the
  review's F1.)
- **B3 -- owed, not run here: a rendered check** (a browser run, the PS2 picture and the native one) at both of the
  owner's spots on FISH HOOK (the patches gone, the slopes whole), at research 82 D8's Vigilance courtyard (the grass
  still fading onto the cobbles, no new cut-outs), at a sky dome's rim (MP51 or MP6) and at a shoreline on MP71 (or
  MP2), before and after B1. The shoreline (the review's F4): water whose edges fade by their vertex alpha (research 82
  D8), drawn earlier in the walk, writes depth across its nearly transparent rim after B1 and could cut a later blended
  draw under it -- MP71's `sand_beach` is blended. At both of the owner's spots the run also freezes the LOD fades (or
  names the draw under the patch) to rule NU15-W3 in or out (the review's F2). The spots' coordinates are not in the
  screenshots (`NU15_SPOT_POSES_PLACEHOLDER`). **The shoreline check includes MP71's washups** (NU-15's review, F2,
  2026-10-15): with B1 the env pass (base + 0.75, after the whole walk) is depth-tested against the blended walk draws
  lying on the water -- on MP71 the 12 `water_washup.tif` draws at y 50-54 overlap the `water.tif` sectors at y 50
  (B2, §7). Where a washup lies at y 50, drawn before the env pass, the reflection meets an equal or near depth under
  `LessEqual` and may speckle with a finer depth buffer than the console's Z16S; before B1 the reflection was drawn
  over it. Neither is the console's, where the env pass follows its own base (D:L307758-307779). B3 looks at the
  washups and files what it sees under `ENV_PASS_PLACE_READING`. (Was: the shoreline check for the rim's cut alone.)
- **Not built here:** NU15-W2 (the env pass's place, `ENV_PASS_PLACE_READING`); NU15-W3 (the fading copies' place,
  until B3 or the listing finds one under a patch: then they go after the walk with the alpha pass, as the console draws
  them); the engine order as the default (W1.R3).

## 6. Readings and placeholders (candidates for the build)

| name | where it would go | status |
|---|---|---|
| `NU15_SLOPE_DRAWS_READING` (*note only*; candidate, NU-15) | B2's survey, or a note line | the draws covering both slopes at the owner's spots are blended walk draws (MP71's vertex-alpha terrain) with no opaque draw under them -- an *inference* from the frames and the cause (§2.5); B2 counts MP71's blended walk draws, 91 of 713 (`sand_beach.tif` among them), every one writing no depth before B1 and depth after (§7) -- which draws lie under the poses is still not listed; settles: a dev-disc listing of the draws whose triangles cover the two poses' pixels, or NU15-2 |
| `NU15_LEAKED_DRAW_READING` (*note only*; candidate, NU-15) | -- | the pale patches are the water's env pass (`congo4s_sky01.tif`, MP71 `palEntry_1`), not the water's base or an alpha-pass draw -- the frames' look only; B1 covers all three; settles: the same listing, or the B3 run with the env pass switched off (`refreshDetail`'s `envOn`) |
| `MP71_WATER_EXTENT_READING` (*note only*; candidate, NU-15) | B2's record | read 2026-10-15 off the disc (B2, `waterDepthDisc.test.ts`, §7): **sectors at one level, not one plane under the map** -- MP71's 27 draws with an env pass are 15 `water.tif` draws at y 50 and 12 `water_washup.tif` at y 50-54, together inside x 540..2700, z 720..2340 (map units), of the map's -151..3031 on both axes; not needed for the cause (§1.3). Was: "in no committed golden; settles: B2's bounds of the `reflect > 0` draws" |
| `ENV_PASS_TEST_READING` (*note only*; candidate, NU-15) | B2's assertion | the env pass's `TEST` is its texture's bind packet's (D:L252528-252530, D:L307770); read live as `0x5000c` on one mission's water only (research 26 §3.2); `gsState.ts:29` says `ZTE` is on throughout the corpus, but `decodeTest` reads no `ZTST` and defaults to on without a `TEST` register (`gsState.ts:72-76`, `:118`). **Read off the disc 2026-10-15 (B2):** MP71's `congo4s_sky01.tif` bind packet holds `TEST_1` `0x5000c` -- `ZTE` 1, `ZTST` 2 (GEQUAL) -- read raw from the packet's A+D quadwords in the test, no `gs` reader change; every env texture the 34 archives name holds `0x5000c` (§7). Still owed: NU15-2 at the console. (Was: "settles: B2 decoding bits 16-18 (or the raw value) of MP71's `congo4s_sky01.tif`, and NU15-2"; before that "settles: B2 on MP71's `congo4s_sky01.tif`" -- the review's F1.) |
| `THREE_ORDER_WALK_HOLES_READING` (*note only*; candidate, NU-15; `world.ts` `apply` names it beside B1's line) | B1's doc | with B1 (built 2026-10-15), a translucent ramp earlier in the scene walk cuts a blended draw behind it drawn later, where the console's grid walk might have drawn the far one first -- a water rim fading by its vertex alpha among them (the review's F4); the draws B1 changes, by B2's count: every blended walk draw of 21 of the 22 multiplayer maps (MP72 has none) and of the 12 campaign archives (§7); settles: B3's courtyard, sky and shoreline checks, or the engine order made the default (W1.R3) |
| `NU15_SLOPE_LOD_FADE_READING` (*note only*; candidate, NU-15) | B3; `world.ts` `drawFaded` | whether either slope under a patch is a LOD copy in its fade band (NU15-W3), drawn with a twin that writes no depth at its walk order, which B1 does not change (pinned, `worldWalkDepth.test.ts`); the world's parts have no LOD band, so only a prop slope. **On MP71, no:** B2 counts no LOD copy on the map (§7), so neither of the owner's patches is a fading copy. Other maps keep it open (MP2 234 copies, MP73 214, five campaign archives); settles there: B3 with the fades frozen. (Was: open on MP71 too, "settles: B3 with the fades frozen, or the listing of the draws under the two poses' patches" -- the review's F2.) |
| `ENV_PASS_PLACE_READING` (*note only*; candidate, NU-15) | `world.ts` `addEnv`, `envOrderOf` | **The alpha pass's half built 2026-11-07 (LATER 593, INV-WATER-LOOK F2, `agent/inv-water-look`; reading, pending review; §9):** an alpha-pass draw's reflection is numbered right after its base and before its detail pass and the next item or particle bucket (`alphaEnvOrder`), as the console's visual list draws it (`FUN_003b5b90` D:L307758-307779 via `FUN_003b4580`, §1.2); was base + 0.75 (1.75), after the whole pass and every particle -- MP12's 22 alpha-pass water reflections among them (`alphaInterleaveDisc.test.ts`). **Still open, the walk's half:** the console draws the reflection right after its base in the walk (D:L307758-307779), the port after the whole walk, and under the engine order after the alpha pass; the visible effect is not read. Since B1 (NU-15's review, F2): the env pass is depth-tested against the blended walk draws on the water -- MP71's 12 `water_washup.tif` draws at y 50-54 over the `water.tif` sectors at y 50 -- so where a washup at y 50 precedes it the reflection meets an equal or near depth under `LessEqual` and may speckle (a finer buffer than Z16S); before B1 it was drawn over the washup; neither is the console's; settles: B3's shoreline check at MP71's washups, and NU15-1 over water with a flare or decal on it. (Was: "the visible effect is not read; settles: NU15-1 over water with a flare or decal on it".) |
| `ALPHA_PASS_TIE_READING` | `alphaInterleave.ts`; `engineOrder.ts` `alphaPassOrder` | two items of the alpha pass at one key: the console's list insertion (`FUN_00336f60`) puts the newer before an equal one from its head and on its cursor's forward walk (D:L235223, D:L235247-235248) and after it on the cursor's backward walk (D:L235234-235239), so its tie follows the cursor, not one rule; the port keeps the walk's order (`order`, then as given), stable from frame to frame (`alphaInterleave.test.ts`, no flicker); settles: a GS dump of two alpha visuals at one centroid range (two flares at one spot), their order over several frames |
| `ALPHA_INSTANCED_KEY_ADAPTATION` | `world.ts` `Drawn.centre` | an instanced draw of several placements of one alpha-pass visual is one draw with one key (its box's centre), where the console keys each placement by its own centroid (`FUN_003371b0` D:L235314-235317); a browser adaptation (one `InstancedMesh` a prop); MP12 has none in its pass, MP7 one (`alphaInterleaveDisc.test.ts`); settles nothing to read -- split the draw per placement if a map shows it |
| `PARTICLE_BUCKETS_PER_TEXTURE_ADAPTATION` | `particles.ts` | 16: the most batches a texture's particles are split into in a frame, one per run of the alpha pass's slots; past it the nearer runs share the last batch at its nearest run's number, so the items whose keys lie inside that batch's particle ranges draw under its farther particles; a browser adaptation (the console drains particle by particle over one list of every texture, `FUN_00324c70`); 600 rain drops over MP12's sectors take 5-8 batches at the water poses, over MP7's pool 3-8 (`alphaInterleaveDisc.test.ts`); within a slot two textures' batches still sort by three at their clouds' centres (research 89 §20, unchanged) |
| `NU15_SPOT_POSES_PLACEHOLDER` (*note only*; candidate, NU-15) | B3 | the two spots' positions and headings: not in the screenshots; settles: the owner's saved test report from the nightly, or a probe at the described places |

Captures that would take R330.1 to proven (NU.R3: a row that needs a capture files one in `HUMAN_TASKS.md` with the
default followed -- the controller's, not this read's):

- **NU15-1**: PCSX2, FISH HOOK, the owner's two poses: the console's frame shows the slopes whole, no water or sky
  through them; scored against the port's frame after B1.
- **NU15-2**: a GS dump at the same poses: the slope's packets (their `PRIM.ABE`, the vertex alpha) and the water's two
  passes (`TEST_1`, `ZBUF_1.ZMSK`, `ALPHA_1`), and their order in the walk.

## 7. The build (NU-15 B1, B2; 2026-10-15)

Reading, pending review: unit tests and a dev-disc test, each file run alone (vitest, `--maxWorkers=1`); no browser run,
no capture. B3, the rendered check at both of the owner's spots, Vigilance's courtyard, a sky dome's rim and a shoreline,
is owed before the row counts.

- **B1** (`world.ts` `apply`, the walk's draw state): a draw that is neither a shadow decal nor in the alpha pass, and is
  the world's or a prop's (`Built.receive`), takes `drawState(spec, engineOn)` with `depthWrite` true -- the transparent
  list and `restOrder` unchanged in three's order. Not touched: `drawState` (`materialSpec.ts:269`), so the LOD fade
  twins, the effects and the body keep no depth (the review's F3); the alpha pass and the decals; the detail and env
  passes; the engine order and its default. **One finding of the build:** `apply` also gives the held weapon and the
  grenade their state (they take the world's materials, `receive` false), which §4 did not name; they are not the
  walk's draws, so B1 leaves them as they were (pinned). Docs moved: `world.ts`'s `setEngineOrder` doc, with a "was";
  `setup/index.html:235`, the engine-order box's title (added to the build's files by the controller): off now "keeps
  the scene graph's own order without the rings and draws the alpha pass after it all, sorted back to front; the map's
  ground writes depth under its blends either way" (was "Off keeps the scene graph's own order without the rings, writes no
  depth under a blend, and draws the alpha pass after it all"; then, at the build, "... the walk writes depth under its
  blends either way", reworded at checkpoint 19's gate: `features.test.ts` and `modes.test.ts` forbid the word *walk*
  in the page's text and tooltips once the play markup is out; the meaning unchanged);
  `materialSpec.ts:260-262`, `drawState`'s three's-order paragraph, gains a clause pointing at `world.ts` `apply` and
  `THREE_ORDER_WALK_HOLES_READING`, with a "was" (NU-15's review, F1; was "Not moved: its words describe `drawState`,
  which is unchanged" -- true of the function, not of the walk draws its words named).
- **The parity registry** (`docs/parity/registry/`): neither new test is entered. The validator checks the entries
  there, not that every parity test has one, so nothing fails; an entry for R330.1 (the walk's depth write, level
  reading, `worldWalkDepth.test.ts` and `waterDepthDisc.test.ts`) is owed with the row's landing.
  **Entered** 2026-10-15 on the lane: `world.render.walk-depth-write` in `world.json` (level reading; four of B1's
  tests and B2's MP71 case; owed: the captures and B3's rendered check). (Was: owed.)
- **B1's test**, `packages/viewer/test/worldWalkDepth.test.ts` (9; the map built as the menu match builds it): RED 5
  failed / 4 passed before B1 -- a vertex ramp, a sky-dome rim (a texture ramp), a blended layer over a blended layer,
  the round trip through the engine order, and a blended LOD copy at rest, each writing no depth; GREEN 9 after. Pins
  (green before and after): the alpha pass (a window) and a decal write none in either order; a blended base's detail
  pass keeps its base's list, writes none, `LessEqual`, half a step behind it; `drawState(spec('source'), false)` and
  `fadeMaterial` unchanged; a fading LOD copy's twin writes none at its walk order, before the env pass (F2); the held
  weapon's blended part unchanged. `worldBlendGraded.test.ts` and `worldOrder.test.ts` re-pinned to depth written, the
  old values kept as "was".
- **B2**, `packages/viewer/test/waterDepthDisc.test.ts` (dev disc; skipped, and said so, without `SOCOM_DISC` or
  `SOCOM_PC_ROOT`): each archive through `loadMap` and `buildWorld`, every reveal task run, the default order. A walk draw
  is an object the engine order writes depth under (that branch writes it under every draw but the alpha pass and the
  decals); the world's parts are held to the disc's own flags as well (`alphaPass`, a `shadow*.tif`). RED before B1:
  **33 failed, 1 passed** -- every archive but MP72 has a blended walk draw writing no depth; GREEN after: 34 passed.
  Every env and detail pass writes none and tests `LessEqual` on every archive. MP71's `congo4s_sky01.tif` `TEST_1` is
  `0x5000c`, `ZTE` 1, `ZTST` 2.

The per-archive record (B2's output; "blended walk" = the draws B1 changes, every one writing no depth before it and
depth after; env `TEST_1` read raw from each texture's bind packet; "(no draw)" none seen; the union of the reflecting
draws in map units):

| stem | walk | blended walk | alpha pass + decals | LOD copies | env | detail | env textures, `TEST_1` | reflecting draws' union |
|---|---|---|---|---|---|---|---|---|
| MP1 | 979 | 79 | 41 | 0 | 0 | 166 | - | - |
| MP2 | 602 | 27 | 26 | 234 | 2 | 12 | `specular_map.tif` 0x5000c | (554, 100, 689)..(590, 149, 720) |
| MP5 | 320 | 74 | 23 | 0 | 15 | 96 | `sky01.tif` 0x5000c | (705, 26, 1256)..(1717, 26, 1661) |
| MP6 | 544 | 11 | 181 | 0 | 22 | 5 | `specular_map.tif` 0x5000c | (678, -25, 1853)..(1901, 31, 2049) |
| MP7 | 435 | 51 | 34 | 0 | 6 | 0 | `specular_map.tif`, `reflection_sub.tif` 0x5000c | (1440, 47, 1553)..(2279, 153, 1781) |
| MP8 | 246 | 18 | 43 | 0 | 0 | 67 | - | - |
| MP9 | 1480 | 76 | 81 | 0 | 3 | 71 | `congo2_cave01.tif` 0x5000c | (2520, 19, 1435)..(2651, 19, 1566) |
| MP10 | 708 | 118 | 44 | 0 | 37 | 150 | `m19_skycap01.tif` 0x5000c | (690, 8, 768)..(1994, 13, 1664) |
| MP11 | 293 | 57 | 24 | 0 | 0 | 57 | - | - |
| MP12 | 221 | 22 | 25 | 0 | 22 | 9 | `rockwall2.tif` 0x5000c | (900, 43, 1170)..(2090, 56, 2018) |
| MP51 | 651 | 32 | 17 | 0 | 18 | 76 | `specular_map.tif`, `canal_wall.tif` 0x5000c | (517, -66, 294)..(1448, 141, 1197) |
| MP52 | 458 | 45 | 73 | 0 | 7 | 100 | `m52reflect.tif` 0x5000c | (2854, -62, 1636)..(3726, -52, 2374) |
| MP53 | 357 | 109 | 42 | 0 | 37 | 289 | `sky01.tif`, `specular_map.tif` 0x5000c | (1244, -43, 441)..(3370, 134, 5330) |
| MP61 | 844 | 74 | 67 | 0 | 32 | 95 | `specular_map.tif`, `clouds.tif` 0x5000c | (322, -49, 537)..(1066, 197, 2240) |
| MP62 | 603 | 97 | 40 | 0 | 25 | 249 | `skyreflect.tif` 0x5000c | (479, -15, 218)..(2805, -14, 2559) |
| MP64 | 1197 | 110 | 54 | 0 | 49 | 73 | `mp64_reflection.tif` 0x5000c | (134, -10, 320)..(1786, 253, 2831) |
| MP71 | 713 | 91 | 67 | 0 | 27 | 58 | `congo4s_sky01.tif` 0x5000c | (540, 50, 720)..(2700, 54, 2340) |
| MP72 | 791 | 0 | 23 | 0 | 0 | 78 | - | - |
| MP73 | 1231 | 216 | 108 | 214 | 10 | 371 | `specular_map.tif`, `waterdirty.tif` 0x5000c | (722, 58, 814)..(1526, 89, 1258) |
| MP81 | 732 | 7 | 15 | 0 | 3 | 0 | `tex_specular.tif` 0x5000c | (1150, -26, 1003)..(1410, 246, 2416) |
| MP82 | 782 | 227 | 23 | 0 | 30 | 138 | `mp82_reflectionmap.tif` 0x5000c | (400, -109, 66)..(1992, 51, 2370) |
| MP83 | 1465 | 79 | 51 | 0 | 53 | 6 | `specular_map.tif`, `reflection_sub.tif` 0x5000c | (270, 38, 544)..(2170, 215, 2367) |
| M51 | 1041 | 293 | 257 | 0 | 37 | 626 | `specular_map.tif`, `sky01.tif` 0x5000c | (888, -345, 859)..(5647, -67, 4322) |
| M52 | 1814 | 101 | 174 | 237 | 56 | 155 | `specular_map.tif`, `m52reflect.tif` 0x5000c | (3346, -44, 2928)..(6537, 42, 4736) |
| M53 | 1611 | 226 | 131 | 0 | 58 | 377 | `specular_map.tif`, `reflection_sub.tif` 0x5000c | (1679, 555, 1223)..(2234, 765, 2117) |
| M61 | 1229 | 99 | 98 | 0 | 23 | 91 | `clouds.tif` 0x5000c | (427, -89, 156)..(2346, 200, 1920) |
| M62 | 1240 | 181 | 98 | 0 | 47 | 448 | `specular_map.tif`, `skyreflect.tif` 0x5000c | (320, -316, 218)..(5109, 191, 3200) |
| M63 | 1041 | 14 | 137 | 204 | 16 | 0 | `reflection_sub.tif` 0x5000c | (1080, -350, 1080)..(3240, -80, 2874) |
| M71 | 826 | 63 | 83 | 0 | 31 | 0 | `congo4s_sky01.tif` 0x5000c | (-1172, 104, 160)..(2425, 109, 3057) |
| M72 | 1651 | 32 | 92 | 0 | 5 | 0 | `cuba2r_ballroom_trim1.tif` 0x5000c | (584, 96, 1017)..(646, 96, 1080) |
| M73 | 1330 | 10 | 43 | 0 | 5 | 0 | `flare_orange.tif` 0x5000c | (776, 3, 1480)..(1035, 3, 1659) |
| M81 | 1311 | 60 | 65 | 279 | 17 | 103 | `rock.tif` 0x5000c | (0, -25, 0)..(3840, 107, 3520) |
| M82 | 3267 | 234 | 151 | 963 | 20 | 86 | `m82_reflectionmap.tif`, `reflection_sub.tif` 0x5000c | (585, -85, 0)..(2175, -9, 3520) |
| M83 | 1479 | 34 | 66 | 200 | 30 | 19 | `specular_map.tif`, `sky01.tif` 0x5000c | (2725, 124, 1260)..(2770, 166, 1395) |

What the record changes in this note: the reach of R330.5 is the test's count, not research 82 D8's -- 21 of the 22
multiplayer maps and all 12 campaign archives have a blended walk draw (MP72 none, texture ramps included); MP11 draws
no env pass (no draw names a palette entry: 0, against R330.5's list) and MP51 draws 18; MP71's water is
sectors at y 50 (`MP71_WATER_EXTENT_READING`); MP71 builds no LOD copy (`NU15_SLOPE_LOD_FADE_READING`); every env
texture's `TEST_1` is `0x5000c` (`ENV_PASS_TEST_READING`, the disc's read).

## 8. B3, the rendered check (2026-10-17; the gameplay seat, the merge controller's browser slot)

A scratch Playwright probe (never committed) drew nine poses on `main` 950aa88b3's tree (the lane at 51d4e7fa9 plus docs),
fly camera at the eye, the frame settled before each shot (no LOD copy on MP71 or MP51, so holding the camera holds every
fade), both orders (the default and `NU15_ENGINE`); 2 + 2 runs passed, 18 shots, kept outside git
(`agent-mail/evidence/gameplay/NU15-B3-2026-10-17/`). **Every pose draws the terrain whole: no water, cloud or shadow quad
through a slope; MP51's courtyard grass fades into the dirt with no cut-outs.** These are pictures after B1 only (no
before-B1 run).

The poses (eye x, y, z; yaw, pitch in degrees, yaw 0 facing -z, 90 facing -x), found by a scratch ray-caster over the
disc's built world -- the best matches to the owner's words, not his recorded places (`NU15_SPOT_POSES_PLACEHOLDER`
stands until he names them):

| spot | pose | why |
|---|---|---|
| MP71, the walled dirt passage behind the terrorist spawns | (2020, 204.7, 580); 30, 0 | the back ridge (blended, nothing opaque under it) seen through the opening |
| MP71, the dirt rise at spawn B, facing the SEAL side | (2010, 196, 730); 125, 0 | a tree-shadow decal behind the near blended dirt |
| MP71, the back ridge's top | (2140, 284, 300); 135, -10 | the cloud plane at y 280 cutting the ridge |
| MP71, the SEAL beach at the grass slope | (1880, 108.7, 1640); 6.7, 1.1 | the blended grass slope over the low wall |
| MP71, the wash-ups | (1975, 82, 1650); 180, -12 | the most wash-up pixels from the beach |
| MP71, a shoreline | (1725, 79.1, 1650); 150, -12 | the most water-over-sand-rim pixels |
| MP51, the courtyard (A_ready027's fitted pose, research 82 §1.1) | (540.8, 185.6, 1480.2); 1.89, -9.18 | blended grass over the cobbles |
| MP51, the courtyard from spawn A | (545, 184.7, 1470); 30.6, -13.1 | two blended layers meeting |
| MP51, a sky rim | (800, 225.9, 1300); 150, 2 | the dome's rim and cap over the far terrain |

*Evidence on `NU15_LEAKED_DRAW_READING` (§6; reading, pending review; not settled):* the ray-caster found no MP71 pose
where **water** sits behind a blended slope with no opaque draw before it; what does sit there is the cloud layer
(`cloud_whispy.tif`, a plane at y 280), the tree-shadow decals (`treeshadow.tif`) and the sky dome's blended part --
whose texture is `congo4s_sky01.tif`, the same texture §6 names for the water's env pass. So the owner's pale patches
may be the dome or the clouds rather than the water's reflection; both readings fit the frames' look, and B1 covers all
of them. What settles it is §6's own test (the env pass switched off) on a tree before B1 (the first parent of
bf44c631e).

## 9. LATER 593: the alpha pass and the particles on one key (INV-WATER-LOOK F1-F3; 2026-11-07; reading, pending review)

The water-look report (seat b6, 2026-11-07) found the water drawn over every particle on 12 of the 13 maps with water
in the alpha pass: every particle batch at `renderOrder` 0.9375, every alpha-pass draw at 1, its reflection at 1.75.

**The original [reading, pending review].** The alpha pass `FUN_00336cb0` walks its list far to near (sorted by the
key at `+0x40`, `FUN_00336f60` D:L235220-235255) and, before each item, drains the particles whose key is above the
item's (D:L235150-235153): `FUN_00324c70(particle key, item key)` draws while `item key < particle key` (D:L223757).
The decompiler prints one argument at D:L235152; the disassembly settles the second (research 89 §20's open point): the
item's `+0x40` is loaded into `$f13` (0x336d48), compared (`c.ole.s $f20, $f13`, 0x336d4c), the particle key moved
into `$f12` in the delay slot (0x336d54) and the call made with both (0x336d58). The rest drain after the loop
(`FUN_003250b0`, D:L235180). An item's key is `FUN_00290aa0(camera, centroid)` (`FUN_003371b0` D:L235314-235317): the
range squared times the camera's `+0x2c8` (D:L137047-137059), one over the magnification (research 232 §1); a
particle's is its plain range squared (`FUN_00327910` D:L225490-225494, the dot product `FUN_001bfc98` of the offset with itself, stored at `+0x1c`, D:L225599). The reflection
goes out in its visual's own list, right after its base (§1.2).

**The port** (`viewer/src/alphaInterleave.ts`; `world.ts` `orderAlphaPass`, `alphaPass`; `particles.ts` `draw`):
with the engine order off (every page's default), `frame` numbers the pass every frame far to near by the range to each
item's centroid (F3: a world draw's and a lone prop placement's own centroid, `LoadedMesh.centre`, carried through
`mergeWorld`; an instanced draw's box centre, `ALPHA_INSTANCED_KEY_ADAPTATION`), each item at its own number in
[1, 2), its reflection an eighth of a step after it (F2), its detail pass half a step after it. The particle system
takes the pass's keys from the same eye (`WorldView.alphaPass`, wired through `matchFirearm`'s `setWorld`) and splits
each texture's batch into runs by slot (`particleSlot`: the items not below the particle's key), each run at a quarter
step before the item it precedes (`particleBucketOrder`), at most `PARTICLE_BUCKETS_PER_TEXTURE_ADAPTATION` a texture.
Ties: `ALPHA_PASS_TIE_READING`. The cost on the dev disc (`alphaInterleaveDisc.test.ts`, node): MP12 25 items, MP7 34;
the numbering and the keys well under a tenth of a millisecond a frame; no geometry rebuilt (the batches' buffers are
rewritten in place, as before).

**Not changed.** With the engine order on (a viewer instrument) the pass sits in three's opaque list
(`alphaPassState`), drawn before every particle whatever the numbers; the keys are null there and the batches keep
0.9375. The particles' eye is the camera's matrix at `effectsFrame`, the world's its position at `frame`: where the
camera moved between the two, an item and a particle crossing in range in that frame may take the other order for that
one frame. The walk's reflection (`ENV_PASS_PLACE_READING`'s open half) is unchanged.

**Evidence.** Unit tests (`alphaInterleave.test.ts`: nearer after, farther before, the strict tie, the reflection
right after its base in three's sorted list, the magnification on the items' keys only); a dev-disc test
(`alphaInterleaveDisc.test.ts`, MP12 and MP7 at the water-look poses); a rendered browser run (`e2e/waterLook.spec.ts`,
D3D11, before and after, the agent-mail evidence folder `water-look/after/`): MP12's rain rings show on the water at
`06-splash` (before: almost none), MP7's splash comes out about as bright as the report's all-after what-if, and the
mist behind MP7's pool stays under the water (the what-if drew its hard-edged sprite over it). No capture of the
original: NU-15's and the report's owed captures stand.
