import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readSaveFile, saveModules } from '../cardFile';
import { SAVE_DIR } from '../../packages/card/test/mcReplay';
import { page, saveAndLeave } from '../../packages/viewer/test/optionsSaveRig';

/**
 * OPT-01's dev-host variant (web research 228 §3; roadmap 04 OPT-01 under R7: "the f0 card's file list and sizes, read
 * once with the dev tool under `tools/`"): the page's options save on a fresh card (`optionsSaveRig.ts`: the page's own
 * rows, `save_and_leave`'s order) against the f0 card the desktop's run left, `$SOCOM_PC_ROOT/logs/parity/f0/mc0/
 * BASCUS-97275SOCOMII/` (on the host, never in this tree): its twelve names and their sizes off the host's file system
 * (the dev tool reads a save file's bytes and has no folder listing),
 * and its save file's modules read through the dev tool (`tools/cardFile.ts` `readSaveFile`, `saveModules`). Without
 * `SOCOM_PC_ROOT`, or without the card, every test skips: a skip, not a pass. The reading level: the f0 card is a
 * recomp run's artefact, not a trace (PLAT-36).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const F0 = PC_ROOT ? join(PC_ROOT, 'logs', 'parity', 'f0', 'mc0', SAVE_DIR) : '';
const HAVE_F0 = PC_ROOT !== null && existsSync(join(F0, SAVE_DIR));

describe.skipIf(!HAVE_F0)('OPT-01: the page\'s save against the f0 card (SOCOM_PC_ROOT)', () => {
  it('a fresh card\'s save leaves the f0 card\'s twelve files, by name, at the f0 sizes as nominal sizes', () => {
    const f0 = Object.fromEntries(readdirSync(F0).sort().map((n) => [n, statSync(join(F0, n)).size]));
    expect(Object.keys(f0)).toHaveLength(12);
    const t = page();
    saveAndLeave(t);
    expect(t.files()).toEqual(f0);
    expect(t.free()).toBe(8000 - 1 - Object.values(f0).reduce((a, b) => a + ((b + 0x3ff) >>> 10), 0));
  });

  it('the save file\'s modules: the page\'s data holds the f0 save\'s CSaveModuleList children, in their order (the dev tool)', () => {
    const modules = saveModules(readSaveFile(new Uint8Array(readFileSync(join(F0, SAVE_DIR))))).map((m) => m.name);
    expect(modules).toHaveLength(3);
    const t = page();
    saveAndLeave(t);
    expect(Object.keys(t.saveFile().data as Record<string, unknown>)).toEqual(modules);
  });
});
