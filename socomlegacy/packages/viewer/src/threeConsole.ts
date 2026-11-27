import { getConsoleFunction, setConsoleFunction } from 'three';

/**
 * LATER 859's instrument (`THREE_CONSOLE_BEACON_ADAPTATION`; product track, a browser adaptation with no original -- it
 * changes nothing drawn and nothing the console prints). three r186 reports some WebGPU failures only through its own
 * console (`three/src/utils.js` `error`, ~:300-320): above all its async pipeline compile, which pushes a device-wide
 * 'validation' error scope and AWAITS the pipeline before popping it (`WebGPUPipelineUtils.js` ~:252/:315), so a
 * validation error of any other call made meanwhile -- a frame's `createBuffer` for a new render object's uniforms -- is
 * caught by that scope and logged as "Async render pipeline creation failed (...)", never raised as an uncaptured error.
 * The page then sees only the later write to the invalid buffer (central, 2026-11-12..19: eleven Firefox / GTX 980 pages
 * demoted on "Queue::write_buffer ... bindingBuffer... label is invalid", each outside a match).
 *
 * The hook: three's console function, set once, prints exactly what three's own default prints (or hands the call on to a
 * function set before ours), then gives an `error`-level message to `onError`, scrubbed (`scrubThreeMessage`). The beacon
 * (`ClientErrorBeacon.reportThree`) sends it under its own kind and budget.
 */
export const THREE_CONSOLE_BEACON_ADAPTATION = "three's error-level console messages told to the page's beacon" as const;

/** The longest scrubbed message (the beacon's message cap is 1024). */
export const THREE_MESSAGE_MAX = 1024;
/** A string argument after the message is kept only when it is one short line (never shader source or a dump). */
const PARAM_MAX = 200;

type Level = 'log' | 'warn' | 'error';
type ConsoleFn = (level: Level, message: string, ...params: unknown[]) => void;
interface StackTraceLike { isStackTrace?: boolean; getError(message: string): unknown }

/** three's own default for a level, as `utils.js` prints it when no console function is set. */
function threeDefault(level: Level, message: string, params: unknown[], out: Pick<Console, Level>): void {
  const st = params[0] as StackTraceLike | undefined;
  if (level !== 'log' && st && typeof st === 'object' && st.isStackTrace) out[level](st.getError(message));
  else out[level](message, ...params);
}

/**
 * Three's text with nothing personal: addresses (and their query strings) and file paths cut to `<url>` / `<path>`, one
 * line, capped. Only the message and short one-line string arguments are kept -- never an object, a source or a stack.
 */
export function scrubThreeMessage(message: unknown, params: readonly unknown[] = []): string {
  // Review F1: the message's first line only -- three's shader diagnostics put the WGSL line and its caret after a newline.
  const parts = [(typeof message === 'string' ? message : String(message)).split(/\r?\n/, 1)[0]!];
  for (const p of params) if (typeof p === 'string' && p.length <= PARAM_MAX && !/[\r\n]/.test(p)) parts.push(p);
  // Review F2: any scheme's address; a path cut to the next quote or bracket, so a name with a space is never half kept.
  return parts.join(' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/\b[A-Za-z]:[\\/][^'"()]*/g, '<path>')
    .replace(/\\\\[^\s\\'"()]+\\[^'"()]*/g, '<path>')
    .replace(/(?:^|(?<=[\s'"(]))(?:~|\/(?:Users|home|root|var|tmp|private|mnt|opt|Volumes|media))\/[^'"()]*/g, '<path>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, THREE_MESSAGE_MAX);
}

let installed = false;

/**
 * Installs the hook once a page. `onError` gets each error-level message scrubbed; it never throws into three. Returns
 * whether this call installed it.
 */
export function installThreeConsole(onError: (message: string) => void, out: Pick<Console, Level> = console): boolean {
  if (installed) return false;
  installed = true;
  const before = getConsoleFunction() as ConsoleFn | null;
  setConsoleFunction(((level: Level, message: string, ...params: unknown[]) => {
    if (before) before(level, message, ...params); else threeDefault(level, message, params, out);
    if (level === 'error') { try { onError(scrubThreeMessage(message, params)); } catch { /* the instrument never adds an error */ } }
  }) as never);
  return true;
}

/** Tests only: three's console function back as it was before none was set, and the once-a-page latch cleared. */
export function resetThreeConsoleForTest(): void {
  setConsoleFunction(null as never);
  installed = false;
}
