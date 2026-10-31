import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnose } from "../src/companion/diagnose.ts";

test("missing project reports and fails", () => {
  const r = diagnose({ args: [], env: {} });
  assert.equal(r.code, 2);
  assert.match(r.text, /missing project/);
});
test("nonexistent dir fails", () => {
  assert.equal(diagnose({ args: ["--project", "/nonexistent-hitch"], env: {} }).code, 2);
});
test("symlink resolves to canonical root, uses env cwd", () => {
  const d = mkdtempSync(join(tmpdir(), "hitch-"));
  const l = d + "-link";
  symlinkSync(d, l);
  const r = diagnose({ args: [], env: { HERDR_ACTIVE_PANE_CWD: l, HERDR_ACTIVE_WORKSPACE_ID: "w1" }, herdrVersion: () => "0.9.0" });
  assert.equal(r.code, 0);
  assert.ok(r.text.includes(`Canonical root: ${d.replace(/\/+$/, "")}`));
  assert.match(r.text, /Herdr version: 0\.9\.0/);
  assert.match(r.text, /cannot launch or focus an editor/);
});
test("diagnose does not write to project", () => {
  const d = mkdtempSync(join(tmpdir(), "hitch-"));
  diagnose({ args: ["--project", d], env: {} });
  assert.deepEqual(readdirSync(d), []);
});
