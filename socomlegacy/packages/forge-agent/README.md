# Forge agent gateway

Product adaptation. This service has no game, match, shell, filesystem, generic HTTP or JavaScript execution tools.
It hosts standard Streamable HTTP MCP at `/mcp`; approved page commands travel exclusively over an ordered WebRTC
data channel. Signaling at `/signal` only negotiates, grants, updates the same page's surface and revokes sessions.

Node 22 or newer is required. Run from the repository root after `npm install`:

```powershell
$env:FORGE_AGENT_DEVELOPMENT = '1'
$env:FORGE_AGENT_ORIGINS = 'http://localhost:5361'
npm start --workspace @s2u/forge-agent
```

Development binds `127.0.0.1:5360`. `FORGE_AGENT_PORT` and `FORGE_AGENT_BIND` configure the listener;
development refuses non-loopback bindings. `FORGE_AGENT_ISSUER` defaults to `http://127.0.0.1:5360` only in
explicit development mode. Production requires an explicit HTTPS issuer and exact HTTPS page origins, a TLS edge,
and an operator-reviewed resource budget. There is no deploy step or public infrastructure in this package.
`FORGE_AGENT_TRUSTED_PROXIES` (`trustedProxies`, default 0) is the number of reverse-proxy hops in front of the gateway.
With N > 0 the client address behind the per-address budgets is the Nth entry from the right of `X-Forwarded-For`
(the socket address when the header is missing or shorter); with 0 the header is ignored entirely, and a production
start warns that every client behind an edge then shares one address's budget. Never count a hop that does not
overwrite or append to the header, or clients can choose their own address. With N > 0 the gateway binds only the
loopback (`FORGE_AGENT_BIND` other than `127.0.0.1`, `::1` or `localhost` is refused `TRUSTED_PROXIES_REQUIRE_LOOPBACK`),
so the edge runs on the same host and no client reaches the gateway around it.

`FORGE_AGENT_STATE_FILE` (`stateFile`, default unset) keeps logins across a restart or redeploy, so a player's agent does
not have to authenticate again from its MCP client. Unset, the OAuth state is in memory only, as in development. Set,
the gateway loads the file at start and writes it atomically (a temp file in the same directory renamed over, mode
0600) at most once a second and on shutdown. It holds the registered OAuth clients and the live access tokens as their
SHA-256 hashes with their expiry, principal and audience, within the same 512-entry and per-address limits; never a raw
token, an authorization code, a consent or CSRF value. A revoked or expired token is gone from it; expired entries are
dropped on load; a corrupt, unreadable or other-version file is logged by its error code only and the gateway starts
empty. Pairings, targets, page tokens, invitations and sessions are never stored: a page pairs again after a restart.
The file is still a credential store -- a stored hash plus the matching token held by an agent is a live login -- so
keep it on the box, readable by the service's user alone, and never in a backup that leaves it.

The browser-safe contract is `@s2u/forge-agent-protocol`. `createGateway(config)` returns the HTTP app/server,
capability state, OAuth provider, `listen(port, host?)` and `close()`. Configuration supports injected clock,
cryptographic random source, explicit operation metadata and RTC peer factory. The default factory uses real werift.
An operator can inject a factory calling `createRtcPeer(signal, rtcConfig)` with approved STUN/TURN configuration.
No arbitrary ICE-server URL is accepted from a tool call. The CLI intentionally has no public relay default.
A session accepts at most 32 remote ICE candidates from its page (one more closes the signaling socket). Outside
development (`publicCandidatesOnly`, default on in production) the gateway neither dials nor reveals a candidate
whose address is unspecified, private (RFC 1918), shared (RFC 6598), loopback, link-local (the cloud metadata address
among them), unique-local or a name: its own host candidates in the offer and in trickle ICE are filtered the same
way, so a box with only private interfaces needs an operator-configured STUN or TURN factory to be reachable.

Guest OAuth uses SDK discovery, dynamic public-client registration, authorization-code PKCE S256, exact registered
redirects, resource audience binding, browser consent, an HttpOnly SameSite cookie and a separate CSRF value. Tokens
and codes are stored as hashes and expire; no account, email, password or refresh token is needed. Bootstrap grants
only expose the caller's status and the ability to request pairing. Every page still requires its own approval.
Restart discards every credential and pairing; the page must reconnect and pair again.

HTTP API:

