// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAN_RESET, rangeGain, SOUND_DEFAULT_RANGE, soundNameHash, toneRelease, type Material, type RenderedSound, type ReverbImpulse, type SoundParams, type WeaponSounds } from '@s2u/sound';
import { GameAudio, type AudioOut, type LoopHandle } from '../src/audio';
import type { SoundData } from '../src/soundData';
import { WalkSounds, type WalkSignals } from '../src/walkSounds';
import type { PlayEvent } from '../src/play';

/**
 * Parity pins for the walk's sound selection and levels through `GameAudio` (TA-SOUND; research 81 §3-§6, research 122
 * R122.4), at the unit tier: no game data. The tables are the sound package's pins (`packages/sound/test/golden/`:
 * materials.json, walk-sounds.json, weapons.json, hudui.json -- re-derived from the disc's files by that package's
 * fixture-tier tests), and the banks are synthetic `.bnk` files written here holding those names (one short tone each),
 * so what is checked is the selection -- which sound an event plays -- and the play's volume and pan, which `GameAudio`
 * computes before the render (`stats().recent`), not the samples (the decode's own pins hold those).
 */

const golden = <T>(name: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(`../../sound/test/golden/${name}`, import.meta.url)), 'utf8')) as T;
interface BankRow {
  index: number; name: string; vol: number; volGroup: number; pan: number; script: Omit<SoundParams, 'hash'> | null; hash: number;
  /** The block's entry at the row's ordinal, which the original binds to this bank sound (R122.2); `spelt` the name it answers to. */
  entry: Omit<SoundParams, 'hash'> & { hash: number; spelt: 'exact' | 'trimmed' | null };
}
const MATERIALS = golden<{ materials: Material[] }>('materials.json').materials;
const WALK = golden<{ banks: Record<string, BankRow[]> }>('walk-sounds.json').banks;
const WEAPONS = golden<{ global: { soundDistanceClose: number; soundDistanceMed: number; soundDistanceFar: number }; weapons: WeaponSounds[] }>('weapons.json');
const HUDUI = golden<{ sounds: { name: string; vol: number; volGroup: number; pan: number }[] }>('hudui.json').sounds;

/**
 * A 989snd bank file (research 81 §2's layout, `bank.ts`): the `FileAttributes` head, an `SBlk` v3 block whose sounds each
 * play one TONE grain of a shared tone (centre note -60: 48 kHz), the names in their hash buckets, and a one-block sample.
 */
function bankFile(block: string, sounds: readonly { name: string; vol?: number; volGroup?: number; pan?: number }[], adsr: readonly [number, number] = [0x000f, 0],
  toneVol = 127): Uint8Array {
  const n = sounds.length;
  const firstSound = 0x40, firstGrain = firstSound + 12 * n, pool = firstGrain + 8 * n, names = pool + 24;
  const buckets: number[][] = Array.from({ length: 32 }, () => []);
  sounds.forEach((s, i) => buckets[soundNameHash(s.name)]!.push(i));
  const entries = buckets.reduce((k, b) => k + (b.length ? b.length + 1 : 0), 0);
  const size = names + 0x58 + 20 * entries;
  const b = new Uint8Array(size), v = new DataView(b.buffer);
  b.set([0x53, 0x42, 0x6c, 0x6b]);                                   // "SBlk"
  v.setUint32(4, 3, true); v.setUint32(8, 0x104, true); b.set([0x54, 0x45, 0x53, 0x54], 0x0c);
  v.setInt16(0x16, n, true); v.setInt16(0x18, n, true); v.setInt16(0x1a, 1, true);
  v.setUint32(0x1c, firstSound, true); v.setUint32(0x20, firstGrain, true); v.setUint32(0x34, pool, true); v.setUint32(0x38, names, true);
  sounds.forEach((s, i) => {
    const o = firstSound + 12 * i;
    v.setInt8(o, s.vol ?? 100); v.setInt8(o + 1, s.volGroup ?? 3); v.setInt16(o + 2, s.pan ?? 0, true); v.setInt8(o + 4, 1); v.setInt32(o + 8, 8 * i, true);
    v.setUint32(firstGrain + 8 * i, 1 << 24, true);                    // TONE at pool offset 0, no delay
  });
  v.setInt8(pool + 1, toneVol); v.setInt8(pool + 2, -60); v.setInt8(pool + 7, 127); v.setUint16(pool + 10, adsr[0], true); v.setUint16(pool + 12, adsr[1], true);
  for (let i = 0; i < Math.min(8, block.length); i++) b[names + i] = block.charCodeAt(i);
  v.setUint32(names + 8, 0x58, true);
  let e = 0;
  for (let k = 0; k < 32; k++) {
    if (!buckets[k]!.length) { v.setInt16(names + 0x18 + 2 * k, -1, true); continue; }
    v.setInt16(names + 0x18 + 2 * k, e, true);
    for (const i of buckets[k]!) {
      const o = names + 0x58 + 20 * e++;
      for (let c = 0; c < Math.min(16, sounds[i]!.name.length); c++) b[o + c] = sounds[i]!.name.charCodeAt(c);
      v.setInt16(o + 16, i, true);
    }
    e++;                                                              // the empty name that ends the bucket
  }
  const vag = new Uint8Array(16); vag[0] = 0x0c; vag[1] = 1; vag.fill(0x11, 2);
  const file = new Uint8Array(24 + size + 16), f = new DataView(file.buffer);
  f.setUint32(0, 3, true); f.setUint32(4, 2, true); f.setUint32(8, 24, true); f.setUint32(12, size, true); f.setUint32(16, 24 + size, true); f.setUint32(20, 16, true);
  file.set(b, 24); file.set(vag, 24 + size);
  return file;
}

