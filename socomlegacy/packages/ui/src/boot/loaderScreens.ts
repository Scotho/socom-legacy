import type { AssetSource } from '@s2u/archive';
import { UI_FRAME } from '../compositor/frame';
import type { UiDrawItem } from '../compositor/drawList';
import { f32, toInt } from '../text/f32';

/**
 * The loader's raw screens (BOOT-02; web research 130). The disc's boot ELF `SCUS_972.75` is a loader: its `main()`
 * `FUN_001c4cc0` (SCUS L43391-43671; `SCUS L<line>` = a line of `game/analysis/SCUS_972.75.decomp.c`, the loader's own
 * decompilation, not the game's) loads the IOP modules, checks the memory cards and starts the game's overlays, and
 * on the way shows two of the six `RUN/RAW/*.RAW` images by uploading them straight into the frame buffer with
 * `FUN_001c6570(path, width, height, x, y)` (SCUS L44009-44065). No dialog draws them: this is the first screen of the
 * opener, before the game's `dlgIntroScreen.rdr`.
 *
 * Pure: bytes in, draw list out (`composeLoaderFrame`, PLAT-14's items), time a parameter (`LoaderScreens.frame`);
 * the viewer rasterises the list (`rasterizeUiDrawList`) with the textures `loaderTextures` gives.
 */

/** One `FUN_001c6570` call: the file under `\RUN\RAW\` and the call's width, height, x and y. */
export interface RawBlit {
  name: string;
  /** The disc path the loader builds (`cdrom0:` + `\RUN\RAW\` 0x1d43b8 + the name). */
  path: string;
  width: number;
  height: number;
  x: number;
  y: number;
  /** The `jal 0x1c6570` that makes it, in the loader ELF (its arguments are set by the instructions before it). */
  call: number;
  /** Where the call is. */
  cite: string;
}

const blit = (name: string, width: number, height: number, x: number, y: number, call: number, cite: string): RawBlit =>
  ({ name, path: `RUN/RAW/${name}`, width, height, x, y, call, cite });

/**
 * The loader's six blits, their arguments as the calls pass them. Only the first two are on the disc boot's path with
 * no card patch (`LOADER_SEQUENCE`); `PUNOTREM`/`PUNOTRE2` are the card-patch path's (`FUN_001c5b30`, slot 0 / 1) and
 * `PUPUTBAK`/`PUPUTBA2` its card-removed prompt (`FUN_001c6390`, called by `FUN_001c61a0` when a card read returns
 * under -9): BOOT-11's.
 */
export const RAW_BLITS = {
  PULOADGP: blit('PULOADGP.RAW', 0x280, 0x80, 0, 0xa0, 0x1c518c, 'FUN_001c4cc0 SCUS L43502-43514 (0x1d43c8)'),
  LOADING: blit('LOADING.RAW', 0x280, 0x1c0, 0, 0, 0x1c593c, 'FUN_001c4cc0 SCUS L43648-43660 (0x1d4458)'),
  PUNOTREM: blit('PUNOTREM.RAW', 0x280, 0x80, 0, 0xa0, 0x1c5d1c, 'FUN_001c5b30 SCUS L43739-43757 (0x1d44d0)'),
  PUNOTRE2: blit('PUNOTRE2.RAW', 0x280, 0x80, 0, 0xa0, 0x1c5d1c, 'FUN_001c5b30 SCUS L43739-43757 (0x1d44e0)'),
  PUPUTBAK: blit('PUPUTBAK.RAW', 0x280, 0x80, 0, 0xa0, 0x1c6468, 'FUN_001c6390 SCUS L43962-43981 (0x1d44f8)'),
  PUPUTBA2: blit('PUPUTBA2.RAW', 0x280, 0x80, 0, 0xa0, 0x1c6468, 'FUN_001c6390 SCUS L43962-43981 (0x1d4508)'),
} as const satisfies Record<string, RawBlit>;

export type RawName = keyof typeof RAW_BLITS;

/**
 * The upload's strip: `FUN_001c6570` reads 0x28000 bytes at a time (640 x 64 x 4) and sends each with an image packet
 * whose height is 0x40 (SCUS L44042-44052), stepping the packet's DBP by 0x280 blocks -- 64 lines of a 640-wide CT32
 * buffer -- until `height` is used up.
 */
