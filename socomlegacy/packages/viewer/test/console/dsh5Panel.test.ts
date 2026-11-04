// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveControls } from '../../src/console/adapters/controls';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { LAUNCH_PADSET_ROW, LAUNCH_SHARE_ROW, LAUNCH_CHECK_ROWS, type Adapters } from '../../src/console/state';
import { prompts } from '../../src/console/render/legend';
import {
  DISC_SHARE_ALPHABET, makeShareCode, readShareCode, shareLink, stubDiscShare,
  type DiscShareAdapter, type ReceiverView, type SenderView,
} from '../../src/discShareView';
import { SHARE_NOT_BUILT, SHARE_ROW_HINT, SHARE_ROW_LABEL } from '../../src/discShareWords';
import { GRAPHICS_BACKEND_KEY, readGraphicsBackend } from '../../src/graphicsBackend';
import { qrMatrix, qrSvg } from '../../src/qr';
import { mountShell } from './shell';

/**
 * DSH-5 (the disc share plan, DSH.R12, the owner, 2026-10-29: "the ui for it should be placed in the right aligned pre
 * launch window at the bottom below controller settings with a new component. "Request Game Files (XBOX)". When that item
 * is clicked a larger area expands and a QR code is shown to tunnel with some instruction steps"): the row below
 * "Controller settings" in Play's "Before you deploy" panel, its expanded area (the QR of the pairing link, the code, the
 * site, the steps, the receiver's phases), and the sender's dialog the link opens (`?discshare=<CODE>`), its Yes only
 * with a complete extraction (DSH.R7). The screens read only the disc share adapter (`src/discShareView.ts`). A browser
 * adaptation: the launcher's flow, nothing of the game.
 */
let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; vi.unstubAllEnvs(); vi.useRealTimers(); localStorage.clear(); });

const ORIGIN = 'https://s2.example.org';

/** A release build with no pad (Play opens the panel), the disc ready, `share` the disc share adapter. */
function boot(share: DiscShareAdapter | undefined): { ctl: ConsolePage['ctl']; A: Adapters } {
  vi.stubEnv('DEV', false);
  const A: Adapters = { ...sampleAdapters(), controls: liveControls({ connected: () => false }, { touch: () => false, keyboard: () => false }), ...(share ? { discShare: share } : {}) };
  A.disc.state = () => 'ready';
  page = bootConsole(document, window, A, { keymap: false });
  return { ctl: page.ctl, A };
}

/** A disc share adapter whose views the test sets. */
function fake(rx: ReceiverView = { phase: 'idle' }, tx: SenderView | null = null): DiscShareAdapter & { rx: ReceiverView; tx: SenderView | null; calls: string[] } {
  const calls: string[] = [];
  const f = {
    rx, tx, calls,
    receiver: () => f.rx,
    request: () => { calls.push('request'); f.rx = { phase: 'waiting', code: 'QX7K4M', link: shareLink(ORIGIN, 'QX7K4M') }; },
    cancel: () => { calls.push('cancel'); f.rx = { phase: 'idle' }; },
    sender: () => f.tx,
    approve: () => { calls.push('approve'); },
    decline: () => { calls.push('decline'); if (f.tx) f.tx = { ...f.tx, phase: 'declined' }; },
    openSend: () => { calls.push('openSend'); },   // DSH-4: the code entry (its own tests: dsh4SendEntry)
    choose: () => false,
    onChange: () => () => {},
  };
  return f;
}

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage .cx-home [data-panel="launch"]');
const focused = (): string | null => panel()?.querySelector<HTMLElement>('.cx-r.is-focused')?.dataset['id'] ?? null;
const area = (): HTMLElement | null => panel()?.querySelector<HTMLElement>('[data-share="receiver"]') ?? null;
const word = (ctl: ConsolePage['ctl'], k: string): string | undefined => prompts(ctl.S, ctl.A).find((x) => x.k === k)?.label;
const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('#overlay .cx-dialog.cx-share-send');

