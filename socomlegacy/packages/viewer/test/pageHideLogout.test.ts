// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetSource } from '@s2u/archive';
import { GameAudio, type AudioOut } from '../src/audio';
import { mountFrontEnd } from '../src/frontEnd';

/**
 * NU-16b (the plan's row, option (a); `PAGEHIDE_LOGOUT_ADAPTATION`, `connectHost.ts`): the page going away -- a reload, a
 * close, a navigation: a `pagehide` not `persisted` -- stops the mount, whose session's close sends the lobby's logout
 * (`LobbyClient.close`, `LOBBY_CLOSE_AT_STOP_ADAPTATION`) with `keepalive: true` (`fetchAccountService`:
 * `connectHost.test.ts`; end to end over the services, `sessionAfterMatch.test.ts`), so the server ends the session now
 * and the reloaded page's login is never -997 for the services' `SESSION_SILENT_MS_READING`. A page put in the
 * back/forward cache (`persisted`) keeps its session: it may come back. A browser adaptation.
 */

class SilentOut implements AudioOut {
  unlocked = false;
  state = 'locked';
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(): void {}
  setReverb(): void {}
  rampReverb(): void {}
  loop(): null { return null; }
}

/** The browser's `PageTransitionEvent` as jsdom may lack it: the type and `persisted` are all the listener reads. */
const pagehide = (persisted: boolean): Event => Object.assign(new Event('pagehide'), { persisted });

describe('NU-16b: the logout at a non-persisted pagehide (PAGEHIDE_LOGOUT_ADAPTATION)', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

  async function mounted() {
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const m = mountFrontEnd('?menuflow', { kind: 'http', baseUrl: '/maps' }, document, { assets: nothing, audio: new GameAudio(new SilentOut()), movies: null })!;
    const s = (await m.session)!;
    expect(s.lobby).not.toBeNull();                                  // the page's account service is always there
    const close = vi.spyOn(s, 'close');
    return { m, close };
  }

  it('a non-persisted pagehide stops the mount: the session closed once, the canvas gone; the listener goes with the stop', async () => {
    const { m, close } = await mounted();
    window.dispatchEvent(pagehide(false));
    expect([close.mock.calls.length, document.getElementById('front-end')]).toEqual([1, null]);
    m.stop();                                                        // the explicit stop's own close
    window.dispatchEvent(pagehide(false));                           // no listener left: nothing more
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('a persisted pagehide (the back/forward cache) keeps the session: nothing closed, the canvas kept', async () => {
    const { m, close } = await mounted();
    window.dispatchEvent(pagehide(true));
    expect([close.mock.calls.length, document.getElementById('front-end')]).toEqual([0, m.canvas]);
    m.stop();
  });
});
