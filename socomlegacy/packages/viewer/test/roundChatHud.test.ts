import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { DEFAULT_MODEL, HUD_COLOURS, HUD_LAYOUT, Hud, MESSAGE_SCALE, ROUND_CHAT_ICON_PITCH_SHARE_ADAPTATION, hudLayout, type BannerLine, type HudModel, type HudQuad } from '../src/hud';
import { FONT_TEXT_01, layoutText, TEXT_V, textWidth } from '../src/hudFont';
import {
  MESSAGE_COLOURS, ROUND_CHAT_BODY_COLOUR_ADAPTATION, ROUND_CHAT_ICON_BITMAPS_ADAPTATION, ROUND_CHAT_NAME_COLOURS_ADAPTATION,
  roundChatIcon, roundChatLine, roundChatNameRgb, roundChatPost, setRoundChatIcons,
} from '../src/matchMessages';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { RoundChatSender, ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import type { WalkMode } from '../src/walk';

/**
 * RC-3 ROUND-CHAT (V21.R15a, H452; a browser adaptation beside OT.R48 -- the original sends no open line in a round,
 * research 266 §3.1, §3.9): a relayed `chat` that carries `round` (RC.R2, `net/protocol.ts` `RoundChatSender`) is drawn
 * on the HUD's message window, not in the game lobby's panel; IN-GAME TEXT MESSAGES : OFF (EnableExternalWhispers 0)
 * hides it; the line is `[icon] NAME: text` / `[icon] NAME (team): text`, the name in its side's colour, the body in
 * the window's colour 0 (colour 3, the team's green, on a team line), a skull beside a dead player and an eyeball
 * beside a spectator. The colours and the icons are RC-4's: provisional here. A line with no segments draws exactly as
 * before (pinned below). Product track: synthetic lines, nothing of the original's measured.
 */

type ChatEvent = Extract<ServerEvent, { type: 'chat' }>;
const PS2 = { width: 640, height: 448 };
const SIZES: Record<string, { width: number; height: number }> = {
  'font_text_01.tif': { width: 512, height: 128 }, 'newweapnbkrnd.tif': { width: 128, height: 64 }, white: { width: 1, height: 1 },
};
const ICON_SIZES = { ...SIZES, [ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull]: { width: 16, height: 16 }, [ROUND_CHAT_ICON_BITMAPS_ADAPTATION.eye]: { width: 32, height: 16 } };
const model = (lines: BannerLine[]): HudModel => ({ ...DEFAULT_MODEL, banner: [{ alpha: 1, lines }] });
const messageQuads = (lines: BannerLine[], sizes = SIZES): HudQuad[] => hudLayout(PS2, model(lines), sizes).quads.filter((q) => q.element === 'message');
const glyphQuads = (lines: BannerLine[], sizes = SIZES): HudQuad[] => messageQuads(lines, sizes).filter((q) => q.texture === FONT_TEXT_01.texture);
const inkQuads = (qs: HudQuad[]): HudQuad[] => qs.filter((q) => q.rgba[0] + q.rgba[1] + q.rgba[2] > 0);   // the text pass, not the shadow
const by128 = (c: readonly number[]): number[] => c.map((v) => v / 128);
const rgbOf = (q: HudQuad): number[] => q.rgba.slice(0, 3);

const seal = (dead: boolean): RoundChatSender => ({ side: 'seal', dead });
const chat = (name: string, text: string, round?: RoundChatSender, team?: true): ChatEvent =>
  ({ type: 'chat', sender: 2, name, text, ...(team ? { team } : {}), ...(round ? { round } : {}) });

/** A NetPage on a fake socket, welcomed into a round, its `gameChat` and `roundChat` heard. */
function page(): { server(ev: ServerEvent): void; lobby: ChatEvent[]; hud: ChatEvent[]; posted: string[] } {
  let socket: WebSocketLike | null = null;
  const lobby: ChatEvent[] = [], heard: ChatEvent[] = [], posted: string[] = [];
  const hud = new Hud();
  hud.postMessage = ((text: string | { text: string }[]) => { posted.push(typeof text === 'string' ? text : text.map((l) => l.text).join('/')); }) as Hud['postMessage'];
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const remote = {
    setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
    setType: () => undefined, playerType: () => 0, feet: () => [0, 0, 0],
  } as unknown as RemotePlayers;
  const deps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    gameChat: (ev: ChatEvent) => { lobby.push(ev); },
    roundChat: (ev: ChatEvent) => { heard.push(ev); },
    socket: () => {
      socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
      return socket;
    },
  } as NetPageDeps;
  new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [{ id: 2, name: 'Mate', team: 'seal' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
  } as unknown as ServerEvent);
  posted.length = 0;
  return { server, lobby, hud: heard, posted };
}

