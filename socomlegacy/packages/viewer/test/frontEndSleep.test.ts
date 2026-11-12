import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MovieEndMessage, MovieFrame, MovieStreamHandle } from '@s2u/fmv';
import { UI_TICK_SECONDS, type DialogDesign } from '@s2u/ui';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { frontEndMovies, type MovieWorkerHandle } from '../src/frontEndMovies';
import { menuRasterWanted, movieWorkerSleeps } from '../src/frontEndSleep';
import { pageDeviceClass, resetPageRendererProbeForTest } from '../src/deviceClass';
import type { UiCanvasTarget } from '../src/uiCompositorView';

/**
 * Browser adaptation (no original; product track): while a lobby-mounted match is up, the menus under it still tick (the
 * lobby and the match through the session's `advance`) but are not rasterized -- under every graphics preset (CPS H1,
 * owner row H397 = GM-24; PR #631 rested it under the Xbox preset alone) -- and, under the Xbox preset only, the movie
 * worker is ended when no movie is open. Fakes for the worker; nothing measured.
 */

const PRESETS = ['xbox', 'auto', 'webgl2', 'webgpu', '', 'a preset not yet named'];

describe('menuRasterWanted (the menus\' raster rests under a match on every preset: H397 / GM-24)', () => {
  it('skips the raster while a match is up, whatever the graphics preset', () => {
    for (const g of PRESETS) expect(menuRasterWanted(true, g)).toBe(false);
  });

  it('draws with no match up, whatever the graphics preset -- the menus as they always were', () => {
    for (const g of PRESETS) expect(menuRasterWanted(false, g)).toBe(true);
  });

  it('draws again on the first tick after the return', () => {
    expect(menuRasterWanted(false, 'auto')).toBe(true);
    expect(menuRasterWanted(false, 'xbox')).toBe(true);
  });
});

describe('movieWorkerSleeps (Xbox preset only; H397 leaves it: a worker asleep is a cold return to the menus)', () => {
  it('is the Xbox preset alone', () => {
    expect(movieWorkerSleeps('xbox')).toBe(true);
    for (const g of ['auto', 'webgl2', 'webgpu', '', 'a preset not yet named']) expect(movieWorkerSleeps(g)).toBe(false);
  });
});

/** VS-10 F1: a page the Xbox class by certain signals (VS.R1) -- the console's agent and ANGLE's D3D11 string -- with no pick saved. */
const asXboxPage = (): (() => void) => {
  const gl = { getExtension: () => null, getParameter: () => 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)', RENDERER: 0x1f01 };
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edg/130.0.2849.56' });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => gl }) });
  resetPageRendererProbeForTest();
  return () => { vi.unstubAllGlobals(); resetPageRendererProbeForTest(); };
};

describe('VS-10 F1 (the spec §4.4 item 2): the Xbox class sleeps the movie worker beside the saved pick', () => {
  it('the saved pick auto on a page classed xbox: the worker sleeps; the standard class: it does not', () => {
    const undo = asXboxPage();
    try {
      expect(pageDeviceClass()).toBe('xbox');
      expect(movieWorkerSleeps('auto')).toBe(true);
    } finally { undo(); }
    expect(pageDeviceClass()).toBe('standard');
    expect(movieWorkerSleeps('auto')).toBe(false);
  });
});

