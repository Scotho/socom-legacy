// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsolePage } from '../../src/console/app';
import { ico } from '../../src/console/icons';
import { prompts } from '../../src/console/render/legend';
import {
  LAUNCH_CHECK_ROWS, LAUNCH_PADSET_ROW, LAUNCH_SEND_ROW, LAUNCH_SHARE_ROW, launchCheckRows, sendState,
} from '../../src/console/state';
import { SEND_ROW_LABEL, SEND_ROW_VERB, SEND_WORDS, SHARE_ROW_LABEL } from '../../src/discShareWords';
import { area, bootSend, click, focusedRow, panel, sendFake, toSendRow } from './sendFake';
import { mountShell } from './shell';

/**
 * DSH-10 (the disc share plan, DSH.R17, the owner, 2026-11-10: "please also add it to the deploy screen above request
 * files, enabled when you have a disc added already (hoverable tooltip for context)"): the "Send Game Files" row of
 * Play's "Before you deploy" panel, directly above "Request Game Files (XBOX)" -- drawn where the page has a disc share
 * adapter, enabled only when the adapter's `complete()` answers true (DSH.R7: a complete extraction kept in this browser),
 * otherwise muted but reachable, its line and its tooltip saying why, its press saying the reason in the legend's line.
 * The enabled row's Cross opens the send area (RB-27's host screen) and the share (`openHost`, once). A browser
 * adaptation, product track: nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

const ids = (): (string | undefined)[] => [...panel()!.querySelectorAll<HTMLElement>('.cx-r[data-id]')].map((r) => r.dataset['id']);
const sendRow = (): HTMLElement => panel()!.querySelector<HTMLElement>('[data-id="send"]')!;
const word = (ctl: ConsolePage['ctl'], k: string): string | undefined => prompts(ctl.S, ctl.A).find((x) => x.k === k)?.label;
/** The text of the element the row names as its description (`aria-describedby`). */
const described = (el: HTMLElement): string => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '';

