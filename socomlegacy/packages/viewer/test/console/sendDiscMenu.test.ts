// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsolePage } from '../../src/console/app';
import { ico } from '../../src/console/icons';
import { prompts } from '../../src/console/render/legend';
import { CATS, DISC_SOURCES, HOME_CATEGORY, LAUNCH_SEND_ROW, LAUNCH_SHARE_ROW, SEND_MENU_ROW, sourceMenuRows } from '../../src/console/state';
import { SEND_MENU_LABEL, SEND_ROW_VERB, SEND_WORDS } from '../../src/discShareWords';
import { area, bootSend, click, sendFake, type SendBoot } from './sendFake';
import { mountShell } from './shell';

/**
 * DSH-11 (the disc share plan, DSH.R17, the owner, 2026-11-10: "i once requested it to be in the bottom left disc area
 * (and it still should be)"): "SEND DISC", a third row of the menu the disc mark opens (after DISC ISO and RETAIL DISC,
 * in the menu's capitals), a `menuitem` with the upload mark, never one of `DISC_SOURCES`. DSH-10's rule decides it
 * (`sendState`): enabled, it closes the menu and opens Play's panel on the send area, the share opened once; disabled, it
 * is drawn muted with DSH-10's tooltip, and its press says the reason in the legend's line, the menu left open. Launcher
 * page only: over a game the menu never opens. A browser adaptation, product track: nothing of the game.
 */
let b: SendBoot | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { b?.page.dispose(); b = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

const menu = (): HTMLElement | null => document.querySelector<HTMLElement>('#legend .cx-srcmenu');
const options = (): HTMLElement[] => [...(menu()?.querySelectorAll<HTMLElement>('button') ?? [])];
const sendOpt = (): HTMLElement | null => menu()?.querySelector<HTMLElement>('[data-send="menu"]') ?? null;
const discMark = (): HTMLElement => document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]')!;
const word = (ctl: ConsolePage['ctl'], k: string): string | undefined => prompts(ctl.S, ctl.A).find((x) => x.k === k)?.label;

