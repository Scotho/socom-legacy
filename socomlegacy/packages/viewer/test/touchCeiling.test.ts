import { describe, expect, it } from 'vitest';
import { CEILING_DEVICE, PRESET_VALUES, readVideoSettings, renderCapFor, renderCapForV2, VIDEO_SCHEMA, videoSettingsKeeperV2 } from '../src/videoSettings';
import { TOUCH_PIXEL_RATIO_CAP_ADAPTATION } from '../src/matchViewport';

/**
 * BUG-I5 TOUCH-CEILING (INTAKE I-5, the v0.4.32 batch; product track, a browser adaptation -- the console drew one
 * 640 x 448 frame): a phone mirrored to a monitor draws the match at most at 1.5 times its CSS size
 * (`TOUCH_PIXEL_RATIO_CAP_ADAPTATION`), right in the hand and blurry on a monitor. The resolution ceiling gains an
 * explicit `Device` choice: the device's full pixel ratio, no class cap, no height cap. No preset and not Automatic
 * picks it, so nothing a player has not chosen changes.
 */

// An iPhone 16 Pro in landscape: about 874 x 402 CSS pixels at a device ratio of 3.
const PHONE = { dpr: 3, w: 874, h: 402 };

describe('BUG-I5: the Device ceiling', () => {
  it('on a touch device: the device\'s full ratio, past the 1.5 cap, no height cap', () => {
    const cap = renderCapForV2(100, CEILING_DEVICE, PHONE.dpr, true, PHONE.w, PHONE.h);
    expect(cap.ratioCap).toBe(3);
    expect(cap.maxHeightPx).toBe(Number.POSITIVE_INFINITY);
    expect(TOUCH_PIXEL_RATIO_CAP_ADAPTATION).toBe(1.5);               // the class cap itself is unchanged
  });

  it('the render scale still takes its share of it', () => {
    expect(renderCapForV2(75, CEILING_DEVICE, PHONE.dpr, true, PHONE.w, PHONE.h).ratioCap).toBeCloseTo(2.25, 10);
  });

  it('on a desktop: the device\'s ratio, past the desktop\'s 2', () => {
    expect(renderCapForV2(100, CEILING_DEVICE, 3, false, 1920, 1080).ratioCap).toBe(3);
    expect(renderCapForV2(100, CEILING_DEVICE, 1, false, 1920, 1080).ratioCap).toBe(1);
  });

  it('no device ratio reads 1', () => {
    expect(renderCapForV2(100, CEILING_DEVICE, undefined, true, PHONE.w, PHONE.h).ratioCap).toBe(1);
  });

  it('the Native ceiling on a touch device keeps the 1.5 cap (Quality unchanged)', () => {
    expect(renderCapForV2(100, 0, PHONE.dpr, true, PHONE.w, PHONE.h).ratioCap).toBe(1.5);
  });

  it('no preset holds it: every preset\'s cap on the phone is as before', () => {
    expect(Object.values(PRESET_VALUES).some((p) => p.ceiling === CEILING_DEVICE)).toBe(false);
    expect(renderCapFor('quality', PHONE.dpr, true, PHONE.w, PHONE.h).ratioCap).toBe(1.5);
    expect(renderCapFor('balanced', PHONE.dpr, true, PHONE.w, PHONE.h).ratioCap).toBe(1);
  });

  it('the ceiling row offers it, worded Device, after Native', () => {
    const row = VIDEO_SCHEMA.find((r) => r.key === 'ceiling')!;
    expect((row.values ?? []).map((v) => v.word)).toEqual(['720p', '1080p', '1440p', 'Native', 'Device']);
  });

  // The review's F1: the v1 reading (the Forge viewport, the test room, the perf line) takes Device as the top tier, as
  // it takes Native -- not Performance, which drew below what the player asked.
  it('v1 reads a Device pick as Quality, as it reads Native', () => {
    const store = new Map<string, string>();
    const keeper = videoSettingsKeeperV2((k) => store.get(k) ?? null, (k, v) => { store.set(k, v); });
    keeper.set({ ceiling: CEILING_DEVICE });
    expect(readVideoSettings((k) => store.get(k) ?? null).renderScale).toBe('quality');
  });

  // The review's F2: the row's words say what Device is.
  it('the ceiling row names Device in its help', () => {
    expect(VIDEO_SCHEMA.find((r) => r.key === 'ceiling')!.effect).toMatch(/Device/);
  });

  it('a player\'s pick of it is kept and read back', () => {
    const store = new Map<string, string>();
    const keeper = videoSettingsKeeperV2((k) => store.get(k) ?? null, (k, v) => { store.set(k, v); });
    keeper.set({ ceiling: CEILING_DEVICE });
    const again = videoSettingsKeeperV2((k) => store.get(k) ?? null, () => {});
    expect(again.get().ceiling).toBe(CEILING_DEVICE);
  });
});
