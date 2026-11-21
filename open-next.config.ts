import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({});
// 通过 Webpack 在打包前替换存储实现，避免原生模块进入 workerd。
config.buildCommand = "node scripts/cloudflare-build.mjs";

export default config;
