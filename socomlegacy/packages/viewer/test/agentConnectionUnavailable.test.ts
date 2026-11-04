import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentConnection } from "../src/agent/connection";
import { LIMITS } from "@s2u/forge-agent-protocol";

/** LATER 438 (product track; 4d8e4d41e): a failed or unreadable registration answer is an error state with an honest message. */
function connect(fetch: (url: string, init: RequestInit) => Promise<Response>) {
  return createAgentConnection({
    gateway: "http://127.0.0.1:5360",
    target: {
      read: () => ({ surface: "forge-editor" as const, revision: 0, name: "Blank floor", build: "test" }),
      dispatch: async () => ({ requestId: "r", revision: 0, outcome: "ok" as const }),
    },
    fetch: vi.fn(fetch) as unknown as typeof globalThis.fetch,
    socket: () => { throw new Error("no socket for a failed registration"); },
  });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("LATER 438: the unavailable state's message", () => {
  it.each([
    [true, /npm run forge:agent/],
    [false, /^The connection service is not hosted for this page yet\.$/],
  ])("an unreachable service (development=%s): an error state, its guidance, no raw error text", async (development, says) => {
    vi.stubEnv("DEV", development);
    const connection = connect(async () => { throw new TypeError("ECONNREFUSED 127.0.0.1:5360"); });
    await expect(connection.prepare("codex")).rejects.toThrow(says);
    expect(connection.state().status).toBe("error");
    expect(connection.state().error).toMatch(says);
    expect(connection.state().error).not.toContain("ECONNREFUSED");
  });

  it("a 404 (no service at the address) on a release page: not hosted for this page yet", async () => {
    vi.stubEnv("DEV", false);
    const connection = connect(async () => new Response("Not found", { status: 404 }));
    await expect(connection.prepare("codex")).rejects.toThrow(/not hosted for this page yet/);
    expect(connection.state()).toMatchObject({ status: "error", error: "The connection service is not hosted for this page yet." });
  });

  it("an answer that is not JSON: the unreadable message, an error state", async () => {
    const connection = connect(async () => new Response("<html>proxy</html>", { status: 201 }));
    await expect(connection.prepare("codex")).rejects.toThrow(/unreadable/);
    expect(connection.state()).toMatchObject({ status: "error", error: "The connection service answered with something unreadable." });
  });

  // The review's F3 on acc7ee3a6: only a 404 says the service is not hosted; a hosted gateway that refuses says so.
  it.each([400, 403, 413])("a %i from a hosted gateway on a release page: refused, not unhosted", async (status) => {
    vi.stubEnv("DEV", false);
    const connection = connect(async () => new Response("{}", { status }));
    await expect(connection.prepare("codex")).rejects.toThrow(/refused this page's request/);
    expect(connection.state()).toMatchObject({ status: "error", error: "The connection service refused this page's request." });
  });

  // The review's F4 on acc7ee3a6: a body that stalls past the request's limit is a timeout, not an unreadable answer.
  it("a registration answer whose body stalls: did not answer in time, not unreadable", async () => {
    vi.stubEnv("DEV", false);
    vi.useFakeTimers();
    const connection = connect(async (_url, init) => ({
      ok: true, status: 201,
      json: () => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
    }) as unknown as Response);
    const failed = expect(connection.prepare("codex")).rejects.toThrow(/did not answer in time/);
    await vi.advanceTimersByTimeAsync(LIMITS.requestMs + 1);
    await failed;
    expect(connection.state()).toMatchObject({ status: "error", error: "The connection service did not answer in time. Try again shortly." });
  });
});
