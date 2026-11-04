import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, rdrGet, Zar, zdbMember, type RdrNode } from '@s2u/archive';
import { parseCharacterTable, teamCharacter } from '@s2u/scene';
import { Hud } from '../src/hud';
import { NetPage, type NetPageDeps } from '../src/netPage';
import { DEATH_CAUSE, deathCause, deathVoiceSlot } from '../src/net/deaths';
import { PART } from '../src/net/damage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent, Team } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { CHARACTER_SLOT_FALLBACKS, characterSlot, characterVoicesOf, escorteeVoicesOf, HOSTAGE_VOICES_READING, MP_SOUND_GROUPS, scriptFiles, soundFromDisc } from '../src/soundData';
import { missionSoundBlocks, parseBankFile, parseStreamEntries, soundHash, streamFile, type SoundParams, type SoundSet } from '@s2u/sound';
import { GameAudio } from '../src/audio';
import { FsAssetSource } from '@s2u/archive/node';
import type { WalkMode } from '../src/walk';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';

/**
 * PF-10 (web sprint 25), the death voice: `FUN_005979a0` (D:L454473-454480) plays character sound 0x3d
 * (`CHRSND_DEATH_QUIET`, `FUN_0053c3a0` D:L405979) for death causes 1, 2 and 3 (3 the head shot, `FUN_005a54d0`
 * L461370-461376 rewriting a part-0 bullet's 5), 0x3c (`CHRSND_DEATH`, D:L405976) for any other, and nothing for cause 6,
 * through the controller's play (`FUN_005978a0`: `FUN_0053b710` at the actor's `+0x1c`, the positional play). Research 179
 * §8.15 and research 205 §2.2; a reading, pending review.
 */

describe('the death voice by cause (FUN_005979a0 D:L454473-454480)', () => {
  it('causes 1, 2 and 3 play CHRSND_DEATH_QUIET; cause 6 nothing; every other cause CHRSND_DEATH', () => {
    for (const c of [1, 2, 3]) expect(deathVoiceSlot(c), `cause ${c}`).toBe('CHRSND_DEATH_QUIET');
    expect(deathVoiceSlot(6)).toBeNull();
    for (const c of [0, 4, 5, 7]) expect(deathVoiceSlot(c), `cause ${c}`).toBe('CHRSND_DEATH');
  });

  it('the room\'s deaths are the game\'s causes: a bullet 5, its head 3 (L461370-461376), a blast 4, a fall 7', () => {
    expect(DEATH_CAUSE).toEqual({ HEADSHOT: 3, BLAST: 4, BULLET: 5, CLEANUP: 6, FALL: 7 });
    expect(deathCause('bullet', PART.HEAD)).toBe(3);
    for (const p of [PART.BODY, PART.RARM, PART.LARM, PART.RLEG, PART.LLEG]) expect(deathCause('bullet', p)).toBe(5);
    expect(deathCause('blast', PART.HEAD)).toBe(4);                // only a bullet's 5 is rewritten
    expect(deathCause('blast', PART.BODY)).toBe(4);
    expect(deathCause('fall', PART.BODY)).toBe(7);
  });
});

describe('a character\'s sound slot through its bases (FUN_0053bef0 over the inheritance copy D:L406771-406772)', () => {
  // The copy takes the base's slots (`+0x14`, `+0x168`), then the character's own `sounds` list writes over the slots it
  // names: a slot the character does not name is its base's.
  const root: RdrNode = ['characters', [
    'mp_seal', ['anim_set', ['Seal anim set']],
    'mp_seal1', ':', 'mp_seal', ['sounds', ['CHRSND_DAMAGE', ['.SEAL_DAMAGE'], 'CHRSND_DEATH', ['.SEAL_DEATH']]],
    'mp9_seal1', ':', 'mp_seal1', ['sounds', ['CHRSND_DAMAGE', ['.OTHER_DAMAGE']]],
  ]];
  const table = parseCharacterTable(root);

  it('takes a slot the character names, else its base\'s; null when no character in the chain names it', () => {
    expect(characterSlot(table, 'mp9_seal1', 'CHRSND_DAMAGE')).toBe('.OTHER_DAMAGE');
    expect(characterSlot(table, 'mp9_seal1', 'CHRSND_DEATH')).toBe('.SEAL_DEATH');
    expect(characterSlot(table, 'mp9_seal1', 'CHRSND_DEATH_QUIET')).toBeNull();
    expect(characterSlot(table, 'nobody', 'CHRSND_DEATH')).toBeNull();
  });
});

