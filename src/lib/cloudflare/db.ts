import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../schema";
import { normalizeSettings } from "../db-defaults";
import type { AdminData, PortalData, PortalSettings, Site } from "../types";
import { ApiError } from "../validation";

export { defaultSettings } from "../db-defaults";

export function getDatabase() {
  // 绑定属于当前 Worker 请求，不保存到全局，避免跨请求复用运行时句柄。
  const { DB } = getCloudflareContext().env as unknown as { DB: D1Database };
  if (!DB) throw new ApiError(503, "请先绑定 D1 数据库并执行数据库迁移");
  return { sqlite: DB, db: drizzle(DB, { schema }) };
}

export async function getSettings(): Promise<PortalSettings> {
  const row = await getDatabase().db.select().from(schema.settingsTable).where(eq(schema.settingsTable.id, 1)).get();
  if (!row) throw new ApiError(503, "请先执行 Cloudflare 数据库迁移");
  return normalizeSettings(row.value);
}

export async function getAdminData(): Promise<AdminData> {
  const { db } = getDatabase();
  // 多条读取共用同一 D1 事务快照，避免并发导入时混合不同版本的配置与网站。
  const [settings, sites, access] = await db.batch([
    db.select().from(schema.settingsTable).where(eq(schema.settingsTable.id, 1)).limit(1),
    db.select().from(schema.sites).orderBy(asc(schema.sites.sortOrder), asc(schema.sites.id)),
    db.select({ id: schema.portalAccess.id }).from(schema.portalAccess).where(eq(schema.portalAccess.id, 1)).limit(1),
  ]);
  if (!settings[0]) throw new ApiError(503, "请先执行 Cloudflare 数据库迁移");
  return { settings: normalizeSettings(settings[0].value), sites, accessConfigured: access.length > 0 };
}

export async function getPortalData(unlocked = false): Promise<PortalData> {
  const { db } = getDatabase();
  const visibility = unlocked ? eq(schema.sites.visible, true) : and(eq(schema.sites.visible, true), eq(schema.sites.requiresPassword, false));
  const [settings, sites] = await db.batch([
    db.select().from(schema.settingsTable).where(eq(schema.settingsTable.id, 1)).limit(1),
    db.select().from(schema.sites).where(visibility).orderBy(asc(schema.sites.sortOrder), asc(schema.sites.id)),
  ]);
  if (!settings[0]) throw new ApiError(503, "请先执行 Cloudflare 数据库迁移");
  return { settings: normalizeSettings(settings[0].value), sites };
}

export async function getPublicSite(id: string, unlocked = false): Promise<Site | undefined> {
  return getDatabase().db.select().from(schema.sites)
    .where(and(eq(schema.sites.id, id), eq(schema.sites.visible, true), unlocked ? undefined : eq(schema.sites.requiresPassword, false))).get();
}

export async function hasAdmin() {
  return Boolean(await getDatabase().db.select().from(schema.administrators).get());
}

export async function isAdmin(userId: string) {
  return Boolean(await getDatabase().db.select().from(schema.administrators).where(eq(schema.administrators.userId, userId)).get());
}

export async function createAdministrator(input: { name: string; email: string; passwordHash: string }) {
  const { sqlite } = getDatabase();
  const userId = randomUUID();
  const now = Date.now();
  try {
    // batch 为一个事务；singleton 冲突会连同新用户、账号一起回滚。
    await sqlite.batch([
      sqlite.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)").bind(userId, input.name, input.email, now, now),
      sqlite.prepare("INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, ?, ?, ?)").bind(randomUUID(), userId, userId, input.passwordHash, now, now),
      sqlite.prepare("INSERT INTO administrators (singleton, userId) VALUES (1, ?)").bind(userId),
    ]);
  } catch (error) {
    if (await hasAdmin()) throw new ApiError(409, "管理员已创建，请直接登录");
    throw error;
  }
}

