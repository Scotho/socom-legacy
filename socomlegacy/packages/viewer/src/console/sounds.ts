import { renderSound, SampleCache, PAN_RESET, type SoundBank } from '@s2u/sound';
import { LISTENING_GAIN_PLACEHOLDER } from '../audio';
import { makeUiSoundHost, type UiSoundFiles } from '../uiSoundHost';
import type { Button, ConsoleState } from './state';

/**
 * CX-51 (CX.R19): the console launcher's UI sounds. The owner's first word (2026-10-20: "Audio effects for our modern
 * launchers actions ... ensure we're recording credit"; "On, with a toggle (Recommended)") took a stand-in pack; his
 * second, the same day in the merge controller's seat ("the sound effect pack doesn't match. please select something
 * else more subtle and or socom-like", the choice left to the merge controller), retired it: the launcher plays the
 * original's own menu sounds, HUDUI's, read from the player's disc through the repository's readers
 * (`../uiSoundHost` `readUiSoundFiles` and `makeUiSoundHost`, `@s2u/sound` `renderSound`; web research 122), and is
 * silent until a disc is there. Nothing of the disc ships in the build (OT.R34).
 *
 * Which cue a press plays is read from the console's state before and after it (`cueFor`): a dialog opening or
 * closing, a page pushed or left, START arming, a refusal on the legend line. A focus move is the existing CX-20 hook
 * (`Adapters.cue.selection`), and a setting changed is said where it changes (`optStep`). CX.R12 stands: "R1/L1 should
 * make the same sound as changing items", so a category change is the move cue, with no sound of its own -- the
 * original's code plays no slide on a menu change either (research 122 section 6: `.TCM_SLIDE` is two script commands of
 * the main menu's slide-in, R122.12).
 */
export type UiCue = 'move' | 'confirm' | 'back' | 'open' | 'close' | 'error' | 'toggle';

/**
 * LAUNCHER_UI_SOUNDS_FROM_DISC_ADAPTATION: the launcher (a page the original does not have, OT.R28) plays the
 * original's menu cues for its own acts, each the code cue its act matches (`UI_CUE_SOURCE`), from the disc the player
 * gave, through Web Audio, at the launcher's own switch and volume (CX-52) over the page's listening gain
 * (`LISTENING_GAIN_PLACEHOLDER`, the front end's level). A browser adaptation: it changes nothing of the game's own.
 */
export const LAUNCHER_UI_SOUNDS_FROM_DISC_ADAPTATION = 'HUDUI off the player\'s disc, each launcher cue its act\'s code cue';

/**
 * The original's code cue each launcher cue plays. Read in research 122 (section 6, R122.7): a move (the default focus
 * move, a list's row: lines 175, 177) and a step of a roller or switch (`CRadioStrip`, `CSliderBar`: 178-179) are
 * SELECTION (`uisounds.rdr`: `.METAL`); a dialog opening is `PopUpDialog`'s `.METAL`; Back (`SwitchMenu
 * PREVIOUS_SCREEN`) is BACK (`.BACK`); an error none of the code's own (R122.10). The merge controller's choice, not the
 * note's: a confirm is SELECTION and a dialog closing BACK -- the original's code plays nothing of its own for a
 * button's CROSS or a cancel (R122.7: those are the scripts' `.DINK`, `.NEG`, `SwitchMenu PREVIOUS_SCREEN`), and a
 * `CPopUpDialog`'s own CROSS and TRIANGLE play SELECTION (line 180); the scripts' `.DINK` (164 commands) and `.NEG` (65)
 * are the alternative, logged in the launcher plan for the owner.
 */
export const UI_CUE_SOURCE: Readonly<Record<UiCue, 'selection' | 'back' | 'popup' | null>> = {
  move: 'selection', toggle: 'selection', confirm: 'selection', open: 'popup', back: 'back', close: 'back', error: null,
};

/** The same cue no faster than this (ms): a held D-pad repeats slower, so a fast repeat never stacks the sound. */
export const UI_SOUND_MIN_GAP_MS = 60;

/** A cue rendered: the dry mix, both sides, at its rate. */
export interface UiVoice { left: Float32Array; right: Float32Array; sampleRate: number }

/**
 * The launcher's cues over the disc's three files: the menu init's table and names (`makeUiSoundHost`), each cue
 * through the original's own (`UiSoundCues.selection`, `back`, `popup`), the bank sound it resolves to rendered from
 * HUDUI as the front end's `GameAudio.play` renders it (unplaced: pan reset, the bank's own volume and pan; the cue's
 * volume word). `heard`, when given, is told each bank name played. Null for an error, or a name HUDUI does not hold.
 */