class Recorder implements AudioOut {
  unlocked = true;
  played: RenderedSound[] = [];
  get state(): string { return 'running'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void { /* the master */ }
  play(sound: RenderedSound): void { this.played.push(sound); }
  setReverb(_ir: ReverbImpulse | null): void { /* none */ }
  rampReverb(): void { /* none */ }
  loop(): LoopHandle | null { return null; }
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const params = (rows: readonly BankRow[]): [string, SoundParams][] => rows.filter((r) => r.script).map((r) => [r.name, { hash: r.hash, ...r.script! }]);
/** Every sound name a material, a weapon or the hurt voice names that the Frostfire banks lack: a bank of its own. */
const OTHERS = [...new Set([
  ...MATERIALS.flatMap((m) => [m.step, m.stealthStep, m.crawl, m.land, m.fall]),
  ...WEAPONS.weapons.flatMap((w) => [w.fireClose, w.fireMed, w.fireFar, w.reload, w.afterShot]),
  '.SEAL_DAMAGE', '.MARK_141_FLASH',
].filter((n): n is string => !!n && !WALK.MP2_AM!.some((r) => r.name === n) && !WALK.MP2_FX!.some((r) => r.name === n)))];

function setup(defaultMaterial = 7): { audio: GameAudio; out: Recorder; last: () => { name: string; vol: number; pan: number } } {
  const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
  const g = WEAPONS.global;
  const data: SoundData = {
    archive: 'MP2',
    banks: [
      { file: 'MP2_am.bnk', bytes: bankFile('MP2_AM', WALK.MP2_AM!) }, { file: 'MP2_fx.bnk', bytes: bankFile('MP2_FX', WALK.MP2_FX!) },
      { file: 'HUDUI.bnk', bytes: bankFile('HUDUI', HUDUI) }, { file: 'OTHERS.bnk', bytes: bankFile('OTHERS', OTHERS.map((name) => ({ name }))) },
    ],
    materials: MATERIALS, params: [...params(WALK.MP2_AM!), ...params(WALK.MP2_FX!)], weapons: WEAPONS.weapons,
    callbacks: [['jump_whoosh', ['.JUMP_WHOOSH']], ['flashcrash_grenade', ['.MARK_141_FLASH']]],
    callbackVolumes: [['jump_whoosh', [1]], ['flashcrash_grenade', [2]]],
    fireDistances: { close: g.soundDistanceClose * 10, med: g.soundDistanceMed * 10, far: g.soundDistanceFar * 10 },
    defaultMaterial, beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] },
    missing: [],
  };
  audio.setData(data);
  audio.setListener(IDENTITY);
  const last = (): { name: string; vol: number; pan: number } => { const r = audio.stats().recent; const x = r[r.length - 1]!; return { name: x.name, vol: x.vol, pan: x.pan }; };
  return { audio, out, last };
}

