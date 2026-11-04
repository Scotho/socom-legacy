import { esc, ico } from '../icons';
import { screenHead } from './head';
import { lxRowWith, stepRowHtml } from './profile';
import { LOADOUT_SAVE_ROW, loadoutSideItems, type Adapters, type ConsoleState, type LoadoutLocked, type LoadoutMission, type LoadoutRoller, type LoadoutSide } from '../state';

/**
 * The Armory's loadouts screens (CX-LOADOUTS of the console launcher plan; OT.R60 (c)): a side's mission list and its
 * editor, pushed as Browse rooms, the replays list and the button mapping are, over `../adapters/loadouts` -- drawn in the
 * artifact's panel since LR-4 (the launcher redesign plan, the row "Profile"): the panel head (`./head`, with the
 * Readout's check for what is stored, and a description), an LR-1 list row (`./rows`) per mission with its state as the
 * side value, select rows for the type and the five slots (their step marks real buttons for a pointer, `./profile`
 * `stepRowHtml`), an action row for Save, and the aside. Defaults and leaving with unsaved changes are
 * the console's Confirm (`./overlay`); the legend's prompts are `./legend`'s. The rows sit in their own scroll container
 * (`data-scroll`, CX-11). Every string from the disc, the server or the page is set as text. A browser adaptation with no
 * original (OT.R28): nothing of the game's behaviour.
 */

export const LOADOUT_SIDE_TITLE: Record<LoadoutSide, string> = { seal: 'SEAL loadouts', terrorist: 'Terrorist loadouts' };

/** A record kept on the account for a map this server does not offer: its row's line, and its Cross's (the warn line). */
export const LOADOUT_UNOFFERED_WORDS = 'Not offered by this server';

/** A mission row's state chip: stored, the type's own kit, or not offered. */
const CHIP: Record<LoadoutMission['state'], [string, string]> = { saved: ['SAVED', 'ready'], default: ['DEFAULT', ''], unoffered: ['NOT OFFERED', ''] };

/** What the aside says of a mission row's state. */
const ABOUT: Record<LoadoutMission['state'], string> = {
  saved: 'A loadout is stored on the server for this mission and side.',
  default: 'Nothing stored for this mission and side: the type’s own kit.',
  unoffered: 'Kept on your account for a map this server does not offer: never opened or sent here, and the next server may offer it.',
};

/** LR-4: the panel heads' lines under the Loadouts screens' titles (the asides' words). */
const SIDES_DESC = 'SEAL and Terrorist kits are kept separately for each mission, on the server.';
const LIST_DESC = 'Your loadouts are kept on the server, for each mission and side. Weapon names and the ARMORY’s rules come from your disc.';

/**
 * LR-4 (the launcher redesign plan, the row "Profile"): a locked or refused screen's one row, an LR-1 list row: its title
 * and line, its lock or alert; the pad's focus on it, its Cross the way out (`../grammar`), which a click presses too
 * (the legend's own `press` act, `data-b="cross"`).
 */
const crossRow = (title: string, line: string, icon: 'lock' | 'alert', attrs: string): string =>
  lxRowWith({ kind: 'list', id: 'lo-cross', label: title, hint: line }, { focused: true, index: 0, act: 'press' }, { attrs: `data-b="cross" ${attrs}`, icon });

const lockedItem = (v: LoadoutLocked): string => crossRow(v.title, v.line, 'lock', `data-lock="${v.lock}"`);

/** A line that is not a row the pad stands on (reading, the empty list): an LR-1 info row, busy while read. */
const emptyItem = (title: string, sub = '', busy = false): string => {
  const html = lxRowWith({ kind: 'info', label: title, value: sub }, { focused: false, index: -1, act: '' });
  return busy ? html.replace(/^<div /, '<div aria-busy="true" role="status" ') : html;
};

const head = (eyebrow: string, title: string, checks = '', back: string | null = 'Profile', desc = ''): string =>
  screenHead(`${ico('armory')}${esc(eyebrow)}`, title, back, checks, desc);

const aside = (label: string, title: string, about: string, note: string): string => `<aside class="cx-aside" aria-label="${esc(label)}">
        <div class="cx-readout__head">${esc(title)}</div>
        <p>${esc(about)}</p>
        <p class="cx-aside__note">${esc(note)}</p>
      </aside>`;

const rlist = (label: string, key: string, body: string): string => `<div class="cx-rlist" role="group" aria-label="${esc(label)}" data-scroll data-key="${esc(key)}">${body}</div>`;