describe('DSH-10: the "Send Game Files" row of Play\'s "Before you deploy" panel', () => {
  it('the index constants: Send is 5, Request moves to 6, the panel has 7 rows', () => {
    expect(LAUNCH_SEND_ROW).toBe(5);
    expect(LAUNCH_SEND_ROW).toBe(LAUNCH_PADSET_ROW + 1);
    expect(LAUNCH_SHARE_ROW).toBe(6);
    expect(LAUNCH_SHARE_ROW).toBe(LAUNCH_SEND_ROW + 1);
    expect(LAUNCH_CHECK_ROWS).toBe(7);
  });

  it('sits directly above "Request Game Files (XBOX)" with a share adapter, with its label and the upload mark', () => {
    const b = bootSend(sendFake()); page = b.page;
    b.ctl.press('cross');
    expect(ids()).toEqual(['disc', 'pad', 'deploy', 'skipmenu', 'padsettings', 'send', 'share']);
    expect(launchCheckRows(b.A)).toBe(LAUNCH_CHECK_ROWS);
    const row = sendRow();
    expect(row.tagName).toBe('BUTTON');
    expect(row.dataset['i']).toBe(String(LAUNCH_SEND_ROW));
    expect(row.querySelector('.cx-r__label')!.textContent).toBe(SEND_ROW_LABEL);
    expect(panel()!.querySelector('[data-id="share"] .cx-r__label')!.textContent).toBe(SHARE_ROW_LABEL);
    const want = document.createElement('span');
    want.innerHTML = ico('upload');
    expect(row.querySelector('.cx-r__icon')!.innerHTML, 'the upload mark').toBe(want.innerHTML);
    expect(ico('upload')).not.toBe(ico('download'));
  });

  it('is absent without a share adapter (the overlay\'s, the sample\'s): five rows, the cursor stops at Controller settings', () => {
    const b = bootSend(undefined); page = b.page;
    b.ctl.press('cross');
    expect(ids()).toEqual(['disc', 'pad', 'deploy', 'skipmenu', 'padsettings']);
    expect(launchCheckRows(b.A)).toBe(LAUNCH_SEND_ROW);
    for (let k = 0; k < 8; k++) b.ctl.press('down');
    expect(focusedRow()).toBe('padsettings');
  });

  it('enabled when complete() answers true: its line, its tooltip (title) and the same text as its description; not muted', () => {
    const b = bootSend(sendFake(true)); page = b.page;
    toSendRow(b.ctl);
    expect(focusedRow()).toBe('send');
    const row = sendRow();
    expect(row.querySelector('.cx-r__hint')!.textContent).toBe(SEND_WORDS.ready.line);
    expect(row.getAttribute('title')).toBe(SEND_WORDS.ready.tip);
    expect(described(row)).toBe(SEND_WORDS.ready.tip);
    expect(document.getElementById(row.getAttribute('aria-describedby')!)!.classList.contains('sr-only'), 'visually hidden').toBe(true);
    expect(row.classList.contains('is-muted')).toBe(false);
    expect(row.hasAttribute('aria-disabled')).toBe(false);
    expect(word(b.ctl, 'cross')).toBe(SEND_ROW_VERB);
  });

  it('the plan\'s words, exactly', () => {
    expect(SEND_ROW_LABEL).toBe('Send Game Files');
    expect(SEND_WORDS.ready).toEqual({
      line: 'Make a link that copies your game files to another device',
      tip: 'Makes a link to the game files saved in this browser. Whoever opens it, on this network or anywhere else, asks you for a copy, and you say Yes beside the code they show. One copy at a time; keep this open while you share. Deploying stops sharing.',
    });
    expect(SEND_WORDS.none).toEqual({
      line: 'Add your disc first',
      tip: 'Needs your disc saved in this browser. Choose your disc with the disc mark (bottom left) and let it finish saving; then Send Game Files makes a link others can open to copy it.',
    });
    expect(SEND_WORDS.saving).toEqual({
      line: 'Your disc is still saving in this browser',
      tip: 'Send Game Files opens once your disc has finished saving in this browser: only a complete copy can be sent.',
    });
    expect(SEND_WORDS.part).toEqual({
      line: 'Only part of your disc is saved here',
      tip: 'Only part of your disc is saved in this browser. Choose your disc again to finish saving it, then send.',
    });
  });

  const disabled: [string, 'none' | 'saving' | 'part', Parameters<typeof bootSend>[1]][] = [
    ['no disc kept', 'none', { kept: null }],
    ['saving now', 'saving', { saving: true, kept: { whole: false } }],
    ['part kept, not saving', 'part', { kept: { whole: false } }],
  ];
  for (const [name, why, o] of disabled) {
    it(`disabled (${name}): muted but reached by the pad, its line and tooltip; Cross opens nothing and says the reason`, () => {
      const share = sendFake(false);
      const b = bootSend(share, o); page = b.page;
      toSendRow(b.ctl);
      expect(focusedRow(), 'still reached by the pad').toBe('send');
      const row = sendRow();
      expect(row.classList.contains('is-muted')).toBe(true);
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.querySelector('.cx-r__hint')!.textContent).toBe(SEND_WORDS[why].line);
      expect(row.getAttribute('title')).toBe(SEND_WORDS[why].tip);
      expect(described(row)).toBe(SEND_WORDS[why].tip);
      expect(word(b.ctl, 'cross'), 'no Cross prompt on a row that cannot send').toBeUndefined();
      b.ctl.press('cross');
      expect(share.calls).toEqual([]);
      expect(b.ctl.S.chk.send).toBeFalsy();
      expect(area()).toBeNull();
      expect(b.ctl.S.legendError).toBe(SEND_WORDS[why].line);
      expect(document.querySelector('#legend .cx-legend__error')!.textContent).toBe(SEND_WORDS[why].line);
    });

    it(`disabled (${name}): a click opens nothing either and says the reason`, () => {
      const share = sendFake(false);
      const b = bootSend(share, o); page = b.page;
      b.ctl.press('cross');
      click(sendRow());
      expect(share.calls).toEqual([]);
      expect(b.ctl.S.chk.send).toBeFalsy();
      expect(b.ctl.S.legendError).toBe(SEND_WORDS[why].line);
    });
  }

  it('an adapter without complete() (the stub, a screen\'s fake) reads as no disc: the row is disabled', () => {
    const b = bootSend(sendFake(true, { complete: false })); page = b.page;
    b.ctl.press('cross');
    expect(sendState(b.A)).toMatchObject({ ok: false, why: 'none' });
    expect(sendRow().classList.contains('is-muted')).toBe(true);
  });

  it('sendState: enabled on complete(), else saving, then part kept, then none', () => {
    const share = sendFake(true);
    const b = bootSend(share, { saving: true, kept: { whole: false } }); page = b.page;
    expect(sendState(b.A)).toEqual({ ok: true, why: 'ready', ...SEND_WORDS.ready });
    share.whole = false;
    expect(sendState(b.A)).toEqual({ ok: false, why: 'saving', ...SEND_WORDS.saving });
    b.A.disc.extracting = () => false;
    expect(sendState(b.A)).toEqual({ ok: false, why: 'part', ...SEND_WORDS.part });
    b.A.disc.kept = () => null;
    expect(sendState(b.A)).toEqual({ ok: false, why: 'none', ...SEND_WORDS.none });
  });

  it('the enabled Cross calls openHost once and widens the panel on the send area', () => {
    const share = sendFake(true);
    const b = bootSend(share); page = b.page;
    toSendRow(b.ctl);
    b.ctl.press('cross');
    expect(share.calls).toEqual(['openHost']);
    expect(b.ctl.S.chk).toMatchObject({ open: true, send: true, row: LAUNCH_SEND_ROW });
    expect(b.ctl.S.chk.share).toBeFalsy();
    expect(panel()!.classList.contains('is-share'), 'the wider panel').toBe(true);
    expect(panel()!.classList.contains('is-send')).toBe(true);
    expect(panel()!.querySelector('.cx-title')!.textContent).toBe(SEND_ROW_LABEL);
    expect(area()).not.toBeNull();
    expect(panel()!.querySelectorAll('.cx-r[data-id]'), 'the rows give way to the area').toHaveLength(0);
    b.ctl.press('cross');                                         // Cross in the area is its own (Copy link), not a second share
    expect(share.calls.filter((c) => c === 'openHost')).toHaveLength(1);
  });

  it('a click on the enabled row does the same', () => {
    const share = sendFake(true);
    const b = bootSend(share); page = b.page;
    b.ctl.press('cross');
    click(sendRow());
    expect(share.calls).toEqual(['openHost']);
    expect(b.ctl.S.chk.send).toBe(true);
    expect(area()).not.toBeNull();
  });

  it('"Request Game Files (XBOX)" still opens the receiver\'s area from its new place', () => {
    const share = sendFake(true);
    const b = bootSend(share); page = b.page;
    b.ctl.press('cross');
    for (let k = 0; k < 8 && focusedRow() !== 'share'; k++) b.ctl.press('down');
    expect(b.ctl.S.chk.row).toBe(LAUNCH_SHARE_ROW);
    b.ctl.press('cross');
    expect(share.calls).toEqual(['request']);
    expect(b.ctl.S.chk.share).toBe(true);
    expect(b.ctl.S.chk.send).toBeFalsy();
  });
});

/**
 * The review of agent/disc-send-row (2f, finding 3): the disabled row stays reachable by Tab -- a real button, never
 * `disabled` and never out of the tab order -- so a keyboard reaches it and hears its description.
 */
describe('DSH-10 review F3: Tab reaches the disabled row', () => {
  it('disabled, the row is still a focusable button in the panel\'s tab order, and takes the focus', () => {
    const b = bootSend(sendFake(false), { kept: null }); page = b.page;
    b.ctl.press('cross');
    const row = sendRow();
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.tagName).toBe('BUTTON');
    expect((row as HTMLButtonElement).disabled, 'not disabled: Tab would skip it').toBe(false);
    expect(row.hasAttribute('tabindex')).toBe(false);
    expect(row.tabIndex).toBe(0);
    const tabbable = [...panel()!.querySelectorAll<HTMLElement>('button, [tabindex]')].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled);
    expect(tabbable).toContain(row);
    expect(tabbable.indexOf(row), 'after Controller settings').toBe(tabbable.indexOf(panel()!.querySelector<HTMLElement>('[data-id="padsettings"]')!) + 1);
    row.focus();
    expect(document.activeElement).toBe(row);
    expect(described(row)).toBe(SEND_WORDS.none.tip);
  });
});
