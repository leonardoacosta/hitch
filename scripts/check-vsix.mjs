// Lists a VSIX and fails if any entry is outside the allowlist.
import { execFileSync } from "node:child_process";
const allowed = [/^extension\/package\.json$/, /^extension\/dist\/extension\.js$/, /^extension\/(readme|license|changelog)(\.md|\.txt)?$/i, /^extension\.vsixmanifest$/, /^\[Content_Types\]\.xml$/];
const file = process.argv[2];
if (!file) { console.error("usage: check-vsix.mjs <file.vsix>"); process.exit(2); }
const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n").filter(Boolean);
const bad = entries.filter((e) => !allowed.some((r) => r.test(e)));
console.log(entries.join("\n"));
if (bad.length) { console.error("Unexpected VSIX entries:\n" + bad.join("\n")); process.exit(1); }

// Private-content scan: no private host aliases/paths in shipped files.
// Private strings come from HITCH_PRIVATE_STRINGS (comma-separated) so they never live in the repo.
const terms = [process.env.USER, ...(process.env.HITCH_PRIVATE_STRINGS ?? "").split(",")].filter(Boolean).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const banned = terms.length ? new RegExp(terms.join("|"), "i") : /$^/;
for (const e of entries.filter((x) => x.startsWith("extension/") && !x.endsWith("/"))) {
  const body = execFileSync("unzip", ["-p", file, e], { encoding: "utf8" });
  if (banned.test(body)) { console.error("Private string in VSIX entry: " + e); process.exit(1); }
}
console.log("VSIX allowlist and private-string scan OK");
