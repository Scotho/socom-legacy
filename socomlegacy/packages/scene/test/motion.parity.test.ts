// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseZdb, Reader, Zar, zdbMember } from '@s2u/archive';
import {
  MOTION_ROTATION_SCALE, MOTION_TRANSLATION_SCALE, parseMotionClip, parseMotionZar, partMatrix, sampleClip, type MotionClip,
} from '../src/index';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  flagsOf, layOutClip, readPin, skeletonFromPin, type ClipTrack, type MotionPin, type SkeletonPin,
} from './characterPins';

/**
 * Parity pins for the skeletal motion format (socomlegacy/docs/research/77 §2-§8, §12; registry
 * docs/parity/registry/character.json). The unit half lays clips out byte for byte from `golden/character-motion.json`
 * -- the real clips' names, flags, frame counts and constant keys -- and drives `parseMotionClip`, `sampleClip` and
 * `partMatrix` with them; the fixture half re-reads the pin from MP2's `MOTION_S.ZAR` and the player's `MOTION_P.ZAR`.
 */
const pin = readPin<MotionPin>('character-motion.json');
const skeletonPin = readPin<SkeletonPin>('character-skeleton.json');

/** A pinned clip's tracks: its names and flags, constant channels as pinned (else zero), animated ones zero. */
const tracksOf = (names: string[], flags: string, constants: MotionPin['backflipConstants'] = {}): ClipTrack[] =>
  names.map((name, i) => ({ name, flags: flagsOf(flags)[i]!, t: constants[name]?.t ?? [], r: constants[name]?.r ?? [] }));
const backflipBytes = (): Uint8Array => {
  const v = pin.victory[0]!;
  return layOutClip(v.frames, v.duration, tracksOf(pin.victoryPartNames, v.flags, pin.backflipConstants));
};
const words = (bytes: Uint8Array, n: number): string[] => Array.from({ length: n }, (_, i) => new Reader(bytes).u32(4 * i).toString(16).padStart(8, '0'));

/** 77 §12, transcribed from the note: the cycles a mover needs, with their frame counts. */
const CYCLES: Record<string, number> = {
  seal_stand: 16, seal_walk: 25, seal_jog: 22, seal_run: 19, seal_walk_bw: 16, seal_run_bw: 18, seal_lstrafe: 22,
  seal_rstrafe: 23, seal_crouch: 21, seal_crouchwalk: 28, seal_prone: 10, seal_prone_crawl: 26, seal_jump: 20,
  seal_runningjump_launch: 25, seal_runningjump_in_air: 14, seal_land_soft: 20, seal_land_hard: 20, seal_recoil: 2,
  seal_reload: 45, seal_fp_stand: 8, seal_fp_walk: 25, seal_fp_run: 18,
};

