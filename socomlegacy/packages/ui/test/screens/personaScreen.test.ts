import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import type { RadioStripWidget } from '../../src/widgets/radioStrip';
import type { AcctRecord } from '../../src/screens/personaCommands';
import { CONNECT, HAVE, PERSONA, SELECT, UNIVERSE, personaRig } from './personaRig';

/**
 * ONL-06 over the machine (web research 153 §3): CONNECT TO SOCOM II (`dlgNetPlayerName.rdr`) built from the disc's own
 * layout and set with every module of the path registered -- the dialog's ANIMATIONS run as the original's would, the
 * pad a frame at a time, the keyboard typed through its USB queue. What is pinned: the form as built (the rows, the
 * help lines, which rows answer), the persona list (its three rows, CROSS / CIRCLE / TRIANGLE, the #603 warning), the
 * keyboards' caps (14, 12, 20), the saved persona's prefill and where the cursor lands, what CONNECT and TRIANGLE
 * dispatch, and the way in from SELECT UNIVERSE's CROSS. The files come from the disc or the committed fixtures: it
 * runs in CI. Nothing here is measured on the original running; the frames' scores are `tools/test/personaScore.test.ts`.
 */

const H = UNIVERSE.dns, P = UNIVERSE.port;
/** A typed password, made up for the tests. */
const TYPED = 'secret';
const rec = (name: string, over: Partial<AcctRecord> = {}): AcctRecord => ({ host: H, port: P, name, password: '', hometown: '', gender: 0, savePassword: 0, ...over });
/** ONSTART's four animations and the build's focus have run. */
const SETTLED = 30;
const ROWS = ['playername_btn', 'passwd_btn', 'Store_Password', 'hometown_btn', 'gender_btn', 'connect_btn'] as const;

type Rig = ReturnType<typeof personaRig>;
const enabled = (t: Rig): boolean[] => ROWS.map((n) => (t.parts.current!.widgets.get(n) as unknown as { enabled: boolean }).enabled);
const strip = (t: Rig): RadioStripWidget => t.parts.current!.widgets.get('Store_Password') as RadioStripWidget;
const rows = (t: Rig): string[] => t.listbox().items.map((i) => i.captions.join('|'));
/** PLAYER NAME, CROSS: the list; its row `i`, CROSS. */
const choose = (t: Rig, i: number): void => {
  for (let n = 0; n < 8 && t.focused() !== 'playername_btn'; n++) t.press('UP', 3);
  t.press('CROSS', 6);
  for (let n = 0; n < 8 && t.listbox().focus < i; n++) t.press('DOWN', 3);
  for (let n = 0; n < 8 && t.listbox().focus > i; n++) t.press('UP', 3);
  expect([t.focused(), t.listbox().focus]).toEqual(['PersonaList', i]);
  t.press('CROSS', 14);
};
const settled = (o: Parameters<typeof personaRig>[0] = {}): Rig => { const t = personaRig(o); t.run(SETTLED); return t; };

