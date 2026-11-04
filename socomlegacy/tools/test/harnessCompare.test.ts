import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareTraces, formatReport, lineStanding, writeCompareReport } from '../harness/compare';
import { FROSTFIRE_BOX, type FieldDef } from '../harness/schema';
import { runScenario } from '../harness/port-trace';
import { parseScenario } from '../harness/scenario';
import { parseTrace, placeEdge, referenceFor, TraceRefusal, type Trace, type TraceFrame, type TraceHeader } from '../harness/trace';

const SCENARIOS = resolve(dirname(fileURLToPath(import.meta.url)), '../harness/scenarios');

function load(name: string) {
  return parseScenario(readFileSync(resolve(SCENARIOS, name), 'utf8'));
}

function reheader(trace: Trace, side: TraceHeader['side'], scenario: string): Trace {
  const copy = structuredClone(trace);
  copy.header.side = side;
  copy.header.scenario = scenario;
  copy.header.reference = referenceFor(side);
  return copy;
}

function keysOf(v: unknown, out: string[] = []): string[] {
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out.push(k);
      keysOf(val, out);
    }
  }
  return out;
}

describe('compare on synthetic traces', () => {
  it('reports an equal pair with no percentage and an emulated reference', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const port = run.trace!;
    const recomp = reheader(port, 'recomp', scenario.name);
    const result = compareTraces(port, recomp, scenario);
    expect(result.code).toBe(0);
    expect(result.report!.retailConsole).toBe(false);
    expect(result.markdown).toMatch(/emulated/);
    expect(result.markdown).toMatch(/not a retail console/);
    expect(result.markdown).toContain('No single parity percentage is computed.');
    expect(result.markdown).not.toMatch(/\d+(?:\.\d+)?\s*%/);
    expect(keysOf(result.report).join(' ')).not.toMatch(/percent|parityScore/i);
    expect(result.report!.standing).toBe('recomp-only');
    expect(result.report!.coverage.defined).toBeGreaterThan(result.report!.coverage.scored);
  });

  it('aligns a pair whose press edge is one frame apart', async () => {
    const scenario = load('climb-interrupt.json');
    const run = await runScenario(scenario);
    expect(run.error).toBeUndefined();
    const a = reheader(run.trace!, 'port', scenario.name);
    const b = structuredClone(a);
    b.header.side = 'recomp';
    b.header.reference = referenceFor('recomp');
    const neutral = structuredClone(b.frames[0]!);
    neutral.pad = { b: 0, lx: 128, ly: 128, rx: 128, ry: 128 };
    neutral.fields['pad.b'] = 0;
    neutral.fields['pad.lx'] = 128;
    neutral.fields['pad.ly'] = 128;
    neutral.fields['pad.rx'] = 128;
    neutral.fields['pad.ry'] = 128;
    b.frames = [neutral, ...b.frames].map((f, i) => ({ ...f, frame: i, fields: { ...f.fields, frame: i } }));
    const result = compareTraces(a, b, scenario);
    expect(result.report!.alignment.offset).toBe(1);
    expect(result.code).toBe(0);
    expect(result.report!.firstDifference).toBeNull();
  });

  it('masks a torn frame instead of scoring it', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const a = run.trace!;
    const b = structuredClone(a);
    const torn = b.frames[10]!;
    torn.masked = true;
    torn.maskWhy = 'torn';
    torn.fields['pos.x'] = (torn.fields['pos.x'] as number) + 40;
    const result = compareTraces(a, b, scenario);
    expect(result.code).toBe(0);
    const row = result.report!.lines.find((l) => l.field === 'pos.x' && l.frame === 10);
    expect(row?.status).toBe('masked');
  });

  it('exits 1 when an outcome differs', async () => {
    const scenario = load('climb-interrupt.json');
    const run = await runScenario(scenario);
    const a = run.trace!;
    const b = reheader(a, 'recomp', scenario.name);
    const place = placeEdge(a.frames);
    expect(place).not.toBeNull();
    b.frames[place! - 1]!.fields['action.current'] = 'none';
    const result = compareTraces(a, b, scenario);
    expect(result.code).toBe(1);
    const outcome = result.report!.outcomes.find((l) => l.field === 'climb-before-place');
    expect(outcome?.status).toBe('differs');
  });

  it('exits 2 when the headers do not name one scenario', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const a = run.trace!;
    const b = structuredClone(a);
    b.header.scenario = 'other';
    expect(compareTraces(a, b, scenario).code).toBe(2);
  });

  it('refuses retail: true at parse', () => {
    expect(() => parseTrace(JSON.stringify({
      schema: 1, kind: 'header', side: 'recomp', scenario: 'x', fieldSet: 'frostfire-box', revision: 'r0001',
      mapHash: null, build: {}, env: {},
      reference: { emulated: true, retail: true, label: 'not a retail console', standing: 'recomp-only' },
    }))).toThrow(TraceRefusal);
  });

  it('refuses a report path under the desktop tree and writes outside the repo', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const result = compareTraces(run.trace!, reheader(run.trace!, 'recomp', scenario.name), scenario);
    const pc = mkdtempSync(join(tmpdir(), 'socom-pc-'));
    const refused = writeCompareReport(result.report!, result.markdown!, join(pc, 'out'), pc);
    expect(refused).toMatch(/SOCOM_PC_ROOT/);
    const outside = mkdtempSync(join(tmpdir(), 'harness-report-'));
    expect(writeCompareReport(result.report!, result.markdown!, outside, pc)).toBeNull();
    expect(readFileSync(join(outside, 'compare.md'), 'utf8')).toContain('No single parity percentage');
  });

  it('widens the fall band by the dt gap, and keeps the rest band tight', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const base = run.trace!.frames[20]!;
    const make = (posX: number, vy: number, dt: number): Trace => {
      const f: TraceFrame = structuredClone(base);
      f.frame = 0;
      f.masked = false;
      f.pad = { b: 0, lx: 128, ly: 128, rx: 128, ry: 128 };
      f.fields.frame = 0;
      f.fields.dt = dt;
      f.fields['pad.b'] = 0;
      f.fields['pos.x'] = posX;
      f.fields['vel.local.x'] = 0;
      f.fields['vel.local.y'] = vy;
      f.fields['vel.local.z'] = 0;
      f.fields['vel.world.x'] = 0;
      f.fields['vel.world.y'] = vy;
      f.fields['vel.world.z'] = 0;
      return { header: run.trace!.header, frames: [f] };
    };
    const fallA = make(0, -2, 1 / 30);
    const fallB = reheader(make(0.52, -2, 0.05), 'recomp', scenario.name);
    const fallen = compareTraces(fallA, fallB, scenario);
    const pos = fallen.report!.lines.find((l) => l.field === 'pos.x');
    expect(pos?.status).toBe('equal');
    expect(pos?.tolerance).toMatch(/widened by/);
    expect(fallen.code).toBe(0);
    const restB = reheader(make(0.52, 0, 1 / 30), 'recomp', scenario.name);
    const resting = compareTraces(make(0, 0, 1 / 30), restB, scenario);
    expect(resting.report!.lines.find((l) => l.field === 'pos.x')?.status).toBe('differs');
    expect(resting.code).toBe(1);
  });

  it('rejects a frame whose moveScale is not 1', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const a = run.trace!;
    const b = reheader(a, 'recomp', scenario.name);
    b.frames[4]!.fields.moveScale = 2;
    const result = compareTraces(a, b, scenario);
    expect(result.code).toBe(1);
    expect(result.report!.lines.find((l) => l.field === 'moveScale' && l.frame === 4)?.status).toBe('differs');
    expect(result.report!.lines.find((l) => l.field === 'pos.x' && l.frame === 4)?.status).toBe('skipped');
  });

  it('differs when only one trace has a press edge', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const a = run.trace!;
    const b = reheader(a, 'recomp', scenario.name);
    b.frames[3]!.pad.b = 0x4000;
    b.frames[3]!.fields['pad.b'] = 0x4000;
    const result = compareTraces(a, b, scenario);
    expect(result.report!.lines.find((l) => l.field === 'alignment')?.status).toBe('differs');
    expect(result.code).toBe(1);
  });
});

