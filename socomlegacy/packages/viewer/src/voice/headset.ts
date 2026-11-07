import { PAD_BUTTON, PAD_PRESS, PadWatch, type PadButton, type PadSource } from '../gamepad';
import { keyboardSite } from '../keyboardTesting';
import { createModulator, VOICE_MODULATION_PLACEHOLDER } from './modulation';
import { VOICE_THROTTLE_NOTICE_PLACEHOLDER } from './voiceThrottle';
import { devKeysHeld } from '../devKeyHolds';
import { roundLineTakes } from '../roundLineKeys';

/**
 * The headset UX (SVC-22b, web sprint 20; research 226 §5): what the page says and does around the microphone, as the
 * original did around its headset, for the voice client (`./voiceClient`) and the talk input (`./talkInput`, held by
 * the taunts part, `../matchTaunts`, which makes one of these for both matches). The shared voice client owns the
 * local talk grant's cue (`VOICE_TALK_CUE_ADAPTATION`, research 170 §5.4); a busy press and a release remain silent in
 * this port (the original's reversed release beep is `VOICE_TALK_PCM_PLACEHOLDER`'s, unread by the page).
 *
 * - **The notice** (`VOICE_MIC_NOTICE_PLACEHOLDER.ask`; research 170 §6.4, H87 VOICE-MIC-NOTICE): one line of the page's
 *   own, drawn once a page, just before the first `getGameMicrophone()` call (the voice client's first talk press,
 *   constraint 6) -- never at load. The browser's own prompt follows; its words are the browser's.
 * - **The no-headset state** (R170.11; H87 VOICE-LISTEN-ONLY, default no): the setup page's switch off, a refusal or a
 *   capture that would not open is the voice client's no-headset state (no voice either way); this says so once a page
 *   (`VOICE_MIC_NOTICE_PLACEHOLDER.noHeadset`), at the press that finds it, and asks for nothing again.
 * - **The throttle warning** (VOICE-LATE-4 row 3, research 226 §3.6; `./voiceThrottle`
 *   `VOICE_THROTTLE_WARNING_ADAPTATION`): the voice client finding its room frames decoded late (`throttled`) is told
 *   here, and the lines of `VOICE_THROTTLE_NOTICE_PLACEHOLDER` are said once a page, in order, in every build.
 * - **The releases** (research 197 §2's acceptance; a browser adaptation, no original -- the console's pad does not
 *   vanish and its game has no window): the pad the page reads going (the one `../gamepad` `PadWatch.poll` chooses,
 *   gone from the poll or by its `gamepaddisconnected`; another pad going ends nothing -- the review's F5) is a pad
 *   absent for the next talk-input frame, and the window's focus lost (`blur`, or the document hidden) is the focus
 *   lost until it is back (`focus`, the document shown) -- the talk input's `padPresent` / `focused`, which release the
 *   talk that frame (`VOICE_RELEASE_ADAPTATION`, note 226 §6). Each loss is kept until a frame has reported it: both
 *   pages run their frames on `requestAnimationFrame`, which stops in a hidden tab, so a tab hidden and shown again
 *   between two frames is still a loss at the next (the review's F1). A page with no pad at all (the DEV keyboard) has
 *   lost none.
 * - **VOICE MODULATION** (C10; `./modulation`): the START menu's flag (OFF at boot under r0004, OT.R97 / R4B-02,
 *   `../startMenu` `VOICE_MODULATION_INITIAL_READING`; this encoder's mask is on until first told) applied to the
 *   talker's own blocks before the encoder in a round for a player who is not a spectator (D:L55851-55854), never in the game lobby
 *   (`VOICE_MOD_LOBBY_OFF_READING`, D:L125570). The START menu's VOICE MODULATION turns it off and on (MATCH-01,
 *   `setVoiceMask`; research 266 §8.4), on until then. Its shifter keeps its
 *   history from block to block, and starts from silence at each talk's first block (the voice client's `fresh`) and
 *   whenever it comes back on.
 * - **The DEV talk keys** (constraint 8; OT.R29; H87 VOICE-KEY, `VOICE_TALK_KEY_PLACEHOLDER`): V held in the round and R
 *   in the menus are CIRCLE in the talk input's held set -- one state machine (W20.R9) -- attached only under
 *   `import.meta.env.DEV` (the `s2u-kb-voice` site), which a `vite build` folds away.
 *
 * Where the lines are drawn: the HUD's message line (`../hud` `Hud.postMessage`), the one line both matches have --
 * `/testroom`'s status line (`ui.setStatus`) is outside the game's screen and the front end's match has none -- through
 * the taunts part's `hud`. No dialog the original does not draw (constraint 2).
 */

/**
 * The page's lines around the microphone: `ask` before the browser's prompt, `noHeadset` once the voice client finds
 * none, and `noCodec` (LATER 23, sprint 20's close nit) for a browser without WebCodecs Opus (W20.R3, H140: no voice
 * there), which is neither a microphone off nor one refused. A stated placeholder (H87 VOICE-MIC-NOTICE: the wording is
 * the owner's; this stand-in follows the row's recommendation -- what is sent, only while talk is held, only to the
 * players on one's channel, never stored).
 */
