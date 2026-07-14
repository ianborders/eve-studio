import { type AddressInfo, createServer } from "node:net";

/** Ask the OS for a free loopback port. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as AddressInfo | null;
      const port = addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}
