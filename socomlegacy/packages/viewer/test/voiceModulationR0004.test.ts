import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OptionGlobals, VALVE_TYPE, ValveStore } from '@s2u/ui';
import {
  createStartMenuPage, START_MENU_ROWS, START_MENU_TYPE, StartMenu, startMenuValues, rowLabel, sessionStartMenuOptions,
  storeVoiceModulation, VOICE_MASK_VALVE_DEFAULT, VOICE_MODULATION_INITIAL_READING,
  type StartMenuPage, type StartMenuSeat,
} from '../src/startMenu';
import { storeCardVoiceModulation } from '../src/matchOptions';
import type { PadButton } from '../src/gamepad';
import { mountHeadset } from '../src/voice/headset';

/**
 * R4B-02 (G18; OT.R97, research 375): r0004's VOICE MODULATION. r0001 starts it ON at every boot (`DAT_003df1a8`, 1 in
 * the ELF's .data) and never reads the `VoiceMask` valve back; r0004 moved the flag to .bss (r4 0x450890, 0 at load),
 * reads `VoiceMask` back in `UIStoreOptions` (r4 `FUN_0027cb40`, 0x27cc68-0x27cc74 the valve, 0x27cdb0-0x27cdc4 the
 * store: flag = VoiceMask != 0), and re-applies the mask at the online round reset with no spectator test (r4
 * 0x2a98c8-0x2a98e0, in r0001 `FUN_002a7d40`'s online branch, D:L149755-149758). `global_valves.rdr` defaults
 * `VoiceMask` to 0, PERSIST. Reading, pending review.
 */

const ONLINE: StartMenuSeat = { multiplayer: true, spectator: false, comeFromLan: false };

function rig(seat: Partial<StartMenuSeat> = {}, page: StartMenuPage = createStartMenuPage()) {
  const globals = new OptionGlobals(), valves = new ValveStore(), masks: boolean[] = [];
  const s: StartMenuSeat = { ...ONLINE, ...seat };
  const menu = new StartMenu({
    options: sessionStartMenuOptions(() => globals, () => valves), page, seat: () => s, caption: () => null, title: () => null,
    sound: () => undefined, allowed: () => true, voiceMask: (on) => masks.push(on),
  });
  const step = (held: PadButton[] = [], dt = 1 / 60): void => { menu.frame(dt, new Set(held)); };
  return { menu, step, globals, valves, masks, page };
}

describe('R4B-02: VOICE MODULATION starts OFF (r4 0x450890 in .bss; r0001 DAT_003df1a8 = 1, superseded)', () => {
  it('a fresh page holds the flag off, and the row reads VOICE MODULATION: OFF', () => {
    expect(VOICE_MODULATION_INITIAL_READING).toBe(false);
    expect(createStartMenuPage().voiceModulation).toBe(false);
    const v = startMenuValues({ value: () => undefined }, createStartMenuPage(), true);
    expect(rowLabel(START_MENU_ROWS[START_MENU_TYPE.voiceModulation]!, v, true, () => null)).toBe('VOICE MODULATION: OFF');
  });
});

describe('R4B-02: StoreOptions reads VoiceMask back (r4 FUN_0027cb40, 0x27cdb0-0x27cdc4)', () => {
  it('the flag is VoiceMask != 0; a store with no VoiceMask takes global_valves.rdr\'s 0', () => {
    expect(VOICE_MASK_VALVE_DEFAULT).toBe(0);
    const page = createStartMenuPage();
    storeVoiceModulation(page, (n) => (n === 'VoiceMask' ? 1 : undefined));
    expect(page.voiceModulation).toBe(true);
    storeVoiceModulation(page, (n) => (n === 'VoiceMask' ? 0 : undefined));
    expect(page.voiceModulation).toBe(false);
    page.voiceModulation = true;
    storeVoiceModulation(page, () => undefined);
    expect(page.voiceModulation).toBe(false);
    storeVoiceModulation(page, (n) => (n === 'VoiceMask' ? 7 : undefined));   // sltu v0,zero,v0: any non-zero is on
    expect(page.voiceModulation).toBe(true);
  });

  it('the START toggle writes VoiceMask, so the next store keeps the choice (it survives a reboot\'s store)', () => {
    const r = rig();
    r.valves.set('VoiceMask', VOICE_MASK_VALVE_DEFAULT, VALVE_TYPE.PERSIST);
    // Open past the 2 s lockout, walk to VOICE MODULATION, press it.
    for (let t = 0; t <= 2.2; t += 0.05) r.step([], 0.05);
    r.step(['Start']); r.step();
    for (let i = 0; i < 12 && r.menu.state().cursor !== START_MENU_TYPE.voiceModulation; i++) { r.step([], 0.21); r.step(['Down']); r.step(); }
    r.step(['Cross']); r.step();
    expect(r.page.voiceModulation).toBe(true);
    expect(r.valves.find('VoiceMask')?.value).toBe(1);
    expect(r.masks).toEqual([true]);
    // A new boot: the page's flag at its .bss 0, then StoreOptions over the registry the card restored.
    const reboot = createStartMenuPage();
    storeVoiceModulation(reboot, (n) => r.valves.find(n)?.value);
    expect(reboot.voiceModulation).toBe(true);
  });

  it('/testroom\'s store over the card\'s CValveSaveManager module: VoiceMask 1 on, 0 off, no module the table\'s 0', () => {
    const page = createStartMenuPage();
    storeCardVoiceModulation({ VoiceMask: 1 }, page);
    expect(page.voiceModulation).toBe(true);
    storeCardVoiceModulation({ VoiceMask: 0 }, page);
    expect(page.voiceModulation).toBe(false);
    page.voiceModulation = true;
    storeCardVoiceModulation(undefined, page);
    expect(page.voiceModulation).toBe(false);
    page.voiceModulation = true;
    storeCardVoiceModulation({ INVERT_PITCH_CONTROLLER: 1 }, page);
    expect(page.voiceModulation).toBe(false);
  });
});

