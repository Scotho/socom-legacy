/**
 * The parity comparator (plan section 2.4, PH-7, PH-23).
 *
 *   npx tsx tools/harness/compare.ts <a.s2t> <b.s2t> --scenario <json> [--out <dir>]
 *
 * One scenario, one report. Lines are equal, differs, skipped, masked or unknown, kept apart (PH.R9). The
 * reference is labelled an emulated reference -- an Unzipped recompilation or a PCSX2 capture -- and never a
 * retail console (PH.R7, PH.R8). No parity percentage is computed.
 *
 * Exit 0 when every scored line is equal, skipped or masked. Exit 1 when a scored line differs. Exit 2 when
 * the traces or the scenario cannot be compared, or the output path is refused.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { outputRefusal } from '../outputRefusal';
import { fieldByName, fieldSet, type FieldDef, POSITION_FALL_U, POSITION_PRESS_U, POSITION_REST_U, SchemaRefusal } from './schema';
import { parseScenario, type OutcomeSpec, type Scenario, ScenarioRefusal } from './scenario';
import { parseTrace, placeEdge, pressEdge, stickEdge, type Trace, type TraceFrame, type TraceHeader, TraceRefusal } from './trace';

export type LineStatus = 'equal' | 'differs' | 'skipped' | 'masked' | 'unknown';

export interface HarnessLine {
  field: string;
  /** The frame number on trace A. Null when the row is not a frame. */
  frame: number | null;
  a: number | string | null;
  b: number | string | null;
  tolerance: string;
  status: LineStatus;
  /** PH.R8: validated, recomp-only, or emulated-console. Never retail. */
  standing: string;
  why?: string;
}

export interface FieldSummary {
  field: string;
  equal: number;
  differs: number;
  skipped: number;
  masked: number;
  unknown: number;
  maxError: number | null;
  maxErrorFrame: number | null;
  standing: string;
}

export interface CompareReport {
  schema: 1;
  tool: 'tools/harness/compare.ts';
  scenario: string;
  sideA: string;
  sideB: string;
  /** The reference, in words. An emulated build, not a retail console. */
  referenceLabel: string;
  retailConsole: false;
  standing: string;
  alignment: { frameA: number | null; frameB: number | null; offset: number | null; note: string };
  fields: FieldSummary[];
  lines: HarnessLine[];
  outcomes: HarnessLine[];
  coverage: { defined: number; scored: number; compared: number };
  totals: { equal: number; differs: number; skipped: number; masked: number; unknown: number };
  firstDifference: { frame: number | null; field: string } | null;
}

export interface CompareResult {
  code: 0 | 1 | 2;
  refusal?: string;
  report?: CompareReport;
  markdown?: string;
}

