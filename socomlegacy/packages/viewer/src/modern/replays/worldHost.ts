import type { NetClient, NetOptions, NetWalk } from '../../net/client';
import type { ReplayPageHooks } from '../../replay/mount';
import type { SpectatorKey, SpectatorMode } from '../../spectatorView';
import type { HandedDiscRequest } from '../../discSource';

/**
 * The replay viewer's world, the test room's side of the seam (MU-11 of `docs/plans/2026-10-09-modern-ui-parallel.md`;
 * MU.R9). A browser adaptation (MU.R1, REPLAY_ADAPTATION): SOCOM II plays no recording back; nothing here is a game
 * value, and nothing here changes one.
 *
 * The match's world is drawn by the game page -- `../../main.ts`, the test room, built around one map and one canvas --
 * and the modern shell lives on the setup page, a different page that never imports it (`../../pageEntry`). So the
 * viewer (`./worldStage`) opens the test room in a frame of the shell's page, on the recording's map, and hangs this
 * **host** on the frame element under `REPLAY_WORLD_KEY` (a registered symbol: one key across the two pages' realms).
 * The test room reads it once (`replayWorldHost`): only when its address asks (`REPLAY_WORLD_PARAM`, `replayview`) and
 * its frame element carries a well-formed host -- `window.frameElement` is null on a top page and under a parent of
 * another origin, so only a same-origin page that framed it can hand it one. Then `main.ts` builds the watcher's
 * `NetPage` the replay mode builds (PT-18), its client the host's (`replayWorldDeps`), and hands the host the page's
 * spectator view (`attached`).
 *
 * What crosses, all in memory and nothing in the address or in storage: the client factory (the existing
 * `ReplayClient`, made in the shell's page on the segment that page fetched -- the session's ticket never leaves it),
 * the disc the setup page opened (its request, `disc`: an image or, DA-4, a folder), and back the spectator view, or the page's failure in its own
 * words (`failed`), and (RV2-03) the word that its loading screen has gone (`ready`). Framed, the test room keeps to
 * itself (MU-11 review): no reCOM play, no map remembered in storage,
 * no players poller of its own (`main.ts`). Without the host, the test room is exactly as it was, its developer's
 * replay mode (`?devmode&replay=`, `../../replay/mount`) included. None of it is a development build's: `/testroom` and
 * its `replay` capability are the release build's too (`TESTROOM_CAPABILITIES`).
 */

/** The address's parameter that asks for the world (`testroom?replayview&map=<stem>`). */
export const REPLAY_WORLD_PARAM = 'replayview';

/** The frame element's key for the host: `Symbol.for`, so the shell's page and the test room's realm share it. */
export const REPLAY_WORLD_KEY: unique symbol = Symbol.for('s2u.replay-world') as never;

/** What the shell's page reads of the test room's spectator view (`../../spectatorView` `SpectatorView`). */
export interface ReplayWorldSpectator {
  readonly mode: SpectatorMode;
  readonly remembered: SpectatorMode;
  /** The view's own keys (its original's controls, on release): the camera's buttons press them. */
  key(e: SpectatorKey): boolean;
}

/** What the test room hands back once its page is built. */
export interface ReplayWorldPage { spectator: ReplayWorldSpectator }

/** The host the viewer hangs on the frame element. */
export interface ReplayWorldHost {
  /**
   * The disc the setup page opened (memory only), as its request -- an image, or a folder (DA-4), or (LATER 322) the copy
   * kept in this browser the launcher started from (`{ kind: 'stored' }`) -- or null: the test room's own disc page asks
   * for one.
   */
  disc(): HandedDiscRequest | null;
  /**
   * `NetPageDeps.client`: the recording's client for the page's watcher (PT-18's factory, `../../netPage`). `page`
   * (RV-7c-2, additive): the test room's own hooks -- its thrower's records and its hull (`../../replay/mount`
   * `ReplayPageHooks`) -- for the client's seek fold, functions of the frame's realm read at each fold; absent, the fold's
   * baked throwables and no smoke folded, as before.
   */
  client(opts: NetOptions, walk: NetWalk, page?: ReplayPageHooks): NetClient;
  /** The page is built: its spectator view, for the viewer's camera buttons. */
  attached(page: ReplayWorldPage): void;
  /** The page could not build its room (its disc refused, a decode failed, no renderer): the sentence it says. */
  failed(reason: string): void;
  /**
   * RV2-03 (RV2.R2; optional, additive): the page's loading screen has gone -- its loading hold released, or failed and the
   * map shown as it is (`main.ts`, `loadingJoin`'s `released || failed`) -- told at each such hide. The viewer's recording
   * stands held until it (`./worldStage`). A host without it is still a host: nothing is told.
   */
  ready?(): void;
}

/** Hangs `host` on the frame element (the viewer's side). */
export function installReplayWorld(frame: HTMLIFrameElement, host: ReplayWorldHost): void {
  (frame as unknown as Record<symbol, ReplayWorldHost>)[REPLAY_WORLD_KEY] = host;
}

/** Takes the host off the frame element (the viewer's dispose). */
export function uninstallReplayWorld(frame: HTMLIFrameElement): void {
  delete (frame as unknown as Record<symbol, unknown>)[REPLAY_WORLD_KEY];
}

/** The test room's host: asked by the address and carried by a same-origin frame element, else null. Never throws. */
export function replayWorldHost(win: { frameElement: Element | null } | undefined, search: string): ReplayWorldHost | null {
  try {
    if (!new URLSearchParams(search).has(REPLAY_WORLD_PARAM)) return null;
    const frame = win?.frameElement;
    if (!frame) return null;
    const host = (frame as unknown as Record<symbol, unknown>)[REPLAY_WORLD_KEY] as Partial<ReplayWorldHost> | undefined;
    if (!host || typeof host.disc !== 'function' || typeof host.client !== 'function' || typeof host.attached !== 'function' || typeof host.failed !== 'function') return null;
    if (host.ready !== undefined && typeof host.ready !== 'function') return null;     // RV2-03: optional, but a function when there
    return host as ReplayWorldHost;
  } catch {
    return null;
  }
}

/**
 * The page's deps for the world's watcher: the host's client factory (`NetPageDeps.client`), handed the page's own hooks
 * (`page`, RV-7c-2: the thrower's records and the hull, as the developer's replay mode hands `replayClient` them).
 */
export function replayWorldDeps(host: ReplayWorldHost, page?: ReplayPageHooks): { client: (opts: NetOptions, walk: NetWalk) => NetClient } {
  return { client: (opts, walk) => host.client(opts, walk, page) };
}

/**
 * The test room entered as the world, once at its start: its own chrome away (the backtick's `chrome-hidden` state, and
 * the site bar), and the handed disc (an image or, DA-4, a folder) opened by its own `openDisc` (a folder checked first,
 * DA.R8) when nothing is served -- as an image dropped
 * while the page came up is (`main.ts` `bootSource`'s pending disc). The kept copy (LATER 322) is asked as an image is
 * (`../../discSource` `discOpener`). No disc handed: the test room's own disc page asks.
 */
export function enterReplayWorld(doc: Document, host: ReplayWorldHost, openDisc: (disc: HandedDiscRequest) => void, served: boolean): void {
  doc.body.classList.add('chrome-hidden');
  const bar = doc.getElementById('site-links');
  if (bar) bar.style.display = 'none';
  if (served) return;
  const disc = host.disc();
  if (disc) openDisc(disc);
}
