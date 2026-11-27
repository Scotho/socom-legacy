import { describe, expect, it } from 'vitest';
import * as bend from '../src/recoilBend';

/**
 * Research 442 (LATER 1144; the main controller's go, INTAKE 129): the shooter's body bends with each round. Each round
 * adds the weapon's `RecoilPct` (weapon `+0x6c`, `FUN_003d2000` D:L324561-324565) to body `+0x378`, clamped at 10
 * (`FUN_0057d510` D:L440319-440327, from the fire `FUN_005c3360` D:L477806-477807); each body tick `FUN_0057b550`
 * (D:L439231-440316) decays it (`v -= 1.1 v t`, zero under 0.01; D:L439621-439636) and turns 21 bones by one of six
 * tables (stance x the hand's rifle or pistol), each by the quaternion `FUN_003066d0(v, q, a)` builds -- `(sin(v|a|) a/|a|,
 * cos(v|a|))` -- composed before the node's own (`FUN_003070c0`), and adds `v` x an offset to a few (`FUN_00309240`).
 * The table below is the transcription, word for word from the source's hex (`D:L` of each `FUN_003066d0` call); a row
 * with no axis keeps the default rotation (research 442 section 2).
 */
const f32 = (w: number): number => new Float32Array(new Uint32Array([w]).buffer)[0]!;

