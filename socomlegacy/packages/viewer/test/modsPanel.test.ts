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

describe('the test room mod panel', () => {
  it('shows a loaded mod, a conflict the lower row wins, and reads the mod bytes only while mods are on', async () => {
    const view = mounted();
    await view.panel.ready;
    expect(document.getElementById('mod-reload')!.hidden).toBe(true);
    await view.panel.addZip('hello.zip', zip());
    const row = document.querySelector('#mod-list li') as HTMLElement;
    expect(row.dataset['state']).toBe('loaded');
    expect(row.textContent).toContain('Hello notes');
    expect(row.textContent).toContain('loaded');
    expect(row.textContent).toContain('NOTES/HELLO.TXT added');
    expect(document.getElementById('mod-read')!.dataset['from']).toBe('none');
    expect(document.getElementById('mod-read')!.textContent).toContain('No active override.');
    expect(document.getElementById('mod-reload')!.hidden).toBe(false);
    expect(document.getElementById('mod-reload')!.textContent).toContain('Reload map to apply');
    expect(localStorage.getItem('s2u.viewer.mods')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('hello from the mod');
    const kept = await view.library.read();
    expect(kept.packages.map((mod) => mod.id)).toEqual(['hello-notes']);
    expect(new TextDecoder().decode(kept.packages[0]!.files.find((file) => file.name === 'HELLO.TXT')!.bytes)).toBe('hello from the mod');

    // A person's own drop consents to the package. The global master remains a separate choice.
    const firstBox = document.querySelector('[data-mod-toggle="hello-notes"]') as HTMLInputElement;
    expect(firstBox.checked).toBe(true);
    expect(kept.choices.enabled).toBe(false);
    expect(kept.choices.disabled).not.toContain('hello-notes');

    const master = document.getElementById('mods-enabled') as HTMLInputElement;
    master.checked = true;
    master.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.getElementById('mod-read')!.dataset['from']).toBe('mod'));
    expect(document.getElementById('mod-read')!.textContent).toContain('NOTES/HELLO.TXT');
    expect(document.getElementById('mod-read')!.textContent).toContain('hello from the mod');
    expect((await view.library.read()).choices).toMatchObject({ enabled: true, order: ['hello-notes'] });
    expect(view.posted.at(-1)).toEqual({ kind: 'mod-disc' });
    expect(view.posted.at(-2)).toMatchObject({ kind: 'mods', entries: [{ path: 'NOTES/HELLO.TXT' }] });

    view.tellDisc(['notes/hello.txt']);
    await vi.waitFor(() => expect(document.querySelector('[data-mod-id="hello-notes"]')!.textContent).toContain('NOTES/HELLO.TXT replaces'));

    const other = zip(manifest({ id: 'other-notes', name: 'Other notes' }), 'from the other mod');
    await view.panel.addZip('other.zip', other);
    expect((await view.library.read()).choices.enabled).toBe(true);
    expect((await view.library.read()).choices.disabled).not.toContain('other-notes');
    await vi.waitFor(() => expect(document.getElementById('mod-conflicts')!.textContent).toContain('other-notes wins'));
    expect(document.getElementById('mod-conflicts')!.textContent).toContain('Conflict NOTES/HELLO.TXT: other-notes wins over hello-notes');
    expect(document.getElementById('mod-read')!.textContent).toContain('from the other mod');

    const otherRow = document.querySelector('[data-mod-id="other-notes"]') as HTMLElement;
    const box = otherRow.querySelector('input') as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.getElementById('mod-read')!.textContent).toContain('hello from the mod'));

    (document.getElementById('mod-reload-map') as HTMLButtonElement).click();
    expect(view.reloads).toBe(1);
    expect(document.getElementById('mod-reload')!.hidden).toBe(true);

    (document.querySelector('[data-mod-id="hello-notes"] [data-mod-remove]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('[data-mod-id="hello-notes"]')).toBeNull());
    expect((await view.library.read()).packages.map((mod) => mod.id)).toEqual(['other-notes']);

    await view.panel.addZip('bad.zip', enc.encode('not-a-zip'));
    const invalid = [...document.querySelectorAll('#mod-list li')].find((item) => (item as HTMLElement).dataset['state'] === 'invalid') as HTMLElement | undefined;
    expect(invalid?.textContent).toContain('invalid:');
    expect(invalid?.textContent).toMatch(/zip|central directory/);

    await view.panel.addZip('eu.zip', zip(manifest({ id: 'eu-notes', target: 'socom2-eu' })));
    const refused = [...document.querySelectorAll('#mod-list li')].find((item) => (item as HTMLElement).textContent?.includes('eu.zip')) as HTMLElement | undefined;
    expect(refused?.dataset['state']).toBe('invalid');
    expect(refused?.textContent).toContain('target must be "socom2-us-r0001"');
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
    expect(document.querySelector('[data-mod-id="hello-notes"]')?.getAttribute('data-state')).toBe('loaded');
    expect(view.panel.isApplied('hello-notes')).toBe(true);
    expect(view.panel.isApplied('kept-off')).toBe(false);
    expect(document.getElementById('mod-read')!.textContent).toContain('hello from the mod');
  });

  it('tags a saved replacement as added until the disc listing arrives, then as replaces', async () => {
    const library = memoryModLibrary();
    const body = manifest({
      id: 'uimnloc', name: 'Armory text',
      files: [{ path: 'RUN/LOCALE/STATES/UIMNLOC.ZAR', file: 'UIMNLOC.ZAR' }],
    });
    await library.put({
      id: 'uimnloc', label: 'uimnloc.zip',
      files: [
        { name: 'mod.json', bytes: enc.encode(body) },
        { name: 'UIMNLOC.ZAR', bytes: enc.encode('armory text') },
      ],
    });
    await library.writeChoices({ enabled: true, order: ['uimnloc'], disabled: [] });
    const view = mounted(library);
    await view.panel.ready;
    const row = (): HTMLElement => document.querySelector('[data-mod-id="uimnloc"]') as HTMLElement;
    expect(row().textContent).toContain('RUN/LOCALE/STATES/UIMNLOC.ZAR added');
    // Startup asks before a source exists. An empty answer must not be the last word.
    view.tellDisc([]);
    expect(row().textContent).toContain('RUN/LOCALE/STATES/UIMNLOC.ZAR added');
    view.tellDisc(['run\\locale\\states\\uimnloc.zar']);
    await vi.waitFor(() => expect(row().textContent).toContain('RUN/LOCALE/STATES/UIMNLOC.ZAR replaces'));
  });

  it('restores a stored mod without asking for a reload, and a full store names the limit', async () => {
    const library = memoryModLibrary();
    const body = manifest();
    await library.put({
      id: 'hello-notes', label: 'hello.zip',
      files: [{ name: 'mod.json', bytes: enc.encode(body) }, { name: 'HELLO.TXT', bytes: enc.encode('hello from the mod') }],
    });
    await library.writeChoices({ enabled: true, order: ['hello-notes'], disabled: [] });
    const view = mounted(library);
    await view.panel.ready;
    const row = document.querySelector('[data-mod-id="hello-notes"]') as HTMLElement;
    expect(row.dataset['state']).toBe('loaded');
    expect(document.getElementById('mod-read')!.dataset['from']).toBe('mod');
    expect(document.getElementById('mod-read')!.textContent).toContain('hello from the mod');
    expect(document.getElementById('mod-reload')!.hidden).toBe(true);

    document.body.replaceChildren();
    const full = mounted(memoryModLibrary(8));
    await full.panel.addZip('hello.zip', zip());
    const refused = document.querySelector('#mod-list li') as HTMLElement;
    expect(refused.dataset['state']).toBe('invalid');
    expect(refused.textContent).toContain(MOD_QUOTA_MESSAGE);
    expect((await full.library.read()).packages).toEqual([]);
  });
});
