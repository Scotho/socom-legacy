// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROBLEM_REPORT_FORMAT, buildProblemReport, mountReport, problemFileName } from '../../../src/modern/report';
import type { LauncherContext } from '../../../src/modern';
import { fakeLauncher, fakeSession } from '../lobbies/fixtures';

/**
 * FB-1 (`docs/plans/briefs/modern-ui-live-site-scope.md` 2.4, 6; MU.R22, MU.R24 Q-B): "Report a problem" saves one file
 * in the page and sends nothing. A browser adaptation with no original (the project's own tool).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src/modern/report/index.ts');
const code = (): string => readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const ctx = (mode: 'setup' | 'overlay' = 'setup'): LauncherContext => ({
  state: fakeLauncher('ready'), session: fakeSession('signed-in'), mode,
});

describe('the module sends nothing anywhere', () => {
  it('its source names no network call', () => {
    for (const word of ['fetch', 'WebSocket', 'sendBeacon', 'XMLHttpRequest', 'EventSource', 'RTCPeerConnection', 'import(']) {
      expect(code(), word).not.toContain(word);
    }
  });
  it('its source reads neither the ticket nor the account name nor the image name nor storage', () => {
    expect(code()).not.toMatch(/\.ticket\(|\.account\(|\.filename\(|localStorage|sessionStorage/);
  });
});

describe('the dialog', () => {
  let host: HTMLElement, made: Blob[], names: string[];
  beforeEach(() => {
    document.body.innerHTML = '<button id="opener">Report</button><div id="host"></div>';
    host = document.getElementById('host')!; made = []; names = [];
  });
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
  const mount = (extra: Record<string, unknown> = {}, c = ctx()) => mountReport(host, c, {
    urls: { createObjectURL: (b: Blob) => { made.push(b); return 'blob:r'; }, revokeObjectURL: () => {} },
    download: (a: HTMLAnchorElement) => { names.push(a.download); },
    now: () => new Date('2026-10-10T12:00:00Z'), revision: 'abc1234', ...extra,
  });
  const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]')!;
  const btn = (a: string) => dialog().querySelector<HTMLButtonElement>(`button[data-action="${a}"]`)!;
  const json = async (b: Blob) => JSON.parse(await b.text()) as Record<string, unknown>;
  const png = async () => new Blob(['png'], { type: 'image/png' });

  it("is a labelled modal dialog, closed until open(); focus in the textarea; says it is the project's own tool", () => {
    const r = mount();
    expect(dialog().hidden).toBe(true);
    r.open();
    const d = dialog();
    expect(d.hidden).toBe(false);
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.querySelector('#' + d.getAttribute('aria-labelledby'))!.textContent).toBe('Report a problem');
    expect(d.textContent).toContain('What happened?');
    expect(d.textContent).toMatch(/this project's own tool/i);
    expect(d.textContent).toMatch(/nothing is sent/i);
    expect(document.activeElement).toBe(d.querySelector('textarea'));
    expect(d.querySelector('label[for="' + d.querySelector('textarea')!.id + '"]')).toBeTruthy();
  });

  it('Escape cancels, saves nothing and returns the focus', () => {
    const r = mount();
    (document.getElementById('opener') as HTMLElement).focus();
    r.open();
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(dialog().hidden).toBe(true);
    expect(made).toHaveLength(0);
    expect(document.activeElement).toBe(document.getElementById('opener'));
  });

  it('Cancel closes without a file; Tab from the last control wraps inside the dialog', () => {
    const r = mount();
    r.open();
    btn('cancel').click();
    expect(dialog().hidden).toBe(true);
    expect(made).toHaveLength(0);
    r.open();
    btn('save').focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    btn('save').dispatchEvent(e);
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(btn('save'));
  });

  it('Save downloads one JSON file with the typed words and the context, and no screenshot unless asked', async () => {
    const fetch = vi.fn(), socket = vi.fn(), beacon = vi.fn();
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', socket);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const r = mount({ capture: png });
    r.open();
    dialog().querySelector('textarea')!.value = 'The lobby list stays empty.';
    btn('save').click();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(names).toEqual(['redotcom-problem-2026-10-10T12-00-00-000Z.json']);
    const f = await json(made[0]!);
    expect(f['format']).toBe(PROBLEM_REPORT_FORMAT);
    expect(f['whatHappened']).toBe('The lobby list stays empty.');
    expect(f['screenshot']).toBeNull();
    expect(f['revision']).toBe('abc1234');
    expect(f['savedAt']).toBe('2026-10-10T12:00:00.000Z');
    expect(f['context']).toMatchObject({ mode: 'setup', disc: 'ready', session: 'signed-in' });
    expect(Array.isArray(f['notes'])).toBe(true);
    expect(fetch).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled(); expect(beacon).not.toHaveBeenCalled();
    expect(dialog().hidden).toBe(true);
  });

  it('the screenshot is offered only with a capture source, and is embedded as a PNG when ticked', async () => {
    const none = mount();
    none.open();
    expect(dialog().querySelector('input[type="checkbox"]')).toBeNull();
    none.dispose();
    const r = mount({ capture: png });
    r.open();
    const box = dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(false);
    box.checked = true;
    btn('save').click();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(String((await json(made[0]!))['screenshot'])).toMatch(/^data:image\/png;base64,/);
  });

  it('a canvas may be handed instead of a function (canvas.toBlob)', async () => {
    const canvas = document.createElement('canvas');
    canvas.toBlob = (cb: BlobCallback) => { cb(new Blob(['x'], { type: 'image/png' })); };
    const r = mount({ capture: canvas });
    r.open();
    dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true;
    btn('save').click();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(String((await json(made[0]!))['screenshot'])).toMatch(/^data:image\/png/);
  });

  it('a failed capture still saves the file, with the screenshot null and said', async () => {
    const r = mount({ capture: async () => { throw new Error('tainted'); } });
    r.open();
    dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true;
    btn('save').click();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    const f = await json(made[0]!);
    expect(f['screenshot']).toBeNull();
    expect(JSON.stringify(f['notes'])).toContain('screenshot');
  });

  it('Escape or Cancel while the capture is in flight saves nothing', async () => {
    let release: (b: Blob) => void = () => {};
    const r = mount({ capture: () => new Promise<Blob>((res) => { release = res; }) });
    r.open();
    dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true;
    btn('save').click();
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    release(new Blob(['png'], { type: 'image/png' }));
    await new Promise((res) => setTimeout(res, 30));
    expect(made).toHaveLength(0);
    expect(names).toEqual([]);
    expect(btn('save').disabled).toBe(false);
  });

  it('a capture that answers null saves the file with no screenshot, said', async () => {
    const r = mount({ capture: async () => null });
    r.open();
    dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = true;
    btn('save').click();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    const f = await json(made[0]!);
    expect(f['screenshot']).toBeNull();
    expect(JSON.stringify(f['notes'])).toContain('screenshot');
  });

  it('inertRoot: the background is inert while open, and free again on close', () => {
    const bg = document.createElement('div');
    document.body.append(bg);
    const r = mount({ inertRoot: bg });
    expect(bg.hasAttribute('inert')).toBe(false);
    r.open();
    expect(bg.hasAttribute('inert')).toBe(true);
    r.close();
    expect(bg.hasAttribute('inert')).toBe(false);
    r.open(); r.dispose();
    expect(bg.hasAttribute('inert')).toBe(false);
  });

  it('works in an overlay: any bare host, no setup DOM read', () => {
    const r = mount({}, ctx('overlay'));
    r.open();
    expect(dialog().hidden).toBe(false);
    expect(document.querySelector('#disc-page')).toBeNull();
  });
});

describe('the file', () => {
  it('holds its listed fields only: the state words, no ticket, name, password or address', () => {
    const f = buildProblemReport({
      text: 'hello', ctx: ctx(), revision: 'r1', at: new Date(0), screenshot: null,
      env: { userAgent: 'UA', width: 800, height: 600 },
    });
    expect(Object.keys(f).sort()).toEqual(['context', 'format', 'notes', 'revision', 'savedAt', 'screenshot', 'whatHappened']);
    expect(Object.keys(f.context).sort()).toEqual(['disc', 'mode', 'session', 'userAgent', 'viewport']);
    expect(f.context.viewport).toBe('800x600');
    expect(JSON.stringify({ ...f, notes: [] })).not.toMatch(/ticket|token|password|bearer/i);   // the notes say what is not recorded
    expect(problemFileName(new Date(0))).toBe('redotcom-problem-1970-01-01T00-00-00-000Z.json');
  });
});
