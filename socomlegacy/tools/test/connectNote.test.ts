import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ONL-07's fix round on web research 157: N4 (a new name's password crosses three times on the original client too,
 * not because SVC-03 does not create at login) with its two decompilation lines held to the file when it is present
 * (read-only, never pasted: only the buffer's address is looked for), and section 7's statement of what N1 closes and
 * what remains.
 */

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const NOTE = readFileSync(join(ROOT, 'docs/research/157-connecting-to-socom-ii-online-the-lobby-client-and-the-login.md'), 'utf8');
const section = (n: number): string => {
  const at = NOTE.indexOf(`\n## ${n}. `);
  const next = NOTE.indexOf('\n## ', at + 1);
  return NOTE.slice(at, next < 0 ? undefined : next);
};

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DECOMP = PC_ROOT ? join(PC_ROOT, 'game/analysis/socom2_game.elf.decomp.c') : '';
const HAVE_DECOMP = DECOMP !== '' && existsSync(DECOMP);

describe('research 157, the fix round', () => {
  it("N4: §5 lays the three crossings to the original client's own registration path, citing both copies", () => {
    const s5 = section(5);
    expect(s5).toMatch(/so it does on the original client/);
    expect(s5).toMatch(/`FUN_002eea70` copies the lobby's password buffer \(0x66a514[^)]*\)\s+into AccountRegistration \(D:L190975\)/);
    expect(s5).toMatch(/`FUN_002eeb50` copies it again into the second AccountLogin\s+\(D:L191007\)/);
    expect(s5).not.toMatch(/as it\s+stands a new name's password crosses three times/);
  });

  it.skipIf(!HAVE_DECOMP)('N4: D:L190975 and D:L191007 each copy 0x66a514, inside FUN_002eea70 and FUN_002eeb50', () => {
    const lines = readFileSync(DECOMP, 'utf8').split('\n');
    const fnAt = (line: number): string => { for (let i = line - 1; i >= 0; i--) { const m = /^\/\/ ---- (FUN_[0-9a-f]+) /.exec(lines[i]!); if (m) return m[1]!; } return ''; };
    for (const [line, fn] of [[190975, 'FUN_002eea70'], [191007, 'FUN_002eeb50']] as const) {
      expect(lines[line - 1], `D:L${line}`).toContain('0x66a514');
      expect(fnAt(line)).toBe(fn);
    }
  });

  it("§7: what N1 closes and what remains -- clear text over http:, the page's scripts and __frontEnd's ticket", () => {
    const s7 = section(7);
    expect(s7).toMatch(/closed by the fix round's N1/);
    expect(s7).toMatch(/\*\*What remains:\*\*/);
    expect(s7).toMatch(/`http:`[^.]*in clear/);
    expect(s7).toMatch(/This remains after N1/);
    expect(s7).toMatch(/while it is typed/);
    expect(s7).toMatch(/__frontEnd\.session\.lobby\.ticket\(\)/);
  });
});
