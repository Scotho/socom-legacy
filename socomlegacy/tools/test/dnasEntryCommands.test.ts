import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DNAS_COMMAND_ROWS, DNAS_ENTRY_COMMANDS, uiCommandKey, uiCommandRowByKey, uiCommandRowByName } from '@s2u/ui';

/**
 * ONL-03's list (web research 146 §1): every bound function the DNAS screen's chapter names -- `dlgNetAuthenticate.rdr`'s
 * own set and the library animations its bindings reach, pinned off the disc in ONL-33's `onlineDialogs.pinned.json`
 * (research 128; held to the disc by `onlineDialogsDisc.test.ts`) -- is answered by a task in `@s2u/ui`'s
 * `DNAS_ENTRY_COMMANDS`: implemented there (ONL-03), by an earlier task, or declared for its own with the reason. A name
 * the chapter uses that the list lacks, a listed name the chapter does not use, or a spelling the dispatcher's key does
 * not fold to its row fails here: none is silently ignored.
 */
const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');
interface Pin { chapters: { name: string; commands: string[]; bindings: string[]; edges: string[] }[] }
const chapter = () => (JSON.parse(readFileSync(PIN, 'utf8')) as Pin).chapters.find((c) => c.name === 'dlgNetAuthenticate.rdr')!;

/** A chapter's command line (`<spelt> [<row>] FUN_<addr>` or `NA (no row)`): the spelling the scripts use, or null for the row-less `NA`. */
const spelling = (line: string): string | null => (/\(no row\)$/.test(line) ? null : line.split(' ')[0]!);
const rowOf = (spelt: string) => uiCommandRowByKey(uiCommandKey(spelt));

describe('the DNAS screen\'s chapter (ONL-33\'s pin)', () => {
  it('is the dialog of research 128 §3: its bindings, its one path edge and 27 command lines', () => {
    const c = chapter();
    expect(c.bindings).toEqual([
      'SCREEN BUTTON TRIANGLE -> exit_connect_screen [dlgNetAuthenticate.rdr]',
      'SCREEN EVENT ONSTART -> init_socom_online [dlgNetAuthenticate.rdr]',
      'SCREEN EVENT ONSTART -> Connect_flash [dlgNetAuthenticate.rdr]',
      'SCREEN EVENT ONSTART -> monitor_timeout [dlgNetAuthenticate.rdr]',
      'SCREEN EVENT MP_DNAS_ERROR -> OnDNASError [dlgNetAuthenticate.rdr]',
      'SCREEN EVENT MP_MEDIUS_ERROR -> OnNetError [dlgNetAuthenticate.rdr]',
    ]);
    expect(c.edges).toContain('SCREEN EVENT ONSTART init_socom_online SWITCHMENU -> dlgNetServerSelect.rdr');
    expect(c.commands).toHaveLength(27);
    expect(c.commands).toContain('NA (no row)');                  // `init_socom_online`'s failure branch: no row, answers 1
  });
});

describe('every name the chapter uses is answered by a task (DNAS_ENTRY_COMMANDS)', () => {
  it('each pinned spelling reaches a row, and that row has exactly one entry naming the spelling', () => {
    const byRow = new Map(DNAS_ENTRY_COMMANDS.map((e) => [e.name, e]));
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

  it('no entry names a row the chapter does not use (the list is the dialog\'s, not a wish list)', () => {
    const spelt = chapter().commands.map(spelling).filter((s): s is string => s !== null);
    const used = new Set(spelt.map((n) => rowOf(n)!.name));
    for (const e of DNAS_ENTRY_COMMANDS) expect(used.has(e.name), e.name).toBe(true);
    for (const e of DNAS_ENTRY_COMMANDS) for (const s of e.spelt) expect(spelt, `${e.name} spelt ${s}`).toContain(s);
  });

  it('"here" is ONL-03\'s five rows; the rest name their task; a declared row says why', () => {
    for (const e of DNAS_ENTRY_COMMANDS) {
      if (e.status === 'here') {
        expect(e.task).toBe('ONL-03');
        expect(DNAS_COMMAND_ROWS.map((r) => r.name), e.name).toContain(e.name);
      } else {
        expect(e.task).toMatch(/^[A-Z]+-\d+[a-z]?$/);
        if (e.status === 'declared') {
          expect(e.why, e.name).toBeTruthy();
          expect(uiCommandRowByName(e.name)!.task, e.name).toBe(e.task);
        }
      }
    }
    expect(DNAS_ENTRY_COMMANDS.filter((e) => e.status === 'here')).toHaveLength(5);
  });
});
