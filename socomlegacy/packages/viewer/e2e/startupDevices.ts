import type { Page } from '@playwright/test';
import type { PadLike } from '../src/gamepad';

export async function installStartupPads(page: Page, connected = true): Promise<void> {
  await page.addInitScript((connected) => {
    const state = window as unknown as { pads: PadLike[] };
    state.pads = [0, 1].map((index) => ({ index, id: `Test pad ${index}`, mapping: 'standard', connected,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => state.pads });
  }, connected);
}

export async function padButtons(page: Page, buttons: number[], index = 0): Promise<void> {
  await page.evaluate(async ({ buttons, index }) => {
    const pad = (window as unknown as { pads: Gamepad[] }).pads[index]!;
    pad.buttons.forEach((b, i) => Object.assign(b, { pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
    await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  }, { buttons, index });
}

export async function pressPad(page: Page, button: number, index = 0): Promise<void> {
  await padButtons(page, [], index); await padButtons(page, [button], index); await padButtons(page, [], index);
}
