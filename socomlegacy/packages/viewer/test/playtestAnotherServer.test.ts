// @vitest-environment jsdom
// PTT-2 (W37.R3; PB-5 (i); research 243 §9): the page's heartbeat names its effective server, and the badge says when
// the session service answers that this page plays on another server. PLAYTEST_INSTRUMENT_ADAPTATION: no original.
import { afterEach, describe, expect, it } from 'vitest';
import { ANOTHER_SERVER_WORDS, mountPlaytestSession } from '../src/playtestSession';
import { setLoopbackDefaults } from '../src/net/loopback';

const OWNERS = 'ws://127.0.0.1:8787/ws';
const OWN = 'ws://127.0.0.1:5305/ws';

/** A host whose hook has (or not) `online()` -- `main.ts`'s `NET`: `./online` `resolveOnline`'s choice and URL. */
function fakeHost(online: { url: string | null } | 'absent') {
  const sent: object[] = []; let onMsg: ((m: { type: string }) => void) | null = null;
  const state = { url: online === 'absent' ? null : online.url };
  const hook = {
    stats: () => ({ map: 'MP2' }), net: () => null, camera: () => ({ x: 0 }),
    ...(online === 'absent' ? {} : { online: () => ({ state: 'online', players: 1, retryIn: 0, watching: false, choice: 'url', url: state.url }) }),
  } as unknown as import('../src/hook').ViewerHook;
  const host = {
    document, search: '?devmode&online&playtest=ws://127.0.0.1:5303/session', now: () => 0, canvas: () => null, hook: () => hook,
    socket: () => ({ send: (m: object) => sent.push(m), onMessage: (fn: (m: { type: string }) => void) => { onMsg = fn; } }),
    frame: (cb: () => void) => cb(), pads: () => [],
  };
  return {
    host, sent, state,
    open: () => onMsg!({ type: 'session', id: '20261009-8000', segment: 0, badge: { branch: 'agent/playtest', created: null, commit: 'abc1234', dirty: false } } as never),
    msg: (m: object) => onMsg!(m as never),
    inputs: () => sent.filter((s) => (s as { type: string }).type === 'input'),
  };
}
const badge = () => document.getElementById('playtest-badge')!.textContent ?? '';
const key = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));

describe('PTT-2: the page on another server', () => {
  afterEach(() => { document.body.replaceChildren(); setLoopbackDefaults({}); });

  it('the heartbeat names the page\'s effective server, its segment and its map', () => {
    const f = fakeHost({ url: OWNERS }); const m = mountPlaytestSession(f.host); f.open();
    key();
    expect(f.inputs()).toEqual([{ type: 'input', server: OWNERS, segment: 0, map: 'MP2' }]);
    m.dispose();
  });

  it('an offline page names no server (null); a hook with no online() sends the old heartbeat', () => {
    const off = fakeHost({ url: null }); const m1 = mountPlaytestSession(off.host); off.open(); key();
    expect(off.inputs()).toEqual([{ type: 'input', server: null, segment: 0, map: 'MP2' }]);
    m1.dispose(); document.body.replaceChildren();
    const old = fakeHost('absent'); const m2 = mountPlaytestSession(old.host); old.open(); key();
    expect(old.inputs()).toEqual([{ type: 'input' }]);
    m2.dispose();
  });

  it('the badge says "not recorded: this page plays on another server" when the service warns, and the page keeps playing', () => {
    expect(ANOTHER_SERVER_WORDS).toBe('not recorded: this page plays on another server');
    const f = fakeHost({ url: OWNERS }); const m = mountPlaytestSession(f.host); f.open();
    expect(badge()).not.toContain('another server');
    f.msg({ type: 'recording', segment: 0, recording: 'none (another server)', server: OWNERS });
    expect(badge()).toContain('not recorded: this page plays on another server');
    expect(badge()).toContain('agent/playtest');                           // the build's badge is still there
    m.dispose();
  });

  it('the line goes when the page\'s server is no longer the one warned of; a warning for another segment is not shown', () => {
    const f = fakeHost({ url: OWNERS }); const m = mountPlaytestSession(f.host) as ReturnType<typeof mountPlaytestSession> & { poll(): void }; f.open();
    f.msg({ type: 'recording', segment: 3, recording: 'none (another server)', server: OWNERS });
    expect(badge()).not.toContain('another server');                       // not this page's segment
    f.msg({ type: 'recording', segment: 0, recording: 'none (another server)', server: OWNERS });
    expect(badge()).toContain('another server');
    f.state.url = OWN; m.poll();                                            // switched back to the session's server
    expect(badge()).not.toContain('another server');
    m.dispose();
  });

  it('the page\'s own server (no warning from the service) keeps the badge as before', () => {
    const f = fakeHost({ url: OWN }); const m = mountPlaytestSession(f.host); f.open(); key();
    expect(badge()).not.toContain('another server');
    m.dispose();
  });
});
