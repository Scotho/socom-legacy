import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { HELD_RIFLE, HELD_SIDEARM, parseCharacterTable, teamCharacter, type CharacterTable } from '@s2u/scene';
import { Hud } from '../src/hud';
import { KILL_AUTOCOMM_READING, NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { tauntCaptions, tauntVocals } from '../src/tauntData';
import type { WalkMode } from '../src/walk';

/**
 * PF-10, the auto-comms after a kill (research 179 §6.14, research 91 §10). `FUN_00547860` (D:L412893-412909;
 * `FUN_00547a90` the same), after the kill line, for a victim other than the local player: comm 0x27 (`CMD_MP_ENEMY_DEAD`, `FUN_0058ed60`) said by the
 * killer when the victim shares no team bit with the local player, else 0x28 (`CMD_MP_FRIEND_DEAD`) said by the victim
 * (`FUN_005e7f20`). `FUN_005e7960` (D:L498028-498236) looks the id up in the SPEAKER's character's `multiplayer` list
 * (the record's `+0x3a0`, filled by `FUN_0053bbd0` from its `sounds`' `multiplayer` rows and copied from its base,
 * D:L406773-406793) and formats that row's text with the speaker's name; with no row the text is "" (0x662798), its
 * length 0 (`FUN_00199288`), and nothing is posted or played. No character of `character.rdr` lists 0x27 or 0x28 -- the
 * `orders.rdr` table that does (`_60555_EnemyKilled_MSG`, `SND_ENEMY_DEAD`) is not the list `FUN_005e7960` reads -- so
 * the original posts no "%s : Enemy Killed" and no "%s : Man down": KILL_AUTOCOMM_READING. A reading, pending review.
 */

describe('the page after a kill: the kill line alone (KILL_AUTOCOMM_READING)', () => {
  function page() {
    let socket: WebSocketLike | null = null;
    const posted: string[] = [];
    const hud = new Hud();
    hud.postMessage = ((text: string | { text: string }[]) => { posted.push(typeof text === 'string' ? text : text.map((l) => l.text).join('/')); }) as Hud['postMessage'];
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'walk', feet: () => [0, 0, 0],
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
      setType: () => undefined, playerType: () => 0, feet: () => [0, 0, 0],
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [{ id: 2, name: 'Mate', team: 'seal' }, { id: 3, name: 'Enemy', team: 'terrorist' }, { id: 4, name: 'Other', team: 'terrorist' }],
      rules: 'classic', round: 1, rounds: 11, ghost: false,
    } as unknown as ServerEvent);
    posted.length = 0;
    return { server, posted };
  }

  it('an enemy killed by the page\'s side, a team-mate killed: each posts its kill line and no comm line', () => {
    expect(KILL_AUTOCOMM_READING).toBe('none: no character lists comm 0x27 or 0x28');
    const { server, posted } = page();
    server({ type: 'kill', killer: 2, victim: 3, weapon: 'M4A1', how: 'weapon', clip: null, cause: 5 } as ServerEvent);   // would be 0x27 by Mate
    server({ type: 'kill', killer: 4, victim: 2, weapon: 'AK-47', how: 'weapon', clip: null, cause: 5 } as ServerEvent);  // would be 0x28 by Mate
    expect(posted).toEqual(['Mate fragged Enemy with M4A1', 'Other fragged Mate with AK-47']);
    expect(posted.some((l) => / : (Enemy Killed|Man down)$/.test(l))).toBe(false);
  });
});

/**
 * A character's `multiplayer` rows through its bases, as the loader builds the record's list: the base's rows copied
 * first (D:L406773-406793), then the character's own appended (`FUN_0053bbd0` D:L405478-405592, a row kept when its
 * text resolves). Each row's command name: `FUN_0058e0a0` / `FUN_0058e020` map it to its id.
 */
function commands(table: CharacterTable, character: string): string[] {
  const chain: RdrNode[] = [];
  for (let c = table.characters.get(character), d = 0; c && d < 32; d++) { chain.unshift(c.record); c = c.base === null ? undefined : table.characters.get(c.base); }
  return chain.flatMap((record) => {
    const sounds = rdrGet([record], 'sounds');
    const mp = sounds === undefined ? undefined : rdrGet(sounds, 'multiplayer');
    const rows = Array.isArray(mp) ? (typeof mp[0] === 'string' ? [mp] : mp) : [];
    // Case-folded, as the game compares the names (`FUN_00198b80` lowers both sides' capitals).
    return rows.flatMap((r) => (Array.isArray(r) && typeof r[0] === 'string' ? [r[0].toUpperCase()] : []));
  });
}

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'READERC.ZAR'));