export const VOICE_MIC_NOTICE_PLACEHOLDER = {
  ask: 'VOICE: YOUR MICROPHONE IS SENT ONLY WHILE YOU HOLD TALK, ONLY TO YOUR CHANNEL, NEVER STORED',
  noHeadset: 'VOICE: NO HEADSET -- THE MICROPHONE IS OFF OR REFUSED, NO VOICE THIS GAME',
  noCodec: 'VOICE: THIS BROWSER CANNOT SEND OR PLAY VOICE (NO OPUS CODEC) -- NO VOICE THIS GAME',
} as const;

/**
 * The DEV talk keys (`KeyboardEvent.code`): V held in the round (unused by the round's keyboard map, research 170
 * §4.3), R in the menus (the menus' CIRCLE, `../menuInput` `MENU_KEYS_READING`). No original: the console has no
 * keyboard; H87 VOICE-KEY's default, the owner's to change.
 */
export const VOICE_TALK_KEY_PLACEHOLDER = { round: 'KeyV', lobby: 'KeyR' } as const;

/** The phase of the voice (`./talkInput` `TalkOptions.phase`): the game lobby or a round. */
export type VoicePhase = 'lobby' | 'round';

/** What a page has said once: the notice, the no-headset line and the throttle warning live as long as the page, across remounts. */
export interface HeadsetPage { readonly said: Set<keyof typeof VOICE_MIC_NOTICE_PLACEHOLDER | 'throttled'> }

/** A page's record of the lines it has said (a test's own; the page's is the module's). */
export const createHeadsetPage = (): HeadsetPage => ({ said: new Set() });
const PAGE = createHeadsetPage();

/** The document's part the focus release reads: `hidden` and its `visibilitychange`. */
export type HeadsetDocument = EventTarget & { readonly hidden: boolean };

export interface HeadsetDeps {
  /** A line on the page's message line (the HUD's, through `../matchTaunts`). */
  line(text: string): void;
  /** The window: `blur` / `focus`, the pads' events, the DEV keys; absent, the page's (none in node). */
  win?: EventTarget | null;
  /** The document's `visibilitychange`; absent, the page's. */
  doc?: HeadsetDocument | null;
  /** What `PadWatch` polls (`navigator`); absent, the page's. */
  pads?: PadSource | null;
  /** What the page has said; absent, the module's (one page). */
  page?: HeadsetPage;
}

export interface Headset {
  /** The microphone, asked through `ask` (`getGameMicrophone`): the notice once first; a null answer said once. */
  microphone(ask: () => Promise<MediaStream | null>): Promise<MediaStream | null>;
  /** A talk press with no headset (the switch off, already refused): said once a page. */
  noHeadset(): void;
  /** LATER 23: a talk press in a browser without WebCodecs Opus (H140): its own line, once a page; absent, `noHeadset`'s. */
  noCodec?(): void;
  /** VOICE-LATE-4 row 3: the voice client's room frames read throttled (`./voiceThrottle`): the warning's lines, once a page. */
  throttled(): void;
  /** Each talk-input frame: the phase, for the modulation; back, the two releases' inputs. */
  frame(o: { phase: VoicePhase; spectator: boolean }): { padPresent: boolean; focused: boolean };
  /**
   * The talker's block before the encoder: modulated in a round (not a spectator), as it is otherwise. `fresh`: a talk's
   * first block, the shifter's history forgotten first (no tail of an earlier talk).
   */
  modulate(block: Float32Array, fresh?: boolean): Float32Array;
  /**
   * MATCH-01 (research 266 §8.4): the START menu's VOICE MODULATION, `FUN_0030e5a0(voice, DAT_003df1a8 == 0)` at its
   * toggle (`FUN_002041e0` D:L61746) -- off, the round's blocks go out unmodulated. On until told (`DAT_003df1a8` 1 in
   * the ELF's data); the round's start applies the same global (D:L55851-55854), which the menu's part hands here.
   */
  setVoiceMask(on: boolean): void;
  /** The DEV talk key held for `phase`, as CIRCLE (empty in a release build). */
  keys(phase: VoicePhase): ReadonlySet<PadButton>;
  /**
   * The read pad's own CIRCLE (standard button 1) down at the last `frame`'s poll -- the raw button, not the menus'
   * input (LOBBY_ARMORY_VOICE_ADAPTATION's carried talk, `../gameLobbyHost`). False with no pad. Absent, never down.
   */
  circle?(): boolean;
  /** The listeners let go. */
  dispose(): void;
}

const isTarget = (t: unknown): t is EventTarget => typeof (t as EventTarget | null)?.addEventListener === 'function';
const CIRCLE: ReadonlySet<PadButton> = new Set<PadButton>(['Circle']);
const NONE: ReadonlySet<PadButton> = new Set<PadButton>();

