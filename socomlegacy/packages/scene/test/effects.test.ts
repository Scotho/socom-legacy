import { describe, expect, it } from 'vitest';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import {
  CmdBytes, decodeEffectOp, lightAt, lightRange, NODE_CALLER, decodeEffectProgram, frictionFactor, keyAt, launchDirection, launchMotion, MOTION,
  parseAnimSets, particleColour, particleFade, particleScale, particleTextureAt, sourceVelocity, stepMotion, terminalFactor, tracerRound,
  SOUND_NEW_PLAY, SOUND_PRIORITY_SLOT_READING, ZANIM_COMMAND_NAMES, ZCMD,
  type EffectProgram, type MotionWorld, type ZAnimLight, type ObjectMotion, type ParticleSource,
} from '../src/index';

/**
 * The zAnim effect commands (socomlegacy/docs/research/89): the numbering, the control-flow and state commands decoded from
 * their bytes, `OBJECT_MOTION`'s launch and flight, `PARTICLE_SOURCE`'s keys and fades -- and, on the game's own
 * archives where the fixtures are, the M4A1 SD's `muzzle_m4SD`, `shell_eject` and `shell_smoke_med` read to the
 * numbers the decomp gives them.
 */

/** A command's bytes: the header (type, size) then `payload`. */
function cmd(type: number, payload: number[]): { set: number; cmd: number; bytes: Uint8Array } {
  const bytes = new Uint8Array(4 + payload.length);
  new DataView(bytes.buffer).setUint32(0, (type & 0xffff) | (bytes.length << 18), true);
  bytes.set(payload, 4);
  return { set: 0, cmd: type & 0xff, bytes };
}
const f32 = (v: number): number[] => Array.from(new Uint8Array(Float32Array.of(v).buffer));
const u32 = (v: number): number[] => Array.from(new Uint8Array(Uint32Array.of(v).buffer));

describe('the command numbering', () => {
  it('is FUN_0025bc20\'s registration order, from 1', () => {
    expect(ZANIM_COMMAND_NAMES[ZCMD.IF]).toBe('IF');
    expect(ZANIM_COMMAND_NAMES[ZCMD.OBJECT_MOTION]).toBe('OBJECT_MOTION');
    expect(ZANIM_COMMAND_NAMES[ZCMD.PARTICLE_SOURCE]).toBe('PARTICLE_SOURCE');
    expect(ZANIM_COMMAND_NAMES[ZCMD.SOUND]).toBe('SOUND');                  // research 81's play-sound, 30
    expect(ZANIM_COMMAND_NAMES[ZCMD.LIGHT]).toBe('LIGHT');
    expect(ZANIM_COMMAND_NAMES[ZCMD.CALL_ANIMATION]).toBe('CALL_ANIMATION');
    expect(ZANIM_COMMAND_NAMES[ZCMD.VALVE]).toBe('VALVE');
  });
});

