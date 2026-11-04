import { Libmc, PersonaCard, UI_VAR_MODULE } from '@s2u/card';
import { initSystemTuners, OptionGlobals, restoreUiVarModule, UiVarManager, ValveStore } from '@s2u/ui';
import type { TunerVars } from './audio';
import type { FlyCamera } from './camera';
import { controllerConfigs, type ControllerConfigs } from './controllerConfigs';
import { fireModeSetting, type FireModeSetting } from './fireModeInput';
import type { Input } from './gamepad';
import { playOptionsOf, restoreValveModule, VALVE_MODULE, type PlayOptions } from './originalOptions';
import { pageCard } from './pageStore';
import { START_MENU_PAGE, storeVoiceModulation, type StartMenuPage } from './startMenu';

/**
 * PAR-36 (a) (PARITY-2; OT.R43, the two matches equivalent): the stored OPTIONS on the match, each frame -- one part,
 * mounted by both pages (`./matchMount`, the front end's match; `./main`, `/testroom`). Research 302 §4, `UIStoreOptions`
 * (04 O11): `StoreOptions` leaves three globals the match reads --
 * - the pitch sign (`DAT_003df198`, `INVERT_PITCH_CONTROLLER`): the camera's `invertPitch`;
 * - first person's bob (`DAT_003df190`, `BOBBING_1ST_PERSON`): the camera's `originalHeadBob`;
 * - the fire-mode swap (`FIREMODESWAP_CONTROLLER`): the firearm's setting `DAT_0044d500` (`./fireModeInput`
 *   `fireModeSetting`; PAR-22, research 254 §3), read by the lanes (`./matchLanes` `LaneParts.fireModeSetting`). FireMode
 *   and TACMAP swapped (`FUN_00592050`: L3 and SELECT; SELECT held is the page's scoreboard, research 87 §12) is the
 *   active controller config's own table (OPT-14, research 344 §6): the pad's map (`./gamepad` `padInput`), stored by
 *   `./controllerConfigs` `ControllerConfigs.store`, never a swap of the lanes here.
 *
 * The source is the page's: the front end's match the session's globals (`./frontEnd`, `playOptionsOf(session.options)`);
 * `/testroom`, which runs no front end, the page card's (`pageCardPlayOptions`). None is the original's defaults.
 *
 * **The pitch is applied when the stored value changes, never because the camera differs** (the main merge controller's
 * ruling, 2026-10-11, on PAR-36 (a)'s review). The owner's row H10 (Q99.2) is **open**: whether the page's invert pitch
 * (the development build's Mouse look checkbox, `s2u.viewer.mouseLook`, `./ui` `onLookControls`) is the card's
 * `INVERT_PITCH_CONTROLLER` or the mouse's own. Meanwhile the part writes the camera's sign only when the stored value
 * differs from the last stored one -- the camera starts at the original's default (`DAT_003df198` +1, not inverted;
 * `./look` `LookOptions.invertPitch`), so a stored inversion is applied at the first frame, a default one is no change --
 * and a sign another control set stands until the stored value next changes. On the front end's match no other control
 * sets it, so the camera always holds the stored value. The bob is written each frame: nothing else writes
 * `originalHeadBob` (`./camera`'s field, its default true). The swap is the pad map's, read afresh each frame.
 */

/** The camera's part the options set. */
export type OptionsCamera = Pick<FlyCamera, 'lookOptions' | 'setLookOptions' | 'originalHeadBob'>;

/**
 * One frame's options on the camera (the pad as read): the pitch sign when the stored value `p` differs from the last
 * stored `previous` (H10 open; the look law's other options untouched) and the bob. The pad is left as `padInput` read
 * it: FireMode's and TACMAP's swap is the controller config's table (research 344 §6), already in the map.
 */
export function applyPlayOptions(fly: OptionsCamera, _pad: Pick<Input, 'fireMode' | 'scoreboard'>, p: PlayOptions, previous: Pick<PlayOptions, 'invertPitch'> & Partial<Pick<PlayOptions, 'stick'>>): void {
  if (p.invertPitch !== previous.invertPitch) fly.setLookOptions({ invertPitch: p.invertPitch });
  // CONTROLLER OPTIONS (OT.R72, LATER 315-318): the look stick as the stored options leave it, written when it changes
  // (`LookLaw.setOptions` resets the mouse's window; the stick's own state, its ramp, is kept).
  if (!sameStick(p.stick, previous.stick)) fly.setLookOptions({ stick: p.stick });
  fly.originalHeadBob = p.headBob;
}

