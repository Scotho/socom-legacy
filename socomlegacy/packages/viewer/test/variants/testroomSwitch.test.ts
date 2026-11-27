import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MapVariant } from '@s2u/archive';
import type { LoadedMap } from '../../src/loadMap';
import type { VariantProfile } from '../../src/variants/profile';
import { profileFor } from '../../src/variants/profiles';
import { testroomVariant, VARIANT_TESTROOM_ADAPTATION } from '../../src/variants/testroomSwitch';

/**
 * DAY-3 (product track: a development instrument, a browser adaptation). `?variant=day|night` on the test room and the
 * xbox-renderer page: the stem's profile from the registry applied with `withVariant`, or a plain refusal line and the
 * map as decoded. The map is hand-built with only the fields the switch and `withVariant` read, cast through `unknown`.
 */
function makeMap(archive = 'MP5'): LoadedMap {
  return {
    archive, path: `RUN/${archive}.ZDB`, name: 'test', diagnostics: ['decoded note'],
    world: [{ textureName: 'ground.tif', positions: Float32Array.from([0, 0, 0]), colors: Float32Array.from([0.5, 0.5, 0.5, 1]), fog: true, cull: false }],
    props: [], textures: {}, textureFlags: {},
    camera: null,
    night: { mission: true, lens: null },
    lightRig: { directions: [[0, 1, 0]], colours: [[0.2, 0.2, 0.3]], ambient: [0.1, 0.1, 0.1] },
  } as unknown as LoadedMap;
}

const stub: VariantProfile = {
  stem: 'MP5', variant: 'day', colours: null, keepTextures: [], hideTextures: [], textureSwaps: {},
  night: { mission: false, lens: null },
  lightRig: { directions: [[0, -1, 0]], colours: [[0.96, 0.93, 0.86]], ambient: [0.5, 0.5, 0.5] },
  camera: {},
};

