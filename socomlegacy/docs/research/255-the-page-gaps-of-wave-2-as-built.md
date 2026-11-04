# 255 -- The page gaps of wave 2 as built: the shadow, the pixel ratio, the round screens' bitmaps, the brightness

Written 2026-10-08 for seat C's wave 2 of web sprint PARITY-1 ([the plan](../plans/2026-10-08-web-sprint-parity.md), its
rows PAR-6, PAR-12, PAR-3 and PAR-13, rulings PAR.R3 and PAR.R6, the gates section's row P01) on `agent/parc2`, cut
from `agent/parity` at 37572e74 (main 7d1bdc65 with PAR-24 and PAR-1 merged). The page-wiring audit's rows A.6, A.12,
A.3 and A.13 (the plan's anchors, pinned to 293f6763 and re-located here on 37572e74) found four things `/testroom`'s
`main.ts` does that the menu-launched match (`matchMount.ts`) does not: the characters' shadow, the adaptive pixel ratio
and the phone's viewport, the round screens' two bitmaps, and the effects' brightness hand-off. Each row here writes the
shared part both pages are to call, in a non-HOT module, and hands the exact wiring hunks to wave 4's integrator
(PAR.R3: `main.ts`, `matchMount.ts`, `matchCore.ts`, `frontEnd.ts` are not this seat's to write). No game, emulator,
browser or server was run.

**Confidence.** What the original does is its notes' (research [82](82-map-fidelity-audit.md) round 4 for the shadow,
179 s10 s3 for the round screens' bitmaps, `lighting.ts`'s header for the brighten pass), at their levels (**reading**).
That the shared parts are `main.ts`'s own lines, line for line, is **reading, pending review**: a reviewer re-reads
each section against `main.ts` at 37572e74. The pixel ratio and the viewport are **browser adaptations** (the console
drew one 640 x 448 frame on a television): no original value stands behind them. Nothing here is proven.

## 0. Answers

| # | finding | where |
|---|---|---|
| R255.1 | **The renderer contract has a non-HOT home**, `packages/viewer/src/matchRenderer.ts`: `MatchRenderer` as `matchMount.ts:110` had it, widened by the shadow's render targets (`renderer: HudRenderer & Partial<ShadowRenderer>`) and `prepare`'s target and override (`MatchPrepareOptions`); `shadowRendererOf` asks for the capability at a call. `matchMount.ts` re-exports the type at wave 4, so its tests import it unchanged | §1.1, §5.1 |
| R255.2 | **The menu's renderer has the capability**: `createRenderer` (`renderer.ts:130`) makes three's `WebGPURenderer`, which has every call `CharacterShadow.update` makes; the typecheck holds `ViewerRenderer` as a `MatchRenderer` and `WebGPURenderer` as a `ShadowRenderer`. The capability stays optional in the contract because `test/matchMount.test.ts`'s fake has none | §1.1 |
| R255.3 | **The shadow is one part**: `mountCharShadow()` (`charShadow.ts`) is `main.ts`'s construction, `show`, `warmWalk` and frame lines, plus the teardown the menu page needs and `/testroom` never runs | §1.2, §5.1 |
| R255.4 | **The menu's renderer draws at the device's ratio up to 2, unadapted**: `createRenderer`'s default, measured in a unit test -- 2 on a 3x phone where `/testroom` caps 1.5 and steps down to 0.75. `./matchViewport` is `main.ts`'s policy (the cap, `AdaptiveRatio`, `watchViewport` with its teardown), a browser adaptation both pages are to run | §2, §5.2 |
| R255.5 | **The round screens' bitmaps come from the lobby's ARMORY read**, the decode the menu page already runs for the mission (`frontEnd.ts:720`), kept for its mission (`keepMissionRead`) and handed by `handRoundScreenBitmaps` -- `main.ts:424`'s line, both pages'. No worker request and no `matchLoader` hunk: that would be a second decode of the same members | §3, §5.3 |
| R255.6 | **The effects' brightness hand-off is a demonstrated no-op**: `brightenOf` reads the FIX alone, the menu's match never sets one (FIX 0, x1 -- the original's multiplayer frame, no brighten pass), and the effects start at x1 with `main.ts` their only writer. Nothing changed, no hunk; a guard test holds the facts | §4 |
| R255.7 | **The menu match drew every ramp-alpha texture as a cutout** (PAR-35): `world.ts` started `blendGraded` false although `setBlendGraded`'s own doc says on by default; /testroom's checked `graded alpha` box hid it. The default is now on, so a world built with no toggle call blends a ramp by its bind packet's `ALPHA_1` on both pages | §8 |

## 1. The renderer contract's new home and the character shadow (PAR-6)

### 1.1 The contract

`matchMount.ts:109-121` (37572e74) declared `MatchRenderer`: `render`, `resize`, `setClearColor`, `renderer` (the HUD's
pass: `HudRenderer & { dispose?(): void }`), and the optional `prepare` (options `{ stale }`), `setGlow` and `backend`.
`matchMount.ts` is HOT (PAR.R3), so a shared part could not take its renderer from there without a wave-4 edit; the
contract now lives in `matchRenderer.ts`, member for member, widened by two things the shadow draws through:

- `renderer` is `HudRenderer & Partial<ShadowRenderer> & { dispose?(): void }`. `ShadowRenderer` (`charShadow.ts`) is
  exactly what `CharacterShadow.update` calls: `getRenderTarget`, `setRenderTarget`, `getClearColor`, `getClearAlpha`,
  `setClearColor`, `clear`, `render`.
- `prepare`'s options are `MatchPrepareOptions`: `stale`, and the `target` and `override` `ViewerRenderer.prepare`
  already takes (`renderer.ts`, `PrepareOptions`) for the shadow's warm-up.

**What the menu's renderer really provides.** The front end's match draws with `createRenderer` (`matchMount.ts:537`,
`import('./renderer')`), whose `renderer` is three's `WebGPURenderer` (`renderer.ts:130`, WebGPU or its own WebGL2
backend): three r186 declares every `ShadowRenderer` call on it (`@types/three` `renderers/common/Renderer.d.ts`: `render`
510, `getClearColor` 708, `setClearColor` 715, `getClearAlpha` 721, `clear` 768, `setRenderTarget` 874,
`getRenderTarget` 880), and `/testroom` already draws the shadow through the same object (`main.ts:1600`). The
typecheck holds it (`test/charShadowMount.test.ts`: `viewerIsMatchRenderer`, `webgpuHasShadowTargets`). The capability
is optional in the contract because `test/matchMount.test.ts`'s fake renderer (`render`, `getDrawingBufferSize`,
`autoClear`, `dispose`) has none and stays unchanged (the brief's guard); `shadowRendererOf(r)` returns the renderer
when all six of its target and clear calls are there and null otherwise, and the shadow then draws nothing (`clear`).

`CharacterShadow.update`'s first parameter is now a `ShadowRenderer` (was `WebGPURenderer`): a type widening the
`WebGPURenderer` satisfies, no behaviour change.

### 1.2 The shadow as one part

`mountCharShadow(): MatchShadow` (`charShadow.ts`), each line `main.ts`'s at 37572e74:

| call | `main.ts` (37572e74) | the part |
|---|---|---|
| the construction | 655 `new CharacterShadow()` | `mountCharShadow()` makes it (`.shadow`) |
| the map's vector at the show | 1867 `charShadow.setVector(map.shadowVector ?? null)` | `setMap(map)` |
| the warm-up (research 90 item 17) | 1478-1481 `warmSetup(b.group)`, then `prepare([b.group], scene, map.camera, { stale, target, override })` | `warm(actor, scene, prepare, stale)`; nothing asked without a `prepare` or an actor |
| the frame, before the world's render | 1600 `if (body?.group.visible) charShadow.update(created.renderer, scene, body.group); else charShadow.clear();` | `frame(renderer, scene, actor)`: the same test, and none on a renderer without targets |
| the teardown | none (`/testroom`'s page never tears its match down) | `dispose()`: no shadow on the receivers (`clear`), the silhouette and the map's target freed, nothing drawn after |

`main.ts`'s rehearsal (1542, 1545: research 90 #21, the walk's first draws made once) stays `main.ts`'s own, through
`charShadow.shadow.update` / `.clear`: the menu page rehearses nothing (the compile warm-up is PAR-11's, PARITY-2).

The map's target is one for the page (`charShadow.ts`: the world's graphs sample it through `shadowFactor`), so
`dispose` frees the GPU's copy of it: three's `RenderTarget.dispose` only dispatches its event
(`three/src/core/RenderTarget.js:487-491`) and a renderer that meets it again makes it afresh, so a second match on the
same page draws its shadow as the first did.

**The original.** Research 82 round 4 (reading): only the local player casts the shadow -- `FUN_00599f00` (the character
spawn) flags its node's `+0xa1` bit 5 when the shadows are on (`DAT_003df138`) and the world has no render map yet;
`CWorld::AddChild` (`FUN_0031f240`) gives it a `CRenderMap` (`FUN_0031a9a0`) drawing into one of the 256 x 256
`ShadowX_%d` targets (`FUN_003553a0`); `FUN_0031a180` places its camera each frame. The match the lobby launches is
the same game's match: it draws the shadow as `/testroom`'s does.

**The switch.** `FRONT_END_CAPABILITIES.shadow` turns on at wave 4 (`matchCore.ts` is HOT; `test/matchCore.test.ts`'s
pin moves with it), and `MATCH_MOUNT_PARTS_PLACEHOLDER` moves the shadow into its mounted half (its row stays research
222 s6's; `test/matchMount.test.ts`'s "each part on is in the mounted half" holds it): §5.1.

**Tests** (`test/charShadowMount.test.ts`, no data): the contract's capability (`shadowRendererOf`), the frame's draw
into the 256 x 256 map on its layer with the target, clear colour and scene put back, no draw hidden, absent or without
targets, the warm-up's camera, target and override (and the frame drawing with that override), the teardown's two
disposals and no draw after. `test/charShadow.test.ts` (7) and `test/matchMount.test.ts` (90) pass unchanged.

## 2. The pixel ratio and the viewport (PAR-12)

**A browser adaptation.** The console drew one 640 x 448 frame (`renderer.ts` `PS2_FRAME`) on a television; a device
pixel ratio, a frame-time threshold and a phone's browser bar have no original. `/testroom` trades pixels for frames and
follows the phone's viewport; the menu-launched match did neither. The shared policy is `main.ts`'s, moved unchanged,
so both pages draw the same way; it changes nothing the game decides.

### 2.1 The menu renderer's default, measured

`createRenderer` (`renderer.ts:134`) starts at `Math.min(globalThis.devicePixelRatio, 2)` and sets it once
(`renderer.setPixelRatio(ratio)`); nothing on the menu page sets another (`matchMount.ts` calls only `resize`). Measured
by `test/matchViewport.test.ts` (unit test, three's `WebGPURenderer` faked as `test/experimentalRenderer.test.ts` fakes
it; no browser): **2 on a 3x device, 1.25 at 1.25, 1 at 1** -- the device's own up to 2, with no touch cap and no
adaptation. `/testroom` caps a touch device at 1.5 (`main.ts:132`) and steps the ratio down to 0.75 when frames run long
(`main.ts:1525-1533`). So on a 3x phone the menu's match drew 2x (1.78 times the pixels of 1.5x, 7.1 times those of
0.75x) and never came down; on a desktop at 1x or 2x the two pages start equal and differ only in the adaptation.
(`Math.min(undefined, 2)` is `NaN`: no browser leaves `devicePixelRatio` undefined, and `setPixelRatio`'s own clamp
reads `devicePixelRatio || 1`; recorded, not changed -- `renderer.ts` is not this row's.)

### 2.2 The shared policy

`packages/viewer/src/matchViewport.ts`, each value `main.ts`'s at 37572e74, named `*_ADAPTATION` (the repository's suffix
for a browser adaptation; the ledger's `*_READING` / `*_PLACEHOLDER` are for unknowns of the original, which these are
not):

