import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defaultSettings, replaceConfig } from "./db";
import { coverPresets } from "./media-presets";
import { normalizeLegacyAtmosphere } from "./ambient-presets";
import { ApiError, settingsSchema, siteInputSchema } from "./validation";
import type { PortalData, Site } from "./types";

export type ImportSummary = {
  siteCount: number;
  publicCount: number;
  privateCount: number;
  categories: string[];
  warnings: string[];
};

const exportSettingsSchema = settingsSchema.omit({ logoUrl: true }).strip();
const exportSiteSchema = siteInputSchema.omit({ image: true }).extend({ id: z.string() }).strip();

// 导出白名单不包含管理员信息、访问密码或任何图片地址；图片由目标环境重新选择。
export function createExportConfig(data: PortalData) {
  const settings = exportSettingsSchema.parse(data.settings);
  return {
    version: 2 as const,
    exportedAt: new Date().toISOString(),
    settings,
    sites: data.sites.map((site) => exportSiteSchema.parse(site)),
  };
}

const recordSchema = z.record(z.string(), z.unknown());
const configSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string().max(80).optional(),
  settings: recordSchema,
  sites: z.array(recordSchema).max(1000, "最多只能导入 1000 个网站"),
  // v1 导出曾包含这个状态；兼容读取，但绝不改变当前站点的访问密码。
  accessConfigured: z.boolean().optional(),
});
const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/, "网站 ID 只能包含字母、数字、短横线或下划线，且最多 100 字符");

// 常见用途优先匹配相应内置封面，其余按顺序分配，导入不依赖原站图片服务。
const iconCovers: Record<string, string> = {
  leaf: "/images/ink/writing.webp",
  bulb: "/images/ink/tools.webp",
  camera: "/images/ink/landscape.webp",
  article: "/images/ink/writing.webp",
  mail: "/images/ink/mail.webp",
  book: "/images/ink/knowledge.webp",
  notebook: "/images/ink/knowledge.webp",
  monitor: "/images/ink/tools.webp",
  toolbox: "/images/ink/tools.webp",
};

export function validateImportConfig(input: unknown): PortalData & { summary: ImportSummary } {
  const config = configSchema.parse(input);
  const importedSettings = { ...config.settings };
  // 历史字段仅在迁移入口兼容；普通设置保存接口仍拒绝这些已移除的字段。
  const style = normalizeLegacyAtmosphere(importedSettings.atmosphereStyle, importedSettings.petalsEnabled);
  if (style !== undefined) importedSettings.atmosphereStyle = style;
  for (const key of ["heroImage", "cursorStyle", "petalsEnabled", "musicEnabled", "musicTitle", "musicUrl", "companionEnabled"]) delete importedSettings[key];
  const settings = settingsSchema.parse({
    ...defaultSettings,
    ...importedSettings,
    logoUrl: "",
  });
  const ids = new Set<string>();
  const sites: Site[] = config.sites.map((record, index) => {
    const fields = { ...record };
    const importedId = fields.id;
    for (const key of ["id", "image", "newTab"]) delete fields[key];
    const id = importedId === undefined ? randomUUID() : idSchema.parse(importedId);
    if (ids.has(id)) throw new ApiError(400, "导入文件中的网站 ID 不能重复");
    ids.add(id);
    const site = siteInputSchema.parse(fields);
    return { ...site, id, image: iconCovers[site.icon] || coverPresets[index % coverPresets.length].image };
  });
  const privateCount = sites.filter((site) => site.requiresPassword).length;
  const warnings = [
    "导入将替换全部网站与站点设置，管理员账号和私密访问密码保持不变。",
    "导出文件不迁移图片；网站封面和站点标志将恢复内置默认。",
  ];
  if (privateCount) warnings.push("私密网站继续使用当前站点的访问密码；尚未配置密码时，请在导入后设置。");
  return {
    settings,
    sites,
    summary: {
      siteCount: sites.length,
      publicCount: sites.length - privateCount,
      privateCount,
      categories: [...new Set(sites.map((site) => site.category).filter(Boolean))],
      warnings,
    },
  };
}

export async function importConfig(input: unknown, preview: boolean): Promise<ImportSummary> {
  // 确认导入时重新完整校验，预览结果不是写入凭据，也不在服务器保存待导入状态。
  const { settings, sites, summary } = validateImportConfig(input);
  if (preview) return summary;
  // 由当前数据库驱动原子替换，SQLite 与 D1 都不能留下部分导入的内容。
  await replaceConfig(settings, sites);
  return summary;
}

export const importRequestSchema = z.object({
  config: z.unknown().refine((value) => value !== undefined, "请选择配置文件"),
  preview: z.boolean(),
}).strict();
