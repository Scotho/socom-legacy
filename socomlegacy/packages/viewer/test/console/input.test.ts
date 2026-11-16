// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { ConsoleController } from '../../src/console/grammar';
import { attachInput, DEAD, KEYMAP, PAD_REPEAT_ATTR, PAD_REPEAT_EVENT, PADMAP, REPEAT_DELAY, REPEAT_EVERY, padFrame, type Held, type PadLike } from '../../src/console/input';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState, HOME_CATEGORY, type Button } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * The console launcher's inputs (the S2U Briefing design system's prototype: KEYMAP, the pointer handlers, `pollPads`;
 * its "Controller UI" section 1): the page keeps an input mode, the last device used, on `<html data-input>`; the pad is
 * polled with the standard mapping, a circular 0.24 dead zone, 400 ms then 100 ms repeat on directions, triggers above
 * 0.6. A browser adaptation with no original (OT.R28); the keyboard map is a development build's only (OT.R29).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

const pad = (axes: number[] = [0, 0], pressed: Record<number, number> = {}): PadLike => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (pressed[i] ?? 0) >= 1, value: pressed[i] ?? 0 })),
});

describe('the input mode on <html data-input>', () => {
  it('starts as the page says, turns pad on a mapped key and pointer on a pointerdown', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    expect(document.documentElement.dataset.input).toBe('pointer');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(document.documentElement.dataset.input).toBe('pad');
    expect(CATS[page.ctl.S.cat]?.id).toBe('online');
    document.dispatchEvent(new Event('pointerdown'));
    expect(document.documentElement.dataset.input).toBe('pointer');
  });

  it('without the keyboard map (a release build, OT.R29) only the menu keys act (LR-30, LR.R24); the others do nothing', () => {
    // Was: a key did nothing. LR-30: the arrows, WASD, Enter / Space and Escape / Backspace drive the launcher's menus on
    // every build (test/console/lr30Keys.test.ts); the dev map's other keys (q, e, f, t, z, c) stay a development build's.
    page = bootConsole(document, window, sampleAdapters(), { keymap: false });
    for (const k of ['q', 'e', 'f', 't', 'z', 'c']) window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    expect(page.ctl.S.cat).toBe(HOME_CATEGORY);
    expect(document.documentElement.dataset.input).toBe('pointer');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(page.ctl.S.cat).toBe(HOME_CATEGORY + 1);
    expect(document.documentElement.dataset.input).toBe('pad');
  });

  it('the keyboard map is the prototype\'s', () => {
    expect(KEYMAP).toEqual({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'cross', ' ': 'cross', Escape: 'circle', Backspace: 'circle', w: 'up', s: 'down', a: 'left', d: 'right', f: 'square', t: 'triangle', q: 'l1', e: 'r1', z: 'l2', c: 'r2', o: 'options' });
  });
});

describe('the pointer', () => {
  // LR-28 (fact 3): the launcher page's Home list takes no hover at any size (LR-24 above the phone rule, now the phones
  // too); a click focuses and opens the row. Was: the hover moved the focus to the item.
  it('in pointer mode hover moves no focus on the page\'s Home list; a click does its verb', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.press('right');
    page.ctl.S.input = 'pointer';
    page.render();
    const items = document.querySelectorAll<HTMLElement>('#stage .cx-item');
    items[2]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(page.ctl.S.item[CATS.findIndex((c) => c.id === 'online')]).toBe(0);
    expect(items[2]!.classList.contains('is-focused')).toBe(false);
    items[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(page.ctl.S.screen).toBe('rooms');
  });

  it('in pad mode hover does not move focus', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    page.ctl.S.input = 'pad';
    page.render();
    document.querySelectorAll('#stage .cx-item')[1]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));   // LR-37 (4): Home is three rows
    expect(page.ctl.S.item[HOME_CATEGORY]).toBe(0);
  });

  it('a click on a category makes it current; on a legend prompt presses its button', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const settings = CATS.findIndex((c) => c.id === 'options');
    (document.querySelectorAll('#stage .cx-cat')[settings] as HTMLElement).click();
    expect(page.ctl.S.cat).toBe(settings);
    (document.querySelector('#legend [data-act="press"][data-b="cross"]') as HTMLElement).click();
    expect(page.ctl.S.screen).toBe('options');
  });
});

