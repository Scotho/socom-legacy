// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, HUD_LAYOUT, hudLayout, type HudModel } from '../src/hud';
import { textWidth } from '../src/hudFont';
import {
  KILL_FEED_CLEARANCE_ADAPTATION, KILL_FEED_COMPASS_REACH_ADAPTATION, KILL_FEED_MAX_WIDTH_ADAPTATION,
  KILL_FEED_TEXT_INSET_ADAPTATION, keepClearWatch, messagePanelSpan, TOUCH_KEEP_CLEAR_SELECTOR, touchKeepClear,
  MESSAGE_WINDOW_MAX_LENGTH, MESSAGE_WINDOW_X_MARGIN, MESSAGE_WRAP_BACK, MESSAGE_WRAP_HARD, MESSAGE_WRAP_SLACK,
  MESSAGE_WRAP_WIDTH, wrapMessageLine, MESSAGE_WINDOW_SCALE, MESSAGE_POST_SCALE_FACTOR, MESSAGE_TEXT_SCALE_READING,
  messageMeasureScale,
} from '../src/hudMessagePanel';
import { botDisplayName, plainBotText } from '../src/botPresentation';
import { parseRdr, rdrGet, Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';

/**
 * OT.R82 (LATER 385; an adaptation): the message window's panel keeps the original's width, widens for a line it does
 * not hold to at most 25% more, and never into what stands in its rows.
 */

const SIZES: Record<string, { width: number; height: number }> = {
  'newweapnbkrnd.tif': { width: 128, height: 64 }, 'compass_lo.tif': { width: 128, height: 128 },
  'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 },
};
const KILL = 'BOT ZuluReaper fragged BOT MagDumpMonk with SASR';   // the owner's screenshot's line
const model = (text: string, over: Partial<HudModel> = {}): HudModel =>
  ({ ...DEFAULT_MODEL, banner: [{ alpha: 1, lines: [{ text, scale: 1 }] }], ...over });
const panel = (frame: { width: number; height: number }, m: HudModel) => {
  const q = hudLayout(frame, m, SIZES).quads.find((x) => x.element === 'banner')!;
  return { left: q.x - q.w / 2, w: q.w, centre: q.x };
};
const M = HUD_LAYOUT.message.panel;

describe('OT.R82: the message window panel, wider for a long line where there is room', () => {
  it('names the cap within the owner\'s 20-30%', () => {
    expect(KILL_FEED_MAX_WIDTH_ADAPTATION).toBeGreaterThanOrEqual(1.2);
    expect(KILL_FEED_MAX_WIDTH_ADAPTATION).toBeLessThanOrEqual(1.3);
  });

  it('a line the default holds keeps the original\'s panel, in every frame', () => {
    for (const frame of [{ width: 640, height: 448 }, { width: 1280, height: 720 }, { width: 844, height: 390 }]) {
      const s = frame.height / 448, p = panel(frame, model('STARTING ROUND 1 OF 11'));
      expect(p.w, `${frame.width}`).toBeCloseTo(M.w * s, 6);
      expect(p.left, `${frame.width}`).toBeCloseTo(frame.width / 2 + (M.x - 320) * s, 6);
    }
  });

  it('1280 x 720: the kill line widens the panel to hold it, about the same centre, under the cap', () => {
    const frame = { width: 1280, height: 720 }, s = 720 / 448;
    const want = (textWidth(KILL, 1) + 2 * KILL_FEED_TEXT_INSET_ADAPTATION) * s;
    expect(want).toBeGreaterThan(M.w * s);                                   // the default does not hold it
    const p = panel(frame, model(KILL)), base = panel(frame, model('X'));
    expect(p.w).toBeCloseTo(Math.min(want, M.w * KILL_FEED_MAX_WIDTH_ADAPTATION * s), 6);
    expect(p.centre).toBeCloseTo(base.centre, 6);
  });

  it('a line longer still stops at the cap (1280 x 720, 844 x 390)', () => {
    for (const frame of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
      const s = frame.height / 448;
      expect(panel(frame, model(`${KILL} ${KILL}`)).w, `${frame.width}`).toBeCloseTo(M.w * KILL_FEED_MAX_WIDTH_ADAPTATION * s, 6);
    }
  });

  it('the PS2 frame (and a 4:3 window): the compass\'s reach already meets the panel, so it stays the original\'s', () => {
    expect(565 - KILL_FEED_COMPASS_REACH_ADAPTATION).toBeLessThan(M.x + M.w);
    for (const frame of [{ width: 640, height: 448 }, { width: 1024, height: 768 }]) {
      const s = frame.height / 448;
      expect(panel(frame, model(`${KILL} ${KILL}`)).w, `${frame.width}`).toBeCloseTo(M.w * s, 6);
    }
  });

  it('700 x 448: stopped short of the compass\'s reach, the same at every heading (the ring turns in place)', () => {
    const frame = { width: 700, height: 448 };
    // The reach's left edge R(565 - 80) = 700 - 155; the panel's centre 350 - 0.5; the clearance kept.
    const room = 700 - (640 - (565 - KILL_FEED_COMPASS_REACH_ADAPTATION)) - (350 - 0.5) - KILL_FEED_CLEARANCE_ADAPTATION;
    expect(room).toBeGreaterThan(M.w / 2);
    expect(room).toBeLessThan(M.w / 2 * KILL_FEED_MAX_WIDTH_ADAPTATION);
    for (const yaw of [0, 30, 45, 90]) expect(panel(frame, model(`${KILL} ${KILL}`, { yaw })).w, `${yaw}`).toBeCloseTo(room * 2, 6);
  });

  it('844 x 390 with touch on: stopped short of a touch control in its rows; one across the centre leaves the default', () => {
    const frame = { width: 844, height: 390 }, s = 390 / 448;
    const centre = 844 / 2 + (M.x + M.w / 2 - 320) * s;
    const pause = { x0: 0.7, y0: 0.02, x1: 0.76, y1: 0.12 };                  // a control at the top, right of the panel
    const room = 0.7 * 844 - centre - KILL_FEED_CLEARANCE_ADAPTATION * s;
    expect(room).toBeGreaterThan(M.w / 2 * s);
    expect(room).toBeLessThan(M.w / 2 * KILL_FEED_MAX_WIDTH_ADAPTATION * s);
    expect(panel(frame, model(`${KILL} ${KILL}`, { keepClear: [pause] })).w).toBeCloseTo(room * 2, 6);
    expect(panel(frame, model(`${KILL} ${KILL}`, { keepClear: [{ x0: 0.7, y0: 0.5, x1: 0.76, y1: 0.6 }] })).w)   // below its rows
      .toBeCloseTo(M.w * KILL_FEED_MAX_WIDTH_ADAPTATION * s, 6);
    expect(panel(frame, model(`${KILL} ${KILL}`, { keepClear: [{ x0: 0.45, y0: 0.02, x1: 0.55, y1: 0.1 }] })).w).toBeCloseTo(M.w * s, 6);
  });

  it('touchKeepClear: the drawn controls as shares of the canvas; a hidden one (an empty box) and one off the canvas left out', () => {
    const box = (left: number, top: number, width: number, height: number) =>
      ({ getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }) });
    const canvas = box(100, 50, 800, 400) as unknown as Element;
    const els = [box(500, 70, 80, 40), box(0, 0, 0, 0), box(950, 60, 30, 30)];
    let asked = '';
    const doc = { querySelectorAll: (q: string) => { asked = q; return els; } } as unknown as ParentNode;
    expect(touchKeepClear(doc, canvas)).toEqual([{ x0: 0.5, y0: 0.05, x1: 0.6, y1: 0.15 }]);
    expect(asked).toBe(TOUCH_KEEP_CLEAR_SELECTOR);
  });

  it('keepClearWatch measures at a change only (no layout read a frame): once over 60 frames, once after each change', async () => {
    document.body.innerHTML = '<div id="root"><div id="touch"><button></button></div></div><canvas></canvas>';
    const canvas = document.querySelector('canvas')!;
    let measured = 0;
    const w = keepClearWatch(document, canvas, () => { measured++; return []; });
    const frames = (): void => { for (let i = 0; i < 60; i++) w.get(); };
    const settle = () => new Promise((r) => { setTimeout(r, 0); });       // a mutation is told after the change
    frames();
    expect(measured).toBe(1);
    for (const [change, want] of [
      [() => { window.dispatchEvent(new Event('resize')); }, 2],
      [() => { window.dispatchEvent(new Event('orientationchange')); }, 3],
      [() => { window.dispatchEvent(new Event('storage')); }, 4],                       // a touch layout saved
      [() => { document.body.classList.add('pad-on'); }, 5],                              // a pad connected
      [() => { document.getElementById('root')!.classList.add('armory-open'); }, 6],      // the ARMORY over the match
      [() => { document.getElementById('touch')!.hidden = true; }, 7],
    ] as const) {
      change();
      await settle();
      frames();
      expect(measured, String(want)).toBe(want);
    }
    document.querySelector('button')!.classList.add('lit');                             // a press inside the layer: no change
    await settle();
    frames();
    expect(measured).toBe(7);
    w.dispose();
    window.dispatchEvent(new Event('resize'));
    document.body.classList.remove('pad-on');
    await settle();
    frames();
    expect(measured).toBe(7);
  });

  describe('messagePanelSpan', () => {
    const P = { x: 100, w: 200, y0: 0, y1: 100 }, cx = 200;
    it('stops at the nearest neighbour in its rows, the clearance kept, on either side', () => {
      const right = messagePanelSpan(P, 1, 400, [{ element: 'timer', x: 330, y: 50, w: 20, h: 20 }]);   // its left edge 320
      expect(right.x + right.w).toBeCloseTo(320 - KILL_FEED_CLEARANCE_ADAPTATION, 6);
      const left = messagePanelSpan(P, 1, 400, [{ element: 'timer', x: 75, y: 50, w: 10, h: 10 }]);      // its right edge 80
      expect(left.x).toBeCloseTo(80 + KILL_FEED_CLEARANCE_ADAPTATION, 6);
      expect(left.x + left.w / 2).toBeCloseTo(cx, 6);
    });
    it('a neighbour out of its rows, one across its centre, and the compass\'s marks make no room', () => {
      const span = messagePanelSpan(P, 1, 400, [
        { element: 'timer', x: 310, y: 150, w: 20, h: 20 },
        { element: 'fader', x: 200, y: 50, w: 640, h: 448 },
        { element: 'marks', x: 310, y: 50, w: 10, h: 10 },
      ]);
      expect(span.w).toBeCloseTo(200 * KILL_FEED_MAX_WIDTH_ADAPTATION, 6);
    });
    it('never narrower than the default, even with a neighbour already nearer', () => {
      expect(messagePanelSpan(P, 1, 400, [{ element: 'timer', x: 302, y: 50, w: 4, h: 4 }])).toEqual({ x: 100, w: 200 });
    });
  });
});

