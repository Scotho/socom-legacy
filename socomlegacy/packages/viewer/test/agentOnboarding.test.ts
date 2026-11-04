// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentConnection } from '../src/agent/connection';
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
    fetch: fetcher, socket: () => {
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
  const select = host.querySelector('select')!;
  return { host, connection, copy, fetcher, registered, sockets, button, manual, select,
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
      if (changeClient) { r.select.value = 'codex'; r.select.dispatchEvent(new Event('change')); }
      r.button.click(); await settle();
      expect(r.fetcher).toHaveBeenCalledTimes(2); expect(r.copy).toHaveBeenCalledTimes(2);
      expect(r.copy.mock.calls[1]![0]).toContain('invitation2');
      expect(r.copy.mock.calls[1]![0]).not.toContain('invitation1');
      expect(r.copy.mock.calls[1]![0]).toContain(changeClient ? 'codex mcp add' : 'claude mcp add');
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
      expect(r.host.textContent).toContain('copy the instructions below');
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
      r.button.click(); r.select.value = 'codex'; r.select.dispatchEvent(new Event('change'));
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
        expect(r.copy.mock.calls[0]![0]).toContain('claude mcp add');
        r.select.value = 'codex'; r.select.dispatchEvent(new Event('change')); await settle();
        const selectedClientStatus = r.button.textContent;
        if (outcome === 'resolve') permission.resolve(); else permission.reject(Error('old-client clipboard denied'));
        await settle();
        expect(r.select.value).toBe('codex'); expect(r.button.textContent).toBe(selectedClientStatus);
        expect(r.button.textContent).not.toMatch(/copied|select and copy/i);
        expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
        expect(document.activeElement).not.toBe(r.manual); expect(r.button.disabled).toBe(false);
        expect(r.copy).toHaveBeenCalledTimes(1);
        r.button.click(); await settle();
        expect(r.copy).toHaveBeenCalledTimes(2);
        expect(r.copy.mock.calls[1]![0]).toContain('codex mcp add');
        expect(r.copy.mock.calls[1]![0]).not.toContain('claude mcp add');
      } finally { r.dispose(); }
    },
  );

  it('dispose during clipboard failure cannot focus detached fallback or retain its invitation', async () => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    r.button.click(); await settle(); r.dispose(); permission.reject(Error('denied')); await settle();
    expect(r.manual.value).toBe(''); expect(r.manual.hidden).toBe(true);
    expect(document.activeElement).not.toBe(r.manual);
  });

  it('clears pending manual instructions when the page is hidden', async () => {
    const permission = deferred<void>(); const r = rig({ copy: () => permission.promise });
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    try {
      r.button.click(); await settle(); expect(r.manual.value).toContain('invitation1');
      visibility.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
      expect(r.connection.state().status).toBe('paused');
      expect(r.manual.hidden).toBe(true); expect(r.manual.value).toBe('');
      permission.reject(Error('denied')); await settle();
      expect(r.manual.value).toBe(''); expect(r.fetcher).toHaveBeenCalledTimes(1);
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
