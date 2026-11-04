/**
 * OBF-4 (OBF.R4, the owner 2026-10-30: "In that match end, do a post-match warning and a window.reload()"; a browser and
 * service adaptation with no original -- the console had no server to update): the page's side of a placed game closed at
 * its match's end because its host's update is pending (`./net/protocol` `SERVER_UPDATE_CLOSE`, sent by
 * `match/src/game.ts` in place of the return to the game's lobby). The page shows a warning over whatever the front end
 * draws, then reloads, so it comes back on the release the host updates to. Called by the lobby's match (`./lobbyMatch`)
 * and the game lobby's socket (`./gameLobbyHost`); nothing here runs while a round is played or when no update is pending.
 */

/** The post-match warning's words (an adaptation: no original line; product taste). */
export const SERVER_UPDATE_NOTICE_ADAPTATION = 'The server is updating. This page will reload in a moment.';

/** How long the warning shows before the reload, ms (an adaptation: long enough to read it; product taste). */
export const SERVER_UPDATE_RELOAD_MS_ADAPTATION = 5000;

/** The page's ports: its document (null once torn down), its reload, and its timer (absent, `setTimeout`). */
export interface ServerUpdatePorts {
  doc: Document | null;
  reload: () => void;
  wait?: (ms: number, f: () => void) => void;
}

/**
 * The warning shown at once (one per document: a second call adds none and schedules no second reload), then the reload
 * after `SERVER_UPDATE_RELOAD_MS_ADAPTATION`. With no document the reload is still scheduled.
 */
export function serverUpdateReturn(o: ServerUpdatePorts): void {
  const doc = o.doc;
  if (doc?.querySelector('[data-server-update]')) return;
  if (doc?.body) {
    const bar = doc.createElement('div');
    bar.setAttribute('data-server-update', '');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;z-index:20001;left:50%;top:40%;transform:translateX(-50%);width:max-content;max-width:min(28rem,calc(100vw - 32px));padding:14px 18px;background:#000e11;color:#e7eef2;border:1px solid #c4a04a;font:16px/1.35 system-ui,sans-serif;text-align:center';
    bar.textContent = SERVER_UPDATE_NOTICE_ADAPTATION;
    doc.body.appendChild(bar);
  }
  (o.wait ?? ((ms, f) => { setTimeout(f, ms); }))(SERVER_UPDATE_RELOAD_MS_ADAPTATION, o.reload);
}

/** The page's own: its document and `window.location.reload()` (the front end's wiring, `./frontEnd`). */
export function pageServerUpdate(): void {
  const doc = typeof document === 'undefined' ? null : document;
  serverUpdateReturn({ doc, reload: () => { globalThis.location?.reload(); } });
}
