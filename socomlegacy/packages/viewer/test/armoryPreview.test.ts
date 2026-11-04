import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { locTable, parseUiLayout, type FontFace, type FontGlyph } from '@s2u/scene';
import { ARMORY_MODEL_PART_REF, ARMORY_WHITE, armoryModels, armoryNodes, armoryQuads, BAR_SCALE_ORIGIN_READING, CHILD_OPACITY, MENUFADER, modelPartStates } from '../src/armoryLayout';
import { CURSOR_WIDTH, startTeletype, stepTeletype, teletypeSpec } from '../src/armoryText';
import { MODEL_CAMERA_READING, modelFramePoint, modelSplit } from '../src/armoryView';
import { UiRunner } from '../src/uiScript';

/**
 * The ARMORY's weapon view on the frame (web sprint 5 S3 part 2; research 95 §2.4-§2.6, §3.7, §3.8): the stat bars
 * scaled from their left edge, the typed description and its cursor, the tips' box, the models the scripts show and
 * where they land, the pulsing arrows' own opacity.
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['eq_wep_comp_dummy'], 'TYPE', ['IMAGE'], 'XPOS', ['475'], 'YPOS', ['274'], 'SPEC', ['FILENAME', [' '], 'SIZE', ['140', '16']]),
      obj('NAME', ['Wvolume'], 'TYPE', ['TEXT'], 'XPOS', ['-100'], 'YPOS', ['28'], 'SPEC', ['CHILDOF', ['eq_wep_comp_dummy'], 'SCALE', ['0.9'], 'CAPTION', [' ']]),
      obj('NAME', ['eq_wep_comp_range'], 'TYPE', ['IMAGE'], 'XPOS', ['100'], 'YPOS', ['-18'], 'SPEC', ['CHILDOF', ['Wvolume'], 'FILENAME', ['wep_range.tif'], 'SIZE', ['140', '16']]),
      obj('NAME', ['eq_wep_comp_bar'], 'TYPE', ['IMAGE'], 'XPOS', ['100'], 'YPOS', ['-15'], 'SPEC', ['CHILDOF', ['Wvolume'], 'FILENAME', ['blue_fill.tif'], 'SIZE', ['140', '10']]),
      obj('NAME', ['WepDescription'], 'TYPE', ['TELETYPE'], 'XPOS', ['380'], 'YPOS', ['298'], 'SPEC', [
        'PULSERATE', ['10'], 'MAXLENGTH', ['230'], 'MAXHEIGHT', ['100'], 'AUTOSCROLL', [], 'CAPTION', [' '], 'SCALE', ['0.9'], 'INTERVAL', ['1330'], 'SPACING', ['19'],
      ]),
    ],
    'CONTROLS', [
      obj('NAME', ['EquipWeapOpaque'], 'TYPE', ['IMAGE'], 'XPOS', ['0'], 'YPOS', ['0'], 'SPEC', ['FILENAME', [' '], 'XSIZE', ['265'], 'YSIZE', ['135']]),
      obj('NAME', ['WepInstText'], 'TYPE', ['WRAPPEDTEXT'], 'XPOS', ['25'], 'YPOS', ['310'], 'SPEC', ['CHILDOF', ['EquipWeapOpaque'], 'WIDTH', ['175'], 'HEIGHT', ['95'], 'SCALE', ['0.9'], 'SPACING', ['19'], 'CAPTION', [' ']]),
      obj('NAME', ['arrow_lft'], 'TYPE', ['IMAGE'], 'XPOS', ['354'], 'YPOS', ['219'], 'SPEC', ['CHILDOF', ['EquipWeapOpaque'], 'FILENAME', ['arrow_left.tif'], 'XSIZE', ['35'], 'YSIZE', ['38']]),
      obj('NAME', ['arrow_rt'], 'TYPE', ['IMAGE'], 'XPOS', ['251'], 'YPOS', ['0'], 'SPEC', ['CHILDOF', ['arrow_lft'], 'FILENAME', ['arrow_right.tif'], 'XSIZE', ['35'], 'YSIZE', ['38']]),
    ],
    'MODELS', [
      obj('NAME', ['EquipM16'], 'MODEL', ['m16a2UI'], 'AZIMUTH', ['10.7'], 'ELEV', ['3'], 'DISTANCE', ['27']),
      obj('NAME', ['EquipMark23'], 'MODEL', ['a_mark23UI'], 'AZIMUTH', ['6'], 'ELEV', ['1.75'], 'DISTANCE', ['15']),
    ],
  ],
]]);

function face(): FontFace {
  const glyphs: FontGlyph[] = [];
  for (let c = 32; c < 127; c++) glyphs.push({ code: c, texture: 1, baseline: 0, color: null, ul: [c * 2, 0], lr: [c * 2 + 10, 25], disp: [0, 0], hscale: 1, vscale: 1 });
  return { name: 'font_text_01', textures: ['font_text_01.tif'], xspacing: 0, opacity: 0.7, scale: 1, topy: null, boty: null, dropShadow: null, glyphs };
}
const FONT = face();
const SIZES = Object.fromEntries(['wep_range.tif', 'blue_fill.tif', 'arrow_left.tif', 'arrow_right.tif', 'font_text_01.tif', ARMORY_WHITE, 'backsolid.tif']
  .map((n) => [n, { width: 64, height: 32 }]));
const runner = (): UiRunner => new UiRunner([], armoryNodes(layout), { command: () => true });
const draw = (r: UiRunner, typing: Record<string, ReturnType<typeof startTeletype>> = {}) => armoryQuads({
  layout, node: (n) => (r.has(n) ? r.node(n) : undefined), sizes: SIZES, fonts: [FONT], loc: locTable([{ id: 1179, msg: '_1179_', text: 'A tip for the rifle.' }]),
  uivar: () => null, teletype: (n) => typing[n] ?? null,
});

describe('the weapon view on the frame', () => {
  it('a stat bar is its blue_fill scaled from its left edge (BAR_SCALE_ORIGIN_READING): M16A2\'s VOLUME .15', () => {
    expect(BAR_SCALE_ORIGIN_READING).toBe('left edge');
    const r = runner();
    r.node('eq_wep_comp_bar').scale = [0.15, 1, 0];                              // ShowAndSpin's 0.001-s scale motion
    const q = draw(r);
    const bar = q.find((x) => x.object === 'eq_wep_comp_bar')!, frame = q.find((x) => x.object === 'eq_wep_comp_range')!;
    expect([bar.x, bar.y, bar.h]).toEqual([475, 274 + 28 - 15, 10]);
    expect(bar.w).toBeCloseTo(140 * 0.15, 6);
    expect([frame.x, frame.w]).toEqual([475, 140]);                              // the frame keeps its width
    r.node('eq_wep_comp_bar').scale = [0, 1, 0];
    expect(draw(r).some((x) => x.object === 'eq_wep_comp_bar')).toBe(false);   // a zero bar draws nothing
  });

  it('the TELETYPE draws what is typed, a line every SPACING rows, and its cursor 2 px past the pen, CURSOR_WIDTH x scale wide', () => {
    const r = runner(), o = layout.objects.find((x) => x.name === 'WepDescription')!;
    const run = startTeletype('ABC');
    stepTeletype(run, teletypeSpec(o), 1, () => 9);
    const q = draw(r, { WepDescription: run });
    const glyphs = q.filter((x) => x.object === 'WepDescription');
    expect(glyphs.length).toBe(3);
    const cursor = q.find((x) => x.object === 'WepDescription.cursor')!;
    expect(cursor.texture).toBe(ARMORY_WHITE);
    expect(cursor.w).toBeCloseTo(CURSOR_WIDTH * 0.9, 6);
    const pen = 3 * Math.floor((10 - 1) * 0.9 + 0.5);                          // three advances at 0.9
    expect(cursor.x).toBe(380 + pen + 2);
    expect(cursor.y + cursor.h).toBeCloseTo(298 - 5 + 1, 6);                    // from DAT_003e0390 = -5, + 1
    expect(cursor.alpha).toBeCloseTo(96, 6);                                    // typed: the pulse's sin(0) x 32 + 96
  });

  it('the WRAPPEDTEXT draws its caption wrapped in its box; the tips follow their caption', () => {
    const r = runner();
    r.node('WepInstText').caption = { loc: 1179 };
    const q = draw(r).filter((x) => x.object === 'WepInstText');
    expect(q.length).toBe('Atipfortherifle.'.length);
    expect(Math.min(...q.map((x) => x.x))).toBeGreaterThanOrEqual(25 - 1);
  });

  it('armoryModels: the entries the scripts show, with their spin; hidden ones not', () => {
    const r = runner();
    expect(armoryModels(layout, (n) => (r.has(n) ? r.node(n) : undefined))).toEqual([]);   // the models start hidden
    r.node('EquipM16').visible = true;
    r.node('EquipM16').rotation = [0, -1, 0, 0];
    const shown = armoryModels(layout, (n) => (r.has(n) ? r.node(n) : undefined));
    expect(shown.map((m) => [m.entry.name, m.entry.model, m.rotation])).toEqual([['EquipM16', 'm16a2UI', [0, -1, 0, 0]]]);
  });

  it("a node the scripts switch that the layout lacks is the first entry's model part of exactly that name (ARMORY_MODEL_PART_REF)", () => {
    // FUN_00366730 attaches each MODELS instance to the world (D:L262850, the world's vtable +0x18 FUN_0031f240); a
    // kind-0 reference no dialog node answers is searched in the world's children's subtrees in that order, by exact
    // name (FUN_00269230 D:L114379-114386 -> FUN_00315d00 D:L215255-215290).
    expect(ARMORY_MODEL_PART_REF).toMatch(/first MODELS entry/);
    const parts: Record<string, string[]> = { m16a2UI: ['m16_high', 'silencer'], a_mark23UI: ['mark23_high', 'silencer', 'Slide'] };
    const r = runner(), node = (n: string) => (r.has(n) ? r.node(n) : undefined);
    const shown = () => armoryModels(layout, node, modelPartStates(layout, r.nodes(), (m) => parts[m] ?? null)).map((m) => [m.entry.name, m.hidden]);
    r.node('EquipMark23').visible = true;
    r.node('silencer').visible = false;                                          // ShowAndSpin's 552 branch: ACTIVE silencer = 0
    r.node('slide').visible = false;                                             // no part of exactly that name (strcmp): nothing
    r.node('WepTabText').visible = false;                                        // a node of no model: nothing
    expect(shown()).toEqual([['EquipMark23', []]]);                              // the M16A2, first in the MODELS order, holds it
    r.node('EquipM16').visible = true;
    expect(shown()).toEqual([['EquipM16', ['silencer']], ['EquipMark23', []]]);
    r.node('silencer').visible = true;                                           // ACTIVE silencer = 1 would show it again
    expect(shown()).toEqual([['EquipM16', []], ['EquipMark23', []]]);
    expect(modelPartStates(layout, r.nodes(), () => null).size).toBe(0);           // no geometry: no part found
  });

  it('the arrows pulse together: a parent\'s opacity multiplies down to its child (CHILD_OPACITY; research 182 §2.23)', () => {
    // FUN_00336a10 / FUN_00336980 (D:L235028-235058): a node under 127/128 pushes its opacity times the stack's top.
    expect(CHILD_OPACITY).toBe('multiplied');
    const r = runner();
    r.node('arrow_lft').opacity = 0.5;
    const q = draw(r);
    expect(q.find((x) => x.object === 'arrow_lft')!.alpha).toBeCloseTo(0.5 * 128, 6);
    expect(q.find((x) => x.object === 'arrow_rt')!.alpha).toBeCloseTo(0.5 * 1 * 128, 6);      // PulseArrows pulses arrow_rt too
    r.node('arrow_rt').opacity = 0.5;
    expect(draw(r).find((x) => x.object === 'arrow_rt')!.alpha).toBeCloseTo(0.25 * 128, 6);
  });
});

describe('the preview\'s place (MODEL_CAMERA_READING)', () => {
  const win = { x0: 365, x1: 630, y0: 105, y1: 223 };                           // EquipWeapWin (research 95 §2.5)
  it('puts every entry\'s origin inside EquipWeapWin, on its centre row: the M16A2, the Mark 23, a grenade, the Dragunov', () => {
    // The UI camera's focal (research 182 §2.29, §2.35): 320 x cot 35 deg, the game's float 457.0074 (FUN_00291490 via
    // FUN_00318da0, D:L217205; menu.rdram cam+0x290), square: fovY = 2 atan(224 / 457.0074) = 52.22 deg, not pi/4.
    expect(MODEL_CAMERA_READING.focal).toBe(457.0074);
    expect(MODEL_CAMERA_READING.fovY).toBeCloseTo(2 * Math.atan(224 / 457.0074), 12);
    expect((MODEL_CAMERA_READING.fovY * 180) / Math.PI).toBeCloseTo(52.22, 2);
    for (const e of [{ azimuth: 10.7, elev: 3, distance: 27 }, { azimuth: 6, elev: 1.75, distance: 15 }, { azimuth: 13, elev: 4, distance: 35 }, { azimuth: 13.5, elev: 3.5, distance: 35 }]) {
      const [x, y] = modelFramePoint(e);
      expect(x).toBeGreaterThan(win.x0); expect(x).toBeLessThan(win.x1);
      expect(y).toBeGreaterThan(win.y0); expect(y).toBeLessThan(win.y1);
    }
    // The M16A2 at (501.1, 173.2) and the Mark 23 at research 182's (502.8, 170.7): on EquipWeapWin's centre (497.5, 164).
    const m16 = modelFramePoint({ azimuth: 10.7, elev: 3, distance: 27 });
    expect(m16[0]).toBeCloseTo(320 + (457.0074 * 10.7) / 27, 6); expect(m16[1]).toBeCloseTo(224 - (457.0074 * 3) / 27, 6);
    const mk23 = modelFramePoint({ azimuth: 6, elev: 1.75, distance: 15 });
    expect(mk23[0]).toBeCloseTo(502.8, 1); expect(mk23[1]).toBeCloseTo(170.7, 1);
  });

  it('the models go after the dialog\'s objects and under the fader and the popup (UI_MODEL_DRAW_ORDER_READING)', () => {
    const q = (object: string) => ({ object, texture: 't', x: 0, y: 0, w: 1, h: 1, u0: 0, v0: 0, u1: 1, v1: 1, rgb: [128, 128, 128] as const, alpha: 128 });
    expect(modelSplit([q('a'), q('b'), q(MENUFADER), q('POPUP')])).toBe(2);
    expect(modelSplit([q('a'), q('POPUP_BUTTON_0')])).toBe(1);
    expect(modelSplit([q('a')])).toBe(1);
  });
});
