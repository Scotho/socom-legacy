import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { CardSlots, Libmc, PersonaCard, type CardStorage } from '@s2u/card';
import { parseAnimSets } from '@s2u/scene';
import { dialogLookup, OPTIONS_MENU, type PadSlotName, type ZAnimUiCommand } from '@s2u/ui';
import { ControllerConfigs } from '../src/controllerConfigs';
import type { FrontEndDisc } from '../src/frontEnd';
import {
  IN_ROUND_SWITCH_ADAPTATION, NativeOptionsHost, OPTIONS_RETURN_WAIT_ADAPTATION, SAVE_CHAIN_WAITS_ADAPTATION,
} from '../src/nativeOptionsHost';
import { pageNativeOptionsState } from '../src/nativeOptionsState';

/**
 * WM-OPTIONS-EXIT (product track; a browser adaptation, the controller's ruling 8f): in a round (`saveOnReturn`, the
 * in-match Settings, whose save chain and fades the port hides) RETURN and the page switches do not wait on what the
 * player cannot see. The front end (the class's default) keeps every one of the original's waits.
 * The disc's own fixtures (READERC.ZAR's dialogs, UIZANIM.ZAR's scripts): the waits are the scripts' own.
 */
/** The disc's committed front-end fixtures; the public export does not carry socomlegacy/test-fixtures, and there the tests that need them skip, said. */
const READERC = fixture('RUN/UI/READERC.ZAR'), UIZANIM = fixture('RUN/UIZANIM.ZAR');
const HAVE = READERC !== null && UIZANIM !== null;
const ABSENT = HAVE ? '' : ` (${FIXTURES_ABSENT})`;
const disc: FrontEndDisc = {
  dialog: HAVE ? dialogLookup([Zar.parse(READERC!)]) : () => null,
  sets: HAVE ? parseAnimSets(Zar.parse(UIZANIM!)).sets : [],
  faces: [], captions: null, loader: {}, missing: [],
  globalValves: [{ name: 'INVERT_PITCH_CONTROLLER', value: 0, type: 'PERSIST' }, { name: 'BOBBING_1ST_PERSON', value: 1, type: 'PERSIST' }, { name: 'stick_preset', value: 0, type: 'PERSIST' }],
};
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand => ({ anim: 'test', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x18) });
const VIDEO = 'dlgOptions_Video.rdr';

/** A card that counts its writes. */
class Storage implements CardStorage {
  data = new Map<string, string>();
  writes = 0;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.data.set(key, value); }
}

function rig(saveOnReturn: boolean, storage: CardStorage | null = new Storage()) {
  const slots = new CardSlots(() => storage, () => {});
  const state = pageNativeOptionsState(disc, slots, new ControllerConfigs());
  const s = new NativeOptionsHost({ disc, textures: () => null }, state, null, { saveOnReturn });
  const log: string[] = [];
  const dispatch = s.host.dispatch.bind(s.host);
  s.host.dispatch = (c, t) => { const o = dispatch(c, t); log.push(`${c.fn}(${c.arg})`); return o; };
  let now = 0;
  s.frame(now);
  /** One frame per 1/30 s, its result (false: Settings closed). */
  const frame = (down: PadSlotName[] = []) => s.frame(now += 1000 / 30, { down: new Set(down), stickX: 0, stickY: 0 });
  const frames = (n = 90, down: PadSlotName[] = []) => { for (let i = 0; i < n; i++) frame(down); };
  const press = (button: PadSlotName, n = 90) => { frames(1, [button]); frames(n); };
  const focus = (name: string) => { for (let i = 0; i < 24 && s.input.ring()?.focused?.name !== name; i++) press('DOWN', 2); expect(s.input.ring()?.focused?.name).toBe(name); };
  const open = (name: string) => { s.host.dispatch(cmd('SwitchMenu', name)); frames(); expect(s.shell.currentName).toBe(name); };
  frames();
  /** VIDEO's HEAD BOB toggled (BOBBING_1ST_PERSON 1 -> 0), then VIDEO's RETURN to OPTIONS, run out. */
  const changeVideo = () => { open(VIDEO); focus('headbobbing'); press('RIGHT'); expect(state.valves.find('BOBBING_1ST_PERSON')?.value).toBe(0); focus('SaveAndLeaveBtn'); press('CROSS'); expect(s.shell.currentName).toBe(OPTIONS_MENU); };
  const visitVideo = () => { open(VIDEO); focus('SaveAndLeaveBtn'); press('CROSS'); expect(s.shell.currentName).toBe(OPTIONS_MENU); };
  return { s, state, slots, log, frame, frames, press, focus, open, changeVideo, visitVideo };
}
const card = (slots: CardSlots) => { const c = new PersonaCard(new Libmc(slots, { log: () => {} }), 0); return c.load().result >= 0 ? c : null; };

