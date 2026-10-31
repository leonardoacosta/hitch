import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const p = JSON.parse(readFileSync("package.json", "utf8"));
test("untrusted workspaces unsupported", () => {
  assert.deepEqual(p.capabilities.untrustedWorkspaces, { supported: false, description: "Hitch spawns Herdr processes" });
});
test("hitch.rebind contributed and activates", () => {
  assert.ok(p.contributes.commands.some((c: { command: string }) => c.command === "hitch.rebind"));
  assert.ok(p.activationEvents.includes("onCommand:hitch.rebind"));
});
test("hitch.reattach contributed", () => {
  assert.ok(p.contributes.commands.some((c: { command: string }) => c.command === "hitch.reattach"));
});
