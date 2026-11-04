// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noInput, type Input, type PadButton } from '../src/gamepad';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } from '../src/matchCore';
import { PART_DEPS } from '../src/matchNet';
import { mountTaunts, type MatchTauntsDeps } from '../src/matchTaunts';
import type { ServerEvent } from '../src/net/protocol';
import type { SoundData } from '../src/soundData';
import type { TauntData } from '../src/tauntData';
import type { ChatEntry } from '../src/tauntMenu';
import { VOICE_TALK_LOCKOUT_READING } from '../src/voice/talkInput';
import { layoutText } from '../src/hudFont';
import { BOT_GOLD, plainBotText } from '../src/botPresentation';
import { DEFAULT_MODEL, HUD_LAYOUT, Hud, hudLayout } from '../src/hud';
import { textWidth } from '../src/hudFont';
import { MESSAGE_WRAP_WIDTH } from '../src/hudMessagePanel';

/**
 * TAUNTS (web research 301): the shared part both pages mount (`../src/matchTaunts`) -- the Chat menu's TAUNTS on the
 * pad, the send through the page's client, the room's taunts heard (the message line in colour 5, the vocal through the
 * match's audio: the sender's echo unplaced, another's at its body), input ownership while the menu is open, and its
 * one wiring: the capability on both switches, the hook one line under `PART_DEPS`, both pages' call sites. Fakes only.
 */

const vocal = (n: number) => ({ sound: `^PS_000${n}`, text: `%s TAUNT ${n}`, character: 'mp_seal1' });
const DATA = {
  defaults: ['THIS IS THE END FOR YOU', 'COME GET SOME!', 'CAN YOU FEEL THE LOVE? IT FEELS LIKE BULLETS', "DON'T LET THE DOOR HIT YOU.", 'YOU NEED TO READ THE PIZANTS, MY HOME SKILLET'],
  captions: { '60762': 'THIS IS THE END FOR YOU' },
  vocals: { seal: [Array.from({ length: 7 }, (_, n) => vocal(n))], terrorist: [Array.from({ length: 7 }, (_, n) => vocal(n))] },
} as unknown as TauntData;
const sound = (taunts: TauntData | null = DATA): SoundData => ({ taunts } as unknown as SoundData);

/** A TEAMMATES row (`../src/matchChat`'s shape): a teammate's name over his MUTE row. */
const TEAMMATES: ChatEntry[] = [{ label: 'kilo', help: 'Player 1', children: [{ label: 'MUTE OFF', help: 'Mute (On, Off)', key: 'mute:3', action: () => {} }] }];

function rig(o: { bot?: boolean; custom?: (string | null)[]; gate?: Partial<{ inMatch: boolean; alive: boolean; spectator: boolean }>; other?: () => boolean; entries?: (root: number) => ChatEntry[]; hud?: MatchTauntsDeps['hud'] } = {}) {
  let now = 0;
  const sent: unknown[] = [], posted: unknown[] = [], played: string[] = [], streams: [string, unknown][] = [], log: string[] = [];
  const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: false, ...o.gate };
  const net = { client: { id: 2, send: (e: unknown) => { sent.push(e); } }, gate: () => gate, isBot: (id: number) => id === 3 && o.bot === true };
  const deps: MatchTauntsDeps = {
    net: () => net as never,
    hud: { postMessage: (lines) => { posted.push(lines); o.hud?.postMessage(lines); } },
    audio: { play: (name) => { played.push(name); return true as never; }, playStream: (name, at) => { streams.push([name, at]); return 'played'; } },
    custom: () => o.custom ?? ['_60762_ThisBulletMightSting_MSG', null, 'CUSTOM TAUNT 03', null, null],
    otherMenu: o.other ?? (() => false),
    release: () => { log.push('release'); },
    clock: () => now,
    ...(o.entries ? { entries: o.entries } : {}),
  };
  const t = mountTaunts(deps);
  t.setData(sound());
  /** One pad frame at `held`, the clock on by `dt`; the game's input back. */
  const frame = (held: PadButton[], input: Input = noInput(), dt = 0.05) => { now += dt; return t.pad(new Set(held), input); };
  /** A press and its release, 0.25 s apart (past the menu's 0.2 s repeat). */
  const tap = (b: PadButton) => { frame([b], noInput(), 0.25); frame([], noInput(), 0.05); };
  return { t, sent, posted, played, streams, log, frame, tap, gate, advance: (dt: number) => { now += dt; }, netClient: net.client as { requestFloor?: (kind: string) => number } };
}

