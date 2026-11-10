import { describe, expect, it } from 'vitest';
import { RIGHT_STICK } from '../src/look';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OptionGlobals, ValveStore, VALVE_TYPE } from '@s2u/ui';
import type { PadButton } from '../src/gamepad';
import { noInput, PAD_BUTTON } from '../src/gamepad';
import { controllerConfigs } from '../src/controllerConfigs';
import { padButtonsDown } from '../src/weaponExchange';
import { hudPass, AT_REST, DEFAULT_MODEL, SCOREBOARD_HIDES, START_MENU_HIDES, type HudModel } from '../src/hud';
import { mountTaunts } from '../src/matchTaunts';
import { playOptionsOf } from '../src/originalOptions';
import { externalWhispers, roundQueueLine } from '../src/roundChat';
import type { SoundData } from '../src/soundData';
import { mountHeadset } from '../src/voice/headset';
import {
  createStartMenuPage, localStartMenuOptions, playOptionsGlobals, rowLabel, rowSelectable, sessionStartMenuOptions, StartMenu, startMenuTitle,
  START_MENU_BAR, START_MENU_FADE_RATE_READING, START_MENU_TITLE_MISSING, START_MENU_CONFIRM_LAYOUT, START_MENU_CONFIRM_TEXT, START_MENU_HUDCLOC, START_MENU_LOCKOUT_SECONDS, START_MENU_REPEAT_SECONDS, START_MENU_ROWS,
  START_MENU_SOUNDS, START_MENU_TEXT, START_MENU_TYPE, startMenuLayout, startMenuValues, VOICE_MASK_VALVE_DEFAULT, type StartMenuDeps,
  type StartMenuOptions, type StartMenuSeat,
} from '../src/startMenu';

/**
 * MATCH-01 (web research 266 §8): the in-round START menu online -- the row table `FUN_00202520` builds (D:L61191-61335),
 * the rows an online seat is offered (`FUN_00205a70` D:L62407-62452), the labels (`FUN_00204a40` D:L62017-62118 and
 * `FUN_002041e0`'s cases D:L61679-61867), the pad's navigation (`FUN_00201690` D:L60805-60892), the open and the close
 * (`FUN_002011f0` D:L60628-60655, `FUN_00204a40`, `FUN_00205200`), each toggle's effect, no pause online
 * (D:L61948-61951), and the draw (`FUN_00202520` D:L61364-61449). The disc's own strings are checked at the end with
 * `SOCOM_DISC` and skip without it.
 */

/** The HudCLOC strings of the menu as `HudCLOC.rdr` holds them (read off the disc: the dev-disc case below). */
const CAPTIONS: Record<number, string> = {
  60512: 'RESUME', 60513: 'ABORT', 60514: 'REPLAY MISSION', 60515: 'AIM ASSIST: ON', 60516: 'AIM ASSIST: OFF',
  60517: 'HELP: ON', 60518: 'HELP: OFF', 60519: 'INVERT PITCH: ON', 60520: 'INVERT PITCH: OFF',
};
const caption = (id: number): string | null => CAPTIONS[id] ?? null;

const ONLINE: StartMenuSeat = { multiplayer: true, spectator: false, comeFromLan: false };

/** A menu over a session's globals and valves, its effects recorded; `step` one frame of `dt` with `held` down. */
function rig(seat: Partial<StartMenuSeat> = {}, extra: Partial<StartMenuDeps> = {}) {
  const globals = new OptionGlobals(), valves = new ValveStore();
  const options: StartMenuOptions = sessionStartMenuOptions(() => globals, () => valves);
  const sounds: string[] = [], masks: boolean[] = [], aborts: number[] = [], pauses: boolean[] = [], hud: string[] = [];
  let other = false;
  const s: StartMenuSeat = { ...ONLINE, ...seat };
  const menu = new StartMenu({
    options, page: createStartMenuPage(), seat: () => s, caption, title: () => 'FROSTFIRE',
    sound: (n) => sounds.push(n), voiceMask: (on) => masks.push(on), abort: () => aborts.push(1),
    pause: (p) => pauses.push(p), allowed: () => !other,
    hud: { setStartMenu: (open) => hud.push(`menu:${open}`), setSpectatorHud: (on) => hud.push(`spec:${on}`) },
    ...extra,
  });
  const step = (held: PadButton[] = [], dt = 1 / 60): void => { menu.frame(dt, new Set(held)); };
  /** Past the round start's lockout (2 s), nothing held. */
  const settle = (): void => { for (let t = 0; t <= START_MENU_LOCKOUT_SECONDS + 0.1; t += 0.05) step([], 0.05); };
  const tap = (b: PadButton): void => { step([b]); step([]); };
  /** The cursor put on the row of `type` with DOWN taps, each past the repeat gate. */
  const walkTo = (type: number): void => {
    for (let i = 0; i < 12 && menu.state().cursor !== type; i++) { step([], START_MENU_REPEAT_SECONDS + 0.01); step(['Down']); step([]); }
  };
  const open = (): void => { settle(); tap('Start'); };
  return { menu, step, settle, tap, walkTo, open, globals, valves, sounds, masks, aborts, pauses, hud, setOther: (o: boolean) => { other = o; }, seat: s };
}

