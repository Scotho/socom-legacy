import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { envLines, main, parseRecompLog, recompEnv } from '../harness/recomp-trace';
import { SchemaRefusal } from '../harness/schema';
import { parseTrace, formatTrace, pressEdge } from '../harness/trace';

/**
 * PH-4's converter and PH-1's run environment (plan 2026-10-11-web-parity-harness.md; research 366): the game log's
 * rows -- in the shapes the desktop's runtime writes them at desktop@be557831 (`game_overrides_socom2.cpp` `[call]`,
 * `[ret]`, `[ret-unwound]`, `[ret-dump]`; `socom2_host_input.cpp` `[socom2-input]`; `socom2_peek.h` `[peek]`) -- into an
 * `s2t` trace. A synthetic log only (`none`): no run of the recomp is read here.
 */

const PLAYER = 0x00c01000;
const OTHER = 0x00c09000;
const ROOT = 0x00c0a000;
const hex8 = (v: number): string => (v >>> 0).toString(16).padStart(8, '0');
const f32 = (x: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x, true); return b.getUint32(0, true); };
const dump = (n: number, base: number, off: number, words: number[]): string =>
  `[ret-dump] SealTick #${n} @${(base + off).toString(16)}: ${words.map((w) => `${hex8(w)}(0)`).join(' ')}`;

/**
 * A log: the actor pointer peeked, then per game frame one other body's tick and the player's, with a dump each. The
 * `[call]` rows have the runtime's one-decimal shape (a real row's format; no value of one copied). `noRetAt`: a call
 * that printed neither `[ret]` nor a dump (pc == ra while unwinding); `nullRootAt`: the root pointer word 0.
 */
function syntheticLog(frames: number, pressAt: number, unwoundAt: number, noRetAt = -1, nullRootAt = -1): string {
  const out: string[] = [`[peek] @408c58: ${hex8(PLAYER)}(0) @4365c0: ${hex8(f32(12.5))}(12.5)`];
  let n = 0;
  for (let i = 0; i < frames; i++) {
    if (i === pressAt) out.push('[socom2-input] state buttons=4000 rx=80 ry=80 lx=80 ly=80');
    if (i === pressAt + 1) out.push('[socom2-input] state buttons=0000 rx=80 ry=80 lx=80 ly=00');
    out.push(`[call] ${(i / 30).toFixed(1)}s SealTick #${n} a0=0x${OTHER.toString(16)} a1=0x0 a2=0x0 a3=0x0 ra=0x57a000 f12=0.0 f13=0.0 f14=0.0`);
    out.push(`[ret] SealTick #${n} v0=0x0 f0=0`);
    n++;
    out.push(`[call] ${(i / 30).toFixed(1)}s SealTick #${n} a0=0x${PLAYER.toString(16)} a1=0x0 a2=0x0 a3=0x0 ra=0x57a000 f12=0.0 f13=0.0 f14=0.0`);
    if (i === unwoundAt) {
      out.push(`[ret-unwound] SealTick #${n} pc=0x57a3a0 ra=0x57a000`);
    } else if (i === noRetAt) {
      // nothing: neither [ret] nor a dump
    } else {
      out.push(`[ret] SealTick #${n} v0=0x0 f0=0`);
      out.push(dump(n, PLAYER, 0x1c, [f32(100 + i), f32(10), f32(-5)]));
      out.push(dump(n, PLAYER, 0x534, [0x0002002a]));
      out.push(dump(n, PLAYER, 0x1c8, [0]));
      out.push(dump(n, PLAYER, 0xf78, [0x00010000]));
      out.push(dump(n, PLAYER, 0x2e0, [f32(0.0333667)]));
      out.push(dump(n, PLAYER, 0x2e8, [i === nullRootAt ? 0 : ROOT]));
      if (i !== nullRootAt) out.push(dump(n, ROOT, 0x4, [f32(11.5)]));
    }
    n++;
  }
  return out.join('\n');
}

describe('PH-1\'s run environment, from the re-read schema', () => {
  it('traces the player\'s tick every call and dumps the re-read offsets, not the wave-1 string\'s retired ones', () => {
    const env = recompEnv('r0001', 'frostfire-box');
    expect(env.PS2X_CALL_TRACE).toBe('0x0057a330:SealTick');
    expect(env.PS2X_CALL_TRACE_EVERY).toBe('1');
    const items = env.PS2X_CALL_TRACE_DUMP!.split(',');
    expect(items).toContain('SealTick:a0+0x1c:3');
    expect(items).toContain('SealTick:a0+0x534:1');
    expect(items).toContain('SealTick:a0+0x2e8*+0x4:1');
    expect(items.some((i) => i.includes('+0x87c'))).toBe(false);          // the charge object's, not the actor's
    expect(items.some((i) => i.includes('+0x64'))).toBe(false);           // vel.world: no use of +0x64
    expect(env.PS2X_PEEK).toBe('0x408c58:1,0x4365c0:1');
    expect(env.PS2X_SOCOM2_INPUT_TRACE).toBe('1');
    expect(env.PS2X_HOST_GAMEPAD).toBe('0');
  });

  it('refuses r0004: the tick\'s address there is not established', () => {
    expect(() => recompEnv('r0004', 'frostfire-box')).toThrow(SchemaRefusal);
  });
});