/**
 * The slot's handle (`FUN_0053c200`, D:L405734-405784, after the map's banks and `sounds.rdr` blocks load: the map's load
 * calls `FUN_00344450` at D:L152105 and this at D:L152173): each named slot is `FUN_00344f30(name)` -- the name's CRC-32
 * among the loaded script's entries (`FUN_00344bf0`), 0 when none files it; then a null `CHRSND_DAMAGE` (0x3b, `+0x254`)
 * takes `MALE_DAMAGE` (ELF 0x65b378) and a null `CHRSND_DEATH` (0x3c, `+0x258`) takes `DEATH_SOUNDS` (0x65b388); still
 * null, `FUN_0053b710` plays nothing (D:L405264-405266). `CHRSND_DEATH_QUIET` has no fallback. A reading.
 */
describe('a character\'s voice resolves as FUN_0053c200 makes its handle (the name, else the slot\'s fallback, else none)', () => {
  const root: RdrNode = ['characters', [
    'mp_terror', ['anim_set', ['Terrorist anim set']],
    'mp_terror1', ':', 'mp_terror', ['sounds', ['CHRSND_DAMAGE', ['.ENEMY_DAMAGE'], 'CHRSND_DEATH', ['.ENEMY_DEATH']]],
    'mp_terror3_alg', ':', 'mp_terror', ['sounds', ['CHRSND_DAMAGE', ['.NO_SUCH_DAMAGE'], 'CHRSND_DEATH', ['.DEATH']]],
  ]];
  const table = parseCharacterTable(root);
  const chartype: RdrNode = [['navyseals', [], 'terrorists', [['character', ['mp_terror1']], ['character', ['mp_terror3_alg']]]]];

  it('names the fallbacks the decomp reads: MALE_DAMAGE for CHRSND_DAMAGE, DEATH_SOUNDS for CHRSND_DEATH, none for the quiet one', () => {
    expect(CHARACTER_SLOT_FALLBACKS).toEqual({ CHRSND_DAMAGE: 'MALE_DAMAGE', CHRSND_DEATH: 'DEATH_SOUNDS' });
  });

  it('a name the script files is the voice; one it does not is the fallback when filed, else null (silent)', () => {
    const filed = (extra: string[]) => (n: string): boolean => ['.ENEMY_DAMAGE', '.ENEMY_DEATH', ...extra].includes(n);
    const none = characterVoicesOf(table, chartype, filed([])).terrorist;
    expect(none[0]).toEqual({ damage: '.ENEMY_DAMAGE', death: '.ENEMY_DEATH', quiet: null });
    expect(none[1]).toEqual({ damage: null, death: null, quiet: null });
    const lent = characterVoicesOf(table, chartype, filed(['MALE_DAMAGE', 'DEATH_SOUNDS'])).terrorist;
    expect(lent[1]).toEqual({ damage: 'MALE_DAMAGE', death: 'DEATH_SOUNDS', quiet: null });
    // Without a script to resolve against, the data's names stand.
    expect(characterVoicesOf(table, chartype).terrorist[1]).toEqual({ damage: '.NO_SUCH_DAMAGE', death: '.DEATH', quiet: null });
  });

  // What the map loads, and only that: a multiplayer map's `SETS` blocks (`FUN_00344450`, `missionSoundBlocks`) and its
  // `GROUPS` MP_COMMON and HOSTAGE (`FUN_00344910`, D:L242941-242956, called at D:L152106: ELF 0x3f7928, 0x3f78b0).
  it('files a name only in the blocks and groups the map loads: one filed elsewhere resolves to nothing', () => {
    expect(MP_SOUND_GROUPS).toEqual(['MP_COMMON', 'HOSTAGE']);
    const set = (...names: string[]): SoundSet => new Map(names.map((n) => [soundHash(n), { hash: soundHash(n) } as SoundParams]));
    const sets = new Map<string, SoundSet>([['MP6_VC', set('.ENEMY_DEATH')], ['MP2_VC', set('.ONLY_MP2')], ['MULTI', set('.MULTI_ONE')]]);
    const script: RdrNode = [['GROUPS', [
      'SP_COMMON', [['^CS_0087', 'ENTRIES', [['^*CS_0097B']]]],
      'MP_COMMON', [['^PO_0001', 'ENTRIES', [['^*PO_0001']]]],
      'HOSTAGE', [['^CO_0256', 'ENTRIES', [['^*CO_0256']]]],
    ]]];
    const mp6 = scriptFiles(script, sets, 'MP6');
    expect(['.ENEMY_DEATH', '.MULTI_ONE', '^PO_0001', '^CO_0256'].map(mp6)).toEqual([true, true, true, true]);
    expect(['.ONLY_MP2', '^CS_0087', '.DEATH'].map(mp6)).toEqual([false, false, false]);
    expect(scriptFiles(script, sets, 'MP2')('.ONLY_MP2')).toBe(true);
    // A character whose death names a sound filed only in an unloaded group (SP_COMMON's) is silent on the map.
    const groupTable = parseCharacterTable(['characters', ['sp_like', ['sounds', ['CHRSND_DEATH', ['^CS_0087']]]]]);
    const one: RdrNode = [['navyseals', [['character', ['sp_like']]], 'terrorists', []]];
    expect(characterVoicesOf(groupTable, one, mp6).seal[0]).toEqual({ damage: null, death: null, quiet: null });
  });
});

