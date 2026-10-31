import { execFileSync } from "node:child_process";
import { diagnose } from "./diagnose.ts";

const bin = process.env.HERDR_BIN_PATH ?? "herdr";
const out = diagnose({
  args: process.argv.slice(2),
  env: process.env,
  herdrVersion: () => {
    try { return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 5000 }).trim(); } catch { return undefined; }
  },
});
(out.code === 0 ? process.stdout : process.stderr).write(out.text);
process.exitCode = out.code;
