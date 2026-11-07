import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// 认证表的字段名遵循 Better Auth 适配器约定；实际建表 SQL 位于 db.ts 的迁移函数。
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_idx").on(table.userId)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  // credential 账号保存 Better Auth 生成的哈希，绝不保存明文密码。
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("account_user_idx").on(table.userId), uniqueIndex("account_provider_idx").on(table.providerId, table.accountId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const rateLimit = sqliteTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("lastRequest").notNull(),
});

// 单行管理员绑定；singleton = 1 的约束由迁移 SQL 保证。
export const administrators = sqliteTable("administrators", {
  singleton: integer("singleton").primaryKey(),
  userId: text("userId").notNull().unique().references(() => user.id, { onDelete: "restrict" }),
});

export const sites = sqliteTable("sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description").notNull().default(""),
  image: text("image").notNull().default(""),
  icon: text("icon").notNull().default("globe"),
  category: text("category").notNull().default(""),
  sortOrder: integer("sortOrder").notNull().default(0),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  // 私密标记独立于上下架：隐藏项即使输入访问密码也不会公开。
  requiresPassword: integer("requiresPassword", { mode: "boolean" }).notNull().default(false),
});

// 访问密码和令牌版本仅服务端可读，不混入可导出的站点设置。
export const portalAccess = sqliteTable("portal_access", {
  id: integer("id").primaryKey(),
  passwordHash: text("passwordHash").notNull(),
  version: text("version").notNull(),
});

// 整组站点设置以 JSON 保存在固定单行中，字段默认值和兼容合并由 db.ts 处理。
export const settingsTable = sqliteTable("portal_settings", {
  id: integer("id").primaryKey(),
  value: text("value").notNull(),
});
