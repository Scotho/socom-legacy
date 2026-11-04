// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showPageLine } from '../src/pageLine';
import { UPDATE_NOTICE_GAME_FADE_ADAPTATION } from '../src/pwa/update';

/**
 * LATER 67 (a browser adaptation): the page's one-line notice in the update notice's form -- a role=status toast,
 * centred above the legend, over the front end's canvas and the loading screen -- hidden in a match, gone after LATER
 * 187's fade (`UPDATE_NOTICE_GAME_FADE_ADAPTATION`).
 */
describe('LATER 67: the page line', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.replaceChildren(); });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as { __frontEnd?: unknown }).__frontEnd;
  });
  const line = (): HTMLElement | null => document.querySelector('[data-page-line]');

  it('shows the words as a status, over the game page', () => {
    showPageLine(document, 'CHECK DISC: gone');
    const el = line()!;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toBe('CHECK DISC: gone');
    expect(Number(el.style.zIndex)).toBeGreaterThan(19000);           // over the loading screen, as the update notice
    expect(el.hidden).toBe(false);
  });

  it('the review\'s F3: above the update notice when that shows, never over its Restart and Later', () => {
    showPageLine(document, 'alone');
    const alone = line()!.style.bottom;
    const notice = document.createElement('div');
    notice.setAttribute('data-pwa-update', '');
    document.body.append(notice);
    showPageLine(document, 'with the notice');
    expect(line()!.style.bottom).not.toBe(alone);
    notice.hidden = true;
    showPageLine(document, 'the notice hidden');
    expect(line()!.style.bottom).toBe(alone);
  });

  it('one at a time: a second line replaces the first', () => {
    showPageLine(document, 'one');
    showPageLine(document, 'two');
    expect(document.querySelectorAll('[data-page-line]').length).toBe(1);
    expect(line()!.textContent).toBe('two');
  });

  it('gone after the fade, the same seconds as the update notice\'s on the game page (LATER 187)', () => {
    showPageLine(document, 'x');
    vi.advanceTimersByTime(UPDATE_NOTICE_GAME_FADE_ADAPTATION * 1000 - 100);
    expect(line()).not.toBeNull();
    vi.advanceTimersByTime(1200);
    expect(line()).toBeNull();
  });

  it('hidden while a match runs', () => {
    (window as { __frontEnd?: unknown }).__frontEnd = { session: { match: { phase: 'match' } } };
    showPageLine(document, 'x');
    expect(line()!.hidden).toBe(true);
    (window as { __frontEnd?: unknown }).__frontEnd = { session: { match: { phase: 'menus' } } };
    vi.advanceTimersByTime(1000);
    expect(line()!.hidden).toBe(false);
  });
});
