import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createExportConfig, importConfig, validateImportConfig } from "../src/lib/config-transfer";
import { ApiError, readJson } from "../src/lib/validation";

async function isolatedDatabase(run: () => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-transfer-"));
  const previous = { DATABASE_PATH: process.env.DATABASE_PATH, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL };
  process.env.DATABASE_PATH = join(directory, "transfer.db");
  process.env.BETTER_AUTH_SECRET = "config-transfer-test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  try { await run(); }
  finally {
    (await import("../src/lib/db")).closeDatabase();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

function configFixture() {
  return {
    version: 1,
    settings: { name: "迁移后的导航", headline: "新入口", petalsEnabled: false, heroImage: "https://private-cdn.example/hero.webp", logoUrl: "/uploads/original-logo.webp" },
    accessConfigured: false,
    sites: [
      { id: "imported-public", name: "文章", url: "https://articles.example/path?q=hello", icon: "article", category: "阅读", sortOrder: 5, visible: true, image: "https://private-cdn.example/cover.webp", newTab: false },
      { name: "私密工具", url: "https://private.example/tool", icon: "toolbox", category: "工具", sortOrder: 2, visible: false, requiresPassword: true, image: "/uploads/private-cover.webp" },
    ],
  };
}

// 导出采用明确字段白名单，即使输入误带内部字段也不会输出图片或访问凭据。
test("version 2 export omits image locations and credentials and round-trips site settings", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  store.updateSettings({ ...store.getSettings(), logoUrl: "/uploads/private-logo.webp", atmosphereStyle: "petals", atmosphereIntensity: "vivid" });
  store.updateSite("studio", { requiresPassword: true, image: "/uploads/private-cover.webp" });
  const data = store.getAdminData();
  const exported = createExportConfig({ ...data, settings: { ...data.settings, heroImage: "https://cdn.example/private-hero.webp", passwordHash: "must-not-leak" } } as typeof data);
  assert.equal(exported.version, 2);
  assert.equal("accessConfigured" in exported, false);
  assert.equal("heroImage" in exported.settings, false);
  assert.equal("logoUrl" in exported.settings, false);
  assert.equal("passwordHash" in exported.settings, false);
  assert.ok(exported.sites.every((site) => !("image" in site) && !("newTab" in site)));
  assert.equal(JSON.stringify(exported).includes("private-cover"), false);
  assert.equal(JSON.stringify(exported).includes("private-hero"), false);
  const restored = validateImportConfig(exported);
  assert.equal(restored.settings.atmosphereStyle, "petals");
  assert.equal(restored.settings.atmosphereIntensity, "vivid");
  assert.equal("heroImage" in restored.settings, false);
  assert.equal(restored.settings.logoUrl, "");
  assert.equal(restored.summary.privateCount, 1);
  assert.deepEqual(restored.sites.map(({ image, ...site }) => { assert.ok(image.startsWith("/images/")); return site; }), exported.sites);
}));

test("falling atmosphere styles persist and survive export and import without changing intensity", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  for (const [previousStyle, atmosphereStyle] of [["pine-wind", "golden-leaves"], ["mountain-mist", "paper-snow"], ["ink-bloom", "ink-feathers"]] as const) {
    store.updateSettings({ ...store.getSettings(), atmosphereStyle, atmosphereIntensity: "gentle" });
    store.closeDatabase();
    const exported = createExportConfig(store.getAdminData());
    assert.equal(exported.settings.atmosphereStyle, atmosphereStyle);
    assert.equal(validateImportConfig({ ...exported, settings: { ...exported.settings, atmosphereStyle: previousStyle } }).settings.atmosphereStyle, atmosphereStyle);
    store.updateSettings({ ...store.getSettings(), atmosphereStyle: "none", atmosphereIntensity: "vivid" });
    await importConfig(exported, false);
    assert.equal(store.getSettings().atmosphereStyle, atmosphereStyle);
    assert.equal(store.getSettings().atmosphereIntensity, "gentle");
  }
}));