describe('the small commands, from their bytes', () => {
  const names = ['NA', 'anim', 'shell_eject', 'rotate', '.JUMP_WHOOSH'];
  it('CALL_ANIMATION names its animation in the byte at +7', () => {
    expect(decodeEffectOp(cmd(ZCMD.CALL_ANIMATION, [1, 0, 0, 2, ...new Array(12).fill(0)]), names)).toEqual({ op: 'call', anim: 'shell_eject' });
  });
  it('CALL_ANIMATION flag 4 hands the callee the node at +9 as its caller, flag 8 the node at +10 as its place (research 386 §3.3)', () => {
    // `FUN_0025d5c0` D:L107605-107613 (+9, a type-3 context: the callee's NODE_CALLER) and D:L107620-107629 (+10, its
    // world position): Blizzard's `outhouse1` calls `toilet_flypart1` with flags 0x0d and part1 (node 5) at both.
    expect(decodeEffectOp(cmd(ZCMD.CALL_ANIMATION, [0x0d, 0, 0, 2, 0, 5, 5, ...new Array(9).fill(0)]), names))
      .toEqual({ op: 'call', anim: 'shell_eject', caller: 5, place: 5 });
    expect(decodeEffectOp(cmd(ZCMD.CALL_ANIMATION, [0x04, 0, 0, 2, 0, 0xfa, 7, ...new Array(9).fill(0)]), names))
      .toEqual({ op: 'call', anim: 'shell_eject', caller: -6 });
  });
  it("EXECUTE_ACTION (87, set 0) names the action's valve in the u16 at +4; DESTRUCTION_SOURCE (29) its node in the i8 at +4", () => {
    // research 174 s3: 8 bytes, the name index at +4 (Desert Glory's access1: `57 00 20 00 03 00 00 00`, set_access1).
    const exec = cmd(ZCMD.EXECUTE_ACTION, [3, 0, 0, 0]);
    expect(decodeEffectOp(exec, ['NA', 'access1', 'di_good', 'set_access1'])).toEqual({ op: 'executeAction', anim: 'set_access1' });
    // Frostfire's breakapane: `1d 00 42 01 f9 04 ...`, the i8 at +4 is NODE_ROOT (-7); short of 80 bytes, the node alone.
    expect(decodeEffectOp(cmd(ZCMD.DESTRUCTION_SOURCE, [0xf9, 4, 0, 0, ...new Array(12).fill(0)]), names)).toEqual({ op: 'destruction', node: -7 });
    expect(ZANIM_COMMAND_NAMES[ZCMD.DESTRUCTION_SOURCE]).toBe('DESTRUCTION_SOURCE');
  });
  it("DESTRUCTION_SOURCE's 80 bytes: every field FUN_002678f0 hands FUN_00322580, at its offset (LATER 850)", () => {
    // FUN_002678f0 (D:L113383-113421; its registers at 0x2678f0-0x2679c4): +4 the node, +5 the texture's name index,
    // +6 the mode; +8 the colour (the pointer cmd+8); f12 +0x18, f13 +0x4c; the velocity's pairs interleaved -- one end
    // (+0x1c, +0x24, +0x2c), the other (+0x20, +0x28, +0x30); +0x34/+0x38 the life, +0x3c the descriptor's +0x2c,
    // +0x40..+0x48 its +0x30. The values are Fish Hook's and Frostfire's breakapane (identical past the names).
    const payload = [0xf9, 4, 0, 0, ...[40, 40, 43, 0.5].flatMap(f32), ...f32(13), ...[4, -4, 1, -1, 4, -4].flatMap(f32),
      ...[2, 3, 0].flatMap(f32), ...[0, -98, 0].flatMap(f32), ...f32(1)];
    expect(payload.length + 4).toBe(0x50);
    expect(decodeEffectOp(cmd(ZCMD.DESTRUCTION_SOURCE, payload), ['NA', 'wglass', 'breakapane', '.GLS_BRK_MD', 'window01.tif'])).toEqual({
      op: 'destruction', node: -7,
      debris: {
        texture: 'window01.tif', mode: 0, colour: [40, 40, 43, 0.5], size: 13,
        velocityFrom: [4, 1, 4], velocityTo: [-4, -1, -4], life: [2, 3], drag: 0, acceleration: [0, -98, 0], visual9c: 1,
      },
    });
  });
  it('SOUND names its sound in the u16 at +6 (research 81 §6)', () => {
    expect(decodeEffectOp(cmd(ZCMD.SOUND, [0x82, 0, 4, 0, ...new Array(24).fill(0)]), names)).toMatchObject({ op: 'sound', sound: '.JUMP_WHOOSH' });
  });
  it('SOUND carries its own volume: the f32 at +8 with flag 0x10, else 1.0 (FUN_002659c0 112363-112416; research 81 §12)', () => {
    const payload = (flags: number, v: number): number[] => [flags & 0xff, flags >> 8, 4, 0, ...f32(v), ...new Array(20).fill(0)];
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x92, 3)), names)).toMatchObject({ op: 'sound', sound: '.JUMP_WHOOSH', volume: 3 });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x292, 0.6)), names)).toMatchObject({ volume: expect.closeTo(0.6, 6) });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x82, 3)), names)).toMatchObject({ volume: 1 });   // no 0x10: the game's 1.0
  });
  it("SOUND starts a placed voice only with flag 0x80 and neither 0x400 nor 0x800 (FUN_002659c0 112365, 112460-112486)", () => {
    const payload = (flags: number): number[] => [flags & 0xff, flags >> 8, 4, 0, ...new Array(24).fill(0)];
    // The retail flags (research 81 section 6): MP11 gate_openclose1's first SOUND 0x82 starts ~FENCE_GATE; its
    // second, 0x102, only retunes the voice playing (0x80 clear) and starts none; MP11 objectives' MUS_* cues, 0x880,
    // go to the game's one-voice priority slot (FUN_00348dc0 at priority 3, which plays them unplaced, decomp
    // 245376-245420), a slot the viewer does not model: SOUND_PRIORITY_SLOT_READING, a drop.
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x82)), names)).toMatchObject({ op: 'sound', newPlay: true, flags: 0x82 });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x102)), names)).toMatchObject({ op: 'sound', newPlay: false, flags: 0x102 });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x880)), names)).toMatchObject({ op: 'sound', newPlay: false });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x480)), names)).toMatchObject({ op: 'sound', newPlay: false });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x92)), names)).toMatchObject({ op: 'sound', newPlay: true });
  });
  it('names the priority slot drop a reading: 0x400 (priority 1) and 0x800 (priority 3), FUN_002659c0 112480-112486', () => {
    expect(SOUND_PRIORITY_SLOT_READING).toBe(0x400 | 0x800);
    for (const slot of [0x400, 0x800, 0xc00]) expect(SOUND_NEW_PLAY(0x80 | slot)).toBe(false);
    expect(SOUND_NEW_PLAY(0x80)).toBe(true);
    expect(SOUND_NEW_PLAY(0x02)).toBe(false);   // the retune: the one source-backed "starts none" (112365-112390)
  });
  it('an IF\'s conditions: RANDOM_WEIGHT\'s probability, as flash_fire_hider picks its turn', () => {
    const rw = [0x0a, 0, 0x22, 0, ...f32(0.125)];
    expect(decodeEffectOp(cmd(ZCMD.IF, [...u32(1), ...rw]), names)).toEqual({ op: 'if', conditions: [{ kind: 'random', p: 0.125 }] });
  });
  it('WAIT: seconds (the f32 at +8), or frames with flag 0x10', () => {
    expect(decodeEffectOp(cmd(ZCMD.WAIT, [9, 0, 0, 0, ...f32(0.25)]), names)).toEqual({ op: 'wait', seconds: 0.25, range: 0, frames: null });
    expect(decodeEffectOp(cmd(ZCMD.WAIT, [0x10, 0, 0, 0, ...u32(1)]), names)).toEqual({ op: 'wait', seconds: 0, range: 0, frames: 1 });
  });
  it("SOUND's flag 4: the offset at +0x14, the place's start (FUN_002659c0 D:L112423-112426); none without the flag", () => {
    // mp6_battlesounds' distant guns: flags 0x86 at node 1 (the skydome), offset (300, 0, 1000).
    const payload = (flags: number): number[] => [flags, 0, 4, 0, ...new Array(8).fill(0), 1, 0, 0, 0, ...f32(300), ...f32(0), ...f32(1000)];
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x86)), names)).toEqual({ op: 'sound', sound: '.JUMP_WHOOSH', node: 1, volume: 1, flags: 0x86, newPlay: true, offset: [300, 0, 1000] });
    expect(decodeEffectOp(cmd(ZCMD.SOUND, payload(0x82)), names)).toEqual({ op: 'sound', sound: '.JUMP_WHOOSH', node: 1, volume: 1, flags: 0x82, newPlay: true });
  });
  it("WAIT's random form (flag 0x20, FUN_0025ed50 D:L108436-108447): the base at +12 and the range at +16, +16/+20 with 0x10", () => {
    // MP71's seagull_squak1..4 as the disc holds them (flags 0x29): +8 4 (the author's copy of the base), +12 4, +16 9 --
    // the original waits 4 + 9 x U[0,1) s, so 4-13 s. Was: the range read at +12, a 4-8 s wait.
    expect(decodeEffectOp(cmd(ZCMD.WAIT, [0x29, 0, 0, 0, ...f32(4), ...f32(4), ...f32(9)]), names)).toEqual({ op: 'wait', seconds: 4, range: 9, frames: null });
    // +8 not the base: the begin overwrites +8 with base + range x rand, so +8's own value is never read.
    expect(decodeEffectOp(cmd(ZCMD.WAIT, [0x29, 0, 0, 0, ...f32(7), ...f32(1), ...f32(2)]), names)).toEqual({ op: 'wait', seconds: 1, range: 2, frames: null });
    // With 0x10 the pair moves a word on (iVar2 = 2): +16 the base, +20 the range; the frames stay the i32 at +8.
    expect(decodeEffectOp(cmd(ZCMD.WAIT, [0x30, 0, 0, 0, ...u32(3), ...f32(0), ...f32(0.5), ...f32(1.5)]), names))
      .toEqual({ op: 'wait', seconds: 0.5, range: 1.5, frames: 3 });
  });
  it('OBJECT_ROTATE_STATE: node +6, reference +7, flags +4, euler +8', () => {
    const op = decodeEffectOp(cmd(ZCMD.OBJECT_ROTATE_STATE, [1, 0, 3, 0, ...f32(Math.PI / 4), ...f32(0), ...f32(0)]), names);
    expect(op).toMatchObject({ op: 'rotate', node: 3, ref: 0, flags: 1 });
    expect((op as { xyz: number[] }).xyz[0]).toBeCloseTo(Math.PI / 4, 6);
  });
  it("MESSAGE (55): a raw name at +4, or the locale id at +6 instead; the scale at +0xc (FUN_00267760; research 179 s9.10)", () => {
    // MP2's "OBJECTIVE:" (raw, name index 1) and MP72's 7200 (`37 00 42 00 0c 00 20 1c c8 c8 c8 01` + 0.9), as the disc has them.
    const raw = decodeEffectOp(cmd(ZCMD.MESSAGE, [1, 0, 0, 0, 0xc8, 0xc8, 0xc8, 1, ...f32(0.9)]), names);
    expect(raw).toEqual({ op: 'message', text: names[1], locId: null, scale: 0.9 });
    const loc = decodeEffectOp(cmd(ZCMD.MESSAGE, [0x0c, 0, 0x20, 0x1c, 0xc8, 0xc8, 0xc8, 1, ...f32(0.7)]), names);
    expect(loc).toEqual({ op: 'message', text: null, locId: 7200, scale: 0.7 });
  });
  it("EXPRESSION (43) in a condition list is an operator token, in order; a WHILE keeps its condition (MP72 start's elimination tests)", () => {
    const valve = (ref: number, operand: number): number[] => [0x3d, 0, 0x40, 0, ...u32(ref), ...u32(operand), 2, 2, 0, 0];
    const and = [0x2b, 0, 0x22, 0, 2, 0, 0, 0];
    const tokens = [...valve(1, 0), ...and, ...valve(2, 16)];
    const want = [
      { kind: 'valve', valve: names[1], operation: 2, operand: 0 }, { kind: 'operator', operator: 2 }, { kind: 'valve', valve: names[2], operation: 2, operand: 16 },
    ];
    expect(decodeEffectOp(cmd(ZCMD.IF, [...u32(1), ...tokens]), names)).toEqual({ op: 'if', conditions: want });
    expect(decodeEffectOp(cmd(ZCMD.WHILE, [0, 0, 0xb4, 0x06, ...tokens]), names)).toEqual({ op: 'while', forever: false, conditions: want });
    expect(decodeEffectOp(cmd(ZCMD.WHILE, [1, 0, 0, 0]), names)).toEqual({ op: 'while', forever: true });
  });
  it('OBJECT_MOTION_FROM_TO with a position block reads the translation beside the scale slots (research 174 §5, 176 §9.2)', () => {
    // Chain Reaction's shape: flags 9, the u16 at +0x0c points at 0x38, seconds at +0x34, target at block+0x10.
    // The scale slots at +0x38/+0x44 overlap that block and are not the displacement.
    const bytes = new Uint8Array(0x70);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, (ZCMD.OBJECT_MOTION_FROM_TO & 0xffff) | (bytes.length << 18), true);
    view.setUint16(4, 9, true);
    view.setUint16(0x0c, 0x38, true);
    view.setFloat32(0x34, 15, true);
    view.setFloat32(0x48, 0, true);
    view.setFloat32(0x4c, 0, true);
    view.setFloat32(0x50, 230, true);
    view.setFloat32(0x54, 0, true);
    view.setFloat32(0x58, 0, true);
    view.setFloat32(0x5c, 230 / 15, true);
    const op = decodeEffectOp({ set: 0, cmd: ZCMD.OBJECT_MOTION_FROM_TO, bytes }, names);
    expect(op).toMatchObject({ op: 'fromTo', flags: 9, node: 0 });
    if (op.op !== 'fromTo' || !op.translation) throw new Error('translation was not decoded');
    expect(op.seconds).toBeCloseTo(15, 5);
    expect(op.translation.from).toBeNull();
    expect(op.translation.to[2]).toBeCloseTo(230, 4);
    expect(op.translation.rate[2]).toBeCloseTo(230 / 15, 4);
    expect(op.translation.to).not.toEqual(op.to);
  });
  it('OBJECT_MOTION_FROM_TO with no position block stays a scale reading', () => {
    const op = decodeEffectOp(cmd(ZCMD.OBJECT_MOTION_FROM_TO, new Array(0x60).fill(0)), names);
    expect(op).toMatchObject({ op: 'fromTo' });
    expect(op).not.toHaveProperty('translation');
  });
  it('reads past a short command as 0 rather than throwing', () => {
    expect(new CmdBytes(new Uint8Array(4)).f32(100)).toBe(0);
  });
});

