import type { UsagePolicyChunk, UsagePolicyService } from '@s2u/ui';
import { accountServiceBase } from '../../connectHost';
import { fetchUsagePolicyService } from '../../usagePolicyHost';

/**
 * The USER AGREEMENT's words and its text's reply (MU-13a of `docs/plans/2026-10-09-modern-ui-parallel.md`; the parity
 * audit's F12, `docs/plans/briefs/modern-ui-parity-audit.md`), as the console's sign-in shows the original's
 * `dlgUsagePolicy` (research 128 §4.6; research 156 §1): `../../console/adapters/session` reads `agreementTextOf`,
 * `pagePolicyService` and the AGREEMENT_* words. A browser adaptation (MU.R1); the flow step is the original's (MU.R12,
 * MU.R14): shown after every login, before any list (`../session`, state `agreement`).
 *
 * **The text: the original page's client, no second wire.** `fetchUsagePolicyService` (`../../usagePolicyHost`, ONL-08)
 * posts `USAGE_POLICY_QUERY` (`{ type: 0 }`, Usage: `FUN_002f79f0` +0x28) to SVC-05's `POST /texts/policy`
 * (`packages/central/src/serverTexts.ts`) and checks the `{ chunks }` reply. The chunks are joined as `FUN_002f7ac0`
 * (D:L196655-196712) joins them: a non-success status does nothing; success chunks gather until one carries EndOfText,
 * and only then is the text set (`agreementTextOf`). Until then the original shows what `GetUsagePolicy` set first,
 * "Retrieving Usage Policy....." (`USAGE_POLICY_RETRIEVING`, the ELF's 0x3f5840; `FUN_002f79f0` D:L196630-196652;
 * research 156 §1.3).
 *
 * CX-26 (the console plan): the modern panel that drew the agreement here (`agreementPanel`, its #763 question and its
 * focus keys, with `./agreement.css`) is retired: the modern sign-in that mounted it went with CX-25, and only its tests
 * mounted it since. The console's sign-in draws the agreement in its own dialog over these words.
 */

/** The title, the original's #756 "USER AGREEMENT" (UIMnLOC; research 156 §1.1) in the modern panel's case. */
export const AGREEMENT_TITLE = 'User agreement';

/**
 * The layout's literal `ContentChangeTxt` on `dlgUsagePolicy` (READERC.ZAR; research 156 §1.1: a WRAPPEDTEXT
 * literal of 45 bytes), the line the original shows above the agreement.
 */
export const AGREEMENT_CONTENT_CHANGE = 'GAME EXPERIENCE MAY CHANGE DURING ONLINE PLAY';

/**
 * DECLINE's question, UIMnLOC #763 (decoded; held to the disc by `packages/ui/test/screens/usagePolicyScreen.test.ts`,
 * "the layout's captions are the disc's"); its buttons #246 NO and #253 YES.
 */
export const AGREEMENT_DECLINE_QUESTION =
  'Not accepting the User Agreement will disconnect you from SOCOM II Online. Are you sure you want to disconnect?';

/**
 * MU_AGREEMENT_SCROLL_STEP_ADAPTATION: UP / DOWN scrolled the retired modern panel's text by this many CSS pixels. The
 * original scrolls its WRAPPEDTEXT one SPACING (20 of its 640 x 448 frame, R156.1); the modern panel's lines were its
 * own type's, so the step was one of its lines. Read by no code since CX-26; kept as the step the console's
 * `AGREEMENT_SCROLL_STEP` cites (`../../console/grammar`). A browser adaptation.
 */
export const MU_AGREEMENT_SCROLL_STEP_ADAPTATION = 24;

/**
 * MU_AGREEMENT_SERVER_ADAPTATION: the page's policy service (`pagePolicyService`, the console's sign-in's) asks for the
 * agreement at the base its account requests use (`accountServiceBase`, `ACCOUNT_SERVICE_OWN_ORIGIN_ADAPTATION`): the
 * agreement of the server the player just signed in to. The original page's own screen asks at ONL-04's base
 * (`universeServiceBase`, `server=`'s origin; `../../frontEnd` `usagePolicy`), the same as this one except under a crafted
 * `server=` link. The route, the body and the client are the original page's. A browser adaptation, for the online
 * seat's read (MU.R6).
 */
export const MU_AGREEMENT_SERVER_ADAPTATION = "the agreement asked at the account requests' base, the server signed in to" as const;

/**
 * The agreement's text from one reply, as `FUN_002f7ac0` (D:L196655-196712) builds `UsagePolicy`: chunks of status 0
 * gather in order; one with EndOfText sets the text; a chunk of another status changes nothing. Null: no text set.
 */
export function agreementTextOf(chunks: readonly UsagePolicyChunk[]): string | null {
  const parts: string[] = [];
  let text: string | null = null;
  for (const c of chunks) {
    if (c.status !== 0) continue;
    parts.push(c.policy);
    if (c.endOfText) text = parts.join('');
  }
  return text;
}

/** The page's policy service: the original page's client at the account requests' base (`MU_AGREEMENT_SERVER_ADAPTATION`). */
export function pagePolicyService(win: Window = window): UsagePolicyService {
  const dev = (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true;   // as `../session`'s `pageSession`
  return fetchUsagePolicyService(accountServiceBase(win.location.search, win.location, dev));
}