describe('the synthetic banks hold the pinned names', () => {
  it('every Frostfire, HUDUI and table name is found by GameAudio, at the pinned bank\'s index order', () => {
    const { audio } = setup();
    for (const r of [...WALK.MP2_AM!, ...WALK.MP2_FX!, ...HUDUI]) expect(audio.has(r.name), r.name).toBe(true);
    expect(audio.stats().banks.map((b) => [b.name, b.sounds])).toEqual([['MP2_AM', 90], ['MP2_FX', 187], ['HUDUI', 24], ['OTHERS', OTHERS.length]]);
  });
});

describe('GameAudio picks the walk\'s sounds from the pinned tables (research 81 §4-§6)', () => {
  it('a footfall plays the material\'s step past half a stick, its stealth step under it, its crawl prone; byte 0 is DefaultMaterial', () => {
    const { audio } = setup(7);
    for (const m of MATERIALS.slice(1)) {
      expect(audio.onFootstep(m.index, null, { stance: 0, stick: 1 }), m.name).toBe(m.step);
      expect(audio.onFootstep(m.index, null, { stance: 1, stick: 0.5 }), m.name).toBe(m.stealthStep);
      expect(audio.onFootstep(m.index, null, { stance: 2, stick: 1 }), m.name).toBe(m.crawl);
    }
    expect(audio.onFootstep(0, null, { stick: 1 })).toBe('.STEP_STONE');          // the map's DefaultMaterial (STONE here)
    expect(setup(0).audio.onFootstep(0, null, { stick: 1 })).toBeNull();          // UNKNOWN: no sound
  });

  // PF-10 (F2, research 205 section 2.2): the landing code plays no voice; a hurting landing's CHRSND_DAMAGE is the
  // damage reaction's (FUN_005a54d0(actor, 3, 7) -> FUN_005477a0 -> FUN_00597b00), only for a body left alive, through
  // the voice gate -- the room's `hurtVoice`, played as `onHurt` -- and a lethal one plays the death voice instead.
  it('a landing plays LANDSOUND soft and light, .BONE_BRK_1 alone heavy, both deadly; the landing itself adds no voice', () => {
    const { audio } = setup();
    audio.setFallTable(235, [62, 91, 120]);                                        // 170.7, 206.8, 237.5 units a second
    for (const m of MATERIALS.slice(1)) {                                           // byte 0 is the DefaultMaterial (above)
      const land = m.land ? [m.land] : [];
      expect(audio.onLand(150, m.index), m.name).toEqual(land);
      expect(audio.onLand(190, m.index), m.name).toEqual(land);
      expect(audio.onLand(220, m.index), m.name).toEqual(['.BONE_BRK_1']);
      expect(audio.onLand(240, m.index), m.name).toEqual([...land, '.BONE_BRK_1']);
    }
  });

  it('the M4A1 is heard close within 90 units, medium to 500, far beyond, each at its RANGE gain; the SD past 90 is silent', () => {
    const { audio, last } = setup();
    const gain = (d: number): number => Math.round(0x400 * rangeGain(d, [85, 1700]));
    expect(audio.onFire('M4A1', [0, 0, -50])).toBe('.M4A1');
    expect(last()).toEqual({ name: '.M4A1', vol: 0x400, pan: 0 });
    expect(audio.onFire('M4A1', [0, 0, -300])).toBe('.M4A1_M');
    expect(last().vol).toBe(gain(300));
    expect(audio.onFire('M4A1', [0, 0, -800])).toBe('.M4A1_F');
    expect(last().vol).toBe(gain(800));
    expect(audio.onFire('M4A1 SD', [0, 0, -50])).toBe('.M4A1_SIL');
    const silent = audio.stats().dropped.silent;
    expect(audio.onFire('M4A1 SD', [0, 0, -100])).toBeNull();
    expect(audio.stats().dropped.silent).toBe(silent + 1);
    expect(audio.onReload('M4A1 SD', null)).toBe('.M4A1_SIL_RLD');
    expect(audio.onReloadAfterShot('870', null)).toBe('.SHOTGUN_COCK');
  });

  it('a placed play: 0x400 x the RANGE gain, panned by azimuth -- ahead 0, right 90, behind 180, left 270; silent past max (FUN_00342670)', () => {
    const { audio, last } = setup();
    const step = (at: [number, number, number]): boolean => audio.play('.STEP_STONE', at);
    expect(step([0, 0, -30])).toBe(true);
    expect(last()).toEqual({ name: '.STEP_STONE', vol: 0x400, pan: 0 });
    step([0, 0, -115]); expect(last()).toMatchObject({ vol: 0x200, pan: 0 });
    step([115, 0, 0]); expect(last()).toMatchObject({ vol: 0x200, pan: 90 });
    step([0, 0, 115]); expect(last()).toMatchObject({ vol: 0x200, pan: 180 });
    step([-115, 0, 0]); expect(last()).toMatchObject({ vol: 0x200, pan: 270 });
    step([50, 0, -50]); expect(last().pan).toBe(45);
    const range = audio.stats().dropped.range;
    expect(step([0, 0, -200.5])).toBe(false);
    expect(audio.stats().dropped.range).toBe(range + 1);
    // .STEALTH_STONE's own 30-130: at 115, 1 - 85 / 100.
    audio.play('.STEALTH_STONE', [0, 0, -115]);
    expect(last().vol).toBe(Math.round(0x400 * 0.15));
  });

  it('an unplaced play is the sound\'s own: volume 0x400, pan -1 (a menu\'s .METAL, R122.4); a zAnim command\'s volume multiplies it', () => {
    const { audio, last } = setup();
    expect(audio.play('.METAL')).toBe(true);
    expect(last()).toEqual({ name: '.METAL', vol: 0x400, pan: PAN_RESET });
    expect(audio.onJump(null)).toBe('.JUMP_WHOOSH');
    expect(last()).toEqual({ name: '.JUMP_WHOOSH', vol: 0x400, pan: PAN_RESET });
    expect(audio.onAnimCallback('flashcrash_grenade', null)).toBe('.MARK_141_FLASH');
    expect(last().vol).toBe(0x800);                                                 // flag 0x10's 2.0
  });

  it('a name the banks do not hold plays nothing and is counted, as the lookup finds no object (FUN_00344f30)', () => {
    const { audio } = setup();
    expect(audio.play('SND_DINK')).toBe(false);                                     // the sigil is part of the name: .DINK is another
    expect(audio.play('.dink')).toBe(false);                                        // and the case
    expect(audio.stats().unknownNames).toMatchObject({ SND_DINK: 1, '.dink': 1 });
  });

  // DRIFT (TA.R6): research 122 R122.10 (line 29) and §8 (line 226): the name is hashed as spelt, whitespace included, so
  // the keyboard's `ScaleDownSound` ".SLIDE\t" (UiParams.rdr, a trailing tab) finds no entry and is silent while its
  // scale-up plays .SLIDE. GameAudio's lookup falls back to the name trimmed (audio.ts `find`, kept for MP2_am's
  // `.THROW_OBJECT `), so ".SLIDE\t" plays .SLIDE here.
  it.fails('".SLIDE\\t" -- the keyboard\'s scale-down, a trailing tab -- is silent (drift: the lookup trims the name)', () => {
    const { audio } = setup();
    expect(audio.play('.SLIDE\t')).toBe(false);
  });

  // Research 122 R122.2 (line 21) and §10 (line 268-269), research 186 §3.2 DEFAULT_RANGE (V4 #25): a `sounds.rdr` entry
  // without `RANGE` gets the object's default 160-430 (`FUN_00345620`, D:L243424-243425: +0xc = 0xa0, +0xe = 0x1ae;
  // `SOUND_DEFAULT_RANGE`), so such a sound placed at 300 units plays at 0x400 x (1 - 140 / 270). MP2_AM has five such
  // entries (~STEAM_BURST_ON among them). Was a drift while the port gave them 30-200 (the retired placeholder).
  it('a listed sound with no RANGE falls off over the object default 160-430 (FUN_00345620)', () => {
    const { audio, last } = setup();
    const name = WALK.MP2_AM!.find((r) => r.script && !r.script.range && r.name.startsWith('~STEAM'))!.name;
    expect(audio.play(name, [0, 0, -300])).toBe(true);
    expect(last().vol).toBe(Math.round(0x400 * (1 - 140 / 270)));
  });
  it('a listed sound with no RANGE is at full volume inside the default near 160 (SOUND_DEFAULT_RANGE)', () => {
    const { audio, last } = setup();
    expect(SOUND_DEFAULT_RANGE).toEqual([160, 430]);
    const name = WALK.MP2_AM!.find((r) => r.script && !r.script.range && r.name.startsWith('~STEAM'))!.name;
    audio.play(name, [0, 0, -159]);
    expect(last().vol).toBe(0x400);
  });

  // DRIFT (TA.R6): research 122 R122.1 (line 20) and §10 (line 268-269): the game finds a sound only through `sounds.rdr`'s
  // entries, by the CRC-32 of the name as it stands (`FUN_00344f30` -> `FUN_00344bf0`, the sorted vector at 0x48dc08); a
  // name no entry carries "has no object on the console and is silent". The port looks names up in the banks' own name
  // tables (and trimmed), so it plays all 22 bank spellings no entry carries -- MP2_AM's ~OUTDR_WND_GST1, `~OCEAN_SWELL_1 `
  // and the eight its script spells without their trailing blank (`.THROW_OBJECT ` ...), MP2_FX's twelve distant
  // variants (~AK47_1 ...) -- at the default range (`SOUND_DEFAULT_RANGE`). The setup line is checked first, outside the drift.
  it('the 22 bank spellings no sounds.rdr entry carries: the drift below plays them all through the bank', () => {
    const unlisted = [...WALK.MP2_AM!, ...WALK.MP2_FX!].filter((r) => !r.script);
    expect(unlisted.length).toBe(22);
    expect(unlisted.map((r) => r.name)).toContain('~OCEAN_SWELL_1 ');
    expect(unlisted.map((r) => r.name)).toContain('.THROW_OBJECT ');
    const { audio } = setup();
    for (const r of unlisted) expect(audio.play(r.name), r.name).toBe(true);
  });
  it.fails('a bank sound sounds.rdr does not list is silent (drift: the port resolves names in the bank, not the script)', () => {
    const { audio } = setup();
    const unlisted = [...WALK.MP2_AM!, ...WALK.MP2_FX!].filter((r) => !r.script);
    for (const r of unlisted) expect(audio.play(r.name), r.name).toBe(false);
  });

  // DRIFT (TA.R6): research 81 §7 (lines 261-268): the casings' `shell_eject` zAnims name `.BUL_CASE_METAL` (every bank
  // spells it `.BUL_CAS_METAL`) and `grenade_hit_asphalt` names `.GREN_ASPHALT` (no bank holds it); the console resolves
  // a name only through its loaded table (`FUN_00344f30`, D:L243197-243210), so both are silent there. The note names
  // the port's `SOUND_NAME_FIXES` a departure from the retail game; no owner ruling for it is cited, so it is a drift.
  it.fails("the data's slips .BUL_CASE_METAL and .GREN_ASPHALT play nothing (drift: SOUND_NAME_FIXES mends them)", () => {
    const { audio } = setup();
    expect(audio.has('.BUL_CAS_METAL') && audio.has('.GREN_STONE')).toBe(true);
    expect(audio.play('.BUL_CASE_METAL')).toBe(false);
    expect(audio.play('.GREN_ASPHALT')).toBe(false);
  });
  it('the port finds and plays .BUL_CASE_METAL and .GREN_ASPHALT today, through its fixes (the drift above)', () => {
    const { audio } = setup();
    expect([audio.has('.BUL_CASE_METAL'), audio.has('.GREN_ASPHALT')]).toEqual([true, true]);
    expect(audio.play('.BUL_CASE_METAL')).toBe(true);
    expect(audio.play('.GREN_ASPHALT')).toBe(true);
  });

  // DRIFT (TA.R6): research 122 R122.2 (line 21): the object of `SETS/<block>` entry n plays bank sound n (+0x12, the
  // ordinal) and carries that entry's RANGE. MP2_AM's script spells eight names without the trailing blank the bank has
  // (`.THROW_OBJECT` entry 1, RANGE 40-160; `~LOW_RUMBLE` 43 ... `~FAN_ROTATE` 64): on the console those play bank sounds
  // 1, 43 ... 64 over their RANGE. The port files the script by the hash of the bank's own name (soundData.ts,
  // `soundParams(sets, [bank.name], name)`), finds nothing for the spaced name and gives the default range (`SOUND_DEFAULT_RANGE`, 160-430).
  it.fails("a name the script spells without the bank's trailing blank plays over its entry's RANGE (drift: the default range)", () => {
    const { audio, last } = setup();
    const r = WALK.MP2_AM!.find((x) => x.name === '.THROW_OBJECT ')!;
    expect(r.entry).toMatchObject({ spelt: 'trimmed', range: [40, 160] });
    expect(audio.play('.THROW_OBJECT', [0, 0, -100])).toBe(true);
    expect(last().vol).toBe(Math.round(0x400 * (1 - 60 / 120)));
  });
  it('.THROW_OBJECT is played over the default range 160-430 today (the drift above, as the port has it)', () => {
    const { audio, last } = setup();
    expect(audio.play('.THROW_OBJECT', [0, 0, -300])).toBe(true);
    expect(last().vol).toBe(Math.round(0x400 * (1 - 140 / 270)));
  });
});

