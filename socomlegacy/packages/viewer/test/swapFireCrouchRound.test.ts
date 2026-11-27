// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { Accuracy } from '../src/accuracy';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { Button, type Command } from '../src/net/protocol';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { WalkMode } from '../src/walk';
import { HELD_RIFLE } from '@s2u/scene';

/**
 * SWAPFIRE-CROUCH, the round (the fresh review of 0373901a53, F1): a round fired while the crouched stop (`Stand ->
 * Crouch`, action 0x11) plays forward is knocked by the STAND row, the stance in use (`FUN_0058a720(body, 1)`,
 * D:L477722; `FUN_005c3360` reads it), on the page (`./matchFirearm`'s `round`) and in the room (`./net/shotCone`'s
 * `round`) alike. The rows' knocks differ, so the row each side used is visible in the state after the round.
 */
const cmd = (seq: number, over: Partial<Command> = {}): Command =>
  ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });
const still = { velocity: [0, 0, 0] as [number, number, number], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 0, sticks: { forward: 0, right: 0, turn: 0, pitch: 0 } };

describe('SWAPFIRE-CROUCH: a round in the crouched stop takes the stand row', () => {
  it('the rows differ: a stand round and a crouch round leave different states (the test can tell them apart)', () => {
    const a = new Accuracy(HELD_RIFLE), b = new Accuracy(HELD_RIFLE);
    a.trigger(); b.trigger();
    a.update(1 / 60, { stance: 'stand', ...still }); b.update(1 / 60, { stance: 'crouch', ...still });
    a.round(0, 'stand'); b.round(0, 'crouch');
    expect(a.state()).not.toEqual(b.state());
  });

  it('the room: a crouching body whose stance in use is stand fires with the stand row; with none, the posture\'s', () => {
    const body: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'crouch', stance: 'crouch', moveRoot: null, peek: 0, weapon: 0 };
    const inStop = new ShotCone(HELD_RIFLE), page = new Accuracy(HELD_RIFLE);
    inStop.tick(cmd(1, { buttons: Button.Trigger }), { ...body, stanceInUse: 'stand' }, 1);
    page.trigger();
    page.update(1 / 60, { stance: 'stand', rawStance: 'crouch', ...still });
    inStop.round(1); page.round(0, 'stand');
    expect(inStop.state()).toEqual(page.state());
    const crouched = new ShotCone(HELD_RIFLE), pageCrouch = new Accuracy(HELD_RIFLE);
    crouched.tick(cmd(1, { buttons: Button.Trigger }), body, 1);
    pageCrouch.trigger();
    pageCrouch.update(1 / 60, { stance: 'crouch', rawStance: 'crouch', ...still });
    crouched.round(1); pageCrouch.round(0, 'crouch');
    expect(crouched.state()).toEqual(pageCrouch.state());
  });

  it('the page: the firearm\'s round reads the walk\'s stance in use, not its posture', () => {
    const scene = new Scene();
    const fly = new FlyCamera(document.createElement('canvas'));
    const walk = new WalkMode(fly);
    const firearm = mountFirearm({
      scene, fly, walk, play: new Play(), remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
      view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
    });
    vi.spyOn(walk, 'mode').mockReturnValue('walk');
    vi.spyOn(walk, 'swapGate').mockReturnValue(true);
    vi.spyOn(walk, 'fireAim').mockReturnValue({ eye: [0, 20, 0], far: [0, 20, -1000] });
    vi.spyOn(walk, 'posture').mockReturnValue('crouch');
    vi.spyOn(walk, 'stanceInUse').mockReturnValue('stand');
    const round = vi.spyOn(Accuracy.prototype, 'round');
    // The firearm's own round (the gun's `round`, `fire.setGun`, where the page reads the row), called as `./fireCore`
    // calls it per round.
    const gun = (firearm.fire as unknown as { gun: { round?: (dir: readonly number[], depth?: number | null) => unknown } | null }).gun;
    expect(gun?.round, 'the gun has its round').toBeTypeOf('function');
    gun!.round!([0, 0, -1], 1);
    expect(round).toHaveBeenCalled();
    for (const call of round.mock.calls) expect(call[1], 'the round\'s stance row').toBe('stand');
    round.mockRestore();
  });
});
