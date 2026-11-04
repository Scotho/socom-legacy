import { describe, expect, it } from 'vitest';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { MP_HEALTH, PART } from '../src/net/damage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { deathRumble, hurtRumble, Rumble } from '../src/rumble';

/**
 * j5t3o2iU (research 302 §10; reading, pending review): the rumble when the page's own body is hurt and lives. A health
 * drop the body survives -- a bullet's, a blast's, a fall's alike (`FUN_005a54d0` D:L461395-461396) -- runs
 * `FUN_005477a0` (D:L412828-412838), which calls the controller's `+0x54`, `FUN_00597b00` (D:L454498-454524): the hurt
 * voice through the voice gate (`+0x24`, 0x3b at 1.0), then -- only where `+0x34` answers 0 (the SEAL controller's entry
 * 0x544200 and a controller vtable at 0x4062d0, class unnamed, entry 0x221d30, return 0; the remote controller's 0x5e6260
 * answers 1) and VIBRATION is on (`DAT_00650698`) -- the
 * large motor raised to 175 for 0.18 s and the small motor's time raised to 0.04 s (D:L454512-454522). The motors are not
 * behind the voice gate.
 */

const DT = 1 / 30;

function bytes(r: Rumble, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) { const b = r.frame(DT); out.push(`${b.large}/${b.small}`); }
  return out;
}

describe('the hurt pulse (FUN_00597b00 D:L454512-454522)', () => {
  it('the large motor 0.18 s at 175 and the small motor 0.04 s, from rest', () => {
    const r = new Rumble(true);
    hurtRumble(r);
    // 0.18 s: six frames of 175; 0.04 s: two frames of the small motor on.
    expect(bytes(r, 8)).toEqual(['175/1', '175/1', '175/0', '175/0', '175/0', '175/0', '0/0', '0/0']);
  });

  it('only raises: a stronger, longer pulse already running is kept (no reset, unlike the death)', () => {
    const r = new Rumble(true);
    r.large(0.3, 220); r.small(0.12);
    hurtRumble(r);
    const seen = bytes(r, 10);
    expect(seen.slice(0, 4)).toEqual(['220/1', '220/1', '220/1', '220/1']);
    expect(seen.slice(4, 9)).toEqual(['220/0', '220/0', '220/0', '220/0', '220/0']);
    // A weaker, shorter pulse running is raised to the hurt's.
    const w = new Rumble(true);
    w.large(0.05, 100);
    hurtRumble(w);
    expect(bytes(w, 7)).toEqual(['175/1', '175/1', '175/0', '175/0', '175/0', '175/0', '0/0']);
  });

  it('the same motors as the death\'s (FUN_00547af0 D:L413099-413100), but no reset', () => {
    const a = new Rumble(true), b = new Rumble(true);
    hurtRumble(a); deathRumble(b);
    expect(bytes(a, 8)).toEqual(bytes(b, 8));
  });

  it('VIBRATION OFF: nothing (DAT_00650698 gates both motors)', () => {
    const r = new Rumble(false);
    hurtRumble(r);
    expect(bytes(r, 3)).toEqual(['0/0', '0/0', '0/0']);
  });
});

