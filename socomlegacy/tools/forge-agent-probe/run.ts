#!/usr/bin/env node
/** Product adaptation: help is read-only; --run explicitly opts in to browser and installed-model clients. */
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { runAcceptance } from './harness';
import { runNativeAcceptance } from './nativeHarness';
import { CASES, type CaseName } from './scenarios';

const HELP = `FCW-02 actual installed-client acceptance (product adaptation; Build only)

From the repository root, after the controller grants the serial browser/model slot and the host lock is free:
  node --import tsx socomlegacy/tools/forge-agent-probe/run.ts --run --client codex --cases all --out <outside-all-git-trees>
  node --import tsx socomlegacy/tools/forge-agent-probe/run.ts --run --client claude --cases all --out <outside-all-git-trees>
  node --import tsx socomlegacy/tools/forge-agent-probe/run.ts --run --mode native --client codex --cases creator --out <outside-all-git-trees>
  node --import tsx socomlegacy/tools/forge-agent-probe/run.ts --run --mode native --client claude --cases creator --out <outside-all-git-trees>

Run the clients separately. --help starts no browser/client. No --run means no acceptance run.
Prerequisites: Node 22+, installed codex/claude CLI, existing signed-in subscription, installed Playwright Chromium,
and YOUR OWN running loopback Forge page/gateway. Never set up new API keys or edit global client configuration.
Start services using the compatibility record (repo root):
  FORGE_AGENT_DEVELOPMENT=1 FORGE_AGENT_ORIGINS=http://localhost:5361 npm start --workspace @s2u/forge-agent
  npm run dev --workspace @s2u/socomlegacy -- --host localhost --port 5361 --strictPort
PowerShell: assign those two environment variables with $env:NAME='value' before npm start.
Ports 5360/5361 must belong to this run; never attach to or stop another session's services.

Options:
  --run                    Required explicit opt-in; consumes existing client subscription capacity.
  --client codex|claude     One actual installed client, not the SDK or native.py.
  --mode proxy|native       Default proxy. Native uses installed CLI-owned OAuth directly to the gateway.
  --cases all|<csv>         creator,reconnect,denial,expiry,missing-gateway; default all.
  --page <origin>           Default http://localhost:5361 (loopback only).
  --gateway <origin>        Default http://127.0.0.1:5360 (loopback only).
  --out <directory>         Required, outside every git checkout; sanitized JSON + MCP canvas PNG only.
  --timeout-ms <integer>    Per child timeout, default 240000, max 600000.

creator asserts discovery, matching browser code + grants, metadata read, revisioned name edit/readback,
real undo/readback, an actual MCP PNG image block, user-selected local fixture import/apply/readback/remove,
and disconnect revocation. reconnect uses a second isolated client invocation and rejects the exact old mutation.
denial requires page Decline and an actual NOT_PAIRED result. expiry waits 301 seconds of REAL wall time before
the actual client attempts the copied invitation. missing-gateway uses a failing loopback proxy, not a hosted URL.
An unavailable client, missing credentials, nonzero child, timeout, missing image or failed assertion NEVER passes.
Selected-only runs leave all omitted cases blocked and exit 2; any failed case exits 1; all local cases pass exits 0.

Temporary CODEX_HOME / CLAUDE_CONFIG_DIR profiles use access-only snapshots with owner-only permissions.
Codex uses external chatgptAuthTokens mode with an empty refresh field; Claude uses its nonrefreshing access-token
environment mode. No refresh grant is copied or inherited. Existing access expiry must exceed the child budget
plus 300 seconds; otherwise ACCESS_TOKEN_VALIDITY_REQUIRED blocks the run. Global credentials remain unchanged.
Codex disables installed shell/image/multi-agent/browser tool features; its unified_exec backend flag remains
client-enforced true. Claude receives an empty builtin
tool list. Observed non-MCP tool events fail the run and terminate the child; prompts alone are not enforcement.
Profiles never copy global config, plugins or sessions and are removed in finally
after success, error, timeout or handled SIGINT/SIGTERM. A hard OS kill cannot run cleanup: remove abandoned
fcw-client-* directories in the OS temp directory before retrying. Prompts/child output/transcripts are never saved.
The proxy injects a guest token held only in memory; no gateway token is written into a client config or report.

Evidence boundary: guest OAuth is rendered harness bootstrap. Actual CLI calls use native HTTP MCP through a
loopback recording proxy with that already-authorized token. This DOES NOT prove actual-client OAuth/copy-blurb
setup, client UI image DISPLAY, different subscription profiles, LAN, separate networks or TURN. Those remain
unmeasured prerequisites for full FCW-02 acceptance. SDK/native tests and actual CLI reports are separate.

Native mode validates the endpoint/invitation in the page's actual copied setup. It configures that endpoint in
the private profile and invokes installed mcp login --no-browser socom2legacy; the CLI owns registration, PKCE,
token exchange and local OAuth storage. Browser automation only clicks guest consent and supplies its redirect
to the CLI. It then runs the same creator assertions using completed MCP results from client JSONL in memory,
and invokes mcp logout socom2legacy before profile cleanup. No bearer-injecting proxy or harness token exchange.
Codex OAuth storage is forced to file; Claude file isolation is currently Windows-only (other OS blocks).
Claude --no-browser still requires a terminal: native Claude login uses the pinned optional node-pty Windows
ConPTY adapter. A missing native binary blocks as OPTIONAL_NODE_PTY_REQUIRED; game installation still works.
The adapter accepts only mcp login --no-browser socom2legacy, retains terminal data in memory, and kills its
owned process tree on timeout/abort. Model execution remains the restricted pipe-based JSONL path.
New LOCAL gateway OAuth credentials may exist only in that restricted temporary profile until logout/finally.
Host subscription refresh material remains excluded; validity covers the case profile's whole bounded budget plus 300 s.
A case's budget is every step at --timeout-ms (Claude's server registration, the login, its one or two model runs,
the logout) plus 60 s (expiry: plus its 301 s wait); the last step is the logout's own, so spent work still logs out.
At the default 240000 the access snapshot must stay valid for more than: Claude creator/denial 1320 s, reconnect
1560 s, expiry 1621 s; Codex creator/denial 1080 s, reconnect 1320 s, expiry 1381 s. A shorter one blocks the case
as ACCESS_TOKEN_VALIDITY_REQUIRED.
Native discovery requires successful results from all five tools; a login or startup tool list cannot pass it.
Creator/reconnect/denial/expiry are runnable. Native missing-gateway stays explicitly blocked because native
JSONL does not expose the network refusal; use the separately labelled proxy case for that measurement.
The literal copied add command is not executed: Codex's add auto-opens an OS browser, so native mode writes
equivalent isolated endpoint config and uses explicit no-browser login. Native results label this distinction.

Focused automated unit tests (no browser/model): from socomlegacy/
  npx vitest run --config tools/forge-agent-probe/vitest.config.ts --maxWorkers=2
Opt-in Playwright wrapper (host slot required): FCW_ACTUAL_CLIENT=codex|claude, FCW_ACCEPTANCE_OUT=<outside-git>,
FCW_PAGE=http://localhost:5361, FCW_GATEWAY=http://127.0.0.1:5360; run forgeAgentOnboarding.spec.ts with your
normal owned E2E ports. Expiry additionally requires FCW_WAIT_FOR_EXPIRY=1; otherwise its skip is explicit.
`;
const { values } = parseArgs({ options: { help: { type: 'boolean' }, run: { type: 'boolean' }, client: { type: 'string' }, mode: { type: 'string', default: 'proxy' }, cases: { type: 'string', default: 'all' },
  page: { type: 'string', default: 'http://localhost:5361' }, gateway: { type: 'string', default: 'http://127.0.0.1:5360' },
  out: { type: 'string' }, 'timeout-ms': { type: 'string', default: '240000' } } });
