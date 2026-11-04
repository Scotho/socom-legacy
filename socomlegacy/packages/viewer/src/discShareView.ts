import { SHARE_NOT_BUILT } from './discShareWords';

/**
 * DSH-5 (the disc share plan, DSH.R12): the seam between the disc share's screens and its transfer. The screens (the
 * receiver's row and area in Play's "Before you deploy" panel, the sender's dialog the pairing link opens) read only a
 * `DiscShareAdapter`; the transfer (DSH-4, its own `discShare*` modules, never the extraction or copy modules: DSH.R11)
 * implements it later. Until then `stubDiscShare` stands in: the receiver makes a local code and waits; the sender's
 * dialog is asked from the address, and its Yes says the transfer is not built yet. Nothing is sent or requested over
 * the network here. A browser adaptation: nothing of the game.
 */

export type ReceiverPhase = 'idle' | 'requesting' | 'waiting' | 'paired' | 'copying' | 'done' | 'failed';
export interface ReceiverView { phase: ReceiverPhase; code?: string; link?: string; expiresAt?: number; bytes?: number; total?: number; reason?: string }
/**
 * DSH-4: `enter`, the sender's code entry (Settings' "Send game files to another device", DSH.R12 leaves the entry without
 * the QR to us): `code` is '' and `nearby` lists the codes of the requests found on this network (DSH.R9), polled only
 * while it is open.
 */
export type SenderPhase = 'enter' | 'asked' | 'needs-extract' | 'sending' | 'done' | 'failed' | 'declined';
export interface SenderView { phase: SenderPhase; code: string; bytes?: number; total?: number; reason?: string; nearby?: readonly string[] }
export interface DiscShareAdapter {
  /** The receiver's state (this page asking for the files). */
  receiver(): ReceiverView;
  /** Asks for the files: a new code, then waiting for the other device. */
  request(): void;
  /** Withdraws a request not yet answered (or stops a copy). */
  cancel(): void;
  /** The sender's state when this page was opened by a pairing link (`?discshare=<CODE>`), else null. */
  sender(): SenderView | null;
  /** The sender's Yes: only while this page holds a complete extraction (DSH.R7). */
  approve(): void;
  /** The sender's No (or Stop while sending; or Close of the code entry, which ends it). */
  decline(): void;
  /** DSH-4: opens the sender's code entry (`enter`), its nearby requests polled while it stands. */
  openSend(): void;
  /** DSH-4: the code entry's choice (typed or picked): false when it is not a code; else the sender asks as the link's would. */
  choose(code: string): boolean;
  /** Calls `fn` on every change; answers the unsubscribe. */
  onChange(fn: () => void): () => void;
}

/** The address parameter the pairing link carries (DSH.R9: the code filled in). */
export const DISC_SHARE_PARAM = 'discshare';
/** DSH.R9: 6 characters from an unambiguous alphabet (no I, L, O, 0 or 1). */
export const DISC_SHARE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DISC_SHARE_CODE_LENGTH = 6;

/** A code: uniform over the alphabet (bytes past the last whole multiple of its length are drawn again). */
export function makeShareCode(random: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const n = DISC_SHARE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < DISC_SHARE_CODE_LENGTH) {
    for (const b of random(new Uint8Array(DISC_SHARE_CODE_LENGTH * 2))) {
      if (b < limit && out.length < DISC_SHARE_CODE_LENGTH) out += DISC_SHARE_ALPHABET[b % n]!;
    }
  }
  return out;
}

/** The code an address carries (upper-cased; spaces and dashes dropped), or null when it carries none or a malformed one. */
export function readShareCode(search: string): string | null {
  const raw = new URLSearchParams(search).get(DISC_SHARE_PARAM);
  if (raw === null) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== DISC_SHARE_CODE_LENGTH) return null;
  return [...code].every((c) => DISC_SHARE_ALPHABET.includes(c)) ? code : null;
}

/** The pairing link (DSH.R10: this site's origin, so both devices use the same one). */
export const shareLink = (origin: string, code: string): string => `${origin}/?${DISC_SHARE_PARAM}=${code}`;

export interface StubDeps {
  /** This page's address query (the sender's code, when the link opened it). */
  search: string;
  /** This page's origin (the link's). */
  origin: string;
  /** Whether this page holds a complete extraction (DSH.R7: "has the disc in"). */
  complete(): boolean;
  random?: (a: Uint8Array) => Uint8Array;
}

/**
 * The stand-in until DSH-4: a receiver that makes a local code and waits (no request leaves the page), and a sender
 * asked by the address whose Yes ends in `SHARE_NOT_BUILT`. A browser adaptation.
 */
export function stubDiscShare(deps: StubDeps): DiscShareAdapter {
  const subs = new Set<() => void>();
  const changed = (): void => { for (const f of [...subs]) f(); };
  let rx: ReceiverView = { phase: 'idle' };
  let sentCode = readShareCode(deps.search);
  let entering = false;
  let tx: 'open' | 'declined' | 'failed' = 'open';
  return {
    receiver: () => rx,
    request(): void {
      const code = makeShareCode(deps.random);
      rx = { phase: 'waiting', code, link: shareLink(deps.origin, code) };
      changed();
    },
    cancel(): void { rx = { phase: 'idle' }; changed(); },
    sender(): SenderView | null {
      if (entering) return { phase: 'enter', code: '', nearby: [] };
      if (sentCode === null) return null;
      if (tx === 'declined') return { phase: 'declined', code: sentCode };
      if (tx === 'failed') return { phase: 'failed', code: sentCode, reason: SHARE_NOT_BUILT };
      return { phase: deps.complete() ? 'asked' : 'needs-extract', code: sentCode };
    },
    approve(): void {
      if (sentCode === null || tx !== 'open' || !deps.complete()) return;
      tx = 'failed';
      changed();
    },
    decline(): void {
      if (entering) { entering = false; changed(); return; }
      if (sentCode === null) return;
      tx = 'declined';
      changed();
    },
    openSend(): void { entering = true; sentCode = null; tx = 'open'; changed(); },
    choose(code: string): boolean {
      const c = readShareCode(`?${DISC_SHARE_PARAM}=${encodeURIComponent(code)}`);
      if (c === null) return false;
      entering = false; sentCode = c; tx = 'open'; changed();
      return true;
    },
    onChange(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}