export function mountHeadset(d: HeadsetDeps): Headset {
  const page = d.page ?? PAGE;
  const g = globalThis as unknown as { document?: unknown; navigator?: PadSource };
  const win = d.win !== undefined ? d.win : isTarget(globalThis) ? globalThis : null;
  const doc = d.doc !== undefined ? d.doc : isTarget(g.document) ? g.document as HeadsetDocument : null;
  const pads = d.pads !== undefined ? d.pads : g.navigator ?? null;
  const once = (which: keyof typeof VOICE_MIC_NOTICE_PLACEHOLDER): void => {
    if (page.said.has(which)) return;
    page.said.add(which);
    d.line(VOICE_MIC_NOTICE_PLACEHOLDER[which]);
  };

  /** A loss not yet reported by a frame (F1): the read pad gone, the focus lost (blur or hidden). */
  let padLost = false, focusLost = false;
  let blurred = false, hidden = doc?.hidden ?? false;
  /** The pad the page read at the last frame (`PadWatch.poll`'s choice), by its index and id. */
  let read: { index: number; id: string } | null = null;
  /** The read pad's raw CIRCLE at the last frame's poll (`circle`). */
  let circleDown = false;
  let phase: VoicePhase | null = null, spectator = false;
  /** The page's choice of pad, as the page's own `PadWatch` makes it (`main.ts`, `matchMount.ts`). */
  const watch = new PadWatch({ connected: () => undefined, disconnected: () => undefined });
  const modulator = createModulator(VOICE_MODULATION_PLACEHOLDER.font);
  let modulating = false, voiceMask = true;
  const down = new Set<string>();
  const on: [EventTarget, string, EventListener, boolean][] = [];
  const listen = (t: EventTarget, type: string, fn: EventListener, capture = false): void => {
    t.addEventListener(type, fn, capture);
    on.push([t, type, fn, capture]);
  };
  if (win) {
    listen(win, 'gamepaddisconnected', (e) => {
      const index = ((e as Partial<GamepadEvent>).gamepad as { index?: number } | undefined)?.index;
      if (read !== null && index === read.index) padLost = true;
    });
    listen(win, 'blur', () => { blurred = true; focusLost = true; down.clear(); });
    listen(win, 'focus', () => { blurred = false; });
    if (import.meta.env.DEV) {                                         // OT.R29: the talk keys a development build's only
      keyboardSite('s2u-kb-voice');
      // KEYBOARD-WHISPER (OT.R48; research 266 §3.9): a key the online round's text line takes is the line's alone
      // (`FUN_002c6c70` takes every printing key online), so a V typed there never keys the talk (`../roundLineKeys`).
      // LATER 190: nor one typed into the SETUP TAUNTS dev editor (`../devKeyHolds`).
      const keyDown = (e: Event): void => { const k = e as KeyboardEvent; if (!k.ctrlKey && !k.metaKey && !k.altKey && !roundLineTakes(k) && !devKeysHeld()) down.add(k.code); };
      const keyUp = (e: Event): void => { down.delete((e as KeyboardEvent).code); };
      // The window's capture phase: ahead of the front end's document listeners, which keep the menus' keys (`../menuInput`).
      win.addEventListener('keydown', keyDown, true);
      win.addEventListener('keyup', keyUp, true);
      on.push([win, 'keydown', keyDown, true], [win, 'keyup', keyUp, true]);
    }
  }
  if (doc) listen(doc, 'visibilitychange', () => { hidden = doc.hidden; if (hidden) { focusLost = true; down.clear(); } });

  return {
    microphone: async (ask) => {
      once('ask');
      const s = await ask().catch(() => null);
      if (!s) once('noHeadset');
      return s;
    },
    noHeadset: () => { once('noHeadset'); },
    noCodec: () => { once('noCodec'); },
    throttled: () => {
      if (page.said.has('throttled')) return;
      page.said.add('throttled');
      for (const text of VOICE_THROTTLE_NOTICE_PLACEHOLDER) d.line(text);
    },
    frame: (o) => {
      phase = o.phase; spectator = o.spectator;
      const chosen = pads ? watch.poll(pads) : null;
      if (read !== null && (chosen === null || chosen.index !== read.index || chosen.id !== read.id)) padLost = true;
      read = chosen ? { index: chosen.index, id: chosen.id } : null;
      const c = chosen?.buttons[PAD_BUTTON.Circle];
      circleDown = c !== undefined && (c.pressed || c.value >= PAD_PRESS);
      const out = { padPresent: !padLost, focused: !focusLost && !blurred && !hidden };
      padLost = false; focusLost = false;
      return out;
    },
    modulate: (block, fresh) => {
      if (phase !== 'round' || spectator || !voiceMask) { modulating = false; return block; }
      if (fresh || !modulating) modulator.reset();
      modulating = true;
      return modulator.process(block);
    },
    setVoiceMask: (on) => { voiceMask = on; },
    keys: (p) => (down.has(VOICE_TALK_KEY_PLACEHOLDER[p]) ? CIRCLE : NONE),
    circle: () => circleDown,
    dispose: () => {
      for (const [t, type, fn, capture] of on) t.removeEventListener(type, fn, capture);
      on.length = 0;
      down.clear();
    },
  };
}
