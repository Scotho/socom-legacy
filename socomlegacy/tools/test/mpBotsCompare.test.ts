import { describe, expect, it } from 'vitest';
import { compareRuns, compareTable, parseCompareArgs, pctChange, runFigures, type RunFigures } from '../mp-bots-compare';

/**
 * PV-0 (PV.R7; product track, a test instrument): mp-bots-compare's arithmetic -- each side's runs meaned, the change in
 * percent of the base, the caps, and the exit codes (0 under both, 1 over either, 2 on input it cannot compare).
 */

const report = (net: number | null, log: number | null, over: Record<string, unknown> = {}): unknown => ({
  options: { map: 'MP2', players: 16, spectators: 8, seconds: 300, scoped: 0.3, ...over },
  summary: {
    bytesPerClientPerSecond: 999,
    socket: net === null ? null : { inOutPerClient: net },
    recording: log === null ? { gzippedBytesPerSecond: null } : { gzippedBytesPerSecond: log },
  },
});
const runs = (pairs: [number, number][]): RunFigures[] => pairs.map(([n, l], i) => runFigures(report(n, l), `r${i}`));

describe('runFigures', () => {
  it('reads the network figure (in + out per client per s at the sockets) and the log figure (gzipped bytes per s)', () => {
    expect(runFigures(report(1000, 200), 'a')).toEqual({
      label: 'a', map: 'MP2', players: 16, spectators: 8, seconds: 300, scoped: 0.3, net: 1000, log: 200,
    });
  });
  it('a missing summary, socket or recording is null, never 0', () => {
    expect(runFigures(report(null, null), 'a')).toMatchObject({ net: null, log: null });
    expect(runFigures({ options: {}, summary: {} }, 'b')).toMatchObject({ net: null, log: null, map: null, players: null });
    expect(runFigures(null, 'c')).toMatchObject({ net: null, log: null });
  });
  it('a run without --scoped reads share 0', () => {
    const r = report(1, 1) as { options: Record<string, unknown> };
    delete r.options.scoped;
    expect(runFigures(r, 'a').scoped).toBe(0);
  });
});

describe('pctChange', () => {
  it('is (head - base) / base in percent', () => {
    expect(pctChange(100, 115)).toBeCloseTo(15, 12);
    expect(pctChange(200, 150)).toBeCloseTo(-25, 12);
  });
});

describe('compareRuns', () => {
  const caps = { net: 20, log: 40 };
  it('means each side, and passes under both caps (exit 0)', () => {
    const r = compareRuns(runs([[1000, 100], [1100, 110], [900, 90]]), runs([[1100, 130], [1200, 140], [1000, 120]]), caps);
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ measure: 'network', base: 1000, head: 1100, cap: 20, verdict: 'PASS' });
    expect(r.rows[0]!.changePct).toBeCloseTo(10, 9);
    expect(r.rows[1]).toMatchObject({ measure: 'log', base: 100, head: 130, cap: 40, verdict: 'PASS' });
    expect(r.rows[1]!.changePct).toBeCloseTo(30, 9);
    expect(r.exit).toBe(0);
  });
  it('a change exactly at the cap passes; past it is OVER (exit 1)', () => {
    expect(compareRuns(runs([[1000, 100]]), runs([[1200, 140]]), caps).exit).toBe(0);
    const net = compareRuns(runs([[1000, 100]]), runs([[1201, 100]]), caps);
    expect(net.rows[0]!.verdict).toBe('OVER');
    expect(net.exit).toBe(1);
    const log = compareRuns(runs([[1000, 100]]), runs([[1000, 141]]), caps);
    expect(log.rows[1]!.verdict).toBe('OVER');
    expect(log.exit).toBe(1);
  });
  it('the caps are the caller\'s', () => {
    expect(compareRuns(runs([[1000, 100]]), runs([[1150, 100]]), { net: 10, log: 40 }).exit).toBe(1);
  });
  it('refuses input it cannot compare (exit 2): a null field, an empty side, different counts, map, seconds or share', () => {
    const base = runs([[1000, 100]]);
    expect(compareRuns(base, [runFigures(report(null, 100), 'h')], caps).exit).toBe(2);
    expect(compareRuns(base, [runFigures(report(1000, null), 'h')], caps).exit).toBe(2);
    expect(compareRuns(base, [], caps).exit).toBe(2);
    for (const over of [{ players: 8 }, { spectators: 0 }, { map: 'MP3' }, { seconds: 60 }, { scoped: 0 }]) {
      const r = compareRuns(base, [runFigures(report(1000, 100, over), 'h')], caps);
      expect(r.exit).toBe(2);
      expect(r.problems.join(' ')).toMatch(new RegExp(Object.keys(over)[0]!));
    }
    expect(compareRuns(runs([[0, 100]]), runs([[10, 100]]), caps).exit).toBe(2);   // a zero base has no percentage
  });
});

describe('compareTable', () => {
  it('prints one row each: base mean, head mean, the change, the cap, the verdict', () => {
    const text = compareTable(compareRuns(runs([[1000, 100]]), runs([[1100, 150]]), { net: 20, log: 40 }));
    expect(text).toMatch(/\| network \|.*1000.*\| 1100.*\| \+10\.0% \| 20% \| PASS \|/);
    expect(text).toMatch(/\| log \|.*100.*\| 150.*\| \+50\.0% \| 40% \| OVER \|/);
  });
  it('lists the problems of unusable input', () => {
    expect(compareTable(compareRuns(runs([[1000, 100]]), [], { net: 20, log: 40 }))).toMatch(/unusable/);
  });
});

describe('parseCompareArgs', () => {
  it('takes the files after --base and --head and the caps, PV.R7\'s 20 and 40 by default', () => {
    expect(parseCompareArgs(['--base', 'a.json', 'b.json', '--head', 'c.json', 'd.json'])).toEqual({ base: ['a.json', 'b.json'], head: ['c.json', 'd.json'], netCap: 20, logCap: 40 });
    expect(parseCompareArgs(['--head', 'c.json', '--net-cap', '15', '--base', 'a.json', '--log-cap', '30'])).toEqual({ base: ['a.json'], head: ['c.json'], netCap: 15, logCap: 30 });
  });
  it('a missing side or a bad cap is an error string', () => {
    expect(typeof parseCompareArgs(['--base', 'a.json'])).toBe('string');
    expect(typeof parseCompareArgs(['--base', 'a.json', '--head', 'b.json', '--net-cap', 'x'])).toBe('string');
  });
});
