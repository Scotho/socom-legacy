/**
 * The pad's one input owner per active layer (LU-4b of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R18, MU.R20 as
 * amended by MU.R27: "one input dispatcher per active layer"; dot's LU-1 review F4, `C:/Projects/agent-mail/
 * dot-to-modern-ui.md`). A browser adaptation (MU.R1), labelled as one: the launcher and the overlay are the project's
 * own screens; the original's own pad reads are untouched.
 *
 * Several readers poll the same pad on the setup page -- the setup page's walker (`../startupNavigation`), START
 * (`../startup`), the launcher's tiles (`./launcher`) and the on-screen keyboard's read (the modern `osk`, retired with
 * CX-26), which also delivered a dialog's Circle. Before this module each guarded itself (the launcher's own modal
 * query, `../startup`'s `modalOpen`, the keyboard's own dialog test), so a press could both close a layer and act on the
 * one beneath it. CX-27: the keyboard's own layer (`keyboard`: `[data-osk]` or the ds `.s2u-osk` open, its read owning
 * every button) is retired with it -- no live markup draws either. Now one function
 * decides which layer is on top (`top`) and one table (`PAD_LAYER_ROUTES_ADAPTATION`) which reader owns each action
 * there; every reader asks before it acts (`owns`), and a press that changes the layer is claimed (`act`), so no other
 * reader acts on it until it is let go.
 *
 * The layers, top first:
 * - `capture`: a controller binding is being listened for (`ControllerSetup.capturing`, the shell's
 *   `Settings.capturing`, each registered by `addCapture`): the capture owns the whole pad.
 * - `dialog`: a modal dialog is open (`[aria-modal="true"]`, not hidden; the innermost when one is nested in another,
 *   the agreement's #763 inside the sign-in panel): the walker walks it alone; Circle, L1 / R1, START and Triangle are
 *   routed to nobody under it (Circle was the keyboard's read's, which delivered a dialog's Escape: retired with CX-26,
 *   its route with CX-29), so the walker's back is not run under a dialog -- a dialog reads its own Escape. A
 *   non-modal surface registered by `addSurface` while it is open (MU-P1a: the phone top bar's fold, `./launcher`) is
 *   this layer too, below any modal dialog: its Escape closes it, and nothing behind it is pressed while it is open.
 * - `page`: the page itself: the walker walks it, Circle runs the back chain (`back`), the launcher has L1 / R1 and
 *   the regions, START is START, Triangle is the account (the `account` action; its chain, `addAccount`, retired with
 *   CX-26: no reader registered one since the shell's Triangle went with CX-25), Square is the focused screen's own
 *   (`reset`).
 *
 * MU2-8 (CX-11's Square; MU2-6's stop (a); its review F1): Square on the page is each screen's own Square -- Settings
 * resets the focused row to its default, as the console's Options Square does (`../console/grammar.ts`: a row with
 * values and a default, not locked); the loadout editor stores the record, as the ARMORY's Square does (its S5,
 * `../armoryState`). The walker calls the chain (`addReset` / `reset`, named for its first link) with the focused
 * control; each screen registers one link that answers for its own controls. A dialog's layer routes it to nobody.
 */

/** The active layer's kinds, top first. */
export type PadLayerKind = 'capture' | 'dialog' | 'page';
/** What a pad press does: walk and press (the D-pad, the stick, Cross), back (Circle), the tiles (L1 / R1), the
 *  regions (the launcher's moves between the shelf, the top bar and the content), START (Options), the account
 *  (Triangle), reset (Square: the focused screen's own -- a row's reset, the ARMORY's store; MU2-8). */
export type PadAction = 'walk' | 'back' | 'tiles' | 'regions' | 'start' | 'account' | 'reset';
/** Who reads it: the walker (`../startupNavigation`), the launcher (`./launcher`, or the overlay's tabs), START
 *  (`../startup`). (CX-29: the keyboard's read, the modern `osk`'s, retired with CX-26, went with the dialog's Circle
 *  route that still named it; no reader asked for it.) */
export type PadReader = 'walker' | 'launcher' | 'start';

/**
 * PAD_LAYER_ROUTES_ADAPTATION: which reader owns which action in each layer (the layout brief 2.9's table; MU.R27). A
 * browser adaptation: the original has no launcher; its own screens read the pad as the game does.
 */
export const PAD_LAYER_ROUTES_ADAPTATION: Readonly<Record<PadLayerKind, Readonly<Partial<Record<PadAction, PadReader>>>>> = {
  capture: {},
  dialog: { walk: 'walker' },
  page: { walk: 'walker', back: 'walker', tiles: 'launcher', regions: 'launcher', start: 'start', account: 'launcher', reset: 'walker' },
};

export interface PadLayer {
  kind: PadLayerKind;
  /** The layer's element: the dialog's root; null for the page and a capture. */
  root: HTMLElement | null;
}

