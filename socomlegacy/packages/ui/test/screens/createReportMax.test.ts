import { describe, expect, it } from 'vitest';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM } from '../../src/screens/briefingRoomCommands';
import { GAME_LOBBY, type GameLobbyView } from '../../src/screens/gameLobbyCommands';
import { CREATE_GAME } from '../../src/screens/createGameCommands';
import { HAVE } from './worldOfSocomRig';
import { gameLobbyRig, seat } from './gameLobbyRig';

/**
 * LATER 232 (reading; simulation track): the creator's world report sends the MaxPlayers its create
 * sent. The create sends MaxPlayersValve + MaxSpectatorsValve (`FUN_002edda0` D:L190528-190550), its reply writes no
 * valve (`cbCreateGame`, `FUN_002ee090` D:L190586-190641: only a listed join's `FUN_002f83b0` copies the record's MaxPlayers
 * into MaxPlayersValve, D:L197193-197205), and the report sends the same two valves' sum (`FUN_002ef590`
 * D:L191354-191363) -- so the two are one total, never the spectator slots counted twice. Over the disc's own dialogs
 * (`gameLobbyRig.ts`), CREATE GAME opened online (its SPECTATORS row's default, 8: research 314 §2.3).
 */

const SETTLED = 60;
const SECOND = 30;
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const ROOMS = [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2, { endOfList: true })];
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
const view = (seats: GameLobbyView['seats']): GameLobbyView => ({ seats, countdown: null, launched: false });
async function until(r: Rig, done: () => boolean, frames = 60 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }

describe.skipIf(!HAVE)(`LATER 232: the creator reports the total its create sent${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('CREATE GAME with its spectator slots: the world report\'s MaxPlayers is the create\'s, the slots counted once', async () => {
    const r = await gameLobbyRig({
      name: 'socomc', announcement: '', rooms: ROOMS, games: [],
      lobbyView: (id) => view([seat(id, 'socomc', 'seal', { host: true, readyIn: 30 })]),
    });
    await r.settle(SETTLED);
    r.press('CROSS', 10);
    go(r, 'briefingrooms');
    r.press('CROSS', 6);
    r.press('CROSS', 2);
    await until(r, () => r.current() === BRIEFING_ROOM, 200);
    await r.settle(SETTLED);
    go(r, 'CRgame');
    r.press('CROSS', 4);
    await until(r, () => r.current() === CREATE_GAME, 10 * SECOND);
    await r.settle(SETTLED);
    r.uiVars.set(r.uiVars.add('GAMENAMEVAR', null, 2), { type: 'string', value: 'mine' });
    r.uiVars.set(r.uiVars.add('PLAYLISTVAR', null, 2), { type: 'array', value: [{ type: 'array', value: [{ type: 'int', value: 2 }] }] });
    r.press('SQUARE', 4);
    await until(r, () => r.current() === GAME_LOBBY && r.reports.length > 0, 20 * SECOND);
    expect(r.creates).toHaveLength(1);
    expect(r.reports.length).toBeGreaterThan(0);
    // The spectator slots, GameStats byte 4 (`FUN_002f7c40`): in the create's total, as the SPECTATORS row's default has them.
    const spectators = Number.parseInt(r.reports[0]!.gameStats.slice(8, 10), 16);
    expect(spectators).toBeGreaterThan(0);
    expect(r.creates[0]!.maxPlayers).toBeGreaterThan(spectators);
    expect(r.reports[0]!.maxPlayers).toBe(r.creates[0]!.maxPlayers);
  }, 60_000);
});
