import { describe, expect, it } from 'vitest';
import {
  CARD_PASSWORD_UI_VARS_PLACEHOLDER, initSystemTuners, restoreUiVarModule, TUNER_RANGE, sameUiVarValue, serializeUiVars, SYSTEM_TUNERS, UIVAR_LONGEVITY, UIVAR_REUSED_VALUE_READING,
  UIVAR_SLOTS, UiVarManager, uiVarLongevityOf, uiVarModule, uiVarsToSerialize, type UiVarValue,
} from '../src/uiVars';
import { VALVE_TYPE, ValveStore } from '../src/valves';

// Research 104 §4-§6. Transcribed from the retail decompilation (`D:L<line>`); reCOM `zUI/zui.h:27-52` names the
// longevity levels (UIVAR_LONGEVITY), and FUN_00386ff0's own words agree with it (below).

const int = (value: number): UiVarValue => ({ type: 'int', value });
const real = (value: number): UiVarValue => ({ type: 'real', value });
const str = (value: string): UiVarValue => ({ type: 'string', value });

describe('the longevity levels', () => {
  it('are 0 dormant, 1 temporary, 2 permanent, 3 persistent (zui.h UIVAR_LONGEVITY; FUN_00386ff0 D:L280284-280350)', () => {
    expect(UIVAR_LONGEVITY).toEqual({ DORMANT: 0, TEMPORARY: 1, PERMANENT: 2, PERSISTENT: 3 });
  });

  it('a UiVars entry\'s LONGEVITY word: PERSISTENT 3, PERMANENT 2, TEMPORARY 1, any case; none or another 1', () => {
    // CUIVariableSpec ctor FUN_00386ff0: the default 1 at D:L280328, the words matched with strcasecmp D:L280329-280346.
    expect(uiVarLongevityOf('PERSISTENT')).toBe(3);
    expect(uiVarLongevityOf('permanent')).toBe(2);
    expect(uiVarLongevityOf('Temporary')).toBe(1);
    expect(uiVarLongevityOf(undefined)).toBe(1);
    expect(uiVarLongevityOf('FOREVER')).toBe(1);
  });
});

describe('CUIVarManager_Add (FUN_003857c0 D:L279409-279443)', () => {
  it('holds 256 slots (FUN_002b1390(0x437e80, 0x100), D:L328198); a 257th name has none', () => {
    const m = new UiVarManager();
    expect(UIVAR_SLOTS).toBe(256);
    for (let i = 0; i < 256; i++) m.add(`v${i}`, int(i), UIVAR_LONGEVITY.TEMPORARY);
    expect(() => m.add('one-more', null, UIVAR_LONGEVITY.TEMPORARY)).toThrow(/slot/);
  });

  it('finds a name case-insensitively among the live vars (strcasecmp 0x198b80, D:L279424-279425)', () => {
    const m = new UiVarManager();
    const a = m.add('GameName', str('x'), UIVAR_LONGEVITY.TEMPORARY);
    expect(m.find('GAMENAME')).toBe(a);
    expect(m.add('gamename', null, UIVAR_LONGEVITY.TEMPORARY)).toBe(a);
  });

  it('a held temporary var takes the new value; a permanent or persistent one keeps its own (D:L279434-279436)', () => {
    const m = new UiVarManager();
    m.add('t', int(1), UIVAR_LONGEVITY.TEMPORARY);
    m.add('p', int(1), UIVAR_LONGEVITY.PERMANENT);
    m.add('s', int(1), UIVAR_LONGEVITY.PERSISTENT);
    m.add('t', int(2), UIVAR_LONGEVITY.TEMPORARY);
    m.add('p', int(2), UIVAR_LONGEVITY.TEMPORARY);
    m.add('s', int(2), UIVAR_LONGEVITY.PERMANENT);
    expect(m.find('t')?.value).toEqual(int(2));
    expect(m.find('p')?.value).toEqual(int(1));
    expect(m.find('s')?.value).toEqual(int(1));
  });

  it('raises the longevity, never lowers it (D:L279438-279440)', () => {
    const m = new UiVarManager();
    const v = m.add('x', null, UIVAR_LONGEVITY.TEMPORARY);
    m.add('x', null, UIVAR_LONGEVITY.PERSISTENT);
    expect(v.longevity).toBe(3);
    m.add('x', null, UIVAR_LONGEVITY.TEMPORARY);
    expect(v.longevity).toBe(3);
  });

  it('a new name takes the first dormant slot (FUN_003859d0 D:L279467-279487), so a freed slot is reused in place', () => {
    const m = new UiVarManager();
    m.add('a', int(1), UIVAR_LONGEVITY.PERMANENT);
    m.add('b', int(2), UIVAR_LONGEVITY.TEMPORARY);
    m.add('c', int(3), UIVAR_LONGEVITY.PERMANENT);
    m.clearTemporary();
    m.add('d', int(4), UIVAR_LONGEVITY.PERMANENT);
    expect(m.all().map((v) => v.name)).toEqual(['a', 'd', 'c']);
  });
});

