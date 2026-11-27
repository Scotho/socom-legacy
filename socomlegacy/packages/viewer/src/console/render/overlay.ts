import { OSK_ROWS } from '../grammar';
import { btn, esc, ico } from '../icons';
import { closeButtonHtml, dialogHeadHtml } from './close';
import { deployPanelHtml, deploySteps } from '../deployPanel';
import { LOAD_IN_DISC, loadInLobbyLinkAt, loadInPanelHtml } from '../../loadIn';
import { conflictOffer } from './remap';
import { installAppHtml } from './installApp';
import { senderDialogHtml } from './discShare';
import { SHARE_CLOSE_CONFIRM, SHARE_DEPLOY_CONFIRM } from '../../discShareWords';
import { extractHtml } from './extract';
import { fieldMeta } from './profile';
import { PERSONA_WORDS } from '../adapters/profile';
import { skipMenuOn, skipMenuOpens } from '../skipMenu';
import { cardNames, SAMPLE_DATA, selectedRoom, type Adapters, type ConsoleState } from '../state';

/**
 * The dialogs over the stage (the S2U Briefing design system's prototype, `renderOverlay`; its SignInDialog,
 * OnScreenKeyboard, Confirm and LaunchScreen READMEs) and the toast. A browser adaptation with no original (OT.R28).
 *
 * One change against the prototype, from its own SignInDialog README ("A password manager can fill the real
 * `<input type="password">` the consumer keeps visually inside the box"): the password box is a `label` over a real
 * password field, visually hidden inside it, so typing on a keyboard (and a password manager) works in every build
 * while the pad's keymap is a development build's only (OT.R29). The box still draws the dots and the caret.
 *
 * MODAL-CLOSE (the owner, 2026-10-17; OT.R62): every dialog's head carries the close button (`./close`), Circle's press:
 * what Circle does in that dialog -- on a confirm No, the safe answer. Escape does the same in every build (`../input`).
 */
const WIDE: readonly [string, string][] = [['SHIFT', 'l2'], ['SPACE', 'triangle'], ['DELETE', 'square'], ['SIGN IN', 'r2']];

/** The password field's id (the page keeps its value in step with the dialog's text). */
export const PASSWORD_ID = 'cx-password';
/** The Search dialog's field (slice 2). */
export const SEARCH_ID = 'cx-search';

/**
 * The OnScreenKeyboard (the prototype's grid, ten columns and the wide row): `act` names the dialog's key verb, `done`
 * the Done key's word ("named for the action", the OnScreenKeyboard README).
 */
function oskHtml(k: { kr: number; kc: number; shift: boolean; focused: boolean }, act: 'key' | 'qkey' | 'fkey', done: string): string {
  return `<div class="cx-osk" role="group" aria-label="On-screen keyboard">
        ${OSK_ROWS.map((r, ri) => `<div class="cx-osk__row">${r.split('').map((ch0, ci) => {
          const ch = k.shift ? ch0.toUpperCase() : ch0;
          return `<button type="button" class="cx-osk__key ${k.focused && k.kr === ri && k.kc === ci ? 'is-focused' : ''}" data-act="${act}" data-r="${ri}" data-c="${ci}" data-fk="${act}-${ri}-${ci}">${esc(ch)}</button>`;
        }).join('')}</div>`).join('')}
        <div class="cx-osk__row is-wide">${WIDE.map(([w], wi) => `<button type="button" class="cx-osk__key is-word ${wi === 3 ? 'is-done' : ''} ${wi === 0 && k.shift ? 'is-on' : ''} ${k.focused && k.kr === 4 && k.kc === wi ? 'is-focused' : ''}" data-act="${act}" data-r="4" data-c="${wi}" data-fk="${act}-4-${wi}">${wi === 1 ? btn('triangle') : wi === 2 ? btn('square') : ''}${wi === 3 ? done : w}</button>`).join('')}</div>
      </div>`;
}

/**
 * The server's news (slice 2; the news section's texts, `../adapters/server`): the universe card -- name, users,
 * description, every news chunk -- and the announcement, signed in only (MU.R6). CX-29 (CX.R14): Circle closes it; the
 * project's News page is not linked from here. Every server text is drawn as text.
 */
