import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_CLOSE_MS, HELP, CAPTURE_REGION, CHROMIUM_WINDOW, FIRST_ROWS_TIMEOUT_MS, FFMPEG_QUIT_MS, FORCED_EXIT_CEILING_MS,
  PAGE_READY_TIMEOUT_MS, PAGE_TICK_EXPRESSION, PAGE_WINDOW_TITLE, PCSX2_WINDOW, PINE_CONNECT_TIMEOUT_MS, RUN_COMMAND, RunArgsError, SAVE_STATE_TIMEOUT_MS, chromiumLaunchOptions, slotStateFile, ffmpegArgs, findOnPath, formatBootPlan, formatPlan, installStop, liveBoot, liveRun, pageUrl,
  hostDeps, parseBootSteps, parseRunArgs, pcsx2Argv, planBoot, planRun, startCapture, stopFfmpeg, type ChildLike, type LiveDeps,
  type PageLike, type PineLike, type PlanContext,
} from '../eph/run';
import { RunAborted, RunStopped, sleep as abortableSleep } from '../eph/abort';
import { SCRIPT_CLOCK_STALL_MS } from '../eph/live';
import { PCSX2_VK, PCSX2_WINDOW_TITLE } from '../eph/keys';
import { QUESTION_CSV_NOTE } from '../eph/record';
import { DETECT_GAP_MS, GUEST_ADDRESSES, PCSX_TILT_COLUMNS, TILT_ADDRESSES, type Revision } from '../eph/sampler';
import { PAGE_READY_EXPRESSION } from '../eph/ready';
import { COLUMN_INFERRED, EXTRA_ADDRESSES, STICK_ADDRESSES } from '../eph/sampler';
import { FRAME_MS } from '../eph/pageMap';

/**
 * The run orchestrator's plan and its dry run (EPH-2 step 3). Nothing here starts PCSX2, PowerShell, Chromium or ffmpeg:
 * the plan is pure, built over a fake file system, and the dry run prints it; the live run is driven over fakes of each
 * thing it would start (LiveDeps), on a virtual wall clock.
 */
const INI = [
  '[Folders]', 'MemoryCards = memcards', '',
  '[EmuCore]', 'EnablePINE = true', 'PINESlot = 28011', '',
  '[EmuCore/GS]', 'Renderer = 13', '',
  '[Pad1]', 'Type = DualShock2', 'Triangle = XInput-0/Y', 'Cross = XInput-0/A', '',
  '[Pad2]', 'Type = None', '',
  '[MemoryCards]', 'Slot1_Enable = true', 'Slot1_Filename = Mcd001.ps2', 'Slot2_Enable = true', 'Slot2_Filename = Mcd002.ps2', '',
].join('\r\n');

const SCRIPT = ['# crouched, full Triangle, light Triangle at 0.3 s', '0 triangle 1', '150 triangle 0', '450 triangle 0.2', '500 triangle 0', ''].join('\n');

const LAUNCH = [
  '# Shared step script',
  'next+1.0:CROSS      # loading logo',
  'next+2.0:CROSS      # main menu -> NEW GAME',
  'wait+1.0:DOWN',
  'next+10.0:NONE      # mission',
  '',
].join('\n');

const ctx = (over: Partial<PlanContext> = {}): PlanContext => {
  const files: Record<string, string> = {
    'C:/runs/s.txt': SCRIPT,
    'E:/eph-runs/pcsx2/inis/PCSX2.ini': INI,
    'C:/Projects/socom_pc/tools/pcsx2/inis/PCSX2.ini': INI,
    'C:/Projects/socom_pc/scripts/parity/launch_to_mission.txt': LAUNCH,
  };
  return {
    env: { EPH_RUN_DIR: 'E:/eph-runs', SOCOM_PC_ROOT: 'C:/Projects/socom_pc', SOCOM_ISO: 'D:/disc/socom2.iso' },
    repo: 'C:/Projects/wt-eph-2', clones: ['C:/projects/redotcom'], worktreeParent: 'C:/Projects',
    now: new Date(Date.UTC(2026, 9, 30, 21, 5, 9)),
    exists: (p) => p in files || ['C:/Projects/socom_pc/tools/pcsx2', 'E:/eph-runs/pcsx2', 'D:/disc/socom2.iso'].includes(p),
    readText: (p) => { const t = files[p]; if (t === undefined) throw new Error(`no file ${p}`); return t; },
    ...over,
  };
};

describe('parseRunArgs', () => {
  it('reads the script, the map, the slot, the page base and the switches', () => {
    expect(parseRunArgs(['--script', 'C:/runs/s.txt', '--map', 'M01', '--state', '8', '--dry-run'])).toEqual({
      script: 'C:/runs/s.txt', map: 'M01', state: 8, dryRun: true, bootToMission: false, live: false, chordModifier: 'l2', base: 'http://localhost:5303',
      leadFrames: 3, holdFrames: 6, tailMs: 3000, question: 'run', renderer: null, pageBuild: null, build: 'r0001', spot: null, padLayout: 'standard',
      extra: false, nearRadius: 30, pad: 'stub',
    });
    expect(parseRunArgs(['--boot-to-mission', '--state', '8', '--dry-run'])).toMatchObject({ bootToMission: true, state: 8, script: null });
  });

  it('item 6(b): --extra logs the velocity, the dive velocity and the actors near (--near-radius, default 30)', () => {
    expect(parseRunArgs(['--script', 's', '--map', 'M51', '--extra'])).toMatchObject({ extra: true, nearRadius: 30 });
    expect(parseRunArgs(['--script', 's', '--map', 'M51', '--extra', '--near-radius', '50'])).toMatchObject({ extra: true, nearRadius: 50 });
    expect(HELP).toMatch(/--extra .*velocity/);
  });

  it('item 6(b): a run with --extra writes the extra columns to pcsx2.csv and counts their read errors', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100', '--extra'), ctx()), deps);
    const head = h.files.get('pcsx2.csv')!.split('\n')[0]!.split(',');
    for (const k of ['velX', 'velY', 'velZ', 'diveVelX', 'nearCount', 'near']) expect(head, k).toContain(k);
    expect(recordOf(h)).toMatchObject({ extra: { on: true, nearRadius: 30 } });
  });

  it("reads a stand: --at x,y,z with --yaw d, for the test room's &at=&yaw= (EPH campaign stand)", () => {
    expect(parseRunArgs(['--live', '--map', 'M51', '--at', '939.44,-145.87,857.07', '--yaw', '180']).spot)
      .toEqual({ x: 939.44, y: -145.87, z: 857.07, yaw: 180 });
    expect(() => parseRunArgs(['--live', '--map', 'M51', '--at', '1,2,3'])).toThrow(/--at.*--yaw|--yaw.*--at/);
    expect(() => parseRunArgs(['--live', '--map', 'M51', '--yaw', '90'])).toThrow(/--at.*--yaw|--yaw.*--at/);
    expect(() => parseRunArgs(['--live', '--map', 'M51', '--at', '1,2', '--yaw', '0'])).toThrow(/--at/);
    expect(() => parseRunArgs(['--live', '--map', 'M51', '--at', '1,2,x', '--yaw', '0'])).toThrow(/--at/);
    expect(() => parseRunArgs(['--live', '--map', 'M51', '--at', '1,2,3', '--yaw', 'north'])).toThrow(/--yaw/);
  });

  it('refuses a run with no script, a bad slot and an unknown switch', () => {
    expect(() => parseRunArgs(['--map', 'M01'])).toThrow(RunArgsError);
    expect(() => parseRunArgs(['--script', 's', '--map', 'M01', '--state', 'x'])).toThrow(/--state/);
    expect(() => parseRunArgs(['--script', 's', '--map', 'M01', '--bogus'])).toThrow(/--bogus/);
    expect(() => parseRunArgs(['--boot-to-mission'])).toThrow(/--state/);
  });
});

