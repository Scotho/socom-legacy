import { IDBFactory as FakeFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SOCOM2_US_BOOT } from '@s2u/archive';
import { buildIso } from '../../archive/test/isoImage';
import { DiscExtractError, extractDisc, type DiscExtractRecord, type ExtractEnv, type ExtractHooks } from '../src/discExtract';
import { extractionState, storedExtraction } from '../src/discExtractRecord';
import type { DiscRequest } from '../src/discSource';
import {
  discForStart, forgeDiscStart, runExtraction, storedRequestOf, type DiscChooser, type ExtractPopover, type RunDeps,
} from '../src/discStart';
import type { ExtractAct, ExtractView } from '../src/console/render/extract';
import { openPageRecords } from '../src/pageStore';
import { FakeOpfs, FakeStorage, discMembers, fakeWorker, systemCnf } from './discExtractFakes';

/**
 * DX-3 (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`; the merge controller's ruling of 2026-10-16):
 * `discForStart`, the one place a start decides between the disc and the disc's read set kept in this browser, which
 * both entries call (the console's START, the online seat's invite entry), over its two seams -- the chooser and the
 * popover -- here as fakes; the extraction is DX-1's own over its fakes (OPFS in memory, fake-indexeddb, the worker
 * in-process) and a synthetic image in the retail names (no game data). Also the forge's start order. A browser
 * adaptation (OT.R53, the product track): nothing the game does changes.
 */