function newsHtml(a: Adapters): string {
  const n = a.server.news?.();
  const u = n?.universe;
  const an = n?.announcement;
  const uni = !u || u.kind === 'waiting' ? '<p class="cx-dialog__note">Reading the universe…</p>'
    : u.kind === 'failed' ? '<p class="cx-dialog__note">The universe did not answer.</p>'
    : `<p class="cx-dialog__lead">${esc(u.name)} · ${u.users} / ${u.max} users</p>${u.description ? `<p class="cx-dialog__note">${esc(u.description)}</p>` : ''}${u.news.map((x) => `<p class="cx-dialog__note">${esc(x)}</p>`).join('')}`;
  const ann = !an || an.kind === 'signed-out' ? 'Sign in to read the server\'s announcement.'
    : an.kind === 'waiting' ? 'Reading the announcement…' : an.kind === 'failed' ? 'The announcement did not answer.' : an.text;
  return `<div class="cx-scrim" data-key="news"><div class="cx-dialog cx-dialog--lx is-focused" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="nw-title">
      ${dialogHeadHtml('Server news', 'nw-title', 'cx-dialog', true)}
      ${uni}
      <div class="cx-readout__head">Announcement</div>
      <p class="cx-dialog__note">${esc(ann)}</p>
    </div></div>`;
}

/** Search (slice 2: the live lobby's name query, Triangle in the room list; "Controller UI" 2 and 5): the keyboard shown. */
function searchHtml(s: ConsoleState): string {
  const q = s.q;
  return `<div class="cx-scrim" data-key="search"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="sq-title">
      ${dialogHeadHtml('Search rooms', 'sq-title')}
      <p class="cx-dialog__lead">Rooms whose name holds what you type.</p>
      <form class="cx-field" data-form="search">
        <span class="cx-field__label" id="sq-label">Name</span>
        <label class="cx-field__box ${q.text ? '' : 'is-empty'}" for="${SEARCH_ID}"><input class="s2u-visually-hidden" type="search" id="${SEARCH_ID}" name="query" autocomplete="off" maxlength="64" aria-labelledby="sq-label"><span aria-hidden="true">${q.text ? esc(q.text) : 'Use the keys below, or type on a keyboard'}</span><span class="cx-caret"></span></label>
      </form>
      ${oskHtml({ kr: q.kr, kc: q.kc, shift: q.shift, focused: true }, 'qkey', 'SEARCH')}
    </div></div>`;
}

/** Add new's name field's id (slice 2: a persona the card does not hold). */
export const NAME_ID = 'cx-persona-name';
/** CX-PERSONA: the Profile's text field (the match name, a home town, a phrase, the new persona's name and home town). */
export const FIELD_ID = 'cx-profile-field';

/**
 * CX-PERSONA: the Profile's text field, in the sign-in dialog's parts -- its field box over a real text field, visually
 * hidden inside it (a keyboard types natively in every build, a field and not navigation), the on-screen keyboard, the
 * refusal on its error line in the retired section's words, and the count against the field's cap. Done is R2 (or the
 * keyboard's Done key); Circle cancels, nothing written.
 */
function fieldHtml(s: ConsoleState, a: Adapters): string {
  const fd = s.fd;
  const m = fieldMeta(s, a);
  const n = Array.from(fd.text).length;
  return `<div class="cx-scrim" data-key="field"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="fd-title">
      ${dialogHeadHtml(esc(m.title), 'fd-title')}
      ${m.lead ? `<p class="cx-dialog__lead">${esc(m.lead)}</p>` : ''}
      <form class="cx-field" data-form="field">
        <span class="cx-field__label" id="fd-label">${esc(m.title)}</span>
        <label class="cx-field__box ${fd.text ? '' : 'is-empty'}" for="${FIELD_ID}"><input class="s2u-visually-hidden" type="text" id="${FIELD_ID}" name="value" autocomplete="off" maxlength="${m.cap}" aria-labelledby="fd-label"><span aria-hidden="true">${fd.text ? esc(fd.text) : 'Use the keys below, or type on a keyboard'}</span><span class="cx-caret"></span></label>
        ${fd.error ? `<p class="cx-field__error" role="alert">${esc(fd.error)}</p>` : ''}
      </form>
      ${oskHtml({ kr: fd.kr, kc: fd.kc, shift: fd.shift, focused: true }, 'fkey', m.done)}
      <p class="cx-dialog__note" data-field-count>${n}/${m.cap}</p>
    </div></div>`;
}

