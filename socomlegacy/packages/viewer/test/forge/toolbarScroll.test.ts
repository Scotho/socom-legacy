// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import { freshSavesDb } from './fakeSaves';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * LATER 226 (the merge controller's product-track call, 2026-10-21): the forge's toolbar is one row about 1112-1271 px
 * wide, and below that width its right end (Docks, Walk, Check, Create lobby, Play, and on a phone most of the row) lay
 * past the screen's edge with no way to it. The toolbar scrolls sideways at every width -- only where the row overflows
 * -- with a thin bar a mouse can take, and keeps its height (`--fx-top`, the docks' and the viewport's top). A browser
 * adaptation (OT.R28); `../../e2e/forgeToolbar.spec.ts` holds it rendered.
 */
describe("the forge's toolbar scrolls sideways where it overflows", () => {
  const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf-8').replace(/\r\n/g, '\n');
  const rule = /\n\.fx-top \{([^}]*)\}/.exec(css);

  it('the toolbar\'s own rule, outside any media block: overflow-x auto, a thin bar, its height kept', () => {
    expect(rule, 'the .fx-top rule').not.toBeNull();
    expect(rule![1]).toMatch(/\boverflow-x: auto;/);
    // The review's F1: a rendered run cannot see a scrollbar (headless Chromium hides it), so the pin holds the bar's
    // two lines: no vertical scroll in the 46 px row, and a thin bar (a classic one would leave less than the 30 px groups).
    expect(rule![1]).toMatch(/\boverflow-y: hidden;/);
    expect(rule![1]).toMatch(/\bscrollbar-width: thin;/);
    // Its own row's height (`--fx-top-bar`); `--fx-top` is both rows', the placing tools' under it (`.fx-tools-row`).
    expect(rule![1]).toMatch(/\bheight: var\(--fx-top-bar\);/);
  });

  it('no media block takes the scroll back', () => {
    for (const m of css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) expect(m[1]).not.toMatch(/\.fx-top \{[^}]*overflow/);
  });
});

/**
 * R7-1 (the rendered pass 2 at 02106bc86: the row 1491 px at a 1440 window, Delete's right edge 1055 at 1024; the UI
 * seat's ruling, product track): the row's natural width at the default font is at most 1260 px, so it fits the 1280
 * default window and 1440 without a scroll; 1024 scrolls (LATER 226). At the root, no control hidden: the base group's
 * select and layout name shrink to a floor (flex items of the row, `display: contents` on their group), the six
 * right-hand tools whose label repeats their icon are icon-only at every width (the label kept as their aria-label,
 * their title unchanged), and the compact row (<= 2200 px -- round 7's review: the full row is ~2150-2240 px, so 1920 scrolled -- where every tool is its icon) packs its tools, groups and
 * gaps tighter. The badge keeps its text. jsdom lays nothing out: the pins hold the rules, `../../e2e/forgeToolbar.spec.ts`
 * the rendered widths.
 */
