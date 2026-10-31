# Hitch terminals

Editor and Herdr layouts are independent: each editor terminal maps to one Herdr pane in the project's bound workspace. Closing the editor terminal never changes Herdr's layout.

## New / Split (3.1)
- First request on a fresh workspace consumes its initial pane once; later requests create one pane each at the canonical project root. No native-parent timing heuristic.
- If attach fails after creation, the pane stays in Herdr and the error names it; use Attach existing to recover.

## Attach existing (3.2)
- Lists only panes in this project's bound workspace, keyed by stable terminal id. Attach never creates a replacement; a stale id fails with `StalePaneError`. A pane whose cwd changed stays in its workspace.
- Reconnect: run "Attach existing", pick the pane by id.

## Disposal (3.3)
- `dispose()` only ends the local attach client. Terminal close, editor exit/reload, extension restart and SSH loss send no close/stop to Herdr; owned child processes keep running.
- Sessions are `isTransient` (no native revive). Automatic UI restoration is not promised. After an abrupt disconnect the server may briefly keep the old controller attached, so reattach can report busy until it times out.

## Busy controller (3.4)
- Limitation: herdr 0.9.5 (protocol 22) `pane get` and `herdr api schema` expose no attached-client/controller field. Hitch cannot detect busy up front; `isBusy` is an optional hook (default: not busy).
- Real signal: `herdr terminal attach <id>` while another client is attached fails with `terminal <id> already has an attached client; retry with --takeover` (exit 1). `isBusyAttachFailure` classifies it.
- Hitch never passes `--takeover`, replays buffered keys or re-sends commands. Transfer requires explicit user consent, and cancelling leaves the pane and its processes untouched.
- Real-client check (2026-10-31, disposable fixture workspace, two `herdr terminal attach` under `script` with a sized pty): second client failed with the message above; first client kept running. The workspace was already gone at cleanup (`workspace_not_found`), nothing else was touched.

## Busy panes
Attach runs as the terminal's own process. If another client is attached, herdr prints its "already has an attached client" message inside the terminal and exits. Hitch never takes over (no `--takeover`).

## Reattach
Command `Hitch: Reattach to Herdr Pane` (`hitch.reattach`) lists panes of the bound workspace and opens a terminal attached to the chosen one.
