import type { Rgb } from './captureImage';
import { thumb, thumbDistance } from './captureScore';

/**
 * The step-script runner of the capture harness (PLAT-30; web research 108 §6): `tools_py/parity/drive.py`'s
 * vocabulary (`parse` L217-227, `run_steps` L466-661) over any frame source -- the page in Playwright
 * (`tools/capture-page.ts`), or a recorded sequence in a test. It writes what drive.py writes, so the gate reads it:
 * `sNN_<btn>.png` before each press, `wNN_<k>.png` every `waitPeriod` seconds of a settle wait, `sNN_burst_<k>.png`,
 * `final.png` after the tail, and `manifest.json` one entry a step (`{step, label, t, stable, waited, buttons}`, the
 * floats as Python writes them, `json.dump(..., indent=1)`).
 *
 * Read and kept: `stable`, `long`, `next`, `wait`, `idle`, `hold`, `burst`, `ifburst`, `ifref(...)`, `until(...)` and
 * `untilref(...)` with drive.py's fixed-count pacing (the Windows instrument; the paced, wall-clock budget is the slow
 * host's and is not ported). `ifpopup` (the in-match HELP pop-up test, `sp_death_probe.screen_state`) and the `lit`
 * flag (`screen_bands.gameplay_band`) are refused by name: they read gameplay frames the page does not draw yet.
 */

/** One script line: `<mode>+<delay>:<BTN>[+<BTN>]`, `NONE` presses nothing (drive.py `parse`). */
export interface Step { readonly mode: string; readonly delay: number; readonly buttons: readonly string[] }

/** drive.parse: comments after `#`, blank lines skipped, buttons upper-cased, `NONE` dropped. */
export function parseSteps(text: string): Step[] {
  const steps: Step[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#', 1)[0]!.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) throw new Error(`step script: no ':' in ${JSON.stringify(line)}`);
    const head = line.slice(0, colon), rest = line.slice(colon + 1);
    const plus = head.indexOf('+');
    if (plus < 0) throw new Error(`step script: no '+<delay>' in ${JSON.stringify(line)}`);
    const delay = Number(head.slice(plus + 1));
    if (!Number.isFinite(delay)) throw new Error(`step script: delay ${JSON.stringify(head.slice(plus + 1))} is not a number`);
    const buttons = rest.split('+').map((b) => b.trim().toUpperCase()).filter((b) => b && b !== 'NONE');
    steps.push({ mode: head.slice(0, plus), delay, buttons });
  }
  return steps;
}

/** What the runner drives: a frame, a press, a clock and somewhere to write. */
export interface FrameDriver {
  grab(): Promise<Rgb>;
  /** Press (and release) a PS2 button; `holdSeconds` holds it down that long (drive.py `keys.press(hold_s=)`). */
  press(button: string, holdSeconds?: number): Promise<void>;
  /** Seconds, monotonic. */
  now(): number;
  sleep(seconds: number): Promise<void>;
  /** Write a capture under the run directory. */
  save(name: string, img: Rgb): Promise<void>;
  /** Read a reference image a script names (`untilref(<png>)`, `ifref(<png>)`). */
  loadRef(path: string): Promise<Rgb>;
  /** A line of the drive log. */
  log?(line: string): void;
}

/** drive.py's command-line defaults (`build_parser` L408-420). */
export interface RunOptions {
  readonly settle?: number;
  readonly maxwait?: number;
  readonly tail?: number;
  readonly waitPeriod?: number;
}

export interface ManifestEntry {
  readonly step: number;
  readonly label: string;
  readonly t: number;
  readonly stable: boolean;
  readonly waited: number;
  readonly buttons: readonly string[];
}

/** Python's `round(x, 1)` for the manifest's times (no exact ties arise from a clock's doubles in practice). */
const round1 = (x: number): number => Math.round(x * 10) / 10;
/** Python's float repr for the manifest: a whole number keeps its `.0`. */
const pyFloat = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** `json.dump(manifest, indent=1)` as drive.py writes it. */
export function manifestJson(entries: readonly ManifestEntry[]): string {
  if (entries.length === 0) return '[]';
  const item = (e: ManifestEntry): string => {
    const buttons = e.buttons.length ? `[\n${e.buttons.map((b) => `   ${JSON.stringify(b)}`).join(',\n')}\n  ]` : '[]';
    return [' {', `  "step": ${e.step},`, `  "label": ${JSON.stringify(e.label)},`, `  "t": ${pyFloat(e.t)},`,
      `  "stable": ${e.stable},`, `  "waited": ${pyFloat(e.waited)},`, `  "buttons": ${buttons}`, ' }'].join('\n');
  };
  return `[\n${entries.map(item).join(',\n')}\n]`;
}

