// The page entry's boot failure handler (`src/bootFailure.ts`, used by `src/entry.ts`). A browser adaptation, no
// original: a navigation that aborts the page chunk's `import()` mid-flight rejects `bootPage`, and WebKit reports
// the unhandled rejection as a pageerror ("Importing a module script failed.", e2e/startup.spec.ts, ios-layout; the
// modern UI plan's Log, MU-P1a). That one case is warned; every other boot failure -- a missing `./main` or front-end
// chunk, a throw in the boot -- is rethrown, so it stays an unhandled rejection the e2e pageerror checks catch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bootFailure, isNavigationAbort } from '../src/bootFailure';

describe('isNavigationAbort', () => {
  it('is WebKit\'s rejected module import and an AbortError', () => {
    expect(isNavigationAbort(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isNavigationAbort(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true);
  });
  it('is nothing else', () => {
    expect(isNavigationAbort(new TypeError('Failed to fetch dynamically imported module: http://x/src/main.ts'))).toBe(false);
    expect(isNavigationAbort(new Error('Importing a module script failed.'))).toBe(false);
    expect(isNavigationAbort(new TypeError('x is not a function'))).toBe(false);
    expect(isNavigationAbort(new Error('boom'))).toBe(false);
    expect(isNavigationAbort('Importing a module script failed.')).toBe(false);
    expect(isNavigationAbort(null)).toBe(false);
    expect(isNavigationAbort(undefined)).toBe(false);
  });
});

describe('bootFailure', () => {
  it('warns for the navigation abort and does not throw', () => {
    const warn = vi.fn();
    expect(() => bootFailure(new TypeError('Importing a module script failed.'), warn)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('rethrows every other failure, the same value, unwarned', () => {
    const warn = vi.fn();
    const missing = new TypeError('Failed to fetch dynamically imported module: http://x/src/main.ts');
    expect(() => bootFailure(missing, warn)).toThrow(missing);
    const boom = new Error('boom');
    expect(() => bootFailure(boom, warn)).toThrow(boom);
    expect(warn).not.toHaveBeenCalled();
  });
  it('a rejected boot through it stays rejected unless it is the abort', async () => {
    const warn = vi.fn();
    const boom = new Error('boom');
    await expect(Promise.reject(boom).catch((e: unknown) => bootFailure(e, warn))).rejects.toBe(boom);
    await expect(Promise.reject(new TypeError('Importing a module script failed.')).catch((e: unknown) => bootFailure(e, warn))).resolves.toBeUndefined();
  });
});

describe('entry.ts', () => {
  it('hands the boot\'s rejection to bootFailure, not a catch-all warning', () => {
    const s = readFileSync(join(__dirname, '..', 'src', 'entry.ts'), 'utf8');
    expect(s).toMatch(/import \{ bootFailure \} from '\.\/bootFailure'/);
    expect(s).toMatch(/bootPage\(location\.pathname \+ location\.search\)\.catch\(bootFailure\)/);
    expect(s).not.toMatch(/console\.warn/);
  });
});
