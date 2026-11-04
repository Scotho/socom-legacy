import type { DiscShareAdapter, ReceiverView, SenderView } from '../../discShareView';
import {
  RECEIVER_FAILED_EARLY, RECEIVER_WORDS, SENDER_CLOSE, SENDER_CODE_LINE, SENDER_ENTER_NONE, SENDER_ENTER_SOME, SENDER_EXTRACT, SENDER_NO, SENDER_STOP,
  SENDER_TITLE, SENDER_TYPE, SENDER_WORDS, SENDER_YES, SHARE_LEAD, SHARE_RETRY, shareHostLine, shareRowHint, shareSteps,
} from '../../discShareWords';
import { qrMatrix, qrSvg } from '../../qr';
import { btn, esc, ico } from '../icons';
import { bytesOf } from './extract';
import { dialogHeadHtml } from './close';

/**
 * DSH-5 (the disc share plan, DSH.R12, the owner, 2026-10-29: "When that item is clicked a larger area expands and a QR
 * code is shown to tunnel with some instruction steps"): the disc share's two screens, drawn from the adapter alone
 * (`../../discShareView`) -- the receiver's area in Play's "Before you deploy" panel (the QR of the pairing link, the code
 * large beneath it, the site written out (DSH.R10), the numbered steps, then the phase: waiting, paired, copying with its
 * bar, done, failed with Try again), and the sender's dialog the link opens (the code to match by eye, Yes only with a
 * complete extraction, DSH.R7; otherwise "Extract, then send" and why; then its progress and its end). The words are
 * `../../discShareWords`. A browser adaptation: the launcher's screens, nothing of the game.
 */

/** A share of `bytes` of `total` as a whole percent (0 with no total). */
export const sharePct = (bytes: number | undefined, total: number | undefined): number =>
  total && total > 0 ? Math.floor(Math.max(0, Math.min(1, (bytes ?? 0) / total)) * 100) : 0;

/** The progress bar and its figures (the extraction popover's bar, `.cx-bar`). */
function barHtml(label: string, bytes: number | undefined, total: number | undefined): string {
  const pct = sharePct(bytes, total);
  const said = total ? bytesOf(bytes ?? 0, total) : '—';
  return `<div class="cx-share__figs"><span data-share="bytes">${esc(said)}</span><span data-share="pct">${pct}%</span></div>
      <div class="cx-bar cx-share__bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${esc(said)}"><i style="--s2u-progress: ${(pct / 100).toFixed(2)}"></i></div>`;
}

/** The host a link names (DSH.R10), or '' when it is not an address. */
function hostOf(link: string | undefined): string {
  if (!link) return '';
  try { return new URL(link).host; } catch { return ''; }
}

/** The row's line in the panel: at rest the words' hint, else the phase (a copy's percent). */
export function shareRowLine(share: DiscShareAdapter): string {
  const v = share.receiver();
  return shareRowHint(v.phase, v.phase === 'copying' && v.total ? sharePct(v.bytes, v.total) : null);
}

/** The receiver's phase: its head, its line (a failure's reason), a copy's bar, a failure's Try again. */
function statusHtml(v: ReceiverView): string {
  const w = RECEIVER_WORDS[v.phase];
  const line = v.phase === 'failed' ? v.reason ?? '' : w.line;
  const bar = v.phase === 'copying' || (v.phase === 'done' && v.total) ? barHtml('Copied', v.bytes, v.total) : '';
  const retry = v.phase === 'failed'
    ? `<button type="button" class="cx-toggle is-focused" data-act="sharerx" data-share="retry"><span>${btn('cross')}${esc(SHARE_RETRY)}</span></button>` : '';
  return `<div class="cx-share__status is-${v.phase}" data-share="status" role="status" aria-live="polite">
      <p class="cx-share__head">${ico(v.phase === 'done' ? 'check' : v.phase === 'failed' ? 'alert' : 'download')}<span>${esc(v.phase === 'failed' && !v.link ? RECEIVER_FAILED_EARLY : w.head)}</span></p>
      ${line ? `<p class="cx-share__line">${esc(line)}</p>` : ''}${bar}${retry}
    </div>`;
}