/** CX-PERSONA: a persona's Delete, behind the console's Confirm (No first and focused): the retired section's question (`DeletePersona`'s #603). */
export const PERSONA_DELETE_CONFIRM = { title: 'Delete this persona?', no: 'No', yes: 'Yes, delete' } as const;

function personaDeleteHtml(s: ConsoleState, a: Adapters): string {
  const v = s.pf.id === null ? null : a.profile?.editor(s.pf.id) ?? null;
  const name = v?.kind === 'ok' ? v.name : '';
  return wordsConfirmHtml(s, { ...PERSONA_DELETE_CONFIRM, lead: PERSONA_WORDS.deleteLead(name) });
}

/**
 * ADD-NEW (the owner, 2026-10-17: "On the sign in page, "ANOTHER" should just be replaced with "ADD NEW""): the last
 * tile's words, a persona the card does not hold, typed by name. The title in the card's personas' own casing, drawn
 * upper-case by part G's `.cx-persona__name` as theirs are: ADD NEW on the page. The code's name stays `another`.
 */
export const SIGNIN_ADD_NEW_WORDS = { title: 'Add new', sub: 'Type a persona name' } as const;

/** One persona tile (`i` its index: the card's personas, then Add new). */
function tile(s: ConsoleState, i: number, name: string, sub: string, icon: 'user' | 'plus'): string {
  const si = s.si;
  return `<button type="button" role="radio" aria-checked="${si.persona === i}" class="cx-persona ${si.persona === i ? 'is-current' : ''} ${si.zone === 'personas' && si.persona === i ? 'is-focused' : ''}" data-act="persona" data-i="${i}" data-fk="persona-${i}"><span class="cx-persona__tile">${ico(icon)}</span><span><span class="cx-persona__name">${esc(name)}</span><br><span class="cx-persona__sub">${esc(sub)}</span></span></button>`;
}

/**
 * CX-25's fold (the merge controller's call, product track; the words a matter of taste, logged in the console plan):
 * account creation stays in the game's own ONLINE flow -- its LOGIN, as the original's -- and the console has no form
 * for it, so the sign-in says where a player with no account goes. ONLINE is the original main menu's item. The in-game
 * words only where the game's front end runs under the overlay (`ConsolePageReads.frontEndRuns`, CX-25's review F2);
 * everywhere else -- the launcher, and the overlay over the forge, the test room, the launch sheet or the disc page
 * before START -- the launcher's.
 */
export const SIGNIN_NO_ACCOUNT_WORDS = {
  page: 'No account yet? Start the game and choose ONLINE to create one.',
  overlay: 'No account yet? Choose ONLINE in the game to create one.',
} as const;

