/**
 * LATER 1219's PLAYTEST INSTRUMENT (a BROWSER ADAPTATION: the owner's hands-on of both press timings, 2026-11-21; it
 * changes no release behaviour). On a development build under `?devmode` only (`./main` mounts it beside the playtest
 * overlay), it chooses which press timing this page's movers follow (`./mover` `setPressFrameTiming`):
 * - `'frame-start'` (`PRESS_FRAME_READING`, the original's, the owner's ruling): a move press read at the next game
 *   frame's start;
 * - `'at-once'` (the port before LATER 1219): read on its own 60 Hz tick.
 * `?pressframe=at-once` (or `frame-start`) picks it at load; a pad chord (`PRESS_FRAME_CHORD_ADAPTATION`, held) or its
 * key flips it in the OFFLINE test room, whose room runs in this page (one process: the page's mover and the room's flip
 * together). Online the server's movers are another process's: there the chord is refused and the corner says so -- the
 * server takes its timing from `S2U_PLAYTEST_PRESS_FRAME` at its start, the page from `?pressframe=`, and the two must
 * agree. A small corner label always shows the timing in force.
 */
import { PAD_BUTTON } from './gamepad';
import { PRESS_FRAME_READING, pressFrameTiming, setPressFrameTiming, type PressFrameTiming } from './mover';

/** The query word that picks the timing at load (`?devmode` builds only). */
export const PRESS_FRAME_PARAM = 'pressframe';

/**
 * The chord that flips the timing: Select + L1 + R1 held `holdMs` (no game action uses the three together; Select's tap
 * is the scoreboard's, so the board may show while the chord is held), or the key. A browser adaptation.
 */
export const PRESS_FRAME_CHORD_ADAPTATION = { buttons: [PAD_BUTTON.Select, PAD_BUTTON.L1, PAD_BUTTON.R1], holdMs: 800, key: 'F10' } as const;

/** The label's words for each timing. */
export const PRESS_FRAME_WORDS: Record<PressFrameTiming, string> = {
  'frame-start': 'Press timing: next game frame (the original)',
  'at-once': 'Press timing: at once (the port before LATER 1219)',
};

/** The timing a query asks for, or null. */
export function pressTimingOfQuery(search: string): PressFrameTiming | null {
  try {
    const v = new URLSearchParams(search).get(PRESS_FRAME_PARAM);
    return v === 'at-once' || v === 'frame-start' ? v : null;
  } catch { return null; }
}

interface PadLike { readonly buttons: ReadonlyArray<{ readonly pressed: boolean }> }

/** Whether any pad holds every button of the chord. */
export function chordHeld(pads: ArrayLike<PadLike | null>): boolean {
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && PRESS_FRAME_CHORD_ADAPTATION.buttons.every((b) => p.buttons[b]?.pressed === true)) return true;
  }
  return false;
}

export interface PressFrameSwitchDeps {
  document: Document;
  search: string;
  now: () => number;
  pads: () => ArrayLike<PadLike | null>;
  /** True in an online match: the room is another process's, so the chord is refused. */
  online: () => boolean;
}

/** The switch's state machine, apart from the page (tested headless). `poll` once a frame; returns what the label says. */
export class PressFrameSwitch {
  private heldSince: number | null = null;
  private fired = false;
  private refusedAt = -Infinity;

  constructor(private readonly deps: Pick<PressFrameSwitchDeps, 'now' | 'pads' | 'online'>) {}

  /** The chord (or the key, `press`) asks to flip. */
  flip(): boolean {
    if (this.deps.online()) { this.refusedAt = this.deps.now(); return false; }
    setPressFrameTiming(pressFrameTiming() === 'frame-start' ? 'at-once' : 'frame-start');
    return true;
  }

  poll(): string {
    const t = this.deps.now();
    if (chordHeld(this.deps.pads())) {
      if (this.heldSince === null) this.heldSince = t;
      if (!this.fired && t - this.heldSince >= PRESS_FRAME_CHORD_ADAPTATION.holdMs) { this.fired = true; this.flip(); }
    } else { this.heldSince = null; this.fired = false; }
    const words = PRESS_FRAME_WORDS[pressFrameTiming()];
    return t - this.refusedAt < 3000 ? `${words} -- online: set by the server's S2U_PLAYTEST_PRESS_FRAME and ?${PRESS_FRAME_PARAM}=` : words;
  }
}

/** Mounts the switch and its corner label on the page (`?devmode` on a development build: the caller's gate). */
export function mountPressFrameSwitch(deps: PressFrameSwitchDeps): () => void {
  const asked = pressTimingOfQuery(deps.search);
  setPressFrameTiming(asked ?? PRESS_FRAME_READING);
  const sw = new PressFrameSwitch(deps);
  const doc = deps.document;
  // The design system's chip (`shared/ds`); its corner is `styles.css`'s `#press-frame-badge` (placement only), as the DEV badge's.
  const label = doc.createElement('p');
  label.id = 'press-frame-badge';
  label.className = 's2u-chip';
  label.setAttribute('data-press-frame', '');
  doc.body.appendChild(label);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === PRESS_FRAME_CHORD_ADAPTATION.key && !e.repeat) { e.preventDefault(); sw.flip(); }
  };
  // OT.R29: a key listener on a development build only (this module is imported only under `DEV.tools`, and the gate
  // is literal so every `vite build` drops it).
  if (import.meta.env.DEV) doc.addEventListener('keydown', onKey);
  const win = doc.defaultView;
  let raf = 0;
  const loop = (): void => {
    const text = sw.poll();
    if (label.textContent !== text) label.textContent = text;
    raf = win?.requestAnimationFrame(loop) ?? 0;
  };
  loop();
  return () => { win?.cancelAnimationFrame(raf); doc.removeEventListener('keydown', onKey); label.remove(); };
}