describe('clearing the temporaries (FUN_00385c30 D:L279534-279555)', () => {
  it('makes every longevity-1 var dormant: gone from lookups; 2 and 3 stay', () => {
    const m = new UiVarManager();
    m.add('t', int(1), UIVAR_LONGEVITY.TEMPORARY);
    m.add('p', int(1), UIVAR_LONGEVITY.PERMANENT);
    m.add('s', int(1), UIVAR_LONGEVITY.PERSISTENT);
    m.clearTemporary();
    expect(m.find('t')).toBeUndefined();
    expect(m.all().map((v) => v.name)).toEqual(['p', 's']);
  });
});

describe('a var\'s value and the items attached to it (FUN_00386460 D:L279844-279889; equality FUN_00335e20)', () => {
  it('a new value notifies the attached items in order; an equal one does not', () => {
    const m = new UiVarManager();
    const v = m.add('x', int(1), UIVAR_LONGEVITY.PERMANENT);
    const seen: string[] = [];
    m.attach(v, () => seen.push('first'));
    m.attach(v, () => seen.push('second'));
    m.set(v, int(1));
    expect(seen).toEqual([]);
    m.set(v, real(1));                                          // another type is another value
    expect(seen).toEqual(['first', 'second']);
    m.set(v, str('a'));
    m.set(v, str('a'));
    expect(seen).toHaveLength(4);
  });
});

describe('CUIVarManager_Serialize (FUN_00385670 D:L279374-279407): the vars the original writes', () => {
  const build = (): UiVarManager => {
    const m = new UiVarManager();
    m.add('Temp', int(1), UIVAR_LONGEVITY.TEMPORARY);
    m.add('Name', str('SEAL'), UIVAR_LONGEVITY.PERSISTENT);
    m.add('Perm', int(2), UIVAR_LONGEVITY.PERMANENT);
    m.add('PlayerPassword', str('pw'), UIVAR_LONGEVITY.PERSISTENT);
    m.add('Volume', real(0.5), UIVAR_LONGEVITY.PERSISTENT);
    m.add('store_password', int(1), UIVAR_LONGEVITY.PERSISTENT);
    return m;
  };

  it('only longevity 3, in slot order, the two password vars left out while SecurePassword is 0 (D:L279389-279394)', () => {
    expect(uiVarsToSerialize(build().all(), 0)).toEqual([
      { name: 'Name', value: str('SEAL') },
      { name: 'Volume', value: real(0.5) },
    ]);
  });

  it('with SecurePassword non-zero the password vars are written too (D:L279384-279385, D:L279394)', () => {
    expect(uiVarsToSerialize(build().all(), 1).map((e) => e.name)).toEqual([
      'Name', 'PlayerPassword', 'Volume', 'store_password',
    ]);
  });

  it('reads SecurePassword through FUN_00351ff0 at PERM: made at 0 when absent (D:L279384)', () => {
    const valves = new ValveStore();
    expect(serializeUiVars(build(), valves).map((e) => e.name)).toEqual(['Name', 'Volume']);
    expect(valves.find('SecurePassword')).toMatchObject({ value: 0, type: VALVE_TYPE.PERM });
    valves.set('SecurePassword', 1, VALVE_TYPE.PERM);
    expect(serializeUiVars(build(), valves)).toHaveLength(4);
  });

  it('a live var named "" is written: the test is the name pointer, not its text (D:L279390; close review note)', () => {
    // FUN_00386b80 (D:L280188-280198) gives every added var an arena copy of its name, so "" is a non-null pointer;
    // only a dormant slot (FUN_00386b00) has none, and dormant slots are already not longevity 3.
    const m = new UiVarManager();
    m.add('', int(7), UIVAR_LONGEVITY.PERSISTENT);
    expect(uiVarsToSerialize(m.all(), 0)).toEqual([{ name: '', value: int(7) }]);
  });

  it('a restored var is set and made persistent (FUN_00385610 D:L279351-279372)', () => {
    const m = new UiVarManager();
    m.add('Name', str('old'), UIVAR_LONGEVITY.TEMPORARY);
    m.restore('name', str('new'));
    expect(m.find('Name')).toMatchObject({ value: str('new'), longevity: 3 });
  });
});

