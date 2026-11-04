import { describe, expect, it } from 'vitest';
import { TauntMenu, type ChatEntry } from '../src/tauntMenu';
import type { PadButton } from '../src/gamepad';

/**
 * LATER 390 (originalSettings.spec's in-match TACTICAL ORDERS step): the Chat menu driven at the spec's own cadence --
 * 60 frames a second, each tap one frame held then two let go (`tap`), 250 ms between steps (`chat`) -- to tell the menu
 * from the page. TACTICAL ORDERS' first row with an action (as `./matchChat` builds a supported order).
 */
describe('the Chat menu at originalSettings.spec\'s cadence (LATER 390)', () => {
  it('Circle opens it, Cross enters TACTICAL ORDERS, Cross sends the first order and closes it', () => {
    const sent: string[] = [];
    const orders: ChatEntry[] = [{ label: 'HOLD FIRE', help: 'Tactical: Hold your fire', key: 'tactical:6', action: () => { sent.push('tactical:6'); } }];
    const m = new TauntMenu({ send: () => {}, sound: () => {}, unsupported: (n) => { sent.push(`unsupported ${n}`); }, custom: () => [], entries: (root) => (root === 0 ? orders : []) });
    let t = 10;
    const frame = (held: PadButton[]): void => { m.frame(t, new Set(held), true); t += 1 / 60; };
    const idle = (ms: number): void => { for (let i = 0; i < Math.round(ms / (1000 / 60)); i++) frame([]); };
    const tap = (b: PadButton): void => { frame([b]); frame([]); frame([]); };
    idle(500);
    tap('Circle');
    expect(m.isOpen()).toBe(true);
    expect(m.state().root).toBe(0);
    idle(250);
    tap('Cross');
    expect([m.state().depth, m.state().row, m.state().root]).toEqual([1, 0, 0]);
    idle(250);
    tap('Cross');
    expect(sent).toEqual(['tactical:6']);
    expect(m.isOpen()).toBe(false);
  });
});
