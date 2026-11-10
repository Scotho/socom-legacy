// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ConsoleController, type Host } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { CATS, createState, homeItems, type Adapters, type ModsAdapter, type ModsView } from '../../src/console/state';
import { modsHtml } from '../../src/console/render/mods';
import { HD_PACK_AUTHOR, HD_PACK_CREDIT, modsRows, TEST_HD_PACK_ABOUT } from '../../src/console/adapters/mods';
import type { LocalPackSummary } from '../../src/packs/registry';

/**
 * The HD pack's credit (product track, a browser adaptation, words only; the owner, seat 99, 2026-11-09: "make sure our
 * HD Pack wherever referenced always credit GoE Soul"). The MODS screen's HD install area -- the temporary button's about
 * line, the store link -- and an installed HD pack's row name its author. Synthetic packs, no game data.
 */
const HD = `hd:${'a'.repeat(64)}`;
const summary = (id: string, kind: LocalPackSummary['kind'], name: string): LocalPackSummary =>
  ({ id, kind, name, files: 3, bytes: 3 * 1024 * 1024, staged: false, imported: true, stored: true, enabled: false, applied: false, diagnostics: [] });
const state = { texture: HD, models: { primary: false, second: false }, mods: { enabled: true, order: [], disabled: [] } };

function drawn(view: Partial<ModsView>): HTMLElement {
  const v: ModsView = { ready: true, busy: null, message: null, storePage: null, texture: null, textures: [{ id: null, label: 'Original' }], rows: [], ...view };
  const mods: ModsAdapter = { open: () => {}, view: () => v, choose: () => {}, drop: () => {}, toggle: () => {}, remove: () => {}, move: () => {}, setTexture: () => {} };
  const A: Adapters = { ...sampleAdapters(), mods };
  const S = createState(A, 'page');
  const host: Host = { render: vi.fn(), announce: vi.fn(), fit: vi.fn(), close: vi.fn() };
  const c = new ConsoleController(S, A, host);
  S.cat = CATS.findIndex((x) => x.id === 'experiments');
  S.item[S.cat] = homeItems('experiments', S, A).findIndex((x) => x.act === 'mods');
  c.press('cross');
  const root = document.createElement('div');
  root.innerHTML = modsHtml(S, A);
  return root;
}

describe('the HD pack credits GoE Soul wherever MODS names it', () => {
  it('the credit is spelled exactly', () => {
    expect(HD_PACK_AUTHOR).toBe('GoE Soul');
    expect(HD_PACK_CREDIT).toBe('HD textures by GoE Soul');
  });

  it('the install area: the temporary button\'s about line and the store link name GoE Soul', () => {
    expect(TEST_HD_PACK_ABOUT.startsWith(`${HD_PACK_CREDIT}. `)).toBe(true);
    const root = drawn({ testHdPack: true, storePage: 'https://thunderstore.example/hd' });
    expect(root.querySelector('[data-row]:last-child')!.textContent).toContain('GoE Soul');
    expect(root.querySelector('.cx-mods__store')!.textContent).toContain('GoE Soul');
  });

  it('an installed HD pack\'s row credits its author; another kind\'s row does not', () => {
    const rows = modsRows([summary(HD, 'hd', 'SOCOM II HD Textures'), summary(`texture:MP51:${'b'.repeat(64)}`, 'texture', 'GX')], state);
    expect(rows[0]!.credit).toBe('GoE Soul');
    expect(rows[1]!.credit).toBeUndefined();
    const root = drawn({ rows });
    const hints = [...root.querySelectorAll('.cx-mods__pack .cx-r__hint')].map((e) => e.textContent ?? '');
    expect(hints[0]).toMatch(/^HD texture pack by GoE Soul · /);
    expect(hints[1]).not.toContain('GoE Soul');
  });
});
