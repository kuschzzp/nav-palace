import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";

// 已有配置时不覆盖，避免重新生成密钥导致原有会话失效。
try {
  await access(".env.local");
  console.log(".env.local 已存在，未覆盖。请按部署地址修改 BETTER_AUTH_URL。");
} catch {
  // 从示例保留全部字段和注释，仅填入独立随机生成的凭据。
  const template = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const contents = template
    .replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`)
    .replace(/^SETUP_TOKEN=.*$/m, `SETUP_TOKEN=${randomBytes(24).toString("base64url")}`);
  // 独占创建，避免覆盖已有配置。
  await writeFile(".env.local", contents, { flag: "wx", mode: 0o600 });
  console.log("已生成 .env.local。首次访问 /admin/setup 时，使用其中的 SETUP_TOKEN 创建管理员。");
  process.stdout.write(`\n${contents}`);
}
