import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Reader, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { BlackPictureSource, MovieDecoder, demuxPssFile, type BlackPicture, type MovieNext, type MoviePictureSource, type MovieOpenOptions } from '@s2u/fmv';
import { decodeUiProgram, parseAnimSets } from '@s2u/scene';
import { UI_TICK_SECONDS, type MoviePicture, type OpenerEvent, type UiDrawItem } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc, type FrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { withMenuArt } from '../../packages/viewer/src/menuArt';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge } from '../captureScore';
import { engineFromFile } from '../fmv-spike';
import { NodeMovieSource, type NodeMovieFrame } from '../nodeMovieSource';

/**
 * MENU-FADE (web research 141 §2-§3, rewritten 2026-10-03): what the main menu's entry draws. The owner's report was
 * a black flicker as `dlgMenu` loads in; the page drew the two fades on MENUFADER (`menu_fade_up` and `SetMenuValve`'s)
 * as a lit ramp, a second of black, one lit frame, black again. Three things, kept apart:
 *
 * - **the decoded facts** (reading): the opacity op adds its rate times dt each tick and writes its target at its end
 *   (`FUN_0025f880` D:L108804-108831), so the two programs do sum and MENUFADER does go under 0 -- that half of the
 *   page was right; and every texture of the menu's libraries binds `ALPHA_1` 0x44 but the roller's twelve, which bind
 *   0x48, the additive blend (the bind packet at the end of each texture record: tag, ALPHA_1, TEX1_1, TEX0_1, TEST_1,
 *   CLAMP_1; `selectQwc` 6);
 * - **the replay on the page's path** (reading): the opacity per tick as the op makes it, and the frame -- lit from
 *   the build's own tick on, the black fader adding nothing after the roller's bind, at any alpha;
 * - **the console** (proven: a capture, PCSX2 `logs/parity/runs/mb10_pcsx2/s06_burst_*`): burst_010 is the build's own
 *   frame (the design state: `LoadGameBack`'s popup_bg under the logo, every roller item lit, the fader's 128 changing
 *   nothing), burst_011 .. 016 the menu over MENULOOP's pictures 2, 9, 16, 22, 29, 36, undimmed. The page's frames are
 *   scored against them by the gate's rule (`judge`). And the other case, a fader that does show: on
 *   `dlgSecondCinematic`, which binds no texture at all, eight PCSX2 captures of Intro_2's opening are its picture k
 *   dimmed as `menu_fade_up`'s k-th tick leaves MENUFADER -- one fade, the source blend, the packed alpha.
 *
 * Skips without the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`); the console's half skips, naming what is
 * missing, without the PCSX2 run under `SOCOM_PC_ROOT` or the built decoder (`S2U_FMV_WASM`).
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(d, 'RUN/UI/UI_GEO.ZED'))) ?? null;
const BURST = ROOT ? resolve(ROOT, 'logs/parity/runs/mb10_pcsx2') : null;
const HAVE_BURST = BURST !== null && existsSync(resolve(BURST, 's06_burst_016.png'));
const WASM = process.env.S2U_FMV_WASM ?? resolve(import.meta.dirname, '../../packages/fmv/wasm/out/libmpeg2.wasm');
const HAVE_WASM = existsSync(WASM);
/**
 * PCSX2 captures taken while Intro_2 opens (each run's step before the key that skips it: drive.py waits for a settled
 * screen, so the moment differs run by run), with the picture and the brightness found here (2026-10-03).
 */
const INTRO_CAPTURES: readonly [string, number, number][] = [
  ['mb10_pcsx2', 10, 0.24], ['pcsx2_mission_b', 9, 0.21], ['pcsx2_mission_c', 12, 0.28], ['pcsx2_mission_e', 11, 0.26],
  ['pcsx2_mission_f', 13, 0.31], ['pcsx2_mission_g', 11, 0.26], ['pcsx2_title1', 6, 0.18], ['transition_pcsx2', 6, 0.14],
];
const intro = (run: string): string => resolve(ROOT ?? '', `logs/parity/runs/${run}/s05_CROSS.png`);   // each one listed in workflow/handoff/include.json
const HAVE_INTRO = ROOT !== null && INTRO_CAPTURES.every(([run]) => existsSync(intro(run)));

