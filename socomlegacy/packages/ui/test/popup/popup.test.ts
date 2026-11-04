import { describe, expect, it } from 'vitest';
import { layoutText, ValveStore, VALVE_TYPE, type UiDrawItem, type ZAnimUiCommand } from '../../src/index';
import { widgetPad } from '../../src/widgets/index';
import { wrapLines } from '../../src/text/wrapped';
import {
  killPopUp, Popup, POPUP_BUTTON_SLOTS, POPUP_COMMAND_SIZE, POPUP_FOCUS_GLOW, POPUP_LINE_HEIGHT, POPUP_RECORD_AT, POPUP_TRIANGLE_ANSWER,
  readPopupRecord, routePopupInput, type PopupHost, type PopupSound,
} from '../../src/popup/index';
import { textFace } from '../text/fixtures';

// Web research 118: the POPUP record read by `FUN_0036da20` (D:L266787-267160), the popup's input `FUN_00370990`
// (D:L268476-268549), its draw `FUN_00370690` (D:L268388-268459), PopUpDialog's show `FUN_0027eff0`
// (D:L126860-126904) and KillPopUp `FUN_0027d190` (D:L125846-125859). Records are built by hand in the disc's shape
// (the logoff, `dlgWorldOfSOCOM` `exit_lobby`, research 118 §4); expected values worked from the cited lines.

/** The animation's name table the command indexes (`FUN_0026ed60`): index 0 `NA`, as every zAnim table. */
const NAMES = ['NA', 'popupOp.tif', 'active_back.tif', 'pop_butt.tif', 'AreYouSure', 'INPUT_STRING', 'ABC CBA', 'Keep', 'C'];
const N = (s: string): number => NAMES.indexOf(s);
const LOC: Record<number, string> = { 793: 'ABC CAB BCA ACB BAC CBA ABC CAB BCA ACB BAC CBA ABC CAB BCA ACB BAC CBA', 246: 'A', 253: 'B', 422: 'CC' };

interface Slot { bmp?: [number, number, number]; x: number; y: number; w: number; h: number; labelName?: number; labelId?: number; tdx: number; tdy: number; centred?: number; scale: number }
interface Rec {
  textName?: number; textId?: number; panel?: number; x: number; y: number; w: number; h: number; ty: number; tx: number;
  scale?: number; rgb?: [number, number, number]; tri?: number; keep?: number; buttons?: number; valve?: number; slots?: [Slot | null, Slot | null];
}

const FOCUSED_RGB = [91, 72, 36], NORMAL_RGB = [128, 128, 128], PRESSED_RGB = [102, 87, 38];

/** A `ui::UI_COMMAND` on the node `POPUP`: the 16-byte header (+4 the node index, +6 op 0), then the 220-byte record. */
function popupCmd(r: Rec, node = 'POPUP'): ZAnimUiCommand {
  const bytes = new Uint8Array(POPUP_COMMAND_SIZE);
  const dv = new DataView(bytes.buffer);
  const at = POPUP_RECORD_AT;
  bytes[4] = 1;
  bytes[at + 0] = r.textName ?? 0;
  dv.setInt16(at + 2, r.textId ?? 0, true);
  bytes[at + 4] = r.panel ?? N('popupOp.tif');
  dv.setInt32(at + 8, r.x, true); dv.setInt32(at + 12, r.y, true);
  dv.setInt32(at + 16, r.h, true); dv.setInt32(at + 20, r.w, true);
  dv.setInt32(at + 24, r.ty, true); dv.setInt32(at + 28, r.tx, true);
  dv.setFloat32(at + 32, r.scale ?? 1, true);
  (r.rgb ?? [128, 128, 128]).forEach((c, i) => dv.setInt32(at + 36 + 4 * i, c, true));
  bytes[at + 64] = r.tri ?? 0; bytes[at + 65] = r.keep ?? 0; bytes[at + 66] = r.buttons ?? 0; bytes[at + 67] = r.valve ?? 0;
  POPUP_BUTTON_SLOTS.forEach((b, k) => {
    const s = r.slots?.[k];
    const o = at + b;
    if (!s) { bytes[o + 20] = 255; dv.setFloat32(o + 72, 1, true); return; }
    const [f, n, p] = s.bmp ?? [N('active_back.tif'), N('pop_butt.tif'), N('pop_butt.tif')];
    bytes[o] = f; bytes[o + 1] = n; bytes[o + 2] = p;
    dv.setInt32(o + 4, s.x, true); dv.setInt32(o + 8, s.y, true); dv.setInt32(o + 12, s.w, true); dv.setInt32(o + 16, s.h, true);
    bytes[o + 20] = s.labelName ?? 255; dv.setInt16(o + 22, s.labelId ?? 0, true);
    dv.setInt32(o + 24, s.tdx, true); dv.setInt32(o + 28, s.tdy, true);
    [...FOCUSED_RGB, ...NORMAL_RGB, ...PRESSED_RGB].forEach((c, i) => dv.setInt32(o + 32 + 4 * i, c, true));
    bytes[o + 68] = s.centred ?? 0;
    dv.setFloat32(o + 72, s.scale, true);
  });
  return { anim: 'exit_lobby', sequence: 'NA', nodeIndex: 1, node, opcodeByte: 0, fn: null, arg: 'NA', loc: 0, bytes };
}

