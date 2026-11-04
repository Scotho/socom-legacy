import { parseRdr, readZarMembers, Zar, type AssetSource, type RdrNode } from '@s2u/archive';
import {
  frontEndSoundTable, HeadsetQueue, keyboardSoundNames, parseBankFile, soundScriptRoot, uiSoundNames, type SoundBank, type UiSoundTable,
} from '@s2u/sound';
import { UiSoundCues, type UiSoundCuesOptions, type UiSoundOutput, type UiSoundPlay } from '@s2u/ui';
import type { AudioEvent, GameAudio, Vec3 } from './audio';
import type { SoundData } from './soundData';

/**
 * The page's side of the menus' sounds (PLAT-23; web research 122): `@s2u/ui`'s `UiSoundCues` over the front end's
 * table, played through the page's `GameAudio`. The front-end entry (PLAT-10's `frontEnd.ts`) connects it: the cues'
 * `sound` is the zAnim host's `SOUND`, their `entries()` the command host's three sound rows, and the widgets, the
 * screen manager and the keyboard call `selection()`, `teletype()`, `back()`, `popup()`, `keyboard(slot)`.
 *
 * What reaches the page:
 * - **a bank play** (every menu one-shot: HUDUI, research 122 §9) is `GameAudio.play` of the name the bank files at the
 *   resolved index, without a place, at the play's volume word / 1024 -- `GameAudio` renders it at that word, as 989snd
 *   takes it. The name is gated upstream by the exact hash (`UiSoundTable`), so `GameAudio`'s own blank-trimming
 *   fallback is never reached: `".SLIDE\t"` stays silent. The pan is -1 on every menu play (the sound's own, 0 for all
 *   24) and the pitch 0 (no menu command carries 0x40), which is what `GameAudio.play` does without a place.
 * - **a stream** of the `MUS` class (SMUS's music) goes to `music`, the page's streamer (`./menuMusic`, MENU-MUSIC,
 *   research 152), when the page has one; any other stream (UIVOICE's voice) to `stream` when the page has one; else
 *   each is counted.
 * - **the headset queue** (`HEADSET_ROUTE_READING`, PF-32: research 233 §2): an `HS` line goes through `HeadsetQueue`
 *   (`FUN_0034b6c0`'s 20 records, `FUN_0034afd0`'s drain) to `stream` as an ordinary stream of its class's group (2,
 *   DIALOG's master: `FUN_00342240` D:L241878-241890), one line at a time -- the next when `stream`'s `ended` is called.
 *   Without a `stream` the line is counted and dropped, as a stream is.
 * - `StopAllSounds` stops the music slot (`GameAudio.stopMusic`) and every stream of the streamer; the one-shots already
 *   started play out (owed: `GameAudio` keeps no handle to a one-shot's voice, and `audio.ts` is not this task's file;
 *   research 122 §12). `FadeAllSounds` fades the streamer's streams (the handle voices; the one-shots are not in the
 *   list, D:L244212-244239). `VagStreaming` reaches the streamer (ON allows its plays, OFF stops them).
 */

/** The page's streamer for the front end's music (`./menuMusic`'s `MenuMusic`), as the output uses it. */
export interface UiMusicSink {
  play(p: Extract<UiSoundPlay, { kind: 'stream' }>): boolean;
  streaming(on: boolean): void;
  stopAll(): void;
  fadeAll(): void;
  /** PF-32: a name slot's voice stopped / faded at its animation instance's end (`UiSoundCues.stopInstance`). */
  stopSlot?(slot: string): void;
  fadeSlot?(slot: string, seconds: number): void;
  releaseSlot?(slot: string): void;
}

/** What of `GameAudio` the host uses. */
export interface UiSoundAudio {
  play(name: string, position: Vec3 | null, event: AudioEvent, volume: number): boolean;
  stopMusic(): void;
}

export interface UiSoundHostStats {
  /** Bank plays `GameAudio` sounded, and those it did not (locked, muted, no bank loaded). */
  played: number;
  refused: number;
  /** Streams handed on or held, headset lines handed to the queue (`HeadsetQueue`), the three commands. */
  streams: number;
  headset: number;
  stopAll: number;
  fadeAll: number;
  streaming: number;
}

