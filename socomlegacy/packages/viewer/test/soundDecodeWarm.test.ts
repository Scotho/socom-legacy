import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderedSound, ReverbImpulse } from '@s2u/sound';
import { GameplayAudioSource } from '../../../tools/gameplayAudioSource';
import { GameAudio, soundWarmSet, type AudioOut, type LoopHandle } from '../src/audio';
import { soundFromDisc, type SoundData } from '../src/soundData';
import { resetSoundDecodeRecordForTest, soundDecodeRecord, soundDecodeText } from '../src/soundDecodeRecord';
import { perfLine } from '../src/perfLine';

/**
 * LATER 730 (product track, a browser adaptation; the same sounds at the same times): a bank sound's samples are decoded
 * once each (`@s2u/sound` `SampleCache`), and the map's first flash, grenade burst and rounds are decoded at the map's
 * load (`soundWarmSet`, run from `GameAudio.pump`), so their first play renders from samples already held. A play whose
 * samples were not held yet still sounds in the same call, and is counted (`stats().decode.cold`, the performance
 * line's `sound` part), never dropped.
 */

/** An output that records what it was handed, and when (the plays' order against the test's own marks). */
class Recorder implements AudioOut {
  unlocked = false;
  played: RenderedSound[] = [];
  get state(): string { return this.unlocked ? 'running' : 'locked'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(sound: RenderedSound): void { this.played.push(sound); }
  setReverb(_ir: ReverbImpulse | null): void {}
  rampReverb(): void {}
  loop(): LoopHandle | null { return null; }
}

const seeded = (seed: number) => (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

afterEach(() => resetSoundDecodeRecordForTest());

describe('soundWarmSet: the sounds decoded at the map load (SOUND_DECODE_WARM_ADAPTATION)', () => {
  it("every grenade callback's sounds, every weapon's three reports, the flash's ring; each name once", () => {
    const data = {
      callbacks: [['frag_grenade', ['.GREN_MED']], ['flashcrash_grenade', ['.MARK_141_FLASH']], ['HE_grenade', ['.GREN_MED']],
        ['jump_whoosh', ['.JUMP']], ['grenade_hit_stone', ['.GREN_BOUNCE']]],
      weapons: [{ name: 'M16A2', fireClose: '.M16A2', fireMed: '.M16A2_MED', fireFar: null, reload: '.RELOAD', afterShot: null }],
    } as unknown as SoundData;
    expect(soundWarmSet(data)).toEqual(['.GREN_MED', '.MARK_141_FLASH', '.M16A2', '.M16A2_MED', '.RINGING_EARS']);
  });
});

describe('the performance line names the cold decodes (LATER 730)', () => {
  it('the sound part: cold plays, samples warmed, evicted; "?" without it', () => {
    soundDecodeRecord.cold = 2; soundDecodeRecord.warmed = 51; soundDecodeRecord.evicted = 0;
    expect(soundDecodeText()).toBe('cold 2, warmed 51, evicted 0');
    expect(perfLine({ sound: soundDecodeText() })).toMatch(/ \| sound cold 2, warmed 51, evicted 0$/);
    expect(perfLine({})).toMatch(/ \| sound \?$/);
  });
});

const disc = process.env.SOCOM_DISC;
const haveDisc = !!disc && existsSync(join(disc, 'RUN/SOUNDS/BNKSTORE.ZAR'));
let mp2: SoundData | undefined;
async function data(): Promise<SoundData> {
  mp2 ??= await soundFromDisc(new GameplayAudioSource(disc!), 'RUN/MP2.ZDB', 'MP2');
  return mp2;
}

describe.skipIf(!haveDisc)('the warm set on the dev disc (MP2): the flash, the burst, a round (LATER 730)', () => {
  it('the warm set holds the flash, the frag burst and the M16A2 report', async () => {
    const set = soundWarmSet(await data());
    for (const name of ['.MARK_141_FLASH', '.GREN_MED', '.M16A2']) expect(set).toContain(name);
  });

  it('warmed at the load: their first plays decode nothing; the play sounds in its own call', async () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(3));
    audio.setData(await data());
    while (audio.stats().decode.pending > 0) audio.pump(1000);
    expect(audio.stats().decode.warmed).toBeGreaterThan(0);
    out.unlock(); audio.setListener(IDENTITY);
    for (const name of ['.MARK_141_FLASH', '.GREN_MED', '.M16A2']) {
      const before = out.played.length;
      expect(audio.play(name, [0, 0, -100])).toBe(true);
      expect(out.played.length).toBe(before + 1);              // handed to the output in the play's own call
    }
    expect(audio.stats().decode.cold).toBe(0);
    expect(soundDecodeRecord.cold).toBe(0);
  });

  it('not warmed yet: the play still sounds in its own call, and is counted cold', async () => {
    const out = new Recorder(), audio = new GameAudio(out, seeded(3));
    audio.setData(await data());                                // no pump: the warm-up has not run
    out.unlock();
    expect(audio.play('.MARK_141_FLASH', null)).toBe(true);
    expect(out.played).toHaveLength(1);
    expect(audio.stats().decode.cold).toBe(1);
    expect(soundDecodeRecord.cold).toBe(1);
    expect(audio.play('.MARK_141_FLASH', null)).toBe(true);    // decoded once: the second play is not cold
    expect(audio.stats().decode.cold).toBe(1);
  });

  it('a warmed play renders the same buffer, value for value, as a cold one', async () => {
    const warmOut = new Recorder(), coldOut = new Recorder();
    const warm = new GameAudio(warmOut, seeded(9)), cold = new GameAudio(coldOut, seeded(9));
    warm.setData(await data()); cold.setData(await data());
    while (warm.stats().decode.pending > 0) warm.pump(1000);
    warmOut.unlock(); coldOut.unlock(); warm.setListener(IDENTITY); cold.setListener(IDENTITY);
    for (const name of ['.MARK_141_FLASH', '.GREN_MED', '.M16A2']) { warm.play(name, [30, 0, -60]); cold.play(name, [30, 0, -60]); }
    expect(warmOut.played.map((s) => [Array.from(s.left), Array.from(s.right)])).toEqual(coldOut.played.map((s) => [Array.from(s.left), Array.from(s.right)]));
  });
});
