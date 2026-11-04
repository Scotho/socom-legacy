import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { ButtonWidget } from '../../src/widgets/button';
import { FIRST_RELEASE_MAPS } from '../../src/screens/createGameCommands';
import { createGameRig, HAVE, ROOM, WORLD } from './createGameRig';

/**
 * ONL-13 and ONL-14 over the machine (web research 163 and 164): CREATE GAME (`dlgCreateGame.rdr`) built from the
 * disc's own layout and set, entered from a stand-in caller by `openCreateGame`, its pad a test's snapshot. What is
 * pinned is the dialog's own ANIMATIONS replayed: `init_cg_screen`'s defaults, each row's cycle and its wrap
 * (`incr_num_players`, `SetRT_valve`, `SetNR_valve`, `set_FF_valve`), the private game's password (`toggle_password`
 * and PLAYER_NAME's soft keyboard), RESPAWN drawn and not selectable (OT.R21), the PLAY LIST popup listing only
 * Vigilance, Crossroads, Frostfire and Night Stalker, every row taken (OT.R16, the owner's three-map list of 2026-10-07,
 * and OT.R45's fourth of 2026-10-12: research 164 R164.3), `accept_play_list` into PLAYLISTVAR, CREATE's
 * request and its three answers (#294 for -975, #295 for any other failure, the hand-off for a success), TRIANGLE's
 * return to the caller. Decoded captions (RS.R8).
 */

type Rig = ReturnType<typeof createGameRig>;
const SQUARE = 'SQUARE' as const;
/** The rows of the list as drawn: the cells' captions and whether the row can be taken. */
const rows = (r: Rig, name: string): string[] => r.list(name).items.map((it) => `${it.captions.join(' ')}${it.selectable ? '' : ' (disabled)'}`);

async function screen(o: Parameters<typeof createGameRig>[0] = {}): Promise<Rig> {
  const r = createGameRig(o);
  await r.enter();
  expect(r.current()).toBe(r.dialog);
  return r;
}
/** The name typed on the soft keyboard (GAME NAME's CROSS). */
async function named(r: Rig, name: string): Promise<void> {
  r.go('gamename_btn');
  r.press('CROSS', 20);
  r.type(name);
  await r.settle(10);
}
/** The PLAY LIST's rows as `GetAvailableMPMissions` lists them for the first release (OT.R16): `missionlist.rdr`'s order. */
const VIGILANCE = 0, CROSSROADS = 1, FROSTFIRE = 2, NIGHT_STALKER = 3;
/** AVAILABLE MAPS' focus moved to row `i` (LEFT first when the selected list holds it), each step one press. */
function at(r: Rig, i: number): void {
  if (r.focused() !== 'AVAILABLE_MISSIONS') r.press('LEFT', 8);
  expect(r.focused()).toBe('AVAILABLE_MISSIONS');
  for (let k = 0; k < 4 && r.list('AVAILABLE_MISSIONS').focus < i; k++) r.press('DOWN', 3);
  for (let k = 0; k < 4 && r.list('AVAILABLE_MISSIONS').focus > i; k++) r.press('UP', 3);
  expect(r.list('AVAILABLE_MISSIONS').focus).toBe(i);
}
/** The play list made: SelectGames' CROSS, then CROSS on each row index given, then SQUARE (accept_play_list). */
async function playList(r: Rig, ...indices: number[]): Promise<void> {
  r.go('SelectGames');
  r.press('CROSS', 10);
  for (const i of indices) {
    at(r, i);
    r.press('CROSS', 8);
  }
  r.press(SQUARE, 10);
  await r.settle(5);
}