/** Play's Cross (the panel opens on the controller check), then Down to the share row. */
function toShareRow(ctl: ConsolePage['ctl']): void {
  ctl.press('cross');
  while (focused() !== 'share' && ctl.S.chk.row < LAUNCH_CHECK_ROWS - 1) ctl.press('down');
}

describe('DSH-5: the "Request Game Files (XBOX)" row of Play\'s "Before you deploy" panel', () => {
  it('is the panel\'s last row, below "Controller settings", with its label, its line and its mark', () => {
    const { ctl } = boot(fake());
    ctl.press('cross');
    expect(LAUNCH_SHARE_ROW).toBe(LAUNCH_PADSET_ROW + 1);
    expect(LAUNCH_CHECK_ROWS).toBe(LAUNCH_SHARE_ROW + 1);
    expect([...panel()!.querySelectorAll<HTMLElement>('.cx-r[data-id]')].map((r) => r.dataset['id'])).toEqual(['disc', 'pad', 'deploy', 'skipmenu', 'padsettings', 'share']);   // SKIP-MENU (LR.R33): its toggle above Controller settings
    const row = panel()!.querySelector<HTMLElement>('[data-id="share"]')!;
    expect(row.querySelector('.cx-r__label')!.textContent).toBe(SHARE_ROW_LABEL);
    expect(row.querySelector('.cx-r__hint')!.textContent).toBe(SHARE_ROW_HINT);
    expect(row.querySelector('.cx-r__icon svg')).not.toBeNull();
    expect(row.tagName).toBe('BUTTON');
  });

  it('is not drawn without a disc share adapter (the overlay\'s, the sample\'s)', () => {
    const { ctl } = boot(undefined);
    ctl.press('cross');
    expect(panel()!.querySelector('[data-id="share"]')).toBeNull();
    for (let k = 0; k < 6; k++) ctl.press('down');
    expect(focused(), 'the cursor stops at Controller settings').toBe('padsettings');
  });

  it('the pad reaches it: Down from Controller settings; the legend\'s Cross says Request', () => {
    const { ctl } = boot(fake());
    toShareRow(ctl);
    expect(focused()).toBe('share');
    expect(word(ctl, 'cross')).toBe('Request');
    ctl.press('down');
    expect(focused(), 'the end kept').toBe('share');
  });

  it('Cross expands it: the panel widens to the QR of the pairing link, the code, the site and the steps', () => {
    const share = fake();
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    expect(share.calls).toEqual(['request']);
    expect(ctl.S.chk.share).toBe(true);
    expect(panel()!.classList.contains('is-share'), 'the wider panel').toBe(true);
    expect(panel()!.querySelector('.cx-title')!.textContent).toBe(SHARE_ROW_LABEL);
    const a = area()!;
    expect(a.dataset['phase']).toBe('waiting');
    const link = `${ORIGIN}/?discshare=QX7K4M`;
    const want = document.createElement('div');
    want.innerHTML = qrSvg(qrMatrix(link), { label: `Pairing link: ${link}` });
    expect(a.querySelector('[data-share="qr"]')!.innerHTML, 'the QR is the link\'s').toBe(want.innerHTML);
    expect(a.querySelector('[data-share="qr"] svg')!.getAttribute('data-qr-quiet')).toBe('4');
    expect(a.querySelector('[data-share="code"]')!.textContent).toBe('QX7K4M');
    expect(a.querySelector('[data-share="link"]')!.textContent).toBe(link);
    expect(a.querySelector('[data-share="host"]')!.textContent).toContain('s2.example.org');
    const steps = [...a.querySelectorAll('ol[data-share="steps"] > li')].map((li) => li.textContent);
    expect(steps).toHaveLength(4);
    expect(steps[1]).toContain('QX7K4M');
    expect(steps[3]).toContain('1.34 GB');
    expect(panel()!.querySelectorAll('.cx-r[data-id]'), 'the rows give way to the area').toHaveLength(0);
    expect(word(ctl, 'circle')).toBe('Back');
  });

  it('Circle collapses it: the rows back, the cursor on the row, an unanswered request withdrawn', () => {
    const share = fake();
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    ctl.press('circle');
    expect(ctl.S.chk.share).toBe(false);
    expect(panel(), 'the panel stays').not.toBeNull();
    expect(panel()!.classList.contains('is-share')).toBe(false);
    expect(focused()).toBe('share');
    expect(share.calls).toEqual(['request', 'cancel']);
    ctl.press('circle');
    expect(panel(), 'a second Circle shuts the panel').toBeNull();
  });

  it('a click (a tap) on the row expands it, the crumb\'s Back collapses it', () => {
    const share = fake();
    const { ctl } = boot(share);
    ctl.press('cross');
    click(panel()!.querySelector('[data-id="share"]')!);
    expect(ctl.S.chk.share).toBe(true);
    expect(area()).not.toBeNull();
    click(panel()!.querySelector('.cx-back')!);
    expect(ctl.S.chk.share).toBe(false);
  });

  it('a copy under way is not withdrawn by collapsing; the row says how far it is', () => {
    const share = fake({ phase: 'copying', code: 'QX7K4M', link: shareLink(ORIGIN, 'QX7K4M'), bytes: 669195532, total: 1338391063 });
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    expect(share.calls, 'no new request over a copy').toEqual([]);
    ctl.press('circle');
    expect(share.calls).toEqual([]);
    expect(panel()!.querySelector('[data-id="share"] .cx-r__hint')!.textContent).toContain('50%');
  });
});

