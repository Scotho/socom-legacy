// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { FlyCamera } from '../src/camera';
import { WalkMode } from '../src/walk';

/**
 * OT.R68 (the owner, 2026-10-21, said in the merge controller's seat: "please also add kb/m support for everything while
 * in the forge creation UI (not once of it's started matches)"): the forge's editor -- its keys, the fly camera's keys and
 * the captured mouse's look, the Walk on the layout (the merge controller's call (a)) -- in every build. A browser
 * adaptation. Every other camera keeps OT.R29 / OT.R38: /testroom's (`main.ts`) and the match's (`matchMount.ts`, the
 * forge's matches included) read no key and no locked mouse in a release.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (f: string): string => readFileSync(resolve(SRC, f), 'utf-8');

afterEach(() => { vi.unstubAllEnvs(); });

/** How far `fly` flies forward in a second of W held. */
const flown = (fly: FlyCamera): number => {
  fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  for (let i = 0; i < 60; i++) fly.update(1 / 60);
  globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  const p = fly.pose();
  return Math.hypot(p.x, p.y, p.z);
};

describe('OT.R68: the forge editor\'s camera reads the keyboard and the captured mouse in a release', () => {
  it('while RMB is held its fly keys are the camera\'s alone: W, E, R and the rest never reach the editor\'s keys; released, they do', () => {
    vi.stubEnv('DEV', false);
    const canvas = document.createElement('canvas');
    const fly = new FlyCamera(canvas, { forgeKbm: true });
    const heard: string[] = [];
    const editor = (e: KeyboardEvent): void => { heard.push(e.code); };
    globalThis.addEventListener('keydown', editor);              // after the camera's, as the page's is
    const press = (code: string): void => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code }));
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF']) press(code);
    expect(heard).toEqual([]);
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    for (const code of ['KeyW', 'KeyE', 'KeyR']) press(code);
    expect(heard).toEqual(['KeyW', 'KeyE', 'KeyR']);
    globalThis.removeEventListener('keydown', editor);
    fly.dispose();
  });

  it('so do they during every other navigation drag -- the MMB pan, the Alt+LMB orbit, the Alt+RMB dolly -- and after it, again the editor\'s', () => {
    vi.stubEnv('DEV', false);
    const canvas = document.createElement('canvas');
    const input = document.createElement('div');
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
    const fly = new FlyCamera(canvas, { forgeKbm: true, pointerInput: input });
    const heard: string[] = [];
    const editor = (e: KeyboardEvent): void => { heard.push(e.code); };
    globalThis.addEventListener('keydown', editor);
    const press = (code: string): void => {
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code }));
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    const drags: PointerEventInit[] = [{ button: 1 }, { button: 0, altKey: true }, { button: 2, altKey: true }];
    drags.forEach((init, i) => {
      input.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 10 + i, pointerType: 'mouse', clientX: 100, clientY: 100, ...init }));
      for (const code of ['KeyW', 'KeyE', 'KeyR']) press(code);
      expect(heard, JSON.stringify(init)).toEqual([]);
      input.dispatchEvent(new PointerEvent('pointerup', { pointerId: 10 + i, pointerType: 'mouse', ...init }));
    });
    press('KeyE');
    expect(heard).toEqual(['KeyE']);
    globalThis.removeEventListener('keydown', editor);
    fly.dispose();
  });

  it('a release: the forge\'s camera (forgeKbm) flies on W; the default camera does not', () => {
    vi.stubEnv('DEV', false);
    const forgeCanvas = document.createElement('canvas');
    const forge = new FlyCamera(forgeCanvas, { forgeKbm: true });
    forgeCanvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    expect(flown(forge)).toBeGreaterThan(0.1);
    forgeCanvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    forge.dispose();
    const other = new FlyCamera(document.createElement('canvas'));
    expect(flown(other)).toBe(0);
    other.dispose();
  });

  it('the forge requires RMB for keyboard flight', () => {
    vi.stubEnv('DEV', false);
    const fly = new FlyCamera(document.createElement('canvas'), { forgeKbm: true });
    expect(flown(fly)).toBe(0);
    fly.dispose();
  });

  it('Forge camera settings adjust FOV and look sensitivity', () => {
    vi.stubEnv('DEV', false);
    const fovChanges: number[] = [];
    const fly = new FlyCamera(document.createElement('canvas'), {
      forgeKbm: true,
      onFovChange: (degrees) => fovChanges.push(degrees),
    });
    fly.setFov(80);
    expect(fly.fieldOfView()).toBe(80);
    expect(fly.camera.fov).toBe(80);
    expect(fovChanges).toEqual([80]);

    fly.setPose({ x: 0, y: 0, z: 0, yaw: 180, pitch: 0 });
    fly.setLookSpeedMultiplier(2);
    fly.lookBy(100, 0);
    expect(fly.pose().yaw).toBeCloseTo(180 - (100 * 0.0028 * 2 * 180) / Math.PI);
    expect(fly.lookSpeed()).toBe(2);
    fly.dispose();
  });

  it('camera collision is opt-in and only constrains perspective flight while RMB is held', () => {
    vi.stubEnv('DEV', false);
    const canvas = document.createElement('canvas');
    const constrainMovement = vi.fn((_from: Vector3, to: Vector3) => ({ position: to, normals: [] }));
    const fly = new FlyCamera(canvas, { forgeKbm: true, constrainMovement });
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    fly.update(1 / 60);
    expect(constrainMovement).not.toHaveBeenCalled();

    fly.setCameraCollisionEnabled(true);
    fly.update(1 / 60);
    expect(constrainMovement).toHaveBeenCalled();

    fly.setForgeViewportView('top');
    constrainMovement.mockClear();
    fly.update(1 / 60);
    expect(constrainMovement).not.toHaveBeenCalled();
    globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    fly.dispose();
  });

  it('the Forge orientation gizmo can orbit around the focus and returns an orthographic view to perspective', () => {
    vi.stubEnv('DEV', false);
    const fly = new FlyCamera(document.createElement('canvas'), { forgeKbm: true });
    const focus = new Vector3(0, 0, 0);
    fly.setPose({ x: 0, y: 0, z: 10, yaw: 0, pitch: 0 });
    const distance = fly.camera.position.distanceTo(focus);
    fly.orbitForgeViewport(30, 12, focus);
    expect(fly.camera.position.distanceTo(focus)).toBeCloseTo(distance);
    expect(fly.pose().yaw).not.toBe(0);
    expect(fly.pose().pitch).not.toBe(0);

    fly.setForgeViewportView('top', focus);
    fly.orbitForgeViewport(20, 0, focus);
    expect(fly.viewportCamera()).toBeInstanceOf(PerspectiveCamera);
    expect(fly.forgeViewportView()).toBe('perspective');
    fly.dispose();
  });

  it('the forge switches between perspective and orthographic view directions and exposes camera speed control', () => {
    vi.stubEnv('DEV', false);
    const canvas = document.createElement('canvas');
    const input = document.createElement('div');
    const fly = new FlyCamera(canvas, { forgeKbm: true, pointerInput: input });
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
    fly.setPose({ x: 2, y: 3, z: 4, yaw: 20, pitch: 10 });

    const focus = new Vector3(0, 0, 0);
    fly.setForgeViewportView('top', focus);
    expect(fly.viewportCamera()).toBeInstanceOf(OrthographicCamera);
    expect(fly.pose().pitch).toBeCloseTo(-89.9, 1);
    expect(focus.clone().project(fly.viewportCamera()).x).toBeCloseTo(0);
    expect(focus.clone().project(fly.viewportCamera()).y).toBeCloseTo(0);
    const orthographic = fly.viewportCamera() as OrthographicCamera;
    const start = orthographic.position.clone();
    input.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 1, clientX: 100, clientY: 100 }));
    input.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 130 }));
    input.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 1 }));
    expect(orthographic.position.equals(start)).toBe(false);
    const beforeRightPan = orthographic.position.clone();
    const orientationBeforeRightPan = fly.pose();
    input.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, pointerType: 'mouse', button: 2, clientX: 100, clientY: 100 }));
    input.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, pointerType: 'mouse', clientX: 115, clientY: 120 }));
    input.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, pointerType: 'mouse', button: 2 }));
    expect(orthographic.position.equals(beforeRightPan)).toBe(false);
    expect(fly.pose()).toMatchObject({ yaw: orientationBeforeRightPan.yaw, pitch: orientationBeforeRightPan.pitch });
    expect(fly.isLocked()).toBe(false);
    const zoom = orthographic.zoom;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(orthographic.zoom).toBeGreaterThan(zoom);
    fly.setForgeViewportView('front');
    expect(fly.pose()).toMatchObject({ yaw: 0, pitch: 0 });
    const orthographicPose = fly.pose();
    fly.setForgeViewportView('perspective');
    expect(fly.viewportCamera()).toBeInstanceOf(PerspectiveCamera);
    expect(fly.pose()).toEqual(orthographicPose);

    fly.setSpeedMultiplier(3);
    expect(fly.multiplier()).toBe(3);
    fly.setSpeedMultiplier(20);
    expect(fly.multiplier()).toBe(16);
    fly.dispose();
  });

  it('the Walk from an orthographic view walks in perspective: the projection restored, the mouse looks, the page told', () => {
    vi.stubEnv('DEV', false);
    const views: string[] = [];
    const c = document.createElement('canvas');
    const fly = new FlyCamera(c, { forgeKbm: true, onViewportViewChange: (v) => views.push(v) });
    fly.setPose({ x: 0, y: 100, z: 0, yaw: 0, pitch: 0 });
    fly.setForgeViewportView('top', new Vector3(0, 0, 0));
    expect(fly.viewportCamera()).toBeInstanceOf(OrthographicCamera);
    fly.setWalking(true);
    expect(fly.forgeViewportView()).toBe('perspective');
    expect(fly.viewportCamera()).toBe(fly.camera);
    expect(views).toEqual(['perspective']);
    const yaw = fly.pose().yaw;
    // The captured mouse's look, as the release test below drives it: RMB down, the lock taken, a move, the lock let go.
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.dispatchEvent(new Event('pointerlockchange'));
    const move = new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true });
    Object.defineProperty(move, 'movementX', { value: -60 });
    Object.defineProperty(move, 'movementY', { value: 0 });
    c.dispatchEvent(move);
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('pointerlockchange'));
    fly.update(1 / 60);
    expect(fly.pose().yaw).not.toBeCloseTo(yaw, 3);
    // Leaving the walk changes no projection; a walk from perspective tells the page nothing.
    fly.setWalking(false);
    fly.setWalking(true);
    expect(views).toEqual(['perspective']);
    fly.dispose();
  });

  it('the Walk keeps the lock the page asked for with no RMB, and the captured mouse looks; the editor still lets it go', () => {
    vi.stubEnv('DEV', false);
    const c = document.createElement('canvas');
    const fly = new FlyCamera(c, { forgeKbm: true });
    const exitPointerLock = vi.fn();
    document.exitPointerLock = exitPointerLock;
    const lock = (on: boolean): void => {
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => (on ? c : null) });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    const moved = (): void => {
      const move = new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true });
      Object.defineProperty(move, 'movementX', { value: -60 });
      Object.defineProperty(move, 'movementY', { value: 0 });
      c.dispatchEvent(move);
      fly.update(1 / 60);
    };
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    // (a) Walking: the lock taken by Walk's own press (the toolbar, V), no RMB -- kept, and the mouse looks.
    fly.setWalking(true);
    lock(true);
    expect(exitPointerLock).not.toHaveBeenCalled();
    expect(fly.isLocked()).toBe(true);
    const yaw = fly.pose().yaw;
    moved();
    expect(fly.pose().yaw).not.toBeCloseTo(yaw, 3);
    // An RMB press and release in the walk lets nothing go either.
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    expect(exitPointerLock).not.toHaveBeenCalled();
    lock(false);
    // (b) Back in the editor: a lock with no RMB is let go at once, and a locked move without RMB looks nowhere.
    fly.setWalking(false);
    lock(true);
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    const editorYaw = fly.pose().yaw;
    moved();
    expect(fly.pose().yaw).toBeCloseTo(editorYaw, 6);
    lock(false);
    fly.dispose();
  });

  it('a release: the forge\'s camera looks with the captured mouse; the default camera does not', () => {
    vi.stubEnv('DEV', false);
    const look = (opts: { forgeKbm?: true }): number => {
      const c = document.createElement('canvas');
      const fly = new FlyCamera(c, opts);
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
      document.dispatchEvent(new Event('pointerlockchange'));
      const move = new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true });
      Object.defineProperty(move, 'movementX', { value: -60 });
      Object.defineProperty(move, 'movementY', { value: 0 });
      c.dispatchEvent(move);
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
      document.dispatchEvent(new Event('pointerlockchange'));
      const yaw = fly.pose().yaw;
      fly.dispose();
      return yaw;
    };
    expect(look({ forgeKbm: true })).not.toBe(0);
    expect(look({})).toBe(0);
  });

  it('a release: the forge releases pointer lock when RMB is released, including a late lock grant', () => {
    vi.stubEnv('DEV', false);
    const c = document.createElement('canvas');
    const fly = new FlyCamera(c, { forgeKbm: true });
    const exitPointerLock = vi.fn();
    document.exitPointerLock = exitPointerLock;
    const mouse = (type: string): void => {
      c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    };

    mouse('pointerdown');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.dispatchEvent(new Event('pointerlockchange'));
    mouse('pointerup');
    expect(exitPointerLock).toHaveBeenCalledTimes(1);

    exitPointerLock.mockClear();
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('pointerlockchange'));
    mouse('pointerdown');
    mouse('pointerup');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(exitPointerLock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('pointerlockchange'));
    fly.dispose();
  });

  it('the forge camera leaves left-button input to the active tool', () => {
    vi.stubEnv('DEV', true);
    const c = document.createElement('canvas');
    const fly = new FlyCamera(c, { forgeKbm: true });
    const requestPointerLock = vi.fn();
    c.requestPointerLock = requestPointerLock;
    const before = fly.pose();
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true }));
    const move = new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', bubbles: true });
    Object.defineProperty(move, 'movementX', { value: 60 });
    c.dispatchEvent(move);

    expect(requestPointerLock).not.toHaveBeenCalled();
    expect(fly.pose()).toEqual(before);
    fly.dispose();
  });

  it('the forge camera receives RMB look input from its overlay and mouse movement from the locked canvas', () => {
    vi.stubEnv('DEV', false);
    const c = document.createElement('canvas');
    const input = document.createElement('div');
    const fly = new FlyCamera(c, { forgeKbm: true, pointerInput: input });
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    const exitPointerLock = vi.fn();
    document.exitPointerLock = exitPointerLock;
    input.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.dispatchEvent(new Event('pointerlockchange'));
    const move = new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', bubbles: true });
    Object.defineProperty(move, 'movementX', { value: 60 });
    c.dispatchEvent(move);
    expect(fly.pose().yaw).not.toBe(0);

    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('pointerlockchange'));
    fly.dispose();
  });

  it('the forge pans with MMB, moves along the view with the wheel, and changes speed while RMB is held', () => {
    vi.stubEnv('DEV', false);
    const c = document.createElement('canvas');
    const input = document.createElement('div');
    const speedChanges: Array<[number, 'wheel' | 'setting']> = [];
    const fly = new FlyCamera(c, {
      forgeKbm: true,
      pointerInput: input,
      panDepthAt: () => 10,
      onSpeedChange: (multiplier, source) => speedChanges.push([multiplier, source]),
    });
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
    const pointer = (type: string, button: number, x: number, y: number): void => {
      input.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button, clientX: x, clientY: y, bubbles: true }));
    };

    const panUnitsPerPixel = (2 * 10 * Math.tan(fly.camera.fov * Math.PI / 360)) / 600;
    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', -1, 120, 130);
    pointer('pointerup', 1, 120, 130);
    expect(fly.pose().x).toBeCloseTo(-20 * panUnitsPerPixel);
    expect(fly.pose().y).toBeCloseTo(30 * panUnitsPerPixel);
    expect(fly.pose()).toMatchObject({ z: 0, yaw: 0, pitch: 0 });

    const poseBeforeWheel = fly.pose();
    const zoomBefore = fly.camera.zoom;
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(fly.camera.zoom).toBe(zoomBefore);
    expect(fly.pose().z).toBeLessThan(poseBeforeWheel.z);
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(fly.camera.zoom).toBe(zoomBefore);
    expect(fly.pose()).toMatchObject({ x: poseBeforeWheel.x, y: poseBeforeWheel.y, z: poseBeforeWheel.z });

    pointer('pointerdown', 2, 120, 130);
    const zoomPose = fly.pose();
    const wheelZoom = fly.camera.zoom;
    const speed = fly.multiplier();
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(fly.multiplier()).toBeGreaterThan(speed);
    expect(speedChanges.at(-1)?.[1]).toBe('wheel');
    expect(fly.camera.zoom).toBe(wheelZoom);
    expect(fly.pose()).toEqual(zoomPose);
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(fly.multiplier()).toBeCloseTo(speed);
    expect(fly.camera.zoom).toBe(wheelZoom);
    expect(fly.pose()).toEqual(zoomPose);
    pointer('pointerup', 2, 120, 130);
    fly.dispose();
  });

  it('the forge boosts movement with Shift at double-tap speed and stops it with Ctrl', () => {
    vi.stubEnv('DEV', false);
    const CODE = { shiftleft: 'ShiftLeft', controlleft: 'ControlLeft', controlright: 'ControlRight' } as const;
    const distance = (modifier?: keyof typeof CODE, forgeKbm = true): number => {
      const canvas = document.createElement('canvas');
      const fly = new FlyCamera(canvas, forgeKbm ? { forgeKbm: true } : {});
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2 }));
      if (modifier) globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: CODE[modifier] }));
      globalThis.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      fly.update(1);
      globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      if (modifier) globalThis.dispatchEvent(new KeyboardEvent('keyup', { code: CODE[modifier] }));
      const x = fly.pose().x;
      fly.dispose();
      return x;
    };

    const normal = distance();
    expect(normal).toBeGreaterThan(0);
    expect(distance('shiftleft')).toBeCloseTo(normal * 5);
    // FP-1b (REVIEW-C 22): exact -- either Ctrl stops the forge camera dead (`forgeMovementFactor` 0), and Ctrl is the
    // forge's alone: no other fly camera binds it (`camera.ts`' DOUBLE_TAP_MS note: nothing else is bound to Ctrl).
    expect(distance('controlleft')).toBe(0);
    expect(distance('controlright')).toBe(0);
    vi.stubEnv('DEV', true);                                     // a fly camera that is not the forge's takes keys in DEV only
    const plain = distance(undefined, false);
    expect(plain).toBeGreaterThan(0);
    expect(distance('controlleft', false)).toBe(plain);
    expect(distance('controlright', false)).toBe(plain);
  });

  it('the forge orbits and dollies around the point under the cursor with Alt-drag', () => {
    vi.stubEnv('DEV', false);
    const c = document.createElement('canvas');
    const input = document.createElement('div');
    const pivot = new Vector3(0, 0, -10);
    const fly = new FlyCamera(c, { forgeKbm: true, pointerInput: input, pivotAt: () => pivot.clone() });
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    const drag = (button: number, x: number, y: number, altKey: boolean): void => {
      input.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button, clientX: x, clientY: y, altKey, bubbles: true }));
    };

    drag(0, 100, 100, true);
    input.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 120, clientY: 110, bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true }));
    expect(fly.pose().yaw).not.toBe(0);
    expect(fly.pose().z).not.toBe(0);

    const beforeDolly = fly.camera.position.distanceTo(pivot);
    drag(2, 120, 110, true);
    input.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientY: 90, bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2, bubbles: true }));
    expect(fly.camera.position.distanceTo(pivot)).toBeLessThan(beforeDolly);
    fly.dispose();
  });

  it('a release: the Walk on the layout (the forge\'s camera) binds its keys; a walk on the default camera binds none', () => {
    vi.stubEnv('DEV', false);
    const kinds = (fly: FlyCamera): string[] => {
      const added: string[] = [];
      const target = new EventTarget();
      const spy = vi.spyOn(target, 'addEventListener').mockImplementation(((type: string) => { added.push(type); }) as typeof target.addEventListener);
      const walk = new WalkMode(fly);
      walk.bindKey(target);
      spy.mockRestore();
      fly.dispose();
      return added.filter((t) => t.startsWith('key'));
    };
    expect(kinds(new FlyCamera(document.createElement('canvas'), { forgeKbm: true }))).toEqual(['keydown', 'keyup']);
    expect(kinds(new FlyCamera(document.createElement('canvas')))).toEqual([]);
  });

  it('the editor camera held while a match runs: no key reaches it (setInputSuspended), and it flies again after', () => {
    vi.stubEnv('DEV', false);
    const canvas = document.createElement('canvas');
    const fly = new FlyCamera(canvas, { forgeKbm: true });
    fly.setInputSuspended(true);
    expect(flown(fly)).toBe(0);
    fly.setInputSuspended(false);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    expect(flown(fly)).toBeGreaterThan(0.1);
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', button: 2 }));
    fly.dispose();
  });
});

