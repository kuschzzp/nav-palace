import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ImagesBinding, R2Bucket, ReadableStream as WorkerReadableStream } from "@cloudflare/workers-types";
import { ApiError } from "../validation";
import { MAX_UPLOAD_BYTES, MAX_IMAGE_PIXELS, UPLOAD_IMAGE_WIDTHS } from "../upload-input";

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES, MAX_IMAGE_PIXELS, UPLOAD_IMAGE_WIDTHS, readUploadForm } from "../upload-input";

type UploadBindings = { UPLOADS: R2Bucket; IMAGES: ImagesBinding };
const uploadFilename = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
const supportedFormats = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const objectMetadata = { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" };

function imageStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }) as WorkerReadableStream<Uint8Array>;
}

function objectKey(filename: string, width?: number) {
  return "uploads/" + (width === undefined ? filename : filename.replace(/\.webp$/, `-w${width}.webp`));
}

async function imageInfo(images: ImagesBinding, bytes: Uint8Array, legacy = false) {
  try {
    // 以实际解码结果为准，SVG 等非允许格式即使改了扩展名也不会保存。
    const info = await images.info(imageStream(bytes));
    if (!supportedFormats.has(info.format) || (legacy && info.format !== "image/webp")) {
      throw new ApiError(legacy ? 400 : 415, "请上传 JPG、PNG、WebP 或 AVIF 图片");
    }
    if (!("width" in info) || !Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height)
      || info.width <= 0 || info.height <= 0 || info.width * info.height > MAX_IMAGE_PIXELS) {
      throw new ApiError(legacy ? 400 : 413, "图片像素过大，请选择 2400 万像素以内的图片");
    }
    return info;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Images 9412 表示无法解码；服务配置、额度或网络异常交给统一的服务端错误处理。
    if (error && typeof error === "object" && "code" in error && Number(error.code) === 9412) {
      throw new ApiError(400, "图片无法读取，可能已损坏或格式不受支持");
    }
    throw error;
  }
}

async function encodeImage(images: ImagesBinding, bytes: Uint8Array, width: number, height?: number) {
  // scale-down 保留透明度与宽高比，不放大小图；统一去掉动画帧并编码 WebP。
  const result = await images.input(imageStream(bytes)).transform({ width, height, fit: "scale-down" })
    .output({ format: "image/webp", quality: height === undefined ? 76 : 80, anim: false });
  const response = result.response();
  if (!response.body) throw new Error("Images returned an empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "图片处理后仍然过大，请选择更小的图片");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("Images returned an empty image");
  return Buffer.concat(chunks, size);
}

/** 将同一套上传规则绑定到当前请求的 R2 和 Images，避免跨请求复用 Workers I/O 对象。 */
export function createUploadStorage({ UPLOADS: bucket, IMAGES: images }: UploadBindings) {
  return {
    async saveUploadedImage(input: Uint8Array) {
      if (!input.byteLength) throw new ApiError(400, "图片文件为空，请重新选择");
      if (input.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "单张图片不能超过 8MB");
      await imageInfo(images, input);
      const image = await encodeImage(images, input, 2400, 2400);
      const { width, height } = await imageInfo(images, image);
      const filename = `${randomUUID()}.webp`;
      const savedKeys: string[] = [];
      try {
        // 先存缩略图，最后发布原图；返回给前端的地址始终对应一套完整图片。
        for (const targetWidth of UPLOAD_IMAGE_WIDTHS) {
          const variant = await encodeImage(images, image, targetWidth);
          const key = objectKey(filename, targetWidth);
          savedKeys.push(key);
          await bucket.put(key, variant, { httpMetadata: objectMetadata });
        }
        const key = objectKey(filename);
        savedKeys.push(key);
        await bucket.put(key, image, { httpMetadata: objectMetadata });
      } catch (error) {
        // 失败的写请求也可能已落盘，因此清理所有尝试过的随机对象键。
        await bucket.delete(savedKeys).catch(() => {});
        throw error;
      }
      return { url: `/uploads/${filename}`, width, height };
    },

    async readUploadedImage(filename: string, width?: number) {
      if (!uploadFilename.test(filename)) throw new ApiError(404, "图片不存在或已移除");
      if (width !== undefined && !UPLOAD_IMAGE_WIDTHS.some((value) => value === width)) {
        throw new ApiError(400, "图片宽度仅支持 240、480 或 800");
      }
      const key = objectKey(filename, width);
      const existing = await bucket.get(key);
      if (existing) {
        if (existing.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "图片文件过大");
        return Buffer.from(await existing.arrayBuffer());
      }
      if (width === undefined) throw new ApiError(404, "图片不存在或已移除");
      // 迁移的旧图片可能没有缩略图，按需补齐并用条件写入保留并发请求的先完成版本。
      const original = await bucket.get(objectKey(filename));
      if (!original) throw new ApiError(404, "图片不存在或已移除");
      if (original.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "图片文件过大");
      const bytes = Buffer.from(await original.arrayBuffer());
      await imageInfo(images, bytes, true);
      const variant = await encodeImage(images, bytes, width);
      const saved = await bucket.put(key, variant, { httpMetadata: objectMetadata, onlyIf: { etagDoesNotMatch: "*" } });
      if (saved) return variant;
      const winner = await bucket.get(key);
      if (!winner) throw new ApiError(404, "图片不存在或已移除");
      if (winner.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "图片文件过大");
      return Buffer.from(await winner.arrayBuffer());
    },
  };
}

function uploadStorage() {
  const env = getCloudflareContext().env as unknown as Partial<UploadBindings>;
  if (!env.UPLOADS || !env.IMAGES) throw new ApiError(503, "请先配置 Cloudflare UPLOADS 和 IMAGES 绑定");
  return createUploadStorage({ UPLOADS: env.UPLOADS, IMAGES: env.IMAGES });
}

export async function saveUploadedImage(input: Uint8Array) {
  return uploadStorage().saveUploadedImage(input);
}

export async function readUploadedImage(filename: string, width?: number) {
  return uploadStorage().readUploadedImage(filename, width);
}
