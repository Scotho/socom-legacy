import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { locTable, parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import {
  ABSENT_PARENT_READING, armoryNodes, armoryQuads, armoryTree, cellOf, decodePopup, faceWidth, layoutFace, MENUFADER, placeOf, UI_DRAW_ORDER_READING, wrapFace,
  type ArmoryFrameInput,
} from '../src/armoryLayout';
import { PEN_NUDGE, TEXT_V } from '../src/hudFont';
import { UiRunner } from '../src/uiScript';
import { armoryTap } from '../src/armory';
import type { ArmoryContext, ArmoryState } from '../src/armoryState';

/**
 * The ARMORY's layout drawn from the dialog's objects (web sprint 5 S3; research 95 §2): a hand-built `SCREENS` record
 * in the shape of `dlg_equipment_mp.rdr`, parsed by `parseUiLayout`, placed by its CHILDOF chain and the scripts'
 * nodes, turned into quads on the 640x448 frame.
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const rdr: RdrNode = [[
  'SCREENS', [
    'LIBRARIES', ['ui/assetlib/uimp'],
    'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['multplay_back.tif']],
    'FONT', ['font_text_01'],
    'SCRIPT_LIBRARY', ['dlg_equipment_mp.rdr'],
    'OBJECTS', [
      obj('NAME', ['eq_title_back'], 'TYPE', ['IMAGE'], 'XPOS', ['16'], 'YPOS', ['15'], 'OPACITY', ['0.2'], 'SPEC', ['FILENAME', ['backsolid.tif'], 'SIZE', ['615', '46']]),
      obj('NAME', ['bar_title'], 'TYPE', ['TEXT'], 'XPOS', ['30'], 'YPOS', ['65'], 'SPEC', ['FONT', ['font_titlebar_01'], 'COLOR', ['83', '72', '36'], 'SCALE', ['0.95'], 'CAPTION', ['_15_ARMORY_MSG']]),
      obj('NAME', ['InstructionText'], 'TYPE', ['TEXT'], 'XPOS', ['320'], 'YPOS', ['92'], 'SPEC', ['COLOR', ['91', '72', '36'], 'SCALE', ['0.9'], 'CAPTION', [' '], 'HCENTERED', []]),
      obj('NAME', ['Seal1PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['295'], 'YPOS', ['155'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['Seal1'], 'TYPE', ['IMAGE'], 'XPOS', ['0'], 'YPOS', ['-22'], 'OPACITY', ['0.65'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'SIZE', ['130', '255'], 'UIVAR', ['NAME', ['Seal1']]]),
      obj('NAME', ['Seal1PaneDummy'], 'TYPE', ['IMAGE'], 'XPOS', ['0'], 'YPOS', ['130'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'SIZE', ['150', '17']]),
      obj('NAME', ['Seal1Primarypane'], 'TYPE', ['IMAGE'], 'XPOS', ['-5'], 'YPOS', ['0'], 'OPACITY', ['0.7'], 'SPEC', ['CHILDOF', ['Seal1PaneDummy'], 'FILENAME', ['brown_back_real.tif'], 'SIZE', ['165', '21']]),
      obj('NAME', ['Seal1PrimText'], 'TYPE', ['TEXT'], 'XPOS', ['8'], 'YPOS', ['23'], 'SPEC', ['CHILDOF', ['Seal1PaneDummy'], 'SCALE', ['0.95'], 'UIVAR', ['NAME', ['Char1PrimaryWeaponDescr']]]),
      obj('NAME', ['net_conn_ind_Yel'], 'TYPE', ['IMAGE'], 'XPOS', ['577'], 'YPOS', ['25'], 'SPEC', ['CHILDOF', ['letterbar'], 'FILENAME', ['NetMonY.tif'], 'SIZE', ['28', '28']]),
      obj('NAME', ['WepDescription'], 'TYPE', ['TELETYPE'], 'XPOS', ['380'], 'YPOS', ['298'], 'SPEC', ['CAPTION', ['typed later']]),
      // Listed after a root (`net_conn_ind_Yel`), a child of an earlier object: drawn inside its parent's subtree.
      obj('NAME', ['Seal1Late'], 'TYPE', ['IMAGE'], 'XPOS', ['1'], 'YPOS', ['1'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'FILENAME', ['backsolid.tif'], 'SIZE', ['10', '10']]),
    ],
    'CONTROLS', [
      obj('NAME', ['arrow_lft'], 'TYPE', ['IMAGE'], 'XPOS', ['354'], 'YPOS', ['219'], 'SPEC', ['FILENAME', ['arrow_left.tif'], 'SIZE', ['35', '38']]),
      obj('NAME', ['arrow_rt'], 'TYPE', ['IMAGE'], 'XPOS', ['251'], 'YPOS', ['0'], 'SPEC', ['CHILDOF', ['arrow_lft'], 'FILENAME', ['arrow_right.tif'], 'SIZE', ['35', '38']]),
      // A window over the objects' place (`EquipWeapWin`'s kind), and a control whose CHILDOF names an object -- created
      // after the controls, so not found when this one is made: it stays on the dialog's root.
      obj('NAME', ['EquipWeapWin'], 'TYPE', ['IMAGE'], 'XPOS', ['365'], 'YPOS', ['105'], 'OPACITY', ['0.35'], 'SPEC', ['FILENAME', ['backsolid.tif'], 'SIZE', ['265', '118']]),
      obj('NAME', ['ctlOnObj'], 'TYPE', ['IMAGE'], 'XPOS', ['5'], 'YPOS', ['6'], 'SPEC', ['CHILDOF', ['eq_title_back'], 'FILENAME', ['backsolid.tif'], 'SIZE', ['10', '10']]),
    ],
    'MODELS', [obj('NAME', ['EquipM16'], 'MODEL', ['m16a2UI'])],
  ],
]];
const layout = parseUiLayout(rdr);

/** A face of `n`-row cells: one glyph per code, `w` texels wide each, a pad glyph with its own colour at 0xa6. */
function face(name: string, cell: number, w: number, dropShadow: FontFace['dropShadow']): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + w, cell], disp: [0, 0], hscale: 1, vscale: 1 });
  glyphs.push({ code: 0xa6, texture: 2, baseline: 0, color: [150, 150, 150], ul: [50, 6], lr: [75, 31], disp: [0, 0], hscale: 0.9, vscale: 0.9 });
  return { name, textures: [`${name}.tif`, 'font_special_01.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow, glyphs };
}
const TEXT = face('font_text_01', 25, 10, { offset: [1.5, 1.5], color: [0, 0, 0], opacity: 0.75 });
const TITLE = face('font_titlebar_01', 51, 20, { offset: [3, 3], color: [0, 0, 0], opacity: 0.65 });
const SIZES = Object.fromEntries(['multplay_back.tif', 'backsolid.tif', 'brown_back_real.tif', 'popupop.tif', 'active_back.tif', 'pop_butt.tif', 'arrow_left.tif', 'arrow_right.tif', 'netmony.tif', 'seal1_scuba.tif',
  'font_text_01.tif', 'font_titlebar_01.tif', 'font_special_01.tif'].map((n) => [n, { width: 64, height: 32 }]));

function frame(nodes: UiRunner, extra: Partial<ArmoryFrameInput> = {}): ReturnType<typeof armoryQuads> {
  return armoryQuads({
    layout, node: (n) => (nodes.has(n) ? nodes.node(n) : undefined), sizes: SIZES, fonts: [TEXT, TITLE],
    loc: locTable([{ id: 15, msg: '_15_ARMORY_MSG', text: 'ARMORY' }, { id: 34, msg: '_34_', text: '¦ Select SEAL 1' }]),
    uivar: (n) => (n === 'Seal1' ? 'seal1_scuba.tif' : n === 'Char1PrimaryWeaponDescr' ? 'M4A1' : null), ...extra,
  });
}
const nodes = (): UiRunner => new UiRunner([], armoryNodes(layout), { command: () => true });

describe('the ARMORY drawn from its layout (research 95 §2)', () => {
  it('makes a node per object, control and model, and the fader; models start hidden', () => {
    const n = armoryNodes(layout);
    expect(n.map((x) => x.name)).toEqual([...layout.objects, ...layout.controls].map((o) => o.name).concat(['EquipM16', MENUFADER]));
    expect(n.find((x) => x.name === 'EquipM16')?.visible).toBe(false);
    expect(n.find((x) => x.name === 'Seal1')?.opacity).toBe(0.65);
  });

  it('places a child at its parents\' positions plus its own, the scripts\' moves applied, a hidden parent hiding it', () => {
    const r = nodes();
    const byName = armoryTree(layout);
    const pane = layout.objects.find((o) => o.name === 'Seal1Primarypane')!;
    expect(placeOf(pane, byName, (n) => r.node(n))).toEqual({ x: 295 - 5, y: 155 + 130, visible: true });
    r.node('Seal1PrimDummy').x = 25; r.node('Seal1PrimDummy').y = 150;           // MPSealPlace's end
    r.node('Seal1PaneDummy').x = -8; r.node('Seal1PaneDummy').y = 129;
    expect(placeOf(pane, byName, (n) => r.node(n))).toEqual({ x: 25 - 8 - 5, y: 150 + 129, visible: true });
    r.node('Seal1PrimDummy').visible = false;
    expect(placeOf(pane, byName, (n) => r.node(n)).visible).toBe(false);
    // A CHILDOF that names nothing (the absent `letterbar`), or a node made after this one: the dialog's root
    // (`FUN_003696d0` L264444-264456) -- drawn at its own position.
    const net = layout.objects.find((o) => o.name === 'net_conn_ind_Yel')!;
    expect([ABSENT_PARENT_READING, placeOf(net, byName, (n) => r.node(n))]).toEqual(['root', { x: 577, y: 25, visible: true }]);
    const ctl = layout.controls.find((o) => o.name === 'ctlOnObj')!;
    expect(placeOf(ctl, byName, (n) => r.node(n))).toEqual({ x: 5, y: 6, visible: true });
  });

  it('draws the node tree as the game makes it: the CONTROLS first, then the OBJECTS, each under its parent (UI_DRAW_ORDER_READING)', () => {
    const q = frame(nodes());
    const order = [...new Set(q.map((x) => x.object))];
    expect(UI_DRAW_ORDER_READING).toBe('tree');
    // The weapon area's window (a control, 0.35 backsolid) beneath the objects' content, never over it.
    expect(order.indexOf('EquipWeapWin')).toBeLessThan(order.indexOf('eq_title_back'));
    expect(order.indexOf('EquipWeapWin')).toBeLessThan(order.indexOf('Seal1PrimText'));
    expect(order.indexOf('arrow_rt')).toBe(order.indexOf('arrow_lft') + 1);     // a child right after its parent
    // Depth first: the late child of Seal1PrimDummy before the root listed ahead of it.
    expect(order.indexOf('Seal1Late')).toBeLessThan(order.indexOf('net_conn_ind_Yel'));
    expect(order.indexOf('Seal1PrimText')).toBeLessThan(order.indexOf('Seal1Late'));
  });

  it('draws the background over the frame, then the tree: images at SIZE and OPACITY, a portrait by UIVAR', () => {
    const q = frame(nodes());
    expect(q[0]).toMatchObject({ object: 'BACKGROUND', texture: 'multplay_back.tif', x: 0, y: 0, w: 640, h: 448, alpha: 128 });
    expect(q.find((x) => x.object === 'eq_title_back')).toMatchObject({ x: 16, y: 15, w: 615, h: 46, alpha: expect.closeTo(0.2 * 128, 4) });   // float32, as the walk multiplies (fmul)
    expect(q.find((x) => x.object === 'Seal1')).toMatchObject({ texture: 'seal1_scuba.tif', x: 295, y: 133, w: 130, h: 255, alpha: expect.closeTo(0.65 * 128, 4) });
    expect(q.find((x) => x.object === 'arrow_rt')).toMatchObject({ x: 354 + 251, y: 219 });
    const order = [...new Set(q.map((x) => x.object))];
    expect(order.indexOf('eq_title_back')).toBeLessThan(order.indexOf('Seal1'));
    expect(order.indexOf('arrow_lft')).toBeLessThan(order.indexOf('Seal1'));       // CONTROLS before OBJECTS
    expect(order).not.toContain('Seal1PaneDummy');                              // no FILENAME, no UIVAR: a placeholder
    expect(order).not.toContain('WepDescription');                              // a TELETYPE with no run: nothing typed
    expect(q.find((x) => x.object === 'net_conn_ind_Yel')).toMatchObject({ x: 577, y: 25 });   // on the root
  });

  it('writes a text from its caption, a script\'s caption or its UIVAR, in its face, colour and scale, its cell\'s bottom at YPOS', () => {
    const r = nodes();
    let q = frame(r);
    const title = q.filter((x) => x.object === 'bar_title');
    // "ARMORY": six glyphs, each after its drop shadow (offset 3 x 0.95, black, alpha min(0.7 x 128, 0.65 x 128)); a
    // full-opacity text draws at its face's opacity, 0.7 (`textAlpha`, FUN_00362b20).
    expect(title).toHaveLength(12);
    expect(title[1]).toMatchObject({ texture: 'font_titlebar_01.tif', rgb: [83, 72, 36], alpha: 0.7 * 128, x: 30 + PEN_NUDGE, w: (20 - 1) * 0.95 + 0.5 });
    expect(title[0]).toMatchObject({ rgb: [0, 0, 0], alpha: Math.trunc(0.65 * 128), x: 30 + PEN_NUDGE + 3 * 0.95 });
    const k = 0.95 * TEXT_V;
    // The cell hangs from YPOS (UI_TEXT_ORIGIN), its corners truncated to whole rows, the foot's after + 0.5.
    expect(title[1]!.y).toBe(Math.trunc(65 - 51 * k));
    expect(title[1]!.h).toBe(Math.trunc(65 + 0.5) - Math.trunc(65 - 51 * k));
    expect(q.filter((x) => x.object === 'Seal1PrimText').length).toBe(8);       // "M4A1" from the UIVAR, in font_text_01
    expect(q.some((x) => x.object === 'InstructionText')).toBe(false);          // a blank caption draws nothing
    r.node('InstructionText').caption = { loc: 34 };
    q = frame(r);
    const line = q.filter((x) => x.object === 'InstructionText');
    const pad = line.find((x) => x.texture === 'font_special_01.tif')!;
    expect(pad).toMatchObject({ rgb: [150, 150, 150], w: (25 * 0.9 - 1) * 0.9 + 0.5 });   // its own colour, no shadow
    expect(line.filter((x) => x.texture === 'font_special_01.tif')).toHaveLength(1);
    const width = faceWidth(TEXT, '¦ Select SEAL 1', 0.9);
    expect(pad.x).toBeCloseTo(Math.trunc(320 - width / 2) + PEN_NUDGE, 6);       // HCENTERED on XPOS, the pen truncated
    // On the keyboard the glyph is the key's label.
    const kb = frame(r, { glyphLabel: (c) => (c === 0xa6 ? '[ENTER]' : null) }).filter((x) => x.object === 'InstructionText');
    expect(kb.some((x) => x.texture === 'font_special_01.tif')).toBe(false);
  });

  it('draws the fader over everything at the scripts\' opacity, and a popup from its record', () => {
    const r = nodes();
    r.node(MENUFADER).opacity = 0.7;
    const record = decodePopup(popupBytes())!;
    // Research 118 §2 (`FUN_0036da20` D:L266787-267160): +24 the text's y offset, +28 its x offset; two fixed slots.
    expect(record).toMatchObject({ textId: 1245, x: 150, y: 160, h: 130, w: 340, textY: 45, textX: 25, textScale: 1, textColor: [128, 128, 128], hasButtons: true, triangle: false });
    expect(record.buttons.map((b) => [b.x, b.y, b.w, b.h, b.labelId, b.labelOffset, b.colors.focused, b.colors.normal])).toEqual([
      [230, 95, 50, 25, 246, [18, 25], [91, 72, 36], [128, 128, 128]],
      [60, 95, 50, 25, 253, [12, 25], [91, 72, 36], [128, 128, 128]],
    ]);
    const q = armoryQuads({
      layout, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes: SIZES, fonts: [TEXT, TITLE],
      loc: locTable([{ id: 1245, msg: 'x', text: 'Return to the character select screen with the selected loadout?' }, { id: 246, msg: 'n', text: 'NO' }, { id: 253, msg: 'y', text: 'YES' }]),
      uivar: () => null, popup: { record, buttons: [{ focused: true }, { focused: false }] },
    });
    const at = (o: string): number => q.findIndex((x) => x.object === o);
    expect(q[at(MENUFADER)]).toMatchObject({ x: 0, y: 0, w: 640, h: 448, rgb: [0, 0, 0], alpha: 0.7 * 128 });
    expect(at(MENUFADER)).toBeGreaterThan(at('arrow_rt'));
    expect(decodePopup([1, 2])).toBeNull();
  });

  it('lays the confirm popup out from record 1245 (research 118 §3, ShowAndSpin OnEquipWeaponBtnDefault)', () => {
    const r = nodes();
    const record = decodePopup(popupBytes())!;
    const text = 'Return to the character select screen with the selected loadout?';
    const q = armoryQuads({
      layout, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes: SIZES, fonts: [TEXT, TITLE],
      loc: locTable([{ id: 1245, msg: 'x', text }, { id: 246, msg: 'n', text: 'NO' }, { id: 253, msg: 'y', text: 'YES' }]),
      uivar: () => null, popup: { record, buttons: [{ focused: true }, { focused: false }] },
    });
    const of = (o: string) => q.filter((x) => x.object === o);
    // The panel: the record's `popupOp.tif`, opaque (research 118 §8.1, §12.2 finding 4), at (x, y), w x h.
    expect(of('POPUP')[0]).toMatchObject({ texture: 'popupop.tif', x: 150, y: 160, w: 340, h: 130, rgb: [128, 128, 128], alpha: 128 });
    // The buttons at (x + bx, y + by), opaque, the focused slot's `active_back.tif`, the other's `pop_butt.tif`:
    // NO (slot 1, the default) at 380..429, YES at 210..259 -- both under the text, 85 px either side of the panel's
    // centre (320).
    expect(of('POPUP_BUTTON_0')[0]).toMatchObject({ texture: 'active_back.tif', x: 380, y: 255, w: 50, h: 25, alpha: 128 });
    expect(of('POPUP_BUTTON_1')[0]).toMatchObject({ texture: 'pop_butt.tif', x: 210, y: 255, w: 50, h: 25, alpha: 128 });
    // Each label's pen at the button's (+tdx, +tdy), at scale 0.9: NO's in the focused colour, YES's in the normal one.
    const label = (i: number) => of(`POPUP_LABEL_${i}`).filter((x) => x.rgb[0] !== 0);
    const no = layoutFace(TEXT, 'NO', 380 + 18, 255 + 25, record.buttons[0].scale).glyphs;
    const yes = layoutFace(TEXT, 'YES', 210 + 12, 255 + 25, record.buttons[1].scale).glyphs;
    expect(label(0).map((g) => [g.x, g.y, g.rgb])).toEqual(no.map((g) => [g.x, g.y, [91, 72, 36]]));
    expect(label(1).map((g) => [g.x, g.y, g.rgb])).toEqual(yes.map((g) => [g.x, g.y, [128, 128, 128]]));
    // The text: from (x + [+28], y + [+24]) = (175, 205), line i's pen at 205 + 20 i - 3, wrapped to w - 2 x 25 = 290.
    const lines = wrapFace(TEXT, text, 290, 1);
    expect(lines.length).toBeGreaterThan(1);
    const body = of('POPUP').slice(1).filter((x) => x.rgb[0] !== 0);
    const want = lines.flatMap((line, i) => layoutFace(TEXT, line, 175, 160 + 45 + 20 * i - 3, 1).glyphs);
    expect(body.map((g) => [g.x, g.y])).toEqual(want.map((g) => [g.x, g.y]));
    expect(Math.max(...body.map((g) => g.x + g.w))).toBeLessThanOrEqual(175 + 290);
    expect(body[0]!.alpha).toBeCloseTo(TEXT.opacity * 128, 6);                   // the face's opacity (FUN_00362b20)
    // The draw order (FUN_00370690 D:L268434-268453): the panel, the buttons, then the text.
    const order = [...new Set(q.map((x) => x.object))].filter((o) => o.startsWith('POPUP'));
    expect(order.indexOf('POPUP_BUTTON_0')).toBeGreaterThan(order.indexOf('POPUP'));
    expect(q.findIndex((x) => x.object === 'POPUP' && x.texture !== 'popupop.tif')).toBeGreaterThan(q.findIndex((x) => x.object === 'POPUP_LABEL_1'));
    // A record without buttons (popup 47's): no button drawn.
    const notice = decodePopup(popupBytes({ buttons: false }))!;
    const nq = armoryQuads({ layout, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes: SIZES, fonts: [TEXT], loc: locTable([]), uivar: () => null, popup: { record: notice, buttons: [] } });
    expect(nq.some((x) => x.object.startsWith('POPUP_BUTTON'))).toBe(false);
  });

  it('a library without the popup\'s bitmaps: the panel on backsolid, the buttons still drawn, so a tap answers the confirm', () => {
    const r = nodes();
    const sizes = Object.fromEntries(Object.entries(SIZES).filter(([n]) => !['popupop.tif', 'active_back.tif', 'pop_butt.tif'].includes(n)));
    const q = armoryQuads({
      layout, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes, fonts: [TEXT, TITLE],
      loc: locTable([{ id: 246, msg: 'n', text: 'NO' }, { id: 253, msg: 'y', text: 'YES' }]),
      uivar: () => null, popup: { record: decodePopup(popupBytes())!, buttons: [{ focused: true }, { focused: false }] },
    });
    expect(q.find((x) => x.object === 'POPUP')).toMatchObject({ texture: 'backsolid.tif', x: 150, y: 160, w: 340, h: 130 });
    expect(q.find((x) => x.object === 'POPUP_BUTTON_0')).toMatchObject({ texture: 'backsolid.tif', x: 380, y: 255, w: 50, h: 25 });
    expect(q.find((x) => x.object === 'POPUP_BUTTON_1')).toMatchObject({ texture: 'backsolid.tif', x: 210, y: 255, w: 50, h: 25 });
    // The tap targets exist: YES tapped from NO steps to it and answers; NO tapped answers at once.
    const confirm = { screen: 'confirm', focus: 'no' } as unknown as ArmoryState;
    const ctx = {} as unknown as ArmoryContext;
    expect(armoryTap(ctx, confirm, layout, q, 230, 265)).toEqual(['left', 'cross']);
    expect(armoryTap(ctx, confirm, layout, q, 400, 265)).toEqual(['cross']);
  });

  it('samples every bitmap at S/T 0.01..0.99 (FUN_00364c50 D:L262025-262030): the gold frame 2 px, not 3.5 (research 182 §2.2)', () => {
    const q = frame(nodes());
    const win = q.find((x) => x.object === 'EquipWeapWin')!;                    // a 64 x 32 bitmap in this frame
    expect(win.u0).toBeCloseTo(0.01 * 64, 5); expect(win.u1).toBeCloseTo(0.99 * 64, 5);
    expect(win.v0).toBeCloseTo(0.01 * 32, 5); expect(win.v1).toBeCloseTo(0.99 * 32, 5);
    // `eq_wep_bgHL.tif` (128 x 256, a 3-texel border) over an ActFrame's 152 px: the border's 3 texels cover
    // (3 - 1.28) x 152 / 125.44 = 2.08 px, where the whole bitmap gave 3 x 152 / 128 = 3.56.
    const texelsToPx = (152 / ((0.99 - 0.01) * 128));
    expect((3 - 0.01 * 128) * texelsToPx).toBeCloseTo(2.08, 2);
  });

  it('multiplies opacity down the tree (FUN_00336980 D:L235028-235043; research 182 §2.23)', () => {
    const r = nodes();
    r.node('Seal1PrimDummy').opacity = 0.5;
    const q = frame(r);
    expect(q.find((x) => x.object === 'Seal1')!.alpha).toBeCloseTo(0.5 * 0.65 * 128, 4);
    expect(q.find((x) => x.object === 'Seal1Primarypane')!.alpha).toBeCloseTo(0.5 * 0.7 * 128, 4);   // two levels down
    // A text under a pushed parent: the walk SETS its alpha to the stack's top x 128 (FUN_0036d8b0 D:L266729-266747).
    expect(q.find((x) => x.object === 'Seal1PrimText' && x.rgb[0] !== 0)!.alpha).toBeCloseTo(0.5 * 128, 6);
    // 127/128 and above pushes nothing (FUN_00336a10 D:L235048-235058).
    r.node('Seal1PrimDummy').opacity = 0.995;
    expect(frame(r).find((x) => x.object === 'Seal1')!.alpha).toBeCloseTo(0.65 * 128, 4);
  });
});

describe('text in a fonts.rdr face (FUN_00361bd0, FUN_00363c20)', () => {
  it('measures a face\'s cell, advances by int((width - 1) x S + 0.5), wraps whole words', () => {
    expect([cellOf(TEXT), cellOf(TITLE)]).toEqual([25, 51]);
    expect(faceWidth(TEXT, 'AB', 1)).toBe(2 * 9);
    expect(faceWidth(TEXT, 'AB', 0.9)).toBe(2 * Math.floor(9 * 0.9 + 0.5));
    const { glyphs, width } = layoutFace(TEXT, 'A B', 100, 50, 1);
    expect([glyphs.length, width]).toEqual([2, 27]);             // the space advances and draws nothing
    expect(wrapFace(TEXT, 'aa bb cc', 50, 1)).toEqual(['aa bb', 'cc']);
    expect(wrapFace(TEXT, 'one\ntwo', 500, 1)).toEqual(['one', 'two']);
  });
});

describe('the polish pass\'s rules on synthetic twins (UI_TEXT_ORIGIN; FUN_00361bd0, FUN_00362900)', () => {
  // A row in the ARMORY's shape (research 95 §2.3): a 21-row pane at the dummy's 0, its text at (8, 23); a caption bar
  // with an HCENTERED text; a stat label at (-100, 28) with its bar at (100, -15) 140x10.
  const twin = parseUiLayout([[
    'SCREENS', [
      'FONT', ['font_text_01'],
      'OBJECTS', [
        obj('NAME', ['PaneDummy'], 'TYPE', ['IMAGE'], 'XPOS', ['20'], 'YPOS', ['110'], 'SPEC', ['SIZE', ['150', '17']]),
        obj('NAME', ['Pane'], 'TYPE', ['IMAGE'], 'XPOS', ['-5'], 'YPOS', ['0'], 'SPEC', ['CHILDOF', ['PaneDummy'], 'FILENAME', ['brown_back_real.tif'], 'SIZE', ['165', '21']]),
        obj('NAME', ['RowText'], 'TYPE', ['TEXT'], 'XPOS', ['8'], 'YPOS', ['23'], 'SPEC', ['CHILDOF', ['PaneDummy'], 'SCALE', ['0.95'], 'CAPTION', ['M4A1']]),
        obj('NAME', ['CapWin'], 'TYPE', ['IMAGE'], 'XPOS', ['365'], 'YPOS', ['258'], 'SPEC', ['FILENAME', ['backsolid.tif'], 'SIZE', ['265', '20']]),
        obj('NAME', ['CapText'], 'TYPE', ['TEXT'], 'XPOS', ['500'], 'YPOS', ['280'], 'SPEC', ['HCENTERED', [], 'SCALE', ['0.95'], 'CAPTION', ['WEAPON DATA']]),
        obj('NAME', ['Dummy'], 'TYPE', ['IMAGE'], 'XPOS', ['475'], 'YPOS', ['274'], 'SPEC', ['SIZE', ['140', '16']]),
        obj('NAME', ['Label'], 'TYPE', ['TEXT'], 'XPOS', ['-100'], 'YPOS', ['28'], 'SPEC', ['CHILDOF', ['Dummy'], 'SCALE', ['0.9'], 'CAPTION', ['VOLUME']]),
        obj('NAME', ['Bar'], 'TYPE', ['IMAGE'], 'XPOS', ['100'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['Label'], 'FILENAME', ['backsolid.tif'], 'SIZE', ['140', '10']]),
      ],
    ],
  ]]);
  const draw = (r: UiRunner): ReturnType<typeof armoryQuads> => armoryQuads({
    layout: twin, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes: SIZES, fonts: [TEXT, TITLE], loc: locTable([]), uivar: () => null,
  });
  const span = (q: ReturnType<typeof armoryQuads>, o: string): [number, number] => {
    const g = q.filter((x) => x.object === o && x.rgb[0] !== 0);
    return [Math.min(...g.map((x) => x.y)), Math.max(...g.map((x) => x.y + x.h))];
  };
  /** The letters' rows of the disc's font_text_01 (rows 5-20 of the 25; `armoryPolish.test.ts` reads them off the atlas). */
  const letters = (cell: [number, number]): [number, number] => {
    const k = (cell[1] - cell[0]) / 25;
    return [cell[0] + 5 * k, cell[0] + 20 * k];
  };

  it('a row\'s text inside its 21-row pane, the letters centred on it within 2 px (the old baseline reading put them 6 low)', () => {
    const q = draw(new UiRunner([], armoryNodes(twin), { command: () => true }));
    const pane = q.find((x) => x.object === 'Pane')!;
    const cell = span(q, 'RowText');
    expect(cell[1]).toBeCloseTo(110 + 23, 6);                                     // the cell's bottom on the pen's y
    const [top, foot] = letters(cell);
    expect(top).toBeGreaterThanOrEqual(pane.y);
    expect(foot).toBeLessThanOrEqual(pane.y + pane.h);
    expect(Math.abs((top + foot) / 2 - (pane.y + pane.h / 2))).toBeLessThanOrEqual(2);
  });

  it('an HCENTERED caption centred on its XPOS, the pen truncated (FUN_00362900); its letters inside its bar', () => {
    const r = new UiRunner([], armoryNodes(twin), { command: () => true });
    const q = draw(r);
    const g = q.filter((x) => x.object === 'CapText' && x.rgb[0] !== 0);
    const width = faceWidth(TEXT, 'WEAPON DATA', 0.95);
    expect(g[0]!.x).toBeCloseTo(Math.trunc(500 - width * 0.5) + PEN_NUDGE, 6);
    const [top, foot] = letters(span(q, 'CapText'));
    expect(top).toBeGreaterThanOrEqual(258);
    expect(foot).toBeLessThanOrEqual(278);
    // A script's fractional move: the pen still lands on a whole pixel (int(node x + offset)).
    r.node('CapText').x = 500.6; r.node('CapText').y = 280.7;
    const moved = draw(r).filter((x) => x.object === 'CapText' && x.rgb[0] !== 0);
    expect(moved[0]!.x).toBeCloseTo(g[0]!.x, 6);
    expect(span(draw(r), 'CapText')).toEqual(span(q, 'CapText'));
  });

  it('a stat label on its bar\'s row: the letters\' centre within 1.5 px of the bar\'s', () => {
    const q = draw(new UiRunner([], armoryNodes(twin), { command: () => true }));
    const bar = q.find((x) => x.object === 'Bar')!;
    expect([bar.x, bar.y, bar.w, bar.h]).toEqual([475, 287, 140, 10]);
    const [top, foot] = letters(span(q, 'Label'));
    expect(Math.abs((top + foot) / 2 - (bar.y + bar.h / 2))).toBeLessThanOrEqual(1.5);
  });
});

/**
 * A POPUP record (research 118 §2; the command's 220 bytes past its header): a synthetic twin of the confirm's, record
 * 1245 as the disc holds it (`ShowAndSpin.rdr` `OnEquipWeaponBtnDefault`); `buttons: false` clears +66 (popup 47's kind).
 */
function popupBytes(o: { buttons?: boolean } = {}): number[] {
  const b = new Uint8Array(68 + 2 * 76), v = new DataView(b.buffer);
  v.setUint16(0, 24, true); v.setUint16(2, 1245, true); v.setUint32(4, 6, true);
  [150, 160, 130, 340, 45, 25].forEach((x, i) => v.setUint32(8 + 4 * i, x, true));
  v.setFloat32(32, 1, true);
  [128, 128, 128].forEach((x, i) => v.setUint32(36 + 4 * i, x, true));
  b[66] = o.buttons === false ? 0 : 1; b[67] = 3;
  const button = (o: number, x: number, text: number, dx: number): void => {
    b.set([7, 8, 8, 0], o);
    [x, 95, 50, 25].forEach((n, i) => v.setUint32(o + 4 + 4 * i, n, true));
    v.setUint16(o + 20, 24, true); v.setUint16(o + 22, text, true);
    v.setUint32(o + 24, dx, true); v.setUint32(o + 28, 25, true);
    [91, 72, 36, 128, 128, 128, 102, 87, 38].forEach((n, i) => v.setUint32(o + 32 + 4 * i, n, true));
    v.setFloat32(o + 72, 0.9, true);
  };
  button(68, 230, 246, 18);
  button(68 + 76, 60, 253, 12);
  return [...b];
}
