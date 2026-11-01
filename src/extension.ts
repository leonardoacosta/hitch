import * as vscode from "vscode";
import { UNSUPPORTED, type Settings } from "./config/map.ts";
import { buildService, reattachItems, resolveProfileOptions } from "./profile.ts";
import { assertTrusted } from "./context/trust.ts";
import { selectContext, type Folder } from "./context/select.ts";

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.window.registerTerminalProfileProvider("hitch.herdr", {
      async provideTerminalProfile() {
        try {
          const folders = workspaceFolders();
          const term = vscode.workspace.getConfiguration();
          const setKeys = UNSUPPORTED.filter((k) => {
            const i = term.inspect(k);
            return i?.globalValue !== undefined || i?.workspaceValue !== undefined || i?.workspaceFolderValue !== undefined;
          });
          const settings: Settings = { env: term.get<Record<string, string | null>>("terminal.integrated.env.linux") ?? {} };
          const opts = await resolveProfileOptions({
            isTrusted: vscode.workspace.isTrusted,
            settings,
            setKeys,
            storageDir: ctx.globalStorageUri.fsPath,
            select: {
              folders,
              activeEditorFsPath: activeEditorPath(),
              pick: pickFrom,
            },
          });
          const { diagnostics, ...term_ } = opts;
          for (const d of diagnostics) void vscode.window.showWarningMessage(`Hitch: ${d}`);
          return new vscode.TerminalProfile(term_);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          void vscode.window.showErrorMessage(`Hitch: ${msg}`);
          throw e;
        }
      },
    }),
    vscode.commands.registerCommand("hitch.reattach", async () => {
      try {
        assertTrusted(vscode.workspace.isTrusted);
        const folder = await pickFolder();
        if (!folder) return;
        const service = buildService(ctx.globalStorageUri.fsPath);
        const items = reattachItems(await service.list(folder.fsPath));
        if (!items.length) return void vscode.window.showInformationMessage("Hitch: no panes in this project's workspace.");
        const pick = await vscode.window.showQuickPick(items, { placeHolder: "Hitch: attach to pane" });
        if (!pick) return;
        const s = await service.attach(folder.fsPath, pick.terminalId);
        vscode.window.createTerminal({ name: "Hitch", shellPath: s.shellPath, shellArgs: s.shellArgs, isTransient: true }).show();
      } catch (e) {
        void vscode.window.showErrorMessage(`Hitch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand("hitch.adopt", async () => {
      try {
        assertTrusted(vscode.workspace.isTrusted);
        const folder = await pickFolder();
        if (!folder) return;
        const service = buildService(ctx.globalStorageUri.fsPath);
        const items = (await service.listWorkspaces()).map((w) => ({ label: w.label || w.workspaceId, description: w.workspaceId, id: w.workspaceId }));
        if (!items.length) return void vscode.window.showInformationMessage("Hitch: no Herdr workspaces to adopt.");
        const pick = await vscode.window.showQuickPick(items, { placeHolder: `Hitch: Herdr workspace to bind to ${folder.fsPath}` });
        if (!pick) return;
        const ok = await vscode.window.showWarningMessage(`Hitch: bind ${folder.fsPath} to existing workspace ${pick.id}? Any previous binding is replaced; no workspace is changed.`, { modal: true }, "Adopt");
        if (ok !== "Adopt") return;
        const b = await service.adopt(folder.fsPath, pick.id);
        void vscode.window.showInformationMessage(`Hitch: bound to workspace ${b.workspaceId}.`);
      } catch (e) {
        void vscode.window.showErrorMessage(`Hitch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand("hitch.rebind", async () => {
      try {
        assertTrusted(vscode.workspace.isTrusted);
        const folder = await pickFolder();
        if (!folder) return;
        const ok = await vscode.window.showWarningMessage("Hitch: bind this project to a new Herdr workspace? The old workspace is left untouched.", { modal: true }, "Rebind");
        if (ok !== "Rebind") return;
        const b = await buildService(ctx.globalStorageUri.fsPath).rebind(folder.fsPath);
        void vscode.window.showInformationMessage(`Hitch: bound to workspace ${b.workspaceId}.`);
      } catch (e) {
        void vscode.window.showErrorMessage(`Hitch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
}
export function deactivate(): void {}

const workspaceFolders = (): Folder[] => (vscode.workspace.workspaceFolders ?? []).map((f) => ({ uri: f.uri.toString(), fsPath: f.uri.fsPath, scheme: f.uri.scheme }));
const activeEditorPath = () => vscode.window.activeTextEditor?.document.uri.scheme === "file" ? vscode.window.activeTextEditor.document.uri.fsPath : undefined;
const pickFrom = async (fs: readonly Folder[]) => (await vscode.window.showQuickPick(fs.map((f) => ({ label: f.fsPath, f })), { placeHolder: "Hitch: choose a folder" }))?.f;

/** Same precedence as the terminal profile: active editor's folder, sole folder, then picker. */
async function pickFolder(): Promise<Folder | undefined> {
  const s = await selectContext({ folders: workspaceFolders(), activeEditorFsPath: activeEditorPath(), pick: pickFrom });
  if (s.kind === "none") throw new Error(s.reason);
  return s.kind === "folder" ? s.folder : undefined;
}
