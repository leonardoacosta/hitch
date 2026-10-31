import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapSettings, describe, resolveVars } from "../src/config/map.ts";
test("env map, delete, vars, unsupported diagnostics", () => {
  const m = mapSettings({ env: { A: "${workspaceFolder}/x", B: null, C: "${env:HOME}" } }, "/w", ["terminal.integrated.shell.linux", "editor.x"]);
  assert.equal(m.env.A, "/w/x");
  assert.deepEqual(m.deleted, ["B"]);
  assert.equal(m.env.C, "${env:HOME}");
  assert.equal(m.diagnostics.length, 2);
});
test("bounded and bad keys", () => {
  const d: string[] = [];
  assert.equal(resolveVars("x".repeat(5000), "/w", d, "K"), "");
  assert.equal(mapSettings({ env: { "a b": "1" } }, "/w").diagnostics.length, 1);
});
test("secrets absent from describe output", () => {
  const m = mapSettings({ env: { GITHUB_TOKEN: "s3cr3t-value", PLAIN: "v" } }, "/w");
  const out = describe(m);
  assert.ok(!out.includes("s3cr3t-value") && !out.includes("GITHUB_TOKEN"));
});
test("package: workspace kind, profile id, no executable-path setting", () => {
  const p = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(p.extensionKind, ["workspace"]);
  assert.equal(p.contributes.terminal.profiles[0].id, "hitch.herdr");
  assert.equal(p.contributes.configuration, undefined);
  assert.ok(!p.contributes.terminal.profiles[0].path);
});
test("docs mention Split default profile", () => {
  assert.match(readFileSync("docs/compat.md", "utf8"), /defaultProfile\.linux": "Hitch Herdr"/);
});
