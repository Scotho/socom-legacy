import { isRanged, streamFile, Zar, ZAR_HEAD, zarIndexLength, type AssetSource } from '@s2u/archive';
import {
  FADE_ALL_TICKS, MUSIC_VOLUME_DEFAULT, STREAM_TICK_HZ, VpkStreamReader, mixStreamBuffer, streamFadeCurve, streamGroupMaster,
  streamGroupModifier, streamMember, streamVoiceGains, vagStreamLoc, vagStreamPlayWords, type StreamVoiceGains,
} from '@s2u/sound';
import type { UiSoundPlay } from '@s2u/ui';
import type { WebAudioOut } from './audio';
import { webAudioOutContext } from './frontEndMovies';

/**
 * The front end's music in the page (MENU-MUSIC, PLAT-22's front-end half; web research 152 §4). A `MUS_` stream play
 * of PLAT-23's cues (a zAnim `SOUND` command: `dlgWorldOfSOCOM`'s and `dlgOptions_Menu`'s `MUS_ONLINE_MENU`) opens its
 * VPK member in `RUN/SOUNDS/VAGSTORE.ZAR` through the page's `AssetSource` -- the archive's index, then the member a
 * buffer (0xb000 bytes) at a time by range, never the archive whole (577 MB) -- decodes each buffer with `@s2u/sound`'s
 * `VpkStreamReader` and schedules it on the front end's own audio output ahead of the output's clock, at the 989snd
 * level: the play's volume word and pan through the music group's square law, the group's master `MUSIC_VOLUME x 1024`
 * (`streamVoiceGains`, `streamGroupMaster`). It loops as flags 4 asks (`LOOP` in the entry); a new play in a name slot
 * stops the slot's voice first (`FUN_002659c0` D:L112451-112455); `StopAllSounds` (989snd `snd_StopAllSounds`) and
 * `VagStreaming(OFF)` (`FUN_00344f80`: `snd_StopAllVAGStreams`) stop every stream; `FadeAllSounds` (`FUN_00346c30`)
 * ramps each to 0 over 360 ticks and leaves it playing, silent. The screens' exits are the scripts' own (research 152
 * §2): the streamer stops nothing of its own accord.
 *
 * The reads go through `AssetSource`: `readRange` where the source has it (the served tree's `HttpAssetSource`, the
 * visitor's disc image's `IsoAssetSource`), else its `stream` over the same extent; a source with neither is refused,
 * never read whole.
 */

/** Where the streams are on the disc. */
export const VAGSTORE_PATH = 'RUN/SOUNDS/VAGSTORE.ZAR';

/**
 * **A browser adaptation, labelled** (no original; the IRX double-buffers 0xb000-byte buffers into SPU memory as the
 * voice plays them): the page decodes and schedules this many seconds of a stream ahead of its output's clock, so a slow
 * read or a busy frame does not open a gap.
 */
export const MENU_MUSIC_LEAD_SECONDS_ADAPTATION = 2;

/**
 * **A browser adaptation, labelled** (web research 152 §4; HUMAN_TASKS H74's default for the movies is the model): a
 * browser starts no audio before a user gesture, so a stream played before the first one waits, and starts from its top
 * when the output starts running. The console's would have been playing since the screen opened.
 */
export const MENU_MUSIC_GESTURE_ADAPTATION = 'wait-then-start-at-gesture' as const;

/**
 * STREAM_OFF_PLAY_READING: a stream play while `VagStreaming` is off sounds nothing. `FUN_00344f80` tears the streamer
 * down (`snd_StopAllVAGStreams`, the channel count `DAT_0048dd98` to 0) and only `FUN_003450f0` brings it back
 * (`snd_InitVAGStreamingEx(4, 0xb000, 0)`); 989snd's play with no stream channel is not in the reference (`stream.c` is
 * signatures only). On the disc every `MUS_` play follows a `VagStreaming(ON)` (research 152 §2). [reading]
 */
export const STREAM_OFF_PLAY_READING = 'refused';

