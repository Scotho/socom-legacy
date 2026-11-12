// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { remapAdapter } from '../../src/console/adapters/remap';
import { extractStart, type ExtractAct, type ExtractView } from '../../src/console/render/extract';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { remapActionRow, REMAP_ROW, type Adapters, type ConsoleState } from '../../src/console/state';
import { PadBinding } from '../../src/padBinding';
import { HOLD_TO_BIND_MS_ADAPTATION } from '../../src/padLayout';
import { mountShell } from './shell';

/**
 * MODAL-CLOSE (the console launcher plan; the owner, 2026-10-17: "all modal popups (SERVER NEWS, SIGN IN, etc) all need
 * a close button and escape functionality to close it"; MISSION OT.R62: Escape closes a popup in every build). Every
 * dialog the console draws over its stage -- on the launcher and in the overlay, which is the console -- has a visible
 * close button in its head ("×", `aria-label="Close"`) that does what Circle does there (on a confirm: No, the safe
 * answer), closes on the pad's Circle with the focus back on the control that opened it, and closes on Escape in a
 * release build as in a development one. With no dialog open Escape is not read; every other key stays a development
 * build's only (OT.R29). A browser adaptation with no original (OT.R28, OT.R53: the product track).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

/** One modal of the inventory: how it is opened (from Home), and what its Circle leaves (`closed`). */
interface Modal { kind: string; open(S: ConsoleState, ctl: ConsolePage['ctl']): void; closed(S: ConsoleState): boolean }
const confirm = (kind: ConsoleState['confirmKind']) => (S: ConsoleState): void => { S.overlay = 'confirm'; S.confirmKind = kind; S.confirmRow = 0; };
const shut = (S: ConsoleState): boolean => S.overlay === null;
/** The inventory's modals the sample adapters draw (the conflict, the extraction and the viewer have their own cases below). */
const MODALS: readonly Modal[] = [
  { kind: 'signin', open: (_S, ctl) => { ctl.openSignIn(); }, closed: shut },
  { kind: 'news', open: (_S, ctl) => { ctl.doAct('news'); }, closed: shut },
  { kind: 'search', open: (_S, ctl) => { ctl.openSearch(); }, closed: shut },
  { kind: 'field', open: (S) => { S.overlay = 'field'; S.fd = { target: { kind: 'new-name' }, text: '', kr: 1, kc: 0, shift: false, typing: false, error: '' }; }, closed: shut },
  { kind: 'states', open: (S) => { S.overlay = 'states'; S.states.row = 0; }, closed: shut },
  { kind: 'launch', open: (S) => { S.overlay = 'launch'; S.start = 'launching'; }, closed: (S) => S.overlay === null && S.start === 'idle' },
  { kind: 'confirm-signout', open: confirm('signout'), closed: shut },
  { kind: 'confirm-kept', open: confirm('kept'), closed: shut },
  { kind: 'confirm-restore', open: confirm('restore'), closed: shut },
  { kind: 'confirm-loadout-leave', open: confirm('loadout-leave'), closed: shut },
  { kind: 'confirm-loadout-defaults', open: confirm('loadout-defaults'), closed: shut },
  { kind: 'confirm-persona-delete', open: confirm('persona-delete'), closed: shut },
  // The agreement's Circle is Decline's question (the original's dlgUsagePolicy); Decline's No goes back to the agreement.
  { kind: 'agreement', open: (S) => { S.overlay = 'agreement'; S.ag = { row: 0, scroll: 0, text: '' }; }, closed: (S) => S.overlay === 'confirm' && S.confirmKind === 'decline' },
  { kind: 'confirm-decline', open: confirm('decline'), closed: (S) => S.overlay === 'agreement' },
];

function boot(a: Adapters = sampleAdapters(), keymap = true): ConsolePage['ctl'] {
  page = bootConsole(document, window, a, { keymap });
  return page.ctl;
}
const closeButton = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('#overlay [aria-label="Close"]');
const stageFocused = (): HTMLElement => document.querySelector<HTMLElement>('#stage .is-focused')!;
const escape = (target: EventTarget = document.activeElement ?? document): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
/** Opens `m` in pointer mode with Home's focused item holding the document's focus first (the control that opened it). */
function openFromHome(ctl: ConsolePage['ctl'], m: Modal): HTMLElement {
  ctl.render();
  const opener = stageFocused();
  opener.focus();
  m.open(ctl.S, ctl);
  ctl.render();
  return opener;
}

