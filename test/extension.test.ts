import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHerdrClient } from "../src/herdr/client.ts";
import { findHerdr, reattachItems, resolveProfileOptions, workspaceApi } from "../src/profile.ts";

test("findHerdr uses PATH then $HOME/.local/bin, absolute only", () => {
  assert.equal(findHerdr("/a:/b", (p) => p === "/b/herdr", "/h"), "/b/herdr");
  assert.equal(findHerdr("/a", (p) => p === "/h/.local/bin/herdr", "/h"), "/h/.local/bin/herdr");
  assert.throws(() => findHerdr("rel", () => true, ""));
});

test("workspaceApi goes through guarded client", async () => {
  const mk = (env: NodeJS.ProcessEnv) => workspaceApi(createHerdrClient({ bin: "/x/herdr", env, exec: async (_b, a) => ({ code: 0, stderr: "", stdout:
    a[1] === "create" ? JSON.stringify({ result: { workspace: { workspace_id: "wA" } } }) : JSON.stringify({ result: { workspaces: [{ workspace_id: "wA" }] } }) }) }));
  const api = mk({});
  assert.equal(await api.createWorkspace("/c", "l"), "wA");
  assert.equal(await api.workspaceExists("wA"), true);
  assert.equal(await api.workspaceExists("wB"), false);
  await assert.rejects(mk({ HERDR_SESSION: "x" }).workspaceExists("wA"), /Conflicting/);
});

test("resolveProfileOptions applies mapSettings env/cwd/diagnostics", async () => {
  const dir = mkdtempSync(join(tmpdir(), "h-"));
  const exec = async (_b: string, a: string[]) => ({ code: 0, stderr: "", stdout:
    a[0] === "--version" ? "herdr 0.9.5\n" :
    a[0] === "status" ? JSON.stringify({ socket: dir }) :
    a[0] === "workspace" && a[1] === "create" ? JSON.stringify({ result: { workspace: { workspace_id: "w1" } } }) :
    a[0] === "workspace" ? JSON.stringify({ result: { workspaces: [{ workspace_id: "w1" }] } }) :
    JSON.stringify({ result: { root_pane: { pane_id: "w1:p1", terminal_id: "t1" } } }) });
  const o = await resolveProfileOptions({
    isTrusted: true, storageDir: dir, bin: "/x/herdr", exec, env: {},
    settings: { env: { A: "${workspaceFolder}/x", B: null, C: "${env:Z}" } }, setKeys: ["terminal.integrated.inheritEnv"],
    select: { folders: [{ uri: "file://" + dir, fsPath: dir, scheme: "file" }], pick: async () => undefined },
  });
  assert.match(o.env.A!, /\/x$/);
  assert.ok(!o.env.A!.includes("${"));
  assert.equal(o.env.B, null);
  assert.ok(o.diagnostics.some((d) => /inheritEnv/.test(d)) && o.diagnostics.some((d) => /env:Z/.test(d)));
});

test("reattachItems maps choices", () => {
  assert.deepEqual(reattachItems([{ id: "t1", label: "w:p1 (t1)", pane: { workspaceId: "w", paneId: "w:p1", terminalId: "t1" } }]), [{ label: "w:p1", description: "w:p1 (t1)", terminalId: "t1" }]);
});

test("untrusted and empty-folder cases throw before any exec", async () => {
  let called = false;
  const exec = async () => { called = true; return { code: 0, stdout: "", stderr: "" }; };
  const base = { storageDir: mkdtempSync(join(tmpdir(), "h-")), bin: "/x/herdr", exec, select: { folders: [], pick: async () => undefined } };
  await assert.rejects(resolveProfileOptions({ ...base, isTrusted: false }), /not trusted/);
  await assert.rejects(resolveProfileOptions({ ...base, isTrusted: true }), /no local-host/);
  assert.equal(called, false);
});