/**
 * MATCH_RETURN_MUSIC_PLACEHOLDER (MATCH-SOUND, web research 222 §7): the menus' music across a match. Entering the match
 * stops it -- the original's menu state is left and its menus do not run in a match -- and no play is taken while the
 * match runs (`MenuMusic.hold`). At the lobby's return (the match's end), once its dialog has started, the streams held
 * (a faded one aside) are started again from their start -- unless the dialog made a music call of its own; any other
 * return (dlgNetError, an abandon) drops them (`settleHeld`). The streams started again last only until the menus' next
 * music call (a play, `StopAllSounds`, `FadeAllSounds`, `VagStreaming`): it stops them first, so a returning dialog whose
 * own music comes after the settle (a delayed binding, through another slot) is never heard over them (FE-SWEEP). Not
 * read: the original's return order (whether the lobby's dialog plays before any frame of the menu state). Not read: whether
 * the original, re-entering the menu state into GAME LOBBY, plays `MUS_ONLINE_MENU` again (the lobby's own scripts, its
 * `StartMusic` valve: research 152 R152.2) or leaves it silent until a screen that calls its music; settled by a capture
 * of a match's end into the lobby. [placeholder]
 */
export const MATCH_RETURN_MUSIC_PLACEHOLDER = 'held streams restarted from their start at the return' as const;

/** The pump's period, ms: how often a playing stream tops its lead up. */
const PUMP_MS = 100;
/** Streams the stats keep after they stop. */
const KEPT = 8;

/** One voice of a stream on the output: pieces scheduled back to back through one gain stage. */
export interface MusicVoice {
  /**
   * The stream's mix matrix (`StreamVoiceGains`: each data channel into the output's pair), live: the pieces are then
   * played unmixed and the matrix set again when MUSIC VOLUME moves (`MenuMusic.refreshVolume`). Absent, each piece is
   * mixed at its schedule with the gains of the stream's start.
   */
  setMix?(gains: StreamVoiceGains): void;
  /** Plays a stereo piece at the output's time `when`. */
  play(left: Float32Array, right: Float32Array, rate: number, when: number): void;
  /** Multiplies the stage by `curve` (its first value now, its last `seconds` later), and holds the last. */
  fade(curve: Float32Array, seconds: number): void;
  /** Every piece stopped, the stage let go. */
  stop(): void;
}

/** The output the music plays on: a clock that stands still until it runs (an `AudioContext`'s), and its voices. */
export interface MusicOut {
  readonly running: boolean;
  readonly currentTime: number;
  voice(): MusicVoice;
}

export type MusicStreamState = 'opening' | 'waiting' | 'playing' | 'ended' | 'stopped' | 'failed';

export interface MusicStreamStats {
  name: string;
  member: string;
  slot: string | null;
  loop: boolean;
  /** `snd_PlayVAGStreamByLoc`'s words, the sector counted from VAGSTORE's first (the served tree has no disc sectors). */
  words: number[];
  gains: StreamVoiceGains | null;
  state: MusicStreamState;
  /** Buffers scheduled, wraps of the loop, seconds scheduled, the output time the first piece starts at. */
  buffers: number;
  wraps: number;
  scheduledSeconds: number;
  startedAt: number | null;
  /** Times the schedule had fallen behind the output's clock (a gap heard). */
  underruns: number;
  faded: boolean;
  error: string | null;
}

export interface MenuMusicStats {
  /** `VagStreaming`'s state, as the streamer was last told. */
  streamingOn: boolean;
  plays: number;
  refused: { off: number };
  stopAll: number;
  fadeAll: number;
  streams: MusicStreamStats[];
}

export interface MenuMusicOptions {
  /** The page's source: the served tree or the visitor's disc image. */
  source: AssetSource;
  /** The output, once there is one (the page's is made at the first gesture): null, the stream waits. */
  out: () => MusicOut | null;
  /** Calls `run` each time the output starts running (the page's `WebAudioOut.onRunning`). */
  whenRunning: (run: () => void) => void;
  /** `MUSIC_VOLUME` (the session's UI variable), read at each play; absent, `MUSIC_VOLUME_DEFAULT`. */
  musicVolume?: () => number;
  /** Seconds scheduled ahead (`MENU_MUSIC_LEAD_SECONDS_ADAPTATION`). */
  lead?: number;
  /** A failed stream, for the page's console. */
  onError?: (member: string, e: unknown) => void;
  /** Runs `run` after `seconds` (a slot fade's stop, `fadeSlot`); absent, `setTimeout`. */
  later?: (run: () => void, seconds: number) => void;
}

