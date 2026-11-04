import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentConnection } from "../src/agent/connection";
import { LIMITS } from "@s2u/forge-agent-protocol";

/** LATER 437 (product track): a registration answer that is not a connection is an error state worded by its cause. */
function connect(fetch: (url: string, init: RequestInit) => Promise<Response>) {
  const sockets: unknown[] = [];
  const connection = createAgentConnection({
    gateway: "http://127.0.0.1:5360",
    target: {
      read: () => ({ surface: "forge-editor" as const, revision: 0, name: "Blank floor", build: "test" }),
      dispatch: async () => ({ requestId: "r", revision: 0, outcome: "ok" as const }),
    },
    fetch: vi.fn(fetch) as unknown as typeof globalThis.fetch,
    socket: () => {
      sockets.push(1);
      return { readyState: 0, addEventListener: () => undefined, close: () => undefined } as unknown as WebSocket;
    },
  });
  return { connection, sockets };
}
const answer = (body: string, status: number) => async () => new Response(body, { status });

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("the registration answer's error states", () => {
  it.each([
    ["an empty object", "{}"],
    ["an array", "[]"],
    ["null", "null"],
    ["an expired registration", JSON.stringify({ targetId: "t", pageToken: "p", epoch: "e", invitation: "i", expiresAt: 1 })],
  ])("LATER 437: valid JSON of the wrong shape (%s) leaves Preparing for an error state", async (_name, body) => {
    const r = connect(answer(body, 201));
    await expect(r.connection.prepare("codex")).rejects.toThrow(/invalid connection/i);
    expect(r.connection.state().status).toBe("error");
    expect(r.connection.state().error).toMatch(/invalid connection/i);
    expect(r.sockets).toHaveLength(0);
  });

  it.each([true, false])("LATER 437: a 429 from the service is busy, not unhosted (development=%s)", async (development) => {
    vi.stubEnv("DEV", development);
    const r = connect(answer("{}", 429));
    await expect(r.connection.prepare("codex")).rejects.toThrow();
    expect(r.connection.state()).toMatchObject({ status: "error" });
    expect(r.connection.state().error).toMatch(/busy.*try again/i);
    expect(r.connection.state().error).not.toMatch(/not hosted|npm run forge:agent/);
  });

  it.each([500, 502, 503])("LATER 437: a %i from the service is unavailable for now, not unhosted", async (status) => {
    vi.stubEnv("DEV", false);
    const r = connect(answer("{}", status));
    await expect(r.connection.prepare("codex")).rejects.toThrow();
    expect(r.connection.state()).toMatchObject({ status: "error" });
    expect(r.connection.state().error).toMatch(/unavailable.*try again/i);
    expect(r.connection.state().error).not.toMatch(/not hosted/);
  });

  it("LATER 437: a registration that times out says so, not unhosted", async () => {
    vi.stubEnv("DEV", false);
    vi.useFakeTimers();
    const r = connect((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const prepared = r.connection.prepare("codex");
    const failed = expect(prepared).rejects.toThrow(/did not answer in time/i);
    await vi.advanceTimersByTimeAsync(LIMITS.requestMs + 1);
    await failed;
    expect(r.connection.state()).toMatchObject({ status: "error" });
    expect(r.connection.state().error).not.toMatch(/not hosted/);
  });

  it("a 404 or an unreachable service on a release page is still not hosted for this page yet", async () => {
    vi.stubEnv("DEV", false);
    for (const fetch of [answer("{}", 404), async () => { throw new TypeError("Failed to fetch"); }]) {
      const r = connect(fetch);
      await expect(r.connection.prepare("codex")).rejects.toThrow(/not hosted/);
      expect(r.connection.state()).toMatchObject({ status: "error" });
    }
  });
});
