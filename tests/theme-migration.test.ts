import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrateLegacyCover } from "../src/lib/theme-migration";

// 同名第三方图片不是本站默认素材；移除旧图不能误改管理员的自定义内容。
test("legacy cover mapping accepts only known bundled paths and trusted local origins", () => {
  assert.equal(migrateLegacyCover("/images/site-blog.webp"), "/images/ink/writing.webp");
  assert.equal(migrateLegacyCover("/images/site-studio.png"), "/images/ink/tools.webp");
  assert.equal(migrateLegacyCover("https://nav.example/images/site-mail.webp?v=2", "https://nav.example"), "/images/ink/mail.webp");
  assert.equal(migrateLegacyCover("http://localhost:3001/images/site-gallery.webp"), "/images/ink/landscape.webp");
  for (const original of ["https://cdn.example/images/site-blog.webp", "https://localhost.evil.example/images/site-blog.webp", "/uploads/site-blog.webp", "/images/custom.webp", "/images/ink/writing.webp", "https://user:pass@nav.example/images/site-blog.webp"]) {
    assert.equal(migrateLegacyCover(original, "https://nav.example"), original);
  }
});

test("v5 to v6 changes only retired visual settings and known covers, preserving credentials and all business fields", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-ink-migration-"));
  const previous = { DATABASE_PATH: process.env.DATABASE_PATH, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET };
  process.env.DATABASE_PATH = join(directory, "theme.db");
  process.env.BETTER_AUTH_URL = "https://nav.example";
  process.env.BETTER_AUTH_SECRET = "ink-theme-test-secret-at-least-32-characters";
  const store = await import("../src/lib/db");
  try {
    const access = await import("../src/lib/private-access");
    store.createAdministrator({ name: "保留管理员", email: "ink-retained@example.com", passwordHash: "retained-password-hash" });
    await access.setAccessPassword("retained-private-password-123");
    const token = await access.issueAccessToken();
    store.updateSite("journal", { name: "旧封面手记", description: "完整保留介绍", category: "保留分类", sortOrder: 9, image: "/images/site-blog.webp" });
    store.updateSite("studio", { requiresPassword: true, visible: false, image: "https://nav.example/images/site-relay.webp" });
    store.updateSite("gallery", { image: "https://cdn.example/images/site-gallery.webp" });
    store.createSite({ name: "上传图", url: "https://upload.example", description: "", image: "/uploads/retained.webp", icon: "leaf", category: "", sortOrder: 10, visible: true, requiresPassword: false });
    const sqlite = store.getDatabase().sqlite;
    const legacy = { ...store.getSettings(), cursorStyle: "ocean", atmosphereStyle: "snow", atmosphereIntensity: "vivid", heroImage: "/images/old.webp", musicEnabled: true, extension: { untouched: "扩展配置" } };
    sqlite.prepare("UPDATE portal_settings SET value=? WHERE id=1").run(JSON.stringify(legacy));
    sqlite.pragma("user_version=5");
    const beforeSites = store.getAdminData().sites;
    const tables = ["user", "account", "session", "administrators", "portal_access", "verification", "rateLimit"];
    const retained = tables.map((name) => sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    const schemaVersion = sqlite.pragma("schema_version", { simple: true });
    store.closeDatabase();
    const migrated = store.getDatabase().sqlite;
    assert.equal(migrated.pragma("user_version", { simple: true }), 6);
    assert.equal(migrated.pragma("schema_version", { simple: true }), schemaVersion);
    tables.forEach((name, index) => assert.deepEqual(migrated.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(), retained[index]));
    const sites = store.getAdminData().sites;
    assert.deepEqual(sites.map((site) => Object.fromEntries(Object.entries(site).filter(([key]) => key !== "image"))), beforeSites.map((site) => Object.fromEntries(Object.entries(site).filter(([key]) => key !== "image"))));
    assert.equal(sites.find((site) => site.id === "journal")?.image, "/images/ink/writing.webp");
    assert.equal(sites.find((site) => site.id === "studio")?.image, "/images/ink/tools.webp");
    assert.equal(sites.find((site) => site.id === "gallery")?.image, "https://cdn.example/images/site-gallery.webp");
    assert.equal(sites.find((site) => site.name === "上传图")?.image, "/uploads/retained.webp");
    const expected: Record<string, unknown> = { ...legacy, atmosphereStyle: "petals" };
    for (const key of ["cursorStyle", "heroImage", "musicEnabled"]) delete expected[key];
    const saved = migrated.prepare("SELECT value FROM portal_settings WHERE id=1").pluck().get();
    assert.deepEqual(JSON.parse(saved as string), expected);
    assert.equal(await access.verifyAccessToken(token), true);
    assert.equal(await access.verifyAccessPassword("retained-private-password-123"), true);
    store.closeDatabase();
    const reopened = store.getDatabase().sqlite;
    assert.equal(reopened.prepare("SELECT total_changes()").pluck().get(), 0);
    assert.equal(reopened.prepare("SELECT value FROM portal_settings WHERE id=1").pluck().get(), saved);
  } finally {
    store.closeDatabase();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(directory, { recursive: true, force: true });
  }
});
