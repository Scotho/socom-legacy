import type { Say, SayWithdrawn } from '../../match/src/noticeHold';
import type { BriefingRoomTransport, ChatLinesReplyWithSays } from './briefingRoomHost';
import type { PadSource } from './gamepad';
import { crossTaken, GamePad, takeCrossPress } from './setupPad';

/**
 * OA-3 (the operator announcement plan, OA.R1-R5; spec 2026-11-07 §4.3; product track, a browser adaptation with no
 * original -- SOCOM II's server never sent a player a free-text message in a round): the page's toast for an operator's
 * say. Central's poll (`/lobby/chat-lines`, `says`, read by `./briefingRoomHost` `chatReplyOf`) is the one channel
 * (OA.R2); `saysFor` keeps the says the page's game takes; one DOM panel shows them one at a time. The restart notice
 * and every `system` entry keep the original's routing (`FUN_0030dce0` through `BriefingRoomChat.systemMessage`,
 * OA.R1): nothing of a say goes there, nor to the HUD's message window, the disc's popup or the chat line.
 *
 * The panel: `role=status`, `aria-live=polite`, at z-index 20000 (the page's toasts: above the canvas 1000 and the loading
 * screen 19000, below the server-update alert 20001), in that alert's colours and font stack (`./serverUpdate`); the text
 * wrapped, at most `SAY_TOAST_LINES_ADAPTATION` lines shown (the rest scrolls inside); one OK button. It closes on OK, on
 * Escape (OT.R62; taken ahead of the page's own listeners, so a menu under it closes at the next press), on the pad's
 * Cross (a fresh press, on its down edge, taken from the game: `./setupPad` `takeCrossPress`), or on a click or tap anywhere on it -- never on
 * its own (the say's `until` is central's, for newcomers). A closed id is remembered for the tab (`sessionStorage`), so
 * the poll's repeat never reopens it; a second say queues; a withdrawal closes it or drops it from the queue. Not hidden
 * in a match (the update notice's rule, `./pwa/update`, is that notice's). Dedupe is by id against the seen set only --
 * never the `system` watermark (OA-2: central repeats every live say and every pending withdrawal on each poll).
 */

/** SAY_TOAST_LINES_ADAPTATION: the lines of a say's text the panel shows before it scrolls inside (spec 4.4, OA.R5). An adaptation, no original. */
export const SAY_TOAST_LINES_ADAPTATION = 6;

/** The z-index of the page's toasts: above the loading screen (19000), below the server-update alert (20001). */
const SAY_TOAST_Z = 20000;
/** The `sessionStorage` key of the says closed (or withdrawn) in this tab: their ids, a JSON array. */
const CLOSED_IDS_SLOT = 's2u.operatorSay.closed';
/** The ids kept in that key at most (the newest): a long session never grows it without bound. */
const CLOSED_KEPT = 64;
const LINE_HEIGHT = 1.35;

export interface OperatorToast {
  /** A say the page takes (`saysFor`): shown now, queued behind the open one, or nothing when seen, queued or closed already. */
  show(say: Say): void;
  /** A say withdrawn: closed if open (the next queued shown), dropped if queued, remembered; an unknown id remembered only. */
  withdraw(id: number): void;
  /** The panel and every listener removed. */
  dispose(): void;
  /** The say open now, or null. */
  open(): Say | null;
}

/** The pad's Cross for the toast: `f` at each press, let go by the answer. */
export interface CrossPad { onCross(f: () => void): () => void }

/** The says a page shows: every --all; a --game say only when `gameId` is that game; a say withdrawn in the same reply never; every withdrawal handed on. */
export function saysFor(says: readonly (Say | SayWithdrawn)[], gameId: number | null): { show: Say[]; withdraw: number[] } {
  const withdraw = says.filter((s): s is SayWithdrawn => 'withdrawn' in s).map((s) => s.id);
  const gone = new Set(withdraw);
  const show = says.filter((s): s is Say => !('withdrawn' in s) && !gone.has(s.id) && (s.game === undefined || (gameId !== null && s.game === gameId)));
  return { show, withdraw };
}

/** The transport with its poll's reply passed on unchanged and its `says` handed to `says` first; the other requests untouched. */
export function withSays(t: BriefingRoomTransport, says: (list: readonly (Say | SayWithdrawn)[], ticket: string) => void): BriefingRoomTransport {
  const poll = t.chatLines;
  if (!poll) return t;
  return {
    ...t,
    chatLines: (ticket) => poll.call(t, ticket).then((r) => {
      if (r !== null && typeof r === 'object' && !Array.isArray(r)) { const list = (r as ChatLinesReplyWithSays).says; if (list) says(list, ticket); }
      return r;
    }),
  };
}

/**
 * The page's Cross (OA-3's review fold F2): the next fresh Cross, taken from the game by the seam every game reader goes
 * through (`./setupPad` `takeCrossPress`, in `GamePad.poll`) -- on its down edge, whichever reader polls it first; a Cross
 * already held when it subscribes is no press. While subscribed the toast's own reader (`GamePad`, `ownsCross`: the setup's
 * device and bindings) polls each animation frame, so the press is seen where no game reader polls (the loading hold);
 * fold 2 F3: let go while a taken press is held, it polls on until the release, so the mask never outlasts the toast.
 */
