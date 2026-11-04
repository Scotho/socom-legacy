import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main, PadDriver, padFileLine, writePad } from '../harness/recomp-run';
import { parseScenario, ScenarioRefusal } from '../harness/scenario';

/**
 * PH-4's driver (plan 2026-10-11-web-parity-harness.md; research 366 section 1): the pad file a run of the recomp reads
 * (`PS2X_SOCOM2_INPUT_FILE`, one line `b=<hex> rx= ry= lx= ly=`, axes 0-255 -- desktop@be557831
 * `third_party/ps2recomp/ps2xRuntime/src/lib/socom2_host_input.cpp:496-520`), written as the run's live log reaches each
 * keyframe's frame: the player's tick calls counted, the actor the latest peek. A synthetic log only (`none`).
 */

const SCENARIOS = resolve(dirname(fileURLToPath(import.meta.url)), '../harness/scenarios');
const scenario = (name: string) => parseScenario(readFileSync(resolve(SCENARIOS, name), 'utf8'));
const PLAYER = 0x00c01000, OTHER = 0x00c09000;
const call = (n: number, a0: number): string => `[call] 1.0s SealTick #${n} a0=0x${a0.toString(16)} a1=0x0 a2=0x0 a3=0x0 ra=0x57a000 f12=0.0 f13=0.0 f14=0.0\n`;

describe('the pad file\'s line', () => {
  it('is the runtime\'s grammar: the mask in hex, the axes in decimal', () => {
    expect(padFileLine({ b: 0x4000, lx: 128, ly: 0, rx: 128, ry: 255 })).toBe('b=4000 rx=128 ry=255 lx=128 ly=0\n');
  });
});

describe('PH-4: the pad driver over a live log', () => {
  it('writes each keyframe once the run reaches its frame, counting only the player\'s ticks', () => {
    const d = new PadDriver(scenario('synthetic-walk.json'), 'r0001');        // frame 0 neutral, frame 15 full forward
    const writes: string[] = [];
    const feed = (text: string): void => { for (const w of d.feed(text)) writes.push(w); };
    feed(`[peek] @408c58: ${PLAYER.toString(16).padStart(8, '0')}(0)\n`);
    expect(writes).toEqual(['b=0000 rx=128 ry=128 lx=128 ly=128\n']);         // frame 0's state, before the first tick
    let n = 0;
    for (let i = 0; i < 14; i++) { feed(call(n++, OTHER)); feed(call(n++, PLAYER)); }
    expect(writes).toHaveLength(1);                                           // 14 player ticks: frame 14 still neutral
    const line = call(n++, PLAYER);
    feed(line.slice(0, 20));                                                  // a row split across two reads
    expect(writes).toHaveLength(1);
    feed(line.slice(20));
    expect(writes).toEqual(['b=0000 rx=128 ry=128 lx=128 ly=128\n', 'b=0000 rx=128 ry=128 lx=128 ly=0\n']);
    expect(d.frame).toBe(15);
  });

  it('refuses a scenario whose keyframes wait on a port-side event: the log does not show it', () => {
    expect(() => new PadDriver(scenario('frostfire-box.json'), 'r0001')).toThrow(/prompt|climb/);
  });

  it('is done at the scenario\'s frame budget, and its last write is neutral', () => {
    const s = scenario('synthetic-walk.json');
    const d = new PadDriver(s, 'r0001');
    const writes = [...d.feed(`[peek] @408c58: ${PLAYER.toString(16).padStart(8, '0')}(0)\n`)];
    let text = '';
    for (let i = 0; i < s.stop.orFrames + 5; i++) text += call(i, PLAYER);
    writes.push(...d.feed(text));
    expect(d.done).toBe(true);
    expect(writes[writes.length - 1]).toBe('b=0000 rx=128 ry=128 lx=128 ly=128\n');
  });
});

/**
 * review-ph-run (FAIL, medium): the driver on Windows. The runtime's sampler holds the pad file open every 2 ms, so a
 * rename over it can fail EPERM; the driver retries, and its last write is always neutral, whatever stopped it.
 */
