// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleClip } from '@s2u/scene';
import { SIM_CLIPS, simSkeletonsFromBytes } from '../src/simMap';
import { PLAY_CLIPS, writePose } from '../src/animator';
import { entryOf, motionOf } from '../src/locomotion';
import { FOOT_PLANT_POINT_X, legPoint, setTurnStepClips, TURN_STEP_CLIP_NAMES, TURN_STEP_CLIPS_READING } from '../src/footPlant';
import type { PartPose } from '@s2u/scene';

/**
 * R4P-301 (`../src/footPlant`): the plant poses the leg from the loaded `seal_step` and `seal_stand` (no table in the
 * source, RS.R8) -- its point against the port's own skeleton pose (`../src/animator` `writePose` on each model of the
 * map, the root's x/z zeroed as the body tick zeroes them, `FUN_0057f580` D4:L479633-479672), at every key and between
 * keys, for EVERY character skeleton of MP2; the leg's parents; and `motion.rdr`'s playback and BlendTime for the plays'
 * rates. The disc's `RUN/MP2.ZDB`, `MOTION_P.ZAR`, `READERC.ZAR` (`SOCOM_DISC`, else the repository's fixtures);
 * skipped -- said in the title -- without them.
 */
const FIXTURES = resolve(__dirname, '../../../test-fixtures/RUN');
const DISC_RUN = process.env.SOCOM_DISC ? join(resolve(process.env.SOCOM_DISC), 'RUN') : '';
const NEED = ['MP2.ZDB', 'MOTION_P.ZAR', 'READERC.ZAR'];
const RUN = [DISC_RUN, FIXTURES].find((d) => d && NEED.every((f) => existsSync(join(d, f)))) ?? '';

