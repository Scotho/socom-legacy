import { BACKDROP_URL } from './backdrop';
import { openMobileLayoutEditor, type MobileLayoutEditor } from '../mobileLayoutEditor';
import { UNSAVED_EDIT_MARK } from '../pwa/matchSignals';
import { fit, NARROW_PX } from './fit';
import { githubOnRow } from './discord';
import { ConsoleController, type Host } from './grammar';
import { attachInput, type InputFrame } from './input';
import { pageRows, renderFrame } from './render/frame';
import { keepRailCentred, retireRail } from './render/home';
import { anchorSourceMenu } from './render/legend';
import { attachMapStillFallback } from './render/replays';
import { launcherNav, loadoutHistoryBlocked, type LauncherNav } from './history';
import { createState, startReady, type Adapters, type ConsoleMode, type ConsolePageReads } from './state';

/**
 * The console launcher page, put together (the S2U Briefing design system's prototype's boot: `fit()`, `render()`,
 * the listeners, the pad poll) over a set of adapters. A browser adaptation with no original (the project's own
 * launcher page, OT.R28): it changes nothing of the launched game.
 */
export interface ConsolePage {
  ctl: ConsoleController;
  /** Draws the page from the state. */
  render(): void;
  dispose(): void;
}

export interface ConsoleOptions {
  /** Attach the keyboard map: `import.meta.env.DEV` (OT.R29). */
  keymap: boolean;
  /**
   * OVERLAY-CONSOLE (CX.R13, OT.R60): `page` (absent), the launcher as the base path's page; `overlay`, the console as the
   * overlay over a game page (`../modern/overlay`): START, the launch target and the launch screen hidden, the disc and
   * the session locked as `page` says, Circle at the top `close`.
   */
  mode?: ConsoleMode;
  /** OVERLAY-CONSOLE: what the page under the overlay holds, read at each draw (overlay mode only). */
  page?: ConsolePageReads;
  /** OVERLAY-CONSOLE: Circle at the top of the overlay's console asks this to close it. */
  close?: () => void;
  /**
   * OVERLAY-CONSOLE: the pad poll's frame scheduler (absent: the window's `requestAnimationFrame`) -- the overlay runs
   * the console's pad on its toggle's frame, while open and only then.
   */
  frame?: InputFrame;
}

