import { describe, expect, it } from 'vitest';
import type { ExtractMapsOptions, ExtractMapsResult } from '../extractMaps';
import { PrepareBusy, createPreparer, progressLine } from '../parity-pack/gui/prepare';

/**
 * PK-5: the parity pack's Prepare over PK-1's extractMaps (product track, an adaptation): the image laid out straight
 * into the pack's maps folder (disc === maps), the streams and the campaign in, no fixtures, no clone guard; one at a
 * time. A fake extractMaps stands in (no ISO here).
 */

const RESULT: ExtractMapsResult = { maps: [], written: 1, kept: 0, missing: [], archives: { maps: 1, campaign: 12 }, frontEnd: 0 };

describe('prepare', () => {
  it('calls extractMaps with the image, disc = maps, streams and campaign on, fixtures and the clone guard off', async () => {
    const seen: ExtractMapsOptions[] = [];
    const p = createPreparer(async (o) => { seen.push(o); return RESULT; });
    expect(await p.prepare({ iso: 'D:/P/drop-here/S.iso', maps: 'D:/P/pack/maps' })).toBe(RESULT);
    expect(seen[0]).toMatchObject({ iso: 'D:/P/drop-here/S.iso', disc: 'D:/P/pack/maps', maps: 'D:/P/pack/maps', fixtures: null, streams: true, campaign: true, cloneRoot: null });
    expect(p.state).toMatchObject({ running: false, finished: true, error: null });
  });

  it('reports each step as a sentence and the state as it goes', async () => {
    const lines: string[] = [];
    const states: { done: number; total: number }[] = [];
    const p = createPreparer(async (o) => {
      o.onProgress!({ phase: 'materialize', done: 0, total: 2 });
      o.onProgress!({ phase: 'materialize', done: 1, total: 2, file: 'RUN/M51.ZDB' });
      o.onProgress!({ phase: 'copy', done: 40, total: 40 });
      o.onProgress!({ phase: 'index', done: 0, total: 1 });
      o.log!('materialize-iso: 2 written');
      return RESULT;
    });
    const logs: string[] = [];
    await p.prepare({ iso: 'i', maps: 'm', log: (l) => logs.push(l), onProgress: (l, s) => { lines.push(l); states.push({ done: s.done, total: s.total }); } });
    expect(lines).toEqual([
      'preparing the maps: 0 of 2', 'preparing the maps: 1 of 2 -- RUN/M51.ZDB', 'preparing the maps: 40 of 40 in place',
      'preparing the maps: writing the index', 'the maps are prepared',
    ]);
    expect(states[1]).toEqual({ done: 1, total: 2 });
    expect(logs).toEqual(['materialize-iso: 2 written']);
    expect(progressLine({ phase: 'materialize', done: 3, total: 9 })).toBe('preparing the maps: 3 of 9');
  });

  it('a second call while one runs is refused; after it ends another may run', async () => {
    let release!: () => void;
    let calls = 0;
    const p = createPreparer(() => { calls++; return new Promise<ExtractMapsResult>((ok) => { release = () => ok(RESULT); }); });
    const first = p.prepare({ iso: 'i', maps: 'm' });
    expect(p.state.running).toBe(true);
    await expect(p.prepare({ iso: 'i', maps: 'm' })).rejects.toBeInstanceOf(PrepareBusy);
    release();
    await first;
    const again = p.prepare({ iso: 'i', maps: 'm' });
    release();
    await again;
    expect(calls).toBe(2);
  });

  it('a refusal of the extract is kept as the state\'s error, its first line', async () => {
    const p = createPreparer(async () => { throw new Error('materialize-iso: the image has no RUN/COMMON.ZAR\nmore'); });
    await expect(p.prepare({ iso: 'i', maps: 'm' })).rejects.toThrow(/COMMON/);
    expect(p.state).toMatchObject({ running: false, finished: false, error: 'materialize-iso: the image has no RUN/COMMON.ZAR' });
  });
});