export interface UiSoundHostOptions {
  /**
   * A stream's play (the page's streamer), when it has one; else streams are counted only. `ended`, given for a headset
   * line, is to be called once when it has finished or stopped: the queue's next line starts then (`HeadsetQueue`).
   */
  stream?: (p: Extract<UiSoundPlay, { kind: 'stream' }>, ended?: () => void) => void;
  /** The front end's music (`MUS` class streams, `VagStreaming`, the stop and the fade): `./menuMusic`'s `MenuMusic`. */
  music?: UiMusicSink;
}

/** The output the cues play into, over the page's audio. */
export function uiSoundOutput(audio: UiSoundAudio, opts: UiSoundHostOptions = {}): UiSoundOutput & { stats(): UiSoundHostStats } {
  const s: UiSoundHostStats = { played: 0, refused: 0, streams: 0, headset: 0, stopAll: 0, fadeAll: 0, streaming: 0 };
  // PF-32 (b): the HS lines on the TV, each as the ordinary stream FUN_00342240 plays (no name slot, the caller's pan).
  type HeadsetPlay = Extract<UiSoundPlay, { kind: 'headset' }>;
  const headset = new HeadsetQueue<HeadsetPlay>((p, ended) => {
    if (!opts.stream) return false;
    opts.stream({ kind: 'stream', source: p.source, resolution: { kind: 'stream', name: p.resolution.name, object: p.resolution.object }, vol: p.vol, pan: -1, slot: null }, ended);
    return true;
  });
  return {
    play(p) {
      if (p.kind === 'bank') {
        const name = p.resolution.bankName;
        if (name !== null && audio.play(name, null, 'play', p.words.vol / 1024)) s.played++;
        else s.refused++;
      } else if (p.kind === 'stream') {
        s.streams++;
        if (p.resolution.object.music && opts.music) opts.music.play(p);
        else opts.stream?.(p);
      } else { s.headset++; headset.push(p); }
    },
    stopAll() { s.stopAll++; audio.stopMusic(); opts.music?.stopAll(); },
    // PF-32 (research 233 §3): a 0x200 slot's stream at its instance's end; the music's slots are the menus' MUS_ plays
    // (a `stream` sink's voice lines hold no slot the page can reach: they play out).
    stop(slot) { opts.music?.stopSlot?.(slot); },
    fade(slot, seconds) { opts.music?.fadeSlot?.(slot, seconds); },
    release(slot) { opts.music?.releaseSlot?.(slot); },
    fadeAll() { s.fadeAll++; opts.music?.fadeAll(); },
    streaming(on) { s.streaming++; opts.music?.streaming(on); },
    stats: () => ({ ...s }),
  };
}

/** The disc files the menus' sounds are read from (the viewer's asset source reads them). */
export interface UiSoundFiles {
  /** `RUN/SOUNDRDR.ZAR`. */
  soundRdr: Uint8Array;
  /** `HUDUI.bnk` out of `RUN/SOUNDS/BNKSTORE.ZAR`, parsed; null when the source has none (every HUDUI name then refuses). */
  hudui: SoundBank | null;
  /** `RUN/UI/READERC.ZAR`: `uisounds.rdr` and `UiParams.rdr`. */
  readerc: Uint8Array;
}

/** A READERC member by name, or an empty tree when the archive lacks it (every name it would give is then empty). */
function member(z: Zar, name: string): RdrNode {
  const k = z.root.children.find((x) => x.name === name);
  return k ? parseRdr(z.data(k)) : [];
}

/** The menu init's table and names (`FUN_001f4860`), the cues over them, and the output over the page's audio. */
export function makeUiSoundHost(files: UiSoundFiles, audio: UiSoundAudio, opts: UiSoundHostOptions & UiSoundCuesOptions = {}):
  { table: UiSoundTable; cues: UiSoundCues; output: ReturnType<typeof uiSoundOutput> } {
  const table = frontEndSoundTable(soundScriptRoot(files.soundRdr), new Map(files.hudui ? [['HUDUI', files.hudui]] : []));
  const readerc = Zar.parse(files.readerc);
  const output = uiSoundOutput(audio, opts);
  const cues = new UiSoundCues(table, uiSoundNames(member(readerc, 'uisounds.rdr')), keyboardSoundNames(member(readerc, 'UiParams.rdr')), output, opts);
  return { table, cues, output };
}

// ---------------------------------------------------------------------------------------------------------------------
// The page's own host, for the front end opened without a map.

