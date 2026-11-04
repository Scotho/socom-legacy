// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLAYTEST_SAMPLE_LIMIT, REPORT_FORMAT, buildReport, createTracker, mountPlaytestOverlay, reportFileName, summary,
  type PlaytestHook,
} from '../src/playtestReport';
import { COMBAT_REPORT_RING } from '../src/net/client';
import type { CombatReport } from '../src/net/protocol';

/**
 * The developer's playtest overlay and its saved report (`?devmode`; a browser adaptation, no original). The first five
 * cases are Chris's `diagnostics.test.mjs` (browser-beta-v5, chris/browser-beta-integration d578f347), moved from
 * node:test to vitest; the rest hold what this port adds: the report's allow-list, and that nothing leaves the page.
 */

const online = { state: 'online', players: 2 };
const net = (small = 0, snapped = 0) => ({ rtt: 12, snapshotRate: 30, corrections: { small, snapped, largest: 3 } });

describe('the tracker (his diagnostics.test.mjs)', () => {
  it('keeps unknown values null; hidden or loading frames do not become zero FPS', () => {
    const t = createTracker();
    const row = t.record({ elapsedMs: 1000, online: { state: 'off', players: 0 }, frameMs: null, server: null });
    expect(row.fps).toBeNull();
    expect(row.pingMs).toBeNull();
    expect(row.serverTickHz).toBeNull();
    expect(t.report().summary.frameMs).toBeNull();
  });

  it('derives the server tick rate across samples between counters; a restart gives no negative rate', () => {
    const t = createTracker();
    t.record({ elapsedMs: 1000, server: { ticks: 60, at: 1000 } });
    t.record({ elapsedMs: 2000 });
    expect(t.record({ elapsedMs: 3000, server: { ticks: 180, at: 3000 } }).serverTickHz).toBe(60);
    expect(t.record({ elapsedMs: 4000, server: { ticks: 0, at: 4000 } }).serverTickHz).toBeNull();
    expect(t.record({ elapsedMs: 5000, server: { ticks: 60, at: 5000 } }).serverTickHz).toBe(60);
  });

  it('counts disconnects, reconnects and corrections across a replaced client', () => {
    const t = createTracker();
    t.record({ elapsedMs: 1000, online, net: net(2, 1), frameMs: 16.666 });
    t.record({ elapsedMs: 2000, online, net: net(4, 1), frameMs: 20 });
    t.record({ elapsedMs: 3000, online: { state: 'retrying', players: 0 } });
    t.record({ elapsedMs: 4000, online: { state: 'retrying', players: 0 } });
    t.record({ elapsedMs: 5000, online, net: net(1, 1) });
    const r = t.report();
    expect(r.summary.observedDisconnects).toBe(1);
    expect(r.summary.observedReconnects).toBe(1);
    expect(r.summary.corrections.small).toBe(5);
    expect(r.summary.corrections.snapped).toBe(2);
    expect(r.events.map((e) => e.type)).toEqual(['connected', 'disconnected', 'reconnected']);
    expect(r.summary.frameMs!.count).toBe(2);
  });

  it('is bounded, and no field outside its list enters the report', () => {
    const t = createTracker();
    for (let i = 0; i < PLAYTEST_SAMPLE_LIMIT + 2; i++) {
      t.record({ elapsedMs: i, online, net: net(), frameMs: 16, isoFilename: 'private.iso', serverAddress: '203.0.113.2' } as never);
    }
    const r = t.report();
    expect(PLAYTEST_SAMPLE_LIMIT).toBe(3600);
    expect(r.samples).toHaveLength(3600);
    expect(r.summary.frameMs!.count).toBe(3600);
    expect(JSON.stringify(r)).not.toContain('private.iso');
    expect(JSON.stringify(r)).not.toContain('203.0.113.2');
  });

  it('percentiles ignore unavailable values', () => {
    expect(summary([10, 20, NaN, 30])).toEqual({ count: 3, mean: 20, min: 10, max: 30, p95: 30 });
  });
});

