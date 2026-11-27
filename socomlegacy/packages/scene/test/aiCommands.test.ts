import { describe, expect, it } from 'vitest';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { AI_COMMAND_NAMES, decodeEffectOp, decodeEffectProgram, parseAnimSets, type EffectOp, type EffectProgram } from '../src';

/**
 * The `ai` namespace's commands in a map's zAnim programs (set 2; socomlegacy/docs/research/92-doors.md section 2, research
 * 214 section 8): `FUN_0026a8e0` splits a command's name at `::` (D:L115284-115295), so a command's high byte is its
 * namespace -- 0 the base set, 1 `ui`, 2 `ai` -- and its low byte its place in `FUN_005de320`'s registrations
 * (D:L493405-493471), from 1 after the namespace's `Reserved` 0: `COMM` 1 ... `EVENT` 5 ... `MOVE` 16, `PAINT` 17 ...
 * `ANIMATE` 20 ... `SELECT` 23 ... `SETANIMSET` 25, `SIGNAL` 26 ... `WAIT` 34.
 *
 * `ai::ANIMATE` (parser `FUN_005d3c80` D:L487461-487553, begin `FUN_005d3740` D:L487286-487458, tick `FUN_005d2f30`
 * D:L487009-487284) pushes an anim type on the actor that started the program (the tag-1 context, `FUN_002b44e0`'s
 * `actor+0x3b0`): the type at +0x30 (one, the u16 count at +0x20 is 1), the pre-wait at +8 (its random range +0xc) and
 * the post-wait at +0x10 (its range +0x14) -- the begin draws both into the runtime counters +0x18 / +0x1c -- the flags
 * byte +0x23 with `blocking` at bit 1 (the tick's test, D:L487262), `select` at +4. The doors' `open` and `close` push
 * type 63, `Open door` of the ELF's static type table at 0x661060 (`FUN_005e3ff0`), after a 0 s pre-wait, and hold the
 * sequence 0.25 s after it before the valve flips and the leaf swings.
 */

const MP2 = fixture('RUN/MP2.ZDB');

function doorProgram(): EffectProgram {
  const toc = parseZdb(MP2!);
  for (const set of parseAnimSets(Zar.parse(zdbMember(MP2!, toc, 'MZANIM.ZAR'))).sets) {
    for (const a of set.anims) if (a.name === 'singleDoor_right') return decodeEffectProgram(a);
  }
  throw new Error('singleDoor_right not in MP2 MZANIM.ZAR');
}

describe('the ai namespace (set 2): the names in FUN_005de320\'s order', () => {
  it('Reserved 0, COMM 1, EVENT 5, MOVE 16, PAINT 17, ANIMATE 20, SELECT 23, SETANIMSET 25, SIGNAL 26, WAIT 34', () => {
    expect(AI_COMMAND_NAMES[0]).toBe('Reserved');
    expect(AI_COMMAND_NAMES[1]).toBe('ai::COMM');
    expect(AI_COMMAND_NAMES[5]).toBe('ai::EVENT');
    expect(AI_COMMAND_NAMES[16]).toBe('ai::MOVE');
    expect(AI_COMMAND_NAMES[17]).toBe('ai::PAINT');
    expect(AI_COMMAND_NAMES[20]).toBe('ai::ANIMATE');
    expect(AI_COMMAND_NAMES[23]).toBe('ai::SELECT');
    expect(AI_COMMAND_NAMES[25]).toBe('ai::SETANIMSET');
    expect(AI_COMMAND_NAMES[26]).toBe('ai::SIGNAL');
    expect(AI_COMMAND_NAMES[34]).toBe('ai::WAIT');
    expect(AI_COMMAND_NAMES).toHaveLength(35);
  });

  it('an undecoded set-2 command is named by the namespace (`ai::EVENT`), not by its number', () => {
    expect(decodeEffectOp({ set: 2, cmd: 5, bytes: new Uint8Array(36) }, ['NA'])).toEqual({ op: 'other', cmd: 5, name: 'ai::EVENT' });
    expect(decodeEffectOp({ set: 2, cmd: 26, bytes: new Uint8Array(36) }, ['NA'])).toEqual({ op: 'other', cmd: 26, name: 'ai::SIGNAL' });
  });
});

