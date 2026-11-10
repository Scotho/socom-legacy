// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMemberOverrides } from '@s2u/archive';
import { installModOverrides } from '../src/mods/override';
import { mountModPanel, type ModWorkerPort } from '../src/mods/panel';
import { memoryModLibrary, MOD_QUOTA_MESSAGE, type ModLibrary } from '../src/mods/store';
import { makeZip } from './zipFixture';

const enc = new TextEncoder();
const manifest = (over: Record<string, unknown> = {}): string => JSON.stringify({
  format: 's2u-mod', formatVersion: 1, id: 'hello-notes', name: 'Hello notes', version: '0.1.0',
  author: 'Dustin', description: 'Synthetic.', target: 'socom2-us-r0001',
  files: [{ path: 'NOTES/HELLO.TXT', file: 'HELLO.TXT' }], ...over,
});

function zip(body = manifest(), hello = 'hello from the mod'): Uint8Array {
  return makeZip([
    { name: 'mod.json', data: body, method: 0 },
    { name: 'HELLO.TXT', data: hello, method: 0 },
  ]);
}

afterEach(() => { installModOverrides(null); installMemberOverrides(null); localStorage.clear(); document.body.replaceChildren(); });

function mounted(library: ModLibrary = memoryModLibrary()): {
  panel: NonNullable<ReturnType<typeof mountModPanel>>;
  posted: unknown[];
  reloads: number;
  tellDisc: (paths: string[]) => void;
  library: ModLibrary;
} {
  document.body.innerHTML = '<div id="panel-body"></div>';
  const posted: unknown[] = [];
  const listeners: ((event: MessageEvent<{ kind?: string; paths?: string[] }>) => void)[] = [];
  const worker: ModWorkerPort = {
    postMessage: (message) => { posted.push(message); },
    addEventListener: (_type, listener) => { listeners.push(listener); },
  };
  const reloads = { n: 0 };
  const panel = mountModPanel(document, worker, { library, reloadMap: () => { reloads.n += 1; } });
  if (!panel) throw new Error('the panel did not mount');
  return {
    panel, posted, library,
    get reloads() { return reloads.n; },
    tellDisc: (paths) => { for (const listener of listeners) listener({ data: { kind: 'mod-disc', paths } } as MessageEvent<{ kind?: string; paths?: string[] }>); },
  };
}

const line = (): string => document.getElementById('mods-line')!.textContent ?? '';
const reload = async (): Promise<void> => { (document.getElementById('mod-reload-map') as HTMLButtonElement).click(); await new Promise((r) => setTimeout(r, 0)); };

/**
 * B206 ML-7 (plan 2026-11-06-mods-loader, ML.R14; OT.R110): the test room's mod panel is one line ("Mods: N on -- Home >
 * Experiments > Mods") and Reload map. The mods are added, switched, ordered and removed in Home > Experiments > Mods
 * (the one loader, the same store); Reload map reads them again, applies them, then reloads the map. The tables, the
 * worker's message and the store are as before.
 */