if (values.help || !values.run) { console.log(HELP); if (!values.help) process.exitCode = 2; }
else if (!['codex', 'claude'].includes(values.client ?? '') || !['proxy', 'native'].includes(values.mode ?? '') || !values.out) { console.error('Supply --client codex|claude, --mode proxy|native and --out outside all git trees.'); process.exitCode = 2; }
else {
  const cases = values.cases === 'all' ? [...CASES] : values.cases!.split(',');
  const timeoutMs = Number(values['timeout-ms']);
  if (cases.length === 0 || cases.some(name => !CASES.includes(name as CaseName)) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) {
    console.error('Invalid case or timeout. Use --help.'); process.exitCode = 2;
  } else {
    const abort = new AbortController();
    const stop = () => abort.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
      const report = await (values.mode === 'native' ? runNativeAcceptance : runAcceptance)({ browser, client: values.client as 'claude' | 'codex', cases: cases as CaseName[],
        page: values.page!, gateway: values.gateway!, out: values.out!, timeoutMs,
        repository: fileURLToPath(new URL('../../../', import.meta.url)), signal: abort.signal });
      console.log(JSON.stringify(report)); process.exitCode = report.status === 'pass' ? 0 : report.status === 'blocked' ? 2 : 1;
    } catch { console.error('Acceptance did not complete. No pass recorded; check prerequisites with --help.'); process.exitCode = 1; }
    finally { await browser?.close(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  }
}
