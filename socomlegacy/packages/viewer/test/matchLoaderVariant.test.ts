// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapVariant } from '@s2u/archive';
import { matchLoader, type MatchWorker } from '../src/matchMount';
import type { LoadedMap } from '../src/loadMap';
import type { ViewerRequest, ViewerResponse } from '../src/worker';
import { GRADE_SIZE, PS2_UNITY, type VariantProfile } from '../src/variants/profile';

/**
 * DAY-8 (product track, a browser adaptation: DAY.R1; `docs/plans/2026-11-23-day-mode.md`): the match loader applies the
 * variant the welcome told (`variant?: 'day' | 'night'`, DAY-7a) to the worker's map before the match's assets --
 * `withVariant(map, await loadVariantProfile(stem, variant))` -- keys its kept load by mission AND variant, and with no
 * profile (switch off, public export, a pair not built) or a `withVariant` diagnostic keeps the base map with a
 * diagnostic line (DAY-4's review F2). A plain load is the worker's map, untouched.
 */

/** The page's registry, replaced: the profiles this test builds by hand, by `STEM variant`. */
const profiles = new Map<string, VariantProfile>();
const asked: string[] = [];
vi.mock('../src/variants/profiles', () => ({
  loadVariantProfile: (stem: string, variant: MapVariant): Promise<VariantProfile | undefined> => {
    asked.push(`${stem} ${variant}`);
    return Promise.resolve(profiles.get(`${stem.toUpperCase()} ${variant}`));
  },
}));