describe('MODAL-CLOSE: each modal of the inventory', () => {
  for (const m of MODALS) {
    describe(m.kind, () => {
      it('has a visible close button in its head, labelled Close, that does what Circle does; the focus back on its opener', () => {
        const ctl = boot();
        const opener = openFromHome(ctl, m);
        const x = closeButton();
        expect(x, 'the close button').not.toBeNull();
        expect(x!.tagName).toBe('BUTTON');
        expect(x!.textContent!.trim()).toBe('×');
        expect(x!.closest('.cx-dialog__head, .cx-launch__head'), 'in the dialog\'s head').not.toBeNull();
        x!.focus();                                                  // a click gives the button the focus first
        x!.click();
        expect(m.closed(ctl.S), `${m.kind}: the close button is Circle`).toBe(true);
        if (ctl.S.overlay === null) expect(document.activeElement).toBe(opener);
      });

      it('closes on the pad\'s Circle, the focus back on its opener', () => {
        const ctl = boot();
        ctl.S.input = 'pad';
        const opener = openFromHome(ctl, m);
        ctl.padPress('circle');
        expect(m.closed(ctl.S)).toBe(true);
        if (ctl.S.overlay === null) expect(document.activeElement).toBe(opener);
      });

      for (const dev of [true, false]) {
        it(`closes on Escape in a ${dev ? 'development' : 'release'} build (OT.R62), as Circle does, and the key goes no further`, () => {
          vi.stubEnv('DEV', dev);
          const ctl = boot(sampleAdapters(), dev);
          const opener = openFromHome(ctl, m);
          closeButton()?.focus();                                    // the focus in the dialog, as a player's would be
          const below = vi.fn();
          window.addEventListener('keydown', below);
          const e = escape();
          window.removeEventListener('keydown', below);
          expect(m.closed(ctl.S), `${m.kind}: Escape is Circle`).toBe(true);
          expect(e.defaultPrevented).toBe(true);
          expect(below).not.toHaveBeenCalled();                      // not the page's, nor the keymap's second Circle
          if (ctl.S.overlay === null) expect(document.activeElement).toBe(opener);
        });
      }
    });
  }
});

describe('MODAL-CLOSE: the modals drawn over their own adapters', () => {
  it('the extraction\'s popover: its close button and Escape (a release build) are Circle -- the run cancelled, what is done kept', () => {
    vi.stubEnv('DEV', false);
    const acts: ExtractAct[] = [];
    let view: ExtractView | null = { ...extractStart(), phase: 'copy', file: 'DATA/A.ZDB', count: 4, done: 1 };
    const sample = sampleAdapters();
    const a: Adapters = { ...sample, disc: { ...sample.disc, extract: () => view, extractAct: (act) => { acts.push(act); } } };
    const ctl = boot(a, false);
    expect(ctl.S.overlay).toBe('extract');
    closeButton()!.click();
    expect(acts).toEqual(['cancel']);
    escape();
    expect(acts).toEqual(['cancel', 'cancel']);
    view = null;
    ctl.render();
    expect(ctl.S.overlay).toBeNull();
  });

  it('the button mapping\'s conflict: its close button and Escape are Cancel; the screen listening for a button is not a modal', () => {
    vi.stubEnv('DEV', false);
    const pad = { index: 0, id: 'Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })) };
    const hold = (...down: number[]): void => { pad.buttons.forEach((b, i) => { b.pressed = down.includes(i); b.value = b.pressed ? 1 : 0; }); };
    let t = 10_000;
    const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => [pad] }, now: () => t }));
    const ctl = boot({ ...sampleAdapters(), remap }, false);
    ctl.doAct('opt:controller');
    ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
    ctl.press('cross');
    expect(ctl.S.screen).toBe('remap');
    ctl.remapFrame(t += 16);
    ctl.S.rm.row = remapActionRow() + 4;                         // L1's row (STANCE-TOP: the Stance mode is row 0)
    ctl.press('cross');                                          // listening: no modal, Escape not read
    expect(ctl.capturing()).toBe(true);
    const e = escape(document);
    expect(e.defaultPrevented).toBe(false);
    expect(ctl.S.screen).toBe('remap');
    hold(); ctl.remapFrame(t += 16);
    hold(7); ctl.remapFrame(t += 16); ctl.remapFrame(t += HOLD_TO_BIND_MS_ADAPTATION);   // L1 to R2's button, held (LATER 380): the question
    hold();
    expect([ctl.S.overlay, ctl.S.confirmKind]).toEqual(['confirm', 'conflict']);
    closeButton()!.click();
    expect(ctl.S.overlay).toBeNull();
    ctl.S.rm.row = remapActionRow() + 4;                         // L1's row (STANCE-TOP: the Stance mode is row 0)
    ctl.press('cross');
    hold(); ctl.remapFrame(t += 16);
    hold(7); ctl.remapFrame(t += 16); ctl.remapFrame(t += HOLD_TO_BIND_MS_ADAPTATION);
    hold();
    expect(ctl.S.confirmKind).toBe('conflict');
    escape();
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.screen).toBe('remap');
  });

  it('the disc source dropdown (a popup on Home, no dialog): Escape closes it as Circle does, in a release build', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    ctl.toggleSource();                                                // LR-23: the legend chip's cog (was: on Play's panel's disc check)
    ctl.render();
    expect(ctl.S.src.open).toBe(true);
    const e = escape(document);
    expect(e.defaultPrevented).toBe(true);
    expect(ctl.S.src.open).toBe(false);
  });
});

