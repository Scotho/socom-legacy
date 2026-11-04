import { MATCH_NAME_MAX, NEW_NAME_MAX, PERSONA_WORDS } from '../adapters/profile';
import { SHARE_CODE_LEAD, SHARE_CODE_TITLE } from '../../discShareWords';
import { DISCSHARE_CODE_LENGTH } from '../../discShareWire';
import { esc, ico, type IconName } from '../icons';
import { screenHead } from './head';
import { rowHtml as lxRow, stepRowHtml, type Row } from './rows';
export { stepRowHtml };
import { PERSONA_TOWN_MAX_CHARS } from '../../modern/profile/cardEdits';
import { TAUNT_MAX_CHARS } from '../../taunts';
import {
  PERSONA_DELETE_ROW, PERSONA_EDIT_ROWS, PERSONA_GENDER_ROW, PERSONA_NEW_ROWS, PERSONA_TOWN_ROW, type Adapters, type ConsoleState, type PersonaEditorView,
  type PhraseRow,
} from '../state';

/**
 * The Profile category's screens (CX-PERSONA of the console launcher plan; OT.R60 (c)): the persona list, one persona's
 * editor, the new persona's form and the Service record, pushed as the Armory's lists are, over `../adapters/profile` --
 * drawn, since LR-4 (the launcher redesign plan, the row "Profile"), in the artifact's panel (its "Profiles" and
 * "Service Record" panels wearing the card's and the server's semantics): the panel head (`./head`, with the Readout's
 * checks and a description), LR-1's rows (`./rows`) per persona and per record line, a select row with real step marks
 * for a roller (`stepRowHtml`), and the aside. A field is typed in the sign-in dialog's field over the on-screen keyboard and Delete asks the console's
 * Confirm (`./overlay`); the legend's prompts are `./legend`'s. The rows sit in their own scroll container (`data-scroll`,
 * CX-11). Every string from the card, the disc, the server or the page is set as text. A browser adaptation with no
 * original (OT.R28): nothing of the game's behaviour.
 */

/** One row of the persona list: a persona, the session's persona the card does not hold, a note, New persona, the match name. */
export interface PersonaItem {
  kind: 'persona' | 'session' | 'note' | 'new' | 'match-name';
  icon: IconName;
  title: string;
  sub: string;
  state?: [string, string];
  /** What Cross does (the legend's word), or null: nothing. */
  verb: string | null;
  /** A persona's record key (`persona`). */
  id?: string;
  /** Why the edit waits (the overlay's lock): Cross says it. */
  locked?: string;
  /** New persona's Cross is its universe's Try again. */
  retry?: boolean;
}

const SIGNED_IN: [string, string] = ['SIGNED IN', 'ready'];

/** The persona list's rows, in order: the session's persona when the card does not hold it, the card's, New persona, the match name. */
export function personaItems(a: Adapters): PersonaItem[] {
  const P = a.profile;
  if (!P) return [];
  const v = P.personas();
  const lock = P.locked();
  const name = P.matchName();
  const match: PersonaItem = {
    // Locked, the row says why on itself, as New persona's does (OT.R60's refinement: each locked row in one line).
    kind: 'match-name', icon: lock ? 'lock' : 'display', title: 'Match name', sub: lock ?? `${name || 'Not set'} · ${PERSONA_WORDS.matchNameSub}`, verb: lock ? null : 'Edit',
    ...(lock ? { locked: lock } : {}),
  };
  if (v.kind === 'unreadable') return [{ kind: 'note', icon: 'card', title: 'Memory card', sub: v.line, verb: null }, match];
  const out: PersonaItem[] = [];
  if (v.signedIn !== null && !v.held) out.push({ kind: 'session', icon: 'user', title: v.signedIn, sub: 'Signed in on this server · not on this memory card', state: SIGNED_IN, verb: null });
  for (const p of v.rows) {
    out.push({
      kind: 'persona', icon: 'user', title: p.name, sub: `Server: ${p.host === '' ? 'this server' : p.host}`, verb: lock ? 'Open' : 'Edit', id: p.id,
      ...(p.signedIn ? { state: SIGNED_IN } : {}),
    });
  }
  if (v.empty) out.push({ kind: 'note', icon: 'card', title: v.empty, sub: v.slotLine, verb: null });
  const c = v.create;
  if (lock) out.push({ kind: 'new', icon: 'lock', title: 'New persona', sub: lock, verb: null, locked: lock });
  else if (c.kind === 'ready') out.push({ kind: 'new', icon: 'plus', title: 'New persona', sub: c.line, verb: 'New persona' });
  else if (c.kind === 'failed') out.push({ kind: 'new', icon: 'alert', title: 'New persona', sub: c.line, verb: 'Try again', retry: true });
  else out.push({ kind: 'new', icon: c.kind === 'full' ? 'lock' : 'plus', title: 'New persona', sub: c.line, verb: null });
  out.push(match);
  return out;
}

