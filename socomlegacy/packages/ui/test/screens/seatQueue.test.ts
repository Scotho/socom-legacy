import { describe, expect, it } from 'vitest';
import type { ChannelListEntry } from '../../src/screens/worldOfSocomCommands';
import { BRIEFING_ROOM, type GameListEntry } from '../../src/screens/briefingRoomCommands';
import { GAME_LOBBY, type GameLobbyView } from '../../src/screens/gameLobbyCommands';
import { withInviteButton } from '../../src/screens/inviteJoin';
import {
  SEAT_QUEUE_BUTTON, SEAT_QUEUE_CAPTION_VAR, SEAT_QUEUE_LOAD_ANIMATION, SEAT_QUEUE_SYNC_NONE, SEAT_QUEUE_WORDS_ADAPTATION, SWITCH_TEAMS_CAPTION,
  seatQueueGate, seatQueueView, syncSeatQueue, withSeatQueueButton, type SeatQueueState, type SeatQueueView,
} from '../../src/screens/seatQueue';
import type { DialogDesign } from '../../src/dialog';
import { HAVE } from './worldOfSocomRig';
import { gameLobbyRig, seat, type GameLobbyRigOptions } from './gameLobbyRig';

/**
 * SEAT_QUEUE_BUTTON_ADAPTATION (`../../src/screens/seatQueue`): a spectator's SWITCH TEAMS -- greyed by the disc's own
 * lobby -- is the room's seat queue while the room takes claims; a player's, and a spectator's with no claims, the disc's.
 */

const state = (o: Partial<SeatQueueState> = {}): SeatQueueState => ({ claim: true, open: 0, queue: 0, coming: false, ...o });

describe('seatQueueView: the button a spectator\'s state draws', () => {
  const W = SEAT_QUEUE_WORDS_ADAPTATION;
  it('no spectator in the room: null (the original, untouched)', () => {
    expect(seatQueueView(null)).toBeNull();
  });
  it('claims closed: the disc\'s SWITCH TEAMS, greyed, not the queue\'s', () => {
    expect(seatQueueView(state({ claim: false }))).toEqual({ caption: SWITCH_TEAMS_CAPTION, enabled: false, line: null, ours: false });
  });
  it('a free seat JOIN GAME, a full game JOIN QUEUE, a place LEAVE QUEUE (n), a held seat JOINING...', () => {
    expect(seatQueueView(state({ open: 2 }))).toEqual({ caption: W.open.caption, enabled: true, line: W.open.line, ours: true });
    expect(seatQueueView(state())).toEqual({ caption: W.full.caption, enabled: true, line: W.full.line, ours: true });
    expect(seatQueueView(state({ queue: 3 }))).toMatchObject({ caption: 'LEAVE QUEUE (3)', line: 'Number 3 in line. ¦ Leave the queue.', ours: true });
    expect(seatQueueView(state({ coming: true, queue: 1 }))).toMatchObject({ caption: W.coming.caption, ours: true });
  });
  it('a place in the queue stands even once the room takes claims no more (its leave still offered)', () => {
    expect(seatQueueView(state({ claim: false, queue: 1 }))).toMatchObject({ caption: 'LEAVE QUEUE (1)', enabled: true, ours: true });
  });
});

describe('withSeatQueueButton: the GAME LOBBY\'s SWITCH TEAMS takes the caption\'s var', () => {
  const button = (name: string) => ({ name, x: 16, y: 123, childOf: null, widget: { type: 'BUTTON', uivar: null, button: { caption: SWITCH_TEAMS_CAPTION, bindings: [] } } });
  const design = { controls: [button('weaponselect'), button(SEAT_QUEUE_BUTTON), button('PlayerReady')], objects: [] } as unknown as DialogDesign;
  it('the record keeps its place and caption; its var starts as the original caption; another screen is as read', () => {
    const lookup = withSeatQueueButton((n) => (n === GAME_LOBBY || n === 'other' ? design : null));
    const d = lookup(GAME_LOBBY)!;
    expect(d.controls.map((c) => c.name)).toEqual(['weaponselect', SEAT_QUEUE_BUTTON, 'PlayerReady']);
    const w = d.controls[1]!.widget as unknown as { uivar: unknown; button: { caption: string } };
    expect(w.uivar).toEqual({ name: SEAT_QUEUE_CAPTION_VAR, value: SWITCH_TEAMS_CAPTION, longevity: 2 });
    expect(w.button.caption).toBe(SWITCH_TEAMS_CAPTION);
    expect(lookup('other')).toBe(design);
    expect(withSeatQueueButton(() => d)(GAME_LOBBY)).toBe(d);       // once
  });
});

