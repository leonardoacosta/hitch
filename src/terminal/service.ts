import type { HerdrClient, BindingStore, PaneRef } from "../types.ts";

export class StalePaneError extends Error {}
export class BusyControllerError extends Error {}

export interface PaneChoice { id: string; label: string; pane: PaneRef; busy?: boolean; }
export interface TerminalSession {
  pane: PaneRef;
  shellPath: string;
  shellArgs: string[];
  /** Transient: tells the editor not to auto-revive this terminal on reload. */
  isTransient: true;
  /** Detach only: ends the local attach client. Never closes or stops the pane. */
  dispose(): void;
}
export interface TerminalServiceOptions {
  herdr: HerdrClient;
  store: BindingStore;
  /** Optional busy-controller lookup. Unset in production: herdr 0.9.5 exposes no controller field. */
  isBusy?: (pane: PaneRef) => Promise<boolean>;
  onDetach?: (pane: PaneRef) => void;
}

const sessionFor = (o: TerminalServiceOptions, pane: PaneRef): TerminalSession => {
  const { shellPath, shellArgs } = o.herdr.attachArgv(pane);
  if (shellArgs.includes("--takeover")) throw new Error("takeover attach is never permitted");
  let done = false;
  return { pane, shellPath, shellArgs, isTransient: true, dispose() { if (!done) { done = true; o.onDetach?.(pane); } } };
};

/**
 * Terminal behaviour for human-opened Hitch terminals. The editor and Herdr keep
 * independent layouts: each editor terminal maps to one Herdr pane in the project's
 * bound workspace, and closing the editor terminal never changes Herdr's layout.
 */
export function createTerminalService(o: TerminalServiceOptions) {
  const claimed = new Set<string>(); // terminalIds already handed to an editor terminal this process

  return {
    /** New/Split: one pane per request, in the project's bound workspace. */
    async open(projectRoot: string): Promise<TerminalSession> {
      const existed = await o.store.get(projectRoot);
      const binding = existed ?? (await o.store.bind(projectRoot));
      let pane: PaneRef | undefined;
      if (!existed) {
        // Fresh workspace: its initial pane is consumed exactly once.
        const first = (await o.herdr.listPanes(binding.workspaceId)).filter((p) => !claimed.has(p.terminalId));
        if (first.length === 1) pane = first[0];
      }
      if (!pane) pane = await o.herdr.createPane(binding.workspaceId, binding.projectRoot);
      claimed.add(pane.terminalId);
      try {
        return sessionFor(o, pane);
      } catch (e) {
        // Pane stays in Herdr and is recoverable via list/attach.
        throw new Error(`Created pane ${pane.paneId} but could not attach: ${(e as Error).message}. It remains in workspace ${pane.workspaceId}.`);
      }
    },

    /** Panes of this project's bound workspace only. */
    async list(projectRoot: string): Promise<PaneChoice[]> {
      const b = await o.store.get(projectRoot);
      if (!b) return [];
      const panes = (await o.herdr.listPanes(b.workspaceId)).filter((p) => p.workspaceId === b.workspaceId);
      return Promise.all(panes.map(async (pane) => {
        const busy = o.isBusy ? await o.isBusy(pane) : undefined;
        return { id: pane.terminalId, pane, busy, label: `${pane.paneId} (${pane.terminalId})${busy ? " [in use]" : ""}` };
      }));
    },

    /** Attach to an existing pane by stable terminal id; never creates a replacement. */
    async attach(projectRoot: string, terminalId: string): Promise<TerminalSession> {
      const b = await o.store.get(projectRoot);
      const pane = b && (await o.herdr.listPanes(b.workspaceId)).find((p) => p.terminalId === terminalId && p.workspaceId === b.workspaceId);
      if (!pane) throw new StalePaneError(`Terminal ${terminalId} no longer exists in this project's Herdr workspace. Pick another pane or start a new terminal; nothing was created.`);
      if (o.isBusy && (await o.isBusy(pane)))
        throw new BusyControllerError(`Terminal ${terminalId} is controlled by another client. Detach it there and retry. Hitch never forces a takeover; no keys were replayed.`);
      return sessionFor(o, pane);
    },
  };
}
