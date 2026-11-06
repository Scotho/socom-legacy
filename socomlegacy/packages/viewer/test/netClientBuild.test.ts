import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { viewerBuiltAt, viewerRev } from '../src/revision';
import { BUILT_AT_PATTERN } from '../src/net/protocol';

/**
 * NCW-10 (the netcode wave, `docs/plans/2026-11-05-netcode-wave.md`; an instrument with no original, the product track):
 * the page's hello carries its own build, `viewerRev()` (Vite's `__VIEWER_REV__`, `../src/revision`), as `build` -- so
 * the room can keep it in the seat's round signals and a refusal or a rate reads against the build that made it. Every
 * hello goes from `NetClient`'s open (a first connect, a reconnect and a resume each make a new client), so one test
 * of the open holds them all. A page with no build (vitest, a build without git) sends none: the frame is as before.
 */

const IDLE: NetWalk = { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined, setDead: () => undefined };

function firstHello(o: Partial<ConstructorParameters<typeof NetClient>[0]> = {}): Record<string, unknown> {
  const sent: unknown[] = [];
  const socket: WebSocketLike = {
    binaryType: 'blob', readyState: 1, send: (d) => { sent.push(d); }, close: () => undefined,
    onopen: null, onclose: null, onmessage: null, onerror: null,
  };
  new NetClient({ url: 'mem', map: 'MP1', name: 'A', socket: () => socket, ...o }, IDLE);
  socket.onopen?.({});
  return JSON.parse(sent[0] as string) as Record<string, unknown>;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('NCW-10: the page\'s hello carries its build', () => {
  it('a built page: the hello\'s build is viewerRev()', () => {
    vi.stubGlobal('__VIEWER_REV__', 'a1b2c3d-dirty');
    expect(viewerRev()).toBe('a1b2c3d-dirty');
    expect(firstHello()['build']).toBe(viewerRev());
    expect(firstHello({ watch: true, session: 'abcdefghijklmnopqrstuv' })['build']).toBe('a1b2c3d-dirty');   // a watcher, a resume's session
    expect(firstHello({ game: { id: 7, token: 'h.c.s' } })['build']).toBe('a1b2c3d-dirty');                  // a placed game's door
    expect(firstHello({ forge: { id: 'abc' } })['build']).toBe('a1b2c3d-dirty');                             // a forge lobby
  });

  it('a page with no build (viewerRev() empty) sends none: the hello as before', () => {
    expect(viewerRev()).toBe('');
    expect('build' in firstHello()).toBe(false);
  });
});

/**
 * NCW-10's addition (the lane seat, for NCW-13): the hello also carries `builtAt`, the build stamp Vite wrote
 * (`__BUILD_STAMP__`, `YYYY-MM-DD HH:MM:SS` UTC) to the minute as `YYYY-MM-DDTHH:MMZ`; none where Vite wrote none or the
 * stamp is malformed.
 */
describe("NCW-10: the page's hello carries its build time", () => {
  it('a built page: builtAt is the stamp to the minute, UTC', () => {
    vi.stubGlobal('__BUILD_STAMP__', '2026-11-05 01:57:42');
    expect(viewerBuiltAt()).toBe('2026-11-05T01:57Z');
    expect(firstHello()['builtAt']).toBe('2026-11-05T01:57Z');
  });

  it('a stamp\'s seconds are truncated, never rounded (the same format as the host\'s RELEASE_BUILT_AT)', () => {
    vi.stubGlobal('__BUILD_STAMP__', '2026-11-05 01:32:59');
    expect(viewerBuiltAt()).toBe('2026-11-05T01:32Z');
  });

  it('no stamp, or a malformed one: no builtAt', () => {
    expect(viewerBuiltAt()).toBe('');
    expect('builtAt' in firstHello()).toBe(false);
    for (const bad of ['', 'soon', '2026-11-05', '2026-11-05T01:57']) {
      vi.stubGlobal('__BUILD_STAMP__', bad);
      expect(viewerBuiltAt(), bad).toBe('');
      expect('builtAt' in firstHello(), bad).toBe(false);
    }
    // the stamp's shape but no time (month 13): normalised by revision.ts, refused by the hello's BUILT_AT_PATTERN
    vi.stubGlobal('__BUILD_STAMP__', '2026-13-05 01:57:00');
    expect('builtAt' in firstHello()).toBe(false);
  });
});

/**
 * NCW-10 (the controller's settlement with the web-image grace, `agent/web-grace`): one regex for the build time, UTC to
 * the minute, `YYYY-MM-DDTHH:MMZ` -- the host's `RELEASE_BUILT_AT`, central's `/health` `builtAt`, the web's release.json --
 * exported from the protocol, so the page, the room and central validate with the same one.
 */
describe("NCW-10: BUILT_AT_PATTERN, the build time's one format", () => {
  it('takes 2026-11-05T01:32Z', () => {
    expect(BUILT_AT_PATTERN.test('2026-11-05T01:32Z')).toBe(true);
  });

  it("refuses seconds, no Z, a lowercase t, an hour of 24, and the stamp's own form", () => {
    for (const bad of ['2026-11-05T01:32:00Z', '2026-11-05T01:32', '2026-11-05t01:32Z', '2026-11-05T24:00Z', '2026-11-05 01:32:00', '2026-11-05T01:60Z', '2026-13-05T01:32Z', '2026-11-00T01:32Z', ' 2026-11-05T01:32Z', '2026-11-05T01:32Z\n']) {
      expect(BUILT_AT_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
