import type { D1Database, R2Bucket, ImagesBinding, Fetcher } from "@cloudflare/workers-types";

// 仅声明绑定类型，数据库 ID、桶名和密钥分别由 Wrangler 和 secrets 提供。
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    UPLOADS: R2Bucket;
    IMAGES: ImagesBinding;
    ASSETS: Fetcher;
    WORKER_SELF_REFERENCE: Fetcher;
    BETTER_AUTH_URL: string;
    BETTER_AUTH_SECRET: string;
    SETUP_TOKEN: string;
  }
}