export const RAW_STRIP = { lines: 0x40, bytes: 0x28000, dbpStep: 0x280 } as const;

/** The first strip's DBP: `(x * 4 + y * 0xa00) >> 8` (SCUS L44034-44042), in 256-byte blocks of a 640-wide buffer. */
export function rawStripDbp(b: Pick<RawBlit, 'x' | 'y'>, strip: number): number {
  return ((b.x * 4 + b.y * 0xa00) >> 8) + strip * RAW_STRIP.dbpStep;
}

/** A decoded picture, top row first, RGBA 0..255 (the viewer's `Rgba` has this shape). */
export interface RawImage { width: number; height: number; data: Uint8ClampedArray }

/**
 * A `.RAW` file to the picture the screen shows. The file is the upload's bytes and nothing else: `width x height`
 * CT32 pixels (R, G, B, A in that byte order, the GS's PSMCT32), top row first, sent strip by strip in file order
 * (`RAW_STRIP`). Its size must be `width * height * 4`, the dimensions the loader's call passes (`RAW_BLITS`).
 *
 * The stored alpha is not what the screen shows: every byte of it is 0 in all six files, and the display reads no
 * frame-buffer alpha -- the loader's PMODE values (0xe1, 0x7f23: `MMOD` 1) blend the read circuits by the register's
 * own `ALP` (SCUS L44029-44063). So the picture's alpha is 255 (opaque), what it is on the screen.
 */
export function decodeRaw(bytes: Uint8Array, b: Pick<RawBlit, 'width' | 'height'>): RawImage {
  const n = b.width * b.height * 4;
  if (bytes.length !== n) throw new Error(`RAW: ${bytes.length} bytes, the call's ${b.width}x${b.height} CT32 is ${n}`);
  const data = new Uint8ClampedArray(bytes);
  for (let i = 3; i < n; i += 4) data[i] = 255;
  return { width: b.width, height: b.height, data };
}

/**
 * The GS's frame before the first upload: the loader's GS setup `FUN_001c67c0` (SCUS L44068-44100) sends the ten
 * quadwords at 0x1ce680 (read from the ELF: a GIF tag, then FRAME_1 FBP 0, SCISSOR 0..1024, PRIM 6 SPRITE, RGBAQ 0,
 * XYZ2 (0,0) and (1024,1024)): a black sprite over the buffer. So everything the panel does not cover is black.
 */
export const LOADER_CLEAR: readonly [number, number, number] = [0, 0, 0];

/**
 * One field: `FUN_001a2110(0)` is libgraph's `sceGsSyncV` (SCUS L21933-21960: it waits for the V-blank and returns the
 * field bit of `CSR`), called once per fade step. VSYNC_HZ_READING: NTSC's 60000/1001 fields a second -- the loader
 * sets interlace (`SMODE2` 1, SCUS L44088) and the disc's `SYSTEM.CNF` says `VMODE = NTSC` (02-boot B1); the field
 * rate itself was not measured.
 */
export const VSYNC_HZ_READING = 60000 / 1001;

/**
 * PMODE_ALP_SCALE_READING: the CRTC blends by `ALP / 255` (0xff is 1.0, the value the loader ends each fade in on,
 * SCUS L44062). The register's scale was read neither in a GS manual nor in PCSX2's merge for this task.
 */
export const PMODE_ALP_SCALE_READING = 255;

/**
 * The fades around each upload (`FUN_001c6570` SCUS L44024-44031, L44055-44062), as `PMODE.ALP` values, one per field:
 * out from 1.0 down by 0.1 while the factor stays >= 0, then ALP 0 for the upload; in from 0.0 up by 0.1 while the
 * factor stays <= 1.0, then ALP 0xff. Each step is `(int)(f * 255.0)` in single precision, rounded toward zero as the
 * EE's FPU rounds (`EE_FPU_ROUNDING_READING`, research 111 §1.4): 10 fields out, 11 in (the fade in's eleventh, at
 * f = 0.99999982, exists only under that rounding; rounded to nearest the sum passes 1.0 after ten).
 *
 * The instructions, read from the ELF (`elfImage`): the step is the word 0xbdcccccd out (`lui`/`ori` at 0x1c65c4 /
 * 0x1c65cc) and 0x3dcccccd in (0x1c6734 / 0x1c673c) -- 0.1 rounded to nearest by the compiler, then added each field
 * with `add.s` (0x4600a500); 255.0 is 0x437f0000; `mul.s` then `cvt.w.s` (0x46140842, 0x46000864); the loops close on
 * `c.lt.s` + `bc1f` out (0x4600a034, 0x4500ffed) and `c.le.s` + `bc1t` in against 1.0 (0x4600a036, 0x4501ffec).
 */