function signInHtml(s: ConsoleState, a: Adapters): string {
  const si = s.si;
  const names = cardNames(a);
  const another = si.persona >= names.length;
  // The sample adapters keep the prototype's dialog: Add new is refused, so it has no name field.
  const nameField = another && a.data !== SAMPLE_DATA;
  const persona = another ? si.name : names[si.persona] ?? '';
  const cap = a.session.limits?.() ?? { name: 24, password: 24 };
  const done = nameField && si.target === 'name' ? 'NEXT' : 'SIGN IN';
  const caret = (field: 'name' | 'password'): string => (si.busy || si.target !== field ? '' : '<span class="cx-caret"></span>');
  return `<div class="cx-scrim" data-key="signin"><div class="cx-dialog cx-dialog--lx" role="dialog" aria-modal="true" aria-labelledby="si-title">
      ${dialogHeadHtml('Sign in', 'si-title', 'cx-dialog', true)}
      <p class="cx-dialog__lead">Pick a persona from your memory card, then enter its password.</p>
      <div class="cx-personas" role="radiogroup" aria-label="Persona">
        ${names.map((n, i) => tile(s, i, n, `Memory card slot ${a.card.slot()}`, 'user')).join('')}
        ${tile(s, names.length, SIGNIN_ADD_NEW_WORDS.title, SIGNIN_ADD_NEW_WORDS.sub, 'plus')}
      </div>
      <form class="cx-field" data-form="signin" autocomplete="on">
        ${nameField ? `<span class="cx-field__label" id="name-label">Persona name</span>
        <label class="cx-field__box ${si.name ? '' : 'is-empty'}" for="${NAME_ID}"><input class="s2u-visually-hidden" type="text" id="${NAME_ID}" name="username" autocomplete="username" maxlength="${cap.name}" aria-labelledby="name-label"${si.busy ? ' disabled' : ''}><span aria-hidden="true">${si.name ? esc(si.name) : 'The name you play under'}</span>${caret('name')}</label>`
        : `<input class="s2u-visually-hidden" type="text" name="username" autocomplete="username" value="${esc(persona)}" readonly tabindex="-1" aria-hidden="true">`}
        <span class="cx-field__label" id="pw-label">Password for ${persona ? esc(persona) : 'the persona'}</span>
        <label class="cx-field__box ${si.text ? '' : 'is-empty'}" for="${PASSWORD_ID}"><input class="s2u-visually-hidden" type="password" id="${PASSWORD_ID}" name="password" autocomplete="current-password" maxlength="${cap.password}" aria-labelledby="pw-label"${si.busy ? ' disabled' : ''}><span aria-hidden="true">${si.busy ? 'Signing in…' : si.text ? '•'.repeat(si.text.length) : 'Use the keys below, or type on a keyboard'}</span>${caret('password')}</label>
        ${si.error ? `<p class="cx-field__error" role="alert">${esc(si.error)}</p>` : ''}
      </form>
      ${oskHtml({ kr: si.kr, kc: si.kc, shift: si.shift, focused: si.zone === 'keys' }, 'key', done)}
      <p class="cx-dialog__note" data-signin-account>${SIGNIN_NO_ACCOUNT_WORDS[s.mode === 'overlay' && (s.page?.frontEndRuns?.() ?? false) ? 'overlay' : 'page']}</p>
      ${rememberHtml(s, a)}
    </div></div>`;
}

/**
 * PERSONA-PERSIST (a) (MISSION OT.R61 (b), the owner, 2026-10-17): "Remember me", ticked by default, where the session
 * offers it (the launcher: the card is the console's): a switch (the pointer's and touch's; L1 on the pad, the legend
 * says so) and the line saying what it keeps. Not offered -- over a game page, where the card is the game's -- the line
 * that says so. The words are the console's own (the product track's taste, for the owner's eye).
 */
export const REMEMBER_WORDS = {
  label: 'Remember me on this browser',
  on: 'Keeps you signed in on this browser after a reload. Untick it on a shared computer; Sign out offers to forget it.',
  off: 'You sign in again after a reload.',
  unoffered: 'Remember me is off here.',
} as const;

function rememberHtml(s: ConsoleState, a: Adapters): string {
  if (!(a.session.remembers?.() ?? false)) return `<p class="cx-dialog__note">${REMEMBER_WORDS.unoffered}</p>`;
  const on = s.si.remember;
  return `<button type="button" role="switch" aria-checked="${on}" class="cx-toggle" data-act="remember" data-fk="si-remember"><span>${REMEMBER_WORDS.label}</span><b>${on ? 'On' : 'Off'}</b></button>
      <p class="cx-dialog__note" data-remember-note>${on ? REMEMBER_WORDS.on : REMEMBER_WORDS.off}</p>`;
}

/**
 * The USER AGREEMENT (slice 2; the live session: the original's `dlgUsagePolicy` after every login, its words and text
 * through `../adapters/session`). Not in the design: its text box has no cx component yet, so its scroll box is set
 * inline (a gap the notes name). Accept first and focused, as the original's arrival.
 */
