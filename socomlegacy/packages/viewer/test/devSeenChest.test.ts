import { describe, expect, it } from 'vitest';
import { Bone, Group, Scene } from 'three';
import { chestOf, devSeen } from '../src/devSeen';
import { GrenadeThrower } from '../src/grenade';
import { Hud } from '../src/hud';
import type { SeenRemoteBody, SeenRemotes } from '../src/remotePlayers';

/**
 * DEATH-PAGES (LATER 979; product track: a development instrument with no original, changing nothing the game does): the
 * dev hook's `devSeen()` reads the chest's facing of every drawn body off its posed bones -- research 421's measure
 * (section 1): the torso's normal `(lbicep - rbicep) x (neck - spinelo)`, the body's front (-z, `net/hitVolumes`) in
 * the bind, reported as its elevation, +90 face up and -90 face down. `e2e/deathPages.spec.ts` reads it on each page
 * of a match to say whether a page draws the room's death clip to its end. Held here on a stand-in skeleton of the four
 * bones the measure reads, posed as research 421's bind is: the front exactly -z.
 */

const DEG = Math.PI / 180;

/** A body group with the four bones, the torso's front -z (x right, y up): research 421 section 1's bind. */
function torso(): { group: Group; hips: Bone } {
  const group = new Group();
  group.name = 'body test';
  const hips = new Bone(); hips.name = 'hips'; hips.position.set(0, 10, 0);
  const spinelo = new Bone(); spinelo.name = 'spinelo'; spinelo.position.set(0, 1, 0);
  const neck = new Bone(); neck.name = 'neck'; neck.position.set(0, 5, 0);
  const lbicep = new Bone(); lbicep.name = 'lbicep'; lbicep.position.set(-2, 4, 0);   // the model's left: -x (it faces -z)
  const rbicep = new Bone(); rbicep.name = 'rbicep'; rbicep.position.set(2, 4, 0);
  hips.add(spinelo);
  spinelo.add(neck, lbicep, rbicep);
  group.add(hips);
  return { group, hips };
}

const read = (group: Group) => { group.updateMatrixWorld(true); return chestOf(group)!; };

describe('DEATH-PAGES: the chest\'s facing of a drawn body (devSeen, a development instrument)', () => {
  it('standing in the bind: level (0), along the body\'s facing (ahead 1), the group upright; turned, the same', () => {
    const { group } = torso();
    let c = read(group);
    expect(c.chest).toBeCloseTo(0, 6);
    expect(c.bodyChest).toBeCloseTo(0, 6);
    expect(c.ahead).toBeCloseTo(1, 6);
    expect(c.tilt).toBeCloseTo(0, 6);
    group.rotation.y = 1.1;                                       // a yaw (`bodyView` `place`): the facing turns with it
    group.position.set(100, 5, -40);
    c = read(group);
    expect(c.chest).toBeCloseTo(0, 6);
    expect(c.ahead).toBeCloseTo(1, 6);
  });

  it('the torso laid on its back reads +90 (face up), on its face -90 (face down), in the world and in the body\'s frame', () => {
    const { group, hips } = torso();
    hips.rotation.x = 90 * DEG;                                   // -z turned to +y: the front up
    let c = read(group);
    expect(c.chest).toBeCloseTo(90, 4);
    expect(c.bodyChest).toBeCloseTo(90, 4);
    hips.rotation.x = -90 * DEG;                                  // the front down
    c = read(group);
    expect(c.chest).toBeCloseTo(-90, 4);
    expect(c.bodyChest).toBeCloseTo(-90, 4);
    hips.rotation.x = -60 * DEG;
    group.rotation.y = -2;                                         // the heading leaves the elevation alone
    expect(read(group).chest).toBeCloseTo(-60, 4);
  });

  it('a tilted group (a root tilt) shows in the world reading and the tilt, not in the body\'s frame', () => {
    const { group } = torso();
    group.rotation.x = 30 * DEG;                                  // the whole body pitched: its front 30 up
    const c = read(group);
    expect(c.chest).toBeCloseTo(30, 4);
    expect(c.bodyChest).toBeCloseTo(0, 4);
    expect(c.tilt).toBeCloseTo(30, 4);
  });

  it('a mirrored group reads the same facing (the cross product turned back)', () => {
    const { group } = torso();
    group.scale.set(-1, 1, 1);
    const c = read(group);
    expect(c.chest).toBeCloseTo(0, 6);
    expect(c.ahead).toBeCloseTo(1, 6);
  });

  it('a group without the four bones reads null', () => {
    const group = new Group();
    group.add(Object.assign(new Bone(), { name: 'hips' }));
    group.updateMatrixWorld(true);
    expect(chestOf(group)).toBeNull();
  });

  it('devSeen: each drawn body\'s chest by id, and the page\'s own body -- a body group of the scene no remote draws', () => {
    const scene = new Scene();
    const remoteBody = torso(), own = torso();
    remoteBody.group.name = 'body seal_A_scuba';
    own.group.name = 'body al_gman01';
    own.group.position.set(7, 0, 9);
    own.hips.rotation.x = -90 * DEG;                              // the page's own body lies on its face
    scene.add(remoteBody.group, own.group, Object.assign(new Group(), { name: 'world' }));
    scene.updateMatrixWorld(true);
    const body: SeenRemoteBody = {
      id: 3, escortee: null, alive: false, deadFor: 4, deathClip: 'death_stand_rarm01',
      anim: { clip: 'death_stand_rarm01', frame: 71 }, group: remoteBody.group, fittingNames: [],
    };
    const seen: SeenRemotes = { bodies: [body], ghosts: [], gearShown: new Map() };
    const read = devSeen({
      bomb: { state: () => null }, grenade: new GrenadeThrower({ grid: () => null, snapshot: () => null, view: () => 'third' }),
      remote: { seenForDev: () => seen }, hud: new Hud(),
    });
    expect(read.chests).toHaveLength(1);
    expect(read.chests[0]!.id).toBe(3);
    expect(read.chests[0]!.chest!.chest).toBeCloseTo(0, 4);
    expect(read.own).toHaveLength(1);
    expect(read.own[0]!.name).toBe('body al_gman01');
    expect(read.own[0]!.at).toEqual([7, 0, 9]);
    expect(read.own[0]!.chest!.chest).toBeCloseTo(-90, 4);
    // the body records are as before: the chest is beside them, not in them (`devSeen.test.ts`'s exact reads)
    expect(Object.keys(read.bodies[0]!)).not.toContain('chest');
  });
});