export function blitFade(): { out: number[]; in: number[] } {
  const step = Math.fround(0.1);   // 0x3dcccccd: the constant as stored, not an EE result
  const out: number[] = [];
  for (let f = 1; f >= 0; f = f32(f - step)) out.push(toInt(f32(f * 255)));
  const inn: number[] = [];
  for (let f = 0; f <= 1; f = f32(f + step)) inn.push(toInt(f32(f * 255)));
  return { out, in: inn };
}

/**
 * The display between fades: `PMODE` 0x7f23 (SCUS L44063, and at the GS setup L44093) turns both read circuits on over
 * the same buffer (`DISPFB1` = `DISPFB2` = 0x1400, FBP 0, FBW 10: SCUS L44091-44092) and blends them by `ALP` 0x7f
 * (`MMOD` 1); `DISPLAY2` is `DISPLAY1` one line lower (its DY + 1, SCUS L44083-44090). So the steady picture is
 * 0x7f/255 of circuit 1 over 0x80/255 of circuit 2, the same buffer.
 * CIRCUIT_MERGE_READING: the merge shows the buffer as it stands -- no line shift. Read literally, `DISPLAY2`'s DY + 1
 * would make it a two-line filter (each line over the line above); how the interlaced output (`SMODE2` 1, FFMD 0)
 * turns a one-unit DY into screen lines was not read, and the captures of the original decide against the shift: the
 * buffer drawn as it stands scores 99.9 against PCSX2's s00 (mad 0.0024) where the two-line filter scores 99.7 (mad
 * 0.0059), and 100.0 (mad 0) against the recompiled game's frame (research 130 §4).
 */
export const CIRCUIT_MERGE_READING = 'the buffer as it stands' as const;

/**
 * LOADER_START_PLACEHOLDER: the black before the panel -- the IOP reboot with `DNAS271.IMG` and the `SIO2MAN.IRX` /
 * `CDVDSTM.IRX` loads (SCUS L43441-43501), which have no counterpart in a browser; no capture times them. 0 seconds:
 * the panel's fade starts at once. Settled by BOOT-01's timed boot (H19, the owner's call). [placeholder]
 */
export const LOADER_START_PLACEHOLDER = 0;

/**
 * RAW_UPLOAD_PLACEHOLDER: the black (ALP 0) while `FUN_001c6570` reads the file from the disc and sends it
 * (SCUS L44032-44053): the CD read's time, not a constant of the code; 0 in a browser that has the bytes in hand.
 * BOOT-01's capture at >= 2 Hz times it. [placeholder]
 */
export const RAW_UPLOAD_PLACEHOLDER = 0;

/**
 * PULOADGP_HOLD_PLACEHOLDER: how long the panel stays up after its fade in -- the five IRX loads `SIO2D`, `DBCMAN`,
 * `DS2U_S1`, `MCMAN`, `MCSERV`, the card library's start and the two slots' `BASCUS-97275SOCOMII/APACHE00.ZDB` check
 * (SCUS L43515-43643): load times, not a constant. No capture shows the panel (the recompiled game's 0.5 s boot burst
 * shows LOADING already at 1 s); 0 seconds stands in, so the panel shows only through its own fade in and LOADING's
 * fade out. Settled by BOOT-01 (H19). [placeholder]
 */
export const PULOADGP_HOLD_PLACEHOLDER = 0;