describe('the page\'s own body hurt and alive: the hurt rumble, not behind the voice gate', () => {
  function page() {
    let socket: WebSocketLike | null = null;
    let hurt = 0;
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'walk', feet: () => [1, 2, 3],
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
      setType: () => undefined, playerType: () => 3, feet: () => [10, 0, -40], setCharacter: () => undefined, setKit: () => undefined,
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      hurtVoice: () => undefined, deathVoice: () => undefined,
      ownHurt: () => { hurt++; },
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'respawn');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [{ id: 2, name: 'Other', team: 'terrorist', char: 3 }], rules: 'respawn', round: 1, rounds: 11, ghost: false,
    } as unknown as ServerEvent);
    return { server, count: () => hurt, net };
  }
  /** The room's `hurt` (only ever sent to the victim): the six parts' health after the hit. */
  const hp = (over: Partial<Record<number, number>>): number[] => MP_HEALTH.map((m, i) => over[i] ?? m);
  const hurt = (health: number[], part: number, from: [number, number, number] = [0, 0, 0]): ServerEvent =>
    ({ type: 'hurt', health, from, part } as ServerEvent);

  it('a bullet, a blast and a fall each rumble once (room.ts `hurt`: the round\'s, the fragments\', the landing\'s)', () => {
    const { server, count } = page();
    server(hurt(hp({ [PART.RARM]: 10 }), PART.RARM, [5, 0, 5]));                     // a bullet in the arm
    expect(count()).toBe(1);
    server(hurt(hp({ [PART.RARM]: 10, [PART.BODY]: 30 }), PART.BODY, [2, 0, 2]));    // a blast's fragments
    expect(count()).toBe(2);
    server(hurt(hp({ [PART.RARM]: 10, [PART.BODY]: 20, [PART.LLEG]: 10 }), PART.BODY, [1, 2, 3]));   // a fall
    expect(count()).toBe(3);
  });

  it('every hit, the voice gate\'s too: two drops in one tick rumble twice; the hurt voice event alone rumbles nothing', () => {
    const { server, count } = page();
    server(hurt(hp({ [PART.BODY]: 40 }), PART.BODY));
    server(hurt(hp({ [PART.BODY]: 30 }), PART.BODY));                                // the room's gate withholds this one's voice
    expect(count()).toBe(2);
    server({ type: 'hurtVoice', id: 1 } as ServerEvent);
    server({ type: 'hurtVoice', id: 2 } as ServerEvent);                              // another's hurt: its voice, never the pad
    expect(count()).toBe(2);
  });

  it('no drop (the armour took it all) rumbles nothing; a lethal hit is the death\'s rumble, not this one', () => {
    const { server, count } = page();
    server(hurt(hp({}), PART.BODY));
    expect(count()).toBe(0);
    server(hurt(hp({ [PART.HEAD]: 0 }), PART.HEAD));                                  // the head at 0: dead (`isDead`)
    expect(count()).toBe(0);
    server(hurt(hp({ [PART.BODY]: 0, [PART.HEAD]: 8 }), PART.BODY));
    expect(count()).toBe(0);
  });

  it('a spawn makes the body whole: the next hit is a drop from full health', () => {
    const { server, count } = page();
    server(hurt(hp({ [PART.BODY]: 5, [PART.RARM]: 0, [PART.LARM]: 0 }), PART.BODY));
    expect(count()).toBe(1);
    server({ type: 'kill', killer: 2, victim: 1, weapon: 'M4A1', how: 'weapon', clip: null, cause: 5 } as ServerEvent);
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);
    server(hurt(hp({ [PART.BODY]: 45 }), PART.BODY));                                 // above the last life's low, below full
    expect(count()).toBe(2);
  });

  // j5t3o2iU (the owner's report): a blast that does the body no harm rumbles nothing -- the original's only blast rumble
  // is the hurt's (`FUN_005a0e70` D:L459285 -> `FUN_005a54d0` -> `FUN_005477a0` -> `FUN_00597b00`); a smoke's `blast`
  // carries no ring, knock or flash and no `hurt` follows it. A frag that hurts: the one hurt pulse, nothing more.
  it("a smoke's blast (no hurt) rumbles nothing; a frag's blast that hurts rumbles once, by its hurt", () => {
    const { server, count } = page();
    server({ type: 'blast', ring: null, knock: null, after: 0, flash: null } as ServerEvent);
    expect(count()).toBe(0);
    server({ type: 'blast', ring: { seconds: 2, volume: 1 }, knock: null, after: 0, flash: null } as ServerEvent);
    expect(count()).toBe(0);                                                          // a frag that missed the body: no hurt
    server({ type: 'blast', ring: { seconds: 2, volume: 1 }, knock: null, after: 0, flash: null } as ServerEvent);
    server(hurt(hp({ [PART.BODY]: 35 }), PART.BODY, [3, 0, 3]));
    expect(count()).toBe(1);
  });

  // The review's F1a: the room's resume lays the health the page holds (OT.R59): a hit after it is a drop from it.
  const resume = (health: number[]): ServerEvent => ({
    type: 'resume', id: 1, at: [0, 0, 0], yaw: 0, posture: 'stand', seq: 40, health, armour: [0, 0, 0, 0, 0, 0],
    loadout: [], rounds: [[], []], pouch: {}, weapon: 0, held: null,
  } as unknown as ServerEvent);

  it('a resume at lowered health: a hit to that same health (the armour took it) is no drop; a lower one rumbles', () => {
    const { server, count } = page();
    server(resume(hp({ [PART.BODY]: 20 })));
    server(hurt(hp({ [PART.BODY]: 20 }), PART.BODY));
    expect(count()).toBe(0);
    server(hurt(hp({ [PART.BODY]: 15 }), PART.BODY));
    expect(count()).toBe(1);
  });

  it('a resume above the health the page last held: a smaller hit from it still rumbles', () => {
    const { server, count } = page();
    server(hurt(hp({ [PART.BODY]: 5 }), PART.BODY));
    expect(count()).toBe(1);
    server(resume(hp({ [PART.BODY]: 40 })));
    server(hurt(hp({ [PART.BODY]: 30 }), PART.BODY));                                 // above the 5 before it, below the 40
    expect(count()).toBe(2);
  });

  // The review's F2 (LATER 498): a spawn the walk refused is held until its retry stands it; the room has made the body
  // whole at its spawn already, so a hit in that window is a drop from full.
  it("a held spawn: the body is whole from the room's spawn, so a hit before the retry stands it rumbles", () => {
    const { server, count, net } = page();
    server(hurt(hp({ [PART.BODY]: 5 }), PART.BODY));
    server({ type: 'kill', killer: 2, victim: 1, weapon: 'M4A1', how: 'weapon', clip: null, cause: 5 } as ServerEvent);
    const client = (net as unknown as { client: { spawnPending?: () => boolean } }).client;
    client.spawnPending = () => true;                                                // the walk refused: the spawn is held
    server({ type: 'spawn', id: 1, at: [0, 0, 0], yaw: 0, after: 0 } as unknown as ServerEvent);
    server(hurt(hp({ [PART.BODY]: 45 }), PART.BODY));
    expect(count()).toBe(2);
  });
});
