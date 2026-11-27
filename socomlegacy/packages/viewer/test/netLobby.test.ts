import { describe, expect, it } from 'vitest';
import { assignTeam, guestName, Lobby, NAME_MAX, sanitizeName, uniqueName } from '../src/net/lobby';
import { isNameDrawable } from '../src/net/playerName';

/** A tiny seeded LCG (Numerical Recipes constants), values in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('assignTeam', () => {
  it('follows the game truth table (research 91 section 7)', () => {
    expect(assignTeam(0, 0)).toBe('terrorist');
    expect(assignTeam(1, 0)).toBe('terrorist');
    expect(assignTeam(0, 1)).toBe('seal');
    expect(assignTeam(1, 1)).toBe('seal');
    expect(assignTeam(8, 3)).toBe('terrorist');
    expect(assignTeam(8, 8)).toBeNull();
    expect(assignTeam(3, 8)).toBe('seal');
  });
});

describe('queue', () => {
  it('queues the 17th and later joiners FIFO and promotes the head when a player leaves', () => {
    const lobby = new Lobby();
    for (let i = 1; i <= 16; i++) expect(lobby.join(i, `p${i}`)?.member.role).toBe('player');
    expect(lobby.teamCounts()).toEqual({ seal: 8, terrorist: 8 });
    for (let i = 17; i <= 20; i++) {
      const r = lobby.join(i, `p${i}`);
      expect(r?.member.role).toBe('spectator');
      expect(r?.member.team).toBeNull();
    }
    expect(lobby.spectators().map((m) => m.id)).toEqual([17, 18, 19, 20]);
    expect(lobby.queuePosition(17)).toBe(1);
    expect(lobby.queuePosition(20)).toBe(4);
    expect(lobby.queuePosition(1)).toBe(0);

    const team = lobby.member(3)!.team!;
    const changes = lobby.leave(3);
    expect(changes).toEqual([
      { kind: 'left', id: 3 },
      { kind: 'promoted', id: 17, team },
      { kind: 'queue', id: 18, position: 1 },
      { kind: 'queue', id: 19, position: 2 },
      { kind: 'queue', id: 20, position: 3 },
    ]);
    expect(lobby.member(17)?.role).toBe('player');
    expect(lobby.queuePosition(18)).toBe(1);

    // a spectator leaving shifts only those behind it
    expect(lobby.leave(19)).toEqual([{ kind: 'left', id: 19 }, { kind: 'queue', id: 20, position: 2 }]);
    expect(lobby.leave(999)).toEqual([]);
  });

  it('refuses a join when players and queue are full, and a repeated id', () => {
    const lobby = new Lobby({ maxPlayers: 2, maxSpectators: 1 });
    expect(lobby.join(1, 'a')).not.toBeNull();
    expect(lobby.join(2, 'b')).not.toBeNull();
    expect(lobby.join(3, 'c')?.member.role).toBe('spectator');
    expect(lobby.join(4, 'd')).toBeNull();
    expect(lobby.join(1, 'e')).toBeNull();
  });
});

describe('watchers (the map viewer Online setting, 2026-09-29)', () => {
  it('a watch join is a spectator outside the queue, even with player room, and is never promoted', () => {
    const lobby = new Lobby();
    const w = lobby.join(1, 'watcher', Math.random, true);
    expect(w?.member).toMatchObject({ role: 'spectator', team: null });
    expect(w?.changes).toEqual([{ kind: 'joined', id: 1, role: 'spectator', team: null }]);
    expect(lobby.queuePosition(1)).toBe(0);
    expect(lobby.watching(1)).toBe(true);
    expect(lobby.join(2, 'p')?.member.role).toBe('player');
    expect(lobby.teamCounts()).toEqual({ seal: 0, terrorist: 1 });
    expect(lobby.leave(2)).toEqual([{ kind: 'left', id: 2 }]);    // nobody promoted: the watcher is not waiting
    expect(lobby.member(1)?.role).toBe('spectator');
    expect(lobby.spectators().map((m) => m.id)).toEqual([1]);
    expect(lobby.leave(1)).toEqual([{ kind: 'left', id: 1 }]);
    expect(lobby.watching(1)).toBe(false);
    expect(lobby.spectators()).toEqual([]);
  });

  it('a queued spectator is still promoted past a watcher, and the queue and the watchers share the spectator room', () => {
    const lobby = new Lobby({ maxPlayers: 1, maxSpectators: 2 });
    expect(lobby.join(1, 'a')?.member.role).toBe('player');
    expect(lobby.join(2, 'w', Math.random, true)?.member.role).toBe('spectator');
    expect(lobby.join(3, 'q')?.member.role).toBe('spectator');
    expect(lobby.queuePosition(3)).toBe(1);
    expect(lobby.join(4, 'x', Math.random, true)).toBeNull();      // two spectators: full
    expect(lobby.spectators().map((m) => m.id)).toEqual([3, 2]);    // the queue first, then the watchers
    const changes = lobby.leave(1);
    expect(changes.find((c) => c.kind === 'promoted')).toMatchObject({ id: 3 });
    expect(lobby.member(2)?.role).toBe('spectator');
  });
});

describe('a forced side (CLAN-JOIN, research 308 §4.2: the host\'s clan rule, FUN_002bc620 D:L161355-161395)', () => {
  it('a forced side with room takes the joiner whatever the balance; full, no seat -- never the other side, never the queue', () => {
    const lobby = new Lobby({ teamSize: 2 });
    expect(lobby.join(1, 'h', Math.random, false, 'seal')?.member.team).toBe('seal');            // the host's preference
    expect(lobby.join(2, 'a', Math.random, false, undefined, 'seal')?.member.team).toBe('seal');  // the balance would say terrorist
    expect(lobby.sideFull('seal')).toBe(true);
    expect(lobby.sideFull('terrorist')).toBe(false);
    expect(lobby.join(3, 'b', Math.random, false, undefined, 'seal')).toBeNull();                 // full: refused (reason 3), not placed
    expect(lobby.member(3)).toBeUndefined();
    expect(lobby.spectators()).toEqual([]);
    expect(lobby.join(3, 'b', Math.random, false, undefined, 'terrorist')?.member.team).toBe('terrorist');
    expect(lobby.join(4, 'w', Math.random, true, undefined, 'seal')?.member).toMatchObject({ role: 'spectator', team: null });   // a watch: no side
    expect(lobby.teamCounts()).toEqual({ seal: 2, terrorist: 1 });
  });

  it('the host\'s side stays a preference: full, the balance (the original host is the first seat, so never full there)', () => {
    const lobby = new Lobby({ teamSize: 1 });
    expect(lobby.join(1, 'a', Math.random, false, undefined, 'terrorist')?.member.team).toBe('terrorist');
    expect(lobby.join(2, 'h', Math.random, false, 'terrorist')?.member.team).toBe('seal');
  });
});

describe('property: random join/leave/rename', () => {
  it('keeps the roster invariants over 2000 operations', () => {
    const rnd = lcg(20260929);
    const lobby = new Lobby();
    const pool = ['Bob', 'bob', 'BOB', '', '  ', 'Zoeé', 'A'.repeat(45), 'a  b', 'Bob(2)', 'x\u0001y', 'Player1234'];
    let lastQueueOrder: number[] = [];
    for (let step = 0; step < 2000; step++) {
      const id = Math.floor(rnd() * 60);
      const before = lobby.teamCounts();
      const present = lobby.member(id) !== undefined;
      const queuedBefore = lobby.spectators().map((m) => m.id);
      if (!present) {
        const r = lobby.join(id, pool[Math.floor(rnd() * pool.length)]!, rnd);
        if (r) {
          const c = r.changes[0]!;
          if (c.kind === 'joined' && c.role === 'player') expect(c.team).toBe(assignTeam(before.seal, before.terrorist));
        }
      } else if (rnd() < 0.5) {
        const wasPlayer = lobby.member(id)!.role === 'player';
        const changes = lobby.leave(id);
        const promo = changes.find((c) => c.kind === 'promoted');
        if (wasPlayer && queuedBefore.length > 0) {
          expect(promo).toBeDefined();
          expect(promo && promo.kind === 'promoted' && promo.id).toBe(queuedBefore[0]);
        }
      } else {
        lobby.rename(id, pool[Math.floor(rnd() * pool.length)]!, rnd);
      }

      const players = lobby.players();
      const specs = lobby.spectators();
      expect(players.length).toBeLessThanOrEqual(16);
      const tc = lobby.teamCounts();
      expect(tc.seal).toBeLessThanOrEqual(8);
      expect(tc.terrorist).toBeLessThanOrEqual(8);
      expect(tc.seal + tc.terrorist).toBe(players.length);
      // FIFO: queued in strictly rising join order, and the queue only loses its head or a leaver, gains at the tail
      expect(specs.every((s, i) => i === 0 || s.joinedAt > specs[i - 1]!.joinedAt)).toBe(true);
      const survivors = lastQueueOrder.filter((q) => specs.some((s) => s.id === q));
      expect(specs.map((s) => s.id).slice(0, survivors.length)).toEqual(survivors);
      lastQueueOrder = specs.map((s) => s.id);
      if (specs.length > 0) expect(players.length).toBe(16);
      const seen = new Set<string>();
      let bad = '';
      for (const m of [...players, ...specs]) {
        if (m.name.length === 0 || m.name.length > NAME_MAX) bad += ` length:${m.name}`;
        // NAMES-MIDDLE: the drawable set, not printable ASCII (NAME_DRAWABLE_ADAPTATION; 'Zoeé' in the pool stays)
        if (![...m.name].every(isNameDrawable)) bad += ` drawable:${m.name}`;
        if (seen.has(m.name.toLowerCase())) bad += ` dup:${m.name}`;
        seen.add(m.name.toLowerCase());
        if (m.role === 'player' ? m.team === null : m.team !== null) bad += ` team:${m.id}`;
      }
      expect(bad).toBe('');
      const ids = [...players, ...specs].map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      const present60 = Array.from({ length: 60 }, (_, i) => lobby.member(i) !== undefined);
      expect(present60).toEqual(Array.from({ length: 60 }, (_, i) => ids.includes(i)));
    }
  });

  it('places every promotion by the team rule on the counts left after the leaver', () => {
    const rnd = lcg(7);
    const lobby = new Lobby();
    for (let i = 0; i < 40; i++) lobby.join(i, `n${i}`, rnd);
    for (let i = 0; i < 24; i++) {
      const leaver = lobby.players()[Math.floor(rnd() * lobby.players().length)]!;
      const changes = lobby.leave(leaver.id);
      const c = lobby.teamCounts();
      const promo = changes.find((x) => x.kind === 'promoted');
      expect(promo).toBeDefined();
      if (promo && promo.kind === 'promoted') {
        const rest = { ...c, [promo.team === 'seal' ? 'seal' : 'terrorist']: c[promo.team] - 1 };
        expect(promo.team).toBe(assignTeam(rest.seal, rest.terrorist));
      }
    }
  });
});

describe('names', () => {
  it('sanitizeName strips, collapses, trims and cuts', () => {
    expect(sanitizeName('a\u0000b\u0007c\u007f')).toBe('abc');
    // NAMES-MIDDLE (`NAME_DRAWABLE_ADAPTATION`): the drawable characters kept, the rest dropped.
    expect(sanitizeName('café 中文 x')).toBe('café x');
    expect(sanitizeName('  a    b  ')).toBe('a b');
    expect(sanitizeName('\u0001é')).toBe('é');
    expect(sanitizeName('\u0001\u200b')).toBe('');
    expect(sanitizeName('   ')).toBe('');
    const long = 'abcdefghij'.repeat(4);
    expect(long.length).toBe(40);
    expect(sanitizeName(long)).toBe(long.slice(0, 30));
  });

  it('NAMES-MIDDLE: sanitizeName keeps every drawable character and drops the invisible and the undrawable', () => {
    expect(sanitizeName('Jöhn')).toBe('Jöhn');
    expect(sanitizeName('¡')).toBe('¡');
    expect(sanitizeName('¡Hola Señor')).toBe('¡Hola Señor');
    expect(sanitizeName('Œuvre Š Ÿ „€')).toBe('Œuvre Š Ÿ „€');
    expect(sanitizeName('Craig\u200b')).toBe('Craig');
    expect(sanitizeName('\ufeffCr\u0430ig\u{1F600}')).toBe('Crig');
    expect(sanitizeName('a\tb\u00a0c\u00ad\u1e0d')).toBe('abc');
    expect(sanitizeName('\u00b2\u00a3')).toBe('');                    // r0004's C alias and a pad glyph: not the name's
    const long = 'é'.repeat(40);
    expect(sanitizeName(long)).toBe('é'.repeat(30));
  });

  it('NAMES-MIDDLE: a name with something drawable is kept in the room; Player#### only when nothing drawable is left', () => {
    const lobby = new Lobby();
    expect(lobby.join(1, '¡', () => 0)?.member.name).toBe('¡');
    expect(lobby.join(2, 'Craig\u200b', () => 0)?.member.name).toBe('Craig');
    expect(lobby.join(3, '\u200b', () => 0)?.member.name).toBe('Player1000');
    expect(lobby.rename(2, 'Jöhn')).toEqual([{ kind: 'renamed', id: 2, name: 'Jöhn' }]);
    expect(lobby.renameIfFree(2, 'Señor')).toEqual([{ kind: 'renamed', id: 2, name: 'Señor' }]);
  });

  it('uniqueName takes the lowest free suffix within 30 characters', () => {
    expect(uniqueName('Bob', new Set())).toBe('Bob');
    expect(uniqueName('Bob', new Set(['bob']))).toBe('Bob(2)');
    expect(uniqueName('Bob', new Set(['bob', 'bob(2)']))).toBe('Bob(3)');
    expect(uniqueName('BOB', new Set(['bob', 'bob(3)']))).toBe('BOB(2)');
    const full = 'x'.repeat(30);
    const r = uniqueName(full, new Set([full]));
    expect(r.length).toBe(30);
    expect(r.endsWith('(2)')).toBe(true);
    expect(r).toBe('x'.repeat(27) + '(2)');
  });

  it('guestName is Player plus four digits', () => {
    expect(guestName()).toMatch(/^Player\d{4}$/);
    expect(guestName(() => 0)).toBe('Player1000');
    expect(guestName(() => 0.999999999)).toBe('Player9999');
    const rnd = lcg(3);
    for (let i = 0; i < 100; i++) expect(guestName(rnd)).toMatch(/^Player\d{4}$/);
  });

  it('join and rename resolve names', () => {
    const lobby = new Lobby();
    expect(lobby.join(1, 'Bob')?.member.name).toBe('Bob');
    expect(lobby.join(2, 'bob')?.member.name).toBe('bob(2)');
    expect(lobby.join(3, 'é', () => 0)?.member.name).toBe('é');
    expect(lobby.join(4, '\u200b\ufeff', () => 0)?.member.name).toBe('Player1000');
    expect(lobby.rename(2, '')).toEqual([]);
    expect(lobby.rename(1, 'BOB')).toEqual([{ kind: 'renamed', id: 1, name: 'BOB' }]);
    expect(lobby.rename(1, 'BOB')).toEqual([]);
    // 'bob(2)' -> 'Bob': taken by nobody else now that 1 is 'BOB'? it is (case-insensitive), so it becomes 'Bob(2)'
    expect(lobby.rename(2, 'Bob')).toEqual([{ kind: 'renamed', id: 2, name: 'Bob(2)' }]);
  });
});

describe('the idle kick (W3.R13)', () => {
  it('moves an idle player to the back of the queue and promotes the head; with nobody waiting it is null', () => {
    const lobby = new Lobby();
    for (let id = 1; id <= 16; id++) lobby.join(id, `P${id}`);
    expect(lobby.demote(3)).toBeNull();                         // nobody waits: the server disconnects instead
    lobby.join(17, 'Q17');
    lobby.join(18, 'Q18');
    const changes = lobby.demote(3)!;
    expect(changes).toContainEqual({ kind: 'promoted', id: 17, team: expect.any(String) });
    expect(lobby.member(3)!.role).toBe('spectator');
    expect(lobby.spectators().map((m) => m.id)).toEqual([18, 3]);
    expect(lobby.queuePosition(3)).toBe(2);
    expect(lobby.players().length).toBe(16);
    const counts = lobby.teamCounts();
    expect(counts.seal).toBe(8);
    expect(counts.terrorist).toBe(8);
  });
});

describe('Lobby.tradeTeams (WM-51: the team swap queue\'s trade, WM.R21 -- a departure from the original on the owner\'s word)', () => {
  /** 16 joiners, 8 v 8 by the join rule: 1 T, 2 S, 3 S, 4 T, ...; the 17th waits in the queue. */
  function full(): Lobby {
    const lobby = new Lobby();
    for (let i = 1; i <= 17; i++) lobby.join(i, `p${i}`);
    return lobby;
  }
  const snapshot = (lobby: Lobby) => ({ players: lobby.players(), spectators: lobby.spectators(), counts: lobby.teamCounts() });

  it('two players on opposite sides at 8 v 8 trade: true, each on the other side, the counts unchanged', () => {
    const lobby = full();
    expect(lobby.member(2)!.team).toBe('seal');
    expect(lobby.member(1)!.team).toBe('terrorist');
    expect(lobby.tradeTeams(2, 1)).toBe(true);
    expect(lobby.member(2)!.team).toBe('terrorist');
    expect(lobby.member(1)!.team).toBe('seal');
    expect(lobby.teamCounts()).toEqual({ seal: 8, terrorist: 8 });
    expect(lobby.member(1)!.role).toBe('player');
    expect(lobby.queuePosition(17)).toBe(1);
  });
  it('the same side, a spectator, an unknown id: false, nothing changes', () => {
    const lobby = full();
    const before = snapshot(lobby);
    expect(lobby.member(3)!.team).toBe('seal');
    expect(lobby.tradeTeams(2, 3)).toBe(false);                 // both SEALs
    expect(lobby.tradeTeams(1, 17)).toBe(false);                // 17 a queued spectator
    expect(lobby.tradeTeams(17, 1)).toBe(false);
    expect(lobby.tradeTeams(2, 99)).toBe(false);                // unknown
    expect(lobby.tradeTeams(2, 2)).toBe(false);
    expect(snapshot(lobby)).toEqual(before);
  });
});

