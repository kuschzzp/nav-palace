import { requireAdmin } from "@/lib/auth";
import { deleteSite, updateSite } from "@/lib/db";
import { apiErrorResponse, assertSameOrigin, readJson, sitePatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    // PATCH 只更新本次提交的字段，适用于编辑表单和列表中的快捷显示开关。
    const input = sitePatchSchema.parse(await readJson(request));
    return Response.json(await updateSite(id, input));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    await deleteSite(id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