describe('MATCH-01: the row table FUN_00202520 builds (D:L61191-61335)', () => {
  it('twelve rows, each entry\'s type its index; the HudCLOC ids, the offline / online bits, code labels, blink and close', () => {
    expect(START_MENU_ROWS.map((r) => [r.index, r.type])).toEqual(Array.from({ length: 12 }, (_, i) => [i, i]));
    expect(START_MENU_ROWS.map((r) => r.hudcloc)).toEqual([0xec60, 0xec62, 0xec61, 0xec67, null, null, 0xec65, 0xec63, null, null, null, null]);
    const where = (f: (r: (typeof START_MENU_ROWS)[number]) => boolean): number[] => START_MENU_ROWS.filter(f).map((r) => r.index);
    expect(where((r) => r.offline)).toEqual([0, 1, 2, 3, 6, 7, 8, 9]);   // 4, 5, 10, 11 cleared: D:L61279, D:L61255, D:L61327, D:L61315
    expect(where((r) => r.online)).toEqual([0, 2, 3, 4, 5, 8, 9, 10, 11]);
    expect(where((r) => r.codeLabel)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(START_MENU_ROWS.every((r) => r.blink)).toBe(true);
    expect(START_MENU_ROWS.filter((r) => r.closes).map((r) => r.index)).toEqual([0]);
    expect(START_MENU_HUDCLOC).toMatchObject({ RESUME: 60512, ABORT: 60513, REPLAY_MISSION: 60514, INVERT_PITCH_ON: 60519, INVERT_PITCH_OFF: 60520 });
  });

  it('the online rows of a living seat, in order: RESUME, ABORT, INVERT PITCH, VOICE MODULATION, RUN AND TALK, VIBRATION, FIREMODE, IN-GAME TEXT MESSAGES', () => {
    expect(startMenuLayout(ONLINE)).toEqual([0, 2, 3, 4, 5, 8, 9, 11]);
    const v = startMenuValues({ value: () => undefined }, createStartMenuPage(), true);
    // OT.R97 / R4B-02: VOICE MODULATION starts OFF (r0004's flag in .bss, r4 0x450890); r0001's ON (.data 1) is superseded.
    expect(startMenuLayout(ONLINE).map((i) => rowLabel(START_MENU_ROWS[i]!, v, true, caption))).toEqual([
      'RESUME', 'ABORT', 'INVERT PITCH: OFF', 'VOICE MODULATION: OFF', 'RUN AND TALK: OFF', 'VIBRATION: ON',
      'FIREMODE/SCOREBOARD: DEFAULT', 'IN-GAME TEXT MESSAGES : ON',
    ]);
  });

  it('a spectator: no VOICE MODULATION or RUN AND TALK, SPECTATOR HUD offered; on a LAN (ComeFromLan) no IN-GAME TEXT MESSAGES', () => {
    expect(startMenuLayout({ ...ONLINE, spectator: true })).toEqual([0, 2, 3, 8, 9, 10, 11]);
    expect(startMenuLayout({ ...ONLINE, comeFromLan: true })).toEqual([0, 2, 3, 4, 5, 8, 9]);
    expect(rowSelectable(10, ONLINE)).toBe(false);
    expect(rowSelectable(4, { ...ONLINE, spectator: true })).toBe(false);
  });

  it('offline (T7, transcribed, not mounted): RESUME, REPLAY MISSION, ABORT, INVERT PITCH, HELP, AIM ASSIST (NoAutoAim 0), VIBRATION, FIREMODE/TACMAP', () => {
    const off = { multiplayer: false, spectator: false, comeFromLan: false };
    expect(startMenuLayout(off)).toEqual([0, 1, 2, 3, 6, 7, 8, 9]);
    expect(startMenuLayout({ ...off, noAutoAim: 1 })).toEqual([0, 1, 2, 3, 6, 8, 9]);
    const v = startMenuValues({ value: () => undefined }, createStartMenuPage(), true);
    expect(rowLabel(START_MENU_ROWS[9]!, v, false, caption)).toBe('FIREMODE/TACMAP: DEFAULT');
    expect(rowLabel(START_MENU_ROWS[9]!, { ...v, fireModeSwap: true }, true, caption)).toBe('FIREMODE/SCOREBOARD: ALTERNATE');
    expect(rowLabel(START_MENU_ROWS[9]!, { ...v, fireModeSwap: true }, false, caption)).toBe('FIREMODE/TACMAP: ALTERNATE');
  });
});

describe('MATCH-01: the open and the close (FUN_002011f0, FUN_00204a40, FUN_00205200)', () => {
  it('the open plays +0xbd0, .TCM_SELECT (FUN_00204a40 D:L62136-62139); the close none', () => {
    const r = rig();
    r.open();
    expect(r.sounds).toEqual([START_MENU_SOUNDS.select]);
    r.tap('Start');
    expect(r.sounds).toEqual([START_MENU_SOUNDS.select]);
  });

  it('START opens only after the round start\'s 2 s; the cursor on RESUME; the HUD hidden; START again closes', () => {
    const r = rig();
    r.tap('Start');
    expect(r.menu.isOpen()).toBe(false);                  // the lockout (DAT_00409088 < DAT_003dc420)
    r.settle(); r.tap('Start');
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.state().cursor).toBe(0);
    expect(r.hud).toEqual(['menu:true']);
    r.tap('Start');
    expect(r.menu.isOpen()).toBe(false);
    r.step();
    expect(r.hud).toEqual(['menu:true', 'menu:false']);   // FUN_001f7a90 at the next closed tick (+0xbc1)
  });

  it('TRIANGLE let go closes; not while START is held down', () => {
    const r = rig();
    r.settle();
    r.step(['Start']);                                    // opened, START held on (byte +1 at 2)
    r.step(['Start']); r.step(['Start', 'Triangle']); r.step(['Start']);
    expect(r.menu.isOpen()).toBe(true);
    r.step([]); r.step(['Triangle']); r.step([]);
    expect(r.menu.isOpen()).toBe(false);
  });

  // LATER 245 (LATER 40's review, F2): the open `FUN_00204a40` (D:L61920-62140) never clears +0xbc1, and
  // `FUN_002011f0`'s HUD show (D:L60702-60704) runs after the open branch on the same tick -- so a close owed its show
  // and reopened on the very next tick shows the HUD under the menu (`FUN_001f7a90`, no guard), and nothing hides it
  // again while the menu is up. A reopen a tick later finds the show already made and hides the HUD as ever.
  it('LATER 245: closed, then START on the very next tick: reopened with the HUD shown under it (the owed show runs after the open)', () => {
    const r = rig();
    r.open();
    r.step(['Triangle']); r.step([]);                     // TRIANGLE let go: closed, the show owed (+0xbc1, D:L62207)
    expect(r.menu.isOpen()).toBe(false);
    expect(r.hud).toEqual(['menu:true']);
    r.step(['Start']);                                    // the next tick: the open, then the owed show
    expect(r.menu.isOpen()).toBe(true);
    expect(r.hud).toEqual(['menu:true', 'menu:true', 'menu:false']);
    for (let i = 0; i < 10; i++) r.step();
    expect(r.hud, 'nothing hides it again while the menu is up').toEqual(['menu:true', 'menu:true', 'menu:false']);
  });

  it('LATER 245: a reopen one tick later finds the show made, and the open hides the HUD as ever', () => {
    const r = rig();
    r.open();
    r.step(['Triangle']); r.step([]);
    r.step();                                             // the closed tick: the owed show
    r.step(['Start']);
    expect(r.menu.isOpen()).toBe(true);
    expect(r.hud).toEqual(['menu:true', 'menu:false', 'menu:true']);
  });

  it('no START while another screen holds the pad (START_MENU_OVER_SCREENS_READING)', () => {
    const r = rig();
    r.settle(); r.setOther(true); r.tap('Start');
    expect(r.menu.isOpen()).toBe(false);
    r.setOther(false); r.tap('Start');
    expect(r.menu.isOpen()).toBe(true);
  });

  it('a round start puts the cursor on the first row and the lockout back (FUN_00202370); the HUD reset closes it', () => {
    const r = rig();
    r.open(); r.walkTo(4);
    r.menu.roundStart();
    expect(r.menu.state().cursor).toBe(0);
    r.menu.reset();
    expect(r.menu.isOpen()).toBe(false);
    r.tap('Start');
    expect(r.menu.isOpen()).toBe(false);                 // the 2 s again
  });

  it('closed by the HUD reset and a round started at once: the hides are lifted at the round start (+0xbc1)', () => {
    const r = rig();
    r.open();
    r.menu.reset();
    expect(r.hud).toEqual(['menu:true']);
    r.menu.roundStart();
    expect(r.hud).toEqual(['menu:true', 'menu:false']);
  });

  it('online the round is never paused (D:L61948-61951); offline the pause seam runs at the open and the close', () => {
    const on = rig();
    on.open(); on.tap('Start');
    expect(on.pauses).toEqual([]);
    const off = rig({ multiplayer: false });
    off.open(); off.tap('Start');
    expect(off.pauses).toEqual([true, false]);
  });
});

describe('MATCH-01: the pad\'s navigation (FUN_00201690 D:L60805-60892)', () => {
  it('DOWN steps over the rows the seat is not offered, wraps from the last to RESUME, each move .TCM_SLIDE', () => {
    const r = rig();
    r.open();
    const seen: number[] = [r.menu.state().cursor];
    for (let i = 0; i < 8; i++) { r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.step(['Down']); r.step([]); seen.push(r.menu.state().cursor); }
    expect(seen).toEqual([0, 2, 3, 4, 5, 8, 9, 11, 0]);
    expect(r.sounds).toEqual([START_MENU_SOUNDS.select, ...Array(8).fill(START_MENU_SOUNDS.slide)]);   // the open's +0xbd0 first
    expect(START_MENU_SOUNDS).toEqual({ select: '.TCM_SELECT', slide: '.TCM_SLIDE' });
  });

  it('UP from RESUME wraps to the last offered row', () => {
    const r = rig();
    r.open();
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.step(['Up']);
    expect(r.menu.state().cursor).toBe(11);
  });

  it('a held direction repeats each 0.2 s (DAT_003dc430); a press inside the gate is not taken', () => {
    const r = rig();
    r.open();
    r.step([], START_MENU_REPEAT_SECONDS + 0.01);
    r.step(['Down'], 0.01);                               // moved: the gate shut
    expect(r.menu.state().cursor).toBe(2);
    for (let i = 0; i < 9; i++) r.step(['Down'], 0.02);   // 0.18 s held
    expect(r.menu.state().cursor).toBe(2);
    r.step(['Down'], 0.05);                               // past 0.2 s: the gate open, held = taken
    expect(r.menu.state().cursor).toBe(3);
  });

  it('the left stick moves nothing (AM-2, research 340 §1): the cursor reads the d-pad\'s bytes +5 / +6 only (D:L60817-60818)', () => {
    // The page's held set is `padButtonsDown` of the W3C pad (`./main` and `./matchMount`, beside the touch pad's): the
    // buttons, never the axes -- as the original's pad bytes are the digital buttons' (FUN_002da930 D:L179819-179862),
    // the stick its +0x220 / +0x224 floats, which nothing of FUN_002011f0 .. FUN_00205200 reads.
    const w3c = (axes: readonly number[], pressed: readonly number[] = []): PadButton[] =>
      [...padButtonsDown({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) })];
    const r = rig();
    r.open();
    const pushes = [[0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [1, 0], [-1, 0]] as const;
    for (const [x, y] of pushes) {
      expect(w3c([x, y, 0, 0])).toEqual([]);
      for (let i = 0; i < 20; i++) r.step(w3c([x, y, 0, 0]), 0.05);         // 1 s each way, the 0.2 s gate open many times over
      r.step([], 0.05);
    }
    expect(r.menu.state().cursor).toBe(0);
    expect(r.sounds).toEqual([START_MENU_SOUNDS.select]);                    // the open's alone: no .TCM_SLIDE
    r.step(w3c([0, 0, 0, 0], [PAD_BUTTON.Down]), 0.05);                     // the d-pad's DOWN (W3C 13): moved
    expect(r.menu.state().cursor).toBe(2);
  });

  it('under ABORT\'s confirm the stick moves neither YES nor NO (bytes +3 / +4 only, D:L60871-60874; AM-2)', () => {
    const r = rig();
    r.open(); r.walkTo(START_MENU_TYPE.abort); r.tap('Cross');
    expect(r.menu.state().confirm).toEqual({ choice: 2, yes: false });
    for (const x of [1, -1, 1]) { for (let i = 0; i < 10; i++) r.step([...padButtonsDown({ axes: [x, 0, 0, 0], buttons: [] })], 0.05); r.step([], 0.05); }
    expect(r.menu.state().confirm).toEqual({ choice: 2, yes: false });
  });

  it('the bar slides to the row at 400 px/s within 31 px, jumps farther (D:L60765-60789), its top the row\'s y - 19', () => {
    const r = rig();
    r.open();
    expect(r.menu.state().barY).toBe(START_MENU_BAR.rowY(0) - 19);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.step(['Down'], 0.01);    // to the second placed row: 21 px down
    const y0 = START_MENU_BAR.rowY(0) - 19;
    r.step([], 0.01);                                     // the bar moves at the frame's top, toward the cursor's row
    expect(r.menu.state().barY).toBeCloseTo(y0 + 400 * 0.01, 5);
    r.step([], 0.5);
    expect(r.menu.state().barY).toBe(START_MENU_BAR.rowY(1) - 19);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.step(['Up'], 0.01);   // back to RESUME (REPLAY MISSION is offline's)
    expect(r.menu.state().cursor).toBe(0);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.step(['Up'], 0.01);   // to the last placed row: 147 px, a jump
    expect(r.menu.state().cursor).toBe(11);
    r.step([], 0.01);
    expect(r.menu.state().barY).toBe(START_MENU_BAR.rowY(7) - 19);
  });
});

