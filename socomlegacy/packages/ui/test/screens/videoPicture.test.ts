import { describe, expect, it } from 'vitest';
import type { DialogDesign, DialogSubordinate } from '../../src/dialog';
import {
  checkVideoMode, isVideoPictureDesign, VIDEO_PICTURE_ADAPTATION, VIDEO_PICTURE_ANIMATIONS, VIDEO_PICTURE_BOXES, VIDEO_PICTURE_CAPTIONS,
  VIDEO_PICTURE_DEFAULT, VIDEO_PICTURE_HD_OFFERED, VIDEO_PICTURES, videoPictureDesign, videoPictureGate, videoPictureLookup,
} from '../../src/screens/videoPicture';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';

/**
 * OT.R79 (the owner, 2026-10-23; LATER 378): VIDEO MODE's strip offers MODERN / PS2 / EXPERIMENTAL -- the disc's own box
 * specs, a third at the disc's step, literal captions, none of the disc's box scripts, the card's `video_mode` untouched.
 */

// VIDEO's strip as `dlgOptions_Video.rdr` holds it (its two subordinates, the fields that matter here).
const box = (name: string, x: number, caption: string, animation: string): DialogSubordinate => ({
  name, type: 'CHECKBOX', x, y: -5, opacity: 1, childOf: 'video_mode',
  widget: {
    type: 'CHECKBOX', uivar: null, checkOffset: [7, 7], checkSize: [25, 25], checkTexture: 'op_check.tif',
    button: { size: [35, 35], offset: [35, 30], scale: 1, caption, normal: null, active: null, pressed: null, disabled: null, hcentered: false, font: null, bindings: [] },
    onCheck: { kind: 'button', name: 'NONE', code: 0, state: 1, animation, argument: null },
    onUncheck: { kind: 'button', name: null, code: 0, state: 1, animation: null, argument: null },
  } as never,
});
const video = (): DialogDesign => ({
  libraries: [], usesMemcard: true, font: null, fontLib: true, background: null, bindings: [], objects: [], scripts: [], models: [], dropped: [],
  controls: [
    { name: 'TeamMateNames', type: 'RADIOSTRIP', x: 16, y: 190, opacity: 1, childOf: null, widget: { type: 'RADIOSTRIP', uivar: null, button: {} as never, subordinates: [] } },
    { name: 'video_mode', type: 'RADIOSTRIP', x: 16, y: 220, opacity: 1, childOf: null, widget: {
      type: 'RADIOSTRIP', uivar: null, button: { caption: '_712_VideoMode_MSG' } as never,
      subordinates: [box('VideoNTSC', 200, '_713_INTERLACED_MSG', 'video_ntsc'), box('VideoDTV', 320, '_714_ProgressiveScan480_MSG', 'video_dtv')],
    } },
  ],
} as never);
const subs = (d: DialogDesign) => (d.controls.find((c) => c.name === 'video_mode')!.widget as { subordinates: DialogSubordinate[] }).subordinates;
// HD-HOLD (the owner, 2026-11-01: "Hide/disable the HD pack ... leave it in the build just don't allow people to turn it
// on"): while VIDEO_PICTURE_HD_OFFERED is false the strip draws MODERN and PS2 only and the third box's check sets
// nothing; the three names, captions and animations stay. Flipping the constant back makes these pins expect three.
const OFFERED = VIDEO_PICTURE_HD_OFFERED ? 3 : 2;
const cmd = (arg: string): ZAnimUiCommand => ({ anim: 'Initialize_Options_Stuff', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'CheckVideoMode', arg, loc: 0, bytes: new Uint8Array(0x10) });