/** The libraries `dlgMenu` draws from: its `LIBRARIES` (ui2d, uibf), the font's, the UI models'. */
const LIBRARIES = ['RUN/UI/UI2D_TXR.ZED', 'RUN/UI/UIBF_TXR.ZED', 'RUN/UI/UI_TXR.ZED', 'RUN/COMMON/FONT_TXR.ZED'] as const;
/** GS register ids of a bind packet's A+D block, in the order every one of them holds. */
const BIND_REGISTERS = [0x0e, 0x42, 0x14, 0x06, 0x47, 0x08];   // the GIF tag's register list (A+D), ALPHA_1, TEX1_1, TEX0_1, TEST_1, CLAMP_1
const ROLLER_TEXTURES = ['newgame', 'loadgame', 'online', 'LAN', 'options', 'extras'].flatMap((n) => [`menu_${n}_on.tif`, `menu_${n}_off.tif`]);

/** A texture record's bind packet (research 36 §5): after the 16-byte header, the 16-byte prefix and the pixels. */
function bindPacket(texdat: Uint8Array): { selectQwc: number; registers: number[]; alpha: number | null } {
  const r = new Reader(texdat);
  const at = 32 + r.u32(4);
  const registers: number[] = [];
  let alpha: number | null = null;
  for (let o = at + 16; o + 16 <= Math.min(at + 7 * 16, texdat.length); o += 16) {   // the first quadword is the DMA tag's place, zero on the disc
    const id = Number(r.u64(o + 8) & 0xffn);
    registers.push(id);
    if (id === 0x42) alpha = Number(r.u64(o) & 0xffn);
  }
  return { selectQwc: (r.u32(12) >>> 8) & 0xff, registers, alpha };
}

/** The black stand-in, counting each movie's last presented picture (as `menuHandoffDisc.test.ts`'s). */
class CountingSource implements MoviePictureSource<BlackPicture> {
  private readonly inner = new BlackPictureSource();
  name = '';
  last = -1;
  open(name: string, o: MovieOpenOptions): boolean { this.name = name.toLowerCase(); this.last = -1; return this.inner.open(name, o); }
  next(): MovieNext<BlackPicture> { const n = this.inner.next(); if (typeof n === 'object') this.last = n.index; return n; }
  restart(): void { this.inner.restart(); }
  close(): void { this.inner.close(); }
}

const mean = (f: Rgb): number => { let s = 0; for (let i = 0; i < f.data.length; i++) s += f.data[i]!; return s / f.data.length; };
/** A frame as an 80 x 56 grid of mean brightness (`channels` bytes a pixel), for a least-squares match of two frames of different heights. */
function grid(width: number, height: number, data: ArrayLike<number>, channels: number): Float64Array {
  const GW = 80, GH = 56, g = new Float64Array(GW * GH), n = new Float64Array(GW * GH);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(GH - 1, Math.floor((y * GH) / height));
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels, i = gy * GW + Math.min(GW - 1, Math.floor((x * GW) / width));
      g[i] = g[i]! + (data[o]! + data[o + 1]! + data[o + 2]!) / 3;
      n[i] = n[i]! + 1;
    }
  }
  for (let i = 0; i < g.length; i++) g[i] = g[i]! / n[i]!;
  return g;
}
const drawn = (s: { render(t: never): unknown }): Rgb => {
  let frame: Rgb | null = null;
  s.render({ createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }) => { frame = rgbaToRgb(img.width, img.height, img.data); } } as never);
  return frame!;
};

interface Row { k: number; fader: number; mean: number }

