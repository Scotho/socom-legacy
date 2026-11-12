// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsolePage } from '../../src/console/app';
import { prompts } from '../../src/console/render/legend';
import { LAUNCH_SEND_ROW, SEND_PAGE } from '../../src/console/state';
import type { HostRequest } from '../../src/discShareView';
import {
  SEND_CLOSE, SEND_COPY_LINK, SEND_COPY_REFUSED, SEND_FAILED, SEND_KEEP_OPEN, SEND_NEEDS_EXTRACT, SEND_NO, SEND_NO_REQUESTS, SEND_OPENING,
  SEND_STOP, SEND_YES, SHARE_DEPLOY_CONFIRM, SHARE_DEPLOY_STOPS, SHARE_VIA_RELAY, sendAge, sendLast, sendQrLabel, shareQueued,
  SEND_BACK, SHARE_CLOSE_CONFIRM, SHARE_CLOSE_STOPS,
} from '../../src/discShareWords';
import { qrMatrix, qrSvg } from '../../src/qr';
import { area, bootSend, click, focusedRow, LINK, panel, sendFake, settle, toSendRow, type SendBoot, type SendFake } from './sendFake';
import { mountShell } from './shell';

/**
 * DSH-10's send area (the disc share plan, DSH.R17; RB-27's host screen, the replay batch plan, with its Q9-Q11
 * defaults): opened by the enabled "Send Game Files" row, drawn where the receiver's area is (Play's panel, widened). It
 * shows the share's link with Copy link and its QR, "Keep this open while you share", the copy under way (bar, percent,
 * path, Stop), the requests (the code to match, its age, Yes, No, "Queued #n"), the last copy's outcome, and
 * `needs-extract` / `failed` in words. The pad is RB-27's map: Up / Down walk link, copy, requests; Cross copies the link
 * or says Yes; Square No; Triangle Stop; Circle closes (`closeHost`, Q10). Deploy while the share is busy asks first
 * (Q11, `SHARE_DEPLOY_STOPS`). A browser adaptation, product track: nothing of the game.
 */
let b: SendBoot | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => {
  b?.page.dispose(); b = null;
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear();
});

const word = (ctl: ConsolePage['ctl'], k: string): string | undefined => prompts(ctl.S, ctl.A).find((x) => x.k === k)?.label;
const q = (sel: string): HTMLElement | null => area()?.querySelector<HTMLElement>(sel) ?? null;
const reqs = (): HTMLElement[] => [...(area()?.querySelectorAll<HTMLElement>('[data-send="req"]') ?? [])];
const focusedReq = (): string | null => reqs().find((r) => r.classList.contains('is-focused'))?.dataset['id'] ?? null;
const req = (id: string, code: string, o: Partial<HostRequest> = {}): HostRequest => ({ id, code, since: Date.now(), state: 'asked', ...o });

/** The send area opened by the row (the share's link `LINK`); `o` the boot's options. */
function open(share: SendFake = sendFake(true), o: Parameters<typeof bootSend>[1] = {}): { ctl: ConsolePage['ctl']; share: SendFake } {
  b = bootSend(share, o);
  toSendRow(b.ctl);
  b.ctl.press('cross');
  expect(share.calls).toEqual(['openHost']);
  return { ctl: b.ctl, share };
}

/** Sets the host's view and draws. */
function view(ctl: ConsolePage['ctl'], share: SendFake, hv: SendFake['hv']): void { share.hv = hv; ctl.render(); }

