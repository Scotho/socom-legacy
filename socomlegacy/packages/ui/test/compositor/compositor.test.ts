import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import {
  FADER_NAME, MovieLayer, OPACITY_PUSH_BELOW, packedAlphaByte, POPUP_NAME, SPRITE_ST, UI_FRAME, addChild, buildDialogScreen, composeScreen, drawnAlpha,
  f32, findNode, loadDialog, newNode, newSprite, newScreen, removeChild, setFaderOpacity, stToImage, stepImagePulse,
  type UiDrawItem, type UiNode,
} from '../../src/index';
import { textFace } from '../text/fixtures';

// Web research 112. Every expectation is transcribed from the retail decompilation (`D:L<line>` = a line of
// game/analysis/socom2_game.elf.decomp.c) or from the ELF's tables read through the program headers; the dialogs are
// made up, shaped as `parseRdr` returns a compiled dialog. No expected value was produced by running the compositor.

const r = (...kv: (string | RdrNode)[]): RdrNode[] => {
  const out: RdrNode[] = [];
  for (let i = 0; i < kv.length; i += 2) {
    const v = kv[i + 1]!;
    out.push(kv[i] as string, Array.isArray(v) ? v : [v]);
  }
  return out;
};
const dialog = (...kv: (string | RdrNode)[]): RdrNode => [['SCREENS', r(...kv), '0', '0']];
const rec = (name: string, type: string, x: number, y: number, spec: RdrNode[], ...more: (string | RdrNode)[]): RdrNode[] =>
  r('NAME', name, 'TYPE', type, 'XPOS', String(x), 'YPOS', String(y), ...more, 'SPEC', spec);
const image = (file: string, w: number, h: number): RdrNode[] => r('FILENAME', file, 'SIZE', [String(w), String(h)]);
const names = (n: UiNode): string[] => n.children.map((c) => c.name);
const sprites = (items: UiDrawItem[]) => items.filter((i): i is Extract<UiDrawItem, { kind: 'sprite' }> => i.kind === 'sprite');

describe('the frame and the sprite (FUN_00364c50 D:L262007-262051, FUN_003643b0 D:L261637-261708)', () => {
  it('is 640 x 448 (FUN_003b1200(0) D:L305271-305395)', () => {
    expect(UI_FRAME).toEqual({ width: 640, height: 448 });
  });
  it('samples ST 0.01 .. 0.99 across and -0.01 .. -0.99 down, the t negated (D:L262025-262030, the setter D:L261813-261816)', () => {
    expect(SPRITE_ST).toEqual([f32(0.01), f32(-0.01), f32(0.99), f32(-0.99)]);
  });
  it('stands a bottom-row-first bitmap upright: t -0.01 wraps to the stored 0.99, the image\'s top 0.01', () => {
    const [u0, v0] = stToImage(SPRITE_ST[0], SPRITE_ST[1]);
    const [u1, v1] = stToImage(SPRITE_ST[2], SPRITE_ST[3]);
    expect(u0).toBeCloseTo(0.01, 6); expect(v0).toBeCloseTo(0.01, 6);
    expect(u1).toBeCloseTo(0.99, 6); expect(v1).toBeCloseTo(0.99, 6);
  });
  it('a new sprite is colour 128 x 3, alpha 128, textured, its rect from (0, 0) (FUN_00364c50, FUN_00365100 D:L262184-262204)', () => {
    const s = newSprite('a.tif', 50, 20);
    expect([s.color, s.alpha, s.textured, s.x, s.y, s.w, s.h]).toEqual([[128, 128, 128], 128, true, 0, 0, 50, 20]);
  });
});

describe('the opacity the walk carries (FUN_00336a10 D:L235048-235058, FUN_00336980 D:L235028-235043, FUN_0036d8b0 D:L266729-266747)', () => {
  it('draws alpha f x 128 for f under 1 and keeps it; 0.99 draws as 128; f >= 1 leaves the held alpha', () => {
    const held = { alpha: 77 };
    expect(drawnAlpha(0.5, held)).toBe(64); expect(held.alpha).toBe(64);
    expect(drawnAlpha(1, held)).toBe(64);                        // sticky: the 1.0 draw writes nothing
    expect(drawnAlpha(f32(0.99), held)).toBe(128);
    expect(drawnAlpha(0, held)).toBe(0);
  });
  it('pushes only below 127/128, the product with the parent\'s', () => {
    expect(OPACITY_PUSH_BELOW).toBe(0.9921875);
    const s = newScreen();
    const parent = newNode('p', { kind: 'sprite', sprite: newSprite(null, 10, 10, false) });
    parent.opacity = 0.5;
    const child = newNode('c', { kind: 'sprite', sprite: newSprite(null, 10, 10, false) });
    child.opacity = 0.5;
    const near = newNode('n', { kind: 'sprite', sprite: newSprite(null, 10, 10, false) });
    near.opacity = 0.995;                                         // >= 127/128: no push, the parent's 0.5 stands
    addChild(s.backplane, parent); addChild(parent, child); addChild(parent, near);
    const alphas = sprites(composeScreen(s)).filter((i) => ['p', 'c', 'n'].includes(i.node)).map((i) => i.rgba[3]);
    expect(alphas).toEqual([64, 32, 64]);
  });
});