/** A fake `./worker`: what it was asked, and its answers by hand (as `matchLoaderWorker.test.ts`'s). */
function fakeWorkers() {
  const made: { asked: ViewerRequest[]; say: (m: unknown) => void }[] = [];
  const make = (): MatchWorker => {
    let hear: ((e: MessageEvent<ViewerResponse>) => void) | null = null;
    const w = { asked: [] as ViewerRequest[], say: (m: unknown) => { hear!({ data: m } as MessageEvent<ViewerResponse>); } };
    made.push(w);
    return {
      postMessage: (r) => { w.asked.push(r); },
      addEventListener: ((type: string, fn: (e: MessageEvent<ViewerResponse>) => void) => { if (type === 'message') hear = fn; }) as MatchWorker['addEventListener'],
      terminate: () => {},
    };
  };
  return { made, make };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** A small decoded map by hand: one untextured world part of three vertices, colour 0.25 each lane, the night on. */
function baseMap(stem: string): LoadedMap {
  return {
    path: `RUN/${stem}.ZDB`, archive: stem, diagnostics: [], textures: {}, textureFlags: {}, props: [], camera: null,
    world: [{ positions: new Float32Array(9), colors: new Float32Array(12).fill(0.25), textureName: null }],
    night: { mission: true, lens: [1, 2, 3, 4] }, lightRig: null,
  } as unknown as LoadedMap;
}

/** A hand-built day profile: a constant grade (every lattice byte 64 -> 64 / PS2_UNITY), the night off, a light rig. */
function dayProfile(stem: string, key?: VariantProfile['key']): VariantProfile {
  return {
    stem, variant: 'day', ...(key ? { key } : {}),
    colours: { kind: 'grade', lut33: new Uint8Array(GRADE_SIZE ** 3 * 3).fill(64) },
    keepTextures: [], hideTextures: [], textureSwaps: {}, camera: {},
    night: { mission: false, lens: null },
    lightRig: { directions: [[0, -1, 0]], colours: [[1, 1, 1]], ambient: [0.5, 0.5, 0.5] },
  } as unknown as VariantProfile;
}

/** Answers the load asked from `from` on with `map`: the map, the clips, then effects and the sound's two answers. */
async function answer(w: { asked: ViewerRequest[]; say: (m: unknown) => void }, map: LoadedMap, from = 0): Promise<void> {
  const mine = w.asked.slice(from);
  const load = mine.find((r) => r.kind === 'load')!;
  const play = mine.find((r) => r.kind === 'play')!;
  const before = w.asked.length;
  w.say({ kind: 'map', id: load.id, map });
  w.say({ kind: 'play', id: play.id, data: null });
  await flush();
  const later = w.asked.slice(before);
  const effects = later.find((r) => r.kind === 'effects')!;
  const sound = later.find((r) => r.kind === 'sound')!;
  w.say({ kind: 'effects', id: effects.id, data: null });
  w.say({ kind: 'sound', id: sound.id, data: { banks: [] } });
  w.say({ kind: 'soundLoops', id: sound.id, loops: [] });
  await flush();
}

const SOURCE = { kind: 'http', baseUrl: '/maps' } as never;
const OPTIONS = { serialWorkerRequests: false, releaseWorkerAfterLoad: false, cancelSupersededLoads: false };

afterEach(() => { profiles.clear(); asked.length = 0; vi.restoreAllMocks(); });

describe('DAY-8: the match loader applies the told variant (a browser adaptation)', () => {
  it("a 'day' load returns the variant's colours and the night off", async () => {
    profiles.set('MP5 day', dayProfile('MP5'));
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, OPTIONS);
    try {
      const loading = loader.load('mp5', 'day');
      const base = baseMap('MP5');
      await answer(made[0]!, base);
      const a = await loading;
      expect(asked).toEqual(['MP5 day']);
      expect(a!.map).not.toBe(base);
      expect(Array.from(a!.map.world[0]!.colors.slice(0, 4))).toEqual([64 / PS2_UNITY, 64 / PS2_UNITY, 64 / PS2_UNITY, 0.25]);
      expect(a!.map.night).toEqual({ mission: false, lens: null });
      expect(a!.map.lightRig).toEqual({ directions: [[0, -1, 0]], colours: [[1, 1, 1]], ambient: [0.5, 0.5, 0.5] });
      expect(a!.map.diagnostics).toEqual([]);
      expect(Array.from(base.world[0]!.colors)).toEqual(new Array(12).fill(0.25));   // the worker's map untouched
    } finally { loader.dispose(); }
  });

  it("a plain load is the worker's map unchanged, the same object, and no profile is asked for", async () => {
    profiles.set('MP5 day', dayProfile('MP5'));
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, OPTIONS);
    try {
      const loading = loader.load('mp5');
      const base = baseMap('MP5');
      await answer(made[0]!, base);
      expect((await loading)!.map).toBe(base);
      expect(asked).toEqual([]);
    } finally { loader.dispose(); }
  });

  it('two loads that differ only by variant are not one kept load', async () => {
    profiles.set('MP5 day', dayProfile('MP5'));
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, OPTIONS);
    try {
      const plain = loader.load('mp5');
      const base = baseMap('MP5');
      await answer(made[0]!, base);
      expect((await plain)!.map).toBe(base);
      const from = made[0]!.asked.length;
      const day = loader.load('mp5', 'day');
      expect(day).not.toBe(plain);
      expect(made[0]!.asked.slice(from).some((r) => r.kind === 'load')).toBe(true);   // decoded again, not the kept load
      await answer(made[0]!, baseMap('MP5'), from);
      const a = await day;
      expect(a!.map.night).toEqual({ mission: false, lens: null });
      expect(loader.load('mp5', 'day')).toBe(day);                                    // the same mission and variant: kept
      const again = loader.load('mp5');
      expect(again).not.toBe(day);                                                    // and back to the plain one: not kept
    } finally { loader.dispose(); }
  });

  it('a variant with no profile (not built, switch off) gives the base map and a diagnostic, logged and kept', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, OPTIONS);
    try {
      const loading = loader.load('mp64', 'day');
      const base = baseMap('MP64');
      await answer(made[0]!, base);
      const a = await loading;
      expect(asked).toEqual(['MP64 day']);
      expect(a!.map.world).toBe(base.world);
      expect(a!.map.night).toEqual({ mission: true, lens: [1, 2, 3, 4] });
      expect(a!.map.diagnostics).toHaveLength(1);
      expect(a!.map.diagnostics[0]).toMatch(/MP64 day/);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('MP64 day'));
    } finally { loader.dispose(); }
  });

  it("withVariant's own diagnostic (a world key mismatch) gives the base map and that diagnostic, logged and kept", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    profiles.set('MP5 day', dayProfile('MP5', { vertices: 999, fnv64: '0' }));
    const { made, make } = fakeWorkers();
    const loader = matchLoader(SOURCE, make, OPTIONS);
    try {
      const loading = loader.load('mp5', 'day');
      const base = baseMap('MP5');
      await answer(made[0]!, base);
      const a = await loading;
      expect(a!.map.world).toBe(base.world);
      expect(a!.map.night).toEqual({ mission: true, lens: [1, 2, 3, 4] });
      expect(a!.map.diagnostics).toEqual([expect.stringMatching(/world key mismatch/)]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('world key mismatch'));
      expect(base.diagnostics).toEqual([]);                                           // the worker's map untouched
    } finally { loader.dispose(); }
  });
});
