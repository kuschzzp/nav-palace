import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { getDatabase, hasAdmin, isAdmin } from "./db";
import * as schema from "./schema";
import { ApiError } from "./validation";
import { getAllowedOrigins, getRequestOrigin } from "./request-origin";

// 认证配置在首次使用时初始化，构建页面时无需连接真实运行数据库。
function createAuth(baseURL: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(503, "请先配置至少 32 位的 BETTER_AUTH_SECRET 并重启应用");
  }
  return betterAuth({
    appName: "Nav Palace",
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(getDatabase().db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // 仅允许通过持有初始化密钥的专用接口创建唯一管理员。
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
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

const instances = new Map<string, ReturnType<typeof createAuth>>();

export function getAuth(source?: Request | Headers) {
  if (!process.env.BETTER_AUTH_URL) throw new ApiError(503, "请先配置 BETTER_AUTH_URL 并重启应用");
  const origin = source ? getRequestOrigin(source) : getAllowedOrigins()[0];
  if (!origin) throw new ApiError(403, "请求地址未被允许，请使用配置的站点地址访问");
  // 每个允许入口独立生成协议匹配的 Cookie，共享账号、数据库和签名密钥。
  let instance = instances.get(origin);
  if (!instance) {
    instance = createAuth(origin);
    instances.set(origin, instance);
  }
  return instance;
}

// 登录有效不等于具备管理权限，必须同时命中管理员绑定记录。
export async function getAdminSession() {
  if (!hasAdmin()) return null;
  const requestHeaders = await headers();
  const session = await getAuth(requestHeaders).api.getSession({ headers: requestHeaders });
  return session && isAdmin(session.user.id) ? session : null;
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

export function enforcePersistentRateLimit(key: string, maximum: number, message: string) {
  const { sqlite } = getDatabase();
  // 固定一分钟窗口，计数存入数据库；重启进程不会清空，事务避免并发绕过上限。
  sqlite.transaction(() => {
    const now = Date.now();
    const row = sqlite.prepare("SELECT count, lastRequest FROM rateLimit WHERE key = ?").get(key) as { count: number; lastRequest: number } | undefined;
    if (row && now - row.lastRequest < 60000) {
      if (row.count >= maximum) throw new ApiError(429, message);
      sqlite.prepare("UPDATE rateLimit SET count = count + 1 WHERE key = ?").run(key);
    } else {
      sqlite.prepare("INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, lastRequest = excluded.lastRequest").run(key, key, now);
    }
  }).immediate();
}

export function enforceSetupRateLimit() {
  enforcePersistentRateLimit("nav-palace:setup", 15, "初始化尝试过于频繁，请一分钟后重试");
}
