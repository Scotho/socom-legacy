import { createGateway } from "./gateway.js";
import { rtcConfigFromEnv } from "./rtc.js";
const development = process.env.FORGE_AGENT_DEVELOPMENT === "1";
const issuer =
  process.env.FORGE_AGENT_ISSUER ??
  (development ? "http://127.0.0.1:5360" : undefined);
if (!issuer)
  throw Error(
    "Set FORGE_AGENT_ISSUER and FORGE_AGENT_ORIGINS for your TLS edge; opt in to loopback using FORGE_AGENT_DEVELOPMENT=1",
  );
const port = Number(process.env.FORGE_AGENT_PORT ?? 5360);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("INVALID_PORT");
// Browser adaptation (the gateway's deploy, GW-F-1): FORGE_AGENT_ICE_SERVERS (stun:host:port, comma-separated) and
// FORGE_AGENT_ICE_PORTS (min-max, the UDP range the box opens), so a gateway behind NAT offers a reachable candidate.
// Both unset: no ICE server and no range, as before; a malformed one refuses the start.
const rtcConfig = rtcConfigFromEnv(process.env);
const gateway = createGateway({
  issuer,
  development,
  rtcConfig,
  // Browser adaptation (gateway policy): proxy hops trusted for X-Forwarded-For; validated by createGateway.
  trustedProxies: Number(process.env.FORGE_AGENT_TRUSTED_PROXIES ?? 0),
  origins:
    process.env.FORGE_AGENT_ORIGINS?.split(",").filter(Boolean) ??
    (development ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
});
await gateway.listen(port, process.env.FORGE_AGENT_BIND ?? "127.0.0.1");
console.info(
  `Forge agent gateway listening on port ${port}; ${development ? "loopback development" : "configured TLS edge required"}; ` +
    `${rtcConfig.iceServers?.length ?? 0} ICE server(s)${rtcConfig.icePortRange ? `, UDP ${rtcConfig.icePortRange.join("-")}` : ""}`,
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void gateway.close().then(
      () => {
        process.exitCode = 0;
      },
      () => {
        process.exitCode = 1;
      },
    );
  });