function clipboard(answer: 'ok' | 'refuse') {
  const writeText = vi.fn(async (_text: string) => { if (answer === 'refuse') throw new Error('NotAllowedError'); });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('DSH-10: the send area -- the link', () => {
  it('the link written out, its QR, Copy link focused first, and "Keep this open while you share"', () => {
    const { ctl } = open();
    const a = area()!;
    expect(a.dataset['phase']).toBe('open');
    expect(q('[data-send="link"]')!.textContent).toBe(LINK);
    const want = document.createElement('div');
    want.innerHTML = qrSvg(qrMatrix(LINK), { label: sendQrLabel(LINK) });
    expect(q('[data-send="qr"]')!.innerHTML, 'the QR is the link\'s').toBe(want.innerHTML);
    const copy = q('[data-send="copy"]')!;
    expect(copy.textContent).toContain(SEND_COPY_LINK);
    expect(copy.classList.contains('is-focused')).toBe(true);
    expect(q('[data-send="keep"]')!.textContent).toBe(SEND_KEEP_OPEN);
    expect(q('[data-send="none"]')!.textContent, 'no requests yet').toBe(SEND_NO_REQUESTS);
    expect(word(ctl, 'cross')).toBe(SEND_COPY_LINK);
    expect(word(ctl, 'circle')).toBe(SEND_CLOSE);
    expect(word(ctl, 'square')).toBeUndefined();
    expect(word(ctl, 'triangle')).toBeUndefined();
  });

  it('while the link is being made: no QR yet, its words; no Copy link', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'opening', pending: [] });
    expect(q('[data-send="qr"]')!.textContent).toBe(SEND_OPENING);
    expect(q('[data-send="qr"] svg')).toBeNull();
    expect(q('[data-send="copy"]')).toBeNull();
    expect(word(ctl, 'cross')).toBeUndefined();
  });

  it('Cross on the link copies it to the clipboard', async () => {
    const writeText = clipboard('ok');
    const { ctl } = open();
    ctl.press('cross');
    await settle();
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(ctl.S.chk.copy).toBe('copied');
    ctl.render();
    expect(q('[data-send="copy-note"]')).toBeNull();
  });

  it('a click on Copy link copies it too', async () => {
    const writeText = clipboard('ok');
    open();
    click(q('[data-send="copy"]')!);
    await settle();
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('a refused clipboard says the note, the link left to select', async () => {
    clipboard('refuse');
    const { ctl } = open();
    ctl.press('cross');
    await settle();
    expect(ctl.S.chk.copy).toBe('refused');
    expect(q('[data-send="copy-note"]')!.textContent).toBe(SEND_COPY_REFUSED);
    expect(q('[data-send="link"]')!.textContent).toBe(LINK);
  });

  it('no clipboard at all is a refusal too', async () => {
    const { ctl } = open();
    ctl.press('cross');
    await settle();
    expect(ctl.S.chk.copy).toBe('refused');
    expect(q('[data-send="copy-note"]')).not.toBeNull();
  });
});

