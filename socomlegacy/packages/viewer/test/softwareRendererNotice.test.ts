// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoftwareProbe } from '../src/softwareRenderer';

type NoticeModule = typeof import('../src/softwareRendererNotice');
let m: NoticeModule;

/** A window whose frame and timer run when the test says: the probe must wait for the first frame, never block. */
function fakeWin(navigator?: { webdriver?: boolean }): { win: Window; flush: () => void } {
  const queue: (() => void)[] = [];
  const win = {
    navigator,
    requestAnimationFrame: (cb: FrameRequestCallback) => { queue.push(() => cb(0)); return queue.length; },
    setTimeout: (cb: () => void) => { queue.push(cb); return queue.length; },
  } as unknown as Window;
  const flush = (): void => { while (queue.length) queue.shift()!(); };
  return { win, flush };
}

const SOFT: SoftwareProbe = { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', software: true };
const HARD: SoftwareProbe = { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)', software: false };

beforeEach(async () => {
  vi.resetModules();                                   // the dismissed flag is the module's: a fresh one per test
  m = await import('../src/softwareRendererNotice');
});
afterEach(() => { document.body.innerHTML = ''; });

describe('the no-GPU notice (browser adaptation, CPS-4c)', () => {
  it('says what the brief says, naming the renderer', () => {
    expect(m.softwareRendererText(SOFT.renderer)).toBe(
      `Hardware acceleration looks off in this browser (${SOFT.renderer}). The game will run slowly.`);
    expect(m.softwareRendererText(null)).toBe(
      'Hardware acceleration looks off in this browser (no WebGL context could be made). The game will run slowly.');
  });

  it('probes once, after the first frame, and shows the notice for a software renderer', () => {
    const { win, flush } = fakeWin();
    const probe = vi.fn(() => SOFT);
    m.watchSoftwareRenderer(document, win, probe);
    expect(probe).not.toHaveBeenCalled();                // never on the boot's own path
    expect(document.querySelector('[data-no-gpu]')).toBeNull();
    flush();
    expect(probe).toHaveBeenCalledTimes(1);
    const el = document.querySelector<HTMLElement>('[data-no-gpu]')!;
    expect(el).not.toBeNull();
    expect(el.classList.contains('s2u-notice')).toBe(true);
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain(SOFT.renderer!);
    expect(el.textContent).toContain('How to turn it on');
    expect(el.style.position).toBe('fixed');
    expect(el.style.background).toBe('');               // the design system's panel: no colour or type inline
    expect(document.querySelector('[data-graphics-lost]')).toBeNull();   // its own element, not graphicsLost's
  });

  it('never shows for a hardware renderer', () => {
    const { win, flush } = fakeWin();
    m.watchSoftwareRenderer(document, win, () => HARD);
    flush();
    expect(document.querySelector('[data-no-gpu]')).toBeNull();
  });

  it('the link opens the help sheet in the page: Chrome, Edge, Firefox, and the remote-desktop line', () => {
    const el = m.showSoftwareRendererNotice(document, SOFT.renderer);
    const help = el.querySelector<HTMLElement>('[data-no-gpu-help]')!;
    const open = el.querySelector<HTMLButtonElement>('[data-no-gpu-open]')!;
    expect(help.hidden).toBe(true);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    open.click();
    expect(help.hidden).toBe(false);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    const text = help.textContent!;
    expect(text).toContain('Chrome');
    expect(text).toContain('Settings > System > "Use graphics acceleration when available"');
    expect(text).toContain('relaunch');
    expect(text).toContain('Edge');
    expect(text).toContain('Settings > System and performance > "Use graphics acceleration when available"');
    expect(text).toContain('Firefox');
    expect(text).toContain('Settings > General > Performance');
    expect(text).toContain('"Use recommended performance settings"');
    expect(text).toContain('"Use hardware acceleration when available"');
    expect(text).toMatch(/remote desktop or a virtual machine/);
    open.click();
    expect(help.hidden).toBe(true);
  });

  it('dismiss removes it for the session: a second watch does not show it again', () => {
    const { win, flush } = fakeWin();
    m.watchSoftwareRenderer(document, win, () => SOFT);
    flush();
    document.querySelector<HTMLButtonElement>('[data-no-gpu-dismiss]')!.click();
    expect(document.querySelector('[data-no-gpu]')).toBeNull();
    const probe = vi.fn(() => SOFT);
    m.watchSoftwareRenderer(document, win, probe);
    flush();
    expect(document.querySelector('[data-no-gpu]')).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('one notice on the page, replacing an earlier one', () => {
    m.showSoftwareRendererNotice(document, 'llvmpipe');
    m.showSoftwareRendererNotice(document, 'softpipe');
    const all = document.querySelectorAll('[data-no-gpu]');
    expect(all.length).toBe(1);
    expect(all[0]!.textContent).toContain('softpipe');
  });

  it('under a test driver (navigator.webdriver true) no notice is made, though the probe says software', () => {
    const { win, flush } = fakeWin({ webdriver: true });
    const probe = vi.fn(() => SOFT);
    m.watchSoftwareRenderer(document, win, probe);
    flush();
    expect(document.querySelector('[data-no-gpu]')).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it("a player's browser (navigator.webdriver false) still gets it", () => {
    const { win, flush } = fakeWin({ webdriver: false });
    m.watchSoftwareRenderer(document, win, () => SOFT);
    flush();
    expect(document.querySelector('[data-no-gpu]')).not.toBeNull();
  });

  it('a probe that throws shows nothing and throws nothing', () => {
    const { win, flush } = fakeWin();
    m.watchSoftwareRenderer(document, win, () => { throw new Error('no canvas'); });
    expect(() => flush()).not.toThrow();
    expect(document.querySelector('[data-no-gpu]')).toBeNull();
  });
});
