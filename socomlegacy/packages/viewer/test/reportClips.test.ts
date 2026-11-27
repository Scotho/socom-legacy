import { describe, expect, it } from 'vitest';
import {
  clipAsks, clipObservation, lanePort, rangedAnswer, segmentAnswers, segmentIndex, type NetEntry,
} from '../e2e/reportClips';

// RV-11b (web sprint 39; research 276 §10): the pure half of `e2e/reportClips.spec.ts` -- the lane's ports, and the
// reading of the report page's network log (which request is a mark's clip, which a replay segment, which clip read
// was ranged and answered 206). The spec itself is a browser run; this holds what it decides with, in Node.

const SERVICE = 'http://127.0.0.1:5308';
const OBS = 'PT-20261011-ab12-3';
const entry = (url: string, o: Partial<NetEntry> = {}): NetEntry =>
  ({ url, at: 0, range: null, status: null, answeredAt: null, contentRange: null, failed: null, ...o });

describe('lanePort: the run\'s own ports, the developer\'s refused (`./ports` `e2ePort`)', () => {
  // The sprint-39 lane's 5303-5308 only was a shared dev host's rule; the gate's browser view runs with the run's Local
  // port at its default, 8811 (`e2e/ports.ts`), and was refused (the v0.4.19 browser view). Any port of the run's stands.
  it('takes the run\'s ports: the lane\'s, the gate\'s default Local port, a worker\'s shifted one', () => {
    expect(lanePort('E2E_PLAYTEST_PORT', 5303)).toBe(5303);
    expect(lanePort('E2E_PLAYTEST_PORT', 5308)).toBe(5308);
    expect(lanePort('E2E_LOCAL_PORT', 8811)).toBe(8811);
    expect(lanePort('E2E_LOCAL_PORT', 9811)).toBe(9811);
  });
  it('refuses the developer\'s own servers\' ports, or none, by name', () => {
    for (const port of [5173, 5181, 5301, 5302, 8787, 8797, Number.NaN, 5306.5, 0, 70000]) {
      expect(() => lanePort('E2E_PORT', port), String(port)).toThrow(/E2E_PORT=/);
    }
  });
});

describe('clipObservation: a mark\'s clip on the report\'s evidence route', () => {
  it('names the observation of a clip, by the path alone', () => {
    expect(clipObservation(`${SERVICE}/evidence/${OBS}/clip.webm`)).toBe(OBS);
    expect(clipObservation(`${SERVICE}/evidence/${encodeURIComponent(OBS)}/clip.webm?x=1`)).toBe(OBS);
  });
  it('is null for the mark\'s other files, the segments and anything else', () => {
    for (const url of [
      `${SERVICE}/evidence/${OBS}/frame.png`, `${SERVICE}/evidence/${OBS}/telemetry.json`, `${SERVICE}/segments/0.s2r`,
      `${SERVICE}/evidence/clip.webm`, `${SERVICE}/evidence/${OBS}/x/clip.webm`, `${SERVICE}/report`, 'not a url',
    ]) expect(clipObservation(url), url).toBeNull();
  });
});

describe('segmentIndex: the replay\'s segment reads (`segmentsHttp.ts` SEGMENT)', () => {
  it('reads the index of `/segments/<n>.s2r`', () => {
    expect(segmentIndex(`${SERVICE}/segments/0.s2r`)).toBe(0);
    expect(segmentIndex(`${SERVICE}/segments/12.s2r`)).toBe(12);
  });
  it('is null for the listing, a non-exact index, a part file and anything else', () => {
    for (const url of [`${SERVICE}/segments`, `${SERVICE}/segments/01.s2r`, `${SERVICE}/segments/0.s2r.part`, `${SERVICE}/evidence/${OBS}/clip.webm`, 'not a url']) {
      expect(segmentIndex(url), url).toBeNull();
    }
  });
});

describe('the network log read', () => {
  const clipA = `${SERVICE}/evidence/${OBS}/clip.webm`;
  const clipB = `${SERVICE}/evidence/PT-20261011-ab12-4/clip.webm`;
  const net: NetEntry[] = [
    entry(`${SERVICE}/evidence/${OBS}/frame.png`, { at: 1, status: 200 }),
    entry(`${SERVICE}/segments`, { at: 2, status: 200 }),
    entry(`${SERVICE}/segments/0.s2r`, { at: 3, status: 200 }),
    entry(`${SERVICE}/segments/1.s2r`, { at: 4 }),                          // asked, not answered
    entry(clipA, { at: 10, status: 200 }),                                  // whole: no range
    entry(clipA, { at: 11, range: 'bytes=0-', status: 206, contentRange: 'bytes 0-99/100' }),
    entry(clipB, { at: 12, range: 'bytes=0-', status: null, failed: 'net::ERR_ABORTED' }),
  ];
  it('clipAsks: every clip request, or those before a moment', () => {
    expect(clipAsks(net).map((e) => e.at)).toEqual([10, 11, 12]);
    expect(clipAsks(net, 11).map((e) => e.at)).toEqual([10]);
    expect(clipAsks(net, 10)).toEqual([]);
    expect(clipAsks(net.slice(0, 4))).toEqual([]);
  });
  it('rangedAnswer: the first ranged read of that clip answered 206, else null', () => {
    expect(rangedAnswer(net, OBS)?.at).toBe(11);
    expect(rangedAnswer(net, 'PT-20261011-ab12-4')).toBeNull();               // ranged, never answered
    expect(rangedAnswer(net.slice(0, 5), OBS)).toBeNull();                    // whole only
    expect(rangedAnswer([entry(clipA, { range: 'bytes=0-', status: 200 })], OBS)).toBeNull();
    expect(rangedAnswer([entry(clipA, { range: 'items=0-', status: 206 })], OBS)).toBeNull();
  });
  it('segmentAnswers: the segment reads that were answered, with their index', () => {
    expect(segmentAnswers(net).map((e) => [segmentIndex(e.url), e.status])).toEqual([[0, 200]]);
  });
});