describe('OT.R68: who opts in (source pins; the merge controller\'s care: the other cameras unchanged)', () => {
  const files = (d: string): string[] => readdirSync(resolve(SRC, d), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(`${d}/${e.name}`) : e.name.endsWith('.ts') ? [`${d}/${e.name}`] : []));
  const all = files('.').map((f) => f.replace(/^\.\//, ''));

  it('forge/page.ts alone constructs a camera with forgeKbm; /testroom\'s and the match\'s construct theirs without it', () => {
    const optIn = all.filter((f) => /forgeKbm:\s*true/.test(read(f)));
    expect(optIn).toEqual(['forge/page.ts']);
    expect(read('forge/page.ts')).toContain('pointerInput: input,');
    for (const f of ['main.ts', 'matchMount.ts']) {
      const ctor = read(f).split('\n').filter((l) => l.includes('new FlyCamera('));
      expect(ctor.length, f).toBe(1);
      expect(ctor[0], f).not.toMatch(/forgeKbm/);
    }
  });

  it('the camera\'s key, lock and locked-look sites still name the literal DEV gate, the opt-in beside it', () => {
    const cam = read('camera.ts').split('\n');
    // The markers stay under the literal gate alone, so a release build holds none (`build_keyboard.test.ts`).
    // Plain text, not a regex: an escaped dot before the env word reads as the leak check's key-file name.
    const gate = 'import.meta.env.DEV';
    // RB-8 (OT.R114): beside the forge's opt-in a `kbm` page's -- `this.kbm` at the attach, `kbmMouse` (asked at the press)
    // at the locked click, `this.kbmNow()` at the locked look.
    const gates = cam.filter((l) => l.includes(`if (${gate} || this.forgeKbm || this.kbm)`) || l.includes(`if (${gate} || this.forgeKbm || kbmMouse)`) || l.includes(`if ((${gate} || this.forgeKbm || this.kbmNow()) && this.locked)`));
    expect(gates.length).toBeGreaterThanOrEqual(4);                  // the keys, the lock listener, the locked click, the locked look
    expect(read('camera.ts')).toContain(`if (${gate}) keyboardSite('s2u-kb-fly-camera');`);
    expect(read('walk.ts')).toContain(`if (${gate}) keyboardSite('s2u-kb-walk');`);
    expect(read('walk.ts')).toContain(`if (${gate} || this.camera.forgeKbm === true || this.camera.kbm === true)`);   // RB-8: a kbm camera's Walk too
  });

  it('OT.R68\'s review F2-F5: no pointer lock API is not a lock; M hides the lobby\'s window first; the menu lets the mouse go; M\'s hint', () => {
    const page = read('forge/page.ts');
    expect(page).toContain('pointerLocked: !!doc.pointerLockElement');                   // F2: undefined is no lock
    const toggle = page.slice(page.indexOf('const toggleMenu = '));
    const fn = toggle.slice(0, toggle.indexOf('\n  };') + 5);
    expect(fn).toMatch(/!padMenu\.isOpen\(\) && doc\.pointerLockElement === canvas\) doc\.exitPointerLock\(\)/);   // F4
    expect(page).toMatch(/case 'menu': toggleMenu\(false\); break;/);                   // the pad's START: the same
    const keyMenu = page.slice(page.indexOf("case 'menu':", page.indexOf('forgeKeyAction(e,')));
    const line = keyMenu.slice(0, keyMenu.indexOf('break;') + 6);
    expect(line).toMatch(/lobby\?\.popup && lobby\.shown\) \{ setLobbyShown\(false\);/);  // F3: as START does
    expect(keyMenu.slice(0, keyMenu.indexOf('\n'))).toMatch(/toggleMenu\('keys'\); break;$/);   // F5: M's own line (the re-check's note)
  });

  it('the forge page holds its camera at a match\'s start and lets the mouse go (the merge controller\'s care), and lets it fly at the end', () => {
    const page = read('forge/page.ts');
    const body = page.slice(page.indexOf('const holdEditor = '));
    const fn = body.slice(0, body.indexOf('\n  };') + 5);
    expect(fn).toMatch(/fly\.setInputSuspended\(on\)/);
    expect(fn).toMatch(/doc\.pointerLockElement === canvas[\s\S]*doc\.exitPointerLock\(\)/);
    // Every match edge -- the body class the overlay reads (`test/forge/matchingClass.test.ts`) -- holds or frees it.
    const lines = page.split('\n');
    const edges = lines.flatMap((l, i) => (/classList\.(add|remove)\(FORGE_MATCHING_CLASS\)/.test(l) ? [[l, lines[i + 1] ?? ''] as const] : []));
    expect(edges.length).toBeGreaterThanOrEqual(5);
    for (const [l, next] of edges) expect(next.trim(), l.trim()).toBe(l.includes('.add(') ? 'holdEditor(true);' : 'holdEditor(false);');
  });
});

