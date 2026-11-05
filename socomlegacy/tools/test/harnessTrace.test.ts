import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../packages/archive/test/fixtures';
import { formatPadLog, padAt, parseScenario, ScenarioRefusal } from '../harness/scenario';
import { runScenario } from '../harness/port-trace';
import { formatTrace, parseTrace, placeEdge, pressEdge, referenceFor, TraceRefusal, type Trace, type TraceFrame, type TraceHeader } from '../harness/trace';

const SCENARIOS = resolve(dirname(fileURLToPath(import.meta.url)), '../harness/scenarios');

function scenarioText(name: string): string {
  return readFileSync(resolve(SCENARIOS, name), 'utf8');
}

function header(): TraceHeader {
  return {
    schema: 1, kind: 'header', side: 'port', scenario: 'round', fieldSet: 'frostfire-box', revision: 'r0001',
    mapHash: null, build: {}, env: {}, reference: referenceFor('port'),
  };
}

function frame(n: number, b = 0): TraceFrame {
  return {
    schema: 1, kind: 'frame', frame: n, masked: false,
    pad: { b, lx: 128, ly: 128, rx: 128, ry: 128 },
    fields: { 'pad.b': b },
  };
}

describe('s2t traces', () => {
  it('round-trips a header and its frames', () => {
    const trace: Trace = { header: header(), frames: [frame(0), frame(1, 0x4000)] };
    const back = parseTrace(formatTrace(trace));
    expect(back.header.side).toBe('port');
    expect(back.header.reference.retail).toBe(false);
    expect(back.header.reference.label).toMatch(/not a retail console/);
    expect(back.frames.map((f) => f.frame)).toEqual([0, 1]);
    expect(pressEdge(back.frames)).toBe(1);
  });

  it('refuses a retail reference', () => {
    const text = formatTrace({ header: header(), frames: [frame(0)] });
    const lines = text.split('\n');
    const h = JSON.parse(lines[0]!) as TraceHeader;
    (h.reference as { retail: boolean }).retail = true;
    lines[0] = JSON.stringify(h);
    expect(() => parseTrace(lines.join('\n'))).toThrow(TraceRefusal);
    expect(() => parseTrace(lines.join('\n'))).toThrow(/retail/);
  });

  it('refuses a frame whose number is not its index', () => {
    const text = formatTrace({ header: header(), frames: [frame(4)] });
    expect(() => parseTrace(text)).toThrow(/numbered/);
  });

  it('refuses an empty trace', () => {
    expect(() => parseTrace('')).toThrow(/empty/);
  });
});

describe('scenario pad scripts', () => {
  it('holds a keyframe until the next, and writes one line a frame', () => {
    const scenario = parseScenario(JSON.stringify({
      schema: 1, name: 'hold', map: 'synthetic-flat', revision: 'r0001',
      spawn: { x: 0, y: 0, z: 0, yaw: 0, how: 'teleport' }, seed: null, frameHz: 29.97,
      pad: [
        { frame: 0, b: '0x0001', lx: 10, ly: 20, rx: 30, ry: 40 },
        { frame: 2, ly: 0 },
      ],
      events: {}, stop: { orFrames: 4 }, fields: 'frostfire-box',
    }));
    expect(padAt(scenario, 0, {})).toEqual({ b: 0x0001, lx: 10, ly: 20, rx: 30, ry: 40 });
    expect(padAt(scenario, 1, {})).toEqual({ b: 0x0001, lx: 10, ly: 20, rx: 30, ry: 40 });
    expect(padAt(scenario, 2, {}).ly).toBe(0);
    expect(padAt(scenario, 2, {}).b).toBe(0x0001);
    const log = formatPadLog(scenario, [padAt(scenario, 0, {}), padAt(scenario, 1, {}), padAt(scenario, 2, {})]);
    const data = log.split('\n').filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(data).toEqual([
      '0 0x0001 10 20 30 40',
      '1 0x0001 10 20 30 40',
      '2 0x0001 10 0 30 40',
    ]);
  });

  it('parses the three scenario files', () => {
    for (const name of ['synthetic-walk.json', 'climb-interrupt.json', 'frostfire-box.json']) {
      const scenario = parseScenario(scenarioText(name));
      expect(scenario.schema).toBe(1);
      expect(scenario.fields).toBe('frostfire-box');
    }
    expect(parseScenario(scenarioText('frostfire-box.json')).spawn).toMatchObject({ x: 938, y: 100, z: 845, yaw: 0, how: 'teleport' });
  });

  it('refuses an unknown key, a bad event, a stop that names no event, and a pad that goes backwards', () => {
    const base = JSON.parse(scenarioText('synthetic-walk.json')) as Record<string, unknown>;
    expect(() => parseScenario(JSON.stringify({ ...base, extra: 1 }))).toThrow(ScenarioRefusal);
    expect(() => parseScenario(JSON.stringify({ ...base, events: { prompt: 'not an expression' } }))).toThrow(/unknown expression/);
    expect(() => parseScenario(JSON.stringify({ ...base, stop: { after: 'rest', orFrames: 10 } }))).toThrow(/stop.after/);
    const pad = [{ frame: 2, b: '0x0000' }, { frame: 1, b: '0x0000' }];
    expect(() => parseScenario(JSON.stringify({ ...base, pad }))).toThrow(/non-decreasing/);
  });
});

