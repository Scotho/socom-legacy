// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { headerHtml, serverMark } from '../../src/console/render/header';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters } from '../../src/console/state';

/**
 * LR-37 (5; the owner, 2026-10-29: "Add a status icon for Server status on the front page (subtle)."). A small, low-contrast
 * mark in the header's brand row, after the version badge, on Home only (since LR-39 the overlay's too): central's status as the
 * server adapter reads it (`status()`, the Server screen's tone rule: ready online, `alert: false` checking, else
 * unreachable), its words in its label. A browser adaptation.
 */
const withStatus = (st: ReturnType<Adapters['server']['status']>): Adapters => {
  const A = sampleAdapters();
  A.server = { ...A.server, status: () => st };
  return A;
};
const markOf = (html: string): HTMLElement | null => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.querySelector<HTMLElement>('.cx-srvmark');
};

describe('LR-37 (5): the front page\'s server status mark', () => {
  it('its three states: online, checking, unreachable', () => {
    expect(serverMark({ word: 'ONLINE', ready: true, line: 'Online' })).toBe('online');
    expect(serverMark({ word: 'CHECKING', ready: false, line: 'Checking the server…', alert: false })).toBe('checking');
    expect(serverMark({ word: 'OFFLINE', ready: false, line: 'The server does not answer' })).toBe('unreachable');
  });

  it('drawn on Home, its state a class and its words the label', () => {
    for (const [st, kind, word] of [
      [{ word: 'ONLINE', ready: true, line: 'Online' }, 'online', 'Online'],
      [{ word: 'CHECKING', ready: false, line: 'Checking the server…', alert: false }, 'checking', 'Checking'],
      [{ word: 'OFFLINE', ready: false, line: 'The server does not answer' }, 'unreachable', 'Unreachable'],
    ] as const) {
      const A = withStatus(st);
      const S = createState(A);
      const m = markOf(headerHtml(S, A))!;
      expect(m, kind).not.toBeNull();
      expect(m.classList.contains(`is-${kind}`)).toBe(true);
      expect(m.getAttribute('role')).toBe('img');
      expect(m.getAttribute('aria-label')).toBe(`Server status: ${word}`);
      expect(m.getAttribute('title')).toContain(st.line);
      expect(m.querySelector('.cx-srvmark__dot')).not.toBeNull();
      expect(m.querySelector('svg')).not.toBeNull();
    }
  });

  // LR-39 (LR.R32, the owner, 2026-10-31): the overlay's Home is the page's, so it carries the mark too (was: none over a game).
  it('not on another screen; on the overlay\'s Home over a game too (LR-39)', () => {
    const A = sampleAdapters();
    const S = createState(A);
    S.screen = 'options';
    expect(markOf(headerHtml(S, A))).toBeNull();
    S.screen = 'home';
    S.mode = 'overlay';
    expect(markOf(headerHtml(S, A))).not.toBeNull();
    S.screen = 'options';
    expect(markOf(headerHtml(S, A))).toBeNull();
  });
});