/**
 * LOADING_HOLD_PLACEHOLDER: how long LOADING stays before the game takes the screen -- `DNAS.BIN` and the `FTSCORE` /
 * `ZSEALETC` overlays read and started (`FUN_001c59c0` SCUS L43676-43709, the exec at L43667-43668), then the game's
 * own boot up to its first frame (BOOT-04's): load times, not a constant of the code. 2.5 s stands in, taken from the
 * one timed record, the recompiled game's 0.5 s burst (PC KNOWN [raw-strips], `logs/s13_31_boot_shots/`: LOADING from
 * its first frame at 1.0 s through 3.5 s, the card search at 4.0 s) -- a lower bound on the recompiled loader, whose
 * IOP loads are not the console's, so not a transcription of the original: pin no wall-time test to it. The console's
 * hold is BOOT-01's (H19). [placeholder]
 */
export const LOADING_HOLD_PLACEHOLDER = 2.5;

/** The disc boot's screens with no card patch, in order (`FUN_001c4cc0`): the panel, then the logo. */
export const LOADER_SEQUENCE: readonly RawName[] = ['PULOADGP', 'LOADING'];

/** What the frame buffer holds and how the CRTC shows it at one moment. */
export interface LoaderFrame {
  /** The uploads in the buffer, in upload order (a later full-frame one hides the earlier). */
  layers: RawName[];
  /** `PMODE.ALP` of circuit 1 during a fade, or null between fades (the buffer as it stands, no line
   * shift: `CIRCUIT_MERGE_READING`). */
  alp: number | null;
  /** The phase, for a test and the page's log. */
  phase: string;
}

interface Segment { phase: string; seconds: number; layers: RawName[]; alp: number | null }

export interface LoaderTimings {
  start?: number;
  upload?: number;
  holds?: Partial<Record<RawName, number>>;
}

/** The loader's screens as segments: the black start, then per blit its fade out, the upload, its fade in, its hold. */
export function loaderSegments(sequence: readonly RawName[] = LOADER_SEQUENCE, t: LoaderTimings = {}): Segment[] {
  const field = 1 / VSYNC_HZ_READING;
  const fade = blitFade();
  const holds: Partial<Record<RawName, number>> = { PULOADGP: PULOADGP_HOLD_PLACEHOLDER, LOADING: LOADING_HOLD_PLACEHOLDER, ...t.holds };
  const segs: Segment[] = [{ phase: 'start', seconds: t.start ?? LOADER_START_PLACEHOLDER, layers: [], alp: null }];
  let layers: RawName[] = [];
  for (const name of sequence) {
    for (const a of fade.out) segs.push({ phase: `${name} fade out`, seconds: field, layers, alp: a });
    segs.push({ phase: `${name} upload`, seconds: t.upload ?? RAW_UPLOAD_PLACEHOLDER, layers, alp: 0 });
    const b = RAW_BLITS[name];
    layers = b.y === 0 && b.height === UI_FRAME.height ? [name] : [...layers, name];
    for (const a of fade.in) segs.push({ phase: `${name} fade in`, seconds: field, layers, alp: a });
    segs.push({ phase: `${name} hold`, seconds: holds[name] ?? 0, layers, alp: null });
  }
  return segs.filter((s) => s.seconds > 0 || s.phase.endsWith('hold'));
}

/**
 * The loader's screens as a state the front end enters (the opener's first; the route `/` is another stream's): time
 * in, the frame out, `done` once the last hold has run -- the hand-off to the game's boot (BOOT-04).
 */
export class LoaderScreens {
  private readonly segs: Segment[];
  readonly duration: number;
  constructor(sequence: readonly RawName[] = LOADER_SEQUENCE, timings: LoaderTimings = {}) {
    this.segs = loaderSegments(sequence, timings);
    this.duration = this.segs.reduce((s, x) => s + x.seconds, 0);
  }
  /** The frame `seconds` after the loader started. */
  frame(seconds: number): LoaderFrame {
    let t = seconds;
    for (const s of this.segs) {
      if (t < s.seconds) return { layers: s.layers, alp: s.alp, phase: s.phase };
      t -= s.seconds;
    }
    const last = this.segs[this.segs.length - 1]!;
    return { layers: last.layers, alp: last.alp, phase: last.phase };
  }
  done(seconds: number): boolean { return seconds >= this.duration; }
}

/** The texture name the draw list gives the frame buffer holding `layers`. */
export function loaderBufferName(layers: readonly RawName[]): string {
  return `loader:${layers.join('+') || 'clear'}`;
}

