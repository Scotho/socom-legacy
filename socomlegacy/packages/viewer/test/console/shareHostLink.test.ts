// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveAdapters } from '../../src/console/adapters';
import { liveControls } from '../../src/console/adapters/controls';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { LAUNCH_SHARE_ROW, type Adapters } from '../../src/console/state';
import { prompts } from '../../src/console/render/legend';
import { liveDiscShare } from '../../src/discShare';
import { DiscShareError, type DiscShareSignal } from '../../src/discShareSignal';
import { DISC_SHARE_HOST_PARAM, readShareHostToken, shareHostLink, type DiscShareAdapter, type ReceiverView } from '../../src/discShareView';
import { launchParam } from '../../src/launchSettings/params';
import {
  RECEIVER_HOSTED_WAITING, RECEIVER_HOSTED_WORDS, RECEIVER_WORDS, SHARE_ASK_AGAIN, SHARE_HOST_ENDED, SHARE_RETRY, SHARE_ROW_HINT, shareRowHint,
} from '../../src/discShareWords';
import { mountShell } from './shell';

/**
 * RB-26's receiver side (the replay batch plan; RB-25's routes; DSH.R16 with its Q9-Q11 defaults): a page opened by a
 * host's link (`?discshare-host=<token>`) reads the token at its entry (`readShareHostToken`, the address-parameter
 * table's row), makes its request against that host (`LiveShareDeps.hostToken`), opens Play's "Before you deploy" panel
 * on the share's area (`chk.share`) by itself, and says what the host's long-poll answers: queued at the host (waiting,
 * its code shown to match), declined (Cross asks again), approved (paired, then the copy). Without a token nothing
 * changes. A browser adaptation, product track: nothing of the game.
 */

let page: ConsolePage | null = null;
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); mountShell(document); });
afterEach(() => {
  page?.dispose(); page = null;
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear();
  history.replaceState(null, '', '/');
});

const ORIGIN = 'https://s2.example.org';
const LINK_ID = 'tok_'.padEnd(24, 'x');                          // central's form: base64url of 18 bytes (`discShareHttp.ts`)

/** A release build with no pad, the disc out (a receiver's page), `share` the disc share adapter. */
function boot(share: DiscShareAdapter): { ctl: ConsolePage['ctl']; A: Adapters } {
  vi.stubEnv('DEV', false);
  const A: Adapters = { ...sampleAdapters(), controls: liveControls({ connected: () => false }, { touch: () => false, keyboard: () => false }), discShare: share };
  A.disc.state = () => 'empty';
  page = bootConsole(document, window, A, { keymap: false });
  return { ctl: page.ctl, A };
}

/** A disc share adapter whose receiver view the test sets; `linked`, a page a host's link opened. */
type Fake = DiscShareAdapter & { rx: ReceiverView; calls: string[] };
function fake(linked: boolean, rx: ReceiverView = { phase: 'idle' }): Fake {
  const calls: string[] = [];
  const f: Fake = {
    rx, calls,
    receiver: () => f.rx,
    request: () => { calls.push('request'); f.rx = linked ? { phase: 'waiting', code: 'QX7K4M', hosted: true } : { phase: 'waiting', code: 'QX7K4M', link: `${ORIGIN}/?discshare=QX7K4M` }; },
    cancel: () => { calls.push('cancel'); f.rx = { phase: 'idle' }; },
    sender: () => null,
    approve: () => undefined,
    decline: () => undefined,
    openSend: () => undefined,
    choose: () => false,
    onChange: () => () => {},
    ...(linked ? { hostLinked: () => true } : {}),
  };
  return f;
}

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage .cx-home [data-panel="launch"]');
const area = (): HTMLElement | null => panel()?.querySelector<HTMLElement>('[data-share="receiver"]') ?? null;
const head = (): string => area()?.querySelector('.cx-share__head span')?.textContent ?? '';
const line = (): string => area()?.querySelector('.cx-share__line')?.textContent ?? '';
const word = (ctl: ConsolePage['ctl'], k: string): string | undefined => prompts(ctl.S, ctl.A).find((x) => x.k === k)?.label;
const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };

describe('RB-26: the host link\'s token, read at the page\'s entry', () => {
  it('readShareHostToken reads ?discshare-host=<token> (base64url), and refuses none or a malformed one', () => {
    expect(DISC_SHARE_HOST_PARAM).toBe('discshare-host');
    expect(readShareHostToken(`?${DISC_SHARE_HOST_PARAM}=${LINK_ID}`)).toBe(LINK_ID);
    expect(readShareHostToken(new URL(shareHostLink(ORIGIN, LINK_ID)).search), 'the host\'s own link round-trips').toBe(LINK_ID);
    expect(readShareHostToken('')).toBeNull();
    expect(readShareHostToken('?discshare=QX7K4M')).toBeNull();
    for (const bad of ['', 'short', 'has space in it here ok', 'a/b+c=d0123456789abcdef', 'x'.repeat(65)]) {
      expect(readShareHostToken(`?${DISC_SHARE_HOST_PARAM}=${encodeURIComponent(bad)}`), bad).toBeNull();
    }
  });

  it('is a row of the address-parameter table (PTT-9), read in discShareView.ts', () => {
    expect(launchParam(DISC_SHARE_HOST_PARAM)).toMatchObject({ kind: 'string', group: 'pages', sheet: false, readIn: ['discShareView.ts'] });
  });
});

describe('RB-26: a page opened by a host\'s link asks the host, and says each answer', () => {
  it('opens Play\'s panel on the share\'s area by itself and requests once: queued at the host, its code to match, no QR', () => {
    const share = fake(true);
    const { ctl } = boot(share);
    expect(share.calls).toEqual(['request']);
    expect(ctl.S.chk).toMatchObject({ open: true, share: true, row: LAUNCH_SHARE_ROW });
    expect(panel()!.classList.contains('is-share')).toBe(true);
    const a = area()!;
    expect(a.dataset['phase']).toBe('waiting');
    expect(a.dataset['hosted']).toBe('true');
    expect(a.querySelector('[data-share="code"]')!.textContent).toBe('QX7K4M');
    expect(a.querySelector('[data-share="qr"]'), 'a hosted request has no link of its own').toBeNull();
    expect(a.querySelector('[data-share="link"]')).toBeNull();
    expect(head()).toBe(RECEIVER_HOSTED_WORDS.waiting!.head);
    expect(line()).toBe(RECEIVER_HOSTED_WAITING);
    expect(word(ctl, 'cross'), 'nothing for Cross while queued').toBeUndefined();
    expect(word(ctl, 'circle')).toBe('Back');
    ctl.press('cross');
    expect(share.calls, 'Cross does nothing while queued').toEqual(['request']);
  });

  it('declined: the host said No, Cross asks again (the legend says so), a click on the button too', () => {
    const share = fake(true);
    const { ctl } = boot(share);
    share.rx = { phase: 'declined', code: 'QX7K4M', hosted: true };
    ctl.render();
    expect(area()!.dataset['phase']).toBe('declined');
    expect(head()).toBe(RECEIVER_WORDS.declined.head);
    const again = area()!.querySelector<HTMLElement>('[data-act="sharerx"]')!;
    expect(again.textContent).toContain(SHARE_ASK_AGAIN);
    expect(word(ctl, 'cross')).toBe(SHARE_ASK_AGAIN);
    ctl.press('cross');
    expect(share.calls).toEqual(['request', 'request']);
    expect(area()!.dataset['phase']).toBe('waiting');
    share.rx = { phase: 'declined', code: 'QX7K4M', hosted: true };
    ctl.render();
    click(area()!.querySelector('[data-act="sharerx"]')!);
    expect(share.calls).toEqual(['request', 'request', 'request']);
  });

  it('approved: the host said Yes (paired), then the copy with its bar', () => {
    const share = fake(true);
    const { ctl } = boot(share);
    share.rx = { phase: 'paired', code: 'QX7K4M', hosted: true };
    ctl.render();
    expect(head()).toBe(RECEIVER_HOSTED_WORDS.paired!.head);
    share.rx = { phase: 'copying', code: 'QX7K4M', hosted: true, bytes: 669195532, total: 1338391063 };
    ctl.render();
    expect(area()!.querySelector('[data-share="pct"]')!.textContent).toBe('50%');
    expect(word(ctl, 'cross')).toBeUndefined();
  });

  it('failed (the host gone): Try again asks the host again', () => {
    const share = fake(true);
    const { ctl } = boot(share);
    share.rx = { phase: 'failed', reason: SHARE_HOST_ENDED, hosted: true };
    ctl.render();
    expect(area()!.textContent).toContain(SHARE_HOST_ENDED);
    expect(word(ctl, 'cross')).toBe(SHARE_RETRY);
    ctl.press('cross');
    expect(share.calls).toEqual(['request', 'request']);
  });

  it('Circle withdraws the queued request and shows the rows (the row says what stands); the panel is not opened again', () => {
    const share = fake(true);
    const { ctl } = boot(share);
    ctl.press('circle');
    expect(share.calls).toEqual(['request', 'cancel']);
    expect(ctl.S.chk.share).toBe(false);
    expect(panel()!.querySelector('.cx-r.is-focused')?.getAttribute('data-id')).toBe('share');
    ctl.press('circle');
    expect(panel()).toBeNull();
    ctl.render();
    expect(panel(), 'opened once, at the entry').toBeNull();
    expect(share.calls).toEqual(['request', 'cancel']);
  });

  it('the row\'s line says the hosted states', () => {
    expect(shareRowHint('waiting', null, true)).toBe(RECEIVER_HOSTED_WORDS.waiting!.head);
    expect(shareRowHint('paired', null, true)).toBe(RECEIVER_HOSTED_WORDS.paired!.head);
    expect(shareRowHint('waiting', null)).toBe('Waiting for the other device');
    expect(shareRowHint('idle', null, true)).toBe(SHARE_ROW_HINT);
  });

  it('without a host\'s link nothing changes: no panel, no request', () => {
    const share = fake(false);
    const { ctl } = boot(share);
    expect(share.calls).toEqual([]);
    expect(ctl.S.chk.open).toBe(false);
    expect(panel()).toBeNull();
  });
});

