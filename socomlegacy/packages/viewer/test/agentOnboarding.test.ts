// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentConnection } from '../src/agent/connection';
import { LIMITS } from '@s2u/forge-agent-protocol';
import { mountAgentPanel, type AgentPanelState } from '../src/agent/panel';

/** Product adaptation: registration and clipboard fakes; no browser, gateway, RTC or native client is started. */
class Socket extends EventTarget {
  readyState = 1;
  send() {}
  close() { this.readyState = 3; }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function rig(options: { fetch?: typeof fetch; copy?: (text: string) => Promise<void>; socketReadyState?: 0 | 1 } = {}) {
  let count = 0;
  const registered: { invitation: string; expiresAt: number }[] = [];
  const sockets: Socket[] = [];
  const fetcher = vi.fn(options.fetch ?? (async () => {
    const entry = { targetId: `target${++count}`, pageToken: 'placeholder', epoch: `epoch${count}`,
      invitation: `invitation${count}`, expiresAt: Date.now() + 5000 };
    registered.push(entry); return Response.json(entry, { status: 201 });
  }));
  const connection = createAgentConnection({ gateway: 'http://127.0.0.1:5360', document,
    target: { read: () => ({ surface: 'forge-editor', revision: 0, name: 'Forge', build: 'test' }), dispatch: vi.fn() },
    // AX-12: the panel's GET /health on mount answers apart, so `fetcher` counts the registrations only; the doctor's
    // no-cors origin probe (made only after a failed registration) fails, as it does when the service is not there.
    fetch: ((url: string, init?: RequestInit) => !String(url).endsWith('/health') ? fetcher(url, init)
      : init?.mode === 'no-cors' ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(Response.json({ ok: true }))) as typeof fetch, socket: () => {
      const socket = new Socket(); socket.readyState = options.socketReadyState ?? 1;
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  const copy = vi.fn(options.copy ?? (async (_text: string) => {}));
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, connection, { copy });
  const button = host.querySelector<HTMLButtonElement>('[data-agent-copy]')!;
  const manual = host.querySelector<HTMLTextAreaElement>('textarea')!;
  // AX-U: the agent picker is a segmented control of radios (`[data-agent-client-picker]`).
  const pick = (client: string): void => { host.querySelector<HTMLInputElement>(`[data-agent-client-picker] input[value="${client}"]`)!.click(); };
  const picked = (): string | undefined => host.querySelector<HTMLInputElement>('[data-agent-client-picker] input:checked')?.value;
  return { host, connection, copy, fetcher, registered, sockets, button, manual, pick, picked,
    dispose() { panel.dispose(); connection.dispose(); host.remove(); } };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); document.body.replaceChildren(); });

describe('FCW-02b: invitation Copy onboarding', () => {
  it('regression: renews an expired invitation through registration before copying', async () => {
    vi.useFakeTimers(); const r = rig();
    try {
      r.button.click(); await settle(); expect(r.copy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5001);
      r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2);
      expect(r.copy.mock.calls[1]![0]).toContain('invitation2');
      expect(r.copy.mock.calls[1]![0]).not.toContain('invitation1');
    } finally { r.dispose(); }
  });

  it.each([false, true])('finishes a fresh Copy while the previous socket is CONNECTING (client change=%s)', async changeClient => {
    const r = rig({ socketReadyState: 0 });
    try {
      r.button.click(); await settle(); expect(r.copy).toHaveBeenCalledTimes(1);
      if (changeClient) { r.pick('codex'); }
      r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2); expect(r.copy).toHaveBeenCalledTimes(2);
      expect(r.copy.mock.calls[1]![0]).toContain('invitation2');
      expect(r.copy.mock.calls[1]![0]).not.toContain('invitation1');
      expect(r.copy.mock.calls[1]![0]).toBe('Connect to my SOCOM 2 Legacy page: http://127.0.0.1:5360/join/invitation2');
      expect(r.button.textContent).toContain('Copied'); expect(r.button.disabled).toBe(false);
    } finally { r.dispose(); }
  });

