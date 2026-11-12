import type { ReplayPlayer, ReplayRecord } from '../../../../match/src/replay/format';
import type { ServerEvent, Team } from '../../net/protocol';
import { icon, type IconName } from '../icons';
import type { SpectatorControls } from './stage';
import { clockText, type TransportClient } from './transport';
import { SEEK_TOAST_MS, seekToastText } from './transportStrings';

/**
 * RB-34 (the replay batch plan, `docs/plans/2026-11-08-replay-batch.md`; the owner's "S2 Launcher v2" export, RB.R3, its
 * world HUD `D:284-320`, its logic `D:956-959`, `D:1036-1042`, and its seek note `D:841-842`): the replay viewer's HUD over
 * the framed world. A browser adaptation (OT.R53, product track), labelled as one: SOCOM II plays no recording back and
 * draws none of this; it is read from the recording's own events and changes nothing the world does.
 *
 * **What the framed world already draws.** The world in the frame is the test room's own page run on the replay client
 * (`./worldStage`), and that page posts the original's kill line for each recorded `kill` into the game's message window
 * (`../../netPage.ts` `case 'kill'`: `hud.postMessage(killLine(...))`, research 91 §10) and draws the game's round clock
 * from the recorded `score` (`hud.setScoreRows`). So the feed and the clock here are the viewer's adaptation beside the
 * game's own, in the design's look -- never a stand-in for them.
 *
 * Read each frame from the client's records at its tick (`killFeed`, `liveScore`, `roundClock`, pure; the events of
 * `../../net/protocol` `ServerEvent`: `kill`, `roundStart`, `roundOver`, `score`, `roundTime`, `timeExpired`,
 * `abandoned`; the roster from the `players` records):
 * - *The kill feed* (top left, `D:285-290`, `D:956-959`): the last `REPLAY_HUD_FEED_MAX_ADAPTATION` kills within
 *   `REPLAY_HUD_FEED_SECONDS_ADAPTATION` of the playhead, newest first; each the killer, the weapon (" · HS" when the
 *   room's death cause is the head, `kill.cause` 3) and the victim, in their sides' colours; full until
 *   `REPLAY_HUD_FEED_FADE_FROM_SECONDS_ADAPTATION`, then fading to none at the window's end. A kill by or of the viewer's
 *   persona (the session's player name) is tinted gold, the persona's name in gold (`data-you`). A fall or a suicide
 *   names its victim alone; a hostage's death draws no line (the game's own posts none: `../../netPage.ts`'s hostage case).
 * - *The live score* (top right under the cameras, `D:292-294`): the rounds each side has won by the playhead (the
 *   last `roundStart` / `roundOver` wins), and between them "ROUND n", "FINAL" at the recording's end.
 * - *ROUND TIME* (bottom right, `D:314-318`): the recorded round's own clock -- its `roundStart` seconds, corrected by
 *   the room's `score.timeLeft` and `roundTime`, held by `clockHeld`, stopped at its `roundOver` -- never the design's
 *   fixed 360; gold under `REPLAY_HUD_CLOCK_LOW_SECONDS_ADAPTATION`.
 * - *The camera badge* (bottom left, `D:308-313`): the spectator mode's mark and "PLAYER CAMERA" / "FREE CAMERA" /
 *   "SCENIC CAMERA". The followed player's name under it is RB-35's to add (the follow by id, `./worldStage`).
 * - *The paused centre button* (`D:303-307`): shown while the recording is paused (not held), its mark the replay arrow
 *   at the end; a click asks the caller's toggle (the transport's own, `act('toggle')`). Not a native button: the
 *   transport's play is the control the pad walks and the reader names, so this is the pointer's shortcut only.
 * - *The seek note* (`D:319`, `D:841-842`): a toast in the export's words with the time it landed on
 *   (`seekToastText`) for `SEEK_TOAST_MS`, handed over by the transport (`TransportOptions.onSeekNote`).
 * Every name is set as text, never as markup. The sheet is `../../console/replay.css`'s HUD section.
 */

/** RB-34: the kill feed's window, seconds of the recording behind the playhead (the export's `k.t > t - 6`, `D:956`). */
export const REPLAY_HUD_FEED_SECONDS_ADAPTATION = 6;
/** RB-34: the kill feed's longest list (the export's `.slice(-4)`, `D:956`). */
export const REPLAY_HUD_FEED_MAX_ADAPTATION = 4;
/** RB-34: a feed line stands full this long, then fades to the window's end (the export's `age < 4.2`, `D:959`). */
export const REPLAY_HUD_FEED_FADE_FROM_SECONDS_ADAPTATION = 4.2;
/** RB-34: the round clock turns gold under this many seconds (the export's `remain < 30`, `D:1041`). */
export const REPLAY_HUD_CLOCK_LOW_SECONDS_ADAPTATION = 30;

