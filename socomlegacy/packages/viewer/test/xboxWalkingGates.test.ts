import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { simMapFromBytes } from '../src/simMap';
import { groundGrid } from '../src/mover';
import type { DoorWire } from '../src/net/protocol';
import { walkingWorld, type WalkingWorldDeps } from '../src/xboxPrototype/walkingWorld';
import { worldChanges } from '../src/xboxPrototype/worldFrame';
import { worldPlacement } from '../src/xboxPrototype/worldPlacement';

/** Disc-data integration, not a rendered or network acceptance claim. Actual
 * MAP-07 GateSpecs move the same hull and numeric placement from real wire
 * fields. No new travel, duration, prediction or round rules are supplied. */
for (const stem of ['MP11', 'MP62']) {
  const path = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, `RUN/${stem}.ZDB`) : '';
  const have = !!path && existsSync(path);
  describe.skipIf(!have)(`raw ${stem} gate adapter${have ? '' : ' (SOCOM_DISC map absent)'}`, () => {
    function setup() {
      const map = simMapFromBytes(new Uint8Array(readFileSync(path)), `RUN/${stem}.ZDB`), grid = groundGrid(map.ground);
      let wire: DoorWire[] = [...(map.doors ?? []).map(() => ({ valve: 0, phase: 255 })), ...map.gates!.map(() => ({ valve: 0, phase: 255 }))];
      let acked: number | null = 41, heardTick = 1000;
      const client = { state: 'open', role: 'player', setWorld: () => {}, doors: () => wire, roundEpoch: () => 1,
        acked: () => acked, heardTick: () => heardTick, lastSeq: () => 41 };
      const walk = { gridOfGround: () => grid, grid: () => grid, feet: () => null, fireAim: () => null,
        mode: () => 'walk', isDead: () => false, isLocked: () => false, actionGateShut: () => false };
      const world = walkingWorld({ map, walk, client: () => client, enabled: () => true, sound: () => null } as unknown as WalkingWorldDeps);
      return { map, world, setWire: (value: DoorWire[]) => { wire = value; }, wire,
        ack: (seq: number | null, tick: number) => { acked = seq; heardTick = tick; } };
    }
    it('follows the actual door-tail pose on the shared hull and renderer placement, then restores the shut leaf', () => {
      const h = setup(), before = h.map.ground.points.slice(), gate = h.map.gates![0]!;
      const binding = worldPlacement({ paths: [gate.path], alternate: false, matrices: Float32Array.from(new Matrix4().elements) });
      const cursor = worldChanges(); h.world.step(1 / 60); cursor.take(h.world.frame);
      h.wire[h.map.doors?.length ?? 0] = { valve: 1, phase: 255 }; h.world.step(1 / 60);
      expect(h.world.report().gates[0]!.offset).toEqual(gate.open);
      expect(h.map.ground.points).not.toEqual(before);
      const moves = cursor.take(h.world.frame); expect(moves.some(op => op.kind === 'move' && op.path === gate.path)).toBe(true);
      expect(binding.apply(moves)).toBe(true); expect(binding.moved).toBe(true);
      expect(Array.from(binding.matrices.slice(12, 15)).some(value => Math.abs(value) > 1)).toBe(true);
      h.wire[h.map.doors?.length ?? 0] = { valve: 0, phase: 255 }; h.world.step(1 / 60);
      expect(h.world.report().gates[0]!.offset).toEqual([0, 0, 0]);
      expect(Array.from(h.map.ground.points).every((value, i) => Math.abs(value - before[i]!) < 0.002)).toBe(true);
      binding.apply(cursor.take(h.world.frame)); expect(binding.matrices[12]).toBeCloseTo(0, 3);
      expect(binding.matrices[13]).toBeCloseTo(0, 3); expect(binding.matrices[14]).toBeCloseTo(0, 3); h.world.dispose();
    });
    it('settles predicted pulls on the actual snapshot acknowledgement and room tick, not local render count', () => {
      const h = setup(), gate = h.map.gates![0]!; h.world.step(1 / 60);
      expect(h.world.gates.press(gate.levers[0]!.action, 41)).toBe(true);
      for (let i = 0; i < 120; i++) h.world.step(1 / 60);
      expect(h.world.report().gates[0]!.offset.some(value => Math.abs(value) > 0.01)).toBe(true);
      h.ack(42, 1001); h.world.step(1 / 60);
      for (let i = 0; i < 120; i++) h.world.step(1 / 60); // Same heard tick cannot expire the room's lead-in.
      expect(h.world.report().gates[0]!.offset.some(value => Math.abs(value) > 0.01)).toBe(true);
      h.ack(42, 2000); h.world.step(1 / 60);
      expect(h.world.report().gates[0]!.offset).toEqual([0, 0, 0]); h.world.dispose();
    });
  });
}
