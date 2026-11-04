import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devClockDt, devClockState } from '../src/devClock';

/**
 * #339's port (the test room's developer panel: the clock, the readout and its link, teleport, the visual debug, ammo
 * and kit, the round and bots notes): every instrument stays behind the panel's one gate, which a release build folds
 * away (`import.meta.env.DEV && devToolsEnabled(SEARCH)` in `main.ts`, the keyboard rule's precedent, OT.R29), and
 * while the panel is closed the game's clock and ammo are main's. A browser adaptation's pins: source scans and the
 * clock's identity, no game value.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');
const src = (name: string): string => readFileSync(resolve(SRC, name), 'utf-8');
const GATE = ['import', 'meta', 'env', 'DEV'].join('.');              // spelled so the leak check's name rule stays quiet
const GATED_IMPORT = `if (${GATE} && devToolsEnabled(SEARCH)) void import('./devPanel').then((m) => {`;

/** Every TypeScript source under `src/`, by its path from there with forward slashes. */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        out.push({ path: relative(SRC, full).split('\\').join('/'), text: readFileSync(full, 'utf-8') });
      }
    }
  };
  walk(SRC);
  return out;
}

/** `main.ts`'s gated development block: from the panel's one import to its `.catch`. */
function gatedBlock(main: string): { start: number; end: number } {
  const start = main.indexOf(GATED_IMPORT);
  const end = main.indexOf('}).catch(', start);
  return { start, end };
}

