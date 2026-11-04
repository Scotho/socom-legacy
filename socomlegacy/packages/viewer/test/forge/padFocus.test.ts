// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePanel, ForgeShellPage } from '../../src/forge/shell/panel';
import type { ForgePageContext, ForgePanelContext } from '../../src/forge/shell/context';
import { forgeKeyAction, type ForgeKeyState } from '../../src/forge/keys';
import type { LoadedMap } from '../../src/loadMap';

/**
 * FUI-2 (the review's PAD-4, principle 2; a browser adaptation, FG.R2): one pad focus walker over `[data-pad-item]` in
 * DOM order with the system's ring (`.is-pad-focused`), and FUI-1b's named prerequisite, the focus lease
 * (`ctx.ui.focus.take(panelId)`): while a panel holds it the editor's keys, camera and pad lanes are the panel's, it is
 * let go on a hide, a fold, a dispose or the panel's signal, and a staged drop is cancelled once a placement is no longer
 * admitted. The walker is tested over plain markup; the lease on its own and through the mounted page (only the GPU and
 * disc I/O replaced, as `forgeAgentPage.test.ts` mounts it).
 */

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

/** Read at run time (the RED run of a module not written yet fails per case, not at the file's import). */
const at = (name: string): string => `../../src/forge/shell/${name}`;
const walker = () => import(/* @vite-ignore */ at('padFocus')) as Promise<typeof import('../../src/forge/shell/padFocus')>;
const contextModule = () => import(/* @vite-ignore */ at('context')) as Promise<typeof import('../../src/forge/shell/context')>;

/** Three rows (one hidden), a disabled button and Close: what a Saves card's walk sees. */
function markup(): { root: HTMLElement; clicks: string[] } {
  const root = document.createElement('div');
  root.innerHTML = [
    '<ul>',
    '<li data-pad-item id="a"><span>Yard</span><button data-pad="act">Open</button><button data-pad="secondary">Rename</button><button data-pad="remove">Delete</button></li>',
    '<li data-pad-item id="b" hidden><button data-pad="act">Open</button></li>',
    '<li data-pad-item id="c"><span>Dock</span><button data-pad="act">Open</button><button data-pad="remove">Delete</button></li>',
    '</ul>',
    '<button data-pad-item id="d" disabled>Nope</button>',
    '<button data-pad-item id="e">Close</button>',
  ].join('');
  document.body.replaceChildren(root);
  const clicks: string[] = [];
  for (const b of root.querySelectorAll('button')) b.addEventListener('click', () => clicks.push(`${b.closest('li')?.id ?? b.id}:${b.textContent}`));
  return { root, clicks };
}
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const ringed = (root: HTMLElement): string[] => [...root.querySelectorAll('.is-pad-focused')].map((e) => e.id);

