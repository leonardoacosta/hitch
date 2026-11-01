import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import type { ExecResult, HerdrClient, PaneRef } from "../types.ts";

export type Exec = (bin: string, args: string[], env: NodeJS.ProcessEnv) => Promise<ExecResult>;

export const defaultExec: Exec = (bin, args, env) =>
  new Promise((resolve) => {
    execFile(bin, args, { env, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
      if (e && e.code === "ENOENT") return resolve({ code: 127, stdout: "", stderr: "ENOENT" });
      if (e && e.code === "EACCES") return resolve({ code: 126, stdout: "", stderr: "EACCES" });
      resolve({ code: e ? (typeof e.code === "number" ? e.code : 1) : 0, stdout, stderr });
    });
  });

export class HerdrError extends Error {}

const CONFLICTING = ["HERDR_SOCKET_PATH", "HERDR_SESSION", "HERDR_PANE_ID", "HERDR_ENV"];

export interface HerdrOptions {
  bin?: string;
  exec?: Exec;
  env?: NodeJS.ProcessEnv;
  stat?: (path: string) => Promise<{ ino: number; birthtimeMs: number }>;
}

/** Wraps the herdr CLI. Never starts a daemon or falls back to a local shell. */
export type WorkspaceClient = HerdrClient & {
  createWorkspace(cwd: string, label: string): Promise<string>;
  workspaceExists(id: string): Promise<boolean>;
  listWorkspaces(): Promise<{ workspaceId: string; label: string }[]>;
  serverInstance(): Promise<string>;
};

export function createHerdrClient(opts: HerdrOptions = {}): WorkspaceClient {
  const bin = opts.bin ?? "herdr";
  const exec = opts.exec ?? defaultExec;
  const env = opts.env ?? process.env;

  const guard = () => {
    const set = CONFLICTING.filter((k) => env[k]);
    if (set.length) throw new HerdrError(`Conflicting inherited herdr variables set: ${set.join(", ")}. Unset them to use the default session.`);
  };
  const run = async (args: string[]): Promise<ExecResult> => {
    guard();
    const r = await exec(bin, args, env);
    if (r.code === 126 || /permission denied|EACCES/i.test(r.stderr)) throw new HerdrError("herdr not executable or socket permission denied. Check the binary and socket permissions.");
    if (r.code === 127) throw new HerdrError(`herdr binary not found (${bin}). Install herdr and ensure it is on PATH.`);
    if (r.code !== 0) throw new HerdrError(`herdr ${args.slice(0, 2).join(" ")} failed (exit ${r.code}): ${r.stderr.trim()}`);
    return r;
  };
  const json = (r: ExecResult): any => {
    try { return JSON.parse(r.stdout).result; } catch { throw new HerdrError("herdr returned unparseable output"); }
  };

  const listWorkspaces = async () => {
    const list = json(await run(["workspace", "list"]))?.workspaces;
    if (!Array.isArray(list)) throw new HerdrError("unexpected herdr workspace list output");
    return list.filter((w: any) => typeof w?.workspace_id === "string").map((w: any) => ({ workspaceId: w.workspace_id as string, label: String(w.label ?? "") }));
  };

  let checked: Promise<string> | undefined;
  return {
    async createWorkspace(cwd, label) {
      const r = json(await run(["workspace", "create", "--cwd", cwd, "--label", label, "--no-focus"]));
      const id = r?.workspace?.workspace_id ?? r?.root_pane?.workspace_id;
      if (typeof id !== "string") throw new HerdrError("unexpected herdr workspace create output");
      return id;
    },
    async workspaceExists(id) {
      return (await listWorkspaces()).some((w) => w.workspaceId === id);
    },
    listWorkspaces,
    /** Herdr has no server id; the socket is recreated on each server start, so path+inode+birth time identifies one run. */
    async serverInstance() {
      const r = await run(["status", "server", "--json"]);
      let socket: unknown;
      try { socket = JSON.parse(r.stdout).socket; } catch { throw new HerdrError("herdr returned unparseable output"); }
      if (typeof socket !== "string") throw new HerdrError("herdr status did not report a server socket");
      const s = await (opts.stat ?? stat)(socket).catch(() => { throw new HerdrError(`herdr server socket ${socket} is not readable. Is the herdr server running?`); });
      return `${socket}:${s.ino}:${s.birthtimeMs}`;
    },
    async version() {
      const out = (await run(["--version"])).stdout.trim();
      const m = /^herdr (\d+)\.(\d+)\.(\d+)/.exec(out);
      if (!m) throw new HerdrError(`Unexpected herdr version output: ${out}`);
      const v = `${m[1]}.${m[2]}.${m[3]}`;
      if (Number(m[1]) === 0 && (Number(m[2]) < 9 || (Number(m[2]) === 9 && Number(m[3]) < 5))) throw new HerdrError(`herdr ${v} is incompatible; 0.9.5 or newer is required.`);
      return v;
    },
    async createPane(workspaceId, cwd) {
      const res = json(await run(["tab", "create", "--workspace", workspaceId, "--cwd", cwd]));
      const pane = res?.root_pane ?? res?.pane;
      const paneId = pane?.pane_id ?? res?.pane_id;
      const terminalId = pane?.terminal_id ?? res?.terminal_id;
      if (!paneId || !terminalId) throw new HerdrError("herdr tab create returned no pane/terminal id");
      return { workspaceId, paneId, terminalId };
    },
    async listPanes(workspaceId) {
      await (checked ??= this.version().catch((e) => { checked = undefined; throw e; }));
      const res = json(await run(["pane", "list", "--workspace", workspaceId]));
      return (res?.panes ?? []).map((p: any): PaneRef => ({ workspaceId: p.workspace_id, paneId: p.pane_id, terminalId: p.terminal_id }));
    },
    attachArgv(pane: PaneRef) {
      // Per-terminal stream attach; never --takeover.
      return { shellPath: bin, shellArgs: ["terminal", "attach", pane.terminalId] };
    },
  };
}