function agreementHtml(s: ConsoleState, a: Adapters): string {
  const ag = a.session.agreement;
  return `<div class="cx-scrim" data-key="agreement"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="ag-title">
      ${dialogHeadHtml(esc(ag?.title ?? 'User agreement'), 'ag-title')}
      <p class="cx-dialog__lead">${esc(ag?.lead ?? '')}</p>
      <div class="cx-dialog__note" data-agreement-text tabindex="0" style="max-height: 22rem; overflow-y: auto; white-space: pre-wrap">${esc(s.ag.text)}</div>
      <button type="button" class="cx-toggle ${s.ag.row === 0 ? 'is-focused' : ''}" data-act="agree" data-i="0" data-fk="ag-0"><span>Accept</span></button>
      <button type="button" class="cx-toggle ${s.ag.row === 1 ? 'is-focused' : ''}" data-act="agree" data-i="1" data-fk="ag-1"><span>Decline</span></button>
    </div></div>`;
}

// SKIP-MENU (LR.R33): where the hand-over enters (`../skipMenu` `skipMenuOpens`, the path `../adapters/launch` `gamePage`
// leaves) while it is on: the title screen (the base), LOGIN (LOGIN's route), or -- the review fold (2) -- a kept link's
// place. Off, the title screen's words as before.
const OPENS_NOTE = { title: 'The game opens at its own title screen.', login: 'The game opens at its own LOGIN screen.', link: 'The game opens where your link points.' } as const;
function launchHtml(s: ConsoleState, a: Adapters): string {
  // The target named when START was pressed (slice 3: the hand-over signs out first, which clears it); the sample
  // adapters' page never signs out, and reads it as the prototype did.
  const named = s.launch.target ?? (a.launch ? null : selectedRoom(s, a)?.name ?? null);
  const room = named !== null ? { name: named } : null;
  const path = globalThis.location?.pathname ?? '/';
  const base = String((import.meta.env as Record<string, unknown> | undefined)?.['BASE_URL'] ?? '/');
  const opens = skipMenuOn() ? skipMenuOpens(path, base, true) : 'title';
  // WM-37 (`../../loadIn` `LOAD_IN_COVER_ADAPTATION`; the owner's "12 b approved on both", 2026-11-15; a browser
  // adaptation): the hand-over drawn by the shared DEPLOYING panel (`../deployPanel`) -- its words (the opening note, a
  // room's note), its error line, its Back button and its close button as before, the title DEPLOYING; the ordinary
  // route's steps the disc and where the game opens, its bar waiting (no share is known). On a lobby link's address it
  // draws the direct link's first stage (Disc) of four instead, so it and the cover after it read as one sequence.
  const extra = {
    titleId: 'launch-title', close: closeButtonHtml(), headClass: 'cx-launch__head', footClass: 'cx-launch__note',
    after: `${s.launch.error ? `<p class="cx-launch__note cx-field__error" role="alert">${esc(s.launch.error)}</p>` : ''}<button type="button" class="cx-launch__back is-focused" data-act="press" data-b="circle" data-fk="launch-back">${btn('circle')}Back to launcher</button>`,
  };
  const open = (attrs: string, panel: string): string =>
    `<div class="cx-launch dp-host" data-key="launch"${attrs} role="dialog" aria-modal="true" aria-labelledby="launch-title">${panel}</div>`;
  // The review's F1: whether this start is direct (a cover after it) is `../../lobbyLinkDirect`'s own, so the foot says
  // only what is true either way -- the link's place (`OPENS_NOTE.link`), no promise of no press.
  if (loadInLobbyLinkAt(path, base)) return open(' data-stage="disc"', loadInPanelHtml(LOAD_IN_DISC, { ...extra, foot: OPENS_NOTE.link, enter: true }));
  const target = room ? `Room ${room.name}` : opens === 'login' ? 'LOGIN screen' : opens === 'link' ? 'Your link' : 'Title screen';
  return open('', deployPanelHtml({
    kicker: 'Start', title: 'DEPLOYING', share: null, line: 'Starting SOCOM II from your disc image.', steps: deploySteps(['Disc', target], 0),
    foot: room ? `Room ${room.name} is your target. The game opens at its own LOGIN screen: sign in there, then join ${room.name} from the briefing rooms.` : OPENS_NOTE[opens],
    enter: true, ...extra,
  }));
}

