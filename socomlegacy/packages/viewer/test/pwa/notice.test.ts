// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showUpdateNotice, UPDATE_NOTICE_GAME_FADE_ADAPTATION } from '../../src/pwa/update';

/**
 * CX.R18's notice on the game page (the joint review of #353 and the hold, F1 and its low). A browser adaptation.
 * The front end's canvas and the match's are fixed full-window layers at z-index 1000 (`../../src/frontEnd.ts`,
 * `../../src/matchMount.ts`), the loading screen 19000 (`styles.css`): a toast under them is never seen. And a match the
 * front end starts changes neither the body's class nor `data-console`, so the toast re-checks on a timer too.
 */
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as unknown as { __frontEnd?: unknown }).__frontEnd;
});

const toast = (): HTMLElement => document.querySelector<HTMLElement>('[data-pwa-update]')!;

describe('CX.R18: the update notice over the game page', () => {
  it('stacks above the front end\'s and the match\'s canvas (1000) and the loading screen (19000)', () => {
    showUpdateNotice(document, { restart() {} });
    expect(Number(toast().style.zIndex)).toBeGreaterThan(19000);
  });

  it('a front-end match starting hides it within a second, and its end shows it again', () => {
    vi.useFakeTimers();
    showUpdateNotice(document, { restart() {} });
    expect(toast().hidden).toBe(false);
    (window as unknown as { __frontEnd: unknown }).__frontEnd = { session: { match: { phase: 'match' } } };
    vi.advanceTimersByTime(1100);
    expect(toast().hidden).toBe(true);
    (window as unknown as { __frontEnd: unknown }).__frontEnd = { session: { match: { phase: 'ended' } } };
    vi.advanceTimersByTime(1100);
    expect(toast().hidden).toBe(false);
  });
});

/**
 * LATER 187 (the merge controller's call, product taste): on the game page a controller-only player cannot answer the
 * toast (Restart and Later take a pointer), so it fades out by itself after `UPDATE_NOTICE_GAME_FADE_ADAPTATION` seconds
 * and comes back at the next menu (the front end's dialog changes). No pad binding. The launcher keeps it up.
 */
describe('LATER 187: the notice on the game page fades, and comes back at the next menu', () => {
  const frontEnd = (dialog: { name: string }) => ({ session: { machine: { shell: () => ({ currentName: dialog.name }) } } });

  it('fades after the adaptation\'s seconds on the game page; the next dialog shows it again, and it fades again', () => {
    vi.useFakeTimers();
    const dialog = { name: 'dlgMultiPlayerMain.rdr' };
    (window as unknown as { __frontEnd: unknown }).__frontEnd = frontEnd(dialog);
    showUpdateNotice(document, { restart() {} });
    expect(toast().hidden).toBe(false);
    vi.advanceTimersByTime(UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000 + 1100);
    expect(toast().hidden, 'faded').toBe(true);
    dialog.name = 'dlgNetLogin.rdr';
    vi.advanceTimersByTime(1100);
    expect(toast().hidden, 'back at the next menu').toBe(false);
    vi.advanceTimersByTime(UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000 + 1100);
    expect(toast().hidden, 'faded again').toBe(true);
  });

  it("its review's F3: a match's end is the next menu -- the faded notice comes back when the match returns to the same dialog", () => {
    vi.useFakeTimers();
    const hook = { session: { match: { phase: 'idle' }, machine: { shell: () => ({ currentName: 'dlgGameRoom.rdr' }) } } };
    (window as unknown as { __frontEnd: unknown }).__frontEnd = hook;
    showUpdateNotice(document, { restart() {} });
    vi.advanceTimersByTime(UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000 + 1100);
    expect(toast().hidden, 'faded in the room').toBe(true);
    hook.session.match.phase = 'match';
    vi.advanceTimersByTime(1100);
    expect(toast().hidden, 'hidden in the match').toBe(true);
    hook.session.match.phase = 'ended';                               // back to the same room dialog
    vi.advanceTimersByTime(1100);
    expect(toast().hidden, 'back after the match').toBe(false);
  });

  it('on the launcher (no front end) it stays up', () => {
    vi.useFakeTimers();
    showUpdateNotice(document, { restart() {} });
    vi.advanceTimersByTime(60_000);
    expect(toast().hidden).toBe(false);
  });
});