/** The logoff (`exit_lobby`, text 793): NO (246) is button 1 at 225, YES (253) button 2 at 65 (research 118 §4). */
const LOGOFF: Rec = {
  textId: 793, x: 150, y: 180, w: 340, h: 130, ty: 45, tx: 25, buttons: 1, valve: N('AreYouSure'),
  slots: [{ x: 225, y: 90, w: 50, h: 25, labelId: 246, tdx: 18, tdy: 25, scale: Math.fround(0.9) }, { x: 65, y: 90, w: 50, h: 25, labelId: 253, tdx: 13, tdy: 25, scale: Math.fround(0.9) }],
};
/** The logoff's second popup (text 422): no buttons. */
const GOODBYE: Rec = { textId: 422, x: 150, y: 180, w: 340, h: 50, ty: 35, tx: 120 };

class Host implements PopupHost {
  readonly sounds: PopupSound[] = [];
  sound(name: PopupSound): void { this.sounds.push(name); }
  take(): PopupSound[] { return this.sounds.splice(0); }
}

const make = (input: string | null = null) => {
  const face = textFace(), valves = new ValveStore();
  const popup = new Popup({
    face: (n) => (n === 'font_t' ? face : null), font: 'font_t', captions: null, uiVars: null, valves,
    locText: (id) => LOC[id] ?? null, name: (_c, i) => NAMES[i] ?? null, hasTexture: () => true, inputString: () => input,
  });
  return { popup, face, valves, host: new Host() };
};

const sprites = (items: UiDrawItem[]) => items.filter((i) => i.kind === 'sprite').map((i) => i.kind === 'sprite' && [i.texture, i.x0, i.y0, i.x1, i.y1, ...i.rgba]);

describe('the POPUP record (research 118 §2; FUN_0036da20 D:L266787-267160)', () => {
  it('reads every field at its offset into the record (the command +0x10 on)', () => {
    const r = readPopupRecord(popupCmd({ ...LOGOFF, keep: 1, tri: 1, scale: 1.5, rgb: [1, 2, 3], textName: N('ABC CBA') }).bytes);
    expect(r).toMatchObject({
      textName: N('ABC CBA'), textId: 793, panel: N('popupOp.tif'), x: 150, y: 180, h: 130, w: 340, textY: 45, textX: 25,
      textScale: 1.5, textColor: [1, 2, 3], triangle: true, keep: true, hasButtons: true, valve: N('AreYouSure'),
    });
    expect(r.buttons[0]).toEqual({
      focused: N('active_back.tif'), normal: N('pop_butt.tif'), pressed: N('pop_butt.tif'), x: 225, y: 90, w: 50, h: 25,
      labelName: 255, labelId: 246, labelOffset: [18, 25], colors: { focused: FOCUSED_RGB, normal: NORMAL_RGB, pressed: PRESSED_RGB },
      centred: false, scale: Math.fround(0.9),
    });
    expect(r.buttons[1]).toMatchObject({ x: 65, labelId: 253, labelOffset: [13, 25] });
  });

  it('a centred slot is the byte +68 equal to 1, not any non-zero byte (D:L267003)', () => {
    const slot = { ...LOGOFF.slots![0]!, centred: 2 };
    expect(readPopupRecord(popupCmd({ ...LOGOFF, slots: [slot, { ...slot, centred: 1 }] }).bytes).buttons.map((b) => b.centred)).toEqual([false, true]);
  });
});