describe('seatQueueGate: the button\'s two bindings, the queue\'s while it is the queue\'s', () => {
  const start = (animation: string, dialog = GAME_LOBBY) => ({ dialog, design: {} as DialogDesign, animation, argument: null });
  it('the queue\'s: CROSS presses, focus writes the line; the original\'s, a player\'s, another screen\'s: the disc\'s run', () => {
    let view: SeatQueueView | null = seatQueueView(state());
    const pressed: number[] = [], lines: string[] = [];
    const gate = seatQueueGate({ view: () => view, press: () => { pressed.push(1); }, node: (cmd) => { lines.push(cmd.arg); } });
    expect(gate(start('switch_teams_anim'))).toBe(true);
    expect(gate(start('OnSteamStart'))).toBe(true);
    expect([pressed.length, lines]).toEqual([1, [SEAT_QUEUE_WORDS_ADAPTATION.full.line]]);
    expect(gate(start('ready_anim'))).toBe(false);
    expect(gate(start('switch_teams_anim', 'dlgMPBriefingRoom.rdr'))).toBe(false);
    view = seatQueueView(state({ claim: false }));
    expect(gate(start('switch_teams_anim'))).toBe(false);
    view = null;
    expect(gate(start('switch_teams_anim'))).toBe(false);
    expect(pressed.length).toBe(1);
  });
});

