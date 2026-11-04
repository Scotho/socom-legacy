import { describe, expect, it } from 'vitest';
import { lookStickOf, RIGHT_STICK } from '../src/look';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import { CardSlots, Libmc, PersonaCard, UI_VAR_MODULE } from '@s2u/card';
import { TUNER_DEFAULTS } from '@s2u/sound';
import { OptionGlobals, stickGainOfSensitivity } from '@s2u/ui';
import { GameAudio, tunersOfVars, WebAudioOut } from '../src/audio';
import { noInput } from '../src/gamepad';
import { bootValves, playOptionsOf, readGlobalValves, restoreValveModule, VALVE_MODULE, type PlayOptions } from '../src/originalOptions';
import { applyPlayOptions, cardPlayOptions, cardTunerVars, matchOptions, readCardPlayOptions, readCardTunerVars, storeCardControllerConfig } from '../src/matchOptions';
import { ControllerConfigs } from '../src/controllerConfigs';

/**
 * PAR-36 (a) (PARITY-2; OT.R43): the stored OPTIONS applied each frame by one shared part (`../src/matchOptions`) on
 * both pages -- the pitch sign (`DAT_003df198`), first person's bob (`DAT_003df190`), FireMode and TACMAP swapped
 * (`FUN_00592050`: L3 and SELECT) and the firearm's fire-mode setting (`DAT_0044d500`; research 254 §3) -- research 302
 * §4, `UIStoreOptions` (04 O11). The front end's match takes the session's globals; `/testroom` the page's card's
 * `CValveSaveManager` module (research 229 §1), its absent values the table's defaults. Unit tests against the
 * transcription, a memory card; the page wiring is read off the sources, as `parityExemptions.test.ts`'s OPTIONS case.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf-8');

/** The camera's part the options touch (`FlyCamera`'s `lookOptions`, `setLookOptions`, `originalHeadBob`). */
const fakeFly = () => {
  let invertPitch = false;
  const set: boolean[] = [];
  return {
    set,
    /** Another control's write (the development build's Mouse look panel, `ui.ts` `onLookControls`): not the part's. */
    other: (v: boolean) => { invertPitch = v; },
    originalHeadBob: true,
    lookOptions: () => ({ invertPitch }) as ReturnType<import('../src/camera').FlyCamera['lookOptions']>,
    setLookOptions: (o: { invertPitch?: boolean }) => { if (o.invertPitch !== undefined) { invertPitch = o.invertPitch; set.push(o.invertPitch); } },
  };
};

const STORED: PlayOptions = { invertPitch: true, headBob: false, fireModeSwap: true, stick: RIGHT_STICK, vibration: true };

const memoryCard = () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } };
  return new CardSlots(() => storage as unknown as Storage, () => undefined, { now: () => 5_000 });
};
/** A save file in `port`'s slot whose `CValveSaveManager` module is `module` (the page's own save path writes it so). */
const seed = (slots: CardSlots, port: 0 | 1, module: unknown): void => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), port);
  card.load();
  card.setLogins([{ host: 'lobby.test', port: 10075, name: 'One', town: '', gender: 0, savePassword: false, password: null }]);
  card.setPart(VALVE_MODULE, module);
  expect(card.save()).toBeGreaterThanOrEqual(0);
};
/** A save file in `port`'s slot whose `CUIVarManager` module is `module` (`personaHost`'s `saveUiVars` writes it so). */
const seedUiVars = (slots: CardSlots, port: 0 | 1, module: unknown): void => {
  const card = new PersonaCard(new Libmc(slots, { log: () => {}, now: () => 9_000 }), port);
  card.load();
  card.setLogins([{ host: 'lobby.test', port: 10075, name: 'One', town: '', gender: 0, savePassword: false, password: null }]);
  card.setPart(UI_VAR_MODULE, module);
  expect(card.save()).toBeGreaterThanOrEqual(0);
};
const libmcOf = (slots: CardSlots): Libmc => new Libmc(slots, { log: () => {}, now: () => 9_000 });

