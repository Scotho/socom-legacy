import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameCountsOf, frameOverlaysCulledOf, frameOverlaysOf, renderStats, type RendererInfoLike } from '../src/renderStats';
import { builtTitle, readBuiltDist, VIEWER_DIST } from './builtDist';

/**
 * PRF-4 (product track, a dev instrument; `docs/plans/2026-10-26-performance-profiling.md`, "(e) The tasks", PRF-4):
 * `window.__viewer.renderStats()` -- the page's renderers' `renderer.info` counts as plain JSON, and their sum. Fake
 * renderers here (objects shaped like `renderer.info`, both three's common `Info` of the `WebGPURenderer` the page makes
 * and the classic `WebGLRenderer`'s); no WebGL. The hook member is a development build's only, under the dev panel's own
 * gate (`main.ts`: `import.meta.env.DEV && devToolsEnabled(SEARCH)`), which every `vite build` folds away; the release
 * check is this file's last case, with `devSeen.test.ts`'s `builtDist` guard (a skip names why, never a pass).
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

/** three's common `Info` (r186), as `createRenderer`'s `WebGPURenderer` carries it. */
const common = (o: { draws: number; tris: number; points?: number; lines?: number; frame: number; geos: number; tex: number; programs?: number }): { info: RendererInfoLike } => ({
  info: {
    frame: o.frame, calls: 9999,
    render: { calls: 9999, frameCalls: 3, drawCalls: o.draws, triangles: o.tris, points: o.points ?? 0, lines: o.lines ?? 0, timestamp: 0 },
    memory: { geometries: o.geos, textures: o.tex, ...(o.programs === undefined ? {} : { programs: o.programs }) },
  },
});

describe('PRF-4: renderStats, the page renderers\' counts', () => {
  it('one renderer (three\'s common Info): the draw calls are render.drawCalls, the frame info.frame, the programs memory.programs', () => {
    const s = renderStats([['page', common({ draws: 468, tris: 120_000, points: 4, lines: 7, frame: 812, geos: 900, tex: 310, programs: 57 })]]);
    expect(s).toEqual({
      renderers: [{
        label: 'page',
        render: { drawCalls: 468, triangles: 120_000, points: 4, lines: 7, frame: 812 },
        memory: { geometries: 900, textures: 310 },
        programs: 57,
      }],
      sum: { render: { drawCalls: 468, triangles: 120_000, points: 4, lines: 7 }, memory: { geometries: 900, textures: 310 }, programs: 57 },
    });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);           // plain JSON
  });

  it('the classic WebGLRenderer\'s info: render.calls is its draw calls, render.frame its frame, programs the array\'s length', () => {
    const classic: { info: RendererInfoLike } = {
      info: { render: { calls: 12, triangles: 300, points: 0, lines: 2, frame: 40 }, memory: { geometries: 5, textures: 6 }, programs: [{}, {}, {}] },
    };
    expect(renderStats([['preview', classic]]).renderers[0]).toEqual({
      label: 'preview', render: { drawCalls: 12, triangles: 300, points: 0, lines: 2, frame: 40 }, memory: { geometries: 5, textures: 6 }, programs: 3,
    });
  });

  it('programs absent (neither the array nor memory.programs) count 0', () => {
    expect(renderStats([['page', common({ draws: 1, tris: 2, frame: 3, geos: 4, tex: 5 })]]).renderers[0]!.programs).toBe(0);
    const bare: { info: RendererInfoLike } = { info: { render: {}, memory: {} } };
    expect(renderStats([['bare', bare]]).renderers[0]).toEqual({
      label: 'bare', render: { drawCalls: 0, triangles: 0, points: 0, lines: 0, frame: 0 }, memory: { geometries: 0, textures: 0 }, programs: 0,
    });
  });

  it('the sum adds every renderer\'s counts, in the order given, labels kept', () => {
    const s = renderStats([
      ['page', common({ draws: 10, tris: 100, points: 1, lines: 2, frame: 5, geos: 3, tex: 4, programs: 6 })],
      ['second', common({ draws: 20, tris: 200, points: 3, lines: 4, frame: 9, geos: 7, tex: 8, programs: 9 })],
    ]);
    expect(s.renderers.map((r) => r.label)).toEqual(['page', 'second']);
    expect(s.sum).toEqual({ render: { drawCalls: 30, triangles: 300, points: 4, lines: 6 }, memory: { geometries: 10, textures: 12 }, programs: 15 });
  });

  it('no renderers: an empty list and a zero sum', () => {
    expect(renderStats([])).toEqual({
      renderers: [],
      sum: { render: { drawCalls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 0, textures: 0 }, programs: 0 },
    });
  });

  it('three\'s byte estimates as bytes, per renderer and summed; absent where info keeps none (review F1)', () => {
    const sized = common({ draws: 1, tris: 2, frame: 3, geos: 4, tex: 5 });
    Object.assign(sized.info.memory, { texturesSize: 4096, attributesSize: 512, indexAttributesSize: 64, total: 4672 });
    const s = renderStats([['page', sized], ['bare', common({ draws: 0, tris: 0, frame: 0, geos: 0, tex: 0 })]]);
    expect(s.renderers[0]!.bytes).toEqual({ textures: 4096, attributes: 512, indexAttributes: 64, total: 4672 });
    expect(s.renderers[1]!).not.toHaveProperty('bytes');
    expect(s.sum.bytes).toEqual({ textures: 4096, attributes: 512, indexAttributes: 64, total: 4672 });
    expect(renderStats([['bare', common({ draws: 0, tris: 0, frame: 0, geos: 0, tex: 0 })]]).sum).not.toHaveProperty('bytes');
  });

  it('reads, never resets or changes autoReset', () => {
    const r = common({ draws: 1, tris: 1, frame: 1, geos: 1, tex: 1 });
    const info = r.info as RendererInfoLike & { autoReset?: boolean };
    info.autoReset = true;
    const before = JSON.stringify(info);
    renderStats([['page', r]]);
    expect(JSON.stringify(info)).toBe(before);
  });
});