- `GET /api/v1/schema`: public operation metadata, permissions, limits and setup instructions.
- `POST /api/v1/targets`: exact configured browser Origin plus `{surface,name,build,map?}`. Returns
  `{targetId,pageToken,epoch,invitation,expiresAt}`. Store the page token only in tab memory.
- `GET /api/v1/status`: bearer-authenticated status for this bootstrap principal only.
- `POST /api/v1/pair`: bearer plus `{invitation,permissions,clientName}`; returns a pending request and comparison code.
- `POST /api/v1/commands`: bearer plus a versioned `AgentRequest`. Uses the same dispatcher as MCP `agent_request`.
- `POST /api/v1/disconnect`: bearer plus `{sessionId}`; revokes only the caller's session.
- `GET /health`: readiness. No target list is public.

The page connects `/signal` with WebSocket subprotocols `['s2u-agent-v1','auth.' + pageToken]`. The server selects
`s2u-agent-v1`; query credentials are refused. Page credentials are hashed at rest. Because an edge that logs
request headers records the subprotocol, the page token is a one-time ticket: it is spent when its socket attaches,
and refused when presented more than thirty seconds (`LIMITS.requestMs`) after registration; a hosting recipe still
keeps header logging off at the edge. The pending/approve, bound
offer/answer/ICE, same-family surface metadata and revoke messages are defined in the shared protocol. Navigation
or entry to an unsupported room must revoke in the page; the gateway also enforces the currently announced surface.

Control messages use shared `encodeFrames`/`FrameReceiver`, at most 16 KiB per data message and 64 KiB reassembled.
Capture bytes use `image.begin {requestId,transferId,size,mimeType}`, ordered
`image.chunk {transferId,index,data:<base64>}` and `image.finish {transferId,digest:<SHA-256 hex>}` before a result with
`data.image {transferId,mimeType}`. One capture, at most 2 MiB, must belong to an authorized capture request. The gateway
checks length/digest and emits a separate MCP image block; it does not place base64 in text or structured MCP results.
REST returns the completed image in the result's `data.image {mimeType,data:<base64>}`. The application never logs it.

Policies include 128 opted-in targets, at most four live unpaired targets per client address
(`maxTargetsPerAddress`; one more is refused `ADDRESS_CAPACITY`, and pairing or expiry frees the slot), 64
pending/paired sessions with at most eight per client address (`maxSessionsPerAddress`, refused `ADDRESS_CAPACITY`),
32 registered OAuth clients and 32 live bootstrap tokens per client address (`maxClientsPerAddress`,
`maxTokensPerAddress`) within the 512-entry stores; the SDK's `/authorize`, `/register`, `/token` and `/revoke`
limiters key on the same client address, 256 HTTP connections, 128 signaling connections, 64 concurrent MCP requests, bounded OAuth
stores and a bounded 1024-entry IP rate table. HTTP and signaling upgrades admit a global burst of 200/refills 100 per
second and per-address burst 60/refills 10 per second. Session policy is the shared protocol's
four requests per second, burst eight, queue eight, thirty-second request budget and hard/idle lifetime. Stop and
disconnect have priority. Expired queued work is not replayed. A lost response may mean a committed edit; request
receipts are owned by the page adapter. Operations have an explicit metadata allowlist; the page validates their args.

Verification is targeted and requires no disc or browser:

```text
cd socomlegacy/packages/forge-agent-protocol
npx vitest run test/protocol.test.ts --maxWorkers=2
cd ../forge-agent
npx vitest run test/gateway.test.ts test/oauth.test.ts test/mcp.test.ts test/signaling.test.ts test/rtc.test.ts --maxWorkers=2
```

The RTC probe is two real werift peers on one host, with no external ICE service, and tests chunked capture and
cleanup. On 2026-10-24, Node v24.13.1 Windows x64, its single request/result probe measured 236 ms wall time,
31 ms process CPU and +143360 bytes RSS after both peers closed. These are one-process test observations after module
loading, not a capacity plan or cross-network measurement. Direct dependencies SDK 1.32.2, werift 0.25.2, Zod 4.6.7,
ws 8.22.0 and Express 5.3.0 report MIT licenses. `npm audit` reported zero vulnerabilities after dependency installation.
The npm lock records dependency versions. Actual Codex CLI 0.162.1 and Claude Code 2.1.310 guest OAuth login, and
native Chromium loopback RTC, are measured in `docs/specs/2026-10-24-forge-agent-compatibility.md`. Complete client
tool/image/reconnect and onboarding, LAN/separate-network/TURN/TLS-edge probes, the intended production host and
sustainable concurrency remain release checks.