const ID = { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' };
const image = (ver = '1.02'): Extract<DiscRequest, { kind: 'iso' }> =>
  ({ kind: 'iso', file: new File([buildIso(discMembers(systemCnf(SOCOM2_US_BOOT, ver)), 'SCUS_97275')], `SOCOM II ${ver}.iso`, { lastModified: 5 }) });
// Microtask turns and one timer turn: Windows clamps a 0 ms timer to its tick, so a long chain of them is seconds.
const tick = async (n = 30): Promise<void> => { for (let i = 0; i < n; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

let env: ExtractEnv;
let deps: RunDeps;
beforeEach(() => {
  const idb = new FakeFactory() as unknown as IDBFactory;
  const log = { count: 0, terminated: 0, files: 0 };
  const fs = new FakeOpfs();
  env = { storage: new FakeStorage(fs), idb: () => idb, records: openPageRecords(() => idb, () => undefined), worker: () => fakeWorker(log, fs), chunk: 1024, now: () => 5 };
  deps = { env, doneHold: 0 };
});

/** A popover that records every view and close, and answers acts on demand. */
function popover(): ExtractPopover & { views: ExtractView[]; closed: number; act(a: ExtractAct): void; last(): ExtractView | undefined } {
  let listener: ((a: ExtractAct) => void) | null = null;
  const p = {
    views: [] as ExtractView[], closed: 0,
    show(v: ExtractView) { p.views.push(v); },
    close() { p.closed++; },
    onAct(l: (a: ExtractAct) => void) { listener = l; return () => { listener = null; }; },
    act(a: ExtractAct) { listener?.(a); },
    last: () => p.views.at(-1),
  };
  return p;
}
/** Retry an already failed run twice so disc fallback is eligible. */
async function twoMoreFailures(pop: ReturnType<typeof popover>): Promise<void> {
  for (let i = 0; i < 2; i++) {
    pop.act('retry');
    await tick();
    while (pop.last()?.phase !== 'error') await tick();
  }
}
/** A chooser that answers each call with the next of `discs`, recording the state and refusal it was asked with. */
function chooser(...discs: { request: DiscRequest; fromDisc?: boolean }[]): DiscChooser & { asked: [string, string][] } {
  const asked: [string, string][] = [];
  return { asked, choose: async (state, refusal) => { asked.push([state, refusal]); const d = discs.shift(); if (!d) throw new Error('no more discs'); return d; } };
}

describe('discForStart: whole -> stored at once, with no UI', () => {
  it('the kept extraction whole: { kind: stored, identity }, no chooser, no popover', async () => {
    await extractDisc(image(), {}, env);
    const ch = chooser();
    const pop = popover();
    const r = await discForStart({} as Document, { ...deps, chooser: ch, popover: pop });
    expect(r).toEqual({ kind: 'stored', identity: ID });
    expect(ch.asked).toEqual([]);
    expect(pop.views).toEqual([]);
  });

  it('with the disc of this visit (`present`): carried as the cut movies\' fallback', async () => {
    const disc = image();
    await extractDisc(disc, {}, env);
    const r = await discForStart({} as Document, { ...deps, chooser: chooser(), popover: popover(), present: () => disc });
    expect(r).toEqual({ kind: 'stored', identity: ID, disc });
  });
});

describe('discForStart: otherwise the chooser, then the popover', () => {
  it('none: the chooser asks, the popover extracts behind DX-1\'s hooks, done -> stored with that disc; a second call asks nothing', async () => {
    const disc = image();
    const ch = chooser({ request: disc });
    const pop = popover();
    const doc = {} as Document;
    const r = await discForStart(doc, { ...deps, chooser: ch, popover: pop, room: async () => 7e9 });
    expect(ch.asked).toEqual([['none', '']]);
    expect(r).toEqual({ kind: 'stored', identity: ID, disc });
    expect(pop.views[0]!.phase).toBe('plan');
    expect(pop.views.some((v) => v.phase === 'copy')).toBe(true);
    expect(pop.views.some((v) => v.room === 7e9)).toBe(true);
    expect(pop.last()).toMatchObject({ phase: 'done', done: pop.last()!.count });
    expect(pop.closed).toBe(1);
    expect(await extractionState(env)).toBe('whole');
    const again = chooser();
    expect(await discForStart(doc, { ...deps, chooser: again, popover: popover() })).toEqual({ kind: 'stored', identity: ID, disc });
    // Another document (another visit) reads storage again: whole, with no disc of its own.
    expect(await discForStart({} as Document, { ...deps, chooser: again, popover: popover() })).toEqual({ kind: 'stored', identity: ID });
    expect(again.asked).toEqual([]);
  });

  it('called twice at once: one start, one answer', async () => {
    const ch = chooser({ request: image() });
    const doc = {} as Document;
    const a = discForStart(doc, { ...deps, chooser: ch, popover: popover() });
    const b = discForStart(doc, { ...deps, chooser: ch, popover: popover() });
    expect(b).toBe(a);
    await a;
    expect(ch.asked).toHaveLength(1);
  });

  it('evicted and partial: the chooser is asked with the state (the evicted line is its)', async () => {
    for (const state of ['evicted', 'partial'] as const) {
      const ch = chooser({ request: image(), fromDisc: true });
      await discForStart({} as Document, { ...deps, state: async () => state, chooser: ch, popover: popover() });
      expect(ch.asked).toEqual([[state, '']]);
    }
  });

  it('a disc the player already goes on from (fromDisc): its own request, no popover', async () => {
    const disc = image();
    const pop = popover();
    expect(await discForStart({} as Document, { ...deps, chooser: chooser({ request: disc, fromDisc: true }), popover: pop })).toBe(disc);
    expect(pop.views).toEqual([]);
  });

  it('cancel keeps what is done; Resume resumes it to the end; Continue from the disc hands on the disc\'s own request', async () => {
    const disc = image();
    const pop = popover();
    let files = 0;
    // The extraction, cancelled by the popover at its third file.
    const extract: RunDeps['extract'] = (request, hooks, e) => extractDisc(request, { ...hooks, onFile: (p, i, n) => { hooks.onFile?.(p, i, n); if (++files === 3) pop.act('cancel'); } }, e);
    const started = discForStart({} as Document, { ...deps, extract, chooser: chooser({ request: disc }), popover: pop });
    while (pop.last()?.phase !== 'error') await tick();
    expect(pop.last()!.error!.reason).toBe('cancelled');
    const record = await storedExtraction(env.records);
    expect(record!.files.filter((f) => f.done).length).toBeGreaterThan(0);   // what is done is kept
    pop.act('retry');
    while (pop.last()?.phase !== 'error' && pop.last()?.phase !== 'done') await tick();
    expect(await started).toEqual({ kind: 'stored', identity: ID, disc });
    // A refusal, then Continue from the disc.
    const pop2 = popover();
    const refusing: RunDeps['extract'] = async () => { throw new DiscExtractError('quota', 'free 2 GB'); };
    const going = discForStart({} as Document, { ...deps, state: async () => 'partial', extract: refusing, chooser: chooser({ request: disc }), popover: pop2 });
    while (pop2.last()?.phase !== 'error') await tick();
    await twoMoreFailures(pop2);
    pop2.act('continue');
    expect(await going).toBe(disc);
    expect(pop2.closed).toBe(1);
  });

  it('a disc refused (F4: close): the chooser asks again, with the refusal\'s words', async () => {
    const pop = popover();
    let calls = 0;
    const extract: RunDeps['extract'] = async (request, hooks, e) => {
      if (calls++ === 0) throw new DiscExtractError('refused', 'this disc lacks 2 of the files the game reads');
      return extractDisc(request, hooks, e);
    };
    const ch = chooser({ request: image() }, { request: image() });
    const going = discForStart({} as Document, { ...deps, extract, chooser: ch, popover: pop });
    while (pop.last()?.phase !== 'error') await tick();
    pop.act('close');
    expect((await going).kind).toBe('stored');
    expect(ch.asked).toEqual([['none', ''], ['none', 'this disc lacks 2 of the files the game reads']]);
  });
});

describe('runExtraction: the popover\'s view of a run', () => {
  it('rejects an early continue act and only permits it after three failed attempts', async () => {
    const pop = popover();
    let calls = 0;
    let ended = false;
    const extract: RunDeps['extract'] = async () => { calls++; throw new DiscExtractError('failed', 'write failed'); };
    const out = runExtraction(image(), pop, { ...deps, extract }).then((r) => { ended = true; return r; });
    for (let attempt = 1; attempt <= 3; attempt++) {
      await tick();
      expect(calls).toBe(attempt);
      expect(pop.last()?.phase).toBe('error');
      if (attempt < 3) {
        pop.act('continue');
        await tick();
        expect(ended).toBe(false);
        pop.act('retry');
      }
    }
    pop.act('continue');
    expect((await out).kind).toBe('continue');
  });
  it('hooks onto views, the file count following the bytes (DX-2\'s F1), the run kept on an error', async () => {
    const pop = popover();
    const hooksSeen: ExtractHooks[] = [];
    const extract: RunDeps['extract'] = async (_r, hooks) => {
      hooksSeen.push(hooks);
      const files = [{ path: 'A', size: 100, sha256: null, done: false }, { path: 'B', size: 50, sha256: null, done: false }];
      hooks.onPlan?.(files, 150, 'opfs');
      hooks.onProgress?.(0, 150);
      hooks.onFile?.('A', 0, 2);
      hooks.onProgress?.(100, 150);
      throw new DiscExtractError('quota', 'full');
    };
    const out = runExtraction(image(), pop, { ...deps, extract, room: async () => null });
    while (pop.last()?.phase !== 'error') await tick();
    expect(pop.last()).toMatchObject({ phase: 'error', run: 'extract', done: 1, count: 2, doneBytes: 100 });
    expect(hooksSeen[0]!.signal).toBeInstanceOf(AbortSignal);
    await twoMoreFailures(pop);
    pop.act('continue');
    expect((await out).kind).toBe('continue');
  });
});

describe('the forge\'s start order: the extraction (whole) before the stored copy and the remembered disc', () => {
  const record = { identity: ID } as Pick<DiscExtractRecord, 'identity'>;
  const copy = image();
  const folder: DiscRequest = { kind: 'dir', entries: [] };
  it('whole: stored with fallback outside, the copy as its disc when it is the same disc, else the remembered one', async () => {
    const same = async () => ID;
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => copy, remembered: async () => folder, identity: same }))
      .toEqual({ kind: 'stored', identity: ID, disc: copy, fallback: 'outside' });
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => null, remembered: async () => folder, identity: same }))
      .toEqual({ kind: 'stored', identity: ID, disc: folder, fallback: 'outside' });
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => null, remembered: async () => null }))
      .toEqual({ kind: 'stored', identity: ID, fallback: 'outside' });
    // Another disc's copy is not the fallback (its campaign is not this disc's).
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => copy, remembered: async () => null, identity: async () => ({ ...ID, ver: '9.99' }) }))
      .toEqual({ kind: 'stored', identity: ID, fallback: 'outside' });
  });
  it('not whole: the stored copy, else the remembered disc, else null (the card asks)', async () => {
    for (const state of ['none', 'partial', 'evicted'] as const) {
      expect(await forgeDiscStart({ state: async () => state, record: async () => record, copy: async () => copy, remembered: async () => folder })).toBe(copy);
      expect(await forgeDiscStart({ state: async () => state, record: async () => record, copy: async () => null, remembered: async () => folder })).toBe(folder);
      expect(await forgeDiscStart({ state: async () => state, record: async () => record, copy: async () => null, remembered: async () => null })).toBeNull();
    }
  });
  it('the identity of a copy read off its SYSTEM.CNF by default (discIdentity over it)', async () => {
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => copy, remembered: async () => null }))
      .toEqual({ kind: 'stored', identity: ID, disc: copy, fallback: 'outside' });
    const other = image('1.03');
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => other, remembered: async () => null }))
      .toEqual({ kind: 'stored', identity: ID, fallback: 'outside' });
  });
  it('storedRequestOf: the identity copied, the disc and fallback only when given', () => {
    expect(storedRequestOf(record, null)).toEqual({ kind: 'stored', identity: ID });
    expect(storedRequestOf(record, null).identity).not.toBe(ID);
  });
});