describe('review-ph-run: the pad file under the runtime\'s sampler', () => {
  const busy = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

  it('(1) retries a rename refused EPERM / EACCES / EBUSY, and fails loudly past ~200 ms', () => {
    let fails = 3;
    const calls: string[] = [];
    writePad('pad.txt', 'b=0000 rx=128 ry=128 lx=128 ly=0\n', {
      write: () => undefined,
      rename: () => { calls.push('rename'); if (fails-- > 0) throw busy(['EPERM', 'EACCES', 'EBUSY'][fails % 3]!); },
      sleep: () => undefined,
    });
    expect(calls).toHaveLength(4);
    expect(() => writePad('pad.txt', 'x\n', { write: () => undefined, rename: () => { throw busy('EPERM'); }, sleep: () => undefined, now: (() => { let t = 0; return () => (t += 50); })() }))
      .toThrow(/pad file/);
    expect(() => writePad('pad.txt', 'x\n', { write: () => undefined, rename: () => { throw busy('EIO'); }, sleep: () => undefined })).toThrow(/EIO/);
  });

  it('(1) the neutral write happens whatever stops the run; a timeout exits 1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'phrun-'));
    try {
      const log = join(dir, 'run.log'), pad = join(dir, 'pad.txt');
      writeFileSync(log, `[peek] @408c58: ${PLAYER.toString(16).padStart(8, '0')}(0)\n${call(0, PLAYER)}`);
      const lines: string[] = [];
      let n = 0;
      const io = { write: (_p: string, l: string) => { if (++n === 2) throw busy('EIO'); lines.push(l); }, rename: () => undefined, sleep: () => undefined };
      await expect(main(['--log', log, '--pad', pad, '--scenario', resolve(SCENARIOS, 'synthetic-walk.json'), '--timeout', '0.2'], io)).rejects.toThrow(/EIO/);
      expect(lines[lines.length - 1]).toBe('b=0000 rx=128 ry=128 lx=128 ly=128\n');
      const quiet: string[] = [];
      const code = await main(['--log', log, '--pad', pad, '--scenario', resolve(SCENARIOS, 'synthetic-walk.json'), '--timeout', '0.2'],
        { write: (_p: string, l: string) => { quiet.push(l); }, rename: () => undefined, sleep: () => undefined });
      expect(code).toBe(1);                                                    // 1 player tick of 45: the timeout
      expect(quiet[quiet.length - 1]).toBe('b=0000 rx=128 ry=128 lx=128 ly=128\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('(2) lines from one read are held apart (~5 ms), so a one-frame press is not overwritten unseen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'phrun-'));
    try {
      const log = join(dir, 'run.log'), pad = join(dir, 'pad.txt');
      let text = `[peek] @408c58: ${PLAYER.toString(16).padStart(8, '0')}(0)\n`;
      for (let i = 0; i < 50; i++) text += call(i, PLAYER);
      writeFileSync(log, text);
      const slept: number[] = [];
      await main(['--log', log, '--pad', pad, '--scenario', resolve(SCENARIOS, 'synthetic-walk.json'), '--timeout', '2'],
        { write: () => undefined, rename: () => undefined, sleep: (ms: number) => { slept.push(ms); } });
      expect(slept.filter((ms) => ms >= 5).length).toBeGreaterThanOrEqual(2);  // frame 15's line and the final neutral, each held
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('(5) refuses an unknown revision as a scenario refusal', () => {
    expect(() => new PadDriver({ ...scenario('synthetic-walk.json'), revision: 'r0009' }, 'r0009' as never)).toThrow(ScenarioRefusal);
  });

  it('(4) ph1-holds is frame-numbered: the driver takes it', () => {
    const s = scenario('ph1-holds.json');
    expect(() => new PadDriver(s, 'r0001')).not.toThrow();
    expect(s.stop.orFrames).toBeGreaterThanOrEqual(1798);                    // 60 s at 29.97 Hz
  });
});
