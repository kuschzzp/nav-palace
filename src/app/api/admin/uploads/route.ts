import { requireAdmin } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, readUploadForm, saveUploadedImage } from "@/lib/uploads";
import { ApiError, apiErrorResponse, assertSameOrigin } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    // 先验证来源与管理员身份，再读取受限请求流，避免匿名请求触发图片解码和磁盘写入。
    const form = await readUploadForm(request);
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) throw new ApiError(400, "请一次选择一张图片");
    const file = files[0];
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "单张图片不能超过 8MB");
    const image = await saveUploadedImage(new Uint8Array(await file.arrayBuffer()));
    return Response.json(image, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