/* eslint-disable max-len */
const EXPECTED: Record<string, [string, readonly number[] | null, readonly number[]][]> = {
  // D:L439718-439792
  'stand/rifle': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0.011489, 0, 0.075324]],  // default
    ['spinelo', [0x3bb0856e, 0xbc52ed78, 0x3bd04e62], [0, 0, 0]],  // D:L439728
    ['spinehi', [0xbba7b4e5, 0xb9e9d51b, 0x37fba882], [0, 0, 0]],  // D:L439732
    ['lbicep', [0x3c0155d6, 0xbb87a073, 0x3ae62995], [0, 0, 0]],  // D:L439736
    ['lforearm', [0x00000000, 0x00000000, 0xbc95dd4c], [0, 0, 0]],  // D:L439740
    ['lhand', [0x3b40df59, 0x3c2187a5, 0x3cb634db], [0, 0, 0]],  // D:L439744
    ['rbicep', [0x3a9d6adf, 0x3c217b0f, 0xbc793bc1], [-0.102813, -0.130555, -0.039765]],  // D:L439748
    ['rforearm', [0x00000000, 0x00000000, 0x3ca4a490], [0, 0, 0]],  // D:L439752
    ['rhand', [0x3cef9db2, 0xbbd002e2, 0xbcb2e59b], [0, 0, 0]],  // D:L439756
    ['lshoulder_wgt', [0x3c00a9df, 0xbb76be38, 0x3b0df373], [0, 0, 0]],  // D:L439764
    ['rshoulder_wgt', [0x3a1203a3, 0x3d02edbb, 0xbc89203a], [-0.102813, -0.130555, -0.039766]],  // D:L439760
    ['rscap', [0xbd0ef34d, 0x3cee0f3d, 0xbba979e1], [0, 0, 0]],  // D:L439768
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0xbac23fab, 0xb9f88334, 0xbb58ba41], [0, 0, 0]],  // D:L439772
    ['lcalf', [0x00000000, 0x00000000, 0xbbb68cef], [0, 0, 0]],  // D:L439776
    ['lfoot', [0x39991794, 0x3b6eae9f, 0x3bb47410], [0, 0, 0]],  // D:L439780
    ['rthigh', [0x3c0090b4, 0x3ac6b485, 0xbb34bf90], [0, 0, 0]],  // D:L439784
    ['rcalf', [0x00000000, 0x00000000, 0x3c4918e3], [0, 0, 0]],  // D:L439788
    ['rfoot', [0xb9302928, 0x3b84944f, 0xbb9efd87], [0, 0, 0]],  // D:L439792
  ],
  // D:L439795-439871
  'stand/pistol': [
    ['skel_root', null, [0.005375, 0.059233, 0.075169]],  // default
    ['hips', null, [0, 0, 0]],  // default
    ['spinelo', [0xb92aeafb, 0xb88a697b, 0xb941fc8f], [0, 0, 0]],  // D:L439807
    ['spinehi', [0x382393ee, 0xb8a5accd, 0x3914e5d6], [0, 0, 0]],  // D:L439811
    ['lbicep', [0x3c0b2639, 0x3d258927, 0xbd39fcb1], [0, 0, 0]],  // D:L439815
    ['lforearm', [0xb60637bd, 0x00000000, 0xbc66cd29], [0, 0, 0]],  // D:L439819
    ['lhand', [0x3c00f990, 0xbc0b8f15, 0xbc8285ec], [0, 0, 0]],  // D:L439823
    ['rbicep', [0xbadf9bdc, 0x3c82b40f, 0xbd387161], [-0.033543, -0.095054, -0.053353]],  // D:L439827
    ['rforearm', [0x00000000, 0x00000000, 0xbac75c4b], [0, 0, 0]],  // D:L439831
    ['rhand', [0xba8e581d, 0x3d32dd37, 0xbba2e3c5], [0, 0, 0]],  // D:L439835
    ['lshoulder_wgt', [0x3c2dd591, 0x3d98eb03, 0xbcbd5bab], [0, 0, 0]],  // D:L439843
    ['rshoulder_wgt', [0xbbd93815, 0xbc9ce076, 0xbd8005c4], [-0.033543, -0.095054, -0.053353]],  // D:L439839
    ['rscap', [0xbcf60179, 0x3c1103c9, 0x3b4bd124], [0, 0, 0]],  // D:L439847
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0xbbf240fb, 0x3a8cc576, 0xb9ecfa6a], [0, 0, 0]],  // D:L439851
    ['lcalf', [0x00000000, 0x00000000, 0xbca5aab4], [0, 0, 0]],  // D:L439855
    ['lfoot', [0x39302928, 0x3ad73861, 0x3c53bafe], [0, 0, 0]],  // D:L439859
    ['rthigh', [0xbb37f5a5, 0xbb045133, 0xbb991794], [0, 0, 0]],  // D:L439863
    ['rcalf', [0x00000000, 0x00000000, 0xbc58be73], [0, 0, 0]],  // D:L439867
    ['rfoot', [0x39aaeafb, 0x3b88ce70, 0x3c16b767], [0, 0, 0]],  // D:L439871
  ],
  // D:L439879-439952
  'crouch/rifle': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [-0.000467, 0, 0.094615]],  // default
    ['spinelo', [0x3cd594f2, 0x3a25accd, 0xbbab5808], [0, 0, 0]],  // D:L439889
    ['spinehi', [0xbbd76252, 0xbc186b9c, 0x3c7d9fd3], [0, 0, 0]],  // D:L439893
    ['lbicep', [0x3bf38822, 0xbbe789e7, 0x3c0e79ab], [0, 0, 0]],  // D:L439897
    ['lforearm', [0x00000000, 0x00000000, 0xbd180c31], [0, 0, 0]],  // D:L439901
    ['lhand', [0x3b416590, 0xbb3e2f7b, 0x3cb8c543], [0, 0, 0]],  // D:L439905
    ['rbicep', [0xbb55d80e, 0x3a3fe3b0, 0xb8e27e0f], [-0.082743, -0.071263, -0.025372]],  // D:L439909
    ['rforearm', [0x00000000, 0x00000000, 0xbb84406c], [0, 0, 0]],  // D:L439913
    ['rhand', null, [0, 0, 0]],  // default
    ['lshoulder_wgt', [0x3bcaa327, 0xbc2a8a83, 0x3bdbb59e], [0, 0, 0]],  // D:L439924
    ['rshoulder_wgt', [0xbbb28d86, 0x3d10129d, 0xbbf5d356], [-0.082744, -0.071263, -0.025372]],  // D:L439920
    ['rscap', [0xbc90f0e9, 0x3cb4c7f3, 0xbb8c2e77], [0, 0, 0]],  // D:L439928
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0x3b613f4b, 0x3a206ea0, 0xbb2a53fc], [0, 0, 0]],  // D:L439932
    ['lcalf', [0x00000000, 0x358637bd, 0xbbfde2ef], [0, 0, 0]],  // D:L439936
    ['lfoot', [0x3a1bf9c6, 0x3a42c5e3, 0x3c4486ad], [0, 0, 0]],  // D:L439940
    ['rthigh', [0x3c209cc3, 0x3bd844d0, 0xbbfb5d03], [0, 0, 0]],  // D:L439944
    ['rcalf', [0x00000000, 0x00000000, 0x3c209460], [0, 0, 0]],  // D:L439948
    ['rfoot', [0x3925accd, 0x38e6afcd, 0x3b8c79f6], [0, 0, 0]],  // D:L439952
  ],
  // D:L439955-440024
  'crouch/pistol': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0, -1e-06, 0.131876]],  // default
    ['spinelo', [0x3be631f9, 0xbb081e47, 0x39473abd], [0, 0, 0]],  // D:L439961
    ['spinehi', [0xbbaa758a, 0xba2569b1, 0x3950aaa8], [0, 0, 0]],  // D:L439965
    ['lbicep', [0x3c89d495, 0x3cc5197a, 0xbca1e3eb], [0, 0, 0]],  // D:L439969
    ['lforearm', [0x358637bd, 0x00000000, 0xbc49e668], [0, 0, 0]],  // D:L439973
    ['lhand', [0x3d4d0460, 0xbd1f47fa, 0xbcbc5586], [0, 0, 0]],  // D:L439977
    ['rbicep', [0xbc209cc3, 0x3c3c6a7f, 0xbc29cdc4], [0, 0, 0]],  // D:L439981
    ['rforearm', [0xb60637bd, 0x00000000, 0xbd1043e5], [0, 0, 0]],  // D:L439985
    ['rhand', [0xbc9b5200, 0x3d9b1b7a, 0xbca0c8cd], [0, 0, 0]],  // D:L439989
    ['lshoulder_wgt', [0x3c68bc17, 0x3c4197e5, 0xbd05d95e], [0, 0, 0]],  // D:L439997
    ['rshoulder_wgt', [0xbc30fadf, 0x3c1ed7c7, 0xbc3ccaf7], [0, 0, 0]],  // D:L439993
    ['rscap', null, [0, 0, 0]],  // default
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0x3b999dcb, 0xb9d9945b, 0xbabe9425], [0, 0, 0]],  // D:L440004
    ['lcalf', [0xb58637bd, 0xb58637bd, 0xbc2f1cb9], [0, 0, 0]],  // D:L440008
    ['lfoot', [0xba07ca64, 0xba25efe9, 0x3c7eb4a6], [0, 0, 0]],  // D:L440012
    ['rthigh', [0x3c4e8d97, 0x3bc9320e, 0xbbed1394], [0, 0, 0]],  // D:L440016
    ['rcalf', [0x00000000, 0x00000000, 0x3c6f8ceb], [0, 0, 0]],  // D:L440020
    ['rfoot', [0x3adc5500, 0x3adf9bdc, 0x3a7fda40], [0, 0, 0]],  // D:L440024
  ],
  // D:L440037-440110
  'prone/rifle': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0, 0, 0.031129]],  // default
    ['spinelo', null, [0, 0, 0]],  // default
    ['spinehi', null, [0, 0, 0]],  // default
    ['lbicep', [0x3c005e5f, 0xbc00cf9e, 0xbc008851], [0, 0, 0]],  // D:L440047
    ['lforearm', [0x00000000, 0x00000000, 0xbd2d7625], [0, 0, 0]],  // D:L440051
    ['lhand', [0x3bfc58ac, 0xbb29de8b, 0x3d02e233], [0, 0, 0]],  // D:L440055
    ['rbicep', [0xb9712c28, 0xb92bf76a, 0xbc164a5a], [-0.032738, -0.002479, -0.016733]],  // D:L440059
    ['rforearm', [0x00000000, 0x00000000, 0xbc76ceff], [0, 0, 0]],  // D:L440063
    ['rhand', null, [0, 0, 0]],  // default
    ['lshoulder_wgt', [0x3c873de2, 0x3b58665e, 0xbb2efb2b], [0, 0, 0]],  // D:L440074
    ['rshoulder_wgt', [0x3866afcd, 0x3a83ba34, 0xbc198d04], [-0.032737, -0.002479, -0.016733]],  // D:L440070
    ['rscap', [0xbb0b75ea, 0x3c09656f, 0x3b3f7f06], [0, 0, 0]],  // D:L440078
    ['neck', [0x3b17fa5d, 0xba356755, 0xbb01c2e3], [0, 0, 0]],  // D:L440082
    ['head', [0x3b7f64d0, 0x3a8f648c, 0xbc2b10ba], [0, 0, 0]],  // D:L440086
    ['lthigh', [0x3bce5f74, 0xbba8650e, 0xbb630447], [0, 0, 0]],  // D:L440090
    ['lcalf', [0x00000000, 0x00000000, 0x3c8d77b8], [0, 0, 0]],  // D:L440094
    ['lfoot', [0x386f1349, 0x3a03558a, 0xbc0a6549], [0, 0, 0]],  // D:L440098
    ['rthigh', [0x3b42a455, 0x39a84be4, 0x3b0cf7cb], [0, 0, 0]],  // D:L440102
    ['rcalf', [0x00000000, 0x00000000, 0x3b64c943], [0, 0, 0]],  // D:L440106
    ['rfoot', [0xb9913a50, 0xb9798fa3, 0x39334e77], [0, 0, 0]],  // D:L440110
  ],
  // D:L440113-440179
  'prone/pistol': [
    ['skel_root', null, [0, 0, 0]],  // default
    ['hips', null, [0, 0, 0.036443]],  // default
    ['spinelo', null, [0, 0, 0]],  // default
    ['spinehi', null, [0, 0, 0]],  // default
    ['lbicep', [0x3b9363f5, 0xbbb64170, 0xbc05271c], [0, 0, 0]],  // D:L440123
    ['lforearm', [0x00000000, 0x00000000, 0xbc947065], [0, 0, 0]],  // D:L440127
    ['lhand', [0x3d778fef, 0xbd026784, 0xbccfbfc6], [0, 0, 0]],  // D:L440131
    ['rbicep', [0x3b30f27c, 0xbae4da0a, 0x3a7f10ed], [-0.041599, 0.000939, -0.023483]],  // D:L440135
    ['rforearm', [0xb58637bd, 0x00000000, 0xbc4896dd], [0, 0, 0]],  // D:L440139
    ['rhand', [0xbd0929aa, 0x3c9ea359, 0xbd8ce67d], [0, 0, 0]],  // D:L440143
    ['lshoulder_wgt', [0x3bc93a71, 0xbb81c2e3, 0xbbf3b214], [0, 0, 0]],  // D:L440151
    ['rshoulder_wgt', [0x3bb55ef2, 0x3aa5ce5b, 0x3a8a8b09], [-0.041599, 0.000939, -0.023483]],  // D:L440147
    ['rscap', [0xbaf62739, 0x3c34e981, 0x3b770154], [0, 0, 0]],  // D:L440155
    ['neck', null, [0, 0, 0]],  // default
    ['head', null, [0, 0, 0]],  // default
    ['lthigh', [0x3befb2ab, 0xbbc3c18b, 0xbb83f4ed], [0, 0, 0]],  // D:L440159
    ['lcalf', [0x00000000, 0xb58637bd, 0x3ca467be], [0, 0, 0]],  // D:L440163
    ['lfoot', [0x388e9b39, 0x3a199dcb, 0xbc20e411], [0, 0, 0]],  // D:L440167
    ['rthigh', [0x3b63ef28, 0x39c521de, 0x3b2515cf], [0, 0, 0]],  // D:L440171
    ['rcalf', [0x00000000, 0x00000000, 0x3b85e3da], [0, 0, 0]],  // D:L440175
    ['rfoot', [0xb9a9de8b, 0xb99246bf, 0x3954dc66], [0, 0, 0]],  // D:L440179
  ],
};