const two = (n: number): string => String(n).padStart(2, '0');
const three = (n: number): string => String(n).padStart(3, '0');

/** drive.highlighted: the box's mean G over R by more than 25 (SOCOM II's green-teal selection tint). */
export function highlighted(img: Rgb, box: readonly [number, number, number, number]): boolean {
  const [x0, y0, x1, y1] = box;
  let r = 0, g = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * img.width + x) * 3; r += img.data[k]!; g += img.data[k + 1]!; }
  const n = (x1 - x0) * (y1 - y0);
  return n > 0 && g / n - r / n > 25;
}

/** Run a step script; returns the manifest, which the caller writes as `manifest.json` (`manifestJson`). */
export async function runSteps(steps: readonly Step[], d: FrameDriver, opts: RunOptions = {}): Promise<ManifestEntry[]> {
  const settle = opts.settle ?? 1.5, maxwait = opts.maxwait ?? 40, tail = opts.tail ?? 8, period = opts.waitPeriod ?? 1;
  const log = (s: string): void => d.log?.(s);
  const t0 = d.now();
  const frame = async (): Promise<Float32Array> => thumb(await d.grab());
  let last = await frame();
  let ifrefMatched = false;
  const manifest: ManifestEntry[] = [];

  /** drive.wait_stable (L347-375), with the wait captures of `wait_capturer` (L378-405). */
  const waitStable = async (step: number, counter: { k: number; next: number }, settleS: number, maxS: number,
    changedFrom: Float32Array | null = null, thresh = 1.0, changeThresh = 0.3): Promise<[boolean, number]> => {
    const start = d.now();
    let prev = await frame();
    let stableSince: number | null = null;
    let changed = changedFrom === null;
    while (d.now() - start < maxS) {
      await d.sleep(0.25);
      const img = await d.grab();
      const cur = thumb(img);
      const elapsed = d.now() - start;
      if (elapsed >= counter.next) { await d.save(`w${two(step)}_${three(counter.k)}.png`, img); counter.k++; counter.next = elapsed + period; }
      if (!changed) {
        if (thumbDistance(cur, changedFrom!) > changeThresh) changed = true;
        prev = cur;
        continue;
      }
      if (thumbDistance(cur, prev) < thresh) {
        stableSince ??= d.now();
        if (d.now() - stableSince >= settleS) return [true, d.now() - start];
      } else stableSince = null;
      prev = cur;
    }
    return [false, d.now() - start];
  };

  const refArgs = (inner: string): { path: string; region: [number, number, number, number]; nums: number[]; lit: boolean } => {
    const parts = inner.split(',').map((v) => v.trim());
    const lit = parts.slice(1).includes('lit');
    const nums = parts.slice(1).filter((v) => v !== 'lit').map(Number);
    const [r0, r1] = nums.length >= 2 ? [Math.trunc(nums[0]!), Math.trunc(nums[1]!)] : [8, 62];
    const [c0, c1] = nums.length >= 4 ? [Math.trunc(nums[2]!), Math.trunc(nums[3]!)] : [0, 160];
    return { path: parts[0]!, region: [c0, r0, c1, r1], nums, lit };
  };

  for (let i = 0; i < steps.length; i++) {
    const { mode } = steps[i]!;
    let { delay } = steps[i]!;
    let buttons = [...steps[i]!.buttons];
    let stable = true, waited = 0;
    let held = 'none';
    const counter = { k: 0, next: 0 };
    if (mode === 'stable') [stable, waited] = await waitStable(i, counter, settle, maxwait);
    else if (mode === 'long') [stable, waited] = await waitStable(i, counter, settle, 150);
    else if (mode === 'next') [stable, waited] = await waitStable(i, counter, settle, maxwait, last);
    else if (mode === 'wait') { /* just the delay */ }
    else if (mode.startsWith('until(')) {
      const box = mode.slice(6, -1).split(',').map((v) => Math.trunc(Number(v))) as [number, number, number, number];
      let presses = 0;
      while (!highlighted(await d.grab(), box) && presses < 10) {
        await waitStable(i, counter, 2.0, 25.0);
        for (const b of buttons) await d.press(b);
        presses++;
        await d.sleep(delay);
      }
      log(`until(${box.join(', ')}): ${presses} presses, highlighted=${highlighted(await d.grab(), box)}`);
      buttons = []; delay = 0.5;
    } else if (mode.startsWith('untilref(')) {
      const a = refArgs(mode.slice(9, -1));
      if (a.lit) throw new Error(`step ${i}: untilref's 'lit' flag reads gameplay letterbox bands; not ported (research 108 §6)`);
      const maxLoops = a.nums.length >= 5 ? Math.trunc(a.nums[4]!) : 12;
      const thresh = a.nums.length >= 6 ? a.nums[5]! : 14.0;
      const ref = thumb(await d.loadRef(a.path));
      const dist = async (): Promise<number> => thumbDistance(await frame(), ref, a.region);
      let presses = 0;
      while (!((await dist()) < thresh) && presses < maxLoops) {
        await waitStable(i, counter, 1.5, 20.0);
        if ((await dist()) < thresh) break;
        for (const b of buttons) await d.press(b);
        presses++;
        await d.sleep(delay);
      }
      const final = await dist();
      log(`untilref(${a.path}): ${presses} presses, dist=${final.toFixed(1)}, matched=${final < thresh ? 'True' : 'False'}`);
      buttons = []; delay = 0.5;
    } else if (mode.startsWith('ifref(')) {
      const a = refArgs(mode.slice(6, -1));
      const thresh = a.nums.length >= 5 ? a.nums[4]! : 14.0;
      const ref = thumb(await d.loadRef(a.path));
      await waitStable(i, counter, 1.5, 20.0);
      const dist = thumbDistance(await frame(), ref, a.region);
      ifrefMatched = dist < thresh;
      log(`ifref(${a.path}): dist=${dist.toFixed(1)} matched=${ifrefMatched ? 'True' : 'False'}`);
      if (!ifrefMatched) buttons = [];
    } else if (mode === 'burst' || mode === 'ifburst') {
      if (mode === 'burst' || ifrefMatched) {
        const tb = d.now();
        let k = 0;
        while (d.now() - tb < delay) { await d.save(`s${two(i)}_burst_${three(k)}.png`, await d.grab()); k++; await d.sleep(0.2); }
        log(`${mode}: s${two(i)}_burst_*, ${k} frames over ${delay.toFixed(1)}s`);
      } else log(`ifburst: s${two(i)} skipped (the preceding ifref did not match)`);
      delay = 0;
    } else if (mode === 'hold') {
      for (const b of buttons) await d.press(b, delay);
      held = buttons.map((b) => `hold${b}`).join('+');
      buttons = []; delay = 0.5;
    } else if (mode === 'idle') {
      const ti = d.now();
      const ref = await frame();
      let skip = false;
      while (d.now() - ti < delay) {
        await d.sleep(0.5);
        if (thumbDistance(await frame(), ref) > 1.0) { skip = true; break; }
      }
      if (skip) buttons = [];
      delay = 0.5;
    } else {
      throw new Error(`step ${i}: mode ${JSON.stringify(mode)} is not ported (ifpopup reads gameplay frames; research 108 §6)`);
    }
    await d.sleep(delay);
    const label = `s${two(i)}_${buttons.join('+') || (mode === 'hold' ? held : 'none')}`;
    await d.save(`${label}.png`, await d.grab());
    last = await frame();
    for (const b of buttons) await d.press(b);
    manifest.push({ step: i, label, t: round1(d.now() - t0), stable, waited: round1(waited), buttons });
    log(`${label.padEnd(24)} t=${(d.now() - t0).toFixed(1).padStart(6)}s stable=${stable ? 'True' : 'False'} waited=${waited.toFixed(1)}s`);
  }
  await d.sleep(tail);
  await d.save('final.png', await d.grab());
  return manifest;
}
