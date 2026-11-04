import { describe, expect, it } from 'vitest';
import {
  PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER, PERSONA_FILE_SIZES, UI_VAR_MODULE, parsePersonaFile, type PersonaRecord,
} from '@s2u/card';
import { DIALOG_EVENTS, VALVE_TYPE } from '@s2u/ui';
import { VALVE_MODULE } from '../src/originalOptions';
import { ONE_BIN_PERSONAS, TWO_BIN_PERSONAS } from '../../card/test/personaReference';
import { page, saveAndLeave, type Page } from './optionsSaveRig';

/**
 * OPT-04 (roadmap 04 OPT-04 under R7; research 229 §5): the persona records inside the whole options save -- the
 * page's `SaveConfig` through `CardCommands`, the `PersonaCard` as its `CardConfigFile`, over a real `Libmc` on OPT-01's
 * rig (`optionsSaveRig.ts`: `save_and_leave`'s order, the twelve files). The records are the reference's
 * (`packages/card/test/personaReference.ts`, the one- and two-persona fixtures' fields); the dev-host variant reads the
 * fixtures themselves (`tools/test/personaSaveDev.test.ts`). Unit tests of a transcription: the reading level.
 */

/** `dlgNetLogin.rdr`'s ten persistent UI variables (research 229 §4: `MPLOCALSOP1-5`, `MPTAUNTMSG1-5`, LONGEVITY PERSISTENT). */
function online(t: Page): void {
  for (let n = 1; n <= 5; n++) {
    t.uiVars.add(`MPLOCALSOP${n}`, { type: 'string', value: `SOP ${n}` }, 3);
    t.uiVars.add(`MPTAUNTMSG${n}`, { type: 'string', value: `TAUNT ${n}` }, 3);
  }
}

/** A reference record into the account list as `UpdateAcctInfo` puts it (`FUN_002fbce0`), its SAVE PASSWORD as the card holds it. */
const login = (t: Page, r: PersonaRecord): void => t.db.update(r.HOST, r.PORT, r.NAME, 'Zq7pwd', r.TOWN, r.GENDER, r.SAVEPASSWORD);

/**
 * A record as the page writes it (OT.R61, SAVE-PASSWORD; `FUN_002fc440` D:L199263-199266): SAVEPASSWORD as the login
 * gives it and, under YES, the password's length -- the reference's own, `login`'s made-up password being six
 * characters as the fixtures' are. *Was, until 2026-10-17: SAVEPASSWORD 0 and no length
 * (`SAVE_PASSWORD_YES_NOT_HONOURED_PLACEHOLDER`, retired).*
 */
const asWritten = (r: PersonaRecord): PersonaRecord => ({ ...r, PASSWORD: { length: r.SAVEPASSWORD ? 6 : 0 } });

const records = (t: Page): PersonaRecord[] => {
  const p = parsePersonaFile(t.saveFile().data);
  if (!p.ok) throw new Error(p.reason);
  return p.personas;
};

describe('OPT-04: the persona records inside the whole options save (OPT-01\'s rig)', () => {
  it('after the save the file\'s data holds the three modules, in the module list\'s order, CAcctDB the personas\' records', () => {
    const t = page();
    online(t);
    t.valves.set('VIBRATION_CONTROLLER', 0, VALVE_TYPE.PERSIST);
    login(t, ONE_BIN_PERSONAS[0]!);
    saveAndLeave(t);
    const data = t.saveFile().data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual([UI_VAR_MODULE, VALVE_MODULE, 'CAcctDB']);
    expect(Object.keys(data[UI_VAR_MODULE] as object)).toHaveLength(10);
    expect(data[VALVE_MODULE]).toEqual({ VIBRATION_CONTROLLER: 0 });
    expect(Object.keys(data.CAcctDB as object)).toEqual(['AcctInfo']);
    expect(records(t)).toEqual(ONE_BIN_PERSONAS.map(asWritten));
    expect(t.events).not.toContain(DIALOG_EVENTS.MEMCARD_ERROR!);
  });

  it('the nominal size follows the persona count: 4,784 with none (virgin.bin), 6,208 with one and 6,400 with two (the ten UI variables a card gains online), past two the placeholder\'s step', () => {
    const sizes = [0, 1, 2, 3].map((count) => {
      const t = page();
      if (count > 0) online(t);                                      // virgin.bin holds none of the ten (R102.9)
      for (let i = 0; i < count; i++) login(t, { ...TWO_BIN_PERSONAS[0]!, NAME: `s16p${i}` });
      saveAndLeave(t);
      expect(records(t)).toHaveLength(count);
      expect(t.files()['BASCUS-97275SOCOMII']).toBe(t.saveFile().size);
      return t.saveFile().size;
    });
    expect(sizes).toEqual([...PERSONA_FILE_SIZES, PERSONA_FILE_SIZES[2]! + PERSONA_FILE_EXTRA_RECORD_BYTES_PLACEHOLDER]);
    expect(sizes).toEqual([4_784, 6_208, 6_400, 6_592]);
  });

  it('a second persona is appended as the original appends (two.bin: s16pc, then s16pd), the first kept where it stands across LoadConfig and a second save', () => {
    const t = page();
    online(t);
    login(t, TWO_BIN_PERSONAS[0]!);
    saveAndLeave(t);
    expect(t.config.restore(t.saveFile().data)).toBe(true);         // the next LoadConfig's read
    expect(t.db.records().map((r) => r.name)).toEqual(['s16pc']);
    login(t, TWO_BIN_PERSONAS[1]!);
    expect(saveAndLeave(t)).toBe(true);                              // the overwrite prompt: the folder is there
    expect(records(t)).toEqual(TWO_BIN_PERSONAS.map(asWritten));
    expect(t.saveFile().size).toBe(6_400);
  });

  it('OPT-03\'s finding on the page\'s path: a file LoadConfig read holding a fourth module and a part of CAcctDB beside AcctInfo saves with the three modules only (FUN_0033dff0 D:L239190-239216)', () => {
    const t = page();
    saveAndLeave(t);
    const read = { ...(t.saveFile().data as object), Stray: { left: 'by another writer' }, CAcctDB: { AcctInfo: [...ONE_BIN_PERSONAS], other: 1 } };
    expect(t.config.restore(read)).toBe(true);
    saveAndLeave(t);
    const data = t.saveFile().data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual([UI_VAR_MODULE, VALVE_MODULE, 'CAcctDB']);
    expect(data.CAcctDB).toEqual({ AcctInfo: ONE_BIN_PERSONAS.map(asWritten) });
  });
});
