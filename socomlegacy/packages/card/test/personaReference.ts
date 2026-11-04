/**
 * The reference for OPT-04a's records: the one- and two-persona fixtures' fields, read once with the dev tool under
 * `tools/` (`tools/cardFile.ts` `readCardFile` over the PC project's `third_party/ps2recomp/ps2xTest/fixtures/cards/
 * one.bin` and `two.bin`, 2026-10-02; web research 135 §2) and written as the R7 record keeps them: the password as
 * its length only (RS.R8: the test accounts' passwords are credentials and are not written here). The dev-host check
 * that the fixtures still decode to these values is `tools/test/personaReference.test.ts`.
 *
 * The original's file sizes beside them are the files' own (`one.bin` 6,208 B, `two.bin` 6,400 B; `virgin.bin` 4,784 B
 * with no record).
 */
import type { PersonaRecord } from '../src/persona';

const record = (name: string): PersonaRecord => ({
  HOST: '192.0.2.10', NAME: name, TOWN: '', GENDER: 0, PORT: 10075, PASSWORD: { length: 6 }, SAVEPASSWORD: 1,
  PROFILES: { PROFILE_CHECKSUM: new Array<number>(16).fill(0), PROFILE_INFO: [] },
});

/** `one.bin`'s one record. */
export const ONE_BIN_PERSONAS: readonly PersonaRecord[] = [record('s27pa')];

/** `two.bin`'s two records, in the file's order (the form shows the first). */
export const TWO_BIN_PERSONAS: readonly PersonaRecord[] = [record('s16pc'), record('s16pd')];

/** The three cards' file sizes, by their persona count (`virgin.bin`, `one.bin`, `two.bin`). */
export const FIXTURE_FILE_SIZES: readonly number[] = [4_784, 6_208, 6_400];
