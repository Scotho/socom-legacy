import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response, Express } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidTokenError,
  InvalidRequestError,
  UnsupportedGrantTypeError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { LIMITS } from "@s2u/forge-agent-protocol";
const digest = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
const random = () => randomBytes(32).toString("base64url");
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/**
 * Browser adaptation (the agent gateway's OAuth): the one canonical form of the RFC 8707 resource a client names.
 * The MCP endpoint `${origin}/mcp` is the same resource with or without ONE trailing slash (the MCP authorization
 * spec's canonical-URI guidance; a native Claude Code client sends the slashed form), and nothing else is: the
 * origin must match exactly, the path must be `/mcp` or `/mcp/`, and no query, fragment or userinfo (not even an
 * empty `?` or `#`). Returns `${origin}/mcp`, or null for any other resource.
 */
export function canonicalResource(
  raw: URL | string | undefined,
  origin: string,
): string | null {
  if (raw === undefined) return null;
  let href: string;
  try {
    href = new URL(raw).href;
  } catch {
    return null;
  }
  const canonical = `${origin}/mcp`;
  return href === canonical || href === `${canonical}/` ? canonical : null;
}
/** Browser adaptation (gateway policy): the per-address budgets on registered clients and live tokens (LATER 429). */
export interface GuestBudget {
  /** The client address of the request in progress; in-process callers share one budget. */
  address?: () => string;
  /** Registered clients one address may hold (default 32, above the SDK limiter's 20 registrations an hour). */
  clientsPerAddress?: number;
  /** Live bootstrap tokens one address may hold (default 32). */
  tokensPerAddress?: number;
}
/** Ephemeral guests have only bootstrap scope. Each consent creates a separate grant principal. */
export class GuestOAuth implements OAuthServerProvider {
  readonly skipLocalPkceValidation = true; // Provider verifies PKCE so direct and SDK exchanges share the same checks.
  private clients = new Map<
    string,
    { client: OAuthClientInformationFull; address: string; expires: number }
  >();
  private codes = new Map<
    string,
    {
      client: string;
      params: AuthorizationParams;
      principal: string;
      expires: number;
    }
  >();
  private tokens = new Map<
    string,
    { info: AuthInfo; address: string; expires: number }
  >();
  private consents = new Map<
    string,
    {
      client: OAuthClientInformationFull;
      params: AuthorizationParams;
      csrfHash: string;
      expires: number;
    }
  >();
  readonly clientsStore = {
    getClient: (id: string) => {
      this.sweep();
      return this.clients.get(id)?.client;
    },
    registerClient: (
      input: Omit<
        OAuthClientInformationFull,
        "client_id" | "client_id_issued_at"
      >,
    ) => {
      this.sweep();
      if (this.clients.size >= 512)
        throw new InvalidRequestError("Registration capacity");
      const address = this.address();
      if (
        this.held(this.clients, address) >=
        (this.budget.clientsPerAddress ?? 32)
      )
        throw new InvalidRequestError("Registration address capacity");
      if (
        input.token_endpoint_auth_method !== "none" ||
        !input.redirect_uris.length ||
        input.redirect_uris.length > 8 ||
        input.redirect_uris.some((uri) => !this.validRedirect(uri))
      )
        throw new InvalidRequestError(
          "Public clients require HTTPS or loopback redirect URIs",
        );
      const client = {
        ...input,
        client_id: random(),
        client_id_issued_at: Math.floor(this.now() / 1000),
      };
      this.clients.set(client.client_id, {
        client,
        address,
        expires: this.now() + 24 * 60 * 60 * 1000,
      });
      return client;
    },
  };
  constructor(
    readonly resource: URL,
    private now: () => number = Date.now,
    private onRevoke: (principal: string) => void = () => {},
    private budget: GuestBudget = {},
  ) {}
  private address() {
    return this.budget.address?.() ?? "in-process";
  }
  private held(map: Map<string, { address: string }>, address: string) {
    let n = 0;
    for (const entry of map.values()) if (entry.address === address) n++;
    return n;
  }
  private validRedirect(uri: string) {
    try {
      const u = new URL(uri);
      return (
        [...u.hostname].every((character) =>
          "abcdefghijklmnopqrstuvwxyz0123456789.-_[]:".includes(
            character.toLowerCase(),
          ),
        ) &&
        !u.hash &&
        !u.username &&
        !u.password &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)))
      );
    } catch {
      return false;
    }
  }
  private validate(client: OAuthClientInformationFull, p: AuthorizationParams) {
    if (canonicalResource(p.resource, this.resource.origin) !== this.resource.href)
      throw new InvalidRequestError("Wrong resource audience");
    if (
      !client.redirect_uris.includes(p.redirectUri) ||
      !this.validRedirect(p.redirectUri) ||
      !p.codeChallenge ||
      !/^[A-Za-z0-9_-]{43}$/.test(p.codeChallenge)
    )
      throw new InvalidRequestError("Invalid redirect or PKCE");
    if (p.scopes?.some((s) => s !== "bootstrap"))
      throw new InvalidRequestError("Unsupported scope");
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.sweep();
    this.validate(client, params);
    if (this.consents.size >= 256)
      throw new InvalidRequestError("Consent capacity");
    const id = random(),
      csrf = random();
    this.consents.set(id, {
      client,
      params,
      csrfHash: digest(csrf),
      expires: this.now() + LIMITS.invitationMs,
    });
    res.cookie("s2u_guest_consent", csrf, {
      httpOnly: true,
      secure: this.resource.protocol === "https:",
      sameSite: "strict",
      path: "/guest/consent",
      maxAge: LIMITS.invitationMs,
    });
    res.setHeader(
      "Content-Security-Policy",
      // Chromium applies form-action to the consent POST's redirect as well.
      // validate() already requires exact client registration and a CSP-safe URL host.
      `default-src 'none'; form-action 'self' ${new URL(params.redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
    );
    res.setHeader("Cache-Control", "no-store");
    res
      .type("html")
      .send(
        `<!doctype html><html><meta charset="utf-8"><title>Connect your agent</title><h1>Continue as a guest</h1><p>${escape(client.client_name ?? "This MCP client")} is requesting bootstrap access to SOCOM 2 Legacy. This does not grant access to a game page. Approve pairing separately in your original page.</p><form method="post" action="/guest/consent"><input type="hidden" name="id" value="${id}"><input type="hidden" name="csrf" value="${csrf}"><button name="decision" value="approve">Continue as guest</button><button name="decision" value="deny">Cancel</button></form></html>`,
      );
  }
  mount(app: Express) {
    app.post("/guest/consent", (req, res) => {
      this.sweep();
      const { id, csrf, decision } = req.body ?? {};
      const pending =
        typeof id === "string" ? this.consents.get(id) : undefined;
      const cookie = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("s2u_guest_consent="))
        ?.slice("s2u_guest_consent=".length);
      if (
        !pending ||
        typeof csrf !== "string" ||
        csrf.length > 128 ||
        !cookie ||
        digest(csrf) !== pending.csrfHash ||
        digest(cookie) !== pending.csrfHash ||
        req.get("origin") !== this.resource.origin
      ) {
        res.status(403).json({ error: "invalid_consent" });
        return;
      }
      this.consents.delete(id);
      res.clearCookie("s2u_guest_consent", { path: "/guest/consent" });
      const redirect = new URL(pending.params.redirectUri);
      if (pending.params.state)
        redirect.searchParams.set("state", pending.params.state);
      if (decision === "approve")
        redirect.searchParams.set(
          "code",
          this.issueCode(pending.client, pending.params),
        );
      else redirect.searchParams.set("error", "access_denied");
      res.redirect(302, redirect.href);
    });
  }
  issueCode(client: OAuthClientInformationFull, params: AuthorizationParams) {
    this.sweep();
    this.validate(client, params);
    if (this.codes.size >= 256) throw new InvalidRequestError("Code capacity");
    const code = random();
    this.codes.set(digest(code), {
      client: client.client_id,
      params,
      principal: random(),
      expires: this.now() + 60000,
    });
    return code;
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    this.sweep();
    const c = this.codes.get(digest(code));
    if (!c || c.client !== client.client_id)
      throw new InvalidGrantError("Invalid code");
    return c.params.codeChallenge;
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    verifier?: string,
    redirect?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.sweep();
    const key = digest(code),
      c = this.codes.get(key);
    if (
      !c ||
      c.client !== client.client_id ||
      redirect !== c.params.redirectUri ||
      canonicalResource(resource, this.resource.origin) !== this.resource.href ||
      !verifier ||
      verifier.length < 43 ||
      verifier.length > 128 ||
      !timingSafeEqual(
        Buffer.from(digest(verifier)),
        Buffer.from(c.params.codeChallenge),
      )
    )
      throw new InvalidGrantError("Invalid code binding");
    if (this.tokens.size >= 512) throw new InvalidGrantError("Token capacity");
    const address = this.address();
    if (this.held(this.tokens, address) >= (this.budget.tokensPerAddress ?? 32))
      throw new InvalidGrantError("Token address capacity");
    this.codes.delete(key);
    const token = random(),
      expires = this.now() + LIMITS.sessionAbsoluteMs;
    this.tokens.set(digest(token), {
      info: {
        token: "",
        clientId: client.client_id,
        scopes: ["bootstrap"],
        expiresAt: Math.floor(expires / 1000),
        resource: this.resource,
        extra: { principalId: c.principal },
      },
      address,
      expires,
    });
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: LIMITS.sessionAbsoluteMs / 1000,
      scope: "bootstrap",
    };
  }
  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new UnsupportedGrantTypeError("Guest grants require fresh consent");
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    this.sweep();
    const t = this.tokens.get(digest(token));
    if (!t) throw new InvalidTokenError("Expired or invalid bootstrap");
    return { ...t.info, token };
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: { token: string },
  ) {
    const h = digest(request.token),
      t = this.tokens.get(h);
    if (t?.info.clientId === client.client_id) {
      this.tokens.delete(h);
      this.onRevoke(String(t.info.extra?.principalId));
    }
  }
  private sweep() {
    const now = this.now();
    for (const entry of this.tokens.values())
      if (entry.expires < now)
        this.onRevoke(String(entry.info.extra?.principalId));
    for (const map of [this.clients, this.codes, this.tokens, this.consents])
      for (const [key, value] of map) if (value.expires < now) map.delete(key);
  }
  close() {
    this.clients.clear();
    this.codes.clear();
    this.tokens.clear();
    this.consents.clear();
  }
}
