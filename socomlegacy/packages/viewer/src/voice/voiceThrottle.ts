/**
 * **A warning on a throttled player's client** (VOICE-LATE-4 row 3, web sprint 18; research 226 §3.6) -- the owner,
 * 2026-10-12: "we must account for it with a warning if we notice it on a players client with instructions if there is
 * really nothing we can do".
 *
 * The case: Windows' Efficiency mode (EcoQoS) on a browser's process tree -- the owner's Edge, launched by Startup boost
 * -- under which the page's decoder outputs came about one per rendered frame and every frame was heard seconds late
 * (his two runs, 1.2-6.3 s and growing; research 226 §3.4). Row 2 moved the decode into a Worker (§3.5); whether the
 * worker escapes such a throttle is not known. No browser API names Efficiency mode, so the page watches its own
 * measurement: each room frame's **arrival-to-decoded** (the frame's arrival at the voice client against its decoded
 * samples coming back, on the client's clock), the last `VOICE_THROTTLE_FRAMES_PLACEHOLDER` frames in a fixed window.
 * When the window's median exceeds `VOICE_THROTTLE_LAG_MS_PLACEHOLDER`, the voice path is throttled and the player is
 * told once a page (`VOICE_THROTTLE_NOTICE_PLACEHOLDER`, the headset's lines: `./headset` `throttled`).
 *
 * In every build: a player's feature, not the development instrument (`./voiceReport` `VOICE_REPORT_ADAPTATION` stays
 * a development build's). Cheap: one comparison and a few integer writes a decoded frame into a window made once.
 */

/**
 * VOICE_THROTTLE_WARNING_ADAPTATION -- a browser adaptation with no original: the console's voice was decoded on its
 * arrival (`FUN_0030f7e0` D:L211393-211441, research 170 §6.1) on a machine nothing throttled, and said nothing of it.
 * The page cannot see the operating system's throttle; it sees its own lateness, and says what the player can do about
 * the one cause measured (the owner's Efficiency mode). The warning changes nothing the game or the voice does: every
 * frame is decoded and played as before, the line only shown. What it cannot see: a throttle that slows the whole path
 * but keeps the median under the bound; a stall that slows the frame's arrival too (the socket's message waits with the
 * decode); and it cannot tell Efficiency mode from another cause of the same lateness (an overloaded machine, a long
 * stall of the page) -- the words say "may".
 */
export const VOICE_THROTTLE_WARNING_ADAPTATION = 'the median arrival-to-decoded over a window, warned once a page' as const;

/**
 * VOICE_THROTTLE_LAG_MS_PLACEHOLDER -- the median arrival-to-decoded, ms, past which the voice path reads throttled. A
 * stated stand-in (no original): well above what a working path takes -- the jitter window is 160 ms
 * (`./voicePlayback` `VOICE_JITTER_MS_PLACEHOLDER`) and the worker under a 52 ms rendered frame came back in 72-90 ms
 * (the Online seat's rendered run, research 226 §3.5), this host's pages 0.3-0.4 ms (§3.4) -- and well below what the
 * owner's throttled runs read (1 200-16 000 ms, §3.4; the page decode under the 52 ms frame grew to 8.6 s, §3.5). At
 * 500 ms a frame decoded that late has also missed its slot behind the jitter window by more than four frames.
 */
export const VOICE_THROTTLE_LAG_MS_PLACEHOLDER = 500;

/**
 * VOICE_THROTTLE_FRAMES_PLACEHOLDER -- the window, decoded frames: 25, two seconds of talk at the original's 12.5 frames a
 * second (80 ms each, R170.12). A stated stand-in (no original). Odd, so the median is one frame's lag and "the median
 * exceeds the bound" is exactly "more than half the window's frames exceed it" (13 of 25): one slow frame, or a stall
 * of a settled decode that makes up to twelve of the last 25 late (one under about 1.5 s: 500 ms and twelve 80 ms
 * frames), never warns; a talk heard late throughout warns at its 25th counted frame. The window runs across talks (a
 * talk is all the frames there are) and is filled only by frames that come back decoded, asked on a settled decode path
 * and back on the same one (the review's F1: a worker's open, however long, its time-out and a fallback's re-routed
 * frames are not counted -- `./voiceCodec` `VoiceCodec.decodePath`).
 */