describe('WalkSounds: the footfalls the walk sends (research 81 §4, FUN_005a3570)', () => {
  function walker(stance: 'stand' | 'crouch' | 'prone', wish = { forward: 0.3, right: -0.8 }) {
    const calls: unknown[][] = [];
    const audio = { onFootstep: (...a: unknown[]) => { calls.push(['step', ...a]); return null; }, onLand: (...a: unknown[]) => { calls.push(['land', ...a]); return []; } } as unknown as GameAudio;
    const signals: WalkSignals = { walking: () => true, feet: () => [1, 2, 3], stance: () => stance, wish: () => wish, grid: () => null };
    return { w: new WalkSounds(audio, signals), calls };
  }
  const fall = (foot: 'left' | 'right'): PlayEvent => ({ kind: 'footfall', foot } as unknown as PlayEvent);

  it('prone, the left foot\'s call is skipped: one crawl a cycle, on the right foot', () => {
    const { w, calls } = walker('prone');
    w.playEvent(fall('left'));
    w.playEvent(fall('right'));
    expect(calls).toEqual([['step', 0, [1, 2, 3], { stance: 2, stick: 0.8 }]]);
  });
  it('standing and crouched both feet sound, the stick its larger axis (the step past half, FUN_005a39b0)', () => {
    for (const [stance, code] of [['stand', 0], ['crouch', 1]] as const) {
      const { w, calls } = walker(stance);
      w.playEvent(fall('left'));
      w.playEvent(fall('right'));
      expect(calls.map((c) => c[3])).toEqual([{ stance: code, stick: 0.8 }, { stance: code, stick: 0.8 }]);
    }
  });
});

