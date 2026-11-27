// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installXboxDiagnostics, XBOX_TRACE_CURRENT_KEY, XBOX_TRACE_FAILURE_KEY } from '../src/xboxDiagnostics';
import { markLoad } from '../src/loadMarks';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import { noteXboxMemory } from '../src/xboxMemoryTrace';
import { resetGraphicsRecordForTest, watchGraphicsLost, watchGraphicsErrors } from '../src/graphicsLost';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; localStorage.clear(); document.body.innerHTML = ''; resetGraphicsRecordForTest(); vi.useRealTimers(); });

describe('opt-in Xbox diagnostics', () => {
  it('registers both persistent keys with the page storage inventory', () => {
    expect(PAGE_SETTING_KEYS).toContain(XBOX_TRACE_CURRENT_KEY);
    expect(PAGE_SETTING_KEYS).toContain(XBOX_TRACE_FAILURE_KEY);
  });
  it('does nothing without the exact opt-in query', () => {
    for (const search of ['', '?renderer=xbox', '?xboxdiag=0']) expect(installXboxDiagnostics(window, search)).toBeNull();
    expect(document.body.children).toHaveLength(0);
    expect(localStorage.length).toBe(0);
  });

  it('persists the last loading stage and failure, then keeps it through another page run', () => {
    vi.useFakeTimers();
    const first = installXboxDiagnostics(window, '?xboxdiag=1')!;
    stop = first.dispose;
    markLoad('world-built');
    noteXboxMemory('renderer-ready', { backend: 'webgl2', width: 640, height: 448 });
    const renderer = { onDeviceLost: (_info: never) => {} };
    watchGraphicsLost(renderer, document);
    renderer.onDeviceLost({ api: 'WebGL', message: 'Unknown reason' } as never);
    const failed = localStorage.getItem(XBOX_TRACE_FAILURE_KEY)!;
    expect(JSON.parse(failed).trace).toMatchObject({ failed: true, lastStage: 'renderer-ready' });
    vi.advanceTimersByTime(30_000);
    expect(localStorage.getItem(XBOX_TRACE_FAILURE_KEY)).toBe(failed);
    first.dispose();
    const second = installXboxDiagnostics(window, '?xboxdiag=1')!;
    stop = second.dispose;
    expect(second.exportText()).toContain('renderer-ready');
    expect(localStorage.getItem(XBOX_TRACE_FAILURE_KEY)).toBe(failed);
    expect(JSON.parse(localStorage.getItem(XBOX_TRACE_CURRENT_KEY)!).trace.failed).toBe(false);
  });

  it('survives blocked storage, can show a selectable report, and cleans up listeners and timers', () => {
    vi.useFakeTimers();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const session = installXboxDiagnostics(window, '?xboxdiag=1')!;
    stop = session.dispose;
    expect(session.exportText()).toContain('"storageAvailable":false');
    const button = document.querySelector('[data-xbox-diagnostics] button') as HTMLButtonElement;
    button.click();
    expect((document.querySelector('[data-xbox-diagnostics] textarea') as HTMLTextAreaElement).value).toContain('not total browser memory');
    session.dispose();
    expect(document.querySelector('[data-xbox-diagnostics]')).toBeNull();
    const before = session.exportText();
    markLoad('start');
    vi.advanceTimersByTime(20_000);
    expect(session.exportText()).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
    set.mockRestore();
  });

  it('never opens a graphics context or installs twice', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('must not probe'); });
    const session = installXboxDiagnostics(window, '?xboxdiag=1')!;
    stop = session.dispose;
    expect(installXboxDiagnostics(window, '?xboxdiag=1')).toBe(session);
    expect(getContext).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-xbox-diagnostics]')).toHaveLength(1);
    getContext.mockRestore();
  });

  it('leaves no recorder or timer when mounting the panel fails', () => {
    vi.useFakeTimers();
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation(() => { throw new Error('mount refused'); });
    expect(installXboxDiagnostics(window, '?xboxdiag=1')).toBeNull();
    markLoad('world-built');
    expect(vi.getTimerCount()).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(document.querySelector('[data-xbox-diagnostics]')).toBeNull();
    append.mockRestore();
  });

  it.each([['OutOfMemoryError', 'out-of-memory'], ['ValidationError', 'validation'], ['InternalError', 'internal'], ['other', 'unknown']])(
    'retains the graphics classification %s without storing the raw message', (type, cause) => {
      const session = installXboxDiagnostics(window, '?xboxdiag=1')!;
      stop = session.dispose;
      const renderer = { onError: (_info: never) => {} };
      watchGraphicsErrors(renderer, document);
      renderer.onError({ api: 'WebGPU', type, message: 'do not persist arbitrary raw details' } as never);
      const record = JSON.parse(localStorage.getItem(XBOX_TRACE_FAILURE_KEY)!);
      expect(record.trace.current.graphicsCause).toBe(cause);
      expect(session.exportText()).not.toContain('do not persist arbitrary raw details');
    },
  );
});