describe.skipIf(!HAVE)(`WM-OPTIONS-EXIT: in a round the hidden waits are not waited (browser adaptation)${ABSENT}`, () => {
  it('names each skipped wait with the original value it skips', () => {
    expect(OPTIONS_RETURN_WAIT_ADAPTATION).toBe(1.5);
    expect([...SAVE_CHAIN_WAITS_ADAPTATION]).toEqual([1, 0.1, 0.2, 0.2]);
    expect(IN_ROUND_SWITCH_ADAPTATION).toEqual({ fadePerSecond: 2, countdownFrames: 3 });
  });

  it('RETURN with nothing changed closes on the press frame and writes nothing to the card', () => {
    const storage = new Storage();
    const r = rig(true, storage);
    r.visitVideo();
    r.focus('SaveAndLeaveBtn');
    const writes = storage.writes;
    expect(r.frame(['CROSS'])).toBe(false);
    expect(r.log).not.toContain('StoreOptions(NA)');
    expect(storage.writes).toBe(writes);
    expect(storage.writes).toBe(0);
    r.s.close();
  });

  it('RETURN with a change: stored, the disc\'s card save run, then closed -- all on the press frame', () => {
    const storage = new Storage();
    const r = rig(true, storage);
    r.changeVideo();
    r.focus('SaveAndLeaveBtn');
    r.log.length = 0;
    expect(r.frame(['CROSS'])).toBe(false);
    const store = r.log.indexOf('StoreOptions(NA)'), save = r.log.indexOf('SaveConfig(BASCUS-97275SOCOMII)');
    const leave = r.log.indexOf('SWITCHMENU(dlgMenu.rdr)');
    expect(store).toBeGreaterThanOrEqual(0);
    expect(save).toBeGreaterThan(store);
    expect(leave).toBeGreaterThan(save);                                   // the close follows the save's completion
    expect(r.state.globals.value('BOBBING_1ST_PERSON')).toBe(0);
    expect(card(r.slots)?.part('CValveSaveManager')).toMatchObject({ BOBBING_1ST_PERSON: 0 });
    r.s.close();
  });

  it('the card is the same as the front end\'s answered save: same keys, same values, no new stored setting', () => {
    const fast = new Storage(), slow = new Storage();
    const a = rig(true, fast);
    a.changeVideo(); a.focus('SaveAndLeaveBtn');
    expect(a.frame(['CROSS'])).toBe(false);
    a.s.close();
    const b = rig(false, slow);
    b.changeVideo(); b.focus('SaveAndLeaveBtn'); b.press('CROSS');
    expect(b.s.popups.shown(b.s.shell.screen)).toBe(true);               // #831, answered YES; #830, slot 1
    b.press('CROSS'); b.press('CROSS');
    for (let i = 0; i < 300 && b.frame(); i++);
    expect(b.frame()).toBe(false);
    b.s.close();
    expect([...fast.data.keys()].sort()).toEqual([...slow.data.keys()].sort());
    const timeless = (v: string | undefined) => v?.replace(/"mtime":\d+/g, '"mtime":0');   // the card's wall-clock file times
    for (const [key, value] of slow.data) expect(timeless(fast.data.get(key)), key).toBe(timeless(value));
  });

  it('a second press does nothing extra: one save, no second close; the round\'s close after it is clean', () => {
    const storage = new Storage();
    const r = rig(true, storage);
    r.changeVideo(); r.focus('SaveAndLeaveBtn');
    r.log.length = 0;
    expect(r.frame(['CROSS'])).toBe(false);
    const writes = storage.writes;
    expect(r.frame(['CROSS'])).toBe(false);
    expect(r.frame([])).toBe(false);
    expect(r.frame(['CROSS'])).toBe(false);
    expect(storage.writes).toBe(writes);
    expect(r.log.filter(l => l === 'SaveConfig(BASCUS-97275SOCOMII)')).toHaveLength(1);
    expect(r.log.filter(l => l === 'SWITCHMENU(dlgMenu.rdr)')).toHaveLength(1);
    expect(() => { r.s.close(); r.s.close(); }).not.toThrow();
    expect(r.s.parts.current).toBeNull();
  });

  it('a question it does not answer stops the hurry: no card says #860, drawn, and the round may end over it', () => {
    const r = rig(true, null);
    r.changeVideo(); r.focus('SaveAndLeaveBtn');
    r.frame(['CROSS']);
    let shown = false;
    for (let i = 0; i < 300 && !shown; i++) { r.frame(); shown = r.s.popupDrawn(); }
    expect(shown).toBe(true);
    expect((r.s.parts.current?.popup()?.popup as unknown as { textId: number }).textId).toBe(860);
    expect(r.frame(['CROSS'])).toBe(true);                                 // the player's own question: still open
    expect(() => r.s.close()).not.toThrow();
    expect(r.frame(['CROSS'])).toBe(false);
  });

  // The review's F1: the original's SuspendMenuInput(2.0) kept a held RETURN press from reaching the next question; a
  // hurried chain must not invent the release either. A press held into #860 leaves it up until a release, then a press.
  it.each([2, 4, 6])('CROSS held %i frames into #860: it stays up until a real release and a new press', (held) => {
    const r = rig(true, null);
    r.changeVideo(); r.focus('SaveAndLeaveBtn');
    const showing860 = () => r.s.popupDrawn() && (r.s.parts.current?.popup()?.popup as unknown as { textId: number } | undefined)?.textId === 860;
    for (let i = 0; i < held; i++) { expect(r.frame(['CROSS'])).toBe(true); expect(showing860(), `held frame ${i + 1}`).toBe(true); }
    for (let i = 0; i < 10; i++) { r.frame(); expect(showing860(), `released frame ${i + 1}`).toBe(true); }
    r.frame(['CROSS']);
    r.frames(30);
    expect(showing860()).toBe(false);                                     // the player's own press answers it
    r.s.close();
  });

  it('a later gate that takes the start of RETURN: nothing is hurried (the review N2)', () => {
    const r = rig(true);
    r.changeVideo(); r.focus('SaveAndLeaveBtn');
    r.s.host.setBindingGate('a-later-gate', b => b.animation === 'check_then_save_and_leave');
    let ticks = 0;
    const tick = r.s.shell.tick.bind(r.s.shell);
    r.s.shell.tick = (dt: number) => { ticks++; tick(dt); };
    expect(r.frame(['CROSS'])).toBe(true);
    expect(ticks).toBe(1);
    expect(r.log).not.toContain('StoreOptions(NA)');
    r.s.close();
  });

  it('VIDEO <-> OPTIONS: no fade wait and no countdown -- each switch lands on its frame', () => {
    const r = rig(true);
    r.focus('VideoOpBtn');
    const states = new Set<number>();
    r.frame(['CROSS']); states.add(r.s.shell.switchState);
    expect(r.s.shell.currentName).toBe(VIDEO);
    expect(r.s.shell.design).toEqual(disc.dialog(VIDEO));
    r.frames(30); r.focus('SaveAndLeaveBtn');
    r.frame(['CROSS']); states.add(r.s.shell.switchState);
    expect(r.s.shell.currentName).toBe(OPTIONS_MENU);
    expect(r.s.shell.design).toEqual(disc.dialog(OPTIONS_MENU));
    expect([...states]).toEqual([-1]);
    r.s.close();
  });
});