describe('DSH-10: the send area -- the requests (RB-27\'s pad map)', () => {
  it('each request: the code to match, its age, Yes and No; Down walks from the link to them', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M'), req('r2', 'HRWZTP', { since: Date.now() - 125_000 })] });
    expect(reqs().map((r) => r.dataset['id'])).toEqual(['r1', 'r2']);
    expect(reqs().map((r) => r.querySelector('[data-send="code"]')!.textContent)).toEqual(['QX7K4M', 'HRWZTP']);
    expect(reqs()[0]!.querySelector('[data-send="code"]')!.getAttribute('aria-label')).toBe('Code Q X 7 K 4 M');
    expect(reqs().map((r) => r.querySelector('[data-send="age"]')!.textContent)).toEqual([sendAge(0), sendAge(125_000)]);
    expect(sendAge(0)).toBe('just now');
    expect(sendAge(125_000)).toBe('2 min ago');
    expect(reqs()[0]!.querySelector('[data-act="sendyes"]')!.textContent).toContain(SEND_YES);
    expect(reqs()[0]!.querySelector('[data-act="sendno"]')!.textContent).toContain(SEND_NO);
    expect(q('[data-send="none"]')).toBeNull();
    ctl.press('down');
    expect(focusedReq()).toBe('r1');
    expect(q('[data-send="copy"]')!.classList.contains('is-focused')).toBe(false);
    expect(word(ctl, 'cross')).toBe(SEND_YES);
    expect(word(ctl, 'square')).toBe(SEND_NO);
    ctl.press('down');
    expect(focusedReq()).toBe('r2');
    ctl.press('down');
    expect(focusedReq(), 'the end kept').toBe('r2');
    ctl.press('up'); ctl.press('up');
    expect(q('[data-send="copy"]')!.classList.contains('is-focused')).toBe(true);
    ctl.press('up');
    expect(q('[data-send="copy"]')!.classList.contains('is-focused'), 'the top kept').toBe(true);
  });

  it('Cross says Yes, Square says No, by pad', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M'), req('r2', 'HRWZTP')] });
    ctl.press('down');
    ctl.press('cross');
    expect(share.calls).toEqual(['openHost', 'approve:r1']);
    ctl.press('down');
    ctl.press('square');
    expect(share.calls).toEqual(['openHost', 'approve:r1', 'decline:r2']);
    ctl.press('up'); ctl.press('up');                              // on the link: Square says nothing
    ctl.press('square');
    expect(share.calls).toHaveLength(3);
  });

  it('Yes and No by click', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M'), req('r2', 'HRWZTP')] });
    click(area()!.querySelector('[data-act="sendyes"][data-id="r2"]')!);
    expect(share.calls).toEqual(['openHost', 'approve:r2']);
    click(area()!.querySelector('[data-act="sendno"][data-id="r1"]')!);
    expect(share.calls).toEqual(['openHost', 'approve:r2', 'decline:r1']);
  });

  it('a request said Yes while another copies shows "Queued #n"; Cross on it says nothing more, No still declines', () => {
    const { ctl, share } = open();
    view(ctl, share, {
      phase: 'open', link: LINK, active: { id: 'r0', code: 'AAAAAA', bytes: 1, total: 4 },
      pending: [req('r1', 'QX7K4M', { state: 'queued', place: 1 }), req('r2', 'HRWZTP', { state: 'queued', place: 2 })],
    });
    expect(shareQueued(2)).toBe('Queued #2');
    const r2 = reqs()[1]!;
    expect(r2.querySelector('[data-send="queued"]')!.textContent).toBe('Queued #2');
    expect(r2.querySelector('[data-act="sendyes"]'), 'no Yes on a queued request').toBeNull();
    ctl.press('down'); ctl.press('down'); ctl.press('down');      // link, the copy, r1, r2
    expect(focusedReq()).toBe('r2');
    expect(word(ctl, 'cross')).toBeUndefined();
    ctl.press('cross');
    expect(share.calls).toEqual(['openHost']);
    ctl.press('square');
    expect(share.calls).toEqual(['openHost', 'decline:r2']);
  });

  it('the focus stays on the same request when the list reorders; when it goes, the place it held', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M'), req('r2', 'HRWZTP')] });
    ctl.press('down'); ctl.press('down');
    expect(focusedReq()).toBe('r2');
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r3', 'CCCCCC'), req('r2', 'HRWZTP'), req('r1', 'QX7K4M')] });
    expect(focusedReq(), 'r2 kept, though it moved up').toBe('r2');
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r3', 'CCCCCC'), req('r1', 'QX7K4M')] });
    expect(focusedReq(), 'r2 gone: the request now in its place').toBe('r1');
    ctl.press('cross');
    expect(share.calls).toEqual(['openHost', 'approve:r1']);
  });
});

