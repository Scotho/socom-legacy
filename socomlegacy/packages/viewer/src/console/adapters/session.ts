import { MEDIUS_STATUS, USAGE_POLICY_QUERY, USAGE_POLICY_RETRIEVING, type UsagePolicyService } from '@s2u/ui';
import { PERSONA_NAME_MAX, PERSONA_PASSWORD_MAX, type Settings } from '@s2u/card';
import { AGREEMENT_CONTENT_CHANGE, AGREEMENT_DECLINE_QUESTION, AGREEMENT_TITLE, agreementTextOf, pagePolicyService } from '../../modern/agreement/agreement';
import { LOGOFF_NO, LOGOFF_QUESTION, LOGOFF_YES } from '../../modern/logoff';
import { keyOf, personaNameProblem, type ProfileCardEdits } from '../../modern/profile/cardEdits';
import { pageSession, type ModernSession } from '../../modern/session';
import { pageSettings } from '../../pageStore';
import type { Adapters, QuickSignIn } from '../state';

/**
 * The console launcher's session (slice 2, part e): the page's modern session (`../../modern/session` `pageSession`, over
 * the original page's account client at the page's own origin) behind the SignInDialog. Signed in is the session's
 * `signed-in` only: a login leaves it in `agreement` -- the USER AGREEMENT, real, before SOCOM II ONLINE (MU-13a; the
 * original's `dlgUsagePolicy` after every login) -- until Accept (`accept()`); Decline asks the original's #763 question
 * and Yes signs out (`../../modern/agreement/agreement`'s words and text reader, `agreementTextOf` over the original page's
 * policy client). A refusal is said in the session's words (`SignInError.message`, never a status number). The name and
 * the password are held to the card's persona caps (`PERSONA_NAME_MAX` 14, `PERSONA_PASSWORD_MAX` 12, as
 * the retired modern sign-in panel held them, CX-25). Sign-out asks the original's #793 with No first (`../../modern/logoff`).
 *
 * **PERSONA-PERSIST (a) (MISSION OT.R61, the owner, 2026-10-17).** Where the card is the console's (`deps.card`: the
 * launcher; over a game page the card is the game's and none is given), "Remember me" is offered, ticked by default:
 * - a sign-in ticked goes through the session's remember service (`savePassword: true`, the credentials included,
 *   SVC-03a step 1), and its success files the persona through the card package's one writer (`PersonaCard.saveLogin`,
 *   `../../modern/profile/cardEdits` `setPersonaLogin`) with SAVE PASSWORD: YES and the typed password -- of which
 *   `personaFromLogin` keeps the length alone; unticked, the plain service (`savePassword: false`, omitted) and NO filed;
 * - the launcher's load tries the card's persona of this server (`deps.here`: the universe's HOST and PORT) with
 *   SAVEPASSWORD 1 once, by the quick sign-in (step 2): success the agreement, as every sign-in, nothing filed (the
 *   record holds YES already); -978 (the cookie gone) the password asked once, the persona chosen (step 4), and NO
 *   filed so no later load tries again (the review's F1); any other refusal the dialog's words (`quick`);
 * - Sign out keeps the token (step 5: the original's logoff kept SAVE PASSWORD) and the card's flag; "Forget this
 *   device" posts `forget: true` (step 6) and files NO -- SAVEPASSWORD 0, the length 0.
 * A record the card holds for this server is filed in place. A ticked sign-in of a name the card does not hold (Add
 * new) files a new record (fold A: `rememberNewPersona`, as the original's LOGIN files a name its form had not seen --
 * GENDER 0, the default town), unless the name or the form's cap for this server refuses it (`personaNameProblem`:
 * `PERSONA_LIST_ROWS` a server; the card package itself has no cap, `PERSONA_NO_MAXIMUM_READING`): then nothing is
 * filed and the sign-in's toast says why (`note`). An unticked sign-in of a new name files nothing. No password is
 * kept: the field's text is the dialog's until the sign-in, and the cookie is the browser's (HttpOnly; never read
 * here). A browser adaptation with no original (OT.R28).
 */