describe('the node tree (FUN_00315f40 D:L215327-215365, FUN_00315e70, FUN_00315d00 D:L215253-215290)', () => {
  it('appends a child, and moves one that had a parent', () => {
    const a = newNode('a'), b = newNode('b'), c = newNode('c');
    addChild(a, b); addChild(a, c); addChild(c, b);
    expect([names(a), names(c), b.parent]).toEqual([['c'], ['b'], c]);
    removeChild(c, b);
    expect([names(c), b.parent]).toEqual([[], null]);
  });
  it('finds by name among the children first, then down each child in turn (strcmp)', () => {
    const root = newNode('root'), x = newNode('x'), y = newNode('y'), deep = newNode('t'), shallow = newNode('t');
    addChild(root, x); addChild(x, deep); addChild(root, y); addChild(y, shallow);
    expect(findNode(root, 't')).toBe(deep);                       // x's subtree is searched before y's
    addChild(root, newNode('t'));
    expect(findNode(root, 't')).toBe(root.children[2]);           // a direct child before any descendant
    expect(findNode(root, 'T')).toBeNull();
  });
});

describe('a dialog built as CGameMenu_LoadFromDesign builds it (FUN_00367950 D:L263398-263775)', () => {
  const D = dialog(
    'BACKGROUND', r('TYPE', 'IMAGE', 'FILENAME', 'back.tif'),
    'ANIMATIONS', [r('EVENT', 'ONSTART', 'ANIMATION', 'go')],
    'CONTROLS', [rec('btn', 'BUTTON', 100, 200, r('CAPTION', 'X'))],
    'OBJECTS', [
      rec('panel', 'IMAGE', 16, 15, image('panel.tif', 600, 40), 'OPACITY', '0.5'),
      rec('child', 'IMAGE', 4, 5, image('dot.tif', 8, 8), 'CHILDOF', 'panel'),
      rec('early', 'IMAGE', 1, 1, image('dot.tif', 2, 2), 'CHILDOF', 'late'),
      rec('late', 'IMAGE', 0, 0, image('dot.tif', 2, 2)),
    ],
  );
  it('puts the background, the controls and the objects on the backplane, MENUFADER and POPUP on the foreplane', () => {
    const s = buildDialogScreen(loadDialog(D));
    expect(names(s.root)).toEqual(['CGameMenu backplane', 'CGameMenu foreplane']);   // D:L264662-264667 (0x3f8e20, 0x3f8e40)
    expect(names(s.backplane)).toEqual(['background', 'btn', 'panel', 'early', 'late']);
    expect(names(findNode(s.root, 'panel')!)).toEqual(['child']);
    expect(names(s.foreplane)).toEqual([FADER_NAME, POPUP_NAME]);                   // the fader re-added, then POPUP (D:L263660-263688)
    expect(findNode(s.root, POPUP_NAME)!.visible).toBe(false);                      // hidden (D:L263688)
  });
  it('parents a CHILDOF among the nodes made so far, else the backplane (FUN_003696d0 D:L264427-264492)', () => {
    const s = buildDialogScreen(loadDialog(D));
    expect(findNode(s.root, 'early')!.parent).toBe(s.backplane);
  });
  it('keeps the fader opaque when the dialog has bindings, else clear (D:L263580-263611, D:L263689-263691)', () => {
    const fader = (d: RdrNode) => {
      const f = buildDialogScreen(loadDialog(d)).fader.content!;
      return f.kind === 'sprite' ? f.sprite : null;
    };
    expect(fader(D)!.alpha).toBe(128);
    expect(fader(dialog('OBJECTS', [rec('late', 'IMAGE', 0, 0, image('dot.tif', 2, 2))]))!.alpha).toBe(0);
    expect(fader(D)).toMatchObject({ texture: null, textured: false, color: [0, 0, 0], x: 0, y: 0, w: 640, h: 448 });
  });
  it('keeps it opaque too when only a widget has ANIMATIONS: its constructor sets DAT_0049eaa0 through Add2dNode (D:L264444)', () => {
    // The dialog's own `ANIMATIONS` is an empty list standing first, so the dialog-level lookup (depth-first,
    // FUN_0032f0e0) finds it and its loop (D:L263580-263611) never runs; the widget's own list then sets the flag.
    // (With no dialog-level list at all, the depth-first lookup reads the widget's list as the dialog's and the flag
    // is set at D:L263607 anyway -- the second block.)
    const alpha = (type: string, spec: RdrNode[], own: boolean) => {
      const kv: (string | RdrNode)[] = own ? ['ANIMATIONS', []] : [];
      const f = buildDialogScreen(loadDialog(dialog(...kv, 'CONTROLS', [rec('w', type, 0, 0, spec)]))).fader.content!;
      return f.kind === 'sprite' ? f.sprite.alpha : null;
    };
    const anims: (string | RdrNode)[] = ['ANIMATIONS', [r('EVENT', 'ONSTART', 'ANIMATION', 'go')]];
    for (const own of [true, false]) {
      expect(alpha('BUTTON', r('CAPTION', 'X', ...anims), own)).toBe(128);   // FUN_00376bd0 D:L271713-271716 (via D:L276671)
      expect(alpha('CHECKBOX', r('CAPTION', 'X', ...anims), own)).toBe(128); // FUN_00371550 -> FUN_00376bd0 (D:L275465, D:L268868)
      expect(alpha('LISTBOX', r(...anims), own)).toBe(128);                  // FUN_00375e20 D:L271190-271192 (via D:L275863)
      expect(alpha('MAPCONTROL', r(...anims), own)).toBe(128);               // FUN_0036d140 D:L266510-266512 (via D:L275093)
      expect(alpha('BUTTON', r('CAPTION', 'X'), own)).toBe(0);               // no list anywhere: the flag stays 0
    }
  });
  it('keeps it opaque when only a subordinate has ANIMATIONS: FUN_00367950 builds each through FUN_003696d0 (D:L263642)', () => {
    // The dialog's and the control's own `ANIMATIONS` are empty lists standing first, so neither loop runs; the
    // subordinate's BUTTON constructor (FUN_00380620 -> FUN_00376bd0 D:L271713-271716) sets DAT_0049eaa0. A control
    // with no list of its own would read its subordinate's depth-first (FUN_0032f0e0) and set the flag itself.
    const alpha = (type: string, spec: RdrNode[]) => {
      const f = buildDialogScreen(loadDialog(dialog('ANIMATIONS', [], 'CONTROLS', [rec('w', type, 0, 0, spec)]))).fader.content!;
      return f.kind === 'sprite' ? f.sprite.alpha : null;
    };
    const sub = (anims: boolean) => rec('s', 'BUTTON', 0, 0, r('CAPTION', 'X', ...(anims ? ['ANIMATIONS', [r('EVENT', 'ONSTART', 'ANIMATION', 'go')]] : [])));
    expect(alpha('RADIOSTRIP', r('ANIMATIONS', [], 'SUBORDINATES', [sub(true)]))).toBe(128);
    expect(alpha('HANDLERBUTTON', r('ANIMATIONS', [], 'SUBORDINATE', sub(true)))).toBe(128);
    expect(alpha('RADIOSTRIP', r('SUBORDINATES', [sub(true)]))).toBe(128);               // the strip reads the sub's list
    expect(alpha('RADIOSTRIP', r('ANIMATIONS', [], 'SUBORDINATES', [sub(false)]))).toBe(0);
  });
  it('leaves the background out when its bitmap is not found (D:L263541-263579)', () => {
    const s = buildDialogScreen(loadDialog(D), { hasTexture: (n) => n !== 'back.tif' });
    expect(names(s.backplane)[0]).toBe('btn');
  });
  it('gives a movie background a movie layer and no background node', () => {
    const d = loadDialog(dialog('BACKGROUND', r('TYPE', 'MPEG', 'FILENAME', 'run/movies/common/menuloop.pss')));
    const layer = new MovieLayer();
    const s = buildDialogScreen(d, { movie: layer });
    expect([s.movie, s.background, names(s.backplane)]).toEqual([layer, null, []]);
  });
});

