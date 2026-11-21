import { ApiError } from "./validation";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
// 请求额外预留 multipart 边界和字段头开销；图片本身仍受 8MB 限制。
export const MAX_UPLOAD_REQUEST_BYTES = 9 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const UPLOAD_IMAGE_WIDTHS = [240, 480, 800] as const;

export async function readUploadForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ApiError(415, "请通过图片上传按钮选择文件");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_UPLOAD_REQUEST_BYTES) throw new ApiError(413, "上传内容过大，单张图片不能超过 8MB");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "请选择需要上传的图片");
  // 读取实际请求流并累计限制，避免绕过 Content-Length 检查后占满内存。
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_REQUEST_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "上传内容过大，单张图片不能超过 8MB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ApiError(400, "图片上传内容无效，请重新选择图片");
  }
}
