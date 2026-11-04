// @vitest-environment jsdom
/**
 * The public status page (PST-1, the local slice of PST-4). Product track. The states, the visitor's own failed
 * connection, the hidden probe address and the latency words beside the number (H296's bands, answered 2026-10-24).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STATUS_FETCH_TIMEOUT_MS_ADAPTATION, STATUS_LATENCY_BANDS_ADAPTATION, STATUS_REGION_LABELS_ADAPTATION,
} from '../src/projectSite/statusConfig';
import {
  deriveStatus, fixtureReport, formatChecked, headlineFor, hostsFromHealth, latencyWord, loadStatus,
  medianDroppingFirst, probeOrigins, regionService, rowDetail, type StatusAsk, type StatusReport,
} from '../src/projectSite/statusModel';
import { statusPage, stopStatusPage } from '../src/projectSite/statusPage';

const here = dirname(fileURLToPath(import.meta.url));
const hiddenOrigin = 'https://probe.invalid';
const AT = Date.UTC(2026, 9, 28, 12, 0, 0);
const LABEL = STATUS_REGION_LABELS_ADAPTATION[0];

afterEach(() => {
  document.querySelectorAll('.project-shell').forEach((node) => stopStatusPage(node as HTMLElement));
  document.body.replaceChildren();
  vi.useRealTimers();
});

function hosts(over: Partial<{ live: number; placeable: number; full: number; validated: number; drain: number; version: number }> = {}) {
  return { live: 1, placeable: 1, full: 0, validated: 1, drain: 0, version: 0, ...over };
}
function health(body: unknown, status = 200): StatusAsk {
  return { kind: 'json', at: AT, status, body };
}
function site(): StatusAsk {
  return { kind: 'text', at: AT, status: 200 };
}
function report(healthAsk: StatusAsk, region: 'off' | 'failed' | { ms: number } = 'off', website: StatusAsk = site(), previous: StatusReport | null = null, now = AT): StatusReport {
  return deriveStatus({
    now, staleMs: 120_000, website, health: healthAsk, previous,
    regions: [{ label: LABEL, probe: region }],
  });
}
/** A page-transition event (jsdom's Event, `persisted` set as a browser sets it on bfcache entry and restore). */
function transition(type: 'pagehide' | 'pageshow', persisted: boolean): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}
function row(page: HTMLElement, id: string): HTMLElement {
  const found = page.querySelector<HTMLElement>(`.project-status-row[data-row="${id}"]`);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

describe('the states come from the service report', () => {
  it('online services: ok is operational, draining is maintenance, a bad body is unknown', () => {
    expect(report(health({ ok: true, hosts: hosts() })).rows[1]).toMatchObject({ service: 'operational', reach: 'ok' });
    expect(report(health({ ok: true, draining: true, hosts: hosts({ placeable: 0, live: 1, drain: 1 }) })).rows[1]?.service).toBe('maintenance');
    expect(report(health({ ok: false, hosts: hosts() })).rows[1]?.service).toBe('unknown');
    expect(headlineFor(report(health({ ok: true, draining: true, hosts: hosts({ placeable: 0, live: 1, drain: 1 }) })).rows)).toBe('Down for maintenance.');
  });

  it('a region: placeable, full, drain, version, and nothing live', () => {
    expect(regionService(hosts())).toBe('operational');
    expect(regionService(hosts({ full: 1 }))).toBe('degraded');
    expect(regionService(hosts({ placeable: 0, live: 1, drain: 1 }))).toBe('maintenance');
    expect(regionService(hosts({ placeable: 0, live: 1, version: 1 }))).toBe('maintenance');
    expect(regionService(hosts({ live: 0, placeable: 0, validated: 1 }))).toBe('down');
    expect(regionService(hosts({ validated: 0, live: 0, placeable: 0 }))).toBe('unknown');
    expect(hostsFromHealth({ hosts: { live: 1, placeable: '1', full: 0, validated: 1 } })).toBeNull();
  });

  it('nothing live while central itself drains reads Maintenance; nothing live with no signal reads Down', () => {
    // Central's counts never pair live 0 with drain or version above 0 (a draining or other-release host still has a
    // link, so it is counted live: central directory.ts hostViews / liveStates). The one signal with nothing live is
    // central's own /health draining, its shutdown. A host whose link closed for an update reads Down (LATER 646).
    expect(regionService(hosts({ live: 0, placeable: 0, validated: 2 }), true)).toBe('maintenance');
    const updating = report(health({ ok: true, draining: true, hosts: hosts({ live: 0, placeable: 0, validated: 1 }) }));
    expect(updating.rows[2]?.service).toBe('maintenance');
    expect(headlineFor(updating.rows)).toBe('Down for maintenance.');
    // Nothing live and no maintenance signal is still Down.
    expect(regionService(hosts({ live: 0, placeable: 0, validated: 2 }))).toBe('down');
    expect(regionService(hosts({ live: 0, placeable: 0, validated: 2 }), false)).toBe('down');
    expect(report(health({ ok: true, hosts: hosts({ live: 0, placeable: 0, validated: 1 }) })).rows[2]?.service).toBe('down');
    // A region that can still place a game keeps its state while one host updates.
    expect(regionService(hosts({ live: 2, placeable: 1, validated: 2, drain: 1 }))).toBe('operational');
    expect(regionService(hosts({ live: 2, placeable: 1, validated: 2, full: 1 }), true)).toBe('degraded');
  });

  it('the down fixture keeps the website up and names the match server down', () => {
    const down = fixtureReport('down');
    expect(down).not.toBeNull();
    expect(headlineFor(down!.rows)).toBe('A match server is down.');
    expect(down!.rows.map((r) => [r.label, r.service])).toEqual([
      ['Website', 'operational'], ['Online services', 'operational'], [LABEL, 'down'],
    ]);
    expect(fixtureReport('up')!.rows[2]).toMatchObject({ service: 'operational', latencyMs: 48, probe: 'measured' });
    expect(fixtureReport('unknown')!.rows.every((r) => r.service === 'unknown' && r.reach === 'pending')).toBe(true);
    expect(fixtureReport('nope')).toBeNull();
  });
});

describe('a failed connection is the player’s, not an outage', () => {
  it('the first failed check says unreachable and does not say the match server is down', () => {
    const failed = report({ kind: 'network', at: AT }, 'off', { kind: 'network', at: AT });
    expect(headlineFor(failed.rows)).toBe('We could not check from your network.');
    expect(failed.rows.every((r) => r.reach === 'unreachable' && r.service === 'unknown')).toBe(true);
    for (const r of failed.rows) {
      expect(rowDetail(r)).toContain('not an outage of the whole game');
      expect(rowDetail(r)).not.toMatch(/match server is down/);
    }
  });

  it('an error answer from /health is no report from the online services, not the visitor\'s network (F2)', () => {
    for (const bad of [
      { kind: 'http', at: AT, status: 502 }, { kind: 'http', at: AT, status: 530 }, { kind: 'text', at: AT, status: 200 },
    ] as StatusAsk[]) {
      const page = report(bad);
      expect(page.rows[0]).toMatchObject({ service: 'operational', reach: 'ok' });
      for (const r of page.rows.slice(1)) {
        expect(r, `${bad.kind} ${r.id}`).toMatchObject({ service: 'unknown', reach: 'noReport', checkedAt: AT, stale: false });
        expect(rowDetail(r)).toContain('No report from the online services');
        expect(rowDetail(r)).not.toMatch(/your (device|network)/i);
        expect(rowDetail(r)).not.toContain('not an outage of the whole game');
      }
      expect(headlineFor(page.rows)).toBe('No report from the online services.');
    }
    // A fresh report is not carried over an error answer: the error is itself the news.
    const fresh = report(health({ ok: true, hosts: hosts() }));
    const after = report({ kind: 'http', at: AT + 30_000, status: 502 }, 'off', site(), fresh, AT + 30_000);
    expect(after.rows[1]).toMatchObject({ service: 'unknown', reach: 'noReport' });
    expect(after.rows[2]).toMatchObject({ service: 'unknown', reach: 'noReport' });
    // The website's own error answer is the website's, not the visitor's network.
    const site502 = report(health({ ok: true, hosts: hosts() }), 'off', { kind: 'http', at: AT, status: 502 });
    expect(site502.rows[0]).toMatchObject({ service: 'unknown', reach: 'noReport' });
    expect(rowDetail(site502.rows[0]!)).toBe('The website answered with an error.');
    // A real network error (the fetch rejected) keeps the network wording.
    const blind = report({ kind: 'network', at: AT });
    expect(blind.rows[1]).toMatchObject({ service: 'unknown', reach: 'unreachable' });
    expect(rowDetail(blind.rows[1]!)).toContain('Your device or network could not reach it');
    // A timing check that answered still shows its number beside the missing report.
    const timed = report({ kind: 'http', at: AT, status: 502 }, { ms: 48 });
    expect(timed.rows[2]).toMatchObject({ service: 'unknown', reach: 'noReport', latencyMs: 48, probe: 'measured' });
    expect(rowDetail(timed.rows[2]!)).toContain('Your latency: 48 ms (Good).');
  });

  it('a placeable region the device cannot time keeps the service report beside the network line', () => {
    const page = report(health({ ok: true, hosts: hosts() }), 'failed');
    const region = page.rows[2]!;
    expect(region.service).toBe('operational');
    expect(region.reach).toBe('unreachable');
    expect(headlineFor(page.rows)).toBe('Everything we checked is up.');
    expect(rowDetail(region)).toContain('Unreachable from your network');
    expect(rowDetail(region)).toContain('not an outage of the whole game');
    expect(rowDetail(region)).not.toContain('Down');
  });

  it('a fresh service report is kept when the next check cannot connect, and a stale one becomes unknown', () => {
    const fresh = report(health({ ok: true, hosts: hosts() }));
    const kept = report({ kind: 'network', at: AT + 30_000 }, 'off', { kind: 'network', at: AT + 30_000 }, fresh, AT + 30_000);
    expect(kept.rows[1]).toMatchObject({ service: 'operational', reach: 'unreachable' });
    expect(kept.rows[2]).toMatchObject({ service: 'operational', reach: 'unreachable' });
    const stale = report({ kind: 'network', at: AT + 121_000 }, 'off', site(), fresh, AT + 121_000);
    expect(stale.rows[1]).toMatchObject({ service: 'unknown', reach: 'unreachable', stale: true });
    expect(rowDetail(stale.rows[1]!)).toContain('too old to trust');
  });
});

describe('latency is a number with a word beside it (H296)', () => {
  it('the shipped bands are H296\'s: Good under 80 ms, OK 80 to 150 ms, High above 150 ms', () => {
    expect(STATUS_LATENCY_BANDS_ADAPTATION).toEqual({ goodBelowMs: 80, okToMs: 150 });
    const bands = STATUS_LATENCY_BANDS_ADAPTATION;
    expect(latencyWord(0, bands)).toBe('Good');
    expect(latencyWord(79, bands)).toBe('Good');
    expect(latencyWord(80, bands)).toBe('OK');
    expect(latencyWord(150, bands)).toBe('OK');
    expect(latencyWord(151, bands)).toBe('High');
    expect(latencyWord(48, null)).toBeNull();
    expect(latencyWord(Number.NaN, bands)).toBeNull();
  });

  it('the word sits beside the median, and the line still says how it was measured', () => {
    const at = (ms: number) => rowDetail(report(health({ ok: true, hosts: hosts() }), { ms }).rows[2]!);
    expect(at(48)).toContain('Your latency: 48 ms (Good).');
    expect(at(120)).toContain('Your latency: 120 ms (OK).');
    expect(at(240)).toContain('Your latency: 240 ms (High).');
    expect(at(48)).toContain('Measured from your browser over HTTP');
    expect(at(48)).toContain('Game traffic may differ');
    // With no bands passed, the number stands alone (PST.R7).
    const bare = rowDetail(report(health({ ok: true, hosts: hosts() }), { ms: 48 }).rows[2]!, null);
    expect(bare).toContain('Your latency: 48 ms.');
    expect(bare).not.toMatch(/\b(Good|OK|High)\b/);
    // A failed or unmeasured probe is never given a word.
    expect(rowDetail(report(health({ ok: true, hosts: hosts() }), 'off').rows[2]!)).not.toMatch(/\b(Good|OK|High)\b/);
    expect(rowDetail(report(health({ ok: true, hosts: hosts() }), 'failed').rows[2]!)).not.toMatch(/\b(Good|OK|High)\b/);
  });

  it('the median drops the first sample', () => {
    expect(medianDroppingFirst([100, 40, 50, 60, 70])).toBe(55);
    expect(medianDroppingFirst([10])).toBeNull();
  });

  it('a configured origin is timed and never appears on the report', async () => {
    const seen: string[] = [];
    const fetchFn = (url: string) => {
      if (url === '/status-config.json') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ regions: [{ label: LABEL, probeOrigin: hiddenOrigin }, { label: 'secret-box', probeOrigin: 'https://nope.invalid' }] })) });
      }
      if (url === '/health') return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, hosts: hosts() })) });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html></html>') });
    };
    const result = await loadStatus({
      fetch: fetchFn, now: () => AT, gapMs: 0, samples: 3,
      timeProbe: async (origin) => { seen.push(origin); return seen.length === 1 ? 100 : 40; },
    });
    expect(seen).toEqual([hiddenOrigin, hiddenOrigin, hiddenOrigin]);
    expect(result.rows[2]).toMatchObject({ latencyMs: 40, probe: 'measured', service: 'operational' });
    expect(JSON.stringify(result)).not.toContain('probe.invalid');
    expect(JSON.stringify(result)).not.toContain('nope.invalid');
    expect(probeOrigins({ regions: [{ label: LABEL, probeOrigin: 'https://probe.invalid/ping' }] }, [LABEL]).size).toBe(0);
  });

  it('the default fetch gives up after STATUS_FETCH_TIMEOUT_MS_ADAPTATION, so a hung check cannot hold the poll (F3)', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const fake = vi.fn((_url: string, init?: RequestInit) => {
      seen.push(init?.signal);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, hosts: hosts() })) });
    });
    vi.stubGlobal('fetch', fake);
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      await loadStatus({ now: () => AT });
      expect(fake).toHaveBeenCalledTimes(3);
      expect(timeout).toHaveBeenCalledWith(STATUS_FETCH_TIMEOUT_MS_ADAPTATION);
      for (const signal of seen) expect(signal).toBeInstanceOf(AbortSignal);
      expect(fake.mock.calls.every(([, init]) => init?.cache === 'no-store')).toBe(true);
    } finally {
      timeout.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('with no config file the page does not time anything', async () => {
    const timeProbe = vi.fn(async () => 10);
    const fetchFn = (url: string) => {
      if (url === '/status-config.json') return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('missing') });
      if (url === '/health') return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, hosts: hosts() })) });
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('page') });
    };
    const result = await loadStatus({ fetch: fetchFn, now: () => AT, timeProbe });
    expect(timeProbe).not.toHaveBeenCalled();
    expect(result.rows[2]?.probe).toBe('off');
    expect(rowDetail(result.rows[2]!)).toContain('not measured on this visit');
    expect(result.rows[0]?.service).toBe('operational');
  });
});