describe('RB-26: the live page passes the token into the disc share', () => {
  /** Central's request route answered; everything else the page asks refused (no server here). */
  function stubFetch(): { bodies: unknown[] } {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/discshare/request')) {
        bodies.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response(JSON.stringify({ id: 'id1', code: 'QX7K4M', secret: 's', expiresAt: Date.now() + 25_000 }), { status: 200 });
      }
      return new Response('', { status: 503 });
    }));
    return { bodies };
  }

  it('?discshare-host=<token>: the adapter knows the link, and its request is bound to the host ({ host: token })', async () => {
    const { bodies } = stubFetch();
    history.replaceState(null, '', `/?${DISC_SHARE_HOST_PARAM}=${LINK_ID}`);
    document.body.innerHTML = '';
    const A = liveAdapters(document, window);
    try {
      expect(A.discShare!.hostLinked?.()).toBe(true);
      A.discShare!.request();
      await vi.advanceTimersByTimeAsync(0);
      expect(bodies).toEqual([{ host: LINK_ID }]);
      expect(A.discShare!.receiver()).toMatchObject({ phase: 'waiting', code: 'QX7K4M', hosted: true });
    } finally {
      A.dispose();
    }
  });

  it('no token: a receiver-made code, as before', async () => {
    const { bodies } = stubFetch();
    document.body.innerHTML = '';
    const A = liveAdapters(document, window);
    try {
      expect(A.discShare!.hostLinked?.() ?? false).toBe(false);
      A.discShare!.request();
      await vi.advanceTimersByTimeAsync(0);
      expect(bodies).toEqual([{}]);
      expect(A.discShare!.receiver().hosted).toBeUndefined();
    } finally {
      A.dispose();
    }
  });

  it('a host\'s link whose share is gone (the route\'s 404) says the host stopped sharing', async () => {
    const signal = {
      request: async () => { throw new DiscShareError(404, 'no such host', true); },
    } as unknown as DiscShareSignal;
    const rx = liveDiscShare({ search: '', origin: ORIGIN, signal, complete: () => false, hostToken: LINK_ID });
    rx.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(rx.receiver()).toMatchObject({ phase: 'failed', reason: SHARE_HOST_ENDED });
    rx.dispose();
  });
});
