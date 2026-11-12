// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentConnection, AGENT_RESUME_KEY, type AgentResumeStore } from "../src/agent/connection";
import { mountAgentPanel, PERMISSION_LABELS, type AgentPanelController, type AgentPanelState } from "../src/agent/panel";
import { AGENT_CODE_WORDS } from "../src/agent/codes";
import { PAGE_SETTING_KEYS } from "../src/pageStore";
import { REFUSAL_HINTS, type Permission } from "@s2u/forge-agent-protocol";

// AX-9 (a browser adaptation, product track): a reload keeps the pairing resumable -- the page keeps the gateway's
// one-time resume ticket in its tab (sessionStorage), and the reloaded page offers one click, "Reconnect <client>".
const GATEWAY = "http://127.0.0.1:5370";
class Socket extends EventTarget {
  readyState = 1;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  message(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
  types() {
    return this.sent.map((s) => JSON.parse(s).type as string);
  }
}
class Channel extends EventTarget {
  label = "s2u-agent-v1";
  protocol = "s2u-agent-v1";
  ordered = true;
  maxRetransmits = null;
  maxPacketLifeTime = null;
  readyState = "connecting";
  bufferedAmount = 0;
  send() {}
  close() {
    this.readyState = "closed";
  }
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }
}
class Peer extends EventTarget {
  localDescription: RTCSessionDescriptionInit | null = null;
  closed = false;
  setRemoteDescription = vi.fn(async () => {});
  createAnswer = vi.fn(async () => ({ type: "answer" as const, sdp: "answer" }));
  setLocalDescription = vi.fn(async (d: RTCSessionDescriptionInit) => {
    this.localDescription = d;
  });
  addIceCandidate = vi.fn(async () => {});
  close() {
    this.closed = true;
  }
  channel(channel: Channel) {
    this.dispatchEvent(Object.assign(new Event("datachannel"), { channel }));
  }
}
function memoryStore(initial: Record<string, string> = {}): AgentResumeStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => {
      data.set(k, v);
    },
    remove: (k) => {
      data.delete(k);
    },
  };
}
function page(store: AgentResumeStore, targetId = "target1") {
  const sockets: Socket[] = [],
    peers: Peer[] = [];
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible", defaultView: new EventTarget() });
  const revoke = vi.fn();
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ targetId, pageToken: "token", epoch: `epoch-${targetId}`, invitation: "invitation1", expiresAt: Date.now() + 300000 }),
        { status: 201 },
      ),
  );
  const connection = createAgentConnection({
    gateway: GATEWAY,
    target: { read: () => ({ surface: "forge-editor" as const, revision: 0, name: "Map", build: "test" }), dispatch: vi.fn(), revoke },
    document: doc as unknown as Document,
    fetch,
    resumeStore: store,
    socket: () => {
      const s = new Socket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    peer: () => {
      const p = new Peer();
      peers.push(p);
      return p as unknown as RTCPeerConnection;
    },
  });
  async function connect(socket: Socket, permissions: Permission[], epoch = `epoch-${targetId}`) {
    socket.message({ type: "offer", sessionId: "s1", targetId, epoch, permissions, sdp: "offer" });
    await vi.waitFor(() => expect(socket.types()).toContain("answer"));
    const channel = new Channel();
    peers.at(-1)!.channel(channel);
    channel.open();
    await vi.waitFor(() => expect(connection.state().status).toBe("connected"));
  }
  async function pair(permissions: Permission[] = ["inspect", "edit"]) {
    await connection.prepare("claude");
    const socket = sockets.at(-1)!;
    socket.message({ type: "pending", pendingId: "p", clientName: "Claude Code", comparisonCode: "ABC123", permissions });
    connection.approve(permissions);
    await connect(socket, permissions);
    socket.message({ type: "resume-ticket", sessionId: "s1", ticket: "ticket-one", clientName: "Claude Code" });
    return socket;
  }
  return { connection, sockets, peers, doc, revoke, fetch, pair, connect };
}
const saved = (store: { data: Map<string, string> }) => JSON.parse(store.data.get(AGENT_RESUME_KEY) ?? "null");

