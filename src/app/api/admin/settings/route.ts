import { requireAdmin } from "@/lib/auth";
import { updateSettings } from "@/lib/db";
import { apiErrorResponse, assertSameOrigin, readJson, settingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    // 设置按完整对象保存，统一校验字段范围和图片地址后再写入单行配置。
    const input = settingsSchema.parse(await readJson(request));
    return Response.json(await updateSettings(input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
