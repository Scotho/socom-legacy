import { describe, expect, it } from 'vitest';
import { PackContextError, packContext, readPackVersion } from '../eph/packContext';
import { hostDeps, hostPlan, parseRunArgs } from '../eph/run';

/**
 * The parity pack's plan context (PK-2; docs/specs/2026-11-03-parity-pack-design.md 6.1): a pack has no git, so
 * `EPH_PACK=<root>` makes the PlanContext from `<root>/pack/VERSION.json`. A product-track adaptation: no game value moves.
 * Pure over a fake file system; nothing starts.
 */
const VERSION = { pageSha: 'abc1234', pageTag: 'v0.3.40', pcsx2Version: 'v2.8.2', packStamp: '20261103T120000Z', builderCommit: 'def5678' };
const INI = ['[Pad1]', 'Type = DualShock2', '', '[MemoryCards]', 'Slot1_Filename = Mcd001.ps2', 'Slot2_Filename = Mcd002.ps2', ''].join('\n');

const world = (version: string | null = JSON.stringify(VERSION)) => {
  const files: Record<string, string> = {
    'D:/Tester/SOCOM-Parity/pack/run/pcsx2/inis/PCSX2.ini': INI,
  };
  if (version !== null) files['D:/Tester/SOCOM-Parity/pack/VERSION.json'] = version;
  return {
    exists: (p: string) => p in files || ['D:/Tester/SOCOM-Parity/pack/run/pcsx2', 'D:/Tester/image.iso'].includes(p),
    readText: (p: string) => { const t = files[p]; if (t === undefined) throw new Error(`ENOENT: no such file ${p}`); return t; },
  };
};
const PACK_VARS = { EPH_PACK: 'D:\\Tester\\SOCOM-Parity', SOCOM_PC_ROOT: 'D:/Tester/SOCOM-Parity/pack/desktop-stub', SOCOM_ISO: 'D:/Tester/image.iso' };
const NOW = new Date(Date.UTC(2026, 10, 3, 12, 0, 0));

describe('packContext (EPH_PACK: a context without git)', () => {
  it('reads VERSION.json and makes the context: repo = pack/harness, no clones, the parent of the pack, the env kept', () => {
    const w = world();
    const c = packContext(PACK_VARS, NOW, 'win32', w.exists, w.readText);
    expect(c.repo).toBe('D:/Tester/SOCOM-Parity/pack/harness');
    expect(c.clones).toEqual([]);
    expect(c.worktreeParent).toBe('D:/Tester');
    expect(c.env.SOCOM_PC_ROOT).toBe('D:/Tester/SOCOM-Parity/pack/desktop-stub');
    expect(c.now).toBe(NOW);
    expect(c.platform).toBe('win32');
    expect(c.version).toEqual(VERSION);
  });

  it("defaults EPH_RUN_DIR to <EPH_PACK>/pack/run, a sibling of harness, and runDir's refusals pass it", () => {
    const w = world();
    const c = packContext(PACK_VARS, NOW, 'win32', w.exists, w.readText);
    expect(c.env.EPH_RUN_DIR).toBe('D:/Tester/SOCOM-Parity/pack/run');
    const plan = hostPlan(parseRunArgs(['--live', '--map', 'M51', '--state', '5', '--build', 'r0004']), c);
    expect(plan.layout.runDir).toBe('D:/Tester/SOCOM-Parity/pack/run');
    expect(plan.layout.outDir).toBe('D:/Tester/SOCOM-Parity/pack/run/runs/20261103T120000Z');
  });

  it('keeps an EPH_RUN_DIR given, and still refuses one inside the harness folder', () => {
    const w = world();
    const kept = packContext({ ...PACK_VARS, EPH_RUN_DIR: 'E:/runs' }, NOW, 'win32', w.exists, w.readText);
    expect(kept.env.EPH_RUN_DIR).toBe('E:/runs');
    const inside = packContext({ ...PACK_VARS, EPH_RUN_DIR: 'D:/Tester/SOCOM-Parity/pack/harness/run' }, NOW, 'win32', w.exists, w.readText);
    expect(() => hostPlan(parseRunArgs(['--live', '--map', 'M51']), inside)).toThrow(/inside the worktree/);
  });

  it('refuses a missing VERSION.json, a malformed one, and one missing a field, each in one line', () => {
    const missing = world(null);
    expect(() => packContext(PACK_VARS, NOW, 'win32', missing.exists, missing.readText)).toThrow(PackContextError);
    expect(() => packContext(PACK_VARS, NOW, 'win32', missing.exists, missing.readText)).toThrow(/^EPH pack: no VERSION.json at D:\/Tester\/SOCOM-Parity\/pack\/VERSION.json/);
    const bad = world('{ not json');
    expect(() => packContext(PACK_VARS, NOW, 'win32', bad.exists, bad.readText)).toThrow(/^EPH pack: .*VERSION.json is not JSON/);
    const short = world(JSON.stringify({ ...VERSION, pageSha: undefined }));
    expect(() => packContext(PACK_VARS, NOW, 'win32', short.exists, short.readText)).toThrow(/^EPH pack: .*VERSION.json has no string pageSha/);
    for (const f of [missing, bad, short]) {
      try { packContext(PACK_VARS, NOW, 'win32', f.exists, f.readText); } catch (err) { expect((err as Error).message).not.toContain('\n'); }
    }
  });

  it('refuses an EPH_PACK that is empty or not absolute', () => {
    const w = world();
    expect(() => packContext({ ...PACK_VARS, EPH_PACK: ' ' }, NOW, 'win32', w.exists, w.readText)).toThrow(/^EPH pack: EPH_PACK/);
    expect(() => packContext({ ...PACK_VARS, EPH_PACK: 'pack' }, NOW, 'win32', w.exists, w.readText)).toThrow(/^EPH pack: EPH_PACK must be an absolute path/);
  });

  it('readPackVersion reads the five fields', () => {
    const w = world();
    expect(readPackVersion('D:/Tester/SOCOM-Parity', w.exists, w.readText)).toEqual(VERSION);
  });
});

describe("hostDeps().pageBuild: EPH_PAGE_BUILD when set (the GUI sets it from VERSION.json), else git's", () => {
  it('returns EPH_PAGE_BUILD as given', () => {
    expect(hostDeps('win32', { EPH_PAGE_BUILD: 'v0.3.40 (abc1234)' }).pageBuild()).toBe('v0.3.40 (abc1234)');
  });

  it('falls back to git rev-parse when it is unset or blank', () => {
    const git = hostDeps('win32', { EPH_PAGE_BUILD: '  ' }).pageBuild();
    expect(git).toMatch(/^[0-9a-f]{7,}$/);
  });
});
