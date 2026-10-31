import * as vscode from "vscode";
import { UNSUPPORTED, type Settings } from "./config/map.ts";
import { buildService, reattachItems, resolveProfileOptions } from "./profile.ts";
import { assertTrusted } from "./context/trust.ts";

export function activate(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.window.registerTerminalProfileProvider("hitch.herdr", {
      async provideTerminalProfile() {
        try {
          const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => ({ uri: f.uri.toString(), fsPath: f.uri.fsPath, scheme: f.uri.scheme }));
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
              activeEditorFsPath: vscode.window.activeTextEditor?.document.uri.scheme === "file" ? vscode.window.activeTextEditor.document.uri.fsPath : undefined,
              pick: async (fs) => {
                const p = await vscode.window.showQuickPick(fs.map((f) => ({ label: f.fsPath, f })), { placeHolder: "Hitch: choose a folder" });
                return p?.f;
              },
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
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder || folder.uri.scheme !== "file") throw new Error("open a local folder first");
        const service = buildService(ctx.globalStorageUri.fsPath);
        const items = reattachItems(await service.list(folder.uri.fsPath));
        if (!items.length) return void vscode.window.showInformationMessage("Hitch: no panes in this project's workspace.");
        const pick = await vscode.window.showQuickPick(items, { placeHolder: "Hitch: attach to pane" });
        if (!pick) return;
        const s = await service.attach(folder.uri.fsPath, pick.terminalId);
        vscode.window.createTerminal({ name: "Hitch", shellPath: s.shellPath, shellArgs: s.shellArgs, isTransient: true }).show();
      } catch (e) {
        void vscode.window.showErrorMessage(`Hitch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand("hitch.rebind", async () => {
      try {
        assertTrusted(vscode.workspace.isTrusted);
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder || folder.uri.scheme !== "file") throw new Error("open a local folder first");
        const ok = await vscode.window.showWarningMessage("Hitch: bind this project to a new Herdr workspace? The old workspace is left untouched.", { modal: true }, "Rebind");
        if (ok !== "Rebind") return;
        const b = await buildService(ctx.globalStorageUri.fsPath).rebind(folder.uri.fsPath);
        void vscode.window.showInformationMessage(`Hitch: bound to workspace ${b.workspaceId}.`);
      } catch (e) {
        void vscode.window.showErrorMessage(`Hitch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
}
export function deactivate(): void {}
