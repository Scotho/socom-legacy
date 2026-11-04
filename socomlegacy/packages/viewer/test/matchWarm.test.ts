import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { warmMapEffects, type WarmableEffects } from '../src/matchWarm';

/**
 * LATER 253: the map's effects warmed on a match page (`../src/matchWarm`), `./main`'s `warmEffects` sequence: the
 * warm-up group in, the compile, the group out once the compile has its list (`warmStarted`), and done when it settles
 * (`warmDone`) -- on every path, a compile that throws at once among them (the review's F1: `warmDone` ends the light
 * passes' warm-up, `EffectLights.warming`, else no effect lit its surroundings for the rest of the map).
 */
function fake(loaded = true): { e: WarmableEffects; log: string[] } {
  const log: string[] = [];
  const e: WarmableEffects = {
    stats: () => ({ loaded }),
    warmUp: () => { log.push('warmUp'); return new Group(); },
    warmStarted: () => { log.push('warmStarted'); },
    warmDone: () => { log.push('warmDone'); },
  };
  return { e, log };
}

describe('LATER 253: the effects\' warm-up on a match page', () => {
  it('warmUp, the compile, warmStarted at once, warmDone when it settles', async () => {
    const { e, log } = fake();
    let settle!: () => void;
    const done = warmMapEffects(e, () => { log.push('compile'); return new Promise<void>((r) => { settle = r; }); });
    expect(log).toEqual(['warmUp', 'compile', 'warmStarted']);
    settle();
    await done;
    expect(log).toEqual(['warmUp', 'compile', 'warmStarted', 'warmDone']);
  });

  it('no effects loaded: nothing', async () => {
    const { e, log } = fake(false);
    await warmMapEffects(e, async () => { log.push('compile'); });
    expect(log).toEqual([]);
  });

  it('a compile that rejects: warmDone all the same', async () => {
    const { e, log } = fake();
    await expect(warmMapEffects(e, () => Promise.reject(new Error('lost')))).rejects.toThrow('lost');
    expect(log).toEqual(['warmUp', 'warmStarted', 'warmDone']);
  });

  it('the review\'s F1: a compile that throws at once: warmStarted and warmDone all the same', async () => {
    const { e, log } = fake();
    await expect(warmMapEffects(e, () => { throw new Error('at once'); })).rejects.toThrow('at once');
    expect(log).toEqual(['warmUp', 'warmStarted', 'warmDone']);
  });
});