describe('InitSystemTuners (FUN_0038a7a0 D:L282238-282472)', () => {
  it('registers the eight tuner vars at 1 and stores longevity 2 over it (D:L282254-282255 ... D:L282450-282451)', () => {
    expect(SYSTEM_TUNERS.map((t) => t.name)).toEqual([
      'SOUND_VOLUME', 'MUSIC_VOLUME', 'BRIGHTNESS', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE',
      'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE', 'DIALOG_VOLUME', 'HEADSET_CONTROLLER',
    ]);
    const m = new UiVarManager();
    initSystemTuners(m);
    const held = m.all();
    expect(held.map((v) => v.name)).toEqual([
      'SOUND_VOLUME', 'MUSIC_VOLUME', 'BRIGHTNESS', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE',
      'DIALOG_VOLUME', 'HEADSET_CONTROLLER',
    ]);
    expect(held.every((v) => v.longevity === UIVAR_LONGEVITY.PERMANENT)).toBe(true);
  });

  it('writes the five float defaults (D:L282262-282270, 282287, 282312, 282433, 282458); the stick vars get none', () => {
    const m = new UiVarManager();
    initSystemTuners(m);
    expect(m.find('SOUND_VOLUME')?.value).toEqual(real(1));
    expect(m.find('MUSIC_VOLUME')?.value).toEqual(real(Math.fround(0.74)));
    expect(m.find('BRIGHTNESS')?.value).toEqual(real(0.5));
    expect(m.find('DIALOG_VOLUME')?.value).toEqual(real(1));
    expect(m.find('HEADSET_CONTROLLER')?.value).toEqual(real(0.75));
    expect(SYSTEM_TUNERS.filter((t) => t.default === null).map((t) => t.name)).toEqual([
      'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE',
    ]);
  });

  it('the store of 2 is direct: a tuner var already persistent is lowered to 2, so Serialize skips it', () => {
    const m = new UiVarManager();
    m.add('SOUND_VOLUME', real(0.2), UIVAR_LONGEVITY.PERSISTENT);
    initSystemTuners(m);
    expect(m.find('SOUND_VOLUME')).toMatchObject({ longevity: 2, value: real(1) });
    expect(uiVarsToSerialize(m.all(), 0)).toEqual([]);
  });
});

// The empty node: a never-used slot (template FUN_002b17e0 D:L155185-155198, copied by FUN_002b1390 D:L155042-155053).
describe('the empty node (FUN_002b17e0 D:L155185-155198; FUN_002b1390 D:L155042-155053)', () => {
  it('a var added without a value on a fresh manager holds a type-0 node, and Serialize writes it so', () => {
    // The template clears the type byte to 0 and the length; its value word is never written. FUN_0032f390
    // (D:L230360-230440) copies a type-0 node's type and length only.
    const m = new UiVarManager();
    m.add('X', null, UIVAR_LONGEVITY.PERSISTENT);
    expect(m.find('X')?.value).toEqual({ type: 'none' });
    expect(uiVarsToSerialize(m.all(), 0)).toEqual([{ name: 'X', value: { type: 'none' } }]);
  });

  it('two type-0 nodes are never the same (FUN_00335e20 D:L234599-234628 has no branch for type 0)', () => {
    expect(sameUiVarValue({ type: 'none' }, { type: 'none' })).toBe(false);
    const m = new UiVarManager();
    const v = m.add('X', null, UIVAR_LONGEVITY.PERMANENT);
    let n = 0;
    m.attach(v, () => n++);
    m.set(v, { type: 'none' });
    expect(n).toBe(1);
  });

  it('a slot freed by clearTemporary is an integer node when reused (FUN_00386b00 D:L280167-280186)', () => {
    const m = new UiVarManager();
    m.add('T', int(7), UIVAR_LONGEVITY.TEMPORARY);
    m.clearTemporary();
    expect(m.add('U', null, UIVAR_LONGEVITY.PERMANENT).value).toEqual(UIVAR_REUSED_VALUE_READING);
    expect(UIVAR_REUSED_VALUE_READING.type).toBe('int');
  });
});

