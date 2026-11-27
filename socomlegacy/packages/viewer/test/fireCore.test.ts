import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Fire } from '../src/fire';
import { FireCore, type FireMarkPlan, type ShotHit } from '../src/fireCore';
import { fireTrace, renderedFireTrace, FIRE_TRACE_MODES } from './helpers/fireCoreTrace';

it.each(FIRE_TRACE_MODES.filter(mode => mode !== 'callbacks'))('headless firearm preserves events, magazine/recoil and random draws: %s', mode => {
  const actual = fireTrace((source, record, random) => new FireCore(source, record, undefined, random), mode,
    (engine, rows, clipped) => { const core = engine as FireCore; core.setMarkRows(rows); core.setMarkClipped(clipped); });
  const expected = renderedFireTrace((source, record, random) => new Fire(source, record, undefined, random), mode);
  // Presentation callbacks are absent. Their ordinary implementations consume no random values.
  const gameCalls = (calls: unknown[]) => calls.filter(call => !['material', 'clip'].includes((call as string[])[0]!));
  // `lastKept` is the drawing adapter's test instrument (the last mark clip's kept triangles); the headless core has none.
  const game = <T,>(trace: T): T => JSON.parse(JSON.stringify(trace, (key, value) => key === 'lastKept' ? undefined : value));
  expect(game({ ...actual, calls: gameCalls(actual.calls) })).toEqual(game({ ...expected, calls: gameCalls(expected.calls) }));
});

it.each([0, 2])('a graphics adapter sampling a mark %i times preserves the weapon RNG and events', count => {
  class Adapter extends FireCore {
    protected override drawMark(_hit: ShotHit, _dir: [number, number, number], plan: FireMarkPlan): void {
      for (let i = 0; i < count; i++) plan.sample();
    }
  }
  const actual = fireTrace((source, record, random) => new Adapter(source, record, undefined, random), 'fallback', () => {});
  const expected = fireTrace((source, record, random) => new FireCore(source, record, undefined, random), 'fallback', () => {});
  expect(actual).toEqual(expected);
});

it('bundles the firearm core without importing a graphics library or the old presentation adapters', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/fireCore.ts', import.meta.url))],
    bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', logLevel: 'silent' });
  const dependencies = Object.keys(result.metafile!.inputs).map(path => path.replaceAll('\\', '/'));
  expect(dependencies.filter(path => /(^|\/)three\//.test(path)
    || /viewer\/src\/(fire|markClip|hdTexturePack|bodyView|world|effects)\.ts$/.test(path))).toEqual([]);
  expect(result.outputFiles[0]!.text).not.toMatch(/class (WebGLRenderer|WebGPURenderer|MeshBasicMaterial|DataTexture)/);
});
