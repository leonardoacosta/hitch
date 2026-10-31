import { test } from "node:test";
import assert from "node:assert/strict";
import { createTerminalService, StalePaneError, BusyControllerError } from "../src/terminal/service.ts";
import type { HerdrClient, BindingStore, PaneRef } from "../src/types.ts";

function setup(opts: { bound?: boolean; busy?: boolean } = {}) {
  const calls: string[] = [];
  const panes: PaneRef[] = opts.bound ? [] : [{ workspaceId: "w1", paneId: "w1:p1", terminalId: "t1" }];
  let n = 1, bound = !!opts.bound;
  const herdr: HerdrClient = {
    version: async () => "0",
    createPane: async (w) => { calls.push("create"); const i = ++n; const p = { workspaceId: w, paneId: `${w}:p${i}`, terminalId: `t${i}` }; panes.push(p); return p; },
    listPanes: async (w) => panes.filter((p) => p.workspaceId === w),
    attachArgv: (p) => ({ shellPath: "herdr", shellArgs: ["terminal", "attach", p.terminalId] }),
  };
  const store: BindingStore = {
    get: async (r) => (bound ? { projectRoot: r, workspaceId: "w1" } : undefined),
    bind: async (r) => { bound = true; return { projectRoot: r, workspaceId: "w1" }; },
  };
  const detached: string[] = [];
  const svc = createTerminalService({ herdr, store, isBusy: async () => !!opts.busy, onDetach: (p) => detached.push(p.paneId) });
  return { svc, calls, panes, detached };
}

test("first pane consumed once, later opens create one pane each", async () => {
  const { svc, calls, panes } = setup();
  const a = await svc.open("/p");
  assert.equal(a.pane.terminalId, "t1"); assert.equal(calls.length, 0);
  await svc.open("/p"); await svc.open("/p");
  assert.deepEqual(calls, ["create", "create"]); assert.equal(panes.length, 3);
});

test("attach args never include --takeover; session is transient", async () => {
  const { svc } = setup({ bound: true });
  const s = await svc.open("/p");
  assert.deepEqual(s.shellArgs, ["terminal", "attach", s.pane.terminalId]); assert.ok(s.isTransient);
});

test("list scoped to project; stale attach fails without creating", async () => {
  const { svc, calls, panes } = setup({ bound: true });
  panes.push({ workspaceId: "other", paneId: "o:p1", terminalId: "tx" }, { workspaceId: "w1", paneId: "w1:p9", terminalId: "t9" });
  assert.deepEqual((await svc.list("/p")).map((c) => c.id), ["t9"]);
  await assert.rejects(svc.attach("/p", "tx"), StalePaneError);
  await assert.rejects(svc.attach("/p", "gone"), StalePaneError);
  assert.equal(calls.length, 0);
  assert.equal((await svc.attach("/p", "t9")).pane.paneId, "w1:p9");
});

test("dispose is detach only and idempotent", async () => {
  const { svc, calls, detached } = setup({ bound: true });
  const s = await svc.open("/p"); s.dispose(); s.dispose();
  assert.deepEqual(detached, [s.pane.paneId]); assert.equal(calls.length, 1);
});

test("busy terminal needs explicit consent, never takeover", async () => {
  const { svc } = setup({ bound: true, busy: true });
  const s = await svc.open("/p");
  await assert.rejects(svc.attach("/p", s.pane.terminalId), BusyControllerError);
  const r = await svc.attach("/p", s.pane.terminalId, { consentToTransfer: true });
  assert.ok(!r.shellArgs.includes("--takeover"));
});

test("real herdr contention message is classified as busy", async () => {
  const { isBusyAttachFailure } = await import("../src/terminal/service.ts");
  assert.ok(isBusyAttachFailure("terminal term_x already has an attached client; retry with --takeover"));
  assert.ok(!isBusyAttachFailure("terminal exited"));
});

test("takeover argv is refused and the created pane stays recoverable", async () => {
  const { svc, panes } = setup({ bound: true });
  const bad = createTerminalService({
    herdr: { version: async () => "0", createPane: async (w) => { const p = { workspaceId: w, paneId: "w1:p7", terminalId: "t7" }; panes.push(p); return p; },
      listPanes: async (w) => panes.filter((p) => p.workspaceId === w), attachArgv: (p) => ({ shellPath: "herdr", shellArgs: ["terminal", "attach", p.terminalId, "--takeover"] }) },
    store: { get: async (r) => ({ projectRoot: r, workspaceId: "w1" }), bind: async (r) => ({ projectRoot: r, workspaceId: "w1" }) },
  });
  await assert.rejects(bad.open("/p"), /remains in workspace w1/);
  assert.ok((await svc.list("/p")).some((c) => c.id === "t7"));
});

test("list marks busy panes; dispose never calls create/close", async () => {
  const { svc, calls } = setup({ bound: true, busy: true });
  const s = await svc.open("/p");
  assert.match((await svc.list("/p"))[0].label, /in use/);
  s.dispose(); assert.deepEqual(calls, ["create"]);
});
