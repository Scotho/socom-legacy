import { vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { liveControls } from '../../src/console/adapters/controls';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import type { Adapters } from '../../src/console/state';
import type { DiscShareAdapter, HostView, ReceiverView } from '../../src/discShareView';

/**
 * DSH-10 and DSH-11's console doubles (the disc share plan, DSH.R17): a disc share adapter whose host mode (RB-26's
 * `HostView`) the test sets, its calls logged -- the console's screens read only the adapter (`src/discShareView.ts`), so
 * the transfer's own doubles (`../discShareFakes.ts`, the pipes and the stores) are not needed here; RB-26's own tests
 * hold the host mode over them (`test/discShare.test.ts`). Nothing of the game.
 */

export const ORIGIN = 'https://s2.example.org';
export const LINK = `${ORIGIN}/?discshare-host=${'tok_'.padEnd(24, 'x')}`;

export type SendFake = DiscShareAdapter & { whole: boolean; hv: HostView; rx: ReceiverView; calls: string[] };

/** A share adapter: `whole`, the page's kept extraction complete (`complete()`); `openHost` opens with `LINK`. */
export function sendFake(whole = true, opts: { complete?: boolean } = {}): SendFake {
  const calls: string[] = [];
  const f: SendFake = {
    whole, calls, hv: { phase: 'idle', pending: [] }, rx: { phase: 'idle' },
    receiver: () => f.rx,
    request: () => { calls.push('request'); f.rx = { phase: 'waiting', code: 'QX7K4M', link: `${ORIGIN}/?discshare=QX7K4M` }; },
    cancel: () => { calls.push('cancel'); f.rx = { phase: 'idle' }; },
    sender: () => null,
    approve: () => undefined,
    decline: () => undefined,
    openSend: () => undefined,
    choose: () => false,
    onChange: () => () => {},
    host: () => f.hv,
    openHost: () => { calls.push('openHost'); f.hv = { phase: 'open', link: LINK, pending: [] }; },
    closeHost: () => { calls.push('closeHost'); f.hv = { phase: 'idle', pending: [] }; },
    approveReq: (id: string) => { calls.push(`approve:${id}`); },
    declineReq: (id: string) => { calls.push(`decline:${id}`); },
    stopActive: () => { calls.push('stop'); },
  };
  if (opts.complete !== false) f.complete = () => f.whole;
  return f;
}

export interface SendBoot { ctl: ConsolePage['ctl']; A: Adapters; page: ConsolePage }

/**
 * A release build, the disc ready, `share` the disc share adapter (none: the sample's, no row); `pad()` whether a
 * controller is connected (none at first, so Play's Cross opens the panel); `disc` the disc adapter's kept extraction and
 * whether it is saving now.
 */
export function bootSend(share: DiscShareAdapter | undefined, o: {
  pad?: () => boolean; kept?: { whole: boolean } | null; saving?: boolean; mode?: 'page' | 'overlay';
} = {}): SendBoot {
  vi.stubEnv('DEV', false);
  const A: Adapters = {
    ...sampleAdapters(),
    controls: liveControls({ connected: o.pad ?? (() => false) }, { touch: () => false, keyboard: () => false }),
    ...(share ? { discShare: share } : {}),
  };
  A.disc.state = () => 'ready';
  A.disc.extracting = () => o.saving === true;
  A.disc.kept = () => (o.kept ? { bytes: 1, backend: 'opfs', whole: o.kept.whole } : null);   // KeptDisc's shape; the size is not read
  const page = bootConsole(document, window, A, { keymap: false, ...(o.mode ? { mode: o.mode } : {}) });
  return { ctl: page.ctl, A, page };
}

export const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('#stage .cx-home [data-panel="launch"]');
export const focusedRow = (): string | null => panel()?.querySelector<HTMLElement>('.cx-r.is-focused')?.dataset['id'] ?? null;
export const area = (): HTMLElement | null => panel()?.querySelector<HTMLElement>('[data-send="area"]') ?? null;
export const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };

/** Play's Cross (the panel opens on the controller check), then Down to the "Send Game Files" row. */
export function toSendRow(ctl: ConsolePage['ctl']): void {
  ctl.press('cross');
  for (let k = 0; k < 8 && focusedRow() !== 'send'; k++) ctl.press('down');
}

/** Lets the clipboard's promise settle. */
export async function settle(): Promise<void> { for (let k = 0; k < 6; k++) await Promise.resolve(); }