/**
 * The six Algerian-cast maps (MP6, MP7, MP8, MP71, MP72, MP73): `chartype.rdr`'s third terrorist (`mp6_terror3` ...) is
 * `mp_terror3_alg`, whose `CHRSND_DEATH` is `.DEATH` -- a name no bank of `BNKSTORE.ZAR` and no `sounds.rdr` entry holds
 * (nor does any entry file `DEATH_SOUNDS`), so on the console his death is silent (a reading); every other team
 * character's death voice is the map's own `_vc` bank's. The fixtures' MP6 and MP72 (`S2U_TEST_FIXTURES`; skipped
 * without the sound archives).
 */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const HAVE_FIXTURE_SOUND = existsSync(join(FIXTURES, 'RUN', 'SOUNDS', 'BNKSTORE.ZAR')) && existsSync(join(FIXTURES, 'RUN', 'SOUNDRDR.ZAR'));
const ALGERIAN_FIXTURES = ['MP6', 'MP72'].filter((m) => existsSync(join(FIXTURES, 'RUN', `${m}.ZDB`)));
describe.skipIf(!HAVE_FIXTURE_SOUND || ALGERIAN_FIXTURES.length === 0)('the death voice on the Algerian-cast maps (fixtures: MP6, MP72 Crossroads)', () => {
  it.each(ALGERIAN_FIXTURES)('%s: terrorist 3 (.DEATH) dies silent; the rest are the map\'s _vc bank\'s', async (map) => {
    const d = await soundFromDisc(new FsAssetSource(FIXTURES), `RUN/${map}.ZDB`, map);
    const enemy = { damage: '.ENEMY_DAMAGE', death: '.ENEMY_DEATH', quiet: null };
    expect(d.characterVoices).toEqual({
      seal: Array.from({ length: 4 }, () => ({ damage: '.SEAL_DAMAGE', death: '.SEAL_DEATH', quiet: null })),
      terrorist: [enemy, enemy, { damage: '.ENEMY_DAMAGE', death: null, quiet: null }, enemy],
    });
    // The bank the death voices come from: the map's own voices' bank, nothing lent for them.
    const vc = d.banks.find((b) => b.file === `${map}_vc.bnk`)!;
    const names = parseBankFile(vc.bytes).names;
    expect(['.SEAL_DEATH', '.ENEMY_DEATH', '.ENEMY_DAMAGE', '.SEAL_DAMAGE'].every((n) => names.has(n))).toBe(true);
    expect(names.has('.DEATH')).toBe(false);
    expect(d.banks.filter((b) => b.only?.some((n) => /DEATH|DAMAGE/.test(n)))).toEqual([]);
    expect(d.missing.filter((x) => /no bank holds/.test(x))).toEqual([]);
  }, 60_000);
});