describe('OT.R79: VIDEO MODE is the page\'s picture (VIDEO_PICTURE_ADAPTATION)', () => {
  it('names the three pictures in the owner\'s order, MODERN the default (B\', what the front end drew)', () => {
    expect(VIDEO_PICTURE_ADAPTATION).toContain('OT.R79');
    expect(VIDEO_PICTURES).toEqual(['modern', 'ps2', 'experimental']);
    expect(VIDEO_PICTURE_CAPTIONS).toEqual(['MODERN', 'PS2', 'HD (GoE Soul)']);   // HD.R8 (the owner, 2026-10-31): EXPERIMENTAL renamed
    expect(VIDEO_PICTURE_DEFAULT).toBe('modern');
  });

  it('the offered boxes (three; two under HD-HOLD) from the disc\'s own specs, at the disc\'s step (200, 320, 440), captions literal, the disc\'s scripts gone', () => {
    const before = video(), d = videoPictureDesign(before);
    const s = subs(d);
    expect(s).toHaveLength(OFFERED);
    expect(s.map((b) => [b.name, b.x, b.y])).toEqual([['PictureModern', 200, -5], ['PicturePS2', 320, -5], ['PictureExperimental', 440, -5]].slice(0, OFFERED));
    expect(s.map((b) => (b.widget as { button: { caption: string } }).button.caption)).toEqual(['MODERN', 'PS2', 'HD (GoE Soul)'].slice(0, OFFERED));
    expect(s.map((b) => (b.widget as { onCheck: { animation: string } }).onCheck.animation)).toEqual(VIDEO_PICTURE_ANIMATIONS.slice(0, OFFERED));
    for (const b of s) expect((b.widget as { checkTexture: string }).checkTexture).toBe('op_check.tif');   // the original's checkbox
    expect(JSON.stringify(s)).not.toMatch(/video_ntsc|video_dtv|VideoNTSC|VideoDTV/);
    expect(subs(before).map((b) => b.name)).toEqual(['VideoNTSC', 'VideoDTV']);                           // the disc's design untouched
    expect(isVideoPictureDesign(d)).toBe(true);
    expect(isVideoPictureDesign(before)).toBe(false);
    expect(VIDEO_PICTURE_BOXES.slice(0, OFFERED)).toEqual(s.map((b) => b.name));
  });

  it('the lookup passes VIDEO through once (any case), every other dialog as it is', () => {
    const v = video(), other = { controls: [] } as unknown as DialogDesign;
    const look = videoPictureLookup((n) => (n === 'dlgOptions_Video.rdr' || n === 'DLGOPTIONS_VIDEO.RDR' ? v : n === 'x' ? other : null));
    expect(look('dlgOptions_Video.rdr')).toBe(look('dlgOptions_Video.rdr'));
    expect(isVideoPictureDesign(look('DLGOPTIONS_VIDEO.RDR')!)).toBe(true);
    expect(look('x')).toBe(other);
    expect(look('missing')).toBeNull();
  });

  it('a box\'s check hands the page its picture and starts nothing of the disc\'s; any other start passes', () => {
    const set: string[] = [];
    const gate = videoPictureGate((p) => set.push(p));
    for (const a of VIDEO_PICTURE_ANIMATIONS) expect(gate({ dialog: 'dlgOptions_Video.rdr', animation: a, argument: null } as never)).toBe(true);
    expect(set).toEqual(['modern', 'ps2', 'experimental'].slice(0, OFFERED));   // HD-HOLD: the third box's check is taken, nothing set
    expect(gate({ dialog: 'dlgOptions_Video.rdr', animation: 'enable_headbob', argument: null } as never)).toBe(false);
  });

  it('CheckVideoMode: the page is in mode 0 (NTSC true, DTV false); on VIDEO both false, so the disc\'s scripts leave the strip', () => {
    let dialog = 'dlgMenu.rdr';
    const h = checkVideoMode(() => dialog);
    expect([h(cmd('NTSC'), undefined as never, undefined), h(cmd('DTV'), undefined as never, undefined)]).toEqual([true, false]);
    dialog = 'dlgOptions_Video.rdr';
    expect([h(cmd('NTSC'), undefined as never, undefined), h(cmd('DTV'), undefined as never, undefined)]).toEqual([false, false]);
  });
});
