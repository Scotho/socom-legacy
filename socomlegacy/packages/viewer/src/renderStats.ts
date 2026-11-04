/**
 * PRF-4 (product track, a dev instrument; `docs/plans/2026-10-26-performance-profiling.md`, "(e) The tasks", PRF-4):
 * the page's renderers' counts for the dev hook, `window.__viewer.renderStats()` -- what three's `renderer.info` holds
 * (draw calls, triangles, points, lines, the frame; geometries and textures alive; programs) as plain JSON, one entry a
 * renderer by a stable label, and their sum. PRF-8 reads it for the matrix's M2 (textures and geometry by map) and the
 * draw calls by map (bottleneck B1). A browser adaptation with no original: it reads, never resets, and changes nothing
 * the game draws or does. A development build's only: `main.ts` hangs it under the dev panel's gate
 * (`import.meta.env.DEV && devToolsEnabled(SEARCH)`), which every `vite build` folds away (`test/renderStats.test.ts`).
 * CPS H9 (2026-11-03): `matchMount.ts` hangs the same call on the front end's match hook (`__frontEndMatch.renderStats()`,
 * one renderer, `match`; null until it has come) under the same gate (`devToolsEnabled`'s switch, `./source` `devSwitches`'
 * `tools`, asked direct: `./devTools` is the shell's, PAR-17) -- the match's draw count was in no record.
 *
 * **Which frame the counts are.** `createRenderer`'s `WebGPURenderer` keeps `info.autoReset` at three's default, true,
 * and the page never changes it (nor does this): three's own animation loop (`renderers/common/Animation.js`, started
 * by `init`) calls `info.reset()` once each animation frame, before that frame's draws. So the draw calls, triangles,
 * points and lines are those of the frame drawn last (every `render` of it -- the world, the HUD, the copies) when read
 * between frames, as a spec's `evaluate` reads; the memory counts and the programs are what is alive now, never reset.
 * This rests on three's frame callback running before the page's (three's is registered at `init`, the page's after):
 * a draw outside the page's frame loop (the load-time warm and compile) adds to the current frame's counts until the
 * next reset, so a reader reads between steady frames.
 *
 * **The two shapes of `info`.** three's common `Info` (the page's `WebGPURenderer`, r186): the draw calls are
 * `render.drawCalls` (its `render.calls` counts `render()` calls since the page came up), the frame is `info.frame`, the
 * programs `memory.programs` -- which counts SHADER STAGES, not linked programs (a render pipeline's vertex and fragment
 * stage once each, a compute pipeline's one: `renderers/common/Pipelines.js`), about twice a WebGL program count; its
 * byte estimates are `memory.texturesSize`, `attributesSize`, `indexAttributesSize` and `total` (`bytes` here; the
 * classic renderer has none). The classic `WebGLRenderer`'s: the draw calls are `render.calls`, the frame `render.frame`,
 * the programs `info.programs.length` (linked programs). Both are read; a count neither has is 0.
 *
 * **A read between the frames can see the reset counts.** CPS H9, 2026-11-03T01:58Z (the owner's PC): the match hook's
 * `renderStats()` read from the live scene's `page.evaluate` gave calls 0, triangles 0 (programs 170 and textures 472
 * right): the read found the counts already reset, so the ordering argument above did not hold on that page (why is
 * not settled; it need not be for the fix). So a page that reads between its frames snapshots the frame's counts at
 * its frame's tail, after the frame's last `render`
 * (`frameCountsOf`, a copy), and hands the snapshot in (`renderStats`' `lastFrames`): the render counts are then that
 * frame's, the memory and programs still what is alive now. The test room's reader keeps the live counts (none given).
 *
 * **CPS H10: the effect-light overlays a frame.** The plan's hypothesis H10: every receiver chunk an open effect light
 * reaches is re-drawn as an overlay (`./effectLights`) while any muzzle flash is live. `EffectLights.stats().overlays`
 * is the overlay meshes SHOWN now (its `shown` set's size, `refresh`'s; 0 while the pre-warm shows them) -- a state,
 * not a running total -- so the frame's count is its value at the frame's tail (`frameOverlaysOf`), no delta: the
 * overlays the frame's world render drew from, before three's frustum culling (a shown overlay off screen still counts).
 * The match page hands it in beside the draws (`renderStats`' `overlays`); absent, the result has no `overlays`.
 * The CPS overlay cull (`EffectLights.stats().culled`): of those, the ones the frame's render left out (three asked each
 * at its projection), read at the same tail (`frameOverlaysCulledOf`) and carried as `overlays_culled`.
 */

/** `renderer.info` as read here: three's common `Info` or the classic `WebGLRenderer`'s, every field optional. */
export interface RendererInfoLike {
  readonly frame?: number;
  readonly calls?: number;
  readonly render: {
    readonly calls?: number; readonly drawCalls?: number; readonly frameCalls?: number; readonly triangles?: number;
    readonly points?: number; readonly lines?: number; readonly frame?: number; readonly timestamp?: number;
  };
  readonly memory: {
    readonly geometries?: number; readonly textures?: number; readonly programs?: number;
    readonly texturesSize?: number; readonly attributesSize?: number; readonly indexAttributesSize?: number; readonly total?: number;
  };
  readonly programs?: readonly unknown[] | null;
}

