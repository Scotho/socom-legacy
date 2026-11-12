import { describe, expect, it } from 'vitest';
import { PROBE_SETTLE_MS, parseProbeArgs, probeRun, serialPine, type ProbeDeps, type ProbePine } from '../eph/probe';
import { GUEST_ADDRESSES, ORIGIN_EVIDENCE } from '../eph/sampler';
import { RAISE_ADDRESSES, RAISE_EVIDENCE, RAISE_INFERRED } from '../eph/raise';
import { PCSX2_VK } from '../eph/keys';
import type { HostPlan } from '../eph/run';

/**
 * The PCSX2-only press probe (6d, before the cancel reruns): PCSX2 alone from a save state, each case's script played on
 * the guest clock through the key path (one batch a moment), every guest frame sampled with the pad probe and the extra
 * words, the state reloaded before each case and trial. Product track: an instrument, never in a build. Driven here by
 * fakes: nothing is started.
 */
const bits = (f: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, f, true); return b.getUint32(0, true); };

function fakes(build: 'r0001' | 'r0004' = 'r0004') {
  const h = { loads: [] as number[], saves: [] as number[], batches: [] as string[], files: new Map<string, string>(), kills: 0, steps: [] as string[] };
  let clock = 10;   // guest seconds
  let reads = 0;
  let loadIn = 0;
  const col = GUEST_ADDRESSES[build];
  const other = GUEST_ADDRESSES[build === 'r0001' ? 'r0004' : 'r0001'];
  const pine: ProbePine = {
    async read32(a: number): Promise<number> {
      await Promise.resolve();
      if (a === col.guestClock) {
        // The load lands a few reads after PINE answers it (the live probe, 2026-11-01: the clock read just after the
        // load was still the old one), and takes the clock back to the state's.
        if (loadIn > 0 && --loadIn === 0) clock = 10;
        if (++reads % 5 === 0) clock += 1 / 60;
        return bits(clock);
      }
      if (a === other.guestClock) return 0;
      if (a === col.playerActor) return 0x01a00000;
      return 0;
    },
    async read8(): Promise<number> { return 0; },
    async version(): Promise<string> { return 'PCSX2 fake'; },
    async saveState(slot: number): Promise<void> { h.saves.push(slot); },
    async loadState(slot: number): Promise<void> { h.loads.push(slot); loadIn = 400; },
    close(): void { h.steps.push('close pine'); },
  };
  const deps: ProbeDeps = {
    log: () => undefined,
    prepareHost: () => { h.steps.push('prepare'); },
    spawnPcsx2: (argv) => { h.steps.push(`pcsx2 ${argv.slice(1).join(' ')}`); return { pid: 42, exitCode: null, on: () => undefined, once: () => undefined }; },
    killTree: () => { h.kills++; },
    findWindow: async () => 77,
    placeWindow: async () => undefined,
    topmostWindow: async () => undefined,
    closeWindows: () => undefined,
    injector: () => ({ down: () => undefined, up: () => undefined, close: () => undefined, batch: async (acts) => { h.batches.push(acts.map((a) => `${a.action} ${a.vk}`).join(',')); } }),
    connectPine: async () => pine,
    shot: async (out) => { h.steps.push(`shot ${out}`); },
    writeFile: (path, text) => { h.files.set(path.slice(path.lastIndexOf('/') + 1), text); },
    readText: (path) => (path.endsWith('a.txt') ? '0 triangle 1\n150 triangle 0\n' : '0 square 1\n100 square 0\n'),
    sleep: async () => { await Promise.resolve(); },
    now: () => 0,
  };
  return { h, deps };
}

/**
 * A guest for the --yaw-turns loop: the local body (RAISE_ADDRESSES r0004 localBody) faces `yaw` degrees, its quaternion
 * at body+0x50 (qy = sin yaw/2, qw = cos yaw/2) as raise.ts reads it; the right stick's left half raises it `rate`
 * degrees a guest frame, its right half lowers it. Once the raise rows start, the guest clock steps once a row, on the
 * first clock read after the row's freeze byte, after answering it: the cases run on --wall-clock (whose wall clock is
 * the guest's here), so the sampler is a case's only clock reader, that read is the row's closing one, and every raise
 * row is untorn. `throwOn`
 * makes the injector throw on one key action (the timeline failing mid-case); after the PINE close every read is
 * counted and refused, and the wall clock jumps far ahead (so a loop left running ends instead of spinning).
 */
