/**
 * Authored bot presentation. The gold is the chosen lobby label's native dlgGameLobby.rdr Category2Text/Category3Text
 * COLOR (GS units, 128 = full). This display-only ink token never enters authoritative names, clan tags or the wire.
 * Authored adaptation: only a bot's initial is gold; the remaining name uses the line's own ink.
 */
export const BOT_GOLD = [91, 72, 36] as const;
const INK = '\u0001BOT_INITIAL\u0002';
const LEGACY_INK = '\u0001BOT\u0002';
// Any display token is stripped at every untrusted name boundary and from diagnostics: an input name cannot supply its
// own (the marker, or a colour token an older build drew).
const TOKEN = /\u0001[^\u0002]*\u0002/g;

/** Only an explicit trusted per-seat bot flag permits the marker; an input name cannot supply its own display token. */
export function botDisplayName(name: string, bot = false): string {
  const literal = plainBotText(name);
  return bot && literal ? `${INK}${literal}` : literal;
}

/** Readable text for diagnostics; rendering retains the marker's separate gold ink. */
export function plainBotText(text: string): string { return text.replaceAll(LEGACY_INK, 'BOT').replace(TOKEN, ''); }

/** Keep the native visible-character cut without slicing into the marker. */
export function sliceBotText(text: string, count: number): string {
  if (plainBotText(text) === text) return text.slice(0, count);
  const kept = [...botTextCharacters(text)].slice(0, count);
  return kept.map(({ char, rgb }) => `${rgb ? INK : ''}${char}`).join('');
}

/** The native font's characters: each marked initial is gold, even with several names in a kill line. */
export function* botTextCharacters(text: string): Generator<{ char: string; rgb?: readonly [number, number, number] }> {
  let initial = false;
  for (let i = 0; i < text.length;) {
    if (text.startsWith(INK, i)) {
      initial = true;
      i += INK.length;
      continue;
    }
    if (text.startsWith(LEGACY_INK, i)) {
      for (const char of 'BOT') yield { char };
      initial = false;
      i += LEGACY_INK.length;
      continue;
    }
    const token = /^\u0001[^\u0002]*\u0002/.exec(text.slice(i));
    if (token) { i += token[0].length; continue; }
    const char = String.fromCodePoint(text.codePointAt(i)!);
    yield initial ? { char, rgb: BOT_GOLD } : { char };
    initial = false;
    i += char.length;
  }
}
