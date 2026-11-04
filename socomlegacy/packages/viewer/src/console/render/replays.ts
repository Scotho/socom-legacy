import { btn, dpad, esc, ico } from '../icons';
import { screenHead } from './head';
import { rowHtml } from './rows';
import { replaysTally, replayRows, replayStatus, type Adapters, type ConsoleState, type HomeItem, type ReplayRow, type ReplaysMore } from '../state';

/**
 * The replays list (slice 2; not in the prototype, which draws only the empty Replays item): a pushed screen opened from
 * Profile's Replays item (the ActionList README: "A long collection (rooms, replays) is its own pushed
 * screen"), in the RoomTable's and RoomDrawer's parts -- a row per recorded match (map, rules, when, length, players),
 * newest first, and the focused match's drawer: what the record holds and Watch, locked "Needs disc" while the disc is
 * out. Every server string is drawn as text. The rows sit in their own scroll container (`data-scroll`, CX-11). A
 * browser adaptation with no original (OT.R28).
 */
/**
 * RV-4 on the console (the RV-12 review): the record's result, when it holds one, in the Replays section's words
 * (`../../modern/replays/view` `resultWords`); its term the section card's field name, `result` (`data-field="result"`),
 * and how the record ended its `data-end`, as the card has them. None, nothing drawn.
 */
function resultHtml(r: ReplayRow): string {
  if (r.result === undefined) return '';
  return `<dt>Result</dt><dd data-field="result"${r.end ? ` data-end="${r.end}"` : ''}>${esc(r.result)}</dd>`;
}

/**
 * RV-4 on the release path (the sprint 39 close review's item 1): the list's end while the server has a page after the
 * rows read -- in existing words only (CX.R5): not asked yet, the Replays section's More (`../../modern/replays/view`
 * `moreView`, "More matches"); being read, its loading label ("Loading more"); failed, the failure's title and line in
 * the section's words (`../adapters/replays` `FAILURE_WORDS`) and the console's failed item's verb ("Try again",
 * `../state` `replaysItems`), the D-pad's down its press (`../grammar`). Not a row: the pad's focus never stands on it.
 * The close's round 2 (CX.R6: touch and mouse are release inputs too): idle or failed, it is a button
 * (`data-act="replays-more"`, out of the tab order, no `data-fk`), whose click asks as the down press on the last row
 * does (`../grammar` `replaysMore`); while the page is read it is a plain line, no control.
 */
function moreHtml(m: ReplaysMore | undefined): string {
  if (!m) return '';
  if (m.kind === 'loading') return '<div class="cx-empty" data-more="loading" aria-busy="true"><span class="cx-item__title">Loading more</span></div>';
  const body = m.kind === 'idle' ? `<span class="cx-item__title">${dpad('v')}More matches</span>`
    : `<span class="cx-item__title">${esc(m.title)}</span><span class="cx-item__sub">${esc(m.words)}</span><span class="cx-item__sub">${dpad('v')}Try again</span>`;
  // Failed, its words are said through the page's live region (MU2-14e: `../grammar` `sayReplaysFailure`, `#live`, in the
  // page before the failure), not by an `aria-live` on this button, which appears together with its words and so may
  // never be announced; the button keeps its role and its words.
  return `<button type="button" tabindex="-1" class="cx-empty" data-act="replays-more" data-more="${m.kind}">${body}</button>`;
}

function drawerHtml(r: ReplayRow, a: Adapters): string {
  const ready = a.disc.state() === 'ready';
  return `<aside class="cx-drawer" aria-label="Replay ${esc(r.map)}">
    <div class="cx-drawer__map is-guide"><span>${ready ? 'Map picture from your disc' : 'Needs disc'}</span><span class="cx-drawer__name">${esc(r.map)}</span></div>
    <div class="cx-drawer__body">
      <dl class="cx-facts"><dt>Map</dt><dd>${esc(r.map)}</dd><dt>Rules</dt><dd>${esc(r.rules)}</dd><dt>Recorded</dt><dd>${esc(r.when)} UTC</dd><dt>Length</dt><dd>${esc(r.length)}</dd><dt>Players</dt><dd>${esc(r.names)}</dd>${resultHtml(r)}</dl>
      <div class="cx-drawer__cta">${ready ? `${btn('cross')}Watch` : 'Needs disc to watch'}</div>
    </div>
  </aside>`;
}

/**
 * LR-4 (the launcher redesign plan, the row "Profile"): the panel head's line under the title, as the artifact's Replays
 * panel has one -- in the launcher's truth: the server records the matches (the artifact's "on this device" is not so).
 */
export const REPLAYS_DESC = 'The matches you played on this server, as it recorded them, newest first. Choose one to watch.';

/**
 * LR-11 (review-lr-4 F3): with no list, the status line -- signed out, reading, refused, none -- is LR-1's info row
 * (`./rows`), as LR-3's rows beside it are drawn, not the home list's `.cx-item`: the same facts (its icon, its title,
 * the line under it, its verb where a value stands), focused, reachable by Tab and the frame's focus (LR-10's `reach`),
 * its act (`replay-status`: Cross, `../grammar`) and its focus key as before; busy while the list is read.
 */
function statusHtml(status: HomeItem, loading: boolean): string {
  return rowHtml({ kind: 'info', label: status.title, hint: status.sub, value: status.verb }, {
    focused: true, index: 0, act: 'replay-status', icon: status.icon, reach: true,
    attrs: `data-fk="replay-status"${loading ? ' aria-busy="true"' : ''}`,
  });
}

export function replaysHtml(s: ConsoleState, a: Adapters): string {
  const rows = replayRows(a);
  const focus = rows[s.rp.row];
  const v = a.replays.view?.();
  const status = replayStatus(a);
  return `<section class="cx-screen" aria-label="Replays" data-key="replays">
    ${screenHead(`${ico('replay')}Replays`, 'Your matches', 'Profile', '', REPLAYS_DESC)}
    <div class="cx-screen__body">
      <div class="cx-rooms">
        <div class="cx-rooms__head" aria-hidden="true"><span>Map</span><span>Rules</span><span>Recorded</span><span>Length</span><span>Players</span></div>
        <div data-scroll data-key="list">${rows.length ? rows.map((r, i) => `<button type="button" class="cx-room ${i === s.rp.row ? 'is-focused' : ''}" data-act="replay" data-i="${i}" data-fk="replay-${esc(r.id)}" aria-label="Replay on ${esc(r.map)}, ${esc(r.rules)}, recorded ${esc(r.when)} UTC, ${esc(r.length)}, ${r.players} players">
            <span class="cx-room__name">${esc(r.map)}</span><span>${esc(r.rules)}</span><span>${esc(r.when)}</span><span class="cx-room__count">${esc(r.length)}</span><span>${r.players}</span>
          </button>`).join('') + moreHtml(v?.kind === 'ok' ? v.more : undefined) : status ? statusHtml(status, v?.kind === 'loading') : ''}</div>
        <div class="cx-rooms__foot">${v?.kind === 'ok' ? `${replaysTally(v)} · newest first` : ''}</div>
      </div>
      ${focus ? drawerHtml(focus, a) : ''}
    </div>
  </section>`;
}
