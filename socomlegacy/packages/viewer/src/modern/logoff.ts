/**
 * The Sign out question's words (MU-13g of `docs/plans/2026-10-09-modern-ui-parallel.md`; the parity audit's F13,
 * `docs/plans/briefs/modern-ui-parity-audit.md`). The original does not log off at a press: WORLD OF SOCOM's
 * `exit_lobby` raises the popup UIMnLOC #793 with #246 NO and #253 YES, and only YES runs `LobbyLogout`
 * (`packages/ui/test/screens/logoffScreen.test.ts`: "the popup's captions are the disc's: #793 the question, #246 NO,
 * #253 YES"; "YES: the set's chain ... LobbyLogout"; the popup opens with NO lit -- TRIANGLE, then LEFT to YES,
 * CROSS; research 160, ONL-10). The console's sign-out asks these words in its own confirm, No first and focused
 * (`../console/adapters/session`). During the USER AGREEMENT the decline path (#763, `./agreement/agreement`) is the
 * question, not this one.
 *
 * CX-26 (the console plan): the modern confirm that asked them here (`logoffConfirm`, a ds dialog over the retired
 * shell's header, with `./logoff.css`) is retired: the header went with CX-25, and only its tests mounted it since.
 */

/** UIMnLOC #793 (decoded; held to the disc by `logoffScreen.test.ts`). */
export const LOGOFF_QUESTION = 'You will be logging off of SOCOM II Online. Are you sure you want to do this?';
/** #246 and #253, in the panel's case. */
export const LOGOFF_NO = 'No';
export const LOGOFF_YES = 'Yes';