export type LiveSession = Adapters['session'] & Required<Pick<Adapters['session'], 'agreement' | 'limits' | 'words'>> & {
  /** LOBBY-LINK-DIRECT (`../../lobbyLinkDirect`): the load's quick sign-in is answering (the lobby link's auto-START waits on it). */
  quickPending(): boolean;
  dispose(): void;
};

/** OT.R61: what the remember filing reads and writes of the card (`cardProfileEdits`'s). */
export type RememberCard = Pick<ProfileCardEdits, 'personas' | 'setPersonaLogin' | 'rememberNewPersona' | 'refusal'>;

export interface SessionDeps {
  session?: ModernSession;
  policy?: UsagePolicyService;
  /** OT.R61: the card the console files SAVE PASSWORD on; absent or null, "Remember me" is not offered (the overlay). */
  card?: RememberCard | null;
  /** OT.R61: this server's HOST and PORT (the universe read), or null when it does not read. Asked once, when needed. */
  here?: () => Promise<{ host: string; port: number } | null>;
  /** AGREEMENT-ONCE: where this browser keeps the accounts' acceptances (`AGREEMENT_ACCEPTED_KEY`); the page's own by default. */
  agreements?: Settings;
}

/**
 * AGREEMENT-ONCE (MU.R14 amended, the owner, 2026-10-19, in the merge controller's seat: "Once per device and account"):
 * the USER AGREEMENT is asked at an account's first sign-in on this browser; a later sign-in of the same account on the
 * same server -- the load's quick sign-in included -- accepts it at once and says `AGREEMENT_ACCEPTED_WORDS`, until the
 * text the server answers changes (its digest, `agreementDigest`, is what is kept: never the text, never a password).
 * Kept in this browser only: the server records no acceptance (research 156 §1.4), so a storage that refuses asks again.
 * "Forget this device" forgets it with the cookie. Where this server's address does not read (the overlay over a game
 * page gives none), nothing is kept and every sign-in asks, as the original's `dlgUsagePolicy` (MU-13a). The game's own
 * front end is not this module's. A browser adaptation (OT.R28).
 */
