// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlyCamera, KBM_POINTER_LOCK_SITE } from '../src/camera';
import { MOUSE_SITES } from '../src/mouseTesting';
import { Ui } from '../src/ui';

/**
 * OT.R38 / H115 (the owner, 2026-10-06, "Controller only"): the mouse's look is a local testing option like the keyboard
 * (OT.R29) -- the pointer lock, the locked look and trigger, a mouse's drag look and the settings' Mouse look section
 * sit under a literal `import.meta.env.DEV`, which every `vite build` drops (`test/build_keyboard.test.ts` greps a
 * build for the markers, `src/mouseTesting.ts`). The touch layer stays: a finger's drag looks in every build.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');
const files = [...readdirSync(SRC), ...readdirSync(resolve(SRC, 'net')).map((f) => `net/${f}`)].filter((f) => f.endsWith('.ts'));

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

/** A drag of 60 px left on the canvas by `pointerType`: the yaw it turned, and whether the pointer lock was asked. */
function drag(pointerType: string, options: ConstructorParameters<typeof FlyCamera>[1] = {}): { yaw: number; locks: number } {
  const c = canvas();
  let locks = 0;
  c.requestPointerLock = (() => { locks++; return Promise.resolve(); }) as unknown as HTMLCanvasElement['requestPointerLock'];
  const fly = new FlyCamera(c, options);
  fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, pointerType, clientX: 100, clientY: 100, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 5, pointerType, clientX: 40, clientY: 100, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 5, pointerType, clientX: 40, clientY: 100, bubbles: true }));
  const yaw = fly.pose().yaw;
  fly.dispose();
  return { yaw: yaw > 180 ? yaw - 360 : yaw, locks };
}

describe('a release build has no mouse look (vi.stubEnv DEV false)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('a mouse drag turns and asks for the pointer lock in a development build, neither in a release', () => {
    vi.stubEnv('DEV', true);
    const dev = drag('mouse');
    expect(dev.yaw).toBeGreaterThan(0);
    expect(dev.locks).toBeGreaterThan(0);
    vi.stubEnv('DEV', false);
    expect(drag('mouse')).toEqual({ yaw: 0, locks: 0 });
    expect(drag('pen')).toEqual({ yaw: 0, locks: 0 });
  });

  it("a finger's drag still looks in a release (the touch layer, OT.R29's touch exemption)", () => {
    vi.stubEnv('DEV', false);
    const touch = drag('touch');
    expect(touch.yaw).toBeGreaterThan(0);
    expect(touch.locks).toBe(0);
  });

  // RB-8 (OT.R114, KBM-2): the test room's Mouse look section is kept in a release, since its mouse looks there now; its
  // marker stays the development build's alone. Was (OT.R38): gone from a release.
  it("the settings' Mouse look section is on the page in a development build and in a release (RB-8)", () => {
    const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
    const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev);
      load();
      const ui = new Ui();
      const heard: unknown[] = [];
      ui.onLookControls((o) => heard.push(o));
      expect(document.getElementById('look-section') !== null, `DEV ${dev}`).toBe(true);
      expect(document.getElementById('sensitivity') !== null, `DEV ${dev}`).toBe(true);
      expect(heard.length, `DEV ${dev}`).toBe(1);
    }
  });
});

/**
 * OT.R68 (the owner, 2026-10-21: keyboard and mouse for everything in the forge's creation UI): the camera's lock
 * listener, its locked click and its locked look attach under `DEV || this.forgeKbm` -- the forge editor's camera alone
 * passes the opt-in (`test/forgeKbm.test.ts`); the forge's own lock ask is `test/forge/releaseGate.test.ts`'s.
 */
const OT_R68_FORGE: readonly string[] = [
  "globalThis.document?.addEventListener('pointerlockchange', this.onLockChange);",
  'this.look(e.movementX ?? 0, e.movementY ?? 0);',
];

