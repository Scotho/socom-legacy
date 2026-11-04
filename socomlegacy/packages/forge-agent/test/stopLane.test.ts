import { describe, it, expect } from "vitest";
import { GatewayState, type PagePeer } from "../src/sessions.js";
import { LIMITS } from "@s2u/forge-agent-protocol";

/**
 * R5-B (a browser adaptation, no original): the agent's `camera.stop` rides the gateway's priority-stop lane beside
 * `scenario.cancel` and `play.stop` -- never queued behind a slow command, never rate-limited away -- while the
 * session's pairing and permission checks stand exactly as for any other command.
 */
async function paired(permissions: ("inspect" | "edit" | "test")[]) {
  const releases: (() => void)[] = [];
  const forwarded: string[] = [];
  const peer: PagePeer = {
    offer: async () => "",
    answer: async () => {},
    ice: async () => {},
    close: async () => {},
    request: async (r) => {
      forwarded.push(r.operation);
      if (r.operation !== "camera.stop")
        await new Promise<void>((resolve) => releases.push(resolve));
      return { requestId: r.requestId, revision: 0, outcome: "ok" };
    },
  };
  const s = new GatewayState({
    origins: ["http://localhost:5361"],
    peerFactory: () => peer,
  });
  const p = s.register("http://localhost:5361", {
    surface: "forge-editor",
    name: "Forge",
    build: "test",
  });
  s.attach("http://localhost:5361", p.pageToken, () => {});
  const pair = s.pair("a", p.invitation, permissions, "agent");
  await s.signal(p.targetId, {
    type: "approve",
    pendingId: pair.pendingId,
    permissions,
  });
  let n = 0;
  const request = (operation: string, args: unknown = {}) => ({
    version: 1,
    requestId: `r-${++n}`,
    sessionId: pair.sessionId,
    targetId: p.targetId,
    epoch: p.epoch,
    operation,
    args,
  });
  return { s, request, releases, forwarded };
}

describe("the camera stop's priority lane (R5-B)", () => {
  it("answers camera.stop while a slow command holds the queue and the rate budget is spent", async () => {
    const { s, request, releases, forwarded } = await paired(["inspect", "edit"]);
    try {
      // One slow read in flight, then the rest of the burst queued behind it.
      const slow = [s.command("a", request("forge.read"))];
      for (let i = 1; i < LIMITS.commandBurst; i++)
        slow.push(s.command("a", request("forge.read")));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        (await s.command("a", request("forge.read"))).code,
        "the budget is spent",
      ).toBe("RATE_LIMITED");
      const stop = await s.command("a", request("camera.stop"));
      expect(stop).toMatchObject({ outcome: "ok" });
      expect(forwarded).toContain("camera.stop");
      expect(forwarded.filter((o) => o === "forge.read")).toHaveLength(1);
      for (const release of releases.splice(0)) release();
      void Promise.allSettled(slow);          // the rest end with the session at close
    } finally {
      await s.close();
    }
  });
  it("keeps one stop in flight at a time, as the other stops", async () => {
    const releases: (() => void)[] = [];
    const peer: PagePeer = {
      offer: async () => "",
      answer: async () => {},
      ice: async () => {},
      close: async () => {},
      request: async (r) => {
        await new Promise<void>((resolve) => releases.push(resolve));
        return { requestId: r.requestId, revision: 0, outcome: "ok" };
      },
    };
    const s = new GatewayState({
      origins: ["http://localhost:5361"],
      peerFactory: () => peer,
    });
    try {
      const p = s.register("http://localhost:5361", {
        surface: "forge-editor",
        name: "Forge",
        build: "test",
      });
      s.attach("http://localhost:5361", p.pageToken, () => {});
      const pair = s.pair("a", p.invitation, ["edit"], "agent");
      await s.signal(p.targetId, {
        type: "approve",
        pendingId: pair.pendingId,
        permissions: ["edit"],
      });
      const r = (requestId: string) => ({
        version: 1,
        requestId,
        sessionId: pair.sessionId,
        targetId: p.targetId,
        epoch: p.epoch,
        operation: "camera.stop",
        args: {},
      });
      const first = s.command("a", r("one"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect((await s.command("a", r("two"))).code).toBe("STOP_IN_FLIGHT");
      for (const release of releases.splice(0)) release();
      expect(await first).toMatchObject({ outcome: "ok" });
    } finally {
      await s.close();
    }
  });
  it("leaves the permission check as it was: a test-only grant is refused camera.stop", async () => {
    const { s, request, forwarded } = await paired(["inspect", "test"]);
    try {
      expect((await s.command("a", request("camera.stop"))).code).toBe(
        "PERMISSION_DENIED",
      );
      expect(forwarded).toEqual([]);
    } finally {
      await s.close();
    }
  });
});