| value | `main.ts` (37572e74) | `./matchViewport` |
|---|---|---|
| the cap: the device's, at most 2; 1.5 on a touch device | 132 `RATIO_CAP` | `pixelRatioCap(device, touch)`, `PIXEL_RATIO_CAP_ADAPTATION` 2, `TOUCH_PIXEL_RATIO_CAP_ADAPTATION` 1.5 |
| the floor | 133 `RATIO_FLOOR` 0.75 | `PIXEL_RATIO_FLOOR_ADAPTATION` |
| slow and fast frames, the least time between changes | 135 `SLOW_MS` 24, `FAST_MS` 12, `ADAPT_EVERY_MS` 2000 | `SLOW_FRAME_MS_ADAPTATION`, `FAST_FRAME_MS_ADAPTATION`, `ADAPT_EVERY_MS_ADAPTATION` |
| the step | 1528-1529 `0.25` | `PIXEL_RATIO_STEP_ADAPTATION` |
| the smoothing and its start | 1516 `16.7`, 1627 `* 0.08` | `FRAME_MS_START_ADAPTATION`, `FRAME_MS_SMOOTHING_ADAPTATION` |
| the check's tick | 1629 `> 200` | `RATIO_TICK_MS_ADAPTATION` |
| `adapt`, the start at the cap | 1525-1533 | `AdaptiveRatio.frame` (true on the tick: `main.ts` redraws its counter then), `.start` |
| the listeners | 1508-1511: the window's `resize`, the visual viewport's `resize`, `orientationchange` | `watchViewport(win, fit)`, returning the teardown that takes all three off |

The renderer's ratio is the contract's (`matchRenderer.ts`: `setPixelRatio?`, `pixelRatio?`, optional because
`test/matchMount.test.ts`'s fake has neither; `ratioTargetOf` asks at a call). The page's hold is its own: `/testroom`'s
`presentation === 'ps2' || revealing !== null` (as `adapt` read it), the menu's loading hold (`o.blocked`), under which its
frames are long on purpose as `/testroom`'s are while a map arrives. The menu's match has no PS2 presentation (a
`/testroom` chrome choice, PAR-17's exemption).

**Tests** (`test/matchViewport.test.ts`, no data): the measured default (§2.1); the cap; the steps down to the floor and
back to the cap at least 2 s apart; no change between 12 and 24 ms or while held; the smoothing and the tick; the three
listeners and their teardown (two without a visual viewport); `ratioTargetOf`. Through the mount, with §5.2 applied,
`test/matchMount.test.ts` (90) passes unchanged: its window's listeners all gone at the teardown, `orientationchange`
included.

## 3. The round screens' bitmaps (PAR-3)

**The gap.** The original's three end screens (ROUND COMPLETE, FINAL ROUND, GAME COMPLETE: `RUN/UI/READERX.ZAR`'s
`dlgMultiplayerRound.rdr`, `dlgMultiplayerFinal.rdr`, `dlgMultiplayerFinalReally.rdr`) draw `multplay_back.tif`
(512 x 512) as their BACKGROUND and `backsolid.tif` (16 x 16, RGB (0,72,88)) under their panels -- research
[216](216-the-round-screens-from-readerx.md) and 179 s10 s3 (reading; UIMP's copies are byte-identical to
`RUN/COMMON/SPMP_TXR.ZED`'s). `/testroom` hands the two to its HUD from its ARMORY read (`main.ts:423-424`, PF.R22:
`if (data) hud.addBitmaps(roundScreenBitmaps(data.bitmaps))`); `matchMount.ts` never calls `hud.addBitmaps`, so the
menu-launched match's screens drew the runtime fallback -- the opaque backdrop and every panel as shapes in
`BACKSOLID_RGB` (`roundScreens.ts:452-457` the doc, 480-487 the draw, `roundScreenLayout`). Reproduced on 37572e74 by
`test/roundScreenHandoff.test.ts`'s first case (the HUD with a map's set and no hand-off: no backdrop quad, no panel
quad, `2 + 2 x panels` triangles).

**The existing asset source: the lobby's ARMORY read.** The two bitmaps come out of `armoryFromDisc`'s decode (UIMP
first in its library order; `test/roundScreens.test.ts`: "the one path: no second decoder"). The menu page already runs
that decode for the mission: the lobby's shared ARMORY reads it in the game lobby, before the match is launched
(`frontEnd.ts:720`, `armory.load` -> `armoryFromDisc(assets, path, MISSION, { models: false, world: true })`, asked by
`LobbyArmory.want` on `dlgGameLobby.rdr`). That read is the existing source, and the hand-off takes it:

- a worker `armory` request from `matchLoader` would decode the same members a second time in the same session (the
  layout, the scripts, the arsenal, UIMP, the map's WSMP / WSLC / FONT banks) for two bitmaps, on the loading screen;
- the lobby's read starts in the lobby, before the launch, and the mount takes its promise, so the screens get the two
  whenever it lands (a read still running at the launch included); `/testroom`'s own falls back for one screen if its
  ARMORY data lands after the first round's end (the PF.R22 merge's note), and the menu's would only if the lobby's did;
- `matchLoader`'s load and `test/matchMount.test.ts`'s loader case stay as they are (a loader waiting on an `armory`
  answer would hang that case's assets, which the brief keeps unchanged).

So the brief's "`matchLoader` line" has no hunk: the option rides `MatchLoader.mount`'s pass-through of the mount's
options (`{ ...o, assets }`, `matchMount.ts:860`) unchanged.

**The hand-off** (`roundScreens.ts`):

- `handRoundScreenBitmaps(hud, data)`: `main.ts:424`'s line -- `roundScreenBitmaps(data.bitmaps)` into
  `hud.addBitmaps`, nothing without a read -- returning the names handed; `/testroom` calls it in that line's place.
- `keepMissionRead(read)`: the last mission's read kept (by its archive's name, upper case), so the lobby's read and the
  match's hand-off share one decode; another mission is read afresh, as `LobbyArmory.want` asks again on a new one.
- The front end (§5.3): `frontEnd.ts` keeps its `armory.load` through `keepMissionRead` and hands the mount
  `armory: armoryRead(m.handOff.mission)`; `matchMount.ts` takes `MatchMountOptions.armory` and hands it on at the
  HUD's making, the HUD keeping it across the map's own set (`Hud.addBitmaps`).

**Tests** (`test/roundScreenHandoff.test.ts`): the fallback reproduced (no data; green on 37572e74 by design, it pins
the state the row fixes); the lobby's read kept, handed once and drawn as quads, one decode (no data); another mission
read afresh, an empty or absent read handing nothing (no data); the lobby's exact read on the disc's files -- MP2's
`armoryFromDisc` with the world through the hand-off, the screen drawn with the backdrop and every panel as quads
(fixture: `test-fixtures/RUN/MP2.ZDB`, `RUN/UI/UIMP_TXR.ZED`, `UIMP_PAL.ZED`). `test/roundScreens.test.ts` (23) passes
unchanged.

## 4. The effects' brightness (PAR-13)