describe('DSH-10: the send area -- the copy under way and its end', () => {
  const copying = (): SendFake['hv'] => ({
    phase: 'open', link: LINK, active: { id: 'r1', code: 'QX7K4M', bytes: 669195532, total: 1338391063, via: 'relay' }, pending: [],
  });

  it('the copy: its code, bar, percent and path; Triangle stops it (the legend says so)', () => {
    const { ctl, share } = open();
    view(ctl, share, copying());
    const act = q('[data-send="active"]')!;
    expect(act.textContent).toContain('QX7K4M');
    expect(act.querySelector('[data-share="pct"]')!.textContent).toBe('50%');
    expect(act.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
    expect(act.querySelector('[data-share="via"]')!.textContent).toBe(SHARE_VIA_RELAY);
    expect(act.querySelector('[data-act="sendstop"]')!.textContent).toContain(SEND_STOP);
    expect(word(ctl, 'triangle')).toBe(SEND_STOP);
    ctl.press('triangle');
    expect(share.calls).toEqual(['openHost', 'stop']);
    expect(ctl.S.overlay, 'Triangle is not the account here').toBeNull();
  });

  it('Stop by click', () => {
    const { ctl, share } = open();
    view(ctl, share, copying());
    click(q('[data-act="sendstop"]')!);
    expect(share.calls).toEqual(['openHost', 'stop']);
  });

  it('the last copy\'s outcome, in words', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'open', link: LINK, pending: [], last: { code: 'QX7K4M', outcome: 'done' } });
    expect(q('[data-send="last"]')!.textContent).toBe(sendLast({ code: 'QX7K4M', outcome: 'done' }));
    expect(sendLast({ code: 'QX7K4M', outcome: 'done' })).toContain('QX7K4M');
    view(ctl, share, { phase: 'open', link: LINK, pending: [], last: { code: 'QX7K4M', outcome: 'failed', reason: 'The connection dropped.' } });
    expect(q('[data-send="last"]')!.textContent).toContain('The connection dropped.');
  });

  it('needs-extract and failed, in words', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'needs-extract', pending: [] });
    expect(q('[data-send="status"]')!.textContent).toContain(SEND_NEEDS_EXTRACT);
    expect(q('[data-send="qr"]')).toBeNull();
    view(ctl, share, { phase: 'failed', reason: 'Pairing isn’t available on this site right now.', pending: [] });
    expect(q('[data-send="status"]')!.textContent).toContain(SEND_FAILED);
    expect(q('[data-send="status"]')!.textContent).toContain('Pairing isn’t available on this site right now.');
  });
});

describe('DSH-10: the send area closed (Q10: closing ends the share)', () => {
  it('Circle calls closeHost and goes back to the rows, the cursor on "Send Game Files"', () => {
    const { ctl, share } = open();
    ctl.press('circle');
    expect(share.calls).toEqual(['openHost', 'closeHost']);
    expect(ctl.S.chk.send).toBeFalsy();
    expect(panel(), 'the panel stays').not.toBeNull();
    expect(focusedRow()).toBe('send');
    expect(ctl.S.chk.row).toBe(LAUNCH_SEND_ROW);
    ctl.press('circle');
    expect(panel(), 'a second Circle shuts the panel').toBeNull();
    expect(share.calls.filter((c) => c === 'closeHost')).toHaveLength(1);
  });

  it('the crumb\'s Back does the same', () => {
    const { ctl, share } = open();
    click(panel()!.querySelector('.cx-back')!);
    expect(share.calls).toEqual(['openHost', 'closeHost']);
    expect(ctl.S.chk.send).toBeFalsy();
  });

  it('shut by another path (another category clicked behind it) ends the share too', () => {
    const { ctl, share } = open();
    click(document.querySelector<HTMLElement>('#stage [data-act="cat"][data-i="1"]')!);
    expect(ctl.S.chk.open).toBe(false);
    expect(ctl.S.chk.send).toBeFalsy();
    expect(share.calls).toEqual(['openHost', 'closeHost']);
  });
});