describe('the launch pieces', () => {
  it('launches PCSX2 as pcsx2_ctl cmd_launch: -batch -nogui -fastboot [-state N] <iso>', () => {
    expect(pcsx2Argv('E:/r/pcsx2/pcsx2-qt.exe', 'D:/disc/socom2.iso', 8)).toEqual(['E:/r/pcsx2/pcsx2-qt.exe', '-batch', '-nogui', '-fastboot', '-state', '8', 'D:\\disc\\socom2.iso']);
    expect(pcsx2Argv('E:/r/pcsx2/pcsx2-qt.exe', 'D:/disc/socom2.iso', null)).toEqual(['E:/r/pcsx2/pcsx2-qt.exe', '-batch', '-nogui', '-fastboot', 'D:\\disc\\socom2.iso']);
  });

  it('hands PCSX2 the boot file in the Windows form: a forward-slash path is refused as missing', () => {
    // 2026-10-31, the first live run: pcsx2-qt's log read "Startup Error: Requested filename 'C:/Projects/.../SOCOM II -
    // U.S. Navy SEALs (USA).iso' does not exist." for an ISO that was there; the same file as 'C:\\Projects\\...' opened
    // ("isoFile open ok", serial SCUS-97275). pcsx2_ctl.py passes a Windows path; the exe keeps its own form.
    expect(pcsx2Argv('E:/r/pcsx2/pcsx2-qt.exe', 'C:/Projects/game/SOCOM II (USA).iso', null).at(-1)).toBe('C:\\Projects\\game\\SOCOM II (USA).iso');
  });

  it('opens the test room in play with devmode and the map', () => {
    expect(pageUrl('http://localhost:5303', 'M01')).toBe('http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M01');
    expect(pageUrl('http://localhost:5303/', 'M 1')).toBe('http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M%201');
  });

  it('appends the stand as &at=x,y,z&yaw=d when given (viewer devSpot.ts readDevSpot)', () => {
    expect(pageUrl('http://localhost:5303', 'M51', { x: 939.44, y: -145.87, z: 857.07, yaw: 180 }))
      .toBe('http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M51&at=939.44,-145.87,857.07&yaw=180');
    expect(pageUrl('http://localhost:5303', 'M51', null)).toBe('http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M51');
  });

  it('places the two windows side by side and grabs the region that holds both', () => {
    expect(PCSX2_WINDOW.x + PCSX2_WINDOW.width).toBeLessThanOrEqual(CHROMIUM_WINDOW.x);
    expect(CAPTURE_REGION).toEqual({ x: 0, y: 0, width: CHROMIUM_WINDOW.x + CHROMIUM_WINDOW.width, height: Math.max(PCSX2_WINDOW.height, CHROMIUM_WINDOW.height) });
    expect(CAPTURE_REGION.width % 2).toBe(0);
    expect(CAPTURE_REGION.height % 2).toBe(0);
    const a = ffmpegArgs('E:/out/side.mp4');
    expect(a.slice(0, 2)).toEqual(['-f', 'gdigrab']);
    expect(a).toContain('desktop');
    expect(a.join(' ')).toContain(`-offset_x 0 -offset_y 0 -video_size ${CAPTURE_REGION.width}x${CAPTURE_REGION.height}`);
    expect(a.at(-1)).toBe('E:/out/side.mp4');
  });
});

describe('planRun and the dry run', () => {
  const args = parseRunArgs(['--script', 'C:/runs/s.txt', '--map', 'M01', '--state', '8', '--dry-run']);

  it('refuses a missing SOCOM_ISO, SOCOM_PC_ROOT or EPH_RUN_DIR with a clear line', () => {
    for (const k of ['SOCOM_ISO', 'SOCOM_PC_ROOT', 'EPH_RUN_DIR']) {
      const c = ctx();
      const env = { ...c.env };
      delete env[k];
      expect(() => planRun(args, { ...c, env }), k).toThrow(new RegExp(k));
    }
  });

  it('plans the copy, the ini, PCSX2, the page, the injector, the capture and the outputs', () => {
    const plan = planRun(args, ctx());
    expect(plan.layout.outDir).toBe('E:/eph-runs/runs/20261030T210509Z');
    expect(plan.copy.copy).toBe(false);
    expect(plan.pcsx2Argv).toEqual(['E:/eph-runs/pcsx2/pcsx2-qt.exe', '-batch', '-nogui', '-fastboot', '-state', '8', 'D:\\disc\\socom2.iso']);
    expect(plan.windowTitle).toBe(PCSX2_WINDOW_TITLE);
    expect(plan.url).toBe('http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M01');
    const stood = planRun(parseRunArgs(['--script', 'C:/runs/s.txt', '--map', 'M51', '--state', '8', '--at', '960,-140.48,696', '--yaw', '270', '--dry-run']), ctx());
    expect(stood.url).toBe('http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M51&at=960,-140.48,696&yaw=270');
    expect(plan.renderer).toBe('Renderer = 13 (PCSX2.ini [EmuCore/GS])');
    expect(plan.pageEvents.map((e) => [Math.round(e.t), e.index, 'pressed' in e ? e.pressed : null])).toEqual([[0, 3, true], [150, 3, false], [450, 10, true], [500, 10, false]]);
    expect(plan.keyActions.map((k) => [k.t, k.action, k.vk])).toEqual([[0, 'down', 0x49], [150, 'up', 0x49], [450, 'down', 0x37], [500, 'up', 0x37]]);
    expect(plan.acts.map((a) => [a.kind, a.t])).toEqual([['full', 0], ['light', 500]]);
    expect(plan.iniDiff).toContain('- Triangle = XInput-0/Y');
    expect(plan.iniDiff).toContain('+ Triangle = Keyboard/I');
    expect(plan.iniDiff).toContain('+ Macro15 = Keyboard/7');
    expect(plan.outputs).toEqual(['script.txt', 'pcsx2.csv', 'page.csv', 'record.json', 'run-question.csv', 'side-by-side.mp4', 'events.srt']
      .map((f) => `E:/eph-runs/runs/20261030T210509Z/${f}`));
  });

  it('plans the copy of the whole PCSX2 folder when the run has none, and diffs the desktop ini', () => {
    const c = ctx();
    const plan = planRun(args, { ...c, exists: (p) => p !== 'E:/eph-runs/pcsx2' && p !== 'E:/eph-runs/pcsx2/inis/PCSX2.ini' && c.exists(p) });
    expect(plan.copy).toEqual({ copy: true, from: 'C:/Projects/socom_pc/tools/pcsx2', to: 'E:/eph-runs/pcsx2', what: 'the whole folder' });
    expect(plan.iniDiff).toContain('+ Cross = Keyboard/K');
  });

  it('refuses a script line the ini does not carry before anything starts', () => {
    const c = ctx();
    const bad = { ...c, readText: (p: string) => (p === 'C:/runs/s.txt' ? '0 triangle 0.5\n' : c.readText(p)) };
    expect(() => planRun(args, bad)).toThrow(/script line 1/);
  });

  it('prints the plan: paths, argv, the ini diff, the page events, and that nothing started', () => {
    const text = formatPlan(planRun(args, ctx()));
    for (const want of [
      'EPH dry run -- nothing started',
      'run dir      E:/eph-runs',
      'output       E:/eph-runs/runs/20261030T210509Z',
      'pcsx2 copy   already copied (C:/Projects/socom_pc/tools/pcsx2 -> E:/eph-runs/pcsx2)',
      'ini          E:/eph-runs/pcsx2/inis/PCSX2.ini',
      'pcsx2 argv   E:/eph-runs/pcsx2/pcsx2-qt.exe -batch -nogui -fastboot -state 8 D:\\disc\\socom2.iso',
      `window       "${PCSX2_WINDOW_TITLE}"`,
      'page         http://localhost:5303/testroom?mode=play&devmode&noarmory&view=ps2&map=M01',
      '- Triangle = XInput-0/Y',
      '+ Triangle = Keyboard/I',
      'page events',
      '     0.0 ms  button 3 down',
      '   450.0 ms  button 10 down',
      'pcsx2 keys',
      '     450 ms  down vk 0x37',
      'acts',
      'light at 500 ms (line 5)',
      'ffmpeg -f gdigrab',
      'build        r0001 (default; the detected build must match, or the run fails)',
      '- Slot1_Filename = Mcd001.ps2',
      '+ Slot1_Filename = EPH-r0001-1.ps2',
      'card slot 1  E:/eph-runs/pcsx2/memcards/EPH-r0001-1.ps2 (absent: PCSX2 creates a new unformatted card when it opens the slot)',
      'tilt pcsx2   rootQx rootQy rootQz rootQw floorNx floorNy floorNz savedNx savedNy savedNz easeX easeY easeZ actorQx actorQy actorQz actorQw posture actionId airborne playPhase playClip playWindowA playWindowB flags105e topActionId (r0001; EPH-TILT)',
      'tilt page    rootQx rootQy rootQz rootQw rootUpX rootUpY rootUpZ tiltNx tiltNy tiltNz topClip topPhase (null on a build without Walker.rootTilt)',
      'stick pcsx2  stickTurn stickForward stickLateral padRaw0 padRaw1 padRaw2 padRaw3 padMoveA padMoveB padFlag0 ctlForward ctlLateral ctlTurn (r0001; FUN_00586570 +0x23c +0x240 +0x244; the pad FUN_002da930 +0x240 +0x210; the controller FUN_00551ec0 *(actor+0xc0))',
      'stick page   stickForward stickLateral (Walker.cutStick: forward, right)',
      'anim page    animPlay animClip animPhase rootHeight (Play.animStats: the play, its dominant clip and phase; Play.rootY: the posed root over the feet)',
    ]) {
      expect(text, want).toContain(want);
    }
  });

  it('--build: r0001 by default, r0004 on ask, for a run and for the boot; anything else refused', () => {
    expect(runArgs().build).toBe('r0001');
    expect(runArgs('--build', 'r0004').build).toBe('r0004');
    expect(parseRunArgs(['--boot-to-mission', '--state', '8', '--build', 'r0004']).build).toBe('r0004');
    expect(() => runArgs('--build', 'r0002')).toThrow('--build takes r0001 or r0004, not "r0002"');
    expect(HELP).toContain('--build <rNNNN>');
  });

  it('r0001 points both card slots at the harness cards in the ini it writes; r0004 at Mcd001/Mcd002', () => {
    const r1 = planRun(runArgs(), ctx());
    expect(r1.build).toBe('r0001');
    expect(r1.iniAfter).toContain('Slot1_Filename = EPH-r0001-1.ps2\r\n');
    expect(r1.iniAfter).toContain('Slot2_Filename = EPH-r0001-2.ps2\r\n');
    expect(r1.cards.map((c) => [c.slot, c.file, c.exists])).toEqual([[1, 'EPH-r0001-1.ps2', false], [2, 'EPH-r0001-2.ps2', false]]);
    const r4 = planRun(runArgs('--build', 'r0004'), ctx());
    expect(r4.iniAfter).toContain('Slot1_Filename = Mcd001.ps2\r\n');
    expect(r4.iniDiff.some((l) => l.includes('Slot1_Filename'))).toBe(false);
    expect(formatPlan(r4)).toContain('build        r0004 (on ask; the detected build must match, or the run fails)');
    expect(formatBootPlan(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()))).toContain('build        r0001');
  });
});

