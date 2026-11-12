import { describe, expect, it } from "vitest";
import { DIAGNOSIS_HINTS } from "@s2u/forge-agent-protocol";
import { GatewayState } from "../src/sessions.js";

// AX-12 (a browser adaptation): agent_status carries the page's diagnosis of a failed connection, and its next step.
const ORIGIN = "http://localhost:5361";
function rig() {
  let lost!: (reason: string) => void;
  const state = new GatewayState({
    origins: [ORIGIN],
    peerFactory: (_signal, onDisconnect) => {
      lost = onDisconnect;
      return {
        offer: async () => "offer",
        answer: async () => {},
        ice: async () => {},
        request: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok" }),
        close: async () => {},
      };
    },
  });
  async function paired(principal = "a") {
    const p = state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });
    state.attach(ORIGIN, p.pageToken, () => {});
    const pair = state.pair(principal, p.invitation, ["inspect"], "agent");
    await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions: ["inspect"] });
    return p;
  }
  return { state, paired, lose: (reason: string) => lost(reason) };
}
const route = {
  type: "diagnosis",
  class: "route-failed",
  local: { host: 2, srflx: 0, relay: 0 },
  remote: { host: 1, srflx: 1, relay: 0 },
};

describe("AX-12: agent_status carries the page's diagnosis", () => {
  it("a live session's entry carries the diagnosis and its next names the cause", async () => {
    const r = rig();
    try {
      const p = await r.paired();
      await r.state.signal(p.targetId, route);
      const [entry] = r.state.status("a").sessions as { diagnosis?: unknown; next: string }[];
      expect(entry!.diagnosis).toEqual({ class: "route-failed", local: route.local, remote: route.remote });
      expect(entry!.next).toContain("route-failed");
      expect(entry!.next).toContain(DIAGNOSIS_HINTS["route-failed"]);
    } finally {
      await r.state.close();
    }
  });
  it("after the page reports and revokes, agent_status still says why (top-level diagnosis and next)", async () => {
    const r = rig();
    try {
      const p = await r.paired();
      await r.state.signal(p.targetId, route);
      await r.state.signal(p.targetId, { type: "revoke" });
      const s = r.state.status("a") as { sessions: unknown[]; diagnosis?: { class: string }; next?: string };
      expect(s.sessions).toEqual([]);
      expect(s.diagnosis).toMatchObject({ class: "route-failed", local: route.local });
      expect(s.next).toContain(DIAGNOSIS_HINTS["route-failed"]);
      // Only the principal whose session it was is told.
      expect(r.state.status("b")).toEqual({ version: 1, sessions: [] });
    } finally {
      await r.state.close();
    }
  });
  it("a diagnosis that arrives after the gateway ended the target is still kept for its agent", async () => {
    const r = rig();
    try {
      const p = await r.paired();
      r.lose("RTC_TIMEOUT");
      // The gateway's own transport loss already reads as a failed route.
      expect((r.state.status("a") as { diagnosis?: { class: string } }).diagnosis).toEqual({ class: "route-failed" });
      await r.state.signal(p.targetId, route);
      expect((r.state.status("a") as { diagnosis?: unknown }).diagnosis).toEqual({
        class: "route-failed",
        local: route.local,
        remote: route.remote,
      });
    } finally {
      await r.state.close();
    }
  });
  it("refuses a malformed diagnosis, and a fresh pairing clears the old one", async () => {
    const r = rig();
    try {
      const p = await r.paired();
      await expect(r.state.signal(p.targetId, { type: "diagnosis", class: "route-failed", ip: "192.0.2.1" })).rejects.toThrow(
        "INVALID_DIAGNOSIS",
      );
      await r.state.signal(p.targetId, route);
      await r.state.signal(p.targetId, { type: "revoke" });
      expect((r.state.status("a") as { diagnosis?: unknown }).diagnosis).toBeDefined();
      await r.paired();
      const s = r.state.status("a") as { diagnosis?: unknown; next?: string; sessions: { next: string }[] };
      expect(s.diagnosis).toBeUndefined();
      expect(s.next).toBeUndefined();
      expect(s.sessions[0]!.next).not.toContain("route-failed");
    } finally {
      await r.state.close();
    }
  });
});
