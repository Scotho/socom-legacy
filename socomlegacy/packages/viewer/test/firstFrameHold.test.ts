import { describe, expect, it } from 'vitest';
import { FIRST_FRAME_FALLBACK_MS } from '../src/loadingHold';
import { FIRST_FRAME_COMPILE_HOLD_ADAPTATION, FIRST_FRAME_COMPILE_HOLD_MAX_MS, firstFrameHold } from '../src/firstFrameHold';

/**
 * XBOX-WARM (product track, a renderer warm-up): behind the loading screen the match's world is drawn only once nothing
 * waits in the renderer's compile queue -- a late joiner's 14 bodies, handed to `prepare` at their spawn, are linked off
 * the draw instead of synchronously by the first frame that meets them (PC 3, 2026-11-18: one 3754 ms frame, 3487 ms of
 * it in LINK_STATUS waits).
 */
describe('XBOX-WARM: the first frame waits for the compiles already asked for (a browser adaptation)', () => {
  it('is labelled as an adaptation, its bound under the loading screen\'s own fallback', () => {
    expect(FIRST_FRAME_COMPILE_HOLD_ADAPTATION).toMatch(/first world frame/);
    expect(FIRST_FRAME_COMPILE_HOLD_MAX_MS).toBe(FIRST_FRAME_FALLBACK_MS / 2);
  });

  it('holds the world\'s draw before the first frame while the queue is busy, and draws once it is idle', () => {
    const h = firstFrameHold();
    expect(h.drawWorld(0, { firstDrawn: false, compilesBusy: 0 })).toBe(true);
    expect(h.drawWorld(10, { firstDrawn: false, compilesBusy: 3 })).toBe(false);
    expect(h.drawWorld(20, { firstDrawn: false, compilesBusy: 0 })).toBe(true);
  });

  it('never holds once the first frame is drawn (a mid-match joiner draws as before)', () => {
    const h = firstFrameHold();
    expect(h.drawWorld(0, { firstDrawn: true, compilesBusy: 9 })).toBe(true);
  });

  it('lets go at its bound, counted from its first hold, and does not hold again', () => {
    const h = firstFrameHold(1000);
    expect(h.drawWorld(500, { firstDrawn: false, compilesBusy: 1 })).toBe(false);
    expect(h.drawWorld(1499, { firstDrawn: false, compilesBusy: 1 })).toBe(false);
    expect(h.drawWorld(1500, { firstDrawn: false, compilesBusy: 1 })).toBe(true);
    expect(h.drawWorld(1600, { firstDrawn: false, compilesBusy: 5 })).toBe(true);
  });

  it('holds again for a spawn wave that comes before the first frame (behind the loading screen nothing shows)', () => {
    const h = firstFrameHold();
    expect(h.drawWorld(0, { firstDrawn: false, compilesBusy: 0 })).toBe(true);
    expect(h.drawWorld(16, { firstDrawn: false, compilesBusy: 4 })).toBe(false);
    expect(h.drawWorld(33, { firstDrawn: false, compilesBusy: 0 })).toBe(true);
  });

  it('review F3: the bound counts from each hold own start -- an idle queue between holds resets it', () => {
    const h = firstFrameHold(1000);
    expect(h.drawWorld(0, { firstDrawn: false, compilesBusy: 2 })).toBe(false);
    expect(h.drawWorld(500, { firstDrawn: false, compilesBusy: 0 })).toBe(true);    // the first hold ends, short of the bound
    expect(h.drawWorld(31_000, { firstDrawn: false, compilesBusy: 3 })).toBe(false); // a later wave: held, its own clock
    expect(h.drawWorld(31_999, { firstDrawn: false, compilesBusy: 3 })).toBe(false);
    expect(h.drawWorld(32_000, { firstDrawn: false, compilesBusy: 3 })).toBe(true);
  });

  it('decides only whether to draw: it takes no scene, material or renderer (nothing drawn changes, only when)', () => {
    expect(firstFrameHold().drawWorld.length).toBe(2);
  });
});