describe('MATCH-01: each row\'s effect (FUN_002041e0\'s cases D:L61679-61867), CROSS let go', () => {
  const press = (r: ReturnType<typeof rig>, type: number): void => { r.open(); r.walkTo(type); r.sounds.length = 0; r.tap('Cross'); };

  it('RESUME closes (the row\'s close bit, D:L61872-61873), with .TCM_SELECT', () => {
    const r = rig();
    press(r, START_MENU_TYPE.resume);
    expect(r.menu.isOpen()).toBe(false);
    expect(r.sounds).toEqual(['.TCM_SELECT']);
  });

  it('ABORT opens its confirm (MATCH-02, below): .TCM_SELECT, the menu stays up, nothing aborted yet', () => {
    const r = rig();
    press(r, START_MENU_TYPE.abort);
    expect(r.sounds).toEqual(['.TCM_SELECT']);
    expect(r.aborts).toEqual([]);
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.state().confirm).toEqual({ choice: 2, yes: false });
  });

  it('INVERT PITCH: the global and its valve (TEMP, FUN_00351ff0(.., 2)) to 1, the label ON; again, both 0', () => {
    const r = rig();
    press(r, START_MENU_TYPE.invertPitch);
    expect(r.globals.value('INVERT_PITCH_CONTROLLER')).toBe(1);
    expect(r.valves.find('INVERT_PITCH_CONTROLLER')).toMatchObject({ value: 1, type: VALVE_TYPE.TEMP });
    expect(r.menu.labels()[2]).toBe('INVERT PITCH: ON');
    r.tap('Cross');
    expect(r.globals.value('INVERT_PITCH_CONTROLLER')).toBe(0);
  });

  it('VOICE MODULATION: the page\'s mask on, the VoiceMask valve written where it is held, the encoder told (FUN_0030e5a0)', () => {
    // OT.R97 / R4B-02: the page starts OFF (r4 0x450890, .bss) and the table's VoiceMask is 0, so the first press turns
    // it on; under r0001 (DAT_003df1a8 = 1) the first press turned it off.
    const r = rig();
    r.valves.set('VoiceMask', 0, VALVE_TYPE.PERSIST);
    press(r, START_MENU_TYPE.voiceModulation);
    expect(r.masks).toEqual([true]);
    expect(r.valves.find('VoiceMask')?.value).toBe(1);
    expect(r.menu.labels()[3]).toBe('VOICE MODULATION: ON');
    const bare = rig();
    press(bare, START_MENU_TYPE.voiceModulation);
    expect(bare.valves.find('VoiceMask')).toBeUndefined();   // FUN_00351ef0: found, never made
  });

  it('RUN AND TALK: the page\'s flag on (DAT_0044d4f8, .bss 0), the talk input reads it', () => {
    const r = rig();
    expect(r.menu.runAndTalk()).toBe(false);
    press(r, START_MENU_TYPE.runAndTalk);
    expect(r.menu.runAndTalk()).toBe(true);
    expect(r.menu.labels()[4]).toBe('RUN AND TALK: ON');
  });

  it('FIREMODE/SCOREBOARD: the swap global (DAT_0044d500) flipped, no valve (case 9 writes none)', () => {
    const r = rig();
    press(r, START_MENU_TYPE.fireMode);
    expect(r.globals.value('FIREMODESWAP_CONTROLLER')).toBe(1);
    expect(r.valves.find('FIREMODESWAP_CONTROLLER')).toBeUndefined();
    expect(r.menu.labels()[6]).toBe('FIREMODE/SCOREBOARD: ALTERNATE');
  });

  it('FIREMODE/SCOREBOARD swaps the active controller config\'s FireMode and TACMAP (FUN_00592050 at D:L61825; research 344 §6)', () => {
    controllerConfigs.reset();
    const r = rig();
    press(r, START_MENU_TYPE.fireMode);
    expect([controllerConfigs.fireModeSwap, controllerConfigs.record().buttons.FireMode, controllerConfigs.record().buttons.TACMAP]).toEqual([true, 'Select', 'LeftStickTap']);
    expect(r.globals.value('FIREMODESWAP_CONTROLLER')).toBe(1);   // the flag and the global agree
    controllerConfigs.reset();
  });

  it('IN-GAME TEXT MESSAGES: EnableExternalWhispers and its valve (PERM) to 0 (FUN_002a41f0); the round drops an outside whisper', () => {
    const r = rig();
    press(r, START_MENU_TYPE.textMessages);
    expect(r.globals.value('EnableExternalWhispers')).toBe(0);
    expect(r.valves.find('EnableExternalWhispers')).toMatchObject({ value: 0, type: VALVE_TYPE.PERM });
    const line = { text: 'hi', name: 'outsider', kind: 5 } as const;
    expect(roundQueueLine(line as never, { external: externalWhispers(r.globals.value('EnableExternalWhispers')), inRound: () => false })).toBeNull();
    expect(r.menu.labels()[7]).toBe('IN-GAME TEXT MESSAGES : OFF');
  });

  it('SPECTATOR HUD (a spectator\'s row): off, the HUD told (DAT_003dc3e0); the hides are the scoreboard\'s (D:L56808-56827)', () => {
    const r = rig({ spectator: true });
    press(r, START_MENU_TYPE.spectatorHud);
    expect(r.hud).toContain('spec:false');
    expect(r.menu.labels()[5]).toBe('SPECTATOR HUD: OFF');
    const sizes = { 'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 }, 'compass_lo.tif': { width: 128, height: 128 } };
    const frame = { width: 640, height: 448 };
    const off: HudModel = { ...DEFAULT_MODEL, spectatorHud: false };
    const drawn = new Set(hudPass(frame, off, sizes, AT_REST, false, null).quads.map((q) => q.element));
    for (const e of SCOREBOARD_HIDES) expect(drawn.has(e)).toBe(false);
  });

  it('VIBRATION (CTL-2, D:L61794-61822): CROSS flips DAT_00650698 (FUN_00592be0), the valve only where it is found, the label', () => {
    const r = rig();
    press(r, START_MENU_TYPE.vibration);
    expect(r.sounds).not.toEqual([]);                                  // a built row's press: its sound, as the others'
    expect(r.globals.value('VIBRATION_CONTROLLER')).toBe(0);
    expect(r.menu.labels()[5]).toBe('VIBRATION OFF');
    expect(r.valves.find('VIBRATION_CONTROLLER')).toBeUndefined();     // FUN_00351ef0 found none: nothing written
    r.tap('Cross');
    expect(r.globals.value('VIBRATION_CONTROLLER')).toBe(1);
    expect(r.menu.labels()[5]).toBe('VIBRATION: ON');
  });

  it('a pressed row blinks (bit 3): hidden 0.1 s, shown 0.1 s, hidden 0.1 s, then shown (D:L61001-61022)', () => {
    const r = rig();
    r.open(); r.walkTo(START_MENU_TYPE.fireMode);
    r.step(['Cross'], 0.01); r.step([], 0.01);
    const a = (): number => r.menu.state().rowAlpha[START_MENU_TYPE.fireMode]!;
    expect(a()).toBe(0);
    r.step([], 0.1); expect(a()).toBe(128);
    r.step([], 0.1); expect(a()).toBe(0);
    r.step([], 0.1); expect(a()).toBe(128);
  });
});

