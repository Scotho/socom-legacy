// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { FlyCamera } from '../src/camera';
import { BAKED_LOADOUT } from '../src/loadout';
import { Play } from '../src/play';
import { WalkMode } from '../src/walk';
import type { FireSource } from '../src/fireCore';
import { prototypeCombat } from '../src/xboxPrototype/combatRuntime';
import type { WalkingMap } from '../src/xboxPrototype/runtimeAssets';

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.restoreAllMocks(); });
function rig() {
  const fly = new FlyCamera(document.createElement('canvas')), walk = new WalkMode(fly), play = new Play();
  const map = { origin: [0, 0, 0], metersPerUnit: 0.1,
    camera: { hfov: 0.5, vfov: 0.4, mid: 640 } } as unknown as WalkingMap;
  let enabled = true;
  vi.spyOn(walk, 'mode').mockReturnValue('walk');
  const combat = prototypeCombat({ map, fly, walk, play, loadout: () => BAKED_LOADOUT, client: () => null,
    enabled: () => enabled, online: false, event() {} });
  disposers.push(() => { combat.dispose(); fly.dispose(); });
  return { combat, fly, walk, play, enabled: (on: boolean) => { enabled = on; } };
}
it('applies native zoom movement and command flags before movement and refuses gated presses', () => {
  const { combat, walk, enabled } = rig();
  const scoped = vi.spyOn(walk, 'setScoped'), slow = vi.spyOn(walk, 'setScopedMove'), binoculars = vi.spyOn(walk, 'setBinoculars');
  enabled(false); expect(combat.stepZoom('in')).toBe(0);
  enabled(true); expect(combat.stepZoom('in')).toBe(1);
  combat.beforeMove(); expect(scoped).toHaveBeenLastCalledWith(true); expect(slow).toHaveBeenLastCalledWith(false);
  combat.setZoom(4); combat.beforeMove();
  expect(slow).toHaveBeenLastCalledWith(true); expect(binoculars).toHaveBeenLastCalledWith(true);
  vi.spyOn(walk, 'isDead').mockReturnValue(true); expect(combat.stepZoom('out')).toBe(4);
});
it('uses binocular fire/reload refusal without replacing magazine or raise rules', () => {
  const { combat, play } = rig();
  const source = (combat.fire as unknown as { source: FireSource }).source;
  combat.setZoom(4);
  expect(source.fireRefused?.()).toBe(true); expect(source.reloadRefused?.()).toBe(true);
  const stats = play.weaponStats(); vi.spyOn(play, 'weaponStats').mockReturnValue({ ...stats, raise: { ...stats.raise, weight: 0.9 } });
  combat.setZoom(1); expect(source.reloadRefused?.()).toBe(false); expect(source.raiseRefused?.()).toBe(true);
  const record = combat.fire.weaponRecord(); combat.fire.takeWeapon(record, [1, record.magazine]);
  combat.setZoom(4); combat.reload(); combat.fireFrame(2);
  expect(combat.fire.state().magazine.reloading).toBe(false); expect(combat.fire.state().magazine.rounds).toBe(1);
});
it('keeps scoped fire mode fixed and restores the base projection immediately on death', () => {
  const { combat, fly, walk } = rig();
  const before = combat.state().mode;
  combat.setZoom(5); combat.switchFireMode(); expect(combat.state().mode).toBe(before);
  vi.spyOn(walk, 'snapshot').mockReturnValue({ stance: 'stand', vx: 0, vy: 0, vz: 0, airborne: false } as ReturnType<WalkMode['snapshot']>);
  combat.poseFrame(0.5); expect(fly.camera.fov).toBeLessThan(0.8 * 180 / Math.PI);
  vi.spyOn(walk, 'isDead').mockReturnValue(true); combat.poseFrame(0.01);
  expect(combat.zoom.state()).toBe(0); expect(fly.camera.fov).toBeCloseTo(0.8 * 180 / Math.PI);
});