/** The 640 x 448 buffer after the uploads: the clear, then each picture at its call's x, y (a byte copy, as the GS's). */
export function loaderBuffer(layers: readonly RawName[], images: Partial<Record<RawName, RawImage>>): RawImage | null {
  const W = UI_FRAME.width, H = UI_FRAME.height;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = LOADER_CLEAR[0]; data[i + 1] = LOADER_CLEAR[1]; data[i + 2] = LOADER_CLEAR[2]; data[i + 3] = 255; }
  for (const name of layers) {
    const img = images[name], b = RAW_BLITS[name];
    if (!img) return null;
    for (let y = 0; y < img.height && b.y + y < H; y++) {
      const row = img.data.subarray(y * img.width * 4, y * img.width * 4 + Math.min(img.width, W - b.x) * 4);
      data.set(row, ((b.y + y) * W + b.x) * 4);
    }
  }
  return { width: W, height: H, data };
}

/** The bitmaps the frame's draw list names, for the viewer's drawer (`UiTextures`): each buffer state, made once. */
export function loaderTextures(images: Partial<Record<RawName, RawImage>>): (name: string) => RawImage | null {
  const cache = new Map<string, RawImage | null>();
  return (name) => {
    if (!name.startsWith('loader:')) return null;
    if (!cache.has(name)) {
      const rest = name.slice('loader:'.length);
      const layers = rest === 'clear' ? [] : (rest.split('+') as RawName[]);
      cache.set(name, layers.every((l) => l in RAW_BLITS) ? loaderBuffer(layers, images) : null);
    }
    return cache.get(name)!;
  };
}

/** A whole-buffer quad sampling texel (x, y) at frame pixel (x, y): the GS's upload shown 1:1. */
function bufferQuad(name: string): UiDrawItem {
  const W = UI_FRAME.width, H = UI_FRAME.height;
  // At pixel x the drawer samples u = u0 + (u1 - u0) x / W = (x + 0.5) / W: texel x's centre, no filtering.
  const u0 = 0.5 / W, v0 = 0.5 / H;
  return {
    kind: 'sprite', node: 'loader', texture: name, x0: 0, y0: 0, x1: W, y1: H,
    u0, v0, u1: u0 + 1, v1: v0 + 1, rgba: [128, 128, 128, 128], clip: null,
  };
}

/**
 * The frame as PLAT-14's draw list: the buffer drawn whole, 1:1, then the CRTC's part. Between fades (`alp` null,
 * `PMODE` 0x7f23) nothing more (`CIRCUIT_MERGE_READING`). In a fade (`PMODE` 0xe1: circuit 1 alone, blended by ALP
 * with the background colour -- `SLBG` 1, `BGCOLOR` 0 from `FUN_001c67c0` SCUS L44077) a black quad at 1 - ALP/255
 * over it, which leaves each pixel at ALP/255 of itself, as the merge does.
 */
export function composeLoaderFrame(f: LoaderFrame): UiDrawItem[] {
  const out: UiDrawItem[] = [{ kind: 'clear', rgb: [...LOADER_CLEAR] }, bufferQuad(loaderBufferName(f.layers))];
  const dark = f.alp === null ? 0 : (128 * (PMODE_ALP_SCALE_READING - f.alp)) / PMODE_ALP_SCALE_READING;
  if (dark > 0) {
    out.push({ kind: 'sprite', node: 'loader:pmode', texture: null, x0: 0, y0: 0, x1: UI_FRAME.width, y1: UI_FRAME.height, u0: 0, v0: 0, u1: 0, v1: 0, rgba: [0, 0, 0, dark], clip: null });
  }
  return out;
}

/** The loader's pictures read from the disc (`RUN/RAW/`), decoded at their calls' sizes. */
export async function readLoaderImages(source: AssetSource, names: readonly RawName[] = LOADER_SEQUENCE): Promise<Partial<Record<RawName, RawImage>>> {
  const out: Partial<Record<RawName, RawImage>> = {};
  for (const n of names) out[n] = decodeRaw(await source.read(RAW_BLITS[n].path), RAW_BLITS[n]);
  return out;
}
