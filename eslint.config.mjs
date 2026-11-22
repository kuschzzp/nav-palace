import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// 复用 Next.js 的性能与 TypeScript 规则，构建产物和运行数据不参与检查。
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "data/**", "node_modules/**", "next-env.d.ts"]),
]);