interface Stream {
  /** The play that started it (`hold`'s replay). */
  play: Extract<UiSoundPlay, { kind: 'stream' }>;
  /** The stream's data channels (its header's; 2 until it is open). */
  channels: number;
  stats: MusicStreamStats;
  vol: number;
  pan: number;
  alive: boolean;
  reader: VpkStreamReader | null;
  voice: MusicVoice | null;
  wake: (() => void) | null;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** `length` bytes from `offset` of `path` through the source: by range, else by its stream; else refused. */
function rangeReader(source: AssetSource, path: string): (offset: number, length: number) => Promise<Uint8Array> {
  if (isRanged(source)) return (offset, length) => source.readRange(path, offset, length);
  if (source.stream) {
    return async (offset, length) => {
      const out = new Uint8Array(length);
      let at = 0;
      for await (const c of streamFile(source, path, { offset, length, chunkSize: length })) { out.set(c.subarray(0, length - at), at); at += c.length; }
      if (at < length) throw new Error(`${path}: ${at} of ${length} bytes at ${offset}`);
      return out;
    };
  }
  return async () => { throw new Error(`${path}: this source reads neither by range nor by stream, and the music is never read whole`); };
}

/** The page's streamer for the front end's music (see the file's header). */
export class MenuMusic {
  private on = false;
  private dead = false;
  /** The plays held for a match (`hold`), null while none is. */
  private held: Extract<UiSoundPlay, { kind: 'stream' }>[] | null = null;
  /** The plays held, let go but not yet settled (`settleHeld`), and the menus' sound counts at the let-go. */
  private pending: { plays: Extract<UiSoundPlay, { kind: 'stream' }>[]; mark: string } | null = null;
  /**
   * The streams `settleHeld` started again, until the menus' next music call (FE-SWEEP): that call stops them first, so
   * a returning dialog whose own music comes later (a delayed binding, another slot) is the only stream heard.
   */
  private replayed: Stream[] = [];
  /** `VagStreaming(OFF)`s heard: a returning dialog's silence counts as its say. */
  private offs = 0;
  private readonly live = new Set<Stream>();
  private readonly slots = new Map<string, Stream>();
  private readonly kept: MusicStreamStats[] = [];
  private index: Promise<Zar> | null = null;
  private readonly read: (offset: number, length: number) => Promise<Uint8Array>;
  private readonly counts = { plays: 0, off: 0, stopAll: 0, fadeAll: 0 };

  constructor(private readonly opts: MenuMusicOptions) {
    this.read = rangeReader(opts.source, VAGSTORE_PATH);
    opts.whenRunning(() => this.resume());
  }

  /**
   * MUSIC VOLUME moved (OPTIONS' AUDIO page, research 302 §4): each playing stream's matrix at the music group's master
   * now, where its voice takes one (`MusicVoice.setMix`) -- the original's group master changes the voices sounding
   * (`CMusicTuner_UpdateUIVar` 0x38a040). Called each front-end frame; nothing changes while the volume does not.
   */
  refreshVolume(): void {
    const modifier = this.modifier();
    for (const st of this.live) {
      if (!st.voice?.setMix || !st.stats.gains) continue;
      const next = streamVoiceGains(st.vol, st.pan, st.channels, modifier);
      if (next.left.every((v, i) => v === st.stats.gains!.left[i]) && next.right.every((v, i) => v === st.stats.gains!.right[i])) continue;
      st.voice.setMix(next);
      st.stats.gains = next;
    }
  }

  /** `VagStreaming`: ON allows the plays; OFF stops every stream (`snd_StopAllVAGStreams`) and refuses plays until ON. */
  streaming(on: boolean): void {
    this.dropReplayed();
    if (!on) { this.stopStreams(); this.offs++; }
    this.on = on;
  }

  /** A `MUS_` stream play: true when it was taken (it may still wait for the output, or fail to open). */
  play(p: Extract<UiSoundPlay, { kind: 'stream' }>): boolean {
    if (this.dead || this.held) return false;
    this.dropReplayed();
    this.counts.plays++;
    if (!this.on) { this.counts.off++; return false; }                        // STREAM_OFF_PLAY_READING
    if (p.slot !== null) {                                                    // D:L112451-112455: the slot's voice first
      const had = this.slots.get(p.slot);
      if (had) this.end(had, 'stopped');
    }
    const o = p.resolution.object, member = streamMember(o);
    const st: Stream = {
      play: p, channels: 2, vol: p.vol, pan: p.pan, alive: true, reader: null, voice: null, wake: null,
      stats: {
        name: p.resolution.name, member, slot: p.slot, loop: o.loop, words: [], gains: null, state: 'opening',
        buffers: 0, wraps: 0, scheduledSeconds: 0, startedAt: null, underruns: 0, faded: false, error: null,
      },
    };
    this.live.add(st);
    if (p.slot !== null) this.slots.set(p.slot, st);
    void this.run(st, o);
    return true;
  }