function turnFakes(rate: number, throwOn: string | null = null) {
  const h = { seq: [] as string[], logs: [] as string[], afterClose: 0 };
  const col = GUEST_ADDRESSES.r0004, other = GUEST_ADDRESSES.r0001, ra = RAISE_ADDRESSES.r0004;
  const BODY = 0x01b00000;
  let clock = 10, reads = 0, loadIn = 0, yaw = 180, held = 0, rowMode = false, tickNext = false, closed = false;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const pine: ProbePine = {
    async read32(a: number): Promise<number> {
      await Promise.resolve();
      if (closed) { h.afterClose++; throw new Error('PINE closed'); }
      if (a === col.guestClock) {
        if (loadIn > 0 && --loadIn === 0) { clock = 10; yaw = 180; }
        const v = bits(clock);
        if (!rowMode) { if (++reads % 5 === 0) clock += 1 / 60; }
        else if (tickNext) { tickNext = false; clock += 1 / 60; yaw += held * rate; }
        return v;
      }
      if (a === other.guestClock) return 0;
      if (a === col.playerActor) return 0x01a00000;
      if (a === ra.localBody) return BODY;
      if (a === BODY + 0x54) return bits(Math.sin(rad(yaw / 2)));
      if (a === BODY + 0x5c) return bits(Math.cos(rad(yaw / 2)));
      return 0;
    },
    async read8(a: number): Promise<number> {
      await Promise.resolve();
      if (closed) { h.afterClose++; throw new Error('PINE closed'); }
      if (a === ra.freeze10e) { rowMode = true; tickNext = true; }
      return 0;
    },
    async version(): Promise<string> { return 'PCSX2 fake'; },
    async saveState(): Promise<void> { /* none */ },
    async loadState(): Promise<void> { loadIn = 400; },
    close(): void { closed = true; h.seq.push('close pine'); },
  };
  const deps: ProbeDeps = {
    log: (s) => { h.logs.push(s); },
    prepareHost: () => undefined,
    spawnPcsx2: () => ({ pid: 42, exitCode: null, on: () => undefined, once: () => undefined }),
    killTree: () => undefined,
    findWindow: async () => 77,
    placeWindow: async () => undefined,
    topmostWindow: async () => undefined,
    closeWindows: () => undefined,
    injector: () => ({
      down: () => undefined, up: () => undefined,
      close: () => { h.seq.push('close injector'); },
      batch: async (acts) => {
        for (const x of acts) {
          const s = `${x.action} ${x.vk}`;
          if (s === throwOn) throw new Error(`the key path failed on ${s}`);
          h.seq.push(s);
          if (x.vk === PCSX2_VK.rleft) held = x.action === 'down' ? 1 : 0;
          if (x.vk === PCSX2_VK.rright) held = x.action === 'down' ? -1 : 0;
        }
      },
    }),
    connectPine: async () => pine,
    shot: async () => undefined,
    writeFile: () => undefined,
    readText: () => '0 triangle 1\n150 triangle 0\n',
    sleep: async () => { await Promise.resolve(); },
    now: () => (closed ? 1e12 : clock * 1000),
  };
  return { h, deps, yaw: (): number => yaw };
}

const turnArgs = (turns: string): string[] => ['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--tail-ms', '100', '--wall-clock', '--raise', '--raise-records', '1', '--yaw-turns', turns];
const stick = (seq: readonly string[]): string[] => seq.filter((s) => s.endsWith(` ${PCSX2_VK.rleft}`) || s.endsWith(` ${PCSX2_VK.rright}`));

