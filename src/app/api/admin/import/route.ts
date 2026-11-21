import { requireAdmin } from "@/lib/auth";
import { importConfig, importRequestSchema } from "@/lib/config-transfer";
import { apiErrorResponse, assertSameOrigin, readJson } from "@/lib/validation";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    // 导入文件允许到 2 MiB；实际读取流与声明长度均受限，其他写接口仍使用 64 KiB。
    const { config, preview } = importRequestSchema.parse(await readJson(request, 2 * 1024 * 1024));
    const summary = await importConfig(config, preview);
    return Response.json(preview ? summary : { ...summary, ok: true }, { headers });
  } catch (error) {
    const response = apiErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