const SETTLED = 60, SECOND = 30;
const statsHex = (o: Record<number, number>): string => { const b = new Uint8Array(256); b[0] = 0x44; for (const [k, v] of Object.entries(o)) b[Number(k)] = v; return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const room = (lobbyName: string, mediusWorldId: number, o: Partial<ChannelListEntry> = {}): ChannelListEntry => ({
  status: 0, mediusWorldId, playerCount: 0, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList: false, ...o,
});
const GAME: GameListEntry = {
  status: 0, mediusWorldId: 7, playerCount: 2, minPlayers: 2, maxPlayers: 10, gameLevel: 2, playerSkillLevel: 0, rulesSet: 1,
  genericField1: 1, genericField2: 65000, genericField3: 0, securityLevel: 0, worldStatus: 2, gameHostType: 0,
  gameName: 'queue$~Alpha', gameStats: statsHex({ 1: 5, 2: 6, 4: 2, 8: 2 }), endOfList: true,
};
const view = (seats: GameLobbyView['seats'], o: Partial<GameLobbyView> = {}): GameLobbyView => ({ seats, countdown: null, launched: false, ...o });
const WATCHING = [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', null)];
const PLAYING = [seat(1, 'host', 'seal', { host: true }), seat(2, 'socomc', 'terrorist')];
type Rig = Awaited<ReturnType<typeof gameLobbyRig>>;
const go = (r: Rig, name: string): void => { for (let i = 0; i < 12 && r.focused() !== name; i++) r.press('DOWN', 6); expect(r.focused()).toBe(name); };
async function until(r: Rig, done: () => boolean, frames = 60 * SECOND): Promise<void> { for (let i = 0; i < frames && !done(); i++) await r.settle(1); }

/** The GAME LOBBY through the BRIEFING ROOM's WATCH GAME (or JOIN GAME), the queue's sync and gate mounted as the page mounts them. */
async function into(button: 'WatchGame' | 'JoinGame', lobbyView: () => GameLobbyView, o: GameLobbyRigOptions = {}) {
  let rig: Rig | null = null, was = SEAT_QUEUE_SYNC_NONE;
  const queue = { state: null as SeatQueueState | null, pressed: 0, launched: true };
  const r = await gameLobbyRig({
    name: 'socomc', announcement: '', rooms: [room('Alpha', 1, { playerCount: 2 }), room('Bravo', 2, { endOfList: true })], games: [GAME], lobbyView,
    dialogs: (lookup) => withSeatQueueButton(withInviteButton(lookup, () => true)),
    tick: () => { if (rig) was = syncSeatQueue({ view: seatQueueView(queue.state), uiVars: rig.uiVars, dialog: rig.current(), parts: rig.parts.current, focused: rig.focused(), was, launched: queue.launched }); },
    ...o,
  });
  rig = r;
  r.host.setBindingGate('seat-queue', seatQueueGate({ view: () => seatQueueView(queue.state), press: () => { queue.pressed++; }, node: (cmd) => r.parts.current?.nodeCommand(cmd) }));
  await r.settle(SETTLED);
  r.press('CROSS', 10);
  go(r, 'briefingrooms');
  r.press('CROSS', 6);
  r.press('CROSS', 2);
  await until(r, () => r.current() === BRIEFING_ROOM);
  await r.settle(SETTLED);
  go(r, button);
  r.press('CROSS', 6);
  r.press('CROSS', 2);
  await until(r, () => r.current() === GAME_LOBBY);
  await r.settle(SETTLED);
  if (r.shown()) { r.press('CROSS', 10); await r.settle(6 * SECOND); }     // #352 / #353's YES (a launched game's late seat)
  expect([r.shown(), r.current()]).toEqual([false, GAME_LOBBY]);
  return { r, room: queue };
}
const caption = (r: Rig): string => {
  const w = r.parts.current!.widgets.get(SEAT_QUEUE_BUTTON);
  return w && 'captionCodes' in w ? String.fromCharCode(...w.captionCodes as number[]) : '';
};
const lit = (r: Rig): boolean => r.parts.current!.widgets.enabled(r.parts.current!.widgets.specOf(SEAT_QUEUE_BUTTON)!);
/** The focus strip's line (`DescriptionText`). */
const strip = (r: Rig): unknown => [r.text('DescriptionText')].flat()[0];

describe.skipIf(!HAVE)(`the GAME LOBBY's seat queue over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('a watcher of a launched game: the disc\'s greyed SWITCH TEAMS until the room takes claims; then JOIN QUEUE, lit, its CROSS the queue\'s', async () => {
    const { r, room } = await into('WatchGame', () => view(WATCHING, { launched: true }));
    const original = caption(r);
    expect([r.valve('player_team'), original.length > 0, lit(r)]).toEqual([16, true, false]);   // the disc's grey, its caption
    room.state = state();
    await r.settle(2);
    expect([caption(r), lit(r)]).toEqual(['JOIN QUEUE', true]);
    go(r, SEAT_QUEUE_BUTTON);
    r.press('CROSS', 4);
    expect([room.pressed, r.sent]).toEqual([1, []]);                       // the queue's, never switchTeams
    room.state = state({ queue: 2 });
    await r.settle(2);
    expect([caption(r), strip(r)]).toEqual(['LEAVE QUEUE (2)', SEAT_QUEUE_WORDS_ADAPTATION.queued.line.replace('%n', '2')]);
    room.state = state({ claim: false });                                   // the room takes claims no more
    await r.settle(2);
    expect([caption(r), lit(r)]).toEqual([original, false]);
    expect(strip(r)).toBe(r.loc.byId.get(358));                             // the disc's focus line (#358) back, not the queue's
    room.state = state();                                                   // claims open again: lit
    await r.settle(2);
    expect(lit(r)).toBe(true);
    room.state = null;                                                      // no view any more (its `promoted`: a player; a socket gone)
    await r.settle(2);
    // A fresh review's finding (2026-11-25): the bit the queue lit goes back to the disc's grey with the queue -- a late
    // seat's SWITCH TEAMS is greyed by the disc (`SetupLateJoiner`), and lit it would send `switchTeams`.
    expect([caption(r), lit(r)]).toEqual([original, false]);
    r.press('CROSS', 4);
    expect([room.pressed, r.sent]).toEqual([1, []]);
  });

  it('a claim still in line when the game came back to its lobby, seated there before a launch: its SWITCH TEAMS left lit -- a player\'s, as the disc lights it', async () => {
    // A re-check's finding (2026-11-25): the light-out greyed it here too, and nothing lit it again -- the disc greys a
    // seat's SWITCH TEAMS only after a launch (`SetupLateJoiner`); before one, a player's is lit (`SetupNormalJoiner`).
    const { r, room } = await into('WatchGame', () => view(WATCHING));
    room.launched = false;
    room.state = state({ claim: false, queue: 1 });                         // in line from the game before, claims closed
    await r.settle(2);
    expect([caption(r), lit(r)]).toEqual(['LEAVE QUEUE (1)', true]);
    room.state = null;                                                      // its `promoted`: a player in the lobby
    await r.settle(2);
    expect(lit(r)).toBe(true);
    await r.settle(SECOND);
    expect(lit(r)).toBe(true);                                              // and left so: the queue lets the bit go
  });

  it('the seat seated in the lobby: the screen\'s own READY (ready_anim) hands it off as the late seat it is', async () => {
    const { r } = await into('WatchGame', () => view(WATCHING, { launched: true }));
    expect(r.parts.current!.widgetHost.animation(SEAT_QUEUE_LOAD_ANIMATION, null)).toBe(true);
    await r.settle(SECOND);
    expect([r.valve('mp_major_game_state'), r.starts.map((s) => s.lateJoiner)]).toEqual([2, [true]]);
  });

  it('a player: the original SWITCH TEAMS -- its caption, and its CROSS sends switchTeams', async () => {
    const { r, room } = await into('JoinGame', () => view(PLAYING));
    const original = caption(r);
    expect(original).not.toBe('JOIN QUEUE');
    go(r, SEAT_QUEUE_BUTTON);
    r.press('CROSS', 4);
    expect([room.pressed, r.sent]).toEqual([0, ['switchTeams']]);
    expect(caption(r)).toBe(original);
  });
});
