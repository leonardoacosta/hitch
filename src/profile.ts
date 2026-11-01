import { existsSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { createBindingStore, type WorkspaceApi } from "./binding/store.ts";
import { assertTrusted } from "./context/trust.ts";
import { selectContext, type Folder, type SelectInput } from "./context/select.ts";
import { mapSettings, type Settings } from "./config/map.ts";
import { createHerdrClient, type Exec as HerdrExec, type WorkspaceClient } from "./herdr/client.ts";
import { createTerminalService, type PaneChoice } from "./terminal/service.ts";

export function findHerdr(pathVar = process.env.PATH ?? "", exists: (p: string) => boolean = existsSync, home = process.env.HOME): string {
  const dirs = pathVar.split(delimiter);
  if (home) dirs.push(join(home, ".local", "bin"));
  for (const d of dirs) {
    const p = join(d, "herdr");
    if (d && isAbsolute(p) && exists(p)) return p;
  }
  throw new Error("herdr not found on PATH or in $HOME/.local/bin. Install herdr first.");
}

export function workspaceApi(herdr: WorkspaceClient): WorkspaceApi {
  return { createWorkspace: (cwd, label) => herdr.createWorkspace(cwd, label), workspaceExists: (id) => herdr.workspaceExists(id), serverInstance: () => herdr.serverInstance() };
}

export function buildService(storageDir: string, bin?: string, exec?: HerdrExec, env?: NodeJS.ProcessEnv) {
  const b = bin ?? findHerdr();
  const herdr = createHerdrClient({ bin: b, exec, env });
  const store = createBindingStore(storageDir, workspaceApi(herdr));
  // isBusy intentionally unset: `herdr pane get` exposes no controller/attach field.
  return Object.assign(createTerminalService({ herdr, store }), { rebind: (root: string) => store.rebind(root), adopt: (root: string, id: string) => store.adopt(root, id), listWorkspaces: () => herdr.listWorkspaces() });
}

export interface ReattachItem { label: string; description: string; terminalId: string }
export function reattachItems(choices: PaneChoice[]): ReattachItem[] {
  return choices.map((c) => ({ label: c.pane.paneId, description: c.label, terminalId: c.id }));
}

export interface ProfileInput {
  isTrusted: boolean;
  storageDir: string;
  select: Omit<SelectInput, "pick"> & { pick: SelectInput["pick"] };
  bin?: string;
  exec?: HerdrExec;
  env?: NodeJS.ProcessEnv;
  settings?: Settings;
  setKeys?: readonly string[];
}
export interface ProfileOptions { name: string; shellPath: string; shellArgs: string[]; cwd: string; isTransient: true; env: Record<string, string | null>; diagnostics: string[] }

/** Trust -> select folder -> bind workspace -> open pane -> attach profile options. Throws on any failure. */
export async function resolveProfileOptions(i: ProfileInput): Promise<ProfileOptions> {
  assertTrusted(i.isTrusted);
  const sel = await selectContext(i.select);
  if (sel.kind === "cancelled") throw new Error("Hitch: no folder chosen; terminal not opened.");
  if (sel.kind === "none") throw new Error(`Hitch: ${sel.reason}.`);
  const bin = i.bin ?? findHerdr();
  const service = buildService(i.storageDir, bin, i.exec, i.env);
  const s = await service.open(sel.folder.fsPath);
  const m = mapSettings(i.settings ?? {}, sel.folder.fsPath, i.setKeys);
  const env: Record<string, string | null> = { ...m.env };
  for (const k of m.deleted) env[k] = null;
  return { name: "Hitch", shellPath: s.shellPath, shellArgs: s.shellArgs, cwd: m.cwd, isTransient: s.isTransient, env, diagnostics: m.diagnostics };
}
export type { Folder };
