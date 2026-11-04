/**
 * What the page entry does with a rejected boot (`src/entry.ts`). A browser adaptation, no original. A navigation that
 * aborts the page chunk's `import()` mid-flight rejects `bootPage`; WebKit rejects it with a `TypeError` "Importing a
 * module script failed." and reports the unhandled rejection as a pageerror (e2e/startup.spec.ts, ios-layout; the
 * modern UI plan's Log, MU-P1a); a fetch aborted by the page is an `AbortError`. Those are said and dropped. Every
 * other failure -- a missing `./main` or front-end chunk in another engine, a throw in the boot -- is rethrown and
 * stays an unhandled rejection, which the e2e pageerror checks catch. (WebKit gives the same message for a chunk that
 * is missing outright: on WebKit alone that case is warned too.)
 */
const WEBKIT_IMPORT_FAILED = /^Importing a module script failed\.?$/;

/** A navigation's abort of the boot's import: WebKit's rejected module import, or an `AbortError`. */
export function isNavigationAbort(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (name === 'AbortError') return true;
  return e instanceof TypeError && typeof message === 'string' && WEBKIT_IMPORT_FAILED.test(message);
}

/** The boot's rejection handler: warns for a navigation abort, rethrows anything else unchanged. */
export function bootFailure(e: unknown, warn: (...args: unknown[]) => void = console.warn): void {
  if (!isNavigationAbort(e)) throw e;
  warn('the page did not boot (a navigation aborted its import):', (e as { message?: unknown }).message);
}
