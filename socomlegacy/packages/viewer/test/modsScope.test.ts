// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMemberOverrides, memberOverridesActive } from '@s2u/archive';
import { applyOverrideSource, installModOverrides, modOverridesActive } from '../src/mods/override';
import { MODS_READY_WAIT_ADAPTATION, mountModPanel, type ModWorkerPort } from '../src/mods/panel';
import { folderPickProblem, MOD_PICK_LIMITS, zipPickProblem } from '../src/mods/readPackage';
import { lazyModLibrary, memoryModLibrary, MODS_PRESENT_KEY, type ModLibrary } from '../src/mods/store';
import { PAGE_SETTING_KEYS } from '../src/pageStore';

/**
 * MODS_SCOPE_ADAPTATION (the owner, 2026-10-19, in the merge controller's seat): "Release too, offline or forge lobbies
 * only for now", then "actually, test room online is fine if you can differentiate that from a lobby match through the
 * standard ui paths sanely". The test room's mods ship in every build and apply offline and online in the test room;
 * a lobby match reached through the standard paths never reads them, because those run on the front end's page and
 * worker, which never load the mod modules or receive their tables; and the console's replay viewer, framing the test
 * room, mounts no panel (a replay was recorded without mods). A boot with no mods opens no store and is never held up
 * by one. A browser adaptation, nothing of the game.
 */
const SRC = resolve(fileURLToPath(import.meta.url), '../../src');
const text = (path: string): string => readFileSync(join(SRC, path), 'utf-8');
function sources(dir: string): string[] {
  return readdirSync(join(SRC, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(SRC, rel)).isDirectory() ? sources(rel) : /\.ts$/.test(name) ? [rel] : [];
  });
}

afterEach(() => { installModOverrides(null); installMemberOverrides(null); localStorage.clear(); document.body.replaceChildren(); vi.useRealTimers(); });

