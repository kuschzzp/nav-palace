import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { ApiError } from "./validation";

import { MAX_UPLOAD_BYTES, MAX_IMAGE_PIXELS, UPLOAD_IMAGE_WIDTHS } from "./upload-input";
export { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES, MAX_IMAGE_PIXELS, UPLOAD_IMAGE_WIDTHS, readUploadForm } from "./upload-input";

const pendingVariants = new Map<string, Promise<Buffer>>();
const supportedFormats = new Set(["jpeg", "png", "webp", "avif", "heif"]);
const uploadFilename = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

export function getUploadsDirectory() {
  const databasePath = process.env.DATABASE_PATH || "./data/nav-palace.db";
  // 上传文件跟随数据库所在目录持久化；保留 turbopackIgnore，禁止构建追踪运行数据。
  const databaseDirectory = databasePath === ":memory:"
    ? resolve("data")
    : dirname(resolve(/* turbopackIgnore: true */ databasePath));
  return join(/* turbopackIgnore: true */ databaseDirectory, "uploads");
}

export async function saveUploadedImage(input: Uint8Array) {
  if (!input.byteLength) throw new ApiError(400, "图片文件为空，请重新选择");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "单张图片不能超过 8MB");

  let image: Buffer;
  let width: number;
  let height: number;
  try {
    const source = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" });
    // 以真实解码格式为准，不信任浏览器提供的 MIME 或文件后缀。
    const metadata = await source.metadata();
    if (!metadata.format || !supportedFormats.has(metadata.format)
      || (metadata.format === "heif" && metadata.compression !== "av1")) {
      throw new ApiError(415, "请上传 JPG、PNG、WebP 或 AVIF 图片");
    }
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ApiError(413, "图片像素过大，请选择 2400 万像素以内的图片");
    }
    // 自动纠正方向、限制最长边并统一编码 WebP，保留透明通道并去掉原图元数据。
    const result = await source.rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    image = result.data;
    width = result.info.width;
    height = result.info.height;
    if (image.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "图片处理后仍然过大，请选择更小的图片");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "图片无法读取，可能已损坏、格式不受支持或超过 2400 万像素");
  }

  const directory = getUploadsDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // 不使用原文件名，避免名称冲突及路径注入；独占创建防止意外覆盖已有图片。
  const filename = `${randomUUID()}.webp`;
  const path = join(/* turbopackIgnore: true */ directory, filename);
  const file = await open(path, "wx", 0o600);
  let saved = false;
  try {
    await file.writeFile(image);
    saved = true;
  } finally {
    await file.close();
    // 写入失败时移除残缺文件，避免之后被当成有效公开图片读取。
    if (!saved) await unlink(path).catch(() => {});
  }
  try {
    // 上传完成前准备卡片所需尺寸，原图 URL 和返回字段保持兼容。
    for (const targetWidth of UPLOAD_IMAGE_WIDTHS) await readUploadedImage(filename, targetWidth);
  } catch (error) {
    await Promise.all([filename, ...UPLOAD_IMAGE_WIDTHS.map((value) => variantFilename(filename, value))]
      .map((name) => unlink(join(/* turbopackIgnore: true */ directory, name)).catch(() => {})));
    throw error;
  }
  return { url: `/uploads/${filename}`, width, height };
}

function variantFilename(filename: string, width: number) {
  return filename.replace(/\.webp$/, `-w${width}.webp`);
}

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

async function createVariant(originalPath: string, targetPath: string, width: number) {
  const original = await readFile(originalPath);
  if (original.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "图片文件过大");
  let image: Buffer;
  try {
    const source = sharp(original, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "error" });
    const metadata = await source.metadata();
    // 旧图同样只处理本模块生成的 WebP，并保留解码像素上限。
    if (metadata.format !== "webp" || !metadata.width || !metadata.height
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new Error("Invalid uploaded WebP");
    image = await source.resize({ width, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
  } catch {
    throw new ApiError(400, "图片无法读取，可能已损坏、格式不受支持或超过 2400 万像素");
  }
  // 先写私有临时文件，再用独占硬链接原子发布；多进程竞争也不会暴露半张图或覆盖旧图。
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporaryPath, "wx", 0o600);
    try { await file.writeFile(image); } finally { await file.close(); }
    try { await link(temporaryPath, targetPath); } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
  return readFile(targetPath);
}

export async function readUploadedImage(filename: string, width?: number) {
  // 只读取本模块生成的 UUID 文件名，不允许访问上传目录以外的内容。
  if (!uploadFilename.test(filename)) throw new ApiError(404, "图片不存在或已移除");
  if (width !== undefined && !UPLOAD_IMAGE_WIDTHS.some((value) => value === width)) {
    throw new ApiError(400, "图片宽度仅支持 240、480 或 800");
  }
  const directory = getUploadsDirectory();
  const path = join(/* turbopackIgnore: true */ directory, filename);
  try {
    if (width === undefined) return await readFile(path);
    const targetPath = join(/* turbopackIgnore: true */ directory, variantFilename(filename, width));
    try { return await readFile(targetPath); } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    const pending = pendingVariants.get(targetPath);
    if (pending) return await pending;
    const generation = createVariant(path, targetPath, width);
    pendingVariants.set(targetPath, generation);
    try { return await generation; } finally { pendingVariants.delete(targetPath); }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && ["ENOENT", "ENOTDIR"].includes(String(error.code))) {
      throw new ApiError(404, "图片不存在或已移除");
    }
    throw error;
  }
}
