import { describe, expect, it } from 'vitest';
import { LOGOFF_NO, LOGOFF_QUESTION, LOGOFF_YES } from '../../src/modern/logoff';

/**
 * MU-13g (parity audit F13): the original asks before logging off -- UIMnLOC #793 with #246 NO and #253 YES
 * (`packages/ui/test/screens/logoffScreen.test.ts`, "the popup's captions are the disc's"; its chain reaches
 * `LobbyLogout` only after YES, and the popup opens on NO: TRIANGLE, then LEFT to YES).
 *
 * CX-25 (the console plan): the modern shell's header, whose Sign out asked through the modern confirm, is retired; the
 * console's sign-out asks #793 in its own confirm over the same words (`../../src/console/adapters/session` reads
 * LOGOFF_*; `test/console/adapters/session.test.ts`, "the confirm asks #793, No first and focused"). CX-26: the modern
 * confirm itself (`logoffConfirm`), mounted by its tests alone since, is retired too, its cases named in CX-26's commit
 * and the console plan's Log. The words stay held here.
 */
describe("the words are the disc's (F13)", () => {
  it("the words are the disc's decoded #793, #246 and #253", () => {
    expect(LOGOFF_QUESTION).toBe('You will be logging off of SOCOM II Online. Are you sure you want to do this?');
    expect([LOGOFF_NO, LOGOFF_YES]).toEqual(['No', 'Yes']);
  });
});
