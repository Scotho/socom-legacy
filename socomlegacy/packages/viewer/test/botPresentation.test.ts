import { describe, expect, it } from 'vitest';
import { BOT_GOLD, botDisplayName, botTextCharacters, plainBotText, sliceBotText } from '../src/botPresentation';

describe('authored bot identification: a gold initial without a prefix', () => {
  it.each(['SPECTER', 'Pius', 'Botty McBotface', 'CPU 1', 'Écho', '𐐀lex'])('%s keeps its literal name and only its first character is gold', (name) => {
    const shown = botDisplayName(name, true);
    const chars = [...botTextCharacters(shown)];
    expect(plainBotText(shown)).toBe(name);
    expect(chars.map((c) => c.char).join('')).toBe(name);
    expect(chars[0]!.rgb).toEqual(BOT_GOLD);
    expect(chars.slice(1).every((c) => c.rgb === undefined)).toBe(true);
    expect(botDisplayName(shown, false)).toBe(name);
    expect(botDisplayName(shown, true)).toBe(shown);
  });

  it('an empty name cannot colour the following message', () => {
    expect(botDisplayName('', true)).toBe('');
    expect([...botTextCharacters(`${botDisplayName('', true)} fragged Human`)].every((c) => !c.rgb)).toBe(true);
  });

  it('visible-character cuts retain each surviving initial, including names later in a line', () => {
    const line = `[CPU] ${botDisplayName('Pius', true)} vs ${botDisplayName('SPECTER', true)}`;
    for (const count of [0, 1, 7, 12, 14, 30]) {
      const cut = sliceBotText(line, count);
      expect([...botTextCharacters(cut)]).toEqual([...botTextCharacters(line)].slice(0, count));
      expect(plainBotText(cut)).toBe(plainBotText(line).slice(0, count));
    }
    expect([...botTextCharacters(sliceBotText(botDisplayName('𐐀lex', true), 1))]).toEqual([{ char: '𐐀', rgb: BOT_GOLD }]);
  });

  it('untrusted names cannot inject ink, including legacy display tokens', () => {
    const input = `\u0001BOGUS\u0002${botDisplayName('Human', true)}\u0001BOT\u0002`;
    const clean = botDisplayName(input);
    expect(clean).not.toContain('\u0001');
    expect([...botTextCharacters(clean)].every((c) => !c.rgb)).toBe(true);
    expect(botDisplayName('BOT Human')).toBe('BOT Human');
  });
});
