/**
 * Product adaptation (REVIEW-1 finding 3; an instrument, never the game's behaviour): pairing a script with the page.
 * Since AX-3 the gateway holds `POST /api/v1/pair` (and `agent_pair`) until the page answers, up to `waitSeconds`
 * (`packages/forge-agent/src/sessions.ts` `PAIR_WAIT_SECONDS`). A script that awaits the pair before it clicks Allow
 * stalls until that wait or its own request timeout (Playwright's 30 s default) ends. So: start the call, answer in the
 * page, then await the call -- it answers `paired`.
 */

/** The wait a script asks: inside the gateway's bound (0..max) and well under the request timeout below. */
export const PROBE_PAIR_WAIT_SECONDS = 45;
/** The script's request timeout for the held pair: longer than the wait it asks, so the gateway answers first. */
export const PROBE_PAIR_TIMEOUT_MS = 60_000;

/** The REST pair's body: the invitation, the permissions asked, the client's name and the wait. */
export function pairBody(invitation: string, permissions: readonly string[], clientName: string): {
  invitation: string; permissions: readonly string[]; clientName: string; waitSeconds: number;
} {
  return { invitation, permissions, clientName, waitSeconds: PROBE_PAIR_WAIT_SECONDS };
}

/**
 * Starts the held pair and returns the call itself, to be awaited after the page has answered. A rejection that lands
 * before it is awaited (the test's context closing first) is not left unhandled; awaiting it still throws.
 */
export function beginPair<R>(start: () => Promise<R>): Promise<R> {
  const call = start();
  call.catch(() => undefined);
  return call;
}

/** Starts the pair, answers in the page (`answer`: the Allow click, or Decline), then awaits the pair's outcome. */
export async function pairThroughPage<R>(start: () => Promise<R>, answer: () => Promise<void>): Promise<R> {
  const call = beginPair(start);
  await answer();
  return call;
}
