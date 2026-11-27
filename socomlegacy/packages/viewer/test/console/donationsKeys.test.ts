// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { donationsHeaderHtml, mountDonations } from '../../src/console/donations';

/**
 * PR #824's review (a product-track fix; the launcher's donation meter is a browser adaptation with no original): with
 * focus on the meter (its dialog closed), the meter keeps only the keys that activate its button -- Enter and Space --
 * from the launcher's menu map, and lets Escape and the menu's keys through. With its dialog open it stays modal.
 */
const reply = { available: true, goalCents: 12500, raisedCents: 1000, currency: 'USD', month: '2026-11', timezone: 'America/Chicago', shown: true };   // the shown box's keys (central's show/hide flag)
const cleanups: (() => void)[] = [];
beforeEach(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanups.splice(0).forEach((f) => f()); document.body.innerHTML = ''; });

/** The meter mounted and its first reply in (central's show/hide flag: the box shows only once a reply says shown). */
async function mounted(): Promise<{ button: HTMLButtonElement; heard: string[] }> {
  document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
  const feature = mountDonations(document, window, { request: vi.fn(async () => new Response(JSON.stringify(reply))) as typeof fetch });
  cleanups.push(feature.dispose);
  await feature.refresh();
  // The launcher's menu map: a later keydown listener on the window, as the console's own.
  const heard: string[] = [];
  const menu = (e: KeyboardEvent) => { heard.push(e.key); };
  window.addEventListener('keydown', menu);
  cleanups.push(() => window.removeEventListener('keydown', menu));
  const button = document.querySelector<HTMLButtonElement>('[data-donate-open]')!;
  button.focus();
  return { button, heard };
}
const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('the meter keeps only its own keys from the launcher (PR #824 review)', () => {
  it('focus on the meter: Escape and the menu keys reach the launcher; Enter and Space do not', async () => {
    const { button, heard } = await mounted();
    for (const key of ['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter', ' ']) press(button, key);
    expect(heard).toEqual(['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);
  });

  it('dialog open: modal, the launcher hears nothing; Escape closes it', async () => {
    const { button, heard } = await mounted();
    button.click();
    const dialog = document.querySelector('dialog')!;
    expect(dialog).not.toBeNull();
    for (const key of ['ArrowDown', 'Enter', 'Escape']) press(dialog.querySelector('button') ?? dialog, key);
    expect(heard).toEqual([]);
    expect(document.querySelector('dialog')).toBeNull();
  });
});