describe("the buttons' bodies for a pointer (MENU_TOUCH_READING, a browser adaptation; research 116 §11)", () => {
  it("each button's body where the draw places it; null for a button with no width, and both null with no valve", () => {
    const { popup } = make();
    popup.command(popupCmd(LOGOFF));
    // The panel at (150, 180); NO's slot at (225, 90), YES's at (65, 90), each 50 x 25 -- the draw's own quads.
    expect(popup.buttonRects()).toEqual([[375, 270, 425, 295], [215, 270, 265, 295]]);
    popup.show(new Host());
    const quads = sprites(popup.draw()).filter((q) => q && q[0] !== 'popupOp.tif').map((q) => q && q.slice(1, 5));
    expect(quads).toEqual(popup.buttonRects());
    expect(popup.buttonRects([10, 20], [0, 0])).toEqual([[235, 110, 285, 135], [75, 110, 125, 135]]);
    popup.command(popupCmd({ ...LOGOFF, slots: [LOGOFF.slots![0]!, null] }));     // one button: slot 2 empty, width 0
    expect(popup.buttonRects()).toEqual([[375, 270, 425, 295], null]);
    popup.command(popupCmd(GOODBYE));                                              // no buttons: no valve
    expect(popup.buttonRects()).toEqual([null, null]);
  });

  it("step is LEFT / RIGHT's body: to the other slot when it has a width, with SELECTION; else nothing", () => {
    const { popup, host } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF)); host.take();
    popup.step(host);
    expect([popup.answer, popup.buttons[1].look.state, popup.buttons[0].look.state, host.take()]).toEqual([2, 'ACTIVE', 'NORMAL', ['SELECTION']]);
    popup.command(popupCmd({ ...LOGOFF, slots: [LOGOFF.slots![0]!, null] })); host.take();
    popup.step(host);
    expect([popup.answer, host.take()]).toEqual([1, []]);
  });
});

describe('PopUpDialog and KillPopUp (research 118 §1, §6)', () => {
  it('the popup is made hidden; PopUpDialog shows it and plays .METAL (FUN_0027eff0 D:L126896-126900)', () => {
    const { popup, host } = make();
    expect(popup.visible).toBe(false);
    expect(popup.draw()).toEqual([]);                       // a hidden node is not walked
    popup.show(host);
    expect(popup.visible).toBe(true);
    expect(host.take()).toEqual(['.METAL']);
  });

  it('KillPopUp only hides: no valve write, no text change (FUN_0027d190 D:L125846-125859); it answers 1, popup or not', () => {
    const { popup, host, valves } = make();
    popup.show(host);
    popup.command(popupCmd(LOGOFF));
    const lines = popup.text.lines;
    expect(killPopUp(popup)).toBe(true);
    expect(popup.visible).toBe(false);
    expect(valves.find('AreYouSure')!.value).toBe(0);
    expect(popup.text.lines).toBe(lines);
    expect(killPopUp(null)).toBe(true);                     // DAT_00415d10 null: nothing
  });

  it('the menu input goes to a shown popup and stops there (FUN_00368650 D:L263850-263855)', () => {
    const { popup, host } = make();
    popup.command(popupCmd(LOGOFF));
    expect(routePopupInput(popup, widgetPad({ LEFT: 'FALLING' }), host)).toBe(false);   // hidden: the dialog's
    expect(popup.answer).toBe(1);
    popup.show(host); host.take();
    expect(routePopupInput(popup, widgetPad({ SQUARE: 'FALLING' }), host)).toBe(true);  // taken, swallowed
    expect(routePopupInput(null, widgetPad({ LEFT: 'FALLING' }), host)).toBe(false);
  });
});