describe('MATCH-02: ABORT\'s confirm (FUN_002041e0 D:L61689-61698, D:L61877-61915; FUN_00201690 D:L60750-60996)', () => {
  /** The menu open, its cursor on ABORT, CROSS let go: the confirm up; the sounds from here. */
  const confirm = (r: ReturnType<typeof rig>): void => { r.open(); r.walkTo(START_MENU_TYPE.abort); r.tap('Cross'); r.sounds.length = 0; };
  /** One press past the cursor's gate (`DAT_00409098`, D:L60869): the confirm's moves need it open, as the rows' do. */
  const press = (r: ReturnType<typeof rig>, b: PadButton): void => { r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap(b); };

  it('its lines are the abort pair, its buttons YES and NO, the default NO (+0xbe4 0: D:L62373, every exit D:L61886, D:L61906, D:L62210)', () => {
    const r = rig();
    confirm(r);
    expect(r.menu.confirmLines()).toEqual(['Are you sure you want', 'to abort the game?', ' ']);
    expect(START_MENU_CONFIRM_TEXT).toEqual({ sure: 'Are you sure you want', abort: 'to abort the game?', replay: 'to replay the mission?', blank: ' ', yes: 'YES', no: 'NO' });
    expect(r.menu.state().confirm).toEqual({ choice: 2, yes: false });
    expect(r.menu.state().rowAlpha[START_MENU_TYPE.abort]).toBe(0);         // the row's blink began with the press (D:L61869-61870)
  });

  it('LEFT to YES and RIGHT to NO, each with .TCM_SLIDE (D:L60869-60886: byte +4 LEFT, +3 RIGHT); UP / DOWN and the bar hold', () => {
    const r = rig();
    confirm(r);
    const bar = r.menu.state().barY;
    press(r, 'Down'); press(r, 'Up');
    expect(r.menu.state().cursor).toBe(START_MENU_TYPE.abort);
    expect(r.sounds).toEqual([]);
    press(r, 'Left');
    expect(r.menu.state().confirm).toEqual({ choice: 2, yes: true });
    press(r, 'Left');                                                        // on YES already: nothing
    expect(r.sounds).toEqual(['.TCM_SLIDE']);
    press(r, 'Right');
    expect(r.menu.state().confirm).toEqual({ choice: 2, yes: false });
    expect(r.sounds).toEqual(['.TCM_SLIDE', '.TCM_SLIDE']);
    expect(r.menu.state().barY).toBe(bar);
  });

  it('BACK (TRIANGLE let go) returns to the menu with the round unchanged -- from NO and from YES alike (D:L61878-61888)', () => {
    for (const yes of [false, true]) {
      const r = rig();
      confirm(r);
      if (yes) press(r, 'Left');
      r.sounds.length = 0;
      r.tap('Triangle');
      expect(r.menu.state().confirm).toBeNull();
      expect(r.menu.isOpen()).toBe(true);                                    // the menu, not the round: TRIANGLE does not close it here
      expect(r.menu.state().cursor).toBe(START_MENU_TYPE.abort);
      expect(r.sounds).toEqual(['.TCM_SELECT']);                             // +0xbd0 (D:L61910-61913)
      expect(r.aborts).toEqual([]);
      expect(r.pauses).toEqual([]);                                          // online nothing paused under it, nothing resumed
      expect(r.menu.aborted()).toBe(false);
    }
  });

  it('CROSS on NO returns to the menu as BACK does; CROSS on YES aborts: the seam once, the menu closed, no START again until the HUD\'s reset', () => {
    const no = rig();
    confirm(no);
    no.tap('Cross');
    expect(no.menu.state().confirm).toBeNull();
    expect(no.menu.isOpen()).toBe(true);
    expect(no.aborts).toEqual([]);
    expect(no.sounds).toEqual(['.TCM_SELECT']);
    const yes = rig();
    confirm(yes);
    press(yes, 'Left');
    yes.sounds.length = 0;
    yes.tap('Cross');
    expect(yes.aborts).toEqual([1]);                                         // `mission_abort` 1 (D:L61890-61897): the mission's (`./matchAbort`)
    expect(yes.menu.isOpen()).toBe(false);                                   // FUN_00205200 (D:L61908)
    expect(yes.menu.state().confirm).toBeNull();
    expect(yes.sounds).toEqual(['.TCM_SELECT']);
    expect(yes.menu.aborted()).toBe(true);                                   // DAT_00409070 1 (D:L61904)
    yes.settle(); yes.tap('Start');
    expect(yes.menu.isOpen()).toBe(false);                                   // the open refused (D:L60653)
    yes.menu.reset();                                                        // the HUD's reset: FUN_00202210 (D:L57717, D:L61041)
    expect(yes.menu.aborted()).toBe(false);
    yes.settle(); yes.tap('Start');
    expect(yes.menu.isOpen()).toBe(true);
  });

  it('START under the confirm closes the menu and the confirm with it, nothing aborted (D:L61664-61666, D:L62209-62211)', () => {
    const r = rig();
    confirm(r);
    press(r, 'Left');
    r.tap('Start');
    expect(r.menu.isOpen()).toBe(false);
    expect(r.menu.state().confirm).toBeNull();
    expect(r.aborts).toEqual([]);
    r.tap('Start');
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.state().confirm).toBeNull();
  });

  it('the draw (MATCH-02b: the menu\'s draw FUN_002015a0): under the confirm the shade and the confirm only -- its frame, inside, the lines, the YES and NO boxes; the selected button pulses', () => {
    const sizes = { 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 }, white: { width: 1, height: 1 } };
    const frame = { width: 640, height: 448 };
    const r = rig();
    confirm(r);
    const { quads } = r.menu.draw(frame, sizes);
    const boxes = quads.filter((q) => q.texture === 'white');
    expect(boxes.length).toBe(1 + 6);                                        // the shade +0x30, then the confirm's six (+0xc70's tree)
    expect(boxes[0]).toMatchObject({ x: 320, y: 224, w: 448, h: 640, rgba: [0, 0, 0, 100 / 128], alphaRight: 0 });
    const rect = (i: number) => { const q = boxes[i]!; return [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2]; };
    expect(rect(1)).toEqual([182, 125, 458, 275]);                           // +0xc70 (D:L61448-61452)
    expect(boxes[1]!.rgba).toEqual([35 / 255, 51 / 255, 56 / 255, 80 / 128]);
    expect(rect(2)).toEqual([192, 135, 448, 265]);                           // +0xbf0 (D:L61453-61457)
    expect(boxes[2]!.rgba).toEqual([11 / 255, 21 / 255, 24 / 255, 100 / 128]);
    expect([rect(3), rect(4), rect(5), rect(6)]).toEqual([[216, 219, 304, 253], [220, 223, 300, 249], [336, 219, 424, 253], [340, 223, 420, 249]]);
    const p = r.menu.state().pulse, B = START_MENU_BAR;
    expect(boxes[4]!.rgba).toEqual([35 / 255, 51 / 255, 56 / 255, 1]);     // YES, not selected: the base (D:L60981)
    const no = boxes[6]!.rgba.slice(0, 3).map((c) => c * 255);
    B.base.forEach((c, i) => { expect(no[i]).toBeCloseTo(c + (B.peak[i]! - c) * p, 6); });   // NO pulses (D:L60968-60977)
    expect(START_MENU_CONFIRM_LAYOUT.lines.map((l) => l.y)).toEqual([165, 185, 205]);
    expect(START_MENU_CONFIRM_LAYOUT.buttons.map((b) => [b.x, b.y])).toEqual([[260, 245], [380, 245]]);
    // No row, no title, no bar, no prompt under it: no pad glyph (the prompts' two), and the strings drawn are the confirm's.
    expect(quads.filter((q) => q.texture === 'font_special_01.tif').length).toBe(0);
    const drawn = r.menu.drawnState();
    const glyphs = (lines: string[]): number => lines.reduce((n, l) => n + [...l].filter((ch) => ch.trim() !== '').length, 0);
    expect(quads.filter((q) => q.texture === 'font_text_01.tif').length).toBe(2 * glyphs([...drawn.confirm!.lines, 'YES', 'NO']));   // each glyph and its shadow
    expect(drawn.rows.every((row) => row.rgb.join() === '100,100,100')).toBe(true);   // under the confirm no row pulses (D:L60955)
    expect(drawn.confirm?.buttons.map((b) => b.text)).toEqual(['YES', 'NO']);
    expect(drawn.confirm?.buttons[0]!.rgb).toEqual([100, 100, 100]);
    expect(drawn.confirm?.buttons[1]!.rgb).toEqual([100 + 28 * p, 100 + 28 * p, 100 - 36 * p]);
  });

  it('back at the menu (BACK, or CROSS on NO): the menu drawn again -- its boxes, bar, title, prompts and rows -- and no confirm', () => {
    const sizes = { 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 }, white: { width: 1, height: 1 } };
    const frame = { width: 640, height: 448 };
    for (const way of ['Triangle', 'Cross'] as const) {
      const r = rig();
      r.open();
      const before = r.menu.draw(frame, sizes).quads;
      r.walkTo(START_MENU_TYPE.abort);
      r.tap('Cross');
      r.tap(way);                                                            // NO is the default: CROSS on it is BACK's way out
      expect(r.menu.state().confirm, way).toBeNull();
      r.step([], 0.35);                                                      // ABORT's own blink (its press, D:L61869-61870) run out
      const { quads } = r.menu.draw(frame, sizes);
      expect(quads.filter((q) => q.texture === 'white').length, way).toBe(6);
      expect(quads.filter((q) => q.texture === 'font_special_01.tif').length, way).toBe(2);
      expect(quads.filter((q) => q.texture === 'font_text_01.tif').length, way).toBe(before.filter((q) => q.texture === 'font_text_01.tif').length);
    }
  });
});