/** The editor's rows' labels and values, in `PERSONA_EDIT_ROWS`' order (the town, the gender, the ten phrases, Delete). */
export function editorRows(v: Extract<PersonaEditorView, { kind: 'ok' }>): { label: string; value: string; phrase?: PhraseRow }[] {
  return [
    { label: 'Home town', value: v.town },
    { label: 'Gender', value: v.gender === 1 ? 'Female' : 'Male' },
    ...v.phrases.map((p) => ({ label: p.label, value: p.value, phrase: p })),
    { label: 'Delete persona', value: 'Delete' },
  ];
}

/** One line of the Service record: a fact, a note, a PLAYER INFO row, a mission's loadouts, or a state (reading, refused). */
export interface RecordRow { kind: 'fact' | 'note' | 'pinfo' | 'mission' | 'state'; title: string; value: string; adaptation?: boolean }

/**
 * FRIENDS_EMPTY_HINT_ADAPTATION (Trello d3xR0sr2, item 3; product track): the one line the Service record adds under
 * Friends when the count is 0, so a new account's empty list does not read as broken. A browser adaptation with no
 * original: the game's FRIENDS page (`dlgFriendList.rdr`) draws nothing on an empty list -- only MESSAGE, VIEW INFO or
 * REMOVE FRIEND pressed over it draws its literal "No Friends in your list." (research 269 §3.1) -- and nothing here
 * changes that page. The words follow the port's add path: FRIENDS' ADD NEW FRIEND by name, found only while that
 * player holds a room or game seat -- in a lobby or a game, not logged in at the menus (`FRIEND_REQUEST_BY_NAME_ADAPTATION`,
 * FindPlayer's rule, `packages/central/src/chat.ts` `findPlayer`), kept until he answers with CONFIRM
 * FRIEND, which puts him on the asker's list (`FRIEND_LIST_ONE_WAY_READING`; research 268 §2.1, §2.3).
 */
export const FRIENDS_EMPTY_HINT_ADAPTATION = 'Add a friend with FRIENDS > ADD NEW FRIEND and the name of a player in a lobby or game; they join your list once they confirm.';

/** The Service record's lines, in order: the name, the record's facts and notes and PLAYER INFO's rows, then the loadouts. */
export function recordRows(a: Adapters): RecordRow[] {
  const v = a.profile?.record();
  if (!v) return [];
  if (v.kind === 'signed-out') return [{ kind: 'state', title: 'Signed out', value: v.line }];
  const out: RecordRow[] = [{ kind: 'fact', title: 'Name', value: v.name }];
  const r = v.record;
  if (r.kind === 'loading') out.push({ kind: 'state', title: 'Reading your record', value: '' });
  else if (r.kind === 'failed') out.push({ kind: 'state', title: r.words, value: 'Press Cross to try again.' });
  else {
    out.push({ kind: 'fact', title: 'Clan', value: r.clan }, { kind: 'fact', title: 'Friends', value: String(r.friends) });
    if (r.friends === 0) out.push({ kind: 'note', title: FRIENDS_EMPTY_HINT_ADAPTATION, value: '', adaptation: true });
    out.push({ kind: 'fact', title: 'Ignored', value: String(r.ignored) }, { kind: 'fact', title: 'Ladder', value: r.ladder });
    if (r.note) out.push({ kind: 'note', title: r.note.text, value: '', ...(r.note.adaptation ? { adaptation: true } : {}) });
    for (const x of r.rows) out.push({ kind: 'pinfo', title: x.label, value: x.value });
  }
  const l = v.loadouts;
  if (l.kind === 'loading') out.push({ kind: 'state', title: 'Reading your loadouts', value: '' });
  else if (l.kind === 'failed') out.push({ kind: 'state', title: l.words, value: 'Your loadouts could not be read' });
  else if (l.missions.length === 0) out.push({ kind: 'note', title: 'No loadout saved on this account yet', value: '' });
  else for (const m of l.missions) out.push({ kind: 'mission', title: m.mission, value: `SEAL ${m.seal} · Terrorist ${m.terrorist}` });
  return out;
}

