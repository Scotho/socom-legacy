// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { remapAdapter } from '../../src/console/adapters/remap';
import { PRESSURE_CONNECT_POINTER_WORDS } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { REMAP_ROW, remapExtras, remapOwnRows, type Adapters } from '../../src/console/state';
import { pressureDiagLine, PRESSURE_ABSENT_NO_WEBHID, PRESSURE_ABSENT_WRAPPED, PRESSURE_SEPARATE_NEEDED, PRESSURE_STATUS_SUB, PRESSURE_UNREADABLE_STEPS } from '../../src/console/render/remap';
import { pressurePad } from '../../src/pressurePad';
import { PadBinding } from '../../src/padBinding';
import { pressureDetector } from '../../src/pressureDetect';
import { controllerStanceMode, setControllerStanceMode } from '../../src/startupSettings';
import { mountShell } from './shell';

/**
 * DS3-PRESSURE (product track; a browser adaptation, OT.R28 -- nothing of the game): the Connect USB pressure controller
 * row's guards and lines for a player whose DualShock 3 gives no pressure (the handover's findings 1-5).
 */
const DS3_ID = 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)';
const pad = (id = DS3_ID, n = 17) => ({
  index: 0, id, connected: true, mapping: 'standard', timestamp: 0,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 })),
});
type Pad = ReturnType<typeof pad>;
const CONNECT = 'Connect USB pressure controller';

let page: ConsolePage | null = null;
let pads: Pad[] = [];
let t = 10_000;
const realRaf = window.requestAnimationFrame;
const realCaf = window.cancelAnimationFrame;
const requestDevice = vi.fn(async () => [] as unknown[]);
const withHid = (on: boolean): void => {
  if (on) Object.defineProperty(navigator, 'hid', { value: { requestDevice, addEventListener() {}, removeEventListener() {} }, configurable: true });
  else delete (navigator as unknown as { hid?: unknown }).hid;
};
beforeEach(() => {
  localStorage.clear();
  pressureDetector.clear();
  requestDevice.mockClear();
  mountShell(document);
  pads = [];
  t = 10_000;
  window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
});
afterEach(async () => {
  page?.dispose(); page = null;
  window.requestAnimationFrame = realRaf;
  window.cancelAnimationFrame = realCaf;
  withHid(false);
  await pressurePad.disconnect();
  localStorage.clear();
  pressureDetector.clear();
  vi.restoreAllMocks();
});

function openMapping(p: Pad, mode: 'pop' | 'separate' = 'pop') {
  pads = [p];
  setControllerStanceMode(mode);
  const remap = remapAdapter(() => new PadBinding({ pads: { getGamepads: () => pads }, now: () => t, holdMs: 0 }));
  page = bootConsole(document, window, { ...sampleAdapters(), remap } as Adapters, { keymap: true });
  const ctl = page.ctl;
  ctl.doAct('opt:controller');
  ctl.S.opt.row = ctl.A.options.categories()[ctl.S.opt.cat]!.rows.findIndex((r) => r.id === REMAP_ROW);
  ctl.press('cross');
  ctl.remapFrame(t += 16);
  return { ctl };
}
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#stage [data-act="remaprow"]')];
const titles = (): string[] => rows().map((r) => r.querySelector('.cx-item__title, .cx-roller__label')!.textContent!);
function focusConnect(ctl: ReturnType<typeof openMapping>['ctl'], mode: 'pop' | 'separate' = 'pop'): void {
  ctl.S.rm.row = remapOwnRows(mode) + remapExtras(ctl.A.remap!.current()!).indexOf('pressureConnect');
  page!.render();
  expect(titles()[ctl.S.rm.row]).toBe(CONNECT);
}