const api = bend as unknown as Record<string, unknown>;
const need = <T,>(name: string): T => {
  expect(api[name], `recoilBend.ts exports ${name}`).toBeDefined();
  return api[name] as T;
};

describe('research 442: the body recoil value (FUN_0057d510, FUN_0057b550 D:L439621-439636)', () => {
  type State = { value: number; add(recoilPct: number): void; step(dt: number): void };
  const make = (): State => new (need<new () => State>('RecoilBend'))();
  it('a round adds RecoilPct; the value is clamped at 10', () => {
    const s = make();
    s.add(0.2);
    expect(s.value).toBeCloseTo(0.2, 9);
    for (let i = 0; i < 100; i++) s.add(0.2);
    expect(s.value).toBe(10);
  });
  it('each tick: v -= 1.1 v dt; under 0.01 (before or after) it is 0', () => {
    const s = make();
    s.add(2);
    s.step(1 / 60);
    expect(s.value).toBeCloseTo(2 - 1.1 * 2 / 60, 9);
    const t = make();
    t.add(0.0105);
    t.step(0.1);                                         // 0.0105 - 1.1 x 0.0105 x 0.1 = 0.00934: under 0.01
    expect(t.value).toBe(0);
    const u = make();
    u.add(0.005);
    u.step(0);
    expect(u.value).toBe(0);
  });
  it('the reading constants are named (research 442 section 7)', () => {
    expect(need<number>('RECOIL_BEND_CAP')).toBe(10);
    expect(need<number>('RECOIL_BEND_DECAY')).toBe(1.1);
    expect(need<number>('RECOIL_BEND_FLOOR')).toBe(0.01);
    expect(typeof api.RECOIL_BEND_TIME_BASE_READING).toBe('number');
    expect(api.RECOIL_BEND_REMOTE_READING).toBe(false);
    expect(api.RECOIL_BEND_ROOT_TO_CAMERA_READING).toBe(false);
  });
});

