import { randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";

function readCredentials(filename) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function initializeCredentials(filename) {
  const saved = readCredentials(filename);
  if (saved) return saved;

  const credentials = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || randomBytes(48).toString("base64url"),
    SETUP_TOKEN: process.env.SETUP_TOKEN || randomBytes(24).toString("base64url"),
  };
  validateCredentials(credentials);
  const temporaryDir = mkdtempSync(join(dirname(filename), ".runtime-"));
  try {
    // 完整写入后原子发布，重启和同时启动都不会覆盖已生成的凭据。
    const temporaryFile = join(temporaryDir, "credentials.json");
    writeFileSync(temporaryFile, JSON.stringify(credentials) + "\n", { mode: 0o600 });
    try {
      linkSync(temporaryFile, filename);
      return credentials;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return readCredentials(filename);
    }
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

function validateCredentials({ BETTER_AUTH_SECRET, SETUP_TOKEN }) {
  if (typeof BETTER_AUTH_SECRET !== "string" || BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET 至少需要 32 个字符。");
  }
  if (typeof SETUP_TOKEN !== "string" || SETUP_TOKEN.length < 16 || /[\r\n]/.test(SETUP_TOKEN)) {
    throw new Error("SETUP_TOKEN 至少需要 16 个字符，且只能占一行。");
  }
}

function hasAdministrator(databasePath) {
  if (databasePath === ":memory:" || !existsSync(databasePath)) return false;
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const table = database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'administrators'").get();
    return Boolean(table && database.prepare("SELECT 1 FROM administrators LIMIT 1").get());
  } finally {
    database.close();
  }
}

const configuredPath = process.env.DATABASE_PATH || "./data/nav-palace.db";
const databasePath = configuredPath === ":memory:" ? configuredPath : resolve(configuredPath);
const dataDirectory = databasePath === ":memory:" ? resolve("data") : dirname(databasePath);
const authUrl = URL.parse(process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000");
if (!authUrl || !["http:", "https:"].includes(authUrl.protocol) || authUrl.username || authUrl.password) {
  throw new Error("BETTER_AUTH_URL 必须是浏览器实际访问的 HTTP 或 HTTPS 地址。");
}

mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
const saved = initializeCredentials(join(dataDirectory, ".nav-palace-runtime.json"));
const credentials = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || saved.BETTER_AUTH_SECRET,
  SETUP_TOKEN: process.env.SETUP_TOKEN || saved.SETUP_TOKEN,
};
validateCredentials(credentials);
Object.assign(process.env, credentials, { DATABASE_PATH: databasePath, BETTER_AUTH_URL: authUrl.href });

// 尚未创建管理员时，每次启动都提示同一个令牌，方便查看新容器的日志。
if (!hasAdministrator(databasePath)) {
  console.log(`初始化管理员：${new URL("/admin/setup", authUrl).href}`);
  console.log(`SETUP_TOKEN=${credentials.SETUP_TOKEN}`);
}

await import("../server.js");
