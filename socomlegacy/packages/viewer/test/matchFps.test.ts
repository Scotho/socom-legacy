// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FPS_SHOWN_KEY, mountFpsReadout } from '../src/matchFps';
import { documentFullscreen, toggleFullscreen } from '../src/mobileFullscreen';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import { Ui } from '../src/ui';

/**
 * cq41E0VR (product track, a browser adaptation): the match's frame-rate readout (SHOW FPS, off by default, the choice
 * kept on the page's settings path) and the one fullscreen helper both pages share -- each request on the element, each
 * exit on the document, the prefixed pair together.
 */
const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  vi.restoreAllMocks(); document.body.innerHTML = '';
  for (const key of ['exitFullscreen', 'fullscreenElement', 'fullscreenEnabled', 'webkitExitFullscreen', 'webkitFullscreenElement', 'webkitFullscreenEnabled']) Reflect.deleteProperty(document, key);
  for (const key of ['requestFullscreen', 'webkitRequestFullscreen']) Reflect.deleteProperty(document.documentElement, key);
});

function memory(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return { get: (k: string) => m.get(k) ?? null, set: vi.fn((k: string, v: string) => { m.set(k, v); }), m };
}

describe('SHOW FPS: the match\'s frame-rate readout', () => {
  it('is off by default: no readout shown, nothing written', () => {
    const store = memory();
    const r = mountFpsReadout(document.body, { smoothedMs: () => 20, store });
    expect(r.shown()).toBe(false);
    const el = document.querySelector<HTMLElement>('[data-match-fps]');
    expect(el).not.toBeNull();
    expect(el!.hidden).toBe(true);
    r.tick();
    expect(store.set).not.toHaveBeenCalled();
    r.dispose();
    expect(document.querySelector('[data-match-fps]')).toBeNull();
  });

  it('toggled on, shows the frame rate from smoothedMs (1000 / ms) and the frame time; toggled off, hides; the choice kept', () => {
    let ms = 20;
    const store = memory();
    const r = mountFpsReadout(document.body, { smoothedMs: () => ms, store });
    r.toggle();
    const el = document.querySelector<HTMLElement>('[data-match-fps]')!;
    expect(r.shown()).toBe(true);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('50 fps · 20.0 ms');
    ms = 16.7; r.tick();
    expect(el.textContent).toBe('60 fps · 16.7 ms');
    expect(store.m.get(FPS_SHOWN_KEY)).toBe('1');
    r.toggle();
    expect(el.hidden).toBe(true);
    expect(store.m.get(FPS_SHOWN_KEY)).toBe('0');
    r.dispose();
  });

  it('a stored choice is read at the mount, and the key is one of the page\'s', () => {
    const r = mountFpsReadout(document.body, { smoothedMs: () => 25, store: memory({ [FPS_SHOWN_KEY]: '1' }) });
    expect(r.shown()).toBe(true);
    const el = document.querySelector<HTMLElement>('[data-match-fps]')!;
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('-- fps');                   // no frame timed at the mount
    r.tick();
    expect(el.textContent).toBe('40 fps · 25.0 ms');
    expect(PAGE_SETTING_KEYS).toContain(FPS_SHOWN_KEY);
    r.dispose();
  });

  it('a storage that throws leaves the readout working, off', () => {
    const r = mountFpsReadout(document.body, { smoothedMs: () => 20, store: { get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); } } });
    expect(r.shown()).toBe(false);
    r.toggle();
    expect(r.shown()).toBe(true);
    r.dispose();
  });
});

describe('the shared fullscreen helper (./mobileFullscreen documentFullscreen)', () => {
  it('requests on the element, exits on the document, the prefixed pair when the standard is absent', async () => {
    const request = vi.fn(function (this: unknown) { expect(this).toBe(document.documentElement); });
    const exit = vi.fn(function (this: unknown) { expect(this).toBe(document); });
    Object.defineProperty(document.documentElement, 'webkitRequestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, value: exit });
    const fs = documentFullscreen(document);
    expect(fs.available()).toBe(true);
    await fs.request();
    expect(request).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, value: document.documentElement });
    expect(fs.active()).toBe(true);
    await fs.exit();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('is unavailable with no request on the element, or where the document refuses it (an iframe without the permission)', () => {
    Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, value: vi.fn() });
    expect(documentFullscreen(document).available()).toBe(false);
    expect(documentFullscreen(document).request()).toBeNull();
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: vi.fn() });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    expect(documentFullscreen(document).available()).toBe(false);
  });
});