/**
 * The text field's words and cap for what it edits: the match name's 30 (`cleanMatchName`), the hometown keyboard's 20
 * (`PERSONA_TOWN_MAX_CHARS`), a phrase's 45 (`TAUNT_MAX_CHARS`), the name keyboard's 14 (`PERSONA_NAME_MAX`) -- the retired
 * section's fields' `maxLength`. `done` is the keyboard's Done key's word ("named for the action", the OnScreenKeyboard
 * README): the edits save; the new persona's fields are kept for its Create.
 */
export function fieldMeta(s: ConsoleState, a: Adapters): { title: string; lead: string; cap: number; done: string } {
  const t = s.fd.target;
  if (t.kind === 'match-name') return { title: 'Match name', lead: `${PERSONA_WORDS.matchNameSub}. Printable characters only.`, cap: MATCH_NAME_MAX, done: 'SAVE' };
  if (t.kind === 'town') return { title: 'Home town', lead: 'Up to 20 characters; it may be empty.', cap: PERSONA_TOWN_MAX_CHARS, done: 'SAVE' };
  if (t.kind === 'new-name') return { title: 'Persona name', lead: 'Up to 14 characters, no double quote. It is the persona\'s login.', cap: NEW_NAME_MAX, done: 'DONE' };
  if (t.kind === 'new-town') return { title: 'Home town', lead: 'Up to 20 characters; it may be empty.', cap: PERSONA_TOWN_MAX_CHARS, done: 'DONE' };
  // DSH-4: the sender's code entry (`./discShare`), over the same field.
  if (t.kind === 'share-code') return { title: SHARE_CODE_TITLE, lead: SHARE_CODE_LEAD, cap: DISCSHARE_CODE_LENGTH, done: 'DONE' };
  const v = s.pf.id === null ? null : a.profile?.editor(s.pf.id) ?? null;
  const help = v?.kind === 'ok' ? v.help[t.phrase] : '';
  return { title: `${t.phrase === 'taunts' ? 'Taunt' : 'Message'} ${t.slot + 1}`, lead: help, cap: TAUNT_MAX_CHARS, done: 'SAVE' };
}

/** The new persona's rows' labels and values, in `PERSONA_NEW_ROWS`' order. */
export function newRows(s: ConsoleState): { label: string; value: string }[] {
  const n = s.pf.nw;
  return [
    { label: 'Name', value: n.name || 'Enter a name' },
    { label: 'Home town', value: n.town || 'Optional' },
    { label: 'Gender', value: n.gender === 1 ? 'Female' : 'Male' },
    { label: 'Create persona', value: 'Create' },
  ];
}

/**
 * The screens stand only over a profile adapter; an editor whose persona is gone (deleted, the card changed) goes back
 * to the list; each screen's focus on one of its rows.
 */
export function normalizeProfile(s: ConsoleState, a: Adapters): void {
  const P = a.profile;
  const ours = s.screen === 'persona' || s.screen === 'personaEdit' || s.screen === 'personaNew' || s.screen === 'record';
  if (!ours) return;
  if (!P) { s.screen = 'home'; return; }
  if (s.screen === 'personaEdit' && (s.pf.id === null || P.editor(s.pf.id).kind === 'gone')) { s.screen = 'persona'; s.pf.id = null; }
  if (s.screen === 'persona') s.pf.row = Math.max(0, Math.min(s.pf.row, personaItems(a).length - 1));
  if (s.screen === 'personaEdit') s.pf.edit = Math.max(0, Math.min(s.pf.edit, PERSONA_EDIT_ROWS - 1));
  if (s.screen === 'personaNew') s.pf.nw.row = Math.max(0, Math.min(s.pf.nw.row, PERSONA_NEW_ROWS - 1));
  if (s.screen === 'record') s.pf.rec = Math.max(0, Math.min(s.pf.rec, recordRows(a).length - 1));
}

const head = (eyebrow: string, title: string, checks = '', back: string | null = 'Profile', desc = ''): string =>
  screenHead(`${ico('user')}${esc(eyebrow)}`, title, back, checks, desc);

