// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlyCamera } from '../src/camera';

/**
 * The camera is the one part of the viewer a player feels rather than reads, so what is pinned here is
 * the *motion model* — ramp, glide, frame-rate independence, the axes each key moves along — and not
 * the numbers themselves, which are tuning and are meant to be tuned.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  // jsdom has neither pointer capture nor pointer lock; the camera must not require them.
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const press = (code: string): void => {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { code }));
};
const release = (code: string): void => {
  globalThis.dispatchEvent(new KeyboardEvent('keyup', { code }));
};

/** Run `seconds` of simulated time in `steps` equal frames. */
const run = (fly: FlyCamera, seconds: number, steps: number): void => {
  for (let i = 0; i < steps; i++) fly.update(seconds / steps);
};

describe('FlyCamera', () => {
  let fly: FlyCamera;

  beforeEach(() => {
    fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  });

  it('starts still and stays still with no input', () => {
    run(fly, 1, 60);
    expect(fly.pose()).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  it('ramps rather than snapping: the first frame moves much less than the steady state', () => {
    press('KeyW');
    fly.update(1 / 60);
    const first = -fly.pose().z;
    run(fly, 1, 60);              // let it reach cruise
    const before = -fly.pose().z;
    fly.update(1 / 60);
    const steady = -fly.pose().z - before;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(steady * 0.5);
    release('KeyW');
  });

  it('glides to a stop after the key comes up, then stops for good', () => {
    press('KeyW');
    run(fly, 1, 60);
    release('KeyW');
    const atRelease = -fly.pose().z;
    fly.update(1 / 60);
    expect(-fly.pose().z).toBeGreaterThan(atRelease);   // still coasting

    run(fly, 2, 120);
    const settled = -fly.pose().z;
    run(fly, 2, 120);
    expect(-fly.pose().z).toBeCloseTo(settled, 6);      // and then truly stopped
  });

  it('travels the same distance at 30 fps as at 240 fps', () => {
    press('KeyW');
    run(fly, 2, 60);
    const slow = -fly.pose().z;

    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    run(fly, 2, 480);
    const fast = -fly.pose().z;
    release('KeyW');

    expect(fast).toBeCloseTo(slow, 4);
  });

  it('W follows the pitch: looking down and flying forward descends', () => {
    fly.setPose({ pitch: -45 });
    press('KeyW');
    run(fly, 1, 60);
    release('KeyW');
    expect(fly.pose().y).toBeLessThan(0);
  });

  it('A and D stay level however far the camera is pitched', () => {
    fly.setPose({ pitch: -80 });
    press('KeyD');
    run(fly, 1, 60);
    release('KeyD');
    const p = fly.pose();
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('space goes up and shift goes down, in world space, whatever the look', () => {
    fly.setPose({ pitch: -60, yaw: 123 });
    press('Space');
    run(fly, 1, 60);
    release('Space');
    expect(fly.pose().y).toBeGreaterThan(0);

    fly.setPose({ x: 0, y: 0, z: 0, pitch: -60, yaw: 123 });
    press('ShiftLeft');
    run(fly, 1, 60);
    release('ShiftLeft');
    expect(fly.pose().y).toBeLessThan(0);
  });

  it('keeps Q and E bound to down and up for the old fingers', () => {
    press('KeyE');
    run(fly, 1, 60);
    release('KeyE');
    expect(fly.pose().y).toBeGreaterThan(0);

    fly.setPose({ x: 0, y: 0, z: 0 });
    press('KeyQ');
    run(fly, 1, 60);
    release('KeyQ');
    expect(fly.pose().y).toBeLessThan(0);
  });

  it('a double-tapped W boosts, and a single held W does not', () => {
    press('KeyW');
    run(fly, 2, 120);
    const plain = -fly.pose().z;
    release('KeyW');

    // Tap, release, tap again inside the window and hold: Minecraft's sprint gesture.
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    press('KeyW');
    release('KeyW');
    press('KeyW');
    run(fly, 2, 120);
    const boosted = -fly.pose().z;
    release('KeyW');
    expect(boosted).toBeGreaterThan(plain * 2);
  });

  it('releasing forward ends the sprint: the next single press is not still boosting', () => {
    press('KeyW');
    release('KeyW');
    press('KeyW');
    run(fly, 1, 60);
    release('KeyW');

    // Move the clock past the double-tap window rather than burning 400 ms of wall time in a loop.
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    const real = performance.now.bind(performance);
    const skew = 400;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => real() + skew);
    press('KeyW');
    run(fly, 2, 120);
    const plain = -fly.pose().z;
    release('KeyW');
    spy.mockRestore();

    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    press('KeyW');
    release('KeyW');
    press('KeyW');
    run(fly, 2, 120);
    release('KeyW');
    expect(-fly.pose().z).toBeGreaterThan(plain * 2);
  });

  it('nothing is bound to ctrl: Ctrl+W would close the tab and no page can stop it', () => {
    press('ControlLeft');
    run(fly, 1, 60);
    release('ControlLeft');
    expect(fly.pose()).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  it('prevents the browser chord on every key it consumes', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft']) {
      const e = new KeyboardEvent('keydown', { code, cancelable: true });
      globalThis.dispatchEvent(e);
      expect(e.defaultPrevented, `${code} must not reach the browser`).toBe(true);
      release(code);
    }
    // A key it does not consume is left alone.
    const other = new KeyboardEvent('keydown', { code: 'KeyP', cancelable: true });
    globalThis.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    release('KeyP');
  });

  it('a diagonal is no faster than a straight line', () => {
    press('KeyW');
    run(fly, 2, 120);
    const straight = Math.hypot(fly.pose().x, -fly.pose().z);

    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    press('KeyD');
    run(fly, 2, 120);
    const diagonal = Math.hypot(fly.pose().x, -fly.pose().z);
    release('KeyW');
    release('KeyD');

    expect(diagonal).toBeCloseTo(straight, 1);
  });

  it('setPose kills the glide, so a driven pose is exactly the pose that renders', () => {
    press('KeyW');
    run(fly, 1, 60);
    release('KeyW');
    fly.setPose({ x: 5, y: 6, z: 7, yaw: 10, pitch: 20 });
    run(fly, 1, 60);
    const p = fly.pose();
    expect(p.x).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(6, 6);
    expect(p.z).toBeCloseTo(7, 6);
    expect(p.yaw).toBeCloseTo(10, 6);
    expect(p.pitch).toBeCloseTo(20, 6);
  });

  it('a menu over the game holds the input (the ARMORY): held keys let go, new keys and the sticks ignored until it closes', () => {
    press('KeyD');
    fly.setStick(0.8, 0.8);
    expect(fly.groundWish()).toMatchObject({ forward: expect.any(Number), right: 1 });
    fly.setInputSuspended(true);
    expect(fly.inputSuspended()).toBe(true);
    expect(fly.groundWish()).toEqual({ forward: 0, right: 0, boost: false });    // the held D let go, the stick zeroed
    press('KeyA');
    fly.setStick(-1, 0);
    fly.setLook(1, 0);
    expect(fly.groundWish()).toEqual({ forward: 0, right: 0, boost: false });
    const yaw = fly.pose().yaw;
    run(fly, 0.5, 30);
    expect(fly.pose()).toMatchObject({ x: 0, y: 0, z: 0, yaw });
    release('KeyA'); release('KeyD');
    fly.setInputSuspended(false);
    press('KeyA');
    expect(fly.groundWish().right).toBe(-1);
    release('KeyA');
  });

  it('losing focus drops the keys and the momentum', () => {
    press('KeyW');
    run(fly, 1, 60);
    globalThis.dispatchEvent(new Event('blur'));
    const parked = -fly.pose().z;
    run(fly, 1, 60);
    expect(-fly.pose().z).toBeCloseTo(parked, 6);
  });

  it('pitch cannot pass straight up or straight down', () => {
    fly.setPose({ pitch: 200 });
    expect(fly.pose().pitch).toBeLessThan(90);
    fly.setPose({ pitch: -200 });
    expect(fly.pose().pitch).toBeGreaterThan(-90);
  });

  it('the wheel trims the speed within bounds and reports it', () => {
    const seen: number[] = [];
    const wheeled = new FlyCamera(canvas(), { onSpeedChange: (m) => seen.push(m) });
    const c = wheeled as unknown as { canvas: HTMLCanvasElement };
    for (let i = 0; i < 3; i++) c.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    expect(wheeled.multiplier()).toBeGreaterThan(1);
    expect(seen).toHaveLength(3);

    for (let i = 0; i < 200; i++) c.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    expect(wheeled.multiplier()).toBeGreaterThanOrEqual(0.1);

    for (let i = 0; i < 400; i++) c.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    expect(wheeled.multiplier()).toBeLessThanOrEqual(16);
  });

  it('a faster speed trim covers more ground', () => {
    const c = fly as unknown as { canvas: HTMLCanvasElement };
    press('KeyW');
    run(fly, 2, 120);
    const normal = -fly.pose().z;

    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    for (let i = 0; i < 5; i++) c.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    run(fly, 2, 120);
    release('KeyW');
    expect(-fly.pose().z).toBeGreaterThan(normal);
  });

  it('a click on the canvas takes focus back off a panel control', () => {
    // The regression: click a checkbox, and every later keydown is aimed at the checkbox, which
    // `onKeyDown` ignores -- so the camera went dead until the page was reloaded.
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.append(box);
    box.focus();
    expect(document.activeElement).toBe(box);

    const c = fly as unknown as { canvas: HTMLCanvasElement };
    c.canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    expect(document.activeElement).not.toBe(box);

    press('KeyW');
    run(fly, 1, 60);
    release('KeyW');
    expect(-fly.pose().z).toBeGreaterThan(0);
    box.remove();
  });

  it('setFov sets the vertical field the map authored, and the boost widens from that', () => {
    fly.setFov(49);
    expect(fly.camera.fov).toBe(49);
    press('KeyW'); release('KeyW'); press('KeyW');      // the sprint gesture
    run(fly, 2, 120);
    expect(fly.camera.fov).toBeGreaterThan(49);
    expect(fly.camera.fov).toBeLessThan(49 * 1.3);
    release('KeyW');
    run(fly, 2, 120);
    expect(fly.camera.fov).toBeCloseTo(49, 2);           // and eases back to the map's own, not to a constant
  });

  it("SPECTATOR-VIEW W6: setMagnification scales the projection by three's zoom (tan(half FOV) / m), apart from the FOV the scopes set; back at 1 the scoped projection is the one never magnified", () => {
    fly.setFov(49);
    fly.setAspect(4 / 3);
    const plain = [...fly.camera.projectionMatrix.elements];
    fly.setFov(49 / 4);                                   // a scope's FOV (`./matchFirearm`: `zoom.fov(baseFov)`)
    const scoped = [...fly.camera.projectionMatrix.elements];
    fly.setFov(49);
    fly.setMagnification(4);
    expect([fly.camera.zoom, fly.camera.fov]).toEqual([4, 49]);   // the FOV untouched: the scope's lane is its own
    expect(fly.camera.projectionMatrix.elements[5]).toBeCloseTo(plain[5]! * 4, 9);
    fly.setPose({ x: 1, y: 2, z: 3, yaw: 10, pitch: 0 });           // a scenic pose a frame: the magnification stays
    expect(fly.camera.zoom).toBe(4);
    fly.setMagnification(1);
    expect(fly.camera.zoom).toBe(1);
    expect([...fly.camera.projectionMatrix.elements]).toEqual(plain);
    fly.setFov(49 / 4);
    expect([...fly.camera.projectionMatrix.elements]).toEqual(scoped);
  });

  it('the arrow keys look, at a steady rate, for a keyboard without a mouse', () => {
    press('ArrowLeft');
    run(fly, 0.5, 30);
    const half = fly.pose().yaw;
    run(fly, 0.5, 30);
    expect(half).toBeGreaterThan(5);                     // left is a positive yaw: the camera looks down -z
    expect(fly.pose().yaw).toBeCloseTo(half * 2, 3);     // twice the time, twice the turn
    release('ArrowLeft');
    press('ArrowUp');
    run(fly, 0.25, 15);
    expect(fly.pose().pitch).toBeGreaterThan(0);
    release('ArrowUp');
  });

  it('a touch drag turns further than a mouse drag of the same length: a thumb has less room', () => {
    const turn = (pointerType: string): number => {
      fly.setPose({ yaw: 0, pitch: 0 });
      const c = fly['canvas'];
      c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType, clientX: 100, clientY: 100, bubbles: true }));
      c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType, clientX: 0, clientY: 100, bubbles: true }));
      c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType, clientX: 0, clientY: 100, bubbles: true }));
      return fly.pose().yaw;
    };
    const mouse = turn('mouse');
    const touch = turn('touch');
    expect(mouse).toBeGreaterThan(0);
    expect(touch / mouse).toBeCloseTo(2, 3);
  });

  it('a pointerdown whose pointer is already gone does not throw, and leaves no drag stuck', () => {
    const c = fly['canvas'];
    let asked = 0;
    c.setPointerCapture = () => { asked++; throw new DOMException('No active pointer with the given id is found.', 'NotFoundError'); };
    fly.setPose({ yaw: 0, pitch: 0 });
    expect(() => c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 100, bubbles: true }))).not.toThrow();
    expect(asked).toBe(1);
    // No pointerup will come for a pointer that is gone: the next press must still start a drag.
    c.setPointerCapture = () => undefined;
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 100, clientY: 100, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 4, pointerType: 'touch', clientX: 0, clientY: 100, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4, pointerType: 'touch', clientX: 0, clientY: 100, bubbles: true }));
    expect(fly.pose().yaw).toBeGreaterThan(0);
  });

  it('a mouse press whose pointer lock is refused does not throw or reject, and the drag look still works', async () => {
    const c = fly['canvas'];
    const unhandled: unknown[] = [];
    const seen = (r: unknown): void => { unhandled.push(r); };
    process.on('unhandledRejection', seen);
    let asks = 0;
    c.requestPointerLock = (() => { asks++; return Promise.reject(new DOMException('exited', 'SecurityError')); }) as unknown as HTMLCanvasElement['requestPointerLock'];
    fly.setPose({ yaw: 0, pitch: 0 });
    expect(() => c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'mouse', clientX: 100, clientY: 100, bubbles: true }))).not.toThrow();
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, pointerType: 'mouse', clientX: 40, clientY: 100, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'mouse', clientX: 40, clientY: 100, bubbles: true }));
    await new Promise((done) => setTimeout(done, 20));
    process.off('unhandledRejection', seen);
    expect(asks).toBe(2);                                    // the raw ask, then the plain one
    expect(unhandled).toEqual([]);
    expect(fly.pose().yaw).toBeGreaterThan(0);               // dragged
  });

  it('a release that throws is swallowed too', () => {
    const c = fly['canvas'];
    c.hasPointerCapture = () => true;
    c.releasePointerCapture = () => { throw new DOMException('gone', 'NotFoundError'); };
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, pointerType: 'mouse', clientX: 10, clientY: 10, bubbles: true }));
    expect(() => c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, pointerType: 'mouse', clientX: 10, clientY: 10, bubbles: true }))).not.toThrow();
  });

  it('the stick held at its rim boosts, the way a double-tapped W does', () => {
    const distance = (boost: boolean): number => {
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      fly.setStick(0, 1);
      fly.setStickBoost(boost);
      run(fly, 2, 120);
      fly.setStick(0, 0);
      fly.setStickBoost(false);
      return -fly.pose().z;
    };
    const plain = distance(false);
    expect(distance(true)).toBeGreaterThan(plain * 3);
  });

  describe('no sprint on foot (owner, 2026-09-28)', () => {
    it('the ground wish never carries a boost: not a double-tapped W, not the stick held at its rim', () => {
      fly.setWalking(true);
      press('KeyW');
      release('KeyW');
      press('KeyW');
      expect(fly.groundWish()).toEqual({ forward: 1, right: 0, boost: false });
      release('KeyW');
      fly.setStick(0, 1);
      fly.setStickBoost(true);
      expect(fly.groundWish()).toEqual({ forward: 1, right: 0, boost: false });
    });

    it('a W double-tapped while walking arms nothing: flying with W held afterwards is unboosted', () => {
      fly.setWalking(true);
      press('KeyW');
      release('KeyW');
      press('KeyW');                                   // the second tap, on foot
      fly.setWalking(false);                           // the mode switches with W still down
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      run(fly, 2, 120);
      const carried = -fly.pose().z;
      release('KeyW');
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
      press('KeyW');
      run(fly, 2, 120);
      release('KeyW');
      expect(carried).toBeCloseTo(-fly.pose().z, 6);
    });

    it('the rim-held stick boost is dropped on entering the walk and ignored there; flying it works again', () => {
      const flown = (): number => {
        fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
        fly.setStick(0, 1);
        run(fly, 2, 120);
        fly.setStick(0, 0);
        return -fly.pose().z;
      };
      fly.setStickBoost(true);
      fly.setWalking(true);
      fly.setWalking(false);                           // in and out again: the boost did not survive
      const plain = flown();
      fly.setWalking(true);
      fly.setStickBoost(true);                         // asked for on foot: ignored
      fly.setWalking(false);
      expect(flown()).toBeCloseTo(plain, 6);
      fly.setStickBoost(true);
      expect(flown()).toBeGreaterThan(plain * 3);      // the fly camera keeps its boost
      fly.setStickBoost(false);
    });
  });

  it('lookFrom faces the target', () => {
    fly.lookFrom([0, 0, 0], [0, 0, -100]);
    expect(fly.pose().yaw).toBeCloseTo(0, 4);
    expect(fly.pose().pitch).toBeCloseTo(0, 4);

    fly.lookFrom([0, 0, 0], [100, 0, 0]);
    expect(fly.pose().yaw).toBeCloseTo(270, 4);                 // -90, stored canonical in [0, 360) (yaw.ts)
  });
});