describe('the report', () => {
  it('holds only its listed fields: labels, the samples, the events, the summary and its notes', () => {
    const t = createTracker();
    t.record({ elapsedMs: 1000, online, net: net(), frameMs: 16 });
    const labels = {
      revision: 'abc1234', map: 'RUN/MP2.ZDB', renderingBackend: 'webgl2', startedAt: '2026-10-02T00:00:00.000Z',
      savedAt: '2026-10-02T00:01:00.000Z', durationSeconds: 60, url: 'ws://203.0.113.9:8787/ws', userAgent: 'secret',
      perfLine: 's2u perf v0.4.2 | Chrome 142 Windows',
    };
    const report = buildReport(labels as never, t.report());
    expect(Object.keys(report).sort()).toEqual(['durationSeconds', 'events', 'format', 'map', 'notes', 'perfLine', 'renderingBackend',
      'revision', 'samples', 'savedAt', 'startedAt', 'summary'].sort());
    expect(report.perfLine).toBe('s2u perf v0.4.2 | Chrome 142 Windows');   // CPS-5: the player's performance line, one field
    expect(report.format).toBe(REPORT_FORMAT);
    expect(JSON.stringify(report)).not.toContain('203.0.113.9');
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('is named for the moment it was saved, with no character a file system refuses', () => {
    expect(reportFileName(new Date('2026-10-02T03:04:05.678Z'))).toBe('redotcom-playtest-2026-10-02T03-04-05-678Z.json');
  });
});

/**
 * The combat section (INT.R5, research 127 §5 and §8; ported from Chris's browser-beta-v5, chris/browser-beta-integration
 * d578f347: `site/playtest-diagnostics.mjs`, his report's `combat: { events, dropped, limit }`): the reports the room
 * sent this page, as `NetClient.combatReport()` kept them. A room without `COMBAT_REPORT=1` sends none, and then the
 * saved file is what it was before the section existed.
 */
describe('the combat section', () => {
  const labels = {
    revision: 'abc1234', map: 'RUN/MP2.ZDB', renderingBackend: 'webgl2', startedAt: '2026-10-02T00:00:00.000Z',
    savedAt: '2026-10-02T00:01:00.000Z', durationSeconds: 60,
  };
  const tracked = () => { const t = createTracker(); t.record({ elapsedMs: 1000, online, net: net(), frameMs: 16 }); return t.report(); };
  const report = (eventId: number): CombatReport => ({
    type: 'combat', eventId, tick: 40, round: 1, map: 'MP2', status: 'applied', request: 'fire', reason: null, weapon: 62,
    attacker: { id: 1, team: 'seal' }, target: { id: 2, team: 'terrorist' }, part: 3, hitLocations: null,
    distance: 120, distanceMetres: 12, healthBefore: [100, 100, 100, 100, 100, 100], healthAfter: [100, 100, 100, 70, 100, 100],
    armourBefore: [0, 0, 0, 0, 0, 0], armourAfter: [0, 0, 0, 0, 0, 0], rawDamage: 30, damageApplied: 30, killed: false,
    selfDamage: false, friendlyFire: false, point: [1, 2, 3], direction: [0, 0, 1], hitLocation: 'body',
    hitLocationNames: ['body'], struckPartHealthChange: 30, totalBodyPartHealthChange: 30,
  });

  it('a room without the option sent none: the file is byte for byte the report before the section', () => {
    const data = tracked();
    // The report as it was saved before the section existed: these keys, in this order, and the six notes (CPS-5: the
    // performance line after the labels, null with none, and its note).
    const before = {
      format: REPORT_FORMAT, ...labels, perfLine: null, notes: buildReport(labels, data).notes, samples: data.samples, events: data.events,
      summary: data.summary,
    };
    expect(before.notes).toHaveLength(6);
    expect(before.notes.join(' ')).toMatch(/performance line/);
    const today = JSON.stringify(before, null, 2);
    expect(JSON.stringify(buildReport(labels, data), null, 2)).toBe(today);
    expect(JSON.stringify(buildReport(labels, data, null), null, 2)).toBe(today);
    expect(JSON.stringify(buildReport(labels, data, { events: [], dropped: 0 }), null, 2)).toBe(today);
  });

  it('a room with it: the events as the client kept them, the dropped count and the ring\'s bound, his field names', () => {
    const events = [report(7), report(8)];
    const r = buildReport(labels, tracked(), { events, dropped: 3 });
    expect(r.combat).toEqual({ events: [report(7), report(8)], dropped: 3, limit: COMBAT_REPORT_RING });
    expect(COMBAT_REPORT_RING).toBe(1024);
    expect(Object.keys(r).at(-1)).toBe('combat');
    events[0]!.damageApplied = 99;                                 // the saved copy is the report's own
    expect(r.combat!.events[0]!.damageApplied).toBe(30);
    // The notes say what the section is and what its numbers are not (research 127 §3: not the HUD's gauge).
    expect(r.notes.length).toBe(8);
    expect(r.notes.join(' ')).toMatch(/COMBAT_REPORT=1/);
    expect(r.notes.join(' ')).toMatch(/Neither is the HUD's health gauge/);
  });

  it('the overlay saves what its combat source hands it, and no section with none or an empty ring', () => {
    vi.useFakeTimers();
    try {
      const hook: PlaytestHook = { stats: () => ({ map: 'RUN/MP2.ZDB', backend: 'webgl2' }) as never, revision: 'abc1234' };
      const host = { document, urls: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }, now: () => Date.now() };
      let ring: { events: CombatReport[]; dropped: number } | null = null;
      const overlay = mountPlaytestOverlay(host, () => hook, () => ring);
      vi.advanceTimersByTime(1000);
      expect('combat' in overlay.report()).toBe(false);            // no match: no client
      ring = { events: [], dropped: 0 };
      expect('combat' in overlay.report()).toBe(false);            // a room without the option
      ring = { events: [report(1)], dropped: 0 };
      expect(overlay.report().combat).toEqual({ events: [report(1)], dropped: 0, limit: COMBAT_REPORT_RING });
      overlay.stop();
      const bare = mountPlaytestOverlay(host, () => hook);           // no source at all: as before
      expect('combat' in bare.report()).toBe(false);
      bare.stop();
      // CPS-5: the performance line, the page's (`../src/perfLine` `pagePerfLine`) or the one handed in.
      const lined = mountPlaytestOverlay(host, () => hook, undefined, () => 's2u perf v0.4.2 | X');
      expect(lined.report().perfLine).toBe('s2u perf v0.4.2 | X');
      lined.stop();
      const paged = mountPlaytestOverlay(host, () => hook, undefined, () => null);
      expect(paged.report().perfLine).toBeNull();
      paged.stop();
    } finally {
      vi.useRealTimers();
      document.body.replaceChildren();
    }
  });
});

describe('the overlay sends nothing anywhere', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it('its source names no network call: no fetch, socket, beacon, XHR, event source or dynamic import', () => {
    const code = readFileSync(resolve(HERE, '../src/playtestReport.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // the comments may say what it does not do
    for (const word of ['fetch', 'WebSocket', 'sendBeacon', 'XMLHttpRequest', 'EventSource', 'RTCPeerConnection', 'import(']) {
      expect(code, word).not.toContain(word);
    }
  });

  it('mounted and saved, it calls no network API, and the file is made in the page', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(), socket = vi.fn(), beacon = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', socket);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const made: Blob[] = [];
    const urls = { createObjectURL: vi.fn((b: Blob) => { made.push(b); return 'blob:report'; }), revokeObjectURL: vi.fn() };
    const hook: PlaytestHook = {
      stats: () => ({ map: 'RUN/MP2.ZDB', backend: 'webgl2' }) as never,
      net: () => ({ ...net(1, 0) }) as never,
      online: () => ({ state: 'online', players: 2, retryIn: 0, watching: false, choice: 'url', url: 'ws://203.0.113.9:8787/ws' }),
      revision: 'abc1234',
    };
    const clicks: string[] = [];
    const overlay = mountPlaytestOverlay({ document, urls, now: () => Date.now(), download: (a) => clicks.push(a.download) }, () => hook);
    vi.advanceTimersByTime(3000);
    (document.querySelector('#playtest-save') as HTMLButtonElement).click();
    expect(made).toHaveLength(1);
    expect(clicks).toEqual([expect.stringMatching(/^redotcom-playtest-.*\.json$/)]);
    const report = overlay.report();
    expect(report.samples.length).toBeGreaterThanOrEqual(3);
    expect(report.map).toBe('RUN/MP2.ZDB');
    expect(report.revision).toBe('abc1234');
    expect(report.perfLine).toMatch(/^s2u perf v\d+\.\d+\.\d+ \| /);    // CPS-5: the page's own line by default
    expect(JSON.stringify(report)).not.toContain('203.0.113.9');   // online()'s url never enters it
    expect(fetch).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    overlay.stop();
    expect(document.getElementById('playtest-overlay')).toBeNull();
  });
});
