import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { PAD_GLYPH, parseAnimSets } from '@s2u/scene';
import { DIALOG_BUTTONS, dialogLookup, type DialogDesign, type DialogRecord, type PadSlotName } from '@s2u/ui';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { attachMenuPointer, MenuPageInput } from '../src/menuInput';
import { SCORE_LAYOUT } from '../src/scoreboard';
import {
  SETTINGS_ADVANCED_ANIMATION, SETTINGS_ADVANCED_DIALOGS, SETTINGS_ADVANCED_GLYPH, SETTINGS_ADVANCED_GREEN, SETTINGS_ADVANCED_PROMPT,
  SETTINGS_ADVANCED_ROW, SETTINGS_ADVANCED_TABS, SETTINGS_ADVANCED_TEXT, settingsAdvancedDesign, settingsAdvancedDesignOf,
  settingsAdvancedEntryBox, settingsAdvancedFrontEnd, settingsAdvancedFrontEndOffered, settingsAdvancedGate, settingsAdvancedLookup,
  settingsAdvancedPromptAt, settingsAdvancedPromptBox, type SettingsAdvancedScreen,
} from '../src/settingsAdvanced';
import { offerStartMenuLauncher, type StartMenuLauncher } from '../src/startMenuLauncher';

/**
 * WM-6A (product track, a browser adaptation; `../src/settingsAdvanced`): the ADVANCED entry on the original's OPTIONS,
 * VIDEO OPTIONS, AUDIO OPTIONS and CONTROLLER PRESETS, over the disc's own layouts and scripts (`test-fixtures/RUN`, byte
 * copies of the disc's files): drawn only where a launcher is offered, the disc's rows untouched, CROSS on the OPTIONS row
 * and SQUARE on the other three opening the launcher at the screen's tab, the menus left as they stood.
 */
/** The disc's committed front-end fixtures; the public export does not carry socomlegacy/test-fixtures, and there the tests that need them skip, said. */
const READERC = fixture('RUN/UI/READERC.ZAR'), UIZANIM = fixture('RUN/UIZANIM.ZAR');
const HAVE = READERC !== null && UIZANIM !== null;
const ABSENT = HAVE ? '' : ` (${FIXTURES_ABSENT})`;
const lookup = HAVE ? dialogLookup([Zar.parse(READERC!)]) : () => null;
const sets = HAVE ? parseAnimSets(Zar.parse(UIZANIM!)).sets : [];
const disc = (dialog: (name: string) => DialogDesign | null): FrontEndDisc => ({ dialog, sets, faces: [], captions: null, loader: {}, missing: [] });
const SCREENS = Object.keys(SETTINGS_ADVANCED_DIALOGS) as SettingsAdvancedScreen[];
const PROMPTS = ['video', 'audio', 'controller'] as const;
type Box = { x0: number; x1: number; y0: number; y1: number };
const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** A record's body: a sized widget's XSIZE x YSIZE at its place (a TEXT has no size here: its ink is measured below). */
function boxOf(r: DialogRecord): Box | null {
  const w = r.widget as { button?: { size: [number, number] }; image?: { size: [number, number] }; size?: [number, number] };
  const size = w.button?.size ?? w.image?.size ?? w.size;
  return size ? { x0: r.x, x1: r.x + size[0], y0: r.y, y1: r.y + size[1] } : null;
}
/**
 * The disc's own prompts on the prompt line, as the approved mock measured their ink on the port's frames
 * (`SETTINGS_ADVANCED_PROMPT`'s note): VIDEO's TRIANGLE BACK from x 480, AUDIO's from 475; CONTROLLER PRESETS' left prompt
 * ends at 283 and its right one starts at 465.
 */
const DISC_PROMPT_INK = { video: { left: null, right: 480 }, audio: { left: null, right: 475 }, controller: { left: 283, right: 465 } } as const;