export function bootConsole(doc: Document, win: Window, adapters: Adapters, opts: ConsoleOptions): ConsolePage {
  const mode = opts.mode ?? 'page';
  const S = createState(adapters, mode, opts.page ?? null);
  const refit = () => { fit(doc, win, adapters.options.value('uiscale')); };
  // LATER 291 (#473's review, F3): a resize across the phone rule (`./fit` NARROW_PX) re-draws, so the pad stop that
  // depends on it -- the Discord link: the header's above the rule, Home's row at and below it -- follows the control
  // that is shown (a phone turned on its side), not only the next press. A browser adaptation (OT.R28).
  let narrowSide = win.innerWidth <= NARROW_PX;
  // The GitHub link beside it (the owner, 2026-11-12) the same across `./discord` GITHUB_ROW_PX: Home's row up to it,
  // the header's icon above it.
  let githubSide = githubOnRow(win, win.innerWidth <= NARROW_PX);
  const onResize = () => {
    refit();
    const side = win.innerWidth <= NARROW_PX;
    const gh = githubOnRow(win, side);
    if (gh !== githubSide) { githubSide = gh; if (side === narrowSide) { ctl?.render(); return; } }
    // LR-40 (2; the close run's F2): inside the phone rule a resize (a rotation, a window) draws nothing, so the rail's
    // current category is brought back to its centre here, at once (`keepRailCentred`: a new size is never smooth).
    if (side === narrowSide) { if (side && !frozen) keepRailCentred(doc); return; }
    narrowSide = side;
    ctl?.render();
  };
  let ctl: ConsoleController | null = null;
  // Frozen while the hand-over makes the game page: an adapter's change (the disc store's `in-game`) draws nothing over it.
  let frozen = false;
  let editor: MobileLayoutEditor | null = null;
  let stopped = false;
  // INVITE-START (FI.R8, `./adapters/invite`): an invite address's auto-START is checked after each draw.
  let invite: { check(): void; detach(): void } | null = null;
  // CX.R18: the loadout editor's unsaved change marks `<html>`, so the installed app's update shows its notice instead of reloading.
  const markUnsaved = (on: boolean): void => { doc.documentElement.toggleAttribute(UNSAVED_EDIT_MARK, on); };
  const draw = () => {
    if (!ctl || frozen) return;
    renderFrame(doc, ctl.S, ctl.A);
    anchorSourceMenu(doc);                                           // LR-27: one anchor for the disc menu, whichever way it opened
    const ed = ctl.S.screen === 'loadout' ? ctl.A.loadouts?.editor() : undefined;
    markUnsaved((ed?.kind === 'ok' && ed.dirty) || ctl.S.overlay === 'field');   // the joint review's F2: an open field too
    invite?.check();
  };
  /** CX-54: how long a press's mark stays on the root (ms): the focused row's scale, then back. A browser adaptation. */
  const PRESS_MARK_MS = 140;
  let pressMark: ReturnType<typeof setTimeout> | undefined;
  let pressPhase = false;
  const host: Host = {
    editMobileLayout: () => {
      if (editor || stopped) return;
      detach?.(); detach = null;
      frozen = true;
      markUnsaved(true);                                             // CX.R18 (the joint review's F2): an editor open
      editor = openMobileLayoutEditor(doc, () => {
        editor = null;
        markUnsaved(false);
        if (stopped) return;
        frozen = false;
        detach ??= attachInput(doc, win, c, { ...opts, settle: true });   // B61 F3: the editor's Circle held is no press of ours
        refit(); c.render();
      });
    },
    render: draw,
    announce: (t) => { const live = doc.getElementById('live'); if (live) live.textContent = t; },
    // CX-54: the press mark the focused row's scale reads (`data-press`), for one short beat.
    pressed: (b) => {
      const root = doc.documentElement;
      root.dataset['press'] = b;
      pressPhase = !pressPhase;
      root.dataset['pressPhase'] = pressPhase ? 'a' : 'b';
      clearTimeout(pressMark);
      pressMark = setTimeout(() => { delete root.dataset['press']; delete root.dataset['pressPhase']; }, PRESS_MARK_MS);
    },
    fit: refit,
    page: () => pageRows(doc),                                       // CX-12: L2 / R2's page, the list's pane in rows
    scrollDialog: (direction) => {
      const dialog = doc.querySelector<HTMLElement>('#overlay .cx-dialog');
      if (!dialog) return;
      const step = Math.max(1, Math.floor(dialog.clientHeight * 0.75));
      dialog.scrollTop = Math.max(0, Math.min(dialog.scrollHeight - dialog.clientHeight, dialog.scrollTop + direction * step));
    },
    ...(opts.close ? { close: opts.close } : {}),
  };
  ctl = new ConsoleController(S, adapters, host);
  const c = ctl;
  invite = adapters.invite?.attach({ S: c.S, ready: () => startReady(c.S, adapters), start: () => { c.start(); } }) ?? null;
  // OVERLAY-CONSOLE, OT.R60 (d): over a game the console draws no backdrop of its own -- the live game behind the overlay's
  // frame is its background (blurred there, `../modern/overlay/overlay.css`) -- and its ground is transparent
  // (`./console.css`, under `data-console-mode="overlay"`). As the launcher its own backdrop stays.
  const backdrop = doc.getElementById('backdrop');
  const img = doc.querySelector<HTMLImageElement>('#backdrop img');
  if (mode === 'overlay') {
    if (backdrop) backdrop.hidden = true;
    doc.documentElement.dataset['consoleMode'] = 'overlay';
  } else if (img && !img.getAttribute('src')) img.src = BACKDROP_URL;
  let detach: (() => void) | null = attachInput(doc, win, c, opts);
  win.addEventListener('resize', onResize);
  const unsubscribe = adapters.onChange?.(() => { c.render(); });
  // REPLAY-STILLS (a browser adaptation): a replay drawer's map still that fails to load is drawn as the text from then on.
  const stillsOff = attachMapStillFallback(doc, () => { if (!stopped && !frozen) c.render(); });
  const stop = (): void => {
    stopped = true;
    editor?.dispose(); editor = null;
    invite?.detach();
    detach?.();
    detach = null;
    win.removeEventListener('resize', onResize);
    unsubscribe?.();
    stillsOff();
    c.dispose();
    retireRail(doc);                                                  // LR-45's fold: the rail's release held by the document no longer
    markUnsaved(false);
    if (mode === 'overlay') delete doc.documentElement.dataset['consoleMode'];   // OT.R60 (d): this boot's mark only
  };
  // The hand-over (slice 3): no key, pointer or pad of the launcher's while the front end mounts; the launcher's
  // markup removed once it has the window (as `../pageEntry` removes the page's), its adapters' polls ended; the
  // ground under the front end's 640 x 448 frame is the game page's `ps2-look` (`./adapters/launch` `gamePage`).
  // Suspended, the page answers no resize either: `fit` would write its root font-size onto the game page.
  let nav: LauncherNav | null = null;
  host.suspend = () => { detach?.(); detach = null; frozen = true; win.removeEventListener('resize', onResize); };
  host.resume = () => { frozen = false; nav?.release(); detach ??= attachInput(doc, win, c, opts); win.addEventListener('resize', onResize); refit(); c.render(); };
  host.takeDown = () => {
    stop();
    adapters.dispose?.();
    for (const sel of ['.cx-app', '#backdrop', '#overlay', '#toast', '#live']) doc.querySelector(sel)?.remove();
  };
  // CX-33..36: page mode owns the window's history. Overlay mode is an iframe and must not push (CX.R16).
  if (mode !== 'overlay') {
    const base = import.meta.env.BASE_URL ?? '/';
    nav = launcherNav(win, base, {
      apply: (snap) => c.applySnap(snap),
      drawn: () => { nav?.sync(c.S, c.A); },
      block: (dest) => loadoutHistoryBlocked(c.S, dest, c.A),
      blocked: () => {
        c.S.overlay = 'confirm';
        c.S.confirmKind = 'loadout-leave';
        c.S.confirmRow = 0;
        c.render();
      },
    });
    nav.adopt(c.S, c.A);
    c.useNav(nav);
  }
  refit();
  c.render();
  c.quickSignIn();                                                   // PERSONA-PERSIST (a) (OT.R61): the launcher's load only
  return {
    ctl: c,
    render: () => { c.render(); },
    dispose: stop,
  };
}