describe('the pad focus walker (FUI-2, PAD-4)', () => {
  it('walks the shown, enabled [data-pad-item] in DOM order, one ring, the DOM focus with it; wraps at both ends', async () => {
    const { PadFocus, PAD_FOCUSED_CLASS } = await walker();
    expect(PAD_FOCUSED_CLASS).toBe('is-pad-focused');
    const { root } = markup();
    const f = new PadFocus(root);
    expect(f.items().map((e) => e.id)).toEqual(['a', 'c', 'e']);
    expect(f.current()).toBeNull();
    expect(f.move(1)!.id).toBe('a');
    expect(ringed(root)).toEqual(['a']);
    expect(document.activeElement).toBe(byId('a'));
    expect(byId('a').tabIndex).toBe(-1);                               // a row takes the focus without joining the Tab order
    expect(f.move(1)!.id).toBe('c');
    expect(f.move(1)!.id).toBe('e');
    expect(ringed(root)).toEqual(['e']);
    expect(f.move(1)!.id).toBe('a');                                   // past the last, the first
    expect(f.move(-1)!.id).toBe('e');                                  // before the first, the last
    f.clear();
    expect(ringed(root)).toEqual([]);
    (document.activeElement as HTMLElement).blur();                    // nothing held: no mark, and the DOM focus out of the rows
    expect(f.current()).toBeNull();
    expect(f.move(-1)!.id).toBe('e');                                  // from nothing held, back is the last
  });

  it('Cross presses the held control -- the item itself, or its data-pad="act"; Square and Triangle its secondary and remove', async () => {
    const { PadFocus } = await walker();
    const { root, clicks } = markup();
    const f = new PadFocus(root);
    expect(f.input('act')).toBe(false);                                // nothing held: nothing pressed
    expect(f.input('down')).toBe(true);
    expect(f.input('act')).toBe(true);
    expect(f.input('secondary')).toBe(true);
    expect(f.input('remove')).toBe(true);
    expect(clicks).toEqual(['a:Open', 'a:Rename', 'a:Delete']);
    f.input('down');
    expect(f.input('secondary')).toBe(false);                          // row c has no secondary
    f.input('down');
    expect(f.input('act')).toBe(true);
    expect(clicks.at(-1)).toBe('e:Close');
    expect(f.input('prevSection')).toBe(false);                        // a card has no sections
  });

  it('follows the DOM focus a pointer or Tab moved, and refocuses by place after a redraw', async () => {
    const { PadFocus } = await walker();
    const { root } = markup();
    const f = new PadFocus(root);
    f.move(1);
    byId('c').querySelector('button')!.focus();                        // Tab or a pointer moved the focus into row c
    expect(f.current()!.id).toBe('c');
    expect(ringed(root)).toEqual(['c']);
    expect(f.index()).toBe(1);
    expect(f.move(1)!.id).toBe('e');
    expect(f.focus(99)!.id).toBe('e');                                 // clamped
    expect(f.focus(null)).toBeNull();
    expect(ringed(root)).toEqual([]);
  });

  it('maps the pad\'s actions to the one scheme: d-pad moves, Cross acts, Circle backs, Square and Triangle, L1 / R1', async () => {
    const { PAD_FOCUS_INPUT } = await walker();
    expect(PAD_FOCUS_INPUT).toEqual({
      prevAsset: 'up', nextAsset: 'down', turnLeft: 'left', turnRight: 'right',
      act: 'act', deselect: 'back', duplicate: 'secondary', delete: 'remove', prevTool: 'prevSection', nextTool: 'nextSection',
    });
    expect(PAD_FOCUS_INPUT.menu).toBeUndefined();                      // START stays the menu's
  });
});

describe('the focus lease (FUI-2 for FUI-1b: ctx.ui.focus.take)', () => {
  it('takes for a shown panel, lets go once; a hidden panel is refused; a second take supersedes the first', async () => {
    const { createFocusLeases } = await contextModule();
    const shown = new Set(['a', 'b']);
    const changes: (string | null)[] = [];
    const leases = createFocusLeases({ shown: (id) => shown.has(id), onChange: (h) => changes.push(h) });
    const releaseA = leases.take('a');
    expect(leases.holder()).toBe('a');
    releaseA();
    releaseA();                                                        // twice is once
    expect(leases.holder()).toBeNull();
    leases.take('hidden-one');
    expect(leases.holder()).toBeNull();                                // not shown: no lease
    const again = leases.take('a');
    const releaseB = leases.take('b');
    expect(leases.holder()).toBe('b');
    again();                                                           // a superseded lease lets go of nothing
    expect(leases.holder()).toBe('b');
    releaseB();
    expect(changes).toEqual(['a', null, 'a', 'b', null]);
  });

  it('is let go when its panel is no longer shown (sync), and with everything at releaseAll', async () => {
    const { createFocusLeases } = await contextModule();
    let open = true;
    const leases = createFocusLeases({ shown: () => open });
    leases.take('p');
    leases.sync();
    expect(leases.holder()).toBe('p');
    open = false;
    leases.sync();
    expect(leases.holder()).toBeNull();
    open = true;
    leases.take('p');
    leases.releaseAll();
    expect(leases.holder()).toBeNull();
  });

  it('a panel\'s context binds its lease to the panel\'s signal: the abort lets it go', async () => {
    const { createFocusLeases, panelContext } = await contextModule();
    const leases = createFocusLeases({ shown: () => true });
    const page = {
      get forge(): ForgeAgentApi { throw new Error('no facade'); },
      ui: { notify: () => undefined, toast: () => undefined, reveal: () => undefined, collapse: () => undefined, focus: leases },
      state: () => ({ surface: 'build', canEdit: true, canPlace: true, reason: null, revision: 0 }),
      store: { get: () => null, set: () => undefined }, doc: document,
    } as ForgePageContext;
    const abort = new AbortController();
    const ctx = panelContext(page, abort.signal);
    ctx.ui.focus.take('p');
    expect(ctx.ui.focus.holder()).toBe('p');
    abort.abort();
    expect(leases.holder()).toBeNull();
  });

  it('the editor\'s keys are none of the editor\'s while a panel holds the focus (a card\'s Esc still closes it)', () => {
    const state: ForgeKeyState = { typing: false, match: false, menu: false, card: false, playing: false, pointerLocked: false, leased: true };
    const key = (code: string) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false });
    for (const code of ['KeyH', 'Digit2', 'Delete', 'KeyM', 'Escape', 'KeyP']) expect(forgeKeyAction(key(code), state), code).toBeNull();
    expect(forgeKeyAction(key('KeyH'), { ...state, leased: false })).toBe('docks');
    expect(forgeKeyAction(key('Escape'), { ...state, card: true })).toBe('closeCard');
  });
});