describe('the headless recorder', () => {
  it('walks the flat synthetic floor with no press', async () => {
    const scenario = parseScenario(scenarioText('synthetic-walk.json'));
    const run = await runScenario(scenario);
    expect(run.error).toBeUndefined();
    expect(run.skipped).toBeUndefined();
    const frames = run.trace!.frames;
    expect(frames).toHaveLength(45);
    expect(pressEdge(frames)).toBeNull();
    expect(frames[15]!.pad.ly).toBe(0);
    expect(frames[14]!.pad.ly).toBe(128);
    const z0 = frames[15]!.fields['pos.z'] as number;
    const z1 = frames[44]!.fields['pos.z'] as number;
    expect(z1).not.toBe(z0);
    expect(frames.every((f) => f.fields.moveScale === 1)).toBe(true);
    expect(run.trace!.header.reference.retail).toBe(false);
    expect(run.trace!.header.reference.label).toMatch(/not a retail console/);
    expect(run.trace!.header.reference.emulated).toBe(true);
    const back = parseTrace(run.traceText!);
    expect(back.frames).toHaveLength(45);
  });

  it('presses X on the frame the climb scenario names, and is climbing before the place', async () => {
    const scenario = parseScenario(scenarioText('climb-interrupt.json'));
    const run = await runScenario(scenario);
    expect(run.skipped).toBeUndefined();
    expect(run.error, run.error).toBeUndefined();
    const frames = run.trace!.frames;
    const edge = pressEdge(frames);
    const fired: Record<string, number> = {};
    for (const f of frames) {
      if (fired.prompt === undefined && (f.pad.b & 0x4000) !== 0) fired.prompt = f.frame;
    }
    expect(edge).toBe(fired.prompt);
    expect(edge).not.toBeNull();
    const place = placeEdge(frames);
    expect(place).not.toBeNull();
    expect(place!).toBeGreaterThan(edge!);
    expect(frames[place! - 1]!.fields['action.current']).toBe('climb');
  });

  // The plan's §2.2: the header names the map's hash -- the sha256 of the map file the recorder read; a synthetic
  // world has no file, so null. With the fixtures, the Frostfire box is the first port-side record (PH-3).
  it.skipIf(!fixture('RUN/MP2.ZDB') || !fixture('RUN/MOTION_P.ZAR'))('the header names the map file\'s sha256; a synthetic world none', async () => {
    const run = await runScenario(parseScenario(scenarioText('frostfire-box.json')));
    expect(run.trace!.header.mapHash).toBe(`sha256:${createHash('sha256').update(fixture('RUN/MP2.ZDB')!).digest('hex')}`);
    expect((await runScenario(parseScenario(scenarioText('synthetic-walk.json')))).trace!.header.mapHash).toBeNull();
  });

  // SEGMENT-BODY: walked -z from x 938 the -x side line meets prop01's side face, the look-ahead (FUN_005483d0
  // D:L413686-413756) holds the move 9.7 off the crate, and a side line stores no contact (D:L413823-413848), so nothing
  // offers the climb. Unsettled at the source; held, the scenario's spawn not moved (LATER 680: an r0004 capture of that
  // walk settles it).
  it.skipIf(!fixture('RUN/MP2.ZDB') || !fixture('RUN/MOTION_P.ZAR')).fails('GAP (LATER 680): the Frostfire box scenario walked from x 938 reaches the climb', async () => {
    const run = await runScenario(parseScenario(scenarioText('frostfire-box.json')));
    expect(run.trace!.frames.some((f) => f.fields['action.current'] === 'climb')).toBe(true);
  });

  it('skips a disc map when the fixtures are absent', async () => {
    const scenario = parseScenario(scenarioText('frostfire-box.json'));
    const present = fixture('RUN/MP2.ZDB') !== null && fixture('RUN/MOTION_P.ZAR') !== null;
    if (present) {
      expect(present).toBe(true);
      return;
    }
    const run = await runScenario(scenario);
    expect(run.trace).toBeUndefined();
    expect(run.skipped).toContain(FIXTURES_ABSENT);
  });
});

describe('PH-2\'s re-read on the port side', () => {
  it('leaves flags.e1bit4 unread (the source\'s bit is an active flag, its meaning unread; not the port\'s inAir) and suspends gravity with the climb alone', async () => {
    const scenario = parseScenario(scenarioText('climb-interrupt.json'));
    const run = await runScenario(scenario);
    const frames = run.trace!.frames;
    expect(frames.every((f) => f.fields['flags.e1bit4'] === null)).toBe(true);
    // the place play outranks the climb in action.current while the traversal still climbs, so only climb and none decide
    for (const f of frames.filter((x) => x.fields['action.current'] !== 'place')) {
      expect(f.fields['gravity.suspended'], `frame ${f.frame}`).toBe(f.fields['action.current'] === 'climb' ? 1 : 0);
    }
    expect(frames.some((f) => f.fields['action.current'] === 'climb')).toBe(true);
  });
});

describe('PH-3: the grenade page on the headless walk', () => {
  it('the place press starts the claymore\'s placing: its 1.3 s kit timer runs down on the trace, then one charge is down', async () => {
    const scenario = parseScenario(scenarioText('climb-interrupt.json'));
    const run = await runScenario(scenario);
    expect(run.error).toBeUndefined();
    const frames = run.trace!.frames;
    const timed = frames.filter((f) => typeof f.fields['claymore.timer'] === 'number');
    expect(timed.length).toBeGreaterThan(0);
    const timers = timed.map((f) => f.fields['claymore.timer'] as number);
    expect(timers[0]).toBeLessThanOrEqual(1.3);
    expect(timers[0]).toBeGreaterThan(1.2);
    for (let i = 1; i < timers.length; i++) expect(timers[i]).toBeLessThan(timers[i - 1]!);
    expect(timed.every((f) => f.fields['action.current'] === 'place')).toBe(true);
    const after = frames.filter((f) => f.frame > timed[timed.length - 1]!.frame);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.fields['claymore.placed']).toBe(1);
    expect(frames[0]!.fields['claymore.placed']).toBe(0);
  });
});