/** The kill's death cause for the head (`../../net/protocol` `kill.cause`: "3 its head"). */
const HEAD_CAUSE = 3;

type Kill = Extract<ServerEvent, { type: 'kill' }>;
export interface FeedSide { name: string; team: Team | null; you: boolean }
export interface FeedEntry {
  tick: number;
  /** Null for a fall, a suicide or a world kill: the victim alone. */
  killer: FeedSide | null;
  victim: FeedSide;
  weapon: string;
  hs: boolean;
  /** By or of the persona. */
  mine: boolean;
  /** 1 to `REPLAY_HUD_FEED_FADE_FROM_SECONDS_ADAPTATION`, then down to 0 at the window's end. */
  opacity: number;
}

/** The records the HUD reads, kept apart once per record count: the rosters and the events it names. */
type Read = { tick: number; players?: readonly ReplayPlayer[]; event?: ServerEvent };
const READ_EVENTS: ReadonlySet<string> = new Set(['kill', 'roundStart', 'roundOver', 'score', 'roundTime', 'timeExpired', 'abandoned']);
const readCache = new WeakMap<readonly ReplayRecord[], { length: number; reads: Read[] }>();
function readsOf(records: readonly ReplayRecord[]): Read[] {
  const kept = readCache.get(records);
  if (kept && kept.length === records.length) return kept.reads;
  const reads: Read[] = [];
  for (const r of records) {
    if (r.kind === 'players') reads.push({ tick: r.tick, players: r.players });
    else if (r.kind === 'event' && READ_EVENTS.has(r.event.type)) reads.push({ tick: r.tick, event: r.event });
  }
  readCache.set(records, { length: records.length, reads });
  return reads;
}

/**
 * RB-34: the kill feed at `tick` -- the last `REPLAY_HUD_FEED_MAX_ADAPTATION` recorded kills at or before it and within
 * `REPLAY_HUD_FEED_SECONDS_ADAPTATION`, newest first, each named by the roster played by then. Pure.
 */
export function killFeed(records: readonly ReplayRecord[], tick: number, tickHz: number, persona: string | null): FeedEntry[] {
  const hz = tickHz > 0 ? tickHz : 1;
  const out: FeedEntry[] = [];
  let roster = new Map<number, ReplayPlayer>();
  const side = (id: number): FeedSide => {
    const p = roster.get(id);
    const name = p?.name ?? `Player ${id}`;
    return { name, team: p?.team ?? null, you: persona !== null && p !== undefined && p.name === persona };
  };
  for (const r of readsOf(records)) {
    if (r.tick > tick) continue;
    if (r.players) { roster = new Map(r.players.map((p) => [p.id, p])); continue; }
    const e = r.event;
    if (e?.type !== 'kill' || e.victimKind === 'hostage') continue;
    const age = (tick - r.tick) / hz;
    if (age >= REPLAY_HUD_FEED_SECONDS_ADAPTATION) continue;
    out.push(entryOf(e, r.tick, age, side, persona));
  }
  return out.slice(-REPLAY_HUD_FEED_MAX_ADAPTATION).reverse();
}

function entryOf(e: Kill, tick: number, age: number, side: (id: number) => FeedSide, persona: string | null): FeedEntry {
  const victim = side(e.victim);
  const kept = (e as { killerName?: unknown }).killerName;
  const killer = e.how === 'suicide' || e.how === 'fall' || e.killer === e.victim ? null
    : e.killer !== null ? side(e.killer)
      : typeof kept === 'string' ? { name: kept, team: null, you: persona !== null && kept === persona } : null;
  const fade = REPLAY_HUD_FEED_SECONDS_ADAPTATION - REPLAY_HUD_FEED_FADE_FROM_SECONDS_ADAPTATION;
  return {
    tick, killer, victim,
    weapon: e.weapon ?? (e.how === 'fall' ? 'Fall' : ''),
    hs: e.cause === HEAD_CAUSE,
    mine: victim.you || killer?.you === true,
    opacity: age < REPLAY_HUD_FEED_FADE_FROM_SECONDS_ADAPTATION ? 1 : Math.max(0, (REPLAY_HUD_FEED_SECONDS_ADAPTATION - age) / fade),
  };
}

/**
 * RB-34: the live score at `tick` -- each side's rounds won (the last `roundStart`'s or `roundOver`'s `wins`) and the
 * round under the playhead (the last `roundStart`'s); null before the first round and after an abandon until the next.
 * Pure.
 */