describe('the draw list (CMenuState tick 0x1f4640: backplane 0x1f4700-0x1f4734, 3D, foreplane FUN_00369170 D:L264251-264259)', () => {
  const D = dialog(
    'BACKGROUND', r('TYPE', 'MPEG', 'FILENAME', 'm.pss'),
    'ANIMATIONS', [r('EVENT', 'ONSTART', 'ANIMATION', 'go')],
    'CONTROLS', [rec('btn', 'BUTTON', 100, 200, r('CAPTION', 'X'))],
    'OBJECTS', [
      rec('panel', 'IMAGE', 16, 15, image('panel.tif', 600, 40)),
      rec('child', 'IMAGE', 4, 5, image('dot.tif', 8, 8), 'CHILDOF', 'panel'),
    ],
  );
  it('runs: clear, the movie, the backplane walk, the models, the foreplane walk', () => {
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer() });
    const items = composeScreen(s);
    expect(items.map((i) => ('node' in i ? `${i.kind}:${i.node}` : i.kind))).toEqual([
      'clear', 'movie', 'widget:btn', 'sprite:panel', 'sprite:child', 'models', `sprite:${FADER_NAME}`,
    ]);
  });
  it('draws the movie layer black until a picture is presented, then the last one (MOVIE_HOLD_READING)', () => {
    const layer = new MovieLayer();
    const s = buildDialogScreen(loadDialog(D), { movie: layer });
    expect(composeScreen(s)[1]).toEqual({ kind: 'movie', picture: null, x0: 0, y0: 0, x1: 640, y1: 448 });
    const pic = { width: 640, height: 448, image: 'frame 1' };
    layer.present(pic);
    expect(composeScreen(s)[1]).toEqual({ kind: 'movie', picture: pic, x0: 0, y0: 0, x1: 640, y1: 448 });
    layer.clear();
    expect((composeScreen(s)[1] as { picture: unknown }).picture).toBeNull();
  });
  it('places a child relative to its parent (research 95 §2.1) through the node matrix', () => {
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer() });
    const [panel, child] = sprites(composeScreen(s)).filter((i) => i.node !== FADER_NAME);
    expect([panel!.x0, panel!.y0, panel!.x1, panel!.y1]).toEqual([16, 15, 616, 55]);
    expect([child!.x0, child!.y0, child!.x1, child!.y1]).toEqual([20, 20, 28, 28]);
    findNode(s.root, 'panel')!.scale = [0.5, 2];
    const [, c2] = sprites(composeScreen(s)).filter((i) => i.node !== FADER_NAME);
    expect([c2!.x0, c2!.y0, c2!.x1, c2!.y1]).toEqual([18, 25, 22, 41]);
  });
  it('maps a sprite\'s ST to the upright image and carries the GS colour', () => {
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer() });
    const panel = sprites(composeScreen(s)).find((i) => i.node === 'panel')!;
    expect(panel.texture).toBe('panel.tif');
    expect(panel.u0).toBeCloseTo(0.01, 6); expect(panel.v0).toBeCloseTo(0.01, 6);
    expect(panel.u1).toBeCloseTo(0.99, 6); expect(panel.v1).toBeCloseTo(0.99, 6);
    expect(panel.rgba).toEqual([128, 128, 128, 128]);
  });
  it('draws the fader as a black full-frame quad whose alpha is the MENUFADER opacity, the input', () => {
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer() });
    const fader = () => sprites(composeScreen(s)).find((i) => i.node === FADER_NAME)!;
    expect(fader()).toMatchObject({ texture: null, x0: 0, y0: 0, x1: 640, y1: 448, rgba: [0, 0, 0, 128] });
    setFaderOpacity(s, f32(2 / 3));
    expect(fader().rgba[3]).toBe(85);                             // f32(2/3) x 128 = 85.33, sent as the integer 85 (vftoi0)
    setFaderOpacity(s, f32(0.99));
    expect(fader().rgba[3]).toBe(128);
    setFaderOpacity(s, 0);
    expect(fader().rgba[3]).toBe(0);
  });
  it('sends the alpha as the GS takes it: vftoi0 (FUN_001bfef8 D:L40841-40853) into PACKED RGBAQ, whose A is the low byte of its word (BOOT-06, research 141 S2)', () => {
    // FUN_003643b0 (D:L261637-261708) converts the quad's colour (+0x30..+0x3c) with vftoi0 -- truncation toward zero
    // -- and the GIF tag's register list 0x512 (ST, RGBAQ, XYZ2) is PACKED: RGBAQ keeps bits 7:0 of each word. So a
    // fader opacity under 0 (dlgMenu's two fades, research 139 S9) is a large alpha, not a negative one.
    expect(packedAlphaByte(85.33)).toBe(85);
    expect(packedAlphaByte(-6.14)).toBe(250);
    expect(packedAlphaByte(-0.9)).toBe(0);
    expect(packedAlphaByte(-128)).toBe(128);
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer() });
    const fader = () => sprites(composeScreen(s)).find((i) => i.node === FADER_NAME)!;
    setFaderOpacity(s, f32(-0.048));
    expect(fader().rgba[3]).toBe(250);                            // trunc(-6.14) = -6 -> 0xfa
    setFaderOpacity(s, f32(-0.446));
    expect(fader().rgba[3]).toBe(199);                            // trunc(-57.09) = -57 -> 0xc7
    setFaderOpacity(s, f32(-0.005));
    expect(fader().rgba[3]).toBe(0);                              // trunc(-0.64) = 0
  });
  it('skips a hidden node and its subtree; shows the POPUP over the fader once shown', () => {
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer() });
    findNode(s.root, 'panel')!.visible = false;
    const popup = findNode(s.root, POPUP_NAME)!;
    popup.visible = true;
    popup.content = { kind: 'sprite', sprite: newSprite('popupOp.tif', 340, 120) };
    popup.x = 140; popup.y = 180;
    const order = composeScreen(s).map((i) => ('node' in i ? i.node : i.kind));
    expect(order.slice(-2)).toEqual([FADER_NAME, POPUP_NAME]);
    expect(order).not.toContain('panel');
    expect(order).not.toContain('child');
  });
  it('draws no item for a textured sprite without a bitmap (FUN_00364950 D:L261897-261932)', () => {
    const s = buildDialogScreen(loadDialog(D), { movie: new MovieLayer(), hasTexture: (n) => n !== 'dot.tif' });
    expect(composeScreen(s).some((i) => 'node' in i && i.node === 'child')).toBe(false);
  });
});

