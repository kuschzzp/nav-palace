import { requireAdmin } from "@/lib/auth";
import { createSite } from "@/lib/db";
import { apiErrorResponse, assertSameOrigin, readJson, siteInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    // 创建时在服务端补齐可选字段默认值，拒绝客户端传入未定义字段。
    const input = siteInputSchema.parse(await readJson(request));
    return Response.json(await createSite(input), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