describe('R7-1: the row fits 1280 and 1440', () => {
  const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf-8').replace(/\r\n/g, '\n');
  const block1440 = /@media \(max-width: 2200px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');
  const ruleOf = (src: string, selector: string): string | null => {
    const at = src.indexOf(`${selector} {`);
    if (at < 0) return null;
    return src.slice(at + selector.length + 2, src.indexOf('}', at));
  };

  it('the base group\'s select and layout name are the row\'s own flex items, each shrinking to its floor', () => {
    expect(ruleOf(outside, '.fx-top > .fx-group--base')).toMatch(/\bdisplay: contents;/);
    expect(ruleOf(outside, '.fx-top > .fx-group--base::after'), 'the group\'s edge, drawn').toMatch(/border-right: 1px solid var\(--fx-edge\);/);
    const name = ruleOf(outside, '.fx-top > .fx-group--base > .fx-name');
    expect(name).toMatch(/\bflex: 0 1 [0-9.]+(?:px|em);/);
    expect(name).toMatch(/\bmin-width: 96px;/);
    const select = ruleOf(outside, '.fx-top > .fx-group--base > .fx-select');
    expect(select).toMatch(/\bflex: 0 1 [0-9.]+px;/);
    expect(select).toMatch(/\bmin-width: 112px;/);
    // No fixed width at a breakpoint takes the shrink back.
    for (const m of css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) expect(m[1]).not.toMatch(/\.fx-top \.fx-(?:select|name) \{[^}]*width/);
  });

  it('an icon-only tool hides its label at every width; the compact row packs its tools, groups, gaps and ends', () => {
    expect(ruleOf(outside, '.fx-tool--icon > span')).toMatch(/\bdisplay: none;/);
    expect(ruleOf(block1440, '.fx-top')).toMatch(/\bgap: 4px;/);
    expect(ruleOf(block1440, '.fx-top .fx-tool')).toMatch(/\bpadding: 0 3px;/);
    expect(ruleOf(block1440, '.fx-top .fx-group')).toMatch(/\bpadding: 0 4px;/);
    expect(ruleOf(block1440, '.fx-top .fx-play')).toMatch(/\bpadding: 0 10px;/);
    // The badge keeps its text there (only the phone's block takes it).
    expect(block1440).not.toMatch(/fx-badge/);
  });
});

vi.mock('../../src/renderer', () => ({ createRenderer: async () => ({
  backend: 'webgl2', resize: () => undefined, presentation: () => 'native', render: () => undefined,
  setPresentation: () => undefined, setClearColor: () => undefined,
}) }));
const archiveLoad = vi.hoisted(() => vi.fn<(stem: string) => Promise<LoadedMap>>());
vi.mock('../../src/forge/archives', () => ({ Archives: class {
  onProgress = null;
  clips = async () => null;
  list = async () => ({ entries: [], problems: [] });
  load = archiveLoad;
  sourceRequest = () => ({ kind: 'http', baseUrl: '/maps' });
}, labelOf: (_entries: unknown, _stem: string, fallback: string) => fallback }));

describe('R7-1: the mounted toolbar', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    freshSavesDb();
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); vi.unstubAllGlobals(); });

  it('the six right-hand tools are icon-only, each named by its aria-label, its title and its label text kept', async () => {
    const { mountForge } = await import('../../src/forge/page');
    await mountForge(document);
    const top = document.querySelector<HTMLElement>('header.fx-top')!;
    const six: [string, string][] = [
      ['Controls', 'Controls'], ['Docks', 'Show or hide the docks'], ['Walk', 'Walk the layout on foot'],
      ['Check', 'Check the map'], ['Create lobby', 'Make a lobby of this layout'], ['Save map', 'Keep this lobby'],
    ];
    for (const [label, title] of six) {
      const b = top.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(b, label).not.toBeNull();
      expect(b!.classList.contains('fx-tool--icon'), `${label}: icon-only`).toBe(true);
      expect(b!.title.startsWith(title), `${label}: its title`).toBe(true);
      expect(b!.textContent?.trim(), `${label}: its label text, read by the tests and the pad`).toBe(label);
      expect(b!.querySelector('.fx-ico'), `${label}: its icon`).not.toBeNull();
    }
    // Walk sits with Check and Create lobby: one group fewer in the row.
    const walk = top.querySelector('button[aria-label="Walk"]')!;
    expect(walk.parentElement).toBe(top.querySelector('button[aria-label="Check"]')!.parentElement);
    // The base group: its select and the layout name are the row's own items (`display: contents`).
    const baseGroup = top.querySelector<HTMLElement>('.fx-group--base')!;
    expect(baseGroup.querySelector('select[title^="The base"]')).not.toBeNull();
    expect(baseGroup.querySelector('input.fx-name')).not.toBeNull();
    // The brand's badge keeps its text.
    expect(top.querySelector('.fx-badge')?.textContent).toBe('EXPERIMENT');
  }, 30_000);
});