describe('the shared part: the stored OPTIONS on the frame (research 302 §4)', () => {
  it('applies a stored inverted pitch and the bob off to the camera; the L3/SELECT swap is the pad map\'s, not the lanes\'', () => {
    const fly = fakeFly();
    const pad = { ...noInput(), fireMode: true, scoreboard: false };
    applyPlayOptions(fly, pad, STORED, playOptionsOf(null));
    expect(fly.lookOptions().invertPitch).toBe(true);
    expect(fly.originalHeadBob).toBe(false);
    // OPT-14 (research 344 §6): FUN_00592050 swaps the active config's own table, so the swap is `padInput`'s map
    // (`./controllerConfigs` `ControllerConfigs.store`), never a swap of the lanes after it.
    expect([pad.fireMode, pad.scoreboard]).toEqual([true, false]);
  });

  it('the defaults leave the camera and the pad as they are; the pitch is set only when the stored value changes, never when the camera merely differs', () => {
    const fly = fakeFly();
    const pad = { ...noInput(), fireMode: true, scoreboard: false };
    const defaults = playOptionsOf(null);
    applyPlayOptions(fly, pad, defaults, defaults);
    expect([fly.lookOptions().invertPitch, fly.originalHeadBob, pad.fireMode, pad.scoreboard]).toEqual([false, true, true, false]);
    expect(fly.set).toEqual([]);
    applyPlayOptions(fly, pad, STORED, defaults);
    applyPlayOptions(fly, pad, STORED, STORED);
    expect(fly.set).toEqual([true]);
    fly.other(false);
    applyPlayOptions(fly, pad, STORED, STORED);
    expect([fly.lookOptions().invertPitch, fly.set]).toEqual([false, [true]]);   // the camera differs; the stored value did not change
  });

  it('H10 open: a pitch another control set survives the frames while the stored value is unchanged, and is overridden when it changes; the bob is set each frame', () => {
    let stored: PlayOptions = playOptionsOf(null);
    const part = matchOptions(() => stored);
    const fly = fakeFly();
    const frames = (n: number): void => { for (let i = 0; i < n; i++) part.apply(fly, { ...noInput() }); };
    fly.other(true);                                   // the panel's remembered invert, set at the page's boot
    frames(3);
    expect([fly.lookOptions().invertPitch, fly.set]).toEqual([true, []]);   // the card's default is no change: the panel's stands
    stored = STORED;                                   // the stored value changes: applied
    frames(1);
    expect([fly.lookOptions().invertPitch, fly.set]).toEqual([true, [true]]);
    fly.other(false);
    frames(3);
    expect([fly.lookOptions().invertPitch, fly.set]).toEqual([false, [true]]);   // survives while the stored value holds
    fly.other(true);
    stored = { ...STORED, invertPitch: false };       // changes again: overrides the panel's
    frames(1);
    expect([fly.lookOptions().invertPitch, fly.set]).toEqual([false, [true, false]]);
    fly.originalHeadBob = true;                        // nothing else writes the bob (camera.ts:210 its default): each frame's
    frames(1);
    expect(fly.originalHeadBob).toBe(false);
  });

  it('reads its source each frame: the options, the firearm\'s setting; no source is the original\'s defaults', () => {
    let stored: PlayOptions = playOptionsOf(null);
    const part = matchOptions(() => stored);
    const fly = fakeFly();
    const pad = { ...noInput(), fireMode: true };
    part.apply(fly, pad);
    expect([fly.lookOptions().invertPitch, fly.originalHeadBob, pad.fireMode, part.fireModeSetting()]).toEqual([false, true, true, 'default']);
    stored = STORED;
    const next = { ...noInput(), fireMode: true };
    part.apply(fly, next);
    expect([fly.lookOptions().invertPitch, fly.originalHeadBob, next.fireMode, next.scoreboard, part.fireModeSetting()]).toEqual([true, false, true, false, 'alternate']);   // the lanes as read: the swap is the map's (research 344 §6)
    expect(part.current()).toEqual(STORED);
    const none = matchOptions(undefined);
    expect(none.current()).toEqual(playOptionsOf(null));
    expect(none.fireModeSetting()).toBe('default');
  });
});

