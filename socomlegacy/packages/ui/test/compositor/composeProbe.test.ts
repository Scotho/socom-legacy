import { afterEach, describe, expect, it } from 'vitest';
import { addChild, composeScreen, newNode, newScreen, newSprite, setComposeScreenProbe } from '../../src/index';

// GM-02 (plan 2026-11-01-gpu-menus, "Performance"): a timing hook around `composeScreen` -- an instrument of the browser
// baseline (`packages/viewer/src/uiGpuPerf.ts`), a browser adaptation with no original. It times the walk and changes
// nothing it returns: the same list, item for item, with or without a probe.

const screen = () => {
  const s = newScreen();
  const n = newNode('p', { kind: 'sprite', sprite: newSprite('p.tif', 32, 16) });
  addChild(s.backplane, n);
  return s;
};

afterEach(() => setComposeScreenProbe(null));

describe('GM-02: the composeScreen probe (an instrument; no behaviour)', () => {
  it('times each call with the probe\'s own clock, once a call', () => {
    let t = 0;
    const seen: number[] = [];
    setComposeScreenProbe({ now: () => (t += 2.5), composed: (ms) => seen.push(ms) });
    composeScreen(screen());
    composeScreen(screen());
    expect(seen).toEqual([2.5, 2.5]);
  });

  it('returns the same list with or without a probe', () => {
    const bare = composeScreen(screen());
    setComposeScreenProbe({ now: () => 0, composed: () => undefined });
    expect(composeScreen(screen())).toEqual(bare);
  });

  it('null takes the probe off: nothing is timed after it', () => {
    const seen: number[] = [];
    setComposeScreenProbe({ now: () => 1, composed: (ms) => seen.push(ms) });
    setComposeScreenProbe(null);
    composeScreen(screen());
    expect(seen).toEqual([]);
  });
});
