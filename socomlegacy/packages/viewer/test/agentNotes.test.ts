// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type AgentRequest, type AgentResult, type SignalToPage } from '@s2u/forge-agent-protocol';
import { createAgentConnection } from '../src/agent/connection';
import { AGENT_NOTE_PROMPT, mountAgentPanel, type AgentPanelController, type AgentPanelState } from '../src/agent/panel';
import * as panelModule from '../src/agent/panel';
import { AGENT_CODE_WORDS } from '../src/agent/codes';
import { GatewayState, type PagePeer } from '../../forge-agent/src/sessions';

// AX-14 (a browser adaptation, product track): notes from the page -- the note box, the wire, the gateway's queue.
class Channel extends EventTarget {
  label = 's2u-agent-v1'; protocol = 's2u-agent-v1'; ordered = true; maxRetransmits = null; maxPacketLifeTime = null;
  readyState = 'connecting'; bufferedAmount = 0;
  send(_text: string) {}
  close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
  open() { this.readyState = 'open'; this.dispatchEvent(new Event('open')); }
}
class Peer extends EventTarget {
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  async setRemoteDescription(d: RTCSessionDescriptionInit) { this.remoteDescription = d; }
  async createAnswer() { return { type: 'answer' as const, sdp: 'answer' }; }
  async setLocalDescription(d: RTCSessionDescriptionInit) { this.localDescription = d; }
  async addIceCandidate() {}
  close() {}
  channel(channel: Channel) { this.dispatchEvent(Object.assign(new Event('datachannel'), { channel })); }
}
class Socket extends EventTarget {
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onSend?: (value: Record<string, unknown>) => void;
  send(data: string) { const v = JSON.parse(data); this.sent.push(v); this.onSend?.(v); }
  close() { this.readyState = 3; }
  message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
}
const ORIGIN = 'http://localhost:5361';

/**
 * The page's connection wired to a real GatewayState: the page's signals go to `state.signal`, the gateway's to the
 * page's socket; the RTC peers are fakes (the page's answers its offer, the gateway's answers requests).
 */
function wired() {
  let clock = 1_000_000, n = 0;
  const state = new GatewayState({
    origins: [ORIGIN],
    now: () => clock,
    random: () => `rnd${++n}`.padEnd(22, 'x'),
    peerFactory: () => ({
      offer: async () => 'offer', answer: async () => {}, ice: async () => {}, close: async () => {},
      request: async (r: AgentRequest): Promise<AgentResult> => ({ requestId: r.requestId, revision: 1, outcome: 'ok' }),
    }) satisfies PagePeer,
  });
  const socket = new Socket(), peers: Peer[] = [];
  let targetId = '';
  const toPage = (m: SignalToPage) => queueMicrotask(() => socket.message(m));
  const connection = createAgentConnection({
    gateway: 'http://127.0.0.1:5360',
    now: () => clock,
    target: { read: () => ({ surface: 'forge-editor', revision: 0, name: 'Map', build: 'test' }), dispatch: vi.fn() },
    fetch: vi.fn(async () => {
      const r = state.register(ORIGIN, { surface: 'forge-editor', name: 'Map', build: 'test' });
      targetId = r.targetId;
      state.attach(ORIGIN, r.pageToken, toPage);
      return new Response(JSON.stringify(r), { status: 201 });
    }),
    socket: () => socket as unknown as WebSocket,
    peer: () => { const p = new Peer(); peers.push(p); return p as unknown as RTCPeerConnection; },
  });
  const signalled: Promise<void>[] = [];
  socket.onSend = (v) => { signalled.push(state.signal(targetId, v).catch(() => {})); };
  async function pair() {
    const text = await connection.prepare('claude');
    const invitation = /\/join\/(\S+)$/.exec(text)![1]!;
    const pairing = state.pair('agent', invitation, ['inspect'], 'Claude Code');
    await vi.waitFor(() => expect(connection.state().status).toBe('approval'));
    connection.approve(['inspect']);
    await vi.waitFor(() => expect(socket.sent.some((m) => m.type === 'answer')).toBe(true));
    const channel = new Channel();
    peers.at(-1)!.channel(channel);
    channel.open();
    expect(connection.state().status).toBe('connected');
    return pairing;
  }
  const settle = async () => { await Promise.all(signalled); await new Promise((r) => setTimeout(r, 0)); };
  return { state, connection, socket, pair, settle, tick: (ms: number) => (clock += ms) };
}