const sameStick = (a: PlayOptions['stick'], b: PlayOptions['stick'] | undefined): boolean =>
  !!b && a.deadZone === b.deadZone && a.gain === b.gain && a.exponent === b.exponent && a.ramp === b.ramp;

/** The part a page mounts: its source read at each call. */
export interface MatchOptions {
  /** The options this frame: the source's, else the original's defaults (`playOptionsOf(null)`). */
  current(): PlayOptions;
  /**
   * `applyPlayOptions` with `current()` against the last stored options (at first the original's defaults, as the camera
   * starts): each frame, on the pad as polled, before the flush and the lanes.
   */
  apply(fly: OptionsCamera, pad: Pick<Input, 'fireMode' | 'scoreboard'>): void;
  /** PAR-22: the firearm's setting (`DAT_0044d500`) off the same options, for `LaneParts.fireModeSetting`. */
  fireModeSetting(): FireModeSetting;
}

/** The part over a page's source (`undefined`: the original's defaults). */
export function matchOptions(source: (() => PlayOptions) | undefined): MatchOptions {
  const current = (): PlayOptions => source?.() ?? playOptionsOf(null);
  let last: PlayOptions = playOptionsOf(null);
  return {
    current,
    apply: (fly, pad) => { const p = current(); applyPlayOptions(fly, pad, p, last); last = p; },
    fireModeSetting: () => fireModeSetting(current()),
  };
}

/**
 * The three off a card's `CValveSaveManager` module (research 229 §1): the module restored as the boot's `LoadConfig`
 * restores it (`restoreValveModule`, `CValveSaveManager_UnSerialize` `FUN_00352960`), then `StoreOptions`
 * (`OptionGlobals.store`, `FUN_0027b960`). The front end restores it over `global_valves.rdr` whole (`bootValves`); here a
 * value the module lacks is `playOptionsOf`'s default, which is the table's for all three (`originalOptions.test.ts`'s
 * dev-disc case: the session's globals off the table are `playOptionsOf(null)`; `matchOptions.test.ts` holds the two
 * compositions equal on the disc). A module of another shape restores nothing: the defaults.
 */
export function cardPlayOptions(part: unknown, vars?: TunerVars | null): PlayOptions {
  // OT.R72: and the look stick -- the card's `stick_preset`, or under CUSTOM its UI var module's three sliders.
  return playOptionsOf(cardGlobals(part), vars as Parameters<typeof playOptionsOf>[1]);
}

/** The globals a card's `CValveSaveManager` module leaves after `StoreOptions`; null when it restores nothing. */
function cardGlobals(part: unknown): OptionGlobals | null {
  const valves = new ValveStore();
  if (!restoreValveModule(valves, part)) return null;
  const globals = new OptionGlobals();
  globals.store(valves);
  return globals;
}

/**
 * OPT-14 (research 344 §6, §7): a card's module as `/testroom`'s `StoreOptions` for the controller config -- the
 * fire-rate swap on the active config, then `SelectedControllerConfig`'s config (`ControllerConfigs.store`, `FUN_0027b960`
 * D:L125173-125183, D:L125232-125247). No module, or one refused: the table's defaults (FIRE RATE off, Default), as the
 * front end's boot store over `global_valves.rdr` leaves them.
 */
export function storeCardControllerConfig(part: unknown, configs: ControllerConfigs = controllerConfigs): void {
  const globals = cardGlobals(part);
  configs.store((name) => globals?.value(name));
}

/**
 * R4B-02 (OT.R97, research 375 §2): a card's module as `/testroom`'s `StoreOptions` for VOICE MODULATION -- r0004's
 * `UIStoreOptions` sets the page's flag to `VoiceMask != 0` (r4 0x27cdb0-0x27cdc4, `./startMenu`
 * `storeVoiceModulation`). No module, one refused, or one without `VoiceMask`: `global_valves.rdr`'s 0, OFF, as the
 * front end's boot store over the table leaves it. Like the controller config, it runs at each card read (the boot's
 * and a map change's), the test room keeping no valve registry for the START toggle's write (research 375 §4).
 */