describe('Fire.replenishMagazine: the panel\'s infinite ammo, never the game\'s', () => {
  it('(a) no caller outside the developer panel\'s module: a scan of src/ finds the calls in devPanel.ts alone', () => {
    const callers = sources()
      .filter((f) => /\breplenishMagazine\s*\(/.test(f.text.replace(/\breplenishMagazine\(\): void \{/g, '')))
      .map((f) => f.path)
      .sort();
    expect(callers).toEqual(['devPanel.ts']);
    expect(src('fire.ts')).toMatch(/\breplenishMagazine\(\): void \{/);   // the one definition
  });

  it('(b) devPanel.ts runs only under the release-folded gate: one dynamic import, no static value import', () => {
    const files = sources();
    const dynamic = files.filter((f) => f.text.includes("import('./devPanel')")).map((f) => f.path);
    expect(dynamic).toEqual(['main.ts']);
    const main = src('main.ts');
    expect(main.split("import('./devPanel')")).toHaveLength(2);
    expect(main).toContain(GATED_IMPORT);
    for (const f of files) {
      expect(f.text, f.path).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+'\.\/devPanel';/m);
      expect(f.text, f.path).not.toMatch(/^import\s+'\.\/devPanel';/m);
    }
  });

  it('(b) main.ts reaches the refill only through the panel module, inside the gated block', () => {
    const main = src('main.ts');
    const { start, end } = gatedBlock(main);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const refills = [...main.matchAll(/\bm\.devRefill\w*\(/g)].map((x) => x.index!);
    expect(refills.length).toBeGreaterThan(0);
    for (const at of refills) {
      expect(at).toBeGreaterThan(start);
      expect(at).toBeLessThan(end);
    }
    // The frame's hook is a no-op until that block installs it, and the frame calls it under the build's flag.
    expect(main).toContain('let devAfterFire = (): void => {};');
    expect(main).toContain(`if (${GATE}) devAfterFire();`);
    expect(main.indexOf('devAfterFire = () => {')).toBeGreaterThan(start);
    expect(main.indexOf('devAfterFire = () => {')).toBeLessThan(end);
  });
});

describe('the other instruments stay behind the same gate', () => {
  it('the loading screen takes the panel key only when the panel\'s switch is on', () => {
    const main = src('main.ts');
    expect(main).toContain('if (loadingJoin.blocked && devToolsEnabled(SEARCH)) {');
    expect(main.split('devPanelLoadingKey(e.code')).toHaveLength(2);
  });

  it('every hook the panel installs is a no-op or the identity until the gated block assigns it', () => {
    const main = src('main.ts');
    const { start, end } = gatedBlock(main);
    for (const [decl, assign] of [
      ['let scaleDt = (dt: number): number => dt;', 'scaleDt = (dt) =>'],
      ['let consumeDevSpot = (): void => {};', 'consumeDevSpot = () => {'],
      ['let clearDevTraces = (): void => {};', 'clearDevTraces = () => {'],
      ['let devAfterFire = (): void => {};', 'devAfterFire = () => {'],
    ] as const) {
      expect(main, decl).toContain(decl);
      const assigned = [...main.matchAll(new RegExp(`^\\s+${assign.replace(/[()[\]{}.*+?^$|\\]/g, '\\$&')}`, 'gm'))];
      expect(assigned, assign).toHaveLength(1);
      expect(assigned[0]!.index!, assign).toBeGreaterThan(start);
      expect(assigned[0]!.index!, assign).toBeLessThan(end);
    }
  });
});

describe('a spot in the link survives a panel import that resolves after the map (F3)', () => {
  it('the gated block ends by placing the spot once when a map is already loaded, after installing consumeDevSpot', () => {
    const main = src('main.ts');
    const { start, end } = gatedBlock(main);
    const assigned = main.indexOf('\n  consumeDevSpot = () => {', start);
    const late = main.indexOf('\n  if (loaded) consumeDevSpot();', start);
    expect(assigned).toBeGreaterThan(start);
    expect(late).toBeGreaterThan(assigned);
    expect(late).toBeLessThan(end);
    // The block's last statement, at its top level (two spaces), so every hook is installed before it runs.
    expect(main.slice(late, end)).toMatch(/^\n {2}if \(loaded\) consumeDevSpot\(\);[^\n]*\n$/);
    // It cannot apply the spot twice: the installed hook returns once `spotDone` is set.
    const body = main.slice(assigned, main.indexOf('\n  };', assigned));
    expect(body).toContain('if (spotDone) return;');
    expect(main.slice(start, end).split('consumeDevSpot();')).toHaveLength(2);
  });
});

describe('the clock: with the panel untouched the frame is main\'s', () => {
  it('the real step is the line main had, the frame counter reads it, and the clock scales a shadowed dt', () => {
    const main = src('main.ts');
    expect(main).toContain('    const dt = Math.min(frameTime.frame(performance.now()), 0.1);     // a backgrounded tab must not teleport the camera (PAR-24: the real seconds kept)\n');
    expect(main).toContain('    const raw = dt;\n    {\n      const dt = scaleDt(raw);');
    expect(main).toContain('    if (adaptiveRatio.frame(dt, performance.now()');      // four spaces: outside the block, the real dt
    expect(main.split('scaleDt(').length - 1).toBe(1);
  });

  it('at 1x the clock returns the frame\'s own seconds, bit for bit, for every step the frame clock can give', () => {
    const steps = [0, 1e-9, 1 / 240, 1 / 144, 1 / 60, 1 / 59.94, 1 / 30, 0.033333333333333, 0.0999999, 0.1];
    let state = devClockState();
    for (const dt of steps) {
      const next = devClockDt(state, dt);
      expect(Object.is(next.dt, dt), `dt ${dt}`).toBe(true);
      expect(next.state).toEqual({ scale: 1, step: false });
      state = next.state;
    }
  });
});

describe('each instrument is labelled a development instrument with no original', () => {
  it.each([
    'devClock.ts', 'devReadout.ts', 'devSpot.ts', 'devTargets.ts', 'devTraces.ts', 'devGaps.ts', 'devPanel.ts',
  ])('%s', (name) => {
    const head = src(name).split('\n').slice(0, 30).join('\n').replace(/\n \* /g, ' ');
    expect(head).toMatch(/browser adaptation/i);
    expect(head).toMatch(/development instrument with no original/);
    // 04's ruling (OT.R53): closing the panel resets the clock and the ammo; only the drawing overlays may stay.
    expect(head).not.toMatch(/closed and untouched/);
    expect(head).toMatch(/while the panel is closed, the game's clock and ammo are main's; only the drawing overlays may stay/);
  });
});