/* ---------- the mounted page: the lease routes the pad, holds the keys, cancels a staged drop ---------- */

const pad = {
  id: 'Test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
};
let frames: FrameRequestCallback[] = [];
let clock = 0;
const tick = (): void => { clock += 16; const run = frames; frames = []; run.forEach((cb) => cb(clock)); };
const press = (button: number): void => {
  pad.buttons[button]!.pressed = true; pad.buttons[button]!.value = 1; tick();
  pad.buttons[button]!.pressed = false; pad.buttons[button]!.value = 0; tick();
};
const SQUARE = 2, DOWN = 13;
const docksOff = (): boolean => document.body.classList.contains('fx-docks-off');
const keyH = (): void => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true })); };

describe('the mounted Forge: a panel holding the focus lease (FUI-2)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    history.replaceState(null, '', '/forge?floor');
    localStorage.clear();
    archiveLoad.mockReset().mockRejectedValue(new Error('No disc supplied'));
  });
  afterEach(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'getGamepads');
  });

  it('takes the pad and the keys while held; a fold lets go; a staged drop is cancelled when the menu opens; unregister lets go', async () => {
    const { mountForge } = await import('../../src/forge/page');
    const inputs: string[] = [];
    let ctx: ForgePanelContext | null = null;
    const leasing: ForgePanel = { id: 'lease', title: 'Lease', dock: 'right', order: 70, defaultOpen: true, padLegend: [],
      mount: (host, c) => { ctx = c; host.append(document.createElement('div')); return { pad: (i) => { inputs.push(i); return true; }, dispose: () => undefined }; } };
    const shell = await mountForge(document, { panels: [leasing] }) as ForgeShellPage;
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    const c = ctx as unknown as ForgePanelContext;
    clock = performance.now() + 1000;
    tick(); tick();                                                    // the pad arms on a frame at rest
    c.ui.reveal('lease');
    const release = c.ui.focus.take('lease');
    expect(c.ui.focus.holder()).toBe('lease');
    // The pad is the panel's: the d-pad and Square reach its pad(), not the editor's prop step or duplicate.
    press(DOWN);
    press(SQUARE);
    expect(inputs).toEqual(['down', 'secondary']);
    // The editor's keys are held: H does not fold the docks.
    const before = docksOff();
    keyH();
    expect(docksOff()).toBe(before);
    // A fold lets the lease go: the keys are the editor's again.
    c.ui.collapse('lease');
    expect(c.ui.focus.holder()).toBeNull();
    keyH();
    expect(docksOff()).toBe(!before);
    keyH();
    release();                                                         // already let go: nothing
    // A drop staged under a lease is cancelled once a placement is no longer admitted (the START menu opened).
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    archiveLoad.mockResolvedValue({ ...blankLibraryMap('MP84', 1000), path: 'synthetic/MP84', world: [floorMesh(1000)],
      props: [{ modelName: 'synthetic', parts: [floorMesh(4)], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        order: 0, alternate: false, facade: 0, lod: null, paths: ['synthetic/prop'] }] } as LoadedMap);
    c.ui.reveal('lease');
    c.ui.focus.take('lease');
    const staged = await c.editor!.stagePiece('MP84:synthetic');
    expect(staged).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    expect(c.state().canPlace).toBe(false);
    expect(staged!.disposed).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    // The panel's signal (unregister) lets it go.
    c.ui.focus.take('lease');
    expect(c.ui.focus.holder()).toBe('lease');
    shell.unregister('lease');
    expect(c.ui.focus.holder()).toBeNull();
  }, 20_000);

  const key = (target: EventTarget, code: string, k: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  const menuOpen = (): boolean => document.querySelector('[data-forge="menu"]')!.getAttribute('aria-expanded') === 'true';

  it('R3-A (3): the lease has a keyboard exit -- Escape lets it go (as the pad\'s Circle), M lets it go and opens the menu; a panel\'s own key handler sees them first', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let ctx: ForgePanelContext | null = null;
    let consume = false;
    const body = document.createElement('div');
    const field = document.createElement('button');
    body.append(field);
    const leasing: ForgePanel = { id: 'lease', title: 'Lease', dock: 'right', order: 70, defaultOpen: true, padLegend: [],
      mount: (host, c) => {
        ctx = c;
        host.append(body);
        host.addEventListener('keydown', (e) => { if (consume && e.code === 'Escape') e.preventDefault(); });
        return { pad: () => true, dispose: () => undefined };
      } };
    await mountForge(document, { panels: [leasing] });
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    const c = ctx as unknown as ForgePanelContext;
    c.ui.reveal('lease');
    // A panel that takes Escape itself keeps the lease.
    c.ui.focus.take('lease');
    consume = true;
    field.focus();
    key(field, 'Escape', 'Escape');
    expect(c.ui.focus.holder()).toBe('lease');
    // An Escape the panel leaves lets the lease go -- from the panel, or from the page with the focus nowhere.
    consume = false;
    key(field, 'Escape', 'Escape');
    expect(c.ui.focus.holder()).toBeNull();
    c.ui.focus.take('lease');
    (document.activeElement as HTMLElement | null)?.blur?.();
    key(window, 'Escape', 'Escape');
    expect(c.ui.focus.holder()).toBeNull();
    // The editor's other keys stay held while the lease is: H does not fold the docks.
    c.ui.focus.take('lease');
    const before = docksOff();
    keyH();
    expect(docksOff()).toBe(before);
    expect(c.ui.focus.holder()).toBe('lease');
    // M: the lease let go, then the menu opens as it does without one.
    expect(menuOpen()).toBe(false);
    key(window, 'KeyM', 'm');
    expect(c.ui.focus.holder()).toBeNull();
    expect(menuOpen()).toBe(true);
    key(window, 'KeyM', 'm');
    expect(menuOpen()).toBe(false);
  }, 20_000);

  it('R3-A (7): a staged drop is the page\'s to dispose -- cancelled when a placement stops being admitted (no lease needed) and when its panel unregisters', async () => {
    const { mountForge } = await import('../../src/forge/page');
    let ctx: ForgePanelContext | null = null;
    const drop: ForgePanel = { id: 'drop', title: 'Drop', dock: 'right', order: 70, defaultOpen: true, padLegend: [],
      mount: (host, c) => { ctx = c; host.append(document.createElement('div')); return { dispose: () => undefined }; } };
    const shell = await mountForge(document, { panels: [drop] }) as ForgeShellPage;
    await vi.waitFor(() => expect(ctx).not.toBeNull());
    const c = ctx as unknown as ForgePanelContext;
    const { blankLibraryMap, floorMesh } = await import('../../src/forge/matchMap');
    archiveLoad.mockResolvedValue({ ...blankLibraryMap('MP84', 1000), path: 'synthetic/MP84', world: [floorMesh(1000)],
      props: [{ modelName: 'synthetic', parts: [floorMesh(4)], matrices: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        order: 0, alternate: false, facade: 0, lod: null, paths: ['synthetic/prop'] }] } as LoadedMap);
    // No lease held: the START menu opened over the editor cancels the drop at once.
    expect(c.ui.focus.holder()).toBeNull();
    const lapsed = await c.editor!.stagePiece('MP84:synthetic');
    expect(lapsed).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    expect(c.state().canPlace).toBe(false);
    expect(lapsed!.disposed).toBe(true);
    // Its place still answers why: the admission lapsed.
    expect(await c.editor!.place(lapsed!, [0, 0, 0])).toMatchObject({ ok: false, code: 'ADMISSION_LOST' });
    document.querySelector<HTMLButtonElement>('[data-forge="menu"]')!.click();
    // The panel unregistered: its staged drop goes with it.
    const held = await c.editor!.stagePiece('MP84:synthetic');
    expect(held).not.toBeNull();
    expect(held!.disposed).toBe(false);
    shell.unregister('drop');
    expect(held!.disposed).toBe(true);
    // A drop staged after the panel's signal aborted is let go at once.
    const late = await c.editor!.stagePiece('MP84:synthetic');
    expect(late === null || late.disposed).toBe(true);
  }, 20_000);
});