describe('research 442: the bone turn (FUN_003066d0)', () => {
  it('q = (sin(v|a|) a/|a|, cos(v|a|)); a zero axis gives the identity', () => {
    const quat = need<(v: number, a: readonly number[]) => number[]>('bendQuat');
    const a = [0.3, 0, 0.4], n = 0.5, v = 2;
    const q = quat(v, a);
    expect(q[0]).toBeCloseTo(Math.sin(v * n) * 0.6, 9);
    expect(q[2]).toBeCloseTo(Math.sin(v * n) * 0.8, 9);
    expect(q[3]).toBeCloseTo(Math.cos(v * n), 9);
    expect(quat(3, [0, 0, 0])).toEqual([0, 0, 0, 1]);
  });
});

describe('research 442: the six tables, transcribed (FUN_0057b550 D:L439718-440179)', () => {
  type Row = { bone: string; axis: readonly number[] | null; offset: readonly number[] };
  const tables = (): Record<string, readonly Row[]> => need<Record<string, readonly Row[]>>('RECOIL_BEND_TABLES');
  it('six tables, 21 bones each, in the order FUN_0057b550 applies them (D:L440183-440316)', () => {
    const t = tables();
    expect(Object.keys(t).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [name, rows] of Object.entries(EXPECTED)) expect(t[name]!.map((r) => r.bone), name).toEqual(rows.map((r) => r[0]));
  });
  it.each(Object.keys(EXPECTED))('%s: every axis word and every offset, value for value', (name) => {
    const rows = tables()[name]!;
    EXPECTED[name]!.forEach(([bone, words, offset], i) => {
      const row = rows[i]!;
      if (words === null) expect(row.axis, `${name} ${bone}`).toBeNull();
      else expect(row.axis, `${name} ${bone}`).toEqual(words.map(f32));
      expect(row.offset, `${name} ${bone} offset`).toEqual(offset);
    });
  });
  it('the table for a stance and the hand: stand / crouch / prone x rifle (+0xf79 1) / pistol (2); no gun, none', () => {
    const pick = need<(stance: string, hand: string | null) => readonly Row[] | null>('bendTable');
    expect(pick('stand', 'rifle')).toBe(tables()['stand/rifle']);
    expect(pick('crouch', 'pistol')).toBe(tables()['crouch/pistol']);
    expect(pick('prone', 'rifle')).toBe(tables()['prone/rifle']);
    expect(pick('stand', null)).toBeNull();
    expect(pick('swim', 'rifle')).toBeNull();                      // neither +0x174 nor +0x374 0-2: no pose (D:L439678-439679)
  });
});

