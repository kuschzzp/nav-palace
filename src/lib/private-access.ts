import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "./db";
import { ApiError } from "./validation";
import { getAllowedOrigins, getRequestOrigin } from "./request-origin";

const deriveKey = promisify(scrypt);
export const ACCESS_COOKIE = "nav-palace.private-access";
export const ACCESS_DURATION_SECONDS = 60 * 60 * 24 * 7;
export const accessPasswordSchema = z.string().min(8, "访问密码至少需要 8 位").max(128, "访问密码最多 128 位");
export const accessPasswordInputSchema = z.object({ password: accessPasswordSchema }).strict();
type AccessState = { passwordHash: string; version: string };

function getAccessState(): AccessState | undefined {
  return getDatabase().sqlite.prepare("SELECT passwordHash, version FROM portal_access WHERE id = 1").get() as AccessState | undefined;
}

export function isAccessConfigured() { return Boolean(getAccessState()); }

export async function setAccessPassword(password: string) {
  const validPassword = accessPasswordSchema.parse(password);
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(validPassword, salt, 64) as Buffer;
  // 只保存带随机盐的 scrypt 哈希；随机版本用于立即撤销所有旧浏览器的解锁状态。
  getDatabase().sqlite.prepare("INSERT INTO portal_access (id, passwordHash, version) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET passwordHash = excluded.passwordHash, version = excluded.version")
    .run(`scrypt:${salt}:${key.toString("hex")}`, randomUUID());
}

async function verifyPasswordState(password: string): Promise<AccessState | false> {
  const state = getAccessState();
  if (!state || !accessPasswordSchema.safeParse(password).success) return false;
  const parts = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(state.passwordHash);
  if (!parts) return false;
  const provided = await deriveKey(password, parts[1], 64) as Buffer;
  // 密码校验期间若管理员换了密码，旧校验结果不能获得新版本的解锁凭据。
  return timingSafeEqual(provided, Buffer.from(parts[2], "hex")) && getAccessState()?.version === state.version ? state : false;
}

export async function verifyAccessPassword(password: string) { return Boolean(await verifyPasswordState(password)); }

function signingSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update("nav-palace-private-access:" + payload).digest();
}

function tokenForVersion(version: string, nowMs: number) {
  const secret = signingSecret();
  if (!secret) throw new ApiError(503, "请先配置站点认证密钥");
  const payload = Buffer.from(JSON.stringify({ version, expiresAt: nowMs + ACCESS_DURATION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function issueAccessToken(nowMs = Date.now()) {
  const state = getAccessState();
  if (!state) throw new ApiError(503, "暂未配置私密访问密码，请联系站长");
  return tokenForVersion(state.version, nowMs);
}

export async function authenticateAccessPassword(password: string): Promise<string | false> {
  const verified = await verifyPasswordState(password);
  if (!verified || getAccessState()?.version !== verified.version) return false;
  // 必须签发“被验证的密码版本”，不能在验证后重读新版本并给旧密码授予新权限。
  // 即便另一个进程紧接着修改密码，这个旧版本令牌也会立即被验证函数拒绝。
  return tokenForVersion(verified.version, Date.now());
}

export function verifyAccessToken(token: string | undefined, nowMs = Date.now()) {
  const state = getAccessState();
  const secret = signingSecret();
  if (!token || token.length > 1024 || !state || !secret) return false;
  const parts = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return false;
  const expected = signature(parts[1], secret);
  const provided = Buffer.from(parts[2], "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { version?: unknown; expiresAt?: unknown };
    return payload.version === state.version && typeof payload.expiresAt === "number" && Number.isSafeInteger(payload.expiresAt) && payload.expiresAt > nowMs;
  } catch { return false; }
}

export function accessCookieOptions(nowMs = Date.now(), source?: Request | Headers) {
  const origin = source ? getRequestOrigin(source) : getAllowedOrigins()[0];
  if (!origin) throw new ApiError(403, "请求地址未被允许，请使用配置的站点地址访问");
  return {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: ACCESS_DURATION_SECONDS,
    expires: new Date(nowMs + ACCESS_DURATION_SECONDS * 1000),
  };
}

export async function getPrivateAccess() {
  return verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
}

export function getRequestPrivateAccess(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(ACCESS_COOKIE + "="));
  return verifyAccessToken(cookie?.slice(ACCESS_COOKIE.length + 1));
}
