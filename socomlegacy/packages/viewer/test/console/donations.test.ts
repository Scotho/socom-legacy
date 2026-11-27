// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { donationsHeaderHtml, mountDonations } from '../../src/console/donations';
// The show/hide flag (central's DATA_DIR/donations.show): these cases are the shown box's, so their reply says shown.
const reply = (raisedCents = 1000, shown = true) => ({ available: true, goalCents: 12500, raisedCents, currency: 'USD', month: '2026-11', timezone: 'America/Chicago', shown });
const cleanups: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-17T18:00:00Z')); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanups.splice(0).forEach((f) => f()); vi.useRealTimers(); document.body.innerHTML = ''; });
describe('launcher hosting donations', () => {
  it('starts with an unknown total and links only to the supplied checkout', async () => {
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    expect(document.body.textContent).toContain('Checking');
    expect(document.body.textContent).not.toContain('$0');
    const feature = mountDonations(document, window, { request: vi.fn(async () => new Response(JSON.stringify(reply()))) as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh();
    expect(document.body.textContent).toContain('$10'); expect(document.body.textContent).toContain('8%');
    (document.querySelector('[data-donate-open]') as HTMLButtonElement).click();
    expect(document.querySelector('dialog a')?.getAttribute('href')).toBe('https://www.paypal.com/donate/?hosted_button_id=CJ83NLJM7GPHW');
    expect(document.querySelector('dialog')?.textContent).toContain('Choose your amount on PayPal');
  });
  it('caps the bar at 100 while preserving an over-goal total and percentage', async () => {
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    const feature = mountDonations(document, window, { request: vi.fn(async () => new Response(JSON.stringify(reply(15000)))) as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh();
    expect(document.body.textContent).toContain('$150'); expect(document.body.textContent).toContain('120%');
    expect(document.querySelector('progress')?.value).toBe(100);
  });
  it('shows unavailable rather than fabricating zero and releases the dialog on disposal', async () => {
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    const feature = mountDonations(document, window, { request: vi.fn(async () => new Response('', { status: 503 })) as typeof fetch });
    await feature.refresh();
    expect(document.body.textContent).toContain('unavailable'); expect(document.body.textContent).not.toContain('$0');
    (document.querySelector('[data-donate-open]') as HTMLButtonElement).click(); feature.dispose();
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('retains the last known total with an explicit delayed label on failure', async () => {
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    let good = true;
    const feature = mountDonations(document, window, { request: vi.fn(async () => good ? new Response(JSON.stringify(reply())) : new Response('', { status: 503 })) as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh(); good = false; await feature.refresh();
    expect(document.body.textContent).toContain('$10'); expect(document.body.textContent).toContain('Update delayed');
  });
  it('polls only while visible and releases all timers and listeners on disposal', async () => {
    vi.useFakeTimers(); document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    const request = vi.fn(async () => new Response(JSON.stringify(reply())));
    const feature = mountDonations(document, window, { request: request as typeof fetch });
    await feature.refresh(); expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(45000);
    expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange')); await feature.refresh();
    expect(request).toHaveBeenCalledTimes(2);
    feature.dispose(); await vi.advanceTimersByTimeAsync(45000); expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not show the prior month as this month when the next refresh fails', async () => {
    vi.setSystemTime(new Date('2026-12-01T05:59:59Z'));
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    let good = true;
    const feature = mountDonations(document, window, { request: vi.fn(async () => good ? new Response(JSON.stringify(reply())) : new Response('', { status: 503 })) as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh(); expect(document.body.textContent).toContain('8%');
    good = false; vi.setSystemTime(new Date('2026-12-01T06:00:00Z')); await feature.refresh();
    expect(document.querySelector('[data-donation-percent]')?.textContent).toBe('');
    expect(document.querySelector('progress')?.hidden).toBe(true);
    expect(document.querySelector('progress')?.getAttribute('aria-valuetext')).toBe('Total unavailable');
    expect(document.body.textContent).toContain('Total unavailable');
    expect(document.body.textContent).not.toContain('$10');
  });
  it('clears the old month immediately on hidden-page resume before a failed reply', async () => {
    vi.setSystemTime(new Date('2026-12-01T05:59:59Z'));
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    let fail: ((r: Response) => void) | null = null;
    let first = true;
    const feature = mountDonations(document, window, { request: vi.fn(() => {
      if (first) { first = false; return Promise.resolve(new Response(JSON.stringify(reply()))); }
      return new Promise<Response>((resolve) => { fail = resolve; });
    }) as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
    vi.setSystemTime(new Date('2026-12-01T06:00:00Z'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange'));
    expect(document.querySelector('[data-donation-percent]')?.textContent).toBe('');
    expect(document.querySelector('progress')?.hidden).toBe(true);
    (fail as ((r: Response) => void) | null)?.(new Response('', { status: 503 })); await feature.refresh();
    expect(document.body.textContent).toContain('Total unavailable');
  });
  it('accepts a successful server month despite clock skew, but does not reuse it after a failed refresh', async () => {
    vi.setSystemTime(new Date('2026-12-02T06:00:00Z'));
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    let good = true;
    const feature = mountDonations(document, window, { request: vi.fn(async () => good ? new Response(JSON.stringify(reply())) : new Response('', { status: 503 })) as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh(); expect(document.querySelector('[data-donation-percent]')?.textContent).toBe('8% reached');
    good = false; await feature.refresh(); expect(document.querySelector('[data-donation-percent]')?.textContent).toBe('');
  });
});

/**
 * The owner's show/hide flag (2026-11-18, via the main controller; a product adaptation): the whole box -- the meter and
 * the Donate button -- and its dialog are hidden until a progress reply says `shown: true` (central reads DATA_DIR's
 * donations.show live); hidden again on `shown: false`, when central cannot be reached, or on a reply that is not one.
 * Default hidden: the release ships with the box off.
 */
describe("the donation box behind central's show/hide flag", () => {
  const box = () => document.querySelector<HTMLElement>('[data-donations]')!;
  const mount = (answer: () => Response | Promise<Response>) => {
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    const feature = mountDonations(document, window, { request: vi.fn(async () => answer()) as typeof fetch }); cleanups.push(feature.dispose);
    return feature;
  };
  it('is hidden from the first draw, before any reply, and the Donate button opens nothing', () => {
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    expect(box().hidden, 'the markup itself').toBe(true);
    mount(() => new Promise<Response>(() => undefined));                  // no reply yet
    expect(box().hidden).toBe(true);
    expect(box().hasAttribute('inert')).toBe(true);
    (document.querySelector('[data-donate-open]') as HTMLButtonElement).click();
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('shown on shown:true; hidden again on a later shown:false, an open dialog closed with it', async () => {
    let shown = true;
    const feature = mount(() => new Response(JSON.stringify(reply(4000, shown))));
    await feature.refresh();
    expect([box().hidden, box().hasAttribute('inert')]).toEqual([false, false]);
    expect(box().textContent).toContain('$40 of $125');
    (document.querySelector('[data-donate-open]') as HTMLButtonElement).click();
    expect(document.querySelector('dialog')).not.toBeNull();
    shown = false; await feature.refresh();
    expect(box().hidden).toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('a reply without the flag, an invalid reply or an unreachable central: hidden', async () => {
    for (const answer of [
      () => new Response(JSON.stringify({ ...reply(), shown: undefined })),
      () => new Response(JSON.stringify({ ...reply(), shown: 'yes' })),
      () => new Response('not json'),
      (): Response => { throw new TypeError('fetch failed'); },
    ]) {
      const feature = mount(answer);
      await feature.refresh();
      expect(box().hidden, String(answer)).toBe(true);
      feature.dispose();
    }
  });
  it('a central that hangs (the 8 s timeout, not a page hidden): hidden, as an unreachable one (the review F1)', async () => {
    let hang = false;
    document.body.innerHTML = `<header id="header">${donationsHeaderHtml()}</header>`;
    // As fetch does: a request that never answers rejects when its signal aborts.
    const request = vi.fn((_url: unknown, init?: RequestInit) => hang
      ? new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
      : Promise.resolve(new Response(JSON.stringify(reply(4000, true)))));
    const feature = mountDonations(document, window, { request: request as unknown as typeof fetch }); cleanups.push(feature.dispose);
    await feature.refresh();
    expect(box().hidden).toBe(false);
    hang = true;
    const next = feature.refresh();
    await vi.advanceTimersByTimeAsync(8_000);
    await next;
    expect(box().hidden).toBe(true);
  });
  it('shown while the meter is unconfigured (a 503 that says shown): the box shows, its total unavailable', async () => {
    const feature = mount(() => new Response(JSON.stringify({ available: false, goalCents: 12500, raisedCents: 0, currency: 'USD', month: '2026-11', timezone: 'America/Chicago', shown: true }), { status: 503 }));
    await feature.refresh();
    expect(box().hidden).toBe(false);
    expect(box().textContent).toContain('unavailable');
    expect(box().textContent).not.toContain('$0');
  });
});