function statesHtml(s: ConsoleState, a: Adapters): string {
  const rows = a.states?.rows() ?? [];
  return `<div class="cx-scrim" data-key="states"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="st-title" style="width: 44rem">
      ${dialogHeadHtml('Prototype states', 'st-title')}
      <p class="cx-dialog__lead">Not part of the launcher. Flip these to see how each screen handles them.</p>
      ${rows.map(([k, v], i) => `<button type="button" class="cx-toggle ${s.states.row === i ? 'is-focused' : ''}" data-act="stateflip" data-i="${i}" data-fk="state-${i}"><span>${esc(k)}</span><b>${esc(v)}</b></button>`).join('')}
      <p class="cx-dialog__note">Keys: arrows are the D-pad, Enter ✕, Esc ○, F □, T △, Q/E L1/R1, Z/C L2/R2, O the OPTIONS button (START), P this panel.</p>
    </div></div>`;
}

/**
 * The Confirm: sign out, or Decline's question over the agreement. The live session's words are the original's (#793,
 * #763, #246 No, #253 Yes; `../adapters/session`); the sample adapters keep the prototype's. No first and focused.
 */
function confirmHtml(s: ConsoleState, a: Adapters): string {
  if (s.confirmKind === 'kept') return keptConfirmHtml(s);
  if (s.confirmKind === 'conflict') return conflictConfirmHtml(s, a);
  if (s.confirmKind === 'restore') return restoreConfirmHtml(s);
  if (s.confirmKind === 'loadout-leave') return wordsConfirmHtml(s, LOADOUT_LEAVE_CONFIRM);        // CX-LOADOUTS
  if (s.confirmKind === 'loadout-defaults') return wordsConfirmHtml(s, LOADOUT_DEFAULTS_CONFIRM);
  if (s.confirmKind === 'persona-delete') return personaDeleteHtml(s, a);                       // CX-PERSONA
  if (s.confirmKind === 'share-deploy') return wordsConfirmHtml(s, SHARE_DEPLOY_CONFIRM);        // DSH-10 (RB-26's Q11)
  if (s.confirmKind === 'share-close') return wordsConfirmHtml(s, SHARE_CLOSE_CONFIRM);          // the DSH-10 review's F2
  const w = a.session.words?.();
  const decline = s.confirmKind === 'decline';
  const title = decline ? 'Decline?' : w?.signOutTitle ?? 'Sign out?';
  const lead = decline ? a.session.agreement?.question ?? '' : w?.signOutLead ?? 'You will need your password to sign in again. Your memory card is not changed.';
  const no = w?.no ?? 'No, stay signed in';
  const yes = w?.yes ?? 'Yes, sign out';
  // PERSONA-PERSIST (a) (OT.R61 (b)): Sign out's third answer, where the session offers it.
  const forget = !decline && (a.session.forgets?.() ?? false) ? w?.forget ?? 'Yes, and forget this device' : null;
  return `<div class="cx-scrim" data-key="confirm-${s.confirmKind}"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-title" style="width: 44rem">
      ${dialogHeadHtml(esc(title), 'cf-title')}
      <p class="cx-dialog__lead">${esc(lead)}</p>
      <button type="button" class="cx-toggle ${s.confirmRow === 0 ? 'is-focused' : ''}" data-act="confirm" data-i="0" data-fk="cf-0"><span>${esc(no)}</span></button>
      <button type="button" class="cx-toggle ${s.confirmRow === 1 ? 'is-focused' : ''}" data-act="confirm" data-i="1" data-fk="cf-1"><span>${esc(yes)}</span></button>
      ${forget === null ? '' : `<button type="button" class="cx-toggle ${s.confirmRow === 2 ? 'is-focused' : ''}" data-act="confirm" data-i="2" data-fk="cf-2"><span>${esc(forget)}</span></button>`}
    </div></div>`;
}

/**
 * DX-3: the confirm before "Delete the kept disc" (Options, `../adapters/options`), in DA.R7's way of saying a kept copy:
 * what is kept, where, and what deleting it does. No first and focused, as every confirm here.
 */
export const KEPT_CONFIRM = {
  title: 'Remove downloaded content?',
  lead: 'Your disc\'s files kept in this browser\'s storage are removed. Your disc, memory cards, profiles and preferences are kept. The next start asks for your disc again.',
  no: 'No, keep it',
  yes: 'Yes, remove content',
} as const;