describe('every mouse-look site is a development build\'s only (OT.R38)', () => {
  it('each pointer lock ask, lock listener and locked mouse move sits under import.meta.env.DEV', () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = readFileSync(resolve(SRC, f), 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\*|\/\/)/.test(line)) return;                  // a comment
        if (!/requestLock\(|'pointerlockchange'|\.movementX|addEventListener\('mousedown'/.test(line) || /removeEventListener/.test(line)) return;
        if (f === 'pointerLock.ts') return;                       // the ask itself (its one caller is gated)
        // RB-8 settled the owed one (research 223 s8): the page's own right-click zoom, `main.ts`, now asks the literal gate
        // or the test room's predicate on its own line (the case below).
        if (lines.slice(Math.max(0, i - 14), i + 1).some((l) => l.includes('import.meta.env.DEV'))) return;
        bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('OT.R68: the camera\'s lock and locked look are the gate\'s or the forge editor\'s opt-in, nothing wider', () => {
    const devFold = 'import.meta.en' + 'v.DEV';
    const lines = readFileSync(resolve(SRC, 'camera.ts'), 'utf-8').split('\n');
    for (const frag of OT_R68_FORGE) {
      const at = lines.flatMap((l, i) => (l.includes(frag) ? [i] : []));
      expect(at, frag).toHaveLength(1);
      const before = lines.slice(Math.max(0, at[0]! - 2), at[0]!);
      expect(before.some((l) => l.includes(`${devFold} || this.forgeKbm`)), frag).toBe(true);
    }
  });

  it("the match's right-click zoom (`matchMount.ts`) is a development build's only: its marker in the source", () => {
    expect(MOUSE_SITES).toContain('s2u-mouse-zoom');
  });

  it('each gated site names its marker for the build test', () => {
    const all = files.map((f) => readFileSync(resolve(SRC, f), 'utf-8')).join('\n');
    for (const site of MOUSE_SITES) expect(all, site).toContain(`mouseSite('${site}')`);
  });
});

/**
 * RB-8 (the replay batch, KBM-2; OT.R114, RB.R4; a browser adaptation): the test room's camera is built with the page's
 * `kbm` predicate, so in a release its mouse asks the pointer lock, looks while locked and drags the look while the
 * predicate holds, and none of it once the room joins an online room. A camera with no opt-in -- the front end's match --
 * keeps OT.R38. The lock asked under the opt-in carries its own name (`KBM_POINTER_LOCK_SITE`), which the build test
 * allows beside the Forge's chunk.
 */
describe("RB-8: the test room's mouse in a release build while its predicate holds (vi.stubEnv DEV false)", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('a mouse drag on a kbm camera turns and asks the pointer lock in a release; with the predicate false, neither', () => {
    vi.stubEnv('DEV', false);
    let on = true;
    const kbm = (): boolean => on;
    const live = drag('mouse', { kbm });
    expect(live.yaw).toBeGreaterThan(0);
    expect(live.locks).toBe(1);
    on = false;
    expect(drag('mouse', { kbm })).toEqual({ yaw: 0, locks: 0 });
    expect(drag('mouse')).toEqual({ yaw: 0, locks: 0 });               // no opt-in: OT.R38 as before
  });

  it('the locked mouse looks and fires on a kbm camera in a release; the predicate turning false lets the lock go at the next frame', () => {
    vi.stubEnv('DEV', false);
    const c = canvas();
    let on = true, exits = 0;
    const fired: boolean[] = [];
    const fly = new FlyCamera(c, { kbm: () => on, onFire: (d) => fired.push(d) });
    fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => c });
    document.exitPointerLock = () => { exits++; };
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(fly.isLocked()).toBe(true);
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', movementX: -60, movementY: 0, bubbles: true } as PointerEventInit));
    expect(fly.pose().yaw).not.toBe(0);
    c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true }));
    expect(fired).toEqual([true]);
    on = false;
    fly.update(1 / 60);
    expect(exits).toBe(1);
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(fired).toEqual([true, false]);                              // the lock's loss lets the trigger go
    fly.dispose();
    delete (document as { pointerLockElement?: unknown }).pointerLockElement;
  });

  it("the source: main.ts's right-click zoom asks the literal gate or the test room's predicate; the camera names its kbm lock", () => {
    const main = readFileSync(resolve(SRC, 'main.ts'), 'utf-8').split('\n');
    const zoom = main.filter((l) => l.includes("canvas.addEventListener('mousedown'"));
    expect(zoom).toHaveLength(1);
    expect(zoom[0]).toContain("e.button === 2 && (import.meta.env.DEV || testroomKbm())");
    expect(KBM_POINTER_LOCK_SITE).toBe('s2u-kbm-pointer-lock');
    const cam = readFileSync(resolve(SRC, 'camera.ts'), 'utf-8');
    expect(cam.split('KBM_POINTER_LOCK_SITE').length - 1).toBeGreaterThanOrEqual(2);   // its export and the ask's use
  });
});
