import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { BlackPictureSource, MOVIE_PICTURE_COUNTS, type BlackPicture, type MovieNext, type MoviePictureSource, type MovieOpenOptions } from '@s2u/fmv';
import { Zar } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets } from '@s2u/scene';
import { UI_TICK_SECONDS, type OpenerEvent } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc, type FrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { withMenuArt } from '../../packages/viewer/src/menuArt';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';

/**
 * BOOT-06's hand-off (web research 141): the boot's last switch into `dlgMenu` over `menuloop.pss`, read off the disc
 * and run through the page's path (`FrontEndSession`, the disc's dialogs, sets and art; the movie the black stand-in,
 * which counts the disc's pictures). Three things, kept apart:
 *
 * - **the decoded facts** (reading): `dlgMenu`'s background is `TYPE MPEG` (1), not `MPEG_LOOPING` (2), so the shell
 *   does not restart MENULOOP (research 121 R121.5); `menu_fade_up` is `UIanim.rdr`'s MENUFADER 1 -> 0 in 1.5 s,
 *   auto-started; `UiStopAttract` waits 120 s and `UiAttractMode` fades 0.5 s and switches to `dlgAttractCinematic`,
 *   so an idle menu leaves MENULOOP 4 s before its last picture (3,732 at 29.97/s = 124.5 s);
 * - **the hand-off on the page's path** (reading, research 141 §2): from the key that skips Intro_2, the fade to
 *   black, the build, `menu_fade_up` and `SetMenuValve`'s fades together on MENUFADER -- under 0 for a second -- and
 *   the frame whole from the build's own tick all the same: the fader is untextured, so it draws with the blend the
 *   roller's textures bound, the additive one, and black added is nothing (MENU-FADE, 2026-10-03; until then the page
 *   drew a lit ramp, a second of black with one lit frame in it, and the menu at 1.5 s) -- and the console's burst
 *   across the same key (`logs/parity/runs/mb10_pcsx2/s06_burst_*`, PCSX2): black, then the menu whole, no lit frame
 *   between; its black is the build's own time on the disc (`menuEntryFadeDisc.test.ts` scores the frames);
 * - **the seam**: the idle session switches to the attract before MENULOOP's last picture and never restarts it.
 *
 * Skips without the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`); the burst comparison skips, naming the file,
 * without the PCSX2 run under `SOCOM_PC_ROOT/logs/parity/runs/mb10_pcsx2`.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(d, 'RUN/UI/UI_GEO.ZED'))) ?? null;
const BURST = ROOT ? resolve(ROOT, 'logs/parity/runs/mb10_pcsx2') : null;
const HAVE_BURST = BURST !== null && existsSync(resolve(BURST, 's06_burst_010.png'));
const MENULOOP = 'run/movies/common/menuloop.pss';

/** The black stand-in, counting: each movie's last presented picture, and every restart. */
class CountingSource implements MoviePictureSource<BlackPicture> {
  private readonly inner = new BlackPictureSource();
  name = '';
  last = -1;
  restarts = 0;
  readonly opened: string[] = [];
  open(name: string, o: MovieOpenOptions): boolean { this.name = name.toLowerCase(); this.last = -1; this.opened.push(this.name); return this.inner.open(name, o); }
  next(): MovieNext<BlackPicture> { const n = this.inner.next(); if (typeof n === 'object') this.last = n.index; return n; }
  restart(): void { this.restarts++; this.inner.restart(); }
  close(): void { this.inner.close(); }
}

const mean = (f: Rgb): number => { let s = 0; for (let i = 0; i < f.data.length; i++) s += f.data[i]!; return s / f.data.length; };
const target = () => {
  const t = { frame: null as Rgb | null, createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }) => { t.frame = rgbaToRgb(img.width, img.height, img.data); } };
  return t;
};