export async function createSite(input: Omit<Site, "id">): Promise<Site> {
  const site = { ...input, id: randomUUID() };
  await getDatabase().db.insert(schema.sites).values(site).run();
  return site;
}

export async function updateSite(id: string, input: Partial<Omit<Site, "id">>): Promise<Site> {
  const site = await getDatabase().db.update(schema.sites).set(input).where(eq(schema.sites.id, id)).returning().get();
  if (!site) throw new ApiError(404, "网站不存在或已删除");
  return site;
}

export async function deleteSite(id: string) {
  const result = await getDatabase().db.delete(schema.sites).where(eq(schema.sites.id, id)).run();
  if (!result.meta.changes) throw new ApiError(404, "网站不存在或已删除");
}

export async function updateSettings(input: PortalSettings) {
  await getDatabase().db.update(schema.settingsTable).set({ value: JSON.stringify(input) }).where(eq(schema.settingsTable.id, 1)).run();
  return input;
}

export async function reorderSites(ids: string[]) {
  const { sqlite } = getDatabase();
  const order = JSON.stringify(ids);
  // JSON 参数绕开 D1 每条语句 100 个绑定参数的上限，验证和更新共用同一事务快照。
  const completeOrder = `(SELECT COUNT(*) FROM sites) = json_array_length(?)
    AND (SELECT COUNT(DISTINCT value) FROM json_each(?)) = json_array_length(?)
    AND NOT EXISTS (SELECT 1 FROM json_each(?) AS requested LEFT JOIN sites ON sites.id = requested.value WHERE sites.id IS NULL)`;
  const [validation] = await sqlite.batch<{ valid: number }>([
    sqlite.prepare(`SELECT (${completeOrder}) AS valid`).bind(order, order, order, order),
    sqlite.prepare(`UPDATE sites SET sortOrder = (SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value = sites.id) WHERE ${completeOrder}`).bind(order, order, order, order, order),
  ]);
  if (!validation.results[0]?.valid) throw new ApiError(400, "排序必须包含所有网站，且每个网站只能出现一次");
}

export async function getAccessState(): Promise<{ passwordHash: string; version: string } | undefined> {
  const state = await getDatabase().sqlite.prepare("SELECT passwordHash, version FROM portal_access WHERE id = 1")
    .first<{ passwordHash: string; version: string }>();
  return state ?? undefined;
}

export async function writeAccessState(passwordHash: string, version: string) {
  await getDatabase().sqlite.prepare("INSERT INTO portal_access (id, passwordHash, version) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET passwordHash = excluded.passwordHash, version = excluded.version")
    .bind(passwordHash, version).run();
}

export async function consumeRateLimit(key: string, maximum: number, message: string) {
  const now = Date.now();
  // 条件 UPSERT 原子递增；达到上限时不写入，也不延长原窗口。
  const allowed = await getDatabase().sqlite.prepare(`INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN ? - lastRequest >= 60000 THEN 1 ELSE count + 1 END,
      lastRequest = CASE WHEN ? - lastRequest >= 60000 THEN ? ELSE lastRequest END
    WHERE ? - lastRequest >= 60000 OR count < ?
    RETURNING count`).bind(key, key, now, now, now, now, now, maximum).first<{ count: number }>();
  if (!allowed) throw new ApiError(429, message);
}

export async function replaceConfig(settings: PortalSettings, sites: Site[]) {
  const { sqlite } = getDatabase();
  // 每站单条语句只有 10 个绑定参数；整个批次同时提交或回滚。
  await sqlite.batch([
    sqlite.prepare("DELETE FROM sites"),
    ...sites.map((site) => sqlite.prepare("INSERT INTO sites (id, name, url, description, image, icon, category, sortOrder, visible, requiresPassword) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(site.id, site.name, site.url, site.description, site.image, site.icon, site.category, site.sortOrder, Number(site.visible), Number(site.requiresPassword))),
    sqlite.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").bind(JSON.stringify(settings)),
  ]);
}

export function closeDatabase() {
  // D1 连接由 Workers 管理，没有需要释放的本地文件句柄。
}
