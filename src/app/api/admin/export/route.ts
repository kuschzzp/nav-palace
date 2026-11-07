import { requireAdmin } from "@/lib/auth";
import { getAdminData } from "@/lib/db";
import { createExportConfig } from "@/lib/config-transfer";
import { apiErrorResponse } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    // 仅迁移网站和公开设置，图片地址、账号和访问凭据不会进入导出文件。
    const data = createExportConfig(getAdminData());
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="nav-palace-content.json"',
      },
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