  it('exposes only a finite live invitation expiry and clears it when disconnected', async () => {
    const r = rig();
    try {
      await r.connection.prepare('codex');
      expect((r.connection.state() as AgentPanelState & { expiresAt?: number }).expiresAt).toBe(r.registered[0]!.expiresAt);
      expect(JSON.stringify(r.connection.state())).not.toContain('invitation1');
      expect(JSON.stringify(r.connection.state())).not.toContain('placeholder');
      r.connection.disconnect();
      expect((r.connection.state() as AgentPanelState & { expiresAt?: number }).expiresAt).toBeUndefined();
    } finally { r.dispose(); }
  });

  it('offers current manual instructions while clipboard permission stays pending', async () => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    try {
      r.button.click(); await settle();
      expect(r.connection.state().status).toBe('waiting');
      expect(r.manual.hidden).toBe(false); expect(r.manual.value).toContain('invitation1');
      expect(r.button.textContent).not.toMatch(/preparing|copied/i);
      expect(r.host.textContent).toContain('copy the link below');
      expect(document.activeElement).not.toBe(r.manual);
    } finally { r.dispose(); }
  });

  it.each(['resolve', 'reject'] as const)('allows fresh Copy after expiry without waiting for old clipboard %s', async outcome => {
    vi.useFakeTimers(); const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    try {
      r.button.click(); await settle(); expect(r.copy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5001);
      expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
      expect(r.button.disabled).toBe(false);
      r.copy.mockResolvedValueOnce(); r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2);
      expect(r.copy.mock.calls[1]![0]).toContain('invitation2');
      const latestLabel = r.button.textContent;
      if (outcome === 'resolve') permission.resolve(); else permission.reject(Error('clipboard denied'));
      await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2);
      expect(r.button.textContent).toBe(latestLabel);
      expect(r.manual.value).not.toContain('invitation1');
    } finally { r.dispose(); }
  });

  it('reports expiry after delayed clipboard success and requires a fresh Copy', async () => {
    vi.useFakeTimers(); const permission = deferred<void>();
    const r = rig({ copy: text => text.includes('invitation1') ? permission.promise : Promise.resolve() });
    try {
      r.button.click(); await settle();
      // This native write was requested while the invitation was valid; it cannot be undone retroactively.
      expect(r.copy).toHaveBeenCalledTimes(1); expect(r.copy.mock.calls[0]![0]).toContain('invitation1');
      await vi.advanceTimersByTimeAsync(5001); permission.resolve(); await settle();
      expect(r.host.textContent).toMatch(/expired/i); expect(r.button.textContent).not.toMatch(/copied/i);
      expect(r.fetcher).toHaveBeenCalledTimes(1); expect(r.copy).toHaveBeenCalledTimes(1);
      expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe(''); expect(r.button.disabled).toBe(false);
      r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2); expect(r.copy).toHaveBeenCalledTimes(2);
      expect(r.copy.mock.calls[1]![0]).toContain('invitation2');
      expect(r.copy.mock.calls[1]![0]).not.toContain('invitation1');
    } finally { r.dispose(); }
  });

  it('clears already-visible stale manual instructions at expiry', async () => {
    vi.useFakeTimers(); const r = rig({ copy: async () => { throw Error('denied'); } });
    try {
      r.button.click(); await settle(); expect(r.manual.value).toContain('invitation1');
      await vi.advanceTimersByTimeAsync(5001);
      expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
    } finally { r.dispose(); }
  });

  it('never offers old manual text when renewal fails', async () => {
    vi.useFakeTimers(); const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    try {
      r.button.click(); await settle();
      await vi.advanceTimersByTimeAsync(5001);
      r.fetcher.mockRejectedValueOnce(Error('unavailable'));
      permission.reject(Error('denied')); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(1);
      r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2);
      expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
      expect(r.host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    } finally { r.dispose(); }
  });

  it('suppresses another Copy while the first clipboard request is pending', async () => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    try {
      r.button.click(); await settle(); r.button.click(); await settle();
      expect(r.copy).toHaveBeenCalledTimes(1); expect(r.fetcher).toHaveBeenCalledTimes(1);
      permission.resolve(); await settle();
    } finally { r.dispose(); }
  });

  it('client change cancels pending instructions before they reach clipboard or manual fallback', async () => {
    const registration = deferred<Response>(); const r = rig({ fetch: () => registration.promise });
    try {
      r.button.click(); r.pick('codex');
      registration.resolve(Response.json({ targetId: 'target1', pageToken: 'placeholder', epoch: 'epoch1',
        invitation: 'obsolete-invitation', expiresAt: Date.now() + 5000 }, { status: 201 }));
      await settle(); expect(r.copy).not.toHaveBeenCalled(); expect(r.manual.value).toBe('');
      expect(r.manual.hidden).toBe(true);
    } finally { r.dispose(); }
  });

  it.each(['resolve', 'reject'] as const)(
    'client change ignores an old clipboard %s without presenting it as the new client result', async outcome => {
      const permission = deferred<void>(); let writes = 0;
      const r = rig({ copy: () => ++writes === 1 ? permission.promise : Promise.resolve() });
      try {
        r.button.click(); await settle();
        expect(r.copy.mock.calls[0]![0]).toBe('Connect to my SOCOM 2 Legacy page: http://127.0.0.1:5360/join/invitation1');
        r.pick('codex'); await settle();
        const selectedClientStatus = r.button.textContent;
        if (outcome === 'resolve') permission.resolve(); else permission.reject(Error('old-client clipboard denied'));
        await settle();
        expect(r.picked()).toBe('codex'); expect(r.button.textContent).toBe(selectedClientStatus);
        expect(r.button.textContent).not.toMatch(/copied|select and copy|copy failed/i);
        expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
        expect(document.activeElement).not.toBe(r.manual); expect(r.button.disabled).toBe(false);
        expect(r.copy).toHaveBeenCalledTimes(1);
        r.button.click(); await settle();
        expect(r.copy).toHaveBeenCalledTimes(2);
        // AX-U: the same live invitation's one line, whichever client is picked (LATER 444 keeps the registration).
        expect(r.copy.mock.calls[1]![0]).toBe('Connect to my SOCOM 2 Legacy page: http://127.0.0.1:5360/join/invitation1');
      } finally { r.dispose(); }
    },
  );

  it('dispose during clipboard failure cannot focus detached fallback or retain its invitation', async () => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    r.button.click(); await settle(); r.dispose(); permission.reject(Error('denied')); await settle();
    expect(r.manual.value).toBe(''); expect(r.manual.hidden).toBe(true);
    expect(document.activeElement).not.toBe(r.manual);
  });

  // AX-8 (AX.R4, changed on purpose): a hidden tab keeps its invitation -- the player brings the terminal over the
  // browser to paste it -- so the pending manual instructions stay, and no fresh registration is made.
  it('keeps pending manual instructions and the invitation when the page is hidden', async () => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    try {
      r.button.click(); await settle(); expect(r.manual.value).toContain('invitation1');
      visibility.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
      expect(r.connection.state().status).toBe('waiting');
      expect(r.connection.state().hidden).toBe(true);
      expect(r.manual.hidden).toBe(false); expect(r.manual.value).toContain('invitation1');
      permission.reject(Error('denied')); await settle();
      expect(r.manual.value).toContain('invitation1'); expect(r.fetcher).toHaveBeenCalledTimes(1);
    } finally { visibility.mockRestore(); r.dispose(); }
  });

  it.each(['resolve', 'reject'] as const)('clears a revoked invitation on socket error before a late clipboard %s', async outcome => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    try {
      r.button.click(); await settle(); expect(r.manual.value).toContain('invitation1');
      r.sockets[0]!.dispatchEvent(new Event('error'));
      expect(r.connection.state().status).toBe('error');
      expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
      expect(r.button.disabled).toBe(false);
      if (outcome === 'resolve') permission.resolve(); else permission.reject(Error('denied'));
      await settle();
      expect(r.manual.value).toBe(''); expect(r.button.textContent).not.toMatch(/copied/i);
      r.copy.mockResolvedValueOnce(); r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2);
      expect(r.copy.mock.calls[1]![0]).toContain('invitation2');
    } finally { r.dispose(); }
  });

  it('updates a non-announcing countdown and removes its timer on disposal', async () => {
    vi.useFakeTimers(); const r = rig();
    try {
      r.button.click(); await settle();
      const timer = r.host.querySelector<HTMLElement>('[data-agent-expiry]');
      expect(timer).not.toBeNull(); expect(timer?.getAttribute('role')).toBe('timer');
      expect(timer?.getAttribute('aria-live')).toBe('off'); expect(timer?.closest('[role="status"]')).toBeNull();
      const initial = timer?.textContent;
      await vi.advanceTimersByTimeAsync(1000); expect(timer?.textContent).not.toBe(initial);
      expect(r.host.querySelector('[role="status"]')?.textContent).toContain('Waiting for your agent');
    } finally { r.dispose(); }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])('unavailable copy uses the correct development=%s guidance', async development => {
    vi.stubEnv('DEV', development); const r = rig({ fetch: async () => { throw Error('ECONNREFUSED'); } });
    try {
      r.button.click(); await settle(); const text = r.host.textContent ?? '';
      if (development) expect(text).toContain('npm run forge:agent');
      else { expect(text).toMatch(/not hosted.*yet/i); expect(text).not.toContain('npm run forge:agent'); }
      expect(text).not.toContain('ECONNREFUSED'); expect(r.copy).not.toHaveBeenCalled();
    } finally { r.dispose(); }
  });
});