  /**
   * MATCH-SOUND: the menus' music across a match (`MATCH_RETURN_MUSIC_PLACEHOLDER`). On: every stream stopped, its play
   * kept, and no play taken until it is let go. Off: the plays kept started again, from their start.
   */
  hold(on: boolean): void {
    if (on) {
      if (this.held) return;
      // A faded stream (FadeAllSounds, a slot's fade) plays on silent: it is not one to start again audibly.
      const plays = [...this.live].filter((st) => !st.stats.faded).map((st) => st.play);
      this.stopStreams();
      this.pending = null;
      this.held = plays;
      return;
    }
    if (!this.held) return;
    this.pending = { plays: this.held, mark: this.mark() };
    this.held = null;
  }

  /**
   * The return settled (the returning dialog has started: `FrontEndSession`'s `lobbyMatch.settled`): the plays held
   * started again when `replay` (the lobby's return) and the dialog's start made no music call of its own -- a play, a
   * stop, a fade, streaming turned off -- so its own music, or its silence, wins. Once.
   */
  settleHeld(replay: boolean): void {
    const p = this.pending;
    this.pending = null;
    if (!p || !replay || p.mark !== this.mark()) return;
    for (const play of p.plays) this.play(play);
    this.replayed = [...this.live];
  }

  /** The menus spoke after a replay: the replayed streams stopped first (`MATCH_RETURN_MUSIC_PLACEHOLDER`), once. */
  private dropReplayed(): void {
    const r = this.replayed;
    if (!r.length) return;
    this.replayed = [];
    for (const st of r) if (st.alive) this.end(st, 'stopped');
  }

  /** The music calls heard so far, as one mark (`settleHeld`'s "none since"). */
  private mark(): string {
    const c = this.counts;
    return `${c.plays}/${c.stopAll}/${c.fadeAll}/${this.offs}`;
  }

  /** `StopAllSounds`: every stream stopped. */
  stopAll(): void {
    this.dropReplayed();
    this.counts.stopAll++;
    this.stopStreams();
  }

  /** `FadeAllSounds`: every stream's AutoVol to 0 over 360 ticks (1.5 s); each keeps playing, silent. */
  fadeAll(): void {
    this.dropReplayed();
    this.counts.fadeAll++;
    for (const st of this.live) this.fade(st);
  }

  /**
   * PF-32 (research 233 §3): a name slot's voice stopped at its animation instance's end -- `FUN_0026fd20`'s StopSound
   * (`FUN_00347610` + `FUN_00347810`, D:L118467-118468). A slot that holds none: nothing.
   */
  stopSlot(slot: string): void {
    const st = this.slots.get(slot);
    if (st) this.end(st, 'stopped');
  }

  /**
   * PF-32: a name slot's voice faded at its instance's end -- `FUN_0026fd20`'s `FUN_00346dd0(+4)` then `FUN_00346d30`
   * (D:L118463-118464): 989snd's AutoVol to 0 over `trunc(seconds x 240)` ticks (as the slot fade's 2.0 s is 480,
   * D:L244289-244307), the slot let go at once, and the voice stopped when the timer runs out (`FUN_00346ea0`, D:L244358-244385).
   */
  fadeSlot(slot: string, seconds: number): void {
    const st = this.slots.get(slot);
    if (!st) return;
    this.slots.delete(slot);
    const ticks = Math.max(1, Math.trunc(Math.fround(Math.fround(seconds) * STREAM_TICK_HZ)));
    st.stats.faded = true;
    st.voice?.fade(streamFadeCurve(st.vol, this.modifier(), ticks), seconds);
    const later = this.opts.later ?? ((run: () => void, s: number): void => { setTimeout(run, s * 1000); });
    later(() => this.end(st, 'stopped'), seconds);
  }

  /**
   * PF-32: a name slot let go at its instance's end without the 0x200 mark -- `FUN_0026fd20` zeroes the handle
   * (D:L118453-118460, D:L118470) and the voice plays on; the slot no longer holds it, so the next play there stops nothing.
   */
  releaseSlot(slot: string): void {
    this.slots.delete(slot);
  }