describe('DS3-PRESSURE (a): Connect is a browser chooser -- a pad press is no user gesture (as LR-25 and RB-5)', () => {
  it('a pad\'s Cross on Connect opens no chooser (requestDevice is not called) and says how on the legend', async () => {
    withHid(true);
    const { ctl } = openMapping(pad());
    focusConnect(ctl);
    ctl.S.input = 'pad';
    ctl.press('cross');
    await Promise.resolve();
    expect(requestDevice).not.toHaveBeenCalled();
    expect(ctl.S.legendError).toBe(PRESSURE_CONNECT_POINTER_WORDS);
    expect(PRESSURE_CONNECT_POINTER_WORDS).toBe('Choose Connect with the mouse or a key: a browser opens its device chooser only for a click, a tap or a key');
  });

  it('a key\'s press (a user gesture) calls requestDevice; so does the pointer', async () => {
    withHid(true);
    const { ctl } = openMapping(pad());
    focusConnect(ctl);
    ctl.S.input = 'pad';
    ctl.keyGesture = true;
    try { ctl.press('cross'); } finally { ctl.keyGesture = false; }
    await Promise.resolve();
    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(ctl.S.legendError).not.toBe(PRESSURE_CONNECT_POINTER_WORDS);
    ctl.S.input = 'pointer';
    ctl.press('cross');
    await Promise.resolve();
    expect(requestDevice).toHaveBeenCalledTimes(2);
  });
});

const sub = (i: number): string => rows()[i]!.querySelector('.cx-item__sub')?.textContent ?? '';
const asideText = (): string => document.querySelector('#stage .cx-aside')?.textContent ?? '';

describe('DS3-PRESSURE (d): pressure seen, but the Stance mode reads none of it (COMBINED) -- the row says so', () => {
  it('COMBINED: the row says to set SEPARATE, and the mode is NOT switched (the player\'s saved choice stands)', () => {
    withHid(true);
    vi.spyOn(pressurePad, 'status').mockReturnValue('pressure');
    const { ctl } = openMapping(pad(), 'pop');
    focusConnect(ctl, 'pop');
    expect(sub(ctl.S.rm.row)).toBe(PRESSURE_SEPARATE_NEEDED);
    expect(PRESSURE_SEPARATE_NEEDED).toBe('Pressure seen. Set Stance mode to SEPARATE for light/firm Triangle');
    expect(asideText()).toContain(PRESSURE_SEPARATE_NEEDED);
    ctl.remapFrame(t += 16);
    expect(controllerStanceMode()).toBe('pop');
  });

  it('SEPARATE: the row says pressure is seen, light and firm', () => {
    withHid(true);
    vi.spyOn(pressurePad, 'status').mockReturnValue('pressure');
    const { ctl } = openMapping(pad(), 'separate');
    focusConnect(ctl, 'separate');
    expect(sub(ctl.S.rm.row)).toBe(PRESSURE_STATUS_SUB.pressure);
    expect(asideText()).not.toContain(PRESSURE_SEPARATE_NEEDED);
  });

  it('before pressure is seen the line is not said, in either mode', () => {
    withHid(true);
    vi.spyOn(pressurePad, 'status').mockReturnValue('reports');
    const { ctl } = openMapping(pad(), 'pop');
    focusConnect(ctl, 'pop');
    expect(sub(ctl.S.rm.row)).toBe(PRESSURE_STATUS_SUB.reports);
  });
});

describe('DS3-PRESSURE (b): the unreadable state on the row names the likely cause', () => {
  it('the sub line and the aside say it, naming the drivers that change the report', () => {
    withHid(true);
    vi.spyOn(pressurePad, 'status').mockReturnValue('unreadable');
    const { ctl } = openMapping(pad(), 'pop');
    focusConnect(ctl, 'pop');
    expect(sub(ctl.S.rm.row)).toBe(PRESSURE_STATUS_SUB.unreadable);
    expect(PRESSURE_STATUS_SUB.unreadable).toBe('Connected, but its reports cannot be read');
    expect(asideText()).toContain(PRESSURE_UNREADABLE_STEPS);
    for (const cause of ['DsHidMini', 'ScpToolkit', 'Steam Input', 'report 1 of 48 bytes']) expect(PRESSURE_UNREADABLE_STEPS).toContain(cause);
  });
});