describe('the gamepad poll', () => {
  it('maps the standard indices', () => {
    expect(PADMAP).toEqual({ 0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle', 4: 'l1', 5: 'r1', 6: 'l2', 7: 'r2', 9: 'options', 12: 'up', 13: 'down', 14: 'left', 15: 'right' });
    expect([DEAD, REPEAT_DELAY, REPEAT_EVERY]).toEqual([0.24, 400, 100]);
  });

  it('the dead zone is circular: each axis under 0.24 still moves when the magnitude is over it', () => {
    expect(padFrame([pad([0.2, 0.1])], {}, 0)).toEqual([]);
    expect(padFrame([pad([-0.22, 0.1])], {}, 0)).toEqual(['left']);
    expect(padFrame([pad([0.2, 0.2])], {}, 0)).toEqual(['down']);
    expect(padFrame([pad([0.05, -0.5])], {}, 0)).toEqual(['up']);
  });

  it('a held direction moves once, then after 400 ms every 100 ms; a held face button presses once', () => {
    const held: Held = {};
    const at = (t: number) => padFrame([pad([0, 0], { 13: 1, 0: 1 })], held, t);
    expect(at(0)).toEqual(['cross', 'down']);
    expect(at(300)).toEqual([]);
    expect(at(401)).toEqual(['down']);
    expect(at(450)).toEqual([]);
    expect(at(502)).toEqual(['down']);
    expect(padFrame([pad()], held, 520)).toEqual([]);
    expect(Object.keys(held)).toEqual([]);
  });

  it('a trigger counts above 0.6', () => {
    expect(padFrame([pad([0, 0], { 6: 0.5 })], {}, 0)).toEqual([]);
    expect(padFrame([pad([0, 0], { 7: 0.7 })], {}, 0)).toEqual(['r2']);
  });

  it('a connected pad says so, and the footer status follows the connection', () => {
    const A = sampleAdapters();
    A.pad.setConnected(false);
    page = bootConsole(document, window, A, { keymap: true });
    expect(document.querySelector('#legend .cx-mark[data-mark="pad"]')!.getAttribute('aria-label')).toContain('No controller connected');   // LR-24 (was: [data-device=pad])
    window.dispatchEvent(new Event('gamepadconnected'));
    expect(page.ctl.S.toast).toBe('Controller connected');
    expect(document.querySelector('#legend .cx-mark[data-mark="pad"]')!.getAttribute('aria-label')).toContain('Controller connected');   // LR-24 (was: [data-device=pad])
    expect(document.querySelector('#toast .cx-toast')!.textContent).toBe('Controller connected');
  });
});

/**
 * RVK-A (LATER 966, V21.R7; the owner, 2026-11-12: "the << and >> buttons should be able to be held to page through"):
 * the pad delivers presses, not holds -- Cross presses the focused control once however long it is held (`REPEATS`).
 * A control that asks for it (`PAD_REPEAT_ATTR`: the replay transport's two jumps) takes the held Cross the way the D-pad's
 * hold is done: the first press as before (`padPress`), then after `REPEAT_DELAY` every `REPEAT_EVERY` one
 * `PAD_REPEAT_EVENT` on that control. Every other control, and every other screen, as before. A browser adaptation.
 */
describe('RVK-A: the pad\'s held Cross on a control that repeats', () => {
  const originalPads = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');
  let detach: (() => void) | undefined;
  let ctl: ConsoleController | undefined;
  afterEach(() => {
    detach?.(); ctl?.dispose(); detach = ctl = undefined;
    if (originalPads) Object.defineProperty(window.navigator, 'getGamepads', originalPads);
    else Reflect.deleteProperty(window.navigator, 'getGamepads');
    vi.restoreAllMocks();
  });

  function rig(target: HTMLElement) {
    const pads: PadLike[] = [pad()];
    Object.defineProperty(window.navigator, 'getGamepads', { configurable: true, value: () => pads });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const A = sampleAdapters();
    const c = new ConsoleController(createState(A), A, { render() {}, announce() {}, fit() {} });
    ctl = c;
    const presses = vi.spyOn(c, 'padPress').mockImplementation(() => {});      // the press's route is the grammar's (held elsewhere)
    let next: ((now: number) => void) | undefined;
    detach = attachInput(document, window, c, { keymap: false, frame: { request(cb) { next = cb; return 1; }, cancel() { next = undefined; } } });
    const repeats: number[] = [];
    let now = 0;
    target.addEventListener(PAD_REPEAT_EVENT, () => { repeats.push(now); });
    const step = (t: number, cross: boolean): void => { now = t; pads[0] = cross ? pad([0, 0], { 0: 1 }) : pad(); next?.(t); };
    return { presses, repeats, step };
  }

  it('padFrame repeats a button named beside REPEATS, at the same cadence; Cross alone presses once', () => {
    const held: Held = {};
    const at = (t: number, extra?: readonly Button[]) => padFrame([pad([0, 0], { 0: 1 })], held, t, undefined, extra);
    expect(at(0, ['cross'])).toEqual(['cross']);
    expect(at(300, ['cross'])).toEqual([]);
    expect(at(401, ['cross'])).toEqual(['cross']);
    expect(at(450, ['cross'])).toEqual([]);
    expect(at(502)).toEqual([]);                                                // not named: no repeat
    expect(at(603, ['cross'])).toEqual(['cross']);
  });

  it('on a focused [data-pad-repeat] control: the first press is the press, each repeat one PAD_REPEAT_EVENT there', () => {
    const b = document.createElement('button');
    b.setAttribute(PAD_REPEAT_ATTR, '');
    document.body.append(b);
    b.focus();
    const { presses, repeats, step } = rig(b);
    step(0, true);
    expect(presses.mock.calls).toEqual([['cross']]);
    step(300, true);
    step(401, true);
    step(450, true);
    step(502, true);
    expect(repeats).toEqual([401, 502]);
    expect(presses).toHaveBeenCalledTimes(1);
    step(520, false);                                                           // let go: no more
    step(1200, false);
    expect(repeats).toEqual([401, 502]);
    b.remove();
  });

  it('on any other control a held Cross presses once, as before (no repeat, no event)', () => {
    const b = document.createElement('button');
    document.body.append(b);
    b.focus();
    const { presses, repeats, step } = rig(b);
    for (const t of [0, 300, 401, 502, 603]) step(t, true);
    expect(presses.mock.calls).toEqual([['cross']]);
    expect(repeats).toEqual([]);
    b.remove();
  });
});
