import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import {
  SKB_EVENTS, SKB_KEY_TYPE, UI_PARAMS_RDR, decodeTextInput, findSoftKeyboard, isEmptySkbKey, readSoftKeyboards, sameSkbKey,
  type SkbKey, type SoftKeyboardParams, type TextInputRequest,
} from '../../src/keyboard';
import { fnKey, openedOn, press, typeOnGrid, typeUsb, usb } from './walk';

/**
 * PLAT-17 on the real files (web research 119 §2, §5): the 12 layouts of `UiParams.rdr` (`RUN/UI/READERC.ZAR`) and the
 * 30 `GetTextInput` blocks of `RUN/UIZANIM.ZAR`, with the keyboard driven on them -- the online path's fields typed by
 * the key walk and read back. Names, counts and decoded values only (RS.R8). The files come from the disc
 * (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`) or the extracted fixtures (`S2U_TEST_FIXTURES`, else
 * `test-fixtures/`); with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
/** The extracted fixtures, as `packages/archive/test/fixtures.ts` resolves them (`S2U_TEST_FIXTURES`, else `test-fixtures/`). */
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../test-fixtures');
const from = (root: string, p: string): Uint8Array | null => (root !== '' && existsSync(join(root, p)) ? new Uint8Array(readFileSync(join(root, p))) : null);
const file = (p: string): Uint8Array | null => from(DISC, p) ?? from(FIXTURES, p);
const READERC = file(UI_PARAMS_RDR.archive);
const UIZANIM = file('RUN/UIZANIM.ZAR');
const HAVE = READERC !== null && UIZANIM !== null;

let cache: { params: SoftKeyboardParams; calls: { dialog: string; anim: string; req: TextInputRequest }[] } | null = null;
function disc() {
  if (cache) return cache;
  const z = Zar.parse(READERC!);
  const k = z.root.children.find((c) => c.name.toLowerCase() === UI_PARAMS_RDR.member.toLowerCase())!;
  const params = readSoftKeyboards(parseRdr(z.data(k)));
  const calls: { dialog: string; anim: string; req: TextInputRequest }[] = [];
  for (const s of parseAnimSets(Zar.parse(UIZANIM!)).sets) {
    for (const a of s.anims) for (const q of a.sequences) for (const c of q.commands) {
      if (c.set === 0 || a.names[c.bytes[6]!]?.toLowerCase() !== 'gettextinput') continue;
      calls.push({ dialog: s.name.replace(/\.rdr$/i, ''), anim: a.name, req: decodeTextInput(c.bytes, (i) => a.names[i] ?? null) });
    }
  }
  cache = { params, calls };
  return cache;
}

/** Research 119 §2's table: layout, KeyProps count, start key, twin. */
const LAYOUTS: [string, number, [number, number], string][] = [
  ['KEYBOARD', 77, [9, 5], 'KEYBOARD2'], ['KEYBOARD2', 77, [9, 5], 'KEYBOARD'],
  ['ChatSkb', 79, [1, 7], 'ChatSkb2'], ['ChatSkb2', 79, [1, 7], 'ChatSkb'],
  ['PlayerChatSkb', 77, [1, 7], 'PlayerChatSkb2'], ['PlayerChatSkb2', 77, [1, 7], 'PlayerChatSkb'],
  ['ClanSkb', 76, [1, 7], 'ClanSkb2'], ['ClanSkb2', 76, [1, 7], 'ClanSkb'],
  ['MPPLAYERNAME', 76, [1, 7], 'MPPLAYERNAME2'], ['MPPLAYERNAME2', 76, [1, 7], 'MPPLAYERNAME'],
  ['CREATEPLAYERNAME', 76, [1, 7], 'CREATEPLAYERNAME2'], ['CREATEPLAYERNAME2', 76, [1, 7], 'CREATEPLAYERNAME'],
];

const distinct = (grid: SkbKey[][]): SkbKey[] => {
  const out: SkbKey[] = [];
  for (const row of grid) for (const k of row) if (!isEmptySkbKey(k) && !out.some((o) => sameSkbKey(o, k))) out.push(k);
  return out;
};

