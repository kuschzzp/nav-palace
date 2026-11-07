import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";

// 已有配置时不覆盖，避免重新生成密钥导致原有会话失效。
try {
  await access(".env.local");
  console.log(".env.local 已存在，未覆盖。请按部署地址修改 BETTER_AUTH_URL。");
} catch {
  // 两类密钥分别随机生成；wx 再次防止并发覆盖，600 权限限制其他用户读取。
  await writeFile(".env.local", [
    "BETTER_AUTH_URL=http://127.0.0.1:3000",
    `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
    `SETUP_TOKEN=${randomBytes(24).toString("base64url")}`,
    "DATABASE_PATH=./data/nav-palace.db",
    "",
  ].join("\n"), { flag: "wx", mode: 0o600 });
  console.log("已生成 .env.local。首次访问 /admin/setup 时，使用其中的 SETUP_TOKEN 创建管理员。");
}
