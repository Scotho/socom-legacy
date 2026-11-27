import { onGraphicsEvent } from './graphicsLost';
import { pageSettingsFor } from './pageStore';
import { pageVersion } from './console/pageVersion';
import { viewerRevision } from './revision';
import { pageSoftwareProbeIfKnown } from './softwareRenderer';
import { installXboxMemorySink, XboxMemoryTrace, XBOX_TRACE_STORAGE_CHARS_ADAPTATION } from './xboxMemoryTrace';

/** Browser adaptation: local, opt-in reports. No new network endpoint, GPU probe or automatic transmission. */
export const XBOX_TRACE_CURRENT_KEY = 's2u.xboxDiagnostics.current.v1';
export const XBOX_TRACE_FAILURE_KEY = 's2u.xboxDiagnostics.failure.v1';
export const XBOX_TRACE_SAMPLE_MS_ADAPTATION = 5000;
export interface XboxDiagnosticSession { exportText(): string; dispose(): void }
const installed = new WeakMap<Window, XboxDiagnosticSession>();

export function installXboxDiagnostics(win: Window, search = win.location.search): XboxDiagnosticSession | null {
  if (new URLSearchParams(search).get('xboxdiag') !== '1') return null;
  const prior = installed.get(win);
  if (prior) return prior;
  const doc = win.document, settings = pageSettingsFor(win);
  const metadata = { v: 1, release: pageVersion(), build: viewerRevision(), startedAt: new Date().toISOString(),
    edgeVersion: /\bEdg\/([\d.]+)/.exec(win.navigator.userAgent)?.[1]?.slice(0, 32) ?? null,
    measurement: 'JS heap and reply backing buffers only; not total browser memory; capped payload walks are lower bounds' };
  const read = (key: string): string | null => {
    try {
      const text = settings.get(key);
      if (!text || text.length > XBOX_TRACE_STORAGE_CHARS_ADAPTATION + 2048) return null;
      const parsed = JSON.parse(text) as { v?: unknown; trace?: { v?: unknown } } | null;
      return parsed?.v === 1 && parsed.trace?.v === 1 ? text : null;
    } catch { return null; }
  };
  // Preserve the previous page and the last failure separately. Booting again never overwrites the failure slot.
  const previous = read(XBOX_TRACE_CURRENT_KEY), lastFailure = read(XBOX_TRACE_FAILURE_KEY);
  const envelope = (text: string): string => `${JSON.stringify({ ...metadata, adapter: pageSoftwareProbeIfKnown()?.renderer?.slice(0, 128) ?? null }).slice(0, -1)},"trace":${text}}`;
  const write = (key: string, text: string): void => {
    const result = settings.set(key, text);
    // The trace records that local saving is unavailable instead of reporting a
    // successful save when the shared boundary returns a failed write.
    if (!result.ok) throw result.error;
  };
  const origin = win.performance.now();
  const trace = new XboxMemoryTrace({
    now: () => win.performance.now() - origin,
    heap: () => (win.performance as Performance & { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory,
    save: (text, failed) => {
      const report = envelope(text);
      if (failed) write(XBOX_TRACE_FAILURE_KEY, report);
      write(XBOX_TRACE_CURRENT_KEY, report);
    },
  });
  let stopped = false;
  let interval = 0;
  let offGraphics = (): void => {};
  const startGraphics = (): (() => void) => onGraphicsEvent((kind, info) => {
    if (kind !== 'webglcontextlost' && kind !== 'gpudevicelost' && kind !== 'gpuuncapturederror') return;
    const detail = info.detail ?? '';
    const graphicsCause = /out.?of.?memory/i.test(detail) ? 'out-of-memory' : /validation/i.test(detail) ? 'validation'
      : /internal/i.test(detail) ? 'internal' : 'unknown';
    trace.note(kind === 'gpuuncapturederror' ? 'graphics-error' : 'graphics-lost', {
      ...(info.api === 'WebGL' ? { backend: 'webgl2' as const } : info.api === 'WebGPU' ? { backend: 'webgpu' as const } : {}), graphicsCause,
    }, true);
    win.clearInterval(interval);
  });
  const onError = (): void => { trace.note('page-error', {}, true); win.clearInterval(interval); };
  const onHide = (): void => { trace.note('pagehide'); };

  const panel = doc.createElement('div');
  panel.dataset.xboxDiagnostics = '';
  panel.className = 's2u-notice';
  // Layout only, set one property at a time (chrome_classes: no style block; the colour and type are `s2u-notice`'s). The
  // panel shows on Home and the game page alike, and Home links none of the viewer's sheets, so no class can carry it.
  panel.style.position = 'fixed'; panel.style.bottom = '12px'; panel.style.right = '12px';
  panel.style.zIndex = '2147483646'; panel.style.maxWidth = '90vw';
  const toggle = doc.createElement('button');
  toggle.type = 'button'; toggle.textContent = 'Xbox diagnostic report'; toggle.setAttribute('aria-expanded', 'false');
  const content = doc.createElement('div'); content.hidden = true;
  const status = doc.createElement('p');
  const report = doc.createElement('textarea');
  report.readOnly = true; report.rows = 12; report.cols = 44; report.setAttribute('aria-label', 'Xbox diagnostic report');
  report.style.maxWidth = '80vw';
  const refresh = doc.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Refresh report';
  const copy = doc.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy report';
  const update = (): void => {
    report.value = session.exportText();
    const current = trace.report();
    status.textContent = `${current.failed ? 'Stopped' : 'Recording'} after ${current.lastStage}. ${current.storageAvailable ? 'Saved locally.' : 'Local saving unavailable.'} Heap readings exclude other browser memory.`;
  };
  toggle.addEventListener('click', () => {
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
    if (!content.hidden) update();
  });
  refresh.addEventListener('click', update);
  copy.addEventListener('click', () => {
    update(); report.focus(); report.select();
    try { void win.navigator.clipboard?.writeText(report.value).catch(() => {}); } catch { /* Selected text remains usable. */ }
  });
  content.append(status, report, refresh, copy); panel.append(toggle, content);
  const session: XboxDiagnosticSession = {
    exportText: () => `{"current":${envelope(JSON.stringify(trace.report()))},"previous":${previous ?? 'null'},"lastFailure":${lastFailure ?? 'null'}}`,
    dispose: () => {
      if (stopped) return;
      stopped = true;
      win.clearInterval(interval); offGraphics(); installXboxMemorySink(null);
      win.removeEventListener('error', onError); win.removeEventListener('unhandledrejection', onError); win.removeEventListener('pagehide', onHide);
      panel.remove(); installed.delete(win);
    },
  };
  try {
    (doc.body ?? doc.documentElement).appendChild(panel);
    installXboxMemorySink(trace);
    trace.note('boot');
    interval = win.setInterval(() => trace.note('sample'), XBOX_TRACE_SAMPLE_MS_ADAPTATION);
    offGraphics = startGraphics();
    win.addEventListener('error', onError);
    win.addEventListener('unhandledrejection', onError);
    win.addEventListener('pagehide', onHide);
    installed.set(win, session);
    return session;
  } catch {
    session.dispose();
    return null;
  }
}
