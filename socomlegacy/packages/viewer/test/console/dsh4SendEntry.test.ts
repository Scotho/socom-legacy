// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READ_SET_VERSION, SOCOM2_US_BOOT } from '@s2u/archive';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { KEPT_DISC_TITLE, liveDisc } from '../../src/console/adapters/disc';
import { liveOptions } from '../../src/console/adapters/options';
import { senderButtons } from '../../src/console/render/discShare';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { SHARE_SEND_ROW, type Adapters } from '../../src/console/state';
import type { DiscExtractRecord, ExtractionState } from '../../src/discExtract';
import type { DiscShareAdapter, SenderView } from '../../src/discShareView';
import {
  SENDER_CLOSE, SENDER_ENTER_NONE, SENDER_ENTER_SOME, SENDER_TYPE, SHARE_CODE_BAD, SHARE_CODE_TITLE, SHARE_SEND_ROW_LABEL,
} from '../../src/discShareWords';
import { publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, readDisc } from '../../src/modern/discStore';
import { DISC_EXTRACT_SLOT, type RecordStore } from '../../src/pageStore';
import { mountShell } from './shell';

/**
 * DSH-4 (the disc share plan; DSH.R12 leaves the sender's entry without the QR to us): Options → App → "Send game files
 * to another device" opens the sender's dialog in its code entry -- the requests found on this network as buttons, "Type
 * a code" over the launcher's text field (`S.overlay === 'field'`), Close -- pad-first. And a copy received whole is
 * taken by the launcher's disc as a finished extraction (`adoptKept`). A browser adaptation, product track.
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); publishDisc(document, { state: 'empty', filename: null }); publishDiscImage(document, null); });
afterEach(() => { page?.dispose(); page = null; vi.restoreAllMocks(); localStorage.clear(); });

/** A disc share adapter whose sender the test drives: `openSend` enters the code entry with `nearby`, `choose` takes a code. */
function fake(nearby: string[] = []) {
  const calls: string[] = [];
  let tx: SenderView | null = null;
  const f: DiscShareAdapter & { calls: string[]; accept: boolean } = {
    calls, accept: true,
    receiver: () => ({ phase: 'idle' }),
    request: () => { calls.push('request'); },
    cancel: () => { calls.push('cancel'); },
    sender: () => tx,
    approve: () => { calls.push('approve'); },
    decline: () => { calls.push('decline'); tx = null; },
    openSend: () => { calls.push('openSend'); tx = { phase: 'enter', code: '', nearby }; },
    choose: (code) => { calls.push(`choose:${code}`); if (!f.accept) return false; tx = { phase: 'asked', code: code.toUpperCase() }; return true; },
    onChange: () => () => {},
  };
  return f;
}

function boot(share: DiscShareAdapter | undefined): ConsolePage['ctl'] {
  const notify = (): void => { page?.render(); };
  const options = liveOptions(notify, { signedIn: () => false, ...(share ? { share: true } : {}), install: () => 'other' });
  const A: Adapters = { ...sampleAdapters(), options, ...(share ? { discShare: share } : {}) };
  page = bootConsole(document, window, A, { keymap: false });
  return page.ctl;
}
const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('#overlay .cx-dialog.cx-share-send');
const buttons = (): string[] => [...(dialog()?.querySelectorAll<HTMLElement>('[data-act="sharesend"]') ?? [])].map((b) => b.textContent!.trim());

describe('DSH-4: Options → App → "Send game files to another device"', () => {
  it('is App\'s row beside Install app, only with a disc share adapter', () => {
    const rows = (share: boolean): string[] => liveOptions(() => {}, { signedIn: () => false, share, install: () => 'other' })
      .categories().find((c) => c.id === 'app')!.rows.map((r) => r.id);
    expect(rows(true).slice(0, 2)).toEqual(['install-app', SHARE_SEND_ROW]);
    expect(rows(false)).not.toContain(SHARE_SEND_ROW);
    const row = liveOptions(() => {}, { signedIn: () => false, share: true, install: () => 'other' }).categories().find((c) => c.id === 'app')!.rows[1]!;
    expect(row.label).toBe(SHARE_SEND_ROW_LABEL);
    expect(row.action).toBe('Send');
  });

  it('Cross on the row opens the sender\'s dialog in its code entry (the pad: App, Down, Cross)', () => {
    const share = fake();
    const ctl = boot(share);
    ctl.doAct('opt:app'); page!.render();
    ctl.press('down');
    ctl.press('cross');
    expect(share.calls).toEqual(['openSend']);
    expect(ctl.S.overlay).toBe('share');
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector('[data-share="nearby"]')!.textContent).toBe(SENDER_ENTER_NONE);
    expect(dialog()!.querySelector('[data-share="code"]')).toBeNull();
    expect(buttons()).toEqual([SENDER_TYPE, SENDER_CLOSE]);
  });
});