// The nativeSettings spec's failure on a loaded PC (Settings closed after a sub-page's RETURN): the instant switch
// (IN_ROUND_SWITCH_ADAPTATION) builds OPTIONS while the CROSS that pressed RETURN may still be down. That press must not
// act on OPTIONS: Settings stays open on OPTIONS and OPTIONS' RETURN chain never starts. Held 0 (released on the switch
// frame itself, the switch running on the press frame) and 1, 2, 4, 6 frames; frames of 1/30 s and slow ones (50, 100 ms).
describe.skipIf(!HAVE)(`WM-OPTIONS-EXIT: a sub-page RETURN press held across the instant switch lands on OPTIONS, open${ABSENT}`, () => {
  const pages: [string, string][] = [['AudioOpBtn', 'dlgOptions_Audio.rdr'], ['VideoOpBtn', VIDEO], ['ControlOpBtn', 'dlgControllerSelection.rdr']];
  for (const [button, page] of pages) for (const ms of [1000 / 30, 50, 100]) it.each([0, 1, 2, 4, 6])(`${page}, ${Math.round(ms)} ms frames: CROSS held %i frames`, (held) => {
    const r = rig(true);
    r.focus(button); r.press('CROSS'); expect(r.s.shell.currentName).toBe(page);
    r.focus('SaveAndLeaveBtn');
    let now = 1e6;
    r.s.frame(now);
    const f = (down: PadSlotName[]) => r.s.frame(now += ms, { down: new Set(down), stickX: 0, stickY: 0 });
    r.log.length = 0;
    const open: boolean[] = [];
    if (held === 0) { open.push(f(['CROSS'])); expect(r.s.shell.currentName).toBe(OPTIONS_MENU); }
    for (let i = 0; i < held; i++) open.push(f(['CROSS']));
    for (let i = 0; i < 60; i++) open.push(f([]));
    expect(open.every(o => o)).toBe(true);
    expect(r.s.shell.currentName).toBe(OPTIONS_MENU);
    expect(r.s.popups.shown(r.s.shell.screen)).toBe(false);
    expect(r.log).not.toContain('SWITCHMENU(dlgMenu.rdr)');               // OPTIONS' RETURN did not leave
    expect(r.log.some(l => l.startsWith('SaveConfig('))).toBe(false);      // and no save chain began
    expect(r.s.input.ring()?.focused?.name).not.toBe('SaveAndLeaveBtn');   // OPTIONS' focus on return is not its RETURN
    r.s.close();
  });
});