describe('RB-1 (OT.R114, RB.R4): the camera\'s `kbm` opt-in, `forgeKbm` its alias; `WalkMode.kbm` (a browser adaptation)', () => {
  it('no option: no keyboard and mouse opt-in; `kbm: true`: opted in, without the Forge editor\'s navigation', () => {
    const plain = new FlyCamera(document.createElement('canvas'));
    expect(plain.kbm).toBe(false);
    expect(plain.kbmNow()).toBe(false);
    expect(plain.forgeKbm).toBe(false);
    plain.dispose();
    const kbm = new FlyCamera(document.createElement('canvas'), { kbm: true });
    expect(kbm.kbm).toBe(true);
    expect(kbm.kbmNow()).toBe(true);
    expect(kbm.forgeKbm).toBe(false);                                 // the test room's camera keeps its own scheme
    kbm.dispose();
  });

  it('`forgeKbm: true` (the Forge editor\'s option, kept) is the opt-in too', () => {
    const forge = new FlyCamera(document.createElement('canvas'), { forgeKbm: true });
    expect(forge.forgeKbm).toBe(true);
    expect(forge.kbm).toBe(true);
    expect(forge.kbmNow()).toBe(true);
    forge.dispose();
  });

  it('a predicate is asked at each ask, so a page that joins an online room goes deaf at once (RB.R4)', () => {
    let url: string | undefined = 'loopback:';
    const fly = new FlyCamera(document.createElement('canvas'), { kbm: () => url === 'loopback:' });
    expect(fly.kbm).toBe(true);
    expect(fly.kbmNow()).toBe(true);
    url = 'wss://play.example.test/';
    expect(fly.kbmNow()).toBe(false);
    url = 'loopback:';
    expect(fly.kbmNow()).toBe(true);
    fly.dispose();
  });

  it('`WalkMode.kbm` reads its camera\'s opt-in when asked', () => {
    let on = true;
    const fly = new FlyCamera(document.createElement('canvas'), { kbm: () => on });
    const walk = new WalkMode(fly, () => undefined);
    expect(walk.kbm).toBe(true);
    on = false;
    expect(walk.kbm).toBe(false);
    expect(new WalkMode(new FlyCamera(document.createElement('canvas')), () => undefined).kbm).toBe(false);
    expect(new WalkMode(new FlyCamera(document.createElement('canvas'), { forgeKbm: true }), () => undefined).kbm).toBe(true);
    // A bare `WalkCamera` with neither field (a test's stub) is not opted in.
    expect(new WalkMode({} as unknown as ConstructorParameters<typeof WalkMode>[0], () => undefined).kbm).toBe(false);
    fly.dispose();
  });
});
