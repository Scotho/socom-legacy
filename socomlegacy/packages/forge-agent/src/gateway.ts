import express from "express";
import { createServer, type IncomingMessage } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { WebSocketServer, WebSocket } from "ws";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LIMITS, object, type SignalToPage } from "@s2u/forge-agent-protocol";
import { CONSENT_STYLE, CONSENT_STYLE_HASH, GuestOAuth } from "./oauth.js";
import { GatewayState, refusal, type StateConfig } from "./sessions.js";
import { createMcpServer, fullSchema } from "./mcp.js";
export interface GatewayConfig extends StateConfig {
  issuer: string;
  development?: boolean;
  /** Browser adaptation (gateway policy): reverse-proxy hops whose X-Forwarded-For entries are trusted; 0 ignores the header. */
  trustedProxies?: number;
  /** Browser adaptation (gateway policy): registered OAuth clients one client address may hold (default 32). */
  maxClientsPerAddress?: number;
  /** Browser adaptation (gateway policy): live bootstrap tokens one client address may hold (default 32). */
  maxTokensPerAddress?: number;
  /**
   * AX-11 (a browser adaptation, gateway policy): the file that keeps OAuth clients and token hashes across a restart
   * (`FORGE_AGENT_STATE_FILE`). Unset: in memory only, the development default. Pairings and sessions are never kept.
   */
  stateFile?: string;
}
/** AX-U: the join route's bound on its one parameter, the protocol's identifier form (`identifier`). */
const JOIN_INVITATION = /^[A-Za-z0-9_.:-]{1,128}$/;
/** AX-U: the join page's CSP -- the consent page's style (its one inline sheet by hash), no form, no frames. */
const JOIN_HTML_CSP = `default-src 'none'; style-src 'sha256-${CONSENT_STYLE_HASH}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`;
const JOIN_PLAIN_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
/** AX-U (C6): the join link's words for an agent (text/plain): what to call, with what, and where. */
export function joinText(issuer: string): string {
  return [
    "SOCOM 2 Legacy: a player's connect link for their Forge or test room page.",
    "",
    "If you are the agent: call agent_pair with this link (the whole URL) on the socom2legacy MCP server.",
    "The permissions default to all; the player can turn any off on their page, then presses Allow there.",
    "Call agent_guide first if you have not yet; once paired, call agent_capabilities, then agent_request target.status.",
    `MCP endpoint: ${issuer}/mcp`,
    "",
    "If you are the player: paste this link into your agent, then approve it on your page.",
    "The link works once and expires after a few minutes.",
    "",
  ].join("\n");
}
/** AX-U (C6): the same words as a short page for a person (text/html), in the consent page's sheet. */
function joinPage(issuer: string): string {
  const mcp = `${issuer}/mcp`.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connect your agent</title><style>${CONSENT_STYLE}</style></head><body><main><p class="kicker">Connect your agent</p><h1>This is a SOCOM 2 Legacy connect link</h1><p>Paste it into your AI agent. Then approve it on your Forge or test room page.</p><p class="hint">For the agent: call agent_pair with this link on the socom2legacy MCP server. The permissions default to all; the player can turn any off before pressing Allow. Call agent_guide first if you have not yet.</p><p class="hint">MCP endpoint</p><code>${mcp}</code><p class="hint">The link works once and expires after a few minutes.</p></main></body></html>`;
}
export function createGateway(config: GatewayConfig) {
  const issuer = new URL(config.issuer);
  if (
    issuer.pathname !== "/" ||
    issuer.search ||
    issuer.hash ||
    issuer.username ||
    issuer.password
  )
    throw Error("INVALID_ISSUER");
  if (config.development) {
    if (
      issuer.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(issuer.hostname)
    )
      throw Error("DEVELOPMENT_REQUIRES_LOOPBACK");
  } else if (
    issuer.protocol !== "https:" ||
    !config.origins.length ||
    config.origins.some((o) => new URL(o).protocol !== "https:")
  )
    throw Error("PRODUCTION_REQUIRES_TLS_ORIGINS");
  for (const origin of config.origins)
    if (new URL(origin).origin !== origin) throw Error("EXACT_ORIGIN_REQUIRED");
  const hops = config.trustedProxies ?? 0;
  if (!Number.isSafeInteger(hops) || hops < 0) throw Error("INVALID_TRUSTED_PROXIES");
  if (!config.development && hops === 0)
    console.warn(
      "Forge agent gateway: FORGE_AGENT_TRUSTED_PROXIES is 0, so behind a TLS edge every client shares one per-address budget",
    );
  /** Browser adaptation (gateway policy): the client address keying the per-address budgets, X-Forwarded-For only from trusted hops. */
  const clientAddress = (req: IncomingMessage): string => {
    const socket = req.socket.remoteAddress ?? "unknown";
    if (hops === 0) return socket;
    const header = req.headers["x-forwarded-for"],
      entries = (Array.isArray(header) ? header.join(",") : (header ?? "")).split(",");
    return (entries.length >= hops ? entries[entries.length - hops]!.trim() : "") || socket;
  };
  /** The request's client address for the SDK's OAuth handlers, which do not see the request (LATER 429). */
  const requestAddress = new AsyncLocalStorage<string>();
  const base = issuer.origin,
    state = new GatewayState({
      ...config,
      publicCandidatesOnly: config.publicCandidatesOnly ?? !config.development,
      // AX-10: the pending signal's `gatewayClientId`, from this gateway's own OAuth grants (read at pairing time).
      clientIdOf: config.clientIdOf ?? ((principal) => oauth.clientIdOf(principal)),
    }),
    oauth = new GuestOAuth(
      new URL("/mcp", issuer),
      config.now,
      (principal) => state.revokePrincipal(principal),
      {
        address: () => requestAddress.getStore() ?? "in-process",
        clientsPerAddress: config.maxClientsPerAddress,
        tokensPerAddress: config.maxTokensPerAddress,
      },
      { stateFile: config.stateFile },
    ),
    app = express(),
    server = createServer(app);
  server.maxConnections = 256;
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  const rates = new Map<string, { tokens: number; last: number }>();
  const now = config.now ?? Date.now;
  let globalTokens = 200,
    globalLast = now(),
    activeMcp = 0,
    closing = false;
  /** One token from the global and the address's bucket; false when either is empty or the address table is full. */
  const admit = (key: string): boolean => {
    const n = now();
    globalTokens = Math.min(200, globalTokens + (n - globalLast) * 0.1);
    globalLast = n;
    let rate = rates.get(key);
    if (!rate) {
      if (rates.size >= 1024) return false;
      rate = { tokens: 60, last: n };
      rates.set(key, rate);
    }
    rate.tokens = Math.min(60, rate.tokens + (n - rate.last) * 0.01);
    rate.last = n;
    if (rate.tokens < 1 || globalTokens < 1) return false;
    rate.tokens--;
    globalTokens--;
    return true;
  };
  app.disable("x-powered-by");
  // The SDK's limiters validate express's proxy setting; the same hops as clientAddress (LATER 428).
  if (hops > 0) app.set("trust proxy", hops);
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.get("origin");
    if (origin && origin !== base && !config.origins.includes(origin)) {
      res.status(403).json({ code: "ORIGIN_DENIED" });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    if (closing) {
      res.sendStatus(503);
      return;
    }
    let host: string | undefined;
    try {
      host = new URL(`http://${req.headers.host ?? ""}`).hostname;
    } catch {}
    if (
      !host ||
      !(
        config.development
          ? [issuer.hostname, "127.0.0.1", "localhost", "[::1]"]
          : [issuer.hostname]
      ).includes(host)
    ) {
      res.status(403).json({ code: "HOST_DENIED" });
      return;
    }
    if (!admit(clientAddress(req))) {
      res.sendStatus(429);
      return;
    }
    next();
  });
  app.use(express.json({ limit: LIMITS.controlBytes, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: LIMITS.controlBytes }));
  // After the body parsers: their stream callbacks would not carry the store.
  app.use((req, _res, next) => requestAddress.run(clientAddress(req), next));
  oauth.mount(app);
  /** Browser adaptation (gateway policy): the SDK's /authorize, /register, /token and /revoke limiters key on clientAddress (LATER 428). */
  const rateLimit = { keyGenerator: (req: IncomingMessage) => clientAddress(req) };
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: issuer,
      resourceServerUrl: new URL("/mcp", issuer),
      scopesSupported: ["bootstrap"],
      resourceName: "SOCOM 2 Legacy Forge bootstrap",
      authorizationOptions: { rateLimit },
      clientRegistrationOptions: { rateLimit },
      tokenOptions: { rateLimit },
      revocationOptions: { rateLimit },
    }),
  );
  const auth = requireBearerAuth({
    verifier: oauth,
    requiredScopes: ["bootstrap"],
    expectedResource: new URL("/mcp", issuer),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
      new URL("/mcp", issuer),
    ),
  });
  const principal = (req: express.Request) =>
    String(req.auth?.extra?.principalId ?? "");
  app.get("/health", (_req, res) => res.json({ ok: !closing }));
  // AX-U (C6; a browser adaptation, FG.R2): the page's one copied line carries `<issuer>/join/<invitation>`. Opened by a
  // person or fetched by an agent, it answers the same short words: what the link is, what to call, the MCP endpoint.
  // It never reads, validates, spends or reveals the invitation -- no state lookup, nothing echoed: a link the gateway
  // never issued gets the same page as a live one. Only the form is bounded (the protocol's identifier).
  app.get("/join/:invitation", (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("Vary", res.getHeader("Vary") ? `${res.getHeader("Vary")}, Accept` : "Accept");
    const html = /\btext\/html\b/i.test(req.get("accept") ?? "");
    if (!JOIN_INVITATION.test(String(req.params.invitation))) {
      res.setHeader("Content-Security-Policy", JOIN_PLAIN_CSP);
      res.status(400).type("text/plain").send("This is not a SOCOM 2 Legacy connect link.\n");
      return;
    }
    if (html) {
      res.setHeader("Content-Security-Policy", JOIN_HTML_CSP);
      res.type("html").send(joinPage(base));
    } else {
      res.setHeader("Content-Security-Policy", JOIN_PLAIN_CSP);
      res.type("text/plain").send(joinText(base));
    }
  });
  // AX-1 (contract C1): the summary and, beside it, the full operation manual, before pairing.
  app.get("/api/v1/schema", (_req, res) => res.json(fullSchema(state, base)));
  app.post("/api/v1/targets", (req, res) => {
    try {
      const p = state.register(
        req.get("origin") ?? "",
        req.body,
        clientAddress(req),
      );
      res.status(201).json(p);
    } catch (e) {
      res.status(403).json({ code: (e as Error).message });
    }
  });
  app.post("/api/v1/commands", auth, async (req, res) =>
    res.json(await state.command(principal(req), req.body)),
  );
  app.get("/api/v1/status", auth, (req, res) =>
    res.json(state.status(principal(req))),
  );
  // AX-3 (C4): the REST mirror of agent_pair -- a join link or invitation, optional permissions, clientName and
  // waitSeconds; it holds until the page answers or the wait ends. `POST /api/v1/wait` mirrors agent_wait.
  app.post("/api/v1/pair", auth, async (req, res) => {
    try {
      const b = object(req.body);
      if (b.clientName !== undefined && typeof b.clientName !== "string")
        throw Error("INVALID_PAIR");
      res.json(
        await state.pairAndWait(
          principal(req),
          b.invitation,
          b.permissions,
          b.clientName,
          b.waitSeconds,
          clientAddress(req),
        ),
      );
    } catch (e) {
      res.status(400).json(refusal((e as Error).message));
    }
  });
  app.post("/api/v1/wait", auth, async (req, res) => {
    try {
      const b = object(req.body);
      if (typeof b.sessionId !== "string") throw Error("INVALID_SESSION");
      res.json(await state.wait(principal(req), b.sessionId, b.waitSeconds));
    } catch (e) {
      res.status(400).json(refusal((e as Error).message));
    }
  });
  // AX-14: the REST mirror of agent_notes -- the caller's session's notes from the page, returned and delivered.
  app.post("/api/v1/notes", auth, (req, res) => {
    try {
      const b = object(req.body ?? {});
      res.json(state.notes(principal(req), b.sessionId));
    } catch (e) {
      res.status(400).json(refusal((e as Error).message));
    }
  });
  app.post("/api/v1/disconnect", auth, async (req, res) => {
    try {
      const b = object(req.body);
      if (typeof b.sessionId !== "string") throw Error("INVALID_SESSION");
      res.json(await state.disconnect(principal(req), b.sessionId));
    } catch (e) {
      res.status(400).json({ code: (e as Error).message });
    }
  });
  app.post("/mcp", auth, async (req, res) => {
    if (activeMcp >= 64) {
      res.sendStatus(503);
      return;
    }
    activeMcp++;
    const mcp = createMcpServer(state, principal(req), base, clientAddress(req)),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      activeMcp--;
      await mcp.close();
    }
  });
  app.all("/mcp", auth, (_req, res) =>
    res.status(405).json({ code: "METHOD_NOT_ALLOWED" }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status((err as { status?: number })?.status === 413 ? 413 : 400)
        .json({ code: "INVALID_REQUEST" });
    },
  );
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: LIMITS.controlBytes,
    handleProtocols: (protocols) =>
      protocols.has("s2u-agent-v1") ? "s2u-agent-v1" : false,
  });
  const alive = new Map<WebSocket, boolean>();
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin,
      protocols =
        req.headers["sec-websocket-protocol"]
          ?.split(",")
          .map((p) => p.trim()) ?? [],
      authProtocol = protocols.find((p) => p.startsWith("auth."));
    if (
      closing ||
      req.url !== "/signal" ||
      !origin ||
      !config.origins.includes(origin) ||
      !authProtocol ||
      authProtocol.length > 160 ||
      !protocols.includes("s2u-agent-v1") ||
      wss.clients.size >= 128
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    // Browser adaptation (gateway policy): a signaling upgrade spends the same per-address and global tokens as HTTP.
    if (!admit(clientAddress(req))) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let attached: { targetId: string; detach: () => void };
      try {
        attached = state.attach(
          origin,
          authProtocol.slice(5),
          (message: SignalToPage) => {
            if (
              ws.readyState === WebSocket.OPEN &&
              ws.bufferedAmount < LIMITS.controlBytes
            )
              ws.send(JSON.stringify(message));
            else ws.close(4008, "BACKPRESSURE");
          },
        );
      } catch {
        ws.close(4003, "PAGE_AUTH_DENIED");
        return;
      }
      alive.set(ws, true);
      ws.on("pong", () => alive.set(ws, true));
      let signalPending = 0,
        signalChain = Promise.resolve();
      ws.on("message", (raw) => {
        if (signalPending >= 16) {
          ws.close(4008, "SIGNAL_QUEUE_FULL");
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          ws.close(4003, "SIGNAL_DENIED");
          return;
        }
        // Page revocation has priority even while SDP processing is waiting on ICE/DTLS. AX-12: the page's diagnosis,
        // sent just before its revoke, rides the same lane so it is read before the revoke ends the target. AX-9: so does
        // a pagehide, which the socket's close follows at once -- handled first, the grant is kept resumable before the
        // close revokes it.
        // RC1 (088766214, shadow's GPU view): a surface change and a note carry no SDP and take no await, so they ride
        // this lane too -- in the queue they waited behind a trickle-ICE step the peer had not settled, and the gateway
        // kept refusing Play operations on a page already in Play.
        const kind = (message as { type?: unknown })?.type;
        if (kind === "revoke" || kind === "diagnosis" || kind === "pagehide" || kind === "surface" || kind === "note") {
          void state
            .signal(attached.targetId, message)
            .catch(() => ws.close(4003, "SIGNAL_DENIED"));
          return;
        }
        signalPending++;
        signalChain = signalChain
          .then(async () => {
            if (ws.readyState !== WebSocket.OPEN) return;
            await state.signal(attached.targetId, message);
          })
          .catch(() => ws.close(4003, "SIGNAL_DENIED"))
          .finally(() => {
            signalPending--;
          });
      });
      ws.on("close", () => {
        alive.delete(ws);
        attached.detach();
      });
      ws.on("error", () => ws.close());
    });
  });
  const sweep = setInterval(() => {
    state.sweep();
    for (const [ws, live] of alive) {
      if (!live) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
    const n = now();
    for (const [key, r] of rates) if (n - r.last > 60000) rates.delete(key);
  }, 15000);
  sweep.unref();
  return {
    app,
    server,
    state,
    oauth,
    async listen(port: number, host = "127.0.0.1") {
      if (config.development && !["127.0.0.1", "::1"].includes(host))
        throw Error("DEVELOPMENT_REQUIRES_LOOPBACK");
      // Browser adaptation (gateway policy): trusted hops mean the edge is on this host; on a bind a client reaches
      // directly, it would write the X-Forwarded-For entry that keys its own budgets (LATER 431).
      if (hops > 0 && !["127.0.0.1", "::1", "localhost"].includes(host))
        throw Error("TRUSTED_PROXIES_REQUIRE_LOOPBACK");
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    async close() {
      closing = true;
      clearInterval(sweep);
      await state.close();
      oauth.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      if (server.listening) {
        server.closeIdleConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
      }
      rates.clear();
    },
  };
}