export interface PadLayers {
  /** The layer on top now. */
  top(): PadLayer;
  /** Who owns `action` in the layer on top (null: nobody -- the press does nothing). */
  owner(action: PadAction): PadReader | null;
  /** Whether `reader` owns `action` now. */
  owns(reader: PadReader, action: PadAction): boolean;
  /**
   * The page's root (the overlay's own `aria-modal` box, which is its page, not a dialog over it); absent, the body.
   * Answers the release.
   */
  setRoot(root: HTMLElement): () => void;
  /** A binding capture's state (the capture layer while it answers true). Answers the release. */
  addCapture(capturing: () => boolean): () => void;
  /**
   * An open surface the pad treats as a dialog layer (its root while open, else null): the walker walks it alone, and
   * the surface reads its own Escape (since CX-29 no reader owns Circle there). Below any modal dialog. Answers the release.
   */
  addSurface(open: () => HTMLElement | null): () => void;
  /**
   * dot's G3: a tab reader (the launcher's tiles, the overlay's tabs) takes the page layer's L1 / R1 (`tiles`) for its
   * life; while one is registered no other reader acts on them -- the walker's bumper move is its standalone fallback
   * only. Answers the release.
   */
  addTabReader(): () => void;
  /** Whether a tab reader is registered. */
  tabReader(): boolean;
  /**
   * A link of the page's back chain (Circle on the page, after the walker's own: a help tip, a disclosure): run in
   * `rank` order (then the latest first) until one answers true. Answers the release.
   */
  addBack(link: () => boolean, rank?: number): () => void;
  /** Runs the page's back chain; whether a link took it. */
  back(): boolean;
  /**
   * MU2-8: a link of the Square chain (Square on the page, the focused control handed in): the latest registered first,
   * until one answers true -- a screen's link does its own Square for its own controls (Settings a row's reset, the
   * loadout editor the ARMORY's store) and answers false for any other control. Answers the release.
   */
  addReset(link: (control: HTMLElement) => boolean): () => void;
  /** Runs the Square chain for `control`; whether a link took it. */
  reset(control: HTMLElement): boolean;
  /**
   * Runs `fn` for a press of `button`; when the layer on top is not the same after it (a dialog opened or closed), the
   * press is claimed: no reader sees it as a press until it is let go (`claimed`, `note`).
   */
  act<T>(button: number, fn: () => T): T;
  /** Whether `button`'s press is claimed by a layer change. */
  claimed(button: number): boolean;
  /** A reader's frame: the buttons down now; a claim ends when its button is let go. */
  note(down: ReadonlySet<number>): void;
}

const all = new WeakMap<Document, PadLayers>();

/** The document's dispatcher, made at the first call. */
export function padLayers(doc: Document): PadLayers {
  let l = all.get(doc);
  if (!l) { l = makeLayers(doc); all.set(doc, l); }
  return l;
}

function makeLayers(doc: Document): PadLayers {
  const roots: HTMLElement[] = [];
  const captures = new Set<() => boolean>();
  const surfaces = new Set<() => HTMLElement | null>();
  const tabReaders = new Set<object>();
  const backs: { link: () => boolean; rank: number; n: number }[] = [];
  const resets: ((control: HTMLElement) => boolean)[] = [];
  const claims = new Set<number>();
  let order = 0;

  const scope = (): ParentNode => {
    for (let i = roots.length - 1; i >= 0; i--) if (roots[i]!.isConnected) return roots[i]!;
    return doc.body ?? doc;
  };
  const shown = (el: Element): boolean => !el.closest('[hidden]');
  const top = (): PadLayer => {
    for (const c of captures) { try { if (c()) return { kind: 'capture', root: null }; } catch { /* a source gone */ } }
    const page = scope();
    const open = Array.from(page.querySelectorAll<HTMLElement>('[aria-modal="true"]'))
      .filter((d) => d !== page && shown(d));
    // The innermost (a dialog with no open dialog inside it), the last in the document's order.
    const inner = open.filter((d) => !open.some((o) => o !== d && d.contains(o)));
    const dialog = inner.at(-1);
    if (dialog) return { kind: 'dialog', root: dialog };
    for (const s of surfaces) {
      let el: HTMLElement | null = null;
      try { el = s(); } catch { /* a source gone */ }
      if (el?.isConnected && shown(el)) return { kind: 'dialog', root: el };
    }
    return { kind: 'page', root: null };
  };
  const owner = (action: PadAction): PadReader | null => PAD_LAYER_ROUTES_ADAPTATION[top().kind][action] ?? null;
  const same = (a: PadLayer, b: PadLayer): boolean => a.kind === b.kind && a.root === b.root;

  return {
    top,
    owner,
    owns: (reader, action) => owner(action) === reader,
    setRoot(root) {
      roots.push(root);
      return () => { const i = roots.indexOf(root); if (i >= 0) roots.splice(i, 1); };
    },
    addCapture(c) { captures.add(c); return () => { captures.delete(c); }; },
    addSurface(f) { surfaces.add(f); return () => { surfaces.delete(f); }; },
    addTabReader() {
      const token = {};
      tabReaders.add(token);
      return () => { tabReaders.delete(token); };
    },
    tabReader: () => tabReaders.size > 0,
    addBack(link, rank = 0) {
      const entry = { link, rank, n: order++ };
      backs.push(entry);
      return () => { const i = backs.indexOf(entry); if (i >= 0) backs.splice(i, 1); };
    },
    back() {
      const chain = [...backs].sort((a, b) => a.rank - b.rank || b.n - a.n);
      return chain.some((e) => e.link());
    },
    addReset(link) {
      resets.push(link);
      return () => { const i = resets.indexOf(link); if (i >= 0) resets.splice(i, 1); };
    },
    reset(control) {
      for (let i = resets.length - 1; i >= 0; i--) if (resets[i]!(control)) return true;
      return false;
    },
    act(button, fn) {
      const before = top();
      const out = fn();
      if (!same(before, top())) claims.add(button);
      return out;
    },
    claimed: (b) => claims.has(b),
    note(down) { for (const b of [...claims]) if (!down.has(b)) claims.delete(b); },
  };
}