describe('the motion format, pinned (research 77; no game data)', () => {
  it("lays victory_backflip out to 77 §2's stored head and its 36,224 bytes, and reads it to the last byte", () => {
    // 77 §2: "00000005 40a55555 0000009b 0000001a bf800000 3f800000 000001c0 000002b0"
    expect(pin.backflipHeadWords).toEqual(['00000005', '40a55555', '0000009b', '0000001a', 'bf800000', '3f800000', '000001c0', '000002b0']);
    const bytes = backflipBytes();
    expect(words(bytes, 8)).toEqual(pin.backflipHeadWords);
    expect(bytes.length).toBe(36224);
    const clip = parseMotionClip(bytes, 'victory_backflip');
    expect([clip.version, clip.frameCount, clip.parts.length, clip.unknown10, clip.unknown14]).toEqual([5, 155, 26, -1, 1]);
    expect(clip.duration).toBeCloseTo(5.1667, 4);
    expect(clip.parts.map((p) => p.name)).toEqual(pin.victoryPartNames);
  });

  it('reads all seven victory clips laid out from their pinned names, flags and frames to their key sizes (77 §8)', () => {
    for (const v of pin.victory) {
      const bytes = layOutClip(v.frames, v.duration, tracksOf(pin.victoryPartNames, v.flags));
      expect(bytes.length, v.name).toBe(v.keySize);
      const clip = parseMotionClip(bytes, v.name);
      expect([clip.frameCount, clip.parts.map((p) => p.flags)], v.name).toEqual([v.frames, flagsOf(v.flags)]);
    }
    // victory_chicken's n + 1 = 191 keys leave an animated translation two bytes short of 4: the pad (77 §5)
    expect(pin.victory.find((v) => v.name === 'victory_chicken')!.frames + 1).toBe(191);
  });

  it("reads all 334 of the player pack's clips laid out from their pinned part sets, flags and frames to their key sizes", () => {
    expect(pin.pack).toHaveLength(334);
    for (const [name, keySize, frames, set, flags] of pin.pack) {
      const bytes = layOutClip(frames, frames / 30, tracksOf(pin.packPartSets[set]!.split(' '), flags));
      expect(bytes.length, name).toBe(keySize);
      const clip = parseMotionClip(bytes, name);
      expect(clip.parts.length, name).toBe(flags.length);
    }
  });

  it("names the skeleton's 25 parts under its model plus the weapon in every victory clip, in an order not the skeleton's (77 §4)", () => {
    const skeletonParts = skeletonPin.parts.map((p) => p.name).filter((n) => n !== 'body');
    expect([...pin.victoryPartNames].sort()).toEqual([...skeletonParts, 'weapon'].sort());
    expect(pin.victoryPartNames.filter((n) => n !== 'weapon')).not.toEqual(skeletonParts);     // track order is the clip's
    // the clip carries no parent links: parsed, a part is its name, its flags and its channels only
    const clip = parseMotionClip(backflipBytes(), 'victory_backflip');
    expect(Object.keys(clip.parts[0]!).sort()).toEqual(['flags', 'index', 'name', 'rotations', 'translations']);
  });

  it('carries the four flag words only, and 77 §5\'s one pattern on the victory clips, spinehi 0x2c on three and 0x3c on four', () => {
    const all = new Set([...pin.victory.map((v) => v.flags), ...pin.pack.map((r) => r[4])].flatMap((s) => flagsOf(s)));
    expect([...all].sort((a, b) => a - b)).toEqual([0x0c, 0x1c, 0x2c, 0x3c]);
    const flagOf = (flags: string, part: string): number => flagsOf(flags)[pin.victoryPartNames.indexOf(part)]!;
    for (const v of pin.victory) {
      expect(flagOf(v.flags, 'skel_root'), v.name).toBe(0x1c);
      for (const p of ['hips', 'lshoulder_wgt', 'rshoulder_wgt', 'rbicep', 'lbicep', 'weapon']) expect(flagOf(v.flags, p), `${v.name} ${p}`).toBe(0x0c);
      for (const p of ['rtoe', 'ltoe']) expect(flagOf(v.flags, p), `${v.name} ${p}`).toBe(0x3c);
      const rest = pin.victoryPartNames.filter((p) => !['skel_root', 'hips', 'lshoulder_wgt', 'rshoulder_wgt', 'rbicep', 'lbicep', 'weapon', 'rtoe', 'ltoe', 'spinehi'].includes(p));
      for (const p of rest) expect(flagOf(v.flags, p), `${v.name} ${p}`).toBe(0x2c);
    }
    expect(pin.victory.map((v) => flagOf(v.flags, 'spinehi')).sort()).toEqual([0x2c, 0x2c, 0x2c, 0x3c, 0x3c, 0x3c, 0x3c]);
  });

  it('times a clip at frames / 30 seconds in f32: 30 keys a second on the seven victory clips', () => {
    for (const v of pin.victory) {
      expect(v.duration, v.name).toBe(Math.fround(v.frames / 30));
      const clip = parseMotionClip(layOutClip(v.frames, v.duration, tracksOf(pin.victoryPartNames, v.flags)), v.name);
      expect(clip.rate, v.name).toBeCloseTo(30, 4);
      // key i at i x duration / n: whole frames land on whole keys
      expect(sampleClip(clip, (7 * clip.duration) / clip.frameCount, { loop: false }).frame, v.name).toBeCloseTo(7, 4);
    }
  });

  it("puts backflip's 19 constant translations within one 1/256 step of seal_A_scuba's bind node, truncated toward zero (77 §6)", () => {
    expect(MOTION_TRANSLATION_SCALE).toBe(1 / 256);
    const clip = parseMotionClip(backflipBytes(), 'victory_backflip');
    const s = skeletonFromPin(skeletonPin);
    let n = 0, worst = 0;
    for (const p of clip.parts) {
      if (p.translations.length !== 3 || s.indexOf(p.name) < 0) continue;
      const bind = s.parts[s.indexOf(p.name)]!.bindLocal.subarray(12, 15);
      for (let k = 0; k < 3; k++) {
        const steps = (bind[k]! - p.translations[k]!) * 256;
        worst = Math.max(worst, Math.abs(steps));
        // toward zero: the file's value never lies further from 0 than the bind's
        expect(Math.abs(p.translations[k]!), `${p.name}[${k}]`).toBeLessThanOrEqual(Math.abs(bind[k]!) + 1e-6);
      }
      n++;
    }
    expect(n).toBe(19);
    expect(worst).toBeLessThan(1);           // 77 §6: the worst is 0.94 of a step
  });

  it("turns backflip's constant rotations into the bind rows through partMatrix: rtoe row 0 (0.000, -0.999, 0.036) (77 §6)", () => {
    expect(MOTION_ROTATION_SCALE).toBe(1 / 32767);
    expect(pin.backflipConstants.rtoe!.r).toEqual([-417, -417, -23165, 23166]);
    expect(pin.backflipConstants.skel_root!.r).toEqual([0, 0, 0, 32767]);     // w last: the identity
    const clip = parseMotionClip(backflipBytes(), 'victory_backflip');
    const s = skeletonFromPin(skeletonPin);
    let n = 0;
    for (const p of clip.parts) {
      if (p.rotations.length !== 4) continue;
      const m = partMatrix(Array.from(p.rotations) as [number, number, number, number], [0, 0, 0]);
      const bind = s.parts[s.indexOf(p.name)]!.bindLocal;
      for (let i = 0; i < 12; i++) if (i % 4 !== 3) expect(Math.abs(m[i]! - bind[i]!), `${p.name} ${i}`).toBeLessThan(2e-3);
      n++;
    }
    expect(n).toBe(3);
    const rtoe = partMatrix(Array.from(clip.parts.find((p) => p.name === 'rtoe')!.rotations) as [number, number, number, number], [0, 0, 0]);
    expect(Array.from(rtoe.subarray(0, 3)).map((x) => Math.round(x * 1000) / 1000 + 0)).toEqual([0, -0.999, 0.036]);
  });

  it("walks seal_run's pinned root at research 25's (41, 2638, 7233 - 492.5 i): 57.7 units a second along -z", () => {
    const raw = pin.sealRunRootRaw;
    expect(raw).toHaveLength(3 * 20);
    for (let i = 0; i < 19; i++) expect([raw[3 * i], raw[3 * i + 1]], `key ${i}`).toEqual([41, 2638]);
    // 492.5 is the mean stride: each step is 492 or 493 steps of 1/256
    const strides = Array.from({ length: 18 }, (_, i) => raw[3 * i + 2]! - raw[3 * i + 5]!);
    expect([...new Set(strides)].sort()).toEqual([492, 493]);
    expect(Math.abs((raw[2]! - raw[3 * 18 + 2]!) / 18 - 492.5)).toBeLessThan(0.2);   // 492.39 over keys 0-18
    expect(raw.slice(0, 9)).toEqual([41, 2638, 7233, 41, 2638, 6741, 41, 2638, 6248]);
    expect(raw.slice(57)).toEqual(raw.slice(0, 3));                         // the closing key is key 0 (77 §5)
    const run = pin.pack.find((r) => r[0] === 'seal_run')!;
    expect([run[2], flagsOf(run[4])[0]]).toEqual([19, 0x1c]);
    const clip = parseMotionClip(layOutClip(19, Math.fround(19 / 30), [{ name: 'skel_root', flags: 0x1c, t: raw, r: [] }]), 'seal_run');
    const z = (t: number): number => sampleClip(clip, t, { loop: true }).parts[0]!.translation[2];
    expect((z(0) - z(18 / 30)) / (18 / 30)).toBeCloseTo(57.7, 1);
    expect(clip.duration).toBeCloseTo(0.633, 3);
    // research 25 §8.2's seal_crouch_step: 19 frames, its root 0x3c -- both channels constant, no root motion (77 §3)
    const step = pin.pack.find((r) => r[0] === 'seal_crouch_step')!;
    expect([step[2], pin.packPartSets[step[3]]!.split(' ')[0], flagsOf(step[4])[0]]).toEqual([19, 'skel_root', 0x3c]);
  });

  it("carries 77 §12's cycles with their frame counts, and the pack's shape: 1-81 frames, 34 part sets, six props", () => {
    const frames = new Map(pin.pack.map((r) => [r[0], r[2]] as const));
    expect(Object.fromEntries(Object.keys(CYCLES).map((k) => [k, frames.get(k)]))).toEqual(CYCLES);
    const counts = pin.pack.map((r) => r[2]);
    expect([Math.min(...counts), Math.max(...counts)]).toEqual([1, 81]);
    expect(pin.pack.filter((r) => r[2] === 81).map((r) => r[0]).sort()).toEqual(['seal_buddycarried_pickup', 'seal_buddycarry_pickup', 'seal_p_buddycarry_pickup']);
    for (const held of ['seal_fp_prone', 'civ_sitting01', 'guard_restrained']) expect(frames.get(held), held).toBe(1);
    expect(pin.packPartSets).toHaveLength(34);
    expect([...new Set(pin.packPartSets.map((s) => s.split(' ').length))].sort((a, b) => a - b)).toEqual([4, 7, 11, 14, 15, 16, 25, 26, 27, 28]);
    const extra = new Set(pin.packPartSets.flatMap((s) => s.split(' ')).filter((n) => !pin.victoryPartNames.includes(n)));
    expect([...extra].sort()).toEqual(['back', 'do_not_use', 'launcher', 'pistol', 'rifle', 'rifle_out']);
    const set = (name: string): string[] => pin.packPartSets[pin.pack.find((r) => r[0] === name)![3]]!.split(' ');
    expect(set('seal_headlooks').sort()).toEqual(['head', 'neck', 'spinehi', 'spinelo']);
    expect(set('seal_p_walk')).not.toContain('skel_root');
  });

  it('sorts the pack into 77 §12\'s families: seal 154, seal_p 79, seal_fp 13, seal_pfp 12, seal_mv 6, guard 34, death 22, civ 12, torturer 2', () => {
    const names = pin.pack.map((r) => r[0]);
    const family = (n: string): string => /^(seal_pfp|seal_fp|seal_mv|seal_p|seal|guard|death|civ|torturer)_/.exec(n)?.[1] ?? 'other';
    const tally: Record<string, number> = {};
    for (const n of names) tally[family(n)] = (tally[family(n)] ?? 0) + 1;
    expect(tally).toEqual({ seal: 154, seal_p: 79, seal_fp: 13, seal_pfp: 12, seal_mv: 6, guard: 34, death: 22, civ: 12, torturer: 2 });
  });
});