describe('DSH-11: "SEND DISC" in the disc mark\'s menu', () => {
  it('is the menu\'s third row, after the two sources, in its capitals; DISC_SOURCES unchanged', () => {
    b = bootSend(sendFake(true));
    b.ctl.press('square');                                        // Square on Play opens the disc mark's menu
    expect(b.ctl.S.src.open).toBe(true);
    expect(DISC_SOURCES.map((o) => o.id)).toEqual(['image', 'folder']);
    expect(SEND_MENU_ROW).toBe(DISC_SOURCES.length);
    expect(sourceMenuRows(b.ctl.S, b.A)).toBe(DISC_SOURCES.length + 1);
    expect(options().map((o) => o.textContent)).toEqual(['DISC ISO', 'RETAIL DISC', SEND_MENU_LABEL]);
    expect(SEND_MENU_LABEL).toBe('SEND DISC');
    expect(options().map((o) => o.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio', 'menuitem']);
    const s = sendOpt()!;
    expect(s.dataset['i']).toBe(String(SEND_MENU_ROW));
    expect(s.hasAttribute('aria-checked')).toBe(false);
    const want = document.createElement('span');
    want.innerHTML = ico('upload');
    expect(s.querySelector('svg')!.outerHTML).toBe(want.innerHTML);
    expect(s.getAttribute('title')).toBe(SEND_WORDS.ready.tip);
    expect(document.getElementById(s.getAttribute('aria-describedby')!)!.textContent).toBe(SEND_WORDS.ready.tip);
    expect(s.classList.contains('is-muted')).toBe(false);
  });

  it('Square on Play, Down twice, Cross: the send area opens and the share opens once', () => {
    const share = sendFake(true);
    b = bootSend(share);
    b.ctl.press('square');
    b.ctl.press('down'); b.ctl.press('down');
    expect(b.ctl.S.src.row).toBe(SEND_MENU_ROW);
    expect(sendOpt()!.classList.contains('is-focused')).toBe(true);
    expect(word(b.ctl, 'cross')).toBe(SEND_ROW_VERB);
    b.ctl.press('cross');
    expect(share.calls).toEqual(['openHost']);
    expect(b.ctl.S.src.open).toBe(false);
    expect(b.ctl.S.chk).toMatchObject({ open: true, send: true, row: LAUNCH_SEND_ROW });
    expect(menu()).toBeNull();
    expect(area()).not.toBeNull();
  });

  it('the pad\'s bound is DISC_SOURCES.length + 1: Down stops at SEND DISC', () => {
    b = bootSend(sendFake(true));
    b.ctl.press('square');
    for (let k = 0; k < 6; k++) b.ctl.press('down');
    expect(b.ctl.S.src.row).toBe(SEND_MENU_ROW);
    for (let k = 0; k < 6; k++) b.ctl.press('up');
    expect(b.ctl.S.src.row).toBe(0);
  });

  it('a click on the disc mark, then on SEND DISC, does the same', () => {
    const share = sendFake(true);
    b = bootSend(share);
    click(discMark());
    expect(b.ctl.S.src.open).toBe(true);
    click(sendOpt()!);
    expect(share.calls).toEqual(['openHost']);
    expect(b.ctl.S.chk).toMatchObject({ open: true, send: true, row: LAUNCH_SEND_ROW });
    expect(area()).not.toBeNull();
  });

  it('from another of Home\'s categories, the panel opens on Home\'s', () => {
    const share = sendFake(true);
    b = bootSend(share);
    const other = CATS.findIndex((c) => c.id !== 'home');
    b.ctl.S.cat = other;
    b.ctl.render();
    click(discMark());
    click(sendOpt()!);
    expect(b.ctl.S.cat).toBe(HOME_CATEGORY);
    expect(b.ctl.S.chk.send).toBe(true);
    expect(area()).not.toBeNull();
  });

  it('a source is still a source: Cross on DISC ISO picks it, opening no share', () => {
    const share = sendFake(true);
    b = bootSend(share);
    b.ctl.press('square');
    b.ctl.press('cross');
    expect(b.ctl.S.src.open).toBe(false);
    expect(share.calls).toEqual([]);
    expect(b.ctl.S.chk.send).toBeFalsy();
  });

  it('disabled: muted with the tooltip; the press opens nothing, says the reason, and leaves the menu open', () => {
    const share = sendFake(false);
    b = bootSend(share, { kept: null });
    b.ctl.press('square');
    const s = sendOpt()!;
    expect(s.classList.contains('is-muted')).toBe(true);
    expect(s.getAttribute('aria-disabled')).toBe('true');
    expect(s.getAttribute('title')).toBe(SEND_WORDS.none.tip);
    b.ctl.press('down'); b.ctl.press('down');
    expect(word(b.ctl, 'cross'), 'no Cross prompt on a row that cannot send').toBeUndefined();
    b.ctl.press('cross');
    expect(share.calls).toEqual([]);
    expect(b.ctl.S.chk.open).toBe(false);
    expect(b.ctl.S.src.open, 'the menu left open').toBe(true);
    expect(b.ctl.S.legendError).toBe(SEND_WORDS.none.line);
    click(sendOpt()!);
    expect(share.calls).toEqual([]);
    expect(b.ctl.S.src.open).toBe(true);
    expect(b.ctl.S.legendError).toBe(SEND_WORDS.none.line);
  });

  it('disabled while saving: its own tooltip and reason', () => {
    b = bootSend(sendFake(false), { saving: true, kept: { whole: false } });
    b.ctl.press('square');
    expect(sendOpt()!.getAttribute('title')).toBe(SEND_WORDS.saving.tip);
    click(sendOpt()!);
    expect(b.ctl.S.legendError).toBe(SEND_WORDS.saving.line);
  });

  it('no share adapter (the sample\'s): two rows, Down stops at RETAIL DISC', () => {
    b = bootSend(undefined);
    b.ctl.press('square');
    expect(options().map((o) => o.textContent)).toEqual(['DISC ISO', 'RETAIL DISC']);
    expect(sendOpt()).toBeNull();
    expect(sourceMenuRows(b.ctl.S, b.A)).toBe(DISC_SOURCES.length);
    for (let k = 0; k < 4; k++) b.ctl.press('down');
    expect(b.ctl.S.src.row).toBe(DISC_SOURCES.length - 1);
  });

  it('the disc mark\'s own tooltip is unchanged by the row', () => {
    b = bootSend(undefined);
    const without = discMark().getAttribute('title');
    b.page.dispose();
    mountShell(document);
    b = bootSend(sendFake(true));
    expect(discMark().getAttribute('title')).toBe(without);
  });

  it('over a game the overlay draws no menu and no SEND DISC', () => {
    const share = sendFake(true);
    b = bootSend(share, { mode: 'overlay' });
    b.ctl.press('square');
    const mark = document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="disc"]');
    if (mark) click(mark);                                        // the overlay's Home draws the page's marks (LR-39)
    expect(b.ctl.S.src.open).toBe(false);
    expect(menu()).toBeNull();
    expect(document.querySelector('[data-send="menu"]')).toBeNull();
    expect(share.calls).toEqual([]);
  });
});

/**
 * The review of agent/disc-send-row (2f, finding 1): SEND DISC pressed while "Request Game Files (XBOX)"'s area stands
 * (its request waiting) replaced the panel's state without ending the receiver's area, so no `cancel()` ran and the
 * request stayed live at central. The receiver's area ends first, as Circle and `dropShare` end it.
 */
describe('DSH-11 review F1: SEND DISC over the receiver\'s area withdraws its request', () => {
  it('Request open and waiting, the disc mark, SEND DISC: the request is cancelled, then the share opens', () => {
    const share = sendFake(true);
    b = bootSend(share);
    b.ctl.press('cross');                                         // Play: the panel
    for (let k = 0; k < 8 && b.ctl.S.chk.row !== LAUNCH_SHARE_ROW; k++) b.ctl.press('down');
    b.ctl.press('cross');                                         // Request Game Files (XBOX): a request, waiting
    expect(b.ctl.S.chk.share).toBe(true);
    expect(share.receiver().phase).toBe('waiting');
    click(discMark());
    expect(b.ctl.S.src.open).toBe(true);
    click(sendOpt()!);
    expect(share.calls).toEqual(['request', 'cancel', 'openHost']);
    expect(share.receiver().phase).toBe('idle');
    expect(b.ctl.S.chk.share).toBeFalsy();
    expect(b.ctl.S.chk.send).toBe(true);
    expect(area()).not.toBeNull();
  });

  it('a copy under way to this device is not withdrawn by it (as leaving the area never withdraws one)', () => {
    const share = sendFake(true);
    b = bootSend(share);
    b.ctl.press('cross');
    for (let k = 0; k < 8 && b.ctl.S.chk.row !== LAUNCH_SHARE_ROW; k++) b.ctl.press('down');
    b.ctl.press('cross');
    share.rx = { phase: 'copying', code: 'QX7K4M', bytes: 1, total: 2 };
    b.ctl.render();
    click(discMark());
    click(sendOpt()!);
    expect(share.calls).toEqual(['request', 'openHost']);
    expect(b.ctl.S.chk.share).toBeFalsy();
  });
});