export function liveScore(records: readonly ReplayRecord[], tick: number): { seal: number; terrorist: number; round: number } | null {
  let now: { seal: number; terrorist: number; round: number } | null = null;
  for (const r of readsOf(records)) {
    if (r.tick > tick || !r.event) continue;
    const e = r.event;
    if (e.type === 'roundStart') now = { seal: e.wins.seal, terrorist: e.wins.terrorist, round: e.round };
    else if (e.type === 'roundOver' && now) now = { seal: e.wins.seal, terrorist: e.wins.terrorist, round: now.round };
    else if (e.type === 'abandoned') now = null;
  }
  return now;
}

/**
 * RB-34: the recorded round's clock at `tick`, in seconds left (never below 0), or null outside a round: its
 * `roundStart` seconds counted down at the recording's tick rate; the room's `score.timeLeft` (seconds) and `roundTime`
 * (the round's new total) re-anchor it, `clockHeld` holds it, `timeExpired` puts it at 0, its `roundOver` stops it;
 * `abandoned` ends it. Pure.
 */
export function roundClock(records: readonly ReplayRecord[], tick: number, tickHz: number): number | null {
  const hz = tickHz > 0 ? tickHz : 1;
  let start: number | null = null;
  let anchor = { tick: 0, left: 0, held: false };
  let stopped: number | null = null;
  for (const r of readsOf(records)) {
    if (r.tick > tick || !r.event) continue;
    const e = r.event;
    if (e.type === 'roundStart') { start = r.tick; anchor = { tick: r.tick, left: e.seconds, held: false }; stopped = null; }
    else if (start === null || stopped !== null) continue;
    else if (e.type === 'score' && e.timeLeft !== null) anchor = { tick: r.tick, left: e.timeLeft, held: e.clockHeld === true };
    else if (e.type === 'roundTime') anchor = { tick: r.tick, left: e.seconds - (r.tick - start) / hz, held: false };
    else if (e.type === 'timeExpired') anchor = { tick: r.tick, left: 0, held: true };
    else if (e.type === 'roundOver') stopped = r.tick;
    else if (e.type === 'abandoned') start = null;
  }
  if (start === null) return null;
  const end = stopped ?? tick;
  return Math.max(0, anchor.held ? anchor.left : anchor.left - (end - anchor.tick) / hz);
}

/** RB-34: the camera badge's words for the spectator's modes (`D:1039`); a mode not named here says its label. */
const CAMERA_BADGE: Readonly<Record<string, string>> = { follow: 'PLAYER CAMERA', free: 'FREE CAMERA', scenic: 'SCENIC CAMERA' };

/** Seconds as `mm:ss` (the export's `two(m):two(s)`, `D:1041`). */
const clock = (s: number): string => {
  const w = Math.floor(s);
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
};

export interface ReplayHudOptions {
  /** The viewer's persona (the session's player name), read at each draw; absent or null, no line is the viewer's. */
  persona?: () => string | null;
  /** The stage's spectator modes, for the camera badge; absent, no badge. */
  spectator?: SpectatorControls;
  /** The paused centre button's click: the transport's play. */
  onToggle?: () => void;
}

export interface ReplayHud {
  readonly el: HTMLElement;
  /** Draws the client's state (once a frame). */
  render(): void;
  /** The seek note: the toast with the recording's time at `landed`, for `SEEK_TOAST_MS`. */
  note(landed: number): void;
  dispose(): void;
}

