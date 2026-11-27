import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANNED_PERMANENT_ADAPTATION, banWords } from '@s2u/ui';
import { BAN_TOAST_MS_ADAPTATION, ConsoleController, TOAST_MS, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type QuickSignIn } from '../../src/console/state';
import { value } from './cascade';

/**
 * OPS-Q1 (product track, a browser adaptation: the console's quick sign-in has no original; the main controller's ruling
 * of 2026-11-15): a BANNED quick sign-in (-972, `../../src/console/adapters/session` answers it `banned`) opens no dialog
 * -- the ban's words (ui `screens/banWords.ts`, handed over as the refusal's `error`) are the console's toast for
 * `BAN_TOAST_MS_ADAPTATION`, replaced by the next toast as any toast is, the session left signed out. Every other refusal
 * (-998 no such account; -978 the cookie gone, the password asked) opens the sign-in dialog as before. Names invented.
 */
function setup(answer: QuickSignIn) {
  const A = sampleAdapters();
  A.session = {
    signedIn: () => false,
    persona: () => '',
    async signIn() { return { ok: false, error: 'not asked' }; },
    async signOut() { /* not asked */ },
    quick: async () => answer,
  };
  const S = createState(A);
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() };
  const c = new ConsoleController(S, A, host);
  return { A, S, c };
}

/** The quick sign-in's promise chain settled (fake timers: microtasks only). */
const settle = () => vi.advanceTimersByTimeAsync(0);

const TIMED = banWords({ until: Date.UTC(2026, 10, 15, 2, 30), reason: 'invented reason' }, () => -300);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("OPS-Q1: the quick sign-in of a banned account", () => {
  for (const [form, words] of [['permanent', BANNED_PERMANENT_ADAPTATION], ['timed, with a public reason', TIMED]] as const) {
    it("no dialog; the " + form + " ban words are the toast for 20 s; the session stays signed out", async () => {
      const { S, A, c } = setup({ ok: false, persona: 'KILO', error: words, askPassword: false, banned: true });
      const si = { ...S.si };                                        // the fresh sign-in state: nothing set on it
      c.quickSignIn();
      await settle();
      expect(S.overlay).toBeNull();
      expect(S.toast).toBe(words);
      expect(S.si).toEqual(si);                                      // no persona chosen, no keyboard at the password, no error
      expect(S.si.error).toBe('');
      expect(A.session.signedIn()).toBe(false);
      await vi.advanceTimersByTimeAsync(BAN_TOAST_MS_ADAPTATION - 100);
      expect(S.toast).toBe(words);
      await vi.advanceTimersByTimeAsync(100);
      expect(S.toast).toBe('');
      expect(S.overlay).toBeNull();
    });
  }

  it("the timed form keeps the reason on its own line", () => {
    expect(TIMED).toMatch(/\nReason: invented reason$/);
  });

  it("the adaptation is 20 seconds", () => {
    expect(BAN_TOAST_MS_ADAPTATION).toBe(20_000);
  });

  it("the ban toast is replaced by the next toast, which goes after TOAST_MS", async () => {
    const { S, c } = setup({ ok: false, persona: 'KILO', error: BANNED_PERMANENT_ADAPTATION, askPassword: false, banned: true });
    c.quickSignIn();
    await settle();
    c.toast('next words');
    expect(S.toast).toBe('next words');
    await vi.advanceTimersByTimeAsync(TOAST_MS);
    expect(S.toast).toBe('');
  });

  it("a ban answer arriving while another dialog is open is shown once it closes, with no sign-in dialog", async () => {
    const { S, c } = setup({ ok: false, persona: 'KILO', error: BANNED_PERMANENT_ADAPTATION, askPassword: false, banned: true });
    c.doAct('news');
    c.quickSignIn();
    await settle();
    expect(S.overlay).toBe('news');
    expect(S.toast).toBe('');
    c.press('circle');
    expect(S.overlay).toBeNull();
    expect(S.toast).toBe(BANNED_PERMANENT_ADAPTATION);
    c.render();
    expect(S.overlay).toBeNull();
  });
});

describe("OPS-Q1: every other quick refusal opens the sign-in dialog as before", () => {
  it("-998 (no such account): the dialog, the persona chosen, the keyboard at the password, the words", async () => {
    const { S, c } = setup({ ok: false, persona: 'SPECTER', error: 'No account by that name', askPassword: false });
    c.quickSignIn();
    await settle();
    expect(S.overlay).toBe('signin');
    expect(S.si.persona).toBe(0);
    expect([S.si.zone, S.si.target, S.si.kr, S.si.kc]).toEqual(['keys', 'password', 1, 0]);
    expect(S.si.error).toBe('No account by that name');
    expect(S.toast).toBe('');
  });

  it("-978 (the cookie gone): the dialog on Add new with the name, the keyboard at the password, the words", async () => {
    const error = 'This browser no longer remembers KILO. Enter its password.';
    const { S, c } = setup({ ok: false, persona: 'KILO', error, askPassword: true });
    c.quickSignIn();
    await settle();
    expect(S.overlay).toBe('signin');
    expect([S.si.persona, S.si.name]).toEqual([1, 'KILO']);
    expect([S.si.zone, S.si.target, S.si.kr, S.si.kc]).toEqual(['keys', 'password', 1, 0]);
    expect(S.si.error).toBe(error);
    expect(S.toast).toBe('');
  });
});

describe("OPS-Q1: an ordinary toast", () => {
  it("still goes after TOAST_MS", async () => {
    const { S, c } = setup({ ok: false, persona: 'SPECTER', error: 'unused', askPassword: false });
    c.toast('Disc ready');
    await vi.advanceTimersByTimeAsync(TOAST_MS - 1);
    expect(S.toast).toBe('Disc ready');
    await vi.advanceTimersByTimeAsync(1);
    expect(S.toast).toBe('');
  });
});

describe("OPS-Q1: the ban reason keeps its line where it is shown", () => {
  it("the toast and the sign-in's error keep line breaks (white-space: pre-line)", () => {
    expect(value(['body .cx-toast'], 'white-space', 1280)).toBe('pre-line');
    expect(value(['.cx-field__error'], 'white-space', 1280)).toBe('pre-line');
  });
});
