import { isAbsolute, relative, resolve } from 'node:path';
import type { UiPlanBlendMode } from '../src/uiFramePlan';
import { UI_GPU_BLEND_ADAPTATION, uiGpuScaleKey } from '../src/uiGpuSwitch';
import { MENU_C_FRAMES, MENU_C_ROWS, type MenuCRow } from '../../../tools/test/menuCaptureScore';
import { UI_GPU_PARITY_BLENDS, countDifferingBytes, type UiGpuFrameHeader } from './uiGpuParityRecord';
import { SETUP } from './urls';

/**
 * GM-31 leg 1 (the GPU menus plan, row GM-31; research 380 §1, the C class): the Node half of
 * `./uiGpuMenuFrames.spec.ts` -- which frames it writes, under which names, from which page, and its verdicts. Product
 * track, a test instrument: it compares our GPU drawer with our own software drawer and with GM-11c's capture rows, and
 * decides no pixel of either. Held by `test/uiGpuMenuFramesRecord.test.ts`.
 *
 * The frames are GM-11c's `MENU_C_FRAMES` (`tools/test/menuCaptureScore.ts`), exactly: each frame file's header names
 * its frame in `dialog`, so `tools/menu-gpu-compare.ts` scores it on the rows that name it. The page side is
 * `./uiGpuMenuFramesPage.ts`.
 */

/** One frame the spec writes: its name (the header's `dialog`), the dialog the page opens, the node hidden, a file stem. */
export interface MenuFrameEntry { frame: string; dialog: string; hide: string | null; stem: string }

/** A frame name split: the dialog and the node it hides, if any (GM-11c's `parseFrameName`, which the test holds it to). */
export function menuFrameParts(frame: string): { dialog: string; hide: string | null } {
  const m = /^(\S+)(?: hide (\S+))?$/.exec(frame);
  if (!m) throw Error(`menuFrameParts: ${JSON.stringify(frame)} is not "<dialog>" or "<dialog> hide <node>"`);
  return { dialog: m[1]!, hide: m[2] ?? null };
}

/** A frame name as a file stem: each run of characters other than letters, digits, `.`, `_` and `-` becomes `_`. */
const stemOf = (frame: string): string => frame.replace(/[^A-Za-z0-9._-]+/g, '_');

export function menuFrameEntries(frames: readonly string[] = MENU_C_FRAMES): MenuFrameEntry[] {
  return frames.map((frame) => ({ frame, ...menuFrameParts(frame), stem: stemOf(frame) }));
}

/** The entries by the dialog a page deep-links to, in first-seen order: one page draws all of a dialog's frames. */
export function menuFramePages(entries: readonly MenuFrameEntry[]): { dialog: string; frames: MenuFrameEntry[] }[] {
  const out: { dialog: string; frames: MenuFrameEntry[] }[] = [];
  for (const e of entries) {
    const page = out.find((p) => p.dialog === e.dialog);
    if (page) page.frames.push(e); else out.push({ dialog: e.dialog, frames: [e] });
  }
  return out;
}

/** `<stem>.<blend>.<gpu|cpu>.rgba`: the GPU surface's frame, or the page's software path's (written once per blend leg). */
export const menuFrameFileName = (stem: string, blend: UiPlanBlendMode, which: 'gpu' | 'cpu'): string => `${stem}.${blend}.${which}.rgba`;

/**
 * The page: the front end over the served tree (`?devmode`), at scale 1 (`hdMenuScale=1`, no HD pack chosen in a fresh
 * browser profile), deep-linked to the dialog (`menuflow`, as `./uiGpuPerf.spec.ts` opens it). The GPU leg asks `front`
 * of the GPU (`uiGpu=on&uiGpuSurface=front`), lets a software adapter through (`uiGpuAllowSoftwareAdapter=1`: SwiftShader
 * and llvmpipe runs; nothing here is a claim about a player's GPU) and names the blend; the software leg names
 * `uiGpu=off`, so a development build's shadow never reaches it.
 */
export function menuFrameUrl(dialog: string, leg: 'gpu' | 'software', blend: UiPlanBlendMode): string {
  const keys = leg === 'gpu' ? `&uiGpu=on&uiGpuSurface=front&uiGpuAllowSoftwareAdapter=1&uiGpuBlend=${blend}` : '&uiGpu=off';
  return `${SETUP}?devmode&hdMenuScale=1${keys}&menuflow=${dialog}`;
}

export const UI_GPU_MENU_FRAMES_DEFAULT_BLENDS: readonly UiPlanBlendMode[] = UI_GPU_PARITY_BLENDS;

export interface UiGpuMenuFramesEnvIn {
  S2U_UI_GPU_MENU_FRAMES_OUT?: string | undefined;
  S2U_UI_GPU_MENU_FRAMES_BLENDS?: string | undefined;
  SOCOM_PC_ROOT?: string | undefined;
}
export interface UiGpuMenuFramesEnv { out: string | null; blends: UiPlanBlendMode[]; root: string | null }

