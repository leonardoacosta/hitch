# Herdr binding

## Prerequisites and default session
Hitch drives the `herdr` CLI (0.9 or newer) on PATH against the default session/server. The server must already be running; Hitch never starts a daemon, never falls back to a local shell and never uses `--takeover`. Missing or incompatible binary, unreachable server and permission errors are shown as visible failures. If `HERDR_SOCKET_PATH`, `HERDR_SESSION`, `HERDR_PANE_ID` or `HERDR_ENV` are set in the environment, Hitch refuses to run; unset them. Arguments are passed as an argv vector, never through a shell.

## Folder and label precedence
Identity is the canonical (realpath) project folder. Symlink aliases converge on one binding; identical basenames in different folders stay separate; paths with spaces are used literally. The label is only the folder basename and is never used for matching. Shell `cd` or pane-title changes never rebind. Non-Git folders work the same.

## Index and concurrency
Non-secret bindings live in `bindings.json` (written atomically via temp file and rename), guarded by `bindings.lock` (exclusive create). A pending marker is written before workspace creation and cleared on success.

## Recovery
- Lock held: Hitch waits, then fails. It never deletes or takes over the lock. If no Hitch window is binding, verify, then remove `bindings.lock` manually.
- Interrupted create (pending entry): a workspace may exist. Run **Hitch: Adopt Existing Herdr Workspace** and pick that workspace, or delete the pending entry from `bindings.json`.

## Rebind behavior
A binding is used only if its workspace exists and the herdr server instance matches the one recorded. Otherwise `bind` fails with a stale error and `get` returns nothing. Matching labels or coincident IDs are never adopted automatically. Run **Hitch: Rebind Project to New Herdr Workspace** to create a new workspace, or **Hitch: Adopt Existing Herdr Workspace** to bind one that no other project uses. Both ask for confirmation and use the same folder selection as the terminal profile.

## Server instance
Herdr 0.9.5 exposes no server id. Hitch derives one from the socket reported by `herdr status server --json`: its path, inode and creation time. The server recreates the socket on every start, so a restart or a different session changes the id, and an old binding is reported stale instead of reusing a coincident workspace id. Bindings written before this check have no recorded id and are validated by workspace existence only until they are rebound or adopted.

## Stale lock
The lock file holds the owner pid, written atomically (hard link of a temp file). If the holder pid is dead, Hitch reports an error naming the lock path and asks you to remove it manually. It never deletes or takes over a lock.