describe.skipIf(!HAVE)(`WM-6A: the design (the approved look 6A)${ABSENT}`, () => {
  it('the tabs: OPTIONS and VIDEO open Display, AUDIO Audio, CONTROLLER PRESETS Controller (the launcher\'s tab ids)', () => {
    expect(SETTINGS_ADVANCED_TABS).toEqual({ options: 'display', video: 'display', audio: 'audio', controller: 'controller' });
    const options = readFileSync(resolve(import.meta.dirname, '../src/console/adapters/options.ts'), 'utf8');
    for (const tab of new Set(Object.values(SETTINGS_ADVANCED_TABS))) expect(options).toContain(`{ id: '${tab}', label:`);
  });

  it('a reading of the disc\'s data: SQUARE is bound on none of the three prompt screens (screen or control)', () => {
    for (const s of PROMPTS) {
      const d = lookup(SETTINGS_ADVANCED_DIALOGS[s])!;
      const controls = d.controls.flatMap((c) => ('button' in c.widget ? (c.widget as { button: { bindings: { name: string | null }[] } }).button.bindings : []));
      expect([...d.bindings, ...controls].filter((b) => b.name === 'SQUARE'), s).toEqual([]);
      expect(DIALOG_BUTTONS.SQUARE).toBe(8);
      expect(d.bindings.filter((b) => b.kind === 'button').map((b) => b.name).sort(), s).toEqual(s === 'controller' ? ['DOWN', 'TRIANGLE', 'UP'] : ['TRIANGLE']);
    }
  });

  it('OPTIONS: RETURN cloned as a green ADVANCED row in the free slot above RETURN, CROSS -> the animation at Display', () => {
    const d = lookup(SETTINGS_ADVANCED_DIALOGS.options)!;
    const to = settingsAdvancedDesign(SETTINGS_ADVANCED_DIALOGS.options, d);
    const ret = d.controls.find((c) => c.name === 'SaveAndLeaveBtn')!;
    const row = to.controls.find((c) => c.name === SETTINGS_ADVANCED_ROW)!;
    expect(row).toBeDefined();
    expect(to.controls.indexOf(row)).toBe(to.controls.findIndex((c) => c.name === 'SaveAndLeaveBtn') - 1);
    expect(row.widget.type).toBe('BUTTON');
    const w = row.widget as Extract<DialogRecord['widget'], { type: 'BUTTON' }>, rw = ret.widget as typeof w;
    expect({ x: row.x, y: row.y, size: w.button.size }).toEqual({ x: ret.x, y: ret.y - rw.button.size[1], size: rw.button.size });
    expect(row.y).toBe(250);                                       // HDDOnOff at 220, RETURN at 280: the 30 px slot between
    expect(w.button.caption).toBe(SETTINGS_ADVANCED_TEXT);
    expect(w.button.bindings).toEqual([{ ...rw.button.bindings.find((b) => b.name === 'CROSS')!, animation: SETTINGS_ADVANCED_ANIMATION, argument: 'display' }]);
    for (const s of [w.button.normal, w.button.active, w.button.pressed]) expect(s.textColor).toEqual([...SETTINGS_ADVANCED_GREEN]);
    expect(to.bindings).toBe(d.bindings);
  });

  it.each(PROMPTS)('%s: a green "<SQUARE> ADVANCED" prompt on the prompt line and a SQUARE screen binding at the tab', (s) => {
    const d = lookup(SETTINGS_ADVANCED_DIALOGS[s])!;
    const to = settingsAdvancedDesign(SETTINGS_ADVANCED_DIALOGS[s], d);
    const p = to.objects.find((o) => o.name === SETTINGS_ADVANCED_PROMPT.name)!;
    expect(p.widget.type).toBe('TEXT');
    const t = (p.widget as Extract<DialogRecord['widget'], { type: 'TEXT' | 'SECURETEXT' | 'CLOCK' }>).text;
    expect(t.caption).toBe(`${SETTINGS_ADVANCED_GLYPH} ${SETTINGS_ADVANCED_TEXT}`);
    expect(SETTINGS_ADVANCED_GLYPH).toBe(String.fromCharCode(PAD_GLYPH.SQUARE));
    expect(SETTINGS_ADVANCED_GLYPH).toBe('\xb4');
    expect(t.color).toEqual([64, 128, 64]);
    expect(SETTINGS_ADVANCED_GREEN).toEqual(SCORE_LAYOUT.left.headerRgb);
    expect(p.y).toBe(430);
    expect(p.x).toBe(s === 'controller' ? 374 : { video: 225, audio: 217 }[s] - SETTINGS_ADVANCED_PROMPT.inkOffset);
    expect(t.hcentered).toBe(s === 'controller');
    expect(to.bindings.slice(0, d.bindings.length)).toEqual(d.bindings);
    expect(to.bindings.at(-1)).toEqual({ kind: 'button', name: 'SQUARE', code: 8, state: 1, animation: SETTINGS_ADVANCED_ANIMATION, argument: SETTINGS_ADVANCED_TABS[s] });
    expect(to.controls).toBe(d.controls);
  });

  it.each(SCREENS)('%s: no disc record moved or changed, and the entry\'s box meets none of the disc\'s', (s) => {
    const d = lookup(SETTINGS_ADVANCED_DIALOGS[s])!;
    const to = settingsAdvancedDesign(SETTINGS_ADVANCED_DIALOGS[s], d);
    expect(to.controls.filter((c) => c.name !== SETTINGS_ADVANCED_ROW)).toEqual(d.controls);
    expect(to.objects.filter((o) => o.name !== SETTINGS_ADVANCED_PROMPT.name)).toEqual(d.objects);
    d.controls.forEach((c) => expect(to.controls).toContain(c));     // the same records, not copies
    const entry = settingsAdvancedEntryBox(to)!;
    expect(entry).not.toBeNull();
    if (s !== 'options') expect(entry).toEqual(settingsAdvancedPromptBox(s));
    // The windows the entry is drawn on, as the disc's own prompts and rows are: the prompt line's bar and the backdrops.
    const under = new Set(['eq_Lower_back', 'eq_title_back', 'MainWindow']);
    for (const r of [...d.controls, ...d.objects]) {
      const b = boxOf(r);
      // A child's place is its parent's frame (its parent's box is checked); a RADIOSTRIP is its own CHILDOF.
      if (!b || r.hidden || under.has(r.name) || (r.childOf !== null && r.childOf !== r.name)) continue;
      expect(meets(entry, b), `${s}: ${r.name} ${JSON.stringify(b)} met by ${JSON.stringify(entry)}`).toBe(false);
    }
    if (s !== 'options') {
      const ink = DISC_PROMPT_INK[s];
      expect(entry.x1).toBeLessThanOrEqual(ink.right);
      if (ink.left !== null) expect(entry.x0).toBeGreaterThan(ink.left);
      // RETURN's row bar (x 16..176 at y 370..400 on VIDEO and AUDIO) and the checkbox column: clear on x and y.
    }
  });

  it('where no launcher is offered the lookup gives the disc\'s design itself (the default); offered, the entry, made once', () => {
    let offered = false;
    const plain = settingsAdvancedLookup(lookup);
    const gated = settingsAdvancedLookup(lookup, () => offered);
    for (const s of SCREENS) {
      expect(plain(SETTINGS_ADVANCED_DIALOGS[s])).toBe(lookup(SETTINGS_ADVANCED_DIALOGS[s]));
      expect(gated(SETTINGS_ADVANCED_DIALOGS[s])).toBe(lookup(SETTINGS_ADVANCED_DIALOGS[s]));
    }
    offered = true;
    for (const s of SCREENS) {
      const a = gated(SETTINGS_ADVANCED_DIALOGS[s]);
      expect(a).not.toBe(lookup(SETTINGS_ADVANCED_DIALOGS[s]));
      expect(settingsAdvancedEntryBox(a)).not.toBeNull();
      expect(gated(SETTINGS_ADVANCED_DIALOGS[s])).toBe(a);
    }
    expect(gated('dlgMenu.rdr')).toBe(lookup('dlgMenu.rdr'));
    expect(settingsAdvancedFrontEndOffered()).toBe(false);          // Node: no document, never offered
  });

  it('the gate takes only the entry\'s animation with a tab on one of the four screens', () => {
    const open = vi.fn();
    const gate = settingsAdvancedGate(open);
    const design = lookup(SETTINGS_ADVANCED_DIALOGS.audio)!;
    expect(gate({ dialog: 'dlgOptions_Audio.rdr', design, animation: SETTINGS_ADVANCED_ANIMATION, argument: 'audio' })).toBe(true);
    expect(open).toHaveBeenLastCalledWith('audio');
    expect(gate({ dialog: 'dlgOptions_Audio.rdr', design, animation: 'ReturnToOptions', argument: null })).toBe(false);
    expect(gate({ dialog: 'dlgMenu.rdr', design, animation: SETTINGS_ADVANCED_ANIMATION, argument: 'audio' })).toBe(false);
    expect(gate({ dialog: 'dlgOptions_Audio.rdr', design, animation: SETTINGS_ADVANCED_ANIMATION, argument: 'nowhere' })).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('the prompt\'s box takes a tap (SQUARE); the OPTIONS row is a control (no prompt box); no entry, no box', () => {
    for (const s of PROMPTS) {
      const to = settingsAdvancedDesign(SETTINGS_ADVANCED_DIALOGS[s], lookup(SETTINGS_ADVANCED_DIALOGS[s])!);
      const b = settingsAdvancedPromptBox(s);
      expect(settingsAdvancedPromptAt(to, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)).toBe(true);
      expect(settingsAdvancedPromptAt(to, b.x1 + 1, 420)).toBe(false);
      expect(settingsAdvancedPromptAt(to, b.x0 + 1, b.y0 - 2)).toBe(false);
      expect(settingsAdvancedPromptAt(lookup(SETTINGS_ADVANCED_DIALOGS[s]), (b.x0 + b.x1) / 2, 420)).toBe(false);
    }
    const options = settingsAdvancedDesign(SETTINGS_ADVANCED_DIALOGS.options, lookup(SETTINGS_ADVANCED_DIALOGS.options)!);
    expect(settingsAdvancedPromptAt(options, 100, 265)).toBe(false);
    expect(settingsAdvancedPromptAt(null, 300, 420)).toBe(false);
  });
});

describe.skipIf(!HAVE)(`WM-6A: the front end -- the launcher at the tab, the menus as they stood${ABSENT}`, () => {
  /** A front end session on `start`, with the entry where `offered`; the page's launcher a recorder. */
  function rig(start: string, offered: boolean) {
    const doc = new JSDOM('').window.document;
    const opened: unknown[] = [];
    let open = false;
    const launcher: StartMenuLauncher = { isOpen: () => open, open: (target?: unknown) => { opened.push(target); open = true; } };
    offerStartMenuLauncher(doc, launcher);
    const s = new FrontEndSession({ disc: disc(settingsAdvancedLookup(lookup, () => offered)), startDialog: start, loader: false });
    if (offered) settingsAdvancedFrontEnd(doc, s);
    let now = 0;
    const frames = (n: number, down: PadSlotName[] = []): void => {
      s.input.source = { read: () => ({ down: new Set<PadSlotName>(down), stickX: 0, stickY: 0 }) };
      for (let i = 0; i < n; i++) s.advance(now += 1000 / 30);
    };
    const press = (b: PadSlotName, settle = 30): void => { frames(1, [b]); frames(settle); };
    const shell = () => s.machine.shell()!;
    const focused = () => s.input.ring()?.focused?.name ?? null;
    frames(120);
    return { s, doc, opened, close: () => { open = false; }, frames, press, shell, focused };
  }

  it('OPTIONS: CROSS on the ADVANCED row opens the launcher at Display; the screen and its focus stay as they stood', () => {
    const r = rig(SETTINGS_ADVANCED_DIALOGS.options, true);
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS.options);
    for (let i = 0; i < 12 && r.focused() !== SETTINGS_ADVANCED_ROW; i++) r.press('DOWN', 8);
    expect(r.focused()).toBe(SETTINGS_ADVANCED_ROW);
    r.press('CROSS');
    expect(r.opened).toEqual([{ settings: 'display' }]);
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS.options);
    expect(r.focused()).toBe(SETTINGS_ADVANCED_ROW);
    r.close(); r.frames(30);                                         // the overlay closed: the same screen, as it stood
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS.options);
    expect(r.focused()).toBe(SETTINGS_ADVANCED_ROW);
    r.press('DOWN', 8);
    expect(r.focused()).toBe('SaveAndLeaveBtn');                    // the ring runs on: ADVANCED, then RETURN
    r.s.close();
  });

  it.each(PROMPTS)('%s: SQUARE opens the launcher at its tab; the screen and its focus stay; the overlay\'s close lands there', (s) => {
    const r = rig(SETTINGS_ADVANCED_DIALOGS[s], true);
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS[s]);
    const focus = r.focused();
    r.press('SQUARE');
    expect(r.opened).toEqual([{ settings: SETTINGS_ADVANCED_TABS[s] }]);
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS[s]);
    expect(r.focused()).toBe(focus);
    r.close(); r.frames(30);
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS[s]);
    r.press('SQUARE');
    expect(r.opened).toHaveLength(2);                                // again, from the same screen
    r.s.close();
  });

  it.each(PROMPTS)('%s with no launcher offered: no entry drawn, and SQUARE does nothing (as today)', (s) => {
    const r = rig(SETTINGS_ADVANCED_DIALOGS[s], false);
    expect(settingsAdvancedEntryBox(r.shell().design)).toBeNull();
    const focus = r.focused();
    r.press('SQUARE');
    expect(r.opened).toEqual([]);
    expect(r.shell().currentName).toBe(SETTINGS_ADVANCED_DIALOGS[s]);
    expect(r.focused()).toBe(focus);
    r.s.close();
  });

  it('the front end\'s condition: a registered front end in a document that offers a launcher; its input\'s design readable', () => {
    const r = rig(SETTINGS_ADVANCED_DIALOGS.video, true);
    expect(settingsAdvancedFrontEndOffered(r.doc)).toBe(true);
    expect(settingsAdvancedDesignOf(r.s.input)).toBe(r.shell().design);
    expect(settingsAdvancedFrontEndOffered(new JSDOM('').window.document)).toBe(false);
    const bare = new JSDOM('').window.document;
    settingsAdvancedFrontEnd(bare, { host: { setBindingGate: () => {} }, input: {}, machine: { shell: () => null } });
    expect(settingsAdvancedFrontEndOffered(bare)).toBe(false);       // no launcher offered there
    r.s.close();
  });
});