const inside = (outer: string, inner: string): boolean => {
  const fold = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  const rel = relative(fold(outer), fold(inner));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * The spec's env. `S2U_UI_GPU_MENU_FRAMES_OUT`: the frames' directory, and the switch -- unset, the spec is skipped, said
 * (it needs the served tree and `SOCOM_PC_ROOT`'s references; a run on demand, on the boxes); never inside
 * `<web>/test-results`, which Playwright empties at each run's start (GM-11b review F1's rule). `S2U_UI_GPU_MENU_FRAMES_BLENDS`:
 * the GPU legs' blends (default `exact,ff`). `SOCOM_PC_ROOT`: the rows' references, read only by the compare tool.
 */
export function menuFramesEnv(env: UiGpuMenuFramesEnvIn, web: string): UiGpuMenuFramesEnv {
  const out = env.S2U_UI_GPU_MENU_FRAMES_OUT?.trim() || null;
  if (out && inside(resolve(web, 'test-results'), out)) {
    throw Error(`S2U_UI_GPU_MENU_FRAMES_OUT: ${JSON.stringify(out)} is inside ${resolve(web, 'test-results')}, which Playwright empties at the start of every run; name a directory outside it`);
  }
  const raw = (env.S2U_UI_GPU_MENU_FRAMES_BLENDS ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  for (const b of raw) if (!UI_GPU_PARITY_BLENDS.includes(b as UiPlanBlendMode)) throw Error(`S2U_UI_GPU_MENU_FRAMES_BLENDS: ${JSON.stringify(b)} is not exact or ff`);
  return { out, blends: raw.length ? UI_GPU_PARITY_BLENDS.filter((b) => raw.includes(b)) : [...UI_GPU_MENU_FRAMES_DEFAULT_BLENDS], root: env.SOCOM_PC_ROOT?.trim() || null };
}

/** A frame file's header for an entry: the frame's name as `dialog`, scale 1, opaque, 640 x 448 (the rows' frame). */
export function menuFrameHeader(e: MenuFrameEntry, o: { blend: UiPlanBlendMode; which: 'gpu' | 'cpu'; path: 'gpu' | 'software'; renderer: string | null }): UiGpuFrameHeader {
  return { dialog: e.frame, run: `${e.frame}/${o.blend}`, scale: 1, mode: 'opaque', blend: o.blend, which: o.which, width: 640, height: 448, renderer: o.renderer, path: o.path };
}

/** The switch's frame counts (`window.__uiGpu.levels`). */
export interface MenuFrameLevels { L0: number; L1: number; L2: number; L3: number; L4: number }

/**
 * Why a frame the GPU leg drew is not the GPU path's, empty when it is: the page's presenter is the front end's GPU
 * surface (`gpu-surface`), its last present drew on the GPU (`path` gpu: L0, not an L1 upload of the software), the
 * read-out counted exactly one L0 frame across that present and no L1-L4, and the frame is scale 1's 640 x 448.
 */
export function gpuFrameFailures(d: {
  presenter: string; path: 'gpu' | 'software'; why: readonly string[]; before: MenuFrameLevels | null; after: MenuFrameLevels | null; width: number; height: number;
}): string[] {
  if (d.presenter !== 'gpu-surface') return [`the presenter is ${d.presenter}, not the GPU surface`];
  const out: string[] = [];
  if (d.path !== 'gpu') out.push(`path ${d.path}, not gpu${d.why.length ? ` (${d.why.join('; ')})` : ''}`);
  if (!d.before || !d.after) out.push('no window.__uiGpu read-out');
  else {
    const dL0 = d.after.L0 - d.before.L0;
    if (dL0 !== 1) out.push(`L0 +${dL0}, not +1`);
    for (const l of ['L1', 'L2', 'L3', 'L4'] as const) { const n = d.after[l] - d.before[l]; if (n !== 0) out.push(`${l} +${n}`); }
  }
  if (d.width !== 640 || d.height !== 448) out.push(`${d.width} x ${d.height}, not 640 x 448 (scale 1)`);
  return out;
}

const EXIT_NAMES: Readonly<Record<number, string>> = { 0: 'pass', 1: 'fail', 2: 'usage', 3: 'nothing scored', 4: 'error' };

/** One scored line of `tools/menu-gpu-compare.ts` as the verdict reads it (`CompareLine`). */
export interface MenuFramesLine { row: string; which: 'gpu' | 'cpu' | null; status: string; why: string; blend?: string | null }

/**
 * The 4070 evidence run's finding 2: the blend a player's frame at `scale` is drawn with -- the landed blend table's
 * (`UI_GPU_BLEND_ADAPTATION.front`, GM.R6: scale 1 `exact`, HD `ff`). The C rows are judged on it; the other blend's
 * GPU frames are scored and recorded, unjudged (`menuFramesUnjudged`).
 */
export const menuFramesJudgedBlend = (scale: number): UiPlanBlendMode => UI_GPU_BLEND_ADAPTATION.front[uiGpuScaleKey(scale)];

/** A GPU line drawn with a blend players never get at `scale` (not `menuFramesJudgedBlend`): scored, never judged. */
const unjudged = (l: MenuFramesLine, scale: number): boolean => l.which === 'gpu' && typeof l.blend === 'string' && l.blend !== menuFramesJudgedBlend(scale);

/** The 4070 run's finding 2: the other blend's GPU lines, labelled for the record ("unjudged: <blend>, players draw <judged>"). */
export function menuFramesUnjudged(lines: readonly MenuFramesLine[], scale = 1): string[] {
  return lines.filter((l) => unjudged(l, scale))
    .map((l) => `${l.row} (gpu, ${l.blend}): ${l.status}${l.why ? `: ${l.why}` : ''} -- unjudged: players draw ${menuFramesJudgedBlend(scale)} at ${scale}x`);
}

/**
 * The score's verdict, empty when it holds: `tools/menu-gpu-compare.ts` exited 0, no line failed, errored or was skipped,
 * and every row passed on a GPU frame and on the software frame. Exit 3 (nothing scored) and a row scored on one drawer
 * only are failures, never passes. The 4070 run's finding 2: a GPU line drawn with the blend players never get at the
 * frames' scale (scale 1: `ff`) is not judged -- its failure, and the tool's exit 1 when it is the only failure, pass
 * here, and `menuFramesUnjudged` records it; a row must pass on a GPU frame of the judged blend.
 */
export function menuFramesVerdict(exit: number, lines: readonly MenuFramesLine[], rows: readonly MenuCRow[] = MENU_C_ROWS, scale = 1): string[] {
  const out: string[] = [];
  const judged = lines.filter((l) => !unjudged(l, scale));
  const onlyUnjudgedFailed = exit === 1 && judged.every((l) => l.status === 'pass') && lines.some((l) => l.status !== 'pass');
  if (exit !== 0 && !onlyUnjudgedFailed) out.push(`menu-gpu-compare exit ${exit} (${EXIT_NAMES[exit] ?? 'unknown'}), not 0`);
  for (const l of judged) if (l.status !== 'pass') out.push(`${l.row} (${l.which ?? '-'}): ${l.status}${l.why ? `: ${l.why}` : ''}`);
  for (const r of rows) {
    if (!judged.some((l) => l.row === r.id && l.which === 'gpu' && l.status === 'pass')) out.push(`${r.id}: no GPU frame passed`);
    if (!lines.some((l) => l.row === r.id && l.which === 'cpu' && l.status === 'pass')) out.push(`${r.id}: no software frame passed`);
  }
  // A run that scored nothing names every row twice over: the exit line and the lines say it; keep the first of each.
  return [...new Set(out)];
}

/**
 * GM-31 review F1: where `drawDialog` (`tools/test/menuCaptureFrames.ts`, Node-only) reads the disc in the spec process,
 * in the order tried -- `SOCOM_DISC`, then `<SOCOM_PC_ROOT>/game/disc` (as `tools/test/menuGpuCompare.test.ts` finds it);
 * the spec takes the first that holds the fonts archive.
 */
export function menuFramesDiscCandidates(env: { SOCOM_DISC?: string | undefined; SOCOM_PC_ROOT?: string | undefined }): string[] {
  const out: string[] = [];
  if (env.SOCOM_DISC?.trim()) out.push(env.SOCOM_DISC.trim());
  if (env.SOCOM_PC_ROOT?.trim()) out.push(resolve(env.SOCOM_PC_ROOT.trim(), 'game/disc'));
  return out;
}

/**
 * GM-31 review F1: the page's software frame against `drawDialog`'s, drawn in the spec's Node process from the disc --
 * byte for byte (straight RGBA, top row first, `width` wide), and their `undrawn` lists equal where `drawDialog` gives
 * one (`null`: its hidden-node frame returns no list). Empty when the page drew the scorer's frame.
 */
export function drawDialogMatchFailures(
  page: { rgba: ArrayLike<number>; undrawn: readonly string[] },
  node: { rgba: ArrayLike<number>; undrawn: readonly string[] | null },
  width = 640,
): string[] {
  const out: string[] = [];
  if (page.rgba.length !== node.rgba.length) out.push(`page frame is not drawDialog's: ${page.rgba.length} bytes against ${node.rgba.length}`);
  else {
    const d = countDifferingBytes(page.rgba, node.rgba, width);
    if (d.differ) out.push(`page frame is not drawDialog's: ${d.differ} bytes, first at ${d.first!.x},${d.first!.y}`);
  }
  if (node.undrawn !== null && JSON.stringify(page.undrawn) !== JSON.stringify(node.undrawn)) {
    out.push(`undrawn differs: page ${JSON.stringify(page.undrawn)}, drawDialog ${JSON.stringify(node.undrawn)}`);
  }
  return out;
}