const host = (): HostPlan => ({ layout: { exe: 'E:/eph-runs/pcsx2/pcsx2-qt.exe', pcsx2Dir: 'E:/eph-runs/pcsx2' }, iso: 'E:/iso/s2.iso' }) as unknown as HostPlan;

describe('parseProbeArgs', () => {
  it('takes the build, the slot, the trials, the cases, the out dir, and optional shots and save-after', () => {
    expect(parseProbeArgs(['--build', 'r0004', '--state', '5', '--trials', '3', '--script', 'a.txt', '--script', 'b.txt', '--out', 'E:/p'])).toEqual({
      build: 'r0004', state: 5, trials: 3, scripts: ['a.txt', 'b.txt'], out: 'E:/p', tailMs: 2500, shots: false, saveAfter: null, wallClock: false, origin: false, raise: false, raiseRecords: 8, yawTurns: [],
    });
    expect(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--raise'])).toMatchObject({ raise: true, origin: false });
    expect(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--raise', '--raise-records', '3'])).toMatchObject({ raise: true, raiseRecords: 3 });
    expect(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--raise', '--yaw-turns', '1000:+70:3,10750:0'])).toMatchObject({ yawTurns: [{ t: 1000, rel: 70, tol: 3 }, { t: 10750, rel: 0, tol: 2 }] });
    expect(() => parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--yaw-turns', '1000:70'])).toThrow(/needs --raise/);
    expect(() => parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--raise', '--raise-records', '9'])).toThrow(/--raise-records/);
    expect(() => parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--raise', '--raise-records', '0'])).toThrow(/--raise-records/);
    expect(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--origin'])).toMatchObject({ origin: true });
    expect(parseProbeArgs(['--build', 'r0001', '--state', '8', '--script', 'a.txt', '--out', 'E:/p', '--shots', '--save-after', '6'])).toMatchObject({ shots: true, saveAfter: 6, trials: 1 });
    expect(() => parseProbeArgs(['--build', 'r0004', '--script', 'a.txt', '--out', 'E:/p'])).toThrow(/--state/);
  });
});

describe('probeRun over fakes', () => {
  it('reloads the state before every case and trial, plays each moment as one batch, samples, writes probe.csv, stops PCSX2', async () => {
    const { h, deps } = fakes();
    await probeRun(parseProbeArgs(['--build', 'r0004', '--state', '5', '--trials', '2', '--script', 'a.txt', '--script', 'b.txt', '--out', 'E:/p', '--tail-ms', '200']), host(), deps);
    expect(h.steps[0]).toBe('prepare');
    expect(h.steps[1]).toMatch(/-state 5/);
    expect(h.loads).toEqual([5, 5, 5, 5]);
    expect(h.batches).toEqual([
      `down ${PCSX2_VK.triangle}`, `up ${PCSX2_VK.triangle}`, `down ${PCSX2_VK.square}`, `up ${PCSX2_VK.square}`,
      `down ${PCSX2_VK.triangle}`, `up ${PCSX2_VK.triangle}`, `down ${PCSX2_VK.square}`, `up ${PCSX2_VK.square}`,
    ]);
    const csv = h.files.get('probe.csv')!.split('\n');
    const head = csv[0]!.split(',');
    for (const k of ['trial', 'case', 'ms', 'triPeak', 'padButtons', 'stanceRequest', 'posture', 'actionId', 'velX']) expect(head, k).toContain(k);
    expect(csv.filter((l) => l.includes(',a,')).length).toBeGreaterThan(0);
    // A case starts after its load has landed (the clock went back), never on the old clock: no row before the start.
    const msCol = head.indexOf('ms');
    for (const l of csv.slice(1).filter(Boolean)) expect(Number(l.split(',')[msCol])).toBeGreaterThanOrEqual(0);
    const meta = JSON.parse(h.files.get('probe.json')!);
    expect(meta).toMatchObject({ build: 'r0004', detected: 'r0004', slot: 5, trials: 2, cases: ['a', 'b'], settleMs: PROBE_SETTLE_MS });
    expect(h.kills).toBe(1);
    expect(h.saves).toEqual([]);
  });

  it("--origin records the origin columns' addresses, evidence, inferred list (none inferred) and overflow count in probe.json", async () => {
    const { h, deps } = fakes();
    await probeRun(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--tail-ms', '100', '--origin']), host(), deps);
    const meta = JSON.parse(h.files.get('probe.json')!);
    expect(meta.origin.evidence).toEqual(ORIGIN_EVIDENCE.r0004);
    expect(meta.origin.inferred).toEqual([]);
    expect(meta.origin.originBeyondCap).toBe(0);
    expect(typeof meta.origin.readErrors).toBe('number');
  });

  it("--raise records the raise columns' addresses, evidence, inferred list, overflow count and the once-read idle words in probe.json", async () => {
    const { h, deps } = fakes();
    await probeRun(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--tail-ms', '200', '--raise']), host(), deps);
    const meta = JSON.parse(h.files.get('probe.json')!);
    expect(meta.origin).toBeNull();
    expect(meta.raise.addresses).toEqual(RAISE_ADDRESSES.r0004);
    expect(meta.raise.evidence).toEqual(RAISE_EVIDENCE.r0004);
    expect(meta.raise.inferred).toEqual(RAISE_INFERRED.r0004);
    expect(meta.raise.raiseBeyondCap).toBe(0);
    expect(meta.raise.recordsMax).toBe(8);
    const { h: h3, deps: d3 } = fakes();
    await probeRun(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--tail-ms', '100', '--raise', '--raise-records', '3']), host(), d3);
    expect(JSON.parse(h3.files.get('probe.json')!).raise.recordsMax).toBe(3);
    expect(meta.raise.idleConfig).toBeNull();   // the fake has no body: never read
    expect(typeof meta.raise.readErrors).toBe('number');
    expect(typeof meta.raise.torn).toBe('number');
    const head = h.files.get('probe.csv')!.split('\n')[0]!.split(',');
    for (const k of ['raiseState', 'raiseCount', 'rec7Marked', 'raiseStale']) expect(head, k).toContain(k);
  });

  it('without --raise, probe.json has raise null and the CSV no raise column', async () => {
    const { h, deps } = fakes();
    await probeRun(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p', '--tail-ms', '200']), host(), deps);
    expect(JSON.parse(h.files.get('probe.json')!).raise).toBeNull();
    const head = h.files.get('probe.csv')!.split('\n')[0]!;
    expect(head).toMatch(/stanceRequest/);
    expect(head).not.toMatch(/raiseState/);
  });

  it('refuses a guest of the other build, sampling nothing, PCSX2 stopped', async () => {
    const { h, deps } = fakes('r0001');
    await expect(probeRun(parseProbeArgs(['--build', 'r0004', '--state', '5', '--script', 'a.txt', '--out', 'E:/p']), host(), deps)).rejects.toThrow(/runs r0001/);
    expect(h.loads).toEqual([]);
    expect(h.kills).toBe(1);
  });

  it('--save-after N saves the state once the cases are played; --shots takes a frame after each case', async () => {
    const { h, deps } = fakes('r0001');
    await probeRun(parseProbeArgs(['--build', 'r0001', '--state', '8', '--script', 'a.txt', '--out', 'E:/p', '--shots', '--save-after', '6', '--tail-ms', '100']), host(), deps);
    expect(h.saves).toEqual([6]);
    expect(h.steps.filter((s) => s.startsWith('shot '))).toEqual(['shot E:/p/t1-a.png']);
  });

  it('--wall-clock plays a menu case on wall time: the pause menu stops the guest clock (it reads 0 there, 2026-11-01)', async () => {
    const { h, deps } = fakes('r0001');
    let wall = 0;
    const pine = await deps.connectPine(new AbortController().signal);
    const read = pine.read32.bind(pine);
    let paused = false;
    pine.read32 = async (a: number) => (paused && a === GUEST_ADDRESSES.r0001.guestClock ? 0 : read(a));
    const d2: ProbeDeps = {
      ...deps, now: () => wall, sleep: async (ms) => { wall += ms; await Promise.resolve(); },
      connectPine: async () => pine,
      injector: () => ({
        down: () => undefined, up: () => undefined, close: () => undefined,
        batch: async (acts: readonly { action: 'down' | 'up'; vk: number }[]) => {
          h.batches.push(acts.map((x) => `${x.action} ${x.vk}`).join(','));
          if (acts.some((x) => x.action === 'down')) paused = true;
        },
      }),
    };
    await probeRun(parseProbeArgs(['--build', 'r0001', '--state', '8', '--script', 'a.txt', '--out', 'E:/p', '--wall-clock', '--tail-ms', '100']), host(), d2);
    expect(h.batches).toEqual([`down ${PCSX2_VK.triangle}`, `up ${PCSX2_VK.triangle}`]);
  });

  it('--yaw-turns: holds the right stick toward the case start + rel until raiseYaw is within tol, then lets go (one press)', async () => {
    const { h, deps, yaw } = turnFakes(1);
    await probeRun(parseProbeArgs(turnArgs('0:+30:3')), host(), deps);
    expect(stick(h.seq)).toEqual([`down ${PCSX2_VK.rleft}`, `up ${PCSX2_VK.rleft}`]);
    const line = h.logs.find((l) => /yaw turn at 0 ms to/.test(l));
    expect(line).toMatch(/to -150\.0 \(start 180\.0 \+30\).* after 1 press\(es\)/);
    expect(h.logs.some((l) => /gave up/.test(l))).toBe(false);
    // raiseYaw is 2 atan2 (210 here), the target wrapped (-150): within the tolerance through the wrap
    expect(Math.abs(((yaw() - -150 + 540) % 360) - 180)).toBeLessThanOrEqual(3 + 2);
  });

  it('--yaw-turns: a turn the stick cannot make gives up after 6 s and says so, the stick let go, no taps', async () => {
    const { h, deps } = turnFakes(0);
    await probeRun(parseProbeArgs(turnArgs('0:-40:2')), host(), deps);
    expect(stick(h.seq)).toEqual([`down ${PCSX2_VK.rright}`, `up ${PCSX2_VK.rright}`]);
    expect(h.logs.some((l) => /yaw turn to 140\.0 gave up at 180\.0/.test(l))).toBe(true);
    expect(h.logs.find((l) => /yaw turn at 0 ms to/.test(l))).toMatch(/after 1 press\(es\), \d+ ms/);
  });

  it('--yaw-turns: a timeline failing mid-case stops the turn before the injector and PINE close (the key let go first)', async () => {
    const { h, deps } = turnFakes(0, `up ${PCSX2_VK.triangle}`);
    await expect(probeRun(parseProbeArgs(turnArgs('0:+30:3')), host(), deps)).rejects.toThrow(/key path failed/);
    await new Promise((r) => setTimeout(r, 20));
    const closeAt = h.seq.indexOf('close injector');
    expect(closeAt).toBeGreaterThan(0);
    expect(h.seq.slice(closeAt)).toEqual(['close injector', 'close pine']);
    expect(stick(h.seq)).toEqual([`down ${PCSX2_VK.rleft}`, `up ${PCSX2_VK.rleft}`]);
    expect(h.afterClose).toBe(0);
  });

  it('serialPine: one PINE call at a time (PCSX2 answers pipelined requests as one batch reply, the live probe 2026-11-01)', async () => {
    let open = 0, most = 0;
    const slow = async <T>(v: T): Promise<T> => { open++; most = Math.max(most, open); await new Promise((r) => setTimeout(r, 2)); open--; return v; };
    const raw: ProbePine = {
      read32: () => slow(1), read8: () => slow(2), version: () => slow('v'), saveState: () => slow(undefined), loadState: () => slow(undefined), close: () => undefined,
    };
    const p = serialPine(raw);
    const got = await Promise.all([p.read32(0), p.read8(0), p.read32(4), p.loadState(5), p.read8(1)]);
    expect(got).toEqual([1, 2, 1, undefined, 2]);
    expect(most).toBe(1);
  });
});
