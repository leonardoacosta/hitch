export interface Settings {
  env?: Record<string, string | null>;
  cwd?: string;
  unsupported?: Record<string, unknown>;
}
export interface Mapped { cwd: string; env: Record<string, string>; deleted: string[]; diagnostics: string[] }

export const SECRET_KEY = /(token|secret|passw|credential|api[_-]?key|private|auth)/i;
export const MAX_VAR_LEN = 4096;
/** Settings we know exist but cannot honor on a Herdr-owned shell. */
export const UNSUPPORTED = [
  "terminal.integrated.shell.linux", "terminal.integrated.shellArgs.linux", "terminal.integrated.inheritEnv",
  "terminal.integrated.cwd", "terminal.integrated.automationProfile.linux", "terminal.integrated.environmentChangesRelaunch",
];

/** Resolves only ${workspaceFolder}; any other ${...} is left unresolved and reported. Bounded, single pass. */
export function resolveVars(v: string, folder: string, diag: string[], key: string): string {
  const out = v.replace(/\$\{([^}]*)\}/g, (m, n: string) => {
    if (n === "workspaceFolder") return folder;
    diag.push(`${key}: unsupported variable \${${n}} left literal`);
    return m;
  });
  if (out.length > MAX_VAR_LEN) { diag.push(`${key}: value exceeds ${MAX_VAR_LEN} chars, dropped`); return ""; }
  return out;
}

/** Creation-time mapping. Env goes to the process env block only (never argv/title). Null deletes. */
export function mapSettings(s: Settings, folder: string, setKeys: readonly string[] = []): Mapped {
  const diagnostics: string[] = [];
  const env: Record<string, string> = {};
  const deleted: string[] = [];
  for (const [k, v] of Object.entries(s.env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) { diagnostics.push(`env key rejected: ${redact(k)}`); continue; }
    if (v === null) deleted.push(k);
    else env[k] = resolveVars(v, folder, diagnostics, k);
  }
  for (const k of setKeys) if (UNSUPPORTED.includes(k)) diagnostics.push(`${k}: unsupported, ignored (backend-owned)`);
  return { cwd: folder, env, deleted, diagnostics };
}

/** Safe for logs/titles/state: names only, never values; secret-looking names masked. */
export function redact(name: string): string {
  return SECRET_KEY.test(name) ? "<redacted-name>" : name.slice(0, 64);
}
export function describe(m: Mapped): string {
  return `cwd=${m.cwd} env=[${Object.keys(m.env).map(redact).join(",")}] deleted=[${m.deleted.map(redact).join(",")}] diagnostics=${m.diagnostics.length}`;
}
