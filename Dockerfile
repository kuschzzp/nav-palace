# 依赖阶段保留完整构建工具，供 SQLite 等原生模块在需要时编译。
FROM node:22-bookworm AS dependencies

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# 先单独复制依赖清单，业务代码变化时可复用安装缓存。
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

# 构建阶段只负责生成 Next.js 的生产产物。
FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 运行阶段使用精简镜像，不携带构建阶段的全部开发依赖。
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/nav-palace.db

# 数据库及 uploads 目录都放在 /app/data，由 Compose 持久卷保留。
RUN mkdir -p /app/data && chown node:node /app/data
# standalone 不自动包含静态资源，需同时复制 static 和 public。
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --from=builder --chown=node:node /app/scripts/docker-start.mjs ./scripts/docker-start.mjs
COPY --from=builder --chown=node:node /app/LICENSE /app/NOTICE.md ./

# 用非 root 用户运行，数据目录需保持该用户可写。
USER node
EXPOSE 3000
CMD ["node", "scripts/docker-start.mjs"]
