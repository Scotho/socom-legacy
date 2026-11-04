import { describe, expect, it } from 'vitest';
import { matchLoaderSlot } from '../src/matchLoaderSlot';

describe('matchLoaderSlot (browser adaptation: the match loader let go at the match\'s return, PR #631)', () => {
  it('makes one loader on demand and hands the same one back until released', async () => {
    let made = 0;
    const slot = matchLoaderSlot(async () => ({ n: ++made, dispose: () => {} }));
    const a = await slot.get();
    const b = await slot.get();
    expect(a).toBe(b);
    expect(made).toBe(1);
  });

  it('release disposes the loader and the next get makes a fresh one', async () => {
    const disposed: number[] = [];
    let made = 0;
    const slot = matchLoaderSlot(async () => { const n = ++made; return { n, dispose: () => { disposed.push(n); } }; });
    const first = await slot.get();
    slot.release();
    await Promise.resolve();
    expect(disposed).toEqual([first.n]);
    const second = await slot.get();
    expect(second.n).toBe(2);
    expect(disposed).toEqual([1]);
  });

  it('release with nothing made, or a load that failed, is a no-op', async () => {
    const slot = matchLoaderSlot(() => Promise.reject(new Error('no loader')));
    expect(() => slot.release()).not.toThrow();
    slot.get().catch(() => undefined);
    expect(() => slot.release()).not.toThrow();
    await Promise.resolve();
  });
});

describe('releasesMatchOnReturn (scoped to the Xbox preset, PR #631)', () => {
  it('releases under the Xbox preset only', async () => {
    const { releasesMatchOnReturn } = await import('../src/matchLoaderSlot');
    expect(releasesMatchOnReturn('xbox')).toBe(true);
    expect(releasesMatchOnReturn('auto')).toBe(false);
    expect(releasesMatchOnReturn('webgl2')).toBe(false);
  });
});