export const VOICE_THROTTLE_FRAMES_PLACEHOLDER = 25;

/**
 * VOICE_THROTTLE_NOTICE_PLACEHOLDER -- the warning, the page's own words (no original: the console had no such line),
 * short lines in the form of the headset's (`./headset` `VOICE_MIC_NOTICE_PLACEHOLDER`: "VOICE: ...", upper case), each
 * one line of the game lobby's B_CHATLIST (`../gameLobbyHost` `LOBBY_VOICE_LINE_ADAPTATION`) and of the round's HUD
 * message window (`../matchTaunts`, `Hud.postMessage`), with the instructions for the one cause measured: Windows'
 * Task Manager, its Details page, the browser's rows, Efficiency mode off (the toggle is Windows 11 22H2's and later's);
 * for Edge, Startup boost and "Continue running background extensions and apps when Microsoft Edge is closed" off
 * (Settings, System and performance; the second is on by default and keeps msedge.exe alive after its windows close,
 * so without it a restart is none -- VOICE-LATE-4 row 3's review F2) and a restart; or another browser. The wording is
 * the owner's to settle.
 */
export const VOICE_THROTTLE_NOTICE_PLACEHOLDER: readonly string[] = Object.freeze([
  'VOICE: HEARD LATE -- WINDOWS EFFICIENCY MODE MAY BE SLOWING THIS BROWSER',
  'TO FIX: TASK MANAGER, DETAILS, EACH OF THE BROWSER\'S ROWS: EFFICIENCY MODE OFF',
  'EDGE: SETTINGS, SYSTEM AND PERFORMANCE: STARTUP BOOST AND BACKGROUND APPS OFF, RESTART IT',
  'OR PLAY IN ANOTHER BROWSER',
]);

/**
 * The watch (`VOICE_THROTTLE_WARNING_ADAPTATION`): the last `frames` decoded frames, each kept only as whether its
 * arrival-to-decoded exceeded the bound, in a ring made once, with their count -- the median of an odd window exceeds
 * the bound exactly when more than half of it does. `frame` says true once: at the first frame at which the full window
 * reads throttled; after it the watch counts nothing more.
 */
export class VoiceThrottleWatch {
  private readonly over: Uint8Array;
  private next = 0;
  private filled = 0;
  private count = 0;
  private fired = false;

  constructor(readonly frames: number = VOICE_THROTTLE_FRAMES_PLACEHOLDER, readonly boundMs: number = VOICE_THROTTLE_LAG_MS_PLACEHOLDER) {
    if (!Number.isInteger(frames) || frames < 1 || frames % 2 === 0) throw new RangeError('the window is an odd count of frames');
    this.over = new Uint8Array(frames);
  }

  /** One room frame decoded, `lagMs` after it came; true once, at the frame that makes the window's median exceed the bound. */
  frame(lagMs: number): boolean {
    if (this.fired) return false;
    const late = lagMs > this.boundMs ? 1 : 0;                      // NaN (no clock) is not late
    if (this.filled === this.frames) this.count -= this.over[this.next]!;
    else this.filled++;
    this.over[this.next] = late;
    this.count += late;
    this.next = this.next + 1 === this.frames ? 0 : this.next + 1;
    if (this.filled < this.frames || 2 * this.count <= this.frames) return false;
    this.fired = true;
    return true;
  }

  /** Whether the window has read throttled (the voice client's `VoiceState.throttled`). */
  throttled(): boolean { return this.fired; }
}