afterEach(() => { document.body.replaceChildren(); });

describe('AX-14 the wire, page to gateway and back', () => {
  it('sends a bound note; the next result carries it and the page marks it delivered', async () => {
    const w = wired();
    const pairing = await w.pair();
    expect(w.connection.sendNote!('stop, try the other side')).toBeUndefined();
    expect(w.socket.sent.at(-1)).toEqual({
      type: 'note', sessionId: pairing.sessionId, targetId: pairing.targetId, epoch: pairing.epoch, noteId: 'note-1',
      text: 'stop, try the other side',
    });
    expect(w.connection.state().notes).toEqual([{ id: 'note-1', text: 'stop, try the other side', state: 'sent' }]);
    await w.settle();
    expect(w.state.status('agent').sessions[0]).toMatchObject({ notes: [{ text: 'stop, try the other side' }] });
    const r = await w.state.command('agent', { version: 1, operation: 'target.status', args: {} });
    expect(r.notes).toEqual([{ text: 'stop, try the other side', at: new Date(1_000_000).toISOString() }]);
    await w.settle();
    expect(w.connection.state().notes).toEqual([{ id: 'note-1', text: 'stop, try the other side', state: 'delivered' }]);
    await w.state.close();
  });
  it('agent_notes delivers too', async () => {
    const w = wired();
    await w.pair();
    w.connection.sendNote!('go left');
    await w.settle();
    expect(w.state.notes('agent').notes.map((x) => x.text)).toEqual(['go left']);
    await w.settle();
    expect(w.connection.state().notes?.[0]?.state).toBe('delivered');
    await w.state.close();
  });
  it('holds the rate and size bounds on the page as the gateway does', async () => {
    const w = wired();
    await w.pair();
    const sent = () => w.socket.sent.filter((m) => m.type === 'note').length;
    expect(w.connection.sendNote!('x'.repeat(LIMITS.noteChars + 1))).toBe('NOTE_TOO_LONG');
    expect(w.connection.sendNote!('   ')).toBe('INVALID_NOTE');
    expect(w.connection.sendNote!('one')).toBeUndefined();
    expect(w.connection.sendNote!('two')).toBe('NOTE_RATE_LIMITED');
    expect(sent()).toBe(1);
    for (let i = 1; i < LIMITS.notesQueued; i++) { w.tick(LIMITS.noteIntervalMs); expect(w.connection.sendNote!(`n${i}`)).toBeUndefined(); }
    w.tick(LIMITS.noteIntervalMs);
    expect(w.connection.sendNote!('too many')).toBe('NOTE_QUEUE_FULL');
    expect(sent()).toBe(LIMITS.notesQueued);
    await w.state.close();
  });
  it('marks a note the gateway refused, keeping the pairing', async () => {
    const w = wired();
    const pairing = await w.pair();
    w.connection.sendNote!('hello');
    w.socket.message({ type: 'note-refused', sessionId: pairing.sessionId, targetId: pairing.targetId, epoch: pairing.epoch, noteId: 'note-1', code: 'NOTE_RATE_LIMITED' });
    expect(w.connection.state().notes?.[0]).toMatchObject({ state: 'refused', code: 'NOTE_RATE_LIMITED' });
    expect(w.connection.state().status).toBe('connected');
    // A notice bound to another session is ignored.
    w.tick(LIMITS.noteIntervalMs); w.connection.sendNote!('again');
    w.socket.message({ type: 'note-delivered', sessionId: 'other', targetId: pairing.targetId, epoch: pairing.epoch, noteIds: ['note-2'] });
    expect(w.connection.state().notes?.[1]?.state).toBe('sent');
    await w.state.close();
  });
  it('refuses a note after revoke, and the notes end with the pairing', async () => {
    const w = wired();
    await w.pair();
    w.connection.sendNote!('before');
    w.connection.disconnect();
    expect(w.connection.state().notes).toEqual([]);
    w.tick(LIMITS.noteIntervalMs);
    const before = w.socket.sent.length;
    expect(w.connection.sendNote!('after')).toBe('NOT_PAIRED');
    expect(w.socket.sent.length).toBe(before);
    await w.state.close();
  });
});

