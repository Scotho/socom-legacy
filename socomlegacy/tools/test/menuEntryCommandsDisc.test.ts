import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discRoot } from '../dump-dialogs';
import { readMenuEntryPin } from '../menuEntryCommands';

/**
 * MENU-01a's dev-disc check (web research 138 §1; W6.R8): the commands `dlgMenu.rdr` and `dlgMPswitch.rdr` dispatch,
 * re-derived from the disc -- each dialog's bindings, its own set's animations and the library animations its
 * bindings reach, with the bound functions each names -- equal to `menuEntryCommands.pinned.json`. Any change fails
 * here: regenerate with `npx tsx tools/menuEntryCommands.ts --pin` and say in research 138 what moved. The disc
 * resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) it skips.
 */
const DISC = discRoot();
const PIN = resolve(import.meta.dirname, 'menuEntryCommands.pinned.json');

describe.skipIf(!DISC)('the main menu\'s and the online entry\'s commands off the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('equal the pin, dialog by dialog', () => {
    const pinned = JSON.parse(readFileSync(PIN, 'utf8'));
    const now = JSON.parse(JSON.stringify(readMenuEntryPin(DISC!)));
    expect(now.dialogs.length).toBe(pinned.dialogs.length);
    now.dialogs.forEach((d: { name: string }, i: number) => expect(d, d.name).toEqual(pinned.dialogs[i]));
    expect(now.names).toEqual(pinned.names);
  }, 300_000);
});