describe('PH-4: the game log into s2t', () => {
  it('300 player ticks and one X press give 300 frames with the press edge on its frame; the other body\'s rows are dropped', () => {
    const trace = parseRecompLog(syntheticLog(300, 120, -1), { scenario: 'synthetic', fieldSet: 'frostfire-box', revision: 'r0001' });
    expect(trace.frames).toHaveLength(300);
    expect(pressEdge(trace.frames)).toBe(120);
    expect(trace.frames[121]!.pad).toEqual({ b: 0, lx: 0x80, ly: 0, rx: 0x80, ry: 0x80 });
    expect(trace.frames[7]!.fields['pos.x']).toBeCloseTo(107, 4);
    expect(trace.frames[7]!.fields['pos.z']).toBeCloseTo(-5, 4);
    expect(trace.frames[7]!.fields['action.current']).toBe('motion:0x2a');   // the id; its mapping is owed (366 section 2)
    expect(trace.frames[7]!.fields['action.depth']).toBe(1);                 // the top index plus one
    expect(trace.frames[7]!.fields.alive).toBe(1);                           // the byte at +0xf7a
    expect(trace.frames[7]!.fields.dt).toBeCloseTo(0.0333667, 6);            // actor+0x2e0 (D:L439135), not [call]'s f12
    expect(trace.frames[7]!.fields.t_guest).toBeNull();                        // the clock is not read per frame
    expect(trace.frames[7]!.fields['root.y']).toBeCloseTo(21.5, 4);
    expect(trace.header.side).toBe('recomp');
    expect(trace.header.reference.retail).toBe(false);
    expect(parseTrace(formatTrace(trace)).frames).toHaveLength(300);         // a well-formed s2t
  });

  it('a [ret-unwound] row gives a masked frame with no readings', () => {
    const trace = parseRecompLog(syntheticLog(10, 3, 5), { scenario: 'synthetic', fieldSet: 'frostfire-box', revision: 'r0001' });
    expect(trace.frames[5]!.masked).toBe(true);
    expect(trace.frames[5]!.maskWhy).toMatch(/unwound/);
    expect(trace.frames[5]!.fields['pos.x']).toBeNull();
    expect(trace.frames[4]!.masked).toBe(false);
  });

  it('refuses a log with no actor pointer peeked: the player\'s rows cannot be told apart', () => {
    expect(() => parseRecompLog('[call] 0.0s SealTick #0 a0=0x10 a1=0x0 a2=0x0 a3=0x0 ra=0x0 f12=0.03 f13=0 f14=0', {
      scenario: 'synthetic', fieldSet: 'frostfire-box', revision: 'r0001',
    })).toThrow(/actor pointer/);
  });
});

describe('the command line', () => {
  it('env prints the scenario\'s environment as shell lines', () => {
    const lines = envLines({ A: 'x', B: "it's" });
    expect(lines).toEqual(["export A='x'", "export B='it'\\''s'"]);
  });

  it('convert writes recomp.s2t from a log under --out; a usage error is 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ph4-'));
    try {
      const log = join(dir, 'run.log');
      writeFileSync(log, syntheticLog(12, 4, -1));
      const scenario = resolve(dirname(fileURLToPath(import.meta.url)), '../harness/scenarios/climb-interrupt.json');
      expect(main(['convert', '--log', log, '--scenario', scenario, '--out', join(dir, 'out')])).toBe(0);
      const trace = parseTrace(readFileSync(join(dir, 'out', 'recomp.s2t'), 'utf8'));
      expect(trace.frames).toHaveLength(12);
      expect(trace.header.env.PS2X_CALL_TRACE).toBe('0x0057a330:SealTick');
      expect(main(['convert', '--scenario', scenario])).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('review-ph-4: the parse at the source\'s shapes', () => {
  const opts = { scenario: 'synthetic', fieldSet: 'frostfire-box', revision: 'r0001' as const };

  it('F4: a call with no [ret] row is masked, never an unmasked frame of nulls', () => {
    const trace = parseRecompLog(syntheticLog(10, 3, -1, 6), opts);
    expect(trace.frames[6]!.masked).toBe(true);
    expect(trace.frames[6]!.maskWhy).toMatch(/no \[ret\]/);
  });

  it('F5: a 0 pointer in a chain is no reading, not a height', () => {
    const trace = parseRecompLog(syntheticLog(10, 3, -1, -1, 4), opts);
    expect(trace.frames[4]!.fields['root.y']).toBeNull();
    expect(trace.frames[5]!.fields['root.y']).toBeCloseTo(21.5, 4);
  });

  it('F3: the actor followed by the latest peek before each call; a change masks the first frame after it', () => {
    const log = syntheticLog(6, 2, -1).split('\n');
    const at = log.findIndex((l) => l.includes(`SealTick #6 `));
    log.splice(at, 0, `[peek] @408c58: ${hex8(OTHER)}(0) @4365c0: ${hex8(f32(13))}(13)`);
    const trace = parseRecompLog(log.join('\n'), opts);
    expect(trace.frames.length).toBeGreaterThan(3);
    expect(trace.frames[3]!.masked).toBe(true);
    expect(trace.frames[3]!.maskWhy).toMatch(/actor pointer changed/);
  });

  it('F6: convert refuses an existing recomp.s2t unless --force', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ph4-'));
    try {
      const log = join(dir, 'run.log');
      writeFileSync(log, syntheticLog(4, 1, -1));
      const scenario = resolve(dirname(fileURLToPath(import.meta.url)), '../harness/scenarios/climb-interrupt.json');
      const out = join(dir, 'out');
      expect(main(['convert', '--log', log, '--scenario', scenario, '--out', out])).toBe(0);
      expect(main(['convert', '--log', log, '--scenario', scenario, '--out', out])).toBe(2);
      expect(main(['convert', '--log', log, '--scenario', scenario, '--out', out, '--force'])).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
