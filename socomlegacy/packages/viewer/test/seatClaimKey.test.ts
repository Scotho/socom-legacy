// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { noInput } from '../src/gamepad';
import { MenuPageInput } from '../src/menuInput';
import { SEAT_CLAIM_HOLD_S_ADAPTATION } from '../src/seatClaim';
import { holdRoundLineKeys } from '../src/roundLineKeys';

/**
 * LATER 1604 (SEAT_CLAIM_ADAPTATION, a browser adaptation; product track): a development build's J, held over the
 * spectator view's claim for the hold's time, sends the claim, and its release lets the hold go. On a Shadow PC
 * (record PR941-CAP-PC2) real J holds never enlisted in a front-end match: the front end's menu keys
 * (`MenuPageInput.attach`, a development build's, on the document's capture phase) stay attached under a match and stop
 * every key's propagation there, so the page's J listener on the window's bubble phase never heard the key.
 */

let now = 0;
const off: (() => void)[] = [];
afterEach(() => { for (const f of off.splice(0)) f(); vi.restoreAllMocks(); });

function watcher(): { net: NetPage; claims: () => unknown[]; server: (ev: ServerEvent) => void } {
  const sent: string[] = [];
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'fly', isDead: () => false,
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined, setKit: () => undefined, setType: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM], objective: () => ({}),
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: (d: string | Uint8Array) => { if (typeof d === 'string') sent.push(d); }, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  } as NetPageDeps;
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, true, 'classic');
  off.push(() => { net.close(); });
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  (net.client as unknown as { bodies: () => unknown[] }).bodies = () => [];
  server({
    type: 'welcome', id: 1, version: 4, map: 'MP2', tick: 0, role: 'spectator', team: null, queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as unknown as ServerEvent);
  server({ type: 'seats', open: 0, claim: true } as unknown as ServerEvent);
  const claims = (): unknown[] => sent.map((d) => JSON.parse(d) as { type: string }).filter((e) => e.type === 'seatClaim');
  return { net, claims, server };
}

/** A key pressed where a player's key lands: the page's body (bubbling through the document to the window). */
const key = (type: 'keydown' | 'keyup', code: string, repeat = false): void => {
  document.body.dispatchEvent(new KeyboardEvent(type, { code, key: code.slice(3).toLowerCase(), bubbles: true, cancelable: true, repeat }));
};

/** The pad's frame, `ms` of frames at 60 Hz, J's key-repeat arriving between them as a held key's does. */
const frames = (net: NetPage, ms: number, repeats = false): void => {
  for (let t = 0; t < ms; t += 1000 / 60) {
    now += 1000 / 60;
    if (repeats) key('keydown', 'KeyJ', true);
    net.spectatorPad(noInput());
  }
};

/** The front end's menu keys over the match, as `./frontEnd` leaves them attached under a lobby's match. */
function frontEndKeys(): void {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const detach = new MenuPageInput().attach({ tap: () => null }, canvas, window);
  off.push(() => { detach(); canvas.remove(); });
}

describe('LATER 1604: a development build\'s J held over the spectator\'s claim', () => {
  for (const [name, front] of [['the test room (no front end)', false], ['a front-end match (the menus\' keys attached)', true]] as const) {
    it(`${name}: J held for the hold's time sends the claim once; its release lets the hold go`, () => {
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      if (front) frontEndKeys();
      const { net, claims } = watcher();
      net.spectatorPad(noInput());
      expect(net.seatClaimView('keyboard')?.line).toBe('GAME FULL   J HOLD: JOIN QUEUE');
      key('keydown', 'KeyJ');
      frames(net, 100);
      expect(net.seatClaimView('keyboard')?.hold).toBeGreaterThan(0);             // the ring runs: J's held state reached the hold
      frames(net, SEAT_CLAIM_HOLD_S_ADAPTATION * 1000, true);                      // the key's repeats never restart it
      expect(claims()).toEqual([{ type: 'seatClaim', on: true }]);
      frames(net, 500, true);
      expect(claims()).toHaveLength(1);                                            // spent until released
      key('keyup', 'KeyJ');
      frames(net, 50);
      expect(net.seatClaimView('keyboard')?.hold).toBeUndefined();                 // released: no hold runs
    });
  }

  it('a chord on J (the browser console\'s Ctrl+Shift+J) never starts the hold', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    frontEndKeys();
    const { net, claims } = watcher();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'J', ctrlKey: true, shiftKey: true, bubbles: true }));
    frames(net, SEAT_CLAIM_HOLD_S_ADAPTATION * 1000 + 200);
    expect(claims()).toEqual([]);
  });

  it('the review\'s F1: a line with no button (\'none\', SEAT_CLAIM_NO_PAD_ADAPTATION) carries no hold, so no ring is drawn, while a hold runs', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { net } = watcher();
    key('keydown', 'KeyJ');
    frames(net, 200);                                                             // a hold running: a third of the way
    expect(net.seatClaimView('keyboard')?.hold).toBeGreaterThan(0);
    const none = net.seatClaimView('none');
    expect(none).toMatchObject({ line: 'GAME FULL   CONTROLLER NEEDED TO JOIN QUEUE', at: -1 });
    expect(none).not.toHaveProperty('hold');                                      // hudLayout draws the ring only with `hold`
    key('keyup', 'KeyJ');
  });

  it('a J the round\'s open text line takes is typed, never held as the claim (`./roundLineKeys`)', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    off.push(holdRoundLineKeys((e) => e.code === 'KeyJ'));
    const { net, claims } = watcher();
    key('keydown', 'KeyJ');
    frames(net, SEAT_CLAIM_HOLD_S_ADAPTATION * 1000 + 200);
    expect(claims()).toEqual([]);
  });
});