  /** The output started running: the streams waiting for it start. */
  resume(): void {
    for (const st of this.live) { const w = st.wake; st.wake = null; w?.(); }
  }

  /**
   * A test instrument, not the original's (the browser spec's): each playing stream's next read moved to `seconds`
   * before its pass's end, its ADPCM history zeroed, so a three-minute track's wrap is seen in seconds.
   */
  skip(seconds: number): void {
    for (const st of this.live) {
      const r = st.reader;
      if (r && r.bufferSeconds > 0) r.seek(r.bufferCount - Math.ceil(seconds / r.bufferSeconds));
    }
  }

  /** The page's unmount: every stream stopped, no play taken after. */
  stop(): void {
    this.dead = true;
    this.stopStreams();
  }

  stats(): MenuMusicStats {
    return {
      streamingOn: this.on, plays: this.counts.plays, refused: { off: this.counts.off }, stopAll: this.counts.stopAll, fadeAll: this.counts.fadeAll,
      streams: [...this.kept, ...[...this.live].map((s) => s.stats)].map((s) => ({ ...s, words: [...s.words] })),
    };
  }

  private stopStreams(): void {
    for (const st of [...this.live]) this.end(st, 'stopped');
  }

  private end(st: Stream, state: MusicStreamState): void {
    if (!this.live.has(st)) return;
    st.alive = false;
    if (state === 'stopped' || state === 'failed') st.voice?.stop();
    st.stats.state = state;
    this.live.delete(st);
    if (st.stats.slot !== null && this.slots.get(st.stats.slot) === st) this.slots.delete(st.stats.slot);
    this.kept.push(st.stats);
    if (this.kept.length > KEPT) this.kept.shift();
    const w = st.wake; st.wake = null; w?.();
  }

  private fade(st: Stream): void {
    st.stats.faded = true;
    const modifier = this.modifier();
    st.voice?.fade(streamFadeCurve(st.vol, modifier, FADE_ALL_TICKS), FADE_ALL_TICKS / STREAM_TICK_HZ);
  }

  private modifier(): number {
    return streamGroupModifier(streamGroupMaster(this.opts.musicVolume?.() ?? MUSIC_VOLUME_DEFAULT));
  }

  /** VAGSTORE's index, read once: its head, then its string table and key tree. */
  private archive(): Promise<Zar> {
    if (!this.index) {
      this.index = (async () => Zar.parse(await this.read(0, zarIndexLength(await this.read(0, ZAR_HEAD)))))();
      this.index.catch(() => { this.index = null; });
    }
    return this.index;
  }

