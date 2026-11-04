// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscAssets } from '../../src/modern/discAssets';
import type { LauncherSnapshot, LauncherState } from '../../src/modern/launcherState';
import { mountOverlay, overlayPageReads, type Overlay } from '../../src/modern/overlay/index';
import { fakeSession, settle } from './lobbies/fixtures';
import { missionData } from '../console/loadout/fixture';
import { CATS, OVERLAY_LOCK_WORDS, homeItems, loadoutSideItems } from '../../src/console/state';
import { LOADOUT_ROUND_WORDS } from '../../src/console/adapters/loadouts';

/**
 * MU2-10 (MU2-7's review F1; MU2.R3): under the overlay over a running round, Replays' Watch and the loadouts' read of
 * the mission's world off the disc (since CX-LOADOUTS the console's Armory screens) are gated off -- the round keeps the disc readers. `launcherState` reads the
 * disc in during `in-game` (MU2-7), so without the gate both would be live mid-round. The words are the modern UI's own
 * (no original; the design has none for it): an H-next row with this default, for the owner. CX-26: the retired modern
 * Replays section's own gate (`mountReplays` with `roundRunning`) went with it; the console's Watch waits in the same
 * words (`../console/overlayMode.test.ts`, "Replays' Watch is gated in a round"; `./overlaySync.test.ts`).
 */
const flush = async (): Promise<void> => { await settle(); await new Promise((r) => setTimeout(r, 0)); };
function launcher(disc: LauncherSnapshot['disc'] = 'in-game'): LauncherState & { names: ReturnType<typeof vi.fn>; armory: ReturnType<typeof vi.fn> } {
  const names = vi.fn(async () => new Map<number, string>());
  const armory = vi.fn(async (m: string) => missionData(m));
  const assets: DiscAssets = { readValveDefaults: async () => [], readItemNames: names, readMissionArmory: armory } as DiscAssets;
  return {
    disc: () => disc, isoInserted: () => true, filename: () => null, assets: () => assets,
    onChange: () => () => {}, names, armory,
  };
}

const disposers: (() => void)[] = [];
beforeEach(() => { document.body.innerHTML = '<div id="host"></div>'; });
afterEach(() => { for (const d of disposers.splice(0)) d(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

/**
 * OVERLAY-CONSOLE (CX.R13, OT.R60): the overlay draws the console; the round reaches the console's reads
 * (`ConsolePageReads.roundRunning`): Watch waits (`../console/overlayMode.test.ts`), sign out locks, and since CX-LOADOUTS
 * the Armory's loadouts screens open locked in the round's words, reading nothing off the disc or the server
 * (`../console/loadouts.test.ts`, `../console/adapters/loadouts.test.ts`). The cases that pinned the retired modern
 * section's round lock (`mountLoadouts` with `roundRunning`) are held there.
 */
describe('MU2-10: the overlay hands the page\'s round to its console', () => {
  let overlay: Overlay | null = null;
  afterEach(() => { overlay?.dispose(); overlay = null; });
  const inner = (): Document => document.querySelector('iframe')!.contentDocument!;

  it('over a running round the overlay\'s console reads nothing off the disc: its loadouts open locked in the round\'s words, sign out waits', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => { asked.push(String(input)); return new Response('{}', { status: 503 }); }) as typeof fetch);
    const l = launcher();
    overlay = mountOverlay(document, { nav: { getGamepads: () => [] }, session: fakeSession('signed-in'), state: l, frame: () => 0, cancelFrame: () => {}, roundRunning: () => true });
    overlay.open();
    await flush();
    const page = overlay.console()!;
    const profileAt = CATS.findIndex((c) => c.id === 'profile');
    page.ctl.S.cat = profileAt;
    page.render();
    expect(homeItems('profile', page.ctl.S, page.ctl.A).filter((x) => x.title === 'Loadouts').map((x) => x.act)).toEqual(['loadout-sides']);
    for (const [side, title] of ['SEAL', 'Terrorist'].entries()) {
      page.ctl.S.screen = 'home';
      page.ctl.S.cat = profileAt;
      const i = homeItems('profile', page.ctl.S, page.ctl.A).findIndex((x) => x.title === 'Loadouts');
      page.ctl.S.item[profileAt] = i;
      page.render();
      inner().querySelectorAll<HTMLElement>('#stage .cx-list .cx-item')[i]!.click();
      expect(page.ctl.S.screen).toBe('loadoutSides');
      expect(loadoutSideItems(page.ctl.A)[side]!.title).toBe(title);
      inner().querySelectorAll<HTMLElement>('#stage [data-act="loside"]')[side]!.click();
      await flush();
      expect(page.ctl.S.screen).toBe('loadouts');
      expect(inner().querySelector('#stage')!.textContent).toContain(LOADOUT_ROUND_WORDS);
      page.ctl.press('cross');
      expect(page.ctl.S.legendError).toBe(LOADOUT_ROUND_WORDS);
    }
    expect(asked.filter((u) => /\/lobby\/loadout|\/maps/.test(u))).toEqual([]);
    expect(l.armory).not.toHaveBeenCalled();
    expect(l.names).not.toHaveBeenCalled();
    expect(homeItems('profile', page.ctl.S, page.ctl.A).find((x) => x.title === 'Sign out')!.sub).toBe(OVERLAY_LOCK_WORDS.signOutRound);
  });

  it('the test room: the round\'s reads hold while its loopback round runs (the page\'s hook), and lift when no round runs', async () => {
    vi.stubGlobal('fetch', (async () => new Response('{}', { status: 503 })) as typeof fetch);
    // The page's hook by the shape the overlay reads (`TestRoomReads`): the global `Window.__viewer` is the viewer's whole
    // hook (`src/hook.ts`), so the stub is typed as the overlay's read, not as the window's field.
    const win = window;
    const hook = window as unknown as { __viewer?: { net?(): { waiting: boolean } | null } };
    let room: { waiting: boolean } | null = { waiting: false };
    hook.__viewer = { net: () => room };
    try {
      const reads = overlayPageReads({ kind: 'viewer' }, win);
      const l = launcher();
      overlay = mountOverlay(document, { nav: { getGamepads: () => [] }, session: fakeSession('signed-in'), state: l, frame: () => 0, cancelFrame: () => {}, roundRunning: reads.roundRunning });
      const lockOf = async (): Promise<string> => {
        overlay!.open();
        await flush();
        const page = overlay!.console()!;
        const out = homeItems('profile', page.ctl.S, page.ctl.A).find((x) => x.title === 'Sign out')!;
        const running = page.ctl.S.page!.roundRunning();
        overlay!.close();
        return running ? out.sub : out.disabled ? 'locked' : '';
      };
      expect(await lockOf()).toBe(OVERLAY_LOCK_WORDS.signOutRound);
      expect(l.armory).not.toHaveBeenCalled();
      room = null;                                                 // the round over: the room left
      expect(await lockOf()).toBe('');
    } finally { delete hook.__viewer; }
  });
});