describe('Lobby.enlist / withdraw (SEAT_CLAIM_ADAPTATION: a watcher asks for a seat -- no original, the owner\'s word)', () => {
  /** `players` playing joiners, then the watchers 101.. (`watchers` of them). */
  function room(players: number, watchers: number, maxPlayers = 16): Lobby {
    const lobby = new Lobby({ maxPlayers });
    for (let i = 1; i <= players; i++) lobby.join(i, `p${i}`);
    for (let i = 0; i < watchers; i++) lobby.join(101 + i, `w${i}`, Math.random, true);
    return lobby;
  }

  it('a free seat is held for the watcher at once, by the team rule (reserved), and `confirm` seats it there', () => {
    const lobby = room(15, 1);
    expect(lobby.openSeats()).toBe(1);
    const short = lobby.teamCounts().seal < 8 ? 'seal' : 'terrorist';
    const changes = lobby.enlist(101);
    expect(changes).toEqual([{ kind: 'reserved', id: 101, team: short }]);
    expect(lobby.reserved(101)).toBe(true);
    expect(lobby.member(101)).toMatchObject({ role: 'spectator', team: short });   // its side counted, not yet a player
    expect(lobby.watching(101)).toBe(false);
    expect(lobby.openSeats()).toBe(0);
    expect(lobby.teamCounts()).toEqual({ seal: 8, terrorist: 8 });
    expect(lobby.join(200, 'late')?.member.role).toBe('spectator');           // the held seat is no newcomer's
    expect(lobby.confirm(101)).toEqual([{ kind: 'promoted', id: 101, team: short, claim: true }]);   // marked: a claim's seat
    expect(lobby.member(101)).toMatchObject({ role: 'player', team: short });
    expect(lobby.reserved(101)).toBe(false);
    expect(lobby.confirm(101)).toEqual([]);
  });

  it('a held seat\'s holder is still a spectator in the room\'s lists -- first of them, a seat ahead of the line -- never lost between the two', () => {
    const lobby = room(15, 2);
    lobby.enlist(101);                                            // a free seat: held
    lobby.enlist(102);                                            // the room full now: first in line
    expect([lobby.reserved(101), lobby.queuePosition(101), lobby.queuePosition(102)]).toEqual([true, 0, 1]);
    expect(lobby.spectators().map((m) => m.id)).toEqual([101, 102]);
    expect(lobby.players().map((m) => m.id)).not.toContain(101);
    expect([...lobby.players(), ...lobby.spectators()]).toHaveLength(17);   // every member in exactly one list
    lobby.confirm(101);
    expect(lobby.spectators().map((m) => m.id)).toEqual([102]);
    expect(lobby.players().map((m) => m.id)).toContain(101);
  });

  it('a held seat\'s holder leaving frees it for the queue\'s next', () => {
    const lobby = room(15, 1);
    lobby.enlist(101);
    lobby.join(17, 'p17');                                        // queued behind the held seat
    const changes = lobby.leave(101);
    expect(changes).toContainEqual({ kind: 'promoted', id: 17, team: expect.any(String) });
    expect(lobby.reserved(101)).toBe(false);
    expect(lobby.confirm(101)).toEqual([]);
  });

  it('a full room puts the watcher in the line (its place told); the next leave seats it', () => {
    const lobby = room(16, 1);
    expect(lobby.openSeats()).toBe(0);
    expect(lobby.enlist(101)).toEqual([{ kind: 'queue', id: 101, position: 1 }]);
    expect(lobby.watching(101)).toBe(false);
    expect(lobby.enlisted(101)).toBe(true);
    expect(lobby.queuePosition(101)).toBe(1);
    const team = lobby.member(4)!.team!;
    const changes = lobby.leave(4);
    expect(changes).toContainEqual({ kind: 'reserved', id: 101, team });
    expect(lobby.confirm(101)).toEqual([{ kind: 'promoted', id: 101, team, claim: true }]);
    expect(lobby.member(101)).toMatchObject({ role: 'player', team });
    expect(lobby.enlisted(101)).toBe(false);
  });

  it('first press wins: two watchers at one free seat -- the first seated, the second first in line', () => {
    const lobby = room(15, 2);
    const short = lobby.teamCounts().seal < 8 ? 'seal' : 'terrorist';
    expect(lobby.enlist(102)).toEqual([{ kind: 'reserved', id: 102, team: short }]);
    expect(lobby.enlist(101)).toEqual([{ kind: 'queue', id: 101, position: 1 }]);
    expect(lobby.member(101)!.role).toBe('spectator');
  });

  it('joins the back of the line behind playing joiners already queued', () => {
    const lobby = room(16, 1);
    lobby.join(17, 'p17');                                        // a playing joiner past the players: queued
    expect(lobby.enlist(101)).toEqual([{ kind: 'queue', id: 101, position: 2 }]);
  });

  it('withdraw: back to watching, the line behind it moved up; only an enlisted spectator withdraws', () => {
    const lobby = room(16, 2);
    lobby.enlist(101);
    lobby.enlist(102);
    expect(lobby.withdraw(101)).toEqual([{ kind: 'queue', id: 102, position: 1 }]);
    expect(lobby.watching(101)).toBe(true);
    expect(lobby.enlisted(101)).toBe(false);
    expect(lobby.queuePosition(101)).toBe(0);
    expect(lobby.withdraw(101)).toBeNull();                       // a watcher already
    lobby.join(17, 'p17');                                        // a queued playing joiner did not ask to watch
    expect(lobby.withdraw(17)).toBeNull();
    expect(lobby.withdraw(1)).toBeNull();                         // a player
  });

  it('enlist is a watcher\'s only: a player, a queued joiner, an unknown id -- null, nothing changes', () => {
    const lobby = room(16, 1);
    lobby.join(17, 'p17');
    const before = { players: lobby.players(), spectators: lobby.spectators() };
    expect(lobby.enlist(1)).toBeNull();
    expect(lobby.enlist(17)).toBeNull();
    expect(lobby.enlist(999)).toBeNull();
    expect({ players: lobby.players(), spectators: lobby.spectators() }).toEqual(before);
  });

  it('openSeats: the players\' room left, bounded by the sides\' places (a smaller room, a full side)', () => {
    expect(room(0, 0).openSeats()).toBe(16);
    expect(room(10, 0, 12).openSeats()).toBe(2);
    expect(room(12, 0, 12).openSeats()).toBe(0);
    const lobby = new Lobby({ maxPlayers: 16, teamSize: 8 });
    for (let i = 1; i <= 8; i++) lobby.join(i, `s${i}`, Math.random, false, undefined, 'seal');
    expect(lobby.openSeats()).toBe(8);
  });

  it('a seat a queued joiner waits for is not open to the watchers', () => {
    // A forced (clan) queue head can wait while the room shows places; those places are its, not a newcomer's.
    const lobby = room(16, 0);
    lobby.join(17, 'p17');
    expect(lobby.openSeats()).toBe(0);
  });

  it('the takeover keeps an enlisted place (rekey)', () => {
    const lobby = room(16, 1);
    lobby.enlist(101);
    lobby.rekey(101, 201);
    expect(lobby.enlisted(201)).toBe(true);
    expect(lobby.queuePosition(201)).toBe(1);
    expect(lobby.withdraw(201)).toEqual([]);
    expect(lobby.watching(201)).toBe(true);
  });

  it('demote (the idle kick) of a player once a watcher leaves it a playing joiner, not enlisted', () => {
    const lobby = room(15, 1);
    lobby.enlist(101);
    lobby.confirm(101);                                           // seated
    lobby.join(17, 'p17');                                        // queued behind the full room
    expect(lobby.demote(101)).not.toBeNull();
    expect(lobby.enlisted(101)).toBe(false);
    expect(lobby.watching(101)).toBe(false);
  });
});
