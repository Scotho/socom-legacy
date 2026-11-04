// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MotionClip } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { motionOf } from '../src/locomotion';
import { motionTableFromArchive, type MotionEntry } from '../src/motionTable';

/**
 * Parity pins for `motion.rdr`, the clips' playback table (socomlegacy/docs/research/77 §7; registry
 * docs/parity/registry/character.json): `golden/motion-rdr.json` is the table as `motionTableFromArchive` reads it out
 * of `RUN/READERC.ZAR`, all 398 entries. The unit half checks 77 §7's statements on it and on the clip pin beside it
 * (`scene/test/golden/character-motion.json`), and plays the pinned entries through `motionOf`; the fixture half
 * re-reads the table from the disc file.
 */
const here = dirname(fileURLToPath(import.meta.url));
type Row = [string, boolean | null, number | null, number | null, number | null, number | null, number | null, number | null, boolean, boolean, string];
const pin = JSON.parse(readFileSync(resolve(here, 'golden/motion-rdr.json'), 'utf8')) as { _source: string; entries: Row[] };
const clips = JSON.parse(readFileSync(resolve(here, '../../scene/test/golden/character-motion.json'), 'utf8')) as {
  victory: { name: string; frames: number; duration: number }[]; pack: [string, number, number, number, string, string][];
};

const entryOf = (r: Row): MotionEntry => ({
  looped: r[1], playback: r[2], maxVelocity: r[3], blendTime: r[4], transitionA: r[5], transitionB: r[6], noInterrupt: r[7],
  lateral: r[8], noPitchtwist: r[9],
  callbacks: r[10] ? r[10].split(' ').map((c) => { const [name, time] = c.split('@'); return { name: name!, time: Number(time) }; }) : [],
});
const table = new Map(pin.entries.map((r) => [r[0], entryOf(r)] as const));
const entry = (name: string): MotionEntry => table.get(name)!;
/** A clip of the pinned frame count, at frames / 30 seconds, with no parts: what `motionOf` needs of it here. */
const clipOf = (name: string, frames: number): MotionClip => ({
  name, version: 5, duration: Math.fround(frames / 30), frameCount: frames, rate: 30, unknown10: -1, unknown14: 1, parts: [],
});
const framesOf = new Map<string, number>([...clips.victory.map((v) => [v.name, v.frames] as const), ...clips.pack.map((r) => [r[0], r[2]] as const)]);

describe('motion.rdr, pinned (research 77 §7; no game data)', () => {
  it("holds 398 entries, 150 looped and 248 not: seal_run 1, seal_stand 1, seal_jump 0, seal_land_hard 0, every victory clip 0", () => {
    expect(pin.entries).toHaveLength(398);
    expect([pin.entries.filter((r) => r[1] === true).length, pin.entries.filter((r) => r[1] === false).length]).toEqual([150, 248]);
    expect(['seal_run', 'seal_stand', 'seal_jump', 'seal_land_hard'].map((n) => entry(n).looped)).toEqual([true, true, false, false]);
    for (const v of clips.victory) expect(entry(v.name).looped, v.name).toBe(false);
  });

  it("names 326 of the player pack's 334 clips and all seven victory clips", () => {
    expect(clips.pack.filter((r) => table.has(r[0]))).toHaveLength(326);
    expect(clips.victory.every((v) => table.has(v.name))).toBe(true);
  });

  it("plays the victory clips in their playback seconds, 0.23-0.43 under the files' durations, through motionOf", () => {
    const expected: Record<string, number> = {
      victory_backflip: 4.8, victory_break: 2.8, victory_chicken: 5.9, victory_face: 4.6, victory_funky: 2.5, victory_macarena: 6.6, victory_rodeo: 4.7,
    };
    for (const v of clips.victory) {
      const e = entry(v.name);
      expect([e.playback, e.maxVelocity! < 0], v.name).toEqual([expected[v.name], true]);
      const under = v.duration - e.playback!;
      expect(under, v.name).toBeGreaterThan(0.23 - 1e-3);
      expect(under, v.name).toBeLessThan(0.43 + 5e-3);
      expect(motionOf(clipOf(v.name, v.frames), e).period, v.name).toBe(e.playback);
    }
  });

  it("plays seal_crouch_step in its playback 0.4 s against the file's 0.633, and seal_run at its own 0.633 s (77 §7's reading)", () => {
    expect([entry('seal_crouch_step').playback, entry('seal_crouch_step').maxVelocity! < 0]).toEqual([0.4, true]);
    expect(motionOf(clipOf('seal_crouch_step', framesOf.get('seal_crouch_step')!), entry('seal_crouch_step')).period).toBe(0.4);
    expect([entry('seal_run').playback, entry('seal_run').maxVelocity]).toEqual([1, 6.5]);
    expect([entry('seal_walk').playback, entry('seal_walk').maxVelocity]).toEqual([1, 6.5]);
    expect(motionOf(clipOf('seal_run', framesOf.get('seal_run')!), entry('seal_run')).period).toBeCloseTo(0.633, 3);
  });

  it('fires 77 §7\'s zAnim callbacks: seal_jump jump_whoosh at 0.4, seal_stand cold_breath at 0.1, 26 names in all', () => {
    expect(entry('seal_jump').callbacks).toEqual([{ name: 'jump_whoosh', time: 0.4 }]);
    expect(entry('seal_stand').callbacks).toEqual([{ name: 'cold_breath', time: 0.1 }]);
    expect(motionOf(clipOf('seal_jump', framesOf.get('seal_jump')!), entry('seal_jump')).callbacks).toEqual([{ name: 'jump_whoosh', phase: 0.4 }]);
    const names = new Set(pin.entries.flatMap((r) => (r[10] ? r[10].split(' ').map((c) => c.split('@')[0]!) : [])));
    expect(names.size).toBe(26);
    for (const n of ['jump_whoosh', 'seal_thud', 'dive_prone', 'ladder_rung', 'pull_up', 'climb_up', 'throw_whoosh', 'shotgun_pump', 'headshot_kill', 'cold_breath', 'knife_blood_squirt']) {
      expect(names.has(n), n).toBe(true);
    }
  });
});

const READERC = fixture('RUN/READERC.ZAR');

describe(`the motion.rdr pin against the disc${READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!READERC)("re-reads all 398 entries from READERC.ZAR's motion.rdr through motionTableFromArchive", () => {
    const read = motionTableFromArchive(READERC!)!;
    expect([...read.entries()].map(([k, e]): Row => [k, e.looped, e.playback, e.maxVelocity, e.blendTime, e.transitionA, e.transitionB,
      e.noInterrupt, e.lateral ?? false, e.noPitchtwist ?? false, e.callbacks.map((c) => `${c.name}@${c.time}`).join(' ')])).toEqual(pin.entries);
  });
});
