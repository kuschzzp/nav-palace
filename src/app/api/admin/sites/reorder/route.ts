import { requireAdmin } from "@/lib/auth";
import { reorderSites } from "@/lib/db";
import { apiErrorResponse, assertSameOrigin, readJson, reorderSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { ids } = reorderSchema.parse(await readJson(request));
    // 完整站点集合校验与顺序写入在数据库事务中完成，失败时不会留下部分新顺序。
    reorderSites(ids);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