/** RB-34: the HUD in `host` (the viewer's world box), over the framed world. */
export function mountReplayHud(host: HTMLElement, client: TransportClient, o: ReplayHudOptions = {}): ReplayHud {
  const doc = host.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const ico = (name: IconName): SVGSVGElement => icon(name, { className: 'cx-replay-hud__icon' }, doc);

  const root = el('div', 'cx-replay-hud');
  root.setAttribute('aria-hidden', 'true');               // the game's own HUD and the transport say it to a reader

  const feed = el('div', 'cx-replay-hud__feed');
  feed.dataset['hudFeed'] = '';

  const score = el('div', 'cx-replay-hud__score');
  score.dataset['hudScore'] = '';
  score.title = 'SEALs vs Terrorists';
  const sealCount = el('span', 'cx-replay-hud__count');
  sealCount.dataset['score'] = 'seal';
  const roundWord = el('span', 'cx-replay-hud__round');
  roundWord.dataset['hudRound'] = '';
  const tangoCount = el('span', 'cx-replay-hud__count');
  tangoCount.dataset['score'] = 'terrorist';
  score.append(sealCount, roundWord, tangoCount);

  const camera = el('div', 'cx-replay-hud__camera');
  const cameraMark = el('span', 'cx-replay-hud__mark');
  const cameraWord = el('span', 'cx-replay-hud__label');
  cameraWord.dataset['hudCamera'] = '';
  camera.append(cameraMark, cameraWord);

  const clockBox = el('div', 'cx-replay-hud__clock');
  clockBox.dataset['hudClock'] = '';
  const clockTime = el('span', 'cx-replay-hud__time');
  clockTime.dataset['hudTime'] = '';
  clockBox.append(el('span', 'cx-replay-hud__label', 'ROUND TIME'), clockTime);

  const paused = el('div', 'cx-replay-hud__paused');
  paused.dataset['hudPaused'] = '';
  const onPaused = (): void => { o.onToggle?.(); };
  paused.addEventListener('click', onPaused);

  const toast = el('p', 'cx-replay-hud__toast');
  toast.dataset['seekState'] = 'rebuilt';                  // RV2.R7's hook for the seek note, moved here with it
  toast.hidden = true;

  root.append(feed, score, camera, clockBox, paused, toast);
  host.append(root);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let feedKey = '';
  let feedRows: HTMLElement[] = [];
  let cameraShown = '';
  let pausedIcon = '';
  let disposed = false;

  const sideSpan = (s: FeedSide, hook: string): HTMLElement => {
    const n = el('span', 'cx-replay-hud__name', s.name);
    n.dataset[hook] = '';
    n.dataset['side'] = s.team ?? 'none';
    if (s.you) n.dataset['you'] = '';
    return n;
  };

  function render(): void {
    if (disposed) return;
    const open = client.state === 'open';
    root.hidden = !open;
    if (!open) return;
    const held = client.held?.() ?? false;
    const records = client.segment?.records ?? [];
    const hz = client.segment?.header.tickHz ?? 1;
    const tick = client.serverTick();
    const span = client.span();

    // the kill feed: rows rebuilt when its kills or the persona change, their fade each frame
    const entries = held ? [] : killFeed(records, tick, hz, o.persona?.() ?? null);
    const key = entries.map((k) => `${k.tick}:${k.victim.name}:${k.mine}`).join('|') + `|${o.persona?.() ?? ''}`;
    if (key !== feedKey) {
      feedKey = key;
      feedRows = entries.map((k) => {
        const row = el('div', 'cx-replay-hud__kill');
        row.dataset['kill'] = '';
        if (k.mine) row.dataset['mine'] = '';
        if (k.killer) row.append(sideSpan(k.killer, 'killer'));
        const w = el('span', 'cx-replay-hud__weapon', k.hs ? `${k.weapon} · HS` : k.weapon);
        w.dataset['weapon'] = '';
        row.append(w, sideSpan(k.victim, 'victim'));
        return row;
      });
      feed.replaceChildren(...feedRows);
    }
    entries.forEach((k, i) => { const s = String(+k.opacity.toFixed(3)); if (feedRows[i]!.style.opacity !== s) feedRows[i]!.style.opacity = s; });

    // the live score and the round clock, hidden outside a round
    const atEnd = tick >= span.end;
    const live = liveScore(records, tick);
    score.hidden = held || live === null;
    if (live) {
      sealCount.textContent = String(live.seal);
      tangoCount.textContent = String(live.terrorist);
      roundWord.textContent = atEnd ? 'FINAL' : `ROUND ${live.round}`;
    }
    const left = roundClock(records, tick, hz);
    clockBox.hidden = held || left === null;
    if (left !== null) {
      clockTime.textContent = clock(left);
      clockBox.toggleAttribute('data-low', left < REPLAY_HUD_CLOCK_LOW_SECONDS_ADAPTATION);
    }

    // the camera badge
    const modes = o.spectator;
    camera.hidden = held || !modes;
    if (modes) {
      const now = modes.current();
      if (now !== cameraShown) {
        cameraShown = now;
        const m = modes.modes.find((x) => x.id === now);
        cameraMark.replaceChildren(ico(m?.icon ?? 'display'));
        cameraWord.textContent = CAMERA_BADGE[now] ?? (m?.label ?? now).toUpperCase();
      }
    }

    // the paused centre button
    const show = !held && !client.playing();
    paused.hidden = !show;
    const want = atEnd ? 'reset' : 'play';
    if (show && want !== pausedIcon) { pausedIcon = want; paused.replaceChildren(ico(want)); }
  }

  function note(landed: number): void {
    if (disposed) return;
    const hz = client.segment?.header.tickHz ?? 1;
    toast.textContent = seekToastText(clockText(landed - client.span().start, hz));
    toast.hidden = false;
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastTimer = null; toast.hidden = true; }, SEEK_TOAST_MS);
  }

  return {
    el: root,
    render,
    note,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = null;
      paused.removeEventListener('click', onPaused);
      root.remove();
    },
  };
}