/** The mission list of the side open, in the artifact's drawing (LR-4): a row per mission, its state the side value. */
export function loadoutsHtml(s: ConsoleState, a: Adapters): string {
  const title = LOADOUT_SIDE_TITLE[s.lo.side];
  const v = a.loadouts?.list() ?? { kind: 'loading' as const };
  let items: string;
  let about = aside('About your loadouts', title, 'Your loadouts are kept on the server, for each mission and side.', 'Weapon names and the ARMORY’s rules come from your disc.');
  if (v.kind === 'locked') items = lockedItem(v);
  else if (v.kind === 'loading') items = emptyItem('Reading…', '', true);
  else if (v.kind === 'failed') items = crossRow(v.words, 'Press Cross to try again.', 'alert', 'data-failed');
  else {
    const rows = v.rows;
    items = rows.map((r, i) => {
      const off = r.state === 'unoffered';
      return lxRowWith({ kind: 'list', id: `lo-${r.mission}`, label: r.name, hint: off ? `${r.mission} · ${LOADOUT_UNOFFERED_WORDS}` : r.mission, value: CHIP[r.state][0] },
        { focused: i === s.lo.row, index: i, act: 'lorow' }, { attrs: `data-mission="${esc(r.mission)}" data-state="${r.state}"`, ...(off ? { muted: true, icon: 'lock' as const } : {}), ...(CHIP[r.state][1] ? { tone: 'good' as const } : {}) });
    }).join('') + (v.empty ? emptyItem(v.empty) : '');
    const r = rows[s.lo.row];
    if (r) about = aside('About this mission', r.name, ABOUT[r.state], 'Your loadouts are kept on the server, for each mission and side.');
  }
  return `<section class="cx-screen" aria-label="${esc(title)}" data-key="loadouts-${s.lo.side}">
    ${head('Armory', title, '', 'Loadouts', LIST_DESC)}
    <div class="cx-screen__body">
      ${rlist('Missions', `lo-list-${s.lo.side}`, items)}
      ${about}
    </div>
  </section>`;
}

/** One roller of the editor as the artifact's select row (LR-4, `./profile` `stepRowHtml`): held when fixed or saving. */
function rollerRow(s: ConsoleState, i: number, r: LoadoutRoller, busy: boolean): string {
  return stepRowHtml('loedit', 'lostep', i, s.lo.edit === i, r.label, r.values[r.at] ?? '', { muted: r.fixed !== null || busy, ...(r.fixed ? { about: r.fixed } : {}) });
}

/** The editor of one mission and side: the type, the five slots, Save; the aside says what the focused row does. */
export function loadoutHtml(s: ConsoleState, a: Adapters): string {
  const side = LOADOUT_SIDE_TITLE[s.lo.side];
  const v = a.loadouts?.editor() ?? { kind: 'loading' as const };
  if (v.kind !== 'ok') {
    const body = v.kind === 'locked' ? lockedItem(v) : v.kind === 'failed' ? emptyItem(v.words) : emptyItem('Reading…', '', true);
    return `<section class="cx-screen" aria-label="${esc(side)}" data-key="loadout">
    ${head(`Armory · ${side}`, side, '', side)}
    <div class="cx-screen__body">
      ${rlist('Loadout', 'lo-edit', body)}
      ${aside('About your loadouts', side, 'Your loadouts are kept on the server, for each mission and side.', 'Weapon names and the ARMORY’s rules come from your disc.')}
    </div>
  </section>`;
  }
  const stored = /^Stored/.test(v.held);
  const checks = `<ul class="cx-checks" aria-label="Stored"><li class="cx-check ${stored ? '' : 'is-wait'}" data-lo-held>${ico(stored ? 'check' : 'alert')}${esc(v.held)}</li></ul>`;
  const save = s.lo.edit === LOADOUT_SAVE_ROW;
  const focus = v.rows[s.lo.edit];
  const note = focus?.fixed ?? (v.busy ? 'Saving to the server…' : v.dirty ? 'Changed: not saved yet.' : 'Saved as shown.');
  const about = save
    ? aside('About this row', 'Save loadout', 'Stores this kit on the server for this mission and side. Square on a slot saves too.', v.busy ? 'Saving to the server…' : v.dirty ? 'Changed: not saved yet.' : 'Saved as shown.')
    : aside('About this row', focus?.label ?? '', s.lo.edit === 0 ? 'The character type: each type has its own kit. Left and Right change it.' : 'The ARMORY’s items for this slot. Left and Right change it, as the ARMORY’s own presses do.', note);
  const saveRow = lxRowWith({ kind: 'action', id: 'lo-save', label: 'Save loadout', tone: v.busy ? 'muted' : 'primary', ...(v.busy ? { hint: 'Saving…' } : v.dirty ? { hint: 'Changed: not saved yet.' } : {}) },
    { focused: save, index: LOADOUT_SAVE_ROW, act: 'loedit' });
  return `<section class="cx-screen" aria-label="${esc(`${side}: ${v.name}`)}" data-key="loadout"${v.busy ? ' aria-busy="true"' : ''}>
    ${head(`Armory · ${v.head}`, v.name, checks, side)}
    <div class="cx-screen__body">
      ${rlist('Loadout', 'lo-edit', v.rows.map((r, i) => rollerRow(s, i, r, v.busy)).join('') + saveRow)}
      ${about}
    </div>
  </section>`;
}

/** Launcher adaptation: choose the side before opening its existing mission list (LR-4: link rows, the artifact's). */
export function loadoutSidesHtml(s: ConsoleState, a: Adapters): string {
  return `<section class="cx-screen" aria-label="Loadouts" data-key="loadout-sides">
    ${head('Profile', 'Loadouts', '', 'Profile', SIDES_DESC)}
    <div class="cx-screen__body">${rlist('Sides', 'lo-sides', loadoutSideItems(a).map((x, i) => lxRowWith({ kind: 'link', id: `lo-side-${i}`, label: x.title, hint: x.sub, icon: x.icon }, { focused: s.lo.row === i, index: i, act: 'loside' })).join(''))}
    ${aside('About loadouts', 'Choose your side', 'SEAL and Terrorist kits are kept separately for each mission.', 'Choose a side to see its missions.')}</div>
  </section>`;
}
