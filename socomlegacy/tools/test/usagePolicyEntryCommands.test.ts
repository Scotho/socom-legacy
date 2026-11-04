import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USAGE_POLICY_COMMAND_ROWS, USAGE_POLICY_ENTRY_COMMANDS, uiCommandKey, uiCommandRowByKey, uiCommandRowByName } from '@s2u/ui';

/**
 * ONL-08's list (web research 156 §1.2): every bound function USER AGREEMENT's chapter names -- `dlgUsagePolicy.rdr`'s
 * own set and `UIanim.rdr`'s `OnSystemMessage`, pinned off the disc in ONL-33's `onlineDialogs.pinned.json` (research
 * 128 §4.6) -- is answered by a task in `@s2u/ui`'s `USAGE_POLICY_ENTRY_COMMANDS`: implemented there (ONL-08), by an
 * earlier task, or declared for its own with the reason. As `universeEntryCommands.test.ts` holds ONL-04's.
 */
const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');
interface Pin { chapters: { name: string; commands: string[]; bindings: string[]; edges: string[]; library: string[] }[] }
const chapter = () => (JSON.parse(readFileSync(PIN, 'utf8')) as Pin).chapters.find((c) => c.name === 'dlgUsagePolicy.rdr')!;
const spelling = (line: string): string | null => (/\(no row\)$/.test(line) ? null : line.split(' ')[0]!);
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));

describe("USER AGREEMENT's chapter (ONL-33's pin)", () => {
  it("is the dialog of research 128 §4.6: ONSTART retrieve_usage, UP / DOWN bound twice, the two buttons' CROSS, eleven command lines", () => {
    const c = chapter();
    expect(c.bindings).toContain('SCREEN EVENT ONSTART -> retrieve_usage [dlgUsagePolicy.rdr]');
    expect(c.bindings.filter((b) => /SCREEN BUTTON (UP|DOWN)/.test(b))).toHaveLength(4);
    expect(c.bindings).toContain('YesAccept BUTTON CROSS -> ForceUsagePolicyReturn [dlgUsagePolicy.rdr]');
    expect(c.bindings).toContain('NoAccept BUTTON CROSS -> ReturnToMMenu [dlgUsagePolicy.rdr]');
    expect(c.library).toEqual(['RUN/UIZANIM.ZAR:UIanim.rdr/OnSystemMessage']);
    expect(c.commands).toHaveLength(11);
    expect(c.edges).toEqual([
      'NoAccept BUTTON CROSS ReturnToMMenu SWITCHMENU -> REBOOT', 'YesAccept BUTTON CROSS ForceUsagePolicyReturn SWITCHMENU -> dlgWorldOfSOCOM.rdr',
    ]);
  });
});

describe('every name the chapter uses is answered by a task (USAGE_POLICY_ENTRY_COMMANDS)', () => {
  it('each pinned spelling reaches a row, and that row has exactly one entry naming the spelling', () => {
    const byRow = new Map(USAGE_POLICY_ENTRY_COMMANDS.map((e) => [e.name, e]));
    for (const line of chapter().commands) {
      const spelt = spelling(line);
      if (spelt === null) continue;
      const row = rowOf(spelt);
      expect(row, `${spelt} reaches no row of the table`).not.toBeNull();
      const entry = byRow.get(row!.name);
      expect(entry, `${spelt} (row ${row!.name}) has no entry`).toBeDefined();
      if (spelt !== row!.name) expect(entry!.spelt, `${row!.name}'s spellings lack ${spelt}`).toContain(spelt);
    }
  });

  it('no entry names a row the chapter does not use', () => {
    const spelt = chapter().commands.map(spelling).filter((s): s is string => s !== null);
    const used = new Set(spelt.map((n) => rowOf(n)!.name));
    for (const e of USAGE_POLICY_ENTRY_COMMANDS) expect(used.has(e.name), e.name).toBe(true);
    for (const e of USAGE_POLICY_ENTRY_COMMANDS) for (const s of e.spelt) expect(spelt, `${e.name} spelt ${s}`).toContain(s);
  });

  it('"here" is ONL-08\'s two rows; a declared row names the table\'s task and says why', () => {
    for (const e of USAGE_POLICY_ENTRY_COMMANDS) {
      if (e.status === 'here') {
        expect(e.task).toBe('ONL-08');
        expect(USAGE_POLICY_COMMAND_ROWS.map((r) => r.name), e.name).toContain(e.name);
      } else if (e.status === 'declared') {
        expect(e.why, e.name).toBeTruthy();
        expect(uiCommandRowByName(e.name)!.task, e.name).toBe(e.task);
      }
    }
    expect(USAGE_POLICY_ENTRY_COMMANDS.filter((e) => e.status === 'here')).toHaveLength(2);
  });
});