describe('MODAL-CLOSE: Escape alone, and only while a modal is open (OT.R62; every other key OT.R29\'s)', () => {
  it('a release build with no modal open: Escape is the menu back (LR-30, LR.R24; was: not read) -- on Home it changes nothing', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    ctl.press('right');
    ctl.press('down');
    const before = JSON.stringify([ctl.S.screen, ctl.S.cat, ctl.S.item, ctl.S.overlay]);
    const e = escape(document);
    expect(e.defaultPrevented).toBe(true);                         // read as the menu's back, in the window's keymap
    expect(JSON.stringify([ctl.S.screen, ctl.S.cat, ctl.S.item, ctl.S.overlay])).toBe(before);
  });

  it('a release build with no modal open on a pushed screen: Escape goes back (LR-30, LR.R24; was: the screens are not popups)', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    ctl.doAct('rooms');
    ctl.render();
    expect(ctl.S.screen).toBe('rooms');
    escape(document);
    expect(ctl.S.screen).toBe('home');
  });

  it('a release build with the sign-in open: p, o and F9 stay unread; the menu keys act as the pad (LR-30), none starts a launch', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    ctl.openSignIn();
    ctl.S.si.text = 'ab';
    ctl.render();
    for (const key of ['ArrowRight', 'ArrowDown', 'Enter', 'Backspace', 'p', 'o', 'F9']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
    // Was: no key moved anything. ArrowRight and ArrowDown move the key grid from (1, 4) to (2, 5) as the pad's d-pad does; Enter types the key there and Backspace deletes it, so the text is as it began.
    expect([ctl.S.overlay, ctl.S.si.persona, ctl.S.si.zone, ctl.S.si.kr, ctl.S.si.kc, ctl.S.si.busy, ctl.S.si.text, ctl.S.start]).toEqual(['signin', 0, 'keys', 2, 5, false, 'ab', 'idle']);
    escape(document);
    expect(ctl.S.overlay).toBeNull();
  });

  it('a held Escape closes one layer only: Decline\'s question back to the agreement, the repeat not a second Circle', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    confirm('decline')(ctl.S);
    ctl.render();
    escape(document);
    expect(ctl.S.overlay).toBe('agreement');
    const r = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', repeat: true, bubbles: true, cancelable: true });
    document.dispatchEvent(r);
    expect(ctl.S.overlay).toBe('agreement');
    expect(r.defaultPrevented).toBe(true);
  });

  it('a modified Escape (Ctrl, Alt, Meta) is not read', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    ctl.openSignIn();
    ctl.render();
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ctrlKey: mod === 'ctrlKey', altKey: mod === 'altKey', metaKey: mod === 'metaKey' });
      document.dispatchEvent(e);
      expect(e.defaultPrevented, mod).toBe(false);
    }
    expect(ctl.S.overlay).toBe('signin');
  });

  it('the Escape listener is detached with the page (and at the hand-over\'s suspend)', () => {
    vi.stubEnv('DEV', false);
    const ctl = boot(sampleAdapters(), false);
    ctl.openSignIn();
    ctl.render();
    page!.dispose();
    page = null;
    escape(document);
    expect(ctl.S.overlay).toBe('signin');
  });
});