/** Where the menus' sound files are on the disc (the menu init's, `FUN_001f4860`; research 122). */
export const UI_SOUND_FILE_PATHS = {
  soundRdr: 'RUN/SOUNDRDR.ZAR', banks: 'RUN/SOUNDS/BNKSTORE.ZAR', hudui: 'HUDUI.bnk', readerc: 'RUN/UI/READERC.ZAR',
} as const;

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The three files read from the page's source (HUDUI by its member alone, over a ranged source): `files` null when
 * SOUNDRDR or READERC cannot be read (no table to build); a missing HUDUI leaves `hudui` null, so every name refuses.
 * `huduiBytes` is the bank as the page's `GameAudio` takes it. Each file not read is named in `missing`.
 */
export async function readUiSoundFiles(source: AssetSource):
  Promise<{ files: UiSoundFiles | null; huduiBytes: Uint8Array | null; missing: string[] }> {
  const P = UI_SOUND_FILE_PATHS;
  const missing: string[] = [];
  const read = async (path: string): Promise<Uint8Array | null> => {
    try { return await source.read(path); } catch (e) { missing.push(`${path}: ${why(e)}`); return null; }
  };
  const soundRdr = await read(P.soundRdr);
  let huduiBytes: Uint8Array | null = null, hudui: SoundBank | null = null;
  try {
    huduiBytes = (await readZarMembers(source, P.banks, [P.hudui])).get(P.hudui) ?? null;
    if (!huduiBytes) throw new Error(`no ${P.hudui}`);
    hudui = parseBankFile(huduiBytes);
  } catch (e) { missing.push(`${P.banks}: ${why(e)}`); }
  const readerc = await read(P.readerc);
  return { files: soundRdr && readerc ? { soundRdr, hudui, readerc } : null, huduiBytes, missing };
}

/**
 * What the front end's own `GameAudio` is given: HUDUI's bank and nothing of a map (no materials, weapons, callbacks,
 * beds, emitters, streams; no reverb). The page's `gameAudio` holds HUDUI only through a map's sound data
 * (`./soundData`'s `SOUND_GLOBAL_BANKS`), and a map's data replaces the whole set, so the front end keeps its own.
 */
export function frontEndSoundData(hudui: Uint8Array): SoundData {
  return {
    archive: 'FRONTEND', banks: [{ file: UI_SOUND_FILE_PATHS.hudui, bytes: hudui }], materials: [], params: [], weapons: [],
    callbacks: [], defaultMaterial: 0, beds: { outside: [], inside: [] }, emitters: [],
    reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
  };
}

/**
 * What of `GameAudio` the page's front-end host uses beside the plays: its data and its gesture unlock; and, where the
 * page's `GameAudio` is it, the option masters' source (`setTunerVars`, PF-32: research 233 §1).
 */
export type FrontEndAudio = UiSoundAudio & Pick<GameAudio, 'setData' | 'unlockOn'> & Partial<Pick<GameAudio, 'setTunerVars'>>;

/**
 * The page's UI sound host for the front end (`mountFrontEnd`): the three files read from `source`, HUDUI put into
 * `audio` (`frontEndSoundData`), `audio` unlocked by the first gesture on `unlockTarget` (the autoplay rule), and
 * `makeUiSoundHost`'s cues over it. `cues` null when the files are not there (the front end then runs silent).
 *
 * VOICE-LATE's fix round (research 226 §3.2): `audio` is unlocked on `unlockTarget` at the call, before any file is read
 * -- the page's one output, which the page's voice plays on (`./audio` `pageAudioOutput`), is recorded and prepared at
 * page start whether or not the menus' sound files load (unread, or a read that fails, left voice with no output).
 */
export async function pageUiSounds(source: AssetSource, audio: FrontEndAudio, unlockTarget: EventTarget, opts: UiSoundHostOptions & UiSoundCuesOptions = {}):
  Promise<{ cues: UiSoundCues | null; output: ReturnType<typeof uiSoundOutput> | null; missing: string[] }> {
  audio.unlockOn(unlockTarget);
  const { files, huduiBytes, missing } = await readUiSoundFiles(source);
  if (!files) return { cues: null, output: null, missing };
  if (huduiBytes) audio.setData(frontEndSoundData(huduiBytes));
  const { cues, output } = makeUiSoundHost(files, audio, opts);
  return { cues, output, missing };
}
