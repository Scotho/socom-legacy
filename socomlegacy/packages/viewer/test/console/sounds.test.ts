import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { LISTENING_GAIN_PLACEHOLDER } from '../../src/audio';
import {
  cueFor, discVoices, UI_CUE_SOURCE, UI_SOUND_MIN_GAP_MS, uiSounds, type CueSnap, type UiCue, type UiSoundDeps, type UiVoice,
} from '../../src/console/sounds';
import { readUiSoundFiles } from '../../src/uiSoundHost';

/**
 * CX-51 (CX.R19, the owner, 2026-10-20; his second word the same day: "the sound effect pack doesn't match. please
 * select something else more subtle and or socom-like", the choice the merge controller's): the launcher's UI sounds
 * are the original's own menu sounds, HUDUI's, read from the player's disc through the repository's readers, and the
 * launcher is silent until a disc is there (LAUNCHER_UI_SOUNDS_FROM_DISC_ADAPTATION). A press's before and after say
 * which launcher cue it plays; each cue is the original's code cue its act matches (research 122 section 6, R122.7):
 * a move, a step and a confirm SELECTION, a dialog opening PopUpDialog's .METAL, Back and a dialog closing BACK, an
 * error nothing (the code plays none of its own, R122.10). The player is Web Audio, unlocked at a gesture, and
 * silent with the toggle off or the tab hidden.
 */
const snap = (over: Partial<CueSnap> = {}): CueSnap => ({ overlay: null, screen: 'home', start: 'idle', error: '', ...over });

describe('CX-51: the cue a press plays (cueFor)', () => {
  it('a dialog opening, closing by Circle, and accepted by Cross', () => {
    expect(cueFor(snap(), snap({ overlay: 'signin' }), 'cross')).toBe('open');
    expect(cueFor(snap({ overlay: 'signin' }), snap(), 'circle')).toBe('close');
    expect(cueFor(snap({ overlay: 'confirm' }), snap(), 'cross')).toBe('confirm');
    // Decline's question answered No goes back to the agreement (`grammar.ts`, the confirm's "No"): the question
    // closes, by Cross on No or by Circle alike (the batch review's F5; the re-review's R1)
    expect(cueFor(snap({ overlay: 'confirm' }), snap({ overlay: 'agreement' }), 'cross')).toBe('close');
    expect(cueFor(snap({ overlay: 'confirm' }), snap({ overlay: 'agreement' }), 'circle')).toBe('close');
  });

  // The re-review's N1: Circle that opens a question is an opening, whatever the button -- the loadout's "leave?" from
  // no dialog, and Decline's question over the agreement (Cross on DECLINE opens the same question: one sound).
  it('Circle opening a question plays open, not close', () => {
    expect(cueFor(snap({ screen: 'loadout' }), snap({ screen: 'loadout', overlay: 'confirm' }), 'circle')).toBe('open');
    expect(cueFor(snap({ overlay: 'agreement' }), snap({ overlay: 'confirm' }), 'circle')).toBe('open');
    expect(cueFor(snap({ overlay: 'agreement' }), snap({ overlay: 'confirm' }), 'cross')).toBe('open');
  });

  // The re-review's N3: the states panel is a toggle; tapping its toggle again closes it.
  it('the states panel shut by its own toggle plays close', () => {
    expect(cueFor(snap({ overlay: 'states' }), snap(), 'cross')).toBe('close');
  });

  it('a page pushed by Cross is confirm, a page left by Circle is back', () => {
    expect(cueFor(snap(), snap({ screen: 'rooms' }), 'cross')).toBe('confirm');
    expect(cueFor(snap({ screen: 'rooms' }), snap(), 'circle')).toBe('back');
  });

  it('START arming is confirm; a refusal on the legend line is the error, whatever else changed', () => {
    expect(cueFor(snap(), snap({ start: 'arming' }), 'options')).toBe('confirm');
    expect(cueFor(snap(), snap({ error: 'Choose your disc image first: Home, then Disc.' }), 'options')).toBe('error');
    expect(cueFor(snap({ error: 'x' }), snap({ error: 'x' }), 'options')).toBeNull();   // the same line: said already
  });

  it('nothing changed: no cue', () => {
    expect(cueFor(snap(), snap(), 'cross')).toBeNull();
  });

  it('each launcher cue is the original\'s code cue for its act; no tab sound (CX.R12), no slide (research 122: none in the code)', () => {
    expect(UI_CUE_SOURCE).toEqual({
      move: 'selection', toggle: 'selection', confirm: 'selection', open: 'popup', back: 'back', close: 'back', error: null,
    });
  });
});