describe('the beds cross as the camera goes in and out (check_camera_inside_state1: stop one zAnim, start the other)', () => {
  // Research 186 §3.2 BED_FADE and research 205 §2.1 (a reading, pending review): every MP bed command carries fade offset 0 and a new slot
  // record's +4 is -0.1, so the stop is StopSound -- a key-off, heard as the tone's ADSR release -- not a 0.5 s fade.
  class Loops extends Recorder {
    handles: { gains: [number, number, number?][]; releases: { curve: Float32Array; seconds: number }[] }[] = [];
    override loop(): LoopHandle {
      const h = { gains: [] as [number, number, number?][], releases: [] as { curve: Float32Array; seconds: number }[] };
      this.handles.push(h);
      return { setGains: (l, r, s) => { h.gains.push([l, r, s]); }, release: (curve, seconds) => { h.releases.push({ curve, seconds }); }, stop: () => undefined };
    }
  }
  const ADSR: [number, number] = [0x00ff, 0x1f0a];             // held at 32760, a linear release of 2048 samples

  it("a bed going down is keyed off at its tone's release; the other comes up at once", () => {
    const out = new Loops(), audio = new GameAudio(out, () => 0.5);
    audio.setData({
      archive: 'MP2', banks: [{ file: 'BEDS.bnk', bytes: bankFile('BEDS', [{ name: '~OUTDOOR_AMB' }, { name: '~INDOOR_AMB' }], ADSR) }],
      materials: MATERIALS, params: [], weapons: [], callbacks: [], defaultMaterial: 0,
      beds: { outside: ['~OUTDOOR_AMB'], inside: ['~INDOOR_AMB'] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] },
      missing: [],
    });
    audio.setListener(IDENTITY);
    audio.setEnvironment(false, 0);
    audio.setAmbience(true);
    audio.pump(1e9);
    const [outside, inside] = out.handles;
    expect(out.handles.length).toBe(2);
    expect(outside!.gains.at(-1)).toEqual([1, 1, 0]);                           // up at once: a new play
    expect(inside!.gains.at(-1)!.slice(0, 2)).toEqual([0, 0]);
    audio.setEnvironment(true, 0);
    const want = toneRelease(...ADSR);
    expect(outside!.releases).toEqual([want]);                                  // keyed off: the release, not a fade
    expect(outside!.releases[0]!.seconds).toBeCloseTo(2048 / 48_000, 6);
    expect(inside!.gains.at(-1)).toEqual([1, 1, 0]);
    audio.setEnvironment(false, 0);
    expect(inside!.releases).toEqual([want]);
    expect(outside!.gains.at(-1)).toEqual([1, 1, 0]);
  });
});