test("pointer styles and the independent scatter switch survive saving and config transfer", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const { settingsSchema } = await import("../src/lib/validation");
  const legacy = { ...store.getSettings() } as Record<string, unknown>;
  delete legacy.pointerStyle;
  delete legacy.pointerScatter;
  store.getDatabase().sqlite.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").run(JSON.stringify(legacy));
  assert.equal(store.getSettings().pointerStyle, "system");
  assert.equal(store.getSettings().pointerScatter, true);

  for (const [pointerStyle, pointerScatter] of [["cinnabar-brush", true], ["paper-kite", false], ["plum-sprig", true]] as const) {
    store.updateSettings(settingsSchema.parse({ ...store.getSettings(), pointerStyle, pointerScatter }));
    store.closeDatabase();
    const exported = createExportConfig(store.getAdminData());
    assert.equal(exported.settings.pointerStyle, pointerStyle);
    assert.equal(exported.settings.pointerScatter, pointerScatter);
    store.updateSettings({ ...store.getSettings(), pointerStyle: "system", pointerScatter: !pointerScatter });
    await importConfig(exported, false);
    assert.equal(store.getSettings().pointerStyle, pointerStyle);
    assert.equal(store.getSettings().pointerScatter, pointerScatter);
  }
}));

test("departure delay defaults for old settings and survives saving and config transfer", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const { settingsSchema } = await import("../src/lib/validation");
  const { departureDelaySeconds: initialDelay, ...legacy } = store.getSettings();
  assert.equal(initialDelay, 3);
  store.getDatabase().sqlite.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").run(JSON.stringify(legacy));
  assert.equal(store.getSettings().departureDelaySeconds, 3);
  assert.equal(validateImportConfig(configFixture()).settings.departureDelaySeconds, 3);

  for (const value of [0, 16, 2.5, "5"]) {
    assert.equal(settingsSchema.safeParse({ ...legacy, departureDelaySeconds: value }).success, false);
  }
  store.updateSettings(settingsSchema.parse({ ...legacy, departureDelaySeconds: 8 }));
  store.closeDatabase();
  const exported = createExportConfig(store.getAdminData());
  assert.equal(exported.settings.departureDelaySeconds, 8);
  store.updateSettings(settingsSchema.parse(legacy));
  await importConfig(exported, false);
  assert.equal(store.getSettings().departureDelaySeconds, 8);
}));

test("v1 preview never writes; commit replaces content, restores built-in images and preserves account/password versions", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const access = await import("../src/lib/private-access");
  store.createAdministrator({ name: "已有账号", email: "retained@example.com", passwordHash: "retained-admin-hash" });
  await access.setAccessPassword("retained-access-password-123");
  const token = await access.issueAccessToken();
  const sqlite = store.getDatabase().sqlite;
  const tables = ["user", "account", "administrators", "portal_access"];
  const beforeCredentials = tables.map((table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const beforeContent = store.getAdminData();
  const beforeChanges = sqlite.prepare("SELECT total_changes()").pluck().get();
  const config = configFixture();
  const preview = await importConfig(config, true);
  assert.equal(sqlite.prepare("SELECT total_changes()").pluck().get(), beforeChanges);
  assert.deepEqual(store.getAdminData(), beforeContent);
  assert.deepEqual({ siteCount: preview.siteCount, publicCount: preview.publicCount, privateCount: preview.privateCount, categories: preview.categories }, { siteCount: 2, publicCount: 1, privateCount: 1, categories: ["阅读", "工具"] });
  assert.ok(preview.warnings.length >= 2);
  assert.equal(JSON.stringify(preview).includes("retained-admin-hash"), false);
  assert.deepEqual(await importConfig(config, false), preview);
  tables.forEach((table, index) => assert.deepEqual(sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), beforeCredentials[index]));
  assert.equal(await access.verifyAccessPassword("retained-access-password-123"), true);
  assert.equal(await access.verifyAccessToken(token), true);
  const imported = store.getAdminData();
  assert.equal(imported.sites.length, 2);
  assert.equal(imported.settings.name, "迁移后的导航");
  assert.equal(imported.settings.atmosphereStyle, "none");
  assert.equal("heroImage" in imported.settings, false);
  assert.equal(imported.settings.logoUrl, "");
  assert.equal(imported.sites.find((site) => site.id === "imported-public")?.image, "/images/ink/writing.webp");
  const privateSite = imported.sites.find((site) => site.requiresPassword)!;
  assert.match(privateSite.id, /^[0-9a-f-]{36}$/);
  assert.equal(privateSite.visible, false);
  assert.equal(privateSite.sortOrder, 2);
  assert.equal(privateSite.image, "/images/ink/tools.webp");
  assert.equal(JSON.stringify(imported).includes("private-cdn"), false);
  assert.equal(store.getPublicSite(privateSite.id, true), undefined);
}));