describe('the trigger (W2.5): a left click while the mouse is captured', () => {
  it('fires on a left press and releases on its up while locked; the click that takes the lock does not fire', () => {
    const c = canvas();
    const trigger: boolean[] = [];
    const fly = new FlyCamera(c, { onFire: (down) => trigger.push(down) });
    const mouse = (type: string, button = 0): void => {
      c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button, bubbles: true }));
    };
    // The click that asks for the lock: not a shot.
    mouse('pointerdown');
    mouse('pointerup');
    expect(trigger).toEqual([]);
    // The browser grants it.
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(fly.isLocked()).toBe(true);
    mouse('pointerdown');
    mouse('pointerup');
    mouse('pointerdown', 2);                       // a right press is not the trigger
    mouse('pointerup', 2);
    expect(trigger).toEqual([true, false]);
    // Held when the lock goes (Esc): the trigger is let go.
    mouse('pointerdown');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(trigger).toEqual([true, false, true, false]);
  });
});

describe('Escape releases the pointer lock (a browser adaptation, no original)', () => {
  // Ported from Chris's browser-beta-v5 (camera.ts): a browser's own Escape is not sure to drop the lock (headless
  // Chrome), so the camera asks for it. The game has no pointer lock; the page's other Escape listeners are separate.
  const lockTo = (el: Element | null): void => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el });
  };

  it('Escape with the canvas holding the lock asks the document to exit it, and moves nothing', () => {
    const c = canvas();
    const fly = new FlyCamera(c);
    fly.setScale(0.1);
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    const exit = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exit;
    lockTo(c);
    press('Escape');
    expect(exit).toHaveBeenCalledTimes(1);
    run(fly, 1, 60);
    expect(fly.pose()).toMatchObject({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    release('Escape');
    lockTo(null);
  });

  it('Escape without the lock, or with another element holding it, asks nothing; other keys never ask', () => {
    const c = canvas();
    new FlyCamera(c);
    const exit = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exit;
    lockTo(null);
    press('Escape');
    release('Escape');
    lockTo(document.createElement('div'));
    press('Escape');
    release('Escape');
    lockTo(c);
    press('KeyQ');
    release('KeyQ');
    expect(exit).not.toHaveBeenCalled();
    lockTo(null);
  });
});

