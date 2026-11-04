// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { VIDEO_PICTURE_HD_OFFERED } from '@s2u/ui';
import { MATCH_CANVAS_CLASS, parsePicture, PICTURE_KEY, PICTURE_PS2_CLASS, pictureKeeper } from '../src/picture';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

// HD-HOLD (the owner, 2026-11-01: "Hide/disable the HD pack ... leave it in the build just don't allow people to turn it
// on"): while VIDEO_PICTURE_HD_OFFERED is false a stored 'experimental' reads as MODERN and the keeper never takes it.
// Flipping the constant back makes these pins expect the HD picture again.
const HD = VIDEO_PICTURE_HD_OFFERED;

/** OT.R79 (LATER 378): the front end's picture, this browser's -- MODERN by default (the merge controller's call B'). */
describe('the page\'s picture (OT.R79)', () => {
  it('a key of the page\'s own, beside the test room\'s look; anything unknown reads MODERN', () => {
    expect(PICTURE_KEY).toBe('s2u.viewer.picture');
    expect(PAGE_SETTING_KEYS).toContain(PICTURE_KEY);
    expect(PAGE_SETTING_KEYS).toContain('s2u.viewer.look');                             // the test room's, untouched (LATER 379)
    expect([parsePicture(null), parsePicture('ps2'), parsePicture('experimental'), parsePicture('480p')])
      .toEqual(['modern', 'ps2', HD ? 'experimental' : 'modern', 'modern']);           // HD-HOLD: a stored HD reads MODERN
    expect([MATCH_CANVAS_CLASS, PICTURE_PS2_CLASS]).toEqual(['s2u-match', 's2u-picture-ps2']);
  });

  it('the keeper: read once, a change stored and heard, the same picture again nothing', () => {
    const store = new Map<string, string>([[PICTURE_KEY, 'ps2']]), heard: string[] = [];
    const k = pictureKeeper((key) => store.get(key) ?? null, (key, v) => { store.set(key, v); });
    expect(k.get()).toBe('ps2');
    const stop = k.observe((p) => heard.push(p));
    k.set('ps2');
    k.set('experimental');                                                              // HD-HOLD: never turned on while held
    const hd = HD ? ['experimental'] : [];
    expect([k.get(), store.get(PICTURE_KEY), heard]).toEqual(HD ? ['experimental', 'experimental', hd] : ['ps2', 'ps2', hd]);
    k.set('modern');
    expect([k.get(), store.get(PICTURE_KEY), heard]).toEqual(['modern', 'modern', [...hd, 'modern']]);
    stop();
    k.set('ps2');
    expect(heard).toEqual([...hd, 'modern']);
    expect(store.get(PICTURE_KEY)).toBe('ps2');
  });

  it('HD-HOLD: a stored HD picture reads MODERN at the keeper\'s start, and is not written back', () => {
    const store = new Map<string, string>([[PICTURE_KEY, 'experimental']]);
    const k = pictureKeeper((key) => store.get(key) ?? null, (key, v) => { store.set(key, v); });
    expect(k.get()).toBe(HD ? 'experimental' : 'modern');
    expect(store.get(PICTURE_KEY)).toBe('experimental');
  });
});
