// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cropRefDistance, isScreen, PROMPT_THRESH, refScales, SCREEN_THRESH, type CropRef, type Grey64 } from '../captureRefs';

/**
 * is_screen's two thresholds (desktop@be557831:tools_py/parity/online_login_ours.py:1180-1188; web research 108 §5a):
 * 0.5 for write_down, save_card and card_slot (`Shell.PROMPT_THRESH`), 0.45 for every other reference. A reference
 * drawn from the frame's own pixels with a share of noise mixed in lands at a distance between the two (it counts for a
 * prompt, not a screen) or over both (neither). No game data: the frame and the noise are an LCG's bytes.
 */

const W = 320, H = 224;
const lcg = (seed: number) => { let s = seed; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 16) % 256; }; };
const frame = (() => { const next = lcg(7), g = new Float64Array(W * H); for (let i = 0; i < g.length; i++) g[i] = next(); return g; })();
const arr: Grey64 = { width: W, height: H, data: frame };
const box: CropRef['box'] = [40, 60, 285, 84];

/** The frame's 245x24 band at the box, `noise` percent of it replaced by a second LCG's bytes, as an 8-bit crop. */
function ref(noise: number): { meta: CropRef; scales: readonly Grey64[] } {
  const next = lcg(99), data = new Uint8Array(24 * 245);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 245; x++) {
    const v = frame[(box[1] + y) * W + box[0] + x]!;
    data[y * 245 + x] = Math.round(v * (1 - noise / 100) + next() * (noise / 100)) & 255;
  }
  return { meta: { box, thresh: 8.0 }, scales: refScales({ width: 245, height: 24, channels: 1, data }) };
}
/** One reference alone under `name`: no other shares its box, so only the threshold decides. */
const only = (name: string, r: ReturnType<typeof ref>) => new Map([[name, r]]);

describe('is_screen\'s thresholds (PROMPT_THRESH 0.5, SCREEN_THRESH 0.45)', () => {
  const between = ref(38), over = ref(44);

  it('a distance in (0.45, 0.5] matches write_down, save_card and card_slot and no other reference; one over 0.5 matches neither', () => {
    expect(PROMPT_THRESH).toEqual({ write_down: 0.5, save_card: 0.5, card_slot: 0.5 });
    expect(SCREEN_THRESH).toBe(0.45);
    const dMid = cropRefDistance(arr, between.scales, box), dOver = cropRefDistance(arr, over.scales, box);
    expect(dMid).toBeGreaterThan(SCREEN_THRESH);
    expect(dMid).toBeLessThanOrEqual(0.5);
    expect(dOver).toBeGreaterThan(0.5);
    for (const prompt of ['write_down', 'save_card', 'card_slot']) {
      expect(isScreen(arr, prompt, only(prompt, between))).toEqual({ matched: true, dist: dMid });
      expect(isScreen(arr, prompt, only(prompt, over))).toEqual({ matched: false, dist: dOver });
    }
    for (const screen of ['login', 'persona', 'universe']) {
      expect(isScreen(arr, screen, only(screen, between))).toEqual({ matched: false, dist: dMid });
      expect(isScreen(arr, screen, only(screen, over))).toEqual({ matched: false, dist: dOver });
    }
  });
});