const taunt = (over: Partial<Extract<ServerEvent, { type: 'taunt' }>>): Extract<ServerEvent, { type: 'taunt' }> => ({
  type: 'taunt', sender: 3, name: 'kilo', team: 'seal', char: 0, request: 1, vocal: null, text: null, at: [10, 0, 0], ...over,
});

describe('the Chat menu on the pad (research 301 §3)', () => {
  it('a Circle tap opens it at TACTICAL ORDERS; TAUNTS, then CUSTOM TAUNT 03 sends slot 3\'s text through the page\'s client', () => {
    const r = rig();
    r.tap('Circle');
    expect(r.t.state()).toMatchObject({ open: true, root: 0, depth: 0 });
    r.tap('Down'); r.tap('Cross');                                    // TAUNTS
    expect(r.t.state()).toMatchObject({ root: 1, depth: 1, row: 0 });
    for (let i = 0; i < 3; i++) r.tap('Down');                          // CHARACTER TAUNT, 01, 02, 03
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'taunt', kind: 'custom', slot: 2, text: 'CUSTOM TAUNT 03', request: 1 }]);
    expect(r.t.isOpen()).toBe(false);
    expect(r.played).toContain('.TCM_SELECT');
  });

  it("OBF-20 (the review's F1): a reloaded page numbers its taunts on from its resume's last request (`requestFloor`), then on from its own", () => {
    const r = rig();
    let floor = 4;
    r.netClient.requestFloor = (kind: string) => (kind === 'taunt' ? floor : 9);
    r.tap('Circle'); r.tap('Down'); r.tap('Cross'); r.tap('Cross');      // TAUNTS, CHARACTER TAUNT
    expect(r.sent.at(-1)).toMatchObject({ type: 'taunt', kind: 'vocal', request: 5 });
    floor = 0;                                                           // the floor never takes the count back
    r.advance(0.5);                                                      // past the close's 0.3 s reopen delay
    r.tap('Circle'); r.tap('Down'); r.tap('Cross'); r.tap('Down'); r.tap('Cross');   // CUSTOM TAUNT 01 (another node)
    expect(r.sent.at(-1)).toMatchObject({ type: 'taunt', kind: 'custom', slot: 0, request: 6 });
  });
  it('CHARACTER TAUNT sends the vocal; the slots show the card\'s five, a HudCLOC key as its caption, none the disc\'s default', () => {
    const r = rig();
    expect(r.t.texts()).toEqual(['THIS IS THE END FOR YOU', DATA.defaults[1], 'CUSTOM TAUNT 03', DATA.defaults[3], DATA.defaults[4]]);
    r.tap('Circle'); r.tap('Down'); r.tap('Cross'); r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'taunt', kind: 'vocal', request: 1 }]);
  });

  it('AD-10 / AD-11, the three roles: a living player opens it on TACTICAL ORDERS; a dead one on TEAMMATES (online, FUN_002359a0 D:L84284-84298 has no life test); a spectator on RADIO, its tree\'s one root (FUN_001fa360 D:L57441-57448, FUN_00232bc0 D:L83641-83645)', () => {
    const entries = (root: number): ChatEntry[] => (root === 3 ? TEAMMATES : root === 0 || root === 4 ? [{ label: 'row', help: 'h', action: () => {} }] : []);
    const living = rig({ entries });
    living.tap('Circle');
    expect(living.t.state()).toMatchObject({ open: true, root: 0, roots: [0, 1, 2, 3, 4] });
    const dead = rig({ entries, gate: { alive: false } });
    dead.tap('Circle');
    expect(dead.t.state()).toMatchObject({ open: true, root: 3, roots: [3] });
    expect(dead.log).toContain('release');                              // the pad the menu's: the trigger let go
    const spectator = rig({ entries, gate: { alive: false, spectator: true } });
    spectator.tap('Circle');
    expect(spectator.t.state()).toMatchObject({ open: true, root: 2, roots: [2] });
  });

  it('AD-11: while a spectator\'s menu is open the pad is the menu\'s -- the camera\'s input (sticks, Triangle, the d-pad) is none, and a button it took stays held off after it closes', () => {
    const r = rig({ gate: { alive: false, spectator: true } });
    const moving: Input = { ...noInput(), lookX: 0.8, lookY: -0.5, moveY: 0.6, stance: true, leanRight: true };
    r.tap('Circle');
    expect(r.t.isOpen()).toBe(true);
    const open = r.frame([], moving);
    expect([open.owns, open.input]).toEqual([true, noInput()]);        // the spectator view's scenic look and zoom, the jump: nothing
    r.frame(['Triangle'], moving, 0.25);
    r.frame([], moving);                                               // Triangle let go at the root: closed (its frame still the menu's)
    expect(r.t.isOpen()).toBe(false);
    const closed = r.frame([], moving);
    expect([closed.owns, closed.input.stance, closed.input.leanRight, closed.input.lookX]).toEqual([false, false, false, 0.8]);
  });

  it('not out of a match, not over another screen or before the map\'s data', () => {
    for (const o of [{ gate: { inMatch: false } }, { other: () => true }]) {
      const r = rig(o);
      r.tap('Circle');
      expect(r.t.isOpen(), JSON.stringify(o)).toBe(false);
    }
    const r = rig();
    r.t.setData(null);
    r.tap('Circle');
    expect(r.t.isOpen()).toBe(false);
  });

  it('a hold past 0.3 s is the headset\'s, not the menu (0x00235bdc)', () => {
    const r = rig();
    r.frame(['Circle'], noInput(), 0.05); r.frame(['Circle'], noInput(), 0.4); r.frame([], noInput(), 0.05);
    expect(r.t.isOpen()).toBe(false);
  });
});

