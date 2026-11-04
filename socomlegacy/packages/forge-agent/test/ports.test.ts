import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// LATER 446: a test that binds a fixed port fails with EADDRINUSE while the owner's gateway (5360, 5363) or an e2e
// spec (5374, 5375) holds it -- a port-in-use flake, not a code failure. Every gateway these tests start listens on
// an ephemeral port.
const files = [
  "mcp.test.ts",
  "signaling.test.ts",
  "captureBoundary.test.ts",
  "gateway.test.ts",
  "ice.test.ts",
  "../../viewer/test/agentConnection.test.ts",
];
it("LATER 446: the gateway and connection tests bind no fixed port", () => {
  const fixed = files.flatMap((file) =>
    readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")
      .split("\n")
      .flatMap((line, i) => (/\.listen\(\s*[1-9]/.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  );
  expect(fixed).toEqual([]);
});
