import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { getPlatformProxy } from "wrangler";
import * as store from "../../src/lib/cloudflare/db";
import { ApiError } from "../../src/lib/validation";
import type { Site } from "../../src/lib/types";

test("D1 migration and writes preserve atomicity under concurrent requests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nav-palace-d1-test-"));
  const contextKey = Symbol.for("__cloudflare-context__");
  const contextGlobal = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const previousContext = contextGlobal[contextKey];
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>> | undefined;
  try {
    await writeFile(join(directory, "worker.js"), "export default { fetch() { return new Response('test'); } };\n");
    await writeFile(join(directory, "wrangler.json"), JSON.stringify({
      name: "nav-palace-d1-test",
      main: "worker.js",
      compatibility_date: "2026-11-01",
      d1_databases: [{ binding: "DB", database_name: "nav-palace-test", database_id: randomUUID() }],
    }));
    proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: join(directory, "wrangler.json"), persist: false });
    contextGlobal[contextKey] = { env: proxy.env, cf: proxy.cf, ctx: proxy.ctx };
    const database = proxy.env.DB;
    const migration = await readFile(new URL("../../cloudflare/migrations/0001_initial.sql", import.meta.url), "utf8");
    // 此迁移仅包含建表、索引和种子数据，分号不出现在任何字符串值中。
    await database.batch(migration.split(";").map((statement) => statement.trim()).filter(Boolean).map((statement) => database.prepare(statement)));

    await t.test("migration starts with the same defaults and public demos as SQLite", async () => {
      assert.deepEqual(await store.getSettings(), store.defaultSettings);
      assert.equal((await store.getPortalData()).sites.length, 3);
      assert.equal(await store.hasAdmin(), false);
    });

    await t.test("concurrent initialization creates exactly one administrator without orphan accounts", async () => {
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => store.createAdministrator({
        name: `管理员 ${index}`, email: `admin-${index}@example.com`, passwordHash: "test-only-password-hash",
      })));
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      for (const attempt of attempts) {
        if (attempt.status === "rejected") assert.equal(attempt.reason instanceof ApiError && attempt.reason.status, 409);
      }
      for (const table of ["user", "account", "administrators"]) {
        assert.equal((await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, 1);
      }
      assert.equal(await store.hasAdmin(), true);
    });

    await t.test("private and hidden sites are filtered at both listing and navigation entry points", async () => {
      const template = (await store.getAdminData()).sites[0];
      const privateSite = await store.createSite({ ...template, name: "私密入口", requiresPassword: true });
      const hiddenSite = await store.createSite({ ...template, name: "隐藏入口", visible: false });
      assert.equal((await store.getPortalData()).sites.some((site) => site.id === privateSite.id), false);
      assert.equal((await store.getPortalData(true)).sites.some((site) => site.id === privateSite.id), true);
      assert.equal(await store.getPublicSite(privateSite.id), undefined);
      assert.equal((await store.getPublicSite(privateSite.id, true))?.id, privateSite.id);
      assert.equal(await store.getPublicSite(hiddenSite.id, true), undefined);
      assert.equal((await store.getPortalData(true)).sites.some((site) => site.id === hiddenSite.id), false);
    });

    await t.test("invalid orders do not change rows and a valid complete order is applied", async () => {
      const ids = (await store.getAdminData()).sites.map((site) => site.id).reverse();
      await store.reorderSites(ids);
      assert.deepEqual((await store.getAdminData()).sites.map((site) => site.id), ids);
      for (const invalid of [[], ids.slice(1), [...ids, "missing"], ids.map(() => ids[0])]) {
        await assert.rejects(store.reorderSites(invalid), (error) => error instanceof ApiError && error.status === 400);
        assert.deepEqual((await store.getAdminData()).sites.map((site) => site.id), ids);
      }
    });

    await t.test("a thousand-site import and reorder stay below per-statement parameter limits", async () => {
      const sites: Site[] = Array.from({ length: 1000 }, (_, index) => ({
        id: `import-${index}`, name: `站点 ${index}`, url: `https://example.com/${index}`, description: "导入演示",
        image: "/images/ink/writing.webp", icon: "leaf", category: "", sortOrder: index, visible: true, requiresPassword: false,
      }));
      const settings = { ...store.defaultSettings, name: "批量导入" };
      await store.replaceConfig(settings, sites);
      assert.equal((await store.getAdminData()).sites.length, 1000);
      const reversed = sites.map((site) => site.id).reverse();
      await store.reorderSites(reversed);
      assert.deepEqual((await store.getAdminData()).sites.map((site) => site.id), reversed);
      const before = await store.getAdminData();
      await assert.rejects(store.replaceConfig({ ...settings, name: "不应写入" }, [...sites, sites[0]]));
      assert.deepEqual(await store.getAdminData(), before);
      assert.equal(await store.hasAdmin(), true);
    });

    await t.test("concurrent imports return matching settings and sites in each snapshot", async () => {
      const site: Site = {
        id: "snapshot-site", name: "snapshot-0", url: "https://example.com", description: "",
        image: "", icon: "globe", category: "", sortOrder: 0, visible: true, requiresPassword: false,
      };
      await store.replaceConfig({ ...store.defaultSettings, name: site.name }, [site]);
      const writer = async () => {
        for (let version = 1; version <= 20; version++) {
          const name = `snapshot-${version}`;
          await store.replaceConfig({ ...store.defaultSettings, name }, [{ ...site, name }]);
        }
      };
      const reader = async () => {
        for (let version = 0; version < 20; version++) {
          const snapshots = await Promise.all([store.getAdminData(), store.getPortalData()]);
          for (const snapshot of snapshots) {
            assert.equal(snapshot.sites.length, 1);
            assert.equal(snapshot.settings.name, snapshot.sites[0].name);
          }
        }
      };
      await Promise.all([writer(), reader(), reader(), reader()]);
    });

    await t.test("an empty import permits only an empty order", async () => {
      await store.replaceConfig(store.defaultSettings, []);
      await store.reorderSites([]);
      await assert.rejects(store.reorderSites(["missing"]), (error) => error instanceof ApiError && error.status === 400);
      assert.equal((await store.getAdminData()).sites.length, 0);
    });

    await t.test("concurrent rate limits admit exactly the allowed count and expire as one window", async () => {
      const key = "test:concurrent-limit";
      const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => store.consumeRateLimit(key, 5, "请求过多")));
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 5);
      for (const attempt of attempts) {
        if (attempt.status === "rejected") assert.equal(attempt.reason instanceof ApiError && attempt.reason.status, 429);
      }
      assert.equal((await database.prepare("SELECT count FROM rateLimit WHERE key = ?").bind(key).first<{ count: number }>())?.count, 5);
      await database.prepare("UPDATE rateLimit SET lastRequest = ? WHERE key = ?").bind(Date.now() - 60001, key).run();
      await store.consumeRateLimit(key, 5, "请求过多");
      assert.equal((await database.prepare("SELECT count FROM rateLimit WHERE key = ?").bind(key).first<{ count: number }>())?.count, 1);
    });

    await t.test("private access state can be replaced independently of public settings", async () => {
      assert.equal(await store.getAccessState(), undefined);
      await store.writeAccessState("first-hash", "first-version");
      await store.writeAccessState("second-hash", "second-version");
      assert.deepEqual(await store.getAccessState(), { passwordHash: "second-hash", version: "second-version" });
      assert.deepEqual(await store.getSettings(), store.defaultSettings);
    });

    await t.test("missing public settings returns the migration error through all read entry points", async () => {
      await database.prepare("DELETE FROM portal_settings WHERE id = 1").run();
      for (const read of [store.getSettings, store.getAdminData, store.getPortalData]) {
        await assert.rejects(read(), (error) => error instanceof ApiError && error.status === 503 && error.message === "请先执行 Cloudflare 数据库迁移");
      }
    });
  } finally {
    if (previousContext === undefined) delete contextGlobal[contextKey];
    else contextGlobal[contextKey] = previousContext;
    try {
      await proxy?.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