function keptConfirmHtml(s: ConsoleState): string {
  const w = KEPT_CONFIRM;
  return `<div class="cx-scrim" data-key="confirm-kept"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-title" style="width: 44rem">
      ${dialogHeadHtml(esc(w.title), 'cf-title')}
      <p class="cx-dialog__lead">${esc(w.lead)}</p>
      <button type="button" class="cx-toggle ${s.confirmRow === 0 ? 'is-focused' : ''}" data-act="confirm" data-i="0" data-fk="cf-0"><span>${esc(w.no)}</span></button>
      <button type="button" class="cx-toggle ${s.confirmRow === 1 ? 'is-focused' : ''}" data-act="confirm" data-i="1" data-fk="cf-1"><span>${esc(w.yes)}</span></button>
    </div></div>`;
}

/**
 * CX-14: the conflict's question on the button mapping screen (`./remap`), in the words of the setup page's Controller
 * view (retired with CX-26): the button pressed is already bound to another; Swap, Replace or Cancel, Cancel focused
 * (every console Confirm starts on its safe answer, OT.R60's one design; that view focused Swap). A Replace that would unbind Cross, Circle, START or a d-pad direction is refused in `resolveConflict`'s
 * words, on the dialog's error line, and the question stays.
 * WM-9, a labelled departure from OT.R60 for those conflicts only (a browser adaptation; the controller's product-track
 * call): on a rebind that conflicts with a button the menus need (START, Cross, Circle, the d-pad), the dialog opens with
 * SWAP focused, the lead line says why, and Replace is shown unavailable there; everywhere else OT.R60's Cancel-first focus
 * stands unchanged. Where the listening action has no button to give, Swap is unavailable too and Cancel is focused, the
 * lead saying so (`conflictOffer`). `resolveConflict`'s refusal stays the backstop, its error line drawn as before.
 */
export const CONFLICT_ANSWERS = ['Swap', 'Replace', 'Cancel'] as const;

function conflictConfirmHtml(s: ConsoleState, a: Adapters): string {
  const b = a.remap?.current() ?? null;
  const q = b?.question() ?? null;
  if (!b || !q) return '';
  const name = b.bindName(q.occupied);                              // an action's, or Crouch / Prone (PP-5)
  // The controller's button and the action named apart (the merge controller's wording, 2026-10-16): the d-pad's
  // four say so, and the action is set in capitals as its row draws it.
  const physical = (p: number): string => (p >= 12 && p <= 15 ? `D-pad ${b.label(p)}` : b.label(p));
  const button = physical(q.physical);
  const offer = conflictOffer(b);
  const menu = offer?.menu ?? null;
  const need = `${menu} must stay bound: the menus need it`;
  const lead = !menu ? `${button} is already used for ${name.toUpperCase()}. Swap them, replace it, or cancel.`
    : offer!.available[0] ? `${button} is already used for ${name.toUpperCase()}. ${need}, so swap them (${menu} moves to ${physical(offer!.old)}) or cancel.`
      : `${button} is already used for ${name.toUpperCase()}. ${need}, and ${b.bindName(q.action)} has no button to give it, so they cannot be swapped. Cancel, then choose another button.`;
  // WM-9: an unavailable answer stays reachable by the pointer but answers nothing (`aria-disabled`, its reason its title).
  const why = [`${b.bindName(q.action)} has no button to give ${menu}.`, `${need}.`, ''];
  return `<div class="cx-scrim" data-key="confirm-conflict"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-title" style="width: 44rem">
      ${dialogHeadHtml('Button already in use', 'cf-title')}
      <p class="cx-dialog__lead">${esc(lead)}</p>
      ${q.refused ? `<p class="cx-field__error" role="alert">${esc(q.refused)}</p>` : ''}
      ${CONFLICT_ANSWERS.map((w, i) => (offer?.available[i] ?? true)
    ? `<button type="button" class="cx-toggle ${s.confirmRow === i ? 'is-focused' : ''}" data-act="confirm" data-i="${i}" data-fk="cf-${i}"><span>${w}</span></button>`
    : `<button type="button" class="cx-toggle is-unavailable ${s.confirmRow === i ? 'is-focused' : ''}" aria-disabled="true" title="${esc(why[i]!)}" data-act="confirm" data-i="${i}" data-fk="cf-${i}"><span>${w} (unavailable)</span></button>`).join('')}
    </div></div>`;
}

