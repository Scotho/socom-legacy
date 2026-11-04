// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentConnectionOptions } from '../src/agent/connection';
import type { LocalPackApi } from '../src/agent/localPacks';

/**
 * GW-F-2 (a browser adaptation, the agent connection's deploy; product track): a page reaching a gateway on a cloud box
 * needs an ICE server to offer more than host/mDNS candidates, which the gateway refuses. The build-time
 * VITE_S2U_AGENT_ICE_SERVERS, beside VITE_S2U_AGENT_URL, becomes the connection's `iceServers`; unset, `[]` as before.
 */
const seen = vi.hoisted(() => [] as AgentConnectionOptions[]);
vi.mock('../src/agent/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/agent/connection')>();
  return { ...actual, createAgentConnection: (options: AgentConnectionOptions) => { seen.push(options); return actual.createAgentConnection(options); } };
});
import { createAgentConnection } from '../src/agent/connection';
import { agentConnectionSettings, agentIceServers, mountPageAgent } from '../src/agent/install';

const STUN = 'stun:stun.cloudflare.com:3478';
const GATEWAY = 'https://agent.socom2legacy.com';
/** Built, so the leak check never reads a credential URL as an address. */
const AT = '@';
const page = { location: { origin: 'https://nightly.socom2legacy.com' } } as unknown as Document;

afterEach(() => { vi.unstubAllEnvs(); seen.length = 0; document.body.replaceChildren(); });

describe('VITE_S2U_AGENT_ICE_SERVERS', () => {
  it('unset or empty: no ICE server, as before', () => {
    expect(agentIceServers(undefined)).toEqual([]);
    expect(agentIceServers('')).toEqual([]);
  });
  it('a comma-separated list of stun:/turn:/turns: URLs, each one RTCIceServer', () => {
    expect(agentIceServers(STUN)).toEqual([{ urls: STUN }]);
    expect(agentIceServers(` ${STUN} ,turns:turn.example.org:5349`)).toEqual([{ urls: STUN }, { urls: 'turns:turn.example.org:5349' }]);
  });
  it.each([
    ['credentials', `turn:user${AT}turn.example.org:3478`],
    ['a query', 'turn:turn.example.org:3478?transport=tcp'],
    ['another scheme', 'https://stun.cloudflare.com'],
    ['no host', 'stun:'],
    ['a port past 65535', 'stun:stun.cloudflare.com:70000'],
    ['an empty entry', `${STUN},`],
  ])('refuses %s', (_what, value) => {
    expect(() => agentIceServers(value)).toThrow('INVALID_ICE_SERVERS');
  });
});

describe("the connection's settings from the build", () => {
  it('both set: the gateway and its ICE servers', () => {
    expect(agentConnectionSettings(page, { VITE_S2U_AGENT_URL: GATEWAY, VITE_S2U_AGENT_ICE_SERVERS: STUN, DEV: false }))
      .toEqual({ gateway: GATEWAY, iceServers: [{ urls: STUN }] });
  });
  it('unset: the page origin (or the loopback in development) and no ICE server, as before', () => {
    expect(agentConnectionSettings(page, { DEV: false })).toEqual({ gateway: 'https://nightly.socom2legacy.com', iceServers: [] });
    expect(agentConnectionSettings(page, { DEV: true }).iceServers).toEqual([]);
  });
  it("the default reads the build's own environment", () => {
    vi.stubEnv('VITE_S2U_AGENT_URL', GATEWAY);
    vi.stubEnv('VITE_S2U_AGENT_ICE_SERVERS', STUN);
    expect(agentConnectionSettings(page)).toEqual({ gateway: GATEWAY, iceServers: [{ urls: STUN }] });
  });
});

class Socket extends EventTarget {
  readyState = 1;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  message(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
}
class Peer extends EventTarget {
  remoteDescription: RTCSessionDescriptionInit | null = null;
  async setRemoteDescription(d: RTCSessionDescriptionInit) { this.remoteDescription = d; }
  async createAnswer() { return { type: 'answer' as const, sdp: 'answer' }; }
  async setLocalDescription() {}
  async addIceCandidate() {}
  close() {}
}

/** Pairs one session through `createAgentConnection` with the build's settings; the peer factory's configurations. */
async function peerConfigurations(env: Record<string, unknown>): Promise<RTCConfiguration[]> {
  const configurations: RTCConfiguration[] = [], sockets: Socket[] = [];
  const connection = createAgentConnection({
    ...agentConnectionSettings(page, env),
    target: { read: () => ({ surface: 'forge-editor' as const, revision: 0, name: 'Map', build: 'test' }),
      dispatch: async (r) => ({ requestId: r.requestId, revision: 0, outcome: 'ok' as const }) },
    fetch: vi.fn(async () => new Response(JSON.stringify({ targetId: 'target1', pageToken: 'placeholder', epoch: 'epoch1',
      invitation: 'invitation1', expiresAt: Date.now() + 300000 }), { status: 201 })),
    socket: () => { const s = new Socket(); sockets.push(s); return s as unknown as WebSocket; },
    peer: (configuration) => { configurations.push(configuration); return new Peer() as unknown as RTCPeerConnection; },
  });
  await connection.prepare('codex');
  const socket = sockets.at(-1)!;
  socket.message({ type: 'pending', pendingId: 'p', clientName: 'agent', comparisonCode: '123456', permissions: ['inspect'] });
  connection.approve(['inspect']);
  socket.message({ type: 'offer', sessionId: 's', targetId: 'target1', epoch: 'epoch1', permissions: ['inspect'], sdp: 'offer' });
  await vi.waitFor(() => expect(configurations).toHaveLength(1));
  connection.dispose();
  return configurations;
}

describe("the connection's peer factory", () => {
  it('receives the configured ICE servers', async () => {
    expect(await peerConfigurations({ VITE_S2U_AGENT_URL: GATEWAY, VITE_S2U_AGENT_ICE_SERVERS: STUN, DEV: false }))
      .toEqual([{ iceServers: [{ urls: STUN }] }]);
  });
  it('receives [] without the setting', async () => {
    expect(await peerConfigurations({ VITE_S2U_AGENT_URL: GATEWAY, DEV: false })).toEqual([{ iceServers: [] }]);
  });
});

describe('mountPageAgent', () => {
  it("builds the connection with the build's ICE servers", () => {
    vi.stubEnv('VITE_S2U_AGENT_URL', GATEWAY);
    vi.stubEnv('VITE_S2U_AGENT_ICE_SERVERS', STUN);
    const host = document.createElement('div'); document.body.append(host);
    const packs = { dispose: () => {} } as unknown as LocalPackApi;
    const target = { read: () => ({ surface: 'forge-editor' as const, revision: 0, name: 'Map', build: 'test' }),
      dispatch: async () => ({ requestId: 'r', revision: 0, outcome: 'ok' as const }) };
    const mounted = mountPageAgent(document, target, packs, () => () => {}, host, () => {});
    try {
      expect(seen).toHaveLength(1);
      expect(seen[0]!.gateway).toBe(GATEWAY);
      expect(seen[0]!.iceServers).toEqual([{ urls: STUN }]);
    } finally { mounted.dispose(); }
  });
});
