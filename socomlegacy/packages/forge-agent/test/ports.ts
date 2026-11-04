import { createServer, type AddressInfo } from "node:net";
/**
 * An ephemeral loopback port the system just handed out, for a gateway whose issuer must name its port before it
 * listens (LATER 446): never a fixed port the owner's gateway or an e2e spec may hold.
 */
export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