describe('the record applied (research 118 §2-§4)', () => {
  it('the logoff: the node at (150, 180), the valve made TEMP, answer 1, button 1 (NO) focused, button 2 normal', () => {
    const { popup, valves } = make();
    expect(popup.command(popupCmd(LOGOFF))).toEqual({ answer: true });
    expect([popup.x, popup.y, popup.w, popup.h]).toEqual([150, 180, 340, 130]);
    expect(valves.find('AreYouSure')).toMatchObject({ value: 0, type: VALVE_TYPE.TEMP });
    expect(popup.valve?.name).toBe('AreYouSure');
    expect(popup.answer).toBe(1);
    const [b1, b2] = popup.buttons;
    expect(b1.look.state).toBe('ACTIVE');
    expect(b1.look.color).toEqual(FOCUSED_RGB);
    expect(b1.body.texture).toBe('active_back.tif');
    expect(b2.look.state).toBe('NORMAL');
    expect(b2.look.color).toEqual(NORMAL_RGB);
    expect(b2.body.texture).toBe('pop_butt.tif');
    expect([b1.captionCodes, b2.captionCodes]).toEqual([[0x41], [0x42]]);
  });

  it('the focused state glows: RANGE 0.5 .. 1.0 over TIME 0.5 (D:L266914-266917, FUN_003773f0\'s state +0x10/+0x14/+0x18/+0x20)', () => {
    const { popup } = make();
    popup.command(popupCmd(LOGOFF));
    const [b1, b2] = popup.buttons;
    expect(POPUP_FOCUS_GLOW).toEqual({ range: [0.5, 1], time: 0.5 });
    expect(b1.look.glow).toMatchObject({ on: true, bottom: 0.5, top: 1, period: 0.5 });
    expect(b2.look.glow.on).toBe(false);
    popup.tick(0.25);                                        // phase 0.125 of 0.5: sin(0.25 x 3.14) -> alpha
    const s = Math.fround(Math.sin(Math.fround(Math.fround(0.125 / 0.5) * Math.fround(3.14))));
    expect(b1.look.alpha).toBeCloseTo((0.5 + s * 0.5) * 128, 3);
    expect(b2.look.alpha).toBe(100);
  });

  it('a record off the POPUP node does not move it (the name test against "POPUP", D:L266844-266848)', () => {
    const { popup } = make();
    popup.command(popupCmd(LOGOFF));
    popup.command(popupCmd({ ...LOGOFF, x: 10, y: 20 }, 'OTHER'));
    expect([popup.x, popup.y]).toEqual([150, 180]);
  });
});

