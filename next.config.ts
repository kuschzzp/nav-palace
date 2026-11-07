import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生成可独立运行的生产目录，供 Docker 和启动脚本使用。
  output: "standalone",
  // SQLite 使用原生扩展，保留 Node.js 的模块加载方式。
  serverExternalPackages: ["better-sqlite3"],
  // 运行数据、密钥和开发资料不应进入自动追踪的服务端产物。
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./backups/**/*", "./.env*", "./docs/**/*", "./tests/**/*", "./public/images/*.png"],
  },
  poweredByHeader: false,
  async redirects() {
    if (process.env.NODE_ENV !== "development") return [];

    const origin = URL.parse(process.env.BETTER_AUTH_URL ?? "");
    if (!origin || (origin.protocol !== "http:" && origin.protocol !== "https:")) return [];
    if (origin.hostname !== "127.0.0.1" && origin.hostname !== "localhost") return [];

    // 本地页面统一使用配置的来源。只匹配另一个本机地址的同一端口，API 仍独立校验来源。
    const alias = origin.hostname === "localhost" ? "127[.]0[.]0[.]1" : "localhost";
    const host = origin.port ? `${alias}:${origin.port}` : alias;
    return ["/", "/admin/:path*", "/go/:path*"].map((source) => ({
      source,
      destination: `${origin.origin}${source}`,
      permanent: false,
      has: [{ type: "header" as const, key: "host", value: host }],
    }));
  },
  // 对所有路由统一设置基础安全响应头，限制类型嗅探、页面嵌入和来源泄露。
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }, {
      // 只有带内容哈希的派生资源使用不可变缓存，更新素材会获得新地址。
      source: "/images/optimized/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }, {
      source: "/fonts/calligraphy/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }];
  },
};

export default nextConfig;