describe('reals are f32 (FUN_00335e20 D:L234624-234626)', () => {
  const word = (x: number): number => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x); return d.getUint32(0); };

  it('a real is stored as an f32, and an equal f32 notifies no one', () => {
    const m = new UiVarManager();
    initSystemTuners(m);
    let n = 0;
    m.attach('MUSIC_VOLUME', () => n++);
    m.set('MUSIC_VOLUME', real(0.74));
    expect(n).toBe(0);
    expect(m.find('MUSIC_VOLUME')?.value).toEqual(real(Math.fround(0.74)));
    expect(sameUiVarValue(real(0.74), real(Math.fround(0.74)))).toBe(true);
  });

  // The words written at D:L282262-282270, 282287-282295, 282312-282320, 282433-282441, 282458-282466.
  it('the five tuner defaults are the f32 words FUN_0038a7a0 writes', () => {
    const m = new UiVarManager();
    initSystemTuners(m);
    const words = ['SOUND_VOLUME', 'MUSIC_VOLUME', 'BRIGHTNESS', 'DIALOG_VOLUME', 'HEADSET_CONTROLLER']
      .map((name) => word((m.find(name)!.value as { value: number }).value));
    expect(words).toEqual([0x3f800000, 0x3f3d70a4, 0x3f000000, 0x3f800000, 0x3f400000]);
  });
});

