# Hitch compatibility table (v1)

Scope: human-opened terminals only. No Cursor Agent routing. Linux workspace host only.

| Setting / behavior | Class | Notes |
|---|---|---|
| `terminal.integrated.env.linux` | mapped | Creation time only, process env block, never argv/title/logs. `null` deletes. Only `${workspaceFolder}` resolves, values capped at 4096 chars. |
| Project root (cwd) | mapped | Explicit > active editor folder > sole folder > picker. Deepest containing folder wins. |
| Appearance, tabs, location, input | inherited | Native Cursor terminal UI. |
| Existing shell state of a Herdr pane | backend-owned | Env changes apply to future terminals only. |
| `shell.linux`, `shellArgs.linux`, `inheritEnv`, `cwd`, `automationProfile.linux`, `environmentChangesRelaunch` | unsupported | Reported as diagnostics, ignored. No shell-profile or environment-collection parity claimed. |
| Non-`file` folders, containers, Windows/macOS hosts, untrusted workspaces | unsupported | Nothing launched; missing remote Herdr never falls back to local. |

## Setup (Split)
Native Split reuses the default profile. Opt in yourself in user settings:

```json
"terminal.integrated.defaultProfile.linux": "Hitch Herdr"
```
Rollback: remove that key. Hitch never edits defaults. Ordinary profiles stay available in the picker.

## Trust
Activation is `onTerminalProfile:hitch.herdr`. In an untrusted workspace Hitch refuses before any process or socket access (`assertTrusted`); no executable-path setting is contributed.

## Tested versions (actual checks)
| Component | Version |
|---|---|
| Cursor | 3.27.22 (VS Code 1.128.0 base) |
| Herdr | 0.9.5 (minimum; older versions are refused with a clear error) |
| Host | Linux x64 workspace host only |
| Node (build/test) | 24 |

`engines.vscode` is `^1.100.0` (API floor, only tested on 1.128.0). Windows/macOS hosts, containers and non-`file` folders fail with a clear message and launch nothing.
Upgrade/uninstall: Hitch edits no settings and keeps only a project-to-workspace `bindings.json` in its global storage. It never closes Herdr workspaces or panes, so backend work persists; remove the `defaultProfile.linux` key yourself if set.
`npm run build`, `npm test` and `check-vsix` do not replace manual editor/Agent acceptance in Cursor.

## GAPs
- License: MIT (owner-approved 2026-10-31), see `LICENSE`.
- GAP: no automated clean install/upgrade/uninstall integration test; verified by design only.
- GAP: Herdr 0.9.0 to 0.9.4 untested.
