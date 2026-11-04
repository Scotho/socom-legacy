import { it, expect, vi } from "vitest";
import WebSocket from "ws";
import { createGateway } from "../src/gateway.js";
import { freePort } from "./ports.js";
const open = (url: string, protocols: string[], origin: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, protocols, { origin });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
const next = (ws: WebSocket) =>
  new Promise<Record<string, unknown>>((resolve) =>
    ws.once("message", (data) => resolve(JSON.parse(data.toString()))),
  );
it("serializes an answer and its immediately following trickle ICE without dropping the page", async () => {
  let release!: () => void, answerStarted!: () => void;
  const entered = new Promise<void>((resolve) => (answerStarted = resolve));
  let gotIce = false;
  const port = await freePort();
  const g = createGateway({
    issuer: `http://127.0.0.1:${port}`,
    origins: ["http://localhost:5361"],
    development: true,
    peerFactory: () => ({
      offer: async () => "offer",
      answer: async () => {
        answerStarted();
        await new Promise<void>((resolve) => (release = resolve));
      },
      ice: async () => {
        gotIce = true;
      },
      request: async (r) => ({
        requestId: r.requestId,
        revision: 0,
        outcome: "ok",
      }),
      close: async () => {},
    }),
  });
  await g.listen(port);
  let ws: WebSocket | undefined;
  try {
    const p = g.state.register("http://localhost:5361", {
      surface: "forge-editor",
      name: "Forge",
      build: "test",
    });
    ws = await open(
      `ws://127.0.0.1:${port}/signal`,
      ["s2u-agent-v1", `auth.${p.pageToken}`],
      "http://localhost:5361",
    );
    const pendingMessage = next(ws),
      pair = g.state.pair("g", p.invitation, ["inspect"], "client");
    await pendingMessage;
    const offer = next(ws);
    ws.send(
      JSON.stringify({
        type: "approve",
        pendingId: pair.pendingId,
        permissions: ["inspect"],
      }),
    );
    await offer;
    const binding = {
      sessionId: pair.sessionId,
      targetId: p.targetId,
      epoch: p.epoch,
    };
    ws.send(JSON.stringify({ type: "answer", ...binding, sdp: "answer" }));
    ws.send(
      JSON.stringify({
        type: "ice",
        ...binding,
        candidate: { candidate: "test" },
      }),
    );
    await entered;
    release();
    await vi.waitFor(() => expect(gotIce).toBe(true));
    expect(ws.readyState).toBe(WebSocket.OPEN);
  } finally {
    ws?.terminate();
    await g.close();
  }
});
it("signaling authenticates page origin/protocol and refuses command fallback or foreign SDP", async () => {
  const port = await freePort();
  const g = createGateway({
    issuer: `http://127.0.0.1:${port}`,
    origins: ["http://localhost:5361"],
    development: true,
  });
  await g.listen(port);
  let ws: WebSocket | undefined;
  try {
    const p = await (
      await fetch(`http://127.0.0.1:${port}/api/v1/targets`, {
        method: "POST",
        headers: {
          Origin: "http://localhost:5361",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          surface: "forge-editor",
          name: "Forge",
          build: "test",
        }),
      })
    ).json();
    await expect(
      open(
        `ws://127.0.0.1:${port}/signal`,
        ["s2u-agent-v1", `auth.${p.pageToken}`],
        "http://evil.test",
      ),
    ).rejects.toThrow();
    await expect(
      open(
        `ws://127.0.0.1:${port}/signal?token=${p.pageToken}`,
        ["s2u-agent-v1", `auth.${p.pageToken}`],
        "http://localhost:5361",
      ),
    ).rejects.toThrow();
    ws = await open(
      `ws://127.0.0.1:${port}/signal`,
      ["s2u-agent-v1", `auth.${p.pageToken}`],
      "http://localhost:5361",
    );
    expect(ws.protocol).toBe("s2u-agent-v1");
    const incoming = next(ws);
    const pending = g.state.pair(
      "guest",
      p.invitation,
      ["inspect"],
      "Claimed client",
    );
    expect(await incoming).toMatchObject({
      type: "pending",
      pendingId: pending.pendingId,
    });
    const closed = new Promise<number>((resolve) =>
      ws!.once("close", (code) => resolve(code)),
    );
    ws.send(
      JSON.stringify({ type: "request", request: { operation: "eval" } }),
    );
    expect(await closed).toBe(4003);
    // The server clears the session in its own close handler, after the client sees the close: wait for it (2 s cap).
    for (let i = 0; i < 200 && g.state.status("guest").sessions.length > 0; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(g.state.status("guest").sessions).toEqual([]);
  } finally {
    ws?.terminate();
    await g.close();
  }
});
it("OAuth HTTP discovery, guest consent and PKCE token exchange use the SDK router", async () => {
  const port = await freePort();
  const g = createGateway({
    issuer: `http://127.0.0.1:${port}`,
    origins: [],
    development: true,
  });
  await g.listen(port);
  try {
    const metadata = await (
      await fetch(
        `http://127.0.0.1:${port}/.well-known/oauth-authorization-server`,
      )
    ).json();
    expect(metadata.code_challenge_methods_supported).toContain("S256");
    const registration = await (
      await fetch(metadata.registration_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:8888/cb"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
          client_name: "Test guest",
        }),
      })
    ).json();
    expect(registration.client_id).toBeTruthy();
    const verifier = "a".repeat(43);
    const { createHash } = await import("node:crypto");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorization = new URL(metadata.authorization_endpoint);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: registration.client_id,
      redirect_uri: "http://localhost:8888/cb",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: `http://127.0.0.1:${port}/mcp`,
      state: "client-state",
    }))
      authorization.searchParams.set(k, v);
    const consent = await fetch(authorization),
      html = await consent.text(),
      cookie = consent.headers.get("set-cookie")!.split(";")[0]!;
    expect(html).toContain("Continue as a guest");
    const id = /name="id" value="([^"]+)"/.exec(html)![1]!,
      csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;
    const approved = await fetch(`http://127.0.0.1:${port}/guest/consent`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: `http://127.0.0.1:${port}`,
        Cookie: cookie,
      },
      body: new URLSearchParams({ id, csrf, decision: "approve" }),
    });
    expect(approved.status).toBe(302);
    const redirect = new URL(approved.headers.get("location")!);
    expect(redirect.searchParams.get("state")).toBe("client-state");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registration.client_id,
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
      redirect_uri: "http://localhost:8888/cb",
      resource: `http://127.0.0.1:${port}/mcp`,
    });
    const exchange = await fetch(metadata.token_endpoint, {
      method: "POST",
      body,
    });
    expect(exchange.status).toBe(200);
    const token = await exchange.json();
    expect(
      (await g.oauth.verifyAccessToken(token.access_token)).scopes,
    ).toEqual(["bootstrap"]);
    expect(
      (await fetch(metadata.token_endpoint, { method: "POST", body })).status,
    ).toBe(400);
  } finally {
    await g.close();
  }
});