/** The screen's aside (the Options aside's anatomy): its head, one line, a note. CX-LOBBIES' screens draw it too. */
export const aside = (label: string, title: string, about: string, note: string): string => `<aside class="cx-aside" aria-label="${esc(label)}">
        <div class="cx-readout__head">${esc(title)}</div>
        <p>${esc(about)}</p>
        ${note ? `<p class="cx-aside__note">${esc(note)}</p>` : ''}
      </aside>`;

/** The ScreenHead's checks (the Readout's): each line with its check or its wait mark. CX-LOBBIES' screens draw them too. */
export const checksOf = (lines: readonly { text: string; ok: boolean; attr?: string; mark?: string }[]): string => (lines.length === 0 ? ''
  : `<ul class="cx-checks" aria-label="About">${lines.map((l) => `<li class="cx-check ${l.ok ? '' : 'is-wait'}"${l.attr ?? ''}>${l.mark ?? ico(l.ok ? 'check' : 'alert')}${esc(l.text)}</li>`).join('')}</ul>`);

/** LR-4: the panel heads' lines under the Persona screens' titles. */
const PERSONA_DESC = 'Your personas, kept on your memory card. Each one is a login on the server it is filed under.';
const PERSONA_EDIT_DESC = 'Its home town, its gender and the card\'s phrases. Its name is its login and does not change.';
const PERSONA_NEW_DESC = 'A persona of your own on this memory card, filed under the server you connect to.';

/**
 * A persona list row as the artifact's "Profiles" panel draws a profile (LR-4): a persona (or the session's) its name,
 * its line and its side value (SIGNED IN), New persona the create action (primary when it can be made, its alert when
 * the universe refused, muted otherwise), the match name a row with its line; a row whose Cross does nothing muted; a
 * locked row its lock.
 */
function personaRow(x: PersonaItem, i: number, focused: boolean): string {
  const o = { focused, index: i, act: 'pfrow' };
  const id = `pf-${i}`;
  if (x.kind === 'new') {
    const tone = x.verb === null ? 'muted' as const : x.retry ? undefined : 'primary' as const;
    return lxRowWith({ kind: 'action', id, label: x.title, hint: x.sub, ...(tone ? { tone } : {}) }, o, x.icon === 'plus' ? {} : { icon: x.icon });
  }
  return lxRowWith({ kind: 'list', id, label: x.title, ...(x.sub ? { hint: x.sub } : {}), ...(x.state ? { value: x.state[0] } : {}) }, o,
    { muted: x.verb === null, ...(x.icon === 'lock' ? { icon: 'lock' as const } : {}), ...(x.state?.[1] === 'ready' ? { tone: 'good' as const } : {}) });
}

/** The persona list: the card's personas, New persona and the match name; the aside says what the focused row is. */
export function personaHtml(s: ConsoleState, a: Adapters): string {
  const items = personaItems(a);
  const v = a.profile?.personas();
  const lock = a.profile?.locked() ?? null;
  const checks: { text: string; ok: boolean }[] = [];
  if (v?.kind === 'ok') {
    if (v.signedIn !== null) checks.push({ text: `Signed in as ${v.signedIn}`, ok: true });
    if (v.slotLine) checks.push({ text: v.slotLine, ok: true });
  }
  if (lock) checks.push({ text: lock, ok: false });
  const f = items[s.pf.row];
  const about = !f ? aside('About your personas', 'Persona', 'Your personas are kept on your memory card.', '')
    : f.kind === 'persona' ? aside('About this persona', f.title, 'Its home town, its gender and the card\'s phrases. Its name is its login and does not change.', f.locked ?? lock ?? '')
    : f.kind === 'new' ? aside('About a new persona', 'New persona', 'A persona of your own on this memory card, filed under the server you connect to.', f.sub)
    : f.kind === 'match-name' ? aside('About the match name', 'Match name', PERSONA_WORDS.matchNameSub, lock ?? '')
    : aside('About your personas', f.title, f.sub, '');
  return `<section class="cx-screen" aria-label="Persona" data-key="persona">
    ${head('Profile', 'Profiles', checksOf(checks), 'Profile', PERSONA_DESC)}
    <div class="cx-screen__body">
      <div class="cx-rlist" role="group" aria-label="Personas" data-scroll data-key="pf-list">${items.map((x, i) => personaRow(x, i, i === s.pf.row)).join('')}</div>
      ${about}
    </div>
  </section>`;
}

