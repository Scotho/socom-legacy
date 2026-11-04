// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CardSlots } from '@s2u/card';
import { CONSOLE_KEYS, liveOptions } from '../../src/console/adapters/options';
import { cardOptionStore } from '../../src/modern/settings/store';
import { liveUiSounds } from '../../src/console/adapters/sounds';
import type { UiCue, UiVoice } from '../../src/console/sounds';
import { LISTENING_GAIN_PLACEHOLDER } from '../../src/audio';
import { publishDisc } from '../../src/modern/discStore';
import { publishDiscImage } from '../../src/modern/discImage';
import type { UiSoundFiles } from '../../src/uiSoundHost';
import type { AssetSource } from '@s2u/archive';
import { PAGE_SETTING_KEYS, pageSettings } from '../../src/pageStore';

/**
 * CX-52 (CX.R19, the owner: "On, with a toggle (Recommended)"): Settings > Audio's "Launcher sounds" (On by default) and
 * "Launcher sound volume", kept in this browser; the launcher's live player reads them, waits for the first gesture,
 * and is silent with the tab hidden. A browser adaptation.
 */
afterEach(() => { localStorage.clear(); });

function options() {
  const m = new Map<string, string>();
  const slots = new CardSlots(() => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }) as unknown as Storage, () => undefined, { now: () => 1 });
  return liveOptions(() => {}, { store: cardOptionStore(slots), signedIn: () => false, pads: () => [], launcher: { disc: () => 'empty', isoInserted: () => false, filename: () => null, onChange: () => () => {} } });
}

describe('CX-52: the launcher sounds in Settings > Appearance (LR-5 moved them from Audio)', () => {
  it('two rows on the Appearance tab: on by default, the volume at 70%', () => {
    const o = options();
    const audio = o.categories().find((c) => c.id === 'appearance')!;
    const ids = audio.rows.map((r) => r.id);
    expect(ids).toContain('sounds');
    expect(ids).toContain('soundVolume');
    expect(o.value('sounds')).toBe(1);
    expect(o.value('soundVolume')).toBe(7);
    o.set('sounds', 0);
    expect(pageSettings.get(CONSOLE_KEYS.sounds)).toBe('0');
  });
});

/** A Web Audio stand-in counting what started (each voice's first sample) and at what gain. */
function audio(state: 'running' | 'suspended' = 'running') {
  const started: number[] = [];
  const gains: number[] = [];
  let resumes = 0;
  const ctx = {
    state: state as 'running' | 'suspended', destination: {}, close: async () => {},
    resume: () => { resumes += 1; ctx.state = 'running'; return Promise.resolve(); },
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (i: number) => data[i]! };
    },
    createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
    createBufferSource: () => {
      const n = {
        buffer: null as { getChannelData(i: number): Float32Array } | null, out: null as { gain: { value: number } } | null,
        connect: (g: { gain: { value: number } }) => { n.out = g; },
        start: () => { started.push(n.buffer!.getChannelData(0)[0]!); gains.push(n.out?.gain.value ?? -1); },
      };
      return n;
    },
  };
  return { ctx, started, gains, resumes: () => resumes };
}

/** The disc's three files as the reader would give them (opaque here: `voices` below is the stand-in that reads them). */
const FILES = { soundRdr: new Uint8Array(1), hudui: null, readerc: new Uint8Array(1) } as UiSoundFiles;
const voiceOf = (n: number): UiVoice => ({ left: new Float32Array([n]), right: new Float32Array([n]), sampleRate: 48_000 });
/** A disc source and its reads counted. */
function disc() {
  const reads: AssetSource[] = [];
  const source = { read: async () => new Uint8Array(0) } as unknown as AssetSource;
  const read = async (src: AssetSource) => { reads.push(src); return { files: FILES, huduiBytes: null, missing: [] }; };
  const voices = () => (cue: UiCue) => (cue === 'error' ? null : voiceOf(cue === 'back' ? 2 : 1));
  return { source, read, voices, reads };
}
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
// As the disc adapter does (`adapters/disc.ts`): reading while the image opens, then ready with it.
const insert = (src: AssetSource): void => { publishDisc(document, { state: 'reading' }); publishDiscImage(document, src); publishDisc(document, { state: 'ready' }); };
afterEach(() => { publishDiscImage(document, null); publishDisc(document, { state: 'empty' }); });

