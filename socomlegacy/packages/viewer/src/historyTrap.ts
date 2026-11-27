import { ACCOUNT_SERVICE_ABSENT_LABEL, ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION } from './connectHost';

/**
 * ROUTE-GUARD's page half (`./menuRoutes` `HISTORY_TRAP_IN_GAME_ADAPTATION`; product track, a browser adaptation with no
 * original): when the game is on (`gameHeld`) and the browser's Back or Forward is refused, the page says so in a line of
 * its own -- the house style of `./connectHost`'s signed-in-elsewhere line: one `<p>` over the page, the design system's
 * `s2u-notice`, `ACCOUNT_SERVICE_ABSENT_LABEL` in `<b>`, no pointer, the window's top right -- for
 * `HISTORY_TRAP_NOTICE_MS_ADAPTATION`, one element at most (a second refusal restarts its time). Never drawn on the game's
 * screen and never one of the game's strings. The words are agreed with the Xbox lightweight fork's own trap, which shows
 * the same. Nothing the game does changes.
 */

/** The notice's words (the page's own, agreed with the Xbox fork's matching trap). */
export const HISTORY_TRAP_NOTICE_TEXT = "Back is turned off during a match. Use the game's menu to leave." as const;

/** An adaptation: how long the notice stays up after the last refusal (ms). */
export const HISTORY_TRAP_NOTICE_MS_ADAPTATION = 4000;

/** The notice's element id (one line at most on the page). */
export const HISTORY_TRAP_NOTICE_ID = 'history-trap-notice' as const;

/**
 * The front end's own game state, whichever engine mounts the match (the standard one or the Xbox lightweight loader,
 * both under `LobbyMatch`): a game joined on the game lobby's socket (`GameSocketHost.joined`, from its welcome through the
 * GAME LOBBY and back to it after a match), or the match loading or up (`LobbyMatch.phase`). Nothing of a mount is read.
 */
export interface GameState {
  gameLobby: { socket: { joined(): boolean } | null };
  match: { phase: string };
}

/** `HISTORY_TRAP_IN_GAME_ADAPTATION`'s arming: a game joined, loading or in a match. */
export function gameHeld(s: GameState): boolean {
  return s.gameLobby.socket?.joined() === true || s.match.phase === 'loading' || s.match.phase === 'match';
}

/** The notice: `show` (again: the same element, its time restarted), `clear`. */
export interface HistoryTrapNotice {
  show(): void;
  clear(): void;
}

export function historyTrapNotice(doc: Document): HistoryTrapNotice {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = (): void => { if (timer !== null) { globalThis.clearTimeout(timer); timer = null; } };
  const clear = (): void => { stopTimer(); doc.getElementById(HISTORY_TRAP_NOTICE_ID)?.remove(); };
  return {
    show: () => {
      let el = doc.getElementById(HISTORY_TRAP_NOTICE_ID);
      if (!el) {
        el = doc.createElement('p');
        el.id = HISTORY_TRAP_NOTICE_ID;
        el.className = 's2u-notice';
        el.setAttribute('role', 'status');
        el.dataset['adaptation'] = 'HISTORY_TRAP_IN_GAME_ADAPTATION';
        el.style.position = 'fixed';
        el.style.top = '8px';
        el.style.right = '8px';
        el.style.maxWidth = ACCOUNT_SERVICE_ABSENT_MAX_WIDTH_ADAPTATION;
        el.style.overflowWrap = 'anywhere';
        el.style.margin = '0';
        el.style.zIndex = '1001';
        el.style.pointerEvents = 'none';
        const label = doc.createElement('b');
        label.textContent = ACCOUNT_SERVICE_ABSENT_LABEL;
        el.replaceChildren(label, HISTORY_TRAP_NOTICE_TEXT);
        doc.body.append(el);
      }
      stopTimer();
      timer = globalThis.setTimeout(() => { timer = null; doc.getElementById(HISTORY_TRAP_NOTICE_ID)?.remove(); }, HISTORY_TRAP_NOTICE_MS_ADAPTATION);
    },
    clear,
  };
}

/**
 * `./frontEnd`'s hook: `connectMenuRoutes`' `inGame` and `refused` over the session's own game state and the page's
 * notice; `stopped`, the router's stop (the page's), takes the notice down at once, its time with it. The router reads it
 * only after the launcher's START hand-off (the front end mounts after it).
 */
export function historyTrapOf(doc: Document, s: GameState): { inGame: () => boolean; refused: () => void; stopped: () => void } {
  const notice = historyTrapNotice(doc);
  return { inGame: () => gameHeld(s), refused: () => { notice.show(); }, stopped: () => { notice.clear(); } };
}
