import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

/**
 * Module-level state controlling what the mock net.Socket does when connect is called.
 * "connect" → simulate a successful TCP connection (connect callback fires).
 * "error"   → simulate a refused TCP connection (error handler fires).
 */
let mockSocketBehavior: "connect" | "error" = "error";

// Mock node:net BEFORE importing server.ts so the module gets our fake Socket.
mock.module("node:net", () => {
  class MockSocket {
    private _errorHandlers: Array<(e: Error) => void> = [];
    private _connectCb?: () => void;

    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "error") {
        this._errorHandlers.push(handler as (e: Error) => void);
      }
      return this;
    }

    connect(_port: number, _host: string, callback?: () => void) {
      if (callback) this._connectCb = callback;
      // Defer firing so socket.on("error") is registered before we fire
      setImmediate(() => {
        if (mockSocketBehavior === "connect") {
          this._connectCb?.();
        } else {
          const err = Object.assign(new Error("ECONNREFUSED"), {
            code: "ECONNREFUSED",
          });
          for (const h of this._errorHandlers) h(err);
        }
      });
      return this;
    }

    destroy() {}
  }

  // Minimal createServer stub for findFreePort (not under test here)
  const createServer = () => ({
    listen: (_port: number, _host: string, cb?: () => void) => cb?.(),
    address: () => ({ port: 12345 }),
    close: (cb?: () => void) => cb?.(),
    on: () => {},
  });

  return { Socket: MockSocket, createServer };
});

// Dynamic import AFTER mock.module so server.ts sees the mocked node:net
const { isServerAlive } = await import("../../src/cli/server");

describe("isServerAlive", () => {
  // biome-ignore lint/suspicious/noExplicitAny: spyOn returns any mock shape
  let killSpy: any;

  beforeEach(() => {
    mockSocketBehavior = "error";
    // Default: process.kill succeeds (signal 0 means process exists)
    killSpy = spyOn(process, "kill").mockImplementation(() => true as never);
  });

  afterEach(() => {
    killSpy.mockRestore();
  });

  it("returns false when process.kill throws ESRCH (process does not exist)", async () => {
    killSpy.mockImplementation(() => {
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    });

    const result = await isServerAlive(99999);
    expect(result).toBe(false);
  });

  it("returns false when process.kill throws EPERM and TCP probe fails", async () => {
    killSpy.mockImplementation(() => {
      throw Object.assign(new Error("operation not permitted"), {
        code: "EPERM",
      });
    });
    mockSocketBehavior = "error";

    const result = await isServerAlive(99999, 19999);
    expect(result).toBe(false);
  });

  it("returns true when process.kill throws EPERM and TCP probe succeeds", async () => {
    killSpy.mockImplementation(() => {
      throw Object.assign(new Error("operation not permitted"), {
        code: "EPERM",
      });
    });
    mockSocketBehavior = "connect";

    const result = await isServerAlive(99999, 19999);
    expect(result).toBe(true);
  });

  it("returns true when process is alive and no port is given", async () => {
    killSpy.mockImplementation(() => true as never);

    const result = await isServerAlive(99999);
    expect(result).toBe(true);
  });

  it("returns true when process is alive and TCP probe succeeds", async () => {
    killSpy.mockImplementation(() => true as never);
    mockSocketBehavior = "connect";

    const result = await isServerAlive(99999, 19999);
    expect(result).toBe(true);
  });

  it("returns false when process is alive but TCP probe fails", async () => {
    killSpy.mockImplementation(() => true as never);
    mockSocketBehavior = "error";

    const result = await isServerAlive(99999, 19999);
    expect(result).toBe(false);
  });
});