describe.skipIf(!HAVE)(`WM-6A: the mouse -- a tap in the prompt's box presses SQUARE, a tap elsewhere off-control CROSS as today${ABSENT}`, () => {
  const canvasOn = () => {
    const doc = new JSDOM('').window.document;
    const canvas = doc.createElement('canvas'); doc.body.append(canvas);
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 448 }) as DOMRect;
    const send = (x: number, y: number): void => {
      const event = new doc.defaultView!.MouseEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
      canvas.dispatchEvent(event);
      canvas.dispatchEvent(Object.assign(new doc.defaultView!.MouseEvent('pointerup', { button: 0 }), {}));
    };
    return { canvas, send };
  };

  it.each(PROMPTS)('%s: inside the box SQUARE (no tap); outside it the tap as today', (s) => {
    const { canvas, send } = canvasOn();
    const design = settingsAdvancedDesign(SETTINGS_ADVANCED_DIALOGS[s], lookup(SETTINGS_ADVANCED_DIALOGS[s])!);
    const input = { tap: vi.fn(() => null), pointerDown: vi.fn(() => null), pointerMove: vi.fn(), pointerUp: vi.fn() };
    const square = vi.fn();
    const detach = attachMenuPointer(input, canvas, { design: () => design, square });
    const b = settingsAdvancedPromptBox(s);
    send((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    expect(square).toHaveBeenCalledTimes(1);
    expect(input.pointerDown).not.toHaveBeenCalled();
    send(600, 20);                                                   // off every control, off the prompt: the tap as today (lost by MenuInput, B-21)
    expect(input.pointerDown).toHaveBeenCalledWith(600, 20);
    expect(square).toHaveBeenCalledTimes(1);
    detach();
  });

  it('no entry on the screen (no launcher offered): the prompt\'s place is an ordinary tap', () => {
    const { canvas, send } = canvasOn();
    const input = { tap: vi.fn(() => null), pointerDown: vi.fn(() => null), pointerMove: vi.fn(), pointerUp: vi.fn() };
    const square = vi.fn();
    attachMenuPointer(input, canvas, { design: () => lookup(SETTINGS_ADVANCED_DIALOGS.video), square });
    send(275, 420);
    expect(square).not.toHaveBeenCalled();
    expect(input.pointerDown).toHaveBeenCalledWith(275, 420);
  });

  it('the page\'s source: SQUARE latched by the pointer is read down once, as a quick key press is', () => {
    const page = new MenuPageInput();
    page.press('SQUARE');
    expect([...page.read().down]).toEqual(['SQUARE']);
    expect([...page.read().down]).toEqual([]);
    page.press('SQUARE'); page.release();
    expect([...page.read().down]).toEqual([]);
  });
});
