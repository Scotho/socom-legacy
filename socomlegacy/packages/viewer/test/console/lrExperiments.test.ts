// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, CATS, homeItems } from '../../src/console/state';
import { homeHtml } from '../../src/console/render/home';

/**
 * LR-6 (the launcher redesign plan, the row "Experiments"; LR.R7): Forge and Test room in the new item drawing -- the
 * Home list's items (`console.css` `.cx-home .cx-item`, LR-1) -- Forge carrying the WIP tag (FWIP; was: EXPERIMENT) as the
 * item's mono tag (the artifact draws no such tag; its mono chip is the item's state, `.cx-item__state`), no rule rows, no new rows. The
 * links keep their targets. A browser adaptation, nothing of the game.
 */
function drawn() {
  const A = sampleAdapters();
  const S = createState(A);
  S.cat = CATS.findIndex((c) => c.id === 'experiments');
  const root = document.createElement('div');
  root.innerHTML = homeHtml(S, A);
  return { A, S, root };
}

describe('LR-6: the Experiments list', () => {
  // B206 ML-2 (ML.R6): Mods, the third item, pushes the MODS screen.
  it('draws Forge, Test room and Mods as three item buttons in the Home list, with no rule row', () => {
    const { root } = drawn();
    const items = [...root.querySelectorAll<HTMLElement>('.cx-list > li > .cx-item')];
    expect(items.map((i) => i.querySelector('.cx-item__title')!.textContent)).toEqual(['Forge', 'Test room', 'Mods']);
    expect(items.every((i) => i.dataset.act === 'item')).toBe(true);
    expect(root.querySelector('.cx-r')).toBeNull();
  });
  it('tags Forge WIP as the item\'s tag and tags Test room with nothing', () => {
    const { root } = drawn();
    const [forge, room] = [...root.querySelectorAll<HTMLElement>('.cx-list > li > .cx-item')];
    const tag = forge!.querySelector('.cx-item__state');
    expect(tag?.textContent).toBe('WIP');
    expect(tag?.classList.contains('is-tag')).toBe(true);
    expect(room!.querySelector('.cx-item__state')).toBeNull();
  });
  it('keeps the links\' targets', () => {
    const { A, S } = drawn();
    expect(homeItems('experiments', S, A).map((i) => i.act)).toEqual(['page:Forge', 'page:Testroom', 'mods']);
  });
});
