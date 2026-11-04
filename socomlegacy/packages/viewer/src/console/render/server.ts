import { ico } from '../icons';
import { serverItems, type Adapters, type ConsoleState } from '../state';
import { screenHead } from './head';
import { rowHtml, type InfoTone, type Row } from './rows';

/**
 * CX-28 (CX.R14): the Server screen pushed from Play online. A browser adaptation with no original (OT.R28).
 *
 * LR-3 (the launcher redesign plan, the row "Online"; LR.R8): Server information in the artifact's drawing
 * (`S2-Launcher-v2.dc.html`, its `serverinfo` panel: info rows with their tones, a section header, the message under
 * it), in LR-1's row kinds (`./rows`) under the panel head (`./head`). What it says is the server adapter's (CX.R5): the
 * status in its one wording, the universe and its users, the players and rooms once the server has reported them, and
 * the announcement, each in the news dialog's words (`./overlay` `newsHtml`); a row the server does not report -- the
 * artifact's game version, patch level, uptime, region -- is absent, never invented (the adapter reports no build). The
 * verbs are `serverItems`' (Refresh, then whatever `pages()` offers: Report a problem over a game), in their order, the
 * click `data-act="svrow"` with the item's index as before.
 */
export const SERVER_INFO_TITLE = 'Server Information';   // LR-37 (7): the owner's name for it
const SERVER_INFO_DESC = 'The server you connect to, as it reports itself. An independent fan project; it needs your own SOCOM II disc image.';

/** The status's tone: ready good, a server that does not answer bad, checking warn. */
const statusTone = (st: ReturnType<Adapters['server']['status']>): InfoTone => (st.ready ? 'good' : st.alert === false ? 'warn' : 'bad');

/** A server text's lines, each trimmed, the blank ones dropped. */
function textLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

/** The rows the server reports: the status, the universe and its users, the players and rooms, the news (LR-37), the announcement. */
export function serverInfoRows(a: Adapters): Row[] {
  const st = a.server.status();
  const t = a.server.totals();
  const rows: Row[] = [{ kind: 'info', label: 'Status', value: st.line, tone: statusTone(st) }];
  const n = a.server.news?.();
  const u = n?.universe;
  if (u?.kind === 'ok') rows.push({ kind: 'info', label: 'Universe', value: u.name }, { kind: 'info', label: 'Users', value: `${u.users}/${u.max}` });
  else if (u?.kind === 'waiting') rows.push({ kind: 'info', label: 'Universe', value: 'Reading the universe…' });
  else if (u?.kind === 'failed') rows.push({ kind: 'info', label: 'Universe', value: 'The universe did not answer.', tone: 'warn' });
  if (t) rows.push({ kind: 'info', label: 'Players', value: String(t.players) }, { kind: 'info', label: 'Rooms', value: String(t.rooms) });
  // LR-37 (6; the owner, 2026-10-29: "Remove server news. Put it in server information."): the universe's description and
  // every news chunk, the news dialog's (`./overlay` `newsHtml`), under their own header.
  // The news is ONE text the server cut into chunks wherever 255 bytes fell (SVC-05 `chunkText`), so its chunks are joined
  // first, as the original's SERVER_NEWS joins them (`@s2u/ui` universeCommands), then shown a row per line, blank lines
  // dropped: a row draws one line, and the owner's texts are written in lines (OT.R94's playtest texts).
  if (u?.kind === 'ok' && (u.description || u.news.length)) {
    rows.push({ kind: 'header', label: 'News' });
    for (const l of textLines(u.description)) rows.push({ kind: 'info', label: l, value: '' });
    for (const l of textLines(u.news.join(''))) rows.push({ kind: 'info', label: l, value: '' });
  }
  const an = n?.announcement;
  if (an) {
    const text = an.kind === 'signed-out' ? 'Sign in to read the server\'s announcement.'
      : an.kind === 'waiting' ? 'Reading the announcement…' : an.kind === 'failed' ? 'The announcement did not answer.' : an.text;
    rows.push({ kind: 'header', label: 'Announcement' }, ...textLines(text).map((l): Row => ({ kind: 'info', label: l, value: '' })));
  }
  return rows;
}

/** The verbs, as `serverItems` lists them: the status's Refresh an action row, each page a link row. */
function verbRows(a: Adapters): Row[] {
  return serverItems(a).map((x, i): Row => (i === 0
    ? { kind: 'action', id: 'refresh-server', label: x.verb, hint: 'Ask the server again', tone: 'primary' }
    : { kind: 'link', id: x.act, label: x.title, hint: x.sub, icon: x.icon }));
}

export function serverHtml(s: ConsoleState, a: Adapters): string {
  const info = serverInfoRows(a);
  // The read-only rows first (`data-row` their place); a verb's index is its `serverItems` index (`data-i`, the click's).
  const body = [
    ...info.map((r, i) => rowHtml(r, { focused: false, index: i, act: 'svrow' })),
    ...verbRows(a).map((r, i) => rowHtml(r, { focused: i === s.sv.row, index: i, act: 'svrow' })),
  ].join('');
  return `<section class="cx-screen" aria-label="${SERVER_INFO_TITLE}" data-key="server">
    ${screenHead(`${ico('globe')}Play online`, SERVER_INFO_TITLE, 'Play online', '', SERVER_INFO_DESC)}
    <div class="cx-screen__body">
      <div class="cx-rlist" role="group" aria-label="${SERVER_INFO_TITLE}" data-scroll data-key="server-rows">${body}</div>
    </div>
  </section>`;
}