describe('the page', () => {
  it('draws a word and a shape for up, down and unknown, and announces only a later change', async () => {
    let which: StatusReport = fixtureReport('unknown')!;
    const load = vi.fn(async () => which);
    const page = statusPage({ load, poll: false });
    document.body.append(page);
    await Promise.resolve();
    await Promise.resolve();
    expect(page.querySelector('.project-status-headline')!.textContent).toBe('Status is unknown.');
    expect(row(page, 'region').querySelector('.project-status-word')!.textContent).toBe('Unknown');
    expect(row(page, 'region').querySelector('.project-status-shape')!.getAttribute('data-state')).toBe('unknown');
    expect(page.querySelector('[role="status"]')!.textContent).toBe('');
    expect(page.querySelector('.project-nav [aria-current="page"]')!.textContent).toBe('Status');

    which = fixtureReport('up')!;
    page.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(page.querySelector('.project-status-headline')!.textContent).toBe('Everything we checked is up.');
    expect(row(page, 'region').textContent).toContain('Your latency: 48 ms (Good).');
    expect(row(page, 'website').textContent).not.toContain('latency');
    expect(page.querySelector('[role="status"]')!.textContent).toContain(`${LABEL}: Operational`);
    expect(formatChecked(AT)).toBe('Last checked 2026-10-28 12:00 UTC');
    expect(page.textContent).toContain('Last checked 2026-10-28 12:00 UTC');

    which = fixtureReport('down')!;
    page.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(page.querySelector('.project-status-headline')!.textContent).toBe('A match server is down.');
    expect(row(page, 'website').querySelector('.project-status-word')!.textContent).toBe('Operational');
    expect(row(page, 'region').querySelector('.project-status-shape')!.getAttribute('data-state')).toBe('down');
    expect(row(page, 'region').querySelector('.project-status-word')!.textContent).toBe('Down');
  });

  it('never writes a probe address into the document', async () => {
    const failed = report(health({ ok: true, hosts: hosts() }), 'failed');
    const load = async () => failed;
    const page = statusPage({ load, poll: false });
    document.body.append(page);
    await Promise.resolve();
    await Promise.resolve();
    expect(page.outerHTML).not.toContain('probe.invalid');
    expect(page.outerHTML).not.toContain('status-config');
    expect(page.outerHTML).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(page.textContent).toContain('Unreachable from your network');
    expect(page.textContent).not.toContain('A match server is down.');
  });

  it('polls while the tab is visible and stops when it is hidden', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => fixtureReport('up')!);
    let visible = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible });
    const page = statusPage({ load, poll: true, pollMs: 60_000 });
    document.body.append(page);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    visible = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(load).toHaveBeenCalledTimes(2);
    visible = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('a bfcache stay (pagehide persisted) suspends the checks and pageshow persisted resumes them (PR #651 P2)', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => fixtureReport('up')!);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    const page = statusPage({ load, poll: true, pollMs: 60_000 });
    document.body.append(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    window.dispatchEvent(transition('pagehide', true));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(load).toHaveBeenCalledTimes(1);
    window.dispatchEvent(transition('pageshow', true));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(3);
    page.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('a real unload (pagehide not persisted) still stops the page for good', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => fixtureReport('up')!);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    const page = statusPage({ load, poll: true, pollMs: 60_000 });
    document.body.append(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    window.dispatchEvent(transition('pagehide', false));
    await vi.advanceTimersByTimeAsync(180_000);
    window.dispatchEvent(transition('pageshow', true));
    document.dispatchEvent(new Event('visibilitychange'));
    page.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the shape is not colour alone, and the pulse is off under reduced motion', () => {
    const css = readFileSync(resolve(here, '../src/projectSite/site.css'), 'utf8');
    for (const state of ['operational', 'degraded', 'maintenance', 'down', 'unknown', 'unreachable']) {
      expect(css).toContain(`[data-state="${state}"]`);
    }
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*\.project-status-shape[\s\S]*animation:\s*none/);
    const tokens = readFileSync(resolve(here, '../../../../shared/ds/base.css'), 'utf8');
    expect(tokens).toContain('--s2u-status-operational: var(--s2u-state-live);');
    expect(tokens).toContain('--s2u-status-down: var(--s2u-glyph-circle);');
  });
});
