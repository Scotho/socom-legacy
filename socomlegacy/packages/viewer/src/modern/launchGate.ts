import { LOGOUT_TIMEOUT_MS } from '@s2u/ui';

/**
 * The page's START boundary (MU-F2a of the modern-UI plan; dot's compatibility review, 2026-10-10 05:28:33Z P1,
 * re-raised 05:37:26Z). A browser adaptation (MU.R1): the page's wiring, nothing of the game.
 *
 * Every launch of the original's front end over the visitor's disc passes it, in either of the page's two seams
 * (MU2-7, re-read since CX-9b took the setup page's START away): the game page's disc page (`../pageEntry` `offerDisc`,
 * which mounts the front end once a disc opens) and the console's START (`../console/adapters/launch` `liveLaunch.run`,
 * after the session's own sign-out). Each reads `beforeLaunch` before it takes its page down and mounts the front end
 * with the opened disc's request. What the modern UI must end first registers here: the overlay's own session on the
 * disc page (`./overlay` `mountOverlay`, `registerBeforeLaunch` over `./session` `endForLaunch`), whose server session
 * would otherwise still hold the account when the original's LOGIN logs it in (AccountLoggedIn, -997;
 * `central/src/accounts.ts` `login`). (`./session` `registerSessionForLaunch` was the retired modern shell's, in setup
 * mode; CX-25 retired the shell and its Launch, `./launch/launch`.) The modern UI launches nothing of its own.
 *
 * A hook answers the wait it needs, or null for none. When every hook answers null -- signed out, offline, nothing in
 * flight -- or none is registered (the modern chunk never loaded), `beforeLaunch` answers null and START mounts at once,
 * in the same click, as before. Otherwise the waits are awaited together, bounded by LOGOUT_TIMEOUT_MS (the port's
 * bound on an unanswered logout, `@s2u/ui` lobbyClient's LOGOUT_UNANSWERED_ADAPTATION -- an adaptation, not a value of the
 * original's), and START goes on
 * whatever they come to: a hook that throws or rejects holds nothing.
 *
 * Kept per document (as `./discStore`), and free of the modern UI's chunk, so the entry takes only this small module.
 * Server logout only: what the modern UI lets go of at the hand-over follows the disc store's `in-game` (OV-1; the
 * `./launcher` module that disposed on it went with CX-9b).
 */
export type BeforeLaunchHook = () => Promise<void> | null;

const hooks = new WeakMap<Document, Set<BeforeLaunchHook>>();

/** Registers `hook` for `doc`'s START; answers the unregister. */
export function registerBeforeLaunch(doc: Document, hook: BeforeLaunchHook): () => void {
  let set = hooks.get(doc);
  if (!set) { set = new Set(); hooks.set(doc, set); }
  const held = set;
  held.add(hook);
  return () => { held.delete(hook); };
}

/** The wait `beforeLaunch` last answered for a document, until it settles (`launchPending`). */
const pending = new WeakMap<Document, Promise<void>>();

/**
 * The wait of a START in flight on `doc`: non-null from the click that `beforeLaunch` held until the wait settles (its
 * logout answered, or LOGOUT_TIMEOUT_MS), null otherwise. A START's presser (the console's hand-over, `../console/adapters/launch`) reads it
 * to tell "accepted, waiting" from "refused": the page stays up while the wait runs. Settles before any later
 * `.then` on the same wait, so by the time a presser's continuation runs `pageEntry`'s mount has been taken.
 *
 * Precondition: the presser reads it right after its click, so `../startup` `Startup`'s click must call `pageEntry`'s
 * `launch()` (and so `beforeLaunch`) synchronously; a click that deferred it would read null here and `pageStart.run`
 * would answer false for a START that is only late.
 */
export function launchPending(doc: Document): Promise<void> | null {
  return pending.get(doc) ?? null;
}

const timeout = (ms: number, fn: () => void): (() => void) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); };

/**
 * Runs `doc`'s hooks: null when none has anything to wait for (START mounts at once); else one wait over them all,
 * settled when they have all settled or at LOGOUT_TIMEOUT_MS, whichever is first. `after` is the one-shot timer (a
 * test's clock); absent, `setTimeout`.
 */
export function beforeLaunch(doc: Document, after: (ms: number, fn: () => void) => () => void = timeout): Promise<void> | null {
  const waits: Promise<void>[] = [];
  for (const hook of [...(hooks.get(doc) ?? [])]) {
    let w: Promise<void> | null;
    try { w = hook(); } catch { w = null; }
    if (w) waits.push(w);
  }
  if (waits.length === 0) return null;
  const wait = new Promise<void>((done) => {
    const cancel = after(LOGOUT_TIMEOUT_MS, done);
    void Promise.allSettled(waits).then(() => { cancel(); done(); });
  });
  pending.set(doc, wait);
  void wait.then(() => { if (pending.get(doc) === wait) pending.delete(doc); });
  return wait;
}
