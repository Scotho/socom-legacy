// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { FRAME_REPORTS_CAP_ADAPTATION, FRAME_THROWS_NOTICE_ADAPTATION, FrameGuard, reportFrameError } from '../src/frameGuard';
import { resetGraphicsRecordForTest, watchGraphicsLost } from '../src/graphicsLost';

/**
 * FRAME-LOOP-GUARD (LATER 859; `../src/frameGuard`; product track, a browser adaptation). Shadow's X3 bench at
 * 6343231f0: one failed WebGPU upload threw out of the match's frame, and the match froze on a black screen for good,
 * START dead and no notice -- the frame asked for the next one only on its last line (`matchMount.ts`), and the menus'
 * loop the same way (`frontEnd.ts`).
 */

const src = (name: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', name), 'utf8');

describe('FRAME-LOOP-GUARD: a frame that throws does not end its loop', () => {
  it('a frame that runs: the body decides the next frame, nothing reported', () => {
    const report = vi.fn(), notice = vi.fn();
    const g = new FrameGuard({ report, notice });
    expect(g.frame(() => true, () => true)).toBe(true);
    expect(g.frame(() => false, () => true)).toBe(false);   // the body's own stop (gone, a prepared match at its gate)
    expect(report).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
  });

  it('a frame that throws: reported, and the loop goes on while the owner is alive', () => {
    const report = vi.fn(), notice = vi.fn();
    const g = new FrameGuard({ report, notice });
    const boom = new Error('createBuffer failed');
    expect(g.frame(() => { throw boom; }, () => true)).toBe(true);
    expect(report).toHaveBeenCalledWith(boom);
    expect(g.frame(() => { throw boom; }, () => false)).toBe(false);   // torn down meanwhile: no next frame
    expect(notice).not.toHaveBeenCalled();
  });

  it('a run of throwing frames: the first reported, the notice at the limit, once; a good frame ends the run', () => {
    const report = vi.fn(), notice = vi.fn();
    const g = new FrameGuard({ report, notice });
    const errs = Array.from({ length: FRAME_THROWS_NOTICE_ADAPTATION + 3 }, (_, i) => new Error(`e${i}`));
    for (const e of errs) expect(g.frame(() => { throw e; }, () => true)).toBe(true);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(errs[0]);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledWith(errs[FRAME_THROWS_NOTICE_ADAPTATION - 1]);
    expect(g.frame(() => true, () => true)).toBe(true);
    const later = new Error('later');
    g.frame(() => { throw later; }, () => true);
    expect(report).toHaveBeenCalledTimes(2);                // a new run is reported
    for (let i = 0; i < FRAME_THROWS_NOTICE_ADAPTATION; i++) g.frame(() => { throw later; }, () => true);
    expect(notice).toHaveBeenCalledTimes(1);                // the notice stays up: shown once a page
  });

  it('the default report hands the error to the page (an error event: the client error beacon and the console see it)', () => {
    const seen: unknown[] = [];
    const on = (e: ErrorEvent): void => { seen.push(e.error); e.preventDefault(); };
    window.addEventListener('error', on);
    try {
      const boom = new Error('reported');
      reportFrameError(boom);
      expect(seen).toContain(boom);
    } finally { window.removeEventListener('error', on); }
  });

  it('the default notice is graphicsLost\'s Reload notice', () => {
    const g = new FrameGuard({ report: () => undefined });
    for (let i = 0; i < FRAME_THROWS_NOTICE_ADAPTATION; i++) g.frame(() => { throw new Error('stuck'); }, () => true);
    const el = document.querySelector('[data-graphics-lost]');
    expect(el?.textContent).toMatch(/Graphics stopped at .*stuck.*Reload the page to continue\./);
  });
});

describe('FRAME-LOOP-GUARD review folds', () => {
  it('F1: a lost device\'s notice is not replaced -- the frame notice is skipped while the record holds a loss', () => {
    resetGraphicsRecordForTest();
    document.querySelectorAll('[data-graphics-lost]').forEach((e) => e.remove());
    const renderer = { onDeviceLost: (_: never): void => undefined };
    watchGraphicsLost(renderer, document);
    (renderer.onDeviceLost as unknown as (i: { api: string; message: string; reason: string }) => void)({ api: 'WebGPU', message: 'D3D12 device removed', reason: 'unknown' });
    const g = new FrameGuard({ report: () => undefined });
    for (let i = 0; i < FRAME_THROWS_NOTICE_ADAPTATION; i++) g.frame(() => { throw new Error('after the loss'); }, () => true);
    expect(document.querySelector('[data-graphics-lost]')?.textContent).toContain('D3D12 device removed');
    resetGraphicsRecordForTest();
  });

  it('F2: the frame notice is taken down when frames draw again, and may show again on a later stuck run', () => {
    resetGraphicsRecordForTest();
    document.querySelectorAll('[data-graphics-lost]').forEach((e) => e.remove());
    const g = new FrameGuard({ report: () => undefined });
    const stuck = (): void => { for (let i = 0; i < FRAME_THROWS_NOTICE_ADAPTATION; i++) g.frame(() => { throw new Error('stuck'); }, () => true); };
    stuck();
    expect(document.querySelector('[data-graphics-lost]')).not.toBeNull();
    g.frame(() => true, () => true);
    expect(document.querySelector('[data-graphics-lost]')).toBeNull();
    stuck();
    expect(document.querySelector('[data-graphics-lost]')).not.toBeNull();
    document.querySelectorAll('[data-graphics-lost]').forEach((e) => e.remove());
  });

  it('F3: a throw that alternates with good frames is reported at most FRAME_REPORTS_CAP_ADAPTATION times a guard', () => {
    const report = vi.fn();
    const g = new FrameGuard({ report, notice: () => undefined });
    for (let i = 0; i < FRAME_REPORTS_CAP_ADAPTATION * 3; i++) {
      g.frame(() => { throw new Error(`flap ${i}`); }, () => true);
      g.frame(() => true, () => true);
    }
    expect(report).toHaveBeenCalledTimes(FRAME_REPORTS_CAP_ADAPTATION);
  });
});

describe('FRAME-LOOP-GUARD: both loops ask for their next frame through the guard', () => {
  it('the match: its body is `step`, the frame asks for the next only through the guard', () => {
    const mm = src('matchMount.ts');
    expect(mm).toContain("import { FrameGuard } from './frameGuard';");
    expect(mm).toMatch(/const step = \(now: number\): boolean => \{/);
    expect(mm).toMatch(/if \(frameGuard\.frame\(\(\) => step\(now\), \(\) => !gone && \(attached \|\| !readyTold\)\)\) frameId = win\.requestAnimationFrame\(frame\);/);
    expect(mm.match(/requestAnimationFrame\(frame\)/g)).toHaveLength(3);   // the guard's, the first frame's, an attach's resume
  });

  it('the menus: their body is `step`, the loop asks for the next only through the guard', () => {
    const fe = src('frontEnd.ts');
    expect(fe).toContain("import { FrameGuard } from './frameGuard';");
    expect(fe).toMatch(/const step = \(now: number\): boolean => \{/);
    expect(fe).toMatch(/if \(frontGuard\.frame\(\(\) => step\(now\), \(\) => running\)\) frameId = win\.requestAnimationFrame\(loop\);/);
    expect(fe.match(/requestAnimationFrame\(loop\)/g)).toHaveLength(2);    // the guard's and the first frame's
  });
});