describe('research 442: laid on a bone (FUN_003070c0, FUN_003072e0, FUN_00309240)', () => {
  it('the bend first composed before the node\'s rotation, normalised; the offset times v added to its translation', () => {
    const lay = need<(q: readonly number[], t: readonly number[], row: { axis: readonly number[] | null; offset: readonly number[] }, v: number) => { q: number[]; t: number[] }>('layBend');
    const quat = need<(v: number, a: readonly number[]) => number[]>('bendQuat');
    const q0 = [0, Math.sin(0.2), 0, Math.cos(0.2)], t0 = [1, 2, 3];
    const row = { axis: [0.05, 0, 0], offset: [0.1, -0.2, 0.3] };
    const got = lay(q0, t0, row, 2);
    const b = quat(2, row.axis);
    // Hamilton b q0 (FUN_003070c0(bend, node, out))
    const want = [
      b[3]! * q0[0]! + b[0]! * q0[3]! + b[1]! * q0[2]! - b[2]! * q0[1]!,
      b[3]! * q0[1]! - b[0]! * q0[2]! + b[1]! * q0[3]! + b[2]! * q0[0]!,
      b[3]! * q0[2]! + b[0]! * q0[1]! - b[1]! * q0[0]! + b[2]! * q0[3]!,
      b[3]! * q0[3]! - b[0]! * q0[0]! - b[1]! * q0[1]! - b[2]! * q0[2]!,
    ];
    got.q.forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 9));
    expect(got.t[0]).toBeCloseTo(1.2, 9);
    expect(got.t[1]).toBeCloseTo(1.6, 9);
    expect(got.t[2]).toBeCloseTo(3.6, 9);
    const id = lay(q0, t0, { axis: null, offset: [0, 0, 0] }, 2);
    id.q.forEach((c, i) => expect(c).toBeCloseTo(q0[i]!, 9));
  });
});