/**
 * The disc share review's N3: leaving the expanded area by any path -- not only Circle or the crumb's Back -- withdraws a
 * request no device has answered (requesting or waiting), as Circle does; a copy under way goes on.
 */
describe('DSH-5 review N3: the area collapsed by navigation', () => {
  const cat = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage [data-act="cat"][data-i="${i}"]`)!;
  const item = (i: number): HTMLElement => document.querySelector<HTMLElement>(`#stage .cx-list [data-act="item"][data-i="${i}"]`)!;

  it.each(['requesting', 'waiting'] as const)('%s: another category clicked shuts the panel and withdraws the request', (phase) => {
    const share = fake(phase === 'waiting' ? { phase, code: 'QX7K4M', link: shareLink(ORIGIN, 'QX7K4M') } : { phase });
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    expect(ctl.S.chk.share).toBe(true);
    click(cat(1));
    expect(ctl.S.chk.share).toBe(false);
    expect(share.calls).toEqual(['cancel']);
    expect(share.rx.phase).toBe('idle');
  });

  it('waiting: a Home item clicked behind the panel shuts it and withdraws the request', () => {
    const share = fake();
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    expect(share.calls).toEqual(['request']);
    click(item(1));
    expect(ctl.S.chk.share).toBe(false);
    expect(share.calls).toEqual(['request', 'cancel']);
  });

  it.each(['copying', 'paired', 'done', 'failed'] as const)('%s: leaving does not withdraw anything', (phase) => {
    const share = fake({ phase, code: 'QX7K4M', link: shareLink(ORIGIN, 'QX7K4M'), bytes: 1, total: 2, reason: 'x' } as ReceiverView);
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    const before = [...share.calls];
    click(cat(1));
    expect(ctl.S.chk.share).toBe(false);
    expect(share.calls).toEqual(before);
    expect(share.rx.phase).toBe(phase);
  });
});