describe('CPS H9: the last frame\'s counts, snapshotted at a frame\'s tail (the match hook reads between frames)', () => {
  // CPS H9, 2026-11-03T01:58Z (the owner's PC): the match hook's renderStats() read calls 0, triangles 0 between frames
  // (programs 170 and textures 472 right) -- three's `info.autoReset` had zeroed the frame's counts before the read.
  it('frameCountsOf reads the frame\'s counts as statsOf does (drawCalls on the common Info, calls on the classic), the frame\'s number', () => {
    expect(frameCountsOf(common({ draws: 468, tris: 120_000, points: 4, lines: 7, frame: 812, geos: 1, tex: 1 }).info))
      .toEqual({ drawCalls: 468, triangles: 120_000, points: 4, lines: 7, frame: 812 });
    expect(frameCountsOf({ render: { calls: 12, triangles: 300, lines: 2, frame: 40 }, memory: {} }))
      .toEqual({ drawCalls: 12, triangles: 300, points: 0, lines: 2, frame: 40 });
  });

  it('given a renderer\'s last frame, its render counts are that frame\'s, the memory and programs live; null or absent keeps the live counts', () => {
    const r = common({ draws: 0, tris: 0, frame: 813, geos: 900, tex: 472, programs: 170 });   // reset since: the next frame not drawn yet
    const last = { drawCalls: 1203, triangles: 450_000, points: 1, lines: 3, frame: 812 };
    expect(renderStats([['match', r]], [last])).toEqual({
      renderers: [{ label: 'match', render: { drawCalls: 1203, triangles: 450_000, points: 1, lines: 3, frame: 812 }, memory: { geometries: 900, textures: 472 }, programs: 170 }],
      sum: { render: { drawCalls: 1203, triangles: 450_000, points: 1, lines: 3 }, memory: { geometries: 900, textures: 472 }, programs: 170 },
    });
    expect(renderStats([['match', r]], [null])).toEqual(renderStats([['match', r]]));
    expect(renderStats([['match', r]], [])).toEqual(renderStats([['match', r]]));
  });

  it('a fake renderer reset between two frames: the snapshot taken at the first frame\'s tail still reports that frame', () => {
    const info = { frame: 0, render: { calls: 0, drawCalls: 0, triangles: 0, points: 0, lines: 0 }, memory: { geometries: 5, textures: 6, programs: 7 } };
    const reset = (): void => { info.frame++; info.render.drawCalls = 0; info.render.triangles = 0; };   // three's Animation: info.reset() first
    const draw = (calls: number, tris: number): void => { info.render.calls++; info.render.drawCalls += calls; info.render.triangles += tris; };
    reset(); draw(500, 200_000); draw(3, 6);
    const tail = frameCountsOf(info);                                // the frame's tail, after its last render
    reset();                                                          // the next animation frame's start: what a read between frames saw
    expect(renderStats([['match', { info }]]).sum.render).toMatchObject({ drawCalls: 0, triangles: 0 });   // the defect
    expect(renderStats([['match', { info }]], [tail]).renderers[0]!.render).toEqual({ drawCalls: 503, triangles: 200_006, points: 0, lines: 0, frame: 1 });
    expect(tail).toEqual({ drawCalls: 503, triangles: 200_006, points: 0, lines: 0, frame: 1 });   // a copy: the reset left it
  });
});

