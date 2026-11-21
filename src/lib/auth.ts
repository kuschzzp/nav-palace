import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { consumeRateLimit, getDatabase, hasAdmin, isAdmin } from "./db";
import * as schema from "./schema";
import { ApiError } from "./validation";

async function deriveCloudflarePassword(password: string, salt: string) {
  // 与 Better Auth 已有的 scrypt 参数及 NFKC 规则保持一致，迁移后可直接验证旧账号。
  return Buffer.from(await scryptAsync(password.normalize("NFKC"), salt, { N: 16384, r: 16, p: 1, dkLen: 64, maxmem: 64 * 1024 * 1024 }));
}

const cloudflarePassword = {
  async hash(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${(await deriveCloudflarePassword(password, salt)).toString("hex")}`;
  },
  async verify({ hash, password }: { hash: string; password: string }) {
    const parts = /^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash);
    if (!parts) return false;
    return timingSafeEqual(await deriveCloudflarePassword(password, parts[1]), Buffer.from(parts[2], "hex"));
  },
};

// 认证配置在首次使用时初始化，构建页面时无需连接真实运行数据库。
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(503, "请先配置至少 32 位的 BETTER_AUTH_SECRET 并重启应用");
  }
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new ApiError(503, "请先配置 BETTER_AUTH_URL 并重启应用");
  return betterAuth({
    appName: "Nav Palace",
    secret,
    baseURL,
    database: drizzleAdapter(getDatabase().db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // 仅允许通过持有初始化密钥的专用接口创建唯一管理员。
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      // Workers 显式使用可移植实现，避免构建器选择依赖原生 scrypt 的 Node 导出。
      ...(process.env.NAV_PALACE_RUNTIME === "cloudflare" ? { password: cloudflarePassword } : {}),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 12,
    },
    account: { accountLinking: { enabled: false } },
    user: { deleteUser: { enabled: false }, changeEmail: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: new URL(baseURL).protocol === "https:",
      cookiePrefix: "nav-palace",
    },
    telemetry: { enabled: false },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  // D1 绑定与请求上下文关联，不能复用前一次请求创建的认证实例。
  if (process.env.NAV_PALACE_RUNTIME === "cloudflare") return createAuth();
  instance ??= createAuth();
  return instance;
}

// 登录有效不等于具备管理权限，必须同时命中管理员绑定记录。
export async function getAdminSession() {
  if (!await hasAdmin()) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session && await isAdmin(session.user.id) ? session : null;
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new ApiError(401, "请先登录管理员账号");
  return session;
}

export function verifySetupToken(token: string) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 16) {
    throw new ApiError(503, "请先配置至少 16 位的 SETUP_TOKEN 并重启应用");
  }
  // 先哈希为相同长度，再做恒定时间比较，避免直接比较原始令牌的时序差异。
  const providedHash = createHash("sha256").update(token).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(providedHash, expectedHash)) {
    throw new ApiError(403, "初始化令牌不正确");
  }
}

export async function enforcePersistentRateLimit(key: string, maximum: number, message: string) {
  await consumeRateLimit(key, maximum, message);
}

export async function enforceSetupRateLimit() {
  await enforcePersistentRateLimit("nav-palace:setup", 15, "初始化尝试过于频繁，请一分钟后重试");
}
