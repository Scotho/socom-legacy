// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('a release: the forge\'s camera (forgeKbm) flies on W; the default camera does not', () => {
    vi.stubEnv('DEV', false);
    const forge = new FlyCamera(document.createElement('canvas'), { forgeKbm: true });
    expect(flown(forge)).toBeGreaterThan(0.1);
    forge.dispose();
    const other = new FlyCamera(document.createElement('canvas'));
    expect(flown(other)).toBe(0);
    other.dispose();
  });

  it('a release: the forge\'s camera looks with the captured mouse; the default camera does not', () => {
    vi.stubEnv('DEV', false);
    const look = (opts: { forgeKbm?: true }): number => {
      const c = document.createElement('canvas');
      const fly = new FlyCamera(c, opts);
      fly.setPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
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
    const fly = new FlyCamera(document.createElement('canvas'), { forgeKbm: true });
    fly.setInputSuspended(true);
    expect(flown(fly)).toBe(0);
    fly.setInputSuspended(false);
    expect(flown(fly)).toBeGreaterThan(0.1);
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
    const gates = cam.filter((l) => l.includes(`if (${gate} || this.forgeKbm)`) || l.includes(`if ((${gate} || this.forgeKbm) && this.locked)`));
    expect(gates.length).toBeGreaterThanOrEqual(4);                  // the keys, the lock listener, the locked click, the locked look
    expect(read('camera.ts')).toContain(`if (${gate}) keyboardSite('s2u-kb-fly-camera');`);
    expect(read('walk.ts')).toContain(`if (${gate}) keyboardSite('s2u-kb-walk');`);
    expect(read('walk.ts')).toContain(`if (${gate} || this.camera.forgeKbm === true)`);
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
