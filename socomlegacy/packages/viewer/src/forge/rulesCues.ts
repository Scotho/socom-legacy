import type { StatusChipHandle, StatusChips } from './shell/statusBar';

/**
 * FUI-23 (FUI.R24; product track, a browser adaptation with no original): a rules pack's `cue.play` heard. The room tells
 * the page each tick's presentation (`rulesPresent`, `match/src/creator/rules/seam.ts` `RulesWire`); its `shows` of kind
 * `cue` name a sound, and this list plays them on the Forge match's own audio (`./match` `forgeRulesCueAudio`: the
 * match's `GameAudio`, its output, the menus' HUDUI beside it). Client-only and presentation-only: it reads the wire and
 * answers nothing, so what the room decides and tells is the same with it or without it.
 *
 * C1: a cue's name is a sound the match's audio already has (`has`); a name it lacks plays nothing and is said once a
 * match on the page's status line ("cue <name>: not on this map") -- never a fetch, never a pack file (a pack's own audio
 * members are FUI-24). C2 (`RULES_CUE_LIMITS_ADAPTATION`): at most 8 cues waiting, the oldest dropped and counted; one
 * start a name a room tick -- the room tells one wire a tick to all and one to the seat, delivered together, so a tick
 * here is one wire and every wire of the same task (a catch-up's ticks delivered at once count as one: the stricter
 * bound); each played without a place, on its bank's own volume group (`GameAudio.play`), so the Options volume and mute
 * apply. C3: while the output is locked or suspended the cues wait under one chip, "Press ✕ to hear the cues"; a click,
 * a key or a touch on the page, or the pad's Cross, asks the output to run, and the frame it runs plays what waits,
 * oldest first, the chip gone; a cue older than 5 s by then is dropped (a stale cue is noise), counted -- its age runs
 * from the moment it could first have been heard, the later of its telling and the map's sound coming in (amended
 * 2026-10-27 by the dispatcher after FUI-23's e2e), and a play that did not sound keeps it held for the next frame, on
 * the same clock. Cues told before
 * the match's audio is handed over, or before its map's sound is in, wait the same way, with no chip.
 */
export const FORGE_RULES_CUES_ADAPTATION =
  "a rules pack's cue.play heard on the Forge match's own sounds: names the match has, bounded, held for a gesture while the output is locked" as const;

/**
 * FUI.R24 C2/C3 (C3 amended 2026-10-27): the cue list's bounds -- waiting at most, starts a name a tick, and a held cue's
 * age (ms) counted from the later of when it was told and when the map's sound came in.
 */
export const RULES_CUE_LIMITS_ADAPTATION = Object.freeze({ waiting: 8, perNamePerTick: 1, staleMs: 5000 } as const);

export const RULES_CUE_CHIP = 'rules-cue';
/** FUI.R24 C3: the chip's words (FUI-18's "press ✕ to start the music" shape). */
export const RULES_CUE_HOLD_WORDS = 'Press ✕ to hear the cues';
/** FUI.R24 C1: the status line for a name the match's audio lacks. */
export const rulesCueMissingWords = (name: string): string => `cue ${name}: not on this map`;
/** Its place in the strip: after the rules' message and HUD chips (`./rulesPresent`). */
const ORDER = 62;
/** The gesture's events, as `../audio` `GameAudio.unlockOn` listens (a touch's activation is its lift). */
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;

/** What the list plays on: the match's audio (`./match` `forgeRulesCueAudio`). */
export interface RulesCueAudio {
  /** The map's sound is in (or the map has none): `has` answers for the match. */
  loaded(): boolean;
  has(name: string): boolean;
  /** Played without a place; false when it did not sound (locked, muted). */
  play(name: string): boolean;
  /** The output runs (neither locked nor suspended). */
  unlocked(): boolean;
  /** Asks the output to run: a page gesture's resume, or (`fromPad`) a pad's, asked only once the page has an activation. */
  unlock(fromPad?: boolean): void;
}

export interface RulesCueStats {
  played: number;
  held: number;
  dropped: { overflow: number; stale: number; missing: number; duplicate: number };
}

export interface RulesCues {
  /** One wire's cue names. */
  take(names: readonly string[]): void;
  /** The match's audio handed over (null: the match's audio gone). */
  attach(audio: RulesCueAudio | null): void;
  /** A gesture: the output asked to run, and what waits played if it does. */
  gesture(fromPad?: boolean): void;
  /** Each match frame: what waits played once the output runs and the map's sound is in; the pad's Cross is a gesture. */
  frame(pad?: { cross: boolean }): void;
  stats(): RulesCueStats;
  /** The match ended: nothing waits, the chip and the listeners gone, the counts back to zero. */
  clear(): void;
}

export interface RulesCueOptions {
  /** The page's status line (C1's words). */
  say?: (words: string) => void;
  /** Where a click, a key or a touch is the gesture (the page's document); unset, only `gesture` and the pad. */
  gestures?: EventTarget;
  /** The clock, ms. */
  now?: () => number;
}