describe('RC-3 routing: a round `chat` (with `round`) goes to the HUD, never the lobby\'s panel', () => {
  it('a line with `round` reaches `roundChat` alone; the lobby\'s panel hears nothing of it', () => {
    const p = page();
    const line = chat('Mate', 'push now', seal(false), true);
    p.server(line);
    expect(p.hud).toEqual([line]);
    expect(p.lobby).toEqual([]);
  });

  it('a line without `round` goes to the lobby\'s panel exactly as before, and not to the HUD', () => {
    const p = page();
    p.server(chat('Mate', 'gg', undefined, true));
    p.server(chat('Foe', 'gg'));
    expect(p.lobby).toEqual([chat('Mate', 'gg', undefined, true), chat('Foe', 'gg')]);
    expect(p.hud).toEqual([]);
    expect(p.posted).toEqual([]);
  });

  it('both mounts hand the round line to the HUD through `roundChatPost` (the front end\'s match and /testroom)', () => {
    const src = (f: string): string => readFileSync(resolve(import.meta.dirname, '..', 'src', f), 'utf8');
    expect(src('matchMount.ts')).toMatch(/roundChat: roundChatPost\(\{ hud, external: \(\) => externalWhispers\(o\.externalWhispers\?\.\(\)\) \}\)/);
    expect(src('main.ts')).toMatch(/roundChat: roundChatPost\(\{ hud, external: \(\) => externalWhispers\(startMenuOptions\.value\('EnableExternalWhispers'\)\) \}\)/);
  });
});

describe('RC-3 IN-GAME TEXT MESSAGES : OFF hides the round lines', () => {
  it('on: the line posted on the message window once; off: nothing posted; a line without `round` never posted', () => {
    const posted: BannerLine[][] = [];
    let external = true;
    const post = roundChatPost({ hud: { postMessage: (lines) => { posted.push(lines as BannerLine[]); } }, external: () => external });
    post(chat('Kilo', 'go', seal(false)));
    external = false;
    post(chat('Kilo', 'hidden', seal(false)));
    external = true;
    post(chat('Kilo', 'lobby line'));
    expect(posted).toEqual([[roundChatLine({ name: 'Kilo', text: 'go', round: seal(false) })]]);
  });
});

describe('RC-3 the round line\'s shape: the name in its side\'s colour, the body in the window\'s, the icon by life', () => {
  it("look B's set, kept one switch away (GS 128 as 1: a light blue, a light red, a light grey), and the body's colours 0 and 3", () => {
    const { seal: s, terrorist: t, spectator: n } = ROUND_CHAT_NAME_COLOURS_ADAPTATION;
    expect(s[2]).toBeGreaterThan(s[0]);    // blue over red
    expect(t[0]).toBeGreaterThan(t[2]);    // red over blue
    expect(n[0]).toBe(n[1]); expect(n[1]).toBe(n[2]);   // grey
    expect(ROUND_CHAT_BODY_COLOUR_ADAPTATION).toEqual({ plain: 0, team: 3 });
  });

  it(`a living SEAL's plain line: "Kilo: go", the name the SEALs' blue, the body colour 0, no icon`, () => {
    const line = roundChatLine({ name: 'Kilo', text: 'go', round: seal(false) });
    expect(line).toEqual({
      text: 'Kilo: go', scale: MESSAGE_SCALE, rgb: by128(MESSAGE_COLOURS[0]!),
      segments: [{ text: 'Kilo', rgb: roundChatNameRgb('seal') }, { text: ': go', rgb: by128(MESSAGE_COLOURS[0]!) }],
    });
    expect(line.icon).toBeUndefined();
  });

  it(`a dead Terrorist's team line: "Foe (team): hold", the name the Terrorists' red, the body the team's green, a skull`, () => {
    const line = roundChatLine({ name: 'Foe', text: 'hold', team: true, round: { side: 'terrorist', dead: true } });
    expect(line).toEqual({
      text: 'Foe (team): hold', scale: MESSAGE_SCALE, rgb: by128(MESSAGE_COLOURS[3]!), icon: ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull,
      segments: [{ text: 'Foe', rgb: roundChatNameRgb('terrorist') }, { text: ' (team): hold', rgb: by128(MESSAGE_COLOURS[3]!) }],
    });
  });

  it('a spectator\'s line: the name grey and an eyeball', () => {
    const line = roundChatLine({ name: 'Eye', text: 'nice', round: { side: null, dead: true } });
    expect(line.icon).toBe(ROUND_CHAT_ICON_BITMAPS_ADAPTATION.eye);
    expect(line.segments![0]).toEqual({ text: 'Eye', rgb: roundChatNameRgb(null) });
  });

  it('the icon slot: a skull beside a dead player of either side, an eyeball beside a spectator, none beside the living', () => {
    expect(roundChatIcon({ side: 'seal', dead: true })).toBe('skull');
    expect(roundChatIcon({ side: 'terrorist', dead: true })).toBe('skull');
    expect(roundChatIcon({ side: null, dead: true })).toBe('eye');
    expect(roundChatIcon({ side: null, dead: false })).toBe('eye');
    expect(roundChatIcon({ side: 'seal', dead: false })).toBeNull();
    expect(roundChatIcon({ side: 'terrorist', dead: false })).toBeNull();
  });

  it('the icons\' seam: `setRoundChatIcons` hands the HUD only the bitmaps it is given, under their names', () => {
    const handed: Record<string, unknown>[] = [];
    const bmp = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    setRoundChatIcons({ addBitmaps: (b) => { handed.push(b); } }, { skull: bmp, eye: null });
    setRoundChatIcons({ addBitmaps: (b) => { handed.push(b); } }, { skull: null, eye: null });
    expect(handed).toEqual([{ [ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull]: bmp }]);
  });
});