describe('the forge page calls the order, and says "not on the disc kept in this browser" (FG.R12\'s words)', () => {
  it('forge/page.ts: forgeDiscStart before its card; the layout\'s lack in sourceWhere\'s words', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/forge/page.ts', import.meta.url), 'utf-8');
    const at = src.indexOf('const started = await forgeDiscStart(');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf("el(doc, 'div', 'fx-card fx-disc')"));
    expect(src).toMatch(/which \$\{lacking\.length === 1 \? 'is' : 'are'\} not on \$\{sourceWhere\(archives\.sourceRequest\(\)\)\} \(FG\.R12\)/);
  });
});

/** DX-3's fresh review (PASS WITH FINDINGS), folded: the start's and the forge's findings. */
describe('DX-3\'s review, folded (discStart)', () => {
  it('F6: a second discForStart in the same document after "continue from the disc" returns the same request, asking nothing', async () => {
    const disc = image();
    const doc = {} as Document;
    const pop = popover();
    const refusing: RunDeps['extract'] = async () => { throw new DiscExtractError('quota', 'free 2 GB'); };
    const first = discForStart(doc, { ...deps, extract: refusing, chooser: chooser({ request: disc }), popover: pop });
    while (pop.last()?.phase !== 'error') await tick();
    await twoMoreFailures(pop);
    pop.act('continue');
    expect(await first).toBe(disc);
    const again = chooser();
    const pop2 = popover();
    expect(await discForStart(doc, { ...deps, extract: refusing, chooser: again, popover: pop2 })).toBe(disc);
    expect(again.asked).toEqual([]);
    expect(pop2.views).toEqual([]);
    // `remember: false` (the console, which keeps its own state): asked again.
    const third = chooser({ request: disc, fromDisc: true });
    expect(await discForStart(doc, { ...deps, remember: false, chooser: third, popover: popover() })).toBe(disc);
    expect(third.asked).toHaveLength(1);
  });

  it('F4: the forge: a stored copy of another disc is passed over for the remembered disc that is this one', async () => {
    const record = { identity: ID } as Pick<DiscExtractRecord, 'identity'>;
    const other = image('1.03');
    const folder: DiscRequest = { kind: 'dir', entries: [] };
    const identity = async (d: DiscRequest) => (d === folder ? ID : { ...ID, ver: '1.03' });
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => other, remembered: async () => folder, identity }))
      .toEqual({ kind: 'stored', identity: ID, disc: folder, fallback: 'outside' });
    // Neither is this disc: no fallback.
    expect(await forgeDiscStart({ state: async () => 'whole', record: async () => record, copy: async () => other, remembered: async () => other, identity }))
      .toEqual({ kind: 'stored', identity: ID, fallback: 'outside' });
  });
});