const MP2 = fixture('RUN/MP2.ZDB');
const PACK = fixture('RUN/MOTION_P.ZAR');
const digest = (c: MotionClip): string => {
  const h = createHash('sha1');
  for (const p of c.parts) for (const a of [p.translations, p.rotations]) h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  return h.digest('hex').slice(0, 16);
};
const flagString = (c: MotionClip): string => c.parts.map((p) => (p.flags >> 4).toString(16)).join('');

describe(`the motion pins against the disc${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("re-reads the victory pin from MP2's MOTION_S.ZAR: sizes, frames, durations, flags, 77 §8's payload SHA-1s, decoded digests", () => {
    const zar = Zar.parse(zdbMember(MP2!, parseZdb(MP2!), 'MOTION_S.ZAR'));
    const clips = parseMotionZar(zar);
    expect(clips[0]!.parts.map((p) => p.name)).toEqual(pin.victoryPartNames);
    expect(clips.map((c, i) => {
      const key = zar.root.children[i]!;
      const bytes = zar.data(key);
      const payload = createHash('sha1').update(bytes.subarray(0, 0x20)).update(bytes.subarray(new Reader(bytes).u32(0x18))).digest('hex');
      return { name: c.name, keySize: key.size, frames: c.frameCount, duration: c.duration, flags: flagString(c), payloadSha1: payload, decodedSha1: digest(c) };
    })).toEqual(pin.victory);
    // 77 §8's table prints the first 12 hex of each payload SHA-1 (head + names + tracks)
    expect(pin.victory.map((v) => v.payloadSha1.slice(0, 12))).toEqual(['321d6d2f3792', 'e14b30e68be1', 'ba6f5a57ca5c', '2cc4b8fa1bfe', 'd0551f3db472', '41b6a112d26d', 'fc2b2a65e26c']);
  });

  it.skipIf(!MP2)("re-reads backflip's head words and its constant channels through parseMotionClip", () => {
    const zar = Zar.parse(zdbMember(MP2!, parseZdb(MP2!), 'MOTION_S.ZAR'));
    const bytes = zar.data(zar.root.children[0]!);
    expect(words(bytes, 8)).toEqual(pin.backflipHeadWords);
    const clip = parseMotionClip(bytes, 'victory_backflip');
    const constants: Record<string, { t?: number[]; r?: number[] }> = {};
    for (const p of clip.parts) {
      const e: { t?: number[]; r?: number[] } = {};
      if (p.translations.length === 3) e.t = Array.from(p.translations, (x) => Math.round(x * 256));
      if (p.rotations.length === 4) e.r = Array.from(p.rotations, (x) => Math.round(x * 32767));
      if (e.t || e.r) constants[p.name] = e;
    }
    // the reader keeps x y z of a constant translation; the fourth lane is the writer's residue (77 §5), not compared
    const pinned = Object.fromEntries(Object.entries(pin.backflipConstants).map(([k, v]) => [k, { ...v, ...(v.t ? { t: v.t.slice(0, 3) } : {}) }]));
    expect(constants).toEqual(pinned);
  });

  it.skipIf(!PACK)("re-reads the pack pin from MOTION_P.ZAR: 334 clips, sizes, frames, part sets, flags, digests, seal_run's root", () => {
    const zar = Zar.parse(PACK!);
    const clips = parseMotionZar(zar);
    expect(zar.root.children.length).toBe(pin.packKeys);
    const sets: string[] = [];
    const rows = clips.map((c, i) => {
      const names = c.parts.map((p) => p.name).join(' ');
      if (!sets.includes(names)) sets.push(names);
      return [c.name, zar.root.children[i]!.size, c.frameCount, sets.indexOf(names), flagString(c), digest(c)];
    });
    expect(sets).toEqual(pin.packPartSets);
    expect(rows).toEqual(pin.pack);
    for (const c of clips) expect(c.duration, c.name).toBe(Math.fround(c.frameCount / 30));
    const run = clips.find((c) => c.name === 'seal_run')!;
    expect(Array.from(run.parts[0]!.translations, (x) => Math.round(x * 256))).toEqual(pin.sealRunRootRaw);
  });
});
