import { readUploadedImage, UPLOAD_IMAGE_WIDTHS } from "@/lib/uploads";
import { apiErrorResponse } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ filename: string }> };

async function imageResponse(request: Request, context: Context, head = false) {
  try {
    const { filename } = await context.params;
    // 公开读取仅接受服务端生成的文件名；内容统一为 WebP，随机地址不会被覆盖，可长期缓存。
    const widths = new URL(request.url).searchParams.getAll("w");
    if (widths.length > 1 || (widths.length === 1 && !UPLOAD_IMAGE_WIDTHS.some((width) => String(width) === widths[0]))) {
      return Response.json({ error: "图片宽度仅支持 240、480 或 800" }, { status: 400 });
    }
    const image = await readUploadedImage(filename, widths.length ? Number(widths[0]) : undefined);
    return new Response(head ? null : new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(image.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  return imageResponse(request, context);
}

// 与 GET 复用文件校验和响应头，仅省略响应正文。
export async function HEAD(request: Request, context: Context) {
  return imageResponse(request, context, true);
}
