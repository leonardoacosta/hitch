import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createBindingStore } from "../src/binding/store.ts";

function fake() {
  const created: string[] = [];
  return { created, api: {
    async createWorkspace(cwd: string) { await new Promise((r) => setTimeout(r, 30)); created.push(cwd); return `ws${created.length}`; },
    async workspaceExists() { return true; },
  } };
}
async function setup() {
  const base = await mkdtemp(path.join(tmpdir(), "hitch-"));
  const a = path.join(base, "a b", "proj"); const b = path.join(base, "other", "proj");
  await mkdir(a, { recursive: true }); await mkdir(b, { recursive: true });
  return { base, a, b };
}

test("symlink alias converges", async () => {
  const { base, a } = await setup(); const f = fake();
  await symlink(a, path.join(base, "link"));
  const s = createBindingStore(path.join(base, "st"), f.api);
  const x = await s.bind(a); const y = await s.bind(path.join(base, "link"));
  assert.equal(x.workspaceId, y.workspaceId); assert.equal(f.created.length, 1);
});
test("same basename stays separate", async () => {
  const { base, a, b } = await setup(); const f = fake();
  const s = createBindingStore(path.join(base, "st"), f.api);
  assert.notEqual((await s.bind(a)).workspaceId, (await s.bind(b)).workspaceId);
});
test("concurrent bind creates one workspace", async () => {
  const { base, a } = await setup(); const f = fake();
  const s = createBindingStore(path.join(base, "st"), f.api);
  const r = await Promise.all([s.bind(a), s.bind(a), s.bind(a)]);
  assert.equal(new Set(r.map((x) => x.workspaceId)).size, 1); assert.equal(f.created.length, 1);
});
test("interrupted create leaves pending, no blind recreate", async () => {
  const { base, a } = await setup();
  const s = createBindingStore(path.join(base, "st"), { async createWorkspace() { throw new Error("boom"); }, async workspaceExists() { return true; } });
  await assert.rejects(s.bind(a), /boom/);
  await assert.rejects(s.bind(a), /interrupted/);
});
import { readFile, writeFile } from "node:fs/promises";
import { labelFor, BindingStaleError } from "../src/binding/store.ts";

test("label is basename, identity is canonical root", async () => {
  const { a } = await setup();
  assert.equal(labelFor(await (await import("node:fs/promises")).realpath(a)), "proj");
});
test("held lock is never taken over", async () => {
  const { base, a } = await setup(); const f = fake();
  const st = path.join(base, "st"); await mkdir(st, { recursive: true });
  await writeFile(path.join(st, "bindings.lock"), "99999999");
  const s = createBindingStore(st, f.api, { lockWaitMs: 100 });
  await assert.rejects(s.bind(a), /never taken over/);
  assert.equal(f.created.length, 0);
  assert.equal(await readFile(path.join(st, "bindings.lock"), "utf8"), "99999999");
});
test("pending state persisted on disk after interruption", async () => {
  const { base, a } = await setup(); const st = path.join(base, "st");
  const s = createBindingStore(st, { async createWorkspace() { throw new Error("boom"); }, async workspaceExists() { return true; } });
  await assert.rejects(s.bind(a), /boom/);
  assert.ok(Object.keys(JSON.parse(await readFile(path.join(st, "bindings.json"), "utf8")).pending).length === 1);
});
function inst(id: { v: string }, live: Set<string>) {
  let n = 0;
  return { async createWorkspace() { const w = `ws${++n}`; live.add(w); return w; }, async workspaceExists(w: string) { return live.has(w); }, async serverInstance() { return id.v; } };
}
test("server restart or missing workspace never auto-adopts", async () => {
  const { base, a } = await setup(); const id = { v: "i1" }; const live = new Set<string>();
  const s = createBindingStore(path.join(base, "st"), inst(id, live));
  const first = await s.bind(a);
  id.v = "i2"; // restart, coincident id "ws1" exists again for a different project
  assert.equal(await s.get(a), undefined);
  await assert.rejects(s.bind(a), BindingStaleError);
  id.v = "i1"; live.delete(first.workspaceId);
  await assert.rejects(s.bind(a), BindingStaleError);
});
test("explicit rebind and adopt; no cross-project adoption; non-git folders", async () => {
  const { base, a, b } = await setup(); const id = { v: "i1" }; const live = new Set<string>();
  const s = createBindingStore(path.join(base, "st"), inst(id, live));
  const x = await s.bind(a); // a has no .git
  await assert.rejects(s.adopt(b, x.workspaceId), /already bound/);
  live.delete(x.workspaceId);
  const r = await s.rebind(a);
  assert.ok(live.has(r.workspaceId));
  live.add("manual");
  assert.equal((await s.adopt(b, "manual")).workspaceId, "manual");
  await assert.rejects(s.adopt(b, "gone"), /does not exist/);
});