describe('DSH-10, Q11: Deploy while sharing asks first', () => {
  /** The area open with no pad (Play's Cross opened the panel), then a pad connected: Play is ready, START launches. */
  function ready(hv: SendFake['hv']): { ctl: ConsolePage['ctl']; share: SendFake } {
    let pad = false;
    const r = open(sendFake(true), { pad: () => pad });
    pad = true;
    view(r.ctl, r.share, hv);
    expect(r.ctl.S.chk.send, 'a pad waking leaves the send area open').toBe(true);
    return r;
  }
  const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('#overlay .cx-dialog');

  it('a request waiting: START asks in SHARE_DEPLOY_STOPS\' words; No stays, the share kept', () => {
    const { ctl, share } = ready({ phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M')] });
    ctl.press('options');
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('share-deploy');
    expect(ctl.S.start).toBe('idle');
    expect(SHARE_DEPLOY_CONFIRM.lead).toBe(SHARE_DEPLOY_STOPS);
    expect(dialog()!.textContent).toContain(SHARE_DEPLOY_STOPS);
    expect(dialog()!.textContent).toContain(SHARE_DEPLOY_CONFIRM.yes);
    expect(ctl.S.chk.send, 'the area stands under the question').toBe(true);
    expect(share.calls).toEqual(['openHost']);
    ctl.press('cross');                                           // No, first and focused
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.start).toBe('idle');
    expect(ctl.S.chk.send).toBe(true);
    expect(area()).not.toBeNull();
    expect(share.calls).toEqual(['openHost']);
  });

  it('a copy under way: Yes deploys, and the share ends', () => {
    const { ctl, share } = ready({ phase: 'open', link: LINK, active: { id: 'r1', code: 'QX7K4M', bytes: 1, total: 4 }, pending: [] });
    ctl.press('options');
    expect(ctl.S.confirmKind).toBe('share-deploy');
    ctl.press('down');
    ctl.press('cross');
    expect(ctl.S.start).toBe('arming');
    expect(ctl.S.chk.open).toBe(false);
    expect(share.calls).toEqual(['openHost', 'closeHost']);
  });

  it('the question\'s Yes by click deploys too', () => {
    const { ctl, share } = ready({ phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M')] });
    ctl.press('options');
    click(document.querySelector<HTMLElement>('#overlay [data-act="confirm"][data-i="1"]')!);
    expect(ctl.S.start).toBe('arming');
    expect(share.calls).toEqual(['openHost', 'closeHost']);
  });

  it('idle (the link open, nothing asked, nothing copying): START deploys without asking', () => {
    const { ctl, share } = ready({ phase: 'open', link: LINK, pending: [] });
    ctl.press('options');
    expect(ctl.S.overlay).not.toBe('confirm');
    expect(ctl.S.start).toBe('arming');
    expect(share.calls).toEqual(['openHost', 'closeHost']);
  });
});

/**
 * The review of agent/disc-send-row (2f, finding 2): Circle's word and its press follow what is shared. In needs-extract
 * or failed there is no share, so Circle is "Back"; while a copy runs, Circle (and the crumb's Back) asks first, in the
 * words of the question Deploy asks (`SHARE_CLOSE_CONFIRM`, `SHARE_DEPLOY_STOPS`' family): No leaves the area and the
 * copy as they were, Yes ends the share. With no copy under way it closes at once (Q10).
 */
describe('DSH-10 review F2: Circle in the send area', () => {
  const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('#overlay .cx-dialog');
  const copying = (): SendFake['hv'] => ({ phase: 'open', link: LINK, active: { id: 'r1', code: 'QX7K4M', bytes: 1, total: 4 }, pending: [] });

  it('needs-extract and failed share nothing: Circle is Back, and goes back', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'needs-extract', pending: [] });
    expect(word(ctl, 'circle')).toBe(SEND_BACK);
    view(ctl, share, { phase: 'failed', reason: 'x', pending: [] });
    expect(word(ctl, 'circle')).toBe(SEND_BACK);
    ctl.press('circle');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.chk.send).toBeFalsy();
  });

  it('sharing: Circle is Stop sharing', () => {
    const { ctl, share } = open();
    expect(word(ctl, 'circle')).toBe(SEND_CLOSE);
    view(ctl, share, { phase: 'opening', pending: [] });
    expect(word(ctl, 'circle')).toBe(SEND_CLOSE);
  });

  it('while a copy runs, Circle asks first in the Deploy question\'s words; No keeps the area and the copy', () => {
    const { ctl, share } = open();
    view(ctl, share, copying());
    ctl.press('circle');
    expect(ctl.S.overlay).toBe('confirm');
    expect(ctl.S.confirmKind).toBe('share-close');
    expect(SHARE_CLOSE_CONFIRM.lead).toBe(SHARE_CLOSE_STOPS);
    expect(SHARE_CLOSE_STOPS).toContain('the copy under way stops and the requests waiting are turned away');
    expect(dialog()!.textContent).toContain(SHARE_CLOSE_STOPS);
    expect(dialog()!.textContent).toContain(SHARE_CLOSE_CONFIRM.yes);
    expect(ctl.S.chk.send, 'the area stands under the question').toBe(true);
    expect(share.calls).toEqual(['openHost']);
    ctl.press('cross');                                           // No, first and focused
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.chk.send).toBe(true);
    expect(area()).not.toBeNull();
    expect(share.calls).toEqual(['openHost']);
  });

  it('while a copy runs, Yes stops sharing: closeHost, the rows again on Send Game Files', () => {
    const { ctl, share } = open();
    view(ctl, share, copying());
    ctl.press('circle');
    ctl.press('down');
    ctl.press('cross');
    expect(ctl.S.overlay).toBeNull();
    expect(ctl.S.chk.send).toBeFalsy();
    expect(ctl.S.chk.open).toBe(true);
    expect(share.calls).toEqual(['openHost', 'closeHost']);
    expect(focusedRow()).toBe('send');
  });

  it('the crumb\'s Back asks too while a copy runs', () => {
    const { ctl, share } = open();
    view(ctl, share, copying());
    click(panel()!.querySelector('.cx-back')!);
    expect(ctl.S.confirmKind).toBe('share-close');
    expect(ctl.S.overlay).toBe('confirm');
    expect(share.calls).toEqual(['openHost']);
  });

  it('requests waiting but no copy: Circle closes at once (the ask is the copy\'s)', () => {
    const { ctl, share } = open();
    view(ctl, share, { phase: 'open', link: LINK, pending: [req('r1', 'QX7K4M')] });
    ctl.press('circle');
    expect(ctl.S.overlay).toBeNull();
    expect(share.calls).toEqual(['openHost', 'closeHost']);
  });
});

