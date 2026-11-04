import { expect, test, type Page } from '@playwright/test';

/**
 * LATER 68 (the merge controller's product-track call, 2026-10-21): the forge lobby's window (`../src/forge/lobby/window.ts`
 * `ForgeWindow`, its `LobbyView`) on a phone. Its 480 px floor ran it 70-120 px past a phone's right edge -- the close
 * button, the TERRORISTS list, the chat's TEAM and the controls' right end. The floor yields to the screen: the window
 * lies inside it, both lists side by side, a long name ellipsised, and the controls reachable (fitting, or the body
 * scrolled). Wider screens are unchanged. The real classes mounted on /forge with a sample lobby -- no server; a
 * browser adaptation (OT.R28).
 */
test.use({ storageState: { cookies: [], origins: [] } });

type Box = [number, number, number, number];
interface Measure { W: number; H: number; window: Box; parts: Record<string, Box | null>; past: string[]; controls: number; longName: { clipped: boolean; overflow: string } | null }

/** The window and its view mounted with 8 SEALs (one with a long name: 30 W, wider than any phone's column) and 8 terrorists, the host's controls shown. */
async function mount(page: Page): Promise<Measure> {
  await page.goto('/forge');
  await expect(page.locator('header.fx-top')).toBeVisible({ timeout: 30_000 });
  return page.evaluate(`Promise.all([import('/src/forge/lobby/window.ts'), import('/src/forge/lobby/lobbyView.ts')]).then(([w, v]) => {
    const mem = new Map();
    const win = new w.ForgeWindow({ doc: document, title: 'FROSTFIRE BOX', onClose: () => {}, store: { get: (k) => mem.get(k) ?? null, set: (k, x) => mem.set(k, x) } });
    if (!win.root.isConnected) document.body.append(win.root);
    const view = new v.LobbyView({ doc: document, title: () => ({ name: 'FROSTFIRE BOX', map: 'MP2', players: 16 }), me: () => ({ id: 1, host: true }),
      send: () => {}, chat: () => {}, armory: () => {}, armoryReady: () => true, leave: () => {}, talk: () => {},
      listed: () => ({ on: true, busy: false }), toggleListed: () => {}, password: () => ({ locked: false, busy: false }), setPassword: () => {},
      kickable: () => ({ busy: false }), kick: () => {}, closable: () => true, closeLobby: () => {} });   // a host's nine controls (the review's F2)
    win.body.append(view.root);
    const seat = (id, name, team) => ({ id, name, team, ready: id % 2 === 0, host: id === 1, readyIn: 0 });
    const seats = [seat(1, 'W'.repeat(30), 'seal')];   // wide enough to clip at every phone width
    for (let i = 2; i <= 8; i++) seats.push(seat(i, 'SEALPLAYER' + i, 'seal'));
    for (let i = 9; i <= 16; i++) seats.push(seat(i, 'TERRORIST_' + i, 'terrorist'));
    view.update({ type: 'gameLobby', seats, countdown: null, launched: false });
    window.__lobbyWin = win.root;
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    const W = innerWidth, H = innerHeight;
    const q = (s) => win.root.querySelector(s);
    const buttons = [...win.root.querySelectorAll('.fx-lobby-buttons .fx-lobby-btn')].filter((b) => !b.hidden && b.getBoundingClientRect().width > 0);
    const past = [...win.root.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > W + 0.5 || b.left < -0.5); })
      .map((e) => String(e.className || e.tagName)).slice(0, 10);
    return { W, H, window: r(win.root), past, parts: { close: r(q('.fx-window-close')), seal: r(q('[data-list="seal"]')), terrorist: r(q('[data-list="terrorist"]')),
      team: r(q('.fx-lobby-team')), firstControl: r(buttons[0]), lastControl: r(buttons[buttons.length - 1]) },
      controls: buttons.length,
      longName: (() => { const n = [...win.root.querySelectorAll('.fx-lobby-name')].find((e) => e.textContent.startsWith('WWWWWWWW'));
        return n ? { clipped: n.scrollWidth > n.clientWidth, overflow: getComputedStyle(n).textOverflow } : null; })() };
  })`) as Promise<Measure>;
}

const inside = (b: Box, W: number, what: string): void => {
  expect(b[0], `${what}: its left on the screen`).toBeGreaterThanOrEqual(-0.5);
  expect(b[2], `${what}: its right on the screen`).toBeLessThanOrEqual(W + 0.5);
};

for (const size of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test.describe(`a phone, ${size.width}x${size.height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: size });

    test('the lobby\'s window lies inside the screen: its close, both lists side by side, TEAM, the controls; a long name ellipsised', async ({ page }) => {
      const m = await mount(page);
      inside(m.window, m.W, 'the window');
      for (const [name, b] of Object.entries(m.parts)) { expect(b, name).not.toBeNull(); inside(b!, m.W, name); }
      expect(m.past, 'nothing past the screen\'s edge').toEqual([]);
      expect(m.controls, 'a host\'s nine controls').toBe(9);
      expect(m.longName, 'the long name ellipsised in its list').toEqual({ clipped: true, overflow: 'ellipsis' });
      expect(m.parts['seal']![1], 'the lists side by side').toBeCloseTo(m.parts['terrorist']![1], 0);
      // Top to bottom: the window inside the screen, and its last control on it as drawn -- no scroll first (the review's
      // F4: the window and its body are `overflow: hidden`, which a finger cannot scroll).
      expect(m.window[3], 'the window\'s foot on the screen').toBeLessThanOrEqual(m.H + 0.5);
      const last = m.parts['lastControl']!;
      expect(last[3], 'the last control inside the window').toBeLessThanOrEqual(m.window[3] + 0.5);
      expect(last[3], 'the last control on the screen').toBeLessThanOrEqual(m.H + 0.5);
      expect(last[1], 'the last control below the window\'s top').toBeGreaterThanOrEqual(m.window[1] - 0.5);
    });
  });
}

test.describe('a desktop window, 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('is as it was: the default 760 x 540, centred', async ({ page }) => {
    const m = await mount(page);
    expect(m.window[2] - m.window[0]).toBeCloseTo(760, 0);
    expect(m.window[3] - m.window[1]).toBeCloseTo(540, 0);
    expect(m.past).toEqual([]);
  });
});
