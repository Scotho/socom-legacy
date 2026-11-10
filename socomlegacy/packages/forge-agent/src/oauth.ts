import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
 * FP-14 (FP.R10; a browser adaptation, FG.R2): the consent page's one stylesheet, the shared design system's tokens
 * (`shared/ds/tokens.css`, v2.3.0: ground #000e11, panel #002933, panel-edge #061a1c, highlight #0d595c, gold #c4a04a,
 * text #b4bfc1, text-strong #dfe4e5, text-dim #8a9a9c, focus #5fb3bf; the body and label families; radius 0; spacing
 * 8/12/16) inlined, since the gateway serves static HTML and fetches nothing (no font file: the families fall back as the
 * system's own stacks do). The CSP allows it by its hash alone (`CONSENT_STYLE_HASH`). AX-U: the gateway's join page
 * (`./gateway.ts`, `/join/<invitation>`) wears the same sheet under the same hash.
 */
export const CONSENT_STYLE = [
  ':root{color-scheme:dark}',
  'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000e11;color:#b4bfc1;font:400 15px/1.5 Oswald,"Arial Narrow",sans-serif}',
  'main{box-sizing:border-box;width:min(440px,calc(100vw - 32px));padding:16px;background:#002933;border:1px solid #061a1c;border-radius:0}',
  '.kicker{margin:0;font:500 13px/16px Oswald,"Arial Narrow",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a9a9c}',
  'h1{margin:8px 0 12px;font:600 24px/1.2 "Saira Condensed",Oswald,Impact,sans-serif;color:#dfe4e5}',
  'p{margin:0 0 12px}',
  'code{display:block;margin:0 0 12px;padding:8px;background:#000e11;border:1px solid #0d595c;color:#dfe4e5;font:400 13px/1.4 ui-monospace,Consolas,monospace;overflow-wrap:anywhere}',
  '.hint{font-size:13px;color:#8a9a9c}',
  '.buttons{display:flex;gap:8px;flex-wrap:wrap}',
  'button{flex:1;min-height:44px;padding:8px 12px;border-radius:0;font:600 15px/1 Oswald,"Arial Narrow",sans-serif;cursor:pointer}',
  'button[value=approve]{color:#000e11;background:#c4a04a;border:1px solid #c4a04a}',
  'button[value=deny]{color:#b4bfc1;background:transparent;border:1px solid #0d595c}',
  'button:focus-visible{outline:2px solid #5fb3bf;outline-offset:2px}',
].join('');
/** FP-14: the consent page's approving button (the probe presses it by this name). */
export const CONSENT_APPROVE_LABEL = "Approve";
export const CONSENT_STYLE_HASH = createHash("sha256").update(CONSENT_STYLE).digest("base64");
/**
 * FP-14, reworded by AX-U (C6; a browser adaptation, FG.R2): the consent page -- one question naming the client
 * ("Allow <client> to sign in to SOCOM 2 Legacy as a guest?"), what it does and does not let the client do, its name said
 * to be self-reported, Approve and Decline. The CSRF form and the CSP hash are FP-14's, unchanged.
 */
function consentPage(clientName: string | undefined, id: string, csrf: string): string {
  const name = clientName ? escape(clientName) : undefined;
  const minutes = Math.round(LIMITS.invitationMs / 60_000);
  const who = name ?? "an unnamed MCP client";
  const reported = name ? `The name “${name}” is reported by the client.` : "The client did not give a name.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect your agent</title><style>${CONSENT_STYLE}</style></head><body><main><p class="kicker">Connect your agent</p><h1>Allow ${who} to sign in to SOCOM 2 Legacy as a guest?</h1><p>This only lets it ask to connect. You still press Allow on your own page before it can do anything there.</p><p class="hint">${reported} This request ends in ${minutes} minutes.</p><form method="post" action="/guest/consent"><input type="hidden" name="id" value="${id}"><input type="hidden" name="csrf" value="${csrf}"><div class="buttons"><button name="decision" value="approve">${CONSENT_APPROVE_LABEL}</button><button name="decision" value="deny">Decline</button></div></form></main></body></html>`;
}
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
/**
 * AX-11 (a browser adaptation, gateway policy): the opt-in file that keeps the OAuth state across a restart. Unset, the
 * state is in memory only, as before. It holds the registered clients and the live tokens' HASHES with their expiry,
 * principal and audience -- never a raw token, a code, a consent or a CSRF value. Tokens are opaque random values
 * checked by their hash alone, so no signing key or other secret is needed for a stored token to keep validating.
 */
export interface GuestPersistence {
  /** The operator-named file (`FORGE_AGENT_STATE_FILE`); written atomically, 0600, at most once a second and on close. */
  stateFile?: string;
}
/** AX-11: the file's version; a file of any other version starts empty. */
export const OAUTH_STATE_VERSION = 1;
const STORE_LIMIT = 512;
const WRITE_INTERVAL_MS = 1000;
type StoredClient = { client: OAuthClientInformationFull; address: string; expires: number };
type StoredToken = {
  hash: string;
  clientId: string;
  scopes: string[];
  principalId: string;
  resource: string;
  address: string;
  expires: number;
};
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 2048;
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
      this.changed();
      return client;
    },
  };
  constructor(
    readonly resource: URL,
    private now: () => number = Date.now,
    private onRevoke: (principal: string) => void = () => {},
    private budget: GuestBudget = {},
    private persistence: GuestPersistence = {},
  ) {
    if (persistence.stateFile) this.load(persistence.stateFile);
  }
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
      // FP-14: the page's one inline stylesheet, by its hash; nothing else may load.
      `default-src 'none'; style-src 'sha256-${CONSENT_STYLE_HASH}'; form-action 'self' ${new URL(params.redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
    );
    res.setHeader("Cache-Control", "no-store");
    res
      .type("html")
      .send(
        consentPage(client.client_name || undefined, id, csrf),
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
    this.changed();
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
      this.changed();
      this.onRevoke(String(t.info.extra?.principalId));
    }
  }
  /**
   * AX-10 (a browser adaptation, gateway policy): the registered client a live grant principal's token was issued to,
   * or undefined -- read-only; the pending signal carries it so the page can recognise a remembered agent.
   */
  clientIdOf(principal: string): string | undefined {
    if (!principal) return undefined;
    for (const t of this.tokens.values())
      if (t.expires >= this.now() && t.info.extra?.principalId === principal) return t.info.clientId;
    return undefined;
  }
  private sweep() {
    const now = this.now(),
      held = this.clients.size + this.tokens.size;
    for (const entry of this.tokens.values())
      if (entry.expires < now)
        this.onRevoke(String(entry.info.extra?.principalId));
    for (const map of [this.clients, this.codes, this.tokens, this.consents])
      for (const [key, value] of map) if (value.expires < now) map.delete(key);
    if (this.clients.size + this.tokens.size !== held) this.changed();
  }
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  /** AX-11: schedules one write a second after the first change, so the file is written at most once a second. */
  private changed() {
    if (!this.persistence.stateFile || this.writeTimer) return;
    this.writeTimer = setTimeout(() => this.flush(), WRITE_INTERVAL_MS);
    this.writeTimer.unref?.();
  }
  /** AX-11: writes the clients and the token hashes now -- a temp file beside it, 0600, renamed over. */
  flush() {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    const file = this.persistence.stateFile;
    if (!file) return;
    const now = this.now();
    const clients = [...this.clients.values()].filter((c) => c.expires >= now);
    const tokens: StoredToken[] = [];
    for (const [hash, t] of this.tokens)
      if (t.expires >= now)
        tokens.push({
          hash,
          clientId: t.info.clientId,
          scopes: t.info.scopes,
          principalId: String(t.info.extra?.principalId ?? ""),
          resource: this.resource.href,
          address: t.address,
          expires: t.expires,
        });
    const temp = join(dirname(file), `.${basename(file)}.${process.pid}.${random().slice(0, 12)}.tmp`);
    try {
      writeFileSync(temp, JSON.stringify({ version: OAUTH_STATE_VERSION, clients, tokens }), { mode: 0o600, flag: "wx" });
      renameSync(temp, file);
    } catch (e) {
      console.warn(`Forge agent gateway: OAuth state not written (${this.code(e)})`);
      try {
        rmSync(temp, { force: true });
      } catch {}
    }
  }
  /** An error's code only: never a message that could quote the file's content. */
  private code(e: unknown) {
    const c = (e as { code?: unknown })?.code;
    return typeof c === "string" && /^[A-Z0-9_]{1,32}$/.test(c) ? c : e instanceof SyntaxError ? "INVALID_JSON" : "UNREADABLE";
  }
  /** AX-11: loads the file at start; expired, malformed, foreign-audience and over-budget entries are dropped. */
  private load(file: string) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      const code = this.code(e);
      if (code !== "ENOENT") console.warn(`Forge agent gateway: OAuth state not loaded (${code}); starting empty`);
      return;
    }
    if (!record(raw) || raw.version !== OAUTH_STATE_VERSION) {
      console.warn("Forge agent gateway: OAuth state not loaded (UNKNOWN_VERSION); starting empty");
      return;
    }
    if (!Array.isArray(raw.clients) || !Array.isArray(raw.tokens)) {
      console.warn("Forge agent gateway: OAuth state not loaded (INVALID_SHAPE); starting empty");
      return;
    }
    const now = this.now(),
      perClient = this.budget.clientsPerAddress ?? 32,
      perToken = this.budget.tokensPerAddress ?? 32;
    const counts = new Map<string, number>();
    const admit = (kind: string, address: string, limit: number) => {
      const key = `${kind}\u0000${address}`,
        n = counts.get(key) ?? 0;
      if (n >= limit) return false;
      counts.set(key, n + 1);
      return true;
    };
    let dropped = 0;
    for (const entry of raw.clients as unknown[]) {
      const c = entry as Partial<StoredClient>;
      if (
        !record(c) ||
        !record(c.client) ||
        !text(c.client.client_id) ||
        !Array.isArray(c.client.redirect_uris) ||
        !c.client.redirect_uris.every((u) => typeof u === "string" && this.validRedirect(u)) ||
        c.client.token_endpoint_auth_method !== "none" ||
        !text(c.address) ||
        typeof c.expires !== "number" ||
        c.expires < now ||
        this.clients.size >= STORE_LIMIT ||
        !admit("client", c.address, perClient)
      ) {
        dropped++;
        continue;
      }
      this.clients.set(c.client.client_id, {
        client: c.client as OAuthClientInformationFull,
        address: c.address,
        expires: c.expires,
      });
    }
    for (const entry of raw.tokens as unknown[]) {
      const t = entry as Partial<StoredToken>;
      if (
        !record(t) ||
        !text(t.hash) ||
        !text(t.clientId) ||
        !text(t.principalId) ||
        !text(t.address) ||
        t.resource !== this.resource.href ||
        !Array.isArray(t.scopes) ||
        t.scopes.length !== 1 ||
        t.scopes[0] !== "bootstrap" ||
        typeof t.expires !== "number" ||
        t.expires < now ||
        t.expires > now + LIMITS.sessionAbsoluteMs ||
        this.tokens.size >= STORE_LIMIT ||
        !admit("token", t.address, perToken)
      ) {
        dropped++;
        continue;
      }
      this.tokens.set(t.hash, {
        info: {
          token: "",
          clientId: t.clientId,
          scopes: ["bootstrap"],
          expiresAt: Math.floor(t.expires / 1000),
          resource: this.resource,
          extra: { principalId: t.principalId },
        },
        address: t.address,
        expires: t.expires,
      });
    }
    if (dropped) this.changed();
  }
  close() {
    // AX-11: the last write before the in-memory state goes; nothing is written after close.
    if (this.persistence.stateFile) {
      this.flush();
      this.persistence = {};
    }
    this.clients.clear();
    this.codes.clear();
    this.tokens.clear();
    this.consents.clear();
  }
}
