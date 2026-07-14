import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentRuntimeState } from "../shared/ipc";
import { getFreePort } from "./ports";

interface Running {
  proc: ChildProcess;
  port: number;
  status: AgentRuntimeState["status"];
  error: string | null;
  stopping: boolean;
  logs: string[];
}

type StatusListener = (state: AgentRuntimeState) => void;

/**
 * Spawns and supervises one `eve dev --no-ui --port <N>` child per agent.
 * Loopback needs no auth, so the renderer/session-proxy just talks to the port.
 */
export class AgentManager {
  private readonly running = new Map<string, Running>();
  private readonly listeners = new Set<StatusListener>();

  onStatus(cb: StatusListener): void {
    this.listeners.add(cb);
  }

  private emit(agentId: string): void {
    const state = this.state(agentId);
    for (const cb of this.listeners) {
      cb(state);
    }
  }

  url(agentId: string): string | null {
    const r = this.running.get(agentId);
    return r && r.status === "running" ? `http://127.0.0.1:${r.port}` : null;
  }

  state(agentId: string): AgentRuntimeState {
    const r = this.running.get(agentId);
    if (!r) {
      return { agentId, status: "stopped", port: null, url: null, error: null };
    }
    return {
      agentId,
      status: r.status,
      port: r.port,
      url: `http://127.0.0.1:${r.port}`,
      error: r.error,
    };
  }

  async start(agentId: string, agentPath: string): Promise<AgentRuntimeState> {
    const existing = this.running.get(agentId);
    if (existing && (existing.status === "running" || existing.status === "starting")) {
      return this.state(agentId);
    }

    const port = await getFreePort();
    const bin = this.resolveEveBin(agentPath);
    const proc = spawn(
      bin.cmd,
      [...bin.pre, "dev", "--no-ui", "--port", String(port)],
      {
        cwd: agentPath,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const rec: Running = {
      proc,
      port,
      status: "starting",
      error: null,
      stopping: false,
      logs: [],
    };
    this.running.set(agentId, rec);
    this.emit(agentId);

    const capture = (buf: Buffer): void => {
      rec.logs.push(buf.toString());
      if (rec.logs.length > 200) {
        rec.logs.shift();
      }
    };
    proc.stdout?.on("data", capture);
    proc.stderr?.on("data", capture);

    proc.on("error", (err) => {
      if (this.running.get(agentId) !== rec) {
        return;
      }
      rec.status = "error";
      rec.error = err.message;
      this.emit(agentId);
    });

    proc.on("exit", (code) => {
      if (this.running.get(agentId) !== rec) {
        return;
      }
      if (rec.stopping) {
        this.running.delete(agentId);
        this.emit(agentId);
        return;
      }
      rec.status = "error";
      if (!rec.error) {
        rec.error = `Dev server exited (code ${code}).\n${rec.logs.slice(-4).join("")}`.slice(0, 600);
      }
      this.emit(agentId);
    });

    const healthy = await this.waitHealthy(port, 60_000);
    if (this.running.get(agentId) !== rec) {
      return this.state(agentId);
    }
    if (healthy) {
      rec.status = "running";
      rec.error = null;
    } else if (rec.status !== "error") {
      rec.status = "error";
      rec.error = "Dev server did not become healthy in time.";
    }
    this.emit(agentId);
    return this.state(agentId);
  }

  stop(agentId: string): void {
    const r = this.running.get(agentId);
    if (!r) {
      return;
    }
    r.stopping = true;
    try {
      r.proc.kill("SIGTERM");
    } catch {
      // already gone
    }
  }

  stopAll(): void {
    for (const [, r] of this.running) {
      r.stopping = true;
      try {
        r.proc.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
    this.running.clear();
  }

  private async waitHealthy(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/eve/v1/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          return true;
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  }

  private resolveEveBin(agentPath: string): { cmd: string; pre: string[] } {
    const local = join(agentPath, "node_modules", ".bin", "eve");
    if (existsSync(local)) {
      return { cmd: local, pre: [] };
    }
    return { cmd: process.platform === "win32" ? "npx.cmd" : "npx", pre: ["eve"] };
  }
}