describe.skipIf(!RUN)(`R4P-301: the plant's leg is the loaded clips' (${RUN ? 'the disc or the fixtures' : 'no MP2.ZDB / MOTION_P.ZAR / READERC.ZAR: skipped'})`, () => {
  const types = RUN ? simSkeletonsFromBytes(
    new Uint8Array(readFileSync(join(RUN, 'MP2.ZDB'))), new Uint8Array(readFileSync(join(RUN, 'READERC.ZAR'))),
    new Uint8Array(readFileSync(join(RUN, 'MOTION_P.ZAR')))) : null;
  const bodies = types ? [...types.seal, ...types.terrorist].filter((s) => s !== null) : [];
  beforeAll(() => { setTurnStepClips(bodies[0]?.motion?.clips ?? null); });
  afterAll(() => { setTurnStepClips(null); });

  /** The skeleton's posed point of each foot at `frame` of `clip`, model space, the root's x/z zeroed. */
  function posed(body: (typeof bodies)[number], clip: string, frame: number): { left: [number, number]; right: [number, number] } {
    const sk = body!.skeleton;
    const c = body!.motion!.clips.find((m) => m.name === clip)!;
    writePose(sk, sampleClip(c, (frame / c.frameCount) * c.duration).parts);
    const root = sk.parts[sk.indexOf('skel_root')]!.bindLocal;     // `writePose` stands the root at the bind's x/z
    const at = (name: string): [number, number] => {
      const m = sk.world[sk.indexOf(name)]!;
      return [FOOT_PLANT_POINT_X * m[0]! + m[12]! - root[12]!, FOOT_PLANT_POINT_X * m[2]! + m[14]! - root[14]!];
    };
    return { left: at('lfoot'), right: at('rfoot') };
  }

  it("reads the SEAL's and every model's skeleton; the leg's parents are the chain the plant walks", () => {
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) {
      const sk = b!.skeleton, parent = (n: string): string => { const p = sk.part(n).parent; return p < 0 ? '' : sk.parts[p]!.name; };
      expect(Array.from(sk.modelMatrix)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      for (const side of ['l', 'r']) {
        expect([parent(`${side}foot`), parent(`${side}calf`), parent(`${side}thigh`), parent('hips'), parent('skel_root')])
          .toEqual([`${side}calf`, `${side}thigh`, 'hips', 'skel_root', '']);
      }
    }
  });

  it("seal_step: the plant's point is the skeleton's, to 1e-4, at every key and half key, on every model", () => {
    for (const b of bodies) {
      for (let f = 0; f < 20; f += 0.5) {
        const p = posed(b, 'seal_step', f);
        for (const foot of ['left', 'right'] as const) {
          const q = legPoint(foot, f / 20, 1)!;
          expect(q[0], `${b!.model} ${foot} frame ${f} x`).toBeCloseTo(p[foot][0], 4);
          expect(q[1], `${b!.model} ${foot} frame ${f} z`).toBeCloseTo(p[foot][1], 4);
        }
      }
    }
  });

  it("the cross-fade's start (w 0) is seal_stand's first key; its 16 keys move the point under 0.005 (FOOT_PLANT_FADE_READING)", () => {
    const b = bodies[0]!;
    for (const foot of ['left', 'right'] as const) {
      const q = legPoint(foot, 0.37, 0)!, k0 = posed(b, 'seal_stand', 0)[foot];
      expect(q[0]).toBeCloseTo(k0[0], 4);
      expect(q[1]).toBeCloseTo(k0[1], 4);
      for (let k = 0; k < 16; k++) {
        const p = posed(b, 'seal_stand', k)[foot];
        expect(Math.hypot(p[0] - k0[0], p[1] - k0[1]), `${foot} key ${k}`).toBeLessThan(0.005);
      }
    }
  });

  it("mid-fade: the plant's point is the skeleton posed from the leg's bones blended toward seal_stand's first key (SmoothAnims, FUN_0028f460), to 1e-4", () => {
    // An independent blend of the read's rule: translation lerped; rotation the shorter arc, a normalised lerp above a
    // dot of 0.95, else a slerp -- the chain's eight bones only (the rest of the skeleton does not reach the feet).
    const chain = new Set(['skel_root', 'hips', 'lthigh', 'lcalf', 'lfoot', 'rthigh', 'rcalf', 'rfoot']);
    const b = bodies[0]!, sk = b.skeleton;
    const step = b.motion!.clips.find((m) => m.name === 'seal_step')!, stand = b.motion!.clips.find((m) => m.name === 'seal_stand')!;
    const standParts = new Map(sampleClip(stand, 0).parts.map((p) => [p.name, p]));
    const blend = (a: PartPose, s: PartPose, k: number): PartPose => {
      const q = s.rotation, r = a.rotation;
      let d = r[0] * q[0] + r[1] * q[1] + r[2] * q[2] + r[3] * q[3], sg = 1;
      if (d < 0) { sg = -1; d = -d; }
      let wa = 1 - k, wb = k;
      if (d <= 0.95) { const th = Math.acos(d), sn = Math.sin(th); wa = Math.sin((1 - k) * th) / sn; wb = Math.sin(k * th) / sn; }
      const o = [0, 1, 2, 3].map((i) => wa * r[i]! + wb * sg * q[i]!), n = Math.hypot(...o);
      return { ...a, rotation: o.map((v) => v / n) as [number, number, number, number],
        translation: a.translation.map((v, i) => v + (s.translation[i]! - v) * k) as [number, number, number] };
    };
    const root = sk.parts[sk.indexOf('skel_root')]!.bindLocal;
    for (const phase of [0.05, 0.33, 0.5, 0.71, 0.93]) {
      for (const w of [0.2, 0.5, 0.8]) {
        const parts = sampleClip(step, phase * step.duration).parts.map((p) => (chain.has(p.name) ? blend(p, standParts.get(p.name)!, 1 - w) : p));
        writePose(sk, parts);
        for (const foot of ['left', 'right'] as const) {
          const m = sk.world[sk.indexOf(foot === 'left' ? 'lfoot' : 'rfoot')]!;
          const want = [FOOT_PLANT_POINT_X * m[0]! + m[12]! - root[12]!, FOOT_PLANT_POINT_X * m[2]! + m[14]! - root[14]!];
          const got = legPoint(foot, phase, w)!;
          expect(got[0], `${foot} phase ${phase} w ${w} x`).toBeCloseTo(want[0]!, 4);
          expect(got[1], `${foot} phase ${phase} w ${w} z`).toBeCloseTo(want[1]!, 4);
        }
      }
    }
  });

  it("the wiring: the room's sim clips and the page's play clips both carry seal_step and seal_stand (setTurnStepClips)", () => {
    for (const name of TURN_STEP_CLIP_NAMES) {
      expect(SIM_CLIPS, `SIM_CLIPS ${name}`).toContain(name);
      expect(PLAY_CLIPS, `PLAY_CLIPS ${name}`).toContain(name);
    }
  });

  it('without the clips the plant has no leg', () => {
    setTurnStepClips(null);
    expect(legPoint('left', 0.2, 1)).toBeNull();
    setTurnStepClips(bodies[0]?.motion?.clips ?? null);
  });

  it("motion.rdr: seal_step playback 0.65 (K 1), BlendTime 0.9; seal_stand 6 -- TURN_STEP_CLIPS_READING", () => {
    const b = bodies[0]!, table = b.motion!.table;
    const rate = (name: string): number => {
      const c = b.motion!.clips.find((m) => m.name === name)!;
      const m = motionOf(c, entryOf(name, table));
      expect(m.looped, name).toBe(true);
      return m.scale / m.period;
    };
    expect(rate('seal_step')).toBeCloseTo(TURN_STEP_CLIPS_READING.stepRate, 6);
    expect(rate('seal_stand')).toBeCloseTo(TURN_STEP_CLIPS_READING.standRate, 6);
    expect(entryOf('seal_step', table)?.blendTime).toBeCloseTo(TURN_STEP_CLIPS_READING.stepBlend, 6);
  });
});