/** CX-14: Restore defaults (Triangle on the button mapping screen), behind the console's confirm: No first and focused. */
export const RESTORE_CONFIRM = {
  title: 'Restore the defaults?',
  lead: 'Every binding, the stick dead zone and the Crouch and Prone binds go back to their defaults for this controller.',
  no: 'No, keep them',
  yes: 'Yes, restore',
} as const;

function restoreConfirmHtml(s: ConsoleState): string {
  const w = RESTORE_CONFIRM;
  return `<div class="cx-scrim" data-key="confirm-restore"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-title" style="width: 44rem">
      ${dialogHeadHtml(esc(w.title), 'cf-title')}
      <p class="cx-dialog__lead">${esc(w.lead)}</p>
      <button type="button" class="cx-toggle ${s.confirmRow === 0 ? 'is-focused' : ''}" data-act="confirm" data-i="0" data-fk="cf-0"><span>${esc(w.no)}</span></button>
      <button type="button" class="cx-toggle ${s.confirmRow === 1 ? 'is-focused' : ''}" data-act="confirm" data-i="1" data-fk="cf-1"><span>${esc(w.yes)}</span></button>
    </div></div>`;
}

/**
 * CX-LOADOUTS: the loadout editor's two questions, behind the console's Confirm (No first and focused, as every Confirm
 * here): leaving with unsaved changes (Circle), and Defaults (Triangle). The console's own words (the product track's
 * taste, for the owner's eye).
 */
export const LOADOUT_LEAVE_CONFIRM = {
  title: 'Leave without saving?',
  lead: 'Your changes to this loadout are not saved. The loadout on the server stays as it was.',
  no: 'No, keep editing',
  yes: 'Yes, leave',
} as const;
export const LOADOUT_DEFAULTS_CONFIRM = {
  title: 'Back to the defaults?',
  lead: 'The type’s own kit replaces this loadout, and a loadout stored for this mission and side is cleared on the server.',
  no: 'No, keep it',
  yes: 'Yes, use the defaults',
} as const;

function wordsConfirmHtml(s: ConsoleState, w: { title: string; lead: string; no: string; yes: string }): string {
  return `<div class="cx-scrim" data-key="confirm-${s.confirmKind}"><div class="cx-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-title" style="width: 44rem">
      ${dialogHeadHtml(esc(w.title), 'cf-title')}
      <p class="cx-dialog__lead">${esc(w.lead)}</p>
      <button type="button" class="cx-toggle ${s.confirmRow === 0 ? 'is-focused' : ''}" data-act="confirm" data-i="0" data-fk="cf-0"><span>${esc(w.no)}</span></button>
      <button type="button" class="cx-toggle ${s.confirmRow === 1 ? 'is-focused' : ''}" data-act="confirm" data-i="1" data-fk="cf-1"><span>${esc(w.yes)}</span></button>
    </div></div>`;
}

export function overlayHtml(s: ConsoleState, a: Adapters): string {
  if (s.overlay === 'signin') return signInHtml(s, a);
  if (s.overlay === 'launch') return launchHtml(s, a);
  if (s.overlay === 'states') return statesHtml(s, a);
  if (s.overlay === 'confirm') return confirmHtml(s, a);
  if (s.overlay === 'agreement') return agreementHtml(s, a);
  if (s.overlay === 'search') return searchHtml(s);
  if (s.overlay === 'news') return newsHtml(a);
  if (s.overlay === 'extract') return s.extract ? extractHtml(s.extract) : '';   // DX-2: the extraction's popover
  if (s.overlay === 'field') return fieldHtml(s, a);                              // CX-PERSONA: the Profile's field
  if (s.overlay === 'install') return installAppHtml(a.options.installSurface?.() ?? 'other'); // PWA-6
  if (s.overlay === 'share') {                                                   // DSH-5: the sender's dialog
    const v = a.discShare?.sender();
    return v ? senderDialogHtml(v, s.snd.row) : '';
  }
  return '';
}

/** The Toast: one line, replaced by the next, gone in 2.6 s (the controller's timer). */
export const toastHtml = (s: ConsoleState): string => (s.toast ? `<div class="cx-toast" data-key="${esc(s.toast)}">${esc(s.toast)}</div>` : '');