describe('slotStateFile', () => {
  it("counts the finished state and PCSX2's temp file; a .backup (the previous state) is neither", () => {
    expect(slotStateFile('SCUS-97275 (0F6FC6CF).09.p2s', 9)).toBe('done');
    expect(slotStateFile('SCUS-97275 (0F6FC6CF).09.p2s.0024add4', 9)).toBe('temp');
    expect(slotStateFile('SCUS-97275 (0F6FC6CF).09.p2s.backup', 9)).toBeNull();
    expect(slotStateFile('SCUS-97275 (0F6FC6CF).08.p2s', 9)).toBeNull();
  });
});

describe('the boot to the mission', () => {
  it('parses drive.py step lines: mode, delay, buttons (NONE pressing nothing), comments skipped', () => {
    expect(parseBootSteps(LAUNCH)).toEqual([
      { mode: 'next', delay: 1, buttons: ['cross'], line: 2 },
      { mode: 'next', delay: 2, buttons: ['cross'], line: 3 },
      { mode: 'wait', delay: 1, buttons: ['down'], line: 4 },
      { mode: 'next', delay: 10, buttons: [], line: 5 },
    ]);
    expect(() => parseBootSteps('next+1.0:FLY\n')).toThrow(/line 1/);
    expect(() => parseBootSteps('soon+1.0:CROSS\n')).toThrow(/line 1/);
  });

  it('plans a cold boot (no -state), the steps from the desktop script, then save_state to the slot', () => {
    const plan = planBoot(parseRunArgs(['--boot-to-mission', '--state', '8', '--dry-run']), ctx());
    expect(plan.pcsx2Argv).toEqual(['E:/eph-runs/pcsx2/pcsx2-qt.exe', '-batch', '-nogui', '-fastboot', 'D:\\disc\\socom2.iso']);
    expect(plan.stepsFrom).toBe('C:/Projects/socom_pc/scripts/parity/launch_to_mission.txt');
    expect(plan.steps).toHaveLength(4);
    expect(plan.slot).toBe(8);
    const text = formatBootPlan(plan);
    for (const want of ['EPH boot to mission, dry run -- nothing started', '-fastboot D:\\disc\\socom2.iso', 'next+1 cross', 'wait+1 down', 'next+10 (none)', 'PINE save_state slot 8']) {
      expect(text, want).toContain(want);
    }
  });
});