describe.skipIf(!HAVE)('UiParams.rdr on the disc (research 119 §1-§2)', () => {
  it('the common props: the repeat 0.25 / 5 / 15 / 0.5, the six sounds by slot, the legend', () => {
    const c = disc().params.common;
    expect(c).toMatchObject({ repeatDelay: 0.25, repeatSpeedStart: 5, repeatSpeedEnd: 15, repeatAccelTime: 0.5, usbKbdOnIcon: 'SKB_USB_Icon.tif', backgroundsOpacity: 1 });
    expect(c.sounds).toEqual(['.SLIDE', '.SLIDE\t', '.SKB_NAV', '.SKB_TYPE', '.THUNK', '.NEG']);
    expect(c.legend).toEqual({ texture: 'SkbLegend.tif', size: [170, 230], slideInSec: 0.2, slideOutSec: 0.2 });
  });

  it('the 12 layouts: 7 x 15 grids, every distinct key one KeyProps record, the start keys and the twins', () => {
    const { layouts } = disc().params;
    expect(layouts.map((l) => l.name).sort()).toEqual(LAYOUTS.map((r) => r[0]).sort());
    for (const [name, keys, start, twin] of LAYOUTS) {
      const l = findSoftKeyboard(layouts, name)!;
      expect([name, l.grid.length, l.grid.every((r) => r.length === 15)]).toEqual([name, 7, true]);
      expect([name, l.keyProps.length, distinct(l.grid).length]).toEqual([name, keys, keys]);
      for (const k of distinct(l.grid)) expect(l.keyProps.some((p) => sameSkbKey(p.key, k))).toBe(true);
      expect([name, l.startGridPos, l.switchTargets]).toEqual([name, start, [twin]]);
      expect([name, l.scaleUpSec, l.scaleDownSec, l.ignoreUnchangedString]).toEqual([name, 0.2, 0.2, true]);
      expect(l.indicators.usbKbdOn).toBeNull();
      const chars = distinct(l.grid).filter((k) => k.type === SKB_KEY_TYPE.CHAR);
      expect([name, chars.length]).toEqual([name, 69]);                                   // 68 characters and Space
    }
  });

  it('the start key is Switch1 on all but KEYBOARD (M); the name fields are 310 / 190 px; the chat edits two lines', () => {
    const { layouts } = disc().params;
    const start = (n: string) => { const l = findSoftKeyboard(layouts, n)!; return l.grid[l.startGridPos[1] - 1]![l.startGridPos[0] - 1]!; };
    expect(start('KEYBOARD')).toEqual({ type: SKB_KEY_TYPE.CHAR, value: 0x4d });
    for (const [n] of LAYOUTS.slice(2)) expect(start(n).type).toBe(SKB_KEY_TYPE.SWITCH);
    expect(findSoftKeyboard(layouts, 'CREATEPLAYERNAME')!.userStringWidth).toBe(310);
    expect(findSoftKeyboard(layouts, 'MPPLAYERNAME')!.userStringWidth).toBe(190);
    expect(findSoftKeyboard(layouts, 'ChatSkb')).toMatchObject({ userStringWidth: 400, userStringLineHeight: 26 });
    expect(findSoftKeyboard(layouts, 'ChatSkb')!.pieces.map((p) => p.length)).toEqual([3, 3, 4, 4]);
  });
});

