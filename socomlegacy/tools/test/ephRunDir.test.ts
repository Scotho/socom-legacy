import { describe, expect, it } from 'vitest';
import { RunDirError, checkRunDir, copyPlan, runLayout, utcStamp } from '../eph/runDir';

/**
 * The harness's run directory (EPH-2 step 3; the design note's EPH.R2): git-ignored data -- the PCSX2 copy with its
 * BIOS, its memory cards and save states, the run outputs -- kept outside every clone and worktree and outside the
 * desktop tree, which is read only. Pure: paths in, a layout or a refusal out.
 */
const W = {
  repo: 'C:/Projects/wt-eph-2',
  clones: ['C:/projects/redotcom'],
  worktreeParent: 'C:/Projects',
  desktop: 'C:/Projects/socom_pc',
};

describe('checkRunDir', () => {
  it('refuses an unset or empty EPH_RUN_DIR', () => {
    expect(() => checkRunDir(undefined, W)).toThrow(RunDirError);
    expect(() => checkRunDir('', W)).toThrow(/EPH_RUN_DIR is not set/);
  });

  it('refuses a relative path', () => {
    expect(() => checkRunDir('eph-run', W)).toThrow(/absolute/);
  });

  it('refuses the worktree, the clone, any wt-* sibling and the desktop tree, at or under them, in any case', () => {
    for (const p of [
      'C:/Projects/wt-eph-2', 'C:/Projects/wt-eph-2/socomlegacy/.eph', 'c:/projects/WT-EPH-2/x',
      'C:/projects/redotcom', 'C:/projects/redotcom/tmp/eph', 'C:/Projects/wt-other/run',
      'C:/Projects/socom_pc', 'C:/Projects/socom_pc/logs/eph',
    ]) {
      expect(() => checkRunDir(p, W), p).toThrow(RunDirError);
    }
  });

  it('takes a path outside them, normalised to forward slashes', () => {
    expect(checkRunDir('E:\\eph-runs', W)).toBe('E:/eph-runs');
    expect(checkRunDir('C:/Projects/eph-runs', W)).toBe('C:/Projects/eph-runs');
    expect(checkRunDir('C:/Projects/wt', W)).toBe('C:/Projects/wt');
    expect(checkRunDir('C:/Projects/socom_pc2', W)).toBe('C:/Projects/socom_pc2');
  });
});

describe('utcStamp', () => {
  it('is the UTC moment, sortable and path-safe', () => {
    expect(utcStamp(new Date(Date.UTC(2026, 9, 30, 21, 5, 9)))).toBe('20261030T210509Z');
  });
});

describe('runLayout and copyPlan', () => {
  const at = new Date(Date.UTC(2026, 9, 30, 21, 5, 9));

  it('lays out the PCSX2 copy, its ini and the run output folder', () => {
    expect(runLayout('E:/eph-runs', 'C:/Projects/socom_pc', at)).toEqual({
      runDir: 'E:/eph-runs',
      pcsx2Source: 'C:/Projects/socom_pc/tools/pcsx2',
      pcsx2Dir: 'E:/eph-runs/pcsx2',
      exe: 'E:/eph-runs/pcsx2/pcsx2-qt.exe',
      ini: 'E:/eph-runs/pcsx2/inis/PCSX2.ini',
      runsDir: 'E:/eph-runs/runs',
      outDir: 'E:/eph-runs/runs/20261030T210509Z',
    });
  });

  it('copies the whole PCSX2 folder only when the run has none, and refuses a missing source', () => {
    const l = runLayout('E:/eph-runs', 'C:/Projects/socom_pc', at);
    expect(copyPlan(l, (p) => p === l.pcsx2Source)).toEqual({ copy: true, from: l.pcsx2Source, to: l.pcsx2Dir, what: 'the whole folder' });
    expect(copyPlan(l, () => true)).toEqual({ copy: false, from: l.pcsx2Source, to: l.pcsx2Dir, what: 'already copied' });
    expect(() => copyPlan(l, () => false)).toThrow(/no PCSX2 at/);
  });
});