describe('DS3-PRESSURE (c): the Connect row absent while a pad is present -- the Stance mode row says why', () => {
  const XINPUT = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
  const focusStance = (ctl: ReturnType<typeof openMapping>['ctl']): void => { ctl.S.rm.row = 0; page!.render(); };

  it('no WebHID (Firefox, Safari): pressure needs Chrome or Edge on USB with no driver wrapper', () => {
    const { ctl } = openMapping(pad(), 'pop');
    expect(titles()).not.toContain(CONNECT);
    focusStance(ctl);
    expect(asideText()).toContain(PRESSURE_ABSENT_NO_WEBHID);
    expect(PRESSURE_ABSENT_NO_WEBHID).toBe('Pressure needs Chrome or Edge on USB with no driver wrapper: this browser cannot read it.');
  });

  it('WebHID, a pad seen only as XInput: the line names the wrappers', () => {
    withHid(true);
    const { ctl } = openMapping(pad(XINPUT), 'pop');
    expect(titles()).not.toContain(CONNECT);
    focusStance(ctl);
    expect(asideText()).toContain(PRESSURE_ABSENT_WRAPPED);
    for (const w of ['Chrome or Edge on USB with no driver wrapper', 'DsHidMini', 'ScpToolkit', 'Steam Input']) expect(PRESSURE_ABSENT_WRAPPED).toContain(w);
  });

  it('WebHID with a DS3 listed (the row offered): neither line', () => {
    withHid(true);
    const { ctl } = openMapping(pad(), 'pop');
    focusStance(ctl);
    expect(asideText()).not.toContain(PRESSURE_ABSENT_NO_WEBHID);
    expect(asideText()).not.toContain(PRESSURE_ABSENT_WRAPPED);
  });
});

describe('DS3-PRESSURE (f): the Connect row aside carries a copyable readout of the last report', () => {
  it('the last report ID, length and first bytes, and the row state, as selectable text', async () => {
    withHid(true);
    let send: (e: { reportId: number; data: DataView }) => void = () => {};
    const device = {
      vendorId: 0x054c, productId: 0x0268, opened: false,
      async open() { this.opened = true; }, async close() { this.opened = false; },
      addEventListener(_t: string, cb: typeof send) { send = cb; }, removeEventListener() {},
      async receiveFeatureReport() { return new DataView(new ArrayBuffer(8)); }, async sendReport() {},
    };
    await pressurePad.connect({ requestDevice: async () => [device], addEventListener() {}, removeEventListener() {} } as never);
    const { ctl } = openMapping(pad(), 'pop');
    focusConnect(ctl, 'pop');
    expect(document.querySelector('#stage .cx-aside__diag')?.textContent).toBe('Diagnostics: no report yet · state waiting');
    const data = new DataView(new ArrayBuffer(64));
    data.setUint8(0, 0x01); data.setUint8(7, 0x7f);
    send({ reportId: 2, data });
    page!.render();
    const diag = document.querySelector('#stage .cx-aside__diag');
    expect(diag?.textContent).toBe('Diagnostics: report ID 2 · 64 bytes · 01 00 00 00 00 00 00 7f · state unreadable');
    expect(diag?.querySelector('code')).not.toBeNull();
    expect(pressureDiagLine('reports', { reportId: 1, length: 48, head: '00 00 10 00 00 80 80 80' })).toBe('Diagnostics: report ID 1 · 48 bytes · 00 00 10 00 00 80 80 80 · state reports');
  });

  it('no readout on any other row', () => {
    const { ctl } = openMapping(pad(), 'pop');
    ctl.S.rm.row = 0; page!.render();
    expect(document.querySelector('#stage .cx-aside__diag')).toBeNull();
  });
});
