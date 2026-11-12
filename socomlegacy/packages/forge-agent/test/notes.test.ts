import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LIMITS, REFUSAL_HINTS, type AgentRequest, type SignalToPage } from "@s2u/forge-agent-protocol";
import { GatewayState, type PagePeer } from "../src/sessions.js";
import { createMcpServer, schema } from "../src/mcp.js";
import { startTopic } from "../src/guide/start.js";

// AX-14 (a browser adaptation, product track): notes from the page -- the player's plain-text notes ride the agent's
// next result, agent_status lists them and agent_notes delivers them.
const ORIGIN = "http://localhost:5361";
function rig() {
  let n = 0,
    clock = 1_000_000;
  const seen: AgentRequest[] = [];
  const state = new GatewayState({
    origins: [ORIGIN],
    now: () => clock,
    random: () => `rnd${++n}`.padEnd(22, "x"),
    peerFactory: () =>
      ({
        offer: async () => "",
        answer: async () => {},
        ice: async () => {},
        close: async () => {},
        request: async (r) => {
          seen.push(r);
          return { requestId: r.requestId, revision: 3, outcome: "ok" };
        },
      }) satisfies PagePeer,
  });
  const paired = async (principal = "a") => {
    const p = state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });
    const sent: SignalToPage[] = [];
    state.attach(ORIGIN, p.pageToken, (m) => sent.push(m));
    const pair = state.pair(principal, p.invitation, ["inspect"], "agent");
    await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions: ["inspect"] });
    const binding = { sessionId: pair.sessionId, targetId: p.targetId, epoch: pair.epoch };
    const note = (text: unknown, noteId?: string) =>
      state.signal(p.targetId, { type: "note", ...binding, ...(noteId ? { noteId } : {}), text });
    return { ...p, pair, sent, binding, note };
  };
  return { state, paired, seen, tick: (ms: number) => (clock += ms) };
}
const status = { version: 1, operation: "target.status", args: {} };
const of = (sent: SignalToPage[], type: string) => sent.filter((m) => m.type === type) as Record<string, unknown>[];