describe('the buttons and the answer (FUN_00370990 D:L268476-268549)', () => {
  it('the logoff opens on NO; LEFT moves to YES with SELECTION; LEFT again back to NO; RIGHT the same', () => {
    const { popup, host } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF)); host.take();
    expect(popup.input(widgetPad({ LEFT: 'FALLING' }), host)).toBe(true);
    expect(popup.answer).toBe(2);
    expect(popup.buttons.map((b) => b.look.state)).toEqual(['NORMAL', 'ACTIVE']);
    expect(host.take()).toEqual(['SELECTION']);
    popup.input(widgetPad({ LEFT: 'FALLING' }), host);
    expect(popup.answer).toBe(1);
    popup.input(widgetPad({ RIGHT: 'FALLING' }), host);
    expect(popup.answer).toBe(2);
    expect(host.take()).toEqual(['SELECTION', 'SELECTION']);
    popup.input(widgetPad({ LEFT: 'DOWN' }), host);         // a held button is not a press (the byte tested for 1)
    expect(popup.answer).toBe(2);
  });

  it('CROSS on YES: AreYouSure := 2 through its watchers, YES pressed, the popup hidden, SELECTION', () => {
    const { popup, host, valves } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF)); host.take();
    const seen: number[] = [];
    valves.watch('AreYouSure', 1, (v) => seen.push(v.value));
    popup.input(widgetPad({ LEFT: 'FALLING' }), host); host.take();
    popup.input(widgetPad({ CROSS: 'FALLING' }), host);
    expect(valves.find('AreYouSure')!.value).toBe(2);
    expect(seen).toEqual([2]);
    expect(popup.buttons[1].look.state).toBe('PRESSED');
    expect(popup.visible).toBe(false);
    expect(host.take()).toEqual(['SELECTION']);
  });

  it('CROSS with keep (+65) answers and stays up', () => {
    const { popup, host, valves } = make();
    popup.show(host); popup.command(popupCmd({ ...LOGOFF, keep: 1 }));
    popup.input(widgetPad({ CROSS: 'FALLING' }), host);
    expect(valves.find('AreYouSure')!.value).toBe(1);
    expect(popup.visible).toBe(true);
  });

  it('TRIANGLE answers 66 and closes only when +64 is set', () => {
    const a = make();
    a.popup.show(a.host); a.popup.command(popupCmd(LOGOFF)); a.host.take();
    a.popup.input(widgetPad({ TRIANGLE: 'FALLING' }), a.host);
    expect([a.valves.find('AreYouSure')!.value, a.popup.visible, a.host.take()]).toEqual([0, true, []]);
    const b = make();
    b.popup.show(b.host); b.popup.command(popupCmd({ ...LOGOFF, tri: 1 })); b.host.take();
    b.popup.input(widgetPad({ TRIANGLE: 'FALLING' }), b.host);
    expect([b.valves.find('AreYouSure')!.value, b.popup.visible, b.host.take()]).toEqual([POPUP_TRIANGLE_ANSWER, false, ['SELECTION']]);
    expect(POPUP_TRIANGLE_ANSWER).toBe(66);
  });

  it('a button of width 0 is unreachable: LEFT does nothing and plays nothing; CROSS still answers 1 and closes', () => {
    const { popup, host, valves } = make();
    const hidden: Rec = { ...LOGOFF, slots: [{ ...LOGOFF.slots![0]!, w: 0, labelId: 0 }, null] };
    popup.show(host); popup.command(popupCmd(hidden)); host.take();
    popup.input(widgetPad({ LEFT: 'FALLING' }), host);
    expect([popup.answer, host.take()]).toEqual([1, []]);
    popup.input(widgetPad({ CROSS: 'FALLING' }), host);
    expect([valves.find('AreYouSure')!.value, popup.visible]).toEqual([1, false]);
  });

  it('a record without buttons: no valve, CROSS closes it unanswered; the answer and widths are the last record\'s (POPUP_STALE_FOCUS_READING)', () => {
    const { popup, host, valves } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF));
    popup.command(popupCmd(GOODBYE)); host.take();
    expect(popup.valve).toBeNull();
    expect(popup.answer).toBe(1);
    popup.input(widgetPad({ LEFT: 'FALLING' }), host);      // the unseen toggle the lines allow
    expect([popup.answer, host.take()]).toEqual([2, ['SELECTION']]);
    popup.input(widgetPad({ CROSS: 'FALLING' }), host);
    expect([valves.find('AreYouSure')!.value, popup.visible, host.take()]).toEqual([0, false, ['SELECTION']]);
  });
});

describe('the text (FUN_00379f70 via the popup\'s text object, research 118 §3)', () => {
  it('the id\'s string, wrapped to w - 2 x [+28], each line in the colour the object held before the record', () => {
    const { popup, face } = make();
    popup.command(popupCmd(LOGOFF));
    // FUN_0037a770 starts the object's colour at 255 (D:L273681-273683); the record's (+36..+44) is written after the
    // setter (D:L267149-267155), so the first record's lines are made at 255 and the next record's at 128.
    expect(popup.text.lines).toEqual(wrapLines(face, LOC[793]!, { width: 290, scale: 1, color: [255, 255, 255] }));
    expect(popup.text.lines.length).toBeGreaterThan(1);
    popup.command(popupCmd(LOGOFF));
    expect(popup.text.lines.every((l) => l.color.every((c) => c === 128))).toBe(true);
  });

  it('INPUT_STRING (the name at +0, id 0) is the context\'s input string (D:L266839-266843)', () => {
    const { popup } = make('BA');
    popup.command(popupCmd({ ...GOODBYE, textId: 0, textName: N('INPUT_STRING') }));
    expect(popup.text.lines.map((l) => l.codes)).toEqual([[0x42, 0x41]]);
  });

  it('an empty or missing text leaves the lines as they were: the setter returns at once (D:L273439); CROSS\'s "" too', () => {
    const { popup, host } = make(null);
    popup.show(host); popup.command(popupCmd(LOGOFF));
    const before = popup.text.lines;
    popup.command(popupCmd({ ...LOGOFF, textId: 0, textName: N('INPUT_STRING') }));
    expect(popup.text.lines).toBe(before);
    popup.input(widgetPad({ CROSS: 'FALLING' }), host);
    expect(popup.text.lines).toBe(before);
  });
});