/** A Web Audio stand-in: each buffer started, its first sample, its gain. */
function fakeAudio() {
  const started: { first: number; length: number; gain: number }[] = [];
  const ctx = {
    state: 'suspended' as 'suspended' | 'running',
    destination: {},
    resume: async () => { ctx.state = 'running'; },
    close: async () => {},
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (i: number) => data[i]! };
    },
    createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
    createBufferSource: () => {
      const node = {
        buffer: null as { getChannelData(i: number): Float32Array; length: number } | null, out: null as { gain: { value: number } } | null,
        connect: (g: { gain: { value: number } }) => { node.out = g; },
        start: () => { started.push({ first: node.buffer!.getChannelData(0)[0]!, length: node.buffer!.length, gain: node.out?.gain.value ?? -1 }); },
      };
      return node;
    },
  };
  return { ctx, started };
}

/** A voice whose first sample names it. */
const voiceOf = (n: number): UiVoice => ({ left: new Float32Array([n, 0, 0]), right: new Float32Array([n, 0, 0]), sampleRate: 48_000 });

function player(over: Partial<UiSoundDeps> = {}) {
  const a = fakeAudio();
  let t = 1000;
  const deps: UiSoundDeps = {
    context: () => a.ctx as unknown as AudioContext,
    voice: (cue: UiCue) => (cue === 'error' ? null : voiceOf(cue === 'back' ? 2 : 1)),
    enabled: () => true, volume: () => 0.5, hidden: () => false, now: () => t,
    ...over,
  };
  const s = uiSounds(deps);
  return { s, a, tick: (ms: number) => { t += ms; } };
}

describe('CX-51: the player (uiSounds)', () => {
  it('plays nothing before the first gesture, then the cue\'s voice', async () => {
    const { s, a } = player();
    expect(s.play('move')).toBe(false);
    await s.unlock();
    expect(s.play('back')).toBe(true);
    expect(a.started.map((x) => x.first)).toEqual([2]);
  });

  it('no disc yet (no voice): silent, and an error is silent always', async () => {
    let disc = false;
    const { s, a } = player({ voice: (cue) => (disc && cue !== 'error' ? voiceOf(1) : null) });
    await s.unlock();
    expect(s.play('move')).toBe(false);
    disc = true;
    expect(s.play('error')).toBe(false);
    expect(s.play('move')).toBe(true);
    expect(a.started).toHaveLength(1);
  });

  it('silent with the toggle off or the tab hidden', async () => {
    let on = true, hidden = false;
    const { s, a, tick } = player({ enabled: () => on, hidden: () => hidden });
    await s.unlock();
    on = false;
    expect(s.play('back')).toBe(false);
    on = true; hidden = true; tick(200);
    expect(s.play('back')).toBe(false);
    expect(a.started).toEqual([]);
  });

  it('the level is the front end\'s: the launcher\'s volume over the page\'s listening gain; a cue not repeated faster than the pad', async () => {
    const { s, a, tick } = player({ volume: () => 0.3 });
    await s.unlock();
    expect(s.play('move')).toBe(true);
    tick(UI_SOUND_MIN_GAP_MS - 1);
    expect(s.play('move')).toBe(false);
    tick(1);
    expect(s.play('move')).toBe(true);
    expect(a.started.every((x) => Math.abs(x.gain - 0.3 * LISTENING_GAIN_PLACEHOLDER) < 1e-9)).toBe(true);
  });

  it('no Web Audio in this browser: nothing plays and nothing throws', async () => {
    const { s } = player({ context: () => null });
    await s.unlock();
    expect(s.play('confirm')).toBe(false);
  });
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE = DISC !== '' && ['RUN/SOUNDRDR.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR', 'RUN/UI/READERC.ZAR'].every((f) => existsSync(join(DISC, f)));

describe.skipIf(!HAVE)('CX-51 over the disc\'s files (SOCOM_DISC): HUDUI\'s own sounds', () => {
  it('a move, a step and a confirm are SELECTION\'s .METAL, a dialog opening the popup\'s .METAL, Back and a close .BACK; an error none', async () => {
    const { files, missing } = await readUiSoundFiles(new FsAssetSource(DISC));
    expect(missing).toEqual([]);
    const names: string[] = [];
    const voice = discVoices(files!, (name) => { names.push(name); });
    const heard = (cue: UiCue): number => { const v = voice(cue); return v ? v.left.reduce((m, x) => Math.max(m, Math.abs(x)), 0) : 0; };
    for (const cue of ['move', 'toggle', 'confirm', 'open', 'back', 'close'] as const) expect(heard(cue), cue).toBeGreaterThan(0);
    expect(voice('error')).toBeNull();
    expect(names).toEqual(['.METAL', '.METAL', '.METAL', '.METAL', '.BACK', '.BACK']);
    expect(voice('move')!.sampleRate).toBe(48_000);
  }, 60_000);
});
