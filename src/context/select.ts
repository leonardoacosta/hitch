export interface Folder { uri: string; fsPath: string; scheme: string }
export interface SelectInput {
  explicit?: string;
  activeEditorFsPath?: string;
  folders: readonly Folder[];
  pick: (folders: readonly Folder[]) => Promise<Folder | undefined>;
}
export type Selection = { kind: "folder"; folder: Folder } | { kind: "cancelled" } | { kind: "none"; reason: string };

const inside = (p: string, root: string) => p === root || p.startsWith(root.endsWith("/") ? root : root + "/");

/** Deepest folder containing path; only local-host file folders qualify. */
export function folderFor(path: string, folders: readonly Folder[]): Folder | undefined {
  if (!path.startsWith("/") || path.split("/").includes("..")) return undefined;
  return folders.filter((f) => f.scheme === "file" && inside(path, f.fsPath)).sort((a, b) => b.fsPath.length - a.fsPath.length)[0];
}

/** Precedence: explicit > active editor > sole folder > picker. Never throws, never mutates. */
export async function selectContext(i: SelectInput): Promise<Selection> {
  const usable = i.folders.filter((f) => f.scheme === "file");
  if (usable.length === 0) return { kind: "none", reason: "no local-host workspace folder" };
  for (const p of [i.explicit, i.activeEditorFsPath]) {
    if (p === undefined) continue;
    const f = folderFor(p, usable);
    if (f) return { kind: "folder", folder: f };
    if (p === i.explicit) return { kind: "none", reason: "explicit path is outside workspace folders" };
  }
  if (usable.length === 1) return { kind: "folder", folder: usable[0] };
  const picked = await i.pick(usable);
  return picked ? { kind: "folder", folder: picked } : { kind: "cancelled" };
}