describe('CPS H10: the effect-light overlays a frame, snapshotted at the frame\'s tail beside the draws', () => {
  // CPS H10 (the plan's hypothesis): every receiver chunk the open lights reach is re-drawn as an overlay while a muzzle
  // flash is live. `EffectLights.stats().overlays` is the overlays SHOWN now (`shown.size`: a state, not a running
  // total; 0 while the pre-warm shows them), so the frame's count is its value at the frame's tail -- no delta.
  /** A fake `EffectLights`: its overlays shown change as lights open and close, as `refresh` sets `shown`. */
  const fakeLights = (): { shown: number; stats(): { overlays: number; live: number } } => ({ shown: 0, stats() { return { overlays: this.shown, live: this.shown ? 1 : 0 }; } });

  it('frameOverlaysOf reads the overlays shown now; no lights gives null', () => {
    const l = fakeLights();
    expect(frameOverlaysOf(l)).toBe(0);
    l.shown = 212;
    expect(frameOverlaysOf(l)).toBe(212);
    expect(frameOverlaysOf(null)).toBeNull();
    expect(frameOverlaysOf(undefined)).toBeNull();
  });

  it('given the frame\'s overlays, renderStats carries them (the frame\'s count, not the live one read later); absent or null, no overlays key', () => {
    const info = { frame: 0, render: { drawCalls: 0, triangles: 0 }, memory: { geometries: 1, textures: 2, programs: 3 } };
    const l = fakeLights();
    l.shown = 180; info.frame = 1; info.render.drawCalls = 900;            // a frame with a flash live
    const draws = frameCountsOf(info), overlays = frameOverlaysOf(l);      // its tail
    l.shown = 0; info.render.drawCalls = 0;                                // the flash closed; the next frame reset
    const s = renderStats([['match', { info }]], [draws], overlays);
    expect(s.overlays).toBe(180);
    expect(s.sum.render.drawCalls).toBe(900);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(renderStats([['match', { info }]], [draws])).not.toHaveProperty('overlays');
    expect(renderStats([['match', { info }]], [draws], null)).not.toHaveProperty('overlays');
    expect(renderStats([['match', { info }]], [draws], 0).overlays).toBe(0);
  });

  it('the overlays the cull left out (`EffectLights.stats().culled`): frameOverlaysCulledOf reads them, renderStats carries them as overlays_culled', () => {
    const lights = { shown: 212, culled: 150, stats() { return { overlays: this.shown, culled: this.culled }; } };
    expect(frameOverlaysCulledOf(lights)).toBe(150);
    expect(frameOverlaysCulledOf({ stats: () => ({ overlays: 3, culled: undefined }) })).toBeNull();          // a lights object before the cull
    expect(frameOverlaysCulledOf(null)).toBeNull();
    const info = { frame: 1, render: { drawCalls: 900, triangles: 0 }, memory: { geometries: 1, textures: 2, programs: 3 } };
    const draws = frameCountsOf(info), overlays = frameOverlaysOf(lights), culled = frameOverlaysCulledOf(lights);
    lights.culled = 0;                                                                       // the next frame's refresh
    const s = renderStats([['match', { info }]], [draws], overlays, culled);
    expect(s).toMatchObject({ overlays: 212, overlays_culled: 150 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(renderStats([['match', { info }]], [draws], overlays)).not.toHaveProperty('overlays_culled');
    expect(renderStats([['match', { info }]], [draws], overlays, null)).not.toHaveProperty('overlays_culled');
    expect(renderStats([['match', { info }]], [draws], null, 4)).toMatchObject({ overlays_culled: 4 });
  });

  it('matchMount.ts snapshots the firearm\'s effect lights\' overlays at the frame\'s tail, beside the draws, and hands them to renderStats', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/lastDraws = frameCountsOf\(renderer\.renderer\.info\);[^\n]*\n {4}if \(import\.meta\.en[v]\.DEV && devStats\) lastOverlays = frameOverlaysOf\(firearm\.effects\.lights\);/);
    expect(mount).toMatch(/\n {2}let lastOverlays: number \| null = null;/);
    expect(mount).toMatch(/lastOverlays = frameOverlaysOf\(firearm\.effects\.lights\); if \(import\.meta\.en[v]\.DEV && devStats\) lastOverlaysCulled = frameOverlaysCulledOf\(firearm\.effects\.lights\);/);
    expect(mount).toMatch(/\n {2}let lastOverlaysCulled: number \| null = null;/);
    expect(mount).toMatch(/renderStats\(\[\['match', \{ info \}\]\], \[lastDraws\], lastOverlays, lastOverlaysCulled\)/);
  });
});