describe('MATCH-02b: the title -- the mission\'s description (FUN_002a42a0 D:L147716-147720, FUN_002aab20 D:L151313-151317, FUN_00361b60 D:L260211-260221)', () => {
  it('the description the page\'s map holds, as FUN_00361b60 leaves it (no `_` key: the string itself); none, the original\'s default', () => {
    expect(startMenuTitle('CROSSROADS')).toBe('CROSSROADS');
    expect(startMenuTitle("RAT'S NEST")).toBe("RAT'S NEST");
    expect(START_MENU_TITLE_MISSING).toBe('MISSION DESCRIPTION : MISSING');   // S:0x3f0a30 (D:L151314-151316)
    expect(startMenuTitle(null)).toBe(START_MENU_TITLE_MISSING);
    expect(startMenuTitle(undefined)).toBe(START_MENU_TITLE_MISSING);
  });

  it('the menu draws it: its deps\' title is the map\'s description, or null before a map', () => {
    let name: string | null = 'CROSSROADS';
    const r = rig({}, { title: () => name });
    r.open();
    expect(r.menu.drawnState().title).toBe('CROSSROADS');
    name = null;
    expect(r.menu.drawnState().title).toBe(START_MENU_TITLE_MISSING);
  });

  it('both matches hand the menu the same string (OT.R43): the loaded map\'s name, `mission.rdr`\'s description -- not the hand-off\'s stem', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf-8');
    expect(src('matchMount.ts')).toContain('    title: () => map?.name ?? null,');
    expect(src('matchMount.ts')).not.toContain('title: () => o.handOff.mission');
    expect(src('main.ts')).toContain('  title: () => loaded?.name ?? null,');
    expect(src('main.ts')).not.toContain("title: () => loaded?.name ?? '',");
    // Each page's map is `loadMap`'s, whose `name` is `READERM.ZAR/mission.rdr`'s description (research 36 §6).
    expect(src('loadMap.ts')).toContain("const name = rdrGet(parseRdr(readerm.data(mission)), 'description');");
    expect(src('matchMount.ts')).toContain('let map: LoadedMap | null = null;');
    expect(src('main.ts')).toContain('let loaded: LoadedMap | null = null;');
  });
});

describe('MATCH-01: the systems the rows reach (the encoder of the voice, the talk input)', () => {
  it('VOICE MODULATION off: the headset sends the blocks of the round as they are (FUN_0030e5a0 D:L61746); on, shifted', () => {
    const h = mountHeadset({ line: () => {}, win: null, doc: null, pads: null });
    h.frame({ phase: 'round', spectator: false });
    const block = Float32Array.from({ length: 640 }, (_, i) => Math.sin(i / 7));
    expect(h.modulate(block, true)).not.toBe(block);
    h.setVoiceMask(false);
    expect(h.modulate(block)).toBe(block);
    h.setVoiceMask(true);
    expect(h.modulate(block)).not.toBe(block);
    h.dispose();
  });

  it('RUN AND TALK on: the talk input takes L2 held as the talk (route B, research 197); off, never', () => {
    const talked = (on: boolean): boolean => {
      let now = 0, any = false;
      const net = { client: { id: 2, send: () => {} }, gate: () => ({ inMatch: true, alive: true, cameraOnSelf: true, spectator: false }) };
      const t = mountTaunts({
        net: () => net as never, hud: { postMessage: () => {} }, audio: { play: () => true as never, playStream: () => 'played' },
        custom: () => [], otherMenu: () => false, release: () => {}, clock: () => now, runAndTalk: () => on,
        headset: mountHeadset({ line: () => {}, win: null, doc: null, pads: null }),
      });
      t.setData({ taunts: { defaults: [], captions: {}, vocals: { seal: [], terrorist: [] } } } as unknown as SoundData);
      for (let i = 0; i < 20; i++) { now += 0.05; any = t.pad(new Set<PadButton>(['L2']), noInput()).talk || any; }
      t.dispose();
      return any;
    };
    expect(talked(true)).toBe(true);
    expect(talked(false)).toBe(false);
  });
});

describe('MATCH-01: the options of the two pages (the session of the front end; the own store of /testroom)', () => {
  it('the front end: the session OptionGlobals carry the INVERT PITCH and FIREMODE of the menu to playOptionsOf', () => {
    const r = rig();
    r.open(); r.walkTo(START_MENU_TYPE.invertPitch); r.tap('Cross');
    r.walkTo(START_MENU_TYPE.fireMode); r.tap('Cross');
    expect(playOptionsOf(r.globals)).toMatchObject({ invertPitch: true, fireModeSwap: true, stick: RIGHT_STICK });
  });

  it('/testroom: the writes of the menu over the stored options of the card, read back by playOptionsOf', () => {
    const card = { invertPitch: true, headBob: false, fireModeSwap: false, stick: RIGHT_STICK, vibration: true };
    const local = localStartMenuOptions(playOptionsGlobals(() => card));
    expect(playOptionsOf(local)).toEqual(card);
    const r = rig({}, { options: local });
    r.open(); r.walkTo(START_MENU_TYPE.invertPitch);
    expect(r.menu.labels()[2]).toBe('INVERT PITCH: ON');   // the card's, read through the globals
    r.tap('Cross');
    expect(playOptionsOf(local)).toEqual({ ...card, invertPitch: false });
  });

  it('/testroom: the card read again (a map change) drops the menu\'s writes -- the card wins, as a store over the global would', () => {
    let card = { invertPitch: false, headBob: true, fireModeSwap: false, stick: RIGHT_STICK, vibration: true };
    const local = localStartMenuOptions(playOptionsGlobals(() => card));
    local.setGlobal('INVERT_PITCH_CONTROLLER', 1);
    local.setGlobal('FIREMODESWAP_CONTROLLER', 1);
    expect(playOptionsOf(local)).toEqual({ invertPitch: true, headBob: true, fireModeSwap: true, stick: RIGHT_STICK, vibration: true });
    card = { invertPitch: false, headBob: false, fireModeSwap: false, stick: RIGHT_STICK, vibration: true };
    local.clear();
    expect(playOptionsOf(local)).toEqual(card);
  });
});

describe("CTL-2, the review's F4: /testroom's VIBRATION is the card's", () => {
  it("a card with VIBRATION OFF reaches the START menu's values (and the motors' toggle) through playOptionsGlobals", () => {
    const card = { invertPitch: false, headBob: true, fireModeSwap: false, stick: RIGHT_STICK, vibration: false };
    const local = localStartMenuOptions(playOptionsGlobals(() => card));
    expect(local.value('VIBRATION_CONTROLLER')).toBe(0);
    expect(playOptionsOf(local).vibration).toBe(false);
    const r = rig({}, { options: local });
    r.open();
    expect(r.menu.labels()[5]).toBe('VIBRATION OFF');
  });
});