/** One persona's editor: its home town, its gender, the card's ten phrases, Delete; locked rows say why. */
export function personaEditHtml(s: ConsoleState, a: Adapters): string {
  const v = s.pf.id === null ? null : a.profile?.editor(s.pf.id) ?? null;
  if (!v || v.kind !== 'ok') {
    return `<section class="cx-screen" aria-label="Persona" data-key="persona-edit">${head('Profile · Persona', 'Persona', '', 'Profiles')}<div class="cx-screen__body"><div class="cx-rlist" role="group" data-scroll data-key="pf-edit"></div></div></section>`;
  }
  const rows = editorRows(v);
  const locked = v.locked !== null;
  const r = s.pf.edit;
  const f = rows[r];
  const about = r === PERSONA_TOWN_ROW ? aside('About this row', 'Home town', 'Up to 20 characters; it may be empty.', v.locked ?? '')
    : r === PERSONA_GENDER_ROW ? aside('About this row', 'Gender', 'Left and Right change it; it is saved at once.', v.locked ?? '')
    : r === PERSONA_DELETE_ROW ? aside('About this row', 'Delete persona', 'Removes this persona from the memory card, after a question.', v.locked ?? '')
    : aside('About this row', f?.label ?? '', f?.phrase ? v.help[f.phrase.kind] : '', v.locked ?? (f?.phrase?.gated === 'locked' ? 'The game\'s own text comes from the game disc; edit to use your own.' : ''));
  const body = rows.map((x, i) => {
    const o = { focused: i === r, index: i, act: 'pfedit' };
    if (i === PERSONA_GENDER_ROW) return stepRowHtml('pfedit', 'pfstep', i, i === r, x.label, x.value, { muted: locked });
    if (i === PERSONA_DELETE_ROW) return lxRowWith({ kind: 'action', id: 'pf-delete', label: x.label, tone: locked ? 'muted' : 'danger' }, o);
    return lxRowWith({ kind: 'list', id: `pf-edit-${i}`, label: x.label, value: x.value }, o, { muted: locked, ...(x.phrase?.gated ? { attrs: 'data-gated' } : {}) });
  }).join('');
  return `<section class="cx-screen" aria-label="${esc(`Persona: ${v.name}`)}" data-key="persona-edit">
    ${head('Profile · Persona', v.name, checksOf([{ text: `Server: ${v.host === '' ? 'this server' : v.host}`, ok: true }, ...(locked ? [{ text: v.locked!, ok: false }] : [])]), 'Profiles', PERSONA_EDIT_DESC)}
    <div class="cx-screen__body">
      <div class="cx-rlist" role="group" aria-label="Persona" data-scroll data-key="pf-edit">${body}</div>
      ${about}
    </div>
  </section>`;
}

/** The new persona's form: its name, home town and gender, then Create; the server it is filed under in the head. */
export function personaNewHtml(s: ConsoleState, a: Adapters): string {
  const v = a.profile?.personas();
  const c = v?.kind === 'ok' ? v.create : null;
  const rows = newRows(s);
  const r = s.pf.nw.row;
  const about = r === 0 ? aside('About this row', 'Name', 'Up to 14 characters, no double quote. It is the persona\'s login and does not change later.', '')
    : r === 1 ? aside('About this row', 'Home town', 'Up to 20 characters; it may be empty.', '')
    : r === 2 ? aside('About this row', 'Gender', 'Left and Right change it.', '')
    : aside('About this row', 'Create persona', 'Saves the new persona on the memory card.', c?.line ?? '');
  const body = rows.map((x, i) => {
    const o = { focused: i === r, index: i, act: 'pfnew' };
    if (i === 2) return stepRowHtml('pfnew', 'pfnewstep', i, i === r, x.label, x.value);
    if (i === PERSONA_NEW_ROWS - 1) return lxRowWith({ kind: 'action', id: 'pf-create', label: x.label, tone: 'primary' }, o);
    return lxRowWith({ kind: 'list', id: `pf-new-${i}`, label: x.label, value: x.value }, o);
  }).join('');
  return `<section class="cx-screen" aria-label="New persona" data-key="persona-new">
    ${head('Profile · Persona', 'New persona', checksOf(c ? [{ text: c.line, ok: c.kind === 'ready' }] : []), 'Profiles', PERSONA_NEW_DESC)}
    <div class="cx-screen__body">
      <div class="cx-rlist" role="group" aria-label="New persona" data-scroll data-key="pf-new">${body}</div>
      ${about}
    </div>
  </section>`;
}

