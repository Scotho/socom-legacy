// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SERVER_UPDATE_CLOSE } from '../src/net/protocol';
import { GAME_FINAL_CLOSES } from '../src/netPage';
import { SERVER_UPDATE_NOTICE_ADAPTATION, SERVER_UPDATE_RELOAD_MS_ADAPTATION, serverUpdateReturn } from '../src/serverUpdate';

/**
 * OBF-4 (OBF.R4; a browser and service adaptation with no original): the page's side of a match closed at its end
 * because its host's update is pending -- the post-match warning shown, then the page reloaded. The reload is a stub
 * here: no test reloads a real page.
 */

function stubs() {
  const reloads: number[] = [];
  const timers: { ms: number; f: () => void }[] = [];
  return {
    reloads, timers,
    o: { doc: document, reload: () => { reloads.push(1); }, wait: (ms: number, f: () => void) => { timers.push({ ms, f }); } },
  };
}

describe('OBF-4: the server-updating return', () => {
  it('the close is its own code, final (no retry), the transport\'s range', () => {
    expect(SERVER_UPDATE_CLOSE).toEqual({ code: 4022, reason: 'server updating' });
    expect(GAME_FINAL_CLOSES.has(SERVER_UPDATE_CLOSE.code)).toBe(true);
  });

  it('shows the warning at once, then reloads the page once after its wait', () => {
    document.body.innerHTML = '';
    const s = stubs();
    serverUpdateReturn(s.o);
    const bar = document.querySelector('[data-server-update]');
    expect(bar?.textContent).toBe(SERVER_UPDATE_NOTICE_ADAPTATION);
    expect(bar?.getAttribute('role')).toBe('alert');
    expect(s.reloads).toEqual([]);                                       // the warning is read first
    expect(s.timers.map((t) => t.ms)).toEqual([SERVER_UPDATE_RELOAD_MS_ADAPTATION]);
    s.timers[0]!.f();
    expect(s.reloads).toEqual([1]);
  });

  it('a second call shows no second warning and schedules no second reload', () => {
    document.body.innerHTML = '';
    const s = stubs();
    serverUpdateReturn(s.o);
    serverUpdateReturn(s.o);
    expect(document.querySelectorAll('[data-server-update]')).toHaveLength(1);
    expect(s.timers).toHaveLength(1);
  });

  it('with no document (a page torn down), the reload still runs after the wait', () => {
    const s = stubs();
    serverUpdateReturn({ ...s.o, doc: null });
    s.timers[0]!.f();
    expect(s.reloads).toEqual([1]);
  });
});