/** The review of agent/disc-send-row (2f, finding 3): RB-27's "L2/R2 page a long list" -- `SEND_PAGE` targets at a time, the ends kept. */
describe('DSH-10 review F3: L2 / R2 page the send area\'s targets', () => {
  it('R2 moves SEND_PAGE targets down, L2 up; both stop at the ends; Up / Down still one at a time', () => {
    const { ctl, share } = open();
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
    view(ctl, share, { phase: 'open', link: LINK, pending: ids.map((id, k) => req(id, `QX7K4${'ABCDEFGH'[k]!}`)) });
    expect(SEND_PAGE).toBe(5);
    const copyLit = (): boolean => q('[data-send="copy"]')!.classList.contains('is-focused');
    expect(copyLit(), 'the link first').toBe(true);
    ctl.press('r2');                                              // link (0) -> target 5: r5
    expect(focusedReq()).toBe('r5');
    ctl.press('r2');                                              // 10, kept at the last: r8
    expect(focusedReq()).toBe('r8');
    ctl.press('l2');                                              // 8 - 5 = 3: r3
    expect(focusedReq()).toBe('r3');
    ctl.press('down');
    expect(focusedReq()).toBe('r4');
    ctl.press('l2');                                              // 4 - 5, kept at the first: the link
    expect(copyLit()).toBe(true);
    expect(share.calls, 'paging answers nothing').toEqual(['openHost']);
  });
});