describe('the test room mod panel', () => {
  it('is one line and Reload map: none of the old pickers, switches or list', async () => {
    const view = mounted();
    await view.panel.ready;
    expect([...document.getElementById('mods')!.children].map((e) => e.id)).toEqual(['mods-line', 'mod-reload-map']);
    for (const id of ['mod-zip', 'mod-folder', 'mods-enabled', 'mod-list', 'mod-conflicts', 'mod-read', 'mod-store', 'mod-reload'])
      expect(document.getElementById(id), id).toBeNull();
    expect(line()).toBe('Mods: 0 on -- Home > Experiments > Mods.');
    expect((document.getElementById('mod-reload-map') as HTMLButtonElement).textContent).toBe('Reload map');
  });

  it('Reload map reads what MODS changed, applies it to the tables and the worker, then reloads the map; a conflict is in the line', async () => {
    const view = mounted();
    await view.panel.ready;
    await view.panel.addZip('hello.zip', zip());
    const kept = await view.library.read();
    expect(kept.packages.map((mod) => mod.id)).toEqual(['hello-notes']);
    expect(new TextDecoder().decode(kept.packages[0]!.files.find((file) => file.name === 'HELLO.TXT')!.bytes)).toBe('hello from the mod');
    expect(localStorage.getItem('s2u.viewer.mods')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('hello from the mod');
    // A person's own drop consents to the package; the global master stays a separate choice (MODS's).
    expect(kept.choices.enabled).toBe(false);
    expect(view.panel.isApplied('hello-notes')).toBe(false);
    expect(line()).toBe('Mods: 0 on -- Home > Experiments > Mods.');

    await view.library.writeChoices({ ...kept.choices, enabled: true });          // MODS: mods on
    await reload();
    await vi.waitFor(() => expect(view.reloads).toBe(1));
    expect(view.panel.isApplied('hello-notes')).toBe(true);
    expect(line()).toBe('Mods: 1 on -- Home > Experiments > Mods.');
    expect(view.posted.at(-1)).toEqual({ kind: 'mod-disc' });
    expect(view.posted.at(-2)).toMatchObject({ kind: 'mods', entries: [{ path: 'NOTES/HELLO.TXT' }] });

    await view.panel.addZip('other.zip', zip(manifest({ id: 'other-notes', name: 'Other notes' }), 'from the other mod'));
    await vi.waitFor(() => expect(line()).toContain('1 conflict: NOTES/HELLO.TXT, other-notes wins over hello-notes.'));
    expect(line()).toMatch(/^Mods: 2 on -- Home > Experiments > Mods\./);

    const now = await view.library.read();                                          // MODS: other-notes switched off
    await view.library.writeChoices({ ...now.choices, disabled: [...now.choices.disabled, 'other-notes'] });
    await reload();
    await vi.waitFor(() => expect(view.reloads).toBe(2));
    expect(line()).toBe('Mods: 1 on -- Home > Experiments > Mods.');
    expect(view.panel.isApplied('other-notes')).toBe(false);
    const sent = view.posted.at(-2) as { kind: string; entries: { path: string; bytes: Uint8Array }[] };
    expect(sent.entries.map((e) => [e.path, new TextDecoder().decode(e.bytes)])).toEqual([['NOTES/HELLO.TXT', 'hello from the mod']]);

    await view.library.remove('hello-notes');                                       // MODS: removed
    await reload();
    await vi.waitFor(() => expect(view.reloads).toBe(3));
    expect(line()).toBe('Mods: 0 on -- Home > Experiments > Mods.');
    expect(view.panel.isApplied('hello-notes')).toBe(false);
  });

  it.each(['zip', 'folder'] as const)('enables a human %s drop while retaining an unrelated disabled package and the existing master', async kind => {
    const library = memoryModLibrary();
    await library.put({ id: 'kept-off', label: 'Kept off', files: [
      { name: 'mod.json', bytes: enc.encode(manifest({ id: 'kept-off' })) }, { name: 'HELLO.TXT', bytes: enc.encode('kept off bytes') },
    ] });
    await library.writeChoices({ enabled: true, order: ['kept-off'], disabled: ['kept-off'] });
    const view = mounted(library); await view.panel.ready;
    if (kind === 'zip') await view.panel.addZip('hello.zip', zip());
    else await view.panel.addFolder('hello', [{ path: 'mod.json', bytes: enc.encode(manifest()) }, { path: 'HELLO.TXT', bytes: enc.encode('hello from the mod') }]);
    expect((await library.read()).choices).toEqual({ enabled: true, order: ['kept-off', 'hello-notes'], disabled: ['kept-off'] });
    expect(view.panel.isApplied('hello-notes')).toBe(true);
    expect(view.panel.isApplied('kept-off')).toBe(false);
    expect(line()).toBe('Mods: 1 on -- Home > Experiments > Mods.');
  });

  it('restores a stored mod without asking for a reload, and a full store names the limit', async () => {
    const library = memoryModLibrary();
    await library.put({
      id: 'hello-notes', label: 'hello.zip',
      files: [{ name: 'mod.json', bytes: enc.encode(manifest()) }, { name: 'HELLO.TXT', bytes: enc.encode('hello from the mod') }],
    });
    await library.writeChoices({ enabled: true, order: ['hello-notes'], disabled: [] });
    const view = mounted(library);
    await view.panel.ready;
    expect(view.panel.isApplied('hello-notes')).toBe(true);
    expect(view.posted.at(-2)).toMatchObject({ kind: 'mods', entries: [{ path: 'NOTES/HELLO.TXT' }] });
    expect(view.reloads).toBe(0);
    expect(line()).toBe('Mods: 1 on -- Home > Experiments > Mods.');

    document.body.replaceChildren();
    const full = mounted(memoryModLibrary(8));
    await full.panel.addZip('hello.zip', zip());
    expect(line()).toContain(MOD_QUOTA_MESSAGE);
    expect((await full.library.read()).packages).toEqual([]);
  });
});
