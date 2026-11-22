import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getAllowedOrigins, getRequestOrigin } from "../src/lib/request-origin";
import { ApiError, assertSameOrigin } from "../src/lib/validation";

const domain = "https://nav.example.com";
const ip = "http://198.51.100.10:30010";
const originEnvironment = { BETTER_AUTH_URL: domain, ALLOWED_ORIGINS: ip };

// 所有用例串行修改环境变量，并在结束后恢复；真实站点数据不会参与测试。
async function withEnvironment(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

function request(origin: string, path: string, method = "GET", body?: unknown, cookie?: string) {
  const headers = new Headers({ host: new URL(origin).host });
  if (method !== "GET") headers.set("origin", origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  // 模拟反向代理后的内部 URL，外部入口由 Host 和配置的精确白名单确定。
  return new Request(`http://127.0.0.1:3000${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("origin configuration includes the primary address, deduplicates entries and rejects unsafe or ambiguous origins", { concurrency: false }, async () => {
  await withEnvironment({ BETTER_AUTH_URL: `${domain}/`, ALLOWED_ORIGINS: ` ${ip},${domain},${ip} ` }, () => {
    assert.deepEqual(getAllowedOrigins(), [domain, ip]);
  });
  await withEnvironment({ BETTER_AUTH_URL: undefined, ALLOWED_ORIGINS: undefined }, () => {
    assert.deepEqual(getAllowedOrigins(), []);
    assert.equal(getRequestOrigin(new Headers({ host: "evil.example" })), undefined);
  });
  for (const invalid of [
    "ftp://example.com", "https://user:pass@example.com", "https://*.example.com",
    "https://example.com/path", "https://example.com?q=1", "https://example.com#fragment",
    "https://exam\nple.com", "https://example.com\\path", "http://nav.example.com",
  ]) {
    await withEnvironment({ BETTER_AUTH_URL: domain, ALLOWED_ORIGINS: invalid }, () => {
      assert.throws(() => getAllowedOrigins(), invalid);
    });
  }
  await withEnvironment({ BETTER_AUTH_URL: "https://user:pass@example.com", ALLOWED_ORIGINS: ip }, () => {
    assert.throws(() => getAllowedOrigins());
  });
});

test("request origin trusts only exact configured hosts and never forwarded headers or cross-entry POSTs", { concurrency: false }, async () => {
  await withEnvironment(originEnvironment, () => {
    for (const origin of [domain, ip]) {
      const incoming = request(origin, "/api/admin/settings", "PUT", {});
      incoming.headers.set("x-forwarded-host", "evil.example");
      incoming.headers.set("x-forwarded-proto", origin === domain ? "http" : "https");
      assert.equal(getRequestOrigin(incoming), origin);
      assert.doesNotThrow(() => assertSameOrigin(incoming));
    }
    assert.equal(getRequestOrigin(new Request(`${ip}/api/auth/get-session`)), ip);
    for (const host of ["evil.example", "nav.example.com.evil.example", "198.51.100.10:30011", "nav.example.com,evil.example"]) {
      const incoming = request(domain, "/api/admin/settings", "PUT", {});
      incoming.headers.set("host", host);
      incoming.headers.set("x-forwarded-host", new URL(domain).host);
      assert.equal(getRequestOrigin(incoming), undefined);
      assert.throws(() => assertSameOrigin(incoming), (error) => error instanceof ApiError && error.status === 403);
    }
    assert.equal(getRequestOrigin(new Headers({ "x-forwarded-host": new URL(domain).host })), undefined);
    for (const origin of [ip, "http://nav.example.com", "https://evil.example", `${domain}/`, "null", ""]) {
      const incoming = request(domain, "/api/admin/settings", "PUT", {});
      if (origin) incoming.headers.set("origin", origin); else incoming.headers.delete("origin");
      assert.throws(() => assertSameOrigin(incoming), (error) => error instanceof ApiError && error.status === 403);
    }
  });
});

test("domain HTTPS and IP HTTP share one administrator and support protected writes, private access and independent logout", { concurrency: false }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-multi-origin-"));
  const globals = globalThis as typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage };
  const previousStorage = globals.AsyncLocalStorage;
  globals.AsyncLocalStorage ??= AsyncLocalStorage;
  try {
    await withEnvironment({
      ...originEnvironment,
      DATABASE_PATH: join(directory, "test.db"),
      BETTER_AUTH_SECRET: "multi-origin-test-secret-at-least-32-characters",
      SETUP_TOKEN: "multi-origin-test-setup-token",
    }, async () => {
      const store = await import("../src/lib/db");
      try {
        const auth = await import("../src/lib/auth");
        const setup = await import("../src/app/api/setup/route");
        const authentication = await import("../src/app/api/auth/[...all]/route");
        const sites = await import("../src/app/api/admin/sites/route");
        const site = await import("../src/app/api/admin/sites/[id]/route");
        const settings = await import("../src/app/api/admin/settings/route");
        const accessSettings = await import("../src/app/api/admin/access/route");
        const privateAccess = await import("../src/app/api/portal/access/route");
        const { createRequestStoreForAPI } = await import("next/dist/server/async-storage/request-store.js");
        const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external.js");
        const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");

        // 使用 Next 请求存储运行路由，实际验证 requireAdmin 与 SSR headers() 链路。
        async function inRequest<T>(incoming: Request, run: () => Promise<T>) {
          const requestStore = createRequestStoreForAPI(
            incoming as Parameters<typeof createRequestStoreForAPI>[0], new URL(incoming.url),
            { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined,
          );
          const workStore = { route: new URL(incoming.url).pathname } as NonNullable<ReturnType<typeof workAsyncStorage.getStore>>;
          return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, run));
        }
        const password = "multi-origin-test-password-123";
        const account = { name: "测试管理员", email: "admin@example.com", password, token: process.env.SETUP_TOKEN };
        const initialization = request(ip, "/api/setup", "POST", account);
        assert.equal((await inRequest(initialization, () => setup.POST(initialization))).status, 201);
        const repeated = request(domain, "/api/setup", "POST", account);
        assert.equal((await inRequest(repeated, () => setup.POST(repeated))).status, 409);
        assert.equal(store.getDatabase().sqlite.prepare("SELECT count(*) FROM user").pluck().get(), 1);
        assert.notEqual(auth.getAuth(new Headers({ host: new URL(domain).host })), auth.getAuth(new Headers({ host: new URL(ip).host })));
        assert.throws(() => auth.getAuth(new Headers({ host: "evil.example" })), (error) => error instanceof ApiError && error.status === 403);

        const sessions = new Map<string, string>();
        for (const origin of [domain, ip]) {
          const login = request(origin, "/api/auth/sign-in/email", "POST", { email: account.email, password });
          const response = await inRequest(login, () => authentication.POST(login));
          assert.equal(response.status, 200, await response.clone().text());
          const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
          assert.ok(cookie);
          assert.equal(/;\s*Secure(?:;|$)/i.test(cookie), origin === domain);
          assert.equal(cookie.startsWith("__Secure-"), origin === domain);
          assert.match(cookie, /HttpOnly/i);
          sessions.set(origin, response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "));
          const sessionRequest = request(origin, "/api/auth/get-session", "GET", undefined, sessions.get(origin));
          const sessionResponse = await inRequest(sessionRequest, () => authentication.GET(sessionRequest));
          assert.equal(sessionResponse.status, 200);
          assert.equal((await sessionResponse.json()).user.email, account.email);
          const adminRequest = request(origin, "/admin", "GET", undefined, sessions.get(origin));
          assert.equal((await inRequest(adminRequest, () => auth.getAdminSession()))?.user.email, account.email);
        }

        const create = request(ip, "/api/admin/sites", "POST", { name: "双入口测试", url: "https://example.com/tool" }, sessions.get(ip));
        const created = await inRequest(create, () => sites.POST(create));
        assert.equal(created.status, 201, await created.clone().text());
        const id = (await created.json()).id as string;
        const edit = request(domain, `/api/admin/sites/${id}`, "PATCH", { name: "域名编辑完成" }, sessions.get(domain));
        assert.equal((await inRequest(edit, () => site.PATCH(edit, { params: Promise.resolve({ id }) }))).status, 200);
        assert.equal(store.getAdminData().sites.find((item) => item.id === id)?.name, "域名编辑完成");
        for (const origin of [domain, ip]) {
          const updatedSettings = { ...store.getSettings(), footer: origin === domain ? "HTTPS 更新成功" : "HTTP 更新成功" };
          const update = request(origin, "/api/admin/settings", "PUT", updatedSettings, sessions.get(origin));
          assert.equal((await inRequest(update, () => settings.PUT(update))).status, 200);
          assert.equal(store.getSettings().footer, updatedSettings.footer);
        }
        const crossEntry = request(domain, "/api/admin/settings", "PUT", store.getSettings(), sessions.get(domain));
        crossEntry.headers.set("origin", ip);
        assert.equal((await inRequest(crossEntry, () => settings.PUT(crossEntry))).status, 403);
        const anonymous = request(ip, "/api/admin/settings", "PUT", store.getSettings());
        assert.equal((await inRequest(anonymous, () => settings.PUT(anonymous))).status, 401);

        const privatePassword = "multi-origin-test-private-password";
        const configurePrivate = request(domain, "/api/admin/access", "PUT", { password: privatePassword }, sessions.get(domain));
        assert.equal((await inRequest(configurePrivate, () => accessSettings.PUT(configurePrivate))).status, 200);
        for (const origin of [domain, ip]) {
          const unlock = request(origin, "/api/portal/access", "POST", { password: privatePassword });
          const unlocked = await inRequest(unlock, () => privateAccess.POST(unlock));
          assert.equal(unlocked.status, 200);
          const cookie = unlocked.headers.get("set-cookie")!;
          assert.equal(/;\s*Secure(?:;|$)/i.test(cookie), origin === domain);
          const status = request(origin, "/api/portal/access", "GET", undefined, cookie.split(";")[0]);
          assert.deepEqual(await (await inRequest(status, () => privateAccess.GET(status))).json(), { unlocked: true, configured: true });
          const lock = request(origin, "/api/portal/access", "DELETE", undefined, cookie.split(";")[0]);
          const locked = await inRequest(lock, () => privateAccess.DELETE(lock));
          assert.equal(locked.status, 200);
          assert.match(locked.headers.get("set-cookie")!, /Max-Age=0/i);
          assert.equal(/;\s*Secure(?:;|$)/i.test(locked.headers.get("set-cookie")!), origin === domain);
        }

        for (const origin of [ip, domain]) {
          const logout = request(origin, "/api/auth/sign-out", "POST", {}, sessions.get(origin));
          const signedOut = await inRequest(logout, () => authentication.POST(logout));
          assert.equal(signedOut.status, 200);
          const cleared = signedOut.headers.getSetCookie().find((value) => value.includes("session_token="));
          assert.ok(cleared);
          assert.match(cleared, /Max-Age=0/i);
          assert.equal(/;\s*Secure(?:;|$)/i.test(cleared), origin === domain);
          const sessionRequest = request(origin, "/api/auth/get-session", "GET", undefined, sessions.get(origin));
          assert.equal(await (await inRequest(sessionRequest, () => authentication.GET(sessionRequest))).json(), null);
          if (origin === ip) {
            const stillSignedIn = request(domain, "/admin", "GET", undefined, sessions.get(domain));
            assert.ok(await inRequest(stillSignedIn, () => auth.getAdminSession()));
          }
        }
      } finally { store.closeDatabase(); }
    });
  } finally {
    if (previousStorage === undefined) Reflect.deleteProperty(globals, "AsyncLocalStorage"); else globals.AsyncLocalStorage = previousStorage;
    rmSync(directory, { recursive: true, force: true });
  }
});
