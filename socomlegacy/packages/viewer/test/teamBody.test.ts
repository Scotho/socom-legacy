import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { LoadedBody } from '../src/body';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent, Team } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { bodyForTeam, hitBodiesOfPage, OwnBody } from '../src/teamBody';
import { IDLE_CLIPS } from '../src/simMap';
import type { MotionClip } from '@s2u/scene';
import type { WalkMode } from '../src/walk';

/**
 * The page's own body follows its side (2026-09-30, the owner's play test of e373be70: a Terrorist wore the SEAL's
 * `seal_A_scuba` on MP2). The map's two bodies (`loadMap` 'navyseals' and 'terrorists', each the side's index-0 type);
 * the page's body rebuilt when the side's differs, the kit re-hung; the room's `welcome` and `promoted` tell the side.
 */

const seal = { name: 'seal_A_scuba' } as unknown as LoadedBody;
const terrorist = { name: 'terrorist_A' } as unknown as LoadedBody;
const map = { body: seal, terrorist };

describe('bodyForTeam', () => {
  it('the SEAL for a SEAL and for no side, the Terrorist for a Terrorist (the SEAL when the map has none)', () => {
    expect(bodyForTeam(map, 'seal')).toBe(seal);
    expect(bodyForTeam(map, null)).toBe(seal);
    expect(bodyForTeam(map, 'terrorist')).toBe(terrorist);
    expect(bodyForTeam({ body: seal, terrorist: null }, 'terrorist')).toBe(seal);
    expect(bodyForTeam(null, 'seal')).toBeNull();
  });

  it('web sprint 5 S2: the character type\'s own body, else its side\'s first (R95.5: index 0 by default)', () => {
    const seal2 = { name: 'seal_E_scuba' } as unknown as LoadedBody, terror2 = { name: 'al_gman02' } as unknown as LoadedBody;
    const typed = { ...map, types: { seal: [seal, seal2, null], terrorist: [terrorist, terror2] } };
    expect(bodyForTeam(typed, 'seal', 1)).toBe(seal2);
    expect(bodyForTeam(typed, 'terrorist', 1)).toBe(terror2);
    expect(bodyForTeam(typed, 'seal')).toBe(seal);
    expect(bodyForTeam(typed, 'seal', 2)).toBe(seal);                // a type that did not decode: the side's first
    expect(bodyForTeam(typed, 'terrorist', 3)).toBe(terrorist);      // none listed
    expect(bodyForTeam(map, 'terrorist', 1)).toBe(terrorist);        // a map without types
    expect(bodyForTeam(typed, null, 1)).toBe(seal);
  });
});

function own() {
  const log: string[] = [];
  const built: { of: LoadedBody; disposed: boolean }[] = [];
  const attached: (LoadedBody | null)[] = [];
  const body = new OwnBody<{ of: LoadedBody; disposed: boolean }>({
    build: (b) => { const v = { of: b, disposed: false }; built.push(v); log.push(`build ${(b as unknown as { name: string }).name}`); return v; },
    dispose: (v) => { v.disposed = true; log.push('dispose'); },
    attach: (v, b) => { attached.push(b); log.push(`attach ${v ? 'view' : 'none'}`); },
    hang: () => { log.push('hang'); },
  });
  return { body, log, built, attached };
}

describe('the page\'s own body (OwnBody)', () => {
  it('a new map puts the SEAL on; the Terrorist side rebuilds it -- the old disposed, Play.setBody, the kit re-hung', () => {
    const { body, log, built, attached } = own();
    body.reset(bodyForTeam(map, 'seal'));                       // offline solo and a match's first frame: the SEAL
    expect(body.loaded()).toBe(seal);
    expect(log).toEqual(['build seal_A_scuba', 'attach view']);
    log.length = 0;
    expect(body.follow(bodyForTeam(map, 'terrorist'))).toBe(true);
    expect(log).toEqual(['dispose', 'build terrorist_A', 'attach view', 'hang']);
    expect(built[0]!.disposed).toBe(true);
    expect(body.view()).toBe(built[1]);
    expect(attached.at(-1)).toBe(terrorist);                     // the play mode's skeleton: the death clips run on it
    log.length = 0;
    expect(body.follow(bodyForTeam(map, 'terrorist'))).toBe(false);   // the same side: nothing rebuilt
    expect(log).toEqual([]);
    expect(body.follow(bodyForTeam(map, 'seal'))).toBe(true);        // back to the SEAL (a new seat)
    expect(body.loaded()).toBe(seal);
  });
});

function page() {
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk',
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const teams: Team[] = [];
  const deps: NetPageDeps = {
    walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    teamChanged: (t) => { teams.push(t); },
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  };
  new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  return { server, teams };
}

const welcome = (role: 'player' | 'spectator', team: Team | null): ServerEvent => ({
  type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role, team, queue: role === 'player' ? 0 : 1, name: 'Tester',
  players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
} as ServerEvent);

describe('the room tells the page its side (welcome, promoted)', () => {
  it('a player\'s welcome as a Terrorist, and a watcher promoted to a side, each reach teamChanged', () => {
    const a = page();
    a.server(welcome('player', 'terrorist'));
    expect(a.teams).toEqual(['terrorist']);
    const b = page();
    b.server(welcome('spectator', null));
    expect(b.teams).toEqual([]);                                   // a watcher has no side: the body stays
    b.server({ type: 'promoted', id: 1, team: 'terrorist', ghost: false } as ServerEvent);
    expect(b.teams).toEqual(['terrorist']);
  });
});

describe("the in-page room's hit bodies (hitBodiesOfPage)", () => {
  it("each side's own skeleton, off the page's two bodies, with the stance idles by name; no Terrorist body: null", () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const b = (model: string, bone: string) => ({
      model, parts: [{ name: bone, parent: -1, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I) }],
    }) as unknown as LoadedBody;
    const stand = { name: IDLE_CLIPS.stand } as unknown as MotionClip;
    const out = hitBodiesOfPage({ body: b('seal_A_scuba', 'hips'), terrorist: b('al_gman01', 'hips') }, { clips: [stand] });
    expect(out.seal[0]!.skeleton.model).toBe('seal_A_scuba');
    expect(out.terrorist[0]!.skeleton.model).toBe('al_gman01');
    expect(out.terrorist[0]!.idles).toEqual({ stand, crouch: null, prone: null });
    expect(hitBodiesOfPage({ body: b('seal_A_scuba', 'hips'), terrorist: null }, null).terrorist).toEqual([]);
  });

  it('web sprint 5 S2: each type\'s own skeleton, types order; a body two types share is one hit body', () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const b = (model: string) => ({
      model, parts: [{ name: 'hips', parent: -1, bindLocal: Float32Array.from(I), bindWorld: Float32Array.from(I) }],
    }) as unknown as LoadedBody;
    const s1 = b('seal_A_arc'), s2 = b('seal_E_arctic'), t1 = b('al_arctic02');
    const out = hitBodiesOfPage({ body: s1, terrorist: t1, types: { seal: [s1, s2, s1, null], terrorist: [t1] } }, null);
    expect(out.seal.map((h) => h?.skeleton.model ?? null)).toEqual(['seal_A_arc', 'seal_E_arctic', 'seal_A_arc', null]);
    expect(out.seal[2]).toBe(out.seal[0]);
    expect(out.terrorist).toHaveLength(1);
  });
});