describe('the live mode (the owner addendum, 2026-10-30)', () => {
  it('parses --live with a map, the chord, and refuses --live with --script and --then-script', () => {
    expect(parseRunArgs(['--live', '--map', 'M01', '--state', '8', '--dry-run'])).toMatchObject({ live: true, script: null, map: 'M01', chordModifier: 'l2' });
    expect(parseRunArgs(['--live', '--map', 'M01', '--chord', 'R2'])).toMatchObject({ chordModifier: 'r2' });
    expect(() => parseRunArgs(['--live', '--map', 'M01', '--chord', 'lup'])).toThrow(/--chord/);
    expect(() => parseRunArgs(['--live', '--script', 's', '--map', 'M01'])).toThrow(/one/);
    expect(() => parseRunArgs(['--live', '--map', 'M01', '--then-script', 's'])).toThrow(/not built/);
  });

  it('documents the chord in the printed help', () => {
    expect(HELP).toContain('--chord <button>');
    expect(HELP).toContain('L2 + Triangle');
    expect(HELP).toContain('--live');
  });

  it('dry-runs: no script events, the chord, how it ends, live.script among the outputs', () => {
    const plan = planRun(parseRunArgs(['--live', '--map', 'M01', '--state', '8', '--dry-run']), ctx());
    expect(plan.mode).toBe('live');
    expect(plan.events).toEqual([]);
    expect(plan.outputs).toContain('E:/eph-runs/runs/20261030T210509Z/live.script');
    const text = formatPlan(plan);
    for (const want of ['EPH dry run -- nothing started', 'mode         live', 'chord        hold l2 and press triangle: triangle at 0.2', 'Ctrl+C', '-state 8', 'page seed']) {
      expect(text, want).toContain(want);
    }
    expect(text).not.toContain('page events');
  });

  it('refuses a chord on l3 or triangle before anything starts', () => {
    expect(() => planRun(parseRunArgs(['--live', '--map', 'M01', '--chord', 'l3']), ctx())).toThrow(/l3/);
    expect(() => planRun(parseRunArgs(['--live', '--map', 'M01', '--chord', 'triangle']), ctx())).toThrow(/modifier/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The live run over a fake host (the review fold): nothing is started -- PCSX2, Chromium, PINE, ffmpeg and the window
// search are fakes behind LiveDeps, the wall clock is virtual, and the signals are a fake process.

const bitsOf = (f: number): number => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, f, true); return b.getUint32(0, true); };
const tick = (): Promise<void> => new Promise((done) => setImmediate(done));
const until = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200_000 && !cond(); i++) await tick();
  if (!cond()) throw new Error('the fake run never reached the awaited state');
};

class FakeChild extends EventEmitter implements ChildLike {
  pid: number | undefined = 4242;
  exitCode: number | null = null;
  readonly written: string[] = [];
  ended = false;
  readonly stdin = {
    write: (t: string): boolean => {
      this.written.push(t);
      if (this.quitOnQ && t === 'q') setImmediate(() => this.exit(0));
      return true;
    },
    end: (): void => { this.ended = true; },
    on: (): unknown => this.stdin,
  };
  constructor(readonly quitOnQ: boolean) { super(); }
  exit(code: number): void { this.exitCode = code; this.emit('exit', code); }
}

interface FakeOpts {
  /** PCSX2 starts the save but never renames its temp file into place (the 2026-10-31 run: stopped mid-write). */
  readonly saveNeverLands?: boolean;
  /** Files already in the copy's sstates/ before the boot. */
  readonly sstates?: string[];
  readonly actor?: number;
  readonly pineFails?: boolean;
  readonly ffmpegMissing?: boolean;
  readonly hangWindow?: boolean;
  readonly hangPlace?: boolean;
  /** Titles of other windows over the capture region (the video fix's check). */
  readonly overlap?: readonly string[];
  readonly keyPathFails?: boolean;
  readonly prepareFails?: boolean;
  readonly outDirExists?: boolean;
  readonly padSetHangs?: boolean;
  /** Sleeps of these ms wait on their gate (released by hand) instead of passing at once on the virtual clock. */
  readonly gated?: readonly number[];
  readonly browserCloseGated?: boolean;
  /** The build PCSX2 runs (whose clock advances); 'none' for a guest whose clocks both stand. Default r0001. */
  readonly runs?: Revision | 'none';
  /** The page stays under the loading screen's hold: the ready wait times out (the 2026-10-31 run's map briefing). */
  readonly pageHeld?: boolean;
  /** PCSX2's skeleton root y (default 5.5: crouched) and the stance request byte (default 0). */
  readonly rootY?: number;
  readonly stanceByte?: number;
  /** The page's walk stance (default crouch). */
  readonly pageStance?: 'stand' | 'crouch' | 'prone';
}

interface Gate { readonly promise: Promise<void>; readonly release: () => void }
const gate = (): Gate => { let release: () => void = () => undefined; const promise = new Promise<void>((done) => { release = done; }); return { promise, release }; };

function fakeHost(o: FakeOpts = {}) {
  let wall = 0;
  const h = {
    log: [] as string[], errors: [] as string[], files: new Map<string, string>(), handlers: new Map<string, () => void>(),
    kills: [] as string[], exits: [] as number[], pads: [] as string[], writeTicks: [] as number[], keys: [] as string[], batches: [] as string[], steps: [] as string[], waited: [] as string[],
    sstates: [...(o.sstates ?? [])], removed: [] as string[],
    saved: [] as number[], order: [] as string[], launched: 0, browserClosed: 0, pineClosed: 0, windowsClosed: 0,
    pcsx2: new FakeChild(false), ffmpeg: new FakeChild(true),
    gates: new Map<number, Gate>((o.gated ?? []).map((ms) => [ms, gate()])), browserGate: gate(),
  };
  if (o.ffmpegMissing) h.ffmpeg.pid = undefined;
  const actor = o.actor ?? 0x1000;
  const runs = o.runs ?? 'r0001';
  const col = GUEST_ADDRESSES[runs === 'none' ? 'r0001' : runs];
  const otherClock = GUEST_ADDRESSES[runs === 'r0004' ? 'r0001' : 'r0004'].guestClock;
  let clockReads = 0;
  const perRow = runs !== 'none' && TILT_ADDRESSES[runs] ? 3 : 2;
  let pageTick = 1000;
  const pine: PineLike = {
    async read32(a: number): Promise<number> {
      await tick();
      if (o.pineFails) throw new Error('PINE op 0x2 timed out after 5000 ms');
      // The clock reads per row (the sampler's c0 and c1, and c2 after the tilt reads where the build has a tilt column):
      // one guest frame per row; and a frame per DETECT_GAP_MS of wall time, so the build detection's two reads a gap apart
      // see the running build's clock advance.
      if (a === col.guestClock) return runs === 'none' ? 0 : bitsOf(10 + (Math.floor(clockReads++ / perRow) + Math.floor(wall / DETECT_GAP_MS)) / 60);
      if (a === otherClock) return 0;
      if (a === col.playerActor) return actor;
      if (a === actor + col.rootNode) return 0x2000;
      if (a === 0x2004) return bitsOf(o.rootY ?? 5.5);
      return bitsOf(1);
    },
    async read8(): Promise<number> { await tick(); return o.stanceByte ?? 0; },
    async version(): Promise<string> { return 'PCSX2 fake'; },
    async saveState(slot: number): Promise<void> {
      await tick();
      h.saved.push(slot);
      const name = `SCUS-97275 (0F6FC6CF).${String(slot).padStart(2, '0')}.p2s`;
      h.sstates.push(o.saveNeverLands ? `${name}.0024add4` : name);
    },
    close(): void { h.pineClosed++; h.order.push('close pine'); },
  };
  const page: PageLike = {
    async goto(): Promise<void> { await tick(); },
    async waitForFunction(expr: string): Promise<void> {
      await tick();
      h.waited.push(expr);
      if (o.pageHeld) throw Object.assign(new Error('page.waitForFunction: Timeout 180000ms exceeded.'), { name: 'TimeoutError' });
    },
    async evaluate(expr: string): Promise<unknown> {
      await tick();
      if (expr.includes('loading()')) return { viewer: true, walking: true, loadingBlocked: Boolean(o.pageHeld), armoryOpen: false };
      if (expr.includes('__ephPadWrite')) {
        if (o.padSetHangs) return new Promise(() => undefined);
        h.pads.push(expr);
        // The tick the write was applied after: ahead of every sampled row, as the live page's is (hunt M4's stale clock).
        const at = pageTick + 7;
        h.writeTicks.push(at);
        return at;
      }
      if (expr === PAGE_TICK_EXPRESSION) return pageTick++;
      if (expr.includes('ephFrame')) return { tick: pageTick++, stance: o.pageStance ?? 'crouch', posture: o.pageStance ?? 'crouch', action: null };
      if (expr.includes('__ephPadSet')) {
        if (o.padSetHangs) return new Promise(() => undefined);
        h.pads.push(expr);
        return undefined;
      }
      return null;
    },
    onClose(): void { /* the fake page is never closed by hand */ },
  };
  const deps: LiveDeps = {
    signals: { on: (sig, fn) => { h.handlers.set(sig, fn); }, off: (sig) => { h.handlers.delete(sig); } },
    exit: (code) => { h.exits.push(code); h.order.push(`exit ${code}`); },
    log: (line) => { h.log.push(line); },
    logError: (line) => { h.errors.push(line); },
    exists: (path) => Boolean(o.outDirExists) && path.startsWith('E:/eph-runs/runs/'),
    listDir: (dir) => (dir === 'E:/eph-runs/pcsx2/sstates' ? [...h.sstates] : []),
    removeFile: (path) => {
      h.removed.push(path);
      const i = h.sstates.findIndex((n) => `E:/eph-runs/pcsx2/sstates/${n}` === path);
      if (i >= 0) h.sstates.splice(i, 1);
    },
    prepareHost: () => { if (o.prepareFails) throw new Error('cpSync: EACCES copying tools/pcsx2'); h.steps.push('prepare'); },
    writeFile: (path, text) => { const name = path.slice(path.lastIndexOf('/') + 1); h.files.set(name, text); h.order.push(`write ${name}`); },
    spawnPcsx2: () => { h.steps.push('pcsx2'); return h.pcsx2; },
    spawnFfmpeg: () => {
      h.steps.push('ffmpeg');
      if (o.ffmpegMissing) setImmediate(() => h.ffmpeg.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' })));
      return h.ffmpeg;
    },
    killTree: (c) => { const what = c === h.pcsx2 ? 'pcsx2' : c === h.ffmpeg ? 'ffmpeg' : '?'; h.kills.push(what); h.order.push(`kill ${what}`); },
    topmostWindow: async (hwnd) => { h.steps.push(`topmost ${hwnd}`); h.order.push(`topmost ${hwnd}`); await tick(); },
    windowsAbove: async (r, hwnds) => { h.steps.push(`above ${r.width}x${r.height} ${hwnds.join(',')}`); await tick(); return [...(o.overlap ?? [])]; },
    findWindow: async (title, _pid, signal) => {
      if (title.startsWith(PAGE_WINDOW_TITLE)) { h.steps.push('findPage'); await tick(); return 88; }
      h.steps.push('findWindow');
      if (o.hangWindow) await abortableSleep(3_600_000, signal);
      return 77;
    },
    placeWindow: async (_hwnd, _r, signal) => {
      h.steps.push('placeWindow');
      if (o.hangPlace) await abortableSleep(3_600_000, signal);
      else await tick();
    },
    closeWindows: () => { h.windowsClosed++; h.order.push('close windows'); },
    injector: (_hwnd, onFail) => {
      const down = (vk: number): void => {
        h.keys.push(`down ${vk}`);
        if (o.keyPathFails) setImmediate(() => onFail(new Error('the key injector (PowerShell): stdin failed: write EPIPE')));
      };
      const up = (vk: number): void => { h.keys.push(`up ${vk}`); };
      return {
        down, up,
        batch: async (acts) => {
          h.batches.push(acts.map((a) => `${a.action} ${a.vk}`).join(','));
          for (const a of acts) (a.action === 'down' ? down : up)(a.vk);
          await tick();
        },
        close: () => { h.order.push('close injector'); },
      };
    },
    connectPine: async () => pine,
    launchBrowser: async () => {
      h.launched++;
      return {
        browser: {
          close: async () => {
            h.order.push('close browser');
            if (o.browserCloseGated) await h.browserGate.promise;
            h.browserClosed++;
          },
        },
        page,
      };
    },
    pageBuild: () => 'abc1234',
    sleep: async (ms, signal) => {
      const g = h.gates.get(ms);
      if (g) await g.promise;
      wall += ms;
      await tick();
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new RunAborted();
    },
    now: () => wall,
  };
  return { h, deps };
}

const scriptCtx = (text: string): PlanContext => {
  const c = ctx();
  return { ...c, readText: (p) => (p === 'C:/runs/s.txt' ? text : c.readText(p)) };
};
const runArgs = (...more: string[]) => parseRunArgs(['--script', 'C:/runs/s.txt', '--map', 'M01', '--state', '8', ...more]);
const recordOf = (h: ReturnType<typeof fakeHost>['h']) => JSON.parse(h.files.get('record.json')!) as Record<string, unknown> & {
  outcome: string; events: { line: number; pageEventExpected: boolean; flagged: boolean }[];
};

describe('the run seams (the review fold: Ctrl+C, async failures, bounded waits)', () => {
  it('launches Chromium with the Playwright signal handlers off, so the harness handler and the finally run', () => {
    const o = chromiumLaunchOptions();
    expect(o).toMatchObject({ headless: false, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
    expect(o.args).toEqual([`--window-position=${CHROMIUM_WINDOW.x},${CHROMIUM_WINDOW.y}`, `--window-size=${CHROMIUM_WINDOW.width},${CHROMIUM_WINDOW.height}`]);
  });

  it('installStop: the first signal aborts; the second and third await the one finish (stop, then the record), then exit', async () => {
    const handlers = new Map<string, () => void>();
    const ctl = new AbortController();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const remove = installStop({
      signals: { on: (sig, fn) => { handlers.set(sig, fn); }, off: (sig) => { handlers.delete(sig); } },
      controller: ctl,
      killNow: () => { order.push('kill pcsx2'); },
      finish: async () => { order.push('stop'); await new Promise<void>((done) => { release = done; }); order.push('record'); },
      exit: (code) => { order.push(`exit ${code}`); },
      log: () => undefined,
      sleep: () => new Promise<void>(() => undefined),
    });
    expect([...handlers.keys()].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM']);
    handlers.get('SIGINT')!();
    expect(ctl.signal.aborted).toBe(true);
    expect(ctl.signal.reason).toBeInstanceOf(RunAborted);
    expect(order).toEqual([]);
    handlers.get('SIGTERM')!();
    handlers.get('SIGINT')!();
    await tick();
    expect(order).toEqual(['kill pcsx2', 'stop', 'kill pcsx2']);
    release();
    await until(() => order.includes('exit 130'));
    await tick();
    expect(order).toEqual(['kill pcsx2', 'stop', 'kill pcsx2', 'record', 'exit 130']);
    remove();
    expect(handlers.size).toBe(0);
  });

  it('installStop: a forced exit waits FORCED_EXIT_CEILING_MS at most, PCSX2 killed first', async () => {
    expect(FORCED_EXIT_CEILING_MS).toBe(20_000);
    const handlers = new Map<string, () => void>();
    const order: string[] = [];
    const slept: number[] = [];
    installStop({
      signals: { on: (sig, fn) => { handlers.set(sig, fn); }, off: (sig) => { handlers.delete(sig); } },
      controller: new AbortController(),
      killNow: () => { order.push('kill pcsx2'); },
      finish: () => new Promise<void>(() => undefined),
      exit: (code) => { order.push(`exit ${code}`); },
      log: () => undefined,
      sleep: async (ms) => { slept.push(ms); await tick(); },
    });
    handlers.get('SIGINT')!();
    handlers.get('SIGINT')!();
    await until(() => order.includes('exit 130'));
    expect(order).toEqual(['kill pcsx2', 'exit 130']);
    expect(slept).toEqual([FORCED_EXIT_CEILING_MS]);
  });

  it('installStop: SIGHUP (a closed console) kills PCSX2 inside the handler, before anything else', () => {
    const handlers = new Map<string, () => void>();
    const ctl = new AbortController();
    const order: string[] = [];
    installStop({
      signals: { on: (sig, fn) => { handlers.set(sig, fn); }, off: (sig) => { handlers.delete(sig); } },
      controller: ctl,
      killNow: () => { order.push(`kill pcsx2 (aborted ${ctl.signal.aborted})`); },
      finish: async () => undefined,
      exit: (code) => { order.push(`exit ${code}`); },
      log: (line) => { order.push(`log ${line.slice(0, 7)}`); },
      sleep: async () => undefined,
    });
    handlers.get('SIGHUP')!();
    expect(order[0]).toBe('kill pcsx2 (aborted false)');
    expect(ctl.signal.aborted).toBe(true);
  });

  it('labels the instrument bounds and the launch command', () => {
    expect([PINE_CONNECT_TIMEOUT_MS, PAGE_READY_TIMEOUT_MS, BROWSER_CLOSE_MS]).toEqual([60_000, 180_000, 10_000]);
    expect(RUN_COMMAND).toBe('node --import tsx tools/eph/run.ts');
    expect(HELP).toContain(RUN_COMMAND);
  });

  it('stopFfmpeg sends q and closes stdin; it kills only an ffmpeg that has not quit within FFMPEG_QUIT_MS', async () => {
    expect(FFMPEG_QUIT_MS).toBe(5000);
    const kills: ChildLike[] = [];
    const slept: number[] = [];
    const d = { sleep: async (ms: number) => { slept.push(ms); await tick(); await tick(); }, killTree: (c: ChildLike) => { kills.push(c); } };
    const good = new FakeChild(true);
    await stopFfmpeg(good, d);
    expect([good.written, good.ended, kills]).toEqual([['q'], true, []]);
    const stubborn = new FakeChild(false);
    await stopFfmpeg(stubborn, d);
    expect(stubborn.written).toEqual(['q']);
    expect(kills).toEqual([stubborn]);
    expect(slept).toContain(FFMPEG_QUIT_MS);
    const gone = new FakeChild(true);
    gone.exitCode = 0;
    const never = new FakeChild(true);
    never.pid = undefined;
    await stopFfmpeg(gone, d);
    await stopFfmpeg(never, d);
    await stopFfmpeg(null, d);
    expect([gone.written, never.written, kills.length]).toEqual([[], [], 1]);
  });

  it('startCapture listens for the spawn error: ffmpeg missing (ENOENT) is reported and the run goes on without video', () => {
    const c = new FakeChild(true);
    const lost: string[] = [];
    expect(startCapture(['-y', 'x.mp4'], { spawnFfmpeg: () => c }, (why) => { lost.push(why); })).toBe(c);
    expect(() => c.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }))).not.toThrow();
    expect(lost).toEqual(['ffmpeg not found on PATH (spawn ffmpeg ENOENT): the run goes on without video']);
    c.emit('error', new Error('pipe broke'));
    expect(lost[1]).toBe('ffmpeg failed (pipe broke): the run goes on without video');
  });

  it('findOnPath finds ffmpeg on PATH (or Path) for the dry run, without starting anything', () => {
    const exists = (p: string) => p === 'C:/tools/ffmpeg/bin/ffmpeg.exe';
    expect(findOnPath('ffmpeg', { PATH: 'C:\\Windows;"C:\\tools\\ffmpeg\\bin\\"' }, exists, 'win32')).toBe('C:/tools/ffmpeg/bin/ffmpeg.exe');
    expect(findOnPath('ffmpeg', { Path: 'C:/tools/ffmpeg/bin' }, exists, 'win32')).toBe('C:/tools/ffmpeg/bin/ffmpeg.exe');
    expect(findOnPath('ffmpeg', { PATH: '/usr/bin:/opt/ff' }, (p) => p === '/opt/ff/ffmpeg', 'linux')).toBe('/opt/ff/ffmpeg');
    expect(findOnPath('ffmpeg', {}, exists, 'win32')).toBeNull();
    const args = runArgs('--dry-run');
    expect(formatPlan(planRun(args, ctx()))).toContain('ffmpeg       not on PATH: the run goes on without video');
    const c = ctx();
    const withFf = { ...c, env: { ...c.env, PATH: 'C:/tools/ffmpeg/bin' }, platform: 'win32' as const, exists: (p: string) => exists(p) || c.exists(p) };
    expect(formatPlan(planRun(args, withFf))).toContain('ffmpeg       C:/tools/ffmpeg/bin/ffmpeg.exe');
  });
});

describe('liveRun over a fake host', () => {
  it('a Ctrl+C in the window search ends that wait, stops PCSX2 once, and still writes the record', async () => {
    const { h, deps } = fakeHost({ hangWindow: true });
    const run = liveRun(planRun(runArgs(), ctx()), deps);
    await until(() => h.steps.includes('findWindow'));
    expect([...h.handlers.keys()].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM']);
    h.handlers.get('SIGINT')!();
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.launched).toBe(0);
    expect(recordOf(h).outcome).toBe('interrupted: EPH run: interrupted (Ctrl+C)');
    expect(h.handlers.size).toBe(0);
    expect(h.exits).toEqual([]);
  });

  it('a Ctrl+C mid-script ends the timeline wait, stops each thing once, then writes every output', async () => {
    const { h, deps } = fakeHost();
    const run = liveRun(planRun(runArgs(), scriptCtx('0 triangle 1\n150 triangle 0\n600000 cross 1\n')), deps);
    await until(() => h.keys.length >= 2);
    h.handlers.get('SIGINT')!();
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(h.ffmpeg.written).toEqual(['q']);
    expect(h.kills).toEqual(['pcsx2']);
    expect([h.browserClosed, h.pineClosed]).toEqual([1, 1]);
    expect([...h.files.keys()].sort()).toEqual(['events.srt', 'page.csv', 'pcsx2.csv', 'record.json', 'run-question.csv', 'script.txt']);
    const rec = recordOf(h);
    expect(rec.outcome).toMatch(/^interrupted/);
    expect(rec.events.map((e) => e.line)).toEqual([1, 2]);
    expect(rec.questionCsv).toEqual({ file: 'run-question.csv', note: QUESTION_CSV_NOTE });
  });

  it('a Ctrl+C pressed while a finished script run stops does not relabel it: the outcome is read before the stop', async () => {
    const { h, deps } = fakeHost();
    const kill = deps.killTree;
    // stopAll kills PCSX2 first: press Ctrl+C right there, after the run itself has ended.
    const pressed = { done: false };
    const wrapped: LiveDeps = { ...deps, killTree: (c) => { kill(c); if (!pressed.done) { pressed.done = true; h.handlers.get('SIGINT')?.(); } } };
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), wrapped);
    expect(pressed.done).toBe(true);
    expect(recordOf(h).outcome).toBe('complete');
  });

  it('a script run to its end writes the record, the light press line unflagged, and the CSV with both definitions', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    const rec = recordOf(h);
    expect(rec.outcome).toBe('complete');
    expect(rec.events.find((e) => e.line === 4)).toMatchObject({ pageEventExpected: false, flagged: false });
    expect(rec.pineErrors).toBe(0);
    expect(rec.video).toBe('recorded');
    expect(h.files.get('run-question.csv')!.split('\n')[0]).toContain('pcsx2_idle_definition,page_idle_definition');
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.ffmpeg.written).toEqual(['q']);
    expect(h.handlers.size).toBe(0);
  });

  it('no player actor ends the first-rows wait at FIRST_ROWS_TIMEOUT_MS with a clear line, not a hang', async () => {
    expect(FIRST_ROWS_TIMEOUT_MS).toBe(30_000);
    const { h, deps } = fakeHost({ actor: 0 });
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow('EPH run: no player actor: is --state set?');
    expect(h.kills).toEqual(['pcsx2']);
    expect(recordOf(h).outcome).toBe('failed: EPH run: no player actor: is --state set?');
  });

  it('PINE errors are counted, and 50 in a row stop the run cleanly with the record written', async () => {
    const { h, deps } = fakeHost({ pineFails: true });
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow(/PINE failed 50 reads in a row/);
    const rec = recordOf(h);
    expect(rec.pineErrors).toBe(50);
    expect(rec.outcome).toMatch(/^stopped: EPH run: PINE failed 50 reads in a row/);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('ffmpeg missing: the run goes on without video and says so', async () => {
    const { h, deps } = fakeHost({ ffmpegMissing: true });
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    expect(h.log).toContain('EPH run: ffmpeg not found on PATH (spawn ffmpeg ENOENT): the run goes on without video');
    const rec = recordOf(h);
    expect(rec.outcome).toBe('complete');
    expect(rec.video).toBe('none: ffmpeg not found on PATH (spawn ffmpeg ENOENT): the run goes on without video');
    expect(h.ffmpeg.written).toEqual([]);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('live: Ctrl+C is the session end -- it resolves, writes live.script and the record, and stops everything', async () => {
    const { h, deps } = fakeHost();
    const run = liveRun(planRun(parseRunArgs(['--live', '--map', 'M01', '--state', '8']), ctx()), deps);
    await until(() => h.steps.includes('ffmpeg') && h.handlers.has('SIGINT'));
    h.handlers.get('SIGINT')!();
    await run;
    expect(h.files.get('live.script')).toMatch(/^# EPH live session/);
    expect(recordOf(h).outcome).toBe('complete (live session ended by Ctrl+C)');
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.browserClosed).toBe(1);
  });
});

describe('liveRun: the two readiness checks before the script (the 2026-10-31 run)', () => {
  it('waits for the page in play: the walk, the loading hold released, the ARMORY shut', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    expect(h.waited).toEqual([PAGE_READY_EXPRESSION]);
  });

  it('a page still under the loading screen fails with what holds it, sending no input to either side', async () => {
    const { h, deps } = fakeHost({ pageHeld: true });
    const want = 'EPH run: the page was not in play within 180 s: the loading screen still holds the input (__viewer.loading().blocked)';
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow(want);
    expect(recordOf(h).outcome).toContain(want);
    expect(h.pads).toEqual([]);
    expect(h.keys).toEqual([]);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('records both start stances on a run that starts matched', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.outcome).toBe('complete');
    expect(rec.startStances).toMatchObject({ pcsx2: { stance: 'crouch', rootY: 5.5, stanceRequest: 0 }, page: { stance: 'crouch' }, match: true });
  });

  it('refuses PCSX2 prone against the page standing, naming both, before any input; the record keeps both', async () => {
    const { h, deps } = fakeHost({ rootY: 2.16796875, stanceByte: 2, pageStance: 'stand' });
    const want = 'EPH run: the two sides start in different stances: PCSX2 prone (root y 2.168';
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow(want);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.outcome).toContain('and the page stand (ephFrame().stance)');
    expect(rec.startStances).toMatchObject({ pcsx2: { stance: 'prone', stanceRequest: 2 }, page: { stance: 'stand' }, match: false });
    expect(h.pads).toEqual([]);
    expect(h.keys).toEqual([]);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('a live session is refused the same way', async () => {
    const { h, deps } = fakeHost({ rootY: 11.484, pageStance: 'crouch' });
    await expect(liveRun(planRun(parseRunArgs(['--live', '--map', 'M01', '--state', '8']), ctx()), deps)).rejects.toThrow(/PCSX2 stand .* and the page crouch/);
    expect(h.keys).toEqual([]);
  });
});

describe('liveRun and liveBoot: the build PCSX2 runs is detected, recorded, and must be the one asked for', () => {
  it('a run records the build asked, the build detected with both clock readings, and prints it', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.outcome).toBe('complete');
    expect(rec.build).toBe('r0001');
    expect(rec.revision.detected).toBe('r0001');
    expect(rec.revision.readings.map((r: { revision: string; advanced: boolean }) => [r.revision, r.advanced])).toEqual([['r0001', true], ['r0004', false]]);
    expect(rec.addresses).toEqual(GUEST_ADDRESSES.r0001);
    expect(rec.unread).toEqual([]);
    expect(rec.memoryCards.map((c: { file: string }) => c.file)).toEqual(['EPH-r0001-1.ps2', 'EPH-r0001-2.ps2']);
    expect(h.log.some((l) => /^PCSX2 runs r0001 \(r0001 clock 0x004365c0 read [\d.]+ then [\d.]+; r0004 clock 0x00442fd0 read 0 then 0\)$/.test(l))).toBe(true);
  });

  it('--build r0004 on an r0004 guest: its column, the stance request read at +0x374', async () => {
    const { h, deps } = fakeHost({ runs: 'r0004' });
    await liveRun(planRun(runArgs('--tail-ms', '100', '--build', 'r0004'), ctx()), deps);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.outcome).toBe('complete');
    expect([rec.build, rec.revision.detected]).toEqual(['r0004', 'r0004']);
    expect(rec.addresses).toEqual(GUEST_ADDRESSES.r0004);
    expect(rec.unread).toEqual([]);
    expect(rec.stanceRequestEvidence).toMatch(/inferred.*live/);
    const csv = h.files.get('pcsx2.csv')!.split('\n');
    const col = csv[0]!.split(',').indexOf('stanceRequest');
    expect(col).toBeGreaterThanOrEqual(0);
    expect(csv[1]!.split(',')[col]).toBe('0');
  });

  it('EPH-TILT: a run records the tilt column it read (r0001) and its CSV carries the tilt columns, a bad pointer empty', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.tiltAddresses).toEqual(TILT_ADDRESSES.r0001);
    expect(rec.tiltUnread).toEqual([]);
    expect(rec.tiltReadErrors).toBe(0);
    expect(typeof rec.tiltTornRows).toBe('number');
    expect(rec.scriptFile).toBe('C:/runs/s.txt');   // the script's path: analyze.ts names the case from it
    const csv = h.files.get('pcsx2.csv')!.split('\n');
    const head = csv[0]!.split(',');
    for (const k of PCSX_TILT_COLUMNS) expect(head, k).toContain(k);
    // The fake answers 1.0f (0x3f800000) for every other word: not a RAM pointer, so the top play is empty.
    expect(csv[1]!.split(',')[head.indexOf('playPhase')]).toBe('');
    expect(csv[1]!.split(',')[head.indexOf('rootQw')]).toBe('1');   // its root node 0x2000 is one
    expect(csv[1]!.split(',')[head.indexOf('floorNy')]).toBe('1');
  });

  it('item 6: on r0004 the tilt and stick are read at r0004 column, and record.json names their evidence and the inferred', async () => {
    const { h, deps } = fakeHost({ runs: 'r0004' });
    await liveRun(planRun(runArgs('--tail-ms', '100', '--build', 'r0004'), ctx()), deps);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.tiltAddresses).toEqual(TILT_ADDRESSES.r0004);
    expect(rec.stickAddresses).toEqual(STICK_ADDRESSES.r0004);
    expect(rec.tiltUnread).toEqual([]);
    expect(rec.columnInferred).toEqual(COLUMN_INFERRED.r0004);
    expect(Object.keys(rec.columnEvidence)).toEqual(['tilt', 'stick']);
  });

  it('--build r0001 on an r0004 guest (the update card, or an r0004 state) fails loudly, sampling nothing', async () => {
    const { h, deps } = fakeHost({ runs: 'r0004' });
    const want = 'EPH run: --build r0001 asked, but PCSX2 runs r0004';
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow(want);
    const rec = recordOf(h) as Record<string, any>;
    expect(rec.outcome).toContain(want);
    expect(rec.outcome).toMatch(/r0001 clock 0x004365c0 read 0 then 0; r0004 clock 0x00442fd0 read [\d.]+ then [\d.]+/);
    expect(rec.revision.detected).toBe('r0004');
    expect(h.files.get('pcsx2.csv')).toBe('');
    expect(h.launched).toBe(0);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('neither clock advancing fails the run naming both readings', async () => {
    const { h, deps } = fakeHost({ runs: 'none' });
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow('EPH: cannot tell which build PCSX2 runs: neither guest clock advanced');
    expect(recordOf(h).outcome).toContain('r0001 clock 0x004365c0 read 0 then 0; r0004 clock 0x00442fd0 read 0 then 0');
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('the boot refuses to save a state of another build than --build, saving nothing', async () => {
    const { h, deps } = fakeHost({ runs: 'r0004' });
    await expect(liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()), deps))
      .rejects.toThrow('EPH boot: --build r0001 asked, but PCSX2 runs r0004');
    expect(h.saved).toEqual([]);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('the boot saves the state of the build asked, and says which', async () => {
    const { h, deps } = fakeHost({ runs: 'r0004' });
    await liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8', '--build', 'r0004']), ctx()), deps);
    expect(h.saved).toEqual([8]);
    expect(h.log).toContain('saved the r0004 state to slot 8');
  });

  it('the boot leaves the slot\'s .backup alone and does not wait on it', async () => {
    const backup = 'SCUS-97275 (0F6FC6CF).08.p2s.backup';
    const { h, deps } = fakeHost({ sstates: [backup] });
    await liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()), deps);
    expect(h.removed).toEqual([]);
    expect(h.sstates).toEqual([backup, 'SCUS-97275 (0F6FC6CF).08.p2s']);
  });
});