function num(v: number | string | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function speed(frame: TraceFrame): number {
  const x = num(frame.fields['vel.local.x']);
  const y = num(frame.fields['vel.local.y']);
  const z = num(frame.fields['vel.local.z']);
  if (x === null || y === null || z === null) return 0;
  return Math.hypot(x, y, z);
}

function falling(frame: TraceFrame): boolean {
  const y = num(frame.fields['vel.local.y']);
  return y !== null && y < 0;
}

function referenceOf(a: Trace, b: Trace): { label: string; standing: string; side: TraceHeader['side'] } {
  const ref = a.header.side === 'port' ? b.header : b.header.side === 'port' ? a.header : b.header;
  if (ref.side === 'port') {
    return {
      side: 'port',
      standing: 'no-reference',
      label: 'no original-side reference in this pair. A reference trace is an emulated Unzipped recompilation or a PCSX2 capture, not a retail console',
    };
  }
  const standing = ref.reference.standing === 'validated' ? 'validated' : ref.side === 'console' ? 'emulated-console' : 'recomp-only';
  const known = ref.reference.known ? ` Validated on an emulated capture: ${ref.reference.known}.` : '';
  return { side: ref.side, standing, label: `${ref.reference.label}.${known}` };
}

/**
 * PH-23 (PH.R8): one line's standing, from its field. A PCSX2 capture is an emulated console and says so; against a
 * recomp reference a line is validated only where its field cites the KNOWN section 1 row that measured it on PCSX2
 * or a console, and recomp-only otherwise -- a header that calls the whole reference validated does not lend that to
 * a field with no row of its own. Lines that name no field (the alignment) keep the reference's standing.
 */
export function lineStanding(ref: { side: TraceHeader['side']; standing: string }, def: FieldDef | undefined): string {
  if (ref.side === 'port') return 'no-reference';
  if (ref.side === 'console') return 'emulated-console';
  return def?.known ? `validated (KNOWN section 1: ${def.known})` : 'recomp-only';
}

function line(partial: Omit<HarnessLine, 'standing'> & { standing?: string }, standing: string): HarnessLine {
  return { ...partial, standing: partial.standing ?? standing };
}

function positionTolerance(i: number, alignedOnPress: boolean, fa: TraceFrame, fb: TraceFrame): { limit: number; text: string } {
  if (alignedOnPress && i === 0) return { limit: POSITION_PRESS_U, text: `${POSITION_PRESS_U} u at the press frame` };
  if (falling(fa) || falling(fb)) {
    const dtA = num(fa.fields.dt) ?? 0;
    const dtB = num(fb.fields.dt) ?? 0;
    const v = Math.max(speed(fa), speed(fb));
    const widen = Math.abs(dtA - dtB) * v;
    const limit = POSITION_FALL_U + widen;
    return {
      limit,
      text: `${POSITION_FALL_U} u over the fall, widened by |dt_a - dt_b| x |v| = ${widen} u (dt ${dtA} and ${dtB}, |v| ${v})`,
    };
  }
  return { limit: POSITION_REST_U, text: `${POSITION_REST_U} u at rest` };
}

function valuesDiffer(a: number | string, b: number | string, limit: number | null): { differs: boolean; error: number | null } {
  if (typeof a === 'number' && typeof b === 'number') {
    const error = Math.abs(a - b);
    if (limit === null) return { differs: a !== b, error };
    return { differs: error > limit + 1e-9, error };
  }
  return { differs: a !== b, error: null };
}

function frameAt(frames: readonly TraceFrame[], index: number | null): TraceFrame | null {
  if (index === null || index < 0 || index >= frames.length) return null;
  return frames[index] ?? null;
}

function outcomeFrame(spec: OutcomeSpec, frames: readonly TraceFrame[], press: number | null): number | null {
  const place = placeEdge(frames);
  switch (spec.at) {
    case 'press': return press;
    case 'before-press': return press === null ? null : press - 1;
    case 'press+1': return press === null ? null : press + 1;
    case 'before-place': return place === null ? null : place - 1;
    case 'end': return frames.length > 0 ? frames.length - 1 : null;
    default: return null;
  }
}

function sameValue(v: number | string | null, equals: string | number): boolean {
  if (typeof equals === 'number') return v === equals;
  return v === equals;
}

export function compareTraces(a: Trace, b: Trace, scenario: Scenario): CompareResult {
  if (a.header.scenario !== b.header.scenario || a.header.scenario !== scenario.name) {
    return { code: 2, refusal: `the traces and the scenario do not name one scenario (${a.header.scenario}, ${b.header.scenario}, ${scenario.name})` };
  }
  if (a.header.fieldSet !== b.header.fieldSet || a.header.fieldSet !== scenario.fields) {
    return { code: 2, refusal: `the traces and the scenario do not name one field set (${a.header.fieldSet}, ${b.header.fieldSet}, ${scenario.fields})` };
  }
  let fields;
  try {
    fields = fieldSet(scenario.fields);
  } catch (e) {
    if (e instanceof SchemaRefusal) return { code: 2, refusal: e.message };
    throw e;
  }
  if (a.frames.length === 0 || b.frames.length === 0) return { code: 2, refusal: 'a trace has no frames' };
  const ref = referenceOf(a, b);
  const standing = ref.standing;
  const edgeA = pressEdge(a.frames);
  const edgeB = pressEdge(b.frames);
  const alignedOnPress = edgeA !== null && edgeB !== null;
  // review-ph-run (3): a run with no X or place press (PH-1's holds) aligns on its first stick change from neutral.
  const stickA = edgeA === null && edgeB === null ? stickEdge(a.frames) : null;
  const stickB = edgeA === null && edgeB === null ? stickEdge(b.frames) : null;
  const alignedOnStick = stickA !== null && stickB !== null;
  // On the stick edge the offset aligns the traces and the frames before it are compared too (as early as both allow).
  const lead = alignedOnStick ? Math.min(stickA!, stickB!) : 0;
  const startA = alignedOnPress ? edgeA! : alignedOnStick ? stickA! - lead : 0;
  const startB = alignedOnPress ? edgeB! : alignedOnStick ? stickB! - lead : 0;
  const alignment = {
    frameA: alignedOnStick ? stickA : edgeA, frameB: alignedOnStick ? stickB : edgeB,
    offset: alignedOnPress ? edgeB! - edgeA! : alignedOnStick ? stickB! - stickA! : null,
    note: alignedOnPress
      ? `press edge at ${a.header.side} frame ${edgeA}, ${b.header.side} frame ${edgeB} (offset ${edgeB! - edgeA!})`
      : alignedOnStick
        ? `no press edge; the first stick change from neutral at ${a.header.side} frame ${stickA}, ${b.header.side} frame ${stickB} (offset ${stickB! - stickA!})`
        : edgeA === null && edgeB === null
          ? 'no press edge or stick change on both traces; compared from frame 0'
          : `a press edge is on only one trace (${a.header.side} ${edgeA ?? '-'}, ${b.header.side} ${edgeB ?? '-'}); compared from frame 0`,
  };
  const lines: HarnessLine[] = [];
  if (edgeA === null && edgeB !== null || edgeA !== null && edgeB === null) {
    lines.push(line({
      field: 'alignment', frame: edgeA, a: edgeA, b: edgeB, tolerance: 'a press edge on both traces, or on neither',
      status: 'differs', why: alignment.note,
    }, standing));
  }
  const span = Math.max(a.frames.length - startA, b.frames.length - startB);
  const known = new Set(fields.map((f) => f.name));
  for (let i = 0; i < span; i++) {
    const fa = frameAt(a.frames, startA + i);
    const fb = frameAt(b.frames, startB + i);
    const frameNo = fa?.frame ?? null;
    const rejected = fa && fb && [fa, fb].some((f) => {
      const m = num(f.fields.moveScale);
      return m !== null && m !== 1;
    });
    for (const def of fields) {
      if (!fa || !fb) {
        if (!def.scored) continue;
        lines.push(line({
          field: def.name, frame: frameNo, a: fa ? (fa.fields[def.name] ?? null) : null, b: fb ? (fb.fields[def.name] ?? null) : null,
          tolerance: 'paired frames', status: 'skipped', why: 'no paired frame',
        }, standing));
        continue;
      }
      const va = fa.fields[def.name];
      const vb = fb.fields[def.name];
      const aMissing = va === undefined;
      const bMissing = vb === undefined;
      // Unscored and schema-masked fields are counted once per paired frame on the summary, not printed per frame.
      if (!def.scored || def.tolerance.kind === 'masked') continue;
      if (fa.masked || fb.masked) {
        lines.push(line({
          field: def.name, frame: fa.frame, a: va ?? null, b: vb ?? null, tolerance: 'none (masked frame)', status: 'masked',
          why: fa.maskWhy ?? fb.maskWhy ?? 'torn or unwound frame',
        }, standing));
        continue;
      }
      if (rejected && def.name !== 'moveScale') {
        lines.push(line({
          field: def.name, frame: fa.frame, a: va ?? null, b: vb ?? null, tolerance: 'frame rejected', status: 'skipped',
          why: 'frame rejected: moveScale is not 1.0 (research 79, as the plan cites it)',
        }, standing));
        continue;
      }
      if (aMissing || bMissing) {
        lines.push(line({
          field: def.name, frame: fa.frame, a: va ?? null, b: vb ?? null, tolerance: 'present on both traces', status: 'unknown',
          why: 'the field is absent from a trace',
        }, standing));
        continue;
      }
      if (va === null || vb === null) {
        const who = va === null && vb === null ? 'either side' : va === null ? a.header.side : b.header.side;
        lines.push(line({
          field: def.name, frame: fa.frame, a: va, b: vb, tolerance: 'a reading on both sides', status: 'skipped',
          why: `no reading on ${who}`,
        }, standing));
        continue;
      }
      let limit: number | null = null;
      let tolerance: string;
      if (def.tolerance.kind === 'exact') {
        tolerance = 'exact';
      } else if (def.tolerance.kind === 'abs') {
        limit = def.tolerance.limit;
        tolerance = `${def.tolerance.limit} ${def.tolerance.unit}`;
      } else if (def.tolerance.kind === 'position') {
        const band = positionTolerance(i, alignedOnPress, fa, fb);
        limit = band.limit;
        tolerance = band.text;
      } else {
        lines.push(line({
          field: def.name, frame: fa.frame, a: va, b: vb, tolerance: 'recorded, not scored', status: 'skipped',
          why: 'recorded, not scored',
        }, standing));
        continue;
      }
      const cmp = valuesDiffer(va, vb, limit);
      lines.push(line({
        field: def.name, frame: fa.frame, a: va, b: vb, tolerance,
        status: cmp.differs ? 'differs' : 'equal',
      }, standing));
    }
    if (fa && fb) {
      const extras = new Set([...Object.keys(fa.fields), ...Object.keys(fb.fields)].filter((n) => !known.has(n)));
      for (const name of extras) {
        if (lines.some((l) => l.field === name && l.frame === fa.frame)) continue;
        lines.push(line({
          field: name, frame: fa.frame, a: fa.fields[name] ?? null, b: fb.fields[name] ?? null,
          tolerance: 'in the field set', status: 'unknown', why: 'not in the field set',
        }, standing));
      }
    }
  }
  // Attach the numeric error onto equal and differs lines by recomputing from a/b. Kept on the line via tolerance only;
  // the summary stores the max. Recomputed below from the lines' values.
  const outcomes: HarnessLine[] = [];
  for (const spec of scenario.outcomes ?? []) {
    const ia = outcomeFrame(spec, a.frames, edgeA);
    const ib = outcomeFrame(spec, b.frames, edgeB);
    const fa = frameAt(a.frames, ia);
    const fb = frameAt(b.frames, ib);
    if (!fa || !fb) {
      outcomes.push(line({
        field: spec.id, frame: ia, a: null, b: null, tolerance: `${spec.field} = ${spec.equals}`, status: 'skipped',
        why: `no frame for ${spec.at}`,
      }, lineStanding(ref, fieldByName(fields, spec.field))));
      continue;
    }
    const va = fa.fields[spec.field] ?? null;
    const vb = fb.fields[spec.field] ?? null;
    const okA = sameValue(va, spec.equals);
    const okB = sameValue(vb, spec.equals);
    outcomes.push(line({
      field: spec.id, frame: fa.frame, a: va, b: vb, tolerance: `${spec.field} = ${spec.equals} at ${spec.at}`,
      status: okA && okB ? 'equal' : 'differs',
      why: `${a.header.side} frame ${fa.frame}, ${b.header.side} frame ${fb.frame}`,
    }, lineStanding(ref, fieldByName(fields, spec.field))));
  }
  for (let k = 0; k < lines.length; k++) {                       // PH-23: a field's line, its field's standing
    const l = lines[k]!;
    if (l.field !== 'alignment') lines[k] = { ...l, standing: lineStanding(ref, fieldByName(fields, l.field)) };
  }
  const summaries = new Map<string, FieldSummary>();
  const ensure = (name: string): FieldSummary => {
    let s = summaries.get(name);
    if (!s) {
      s = { field: name, equal: 0, differs: 0, skipped: 0, masked: 0, unknown: 0, maxError: null, maxErrorFrame: null, standing: lineStanding(ref, fieldByName(fields, name)) };
      summaries.set(name, s);
    }
    return s;
  };
  for (const def of fields) ensure(def.name);
  const paired = span;
  for (const def of fields) {
    if (def.scored && def.tolerance.kind !== 'masked') continue;
    const s = ensure(def.name);
    if (def.tolerance.kind === 'masked') s.masked += paired;
    else s.skipped += paired;
  }
  for (const l of lines) {
    const s = ensure(l.field);
    s[l.status] += 1;
    if ((l.status === 'equal' || l.status === 'differs') && typeof l.a === 'number' && typeof l.b === 'number') {
      const err = Math.abs(l.a - l.b);
      if (s.maxError === null || err > s.maxError) {
        s.maxError = err;
        s.maxErrorFrame = l.frame;
      }
    }
  }
  const fieldSummaries = [...summaries.values()];
  const counted = [...lines, ...outcomes];
  const totals = { equal: 0, differs: 0, skipped: 0, masked: 0, unknown: 0 };
  for (const l of counted) totals[l.status] += 1;
  const first = counted.find((l) => l.status === 'differs');
  const compared = fieldSummaries.filter((s) => s.equal + s.differs > 0).length;
  const report: CompareReport = {
    schema: 1,
    tool: 'tools/harness/compare.ts',
    scenario: scenario.name,
    sideA: a.header.side,
    sideB: b.header.side,
    referenceLabel: ref.label,
    retailConsole: false,
    standing,
    alignment,
    fields: fieldSummaries,
    lines,
    outcomes,
    coverage: { defined: fields.length, scored: fields.filter((f) => f.scored).length, compared },
    totals,
    firstDifference: first ? { frame: first.frame, field: first.field } : null,
  };
  return { code: totals.differs > 0 ? 1 : 0, report, markdown: formatReport(report) };
}

export function formatReport(r: CompareReport): string {
  const out: string[] = [];
  out.push(`PARITY HARNESS -- scenario ${r.scenario}`);
  out.push(`sides: ${r.sideA} against ${r.sideB}`);
  out.push(`reference: ${r.referenceLabel}`);
  out.push(`standing: ${r.standing}`);
  out.push(`retail console: no`);
  out.push(`alignment: ${r.alignment.note}`);
  out.push('fields (counts kept apart; no single parity score):');
  for (const f of r.fields) {
    const err = f.maxError === null ? '' : `; max error ${f.maxError} at frame ${f.maxErrorFrame ?? '-'}`;
    out.push(`  ${f.field}  equal ${f.equal}  differs ${f.differs}  skipped ${f.skipped}  masked ${f.masked}  unknown ${f.unknown}${err}  standing ${f.standing}`);
  }
  const detail = (l: HarnessLine): string => {
    const why = l.why ? ` -- ${l.why}` : '';
    return `  ${l.status.padEnd(8)} ${l.field} frame ${l.frame ?? '-'}  ${r.sideA} ${l.a ?? '-'}  ${r.sideB} ${l.b ?? '-'}  (${l.tolerance}; ${l.standing})${why}`;
  };
  const uneven = r.lines.filter((l) => l.status !== 'equal');
  if (uneven.length) {
    out.push('lines that are not equal:');
    for (const l of uneven) out.push(detail(l));
  }
  out.push('outcomes:');
  if (r.outcomes.length === 0) out.push('  (none named)');
  for (const l of r.outcomes) out.push(detail(l));
  const t = r.totals;
  const c = r.coverage;
  out.push(`coverage: ${c.compared} fields compared, of ${c.scored} scored, of ${c.defined} defined`);
  out.push(`summary: equal ${t.equal}, differs ${t.differs}, skipped ${t.skipped}, masked ${t.masked}, unknown ${t.unknown}`);
  out.push(r.firstDifference
    ? `first difference: ${r.firstDifference.field} at frame ${r.firstDifference.frame ?? '-'}`
    : 'first difference: none');
  out.push('No single parity percentage is computed.');
  return `${out.join('\n')}\n`;
}

/**
 * Writes compare.json and compare.md under `dir`, or returns the refusal. A path under SOCOM_PC_ROOT, or a path
 * in this repository that git does not ignore, is refused (PH.R2, the same rule as prove-results' outputRefusal).
 */
export function writeCompareReport(report: CompareReport, markdown: string, dir: string, pcRoot: string | null = process.env.SOCOM_PC_ROOT ?? null): string | null {
  const jsonPath = resolve(dir, 'compare.json');
  const mdPath = resolve(dir, 'compare.md');
  const refusal = outputRefusal(jsonPath, pcRoot) ?? outputRefusal(mdPath, pcRoot);
  if (refusal) return refusal;
  mkdirSync(dir, { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, markdown);
  return null;
}

function main(argv: string[]): number {
  const args = [...argv];
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const scenarioPath = take('--scenario');
  const out = take('--out');
  const [aPath, bPath] = args;
  if (!aPath || !bPath || !scenarioPath) {
    console.error('usage: npx tsx tools/harness/compare.ts <a.s2t> <b.s2t> --scenario <json> [--out <dir>]');
    return 2;
  }
  let result: CompareResult;
  try {
    const scenario = parseScenario(readFileSync(scenarioPath, 'utf8'));
    const a = parseTrace(readFileSync(aPath, 'utf8'));
    const b = parseTrace(readFileSync(bPath, 'utf8'));
    result = compareTraces(a, b, scenario);
  } catch (e) {
    if (e instanceof ScenarioRefusal || e instanceof TraceRefusal || e instanceof SchemaRefusal) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
  if (result.refusal || !result.report || !result.markdown) {
    console.error(result.refusal ?? 'the traces could not be compared');
    return 2;
  }
  console.log(result.markdown);
  if (out) {
    const refusal = writeCompareReport(result.report, result.markdown, out);
    if (refusal) {
      console.error(refusal);
      return 2;
    }
    console.log(`report: ${resolve(out, 'compare.md')}`);
  }
  return result.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