describe.skipIf(!HAVE)(`WM-OPTIONS-EXIT: the front end keeps every original wait (the class default)${ABSENT}`, () => {
  it('the switch: the fade, then the 3-frame countdown (MENU_SWITCH_COUNTDOWN)', () => {
    const r = rig(false);
    r.focus('VideoOpBtn');
    const seen: number[] = [];
    r.frame(['CROSS']);
    for (let i = 0; i < 60; i++) { r.frame(); if (seen.at(-1) !== r.s.shell.switchState) seen.push(r.s.shell.switchState); }
    expect(seen).toEqual([3, 2, 1, 0, -1]);
    expect(r.s.shell.currentName).toBe(VIDEO);
    r.s.close();
  });

  it('RETURN with nothing changed: the script\'s WAIT 1.5 s before it leaves', () => {
    const r = rig(false);
    r.visitVideo(); r.focus('SaveAndLeaveBtn');
    r.frame(['CROSS']);
    let n = 1;
    while (n < 120 && r.frame()) n++;
    expect(n).toBe(44);                                                    // the press frame, then the WAIT 1.5 s's ticks
    r.s.close();
  });

  it('RETURN with a change: #831 asked after the same WAIT 1.5 s', () => {
    const r = rig(false);
    r.changeVideo(); r.focus('SaveAndLeaveBtn');
    r.frame(['CROSS']);
    let n = 1;
    while (n < 120 && !r.s.popups.shown(r.s.shell.screen)) { r.frame(); n++; }
    expect(n).toBe(46);                                                    // the WAIT 1.5 s, then save_and_leave's PopUpDialog
    r.s.close();
  });
});