/**
 * TAUNT-WRAP (task 8mqnCJBx; reading, pending review): the message window's line width. `FUN_002b6530` (D:L157901)
 * wraps a posted text wider than `int(DAT_003de6f8 + maxlength - 2 x XMargin)` = int(-8 + 325 - 20) = 297 at a space
 * (D:L158010-158032), each piece its own line node of the window (D:L158050-158055): a long name plus a full taunt no
 * longer runs past the panel, and every message posted takes the limit, not only the taunts.
 */
describe('TAUNT-WRAP: the message window wraps a line wider than its maxlength (FUN_002b6530)', () => {
  const NAME = 'WWWWWWWWWWWWWWWW';                                   // a wide name (16 W's)
  const TAUNT = 'CAN YOU FEEL THE LOVE? IT FEELS LIKE BULLETS!';       // 45 characters, the taunt's cap
  const LONG = `${NAME} : ${TAUNT}`;
  it('reads the limit off messages.rdr and the code: 325 - 2 x 10 - 8 = 297', () => {
    expect(TAUNT).toHaveLength(45);
    expect([MESSAGE_WINDOW_MAX_LENGTH, MESSAGE_WINDOW_X_MARGIN, MESSAGE_WRAP_SLACK, MESSAGE_WRAP_BACK, MESSAGE_WRAP_HARD])
      .toEqual([325, 10, -8, 24, 32]);
    expect(MESSAGE_WRAP_WIDTH).toBe(297);
  });
  it("measures at the scale the original draws: the window's 0.9 for a post's 0, else its scale x 1.1429 (D:L157983-157987)", () => {
    expect([MESSAGE_WINDOW_SCALE, MESSAGE_POST_SCALE_FACTOR, MESSAGE_TEXT_SCALE_READING]).toEqual([0.9, 1.1429, 1]);
    expect(messageMeasureScale(0)).toBe(0.9);                          // taunts, chat, comms, the kill feed, the claymore
    expect(messageMeasureScale(0.7)).toBeCloseTo(0.80003, 9);          // a script's objective line (FUN_00267760 D:L113376)
    expect(messageMeasureScale(0.9)).toBeCloseTo(1.02861, 9);          // a script's 0.9 line, the round start's post (D:L57649)
  });
  it('a short message is one line, unchanged', () => {
    expect(wrapMessageLine('Satchel', 0.9)).toEqual(['Satchel']);
    expect(wrapMessageLine('kilo fragged socomc with M4A1', 0.9)).toEqual(['kilo fragged socomc with M4A1']);
  });
  it('a long name plus a 45-character taunt wraps at a space, every line within 297 at its scale', () => {
    expect(textWidth(LONG, 0.9)).toBeGreaterThan(MESSAGE_WRAP_WIDTH);
    const lines = wrapMessageLine(LONG, 0.9);
    expect(lines.length).toBe(2);
    for (const l of lines) expect(textWidth(l, 0.9)).toBeLessThanOrEqual(MESSAGE_WRAP_WIDTH);
    expect(lines.join(' ')).toBe(LONG);                                // broken at a space, the space dropped
    expect(lines[1]!.startsWith(' ')).toBe(false);                     // the next line's leading spaces skipped (D:L157930)
  });
  it('breaks at the last space before the line crosses the limit, not at the first', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const lines = wrapMessageLine(words, 1);
    expect(lines.length).toBe(5);
    for (const l of lines) expect(textWidth(l, 1)).toBeLessThanOrEqual(MESSAGE_WRAP_WIDTH);
    // Each piece's next word would have crossed the limit -- measured, as the code does, with the leading space a
    // continuation keeps in its measure (D:L158015 walks `param_3` itself, not past its spaces).
    for (let i = 0; i + 1 < lines.length; i++) {
      const next = lines[i + 1]!.trimStart().split(' ')[0]!;
      expect(textWidth(`${i > 0 ? ' ' : ''}${lines[i]!.trimStart()} ${next}`, 1)).toBeGreaterThanOrEqual(MESSAGE_WRAP_WIDTH);
    }
    expect(lines.map((l) => l.trimStart()).join(' ')).toBe(words);
    // A piece cut again keeps its leading space (D:L158044 copies `param_3`'s first bytes); the last, which fits, skips it (D:L157930).
    expect(lines.slice(1, -1).every((l) => l.startsWith(' '))).toBe(true);
    expect(lines.at(-1)!.startsWith(' ')).toBe(false);
  });
  it('a text with no space is not wrapped (D:L158012: the wrap asks for a " ")', () => {
    const solid = 'W'.repeat(40);
    expect(wrapMessageLine(solid, 0.9)).toEqual([solid]);
  });
  it('no space within 24 characters back: broken at character 32 of a text longer than 32 (MESSAGE_WRAP_HARD_BREAK_READING)', () => {
    const text = `a ${'W'.repeat(60)}`;
    expect(wrapMessageLine(text, 0.5)).toEqual([text.slice(0, 32), text.slice(32)]);
  });
  it("a bot's gold initial stays on its line", () => {
    const bot = `${botDisplayName(NAME, true)} : ${TAUNT}`;
    const lines = wrapMessageLine(bot, 0.9);
    expect(lines.map(plainBotText)).toEqual(wrapMessageLine(LONG, 0.9));
    expect(lines[0]!.startsWith(botDisplayName('W', true))).toBe(true);
  });
  it('the wrapped lines keep the panel at its default width, as the frame scales; unwrapped, OT.R82 would widen it', () => {
    for (const frame of [{ width: 640, height: 448 }, { width: 1280, height: 896 }, { width: 1920, height: 896 }]) {
      const wrapped: HudModel = { ...DEFAULT_MODEL, banner: [{ alpha: 1, lines: wrapMessageLine(LONG, 0.9).map((text) => ({ text, scale: 0.9 })) }] };
      const s = hudLayout(frame, wrapped, SIZES).scale;
      expect(panel(frame, wrapped).w).toBeCloseTo(M.w * s, 6);
    }
    const wide = { width: 1920, height: 896 };                         // where OT.R82 has room: the whole line would widen it
    expect(panel(wide, model(LONG)).w).toBeGreaterThan(M.w * hudLayout(wide, model(LONG), SIZES).scale);
  });
});

const READERC = fixture('RUN/READERC.ZAR');
describe.skipIf(READERC === null)(`RUN/READERC.ZAR/messages.rdr${READERC === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it("holds the window's maxlength 325 and XMargin 10 (FUN_002b6fc0 D:L158227, D:L158236), and TtySpeed 13000", () => {
    const zar = Zar.parse(READERC!);
    const root = parseRdr(zar.data(zar.find('messages.rdr')!));
    expect(Number(rdrGet(root, 'maxlength'))).toBe(MESSAGE_WINDOW_MAX_LENGTH);
    expect(Number(rdrGet(root, 'XMargin'))).toBe(MESSAGE_WINDOW_X_MARGIN);
    // The window's +0x434 (D:L158295), written to each line node's +0xa0 over its 10000 (D:L157977, D:L158002): the
    // line's type-out rate, not its width (research 87 §14.1).
    expect(Number(rdrGet(root, 'TtySpeed'))).toBe(13000);
  });
});