export function storeCardVoiceModulation(part: unknown, page: StartMenuPage = START_MENU_PAGE): void {
  const globals = cardGlobals(part);
  storeVoiceModulation(page, (name) => globals?.value(name));
}

/**
 * A card's options for `/testroom` (which runs no front end): the save file of slot 1, else slot 2 -- the front end's
 * `PERSONA_LOAD_ADAPTATION`, as `./tauntSettings` `readCardTaunts` reads the card's taunts -- through libmc as
 * `PersonaCard.load` reads it. No card, no file: the defaults.
 */
export function readCardPlayOptions(libmc: Libmc | null): PlayOptions {
  const card = loadedCard(libmc);
  return card ? cardPlayOptions(card.part(VALVE_MODULE), cardTunerVars(card.part(UI_VAR_MODULE))) : playOptionsOf(null);
}

/** The save file `/testroom` reads: slot 1's, else slot 2's (`PERSONA_LOAD_ADAPTATION`); null with no card or no file. */
function loadedCard(libmc: Libmc | null): PersonaCard | null {
  if (libmc) {
    for (const port of [0, 1] as const) {
      const card = new PersonaCard(libmc, port);
      if (card.load().result >= 0) return card;
    }
  }
  return null;
}

/**
 * `readCardPlayOptions` over the page's own card (`./pageStore` `pageCard`): `/testroom`'s stored options. The read is
 * the test room's `StoreOptions` (its boot, and the card read again at a map change): the card's controller config is
 * stored into the page's (`storeCardControllerConfig`; OPT-14, research 344 §7), as the front end's boot store does.
 */
export function pageCardPlayOptions(): PlayOptions {
  const card = loadedCard(new Libmc(pageCard, { log: () => {} }));   // a missing file's FAILED line is no news here
  const part = card?.part(VALVE_MODULE);
  storeCardControllerConfig(part);
  storeCardVoiceModulation(part);                                   // R4B-02: r0004's store reads VoiceMask back
  return card ? cardPlayOptions(part, cardTunerVars(card.part(UI_VAR_MODULE))) : playOptionsOf(null);
}

/**
 * PAR-36 (b) (PARITY-2; OT.R43): `/testroom`'s four option masters (`SOUND_VOLUME`, `MUSIC_VOLUME`, `DIALOG_VOLUME`,
 * `HEADSET_CONTROLLER`; `./audio` `TUNER_VARS`, research 233 §1). They are UI variables, not valves: OPTIONS' sliders
 * make them persistent and `CUIVarManager_Serialize` writes them into the card's `CUIVarManager` module (research 302
 * §4, `UI_VAR_MODULE_TUNERS_READING`). The front end's session gets them as `InitSystemTuners` (FUN_0038a7a0) and then
 * the card's module restored over it (`./frontEnd`'s session: `initSystemTuners`, then `./personaHost`
 * `restoreCardUiVars`, i.e. `restoreUiVarModule`) -- the same two steps here on a manager of its own, so a saved
 * value is clamped, a non-real one skipped and a module the session refuses refused alike. No module, one of another
 * shape, or one refused: null, the defaults (`TUNER_DEFAULTS`), as the session keeps them.
 */
export function cardTunerVars(part: unknown): TunerVars | null {
  if (part === undefined) return null;
  const vars = new UiVarManager();
  initSystemTuners(vars);
  return restoreUiVarModule(vars, part) ? vars : null;
}

/** A card's option masters for `/testroom`: the save file `readCardPlayOptions` reads (slot 1, else 2). No card, no file: null. */
export function readCardTunerVars(libmc: Libmc | null): TunerVars | null {
  const card = loadedCard(libmc);
  return card ? cardTunerVars(card.part(UI_VAR_MODULE)) : null;
}

/** `readCardTunerVars` over the page's own card (`./pageStore` `pageCard`): `/testroom`'s `GameAudio.setTunerVars` source. */
export function pageCardTunerVars(): TunerVars | null {
  return readCardTunerVars(new Libmc(pageCard, { log: () => {} }));   // a missing file's FAILED line is no news here
}