describe("global register 2, every frame from the listener's height (FUN_00341a60)", () => {
  // Research 186 §3.2 BED_CAMERA (STRONG): the sound tick reads the listener's world y (DAT_0048db48 +0x34) each frame,
  // maps it through the mission's elevation and sends it as global register 2 (`globalRegister2`, floored). A tone
  // whose volume is the sentinel -7 plays at global 2's value (`render.ts` resolveVol), so a play shows the register.
  const at = (y: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, y, 0, 1];

  it("each play renders with register 2 from the listener's live height through the mission's elevation", () => {
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
    audio.setData({
      archive: 'MP2', banks: [{ file: 'REG.bnk', bytes: bankFile('REG', [{ name: '.HIGH' }], [0x000f, 0], -7) }],
      materials: MATERIALS, params: [], weapons: [], callbacks: [], defaultMaterial: 0, elevation: [200, 100],
      beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
    });
    expect(audio.stats().register2).toBeNull();                                    // no listener yet
    audio.setListener(at(250));
    expect(audio.stats().register2).toBe(127);                                     // above the band
    expect(audio.play('.HIGH')).toBe(true);
    expect(out.played.at(-1)!.peak).toBeGreaterThan(0);
    audio.setListener(at(130));
    expect(audio.stats().register2).toBe(-52);                                     // f 0.3: floor(76.5) - 128
    audio.play('.HIGH');
    expect(out.played.at(-1)!.peak).toBe(0);                                       // the tone's volume max(0, -52)
  });

  it('a map without an elevation sends nothing: register 2 stays 0 (the render reads 0)', () => {
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
    audio.setData({
      archive: 'MP2', banks: [{ file: 'REG.bnk', bytes: bankFile('REG', [{ name: '.HIGH' }], [0x000f, 0], -7) }],
      materials: MATERIALS, params: [], weapons: [], callbacks: [], defaultMaterial: 0,
      beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
    });
    audio.setListener(at(250));
    expect(audio.stats().register2).toBeNull();
  });
});