describe('DSH-4: the sender\'s code entry', () => {
  it('the requests found on this network are buttons; Cross on one chooses it, and the dialog asks for it', () => {
    const share = fake(['QX7K4M', 'ABC234']);
    const ctl = boot(share);
    ctl.openSender(); page!.render();
    expect(dialog()!.querySelector('[data-share="nearby"]')!.textContent).toBe(SENDER_ENTER_SOME);
    expect(buttons()).toEqual(['QX7K4M', 'ABC234', SENDER_TYPE, SENDER_CLOSE]);
    expect(dialog()!.querySelectorAll('[data-share="pick"]')).toHaveLength(2);
    ctl.press('down');
    ctl.press('cross');
    expect(share.calls).toContain('choose:ABC234');
    expect(ctl.S.overlay).toBe('share');
    expect(dialog()!.querySelector('[data-share="code"]')!.textContent).toBe('ABC234');
    expect(ctl.S.snd.row).toBe(0);
  });

  it('a click on a request chooses it', () => {
    const share = fake(['QX7K4M']);
    const ctl = boot(share);
    ctl.openSender(); page!.render();
    dialog()!.querySelector<HTMLElement>('[data-share="pick"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(share.calls).toContain('choose:QX7K4M');
  });

  it('"Type a code" opens the launcher\'s text field; Done with a code asks for it; a wrong one says why and stays', () => {
    const share = fake();
    const ctl = boot(share);
    ctl.openSender(); page!.render();
    ctl.press('cross');                                       // Type a code (focused first: no request listed)
    expect(ctl.S.overlay).toBe('field');
    expect(ctl.S.fd.target).toEqual({ kind: 'share-code' });
    expect(document.querySelector('#overlay')!.textContent).toContain(SHARE_CODE_TITLE);
    share.accept = false;
    for (const ch of 'nope') ctl.fType(ch);
    ctl.press('r2');                                          // Done
    expect(ctl.S.overlay).toBe('field');
    expect(ctl.S.fd.error).toBe(SHARE_CODE_BAD);
    share.accept = true;
    ctl.S.fd.text = '';
    for (const ch of 'qx7k4m') ctl.fType(ch);
    for (const ch of 'zz') ctl.fType(ch);                     // past the cap: 6 characters
    expect(ctl.S.fd.text).toBe('qx7k4m');
    ctl.press('r2');
    expect(share.calls.at(-1)).toBe('choose:qx7k4m');
    expect(ctl.S.overlay).toBe('share');
    expect(dialog()!.querySelector('[data-share="code"]')!.textContent).toBe('QX7K4M');
  });

  it('Circle in the field goes back to the code entry; Circle there closes it (its polling ended: decline)', () => {
    const share = fake();
    const ctl = boot(share);
    ctl.openSender(); page!.render();
    ctl.press('cross');
    expect(ctl.S.overlay).toBe('field');
    ctl.press('circle');
    expect(ctl.S.overlay).toBe('share');
    expect(buttons()).toEqual([SENDER_TYPE, SENDER_CLOSE]);
    ctl.press('circle');
    expect(share.calls.at(-1)).toBe('decline');
    expect(ctl.S.overlay).toBeNull();
  });

  it('the buttons\' marks: Cross on each but the last, Circle on the last', () => {
    expect(senderButtons({ phase: 'enter', code: '', nearby: ['QX7K4M'] }).map((b) => b.act)).toEqual(['pick', 'type', 'no']);
    expect(senderButtons({ phase: 'asked', code: 'QX7K4M' }).map((b) => b.act)).toEqual(['yes', 'no']);
  });

  it('without a disc share adapter the row is absent and openSender does nothing', () => {
    const ctl = boot(undefined);
    ctl.openSender();
    expect(ctl.S.overlay).toBeNull();
  });
});

describe('DSH-4: a copy received whole is taken as a finished extraction', () => {
  it('adoptKept: the record re-read, whole -> the disc ready from storage', async () => {
    const map = new Map<string, unknown>();
    const records: RecordStore = { get: async (k) => map.get(k), put: async (k, v) => { map.set(k, v); }, delete: async (k) => { map.delete(k); } };
    let state: ExtractionState = 'none';
    const disc = liveDisc(document, () => {}, { extraction: { env: { records, idb: () => null, storage: null }, state: async () => state } });
    await disc.loaded();
    expect(disc.stored()).toBe(false);
    expect(disc.kept()).toBeNull();
    const rec: DiscExtractRecord = {
      v: 1, readSet: READ_SET_VERSION, identity: { boot: SOCOM2_US_BOOT, ver: '1.02', vmode: 'NTSC' }, backend: 'opfs', dir: 'D',
      files: [{ path: 'SYSTEM.CNF', size: 60, sha256: 'a'.repeat(64), done: true }], total: 60, persisted: true, started: 1, when: 2,
    };
    map.set(DISC_EXTRACT_SLOT, rec);
    state = 'whole';
    await disc.adoptKept();
    expect(readDisc(document)).toMatchObject({ state: 'ready', filename: KEPT_DISC_TITLE });
    expect(disc.stored()).toBe(true);
    expect(disc.kept()).toMatchObject({ whole: true, bytes: 60 });
    disc.dispose();
  });
});
