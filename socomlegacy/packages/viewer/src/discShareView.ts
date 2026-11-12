import { SHARE_NOT_BUILT } from './discShareWords';

/**
 * DSH-5 (the disc share plan, DSH.R12): the seam between the disc share's screens and its transfer. The screens (the
 * receiver's row and area in Play's "Before you deploy" panel, the sender's dialog the pairing link opens) read only a
 * `DiscShareAdapter`; the transfer (DSH-4, its own `discShare*` modules, never the extraction or copy modules: DSH.R11)
 * implements it later. Until then `stubDiscShare` stands in: the receiver makes a local code and waits; the sender's
 * dialog is asked from the address, and its Yes says the transfer is not built yet. Nothing is sent or requested over
 * the network here. A browser adaptation: nothing of the game.
 */

/** RB-26: `declined`, a hosted share's No (a request made against a host's link). */
export type ReceiverPhase = 'idle' | 'requesting' | 'waiting' | 'paired' | 'copying' | 'done' | 'failed' | 'declined';
/**
 * DSH.R15: `via`, once the devices are connected -- directly, or through Cloudflare's relay (`./discShareRtc`). RB-26:
 * `hosted`, a request made against a host's link (`?discshare-host=<token>`): its code is shown for the host to match,
 * with no link of its own and no 10-minute expiry (it lives while both pages poll, RB-25).
 */
export interface ReceiverView {
  phase: ReceiverPhase; code?: string; link?: string; expiresAt?: number; bytes?: number; total?: number; reason?: string; via?: 'direct' | 'relay'; hosted?: boolean;
}
/**
 * RB-26 (the replay batch plan; DSH.R16 with its Q9-Q11 defaults): the host mode -- the page with the disc holds a share
 * open (`open`; `needs-extract` without a complete extraction, DSH.R7: nothing opened at central), its `link` asked by
 * other pages. `pending` lists the requests in the order they arrived -- those bound to the host and the receiver-made
 * codes found on this network alike -- each `asked`, or `queued` once said Yes while another copies (`place`: its turn,
 * from 1). `active` is the one copy under way; `last` how the latest one ended. A browser adaptation, product track.
 */
export type HostPhase = 'idle' | 'opening' | 'open' | 'needs-extract' | 'failed';
export interface HostRequest { id: string; code: string; since: number; state: 'asked' | 'queued'; place?: number }
export interface HostActive { id: string; code: string; bytes: number; total: number; via?: 'direct' | 'relay' }
export interface HostView {
  phase: HostPhase; link?: string; reason?: string; pending: readonly HostRequest[]; active?: HostActive;
  last?: { code: string; outcome: 'done' | 'failed' | 'stopped'; reason?: string };
}
/**
 * DSH-4: `enter`, the sender's code entry (Settings' "Send game files to another device", DSH.R12 leaves the entry without
 * the QR to us): `code` is '' and `nearby` lists the codes of the requests found on this network (DSH.R9), polled only
 * while it is open.
 */
export type SenderPhase = 'enter' | 'asked' | 'needs-extract' | 'sending' | 'done' | 'failed' | 'declined';
export interface SenderView { phase: SenderPhase; code: string; bytes?: number; total?: number; reason?: string; nearby?: readonly string[]; via?: 'direct' | 'relay' }
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
  /** RB-26: the host mode's state (optional: the stub and the screens' fakes have none). */
  host?(): HostView;
  /** RB-26: opens a hosted share (only with a complete extraction, DSH.R7). */
  openHost?(): void;
  /** RB-26 (Q10): ends the share -- the copy under way stopped, every request withdrawn. */
  closeHost?(): void;
  /** RB-26: the host's Yes to request `id` (gated on a complete extraction): it copies now, or queues behind the one copying. */
  approveReq?(id: string): void;
  /** RB-26: the host's No to request `id` (a receiver-made code from the network is only hidden here). */
  declineReq?(id: string): void;
  /** RB-26: stops the copy under way; the next queued request goes. */
  stopActive?(): void;
  /**
   * RB-26: whether a host's link opened this page (`?discshare-host=<token>`): its request is made against that host,
   * and the launcher opens Play's share area on it once (optional: absent, no).
   */
  hostLinked?(): boolean;
  /**
   * DSH-10 (the disc share plan, DSH.R17; DSH.R7): whether this page holds a complete extraction -- the one rule that
   * enables "Send Game Files" and the disc mark's "SEND DISC" (optional: absent, no -- the stub and a screen's fake).
   */
  complete?(): boolean;
}

/**
 * RB-26, Q11: whether ending the share now (a deploy, the panel closed) stops something under way -- a copy, or requests
 * waiting for the host's answer -- so the launch first says so (`SHARE_DEPLOY_STOPS`). DSH-10: here beside `HostView`, so
 * the console reads it without the transfer's modules (`./discShare` re-exports it).
 */
export const hostBusy = (v: HostView | null | undefined): boolean => !!v && (v.active !== undefined || v.pending.length > 0);

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
/** RB-26: the address parameter of a host's link (RB-25's token). */
export const DISC_SHARE_HOST_PARAM = 'discshare-host';
/** RB-26: a host's link (DSH.R10: this site's origin). The token is base64url, so it needs no escaping. */
export const shareHostLink = (origin: string, token: string): string => `${origin}/?${DISC_SHARE_HOST_PARAM}=${encodeURIComponent(token)}`;
/**
 * RB-26: a host link's token as a page reads it -- base64url (central's is 18 random bytes, 24 characters,
 * `packages/central/src/discShareHttp.ts`), 16 to 64 of them -- else null: none, or not a token. A browser adaptation.
 */
export const DISC_SHARE_HOST_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
/** RB-26: the host's token an address carries (`?discshare-host=<token>`), or null when it carries none or a malformed one. */
export function readShareHostToken(search: string): string | null {
  const raw = new URLSearchParams(search).get(DISC_SHARE_HOST_PARAM);
  return raw !== null && DISC_SHARE_HOST_TOKEN.test(raw) ? raw : null;
}

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