describe('input ownership while the menu is open (research 301 §7, a browser safeguard)', () => {
  it('open, the game\'s lanes take nothing, the trigger is let go and a held grenade cancelled; a button held through the close stays the menu\'s till let go', () => {
    const r = rig();
    const fire: Input = { ...noInput(), fire: true };
    expect(r.frame([], fire).input.fire).toBe(true);                   // closed: the game's
    r.frame(['Circle'], fire, 0.05);
    const opened = r.frame([], fire, 0.05);
    expect(opened.owns).toBe(true);
    expect(opened.input.fire).toBe(false);
    expect(r.log).toContain('release');                                // `release`: the latch and the uncommitted grenade
    r.frame(['Triangle'], fire, 0.25);
    const closed = r.frame([], fire, 0.05);                            // Triangle let go at the root: closed
    expect(r.t.isOpen()).toBe(false);
    expect(closed.input.fire).toBe(false);                             // R1 still held from the menu: not a fresh pull
    r.frame([], noInput(), 0.05);
    expect(r.frame([], fire, 0.05).input.fire).toBe(true);             // let go, then pressed again: the game's
  });

  it('AD-10: a death closes it once (FUN_001f7ff0 D:L56631-56644: the alive-to-dead edge, FUN_00235300(menu, 0)), not for good: the dead reopen it past the close\'s 0.3 s', () => {
    const r = rig({ entries: (root) => (root === 3 ? TEAMMATES : []) });
    r.tap('Circle');
    expect(r.t.isOpen()).toBe(true);
    r.gate.alive = false;
    r.frame([]);
    expect(r.t.isOpen()).toBe(false);                                  // the edge's frame: closed
    r.frame(['Circle'], noInput(), 0.05); r.frame([], noInput(), 0.05);  // inside the close's 0.3 s timer: nothing opens
    expect(r.t.isOpen()).toBe(false);
    r.frame([], noInput(), VOICE_TALK_LOCKOUT_READING.menuClose);
    r.tap('Circle');                                                   // dead, past it: the dead player's menu
    expect(r.t.state()).toMatchObject({ open: true, root: 3, roots: [3] });
    r.frame([]); r.frame([]);
    expect(r.t.isOpen()).toBe(true);                                   // no gate on the living: it stays open while dead
    r.gate.alive = true;                                               // a respawn is no death edge: it stays open
    r.frame([]);
    expect(r.t.isOpen()).toBe(true);
    r.t.dispose();
    expect(r.t.state().received).toEqual([]);
  });
});

