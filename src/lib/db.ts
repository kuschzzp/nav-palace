import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { migrateLegacyCover } from "./theme-migration";
import type { AdminData, PortalData, PortalSettings, Site } from "./types";
import { ApiError, departureDelaySchema } from "./validation";
import { ambientIntensityNames, ambientStyleNames, normalizeLegacyAtmosphere } from "./ambient-presets";
import { pointerStyleNames } from "./pointer-presets";
import { departureCountdown } from "./departure-settings";

export const defaultSettings: PortalSettings = {
  name: "NAV PALACE",
  headline: "让热爱，有处可达。",
  subtitle: "我的网站与作品，都从这里出发。",
  footer: "每一个入口，都通往热爱",
  logoUrl: "",
  aboutTitle: "关于这里",
  aboutText: "一个收藏作品、记录热爱的小小入口。",
  atmosphereStyle: "none",
  atmosphereIntensity: "balanced",
  pointerStyle: "system",
  pointerScatter: true,
  departureDelaySeconds: departureCountdown.defaultSeconds,
};

const exampleSites: Site[] = [
  { id: "journal", name: "拾光手记", url: "https://journal.example.com", description: "记录生活，收藏沿途的灵感。", image: "/images/ink/writing.webp", icon: "leaf", category: "", sortOrder: 0, visible: true, requiresPassword: false },
  { id: "studio", name: "灵感工坊", url: "https://studio.example.com", description: "把有趣的想法，变成好用的工具。", image: "/images/ink/tools.webp", icon: "bulb", category: "", sortOrder: 1, visible: true, requiresPassword: false },
  { id: "gallery", name: "云间相册", url: "https://gallery.example.com", description: "珍藏镜头里的每一次心动。", image: "/images/ink/landscape.webp", icon: "camera", category: "", sortOrder: 2, visible: true, requiresPassword: false },
];

// 结构、默认内容和版本号一并提交，避免初始化中断后留下半套表或重复示例。
// 修改表结构时需同步 schema.ts，并为已有 user_version 增加迁移分支。
function migrate(sqlite: Database.Database) {
  sqlite.transaction(() => {
    const version = sqlite.pragma("user_version", { simple: true }) as number;
    if (version > 6) throw new Error("数据库版本高于当前应用，请升级应用后重试");
    if (version === 6) return;
    if (version === 0) {
      sqlite.exec(`
        CREATE TABLE user (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
        CREATE TABLE session (id TEXT PRIMARY KEY NOT NULL, token TEXT NOT NULL UNIQUE, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE);
        CREATE INDEX session_user_idx ON session(userId);
        CREATE TABLE account (id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
        CREATE INDEX account_user_idx ON account(userId);
        CREATE UNIQUE INDEX account_provider_idx ON account(providerId, accountId);
        CREATE TABLE verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
        CREATE INDEX verification_identifier_idx ON verification(identifier);
        CREATE TABLE rateLimit (id TEXT PRIMARY KEY NOT NULL, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, lastRequest INTEGER NOT NULL);
        CREATE TABLE administrators (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), userId TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE RESTRICT);
        CREATE TABLE sites (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'globe', category TEXT NOT NULL DEFAULT '', sortOrder INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1, newTab INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE portal_settings (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);
      `);
      sqlite.prepare("INSERT INTO portal_settings (id, value) VALUES (1, ?)").run(JSON.stringify(defaultSettings));
      const insert = sqlite.prepare("INSERT INTO sites (id, name, url, description, image, icon, category, sortOrder, visible, newTab) VALUES (@id, @name, @url, @description, @image, @icon, @category, @sortOrder, @visible, @newTab)");
      for (const site of exampleSites) insert.run({ ...site, visible: 1, newTab: 1 });
      sqlite.pragma("user_version = 1");
    }
    if (version < 2) {
      // 旧站点默认仍为公开；v2 已有这些结构，不可重复添加列或重建访问密码表。
      sqlite.exec("ALTER TABLE sites ADD COLUMN requiresPassword INTEGER NOT NULL DEFAULT 0; CREATE TABLE portal_access (id INTEGER PRIMARY KEY CHECK (id = 1), passwordHash TEXT NOT NULL, version TEXT NOT NULL);");
    }
    if (version < 4) {
      // v3/v4 清理旧功能配置并迁移装饰类型，账号和访问密码版本始终原样保留。
      const row = sqlite.prepare("SELECT value FROM portal_settings WHERE id = 1").get() as { value: string } | undefined;
      if (row) {
        const settings = JSON.parse(row.value);
        delete settings.musicEnabled;
        delete settings.musicTitle;
        delete settings.musicUrl;
        delete settings.companionEnabled;
        settings.atmosphereStyle = normalizeLegacyAtmosphere(settings.atmosphereStyle, settings.petalsEnabled) ?? "none";
        delete settings.petalsEnabled;
        sqlite.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").run(JSON.stringify(settings));
      }
      // 站点统一在新标签打开，移除不再使用的数据库字段，避免旧配置继续积累。
      const columns = sqlite.pragma("table_info(sites)") as { name: string }[];
      if (columns.some((column) => column.name === "newTab")) sqlite.exec("ALTER TABLE sites DROP COLUMN newTab");
    }
    // v6 只迁移视觉配置与内置封面，不重建业务表或修改凭据/私密令牌。
    const settingsRow = sqlite.prepare("SELECT value FROM portal_settings WHERE id = 1").get() as { value: string } | undefined;
    if (settingsRow) {
      const settings = JSON.parse(settingsRow.value);
      for (const key of ["heroImage", "cursorStyle", "musicEnabled", "musicTitle", "musicUrl", "companionEnabled"]) delete settings[key];
      const style = normalizeLegacyAtmosphere(settings.atmosphereStyle, settings.petalsEnabled);
      settings.atmosphereStyle = ambientStyleNames.includes(style as typeof ambientStyleNames[number]) ? style : "none";
      delete settings.petalsEnabled;
      const next = JSON.stringify(settings);
      if (next !== settingsRow.value) sqlite.prepare("UPDATE portal_settings SET value = ? WHERE id = 1").run(next);
    }
    const covers = sqlite.prepare("SELECT id, image FROM sites").all() as { id: string; image: string }[];
    const updateCover = sqlite.prepare("UPDATE sites SET image = ? WHERE id = ?");
    for (const site of covers) {
      const image = migrateLegacyCover(site.image, process.env.BETTER_AUTH_URL);
      if (image !== site.image) updateCover.run(image, site.id);
    }
    sqlite.pragma("user_version = 6");
  }).immediate();
}

function createDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  // WAL 允许读取与写入并行；外键约束和短暂等待用于维护关联完整性、缓解写锁竞争。
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (path !== ":memory:") chmodSync(path, 0o600);
  migrate(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

type DatabaseConnection = ReturnType<typeof createDatabase>;
// 按数据库路径复用连接，避免开发热更新重复打开同一个 SQLite 文件。
const databaseGlobal = globalThis as typeof globalThis & { navPalaceDatabase?: Map<string, DatabaseConnection> };
databaseGlobal.navPalaceDatabase ??= new Map();

export function getDatabase() {
  const input = process.env.DATABASE_PATH || "./data/nav-palace.db";
  // 数据文件由运行环境提供；保留 turbopackIgnore，避免构建时追踪或打包数据库。
  const path = input === ":memory:" ? input : resolve(/* turbopackIgnore: true */ input);
  let connection = databaseGlobal.navPalaceDatabase!.get(path);
  if (!connection) {
    connection = createDatabase(path);
    databaseGlobal.navPalaceDatabase!.set(path, connection);
  }
  return connection;
}

export function getSettings(): PortalSettings {
  const row = getDatabase().db.select().from(schema.settingsTable).where(eq(schema.settingsTable.id, 1)).get();
  // 仅返回当前公开配置白名单，旧字段或误存的内部字段不会随页面数据下发。
  const stored = JSON.parse(row!.value) as Record<string, unknown>;
  const settings = Object.fromEntries(Object.entries(defaultSettings).map(([key, fallback]) => [key, typeof stored[key] === typeof fallback ? stored[key] : fallback])) as PortalSettings;
  const style = normalizeLegacyAtmosphere(settings.atmosphereStyle);
  settings.atmosphereStyle = ambientStyleNames.includes(style as typeof ambientStyleNames[number]) ? style as PortalSettings["atmosphereStyle"] : "none";
  // 旧数据库缺少强度时只补读取默认值，无需迁移或改写现有配置。
  if (!ambientIntensityNames.includes(settings.atmosphereIntensity)) settings.atmosphereIntensity = "balanced";
  if (!pointerStyleNames.includes(settings.pointerStyle)) settings.pointerStyle = defaultSettings.pointerStyle;
  const departureDelay = departureDelaySchema.safeParse(settings.departureDelaySeconds);
  settings.departureDelaySeconds = departureDelay.success ? departureDelay.data : defaultSettings.departureDelaySeconds;
  return settings;
}

export function getAdminData(): AdminData {
  const { db } = getDatabase();
  return { settings: getSettings(), sites: db.select().from(schema.sites).orderBy(asc(schema.sites.sortOrder), asc(schema.sites.id)).all(), accessConfigured: Boolean(db.select({ id: schema.portalAccess.id }).from(schema.portalAccess).get()) };
}

export function getPortalData(unlocked = false): PortalData {
  const visibility = unlocked ? eq(schema.sites.visible, true) : and(eq(schema.sites.visible, true), eq(schema.sites.requiresPassword, false));
  return { settings: getSettings(), sites: getDatabase().db.select().from(schema.sites).where(visibility).orderBy(asc(schema.sites.sortOrder), asc(schema.sites.id)).all() };
}

// 公共跳转入口也必须过滤隐藏项，不能仅靠首页不展示来限制访问。
export function getPublicSite(id: string, unlocked = false): Site | undefined {
  return getDatabase().db.select().from(schema.sites)
    .where(and(eq(schema.sites.id, id), eq(schema.sites.visible, true), unlocked ? undefined : eq(schema.sites.requiresPassword, false))).get();
}

export function hasAdmin() {
  return Boolean(getDatabase().db.select().from(schema.administrators).get());
}

export function isAdmin(userId: string) {
  return Boolean(getDatabase().db.select().from(schema.administrators).where(eq(schema.administrators.userId, userId)).get());
}

export function createAdministrator(input: { name: string; email: string; passwordHash: string }) {
  const { sqlite } = getDatabase();
  // 立即取得写锁，并在事务内再次检查，防止并发初始化创建多个管理员。
  sqlite.transaction(() => {
    if (hasAdmin()) throw new ApiError(409, "管理员已创建，请直接登录");
    const userId = randomUUID();
    const now = Date.now();
    sqlite.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)").run(userId, input.name, input.email, now, now);
    sqlite.prepare("INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, ?, ?, ?)").run(randomUUID(), userId, userId, input.passwordHash, now, now);
    sqlite.prepare("INSERT INTO administrators (singleton, userId) VALUES (1, ?)").run(userId);
  }).immediate();
}