export const AGREEMENT_ACCEPTED_KEY = 's2u.console.agreement.v1';
/** AGREEMENT-ONCE: the one line a sign-in that skipped the agreement says, after "Signed in as <name>.". */
export const AGREEMENT_ACCEPTED_WORDS = 'User agreement accepted earlier';
/** AGREEMENT-ONCE: the agreement's text as kept -- FNV-1a over its UTF-16 code units, eight hex digits; a change test only. */
export function agreementDigest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Fold A: the one line a new record refused says (its reason, in the card checks' words). */
const notRemembered = (why: string): string => `Not remembered on this card: ${why.charAt(0).toLowerCase()}${why.slice(1)}.`;

/** OT.R61 (b): the Sign out confirm's third answer. */
export const FORGET_DEVICE_WORDS = 'Yes, and forget this device';

export function liveSession(notify: () => void, deps: SessionDeps = {}): LiveSession {
  const s = deps.session ?? pageSession();
  const policy = deps.policy ?? pagePolicyService();
  const card = deps.card ?? null;
  const off = s.onChange(() => { notify(); });
  // The review's F2: a read that answered is kept; a failed one (null, or thrown) is not, and is asked again when needed.
  let hereHeld: { host: string; port: number } | null = null;
  let hereAsking: Promise<{ host: string; port: number } | null> | null = null;
  const here = (): Promise<{ host: string; port: number } | null> => {
    if (hereHeld) return Promise.resolve(hereHeld);
    hereAsking ??= (deps.here ? deps.here() : Promise.resolve(null)).catch(() => null)
      .then((h) => { hereAsking = null; if (h) hereHeld = h; return h; });
    return hereAsking;
  };
  const remembers = (): boolean => card !== null && s.remembers();
  // AGREEMENT-ONCE: the accounts' acceptances, `<host>:<port>:<name>` -> the digest of the text accepted.
  const agreements = deps.agreements ?? pageSettings;
  const acceptances = (): Record<string, string> => {
    try {
      const v: unknown = JSON.parse(agreements.get(AGREEMENT_ACCEPTED_KEY) ?? '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {};
    } catch { return {}; }
  };
  const acceptanceKey = async (name: string): Promise<string | null> => {
    const h = await here();
    return h ? `${h.host}:${h.port}:${name}` : null;
  };
  /** The agreement's text as the server answered it (never the waiting line), or null; asked once a page. */
  let textHeld: Promise<string | null> | null = null;
  const policyText = (): Promise<string | null> => {
    textHeld ??= policy.policy({ ...USAGE_POLICY_QUERY }).then((r) => agreementTextOf(r), () => null);
    return textHeld.then((t) => { if (t === null) textHeld = null; return t; });
  };
  /** The text the player was last shown, the one an Accept accepts; null when it never arrived. */
  let shown: string | null = null;
  /** Whether `name` accepted this text on this browser: then the agreement is accepted at once. */
  const acceptedEarlier = async (name: string): Promise<boolean> => {
    const k = await acceptanceKey(name);
    if (k === null || !(k in acceptances())) return false;
    const t = await policyText();
    return t !== null && acceptances()[k] === agreementDigest(t);
  };
  const keepAcceptance = async (name: string, text: string): Promise<void> => {
    const k = await acceptanceKey(name);
    if (k !== null) agreements.set(AGREEMENT_ACCEPTED_KEY, JSON.stringify({ ...acceptances(), [k]: agreementDigest(text) }));
  };
  const dropAcceptance = async (name: string): Promise<void> => {
    const k = await acceptanceKey(name);
    const all = acceptances();
    if (k === null || !(k in all)) return;
    delete all[k];
    agreements.set(AGREEMENT_ACCEPTED_KEY, JSON.stringify(all));
  };
  /** After a login: an account that accepted this text earlier is signed in at once (AGREEMENT-ONCE). */
  const passAgreement = async (name: string): Promise<boolean> => {
    if (s.state() !== 'agreement' || !s.accept || !(await acceptedEarlier(name))) return false;
    // The review's F2: still this account's agreement after the await (a sign-out and another login could intervene).
    if (s.state() !== 'agreement' || s.account()?.name !== name) return false;
    s.accept();
    return true;
  };
  /** This server's record of `name` on the card, or undefined. */
  const recordOf = async (name: string) => {
    const h = await here();
    return h ? card?.personas().find((p) => p.HOST === h.host && p.PORT === h.port && p.NAME === name) : undefined;
  };
  /**
   * Files SAVE PASSWORD on `name`'s record through the card's one writer: YES with the typed password (its length kept;
   * `null`, the length the record had), or NO. Written only when it changes the record. A name the card does not hold,
   * filed YES with a typed password (fold A), is a new record. Answers the one line said when a new record is refused,
   * or -- the review's F2 -- when YES cannot be filed because this server's address does not read ('' none).
   */
  const file = async (name: string, save: boolean, password: string | null): Promise<string> => {
    if (!card) return '';
    const h = await here();
    if (!h) return save ? notRemembered('This server\'s address could not be read') : '';
    const p = card.personas().find((r) => r.HOST === h.host && r.PORT === h.port && r.NAME === name);
    if (!p) {
      if (!save || password === null || !card.rememberNewPersona) return '';
      const why = personaNameProblem(name, card.personas(), h.host, h.port);
      if (why) return notRemembered(why);
      return card.rememberNewPersona({ name, host: h.host, port: h.port, password }) ? '' : notRemembered(card.refusal?.() || 'the card was not written');
    }
    if (!card.setPersonaLogin) return '';
    const length = save ? (password === null ? p.PASSWORD.length : Math.min(Array.from(password).length, PERSONA_PASSWORD_MAX)) : 0;
    if (p.SAVEPASSWORD === (save ? 1 : 0) && p.PASSWORD.length === length) return '';
    card.setPersonaLogin(keyOf(p), { savePassword: save, password: save ? password : null });
    return '';
  };
  let quickTried = false;
  let quickRunning = false;
  /** The quick sign-in's body (`quick`), once its guard has passed. */
  const quickOnce = async (): Promise<QuickSignIn | null> => {
    if (!s.quickSignIn) return null;
    const h = await here();
    const p = h ? card?.personas().find((r) => r.HOST === h.host && r.PORT === h.port && r.SAVEPASSWORD === 1) : undefined;
    if (!p) return null;
    const r = await s.quickSignIn(p.NAME);
    if (r.ok) {
      if (await passAgreement(s.account()?.name ?? p.NAME)) return { ok: true, persona: p.NAME, accepted: AGREEMENT_ACCEPTED_WORDS };
      return s.state() === 'agreement' ? { ok: true, persona: p.NAME, next: 'agreement' } : { ok: true, persona: p.NAME };
    }
    const gone = r.error.status === MEDIUS_STATUS.InvalidPassword;
    // The review's F1: -978 is the cookie gone (step 4: the server cleared it), so the card files NO -- the next load,
    // or another tab, tries no quick sign-in that would only count against the login limit; a ticked sign-in files YES.
    if (gone) await file(p.NAME, false, null);
    return {
      ok: false, persona: p.NAME, askPassword: gone,
      error: gone ? `This browser no longer remembers ${p.NAME}. Enter its password.` : r.error.message,
    };
  };
  return {
    signedIn: () => s.state() === 'signed-in',
    persona: () => s.account()?.name ?? '',
    async signIn(persona, password, remember = false) {
      const ticked = remember && remembers();
      const r = await s.signIn({ name: persona, password, remember: ticked });
      if (!r.ok) return { ok: false, error: r.error.message };
      const note = card ? await file(persona, ticked, ticked ? password : null) : '';
      const passed = await passAgreement(s.account()?.name ?? persona);
      const next = s.state() === 'agreement' ? { next: 'agreement' as const } : passed ? { accepted: AGREEMENT_ACCEPTED_WORDS } : {};
      return note ? { ok: true, ...next, note } : { ok: true, ...next };
    },
    async signOut(forget = false) {
      const name = s.account()?.name ?? null;
      await s.signOut({ forget });
      if (forget && name !== null && card) await file(name, false, null);
      if (forget && name !== null) await dropAcceptance(name);
    },
    remembers,
    forgets: () => remembers(),
    quickPending: () => quickRunning,
    async quick(): Promise<QuickSignIn | null> {
      if (quickTried || !remembers() || !s.quickSignIn || s.state() !== 'signed-out') return null;
      quickTried = true;                                             // once a page: no retry loop (step 4)
      quickRunning = true;                                           // LOBBY-LINK-DIRECT: from the call to its answer
      try { return await quickOnce(); } finally { quickRunning = false; }
    },
    agreement: {
      title: AGREEMENT_TITLE,
      lead: AGREEMENT_CONTENT_CHANGE,
      waiting: USAGE_POLICY_RETRIEVING,
      question: AGREEMENT_DECLINE_QUESTION,
      async text(): Promise<string> {
        shown = await policyText();
        return shown ?? USAGE_POLICY_RETRIEVING;                    // never answered: the original's first line stays
      },
      accept(): void {
        const name = s.state() === 'agreement' ? s.account()?.name ?? null : null;
        const text = shown;
        s.accept?.();
        // AGREEMENT-ONCE: kept only for a text the player saw (one that never arrived is asked again).
        if (name !== null && text !== null) void keepAcceptance(name, text);
      },
    },
    limits: () => ({ name: PERSONA_NAME_MAX, password: PERSONA_PASSWORD_MAX }),
    words: () => ({ signOutTitle: 'Sign out?', signOutLead: LOGOFF_QUESTION, no: LOGOFF_NO, yes: LOGOFF_YES, forget: FORGET_DEVICE_WORDS }),
    dispose(): void { off(); },
  };
}