describe.skipIf(DISC === null)(`dlgMenu's entry: the two fades, the roller's additive bind, the frame${DISC === null ? ' (no disc)' : ''}`, () => {
  let disc: FrontEndDisc;
  /** The two fade ops as the disc holds them: from, to, rate (a second), seconds. */
  let up: { from: number; to: number; rate: number; seconds: number };
  let valve: { from: number; to: number; rate: number; seconds: number };
  beforeAll(async () => {
    const src = new FsAssetSource(DISC!);
    disc = await withMenuArt(src, await readFrontEndDisc(src));
    const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/UIZANIM.ZAR'))))).sets;
    const ops = (set: string, name: string) => decodeUiProgram(sets.find((s) => s.name === set)!.anims.find((a) => a.name === name)!).sequences.map((q) => q.ops);
    const fade = (o: unknown) => o as { op: string; node: string; from: number; to: number; rate: number; seconds: number };
    up = fade(ops('UIanim.rdr', 'menu_fade_up')[0]![0]);
    valve = fade(ops('dlgMenu.rdr', 'SetMenuValve')[0]!.find((o) => o.op === 'opacity'));
  }, 120_000);

  /**
   * MENUFADER k ticks after the build, as `FUN_0025f880` makes it (D:L108804-108831): each running op adds its rate
   * times the tick's step, an op whose time is under the step plus what it has consumed writes its target instead;
   * a begin (`FUN_0025f960` D:L108835-108848) writes the op's `from`. The scheduler is in start order (research 106
   * §2): `menu_fade_up` (started with its set) before `SetMenuValve` (the ONSTART), as the desktop's call trace of the
   * recompiled game lists them (`desktop@be557831:docs/archive/STATUS-log-to-2026-09-26.md:2478`).
   */
  const derived = (k: number): number => {
    const dt = UI_TICK_SECONDS;
    let o = 1;                                                                     // the node's own opacity until a script writes it
    let upLeft = true, valveLeft = true;
    for (let t = 1; t <= k; t++) {
      if (upLeft) {
        if (t === 1) o = up.from;
        if (up.seconds < dt + (t - 1) * dt) { o = up.to; upLeft = false; } else o += up.rate * dt;
      }
      if (valveLeft) {
        if (t === 1) o = valve.from;
        if (valve.seconds < dt + (t - 1) * dt) { o = valve.to; valveLeft = false; } else o += valve.rate * dt;
      }
    }
    return o;
  };

  it('decodes the two fades on MENUFADER and the binds: ALPHA_1 0x48 on the roller\'s twelve textures, 0x44 on the other 122 of the menu\'s libraries', () => {
    expect(up).toEqual({ op: 'opacity', node: 'MENUFADER', from: 1, to: 0, rate: Math.fround(-2 / 3), seconds: 1.5 });
    expect(valve).toEqual({ op: 'opacity', node: 'MENUFADER', from: Math.fround(0.99), to: 0, rate: Math.fround(-1.32), seconds: 0.75 });
    const tally = new Map<number, string[]>();
    for (const file of LIBRARIES) {
      const zar = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, file))));
      for (const key of zar.find('textures')?.children ?? []) {
        const texdat = zar.child(key, 'texdat');
        if (!texdat) continue;
        const bind = bindPacket(zar.data(texdat));
        expect(bind.selectQwc, key.name).toBe(6);                                   // the whole block goes with a bind
        expect(bind.registers, key.name).toEqual(BIND_REGISTERS);
        tally.set(bind.alpha!, [...(tally.get(bind.alpha!) ?? []), key.name]);
      }
    }
    expect([...tally.keys()].sort()).toEqual([0x44, 0x48]);
    expect(tally.get(0x44)!.length).toBe(122);
    expect(tally.get(0x48)!.slice().sort()).toEqual(ROLLER_TEXTURES.slice().sort());
  });

  it('the page\'s bitmaps carry the bind\'s blend; the roller\'s quads are the last bind before MENUFADER, which is untextured', () => {
    const art = disc.art!;
    for (const n of ROLLER_TEXTURES) expect(art.textures(n)?.blend, n).toBe('additive');
    for (const n of ['SplashLogo.tif', 'popup_bg.tif', 'arrow_top.tif', 'arrow_botm.tif', 'font_text_01.tif']) expect(art.textures(n)?.blend, n).toBe('source');
    expect(art.model('mainmenu_roller')!.parts.map((p) => p.meshes[0]!.texture).slice().sort()).toEqual(ROLLER_TEXTURES.slice().sort());
    const s = new FrontEndSession({ disc, source: new BlackPictureSource(), startDialog: 'dlgMenu.rdr', loader: false });
    s.advance(0);
    for (let tick = 1; tick <= 12; tick++) s.advance(tick * 1000 * UI_TICK_SECONDS);
    const at = s.last.findIndex((it) => it.kind === 'sprite' && it.node === 'MENUFADER');
    const fader = s.last[at] as Extract<UiDrawItem, { kind: 'sprite' }>;
    expect(fader.texture).toBeNull();
    const pass = s.last[at - 1] as Extract<UiDrawItem, { kind: 'models' }>;
    expect(pass.kind).toBe('models');                                               // the tick's order: backplane, 3D pass, foreplane
    expect(pass.triangles!.length).toBeGreaterThan(0);
    expect(art.textures(pass.triangles!.at(-1)!.texture!)!.blend).toBe('additive');
    // The fader's quad changes no pixel of the frame, at the alpha it is drawn with here or at any other.
    const without = rasterizeUiDrawList(s.last.filter((_, i) => i !== at), art.textures).frame.data;
    for (const alpha of [fader.rgba[3], 128, 250, 0]) {
      const withIt = rasterizeUiDrawList(s.last.map((it, i) => (i === at ? { ...fader, rgba: [0, 0, 0, alpha] as [number, number, number, number] } : it)), art.textures).frame.data;
      expect(Buffer.compare(Buffer.from(withIt.buffer), Buffer.from(without.buffer)), `alpha ${alpha}`).toBe(0);
    }
    // With the roller hidden (as every script that leaves the menu hides it first) the fader covers again.
    const hidden = rasterizeUiDrawList(s.last.map((it, i) => (i === at - 1 ? { kind: 'models', triangles: [] } as UiDrawItem : i === at ? { ...fader, rgba: [0, 0, 0, 128] as [number, number, number, number] } : it)), art.textures).frame;
    expect(mean(rgbaToRgb(hidden.width, hidden.height, hidden.data))).toBe(0);
  });

  describe('the deep link (dlgMenu built at the session\'s start)', () => {
    const rows: Row[] = [];
    beforeAll(() => {
      const s = new FrontEndSession({ disc, source: new BlackPictureSource(), startDialog: 'dlgMenu.rdr', loader: false });
      s.advance(0);
      for (let tick = 1; tick <= 70; tick++) {
        s.advance(tick * 1000 * UI_TICK_SECONDS);
        rows.push({ k: tick - 1, fader: s.machine.shell()!.screen.fader.opacity, mean: mean(drawn(s)) });   // the first tick builds
      }
    }, 120_000);

    it('MENUFADER is the two programs summed: 0.946 on the first tick, falling 0.0663 a tick, under 0 from the 16th, 0 on the 23rd, under 0 again, 0 from the 45th', () => {
      for (const r of rows) expect(r.fader, `build + ${r.k}`).toBeCloseTo(derived(r.k), 6);
      const o = (k: number) => rows[k]!.fader;
      expect(o(0)).toBe(1);
      expect(o(1)).toBeCloseTo(0.99 - 1.32 * UI_TICK_SECONDS, 6);
      for (let k = 2; k <= 22; k++) expect(o(k) - o(k - 1), `build + ${k}`).toBeCloseTo(-(2 / 3 + 1.32) * UI_TICK_SECONDS, 6);
      expect(o(15)).toBeGreaterThan(0);
      for (let k = 16; k <= 22; k++) expect(o(k), `build + ${k}`).toBeLessThan(0);
      expect(o(22)).toBeCloseTo(-0.4461, 4);                                         // the lowest it goes
      expect(o(23)).toBe(0);                                                         // SetMenuValve's end writes its target
      for (let k = 24; k <= 44; k++) expect(o(k), `build + ${k}`).toBeCloseTo(-(2 / 3) * UI_TICK_SECONDS * (k - 23), 6);
      for (let k = 45; k < rows.length; k++) expect(o(k), `build + ${k}`).toBe(0);   // menu_fade_up's end, 1.5 s after the build
    });

    it('the frame is lit from the first tick after the build and never black again, whatever MENUFADER holds', () => {
      const series = rows.map((r) => Math.round(r.mean * 10) / 10);
      console.info('deep link, mean of the frame per tick from the build:', series.join(' '));
      for (const r of rows.slice(1)) expect(r.mean, `build + ${r.k}: fader ${r.fader}`).toBeGreaterThan(20);
      expect(Math.min(...rows.slice(1).map((r) => r.mean))).toBeGreaterThan(20);
    });
  });

  describe('through the opener, CROSS over Intro_2', () => {
    const rows: Row[] = [];
    let build: Rgb;
    beforeAll(() => {
      const events: OpenerEvent[] = [];
      const source = new CountingSource();
      const s = new FrontEndSession({ disc, source, onEvent: (e) => events.push(e) });
      let pressTick = -1, buildTick = -1;
      s.advance(0);
      for (let tick = 1; tick < 1200 && (buildTick < 0 || tick < buildTick + 70); tick++) {
        s.advance(tick * 1000 * UI_TICK_SECONDS);
        if (pressTick < 0 && source.name === 'run/movies/intro_2.pss' && source.last >= 33) { pressTick = tick; s.press('CROSS'); }
        if (buildTick < 0 && events.some((e) => e.kind === 'dialog' && e.name === 'dlgMenu.rdr')) buildTick = tick;
        if (pressTick < 0) continue;
        const frame = drawn(s);
        if (tick === buildTick) build = frame;
        rows.push({ k: buildTick < 0 ? tick - pressTick - 17 : tick - buildTick, fader: s.machine.shell()!.screen.fader.opacity, mean: mean(frame) });
      }
    }, 120_000);

    it('black for the switch\'s 17 ticks, then lit from the build\'s own tick: no black after it, MENUFADER as the derivation has it', () => {
      const series = rows.map((r) => `${r.k}:${Math.round(r.mean * 10) / 10}`);
      console.info('opener, mean of the frame per tick (ticks from the build):', series.join(' '));
      expect(rows[0]!.k).toBe(-17);
      for (const r of rows.filter((x) => x.k < 0)) expect(r.mean, `build ${r.k}`).toBeLessThan(0.5);
      for (const r of rows.filter((x) => x.k >= 0)) {
        expect(r.fader, `build + ${r.k}`).toBeCloseTo(derived(r.k), 6);
        expect(r.mean, `build + ${r.k}: fader ${r.fader}`).toBeGreaterThan(20);
      }
      // The build's own frame is the dialog as its file has it, before any script: LoadGameBack's popup_bg whole.
      expect(rows.find((r) => r.k === 0)!.mean).toBeGreaterThan(30);
    });

    it.skipIf(!HAVE_BURST)(`the build's frame is the console's burst_010 (PCSX2 mb10)${HAVE_BURST ? '' : ' -- no logs/parity/runs/mb10_pcsx2'}`, () => {
      const j = judge(decodePng(new Uint8Array(readFileSync(resolve(BURST!, 's06_burst_010.png')))), build);
      console.info(`build frame against burst_010: ${JSON.stringify(j)}`);
      expect([j.score, j.control, j.matched]).toEqual([97.7, 67.5, true]);
    });
  });

  it.skipIf(!HAVE_INTRO || !HAVE_WASM)(`where nothing binds a texture the fader shows: eight PCSX2 captures of Intro_2's opening are its picture k dimmed as menu_fade_up's k-th tick leaves it${!HAVE_INTRO ? ' -- no logs/parity/runs/*pcsx2*/s05_CROSS.png' : !HAVE_WASM ? ' -- no libmpeg2.wasm (S2U_FMV_WASM)' : ''}`, async () => {
    const engine = await engineFromFile(WASM);
    const decoder = new MovieDecoder(engine, { output: 'rgba' });
    decoder.open(demuxPssFile(new FsAssetSource(DISC!), 'RUN/MOVIES/INTRO_2.PSS'));
    const pictures: Float64Array[] = [];
    for (let k = 0; k < 24; k++) {
      const r = await decoder.next();
      if (r.kind === 'end') break;
      pictures.push(grid(r.picture.width, r.picture.height, r.picture.data, 4));
    }
    try { engine.close(); } catch { /* the engine's close is the decoder's */ }
    /** What is left of a picture under the black fader after `ticks` of menu_fade_up: 1 - the packed alpha / 128. */
    const left = (ticks: number): number => 1 - Math.trunc((up.from + up.rate * UI_TICK_SECONDS * ticks) * 128) / 128;
    const found: [string, number, number][] = [];
    for (const [run] of INTRO_CAPTURES) {
      const img = decodePng(new Uint8Array(readFileSync(intro(run))));
      const g = grid(img.width, img.height, img.data, 3);
      let best = { k: -1, r: 0, residual: Infinity };
      pictures.forEach((p, k) => {
        let gp = 0, pp = 0;
        for (let i = 0; i < p.length; i++) { gp += g[i]! * p[i]!; pp += p[i]! * p[i]!; }
        const r = pp > 0 ? gp / pp : 0;
        let residual = 0;
        for (let i = 0; i < p.length; i++) residual += Math.abs(g[i]! - r * p[i]!);
        if (residual < best.residual) best = { k, r, residual };
      });
      found.push([run, best.k, Math.round(best.r * 100) / 100]);
      // The fader's k-th tick over picture k, to the fit's own noise on a frame this dark (a mean under 2 of 255).
      expect(Math.abs(best.r - left(best.k)), `${run}: picture ${best.k} at ${best.r}, the fade leaves ${left(best.k)}`).toBeLessThan(0.045);
    }
    console.info('Intro_2 under menu_fade_up on the console [run, picture, brightness]:', JSON.stringify(found));
    expect(found).toEqual(INTRO_CAPTURES.map(([run, k, r]) => [run, k, r]));
  }, 300_000);

  it.skipIf(!HAVE_BURST || !HAVE_WASM)(`with MENULOOP decoded, the page's frames at pictures 2, 9, 16, 22, 29, 36 are the console's burst_011 .. 016${!HAVE_BURST ? ' -- no logs/parity/runs/mb10_pcsx2' : !HAVE_WASM ? ' -- no libmpeg2.wasm (S2U_FMV_WASM)' : ''}`, async () => {
    const fs = new FsAssetSource(DISC!);
    const engine = await engineFromFile(WASM);
    const source = new NodeMovieSource(new MovieDecoder(engine, { output: 'rgba' }), fs, (p) => existsSync(resolve(DISC!, p)));
    const s = new FrontEndSession<NodeMovieFrame>({
      disc, source, startDialog: 'dlgMenu.rdr', loader: false,
      moviePicture: (p: MoviePicture) => { const f = p.image as NodeMovieFrame; return { width: f.width, height: f.height, data: new Uint8ClampedArray(f.rgba.buffer, f.rgba.byteOffset, f.rgba.byteLength) }; },
    });
    /** The console's frame for each MENULOOP picture: the burst is ~0.22 s apart, 6.7 pictures. */
    const want = new Map([[2, 11], [9, 12], [16, 13], [22, 14], [29, 15], [36, 16]]);
    const scores: [number, number, number, boolean][] = [];
    s.advance(0);
    for (let tick = 1; tick <= 45; tick++) {
      await source.prime();
      s.advance(tick * 1000 * UI_TICK_SECONDS);
      const picture = (s.layer.picture()?.image as NodeMovieFrame | undefined)?.index ?? -1;
      const k = want.get(picture);
      if (k === undefined) continue;
      const j = judge(decodePng(new Uint8Array(readFileSync(resolve(BURST!, `s06_burst_0${k}.png`)))), drawn(s));
      scores.push([picture, j.score, j.control, j.matched]);
    }
    try { engine.close(); } catch { /* the engine's close is the decoder's */ }
    console.info('pictures against burst_011..016 [picture, score, control, matched]:', JSON.stringify(scores));
    // The page's fader is 0.81, 0.35, -0.11, 0 (the 23rd tick), -0.16 and -0.31 at these six: on the console none of it shows.
    expect(scores).toEqual([[2, 99.7, 62, true], [9, 97.2, 60.3, true], [16, 97.3, 60.1, true], [22, 98.1, 60.2, true], [29, 98.1, 60.2, true], [36, 98.1, 60.2, true]]);
  }, 300_000);
});