describe.skipIf(!HAVE_DISC)('the auto-comms\' rows on the disc (SOCOM_DISC)', () => {
  const readerc = (): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN', 'READERC.ZAR'))));
  const member = (z: Zar, name: string): RdrNode => parseRdr(z.data(z.root.children.find((k) => k.name.toLowerCase() === name)!));

  it('no team character of the 22 maps lists CMD_MP_ENEMY_DEAD or CMD_MP_FRIEND_DEAD; each lists the quick comms', () => {
    // The kill's three comms (`FUN_0058ed60`): 0x27, 0x28, and 0x44 the VIP's (`FUN_00547860` D:L412913).
    const DEAD_COMMS = ['CMD_MP_ENEMY_DEAD', 'CMD_MP_FRIEND_DEAD', 'CMD_MP_HOSTAGE_KILLED'];
    const table = parseCharacterTable(member(readerc(), 'character.rdr'));
    let characters = 0;
    for (const file of readdirSync(join(DISC, 'RUN')).filter((f) => /^MP\d+\.ZDB$/i.test(f))) {
      const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', file)));
      const chartype = member(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR')), 'chartype.rdr');
      for (const team of ['navyseals', 'terrorists'] as const) for (let i = 0; i < 4; i++) {
        const c = teamCharacter(chartype, team, i)!;
        const cmds = commands(table, c);
        characters++;
        expect(cmds, c).toContain('CMD_MP_GRENADE_THROWN');      // the reader finds the list: "Fire in the hole" (0x26)
        for (const dead of DEAD_COMMS) expect(cmds, c).not.toContain(dead);
      }
    }
    expect(characters).toBe(176);
    // No character of the whole file lists them either; the rows that name them are orders.rdr's own table.
    for (const name of table.characters.keys()) {
      const cmds = commands(table, name);
      expect(DEAD_COMMS.filter((d) => cmds.includes(d)), name).toEqual([]);
    }
    expect(JSON.stringify(member(readerc(), 'orders.rdr'))).toContain('CMD_MP_ENEMY_DEAD');
  });

  /**
   * NU-7 W1 (research 325 §2.1, §4 W1): the warning's line is its row's text formatted with the thrower's name
   * (`FUN_005e7960` D:L498142). Every team character of the 22 maps names one text key for `CMD_MP_GRENADE_THROWN` in
   * its own `multiplayer` rows, HudCLOC 60592 (`_60592_sFireInTheHole_MSG`, `locTables.json`), which resolves in
   * `HudCLOC.rdr` and carries the name's `%s`; the port's reader (`./tauntData` `tauntVocals`, what `./matchSound`
   * posts) gives that text for each.
   */
  it("NU-7 W1: each team character's CMD_MP_GRENADE_THROWN row names HudCLOC 60592, which resolves and carries %s", () => {
    const z = readerc();
    const table = parseCharacterTable(member(z, 'character.rdr'));
    const captions = tauntCaptions(member(z, 'hudcloc.rdr'));
    const orders = member(z, 'orders.rdr');
    expect(captions['60592']).toBe('%s : FIRE IN THE HOLE!');
    expect(captions._60592_sFireInTheHole_MSG).toBe(captions['60592']);
    const keys = new Set<unknown>(), texts = new Set<string | null>();
    let characters = 0;
    for (const file of readdirSync(join(DISC, 'RUN')).filter((f) => /^MP\d+\.ZDB$/i.test(f))) {
      const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', file)));
      const chartype = member(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR')), 'chartype.rdr');
      const warnings = tauntVocals(table, chartype, orders, (key) => captions[key] ?? key, ['CMD_MP_GRENADE_THROWN']);
      for (const team of ['navyseals', 'terrorists'] as const) for (let i = 0; i < 4; i++) {
        const c = teamCharacter(chartype, team, i)!;
        const own = rdrGet(table.get(c, 'sounds') ?? [], 'multiplayer');
        const row = (Array.isArray(own) ? own.filter(Array.isArray) as RdrNode[][] : []).find((r) => r[0] === 'CMD_MP_GRENADE_THROWN');
        keys.add(row?.[2]);
        texts.add(warnings[team === 'navyseals' ? 'seal' : 'terrorist'][i]?.[0]?.text ?? null);
        characters++;
      }
    }
    expect(characters).toBe(176);
    expect([...keys]).toEqual(['_60592_sFireInTheHole_MSG']);
    expect([...texts]).toEqual(['%s : FIRE IN THE HOLE!']);
  });
});