export function createSite(input: Omit<Site, "id">): Site {
  const { db } = getDatabase();
  const site = { ...input, id: randomUUID() };
  db.insert(schema.sites).values(site).run();
  return site;
}

export function updateSite(id: string, input: Partial<Omit<Site, "id">>): Site {
  const site = getDatabase().db.update(schema.sites).set(input).where(eq(schema.sites.id, id)).returning().get();
  if (!site) throw new ApiError(404, "网站不存在或已删除");
  return site;
}

export function deleteSite(id: string) {
  const result = getDatabase().db.delete(schema.sites).where(eq(schema.sites.id, id)).run();
  if (!result.changes) throw new ApiError(404, "网站不存在或已删除");
}

export function updateSettings(input: PortalSettings) {
  getDatabase().db.update(schema.settingsTable).set({ value: JSON.stringify(input) }).where(eq(schema.settingsTable.id, 1)).run();
  return input;
}

export function reorderSites(ids: string[]) {
  const { sqlite } = getDatabase();
  sqlite.transaction(() => {
    const all = getAdminData().sites;
    // 只接受全部站点 ID 的完整排列，防止遗漏、重复或夹带不存在的站点。
    if (ids.length !== all.length || new Set(ids).size !== ids.length || all.some((site) => !ids.includes(site.id))) {
      throw new ApiError(400, "排序必须包含所有网站，且每个网站只能出现一次");
    }
    const update = sqlite.prepare("UPDATE sites SET sortOrder = ? WHERE id = ?");
    ids.forEach((id, position) => update.run(position, id));
  }).immediate();
}

export function closeDatabase() {
  for (const connection of databaseGlobal.navPalaceDatabase!.values()) connection.sqlite.close();
  databaseGlobal.navPalaceDatabase!.clear();
}
