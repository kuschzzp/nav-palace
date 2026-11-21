import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ApiError, assertSameOrigin, imageUrlSchema, readJson, setupSchema, siteInputSchema, sitePatchSchema, webUrlSchema } from "../src/lib/validation";

// URL 校验同时覆盖脚本协议、内嵌凭据、协议相对地址和图片路径穿越。
test("only http(s) destinations and safe local image paths are accepted", () => {
  for (const unsafe of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "https://name:pass@example.com", "https:example.com", "https://exam\nple.com", "/relative"]) {
    assert.equal(webUrlSchema.safeParse(unsafe).success, false, unsafe);
  }
  for (const safe of ["https://example.com", "http://localhost:8080/path?q=hello"]) {
    assert.equal(webUrlSchema.safeParse(safe).success, true, safe);
  }
  for (const unsafe of ["//evil.example/a.png", "/images/../secret", "/uploads//a.png", "/api/private", "data:image/svg+xml,<svg>"]) {
    assert.equal(imageUrlSchema.safeParse(unsafe).success, false, unsafe);
  }
  assert.equal(imageUrlSchema.safeParse("/images/site-journal.png").success, true);
  assert.equal(imageUrlSchema.safeParse("https://cdn.example.com/image.webp").success, true);
});

test("partial website edits preserve omitted fields and reject unknown authority fields", () => {
  assert.deepEqual(sitePatchSchema.parse({ visible: false }), { visible: false });
  assert.deepEqual(sitePatchSchema.parse({ name: "新名称" }), { name: "新名称" });
  assert.equal(sitePatchSchema.safeParse({}).success, false);
  assert.equal(siteInputSchema.safeParse({ name: "Test", url: "https://example.com", id: "admin" }).success, false);
  const input = setupSchema.parse({ name: "管理员", email: "ADMIN@EXAMPLE.COM", password: "a-safe-password-123", token: "setup-token" });
  assert.equal(input.email, "admin@example.com");
  assert.equal(setupSchema.safeParse({ ...input, password: "short" }).success, false);
});

test("JSON parsing rejects oversized UTF-8 payloads before processing", async () => {
  const request = new Request("http://localhost:3000/api/setup", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "字".repeat(23000) }),
  });
  await assert.rejects(() => readJson(request), (error) => error instanceof ApiError && error.status === 413);
  assert.deepEqual(await readJson(new Request("http://localhost:3000/api/setup", {
    method: "POST", headers: { "content-type": "application/json" }, body: '{"value":"正常"}',
  })), { value: "正常" });
});

test("mutation requests require the configured origin", () => {
  const before = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://nav.example.com";
  try {
    assert.doesNotThrow(() => assertSameOrigin(new Request("http://internal:3000/api/admin/sites", { headers: { origin: "https://nav.example.com" } })));
    assert.throws(() => assertSameOrigin(new Request("http://internal:3000/api/admin/sites", { headers: { origin: "https://other.example.com" } })));
    assert.throws(() => assertSameOrigin(new Request("http://internal:3000/api/admin/sites")));
  } finally {
    if (before === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = before;
  }
});

// 先设置独立数据库路径再加载存储模块，避免测试接触真实站点数据。
test("SQLite persists edits, hides private sites, validates complete ordering, and permits one administrator", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-test-"));
  const beforePath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, "test.db");
  let cleanupStore: typeof import("../src/lib/db") | undefined;
  try {
    const store = await import("../src/lib/db");
    cleanupStore = store;
    assert.equal(store.hasAdmin(), false);
    assert.equal(store.getPortalData().sites.length, 3);
    store.updateSite("journal", { visible: false });
    assert.equal(store.getPortalData().sites.some((site) => site.id === "journal"), false);
    assert.equal(store.getAdminData().sites.length, 3);
    store.reorderSites(["gallery", "studio", "journal"]);
    assert.deepEqual(store.getPortalData().sites.map((site) => site.id), ["gallery", "studio"]);
    assert.throws(() => store.reorderSites(["gallery", "gallery", "studio"]));
    assert.throws(() => store.reorderSites(["gallery"]));
    store.updateSettings({ ...store.getSettings(), headline: "保存后的标题" });
    store.closeDatabase();
    assert.equal(store.getSettings().headline, "保存后的标题");
    assert.equal(store.getAdminData().sites.length, 3);
    store.createAdministrator({ name: "Admin", email: "admin@example.com", passwordHash: "test-only-hash" });
    assert.equal(store.hasAdmin(), true);
    assert.throws(() => store.createAdministrator({ name: "Other", email: "other@example.com", passwordHash: "test-only-hash" }));
    const count = store.getDatabase().sqlite.prepare("SELECT count(*) AS total FROM user").get() as { total: number };
    assert.equal(count.total, 1);
  } finally {
    cleanupStore?.closeDatabase();
    if (beforePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = beforePath;
    rmSync(directory, { recursive: true, force: true });
  }
});