describe('PRF-4: the hook\'s renderStats is a development build\'s only', () => {
  it('main.ts hangs it on the hook under the dev panel\'s gate (a literal import.meta.env.DEV and devToolsEnabled), once the renderer is up', () => {
    const main = src('main.ts');
    expect(main).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) window\.__viewer\.renderStats = \(\) => renderStats\(\[\['page', created\.renderer\]\]\);/);
    expect(main).toMatch(/if \(import\.meta\.en[v]\.DEV && devToolsEnabled\(SEARCH\)\) void import\('\.\/devPanel'\)/);   // the gate copied
    // Named nowhere else in main.ts: the import and that one line.
    expect(main.match(/renderStats/g)?.length).toBe(4);
  });
  it('matchMount.ts hangs it on the match hook under the same gate, over the match renderer, null before it comes (CPS H9)', () => {
    const mount = src('matchMount.ts');
    // the same switch: `devToolsEnabled` is `./source`'s `devSwitches(search).tools` (`src/devTools.ts`), asked direct (PAR-17)
    expect(mount).toMatch(/\n {2}const devStats = import\.meta\.en[v]\.DEV && devSwitches\(win\.location\?\.search \?\? ''\)\.tools;/);
    expect(mount).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devStats\) [^\n]*\.renderStats = \(\) => [^\n]*renderStats\(\[\['match', \{ info \}\]\], \[lastDraws\], lastOverlays, lastOverlaysCulled\)/);
    // the frame's tail: the last frame's counts snapshotted after its last render (the armory's), under the same gate
    expect(mount).toMatch(/armoryPart\.frame\(dt, renderer\?\.renderer \?\? null\);[^\n]*\n {4}if \(import\.meta\.en[v]\.DEV && devStats && renderer\?\.renderer\.info\) lastDraws = frameCountsOf\(renderer\.renderer\.info\);/);
    expect(src('devTools.ts')).toMatch(/export function devToolsEnabled\(search: string\): boolean \{\n {2}return devSwitches\(search\)\.tools;\n\}/);
    expect(mount).toMatch(/\n {2}renderStats\?\(\): RenderStats \| null;/);
    // CPS cell-alive (2026-11-03): the seat's state beside shadowStats, under the same gate
    expect(mount).toMatch(/\n {2}if \(import\.meta\.en[v]\.DEV && devStats\) [^\n]*\.seatState = \(\) => /);
  });
  it('the hook declares it optional (absent in a release and without ?devmode)', () => {
    expect(src('hook.ts')).toMatch(/\n {2}renderStats\?\(\): RenderStats;/);
  });
});

const dist = readBuiltDist(VIEWER_DIST);
describe.skipIf(!dist.built)(builtTitle('the built viewer has no renderStats (PRF-4; OT.R29\'s rule for dev tools)', dist), () => {
  it('its hook name is absent from dist/viewer/assets/*.js', () => {
    expect(dist.js).not.toContain('renderStats');
  });
});