test("invalid configurations are rejected before any write and SQL failure rolls back the whole replacement", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const before = store.getAdminData();
  const badCases = [
    { ...configFixture(), version: 3 },
    { ...configFixture(), sites: [{ name: "脚本", url: "javascript:alert(1)" }] },
    { ...configFixture(), sites: [{ id: "../bad", name: "路径", url: "https://example.com" }] },
    { ...configFixture(), sites: [{ id: "same", name: "一", url: "https://one.example" }, { id: "same", name: "二", url: "https://two.example" }] },
    { ...configFixture(), sites: Array.from({ length: 1001 }, () => ({ name: "过多", url: "https://example.com" })) },
    { ...configFixture(), sites: [{ name: "非法图标", url: "https://example.com", icon: "arbitrary-code" }] },
    { ...configFixture(), sites: [{ name: "私密状态", url: "https://example.com", requiresPassword: "yes" }] },
    { ...configFixture(), sites: [{ name: "权限注入", url: "https://example.com", passwordHash: "injected" }] },
    { ...configFixture(), settings: { name: "", atmosphereStyle: "script" } },
    { ...configFixture(), settings: { atmosphereIntensity: "unlimited" } },
  ];
  for (const config of badCases) {
    await assert.rejects(() => importConfig(config, true));
    await assert.rejects(() => importConfig(config, false));
    assert.deepEqual(store.getAdminData(), before);
  }
  const sqlite = store.getDatabase().sqlite;
  sqlite.exec("CREATE TRIGGER reject_import_settings BEFORE UPDATE ON portal_settings BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  try {
    await assert.rejects(() => importConfig(configFixture(), false), /test rollback/);
    assert.deepEqual(store.getAdminData(), before);
  } finally { sqlite.exec("DROP TRIGGER reject_import_settings"); }
}));

test("import stream accepts larger valid JSON and enforces actual and declared 2 MiB limits", async () => {
  const maximumBytes = 2 * 1024 * 1024;
  const request = (body: string, length?: number) => new Request("http://localhost:3000/api/admin/import", { method: "POST", headers: { "content-type": "application/json", ...(length === undefined ? {} : { "content-length": String(length) }) }, body });
  const body = JSON.stringify({ value: "字".repeat(30000) });
  assert.equal((await readJson(request(body), maximumBytes) as { value: string }).value.length, 30000);
  const isTooLarge = (error: unknown) => error instanceof ApiError && error.status === 413;
  await assert.rejects(() => readJson(request(body)), isTooLarge);
  await assert.rejects(() => readJson(request("{}", maximumBytes + 1), maximumBytes), isTooLarge);
  await assert.rejects(() => readJson(request(JSON.stringify({ value: "x".repeat(maximumBytes) }), 2), maximumBytes), isTooLarge);
});