describe('the Forge editor\'s R/F vertical moves stay in the Forge (FP-1b; REVIEW-B 9; a browser adaptation, FG.R2)', () => {
  it('a fly camera that is not the forge editor\'s (the test room\'s, the match\'s fallback) never moves on R or F', () => {
    const fly = new FlyCamera(canvas());
    fly.setScale(0.1);
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    for (const code of ['KeyR', 'KeyF']) {
      press(code);
      run(fly, 0.5, 30);
      release(code);
      run(fly, 2, 60);
      expect(fly.pose(), code).toEqual({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    }
    fly.dispose();
  });

  it('the forge editor\'s camera, its right button held, rises on R and sinks on F', () => {
    const c = canvas();
    const fly = new FlyCamera(c, { forgeKbm: true });
    fly.setScale(0.1);
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    c.dispatchEvent(new MouseEvent('pointerdown', { button: 2, bubbles: true, cancelable: true }));
    press('KeyR');
    run(fly, 0.5, 30);
    release('KeyR');
    run(fly, 2, 60);
    const up = fly.pose().y;
    expect(up).toBeGreaterThan(0);
    press('KeyF');
    run(fly, 1, 60);
    release('KeyF');
    run(fly, 2, 60);
    expect(fly.pose().y).toBeLessThan(up);
    c.dispatchEvent(new MouseEvent('pointerup', { button: 2, bubbles: true, cancelable: true }));
    fly.dispose();
  });
});

describe("the forge editor camera's numbers are named (FP-1b; REVIEW-B 15; browser adaptations, FG.R2)", () => {
  it('names its collision radius, the orthographic wheel zoom, its bounds and the Z / C step, and uses no bare literal for them', async () => {
    const cam = await import('../src/camera');
    expect([cam.FORGE_CAMERA_RADIUS_M_ADAPTATION, cam.FORGE_ORTHO_WHEEL_ZOOM_ADAPTATION, cam.FORGE_ORTHO_ZOOM_MIN_ADAPTATION,
      cam.FORGE_ORTHO_ZOOM_MAX_ADAPTATION, cam.FORGE_ORTHO_ZOOM_STEP_ADAPTATION]).toEqual([0.25, 0.002, 0.1, 100, 0.9]);
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/camera.ts'), 'utf-8');
    expect(src).not.toMatch(/0\.25 \/ this\.metersPerUnit/);
    expect(src).not.toMatch(/Math\.exp\(-deltaY \* 0\.002\)/);
    expect(src).not.toMatch(/, 0\.1, 100\)/);
    expect(src).not.toMatch(/\? 0\.9 : 1 \/ 0\.9/);
  });
});
