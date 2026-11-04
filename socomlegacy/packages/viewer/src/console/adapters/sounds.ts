import type { AssetSource } from '@s2u/archive';
import { readDisc, onDiscChange } from '../../modern/discStore';
import { pageSettings } from '../../pageStore';
import { readUiSoundFiles, type UiSoundFiles } from '../../uiSoundHost';
import type { Adapters } from '../state';
import { discVoices, uiSounds, type UiCue, type UiVoice } from '../sounds';
import { CONSOLE_KEYS } from './options';

/**
 * CX-51 / CX-52 (CX.R19): the launcher page's UI sounds -- `../sounds`' player over the page's Web Audio, the original's
 * menu sounds read from the player's disc (`LAUNCHER_UI_SOUNDS_FROM_DISC_ADAPTATION`: the disc the launcher holds,
 * `../../modern/discStore`, its three sound files read once per disc, `../../uiSoundHost` `readUiSoundFiles`), and
 * Settings > Audio's two rows (`CONSOLE_KEYS.sounds`, `CONSOLE_KEYS.soundVolume`, kept in this browser). Silent until a
 * disc is there; the build fetches no sound of its own. The audio context is made at the first key, click or tap (a
 * browser plays nothing before a gesture); a controller press is not one, so a pad-only visit is silent until then.
 * Only the launcher page takes it: over a game page the console is the overlay's and has no cue, so the game's own front
 * end and its matches are never touched. A browser adaptation.
 */
export interface LiveUiSoundDeps {
  context?: () => AudioContext | null;
  /** The disc's sound files (`readUiSoundFiles`). */
  read?: (source: AssetSource) => Promise<{ files: UiSoundFiles | null }>;
  /** The cues over them (`discVoices`). */
  voices?: (files: UiSoundFiles) => (cue: UiCue) => UiVoice | null;
}

export const SOUND_VOLUME_STEPS = 11;
export const SOUND_VOLUME_DEFAULT = 7;

/** The two rows' values as kept: on unless switched off; the volume 0..1 from its step (70% by default). */
export function soundsOn(): boolean { return pageSettings.get(CONSOLE_KEYS.sounds) !== '0'; }
export function soundVolume(): number {
  // The batch review's F1: an unset key is the default (`Number(null)` is 0, which read as silent).
  const raw = pageSettings.get(CONSOLE_KEYS.soundVolume);
  const n = raw === null ? SOUND_VOLUME_DEFAULT : Number(raw);
  const step = Number.isInteger(n) && n >= 0 && n < SOUND_VOLUME_STEPS ? n : SOUND_VOLUME_DEFAULT;
  return step / (SOUND_VOLUME_STEPS - 1);
}

export function liveUiSounds(win: Window, doc: Document, deps: LiveUiSoundDeps = {}): { cue: NonNullable<Adapters['cue']>; dispose(): void } {
  const context = deps.context ?? ((): AudioContext | null => {
    const Ctor = (win as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (win as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  });
  const read = deps.read ?? readUiSoundFiles;
  const voicesOf = deps.voices ?? ((files: UiSoundFiles) => discVoices(files));
  // The disc the launcher holds, its files read once: a new disc (another image) reads its own; none, silence.
  let held: AssetSource | null = null;
  let voice: ((cue: UiCue) => UiVoice | null) | null = null;
  const sync = (): void => {
    const d = readDisc(doc);
    const image = d.state === 'ready' ? d.image : null;
    if (image === held) return;
    held = image;
    voice = null;
    if (!image) return;
    void read(image).then((r) => { if (held === image && r.files) voice = voicesOf(r.files); }, () => { /* silent */ });
  };
  const offDisc = onDiscChange(doc, sync);
  sync();
  const sounds = uiSounds({
    context,
    voice: (cue) => { sync(); return voice?.(cue) ?? null; },
    enabled: soundsOn,
    volume: soundVolume,
    hidden: () => doc.hidden,
    now: () => win.performance?.now() ?? Date.now(),
  });
  // A user activation (the batch review's F3): a key, a click, a pointer's or a touch's end -- not a touch's
  // pointerdown, which a browser does not count. Any gesture with the context not running tries again: before the
  // first unlock, and after the system suspends it (iOS: the background, a call, a route change; the re-review's N2).
  const GESTURES = ['keydown', 'click', 'pointerup', 'touchend'] as const;
  const stop = (): void => { for (const g of GESTURES) win.removeEventListener(g, onGesture, true); };
  const onGesture = (): void => { if (!sounds.running()) void sounds.unlock(); };
  for (const g of GESTURES) win.addEventListener(g, onGesture, true);
  return {
    cue: { selection: () => { sounds.play('move'); }, play: (cue) => { sounds.play(cue); } },
    dispose(): void { stop(); offDisc(); sounds.close(); },
  };
}