/** The rank's mark (`../adapters/profile` `RankView`): the design's star, the disc's medal picture, or none. */
function rankCheck(a: Adapters): { text: string; ok: boolean; attr: string; mark: string }[] {
  const v = a.profile?.record();
  const r = v?.kind === 'signed-in' ? v.rank : null;
  if (!r) return [];
  const mark = r.mark === 'star' ? ico('star') : r.mark === 'medal' && r.picture ? `<img class="cx-ico" src="${esc(r.picture)}" alt="" aria-hidden="true" data-medal-picture>` : '';
  return [{ text: r.rank, ok: true, attr: ` data-rank data-medal="${r.medal}" data-mark="${r.mark}" title="${esc(r.band)}"`, mark }];
}

/**
 * LR-4 (the launcher redesign plan, the row "Profile"): an LR-1 row (`./rows` `rowHtml`) carrying what this screen's
 * rows carried before -- their own data marks (`attrs`, set before the class), an icon where the old item had a lock or
 * an alert, the old chip's ready tone as the info rows' good (`tone`), and a row whose Cross does nothing drawn as the
 * artifact's muted row (`aria-disabled`, as a muted action). The row's act, index and id stay `rowHtml`'s. `./loadouts`
 * draws its rows so too.
 */
export function lxRowWith(r: Row, o: { focused: boolean; index: number; act: string }, x: { attrs?: string; icon?: IconName; muted?: boolean; tone?: 'good' } = {}): string {
  return lxRow(r, { ...o, ...x });
}

/** LR-4: the panel head's one line under a Profile screen's title (the old aside's words). */
const RECORD_DESC = 'Your record as the server keeps it: PLAYER INFO\'s rows in the original\'s order. The rank is your medal of merit from the ladder\'s position.';

/** A record line as an LR-1 row: a fact, PLAYER INFO's row or a mission its label and value; a note or a state its line. */
function recordRow(x: RecordRow, i: number): Row {
  const id = `rec-${i}`;
  return x.kind === 'note' || x.kind === 'state' ? { kind: 'list', id, label: x.title, ...(x.value ? { hint: x.value } : {}) } : { kind: 'list', id, label: x.title, value: x.value };
}

/**
 * The rank's row (`../adapters/profile` `RankView`): the artifact's "Rank" info row after the name, its value the rank's
 * name after its mark -- the design's star, the disc's medal picture, or none -- with the medal and the band as before
 * (`data-rank`). Not a record line: no act, the pad never stands on it (the artifact's info rows are not focusable).
 */
function rankRow(a: Adapters): string {
  const c = rankCheck(a)[0];
  if (!c) return '';
  return `<div class="cx-r cx-r--info" data-rank-row><span class="cx-r__text"><span class="cx-r__label">Rank</span></span><span class="cx-r__value"${c.attr}>${c.mark}${esc(c.text)}</span></div>`;
}

/**
 * The Service record, read only, in the artifact's drawing (LR-4): the panel head with its description, then the
 * server's lines as label and value rows -- the name, the rank's row, the record's facts and notes, PLAYER INFO's rows,
 * the mission loadouts -- each with its act (`pfrec`) and index, as `recordRows` lists them; a state its warn mark.
 */
export function recordHtml(s: ConsoleState, a: Adapters): string {
  const rows = recordRows(a);
  const rank = rankRow(a);
  const body = rows.map((x, i) => lxRowWith(recordRow(x, i), { focused: i === s.pf.rec, index: i, act: 'pfrec' }, {
    attrs: `data-record="${x.kind}"${x.kind === 'pinfo' ? ' data-pinfo-row' : ''}${x.adaptation ? ' data-adaptation="browser"' : ''}`,
    ...(x.kind === 'state' && x.value ? { icon: 'alert' as const } : {}),
  }) + (i === 0 ? rank : '')).join('');
  return `<section class="cx-screen" aria-label="Service record" data-key="record">
    ${screenHead(`${ico('user')}Profile`, 'Service record', 'Profile', '', RECORD_DESC)}
    <div class="cx-screen__body">
      <div class="cx-rlist" role="group" aria-label="Service record" data-scroll data-key="pf-record">${body}</div>
    </div>
  </section>`;
}