describe('DSH-5: the receiver\'s phases in the expanded area', () => {
  const open = (rx: ReceiverView): { ctl: ConsolePage['ctl']; share: ReturnType<typeof fake> } => {
    const share = fake(rx);
    const { ctl } = boot(share);
    toShareRow(ctl);
    ctl.press('cross');
    return { ctl, share };
  };
  const link = shareLink(ORIGIN, 'QX7K4M');

  it('requesting: no QR yet, its words', () => {
    open({ phase: 'requesting' });
    expect(area()!.dataset['phase']).toBe('requesting');
    expect(area()!.querySelector('[data-share="qr"] svg')).toBeNull();
    expect(area()!.querySelector('[data-share="status"]')!.textContent).toContain('Making a code');
  });

  it('waiting: the other device awaited', () => {
    open({ phase: 'waiting', code: 'QX7K4M', link });
    expect(area()!.querySelector('[data-share="status"]')!.textContent).toContain('Waiting for your other device');
  });

  it('paired', () => {
    open({ phase: 'paired', code: 'QX7K4M', link });
    expect(area()!.querySelector('[data-share="status"]')!.textContent).toContain('Paired');
  });

  it('copying: a progress bar with the bytes and the percent', () => {
    open({ phase: 'copying', code: 'QX7K4M', link, bytes: 334597766, total: 1338391063 });
    const bar = area()!.querySelector<HTMLElement>('[data-share="status"] [role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(area()!.querySelector('[data-share="pct"]')!.textContent).toBe('25%');
    expect(area()!.querySelector('[data-share="bytes"]')!.textContent).toBe('0.33 of 1.34 GB');
  });

  it('done: the disc ready', () => {
    open({ phase: 'done', code: 'QX7K4M', link, bytes: 1338391063, total: 1338391063 });
    expect(area()!.querySelector('[data-share="status"]')!.textContent).toContain('your disc is ready');
  });

  it('failed: its reason, and Try again (Cross, or a click) asks again', () => {
    const { ctl, share } = open({ phase: 'failed', code: 'QX7K4M', link, reason: 'The other device is on another network.' });
    expect(share.calls, 'a failure shown, not retried by opening').toEqual([]);
    expect(area()!.querySelector('[data-share="status"]')!.textContent).toContain('The other device is on another network.');
    expect(word(ctl, 'cross')).toBe('Try again');
    ctl.press('cross');
    expect(share.calls).toEqual(['request']);
    share.rx = { phase: 'failed', reason: 'again' };
    ctl.render();
    click(area()!.querySelector('[data-share="retry"]')!);
    expect(share.calls).toEqual(['request', 'request']);
  });

  it('failed before a code (pairing unavailable): no empty QR box, the reason first, and a head that fits', () => {
    // Seat 3d's rendered check (844x390): the QR box kept "Making a code…" and the reason sat below the fold.
    open({ phase: 'failed', reason: 'Pairing isn’t available on this site right now.' });
    expect(area()!.querySelector('[data-share="qr"]'), 'no QR box without a code').toBeNull();
    const info = area()!.querySelector('.cx-share__info')!;
    expect(info.firstElementChild!.getAttribute('data-share'), 'the reason before the steps').toBe('status');
    const status = area()!.querySelector('[data-share="status"]')!.textContent!;
    expect(status).toContain('Pairing isn’t available on this site right now.');
    expect(status, 'nothing was copied').not.toContain('The copy did not finish');
    expect(area()!.textContent).not.toContain('Making a code');
  });
});

describe('DSH-5: the sender\'s dialog the pairing link opens', () => {
  it('no ?discshare=: no dialog', () => {
    boot(stubDiscShare({ search: '', origin: ORIGIN, complete: () => true }));
    expect(dialog()).toBeNull();
  });

  it('a complete extraction: the code to match by eye, Yes and No; Yes approves', () => {
    const share = stubDiscShare({ search: '?discshare=qx7k4m', origin: ORIGIN, complete: () => true });
    const { ctl } = boot(share);
    const d = dialog()!;
    expect(ctl.S.overlay).toBe('share');
    expect(d.querySelector('.cx-dialog__title')!.textContent).toBe('Send game files to your other device');
    expect(d.querySelector('[data-share="code"]')!.textContent).toBe('QX7K4M');
    const buttons = [...d.querySelectorAll<HTMLElement>('[data-act="sharesend"]')].map((b) => b.textContent!.trim());
    expect(buttons.some((t) => t.includes('Yes, send'))).toBe(true);
    expect(buttons.some((t) => t.includes('No'))).toBe(true);
    expect(word(ctl, 'cross')).toBe('Yes, send');
    ctl.press('cross');
    expect(share.sender()!.phase, 'the stub: no transfer yet').toBe('failed');
    expect(dialog()!.textContent).toContain(SHARE_NOT_BUILT);
    ctl.press('circle');
    expect(dialog(), 'Close').toBeNull();
    expect(ctl.S.overlay).toBeNull();
  });

  it('no complete extraction: no Yes; "Extract, then send" and why', () => {
    let complete = false;
    const share = stubDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, complete: () => complete });
    const { ctl } = boot(share);
    const d = dialog()!;
    expect(d.textContent).not.toContain('Yes, send');
    expect(d.textContent).toContain('Extract, then send');
    expect(d.textContent).toContain('does not hold a complete copy');
    ctl.press('cross');
    expect(share.sender()!.phase, 'Cross on Extract never approves').toBe('needs-extract');
    complete = true;
    ctl.render();
    expect(dialog()!.textContent).toContain('Yes, send');
  });

  it('No (Circle, or the button) declines and closes', () => {
    const share = stubDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, complete: () => true });
    const { ctl } = boot(share);
    ctl.press('circle');
    expect(share.sender()!.phase).toBe('declined');
    expect(dialog()).toBeNull();
    expect(ctl.S.overlay).toBeNull();
  });

  it('the No button\'s click declines', () => {
    const share = stubDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, complete: () => true });
    boot(share);
    const no = [...dialog()!.querySelectorAll<HTMLElement>('[data-act="sharesend"]')].find((b) => b.textContent!.includes('No'))!;
    click(no);
    expect(share.sender()!.phase).toBe('declined');
    expect(dialog()).toBeNull();
  });

  it('sending: progress; done: its words', () => {
    const share = fake({ phase: 'idle' }, { phase: 'sending', code: 'QX7K4M', bytes: 669195532, total: 1338391063 });
    const { ctl } = boot(share);
    expect(dialog()!.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
    share.tx = { phase: 'done', code: 'QX7K4M' };
    ctl.render();
    expect(dialog()!.textContent).toContain('Sent.');
  });
});

