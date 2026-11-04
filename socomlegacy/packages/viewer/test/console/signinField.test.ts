// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { NAME_ID, PASSWORD_ID } from '../../src/console/render/overlay';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { mountShell } from './shell';

/**
 * The sign-in dialog's real password field in a release build (the slice-1 review's F4): the keyboard map is a
 * development build's only (OT.R29), and in pad mode the render gives the focused on-screen key the document's focus,
 * so a physical key typed then must still reach the field. A printable key (or the field's own focus) switches the
 * dialog to field typing in every build; the field keeps the focus while the player types; a pad press hands it back to
 * the on-screen keyboard. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.useRealTimers(); });

/** A release build's page (no keymap), signed out, the sign-in dialog open in pad mode. */
function openInPadMode(): ConsolePage {
  const p = bootConsole(document, window, sampleAdapters(), { keymap: false });
  p.ctl.flipState(1);
  p.ctl.padPress('triangle');
  return p;
}
const field = (): HTMLInputElement => document.getElementById(PASSWORD_ID) as HTMLInputElement;

describe('field typing in the sign-in dialog, every build', () => {
  it('in pad mode the focused on-screen key has the focus; a printable key moves it to the real field', () => {
    page = openInPadMode();
    const key = document.activeElement as HTMLElement;
    expect(key.classList.contains('cx-osk__key')).toBe(true);
    key.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(document.activeElement).toBe(field());
    expect(page.ctl.S.si.typing).toBe(true);
  });

  it('what the field holds is the dialog\'s text, and the render keeps the field focused while typing', () => {
    page = openInPadMode();
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    field().value = 'hunter';
    field().dispatchEvent(new Event('input', { bubbles: true }));
    expect(page.ctl.S.si.text).toBe('hunter');
    expect(document.activeElement).toBe(field());
    expect(document.querySelector('.cx-field__box')!.textContent).toContain('••••••');
  });

  it('a pad press hands the focus back to the on-screen keyboard', () => {
    page = openInPadMode();
    field().focus();
    expect(page.ctl.S.si.typing).toBe(true);
    page.ctl.padPress('down');
    expect(page.ctl.S.si.typing).toBe(false);
    expect((document.activeElement as HTMLElement).classList.contains('cx-osk__key')).toBe(true);
    expect([page.ctl.S.si.kr, page.ctl.S.si.kc]).toEqual([2, 4]);
  });

  it('a modified key or Space before typing has begun stays the page\'s', () => {
    page = openInPadMode();
    const key = document.activeElement as HTMLElement;
    key.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    key.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(document.activeElement).toBe(key);
    expect(page.ctl.S.si.typing).toBe(false);
  });

  it('a submit of its form (a password manager\'s) signs the dialog in; Enter is CX-24\'s, below', async () => {
    page = openInPadMode();
    field().focus();
    field().value = 'pw';
    field().dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('form[data-form="signin"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(page.ctl.S.si.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(900);
    expect(page.ctl.S.overlay).toBeNull();
    expect(page.ctl.S.toast).toBe('Signed in as SPECTER');
  });
});

/**
 * CX-24 (the merge controller's MU2-9 spec run, 2026-10-13): the dialog sends the name and the word from every path the
 * modern UI's own sign-in has (`src/modern/signIn.ts`: a form, so Enter in a field submits it). The pad's paths -- Cross
 * on the keyboard's SIGN IN key, R2, OPTIONS -- and a development build's Enter on that key (the keyboard map's Cross)
 * already sent. Enter in the real field did not: the keyboard map leaves the fields to type natively, and the form holds
 * two text fields and no submit button, which the HTML standard's implicit submission refuses, so a browser sent nothing.
 * The keyboard layer now takes Enter in the field, in every build (the field types natively in every build, CX.R6).
 * jsdom has no implicit submission, so these presses are the layer's own. A browser adaptation with no original (OT.R28).
 */
describe('CX-24: the sign-in sends the name and the word', () => {
  /** A page signed out with the dialog open in pad mode; `signIn` spied. */
  function open(keymap: boolean, live = false) {
    const a = sampleAdapters();
    const sent = vi.fn(a.session.signIn.bind(a.session));
    a.session.signIn = sent;
    const p = bootConsole(document, window, live ? { ...a, data: 'live' } : a, { keymap });
    p.ctl.flipState(1);
    p.ctl.padPress('triangle');
    return { p, sent };
  }
  const typeWord = (word: string): void => {
    field().focus();
    field().value = word;
    field().dispatchEvent(new Event('input', { bubbles: true }));
  };
  const enter = (el: HTMLElement): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  async function signedIn(p: ConsolePage): Promise<void> {
    await vi.advanceTimersByTimeAsync(900);
    expect(p.ctl.S.overlay).toBeNull();
    expect(p.ctl.S.toast).toBe('Signed in as SPECTER');
  }

  it('the pad: Cross on the SIGN IN key sends (already so)', async () => {
    const { p, sent } = open(false);
    page = p;
    typeWord('pw');
    p.ctl.S.si.kr = 4; p.ctl.S.si.kc = 3;
    p.ctl.padPress('cross');
    // The third argument is "Remember me" (PERSONA-PERSIST (a), OT.R61): false where the session offers none, as here.
    expect(sent).toHaveBeenCalledWith('SPECTER', 'pw', false);
    await signedIn(p);
  });

  it('the pad: R2 and OPTIONS send (already so)', async () => {
    for (const b of ['r2', 'options'] as const) {
      const { p, sent } = open(false);
      page = p;
      typeWord('pw');
      p.ctl.padPress(b);
      expect(sent).toHaveBeenCalledWith('SPECTER', 'pw', false);
      await signedIn(p);
      p.dispose(); page = null;
      mountShell(document);
    }
  });

  it('a development build: Enter on the focused SIGN IN key sends, through the keyboard map (already so)', async () => {
    const { p, sent } = open(true);
    page = p;
    typeWord('pw');
    p.ctl.padPress('down');                                         // the focus back on the on-screen keyboard
    p.ctl.S.si.kr = 4; p.ctl.S.si.kc = 3;
    p.render();
    const key = document.activeElement as HTMLElement;
    expect(key.classList.contains('is-done')).toBe(true);
    enter(key);
    expect(sent).toHaveBeenCalledWith('SPECTER', 'pw', false);
    await signedIn(p);
  });

  it('Enter in the real password field sends, a release build', async () => {
    const { p, sent } = open(false);
    page = p;
    typeWord('pw');
    const e = enter(field());
    expect(e.defaultPrevented).toBe(true);
    expect(sent).toHaveBeenCalledWith('SPECTER', 'pw', false);
    expect(sent).toHaveBeenCalledTimes(1);
    await signedIn(p);
  });

  it('Enter in the real password field sends, a development build (the keyboard map leaves the field alone)', async () => {
    const { p, sent } = open(true);
    page = p;
    typeWord('pw');
    enter(field());                                                  // bubbles to the window's map, which leaves it: no Cross typed
    expect(sent).toHaveBeenCalledWith('SPECTER', 'pw', false);
    expect(sent).toHaveBeenCalledTimes(1);
    await signedIn(p);
  });

  it('Enter in an empty password field asks for the word, as SIGN IN does; nothing is sent', () => {
    const { p, sent } = open(false);
    page = p;
    field().focus();
    enter(field());
    expect(sent).not.toHaveBeenCalled();
    expect(p.ctl.S.si.error).toBe('Enter the password for SPECTER.');
  });

  it('Add new: Enter in the name field moves to the password field; Enter there sends the name and the word', async () => {
    const { p, sent } = open(false, true);
    page = p;
    p.ctl.S.si.persona = 1; p.ctl.S.si.target = 'name';
    p.render();
    const name = document.getElementById(NAME_ID) as HTMLInputElement;
    name.focus();
    name.value = 'GHOST';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    enter(name);
    expect(sent).not.toHaveBeenCalled();
    expect(p.ctl.S.si.target).toBe('password');
    expect(document.activeElement).toBe(field());
    typeWord('pw');
    enter(field());
    expect(sent).toHaveBeenCalledWith('GHOST', 'pw', false);
  });

  it('the batch review F1: a held Enter (the key\'s repeats) neither moves on from the name nor sends again', async () => {
    const { p, sent } = open(false, true);
    page = p;
    p.ctl.S.si.persona = 1; p.ctl.S.si.target = 'name';
    p.render();
    const name = document.getElementById(NAME_ID) as HTMLInputElement;
    name.focus();
    name.value = 'GHOST';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    enter(name);                                                             // the press: on to the password
    expect(document.activeElement).toBe(field());
    field().value = 'pw';                                                    // a password manager's fill
    field().dispatchEvent(new Event('input', { bubbles: true }));
    const held = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true });
    field().dispatchEvent(held);                                             // the held key's repeat lands on the password
    expect(sent).not.toHaveBeenCalled();
    expect(held.defaultPrevented).toBe(true);
    enter(field());                                                          // a second press sends
    expect(sent).toHaveBeenCalledWith('GHOST', 'pw', false);
  });

  it('Enter while the dialog is sending sends nothing more', () => {
    const { p, sent } = open(false);
    page = p;
    typeWord('pw');
    enter(field());
    enter(field());
    expect(sent).toHaveBeenCalledTimes(1);
  });
});