// 使用临时密钥和数据库验证真实登录链路，结束后恢复环境并清理数据。
test("Better Auth signs in the initialized administrator, persists a session, and refuses public registration", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-auth-test-"));
  const previous = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    SETUP_TOKEN: process.env.SETUP_TOKEN,
  };
  process.env.DATABASE_PATH = join(directory, "auth.db");
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "integration-test-secret-that-is-long-enough-1234";
  process.env.SETUP_TOKEN = "integration-test-setup-token-1234";
  let cleanupStore: typeof import("../src/lib/db") | undefined;
  try {
    const store = await import("../src/lib/db");
    cleanupStore = store;
    const { enforcePersistentRateLimit, getAuth, verifySetupToken } = await import("../src/lib/auth");
    assert.doesNotThrow(() => verifySetupToken(process.env.SETUP_TOKEN!));
    assert.throws(() => verifySetupToken("incorrect-token"));
    await enforcePersistentRateLimit("test:limit", 2, "Too many requests");
    await enforcePersistentRateLimit("test:limit", 2, "Too many requests");
    await assert.rejects(() => enforcePersistentRateLimit("test:limit", 2, "Too many requests"), (error) => error instanceof ApiError && error.status === 429);
    const auth = getAuth();
    const context = await auth.$context;
    const password = "integration-password-1234";
    const passwordHash = await context.password.hash(password);
    const previousRuntime = process.env.NAV_PALACE_RUNTIME;
    try {
      // 两种运行环境必须互认密码哈希，避免迁移或回滚后管理员无法登录。
      process.env.NAV_PALACE_RUNTIME = "cloudflare";
      const cloudflareAuth = getAuth();
      assert.notEqual(cloudflareAuth, getAuth());
      const cloudflarePassword = (await cloudflareAuth.$context).password;
      assert.equal(await cloudflarePassword.verify({ hash: passwordHash, password }), true);
      assert.equal(await cloudflarePassword.verify({ hash: passwordHash, password: "incorrect-password" }), false);
      const cloudflareHash = await cloudflarePassword.hash(password);
      assert.equal(await context.password.verify({ hash: cloudflareHash, password }), true);
    } finally {
      if (previousRuntime === undefined) delete process.env.NAV_PALACE_RUNTIME;
      else process.env.NAV_PALACE_RUNTIME = previousRuntime;
    }
    store.createAdministrator({ name: "Admin", email: "admin@example.com", passwordHash });
    const login = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password }),
    }));
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
    assert.ok(cookies.includes("session_token="));
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
    assert.equal(session?.user.email, "admin@example.com");
    assert.ok(session && store.isAdmin(session.user.id));
    const blocked = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ name: "Other", email: "other@example.com", password }),
    }));
    assert.ok(blocked.status >= 400);
    const count = store.getDatabase().sqlite.prepare("SELECT count(*) AS total FROM user").get() as { total: number };
    assert.equal(count.total, 1);
  } finally {
    cleanupStore?.closeDatabase();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