/** One renderer's counts. */
export interface RendererStats {
  /** The page's stable name for it (`page`: the test room's one canvas renderer). */
  label: string;
  /** The last frame's: draw calls (`drawCalls`: never three's common `render.calls`, which counts `render()` calls), triangles, points, lines; and the frame's number. */
  render: { drawCalls: number; triangles: number; points: number; lines: number; frame: number };
  /** Alive now. */
  memory: { geometries: number; textures: number };
  /** three's common `Info`'s byte estimates of what is alive now (absent on the classic renderer, which keeps none). */
  bytes?: { textures: number; attributes: number; indexAttributes: number; total: number };
  /** Alive now: shader stages on three's common `Info`, linked programs on the classic renderer (the header). */
  programs: number;
}

/** What `renderStats()` returns: each renderer, and the sum over them (no frame: the renderers' frames differ). */
export interface RenderStats {
  renderers: RendererStats[];
  /** CPS H10: the effect-light overlays shown at the last frame's tail (`frameOverlaysOf`), where the page handed them in. */
  overlays?: number;
  /** CPS overlay cull: of `overlays`, the ones the frame's render left out (`frameOverlaysCulledOf`), where handed in. */
  overlays_culled?: number;
  sum: { render: { drawCalls: number; triangles: number; points: number; lines: number }; memory: { geometries: number; textures: number };
    bytes?: { textures: number; attributes: number; indexAttributes: number; total: number }; programs: number };
}

/** One frame's counts as a frame's tail snapshots them (`frameCountsOf`): `RendererStats['render']`'s shape. */
export type FrameCounts = RendererStats['render'];

/**
 * CPS H9: the frame's counts now, copied -- read at a frame's tail, after its last `render`, they are that frame's and
 * stay so through the next frame's reset (the header). Reads, never resets.
 */
export function frameCountsOf(info: RendererInfoLike): FrameCounts {
  const r = info.render;
  return {
    drawCalls: r.drawCalls ?? r.calls ?? 0, triangles: r.triangles ?? 0, points: r.points ?? 0, lines: r.lines ?? 0,
    frame: info.frame ?? r.frame ?? 0,
  };
}

/**
 * CPS H10: the effect-light overlays shown now (`EffectLights.stats().overlays`, a state: the header), read at a frame's
 * tail; null without the lights. Reads, never changes them.
 */
export function frameOverlaysOf(lights: { stats(): { overlays: number } } | null | undefined): number | null {
  return lights ? lights.stats().overlays : null;
}

/**
 * CPS overlay cull: of the overlays shown, the ones the last render left out (`EffectLights.stats().culled`, reset at
 * each `update`), read at a frame's tail; null without the lights or on lights before the cull. Reads, never changes them.
 */
export function frameOverlaysCulledOf(lights: { stats(): { culled?: number } } | null | undefined): number | null {
  const c = lights?.stats().culled;
  return typeof c === 'number' ? c : null;
}

/** One renderer's counts from its `info`; the render counts `last`'s where a frame's tail snapshotted them (CPS H9). */
function statsOf(label: string, info: RendererInfoLike, last: FrameCounts | null | undefined): RendererStats {
  return {
    label,
    render: last ? { ...last } : frameCountsOf(info),
    memory: { geometries: info.memory.geometries ?? 0, textures: info.memory.textures ?? 0 },
    ...(info.memory.total === undefined ? {} : { bytes: { textures: info.memory.texturesSize ?? 0, attributes: info.memory.attributesSize ?? 0,
      indexAttributes: info.memory.indexAttributesSize ?? 0, total: info.memory.total } }),
    programs: info.programs?.length ?? info.memory.programs ?? 0,
  };
}

/**
 * The renderers' counts, in the order given, and their sum; no renderers gives an empty list and a zero sum. CPS H9:
 * `lastFrames[i]`, where given, is renderer i's last frame as its frame's tail snapshotted it (`frameCountsOf`): its
 * render counts stand for the live ones, which a read between frames may find reset (the header); null or absent, live.
 * CPS H10: `overlays`, where given, is the frame's effect-light overlays (`frameOverlaysOf`), carried as `overlays`;
 * `overlaysCulled`, where given, the ones its render left out (`frameOverlaysCulledOf`), carried as `overlays_culled`.
 */
export function renderStats(
  renderers: readonly (readonly [label: string, renderer: { readonly info: RendererInfoLike }])[],
  lastFrames: readonly (FrameCounts | null)[] = [],
  overlays: number | null = null,
  overlaysCulled: number | null = null,
): RenderStats {
  const list = renderers.map(([label, renderer], i) => statsOf(label, renderer.info, lastFrames[i]));
  const sum: RenderStats['sum'] = { render: { drawCalls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 0, textures: 0 }, programs: 0 };
  for (const s of list) {
    sum.render.drawCalls += s.render.drawCalls;
    sum.render.triangles += s.render.triangles;
    sum.render.points += s.render.points;
    sum.render.lines += s.render.lines;
    sum.memory.geometries += s.memory.geometries;
    sum.memory.textures += s.memory.textures;
    sum.programs += s.programs;
    if (s.bytes) {
      const b = (sum.bytes ??= { textures: 0, attributes: 0, indexAttributes: 0, total: 0 });
      b.textures += s.bytes.textures; b.attributes += s.bytes.attributes; b.indexAttributes += s.bytes.indexAttributes; b.total += s.bytes.total;
    }
  }
  return { renderers: list, sum, ...(overlays === null ? {} : { overlays }), ...(overlaysCulled === null ? {} : { overlays_culled: overlaysCulled }) };
}