/**
 * LATER 483 (fixed by FP-14; product track): once the gateway answers `pending`, its approval window is its own
 * (`pending.created + LIMITS.invitationMs`, LATER 432), so the page no longer closes at the registration's expiresAt; it
 * keeps a backstop from the pending's receipt (never earlier than the gateway's) and the gateway's `revoked` ends it sooner.
 * The countdown is the gateway's expiresAt while it waits for the agent, and gone while the person decides.
 */
describe('LATER 483: a late approval still lands on the page', () => {
  const pending = { type: 'pending', pendingId: 'pending1', clientName: 'Claude', comparisonCode: '123456', permissions: ['inspect'] };
  it('a pending past the invitation\'s expiry keeps the page waiting for the approval', async () => {
    vi.useFakeTimers(); const r = rig();
    try {
      r.button.click(); await settle();
      expect(r.host.querySelector<HTMLElement>('[data-agent-expiry]')!.hidden).toBe(false);
      await vi.advanceTimersByTimeAsync(4000);
      r.sockets[0]!.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(pending) }));
      expect(r.connection.state().status).toBe('approval');
      expect(r.connection.state().expiresAt).toBeUndefined();
      expect(r.host.querySelector<HTMLElement>('[data-agent-expiry]')!.hidden).toBe(true);
      await vi.advanceTimersByTimeAsync(2000);                       // past the registration's 5 s
      expect(r.connection.state().status).toBe('approval');
      await vi.advanceTimersByTimeAsync(LIMITS.invitationMs);        // past the backstop from the pending's receipt
      expect(r.connection.state().status).toBe('disconnected');
    } finally { r.dispose(); }
  });
  it('the gateway\'s revoked during the approval ends it at once', async () => {
    const r = rig();
    try {
      r.button.click(); await settle();
      r.sockets[0]!.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(pending) }));
      r.sockets[0]!.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'revoked', reason: 'INVITATION_EXPIRED' }) }));
      expect(r.connection.state().status).toBe('disconnected');
    } finally { r.dispose(); }
  });
});