describe('/testroom\'s source: the page card\'s CValveSaveManager module (research 229 §1)', () => {
  it('the module through CValveSaveManager_UnSerialize and StoreOptions: the three it holds; absent ones the defaults', () => {
    expect(cardPlayOptions({ INVERT_PITCH_CONTROLLER: 1, BOBBING_1ST_PERSON: 0, FIREMODESWAP_CONTROLLER: 1 })).toEqual(STORED);
    expect(cardPlayOptions({ INVERT_PITCH_CONTROLLER: 1 })).toEqual({ invertPitch: true, headBob: true, fireModeSwap: false, stick: RIGHT_STICK, vibration: true });
    expect(cardPlayOptions(undefined)).toEqual(playOptionsOf(null));
    expect(cardPlayOptions('not a module')).toEqual(playOptionsOf(null));   // restoreValveModule refuses it: nothing restored
    expect(cardPlayOptions({ INVERT_PITCH_CONTROLLER: -1 })).toEqual(playOptionsOf(null));   // a value no valve holds
  });

  it('reads slot 1, else slot 2 (the front end\'s PERSONA_LOAD_ADAPTATION, as the card\'s taunts); no card, the defaults', () => {
    expect(readCardPlayOptions(null)).toEqual(playOptionsOf(null));
    const empty = memoryCard();
    expect(readCardPlayOptions(libmcOf(empty))).toEqual(playOptionsOf(null));
    const second = memoryCard();
    seed(second, 1, { INVERT_PITCH_CONTROLLER: 1, BOBBING_1ST_PERSON: 0, FIREMODESWAP_CONTROLLER: 1 });
    expect(readCardPlayOptions(libmcOf(second))).toEqual(STORED);
    seed(second, 0, { BOBBING_1ST_PERSON: 0 });
    expect(readCardPlayOptions(libmcOf(second))).toEqual({ invertPitch: false, headBob: false, fireModeSwap: false, stick: RIGHT_STICK, vibration: true });
  });

  it('OPT-14 (research 344 §6): the card read is /testroom\'s StoreOptions for the controller config -- the swap on the active config, then the saved preset', () => {
    const configs = new ControllerConfigs();
    storeCardControllerConfig({ SelectedControllerConfig: 3, FIREMODESWAP_CONTROLLER: 1 }, configs);
    expect([configs.active, configs.fireModeSwap, configs.record().buttons.FireMode]).toEqual(['Config4', true, 'LeftStickTap']);
    configs.select('Default');
    expect(configs.record().buttons.FireMode).toBe('Select');   // Default was active at the swap
    configs.select('Config4');
    storeCardControllerConfig(undefined, configs);                // no card: the swap off (on Config4, active), then Default
    expect([configs.active, configs.fireModeSwap]).toEqual(['Default', false]);
    expect(configs.record().buttons.FireMode).toBe('Select');      // the quirk: Default keeps the first store's swap
    configs.select('Config4');
    expect(configs.record().buttons.FireMode).toBe('Select');
  });
});

describe('both pages mount the one part (OT.R43): the menu match its session\'s, /testroom the page card\'s', () => {
  it('the menu match: its `options` source through the part, applied to the pad each frame, the firearm\'s setting off it', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/const playOptions = matchOptions\(o\.options\);/);
    expect(mount).toMatch(/fireModeSetting: playOptions\.fireModeSetting,/);
    // PP-5/PP-6 (OT.R67): the Prone bind and the stance mode sit between the crouch shortcut and the options' apply.
    // The optional Forge instrument contributes normal lanes before this same options application. Without the
    // loopback-only constructor port, the pad is still exactly padInput(polled); neither branch bypasses the part.
    expect(mount).toMatch(/const normalInput = o\.client\.url === 'loopback:' \? o\.normalInput : undefined;/);
    expect(mount).toMatch(/const pad = normalInput \? mergeInput\(padInput\(polled\), agent\) : padInput\(polled\);\n\s+if \(gamePad\.crouch\) pad\.crouch = true;\n\s+if \(gamePad\.prone\) pad\.prone = true;[^\n]*\n\s+walk\.setStanceMode\(controllerStanceMode\(\)\);[^\n]*\n\s+playOptions\.apply\(fly, pad\);/);
    expect(mount.match(/playOptions\.apply\(fly, pad\);/g)).toHaveLength(1);
    expect(mount).not.toMatch(/applyOptions|fly\.originalHeadBob = /);   // one copy: the shared part's
  });

  it('/testroom: the page card\'s options through the part, applied to the pad in both frames (held and live), the firearm\'s setting off it', () => {
    const main = src('main.ts');
    expect(main).toMatch(/let cardOptions = pageCardPlayOptions\(\)[;,]/);   // PAR-36 (b) extends the line with the card's volumes
    // MATCH-01: the card's options reach the part through the START menu's store over them (its writes on top).
    expect(main).toMatch(/const localMenuOptions = localStartMenuOptions\(playOptionsGlobals\(\(\) => cardOptions\)\);/);
    expect(main).toContain('sessionStartMenuOptions(() => pageOptions!.globals, () => pageOptions!.valves)');
    expect(main).toMatch(/const playOptions = matchOptions\(\(\) => \(\{ \.\.\.playOptionsOf\(startMenuOptions\), stick: \(pageOptions \? playOptionsOf\(pageOptions\.globals, pageOptions\.uiVars\) : cardOptions\)\.stick \}\)\);/);   // OT.R72: the look stick, live Options' or the card's
    expect(main).toMatch(/const lanes: LaneParts = \{[^}]*fireModeSetting: playOptions\.fireModeSetting,/);
    // PP-5/PP-6 (OT.R67): the Prone bind in both frames, and the stance mode in the live one, before the options' apply.
    expect(main).toMatch(/const heldInput = padInput\(held\);\n\s+if \(gamePad\.crouch\) heldInput\.crouch = true;\n\s+if \(gamePad\.prone\) heldInput\.prone = true;[^\n]*\n\s+playOptions\.apply\(fly, heldInput\);/);
    expect(main).toMatch(/const pad = padInput\(polled\);\n\s+if \(gamePad\.crouch\) pad\.crouch = true;[^\n]*\n\s+if \(gamePad\.prone\) pad\.prone = true;[^\n]*\n\s+walk\.setStanceMode\(controllerStanceMode\(\)\);[^\n]*\n\s+playOptions\.apply\(fly, pad\);/);
    expect(main).toMatch(/cardMessages = pageCardMessages\(\); cardOptions = pageOptions \? playOptionsOf\(pageOptions\.globals, pageOptions\.uiVars\) : pageCardPlayOptions\(\);/);   // MLS.R2: applied live Options survives a map change
    expect(main).not.toMatch(/fly\.originalHeadBob = /);
  });
});