describe('RC-3 the message window draws a segmented line: each piece in its colour, the icon a letter\'s height', () => {
  it('the name\'s glyphs in the side\'s colour, the body\'s in the team\'s green, left to right', () => {
    const line = roundChatLine({ name: 'Kilo', text: 'go', team: true, round: seal(false) });
    const ink = inkQuads(glyphQuads([line]));
    const name = ink.filter((q) => rgbOf(q).join() === roundChatNameRgb('seal').join());
    const body = ink.filter((q) => rgbOf(q).join() === by128(MESSAGE_COLOURS[3]!).join());
    expect(name).toHaveLength(4);                       // K i l o
    expect(body).toHaveLength(9);                       // ( t e a m ) : g o -- a space draws no glyph
    expect(name.length + body.length).toBe(ink.length);
    expect(Math.max(...name.map((q) => q.x))).toBeLessThan(Math.min(...body.map((q) => q.x)));
  });

  it('one segment in the line\'s own colour and no icon draws the glyphs where the plain line draws them', () => {
    const plain: BannerLine = { text: 'Kilo fragged Lima with M4', scale: MESSAGE_SCALE };
    const seg: BannerLine = { ...plain, segments: [{ text: 'Kilo fragged ' }, { text: 'Lima with M4' }] };
    const a = glyphQuads([plain]), b = glyphQuads([seg]);
    expect(b).toHaveLength(a.length);
    const key = (q: HudQuad): string => [q.u0, q.v0, q.rgba.join()].join();
    expect(b.map(key).sort()).toEqual(a.map(key).sort());
    for (const q of b) {
      const twin = a.find((p) => key(p) === key(q) && Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9);
      expect(twin).toBeDefined();
    }
  });

  it('a dead sender\'s skull: one quad before the name, the line pitch high (no taller), centred on its letters, its bitmap\'s aspect', () => {
    const line = roundChatLine({ name: 'Kilo', text: 'down', round: seal(true) });
    const all = messageQuads([line], ICON_SIZES);
    const icons = all.filter((q) => q.texture === ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull);
    expect(icons).toHaveLength(1);
    // The look sheet's finding (2026-11-13): a full letter cell (25 rows x scale x 448/480, ~21) is taller than the
    // window's line pitch (15), so the icon spilled onto the lines above and below. It takes the pitch's share instead.
    const h = HUD_LAYOUT.banner.pitch * ROUND_CHAT_ICON_PITCH_SHARE_ADAPTATION;
    expect(h).toBeLessThan(FONT_TEXT_01.cell * MESSAGE_SCALE * TEXT_V);
    expect(icons[0]!.h).toBeCloseTo(h, 9);
    expect(icons[0]!.w).toBeCloseTo(h, 9);              // 16 x 16
    const name = inkQuads(all.filter((q) => q.texture === FONT_TEXT_01.texture))
      .filter((q) => rgbOf(q).join() === roundChatNameRgb('seal').join());
    expect(icons[0]!.y).toBeCloseTo(name[0]!.y, 6);     // centred on the line's letters' cell
    expect(icons[0]!.x + icons[0]!.w / 2).toBeLessThanOrEqual(Math.min(...name.map((q) => q.x - q.w / 2)));
    expect(all.some((q) => q.texture === ROUND_CHAT_ICON_BITMAPS_ADAPTATION.eye)).toBe(false);
  });

  it('a spectator\'s eyeball at its bitmap\'s aspect (32 x 16: twice as wide as high)', () => {
    const line = roundChatLine({ name: 'Eye', text: 'nice', round: { side: null, dead: true } });
    const icons = messageQuads([line], ICON_SIZES).filter((q) => q.texture === ROUND_CHAT_ICON_BITMAPS_ADAPTATION.eye);
    expect(icons).toHaveLength(1);
    expect(icons[0]!.w).toBeCloseTo(2 * icons[0]!.h, 9);
  });

  it('an icon the HUD does not hold (RC-4 not in yet) draws nothing in its slot: the text sits as with no icon', () => {
    const line = roundChatLine({ name: 'Kilo', text: 'down', round: seal(true) });
    const bare: BannerLine = { ...line };
    delete bare.icon;
    const a = glyphQuads([line]), b = glyphQuads([bare]);
    expect(messageQuads([line]).some((q) => q.texture === ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull)).toBe(false);
    expect(a.map((q) => [q.x, q.y, q.u0])).toEqual(b.map((q) => [q.x, q.y, q.u0]));
  });

  it('a long round line wraps as every post does; its pieces keep their colours and the icon rides the first piece only', () => {
    const hud = new Hud(); hud.setVisible(true);
    const text = 'everyone hold the north stairs until the bomb is planted then rotate east';
    const line = roundChatLine({ name: 'Kilo', text, round: seal(true) });
    hud.postMessage([line]); hud.step(0.5);
    const lines = hud.state().model.banner.flatMap((m) => m.lines);
    expect(lines.length).toBeGreaterThan(1);
    // The wrap drops the space it breaks at (`./hudMessagePanel` `wrapMessageLine`; review F1): the pieces are the text's
    // characters in order but those spaces.
    expect(lines.map((l) => l.text).join(' ')).toBe(line.text);
    expect(lines.map((l) => (l.segments ?? []).map((s) => s.text).join(''))).toEqual(lines.map((l) => l.text));
    expect(lines[0]!.icon).toBe(ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull);
    expect(lines.slice(1).every((l) => l.icon === undefined)).toBe(true);
    expect(lines[0]!.segments![0]).toEqual({ text: 'Kilo', rgb: roundChatNameRgb('seal') });
    expect(lines.slice(1).every((l) => l.segments!.every((s) => s.rgb!.join() === by128(MESSAGE_COLOURS[0]!).join()))).toBe(true);
  });
});