test("real import/export handlers require administrator access and import enforces same-origin without caching errors", async () => isolatedDatabase(async () => {
  const importer = await import("../src/app/api/admin/import/route");
  const exporter = await import("../src/app/api/admin/export/route");
  const post = (origin: string) => importer.POST(new Request("http://localhost:3000/api/admin/import", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ config: configFixture(), preview: true }) }));
  const crossOrigin = await post("https://other.example");
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.headers.get("cache-control"), "private, no-store");
  const unsigned = await post("http://localhost:3000");
  assert.equal(unsigned.status, 401);
  assert.equal(unsigned.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await unsigned.json(), { error: "请先登录管理员账号" });
  const unsignedExport = await exporter.GET();
  assert.equal(unsignedExport.status, 401);
  assert.equal(unsignedExport.headers.get("cache-control"), "no-store");
}));

test("v1 and v2 imports ignore removed background values without restoring or validating them", () => {
  for (const version of [1, 2]) {
    for (const heroImage of ["javascript:alert(1)", "/uploads/../private", { unexpected: "legacy shape" }]) {
      const fixture = configFixture();
      const imported = validateImportConfig({ ...fixture, version, settings: { ...fixture.settings, heroImage } });
      assert.equal("heroImage" in imported.settings, false);
      assert.equal(imported.summary.siteCount, 2);
      assert.equal(imported.settings.name, "迁移后的导航");
      assert.equal(imported.settings.logoUrl, "");
      assert.equal(imported.summary.warnings.some((warning) => warning.includes("首页背景")), false);
      assert.equal("heroImage" in createExportConfig(imported).settings, false);
    }
  }
});


test("old configurations default to balanced intensity and all intensity levels persist across database reopen and import/export", async () => isolatedDatabase(async () => {
  const store = await import("../src/lib/db");
  const { settingsSchema } = await import("../src/lib/validation");
  // 旧 JSON 没有该字段；读取默认值不触发写入，也不要求结构迁移。
  const legacy = { ...store.getSettings() } as Record<string, unknown>;
  delete legacy.atmosphereIntensity;
  store.getDatabase().sqlite.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").run(JSON.stringify(legacy));
  store.closeDatabase();
  assert.equal(store.getSettings().atmosphereIntensity, "balanced");
  assert.equal(store.getDatabase().sqlite.prepare("SELECT value FROM portal_settings").pluck().get(), JSON.stringify(legacy));
  for (const version of [1, 2]) {
    assert.equal(validateImportConfig({ ...configFixture(), version }).settings.atmosphereIntensity, "balanced");
  }
  for (const atmosphereIntensity of ["gentle", "balanced", "vivid"] as const) {
    store.updateSettings(settingsSchema.parse({ ...store.getSettings(), atmosphereIntensity }));
    store.closeDatabase();
    assert.equal(store.getSettings().atmosphereIntensity, atmosphereIntensity);
    const exported = createExportConfig(store.getAdminData());
    assert.equal(exported.settings.atmosphereIntensity, atmosphereIntensity);
    await importConfig(exported, false);
    store.closeDatabase();
    assert.equal(store.getSettings().atmosphereIntensity, atmosphereIntensity);
  }
}));


test("legacy JSON visual settings migrate without restoring cursors or old atmosphere kinds", () => {
  for (const version of [1, 2]) {
    for (const atmosphereStyle of [["snow"], ["petals"], null, 42]) {
      assert.throws(() => validateImportConfig({ ...configFixture(), version, settings: { atmosphereStyle } }));
    }
    for (const atmosphereStyle of ["sakura", "snow", "fireflies", "stars", "bubbles", "leaves"]) {
      const result = validateImportConfig({ ...configFixture(), version, settings: { cursorStyle: "ocean", atmosphereStyle, atmosphereIntensity: "vivid" } });
      assert.equal(result.settings.atmosphereStyle, "petals");
      assert.equal(result.settings.atmosphereIntensity, "vivid");
      assert.equal("cursorStyle" in result.settings, false);
      assert.equal("cursorStyle" in createExportConfig(result).settings, false);
    }
  }
});