describe('R4B-02: the mask re-applied at the online round reset, no spectator test (r4 0x2a98c8-0x2a98e0)', () => {
  it('a spectator online is told the flag at the round\'s start (r0001 told it nothing: FUN_002c2fa0 != 0, D:L55851)', () => {
    const page = createStartMenuPage();
    page.voiceModulation = true;
    const spec = rig({ spectator: true }, page);
    spec.menu.roundStart();
    expect(spec.masks).toEqual([true]);
  });

  it('a player online ends the round start with the mask at the flag (the round start\'s, then the reset\'s)', () => {
    const r = rig();
    r.menu.roundStart();
    expect(r.masks.length).toBeGreaterThan(0);
    expect(r.masks.every((m) => m === false)).toBe(true);
    expect(r.masks.at(-1)).toBe(false);
  });

  it('offline (no online branch, DAT_0045a0c1 0) the reset adds nothing: a spectator is told nothing', () => {
    const r = rig({ multiplayer: false, spectator: true });
    r.menu.roundStart();
    expect(r.masks).toEqual([]);
  });
});

describe('R4B-02 review P2: the page\'s own level load tells the encoder the flag (r4 0x1f6850, D:L55851-55854)', () => {
  const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf-8');
  /** A headset told through the menu, as both pages wire it (`voiceMask: (on) => { taunts.headset.setVoiceMask(on); }`). */
  function seated(seat: Partial<StartMenuSeat>, flag: boolean) {
    const headset = mountHeadset({ line: () => {}, win: null, doc: null, pads: null });
    const page = createStartMenuPage();
    page.voiceModulation = flag;
    const s: StartMenuSeat = { ...ONLINE, ...seat };
    const menu = new StartMenu({
      options: sessionStartMenuOptions(() => new OptionGlobals(), () => new ValveStore()), page, seat: () => s,
      caption: () => null, title: () => null, sound: () => undefined, allowed: () => true,
      voiceMask: (on) => { headset.setVoiceMask(on); },
    });
    return { headset, menu };
  }
  const block = Float32Array.from({ length: 640 }, (_, i) => Math.sin(i / 7));

  it('a late joiner (RC4: seated dead at load, respawned mid-round, no roundStart): OFF, his blocks go unshifted', () => {
    const { headset, menu } = seated({}, false);
    menu.levelStart();                                        // his console's level load; the room's roundStart never comes
    headset.frame({ phase: 'round', spectator: false });       // respawned mid-round
    expect(headset.modulate(block, true)).toBe(block);
    headset.dispose();
  });

  it('a classic ghost of the next round loaded mid-round: OFF unshifted; a card saved ON shifted', () => {
    const off = seated({}, false);
    off.menu.levelStart();
    off.headset.frame({ phase: 'round', spectator: false });
    expect(off.headset.modulate(block, true)).toBe(block);
    off.headset.dispose();
    const on = seated({}, true);
    on.menu.levelStart();
    on.headset.frame({ phase: 'round', spectator: false });
    expect(on.headset.modulate(block, true)).not.toBe(block);
    on.headset.dispose();
  });

  it('a spectator\'s level load tells nothing (FUN_002c2fa0 != 0), as the round start\'s site', () => {
    const masks: boolean[] = [];
    const page = createStartMenuPage();
    const menu = new StartMenu({
      options: sessionStartMenuOptions(() => new OptionGlobals(), () => new ValveStore()), page,
      seat: () => ({ ...ONLINE, spectator: true }), caption: () => null, title: () => null, sound: () => undefined,
      allowed: () => true, voiceMask: (on) => masks.push(on),
    });
    menu.levelStart();
    expect(masks).toEqual([]);
  });

  it('both pages run it at their level load: the front end\'s match at its mount, /testroom at each map load', () => {
    expect(src('matchMount.ts')).toContain('startMenu.levelStart();');
    expect(src('main.ts')).toMatch(/const load = \(path: string, armoryAfter = false\): void => \{[^]*?startMenu\.levelStart\(\);[^]*?loadingJoin\.begin\(wantedMap/);
  });
});
