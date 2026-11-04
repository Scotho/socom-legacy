import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { frontEndSoundTable, groupMasterOf, parseBankFile, soundHash, TUNER_DEFAULTS, vagStreamGroup, type SoundBank } from '@s2u/sound';
import { UiSoundCues } from '@s2u/ui';
import type { AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { GameAudio, type AudioOut } from '../src/audio';
import {
  UI_SOUND_FILE_PATHS, frontEndSoundData, makeUiSoundHost, pageUiSounds, readUiSoundFiles, uiSoundOutput, type UiSoundAudio,
} from '../src/uiSoundHost';

/**
 * The page's side of PLAT-23 (web research 122): the cues' plays reach `GameAudio.play` by the name the bank files at
 * the resolved index, unplaced, at the volume word / 1024; streams and the headset are counted, never played here.
 * The unit half needs no disc; the dev-disc half (W6.R8: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) builds the
 * host from the disc's own files and skips without them.
 */
function audio(): UiSoundAudio & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: (name, position, event, volume) => { calls.push(`${name} ${position === null ? 'unplaced' : 'placed'} ${event} ${volume}`); return true; },
    stopMusic: () => { calls.push('stopMusic'); },
  };
}
const h = (n: string): string => String(soundHash(n));

/** An output that unlocks at once and counts what it was handed (the page's is Web Audio). */
class CountingOut implements AudioOut {
  unlocked = false;
  played = 0;
  get state(): string { return this.unlocked ? 'running' : 'locked'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(): void { this.played++; }
  setReverb(): void {}
  rampReverb(): void {}
  loop(): null { return null; }
}
const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };

describe('the page makes its own UI sound host (pageUiSounds; the front end opened without a map)', () => {
  it('reads RUN/SOUNDRDR.ZAR, HUDUI out of BNKSTORE.ZAR and READERC.ZAR; a source without them gives none and names each', async () => {
    expect(UI_SOUND_FILE_PATHS).toEqual({ soundRdr: 'RUN/SOUNDRDR.ZAR', banks: 'RUN/SOUNDS/BNKSTORE.ZAR', hudui: 'HUDUI.bnk', readerc: 'RUN/UI/READERC.ZAR' });
    const r = await readUiSoundFiles(nothing);
    expect(r.files).toBeNull();
    expect(r.missing).toHaveLength(3);
    expect(await pageUiSounds(nothing, new GameAudio(new CountingOut()), new EventTarget())).toMatchObject({ cues: null });
  });

  it("the page audio's data for the front end alone holds HUDUI and nothing of a map", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const d = frontEndSoundData(bytes);
    expect(d.banks).toEqual([{ file: 'HUDUI.bnk', bytes }]);
    expect([d.params, d.weapons, d.callbacks, d.materials, d.emitters, d.missing]).toEqual([[], [], [], [], [], []]);
    expect(d.reverb.preset).toBeNull();
  });
});

describe('the page\'s UI sound output', () => {
  it('plays a bank one-shot by the bank\'s own name, unplaced, at the word / 1024; streams and the headset are counted', () => {
    const a = audio();
    const out = uiSoundOutput(a);
    const script = ['SETS', ['HUDUI', [[h('.DINK'), 'ONESHOT', []], [h('.BACK'), 'ONESHOT', []]],
      'UIVOICE', [[h('SND_VOT_01'), 'ST', ['N1', ['X']]], [h('SND_HST_01'), 'ST', ['N1', ['Y'], 'HS', []]]]]];
    const hudui = { names: new Map([['.DINK', 0], ['.BACK', 1]]) } as unknown as SoundBank;
    const table = frontEndSoundTable(script, new Map([['HUDUI', hudui]]));
    const cues = new UiSoundCues(table, { teletype: '', back: '.BACK', selection: '.DINK' }, [], out);
    const cmd = (name: string, flags: number, vol?: number): Parameters<UiSoundCues['sound']>[0] => {
      const bytes = new Uint8Array(32), v = new DataView(bytes.buffer);
      v.setUint16(4, flags, true);
      if (vol !== undefined) v.setFloat32(8, vol, true);
      return { anim: 'A', flags, sound: name, nodeIndex: 0, bytes };
    };
    cues.back();
    cues.sound(cmd('.DINK', 0x90, 1.2));
    cues.sound(cmd('SND_VOT_01', 0x280));
    cues.sound(cmd('SND_HST_01', 0x80));
    cues.sound(cmd('SND_DINK', 0x82));
    cues.StopAllSounds();
    cues.FadeAllSounds();
    expect(a.calls).toEqual(['.BACK unplaced play 1', `.DINK unplaced play ${0x4cc / 1024}`, 'stopMusic']);
    expect(out.stats()).toEqual({ played: 2, refused: 0, streams: 1, headset: 1, stopAll: 1, fadeAll: 1, streaming: 0 });
  });

  it('counts a play GameAudio refuses (locked, muted, no bank) and hands a stream to the page\'s streamer when it has one', () => {
    const streamed: string[] = [];
    const out = uiSoundOutput({ play: () => false, stopMusic: () => {} }, { stream: (p) => streamed.push(p.resolution.object.n1 ?? '') });
    const table = frontEndSoundTable(['SETS', ['HUDUI', [[h('.DINK'), 'ONESHOT', []]], 'SMUS', [[h('MUS_MENU_THEME'), 'ST', ['N1', ['MUUI0004'], 'MUS', []]]]]],
      new Map([['HUDUI', { names: new Map([['.DINK', 0]]) }]]));
    const cues = new UiSoundCues(table, { teletype: '', back: '', selection: '.DINK' }, [], out);
    cues.selection();
    cues.play('MUS_MENU_THEME', { volume: 1, pan: -1, pitchMod: 0 }, 'zanim');
    expect(out.stats()).toMatchObject({ played: 0, refused: 1, streams: 1 });
    expect(streamed).toEqual(['MUUI0004']);
  });
});

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/SOUNDRDR.ZAR', 'RUN/SOUNDS/BNKSTORE.ZAR', 'RUN/UI/READERC.ZAR'];
const HAVE = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));