describe('DSH-5: the stub and the code', () => {
  it('codes are 6 characters of the unambiguous alphabet, from the random source', () => {
    for (let k = 0; k < 50; k++) {
      const c = makeShareCode();
      expect(c).toHaveLength(6);
      for (const ch of c) expect(DISC_SHARE_ALPHABET).toContain(ch);
    }
    expect(makeShareCode((a) => a.fill(0))).toBe('AAAAAA');
    expect(makeShareCode((a) => { a.fill(255); a[5] = 1; a[11] = 30; return a; }).startsWith('B9'), 'bytes past 247 drawn again').toBe(true);
  });

  it('readShareCode takes a well-formed code only', () => {
    expect(readShareCode('?discshare=qx7k4m')).toBe('QX7K4M');
    expect(readShareCode('?discshare=QX7-K4M')).toBe('QX7K4M');
    expect(readShareCode('?discshare=QX7K4')).toBeNull();
    expect(readShareCode('?discshare=QX7K4O'), 'O is not in the alphabet').toBeNull();
    expect(readShareCode('?x=1')).toBeNull();
  });

  it('the stub receiver: request makes a code and waits with the link; cancel goes back to idle', () => {
    const s = stubDiscShare({ search: '', origin: ORIGIN, complete: () => false });
    const seen: number[] = [];
    s.onChange(() => seen.push(1));
    expect(s.receiver().phase).toBe('idle');
    s.request();
    const v = s.receiver();
    expect(v.phase).toBe('waiting');
    expect(v.link).toBe(`${ORIGIN}/?discshare=${v.code}`);
    s.cancel();
    expect(s.receiver().phase).toBe('idle');
    expect(seen).toHaveLength(2);
  });

  it('the stub sender: approve does nothing without a complete extraction', () => {
    const s = stubDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, complete: () => false });
    s.approve();
    expect(s.sender()!.phase).toBe('needs-extract');
  });
});


