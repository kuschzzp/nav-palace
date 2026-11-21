import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { getPlatformProxy, unstable_dev } from "wrangler";
import sharp from "sharp";

// 使用实际构建的 Worker 和 workerd 的本地 D1/R2/Images，隔离账号、密钥及所有数据。
test("built Cloudflare Worker supports initialization, authentication, private sites and uploads", { timeout: 120000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "nav-palace-worker-test-"));
  const origin = "http://127.0.0.1:8787";
  const token = randomBytes(24).toString("hex");
  const password = randomBytes(24).toString("hex");
  const main = resolve(".open-next/worker.js");
  const configPath = join(directory, "wrangler.json");
  const persistence = join(directory, "state");
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>> | undefined;
  let worker: Awaited<ReturnType<typeof unstable_dev>> | undefined;
  try {
    await writeFile(configPath, JSON.stringify({
      name: "nav-palace-worker-test",
      main,
      compatibility_date: "2026-11-01",
      compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
      assets: { directory: resolve(".open-next/assets"), binding: "ASSETS" },
      services: [{ binding: "WORKER_SELF_REFERENCE", service: "nav-palace-worker-test" }],
      d1_databases: [{ binding: "DB", database_name: "nav-palace-test", database_id: randomUUID() }],
      r2_buckets: [{ binding: "UPLOADS", bucket_name: "nav-palace-test-uploads" }],
      images: { binding: "IMAGES" },
      vars: { BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), SETUP_TOKEN: token },
    }));
    // getPlatformProxy 接受最终目录，Wrangler dev 会在 persistTo 后附加 v3。
    proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: { path: join(persistence, "v3") } });
    const migration = await readFile(new URL("../../cloudflare/migrations/0001_initial.sql", import.meta.url), "utf8");
    await proxy.env.DB.batch(migration.split(";").map((statement) => statement.trim()).filter(Boolean).map((statement) => proxy!.env.DB.prepare(statement)));
    await proxy.dispose();
    proxy = undefined;
    worker = await unstable_dev(main, {
      config: configPath, local: true, ip: "127.0.0.1", port: 0,
      persistTo: persistence, logLevel: "error",
      experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
    });
    let adminCookie = "";
    async function request(path: string, method = "GET", data?: unknown, cookie = adminCookie) {
      const headers: Record<string, string> = { origin };
      if (cookie) headers.cookie = cookie;
      if (data !== undefined) headers["content-type"] = "application/json";
      return worker!.fetch(origin + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    }
    const home = await request("/");
    assert.equal(home.status, 200);
    assert.match(await home.text(), /site-card-cover/);
    assert.equal((await request("/api/admin/data")).status, 401);
    assert.equal((await request("/api/setup", "POST", { name: "测试管理员", email: "admin@example.com", password, token })).status, 201);
    assert.equal((await request("/api/setup", "POST", { name: "重复管理员", email: "other@example.com", password, token })).status, 409);
    // 实际 Worker 同时处理密码校验，检查可移植 scrypt 的并发失败路径。
    const invalidLogins = await Promise.all(Array.from({ length: 4 }, () =>
      request("/api/auth/sign-in/email", "POST", { email: "admin@example.com", password: "wrong-test-password" })));
    for (const response of invalidLogins) assert.equal(response.status, 401);
    const login = await request("/api/auth/sign-in/email", "POST", { email: "admin@example.com", password });
    assert.equal(login.status, 200);
    adminCookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(adminCookie);
    const data = await (await request("/api/admin/data")).json() as { sites: { id: string }[]; settings: Record<string, unknown> };
    assert.equal(data.sites.length, 3);
    assert.equal((await request("/admin")).status, 200);
    const created = await request("/api/admin/sites", "POST", { name: "回归测试入口", url: "https://example.com" });
    assert.equal(created.status, 201);
    const newSite = await created.json() as { id: string };
    const edited = await request("/api/admin/sites/" + newSite.id, "PATCH", { name: "更新后的入口" });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json() as { name: string }).name, "更新后的入口");
    assert.equal((await request("/api/admin/sites/" + newSite.id, "DELETE")).status, 200);
    assert.equal((await request("/go/" + newSite.id, "GET", undefined, "")).status, 404);
    assert.equal((await request("/api/admin/settings", "PUT", { ...data.settings, name: "Cloudflare 测试" })).status, 200);
    assert.equal((await request("/api/admin/sites/journal", "PATCH", { requiresPassword: true })).status, 200);
    assert.equal((await request("/api/admin/access", "PUT", { password: "private-test-password" })).status, 200);
    const publicHome = await request("/", "GET", undefined, "");
    assert.doesNotMatch(await publicHome.text(), /拾光手记/);
    assert.equal((await request("/go/journal", "GET", undefined, "")).status, 404);
    const unlock = await request("/api/portal/access", "POST", { password: "private-test-password" }, "");
    assert.equal(unlock.status, 200);
    const privateCookie = unlock.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const unlocked = await (await request("/api/portal/access", "GET", undefined, privateCookie)).json() as { unlocked: boolean };
    assert.equal(unlocked.unlocked, true);
    assert.equal((await request("/go/journal", "GET", undefined, privateCookie)).status, 200);
    assert.equal((await request("/api/admin/sites/reorder", "PUT", { ids: data.sites.map((site) => site.id).reverse() })).status, 200);

    const pixels = await sharp({ create: { width: 120, height: 80, channels: 4, background: "#b83224" } }).png().toBuffer();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(pixels)], "cover.png", { type: "image/png" }));
    // 原生 Node FormData 与 Wrangler 内置 undici 版本不同，先编码成真实 multipart 请求体。
    const multipart = new Request(origin + "/api/admin/uploads", { method: "POST", body: form });
    const uploaded = await worker.fetch(origin + "/api/admin/uploads", {
      method: "POST",
      headers: { origin, cookie: adminCookie, "content-type": multipart.headers.get("content-type")! },
      body: new Uint8Array(await multipart.arrayBuffer()),
    });
    assert.equal(uploaded.status, 201, await uploaded.clone().text());
    const image = await uploaded.json() as { url: string; width: number; height: number };
    assert.equal(image.width, 120);
    assert.equal(image.height, 80);
    for (const suffix of ["", "?w=240", "?w=480", "?w=800"]) {
      const response = await request(image.url + suffix);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, "webp");
    }
    assert.equal((await request("/api/admin/export")).status, 200);
    const exported = await (await request("/api/admin/export")).json();
    assert.equal((await request("/api/admin/import", "POST", { config: exported, preview: false })).status, 200);
    assert.equal((await request("/api/auth/sign-out", "POST", {})).status, 200);
    assert.equal((await request("/api/admin/data")).status, 401);
  } finally {
    await worker?.stop();
    await proxy?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