describe.skipIf(!HAVE)(`CREATE GAME over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the captions are the disc\'s: the thirteen rows #227-#239, PLAY LIST #240, CREATE GAME #241-#242, the play list popup #820-#822', async () => {
    const r = await screen();
    const t = (ids: number[]) => ids.map((id) => r.loc.byId.get(id));
    expect(t([227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239])).toEqual([
      'GAME NAME', 'SET PASSWORD', 'PLAYERS', 'ROUND COUNT', 'ROUND TIME', 'FRIENDLY FIRE', 'EQUIPMENT', 'SPECTATORS', 'RESTORE DEFAULTS', 'RESPAWN',
      'RANK RESTRICTIONS', 'CLAN OPTIONS', 'CHOOSE GAMES',
    ]);
    expect(t([240, 242, 820, 821])).toEqual(['PLAY LIST', 'CREATE GAME', 'AVAILABLE MAPS', 'SELECTED MAPS LIST']);
    expect(r.text('bar_title')).toBe('CREATE GAME');
  });

  it('init_cg_screen\'s first arrival: 16 players, 6 minutes, 11 rounds, no password, respawn off, friendly fire as global_valves leaves it (0)', async () => {
    const r = await screen();
    expect([r.valve('MaxPlayersValve'), r.valve('RTimeValve'), r.valve('RCountValve'), r.valve('PasswordValve'), r.valve('mp_allow_respawn')]).toEqual([16, 6, 11, 0, 0]);
    expect([r.valve('mp_max_round_time'), r.valve('mp_max_rounds'), r.valve('MaxSpectatorsValve'), r.valve('mp_persistent')]).toEqual([360, 11, 8, 1]);
    expect([r.text('NumPlayCountVal'), r.text('RoundTimeVal'), r.text('RoundCountVal'), r.text('passwd_toggle_val')]).toEqual(['16', '6 minutes', '11', 'NO']);
    expect([r.text('respawn_type_val'), r.text('FF_type_val'), r.text('EQ_limitsDesc')]).toEqual(['Respawn is disabled.', 'Friendly Fire is disabled.', 'No limitations']);
    expect(r.focused()).toBe('gamename_btn');
    expect(r.text('DescriptionText')).toBe('¦ Enter the name of your game.');
  });

  it('PLAYERS: 2, 4 ... 16 by two, 16 wraps to 2 (incr_num_players)', async () => {
    const r = await screen();
    r.go('players');
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) { r.press('CROSS', 4); seen.push(r.text('NumPlayCountVal')); }
    expect(seen).toEqual(['2', '4', '6', '8', '10', '12', '14', '16']);
    expect(r.text('DefaultStatusText')).toBe('Custom');
  });

  it('ROUND TIME: 4 to 10 minutes, 10 wraps to 4, mp_max_round_time the minutes in seconds (SetRT_valve, refresh_cg_screen)', async () => {
    const r = await screen();
    r.go('RoundTime_btn');
    const seen: [string, number | undefined][] = [];
    for (let i = 0; i < 7; i++) { r.press('CROSS', 4); seen.push([r.text('RoundTimeVal'), r.valve('mp_max_round_time')]); }
    expect(seen).toEqual([['7 minutes', 420], ['8 minutes', 480], ['9 minutes', 540], ['10 minutes', 600], ['4 minutes', 240], ['5 minutes', 300], ['6 minutes', 360]]);
  });

  it('ROUND COUNT: 3, 5, 7, 9, 11, 11 wraps to 3 (SetNR_valve)', async () => {
    const r = await screen();
    r.go('NumberRounds_btn');
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) { r.press('CROSS', 4); seen.push(r.text('RoundCountVal')); }
    expect(seen).toEqual(['3', '5', '7', '9', '11']);
    expect(r.valve('mp_max_rounds')).toBe(11);
  });

  it('FRIENDLY FIRE toggles 0 and 1 with its two captions (set_FF_valve)', async () => {
    const r = await screen();
    r.go('FF_btn');
    r.press('CROSS', 4);
    expect([r.valve('mp_friendly_fire'), r.text('FF_type_val')]).toEqual([1, 'Friendly Fire is enabled.']);
    r.press('CROSS', 4);
    expect([r.valve('mp_friendly_fire'), r.text('FF_type_val')]).toEqual([0, 'Friendly Fire is disabled.']);
  });

  // OT.R71: RESPAWN is the original's own row again -- offered, in the ring, off at the first arrival (research 163 R163.2).
  // Was: "RESPAWN is drawn and not selectable (OT.R21): disabled at the screen's start, the ring passes it" (UP from RANK
  // RESTRICTIONS landed on RESTORE DEFAULTS).
  it('RESPAWN is drawn and selectable (OT.R71): enabled at the screen\'s start, in the ring; respawn off by default', async () => {
    const r = await screen();
    expect(r.node('Respawn')!.visible).toBe(true);
    expect((r.parts.current!.widgets.get('Respawn') as ButtonWidget).enabled).toBe(true);
    r.go('RankRestrictions');
    expect(r.focused()).toBe('RankRestrictions');
    r.press('UP', 6);
    expect(r.focused()).toBe('Respawn');                               // the row between them is taken
    expect(r.valve('mp_allow_respawn')).toBe(0);
  });

  it('a private game: SET PASSWORD opens the keyboard; a typed password turns PasswordValve on, the row reads CREATE PASSWORD and YES (toggle_password)', async () => {
    const r = await screen();
    r.go('passwd_toggle');
    r.press('CROSS', 20);
    r.type('secret');
    await r.settle(10);
    expect([r.valve('PasswordValve'), r.str('PlayerGamePassword'), r.text('passwd_toggle_val')]).toEqual([1, 'secret', 'YES']);
    expect(r.node('password_val')!.visible).toBe(true);
    r.press('CROSS', 6);                                                // again: the password cleared, the game public
    expect([r.valve('PasswordValve'), r.str('PlayerGamePassword'), r.text('passwd_toggle_val')]).toEqual([0, '', 'NO']);
  });

  it('the PLAY LIST popup lists only Vigilance, Crossroads, Frostfire and Night Stalker, in missionlist.rdr order, every row taken; no Medley, no Random (OT.R16, OT.R45, R164.3)', async () => {
    const r = await screen();
    r.go('SelectGames');
    r.press('CROSS', 10);
    expect(r.node('pop_missionBack')!.visible).toBe(true);
    expect(r.focused()).toBe('AVAILABLE_MISSIONS');
    expect(rows(r, 'AVAILABLE_MISSIONS')).toEqual(['51 VIGILANCE', '72 CROSSROADS', '2 FROSTFIRE', '7 NIGHT STALKER']);
    const items = r.list('AVAILABLE_MISSIONS').items;
    expect(items.map((it) => Number(it.captions[0])).sort((a, b) => a - b)).toEqual([...FIRST_RELEASE_MAPS].sort((a, b) => a - b));
    expect(items.every((it) => it.selectable && it.colors[1] === null)).toBe(true);     // plain rows: no keyed cell, no colour of their own
    // Row 0 is an offered map, so the list's ONACTIVATE pair runs on opening: the title, the help line, the picture.
    expect([r.text('bar_title'), r.text('DescriptionText'), r.text('playerinfo_ctl_desc')]).toEqual([814, 812, 815].map((id) => r.loc.byId.get(id)));
  });

  it('the picture follows the focus on every row (DisplayGamePic, R164.6): CGBack and the row\'s own CGPic<n>, mp<n>MissPic.tif, and no other, down and back up', async () => {
    const r = await screen();
    r.go('SelectGames');
    r.press('CROSS', 10);
    const pictures = (): string[] => [...r.node('CGBack')!.parent!.children].filter((n) => /^CG(Back|Pic\d+|SS\d+)$/.test(n.name) && n.visible).map((n) => n.name);
    const file = (name: string): string | null => { const c = r.node(name)?.content; return c?.kind === 'sprite' ? c.sprite.texture : null; };
    for (const [index, n] of [[VIGILANCE, 51], [CROSSROADS, 72], [FROSTFIRE, 2], [NIGHT_STALKER, 7], [FROSTFIRE, 2], [CROSSROADS, 72], [VIGILANCE, 51]] as const) {
      at(r, index);
      expect(r.list('AVAILABLE_MISSIONS').items[index]!.captions[0]).toBe(String(n));
      expect(pictures().sort()).toEqual(['CGBack', `CGPic${n}`]);
      expect(file(`CGPic${n}`)?.toLowerCase()).toBe(`mp${n}misspic.tif`);
    }
  });

  it('SQUARE accepts the play list on one press from any row (accept_play_list): the popup closed, PLAY LIST showing it', async () => {
    for (const row of [VIGILANCE, CROSSROADS, FROSTFIRE, NIGHT_STALKER]) {
      const r = await screen();
      r.go('SelectGames');
      r.press('CROSS', 10);
      at(r, CROSSROADS);
      r.press('CROSS', 8);
      at(r, row);
      r.press(SQUARE, 10);
      expect([row, r.node('pop_missionBack')!.visible, r.focused()]).toEqual([row, false, 'SelectGames']);
      expect(rows(r, 'PLAYLIST_MAIN')).toEqual(['72 CROSSROADS']);
    }
  });

  it('TRIANGLE and RIGHT answer on every row: RIGHT moves to the selected list (missiondel_activate), TRIANGLE asks #811 (Back_out_from_play_list)', async () => {
    for (const row of [VIGILANCE, CROSSROADS, FROSTFIRE, NIGHT_STALKER]) {
      const r = await screen();
      r.go('SelectGames');
      r.press('CROSS', 10);
      at(r, FROSTFIRE);
      r.press('CROSS', 8);
      at(r, row);
      r.press('RIGHT', 10);
      expect([row, r.focused()]).toEqual([row, 'SELECTED_MISSIONS']);
      at(r, row);
      r.press('TRIANGLE', 10);
      expect([row, r.shown()]).toEqual([row, true]);
      expect(r.popupText()).toContain('clear out your selected games');
    }
  });

  it('Crossroads, Vigilance, Frostfire and Night Stalker are added in any order (add_a_mission): row 0 is a map, not Medley, and adds beside the rest', async () => {
    const orders = [
      [CROSSROADS, VIGILANCE, FROSTFIRE], [VIGILANCE, CROSSROADS, FROSTFIRE], [FROSTFIRE, CROSSROADS, VIGILANCE],
      [VIGILANCE, FROSTFIRE, CROSSROADS], [CROSSROADS, FROSTFIRE, VIGILANCE], [FROSTFIRE, VIGILANCE, CROSSROADS],
      [NIGHT_STALKER, VIGILANCE, FROSTFIRE, CROSSROADS], [CROSSROADS, NIGHT_STALKER, FROSTFIRE, VIGILANCE],
    ];
    const NAME = ['51 VIGILANCE', '72 CROSSROADS', '2 FROSTFIRE', '7 NIGHT STALKER'], NUMBER = [51, 72, 2, 7];
    for (const order of orders) {
      const r = await screen();
      r.go('SelectGames');
      r.press('CROSS', 10);
      for (const [k, row] of order.entries()) {
        at(r, row);
        r.press('CROSS', 8);
        expect([order, r.focused(), rows(r, 'SELECTED_MISSIONS')]).toEqual([order, 'AVAILABLE_MISSIONS', order.slice(0, k + 1).map((i) => NAME[i])]);
      }
      expect(r.valve('IsMedleyGame') ?? 0).toBe(0);
      r.press(SQUARE, 10);
      await r.settle(3);
      expect(rows(r, 'PLAYLIST_MAIN')).toEqual(order.map((i) => NAME[i]));
      const v = r.uiVars.find('PLAYLISTVAR')!.value;
      expect(v.type === 'array' ? v.value.map((e) => (e.type === 'array' && e.value[0]!.type === 'int' ? e.value[0]!.value : -1)) : []).toEqual(order.map((i) => NUMBER[i]));
    }
  });

  it('CROSS on Vigilance and Frostfire adds them, a repeat too; SQUARE writes PLAYLISTVAR as [number, name] rows and PLAY LIST shows it', async () => {
    const r = await screen();
    r.go('SelectGames');
    r.press('CROSS', 10);
    r.press('CROSS', 8);                                                // row 0 at the popup's opening: VIGILANCE
    expect(rows(r, 'SELECTED_MISSIONS')).toEqual(['51 VIGILANCE']);
    at(r, FROSTFIRE);
    r.press('CROSS', 8);
    r.press('CROSS', 8);
    expect(rows(r, 'SELECTED_MISSIONS')).toEqual(['51 VIGILANCE', '2 FROSTFIRE', '2 FROSTFIRE']);
    r.press(SQUARE, 10);
    await r.settle(3);
    expect(r.uiVars.find('PLAYLISTVAR')!.value).toEqual({ type: 'array', value: [
      { type: 'array', value: [{ type: 'int', value: 51 }, { type: 'string', value: 'VIGILANCE' }] },
      { type: 'array', value: [{ type: 'int', value: 2 }, { type: 'string', value: 'FROSTFIRE' }] },
      { type: 'array', value: [{ type: 'int', value: 2 }, { type: 'string', value: 'FROSTFIRE' }] },
    ] });
    expect(rows(r, 'PLAYLIST_MAIN')).toEqual(['51 VIGILANCE', '2 FROSTFIRE', '2 FROSTFIRE']);
    expect(r.node('pop_missionBack')!.visible).toBe(false);
    expect(r.focused()).toBe('SelectGames');
  });

  it('CREATE with no play list: #303; with a play list and no name: #304; nothing is sent', async () => {
    const r = await screen();
    r.press(SQUARE, 10);
    expect(r.popupText()).toContain('You must create a playlist before game creation can occur.');
    r.press('CROSS', 10);
    await playList(r, CROSSROADS);
    r.press(SQUARE, 10);
    expect(r.popupText()).toContain('You must enter a valid game name before game creation can occur.');
    expect(r.requests).toEqual([]);
  });

  it('CREATE sends /lobby/create-game with CreateGame1\'s fields (FUN_002edda0): the name with "$~" and the room, players and spectators, the room\'s id, no respawn', async () => {
    const r = await screen();
    await named(r, 'test');
    await playList(r, FROSTFIRE);
    r.go('players');
    r.press('CROSS', 4);                                                // 2 players
    r.press(SQUARE, 10);
    await r.settle(3);
    expect(r.requests).toEqual([{
      applicationId: 0x28e8, minPlayers: 2, maxPlayers: 2 + 8, gameLevel: 0, gameName: `test$~${ROOM.name}`, gamePassword: '', spectatorPassword: '',
      playerSkillLevel: 0, rulesSet: 0, genericField1: ROOM.worldId, genericField2: 65000, genericField3: 0, gameHostType: 0,
    }]);
    expect(r.str('GAMENAMEVAR')).toBe(`test$~${ROOM.name}`);
    // gamename_val (a TEXT on GAMENAMEVAR) draws the var cut at "$~" (FUN_00363830): the room's name never shows
    expect(r.text('gamename_val')).toBe('test');
    expect([r.valve('mp_persistent'), r.valve('mp_game_sort_order'), r.valve('CreateGameGuardValve')]).toEqual([0, 127, 1]);
  });

  it('a private game sends its password; spectators off add no seat and send no spectator password', async () => {
    const r = await screen();
    await named(r, 'priv');
    r.go('passwd_toggle');
    r.press('CROSS', 20);
    r.type('pw');
    await r.settle(5);
    r.go('Spectators');
    r.press('CROSS', 6);                                                // 8 -> 0
    await playList(r, CROSSROADS);
    r.press(SQUARE, 10);
    await r.settle(3);
    expect(r.requests.map((q) => [q.gameName, q.gamePassword, q.maxPlayers, q.spectatorPassword])).toEqual([[`priv$~${ROOM.name}`, 'pw', 16, '']]);
  });

  it('-975: MP_GAME_NAME_EXISTS -- #294, then CONTINUE: the name cleared, the focus on GAME NAME, CREATE GAME still open (game_name_exists)', async () => {
    const r = await screen({ reply: { status: -975, mediusWorldId: -1 } });
    await named(r, 'taken');
    await playList(r, VIGILANCE);
    r.press(SQUARE, 10);
    await r.settle(10);
    expect(r.events).toContain(DIALOG_EVENTS.MP_GAME_NAME_EXISTS);
    expect(r.popupText()).toContain('The game you selected is already in use.');
    r.press('CROSS', 10);
    await r.settle(5);
    expect([r.current(), r.str('GAMENAMEVAR'), r.focused(), r.valve('CreateGameGuardValve')]).toEqual([r.dialog, '', 'gamename_btn', 0]);
    expect(r.created).toEqual([]);
  });

  it('-966 (the server\'s refusal: a map not offered, respawn, a field): MP_MEDIUS_JOIN_GAME_FAILURE -- #295, then back to the caller (create_game_failure)', async () => {
    const r = await screen({ reply: { status: -966, mediusWorldId: -1 } });
    await named(r, 'nope');
    await playList(r, VIGILANCE);
    r.press(SQUARE, 10);
    await r.settle(10);
    expect(r.events).toContain(DIALOG_EVENTS.MP_MEDIUS_JOIN_GAME_FAILURE);
    expect(r.popupText()).toContain('Create Game Failed!');
    r.press('CROSS', 10);
    for (let i = 0; i < 60 && r.current() !== WORLD; i++) await r.settle(1);
    expect(r.current()).toBe(WORLD);
  });

  it('a success hands the created game to the game lobby\'s gate (ONL-16a) and returns to the caller', async () => {
    const r = await screen({ reply: { status: 0, mediusWorldId: 7 } });
    await named(r, 'mine');
    await playList(r, CROSSROADS, FROSTFIRE);
    r.press(SQUARE, 10);
    for (let i = 0; i < 60 && r.current() !== WORLD; i++) await r.settle(1);
    expect(r.current()).toBe(WORLD);
    expect(r.created.map((g) => [g.mediusWorldId, g.gameName, g.playList])).toEqual([[7, `mine$~${ROOM.name}`, [72, 2]]]);
    expect(r.created[0]!.request.genericField1).toBe(ROOM.worldId);
  });

  it('a 401: the session lost (MP_MEDIUS_ERROR on this dialog: OnMultiplayerDisconnect\'s popup)', async () => {
    const r = await screen({ sessionLost: true });
    await named(r, 'gone');
    await playList(r, VIGILANCE);
    r.press(SQUARE, 10);
    await r.settle(10);
    expect(r.lost.length).toBe(1);
    expect(r.events).toContain(DIALOG_EVENTS.MP_MEDIUS_ERROR);
    expect(r.created).toEqual([]);
  });

  it('TRIANGLE returns to the caller (create_game_exit: the settings saved); coming back restores them (init_cg_screen)', async () => {
    const r = await screen();
    r.go('players');
    r.press('CROSS', 4);
    r.press('TRIANGLE', 10);
    for (let i = 0; i < 60 && r.current() !== WORLD; i++) await r.settle(1);
    expect([r.current(), r.valve('CreateGameSettingsChanged'), r.valve('MaxPlayersValve_saved')]).toEqual([WORLD, 1, 2]);
  });
});