export function gamepadCross(win: Window): CrossPad {
  const nav = win.navigator as unknown as PadSource | undefined;
  let pad: GamePad | null = null;
  return {
    onCross(f) {
      let frame: number | null = null;
      let live = true;
      const off = takeCrossPress(() => { if (live) f(); });
      const step = (): void => {
        frame = null;
        if (!live && !crossTaken()) return;
        pad ??= new GamePad({ releaseCrouch: false, waitForRest: false, ownsCross: true });
        if (nav) pad.poll(nav);
        if ((live || crossTaken()) && frame === null) frame = win.requestAnimationFrame(step);
      };
      frame = win.requestAnimationFrame(step);
      return () => {
        live = false;
        off();
        if (frame !== null && !crossTaken()) { win.cancelAnimationFrame(frame); frame = null; }
        else if (frame === null && crossTaken()) frame = win.requestAnimationFrame(step);   // let go inside its own poll
      };
    },
  };
}

/** The closed ids as the tab's Storage holds them; none on a null, absent or refusing Storage. */
/** What the toast keeps its closed ids in: the tab's storage through `./pageStore` (`tabSettings`), or null. */
export type SayMemory = Pick<Storage, 'getItem' | 'setItem'>;

function readClosed(remember: SayMemory | null): number[] {
  try {
    const v = JSON.parse(remember?.getItem(CLOSED_IDS_SLOT) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => Number.isSafeInteger(x)) : [];
  } catch { return []; }
}

/** One panel for the page's says (see the module's head). `remember`: the tab's storage (`./pageStore` `tabSettings`), or null (in memory only). */
export function operatorToast(doc: Document, pad: CrossPad, remember: SayMemory | null): OperatorToast {
  const closed = new Set<number>(readClosed(remember));
  const queue: Say[] = [];
  let current: Say | null = null;
  let panel: HTMLElement | null = null;
  let offCross: (() => void) | null = null;
  const win = doc.defaultView;
  const log = (what: string, id: number): void => { if (import.meta.env.DEV) console.info(`operator say ${id}: ${what}`); };

  const keep = (id: number): void => {
    closed.add(id);
    try { remember?.setItem(CLOSED_IDS_SLOT, JSON.stringify([...closed].slice(-CLOSED_KEPT))); } catch { /* a refusing Storage: in memory only */ }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();                     // the toast first; the menu under it at the next press
    close();
  };
  const take = (): void => {
    panel?.remove();
    panel = null;
    offCross?.();
    offCross = null;
    win?.removeEventListener('keydown', onKey, true);
  };
  const draw = (s: Say): void => {
    const p = doc.createElement('div');
    p.setAttribute('data-operator-say', String(s.id));
    p.setAttribute('data-severity', String(s.severity));
    p.setAttribute('role', 'status');
    p.setAttribute('aria-live', 'polite');
    // The lower third, over the HUD's message window area, clear of the reticle (the centre) and the compass (the top).
    p.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);box-sizing:border-box;width:max-content;'
      + 'max-width:60vw;padding:12px 16px;background:#000e11;color:#e7eef2;border:1px solid #c4a04a;'
      + `font:16px/${LINE_HEIGHT} system-ui,sans-serif;text-align:left;cursor:pointer;pointer-events:auto`;
    p.style.zIndex = String(SAY_TOAST_Z);
    p.style.borderLeftWidth = s.severity >= 1 ? '6px' : '1px';   // `--warn` (SAY_WARN_SEVERITY_ADAPTATION): the accent
    const text = doc.createElement('div');
    text.setAttribute('data-operator-say-text', '');
    text.style.cssText = 'white-space:normal;overflow-wrap:anywhere;overflow-y:auto';
    text.style.maxHeight = `calc(${LINE_HEIGHT}em * ${SAY_TOAST_LINES_ADAPTATION})`;
    text.textContent = s.text;
    const ok = doc.createElement('button');
    ok.type = 'button';
    ok.textContent = 'OK';
    ok.style.cssText = 'display:block;margin:10px 0 0 auto;padding:4px 18px;background:transparent;color:#e7eef2;border:1px solid #c4a04a;font:inherit;cursor:pointer';
    p.append(text, ok);
    p.addEventListener('click', (e) => { e.stopPropagation(); close(); });   // OK, or a click or tap anywhere on it
    doc.body.appendChild(p);
    panel = p;
  };
  const next = (): void => {
    current = queue.shift() ?? null;
    if (!current) return;
    draw(current);
    offCross = pad.onCross(() => { close(); });
    win?.addEventListener('keydown', onKey, true);
  };
  function close(): void {
    if (!current) return;
    keep(current.id);
    log('closed', current.id);
    take();
    current = null;
    next();
  }
  return {
    show(s) {
      if (closed.has(s.id) || current?.id === s.id || queue.some((q) => q.id === s.id)) return;
      log(`show${s.game !== undefined ? ` (game ${s.game})` : ' (all)'}`, s.id);
      queue.push(s);
      if (!current) next();
    },
    withdraw(id) {
      const queued = queue.findIndex((q) => q.id === id);
      if (current?.id === id || queued >= 0) log('withdrawn', id);
      if (queued >= 0) queue.splice(queued, 1);
      if (current?.id === id) close();
      else keep(id);
    },
    dispose() { take(); current = null; queue.length = 0; },
    open: () => current,
  };
}
