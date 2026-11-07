import { requireAdmin } from "@/lib/auth";
import { getAdminData } from "@/lib/db";
import { apiErrorResponse } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    // 后台需要包含隐藏项的完整数据，禁止缓存以便每次操作后读取最新状态。
    return Response.json(getAdminData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
