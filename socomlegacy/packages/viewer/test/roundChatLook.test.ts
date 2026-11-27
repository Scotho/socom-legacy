import { describe, expect, it } from 'vitest';
import { MESSAGE_SCALE } from '../src/hud';
import {
  MESSAGE_COLOURS, ROUND_CHAT_B2_NAME_COLOURS_ADAPTATION, ROUND_CHAT_ICON_BITMAPS_ADAPTATION, ROUND_CHAT_LOOK_ADAPTATION,
  ROUND_CHAT_NAME_COLOURS_ADAPTATION, roundChatLine, roundChatNameRgb, type RoundChatLook,
} from '../src/matchMessages';
import { sideNameRgb } from '../src/killFeed';
import { ROUND_CHAT_EYE_FRAME_BITMAP, ROUND_CHAT_SKULL_BITMAP } from '../src/roundChatIcons';
import type { RoundChatSender } from '../src/net/protocol';

/**
 * ROUND_CHAT_LOOK_ADAPTATION (V21.R15a, H452; a browser adaptation, product track): one value switches a round line
 * between the look sheet's options (`e2e/zz-round-chat-look.spec.ts`), each drawn as the sheet draws it, so the owner
 * picks in a live match. Synthetic lines; nothing of the original's measured.
 */
const by128 = (c: readonly number[]): [number, number, number] => [c[0]! / 128, c[1]! / 128, c[2]! / 128];
const GREY = by128(MESSAGE_COLOURS[0]!), GREEN = by128(MESSAGE_COLOURS[3]!);
const B = ROUND_CHAT_NAME_COLOURS_ADAPTATION, B2 = ROUND_CHAT_B2_NAME_COLOURS_ADAPTATION;
const living: RoundChatSender = { side: 'seal', dead: false };
const deadT: RoundChatSender = { side: 'terrorist', dead: true };
const watching: RoundChatSender = { side: null, dead: true };
const plain = (round: RoundChatSender, look: RoundChatLook) => roundChatLine({ name: 'Kilo', text: 'go', round }, look);
const team = (round: RoundChatSender, look: RoundChatLook) => roundChatLine({ name: 'Kilo', text: 'go', team: true, round }, look);
const shape = (l: ReturnType<typeof roundChatLine>) => ({ text: l.text, segments: l.segments, icon: l.icon, rgb: l.rgb, scale: l.scale });