describe('PAR-36 (b): /testroom\'s four option masters, the page card\'s CUIVarManager module (research 233 §1, 302 §4)', () => {
  const real = (value: number) => ({ type: 'real', value });
  const f32 = Math.fround;   // a real var is an f32 (`UiVarManager`'s stored value), as the session's

  it('the module as the front end\'s session restores it (InitSystemTuners, then restoreUiVarModule): a saved SOUND_VOLUME 0.3 is the sound master, the rest their defaults', () => {
    expect(tunersOfVars(cardTunerVars({ SOUND_VOLUME: real(0.3) }))).toEqual({ ...TUNER_DEFAULTS, sound: f32(0.3) });
    expect(tunersOfVars(cardTunerVars({ SOUND_VOLUME: real(0.3), MUSIC_VOLUME: real(0.5), DIALOG_VOLUME: real(0.25), HEADSET_CONTROLLER: real(0) })))
      .toEqual({ sound: f32(0.3), music: 0.5, dialog: 0.25, headset: 0 });
    expect(tunersOfVars(cardTunerVars({ MPTAUNTMSG1: { type: 'string', value: 'GO' } }))).toEqual(TUNER_DEFAULTS);   // a module without them
    expect(tunersOfVars(cardTunerVars({ SOUND_VOLUME: real(1.5) })).sound).toBe(1);                     // clamped into the slider's range (TUNER_RANGE)
    expect(tunersOfVars(cardTunerVars({ SOUND_VOLUME: { type: 'int', value: 0 } })).sound).toBe(TUNER_DEFAULTS.sound);   // not a real: skipped
  });

  it('no module, a module of another shape, or one the session refuses whole: null, the defaults', () => {
    expect(cardTunerVars(undefined)).toBeNull();
    expect(cardTunerVars('not a module')).toBeNull();
    expect(cardTunerVars({ SOUND_VOLUME: real(0.3), MPTAUNTMSG1: { type: 'int', value: 1 } })).toBeNull();   // restoreUiVarModule's false: the session keeps its defaults
    expect(tunersOfVars(cardTunerVars(undefined))).toEqual(TUNER_DEFAULTS);
  });

  it('reads slot 1, else slot 2 (PERSONA_LOAD_ADAPTATION, as the card\'s taunts and OPTIONS); a GameAudio on it takes the card\'s masters, no card the defaults', () => {
    expect(readCardTunerVars(null)).toBeNull();
    const empty = memoryCard();
    expect(readCardTunerVars(libmcOf(empty))).toBeNull();
    const second = memoryCard();
    seedUiVars(second, 1, { SOUND_VOLUME: real(0.3) });
    const audio = new GameAudio(new WebAudioOut(), undefined, { inline: false });
    let card = readCardTunerVars(libmcOf(second));
    audio.setTunerVars(() => card);
    expect(audio.getTuners().sound).toBe(f32(0.3));
    seedUiVars(second, 0, { MUSIC_VOLUME: real(0.2) });
    card = readCardTunerVars(libmcOf(second));                       // re-read (the map load's): slot 1's now
    expect(audio.getTuners()).toEqual({ ...TUNER_DEFAULTS, music: f32(0.2) });
    card = readCardTunerVars(libmcOf(empty));
    expect(audio.getTuners()).toEqual(TUNER_DEFAULTS);
  });

  it('/testroom: the page card\'s masters on the page\'s GameAudio at boot, read again at each map load with the card\'s fives and OPTIONS', () => {
    const main = src('main.ts');
    expect(main).toMatch(/import \{ matchOptions, pageCardPlayOptions, pageCardTunerVars \} from '\.\/matchOptions';/);
    expect(main).toMatch(/let cardOptions = pageCardPlayOptions\(\), cardTuners = pageCardTunerVars\(\);/);
    expect(main).toMatch(/const playOptions = matchOptions\(\(\) => \(\{ \.\.\.playOptionsOf\(startMenuOptions\), stick: \(pageOptions \? playOptionsOf\(pageOptions\.globals, pageOptions\.uiVars\) : cardOptions\)\.stick \}\)\);/);   // OT.R72: the look stick, live Options' or the card's
    expect(main).toContain('audio.setTunerVars(() => pageOptions?.uiVars ?? cardTuners);');   // PAR-36: the live Options' volume masters, else the card's
    expect(main).toContain('cardTuners = pageOptions?.uiVars ?? pageCardTunerVars();');
    expect(main.match(/setTunerVars\(/g)).toHaveLength(1);                 // one source, set once; the panel's volume is its own master
    expect(main).toMatch(/ui\.onSound\(\{ volume: \(v\) => audio\.setVolume\(v\), muted: \(m\) => audio\.setMuted\(m\) \}\);/);
  });
});

const DISC = process.env.SOCOM_DISC ?? '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN', 'UI', 'READERC.ZAR'));