describe('MODS_SCOPE_ADAPTATION: where the test room\'s mods reach', () => {
  it('(a) the standard lobby paths never load the mod modules or send their tables', () => {
    const paths = ['frontEnd.ts', 'lobbyMatch.ts', 'matchMount.ts', 'gameLobbyHost.ts', 'inviteHost.ts', ...sources('console'), ...sources('forge')];
    for (const path of paths) {
      const src = text(path);
      expect(src, path).not.toMatch(/from ['"][./]*(?:\.\.\/)*mods\//);
      expect(src, path).not.toMatch(/kind: 'mods'/);
    }
  });

  // The review's F4: the stronger pin -- whatever imports the override module, only the panel and the map worker
  // install a table or send one.
  it('(a2) only the mod panel and the map worker install or send override tables', () => {
    // mods/store.ts (FCW-06, the Forge batch): its `kind: 'mods'` names the registry's scope descriptor over the mods
    // database, not an override table; it installs none (checked below).
    const allowed = new Set(['mods/panel.ts', 'worker.ts', 'mods/override.ts', 'mods/store.ts']);
    expect(text('mods/store.ts')).not.toMatch(/\binstall(?:Mod|Member)Overrides\(/);
    for (const path of sources('.').map((p) => p.replace(/^\.\//, ''))) {
      const src = text(path);
      if (/\binstall(?:Mod|Member)Overrides\(|kind: ['"]mods['"]/.test(src)) expect(allowed.has(path), path).toBe(true);
    }
  });

  it('(b) a fresh worker or page context reads the disc as main does until a table is installed', () => {
    expect(modOverridesActive()).toBe(false);
    expect(memberOverridesActive()).toBe(false);
    const source = { readRange: async () => new Uint8Array(0), size: async () => 0 } as unknown as Parameters<typeof applyOverrideSource>[0];
    expect(applyOverrideSource(source)).toBe(source);
  });

  it('(c) the console\'s replay viewer, framing the test room, mounts no mod panel', () => {
    expect(text('main.ts')).toMatch(/modPanel = REPLAY_WORLD \? null : mountModPanel\(/);
  });
});

describe('a boot with no mods: no store opened, never held up', () => {
  it('the lazy library opens nothing until a mod is put, and remembers that one exists', async () => {
    let opened = 0;
    const lib = lazyModLibrary(localStorage, () => { opened += 1; return memoryModLibrary(); });
    expect(await lib.read()).toEqual({ choices: { enabled: false, order: [], disabled: [] }, packages: [] });
    await lib.writeChoices({ enabled: true, order: [], disabled: [] });
    expect(opened).toBe(0);
    await lib.put({ id: 'one', label: 'one.zip', files: [{ name: 'mod.json', bytes: new Uint8Array([1]) }] });
    expect(opened).toBe(1);
    expect(localStorage.getItem(MODS_PRESENT_KEY)).toBe('1');
    expect(PAGE_SETTING_KEYS).toContain(MODS_PRESENT_KEY);
  });

  it('a storage that throws reads as no mods, and a put still tries the store', async () => {
    let opened = 0;
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    const lib = lazyModLibrary(broken, () => { opened += 1; return memoryModLibrary(); });
    expect((await lib.read()).packages).toEqual([]);
    expect(opened).toBe(0);
    await lib.put({ id: 'one', label: 'one.zip', files: [] });
    expect(opened).toBe(1);
  });

  it('a store that never answers holds the boot only for the bounded wait, and says so', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="panel-body"></div>';
    const never: ModLibrary = { read: () => new Promise(() => {}), put: async () => {}, writeChoices: async () => {}, remove: async () => {} };
    const panel = mountModPanel(document, null, { library: never })!;
    let done = false;
    void panel.ready.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(MODS_READY_WAIT_ADAPTATION + 1);
    expect(done).toBe(true);
    expect(document.getElementById('mods')!.textContent).toMatch(/mods are off/i);
  });

  // The review's F1: a store answering after the wait switched mods on part-way through the visit.
  it('a store that answers after the wait keeps its mods off for this visit, and says so', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="panel-body"></div>';
    let answer!: (v: Awaited<ReturnType<ModLibrary['read']>>) => void;
    const late: ModLibrary = { read: () => new Promise((r) => { answer = r; }), put: async () => {}, writeChoices: async () => {}, remove: async () => {} };
    const panel = mountModPanel(document, null, { library: late })!;
    await vi.advanceTimersByTimeAsync(MODS_READY_WAIT_ADAPTATION + 1);
    await panel.ready;
    const enc = new TextEncoder();
    const manifest = JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'late', name: 'Late', version: '1', author: 'x', description: 'x',
      target: 'socom2-us-r0001', files: [{ path: 'NOTES/HELLO.TXT', file: 'HELLO.TXT' }] });
    answer({ choices: { enabled: true, order: ['late'], disabled: [] }, packages: [{ id: 'late', label: 'late.zip',
      files: [{ name: 'mod.json', bytes: enc.encode(manifest) }, { name: 'HELLO.TXT', bytes: enc.encode('hi') }] }] });
    await vi.advanceTimersByTimeAsync(10);
    expect(modOverridesActive()).toBe(false);
    expect((document.getElementById('mods-enabled') as HTMLInputElement).checked).toBe(false);
    expect(document.getElementById('mods')!.textContent).toMatch(/off for this visit/i);
    expect(document.getElementById('mods')!.textContent).toContain('Late');
  });

  // The re-review's N1 and N2: after a late answer, a visitor's later change wrote "off" for the next visit too, and a
  // Reload forgot that the visitor had already turned mods on.
  function lateMount(): { answer: (v: Awaited<ReturnType<ModLibrary['read']>>) => void; written: unknown[] } {
    document.body.innerHTML = '<div id="panel-body"></div>';
    const written: unknown[] = [];
    let answer!: (v: Awaited<ReturnType<ModLibrary['read']>>) => void;
    const lib: ModLibrary = { read: () => new Promise((r) => { answer = r; }), put: async () => {}, writeChoices: async (c) => { written.push(c); }, remove: async () => {} };
    mountModPanel(document, null, { library: lib, reloadMap: () => {} });
    return { get answer() { return answer; }, written };
  }
  const lateMod = () => {
    const enc = new TextEncoder();
    const manifest = JSON.stringify({ format: 's2u-mod', formatVersion: 1, id: 'late', name: 'Late', version: '1', author: 'x', description: 'x',
      target: 'socom2-us-r0001', files: [{ path: 'NOTES/HELLO.TXT', file: 'HELLO.TXT' }] });
    return { id: 'late', label: 'late.zip', files: [{ name: 'mod.json', bytes: enc.encode(manifest) }, { name: 'HELLO.TXT', bytes: enc.encode('hi') }] };
  };

  it('N1: a change after a late answer keeps the saved switch on for the next visit', async () => {
    vi.useFakeTimers();
    const m = lateMount();
    await vi.advanceTimersByTimeAsync(MODS_READY_WAIT_ADAPTATION + 1);
    m.answer({ choices: { enabled: true, order: ['late'], disabled: [] }, packages: [lateMod()] });
    await vi.advanceTimersByTimeAsync(10);
    const box = document.querySelector<HTMLInputElement>('[data-mod-toggle="late"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);
    expect(m.written.at(-1)).toMatchObject({ enabled: true, disabled: ['late'] });
    expect(modOverridesActive()).toBe(false);
  });

  it('N2: mods turned on before a late answer stay on, through a Reload', async () => {
    vi.useFakeTimers();
    const m = lateMount();
    await vi.advanceTimersByTimeAsync(MODS_READY_WAIT_ADAPTATION + 1);
    const master = document.getElementById('mods-enabled') as HTMLInputElement;
    master.checked = true;
    master.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(10);
    (document.getElementById('mod-reload-map') as HTMLButtonElement).click();
    m.answer({ choices: { enabled: false, order: ['late'], disabled: [] }, packages: [lateMod()] });
    await vi.advanceTimersByTimeAsync(10);
    expect(master.checked).toBe(true);
  });

  // The re-review's N3: a store that cannot be opened reads as empty; that is not an emptied store.
  it('N3: a store that cannot be opened keeps the flag', async () => {
    localStorage.setItem(MODS_PRESENT_KEY, '1');
    const blocked: ModLibrary = { read: async () => ({ choices: { enabled: false, order: [], disabled: [] }, packages: [], unavailable: true }), put: async () => {}, writeChoices: async () => {}, remove: async () => {} };
    await lazyModLibrary(localStorage, () => blocked).read();
    expect(localStorage.getItem(MODS_PRESENT_KEY)).toBe('1');
  });

  // The review's F2: a flag left set over an empty or evicted store never cleared.
  it('a flag over an empty store is cleared at the read', async () => {
    localStorage.setItem(MODS_PRESENT_KEY, '1');
    const lib = lazyModLibrary(localStorage, () => memoryModLibrary());
    expect((await lib.read()).packages).toEqual([]);
    expect(localStorage.getItem(MODS_PRESENT_KEY)).toBeNull();
  });

  it('asks the disc listing only while a mod is held', async () => {
    document.body.innerHTML = '<div id="panel-body"></div>';
    const posted: unknown[] = [];
    const worker: ModWorkerPort = { postMessage: (m) => { posted.push(m); } };
    const panel = mountModPanel(document, worker, { library: memoryModLibrary() })!;
    await panel.ready;
    expect(panel.wantsDisc()).toBe(false);
    expect(posted.filter((m) => (m as { kind: string }).kind === 'mod-disc')).toEqual([]);
  });
});

describe('a pick is bounded before it is read', () => {
  it('refuses a folder past the file count or the total bytes, and a zip past its size', () => {
    expect(folderPickProblem(Array.from({ length: 3 }, () => ({ size: 10 })))).toBeNull();
    expect(folderPickProblem(Array.from({ length: MOD_PICK_LIMITS.folderFiles + 1 }, () => ({ size: 1 })))).toMatch(/files/);
    expect(folderPickProblem([{ size: MOD_PICK_LIMITS.totalBytes + 1 }])).toMatch(/large/);
    expect(zipPickProblem(10)).toBeNull();
    expect(zipPickProblem(MOD_PICK_LIMITS.totalBytes + 1)).toMatch(/large/);
  });
});
