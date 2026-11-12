import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENT_CODE_WORDS } from '../src/agent/codes';

/**
 * REVIEW-3-SHADOW 4 (a browser adaptation, AX-U's one-link flow): the words a person reads when a connection closes
 * (c931319ba) name the one way back -- "Copy a fresh connect link" -- never the instructions-era "Pair again", "Pair this
 * page" or "instructions". Read as the probe's banned list is (`tools/forge-agent-probe/probeWords.test.ts`): over every
 * string the dock's sources carry, comments left out.
 */
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/agent');
const OLD = [/pair again/i, /pair this page/i, /pairing again/i, /instructions/i];
const FRESH = 'Copy a fresh connect link';

/** Every string literal of a source, its comments stripped first (a `//` inside a string is kept). */
function literals(source: string): string[] {
  const out: string[] = [];
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const m of source.matchAll(re)) if (!m[0].startsWith('/')) out.push(m[0].slice(1, -1));
  return out;
}
const read = (file: string): string => readFileSync(resolve(dir, file), 'utf8');

describe('REVIEW-3-SHADOW 4: the closing words say Copy a fresh connect link', () => {
  it('no string of the dock\'s sources says Pair again, Pair this page or instructions', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files).toEqual(expect.arrayContaining(['codes.ts', 'connection.ts', 'panel.ts']));
    const found = files.flatMap((f) => literals(read(f)).filter((s) => OLD.some((re) => re.test(s))).map((s) => `${f}: ${s}`));
    expect(found).toEqual([]);
  });

  it('the codes that close a pairing for good tell the person to copy a fresh connect link', () => {
    for (const code of ['PAGE_PAUSED', 'SESSION_EXPIRED']) expect(AGENT_CODE_WORDS[code], code).toContain(FRESH);
    for (const [code, words] of Object.entries(AGENT_CODE_WORDS)) for (const re of OLD) expect(words, code).not.toMatch(re);
  });

  it('every closing message of the connection that sends the person back says Copy a fresh connect link', () => {
    const messages = [...read('connection.ts').matchAll(/\bclose\(\s*"([^"]+)"/g)].map((m) => m[1]!).filter((s) => s.includes(' '));
    const back = messages.filter((s) => /\bagain\b|\bresume\b|\bcontinue\b/i.test(s));
    // the five of c931319ba, the approval window's and the ended connection's
    expect(back.length).toBeGreaterThanOrEqual(6);
    expect(back.filter((s) => !s.includes(FRESH))).toEqual([]);
  });
});
