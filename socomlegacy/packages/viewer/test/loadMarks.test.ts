import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOAD_MARK_PREFIX, LOAD_MARKS_ADAPTATION, LOAD_PHASES, loadSummary, markLoad, markLobbyPrepared, type LoadMarkClock } from '../src/loadMarks';

/** A User Timing clock by hand: `now` moved by the test. */
function clock() {
  let now = 0;
  const marks: { name: string; startTime: number }[] = [];
  const perf: LoadMarkClock = {
    mark: (name) => { marks.push({ name, startTime: now }); },
    clearMarks: (name) => { for (let i = marks.length - 1; i >= 0; i--) if (name === undefined || marks[i]!.name === name) marks.splice(i, 1); },
    getEntriesByName: (name) => marks.filter((m) => m.name === name),
  };
  return { perf, at: (t: number) => { now = t; }, marks };
}

const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');

describe('IP3 bbXnSJNH (a measurement instrument, no original): the lobby match load phases as User Timing marks', () => {
  it('is labelled, and names nine phases in load order', () => {
    expect(LOAD_MARKS_ADAPTATION).toMatch(/measurement/);
    expect(LOAD_PHASES).toEqual(['load-start', 'decode-done', 'start', 'mounted', 'world-built', 'renderer', 'warm-settled', 'first-frame', 'loaded-sent']);
  });

  it("marks each phase; the first frame logs each phase's ms after the load's start", () => {
    const c = clock();
    const lines: string[] = [];
    c.at(1000); markLoad('load-start', c.perf, (l) => lines.push(l));
    c.at(1900); markLoad('decode-done', c.perf, (l) => lines.push(l));
    c.at(2000); markLoad('start', c.perf, (l) => lines.push(l));
    c.at(2050); markLoad('mounted', c.perf, (l) => lines.push(l));
    c.at(5100); markLoad('world-built', c.perf, (l) => lines.push(l));
    c.at(5200); markLoad('renderer', c.perf, (l) => lines.push(l));
    c.at(12000); markLoad('warm-settled', c.perf, (l) => lines.push(l));
    expect(lines).toEqual([]);
    c.at(12100); markLoad('first-frame', c.perf, (l) => lines.push(l));
    expect(c.marks.map((m) => m.name)).toContain(`${LOAD_MARK_PREFIX}first-frame`);
    expect(lines).toEqual(['match load: {"load-start":0,"decode-done":900,"start":1000,"mounted":1050,"world-built":4100,"renderer":4200,"warm-settled":11000,"first-frame":11100}']);
  });

  it("a new load clears the last one's marks; a phase before any load-start is not summarised", () => {
    const c = clock();
    c.at(10); markLoad('first-frame', c.perf, () => undefined);
    expect(loadSummary(c.perf)).toEqual({});
    c.at(100); markLoad('load-start', c.perf);
    c.at(150); markLoad('decode-done', c.perf);
    c.at(500); markLoad('load-start', c.perf);
    expect(loadSummary(c.perf)).toEqual({ 'load-start': 0 });
  });

  it('never throws, and does nothing with no clock', () => {
    const bad: LoadMarkClock = { mark: () => { throw new Error('quota'); } };
    expect(() => { markLoad('start', bad); }).not.toThrow();
    expect(() => { markLoad('start', null); }).not.toThrow();
  });

  it('is wired at each phase: the front end, the match mount and the client', () => {
    const fe = src('frontEnd.ts');
    expect(fe).toMatch(/load: \(mission\) => \{ markLoad\('load-start'\);/);
    expect(fe).toMatch(/markLoad\('decode-done'\)/);
    expect(fe).toMatch(/start: \(m\) => \{ loadingHide\.hold\(\); markLoad\('start'\);/);
    expect(fe).toMatch(/markLoad\('mounted'\)/);
    const mm = src('matchMount.ts');
    expect(mm).toMatch(/built\.setLighting\(lighting\);\r?\n\s*markLoad\('world-built'\);/);
    expect(mm).toMatch(/renderer = r;\r?\n\s*markLoad\('renderer'\);/);
    expect(mm).toMatch(/markLoad\('warm-settled'\)/);
    expect(mm).toMatch(/if \(firstWorldFrame\) \{ firstDrawn = true; markLoad\('first-frame'\);/);
    const cl = src('net/client.ts');
    expect((cl.match(/markLoad\('loaded-sent'\)/g) ?? []).length).toBe(3);
  });

  it("IP3 lobby prepare: the summary says whether the hand-off found the lobby's prepared match; a new load forgets it", () => {
    const c = clock();
    const lines: string[] = [];
    c.at(0); markLoad('load-start', c.perf);
    c.at(10); markLobbyPrepared(true, c.perf);
    c.at(20); markLoad('first-frame', c.perf, (l) => lines.push(l));
    expect(lines).toEqual(['match load: {"load-start":0,"first-frame":20,"lobbyPrepared":true}']);
    c.at(100); markLoad('load-start', c.perf);
    expect(loadSummary(c.perf)).toEqual({ 'load-start': 0 });
    c.at(110); markLobbyPrepared(false, c.perf);
    expect(loadSummary(c.perf)).toEqual({ 'load-start': 0, lobbyPrepared: false });
    expect(() => { markLobbyPrepared(true, { mark: () => { throw new Error('quota'); } }); }).not.toThrow();
    expect(src('frontEnd.ts')).toMatch(/markLobbyPrepared\(l\.holds\(mission\) !== null\)/);
  });
});