describe('MATCH-01: the pad held and the HUD (the hide-all FUN_001f77c0, D:L56312-56361)', () => {
  it('while open the game\'s lanes take nothing and the later parts see no button', () => {
    const r = rig();
    r.open();
    const input = { ...noInput(), fire: true, moveX: 1 };
    const out = r.menu.pad(new Set<PadButton>(['R1']), input, 1 / 60);
    expect(out.owns).toBe(true);
    expect(out.input.fire).toBe(false);
    expect(out.input.moveX).toBe(0);
    expect(out.held.size).toBe(0);
    const closed = rig();
    const pass = closed.menu.pad(new Set<PadButton>(['R1']), input, 1 / 60);
    expect(pass.owns).toBe(false);
    expect(pass.input.fire).toBe(true);
  });

  // PAR-97 (was: 'voice' in the hidden list, on research 282 §1's old mapping of D:L56341): the voice element is the
  // info box's child `+0x390` (`FUN_00238f50` D:L85656), and the hide-all skips the info box in control state 3
  // (D:L56344-56347), which the open sets before calling it (D:L61963-61964).
  it('START_MENU_HIDES: the weapon box, compass, prompts, stance, zoom, spectator panel, main window; not the info box, voice, timer, number', () => {
    for (const e of ['panel', 'rounds', 'mags', 'icon', 'firemode', 'compass', 'marks', 'action', 'holdBar', 'stance', 'zoom', 'scopeRange', 'spectatorInfo', 'banner', 'message'] as const) {
      expect(START_MENU_HIDES.has(e)).toBe(true);
    }
    for (const e of ['bar', 'name', 'box', 'voice', 'timer', 'range', 'fader'] as const) expect(START_MENU_HIDES.has(e)).toBe(false);
    const sizes = { 'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 }, 'compass_lo.tif': { width: 128, height: 128 } };
    const frame = { width: 640, height: 448 };
    const drawn = new Set(hudPass(frame, { ...DEFAULT_MODEL, startMenu: true }, sizes, AT_REST, false, null).quads.map((q) => q.element));
    for (const e of START_MENU_HIDES) expect(drawn.has(e)).toBe(false);
    expect(drawn.has('timer')).toBe(true);
  });

  it('PAR-97: the voice mark stays drawn under the open menu online (D:L56344-56347, D:L61963-61964; D:L85656)', () => {
    const sizes = { 'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 } };
    const frame = { width: 640, height: 448 };
    const voice = { icon: null, count: '2', name: 'KILO', talk: null };
    const quads = hudPass(frame, { ...DEFAULT_MODEL, voice, startMenu: true }, sizes, AT_REST, false, null).quads;
    const closed = hudPass(frame, { ...DEFAULT_MODEL, voice }, sizes, AT_REST, false, null).quads;
    const marks = (qs: typeof quads) => qs.filter((q) => q.element === 'voice');
    expect(marks(closed).length).toBeGreaterThan(0);
    expect(marks(quads)).toEqual(marks(closed));
  });
});

describe('MATCH-01: the draw (FUN_00202520 D:L61343-61449; FUN_00201690\'s colours D:L60928-60967)', () => {
  const sizes = { 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 }, white: { width: 1, height: 1 } };
  const frame = { width: 640, height: 448 };

  it('closed, nothing; open, the shade, the four boxes, the bar, the title, the prompts and the rows on the overlay\'s layer', () => {
    const r = rig();
    expect(r.menu.draw(frame, sizes).quads).toEqual([]);
    r.open();
    const { quads } = r.menu.draw(frame, sizes);
    expect(quads.every((q) => q.element === 'startMenu' && q.layer === 1)).toBe(true);
    const boxes = quads.filter((q) => q.texture === 'white');
    // The shade: the whole frame, black, alpha 100 at the top and 0 at the bottom (a quad turned a quarter: left -> top).
    expect(boxes[0]).toMatchObject({ x: 320, y: 224, w: 448, h: 640, rgba: [0, 0, 0, 100 / 128], alphaRight: 0 });
    expect(boxes[0]!.turn).toBeCloseTo(Math.PI / 2, 9);
    const rect = (i: number) => { const q = boxes[i]!; return [q.x - q.w / 2, q.y - q.h / 2, q.x + q.w / 2, q.y + q.h / 2]; };
    expect(rect(1)).toEqual([164, 119, 476, 361]);   // 0x43240000 = 164.0
    expect(rect(2)).toEqual([170, 125, 470, 355]);
    expect(rect(3)).toEqual([164, 56, 476, 106]);
    expect(rect(4)).toEqual([170, 62, 470, 100]);
    expect(boxes[1]!.rgba).toEqual([35 / 255, 51 / 255, 56 / 255, 80 / 128]);
    expect(boxes[2]!.rgba).toEqual([11 / 255, 21 / 255, 24 / 255, 100 / 128]);
    // The bar: x 171, 297 x 21, its top the selected row's y - 19, the pulse's colour at alpha 100.
    expect(rect(5)).toEqual([171, START_MENU_BAR.rowY(0) - 19, 171 + 297, START_MENU_BAR.rowY(0) + 2]);
    expect(boxes[5]!.rgba[3]).toBe(100 / 128);
    expect(boxes.length).toBe(6);
    expect(quads.filter((q) => q.texture === 'font_special_01.tif').length).toBe(2);   // the cross and the triangle glyphs
  });

  it('the strings the ELF holds (S:0x3e3b20-0x3e3d40)', () => {
    expect(START_MENU_TEXT.accept).toBe('¦ ACCEPT');
    expect(START_MENU_TEXT.back).toBe('¬ BACK');
    expect(START_MENU_TEXT.vibrationOff).toBe('VIBRATION OFF');
    expect(START_MENU_TEXT.textMessagesOn).toBe('IN-GAME TEXT MESSAGES : ON');
  });
});

/**
 * LATER 40 (research 266 §8.11.2; research 101 A44): after a close the original keeps drawing the menu while
 * `DAT_00409080` is set (the close `FUN_00205200` D:L62208; the draw `FUN_002015a0`, 0x2015c8) and each closed tick
 * (`FUN_002011f0`, called only while +0xbc0 is 0: `FUN_00201690` D:L60792-60793) fades four alphas at 300 a second to 0
 * (D:L60657-60699): the shade; the insides and the bar; the frames; the title, the prompts and the rows. Reading,
 * pending review; a capture of a close (ONL-32) is the owner's.
 */
describe('LATER 40: the close\'s fade (FUN_002011f0 D:L60657-60699)', () => {
  const sizes = { 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 }, white: { width: 1, height: 1 } };
  const frame = { width: 640, height: 448 };
  const dt = 1 / 60, step = dt * 300;
  /** The white quads' alphas in draw order (x 128): the shade, the four boxes, the bar. */
  const whites = (r: ReturnType<typeof rig>): number[] => r.menu.draw(frame, sizes).quads.filter((q) => q.texture === 'white').map((q) => Math.round(q.rgba[3] * 128 * 1000) / 1000);

  it('the rate is 300 alpha a second; open, nothing fades and the open\'s alphas are drawn', () => {
    expect(START_MENU_FADE_RATE_READING).toBe(300);
    const r = rig();
    r.open();
    for (let i = 0; i < 30; i++) r.step();
    expect(r.menu.state()).toMatchObject({ open: true, fading: false, alphas: { shade: 100, inner: 100, frame: 80, text: 110 } });
    expect(whites(r)).toEqual([100, 80, 100, 80, 100, 100]);
  });

  it('a close: still drawn, each closed tick takes dt x 300 off the four alphas; the rows take the text\'s', () => {
    const r = rig();
    r.open();
    r.step(['Start']);                                          // the close (D:L61664-61666)
    expect(r.menu.isOpen()).toBe(false);
    expect(r.menu.state().fading).toBe(true);
    r.step();                                                   // the first closed tick
    const a = r.menu.state().alphas;
    expect(a.shade).toBeCloseTo(100 - step, 9);
    expect(a.inner).toBeCloseTo(100 - step, 9);
    expect(a.frame).toBeCloseTo(80 - step, 9);
    expect(a.text).toBeCloseTo(110 - step, 9);
    expect(new Set(r.menu.state().rowAlpha)).toEqual(new Set([a.text]));   // 128 -> the title's (D:L60690-60694)
    expect(whites(r)).toEqual([95, 75, 95, 75, 95, 95]);
    const glyphs = r.menu.draw(frame, sizes).quads.filter((q) => q.texture === 'font_text_01.tif' && q.rgba[0] > 0);
    expect(new Set(glyphs.map((q) => Math.round(q.rgba[3] * 128 * 1000) / 1000))).toEqual(new Set([105]));
    // The fade holds neither the pad nor the look: the close gave them back (D:L62203-62205).
    expect(r.menu.pad(new Set(), noInput(), dt).owns).toBe(false);
  });

  it('it ends once all four are past 0 -- about 0.37 s at 60 ticks a second, the title\'s 110 the last -- then nothing is drawn', () => {
    const r = rig();
    r.open();
    r.step(['Start']);
    let ticks = 0;
    while (r.menu.state().fading && ticks < 100) { r.step(); ticks++; }
    expect(ticks * dt).toBeGreaterThanOrEqual(110 / 300);
    expect(ticks * dt).toBeLessThanOrEqual(110 / 300 + 2 * dt);
    expect(r.menu.draw(frame, sizes).quads).toEqual([]);
  });

  it('each alpha floored at 0; it ends on a tick that takes all four below 0, so a tick of no time never ends it (D:L60697-60699)', () => {
    const r = rig();
    r.open();
    r.step(['Start']);
    r.step([], 0.25);                                           // 75 off each, exactly
    expect(r.menu.state()).toMatchObject({ fading: true, alphas: { shade: 25, inner: 25, frame: 5, text: 35 } });
    r.step([], 0);                                              // nothing below 0: nothing ends
    expect(r.menu.state()).toMatchObject({ fading: true, alphas: { shade: 25, inner: 25, frame: 5, text: 35 } });
    r.step([], 0.25);
    expect(r.menu.state()).toMatchObject({ fading: false, alphas: { shade: 0, inner: 0, frame: 0, text: 0 } });
  });

  it('a reopen inside the fade is the open\'s: its alphas back (D:L62002-62011, D:L62119-62126), nothing fades while it is open', () => {
    const r = rig();
    r.open();
    r.step(['Start']);
    for (let i = 0; i < 6; i++) r.step();
    r.tap('Start');                                             // reopened
    expect(r.menu.isOpen()).toBe(true);
    for (let i = 0; i < 30; i++) r.step();
    expect(r.menu.state().alphas).toEqual({ shade: 100, inner: 100, frame: 80, text: 110 });
    expect(new Set(r.menu.state().rowAlpha)).toEqual(new Set([128]));
    expect(whites(r)).toEqual([100, 80, 100, 80, 100, 100]);
    r.step(['Start']);                                          // closed again: the fade again, from the open's
    r.step();
    expect(r.menu.state().alphas.text).toBeCloseTo(110 - step, 9);
  });

  it('after the confirm\'s YES the fade is the menu\'s, not the confirm\'s (the close clears +0xbdc, D:L62209)', () => {
    const r = rig();
    r.open();
    r.walkTo(START_MENU_TYPE.abort);
    r.tap('Cross');                                             // the confirm
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Left');   // YES, past the gate (D:L60869)
    r.tap('Cross');                                             // aborted, closed
    expect(r.aborts).toEqual([1]);
    expect(r.menu.isOpen()).toBe(false);
    expect(r.menu.drawnState().confirm).toBeNull();
    const quads = r.menu.draw(frame, sizes).quads;
    expect(quads.filter((q) => q.texture === 'white').length).toBe(6);   // the shade, the four boxes, the bar
    expect(quads.filter((q) => q.texture === 'font_special_01.tif').length).toBe(2);   // the prompts' glyphs
  });

  it('the HUD\'s reset ends it at once (FUN_00205200 then FUN_00202210, D:L57716-57717: the flag cleared, D:L61039)', () => {
    const r = rig();
    r.open();
    r.step(['Start']);
    r.step();
    r.menu.reset();
    expect(r.menu.state().fading).toBe(false);
    expect(r.menu.draw(frame, sizes).quads).toEqual([]);
  });

  it('under a round start\'s lockout it holds (FUN_002011f0 counts the lockout first, D:L60628-60630), then runs on', () => {
    const r = rig();
    r.open();
    r.step(['Start']);
    r.step();
    const held = r.menu.state().alphas;
    r.menu.roundStart();
    for (let i = 0; i < 60; i++) r.step();                      // 1 s of the 2 s lockout
    expect(r.menu.state().alphas).toEqual(held);
    r.settle();
    expect(r.menu.state().fading).toBe(false);
  });
});

