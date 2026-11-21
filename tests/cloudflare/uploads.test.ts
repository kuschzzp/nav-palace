import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { createUploadStorage, MAX_UPLOAD_BYTES } from "../../src/lib/cloudflare/uploads";
import { ApiError } from "../../src/lib/validation";

type Bindings = Parameters<typeof createUploadStorage>[0];

function testBindings(failWrite = 0) {
  const objects = new Map<string, Buffer>();
  let writes = 0;
  const bucket = {
    async put(key: string, value: Uint8Array, options?: { onlyIf?: { etagDoesNotMatch?: string } }) {
      if (options?.onlyIf?.etagDoesNotMatch === "*" && objects.has(key)) return null;
      objects.set(key, Buffer.from(value));
      if (++writes === failWrite) throw new Error("R2 write interrupted after storage");
      return { key };
    },
    async get(key: string) {
      const bytes = objects.get(key);
      return bytes ? { size: bytes.byteLength, async arrayBuffer() { return Uint8Array.from(bytes).buffer; } } : null;
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
  const images = {
    async info(stream: ReadableStream<Uint8Array>) {
      try {
        const bytes = await new Response(stream).arrayBuffer();
        const metadata = await sharp(bytes).metadata();
        if (metadata.format === "svg") return { format: "image/svg+xml" };
        return { format: `image/${metadata.format === "heif" ? "avif" : metadata.format}`, fileSize: bytes.byteLength, width: metadata.width, height: metadata.height };
      } catch {
        throw Object.assign(new Error("Invalid image"), { code: 9412 });
      }
    },
    input(stream: ReadableStream<Uint8Array>) {
      return {
        transform(options: { width: number; height?: number }) {
          return {
            async output(options2: { quality: number }) {
              const bytes = await new Response(stream).arrayBuffer();
              const image = await sharp(bytes).rotate().resize({ width: options.width, height: options.height, fit: "inside", withoutEnlargement: true })
                .webp({ quality: options2.quality }).toBuffer();
              return { response: () => new Response(new Uint8Array(image)) };
            },
          };
        },
      };
    },
  };
  return { objects, storage: createUploadStorage({ UPLOADS: bucket, IMAGES: images } as unknown as Bindings) };
}

// 这里使用真实图片编解码替身，单独覆盖 R2 的发布、失败清理和条件写入语义。
test("Cloudflare uploads publish normalized WebP and all thumbnails before returning the public URL", async () => {
  const { objects, storage } = testBindings();
  const source = await sharp({ create: { width: 3000, height: 1500, channels: 4, background: { r: 80, g: 150, b: 220, alpha: 0.4 } } }).png().toBuffer();
  const saved = await storage.saveUploadedImage(source);
  assert.equal(saved.width, 2400);
  assert.equal(saved.height, 1200);
  assert.match(saved.url, /^\/uploads\/[0-9a-f-]{36}\.webp$/);
  const filename = saved.url.split("/").at(-1)!;
  assert.equal(objects.size, 4);
  for (const width of [undefined, 240, 480, 800]) {
    const image = await sharp(await storage.readUploadedImage(filename, width)).metadata();
    assert.equal(image.format, "webp");
    assert.equal(image.width, width ?? 2400);
    assert.equal(image.hasAlpha, true);
  }
  assert.equal([...objects.keys()].at(-1), `uploads/${filename}`);
});

test("Cloudflare upload failures remove writes that may have committed before the request failed", async () => {
  const { objects, storage } = testBindings(2);
  const source = await sharp({ create: { width: 12, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(() => storage.saveUploadedImage(source), /R2 write interrupted/);
  assert.equal(objects.size, 0);
});

test("Cloudflare uploads reject invalid bytes, disguised SVG, oversize images and unsafe object names", async () => {
  const { objects, storage } = testBindings();
  await assert.rejects(() => storage.saveUploadedImage(Buffer.from("invalid image")), (error) => error instanceof ApiError && error.status === 400);
  await assert.rejects(() => storage.saveUploadedImage(new Uint8Array(MAX_UPLOAD_BYTES + 1)), (error) => error instanceof ApiError && error.status === 413);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
  await assert.rejects(() => storage.saveUploadedImage(svg), (error) => error instanceof ApiError && error.status === 415);
  const oversized = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(() => storage.saveUploadedImage(oversized), (error) => error instanceof ApiError && error.status === 413);
  assert.equal(objects.size, 0);
  for (const filename of ["../secret", "..%2Fsecret", "x.svg", "123.webp"]) {
    await assert.rejects(() => storage.readUploadedImage(filename), (error) => error instanceof ApiError && error.status === 404);
  }
});

test("Cloudflare legacy thumbnails use conditional writes and preserve the original under concurrent requests", async () => {
  const { objects, storage } = testBindings();
  const filename = "00000000-0000-4000-8000-000000000001.webp";
  const original = await sharp({ create: { width: 1000, height: 1500, channels: 4, background: { r: 80, g: 150, b: 220, alpha: 0.4 } } }).webp().toBuffer();
  objects.set(`uploads/${filename}`, original);
  const images = await Promise.all(Array.from({ length: 5 }, () => storage.readUploadedImage(filename, 480)));
  assert.equal(objects.size, 2);
  for (const bytes of images) assert.deepEqual(bytes, images[0]);
  assert.equal((await sharp(images[0]).metadata()).width, 480);
  assert.deepEqual(await storage.readUploadedImage(filename), original);
  await assert.rejects(() => storage.readUploadedImage(filename, 999), (error) => error instanceof ApiError && error.status === 400);
  await assert.rejects(() => storage.readUploadedImage(filename.replace(".webp", "-w480.webp")), (error) => error instanceof ApiError && error.status === 404);
});
