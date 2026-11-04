import { describe, expect, it } from 'vitest';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore } from '../../src/valves';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { CreateGameCommands, playListNumbers, type MissionRecord } from '../../src/screens/createGameCommands';
import { createGameRig, HAVE, WORLD } from './createGameRig';

/**
 * NB-7 (OT.R50, the owner 2026-10-13: "The nightly build should have all of our features from main without the demo
 * considerations"): CREATE GAME's PLAY LIST follows the server's offer when the server names one (`GET /maps`'s
 * `offer: "served"`, every server's since LATER 66), and the compiled FIRST_RELEASE_MAPS where it names none.
 * `FUN_00274940`'s own rules are untouched (D:L121473-121555: respawn's SUPPRESSION filter, the archive present); Medley
 * and Random stay out (`PLAY_LIST_FIRST_RELEASE_READING`: the page answers no `SetMPMissionSeq`), whatever the offer.
 * OT.R58 (the owner 2026-10-16: "limit create match map list to 4 maps (frostfire/crossroads/vig/nightfire)"): the
 * server's offer narrows the four, never widens them -- CREATE GAME lists only FIRST_RELEASE_MAPS on every host.
 */

const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'init_cg_screen', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });

const MISSIONS: MissionRecord[] = [
  { number: 51, name: 'VIGILANCE', type: 5, multiplayer: true }, { number: 52, name: 'THE MIXER', type: 3, multiplayer: true },
  { number: 72, name: 'CROSSROADS', type: 2, multiplayer: true }, { number: 2, name: 'FROSTFIRE', type: 5, multiplayer: true },
  { number: 6, name: 'DESERT GLORY', type: 4, multiplayer: true }, { number: 7, name: 'NIGHT STALKER', type: 2, multiplayer: true },
];

/** GetAvailableMPMissions' rows under an offer (`offered`; absent: the option not handed in). */
function rows(offered?: () => readonly number[] | null, o: { present?: (n: number) => boolean; allMaps?: () => boolean } = {}): number[] {
  const uiVars = new UiVarManager(), valves = new ValveStore();
  const c = new CreateGameCommands({
    uiVars, valves: () => valves, event: () => undefined, row: () => undefined, missions: () => MISSIONS,
    ...(offered ? { offered } : {}), ...(o.present ? { present: o.present } : {}), ...(o.allMaps ? { allMaps: o.allMaps } : {}),
  });
  expect(c.GetAvailableMPMissions(cmd('GetAvailableMPMissions', 'ROWS'), null as never, undefined)).toBe(true);
  return playListNumbers(uiVars.find('ROWS')?.value);
}

describe('CREATE GAME lists the four, narrowed by the server\'s offer when it names one, never widened (OT.R58)', () => {
  it('no offer handed in, or the server naming none (null): the four, in missionlist.rdr\'s order -- the release unchanged', () => {
    expect(rows()).toEqual([51, 72, 2, 7]);
    expect(rows(() => null)).toEqual([51, 72, 2, 7]);
  });

  it('the server\'s offer: the four among it, in missionlist.rdr\'s order (not the answer\'s); a map outside the four (MP6, MP52) never listed', () => {
    expect(rows(() => [72, 2, 6])).toEqual([72, 2]);
    expect(rows(() => [6, 52, 51, 72, 2, 7])).toEqual([51, 72, 2, 7]);
  });

  it('an offer of none, or of none of the four, lists none; Medley and Random are never listed; a mission whose archive is absent stays out', () => {
    expect(rows(() => [])).toEqual([]);
    expect(rows(() => [6, 52])).toEqual([]);
    expect(rows(() => [254, 255, 6, 2])).toEqual([2]);
    expect(rows(() => [72, 2, 6], { present: (n) => n !== 2 })).toEqual([72]);
  });

  it('the offer is read at each GetAvailableMPMissions: an answer that lands later is the one listed', () => {
    let offer: readonly number[] | null = null;
    expect(rows(() => offer)).toEqual([51, 72, 2, 7]);
    offer = [7, 6];
    expect(rows(() => offer)).toEqual([7]);
  });

  it('BAM.R4 / P537 (an adaptation: a developer\'s test server): only the server\'s CREATE_GAME_ALL_MAPS word (allMaps true) lists its whole offer; false or absent, the four as above', () => {
    expect(rows(() => [72, 2, 6], { allMaps: () => true })).toEqual([72, 2, 6]);
    expect(rows(() => [6, 52], { allMaps: () => true })).toEqual([52, 6]);
    expect(rows(() => [72, 2, 6], { allMaps: () => false })).toEqual([72, 2]);
    expect(rows(() => null, { allMaps: () => true })).toEqual([51, 72, 2, 7]);
  });
});