describe('OBJECT_MOTION\'s arithmetic (FUN_00262690, FUN_00261370)', () => {
  it('the launch direction is FUN_0025cb00\'s, not normalised', () => {
    const d = launchDirection(180, 30);
    expect(d[0]).toBeCloseTo(0, 9);
    expect(d[1]).toBeCloseTo(1 / 3, 9);
    expect(d[2]).toBeCloseTo(2 / 3, 9);                  // az 180: local +z
    expect(Math.hypot(...d)).toBeCloseTo(0.745, 3);
  });

  it('the terminal-velocity table is 1 rising and falls to 0 at |v| = 1/|k|', () => {
    expect(terminalFactor(5, -1 / 980)).toBe(1);           // rising: index 0
    expect(terminalFactor(-100, -1 / 980)).toBeCloseTo(1 - (Math.exp(1) - 1) / (Math.exp(10) - 1), 9);
    expect(terminalFactor(-980, -1 / 980)).toBeCloseTo(0, 9);
  });

  const casing: ObjectMotion = {
    flags: MOTION.LIFETIME | MOTION.TERMINAL | MOTION.RANDOM_LAUNCH | MOTION.IMPACT_SOUND | MOTION.FLOOR_PROBE | MOTION.LINE_PROBE | MOTION.TUMBLE,
    node: -7, frame: -6, direction: [0, 0, 0], launch: { azimuth: 170, zenith: 30, speed: 25, accel: 0 }, range: { azimuth: 20, zenith: 0, speed: 10, accel: 0 },
    gravityScale: 1, terminal: -1 / 980, callerVelocity: 1, bounce: 0.3, tolerance: 0.35, lifetime: 1.2, refSpeed: 0, sound: null,
    tumble: { rate: 0.5236, accel: -0.0873 }, angular: null,
    materials: [{ material: 25, sound: '.BUL_CASE_METAL', sequence: null, refSpeed: null, bounce: 0.35 }],
  };
  const floor: MotionWorld = {
    segment: (a, b) => (b[1] <= 0 && a[1] > 0 ? { point: [a[0] + (b[0] - a[0]) * (a[1] / (a[1] - b[1])), 0, a[2] + (b[2] - a[2]) * (a[1] / (a[1] - b[1]))], normal: [0, 1, 0], material: 25 } : null),
    floor: (from) => ({ point: [from[0], 0, from[2]], normal: [0, 1, 0], material: 25 }),
  };

  it('launches the casing at 25-35 units a second into its frame, at the -98 gravity', () => {
    const s = launchMotion(casing, [0, 10, 0], null, () => 0, -98, 0.14);
    expect(s.velocity[1]).toBeCloseTo(25 / 3, 6);
    expect(s.velocity[2]).toBeCloseTo(-Math.cos((170 * Math.PI) / 180) * (2 / 3) * 25, 6);
    expect(s.accel).toEqual([0, -98, 0]);
    expect(s.halfHeight).toBeCloseTo(0.07, 9);
    expect(s.tolerance).toBeCloseTo(0.049, 9);
  });

  it('falls, bounces on the metal with its coefficient and its sound, and is done at rest or at 1.2 s', () => {
    const s = launchMotion(casing, [0, 10, 0], null, () => 0.5, -98, 0.14);
    const bounces: string[] = [];
    let t = 0;
    while (!s.done && t < 3) {
      for (const b of stepMotion(casing, s, 1 / 60, floor)) bounces.push(b.entry?.sound ?? 'none');
      t += 1 / 60;
    }
    expect(bounces.length).toBeGreaterThan(0);
    expect(bounces[0]).toBe('.BUL_CASE_METAL');
    expect(t).toBeLessThanOrEqual(1.2 + 1e-6);
    expect(s.position[1]).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.abs(s.euler[0]) + Math.abs(s.euler[2])).toBeGreaterThan(0);   // it tumbled
  });

  it('without a world it flies through, its lifetime its end', () => {
    const s = launchMotion(casing, [0, 10, 0], null, () => 0.5, -98, 0.14);
    let t = 0;
    while (!s.done && t < 3) { stepMotion(casing, s, 1 / 60, null); t += 1 / 60; }
    expect(t).toBeCloseTo(1.2, 1);
    expect(s.position[1]).toBeLessThan(0);
  });
});

