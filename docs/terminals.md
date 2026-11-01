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

## Busy controller (3.4, known gap)
- herdr 0.9.5 (protocol 22) `pane get` and `herdr api schema` expose no attached-client/controller field, so Hitch cannot detect busy before attaching. `isBusy` is an optional hook left unset until Herdr exposes that field.
- Probing with `herdr terminal session control` would briefly take control of the pane, and scanning local processes misses remote clients, so neither is used.
- What the user sees: `herdr terminal attach <id>` while another client is attached fails inside the terminal with `terminal <id> already has an attached client; retry with --takeover` (exit 1).
- Hitch never passes `--takeover`, replays buffered keys or re-sends commands. There is no transfer flow; detach the other client and retry.
- Real-client check (2026-10-31, disposable fixture workspace, two `herdr terminal attach` under `script` with a sized pty): second client failed with the message above; first client kept running. The workspace was already gone at cleanup (`workspace_not_found`), nothing else was touched.

## Reattach
Command `Hitch: Reattach to Herdr Pane` (`hitch.reattach`) lists panes of the selected folder's bound workspace and opens a terminal attached to the chosen one.