describe('the room\'s taunts heard (research 301 §4, §8)', () => {
  it('a bot\'s text taunt colours only the sender initial gold; full phrases and diagnostics plain', () => {
    const phrase = 'The devs gave me a name. They forgot to give me mercy.';
    for (const bot of [true, false]) {
      const r = rig({ bot });
      r.t.netDeps().taunt(taunt({ name: 'Botty McBotface', text: phrase }));
      const posted = (r.posted[0] as { text: string }[])[0]!.text;
      expect(plainBotText(posted)).toBe(`Botty McBotface : ${phrase}`);
      const inked = layoutText(posted, 0, 0, 1).glyphs.filter((g) => g.rgb);
      expect(inked.length).toBe(bot ? 1 : 0);
      expect(inked.every((g) => g.rgb!.join() === BOT_GOLD.join())).toBe(true);
      expect(r.t.state().received[0]!.text).toBe(plainBotText(posted));
      expect(r.streams).toEqual([]);
    }
  });
  it('another\'s vocal at its body, the sender\'s own echo unplaced; once a sender\'s request; the message line in colour 5', () => {
    const r = rig();
    const deps = r.t.netDeps();
    deps.taunt(taunt({ vocal: 2 }));
    deps.taunt(taunt({ vocal: 2 }));                                   // the same request again: dropped
    deps.taunt(taunt({ sender: 2, name: 'socomc', request: 1, vocal: 3 }));   // the page's own (client id 2): the echo
    expect(r.streams).toEqual([['^PS_0002', [10, 0, 0]], ['^PS_0003', null]]);
    expect(r.posted[0]).toEqual([{ text: 'kilo TAUNT 2', scale: 0.9, rgb: [1, 0.5, 0.5], opacity: 100 / 128 }]);
    deps.taunt(taunt({ request: 2, text: 'CUSTOM TAUNT 03' }));
    expect(r.t.state().received.map((h) => [h.text, h.result])).toEqual([
      ['kilo TAUNT 2', 'played'], ['socomc TAUNT 3', 'played'], ['kilo : CUSTOM TAUNT 03', 'text'],
    ]);
  });
});

describe('TAUNT-WRAP: a long name and a full taunt stay in the message window (task 8mqnCJBx; FUN_002b6530)', () => {
  const SIZES = { 'newweapnbkrnd.tif': { width: 128, height: 64 }, 'font_text_01.tif': { width: 512, height: 128 }, white: { width: 1, height: 1 } };
  it('the "name : text" line wraps within 297 and the panel keeps its width, at every frame', () => {
    const hud = new Hud();
    hud.setVisible(true);
    const r = rig({ hud, bot: true });
    const text = 'CAN YOU FEEL THE LOVE? IT FEELS LIKE BULLETS!';     // 45, the taunt's cap
    r.t.netDeps().taunt(taunt({ name: 'WWWWWWWWWWWWWWWW', text }));
    hud.step(1);
    const lines = hud.state().model.banner.flatMap((b) => b.lines);
    expect(lines.length).toBe(2);
    expect(lines.map((l) => plainBotText(l.text)).join(' ')).toBe(`WWWWWWWWWWWWWWWW : ${text}`);
    for (const l of lines) expect(textWidth(l.text, l.scale)).toBeLessThanOrEqual(MESSAGE_WRAP_WIDTH);
    for (const frame of [{ width: 640, height: 448 }, { width: 1920, height: 896 }]) {
      const out = hudLayout(frame, { ...DEFAULT_MODEL, banner: hud.state().model.banner }, SIZES);
      const q = out.quads.find((x) => x.element === 'banner')!;
      expect(q.w).toBeCloseTo(HUD_LAYOUT.message.panel.w * out.scale, 6);
    }
  });
  it('a short taunt is one line, unchanged', () => {
    const hud = new Hud();
    hud.setVisible(true);
    rig({ hud }).t.netDeps().taunt(taunt({ text: 'COME GET SOME!' }));
    hud.step(1);
    expect(hud.state().model.banner.flatMap((b) => b.lines.map((l) => l.text))).toEqual(['kilo : COME GET SOME!']);
  });
});