describe.skipIf(!HAVE_DISC)('/testroom\'s composition equals the front end\'s on the dev disc', () => {
  it('a card module over global_valves.rdr whole (bootValves, LoadConfig, StoreOptions) is the module over the defaults', async () => {
    const table = await readGlobalValves(new FsAssetSource(DISC));
    for (const module of [undefined, { INVERT_PITCH_CONTROLLER: 1 }, { BOBBING_1ST_PERSON: 0, FIREMODESWAP_CONTROLLER: 1 }, {}]) {
      const valves = bootValves(table);
      expect(restoreValveModule(valves, module)).toBe(true);
      const globals = new OptionGlobals();
      globals.store(valves);
      expect(cardPlayOptions(module), JSON.stringify(module)).toEqual(playOptionsOf(globals));
    }
  }, 60_000);
});

describe("OT.R72: /testroom takes the card's look stick (CONTROLLER OPTIONS)", () => {
  const real = (value: number) => ({ type: 'real', value });
  it("a stored SEAL, and CUSTOM's three sliders, after a card read", () => {
    const slots = memoryCard();
    seed(slots, 0, { stick_preset: 2 });
    expect(readCardPlayOptions(libmcOf(slots)).stick).toEqual(lookStickOf(2, null));
    seed(slots, 0, { stick_preset: 3 });
    seedUiVars(slots, 0, { STICK_SENSITIVITY: real(0.2), STICK_INERTIA: real(0.1), STICK_DEADZONE: real(0.4) });
    const custom = readCardPlayOptions(libmcOf(slots)).stick;
    expect(custom.gain).toBe(stickGainOfSensitivity(0.2));
    expect(custom.ramp).toBeCloseTo(0.9, 6);
    expect(custom.deadZone).toBeCloseTo(0.21, 6);
  });

  it("main.ts: the START menu's options with the card's stick -- the menu never sets the stick, the card's stands", () => {
    expect(src('main.ts')).toMatch(/const playOptions = matchOptions\(\(\) => \(\{ \.\.\.playOptionsOf\(startMenuOptions\), stick: \(pageOptions \? playOptionsOf\(pageOptions\.globals, pageOptions\.uiVars\) : cardOptions\)\.stick \}\)\);/);
    // a map change reads the card again -- or, under the native Options manager (MLS, #481), its live globals
    expect(src('main.ts')).toMatch(/cardOptions = pageOptions \? playOptionsOf\(pageOptions\.globals, pageOptions\.uiVars\) : pageCardPlayOptions\(\);/);   // OT.R72: CUSTOM's sliders kept
  });
});