/**
 * PF-10: the death voice (`FUN_005979a0` D:L454473-454480 -> the controller's `+0x24`, `FUN_005978a0` ->
 * `FUN_0053b710`): the victim character's `CHRSND_DEATH` or `CHRSND_DEATH_QUIET` by the cause, at the actor's `+0x1c`
 * through the positional play at volume 1.0 (D:L405290-405292) -- the same play every placed bank sound takes, its
 * group's level (the voices' group 2, `DIALOG_VOLUME` 1.0 at its default, research 186 §3.1). A slot the character does
 * not name plays nothing (`FUN_0053b710`'s null handle, D:L405264-405266).
 */
describe('the death voice: the victim\'s character, its slot by the cause, at the body (FUN_005979a0)', () => {
  function setup(): { audio: GameAudio; out: Recorder } {
    const out = new Recorder(), audio = new GameAudio(out, () => 0.5);
    audio.setData({
      archive: 'MP2', banks: [{ file: 'MP2_vc.bnk', bytes: bankFile('MP2_VC', [{ name: '.SEAL_DEATH', volGroup: 2 }, { name: '.ENEMY_DEATH', volGroup: 2 }, { name: '.KNIFE_KILL', volGroup: 2 }, { name: '.ENEMY_DAMAGE', volGroup: 2 }]) }],
      materials: MATERIALS, params: [], weapons: [], callbacks: [], defaultMaterial: 0,
      beds: { outside: [], inside: [] }, emitters: [], reverb: { preset: null, indoor: [], outdoor: [] }, missing: [],
      characterVoices: {
        seal: [{ damage: null, death: '.SEAL_DEATH', quiet: null }, { damage: null, death: '.SEAL_DEATH', quiet: '.KNIFE_KILL' }, { damage: null, death: null, quiet: null }, { damage: null, death: '.SEAL_DEATH', quiet: null }],
        terrorist: Array.from({ length: 4 }, () => ({ damage: '.ENEMY_DAMAGE', death: '.ENEMY_DEATH', quiet: null })),
      },
    });
    audio.setListener(IDENTITY);
    return { audio, out };
  }

  it('plays the side and type\'s CHRSND_DEATH for a body round, a blast and a fall, placed as any bank sound at the body', () => {
    const { audio, out } = setup();
    const at: [number, number, number] = [150, 0, -200];          // 250 away: inside the default range's fall (160-430)
    expect(audio.onDeath(5, 'seal', 0, at)).toBe('.SEAL_DEATH');
    const death = audio.stats().recent.at(-1)!;
    expect(audio.play('.SEAL_DEATH', at)).toBe(true);             // the same placed play: the same volume and pan
    const plain = audio.stats().recent.at(-1)!;
    expect([death.vol, death.pan]).toEqual([plain.vol, plain.pan]);
    expect(death.vol).toBeLessThan(0x400);                       // placed: the distance's gain is on it
    expect(audio.onDeath(4, 'terrorist', 2, at)).toBe('.ENEMY_DEATH');
    expect(audio.onDeath(7, 'terrorist', 3, at)).toBe('.ENEMY_DEATH');
    expect(out.played).toHaveLength(4);
  });

  it('a head shot plays CHRSND_DEATH_QUIET where the character names one, else nothing; cause 6 nothing', () => {
    const { audio, out } = setup();
    expect(audio.onDeath(3, 'seal', 1, [0, 0, -10])).toBe('.KNIFE_KILL');
    expect(audio.onDeath(3, 'seal', 0, [0, 0, -10])).toBeNull();     // the multiplayer characters: no quiet slot
    expect(audio.onDeath(6, 'seal', 0, [0, 0, -10])).toBeNull();
    expect(audio.onDeath(5, 'seal', 2, [0, 0, -10])).toBeNull();     // a character with no death voice
    expect(audio.onDeath(5, 'seal', 9, [0, 0, -10])).toBeNull();     // a type the map does not list
    expect(out.played).toHaveLength(1);
  });

  it('the hurt voice: the side and type\'s CHRSND_DAMAGE at the body, placed as the death\'s is (FUN_00597b00, 0x3b at 1.0)', () => {
    const { audio, out } = setup();
    const at: [number, number, number] = [150, 0, -200];
    expect(audio.onHurt('terrorist', 1, at)).toBe('.ENEMY_DAMAGE');
    const hurt = audio.stats().recent.at(-1)!;
    audio.play('.ENEMY_DAMAGE', at);
    const plain = audio.stats().recent.at(-1)!;
    expect([hurt.vol, hurt.pan]).toEqual([plain.vol, plain.pan]);
    expect(audio.onHurt('seal', 0, at)).toBeNull();                 // a character with no CHRSND_DAMAGE
    expect(audio.onHurt('terrorist', 1, null)).toBeNull();
    expect(out.played).toHaveLength(2);
  });

  it('no body to place it at: not played (the game\'s play is always at the actor)', () => {
    const { audio, out } = setup();
    expect(audio.onDeath(5, 'seal', 0, null)).toBeNull();
    expect(out.played).toHaveLength(0);
  });
});