describe('the page plays its own body\'s death voice at its feet (the kill\'s cause; LATER 657)', () => {
  function page(solo = false) {
    let socket: WebSocketLike | null = null;
    const voices: { cause: number; side: Team | null; type: number | null; at: [number, number, number] | null }[] = [];
    const hurts: { side: Team | null; type: number | null; at: [number, number, number] | null }[] = [];
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'walk', feet: () => [1, 2, 3],
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
      setType: () => undefined, playerType: (id: number) => (id === 2 ? 3 : id === 3 ? 2 : 0),
      feet: (id: number) => (id === 2 ? [10, 0, -40] : id === 3 ? [20, 0, -5] : null),
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      ...(solo ? { solo: true } : {}), walk, remote, hud: new Hud(), clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      deathVoice: (cause, side, type, at) => { voices.push({ cause, side, type, at }); },
      hurtVoice: (side, type, at) => { hurts.push({ side, type, at }); },
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
      players: [{ id: 2, name: 'Other', team: 'terrorist', char: 3 }, { id: 3, name: 'Bot', team: 'terrorist', char: 2, bot: true }], rules: 'classic', round: 1, rounds: 11, ghost: false,
    } as unknown as ServerEvent);
    return { server, voices, hurts };
  }

  // LATER 657: the original plays a death voice only on the dying body's own console -- a remote body's controller
  // (`FUN_005e6290` D:L497312-497328) plays none -- so another's death is silent here; the page's own is voiced.
  it('another\'s death plays no voice; the page\'s own: its cause at its feet, its side and type the page\'s', () => {
    const { server, voices } = page();
    server({ type: 'kill', killer: 1, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_head01', cause: 3 } as ServerEvent);
    expect(voices).toEqual([]);
    server({ type: 'kill', killer: null, victim: 1, weapon: null, how: 'fall', clip: null, cause: 7 } as ServerEvent);
    expect(voices).toEqual([{ cause: 7, side: null, type: null, at: [1, 2, 3] }]);
  });

  // The review's F1: the AI's own controller plays its death voice on the console that runs it (`FUN_005714b0`
  // D:L433901-433907), so the offline match's page, which runs the room and its bots (`solo`, `./net/loopback`), voices
  // a bot's death; online, the bots run on the server and a page voices none, nor a human's on any page.
  it('a locally hosted bot (solo) is voiced at its feet with its side and type; online none; a human remote never', () => {
    const online = page();
    online.server({ type: 'kill', killer: 1, victim: 3, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_chest01', cause: 5 } as ServerEvent);
    expect(online.voices).toEqual([]);
    const solo = page(true);
    solo.server({ type: 'kill', killer: 1, victim: 3, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_chest01', cause: 5 } as ServerEvent);
    expect(solo.voices).toEqual([{ cause: 5, side: 'terrorist', type: 2, at: [20, 0, -5] }]);
    solo.server({ type: 'kill', killer: 1, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_chest01', cause: 5 } as ServerEvent);
    expect(solo.voices).toHaveLength(1);
  });

  // PF-10 fix round (B1): the room keeps each body's voice gate (`FUN_0053b710` D:L405268-405290), as it keeps the body:
  // a death within 3 s of the body's hurt voice comes `voiced: false`, and the page plays nothing for it.
  it('a kill the room says the gate withheld (voiced false) plays no death voice', () => {
    const { server, voices } = page();
    server({ type: 'kill', killer: 1, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_chest01', cause: 5, voiced: false } as ServerEvent);
    expect(voices).toEqual([]);
    server({ type: 'kill', killer: 2, victim: 1, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_chest01', cause: 5, voiced: true } as ServerEvent);
    expect(voices).toEqual([{ cause: 5, side: null, type: null, at: [1, 2, 3] }]);
  });

  it("a hurt voice: another's at its drawn feet with its side and type, the page's own at its feet (FUN_00597b00)", () => {
    const { server, hurts } = page();
    server({ type: 'hurtVoice', id: 2 } as ServerEvent);
    server({ type: 'hurtVoice', id: 1 } as ServerEvent);
    expect(hurts).toEqual([{ side: 'terrorist', type: 3, at: [10, 0, -40] }, { side: null, type: null, at: [1, 2, 3] }]);
  });

  it('a kill without a cause (a room before PF-10) plays none', () => {
    const { server, voices } = page();
    server({ type: 'kill', killer: 1, victim: 2, weapon: 'M4A1 SD', how: 'weapon', clip: 'death_stand_chest01' } as ServerEvent);
    expect(voices).toEqual([]);
  });
});

/**
 * The disc's data (a dev-disc test, W6.R8: `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; it skips itself when absent):
 * every multiplayer map's eight team characters (`chartype.rdr`, the ARMORY's columns) through `character.rdr`'s bases.
 * None names `CHRSND_DEATH_QUIET` -- `FUN_0053b710` finds a null slot (D:L405264-405266) and plays nothing: a head shot is
 * silent in a match -- and each names a `CHRSND_DEATH`.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'READERC.ZAR'));

describe.skipIf(!HAVE_DISC)('the multiplayer characters\' death voices on the disc (SOCOM_DISC)', () => {
  it('no team character of the 22 maps names CHRSND_DEATH_QUIET; every one names CHRSND_DEATH', () => {
    const readerc = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN', 'READERC.ZAR'))));
    const table = parseCharacterTable(parseRdr(readerc.data(readerc.root.children.find((k) => k.name.toLowerCase() === 'character.rdr')!)));
    const deaths = new Map<string, number>();
    let characters = 0;
    const maps = readdirSync(join(DISC, 'RUN')).filter((f) => /^MP\d+\.ZDB$/i.test(f));
    expect(maps).toHaveLength(22);
    for (const file of maps) {
      const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', file)));
      const readerm = Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR'));
      const chartype = parseRdr(readerm.data(readerm.root.children.find((k) => k.name.toLowerCase() === 'chartype.rdr')!));
      for (const team of ['navyseals', 'terrorists'] as const) for (let i = 0; i < 4; i++) {
        const c = teamCharacter(chartype, team, i)!;
        expect(c, `${file} ${team} ${i}`).toBeTruthy();
        characters++;
        expect(characterSlot(table, c, 'CHRSND_DEATH_QUIET'), c).toBeNull();
        const death = characterSlot(table, c, 'CHRSND_DEATH');
        expect(death, c).not.toBeNull();
        deaths.set(death!, (deaths.get(death!) ?? 0) + 1);
      }
    }
    expect(characters).toBe(176);
    expect(Object.fromEntries(deaths)).toEqual({ '.SEAL_DEATH': 85, '.ENEMY_DEATH': 70, '.FEMALE_DEATH': 15, '.DEATH': 6 });
  });

  it("Frostfire's sound data carries its eight types' death voices, and its banks hold them (MP2_vc)", async () => {
    const data = await soundFromDisc(new FsAssetSource(DISC), 'RUN/MP2.ZDB', 'MP2');
    expect(data.characterVoices).toEqual({
      seal: Array.from({ length: 4 }, () => ({ damage: '.SEAL_DAMAGE', death: '.SEAL_DEATH', quiet: null })),
      terrorist: Array.from({ length: 4 }, () => ({ damage: '.ENEMY_DAMAGE', death: '.ENEMY_DEATH', quiet: null })),
    });
    const audio = new GameAudio({ unlocked: false, state: 'locked', unlock() {}, setGain() {}, play() {}, setReverb() {}, rampReverb() {}, loop: () => null } as never);
    audio.setData(data);
    expect(audio.has('.SEAL_DEATH')).toBe(true);
    expect(audio.has('.ENEMY_DEATH')).toBe(true);
    expect(audio.has('.ENEMY_DAMAGE')).toBe(true);
  }, 60_000);
});

/**
 * HX-2 (web sprint 31; research 238 §1): the hostages' voices. `mp_fem1-3` name three slots of their own -- DEATH
 * `.FEMALE_DEATH`, DAMAGE `.FEMALE_DAMAGE`, YES `^CO_0343` -- and their parent `mp_hostage_extract` names none, so no
 * RESTRAINED, HELPME, PANIC, WAIT_UP or NO: those slots' handles are null and play nothing (`FUN_0053b710`
 * D:L405260-405266; the tables zeroed D:L406662-406663, copied from the parent D:L406771-406772; 189 §2, 199 §8, §12.9).
 */
const HX2_READERC = join(FIXTURES, 'RUN', 'READERC.ZAR'), HX2_MP6 = join(FIXTURES, 'RUN', 'MP6.ZDB');
describe.skipIf(!existsSync(HX2_READERC) || !existsSync(HX2_MP6))('the hostages\' voices (fixtures: READERC.ZAR, MP6)', () => {
  it('mp_fem1-3 voice .FEMALE_DEATH and .FEMALE_DAMAGE of their own (their parent mp_hostage_extract names no sound) and nothing else: no RESTRAINED, HELPME, PANIC, WAIT_UP or NO (HOSTAGE_VOICES_READING; FUN_0053b710 D:L405260-405266)', () => {
    const rc = Zar.parse(new Uint8Array(readFileSync(HX2_READERC)));
    const table = parseCharacterTable(parseRdr(rc.data(rc.root.children.find((k) => k.name === 'character.rdr')!)));
    const mp6 = new Uint8Array(readFileSync(HX2_MP6));
    const readerm = Zar.parse(zdbMember(mp6, parseZdb(mp6), 'READERM.ZAR'));
    const chartype = parseRdr(readerm.data(readerm.root.children.find((k) => k.name === 'chartype.rdr')!));
    expect(HOSTAGE_VOICES_READING.slots).toEqual(['CHRSND_YES', 'CHRSND_DAMAGE', 'CHRSND_DEATH']);
    const voices = escorteeVoicesOf(table, chartype);
    expect(voices).toEqual(Array.from({ length: 3 }, () => ({ damage: '.FEMALE_DAMAGE', death: '.FEMALE_DEATH', quiet: null, yes: '^CO_0343' })));
    for (const who of ['mp_fem1', 'mp_fem2', 'mp_fem3']) {
      for (const slot of ['CHRSND_RESTRAINED', 'CHRSND_HELPME', 'CHRSND_PANIC', 'CHRSND_WAIT_UP', 'CHRSND_NO', 'CHRSND_DEATH_QUIET']) {
        expect(characterSlot(table, who, slot), `${who} ${slot}`).toBeNull();
      }
    }
    expect(rdrGet([table.characters.get('mp_hostage_extract')!.record], 'sounds')).toBeUndefined();
    // the two sides' lists are as they were; a map with no escortees has none
    expect(characterVoicesOf(table, chartype)).not.toHaveProperty('escortee');
    expect(escorteeVoicesOf(table, [['navyseals', []]])).toEqual([]);
    // a voice the map's script does not file falls back as a player's does (DAMAGE MALE_DAMAGE, DEATH DEATH_SOUNDS), else none
    expect(escorteeVoicesOf(table, chartype, () => false)[0]).toEqual({ damage: null, death: null, quiet: null, yes: null });
  });
});

/**
 * HX-2's fix round (research 238 §1.4): what MP6's own script and banks make of the hostages' three voices. `.FEMALE_DAMAGE`
 * and `.FEMALE_DEATH` are filed by no block MP6 loads (only the `_vc` banks of the maps with a female team character,
 * MP51-MP83, hold them), nor are their fallbacks: the handles are null and play nothing, as `mp_terror3_alg`'s `.DEATH`.
 * `^CO_0343` is the `HOSTAGE` group's line, three streams (`^*CO_0343A-C`, `CO_0343A-C.VAG`) in the `HOSTAGE` block MP6
 * loads (`missionSoundBlocks`): a stream, not a bank sound.
 */
describe.skipIf(!HAVE_DISC)("the hostages' voices on MP6's own script (SOCOM_DISC)", () => {
  it("on MP6 a hostage's damage and death voices resolve to nothing and its YES to the HOSTAGE group's ^CO_0343, three streams CO_0343A-C in the HOSTAGE block, not a bank sound (HOSTAGE_VOICES_READING)", async () => {
    expect(HOSTAGE_VOICES_READING.mp6).toEqual({ damage: null, death: null, yes: '^CO_0343' });
    const d = await soundFromDisc(new FsAssetSource(DISC), 'RUN/MP6.ZDB', 'MP6');
    expect(d.escorteeVoices).toEqual(Array.from({ length: 3 }, () => ({ ...HOSTAGE_VOICES_READING.mp6, quiet: null })));
    expect(d.characterVoices!.seal[0]).toEqual({ damage: '.SEAL_DAMAGE', death: '.SEAL_DEATH', quiet: null });
    expect(d.missing.filter((m) => /CO_0343|FEMALE/.test(m))).toEqual([]);          // no bank is asked for a stream
    const vc = parseBankFile(d.banks.find((b) => b.file === 'MP6_vc.bnk')!.bytes).names;
    expect(['.FEMALE_DEATH', '.FEMALE_DAMAGE'].some((n) => vc.has(n))).toBe(false);
    const sr = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN', 'SOUNDRDR.ZAR'))));
    const entries = parseStreamEntries(parseRdr(sr.data(sr.root.children.find((k) => k.name.toLowerCase() === 'sounds.rdr')!)));
    expect(missionSoundBlocks('MP6')).toContain('HOSTAGE');
    expect(['^*CO_0343A', '^*CO_0343B', '^*CO_0343C'].map((n) => { const e = entries.get('HOSTAGE')!.get(soundHash(n) | 0) ?? entries.get('HOSTAGE')!.get(soundHash(n) >>> 0); return e ? streamFile(e) : null; }))
      .toEqual(['CO_0343A.VAG', 'CO_0343B.VAG', 'CO_0343C.VAG']);
  }, 60_000);
});
