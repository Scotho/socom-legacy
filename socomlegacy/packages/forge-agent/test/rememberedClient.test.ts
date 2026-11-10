import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SignalToPage } from "@s2u/forge-agent-protocol";
import { GatewayState } from "../src/sessions.js";
import { GuestOAuth } from "../src/oauth.js";
import { createGateway } from "../src/gateway.js";

// AX-10 (a browser adaptation, AX.R8): the `pending` signal's optional `gatewayClientId` -- the pairing principal's
// registered OAuth client, so the page can match a remembered agent by more than its self-reported name.
const ORIGIN = "http://localhost:5361";
const RESOURCE = "http://127.0.0.1:5361/mcp";
type Pending = Extract<SignalToPage, { type: "pending" }>;

function page(state: GatewayState) {
  const p = state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });
  const sent: SignalToPage[] = [];
  state.attach(ORIGIN, p.pageToken, (m) => sent.push(m));
  return { ...p, sent, pending: () => sent.find((m) => m.type === "pending") as Pending | undefined };
}

async function consent(oauth: GuestOAuth) {
  const client = await oauth.clientsStore.registerClient!({
    redirect_uris: ["http://127.0.0.1:5369/callback"],
    token_endpoint_auth_method: "none",
  });
  const verifier = "v".repeat(43),
    codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  const code = oauth.issueCode(client, { codeChallenge, redirectUri: client.redirect_uris[0]!, resource: new URL(RESOURCE) });
  const tokens = await oauth.exchangeAuthorizationCode(client, code, verifier, client.redirect_uris[0], new URL(RESOURCE));
  const info = await oauth.verifyAccessToken(tokens.access_token);
  return { clientId: client.client_id, principal: String(info.extra!.principalId) };
}

describe("AX-10 the pending signal's gateway client id", () => {
  it("carries the pairing principal's registered client id when the gateway knows it", async () => {
    const state = new GatewayState({ origins: [ORIGIN], clientIdOf: (p) => (p === "a" ? "client-a" : undefined) });
    const p = page(state);
    state.pair("a", p.invitation, ["inspect"], "Claude Code");
    expect(p.pending()).toMatchObject({ clientName: "Claude Code", gatewayClientId: "client-a" });
    await state.close();
  });

  it("leaves the field out when the principal has no registered client (additive on the wire)", async () => {
    for (const state of [new GatewayState({ origins: [ORIGIN] }), new GatewayState({ origins: [ORIGIN], clientIdOf: () => undefined })]) {
      const p = page(state);
      state.pair("a", p.invitation, ["inspect"], "agent");
      expect(p.pending()).toBeDefined();
      expect("gatewayClientId" in p.pending()!).toBe(false);
      await state.close();
    }
  });

  it("drops a client id that is not a bounded identifier", async () => {
    const state = new GatewayState({ origins: [ORIGIN], clientIdOf: () => "x".repeat(300) });
    const p = page(state);
    state.pair("a", p.invitation, ["inspect"], "agent");
    expect("gatewayClientId" in p.pending()!).toBe(false);
    await state.close();
  });

  it("GuestOAuth names the client a consent's principal was issued to, and nothing for an unknown principal", async () => {
    const oauth = new GuestOAuth(new URL(RESOURCE));
    const a = await consent(oauth), b = await consent(oauth);
    expect(oauth.clientIdOf(a.principal)).toBe(a.clientId);
    expect(oauth.clientIdOf(b.principal)).toBe(b.clientId);
    expect(oauth.clientIdOf("nobody")).toBeUndefined();
    expect(oauth.clientIdOf("")).toBeUndefined();
  });

  it("the gateway fills it from its own OAuth provider", async () => {
    const g = createGateway({ issuer: "http://127.0.0.1:5361", origins: [ORIGIN], development: true });
    try {
      const { clientId, principal } = await consent(g.oauth);
      const p = page(g.state);
      g.state.pair(principal, p.invitation, ["inspect", "edit"], "Codex");
      expect(p.pending()).toMatchObject({ clientName: "Codex", gatewayClientId: clientId });
    } finally {
      await g.close();
    }
  });
});
