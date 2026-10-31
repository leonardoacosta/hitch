export interface PaneRef { workspaceId: string; paneId: string; terminalId: string; }
export interface ExecResult { code: number; stdout: string; stderr: string; }
export interface HerdrClient {
  version(): Promise<string>;
  createPane(workspaceId: string, cwd: string): Promise<PaneRef>;
  listPanes(workspaceId: string): Promise<PaneRef[]>;
  attachArgv(pane: PaneRef): { shellPath: string; shellArgs: string[] };
}
export interface Binding { projectRoot: string; workspaceId: string; }
export interface BindingStore {
  get(projectRoot: string): Promise<Binding | undefined>;
  bind(projectRoot: string): Promise<Binding>;
}