describe('the START row\'s toggle (./mobileFullscreen toggleFullscreen): never a silent refusal', () => {
  it('a rejected request calls refused; a granted one does not', async () => {
    const refused = vi.fn();
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: vi.fn().mockRejectedValue(new TypeError('no activation')) });
    toggleFullscreen(documentFullscreen(document), refused);
    await Promise.resolve(); await Promise.resolve();
    expect(refused).toHaveBeenCalledTimes(1);
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    toggleFullscreen(documentFullscreen(document), refused);
    await Promise.resolve(); await Promise.resolve();
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('no request possible (none on the element, a thrown call) calls refused at once', () => {
    const refused = vi.fn();
    toggleFullscreen(documentFullscreen(document), refused);
    expect(refused).toHaveBeenCalledTimes(1);
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: () => { throw new Error('denied'); } });
    toggleFullscreen(documentFullscreen(document), refused);
    expect(refused).toHaveBeenCalledTimes(2);
  });

  it('the exit never calls refused, even when it rejects', async () => {
    const refused = vi.fn();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: vi.fn().mockRejectedValue(new Error('x')) });
    toggleFullscreen(documentFullscreen(document), refused);
    await Promise.resolve(); await Promise.resolve();
    expect(refused).not.toHaveBeenCalled();
  });
});

describe('the test room\'s fullscreen button (ui.ts onFullscreen) pairs request with request, exit with exit', () => {
  const html = readFileSync(resolve(here, '../setup/index.html'), 'utf-8');
  const load = (): HTMLButtonElement => {
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
    new Ui().onFullscreen();
    return document.getElementById('fullscreen') as HTMLButtonElement;
  };

  it('with only the prefixed exit present, a click asks no exit as a request', () => {
    const exit = vi.fn();
    Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, value: exit });
    load().click();
    expect(exit).not.toHaveBeenCalled();
  });

  it('the prefixed request on the element, then the prefixed exit on the document once fullscreen', () => {
    const request = vi.fn(function (this: unknown) { expect(this).toBe(document.documentElement); });
    const exit = vi.fn(function (this: unknown) { expect(this).toBe(document); });
    Object.defineProperty(document.documentElement, 'webkitRequestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, value: exit });
    const button = load();
    button.click();
    expect(request).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, value: document.documentElement });
    button.click();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('the front end match mounts both rows (matchMount.ts)', () => {
  it('hands the START menu its adaptations and ticks the readout on the frame counter\'s tick', () => {
    const mount = readFileSync(resolve(here, '../src/matchMount.ts'), 'utf-8');
    expect(mount).toMatch(/adaptations: \{ fullscreen: matchFullscreen, fps \},/);
    expect(mount).toMatch(/toggle: \(refused: \(\) => void\): void => \{ toggleFullscreen\(docFullscreen, refused\); \},/);
    expect(mount).toMatch(/if \(adaptiveRatio\.frame\([^\n]*\)\) fpsReadout\?\.tick\(\);/);
    // B199's merge of main (cd95369d4) folded `matchAbort.reset();` into this line's comment: the reset on a line of its own.
    expect(mount).toMatch(/fpsReadout\?\.dispose\(\);[^\n]*\n\s*matchAbort\.reset\(\);/);
  });

  it('IP3: the readout is made at the attach, with the START menu -- a prepare puts nothing on the page', () => {
    const mount = readFileSync(resolve(here, '../src/matchMount.ts'), 'utf-8');
    const attach = mount.indexOf('const attachTo = ');
    expect(attach).toBeGreaterThan(0);
    expect(mount.indexOf('mountFpsReadout(')).toBeGreaterThan(attach);
    expect(mount.indexOf('mountFpsReadout(')).toBeLessThan(mount.indexOf('new StartMenu({', attach));
  });
});