describe('RC-3 pin: a line with no segments draws exactly as before', () => {
  /** The window's draw of one line as it stood before RC-3 (`hudLayout`'s banner loop and its `text`): shadow, then ink. */
  const before = (l: BannerLine): Pick<HudQuad, 'texture' | 'x' | 'y' | 'w' | 'h' | 'u0' | 'v0' | 'u1' | 'v1' | 'rgba'>[] => {
    const B = HUD_LAYOUT.banner, s = PS2.height / 448, C = (x: number): number => PS2.width / 2 + (x - 640 / 2) * s;
    const y = B.base + B.perScale * l.scale, width = textWidth(l.text, l.scale);
    const { glyphs } = layoutText(l.text, B.x - width / 2, y, l.scale);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    const out: ReturnType<typeof before> = [];
    for (const pass of ['shadow', 'text'] as const) {
      const ox = pass === 'shadow' ? dx * l.scale : 0, oy = pass === 'shadow' ? dy * l.scale : 0;
      for (const g of glyphs) {
        const rgba = (pass === 'text' && l.rgb ? [l.rgb[0], l.rgb[1], l.rgb[2], (l.opacity ?? HUD_COLOURS.text[3]) * 1] : [...HUD_COLOURS[pass]]) as [number, number, number, number];
        const x = C(g.x + ox), gy = (g.y + oy) * s, w = g.w * s, h = g.h * s;
        out.push({ texture: FONT_TEXT_01.texture, x: x + w / 2, y: gy + h / 2, w, h, u0: g.u0, v0: g.v0, u1: g.u1, v1: g.v1, rgba });
      }
    }
    return out;
  };
  const drawn = (l: BannerLine) => glyphQuads([l]).map(({ texture, x, y, w, h, u0, v0, u1, v1, rgba }) => ({ texture, x, y, w, h, u0, v0, u1, v1, rgba }));

  it('the kill feed\'s plain line (colour 0): every glyph quad as before, in order', () => {
    const l: BannerLine = { text: 'Kilo fragged Lima with M4', scale: MESSAGE_SCALE };
    expect(drawn(l)).toEqual(before(l));
  });

  it('a coloured line with its own opacity (a taunt\'s colour 5): every glyph quad as before, in order', () => {
    const l: BannerLine = { text: 'TAUNT', scale: 0.9, rgb: [1, 0.5, 0.5], opacity: 100 / 128 };
    expect(drawn(l)).toEqual(before(l));
  });

  it('a plain line posted through the HUD keeps no segment and no icon (the post\'s pieces as before)', () => {
    const hud = new Hud(); hud.setVisible(true);
    hud.postMessage([{ text: 'TEAMMATES', scale: 0.8 }]); hud.step(0.5);
    expect(hud.state().model.banner.flatMap((m) => m.lines)).toEqual([{ text: 'TEAMMATES', scale: 0.8 }]);
  });
});