describe('CX-51: the launcher\'s live player, the original\'s menu sounds off the disc', () => {
  it('silent until a disc is there: nothing is read and nothing plays; then the disc\'s files are read once and the cues play', async () => {
    const a = audio(), d = disc();
    const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read: d.read, voices: d.voices });
    window.dispatchEvent(new Event('keydown'));
    await flush();
    s.cue.selection();
    expect(d.reads).toEqual([]);
    expect(a.started).toEqual([]);
    insert(d.source);
    await flush();
    s.cue.selection();
    s.cue.play?.('back');
    s.cue.play?.('error');
    expect(a.started).toEqual([1, 2]);
    expect(d.reads).toEqual([d.source]);
    s.dispose();
  });

  it('no sound file is fetched from the page: the build ships none (the Kenney pack retired)', async () => {
    const a = audio(), d = disc();
    let fetched = 0;
    const real = window.fetch;
    window.fetch = (async () => { fetched++; return new Response(); }) as typeof fetch;   // the page's own (the review's F2)
    try {
      const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read: d.read, voices: d.voices });
      insert(d.source);
      window.dispatchEvent(new Event('keydown'));
      await flush();
      s.cue.selection();
      s.cue.play?.('back');
      expect(fetched).toBe(0);
      s.dispose();
    } finally { window.fetch = real; }
  });

  // The review's F3: the two races the adapter guards.
  it('a disc replaced while its files are read: the old read is dropped, the new disc\'s cues play', async () => {
    const a = audio();
    const first = { read: async () => new Uint8Array(0) } as unknown as AssetSource;
    const second = { read: async () => new Uint8Array(0) } as unknown as AssetSource;
    let release: (() => void) | null = null;
    const read = (src: AssetSource) => (src === first
      ? new Promise<{ files: UiSoundFiles }>((res) => { release = () => res({ files: { ...FILES, soundRdr: new Uint8Array([1]) } }); })
      : Promise.resolve({ files: { ...FILES, soundRdr: new Uint8Array([2]) } }));
    const voices = (files: UiSoundFiles) => () => voiceOf(files.soundRdr[0]!);
    const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read, voices });
    window.dispatchEvent(new Event('keydown'));
    insert(first);
    await flush();
    insert(second);
    await flush();
    release!();                                                      // the first disc's read settles last
    await flush();
    s.cue.selection();
    expect(a.started).toEqual([2]);
    s.dispose();
  });

  it('a read that fails leaves the launcher silent, and throws nothing', async () => {
    const a = audio(), d = disc();
    const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read: async () => { throw new Error('no RUN/SOUNDRDR.ZAR'); }, voices: d.voices });
    window.dispatchEvent(new Event('keydown'));
    insert(d.source);
    await flush();
    s.cue.selection();
    expect(a.started).toEqual([]);
    s.dispose();
  });

  it('the toggle off and a hidden tab are silent', async () => {
    const a = audio(), d = disc();
    insert(d.source);
    const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read: d.read, voices: d.voices });
    window.dispatchEvent(new Event('keydown'));
    await flush();
    pageSettings.set(CONSOLE_KEYS.sounds, '0');
    s.cue.play?.('back');
    pageSettings.set(CONSOLE_KEYS.sounds, '1');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    s.cue.play?.('back');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    expect(a.started).toEqual([]);
    s.dispose();
  });

  // The batch review's F1: an unset volume key read as 0, so the default was silent.
  it('the default level: 70% of the page\'s listening gain with nothing set', async () => {
    const a = audio(), d = disc();
    insert(d.source);
    const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read: d.read, voices: d.voices });
    window.dispatchEvent(new Event('keydown'));
    await flush();
    s.cue.play?.('confirm');
    expect(a.gains).toHaveLength(1);
    expect(a.gains[0]).toBeCloseTo(0.7 * LISTENING_GAIN_PLACEHOLDER, 9);
    s.dispose();
  });

  it('the two keys are in the page\'s inventory', () => {
    expect(PAGE_SETTING_KEYS).toContain(CONSOLE_KEYS.sounds);
    expect(PAGE_SETTING_KEYS).toContain(CONSOLE_KEYS.soundVolume);
  });

  // The batch review's F3, and the re-review's N2: a touch's end unlocks, a later suspend is resumed at the next gesture.
  it('a touch unlocks at its end, not its start; a suspended context is resumed at the next gesture', async () => {
    const a = audio('suspended'), d = disc();
    insert(d.source);
    const s = liveUiSounds(window, document, { context: () => a.ctx as unknown as AudioContext, read: d.read, voices: d.voices });
    window.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(a.resumes()).toBe(0);
    window.dispatchEvent(new Event('touchend'));
    await flush();
    expect(a.resumes()).toBe(1);
    a.ctx.state = 'suspended';
    window.dispatchEvent(new Event('click'));
    await flush();
    expect(a.resumes()).toBe(2);
    s.cue.play?.('confirm');
    expect(a.started).toEqual([1]);
    s.dispose();
  });

  it('dispose closes the context: nothing of the launcher runs under the game page', async () => {
    let closed = false;
    const a = audio(), d = disc();
    const ctx = { ...a.ctx, close: async () => { closed = true; } };
    const s = liveUiSounds(window, document, { context: () => ctx as unknown as AudioContext, read: d.read, voices: d.voices });
    window.dispatchEvent(new Event('keydown'));
    await flush();
    s.dispose();
    await flush();
    expect(closed).toBe(true);
  });
});
