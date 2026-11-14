// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePageContext, ForgeStore } from '../../src/forge/shell/context';
import { createDockShell, type DockNode } from '../../src/forge/shell/dockShell';
import type { ForgePanel, ForgeShellPage } from '../../src/forge/shell/panel';

/**
 * FC2-6 (ours; a browser adaptation, FG.R2: the game has no editor): the dock shell's sash between a split's panes took
 * the pointer only -- not focusable, no keys. The dock resizer it replaced (`fx-dock-resizer`, page.ts on main) was
 * keyboard-operable: `tabIndex` 0, labelled, the arrow keys moving it 10 px (40 px with Shift). The sash keeps those keys:
 * along its split's direction only, the step converted to a share as the pointer converts px, clamped as the pointer is
 * (`MIN_PANE_PX`, 80 px). The pointer drag is the control, green before the fix.
 *
 * jsdom lays nothing out: the split's box is stubbed (1000 x 600), and `setPointerCapture` is stubbed on the sash where
 * jsdom lacks it.
 */

const KEY = 'test-dock-sash';
const SPLIT_W = 1000;
const SPLIT_H = 600;

const memoryStore = (): ForgeStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

const panel = (id: string, over: Partial<ForgePanel> = {}): ForgePanel => ({
  id, title: id.toUpperCase(), dock: 'right', order: 10, defaultOpen: true, padLegend: [],
  mount: (host) => { host.append(document.createElement('div')); return { dispose: () => undefined }; },
  ...over,
});

function build(): { shell: ForgeShellPage; store: ReturnType<typeof memoryStore>; sash: HTMLElement; split: HTMLElement; share: () => number } {
  const store = memoryStore();
  const workbench = document.createElement('div');
  document.body.append(workbench);
  let shell: ForgeShellPage | null = null;
  const context: ForgePageContext = {
    get forge(): ForgeAgentApi { throw new Error('no facade in this rig'); },
    ui: { notify: vi.fn(), toast: vi.fn(), reveal: (id) => shell?.reveal(id), collapse: (id) => shell?.collapse(id) },
    state: () => ({ surface: 'build', canEdit: true, canPlace: true, reason: null, revision: 0 }),
    store, doc: document,
  };
  const root: DockNode = {
    kind: 'split', dir: 'row', sizes: [0.5, 0.5], children: [
      { kind: 'group', id: 'g-view', tabs: ['viewport'], active: 'viewport' },
      { kind: 'group', id: 'g-insp', tabs: ['inspector'], active: 'inspector' },
    ],
  };
  shell = createDockShell({ doc: document, workbench, context, store, storeKey: KEY, viewportId: 'viewport',
    defaults: { root, homes: { center: 'g-view', right: 'g-insp' } } });
  shell.register(panel('viewport', { dock: 'center', movable: false, order: 0 }));
  shell.register(panel('inspector', { dock: 'right', order: 10 }));
  const split = workbench.querySelector<HTMLElement>('.fx-dg-split')!;
  expect(split).toBeTruthy();
  split.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: SPLIT_W, bottom: SPLIT_H, width: SPLIT_W, height: SPLIT_H, toJSON: () => ({}) }) as DOMRect;
  const sash = split.querySelector<HTMLElement>(':scope > .fx-dg-sash')!;
  expect(sash).toBeTruthy();
  // jsdom may lack pointer capture: stubbed on the sash (the pointer path calls it).
  sash.setPointerCapture = () => undefined;
  sash.releasePointerCapture = () => undefined;
  /** The first pane's share as kept under the key (the default's 0.5 while nothing is kept yet). */
  const share = (): number => {
    const raw = store.data.get(KEY);
    if (!raw) return 0.5;
    const kept = JSON.parse(raw) as { v: number; root: { sizes: number[] } };
    expect(kept.v).toBe(2);
    const s = kept.root.sizes;
    return s[0]! / (s[0]! + s[1]!);
  };
  return { shell, store, sash, split, share };
}

const key = (el: HTMLElement, k: string, shiftKey = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};
/** A pointer event (a MouseEvent of the pointer's type where jsdom has no PointerEvent: the listener reads only these). */
const pointer = (el: HTMLElement, type: string, clientX: number): void => {
  const Ctor = (typeof PointerEvent === 'function' ? PointerEvent : MouseEvent) as typeof MouseEvent;
  el.dispatchEvent(new Ctor(type, { button: 0, clientX, clientY: 300, bubbles: true, cancelable: true }));
};

describe('the dock shell\'s sash: the old resizer\'s keys kept (FC2-6)', () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it('(a) is focusable and labelled', () => {
    const { sash } = build();
    expect(sash.getAttribute('role')).toBe('separator');
    expect(sash.tabIndex).toBe(0);
    expect((sash.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
  });

  it('(b) ArrowRight grows the pane before it by 10 px of the split, and prevents the default', () => {
    const { sash, share } = build();
    const e = key(sash, 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    expect(share()).toBeCloseTo(0.51, 9);
  });

  it('(b) Shift+ArrowRight grows it by 40 px', () => {
    const { sash, share } = build();
    key(sash, 'ArrowRight', true);
    expect(share()).toBeCloseTo(0.54, 9);
  });

  it('(b) ArrowLeft shrinks it by 10 px', () => {
    const { sash, share } = build();
    key(sash, 'ArrowLeft');
    expect(share()).toBeCloseTo(0.49, 9);
  });

  it('(c) clamps at the 80 px minimum (a share of 0.08 at 1000 px) after many ArrowLeft presses', () => {
    const { sash, share } = build();
    for (let i = 0; i < 30; i++) key(sash, 'ArrowLeft', true);
    expect(share()).toBeCloseTo(0.08, 9);
    for (let i = 0; i < 30; i++) key(sash, 'ArrowRight', true);
    expect(share()).toBeCloseTo(0.92, 9);
  });

  it('(d) ArrowUp and ArrowDown on a row split change nothing', () => {
    const { sash, share } = build();
    const up = key(sash, 'ArrowUp');
    const down = key(sash, 'ArrowDown', true);
    expect(up.defaultPrevented).toBe(false);
    expect(down.defaultPrevented).toBe(false);
    expect(share()).toBeCloseTo(0.5, 9);
  });

  it('(e) control: a pointer drag of +100 px moves the share to 0.6', () => {
    const { sash, share } = build();
    pointer(sash, 'pointerdown', 500);
    pointer(sash, 'pointermove', 600);
    pointer(sash, 'pointerup', 600);
    expect(share()).toBeCloseTo(0.6, 9);
  });
});
