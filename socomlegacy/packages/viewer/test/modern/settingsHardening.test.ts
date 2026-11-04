// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { readGlobalValves } from '../../src/originalOptions';
import { CONTROLS, type ChoiceControl, type StepperControl } from '../../src/modern/settings/model';

/**
 * MU2-6 (the modern UI polish plan, row MU2-6): Settings to release quality. CX-25 (the console plan) retired the modern
 * Settings section (`settings/index.ts`, `flow.ts`, `browser.ts` and its sheet), which only the retired shell mounted; its
 * model and its card store stay -- the console's Options read them (`../../src/console/adapters/options` over the same
 * `cardOptionStore`, CX.R5) -- and what of this file held them is kept: the two modules ask nothing and keep nothing, and
 * every valve a control edits has its default on the disc. The section's own cases are named in CX-25's commit and the
 * console plan's Log against the console tests that hold them now. A browser adaptation (MU.R1).
 */
const here = dirname(fileURLToPath(import.meta.url));

/** A roller's values, as the original's page offers them: a choice's (value, word) pairs; a stepper's every step. */
const valuesOf = (c: ChoiceControl | StepperControl): { value: number; label: string }[] => (c.kind === 'choice' ? [...c.options]
  : Array.from({ length: Math.floor((c.max - c.min) / c.step) + 1 }, (_, i) => ({ value: c.min + i * c.step, label: String(c.min + i * c.step) })));
const editable = CONTROLS.filter((c) => c.kind !== 'readonly');

describe('MU.R2 and MU.R6: the settings modules keep nothing of their own and ask no server', () => {
  const files = ['model.ts', 'store.ts'];
  it.each(files)('settings/%s: no fetch, no browser storage, no cookie, no document-wide key listener', (file) => {
    // the code, not its notes
    const text = readFileSync(resolve(here, '../../src/modern/settings', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(text).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(text).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie/);
    expect(text).not.toMatch(/(doc|document|win|window)\.addEventListener\('key/);
  });
});

const DISC = process.env.SOCOM_DISC ?? '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'READERC.ZAR'));
describe.skipIf(!HAVE_DISC)(`the option valves' defaults on the dev disc${HAVE_DISC ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  it('every valve a control edits has its default in global_valves.rdr, PERSIST, and the default is one of the control\'s values', async () => {
    const table = await readGlobalValves(new FsAssetSource(DISC));
    for (const c of editable) {
      if (c.kind === 'slider') continue;
      const r = table.find((x) => x.name === c.valve);
      expect(r, c.valve).toBeDefined();
      expect(r!.type, c.valve).toBe('PERSIST');
      const values = c.kind === 'switch' ? [0, 1] : valuesOf(c).map((x) => x.value);
      expect(values, `${c.valve} = ${r!.value}`).toContain(r!.value);
    }
  });
});
