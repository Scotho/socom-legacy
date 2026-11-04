// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FlyCamera } from '../../src/camera';

describe('Forge editor pixel look adaptation', () => {
  it('turns without cancelling flight glide or sprint FOV', () => {
    const fly = new FlyCamera(document.createElement('canvas'));
    try {
      const restFov = fly.camera.fov;
      fly.setStick(0, 1); fly.setStickBoost(true); fly.update(0.2);
      const fov = fly.camera.fov, before = fly.pose();
      expect(fov).toBeGreaterThan(restFov);
      fly.setStick(0, 0); fly.setStickBoost(false);
      fly.lookBy(40, -20);
      expect(fly.pose().yaw).not.toBe(before.yaw);
      expect(fly.pose().pitch).not.toBe(before.pitch);
      expect(fly.camera.fov).toBe(fov);
      const at = fly.camera.position.clone(); fly.update(0.02);
      expect(fly.camera.position.distanceTo(at)).toBeGreaterThan(0.1);
    } finally { fly.dispose(); }
  });
  it('leaves walking and suspended camera input with their existing owners, and ordinary flight unchanged without a call', () => {
    const fly = new FlyCamera(document.createElement('canvas'));
    try {
      const pose = fly.pose(); fly.update(0.1); expect(fly.pose()).toEqual(pose);
      fly.setInputSuspended(true); fly.lookBy(100, 100); expect(fly.pose()).toEqual(pose);
      fly.setInputSuspended(false); fly.setWalking(true); fly.lookBy(100, 100); expect(fly.pose()).toEqual(pose);
      fly.setWalking(false); fly.lookBy(100, 100); expect(fly.pose()).not.toEqual(pose);
    } finally { fly.dispose(); }
  });
});
