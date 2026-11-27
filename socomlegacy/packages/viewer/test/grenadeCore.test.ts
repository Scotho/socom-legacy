import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { M67 } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import { GrenadeCore } from '../src/grenadeCore';
import type { PlaySnapshot } from '../src/walk';
import { GRENADE_TRACE_MODES, grenadeCoreTrace } from './helpers/grenadeCoreTrace';

it.each(GRENADE_TRACE_MODES)('keeps the original numeric grenade behavior and callback order without graphics: %s', mode => {
  const actual = grenadeCoreTrace((source, random) => new GrenadeCore(source, undefined, random), mode);
  const expected = grenadeCoreTrace((source, random) => new GrenadeThrower(source, undefined, random), mode);
  expect(actual).toEqual(expected);
});

it('applies a numeric map reset with the same pouch and flight cleanup as production setMap', () => {
  const source = { grid: () => null, snapshot: (): PlaySnapshot => ({ feet: [0, 0, 0], yaw: 0, pitch: 0,
    vx: 0, vy: 0, vz: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 } as PlaySnapshot),
    view: () => 'third' as const };
  const core = new GrenadeCore(source), drawn = new GrenadeThrower(source);
  for (const g of [core, drawn]) {
    g.setKit(['M67', 'M67', 'HE']);
    g.select('M67', 3);
    g.throwNow(0.5);
    g.launchRound(M67, [0, 10, 0], [0, 0, -10]);
    expect(g.stats().live.length).toBeGreaterThan(0);
  }
  core.setEnvironment('STONE');
  drawn.setMap(null, { defaultMaterial: 'STONE', models: [], bitmaps: {} });
  expect(core.stats()).toEqual(drawn.stats());
  expect(core.stats().live).toEqual([]);
  expect(core.magazineOf(3)?.rounds).toBe(M67.capacity);
});

it('bundles the shared grenade core without the old graphics graph', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/grenadeCore.ts', import.meta.url))],
    bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
  const dependencies = Object.keys(result.metafile!.inputs).map(path => path.replaceAll('\\', '/'));
  expect(dependencies.filter(path => /(^|\/)three\//.test(path)
    || /viewer\/src\/(grenade|grenadeAssets|fire|markClip|effectMaterials|effects|hdTexturePack|world)\.ts$/.test(path))).toEqual([]);
});
