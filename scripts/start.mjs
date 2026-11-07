import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { hostname: { type: "string" }, port: { type: "string" } } });
// 进程环境变量优先，未指定的值再从本地配置补齐。
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const server = resolve(".next/standalone/server.js");
if (!existsSync(server)) {
  console.error("请先运行 npm run build，再启动生产服务。");
  process.exit(1);
}
// standalone 产物不附带 public 和静态资源，启动前补齐这两部分。
// public 使用当前源码的完整镜像，避免已删除的背景素材被旧构建目录继续提供。
await rm(".next/standalone/public", { recursive: true, force: true });
await cp("public", ".next/standalone/public", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
// 转为绝对路径，避免 standalone 服务切换工作目录后把数据写到另一处。
const databasePath = process.env.DATABASE_PATH || "./data/nav-palace.db";
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: values.hostname || "0.0.0.0",
    PORT: values.port || process.env.PORT || "3000",
    DATABASE_PATH: databasePath === ":memory:" ? databasePath : resolve(databasePath),
  },
});
// 将终止信号传给实际服务进程，关闭启动器时不遗留后台服务。
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("服务启动失败，请检查 Node.js 环境。"); process.exit(1); });
child.on("exit", (code) => process.exit(code ?? 1));
