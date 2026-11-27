// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePageContext, ForgeStore } from '../../src/forge/shell/context';
import { createDockShell, type DockNode } from '../../src/forge/shell/dockShell';
import type { ForgePanel, ForgeShellPage } from '../../src/forge/shell/panel';

/**
 * FORGE-DOCKS (ours; a browser adaptation, FG.R2: the game has no editor; LATER 1100's second cure and LATER 1103): the
 * dock shell draws "the viewport alone" while `maximized` (docks off, Walk or Play, a match) and the whole tree after.
 * It kept three records of what it last drew, one per caller (`refresh`, `update`, `frame`), each rendering only when
 * ITS OWN record differed -- so a maximized render made through one caller was never undone through another, and the
 * editor's panels stayed in the hidden stash (`.fx-dg-stash`). A Forge lobby's match hides the docks through `update()`
 * (the page's 250 ms block) and the return reaches only `frame()`; Play from here hides them through `frame()` and Back
 * may reach `update()` or `refresh()` first. The shell keeps ONE record now, read by all three.
 *
 * The converse is pinned too: an unchanged state draws nothing again through any of the three (R3-A's point: a redraw
 * must not replace a focused tab), counted by the drawn group element's identity; an availability change alone still
 * draws through `update()` and `refresh()`.
 */

const KEY = 'test-dock-record';