describe('testroomVariant (DAY-3)', () => {
  it('no ?variant= (or an empty one) changes nothing', () => {
    expect(testroomVariant('', makeMap())).toBeNull();
    expect(testroomVariant('?map=MP5&devmode', makeMap())).toBeNull();
    expect(testroomVariant('?variant=', makeMap())).toBeNull();
  });

  it('day on MP5 asks the registry for MP5 day; none loaded yet (loadVariantProfile not awaited), so the map draws as decoded and says so', () => {
    const asked: [string, MapVariant][] = [];
    const m = makeMap('MP5');
    const out = testroomVariant('?variant=day', m, (stem, v) => { asked.push([stem, v]); return profileFor(stem, v); })!;
    expect(asked).toEqual([['MP5', 'day']]);
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/MP5 day/);
    expect(out.line).toMatch(/not built yet/);
    expect(out.line).toMatch(/drawn as decoded/);
    expect(out.map.world).toBe(m.world);
    expect(out.map.night).toBe(m.night);
    expect(out.map.diagnostics).toEqual(['decoded note', out.line]);
    expect(m.diagnostics).toEqual(['decoded note']);       // the decoded map untouched
  });

  it('the default registry answers undefined until a profile is loaded (DAY-P1b: Abandoned (Day) is built, fetched by loadVariantProfile)', () => {
    expect(profileFor('MP5', 'day')).toBeUndefined();                 // built, but nothing loaded in this file
    expect(profileFor('MP64', 'day')).toBeUndefined();
    expect(profileFor('MP6', 'night')).toBeUndefined();
    const out = testroomVariant('?variant=day', makeMap('MP5'))!;
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/not built yet/);
  });

  it('day on MP2 is off the table: the refusal names the table and never asks the registry', () => {
    let asked = 0;
    const m = makeMap('MP2');
    const out = testroomVariant('?variant=day', m, () => { asked++; return stub; })!;
    expect(asked).toBe(0);
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/MP2 has no day variant/);
    expect(out.line).toMatch(/MP5 day, MP64 day, MP6 night/);
    expect(out.line).toMatch(/drawn as decoded/);
    expect(out.map.world).toBe(m.world);
  });

  it('night on MP5 is off the table too', () => {
    const out = testroomVariant('?variant=night', makeMap('MP5'), () => stub)!;
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/MP5 has no night variant/);
  });

  it('a word that is no time is refused in plain words', () => {
    const out = testroomVariant('?variant=dusk', makeMap('MP5'), () => stub)!;
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/"dusk"/);
    expect(out.line).toMatch(/day or night/);
  });

  it('a profile in the registry is applied with withVariant before the world is built', () => {
    const m = makeMap('MP5');
    const out = testroomVariant('?devmode&variant=DAY', m, (stem, v) => (stem === 'MP5' && v === 'day' ? stub : undefined))!;
    expect(out.applied).toBe(true);
    expect(out.map.night).toEqual({ mission: false, lens: null });
    expect(out.map.lightRig?.colours).toEqual([[0.96, 0.93, 0.86]]);   // `LoadedMap.lightRig` is nullable
    expect(out.line).toMatch(/Abandoned \(Day\)/);
    expect(out.line).toMatch(/development instrument/);
    expect(out.map.diagnostics.at(-1)).toBe(out.line);
    expect(m.night).toEqual({ mission: true, lens: null });  // the decoded map untouched
  });

  it("withVariant's diagnostic (a key mismatch) is the line, and the map draws as decoded", () => {
    const m = makeMap('MP5');
    const keyed: VariantProfile = { ...stub, key: { vertices: 999, fnv64: '0000000000000000' } };
    const out = testroomVariant('?variant=day', m, () => keyed)!;
    expect(out.applied).toBe(false);
    expect(out.line).toMatch(/world key mismatch/);
    expect(out.map.world).toBe(m.world);
    expect(out.map.night).toBe(m.night);
  });

  it('is labelled a browser adaptation and a development instrument', () => {
    expect(VARIANT_TESTROOM_ADAPTATION).toMatch(/browser adaptation/);
    expect(VARIANT_TESTROOM_ADAPTATION).toMatch(/development instrument/);
  });
});

/** The relative imports (static, re-export, dynamic, bare) of a source file, resolved to files. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s*['"](\.[^'"]+)['"]/gm;
  for (const m of text.matchAll(re)) {
    const p = resolve(dirname(file), m[1] ?? m[2] ?? m[3]!);
    const hit = [p, `${p}.ts`, join(p, 'index.ts')].find((c) => existsSync(c) && statSync(c).isFile());
    if (hit) out.push(hit);
  }
  return out;
}

describe('the switch never reaches the game path (DAY-3)', () => {
  const src = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
  const target = resolve(src, 'variants/testroomSwitch.ts');
  const entries = ['matchMount.ts', 'frontEnd.ts', 'netPage.ts'].map((f) => resolve(src, f));

  it('the switch exists and the match entries exist (the scan is not vacuous)', () => {
    expect(existsSync(target)).toBe(true);
    for (const e of entries) expect(existsSync(e)).toBe(true);
  });

  it('nothing matchMount, frontEnd or netPage imports, directly or through any chain, is testroomSwitch.ts', () => {
    const seen = new Map<string, string>();
    const queue = entries.map((e): [string, string] => [e, 'entry']);
    const work = [...queue];
    while (work.length) {
      const [file, from] = work.pop()!;
      if (seen.has(file)) continue;
      seen.set(file, from);
      for (const next of importsOf(file)) if (!seen.has(next)) work.push([next, file]);
    }
    expect(seen.size).toBeGreaterThan(50);                // the walk followed the match's imports
    const chain: string[] = [];
    for (let at: string | undefined = target; at && seen.has(at); at = seen.get(at)) chain.push(at);
    expect(chain).toEqual([]);
    expect(seen.has(resolve(src, 'main.ts'))).toBe(false);   // nor the test room's page that calls it
  });
});