describe('the card\'s CUIVarManager module as R7\'s JSON (web research 301 §6; research 102 R102.9)', () => {
  it('the port\'s rule (W15.R6, OT.R17): with the table\'s SecurePassword 1 (PERSIST) the module holds no password-class var, in any case', () => {
    const valves = new ValveStore();
    valves.loadValves([{ name: 'SecurePassword', value: 1, type: 'PERSIST' }], VALVE_TYPE.PERM);   // global_valves.rdr's row, as CValve_Open loads it
    const m = new UiVarManager();
    m.add('MPTAUNTMSG1', str('TAUNT'), 3);
    m.add('PLAYERPASSWORD', str('secret12'), 3);
    m.add('store_password', int(1), 3);
    m.add('PlayerGamePassword', str('gamepw'), 3);
    m.add('SpectatorGamePassword', str('specpw'), 3);
    // The original's serialize as transcribed writes all five while SecurePassword is non-zero (D:L279384-279394) ...
    expect(serializeUiVars(m, valves).map((e) => e.name)).toEqual(['MPTAUNTMSG1', 'PLAYERPASSWORD', 'store_password', 'PlayerGamePassword', 'SpectatorGamePassword']);
    // ... and the card's module never holds one of the password class.
    const module = uiVarModule(serializeUiVars(m, valves));
    expect(module).toEqual({ MPTAUNTMSG1: str('TAUNT') });
    for (const secret of ['secret12', 'gamepw', 'specpw']) expect(JSON.stringify(module)).not.toContain(secret);
  });

  it('CARD_PASSWORD_UI_VARS_PLACEHOLDER: the original\'s two (0x3fa490, 0x3fa4a0; D:L279391-279392) and the game passwords, matched case-blind', () => {
    expect(CARD_PASSWORD_UI_VARS_PLACEHOLDER).toEqual(['PLAYERPASSWORD', 'STORE_PASSWORD', 'PlayerGamePassword', 'SpectatorGamePassword']);
    expect(uiVarModule([{ name: 'playerpassword', value: str('x') }, { name: 'SPECTATORGAMEPASSWORD', value: str('y') }, { name: 'MPLOCALSOP1', value: str('z') }])).toEqual({ MPLOCALSOP1: str('z') });
  });

  /** The ten a card gains online: dlgNetLogin's ONSTART adds each at 3 with its HudCLOC default (60757-60766). */
  const online = (): UiVarManager => {
    const m = new UiVarManager();
    initSystemTuners(m);                                                  // longevity 2: never on the card
    m.add('AUTOMESSAGES', str('ON'), 1);                                  // temporary: never on the card
    for (let n = 1; n <= 5; n++) m.add(`MPLOCALSOP${n}`, str(`SOP ${n}`), 3);
    for (let n = 1; n <= 5; n++) m.add(`MPTAUNTMSG${n}`, str(`DEFAULT ${n}`), 3);
    return m;
  };

  it('holds serializeUiVars\' list in its order, one key a variable, its typed value: the ten keys', () => {
    const module = uiVarModule(serializeUiVars(online(), new ValveStore()));
    expect(Object.keys(module)).toEqual([1, 2, 3, 4, 5].map((n) => `MPLOCALSOP${n}`).concat([1, 2, 3, 4, 5].map((n) => `MPTAUNTMSG${n}`)));
    expect(module['MPTAUNTMSG3']).toEqual(str('DEFAULT 3'));
  });

  it('round trip: an edit saved, read into a fresh session before its defaults, survives those defaults', () => {
    const m = online();
    m.set('MPTAUNTMSG3', str('CUSTOM TAUNT 03'));
    const saved = JSON.parse(JSON.stringify(uiVarModule(serializeUiVars(m, new ValveStore())))) as unknown;
    const fresh = new UiVarManager();
    expect(restoreUiVarModule(fresh, saved)).toBe(true);
    for (let n = 1; n <= 5; n++) fresh.add(`MPTAUNTMSG${n}`, str(`DEFAULT ${n}`), 3);   // dlgNetLogin's ONSTART after it
    expect(fresh.find('MPTAUNTMSG3')).toMatchObject({ value: str('CUSTOM TAUNT 03'), longevity: 3 });
    expect(fresh.find('MPTAUNTMSG1')?.value).toEqual(str('DEFAULT 1'));
    expect(fresh.find('MPLOCALSOP2')?.value).toEqual(str('SOP 2'));
  });

  it('no module restores nothing; a malformed one restores nothing and leaves the defaults; keys beyond the ten are dropped', () => {
    const m = new UiVarManager();
    expect(restoreUiVarModule(m, undefined)).toBe(true);
    for (const bad of [7, [], { MPTAUNTMSG1: 'plain' }, { MPTAUNTMSG1: { type: 'string', value: 1 } }, { MPTAUNTMSG1: str('ok'), MPTAUNTMSG2: { type: 'text', value: 'x' } }]) {
      const v = new UiVarManager();
      expect(restoreUiVarModule(v, bad)).toBe(false);
      v.add('MPTAUNTMSG1', str('DEFAULT 1'), 3);
      expect(v.find('MPTAUNTMSG1')?.value).toEqual(str('DEFAULT 1'));
    }
    expect(restoreUiVarModule(m, { R: real(0.5), N: int(3), A: { type: 'array', value: [int(1), str('a')] } })).toBe(true);
    expect(m.all()).toEqual([]);                                          // keys beyond the ten: dropped
    expect(restoreUiVarModule(m, { MPTAUNTMSG2: int(2) })).toBe(false);   // a known key not a string: the defaults
    expect(m.all()).toEqual([]);
  });

  it('the sliders\' tuners (web research 302 §4): persistent once a slider\'s spec adds them at 3, saved, and read back as reals over InitSystemTuners', () => {
    const m = new UiVarManager();
    initSystemTuners(m);
    expect(uiVarModule(serializeUiVars(m, new ValveStore()))).toEqual({});                  // at 2: none in the serialize (R104.10)
    m.add('MUSIC_VOLUME', real(0.5), 3);                                                     // dlgOptions_Audio's music_bar: LONGEVITY PERSISTENT
    m.set('MUSIC_VOLUME', real(Math.fround(0.68)));
    const saved = JSON.parse(JSON.stringify(uiVarModule(serializeUiVars(m, new ValveStore())))) as Record<string, unknown>;
    expect(saved).toEqual({ MUSIC_VOLUME: real(Math.fround(0.68)) });
    const next = new UiVarManager();
    initSystemTuners(next);                                                                  // the boot's, before LoadConfig
    expect(restoreUiVarModule(next, { ...saved, STICK_SENSITIVITY: { type: 'none' } })).toBe(true);
    expect(next.find('MUSIC_VOLUME')).toMatchObject({ value: real(Math.fround(0.68)), longevity: 3 });
    expect(next.find('STICK_SENSITIVITY')?.longevity).toBe(2);                               // a none: skipped
  });

  it('a tuner out of the slider\'s range is clamped into [0, 1]; a tuner of another type is dropped alone -- the taunts and messages still read back', () => {
    const m = new UiVarManager();
    initSystemTuners(m);
    expect(restoreUiVarModule(m, {
      MUSIC_VOLUME: real(1.5), SOUND_VOLUME: real(-0.25), DIALOG_VOLUME: str('loud'), HEADSET_CONTROLLER: { type: 'array', value: [] },
      MPTAUNTMSG3: str('CUSTOM TAUNT 03'), MPLOCALSOP2: str('HOLD THE BRIDGE'),
    })).toBe(true);
    expect(m.find('MUSIC_VOLUME')).toMatchObject({ value: real(1), longevity: 3 });
    expect(m.find('SOUND_VOLUME')).toMatchObject({ value: real(0), longevity: 3 });
    expect(m.find('DIALOG_VOLUME')).toMatchObject({ value: real(1), longevity: 2 });          // dropped: InitSystemTuners' default stands
    expect(m.find('HEADSET_CONTROLLER')).toMatchObject({ value: real(0.75), longevity: 2 });
    expect(m.find('MPTAUNTMSG3')?.value).toEqual(str('CUSTOM TAUNT 03'));
    expect(m.find('MPLOCALSOP2')?.value).toEqual(str('HOLD THE BRIDGE'));
    expect(TUNER_RANGE).toEqual([0, 1]);
  });

  it('a corrupt module of more keys than the free slots restores the ten it knows and never throws (the review, finding 2)', () => {
    const m = online();
    const flood: Record<string, unknown> = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`JUNK${i}`, str('x')]));
    flood['MPTAUNTMSG3'] = str('CUSTOM TAUNT 03');
    expect(() => restoreUiVarModule(m, flood)).not.toThrow();
    expect(restoreUiVarModule(m, flood)).toBe(true);
    expect(m.find('MPTAUNTMSG3')?.value).toEqual(str('CUSTOM TAUNT 03'));
    expect(m.find('JUNK0')).toBeUndefined();
    const full = new UiVarManager();
    for (let i = 0; i < 256; i++) full.add(`V${i}`, int(i), 3);       // every slot taken: add would throw
    expect(restoreUiVarModule(full, { MPTAUNTMSG1: str('x') })).toBe(false);
  });
});