  private async run(st: Stream, entry: Extract<UiSoundPlay, { kind: 'stream' }>['resolution']['object']): Promise<void> {
    try {
      const zar = await this.archive();
      const key = zar.root.children.find((k) => k.name.toUpperCase() === st.stats.member.toUpperCase());
      if (!key) throw new Error(`${VAGSTORE_PATH} has no ${st.stats.member}`);
      const base = zar.dataOffset + key.offset;
      st.stats.words = vagStreamPlayWords(entry, st.vol, st.pan, vagStreamLoc(0, base));
      if (!st.alive) return;
      const reader = new VpkStreamReader((at, n) => this.read(base + at, n), key.size, { loop: entry.loop });
      st.reader = reader;
      const h = await reader.open();
      st.channels = h.channels;
      const gains = streamVoiceGains(st.vol, st.pan, h.channels, this.modifier());
      st.stats.gains = gains;
      const lead = this.opts.lead ?? MENU_MUSIC_LEAD_SECONDS_ADAPTATION;
      // The lead is read before the first piece is scheduled (and while the stream waits for the gesture): a slow first
      // read opens no gap at the start. Then each piece is read as the schedule needs it.
      const ready: { left: Float32Array; right: Float32Array; seconds: number; wrapped: boolean }[] = [];
      let readySeconds = 0, done = false;
      const readOne = async (): Promise<(typeof ready)[number] | null> => {
        if (done) return null;
        const b = await reader.next();
        if (!b) { done = true; return null; }
        // Unmixed: the voice's matrix mixes it (`setMix`), else its schedule below at the stream's gains.
        return { left: b.left, right: h.channels > 1 ? b.right : new Float32Array(b.left.length), seconds: b.left.length / h.sampleRate, wrapped: b.wrapped };
      };
      const take = async (): Promise<(typeof ready)[number] | null> => {
        const had = ready.shift();
        if (had) { readySeconds -= had.seconds; return had; }
        return readOne();
      };
      while (st.alive && !done && readySeconds < lead) {
        const piece = await readOne();
        if (piece) { ready.push(piece); readySeconds += piece.seconds; }
      }
      let out = this.opts.out();
      while (st.alive && !(out && out.running)) {                            // MENU_MUSIC_GESTURE_ADAPTATION
        st.stats.state = 'waiting';
        await new Promise<void>((r) => { st.wake = r; });
        out = this.opts.out();
      }
      if (!st.alive || !out) return;
      const voice = out.voice();
      st.voice = voice;
      voice.setMix?.(st.stats.gains ?? gains);
      if (st.stats.faded) voice.fade(Float32Array.of(0, 0), 1 / STREAM_TICK_HZ);
      st.stats.state = 'playing';
      let next = out.currentTime;
      st.stats.startedAt = next;
      while (st.alive) {
        while (st.alive && (ready.length > 0 || next - out.currentTime < lead)) {
          const piece = await take();
          if (!st.alive) return;
          if (!piece) { this.end(st, 'ended'); return; }
          if (next < out.currentTime) { st.stats.underruns++; next = out.currentTime; }
          const mixed = voice.setMix ? piece : mixStreamBuffer(piece.left, h.channels > 1 ? piece.right : null, gains);
          voice.play(mixed.left, mixed.right, h.sampleRate, next);
          next += piece.seconds;
          st.stats.buffers++;
          st.stats.scheduledSeconds += piece.seconds;
          if (piece.wrapped) st.stats.wraps++;
        }
        await new Promise<void>((r) => setTimeout(r, PUMP_MS));
      }
    } catch (e) {
      st.stats.error = why(e);
      this.end(st, 'failed');
      this.opts.onError?.(st.stats.member, e);
    }
  }
}

/** A `MusicOut` over an `AudioContext`: each voice a gain stage into `destination`, its pieces buffer sources. */
export function webAudioMusicOut(ctx: AudioContext, destination: AudioNode): MusicOut {
  return {
    get running() { return ctx.state === 'running'; },
    get currentTime() { return ctx.currentTime; },
    voice(): MusicVoice {
      const stage = ctx.createGain();
      stage.connect(destination);
      // The mix matrix (`setMix`): each data channel into the output's pair through a gain of its own, then the stage.
      const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2), mix: GainNode[] = [];
      for (let from = 0; from < 2; from++) {
        for (let side = 0; side < 2; side++) {
          const g = ctx.createGain();
          g.gain.value = from === side ? 1 : 0;
          split.connect(g, from);
          g.connect(merge, 0, side);
          mix.push(g);
        }
      }
      merge.connect(stage);
      const nodes = new Set<AudioBufferSourceNode>();
      return {
        setMix(gains) { [...gains.left, ...gains.right].forEach((v, i) => { mix[i]!.gain.setValueAtTime(v, ctx.currentTime); }); },
        play(left, right, rate, when) {
          const buffer = ctx.createBuffer(2, left.length, rate);
          buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
          buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
          const node = ctx.createBufferSource();
          node.buffer = buffer;
          node.connect(split);
          node.onended = () => { nodes.delete(node); node.disconnect(); };
          nodes.add(node);
          node.start(Math.max(when, ctx.currentTime));
        },
        fade(curve, seconds) {
          const now = ctx.currentTime;
          stage.gain.cancelScheduledValues(now);
          stage.gain.setValueCurveAtTime(curve, now, Math.max(seconds, 1e-3));
        },
        stop() {
          for (const n of nodes) { try { n.stop(); } catch { /* ended */ } n.disconnect(); }
          nodes.clear();
          stage.disconnect();
          split.disconnect(); merge.disconnect();
          for (const g of mix) g.disconnect();
        },
      };
    },
  };
}

/** The front end's music output over the page's `WebAudioOut` (its context and master, once it has made them). */
export function frontEndMusicOut(out: WebAudioOut): () => MusicOut | null {
  let made: { ctx: AudioContext; out: MusicOut } | null = null;
  return () => {
    const c = webAudioOutContext(out);
    if (!c) return null;
    if (made?.ctx !== c.ctx) made = { ctx: c.ctx, out: webAudioMusicOut(c.ctx, c.destination) };
    return made.out;
  };
}
