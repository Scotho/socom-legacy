import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, type Object3D } from 'three';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dropModels, WorldDrops } from '../src/drops';
import { releaseRenderObjects } from '../src/renderRelease';
import { Play } from '../src/play';

/**
 * LATER 922 (product track, a renderer memory fix; no picture and no game value changed): PC 3's census of 2026-11-18
 * (agent/next 827f5441e8, MP2 classic, 16 seats, 5 rounds, WebGL2) grew +597 RenderObjects and +600 uniform buffers from
 * round 1 to round 5, 505 of them weapon copies OFF the scene -- held by three r186's `RenderObjects._renderObjects`, a
 * strong Set an entry leaves only on its object's, material's or geometry's `dispose` event. Nothing on the page sent one:
 * a dropped weapon left by `scene.remove` (`./drops`), a body's swapped weapon by `removeFromParent` (`Play.setWeapon`).
 * `releaseRenderObjects` sends the object's `dispose` event over a tree let go for good: its render objects (their bind
 * groups, uniform buffers and VAOs) go; the geometry and materials -- shared with the templates -- are not disposed. A
 * copy drawn again later is given new render objects.
 */

const tree = () => {
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const g = new Group(), a = new Mesh(geometry, material), b = new Mesh(geometry, material);
  g.add(a); a.add(b);
  return { g, a, b, geometry, material };
};
const disposedOf = (...os: Object3D[]) => {
  const seen: Object3D[] = [];
  for (const o of os) o.addEventListener('dispose', () => { seen.push(o); });
  return seen;
};

describe('LATER 922: a weapon copy let go for good releases its render objects', () => {
  it('releaseRenderObjects: every node of the tree told dispose, once; its shared geometry and material are not', () => {
    const { g, a, b, geometry, material } = tree();
    const seen = disposedOf(g, a, b);
    const geo = vi.fn(), mat = vi.fn();
    geometry.addEventListener('dispose', geo); material.addEventListener('dispose', mat);
    releaseRenderObjects(g);
    expect(seen).toEqual([g, a, b]);
    expect(geo).not.toHaveBeenCalled();
    expect(mat).not.toHaveBeenCalled();
    expect(() => releaseRenderObjects(null)).not.toThrow();
  });

  it('a dropped weapon taken (or a round’s reset): its copy leaves the scene and is released', () => {
    const scene = new Scene();
    const made: Group[] = [];
    const drops = new WorldDrops(dropModels(scene, () => ({ arsenal: { items: new Map([[5, { model: 'ak47' }]]) } }) as never, () => { const t = tree(); made.push(t.g); return t.g; }));
    drops.place({ did: 1, kind: 'weapon', item: 5, at: [0, 0, 0], yaw: 0 } as never);
    drops.place({ did: 2, kind: 'weapon', item: 5, at: [1, 0, 0], yaw: 0 } as never);
    const seen = disposedOf(...made);
    drops.remove(1);
    expect(seen).toEqual([made[0]]);
    expect(made[0]!.parent).toBeNull();
    drops.reset();                                                     // the round's end
    expect(seen).toEqual([made[0], made[1]]);
  });

  it('a body’s swapped weapon and sidearm: the replaced copy released, the same copy hung again not', () => {
    const p = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/play.ts'), 'utf8');
    expect(p).toMatch(/setWeapon\(object: Object3D \| null, points: readonly WeaponPoint\[\]\): void \{\s*if \(this\.weapon !== object\) \{ this\.weapon\?\.removeFromParent\(\); releaseRenderObjects\(this\.weapon\); \}/);
    expect(p).toMatch(/setSidearm\(object: Object3D \| null, points: readonly WeaponPoint\[\]\): void \{\s*if \(this\.sidearm !== object\) \{ this\.sidearm\?\.removeFromParent\(\); releaseRenderObjects\(this\.sidearm\); \}/);
  });

  it('a body’s launcher copy taken off: released', () => {
    const r = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/remotePlayers.ts'), 'utf8');
    expect(r).toMatch(/private dropLauncher\(r: Remote\): void \{\s*const object = r\.launcher\?\.object \?\? null;\s*object\?\.removeFromParent\(\);\s*releaseRenderObjects\(object\);/);
  });

  // The controller's check (2026-11-18): a released copy drawn again is intended only where the page REUSES the object --
  // the own body's weapons, `world.ts`'s `held()` cached per model (`heldBuilt`): a kit change away releases the old one,
  // a change back hangs the SAME Group again. Off its body it is drawn nowhere (drops and the others' bodies use clones).
  // three's contract, modelled: a render object made at an object's first draw, dropped on the object's `dispose` event.
  it('reuse: the own body’s cached weapon -- drawn, swapped out (released), swapped back (re-shown), drawn again whole', () => {
    const renderObjects = new Map<Object3D, number>();
    let made = 0;
    const draw = (root: Object3D): void => root.traverse((o) => {
      if (!(o as Mesh).isMesh || renderObjects.has(o)) return;
      renderObjects.set(o, ++made);
      o.addEventListener('dispose', function gone() { renderObjects.delete(o); o.removeEventListener('dispose', gone); });
    });
    const a = tree(), b = tree();
    const play = new Play();
    play.setWeapon(a.g, []);
    draw(a.g);
    expect(renderObjects.size).toBe(2);                               // a's two meshes drawn
    play.setWeapon(b.g, []);                                          // the kit changed: a off the body, released
    expect([renderObjects.has(a.a), renderObjects.has(a.b)]).toEqual([false, false]);
    const bGone = disposedOf(b.g);
    play.setWeapon(a.g, []);                                          // the kit changed back: the SAME cached Group
    expect(bGone, 'b, swapped out, released').toEqual([b.g]);
    expect(a.g.children).toContain(a.a);                              // a whole: its tree, geometry and material kept
    expect(a.a.geometry).toBe(a.geometry);
    expect(a.a.material).toBe(a.material);
    draw(a.g);                                                        // drawn again: new render objects, as three makes them
    expect([renderObjects.has(a.a), renderObjects.has(a.b)]).toEqual([true, true]);
    expect(made).toBe(4);                                             // a's two meshes, drawn twice; b never drawn
    play.setWeapon(a.g, []);                                          // the same copy hung again: not released
    expect(renderObjects.has(a.a)).toBe(true);
  });

  it('the follow-up (PC 3’s A/B): the grenades’ per-use copies -- the hand’s, the body-held one, each one in flight -- released when let go', () => {
    const g = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/grenade.ts'), 'utf8');
    expect(g).toMatch(/if \(this\.handModel\) \{ this\.hand\.remove\(this\.handModel\); releaseRenderObjects\(this\.handModel\); \}/);
    expect(g).toMatch(/private dropHeld\(\): void \{\s*this\.heldModel\?\.object\.removeFromParent\(\);\s*releaseRenderObjects\(this\.heldModel\?\.object\);/);
    expect(g).toMatch(/if \(drawn\.model\) \{ this\.object\.remove\(drawn\.model\); releaseRenderObjects\(drawn\.model\); \}/);   // #835: the flight's `drawn`
  });
});