describe('ai::ANIMATE decoded (FUN_005d3c80 / FUN_005d3740)', () => {
  // Frostfire's `singleDoor_right` `open`, command 2, as the disc holds it (research 92 section 2; `tools/dump-effects.ts`).
  const DOOR_ANIMATE = Uint8Array.from([
    0x14, 0x02, 0xd1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00,
    0x3f, 0x00, 0x00, 0x00,
  ]);

  it('the door\'s: type 63 (Open door), pre-wait 0, post-wait 0.25 s, not blocking, select 0', () => {
    expect(decodeEffectOp({ set: 2, cmd: 20, bytes: DOOR_ANIMATE }, ['NA'])).toEqual({
      op: 'aiAnimate', type: 63, prewait: 0, postwait: 0.25, blocking: false, select: 0,
    });
  });

  it('the pre-wait at +8, the post-wait at +0x10, blocking at bit 1 of +0x23 (the parser\'s `blocking`; bit 0 is `skip_end`)', () => {
    const b = Uint8Array.from(DOOR_ANIMATE);
    new DataView(b.buffer).setFloat32(8, 1.5, true);
    new DataView(b.buffer).setFloat32(0x10, 8.4, true);
    b[0x23] = 0x02;
    b[0x30] = 0x11; b[0x31] = 0x01;                               // type 0x111, Defusebomb begin (research 214 section 8)
    expect(decodeEffectOp({ set: 2, cmd: 20, bytes: b }, ['NA'])).toEqual({
      op: 'aiAnimate', type: 0x111, prewait: 1.5, postwait: Math.fround(8.4), blocking: true, select: 0,
    });
    b[0x23] = 0x01;                                               // skip_end alone: not blocking
    expect((decodeEffectOp({ set: 2, cmd: 20, bytes: b }, ['NA']) as { blocking: boolean }).blocking).toBe(false);
  });

  it.skipIf(!MP2)(`Frostfire's singleDoor_right: open and close each MOVE, ANIMATE 63 for 0.25 s, then the valve, the sound and the swing${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const program = doorProgram();
    const kinds = (name: string): string[] => program.sequences.find((s) => s.name === name)!.ops.map((o: EffectOp) => (o.op === 'other' ? o.name : o.op));
    expect(kinds('open')).toEqual(['aiMove', 'aiAnimate', 'valve', 'ai::EVENT', 'sound', 'fromTo']);
    expect(kinds('close')).toEqual(['aiMove', 'aiAnimate', 'valve', 'fromTo', 'sound']);
    for (const name of ['open', 'close']) {
      const animate = program.sequences.find((s) => s.name === name)!.ops.find((o) => o.op === 'aiAnimate');
      expect(animate, name).toEqual({ op: 'aiAnimate', type: 63, prewait: 0, postwait: 0.25, blocking: false, select: 0 });
    }
  });
});

/**
 * LATER 1206 (research 428 s8.4-s8.5; reading, pending review): `ai::MOVE` (set 2 command 16; 44 bytes) decoded. The
 * parser `FUN_005d64b0` (D:L488996-489058) allocates 0x2c bytes and fills: +4 `select` (the actor's tag-1 index), +8 `pos`
 * (three f32), +0x14 `dir` (three f32), +0x20 `dist` (f32), +0x24 `node` (the node reference), +0x28 the mode in its low
 * nibble (1 `node`, 2, 3, 4) with `blocking` at bit 5 (0x20). The begin `FUN_005d5d00` (D:L488725-488994) reads them so.
 */
describe('ai::MOVE decoded (FUN_005d64b0 / FUN_005d5d00)', () => {
  function moveBytes(o: { select: number; pos: [number, number, number]; dir: [number, number, number]; dist: number; node: number; flags: number }): Uint8Array {
    const b = new Uint8Array(44), v = new DataView(b.buffer);
    b[0] = 0x10; b[1] = 0x02; b[2] = 0xb0;
    v.setInt32(4, o.select, true);
    o.pos.forEach((x, k) => v.setFloat32(8 + 4 * k, x, true));
    o.dir.forEach((x, k) => v.setFloat32(0x14 + 4 * k, x, true));
    v.setFloat32(0x20, o.dist, true);
    v.setInt32(0x24, o.node, true);
    b[0x28] = o.flags;
    return b;
  }

  it('the mode in the low nibble of +0x28, blocking at its bit 5, the node at +0x24, dist +0x20, pos +8, dir +0x14, select +4', () => {
    expect(decodeEffectOp({ set: 2, cmd: 16, bytes: moveBytes({ select: 0, pos: [0, 0, -13], dir: [0, 0, -1], dist: 18, node: 0xfa, flags: 0x01 }) }, ['NA'])).toEqual({
      op: 'aiMove', mode: 1, node: 0xfa, dist: 18, pos: [0, 0, -13], dir: [0, 0, -1], blocking: false, select: 0,
    });
    expect(decodeEffectOp({ set: 2, cmd: 16, bytes: moveBytes({ select: 2, pos: [1, 2, 3], dir: [0, 1, 0], dist: 4, node: 7, flags: 0x24 }) }, ['NA'])).toEqual({
      op: 'aiMove', mode: 4, node: 7, dist: 4, pos: [1, 2, 3], dir: [0, 1, 0], blocking: true, select: 2,
    });
  });

  it.skipIf(!MP2)(`Frostfire's singleDoor_right: open's and close's MOVE are mode 1, the door's node, 18 u, not blocking on the disc${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const program = doorProgram();
    for (const name of ['open', 'close']) {
      const move = program.sequences.find((s) => s.name === name)!.ops.find((o) => o.op === 'aiMove');
      expect(move, name).toMatchObject({ op: 'aiMove', mode: 1, dist: 18, blocking: false, select: 0 });
      console.log(`LATER 1206 MP2 singleDoor_right ${name}: ${JSON.stringify(move)}`);
    }
  });
});