function panelRig(sendNote = vi.fn((_: string): string | undefined => undefined)) {
  let state: AgentPanelState = { status: 'connected', target: 'Forge', permissions: ['inspect'], activity: [] };
  const listeners = new Set<(s: AgentPanelState) => void>();
  const controller: AgentPanelController = {
    state: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    prepare: vi.fn(async () => ''), approve: vi.fn(), deny: vi.fn(), disconnect: vi.fn(), sendNote,
  };
  const host = document.createElement('div'); document.body.append(host);
  const panel = mountAgentPanel(host, controller, { copy: async () => {} });
  return { host, panel, sendNote, update(next: Partial<AgentPanelState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); } };
}

describe('AX-14 the note box', () => {
  it('sits in the connected moment: "Tell your agent…", 280 characters, Send', () => {
    const r = panelRig();
    const field = r.host.querySelector('[data-agent-moment="connected"] [data-agent-note-text]') as HTMLTextAreaElement;
    expect(field.placeholder).toBe('Tell your agent…');
    // REVIEW-1 finding 2: the box's prompt words are not a parity *_PLACEHOLDER (the ledger's reserved suffix).
    expect(AGENT_NOTE_PROMPT).toBe('Tell your agent…');
    expect(field.placeholder).toBe(AGENT_NOTE_PROMPT);
    expect(Object.keys(panelModule).filter((k) => /_PLACEHOLDER$/.test(k))).toEqual([]);
    expect(field.maxLength).toBe(LIMITS.noteChars);
    field.value = 'try the other side';
    (r.host.querySelector('[data-agent-note-send]') as HTMLButtonElement).click();
    expect(r.sendNote).toHaveBeenCalledWith('try the other side');
    expect(field.value).toBe('');
    r.panel.dispose();
  });
  it('says a refusal in words and keeps the text', () => {
    const r = panelRig(vi.fn(() => 'NOTE_RATE_LIMITED'));
    const field = r.host.querySelector('[data-agent-note-text]') as HTMLTextAreaElement;
    field.value = 'again';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(r.sendNote).toHaveBeenCalledWith('again');
    expect(field.value).toBe('again');
    expect((r.host.querySelector('[data-agent-note-status]') as HTMLElement).textContent).toBe(AGENT_CODE_WORDS.NOTE_RATE_LIMITED);
    r.panel.dispose();
  });
  it('lists the sent notes, marks the read ones delivered, and escapes their text', () => {
    const r = panelRig();
    r.update({ notes: [
      { id: 'note-1', text: '<img src=x onerror="alert(1)"><b>bold</b>', state: 'delivered' },
      { id: 'note-2', text: 'second', state: 'sent' },
    ] });
    const items = [...r.host.querySelectorAll('[data-agent-note-list] li')] as HTMLElement[];
    expect(items.map((li) => li.dataset.noteState)).toEqual(['sent', 'delivered']);
    expect(items[1]!.textContent).toContain('<img src=x onerror="alert(1)"><b>bold</b>');
    expect(items[1]!.textContent).toContain('delivered');
    expect(r.host.querySelector('[data-agent-note-list] img, [data-agent-note-list] b')).toBeNull();
    r.panel.dispose();
  });
  it('is shut while not connected', () => {
    const r = panelRig();
    r.update({ status: 'connecting' });
    expect((r.host.querySelector('[data-agent-note-send]') as HTMLButtonElement).disabled).toBe(true);
    r.panel.dispose();
  });
});