type Rig = ReturnType<typeof createGameRig>;
const listRows = (r: Rig, name: string): string[] => r.list(name).items.map((it) => it.captions.join(' '));

/** CREATE GAME entered over an offer of no map, the PLAY LIST opened on SelectGames' CROSS. */
async function emptyPlayList(): Promise<Rig> {
  const r = createGameRig({ offered: () => [] });
  await r.enter();
  expect(r.current()).toBe(r.dialog);
  r.go('SelectGames');
  expect(r.focused()).toBe('SelectGames');
  r.press('CROSS', 10);
  return r;
}

/**
 * LATER 66 (MAP-OFFER-RETIRE): with the served rule on every host, a central with no host up offers no map -- the empty
 * offer (`offer: "served"`, `maps: []`; the controller's condition, 2026-10-21: the page must not break, not soft-lock
 * the menu, and leave a way back). Over the disc's own `dlgCreateGame.rdr` (`./createGameRig`): the screen builds and its
 * PLAY LIST opens on no row; the popup's own rows (`accept_play_list`, `Back_out_from_play_list`, `add_a_mission`) are
 * the list's rows' handlers, so with none their buttons fall through to the screen's: SQUARE is CREATE, which the
 * script refuses with #303 (`TestUIVar(PLAYLISTVAR)`: no play list) and sends nothing; TRIANGLE is `create_game_exit`,
 * back to the caller with no #811 to answer. Pinned as the code does it today (it passed at RED: no code changed it).
 */
describe.skipIf(!HAVE)(`an offer of no map (no host up): the screen copes${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('CREATE GAME builds; the PLAY LIST opens on no row, its focus on AVAILABLE MAPS; CROSS adds none', async () => {
    const r = await emptyPlayList();
    expect([r.node('pop_missionBack')!.visible, r.focused(), listRows(r, 'AVAILABLE_MISSIONS')]).toEqual([true, 'AVAILABLE_MISSIONS', []]);
    r.press('CROSS', 8);
    await r.settle(3);
    expect([r.current(), listRows(r, 'SELECTED_MISSIONS'), playListNumbers(r.uiVars.find('PLAYLISTVAR')?.value)]).toEqual([r.dialog, [], []]);
  });

  it('CREATE cannot start a game with no map: SQUARE (in the empty list, or after naming the game) asks #303 and sends nothing; CONTINUE closes it', async () => {
    const r = createGameRig({ offered: () => [] });
    await r.enter();
    r.go('gamename_btn');
    r.press('CROSS', 20);
    r.type('empty');
    await r.settle(10);
    r.go('SelectGames');
    r.press('CROSS', 10);
    expect(listRows(r, 'AVAILABLE_MISSIONS')).toEqual([]);
    r.press('SQUARE', 10);
    await r.settle(5);
    expect(r.popupText()).toContain('You must create a playlist before game creation can occur.');
    r.press('CROSS', 10);
    await r.settle(5);
    expect([r.shown(), r.current(), r.requests, r.created, r.events]).toEqual([false, r.dialog, [], [], []]);
  });

  it('BACK: TRIANGLE inside the empty PLAY LIST, or on the screen itself, returns to the caller (create_game_exit)', async () => {
    const inList = await emptyPlayList();
    inList.press('TRIANGLE', 10);
    for (let i = 0; i < 60 && inList.current() !== WORLD; i++) await inList.settle(1);
    expect([inList.current(), inList.requests]).toEqual([WORLD, []]);

    const onScreen = createGameRig({ offered: () => [] });
    await onScreen.enter();
    onScreen.press('TRIANGLE', 10);
    for (let i = 0; i < 60 && onScreen.current() !== WORLD; i++) await onScreen.settle(1);
    expect(onScreen.current()).toBe(WORLD);
  });
});