describe('Xbox file request graphics preset', () => {
  it('selecting the receiver action saves Xbox graphics; merely opening Play does not', () => {
    const { ctl } = boot(fake());
    toShareRow(ctl);
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
    ctl.press('cross');
    expect(readGraphicsBackend()).toBe('xbox');
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBe('xbox');
    ctl.press('circle');
    expect(readGraphicsBackend()).toBe('xbox');
  });
  it('the sender keeps its own graphics settings', () => {
    const { ctl } = boot(fake());
    ctl.openSender();
    expect(localStorage.getItem(GRAPHICS_BACKEND_KEY)).toBeNull();
  });
});


it('selecting Xbox clears a stale renderer address override while retaining the route and history state', () => {
  history.replaceState({ marker: 'keep' }, '', '/?renderer=auto&map=MP2#keep');
  try {
    const { ctl } = boot(fake());
    toShareRow(ctl);
    const before = { path: location.pathname, state: history.state };
    ctl.press('cross');
    expect(readGraphicsBackend()).toBe('xbox');
    expect(new URLSearchParams(location.search).has('renderer')).toBe(false);
    expect(new URLSearchParams(location.search).get('map')).toBe('MP2');
    expect(location.pathname).toBe(before.path);
    expect(location.hash).toBe('#keep');
    expect(history.state).toEqual(before.state);
  } finally { history.replaceState(null, '', '/'); }
});

/**
 * Setup onboarding (Trello ZjCZXTTW, the playtest of 2026-11-01: Xbox players scanned the code with a phone that had no
 * copy of the game): the Xbox side says beforehand which device opens the link, the phone's no-copy dialog leads with what
 * to do, and "Before you deploy" with the disc out points at Request Game Files in one line. A browser adaptation.
 */
describe('Setup onboarding: the disc share says which device to use, before and after the scan', () => {
  it('the disc out: the panel\'s head points at Request Game Files in one line (none with the disc in, none without a share)', () => {
    const { ctl, A } = boot(fake());
    A.disc.state = () => 'empty';
    ctl.press('cross');
    expect(panel()!.querySelector('.cx-screenhead__desc')!.textContent).toBe('On Xbox? Choose Request Game Files (XBOX) at the bottom of this list.');
    ctl.press('circle');
    A.disc.state = () => 'ready';
    ctl.press('cross');
    expect(panel()!.querySelector('.cx-screenhead__desc')).toBeNull();
  });

  it('no pointer without a disc share adapter', () => {
    const { ctl, A } = boot(undefined);
    A.disc.state = () => 'empty';
    ctl.press('cross');
    expect(panel()).not.toBeNull();
    expect(panel()!.querySelector('.cx-screenhead__desc')).toBeNull();
  });

  it('the Request Game Files area says first, before the steps, to open the link on the device that has the game', () => {
    const { ctl } = boot(fake());
    toShareRow(ctl);
    ctl.press('cross');
    const lead = area()!.querySelector('[data-share="lead"]')!;
    expect(lead.textContent).toBe('Open this link on the PC or phone that already has the game set up. A phone without the game cannot send it.');
    expect(lead.compareDocumentPosition(area()!.querySelector('[data-share="steps"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const steps = [...area()!.querySelectorAll('ol[data-share="steps"] > li')].map((li) => li.textContent);
    expect(steps[0]).toBe('On that PC or phone, on the same home network, open this site.');
  });

  it('the phone with no copy: the dialog leads with what to do', () => {
    const share = stubDiscShare({ search: '?discshare=QX7K4M', origin: ORIGIN, complete: () => false });
    boot(share);
    const d = dialog()!;
    expect(d.querySelector('.cx-dialog__lead')!.textContent).toBe('Put your ISO on this device first, or open this link on the PC or phone that already has the game.');
    expect(d.querySelector('[data-share="why"]')!.textContent).toContain('does not hold a complete copy');
  });
});
