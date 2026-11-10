import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { capturePointer, releasePointer } from '../src/pointer';
import { requestLock } from '../src/pointerLock';

/** The guards around pointer capture: a pointer that is gone is a refusal, never an uncaught throw. */
const notFound = (): never => { throw new DOMException('No active pointer with the given id is found.', 'NotFoundError'); };

describe('capturePointer', () => {
  it('captures and says so', () => {
    const seen: number[] = [];
    expect(capturePointer({ setPointerCapture: (id) => { seen.push(id); } }, 4)).toBe(true);
    expect(seen).toEqual([4]);
  });
  it('says false, and throws nothing, when the pointer is gone', () => {
    expect(capturePointer({ setPointerCapture: notFound }, 9)).toBe(false);
  });
  it('is a yes where there is no capture to ask for: the drag goes on without', () => {
    expect(capturePointer({}, 1)).toBe(true);
  });
});

describe('releasePointer', () => {
  it('lets go of a pointer it holds', () => {
    const seen: number[] = [];
    releasePointer({ hasPointerCapture: () => true, releasePointerCapture: (id) => { seen.push(id); } }, 2);
    expect(seen).toEqual([2]);
  });
  it('leaves a pointer it does not hold alone', () => {
    const seen: number[] = [];
    releasePointer({ hasPointerCapture: () => false, releasePointerCapture: (id) => { seen.push(id); } }, 2);
    expect(seen).toEqual([]);
  });
  it('swallows a refusal, from either call', () => {
    expect(() => releasePointer({ hasPointerCapture: notFound }, 1)).not.toThrow();
    expect(() => releasePointer({ hasPointerCapture: () => true, releasePointerCapture: notFound }, 1)).not.toThrow();
    expect(() => releasePointer({}, 1)).not.toThrow();
  });
});

describe('requestLock: a refused lock is never an uncaught rejection', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 20));
  const refused = (): Promise<never> => Promise.reject(new DOMException('The user has exited the lock before this request was completed.', 'SecurityError'));

  it('asks raw first and is done when it is granted', async () => {
    const asked: unknown[] = [];
    expect(requestLock({ requestPointerLock: (o) => { asked.push(o); return Promise.resolve(); } })).toBe(true);
    await settle();
    expect(asked).toEqual([{ unadjustedMovement: true }]);
  });

  it('falls back to the plain request when the raw one rejects, and swallows the rejection of that too', async () => {
    process.on('unhandledRejection', onUnhandled);
    const asked: unknown[] = [];
    requestLock({ requestPointerLock: (o) => { asked.push(o); return refused(); } });
    await settle();
    process.off('unhandledRejection', onUnhandled);
    expect(asked).toEqual([{ unadjustedMovement: true }, undefined]);     // the raw ask, then the plain one
    expect(unhandled).toEqual([]);
  });

  it('a call that throws at once falls back to the plain request, and a plain one that throws is swallowed', () => {
    const asked: unknown[] = [];
    expect(() => requestLock({ requestPointerLock: (o) => { asked.push(o); throw new DOMException('no', 'InvalidStateError'); } })).not.toThrow();
    expect(asked).toEqual([{ unadjustedMovement: true }, undefined]);
  });

  it('takes a browser whose request returns nothing, and one with no request at all', () => {
    expect(requestLock({ requestPointerLock: () => undefined })).toBe(true);
    expect(requestLock({})).toBe(false);
  });
});

/**
 * Where the ask lives decides which built chunk carries it. `pointer.ts`'s capture guards are shared with the touch layer
 * (`touch.ts`, every page's), so the bundler puts that module in the launcher's shared chunk; when the lock ask sat there
 * too, the built `requestPointerLock` landed in a chunk with neither the forge editor's nor the kbm camera's marker
 * (`build_keyboard.test.ts`, OT.R38 / H115; RB-8 6c923e8d5 made the camera's ask live in a build). The ask is its own
 * module, imported by the camera alone, so it is always bundled beside the camera's `KBM_POINTER_LOCK_SITE`.
 */
describe("the pointer lock ask is the camera's alone (OT.R38 / H115, RB-8)", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(dir, e.name)) : e.name.endsWith('.ts') ? [resolve(dir, e.name)] : []);
  const sources = walk(SRC).map((f) => ({ f: f.slice(SRC.length + 1).split(/[\\/]/).join('/'), text: readFileSync(f, 'utf-8') }));

  it('the shared capture guards ask no lock', () => {
    expect(readFileSync(resolve(SRC, 'pointer.ts'), 'utf-8')).not.toMatch(/requestPointerLock/);
  });
  it('only camera.ts imports the ask', () => {
    const importers = sources.filter((s) => /from '(\.\.?\/)+(\w+\/)*pointerLock'/.test(s.text)).map((s) => s.f);
    expect(importers).toEqual(['camera.ts']);
  });
});
