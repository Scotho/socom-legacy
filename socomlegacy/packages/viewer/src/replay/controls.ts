import type { ReplayClient } from './replayClient';

/**
 * The replay's controls (web sprint 35 PT-18; spec 4.8; research 244 §1). REPLAY_ADAPTATION: a browser adaptation with
 * no original -- SOCOM II has no replay and no such bar -- labelled as one, `?devmode` on a development build only, and
 * changing no game value or behaviour (PT.R3).
 *
 * The keys: Space play/pause, `,` and `.` one snapshot back and on, `[` and `]` the speed down and up the table
 * (`REPLAY_SPEEDS_PLACEHOLDER`, `./clock`), Home the round's first tick (`ReplayClient.seekStart`, RE-6: the first
 * `roundStart`, else the recording's start; research 249 §2) and End the recording's end. They are taken on the window's
 * capture phase and stopped there, so the page's own listeners (the spectator's keyup, `./spectatorView`, where Space is
 * "next"; the fly camera's lift) do not also act on them; the spectator keeps its other keys and its pad (W35.R8: in
 * this mode Space is the replay's and the spectator's "next" is ArrowRight and the pad's Right; the live spectator's
 * Space, PF.R51, is unchanged -- research 244 §3). A small bar at the foot of the page says the mode, play or pause, the speed, the tick of the
 * end, and "partial" for a live segment's prefix.
 */

export type ReplayAction = 'toggle' | 'back' | 'forward' | 'slower' | 'faster' | 'start' | 'end';

/** The keys (`KeyboardEvent.code`) and what each does. */
export const REPLAY_KEYS: Readonly<Record<string, ReplayAction>> = Object.freeze({
  Space: 'toggle', Comma: 'back', Period: 'forward', BracketLeft: 'slower', BracketRight: 'faster', Home: 'start', End: 'end',
});

type Controlled = Pick<ReplayClient, 'toggle' | 'step' | 'slower' | 'faster' | 'seekStart' | 'seekEnd'>;

const RUN: Record<ReplayAction, (c: Controlled) => void> = {
  toggle: (c) => { c.toggle(); },
  back: (c) => { c.step(-1); },
  forward: (c) => { c.step(1); },
  slower: (c) => { c.slower(); },
  faster: (c) => { c.faster(); },
  start: (c) => { c.seekStart(); },
  end: (c) => { c.seekEnd(); },
};

/** What a key does to the replay, or null for a key that is not the replay's. */
export function replayKeyAction(code: string): ((c: Controlled) => void) | null {
  const a = Object.hasOwn(REPLAY_KEYS, code) ? REPLAY_KEYS[code]! : null;
  return a ? RUN[a] : null;
}

/** The bar's line: the mode, play or pause, the speed, the tick and the end, partial. */
export function barText(c: Pick<ReplayClient, 'playing' | 'rate' | 'serverTick' | 'span' | 'partial' | 'state'>): string {
  if (c.state === 'connecting') return 'REPLAY -- loading the recording';
  if (c.state !== 'open') return 'REPLAY -- the recording is not playing';
  const { end } = c.span();
  return `REPLAY  ${c.playing() ? 'playing' : 'paused'}  ${c.rate()}x  tick ${Math.floor(c.serverTick())} / ${end}${c.partial() ? '  partial' : ''}` +
    '  -- Space play/pause, , . step, [ ] speed, Home End';
}

/** Mounts the bar and the keys; `render` once a frame, `dispose` to take both away. */
export function mountReplayBar(doc: Document, client: ReplayClient): { render(): void; dispose(): void } {
  const bar = doc.createElement('div');
  bar.dataset['replayBar'] = '';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:50;padding:4px 10px;font:12px/1.4 monospace;'
    + 'color:#e8e8e8;background:rgba(0,0,0,0.6);pointer-events:none;white-space:pre';
  doc.body.appendChild(bar);
  const view = doc.defaultView;
  const onKey = (e: KeyboardEvent): void => {
    const target = e.target as { tagName?: string } | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
    const run = replayKeyAction(e.code);
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'keydown' && !e.repeat) run(client);
  };
  view?.addEventListener('keydown', onKey, true);
  view?.addEventListener('keyup', onKey, true);
  let shown = '';
  return {
    render(): void {
      const text = barText(client);
      if (text !== shown) { bar.textContent = text; shown = text; }
    },
    dispose(): void {
      view?.removeEventListener('keydown', onKey, true);
      view?.removeEventListener('keyup', onKey, true);
      bar.remove();
    },
  };
}
