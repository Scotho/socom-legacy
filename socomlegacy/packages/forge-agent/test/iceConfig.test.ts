import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PagePeer } from "../src/sessions.js";

/**
 * GW-F-1 (a browser adaptation, the gateway's deploy; product track): the gateway on a cloud box offers a reachable
 * candidate only with an ICE server (its server-reflexive address) and a fixed UDP range its firewall opens. The
 * operator's two settings, FORGE_AGENT_ICE_SERVERS and FORGE_AGENT_ICE_PORTS, become werift's `iceServers` and
 * `icePortRange` on every peer the gateway makes; both unset is exactly the earlier `{ iceServers: [] }`.
 */
const made = vi.hoisted(() => [] as unknown[][]);
vi.mock("../src/rtc.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/rtc.js")>();
  return {
    ...actual,
    createRtcPeer: (...args: unknown[]): PagePeer => {
      made.push(args);
      return {
        offer: async () => "offer",
        answer: async () => {},
        ice: async () => {},
        request: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok" }),
        close: async () => {},
      };
    },
  };
});
import { GatewayState, type StateConfig } from "../src/sessions.js";
import { createGateway } from "../src/gateway.js";
import { parseIceServers, parseIcePortRange, rtcConfigFromEnv } from "../src/rtc.js";

const ORIGIN = "http://localhost:5361";
/** Built, so the leak check never reads a credential URL as an address. */
const AT = "@";
async function approveOne(state: GatewayState): Promise<void> {
  const p = state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });
  state.attach(ORIGIN, p.pageToken, () => {});
  const pair = state.pair("a", p.invitation, ["inspect"], "agent");
  await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions: ["inspect"] });
}

describe("FORGE_AGENT_ICE_SERVERS", () => {
  it("unset or empty: no ICE server, as before", () => {
    expect(parseIceServers(undefined)).toEqual([]);
    expect(parseIceServers("")).toEqual([]);
  });
  it("a comma-separated list of stun:/turn:/turns: URLs, each one RTCIceServer", () => {
    expect(parseIceServers("stun:stun.cloudflare.com:3478")).toEqual([{ urls: "stun:stun.cloudflare.com:3478" }]);
    expect(parseIceServers(" stun:stun.cloudflare.com:3478 , turns:turn.example.org:5349,turn:turn.example.org")).toEqual([
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "turns:turn.example.org:5349" },
      { urls: "turn:turn.example.org" },
    ]);
  });
  it.each([
    ["credentials", `turn:user${AT}turn.example.org:3478`],
    ["credentials and a password", `turn:user:pw${AT}turn.example.org:3478`],
    ["a query", "turn:turn.example.org:3478?transport=tcp"],
    ["another scheme", "https://stun.cloudflare.com"],
    ["no host", "stun:"],
    ["port 0", "stun:stun.cloudflare.com:0"],
    ["a port past 65535", "stun:stun.cloudflare.com:70000"],
    ["an empty entry", "stun:stun.cloudflare.com:3478,"],
    ["a path", "stun:stun.cloudflare.com:3478/x"],
  ])("refuses %s", (_what, value) => {
    expect(() => parseIceServers(value)).toThrow("INVALID_ICE_SERVERS");
  });
});

describe("FORGE_AGENT_ICE_PORTS", () => {
  it("unset or empty: no range, as before", () => {
    expect(parseIcePortRange(undefined)).toBeUndefined();
    expect(parseIcePortRange("")).toBeUndefined();
  });
  it("min-max becomes werift's icePortRange", () => {
    expect(parseIcePortRange("40000-40100")).toEqual([40000, 40100]);
    expect(parseIcePortRange("1024-65535")).toEqual([1024, 65535]);
  });
  it.each([
    ["one port", "40000"],
    ["min equal to max (werift refuses it)", "40000-40000"],
    ["min under 1024", "1000-2000"],
    ["min over max", "50000-40000"],
    ["max past 65535", "40000-70000"],
    ["words", "a-b"],
    ["a fraction", "40000-40100.5"],
    ["a sign", "-1-5"],
    ["spaces inside", "40000 - 40100"],
  ])("refuses %s", (_what, value) => {
    expect(() => parseIcePortRange(value)).toThrow("INVALID_ICE_PORTS");
  });
});

describe("the gateway's peers take the configured ICE", () => {
  beforeEach(() => {
    made.length = 0;
  });
  it("both unset: exactly the earlier configuration", () => {
    expect(rtcConfigFromEnv({})).toEqual({ iceServers: [] });
  });
  it("both set: iceServers and icePortRange", () => {
    expect(
      rtcConfigFromEnv({ FORGE_AGENT_ICE_SERVERS: "stun:stun.cloudflare.com:3478", FORGE_AGENT_ICE_PORTS: "40000-40100" }),
    ).toEqual({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], icePortRange: [40000, 40100] });
  });
  it("a malformed setting refuses at start", () => {
    expect(() => rtcConfigFromEnv({ FORGE_AGENT_ICE_SERVERS: `turn:u${AT}turn.example.org` })).toThrow("INVALID_ICE_SERVERS");
    expect(() => rtcConfigFromEnv({ FORGE_AGENT_ICE_PORTS: "40000-40000" })).toThrow("INVALID_ICE_PORTS");
  });
  it("the session's peer is made with the state's rtcConfig", async () => {
    const rtcConfig = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], icePortRange: [40000, 40100] as [number, number] };
    const state = new GatewayState({ origins: [ORIGIN], rtcConfig } satisfies StateConfig);
    await approveOne(state);
    expect(made).toHaveLength(1);
    expect(made[0]![1]).toEqual(rtcConfig);
    await state.close();
  });
  it("without one, the peer's own default stands ({ iceServers: [] })", async () => {
    const state = new GatewayState({ origins: [ORIGIN] });
    await approveOne(state);
    expect(made).toHaveLength(1);
    expect(made[0]![1]).toBeUndefined();
    await state.close();
  });
  it("createGateway hands its rtcConfig to the session's peer", async () => {
    const rtcConfig = rtcConfigFromEnv({ FORGE_AGENT_ICE_SERVERS: "stun:stun.cloudflare.com:3478", FORGE_AGENT_ICE_PORTS: "40000-40100" });
    const g = createGateway({ issuer: "http://localhost:5360", development: true, origins: [ORIGIN], rtcConfig });
    try {
      await approveOne(g.state);
      expect(made).toHaveLength(1);
      expect(made[0]![1]).toEqual({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], icePortRange: [40000, 40100] });
    } finally {
      await g.close();
    }
  });
});
