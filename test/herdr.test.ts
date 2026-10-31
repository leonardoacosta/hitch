import { test } from "node:test";
import assert from "node:assert/strict";
import { createHerdrClient } from "../src/herdr/client.ts";

test("missing binary fails visibly", async () => {
  const c = createHerdrClient({ bin: "/nonexistent/herdr-x", env: {} });
  await assert.rejects(c.version(), /not found/);
});
test("conflicting env fails without exec", async () => {
  let called = false;
  const c = createHerdrClient({ env: { HERDR_SOCKET_PATH: "x" }, exec: async () => { called = true; return { code: 0, stdout: "", stderr: "" }; } });
  await assert.rejects(c.version(), /Conflicting/);
  assert.equal(called, false);
});
test("herdr below 0.9.5 refused", async () => {
  const c = createHerdrClient({ env: {}, exec: async () => ({ code: 0, stdout: "herdr 0.9.4\n", stderr: "" }) });
  await assert.rejects(c.version(), /0\.9\.4 is incompatible; 0\.9\.5 or newer/);
});
test("version and createPane parse", async () => {
  const c = createHerdrClient({ env: {}, exec: async (_b, a) => a[0] === "--version"
    ? { code: 0, stdout: "herdr 0.9.5\n", stderr: "" }
    : { code: 0, stdout: JSON.stringify({ result: { root_pane: { pane_id: "w:p1", terminal_id: "term_1" } } }), stderr: "" } });
  assert.equal(await c.version(), "0.9.5");
  assert.deepEqual(await c.createPane("w", "/x"), { workspaceId: "w", paneId: "w:p1", terminalId: "term_1" });
  assert.deepEqual(c.attachArgv({ workspaceId: "w", paneId: "w:p1", terminalId: "term_1" }).shellArgs, ["terminal", "attach", "term_1"]);
});
const ok = (stdout: string) => ({ code: 0, stdout, stderr: "" });
test("incompatible version rejected", async () => {
  const c = createHerdrClient({ env: {}, exec: async () => ok("herdr 0.3.0\n") });
  await assert.rejects(c.version(), /incompatible/);
});
test("server unreachable and permission errors are visible", async () => {
  const bad = (code: number, stderr: string) => createHerdrClient({ env: {}, exec: async () => ({ code, stdout: "", stderr }) });
  await assert.rejects(bad(1, "cannot connect to server").listPanes("w"), /failed.*cannot connect/);
  await assert.rejects(bad(1, "Permission denied").version(), /permission denied/);
  await assert.rejects(bad(126, "").version(), /permission denied/);
});
test("never starts a daemon; argv is safe vector", async () => {
  const seen: string[][] = [];
  const c = createHerdrClient({ env: {}, exec: async (_b, a) => { seen.push(a); return ok(a[0] === "--version" ? "herdr 0.9.5" : JSON.stringify({ result: { panes: [] } })); } });
  await c.listPanes("w; rm -rf /");
  assert.ok(seen.every((a) => !a.includes("server") && !a.includes("--takeover")));
  assert.ok(seen.some((a) => a.includes("w; rm -rf /")));
  assert.ok(!c.attachArgv({ workspaceId: "w", paneId: "p", terminalId: "t" }).shellArgs.includes("--takeover"));
});
test("unparseable output fails", async () => {
  const c = createHerdrClient({ env: {}, exec: async () => ok("garbage") });
  await assert.rejects(c.createPane("w", "/x"), /unparseable/);
});
test("real non-executable binary maps to permission error", async () => {
  const c = createHerdrClient({ bin: "/etc/shadow", env: {} });
  await assert.rejects(c.version(), /not executable|permission/);
});
