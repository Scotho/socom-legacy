// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlyCamera } from '../src/camera';
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
function drag(pointerType: string): { yaw: number; locks: number } {
  const c = canvas();
  let locks = 0;
  c.requestPointerLock = (() => { locks++; return Promise.resolve(); }) as unknown as HTMLCanvasElement['requestPointerLock'];
  const fly = new FlyCamera(c);
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

  it("the settings' Mouse look section is on the page in a development build and gone from a release", () => {
    const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
    const load = (): void => { document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML; };
    for (const dev of [true, false]) {
      vi.stubEnv('DEV', dev);
      load();
      const ui = new Ui();
      const heard: unknown[] = [];
      ui.onLookControls((o) => heard.push(o));
      expect(document.getElementById('look-section') !== null, `DEV ${dev}`).toBe(dev);
      expect(document.getElementById('sensitivity') !== null, `DEV ${dev}`).toBe(dev);
      expect(heard.length, `DEV ${dev}`).toBe(dev ? 1 : 0);
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
        if (f === 'pointer.ts') return;                           // the ask itself (its one caller is gated)
        // Owed in a file sprint 31 holds (research 223 s8): the page's own right-click zoom, `main.ts`.
        if (f === 'main.ts' && line.includes("canvas.addEventListener('mousedown'")) return;
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