describe('the report shape', () => {
  it('names coverage as counts', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const result = compareTraces(run.trace!, reheader(run.trace!, 'console', scenario.name), scenario);
    expect(result.report!.standing).toBe('emulated-console');
    expect(formatReport(result.report!)).toMatch(/fields compared, of \d+ scored, of \d+ defined/);
    expect(result.markdown).toMatch(/retail console: no/);
  });
});

/**
 * PH-23 (PH.R8, confirmed 2026-10-22): each scored line carries ITS standing -- validated only where the desktop's KNOWN
 * section 1 proves that field's behaviour on PCSX2 or a console (the row cited by its key), recomp-only otherwise. The
 * report's own `standing` stays the whole reference's (its trace header).
 */
describe('PH-23: the standing is the line\'s field\'s', () => {
  const def = (known?: string): FieldDef => ({
    name: 'pos.x', type: 'f32', recomp: 'actor+0x1c', port: 'Walker.state.x', tolerance: { kind: 'position' },
    evidence: 'synthetic', scored: true, ...(known ? { known } : {}),
  });

  it('a recomp reference: validated only with the field\'s KNOWN row, else recomp-only; a console and no reference unchanged', () => {
    expect(lineStanding({ side: 'recomp', standing: 'recomp-only' }, def())).toBe('recomp-only');
    expect(lineStanding({ side: 'recomp', standing: 'recomp-only' }, def('Spawns are deterministic per map')))
      .toBe('validated (KNOWN section 1: Spawns are deterministic per map)');
    // a header that calls the whole reference validated does not make a field without its own row validated
    expect(lineStanding({ side: 'recomp', standing: 'validated' }, def())).toBe('recomp-only');
    expect(lineStanding({ side: 'recomp', standing: 'recomp-only' }, undefined)).toBe('recomp-only');
    expect(lineStanding({ side: 'console', standing: 'emulated-console' }, def())).toBe('emulated-console');
    expect(lineStanding({ side: 'port', standing: 'no-reference' }, def('x'))).toBe('no-reference');
  });

  it('no field of the first set claims a KNOWN row today: the rows that touch them were measured on the recomp', () => {
    // KNOWN section 1 at desktop@be557831 touches health (+0x1044, "The kill REPEATS on the block-pointer exe"), the
    // spawns ("Spawns are deterministic per map"), MoveScale ("Mutual standing does not starve either side online") and
    // the facing transform ("The actor's facing lives in its own transform"): each artefact is a run of the recomp exe
    // or a review script over one, not a PCSX2 or console measurement, so none makes a line validated (PH.R8).
    expect(FROSTFIRE_BOX.filter((f) => f.known !== undefined).map((f) => f.name)).toEqual([]);
  });

  it('a recomp pair: every field line recomp-only, the report\'s standing the reference\'s', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const result = compareTraces(run.trace!, reheader(run.trace!, 'recomp', scenario.name), scenario);
    expect(result.report!.standing).toBe('recomp-only');
    expect(new Set(result.report!.lines.map((l) => l.standing))).toEqual(new Set(['recomp-only']));
    expect(new Set(result.report!.fields.map((f) => f.standing))).toEqual(new Set(['recomp-only']));
  });
  it('a validated header lends nothing: every field line, summary and no-frame outcome reads recomp-only (review F4, F6)', async () => {
    const base = load('synthetic-walk.json');
    const scenario = { ...base, outcomes: [{ id: 'never-placed', at: 'before-place', field: 'action.current', equals: 'climb' }] } as typeof base;
    const run = await runScenario(base);
    const ref = reheader(run.trace!, 'recomp', base.name);
    ref.header.reference = referenceFor('recomp', 'validated', 'Spawns are deterministic per map');
    const result = compareTraces(run.trace!, ref, scenario);
    expect(result.report!.standing).toBe('validated');
    expect(result.report!.outcomes.map((o) => [o.status, o.standing])).toEqual([['skipped', 'recomp-only']]);
    expect(new Set(result.report!.lines.map((l) => l.standing))).toEqual(new Set(['recomp-only']));
    expect(new Set(result.report!.fields.map((f) => f.standing))).toEqual(new Set(['recomp-only']));
  });
});

describe('review-ph-run (3): a run with no X or place press aligns on its first stick change', () => {
  it('two traces whose left stick leaves neutral on different frames align there, and say so', async () => {
    const scenario = load('synthetic-walk.json');
    const run = await runScenario(scenario);
    const a = run.trace!;
    const b = reheader(a, 'recomp', scenario.name);
    b.frames = [{ ...b.frames[0]!, frame: 0, pad: { ...b.frames[0]!.pad } }, ...b.frames.map((f, i) => ({ ...f, frame: i + 1 }))];
    const result = compareTraces(a, b, scenario);
    expect(result.report!.alignment.offset).toBe(1);
    expect(result.report!.alignment.note).toMatch(/stick/);
  });
});
