import { z } from "zod";
import { siteIconNames } from "./site-icons";
import { ambientIntensityNames, ambientStyleNames } from "./ambient-presets";
import { pointerStyleNames } from "./pointer-presets";
import { departureCountdown } from "./departure-settings";
import { getRequestOrigin } from "./request-origin";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// 跳转仅接受明确的 HTTP(S) 地址，拒绝控制字符及 URL 内嵌账号密码。
function isWebUrl(value: string) {
  try {
    if (!/^https?:\/\//i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return false;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const webUrlSchema = z.string().trim().min(1, "请填写网站地址").max(2048)
  .refine(isWebUrl, "网站地址必须是有效的 http 或 https 链接，且不能包含账号密码");

// 本站图片限定在两个公开目录内，禁止目录穿越和协议相对路径。
export const imageUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (isWebUrl(value)) return true;
  return /^\/(?:images|uploads)\/[a-zA-Z0-9_./-]+$/.test(value)
    && !value.split("/").includes("..")
    && !value.includes("//");
}, "图片地址须为 http/https 链接或本站 images、uploads 路径");

export const siteInputSchema = z.object({
  name: z.string().trim().min(1, "请填写网站名称").max(80, "网站名称最多 80 字"),
  url: webUrlSchema,
  description: z.string().trim().max(300).default(""),
  image: imageUrlSchema.default(""),
  icon: z.enum(siteIconNames).default("globe"),
  category: z.string().trim().max(40).default(""),
  sortOrder: z.number().int().min(0).max(1000000).default(0),
  visible: z.boolean().default(true),
  requiresPassword: z.boolean().default(false),
}).strict();

// 局部更新移除创建时的默认值，避免只改名称却重置图标、显示状态等其它字段。
export const sitePatchSchema = z.object({
  name: siteInputSchema.shape.name.optional(),
  url: siteInputSchema.shape.url.optional(),
  description: siteInputSchema.shape.description.removeDefault().optional(),
  image: siteInputSchema.shape.image.removeDefault().optional(),
  icon: siteInputSchema.shape.icon.removeDefault().optional(),
  category: siteInputSchema.shape.category.removeDefault().optional(),
  sortOrder: siteInputSchema.shape.sortOrder.removeDefault().optional(),
  visible: siteInputSchema.shape.visible.removeDefault().optional(),
  requiresPassword: siteInputSchema.shape.requiresPassword.removeDefault().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0, "请提供需要修改的内容",
);

export const departureDelaySchema = z.number().int()
  .min(departureCountdown.minSeconds)
  .max(departureCountdown.maxSeconds)
  .default(departureCountdown.defaultSeconds);

export const settingsSchema = z.object({
  name: z.string().trim().min(1, "请填写站点名称").max(80),
  headline: z.string().trim().min(1, "请填写首页标题").max(120),
  subtitle: z.string().trim().max(300),
  footer: z.string().trim().max(300),
  logoUrl: imageUrlSchema,
  aboutTitle: z.string().trim().max(80),
  aboutText: z.string().trim().max(3000),
  // 装饰项使用有限预设，不能注入任意 CSS 或脚本。
  atmosphereStyle: z.enum(ambientStyleNames).default("none"),
  atmosphereIntensity: z.enum(ambientIntensityNames).default("balanced"),
  pointerStyle: z.enum(pointerStyleNames).default("system"),
  pointerScatter: z.boolean().default(true),
  departureDelaySeconds: departureDelaySchema,
}).strict();

export const setupSchema = z.object({
  name: z.string().trim().min(1, "请填写管理员名称").max(80),
  email: z.string().trim().toLowerCase().email("请填写有效邮箱").max(254),
  password: z.string().min(12, "密码至少需要 12 位").max(128, "密码最多 128 位"),
  token: z.string().min(1, "请填写初始化令牌").max(512),
}).strict();

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).max(10000),
}).strict();

// 写接口除校验登录态外，还校验浏览器来源，防止跨站借用管理员 Cookie 提交操作。
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = getRequestOrigin(request);
  // 允许多个入口，但写请求仍必须来自当前入口，不能在两个已允许地址间跨站提交。
  if (!expected || origin !== expected) {
    throw new ApiError(403, "请求来源无效，请从本站页面操作");
  }
}

export async function readJson(request: Request, maximumBytes = 65536): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "请使用 JSON 格式提交");
  }
  // 同时检查声明大小与实际流大小，不能信任可能缺失或伪造的 Content-Length。
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > maximumBytes) throw new ApiError(413, "提交内容过大");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "请提交 JSON 内容");
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new ApiError(413, "提交内容过大");
      }
      // 分块可能截断一个中文字符，流式解码会保留尚未接收完整的字节。
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ApiError(400, "提交的 JSON 格式不正确");
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.issues[0]?.message || "请检查填写内容" }, { status: 400 });
  }
  // 未知异常仅在服务端记录，响应不暴露数据库、路径或内部堆栈信息。
  console.error("Nav Palace API request failed:", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "操作暂时失败，请稍后重试" }, { status: 500 });
}
