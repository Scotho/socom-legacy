import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rgb } from './captureImage';
import { decodePng, rgbToRgba } from './captureImage';
import { encodePng } from './png';
import type { ManifestEntry } from './captureSteps';
import { manifestJson } from './captureSteps';
import type { ScoreOptions } from './captureScore';
import { judge, pyFixed, score, titleCaptures, titleVerdict } from './captureScore';

/**
 * The capture harness's file side (PLAT-30; web research 108): run directories in the recomp's format, the title
 * gate's re-score of one, and a golden-against-run report in the shape of `compare.report` (compare.py L48-84) with
 * the black control and the verdict beside every row.
 */

export const readPng = (path: string): Rgb => decodePng(readFileSync(path));
export const writePng = (path: string, img: Rgb): void => writeFileSync(path, encodePng(img.width, img.height, rgbToRgba(img)));

/** A run directory as drive.py leaves one: the captures, then `manifest.json`. */
export function writeRun(dir: string, captures: ReadonlyMap<string, Rgb>, manifest: readonly ManifestEntry[]): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, img] of captures) writePng(join(dir, name), img);
  writeFileSync(join(dir, 'manifest.json'), manifestJson(manifest));
}

/** `gate.score_title(run_dir)` against `refPath` (gate.TITLE_REF, `scripts/parity/ref_main_menu_ours.png`). */
export function scoreTitleDir(runDir: string, refPath: string): { ok: boolean; detail: string } {
  const caps = titleCaptures(existsSync(runDir) ? readdirSync(runDir) : []);
  if (caps.length === 0) return { ok: false, detail: `no captures in ${runDir}` };
  const ref = readPng(refPath);
  return titleVerdict(caps.map((n) => [n, score(ref, readPng(join(runDir, n))).score] as const));
}

export interface ReportRow {
  readonly screen: string;
  readonly score: number | null;
  readonly mad?: number;
  readonly block?: number;
  readonly control?: number;
  readonly matched?: boolean;
  readonly why?: string;
  readonly note: string;
}

/**
 * compare.report's rows: every `<golden>/*.png` but `final.png`, against the run's capture of the same label or the
 * one `align` names (`{golden_label: [ours_label | null, note]}`, scripts/parity/align.json's shape).
 */
export function reportRows(goldenDir: string, runDir: string, align: Readonly<Record<string, readonly [string | null, string?]>> = {},
  options: ScoreOptions = {}): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const f of readdirSync(goldenDir).sort()) {
    if (!f.endsWith('.png') || f === 'final.png') continue;
    const name = f.slice(0, -4);
    const [oursLabel, note = ''] = align[name] ?? [name, ''];
    const oursPath = oursLabel ? join(runDir, `${oursLabel}.png`) : null;
    if (!oursPath || !existsSync(oursPath)) { rows.push({ screen: name, score: null, note: note || 'not reached' }); continue; }
    const j = judge(readPng(join(goldenDir, f)), readPng(oursPath), options);
    rows.push({ screen: name, score: j.score, mad: j.mad, block: j.block, control: j.control, matched: j.matched, why: j.why,
      note: (oursLabel !== name ? `ours ${oursLabel}; ` : '') + note });
  }
  return rows;
}

/** The report as markdown: compare.report's table, two columns more (control, verdict). */
export function reportMarkdown(rows: readonly ReportRow[], goldenDir: string, runDir: string, stamp = ''): string {
  const scored = rows.filter((r) => r.score !== null);
  const out = [`# Capture report ${stamp}`.trimEnd(), '',
    `Golden: \`${goldenDir}\`. Run: \`${runDir}\`. Score = 100*(1 - 0.5*mad - 0.5*block) at 320x224 (compare.py); `
    + 'control = the golden against an all-black frame; matched = score >= 90.0 and >= control + CONTROL_MARGIN_READING '
    + '(web research 108 section 4).', ''];
  if (scored.length) {
    const mean = scored.reduce((s, r) => s + r.score!, 0) / scored.length;
    out.push(`**Mean score ${pyFixed(mean, 1)} over ${scored.length} screens (${rows.length - scored.length} not reached); `
      + `${scored.filter((r) => r.matched).length} matched.**`, '');
  }
  out.push('| screen | score | mad | block | control | verdict | note |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const sc = r.score === null ? '—' : String(r.score);
    const verdict = r.score === null ? '' : r.matched ? 'matched' : `not matched: ${r.why}`;
    out.push(`| ${r.screen} | ${sc} | ${r.mad ?? ''} | ${r.block ?? ''} | ${r.control ?? ''} | ${verdict} | ${r.note} |`);
  }
  return `${out.join('\n')}\n`;
}