describe.skipIf(DISC === null)(`the boot -> MENU hand-off on the disc${DISC === null ? ' (no disc)' : ''}`, () => {
  let disc: FrontEndDisc;
  beforeAll(async () => {
    const src = new FsAssetSource(DISC!);
    disc = await withMenuArt(src, await readFrontEndDisc(src));
  }, 120_000);

  it('decodes the hand-off: dlgMenu over menuloop.pss as TYPE MPEG (1, no loop); menu_fade_up 1 -> 0 in 1.5 s; the attract 120 s + 0.5 s, before MENULOOP\'s 124.5 s', () => {
    expect(disc.dialog('dlgMenu.rdr')!.background).toMatchObject({ type: 1, filename: MENULOOP });
    expect(MOVIE_PICTURE_COUNTS[MENULOOP]).toBe(3732);
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
    const raw = (set: string, name: string) => sets.find((s) => s.name === set)!.anims.find((a) => a.name === name)!;
    const anim = (set: string, name: string) => decodeUiProgram(raw(set, name));
    const fade = raw('UIanim.rdr', 'menu_fade_up');
    expect(fade.params.flags & 7).toBe(1);                                         // starts with its set (activation 1)
    expect(anim('UIanim.rdr', 'menu_fade_up').sequences.map((q) => q.ops)).toEqual([[{ op: 'opacity', node: 'MENUFADER', from: 1, to: 0, rate: Math.fround(-2 / 3), seconds: 1.5 }]]);
    const stop = anim('dlgMenu.rdr', 'UiStopAttract').sequences[0]!.ops;
    expect(stop.map((o) => o.op)).toEqual(['stopAnimation', 'wait', 'ui', 'call']);
    expect(stop[1]).toEqual({ op: 'wait', seconds: 120 });
    const attract = anim('dlgMenu.rdr', 'UiAttractMode').sequences[1]!.ops;
    expect(attract.find((o) => o.op === 'opacity')).toMatchObject({ node: 'MENUFADER', from: 0, to: Math.fround(0.99), seconds: 0.5 });
    expect(attract.find((o) => o.op === 'wait')).toEqual({ op: 'wait', seconds: 0.5 });
    expect(attract.some((o) => o.op === 'ui' && o.command.fn === 'SWITCHMENU' && o.command.arg === 'dlgAttractCinematic.rdr')).toBe(true);
    expect(120 + 0.5).toBeLessThan(3732 * UI_TICK_SECONDS);                         // 124.5 s: the idle menu leaves first
  });

  describe('the fade-up from the key that skips Intro_2', () => {
    const rows: { tick: number; dialog: string; fader: number; mean: number }[] = [];
    let pressTick = -1, buildTick = -1;
    beforeAll(() => {
      const events: OpenerEvent[] = [];
      const source = new CountingSource();
      const s = new FrontEndSession({ disc, source, onEvent: (e) => events.push(e) });
      let now = 0;
      s.advance(now);
      for (let tick = 1; tick < 1200 && (buildTick < 0 || tick < buildTick + 80); tick++) {
        s.advance(now += 1000 * UI_TICK_SECONDS);
        const g = s.machine.shell();
        if (pressTick < 0 && source.name === 'run/movies/intro_2.pss' && source.last >= 33) { pressTick = tick; s.press('CROSS'); }
        if (buildTick < 0 && events.some((e) => e.kind === 'dialog' && e.name === 'dlgMenu.rdr')) buildTick = tick;
        if (pressTick >= 0) {
          const t = target();
          s.render(t as never);
          rows.push({ tick, dialog: g?.currentName ?? '', fader: g?.screen.fader.opacity ?? NaN, mean: mean(t.frame!) });
        }
      }
    }, 120_000);

    it('builds dlgMenu after the switch\'s fade and countdown; MENUFADER goes under 0 (the two fades summed) and the menu is whole from the build\'s own tick: the fader adds nothing after the roller\'s bind', () => {
      expect(pressTick).toBeGreaterThan(0);
      expect(buildTick - pressTick).toBe(17);   // the switch's fade from where Intro_2's own menu_fade_up had MENUFADER (0.24), the countdown, the dispatch
      const after = (k: number) => rows.find((r) => r.tick === buildTick + k)!;
      const lit = (k: number) => after(k).mean > 20;
      // The switch itself is black: the fader covers Intro_2 (no texture bound in that dialog: the blend is the source one).
      for (const r of rows.filter((x) => x.tick > pressTick + 12 && x.tick < buildTick)) expect(r.mean, `build - ${buildTick - r.tick}`).toBeLessThan(0.5);
      // menu_fade_up and SetMenuValve's fade lower MENUFADER together, under 0 from the 16th tick on -- as before.
      expect(after(0).fader).toBe(1);
      expect(after(8).fader).toBeGreaterThan(0);
      expect(after(16).fader).toBeLessThan(0);
      expect(after(23).fader).toBe(0);                                               // SetMenuValve's end writes its 0 for one tick
      expect(after(44).fader).toBeLessThan(0);
      expect(after(45).fader).toBe(0);                                               // menu_fade_up's end, 1.5 s after the build
      // The frame: lit on every tick from the build, where it was a ramp to the 15th, black from the 16th to the 44th
      // but for the 23rd, and whole from the 45th (2.07 s after the key). The build's own frame is the dialog as its
      // file has it (LoadGameBack's popup_bg whole, every roller item lit, mean 34.0); the menu over the black stand-in
      // is 20.6 .. 25.2. The 34.0 is the page's own frame, no value of the original's: GM-15d (b92e2008f) drew the 3D
      // pass's models by the GS's top-left fill rule and ZTST GEQUAL on an f32 depth (UI_MODEL_EDGE_RULE_READING,
      // UI_MODEL_DEPTH_FORMAT_READING; research 380 §4), which moved this frame from 33.896 to 34.009 (33.9 before it).
      for (let k = 0; k < 62; k++) expect(lit(k), `build + ${k}: fader ${after(k).fader}, mean ${after(k).mean}`).toBe(true);
      expect(Math.round(after(0).mean * 10) / 10).toBe(34);
      // From the key to the menu whole: the 17 ticks of the switch, 0.57 s (2.07 s until MENU-FADE).
      expect(Math.round((buildTick - pressTick) * UI_TICK_SECONDS * 100) / 100).toBe(0.57);
    });

    it.skipIf(!HAVE_BURST)(`against the console's burst across the same key (PCSX2 mb10, s06_burst_000..012)${HAVE_BURST ? '' : ' -- no logs/parity/runs/mb10_pcsx2'}`, () => {
      const burst = (k: number): number => mean(decodePng(new Uint8Array(readFileSync(resolve(BURST!, `s06_burst_${String(k).padStart(3, '0')}.png`)))));
      // burst_000 is Intro_2's dark opening as the key goes in; nine black frames; the menu whole from burst_010 on.
      expect(burst(0)).toBeGreaterThan(0.5);
      for (let k = 1; k <= 9; k++) expect(burst(k), `burst_${k}`).toBeLessThan(0.5);
      for (let k = 10; k <= 12; k++) expect(burst(k), `burst_${k}`).toBeGreaterThan(25);
      // The console's nine black frames are its build of dlgMenu -- about 1.5 s of the disc, which the page does not
      // spend (ours builds 0.57 s after the key) -- and from burst_010, the build's own frame, it is whole: no ramp, no
      // black after it, as ours now (research 141 §3; `menuEntryFadeDisc.test.ts` scores ours against burst_010 .. 016).
      expect(rows.filter((r) => r.tick >= buildTick).every((r) => r.mean > 20)).toBe(true);
    });
  });

  it('idle on the menu, switches to the attract before MENULOOP\'s last picture and never restarts it (no seam: TYPE MPEG, research 121 §5)', () => {
    const events: OpenerEvent[] = [];
    const source = new CountingSource();
    const s = new FrontEndSession({ disc, source, startDialog: 'dlgMenu.rdr', loader: false, onEvent: (e) => events.push(e) });
    let now = 0, last = -1, at = -1;
    for (let tick = 1; tick <= 3800 && at < 0; tick++) {
      s.advance(now += 1000 * UI_TICK_SECONDS);
      if (source.name === MENULOOP) last = source.last;
      if (events.some((e) => e.kind === 'dialog' && e.name === 'dlgAttractCinematic.rdr')) at = tick;
    }
    expect(at).toBeGreaterThan(0);
    expect(Math.round(at * UI_TICK_SECONDS)).toBe(121);                               // the 120 s wait, the 0.5 s fade, the switch
    expect(last).toBeLessThan(3731);                                                  // MENULOOP's last picture never shown
    expect(last).toBeGreaterThan(3550);
    expect(source.restarts).toBe(0);
    expect(source.opened).toEqual([MENULOOP, 'run/movies/intro_2.pss']);
  }, 120_000);

  it('held on the menu past the last picture of MENULOOP (the attract wait kept off): the movie ends once, is closed, not restarted; the layer keeps picture 3,731', () => {
    // The original reaches this when the attract's 120 s keeps being restarted (the LOAD GAME list's `CancelLoadGame` /
    // `LoadGameOnListBox`, or `UiAttractMode`'s else-branch: research 141 section 1). Here the restart is stood in for by
    // building dlgMenu without its ONSTART `UiStopAttract` -- a test view of the disc, the rest of the dialog unchanged -- so
    // the run isolates the end of a `TYPE MPEG` background: FUN_00366940's end tick (event 3, then the close, not the
    // restart: D:L262888-262895), and the layer holding the last picture it was given (MOVIE_HOLD_READING).
    const dlgMenu = disc.dialog('dlgMenu.rdr')!;
    const held: FrontEndDisc = {
      ...disc,
      dialog: (n) => (n.toLowerCase() === 'dlgmenu.rdr' ? { ...dlgMenu, bindings: dlgMenu.bindings.filter((b) => b.animation !== 'UiStopAttract') } : disc.dialog(n)),
    };
    expect(held.dialog('dlgMenu.rdr')!.bindings.length).toBe(dlgMenu.bindings.length - 1);
    const events: OpenerEvent[] = [];
    const source = new CountingSource();
    const s = new FrontEndSession({ disc: held, source, startDialog: 'dlgMenu.rdr', loader: false, onEvent: (e) => events.push(e) });
    let now = 0, endTick = -1;
    for (let tick = 1; tick <= 3900; tick++) {
      s.advance(now += 1000 * UI_TICK_SECONDS);
      if (endTick < 0 && s.movie.background.state === 'STOPPED') endTick = tick;
    }
    expect(s.machine.shell()!.currentName).toBe('dlgMenu.rdr');
    expect(events.some((e) => e.kind === 'dialog' && e.name !== 'dlgMenu.rdr')).toBe(false);
    expect(source.last).toBe(3731);                                                   // every picture shown, the last 3,731
    expect(source.restarts).toBe(0);                                                  // no seam: not restarted (loop flag 0)
    expect(source.opened).toEqual([MENULOOP]);                                        // nor re-opened
    expect(s.movie.background.loop).toBe(false);
    expect(endTick).toBeGreaterThan(3732);                                            // closed after its last picture, once
    expect(s.movie.background.state).toBe('STOPPED');
    expect((s.layer.picture()?.image as BlackPicture | undefined)?.index).toBe(3731);   // the layer holds the last (black) picture
  }, 120_000);
});
