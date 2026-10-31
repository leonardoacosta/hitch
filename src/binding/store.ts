import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Binding, BindingStore } from "../types.ts";

export interface WorkspaceApi {
  createWorkspace(cwd: string, label: string): Promise<string>;
  workspaceExists(id: string): Promise<boolean>;
  /** Opaque id of the running herdr server; changes on restart. Optional. */
  serverInstance?(): Promise<string>;
}

export class BindingStaleError extends Error {}
export type ExplicitBindingStore = BindingStore & {
  rebind(projectRoot: string): Promise<Binding>;
  adopt(projectRoot: string, workspaceId: string): Promise<Binding>;
};

export class BindingLockError extends Error {}

interface Index { bindings: Record<string, string>; instances: Record<string, string>; pending: Record<string, true>; }

export async function canonicalRoot(p: string): Promise<string> {
  return fs.realpath(p);
}
export const labelFor = (root: string) => path.basename(root);

async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export function createBindingStore(dir: string, api: WorkspaceApi, opts: { lockWaitMs?: number } = {}): ExplicitBindingStore {
  const indexFile = path.join(dir, "bindings.json");
  const lockFile = path.join(dir, "bindings.lock");
  const wait = opts.lockWaitMs ?? 5000;

  const load = async (): Promise<Index> => {
    try {
      const j = JSON.parse(await fs.readFile(indexFile, "utf8"));
      return { bindings: j.bindings ?? {}, pending: j.pending ?? {}, instances: j.instances ?? {} };
    } catch (e: any) {
      if (e.code === "ENOENT") return { bindings: {}, pending: {}, instances: {} };
      throw e;
    }
  };
  const save = (i: Index) => writeAtomic(indexFile, JSON.stringify(i, null, 2));

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    await fs.mkdir(dir, { recursive: true });
    const deadline = Date.now() + wait;
    for (;;) {
      try {
        const tmp = `${lockFile}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
        await fs.writeFile(tmp, String(process.pid));
        try { await fs.link(tmp, lockFile); } finally { await fs.rm(tmp, { force: true }); }
        break;
      } catch (e: any) {
        if (e.code !== "EEXIST") throw e;
        const holder = Number.parseInt(await fs.readFile(lockFile, "utf8").catch(() => ""), 10);
        if (Number.isInteger(holder) && holder > 0) {
          try { process.kill(holder, 0); } catch (k: any) {
            if (k.code === "ESRCH") throw new BindingLockError(`Binding lock ${lockFile} belongs to dead process ${holder}. Remove that file manually and retry; It is never taken over or deleted automatically.`);
          }
        }
        if (Date.now() > deadline)
          throw new BindingLockError(`Binding lock ${lockFile} is held. If no Hitch window is binding, verify and remove it manually; it is never taken over automatically.`);
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    try { return await fn(); } finally { await fs.rm(lockFile, { force: true }); }
  };

  const live = async (idx: Index, root: string) => {
    const id = idx.bindings[root];
    if (!id) return false;
    if (api.serverInstance && idx.instances[root] !== (await api.serverInstance())) return false;
    return api.workspaceExists(id);
  };
  const create = async (idx: Index, root: string): Promise<Binding> => {
    idx.pending[root] = true;
    await save(idx);
    const id = await api.createWorkspace(root, labelFor(root));
    delete idx.pending[root];
    idx.bindings[root] = id;
    if (api.serverInstance) idx.instances[root] = await api.serverInstance();
    await save(idx);
    return { projectRoot: root, workspaceId: id };
  };
  const guardPending = (idx: Index, root: string) => {
    if (idx.pending[root])
      throw new BindingLockError(`A previous bind for ${root} was interrupted and may have created a workspace. Check herdr workspaces, adopt it explicitly, or remove the pending entry in ${indexFile}.`);
  };

  return {
    async get(projectRoot) {
      const root = await canonicalRoot(projectRoot);
      const idx = await load();
      // Stale or other-server bindings are never returned.
      return (await live(idx, root)) ? { projectRoot: root, workspaceId: idx.bindings[root]! } : undefined;
    },
    async bind(projectRoot) {
      const root = await canonicalRoot(projectRoot);
      return withLock(async (): Promise<Binding> => {
        const idx = await load();
        if (await live(idx, root)) return { projectRoot: root, workspaceId: idx.bindings[root]! };
        if (idx.bindings[root])
          throw new BindingStaleError(`Binding for ${root} points to ${idx.bindings[root]}, which is missing or from another herdr server instance. Rebind or adopt explicitly.`);
        guardPending(idx, root);
        return create(idx, root);
      });
    },
    async rebind(projectRoot) {
      const root = await canonicalRoot(projectRoot);
      return withLock(async () => {
        const idx = await load();
        guardPending(idx, root);
        delete idx.bindings[root]; delete idx.instances[root];
        return create(idx, root);
      });
    },
    async adopt(projectRoot, workspaceId) {
      const root = await canonicalRoot(projectRoot);
      return withLock(async () => {
        if (!(await api.workspaceExists(workspaceId))) throw new BindingStaleError(`Workspace ${workspaceId} does not exist.`);
        const idx = await load();
        for (const [r, id] of Object.entries(idx.bindings))
          if (id === workspaceId && r !== root) throw new BindingStaleError(`Workspace ${workspaceId} is already bound to ${r}.`);
        idx.bindings[root] = workspaceId; delete idx.pending[root];
        if (api.serverInstance) idx.instances[root] = await api.serverInstance();
        await save(idx);
        return { projectRoot: root, workspaceId };
      });
    },
  };
}