export function discVoices(files: UiSoundFiles, heard?: (name: string) => void): (cue: UiCue) => UiVoice | null {
  const bank: SoundBank | null = files.hudui;
  const samples = bank ? new SampleCache(bank.vag) : null;
  let rendered: UiVoice | null = null;
  const { cues } = makeUiSoundHost(files, {
    play(name, _position, _event, volume) {
      const index = bank?.names.get(name) ?? bank?.names.get(name.trim());
      if (!bank || !samples || index === undefined) return false;
      heard?.(name);
      const r = renderSound(bank, index, samples, { vol: Math.round(0x400 * volume), pan: PAN_RESET });
      rendered = { left: r.left, right: r.right, sampleRate: r.sampleRate };
      return true;
    },
    stopMusic() {},
  });
  return (cue) => {
    const source = UI_CUE_SOURCE[cue];
    if (!source) return null;
    rendered = null;
    if (source === 'selection') cues.selection();
    else if (source === 'back') cues.back();
    else cues.popup();
    return rendered;
  };
}

/** What of the console's state says which cue a press plays. */
export interface CueSnap { overlay: string | null; screen: string; start: string; error: string }

export function cueSnap(S: ConsoleState): CueSnap {
  return { overlay: S.overlay, screen: S.screen, start: S.start, error: S.legendError };
}

/** The cue a press plays, from the state before and after it; null for none (a move is CX-20's own hook). */
export function cueFor(before: CueSnap, after: CueSnap, b: Button): UiCue | null {
  if (after.error && after.error !== before.error) return 'error';
  if (before.start === 'idle' && after.start === 'arming') return 'confirm';
  if (after.overlay !== before.overlay) {
    // Decline's question answered No (Cross on No, or Circle) goes back to the agreement under it: the question closes.
    // Any other change into a dialog is an opening, whatever the button (Circle opens the loadout's "leave?" and
    // Decline's question).
    if (after.overlay !== null) return before.overlay === 'confirm' && after.overlay === 'agreement' ? 'close' : 'open';
    // A dialog shut by Circle, or the states panel by its own toggle, is close; one accepted by Cross is confirm.
    return b === 'circle' || before.overlay === 'states' ? 'close' : 'confirm';
  }
  if (after.screen !== before.screen) return b === 'circle' ? 'back' : 'confirm';
  return null;
}

/** What the player needs; the page hands in the real ones (`liveUiSounds`), a test its own. */
export interface UiSoundDeps {
  /** The page's audio context, made at the first gesture (autoplay rules); null where Web Audio is absent. */
  context(): AudioContext | null;
  /** A cue's sound, off the disc (`discVoices`); null before a disc is there, and for a cue with none. */
  voice(cue: UiCue): UiVoice | null;
  /** Settings > Audio's "Launcher sounds" (CX-52), and the page's own gate (never over a game page). */
  enabled(): boolean;
  /** 0..1, Settings > Audio's "Launcher sound volume". */
  volume(): number;
  /** The tab is hidden. */
  hidden(): boolean;
  now(): number;
}

export interface UiSounds {
  /** At a gesture (a key, a click, a touch's end): makes the context once and resumes it -- at every gesture until it runs. */
  unlock(): Promise<void>;
  /** Whether the context runs: a gesture then has nothing to unlock. */
  running(): boolean;
  /** Closes the context (the hand-over takes the launcher down: nothing of it runs under the game page). */
  close(): void;
  /** Plays a cue now; true when it started (none before the unlock, off, hidden, throttled, or no sound for it). */
  play(cue: UiCue): boolean;
}

export function uiSounds(deps: UiSoundDeps): UiSounds {
  let ctx: AudioContext | null = null;
  let made = false;
  const last = new Map<UiCue, number>();
  return {
    unlock() {
      if (!made) {
        made = true;
        try { ctx = deps.context(); } catch { ctx = null; }
      }
      const c = ctx;
      if (!c || c.state === 'running') return Promise.resolve();
      return c.resume().catch(() => { /* the next gesture tries again */ });
    },
    running: () => ctx?.state === 'running',
    close() {
      const c = ctx;
      ctx = null;
      try { void c?.close?.(); } catch { /* already closed */ }
    },
    play(cue) {
      // A suspended context would queue the cue and play every queued one at once when it resumes: none then.
      if (!ctx || ctx.state !== 'running' || !deps.enabled() || deps.hidden()) return false;
      const t = deps.now();
      const prior = last.get(cue);
      if (prior !== undefined && t - prior < UI_SOUND_MIN_GAP_MS) return false;
      const v = deps.voice(cue);
      if (!v || v.left.length === 0) return false;
      last.set(cue, t);
      try {
        const buffer = ctx.createBuffer(2, v.left.length, v.sampleRate);
        buffer.getChannelData(0).set(v.left);
        buffer.getChannelData(1).set(v.right);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, deps.volume())) * LISTENING_GAIN_PLACEHOLDER;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        return true;
      } catch {
        return false;
      }
    },
  };
}