describe('text through the compositor (PLAT-13 layout, FUN_00362b20 D:L260712-260723)', () => {
  const face = textFace();
  const faces = (n: string) => (n === 'font_t' ? face : null);
  it('lays a TEXT out at its node\'s pen in its face, the face\'s opacity its alpha', () => {
    const d = loadDialog(dialog('FONT', 'font_t', 'OBJECTS', [
      rec('box', 'IMAGE', 100, 50, image('b.tif', 10, 10)),
      rec('t', 'TEXT', 3, 4, r('CAPTION', 'AB', 'SCALE', '1', 'COLOR', ['10', '20', '30']), 'CHILDOF', 'box'),
    ]));
    const items = composeScreen(buildDialogScreen(d, { face: faces }));
    const glyphs = items.find((i) => i.kind === 'glyphs')!;
    if (glyphs.kind !== 'glyphs') throw new Error('no glyphs');
    // 'A': UL (2,0) LR (13,25), no DispPos: left = pen 103, the cell's foot on the pen's 54 (research 111 §3.2).
    const a = glyphs.quads.filter((q) => !q.shadow)[0]!;
    expect([a.left, a.bottom]).toEqual([103, 54]);
    expect(a.rgba).toEqual([10, 20, 30, Math.trunc(f32(f32(0.7) * 128))]);
  });
  it('draws a TEXT under a 0.5 parent at half of 128 (the walk\'s write replaces the face\'s alpha)', () => {
    const d = loadDialog(dialog('FONT', 'font_t', 'OBJECTS', [
      rec('box', 'IMAGE', 100, 50, image('b.tif', 10, 10), 'OPACITY', '0.5'),
      rec('t', 'TEXT', 3, 4, r('CAPTION', 'A'), 'CHILDOF', 'box'),
    ]));
    const glyphs = composeScreen(buildDialogScreen(d, { face: faces })).find((i) => i.kind === 'glyphs');
    if (glyphs?.kind !== 'glyphs') throw new Error('no glyphs');
    expect(glyphs.quads.filter((q) => !q.shadow)[0]!.rgba[3]).toBe(64);
  });
});

describe('IMAGE PULSE (FUN_00378fc0 D:L272892-272914): its alpha, given dt', () => {
  it('phase += dt / PULSE x 2 pi (wrapped), alpha = sin(phase) x 64 + 64', () => {
    const s = newSprite('a.tif', 1, 1);
    s.pulse = { period: 2, phase: 0 };
    stepImagePulse(s, 0.5);
    const phase = f32(f32(0.5 / 2) * f32(6.2831855));
    expect(s.pulse.phase).toBe(phase);
    expect(s.alpha).toBe(f32(f32(f32(Math.sin(phase)) * 64) + 64));
    stepImagePulse(s, 2);   // a whole turn more: wrapped back under 2 pi
    expect(s.pulse.phase).toBeLessThan(6.2831855);
  });
});
