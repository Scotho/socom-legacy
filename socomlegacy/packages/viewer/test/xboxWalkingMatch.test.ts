import { expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { padInput } from '../src/gamepad';
import { BodyFlag, type ServerEvent } from '../src/net/protocol';
import { walkingMatch, type WalkingMatchDeps } from '../src/xboxPrototype/walkingMatch';

function setup(rules: 'classic' | 'respawn' = 'classic') {
  let roomSeconds = 0, expired = false, now = 0;
  const bodies = [
    { id: 7, feet: [0, 0, 0], yaw: 0, flags: 0 },
    { id: 8, feet: [10, 0, 0], yaw: 0, flags: BodyFlag.Alive },
    { id: 9, feet: [20, 0, 0], yaw: 0, flags: BodyFlag.Alive },
  ];
  const client = { id: 7, role: 'player', team: 'seal', state: 'open', bodies: () => bodies, roomSecondsDead: () => roomSeconds,
    healthOf: vi.fn((): number | null => null) };
  const walk = { mode: () => 'walk', isDead: () => true, setMode: vi.fn(), resumeBody: vi.fn(), setDead: vi.fn(),
    gridOfGround: () => null, queueRespawnAction: vi.fn(() => true), setDeathKiller: vi.fn(), setDeathPose: vi.fn(), setFlinchPose: vi.fn(), pushHeard: vi.fn() };
  const fly = { camera: new PerspectiveCamera(), setPose: vi.fn(), setMagnification: vi.fn(), aspect: () => 1 };
  const hud = { setSpectator: vi.fn(), setRoundScreen: vi.fn(), startRound: vi.fn(), postMessage: vi.fn() };
  const match = walkingMatch({ client: () => client, walk, fly, hud, now: () => now,
    ownCorpseExpired: () => expired, rootOf: () => null } as unknown as WalkingMatchDeps);
  match.event({ type: 'welcome', id: 7, role: 'player', team: 'seal', rules, round: 1, rounds: 3,
    players: [{ id: 7, team: 'seal', name: 'Me' }, { id: 8, team: 'seal', name: 'Ally' }, { id: 9, team: 'terrorist', name: 'Enemy' }] } as ServerEvent, now);
  match.event({ type: 'score', rows: [], timeLeft: 360, spectators: [], wins: { seal: 0, terrorist: 0 } }, now);
  return { match, client, walk, fly, hud, bodies,
    time(t: number, room = t / 1000) { now = t; roomSeconds = room; }, expire() { expired = true; } };
}

it('uses the existing dead cycle to follow a teammate, never an opponent, and returns to the own camera', () => {
  const { match, walk, fly } = setup();
  match.event({ type: 'kill', victim: 7, killer: 9 } as ServerEvent, 0);
  const key = { type: 'keyup', code: 'ArrowRight', repeat: false, preventDefault: vi.fn() };
  match.key(key, false);
  expect(match.report().watching).toBe(8);
  expect(walk.setMode).toHaveBeenCalledWith('fly');
  expect(fly.setPose).toHaveBeenCalled();
  match.key(key, false);
  expect(match.report().watching).toBe(null);
  expect(walk.resumeBody).toHaveBeenCalledOnce();
});

it('waits for the real corpse expiry and the room clock, then queues respawn on a new Action press only', () => {
  const { match, walk, time, expire } = setup('respawn');
  match.event({ type: 'kill', victim: 7, killer: null } as ServerEvent, 0);
  time(6000); expect(match.respawnReady()).toBe(false);
  expire(); time(6000, 3); expect(match.respawnReady()).toBe(false);
  time(11000, 6); expect(match.respawnReady()).toBe(false);
  time(11000, 10); expect(match.respawnReady()).toBe(true);
  const idle = padInput(null);
  match.input(idle, false); match.input({ ...idle, action: true }, false);
  match.input({ ...idle, action: true }, false);
  expect(walk.queueRespawnAction).toHaveBeenCalledOnce();
});

it('does not let a held Action released under an overlay become a respawn after it closes', () => {
  const { match, walk, time, expire } = setup('respawn');
  match.event({ type: 'kill', victim: 7, killer: null } as ServerEvent, 0);
  expire(); time(11000);
  const held = { ...padInput(null), action: true };
  match.input(held, true); match.input(held, false);
  expect(walk.queueRespawnAction).not.toHaveBeenCalled();
  match.input(padInput(null), false); match.input(held, false);
  expect(walk.queueRespawnAction).toHaveBeenCalledOnce();
});

it('a new round clears respawn help until spawn, and a load death ages from the room event', () => {
  const { match, walk, time } = setup('respawn');
  match.event({ type: 'deadAtLoad', id: 7, age: 360 } as ServerEvent, 6000);
  time(6000, 6); expect(match.respawnReady()).toBe(true);
  match.event({ type: 'roundStart', round: 2, rounds: 3, seconds: 360 } as ServerEvent, 7000);
  expect(match.respawnReady()).toBe(false);
  expect(match.report().dead).toBe(true);
  expect(walk.resumeBody).toHaveBeenCalledOnce();
  match.event({ type: 'spawn', id: 7 } as ServerEvent, 7100);
  expect(match.report().dead).toBe(false);
});

it('draws the server round screens after the existing read delay and keeps them until the next start', () => {
  const { match, hud, time } = setup();
  match.event({ type: 'roundOver', winner: 'seal', wins: { seal: 1, terrorist: 0 },
    screens: [{ screen: 'roundComplete', seconds: 5 }] } as ServerEvent, 0);
  time(2999); match.frame(0); expect(hud.setRoundScreen).toHaveBeenLastCalledWith(null);
  time(3000); match.frame(0);
  expect(hud.setRoundScreen).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'roundComplete', secondsLeft: 5 }));
  time(10000); match.frame(0);
  expect(hud.setRoundScreen).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'roundComplete', secondsLeft: 0 }));
  match.event({ type: 'roundStart', round: 2, rounds: 3, seconds: 360 } as ServerEvent, 10001);
  match.frame(0, 10001); expect(hud.setRoundScreen).toHaveBeenLastCalledWith(null);
  expect(hud.startRound).toHaveBeenLastCalledWith({ round: 2, rounds: 3, objective: [] });
});

it('uses only server-provided teammate health', () => {
  const { match, hud, client } = setup();
  match.event({ type: 'kill', victim: 7, killer: 9 } as ServerEvent, 0);
  match.key({ type: 'keyup', code: 'ArrowRight', repeat: false, preventDefault() {} }, false);
  match.frame(0);
  expect(hud.setSpectator).toHaveBeenLastCalledWith(expect.objectContaining({ followed: { name: 'Ally', health: null } }));
  client.healthOf.mockReturnValue(1);
  match.frame(0);
  expect(hud.setSpectator).toHaveBeenLastCalledWith(expect.objectContaining({ followed: { name: 'Ally', health: 1 } }));
});
