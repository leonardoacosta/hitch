import { realpathSync, statSync } from "node:fs";
import { basename } from "node:path";

export interface DiagnoseInput {
  args: string[];
  env: Record<string, string | undefined>;
  herdrVersion?: () => string | undefined;
}
export interface DiagnoseOutput { code: number; text: string; }

export function resolveProject(args: string[], env: Record<string, string | undefined>): string | undefined {
  const i = args.indexOf("--project");
  const fromArg = i >= 0 ? args[i + 1] : undefined;
  return fromArg || env.HERDR_ACTIVE_PANE_CWD || undefined;
}

export function diagnose(input: DiagnoseInput): DiagnoseOutput {
  const raw = resolveProject(input.args, input.env);
  if (!raw) {
    return { code: 2, text: "hitch: missing project. Pass --project <dir> or run from a focused Herdr pane (HERDR_ACTIVE_PANE_CWD). No action taken.\n" };
  }
  let root: string;
  try {
    root = realpathSync(raw);
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
  } catch {
    return { code: 2, text: `hitch: project path is not an accessible directory: ${raw}. No action taken.\n` };
  }
  const ssh = Boolean(input.env.SSH_CONNECTION || input.env.SSH_TTY);
  const version = input.herdrVersion?.() ?? "unknown";
  const lines = [
    "Hitch companion diagnostic (read-only)",
    `Project: ${basename(root)}`,
    `Canonical root: ${root}`,
    `Herdr workspace: ${input.env.HERDR_ACTIVE_WORKSPACE_ID ?? "unknown"}`,
    `Herdr version: ${version}`,
    `This host session: ${ssh ? "reached over SSH" : "local or non-SSH"}`,
    "",
    "Reconnect instructions:",
    "  1. In your editor, connect to this host with Remote SSH and open the folder above.",
    "  2. Run the Hitch terminal command; it binds to the canonical root, not the shell cwd.",
    "  3. If the pane is gone, Hitch creates a new one for the same project.",
    "",
    "Note: this action cannot launch or focus an editor from a headless host.",
  ];
  return { code: 0, text: lines.join("\n") + "\n" };
}
