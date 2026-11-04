// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { THEMES } from '../../src/console/render/theme';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, homeItems, type ConsolePageReads } from '../../src/console/state';
import { mountShell } from './shell';

/**
 * FWIP (the owner, 2026-10-31: "please add a WIP label to the forge on the launcher"): the Experiments list's Forge row
 * carries the tag WIP in place of EXPERIMENT (redundant under the Experiments category; the controller's taste call),
 * drawn with the existing item tag (`is-tag`, `has-tag`, LR-20 P12). The launcher draws one Home for the page and the
 * Guide overlay (LR.R32: `is-page` in both modes), under each of its themes (LR-5): each case checks its theme is the
 * one applied and the tag drawn under it. The tag's readability holds by construction -- the same element with the same
 * classes as the EXPERIMENT tag before it, which no theme styles apart -- not by this test. A browser adaptation:
 * nothing of the game.
 */

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); vi.useRealTimers(); });

const reads = (): ConsolePageReads => ({ gameHolds: () => false, roundRunning: () => false, gamePage: () => true });

function forgeRow(mode: 'page' | 'overlay', theme: number): HTMLElement {
  const a = sampleAdapters();
  a.options.set('theme', theme);
  page = bootConsole(document, window, a, { keymap: true, mode, ...(mode === 'overlay' ? { page: reads() } : {}) });
  page.ctl.doAct('cat:experiments');
  page.render();
  const row = [...document.querySelectorAll<HTMLElement>('#stage .cx-home .cx-item')]
    .find((x) => x.querySelector('.cx-item__title')?.textContent === 'Forge');
  expect(row, `${mode}, theme ${theme}: the Forge row`).toBeDefined();
  return row!;
}

describe('FWIP: the Forge row is tagged WIP', () => {
  it('the Experiments item carries the WIP tag and no EXPERIMENT', () => {
    const a = sampleAdapters();
    page = bootConsole(document, window, a, { keymap: true });
    const forge = homeItems('experiments', page.ctl.S, a).find((x) => x.title === 'Forge')!;
    expect(CATS.find((c) => c.id === 'experiments')?.label).toBe('Experiments');
    expect(forge.state).toEqual(['WIP', 'tag']);
  });

  for (const mode of ['page', 'overlay'] as const) {
    THEMES.forEach((t, i) => {
      it(`${mode}, the ${t.label} theme: WIP follows the title as the item's tag; EXPERIMENT is drawn nowhere on the row`, () => {
        const row = forgeRow(mode, i);
        expect(document.documentElement.dataset.s2uTheme).toBe(t.id);
        const tag = row.querySelector('.cx-item__state')!;
        expect(tag.textContent).toBe('WIP');
        expect(tag.classList.contains('is-tag')).toBe(true);
        expect(row.classList.contains('has-tag')).toBe(true);
        expect(row.querySelector('.cx-item__title')!.nextElementSibling).toBe(tag);
        expect(row.textContent).not.toMatch(/EXPERIMENT/);
      });
    });
  }
});