// OPT-03 (roadmap 04 OPT-03 under R7; research 229 §4): which UI variables persist. `CUIVarManager_Serialize`
// (`FUN_00385670`) writes a live var only when its longevity (+0x24) is 3 (D:L279389); `CUIVarManager_Add`
// (`FUN_003857c0`) only raises a longevity (D:L279438-279440, R104.7); `InitSystemTuners` stores 2 directly
// (D:L282254-282255). The card's module is `uiVarModule` over that list. Unit tests of the transcription: the reading
// level; the save-and-relaunch diff of the original (OPT-19, H25) is the proven level.
describe('the persistence rule for UI variables: longevity 3 and nothing else reaches the card (FUN_00385670 D:L279389; OPT-03)', () => {
  const secure = (): ValveStore => { const v = new ValveStore(); v.set('SecurePassword', 1, VALVE_TYPE.PERSIST); return v; };
  const moduleOf = (m: UiVarManager): string[] => Object.keys(uiVarModule(serializeUiVars(m, secure())));

  it('a var of longevity 1 or 2 is not in the module; one of longevity 3 is', () => {
    const m = new UiVarManager();
    m.add('Temporary', str('t'), UIVAR_LONGEVITY.TEMPORARY);
    m.add('Permanent', str('p'), UIVAR_LONGEVITY.PERMANENT);
    m.add('Persistent', str('s'), UIVAR_LONGEVITY.PERSISTENT);
    expect(moduleOf(m)).toEqual(['Persistent']);
  });

  it('Add only raises: a var added at 1 or 2 and again at 3 is written; one added at 3 and again at 1 or 2 still is (D:L279438-279440)', () => {
    const m = new UiVarManager();
    m.add('Raised', str('r'), UIVAR_LONGEVITY.TEMPORARY);
    m.add('Raised', null, UIVAR_LONGEVITY.PERSISTENT);
    m.add('RaisedFrom2', str('q'), UIVAR_LONGEVITY.PERMANENT);
    m.add('RaisedFrom2', null, UIVAR_LONGEVITY.PERSISTENT);
    m.add('Kept', str('k'), UIVAR_LONGEVITY.PERSISTENT);
    m.add('Kept', null, UIVAR_LONGEVITY.TEMPORARY);
    m.add('Kept', null, UIVAR_LONGEVITY.PERMANENT);
    m.clearTemporary();                                       // the state change's FUN_00385c30 frees only longevity 1
    expect(moduleOf(m)).toEqual(['Raised', 'RaisedFrom2', 'Kept']);
  });

  it('a longevity-2 tuner as InitSystemTuners makes it is not in the module, even one that was persistent (the direct store, D:L282255)', () => {
    const m = new UiVarManager();
    m.add('MUSIC_VOLUME', real(0.3), UIVAR_LONGEVITY.PERSISTENT);
    initSystemTuners(m);
    expect(m.find('MUSIC_VOLUME')?.longevity).toBe(UIVAR_LONGEVITY.PERMANENT);
    expect(moduleOf(m)).toEqual([]);
  });

  it('the sliders\' tuners -- MUSIC VOLUME, SOUND (SFX) VOLUME, BRIGHTNESS, the stick sensitivities, DIALOG VOLUME, HEADSET -- reach no module until a slider is built', () => {
    // The eight vars InitSystemTuners binds (FUN_0038a7a0 D:L282238-282472) are longevity 2 and so are written by no
    // Serialize (R104.10). A built slider changes it: its set-up FUN_003724f0 adds its var with the UIVAR spec's longevity
    // (D:L269307), the options pages' specs say PERSISTENT (dlgOptions_Audio's four, dlgOptions_Video's BRIGHTNESS,
    // dlgControllerSelection's three; the dev-host persistenceRuleDisc.test.ts reads them), and Add raises (D:L279438-279440),
    // so from then the tuner is written (R104.10 revised, web research 302 §4). Whether the original's sliders survive a
    // power cycle is OPT-19's save-and-relaunch card diff (H25), the proof; nothing here is measured on the original.
    const TUNERS = ['SOUND_VOLUME', 'MUSIC_VOLUME', 'BRIGHTNESS', 'STICK_SENSITIVITY', 'STICK_INERTIA', 'STICK_DEADZONE', 'DIALOG_VOLUME', 'HEADSET_CONTROLLER'];
    const m = new UiVarManager();
    initSystemTuners(m);
    expect(m.all().map((v) => v.name)).toEqual(TUNERS);
    expect(m.all().every((v) => v.longevity === UIVAR_LONGEVITY.PERMANENT)).toBe(true);
    expect(moduleOf(m)).toEqual([]);
    // The AUDIO page's MUSIC VOLUME slider built: FUN_003724f0's Add at its spec's PERSISTENT.
    m.add('MUSIC_VOLUME', null, UIVAR_LONGEVITY.PERSISTENT);
    expect(uiVarModule(serializeUiVars(m, secure()))).toEqual({ MUSIC_VOLUME: real(Math.fround(0.74)) });
  });
});
