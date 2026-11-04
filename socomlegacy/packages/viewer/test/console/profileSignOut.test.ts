// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { overlayHtml } from '../../src/console/render/overlay';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, OVERLAY_LOCK_WORDS, profileItems, type ConsolePageReads } from '../../src/console/state';

/**
 * LR-4 (the launcher redesign plan, the row "Profile": "Sign out (the confirm with 'forget this device'); the signed-out
 * and in-game lock lines kept"): held, not redrawn -- Profile's list is LR-1's item drawing (`render/home.ts`), the
 * confirm is `render/overlay.ts`'s. Signed in, Sign out last, its confirm No first, then Yes, then "forget this device"
 * when the session offers it (OT.R61), Yes-and-forget asking the session to forget; signed out, Sign in in its seat and
 * the Service record's own Sign in; over a game, the game's or the round's lock line on Sign out and on Profiles, the row
 * disabled and its act the lock's. A browser adaptation.
 */
function setup(o: { signed?: boolean; forgets?: boolean; page?: ConsolePageReads } = {}) {
  const A = sampleAdapters();
  let signed = o.signed ?? true;
  const signOut = vi.fn(async () => { signed = false; });
  A.session = { ...A.session, signedIn: () => signed, signOut, ...(o.forgets ? { forgets: () => true } : {}) };
  const S = createState(A);
  if (o.page) { S.mode = 'overlay'; S.page = o.page; }
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn() } as unknown as Host;
  const c = new ConsoleController(S, A, host);
  return { A, S, c, signOut };
}
const page = (holds: boolean, round: boolean): ConsolePageReads => ({ gameHolds: () => holds, roundRunning: () => round, gamePage: () => true } as ConsolePageReads);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Profile: Sign out and the lock lines, held (LR-4)', () => {
  it('signed in: the five rows in LR.R2\'s Profile order, Sign out last with its line and its act', () => {
    const { S, A } = setup();
    const it = profileItems(S, A);
    expect(it.map((x) => x.title)).toEqual(['Service record', 'Replays', 'Loadouts', 'Profiles', 'Sign out']);
    expect([it[4]!.sub, it[4]!.act, it[4]!.disabled ?? false]).toEqual(['Your memory card is not changed', 'signout', false]);
  });

  it('signed out: Sign in in Sign out\'s seat; the Service record asks to sign in', () => {
    const { S, A } = setup({ signed: false });
    const it = profileItems(S, A);
    expect([it[4]!.title, it[4]!.act]).toEqual(['Sign in', 'signin']);
    expect([it[0]!.sub, it[0]!.act]).toEqual(['Sign in to see your record', 'signin']);
  });

  it('the confirm: No first and focused, then Yes, then "forget this device" when offered; Yes-and-forget asks the session to forget', async () => {
    const { S, A, c, signOut } = setup({ forgets: true });
    c.doAct('signout');
    expect([S.overlay, S.confirmKind, S.confirmRow]).toEqual(['confirm', 'signout', 0]);
    const box = document.createElement('div');
    box.innerHTML = overlayHtml(S, A);
    expect([...box.querySelectorAll('[data-act="confirm"]')].map((b) => b.getAttribute('data-i'))).toEqual(['0', '1', '2']);
    expect(box.textContent).toMatch(/forget this device/i);
    c.press('down'); c.press('down');
    c.press('cross');
    await vi.advanceTimersByTimeAsync(0);
    expect(signOut).toHaveBeenCalledWith(true);
    expect(A.session.signedIn()).toBe(false);
  });

  it('no forget offered: the confirm has No and Yes only', () => {
    const { S, A, c } = setup();
    c.doAct('signout');
    const box = document.createElement('div');
    box.innerHTML = overlayHtml(S, A);
    expect(box.querySelectorAll('[data-act="confirm"]')).toHaveLength(2);
  });

  for (const [why, holds, round, out, persona] of [
    ['the game holds the account', true, false, OVERLAY_LOCK_WORDS.signOutGame, OVERLAY_LOCK_WORDS.personaGame],
    ['a round runs', false, true, OVERLAY_LOCK_WORDS.signOutRound, OVERLAY_LOCK_WORDS.personaRound],
  ] as const) {
    it(`over a game, ${why}: Sign out locked with its line and the lock's act; Profiles says why too; no confirm opens`, () => {
      const { S, A, c } = setup({ page: page(holds, round) });
      const it = profileItems(S, A);
      expect([it[4]!.icon, it[4]!.sub, it[4]!.disabled, it[4]!.act]).toEqual(['lock', out, true, `lock:${out}`]);
      expect([it[3]!.icon, it[3]!.sub]).toEqual(['lock', persona]);
      c.doAct(it[4]!.act);
      expect(S.overlay).toBeNull();
    });
  }
});
