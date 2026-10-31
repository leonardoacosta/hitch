import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BindingLockError, createBindingStore } from "../src/binding/store.ts";
import { createHerdrClient } from "../src/herdr/client.ts";

test("dead-pid lock yields recoverable error and is not deleted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lk-"));
  const dead = spawnSync(process.execPath, ["-e", ""]).pid!;
  writeFileSync(join(dir, "bindings.lock"), String(dead));
  const store = createBindingStore(dir, { createWorkspace: async () => "w", workspaceExists: async () => true }, { lockWaitMs: 200 });
  await assert.rejects(store.bind(dir), (e: Error) => e instanceof BindingLockError && e.message.includes(join(dir, "bindings.lock")) && /Remove/.test(e.message));
  assert.ok((await import("node:fs")).existsSync(join(dir, "bindings.lock")));
});

test("two stores sharing one dir create one workspace", async () => {
  const dir = mkdtempSync(join(tmpdir(), "race-"));
  const root = mkdtempSync(join(tmpdir(), "root-"));
  let n = 0;
  const live = new Set<string>();
  const api = { createWorkspace: async () => { await new Promise((r) => setTimeout(r, 30)); const id = `w${++n}`; live.add(id); return id; }, workspaceExists: async (id: string) => live.has(id) };
  const [a, b] = await Promise.all([createBindingStore(dir, api).bind(root), createBindingStore(dir, api).bind(root)]);
  assert.equal(a.workspaceId, b.workspaceId);
  assert.equal(n, 1);
});

const hasHerdr = spawnSync("herdr", ["--version"]).status === 0;
test("real herdr: workspace, tab create, attach argv", { skip: !hasHerdr }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hitch-it-")));
  const c = createHerdrClient({ bin: "herdr", env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("HERDR_"))) });
  let ws: string | undefined;
  try {
    ws = await c.createWorkspace(dir, "hitch-it");
    const pane = await c.createPane(ws, dir);
    assert.ok(pane.terminalId);
    const argv = c.attachArgv(pane);
    assert.ok(argv.shellArgs.includes(pane.terminalId));
    assert.ok(!argv.shellArgs.includes("--takeover"));
  } finally {
    if (ws) execFileSync("herdr", ["workspace", "close", ws], { stdio: "ignore" });
  }
});