**Verified first; the verdict is a demonstrated no-op, and nothing is changed.** The audit (A.13) found `main.ts:1582`'s
per-frame `effects.setBrighten(brightenOf(lighting))` on `/testroom` alone and left its visible impact unverified (the
plan's P01 row: not to be taken for a missing original feature). On 37572e74:

1. **`brightenOf` reads the FIX alone** (`lighting.ts:59`, `1 + light.brighten / 128`): the light rig is no input, so no
   rig -- a map's `GlobalLighting`, `FALLBACK_RIG`, none, `rigEverywhere` on or off -- moves it.
2. **The menu's match never changes the FIX**: `matchMount.ts` makes `{ ...DEFAULT_LIGHTING }` (FIX 0, `lighting.ts:62`)
   and its `place` sets only `lighting.rig = m.lightRig`; no module but `main.ts` writes a FIX (`main.ts:1420`, its
   `brighten` slider -- viewer chrome, PAR-17's exemption) or calls `setBrighten` (`main.ts:1582`). So
   `brightenOf(lighting)` is 1 on the menu path, whatever the map.
3. **The effects start at 1**: `effectBrighten` is `uniform(1)` (`effectMaterials.ts:19`) and `Effects.setBrighten`
   (`effects.ts:237-238`) is its only writer; the front end's bundle never loads `main.ts` (OT.R12).

The hand-off would write 1 over 1 every frame. **The original agrees**: a multiplayer round runs no brighten pass
(`lighting.ts`'s header; research 82 D1: the state block at `0x488e48` has `+0x31 = 0` and the pass count at
`0x488e90` is 0 on the live Frostfire dumps `frostA_probe600.rdram`, `frostB_probe600.rdram`; `FUN_003b24c0`,
`FUN_0033cd50` meter it when it is on, the campaign's two passes of FIX 89-93), so x1 is the original's multiplayer
value, not a default chosen here. No constant, no hand-off and no tuning are added; the page hunk is none.

**Tests** (`test/effectsBrighten.test.ts`, no data; green on 37572e74 by design -- nothing to fix -- and red if a fact
changes: a mutation of `DEFAULT_LIGHTING`'s FIX to 8 turns the first case red): `brightenOf` under `DEFAULT_LIGHTING` is
1 for every rig and moves with the FIX alone; the effects start at 1 and the only `setBrighten` call and FIX write in
`src/` are `main.ts`'s, the menu's lighting `DEFAULT_LIGHTING`'s copy. The first case is also the viewer's unit test of
the default that `decoders.render.postprocess.mp-off` (`docs/parity/registry/decoders.json`) owes; listing it there is
that area's (this seat writes `frontend.json` alone).

**If the menu path ever gains a FIX** (a slider, a campaign map's auto-exposure), the second case turns red and the
hand-off is then needed: `effects.setBrighten(brightenOf(lighting))` in `matchMount.ts`'s frame after
`acts.turretFrame` (`main.ts:1582`'s place), owed to that row.

## 5. The hunks for wave 4's integrator

Each set applies from the repository's root (`git apply <file>`, the text between the fences) on top of the sets before
it. Each was tried in this worktree before its commit -- applied, then `tsc --noEmit -p packages/viewer` (no error) and
one vitest file a run with `--maxWorkers=1` -- and reverted: nothing of it is committed by this seat. The integrator
re-runs them on the merged tree; line numbers are 37572e74's plus this seat's files.

### 5.1 PAR-6: the contract re-pointed, the shadow mounted, the switch on

Tried: `matchMount.test.ts` 90 passed (the placeholder's pin with the shadow in the mounted half), `matchCore.test.ts`
9, `charShadowMount.test.ts` 5. `main.ts`'s behaviour is unchanged: the frame's test is the same expression, the
warm-up the same `prepare` call.

```diff
diff --git a/socomlegacy/packages/viewer/src/main.ts b/socomlegacy/packages/viewer/src/main.ts
index a74c0eba8..4a5d2c6b4 100644
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -44,7 +44,7 @@ import { ScoreboardKeys } from './scoreboardKeys';
 import { DEFAULT_PLAYER } from './scoreboard';
 import { rankOf } from './mapOrder';
 import { buildBody, type BodyView } from './bodyView';
-import { CharacterShadow } from './charShadow';
+import { mountCharShadow } from './charShadow';
 import { lensColours, nightVisionRow } from './nightVision';
 import { shownScopeNode } from './sights';
 import { bodyForTeam, hitBodiesOfPage, OwnBody } from './teamBody';
@@ -651,8 +651,8 @@ const ownBody = new OwnBody<BodyView>({
 function followTeam(team: Team | null = matchSide()): void {
   if (loaded) ownBody.follow(bodyForTeam(loaded, team, loadouts.bodyType(team ?? 'seal')));
 }
-/** The characters' shadow (`./charShadow`): the SEAL's render map, projected on the world. */
-const charShadow = new CharacterShadow();
+/** The characters' shadow (`./charShadow`): the SEAL's render map, projected on the world -- the part both pages mount (PAR-6). */
+const charShadow = mountCharShadow();
 let backend: Backend = 'webgl2';
 /** The maps the index listed, so a path can be turned back into its archive for the URL. */
 let mapList: MapInfo[] = [];
@@ -1475,10 +1475,9 @@ async function boot(): Promise<void> {
   warmWalk = async () => {
     const b = body, stale = (): boolean => body !== b;
     const overlays = [hud.warmTarget(), reticle.warmTarget()];
-    const map = b ? charShadow.warmSetup(b.group) : null;
     await Promise.all([
       b ? created.prepare([b.group], scene, fly.camera, { stale }) : null,
-      b && map ? created.prepare([b.group], scene, map.camera, { stale, target: map.target, override: map.override }) : null,
+      b ? charShadow.warm(b.group, scene, created.prepare, stale) : null,   // PAR-6: the shadow map's programs (`mountCharShadow`)
       ...overlays.map((o) => created.prepare([o.scene], o.scene, o.camera, { screen: true })),
       // Research 90 #23: the throw's arc and a blast's scorch, ahead of the scene-wide warm-up (which reaches them last).
       throws.warm((objects) => created.prepare(objects, scene, fly.camera, { stale })),   // `./matchThrow`: both pages' warm-up
@@ -1539,10 +1538,10 @@ async function boot(): Promise<void> {
   const rehearseWalk = (b: BodyView): void => {
     const arc = grenade.warmObjects().filter((o) => o.parent !== null);
     rehearse(scene, [b.group, ...arc], () => {
-      charShadow.update(created.renderer, scene, b.group);
+      charShadow.shadow.update(created.renderer, scene, b.group);
       render(scene, fly.camera);
     }, (o) => o.userData['effectLightPass'] === true);
-    charShadow.clear();
+    charShadow.shadow.clear();
     for (const o of [hud.warmTarget(), reticle.warmTarget()]) {
       rehearse(o.scene, o.scene.children, () => {
         const autoClear = created.renderer.autoClear;
@@ -1597,7 +1596,7 @@ async function boot(): Promise<void> {
       rehearsal = null;
       if (b === body && !walking) rehearseWalk(b);
     }
-    if (body?.group.visible) charShadow.update(created.renderer, scene, body.group); else charShadow.clear();
+    charShadow.frame(created.renderer, scene, body?.group ?? null);   // PAR-6: the visible body's map, else none (`mountCharShadow`)
     render(scene, fly.camera);
     firearm.aimReticle(dt);         // W2.4: the reticle on the aim point, its size, set, colour and pip
     if (!walking) tacMap.setOpen(false);
@@ -1864,7 +1863,7 @@ function show(map: LoadedMap): void {
   // W2.1: the player's body, in its bind pose at slot A (`./body`, `./bodyView`); the switch below shows it.
   // A SEAL until the match says (`followTeam`): the side's body, `Play.setBody` its play mode's body and skeleton (W2.2b).
   ownBody.reset(bodyForTeam(map, 'seal'));
-  charShadow.setVector(map.shadowVector ?? null);
+  charShadow.setMap(map);                              // PAR-6: the map's ShadowVector (`mountCharShadow`)
   // WEAPON (web sprint 4): the map's kits, and the page's player spawned with its side's -- a SEAL until the match says
   // (`respawned`): the primary in the right hand at its grip, the secondary on the hips until drawn (`./kit`).
   loadouts.setMap(map.arsenal?.table ?? null, map.arsenal?.map ?? null);
diff --git a/socomlegacy/packages/viewer/src/matchCore.ts b/socomlegacy/packages/viewer/src/matchCore.ts
index b3c456f7b..10138d5a6 100644
--- a/socomlegacy/packages/viewer/src/matchCore.ts
+++ b/socomlegacy/packages/viewer/src/matchCore.ts
@@ -93,7 +93,7 @@ export const TESTROOM_CAPABILITIES = Object.freeze({
  */
 export const FRONT_END_CAPABILITIES = Object.freeze({
   firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, exchange: false, inventory: true,
-  doors: true, actions: true, traversal: true, sound: true, touch: false, tacMap: false, shadow: false, hostages: true, taunts: true,
+  doors: true, actions: true, traversal: true, sound: true, touch: false, tacMap: false, shadow: true, hostages: true, taunts: true,
   chat: true,
 } as const) satisfies MatchCapabilities;
 
diff --git a/socomlegacy/packages/viewer/src/matchMount.ts b/socomlegacy/packages/viewer/src/matchMount.ts
index 66599f526..80b769cc3 100644
--- a/socomlegacy/packages/viewer/src/matchMount.ts
+++ b/socomlegacy/packages/viewer/src/matchMount.ts
@@ -1,4 +1,4 @@
-import { Scene, type Camera, type Object3D } from 'three';
+import { Scene } from 'three';
 import { aiCellOf, probeGround, selectFloor, type Side } from '@s2u/scene';
 import { BINOCULAR_CLIPS } from './binocularPose';
 import { GameAudio, type AudioStats } from './audio';
@@ -43,7 +43,8 @@ import type { RenderedSound } from '@s2u/sound';
 import type { SoundData } from './soundData';
 import type { EffectData } from './effectData';
 import { RemotePlayers } from './remotePlayers';
-import type { HudRenderer } from './reticle';
+import { mountCharShadow } from './charShadow';
+import { shadowRendererOf, type MatchRenderer } from './matchRenderer';
 import { resolveRules } from './rules';
 import { ScoreboardKeys } from './scoreboardKeys';
 import { GamePad } from './setupPad';
@@ -91,11 +92,11 @@ import { mouseSite } from './mouseTesting';
  * orders and marks (HX-4a/HX-5, research 239 s7, 250 s6; ruling ACT.R5: unreachable from the lobby until Desert Glory is
  * listed, ruling ACT.R6), and since TAUNTS the Chat menu's taunts (`./matchTaunts`, research 301). Not mounted yet (`FRONT_END_CAPABILITIES`' parts that are off): the world drops (their pickup is
  * the action part's; H120), WEAPON EXCHANGE (`./weaponExchange`), the ARMORY (the game socket's hello asks for none, so no
- * seat waits for it), the touch layer, the tactical map, the character shadow. The original's match has every one
+ * seat waits for it), the touch layer, the tactical map. The original's match has every one
  * (research 166 §8); the evidence that settles it is each part mounted here and a two-page browser run.
  * [placeholder]
  */
-export const MATCH_MOUNT_PARTS_PLACEHOLDER = 'world, walk, bodies, HUD, the match, the firearm and its effects, the sound, the throwables, the launcher and the R2 inventory, the doors, the actions (the switches, the bomb, the turrets), the traversal, the hostages (unreachable from the lobby until Desert Glory is listed: ACT.R6) and the Chat menu taunts, its tactical orders and messages; world drops, exchange, armory, touch, tactical map and shadow not yet' as const;
+export const MATCH_MOUNT_PARTS_PLACEHOLDER = 'world, walk, bodies, HUD, the match, the firearm and its effects, the sound, the throwables, the launcher and the R2 inventory, the doors, the actions (the switches, the bomb, the turrets), the traversal, the hostages (unreachable from the lobby until Desert Glory is listed: ACT.R6) and the Chat menu taunts, its tactical orders and messages, and since PAR-6 the character shadow; world drops, exchange, armory, touch and tactical map not yet' as const;
 
 /** The window the match runs its frames and listens on (the page's; the tests' fake). */
 export interface MatchWindow {
@@ -106,19 +107,8 @@ export interface MatchWindow {
   navigator?: PadSource;
 }
 
-/** What the match draws with: `./renderer`'s `ViewerRenderer` (its HUD pass on `renderer`), or the tests' fake. */
-export interface MatchRenderer {
-  render(scene: Scene, camera: Camera): void;
-  resize(width: number, height: number): void;
-  setClearColor(rgb: [number, number, number]): void;
-  renderer: HudRenderer & { dispose?(): void };
-  /** `ViewerRenderer.prepare`: objects compiled ahead of their first draw (research 90); absent, none warmed. */
-  prepare?(objects: readonly Object3D[], scene: Scene, camera: Camera, options?: { stale?: () => boolean }): Promise<void>;
-  /** `ViewerRenderer.setGlow`: the flashbang's glow over the world's frame (`./flash`, MATCH-THROW); absent, none drawn. */
-  setGlow?(glow: { passes: number; fix: number }): void;
-  /** `ViewerRenderer.backend`: under WebGL2 the canvas's context is let go at the close (`WEBGL_lose_context`). */
-  backend?: 'webgpu' | 'webgl2';
-}
+/** What the match draws with: since PAR-6 the contract is `./matchRenderer`'s (web research 255 s1), re-exported here. */
+export type { MatchRenderer } from './matchRenderer';
 
 /** The mission's world and the play clips, decoded while the loading screen showed (`matchLoader`). */
 export interface MatchAssets {
@@ -319,7 +309,7 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
   const ownBody = new OwnBody<BodyView>({
     build: (b) => buildBody(b, map!, lighting),
     dispose: (v) => { scene.remove(v.group); v.dispose(); },
-    attach: (v, b) => { if (v) scene.add(v.group); play.setBody(v, b); },
+    attach: (v, b) => { if (v) scene.add(v.group); play.setBody(v, b); warmShadow(); },   // PAR-6: a new body's shadow programs
     hang: () => firearm.hangKit(true),             // `./main`'s `ownBody.hang`: `hangKit(true)`
   });
   const followTeam = (team: Team | null = side()): void => { if (map) ownBody.follow(bodyForTeam(map, team, loadouts.bodyType(team ?? 'seal'))); };
@@ -405,6 +395,18 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     mouseSite('s2u-mouse-zoom');
     canvas.addEventListener('mousedown', onMouseDown);
   }
+  // PAR-6 (research 255 s1): the characters' shadow -- `/testroom`'s (`./charShadow` `mountCharShadow`): the map's vector at
+  // `place`, the body's programs for the map warmed, its map drawn each frame before the world, freed at the teardown.
+  const shadow = mountCharShadow();
+  /** The body the shadow was warmed for (`./main`'s `warmWalk` shadow line): once a body and the renderer are in. */
+  let shadowWarmed: BodyView | null = null;
+  const warmShadow = (): void => {
+    const r = renderer, v = ownBody.view();
+    if (!r?.prepare || !v || shadowWarmed === v) return;
+    shadowWarmed = v;
+    void shadow.warm(v.group, scene, (objects, sc, camera, options) => r.prepare!(objects, sc, camera, options), () => gone || ownBody.view() !== v)
+      .catch(() => { /* a stale warm-up is dropped */ });
+  };
   /** The map the throwables were warmed for (research 90 #23, `/testroom`'s `warmWalk`): once a map, the renderer and the map in. */
   let warmedFor: LoadedMap | null = null;
   const warmThrows = (): void => {
@@ -454,6 +456,7 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     // for a Terrorist seat (`./main`'s `show` places a SEAL: /testroom's page has no seat before its welcome).
     const seat = side();
     ownBody.reset(bodyForTeam(m, seat));
+    shadow.setMap(m);                                  // PAR-6: `./main`'s `show` -- the map's ShadowVector
     loadouts.setMap(m.arsenal?.table ?? null, m.arsenal?.map ?? null);
     loadouts.spawn(seat, { network: true });
     firearm.hangKit(true);                             // `./main`'s `show`: `hangKit(true)`, then `spawnKit(side)`
@@ -540,6 +543,7 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     refreshFog();
     fit();
     warmThrows();
+    warmShadow();                                      // PAR-6: the body's shadow programs, once the renderer is in
   }, (e: unknown) => { console.warn('the match would not draw:', e instanceof Error ? e.message : String(e)); });
 
   // ---- the pad (`./main`'s `padFrame`, its game lanes; controller only, OT.R29) ----
@@ -646,6 +650,7 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     view?.frame(fly.camera, dt, firearm.zoom.renderView());   // PF-29: ./main's twin (the zoom's render view)
     fly.camera.updateMatrixWorld();
     if (renderer) {
+      shadow.frame(shadowRendererOf(renderer), scene, ownBody.view()?.group ?? null);   // PAR-6: `./main`'s line before the world's render
       renderer.render(scene, fly.camera);
       net?.spectatorPad(padMerged);               // PF-31: ./main's twin
       const scoreboard = walking && (padMerged.scoreboard || scoreboardKeys.held());   // research 87 §12: SELECT held
@@ -749,6 +754,7 @@ export function mountMatch(target: HTMLElement, o: MatchMountOptions): MountedMa
     taunts.dispose();                                  // TAUNTS: the menu closed, its held buttons and the heard list gone
     chat.dispose();                                    // TACTICAL ORDERS and MESSAGES: the map's records and the heard list gone
     firearm.dispose();
+    shadow.dispose();                                  // PAR-6: the shadow's silhouette and map freed, none on the receivers
     sound.dispose();                                   // MATCH-SOUND: the ears, the cues, the map's banks and beds
     o.audio?.release();                                // the match's output off the menus' context
     canvas.removeEventListener('mousedown', onMouseDown);
diff --git a/socomlegacy/packages/viewer/test/matchCore.test.ts b/socomlegacy/packages/viewer/test/matchCore.test.ts
index 2e4fe40e3..ed9574b8d 100644
--- a/socomlegacy/packages/viewer/test/matchCore.test.ts
+++ b/socomlegacy/packages/viewer/test/matchCore.test.ts
@@ -28,7 +28,7 @@ describe('the match capabilities: one switch for what each page mounts', () => {
     const pinned: MatchCapabilities = {
       firearm: true, throwables: true, launcher: true, worldDrops: false, armory: false, exchange: false, inventory: true,
       doors: true, actions: true, traversal: true,       // ACT-1 (ruling ACT.R1): three flags, one mount -- the part picks among the pages
-      sound: true, touch: false, tacMap: false, shadow: false,
+      sound: true, touch: false, tacMap: false, shadow: true,   // PAR-6 (research 255 s1): the character shadow
       hostages: true, taunts: true,                       // ACT-5 (ACT.R5; research 239 s7.1, 250 s6): HX.R8's row -- on both pages (unreachable from the lobby: ACT.R6)
       chat: true,   // TACTICAL ORDERS and MESSAGES: research 302 (Chris's settings, 2026-10-07)
     };
```

### 5.2 PAR-12: both pages on `./matchViewport`

On top of §5.1. Tried: `matchMount.test.ts` 90 passed, `matchViewport.test.ts` 8, `charShadowMount.test.ts` 5,
`matchCore.test.ts` 9. `main.ts`'s behaviour is unchanged: the same values, the same tick; the counter is redrawn after
the check rather than before it, which reads the smoothed time the check does not change. `MatchWindow` gains the
optional `visualViewport` the page's window has.

```diff
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -45,6 +45,7 @@
 import { rankOf } from './mapOrder';
 import { buildBody, type BodyView } from './bodyView';
 import { mountCharShadow } from './charShadow';
+import { AdaptiveRatio, pixelRatioCap, watchViewport } from './matchViewport';
 import { lensColours, nightVisionRow } from './nightVision';
 import { shownScopeNode } from './sights';
 import { bodyForTeam, hitBodiesOfPage, OwnBody } from './teamBody';
@@ -126,13 +127,10 @@
 const DEFAULT_ARCHIVE = 'MP2';
 /**
  * The pixel ratio the native presentation may draw at: the device's, up to 2 on a desktop and 1.5 on a
- * phone, whose GPU is filling a screen a hand's width away. `adapt` lowers it further when frames run
- * long and raises it back when they do not.
+ * phone, whose GPU is filling a screen a hand's width away. `AdaptiveRatio` lowers it further when frames run
+ * long and raises it back when they do not (`./matchViewport`, PAR-12: the policy both pages run).
  */
-const RATIO_CAP = Math.min(globalThis.devicePixelRatio || 1, wantsTouchControls() ? 1.5 : 2);
-const RATIO_FLOOR = 0.75;
-/** Frame times that ask for a lower or a higher ratio, and how long to wait between changes. */
-const SLOW_MS = 24, FAST_MS = 12, ADAPT_EVERY_MS = 2000;
+const RATIO_CAP = pixelRatioCap(globalThis.devicePixelRatio, wantsTouchControls());
 /** The game's own projection, framebuffer-wide: `tan(hfov) / tan(vfov)` at the authored half-angles. */
 const PS2_ASPECT = Math.tan(0.6109) / Math.tan(0.4276);
 
@@ -1504,32 +1502,18 @@
     fly.setAspect(width / height);
   };
   fit();
-  globalThis.addEventListener('resize', fit);
-  // A phone's browser bar comes and goes without a window resize; the visual viewport says when.
-  globalThis.visualViewport?.addEventListener('resize', fit);
-  globalThis.addEventListener('orientationchange', fit);
+  // The window's resize; a phone's browser bar, which comes and goes without a window resize (the visual viewport says
+  // when); the rotation (`./matchViewport` `watchViewport`, PAR-12: both pages' listeners).
+  watchViewport(globalThis, fit);
 
   const timer = new Timer();
   // A frame time smoothed over about half a second: the raw number flickers too much to read, and the
   // point of the counter is to notice a map that costs 30 ms, not to watch it jitter.
-  let smoothedMs = 16.7;
-  let lastShown = 0;
-  let lastAdapted = 0;
-  /**
-   * Trades pixels for frames. A phone that cannot hold Crossroads at 1.5x drops to 1.25x, then 1x,
-   * and climbs back when it can; a desktop that never runs long never moves. Not while a map is
-   * arriving, whose frames are long on purpose, and never in the PS2 presentation, whose size is the
-   * point.
-   */
-  const adapt = (now: number): void => {
-    if (presentation === 'ps2' || revealing || now - lastAdapted < ADAPT_EVERY_MS) return;
-    const ratio = created.pixelRatio();
-    if (smoothedMs > SLOW_MS && ratio > RATIO_FLOOR) created.setPixelRatio(Math.max(RATIO_FLOOR, ratio - 0.25));
-    else if (smoothedMs < FAST_MS && ratio < RATIO_CAP) created.setPixelRatio(Math.min(RATIO_CAP, ratio + 0.25));
-    else return;
-    lastAdapted = now;
-  };
-  created.setPixelRatio(RATIO_CAP);
+  // Trades pixels for frames (`./matchViewport` `AdaptiveRatio`, PAR-12). A phone that cannot hold Crossroads at 1.5x
+  // drops to 1.25x, then 1x, and climbs back when it can; a desktop that never runs long never moves. Not while a map is
+  // arriving, whose frames are long on purpose, and never in the PS2 presentation, whose size is the point.
+  const adaptiveRatio = new AdaptiveRatio(RATIO_CAP);
+  adaptiveRatio.start(created);
   /**
    * Research 90 #21 (`./rehearsal`): the walk's first draws -- the SEAL and what it holds, its shadow map's pass, the
    * throw's arc, the HUD and the reticle -- made once in a frame before the walk, before that frame's own render,
@@ -1622,15 +1606,10 @@
     armory.frame(dt);
     if (armory.isOpen()) armoryView.render(created.renderer, armory.quads(armoryView.sizes()), armory.models());
 
-    if (dt > 0) {
-      smoothedMs += (dt * 1000 - smoothedMs) * 0.08;
-      const now = performance.now();
-      if (now - lastShown > 200) {                  // redrawing text every frame is itself a cost
-        lastShown = now;
-        ui.setFps(1000 / smoothedMs, smoothedMs);
-        adapt(now);
-        showOnline();                               // the Online line: connecting, online and the players, the retry
-      }
+    // Every 200 ms (redrawing text every frame is itself a cost): the ratio checked, the frame counter, the Online line.
+    if (adaptiveRatio.frame(dt, performance.now(), created, presentation === 'ps2' || revealing !== null)) {
+      ui.setFps(1000 / adaptiveRatio.smoothedMs(), adaptiveRatio.smoothedMs());
+      showOnline();                               // the Online line: connecting, online and the players, the retry
     }
     // The loading screen's hold (`./loadingJoin` `joinVerdict`): released on the lanes' completion, or at once on a
     // refused join -- the map then shows with the Online line and the HUD saying why, as before the hold.
--- a/socomlegacy/packages/viewer/src/matchMount.ts
+++ b/socomlegacy/packages/viewer/src/matchMount.ts
@@ -44,7 +44,9 @@
 import type { EffectData } from './effectData';
 import { RemotePlayers } from './remotePlayers';
 import { mountCharShadow } from './charShadow';
-import { shadowRendererOf, type MatchRenderer } from './matchRenderer';
+import { ratioTargetOf, shadowRendererOf, type MatchRenderer } from './matchRenderer';
+import { AdaptiveRatio, pixelRatioCap, watchViewport, type ViewportWindow } from './matchViewport';
+import { wantsTouchControls } from './touch';
 import { resolveRules } from './rules';
 import { ScoreboardKeys } from './scoreboardKeys';
 import { GamePad } from './setupPad';
@@ -105,6 +107,8 @@
   addEventListener(type: string, fn: EventListener): void;
   removeEventListener(type: string, fn: EventListener): void;
   navigator?: PadSource;
+  /** PAR-12: the phone browser bar's resizes (`./matchViewport` `watchViewport`); absent on the tests' fakes. */
+  visualViewport?: ViewportWindow['visualViewport'];
 }
 
 /** What the match draws with: since PAR-6 the contract is `./matchRenderer`'s (web research 255 s1), re-exported here. */
@@ -421,7 +425,10 @@
     renderer.resize(width, height);
     fly.setAspect(width / height);
   };
-  win.addEventListener('resize', fit);
+  // PAR-12 (research 255 s2): `./main`'s viewport and pixel ratio (`./matchViewport`) -- the window's resize, the phone
+  // browser bar's and the rotation; the ratio capped for the device and traded for frames, not while the loading hold stands.
+  const unwatchViewport = watchViewport(win, fit);
+  const adaptiveRatio = new AdaptiveRatio(pixelRatioCap(globalThis.devicePixelRatio, wantsTouchControls()));
 
   /** The world on the scene, as `./main`'s `show` puts a map up -- in one go, the loading screen already gone. */
   const place = (a: MatchAssets): void => {
@@ -542,6 +549,8 @@
     renderer = r;
     refreshFog();
     fit();
+    const ratio = ratioTargetOf(r);
+    if (ratio) adaptiveRatio.start(ratio);             // PAR-12: `./main`'s `created.setPixelRatio(RATIO_CAP)`
     warmThrows();
     warmShadow();                                      // PAR-6: the body's shadow programs, once the renderer is in
   }, (e: unknown) => { console.warn('the match would not draw:', e instanceof Error ? e.message : String(e)); });
@@ -669,6 +678,7 @@
       hud.setHostageMarks(net?.hostageMarks(map?.ai) ?? []);   // ACT-5: `./main`'s HX-5 line -- the hostages' and the zones' compass marks
       hud.render(renderer.renderer);
     }
+    adaptiveRatio.frame(dt, now, ratioTargetOf(renderer), o.blocked?.() ?? false);   // PAR-12: `./main`'s frame tail
     frameId = win.requestAnimationFrame(frame);
   };
   frameId = win.requestAnimationFrame(frame);
@@ -740,7 +750,7 @@
     acts.follow(null);                                 // ACT-1: `./main`'s wave 4 -- the pages back to no room: no bomb, no turret held
     acts.dispose();                                    // the window's blur listener let go
     for (const [type, fn] of padsOn) win.removeEventListener(type, fn);   // ACT-3: the pad watch's two
-    win.removeEventListener('resize', fit);
+    unwatchViewport();                                 // PAR-12: the resize, the visual viewport's and the rotation
     walk.unbindKey();
     scoreboardKeys.unbindKey();
     fly.dispose();
```

### 5.3 PAR-3: the hand-off on both pages, the lobby's read kept

On top of §5.1-5.2. Tried: `matchMount.test.ts` 90 passed, `roundScreens.test.ts` 23, `roundScreenHandoff.test.ts` 4,
`frontEndMatch.test.ts` 10, `frontEndWiring.test.ts` 12 (2 skipped, the base's data-gated ones), `lobbyArmory.test.ts`
11, `frontEnd.test.ts` 35 (2 skipped, the same). `main.ts`'s behaviour is unchanged (the same call); the front end's
ARMORY data is the same read, now kept for its mission.

```diff
--- a/socomlegacy/packages/viewer/src/main.ts
+++ b/socomlegacy/packages/viewer/src/main.ts
@@ -64,7 +64,7 @@
 import { ArmoryView, frameOfClient } from './armoryView';
 import { PULL_OUT_SECONDS, type ArmoryExit } from './armoryState';
 import type { ArmoryData } from './armoryData';
-import { roundScreenBitmaps } from './roundScreens';
+import { handRoundScreenBitmaps } from './roundScreens';
 import type { InputDevice, PromptInfo } from './weaponSelect';
 import type { MenuContext } from './weaponSelectState';
 import type { PadButton } from './gamepad';
@@ -418,8 +418,9 @@
 function armoryData(data: ArmoryData | null): void {
   armory.setData(data);
   armoryView.setBitmaps(data?.bitmaps ?? []);
-  // PF.R22: the round screens' backdrop and panels, UIMP's copies from this same decode, kept by the HUD across maps.
-  if (data) hud.addBitmaps(roundScreenBitmaps(data.bitmaps));
+  // PF.R22: the round screens' backdrop and panels, UIMP's copies from this same decode, kept by the HUD across maps
+  // (`./roundScreens` `handRoundScreenBitmaps`, PAR-3: the hand-off both pages call).
+  handRoundScreenBitmaps(hud, data);
   armoryView.setModels(data?.models ?? [], data?.modelTextures ?? []);
   void warmArmory?.();                              // its programs linked before it first draws (S3 part 2)
   if (!armoryWanted) return;
--- a/socomlegacy/packages/viewer/src/matchMount.ts
+++ b/socomlegacy/packages/viewer/src/matchMount.ts
@@ -11,6 +11,7 @@
 import { HostagePage } from './hostagePage';
 import type { ViewerHook } from './hook';
 import { Hud, type HudView } from './hud';
+import { handRoundScreenBitmaps, type ArmoryBitmaps } from './roundScreens';
 import { DEFAULT_LIGHTING, type Lighting } from './lighting';
 import type { LoadedMap } from './loadMap';
 import { PlayerLoadout } from './loadout';
@@ -158,6 +159,12 @@
    * left them (`./originalOptions` `playOptionsOf`), read each frame; absent, the original's defaults.
    */
   options?: () => PlayOptions;
+  /**
+   * PAR-3 (research 255 s3): the page's ARMORY read for the mission -- the front end's is the lobby's (`frontEnd.ts`,
+   * `keepMissionRead`) -- whose bitmaps hold the round screens' backdrop and panels (`./roundScreens`
+   * `handRoundScreenBitmaps`); absent, or null, the screens draw their colour-exact shapes.
+   */
+  armory?: Promise<ArmoryBitmaps | null>;
 }
 
 /** The mounted match (`LobbyMatch`'s handle), its canvas and its `NetPage` once the world is in. */
@@ -257,6 +264,9 @@
     land: (speed, at) => { sound.audio.onLand(speed, sound.walkSounds.material(at), at); },
   });
   const hud = new Hud();
+  // PAR-3 (research 255 s3): `./main`'s `armoryData` line -- the round screens' two bitmaps out of the page's ARMORY read
+  // (the lobby's), kept by the HUD across the map's own set.
+  o.armory?.then((d) => { if (!gone) handRoundScreenBitmaps(hud, d); }, () => { /* no read: the screens' shapes */ });
   const scoreboardKeys = new ScoreboardKeys(() => walk.mode() === 'walk');
   scoreboardKeys.bindKey(win as unknown as EventTarget);
   const remote = new RemotePlayers(scene, (id, step, feet) => { sound.remoteStep(id, step, feet); });   // the others' footfalls (`./matchSound`)
--- a/socomlegacy/packages/viewer/src/frontEnd.ts
+++ b/socomlegacy/packages/viewer/src/frontEnd.ts
@@ -28,6 +28,7 @@
 import { connectGameLobby, fetchGameLobbyService, GAME_LOBBY_MATCH_START, type GameLobbyHandOff, type GameLobbyTransport } from './gameLobbyHost';
 import { deferredMatch, LobbyMatch, missionMapPath, pageLobbyMatchScreen, type LobbyMatchPorts, type LobbyMatchReturn } from './lobbyMatch';
 import { armoryFromDisc, type ArmoryData } from './armoryData';
+import { keepMissionRead } from './roundScreens';
 import { LOBBY_DIALOG, LobbyArmory } from './lobbyArmory';
 import type { MatchLoader } from './matchMount';
 import type { MatchAudio } from './matchSound';
@@ -667,6 +668,12 @@
   const from = source;
   const matchLoader = (): Promise<MatchLoader> => (matchLoading ??= import('./matchMount').then((m) => m.matchLoader(from)));
   const assets = opts.assets ?? (source.kind === 'iso' ? new IsoAssetSource(source.file) : new HttpAssetSource(source.baseUrl));   // FE-ISO: the image, or the served tree
+  // The mission's ARMORY data (`./armoryData`, with its world), read in the lobby (`./lobbyArmory`) and kept for its
+  // mission: the match's round screens take their two bitmaps from the same decode (PAR-3, research 255 s3).
+  const armoryRead = keepMissionRead((mission: string): Promise<ArmoryData | null> => {
+    const path = missionMapPath(mission);
+    return path ? armoryFromDisc(assets, path, mission.toUpperCase(), { models: false, world: true }) : Promise.resolve(null);
+  });
   const out = opts.audio ? null : new WebAudioOut();
   audio = opts.audio ?? new GameAudio(out ?? undefined, undefined, { inline: false });
   // PLAT-19c's pictures and PLAT-20's sound, from the same tree (MOVIE-WIRE; `./frontEndMovies`).
@@ -717,7 +724,7 @@
       briefingRoom: fetchBriefingRoomService(accountServiceBase(search, win.location, devBuild())),                   // ONL-12: the join, the room's games, the way out
       createGame: fetchCreateGameService(accountServiceBase(search, win.location, devBuild())), missions: () => missions,   // ONL-13: CREATE GAME
       gameLobby: fetchGameLobbyService(accountServiceBase(search, win.location, devBuild())), matchSocket: pinnedMatchSocket(search, win.location, devBuild()),   // ONL-16a
-      armory: { load: (mission) => { const path = missionMapPath(mission); return path ? armoryFromDisc(assets, path, mission.toUpperCase(), { models: false, world: true }) : Promise.resolve(null); } },   // the shared ARMORY's data
+      armory: { load: armoryRead },                                                                                    // the shared ARMORY's data (kept: PAR-3)
       matchStart: (h) => { console.info('front end:', GAME_LOBBY_MATCH_START, h.mediusWorldId, h.mission); },          // the session's `match` takes the client (ONL-18)
       lobbyMatch: {                                                                                                    // ONL-18 (research 166 §5): one loading screen for every map
         screen: matchScreen.screen,
@@ -732,7 +739,8 @@
           const taunts = (): (string | null)[] => tauntTexts(session_?.uiVars ?? null);
           const messages = (): (string | null)[] => messageTexts(session_?.uiVars ?? null);
           const options = () => playOptionsOf(session_?.options);
-          return matchSound.start((audio) => l.mount(doc.body, { ...m, ...(win ? { win } : {}), ...(audio ? { audio } : {}), taunts, messages, options }));
+          // PAR-3: the round screens' bitmaps from the lobby's ARMORY read of the same mission (`armoryRead`, one decode).
+          return matchSound.start((audio) => l.mount(doc.body, { ...m, ...(win ? { win } : {}), ...(audio ? { audio } : {}), taunts, messages, options, armory: armoryRead(m.handOff.mission) }));
         })),
         // The menus take no pad while the match is up (the original's menus are not running in a match).
         // MATCH-SOUND: the menus' music held from the match's loading screen to the return.
```

### 5.4 PAR-13: none

The verdict (§4) is a demonstrated no-op: no hunk for the integrator. The hand-off a future FIX on the menu path would
need is named in §4.

### 5.5 Landed (PARITY-1 wave 4, `agent/parw4`, 2026-10-08)

5.1-5.3 applied in order on top of PAR-24, PAR-22, PAR-19, D02 and PAR-1's hunks. 5.1 by `git apply -3`: its
`matchCore.ts` and `matchMount.ts` conflicts were PAR-1's lines beside its own, resolved as their union
(`FRONT_END_CAPABILITIES` with `exchange: true` and `shadow: true`; `MATCH_MOUNT_PARTS_PLACEHOLDER` naming WEAPON EXCHANGE
and the shadow mounted). 5.2's `main.ts` hunk ported by hand: its context line `const timer = new Timer();` was gone
(PAR-24's `FrameTime`); its own lines unchanged, and `adaptiveRatio.frame(dt, ...)` reads the clamped `dt` the old
smoothing read. 5.3's `main.ts` import ported by hand (PAR-1 had moved its neighbours). The two mount-level cases
section 6 handed the integrator are in `test/matchMount.test.ts` ("PAR-12 and PAR-3 through the mount"): the menu's
renderer at the device's cap, stepped down on slow frames, the visual viewport's resize reaching it and every listener
off at the teardown; the ARMORY read handing the HUD the two bitmaps, and nothing after the teardown.

## 6. Owed

- **The browser run** on the menu path (PAR-27's gate, ACT.R7): the shadow under the SEAL in a menu-launched match on
  MP2, MP51 and MP72, as `/testroom` draws it.
- **A capture**: no capture of the original's shadow has been scored (research 82 round 4 is a reading).
- **PAR-12 on a phone** (a physical playtest, not a capture: an adaptation has no original): the menu's match at 1.5x
  stepping down on a phone, and its picture following the browser bar.
- **PAR-3 in the browser** (PAR-27's run): a menu-launched round's end on MP2 showing `multplay_back.tif` and the
  translucent panels, as `/testroom`'s does; and a mount-level case for the integrator with §5.3 (`MatchMountOptions.armory`
  resolved with the two bitmaps: the HUD's sizes hold them). *The mount-level case paid 2026-10-10:
  `test/matchMount.test.ts` "PAR-3: the page's ARMORY read (MatchMountOptions.armory) hands the HUD the round
  screens' two bitmaps once it resolves; none after the match is let go" (§5.5); the browser run stays owed.*
- **A mount-level test of PAR-12** for the integrator to add with §5.2 (`test/matchMount.test.ts` is unchanged here, the
  brief's guard): a fake renderer with `setPixelRatio` and `pixelRatio` started at the cap, and a window with a visual
  viewport whose resize reaches `resize`. *Paid 2026-10-10: `test/matchMount.test.ts` "PAR-12: the menu's renderer
  starts at the device's cap and trades pixels for slow frames (./matchViewport); ..." (§5.5); the phone run above
  stays owed.*
- **The registry's cross-list** (§4): `decoders.render.postprocess.mp-off` owes the viewer's unit test of the default
  FIX; `test/effectsBrighten.test.ts`'s first case is it, for that area to list. *Cross-listed 2026-10-10
  (`ccr-ef8214e9-7mkm9s`): the decoders entry names the test and owes nothing for the default.*
- **The corpus** (`docs/corpus/`) is rebuilt at the merge with this note in it, as the lane's merges do.

## 7. Placeholders and readings

None added and none retired. `MATCH_MOUNT_PARTS_PLACEHOLDER`'s text changes at wave 4 (§5.1); its row stays research
222 s6's. The `*_ADAPTATION` constants of §2.2 are browser adaptations with no original value, named so; they are no
reading and no placeholder of the original, and the ledger does not track them.

## 8. Graded alpha on the menu-launched match (PAR-35)

Added 2026-10-08 (23:30Z) for the plan's row PAR-35 on `agent/par35`, cut at 72a9c9e7f, from the owner's report that a
Frostfire light looked wrong on the menu-launched match against /testroom (the plan's Log, 23:23Z). No game, browser or
server was run: what follows is source inspection and unit tests (**reading, pending review**).

**The rule (reading).** Each texture record carries, after its pixels, a 144-byte prebuilt bind packet (research
[72](72-mp-map-archive-anatomy.md), the texture record) whose GIF A+D block writes `ALPHA_1`, `TEST_1`, `TEX1_1` and
`CLAMP_1` beside `TEX0`. `@s2u/gs` decodes them (`packages/gs/src/gsState.ts`: `decodeAlpha` :60, `decodeTest` :72,
`decodeGsState` :104; `tools/dump-gsstate.ts` tallies them over the corpus), held at the source by the registry's
`decoders.gs.texture.alpha-test` (Frostfire's `lightrays.tif` blends source alpha with no alpha test; only the one-bit
textures alpha-test, at GREATER 64). `materialSpec.ts`'s `discSpec` (:84-110) reads that state into a draw: `TEST.ATE`
set is a cutout at `AREF / 128`; a ramp -- the texture's alpha graded, or a packet's vertex alpha below unity, research
[82](82-map-fidelity-audit.md) round 5 -- with `ATE` clear blends by its `ALPHA` equation (`(Cs - Cd) As + Cd`,
`(Cs - 0) As + Cd` or `(Cd - 0) As + Cd`); a switch alpha is drawn as a cutout at half, the same picture. Its
`honourDisc` argument false (:103) is the viewer's escape hatch, labelled so in `materialSpec.ts`: every texture with
alpha a cutout at half, which is not the original's.

**The two pages' difference and its cause (source inspection).** `buildWorld` passes `honourDisc` as `blendGraded`, and
started it false (`world.ts:313` at 72a9c9e7f) although `WorldView.setBlendGraded`'s doc (`world.ts:74-79`) says "On by
default; off restores the cutout". /testroom's panel has `graded alpha` checked (`index.html:274`, `#blendgraded`) and
applies the panel to every new world (`main.ts:1813` `ui.apply(applyToggle)`, then `:1392` `view?.setBlendGraded(on)`),
so /testroom blended. The menu-launched match builds its world at `matchMount.ts:479` and calls no toggle, so it punched
every ramp out at half: the lamps' glows and flares, the soft decals, and research 82 round 5's vertex ramps (the
terrain overlays, the sky domes' rims, the water's edges). That this is the light the owner saw is likely, not shown:
no browser ran here. Three readers of a world material's state followed the same switch and now read on the menu
match what they read on /testroom: `effectLights.ts:165` (an effect light lays no overlay on a transparent world
mesh), `markClip.ts:286` (a mark's `blended` flag on the mesh it clips to) and `surfaceShade.ts:59` (a mark's colour
prefers the non-transparent mesh it hits, used by the menu match at `matchFirearm.ts:690`: a bullet mark on Vigilance's
grass-over-cobbles ramp takes the cobbles' colour, as on /testroom; the review's finding, 2026-10-08).

**The fix.** `world.ts`'s default is `blendGraded = true`; no HOT file changed. /testroom is unchanged: its checked box
now finds the state already on (`setBlendGraded` returns early). Nothing relied on false: the one `setBlendGraded`
call in `src/` is `main.ts:1392`; the world view is built at `main.ts:1765` and `matchMount.ts:479` and in the unit
tests, of which `worldOrder.test.ts` sets true itself in every case that has a ramp and the rest draw solid textures or
read no material state. `test/worldBlendGraded.test.ts` holds it: the world built as `matchMount.ts` builds it, no
toggle called, blends an additive glow, a source-alpha decal and a vertex ramp by their packets' equations and leaves the
solid wall opaque; `setBlendGraded(false)` still gives the cutout at half.

**The e2e specs (not run: no browser on this host).** The menu-path specs (`menuFrostfire`, `menuVigilance`,
`menuCrossroads`, `menuSides`, `twoPagesMatch`, `taunts`, `originalSettings`, `createGamePicture`) compare no pixels: their
screenshots are saved as artifacts. The specs that read a world's pixels all run on /testroom, whose drawing is
unchanged: `turretSky` (a PNG golden, `e2e/goldens/turretSky-*-win32.png`), `armoryPopupScore` (a capture score),
`binoculars`, `sights` (mean colours), `presentation` (a luma share), `weapon` (luma at points), `hud` (luma) and
`viewer` (a magenta leak count); `menuflowIso` and `openerMovies` read luma off the front end's 2D canvas, which draws
no world (the review's correction, 2026-10-08).
No spec uses `toHaveScreenshot` or `toMatchSnapshot`.

**Owed.** The browser look at PARITY-1's gate (PAR-27): Frostfire's lamps and Vigilance's grass on the menu-launched
match beside /testroom's; Craig's check on `main` after PARITY-1's pull request. No capture of the original's lamp has
been scored here; the rule stays a reading. No placeholder added or retired.
