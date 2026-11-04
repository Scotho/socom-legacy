/**
 * H337's capture instrument (`../parity/h337PinePoll.ts`; product track, an adaptation): the PINE wire as the desktop's
 * client speaks it (`desktop@be557831:tools_py/parity/pine.py:29-35`, `:92-101`), the read-only rule, the host and
 * output refusals, and `summarise` on synthetic traces -- an orbit, a still eye at the prediction, a still eye elsewhere,
 * an orbit sampled too slowly to see. Nothing here talks to PCSX2.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CAMERA_HOLDER, decodeBatch, DESKTOP_DEFAULT_ROOT, encodeBatch, f32, fieldAddrs, gitWorkTreeOf, hostRefusal, insideOutDir, outPathAbs, outRefusal, parseArgs,
  pitchOf, PINE_READ32, PINE_READ64, POINTER_ADDRS, read64Plan, replyLength, summarise, toLine, type PollLine, type Quat, type V3,
} from '../parity/h337PinePoll';

const REPO = resolve(import.meta.dirname, '..', '..', '..');
/** A scratch folder outside every git work tree: a fake work tree (a `.git` file) and a plain folder beside it. */
const SCRATCH = mkdtempSync(join(tmpdir(), 'h337-poll-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const word = (x: number): number => { const b = Buffer.alloc(4); b.writeFloatLE(x, 0); return b.readUInt32LE(0); };

describe('the PINE wire (desktop pine.py)', () => {
  it('a read32 is the u32 length counting itself (9), opcode 2, the address, little-endian', () => {
    expect([...encodeBatch([{ op: PINE_READ32, addr: 0x415ff0 }])]).toEqual([9, 0, 0, 0, 2, 0xf0, 0x5f, 0x41, 0]);
  });

  it('a batch carries its commands back to back behind one length word', () => {
    const b = encodeBatch([{ op: PINE_READ32, addr: 0x408c58 }, { op: PINE_READ64, addr: 0x100000 }]);
    expect(b.length).toBe(14);
    expect(b.readUInt32LE(0)).toBe(14);
    expect([b[4], b.readUInt32LE(5), b[9], b.readUInt32LE(10)]).toEqual([2, 0x408c58, 3, 0x100000]);
  });

  it('refuses every opcode that is not a read: the writes 4-7, and the save and load state (9, 0xA)', () => {
    for (const op of [4, 5, 6, 7, 9, 0xa, 8, 0xb, 0xf]) expect(() => encodeBatch([{ op, addr: 0x100000 }])).toThrow(/not a read/);
    expect(() => encodeBatch([])).toThrow(/empty/);
    expect(() => encodeBatch([{ op: PINE_READ32, addr: -1 }])).toThrow(/out of range/);
  });

  it('decodes a reply: the length word, result 0, each value in order (4 bytes a read32, 8 a read64)', () => {
    const reads = [{ op: PINE_READ32, addr: 0 }, { op: PINE_READ64, addr: 8 }];
    const reply = Buffer.alloc(17);
    reply.writeUInt32LE(17, 0); reply.writeUInt8(0, 4); reply.writeUInt32LE(0xdeadbeef, 5); reply.writeBigUInt64LE(0x0102030405060708n, 9);
    expect(replyLength(reply)).toBe(17);
    expect(replyLength(reply.subarray(0, 3))).toBeNull();
    expect(decodeBatch(reply, reads)).toEqual([0xdeadbeef, 0x0102030405060708n]);
  });

  it('refuses a failed reply and one of the wrong length', () => {
    const reads = [{ op: PINE_READ32, addr: 0 }];
    const failed = Buffer.from([5, 0, 0, 0, 0xff]);
    expect(() => decodeBatch(failed, reads)).toThrow(/failed/);
    const short = Buffer.from([7, 0, 0, 0, 0, 1, 2]);
    expect(() => decodeBatch(short, reads)).toThrow(/for 9/);
  });

  it('reads the camera holder first, then the fields off the two pointers it found', () => {
    expect(POINTER_ADDRS[0]).toBe(CAMERA_HOLDER);
    const f = fieldAddrs(0x1000000, 0x1200000);
    expect(f.slice(0, 3)).toEqual([0x100002c, 0x1000030, 0x1000034]);          // cam+0x2c, the eye
    expect(f[3]).toBe(0x1000038);                                               // cam+0x38, the target
    expect(f[6]).toBe(0x10000d8);                                               // cam+0xd8, the placed eye
    expect(f[9]).toBe(0x10000b4);                                               // cam+0xb4, the render camera
    expect(f[10]).toBe(0x120001c);                                              // actor+0x1c, the feet
    expect(f[13]).toBe(0x1201070);                                              // actor+0x1070, the look
    expect(f).toHaveLength(17);
  });

  it('asks only READ64, as the desktop batches (pine.py:92-113): each word read through its 8-aligned double word', () => {
    const ptr = read64Plan(POINTER_ADDRS);
    expect(ptr.reads).toEqual(POINTER_ADDRS.map((addr) => ({ op: PINE_READ64, addr })));
    expect(ptr.words([0x1111111100415000n, 0x2222222200408000n, 0x3333333300488000n, 0x44444444000000aan])).toEqual([0x415000, 0x408000, 0x488000, 0xaa]);
    const plan = read64Plan(fieldAddrs(0x1000000, 0x1200000));
    expect(plan.reads.every((r) => r.op === PINE_READ64 && r.addr % 8 === 0)).toBe(true);
    expect(new Set(plan.reads.map((r) => r.addr)).size).toBe(plan.reads.length);
    // cam+0x2c is the high half of cam+0x28; cam+0x30 and cam+0x34 share one read.
    expect(plan.reads.slice(0, 2).map((r) => r.addr)).toEqual([0x1000028, 0x1000030]);
    const values = plan.reads.map((r) => (BigInt(r.addr + 4) << 32n) | BigInt(r.addr));
    expect(plan.words(values)).toEqual(fieldAddrs(0x1000000, 0x1200000));
    expect(() => read64Plan([0x1000002])).toThrow(/aligned/);
    expect(() => plan.words(values.slice(1))).toThrow(/reads/);
  });

  it('turns the words into a line: floats, and the look pitch from its quaternion (the dump\'s -0.0799 is -9.17)', () => {
    const fields = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(word);
    const line = toLine(0.5, [0x1000000, 0x1200000, 0x1300000, 77], [...fields, 0x1300000, ...[10, 11, 12].map(word), ...[-0.0799, 0, 0, 0.9968].map(word)]);
    expect(line.eye).toEqual([1, 2, 3]);
    expect(line.target).toEqual([4, 5, 6]);
    expect(line.eyeSmoothed).toEqual([7, 8, 9]);
    expect(line.feet).toEqual([10, 11, 12]);
    expect([line.cam, line.actor, line.renderCam, line.camB4, line.clockWord]).toEqual([0x1000000, 0x1200000, 0x1300000, 0x1300000, 77]);
    expect(pitchOf(line.look)).toBeCloseTo(-9.17, 1);
    expect(f32(word(-45.5))).toBe(-45.5);
  });
});

describe('the refusals', () => {
  it('talks to 127.0.0.1 only', () => {
    expect(hostRefusal('127.0.0.1')).toBeNull();
    for (const host of ['localhost', '::1', '0.0.0.0', '203.0.113.5', '127.0.0.2', 'pcsx2.example', '']) expect(hostRefusal(host)).toMatch(/refused/);
  });

  it('writes the trace outside the repository and outside the desktop\'s tree only', () => {
    expect(outRefusal(resolve(REPO, 'socomlegacy/logs/h337.ndjson'), REPO, null)).toMatch(/inside the repository/);
    expect(outRefusal(resolve(REPO, 'h337.ndjson'), REPO, null)).toMatch(/inside the repository/);
    expect(outRefusal(join(SCRATCH, 'plain', 'h337.ndjson'), REPO, null)).toBeNull();
    expect(outRefusal(join(SCRATCH, 'pc', 'logs', 'h337.ndjson'), REPO, join(SCRATCH, 'pc'))).toMatch(/SOCOM_PC_ROOT/);
  });

  it('refuses any git work tree: a folder with a .git above the path (the canonical clone, another worktree)', () => {
    const tree = join(SCRATCH, 'other-tree');
    mkdirSync(join(tree, 'deep'), { recursive: true });
    writeFileSync(join(tree, '.git'), 'gitdir: elsewhere\n');                     // a linked worktree's .git is a file
    expect(gitWorkTreeOf(join(tree, 'deep', 'h337.ndjson'))).toBe(resolve(tree));
    expect(outRefusal(join(tree, 'deep', 'h337.ndjson'), REPO, null)).toMatch(/git work tree/);
    mkdirSync(join(SCRATCH, 'clone', '.git'), { recursive: true });                // a clone's .git is a folder
    expect(outRefusal(join(SCRATCH, 'clone', 'logs', 'h337.ndjson'), REPO, null)).toMatch(/git work tree/);
    expect(gitWorkTreeOf(join(SCRATCH, 'plain', 'h337.ndjson'))).toBeNull();
  });

  it("refuses the desktop's tree at its default path, with SOCOM_PC_ROOT unset", () => {
    expect(DESKTOP_DEFAULT_ROOT).toBe('C:/Projects/socom_pc');
    expect(outRefusal('C:/Projects/socom_pc/logs/parity/h337.ndjson', REPO, null)).toMatch(/desktop/);
    expect(outRefusal('c:/projects/SOCOM_PC/h337.ndjson', REPO, null)).toMatch(/desktop/);
  });

  it('a drive-letter path is a Windows path on every host (B151: on POSIX it resolved under the cwd, inside the repository)', () => {
    expect(outPathAbs('C:/Projects/socom_pc/logs/h337.ndjson')).toBe('C:\\Projects\\socom_pc\\logs\\h337.ndjson');
    expect(outPathAbs('d:\\h337\\stageA.ndjson')).toBe('d:\\h337\\stageA.ndjson');
    expect(insideOutDir('C:/Projects/socom_pc', 'c:\\projects\\SOCOM_PC\\x')).toBe(true);
    expect(insideOutDir('C:/Projects/socom_pc', 'C:\\Projects\\socom_pc2\\x')).toBe(false);
    // the repository refusal never answers for a drive-letter desktop path, whatever the repository's shape
    expect(outRefusal('C:/Projects/socom_pc/logs/parity/h337.ndjson', REPO, null)).not.toMatch(/inside the repository/);
  });

  it('the command line: --out required, outside the repository; --host only 127.0.0.1; the defaults 60 s on port 28011', () => {
    const away = join(SCRATCH, 'plain', 'never-written.ndjson');
    expect(parseArgs(['--out', away], null)).toEqual({ seconds: 60, out: away, port: 28011, host: '127.0.0.1', expect: null, stand: null });
    expect(parseArgs(['--out', away, '--seconds', '5', '--port', '28012', '--expect', '1,2,3', '--stand', '4,5,6'], null))
      .toEqual({ seconds: 5, out: away, port: 28012, host: '127.0.0.1', expect: [1, 2, 3], stand: [4, 5, 6] });
    expect(parseArgs(['--out', away, '--stand', '4,5'], null)).toMatch(/three numbers/);
    expect(parseArgs([], null)).toMatch(/usage/);
    expect(parseArgs(['--out', away, '--host', 'localhost'], null)).toMatch(/refused/);
    expect(parseArgs(['--out', away, '--host', '198.51.100.20'], null)).toMatch(/refused/);
    expect(parseArgs(['--out', resolve(REPO, 'socomlegacy', 'h337.ndjson')], null)).toMatch(/inside the repository/);
    expect(parseArgs(['--out', resolve(REPO, 'README.md')], null)).toMatch(/refused/);
    expect(parseArgs(['--out', away, '--seconds', '0'], null)).toMatch(/seconds/);
    expect(parseArgs(['--out', away, '--expect', '1,2'], null)).toMatch(/three numbers/);
  });
});

/**
 * A synthetic trace: `n` samples at `rate` a second (~670, the desktop's PINE rate, by default), the game's frame 30 a
 * second; the clock word steps once a frame.
 */
function trace(n: number, eyeAt: (frame: number) => V3, opts: { feet?: V3; pitch?: number; walk?: number; rate?: number } = {}): PollLine[] {
  const feet = opts.feet ?? [966, -134.35, 727];
  const half = (((opts.pitch ?? -70) * Math.PI) / 180) / 2;
  const look: Quat = [Math.sin(half), 0, 0, Math.cos(half)];
  return Array.from({ length: n }, (_, i) => {
    const t = i / (opts.rate ?? 670), frame = Math.floor(t * 30);
    const walking = opts.walk !== undefined && i < opts.walk;
    const at: V3 = walking ? [feet[0] - (opts.walk! - i) * 0.1, feet[1], feet[2]] : feet;
    const eye = walking ? ([at[0] - 5, at[1] + 35, at[2]] as V3) : eyeAt(frame);
    return { t, eye, target: [at[0], at[1] + 21.48, at[2]], eyeSmoothed: eye, feet: at, look, clockWord: frame, cam: 0x1000000, actor: 0x1200000, renderCam: 0, camB4: 0 };
  });
}

const STILL: V3 = [960.51, -98.92, 727];
const ORBIT: [V3, V3] = [[961.83, -98.92, 727], [967.12, -98.92, 727]];

describe('summarise: what the trace says (research 201 section 14)', () => {
  it("an eye alternating between two positions frame by frame, the body still: the orbit, 'lastOutput'", () => {
    const s = summarise(trace(2000, (f) => ORBIT[f % 2]!, { walk: 300 }), STILL);
    expect(s.shape).toBe('orbit');
    expect(s.reading).toBe('lastOutput');
    expect(s.window).toBe(1700);
    expect(s.eye!.clusters.map((c) => c.mean[0]).sort((a, b) => a - b)).toEqual([961.83, 967.12].map((x) => expect.closeTo(x, 3)));
    expect(s.eye!.spread.x).toBeCloseTo(5.29, 2);
    expect(s.eye!.spread.z).toBeCloseTo(0, 6);
    expect(s.feetMean).toEqual([966, -134.35, 727].map((x) => expect.closeTo(x, 6)));
    expect(s.pitchMean).toBeCloseTo(-70, 6);
    expect(s.samplesPerTick).toBeGreaterThan(20);
  });

  it("a still eye at the port's 'target' prediction: 'target'", () => {
    const s = summarise(trace(1500, () => [STILL[0] + 0.001, STILL[1], STILL[2]]), STILL);
    expect(s.shape).toBe('still');
    expect(s.atPrediction).toBe(true);
    expect(s.reading).toBe('target');
    expect(s.eye!.clusters).toHaveLength(1);
  });

  it('a still eye anywhere else: still, not at target -- not yet a new candidate (the causes: summarise)', () => {
    const s = summarise(trace(1500, () => [963.2, -98.92, 727]), STILL);
    expect(s.shape).toBe('still');
    expect(s.atPrediction).toBe(false);
    expect(s.reading).toBe('still, not at target');
  });

  it("an orbit sampled once per two game ticks looks still: undersampled, never 'still'", () => {
    // 15 samples a second against 30 frames: every sample lands on an even frame, so the orbit shows one eye. The clock
    // word steps between every two samples, so the trace sees one sample a tick (it cannot see the ticks it skipped).
    const s = summarise(trace(300, (f) => ORBIT[f % 2]!, { rate: 15 }), ORBIT[0]);
    expect(s.samplesPerTick).toBe(1);
    expect(s.shape).toBe('undersampled');
    expect(s.atPrediction).toBeNull();
    expect(s.reading).toBe('undecided');
    // 1.5 a tick is still under 2: refused too.
    expect(summarise(trace(900, () => STILL, { rate: 45 }), STILL).shape).toBe('undersampled');
  });

  it('with the stand given, the tolerance grows by the feet\'s offset from it (a hand-walked stand is off by tenths)', () => {
    const off: V3 = [966.3, -134.35, 727.2];                                         // the feet 0.36 from the stand
    const eye: V3 = [STILL[0] + 0.3, STILL[1], STILL[2] + 0.1];                      // the eye 0.32 from the prediction
    const s = summarise(trace(1500, () => eye, { feet: off }), STILL, 0.05, [966, -134.35, 727]);
    expect(s.tolerance).toBeCloseTo(0.05 + Math.hypot(0.3, 0.2), 6);
    expect(s.reading).toBe('target');
    expect(summarise(trace(1500, () => eye, { feet: off }), STILL).reading).toBe('still, not at target');
    expect(summarise(trace(1500, () => eye, { feet: off }), STILL).tolerance).toBe(0.05);
  });

  it('a still eye with no prediction given is undecided; an empty trace is empty; a wandering eye is moving', () => {
    expect(summarise(trace(800, () => STILL)).reading).toBe('undecided');
    expect(summarise([]).shape).toBe('empty');
    const wander = summarise(trace(1500, (f) => [960 + f * 0.3, -98.92, 727]), STILL);
    expect(wander.shape).toBe('moving');
    expect(wander.reading).toBe('undecided');
  });

  it('a torn sample between two frames is a transient, not a position', () => {
    const lines = trace(1500, () => STILL);
    lines[700] = { ...lines[700]!, eye: [970, -98.92, 727] };
    const s = summarise(lines, STILL);
    expect(s.shape).toBe('still');
    expect(s.eye!.transients).toBe(1);
    expect(s.reading).toBe('target');
  });

  it('a change of pitch ends the held window: only the last pitch is judged', () => {
    const before = trace(600, () => ORBIT[0], { pitch: -45 });
    const after = trace(900, () => STILL).map((l) => ({ ...l, t: l.t + 1 }));
    const s = summarise([...before, ...after], STILL);
    expect(s.window).toBe(900);
    expect(s.reading).toBe('target');
  });
});