describe('MATCH-01: one wiring -- both matches mount the menu (OT.R43), the front end hands it the session\'s options', () => {
  const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf-8');
  it('main.ts and matchMount.ts make it, run its pad first, draw it, start, reset and run RUN AND TALK through it', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).toContain('const startMenu = new StartMenu({');
      expect(s, f).toContain('const start = startMenu.pad(down, ');
      expect(s, f).toContain('const chat = taunts.pad(start.held, start.input);');
      expect(s, f).toContain('const menu = start.owns || ');
      expect(s, f).toContain('startMenu.draw(frame, sizes)');
      expect(s, f).toContain('startMenu.roundStart();');
      expect(s, f).toContain('startMenu.reset();');
      expect(s, f).toContain('runAndTalk: () => startMenu.runAndTalk(),');
      expect(s, f).toContain('runAndTalk: startMenu.runAndTalk() }');
      expect(s, f).toContain('voiceMask: (on) => { taunts.headset.setVoiceMask(on); },');
      expect(s, f).toContain('opened: () => { taunts.reset(); },');
    }
    expect(src('matchMount.ts')).toContain('startMenu.dispose();');
    expect(src('matchMount.ts')).toContain('startMenuOptions?: StartMenuOptions;');
    expect(src('main.ts')).toContain('matchOptions(() => ({ ...playOptionsOf(startMenuOptions), stick: (pageOptions ? playOptionsOf(pageOptions.globals, pageOptions.uiVars) : cardReads.options()).stick }))');   // OT.R72: the look stick, live Options' or the card's
    // PR #765 (1c137a989's pin, adapted to mega): without native Options, the card's look stick follows the shared editor's live
    // preset and tuners -- composed in `playerSettings.ts` `pageCardReads` (mega's home for the test room's card reads), not main.ts.
    expect(src('playerSettings.ts')).toContain('return composed ??= { ...options, stick: lookStickOf(stickPresetOf(valves), stickVars(tuners)) };');
    expect(src('main.ts')).toContain('startMenu.teardown(); localMenuOptions.clear();');   // MLS.R2: only the pre-editor local fallback clears; applied native state survives
  });
  it('MATCH-02: both mounts make the abort, hand it the menu\'s YES and the talk gate, tick it after the menu\'s pad and reset it', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).toContain('const matchAbort = new MatchAbort();');
      expect(s, f).toContain('aborting: () => matchAbort.aborting(),');
      expect(s, f).toContain('abort: () => { matchAbort.abort(); },');
      expect(s, f).toContain('matchAbort.reset();');
      expect(s.indexOf('const matchAbort = new MatchAbort();'), f).toBeLessThan(s.indexOf('const taunts = mountTaunts({'));
    }
    const mount = src('matchMount.ts');
    expect(mount).toContain("import { MatchAbort } from './matchAbort';");
    expect(mount).toContain('const start = startMenu.pad(down, mergeInput(touch.input, pad), dt);   // MATCH-01: the START menu first; up, the pad is its own\n    matchAbort.frame(dt);');
    expect(mount).toContain('ended: () => matchAbort.ended() ?? endedDialog ?? (net ? null : finalCloseDialog(o.client)),');
    const page = src('main.ts');
    expect(page).toContain("import { abortLines, MatchAbort } from './matchAbort';");
    expect(page).toContain('if (matchAbort.frame(dt)) { net?.close(); for (const line of abortLines(false)) hud.postMessage(line); }');
    expect(page.indexOf('const start = startMenu.pad(down, input, dt);')).toBeLessThan(page.indexOf('if (matchAbort.frame(dt))'));
  });
  it('MATCH-02 review F1: /testroom forgets the abort at every connectNet -- a rejoin on the same map (the reCOM switch, the online choice) starts clean', () => {
    const page = src('main.ts');
    const at = page.indexOf('function connectNet(map: LoadedMap): void {');
    const body = page.slice(at, page.indexOf('\n}\n', at));
    expect(at).toBeGreaterThan(0);
    // #395 review F1: connectNet's teardown is `leaveRoom`, which it calls first
    expect(body).toContain('leaveRoom();');
    const leave = page.slice(page.indexOf('function leaveRoom(): void {'), page.indexOf('\n}\n', page.indexOf('function leaveRoom(): void {')));
    expect(leave).toContain('matchAbort.reset();');
    // The two rejoins that run connectNet without `show(map)` (the review's finding): the reset must not be show's alone.
    expect(page).toContain('if (was !== on && loaded) connectNet(loaded);');
    expect(page).toContain('if (loaded) connectNet(loaded);');
  });
  it('frontEnd.ts hands the match the session\'s globals and valves (sessionStartMenuOptions)', () => {
    const s = src('frontEnd.ts');
    expect(s).toContain('sessionStartMenuOptions(() => current.options, () => current.opener.valves)');
    expect(s).toMatch(/textLine, startMenuOptions, settings(?:, gameVars: [^\n]*)? \}\);/);   // MLS.R7: isolated Options host alongside the existing START store
  });
});

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const ELF = DISC ? resolve(DISC, 'socom2_game.elf') : null;