export function createRulesCues(chips: Pick<StatusChips, 'register'>, o: RulesCueOptions = {}): RulesCues {
  const now = o.now ?? ((): number => performance.now());
  const limits = RULES_CUE_LIMITS_ADAPTATION;
  let audio: RulesCueAudio | null = null;
  let held: { name: string; at: number }[] = [];
  /** When the map's sound was first seen in (this audio): a held cue's age runs from the later of this and its `at`. */
  let loadedAt: number | null = null;
  /** The starts (or holds) of each name this tick, bounded by `perNamePerTick`; emptied at the task's end. */
  const tick = new Map<string, number>();
  let tickOpen = false;
  /** The names said missing this match (said once each). */
  const said = new Set<string>();
  const counts = { played: 0, overflow: 0, stale: 0, missing: 0, duplicate: 0 };
  let chip: StatusChipHandle | null = null;
  let crossWas = false;
  let listening: EventTarget | null = null;
  const onGesture = (): void => { if (held.length) gesture(false); };

  const listen = (on: boolean): void => {
    if (on && !listening && o.gestures) {
      listening = o.gestures;
      for (const t of GESTURES) listening.addEventListener(t, onGesture, { capture: true, passive: true });
    } else if (!on && listening) {
      for (const t of GESTURES) listening.removeEventListener(t, onGesture, { capture: true });
      listening = null;
    }
  };
  const showChip = (): void => {
    // FUI.R24 C3 (review F3): not while the map's sound is not in -- the context is made then, and no gesture is asked for before.
    const want = held.length > 0 && audio !== null && audio.loaded() && !audio.unlocked();
    if (want && !chip) {
      chip = chips.register({ id: RULES_CUE_CHIP, order: ORDER, inMatch: true, tone: () => 'wait', text: () => RULES_CUE_HOLD_WORDS, title: () => RULES_CUE_HOLD_WORDS });
      chip.update();
    } else if (!want && chip) {
      chip.remove();
      chip = null;
    }
  };
  const missing = (name: string): void => {
    counts.missing++;
    if (said.has(name)) return;
    said.add(name);
    o.say?.(rulesCueMissingWords(name));
  };
  const hold = (name: string): void => {
    held.push({ name, at: now() });
    while (held.length > limits.waiting) { held.shift(); counts.overflow++; }
  };
  const observe = (): void => { if (loadedAt === null && audio !== null && audio.loaded()) loadedAt = now(); };
  const ready = (): boolean => { observe(); return audio !== null && audio.loaded(); };
  /** True when handled (played, or a name the map lacks, said); false when `play` did not sound: the caller keeps it held. */
  const sound = (name: string): boolean => {
    if (!audio!.has(name)) { missing(name); return true; }
    if (audio!.play(name)) { counts.played++; return true; }
    return false;
  };
  /** What waits, oldest first, once the output runs and the map's sound is in; a stale one dropped. */
  const flush = (): void => {
    observe();                                                      // the moment the map's sound is first seen in
    // The lock first: `loaded` is asked each frame only until it is seen.
    if (!held.length || !audio || !audio.unlocked() || !audio.loaded()) { showChip(); return; }
    const t = now(), list = held, again: { name: string; at: number }[] = [];
    held = [];
    for (const c of list) {
      if (t - Math.max(c.at, loadedAt ?? c.at) > limits.staleMs) { counts.stale++; continue; }
      if (!sound(c.name)) again.push(c);                            // the resume still pending: held for the next frame
    }
    held = again;
    showChip();
  };
  function gesture(fromPad = false): void {
    if (!held.length || !audio) return;
    audio.unlock(fromPad);
    flush();
  }

  return {
    take(names) {
      if (!tickOpen) {
        tickOpen = true;
        queueMicrotask(() => { tickOpen = false; tick.clear(); });
      }
      for (const name of names) {
        const n = tick.get(name) ?? 0;
        if (n >= limits.perNamePerTick) { counts.duplicate++; continue; }
        tick.set(name, n + 1);
        if (ready() && !audio!.has(name)) { missing(name); continue; }
        if (ready() && audio!.unlocked() && !held.length && sound(name)) continue;
        hold(name);
      }
      flush();
    },
    attach(a) {
      audio = a;
      loadedAt = null;
      listen(a !== null);
      flush();
    },
    gesture,
    frame(pad) {
      const cross = pad?.cross === true;
      if (cross && !crossWas) gesture(true);                         // the press, once
      crossWas = cross;
      if (held.length) flush();
    },
    stats: () => ({ played: counts.played, held: held.length, dropped: { overflow: counts.overflow, stale: counts.stale, missing: counts.missing, duplicate: counts.duplicate } }),
    clear() {
      listen(false);
      chip?.remove();
      chip = null;
      audio = null;
      loadedAt = null;
      held = [];
      said.clear();
      crossWas = false;
      counts.played = counts.overflow = counts.stale = counts.missing = counts.duplicate = 0;
    },
  };
}
