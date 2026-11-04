/**
 * BLACK-GAP (a browser adaptation, product track; no original -- the original's load state draws its first world frame
 * the moment it leaves the loading screen): the front end's loading screen (`./loadingPanel`) kept up from the match's
 * start (`LobbyMatch.begin`) until the mounted match has drawn its first frame with the world in (`./matchMount`'s
 * `firstFrame`), so no black canvas shows while the page's match module, its renderer and its first draw come in. A
 * match that never draws lets the screen go `FIRST_FRAME_FALLBACK_MS` after its canvas is mounted (or after the start,
 * when the mount never comes); a match that will not mount, and the return, let it go at once. The order of
 * the load, the hold on the round and everything the game does are unchanged: only when the panel is taken down moves.
 */
export const LOADING_UNTIL_FIRST_FRAME_ADAPTATION = "the loading screen kept up until the match's first world frame" as const;

/**
 * The longest the screen is held for a first frame that does not come (a browser adaptation's bound, not the game's),
 * counted from the match canvas's mount (`mounted`). 60 s, not 30 (#635's review F2): measured 2026-11-01, a first
 * join's WebGPU pipeline compile took 5-8 s after a ~3 s freeze on a 32 GB desktop, and SwiftShader stalled ~10 s more,
 * so a slower device's first compile can outlast 30 s counted from the start.
 */
export const FIRST_FRAME_FALLBACK_MS = 60_000;

/** The hold's clock and its turn's end (the page's timers; the tests' by hand). */
export interface LoadingHoldTimers {
  set(f: () => void, ms: number): unknown;
  clear(handle: unknown): void;
  /** After the current turn: `LobbyMatch.begin` asks the hide, then the start, in one turn. */
  defer(f: () => void): void;
}

const PAGE_TIMERS: LoadingHoldTimers = {
  set: (f, ms) => setTimeout(f, ms),
  clear: (h) => { clearTimeout(h as ReturnType<typeof setTimeout>); },
  defer: (f) => { queueMicrotask(f); },
};

export interface LoadingHold {
  /** A new loading screen: a hide held from an earlier match dropped, nothing hidden. */
  show(): void;
  /** The screen's hide asked (`LobbyMatch`'s `screen.hide`): done at the turn's end unless the match's start holds it. */
  hide(): void;
  /** The match starting: the asked hide waits for its first frame, or the fallback. */
  hold(): void;
  /** The match canvas mounted (#635's review F2): the fallback's clock starts again from here. */
  mounted(): void;
  /** The match drew its first frame with the world in: the held hide done. */
  firstFrame(): void;
  /** The match gone (the return): a held hide done now. */
  release(): void;
}

export function loadingHold(hide: () => void, timers: LoadingHoldTimers = PAGE_TIMERS, fallbackMs = FIRST_FRAME_FALLBACK_MS): LoadingHold {
  let asked = false;
  let held = false;
  let timer: unknown = null;
  let screen = 0;
  const stopTimer = (): void => { if (timer !== null) { timers.clear(timer); timer = null; } };
  const done = (): void => {
    stopTimer();
    held = false;
    if (asked) { asked = false; hide(); }
  };
  return {
    show: () => { stopTimer(); held = false; asked = false; screen++; },
    hide: () => {
      asked = true;
      const at = screen;
      timers.defer(() => { if (at === screen && !held && asked) { asked = false; hide(); } });
    },
    hold: () => { if (held) return; held = true; timer = timers.set(done, fallbackMs); },
    mounted: () => { if (!held) return; stopTimer(); timer = timers.set(done, fallbackMs); },
    firstFrame: () => { if (held) done(); },
    release: () => { done(); },
  };
}
