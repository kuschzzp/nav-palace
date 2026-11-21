-- D1 使用部署前迁移建表；这些表与本地 SQLite v6 的字段和约束保持一致。
CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON session(userId);
CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX account_user_idx ON account(userId);
CREATE UNIQUE INDEX account_provider_idx ON account(providerId, accountId);
CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);
CREATE TABLE administrators (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  userId TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE RESTRICT
);
CREATE TABLE sites (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'globe',
  category TEXT NOT NULL DEFAULT '',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  requiresPassword INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE portal_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT NOT NULL
);
CREATE TABLE portal_access (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  passwordHash TEXT NOT NULL,
  version TEXT NOT NULL
);

INSERT INTO portal_settings (id, value) VALUES (1, '{"name":"NAV PALACE","headline":"让热爱，有处可达。","subtitle":"我的网站与作品，都从这里出发。","footer":"每一个入口，都通往热爱","logoUrl":"","aboutTitle":"关于这里","aboutText":"一个收藏作品、记录热爱的小小入口。","atmosphereStyle":"none","atmosphereIntensity":"balanced","pointerStyle":"system","pointerScatter":true,"departureDelaySeconds":3}');
INSERT INTO sites (id, name, url, description, image, icon, sortOrder) VALUES
  ('journal', '拾光手记', 'https://journal.example.com', '记录生活，收藏沿途的灵感。', '/images/ink/writing.webp', 'leaf', 0),
  ('studio', '灵感工坊', 'https://studio.example.com', '把有趣的想法，变成好用的工具。', '/images/ink/tools.webp', 'bulb', 1),
  ('gallery', '云间相册', 'https://gallery.example.com', '珍藏镜头里的每一次心动。', '/images/ink/landscape.webp', 'camera', 2);