describe.skipIf(!ELF || !existsSync(ELF))('MATCH-01 on the disc (SOCOM_DISC): the ELF\'s literals and HudCLOC\'s strings', () => {
  it('each code label at its address in the ELF', async () => {
    const { ElfImage } = await import('../../../tools/elfImage');
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF!)));
    const at: [number, string][] = [
      [0x3e3b20, START_MENU_TEXT.spectatorHudOn], [0x3e3b40, START_MENU_TEXT.spectatorHudOff],
      [0x3e3b60, START_MENU_TEXT.voiceModulationOn], [0x3e3b80, START_MENU_TEXT.voiceModulationOff],
      [0x3e3ba0, START_MENU_TEXT.fireModeScoreboardAlternate], [0x3e3bc0, START_MENU_TEXT.fireModeScoreboardDefault],
      [0x3e3be0, START_MENU_TEXT.fireModeTacmapAlternate], [0x3e3c00, START_MENU_TEXT.fireModeTacmapDefault],
      [0x3e3c20, START_MENU_TEXT.runAndTalkOn], [0x3e3c40, START_MENU_TEXT.runAndTalkOff],
      [0x3e3c58, START_MENU_TEXT.vibrationOn], [0x3e3c68, START_MENU_TEXT.vibrationOff],
      [0x3e3c80, START_MENU_TEXT.textMessagesOn], [0x3e3ca0, START_MENU_TEXT.textMessagesOff],
      [0x3e3d48, START_MENU_SOUNDS.select], [0x3e3d58, START_MENU_SOUNDS.slide], [0x3e3e00, START_MENU_TEXT.missing],
    ];
    for (const [va, text] of at) expect(elf.cstr(va)).toBe(text);
    expect(elf.cstr(0x3e3cc0)).toBe(START_MENU_TEXT.accept);   // 0xa6, the cross glyph (`FONT_SPECIAL_01`)
    expect(elf.cstr(0x3e3cd0)).toBe(START_MENU_TEXT.back);     // 0xac, the triangle glyph
    expect(elf.cstr(0x3f6328)).toBe('ComeFromLan');
    expect(elf.cstr(0x3e3db8)).toBe('VoiceMask');
    // The colours' static initialiser (0x3fdb20-0x3fdbbc): lui of the floats' high halves.
    const hi = (va: number): number => elf.u32(va) & 0xffff;
    expect([hi(0x3fdb20), hi(0x3fdb2c), hi(0x3fdb3c)]).toEqual([0x4130, 0x41a8, 0x41c0]);   // 11, 21, 24
    expect([hi(0x3fdb4c), hi(0x3fdb34), hi(0x3fdb58)]).toEqual([0x420c, 0x424c, 0x4260]);   // 35, 51, 56
    expect([hi(0x3fdb68), hi(0x3fdb74)]).toEqual([0x4234, 0x4280]);                         // 45, 64
    // DAT_003dc420 2.0 (the lockout), DAT_003dc428 3.0, DAT_003dc430 0.2 (the repeat), DAT_003dc418 -1 (no blink).
    expect([elf.u32(0x3dc420), elf.u32(0x3dc428), elf.u32(0x3dc430), elf.u32(0x3dc418)]).toEqual([0x40000000, 0x40400000, 0x3e4ccccd, 0xbf800000]);
    // The initial bytes: DAT_003dc3e0 (SPECTATOR HUD) 1, DAT_003df1a8 (VOICE MODULATION) 1, DAT_003de620 (EXTERNAL WHISPERS) 1.
    // This is r0001's own data (the disc's ELF): VOICE MODULATION's 1 is r0001's, superseded by r0004's .bss 0 (OT.R97,
    // R4B-02; `VOICE_MODULATION_INITIAL_READING`, research 375).
    expect([elf.u32(0x3dc3e0) & 0xff, elf.u32(0x3df1a8) & 0xff, elf.u32(0x3de620) & 0xff]).toEqual([1, 1, 1]);
    expect(START_MENU_LOCKOUT_SECONDS).toBe(2);
    expect(START_MENU_REPEAT_SECONDS).toBeCloseTo(0.2, 6);
  });

  it('R4B-02 (OT.R97): global_valves.rdr holds VoiceMask at 0, PERSIST -- what r0004\'s StoreOptions reads on a fresh card', async () => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { readGlobalValves } = await import('../src/originalOptions');
    const rows = await readGlobalValves(new FsAssetSource(DISC!));
    expect(rows.filter((r) => r.name === 'VoiceMask')).toEqual([expect.objectContaining({ name: 'VoiceMask', value: VOICE_MASK_VALVE_DEFAULT })]);
    expect(rows.find((r) => r.name === 'VoiceMask')?.type).toBe('PERSIST');
  });

  it('the HudCLOC ids the rows carry name the strings the test above takes', async () => {
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { parseRdr, readZarMembers } = await import('@s2u/archive');
    const { tauntCaptions } = await import('../src/tauntData');
    const b = (await readZarMembers(new FsAssetSource(DISC!), 'RUN/READERC.ZAR', ['HudCLOC.rdr'])).get('HudCLOC.rdr')!;
    const c = tauntCaptions(parseRdr(b));
    for (const [id, text] of Object.entries(CAPTIONS)) expect(c[id]).toBe(text);
  });
});

describe.skipIf(!ELF || !existsSync(ELF))('MATCH-02b on the disc (SOCOM_DISC): the menu\'s draw, the title\'s strings, and every map\'s description', () => {
  it('the menu\'s draw FUN_002015a0 (its vtable 0x405320\'s +0xc, raw MIPS): the shade, then +0xc70 alone while +0xbdc is set, else +0x220 and the twelve rows', async () => {
    const { ElfImage } = await import('../../../tools/elfImage');
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF!)));
    // `CZPauseTest`'s vtable (set by `FUN_00205800` D:L62333): +0xc the draw the HUD's frame calls (`FUN_001ebed0`
    // D:L50876-50877), +0x18 / +0x1c the hide and show (`FUN_00201590` D:L60713-60718; 0x201580: +0xbc0 1, `j` the box's show).
    expect([elf.u32(0x405320 + 0xc), elf.u32(0x405320 + 0x18), elf.u32(0x405320 + 0x1c)]).toEqual([0x2015a0, 0x201590, 0x201580]);
    const at = (va: number): number => elf.u32(va);
    expect(at(0x2015b8)).toBe(0x90830bc0);   // lbu v1, 0xbc0(a0): open?
    expect(at(0x2015c8)).toBe(0x90239080);   // lbu v1, -0x6f80(at): DAT_00409080 (the close's fade), else return
    expect([at(0x2015d8), at(0x2015dc)]).toEqual([0x8e59003c, 0x26440030]);   // the shade +0x30's draw (its vtable +0x3c)
    expect([at(0x2015ec), at(0x2015f0)]).toEqual([0x92420bdc, 0x10400009]);   // lbu v0, 0xbdc(s2); beq v0, zero -> 0x201618
    expect([at(0x2015f8), at(0x201608), at(0x20160c)]).toEqual([0x8e590c7c, 0x26440c70, 0x1000001a]);   // +0xc70's draw, then b 0x201678 (return)
    expect([at(0x201618), at(0x20161c)]).toEqual([0x8e59022c, 0x26440220]);   // else +0x220's draw (the boxes, title, bar, prompts)
    expect([at(0x201654), at(0x201668)]).toEqual([0x8c99000c, 0x2a03000c]);   // then each row's own draw, s0 < 12
    expect(at(0x201688)).toBe(0x03e00008);   // jr ra
  });

  it('the title\'s strings: `mission.rdr` and its `description`, the default, the builder\'s stand-in', async () => {
    const { ElfImage } = await import('../../../tools/elfImage');
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF!)));
    expect(elf.cstr(0x3f19d0)).toBe('mission.rdr');                 // FUN_002acc10 D:L152347
    expect(elf.cstr(0x3f13e0)).toBe('description');                 // FUN_002aab20 D:L151313
    expect(elf.cstr(0x3f0a30)).toBe(START_MENU_TITLE_MISSING);       // D:L151314-151316
    expect(elf.cstr(0x3e3d70)).toBe('MISSION NAME');                // the builder's, replaced at each open (D:L61408, D:L62129-62131)
  });

  it('every MP map\'s `mission.rdr` description (the archive reader): none a `_` key, so the title is the description as it stands; MP72 CROSSROADS', async () => {
    const { closeSync, openSync, readSync, statSync } = await import('node:fs');
    const { FsAssetSource } = await import('@s2u/archive/node');
    const { listMaps } = await import('@s2u/archive');
    // The disc's directory, read by range (as the player's image is): each archive's header, TOC and READERM.ZAR only.
    const fs = new FsAssetSource(DISC!);
    const ranged = {
      list: () => fs.list(), read: (p: string) => fs.read(p),
      size: async (p: string) => statSync(resolve(DISC!, p)).size,
      readRange: async (p: string, offset: number, length: number) => {
        const fd = openSync(resolve(DISC!, p), 'r');
        try { const b = new Uint8Array(length); readSync(fd, b, 0, length, offset); return b; } finally { closeSync(fd); }
      },
    };
    const problems: string[] = [];
    const maps = await listMaps(ranged as never, (path, message) => problems.push(`${path}: ${message}`));
    expect(problems).toEqual([]);
    expect(maps.length).toBe(22);
    for (const m of maps) expect(m.name.startsWith('_'), m.archive).toBe(false);
    for (const m of maps) expect(startMenuTitle(m.name), m.archive).toBe(m.name);
    expect(maps.find((m) => m.archive === 'MP72')?.name).toBe('CROSSROADS');
    const r = rig({}, { title: () => maps.find((m) => m.archive === 'MP72')!.name });
    r.open();
    expect(r.menu.drawnState().title).toBe('CROSSROADS');
  }, 60_000);
});
