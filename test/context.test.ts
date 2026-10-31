import { test } from "node:test";
import assert from "node:assert/strict";
import { selectContext, type Folder } from "../src/context/select.ts";
import { assertTrusted, UntrustedError } from "../src/context/trust.ts";
const f = (p: string, scheme = "file"): Folder => ({ uri: `${scheme}://${p}`, fsPath: p, scheme });
const nopick = async () => { throw new Error("picked"); };
test("explicit beats active editor", async () => {
  const r = await selectContext({ explicit: "/a/x", activeEditorFsPath: "/b/y", folders: [f("/a"), f("/b")], pick: nopick });
  assert.equal(r.kind === "folder" && r.folder.fsPath, "/a");
});
test("deepest nested folder wins; prefix siblings do not match", async () => {
  const r = await selectContext({ activeEditorFsPath: "/a/b/c", folders: [f("/a"), f("/a/b"), f("/ab")], pick: nopick });
  assert.equal(r.kind === "folder" && r.folder.fsPath, "/a/b");
  const s = await selectContext({ explicit: "/ab/x", folders: [f("/a")], pick: nopick });
  assert.equal(s.kind, "none");
});
test("sole folder, picker, cancel, no folder", async () => {
  assert.equal((await selectContext({ folders: [f("/a")], pick: nopick })).kind, "folder");
  assert.equal((await selectContext({ folders: [f("/a"), f("/b")], pick: async (l) => l[1] })).kind, "folder");
  assert.equal((await selectContext({ folders: [f("/a"), f("/b")], pick: async () => undefined })).kind, "cancelled");
  assert.equal((await selectContext({ folders: [], pick: nopick })).kind, "none");
});
test("non-file schemes and traversal rejected", async () => {
  assert.equal((await selectContext({ folders: [f("/a", "vscode-vfs")], pick: nopick })).kind, "none");
  assert.equal((await selectContext({ explicit: "/a/../etc", folders: [f("/a")], pick: nopick })).kind, "none");
});
test("untrusted blocks", () => {
  assert.throws(() => assertTrusted(false), UntrustedError);
  assertTrusted(true);
});
