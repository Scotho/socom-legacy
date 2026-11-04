import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERSONA_COMMAND_ROWS, PERSONA_ENTRY_COMMANDS, uiCommandKey, uiCommandRowByKey, uiCommandRowByName } from '@s2u/ui';

/**
 * ONL-06's list (web research 153 §2): every bound function the persona form's chapter names -- `dlgNetPlayerName.rdr`'s
 * layout bindings, its own set and the library animations those reach (`UIanim.rdr`, `UIMemCardAnim.rdr`), pinned off
 * the disc in ONL-33's `onlineDialogs.pinned.json` (research 128 §4.4) -- is answered by a task in `@s2u/ui`'s
 * `PERSONA_ENTRY_COMMANDS`: implemented there (ONL-06), by an earlier task, or declared for its own with the reason. As
 * `dnasEntryCommands.test.ts` holds ONL-03's.
 */
const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');
interface Pin { chapters: { name: string; commands: string[]; bindings: string[]; edges: string[]; library: string[] }[] }
const chapter = () => (JSON.parse(readFileSync(PIN, 'utf8')) as Pin).chapters.find((c) => c.name === 'dlgNetPlayerName.rdr')!;
const spelling = (line: string): string | null => (/\(no row\)$/.test(line) ? null : line.split(' ')[0]!);
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));

describe("the persona form's chapter (ONL-33's pin)", () => {
  it("is the dialog of research 128 §4.4: four ONSTART animations, ON_SKB_APPLY, the six rows' bindings, the list's CROSS / TRIANGLE / CIRCLE", () => {
    const c = chapter();
    expect(c.bindings.filter((b) => b.startsWith('SCREEN EVENT ONSTART'))).toEqual([
      'SCREEN EVENT ONSTART -> check_store_password [dlgNetPlayerName.rdr]', 'SCREEN EVENT ONSTART -> OnLoginRoomstart [dlgNetPlayerName.rdr]',
      'SCREEN EVENT ONSTART -> CheckConnectEnable [dlgNetPlayerName.rdr]', 'SCREEN EVENT ONSTART -> has_memcard_changed [UIMemCardAnim.rdr]',
    ]);
    expect(c.bindings).toContain('SCREEN EVENT ON_SKB_APPLY -> OnSKBApply [dlgNetPlayerName.rdr]');
    expect(c.bindings).toContain('connect_btn BUTTON CROSS -> register_new_account [dlgNetPlayerName.rdr]');
    expect(c.bindings.filter((b) => b.startsWith('PersonaList '))).toEqual([
      'PersonaList BUTTON CROSS -> ChoosePersona [dlgNetPlayerName.rdr]', 'PersonaList BUTTON TRIANGLE -> CancelPersonaChoice [dlgNetPlayerName.rdr]',
      'PersonaList BUTTON CIRCLE -> DeletePersona [dlgNetPlayerName.rdr]',
    ]);
    expect(c.edges).toContain('connect_btn BUTTON CROSS register_new_account SWITCHMENU -> dlgNetConnect.rdr');
  });
});

describe('every name the chapter uses is answered by a task (PERSONA_ENTRY_COMMANDS)', () => {
  it('each pinned spelling reaches a row, and that row has exactly one entry naming the spelling', () => {
    const byRow = new Map(PERSONA_ENTRY_COMMANDS.map((e) => [e.name, e]));
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
    for (const e of PERSONA_ENTRY_COMMANDS) expect(used.has(e.name), e.name).toBe(true);
    for (const e of PERSONA_ENTRY_COMMANDS) for (const s of e.spelt) expect(spelt, `${e.name} spelt ${s}`).toContain(s);
  });

  it("'here' is ONL-06's rows of this module; a declared row names the table's task and says why", () => {
    for (const e of PERSONA_ENTRY_COMMANDS) {
      if (e.status === 'here') {
        expect(e.task).toBe('ONL-06');
        expect(PERSONA_COMMAND_ROWS.map((r) => r.name), e.name).toContain(e.name);
      } else if (e.status === 'declared') {
        expect(e.why, e.name).toBeTruthy();
        expect(uiCommandRowByName(e.name)!.task, e.name).toBe(e.task);
      }
    }
    // The module's ten rows: eight the form's chapter names, and SELECT UNIVERSE's two (VerifyPatchLevel, LobbyConnect).
    expect(PERSONA_ENTRY_COMMANDS.filter((e) => e.status === 'here').map((e) => e.name).sort()).toEqual(
      PERSONA_COMMAND_ROWS.map((r) => r.name).filter((n) => n !== 'VerifyPatchLevel' && n !== 'LobbyConnect').sort());
  });
});
