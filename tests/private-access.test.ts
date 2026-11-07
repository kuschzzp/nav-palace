import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { test } from "node:test";

async function isolatedDatabase(run: (path: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-private-"));
  const previous = { DATABASE_PATH: process.env.DATABASE_PATH, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL };
  process.env.DATABASE_PATH = join(directory, "private.db");
  process.env.BETTER_AUTH_SECRET = "private-access-test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  try { await run(process.env.DATABASE_PATH); }
  finally {
    (await import("../src/lib/db")).closeDatabase();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

test("v1 migration keeps existing sites and account rows, defaults sites to public, and removes old music settings", async () => isolatedDatabase(async (path) => {
  const old = new Database(path);
  old.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO user VALUES ('existing-admin', '保留管理员');
    CREATE TABLE account (id TEXT PRIMARY KEY, userId TEXT, password TEXT);
    INSERT INTO account VALUES ('existing-credential', 'existing-admin', 'existing-hash-retained');
    CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'globe', category TEXT NOT NULL DEFAULT '', sortOrder INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1, newTab INTEGER NOT NULL DEFAULT 1);
    INSERT INTO sites (id,name,url) VALUES ('existing-site','已有网站','https://existing.example');
    CREATE TABLE portal_settings (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version=1;
  `);
  old.prepare("INSERT INTO portal_settings VALUES (1,?)").run(JSON.stringify({ name: "保留名字", headline: "保留标题", heroImage: "/images/old-hero.webp", musicEnabled: true, musicTitle: "旧音乐", musicUrl: "/audio/old.mp3" }));
  old.close();
  const store = await import("../src/lib/db");
  assert.equal(store.getDatabase().sqlite.pragma("user_version", { simple: true }), 6);
  assert.equal(store.getDatabase().sqlite.prepare("SELECT name FROM user WHERE id='existing-admin'").pluck().get(), "保留管理员");
  assert.equal(store.getDatabase().sqlite.prepare("SELECT password FROM account WHERE id='existing-credential'").pluck().get(), "existing-hash-retained");
  assert.equal(store.getPublicSite("existing-site")?.requiresPassword, false);
  assert.equal(store.getSettings().name, "保留名字");
  assert.equal(store.getSettings().headline, "保留标题");
  const stored = JSON.parse(store.getDatabase().sqlite.prepare("SELECT value FROM portal_settings").pluck().get() as string);
  assert.equal("musicEnabled" in stored, false);
  assert.equal("heroImage" in stored, false);
  assert.equal("musicTitle" in stored, false);
  assert.equal("musicUrl" in stored, false);
  assert.equal((await import("../src/lib/private-access")).isAccessConfigured(), false);
}));

test("v2 migration removes retired feature settings and preserves accounts, private sites and live access tokens", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const access = await import("../src/lib/private-access");
  store.createAdministrator({ name: "已有管理员", email: "existing@example.com", passwordHash: "existing-account-hash" });
  store.updateSite("studio", { name: "已有私密网站", url: "https://private.example/existing", requiresPassword: true });
  await access.setAccessPassword("existing-private-password-123");
  const token = access.issueAccessToken();
  const legacySettings: Record<string, unknown> = {
    ...store.getSettings(), heroImage: "/images/old-hero.webp", name: "已有站点名称", cursorStyle: "ocean", petalsEnabled: false,
    companionEnabled: true, musicEnabled: true, musicTitle: "旧曲目", musicUrl: "/audio/old.mp3",
    extension: { preference: "保留扩展配置" },
  };
  delete legacySettings.atmosphereStyle;
  const before = store.getDatabase().sqlite;
  before.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").run(JSON.stringify(legacySettings));
  // v2 与 v3 表结构相同；还原旧版本号及功能配置，模拟已部署的 v2 数据库。
  before.pragma("user_version = 2");
  const tables = ["user", "account", "administrators", "sites", "portal_access"];
  const rows = tables.map((table) => before.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  store.closeDatabase();
  const after = store.getDatabase().sqlite;
  assert.equal(after.pragma("user_version", { simple: true }), 6);
  tables.forEach((table, index) => assert.deepEqual(after.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), rows[index]));
  const expected = { ...legacySettings };
  for (const key of ["heroImage", "cursorStyle", "companionEnabled", "musicEnabled", "musicTitle", "musicUrl", "petalsEnabled"]) delete expected[key];
  expected.atmosphereStyle = "none";
  const saved = JSON.parse(after.prepare("SELECT value FROM portal_settings WHERE id = 1").pluck().get() as string);
  assert.deepEqual(saved, expected);
  assert.equal(store.getPublicSite("studio"), undefined);
  assert.equal(store.getPublicSite("studio", true)?.url, "https://private.example/existing");
  assert.equal(access.verifyAccessToken(token), true);
  assert.equal(await access.verifyAccessPassword("existing-private-password-123"), true);
  assert.equal("companionEnabled" in store.getSettings(), false);
}));

test("locked portal and departure lookups omit every private field while hidden sites stay hidden after unlock", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const access = await import("../src/lib/private-access");
  store.updateSite("studio", { name: "私密站点名称", url: "https://private.example/hidden", requiresPassword: true });
  store.updateSite("gallery", { requiresPassword: true, visible: false });
  assert.equal(store.getPortalData().sites.length, 1);
  assert.equal(JSON.stringify(store.getPortalData()).includes("private.example"), false);
  assert.equal(JSON.stringify(store.getPortalData()).includes("私密站点名称"), false);
  assert.equal(store.getPublicSite("studio"), undefined);
  assert.equal(store.getPublicSite("studio", true)?.url, "https://private.example/hidden");
  assert.equal(store.getPublicSite("gallery", true), undefined);
  assert.equal(store.getPortalData(true).sites.length, 2);
  await access.setAccessPassword("private-password-test-123");
  assert.equal(store.getAdminData().accessConfigured, true);
  assert.equal(store.getAdminData().sites.length, 3);
  assert.equal(JSON.stringify(store.getAdminData()).includes("scrypt:"), false);
  // 即使旧配置里出现未知字段，也不会跟随公共页面或后台导出数据返回。
  store.getDatabase().sqlite.prepare("UPDATE portal_settings SET value=? WHERE id=1").run(JSON.stringify({ ...store.getSettings(), passwordHash: "must-not-leak", musicUrl: "must-not-leak" }));
  assert.equal(JSON.stringify(store.getSettings()).includes("must-not-leak"), false);
}));

test("access password hashes, signed tokens, seven-day expiry, tampering and immediate password-change revocation", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const access = await import("../src/lib/private-access");
  assert.equal(access.isAccessConfigured(), false);
  assert.equal(access.verifyAccessToken("anything"), false);
  await access.setAccessPassword("private-password-test-123");
  assert.equal(await access.verifyAccessPassword("private-password-test-123"), true);
  assert.equal(await access.verifyAccessPassword("incorrect-password"), false);
  await assert.rejects(() => access.setAccessPassword("short"));
  const hash = store.getDatabase().sqlite.prepare("SELECT passwordHash FROM portal_access").pluck().get() as string;
  assert.ok(hash.startsWith("scrypt:"));
  assert.equal(hash.includes("private-password-test-123"), false);
  const now = Date.now();
  const token = access.issueAccessToken(now);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  assert.equal(access.verifyAccessToken(token, now), true);
  assert.equal(access.verifyAccessToken(token, now + sevenDays - 1), true);
  assert.equal(access.verifyAccessToken(token, now + sevenDays), false);
  const [payload, signature] = token.split(".");
  assert.equal(access.verifyAccessToken(payload + "." + (signature[0] === "A" ? "B" : "A") + signature.slice(1), now), false);
  assert.equal(access.verifyAccessToken(token + ".extra", now), false);
  assert.equal(access.getRequestPrivateAccess(new Request("http://localhost:3000", { headers: { cookie: `${access.ACCESS_COOKIE}=${token}` } })), true);
  const options = access.accessCookieOptions(now);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.maxAge, sevenDays / 1000);
  assert.equal(options.expires.getTime(), now + sevenDays);
  assert.equal(options.path, "/");
  assert.equal(options.secure, false);
  process.env.BETTER_AUTH_URL = "https://nav.example.com";
  assert.equal(access.accessCookieOptions(now).secure, true);
  await access.setAccessPassword("new-password-test-456");
  assert.equal(access.verifyAccessToken(token, now), false);
  assert.equal(await access.verifyAccessPassword("private-password-test-123"), false);
  assert.equal(await access.verifyAccessPassword("new-password-test-456"), true);
}));

test("portal access API validates origin, rejects wrong password, issues private seven-day cookie, relocks and rate limits", async () => isolatedDatabase(async () => {
  const access = await import("../src/lib/private-access");
  const route = await import("../src/app/api/portal/access/route");
  const store = await import("../src/lib/db");
  await access.setAccessPassword("private-password-test-123");
  function post(password: string, origin = "http://localhost:3000") {
    return route.POST(new Request("http://localhost:3000/api/portal/access", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ password }) }));
  }
  const anonymous = await route.GET(new Request("http://localhost:3000/api/portal/access"));
  assert.equal(anonymous.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await anonymous.json(), { unlocked: false, configured: true });
  const rejectedOrigin = await post("private-password-test-123", "https://other.example");
  assert.equal(rejectedOrigin.status, 403);
  assert.equal(rejectedOrigin.headers.get("cache-control"), "private, no-store");
  const rejectedPassword = await post("incorrect-password");
  assert.equal(rejectedPassword.status, 403);
  assert.equal(rejectedPassword.headers.get("cache-control"), "private, no-store");
  const response = await post("private-password-test-123");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const cookie = response.headers.get("set-cookie")!;
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=lax"));
  assert.ok(cookie.includes("Max-Age=604800"));
  const status = await route.GET(new Request("http://localhost:3000/api/portal/access", { headers: { cookie: cookie.split(";")[0] } }));
  assert.deepEqual(await status.json(), { unlocked: true, configured: true });
  assert.equal(status.headers.get("cache-control"), "private, no-store");
  const locked = await route.DELETE(new Request("http://localhost:3000/api/portal/access", { method: "DELETE", headers: { origin: "http://localhost:3000" } }));
  assert.ok(locked.headers.get("set-cookie")?.includes("Max-Age=0"));
  assert.equal(locked.headers.get("cache-control"), "private, no-store");
  store.getDatabase().sqlite.prepare("UPDATE rateLimit SET count = 12 WHERE key = 'nav-palace:private-access'").run();
  assert.equal((await post("private-password-test-123")).status, 429);
}));

test("concurrent password changes cannot turn an old-password check into a new-version token", async () => isolatedDatabase(async () => {
  const access = await import("../src/lib/private-access");
  await access.setAccessPassword("old-private-password-123");
  // 启动异步 scrypt 后立即轮换密码，覆盖工作线程两种可能的完成顺序。
  // 旧校验若先完成，只能得到旧版本令牌；若后完成，则应被直接拒绝。
  const attempts = Array.from({ length: 4 }, () => access.authenticateAccessPassword("old-private-password-123"));
  await access.setAccessPassword("new-private-password-456");
  for (const token of await Promise.all(attempts)) {
    if (token) assert.equal(access.verifyAccessToken(token), false);
  }
  assert.equal(await access.authenticateAccessPassword("old-private-password-123"), false);
  const current = await access.authenticateAccessPassword("new-private-password-456");
  assert.ok(current && access.verifyAccessToken(current));
}));

for (const atmosphereStyle of [undefined, "snow"] as const) {
  test(`v3 to v6 removes obsolete columns, converts atmosphere (${atmosphereStyle || "legacy off"}), and keeps credentials and tokens`, async () => isolatedDatabase(async () => {
    const store = await import("../src/lib/db");
    const access = await import("../src/lib/private-access");
    store.createAdministrator({ name: "保留管理员", email: "retained@example.com", passwordHash: "unchanged-admin-password-hash" });
    store.updateSite("studio", { requiresPassword: true, category: "私密工具", sortOrder: 7 });
    await access.setAccessPassword("retained-private-password-123");
    const token = access.issueAccessToken();
    const before = store.getDatabase().sqlite;
    const legacy: Record<string, unknown> = { ...store.getSettings(), heroImage: "/images/old-hero.webp", petalsEnabled: false };
    delete legacy.atmosphereStyle;
    if (atmosphereStyle) legacy.atmosphereStyle = atmosphereStyle;
    before.prepare("UPDATE portal_settings SET value=? WHERE id=1").run(JSON.stringify(legacy));
    // 将真实数据库还原到 v3 的列形态，覆盖 DROP COLUMN 时其它列与关联表不变。
    before.exec("ALTER TABLE sites ADD COLUMN newTab INTEGER NOT NULL DEFAULT 1; UPDATE sites SET newTab=0 WHERE id='studio'; PRAGMA user_version=3");
    const tables = ["user", "account", "session", "administrators", "portal_access"];
    const retainedRows = tables.map((table) => before.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const retainedSites = store.getAdminData().sites;
    store.closeDatabase();
    const after = store.getDatabase().sqlite;
    assert.equal(after.pragma("user_version", { simple: true }), 6);
    tables.forEach((table, index) => assert.deepEqual(after.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), retainedRows[index]));
    assert.deepEqual(store.getAdminData().sites, retainedSites);
    assert.equal((after.pragma("table_info(sites)") as { name: string }[]).some((column) => column.name === "newTab"), false);
    assert.equal(store.getSettings().atmosphereStyle, atmosphereStyle ? "petals" : "none");
    const saved = JSON.parse(after.prepare("SELECT value FROM portal_settings WHERE id=1").pluck().get() as string);
    assert.equal("petalsEnabled" in saved, false);
    assert.equal("heroImage" in saved, false);
    assert.equal("newTab" in store.getAdminData().sites[0], false);
    assert.equal(store.getPublicSite("studio"), undefined);
    assert.equal(store.getPublicSite("studio", true)?.category, "私密工具");
    assert.equal(await access.verifyAccessPassword("retained-private-password-123"), true);
    assert.equal(access.verifyAccessToken(token), true);
  }));
}

test("v4 to v6 retires visual fields, preserves every other table and keeps existing sessions and access tokens", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const access = await import("../src/lib/private-access");
  store.createAdministrator({ name: "保留管理员", email: "v4-retained@example.com", passwordHash: "v4-retained-admin-hash" });
  store.updateSite("studio", { requiresPassword: true, category: "保留分类", image: "/uploads/retained-cover.webp" });
  await access.setAccessPassword("v4-retained-private-password-123");
  const token = access.issueAccessToken();
  const before = store.getDatabase().sqlite;
  const userId = before.prepare("SELECT userId FROM administrators WHERE singleton=1").pluck().get() as string;
  const now = Date.now();
  before.prepare("INSERT INTO session (id, token, expiresAt, createdAt, updatedAt, ipAddress, userAgent, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("retained-session", "retained-session-token", now + 86400000, now, now, "127.0.0.1", "migration-test", userId);
  before.prepare("INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run("retained-verification", "retained@example.com", "retained-verification-value", now + 60000, now, now);
  before.prepare("INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, ?, ?)")
    .run("retained-limit", "migration:retained", 3, now);
  const legacy = { ...store.getSettings(), atmosphereStyle: "snow", heroImage: "https://old.example/background.webp", extension: { untouched: [1, "保留扩展"] } };
  before.prepare("UPDATE portal_settings SET value=? WHERE id=1").run(JSON.stringify(legacy));
  before.pragma("user_version=4");
  const schemaVersion = before.pragma("schema_version", { simple: true });
  const tables = before.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'portal_settings' ORDER BY name").pluck().all() as string[];
  const rows = tables.map((table) => before.prepare(`SELECT * FROM "${table.replaceAll('"', '""')}" ORDER BY rowid`).all());
  store.closeDatabase();
  const after = store.getDatabase().sqlite;
  assert.equal(after.pragma("user_version", { simple: true }), 6);
  assert.equal(after.pragma("schema_version", { simple: true }), schemaVersion);
  tables.forEach((table, index) => assert.deepEqual(after.prepare(`SELECT * FROM "${table.replaceAll('"', '""')}" ORDER BY rowid`).all(), rows[index]));
  const expected: Record<string, unknown> = { ...legacy };
  delete expected.heroImage;
  expected.atmosphereStyle = "petals";
  const saved = JSON.parse(after.prepare("SELECT value FROM portal_settings WHERE id=1").pluck().get() as string);
  assert.deepEqual(saved, expected);
  assert.equal("heroImage" in store.getSettings(), false);
  assert.equal(store.getSettings().atmosphereStyle, "petals");
  assert.equal(store.getPublicSite("studio"), undefined);
  assert.equal(store.getPublicSite("studio", true)?.image, "/uploads/retained-cover.webp");
  assert.equal(await access.verifyAccessPassword("v4-retained-private-password-123"), true);
  assert.equal(access.verifyAccessToken(token), true);
}));