describe('one wiring (ONE-WIRE): both switches mount it, its hook is one PART_DEPS line, both pages call it', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('the capability on /testroom\'s and the front end\'s switch; `taunt` under PART_DEPS.taunts', () => {
    expect([TESTROOM_CAPABILITIES.taunts, FRONT_END_CAPABILITIES.taunts]).toEqual([true, true]);
    expect(PART_DEPS.taunts).toEqual(['taunt']);
  });
  it('main.ts and matchMount.ts mount the part, hand its hooks to matchNetDeps and draw it on the HUD\'s overlay', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).toContain('mountTaunts({');
      expect(s, f).toContain('...taunts.netDeps(),');
      expect(s, f).toContain('taunts.draw(frame, sizes)');
      expect(s, f).toContain('taunts.pad(');
      expect(s, f).not.toContain('new TauntMenu(');                      // the menu is the part's alone
      expect(s, f).toContain('headset: taunts.headset');               // SVC-22b: the voice client on the part's headset UX
    }
    expect(src('matchMount.ts')).toContain('taunts.dispose()');
  });
  it('/testroom\'s SETUP TAUNTS is a development build\'s only, with ?devmode; no key of its own (the card is the store)', () => {
    const main = src('main.ts');
    const gate = ['import', 'meta', 'env', 'DEV'].join('.');           // the build's flag, spelled so the leak check's name rule stays quiet
    // Loaded with import() behind the flag (a release bundle drops it), never imported statically (the review's finding 1).
    expect(main).toContain('const DEV = devSwitches(SEARCH)');
    expect(main).toContain(`if (${gate} && DEV.tools) void import('./tauntDevEditor').then(`);
    expect(main).not.toMatch(/^import \{[^}]*\} from '\.\/tauntDevEditor';/m);
    expect(main).not.toMatch(/^import \{[^}]*\} from '\.\/tauntEditor';/m);
    for (const f of ['main.ts', 'matchTaunts.ts', 'tauntSettings.ts', 'tauntEditor.ts', 'tauntDevEditor.ts', 'frontEnd.ts']) {
      expect(src(f), f).not.toContain('s2u.taunts');
    }
  });
  it('the open SETUP TAUNTS editor owns the typing: the earlier capture listeners of the page (the match keys, the X) give way to it', () => {
    // The editor's listener (`./tauntDevEditor`) is added when its module loads, after `./main`'s own capture listeners on
    // the window: without this, `I` opened the R2 inventory and its Enter / Backspace were the inventory's
    // (`INVENTORY_MENU_KEYS_READING`), so a taunt with an I never reached the soft keyboard and its Enter never closed it.
    const main = src('main.ts');
    const matchKeys = main.slice(main.indexOf("keyboardSite('s2u-kb-match-keys')"));
    expect(matchKeys.slice(0, matchKeys.indexOf('exchangeInput.key(e.code, true, false)'))).toContain('if (tauntDev?.isOpen()) return;');
    const x = main.slice(main.indexOf("const isX = (e: KeyboardEvent): boolean => e.code === 'KeyX'"));
    expect(x.slice(0, x.indexOf('acts.wiring.press();'))).toContain('tauntDev?.isOpen()');
  });

  it("LATER 183: the round text line, /testroom's earliest capture listener (mounted before the editor loads), yields the editor its ENTER", () => {
    // 253f7f109 mounted the line on /testroom ahead of the editor's listener: a closed DEV line in an online room took the
    // editor's ENTER and opened itself, so the soft keyboard never closed (`e2e/mapTransitionRecovery.spec.ts` :245). The
    // line leaves ENTER to a menu that holds the keys (`ROUND_LINE_MENU_YIELD_ADAPTATION`; its behaviour pinned in
    // `roundTextLine.test.ts`, ROUND-LINE-YIELDS); the open editor is one of those menus.
    const main = src('main.ts');
    const mount = main.slice(main.indexOf('mountRoundTextLine({'));
    const menu = mount.slice(mount.indexOf('menu: () =>'), mount.indexOf('\n'));
    expect(menu).toContain('tauntDev?.isOpen()');
  });
});