describe('liveRun: the stop order, the forced exit and the failures of the fold round 2', () => {
  const stops = ['kill pcsx2', 'close browser', 'close injector', 'close pine', 'close windows'];
  const longScript = '0 triangle 1\n150 triangle 0\n600000 cross 1\n';

  it('stops PCSX2 first, then the browser, the key path, PINE and the window helper; the record after them', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    const at = h.order.indexOf('kill pcsx2');
    expect(h.order.slice(at).filter((o) => stops.includes(o))).toEqual(stops);
    expect(h.order.indexOf('write record.json')).toBeGreaterThan(h.order.indexOf('close windows'));
    expect(h.windowsClosed).toBe(1);
  });

  it('a second and a third Ctrl+C mid-stop await the one stop and the record, then exit 130', async () => {
    const { h, deps } = fakeHost({ browserCloseGated: true, gated: [BROWSER_CLOSE_MS, FORCED_EXIT_CEILING_MS] });
    const run = liveRun(planRun(runArgs(), scriptCtx(longScript)), deps);
    await until(() => h.keys.length >= 2);
    h.handlers.get('SIGINT')!();
    await until(() => h.order.includes('close browser'));
    expect(h.order.indexOf('kill pcsx2')).toBeLessThan(h.order.indexOf('close browser'));
    h.handlers.get('SIGINT')!();
    h.handlers.get('SIGINT')!();
    for (let i = 0; i < 50; i++) await tick();
    expect(h.exits).toEqual([]);
    expect(h.files.has('record.json')).toBe(false);
    h.browserGate.release();
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    await until(() => h.exits.length > 0);
    expect(h.exits).toEqual([130]);
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.order.indexOf('write record.json')).toBeLessThan(h.order.indexOf('exit 130'));
    expect(recordOf(h).outcome).toBe('interrupted: EPH run: interrupted (Ctrl+C)');
  });

  it('the forced exit at FORCED_EXIT_CEILING_MS: PCSX2 already killed, exit 130 though the stop hangs', async () => {
    const { h, deps } = fakeHost({ browserCloseGated: true, gated: [BROWSER_CLOSE_MS, FORCED_EXIT_CEILING_MS] });
    void liveRun(planRun(runArgs(), scriptCtx(longScript)), deps).catch(() => undefined);
    await until(() => h.keys.length >= 2);
    h.handlers.get('SIGINT')!();
    await until(() => h.order.includes('close browser'));
    h.handlers.get('SIGINT')!();
    h.gates.get(FORCED_EXIT_CEILING_MS)!.release();
    await until(() => h.exits.length > 0);
    expect(h.exits).toEqual([130]);
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.order.indexOf('kill pcsx2')).toBeLessThan(h.order.indexOf('exit 130'));
  });

  it('SIGHUP kills PCSX2 inside the handler, then the run stops once and writes the record', async () => {
    const { h, deps } = fakeHost();
    const run = liveRun(planRun(runArgs(), scriptCtx(longScript)), deps);
    await until(() => h.keys.length >= 2);
    h.handlers.get('SIGHUP')!();
    expect(h.kills).toEqual(['pcsx2']);
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(h.kills).toEqual(['pcsx2']);
    expect(recordOf(h).outcome).toBe('interrupted: EPH run: interrupted (the console closed, SIGHUP)');
  });

  it('the key path failing (EPIPE on the injector stdin) stops the run cleanly with the record written', async () => {
    const { h, deps } = fakeHost({ keyPathFails: true });
    await expect(liveRun(planRun(runArgs(), scriptCtx(longScript)), deps)).rejects.toBeInstanceOf(RunStopped);
    expect(recordOf(h).outcome).toBe('stopped: EPH run: the key path failed: the key injector (PowerShell): stdin failed: write EPIPE');
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('a Ctrl+C while the window is being placed ends that wait', async () => {
    const { h, deps } = fakeHost({ hangPlace: true });
    const run = liveRun(planRun(runArgs(), ctx()), deps);
    await until(() => h.steps.includes('placeWindow'));
    h.handlers.get('SIGINT')!();
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(h.kills).toEqual(['pcsx2']);
    expect(recordOf(h).outcome).toMatch(/^interrupted/);
  });

  it('a setup failure before the run directory exists says the record on stderr, writing nothing', async () => {
    const { h, deps } = fakeHost({ prepareFails: true });
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow('cpSync: EACCES copying tools/pcsx2');
    expect([...h.files.keys()]).toEqual([]);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]).toContain('"outcome":"failed in setup: cpSync: EACCES copying tools/pcsx2"');
    expect(h.kills).toEqual([]);
    expect(h.handlers.size).toBe(0);
  });

  it('a setup failure with the run directory there writes a minimal record.json', async () => {
    const { h, deps } = fakeHost({ prepareFails: true, outDirExists: true });
    await expect(liveRun(planRun(runArgs(), ctx()), deps)).rejects.toThrow('cpSync');
    expect([...h.files.keys()]).toEqual(['record.json']);
    expect(recordOf(h)).toMatchObject({ outcome: 'failed in setup: cpSync: EACCES copying tools/pcsx2', mode: 'script' });
    expect(h.errors).toEqual([]);
  });

  it('video fix (run #111 on): both windows go topmost and the region is checked clear before ffmpeg starts', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    expect(h.steps).toContain('findPage');
    expect(h.steps).toContain(`above ${CAPTURE_REGION.width}x${CAPTURE_REGION.height} 77,88`);
    const iTop = h.steps.indexOf('topmost 77'), iPage = h.steps.indexOf('topmost 88'), iFf = h.steps.indexOf('ffmpeg');
    expect(iTop).toBeGreaterThanOrEqual(0);
    expect(iPage).toBeGreaterThanOrEqual(0);
    expect(iTop).toBeLessThan(iFf);
    expect(iPage).toBeLessThan(iFf);
    expect(recordOf(h)).toMatchObject({ video: 'recorded', videoOverlap: [] });
  });

  it('video fix: a window still over the region is named in the record and the log; the run goes on', async () => {
    const { h, deps } = fakeHost({ overlap: ['Windows PowerShell'] });
    await liveRun(planRun(runArgs('--tail-ms', '100'), ctx()), deps);
    const rec = recordOf(h);
    expect(rec.outcome).toBe('complete');
    expect(rec).toMatchObject({ videoOverlap: ['Windows PowerShell'] });
    expect(rec.video).toMatch(/^recorded, overlapped by: Windows PowerShell/);
    expect(h.log.join('\n')).toMatch(/over the capture region: Windows PowerShell/);
  });

  it('review F3: a same-ms release and press reach PCSX2 as ONE key batch (the ups, then the downs)', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), scriptCtx('0 lleft 1\n300 lleft 0\n300 lright 1\n')), deps);
    expect(recordOf(h).outcome).toBe('complete');
    expect(h.batches).toEqual([`down ${PCSX2_VK.lleft}`, `up ${PCSX2_VK.lleft},down ${PCSX2_VK.lright}`]);
  });

  it('review F1: record.json names the extra words per build, their evidence, and which are inferred', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100', '--extra'), ctx()), deps);
    const x = (recordOf(h) as unknown as { extra: { addresses: unknown; evidence: Record<string, string>; inferred: string[] } }).extra;
    expect(x.addresses).toEqual(EXTRA_ADDRESSES.r0001);
    expect(Object.keys(x.evidence).sort()).toEqual(['actorList', 'actorType', 'diveVelocity', 'velocity']);
    expect(Array.isArray(x.inferred)).toBe(true);
    expect(HELP).toMatch(/--extra[\s\S]*inferred/);
  });

  it('review F3: the run orchestrator is Windows-only and says so off Windows', () => {
    expect(() => hostDeps('linux')).toThrow(/Windows-only.*createKeyInjector.*pineSocketPath/);
  });

  it('hunt D4/M5: a same-ms release and press on one axis reach the page as ONE write of the final value', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), scriptCtx('0 lleft 1\n300 lleft 0\n300 lright 1\n')), deps);
    expect(recordOf(h).outcome).toBe('complete');
    expect(h.pads).toHaveLength(2);
    expect(h.pads[1]).toContain('["axis",0,false,1]');
    expect(h.pads[1]).not.toContain('["axis",0,false,0]');
  });

  it('hunt M4: a page event is stamped from the tick the write was applied on, not the last sampled row', async () => {
    const { h, deps } = fakeHost();
    await liveRun(planRun(runArgs('--tail-ms', '100'), scriptCtx('0 lup 1\n300 lup 0\n300 square 1\n')), deps);
    const rec = recordOf(h) as unknown as { tick0: number; events: { line: number; pageLateMs: number | null }[] };
    expect(h.writeTicks).toHaveLength(2);
    const at = (h.writeTicks[1]! + 1 - rec.tick0) * FRAME_MS;
    expect(rec.events.find((e) => e.line === 2)!.pageLateMs).toBeCloseTo(at - 300, 6);
    expect(rec.events.find((e) => e.line === 3)!.pageLateMs).toBeCloseTo(at - 300, 6);
  });

  it('a page setPad that never settles ends at SCRIPT_CLOCK_STALL_MS with the record written', async () => {
    const { h, deps } = fakeHost({ padSetHangs: true });
    await expect(liveRun(planRun(runArgs(), ctx()), deps))
      .rejects.toThrow(`EPH timeline: firing script line 2 did not settle in ${SCRIPT_CLOCK_STALL_MS} ms of wall time`);
    expect(recordOf(h).outcome).toMatch(/^failed: EPH timeline: firing script line 2/);
    expect(h.kills).toEqual(['pcsx2']);
  });
});

