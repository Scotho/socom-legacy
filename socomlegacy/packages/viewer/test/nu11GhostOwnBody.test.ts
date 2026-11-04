// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import type { BodyView } from '../src/bodyView';
import { Play } from '../src/play';
import { corpseShownS } from '../src/net/deaths';
import type { PlaySnapshot } from '../src/mover';

/**
 * NU-11b H2 (research 314 §4.3; the owner's playtest, NU.R4: "Player that joined in has a visible model"): the ghost's own
 * body is not drawn on its own console either -- the level's spawn of the local actor (`FUN_002b7d60` D:L158609-158631)
 * hands a ghost to `FUN_00543d50` (D:L158634-158638), which puts it into the death state (D:L410437), sets its body
 * node's opacity 0 and makes it inactive (D:L410440-410441); it is drawn again at the round's reload (`FUN_002232a0`
 * D:L75846-75849 -> `FUN_00543b90`, opacity 1.0). The mounts' `Play.frame` is told the seat is a ghost (`NetPage.ghost()`,
 * the two calls `matchMount.test.ts`'s PAR-91 case pins); the gameplay seat's condition 3: a classic dead player is no
 * ghost, so its own corpse stays drawn (PAR-91). The PAR-91 stand-ins of `play.test.ts`.
 */
describe('NU-11b H2: the ghost\'s own body unseen on its own page (play.ts)', () => {
  const SNAP = {
    feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
    landing: null, jumps: 0, ground: { state: 'idle' }, action: null, turnRate: 0,
  } as unknown as PlaySnapshot;
  const page = () => {
    const view = { group: new Group(), setVisible(on: boolean) { this.group.visible = on; }, place: () => undefined, setPose: () => undefined, setGearVisible: () => false, addProp: () => new Group() };
    const play = new Play();
    play.setBody(view as unknown as BodyView, null);
    const life = { dead: false, spawns: 0 };
    const walk = { snapshot: () => SNAP, view: () => 'third' as const, isDead: () => life.dead, spawns: () => life.spawns };
    const camera = new PerspectiveCamera();
    /** One classic frame (the mounts' own-corpse rule) with the seat a ghost or not; whether the own body is drawn. */
    const step = (ghost: boolean): boolean => { play.frame(0.1, walk, camera, 0.1, corpseShownS('classic', 'own', false), ghost); return view.group.visible; };
    return { life, step };
  };

  it('a ghost seat (its walk dead from the seat, F1): its own body not drawn while it is one; drawn again at its spawn', () => {
    const { life, step } = page();
    life.dead = true;                                                // `seatGhost`: the walk dead (F1)
    for (let i = 0; i < 10; i++) expect(step(true)).toBe(false);
    life.dead = false; life.spawns = 1;                              // the next round's spawn: no ghost, alive
    expect(step(false)).toBe(true);
  });

  it('condition 3: a classic dead player is no ghost -- its own corpse drawn through the round, as PAR-91 has it', () => {
    const { life, step } = page();
    expect(step(false)).toBe(true);                                  // alive
    life.dead = true;                                                // the own `kill`
    for (let i = 0; i < 600; i++) expect(step(false)).toBe(true);    // 60 s dead: the classic corpse stays (`Infinity`)
  });
});