describe.skipIf(!HAVE)("the 30 GetTextInput calls (research 119 §5)", () => {
  it('30 blocks; by layout MPPLAYERNAME 12, PlayerChatSkb 10, ChatSkb 4, CREATEPLAYERNAME 3, KEYBOARD 1; every one found', () => {
    const { params, calls } = disc();
    expect(calls).toHaveLength(30);
    const by: Record<string, number> = {};
    for (const c of calls) { const l = findSoftKeyboard(params.layouts, c.req.skbName); expect(l).not.toBeNull(); by[l!.name] = (by[l!.name] ?? 0) + 1; }
    expect(by).toEqual({ MPPLAYERNAME: 12, PlayerChatSkb: 10, ChatSkb: 4, CREATEPLAYERNAME: 3, KEYBOARD: 1 });
  });

  it('the online path: the persona name 14 / 31 NoDQuote, the password 12 / 31, CREATE GAME\'s name 15 / 63, the lobby chat 63 / 63', () => {
    const { calls } = disc();
    const call = (d: string, a: string, skb?: string) => calls.find((c) => c.dialog === d && c.anim === a && (!skb || c.req.skbName === skb))!.req;
    expect(call('dlgNetPlayerName', 'ChoosePersona')).toMatchObject({ uiVar: 'PLAYERNAMEVAR', skbName: 'CREATEPLAYERNAME', maxChars: 14, maxBytes: 31, noDQuote: true, purpose: '_455_EnterPlayerName_MSG' });
    expect(call('dlgNetPlayerName', 'set_player_password')).toMatchObject({ uiVar: 'PLAYERPASSWORD', skbName: 'CREATEPLAYERNAME', maxChars: 12, maxBytes: 31, noDQuote: false });
    expect(call('dlgNetPlayerName', 'set_player_hometown')).toMatchObject({ maxChars: 20, maxBytes: 63, allowEmpty: true });
    expect(call('dlgCreateGame', 'set_game_name')).toMatchObject({ uiVar: 'GAMENAMEVAR', skbName: 'MPPLAYERNAME', maxChars: 15, maxBytes: 63 });
    expect(call('dlgGameLobby', 'do_chat', 'ChatSkb')).toMatchObject({ uiVar: 'CHATTEXT', uiVar2: 'MsgPlayer_Recipient', maxChars: 63, maxBytes: 63, maxChars2: 14, maxBytes2: 31 });
    expect(call('dlgMPBriefingRoom', 'do_chat')).toMatchObject({ maxChars: 100, maxBytes: 99 });
    expect(call('dlgMenu', 'MissionShortcutSKB')).toMatchObject({ skbName: '', maxChars: 25, maxBytes: 0 });
  });

  it("the online path's three fields typed on the real layouts by the key walk read back equal; the caps hold", () => {
    const { params, calls } = disc();
    const req = (d: string, a: string) => calls.find((c) => c.dialog === d && c.anim === a)!.req;
    for (const [d, a, s] of [
      ['dlgNetPlayerName', 'ChoosePersona', 'Ghost Recon 01'],
      ['dlgNetPlayerName', 'set_player_password', 'Pa55word!x9Z'],
      ['dlgCreateGame', 'set_game_name', 'Seals vs Terror'],
    ] as const) {
      const r = openedOn(params, req(d, a));
      typeOnGrid(r, s);
      typeUsb(r, [usb(0x04)]);                                                            // one past the cap: refused
      expect(r.kb.text).toBe(s);
      press(r, 'CIRCLE');
      expect(r.vars.find(req(d, a).uiVar)?.value).toEqual({ type: 'string', value: s });
      expect(r.events).toEqual([[SKB_EVENTS.APPLY, s], [SKB_EVENTS.CLOSE, null]]);
    }
  });

  it('the lobby chat on ChatSkb: 63 characters, the 64th refused; the accent twin reached by Switch1', () => {
    const { params, calls } = disc();
    const chat = calls.find((c) => c.dialog === 'dlgGameLobby' && c.req.skbName === 'ChatSkb')!.req;
    const r = openedOn(params, chat);
    typeUsb(r, Array.from({ length: 64 }, () => usb(0x04)));
    expect(r.kb.text).toBe('a'.repeat(63));
    press(r, 'CROSS');                                                                    // the start key: Switch1
    expect(r.kb.layout?.name).toBe('ChatSkb2');
    expect(fnKey(0)(r.kb.layout!.grid[2]![0]!)).toBe(true);                                // CapsLock, as on the English twin
  });
});
