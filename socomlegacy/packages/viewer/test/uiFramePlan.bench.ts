import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bench, describe } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { BlackPictureSource } from '@s2u/fmv';
import type { UiDrawItem } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../src/frontEnd';
import { pageUiTextures } from '../src/frontEndAssets';
import { withMenuArt } from '../src/menuArt';
import type { UiTextures } from '../src/uiCompositorView';
import { planFrame, type UiFramePlan } from '../src/uiFramePlan';
import { columnAxis, rowAxis } from '../src/uiRasterRules';

/**
 * GM-06a's Node microbench (the plan, GM.R3 and GM-06a's row): the axis-table build at scale 4 on the dlgMenu frame,
 * **recorded, not asserted** (the CPU-per-frame row of GM-02b's targets waits on it). Run on demand:
 * `npx vitest bench --run test/uiFramePlan.bench.ts` with `SOCOM_PC_ROOT` (or `SOCOM_DISC`) set; without the disc it
 * benches nothing and says so in the suite's name.
 *
 * The frame is dlgMenu as the page builds it (`FrontEndSession`, `loader: false`, MENULOOP's pictures the black
 * stand-in) after 150 frames at 30 Hz (the entry fades done, the roller turning). The textures are the disc's, not the
 * HD pack's (HD-HOLD): the axis tables' size is the quads' covered columns and rows on the 4x grid, which the texture's
 * size does not change, so the table's cost is the HD frame's; its values would differ.
 *
 * Three figures: `planFrame` whole at 4x (`ff`, the HD default) and at 1x (`exact`), and the axis build alone at 4x --
 * the same `columnAxis` / `rowAxis` calls the planner makes, over the 4x plan's textured quads, into one f64 table.
 *
 * GM-29 adds the cold switch's two dialogs at 2x and 4x, each over 60 consecutive frames at 60 Hz (the frames a switch's
 * window plans one after another, every one changed): dlgMenu, and dlgOptions_Menu with its lazy bank (UIOP) read.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const NEEDS = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR', 'RUN/UI/UI_GEO.ZED'];
const HAVE_DISC = DISC !== '' && NEEDS.every((p) => existsSync(join(DISC, p)));

async function dlgMenuFrame(): Promise<{ items: UiDrawItem[]; textures: UiTextures }> {
  const src = new FsAssetSource(DISC);
  const base = await readFrontEndDisc(src);
  const disc = await withMenuArt(src, base, ['dlgMenu.rdr']);
  const banks = pageUiTextures(src);
  await banks.ready;
  const s = new FrontEndSession({ disc, source: new BlackPictureSource(), startDialog: 'dlgMenu.rdr', loader: false, textures: banks.textures });
  let now = 0;
  s.advance(now);
  for (let i = 0; i < 150; i++) s.advance(now += 1000 / 30);
  return { items: s.last.slice(), textures: (s as unknown as { textures: UiTextures }).textures };
}

/** GM-29: `dialog`'s 60 frames at 60 Hz after 150 (its lazy banks read), as the page plans them one after another. */
async function dialogFrames(dialog: string): Promise<{ list: UiDrawItem[][]; textures: UiTextures }> {
  const src = new FsAssetSource(DISC);
  const base = await readFrontEndDisc(src);
  const disc = await withMenuArt(src, base, [dialog]);
  const banks = pageUiTextures(src);
  await banks.ready;
  const d = disc.dialog(dialog);
  if (d) await banks.need(d);
  const s = new FrontEndSession({ disc, source: new BlackPictureSource(), startDialog: dialog, loader: false, textures: banks.textures });
  let now = 0;
  s.advance(now);
  const list: UiDrawItem[][] = [];
  for (let i = 0; i < 210; i++) { s.advance(now += 1000 / 60); if (i >= 150) list.push(s.last.slice()); }
  return { list, textures: (s as unknown as { textures: UiTextures }).textures };
}

/** The axis build alone, as the planner does it, over a plan's textured quads. */
function axisOnly(p: UiFramePlan): number {
  const out = new Float64Array(p.axis.length);
  let at = 0, left = new Float64Array(0), right = new Float64Array(0), fraction = new Float64Array(0);
  const r = { top: 0, bottom: 0, fy: 0, iy: 0 };
  for (const q of p.quads) {
    if (q.texture === null) continue;
    const t = p.textures[q.texture]!, cols = q.rect.xe - q.rect.xs;
    if (left.length < cols) { left = new Float64Array(cols); right = new Float64Array(cols); fraction = new Float64Array(cols); }
    columnAxis(q.rect.xs, q.rect.xe, q.x0, q.x1 - q.x0, q.uv[0], q.uv[2] - q.uv[0], t.width, false, left, right, fraction);
    for (let k = 0; k < cols; k++) { out[at++] = left[k]! / 4; out[at++] = right[k]! / 4; out[at++] = fraction[k]!; out[at++] = 1 - fraction[k]!; }
    for (let y = q.rect.ys; y < q.rect.ye; y++) {
      rowAxis(y, q.y0, q.y1 - q.y0, q.uv[1], q.uv[3] - q.uv[1], t.height, t.width, false, r);
      out[at++] = r.top / (t.width * 4); out[at++] = r.bottom / (t.width * 4); out[at++] = r.fy; out[at++] = r.iy;
    }
  }
  return at;
}

const frame = HAVE_DISC ? await dlgMenuFrame() : null;
const at4 = frame ? planFrame(frame.items, frame.textures, { scale: 4 }) : null;
if (at4) {
  // eslint-disable-next-line no-console
  console.log(`GM-06a bench frame: dlgMenu at 4x -- ${JSON.stringify(at4.stats)}; verdict ${at4.verdict}${at4.why.length ? ` (${at4.why.join('; ')})` : ''}; axis ${at4.axis.byteLength} bytes f64`);
}

describe.skipIf(!frame)(`GM-06a: the axis tables on the dlgMenu frame${frame ? '' : ` -- SKIPPED: no disc (SOCOM_DISC / SOCOM_PC_ROOT, needs ${NEEDS.join(', ')})`}`, () => {
  bench('planFrame, dlgMenu at 4x (ff)', () => { planFrame(frame!.items, frame!.textures, { scale: 4 }); });
  bench('planFrame, dlgMenu at 1x (exact)', () => { planFrame(frame!.items, frame!.textures, { scale: 1 }); });
  bench('the axis build alone, dlgMenu at 4x', () => { axisOnly(at4!); });
});

const sw = HAVE_DISC ? { menu: await dialogFrames('dlgMenu.rdr'), options: await dialogFrames('dlgOptions_Menu.rdr') } : null;
describe.skipIf(!sw)(`GM-29: the cold switch's dialogs, 60 frames each${sw ? '' : ' -- SKIPPED: no disc'}`, () => {
  for (const [name, f] of [['dlgMenu', sw?.menu], ['dlgOptions_Menu', sw?.options]] as const) {
    for (const scale of [2, 4]) bench(`planFrame, ${name} at ${scale}x (ff), 60 frames`, () => { for (const items of f!.list) planFrame(items, f!.textures, { scale }); });
  }
});
