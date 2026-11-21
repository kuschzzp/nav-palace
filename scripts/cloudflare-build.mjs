import { spawn } from "node:child_process";

// OpenNext 调用此脚本时显式启用 D1/R2；普通 npm run build 继续构建 Node 版本。
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
  stdio: "inherit",
  env: { ...process.env, NAV_PALACE_RUNTIME: "cloudflare" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => process.exit(code ?? 1));
