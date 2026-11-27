import { afterEach, describe, expect, it, vi } from 'vitest';
import { error as threeError, log as threeLog, setConsoleFunction, warn as threeWarn } from 'three';
import { installThreeConsole, resetThreeConsoleForTest, scrubThreeMessage, THREE_MESSAGE_MAX } from '../src/threeConsole';
import { ClientErrorBeacon, THREE_ERRORS_PER_LOAD_ADAPTATION } from '../src/clientErrorBeacon';

/**
 * LATER 859's instrument (product track, a browser adaptation): three's error-level console messages -- the async compile's
 * swallowed validation errors among them -- given to the beacon, with the console's own output unchanged.
 */
afterEach(() => { resetThreeConsoleForTest(); vi.restoreAllMocks(); });

type Calls = unknown[][];
/** What three prints for a fixed set of calls, through a recording console. */
function printed(install: boolean, onError: (m: string) => void = () => undefined): { log: Calls; warn: Calls; error: Calls } {
  const out = { log: [] as Calls, warn: [] as Calls, error: [] as Calls };
  const spies = (['log', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { out[k].push(a); }));
  if (install) installThreeConsole(onError);
  const stack = { isStackTrace: true, getError: (m: string) => `ERR(${m})`, getLocation: () => 'at x.ts:1' };
  threeLog('Renderer: hello', 3);
  threeWarn('WebGPURenderer: a warning', { a: 1 });
  threeWarn('TSL: a node warning', stack);
  threeError('WebGPURenderer: Async render pipeline creation failed (p1): Buffer creation failed');
  threeError('TSL: a node error', stack);
  for (const s of spies) s.mockRestore();
  return out;
}

describe('LATER 859: three’s console hooked, its output unchanged', () => {
  it('prints exactly what three’s default prints, at every level (with and without a stack trace)', () => {
    const plain = printed(false);
    resetThreeConsoleForTest();
    const hooked = printed(true);
    expect(hooked).toEqual(plain);
    expect(plain.error).toHaveLength(2);
  });

  it('gives each error-level message to the beacon, scrubbed, and nothing else', () => {
    const got: string[] = [];
    printed(true, (m) => got.push(m));
    expect(got).toEqual([
      'THREE.WebGPURenderer: Async render pipeline creation failed (p1): Buffer creation failed',
      'THREE.TSL: a node error at x.ts:1',
    ]);
  });

  it('a console function set before ours is handed every call instead of the default', () => {
    const before: unknown[][] = [];
    setConsoleFunction(((...a: unknown[]) => { before.push(a); }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const got: string[] = [];
    installThreeConsole((m) => got.push(m));
    threeError('WebGPURenderer: x');
    expect(before).toEqual([['error', 'THREE.WebGPURenderer: x']]);
    expect(err).not.toHaveBeenCalled();
    expect(got).toEqual(['THREE.WebGPURenderer: x']);
  });

  it('installs once a page; an onError that throws never reaches three', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(installThreeConsole(() => { throw new Error('no'); })).toBe(true);
    expect(installThreeConsole(() => undefined)).toBe(false);
    expect(() => threeError('WebGPURenderer: y')).not.toThrow();
  });
});

describe('LATER 859: the scrub (no address, path, source or dump reaches central)', () => {
  it('cuts URLs with their queries and file paths, keeps three’s own words', () => {
    expect(scrubThreeMessage('THREE.Loader: failed https://example.test/a/b.png?token=SECRET and blob:https://x/1'))
      .toBe('THREE.Loader: failed <url> and blob:<url>');
    expect(scrubThreeMessage('at C:\\Users\\someone\\game\\x.js and /Users/someone/x.js and /home/someone/y'))
      .toBe('at <path>');                                             // a path runs to the next quote or bracket (F2)
    expect(scrubThreeMessage('(at C:\\x\\y.js) and (/Users/someone/x.js)')).toBe('(at <path>) and (<path>)');
    expect(scrubThreeMessage('THREE.WebGPURenderer: Async render pipeline creation failed (mat_12): In Device::create_buffer'))
      .toBe('THREE.WebGPURenderer: Async render pipeline creation failed (mat_12): In Device::create_buffer');
  });

  it('review F1/F2: a shader excerpt after the message is dropped; names with spaces, UNC, extension and home paths are cut whole', () => {
    expect(scrubThreeMessage('THREE.WebGPURenderer: Shader error in "p1":\n  let x = secretThing;\n      ^')).toBe('THREE.WebGPURenderer: Shader error in "p1":');
    expect(scrubThreeMessage('failed C:\\Users\\someone else\\a.png')).toBe('failed <path>');
    expect(scrubThreeMessage('failed "/home/someone else/a" then')).toBe('failed "<path>" then');
    expect(scrubThreeMessage('failed \\\\server\\share\\john\\a.png')).toBe('failed <path>');
    expect(scrubThreeMessage('at moz-extension://1234-abcd/x.js and chrome-extension://zz/y.js')).toBe('at <url> and <url>');
    expect(scrubThreeMessage('in /Volumes/Disk/x and ~/stuff/y')).toBe('in <path>');
  });

  it('keeps only short one-line string arguments: never shader source, objects or long text; one line; capped', () => {
    const source = 'fn main() {\n  return;\n}';
    expect(scrubThreeMessage('THREE.x', [source, { a: 1 }, 'short', 'y'.repeat(201)])).toBe('THREE.x short');
    expect(scrubThreeMessage('a\tb  c\nd')).toBe('a b c');                // one line: the first (F1), spaces collapsed
    expect(scrubThreeMessage('z'.repeat(5000))).toHaveLength(THREE_MESSAGE_MAX);
  });
});

describe('LATER 859: the beacon’s threeerror -- its own budget, never the record', () => {
  const beacon = () => {
    const sent: string[] = [];
    const ctx = { release: '0.4.27', builtAt: null, backend: 'webgpu', adapter: 'A', map: 'MP2', matchElapsedMs: null };
    return { sent, b: new ClientErrorBeacon({ context: () => ctx, send: (body) => { sent.push(body); }, now: () => 0 }) };
  };

  it('sends at most five a load, each its own row with a count of 1; the rest counted on the page', () => {
    const { sent, b } = beacon();
    for (let i = 0; i < 9; i++) b.reportThree(`THREE.m${i}`);
    expect(THREE_ERRORS_PER_LOAD_ADAPTATION).toBe(5);
    expect(sent).toHaveLength(5);
    const rows = sent.map((s) => JSON.parse(s) as { kind: string; message: string; count: number });
    expect(rows.map((r) => r.kind)).toEqual(Array(5).fill('threeerror'));
    expect(rows.map((r) => r.count)).toEqual([1, 1, 1, 1, 1]);
    expect(rows[0]!.message).toBe('THREE.m0');
    expect(b.threeErrorsSeen()).toBe(9);
  });

  it('changes nothing the page records or shows, and holds no real error back', () => {
    const { sent, b } = beacon();
    const before = { rec: b.record(), text: b.text() };
    for (let i = 0; i < 7; i++) b.reportThree('THREE.x');
    expect(b.record()).toEqual(before.rec);
    expect(b.text()).toBe(before.text);
    b.report('gpuuncapturederror', 'Validation Error');
    expect(sent).toHaveLength(6);
    expect(JSON.parse(sent[5]!).kind).toBe('gpuuncapturederror');
  });
});