describe('PARTICLE_SOURCE\'s keys and fades', () => {
  const src = {
    colours: [[0, 0.4, 0.4, 0.5, 1], [0.1, 0.4, 0.4, 0.5, 1.1], [0.6, 0.4, 0.4, 0.5, 0.05], [1, 0.4, 0.4, 0.5, 0]] as ParticleSource['colours'],
    scales: [[0, 0.1], [0.7, 20], [1, 20]] as ParticleSource['scales'],
    nearFade: null, farFade: [200, 800] as [number, number],
  };
  it('interpolates the keys linearly, clamped at both ends; no colour keys is white fading with its life', () => {
    expect(keyAt(src.scales, -1, 1)).toBeCloseTo(0.1, 6);
    expect(particleScale(src, 0.35)).toBeCloseTo(0.1 + (20 - 0.1) * 0.5, 4);
    expect(particleColour(src, 0.05)[3]).toBeCloseTo(1.05, 6);          // the game's alpha goes over 1
    expect(particleColour({ colours: [] }, 0.25)).toEqual([1, 1, 1, 0.75]);
    expect(particleScale({ scales: [] }, 0.5)).toBe(1);
  });
  it('a life-stepped texture is the last entry whose t is at or under the life fraction (FUN_00328a50, D:L226050-226083)', () => {
    // Frostfire's `firey_flames` flame: fire_hardedge from 0, cloudpuff01 from 0.4, effect_mist from 0.8 (MP2's MZANIM).
    const life = { textures: [{ name: 'fire_hardedge.tif', t: 0 }, { name: 'cloudpuff01.tif', t: 0.4 }, { name: 'effect_mist.tif', t: 0.8 }] };
    expect(particleTextureAt(life, 0)).toBe('fire_hardedge.tif');
    expect(particleTextureAt(life, 0.39)).toBe('fire_hardedge.tif');
    expect(particleTextureAt(life, 0.4)).toBe('cloudpuff01.tif');
    expect(particleTextureAt(life, 0.79)).toBe('cloudpuff01.tif');
    expect(particleTextureAt(life, 0.8)).toBe('effect_mist.tif');
    expect(particleTextureAt(life, 2)).toBe('effect_mist.tif');
    // Below the first key the index clamps to 0 (D:L226075-226076); no list, no texture (D:L226060-226061).
    expect(particleTextureAt({ textures: [{ name: 'a.tif', t: 0.5 }, { name: 'b.tif', t: 0.7 }] }, 0.1)).toBe('a.tif');
    expect(particleTextureAt({ textures: [] }, 0.5)).toBeNull();
  });
  it('fades on squared distance across the far pair', () => {
    expect(particleFade(src, 100 ** 2)).toBe(1);
    expect(particleFade(src, 900 ** 2)).toBe(0);
    expect(particleFade(src, 500 ** 2)).toBeCloseTo((800 ** 2 - 500 ** 2) / (800 ** 2 - 200 ** 2), 9);
  });
  it('the friction factor is FUN_003282b0\'s 1/P(k dt), about exp(-k dt / 2) when small', () => {
    expect(frictionFactor(0, 1)).toBe(1);
    expect(frictionFactor(0.1, 0.1)).toBeCloseTo(Math.exp(-0.005), 4);
    expect(frictionFactor(60, 1 / 60)).toBeLessThan(1);
  });
  it('a velocity from the context: the normal, the round\'s direction made a unit, or that reflected', () => {
    const ctx = { velocity: [0, 0, -10] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };
    expect(sourceVelocity('normal', [0, 0, 0], 5, false, ctx)).toEqual([0, 0, 5]);
    expect(sourceVelocity('velocity', [0, 0, 0], 2, true, ctx)).toEqual([0, 0, -2]);
    expect(sourceVelocity('reflected', [0, 0, 0], 2, true, ctx)).toEqual([0, 0, 2]);
    expect(sourceVelocity('fixed', [1, 2, 3], 9, false, ctx)).toEqual([1, 2, 3]);
  });
});