describe('liveBoot over a fake host', () => {
  it('plays the steps, saves the state and stops PCSX2', async () => {
    const { h, deps } = fakeHost();
    await liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()), deps);
    expect(h.saved).toEqual([8]);
    expect(h.sstates).toEqual(['SCUS-97275 (0F6FC6CF).08.p2s']);
    expect(h.keys.length).toBe(6);
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.handlers.size).toBe(0);
  });

  it('clears the slot\'s old state (and a half-written one) first, so only a finished new file counts', async () => {
    const old = ['SCUS-97275 (0F6FC6CF).08.p2s', 'SCUS-97275 (0F6FC6CF).08.p2s.0024add4', 'SCUS-97275 (0F6FC6CF).09.p2s'];
    const { h, deps } = fakeHost({ sstates: old });
    await liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()), deps);
    expect(h.removed).toEqual(old.slice(0, 2).map((n) => `E:/eph-runs/pcsx2/sstates/${n}`));
    expect(h.sstates).toEqual(['SCUS-97275 (0F6FC6CF).09.p2s', 'SCUS-97275 (0F6FC6CF).08.p2s']);
  });

  it('a save PCSX2 never finishes writing fails the boot after SAVE_STATE_TIMEOUT_MS and still stops PCSX2', async () => {
    const { h, deps } = fakeHost({ saveNeverLands: true });
    await expect(liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()), deps))
      .rejects.toThrow(`EPH boot: slot 8's state was not written within ${SAVE_STATE_TIMEOUT_MS} ms`);
    expect(h.log.some((l) => l.includes('state to slot 8'))).toBe(false);
    expect(h.kills).toEqual(['pcsx2']);
  });

  it('a Ctrl+C in the window search ends the boot and stops PCSX2, saving nothing', async () => {
    const { h, deps } = fakeHost({ hangWindow: true });
    const run = liveBoot(planBoot(parseRunArgs(['--boot-to-mission', '--state', '8']), ctx()), deps);
    await until(() => h.steps.includes('findWindow'));
    h.handlers.get('SIGINT')!();
    await expect(run).rejects.toBeInstanceOf(RunAborted);
    expect(h.saved).toEqual([]);
    expect(h.kills).toEqual(['pcsx2']);
    expect(h.handlers.size).toBe(0);
  });
});