describe('the rest changes no state: the raster reads the session, it never writes what `advance` reads', () => {
  /** A stub disc (the `frontEnd.test.ts` rig): the opener's loader screens, then the game's boot on dlgIntroScreen. */
  const design = (): DialogDesign => ({
    libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
    bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
    controls: [], objects: [], scripts: [], models: [], dropped: [],
  });
  const disc: FrontEndDisc = {
    dialog: (n) => (n === 'dlgIntroScreen.rdr' || n === 'dlgMenu.rdr' ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [],
  };
  /** A cheap canvas target that counts its puts. */
  const target = (): UiCanvasTarget & { puts: number } => {
    const t = {
      puts: 0,
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => { t.puts++; },
    };
    return t;
  };

  it('two held sessions ticked alike, one rendered every tick and one rested, keep the same draw list and dialog each tick', () => {
    const drawn = new FrontEndSession({ disc }), rested = new FrontEndSession({ disc });
    drawn.holdMenus(true); rested.holdMenus(true);                // the match's `leave`: the menus held
    const t = target();
    let now = 0, nonEmpty = 0;
    drawn.advance(now); rested.advance(now);
    const TICKS = 120;                                             // past the loader's 96 ticks into the game's boot
    for (let i = 0; i < TICKS; i++) {
      now += 1000 * UI_TICK_SECONDS;
      expect(rested.advance(now)).toBe(drawn.advance(now));
      drawn.render(t);
      expect(rested.last).toEqual(drawn.last);
      expect(rested.opener.phase).toBe(drawn.opener.phase);
      expect(rested.machine.shell()?.currentName ?? null).toBe(drawn.machine.shell()?.currentName ?? null);
      if (drawn.last.length > 0) nonEmpty++;
    }
    expect(t.puts).toBe(TICKS);
    expect(nonEmpty).toBeGreaterThan(0);                           // the comparison saw drawn frames, not only empty ones
    expect(drawn.opener.phase).toBe('game');
  });
});

/** A fake worker factory: each make is a fresh handle; its streams answer `pending` until told otherwise. */
function workers() {
  const log = { made: 0, terminated: [] as number[], opened: [] as { worker: number; path: string }[], end: false };
  const make = (): MovieWorkerHandle => {
    const id = ++log.made;
    return {
      wasm: '/fmv/libmpeg2.wasm',
      terminate: () => { log.terminated.push(id); },
      client: {
        open: (path): MovieStreamHandle => {
          log.opened.push({ worker: id, path });
          return {
            tick: (): MovieFrame | MovieEndMessage | null => (log.end ? ({ kind: 'end', pictures: 0, error: null } as unknown as MovieEndMessage) : null),
            release: () => {},
            close: () => {},
          };
        },
      },
    };
  };
  return { log, make };
}

function movies() {
  const w = workers();
  const m = frontEndMovies({
    source: { kind: 'http', baseUrl: '/maps/' }, assets: { list: async () => [], read: async () => new Uint8Array(0) },
    worker: w.make, out: () => null, now: () => 0,
  });
  return { ...w, m };
}

describe('FrontEndMovies.sleep (the movie worker ended under a match when no movie is open)', () => {
  it('with no worker made, makes none and ends none', () => {
    const { log, m } = movies();
    expect(m.sleep()).toBe(true);
    expect(log.made).toBe(0);
    expect(log.terminated).toEqual([]);
  });

  it('leaves a worker whose movie is open (playing or pending) as it is', () => {
    const { log, m } = movies();
    expect(m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 })).toBe(true);
    m.source.next();
    expect(m.sleep()).toBe(false);
    expect(log.terminated).toEqual([]);
    m.source.next();                                           // the movie still ticks on the same worker
    expect(log.made).toBe(1);
  });

  it('leaves a worker whose movie reached its end but is still open (a loop restarts it)', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 });
    log.end = true;
    m.source.next();
    expect(m.sleep()).toBe(false);
    expect(log.terminated).toEqual([]);
  });

  it('ends the worker once its movie is closed, and the next open makes a fresh one', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/sony448.pss', { audioStream: 0 });
    m.source.close();
    expect(m.sleep()).toBe(true);
    expect(log.terminated).toEqual([1]);
    expect(m.sleep()).toBe(true);                              // a second sleep ends nothing more
    expect(log.terminated).toEqual([1]);
    m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 });
    expect(log.made).toBe(2);
    expect(log.opened.at(-1)).toEqual({ worker: 2, path: 'RUN/MOVIES/COMMON/MENULOOP.PSS' });
    m.stop();
    expect(log.terminated).toEqual([1, 2]);
  });

  it('a restart of a closed movie after the sleep opens on a fresh worker', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/menuloop.pss', { audioStream: 0 });
    m.source.close();
    m.sleep();
    m.source.restart();
    expect(log.made).toBe(2);
    expect(log.opened.at(-1)?.worker).toBe(2);
  });

  it('a movie opened and superseded by another stays open', () => {
    const { log, m } = movies();
    m.source.open('run/movies/common/sony448.pss', { audioStream: 0 });
    m.source.open('run/movies/common/intro_2.pss', { audioStream: 0 });
    expect(m.sleep()).toBe(false);
    expect(log.terminated).toEqual([]);
  });
});

describe('the page\'s wiring (frontEnd.ts)', () => {
  const src = readFileSync(new URL('../src/frontEnd.ts', import.meta.url), 'utf8');

  it('the loop keeps advancing and asks menuRasterWanted before the render', () => {
    const loop = src.slice(src.indexOf('const step = (now: number): boolean => {'));
    const body = loop.slice(0, loop.indexOf('const frontGuard = new FrameGuard();'));
    // GM-02: the advance's tick count is kept in `ticks` (the instrument reads it); GM-12b: the GPU path's word (GM.R17).
    expect(body).toMatch(/const ticks = s\.advance\(now\);[\s\S]*?if \(ticks > 0 && drawsMenuFrame\(s, hd\.scale, gpu\) && menuRasterWanted\(matchUp, matchGraphics\)\)/);
  });

  it('leave raises the flag and sleeps the movie worker under the Xbox preset; returned lowers the flag', () => {
    // QUAD-CACHE-RELEASE put the quad caches' release first on the line: the match's leave hook is the one line that also
    // lets the match sound go, wherever on it.
    const leave = src.split('\n').filter((l) => /^\s*leave: \(\) => \{[^\n]*\bmatchSound\.leave\(\);/.test(l));
    expect(leave).toHaveLength(1);
    expect(leave[0]).toContain('matchUp = true;');
    expect(leave[0]).toContain('matchGraphics = readGraphicsBackend(); if (movieWorkerSleeps(matchGraphics)) movies?.sleep();');
    const returned = src.split('\n').filter((l) => /^\s*returned: \(\) => \{ roundLine = null;/.test(l));
    expect(returned).toHaveLength(1);
    expect(returned[0]).toContain('matchUp = false;');
  });
});