describe.skipIf(!HAVE)(`CONNECT TO SOCOM II over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('the captions are the disc\'s (UIMnLOC 587-608 and the rows\' 251, 317, 452)', () => {
    const t = personaRig();
    // Decoded texts (RS.R8); ¦ CROSS, ¬ TRIANGLE, · CIRCLE are the pad's glyph bytes.
    expect([587, 317, 251, 588, 589, 590, 591, 592, 452].map((id) => t.loc.byId.get(id))).toEqual([
      'CONNECT TO SOCOM II', 'PLAYER NAME', 'PASSWORD', 'SAVE PASSWORD', 'YES', 'NO', 'HOMETOWN', 'GENDER', 'CONNECT',
    ]);
    expect([593, 594, 596, 597].map((id) => t.loc.byId.get(id))).toEqual(['· DELETE', '¬ CANCEL', 'Male', 'Female']);
    expect([598, 599, 600, 601, 602].map((id) => t.loc.byId.get(id))).toEqual([
      '¦ Choose a different persona or create a new one.', '¦ Enter your password.', '¦ Enter your hometown.', '¦ Specify your gender.', '¦ Connect.',
    ]);
    expect(t.loc.byId.get(595)).toBe('¦ Save your password to the memory card (8MB) (for PlayStation®2)?');
    expect(t.loc.byId.get(603)).toBe('If you delete this persona, the account will stay active only for a few months before being automatically deleted.  Are you sure you want to delete this persona?');
    expect([604, 605, 607, 608].map((id) => t.loc.byId.get(id))).toEqual([
      'Enter Player Password', 'Enter Player Hometown', 'No memory card (8MB) (for PlayStation®2) inserted. Cannot Save Name and Password.', 'Name and Password Save Cancelled.',
    ]);
    expect(t.loc.byId.get(606)).toMatch(/^Be sure to write down your name and password\./);
  });

  it('the empty form (A_35): PLAYER NAME lit with #598, SAVE PASSWORD answering and on NO, every other row dark, GENDER\'s value hidden', () => {
    const t = settled();
    expect(t.builds).toEqual([PERSONA]);
    expect(t.notImplemented()).toEqual([]);                          // ONSTART leaves no row to a later task
    expect(t.text('bar_title')).toBe('CONNECT TO SOCOM II');
    expect(t.focused()).toBe('playername_btn');
    expect(t.text('DescriptionText')).toBe('¦ Choose a different persona or create a new one.');
    expect(enabled(t)).toEqual([true, false, true, false, false, false]);
    expect(strip(t).selection).toBe(1);                              // check_store_password: SecurePassword 0 -> Store_Password.op4 -> NO
    expect(t.valve('SecurePassword')).toBe(0);
    expect(t.node('gender_val')!.visible).toBe(false);
    expect([t.text('playername_val'), t.text('password_val'), t.text('hometown_val')]).toEqual(['', '', '']);
    expect([t.valve('PasswordChanged'), t.valve('HomeTownChanged'), t.valve('PersonaChanged')]).toEqual([0, 0, 0]);
  });

  it('the persona list (A_36): three <New Persona> rows, hidden until CROSS on PLAYER NAME; then over the form dimmed to 0.75, its first row lit', () => {
    const t = settled();
    expect(rows(t)).toEqual(['-1|<New Persona>', '-1|<New Persona>', '-1|<New Persona>']);
    expect(t.node('PersonaList')!.visible).toBe(false);
    expect([t.text('PersonaListSelectInstructions'), t.text('PersonaListDeleteInstructions'), t.text('PersonaListCancelInstructions')]).toEqual(['¦ SELECT', '· DELETE', '¬ CANCEL']);
    t.press('CROSS', 6);
    expect(t.node('PersonaList')!.visible).toBe(true);
    expect([t.focused(), t.listbox().state, t.listbox().focus]).toEqual(['PersonaList', 'active', 0]);
    expect(t.m.shell()!.screen.fader.opacity).toBe(0.75);
    t.press('DOWN', 3);
    expect(t.listbox().focus).toBe(1);
  });

  it('TRIANGLE on the list cancels: the list hidden, the fader back to 0, PLAYER NAME lit again', () => {
    const t = settled();
    t.press('CROSS', 6);
    t.press('TRIANGLE', 6);
    expect(t.node('PersonaList')!.visible).toBe(false);
    expect(t.focused()).toBe('playername_btn');
    expect(t.m.shell()!.screen.fader.opacity).toBe(0);
    expect(t.current()).toBe(PERSONA);                               // the screen's own TRIANGLE (leave) did not run
  });

  it('CROSS on <New Persona> opens the name keyboard (A_37): "Enter Player Name", CREATEPLAYERNAME, 14 characters / 31 bytes, no double quote', () => {
    const t = settled();
    choose(t, 0);
    const k = t.skb.keyboard;
    expect(k.isOpen).toBe(true);
    expect(k.request).toMatchObject({ uiVar: 'PLAYERNAMEVAR', purpose: '_455_EnterPlayerName_MSG', skbName: 'CREATEPLAYERNAME', maxChars: 14, maxBytes: 31, noDQuote: true, allowEmpty: false });
    expect(t.node('PersonaList')!.visible).toBe(false);
    expect(t.valve('PersonaChanged')).toBe(1);
  });

  it('a typed name (A_38): in the form and the account list, PASSWORD, HOMETOWN and GENDER answering, "Male" shown, CONNECT still dark', () => {
    const t = settled();
    choose(t, 0);
    t.type('socomp');
    expect(t.skb.keyboard.isOpen).toBe(false);
    expect([t.str('PLAYERNAMEVAR'), t.text('playername_val')]).toEqual(['socomp', 'socomp']);
    expect(t.db.records()).toEqual([rec('socomp')]);
    expect(rows(t)).toEqual(['0|socomp', '-1|<New Persona>', '-1|<New Persona>']);
    expect(enabled(t)).toEqual([true, true, true, true, true, false]);
    expect([t.node('gender_val')!.visible, t.text('gender_val')]).toEqual([true, 'Male']);
    expect(t.focused()).toBe('playername_btn');
    expect(t.valve('SaveAvailable')).toBe(1);
    expect(t.notImplemented()).toEqual([]);
  });

  it('the name is capped at 14 characters: the fifteenth key is refused', () => {
    const t = settled();
    choose(t, 0);
    t.type('abcdefghijklmnop');
    expect(t.str('PLAYERNAMEVAR')).toBe('abcdefghijklmn');
  });

  it('PASSWORD: its keyboard is "Enter Player Password", 12 characters / 31 bytes; the row draws one * a character, and CONNECT answers', () => {
    const t = settled();
    choose(t, 0);
    t.type('socomp');
    t.press('DOWN', 3);
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['passwd_btn', '¦ Enter your password.']);
    t.press('CROSS', 14);
    expect(t.skb.keyboard.request).toMatchObject({ uiVar: 'PLAYERPASSWORD', purpose: '_604_EnterPassword_MSG', skbName: 'CREATEPLAYERNAME', maxChars: 12, maxBytes: 31 });
    t.type('abcdefghijklmnop');
    expect(t.str('PLAYERPASSWORD')).toBe('abcdefghijkl');
    expect(t.text('password_val')).toBe('************');
    expect(enabled(t)).toEqual([true, true, true, true, true, true]);
    expect([t.valve('PasswordChanged'), t.valve('HomeTownChanged'), t.valve('PersonaChanged')]).toEqual([1, 0, 0]);
    expect(t.db.records()[0]!.password).toBe('');                    // SAVE PASSWORD: NO -- the typed password is not in the account list
  });

  it('SAVE PASSWORD: LEFT checks YES (SecurePassword 1, the password into the account list), RIGHT back to NO (SecurePassword 0)', () => {
    const t = settled();
    choose(t, 0);
    t.type('socomp');
    t.press('DOWN', 3);
    t.press('CROSS', 14);
    t.type('secret');
    t.press('DOWN', 3);
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['Store_Password', '¦ Save your password to the memory card (8MB) (for PlayStation®2)?']);
    t.press('LEFT', 3);
    expect([strip(t).selection, t.valve('SecurePassword'), t.valve('SaveAvailable')]).toEqual([0, 1, 1]);
    expect(t.db.records()[0]).toMatchObject({ password: TYPED, savePassword: 1 });
    t.press('RIGHT', 3);
    expect([strip(t).selection, t.valve('SecurePassword')]).toEqual([1, 0]);
    expect(t.db.records()[0]!.savePassword).toBe(0);
  });

  it('HOMETOWN: its keyboard is "Enter Player Hometown", 20 characters / 63 bytes, empty allowed; the text goes through NetCensorText', () => {
    const t = settled();
    choose(t, 0);
    t.type('socomp');
    for (let i = 0; i < 3; i++) t.press('DOWN', 3);
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['hometown_btn', '¦ Enter your hometown.']);
    const at = t.outcomes.length;
    t.press('CROSS', 14);
    expect(t.skb.keyboard.request).toMatchObject({ uiVar: 'PLAYERHOMETOWN', purpose: '_605_EnterHometown_MSG', skbName: 'CREATEPLAYERNAME', maxChars: 20, maxBytes: 63, allowEmpty: true });
    t.type('abcdefghijklmnopqrstuvwxyz');
    expect([t.str('PLAYERHOMETOWN'), t.text('hometown_val')]).toEqual(['abcdefghijklmnopqrst', 'abcdefghijklmnopqrst']);
    expect(t.dispatched(at)).toContain('NetCensorText');
    expect(t.db.records()[0]!.hometown).toBe('abcdefghijklmnopqrst');
    expect([t.valve('HomeTownChanged'), t.valve('PasswordChanged')]).toEqual([1, 0]);
  });

  it('GENDER has no keyboard: CROSS flips Male (#596, PLAYERGENDER 0) and Female (#597, 1)', () => {
    const t = settled();
    choose(t, 0);
    t.type('socomp');
    for (let i = 0; i < 4; i++) t.press('DOWN', 3);
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['gender_btn', '¦ Specify your gender.']);
    t.press('CROSS', 3);
    expect([t.text('gender_val'), t.valve('PLAYERGENDER'), t.skb.keyboard.isOpen]).toEqual(['Female', 1, false]);
    expect(t.db.records()[0]!.gender).toBe(1);
    t.press('CROSS', 3);
    expect([t.text('gender_val'), t.valve('PLAYERGENDER')]).toEqual(['Male', 0]);
  });

  it('a saved persona prefills the form; with no password the cursor is on PASSWORD with #599 (the recomp\'s 02_persona.png, and OT.R17\'s every login)', () => {
    const t = settled({ records: [rec('socomc')] });
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD'), t.text('playername_val'), t.text('password_val')]).toEqual(['socomc', '', 'socomc', '']);
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['passwd_btn', '¦ Enter your password.']);
    expect(enabled(t)).toEqual([true, true, true, true, true, false]);
    expect([t.node('gender_val')!.visible, t.text('gender_val'), strip(t).selection]).toEqual([true, 'Male', 1]);
    expect(rows(t)).toEqual(['0|socomc', '-1|<New Persona>', '-1|<New Persona>']);
  });

  it('a saved persona with its password in the account list moves the cursor to CONNECT (PC KNOWN [persona-headless]), SAVE PASSWORD on YES', () => {
    const t = settled({ records: [rec('socomc', { password: TYPED, savePassword: 1, gender: 1, hometown: 'Town' })] });
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['connect_btn', '¦ Connect.']);
    expect([t.text('password_val'), t.text('hometown_val'), t.text('gender_val'), strip(t).selection, t.valve('SecurePassword')]).toEqual(['******', 'Town', 'Female', 0, 1]);
    expect(enabled(t)).toEqual([true, true, true, true, true, true]);
  });

  it('CROSS on a saved persona\'s row puts that persona in the form (GetMUISPersonaInfo by its place)', () => {
    const t = settled({ records: [rec('socomc'), rec('bravo', { hometown: 'Town', gender: 1 })] });
    choose(t, 1);
    expect(t.skb.keyboard.isOpen).toBe(false);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERHOMETOWN'), t.text('gender_val'), t.valve('PLAYERGENDER')]).toEqual(['bravo', 'Town', 'Female', 1]);
    expect([t.focused(), t.node('PersonaList')!.visible, t.m.shell()!.screen.fader.opacity]).toEqual(['playername_btn', false, 0]);
  });

  it('typing the name of a persona already saved loads it instead of making another (MUISPersonaExists, then GetMuisPersonaInfo by name)', () => {
    const t = settled({ records: [rec('socomc'), rec('bravo', { hometown: 'Town', gender: 1 })] });
    choose(t, 2);
    t.type('bravo');
    expect(t.db.records().map((r) => r.name)).toEqual(['socomc', 'bravo']);
    expect([t.str('PLAYERHOMETOWN'), t.valve('PLAYERGENDER')]).toEqual(['Town', 1]);
  });

  it("a name typed with a space at its end leaves two records, as the set orders it: OnSKBApply's UpdateAcctInfo files the name as typed, then CheckConnectEnable's PruneUIVarSpaces cuts the form's", () => {
    const t = settled();
    choose(t, 0);
    t.type('abc ');
    // UpdateAcctInfo(NA) ran before CALL CheckConnectEnable (whose first row is PruneUIVarSpaces(PLAYERNAMEVAR)): the list holds the name with its space.
    expect([t.str('PLAYERNAMEVAR'), t.db.records().map((r) => r.name)]).toEqual(['abc', ['abc ']]);
    for (let i = 0; i < 4 && t.focused() !== 'gender_btn'; i++) t.press('DOWN', 3);
    t.press('CROSS', 6);                                             // GENDER: set_player_gender's UpdateAcctInfo files the pruned name beside it
    expect(t.db.records().map((r) => r.name)).toEqual(['abc ', 'abc']);
    expect(rows(t)).toEqual(['0|abc ', '1|abc', '-1|<New Persona>']);
  });

  it('CIRCLE on a saved persona raises the #603 warning, No first; No keeps it, Yes deletes it and the form takes the next', () => {
    const t = settled({ records: [rec('socomc'), rec('bravo', { hometown: 'Town', gender: 1 })] });
    t.press('UP', 3);
    t.press('CROSS', 6);
    t.press('CIRCLE', 8);
    expect(t.shown()).toBe(true);
    expect(t.popupText()).toBe(t.loc.byId.get(603));                 // the warning's own text (ONL-06's review: it was not held)
    expect(t.popupText()).toMatch(/^If you delete this persona, the account will stay active only for a few months/);
    expect(t.valve('AreYouSure')).toBe(0);
    t.press('CROSS', 8);                                             // No
    expect([t.shown(), t.valve('AreYouSure')]).toEqual([false, 1]);
    expect(t.db.records()).toHaveLength(2);
    t.press('CIRCLE', 8);
    t.press('RIGHT', 3);
    t.press('CROSS', 8);                                             // Yes
    expect([t.shown(), t.valve('AreYouSure'), t.valve('SaveAvailable')]).toEqual([false, 2, 1]);
    expect(t.db.records().map((r) => r.name)).toEqual(['bravo']);
    expect(rows(t)).toEqual(['0|bravo', '-1|<New Persona>', '-1|<New Persona>']);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERHOMETOWN'), t.valve('PLAYERGENDER')]).toEqual(['bravo', 'Town', 1]);
  });

  it('CIRCLE on <New Persona> does nothing (CompareValues: the row\'s first cell is -1)', () => {
    const t = settled();
    t.press('CROSS', 6);
    t.press('CIRCLE', 8);
    expect(t.shown()).toBe(false);
  });

  it('three saved personas leave no <New Persona> row: the list offers no fourth', () => {
    const t = settled({ records: [rec('a'), rec('b'), rec('c')] });
    expect(rows(t)).toEqual(['0|a', '1|b', '2|c']);
  });

  it("the ring: DOWN from CONNECT passes the list (disabled) and its three instruction TEXTs (built disabled: research 116 §17) straight to PLAYER NAME", () => {
    const t = settled({ records: [rec('socomc', { password: TYPED, savePassword: 1 })] });
    expect(t.focused()).toBe('connect_btn');
    const stops: string[] = [];
    for (let i = 0; i < 5; i++) { t.press('DOWN', 3); stops.push(t.focused()); }
    expect(stops).toEqual(['playername_btn', 'passwd_btn', 'Store_Password', 'hometown_btn', 'gender_btn']);
  });

  it('CONNECT with a typed password: the write-down notice #606 (CONTINUE), then memcard_operations; with SAVE declined the switch to dlgNetConnect', () => {
    const t = settled();
    choose(t, 0);
    t.type('socomp');
    t.press('DOWN', 3);
    t.press('CROSS', 14);
    t.type('secret');
    for (let i = 0; i < 4; i++) t.press('DOWN', 3);
    expect([t.focused(), t.text('DescriptionText')]).toEqual(['connect_btn', '¦ Connect.']);
    const at = t.outcomes.length;
    t.press('CROSS', 10);
    expect([t.shown(), t.current()]).toEqual([true, PERSONA]);       // #606 over the screen dimmed to 0.7
    expect(t.m.shell()!.screen.fader.opacity).toBeCloseTo(0.7, 5);
    t.press('CROSS', 20);                                            // CONTINUE: AreYouSure 1 -> memcard_operations -> save_and_leave's #831
    expect([t.shown(), t.current()]).toEqual([true, PERSONA]);
    t.press('RIGHT', 3);
    t.press('CROSS', 40);                                            // NO
    expect(t.current()).toBe(CONNECT);
    // What CONNECT dispatched, in order (a repeat once): the record for ONL-07 (research 153 §6).
    expect(t.dispatched(at).filter((n) => n !== 'MC_Changed')).toEqual([
      'PopUpDialog',                                                 // #606
      'MC_ChPort', 'IsMemCardInserted', 'MC_ChPort', 'IsMemCardInserted',   // CanWeSavePassword: both slots hold a card
      'UpdateAcctInfo', 'StoreOptions', 'PopUpDialog',               // memcard_operations; save_and_leave's #831
      'SwitchMenu',                                                  // SWITCHMENU(dlgNetConnect.rdr)
      'LobbyLogin',                                                  // dlgNetConnect's init_socom_online: ONL-07's
    ]);
    expect(t.notImplemented(PERSONA)).toEqual(['StoreOptions (MENU-01)']);
    expect(t.notImplemented(CONNECT)).toEqual(['LobbyLogin (ONL-07)']);
  });

  it('CONNECT on a persona whose password was not retyped raises no #606: straight to dlgNetConnect when nothing is to save', () => {
    const t = settled({ records: [rec('socomc', { password: TYPED, savePassword: 1 })] });
    expect(t.focused()).toBe('connect_btn');
    t.press('CROSS', 40);
    expect([t.shown(), t.current()]).toEqual([false, CONNECT]);
  });

  it('TRIANGLE leaves: memcard_operations (nothing to save), LobbyLogout, SWITCHMENU(PREVIOUS_SCREEN) -- back to SELECT UNIVERSE when it came through it', () => {
    const t = personaRig({ start: SELECT });
    t.run(10);
    t.press('DOWN', 3);
    t.press('CROSS', 3);
    t.run(40);
    expect(t.current()).toBe(PERSONA);
    const at = t.outcomes.length;
    t.press('TRIANGLE', 40);
    expect(t.builds).toEqual([SELECT, PERSONA, SELECT]);
    expect(t.dispatched(at).filter((n) => n !== 'MC_Changed').slice(0, 2)).toEqual(['LobbyLogout', 'SwitchMenu']);
  });
});

describe.skipIf(!HAVE)('SELECT UNIVERSE\'s CROSS leads to the persona form as the set has it (select_server, server_connected)', () => {
  it('VerifyPatchLevel, the #614 popup, the form\'s variables cleared, LobbyConnect; MP_SUCCESS switches to dlgNetPlayerName', () => {
    const t = personaRig({ start: SELECT, records: [rec('socomc', { hometown: 'Town' })] });
    t.run(10);
    t.press('DOWN', 3);                                              // the ring starts on MainWindow (research 147 §3): DOWN lights the list
    expect(t.focused()).toBe('SERVERLIST');
    const at = t.outcomes.length;
    t.press('CROSS', 3);
    expect(t.shown()).toBe(true);                                    // #614 "Connecting to server...", kept up
    expect(t.current()).toBe(SELECT);
    t.run(30);
    expect(t.builds).toEqual([SELECT, PERSONA]);
    expect(t.dispatched(at).filter((n) => n !== 'MC_Changed').slice(0, 5)).toEqual(['VerifyPatchLevel', 'PopUpDialog', 'ClearUIVar', 'LobbyConnect', 'SwitchMenu']);   // then the form's ONSTART
    expect(t.events).toEqual([DIALOG_EVENTS.MP_SUCCESS]);           // LOBBY_CONNECT_PLACEHOLDER: no lobby before ONL-07
    expect([t.str('LOBBY_HOST'), t.uiVars.find('LOBBY_PORT')!.value]).toEqual([H, { type: 'int', value: P }]);
    t.run(SETTLED);
    expect([t.str('PLAYERNAMEVAR'), t.str('PLAYERHOMETOWN'), t.focused()]).toEqual(['socomc', 'Town', 'passwd_btn']);
    expect(t.notImplemented()).toEqual([]);
  });

  it('a lobby that connects later holds SELECT UNIVERSE under #614 until its MP_SUCCESS', () => {
    const calls: string[] = [];
    const t = personaRig({ start: SELECT, lobby: { connect: (h, p) => { calls.push(`${h}:${p}`); return true; } } });
    t.run(10);
    t.press('DOWN', 3);
    t.press('CROSS', 3);
    t.run(60);
    expect([calls, t.current(), t.shown()]).toEqual([[`${H}:${P}`], SELECT, true]);
    t.m.shell()!.event(DIALOG_EVENTS.MP_SUCCESS!);
    t.run(10);
    expect(t.current()).toBe(PERSONA);
  });

  it('a universe at another patch level switches to dlgDownloadPatch instead (ONL-05; OC-2: ours names none)', () => {
    const t = personaRig({ start: SELECT, universe: { ...UNIVERSE, extendedInfo: 'r0004 http://patch.test/x' } });
    t.run(10);
    t.press('DOWN', 3);
    const at = t.outcomes.length;
    t.press('CROSS', 10);
    expect(t.dispatched(at).filter((n) => n !== 'MC_Changed').slice(0, 2)).toEqual(['VerifyPatchLevel', 'SwitchMenu']);
    expect(t.str('PatchServerURL')).toBe('http://patch.test/x');
    expect(t.builds[1]).toBe('dlgDownloadPatch.rdr');
  });
});