describe("AX-9 the page keeps the resume ticket in its tab", () => {
  it("stores the gateway's resume-ticket through the tab store, with the client, session and grants", async () => {
    const store = memoryStore();
    const p = page(store);
    try {
      await p.pair();
      expect(saved(store)).toEqual({ ticket: "ticket-one", clientName: "Claude Code", sessionId: "s1", gateway: GATEWAY, permissions: ["inspect", "edit"] });
    } finally {
      p.connection.dispose();
    }
  });
  it("ignores a ticket for another session or before pairing", async () => {
    const store = memoryStore();
    const p = page(store);
    try {
      await p.connection.prepare("claude");
      p.sockets[0]!.message({ type: "resume-ticket", sessionId: "s1", ticket: "early", clientName: "x" });
      expect(store.data.size).toBe(0);
    } finally {
      p.connection.dispose();
    }
  });
  it("a pagehide sends pagehide in place of revoke and keeps the ticket", async () => {
    const store = memoryStore();
    const p = page(store);
    const socket = await p.pair();
    p.doc.defaultView.dispatchEvent(new Event("pagehide"));
    expect(socket.types()).toContain("pagehide");
    expect(socket.types()).not.toContain("revoke");
    expect(saved(store)?.ticket).toBe("ticket-one");
    expect(p.connection.state().status).toBe("disconnected");
    p.connection.dispose();
    // dispose after the pagehide does not spend what the pagehide kept
    expect(saved(store)?.ticket).toBe("ticket-one");
  });
  it("Disconnect discards the ticket (and revokes as before)", async () => {
    const store = memoryStore();
    const p = page(store);
    const socket = await p.pair();
    p.connection.disconnect();
    expect(socket.types()).toContain("revoke");
    expect(store.data.has(AGENT_RESUME_KEY)).toBe(false);
    p.connection.dispose();
  });
  it("the gateway's revoked discards the ticket", async () => {
    const store = memoryStore();
    const p = page(store);
    const socket = await p.pair();
    socket.message({ type: "revoked", reason: "AGENT_DISCONNECTED" });
    expect(store.data.has(AGENT_RESUME_KEY)).toBe(false);
    p.connection.dispose();
  });
  it("a storage that throws is survived", async () => {
    const throwing: AgentResumeStore = {
      get: () => {
        throw Error("blocked");
      },
      set: () => {
        throw Error("blocked");
      },
      remove: () => {
        throw Error("blocked");
      },
    };
    const p = page(throwing);
    try {
      expect(p.connection.state().resume).toBeUndefined();
      await p.pair();
      expect(p.connection.state().status).toBe("connected");
    } finally {
      p.connection.dispose();
    }
  });
});
describe("AX-9 the reloaded page", () => {
  const held = () =>
    memoryStore({
      [AGENT_RESUME_KEY]: JSON.stringify({ ticket: "ticket-one", clientName: "Claude Code", sessionId: "s1", gateway: GATEWAY, permissions: ["inspect", "edit"] }),
    });
  it("offers Reconnect <client> first, and its click re-binds with the ticket and the same grants", async () => {
    const store = held();
    const p = page(store, "target2");
    try {
      expect(p.connection.state()).toMatchObject({ status: "idle", resume: { clientName: "Claude Code", permissions: ["inspect", "edit"] } });
      expect(p.fetch).not.toHaveBeenCalled(); // nothing resumes by itself
      await p.connection.reconnect();
      const socket = p.sockets[0]!;
      expect(socket.sent.map((s) => JSON.parse(s))).toContainEqual({ type: "resume", ticket: "ticket-one" });
      expect(store.data.has(AGENT_RESUME_KEY)).toBe(false); // single-use on the page too
      expect(p.connection.state()).toMatchObject({ status: "connecting", resume: undefined });
      await p.connect(socket, ["inspect", "edit"]);
      expect(p.connection.state().permissions).toEqual(["inspect", "edit"]);
      // the next ticket is kept for the next reload
      socket.message({ type: "resume-ticket", sessionId: "s1", ticket: "ticket-two", clientName: "Claude Code" });
      expect(saved(store)?.ticket).toBe("ticket-two");
    } finally {
      p.connection.dispose();
    }
  });
  it("an offer with other grants than the ones resumed is not taken", async () => {
    const p = page(held(), "target2");
    try {
      await p.connection.reconnect();
      p.sockets[0]!.message({ type: "offer", sessionId: "s1", targetId: "target2", epoch: "epoch-target2", permissions: ["inspect", "edit", "test"], sdp: "offer" });
      await new Promise((r) => setTimeout(r, 10));
      expect(p.sockets[0]!.types()).not.toContain("answer");
    } finally {
      p.connection.dispose();
    }
  });
  it("a refused resume falls back to the Connect moment, its words said", async () => {
    const store = held();
    const p = page(store, "target2");
    try {
      await p.connection.reconnect();
      p.sockets[0]!.message({ type: "resume-refused", code: "RESUME_EXPIRED" });
      expect(p.connection.state()).toMatchObject({ status: "disconnected", resume: undefined });
      expect(p.connection.state().error).toBe(AGENT_CODE_WORDS.RESUME_EXPIRED);
      expect(store.data.has(AGENT_RESUME_KEY)).toBe(false);
      // and Connect still works afresh
      await p.connection.prepare("claude");
      expect(p.connection.state().status).toBe("waiting");
    } finally {
      p.connection.dispose();
    }
  });
  it("a new tab (nothing in its sessionStorage) shows Connect", () => {
    const p = page(memoryStore(), "target2");
    expect(p.connection.state().resume).toBeUndefined();
    p.connection.dispose();
  });
  it("a ticket for another connection service, or malformed, is not offered", () => {
    for (const value of [
      JSON.stringify({ ticket: "t", clientName: "C", sessionId: "s1", gateway: "https://elsewhere.example", permissions: ["inspect"] }),
      "{not json",
      JSON.stringify({ ticket: "", clientName: "C", sessionId: "s1", gateway: GATEWAY, permissions: ["inspect"] }),
    ]) {
      const p = page(memoryStore({ [AGENT_RESUME_KEY]: value }), "target2");
      expect(p.connection.state().resume).toBeUndefined();
      p.connection.dispose();
    }
  });
  it("choosing Connect instead forgets the ticket", async () => {
    const store = held();
    const p = page(store, "target2");
    try {
      p.connection.forgetResume();
      expect(p.connection.state().resume).toBeUndefined();
      expect(store.data.has(AGENT_RESUME_KEY)).toBe(false);
      const again = held();
      const q = page(again, "target3");
      await q.connection.prepare("claude");
      expect(again.data.has(AGENT_RESUME_KEY)).toBe(false);
      expect(q.connection.state().resume).toBeUndefined();
      q.connection.dispose();
    } finally {
      p.connection.dispose();
    }
  });
});
describe("AX-9 the Reconnect card", () => {
  function rig(initial: Partial<AgentPanelState> = {}) {
    let state: AgentPanelState = { status: "idle", target: "Forge", permissions: [], activity: [], ...initial };
    const listeners = new Set<(s: AgentPanelState) => void>();
    const controller: AgentPanelController = {
      state: () => state,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      prepare: vi.fn(async () => "line"),
      approve: vi.fn(),
      deny: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(async () => {}),
      forgetResume: vi.fn(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const panel = mountAgentPanel(host, controller, { copy: async () => {} });
    return {
      host,
      controller,
      panel,
      update(next: Partial<AgentPanelState>) {
        state = { ...state, ...next };
        for (const fn of listeners) fn(state);
      },
    };
  }
  afterEach(() => {
    document.body.replaceChildren();
  });
  it("shows Reconnect <client> before the Connect steps, and its click reconnects", () => {
    const r = rig({ resume: { clientName: "Claude Code", permissions: ["inspect"] } });
    const card = r.host.querySelector("[data-agent-resume]") as HTMLElement;
    expect(card.hidden).toBe(false);
    const button = card.querySelector("[data-agent-reconnect]") as HTMLButtonElement;
    expect(button.textContent).toBe("Reconnect Claude Code");
    // first in the Connect moment
    const connect = r.host.querySelector('[data-agent-moment="connect"]')!;
    expect(connect.firstElementChild).toBe(card);
    button.click();
    expect(r.controller.reconnect).toHaveBeenCalledOnce();
    r.update({ status: "connecting", resume: undefined });
    expect(card.hidden).toBe(true);
    r.panel.dispose();
  });
  it("Connect instead forgets it; with nothing to resume the card is hidden", () => {
    const r = rig({ resume: { clientName: "Codex", permissions: ["inspect"] } });
    (r.host.querySelector("[data-agent-resume-dismiss]") as HTMLButtonElement).click();
    expect(r.controller.forgetResume).toHaveBeenCalledOnce();
    r.update({ resume: undefined });
    expect((r.host.querySelector("[data-agent-resume]") as HTMLElement).hidden).toBe(true);
    r.panel.dispose();
    const plain = rig();
    expect((plain.host.querySelector("[data-agent-resume]") as HTMLElement).hidden).toBe(true);
    plain.panel.dispose();
  });
});
describe("AX-9 words and inventory", () => {
  it("names the tab key in pageStore's inventory", () => {
    expect(PAGE_SETTING_KEYS).toContain(AGENT_RESUME_KEY);
  });
  it("has a person's words and an agent's hint for each new code", () => {
    for (const code of ["PAGE_RELOADING", "RESUME_EXPIRED", "RESUME_REFUSED"]) {
      expect(AGENT_CODE_WORDS[code], code).toBeTruthy();
      expect(REFUSAL_HINTS[code], code).toBeTruthy();
    }
  });
});
describe("AX-9 one primary action a moment", () => {
  it("while the Reconnect card shows, Reconnect is the primary and Copy steps back; after, Copy is again", () => {
    let state: AgentPanelState = { status: "idle", target: "Forge", permissions: [], activity: [], resume: { clientName: "Claude Code", permissions: ["inspect"] } };
    const listeners = new Set<(s: AgentPanelState) => void>();
    const controller: AgentPanelController = {
      state: () => state,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      prepare: vi.fn(async () => "line"),
      approve: vi.fn(),
      deny: vi.fn(),
      disconnect: vi.fn(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const panel = mountAgentPanel(host, controller, { copy: async () => {} });
    const connect = host.querySelector('[data-agent-moment="connect"]')!;
    expect([...connect.querySelectorAll(".agent-panel__primary")].map((b) => (b as HTMLElement).dataset.agentReconnect !== undefined)).toEqual([true]);
    state = { ...state, resume: undefined };
    for (const fn of listeners) fn(state);
    expect([...connect.querySelectorAll(".agent-panel__primary")].map((b) => (b as HTMLElement).dataset.agentCopy !== undefined)).toEqual([true]);
    panel.dispose();
    document.body.replaceChildren();
  });
});

describe("AX-9 (REVIEW-1 finding 20) a page restored from the back-forward cache", () => {
  const pageshow = (persisted: boolean) => Object.assign(new Event("pageshow"), { persisted });
  it("after a pagehide that kept the ticket, a persisted pageshow offers Reconnect again, with the grants", async () => {
    const store = memoryStore();
    const p = page(store);
    try {
      await p.pair();
      p.doc.defaultView.dispatchEvent(new Event("pagehide"));
      expect(p.connection.state()).toMatchObject({ status: "disconnected", resume: undefined });
      p.doc.defaultView.dispatchEvent(pageshow(true));
      expect(p.connection.state().resume).toEqual({ clientName: "Claude Code", permissions: ["inspect", "edit"] });
      expect(p.fetch).toHaveBeenCalledTimes(1); // offered, never resumed by itself
      await p.connection.reconnect();
      expect(p.sockets.at(-1)!.sent.map((x) => JSON.parse(x))).toContainEqual({ type: "resume", ticket: "ticket-one" });
    } finally {
      p.connection.dispose();
    }
  });
  it("a pageshow that is not from the cache, or with no ticket held, offers nothing", async () => {
    const store = memoryStore();
    const p = page(store);
    try {
      await p.pair();
      p.doc.defaultView.dispatchEvent(new Event("pagehide"));
      p.doc.defaultView.dispatchEvent(pageshow(false));
      expect(p.connection.state().resume).toBeUndefined();
      store.data.clear();
      p.doc.defaultView.dispatchEvent(pageshow(true));
      expect(p.connection.state().resume).toBeUndefined();
    } finally {
      p.connection.dispose();
    }
  });
  it("a persisted pageshow while a pairing is live leaves it alone", async () => {
    const store = memoryStore();
    const p = page(store);
    try {
      await p.pair();
      p.doc.defaultView.dispatchEvent(pageshow(true));
      expect(p.connection.state().status).toBe("connected");
      expect(p.connection.state().resume).toBeUndefined();
    } finally {
      p.connection.dispose();
    }
  });
  it("after dispose the listener is gone", async () => {
    const store = memoryStore({
      [AGENT_RESUME_KEY]: JSON.stringify({ ticket: "t1", clientName: "C", sessionId: "s1", gateway: GATEWAY, permissions: ["inspect"] }),
    });
    const p = page(store);
    p.connection.forgetResume();
    p.connection.dispose();
    store.data.set(AGENT_RESUME_KEY, JSON.stringify({ ticket: "t1", clientName: "C", sessionId: "s1", gateway: GATEWAY, permissions: ["inspect"] }));
    p.doc.defaultView.dispatchEvent(pageshow(true));
    expect(p.connection.state().resume).toBeUndefined();
  });
});
describe("AX-9 (REVIEW-1 finding 7) the Reconnect card lists what it will grant", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });
  it("draws each held permission as a read-only chip with its label, and the others as not granted", () => {
    let state: AgentPanelState = {
      status: "idle", target: "Forge", permissions: [], activity: [],
      resume: { clientName: "Claude Code", permissions: ["inspect", "edit"] },
    };
    const listeners = new Set<(s: AgentPanelState) => void>();
    const controller: AgentPanelController = {
      state: () => state,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      prepare: vi.fn(async () => "line"),
      approve: vi.fn(),
      deny: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(async () => {}),
      forgetResume: vi.fn(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const panel = mountAgentPanel(host, controller, { copy: async () => {} });
    const card = host.querySelector("[data-agent-resume]") as HTMLElement;
    const list = card.querySelector("[data-agent-resume-permissions]") as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.getAttribute("aria-label")).toBe("What it will be able to do");
    const chips = [...list.querySelectorAll<HTMLElement>("li")];
    expect(chips.map((c) => c.dataset.permission)).toEqual(["inspect", "edit", "import", "test", "diagnose", "capture"]);
    expect(chips.filter((c) => c.dataset.granted === "true").map((c) => c.textContent)).toEqual([PERMISSION_LABELS.inspect, PERMISSION_LABELS.edit]);
    expect(chips[0]!.getAttribute("aria-label")).toBe(`${PERMISSION_LABELS.inspect}: will be granted`);
    expect(chips[2]!.getAttribute("aria-label")).toBe(`${PERMISSION_LABELS.import}: not granted`);
    // read-only: nothing in the card to switch
    expect(card.querySelector("input")).toBeNull();
    expect(card.textContent).not.toContain("the same permissions");
    state = { ...state, resume: { clientName: "Codex", permissions: ["capture"] } };
    for (const fn of listeners) fn(state);
    expect([...list.querySelectorAll<HTMLElement>('li[data-granted="true"]')].map((c) => c.dataset.permission)).toEqual(["capture"]);
    panel.dispose();
  });
});
