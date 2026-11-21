# Cloudflare 部署

Cloudflare 版本通过 OpenNext 运行现有 Next.js 页面，使用 D1 保存站点、账号和会话，使用 R2 保存上传图片。Cloudflare Images 负责压缩、格式转换和缩略图。

## 准备

- 本机安装 Node.js 22.16 或更新版本。
- Cloudflare 账号启用 Workers Paid，并开通 R2 和 Images 的图片转换能力。登录与私密访问密码使用 scrypt，配置预留 30 秒 CPU，免费套餐的 10ms CPU 不适合此版本。
- 准备实际访问地址，可以使用自己的域名，也可以使用分配的 workers.dev 地址。

Workers、D1、R2 和 Images 分别按对应产品规则计费。Images 可使用免费方案，每月提供 5,000 次独立转换，超额时新转换返回 9422，免费方案不会自动产生超额费用；Images 付费方案包含同样的免费额度，超额每 1,000 次为 0.50 美元。[Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)、[Images 计费](https://developers.cloudflare.com/images/pricing/)

本项目每次上传会生成一张压缩主图和三张缩略图，按每张图片最多四次转换估算。处理结果保存在 R2，后续浏览直接读取这些文件；内置图片已在构建前压缩。旧上传文件缺少缩略图时，首次请求会补齐对应转换。

## 首次部署

在项目根目录安装依赖并登录 Cloudflare。

```bash
npm ci
npx wrangler login
```

创建数据库和图片存储桶。

```bash
npx wrangler d1 create nav-palace
npx wrangler r2 bucket create nav-palace-uploads
```

编辑根目录的 `wrangler.jsonc`。

- 将 `d1_databases[0].database_id` 替换为创建数据库时输出的实际 ID。
- 桶名与 `r2_buckets[0].bucket_name` 一致。修改 Worker 名称时，也要同步修改 `services[0].service`。
- 将 `vars.BETTER_AUTH_URL` 改为浏览器实际访问的完整 HTTPS 地址，包含使用的非标准端口，末尾无需斜杠。
- 自定义域名可在 Cloudflare 控制台该 Worker 的「设置 → 域和路由」中添加。

为认证密钥和初始化令牌分别生成一段随机值，妥善保存。第一条命令生成 `BETTER_AUTH_SECRET`，第二条生成 `SETUP_TOKEN`。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

通过交互式命令输入刚生成的值。

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put SETUP_TOKEN
```

首次写入密钥时，如果 Wrangler 提示 Worker 尚不存在并询问是否创建，确认创建即可。密钥通过这两条命令保存到 Cloudflare，`.dev.vars` 用于本地预览。

执行迁移和部署。

```bash
npm run cf:migrate
npm run cf:deploy
```

`cf:deploy` 会先构建当前代码再发布。首次数据库迁移会创建表和三条演示入口，Wrangler 会记录已执行的迁移，后续执行会应用新增迁移。

检查发布命令输出的访问地址。使用 workers.dev 时，地址通常为 `https://nav-palace.你的账号子域.workers.dev`。如果实际地址与 `BETTER_AUTH_URL` 不一致，先修改配置并再次执行 `npm run cf:deploy`，再进行管理员初始化。

访问实际域名下的 `/admin/setup`，使用自己保存的 `SETUP_TOKEN` 创建唯一管理员。之后从 `/admin` 登录、配置站点和图片。域名变化后，同步修改 `BETTER_AUTH_URL` 并重新部署。

## 本地 Cloudflare 预览

复制本地密钥示例。

```bash
cp .dev.vars.example .dev.vars
```

在 `.dev.vars` 填入独立生成的 `BETTER_AUTH_SECRET` 和 `SETUP_TOKEN`，保留 `BETTER_AUTH_URL=http://127.0.0.1:8787`。然后初始化本地 D1 并启动。

```bash
npm run cf:migrate:local
npm run cf:preview
```

打开 [本地 Cloudflare 首页](http://127.0.0.1:8787)。这里使用 workerd 和本地 D1、R2 状态，数据放在被 Git 忽略的 `.wrangler/` 中。结束时按 `Ctrl+C`。Images 本地模拟支持的转换能力以 Wrangler 为准，生产环境由真实 Images 服务处理。

日常 SQLite 开发仍通过 `npm run dev` 启动。Cloudflare 的本地密钥放在 `.dev.vars`，Node 的本地配置放在 `.env.local`。

## 更新与迁移

更新代码后执行同样的迁移与发布命令。

```bash
npm run cf:migrate
npm run cf:deploy
```

从已有 Node 或 Docker 站点迁移内容时，先在原后台导出 JSON，再到新部署创建管理员并导入配置。导入会恢复网站与站点文案，封面和 Logo 可以重新选择或上传，私密访问密码在新后台单独设置。

整库搬迁需要单独导出 SQLite 数据、导入对应 D1 表，并将原上传目录中的图片及缩略图存入 R2 的 `uploads/` 前缀，保留原文件名。管理员和私密访问的旧 scrypt 哈希与 Cloudflare 实现兼容。当前后台 JSON 导出只包含内容，不包含账号、密码哈希和上传文件。

## 备份与检查

D1 可以使用 Time Travel 恢复，也可以导出 SQL。

```bash
npx wrangler d1 export DB --remote --output nav-palace-d1.sql
```

上传图片单独备份 R2 桶。认证密钥通过 Cloudflare secrets 管理，恢复已有会话时需要使用对应的密钥。

部署前按顺序运行本地和 Cloudflare 两组检查，最后执行发布预检。

```bash
npm run lint
npm run typecheck
npm test
npm run test:cloudflare
npx wrangler deploy --dry-run
```

`test:cloudflare` 构建 Worker，并以隔离测试数据检查 D1 事务、并发初始化、并发登录、网站增删改、私密访问、配置导入导出及图片上传。测试结束后关闭临时服务并清理测试目录。`--dry-run` 检查最终打包产物与绑定配置，实际发布使用 `npm run cf:deploy`。

代码已通过 Node 与 Cloudflare 构建及本地 workerd 接口验证。正式账号的资源权限、自定义域名和线上 Images 转换需在部署后确认。可依次检查首页、创建管理员、登录后台、添加网站、上传封面和解锁私密站点。