describe('ROUND_CHAT_LOOK_ADAPTATION: the look sheet\'s options, one value to switch', () => {
  it('the build draws B3 (WM-DATA-FEED: the kill feed\'s side colours, option 1), and a line without a look is the switch\'s', () => {
    expect(ROUND_CHAT_LOOK_ADAPTATION).toBe('B3');
    expect(roundChatLine({ name: 'Kilo', text: 'go', round: deadT })).toEqual(plain(deadT, 'B3'));
    expect(roundChatNameRgb('seal')).toEqual(sideNameRgb('seal'));
    expect(roundChatNameRgb('seal', 'B')).toEqual(by128(B.seal));
    expect(roundChatNameRgb(null, 'B2')).toEqual(by128(B2.spectator));
  });

  it('B3: B\'s line with the names in the kill feed\'s side colours (`../src/killFeed`), the spectators\' B\'s grey', () => {
    expect(plain(living, 'B3').segments![0]).toEqual({ text: 'Kilo', rgb: sideNameRgb('seal') });
    expect(team(deadT, 'B3').segments![0]).toEqual({ text: 'Kilo', rgb: sideNameRgb('terrorist') });
    expect(plain(watching, 'B3').segments![0]).toEqual({ text: 'Kilo', rgb: by128(B.spectator) });
    for (const r of [living, deadT, watching]) for (const f of [plain, team]) {
      expect({ ...f(r, 'B3'), segments: undefined }).toEqual({ ...f(r, 'B'), segments: undefined });
      expect(f(r, 'B3').segments!.slice(1)).toEqual(f(r, 'B').segments!.slice(1));
    }
  });

  it('A: the lobby\'s forms, the whole line in the body\'s colour, the disc\'s dead and spectators icons', () => {
    expect(shape(plain(living, 'A'))).toEqual({ text: 'Kilo (All): go', rgb: GREY, scale: MESSAGE_SCALE, icon: undefined,
      segments: [{ text: 'Kilo', rgb: GREY }, { text: ' (All): go', rgb: GREY }] });
    expect(shape(team(deadT, 'A'))).toEqual({ text: 'Kilo (Team): go', rgb: GREEN, scale: MESSAGE_SCALE, icon: ROUND_CHAT_SKULL_BITMAP,
      segments: [{ text: 'Kilo', rgb: GREEN }, { text: ' (Team): go', rgb: GREEN }] });
    expect(plain(watching, 'A').icon).toBe(ROUND_CHAT_EYE_FRAME_BITMAP);
  });

  it('B: the name by side, "(team)" on a team line only, the skull and the drawn eye', () => {
    expect(shape(plain(living, 'B'))).toEqual({ text: 'Kilo: go', rgb: GREY, scale: MESSAGE_SCALE, icon: undefined,
      segments: [{ text: 'Kilo', rgb: by128(B.seal) }, { text: ': go', rgb: GREY }] });
    expect(shape(team(deadT, 'B'))).toEqual({ text: 'Kilo (team): go', rgb: GREEN, scale: MESSAGE_SCALE, icon: ROUND_CHAT_ICON_BITMAPS_ADAPTATION.skull,
      segments: [{ text: 'Kilo', rgb: by128(B.terrorist) }, { text: ' (team): go', rgb: GREEN }] });
    expect(plain(watching, 'B').icon).toBe(ROUND_CHAT_ICON_BITMAPS_ADAPTATION.eye);
  });

  it('B2: B\'s line with the sheet\'s brighter names, the spectators\' unchanged', () => {
    expect(B2).toEqual({ seal: [92, 116, 128], terrorist: [128, 108, 108], spectator: B.spectator });
    expect(plain(living, 'B2').segments![0]).toEqual({ text: 'Kilo', rgb: by128(B2.seal) });
    expect(team(deadT, 'B2').segments![0]).toEqual({ text: 'Kilo', rgb: by128(B2.terrorist) });
    expect({ ...team(deadT, 'B2'), segments: undefined }).toEqual({ ...team(deadT, 'B'), segments: undefined });
  });

  it('C1: A\'s forms, colours and icons, only the name tinted by side', () => {
    expect(shape(team(deadT, 'C1'))).toEqual({ text: 'Kilo (Team): go', rgb: GREEN, scale: MESSAGE_SCALE, icon: ROUND_CHAT_SKULL_BITMAP,
      segments: [{ text: 'Kilo', rgb: by128(B.terrorist) }, { text: ' (Team): go', rgb: GREEN }] });
    expect(plain(watching, 'C1')).toMatchObject({ text: 'Kilo (All): go', icon: ROUND_CHAT_EYE_FRAME_BITMAP });
    expect(plain(watching, 'C1').segments![0]).toEqual({ text: 'Kilo', rgb: by128(B.spectator) });
  });

  it('C2: no icon; "(dead) " or "(watching) " before the name in colour 0; "(Team)" on a team line, nothing on a plain one', () => {
    expect(shape(plain(living, 'C2'))).toEqual({ text: 'Kilo: go', rgb: GREY, scale: MESSAGE_SCALE, icon: undefined,
      segments: [{ text: 'Kilo', rgb: by128(B.seal) }, { text: ': go', rgb: GREY }] });
    expect(shape(team(deadT, 'C2'))).toEqual({ text: '(dead) Kilo (Team): go', rgb: GREEN, scale: MESSAGE_SCALE, icon: undefined,
      segments: [{ text: '(dead) ', rgb: GREY }, { text: 'Kilo', rgb: by128(B.terrorist) }, { text: ' (Team): go', rgb: GREEN }] });
    expect(plain(watching, 'C2')).toMatchObject({ text: '(watching) Kilo: go' });
    expect(plain(watching, 'C2').icon).toBeUndefined();
  });

  it('every look: the segments\' texts together are the line\'s text (the HUD\'s wrap needs it)', () => {
    for (const look of ['A', 'B', 'B2', 'B3', 'C1', 'C2'] as const) for (const r of [living, deadT, watching]) for (const l of [plain(r, look), team(r, look)]) {
      expect(l.segments!.map((g) => g.text).join(''), `${look} ${JSON.stringify(r)}`).toBe(l.text);
    }
  });
});
