// test/hudClanTagBytes.test.ts -- LATER 1030 (c), Option A (the main controller, 2026-11-15): the room tells a seat's
// clan tag as a BYTE string (one character a byte of the stored UTF-8), and the HUD decodes it with the engine's own
// decoder (`@s2u/ui` `engineCodes`, FUN_0039f0c0 / FUN_0039f160) before it meets a name -- as the original's HUD text
// goes through that decoder (FUN_00362350 D:L260517-260518 -> FUN_0035a3a0). Names are code-point text and are not decoded.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { engineCodes } from '@s2u/ui';
import { FONT_TEXT_01, hudTagText, layoutText } from '../src/hudFont';
import { spectatorTitleName, taggedName } from '../src/hud';
import { roundScreenLayout, type RoundScreen, type RoundText } from '../src/roundScreens';
import type { ScoreRowInfo } from '../src/scoreboard';
import { speakerText } from '../src/hudVoice';
import { teamTags, type TeamTagBody } from '../src/hudTags';

/** "«G»" as the room tells it: the bytes C2 AB 47 C2 BB, one character each. */
const GUILLEMET_G = 'Â«GÂ»';
const codes = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);
/** The atlas cells a line draws, in order (what the player sees). */
const cells = (s: string): number[][] => layoutText(s, 0, 0, 1).glyphs.map((g) => [g.u0, g.v0, g.u1, g.v1]);

describe('hudTagText: a told tag\'s bytes to the codes the HUD font draws (engineCodes)', () => {
  it('decodes «G»\'s five bytes to three codes, « G »', () => {
    expect(codes(hudTagText(GUILLEMET_G))).toEqual([0xab, 0x47, 0xbb]);
    expect(codes(hudTagText(GUILLEMET_G))).toEqual(engineCodes(GUILLEMET_G));
  });

  it('leaves an ASCII tag and an empty one as they stand', () => {
    expect(hudTagText('NSW')).toBe('NSW');
    expect(hudTagText('&&&')).toBe('&&&');
    expect(hudTagText('')).toBe('');
  });

  it('a malformed string goes as engineCodes takes it: a lone two-byte lead at the end reads a 0 byte (code 0), a lone '
    + 'three-byte lead before the end stands alone (its own code)', () => {
    // engineCodes: a lead 0xC0-0xDF takes the next byte unchecked -- past the end that is 0, so (0xC2 - 0xC0) x 64 + 0 - 0x80 = 0.
    expect(codes(hudTagText('GÂ'))).toEqual([0x47, 0]);
    // A lead 0xE0 or above whose next byte is the terminator stands alone.
    expect(codes(hudTagText('Gà'))).toEqual([0x47, 0xe0]);
    expect(codes(hudTagText('GÂ'))).toEqual(engineCodes('GÂ'));
  });

  it('is the face\'s own reader too (FONT_TEXT_01.tagText), so a module that holds the face reads a tag through it', () => {
    expect(FONT_TEXT_01.tagText).toBe(hudTagText);
  });
});

describe('the sites where a tag meets a name decode the tag, not the name', () => {
  it('taggedName (hud.ts; the info box, the team tags, the spectator title): "[«G»] Kilo", an ASCII tag unchanged, none bare', () => {
    expect(taggedName(GUILLEMET_G, 'Kilo')).toBe('[«G»] Kilo');
    expect(taggedName('NSW', 'Kilo')).toBe('[NSW] Kilo');
    expect(taggedName('', 'Kilo')).toBe('Kilo');
    expect(taggedName(null, 'Kilo')).toBe('Kilo');
    expect(taggedName(GUILLEMET_G, 'Âme')).toBe('[«G»] Âme');   // the name is text: not decoded
    // What the player sees: the cells of "[«G»] Kilo", not of the five bytes.
    expect(cells(taggedName(GUILLEMET_G, 'Kilo'))).toEqual(cells('[«G»] Kilo'));
    expect(cells(taggedName(GUILLEMET_G, 'Kilo'))).not.toEqual(cells(`[${GUILLEMET_G}] Kilo`));
  });

  it('the spectator title\'s two-character test still counts the tag\'s bytes (FUN_00199288, strlen; D:L90266-90270)', () => {
    expect(spectatorTitleName('Â«', 'Kilo')).toBe('[«] Kilo');   // one character, two bytes
    expect(spectatorTitleName('X', 'Kilo')).toBe('Kilo');
  });

  it('the team tags over the heads (hudTags.ts, through taggedName)', () => {
    const camera = new PerspectiveCamera(60, 640 / 448, 1, 10000);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const mate = (clan?: string): TeamTagBody => ({
      id: 2, team: 'seal', dead: null, escortee: false, head: [0, 0, -100], name: 'BRAVO', ...(clan === undefined ? {} : { clan }),
    });
    const text = (clan?: string): string | undefined =>
      teamTags({ self: { id: 1, team: 'seal' }, bodies: [mate(clan)], camera, holder: null }).points[0]?.text;
    expect(text(GUILLEMET_G)).toBe('[«G»] BRAVO');
    expect(text('NSW')).toBe('[NSW] BRAVO');
    expect(text('')).toBe('BRAVO');
  });

  it('the speaker\'s line (hudVoice.ts speakerText, "[%s] %s")', () => {
    expect(speakerText('Kilo', GUILLEMET_G)).toBe('[«G»] Kilo');
    expect(speakerText('Kilo', 'NSW')).toBe('[NSW] Kilo');
    expect(speakerText('Kilo', '')).toBe('Kilo');
    expect(speakerText(null, GUILLEMET_G)).toBeNull();
  });

  const row = (id: number, over: Partial<ScoreRowInfo> = {}): ScoreRowInfo =>
    ({ id, name: `P${id}`, team: 'seal', kills: 1, deaths: 0, score: 10 - id, alive: true, self: false, ...over });
  const screen = (over: Partial<RoundScreen>): RoundScreen =>
    ({ kind: 'roundComplete', secondsLeft: 5, elapsed: 5, winner: 'seal', wins: { seal: 1, terrorist: 0 }, rows: [], ...over });
  const texts = (s: RoundScreen, role: RoundText['role']): string[] =>
    roundScreenLayout(s).texts.filter((t) => t.role === role).map((t) => t.text);

  it('ROUND COMPLETE\'s row tag (roundScreens.ts, "[%s]")', () => {
    const rows = [row(1, { clan: GUILLEMET_G }), row(2, { clan: 'NSW' }), row(3)];
    const words = texts(screen({ rows }), 'row');
    expect(words).toContain('[«G»]');
    expect(words).toContain('[NSW]');
    expect(words.filter((w) => w.startsWith('['))).toHaveLength(2);
  });

  it('GAME COMPLETE\'s MVP line (roundScreens.ts, "[%s] %s")', () => {
    const final = (clan?: string): string =>
      texts(screen({ kind: 'gameComplete', secondsLeft: 10, winner: null, timePlayed: 367,
        rows: [row(1, clan === undefined ? {} : { clan }), row(2)] }), 'mvp')[0]!;
    expect(final(GUILLEMET_G)).toBe('[«G»] P1');
    expect(final('NSW')).toBe('[NSW] P1');
    expect(final()).toBe('P1');
  });
});
