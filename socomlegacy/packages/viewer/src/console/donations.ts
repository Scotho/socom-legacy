/** HDON: launcher-only hosting support, a product adaptation with no original-game behaviour. */
export const DONATE_URL = 'https://www.paypal.com/donate/?hosted_button_id=CJ83NLJM7GPHW';
export const DONATIONS_POLL_MS = 15_000;
const GOAL_CENTS = 12_500;
const chicagoCalendar = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' });
const clockMonth = () => {
  const p = chicagoCalendar.formatToParts(Date.now());
  return `${p.find((v) => v.type === 'year')!.value}-${p.find((v) => v.type === 'month')!.value}`;
};
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
type Progress = { available: true; goalCents: number; raisedCents: number; currency: 'USD'; month: string; timezone: 'America/Chicago' };
function parseProgress(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p['available'] !== true || p['goalCents'] !== GOAL_CENTS || !Number.isSafeInteger(p['raisedCents']) || (p['raisedCents'] as number) < 0 || p['currency'] !== 'USD' || p['timezone'] !== 'America/Chicago' || typeof p['month'] !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(p['month'])) return null;
  return p as Progress;
}
function meter(): string {
  return '<div class="cx-donation-meter"><div class="cx-donation-meter__top"><span>Server hosting goal</span><strong data-donation-percent></strong></div><progress max="100" value="0" aria-label="Monthly server hosting goal" hidden></progress><span data-donation-total role="status">Checking this month’s total…</span></div>';
}
/**
 * The owner's show/hide flag (2026-11-18; central's DATA_DIR/donations.show, read live): the box is drawn hidden and inert
 * and stays so until a progress reply says `shown: true` (`mountDonations` `render`). On a wide header a hidden box keeps
 * its place, so the header's other items never move as it shows; at the phone rule it takes no row (`donations.css`).
 */
export function donationsHeaderHtml(): string {
  return `<div class="cx-donations" data-donations hidden inert aria-hidden="true">${meter()}<button type="button" class="cx-donate-button" data-donate-open aria-haspopup="dialog">Donate</button></div>`;
}
interface Options { request?: typeof fetch; onDialogChange?(open: boolean): void }
export interface DonationsFeature { render(): void; refresh(): Promise<void>; setActive(on: boolean): void; dispose(): void }

/** Owns its polling/listeners/dialog. The console redraw calls render() to preserve the last verified result.
 * The exact hosted link is used: a read-only provider check found amount query parameters do not preselect amounts.
 * Amount selection therefore happens on PayPal, never a local choice that checkout silently ignores.
 */
