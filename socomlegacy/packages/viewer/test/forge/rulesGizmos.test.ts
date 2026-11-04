import { describe, expect, it, vi } from 'vitest';
import { Box3, Object3D, type LineBasicMaterial, type LineSegments } from 'three';

/**
 * FCW-32 step 4 (FUI.R23 D4; product track, a browser adaptation with no original): a layout's zones, markers and
 * spawners as wireframes in the editor's scene -- a cylinder zone at its radius and height about `at` (the room's own
 * test, `match/src/creator/rules/host.ts`), a box at its size turned by its yaw, a marker a post and its label, a spawner
 * an arrow along its facing in its side's colour -- each by the planner's reference (`zone:<id>`). The page shows the
 * group in Build only (`./pageRulesPanel.test.ts`).
 */
const at = (name: string): string => `../../src/forge/${name}`;
const gizmos = () => import(/* @vite-ignore */ at('rulesGizmos')) as Promise<typeof import('../../src/forge/rulesGizmos')>;

const boxOf = (o: Object3D): Box3 => { o.updateWorldMatrix(true, true); return new Box3().setFromObject(o); };
const near = (b: Box3, min: number[], max: number[]): void => {
  [b.min.x, b.min.y, b.min.z].forEach((v, i) => expect(v).toBeCloseTo(min[i]!, 3));
  [b.max.x, b.max.y, b.max.z].forEach((v, i) => expect(v).toBeCloseTo(max[i]!, 3));
};

describe('FCW-32 step 4: the rules entities drawn in the editor (FUI.R23 D4)', () => {
  it('a zone\'s volume at its size, a marker\'s post and label, a spawner\'s arrow along its facing in its side\'s colour', async () => {
    const { createRulesGizmos, RULES_GIZMO_SIZE_ADAPTATION: S, RULES_GIZMO_COLOUR_ADAPTATION: C } = await gizmos();
    const label = vi.fn(() => new Object3D());
    const g = createRulesGizmos({ label });
    g.draw({
      zones: [
        { id: 'vault', shape: 'cylinder', at: [100, 20, -40], radius: 50, height: 30 },
        { id: 'yard', shape: 'box', at: [0, 0, 0], size: [20, 10, 40], yaw: Math.PI / 2 },
      ],
      markers: [{ id: 'flag', at: [5, 0, 5], yaw: 0 }],
      spawners: [
        { id: 'blue', source: 'player', team: 'B', at: [0, 0, 0], yaw: Math.PI / 2, radius: 30 },
        { id: 'reds', source: 'npc', side: 'terrorist', type: 0, at: [0, 0, 0], yaw: 0, radius: 0 },
      ],
    });
    expect(g.ids()).toEqual(['zone:vault', 'zone:yard', 'marker:flag', 'spawner:blue', 'spawner:reds']);
    expect(g.group.children.map((c) => c.name)).toEqual(g.ids());
    near(boxOf(g.group.getObjectByName('zone:vault')!), [50, 5, -90], [150, 35, 10]);
    near(boxOf(g.group.getObjectByName('zone:yard')!), [-20, -5, -10], [20, 5, 10]);            // 20 x 40 turned a quarter
    const flag = g.group.getObjectByName('marker:flag')!;
    expect(boxOf(flag.getObjectByName('post')!).max.y).toBeCloseTo(S.post, 3);
    expect(label).toHaveBeenCalledWith('flag', C.marker);
    expect(flag.getObjectByName('label')).toBeTruthy();
    // The arrow along -z turned by the yaw: a quarter turn points it along -x.
    const blue = g.group.getObjectByName('spawner:blue')!;
    const arrow = blue.getObjectByName('arrow') as LineSegments;
    expect(boxOf(arrow).min.x).toBeCloseTo(-S.arrow, 3);
    expect((arrow.material as LineBasicMaterial).color.getHex()).toBe(C.B);
    expect(blue.getObjectByName('spread')).toBeTruthy();
    const reds = g.group.getObjectByName('spawner:reds')!;
    expect(((reds.getObjectByName('arrow') as LineSegments).material as LineBasicMaterial).color.getHex()).toBe(C.terrorist);
    expect(boxOf(reds.getObjectByName('arrow')!).min.z).toBeCloseTo(-S.arrow, 3);
    expect(reds.getObjectByName('spread')).toBeUndefined();
  });

  it('the picked one in the picked colour; drawn again whole; none drawn, nothing left; disposed, out of its scene', async () => {
    const { createRulesGizmos, RULES_GIZMO_COLOUR_ADAPTATION: C } = await gizmos();
    const g = createRulesGizmos();
    const scene = new Object3D();
    scene.add(g.group);
    const zones = [{ id: 'vault', shape: 'cylinder' as const, at: [0, 0, 0] as [number, number, number], radius: 5, height: 3 }];
    g.draw({ zones }, 'zone:vault');
    const volume = g.group.getObjectByName('zone:vault')!.getObjectByName('volume') as LineSegments;
    expect((volume.material as LineBasicMaterial).color.getHex()).toBe(C.picked);
    g.draw({ zones });
    expect(((g.group.getObjectByName('zone:vault')!.getObjectByName('volume') as LineSegments).material as LineBasicMaterial).color.getHex()).toBe(C.zone);
    expect(g.group.children).toHaveLength(1);
    g.draw({});
    expect(g.ids()).toEqual([]);
    expect(g.group.children).toHaveLength(0);
    g.dispose();
    expect(g.group.parent).toBeNull();
  });
});