describe.skipIf(!HAVE)('the page\'s UI sound host over the disc\'s files (SOCOM_DISC)', () => {
  it('SELECTION, TELETYPE, BACK, the popup and the keyboard reach GameAudio as HUDUI\'s .METAL, .TYPE, .BACK, .METAL, .SLIDE ...', () => {
    const read = (f: string): Uint8Array => new Uint8Array(readFileSync(join(DISC, f)));
    const banks = Zar.parse(read('RUN/SOUNDS/BNKSTORE.ZAR'));
    const hudui = parseBankFile(banks.data(banks.root.children.find((k) => k.name.toUpperCase() === 'HUDUI.BNK')!));
    const a = audio();
    const { cues, table } = makeUiSoundHost({ soundRdr: read('RUN/SOUNDRDR.ZAR'), hudui, readerc: read('RUN/UI/READERC.ZAR') }, a);
    expect(table.size).toBe(329);
    cues.selection(); cues.teletype(); cues.back(); cues.popup();
    for (let i = 0; i < 6; i++) cues.keyboard(i);
    expect(a.calls.map((c) => c.split(' ')[0])).toEqual(['.METAL', '.TYPE', '.BACK', '.METAL', '.SLIDE', '.SKB_NAV', '.SKB_TYPE', '.THUNK', '.NEG']);
  }, 60_000);

  it("pageUiSounds: HUDUI read into a GameAudio of the front end's own; locked until a gesture, then the popup and BACK sound", async () => {
    const out = new CountingOut();
    const audio = new GameAudio(out);
    const target = new EventTarget();
    const r = await pageUiSounds(new FsAssetSource(DISC), audio, target);
    expect(r.missing).toEqual([]);
    expect(audio.has('.METAL') && audio.has('.BACK')).toBe(true);
    r.cues!.popup();
    expect(out.played).toBe(0);                                   // before the gesture (the autoplay rule)
    target.dispatchEvent(new Event('keydown'));
    r.cues!.popup(); r.cues!.back();
    expect(out.played).toBe(2);
    expect(r.output!.stats()).toMatchObject({ played: 2, refused: 1 });
  }, 60_000);
});

describe('the headset lines on the TV (PF-32; research 233 §2)', () => {
  it("a headset play reaches the stream output through the headset queue, one line at a time, as an ordinary stream of its class's group (2, DIALOG's master: FUN_00342240 D:L241878-241890), never counted as held", () => {
    // Offline (DAT_0045a0c1 0) an HS entry resolves to the headset (uiSounds.ts, D:L242200-242203); the queue's tick
    // plays it through FUN_00342240 as any stream of its class: group 2, the DIALOG_VOLUME master, not HEADSET's 7.
    const streamed: { name: string; vol: number; pan: number; slot: string | null; group: number }[] = [];
    const ends: (() => void)[] = [];
    const out = uiSoundOutput({ play: () => true, stopMusic: () => {} }, {
      stream: (p, ended) => {
        streamed.push({ name: p.resolution.name, vol: p.vol, pan: p.pan, slot: p.slot, group: vagStreamGroup(p.resolution.object) });
        if (ended) ends.push(ended);
      },
    });
    const table = frontEndSoundTable(['SETS', ['UIVOICE', [[h('SND_HST_01'), 'ST', ['N1', ['OPHS0001'], 'HS', []]], [h('SND_HST_02'), 'ST', ['N1', ['OPHS0002'], 'HS', []]]]]], new Map());
    const cues = new UiSoundCues(table, { teletype: '', back: '', selection: '' }, [], out);
    expect(cues.play('SND_HST_01', { volume: 1, pan: -1, pitchMod: 0 }, 'zanim').kind).toBe('played');
    expect(cues.play('SND_HST_02', { volume: 0.5, pan: -1, pitchMod: 0 }, 'zanim').kind).toBe('played');
    expect(streamed).toEqual([{ name: 'SND_HST_01', vol: 0x400, pan: -1, slot: null, group: 2 }]);
    expect(groupMasterOf(2, { ...TUNER_DEFAULTS, dialog: 0.5, headset: 0.25 })).toBe(512);   // DIALOG's, not HEADSET's
    ends[0]!();
    expect(streamed.map((s) => [s.name, s.vol])).toEqual([['SND_HST_01', 0x400], ['SND_HST_02', 0x200]]);
    expect(out.stats()).toMatchObject({ streams: 0, headset: 2 });
  });
});