export function mountDonations(doc: Document, win: Window, options: Options = {}): DonationsFeature {
  const request = options.request ?? globalThis.fetch.bind(globalThis);
  let current: Progress | null = null, state: 'loading' | 'ready' | 'unavailable' = 'loading';
  /** Central's show/hide flag as its last reply said it; hidden until a reply says shown, and on any failure. */
  let shown = false;
  let acceptedClockMonth: string | null = null;
  let disposed = false, active = true, timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | null = null, pending: Promise<void> | null = null;
  let dialog: HTMLDialogElement | null = null;
  const visible = () => active && !disposed && doc.visibilityState !== 'hidden';
  const render = () => {
    // A fresh server reply owns its accounting month (the device clock can be wrong). A cached reply cannot
    // survive a local Chicago month change or be described as current after a failed refresh in another month.
    const month = clockMonth();
    if (current && (acceptedClockMonth !== month || (state !== 'ready' && current.month !== month))) {
      current = null; acceptedClockMonth = null; state = 'unavailable';
    }
    for (const box of doc.querySelectorAll<HTMLElement>('[data-donations]')) {
      box.hidden = !shown;
      box.toggleAttribute('inert', !shown);
      if (shown) box.removeAttribute('aria-hidden'); else box.setAttribute('aria-hidden', 'true');
    }
    if (!shown && dialog) { close(); return; }
    const boxes = doc.querySelectorAll<HTMLElement>('[data-donations], .cx-donation-dialog');
    for (const box of boxes) {
      const total = box.querySelector('[data-donation-total]');
      const percent = box.querySelector('[data-donation-percent]');
      const bar = box.querySelector('progress');
      const usable = current !== null;
      const amount = current ? `${money(current.raisedCents)} of ${money(GOAL_CENTS)} raised · ${current.month}` : '';
      if (total) total.textContent = state === 'ready' ? amount : usable ? `${amount} · Update delayed` : state === 'loading' ? 'Checking this month’s total…' : 'Total unavailable · $125 monthly goal';
      const pct = current ? Math.round(current.raisedCents / GOAL_CENTS * 100) : 0;
      if (percent) percent.textContent = usable ? `${pct}% reached` : '';
      if (bar) { bar.hidden = !usable; bar.value = Math.min(100, pct); bar.setAttribute('aria-valuetext', usable ? `${pct}% of this month’s goal${state === 'ready' ? '' : ' (last known total)'}` : 'Total unavailable'); }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (visible()) timer = setTimeout(() => { void refresh(); }, DONATIONS_POLL_MS);
  };
  const refresh = (): Promise<void> => {
    if (!visible()) return Promise.resolve();
    if (pending) return pending;
    const controller = new AbortController(); abort = controller;
    let timedOut = false;                                                // central hung: as unreachable, unlike a page hidden
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 8_000);
    pending = (async () => {
      let answered = false;                                               // central replied (its flag read), even a 503
      try {
        const res = await request('/api/donations/progress', { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
        // The flag rides every progress reply, an unconfigured meter's 503 too; a body that is no JSON hides the box.
        const body: unknown = await res.json().catch(() => null);
        if (!controller.signal.aborted) { shown = !!body && typeof body === 'object' && (body as Record<string, unknown>)['shown'] === true; answered = true; }
        if (!res.ok) throw new Error('unavailable');
        const p = parseProgress(body);
        if (!p) throw new Error('unavailable');
        if (!controller.signal.aborted && visible()) { current = p; acceptedClockMonth = clockMonth(); state = 'ready'; }
      } catch {
        // Central unreachable (not our own abort, a page hidden): the box hides with the total unavailable.
        if (!answered && (timedOut || !controller.signal.aborted) && !disposed) shown = false;
        if (!disposed && active && doc.visibilityState !== 'hidden') state = 'unavailable';
      }
      finally {
        clearTimeout(timeout); if (abort === controller) abort = null; pending = null;
        if (!disposed) render();
        schedule();
      }
    })();
    return pending;
  };
  const close = () => {
    if (!dialog) return;
    const old = dialog; dialog = null;
    old.remove();
    options.onDialogChange?.(false);
    if (!disposed) doc.querySelector<HTMLButtonElement>('[data-donate-open]')?.focus({ preventScroll: true });
  };
  const open = () => {
    if (dialog || !visible() || !shown) return;
    const d = doc.createElement('dialog'); dialog = d; d.className = 'cx-donation-dialog';
    d.setAttribute('aria-labelledby', 'cx-donation-title');
    d.innerHTML = `<button type="button" data-donate-close class="cx-donation-close" aria-label="Close donation panel">×</button><h2 id="cx-donation-title">Support server hosting</h2><p>Help cover the cost of running SOCOM Legacy.</p>${meter()}<p class="cx-donation-terms">$125 each month · Donations counted before fees<br>Resets on the first in America/Chicago</p><h3>Choose your amount on PayPal</h3><p>$5, $10, $25, or your own amount. PayPal also offers recurring donations.</p><a class="cx-donation-checkout" href="${DONATE_URL}" target="_blank" rel="noopener noreferrer">Continue to PayPal <span aria-hidden="true">↗</span></a><p class="cx-donation-note">Opens PayPal in a new tab. Progress updates after payment is confirmed.</p>`;
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', close);
    doc.body.append(d); options.onDialogChange?.(true); render();
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    d.querySelector<HTMLButtonElement>('button')?.focus();
  };
  const click = (e: MouseEvent) => {
    const el = e.target && (e.target as Node).nodeType === 1 ? e.target as Element : null;
    if (!el) return;
    if (el.closest('[data-donate-open]')) { e.preventDefault(); e.stopImmediatePropagation(); open(); }
    else if (el.closest('[data-donate-close]')) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (dialog && el === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    }
  };
  const key = (e: KeyboardEvent) => {
    const el = e.target && (e.target as Node).nodeType === 1 ? e.target as Element : null;
    if (!dialog && !el?.closest('[data-donations]')) return;
    // Native button activation remains intact; the launcher's menu map must not also handle the same key. With the
    // dialog closed only the activating keys (Enter, Space) are the meter's: Escape and the menu keys reach the launcher
    // (PR #824's review). With it open the dialog is modal and keeps every key.
    if (!dialog) {
      if (e.key === 'Enter' || e.key === ' ') e.stopImmediatePropagation();
      return;
    }
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, a[href]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  const visibility = () => {
    clearTimeout(timer);
    if (!visible()) abort?.abort();
    else {
      state = current ? 'unavailable' : 'loading'; render();
      // If visibility changed twice while an aborted request settles, wait for it, then refresh immediately.
      if (pending && abort?.signal.aborted) void pending.then(() => { if (visible()) void refresh(); });
      else void refresh();
    }
  };
  // Window capture precedes the launcher's document capture and bubbling menu handlers.
  win.addEventListener('keydown', key, true);
  doc.addEventListener('click', click, true);
  doc.addEventListener('visibilitychange', visibility);
  render(); void refresh();
  return {
    render, refresh,
    setActive(on) { active = on; if (!on) close(); visibility(); },
    dispose() {
      disposed = true; active = false; clearTimeout(timer); abort?.abort(); close();
      win.removeEventListener('keydown', key, true); doc.removeEventListener('click', click, true); doc.removeEventListener('visibilitychange', visibility);
    },
  };
}
