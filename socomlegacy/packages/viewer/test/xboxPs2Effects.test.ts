import { describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import { buildGrid, DEFAULT_RIFLE, type WorldPoly } from '@s2u/scene';
import { Fire, MAX_DECALS, type MarkTable } from '../src/fire';
import { MarkClipper } from '../src/markClip';
import { applyXboxPs2Effects, XBOX_PS2_MARKS_OFF_HELD } from '../src/xboxPs2Effects';

function gun() {
  const wall: WorldPoly = { modelName: 'worldmodel', path: 'wall', region: 0, ditype: 2, material: 25,
    ptcount: 4, cameratype: 0, points: Float32Array.from([-50, 0, -30, 50, 0, -30, 50, 50, -30, -50, 50, -30]) };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [], [], [wall], [{ modelName: 'worldmodel', path: 'wall', first: 0, count: 1 }]);
  let seed = 17;
  const random = vi.fn(() => (seed = (seed * 9301 + 49297) % 233280) / 233280);
  return { random, fire: new Fire({ grid: () => grid, aim: () => ({ eye: [0, 20, 0], far: [0, 20, -1000] }) }, DEFAULT_RIFLE, undefined, random) };
}

const row = { set: 'S', material: 'METAL_THICK', texture: 'mark.tif', minSize: 1, maxSize: 1.8 };
const remoteRound = (fire: Fire, n = 1) => fire.drawRound([0, 20, 0], [0, 0, -1], 100, 0, DEFAULT_RIFLE.id, n);

describe('Xbox PS2 bullet holes off (authorized browser adaptation)', () => {
  it.each(['fallback', 'table', 'clip', 'table + clip', 'no row'] as const)(
    '%s: skips all mark work while retaining remote hits, own shots, ammunition and random sequence', (mode) => {
      const normal = gun(), reduced = gun();
      const bitmap = vi.fn(() => null), shade = vi.fn(() => null);
      const clipper = new MarkClipper(new Group());
      const clip = vi.spyOn(clipper, 'clip');
      const normalTable: MarkTable = { row: () => mode === 'no row' ? null : row, bitmap: () => null };
      const reducedTable: MarkTable = { ...normalTable, bitmap };
      for (const g of [normal, reduced]) {
        if (mode.includes('table') || mode === 'no row') g.fire.setMarks(g === reduced ? reducedTable : normalTable);
        if (mode.includes('clip')) g.fire.setClip(g === reduced ? clipper : new MarkClipper(new Group()));
      }
      reduced.fire.setShade(shade);
      reduced.fire.setDecalLimit(0);
      for (let i = 0; i < 200; i++) expect(remoteRound(reduced.fire, i)).toEqual(remoteRound(normal.fire, i));
      // Alternating random values expose any change in the shared recoil/mark random stream.
      for (let i = 0; i < 20; i++) {
        const expected = normal.fire.shoot();
        expect(expected?.hit).toBeTruthy();
        expect(reduced.fire.shoot()).toEqual(expected);
        normal.fire.update(1); reduced.fire.update(1);
      }
      expect(reduced.fire.decalMeshes()).toHaveLength(0);
      expect(reduced.fire.state().magazine).toEqual(normal.fire.state().magazine);
      expect(reduced.random.mock.calls.length).toBe(normal.random.mock.calls.length);
      expect(reduced.random()).toBe(normal.random());
      expect(bitmap).not.toHaveBeenCalled();
      expect(shade).not.toHaveBeenCalled();
      expect(clip).not.toHaveBeenCalled();
      normal.fire.dispose(); reduced.fire.dispose();
    },
  );

  it('clears existing marks and deferred clips, stays off after map reset, and restores marks on re-enable', () => {
    const { fire } = gun();
    remoteRound(fire);
    expect(fire.decalMeshes()).toHaveLength(1);
    const clipper = new MarkClipper(new Group());
    const clip = vi.spyOn(clipper, 'clip');
    fire.setClip(clipper);
    remoteRound(fire); // No drawn wall yet: queues a deferred clip.
    expect(clip).toHaveBeenCalled();
    const magazine = fire.state().magazine;
    fire.setDecalLimit(0);
    clip.mockClear();
    fire.update(1);
    expect(clip).not.toHaveBeenCalled();
    expect(fire.decalMeshes()).toHaveLength(0);
    expect(fire.state().magazine).toEqual(magazine);
    fire.reset();
    remoteRound(fire);
    expect(clip).not.toHaveBeenCalled();
    expect(fire.decalMeshes()).toHaveLength(0);
    fire.setClip(null);
    fire.setDecalLimit(MAX_DECALS);
    remoteRound(fire);
    expect(fire.decalMeshes()).toHaveLength(1);
    fire.dispose();
  });

  // XBOX-INTEGRATE (the main controller's ruling, 2026-11-20): the omission is held for the owner (XBOX_PS2_MARKS_OFF_HELD),
  // so the Xbox's PS2 picture keeps its bullet marks too, as every class and picture does.
  it('while held for the owner, every class and picture keeps its bullet marks, the Xbox PS2 picture included', () => {
    expect(XBOX_PS2_MARKS_OFF_HELD).toBe(true);
    const fire = { setDecalLimit: vi.fn() };
    applyXboxPs2Effects({ fire }, 'xbox', 'ps2');
    expect(fire.setDecalLimit).toHaveBeenLastCalledWith(MAX_DECALS);
    for (const [device, picture] of [['xbox', 'modern'], ['standard', 'ps2'], ['touch', 'ps2']] as const) {
      applyXboxPs2Effects({ fire }, device, picture);
      expect(fire.setDecalLimit).toHaveBeenLastCalledWith(MAX_DECALS);
    }
  });
});