/** The receiver's expanded area (DSH.R12): drawn inside the panel while `chk.share` stands. */
export function shareAreaHtml(share: DiscShareAdapter): string {
  const v = share.receiver();
  const code = v.code ?? '';
  const host = hostOf(v.link);
  // Seat 3d's rendered check (844x390): a failure before any code (pairing unreachable) drew an empty QR box still saying
  // "Making a code…", with the reason below the fold. Then the box goes and the reason comes before the steps.
  const early = v.phase === 'failed' && !v.link;
  const qr = v.link
    ? qrSvg(qrMatrix(v.link), { label: `Pairing link: ${v.link}` })
    : `<span class="cx-share__qr-wait">${esc(RECEIVER_WORDS[v.phase === 'idle' ? 'idle' : 'requesting'].head)}</span>`;
  return `<div class="cx-share" data-share="receiver" data-phase="${v.phase}">
      ${early ? '' : `<div class="cx-share__pair">
        <div class="cx-share__qr" data-share="qr">${qr}</div>
        ${code ? `<p class="cx-share__code" data-share="code" aria-label="Code ${esc([...code].join(' '))}">${esc(code)}</p>` : ''}
        ${v.link ? `<p class="cx-share__link" data-share="link">${esc(v.link)}</p>` : ''}
        ${host ? `<p class="cx-share__host" data-share="host">${esc(shareHostLine(host))}</p>` : ''}
      </div>`}
      <div class="cx-share__info">
        ${early ? statusHtml(v) : ''}
        <p class="cx-share__lead" data-share="lead">${esc(SHARE_LEAD)}</p>
        <ol class="cx-share__steps" data-share="steps">${shareSteps(code || '—').map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        ${early ? '' : statusHtml(v)}
      </div>
    </div>`;
}

/** A sender's button: its act, its words, and (a nearby request's) its code. */
export interface SenderButton { act: 'yes' | 'extract' | 'no' | 'stop' | 'close' | 'pick' | 'type'; words: string; code?: string }

/**
 * The sender's buttons now, in the pad's order; the last is Circle's, every other Cross's on focus (with two, the first
 * Cross's and the second Circle's; one alone Circle's). DSH-4: the code entry's -- each nearby request's code, Type a
 * code (the launcher's text field), and Close (its No: it ends the entry and its polling).
 */
export function senderButtons(v: SenderView): readonly SenderButton[] {
  switch (v.phase) {
    case 'enter': return [
      ...(v.nearby ?? []).map((code): SenderButton => ({ act: 'pick', words: code, code })),
      { act: 'type', words: SENDER_TYPE }, { act: 'no', words: SENDER_CLOSE },
    ];
    case 'asked': return [{ act: 'yes', words: SENDER_YES }, { act: 'no', words: SENDER_NO }];
    case 'needs-extract': return [{ act: 'extract', words: SENDER_EXTRACT }, { act: 'no', words: SENDER_NO }];
    case 'sending': return [{ act: 'stop', words: SENDER_STOP }];
    default: return [{ act: 'close', words: SENDER_CLOSE }];
  }
}

/** The sender's dialog (the overlay `share`), in the launcher's dialog drawing (`.cx-dialog--lx`). */
export function senderDialogHtml(v: SenderView, row: number): string {
  const w = SENDER_WORDS[v.phase];
  const buttons = senderButtons(v);
  const focus = Math.max(0, Math.min(buttons.length - 1, row));
  const bar = v.phase === 'sending' || (v.phase === 'done' && v.total) ? barHtml('Sent', v.bytes, v.total) : '';
  const reason = v.phase === 'failed' && v.reason ? `<p class="cx-field__error" role="alert">${esc(v.reason)}</p>` : '';
  const asking = v.phase === 'asked' || v.phase === 'needs-extract';
  const entering = v.phase === 'enter';
  const found = entering ? `<p class="cx-dialog__note" data-share="nearby">${esc((v.nearby ?? []).length ? SENDER_ENTER_SOME : SENDER_ENTER_NONE)}</p>` : '';
  return `<div class="cx-scrim" data-key="share-send"><div class="cx-dialog cx-dialog--lx cx-share-send is-${v.phase}" role="dialog" aria-modal="true" aria-labelledby="share-title">
      ${dialogHeadHtml(esc(SENDER_TITLE), 'share-title', 'cx-dialog', true)}
      <p class="cx-dialog__lead">${esc(w.lead)}</p>
      ${asking ? `<p class="cx-dialog__note">${esc(SENDER_CODE_LINE)}</p>` : ''}
      ${v.code ? `<p class="cx-share__code" data-share="code" aria-label="Code ${esc([...v.code].join(' '))}">${esc(v.code)}</p>` : ''}${found}
      ${w.note ? `<p class="cx-dialog__note" data-share="why">${esc(w.note)}</p>` : ''}
      ${bar}${reason}
      ${buttons.map((b, i) => `<button type="button" class="cx-toggle ${i === focus ? 'is-focused' : ''}" data-act="sharesend" data-i="${i}" data-fk="share-${i}"${b.act === 'pick' ? ' data-share="pick"' : ''}><span>${btn(buttons.length > 1 && i < buttons.length - 1 ? 'cross' : 'circle')}${esc(b.words)}</span></button>`).join('')}
    </div></div>`;
}