const memoryStore = (): ForgeStore => {
  const data = new Map<string, string>();
  return { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
};

const panel = (id: string, over: Partial<ForgePanel> = {}): ForgePanel => ({
  id, title: id.toUpperCase(), dock: 'right', order: 10, defaultOpen: true, padLegend: [],
  mount: (host) => { host.append(document.createElement('div')); return { dispose: () => undefined }; },
  ...over,
});

interface Rig {
  shell: ForgeShellPage;
  workbench: HTMLElement;
  inspectorShown: ReturnType<typeof vi.fn>;
  setMaximized(on: boolean): void;
  setSurface(s: 'build' | 'walk'): void;
  /** Whether the inspector's host is in the drawn tree (not the stash). */
  inspectorDrawn(): boolean;
  inspectorStashed(): boolean;
  /** The inspector's group as drawn now (null when the tree is not drawn). */
  inspectorGroup(): HTMLElement | null;
}

function build(): Rig {
  const workbench = document.createElement('div');
  document.body.append(workbench);
  let shell: ForgeShellPage | null = null;
  let maximized = false;
  let surface: 'build' | 'walk' = 'build';
  const context: ForgePageContext = {
    get forge(): ForgeAgentApi { throw new Error('no facade in this rig'); },
    ui: { notify: vi.fn(), toast: vi.fn(), reveal: (id) => shell?.reveal(id), collapse: (id) => shell?.collapse(id) },
    state: () => ({ surface, canEdit: true, canPlace: true, reason: null, revision: 0 }),
    store: memoryStore(), doc: document,
  };
  const root: DockNode = {
    kind: 'split', dir: 'row', sizes: [0.5, 0.5], children: [
      { kind: 'group', id: 'g-view', tabs: ['viewport'], active: 'viewport' },
      { kind: 'group', id: 'g-insp', tabs: ['inspector'], active: 'inspector' },
    ],
  };
  shell = createDockShell({ doc: document, workbench, context, store: context.store, storeKey: KEY, viewportId: 'viewport',
    defaults: { root, homes: { center: 'g-view', right: 'g-insp' } }, maximized: () => maximized });
  const inspectorShown = vi.fn();
  shell.register(panel('viewport', { dock: 'center', movable: false, order: 0 }));
  shell.register(panel('inspector', { dock: 'right', order: 10, availableIn: ['build'],
    mount: (host) => { host.append(document.createElement('div')); return { visibility: inspectorShown, dispose: () => undefined }; } }));
  const host = (): HTMLElement => workbench.querySelector<HTMLElement>('[data-forge-panel="inspector"]')!;
  return {
    shell, workbench, inspectorShown,
    setMaximized: (on) => { maximized = on; },
    setSurface: (s) => { surface = s; },
    inspectorDrawn: () => !!host().closest('.fx-dg-root'),
    inspectorStashed: () => !!host().closest('.fx-dg-stash'),
    inspectorGroup: () => workbench.querySelector<HTMLElement>('.fx-dg-root .fx-dg-group[data-dock-group="g-insp"]'),
  };
}

/** The docks drawn and every caller having seen it (the page's frames, its state tick and the Docks switch). */
function drawnAndSeen(r: Rig): void {
  r.shell.frame(0.016, 1);
  r.shell.update();
  r.shell.refresh();
  expect(r.inspectorDrawn(), 'the inspector is drawn to begin with').toBe(true);
}

describe('the dock shell keeps one record of what it drew (FORGE-DOCKS)', () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it('(a) after a Forge lobby\'s match returns to the lobby, the editor\'s panels are drawn again at the next frame', () => {
    const r = build();
    drawnAndSeen(r);
    // The match starts in one synchronous run (no frame between); the state tick then draws the viewport alone.
    r.setMaximized(true);
    r.shell.update();
    expect(r.inspectorStashed(), 'the match hides the inspector').toBe(true);
    // The return: the match's class goes, and only the page's frame reaches the shell.
    r.setMaximized(false);
    r.shell.frame(0.016, 2);
    expect(r.inspectorStashed(), 'the inspector is not left in the hidden stash').toBe(false);
    expect(r.inspectorDrawn(), 'the inspector is back in the drawn tree').toBe(true);
    expect(r.inspectorShown).toHaveBeenLastCalledWith(true);
    expect(r.shell.isShown('inspector')).toBe(true);
  });

  it('(b) after Play from here and Back, the state tick alone (update) draws the docks again', () => {
    const r = build();
    drawnAndSeen(r);
    r.setMaximized(true);
    r.shell.frame(0.016, 2);
    expect(r.inspectorStashed(), 'Play hides the inspector').toBe(true);
    r.setMaximized(false);
    r.shell.update();
    expect(r.inspectorStashed(), 'the inspector is not left in the hidden stash').toBe(false);
    expect(r.inspectorDrawn()).toBe(true);
    expect(r.inspectorShown).toHaveBeenLastCalledWith(true);
  });

  it('(b) after Play from here and Back, the Docks switch alone (refresh) draws the docks again', () => {
    const r = build();
    drawnAndSeen(r);
    r.setMaximized(true);
    r.shell.frame(0.016, 2);
    expect(r.inspectorStashed(), 'Play hides the inspector').toBe(true);
    r.setMaximized(false);
    r.shell.refresh();
    expect(r.inspectorStashed(), 'the inspector is not left in the hidden stash').toBe(false);
    expect(r.inspectorDrawn()).toBe(true);
    expect(r.inspectorShown).toHaveBeenLastCalledWith(true);
  });

  it('(c) nothing changed: no caller draws the tree again (a focused tab is never replaced)', () => {
    const r = build();
    drawnAndSeen(r);
    const group = r.inspectorGroup();
    expect(group).toBeTruthy();
    r.shell.update();
    r.shell.refresh();
    r.shell.frame(0.016, 2);
    r.shell.update();
    r.shell.frame(0.016, 3);
    r.shell.refresh();
    expect(r.inspectorGroup(), 'the same group element: nothing drawn again').toBe(group);
  });

  it('(c) the viewport alone and unchanged: a caller other than the one that hid the docks draws nothing again', () => {
    const r = build();
    drawnAndSeen(r);
    r.setMaximized(true);
    r.shell.frame(0.016, 4);
    const alone = r.workbench.querySelector('.fx-dg-alone');
    expect(alone).toBeTruthy();
    r.shell.update();
    r.shell.refresh();
    r.shell.frame(0.016, 5);
    expect(r.workbench.querySelector('.fx-dg-alone'), 'the same lone viewport: nothing drawn again').toBe(alone);
  });

  it('(c) a panel no longer available on the surface leaves the docks through the state tick (update)', () => {
    const r = build();
    drawnAndSeen(r);
    r.setSurface('walk');
    r.shell.update();
    expect(r.inspectorDrawn()).toBe(false);
    expect(r.inspectorGroup()).toBeNull();
    r.setSurface('build');
    r.shell.update();
    expect(r.inspectorDrawn()).toBe(true);
  });

  it('(c) a panel no longer available on the surface leaves the docks through the Docks switch (refresh)', () => {
    const r = build();
    drawnAndSeen(r);
    r.setSurface('walk');
    r.shell.refresh();
    expect(r.inspectorDrawn()).toBe(false);
    expect(r.inspectorGroup()).toBeNull();
    r.setSurface('build');
    r.shell.refresh();
    expect(r.inspectorDrawn()).toBe(true);
  });
});