describe('the light pass (the VU1 handler at 0x23d8)', () => {
  it('falls off with the light height over the surface and is gated by the side it faces', () => {
    expect(lightAt([0, 10, 0], [0, 1, 0], [0, 100])).toEqual({ f: 0.5 * 0.9, gate: 1 });
    expect(lightAt([0, 150, 0], [0, 1, 0], [0, 100]).f).toBe(0);
    expect(lightAt([0, -10, 0], [0, 1, 0], [0, 100]).gate).toBe(0);  // behind the surface
    expect(lightAt([0, 0.5, 0], [0, 1, 0], [0, 100]).gate).toBe(0.5);
  });
});

describe('the tracers (FUN_003cb1a0, FUN_003c5ac0, FUN_003cabe0)', () => {
  it('every fourth round of a tracer weapon, never the suppressed ones', () => {
    expect([1, 2, 3, 4, 5, 8].map((r) => tracerRound(54, r))).toEqual([false, false, false, true, false, true]);   // M4A1
    expect([4, 8].map((r) => tracerRound(62, r))).toEqual([false, false]);                                       // M4A1 SD
    expect(tracerRound(10, 4)).toBe(false);                                                                       // a pistol
  });
});

const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`the M4A1 SD's muzzle effect on Frostfire's CZANIM${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const programs = new Map<string, EffectProgram>();
  if (MP2) {
    const toc = parseZdb(MP2);
    for (const member of ['CZANIM.ZAR', 'MZANIM.ZAR']) {
      for (const set of parseAnimSets(Zar.parse(zdbMember(MP2, toc, member))).sets) for (const a of set.anims) if (!programs.has(a.name)) programs.set(a.name, decodeEffectProgram(a));
    }
  }
  const ops = (name: string) => programs.get(name)!.sequences.flatMap((s) => s.ops);

  it('muzzle_m4SD calls shell_eject and shell_smoke_med; muzzle_m4 adds flash_fire_hider; the _zoom variants', () => {
    expect(ops('muzzle_m4SD')).toEqual([{ op: 'call', anim: 'shell_eject' }, { op: 'call', anim: 'shell_smoke_med' }]);
    expect(ops('muzzle_m4').map((o) => (o.op === 'call' ? o.anim : o.op))).toEqual(['shell_eject', 'flash_fire_hider', 'shell_smoke_med']);
    expect(ops('muzzle_m4SD_zoom').map((o) => (o.op === 'call' ? o.anim : o.op))).toEqual(['zoom_fire_silent', 'shell_smoke_med']);
    expect(ops('muzzle_m4_zoom').map((o) => (o.op === 'call' ? o.anim : o.op))).toEqual(['zoom_flash_fire', 'shell_smoke_med']);
  });

  it('shell_eject: 170-190 degrees, 30 up, 25-35 a second, -98 x 1, bounce 0.3, 1.2 s, the per-material table', () => {
    const [full, cheap] = ops('shell_eject').filter((o) => o.op === 'motion').map((o) => (o as { motion: ObjectMotion }).motion);
    expect(full!.flags).toBe(0x0cf3);
    expect(full!.launch).toEqual({ azimuth: 170, zenith: 30, speed: 25, accel: 0 });
    expect(full!.range).toEqual({ azimuth: 20, zenith: 0, speed: 10, accel: 0 });
    expect(full!.gravityScale).toBe(1);
    expect(full!.bounce).toBeCloseTo(0.3, 6);
    expect(full!.lifetime).toBeCloseTo(1.2, 6);
    expect(full!.tumble!.rate).toBeCloseTo(Math.PI / 6, 4);
    expect(full!.materials.map((m) => [m.material, m.sound, +m.bounce!.toFixed(2)])).toEqual([
      [25, '.BUL_CASE_METAL', 0.35], [26, '.BUL_CASE_METAL', 0.35], [7, '.BUL_CAS_STONE', 0.25], [22, '.BUL_CAS_STONE', 0.25],
      [4, '.BUL_CAS_DIRT', 0.1], [8, '.BUL_CAS_DIRT', 0.15], [5, '.BUL_CAS_SAND', 0.15], [19, '.BUL_CAS_WOOD', 0.27], [20, '.BUL_CAS_WOOD', 0.27],
    ]);
    expect(cheap!.flags).toBe(0x0c13);
    expect(cheap!.lifetime).toBeCloseTo(0.7, 6);
    expect(cheap!.materials).toEqual([]);
    // The valve around them: bullet_ejecting counted up, tested under 5.
    expect(ops('shell_eject')[0]).toEqual({ op: 'valve', valve: 'bullet_ejecting', operation: 0x0c, operand: 1 });
  });

  it('tracer_ally_anim and tracer_enemy_anim are the redpuffs source on effect_spark01, then a 0.3 s wait; Frostfire has no tracer_anim', () => {
    expect(programs.has('tracer_anim')).toBe(false);
    for (const name of ['tracer_ally_anim', 'tracer_enemy_anim']) {
      const particles = ops(name).filter((o) => o.op === 'particles');
      expect(particles.length, name).toBeGreaterThan(0);
      for (const p of particles) {
        const source = (p as { source: ParticleSource }).source;
        expect(source.name, name).toBe('redpuffs');
        expect(source.textures.map((t) => t.name.toLowerCase()), name).toEqual(['effect_spark01.tif']);
      }
      const wait = ops(name).find((o) => o.op === 'wait');
      expect(wait && wait.op === 'wait' ? wait.seconds : null, name).toBeCloseTo(0.3, 5);
    }
  });

  it('shell_smoke_med\'s source is switched off in the data (flags A 0x37ffbfd1: bit 1 set, bit 2 clear)', () => {
    const src = ops('shell_smoke_med').find((o) => o.op === 'particles') as { source: ParticleSource };
    expect(src.source.flagsA).toBe(0x37ffbfd1);
    expect(src.source.setActive).toBe(false);
    expect(src.source.name).toBe('blue_smoke01');
    expect(src.source.texture).toBe('cloudpuff01.tif');
    expect(src.source.lifetime.map((v) => +v.toFixed(2))).toEqual([0.5, 1]);
    // shell_smoke_big, the same role, is on.
    const big = ops('shell_smoke_big').find((o) => o.op === 'particles') as { source: ParticleSource };
    expect(big.source.setActive).toBe(true);
  });

  it('the lights: light_flash_large adds a 100-190 spot shrinking to nothing by 0.5 s; zoom_flash_fire is at the caller', () => {
    const big = ops('light_flash_large').find((o) => o.op === 'light') as { light: ZAnimLight };
    expect(big.light.blend).toBe(0x48);                               // additive
    expect(big.light.atContext).toBe(true);
    expect(big.light.rgb.map((v) => +v.toFixed(2))).toEqual([214.2, 242.25, 216.75]);
    expect(big.light.opacity).toBe(64);
    expect(big.light.duration).toBe(1);
    expect(lightRange(big.light, 0)).toEqual([100, 190]);
    expect(lightRange(big.light, 0.25)).toEqual([50, 95]);
    expect(lightRange(big.light, 0.6)).toEqual([0, 0]);
    const muzzle = ops('zoom_flash_fire').find((o) => o.op === 'light') as { light: ZAnimLight };
    expect(muzzle.light.node).toBe(NODE_CALLER);
    expect(muzzle.light.blend).toBe(0x44);
    expect(muzzle.light.ranges.map((k) => k.map((v) => +v.toFixed(2)))).toEqual([[0, 5, 12], [0.05, 15, 60], [0.1, 0, 0]]);
  });

  it('FRAG_sparks throws its spark node by a fixed launch: +0x54 is the direction, block A the speed and the pull', () => {
    const m = ops('FRAG_sparks').find((o) => o.op === 'motion') as { motion: ObjectMotion };
    expect(m.motion.flags).toBe(0x0b);
    expect(m.motion.direction.map((v) => +v.toFixed(3))).toEqual([0, 0.556, -0.444]);
    const s = launchMotion(m.motion, [0, 0, 0], null, () => 0, -98, 0);
    expect(s.velocity).toEqual([0, 0, 0]);                           // speed 0
    expect(s.accel[1]).toBeCloseTo(0.5556 * -200 - 98, 1);           // pulled along the direction by -200, and gravity
    expect(s.accel[2]).toBeCloseTo(-0.4444 * -200, 1);
  });

  it('bullet_hit_metal_thick sparks (streaked, reflected off the surface); bullet_hit_asphalt calls bullet_hit_stone', () => {
    const sparks = ops('bullet_hit_metal_thick').filter((o) => o.op === 'particles').map((o) => (o as { source: ParticleSource }).source)
      .find((s) => s.name === 'sparks')!;
    expect(sparks.type).toBe(3);
    expect(sparks.baseFrom).toBe('reflected');
    expect(sparks.atContext).toBe(true);
    expect(sparks.texture).toBe('effect_spark01.tif');
    expect(ops('bullet_hit_asphalt')).toEqual([{ op: 'call', anim: 'bullet_hit_stone' }]);
  });
});

describe('OBJECT_MOTION_FROM_TO position block (research 95 §1.5, 174 §5, 175 §5.3)', () => {
  /** A command image: fields at the offsets `decodeEffectOp` reads, the 4-byte header left empty. */
  function motion(flags: number, fill: (v: DataView) => void, length = 100): { set: number; cmd: number; bytes: Uint8Array } {
    const bytes = new Uint8Array(length);
    const v = new DataView(bytes.buffer);
    v.setUint16(4, flags, true);
    v.setInt8(6, 1);
    v.setFloat32(0x34, 3, true);
    fill(v);
    return { set: 0, cmd: ZCMD.OBJECT_MOTION_FROM_TO, bytes };
  }
  const vec = (v: DataView, o: number, x: number, y: number, z: number): void => {
    v.setFloat32(o, x, true); v.setFloat32(o + 4, y, true); v.setFloat32(o + 8, z, true);
  };

  it('flags 9 read the position block: relative target (-20, 0, 0), not the scale slot the old read printed as (0, -20, 0)', () => {
    const op = decodeEffectOp(motion(9, (v) => {
      v.setUint16(0xc, 0x38, true);
      vec(v, 0x3c, 0, 0, 0);          // from at P+4
      vec(v, 0x48, -20, 0, 0);        // to at P+0x10
    }), []);
    // Flag 1 (relative) stays on `flags`; flag 2 clear, so `from` is the node's place now (null).
    expect(op).toMatchObject({
      op: 'fromTo', node: 1, flags: 9, seconds: 3,
      translation: { from: null, to: [-20, 0, 0] },
    });
    // A vec3 at +0x44 is (from.z, to.x, to.y): the misread the audits record for this target.
    const view = new DataView(motion(9, (v) => { v.setUint16(0xc, 0x38, true); vec(v, 0x3c, 0, 0, 0); vec(v, 0x48, -20, 0, 0); }).bytes.buffer);
    expect([view.getFloat32(0x44, true), view.getFloat32(0x48, true), view.getFloat32(0x4c, true)]).toEqual([0, -20, 0]);
  });

  it('flags 9 read Enowapi\'s open target (0, 35, 0) over 3 s', () => {
    const op = decodeEffectOp(motion(9, (v) => {
      v.setUint16(0xc, 0x38, true);
      vec(v, 0x48, 0, 35, 0);
    }), []);
    expect(op).toMatchObject({
      op: 'fromTo', flags: 9, seconds: 3,
      translation: { from: null, to: [0, 35, 0] },
    });
  });

  // The begin reads the block whenever +0xc is non-zero (`FUN_0025fe70` D:L109101-109103), whatever the flags: the
  // scale and the rotation stay as read beside it (B135's decode, #337; was #427's flag-0x8 rule, merged away).
  it('flags 0x300 stay a scale from +0x38 to +0x44; +0xc set, its block is read beside it', () => {
    const op = decodeEffectOp(motion(0x300, (v) => {
      v.setUint16(0xc, 0x38, true);
      vec(v, 0x38, 1, 1, 1);
      vec(v, 0x44, 2, 2, 2);
    }), []);
    expect(op).toMatchObject({ op: 'fromTo', flags: 0x300, from: [1, 1, 1], to: [2, 2, 2] });
    expect(op).toHaveProperty('translation');
  });

  it('flags 0x61 stay a door rotation; +0xc at 0, no position block', () => {
    const op = decodeEffectOp(motion(0x61, (v) => { vec(v, 0x48, -20, 0, 0); }), []);
    expect(op).toMatchObject({ op: 'fromTo', flags: 0x61 });
    expect(op).toHaveProperty('rotation');
    expect(op).not.toHaveProperty('translation');
  });
});