describe('research 442 ruling B: layBend undone (unlayBend), the bank kept', () => {
  it("a bent node, with the run's bank laid after the bend, comes back to its unbent pose with the bank kept", () => {
    const lay = need<(q: readonly number[], t: readonly number[], row: { axis: readonly number[] | null; offset: readonly number[] }, v: number) => { q: number[]; t: number[] }>('layBend');
    const unlay = need<(q: readonly number[], t: readonly number[], row: { axis: readonly number[] | null; offset: readonly number[] }, v: number, pre?: readonly number[]) => { q: number[]; t: number[] }>('unlayBend');
    const mul = (a: readonly number[], c: readonly number[]): number[] => [
      a[3]! * c[0]! + a[0]! * c[3]! + a[1]! * c[2]! - a[2]! * c[1]!, a[3]! * c[1]! - a[0]! * c[2]! + a[1]! * c[3]! + a[2]! * c[0]!,
      a[3]! * c[2]! + a[0]! * c[1]! - a[1]! * c[0]! + a[2]! * c[3]!, a[3]! * c[3]! - a[0]! * c[0]! - a[1]! * c[1]! - a[2]! * c[2]!,
    ];
    const looked = [0.1, Math.sin(0.3), 0.05, Math.cos(0.3)], n = Math.hypot(...looked), q0 = looked.map((c) => c / n), t0 = [1, 2, 3];
    const row = { axis: [0.03, -0.05, 0.02], offset: [0.1, -0.2, 0.3] }, v = 7;
    const bank = [0, 0, Math.sin(0.04 / 2), Math.cos(0.04 / 2)];
    const laid = lay(q0, t0, row, v);
    const drawn = mul(bank, laid.q);                            // Animator.aim on spinelo: bank x (bend x looked)
    const back = unlay(drawn, laid.t, row, v, bank);
    const want = mul(bank, q0);                                 // the bank kept, the bend gone
    back.q.forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 9));
    back.t.forEach((c, i) => expect(c).toBeCloseTo(t0[i]!, 9));
    const plain = unlay(laid.q, laid.t, row, v);                // no bank: the node's own rotation
    plain.q.forEach((c, i) => expect(c).toBeCloseTo(q0[i]!, 9));
  });
});