describe('the draw (FUN_00370690 D:L268388-268459)', () => {
  it('the logoff: the panel opaque at (150, 180) 340 x 130, the buttons at (x + bx, y + by), then the text from (175, 222)', () => {
    const { popup, host, face } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF));
    const items = popup.draw();
    expect(sprites(items)).toEqual([
      ['popupOp.tif', 150, 180, 490, 310, 128, 128, 128, 128],
      ['active_back.tif', 375, 270, 425, 295, 128, 128, 128, 128],   // NO: 375..424 x 270..294 (research 118 §3)
      ['pop_butt.tif', 215, 270, 265, 295, 128, 128, 128, 128],      // YES
    ]);
    const glyphs = items.filter((i) => i.kind === 'glyphs');
    // The labels at the button's (+tdx, +tdy) pen, the focused one in its colour and alpha 100, scale 0.9.
    expect(glyphs[0]).toEqual({ kind: 'glyphs', node: 'POPUP', clip: null, quads: layoutText(face, [0x41], 375 + 18, 270 + 25, { scale: Math.fround(0.9), color: FOCUSED_RGB as [number, number, number], alpha: 100, hcentered: false }).quads });
    // Line i's pen at (x + 25, y + 45 + 20 i - 3) (D:L268446-268453, D:L273144), the pitch 20 (FUN_00370610 D:L268382).
    // Its alpha is the face's opacity x 128: the setter gives each line node the object's font through FUN_00362b20
    // (D:L273492), which rewrites an alpha of 128 (D:L260716-260719) -- 0.7 x 128 here, as every text object's.
    const lines = popup.text.lines;
    expect(POPUP_LINE_HEIGHT).toBe(20);
    expect(face.opacity).toBeCloseTo(0.7, 6);
    lines.forEach((l, i) => {
      expect(glyphs[2 + i]).toEqual({ kind: 'glyphs', node: 'POPUP', clip: null, quads: layoutText(face, l.codes, 175, 222 + 20 * i, { scale: 1, color: l.color, alpha: Math.fround(Math.fround(0.7) * 128), bold: l.bold }).quads });
    });
    expect(glyphs).toHaveLength(2 + lines.length);
  });

  it('a record without buttons draws no button; a centred button\'s quad starts half its width left (FUN_0037c220)', () => {
    const { popup, host } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF)); popup.command(popupCmd(GOODBYE));
    expect(sprites(popup.draw())).toEqual([['popupOp.tif', 150, 180, 490, 230, 128, 128, 128, 128]]);   // 422: 340 x 50
    const leave: Rec = { ...LOGOFF, x: 140, w: 340, h: 120, slots: [{ ...LOGOFF.slots![0]!, x: 260, w: 80, centred: 1 }, { ...LOGOFF.slots![1]!, x: 70, w: 80, centred: 1 }] };
    popup.command(popupCmd(leave));
    expect(sprites(popup.draw()).slice(1).map((s) => s && s.slice(1, 3))).toEqual([[360, 270], [170, 270]]);   // research 118 §3: 170..249, 360..439
  });

  it('the walk\'s fade reaches the panel only (the popup\'s +0x34 is 0x364860; the buttons\' is jr ra)', () => {
    const { popup, host } = make();
    popup.show(host); popup.command(popupCmd(LOGOFF));
    const s = sprites(popup.draw(0.5));
    expect(s.map((x) => x && x[8])).toEqual([64, 128, 128]);
  });
});
