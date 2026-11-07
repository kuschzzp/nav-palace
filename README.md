# Nav Palace

让热爱，有处可达。

Nav Palace 是一个可自行部署的水墨风导航站，用来集中展示自己的项目和网站。在后台添加入口、调整顺序和可见性，首页会读取最新配置。数据保存在本地 SQLite 文件中。

## 功能

- 管理网站链接、简介、封面和图标，支持隐藏入口和设置独立访问密码。
- 自定义站点文案与 Logo，内置 20 张水墨封面和 10 款水墨 Logo。
- 上传时自动压缩并生成缩略图，页面按需加载图片和字体。
- 支持 JSON 配置导入导出、SQLite 备份和 Docker 部署。

## 本地启动

需要 Node.js 22.16 或更新版本。

```bash
npm ci
npm run setup:env
npm run dev
```

打开 [首页](http://127.0.0.1:3000)。首次访问 [初始化页面](http://127.0.0.1:3000/admin/setup)，使用 `.env.local` 中的 `SETUP_TOKEN` 创建管理员，之后从 `/admin` 管理网站。初始提供三条演示入口，可在后台替换。

开发模式下，从 `localhost` 或 `127.0.0.1` 打开同一个本地端口时，页面会自动跳到 `.env.local` 配置的访问地址。

## Docker 部署

```bash
npm run setup:env
docker compose --env-file .env.local up -d --build
```

在 `.env.local` 中，`HOST_IP` 控制宿主机监听地址，默认 `127.0.0.1`。`PORT` 控制宿主机端口，默认 `3000`，容器内固定使用 `3000`。需要通过服务器 IP 直接访问时，可将 `HOST_IP` 设为 `0.0.0.0`。

通过域名部署时，将 `BETTER_AUTH_URL` 设为浏览器实际访问的完整 HTTPS 地址。反向代理与应用在同一台服务器上时，`HOST_IP` 可保留 `127.0.0.1`。其他配置见 [.env.example](.env.example)。

## 数据与备份

本地数据默认存放在 `data/`，Docker 使用 `nav-palace-data` 持久化卷。升级前用 `npm run db:backup` 生成数据库快照，另行备份同级 `uploads/` 目录，并妥善保管 `.env.local`。

后台 JSON 导出用于迁移网站与站点设置。完整迁移还需 SQLite 快照和上传目录。

## 开发与许可

项目使用 Next.js、TypeScript 和 SQLite。开发检查可运行 `npm run lint`、`npm test` 和 `npm run build`。实现细节见[架构文档](docs/architecture.md)。

项目代码采用 [Apache-2.0](LICENSE) 许可。字体、图标和素材来源见 [NOTICE.md](NOTICE.md)。
