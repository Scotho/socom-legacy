import { describe, expect, it } from 'vitest';
import * as ui from '@s2u/ui';
import * as roster from '../src/botRoster';
import { botDisplayName, botTextCharacters, BOT_GOLD, plainBotText } from '../src/botPresentation';

/**
 * H316 (the owner, 2026-10-24: "bot names are placeholders. Cav/Orion/Freq were manual"; then "i more meant like the
 * mission campaign character names") and the area (c) review's finding 1, the merge controller's ruling: the 200
 * authored gamer tags and the four per-name specials go; the names are the campaign's, by side (BTL.R6, the merge
 * controller's choice under the owner's word; each read back off the disc by `botRoster.disc.test.ts`). No name keys any
 * behaviour: bot identification is a separate authored display adaptation.
 */
const RETIRED = ['Freq', 'Cav', 'Orion', 'Botty McBotface', 'SilentBreach', 'GhostActual'];

describe('the bot roster: the campaign\'s names by side, none special (H316)', () => {
  it('BOT_NAMES_ADAPTATION: eight names a side, unique across both, none of the retired names', () => {
    const all = [...roster.BOT_NAMES_ADAPTATION.seal, ...roster.BOT_NAMES_ADAPTATION.terrorist];
    expect(roster.BOT_NAMES_ADAPTATION.seal).toHaveLength(8);
    expect(roster.BOT_NAMES_ADAPTATION.terrorist).toHaveLength(8);
    expect(new Set(all.map((n) => n.toLowerCase())).size).toBe(all.length);
    for (const name of RETIRED) expect(all.map((n) => n.toLowerCase()), name).not.toContain(name.toLowerCase());
  });

  it('a seat\'s side picks from its own list, a taken name (any case) never again; a full side falls back to CPU n', () => {
    const { BOT_NAMES_ADAPTATION: names, BOT_PRIORITY_NAMES_ADAPTATION: priority, botNameFor } = roster;
    for (const team of ['seal', 'terrorist'] as const) {
      const other = team === 'seal' ? 'terrorist' : 'seal';
      // BOTN: the owner's priority names come first (below); with them all held, the side's list as before.
      const taken: string[] = [...priority[team]];
      for (let i = 0; i < 8; i++) {
        const name = botNameFor(team, taken, () => 0.5);
        expect(names[team], team).toContain(name);
        expect(names[other]).not.toContain(name);
        taken.push(i % 2 ? name.toUpperCase() : name.toLowerCase());
      }
      expect(new Set(taken.map((n) => n.toLowerCase())).size).toBe(8 + priority[team].length);
      expect(botNameFor(team, [...taken, 'cpu 1'], () => 0.5)).toBe('CPU 2');
    }
    expect(botNameFor('seal', [...priority.seal], () => 0)).toBe('SPECTER');
    expect(botNameFor('terrorist', [...priority.terrorist], () => 0.999)).toBe('Vidonia');
  });

  it('no special names: the roster exports none, @s2u/ui no per-name style', () => {
    expect('SPECIAL_BOT_NAMES' in roster).toBe(false);
    expect('specialBotName' in roster).toBe(false);
    for (const name of ['botNameAccent', 'botNameCss', 'botNameGradient']) expect(name in ui, name).toBe(false);
  });

  it('a bot\'s display is the gold initial and the rest of its name in the line\'s own ink, whatever the name', () => {
    for (const name of ['CPU 3', 'Freq', 'Botty McBotface']) {
      const shown = botDisplayName(name, true);
      expect(plainBotText(shown)).toBe(name);
      const chars = [...botTextCharacters(shown)];
      expect(chars.slice(0, 1)).toEqual([{ char: name[0], rgb: BOT_GOLD }]);
      expect(chars.slice(1).every((c) => c.rgb === undefined), name).toBe(true);
    }
    expect(botDisplayName('Freq', false)).toBe('Freq');
  });
});

/**
 * BOTN (a browser adaptation, product track): the owner, 2026-10-31 -- "seal: Freq, Cav, Orion / terrorsit: Shinobison,
 * HUGE (yellow raincoat model on frostfire always). add these to the names of the list. make them the first ones added
 * and included in each bot additions, the rest can be randomized". Each side's priority names, in his order and
 * spelling, go to the first bots of a fill; the campaign list above (by the draw) and "CPU n" follow, unchanged. The
 * campaign list itself still holds none of the retired names: the five are their own list, ahead of it.
 */
describe('the owner\'s priority bot names (BOTN)', () => {
  const { BOT_NAMES_ADAPTATION: names, BOT_PRIORITY_NAMES_ADAPTATION: priority, botNameFor } = roster;
  const fill = (team: 'seal' | 'terrorist', n: number, taken: string[] = [], random = () => 0.5): string[] => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(botNameFor(team, [...taken, ...out], random));
    return out;
  };

  it('(a) the lists are the owner\'s, in his order and spelling, and the first bots of a fill take them in order', () => {
    expect(priority).toEqual({ seal: ['Freq', 'Cav', 'Orion'], terrorist: ['Shinobison', 'HUGE'] });
    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      expect(fill('seal', 3, [], random)).toEqual(['Freq', 'Cav', 'Orion']);
      expect(fill('terrorist', 2, [], random)).toEqual(['Shinobison', 'HUGE']);
    }
  });

  it('(b) a priority name a human or a spectator holds, in any case, is skipped and the next one taken', () => {
    for (const held of ['freq', 'FREQ', 'Freq']) {
      expect(botNameFor('seal', [held], () => 0)).toBe('Cav');
      expect(fill('seal', 2, ['Human', held])).toEqual(['Cav', 'Orion']);
    }
    expect(botNameFor('terrorist', ['huge'], () => 0)).toBe('Shinobison');
    expect(fill('terrorist', 1, ['SHINOBISON'])).toEqual(['HUGE']);
  });

  it('(c) after the priority names, the side\'s campaign list by the draw, then CPU n', () => {
    for (const team of ['seal', 'terrorist'] as const) {
      const all = fill(team, priority[team].length + names[team].length + 2, [], () => 0.999);
      expect(all.slice(0, priority[team].length)).toEqual([...priority[team]]);
      const rest = all.slice(priority[team].length, priority[team].length + names[team].length);
      expect(new Set(rest)).toEqual(new Set(names[team]));
      expect(rest[0]).toBe(names[team].at(-1));                // the draw picks among the free names, not the first
      expect(all.slice(-2)).toEqual(['CPU 1', 'CPU 2']);
    }
  });

  it('(d) one draw per name while an ordinary name is free', () => {
    // BOTN's rule, priority names included (the 11-name fill runs past a side's eight seats, so it pins the rule, not
    // main's count); the last case pins main's count where `botNameFor`'s comment claims it -- the room's bots share
    // one random stream with the team tactics (`MatchBots`), and a skipped draw would move every later tactical draw.
    for (const team of ['seal', 'terrorist'] as const) {
      let calls = 0;
      const counted = () => { calls++; return 0.5; };
      const n = priority[team].length + names[team].length;
      fill(team, n, [], counted);
      expect(calls).toBe(n);
      calls = 0;
      fill(team, 2, [], counted);
      expect(calls).toBe(2);
      // Where the claim holds -- a fill of eight or fewer, nobody else holding a name -- the count is main's: one draw
      // per bot (main drew once a bot while a name was free, and eight names fill eight seats).
      for (let seats = 1; seats <= 8; seats++) {
        calls = 0;
        fill(team, seats, [], counted);
        expect(calls).toBe(seats);
      }
    }
  });
});