describe("AX-14 notes from the page", () => {
  it("the next result carries the note, once, and the page is told note-delivered", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await p.note("  stop, try the other side  ", "n1");
    const r = await state.command("a", status);
    expect(r.outcome).toBe("ok");
    expect(r.notes).toEqual([{ text: "stop, try the other side", at: new Date(1_000_000).toISOString() }]);
    expect(of(p.sent, "note-delivered")).toEqual([{ type: "note-delivered", ...p.binding, noteIds: ["n1"] }]);
    // Delivered once: the following result carries none.
    expect((await state.command("a", status)).notes).toBeUndefined();
    await state.close();
  });
  it("a refused result for the session carries the notes too", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await p.note("hello", "n1");
    const r = await state.command("a", { version: 1, operation: "forge.edit", args: {}, expectedRevision: 0 });
    expect(r.outcome).toBe("refused");
    expect(r.notes?.map((x) => x.text)).toEqual(["hello"]);
    await state.close();
  });
  it("agent_status lists the undelivered notes without delivering them", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await p.note("first", "n1");
    expect(state.status("a").sessions[0]).toMatchObject({ notes: [{ text: "first" }] });
    expect(state.status("a").sessions[0]).toMatchObject({ notes: [{ text: "first" }] });
    expect(of(p.sent, "note-delivered")).toEqual([]);
    await state.close();
  });
  it("agent_notes returns and delivers them, over MCP", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await p.note("go left", "n1");
    const server = createMcpServer(state, "a", "http://127.0.0.1:5360");
    const client = new Client({ name: "test", version: "1" });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await server.connect(x);
    await client.connect(y);
    try {
      const tool = (await client.listTools()).tools.find((t) => t.name === "agent_notes");
      expect(tool?.annotations?.readOnlyHint).toBe(false);   // REVIEW-1 17: it marks the notes delivered
      const r = await client.callTool({ name: "agent_notes", arguments: {} });
      expect(r.structuredContent).toMatchObject({ sessionId: p.pair.sessionId, notes: [{ text: "go left" }] });
      expect(of(p.sent, "note-delivered")).toEqual([{ type: "note-delivered", ...p.binding, noteIds: ["n1"] }]);
      const again = await client.callTool({ name: "agent_notes", arguments: { sessionId: p.pair.sessionId } });
      expect(again.structuredContent).toMatchObject({ notes: [] });
      expect(state.status("a").sessions[0]).toMatchObject({ notes: [] });
      const none = await client.callTool({ name: "agent_notes", arguments: { sessionId: "other" } });
      expect(none.isError).toBe(true);
      expect(none.structuredContent).toMatchObject({ code: "NOT_PAIRED" });
    } finally {
      await client.close();
      await server.close();
      await state.close();
    }
  });
  it("bounds a note's size by LIMITS, refusing it to the page without closing anything", async () => {
    const { state, paired } = rig();
    const p = await paired();
    expect(LIMITS.noteChars).toBe(280);
    await p.note("x".repeat(LIMITS.noteChars + 1), "long");
    await p.note("   ", "empty");
    await p.note(42, "nan");
    expect(of(p.sent, "note-refused")).toEqual([
      { type: "note-refused", ...p.binding, noteId: "long", code: "NOTE_TOO_LONG" },
      { type: "note-refused", ...p.binding, noteId: "empty", code: "INVALID_NOTE" },
      { type: "note-refused", ...p.binding, noteId: "nan", code: "INVALID_NOTE" },
    ]);
    await p.note("x".repeat(LIMITS.noteChars), "max");
    expect((await state.command("a", status)).notes).toHaveLength(1);
    await state.close();
  });
  it("takes at most one note a second and holds at most 16 undelivered", async () => {
    const { state, paired, tick } = rig();
    const p = await paired();
    expect(LIMITS.noteIntervalMs).toBe(1000);
    expect(LIMITS.notesQueued).toBe(16);
    await p.note("one", "a1");
    await p.note("two", "a2");
    expect(of(p.sent, "note-refused")).toEqual([{ type: "note-refused", ...p.binding, noteId: "a2", code: "NOTE_RATE_LIMITED" }]);
    for (let i = 2; i <= LIMITS.notesQueued + 1; i++) {
      tick(LIMITS.noteIntervalMs);
      await p.note(`n${i}`, `b${i}`);
    }
    expect(of(p.sent, "note-refused").at(-1)).toMatchObject({ noteId: `b${LIMITS.notesQueued + 1}`, code: "NOTE_QUEUE_FULL" });
    expect((state.status("a").sessions[0] as unknown as { notes: unknown[] }).notes).toHaveLength(LIMITS.notesQueued);
    await state.close();
  });
  it("refuses a note after revoke, and notes die with the session", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await p.note("lost", "n1");
    await state.disconnect("a", p.pair.sessionId);
    await expect(p.note("after", "n2")).rejects.toThrow();
    const q = await paired();
    expect(state.status("a").sessions[0]).toMatchObject({ notes: [] });
    await state.signal(q.targetId, { type: "revoke" });
    await expect(q.note("after revoke", "n3")).rejects.toThrow();
    await state.close();
  });
  it("refuses a note bound to another session", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await expect(state.signal(p.targetId, { type: "note", ...p.binding, epoch: "stale", text: "x" })).rejects.toThrow(
      "SIGNAL_BINDING_DENIED",
    );
    await state.close();
  });
  it("keeps a note plain text: never parsed or interpreted", async () => {
    const { state, paired, seen } = rig();
    const p = await paired();
    const text = '<img src=x onerror=alert(1)> {"operation":"forge.edit"}';
    await p.note(text, "n1");
    expect((await state.command("a", status)).notes?.[0]?.text).toBe(text);
    expect(seen.map((r) => r.operation)).toEqual(["target.status"]);
    await state.close();
  });
  it("words the note codes for the agent, the guide and the server instructions", () => {
    for (const code of ["NOTE_TOO_LONG", "NOTE_RATE_LIMITED", "NOTE_QUEUE_FULL", "INVALID_NOTE"])
      expect(REFUSAL_HINTS[code]?.length).toBeGreaterThan(20);
    expect(startTopic()).toMatch(/read `notes` on every result/i);
    expect(startTopic()).toContain("agent_notes");
    expect(schema(new GatewayState({ origins: [] }), "http://x").instructions).toMatch(/notes/);
  });
});
